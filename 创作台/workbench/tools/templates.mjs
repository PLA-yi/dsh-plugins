// 把开源的公众号排版主题转成工作台的文章模板（templates/article/<id>/theme.css + meta.json）。
//   来源：mdnice/markdown-nice v1.4.0 的主题（GPL-3.0），doocs/md 的主题（WTFPL）。原文件在 templates/vendor/。
//   做法：保留它们的配色、字体、标题、引语、加粗、链接、列表、表格样式；去掉公众号不支持的写法（伪元素、背景图、CSS 变量、定位、动画）；
//         按每套主题的主色，补上工作台文章专有的元素（刊头、导语、目录、章节编号、图注、文末来源和签名）。
// 用法：node tools/templates.mjs        重新生成全部模板（预览图另外用 xy templates preview 生成）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const V = path.join(ROOT, 'vendor'), OUT = path.join(ROOT, 'article');

// [文件名, 名字, 一句话说明, 作者, 主色（识别不准时手动指定）]
const MDNICE = [
  ['normal', '默认', '墨滴默认样式，清爽中性，什么内容都压得住', 'zhning12'],
  ['simple', '简', '黑白为主，几乎没有装饰，适合长文和观点文', 'aco'],
  ['orangeHeart', '橙心', '暖橙色标题块，亲切有活力', 'zhning12'],
  ['purple', '姹紫', '紫色点缀，偏文艺', 'djmaxwow'],
  ['cyan', '嫩青', '青绿色，干净清新', '画手'],
  ['green', '绿意', '绿色系，自然温和', '夜尽天明'],
  ['red', '红绯', '红色强调，适合观点鲜明的文章', 'HeyRain'],
  ['blue', '蓝莹', '明亮的蓝色细线，轻科技感', '谭淞宸'],
  ['blueCyan', '兰青', '青蓝色调，现代清爽', 'Krahets'],
  ['shanchui', '山吹', '日式金黄色调，复古', 'ElyhG'],
  ['scienceBlue', '科技蓝', '蓝色标题条，偏技术和产品分析', '夜尽天明'],
  ['geekBlack', '极客黑', '深色标题配橙色点缀，适合技术向', 'hyper-xx'],
  ['ink', '墨黑', '水墨黑灰，克制沉稳', 'Mayandev'],
  ['blueMountain', '前端之巅同款', '蓝色细线标题，规整的技术号风格', 'HeyRain'],
  ['wechatFormat', 'WeChat-Format', '经典的公众号排版风格', '画手'],
];
const DOOCS = [
  ['default', '经典', '居中色块标题，doocs/md 默认样式', '#0F4C81'],
  ['grace', '优雅', '圆角、阴影更柔和的经典样式', '#92617E'],
  ['simple', '简洁', '去掉大部分装饰的经典样式', '#0F4C81'],
];

/* ---------- 颜色工具 ---------- */
const hex = c => {
  c = String(c).trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3})$/); if (m) return '#' + m[1].split('').map(x => x + x).join('');
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  const hs = c.match(/^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (hs) { const h = +hs[1] / 360, s = +hs[2] / 100, l = +hs[3] / 100, q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return '#' + [h + 1 / 3, h, h - 1 / 3].map(t => Math.round(f(t) * 255).toString(16).padStart(2, '0')).join(''); }
  m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/); if (m) return '#' + m.slice(1, 4).map(x => (+x).toString(16).padStart(2, '0')).join('');
  return null;
};
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + rgb(a).map((x, i) => Math.round(x + (rgb(b)[i] - x) * t).toString(16).padStart(2, '0')).join('');
const sat = h => { const [r, g, b] = rgb(h).map(x => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const lum = h => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

/* ---------- 解析 / 改写 CSS ---------- */
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  // 只处理平铺的规则；@media 之类整块丢掉
  css = css.replace(/@[a-z-]+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = m[2].split(';').map(d => d.trim()).filter(Boolean).map(d => { const i = d.indexOf(':'); return i > 0 ? [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()] : null; }).filter(Boolean);
    out.push({ sels: m[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean), decls });
  }
  return out;
}
const DROP_SEL = /::?(before|after|hover|first-letter|first-line|nth-child|marker)|\.(footnote|footnotes|hljs|custom|imageflow|multiquote|block-equation|inline-equation|table-of-contents|alert|mermaid|md-emoji|katex|code-snippet|prefix|suffix|language-|toc)|\b(pre|code|sup|sub|figure|svg|kbd|mark|details|summary)\b|#output .container|\.mermaid|>\s*:first-child/i;
const DROP_PROP = /^(content|position|top|left|right|bottom|z-index|transform|transition|animation|filter|cursor|user-select|-webkit-|counter-|quotes|box-sizing|overflow-wrap|hyphens)/;
function mapSel(sel, kind) {
  if (DROP_SEL.test(sel)) return null;
  let s = sel;
  if (kind === 'mdnice') { if (!/^#nice\b/.test(s)) return null; s = s.replace(/^#nice\s*/, ''); }
  else { s = s.replace(/^(#output|section)\s*/, ''); if (/^(html|body|:root|\.dark)/.test(s)) return null; }
  // 标题里的文字：mdnice 把标题文字包在 span 里；工作台的章节标题文字在 .h2t 里
  // 一级、三级标题里的 span 是 mdnice 给章节标题文字加色块用的，套在文章大标题上太重，不要
  s = s.replace(/^h2 (span|\.content)$/, 'h2 .h2t');
  if (/^(h1|h3) (span|\.content)$/.test(s)) return null;
  s = s.replace(/^li section$/, 'li').replace(/^figcaption$/, '.cap');
  if (/\bspan\b/.test(s)) return null;
  return s ? `.article ${s}` : '.article';
}
function vars(v, theme) {
  const V = { '--md-primary-color': theme.primary, '--md-font-size': '16px', '--md-block-spacing': '1', '--md-line-height': '1.75', '--md-font-family': '-apple-system-font,BlinkMacSystemFont,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Microsoft YaHei",Arial,sans-serif', '--foreground': '0 0% 25%', '--blockquote-background': '#f7f7f7', '--md-blockquote-background': '#f7f7f7' };
  for (let i = 0; i < 4; i++) v = v.replace(/var\((--[\w-]+)(?:\s*,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (m, n, d) => V[n] ?? (d != null ? d.trim() : m));
  v = v.replace(/hsl\(\s*0 0% 25%\s*\)/g, '#3f3f3f').replace(/hsl\(\s*0 0% 25% \/ ([\d.]+)\s*\)/g, (m, a) => `rgba(63,63,63,${a})`);
  // calc(2em * 1) / calc(16px * 1.2) / calc(1.5em * 1)
  for (let i = 0; i < 3; i++) v = v.replace(/calc\(\s*([\d.]+)(px|em|rem|%)?\s*\*\s*([\d.]+)(px|em|rem|%)?\s*\)/g, (m, a, u1, b, u2) => `${+(a * b).toFixed(3)}${u1 || u2 || ''}`);
  return v;
}
function convert(css, kind, theme) {
  const rules = [];
  for (const r of parse(css)) {
    const sels = r.sels.map(s => mapSel(s, kind)).filter(Boolean);
    if (!sels.length) continue;
    const decls = r.decls.map(([p, v]) => [p, vars(v, theme)]).filter(([p, v]) => !DROP_PROP.test(p) && !/url\(|var\(|gradient|attr\(|env\(/.test(v) && !(p === 'display' && /^(flex|grid|inline-flex)$/.test(v.replace(/\s*!important/, ''))));
    if (decls.length) rules.push({ sels, decls });
  }
  return rules;
}
const print = rules => rules.map(r => `${r.sels.join(',')}{${r.decls.map(([p, v]) => `${p}:${v}`).join(';')}}`).join('\n');

// 主色：标题、加粗、链接、引语里出现最多的有彩色；正文色：段落 / 根节点的颜色
function palette(rules, fallback) {
  const score = {};
  for (const r of rules) {
    const w = r.sels.some(s => /h2|h1|strong|blockquote|\ba\b|h3/.test(s)) ? 3 : 1;
    for (const [, v] of r.decls) for (const m of v.matchAll(/#[0-9a-f]{3,6}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi)) { const h = hex(m[0]); if (h && sat(h) > 0.28 && lum(h) < 0.85 && lum(h) > 0.12) score[h] = (score[h] || 0) + w; }
  }
  const accent = Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] || fallback || '#2f6bff';
  let text = '#3f3f3f';
  for (const r of rules) if (r.sels.some(s => s === '.article p' || s === '.article')) for (const [p, v] of r.decls) if (p === 'color' && hex(v) && lum(hex(v)) < 0.5) text = hex(v);
  return { accent, text };
}

// 工作台文章专有元素的样式：放在主题样式前面，主题里写了同样的选择器就以主题为准
function components({ accent: A, text: T }) {
  const LT = mix(A, '#ffffff', 0.92), L2 = mix(A, '#ffffff', 0.7), T2 = mix(T, '#ffffff', 0.15), S = '#8c8c8c';
  return `.article{color:${T};font-size:16px;line-height:1.8;letter-spacing:.5px;text-align:left;word-break:break-word}
.article .mast{display:flex;justify-content:space-between;align-items:center;margin:0 0 18px;padding:0 0 8px;border-bottom:1px solid ${L2}}
.article .mast-l{margin:0;font-size:13px;font-weight:700;color:${A};line-height:1.3;text-indent:0;letter-spacing:1px}
.article .mast-r{margin:0;font-size:12px;color:${S};line-height:1.3;text-align:right;text-indent:0}
.article .kicker{display:inline-block;margin:0 0 10px;padding:2px 10px;border-radius:999px;background:${LT};color:${A};font-size:12px;font-weight:600;letter-spacing:1px;text-indent:0}
.article .h1b{color:${A}}
.article .deck{margin:0 0 24px;padding:12px 16px;background:${LT};border-left:3px solid ${A};color:${T2};font-size:15px;line-height:1.8;text-indent:0;border-radius:0 6px 6px 0}
.article .dc{font-size:inherit;font-weight:inherit;color:inherit}
.article .toc{margin:24px 0 10px;padding:14px 16px 6px;background:${LT};border-radius:8px}
.article .toc-t{margin:0 0 8px;font-size:13px;font-weight:700;color:${A};text-indent:0;letter-spacing:1px}
.article .toc-i{margin:0 0 8px;font-size:14.5px;line-height:1.6;color:${T2};text-indent:0}
.article .toc-i b{color:${A};margin-right:6px;font-weight:700}
.article h2 .h2row{display:block;margin-bottom:6px}
.article h2 .no{display:inline-block;padding:1px 8px;border-radius:3px;background:${A};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1px;line-height:1.6}
.article h2 .en{display:none}
.article h2 .h2q{display:block;font-size:15px;font-weight:500;color:${S};margin-top:4px;letter-spacing:0}
.article .qm{display:none}
.article .tbl{margin:22px 0 8px;overflow-x:auto}
.article .pic,.article .dgm,.article .pcd{margin:22px 0 0}
.article .cov{margin:36px 0 18px}
.article .cov0{margin:0 0 18px}
.article .pic img,.article .cov img,.article .dgm img,.article .pcd img{display:block;width:100%;max-width:100%;margin:0;border-radius:6px}
.article .cap{margin:8px 0 26px;font-size:12px;line-height:1.7;color:${S};text-align:center;text-indent:0;letter-spacing:0}
.article .cap b{color:${A};margin-right:6px;font-weight:600}
.article .orn{text-align:center;color:${A};letter-spacing:10px;font-size:14px;margin:30px 0;text-indent:0}
.article .sources{margin-top:36px;padding:12px 14px 4px;background:#f6f6f6;border-radius:6px;font-size:11.5px;line-height:1.8;color:${S}}
.article .sources p{margin:0 0 6px;font-size:11.5px;line-height:1.8;color:${S};text-indent:0;letter-spacing:0}
.article .sources b{color:#555555;font-size:12px}
.article .sources a{color:${S}}
.article .sign{margin:28px 0 0;text-align:center;font-size:12px;color:${S};text-indent:0}
.article .sign b{color:${A};font-size:16px}`;
}

const strip = js => (js.match(/`([\s\S]*)`/) || [, ''])[1];
function write(id, meta, body, pal) {
  const dir = path.join(OUT, id); fs.mkdirSync(dir, { recursive: true });
  const head = `/* ${meta.name}：${meta.desc}\n   来源：${meta.source}（${meta.license}），由 tools/templates.mjs 转成工作台模板：去掉了公众号不支持的写法，补上了刊头、导语、目录、章节编号、图注等元素的样式。\n   构建时全部转成行内样式；主色 ${pal.accent}，正文 ${pal.text}。 */\n`;
  fs.writeFileSync(path.join(dir, 'theme.css'), head + components(pal) + '\n/* ---- 主题 ---- */\n' + body + '\n');
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, ...meta, accent: pal.accent }, null, 2));
}

const base = convert(strip(fs.readFileSync(path.join(V, 'mdnice', 'basic.js'), 'utf8')), 'mdnice', {});
let n = 0;
for (const [f, name, desc, author] of MDNICE) {
  const own = convert(strip(fs.readFileSync(path.join(V, 'mdnice', f + '.js'), 'utf8')), 'mdnice', {});
  const pal = palette(own, '#3f3f3f');
  write(`mdnice-${f}`, { name, desc, author, source: 'mdnice/markdown-nice v1.4.0', license: 'GPL-3.0', group: '墨滴 mdnice' }, print(base) + '\n' + print(own), pal); n++;
}
const dbase = fs.readFileSync(path.join(V, 'doocs', 'base.css'), 'utf8'), ddef = fs.readFileSync(path.join(V, 'doocs', 'default.css'), 'utf8');
for (const [f, name, desc, primary] of DOOCS) {
  const css = dbase + '\n' + ddef + (f === 'default' ? '' : '\n' + fs.readFileSync(path.join(V, 'doocs', f + '.css'), 'utf8'));
  const rules = convert(css, 'doocs', { primary });
  // doocs 的列表圆点是渲染时作为文字插进去的，我们的构建没有这一步，补上普通的圆点和编号
  const tail = '\n.article ul{list-style:disc;padding-left:1.4em}\n.article ol{list-style:decimal;padding-left:1.4em}\n.article li{display:list-item}';
  write(`doocs-${f}`, { name, desc, source: 'doocs/md', license: 'WTFPL', group: 'doocs/md' }, print(rules) + tail, { accent: primary.toLowerCase(), text: '#3f3f3f' }); n++;
}
console.log(`生成了 ${n} 套模板 → ${OUT}`);
