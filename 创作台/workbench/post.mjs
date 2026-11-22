// 发到国内平台（小红书、知乎、今日头条、微博）：把 article.md 转成各平台编辑器粘贴后能保住的格式，图片按顺序整理成文件。
// 知乎、头条、微博的文章编辑器粘贴时都认：小标题、粗体、斜体、链接、有序/无序列表、引用。小红书笔记正文只认纯文字。
//   - 一级标题是平台的标题栏，单独填，不进正文
//   - 三级及以下标题改成粗体段落；章节标题里的「 | ENGLISH」去掉
//   - 图片粘不进去：正文里留「【插图 03】」占位，图注放在下一行（斜体），图片文件放进 out/<平台>/03.png 这样按号排好；小红书没有占位，图按顺序单独传
//   - 表格平台编辑器支持得不好：用文章自己的样式渲染成图片，和插图一起编号
//   - SVG、静态 WebP 转 PNG；动图 WebP 用构建出来的同名 GIF；分隔线直接去掉
//   - 刊头、目录、参考资料这些自定义块：目录改成列表，参考资料改成「参考资料」小节 + 列表，刊头去掉
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import * as core from './core.mjs';
import { renderMarkdown } from './edit.mjs';
import { CHROME, fileUrl } from './platform.mjs';

// 各平台的限制和提示（页面照着显示）
export const PLATFORMS = {
  xhs: { name: '小红书', titleMax: 20, charsMax: 1000, plain: true, imagesMax: 18, tips: '小红书笔记的正文只认纯文字：复制后粘进正文。图片按顺序一张张传，第一张就是封面（竖图 3:4 最好看）。想要更好看的图文，可以在「作品」里新建一组小红书卡片。' },
  zhihu: { name: '知乎', titleMax: 100, tips: '在知乎「写文章」的正文里粘贴：小标题、粗体、链接、列表、引用都会保留；表格已经转成图片，和插图一起编号。' },
  toutiao: { name: '今日头条', titleMax: 30, tips: '在头条号「发布文章」的正文里粘贴：小标题、粗体、列表、引用都会保留；表格已经转成图片，和插图一起编号。标题要 2 到 30 个字。' },
  weibo: { name: '微博', titleMax: 32, tips: '在微博「头条文章」的正文里粘贴：小标题、粗体、列表、引用都会保留；表格已经转成图片，和插图一起编号。' },
};

const ALLOWED = new Set(['p', 'h2', 'b', 'strong', 'i', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'br']);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const textOf = h => String(h).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

// 只留编辑器认的标签；一级、三级以下标题变粗体段落；其余标签拆掉只留文字
function clean(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|table|figure|svg|video|iframe)[\s\S]*?<\/\1>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<(h1|h[3-6])[^>]*>/gi, '<p><b>').replace(/<\/(h1|h[3-6])>/gi, '</b></p>')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => `<blockquote>${textOf(c).split('\n').map(esc).join('<br>')}</blockquote>`)
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag, attrs) => {
      tag = tag.toLowerCase();
      if (!ALLOWED.has(tag)) return '';
      if (m.startsWith('</')) return `</${tag}>`;
      if (tag === 'a') { const h = attrs.match(/href="([^"]*)"/); return h && /^https?:/.test(h[1]) ? `<a href="${h[1]}">` : '<a>'; }
      return `<${tag}>`;
    })
    .replace(/<a>([\s\S]*?)<\/a>/g, '$1')
    .replace(/<p>\s*<\/p>/g, '').trim();
}

// 用无头 Chrome 把一段 HTML 截成图：先量高度，再按这个高度截（2 倍图）
function shotHtml(html, out, width) {
  const tmp = path.join(path.dirname(out), '.page.html'), prof = path.join(core.DATA_DIR, 'chrome-post');
  const page = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style>${html}<script>document.title=Math.ceil(document.querySelector('#box').getBoundingClientRect().height)</script>`;
  fs.writeFileSync(tmp, page);
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${prof}`, '--virtual-time-budget=3000'];
  const dom = execFileSync(CHROME, [...args, '--dump-dom', fileUrl(tmp)], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
  const h = Math.min(6000, Math.max(40, +(dom.match(/<title>(\d+)<\/title>/)?.[1] || 600)));
  execFileSync(CHROME, [...args, `--window-size=${width},${h}`, '--force-device-scale-factor=2', `--screenshot=${out}`, fileUrl(tmp)], { timeout: 60000, stdio: 'ignore' });
  fs.rmSync(tmp, { force: true });
}

// 一张图转成平台能传的文件；返回 { file, anim, note }
function prepImage(dir, src, dest) {
  if (/^https?:/.test(src)) return { note: '网上的图，要自己下载后再传' };
  const f = path.join(dir, decodeURI(src)); if (!fs.existsSync(f)) return { note: '找不到图片文件：' + src };
  const ext = path.extname(f).toLowerCase(), base = path.basename(f, ext), built = path.join(dir, 'out', 'img');
  const fresh = (out, from) => fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(from).mtimeMs;
  if (ext === '.svg') {
    const out = dest + '.png', png = path.join(built, base + '.png');
    if (fs.existsSync(png) && fs.statSync(png).mtimeMs >= fs.statSync(f).mtimeMs) fs.copyFileSync(png, out);
    else if (!fresh(out, f)) {
      const svg = fs.readFileSync(f, 'utf8'), vb = svg.match(/viewBox="[\d.\s-]+?\s([\d.]+)\s([\d.]+)"/), w = Math.round(+(svg.match(/<svg[^>]*\swidth="([\d.]+)/)?.[1] || vb?.[1] || 1200));
      shotHtml(`<img id="box" src="${fileUrl(f)}" style="display:block;width:${Math.min(1080, w)}px">`, out, Math.min(1080, w));
    }
    return { file: out };
  }
  if (ext === '.webp') {
    const anim = fs.readFileSync(f).subarray(0, 4096).includes('ANIM');
    if (anim) {
      const gif = path.join(built, base + '.gif');
      if (fs.existsSync(gif)) { fs.copyFileSync(gif, dest + '.gif'); return { file: dest + '.gif', anim: true }; }
      fs.copyFileSync(f, dest + '.webp'); return { file: dest + '.webp', anim: true, note: '动图 WebP，平台可能不认，先构建一次会自动出 GIF' };
    }
    const out = dest + '.png'; if (!fresh(out, f)) execFileSync('sips', ['-s', 'format', 'png', f, '--out', out], { stdio: 'ignore' });
    return { file: out };
  }
  if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) { const out = dest + (ext === '.jpeg' ? '.jpg' : ext); fs.copyFileSync(f, out); return { file: out, anim: ext === '.gif' }; }
  const out = dest + '.png'; execFileSync('sips', ['-s', 'format', 'png', f, '--out', out], { stdio: 'ignore' }); return { file: out };
}

export const folderOf = (dir, platform) => path.join(dir, 'out', PLATFORMS[platform] ? platform : 'zhihu');
export async function make(dir, platform = 'zhihu') {
  if (!PLATFORMS[platform]) throw new Error('不认识的平台：' + platform);
  const pf = PLATFORMS[platform];
  const md = fs.readFileSync(path.join(dir, 'article.md'), 'utf8').replace(/\r\n?/g, '\n');
  const outDir = folderOf(dir, platform); fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^\d\d\./.test(f) || /^\d\d-/.test(f)) fs.rmSync(path.join(outDir, f), { force: true });
  const blocks = md.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const css = fs.existsSync(path.join(dir, 'theme.css')) ? fs.readFileSync(path.join(dir, 'theme.css'), 'utf8') : '';
  const html = [], images = [], warnings = [];
  let title = '', n = 0;
  const rel = f => path.relative(dir, f).split(path.sep).join('/');
  const capOf = i => /^<p class="cap"/.test(blocks[i + 1] || '') ? blocks[i + 1] : null;
  const capText = c => textOf(c.replace(/<\/b>/, '</b>　'));
  const add = (kind, caption, r) => {
    html.push(`<p>【插图 ${pad(n)}】</p>`);
    if (caption) html.push(`<p><i>${esc(caption)}</i></p>`);
    images.push({ n, kind, caption, file: r.file ? rel(r.file) : null, anim: !!r.anim, note: r.note || '' });
    if (r.note) warnings.push(`插图 ${pad(n)}：${r.note}`);
  };
  for (let i = 0; i < blocks.length; i++) {
    let b = blocks[i];
    const fig = b.match(/^<!--\s*fig:\s*([\s\S]*?)-->/)?.[1]?.trim();
    b = b.replace(/^(<!--[\s\S]*?-->\s*)+/, '').trim(); if (!b) continue;
    let m;
    if ((m = b.match(/^#\s+(.*)$/)) && !b.includes('\n')) { if (!title) title = textOf(m[1]); continue; }
    if (/^#\s*$/.test(b)) continue;
    if ((m = b.match(/^##\s+(.+)$/)) && !b.includes('\n')) { html.push(`<h2>${clean((await renderMarkdown(dir, m[1].replace(/\s*\|\s*[A-Z0-9][A-Z0-9 ;:&'.,!?/-]*$/, ''))).replace(/^<p>|<\/p>\s*$/g, ''))}</h2>`); continue; }
    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(b)) continue;
    // 图片（一块里可能有几张）
    if (/^(!\[[^\]]*\]\([^)]+\)\s*)+$/.test(b)) {
      const cap = capOf(i); if (cap) i++;
      const list = [...b.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)];
      list.forEach(([, alt, src], k) => { n++; add('图', k === list.length - 1 && cap ? capText(cap) : (list.length > 1 ? '' : (cap ? capText(cap) : alt)), prepImage(dir, src, path.join(outDir, pad(n)))); });
      continue;
    }
    // 表格 → 图片
    if (/^\|.*\|\s*\n\|[\s:|-]+\|/.test(b)) {
      const cap = capOf(i); if (cap) i++;
      n++; const out = path.join(outDir, pad(n) + '.png');
      try {
        // 同样的表格、同样的样式截过一次就不再截（打开预览要快）
        const page = `<style>${css}</style><style>#box{width:640px;padding:18px 20px;box-sizing:border-box}.article table{width:100%}</style><div id="box"><section class="article">${await renderMarkdown(dir, b)}</section></div>`;
        const cache = path.join(outDir, '.cache'); fs.mkdirSync(cache, { recursive: true });
        const hit = path.join(cache, crypto.createHash('md5').update(page).digest('hex').slice(0, 16) + '.png');
        if (!fs.existsSync(hit)) shotHtml(page, hit, 640);
        fs.copyFileSync(hit, out); add('表', cap ? capText(cap) : (fig || '表格'), { file: out });
      }
      catch (e) { add('表', cap ? capText(cap) : fig || '表格', { note: '表格没渲染成图：' + e.message.slice(0, 80) }); }
      continue;
    }
    if (/^<p class="cap"/.test(b)) { html.push(`<p><i>${esc(capText(b))}</i></p>`); continue; }
    if (/^<div class="mast/.test(b)) continue;
    if (/^<div class="toc"/.test(b)) {
      const t = textOf(b.match(/<p class="toc-t">([\s\S]*?)<\/p>/)?.[1] || '本篇内容');
      const items = [...b.matchAll(/<p class="toc-i">([\s\S]*?)<\/p>/g)].map(x => esc(textOf(x[1].replace(/<\/b>/, '</b> ')).replace(/\s*　\s*/g, '　')));
      html.push(`<p><b>${esc(t)}</b></p>`, `<ul>${items.map(x => `<li>${x}</li>`).join('')}</ul>`); continue;
    }
    if (/^<div class="sources"/.test(b)) {
      let list = [];
      const flush = () => { if (list.length) html.push(`<ul>${list.join('')}</ul>`); list = []; };
      for (const x of b.matchAll(/<p class="(src-[a-z]+)">([\s\S]*?)<\/p>/g)) {
        const [, k, inner] = x;
        if (k === 'src-t') { flush(); html.push(`<h2>${esc(textOf(inner))}</h2>`); }
        else if (k === 'src-h') { flush(); html.push(`<p><b>${esc(textOf(inner))}</b></p>`); }
        else if (k === 'src-i') {
          const no = textOf(inner.match(/<span class="src-n">([\s\S]*?)<\/span>/)?.[1] || ''), a = inner.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/), d = textOf(inner.match(/<span class="src-d">([\s\S]*?)<\/span>/)?.[1] || '');
          list.push(`<li>${no ? esc(no) + ' ' : ''}${a ? `<a href="${a[1]}">${esc(textOf(a[2]))}</a>` : ''}${d ? '：' + esc(d) : ''}</li>`);
        } else { flush(); html.push(`<p>${esc(textOf(inner))}</p>`); }
      }
      flush(); continue;
    }
    if (/^<div class="callout"/.test(b)) { html.push(`<blockquote>${clean(b.replace(/<p class="t">([\s\S]*?)<\/p>/, '<p><b>$1</b></p>'))}</blockquote>`); continue; }
    if (/^<p class="deck"/.test(b)) { html.push(`<p><i>${esc(textOf(b))}</i></p>`); continue; }
    // 其余：Markdown 或零散 HTML，渲染后只留编辑器认的标签
    const h = clean(/^</.test(b) ? b : await renderMarkdown(dir, b));
    if (h) html.push(/^<(p|h2|ul|ol|blockquote)>/.test(h) ? h : `<p>${h}</p>`);
  }
  if (!title) title = core.load(dir)?.title || '';
  const body = html.join('\n');
  const text = body.replace(/<\/(p|h2|li|blockquote)>/g, '\n').replace(/<li>/g, '· ').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  // 封面：用公众号那张横版封面（知乎题图、头条和微博封面都能用，平台会让你再裁一下）；小红书第一张图就是封面，不另给
  let cover = null;
  if (!pf.plain) for (const c of ['img/cover-wechat.png', 'out/cover-wechat.png', 'img/cover-x.png', 'out/cover-x.png']) if (fs.existsSync(path.join(dir, c))) { fs.copyFileSync(path.join(dir, c), path.join(outDir, '00-cover.png')); cover = rel(path.join(outDir, '00-cover.png')); break; }
  // 小红书：正文是纯文字，不留插图占位和图注
  const plainText = pf.plain ? text.replace(/^【插图 \d+】\n?/gm, '').split('\n').filter((l, idx, a) => !(images.some(im => im.caption && l.trim() === im.caption.trim()))).join('\n').replace(/\n{3,}/g, '\n\n').trim() : text;
  if ([...title].length > pf.titleMax) warnings.unshift(`标题 ${[...title].length} 字，${pf.name}上限 ${pf.titleMax} 字，要改短`);
  if (pf.charsMax && [...plainText].length > pf.charsMax) warnings.unshift(`正文 ${[...plainText].length} 字，${pf.name}笔记上限 ${pf.charsMax} 字，要删减`);
  if (pf.imagesMax && images.length > pf.imagesMax) warnings.unshift(`图片 ${images.length} 张，${pf.name}最多 ${pf.imagesMax} 张`);
  fs.writeFileSync(path.join(outDir, 'post.html'), `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><h1>${esc(title)}</h1>\n${body}`);
  return { platform, ...pf, title, html: body, text: plainText, chars: [...plainText].length, images, cover, warnings, folder: rel(outDir), t: Date.now() };
}
