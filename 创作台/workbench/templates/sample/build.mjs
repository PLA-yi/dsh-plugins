// 用法：node build.mjs [article.md]
// 一份 Markdown 出两个版本：
//   out/wechat.html  公众号版，样式全部写成行内，点按钮复制后粘进公众号编辑器
//   out/x.html       X 长文版，只留标题、加粗、列表、引用和图片；表格和数字块导出成图片
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { marked } from 'marked';
import juice from 'juice';

const src = process.argv[2] || 'article.md';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const OUT = 'out';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = path.resolve(OUT, '.chrome');
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync('img', path.join(OUT, 'img'), { recursive: true });

const css = fs.readFileSync('theme.css', 'utf8');
let html = marked.parse(fs.readFileSync(src, 'utf8'));

// 表格前写 <!-- fig: 标题 -->，会被包成一张图
html = html.replace(/<!--\s*fig:\s*(.*?)\s*-->\s*<table>([\s\S]*?)<\/table>/g,
  (_, t, b) => `<div class="tbl" data-fig="${t}"><table>${b}</table></div>`);
// “## 01 标题” 里的编号单独成行
// “## 01 标题 | ENGLISH” 变成章节开篇：大编号 + 英文小标 + 标题
html = html.replace(/<h2>(\d{2})\s+([\s\S]*?)(?:\s*\|\s*([^<]*?))?<\/h2>/g, (_, no, t, en) =>
  `<h2><span class="h2row"><span class="no">${no}</span><span class="en">${en ? en.trim() : ''}</span></span>${t.includes('：') ? `<span class="h2t">${t.split('：')[0]}</span><span class="h2q">${t.split('：').slice(1).join('：')}</span>` : `<span class="h2t">${t}</span>`}</h2>`);
// 图片包一层：头图和章节封面（hero、c-*）满宽不加框，产品截图加米色衬底，自己画的图（img/d*.png）只留原样
html = html.replace(/<p>(<img src="img\/hero\.png"[^>]*>)<\/p>/, '<div class="cov cov0">$1</div>')
  .replace(/<p>(<img src="img\/c-[^"]*"[^>]*>)<\/p>/g, '<div class="cov">$1</div>')
  .replace(/<p>(<img src="img\/p-[^"]*"[^>]*>)<\/p>/g, '<div class="cov pcd">$1</div>')   // 人物卡：不加框
  .replace(/<p>(<img src="img\/(d\d[^"]*)"[^>]*>)<\/p>/g, '<div class="dgm">$1</div>')
  .replace(/<p>(<img src="img\/[^"]+"[^>]*>)<\/p>/g, '<div class="pic">$1</div>');
// Markdown 图片后紧跟的 cap 是图注，不用处理

const inline = s => juice.inlineContent(`<section class="article">${s}</section>`, css,
  { applyAttributesTableElements: false, preserveImportant: true })
  .replace(/\sclass="[^"]*"/g, '').replace(/\sdata-fig="[^"]*"/g, '');

/* ---------- 公众号版 ---------- */
// 引语前加一个大引号（只给公众号版）
// 头图里已经有刊头和大标题，章节封面里已经有章节标题，公众号版就不再重复
let wx = html;
if (wx.includes('class="cov cov0"')) wx = wx.replace(/<div class="mast">[\s\S]*?<\/div>\s*/, '').replace(/<h1>[\s\S]*?<\/h1>\s*/, '');
wx = wx.replace(/<h2>(?:(?!<\/h2>)[\s\S])*<\/h2>\s*(<div class="cov">)/g, '$1');
const wechat = inline(wx.replace(/<blockquote>/g, '<blockquote><span class="qm">“</span>')
  .replace(/<h1>([^<，]*)，/, '<h1>$1，<br>')      // 标题在逗号处换行
  .replace(/<h1>(万字深度拆解)\s*([^<]+)<\/h1>/, '<h1>$1<br><span class="h1b">$2</span></h1>'));   // 标题两色
fs.writeFileSync(path.join(OUT, 'wechat.html'), page('公众号版', `
<div class="bar"><b>公众号版</b><span>样式已全部写成行内。点按钮复制，到公众号编辑器里粘贴。</span><button onclick="copyIt()">复制正文</button></div>
<div class="phone"><div id="post">${wechat}</div></div>`));

/* ---------- 图片：数字块、表格 ---------- */
const figs = blocks(html).map(b => ({ title: b.title, html: html.slice(b.start, b.end) }));
fs.writeFileSync(path.join(OUT, 'figs.html'), `<!doctype html><meta charset="utf-8">
<style>body{margin:0;background:#fff}.f{width:640px;padding:28px 32px 28px;box-sizing:border-box}.f .t{font:600 13px -apple-system,"PingFang SC",sans-serif;color:#2f6bff;letter-spacing:1px;margin-bottom:4px}
.f section>*{margin-top:18px!important;margin-bottom:0!important}body.one .f{display:none}body.one .f.show{display:block}</style>
${figs.map((f, i) => `<div class="f" id="f${i + 1}"><div class="t">图 ${i + 1} · ${f.title}</div>${inline(f.html)}</div>`).join('\n')}
<pre id="h"></pre>
<script>
var q=new URLSearchParams(location.search).get('f');
if(q){document.body.classList.add('one');document.getElementById('f'+q).classList.add('show');document.getElementById('h').remove()}
else{document.getElementById('h').textContent=JSON.stringify([].map.call(document.querySelectorAll('.f'),function(e){return Math.ceil(e.getBoundingClientRect().height)}))}
</script>`);
const figUrl = 'file://' + path.resolve(OUT, 'figs.html');
const dom = execFileSync(CHROME, ['--headless=new', '--disable-gpu', `--user-data-dir=${PROFILE}`, '--window-size=640,4000', '--virtual-time-budget=3000', '--dump-dom', figUrl], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const heights = JSON.parse(dom.match(/<pre id="h">([^<]*)<\/pre>/)[1]);
heights.forEach((h, i) => {
  const name = `fig-${String(i + 1).padStart(2, '0')}.png`;
  shot(`${figUrl}?f=${i + 1}`, 640, Math.max(h, 400), name);
  // 无头 Chrome 窗口有最小高度，截完按实际高度裁掉下面的空白
  execFileSync('sips', ['-c', String(h * 2), '1280', '--cropOffset', '1', '1', path.join(OUT, name)], { stdio: 'ignore' });
});

/* ---------- 封面 ---------- */
const title = (html.match(/<h1>([\s\S]*?)<\/h1>/) || [, ''])[1];
const kicker = (html.match(/<p class="kicker">([\s\S]*?)<\/p>/) || [, ''])[1].replace(/<[^>]+>/g, '');
const icons = ['doubao', 'workbuddy', 'qianwen', 'manus', 'dazi'].filter(n => fs.existsSync(`img/icon-${n}.png`)).map(n => `<img src="img/icon-${n}.png">`).join('');
const cover = (w, h, fs1) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0}.c{width:${w}px;height:${h}px;box-sizing:border-box;padding:${h * .07}px ${w * .05}px ${h * .06}px;display:flex;flex-direction:column;background:#f3f6fc;font-family:-apple-system,"PingFang SC",sans-serif;color:#2b2b2b}
.m{display:flex;justify-content:space-between;align-items:center;padding:${h * .018}px 0}
.m b{color:#2f6bff;font-family:-apple-system,"PingFang SC",sans-serif;font-size:${fs1 * .38}px;font-weight:700;letter-spacing:.05em}
.mono{font-size:${fs1 * .22}px;letter-spacing:.15em;color:#8a8580}
.b{flex:1;display:flex;align-items:center;justify-content:space-between;gap:${w * .04}px}
h1{font-family:-apple-system,"PingFang SC",sans-serif;font-size:${fs1 * 1.0}px;line-height:1.35;margin:0;font-weight:900;letter-spacing:.02em;color:#1f1f1f;padding-left:0}
h1 span{color:#2f6bff}
.i{flex:none}
.g{display:grid;grid-template-columns:repeat(3,${h * .15}px);gap:${h * .028}px;padding:${h * .035}px;background:#fff;border:1px solid #e4e9f2}
.g img{width:100%;border-radius:22%;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.f{display:flex;justify-content:space-between;border-top:1px solid #e4e9f2;padding-top:${h * .025}px}
</style><div class="c"><div class="m"><b>${esc(process.env.WB_AUTHOR || '')}</b><span class="mono">${new Date().toISOString().slice(0, 10)}</span></div>
<div class="b"><h1>${title.replace(/^(万字深度拆解)\s*/, '$1<br><span>') + (title.startsWith('万字深度拆解') ? '</span>' : '')}</h1>${icons ? `<div class="i"><div class="g">${icons}</div></div>` : ''}</div>
<div class="f"><span class="mono"></span><span class="mono">${esc(process.env.WB_INTRO || '')}</span></div></div>`;
fs.writeFileSync(path.join(OUT, 'cover-x.html'), cover(750, 300, 40));
fs.writeFileSync(path.join(OUT, 'cover-wechat.html'), cover(900, 383, 44));
// covers.html 画好的封面优先（img/cover-*.png），没有才用这里的旧版
for (const [n, w, h] of [['cover-x', 750, 300], ['cover-wechat', 900, 383]]) {
  if (fs.existsSync(`img/${n}.png`)) fs.copyFileSync(`img/${n}.png`, path.join(OUT, `${n}.png`));
  else shot('file://' + path.resolve(OUT, `${n}.html`), w, h, `${n}.png`);
}

/* ---------- X 长文版 ---------- */
let x = html;
blocks(x).reverse().forEach((b, i, all) => {
  const n = all.length - i, id = String(n).padStart(2, '0');
  x = x.slice(0, b.start) + `<p class="ph">【这里上传图 ${n}：fig-${id}.png · ${b.title}】</p>` + x.slice(b.end);
});
x = x.replace(/<div class="callout">\s*<p class="t">([\s\S]*?)<\/p>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/g, '<blockquote><p><strong>$1：</strong>$2</p></blockquote>');
x = x.replace(/<h1>[\s\S]*?<\/h1>/, '');                       // X 的标题单独填
x = x.replace(/<p class="kicker">[\s\S]*?<\/p>/, '');
x = x.replace(/<h2><span class="h2row"><span class="no">(\d+)<\/span><span class="en">[^<]*<\/span><\/span>([\s\S]*?)<\/h2>/g, (_, n, t) => `<h2>${n} ${t.replace(/<span class="h2q">/, '：').replace(/<[^>]+>/g, '')}</h2>`);
x = x.replace(/<div class="cov cov0">[\s\S]*?<\/div>\s*/, '');      // X 有自己的封面
x = x.replace(/<div class="(?:pic|dgm|cov|cov pcd)">([\s\S]*?)<\/div>/g, '$1');
x = x.replace(/<div class="mast">[\s\S]*?<\/div>/, '');
x = x.replace(/<img src="img\/([^"]+)"[^>]*>/g, '<span class="ph">【这里上传图片：$1】</span>');
x = x.replace(/<h3>/g, '<h2>').replace(/<\/h3>/g, '</h2>');   // X 正文只有一级小标题最稳
x = x.replace(/<div class="sources">([\s\S]*?)<\/div>/, '$1');
x = x.replace(/\sclass="(?!ph)[^"]*"/g, '');
fs.writeFileSync(path.join(OUT, 'x.html'), page('X 长文版', `
<div class="bar"><b>X 长文版</b><span>标题：${title}　封面：cover-x.png（5:2）。点按钮复制正文，在 X 里粘贴后，把灰色占位换成对应图片。</span><button onclick="copyIt()">复制正文</button></div>
<div class="xcol"><img class="cv" src="cover-x.png"><h1 class="xt">${title}</h1><div id="post">${x}</div></div>`));

console.log(`ok：${figs.length} 张图，${path.resolve(OUT)}`);

// 找出带 data-fig 的块，按 div 嵌套层数找到它的结尾
function blocks(s) {
  const out = [], re = /<div class="(?:stats|tbl)" data-fig="([^"]*)">/g;
  let m;
  while ((m = re.exec(s))) {
    let depth = 0, i = m.index;
    const tag = /<\/?div\b[^>]*>/g; tag.lastIndex = i;
    let t;
    while ((t = tag.exec(s))) { depth += t[0][1] === '/' ? -1 : 1; if (depth === 0) break; }
    out.push({ title: m[1], start: m.index, end: tag.lastIndex });
    re.lastIndex = tag.lastIndex;
  }
  return out;
}
function shot(url, w, h, name) {
  const p = path.join(OUT, name);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${PROFILE}`, '--force-device-scale-factor=2', `--window-size=${w},${h}`, '--virtual-time-budget=3000', `--screenshot=${path.resolve(p)}`, url], { stdio: 'ignore' });
}
function page(t, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t}</title>
<style>body{margin:0;background:#efede8;font-family:-apple-system,"PingFang SC",sans-serif;color:#16181d}
.bar{position:sticky;top:0;z-index:2;display:flex;gap:14px;align-items:center;padding:12px 20px;background:#16181d;color:#cfd2d8;font-size:13px}
.bar b{color:#fff}.bar span{flex:1}.bar button{border:0;border-radius:999px;padding:8px 18px;background:#fff;color:#16181d;font-weight:600;cursor:pointer}
.phone{width:390px;margin:28px auto 60px;background:#fff;padding:28px 18px 40px;box-sizing:border-box;box-shadow:0 10px 40px -20px rgba(0,0,0,.3)}
.xcol{max-width:600px;margin:28px auto 60px;background:#fff;padding:0 0 40px;box-shadow:0 10px 40px -20px rgba(0,0,0,.3);font-size:17px;line-height:1.6}
.xcol .cv{width:100%;display:block}.xcol .xt{font-size:30px;margin:20px 24px 8px}.xcol #post{padding:0 24px}
.xcol h2{font-size:22px;margin:28px 0 10px}.xcol blockquote{margin:16px 0;padding-left:14px;border-left:3px solid #cfd9de;color:#536471}
.ph{display:block;margin:14px 0;padding:22px;border:1px dashed #b9b9b9;border-radius:10px;color:#8a8f98;font-size:14px;text-align:center}
@media (max-width:640px){.bar{flex-wrap:wrap}.phone,.xcol{width:auto;margin:0}}</style></head><body>${body}
<script>function copyIt(){var r=document.createRange();r.selectNodeContents(document.getElementById('post'));var s=getSelection();s.removeAllRanges();s.addRange(r);var ok=document.execCommand('copy');s.removeAllRanges();var b=document.querySelector('.bar button');b.textContent=ok?'已复制':'复制失败，请手动全选';setTimeout(function(){b.textContent='复制正文'},1800)}</script></body></html>`;
}
