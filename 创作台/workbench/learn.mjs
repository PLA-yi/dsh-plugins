// 复盘已发布的作品：让 AI 助手越写越顺手。
// 一篇文章 / 一组卡片标成「已发布」后，后台复盘一次：
//   读：发布时的成稿、从初稿到成稿改过的段落（历史版本里比出来）、作者删掉的段落、
//       作者和助手的全部对话、作者在卡片上做的决定、作者撤销过的改动
//   出：① 作品档案（写了什么、切入角度、结构、标题怎么起、这篇做得好的地方、几段作者认可的原文）存进 data/works.json
//       ② 换一篇也成立的偏好和经验，合并进全局记忆（和已有的去重、能合并就合并）
// 写下一篇时，助手的系统提示里会带上最近几篇的作品档案和原文片段（见 promptBlock）。
// 自动复盘跟着「AI 记忆」里的“自动整理”开关走；关掉以后只能手动复盘。
import fs from 'node:fs';
import path from 'node:path';
import * as core from './core.mjs';
import * as ai from './ai.mjs';
import * as memory from './memory.mjs';

const FILE = path.join(core.DATA_DIR, 'works.json');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const list = () => readJ(FILE, []);
const saveAll = l => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(l, null, 2)); };
export function remove(id) { saveAll(list().filter(w => w.id !== id)); return { ok: true }; }

const plain = t => String(t || '').replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').replace(/[*_`>#|]/g, '').replace(/\s+/g, ' ').trim();
const paras = t => String(t || '').split(/\n{2,}/).map(b => b.trim()).filter(b => b && !/^!\[|^\||^<!--|^<div class="(sources|mast|toc)/.test(b)).map(b => ({ raw: b, p: plain(b) })).filter(x => x.p.length >= 16);
const bigrams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
function sim(a, b) {
  const A = bigrams(a), B = bigrams(b); let n = 0, ta = 0, tb = 0;
  for (const v of A.values()) ta += v; for (const v of B.values()) tb += v;
  for (const [g, v] of A) n += Math.min(v, B.get(g) || 0);
  return ta + tb ? (2 * n) / (ta + tb) : 0;
}

// 从历史版本里比出“改过的段落”和“删掉的段落”
export function revisions(dir, mainFile, finalText) {
  const vd = path.join(dir, '.workbench', 'versions');
  let files = []; try { files = fs.readdirSync(vd).filter(f => f.includes('__' + mainFile.replace(/\//g, '_'))).sort(); } catch {}
  const fin = paras(finalText);
  if (!files.length || !fin.length) return { pairs: [], dropped: [], versions: files.length };
  const finLen = plain(finalText).length;
  // 初稿：最早一个已经有成稿四成篇幅的版本
  const draftFile = files.find(f => { try { return plain(fs.readFileSync(path.join(vd, f), 'utf8')).length >= finLen * 0.4; } catch { return false; } }) || files[0];
  const draft = paras(fs.readFileSync(path.join(vd, draftFile), 'utf8'));
  const finSet = new Set(fin.map(x => x.p)), draftSet = new Set(draft.map(x => x.p));
  const newOnes = fin.filter(x => !draftSet.has(x.p)), pairs = [], dropped = [];
  for (const d of draft) {
    if (finSet.has(d.p)) continue;
    let best = null, bs = 0; for (const f of newOnes) { const s = sim(d.p, f.p); if (s > bs) { bs = s; best = f; } }
    if (best && bs >= 0.35) pairs.push({ before: d.p.slice(0, 320), after: best.p.slice(0, 320), s: bs, size: Math.abs(d.p.length - best.p.length) + (1 - bs) * d.p.length });
    else dropped.push(d.p.slice(0, 200));
  }
  pairs.sort((a, b) => b.size - a.size);
  return { pairs: pairs.slice(0, 14), dropped: dropped.slice(0, 6), versions: files.length, draft: draftFile.slice(0, 19) };
}

const SYS = `你是「创作台」的复盘员。作者刚发布了一篇作品，你要从这篇作品和它的修改过程里，总结出能让下一篇写得更顺手的东西。

依据的优先级：作者说的话、作者做的决定、作者撤销的改动 > 从初稿到成稿的改动 > 成稿本身。从初稿到成稿的改动可能是作者亲手改的，也可能是作者让 AI 改的，都是作者认可后留下来的。AI 助手自己的说法不能当成作者的偏好。

输出一个 JSON 对象，不要别的文字：
{
 "work": {
   "summary": "一句话：这篇写了什么、给谁看",
   "angle": "切入角度：从哪个问题或场景切进去的",
   "structure": "结构：开头怎么起、正文分几节各讲什么、怎么收尾，60 字以内",
   "title": "标题和小标题是怎么起的",
   "good": ["这篇做得好、下一篇可以照着做的地方，具体到做法，2–4 条"],
   "lessons": ["这篇改得最多、最费劲的地方，下一篇一开始就该注意的，1–3 条"]
 },
 "excerpts": [{"kind": "开头|过渡|结尾|图注|小标题|对比", "text": "从成稿里原样摘的一小段，150 字以内，挑最能代表作者写法的"}],
 "memory": {"add": [{"kind": "style|avoid|layout|cards|phrase|ideas|howto|profile|other", "scope": "all|article|card", "text": "一句话（60 字以内），换一篇也成立，单独拿出来也看得懂", "why": "为什么", "detail": "怎么做、例子（可空）", "check": "能在成稿里逐句检查的写成一句检查项（可空）", "evidence": "依据，20 字以内"}], "update": [{"id": "已有记忆编号", "text": "合并或修正后的完整说法"}], "hit": ["这篇印证了的已有记忆编号"], "miss": ["这篇证明不对、作者反着来的已有记忆编号"]}
}
excerpts 最多 4 段。memory.add 最多 6 条，只放换一篇文章也成立的偏好和经验；只对这篇成立的事实、一次性的修改不要放；和已有记忆说的是一回事就用 update 合并。`;

// 工作台和命令行是两个进程，用锁文件保证同一时间只复盘一篇（锁超过 15 分钟算作废）
const LOCK = path.join(core.DATA_DIR, 'learn.lock');
let running = null;
export const busy = () => { if (running) return running; try { const l = JSON.parse(fs.readFileSync(LOCK, 'utf8')); if (Date.now() - l.t < 15 * 60000) return l.title; } catch {} return null; };
function lock(title) {
  try { const l = JSON.parse(fs.readFileSync(LOCK, 'utf8')); if (Date.now() - l.t < 15 * 60000) throw new Error(`正在复盘《${l.title}》，等它做完`); } catch (e) { if (/正在复盘/.test(e.message)) throw e; }
  fs.mkdirSync(path.dirname(LOCK), { recursive: true }); fs.writeFileSync(LOCK, JSON.stringify({ title, pid: process.pid, t: Date.now() }));
}
const unlock = () => { try { if (JSON.parse(fs.readFileSync(LOCK, 'utf8')).pid === process.pid) fs.rmSync(LOCK); } catch {} };

export async function learn(dir, { provider } = {}) {
  const meta = core.load(dir); if (!meta) throw new Error('没有这个项目');
  const card = meta.type === 'card', mainFile = card ? 'index.html' : 'article.md';
  const f = path.join(dir, mainFile); if (!fs.existsSync(f)) throw new Error('没找到 ' + mainFile);
  lock(meta.title); running = meta.title;
  try {
    const finalText = fs.readFileSync(f, 'utf8');
    const rev = card ? { pairs: [], dropped: [], versions: 0 } : revisions(dir, mainFile, finalText);
    const chat = readJ(path.join(dir, '.workbench', 'chat.json'), []);
    const said = chat.filter(m => m.role === 'user' && m.text).map(m => '- ' + String(m.text).replace(/\s+/g, ' ').slice(0, 220));
    const undone = chat.filter(m => m.role === 'ai' && m.undone).map(m => '- ' + String(m.text || (m.steps || []).map(s => s.text).join('；')).replace(/\s+/g, ' ').slice(0, 160));
    const decided = readJ(path.join(dir, '.workbench', 'decisions.json'), []).filter(d => d.answer).map(d => `- ${d.title.slice(0, 80)} → ${d.answer}`);
    const body = card ? plain(finalText).slice(0, 6000) : finalText.replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)\n?/g, '').replace(/<p class="cap">[\s\S]*?<\/p>\n?/g, '').replace(/<div class="sources">[\s\S]*?<\/div>/, '').slice(0, 9000);
    const mem = memory.list().filter(it => it.status !== 'archived').map(it => `- (${it.id}) [${it.kind}] ${it.text}`).join('\n') || '（还没有）';
    const prompt = `作品：${card ? '小红书卡片' : '公众号文章'}《${meta.title}》，发布：${(meta.published || []).map(r => `${r.platform} ${r.date}`).join('、') || '已发布'}。

已有的全局记忆：
${mem}

成稿${card ? '（卡片上的文字）' : '（去掉了图片和参考资料）'}：
<<<
${body}
>>>

${rev.pairs.length ? `从初稿到成稿改过的段落（前 → 后，共 ${rev.versions} 个历史版本）：\n${rev.pairs.map((x, i) => `${i + 1}. 前：${x.before}\n   后：${x.after}`).join('\n')}\n\n` : ''}${rev.dropped.length ? `初稿里有、成稿删掉的段落：\n${rev.dropped.map(x => '- ' + x).join('\n')}\n\n` : ''}${said.length ? `作者对 AI 助手说过的话（按时间）：\n${said.slice(-50).join('\n')}\n\n` : ''}${decided.length ? `作者在卡片上做的决定：\n${decided.slice(-25).join('\n')}\n\n` : ''}${undone.length ? `作者撤销过的 AI 改动：\n${undone.slice(-10).join('\n')}\n\n` : ''}按要求输出 JSON。`;
    const out = await ai.generate({ provider: ai.cheap('mid'), system: SYS, prompt });
    const s = String(out || ''), i = s.indexOf('{'), j = s.lastIndexOf('}');
    let o; try { o = JSON.parse(s.slice(i, j + 1)); } catch { throw new Error('复盘结果不是 JSON，再试一次'); }
    // 记忆：合并进全局记忆
    // 新学到的先进“待确认”；印证的加次数，被推翻的记一笔（多次推翻会自动降级）
    const ops = o.memory || {};
    const done = memory.apply({ add: ops.add, update: ops.update, hit: ops.hit, miss: [...(ops.miss || []), ...(ops.remove || [])] }, { source: 'learn', project: meta.id, evidence: `复盘《${meta.title.slice(0, 20)}》`, maxAdd: 6, ctx: { title: meta.title, body } }).filter(x => x.op !== 'hit');
    const w = o.work || {};
    const work = {
      id: meta.id, title: meta.title, type: meta.type, published: meta.published || [], learnedAt: new Date().toISOString(),
      summary: String(w.summary || '').slice(0, 200), angle: String(w.angle || '').slice(0, 200), structure: String(w.structure || '').slice(0, 300), titleStyle: String(w.title || '').slice(0, 200),
      good: (w.good || []).map(x => String(x).replace(/[。；;]+$/, '')).slice(0, 4), lessons: (w.lessons || []).map(x => String(x).replace(/[。；;]+$/, '')).slice(0, 3),
      excerpts: (o.excerpts || []).filter(x => x?.text).slice(0, 4).map(x => ({ kind: String(x.kind || '').slice(0, 8), text: String(x.text).slice(0, 200) })),
      memo: done, basis: { versions: rev.versions, pairs: rev.pairs.length, dropped: rev.dropped.length, said: said.length, decided: decided.length, undone: undone.length },
    };
    const all = list().filter(x => x.id !== meta.id); all.unshift(work); saveAll(all);
    core.log(dir, 'AI 复盘', `学到 ${done.length} 条记忆`);
    return work;
  } finally { running = null; unlock(); }
}

// 还没复盘过、或复盘后又改过的已发布作品，挨个复盘（一次一篇）
export async function sweep({ force = false } = {}) {
  if (busy() || (!force && !memory.autoOn())) return [];
  const learned = Object.fromEntries(list().map(w => [w.id, w.learnedAt]));
  const todo = core.list().filter(p => p.status === '已发布').filter(p => {
    const main = path.join(p.dir, p.type === 'card' ? 'index.html' : 'article.md');
    let mt = 0; try { mt = fs.statSync(main).mtimeMs; } catch { return false; }
    return !learned[p.id] || mt > Date.parse(learned[p.id]) + 60000;
  });
  const res = [];
  for (const p of todo) {
    const w = list().find(x => x.id === p.id); if (w && !force && Date.now() - Date.parse(w.learnedAt) < 10 * 60000) continue;
    try { res.push(await learn(p.dir)); } catch (e) { res.push({ id: p.id, title: p.title, error: e.message }); if (/正在复盘/.test(e.message)) break; }
  }
  return res;
}
let soon; export function sweepSoon(ms = 8000) { clearTimeout(soon); soon = setTimeout(() => sweep().catch(() => {}), ms); }

// 拼进助手系统提示：最近几篇同类作品的档案 + 几段作者认可的原文
export function promptBlock(type = 'article') {
  const ws = list().filter(w => w.type === type).slice(0, 6); if (!ws.length) return '';
  const lines = ws.map(w => `- 《${w.title}》（${(w.published || []).map(r => r.platform).join('、') || '已发布'}${w.published?.[0]?.date ? ' ' + w.published[0].date : ''}）：${w.summary}${w.angle ? `\n  切入：${w.angle}` : ''}${w.structure ? `\n  结构：${w.structure}` : ''}${w.good?.length ? `\n  做得好：${w.good.map(x => x.replace(/[。；;]+$/, '')).join('；')}` : ''}${w.lessons?.length ? `\n  上次费劲的地方：${w.lessons.map(x => x.replace(/[。；;]+$/, '')).join('；')}` : ''}`);
  const ex = ws.slice(0, 2).flatMap(w => (w.excerpts || []).map(x => `- 〔${x.kind}·《${w.title.slice(0, 16)}》〕${x.text}`)).slice(0, 6);
  return `作者已经发布、复盘过的${type === 'card' ? '卡片' : '文章'}（写新的时候参照它们的切入、结构和写法，别重复写过的内容；要看全文用 read_project）：\n${lines.join('\n')}${ex.length ? `\n\n作者认可的成稿片段（只学写法和语气，不要照抄内容）：\n${ex.join('\n')}` : ''}`;
}
