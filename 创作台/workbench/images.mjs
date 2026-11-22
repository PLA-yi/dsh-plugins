// 生图接口：兼容几种常见格式，换哪家都只是改设置
//   openai     OpenAI 兼容的 /images/generations（OpenAI gpt-image、豆包 Seedream、硅基流动、智谱 CogView……）
//   gemini     Google Gemini 生图（generateContent 返回图片）
//   dashscope  阿里云百炼 / 通义万相（异步任务，先提交再轮询）
//   minimax    MiniMax image_generation
// 生图要花钱：默认每次先让作者确认（confirm: true），可以在设置里关掉。
// 密钥存在 data/image.json（权限 600），也可以用环境变量。
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, DATA_DIR } from './core.mjs';

const FILE = path.join(DATA_DIR, 'image.json');

// 三种画幅，各家写法不一样
const SIZES = {
  openai: { landscape: '1536x1024', square: '1024x1024', portrait: '1024x1536' },
  seedream: { landscape: '2560x1440', square: '2048x2048', portrait: '1440x2560' },
  qwenimage: { landscape: '1664x928', square: '1328x1328', portrait: '928x1664' },
  cogview: { landscape: '1344x768', square: '1024x1024', portrait: '768x1344' },
  dashscope: { landscape: '1440*810', square: '1024*1024', portrait: '810*1440' },
  ratio: { landscape: '16:9', square: '1:1', portrait: '9:16' },
};
export const FORMATS = { openai: 'OpenAI 兼容（/images/generations）', gemini: 'Google Gemini', dashscope: '阿里云百炼（异步任务）', minimax: 'MiniMax' };

const DEFAULTS = [
  { id: 'openai', name: 'OpenAI gpt-image', format: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', env: 'OPENAI_API_KEY', sizes: 'openai' },
  { id: 'doubao', name: '豆包 Seedream（火山方舟）', format: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-4-0-250828', env: 'ARK_API_KEY', sizes: 'seedream', extra: { watermark: false } },
  { id: 'siliconflow', name: '硅基流动', format: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen-Image', env: 'SILICONFLOW_API_KEY', sizes: 'qwenimage', sizeParam: 'image_size' },
  { id: 'zhipu', name: '智谱 CogView', format: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'cogview-4-250304', env: 'ZHIPU_API_KEY', sizes: 'cogview' },
  { id: 'wanx', name: '通义万相（阿里云百炼）', format: 'dashscope', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', model: 'wan2.2-t2i-flash', env: 'DASHSCOPE_API_KEY', sizes: 'dashscope' },
  { id: 'gemini', name: 'Google Gemini', format: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash-image', env: 'GEMINI_API_KEY', sizes: 'ratio' },
  { id: 'minimax', name: 'MiniMax', format: 'minimax', baseUrl: 'https://api.minimaxi.com/v1', model: 'image-01', env: 'MINIMAX_API_KEY', sizes: 'ratio' },
];

function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  const over = Object.fromEntries((saved.providers || []).map(p => [p.id, p]));
  const providers = DEFAULTS.map(d => ({ ...d, ...(over[d.id] || {}) }));
  for (const p of saved.providers || []) if (!DEFAULTS.some(d => d.id === p.id)) providers.push(p);
  return { default: saved.default || '', confirm: saved.confirm !== false, providers };
}
function save(c) {
  const diff = c.providers.map(p => { const d = DEFAULTS.find(x => x.id === p.id) || {}; const o = { id: p.id }; for (const k in p) if (JSON.stringify(p[k]) !== JSON.stringify(d[k])) o[k] = p[k]; return o; }).filter(o => Object.keys(o).length > 1);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ default: c.default, confirm: c.confirm, providers: diff }, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(FILE, 0o600);
}
const keyOf = p => p.key || (p.env && process.env[p.env]) || '';
const mask = k => !k ? '' : k.length < 10 ? '••••' : `${k.slice(0, 4)}••••${k.slice(-4)}`;
const ready = p => !!keyOf(p) && !!p.model && !!p.baseUrl;

export function settings() {
  const c = load(), def = c.providers.find(p => p.id === c.default && ready(p)) || c.providers.find(ready);
  return {
    default: def?.id || '', confirm: c.confirm, formats: FORMATS,
    providers: c.providers.map(p => ({ id: p.id, name: p.name, format: p.format, model: p.model, baseUrl: p.baseUrl, keyMask: mask(keyOf(p)), keyFrom: p.key ? '设置页' : (p.env && process.env[p.env]) ? `环境变量 ${p.env}` : '', env: p.env || '', ready: ready(p), custom: !DEFAULTS.some(d => d.id === p.id) })),
  };
}
export function setSettings(patch = {}) {
  const c = load();
  if (patch.confirm != null) c.confirm = !!patch.confirm;
  if (patch.default) { if (!c.providers.some(p => p.id === patch.default)) throw new Error('没有这个生图接口'); c.default = patch.default; }
  if (patch.id) {
    let p = c.providers.find(x => x.id === patch.id);
    if (!p) { if (!patch.name) throw new Error('新加的接口要有名字'); p = { id: patch.id, format: 'openai', sizes: 'openai' }; c.providers.push(p); }
    for (const k of ['name', 'model', 'baseUrl']) if (patch[k] != null) p[k] = String(patch[k]).trim();
    if (patch.key != null) p.key = String(patch.key).trim();
    if (patch.format && FORMATS[patch.format] && !DEFAULTS.some(d => d.id === p.id)) { p.format = patch.format; p.sizes = { openai: 'openai', gemini: 'ratio', minimax: 'ratio', dashscope: 'dashscope' }[patch.format]; }
    if (patch.remove && !DEFAULTS.some(d => d.id === p.id)) c.providers = c.providers.filter(x => x !== p);
  }
  save(c);
  return settings();
}
export const needConfirm = () => load().confirm;
function pick(id) {
  const c = load();
  const p = c.providers.find(x => x.id === (id || c.default)) || c.providers.find(ready);
  if (!p) throw new Error('还没配生图接口：到「素材库」右上角的「生图设置」里填一个');
  if (!ready(p)) throw new Error(`生图接口「${p.name}」还没配好：${!keyOf(p) ? '缺密钥' : '缺模型名'}`);
  return p;
}

async function fetchJson(url, opts, what) {
  const r = await fetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(180000) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = null; }
  if (!r.ok) throw new Error(`${what} 返回 ${r.status}：${(j?.error?.message || j?.message || j?.base_resp?.status_msg || t).toString().slice(0, 300)}`);
  if (!j) throw new Error(`${what} 返回的不是 JSON：${t.slice(0, 200)}`);
  return j;
}
async function download(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`下载生成的图片失败（${r.status}）`);
  return Buffer.from(await r.arrayBuffer());
}

// 生成一张图，返回图片数据
async function one(p, prompt, size, signal) {
  const key = keyOf(p), base = p.baseUrl.replace(/\/+$/, ''), sz = (SIZES[p.sizes] || SIZES.openai)[size] || (SIZES[p.sizes] || SIZES.openai).landscape;
  if (p.format === 'openai') {
    const body = { model: p.model, prompt, n: 1, [p.sizeParam || 'size']: sz, ...(p.extra || {}) };
    const j = await fetchJson(base.replace(/\/images\/generations$/, '') + '/images/generations', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) }, p.name);
    const d = (j.data || j.images || [])[0];
    if (d?.b64_json) return Buffer.from(d.b64_json, 'base64');
    if (d?.url) return download(d.url);
    throw new Error(`${p.name} 没有返回图片：${JSON.stringify(j).slice(0, 200)}`);
  }
  if (p.format === 'gemini') {
    const j = await fetchJson(`${base}/models/${p.model}:generateContent`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: sz } } }) }, p.name);
    const part = j.candidates?.[0]?.content?.parts?.find(x => x.inlineData || x.inline_data);
    const data = part?.inlineData?.data || part?.inline_data?.data;
    if (!data) throw new Error(`${p.name} 没有返回图片：${JSON.stringify(j).slice(0, 200)}`);
    return Buffer.from(data, 'base64');
  }
  if (p.format === 'dashscope') {
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    const t = await fetchJson(`${base}/services/aigc/text2image/image-synthesis`, { method: 'POST', signal, headers: { ...h, 'X-DashScope-Async': 'enable' }, body: JSON.stringify({ model: p.model, input: { prompt }, parameters: { size: sz, n: 1 } }) }, p.name);
    const id = t.output?.task_id; if (!id) throw new Error(`${p.name} 没有返回任务号`);
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const s = await fetchJson(`${base}/tasks/${id}`, { headers: h, signal }, p.name);
      const st = s.output?.task_status;
      if (st === 'SUCCEEDED') { const u = s.output.results?.find(x => x.url)?.url; if (!u) throw new Error(`${p.name} 任务完成但没有图片`); return download(u); }
      if (st === 'FAILED' || st === 'CANCELED' || st === 'UNKNOWN') throw new Error(`${p.name} 生成失败：${s.output?.message || st}`);
    }
    throw new Error(`${p.name} 等了 3 分钟还没生成好`);
  }
  if (p.format === 'minimax') {
    const j = await fetchJson(`${base}/image_generation`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: p.model, prompt, aspect_ratio: sz, response_format: 'base64', n: 1 }) }, p.name);
    const b = j.data?.image_base64?.[0]; if (b) return Buffer.from(b, 'base64');
    const u = j.data?.image_urls?.[0]; if (u) return download(u);
    throw new Error(`${p.name} 没有返回图片：${j.base_resp?.status_msg || JSON.stringify(j).slice(0, 200)}`);
  }
  throw new Error('不认识的接口格式：' + p.format);
}

// 生成 n 张（一张一张请求，兼容不支持 n 的接口）
export async function generate({ prompt, size = 'landscape', n = 1, provider, signal } = {}) {
  if (!String(prompt || '').trim()) throw new Error('要有画面描述');
  const p = pick(provider), out = [];
  for (let i = 0; i < Math.min(4, Math.max(1, +n || 1)); i++) out.push(await one(p, prompt.trim(), size, signal));
  return { provider: p.id, providerName: p.name, model: p.model, images: out };
}
