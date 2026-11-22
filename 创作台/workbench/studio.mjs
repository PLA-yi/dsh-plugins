// 文章写作室的服务端：修订建议、AI 对话、体检、发布、资料
// 数据都存在项目的 .workbench/ 里：suggestions.json、chat.json、checks.json、research.json
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import * as ai from './ai.mjs';
import * as ed from './edit.mjs';
import * as memory from './memory.mjs';
import { APP_DIR, log, readMeta, DATA_DIR } from './core.mjs';
import * as core from './core.mjs';

const ART = 'article.md';
const DETECT = path.join(os.homedir(), '.claude/skills/lieflat-less-ai-tone/scripts/detect.py');
const wdir = dir => { const d = path.join(dir, '.workbench'); fs.mkdirSync(d, { recursive: true }); return d; };
const readJ = (dir, f, d) => { try { return JSON.parse(fs.readFileSync(path.join(wdir(dir), f), 'utf8')); } catch { return d; } };
const writeJ = (dir, f, v) => fs.writeFileSync(path.join(wdir(dir), f), JSON.stringify(v, null, 2));
const src = dir => fs.readFileSync(path.join(dir, ART), 'utf8');
const uid = () => crypto.randomBytes(5).toString('hex');
// 把 Markdown / HTML 源文还原成屏幕上看到的文字：去掉注释、图片、标签，链接只留文字，去掉加粗斜体记号，转义字符还原
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·' };
const plain = s => s.replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/\*\*|__|`|~~/g, '').replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
  .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)
  .replace(/\\([\\`*_{}\[\]()#+\-.!|])/g, '$1').replace(/^#+\s*/gm, '').replace(/^>\s?/gm, '');

// 从模型输出里取出 JSON 数组：前面可能有搜索时的说明文字，从后往前找能解析的那段
function parseJsonArray(out) {
  const end = out.lastIndexOf(']'); if (end < 0) return [];
  const starts = [...out.matchAll(/\[\s*\{/g)].map(m => m.index).reverse();
  for (const i of starts) { if (i > end) continue; try { const v = JSON.parse(out.slice(i, end + 1)); if (Array.isArray(v)) return v; } catch {} }
  return [];
}

/* ---------- 定位：AI 引用的原文在 article.md 里的确切写法 ---------- */
// 优先一字不差；找不到就找“去掉格式后包含这句话”的那一整块，改整块
export function locate(text, quote) {
  const q = String(quote || '').trim();
  if (!q) return null;
  if (count(text, q) === 1) return { old: q, whole: false };
  const blocks = text.split(/\n{2,}/);
  const norm = s => plain(s).replace(/\s+/g, '');
  const qn = norm(q);
  const hits = blocks.filter(b => qn && norm(b).includes(qn));
  if (hits.length === 1 && count(text, hits[0]) === 1) return { old: hits[0], whole: true };
  // 选区跨了好几段：找连着的几段（最多 8 段），合起来包含选中的文字，就改这几段整体
  if (!hits.length && qn) {
    const parts = text.split(/(\n{2,})/), idx = [];
    let pos = 0; for (let i = 0; i < parts.length; i++) { if (i % 2 === 0) idx.push({ start: pos, end: pos + parts[i].length, b: parts[i] }); pos += parts[i].length; }
    for (let i = 0; i < idx.length; i++) {
      let acc = '';
      for (let j = i; j < Math.min(idx.length, i + 8); j++) {
        acc += norm(idx[j].b);
        if (j > i && acc.includes(qn)) {
          if (!norm(idx[i].b).length || acc.slice(norm(idx[i].b).length).includes(qn)) break;   // 第一段其实没被选到
          const old = text.slice(idx[i].start, idx[j].end);
          return count(text, old) === 1 ? { old, whole: true } : null;
        }
      }
    }
  }
  return null;
}
const count = (s, sub) => { let n = 0, i = -1; while ((i = s.indexOf(sub, i + 1)) >= 0) n++; return n; };

/* ---------- 修订建议 ---------- */
export const suggestions = dir => readJ(dir, 'suggestions.json', []);
function addSuggestion(dir, s) {
  const list = suggestions(dir);
  const item = { id: uid(), t: new Date().toISOString(), ...s };
  list.push(item); writeJ(dir, 'suggestions.json', list); return item;
}
export function acceptSuggestion(dir, id) {
  const list = suggestions(dir), s = list.find(x => x.id === id);
  if (!s) throw new Error('这条建议已经不在了');
  const text = src(dir);
  if (count(text, s.old) !== 1) throw new Error('原文这一处已经改过了，这条建议对不上，拒绝它就好');
  ed.articleWrite(dir, text.replace(s.old, () => s.new), 0, '接受建议：' + (s.why || s.source || '').slice(0, 16));
  writeJ(dir, 'suggestions.json', list.filter(x => x.id !== id));
  log(dir, '接受修改建议', (s.why || '').slice(0, 60));
  // 其他建议如果和这一处重叠，已经对不上了，顺手清掉
  const now = src(dir);
  writeJ(dir, 'suggestions.json', suggestions(dir).filter(x => count(now, x.old) === 1));
  return true;
}
export function rejectSuggestion(dir, id) { writeJ(dir, 'suggestions.json', suggestions(dir).filter(x => x.id !== id)); }
export function clearStale(dir) { const t = src(dir); const l = suggestions(dir); const keep = l.filter(x => count(t, x.old) === 1); if (keep.length !== l.length) writeJ(dir, 'suggestions.json', keep); return keep; }

// 针对一处原文生成修改建议（体检里的「改」、选中文字后的快捷改法都走这里）
export async function suggestFor(dir, { quote, task = 'custom', instruction = '', provider, why, title }) {
  const text = src(dir), loc = locate(text, quote);
  if (!loc) throw new Error('在文章里没找到这句话，可能已经改过了');
  const i = text.indexOf(loc.old);
  const { system, prompt } = ai.articlePrompt(task, {
    text: loc.old, title, script: isScript(dir),
    instruction: (loc.whole && plain(loc.old).trim() !== plain(quote).trim() ? `只改其中「${plain(quote).trim().slice(0, 80)}」这一句，其余原样保留（包括 HTML 和 Markdown 标记）。` : '') + instruction,
    before: text.slice(Math.max(0, i - 800), i), after: text.slice(i + loc.old.length, i + loc.old.length + 500),
  });
  const out = ai.stripFence(await ai.generate({ provider, system, prompt }));
  if (!out || out.trim() === loc.old.trim()) throw new Error('AI 觉得这里不用改');
  return addSuggestion(dir, { old: loc.old, new: out.trim(), why: why || ai.ARTICLE_TASK_NAMES[task] || instruction.slice(0, 40), source: 'task' });
}

// 续写：插在某一段后面，也当成一条建议（接受才写进文章）
export async function continueAfter(dir, { quote, instruction = '', provider, title }) {
  const text = src(dir); const loc = quote ? locate(text, quote) : null;
  const anchor = loc ? (loc.whole ? loc.old : text.split(/\n{2,}/).find(b => b.includes(loc.old)) || loc.old) : text.trimEnd().split(/\n{2,}/).pop();
  if (count(text, anchor) !== 1) throw new Error('定位不到续写的位置，换一段再试');
  const i = text.indexOf(anchor) + anchor.length;
  const { system, prompt } = ai.articlePrompt('continue', { before: text.slice(0, i), after: text.slice(i), instruction, title, script: isScript(dir) });
  const out = ai.stripFence(await ai.generate({ provider, system, prompt })).trim();
  return addSuggestion(dir, { old: anchor, new: anchor + '\n\n' + out, why: '续写', source: 'continue' });
}

// 这个项目是不是视频脚本（口播稿）
const isScript = dir => readMeta(dir).form === 'script';

/* ---------- AI 助手对话：回复里可以带修改建议 ---------- */
const CHAT_SYS = `你是作者的写作搭档，和作者一起把文章改到“没有 AI 味、又非常清晰”。
${ai.WRITING_RULES.replace('只输出改好的文字本身，不要前言、不要解释、不要用代码块包起来。', '')}
回答格式：
- 先用一两句大白话回应（不要客套）。
- 如果要改文章，用下面的格式给出修改，每处一个，最多 8 处：
<edit><old>文章里要改的原文，必须从文章里一字不差地复制，包括里面的 HTML 和 Markdown 标记</old><new>改成什么</new><why>一句话说为什么</why></edit>
- 只聊想法、不需要改文章时，就不要输出 <edit>。`;

export const chatHistory = dir => readJ(dir, 'chat.json', []);
export function clearChat(dir) { writeJ(dir, 'chat.json', []); }
export async function chat(dir, { message, focus = '', provider, title }) {
  const text = src(dir), hist = chatHistory(dir).slice(-10);
  const research = readJ(dir, 'research.json', []).slice(0, 6).map(r => `- ${r.q}：${(r.answer || '').slice(0, 300)}`).join('\n');
  const prompt = `文章《${title}》全文（article.md 原文）：\n<<<\n${text}\n>>>\n\n${research ? `已经查到的资料（可以引用，标出来源）：\n${research}\n\n` : ''}${hist.length ? '之前的对话：\n' + hist.map(h => `${h.role === 'user' ? '作者' : '你'}：${h.text.slice(0, 600)}`).join('\n') + '\n\n' : ''}${focus ? `作者现在正看着这段：\n「${focus.slice(0, 1500)}」\n\n` : ''}作者说：${message}`;
  const out = await ai.generate({ provider, system: isScript(dir) ? CHAT_SYS + '\n' + ai.SCRIPT_RULES : CHAT_SYS, prompt });
  const edits = [...out.matchAll(/<edit>\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*(?:<why>([\s\S]*?)<\/why>)?\s*<\/edit>/g)];
  const reply = out.replace(/<edit>[\s\S]*?<\/edit>/g, '').trim();
  const made = [], missed = [];
  for (const [, o, n, w] of edits) {
    const loc = locate(text, o);
    if (!loc || loc.whole) { missed.push({ old: o.trim(), new: n.trim(), why: (w || '').trim() }); continue; }
    made.push(addSuggestion(dir, { old: loc.old, new: n.trim(), why: (w || '').trim(), source: 'chat' }));
  }
  const h = chatHistory(dir);
  const tid = uid();
  h.push({ role: 'user', text: message, t: new Date().toISOString() }, { role: 'ai', tid, text: reply, edits: made.length, missed, t: new Date().toISOString() });
  writeJ(dir, 'chat.json', h.slice(-60));
  // 后台整理记忆，结果记在这一轮上
  setImmediate(async () => {
    try { const r = await memory.memorize({ message, reply, kind: 'article', title, steps: made.length ? [{ text: `标了 ${made.length} 处修改建议` }] : [] }, { provider, project: path.basename(dir) }); const hh = chatHistory(dir), m = hh.find(x => x.tid === tid); if (m) { m.memo = r; m.memoDone = true; writeJ(dir, 'chat.json', hh); } } catch {}
  });
  log(dir, 'AI 对话', message.slice(0, 40));
  return { reply, suggestions: made, missed };
}

/* ---------- 体检 ---------- */
function prose(text) {
  const t = text.replace(/<div class="(toc|sources)">[\s\S]*?<\/div>/g, '');
  return t.split('\n').filter(l => !/^(\||!\[|<!--|<div|<\/div>|<p class="(cap|sign|toc)|#)/.test(l)).map(l => l.replace(/<[^>]+>/g, '')).join('\n');
}
const TIPS = {
  '顿号并列≥3': '一句里用顿号串了三个以上的东西，读着像清单。挑最重要的说，或者拆开写',
  '翻案腔': '「不是……而是……」式的假对比，直接说结论',
  '提示语冒号': '用「……：」引出下文的提示语，像 PPT，改成正常的句子',
  '起手式': '套路化的开头，直接从具体的事说起',
  '当…时从句': '「当……时」的翻译腔，换成口语',
  '前置话题壳': '句首先摆一个空话题再展开，删掉空壳',
  '句首连接词': '句首的连接词太多（此外、同时、因此……），删掉大部分',
  '过长前置定语': '名词前面的修饰太长，拆成两句',
  '拟人化喻体': '拟人化的比喻，换成具体的描述',
};
const HUMAN = { '顿号并列≥3': [1.78, '/千字', '一句话里用顿号串三个以上名词'], 分号: [1, '/千字', '分号串句'], 破折号: [0.8, '/千字', '破折号'], '两句同构/百段': [5.52, '/百段', '相邻两句句式一样'], '三句同构/百段': [0.41, '/百段', '连着三句句式一样'] };
function runDetect(text) {
  return new Promise(resolve => {
    if (!fs.existsSync(DETECT)) return resolve(null);
    const f = path.join(DATA_DIR, `prose-${uid()}.md`);
    fs.writeFileSync(f, prose(text));
    execFile('python3', ['-I', DETECT, f, '--json', '--max-hits', '20'], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, out) => {
      fs.rmSync(f, { force: true });
      try { resolve(JSON.parse(out)); } catch { resolve(null); }
    });
  });
}
export async function check(dir) {
  const text = src(dir), p = prose(text);
  const chars = (p.match(/[一-鿿]/g) || []).length;
  const paras = p.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  const d = await runDetect(text);
  const metrics = [];
  if (d) {
    const all = { ...d.density, ...d.char_density, ...d.structure };
    for (const [k, [h, unit, desc]] of Object.entries(HUMAN)) if (all[k] != null) metrics.push({ key: k, desc, value: +(+all[k]).toFixed(2), human: h, unit, bad: all[k] > h * 1.5 });
    if (all['句长CV'] != null) metrics.push({ key: '句长CV', desc: '句子长短的变化（越低越像机器的匀速节奏）', value: +(+all['句长CV']).toFixed(2), human: 0.54, unit: '', bad: all['句长CV'] < 0.48 });
  }
  const issues = [];
  if (d) for (const [k, hits] of Object.entries(d.hits || {})) {
    if (/已否决/.test(k)) continue;
    for (const h of (hits || []).slice(0, 6)) issues.push({ id: uid(), type: 'AI 味', label: k, quote: h.excerpt, tip: TIPS[k] || `「${k}」是常见的 AI 写法` });
  }
  const res = {
    t: new Date().toISOString(),
    stats: { chars, minutes: Math.max(1, Math.round(chars / 400)), paras: paras.length, longest: Math.max(0, ...paras.map(s => s.length)), images: (text.match(/!\[[^\]]*\]\(/g) || []).length, tables: (text.match(/<!--\s*fig:/g) || []).length },
    metrics, issues, detector: !!d,
  };
  const hist = readJ(dir, 'checks.json', []);
  hist.push({ t: res.t, metrics: Object.fromEntries(metrics.map(m => [m.key, m.value])), chars });
  writeJ(dir, 'checks.json', hist.slice(-30));
  res.history = hist.slice(-8);
  return res;
}
export async function aiReview(dir, { provider, title, focus = '' }) {
  const text = src(dir);
  const out = await ai.generate({ provider, system: '你是严格的中文编辑，只挑问题，不重写全文。只输出 JSON。', prompt:
    `给文章《${title}》挑问题，输出一个 JSON 数组，最多 15 条，按影响大小排序。每条：{"type":"AI味|冗余|逻辑|核对|吸引力|清晰","quote":"从原文一字不差复制的那一句（不超过 60 字，不要带 HTML 标记）","tip":"一句话说怎么改"}。
类别说明：AI味=套话、对仗、金句收尾、「不是…而是…」；冗余=读者会想跳过的；逻辑=跳跃或前后矛盾；核对=数字或说法需要核实；吸引力=开头或章节开头不抓人；清晰=读者会看不懂的地方。${focus ? '\n特别关注：' + focus : ''}\n\n全文：\n${plain(text)}` });
  let arr = [];
  arr = parseJsonArray(out);
  const t = src(dir);
  return arr.filter(x => x && x.quote).map(x => ({ id: uid(), type: x.type || '建议', label: x.type || '', quote: String(x.quote), tip: String(x.tip || ''), found: !!locate(t, x.quote) }));
}

/* ---------- 发布 ---------- */
const exists = f => fs.existsSync(f);
function imgSize(f) { try { const b = fs.readFileSync(f); if (b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)]; } catch {} return null; }
export function publishInfo(dir, meta) {
  const text = src(dir);
  const title = (text.match(/^#\s+(.+)$/m) || [])[1]?.trim() || meta.title;
  const deck = plain((text.match(/<p class="deck">([\s\S]*?)<\/p>/) || [])[1] || '').trim();
  const out = path.join(dir, 'out');
  const wx = path.join(out, 'wechat.html'), x = path.join(out, 'x.html');
  const stale = exists(wx) && fs.statSync(path.join(dir, ART)).mtimeMs > fs.statSync(wx).mtimeMs + 1000;
  const imgsIn = f => exists(f) ? [...fs.readFileSync(f, 'utf8').matchAll(/(?:src="|【这里上传(?:图片|图 \d+)：)((?:img\/)?[^"】]+?\.(?:png|jpe?g|gif|webp))/g)].map(m => m[1].includes('/') ? m[1] : (m[1].startsWith('fig-') ? m[1] : 'img/' + m[1])) : [];
  const uniq = a => [...new Set(a)];
  const wimgs = uniq(imgsIn(wx)).filter(f => exists(path.join(out, f)));
  const ximgs = uniq(imgsIn(x)).filter(f => exists(path.join(out, f)) && !path.basename(f).startsWith('cover-'));
  const cw = path.join(out, 'cover-wechat.png'), cx = path.join(out, 'cover-x.png');
  const summary = meta.summary ?? deck.slice(0, 120);
  return {
    built: exists(wx), stale,
    wechat: { title, titleLen: [...title].length, summary, summaryLen: [...summary].length, author: core.profile().name,
      cover: exists(cw) ? 'out/cover-wechat.png' : null, coverSize: imgSize(cw), images: wimgs.map(f => 'out/' + f) },
    x: { title, titleLen: [...title].length, cover: exists(cx) ? 'out/cover-x.png' : null, coverSize: imgSize(cx), images: ximgs.map(f => 'out/' + f),
      tables: (text.match(/<!--\s*fig:/g) || []).length },
  };
}
// 把某个平台用到的图按出现顺序打成 zip（文件名前面加序号，传图时照着顺序来）
export function imagesZip(dir, info, platform) {
  const list = platform === 'x' ? info.x.images : info.wechat.images;
  if (!list.length) throw new Error('没有配图');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-imgs-'));
  list.forEach((f, i) => fs.copyFileSync(path.join(dir, f), path.join(tmp, `${String(i + 1).padStart(2, '0')}-${path.basename(f)}`)));
  const zip = path.join(tmp, `${platform === 'x' ? 'X' : '公众号'}配图.zip`);
  return new Promise((resolve, reject) => execFile('zip', ['-q', '-j', zip, ...fs.readdirSync(tmp).filter(n => !n.endsWith('.zip')).map(n => path.join(tmp, n))], err => err ? reject(err) : resolve(zip)));
}

/* ---------- 资料 ---------- */
export const research = dir => readJ(dir, 'research.json', []);
export async function doResearch(dir, { q, provider, title }) {
  const out = await ai.generate({ provider, web: true, system: '你是认真的资料员。用联网搜索查清楚问题，只写查到的事实，每条事实后面标来源链接。查不到就直说查不到，不要编。用中文。', prompt:
    `我在写文章《${title}》，需要查：${q}\n\n输出格式：先用 3–6 条要点回答（每条后面用 [来源](链接) 标出处），最后一行写「来源：」后面列出用到的链接，每个一行。` });
  const sources = [...new Set([...out.matchAll(/https?:\/\/[^\s)）\]>"']+/g)].map(m => m[0].replace(/[.,，。]+$/, '')))].slice(0, 12);
  const item = { id: uid(), q, answer: out.trim(), sources, t: new Date().toISOString(), web: true };
  const list = research(dir); list.unshift(item); writeJ(dir, 'research.json', list.slice(0, 100));
  log(dir, '查资料', q.slice(0, 40));
  return item;
}
export function addNote(dir, { q, answer, sources = [] }) {
  const item = { id: uid(), q: q || '手动记录', answer: answer || '', sources, t: new Date().toISOString(), web: false };
  const list = research(dir); list.unshift(item); writeJ(dir, 'research.json', list); return item;
}
export function delResearch(dir, id) { writeJ(dir, 'research.json', research(dir).filter(x => x.id !== id)); }

/* ---------- 找选题：联网搜最近的动态，给出可写的选题 ---------- */
const IDEAS = path.join(DATA_DIR, 'ideas.json');
export function lastIdeas() { try { return JSON.parse(fs.readFileSync(IDEAS, 'utf8')); } catch { return null; } }
export async function findIdeas({ direction = '', type = 'article', provider, existing = [] }) {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const form = type === 'card' ? '小红书图文卡片（5–8 页，让人一口气看懂一个产品、功能或趋势）' : '公众号长文（深度拆解、横向对比、行业分析，读完有收获）';
  const out = await ai.generate({ provider, web: true, searches: 15,
    system: `你是选题编辑。${core.persona()}你会先联网搜索，再给有信息差、读者会好奇、能写出新东西的选题。不编造事件和数字。只输出 JSON。`,
    prompt: `今天是 ${today}。帮我找 6 个现在值得写的选题。
方向：${direction || 'AI 产品：新发布的产品、大版本更新、值得拆解的新功能、行业里的新玩法和争议'}
形式：${form}
要求：
- 先联网搜最近两周的新闻、发布会、社区讨论：中文（36氪、量子位、机器之心、虎嗅、少数派、IT之家）和英文（The Verge、TechCrunch、Product Hunt、Hacker News、X）都要搜，至少搜 6 次不同的关键词
- 选题要有具体的由头（某个产品发布、某个数据、某个争议），6 个选题的由头尽量来自不同的来源，不要都引用同一篇
- 国内产品和海外产品都要有
- 避开已经写过的：${existing.slice(0, 30).join('、') || '（无）'}
- 标题像真人起的：具体、有信息量，不要标题党、不要口号
只输出一个 JSON 数组，每项：
{"title":"暂定标题","angle":"一句话说从什么角度写、读者能得到什么","why":"为什么现在值得写：具体事件、日期或数据","hook":"开头可以用的一个具体场景或数字","sources":["来源链接"]}` });
  let items = [];
  items = parseJsonArray(out);
  items = items.filter(x => x && x.title).slice(0, 8).map(x => ({ title: String(x.title).trim(), angle: String(x.angle || ''), why: String(x.why || ''), hook: String(x.hook || ''), sources: (Array.isArray(x.sources) ? x.sources : []).filter(u => /^https?:\/\//.test(u)).slice(0, 5) }));
  if (!items.length) throw new Error('AI 这次没给出能用的选题，换个方向再试试');
  const res = { t: new Date().toISOString(), direction, type, items };
  fs.mkdirSync(path.dirname(IDEAS), { recursive: true }); fs.writeFileSync(IDEAS, JSON.stringify(res, null, 2));
  return res;
}
// 用选题建项目后，把选题的角度、由头和来源放进新项目的资料和笔记
export function seedIdea(dir, idea) {
  if (!idea?.title) return;
  if (idea.brief) addNote(dir, { q: '写作简报：' + idea.title, answer: idea.brief, sources: idea.sources || [] });
  if (idea.evidence?.length) addNote(dir, { q: '一手证据', answer: idea.evidence.map(e => `- [${e.sourceName}] [${e.title}](${e.url})`).join('\n'), sources: idea.evidence.map(e => e.url) });
  addNote(dir, { q: '选题：' + idea.title, answer: [idea.angle && `- 角度：${idea.angle}`, idea.why && `- 为什么现在写：${idea.why}`, idea.hook && `- 开头可以用：${idea.hook}`].filter(Boolean).join('\n'), sources: idea.sources || [] });
  const list = research(dir); if (list[0]) { list[0].web = true; writeJ(dir, 'research.json', list); }
}
