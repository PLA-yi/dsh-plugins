// AI 接入：三类供应商
//   hermes     本机 Hermes（用你已经配好的模型，不用填密钥；只开 todo 工具集，在空目录里跑，当纯文本模型用）
//   anthropic  Claude API（官方 SDK，流式）
//   openai     OpenAI 兼容接口（DeepSeek、通义、Kimi、豆包、智谱、OpenAI……，流式）
//   claudecode 本机 Claude Code 的无界面模式（claude -p），用作者自己 Claude 账号的订阅额度；只当文字模型用，不动文件
// 嵌在 DeepSeek Harness 客户端里时，客户端开一个本机转发口，工作台就能用客户端能用的所有模型（Claude、DeepSeek……），
// 调用和密钥都由客户端负责，工作台拿不到密钥本身。这时默认用「客户端默认模型」，跟着客户端的设置走。
// 客户端的模型不一定有 Claude 那种服务端联网工具，所以联网搜索和读网页改由工作台调客户端的接口来做。
// 密钥存在 data/ai.json（权限 600），也可以用环境变量；网页上只显示遮挡后的样子。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';
import Anthropic from './vendor/anthropic-sdk.mjs';
import { APP_DIR, DATA_DIR } from './core.mjs';

const FILE = path.join(DATA_DIR, 'ai.json');
const SANDBOX = path.join(DATA_DIR, 'hermes-sandbox');

const DEFAULTS = [
  { id: 'hermes', name: 'Hermes（本机，免配置）', type: 'hermes', model: '' },
  { id: 'claude', name: 'Claude', type: 'anthropic', model: 'claude-opus-5-5', baseUrl: '', env: 'ANTHROPIC_API_KEY', fallbacks: true },
  { id: 'claude-code', name: 'Claude Code（订阅额度）', type: 'claudecode', model: '' },
  { id: 'deepseek', name: 'DeepSeek', type: 'openai', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', env: 'DEEPSEEK_API_KEY' },
  { id: 'qwen', name: '通义千问', type: 'openai', model: 'qwen-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', env: 'DASHSCOPE_API_KEY' },
  { id: 'kimi', name: 'Kimi', type: 'openai', model: 'kimi-k2-0905-preview', baseUrl: 'https://api.moonshot.cn/v1', env: 'MOONSHOT_API_KEY' },
  { id: 'doubao', name: '豆包（火山方舟）', type: 'openai', model: '', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', env: 'ARK_API_KEY' },
  { id: 'glm', name: '智谱 GLM', type: 'openai', model: 'glm-4.6', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', env: 'ZHIPU_API_KEY' },
  { id: 'openai', name: 'OpenAI', type: 'openai', model: 'gpt-5', baseUrl: 'https://api.openai.com/v1', env: 'OPENAI_API_KEY' },
];

const DSH = process.env.WB_DSH_GATEWAY ? {
  gateway: process.env.WB_DSH_GATEWAY.replace(/\/+$/, ''), key: process.env.WB_DSH_GATEWAY_KEY || '',
  models: [], default: '', defaultName: '',
} : null;
// 客户端的模型列表会变（换了设置、加了模型），启动时拉一次，之后每 5 分钟再拉
async function refreshClientModels() {
  try {
    const r = await fetch(DSH.gateway + '/models', { headers: { 'x-api-key': DSH.key } });
    const b = await r.json();
    if (!r.ok) return;
    DSH.models = b.models || []; DSH.default = b.default || '';
    DSH.defaultName = DSH.models.find(m => m.id === DSH.default)?.name || DSH.default;
  } catch {}
}
if (DSH) { refreshClientModels(); setInterval(refreshClientModels, 5 * 60 * 1000).unref(); }
const clientProvider = (id, name, model) => ({ id, name, type: 'anthropic', model, baseUrl: DSH.gateway, env: 'WB_DSH_GATEWAY_KEY', fallbacks: false, dsh: true });
const isClient = id => id === 'dsh' || String(id).startsWith('dsh:');
// 「客户端默认模型」的 model 写 dsh，转发口会换成客户端当时的默认模型
const allProviders = () => DSH ? [
  clientProvider('dsh', `客户端默认模型${DSH.defaultName ? `（现在是 ${DSH.defaultName}）` : ''}`, 'dsh'),
  ...DSH.models.map(m => clientProvider('dsh:' + m.id, `${m.name}（客户端）`, m.id)),
  ...DEFAULTS,
] : DEFAULTS;

function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const over = Object.fromEntries((saved.providers || []).map(p => [p.id, p]));
  const all = allProviders();
  const providers = all.map(d => d.dsh ? d : { ...d, ...(over[d.id] || {}) });
  for (const p of saved.providers || []) if (!all.some(d => d.id === p.id) && !isClient(p.id)) providers.push(p);
  // 在客户端里和单独打开时各记各的默认模型：在客户端里默认跟着客户端走
  const base = saved.default || 'hermes', dshDefault = saved.dshDefault;
  const inClient = DSH && dshDefault && providers.some(p => p.id === dshDefault) ? dshDefault : 'dsh';
  return { default: DSH ? inClient : base, base, dshDefault, providers };
}
function save(cfg) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // 只存和默认值不一样的字段
  const all = allProviders();
  const diff = cfg.providers.filter(p => !p.dsh).map(p => { const d = all.find(x => x.id === p.id) || {}; const o = { id: p.id }; for (const k in p) if (p[k] !== d[k]) o[k] = p[k]; return o; })
    .filter(o => Object.keys(o).length > 1);
  fs.writeFileSync(FILE, JSON.stringify({ default: cfg.base, ...(cfg.dshDefault ? { dshDefault: cfg.dshDefault } : {}), providers: diff }, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(FILE, 0o600);
}
const keyOf = p => p.key || (p.env && process.env[p.env]) || '';
const mask = k => !k ? '' : k.length < 10 ? '••••' : `${k.slice(0, 4)}••••${k.slice(-4)}`;
// 每个接口能挑的模型。选的时候传「接口id::模型」，不改设置里的默认模型
const CLAUDE_MODELS = [['claude-opus-5-5', 'Opus 5.5', '最强'], ['claude-sonnet-5-5', 'Sonnet 5.5', '快一些'], ['claude-fable-5-1', 'Fable 5.1', ''], ['claude-haiku-5-5', 'Haiku 5.5', '最快最省']];
const KNOWN_MODELS = { deepseek: ['deepseek-chat', 'deepseek-reasoner'] };
function modelsOf(p) {
  if (p.dsh || p.type === 'hermes') return [];
  if (p.type === 'claudecode') return [['', '跟着订阅', '用 Claude Code 自己的默认'], ['opus', 'Opus', '最强'], ['sonnet', 'Sonnet', '快一些'], ['fable', 'Fable', ''], ['haiku', 'Haiku', '最快、最省额度']].map(([id, label, note]) => ({ id, label, note }));
  const list = p.type === 'anthropic' ? CLAUDE_MODELS.map(([id, label, note]) => ({ id, label, note })) : (KNOWN_MODELS[p.id] || []).map(id => ({ id, label: id }));
  if (p.model && !list.some(m => m.id === p.model)) list.unshift({ id: p.model, label: p.model });
  return list.length > 1 ? list : [];
}
const ready = p => p.type === 'hermes' ? true : p.type === 'claudecode' ? !!ccStatus().loggedIn : !!keyOf(p) && !!p.model;

export function providers() {
  const c = load();
  return { default: c.default, providers: c.providers.map(p => ({ id: p.id, name: p.name, type: p.type, model: p.model, baseUrl: p.dsh ? '' : p.baseUrl || '', keyMask: p.dsh ? '由客户端提供' : mask(keyOf(p)), keyFrom: p.dsh ? 'DeepSeek Harness 客户端' : p.key ? '设置页' : (p.env && process.env[p.env]) ? `环境变量 ${p.env}` : '', ready: ready(p), env: p.dsh ? '' : p.env || '', dsh: !!p.dsh, models: modelsOf(p), ...(p.type === 'claudecode' ? { cc: (({ bin, ...x }) => x)(ccStatus()) } : {}) })) };
}
export function setProvider(id, patch) {
  const c = load();
  if (patch.default) {
    if (!c.providers.some(p => p.id === patch.default)) throw new Error('没有这个模型');
    if (DSH) c.dshDefault = patch.default; else c.base = patch.default;
  }
  if (id) {
    if (isClient(id)) throw new Error('客户端的模型在 DeepSeek Harness 的设置里改');
    let p = c.providers.find(x => x.id === id);
    if (!p) { if (!patch.name) throw new Error('新加的接口要有名字'); p = { id, type: 'openai' }; c.providers.push(p); }
    for (const k of ['name', 'model', 'baseUrl']) if (patch[k] != null) p[k] = String(patch[k]).trim();
    if (patch.key != null) p.key = String(patch.key).trim();     // 空字符串 = 清除
    if (patch.type && ['openai', 'anthropic'].includes(patch.type) && !DEFAULTS.some(d => d.id === id)) p.type = patch.type;
  }
  save(c);
  return providers();
}
// 能动手的助手要用 Claude 的工具调用；选的不是 Claude 就返回 null，退回只提修改建议的老办法
export function claudeFor(id) {
  const p = pick(id);
  if (p.type !== 'anthropic') return null;
  const base = (p.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '').replace(/\/v1(\/messages)?$/, '');
  return { client: new Anthropic({ apiKey: keyOf(p), baseURL: base }), model: p.model, fallbacks: p.fallbacks !== false, name: p.name, dsh: !!p.dsh };
}
// 能动手的助手用 Claude Code（订阅额度）时：返回它的程序位置和选的模型；选的不是 Claude Code 就返回 null
export function ccFor(id) {
  const p = pick(id);
  if (p.type !== 'claudecode') return null;
  const bin = ccBin(); if (!bin) throw new Error('没找到 Claude Code，到「AI 设置」里点「一键安装并登录」');
  fs.mkdirSync(CC_SANDBOX, { recursive: true });
  return { bin, model: p.model || '', env: ccEnv(), cwd: CC_SANDBOX, name: p.name };
}
// 后台整理类的活用便宜模型：fast = Haiku 5.5，mid = Sonnet 5.5。按默认接口是 Claude Code 还是 Claude API 给出对应写法；别的接口就用默认
export function cheap(tier = 'fast') {
  const c = load(), p = c.providers.find(x => x.id === c.default) || c.providers[0];
  const m = tier === 'mid' ? 'sonnet' : 'haiku';
  if (p?.type === 'claudecode') return `${p.id}::${m}`;
  if (p?.type === 'anthropic') return `${p.id}::claude-${m}-5-5`;
  return undefined;
}
function pick(id) {
  const [pid, model] = String(id || '').split('::');
  const c = load(), p0 = c.providers.find(x => x.id === (pid || c.default)) || c.providers[0];
  const p = model != null && modelsOf(p0).some(m => m.id === model) ? { ...p0, model } : p0;
  if (!ready(p)) throw new Error(p.type === 'claudecode' ? (ccStatus().found ? 'Claude Code 还没登录：到「AI 设置」里点「登录」，用你的 Claude 账号确认一下' : '没找到 Claude Code：到「AI 设置」里点「一键安装并登录」') : `「${p.name}」还没配好：${p.type === 'hermes' ? '' : !keyOf(p) ? '缺 API 密钥' : '缺模型名'}。到工作台右上角「AI 设置」里填`);
  return p;
}

// 写资讯类信息（选题广场的中文要点、详情整理、挑选题、深挖简报、读网页兜底）固定用 Haiku：量大、要求不高，不占贵模型的额度
// 用的是 Claude Code 就换成它的 haiku；用 Claude API 就换成 Haiku 5.5；其他模型没有 Haiku，照原样
export function light(id) {
  let p; try { p = pick(id); } catch { return id; }
  if (p.type === 'claudecode') return `${p.id}::haiku`;
  if (p.type === 'anthropic') return `${p.id}::claude-haiku-5-5`;
  return id;
}

/* ---------- 生成：边出字边回调 onText，最后返回全文 ---------- */
// web: true 表示需要联网查资料（Hermes 开 web 工具集，Claude 用官方网页搜索工具；OpenAI 兼容接口不支持联网）
export async function generate({ provider, system, prompt, onText = () => {}, signal, web = false, searches = 6 }) {
  const p = pick(provider);
  if (p.type === 'hermes') return hermes(p, system, prompt, onText, signal, web);
  if (p.type === 'claudecode') return claudeCode(p, system, prompt, onText, signal, web);
  if (p.type === 'anthropic') return claude(p, system, prompt, onText, signal, web, searches);
  if (web) prompt += '\n\n（注意：你现在不能联网。只写你确定的内容，并在开头说明“未联网，以下来自模型已有知识，需要核实”。）';
  return openaiCompat(p, system, prompt, onText, signal);
}

/* ---------- 客户端的模型：联网搜索和读网页由工作台调客户端来做 ---------- */
export const DSH_WEB_TOOLS = [
  { name: 'web_search', description: '联网搜索，返回标题、链接、摘要和发布时间。查最新动态、官方说明、数据出处时用。', input_schema: { type: 'object', properties: { query: { type: 'string', description: '搜索词' } }, required: ['query'] } },
  { name: 'web_fetch', description: '读一个网页的正文文字。要看原文、核对引用时用。', input_schema: { type: 'object', properties: { url: { type: 'string', description: '网页地址' } }, required: ['url'] } },
];
export async function dshWeb(name, input, signal) {
  if (!DSH) throw new Error('只有在 DeepSeek Harness 客户端里才能用客户端联网');
  const search = name === 'web_search';
  const r = await fetch(DSH.gateway + (search ? '/web/search' : '/web/fetch'), {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-api-key': DSH.key },
    body: JSON.stringify(search ? { query: input.query, max_results: 8 } : { url: input.url }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error?.message || `联网失败：HTTP ${r.status}`);
  if (search) return (b.results || []).map((x, i) => `${i + 1}. ${x.title || x.url}\n${x.url}${x.publishedAt ? `（${x.publishedAt}）` : ''}\n${x.snippet || ''}`).join('\n\n') || '没有搜到结果';
  return `${b.url}\n\n${b.text}${b.truncated ? '\n\n（后面还有，已截断）' : ''}`;
}
async function viaClient(p, system, prompt, onText, signal, web, searches) {
  const client = new Anthropic({ apiKey: keyOf(p), baseURL: p.baseUrl });
  const params = { model: p.model, max_tokens: 32000, system, messages: [{ role: 'user', content: prompt }], ...(web ? { tools: DSH_WEB_TOOLS } : {}) };
  let text = '', final;
  for (let round = 0; round < searches * 2 + 2; round++) {
    const stream = client.messages.stream(params, { signal });
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; onText(ev.delta.text); }
    }
    final = await stream.finalMessage();
    const uses = final.content.filter(b => b.type === 'tool_use');
    if (final.stop_reason !== 'tool_use' || !uses.length) break;
    params.messages = [...params.messages, { role: 'assistant', content: final.content }, { role: 'user', content: await Promise.all(uses.map(async b => {
      try { return { type: 'tool_result', tool_use_id: b.id, content: await dshWeb(b.name, b.input || {}, signal) }; }
      catch (e) { return { type: 'tool_result', tool_use_id: b.id, content: e.message, is_error: true }; }
    })) }];
    if (text && !text.endsWith('\n')) { text += '\n\n'; onText('\n\n'); }
  }
  return text;
}

async function claude(p, system, prompt, onText, signal, web, searches = 6) {
  if (p.dsh) return viaClient(p, system, prompt, onText, signal, web, searches);
  // 没填接口地址就固定用官方地址，不跟着环境变量 ANTHROPIC_BASE_URL 走
  // 接口地址只要根地址；填成 …/v1/messages 这种完整路径也自动去掉，免得请求变成 /v1/messages/v1/messages
  const base = (p.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '').replace(/\/v1(\/messages)?$/, '');
  const client = new Anthropic({ apiKey: keyOf(p), baseURL: base });
  const params = {
    model: p.model, max_tokens: 64000, system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'medium' },
    ...(web ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: searches }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: Math.max(3, searches) }] } : {}),
    ...(p.fallbacks !== false ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  };
  // 联网搜索很多次时，接口可能先停一下（pause_turn），把已有内容接回去继续跑，最多续 4 次
  let text = '', final;
  for (let round = 0; round < 5; round++) {
    const stream = client.beta.messages.stream(params, { signal });
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { text += ev.delta.text; onText(ev.delta.text); }
    }
    final = await stream.finalMessage();
    if (final.stop_reason !== 'pause_turn') break;
    params.messages = [...params.messages, { role: 'assistant', content: final.content }];
  }
  if (final.stop_reason === 'refusal') throw new Error('模型拒绝了这次请求' + (final.stop_details?.category ? `（${final.stop_details.category}）` : ''));
  return text;
}

async function openaiCompat(p, system, prompt, onText, signal) {
  const r = await fetch(p.baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyOf(p)}` },
    body: JSON.stringify({ model: p.model, stream: true, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`${p.name} 返回 ${r.status}：${(await r.text()).slice(0, 300)}`);
  let text = '', buf = '';
  const dec = new TextDecoder();
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim(); if (data === '[DONE]') continue;
      try { const d = JSON.parse(data).choices?.[0]?.delta?.content; if (d) { text += d; onText(d); } } catch {}
    }
  }
  return text;
}

/* ---------- Claude Code：用作者自己 Claude 账号的订阅额度 ----------
   调本机 Claude Code 的无界面模式（claude -p）。优先用终端里装的 claude；没装就用桌面 App 自带的那份（App 更新后自动找最新版本）。
   不带桌面 App 的环境变量，用作者自己的登录（第一次要在终端运行 xy ai login）。在空文件夹里跑，内置工具全关
   （要联网时只开搜索和读网页），不加载 MCP、不存会话，所以碰不到作者的文件。 */
const CC_SANDBOX = path.join(DATA_DIR, 'claude-code-sandbox');
export function ccBin() {
  const home = os.homedir();
  for (const d of [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin']) { const f = path.join(d, 'claude'); if (fs.existsSync(f)) return f; }
  const root = path.join(home, 'Library', 'Application Support', 'Claude', 'claude-code');
  const ver = v => v.split('.').map(n => n.padStart(6, '0')).join('.');
  try {
    for (const v of fs.readdirSync(root).filter(v => /^\d+\.\d+\.\d+$/.test(v)).sort((a, b) => ver(b).localeCompare(ver(a))))
      for (const h of fs.readdirSync(path.join(root, v))) { const f = path.join(root, v, h, 'claude.app', 'Contents', 'MacOS', 'claude'); if (fs.existsSync(f)) return f; }
  } catch {}
  return null;
}
export const ccEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_|CLAUDE)/.test(k) && k !== 'CLAUDECODE'));
let ccCache = { t: 0, v: null };
export function ccStatus(force = false) {
  if (!force && ccCache.v && Date.now() - ccCache.t < 60000) return ccCache.v;
  const bin = ccBin(); let v = { found: !!bin, bin, loggedIn: false };
  if (bin) {
    try { const j = JSON.parse(execFileSync(bin, ['auth', 'status', '--json'], { env: ccEnv(), timeout: 15000, encoding: 'utf8' })); v = { ...v, loggedIn: !!j.loggedIn, email: j.email || j.account?.email || '', plan: j.subscriptionType || j.subscription || '', method: j.authMethod || '' }; }
    catch (e) { try { const j = JSON.parse(String(e.stdout || '')); v.loggedIn = !!j.loggedIn; } catch {} }
  }
  ccCache = { t: Date.now(), v }; return v;
}
// 网页里一键登录：后台起 claude auth login，它会自己打开浏览器；浏览器没打开时，网页上给备用链接和填验证码的框
let ccLog = null;
export function ccLoginState() { return ccLog ? { running: ccLog.running, url: ccLog.url, error: ccLog.error, ok: ccLog.ok } : { running: false }; }
export async function ccLogin({ code } = {}) {
  if (code != null) {
    if (!ccLog?.running) throw new Error('登录已经结束了，重新点一次「登录」');
    ccLog.ch.stdin.write(String(code).trim() + '\n'); return ccLoginState();
  }
  const bin = ccBin(); if (!bin) throw new Error('没找到 Claude Code，先点「一键安装」');
  if (ccLog?.running) { try { ccLog.ch.kill(); } catch {} }
  const ch = spawn(bin, ['auth', 'login', '--claudeai'], { env: ccEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  const me = ccLog = { ch, running: true, url: '', out: '', error: '', ok: false };
  const eat = d => { me.out = (me.out + d).slice(-4000); const m = me.out.match(/https:\/\/\S+oauth\S+/); if (m) me.url = m[0]; };
  ch.stdout.on('data', eat); ch.stderr.on('data', eat);
  ch.on('error', e => { me.running = false; me.error = 'Claude Code 没能启动：' + e.message; });
  ch.on('close', c => {
    me.running = false; ccCache = { t: 0, v: null };
    me.ok = !!ccStatus(true).loggedIn;
    if (!me.ok && !me.error) me.error = c === null || c === 143 ? '登录取消了' : '没登录上：' + (me.out.split('\n').filter(l => l.trim() && !/oauth|Paste code/i.test(l)).pop() || '退出码 ' + c).slice(0, 160);
  });
  // 十分钟没完成就收掉
  setTimeout(() => { if (me.running) ch.kill(); }, 600000);
  for (let i = 0; i < 40 && me.running && !me.url; i++) await new Promise(r => setTimeout(r, 150));
  return ccLoginState();
}
// 没装 Claude Code 时一键安装：跑官方安装脚本（claude.ai/install.sh），装到 ~/.local/bin/claude
let ccInst = null;
export function ccInstallState() { return ccInst ? { running: ccInst.running, ok: ccInst.ok, log: ccInst.log.split('\n').filter(Boolean).slice(-3).join('\n'), error: ccInst.error } : { running: false }; }
export function ccInstall() {
  if (ccInst?.running) return ccInstallState();
  const ch = spawn('/bin/bash', ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'], { env: ccEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  const me = ccInst = { running: true, ok: false, log: '', error: '' };
  const eat = d => { me.log = (me.log + String(d).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).slice(-4000); };
  ch.stdout.on('data', eat); ch.stderr.on('data', eat);
  ch.on('error', e => { me.running = false; me.error = e.message; });
  ch.on('close', c => { me.running = false; ccCache = { t: 0, v: null }; me.ok = c === 0 && !!ccBin(); if (!me.ok && !me.error) me.error = '安装没成功（退出码 ' + c + '）：' + me.log.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 200); });
  return ccInstallState();
}

// Claude Code 报错翻成大白话
export function ccError(m) {
  m = String(m || '').trim();
  if (/not logged in|please run \/login|invalid api key|oauth/i.test(m)) { ccCache = { t: 0, v: null }; return new Error('Claude Code 还没登录：到「AI 设置」里点「登录」，用你的 Claude 账号确认一下'); }
  if (/usage limit|rate limit|limit reached|out of (extra )?usage/i.test(m)) return new Error('Claude 订阅额度这阵子用完了，等额度恢复，或者先换成 Claude（API）：' + m.slice(0, 160));
  return new Error('Claude Code 出错：' + (m.slice(-300) || '没有返回内容'));
}
function claudeCode(p, system, prompt, onText, signal, web) {
  const bin = ccBin(); if (!bin) return Promise.reject(new Error('没找到 Claude Code：装一下命令行版，或者打开一次 Claude 桌面 App'));
  fs.mkdirSync(CC_SANDBOX, { recursive: true });
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--no-session-persistence', '--strict-mcp-config',
    '--system-prompt', (system || '你是写作助手。') + (web ? '\n\n可以联网搜索、读网页，但不要读写本机文件。' : ''),
    ...(p.model ? ['--model', p.model] : []),
    '--tools', ...(web ? ['WebSearch', 'WebFetch'] : ['']), ...(web ? ['--allowedTools', 'WebSearch', 'WebFetch'] : [])];
  return new Promise((resolve, reject) => {
    const ch = spawn(bin, args, { cwd: CC_SANDBOX, env: ccEnv() });
    let buf = '', text = '', result = null, isErr = false, err = '';
    const line = l => {
      let j; try { j = JSON.parse(l); } catch { return; }
      if (j.type === 'stream_event' && j.event?.type === 'content_block_delta' && j.event.delta?.type === 'text_delta') { text += j.event.delta.text; onText(j.event.delta.text); }
      if (j.type === 'result') { result = j.result; isErr = !!j.is_error; }
    };
    ch.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    ch.stderr.on('data', d => { err += d; });
    signal?.addEventListener('abort', () => ch.kill());
    ch.on('error', e => reject(new Error('Claude Code 没能启动：' + e.message)));
    ch.on('close', code => {
      if (buf.trim()) line(buf);
      if (isErr || (code !== 0 && result == null)) {
        const m = String(result || err || '').trim();
        return reject(ccError(m));
      }
      resolve(String(result ?? text).trim());
    });
    ch.stdin.end(prompt);
  });
}

function hermes(p, system, prompt, onText, signal, web) {
  fs.mkdirSync(SANDBOX, { recursive: true });
  const full = `${system}\n\n---\n\n${prompt}\n\n（只输出结果本身，不要解释。${web ? '可以联网搜索，但不要读写本机文件。' : '不要调用任何工具，不要读写文件。'}）`;
  const args = ['-z', full, '-t', web ? 'web' : 'todo', '--ignore-rules', ...(p.model ? ['-m', p.model] : [])];
  return new Promise((resolve, reject) => {
    const ch = spawn('hermes', args, { cwd: SANDBOX, env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` } });
    let out = '', err = '';
    ch.stdout.on('data', d => { const s = d.toString(); out += s; onText(s); });
    ch.stderr.on('data', d => { err += d; });
    signal?.addEventListener('abort', () => ch.kill());
    ch.on('error', e => reject(new Error('Hermes 没能启动：' + e.message)));
    ch.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error('Hermes 出错：' + (err || out).slice(-400))));
  });
}

/* ---------- 写作规则：来自你之前对文章的要求 ---------- */
export const WRITING_RULES = `你在帮作者改中文文章（公众号、小红书、知乎这类平台的图文内容）。规则：
- 事实、数字、日期、名字、归因和限定词（可能、据媒体报道、约、超过……）一个都不能改，也不能新增原文没有的事实或数字。需要资料才能写的地方，用【待补：要补什么】标出来。
- 要像真人写的：有人味、口语化，同时专业。多用具体场景和例子，少用空话。
- 不用这些写法：「不是……而是……」的假对比；排比三连；「真正的 / 核心 / 本质上 / 说白了 / 值得注意的是 / 某种程度上」；「赋能 / 打通 / 闭环 / 赛道」这类词；金句式、升华式收尾；口号式标题。
- 少用加粗、少用列表、少用顿号串名词、少用分号；相邻句子不要用同一种句式开头。
- 保持原文的段落结构和 Markdown / HTML 标记（<p class="…">、![]()、表格等）不被破坏。
只输出改好的文字本身，不要前言、不要解释、不要用代码块包起来。`;

// 视频脚本（口播稿）在写作规则之外再守这些；助手、划选改写、对话都用这一份
export const SCRIPT_RULES = `这是一条短视频的口播稿，不是公众号文章，写出来是要照着说的：
- 说人话：短句，一句一个意思，一口气能说完；用「你」「我」；不用「然而、因此、综上、与此同时」这类书面连接词。
- 开头钩子是开口第一句：直接给结果、反差、数字或一个问题，不寒暄、不自我介绍、不说「大家好」。
- 每 15–20 秒要有一个新信息或转折；一段里最多一两个数字，数字写成说得出口的样子。
- 结构照模板：「## 开头钩子（0–3 秒）」「## 正文」下面一段一个「### 第 N 段：这段讲什么（约 X 秒）」「## 结尾（约 X 秒）」「## 封面和标题」「## 发布文案和话题」。
- 每段先写口播原话（普通段落），再另起一行用「> 画面：……」写这段配什么画面，要具体到能照着拍或剪：录屏录哪一步、实拍什么、屏幕上打什么字。
- 工作台按每秒约 4.5 个字估时长，只算口播原话，不算「> 画面」、整行括号的占位说明，也不算「封面和标题」「发布文案和话题」两节。作者没说时长就按 60–90 秒（约 270–400 字）写；小标题里的「约 X 秒」要和这段字数对得上。
- 写好一段就把模板里那行括号占位说明删掉。口播原话不用加粗、不用列表；不要目录、图注这些文章才用的格式。
- 封面字 8 个字以内；标题备选 3 个，角度要不一样；发布文案两三句话，加 3–5 个话题。`;

const ARTICLE_TASKS = {
  polish: { name: '润色', ask: '把下面这段改得更通顺自然，意思和信息不变。' },
  deai: { name: '去 AI 味', ask: '下面这段 AI 味重，按规则改写：换掉套话和对仗句式，打散整齐的节奏，让它读起来像真人写的。信息一个不少。' },
  shorten: { name: '精简', ask: '把下面这段精简到原来的六到七成：删重复、删空话，信息不丢。' },
  expand: { name: '扩写', ask: '把下面这段展开写，补上具体场景、例子和推理过程，让读者更容易懂。不许编造事实和数字，需要资料的地方用【待补：…】标出。' },
  story: { name: '加故事感', ask: '把下面这段改得更有故事感：从一个具体的人、场景或时间点切入，再带出观点。不许编造事实。' },
  hook: { name: '更抓人', ask: '把下面这段改得更吸引人读下去：开头先给最有意思的信息或一个问题，句子更短更有力。不许夸大，不许编造。' },
};

export function articlePrompt(task, { text = '', instruction = '', before = '', after = '', title = '', script = false }) {
  if (script) {
    const r = articlePrompt(task, { text, instruction, before, after, title });
    if (task === 'titles') r.prompt = r.prompt.replace('起 6 个标题，适合公众号。', '起 6 个短视频标题（适合抖音，30 字以内），再给 3 个封面字（每个 8 个字以内）。').replace('这篇文章', '这条视频的口播稿');
    return task === 'review' ? { ...r, prompt: r.prompt.replace('全文：', `这是一条短视频的口播稿，另外按这几条看：开头 3 秒够不够抓人；有没有念不顺、太书面的句子；每段时长和字数对不对得上；「> 画面」够不够具体。\n\n全文：`) } : { ...r, system: r.system + '\n' + SCRIPT_RULES };
  }
  if (task === 'continue') return {
    system: WRITING_RULES,
    prompt: `文章《${title}》。下面是光标前的内容（结尾部分）：\n\n${before.slice(-4000)}\n\n${after ? `光标后面接着是：\n\n${after.slice(0, 1200)}\n\n` : ''}请从光标处接着写一到两段，语气和前文一致，和后文能接上。${instruction ? '要求：' + instruction : ''}`,
  };
  if (task === 'review') return {
    system: '你是严格的中文编辑，帮作者找文章的问题。只指出问题，不重写全文。',
    prompt: `按下面几类给《${title}》挑问题，每条引用原句（不超过 30 字），再给一句具体改法。没有问题的类别就跳过。用 Markdown 列表输出，最多 15 条，按影响大小排序：\n1. AI 味重的句子（套话、对仗、金句收尾、「不是…而是…」）\n2. 读者会觉得冗余、难受、想跳过的段落\n3. 逻辑跳跃或前后矛盾\n4. 数字或说法看起来需要核对的地方\n5. 开头和每章开头够不够吸引人\n${instruction ? '\n另外请特别关注：' + instruction : ''}\n\n全文：\n\n${text}`,
  };
  if (task === 'titles') return {
    system: WRITING_RULES.replace('只输出改好的文字本身', '只输出结果'),
    prompt: `给下面这篇文章起 6 个标题，适合公众号。要具体、有信息量、让人想点开，不要标题党、不要口号。每行一个，不要编号以外的解释。${instruction ? '要求：' + instruction : ''}\n\n${text.slice(0, 6000)}`,
  };
  const t = ARTICLE_TASKS[task];
  const ask = task === 'custom' ? `按这个要求改下面这段：${instruction}` : t.ask + (instruction ? `另外：${instruction}` : '');
  return { system: WRITING_RULES, prompt: `${ask}\n\n${before ? `（上文供参考，不要改：…${before.slice(-600)}）\n\n` : ''}要改的这段：\n\n${text}${after ? `\n\n（下文供参考，不要改：${after.slice(0, 400)}…）` : ''}` };
}
export const ARTICLE_TASK_NAMES = Object.fromEntries(Object.entries(ARTICLE_TASKS).map(([k, v]) => [k, v.name]));

export function cardPrompt({ css, section, element, instruction }) {
  return {
    system: `你在帮作者精修一张小红书卡片。卡片是一页 720×960 的 HTML，样式在页面的 <style> 里。
你只改用户选中的那一块 HTML，按指令修改后返回替换它的完整 HTML（从开始标签到结束标签）。
- 保留原有的 class、结构和视觉风格，除非指令要求改
- 不要超出卡片尺寸：文字变多时要相应精简，别让内容溢出
- 文案要像真人写的，不要 AI 腔；事实和数字不能改，不能编造
- 只输出 HTML 本身，不要解释，不要用代码块包起来`,
    prompt: `页面样式（节选）：\n${css.slice(0, 7000)}\n\n这一页的 HTML：\n${section.slice(0, 9000)}\n\n选中的那一块：\n${element}\n\n指令：${instruction}`,
  };
}

export const stripFence = s => s.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
