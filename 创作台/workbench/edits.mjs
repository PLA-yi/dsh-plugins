// 从作者的手改里学：AI 助手改完正文后，作者又把它写的段落改成了什么。
// 作者每次保存时，和最近几轮 AI 改完的样子比一比：AI 写的段落被作者改过，就记一对「AI 写的 → 作者改成」，
// 存在项目的 .workbench/edit-pairs.json（同一段反复保存只留最新的一对）。
// 攒够几对、而且停手十分钟以上，就让模型（Sonnet）找反复出现的改法（至少两处都这么改才算），直接记成卡片；AI 照着某条记忆写、作者却改回去的，那条记一次推翻。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as core from './core.mjs';
import * as ai from './ai.mjs';
import * as memory from './memory.mjs';

const plain = t => String(t || '').replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').replace(/[*_`>#|]/g, '').replace(/\s+/g, ' ').trim();
const paras = t => String(t || '').split(/\n{2,}/).map(b => b.trim()).filter(b => b && !/^!\[|^\||^<!--|^<div class=/.test(b)).map(plain).filter(p => p.length >= 12);
const bigrams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
function sim(a, b) { const A = bigrams(a), B = bigrams(b); let n = 0, ta = 0, tb = 0; for (const v of A.values()) ta += v; for (const v of B.values()) tb += v; for (const [g, v] of A) n += Math.min(v, B.get(g) || 0); return ta + tb ? (2 * n) / (ta + tb) : 0; }
const wb = dir => path.join(dir, '.workbench');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const key = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 12);

// 作者保存正文时调用：找出被作者改过的 AI 段落
export function observe(dir, text, rel = 'article.md') {
  let turns = [];
  try { turns = fs.readdirSync(wb(dir)).filter(f => /^turn-.*\.json$/.test(f)).map(f => ({ f, t: fs.statSync(path.join(wb(dir), f)).mtimeMs })).filter(x => Date.now() - x.t < 3 * 864e5).sort((a, b) => b.t - a.t).slice(0, 4); } catch { return 0; }
  const now = paras(text), nowSet = new Set(now);
  const file = path.join(wb(dir), 'edit-pairs.json'), pairs = readJ(file, []);
  let changed = 0;
  for (const { f } of turns) {
    const turn = readJ(path.join(wb(dir), f), null); if (!turn?.after?.[rel]) continue;
    const before = new Set(paras(turn.files?.[rel] || '')), after = paras(turn.after[rel]), afterSet = new Set(after);
    const fresh = now.filter(p => !afterSet.has(p));
    for (const a of after) {
      if (before.has(a) || nowSet.has(a)) continue;             // 不是 AI 写的，或者作者没动
      let best = null, bs = 0; for (const p of fresh) { const s = sim(a, p); if (s > bs) { bs = s; best = p; } }
      if (!best || bs < 0.4 || bs > 0.985) continue;
      // 只改了数字、编号、标点的不算改法（图 12 → 图 13 这种），学不出东西
      const strip = s => s.replace(/[\d０-９一二三四五六七八九十]+|[\s，。、；：！？“”「」『』（）()《》,.;:!?'"]/g, '');
      if (strip(a) === strip(best)) continue;
      const k = key(a), old = pairs.find(x => x.k === k);
      if (old) { if (old.author !== best) { old.author = best; old.t = Date.now(); old.learned = false; changed++; } }
      else { pairs.push({ k, tid: turn.id, ai: a.slice(0, 400), author: best.slice(0, 400), t: Date.now(), learned: false }); changed++; }
    }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(pairs.slice(-200), null, 2));
  return changed;
}

export function pending() {
  let n = 0; for (const p of core.list()) n += readJ(path.join(wb(p.dir), 'edit-pairs.json'), []).filter(x => !x.learned).length; return n;
}

const SYS = `你是「小易工作台」的改稿观察员。下面是 AI 助手写的段落，和作者「AI 产品小易」随后亲手改成的样子。找出作者反复在做的改法：至少两处都体现的才算，只出现一次的不要。

关注：用词（把什么词换成什么）、句式（拆长句、去掉某种开头或结尾）、语气（更口语、更克制）、删掉了什么类型的内容、加了什么类型的内容。说清“作者会把 X 改成 Y”，最好带一两个原文例子。

只对某一篇成立的（提到那篇的人物、例子、图号）scope 填 project。
已有记忆里，哪几条是 AI 照着做了、作者却改回去或改成相反写法的，放进 violates（这是记忆被推翻的证据）；哪几条是作者的改法印证了的，放进 hit。

输出一个 JSON 对象，不要别的文字：
{"add":[{"kind":"style|avoid|phrase|other","scope":"all|article|card|project","text":"一句话（60 字以内）","why":"从哪几处看出来的","detail":"例子：「AI 写的」→「作者改的」","check":"能在成稿里逐句检查的写成一句检查项（可空）","evidence":"作者手改了几处","replaces":["和它说反的已有记忆编号"]}],"hit":["已有记忆里被这些手改印证的编号"],"violates":["AI 照着做了却被作者改掉的已有记忆编号"]}
没有反复出现的改法就输出 {"add":[],"hit":[],"violates":[]}。最多 4 条。`;

// 攒够了就学一次；force 为真时不等停手
export async function learnPending({ provider, force = false, min = 3, only = null } = {}) {
  const all = [];
  for (const p of core.list()) {
    if (only && !only.includes(p.id)) continue;   // 只看指定项目（测试用）
    const file = path.join(wb(p.dir), 'edit-pairs.json'), pairs = readJ(file, []);
    const ready = pairs.filter(x => !x.learned && (force || Date.now() - x.t > 10 * 60000));
    if (ready.length) all.push({ p, file, pairs, ready });
  }
  const n = all.reduce((s, x) => s + x.ready.length, 0);
  if (n < (force ? 1 : min)) return { learned: 0, pairs: n, done: [] };
  const mem = memory.list().filter(it => it.status !== 'archived').map(it => `- (${it.id}) [${it.kind}] ${it.text}`).join('\n');
  const sample = all.flatMap(x => x.ready.map(r => ({ ...r, title: x.p.title }))).slice(-30);
  const prompt = `已有的记忆：\n${mem || '（还没有）'}\n\n作者手改过的段落（共 ${sample.length} 处）：\n${sample.map((r, i) => `${i + 1}.《${r.title.slice(0, 16)}》\n   AI 写的：${r.ai}\n   作者改成：${r.author}`).join('\n')}\n\n按要求输出 JSON。`;
  const out = String(await ai.generate({ provider: ai.cheap('mid'), system: SYS, prompt }) || ''), i = out.indexOf('{'), j = out.lastIndexOf('}');
  let o = null; try { o = JSON.parse(out.slice(i, j + 1)); } catch {}
  if (!o) throw new Error('手改学习的结果不是 JSON，再试一次');
  const proj = all.length === 1 ? all[0].p.id : '';
  const done = memory.apply({ add: o.add, hit: o.hit, miss: o.violates }, { source: 'edits', project: proj, evidence: `你手改了 ${sample.length} 处`, maxAdd: 4, ctx: { title: all.length === 1 ? all[0].p.title : '' } }).filter(x => x.op !== 'hit');
  for (const x of all) { for (const r of x.ready) r.learned = true; fs.writeFileSync(x.file, JSON.stringify(x.pairs, null, 2)); }
  return { learned: sample.length, pairs: n, done };
}
