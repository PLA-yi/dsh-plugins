// 记忆：让助手越用越懂作者。存在 data/memory.json。
//
// 每条记忆有：
//   tier     rule 守则（证据够多、换哪篇都成立）/ card 卡片（刚学到的、做法类的，低信心）
//   scope    all 全部 / article 只管文章 / card 只管小红书卡片 / project 只属于某一篇（project 字段是哪篇）
//   status   active 生效 / archived 已归档（不再带给助手，可以恢复）
//   why 为什么（作者的原话或理由）、detail 怎么做（具体做法、例子）、check 能自查的规则写成一句检查项
//   证据：hits 被印证几次、misses 被推翻几次、caught 自查时拦下 AI 几次、used 被带进提示几次、undone 带着它的那一轮被作者撤销几次、projects 在哪几篇里被印证过
//
// 怎么进来：作者说“记住”/手动加的直接是守则；对话后自动整理、发布后复盘、从作者手改里学到的直接生效，但先是卡片。
//   不让作者审批：每条写入都记进「最近学到」日志，作者看到不对点一下「不对」就撤。写入时查重（说的是同一件事就算印证，不新增）、
//   查冲突（新的和旧的反着来，旧的记一次推翻）、判范围（带着某篇文章的标题、专有句子、图号的，归到那一篇）。
// 怎么用：每轮按这一轮的事挑记忆（select）：固定核心（我是谁 + 几条最硬的守则）+ 和作者这句话、当前阶段、正文小标题相关的，
//   不靠助手自己来读。自查先用程序规则（lint），语义层的再让小模型查。
// 怎么升降：卡片在两篇以上文章里被印证、没被推翻过 → 守则；守则被推翻两次以上、推翻比印证多 → 卡片；卡片推翻太多 → 归档。
//   整理（consolidate）合并重复、拆开过长、归档过时，整理前留备份可撤销。
// 模型：每轮整理和自查用 Haiku，复盘、手改学习和整理用 Sonnet（见 ai.cheap）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { APP_DIR, DATA_DIR } from './core.mjs';
import * as ai from './ai.mjs';

// 测试时可以用环境变量 WB_MEMORY_FILE 指到别的文件，不碰真实记忆
const FILE = process.env.WB_MEMORY_FILE || path.join(DATA_DIR, 'memory.json');
const BAK = process.env.WB_MEMORY_FILE ? FILE + '-backups' : path.join(DATA_DIR, 'memory-backups');
export const KINDS = { profile: '我是谁', style: '写作风格', avoid: '不要这样', layout: '排版和视觉', cards: '小红书卡片', phrase: '口头说法', ideas: '想法和选题', howto: '做法和经验', other: '其他' };
export const SCOPES = { all: '全部', article: '文章', card: '卡片', project: '只这一篇' };
const RULE_KINDS = ['profile', 'style', 'avoid', 'layout', 'cards'];
const MAX_RULES = 15;
const SEED = [
  { kind: 'style', text: '文章要像真人写的：少加粗少列表，不用“不是……而是……”这类假对比，不用金句收尾，多用具体例子和数字，事实要有一手出处。' },
];
const now = () => new Date().toISOString();
const uid = () => Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
const clean = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/* ---------- 文字相似度（二元组），查重、挑记忆都用它 ---------- */
const STOP = /[\s，。、；：！？“”「」『』（）()《》【】\-—…·,.;:!?'"*_`#>|\d]/g;
const grams = s => { const t = String(s || '').replace(STOP, ''); const m = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
function sim(a, b) {
  const A = grams(a), B = grams(b); let n = 0, ta = 0, tb = 0;
  for (const v of A.values()) ta += v; for (const v of B.values()) tb += v;
  for (const [g, v] of A) n += Math.min(v, B.get(g) || 0);
  return ta + tb ? (2 * n) / (ta + tb) : 0;
}
// 查询词在记忆里覆盖了多少（不对称：查询短、记忆长时也能命中）
function overlap(query, text) {
  const Q = grams(query), T = grams(text); if (!Q.size) return 0;
  let n = 0; for (const g of Q.keys()) if (T.has(g)) n++;
  return n / Q.size;
}

/* ---------- 存取 ---------- */
function norm(it) {
  it.tier ||= 'card';
  it.scope ||= it.kind === 'cards' ? 'card' : 'all';
  if (it.status === 'pending') { it.status = 'active'; it.tier = 'card'; }   // 以前等作者确认的：直接当卡片生效
  it.status ||= 'active';
  for (const k of ['hits', 'misses', 'caught', 'used', 'undone']) it[k] = +it[k] || 0;
  if (!it.hits && it.status === 'active') it.hits = 1;
  it.projects ||= it.project ? [it.project] : [];
  it.why ??= ''; it.detail ??= ''; it.check ??= '';
  return it;
}
function load() {
  try { const d = JSON.parse(fs.readFileSync(FILE, 'utf8')); d.auto ??= true; d.items = (d.items || []).map(norm); d.log ||= []; return d; }
  catch { const d = { auto: true, items: SEED.map(x => norm({ id: uid(), ...x, source: 'seed', tier: 'rule', hits: 3, t: now() })), log: [] }; save(d); return d; }
}
function save(d) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); d.log = (d.log || []).slice(-300); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }
// 「最近学到」日志：每次写入记一条，作者可以事后撤
function logOp(d, e) { d.log.push({ lid: uid(), t: now(), ...e }); return d.log[d.log.length - 1]; }

export function list() { return load().items; }
export function recent(n = 60) { return load().log.slice(-n).reverse(); }
export function state() {
  const d = load(), a = d.items.filter(x => x.status === 'active');
  return { auto: d.auto, report: d.report || null, canUndo: !!d.report?.backup && fs.existsSync(d.report.backup), counts: { rules: a.filter(x => x.tier === 'rule').length, cards: a.filter(x => x.tier === 'card').length, archived: d.items.length - a.length } };
}
export const autoOn = () => load().auto !== false;
export function setAuto(on) { const d = load(); d.auto = !!on; save(d); return d.auto; }

/* ---------- 范围判定：带着某一篇的专有内容，就只归那一篇 ---------- */
// ctx: { project, title, body }（body 是那篇的正文，可空）
export function guessScope(text, ctx = {}) {
  if (!ctx.project) return null;
  const t = String(text || '');
  if (/图\s?\d+|表\s?\d+|第\s?\d+\s?节|0\d\s?节/.test(t)) return 'project';                    // 指着具体图号、节号
  const quoted = [...t.matchAll(/[「“『]([^」”』]{3,40})[」”』]/g)].map(m => m[1]);
  if (ctx.body && quoted.some(q => q.length >= 4 && ctx.body.includes(q) && !/^(不是|而是|换句话说|原因很简单|我猜|没查到)/.test(q))) return 'project';   // 引的是这篇里的原话
  if (ctx.title) {
    const words = String(ctx.title).split(/[\s，。！？：、·,.!?:]+/).filter(w => w.length >= 3 && !/^(文章|拆解|解读|万字|日活)$/.test(w));
    if (words.some(w => t.includes(w))) return 'project';                                        // 点名了这篇的题目
  }
  return null;
}

/* ---------- 写入 ---------- */
// 作者亲口说的、手动加的直接当守则；后台学到的先当卡片，用证据升
const DIRECT = ['manual', 'user', 'agent', 'seed'];
export function add({ text, kind = 'other', source = 'manual', project = '', evidence = '', why = '', detail = '', tier, scope, check = '', replaces = [], ctx = {} } = {}) {
  text = clean(text, 300); if (!text) throw new Error('记忆内容不能为空');
  const d = load();
  kind = KINDS[kind] ? kind : 'other';
  // 查重：和已有的说的是同一件事，就算印证一次，不新增（有更详细的做法就补进去）
  const live = d.items.filter(x => x.status !== 'archived');
  let same = live.find(x => x.text === text);
  // 门槛按实测定：同义改写一般在 0.45–0.62，真正不同的两条都在 0.3 以下；同一种类放宽到 0.45，不同种类要 0.6
  if (!same) { let best = null, bs = 0; for (const x of live) { const s = sim(x.text, text); if (s > bs) { bs = s; best = x; } } if (best && (bs >= 0.6 || (bs >= 0.45 && best.kind === kind))) same = best; }
  if (same) {
    same.hits++; same.t = now(); if (project && !same.projects.includes(project)) same.projects.push(project);
    if (detail && detail.length > (same.detail || '').length) same.detail = clean(detail, 1200);
    if (check && !same.check) same.check = clean(check, 160);
    if (why && !same.why) same.why = clean(why, 200);
    const pr = promoteIfReady(same); logOp(d, { op: 'hit', memId: same.id, text: same.text, source, project, dup: text });
    if (pr) logOp(d, { op: pr, memId: same.id, text: same.text, source, project });
    save(d); return Object.assign(same, { _dup: true });
  }
  const direct = DIRECT.includes(source);
  scope = SCOPES[scope] ? scope : (kind === 'cards' ? 'card' : 'all');
  if (scope !== 'project' && !direct) { const g = guessScope(text, { project, ...ctx }); if (g) scope = g; }
  const it = norm({ id: uid(), kind, text, why: clean(why, 200), detail: clean(detail, 1200), check: clean(check, 160),
    tier: tier === 'rule' || tier === 'card' ? tier : (direct && RULE_KINDS.includes(kind) ? 'rule' : 'card'),
    scope, project: scope === 'project' ? project : (project || ''), projects: project ? [project] : [], status: 'active', source, evidence: clean(evidence, 200), hits: direct ? 2 : 1, t: now(), created: now() });
  d.items.push(it);
  // 冲突：新的和旧的反着来，旧的记一次推翻（多了会自动降级）
  const conflicts = [];
  for (const rid of (replaces || []).slice(0, 4)) { const old = d.items.find(x => x.id === rid && x.status === 'active'); if (!old || old === it) continue; old.misses++; old.t = now(); conflicts.push(old.id); const dm = demoteIfDue(old); if (dm) logOp(d, { op: dm, memId: old.id, text: old.text, source, project }); }
  logOp(d, { op: 'add', memId: it.id, text: it.text, kind, tier: it.tier, scope: it.scope, source, project, ...(conflicts.length ? { conflictWith: conflicts } : {}) });
  save(d); return it;
}
export function update(id, patch = {}, { source = 'manual' } = {}) {
  const d = load(), it = d.items.find(x => x.id === id); if (!it) throw new Error('没有这条记忆');
  const prev = { text: it.text, tier: it.tier, scope: it.scope, status: it.status, why: it.why, detail: it.detail, check: it.check, kind: it.kind };
  if (patch.text != null) { const t = clean(patch.text, 300); if (!t) throw new Error('记忆内容不能为空'); it.text = t; }
  if (patch.kind && KINDS[patch.kind]) it.kind = patch.kind;
  if (patch.tier === 'rule' || patch.tier === 'card') it.tier = patch.tier;
  if (patch.scope && SCOPES[patch.scope]) it.scope = patch.scope;
  if (patch.project != null) it.project = patch.project;
  if (['active', 'archived'].includes(patch.status)) it.status = patch.status;
  for (const k of ['why', 'detail', 'check', 'evidence']) if (patch[k] != null) it[k] = clean(patch[k], k === 'detail' ? 1200 : 200);
  it.t = now();
  const changed = Object.keys(prev).some(k => prev[k] !== it[k]);
  if (changed) logOp(d, { op: patch.status === 'archived' ? 'archive' : patch.status === 'active' && prev.status === 'archived' ? 'restore' : 'update', memId: it.id, text: it.text, prev, source });
  save(d); return it;
}
export function remove(id) { const d = load(); const it = d.items.find(x => x.id === id); if (!it) throw new Error('没有这条记忆'); d.items = d.items.filter(x => x.id !== id); logOp(d, { op: 'remove', memId: id, text: it.text, prev: it, source: 'manual' }); save(d); return { ok: true }; }
// 作者点「不对」：撤掉日志里的那一笔
export function revert(lid) {
  const d = load(), e = d.log.find(x => x.lid === lid); if (!e) throw new Error('找不到这条记录'); if (e.revoked) return { ok: true };
  const it = d.items.find(x => x.id === e.memId);
  if (e.op === 'add') { d.items = d.items.filter(x => x.id !== e.memId); for (const c of e.conflictWith || []) { const o = d.items.find(x => x.id === c); if (o && o.misses > 0) o.misses--; } }
  else if ((e.op === 'update' || e.op === 'archive' || e.op === 'restore') && it && e.prev) Object.assign(it, e.prev);
  else if (e.op === 'remove' && e.prev && !it) d.items.push(norm(e.prev));
  else if (e.op === 'hit' && it) { it.hits = Math.max(0, it.hits - 1); }
  else if (e.op === 'miss' && it) { it.misses = Math.max(0, it.misses - 1); }
  else if (e.op === 'promote' && it) it.tier = 'card';
  else if (e.op === 'demote' && it) it.tier = 'rule';
  e.revoked = true; e.revokedAt = now(); save(d); return { ok: true };
}

/* ---------- 证据与升降级 ---------- */
const evidence = it => it.hits + it.caught * 0.3 - it.misses * 2 - it.undone * 0.5;
function promoteIfReady(it) {
  if (it.tier !== 'card' || !RULE_KINDS.includes(it.kind) || it.scope === 'project' || it.misses > 0) return null;
  if (it.hits >= 3 && it.projects.length >= 2) { it.tier = 'rule'; return 'promote'; }
  return null;
}
function demoteIfDue(it) {
  if (it.source === 'seed') return null;
  if (it.tier === 'rule' && it.misses >= 2 && it.misses >= it.hits) { it.tier = 'card'; return 'demote'; }
  if (it.tier === 'card' && it.misses >= 3 && it.misses > it.hits) { it.status = 'archived'; it.archivedWhy = '被推翻太多次'; return 'archive'; }
  return null;
}
// what: hit 印证 / miss 推翻 / caught 自查拦下 / undone 带着它的那一轮被撤销了
export function mark(id, what, { project = '', source = 'auto' } = {}) {
  const d = load(), it = d.items.find(x => x.id === id); if (!it || it.status !== 'active') return null;
  if (what === 'hit') { it.hits++; if (project && !it.projects.includes(project)) it.projects.push(project); }
  else if (what === 'miss') it.misses++;
  else if (what === 'caught') it.caught++;
  else if (what === 'undone') { it.undone++; if (it.undone % 2 === 0) it.misses++; }   // 两次撤销算一次推翻
  it.t = now();
  const op = what === 'hit' ? promoteIfReady(it) : demoteIfDue(it);
  if (what === 'hit' || what === 'miss') logOp(d, { op: what, memId: it.id, text: it.text, source, project });
  if (op) logOp(d, { op, memId: it.id, text: it.text, source, project });
  save(d); return op ? { op, id, kind: it.kind, text: it.text } : null;
}
// 助手按需读卡片全文（保留；平时靠 select 自动带）
export function recall(ids = []) {
  const d = load(), out = [];
  for (const id of ids.slice(0, 8)) { const it = d.items.find(x => x.id === id); if (!it) continue; it.used++; it.lastUsed = now(); out.push(it); }
  save(d); return out;
}

/* ---------- 按这一轮的事挑记忆 ---------- */
const fits = (it, type, project) => it.status === 'active' && (it.scope === 'all' || it.scope === type || (it.scope === 'project' && it.project && it.project === project));
// 阶段：由作者这句话和当前在干什么判断；每个阶段有一组关键词和偏向的种类
const STAGES = {
  outline: { words: '大纲 框架 结构 分几节 小标题 标题 目录 章节 开头 结尾 收尾 钩子 切入', kinds: ['style', 'layout'] },
  title: { words: '标题 题目 小标题 大标题 吸睛 简洁', kinds: ['style', 'avoid'] },
  images: { words: '配图 图片 插图 封面 图注 水印 动图 截图 示意图 像素 生图 素材', kinds: ['layout', 'howto'] },
  polish: { words: '润色 口语 AI 味 精简 改短 压缩 去掉 删 啰嗦 书面 语气 像我', kinds: ['style', 'avoid', 'phrase'] },
  research: { words: '资料 查 来源 出处 数据 官方 核实', kinds: ['howto'] },
  card: { words: '卡片 封面 页 版式 小红书', kinds: ['cards', 'layout'] },
  write: { words: '写 正文 展开 这一节 段落', kinds: ['style', 'avoid'] },
};
export function detectStage(message = '', type = 'article') {
  const m = String(message || '');
  let best = type === 'card' ? 'card' : 'write', bs = 0;
  for (const [k, s] of Object.entries(STAGES)) { const n = s.words.split(' ').filter(w => m.includes(w)).length; if (n > bs) { bs = n; best = k; } }
  return best;
}
// 返回 { block, ids }：block 拼进系统提示；ids 是这一轮带了哪些（记到 turn 上，好做印证/推翻）
export function select({ type = 'article', project = '', message = '', stage, headings = '', limit = 14 } = {}) {
  const d = load(), items = d.items.filter(it => fits(it, type, project));
  if (!items.length) return { block: '', ids: [], stage: stage || 'write' };
  stage ||= detectStage(message, type);
  const st = STAGES[stage] || STAGES.write;
  const query = `${message} ${st.words} ${String(headings || '').slice(0, 600)}`;
  const picked = new Map(), why = {};
  const take = (it, reason) => { if (!picked.has(it.id)) { picked.set(it.id, it); why[it.id] = reason; } };
  // 固定核心：我是谁 + 证据最足的几条守则
  items.filter(it => it.kind === 'profile').forEach(it => take(it, 'core'));
  items.filter(it => it.tier === 'rule' && it.scope !== 'project' && it.kind !== 'phrase').sort((a, b) => evidence(b) - evidence(a)).slice(0, 4).forEach(it => take(it, 'core'));
  // 这篇的约定、作者的口头说法：都短，全带
  items.filter(it => it.scope === 'project').forEach(it => take(it, 'project'));
  items.filter(it => it.kind === 'phrase').forEach(it => take(it, 'phrase'));
  // 和这一轮相关的：按文字重合度 + 阶段偏向的种类 + 证据排
  const rel = items.filter(it => !picked.has(it.id)).map(it => {
    const text = `${it.text} ${it.detail} ${it.why} ${it.check}`;
    let s = overlap(message, text) * 2 + overlap(st.words, text) + (st.kinds.includes(it.kind) ? 0.25 : 0) + (headings ? overlap(headings, text) * 0.5 : 0) + Math.min(evidence(it), 6) * 0.03;
    if (it.kind === 'ideas') s *= 0.3;
    return { it, s };
  }).sort((a, b) => b.s - a.s);
  for (const { it, s } of rel) { if (picked.size >= limit) break; if (s < 0.12) break; take(it, 'rel'); }
  // 还有空位：把剩下的守则按证据补进来
  for (const it of items.filter(it => it.tier === 'rule' && !picked.has(it.id)).sort((a, b) => evidence(b) - evidence(a))) { if (picked.size >= limit + 4) break; take(it, 'rule'); }
  const ids = [...picked.keys()];
  for (const id of ids) { const it = d.items.find(x => x.id === id); if (it && why[id] !== 'core') { it.used++; it.lastUsed = now(); } }
  save(d);
  const one = it => `- (${it.id}) ${it.text}${it.detail ? `\n  怎么做：${it.detail.slice(0, 300)}` : ''}${it.why ? `\n  为什么：${it.why.slice(0, 100)}` : ''}`;
  const group = (f, title) => { const xs = ids.map(id => picked.get(id)).filter(f); return xs.length ? `${title}\n${xs.map(one).join('\n')}` : ''; };
  const parts = [
    group(it => why[it.id] === 'core' || why[it.id] === 'rule', '【守则】每次都要遵守：'),
    group(it => why[it.id] === 'project', '【这篇的约定】只对这篇成立，优先于守则：'),
    group(it => why[it.id] === 'phrase', '【作者的口头说法】作者这么说时，指的是这个意思：').replace(/\n  怎么做：/g, ' → '),
    group(it => why[it.id] === 'rel', `【和这一轮相关的经验】按你现在要做的事挑出来的（${({ outline: '出大纲', title: '改标题', images: '配图', polish: '润色', research: '查资料', card: '做卡片', write: '写正文' })[stage] || stage}）：`),
  ].filter(Boolean);
  return { block: parts.join('\n\n'), ids, stage };
}

/* ---------- 自查：先程序规则，再语义 ---------- */
// 程序能直接查的套路。每条：找到就报，id 尽量对到一条记忆（有就带，没有就空）
const LINT = [
  { re: /不是[^。！？\n]{1,20}而是/, problem: '假对比“不是……而是……”', fix: '直接说是什么' },
  { re: /换句话说|原因很简单|不难发现|值得注意的是|可以说，|说白了/, problem: '书面腔连接语', fix: '删掉，直接说内容' },
  { re: /^(总而言之|总之|综上|最后，让我们|让我们拭目以待)/m, problem: '总结式收尾', fix: '正文说完直接停，或接参考资料' },
  { re: /我猜|我没查到|没查到|没见到|心里没底|第三方复测|我把官方页.{0,6}读了一遍/, problem: '自我交代核实经过、存疑句', fix: '删掉，直接陈述事实' },
  { re: /^#{1,3} .*(？|\?)\s*$/m, problem: '标题是问句，读者看不出这节讲什么', fix: '改成直接给结论的陈述句' },
  { re: /^#{1,3} .*(怎么算|凭什么|是什么回事|为什么)\s*$/m, problem: '标题留谜语', fix: '把答案写进标题' },
  { re: /^#{1,3} .*[：:].{12,}$/m, problem: '标题用冒号拼成两段的长标题', fix: '一句话一个意思，去掉一段' },
  { re: /<p class="cap">[^<]*(来源|出自|图源|据)/, problem: '图注里写来源', fix: '图注只说这是什么' },
  { re: /一是[^。\n]{2,60}二是|首先[^。\n]{2,80}其次|第一[，,][^。\n]{2,60}第二[，,]/, problem: '编号串', fix: '拆成自然段，各段开头换说法' },
  { re: /(主要靠的就是|最[^，。]{1,6}的事之一[，,]?就是)/, problem: '强调句式', fix: '改成平实直说' },
];
const SKIP = /^(#|!\[|\||<div|<p class="(toc|src)|- |\d+\. )/;
export function lint(text, { type = 'article' } = {}) {
  const t = String(text || ''), issues = [], mems = list().filter(x => x.status === 'active' && x.check);
  for (const L of LINT) {
    const re = new RegExp(L.re.source, L.re.flags.includes('g') ? L.re.flags : L.re.flags + 'g');
    let m, n = 0;
    while ((m = re.exec(t)) && n < 3) {
      const lineStart = t.lastIndexOf('\n', m.index) + 1, lineEnd = t.indexOf('\n', m.index), line = t.slice(lineStart, lineEnd < 0 ? t.length : lineEnd).trim();
      if (type === 'article' && SKIP.test(line) && !/^#/.test(line)) { n++; continue; }
      const sent = line.length <= 90 ? line : (line.slice(Math.max(0, m.index - lineStart - 30), m.index - lineStart + m[0].length + 30));
      const mem = mems.find(x => x.check.includes(L.problem.slice(0, 4)) || x.text.includes(L.problem.slice(0, 4)) || (L.problem.includes('标题') && /标题/.test(x.check)));
      issues.push({ id: mem?.id || '', quote: sent, problem: L.problem, fix: L.fix, auto: true }); n++;
    }
  }
  // 同一句只报一次
  const seen = new Set(); return issues.filter(x => { const k = x.quote.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
}
// 给小模型查的检查项：和这段文字相关的、或者一直在起作用的，最多 14 条
export function checklist(type = 'article', project = '', { query = '' } = {}) {
  const xs = list().filter(it => fits(it, type, project) && it.check && ['avoid', 'style', 'layout', 'cards'].includes(it.kind));
  const scored = xs.map(it => ({ it, s: (query ? overlap(it.check + ' ' + it.text, query) : 0) + Math.min(it.caught, 10) * 0.05 + (it.tier === 'rule' ? 0.1 : 0) })).sort((a, b) => b.s - a.s);
  return scored.slice(0, 14).map(({ it }) => ({ id: it.id, check: it.check, text: it.text }));
}

/* ---------- 每轮对话后：整理出记忆，印证或推翻已有的 ---------- */
const SYS = `你是「创作台」的记忆整理员。作者在和 AI 助手一起写公众号文章、做小红书卡片。每轮对话结束后，你判断这一轮里有没有值得长期记住的东西，以及已有的记忆被印证还是被推翻了。

记忆的种类（kind）：
- profile 我是谁：身份、读者、账号定位
- style 写作风格：喜欢的写法、语气、用词、结构
- avoid 不要这样：明确不喜欢、撤销过、否定过的做法
- layout 排版和视觉：版式、配色、配图、图注
- cards 小红书卡片：卡片的文案、版式、封面
- phrase 口头说法：作者常用的模糊说法实际指什么（如“AI 感太重”→逐句去掉强调句、预告句、编号串）
- ideas 想法和选题：观点、判断、想写的题目
- howto 做法和经验：验证过好用的做法、流程、工具

范围（scope）：all 所有作品都成立；article 只管文章；card 只管卡片；project 只对这一篇成立。只对这一篇成立的内容（提到这篇的人物、例子、图号、小节、专有说法）一律 project，不要写成全局的。

每条要写：text 一句话说清（60 字以内，单独拿出来也看得懂，不要带“本篇”“这次”）；why 为什么（作者的原话或理由）；detail 怎么做（具体做法、例子，可空）；check 如果能在成稿里逐句检查，写成一句检查项，不能检查就留空。
新的记忆和已有的某条说反了（比如以前说标题要带数字，这次作者说别堆数字），在那条 add 里写 replaces: ["旧编号"]，不要只新增不处理旧的。

判断依据以作者说的话、作者的选择、作者撤销了什么为准；AI 助手的回复只当上下文。一次性的修改要求（“把这段改短”“这里换个词”）不要记。作者只是没反对，不算印证；作者明确夸了、照着做了、选了，才算。

输出一个 JSON 对象，不要别的文字：
{"add":[{"kind":"style","scope":"all","text":"…","why":"…","detail":"…","check":"…","evidence":"作者原话，20 字以内","replaces":[]}],
 "update":[{"id":"已有编号","text":"合并或修正后的完整说法"}],
 "hit":["这一轮作者的话或选择明确印证了的已有记忆编号"],
 "miss":["这一轮作者明确否定、撤销、和它反着来的已有记忆编号"]}
每轮最多新增 3 条；和已有记忆说的是一回事时用 update 或 hit，不要重复新增。没有就输出空数组。`;

function parseJ(out) { const s = String(out || ''), i = s.indexOf('{'), j = s.lastIndexOf('}'); if (i < 0 || j <= i) return null; try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; } }
const indexOf = items => items.filter(it => it.status !== 'archived').map(it => `- (${it.id}) [${it.kind}/${it.tier === 'rule' ? '守则' : '卡片'}/${it.scope}] ${it.text}`).join('\n') || '（还没有）';
// 小模型先试，结果不是 JSON 就换中档模型再来一次
async function askJSON(system, prompt, tier = 'fast') {
  let o = parseJ(await ai.generate({ provider: ai.cheap(tier), system, prompt }));
  if (!o && tier === 'fast') o = parseJ(await ai.generate({ provider: ai.cheap('mid'), system, prompt }));
  return o;
}

// turn：{ message, reply, steps, files, undone, decisions:[{title,answer}], kind:'article'|'card', title, body }
// 返回这次改了什么：[{ op, id, kind, text }]
export async function memorize(turn, { project = '' } = {}) {
  if (!autoOn()) return [];
  const prompt = `已有的记忆：\n${indexOf(list())}\n\n这一轮（${turn.kind === 'card' ? '小红书卡片' : '文章'}《${turn.title || ''}》，项目 id「${project}」）：
作者说：${String(turn.message || '').slice(0, 2000)}
${turn.decisions?.length ? `作者在卡片上的决定：\n${turn.decisions.map(d => `- ${d.title} → ${d.answer}`).join('\n')}\n` : ''}AI 助手做了：${(turn.steps || []).map(s => s.text).join('；').slice(0, 800) || '（没有动手）'}
${turn.files?.length ? `改了文件：${turn.files.join('、')}\n` : ''}${turn.undone ? '作者把这一轮的改动撤销了。\n' : ''}AI 助手的回复（只当上下文）：${String(turn.reply || '').slice(0, 1500)}`;
  const o = await askJSON(SYS, prompt, 'fast');
  if (!o) return [];
  return apply(o, { source: 'auto', project, evidence: String(turn.message || '').slice(0, 40), ctx: { title: turn.title, body: turn.body } });
}
// 把整理结果落进记忆（复盘、手改学习也用）；ctx = { title, body } 用来判范围
export function apply(o, { source = 'auto', project = '', evidence = '', maxAdd = 3, ctx = {} } = {}) {
  const done = [], items = list();
  for (const u of (o.update || []).slice(0, 6)) { const it = items.find(x => x.id === u?.id); if (it && u.text && clean(u.text, 300) !== it.text) { update(it.id, { text: u.text, ...(u.why ? { why: u.why } : {}), ...(u.detail ? { detail: u.detail } : {}), ...(u.check ? { check: u.check } : {}) }, { source }); done.push({ op: 'update', id: it.id, kind: it.kind, text: clean(u.text, 300) }); } }
  for (const id of (o.hit || []).slice(0, 8)) { const it = items.find(x => x.id === id); if (!it) continue; const r = mark(id, 'hit', { project, source }); done.push({ op: 'hit', id, kind: it.kind, text: it.text }); if (r) done.push(r); }
  for (const id of (o.miss || []).slice(0, 5)) { const it = items.find(x => x.id === id); if (!it) continue; const r = mark(id, 'miss', { project, source }); done.push({ op: 'miss', id, kind: it.kind, text: it.text }); if (r) done.push(r); }
  for (const a of (o.add || []).slice(0, maxAdd)) {
    if (!a?.text) continue;
    const it = add({ text: a.text, kind: a.kind, scope: a.scope, why: a.why, detail: a.detail, check: a.check, source, project, evidence: a.evidence || evidence, replaces: Array.isArray(a.replaces) ? a.replaces : [], ctx });
    done.push({ op: it._dup ? 'hit' : 'add', id: it.id, kind: it.kind, text: it.text, ...(it.tier === 'rule' && !it._dup ? { tier: 'rule' } : {}) });
  }
  return done;
}

/* ---------- 整理：合并重复、拆开过长、分好层和范围、归档过时；整理前留备份 ---------- */
const TIDY = `你是「创作台」的记忆管理员，给作者的 AI 写作助手整理记忆。目标：守则少而硬，卡片具体可用，只对一篇成立的归到那一篇，互相打架的合成一条，过时的归档。

规则：
- 守则（tier=rule）：换哪篇文章都成立、证据够多（在两篇以上文章里印证过，或作者亲口说的 source=manual/agent/seed）。要短（一句话，40 字左右）。证据不够的一律降成卡片。总数不超过 15 条。
- 卡片（tier=card）：刚学到的、做法流程、案例、操作细节。
- 一条太长、混了好几件事的，拆开：核心要求留在 text，具体做法和例子放进 detail；混了两件不同的事就拆成两条（用 split）。
- 说的是同一件事的，合并成一条（merge），保留最完整的说法，hits 会相加。
- 互相矛盾的（比如一条说标题要带数字吸睛、一条说标题要简洁别堆数字），按作者最后一次的说法合成一条，把矛盾的旧说法去掉；拿不准作者最后要什么，就把两种说法的适用条件都写进 detail。
- 只对某一篇作品成立的（提到那篇的人物、例子、图号、小节、专有说法、某篇的配图处理），scope 改成 project，project 填它的项目 id；没有长期价值的归档（archive）。
- 每条补上 why（为什么，能从 evidence 或原文看出来就写）；能在成稿里逐句检查的写作规则，补上 check（一句检查项）。
- 种子条目（source=seed）不要归档，可以改写。

输出一个 JSON 对象，不要别的文字：
{"edit":[{"id":"…","text":"…","why":"…","detail":"…","check":"…","kind":"…","tier":"rule|card","scope":"all|article|card|project","project":"…"}],
 "merge":[{"ids":["…","…"],"text":"…","why":"…","detail":"…","check":"…","kind":"…","tier":"…","scope":"…","project":"…"}],
 "split":[{"id":"…","into":[{"text":"…","why":"…","detail":"…","check":"…","kind":"…","tier":"…","scope":"…"}]}],
 "archive":[{"id":"…","reason":"一句话"}],
 "summary":"这次整理做了什么，两三句话，给作者看"}
edit 里只写要改的字段；不用动的条目不要出现。`;
export async function consolidate({ projects = [] } = {}) {
  const d = load(), live = d.items.filter(it => it.status !== 'archived');
  if (!live.length) return { summary: '还没有记忆', changes: 0 };
  fs.mkdirSync(BAK, { recursive: true });
  const backup = path.join(BAK, now().replace(/[:.]/g, '-') + '.json'); fs.writeFileSync(backup, JSON.stringify(d, null, 2));
  for (const f of fs.readdirSync(BAK).sort().slice(0, -10)) fs.rmSync(path.join(BAK, f), { force: true });
  const proj = projects.length ? `作者的作品（项目 id → 标题）：\n${projects.map(p => `- ${p.id} → 《${p.title}》`).join('\n')}\n\n` : '';
  const dump = live.map(it => JSON.stringify({ id: it.id, kind: it.kind, tier: it.tier, scope: it.scope, project: it.project || undefined, source: it.source, hits: it.hits, misses: it.misses, projects: it.projects.length, created: (it.created || it.t || '').slice(0, 10), text: it.text, why: it.why || undefined, detail: it.detail || undefined, evidence: it.evidence || undefined })).join('\n');
  const o = await askJSON(TIDY, `${proj}现在的记忆（一行一条）：\n${dump}\n\n按要求输出 JSON。`, 'mid');
  if (!o) throw new Error('整理结果不是 JSON，再试一次');
  const cur = load(), by = id => cur.items.find(x => x.id === id), lines = [];
  const fields = (x, s) => { if (s.text) x.text = clean(s.text, 300); for (const k of ['why', 'check']) if (s[k] != null) x[k] = clean(s[k], 200); if (s.detail != null) x.detail = clean(s.detail, 1200); if (KINDS[s.kind]) x.kind = s.kind; if (s.tier === 'rule' || s.tier === 'card') x.tier = s.tier; if (SCOPES[s.scope]) x.scope = s.scope; if (s.project != null && x.scope === 'project') x.project = String(s.project); x.t = now(); };
  for (const e of o.edit || []) { const x = by(e?.id); if (!x) continue; fields(x, e); lines.push({ op: 'edit', text: x.text }); }
  for (const m of o.merge || []) {
    const xs = (m?.ids || []).map(by).filter(Boolean); if (xs.length < 2) continue;
    const keep = xs[0];
    fields(keep, m); keep.hits = xs.reduce((n, x) => n + x.hits, 0); keep.misses = xs.reduce((n, x) => n + x.misses, 0); keep.caught = xs.reduce((n, x) => n + x.caught, 0); keep.used = xs.reduce((n, x) => n + x.used, 0);
    keep.projects = [...new Set(xs.flatMap(x => x.projects))]; keep.status = 'active';
    cur.items = cur.items.filter(x => x === keep || !xs.includes(x)); lines.push({ op: 'merge', n: xs.length, text: keep.text });
  }
  for (const sp of o.split || []) {
    const x = by(sp?.id); if (!x || !Array.isArray(sp.into) || sp.into.length < 2) continue;
    const parts = sp.into.map(s => { const y = norm({ ...x, id: uid(), hits: x.hits, misses: 0, caught: 0, used: 0, undone: 0, projects: [...x.projects], why: '', detail: '', check: '' }); fields(y, s); return y; });
    cur.items.splice(cur.items.indexOf(x), 1, ...parts); lines.push({ op: 'split', n: parts.length, text: x.text });
  }
  for (const a of o.archive || []) { const x = by(a?.id); if (!x || x.source === 'seed') continue; x.status = 'archived'; x.archivedWhy = clean(a.reason, 100); x.t = now(); lines.push({ op: 'archive', text: x.text }); }
  // 守则的证据门槛，模型漏掉的这里兜底；超过上限按证据留前 15
  for (const x of cur.items) if (x.status === 'active' && x.tier === 'rule' && x.scope !== 'project' && !DIRECT.includes(x.source) && !(x.hits >= 3 && x.projects.length >= 2)) { x.tier = 'card'; lines.push({ op: 'demote', text: x.text }); }
  const rules = cur.items.filter(x => x.status === 'active' && x.tier === 'rule' && x.scope !== 'project').sort((a, b) => evidence(b) - evidence(a));
  for (const x of rules.slice(MAX_RULES)) { x.tier = 'card'; lines.push({ op: 'demote', text: x.text }); }
  // 很久没用、没印证过的卡片归档（可恢复）
  const old = Date.now() - 45 * 864e5;
  for (const x of cur.items) if (x.status === 'active' && x.tier === 'card' && x.source !== 'seed' && x.hits <= 1 && x.used === 0 && Date.parse(x.created || x.t || 0) < old) { x.status = 'archived'; x.archivedWhy = '45 天没用到'; lines.push({ op: 'archive', text: x.text }); }
  cur.report = { t: now(), backup, summary: clean(o.summary, 400), lines: lines.slice(0, 80), changes: lines.length };
  logOp(cur, { op: 'tidy', text: cur.report.summary, source: 'tidy', changes: lines.length });
  save(cur);
  return cur.report;
}
export function undoConsolidate() {
  const d = load(); const b = d.report?.backup; if (!b || !fs.existsSync(b)) throw new Error('没有可以撤销的整理');
  const old = JSON.parse(fs.readFileSync(b, 'utf8')); old.report = null; old.log = d.log.filter(e => e.op !== 'tidy' || e.t < d.report.t); save(old); fs.rmSync(b, { force: true }); return { ok: true };
}
