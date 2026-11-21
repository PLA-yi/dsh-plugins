import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { BridgeRequestError, bridgeRequest, MessagesStreamWriter } from './bridge.js';
export { splitRoute } from './bridge.js';
const MAX_BODY_BYTES = 64 * 1024 * 1024;
async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request){
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        size += buffer.length;
        if (size > MAX_BODY_BYTES) throw new BridgeRequestError('请求太大');
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}
function sendJson(response, status, body) {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
    });
    response.end(JSON.stringify(body));
}
function apiError(response, status, type, message) {
    sendJson(response, status, {
        type: 'error',
        error: {
            type,
            message
        }
    });
}
function parseObject(raw) {
    const parsed = JSON.parse(raw.toString('utf8') || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BridgeRequestError('请求体不是 JSON 对象');
    return parsed;
}
export class StudioGateway {
    options;
    key = randomBytes(24).toString('hex');
    server;
    listening;
    inflight = new Set();
    constructor(options){
        this.options = options;
    }
    async start() {
        this.listening ??= new Promise((resolve, reject)=>{
            const server = createServer((request, response)=>{
                void this.handle(request, response);
            });
            this.server = server;
            server.once('error', reject);
            server.listen(0, '127.0.0.1', ()=>{
                resolve(`http://127.0.0.1:${String(server.address().port)}`);
            });
        });
        return await this.listening;
    }
    stop() {
        for (const controller of this.inflight)controller.abort();
        this.inflight.clear();
        this.server?.close();
        this.server?.closeAllConnections();
        this.server = undefined;
        this.listening = undefined;
    }
    authorized(request) {
        const header = request.headers['x-api-key'] ?? request.headers.authorization?.replace(/^Bearer\s+/i, '');
        const given = Buffer.from(typeof header === 'string' ? header : '');
        const expected = Buffer.from(this.key);
        return given.length === expected.length && timingSafeEqual(given, expected);
    }
    async handle(request, response) {
        const controller = new AbortController();
        this.inflight.add(controller);
        response.on('close', ()=>{
            if (!response.writableEnded) controller.abort();
        });
        try {
            if (!this.authorized(request)) {
                apiError(response, 401, 'authentication_error', 'gateway key mismatch');
                return;
            }
            const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
            if (request.method === 'GET' && path === '/models') {
                sendJson(response, 200, {
                    default: this.options.llm.defaultRoute(),
                    models: await this.options.llm.models()
                });
            } else if (request.method === 'POST' && path === '/v1/messages') {
                await this.messages(request, response, controller.signal);
            } else if (request.method === 'POST' && path === '/web/search') {
                await this.search(request, response, controller.signal);
            } else if (request.method === 'POST' && path === '/web/fetch') {
                await this.fetchPage(request, response, controller.signal);
            } else {
                apiError(response, 404, 'not_found_error', 'not found');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (response.headersSent) response.end();
            else apiError(response, error instanceof BridgeRequestError || error instanceof SyntaxError ? 400 : 500, 'api_error', message);
        } finally{
            this.inflight.delete(controller);
        }
    }
    async messages(request, response, signal) {
        const bridged = await bridgeRequest(parseObject(await readBody(request)), this.options.llm.saveImage, this.options.llm.defaultRoute());
        const routeText = bridged.route;
        const chunks = this.options.llm.stream({
            provider: bridged.provider,
            model: bridged.model,
            system: bridged.system,
            messages: bridged.messages,
            tools: bridged.tools,
            maxTokens: bridged.maxTokens,
            signal
        });
        const id = `msg_${randomUUID().replaceAll('-', '')}`;
        if (!bridged.stream) {
            const writer = new MessagesStreamWriter(id, routeText, ()=>{});
            for await (const chunk of chunks)writer.push(chunk);
            sendJson(response, 200, writer.final());
            return;
        }
        response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store'
        });
        const send = (event)=>{
            response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        };
        const writer = new MessagesStreamWriter(id, routeText, send);
        writer.start();
        try {
            for await (const chunk of chunks)writer.push(chunk);
        } catch (error) {
            send({
                type: 'error',
                error: {
                    type: 'api_error',
                    message: error instanceof Error ? error.message : String(error)
                }
            });
        }
        response.end();
    }
    async search(request, response, signal) {
        const web = this.options.web();
        if (web === undefined) {
            apiError(response, 503, 'api_error', '客户端没有启用联网搜索');
            return;
        }
        const body = parseObject(await readBody(request));
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (query === '') throw new BridgeRequestError('缺少 query');
        const max = typeof body.max_results === 'number' && body.max_results > 0 ? Math.min(20, Math.floor(body.max_results)) : 8;
        sendJson(response, 200, {
            results: await web.search(query, max, signal)
        });
    }
    async fetchPage(request, response, signal) {
        const web = this.options.web();
        if (web === undefined) {
            apiError(response, 503, 'api_error', '客户端没有启用网页读取');
            return;
        }
        const body = parseObject(await readBody(request));
        const url = typeof body.url === 'string' ? body.url.trim() : '';
        if (!/^https?:\/\//.test(url)) throw new BridgeRequestError('url 要以 http:// 或 https:// 开头');
        const page = await web.fetch(url, signal);
        const limit = this.options.fetchChars;
        sendJson(response, 200, {
            ...page,
            text: page.text.slice(0, limit),
            truncated: page.text.length > limit
        });
    }
}
