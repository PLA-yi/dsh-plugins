// 素材库：全局一个，存 AI 生成的图和从网上存下来的图；各篇文章 img/ 里已有的图也一起列出来，按文章分类看。
// 文件在 data/assets/files/，清单在 data/assets/index.json。用到某篇文章时复制进那篇的 img/。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as core from './core.mjs';
import * as ed from './edit.mjs';

const DIR = path.join(core.DATA_DIR, 'assets'), FILES = path.join(DIR, 'files'), INDEX = path.join(DIR, 'index.json');
const IMG_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const readIndex = () => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return []; } };
const writeIndex = l => { fs.mkdirSync(FILES, { recursive: true }); fs.writeFileSync(INDEX, JSON.stringify(l, null, 2)); };
export const filePath = name => { const f = path.join(FILES, path.basename(name)); return fs.existsSync(f) ? f : null; };

// 按文件头判断图片格式
function sniff(buf) {
  const h = buf.subarray(0, 16);
  if (h[0] === 0x89 && h[1] === 0x50) return 'png';
  if (h[0] === 0xff && h[1] === 0xd8) return 'jpg';
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (h.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (h.toString('ascii', 4, 12).startsWith('ftypavi')) return 'avif';
  if (/^\s*(<\?xml|<svg)/i.test(buf.subarray(0, 200).toString('utf8'))) return 'svg';
  return null;
}
// 读 PNG / JPEG 的宽高（够用就行）
function dims(buf, ext) {
  try {
    if (ext === 'png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (ext === 'jpg') {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
    if (ext === 'webp' && buf.toString('ascii', 12, 16) === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  } catch {}
  return {};
}

const urlOf = it => '/assets/' + encodeURIComponent(it.file);

// 存一张图进素材库
export function add(buf, meta = {}) {
  const ext = sniff(buf); if (!ext) throw new Error('这不是能识别的图片格式');
  const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const file = `${meta.kind === 'generated' ? 'ai' : 'web'}-${id}.${ext}`;
  fs.mkdirSync(FILES, { recursive: true });
  fs.writeFileSync(path.join(FILES, file), buf);
  const it = { id, file, kind: meta.kind || 'web', title: String(meta.title || '').slice(0, 120), source: meta.source || '', page: meta.page || '', prompt: meta.prompt || '', provider: meta.provider || '', project: meta.project || '', size: buf.length, ...dims(buf, ext), t: new Date().toISOString(), used: [] };
  const l = readIndex(); l.unshift(it); writeIndex(l);
  return { ...it, url: urlOf(it) };
}

// 从网址下载一张图进素材库
export async function fromUrl(url, meta = {}) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/.test(u.hostname)) throw new Error('这个地址不能下载');
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*', ...(meta.page ? { Referer: meta.page } : {}) }, signal: AbortSignal.timeout(30000), redirect: 'follow' });
  if (!r.ok) throw new Error(`下载失败（HTTP ${r.status}）`);
  const len = +r.headers.get('content-length') || 0; if (len > 20e6) throw new Error('图片太大（超过 20 MB）');
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 20e6) throw new Error('图片太大（超过 20 MB）');
  if (buf.length < 2000) throw new Error('图片太小，可能是图标或占位图');
  if (sniff(buf) === 'svg') throw new Error('网上的 SVG 可能带脚本，不存；换一张 PNG / JPG');
  return add(buf, { ...meta, kind: 'web', source: url });
}

export function get(id) { const it = readIndex().find(x => x.id === id); return it ? { ...it, url: urlOf(it) } : null; }
export function update(id, patch) {
  const l = readIndex(), it = l.find(x => x.id === id); if (!it) throw new Error('素材库里没有这张图');
  if (patch.title != null) it.title = String(patch.title).slice(0, 120);
  if (patch.project != null) it.project = String(patch.project);
  writeIndex(l); return { ...it, url: urlOf(it) };
}
export function remove(id) {
  const l = readIndex(), it = l.find(x => x.id === id); if (!it) throw new Error('素材库里没有这张图');
  try { fs.rmSync(path.join(FILES, it.file)); } catch {}
  writeIndex(l.filter(x => x !== it)); return { ok: true };
}

// 列出素材：素材库里的 + 各篇文章 img/ 里的
export function list({ project, kind, q } = {}) {
  const projects = core.list();
  const titleOf = id => projects.find(p => p.id === id)?.title || id;
  let items = readIndex().map(it => ({ ...it, url: urlOf(it), projectTitle: it.project ? titleOf(it.project) : '' }));
  const inProjects = [];
  for (const p of projects) {
    const d = path.join(p.dir, 'img'); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!IMG_EXT.test(f) || f.startsWith('.')) continue;
      let st; try { st = fs.statSync(path.join(d, f)); } catch { continue; }
      inProjects.push({ id: `p:${p.id}:${f}`, file: f, kind: 'project', title: f, project: p.id, projectTitle: p.title, size: st.size, t: new Date(st.mtimeMs).toISOString(), url: `/p/${encodeURIComponent(p.id)}/img/${encodeURIComponent(f)}` });
    }
  }
  // 从素材库插进文章的图，在文章里那份就不重复列了
  const copied = new Set(items.flatMap(it => (it.used || []).map(u => `${u.project}/${u.file}`)));
  items = items.concat(inProjects.filter(x => !copied.has(`${x.project}/${x.file}`)));
  if (project) items = items.filter(it => it.project === project || (it.used || []).some(u => u.project === project));
  if (kind) items = items.filter(it => it.kind === kind);
  if (q) { const k = q.toLowerCase(); items = items.filter(it => [it.title, it.prompt, it.source, it.page, it.file].join(' ').toLowerCase().includes(k)); }
  return items.sort((a, b) => (b.t > a.t ? 1 : -1));
}

// 只把素材复制进项目的 img/（卡片用），返回相对路径
export function copyInto(dir, id) {
  let src, name, it = null;
  if (id.startsWith('p:')) {
    const [, pid, f] = id.match(/^p:([^:]+):(.+)$/) || [];
    const p = core.list().find(x => x.id === pid); if (!p) throw new Error('找不到这张图所在的项目');
    src = path.join(p.dir, 'img', path.basename(f)); name = path.basename(f);
  } else {
    const l = readIndex(); it = l.find(x => x.id === id); if (!it) throw new Error('素材库里没有这张图：' + id);
    src = path.join(FILES, it.file); name = it.file;
  }
  if (!fs.existsSync(src)) throw new Error('图片文件不见了');
  fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
  const dest = path.join(dir, 'img', name); if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  if (it) { const l = readIndex(), x = l.find(y => y.id === id); x.used = [...(x.used || []).filter(u => u.project !== path.basename(dir)), { project: path.basename(dir), file: name }]; writeIndex(l); }
  return { file: 'img/' + name };
}

// 把素材放进文章：复制到 img/，在 after 那段后面插入图片（和图注）。after 为空就放在文末
export function insert(dir, id, { after = '', caption = '', alt = '' } = {}) {
  let srcFile, it = null, name;
  if (id.startsWith('p:')) {
    const [, pid, f] = id.match(/^p:([^:]+):(.+)$/) || [];
    const p = core.list().find(x => x.id === pid); if (!p) throw new Error('找不到这张图所在的文章');
    srcFile = path.join(p.dir, 'img', path.basename(f)); name = path.basename(f);
  } else {
    const l = readIndex(); it = l.find(x => x.id === id); if (!it) throw new Error('素材库里没有这张图：' + id);
    srcFile = path.join(FILES, it.file); name = it.file;
  }
  if (!fs.existsSync(srcFile)) throw new Error('图片文件不见了');
  const imgDir = path.join(dir, 'img'); fs.mkdirSync(imgDir, { recursive: true });
  const dest = path.join(imgDir, name);
  if (!fs.existsSync(dest)) fs.copyFileSync(srcFile, dest);
  if (it) { const l = readIndex(), x = l.find(y => y.id === id); x.used = [...(x.used || []).filter(u => u.project !== path.basename(dir)), { project: path.basename(dir), file: name }]; writeIndex(l); }

  const art = path.join(dir, 'article.md'); if (!fs.existsSync(art)) return { file: 'img/' + name, inserted: false };
  const text = fs.readFileSync(art, 'utf8');
  const md = `![${(alt || it?.title || '配图').replace(/[\[\]\n]/g, ' ')}](img/${name})` + (caption ? `\n\n<p class="cap">${caption}</p>` : '');
  const parts = text.split(/(\n{2,})/);
  let at = -1;
  if (after) {
    const plain = s => s.replace(/<[^>]+>/g, '').replace(/[*`#>\s]/g, '');
    const key = plain(after).slice(0, 60);
    at = parts.findIndex((b, i) => i % 2 === 0 && b.includes(after.trim()));
    if (at < 0 && key) at = parts.findIndex((b, i) => i % 2 === 0 && plain(b).includes(key));
    if (at < 0) throw new Error('在文章里没找到要插在哪段后面（after 要从原文里原样复制一句）');
  }
  ed.snapshot(dir, 'article.md', '插入配图');
  let out;
  if (at < 0) out = text.replace(/\s*$/, '') + '\n\n' + md + '\n';
  else { parts.splice(at + 1, 0, '\n\n' + md); out = parts.join(''); }
  fs.writeFileSync(art, out);
  core.log(dir, '插入配图', name);
  return { file: 'img/' + name, inserted: true, markdown: md };
}

// 网页上的图片：先 og:image，再正文里的 <img>（去掉图标、头像这类小图）
export async function pageImages(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/.test(u.hostname)) throw new Error('这个地址不能抓');
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!r.ok) throw new Error(`打开网页失败（HTTP ${r.status}）`);
  const html = await r.text(), base = r.url || url, out = [], seen = new Set();
  const abs = s => { try { return new URL(s.replace(/&amp;/g, '&'), base).toString(); } catch { return null; } };
  const push = (src, alt, w, h, from) => {
    const a = abs(src); if (!a || seen.has(a) || /^data:/.test(src)) return;
    if (/(sprite|favicon|logo|avatar|icon|emoji|badge|pixel|spacer|1x1)/i.test(a) && from !== 'og') return;
    if ((w && w < 200) || (h && h < 120)) return;
    seen.add(a); out.push({ url: a, alt: (alt || '').replace(/\s+/g, ' ').trim().slice(0, 120), width: w || null, height: h || null, from });
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/gi)) { const c = m[0].match(/content=["']([^"']+)/i); if (c) push(c[1], 'og:image', 0, 0, 'og'); }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0], attr = n => (t.match(new RegExp(`\\s${n}=["']([^"']*)["']`, 'i')) || [])[1];
    let src = attr('src') || attr('data-src') || attr('data-original');
    const set = attr('srcset') || attr('data-srcset');
    if (set) { const best = set.split(',').map(s => s.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] || 0) - parseInt(a[1] || 0))[0]; if (best?.[0]) src = best[0]; }
    if (src) push(src, attr('alt'), +attr('width') || 0, +attr('height') || 0, 'img');
    if (out.length >= 40) break;
  }
  return { page: base, title: ((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim().slice(0, 120), images: out };
}
