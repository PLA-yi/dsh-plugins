// 视频板块的 AI 直接用模型接口干活：没有 Claude Code 的电脑（比如装在 DeepSeek Harness 里给别人用）也能做视频、拉片。
// 做的事和 Claude Code 那边一样：读写这个文件夹里的文件、跑 hyperframes 检查和截帧、看截出来的图。
// 只能动这一个文件夹；命令只放行 hyperframes 的几个查看类子命令和 ffprobe，导出、配音这些还是工作台的按钮来做。
import fs from 'node:fs';
import path from 'node:path';
import * as ai from './ai.mjs';

const TEXT = /\.(md|css|html?|mjs|cjs|js|json|svg|txt|ya?ml|srt|vtt|csv)$/i;
const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const HF_OK = new Set(['check', 'lint', 'validate', 'snapshot', 'inspect', 'timeline', 'info', 'compositions', 'docs']);

/** 现在有没有能直接调的模型（DSH 里的模型、Claude API）。返回模型，或者 null。 */
export function model() {
  try { return ai.claudeFor(undefined); } catch { return null; }
}

const TOOLS = {
  list_files: { description: '列出这个文件夹里的文件（不含隐藏文件和 node_modules），带大小。', input_schema: { type: 'object', properties: {} } },
  read_file: { description: '读一个文件。文本文件返回内容；图片（png、jpg、webp）返回图片本身，用来看截帧和配图。路径相对这个文件夹，比如 index.html、snapshots/frame-1.png、.claude/skills/hyperframes/SKILL.md。', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  write_file: { description: '新建或整个重写一个文本文件。', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  edit_file: { description: '改文件里的一段：把 old_text 换成 new_text。old_text 要从文件里原样复制，并且在文件里只出现一次（不唯一就多带几行，或者设 replace_all）。', input_schema: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['path', 'old_text', 'new_text'] } },
  copy_file: { description: '把文件夹里的一个文件拷到另一个位置（比如把 source/img/a.png 拷到 assets/a.png）。', input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  run: { description: '在这个文件夹里跑命令。只能用：hyperframes check | lint | snapshot | inspect | timeline | info | compositions | docs，和 ffprobe。例：hyperframes check；hyperframes snapshot --at 1,6,12（截出来的图在 snapshots/ 里，再用 read_file 看）。', input_schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
};

// 简单的命令行拆分：认双引号和单引号
function argv(cmd) {
  const out = []; let cur = '', q = '', any = false;
  for (const ch of String(cmd).trim()) {
    if (q) { if (ch === q) q = ''; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; any = true; continue; }
    if (/\s/.test(ch)) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
    if (/[;&|<>`$]/.test(ch)) throw new Error('一次只跑一条命令，不要用管道、重定向和 ; &&');
    cur += ch;
  }
  if (cur || any) out.push(cur);
  return out;
}

/**
 * 跑一轮。
 * @param {object} o
 * @param {string} o.dir 只能在这个文件夹里干活
 * @param {string} o.system 系统提示
 * @param {string} o.prompt 这一轮要做的事（带上之前的对话）
 * @param {(rel: string) => boolean} o.canWrite 这个相对路径能不能写
 * @param {boolean} [o.commands] 能不能跑 run
 * @param {(cmd: string, args: string[]) => Promise<string>} [o.exec] 跑命令（带好 PATH 的）
 * @param {(icon: string, text: string) => void} o.step 显示一步进度
 * @param {(text: string) => void} o.onText 边写边出的回复
 * @param {AbortSignal} o.signal
 * @returns {Promise<string>} 最后一轮的回复
 */
export async function runAgent({ dir, system, prompt, canWrite, commands = true, exec, step, onText, signal, maxRounds = 60 }) {
  const c = model();
  if (!c) throw new Error('没有能用的模型：在 DeepSeek Harness 里配好模型，或者装好 Claude Code');
  const root = path.resolve(dir);
  const safe = p => {
    const rel = String(p || '').replace(/^\.?\/+/, '');
    const f = path.resolve(root, rel);
    if (!rel || (f !== root && !f.startsWith(root + path.sep))) throw new Error('只能用这个文件夹里的文件：' + p);
    return { f, rel: path.relative(root, f).split(path.sep).join('/') };
  };
  const writable = rel => { if (!canWrite(rel)) throw new Error(`${rel} 不能改`); };
  let noImages = false;
  const tools = {
    list_files() {
      const out = [];
      const walk = (d, rel, depth) => {
        for (const n of fs.readdirSync(d).sort()) {
          if (n.startsWith('.') || n === 'node_modules' || n === 'renders') continue;
          const p = path.join(d, n), r = rel ? rel + '/' + n : n, s = fs.statSync(p);
          if (s.isDirectory()) { out.push(r + '/'); if (depth < 3) walk(p, r, depth + 1); } else out.push(`${r}  ${s.size < 1024 ? s.size + ' B' : (s.size / 1024).toFixed(0) + ' KB'}`);
          if (out.length > 400) return;
        }
      };
      walk(root, '', 0);
      step('search', '看看文件夹里有什么');
      return out.join('\n') || '（空的）';
    },
    read_file({ path: p }) {
      const { f, rel } = safe(p);
      if (!fs.existsSync(f)) throw new Error('没有这个文件：' + rel);
      const ext = path.extname(f).toLowerCase();
      if (IMG[ext]) {
        step('eye', /^(source|assets)\//.test(rel) ? '看文章配图' : '看截出来的画面');
        if (noImages) return `（现在用的模型看不了图片，${rel} 没法看；按代码和检查结果判断）`;
        const buf = fs.readFileSync(f);
        if (buf.length > 4.5 * 1024 * 1024) return '图片太大，看不了';
        return [{ type: 'image', source: { type: 'base64', media_type: IMG[ext], data: buf.toString('base64') } }, { type: 'text', text: rel }];
      }
      if (!TEXT.test(f)) throw new Error('只能读文本文件和图片');
      step(/SKILL\.md$|references\//.test(rel) ? 'book-open' : 'file-text', /SKILL\.md$|references\//.test(rel) ? '读视频的制作规范' : `读 ${path.basename(rel)}`);
      const t = fs.readFileSync(f, 'utf8');
      return t.length > 60000 ? t.slice(0, 60000) + '\n…（太长，后面省略了）' : t;
    },
    write_file({ path: p, content }) {
      const { f, rel } = safe(p); writable(rel);
      if (!TEXT.test(f)) throw new Error('只能写文本文件');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, String(content ?? ''));
      step('pen-line', rel === 'narration.json' ? '写旁白稿' : `写 ${path.basename(rel)}`);
      return `已写入 ${rel}`;
    },
    edit_file({ path: p, old_text, new_text, replace_all }) {
      const { f, rel } = safe(p); writable(rel);
      if (!fs.existsSync(f)) throw new Error('没有这个文件：' + rel);
      const t = fs.readFileSync(f, 'utf8'), n = old_text ? t.split(old_text).length - 1 : 0;
      if (!n) throw new Error(`在 ${rel} 里没找到 old_text，先 read_file 看一下现在的内容，再原样复制`);
      if (n > 1 && !replace_all) throw new Error(`old_text 在 ${rel} 里出现了 ${n} 次，多带几行让它唯一，或者设 replace_all: true`);
      fs.writeFileSync(f, replace_all ? t.split(old_text).join(new_text) : t.replace(old_text, () => new_text));
      step('pen-line', rel === 'narration.json' ? '改旁白稿' : `改 ${path.basename(rel)}`);
      return '已改好';
    },
    copy_file({ from, to }) {
      const a = safe(from), b = safe(to); writable(b.rel);
      if (!fs.existsSync(a.f)) throw new Error('没有这个文件：' + a.rel);
      fs.mkdirSync(path.dirname(b.f), { recursive: true });
      fs.copyFileSync(a.f, b.f);
      step('images', '整理素材');
      return `已拷到 ${b.rel}`;
    },
    async run({ command }) {
      if (!commands || !exec) throw new Error('这里不能跑命令');
      const [cmd, ...args] = argv(command);
      if (cmd === 'hyperframes') {
        if (!HF_OK.has(args[0])) throw new Error(`hyperframes ${args[0] || ''} 不能在这里跑。导出、配音、转字幕由工作台的按钮来做`);
        step(...(/^(check|lint|validate)$/.test(args[0]) ? ['stethoscope', '检查画面有没有问题'] : args[0] === 'snapshot' ? ['eye', '截几帧看效果'] : ['search', '核对时间轴']));
      } else if (cmd === 'ffprobe') step('gauge', '量素材的时长');
      else throw new Error('只能跑 hyperframes 和 ffprobe');
      try { const out = await exec(cmd, args); return (out || '（没有输出，成功了）').slice(-8000); }
      catch (e) { return `命令出错了：\n${String(e.message).slice(-6000)}`; }
    },
  };
  const defs = Object.entries(TOOLS).filter(([n]) => commands || n !== 'run').map(([name, d]) => ({ name, ...d }));
  const params = { model: c.model, max_tokens: 16000, system, tools: defs, messages: [{ role: 'user', content: prompt }] };
  // 模型看不了图：把对话里已经放进去的图换成一句话，再试这一轮
  const dropImages = () => {
    noImages = true;
    for (const m of params.messages) if (Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_result' && Array.isArray(b.content)) b.content = b.content.map(x => x.type === 'image' ? { type: 'text', text: '（现在用的模型看不了图片）' } : x);
  };
  let reply = '';
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) break;
    let msg, text = '';
    try {
      const stream = c.client.messages.stream(params, { signal });
      for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; onText(text); }
      msg = await stream.finalMessage();
    } catch (e) {
      if (signal?.aborted) break;
      if (!noImages && /image|vision|multimodal|多模态|图片/i.test(String(e.message))) { dropImages(); round--; continue; }
      throw e;
    }
    if (text.trim()) reply = text;
    params.messages.push({ role: 'assistant', content: msg.content });
    const uses = msg.content.filter(b => b.type === 'tool_use');
    if (!uses.length) break;
    const results = [];
    for (const b of uses) {
      let content, is_error = false;
      if (msg.stop_reason === 'max_tokens') { content = '输出太长被截断了，这次的参数不完整。分几步做：用 edit_file 小改，别一次重写整个大文件'; is_error = true; }
      else {
        try { content = tools[b.name] ? await tools[b.name](b.input || {}) : `没有 ${b.name} 这个工具`; if (!tools[b.name]) is_error = true; }
        catch (e) { content = e.message; is_error = true; }
      }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: Array.isArray(content) ? content : String(content), ...(is_error ? { is_error: true } : {}) });
    }
    params.messages.push({ role: 'user', content: results });
  }
  return reply.trim();
}
