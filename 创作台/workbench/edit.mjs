// 精修用的源码操作：
//   卡片：把 index.html 里每个元素按出现顺序编号（data-wb），网页里点哪个元素，就能精确改源文件里对应的那一段
//   文章：读写 article.md，渲染预览
// 每次写入前都在项目的 .workbench/versions/ 存一个旧版本，撤销就是把最近的版本放回去
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

// 解析出每个元素在源码里的位置：[{ n, tag, start, openEnd, closeStart, end }]
export function parse(html) {
  const els = [], stack = [];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!')) continue;
    if (m[1]) {                                        // 结束标签
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) {
        while (stack.length > i) { const e = stack.pop(); if (e.tag === tag) { e.closeStart = m.index; e.end = m.index + m[0].length; } else { e.closeStart = m.index; e.end = m.index; } }
        break;
      }
      continue;
    }
    const tag = m[2].toLowerCase();
    const el = { n: els.length, tag, start: m.index, openEnd: m.index + m[0].length };
    els.push(el);
    if (VOID.has(tag) || /\/\s*$/.test(m[3])) { el.closeStart = el.end = el.openEnd; continue; }
    if (RAW.has(tag)) {                                 // 跳过 <style>/<script> 里面的内容
      const close = html.toLowerCase().indexOf(`</${tag}`, el.openEnd);
      const endTag = close < 0 ? html.length : html.indexOf('>', close) + 1;
      el.closeStart = close < 0 ? html.length : close; el.end = endTag; re.lastIndex = endTag; continue;
    }
    stack.push(el);
  }
  for (const e of stack) { e.closeStart = e.end = html.length; }
  return els;
}

// 给开始标签加上 data-wb="n"（网页里精修用的版本，不写回文件）
export function annotate(html) {
  const els = parse(html); let out = '', pos = 0;
  for (const e of els) {
    if (['html', 'head', 'meta', 'title', 'style', 'script', 'link', 'base'].includes(e.tag)) continue;
    const at = html[e.openEnd - 2] === '/' ? e.openEnd - 2 : e.openEnd - 1;
    out += html.slice(pos, at) + ` data-wb="${e.n}"`; pos = at;
  }
  return out + html.slice(pos);
}

/* ---------- 版本 ---------- */
function vdir(dir) { const d = path.join(dir, '.workbench', 'versions'); fs.mkdirSync(d, { recursive: true }); return d; }
export function snapshot(dir, file, label = '') {
  const src = path.join(dir, file); if (!fs.existsSync(src)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(src, path.join(vdir(dir), `${stamp}__${file.replace(/\//g, '_')}${label ? '__' + label.replace(/[\\/:*?"<>|\s]+/g, '') : ''}`));
  const all = versions(dir, file); for (const v of all.slice(80)) fs.rmSync(path.join(vdir(dir), v.name));   // 每个文件最多留 80 个
}
export function versions(dir, file) {
  const key = '__' + file.replace(/\//g, '_');
  return fs.readdirSync(vdir(dir)).filter(n => n.includes(key)).sort().reverse()
    .map(name => ({ name, t: name.split('__')[0].replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z'), label: name.split('__')[2] || '' }));
}
export function restore(dir, file, name) {
  const list = versions(dir, file);
  const v = name ? list.find(x => x.name === name) : list[0];
  if (!v) throw new Error('没有可撤销的版本了');
  const cur = path.join(dir, file);
  const back = fs.readFileSync(path.join(vdir(dir), v.name));
  if (!name) fs.rmSync(path.join(vdir(dir), v.name));          // 撤销：用掉最近一个版本
  else snapshot(dir, file, '恢复前');                            // 恢复指定版本前，先把现在的存一份
  fs.writeFileSync(cur, back);
  return v;
}

/* ---------- 卡片 ---------- */
const CARD = 'index.html';
const readCard = dir => fs.readFileSync(path.join(dir, CARD), 'utf8');
function writeCard(dir, html, label) { snapshot(dir, CARD, label); fs.writeFileSync(path.join(dir, CARD), html); }
function elAt(html, n) {
  const e = parse(html).find(x => x.n === +n);
  if (!e) throw new Error('页面已经变了，找不到这个元素，刷新后再选一次');
  return e;
}

export function cardElement(dir, n) {
  const html = readCard(dir), e = elAt(html, n);
  const sec = parse(html).filter(x => x.tag === 'section' && x.start <= e.start && x.end >= e.end).pop();
  return { outer: html.slice(e.start, e.end), inner: html.slice(e.openEnd, e.closeStart), tag: e.tag,
    section: sec ? html.slice(sec.start, sec.end) : '', css: (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n') };
}
export function cardReplace(dir, n, outer, label = 'AI 改写') {
  const html = readCard(dir), e = elAt(html, n);
  writeCard(dir, html.slice(0, e.start) + outer + html.slice(e.end), label);
}
export function cardSetInner(dir, n, inner) {
  const html = readCard(dir), e = elAt(html, n);
  if (VOID.has(e.tag)) throw new Error('这个元素没有文字内容');
  writeCard(dir, html.slice(0, e.openEnd) + inner + html.slice(e.closeStart), '改文字');
}
export function cardSetStyle(dir, n, styles) {
  const html = readCard(dir), e = elAt(html, n);
  let open = html.slice(e.start, e.openEnd);
  const m = open.match(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
  const cur = Object.fromEntries((m ? (m[2] ?? m[3]) : '').split(';').map(s => s.trim()).filter(Boolean).map(s => [s.slice(0, s.indexOf(':')).trim().toLowerCase(), s.slice(s.indexOf(':') + 1).trim()]));
  for (const [k, v] of Object.entries(styles)) {
    if (!/^[a-z-]+$/.test(k)) throw new Error('样式名不对：' + k);
    if (v === '' || v == null) delete cur[k]; else cur[k] = String(v).replace(/[";<>]/g, '');
  }
  const str = Object.entries(cur).map(([k, v]) => `${k}:${v}`).join(';');
  if (m) open = open.replace(m[0], str ? ` style="${str}"` : '');
  else if (str) open = open.replace(/\s*\/?>$/, x => ` style="${str}"${x.trim()}`);
  writeCard(dir, html.slice(0, e.start) + open + html.slice(e.openEnd), '改样式');
}
export function cardRemove(dir, n) {
  const html = readCard(dir), e = elAt(html, n);
  if (e.tag === 'section' || e.tag === 'body' || e.tag === 'html') throw new Error('整页不能删，只能删页面里的元素');
  writeCard(dir, html.slice(0, e.start) + html.slice(e.end), '删除元素');
}

/* ---------- 文章 ---------- */
const ART = 'article.md';
export function articleRead(dir) {
  const f = path.join(dir, ART);
  return { text: fs.readFileSync(f, 'utf8'), mtime: fs.statSync(f).mtimeMs };
}
// 写之前核对修改时间：别处（比如命令行里的 AI）改过就提示，不悄悄覆盖
export function articleWrite(dir, text, baseMtime, label = '') {
  const f = path.join(dir, ART);
  const cur = fs.statSync(f).mtimeMs;
  if (baseMtime && Math.abs(cur - baseMtime) > 1) throw Object.assign(new Error('文章在别处被改过了，刷新后再改，免得覆盖'), { status: 409 });
  const vs = versions(dir, ART);
  const last = vs[0] ? Date.parse(vs[0].t) : 0;
  if (label || Date.now() - last > 3 * 60 * 1000) snapshot(dir, ART, label || '自动');   // 普通保存每 3 分钟存一个版本
  fs.writeFileSync(f, text);
  return fs.statSync(f).mtimeMs;
}
// 大纲：单独一个 outline.md，大纲页读写它；还没有就是空的
const OUT = 'outline.md';
export function outlineRead(dir) {
  const f = path.join(dir, OUT);
  return fs.existsSync(f) ? { text: fs.readFileSync(f, 'utf8'), mtime: fs.statSync(f).mtimeMs } : { text: '', mtime: 0 };
}
export function outlineWrite(dir, text, baseMtime, label = '') {
  const f = path.join(dir, OUT);
  if (fs.existsSync(f)) {
    const cur = fs.statSync(f).mtimeMs;
    if (baseMtime && Math.abs(cur - baseMtime) > 1) throw Object.assign(new Error('大纲在别处被改过了（可能是 AI 刚改的），刷新后再改'), { status: 409 });
    const vs = versions(dir, OUT), last = vs[0] ? Date.parse(vs[0].t) : 0;
    if (label || Date.now() - last > 3 * 60 * 1000) snapshot(dir, OUT, label || '自动');
  }
  fs.writeFileSync(f, text);
  return fs.statSync(f).mtimeMs;
}
// 用项目自己的 marked 渲染预览；没有就退回最简单的段落渲染
// 先用这篇自己的 marked；找不到（依赖库链接断了）就用工作台自带的那份，别退回到只认标题的简陋排版
const RUNTIME = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates', 'runtime', 'package.json');
export async function renderMarkdown(dir, md) {
  for (const base of [path.join(dir, 'package.json'), RUNTIME]) {
    try { const { marked } = await import(pathToFileURL(createRequire(base).resolve('marked')).href); return marked.parse(md); } catch {}
  }
  {
    const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    return md.split(/\n{2,}/).map(b => /^#{1,3}\s/.test(b) ? `<h${b.match(/^#+/)[0].length}>${esc(b.replace(/^#+\s*/, ''))}</h${b.match(/^#+/)[0].length}>` : /^\s*</.test(b) ? b : `<p>${esc(b)}</p>`).join('\n');
  }
}

/* ---------- 阅读：取构建好的公众号版 / X 版正文，直接画在页面里 ---------- */
// 相对路径（img/…）改成工作台能访问的地址
function absolutize(html, base) {
  return html.replace(/(\s(?:src|href)=")(?!https?:|data:|\/|#|mailto:)([^"]+)"/g, (_, a, u) => `${a}${base}${u.split('/').map(encodeURIComponent).join('/')}"`);
}
export async function readView(dir, id, v = 'wechat') {
  const file = path.join(dir, 'out', v === 'x' ? 'x.html' : 'wechat.html');
  const md = path.join(dir, ART);
  const mdTime = fs.existsSync(md) ? fs.statSync(md).mtimeMs : 0;
  const base = `/p/${encodeURIComponent(id)}/`;
  if (fs.existsSync(file)) {
    const html = fs.readFileSync(file, 'utf8');
    const el = parse(html).find(e => e.tag === 'div' && /id="post"/.test(html.slice(e.start, e.openEnd)));
    if (el) {
      const body = html.slice(el.openEnd, el.closeStart).replace(/<script[\s\S]*?<\/script>/gi, '');
      const bt = fs.statSync(file).mtimeMs;
      return { built: true, html: absolutize(body, base + 'out/'), builtAt: new Date(bt).toISOString(), stale: mdTime > bt + 1000 };
    }
  }
  // 还没构建过：用 article.md 现场渲染，样式用项目的 theme.css
  const body = await renderMarkdown(dir, fs.readFileSync(md, 'utf8'));
  return { built: false, html: absolutize(body, base), css: fs.existsSync(path.join(dir, 'theme.css')) ? base + 'theme.css' : null, stale: false };
}
export function absolutizeFor(html, id) { return absolutize(html, `/p/${encodeURIComponent(id)}/`); }
