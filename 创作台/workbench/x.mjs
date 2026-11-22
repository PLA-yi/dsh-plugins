// X（推特）官方 API v2：用「最近搜索」按账号拉新帖，给选题广场当一手素材。
// X 按读到的帖子数收费，所以：只拉上次之后的新帖、不要转发和回复、每次有条数上限、两次之间有最短间隔。
// 密钥存在 data/x.json（权限 600），也可以用环境变量 X_BEARER_TOKEN。
import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, DATA_DIR } from './core.mjs';

const FILE = path.join(DATA_DIR, 'x.json');
const API = 'https://api.x.com/2/tweets/search/recent';
// X 按读到的帖子收费，2026 年按量计费约 0.005 美元一条。这里按这个价估算花费，到了月度上限就不再读
export const PRICE = 0.005;
const month = () => new Date().toISOString().slice(0, 7);
function usage() { const u = readRaw().usage; return u?.month === month() ? u : { month: month(), reads: 0 }; }
function addUsage(n) { if (!n) return; const raw = readRaw(), u = usage(); u.reads += n; writeRaw({ ...raw, usage: u }); }
// 这个月还能读多少条
export function readsLeft() { const c = config(); return Math.max(0, Math.floor((c.budget - usage().reads * PRICE) / PRICE + 1e-9)); }
function writeRaw(o) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(o, null, 2) + '\n', { mode: 0o600 }); }
function needBudget(n) {
  const left = readsLeft();
  if (left < n) { const e = new Error(`这个月的 X 花费已到上限（${config().budget} 美元），去信息源设置里调高上限，或者等下个月`); e.budget = true; throw e; }
  return left;
}

// 默认关注的账号。official: true 的算「官方一手」，其余算「社区一手」
export const DEFAULT_ACCOUNTS = [
  ...['OpenAI', 'OpenAIDevs', 'AnthropicAI', 'claudeai', 'GoogleDeepMind', 'GoogleAI', 'AIatMeta', 'MistralAI', 'deepseek_ai', 'Alibaba_Qwen', 'Kimi_Moonshot', 'xai', 'huggingface', 'cursor_ai', 'perplexity_ai'].map(u => ({ u, official: true })),
  ...['sama', 'karpathy', 'gdb', 'demishassabis', 'ylecun', 'AndrewYNg', 'simonw', 'swyx', 'emollick', 'OfficialLoganK', 'alexalbert__', '_akhaliq'].map(u => ({ u, official: false })),
];

export function config() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  return { accounts: DEFAULT_ACCOUNTS, max: 100, everyHours: 3, budget: 5, ...c, token: c.token || process.env.X_BEARER_TOKEN || '' };
}
export function save(patch) {
  const c = { ...readRaw(), ...patch };  // 不把环境变量里的密钥写进文件
  if (patch.accounts) c.accounts = cleanAccounts(patch.accounts);
  c.max = Math.min(500, Math.max(10, +c.max || 100));
  c.everyHours = Math.max(0, c.everyHours == null ? 3 : +c.everyHours || 0);
  c.budget = Math.min(500, Math.max(0, c.budget == null ? 5 : +c.budget || 0));
  if (!c.token) delete c.token;
  if (patch.token !== undefined || patch.accounts) { delete c.sinceId; }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(FILE, 0o600);
  return publicConfig();
}
// 给网页看的：密钥只露头尾
export function publicConfig() {
  const c = config(), t = c.token;
  return { configured: !!t, token: t ? t.slice(0, 4) + '…' + t.slice(-4) : '', fromEnv: !!process.env.X_BEARER_TOKEN && !readRaw().token, accounts: c.accounts, max: c.max, everyHours: c.everyHours, lastPull: c.lastPull || null, lastCount: c.lastCount ?? null, budget: c.budget, price: PRICE, monthReads: usage().reads, monthCost: +(usage().reads * PRICE).toFixed(2), readsLeft: readsLeft() };
}
function readRaw() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } }

// 账号可以写成 "sama"、"@sama"、"OpenAI*"（* 表示官方）或 {u, official}
export function cleanAccounts(list) {
  const seen = new Set(), out = [];
  for (let a of list) {
    if (typeof a === 'string') { const s = a.trim(); a = { u: s.replace(/\*$/, ''), official: s.endsWith('*') }; }
    const u = String(a.u || '').trim().replace(/^@/, '').replace(/^https?:\/\/(x|twitter)\.com\//, '').replace(/[/?].*$/, '');
    if (!/^\w{1,15}$/.test(u) || seen.has(u.toLowerCase())) continue;
    seen.add(u.toLowerCase()); out.push({ u, official: !!a.official });
  }
  return out;
}

// 把账号拼成几条查询，每条不超过 X 的长度限制（512 字）
function queries(accounts) {
  const tail = ') -is:retweet -is:reply', out = [];
  let cur = [];
  for (const a of accounts) {
    const next = [...cur, 'from:' + a.u];
    if (('(' + next.join(' OR ') + tail).length > 500 && cur.length) { out.push('(' + cur.join(' OR ') + tail); cur = ['from:' + a.u]; }
    else cur = next;
  }
  if (cur.length) out.push('(' + cur.join(' OR ') + tail);
  return out;
}

const bigger = (a, b) => (!a ? b : !b ? a : (BigInt(a) > BigInt(b) ? a : b));
function errorOf(status, body) {
  const detail = body?.detail || body?.title || body?.errors?.[0]?.message || '';
  if (status === 401) return 'X 密钥不对或已失效（401）';
  if (status === 402) return 'X 账户额度用完了（402），去开发者后台充值';
  if (status === 403) return 'X 拒绝访问（403）：' + (detail || '这个密钥没有搜索权限');
  if (status === 429) return 'X 请求太频繁（429），过一会再刷';
  return `X 接口出错（${status}）${detail ? '：' + detail : ''}`;
}

// 拉新帖。没到间隔时间就返回 { skipped: true }，不花钱
export async function pull({ force = false, max } = {}) {
  const c = config();
  if (!c.token) { const e = new Error('还没配 X 密钥'); e.off = true; throw e; }
  if (!c.accounts.length) throw new Error('还没设关注的账号');
  if (!force && c.lastPull && Date.now() - Date.parse(c.lastPull) < c.everyHours * 3600000) return { skipped: true, items: [] };
  // since_id 只能是 7 天内的帖子；太久没拉就改成从 3 天前开始
  const fresh = c.sinceId && c.lastPull && Date.now() - Date.parse(c.lastPull) < 6 * 86400000;
  const official = new Map(c.accounts.map(a => [a.u.toLowerCase(), a.official]));
  let budget = Math.min(500, max || c.max, needBudget(10)), newest = c.sinceId || null;
  const items = [];
  const groups = queries(c.accounts);
  for (const [gi, q] of groups.entries()) {
    if (budget < 10) break;
    // 这次还能读的条数，在剩下的几组账号里平分：不然排在前面的账号把条数用光，后面的一条都读不到
    const share = Math.max(10, Math.floor(budget / (groups.length - gi)));
    const qs = new URLSearchParams({ query: q, max_results: String(Math.min(100, share)), 'tweet.fields': 'created_at,public_metrics,author_id,note_tweet,entities,attachments', expansions: 'author_id,attachments.media_keys', 'user.fields': 'username,name', 'media.fields': 'url,preview_image_url,type' });
    if (fresh) qs.set('since_id', c.sinceId); else qs.set('start_time', new Date(Date.now() - 3 * 86400000).toISOString());
    const r = await fetch(API + '?' + qs, { headers: { Authorization: 'Bearer ' + c.token }, signal: AbortSignal.timeout(20000) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(errorOf(r.status, body));
    addUsage((body.data || []).length);
    const users = new Map((body.includes?.users || []).map(u => [u.id, u]));
    const media = new Map((body.includes?.media || []).map(m => [m.media_key, m.url || m.preview_image_url]));
    for (const t of body.data || []) {
      const u = users.get(t.author_id) || {}, handle = u.username || '';
      const img = (t.attachments?.media_keys || []).map(k => media.get(k)).find(Boolean) || '';
      let txt = t.note_tweet?.text || t.text || '';
      for (const e of (t.note_tweet?.entities || t.entities)?.urls || []) txt = txt.split(e.url).join(e.expanded_url && !/^https:\/\/(x|twitter)\.com\/.*\/(photo|video)\//.test(e.expanded_url) ? e.expanded_url : '');
      txt = txt.trim();
      const firstLine = txt.replace(/https?:\/\/\S+/g, '').split('\n').map(s => s.trim()).find(Boolean) || txt;
      const m = t.public_metrics || {};
      items.push({
        title: firstLine.length > 120 ? firstLine.slice(0, 118) + '…' : firstLine,
        url: `https://x.com/${handle || 'i'}/status/${t.id}`, time: t.created_at, summary: txt.slice(0, 280), full: txt,
        tier: official.get(handle.toLowerCase()) ? 'A' : 'B', sourceName: 'X @' + handle, img,
        heat: { likes: m.like_count || 0, reposts: (m.retweet_count || 0) + (m.quote_count || 0), replies: m.reply_count || 0 },
      });
      newest = bigger(newest, t.id);
    }
    budget -= (body.data || []).length;
  }
  const raw = readRaw();
  writeRaw({ ...raw, sinceId: newest || raw.sinceId, lastPull: new Date().toISOString(), lastCount: items.length });
  return { skipped: false, items };
}

const FIELDS = { 'tweet.fields': 'created_at,public_metrics,author_id,note_tweet,entities,conversation_id', expansions: 'author_id', 'user.fields': 'username,name' };
async function call(url, qs) {
  const c = config(); if (!c.token) { const e = new Error('还没配 X 密钥'); e.off = true; throw e; }
  const r = await fetch(url + '?' + new URLSearchParams(qs), { headers: { Authorization: 'Bearer ' + c.token }, signal: AbortSignal.timeout(20000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(errorOf(r.status, body));
  return body;
}
// 一条帖子整理成文字：长帖用全文，短链接换回原链接
function render(t, users) {
  const u = users.get(t.author_id) || {}, m = t.public_metrics || {};
  let txt = t.note_tweet?.text || t.text || '';
  for (const e of (t.note_tweet?.entities || t.entities)?.urls || []) txt = txt.split(e.url).join(e.expanded_url || e.url);
  return { handle: u.username || '', name: u.name || '', time: t.created_at, text: txt.trim(), url: `https://x.com/${u.username || 'i'}/status/${t.id}`,
    metrics: `${m.like_count || 0} 赞 · ${(m.retweet_count || 0) + (m.quote_count || 0)} 转 · ${m.reply_count || 0} 回复` };
}
// 读一条帖子（算 1 条的钱）
export async function lookup(id) {
  needBudget(1);
  const b = await call(`https://api.x.com/2/tweets/${id}`, FIELDS);
  if (!b.data) throw new Error('X 上找不到这条帖子（可能删了或者是私密账号）');
  addUsage(1);
  return render(b.data, new Map((b.includes?.users || []).map(u => [u.id, u])));
}
// 按关键词搜最近 7 天的帖子（按条收费，所以条数有上限）
export async function search(query, { max = 30, from = '' } = {}) {
  const n = Math.min(100, Math.max(10, +max || 30), needBudget(10));
  let q = String(query || '').trim(); if (!q) throw new Error('要给搜索词');
  if (from) q += ' (' + String(from).split(/[\s,，]+/).filter(Boolean).map(u => 'from:' + u.replace(/^@/, '')).join(' OR ') + ')';
  if (!/is:retweet/.test(q)) q += ' -is:retweet';
  const b = await call(API, { query: q.slice(0, 512), max_results: String(n), sort_order: 'relevancy', ...FIELDS });
  addUsage((b.data || []).length);
  const users = new Map((b.includes?.users || []).map(u => [u.id, u]));
  return (b.data || []).map(t => render(t, users));
}
