// 工作台的核心逻辑：命令行（cli.mjs）和网页服务（server.mjs）都用这一份。
// 项目就是文件夹：有 article.md 的是文章，index.html 里有 <section class="card" data-n> 的是小红书卡片。
// 视频脚本（口播稿）也写在 article.md 里，是文章的一种形式：.workbench.json 里 form 是 script。
// 每个项目的状态、标签、笔记、发布记录存在项目文件夹里的 .workbench.json，不动项目原有文件。
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CHROME, MAC, NODE, WIN, fileUrl, openCommand, quote, shellArgs } from './platform.mjs';

export const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const DATA_DIR = path.join(APP_DIR, 'data');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.jsonl');
const META = '.workbench.json';

export const STATUSES = ['灵感', '草稿', '待发', '已发布'];
export const TYPES = { article: '文章', card: '小红书卡片' };
const TYPE_ALIAS = { article: 'article', 文章: 'article', a: 'article', card: 'card', cards: 'card', 卡片: 'card', 小红书: 'card', 小红书卡片: 'card', c: 'card' };
// 文章的形式：现在只有视频脚本。新建、筛选时可以把它当类型写（script / 视频脚本 / 口播稿）
export const FORMS = { script: '视频脚本' };
const FORM_ALIAS = { script: 'script', s: 'script', video: 'script', 视频脚本: 'script', 脚本: 'script', 口播稿: 'script', 口播: 'script' };
export const formOf = t => FORM_ALIAS[String(t || '').toLowerCase()] || null;
export const typeOf = t => TYPE_ALIAS[String(t || '').toLowerCase()] || (formOf(t) ? 'article' : null);

/* ---------- 配置 ---------- */
export function config() {
  const def = { roots: [path.dirname(APP_DIR)], extra: [], port: 5288, cardPrefix: '小红书卡片-' };
  try { return { ...def, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch { return def; }
}
function saveConfig(c) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2) + '\n'); }

/* ---------- 小工具 ---------- */
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const mtime = p => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const ls = d => { try { return fs.readdirSync(d); } catch { return []; } };
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const norm = s => String(s || '').toLowerCase().replace(/[\s\-_·]+/g, '');
const stripHtml = s => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ');

function sh(cmd, cwd, timeout = 10 * 60 * 1000) {
  return new Promise(resolve => {
    const [shell, args, extra] = shellArgs(cmd);
    execFile(shell, args, { cwd, timeout, maxBuffer: 20 * 1024 * 1024, ...extra }, (err, stdout, stderr) =>
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, out: (stdout + (stderr ? '\n' + stderr : '')).trim() }));
  });
}
const q = quote;

/* ---------- 读项目 ---------- */
function detect(dir) {
  if (exists(path.join(dir, 'article.md'))) return 'article';
  const html = read(path.join(dir, 'index.html'));
  if (/class="card[^"]*"[^>]*data-n=/.test(html)) return 'card';
  const m = readMeta(dir);
  return m.type && TYPES[m.type] ? m.type : null;
}
export function readMeta(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, META), 'utf8')); } catch { return {}; } }
function writeMeta(dir, m) { fs.writeFileSync(path.join(dir, META), JSON.stringify(m, null, 2) + '\n'); }

function projectDirs() {
  const c = config(), out = [];
  for (const root of c.roots) for (const n of ls(root)) {
    if (n.startsWith('.') || n.startsWith('_') || n === 'node_modules') continue;
    const d = path.join(root, n);
    try { if (!fs.statSync(d).isDirectory()) continue; } catch { continue; }
    if (detect(d)) out.push(d);
  }
  for (const d of c.extra) if (exists(d) && !out.includes(d) && detect(d)) out.push(d);
  return out;
}

function cardPages(dir) {
  const html = read(path.join(dir, 'index.html'));
  const ns = [...html.matchAll(/<section[^>]*class="card[^"]*"[^>]*data-n="(\d+)"/g)].map(m => +m[1]);
  return ns.length ? ns : [...html.matchAll(/data-n="(\d+)"/g)].map(m => +m[1]);
}
function outImages(dir) {
  return ls(path.join(dir, 'out')).filter(f => /\.(jpe?g|png)$/i.test(f)).sort().map(f => 'out/' + f);
}
function zips(dir) {
  return ls(dir).filter(f => f.endsWith('.zip')).map(f => ({ name: f, t: mtime(path.join(dir, f)) })).sort((a, b) => b.t - a.t);
}
function articleText(dir) {
  return read(path.join(dir, 'article.md')).replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '');
}
const countChars = t => (t.match(/[一-鿿]/g) || []).length + (t.match(/[A-Za-z0-9]+/g) || []).length;

/* ---------- 视频脚本 ---------- */
// 口播每秒大约说 4.5 个字（每分钟 270 字上下）
export const SPEAK_RATE = 4.5;
// 口播稿里真正要说出口的话：不算标题、导语、「> 画面：…」这类引用行、整行括号的占位说明，
// 也不算「封面和标题」「发布文案和话题」这些不念的小节
export function spokenText(md) {
  const out = []; let skip = false;
  for (const raw of String(md || '').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const l = raw.trim();
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { if (h[1].length <= 2) skip = /封面|标题|发布|话题|备注|素材/.test(h[2]); continue; }
    if (skip || !l || l.startsWith('>') || /^<p class="deck">/.test(l) || /^[（(].*[）)]$/.test(l)) continue;
    out.push(l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').replace(/^[-*]\s+/, ''));
  }
  return out.join('\n');
}
export const speakSeconds = md => Math.round(countChars(spokenText(md)) / SPEAK_RATE);

// 新建视频脚本时的骨架；从选题来的开头钩子、口播提纲、建议时长、封面字、标题备选直接填进去
function scriptSkeleton(name, s = {}) {
  const line = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const outline = (Array.isArray(s.outline) ? s.outline : []).map(line).filter(Boolean).slice(0, 8);
  const segs = outline.length ? outline : ['这段讲什么', '这段讲什么', '这段讲什么'];
  const total = +s.seconds >= 15 ? Math.round(+s.seconds) : 90;
  const per = Math.max(10, Math.round((total - 13) / segs.length / 5) * 5);
  const heads = (Array.isArray(s.headlines) ? s.headlines : []).map(line).filter(Boolean).slice(0, 3);
  return `# ${name}

<p class="deck">${line(s.angle) || '一句话说清这条视频讲什么、看完能得到什么'}</p>

## 开头钩子（0–3 秒）

${line(s.hook) || '（开口第一句：给一个结果、反差、数字或问题，让人停下来）'}

> 画面：（这一句配什么画面、屏幕上打什么字）

## 正文

${segs.map((x, i) => `### 第 ${i + 1} 段：${x}（约 ${per} 秒）\n\n（这段的口播原话）\n\n> 画面：（录屏、实拍还是字幕条，具体到哪一步）`).join('\n\n')}

## 结尾（约 10 秒）

（一句话收住，再给一个具体的互动引导）

> 画面：（结尾画面）

## 封面和标题

- 封面字：${line(s.cover) || '（8 个字以内）'}
${(heads.length ? heads : ['（备选 1）', '（备选 2）', '（备选 3）']).map(h => `- 标题备选：${h}`).join('\n')}

## 发布文案和话题

（发布时配的一段话，再加 3–5 个话题）
`;
}

function deriveTitle(dir, type) {
  const name = path.basename(dir);
  if (type === 'article') {
    const h = read(path.join(dir, 'article.md')).match(/^#\s+(.+)$/m);
    if (h) return h[1].trim();
  }
  return name.replace(config().cardPrefix, '');
}

function thumbOf(dir, type) {
  if (type === 'card') { const o = outImages(dir); return o[0] || null; }
  for (const f of ['out/cover-wechat.png', 'img/hero.png', 'out/cover-x.png']) if (exists(path.join(dir, f))) return f;
  const o = outImages(dir); return o[0] || null;
}

function updatedOf(dir, type) {
  const keys = type === 'article' ? ['article.md', 'out'] : ['index.html', 'out'];
  let t = Math.max(...keys.map(k => mtime(path.join(dir, k))), mtime(path.join(dir, META)));
  for (const f of ls(path.join(dir, 'out'))) t = Math.max(t, mtime(path.join(dir, 'out', f)));
  return t;
}

export function load(dir, full = false) {
  const type = detect(dir); if (!type) return null;
  const m = readMeta(dir);
  const st = fs.statSync(dir);
  const z = zips(dir);
  const form = type === 'article' && m.form === 'script' ? 'script' : '';
  const p = {
    id: path.basename(dir), dir, type, form, typeName: FORMS[form] || TYPES[type],
    title: m.title || deriveTitle(dir, type),
    status: STATUSES.includes(m.status) ? m.status : (z.length ? '待发' : '草稿'),
    tags: m.tags || [], pinned: !!m.pinned, plan: m.plan || '',
    published: m.published || [],
    created: m.created || new Date(st.birthtimeMs).toISOString(),
    updated: new Date(updatedOf(dir, type)).toISOString(),
    thumb: thumbOf(dir, type), zip: z[0]?.name || null,
    thumbs: type === 'card' ? outImages(dir).slice(0, 3) : [thumbOf(dir, type)].filter(Boolean),
    pages: type === 'card' ? cardPages(dir).length : null,
    images: type === 'card' ? outImages(dir).length : null,
    chars: type === 'article' ? countChars(articleText(dir)) : null,
    // 视频脚本：按口播原话估的时长（秒）
    speakSec: form === 'script' ? speakSeconds(read(path.join(dir, 'article.md'))) : null,
    noteSize: (m.notes || '').length,
    brief: m.brief || '',
    phase: m.phase || '',
  };
  if (full) {
    p.notes = m.notes || '';
    p.history = (m.history || []).slice(-100).reverse();
    p.commands = m.commands || {};
    p.outputs = outImages(dir);
    p.zips = z.map(x => x.name);
    p.previews = previewsOf(dir, type);
    p.files = fileTree(dir);
    p.cardList = type === 'card' ? cardPages(dir) : [];
    // 源文件比成品新：提示「改过还没重新出图 / 构建」
    const outT = type === 'card' ? Math.max(0, ...outImages(dir).map(f => mtime(path.join(dir, f)))) : mtime(path.join(dir, 'out', 'wechat.html'));
    p.stale = outT > 0 && mtime(path.join(dir, type === 'card' ? 'index.html' : 'article.md')) > outT + 1000;
  }
  return p;
}

function previewsOf(dir, type) {
  const c = type === 'article'
    ? [['公众号版', 'out/wechat.html'], ['X 版', 'out/x.html'], ['公众号预览（单文件）', 'out/预览-公众号版.html']]
    : [['源页面', 'index.html']];
  return c.filter(([, f]) => exists(path.join(dir, f))).map(([name, file]) => ({ name, file }));
}

function fileTree(dir) {
  const out = [];
  const walk = (d, rel, depth) => {
    for (const n of ls(d).sort()) {
      if (n.startsWith('.') || n === 'node_modules') continue;
      const p = path.join(d, n), r = rel ? rel + '/' + n : n;
      let s; try { s = fs.statSync(p); } catch { continue; }
      if (s.isDirectory()) { out.push({ path: r, dir: true, size: 0, t: s.mtimeMs }); if (depth < 2) walk(p, r, depth + 1); }
      else out.push({ path: r, dir: false, size: s.size, t: s.mtimeMs });
      if (out.length > 400) return;
    }
  };
  walk(dir, '', 0);
  return out;
}

export function list(filter = {}) {
  let ps = projectDirs().map(d => load(d)).filter(Boolean);
  // 类型写 script 只要视频脚本；写 article 只要普通文章
  if (filter.type) { const f = formOf(filter.type), t = typeOf(filter.type); ps = ps.filter(p => f ? p.form === f : p.type === t && !p.form); }
  if (filter.status) ps = ps.filter(p => p.status === filter.status);
  if (filter.tag) ps = ps.filter(p => p.tags.includes(filter.tag));
  if (filter.pinned) ps = ps.filter(p => p.pinned);
  return ps.sort((a, b) => (b.pinned - a.pinned) || (b.updated > a.updated ? 1 : -1));
}

// 用名字找项目：完全相同 > 包含（忽略大小写、空格、横线）
export function resolve(query) {
  const all = projectDirs();
  const qn = norm(query);
  if (!qn) throw new Error('要给出项目名');
  const byId = all.find(d => path.basename(d) === query);
  if (byId) return byId;
  const hits = all.filter(d => { const p = load(d); return norm(p.id).includes(qn) || norm(p.title).includes(qn); });
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error(`没找到项目「${query}」。用 xy list 看全部项目`);
  throw new Error(`「${query}」匹配到多个项目：${hits.map(d => path.basename(d)).join('、')}。请写得更具体`);
}

/* ---------- 写元数据 ---------- */
export function log(dir, action, detail = '') {
  const m = readMeta(dir);
  const e = { t: new Date().toISOString(), action, detail };
  m.history = [...(m.history || []), e].slice(-200);
  writeMeta(dir, m);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(ACTIVITY_FILE, JSON.stringify({ ...e, id: path.basename(dir) }) + '\n');
}

export function update(dir, patch, source = 'cli') {
  const m = readMeta(dir), changes = [];
  const before = load(dir);
  if (!m.type) m.type = before.type;
  if (!m.created) m.created = before.created;
  if (patch.title != null && patch.title !== before.title) { m.title = String(patch.title).trim(); changes.push(`标题改为「${m.title}」`); }
  if (patch.status != null) {
    if (!STATUSES.includes(patch.status)) throw new Error(`状态只能是：${STATUSES.join(' / ')}`);
    if (patch.status !== before.status) { m.status = patch.status; changes.push(`状态 ${before.status} → ${patch.status}`); }
  }
  if (patch.tags != null) {
    const t = [...new Set((Array.isArray(patch.tags) ? patch.tags : String(patch.tags).split(/[,，]/)).map(s => s.trim()).filter(Boolean))];
    if (t.join() !== before.tags.join()) { m.tags = t; changes.push(`标签：${t.join('、') || '（清空）'}`); }
  }
  if (patch.addTags) for (const t of patch.addTags) if (!(m.tags ||= [...before.tags]).includes(t)) { m.tags.push(t); changes.push(`加标签 ${t}`); }
  if (patch.removeTags) for (const t of patch.removeTags) { m.tags ||= [...before.tags]; if (m.tags.includes(t)) { m.tags = m.tags.filter(x => x !== t); changes.push(`去标签 ${t}`); } }
  if (patch.pinned != null && !!patch.pinned !== before.pinned) { m.pinned = !!patch.pinned; changes.push(m.pinned ? '加星标' : '取消星标'); }
  if (patch.plan != null && patch.plan !== before.plan) {
    if (patch.plan && !/^\d{4}-\d{2}-\d{2}$/.test(patch.plan)) throw new Error('计划日期格式是 YYYY-MM-DD');
    m.plan = patch.plan; changes.push(patch.plan ? `计划发布 ${patch.plan}` : '清空计划日期');
  }
  if (patch.notes != null && patch.notes !== (m.notes || '')) { m.notes = patch.notes; changes.push('改了笔记'); }
  if (patch.summary != null && patch.summary !== m.summary) { m.summary = String(patch.summary); changes.push('改了摘要'); }
  // 新建时写的要求：写什么、给谁看、角度、要哪些内容……助手每次都会读
  if (patch.brief != null && patch.brief !== (m.brief || '')) { m.brief = String(patch.brief).slice(0, 4000); changes.push('改了要求'); }
  if (patch.phase != null && patch.phase !== (m.phase || '')) { m.phase = patch.phase === 'outline' ? 'outline' : ''; changes.push(m.phase ? '开始定大纲' : '大纲定了，开始写'); }
  if (patch.appendNote) { m.notes = ((m.notes || '').trimEnd() + `\n\n${today()}　${patch.appendNote}`).trim(); changes.push('加了一条笔记'); }
  if (patch.published) { m.published = patch.published; changes.push('改了发布记录'); }
  if (patch.addPublish) {
    const r = { platform: patch.addPublish.platform || '其他', url: patch.addPublish.url || '', date: patch.addPublish.date || today() };
    m.published = [...(m.published || before.published), r];
    m.status = '已发布';
    changes.push(`发布到${r.platform}${r.url ? '：' + r.url : ''}`);
  }
  // 构建 / 打包命令只能从命令行改，网页不能改（防止网页被利用来跑任意命令）
  if (source === 'cli' && patch.commands) { m.commands = { ...(m.commands || {}), ...patch.commands }; changes.push('改了构建/打包命令'); }
  if (!changes.length) return load(dir, true);
  writeMeta(dir, m);
  log(dir, source === 'web' ? '编辑' : '命令行编辑', changes.join('；'));
  return load(dir, true);
}

/* ---------- 构建 / 打包 ---------- */
async function renderCards(dir, title) {
  const pages = cardPages(dir);
  if (!pages.length) throw new Error('index.html 里没找到 <section class="card" data-n="…">');
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  const existing = ls(path.join(dir, 'out')).filter(f => /\.(jpe?g|png)$/i.test(f));
  const slug = title.replace(/[\s/\\:*?"<>|]+/g, '');
  const prof = path.join(DATA_DIR, 'chrome');
  const tmp = path.join(DATA_DIR, 'shot.png');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const url = fileUrl(path.join(dir, 'index.html'));
  const made = [];
  for (const n of pages) {
    const nn = String(n).padStart(2, '0');
    // Mac 上用 sips 转成 jpg；别的系统没有 sips，直接存 Chrome 截出来的 png
    const ext = MAC ? 'jpg' : 'png';
    const name = existing.find(f => new RegExp(`_${nn}[^/]*\\.${MAC ? 'jpe?g' : 'png'}$`, 'i').test(f)) || `${today()}_${slug}_${nn}.${ext}`;
    const shot = `${q(CHROME)} --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --user-data-dir=${q(prof)} --force-device-scale-factor=2 --window-size=720,960 --virtual-time-budget=3000 --screenshot=${q(MAC ? tmp : path.join(dir, 'out', name))} ${q(url + '?c=' + n)}`;
    const r = await sh(MAC ? `${shot} && sips -s format jpeg -s formatOptions 90 ${q(tmp)} --out ${q(path.join(dir, 'out', name))}` : shot, dir, 120000);
    if (!r.ok) throw new Error(`第 ${n} 页渲染失败：${r.out.slice(-400)}`);
    made.push('out/' + name);
  }
  return made;
}

export async function build(dir) {
  const p = load(dir, true);
  let out;
  if (p.commands.build) {
    const r = await sh(p.commands.build, dir); if (!r.ok) throw new Error(r.out.slice(-1500)); out = r.out;
  } else if (p.type === 'card') {
    const made = await renderCards(dir, p.title); out = `渲染了 ${made.length} 页：\n` + made.join('\n');
  } else {
    const steps = [];
    if (exists(path.join(dir, 'build.mjs'))) steps.push(`${NODE} build.mjs`);
    if (exists(path.join(dir, 'embed.py'))) steps.push('python3 embed.py');
    if (!steps.length) throw new Error('这篇文章没有 build.mjs，不知道怎么构建。可以用 xy set <项目> --build "命令" 指定');
    const r = await sh(steps.join(' && '), dir); if (!r.ok) throw new Error(r.out.slice(-1500)); out = r.out;
  }
  log(dir, '构建', (out.startsWith('渲染了') ? out.split('\n')[0] : out.split('\n').slice(-1)[0]).slice(0, 120));
  return out;
}

export async function pack(dir) {
  const p = load(dir, true);
  const slug = p.title.replace(/[\s/\\:*?"<>|]+/g, '');
  const name = p.zip || `${today()}_${slug}.zip`;
  let r;
  if (p.commands.pack) r = await sh(p.commands.pack, dir);
  else if (p.type === 'card') {
    if (!p.outputs.length) throw new Error('out/ 里还没有图片，先运行 xy build');
    fs.rmSync(path.join(dir, name), { force: true });
    r = await sh(WIN ? `tar -a -c -f ${q(name)} -C out ${p.outputs.map(f => q(path.basename(f))).join(' ')}` : `zip -q -j -X ${q(name)} ${p.outputs.map(q).join(' ')}`, dir);
  } else {
    fs.rmSync(path.join(dir, name), { force: true });
    r = await sh(WIN
      ? `tar -a -c -f ${q(name)} --exclude out/.chrome --exclude out/figs.html --exclude "out/cover-*.html" out article.md`
      : `zip -q -r -X ${q(name)} out article.md -x 'out/.chrome/*' 'out/figs.html' 'out/cover-*.html'`, dir);
  }
  if (!r.ok) throw new Error('打包失败：' + r.out.slice(-800));
  const z = zips(dir)[0];
  const size = z ? (fs.statSync(path.join(dir, z.name)).size / 1048576).toFixed(1) + ' MB' : '';
  log(dir, '打包', `${z?.name || name} ${size}`);
  return { zip: z?.name || name, size, path: path.join(dir, z?.name || name) };
}

/* ---------- 新建 ---------- */
// 构建脚本（build.mjs）连带引用的本地文件，比如 './pixel-diagrams.mjs' → './pixfont.mjs'；返回相对项目根目录的路径
export function localImports(dir, file = 'build.mjs', seen = new Set()) {
  const f = path.join(dir, file);
  if (!exists(f)) return [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.\.?\/[^'"]+)['"]/g;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) {
    const rel = path.relative(dir, path.resolve(path.dirname(f), m[1]));
    if (rel.startsWith('..') || path.isAbsolute(rel) || seen.has(rel) || !exists(path.join(dir, rel))) continue;
    seen.add(rel);
    if (/\.m?js$/.test(rel)) localImports(dir, rel, seen);
  }
  return [...seen];
}
export function create(type, name, from, opts = {}) {
  const form = formOf(type) || (opts.form === 'script' ? 'script' : '');
  type = typeOf(type);
  if (!type) throw new Error('类型只能是 article（文章）、script（视频脚本）或 card（小红书卡片）');
  name = String(name || '').trim();
  if (!name || /[/\\]/.test(name)) throw new Error('名字不能为空，也不能带 / \\');
  const c = config();
  const dir = path.join(c.roots[0], type === 'card' ? c.cardPrefix + name : name);
  if (exists(dir)) throw new Error(`文件夹已存在：${dir}`);
  // 默认拿最近一个同类项目当骨架；文章优先挑构建脚本不依赖别的本地文件的那篇
  // （有的文章的 build.mjs 会引用只属于它自己的脚本，比如每次构建都重画那篇专属示意图的 pixel-diagrams.mjs，带过来没用还会生成别人的图）
  // 视频脚本用的是文章那套排版骨架，所以也从文章里挑
  const cands = list().filter(p => p.type === type).map(p => p.dir);
  // 一篇同类项目都没有时（比如刚装好的工作台），文章用自带的示例项目当骨架
  const sample = path.join(APP_DIR, 'templates', 'sample');
  const tplDir = from ? resolve(from) : (type === 'article' && cands.find(d => !localImports(d).length)) || cands[0]
    || (type === 'article' && exists(path.join(sample, 'build.mjs')) ? sample : undefined);
  fs.mkdirSync(dir, { recursive: true });
  if (tplDir) {
    if (detect(tplDir) !== type) throw new Error('模板项目和新项目的类型不一样');
    // 构建脚本 import 的本地文件也要带上，不然一构建就报“找不到模块”
    const keep = new Set(type === 'article' ? localImports(tplDir).map(r => r.split('/')[0]) : []);
    for (const n of ls(tplDir)) {
      if (n.startsWith('.') || n === 'out' || n.endsWith('.zip') || /长图预览/.test(n)) continue;
      // 文章只要骨架：构建脚本、依赖、样式；别人的配图、封面和示意图源文件不带过来
      if (type === 'article' && !/^(build\.mjs|package\.json|theme\.css|embed\.py|node_modules)$/.test(n) && !keep.has(n)) continue;
      const s = path.join(tplDir, n), d = path.join(dir, n);
      // 依赖库链到工作台自带的那份（templates/runtime），不链别的项目：那个项目删了，这篇就构建不了、编辑器也排不了版
      if (n === 'node_modules') { const rt = path.join(APP_DIR, 'templates', 'runtime', 'node_modules'); fs.symlinkSync(exists(rt) ? rt : fs.realpathSync(s), d, 'junction'); continue; }
      fs.cpSync(s, d, { recursive: true });
    }
  }
  if (type === 'article' && tplDir && !exists(path.join(dir, 'node_modules'))) {
    const rt = path.join(APP_DIR, 'templates', 'runtime', 'node_modules');
    if (exists(rt)) fs.symlinkSync(rt, path.join(dir, 'node_modules'), 'junction');
  }
  if (type === 'article') {
    // 模板文章自己的封面不要带过来，不然新文章的缩略图会是旧封面
    for (const f of ls(path.join(dir, 'img'))) if (/^(cover-.*|hero)\.(png|jpe?g)$/i.test(f)) fs.rmSync(path.join(dir, 'img', f));
    fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
    if (opts.theme) fs.writeFileSync(path.join(dir, 'theme.css'), opts.theme);
    fs.writeFileSync(path.join(dir, 'article.md'), form === 'script' ? scriptSkeleton(name, opts.script)
      : `# ${name}\n\n<p class="deck">一句话副标题</p>\n\n正文从这里开始。\n\n## 01 第一章 | CHAPTER\n\n`);
  } else if (!tplDir) {
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${name}</title><style>body{margin:0;background:#e6e3dc}.card{width:720px;height:960px;background:#fbfaf7;display:flex;align-items:center;justify-content:center;font:600 48px "PingFang SC";margin:24px auto}body.one .card{display:none;margin:0}body.one .card.show{display:flex}</style>\n<section class="card" data-n="1">${name}</section>\n<script>var n=new URLSearchParams(location.search).get('c');if(n){document.body.classList.add('one');document.querySelector('.card[data-n="'+n+'"]').classList.add('show')}</script></html>\n`);
  } else {
    const f = path.join(dir, 'index.html');
    fs.writeFileSync(f, read(f).replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`));
  }
  writeMeta(dir, { type, ...(form ? { form } : {}), title: name, status: '灵感', created: new Date().toISOString(), template: tplDir ? path.basename(tplDir) : null });
  log(dir, '新建', tplDir ? `从「${path.basename(tplDir)}」复制模板` : '空白项目');
  return load(dir, true);
}

/* ---------- 打开 ---------- */
export async function open(dir, how = 'finder', port) {
  const p = load(dir, true);
  let target, cmd;
  if (how === 'finder') cmd = openCommand(dir);
  else if (how === 'preview') {
    target = p.type === 'card' ? 'index.html' : (p.previews.find(x => x.file.includes('预览-公众号版')) || p.previews[0])?.file;
    if (!target) throw new Error('还没有可预览的文件，先构建');
    cmd = openCommand(path.join(dir, target));
  } else if (how === 'edit') {
    target = p.type === 'card' ? 'index.html' : 'article.md';
    cmd = openCommand(path.join(dir, target), 'text');
  } else if (how === 'zip') {
    if (!p.zip) throw new Error('还没有打包');
    cmd = openCommand(path.join(dir, p.zip), 'reveal');
  } else if (how === 'web') cmd = openCommand(`http://127.0.0.1:${port || config().port}/#/p/${encodeURIComponent(p.id)}`);
  else throw new Error('打开方式只能是 finder / preview / edit / zip / web');
  const r = await sh(cmd, dir, 20000);
  // Windows 的 explorer 打开成功也会返回 1
  if (!r.ok && !WIN) throw new Error(r.out);
  return target || dir;
}

/* ---------- 搜索 ---------- */
export function search(text) {
  const qn = String(text || '').trim().toLowerCase();
  if (!qn) return [];
  const out = [];
  for (const d of projectDirs()) {
    const p = load(d), m = readMeta(d);
    const src = p.type === 'article' ? articleText(d) : stripHtml(read(path.join(d, 'index.html')));
    const fields = [['标题', p.title], ['标签', p.tags.join(' ')], ['笔记', m.notes || ''], ['正文', src]];
    const hits = [];
    for (const [where, t] of fields) {
      const low = t.toLowerCase(); let i = low.indexOf(qn), n = 0;
      while (i >= 0 && n < 3) { hits.push({ where, snippet: t.slice(Math.max(0, i - 24), i + qn.length + 36).replace(/\s+/g, ' ').trim() }); i = low.indexOf(qn, i + qn.length); n++; }
    }
    if (hits.length) out.push({ id: p.id, title: p.title, type: p.type, hits });
  }
  return out;
}

/* ---------- 其他 ---------- */
export function activity(limit = 50, id) {
  const lines = read(ACTIVITY_FILE).trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return (id ? lines.filter(x => x.id === id) : lines).slice(-limit).reverse();
}

export function addRoot(p, type) {
  const c = config(), abs = path.resolve(p);
  if (!exists(abs)) throw new Error('路径不存在：' + abs);
  if (!detect(abs)) {
    const t = typeOf(type); if (!t) throw new Error('这个文件夹认不出类型，加上 --type article 或 --type card');
    writeMeta(abs, { ...readMeta(abs), type: t });
  }
  if (!c.extra.includes(abs)) { c.extra.push(abs); saveConfig(c); }
  return load(abs);
}

// 网页用来判断要不要刷新：项目文件夹和元数据的修改时间
export function stamp() {
  return projectDirs().map(d => `${path.basename(d)}:${updatedOf(d, detect(d))}`).join('|').length + ':' +
    projectDirs().reduce((s, d) => s + updatedOf(d, detect(d)), 0);
}

export function tags() {
  const c = {}; for (const p of list()) for (const t of p.tags) c[t] = (c[t] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

export function safeFile(dir, rel) {
  const f = path.resolve(dir, rel);
  if (!f.startsWith(dir + path.sep)) return null;
  if (f.split(path.sep).some(s => s.startsWith('.'))) return null;
  return exists(f) && fs.statSync(f).isFile() ? f : null;
}
