/** DSH 的编号类型在运行时就是普通字符串。 */
const brandString = s => s;
import { createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';
export class BridgeRequestError extends Error {
    name = 'BridgeRequestError';
}
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
function blocksOf(content) {
    if (typeof content === 'string') return content === '' ? [] : [
        {
            type: 'text',
            text: content
        }
    ];
    if (!Array.isArray(content)) return [];
    return content.flatMap((item)=>{
        const block = record(item);
        return block === undefined ? [] : [
            block
        ];
    });
}
async function plainContent(blocks, saveImage) {
    const out = [];
    for (const block of blocks){
        if (block.type === 'text' && typeof block.text === 'string') out.push({
            type: 'text',
            text: block.text
        });
        if (block.type !== 'image') continue;
        const source = record(block.source);
        if (source?.type !== 'base64' || typeof source.data !== 'string' || typeof source.media_type !== 'string') continue;
        const image = await saveImage(Buffer.from(source.data, 'base64'), source.media_type);
        out.push(image ?? {
            type: 'text',
            text: '［这里有一张图片，当前环境无法把它交给模型］'
        });
    }
    return out;
}
function systemText(system) {
    if (typeof system === 'string') return system;
    return blocksOf(system).flatMap((block)=>typeof block.text === 'string' ? [
            block.text
        ] : []).join('\n\n');
}
export function splitRoute(route) {
    const slash = route.indexOf('/');
    return slash <= 0 || slash === route.length - 1 ? undefined : {
        provider: route.slice(0, slash),
        model: route.slice(slash + 1)
    };
}
export async function bridgeRequest(body, saveImage, defaultRoute) {
    const named = typeof body.model === 'string' && body.model !== '' && body.model !== 'dsh' ? body.model : undefined;
    const route = named ?? defaultRoute;
    if (route === undefined) throw new BridgeRequestError('客户端还没有选默认模型');
    const target = splitRoute(route);
    if (target === undefined) throw new BridgeRequestError(`模型要写成「服务商/模型」：${route}`);
    if (!Array.isArray(body.messages)) throw new BridgeRequestError('messages 必须是数组');
    const messages = [];
    for (const entry of body.messages){
        const turn = record(entry);
        const blocks = blocksOf(turn?.content);
        if (turn?.role === 'user') {
            for (const block of blocks.filter((item)=>item.type === 'tool_result')){
                if (typeof block.tool_use_id !== 'string') throw new BridgeRequestError('tool_result 缺少 tool_use_id');
                messages.push(createToolResultMessage({
                    callId: brandString(block.tool_use_id),
                    content: await plainContent(blocksOf(block.content), saveImage),
                    isError: block.is_error === true
                }));
            }
            const content = await plainContent(blocks.filter((item)=>item.type !== 'tool_result'), saveImage);
            if (content.length > 0) messages.push({
                role: 'user',
                content
            });
            continue;
        }
        if (turn?.role !== 'assistant') throw new BridgeRequestError(`不认识的角色：${String(turn?.role)}`);
        const content = [];
        for (const block of blocks){
            if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') content.push({
                type: 'text',
                text: block.text
            });
            if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
                content.push({
                    type: 'tool-call',
                    id: brandString(block.id),
                    name: block.name,
                    arguments: JSON.stringify(block.input ?? {})
                });
            }
        }
        if (content.length > 0) messages.push(createAssistantMessage({
            content,
            source: target
        }));
    }
    const tools = (Array.isArray(body.tools) ? body.tools : []).flatMap((item)=>{
        const tool = record(item);
        if (tool === undefined || typeof tool.name !== 'string' || tool.type !== undefined && tool.type !== 'custom') return [];
        return [
            {
                name: tool.name,
                description: typeof tool.description === 'string' ? tool.description : '',
                parameters: record(tool.input_schema) ?? {
                    type: 'object'
                }
            }
        ];
    });
    return {
        route,
        ...target,
        system: systemText(body.system),
        messages,
        tools,
        maxTokens: typeof body.max_tokens === 'number' && body.max_tokens > 0 ? body.max_tokens : undefined,
        stream: body.stream === true
    };
}
export class MessagesStreamWriter {
    id;
    model;
    emit;
    blocks = [];
    indexes = new Map();
    pendingTools = new Set();
    inputTokens = 0;
    outputTokens = 0;
    stopReason = 'end_turn';
    constructor(id, model, emit){
        this.id = id;
        this.model = model;
        this.emit = emit;
    }
    start() {
        this.emit({
            type: 'message_start',
            message: {
                ...this.message(),
                content: [],
                stop_reason: null
            }
        });
    }
    message() {
        return {
            id: this.id,
            type: 'message',
            role: 'assistant',
            model: this.model,
            stop_sequence: null,
            usage: {
                input_tokens: this.inputTokens,
                output_tokens: this.outputTokens
            }
        };
    }
    open(index, block) {
        const target = this.blocks.length;
        this.blocks.push(block);
        this.indexes.set(index, target);
        const announced = block.type === 'tool_use' ? {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: {}
        } : block.type === 'text' ? {
            type: 'text',
            text: ''
        } : {
            type: 'thinking',
            thinking: '',
            signature: ''
        };
        this.emit({
            type: 'content_block_start',
            index: target,
            content_block: announced
        });
    }
    push(chunk) {
        switch(chunk.type){
            case 'block-start':
                if (chunk.blockType === 'text') this.open(chunk.index, {
                    type: 'text',
                    text: ''
                });
                else if (chunk.blockType === 'reasoning') this.open(chunk.index, {
                    type: 'thinking',
                    thinking: '',
                    signature: ''
                });
                else if (chunk.blockType === 'tool-call') this.pendingTools.add(chunk.index);
                return;
            case 'text-delta':
                {
                    const target = this.indexes.get(chunk.index);
                    const block = target === undefined ? undefined : this.blocks[target];
                    if (target === undefined || block?.type !== 'text') return;
                    block.text += chunk.text;
                    this.emit({
                        type: 'content_block_delta',
                        index: target,
                        delta: {
                            type: 'text_delta',
                            text: chunk.text
                        }
                    });
                    return;
                }
            case 'reasoning-delta':
                {
                    const target = this.indexes.get(chunk.index);
                    const block = target === undefined ? undefined : this.blocks[target];
                    if (target === undefined || block?.type !== 'thinking') return;
                    block.thinking += chunk.text;
                    this.emit({
                        type: 'content_block_delta',
                        index: target,
                        delta: {
                            type: 'thinking_delta',
                            thinking: chunk.text
                        }
                    });
                    return;
                }
            case 'tool-call-delta':
                {
                    if (this.pendingTools.delete(chunk.index)) this.open(chunk.index, {
                        type: 'tool_use',
                        id: chunk.id,
                        name: chunk.name ?? '',
                        input: {},
                        json: ''
                    });
                    const target = this.indexes.get(chunk.index);
                    const block = target === undefined ? undefined : this.blocks[target];
                    if (target === undefined || block?.type !== 'tool_use' || chunk.argumentsDelta === '') return;
                    block.json += chunk.argumentsDelta;
                    this.emit({
                        type: 'content_block_delta',
                        index: target,
                        delta: {
                            type: 'input_json_delta',
                            partial_json: chunk.argumentsDelta
                        }
                    });
                    return;
                }
            case 'block-end':
                this.end(chunk.index, chunk.block);
                return;
            case 'usage':
                this.inputTokens = chunk.usage.inputTokens;
                this.outputTokens = chunk.usage.outputTokens;
                return;
            case 'finish':
                this.finish(chunk);
                return;
            default:
                return;
        }
    }
    end(index, block) {
        if (block.type === 'tool-call' && this.pendingTools.delete(index)) {
            this.open(index, {
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: {},
                json: ''
            });
            const target = this.indexes.get(index) ?? 0;
            const tool = this.blocks[target];
            if (tool?.type === 'tool_use' && block.arguments !== '') {
                tool.json = block.arguments;
                this.emit({
                    type: 'content_block_delta',
                    index: target,
                    delta: {
                        type: 'input_json_delta',
                        partial_json: block.arguments
                    }
                });
            }
        }
        const target = this.indexes.get(index);
        if (target === undefined) return;
        const finished = this.blocks[target];
        if (finished?.type === 'tool_use') {
            if (block.type === 'tool-call') finished.json = block.arguments;
            try {
                finished.input = finished.json === '' ? {} : JSON.parse(finished.json);
            } catch (_malformed) {
                finished.input = finished.json;
            }
        }
        this.emit({
            type: 'content_block_stop',
            index: target
        });
        this.indexes.delete(index);
    }
    finish(chunk) {
        switch(chunk.reason.kind){
            case 'error':
            case 'aborted':
                throw new Error(chunk.reason.failure.message);
            case 'tool-calls':
                this.stopReason = 'tool_use';
                break;
            case 'max-tokens':
                this.stopReason = 'max_tokens';
                break;
            default:
                this.stopReason = 'end_turn';
        }
        this.emit({
            type: 'message_delta',
            delta: {
                stop_reason: this.stopReason,
                stop_sequence: null
            },
            usage: {
                output_tokens: this.outputTokens
            }
        });
        this.emit({
            type: 'message_stop'
        });
    }
    final() {
        return {
            ...this.message(),
            stop_reason: this.stopReason,
            content: this.blocks.map((block)=>block.type === 'tool_use' ? {
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input
                } : block)
        };
    }
}
