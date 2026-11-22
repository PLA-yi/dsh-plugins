// 创作台前端：不依赖任何框架。路由用 #/…，数据都走 /api。
import { cover, themeOf } from './covers.js';
import { mountVideo } from './video.js';
import { mountBreakdown } from './breakdown.js';
const S = { projects: [], meta: { statuses: [], tags: [] }, stamp: '', detail: null, cal: null,
  view: lsGet('wb.view', 'gallery'), sort: lsGet('wb.sort', 'updated'), tab: 'preview', cmode: 'img', pvIndex: 0 };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// 中文输入法还在选字时按回车：只给输入法用，不触发任何发送、保存、搜索
window.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.isComposing || e.keyCode === 229)) e.stopImmediatePropagation(); }, true);
const main = $('#main'), side = $('#side'), layer = $('#layer');
// 嵌在 DeepSeek Harness 客户端「自媒体 · 写作」里时（网址带 ?embed=dsh）：外层已经有自己的导航，这里的侧栏改成顶上一行（样式在 style.css 的 .embedded 那一段）
if (new URLSearchParams(location.search).get('embed') === 'dsh') {
  document.documentElement.classList.add('embedded');
  // 配色跟随客户端：网址里的 theme 先定深浅，避免闪白；客户端随后（以及每次换主题时）发来它当前主题的颜色
  const root = document.documentElement;
  const first = new URLSearchParams(location.search).get('theme');
  if (first === 'dark' || first === 'light') root.dataset.theme = first;
  const THEME_VARS = ['--bg', '--side', '--panel', '--ink', '--ink2', '--mute', '--line', '--line2', '--hover', '--active', '--soft', '--subtle',
    '--canvas', '--pri', '--pri-hover', '--pri-ink', '--acc', '--acc-ink', '--acc-soft', '--sans'];
  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== parent || !d || d.type !== 'dsh-theme' || (d.scheme !== 'dark' && d.scheme !== 'light')) return;
    root.dataset.theme = d.scheme;
    for (const name of THEME_VARS) {
      const value = d.tokens && d.tokens[name];
      if (typeof value === 'string' && value.trim() !== '' && value.length < 300) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    }
    // 有几处样式用的是「r,g,b」三个数的写法（--acc-rgb），这里从发来的强调色算出来，免得还是原来的颜色
    const probe = document.createElement('i'); probe.style.color = (d.tokens && d.tokens['--acc']) || ''; document.body.append(probe);
    const rgb = probe.style.color ? getComputedStyle(probe).color.match(/\d+(\.\d+)?/g) : null; probe.remove();
    if (rgb && rgb.length >= 3) root.style.setProperty('--acc-rgb', rgb.slice(0, 3).map(n => Math.round(+n)).join(','));
    else root.style.removeProperty('--acc-rgb');
  });
  parent.postMessage({ type: 'dsh-theme-request' }, '*');
}
// 图标：Lucide（web/icons.svg），I('名字') 输出内联 SVG，Shadow DOM 里也能用
let ICONS = {};
const I = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const ICON = { get article() { return I('file-text'); }, get card() { return I('images'); } };
async function loadIcons() { const t = await (await fetch('/web/icons.svg')).text(); for (const m of t.matchAll(/<symbol id="i-([\w-]+)"[^>]*>([\s\S]*?)<\/symbol>/g)) ICONS[m[1]] = m[2]; }
const PLATFORMS = ['小红书', '公众号', 'X', '抖音', '即刻', '微博', '知乎', '其他'];

function lsGet(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fileUrl = (p, rel) => `/p/${encodeURIComponent(p.id)}/` + rel.split('/').map(encodeURIComponent).join('/');
const stIdx = s => Math.max(0, S.meta.statuses.indexOf(s));
const stPill = s => `<span class="st st${stIdx(s)}"><i class="dot"></i>${esc(s)}</span>`;
const fmtSec = s => s < 60 ? `${s} 秒` : `${s / 60 | 0} 分${s % 60 ? ` ${s % 60} 秒` : '钟'}`;
const sizeOf = p => p.type === 'card' ? `${p.pages} 页` : p.form === 'script' ? `口播约 ${fmtSec(p.speakSec || 0)}` : `${(p.chars / 1000).toFixed(1)}k 字`;
const iconOf = p => p.form === 'script' ? I('clapperboard') : ICON[p.type];
function ago(iso) { const s = (Date.now() - new Date(iso)) / 1000; return s < 60 ? '刚刚' : s < 3600 ? `${s / 60 | 0} 分钟前` : s < 86400 ? `${s / 3600 | 0} 小时前` : s < 86400 * 30 ? `${s / 86400 | 0} 天前` : new Date(iso).toLocaleDateString('zh-CN'); }
const fmtTime = iso => new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// 带令牌的请求：服务重启换了令牌时，自动去首页取新令牌再试一次，不用手动刷新
async function freshToken() {
  const t = (await (await fetch('/', { cache: 'no-store' })).text()).match(/window\.WB_TOKEN = '([0-9a-f]+)'/)?.[1];
  if (t) window.WB_TOKEN = t; return !!t;
}
async function wbFetch(url, opts = {}) {
  const go = () => fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'x-wb-token': window.WB_TOKEN } });
  let r = await go();
  if (r.status === 403) { const j = await r.clone().json().catch(() => ({})); if (j.code === 'token' && await freshToken()) r = await go(); }
  return r;
}
async function api(method, url, body) {
  const r = await wbFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), err ? 6000 : 2600);
}
async function copy(text, what = '已复制') { try { await navigator.clipboard.writeText(text); toast(what); } catch { toast('复制失败', true); } }

/* ---------- 数据 ---------- */
async function loadAll() {
  [S.projects, S.meta] = await Promise.all([api('GET', '/api/projects'), api('GET', '/api/meta')]);
}
async function patch(id, body, quiet) {
  try {
    const p = await api('PATCH', `/api/projects/${encodeURIComponent(id)}`, body);
    const i = S.projects.findIndex(x => x.id === id);
    if (i >= 0) Object.assign(S.projects[i], p);
    if (S.detail?.id === id) S.detail = p;
    S.meta = await api('GET', '/api/meta');
    if (!quiet) toast('已保存');
    return p;
  } catch (e) { toast(e.message, true); throw e; }
}

/* ---------- 路由 ---------- */
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [a, b, c] = h.split('/');
  return { a: a || 'all', b, c };
}
async function render() {
  await S.flush?.(); S.flush = null;
  const r = route();
  renderSide(r);
  if (r.a === 'p') return renderProject(r.b, r.c);
  S.detail = null;
  if (r.a === 'activity') return renderActivity();
  if (r.a === 'plaza') return renderPlaza();
  if (r.a === 'assets') return renderAssets();
  if (r.a === 'videos') return !r.b ? VIDEO.list() : r.b.startsWith('拉片-') ? PULL.detail(r.b) : VIDEO.detail(r.b);
  renderList(r);
}
window.addEventListener('hashchange', () => { main.scrollTop = 0; render(); });

/* ---------- 侧栏 ---------- */
function renderSide(r) {
  const ps = S.projects, on = (a, b) => r.a === a && (b === undefined || r.b === b) ? ' on' : '';
  const cnt = f => ps.filter(f).length;
  const so = document.getElementById('sideopen'); if (so) so.innerHTML = I('panel-left-open');
  side.innerHTML = `
    <div class="stop"><button class="sbtn search" data-act="palette">${I('search')}<span>搜索</span><kbd>⌘K</kbd></button><button class="icb sm sidex" data-act="side" data-tip="收起侧栏 ⌘\\">${I('panel-left-close')}</button></div>
    <button class="sbtn newbtn" data-act="new">${I('plus')}新建</button>
    <div class="navs"><a class="nav${on('plaza')}" href="#/plaza">${I('lightbulb')}选题广场</a><a class="nav${on('assets')}" href="#/assets">${I('images')}素材库</a><a class="nav${on('videos')}" href="#/videos">${I('film')}视频</a></div>
    <div class="sec">我的项目</div>
    <div class="navs">
    <a class="nav${on('all')}" href="#/all">${I('layout-grid')}全部<span class="n">${ps.length}</span></a>
    <a class="nav${on('type', 'article')}" href="#/type/article">${I('file-text')}文章<span class="n">${cnt(p => p.type === 'article' && !p.form)}</span></a>
    <a class="nav${on('type', 'script')}" href="#/type/script">${I('clapperboard')}视频脚本<span class="n">${cnt(p => p.form === 'script')}</span></a>
    <a class="nav${on('type', 'card')}" href="#/type/card">${I('images')}小红书卡片<span class="n">${cnt(p => p.type === 'card')}</span></a>
    <a class="nav${on('starred')}" href="#/starred">${I('star')}星标<span class="n">${cnt(p => p.pinned) || ''}</span></a>
    <a class="nav${on('activity')}" href="#/activity">${I('history')}最近动态</a>
    </div>
    <div class="side-foot"><a class="nav" data-act="aiset" data-tip="AI 设置" href="#">${I('settings')}AI 设置</a><a class="nav" data-act="mem" data-tip="AI 记忆" href="#">${I('bookmark')}AI 记忆</a><a class="nav" data-act="skills" data-tip="技能" href="#">${I('puzzle')}技能</a>
      <div class="cli" data-copy="xy help" title="点击复制">${I('code')}<span>命令行 <code>xy</code>，AI 也能用</span></div></div>`;
}

side.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); ACTS[b.dataset.act](); }
  const c = e.target.closest('[data-copy]'); if (c) copy(c.dataset.copy, '已复制命令');
});

/* ---------- 列表页 ---------- */
function filtered(r) {
  let ps = [...S.projects], title = '全部项目';
  if (r.a === 'type') { ps = ps.filter(p => r.b === 'script' ? p.form === 'script' : p.type === r.b && !p.form); title = r.b === 'card' ? '小红书卡片' : r.b === 'script' ? '视频脚本' : '文章'; }
  if (r.a === 'starred') { ps = ps.filter(p => p.pinned); title = '星标'; }
  if (r.a === 'status') { ps = ps.filter(p => p.status === r.b); title = r.b; }
  if (r.a === 'tag') { ps = ps.filter(p => p.tags.includes(r.b)); title = '#' + r.b; }
  const so = { updated: (a, b) => b.updated.localeCompare(a.updated), created: (a, b) => b.created.localeCompare(a.created),
    title: (a, b) => a.title.localeCompare(b.title, 'zh'), status: (a, b) => stIdx(a.status) - stIdx(b.status) }[S.sort];
  ps.sort((a, b) => (b.pinned - a.pinned) || so(a, b));
  return { ps, title };
}
function renderList(r) {
  const { ps, title } = filtered(r);
  const views = [['gallery', '画廊', 'layout-grid'], ['table', '表格', 'table-2'], ['board', '看板', 'kanban'], ['calendar', '日历', 'calendar']];
  main.innerHTML = `
    <div class="top"><div class="crumb"><b>${esc(title)}</b></div><div class="sp"></div>
      <button class="icb" data-act="palette" data-tip="搜索 ⌘K">${I('search')}</button><button class="btn pri" data-act="new">${I('plus')}新建</button></div>
    <div class="page">
      <div class="h1row"><h1>${esc(title)}</h1><span class="cnt">${ps.length} 个项目</span></div>
      <div class="bar">
        <div class="seg" id="views">${views.map(([k, n, ic]) => `<button data-v="${k}" class="${S.view === k ? 'on' : ''}">${I(ic)}${n}</button>`).join('')}</div>
        <select class="sel" id="sort" ${S.view === 'board' || S.view === 'calendar' ? 'hidden' : ''}>
          ${[['updated', '最近更新'], ['created', '创建时间'], ['title', '标题'], ['status', '状态']].map(([k, n]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>排序：${n}</option>`).join('')}
        </select>
        ${r.a !== 'all' ? `<span class="filterchip">${esc(title)}<button onclick="location.hash='#/all'" title="清除筛选">${I('x')}</button></span>` : ''}
      </div>
      <div id="viewbody"></div>
    </div>`;
  $('#views').onclick = e => { const v = e.target.closest('[data-v]')?.dataset.v; if (v) { S.view = v; lsSet('wb.view', v); renderList(r); } };
  $('#sort').onchange = e => { S.sort = e.target.value; lsSet('wb.sort', S.sort); renderList(r); };
  $$('[data-act]', main).forEach(b => b.onclick = () => ACTS[b.dataset.act]());
  const body = $('#viewbody');
  if (!S.projects.length) { body.innerHTML = '<div class="empty-state">还没有项目，点「新建」开始</div>'; return; }
  ({ gallery, table, board, calendar })[S.view](body, ps, r);
}

// 复制公众号版正文：没构建或改过就先构建，图片转成内嵌数据（粘到公众号不依赖本机地址）。
// 复制请求在点击当下就交给浏览器，内容准备好再填进去，所以构建慢一点也不会被浏览器拦掉
async function copyWechat(p, btn) {
  if (btn?.dataset.busy) return;
  const label = btn?.innerHTML; if (btn) btn.dataset.busy = '1';
  const busy = t => { if (btn) btn.innerHTML = `${I('loader-circle', 'spinning')}<span>${t}</span>`; };
  const make = (async () => {
    let v = await api('GET', `/api/projects/${enc(p.id)}/read?v=wechat`);
    if (!v.built || v.stale) { busy('构建中'); await api('POST', `/api/projects/${enc(p.id)}/build`); v = await api('GET', `/api/projects/${enc(p.id)}/read?v=wechat`); }
    busy('处理图片');
    const tmp = document.createElement('div'); tmp.innerHTML = v.html;
    for (const img of tmp.querySelectorAll('img')) {
      try { const bl = await (await fetch(img.src)).blob(); img.src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); }); } catch {}
    }
    return { html: tmp.innerHTML, text: tmp.textContent.trim(), imgs: tmp.querySelectorAll('img').length };
  })();
  busy('准备中');
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': make.then(r => new Blob([r.html], { type: 'text/html' })),
      'text/plain': make.then(r => new Blob([r.text], { type: 'text/plain' })),
    })]);
    const r = await make;
    toast(`已复制《${p.title.slice(0, 18)}》公众号正文${r.imgs ? `（含 ${r.imgs} 张图）` : ''}，到公众号编辑器里粘贴`);
  } catch (e) { toast('复制失败：' + e.message, true); }
  if (btn) { btn.innerHTML = label; delete btn.dataset.busy; }
}
// 复制 X（推特）长文版：正文转成 X 认的格式先复制，再弹窗一步步给标题、封面和每张插图
async function copyX(p, btn) {
  if (btn?.dataset.busy) return;
  const label = btn?.innerHTML; if (btn) { btn.dataset.busy = '1'; btn.innerHTML = `${I('loader-circle', 'spinning')}<span>整理中</span>`; }
  const make = api('POST', `/api/projects/${enc(p.id)}/xpost`, {});
  let copied = true;
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': make.then(r => new Blob([r.html], { type: 'text/html' })),
      'text/plain': make.then(r => new Blob([r.text], { type: 'text/plain' })),
    })]);
  } catch { copied = false; }
  // 剪贴板被浏览器拦了也照样打开：预览和图片都能用，正文再点一次复制
  try { xDlg(p, await make, copied); } catch (e) { toast('整理推特版失败：' + e.message, true); }
  if (btn) { btn.innerHTML = label; delete btn.dataset.busy; }
}
// 仿 X 长文的排版预览：封面、标题、作者行、正文；「【插图 NN】」换成真实图片，放在粘贴后它该在的位置
const X_CSS = `:host{display:block;background:#fff;color:#0f1419;color-scheme:light}
  .xa{max-width:600px;margin:0 auto;padding:0 0 48px;font:17px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;color:#0f1419;word-break:break-word}
  .cover{display:block;width:100%;aspect-ratio:5/2;object-fit:cover;margin:0 0 22px}
  .nocover{aspect-ratio:5/2;margin:0 0 22px;background:#f7f9f9;color:#8b98a5;display:grid;place-items:center;font-size:14px}
  h1{font-size:31px;line-height:1.25;font-weight:800;margin:0 16px 16px;letter-spacing:-.3px}
  .by{display:flex;gap:10px;align-items:center;margin:0 16px 24px;padding-bottom:16px;border-bottom:1px solid #eff3f4}
  .av{width:40px;height:40px;border-radius:50%;background:#0f1419;color:#fff;display:grid;place-items:center;font-weight:700;font-size:16px;flex:none}
  .by b{display:block;font-size:15px;line-height:1.3}.by span{font-size:14px;color:#536471}
  .body{padding:0 16px}
  .body p{margin:0 0 18px}
  .body h2{font-size:24px;line-height:1.3;font-weight:800;margin:34px 0 14px}
  .body a{color:#1d9bf0;text-decoration:none}
  .body ul,.body ol{margin:0 0 18px;padding-left:26px}.body li{margin:6px 0}
  .body blockquote{margin:0 0 18px;padding:2px 0 2px 16px;border-left:4px solid #cfd9de}
  .body figure{margin:6px 0 10px}.body figure img{display:block;width:100%;border-radius:16px;border:1px solid #eff3f4}
  .body figure + p > i:only-child{display:block;font-size:15px;color:#536471}
  .miss{margin:6px 0 18px;padding:14px;border:1px dashed #f4b9b2;border-radius:12px;color:#b4442c;font-size:14px}`;
function xPreviewHtml(p, r) {
  const u = f => fileUrl(p, f) + '?v=' + (r.t || Date.now()), byN = Object.fromEntries(r.images.map(i => [i.n, i]));
  const body = r.html.replace(/<p>【插图 (\d+)】<\/p>/g, (_, n) => { const im = byN[+n]; return im?.file ? `<figure><img src="${u(im.file)}" alt="" loading="lazy"></figure>` : `<div class="miss">插图 ${n}：${esc(im?.note || '没有图片')}</div>`; });
  return `<style>${X_CSS}</style><div class="xa">${r.cover ? `<img class="cover" src="${u(r.cover)}" alt="">` : '<div class="nocover">还没有 5:2 封面</div>'}<h1>${esc(r.title)}</h1>
    <div class="by"><span class="av">易</span><div><b>${esc(S.profile?.name || '')}</b><span>${esc(todayStr())} · ${r.chars} 字 · ${r.images.length} 张图</span></div></div><div class="body">${body}</div></div>`;
}
// 图片复制成 PNG（浏览器剪贴板只认 PNG；JPG 先画成 PNG）
async function copyImage(url) {
  const png = (async () => {
    const bl = await (await fetch(url)).blob(); if (bl.type === 'image/png') return bl;
    const im = await createImageBitmap(bl), c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    c.getContext('2d').drawImage(im, 0, 0); return new Promise(r => c.toBlob(r, 'image/png'));
  })();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
function xDlg(p, r, copied = true) {
  const u = f => fileUrl(p, f) + '?v=' + Date.now(), nn = n => String(n).padStart(2, '0');
  let k = 0; const step = () => `<b class="xno">${++k}</b>`;
  layer.innerHTML = `<div class="mask"><div class="dlg xdlg"><h3>发到 X（推特）长文<span class="ty">左边是粘贴到 X 以后的样子（仿 X 长文排版，实际以 X 为准）</span></h3><div class="xcols"><div class="xpvcol"><div id="xpvhost"></div></div><div class="bd">
    <div class="xstep">${step()}<div class="xbody"><div class="xt">标题</div><div class="xrow"><span class="xtitle">${esc(r.title)}</span><button class="btn sm" data-xcopyt>复制</button></div></div></div>
    ${r.cover ? `<div class="xstep">${step()}<div class="xbody"><div class="xt">封面（5:2）</div><div class="xrow"><img class="xcov" src="${u(r.cover)}" alt=""><button class="btn sm" data-ximg="${esc(r.cover)}">复制图片</button></div></div></div>` : ''}
    <div class="xstep">${step()}<div class="xbody"><div class="xt">${copied ? `正文已复制（${r.chars} 字）` : `正文 ${r.chars} 字<span class="xerr">　还没复制上，点下面的按钮</span>`}</div><div class="ty">在 X 长文编辑器的正文里按 ⌘V 粘贴。小标题、粗体、链接、列表、引用都会保留；表格已经转成图片，和插图一起编号。</div><button class="btn sm${copied ? '' : ' pri'}" data-xagain>${copied ? '再复制一次正文' : '复制正文'}</button></div></div>
    ${r.images.length ? `<div class="xstep">${step()}<div class="xbody"><div class="xt">插图 ${r.images.length} 张</div><div class="ty">正文里每个「【插图 03】」：点一下那一行，在这里点「复制」，回 X 里按 ⌘V，再删掉那行占位字。动图复制不了，点「打开图片文件夹」把它拖进去。</div>
      <div class="xgrid">${r.images.map(im => `<div class="xim"><div class="xth">${im.file ? `<img src="${u(im.file)}" loading="lazy" alt="">` : ''}</div>
        <div class="xin"><b>插图 ${nn(im.n)}${im.anim ? '<em>动图</em>' : ''}${im.kind === '表' ? '<em>表格</em>' : ''}</b><span>${esc(im.caption || '')}</span>${im.note ? `<span class="xerr">${esc(im.note)}</span>` : ''}</div>
        ${im.file && !im.anim ? `<button class="btn sm" data-ximg="${esc(im.file)}">复制</button>` : `<button class="btn sm" data-xopen>文件夹</button>`}</div>`).join('')}</div></div></div>` : ''}
    ${r.warnings?.length ? `<div class="xwarn">${I('triangle-alert')}<span>${r.warnings.map(esc).join('<br>')}</span></div>` : ''}
  </div></div><div class="ft"><button class="btn" data-xopen>${I('folder-open')}打开图片文件夹</button><div class="sp"></div><button class="btn pri" data-close>完成</button></div></div></div>`;
  const dlg = layer.querySelector('.xdlg');
  dlg.querySelector('#xpvhost').attachShadow({ mode: 'open' }).innerHTML = xPreviewHtml(p, r);
  dlg.querySelector('[data-xcopyt]').onclick = () => copy(r.title, '标题已复制');
  dlg.querySelector('[data-xagain]').onclick = async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([r.html], { type: 'text/html' }), 'text/plain': new Blob([r.text], { type: 'text/plain' }) })]); toast('正文已复制'); } catch (e) { toast('复制失败：' + e.message, true); } };
  dlg.querySelectorAll('[data-ximg]').forEach(b => b.onclick = async () => {
    try { await copyImage(u(b.dataset.ximg)); b.classList.add('done'); b.innerHTML = `${I('check')}已复制`; toast('图片已复制，回 X 里按 ⌘V'); } catch (e) { toast('复制图片失败：' + e.message, true); }
  });
  dlg.querySelectorAll('[data-xopen]').forEach(b => b.onclick = () => api('POST', `/api/projects/${enc(p.id)}/xpost`, { open: true }).catch(e => toast(e.message, true)));
}
function thumbsHtml(p) {
  if (!p.thumbs?.length) return '<span class="empty">还没有成品图</span>';
  return p.thumbs.map(t => `<img loading="lazy" src="${fileUrl(p, t)}" alt="">`).join('');
}
function gallery(el, ps) {
  if (!ps.length) { el.innerHTML = '<div class="empty-state">这里还没有项目</div>'; return; }
  el.innerHTML = `<div class="grid">${ps.map(p => `
    <div class="gc" data-id="${esc(p.id)}">
      <button class="pin${p.pinned ? ' on' : ''}" data-pin title="星标">${I('star')}</button>
      <div class="gthumb ${p.type === 'card' ? 'cards' : ''}">${thumbsHtml(p)}</div>
      <div class="gbody"><div class="t"><span class="ty">${iconOf(p)}</span><span>${esc(p.title)}</span></div>
        <div class="m">${stPill(p.status)}${p.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>
        <div class="sub">${p.typeName} · ${sizeOf(p)} · ${ago(p.updated)}${p.plan ? ' · 计划 ' + p.plan.slice(5) : ''}</div>
        ${p.type === 'article' && !p.form ? `<button class="gcopy" data-copywx data-tip="复制公众号正文，直接粘进公众号编辑器">${I('clipboard-copy')}<span>复制到公众号</span></button>` : ''}</div>
    </div>`).join('')}</div>`;
  el.onclick = e => {
    const card = e.target.closest('.gc'); if (!card) return;
    const p = S.projects.find(x => x.id === card.dataset.id);
    if (e.target.closest('[data-pin]')) { patch(p.id, { pinned: !p.pinned }, true).then(() => render()); return; }
    const cw = e.target.closest('[data-copywx]'); if (cw) { copyWechat(p, cw); return; }
    location.hash = '#/p/' + encodeURIComponent(p.id);
  };
}
function table(el, ps) {
  el.innerHTML = `<table class="tb"><thead><tr><th>标题</th><th>类型</th><th>状态</th><th>标签</th><th>规模</th><th>计划发布</th><th>已发布</th><th>更新</th></tr></thead><tbody>
    ${ps.map(p => `<tr data-id="${esc(p.id)}">
      <td><div class="tt"><span data-open class="tto">${p.thumb ? `<img src="${fileUrl(p, p.thumb)}" alt="">` : '<img alt="">'}${p.pinned ? '<span class="star">★</span>' : ''}${esc(p.title)}</span>${p.type === 'article' ? `<button class="icb sm tcopy" data-copywx data-tip="复制公众号正文">${I('clipboard-copy')}</button>` : ''}</div></td>
      <td class="ty">${p.typeName}</td>
      <td><select data-f="status">${S.meta.statuses.map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><div class="tags">${p.tags.map(t => `<span class="tag">#${esc(t)}<button data-rmtag="${esc(t)}">×</button></span>`).join('')}<button class="addtag" data-addtag>＋</button></div></td>
      <td class="ty">${sizeOf(p)}</td>
      <td><input type="date" data-f="plan" value="${esc(p.plan)}"></td>
      <td class="ty">${p.published.length ? p.published.map(r => esc(r.platform)).join('、') : '—'}</td>
      <td class="ty">${ago(p.updated)}</td></tr>`).join('')}</tbody></table>`;
  el.onclick = e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return; const p = S.projects.find(x => x.id === tr.dataset.id);
    const cw = e.target.closest('[data-copywx]'); if (cw) { copyWechat(p, cw); return; }
    if (e.target.closest('[data-open]')) location.hash = '#/p/' + encodeURIComponent(p.id);
    const rm = e.target.closest('[data-rmtag]'); if (rm) patch(p.id, { tags: p.tags.filter(t => t !== rm.dataset.rmtag) }, true).then(render);
    const add = e.target.closest('[data-addtag]'); if (add) inlineTag(add, p);
  };
  el.onchange = e => { const tr = e.target.closest('tr[data-id]'); const f = e.target.dataset.f; if (tr && f) patch(tr.dataset.id, { [f]: e.target.value }).then(render); };
}
function inlineTag(anchor, p, after = render) {
  const inp = document.createElement('input'); inp.placeholder = '标签，回车'; inp.style.cssText = 'width:110px;height:24px;border:1px solid var(--acc);border-radius:5px;padding:0 6px;font-size:12px;outline:none';
  anchor.replaceWith(inp); inp.focus();
  const done = ok => { const v = inp.value.trim(); if (ok && v) patch(p.id, { tags: [...p.tags, ...v.split(/[,，\s]+/).filter(Boolean)] }, true).then(after); else after(); };
  inp.onkeydown = e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  inp.onblur = () => done(true);
}
function board(el, ps) {
  el.innerHTML = `<div class="board">${S.meta.statuses.map((s, i) => {
    const items = ps.filter(p => p.status === s);
    return `<div class="col" data-s="${s}"><div class="colh">${stPill(s)}<span class="n">${items.length}</span></div>
      ${items.map(p => `<div class="kc" draggable="true" data-id="${esc(p.id)}">${p.thumb ? `<img src="${fileUrl(p, p.thumb)}" alt="">` : '<img alt="">'}
        <div><b>${p.pinned ? '<span class="star">★</span> ' : ''}${esc(p.title)}</b><span class="ty">${p.typeName} · ${sizeOf(p)}${p.plan ? ' · 计划 ' + p.plan.slice(5) : ''}</span></div></div>`).join('')}</div>`;
  }).join('')}</div>`;
  dnd(el, '.kc', '.col', (id, col) => { const s = col.dataset.s; if (S.projects.find(p => p.id === id).status !== s) patch(id, { status: s }).then(render); });
  el.onclick = e => { const k = e.target.closest('.kc'); if (k) location.hash = '#/p/' + encodeURIComponent(k.dataset.id); };
}
function dnd(el, itemSel, zoneSel, onDrop) {
  el.addEventListener('dragstart', e => { const it = e.target.closest(itemSel); if (!it) return; e.dataTransfer.setData('text/plain', it.dataset.id); it.classList.add('dragging'); });
  el.addEventListener('dragend', e => e.target.closest?.(itemSel)?.classList.remove('dragging'));
  el.addEventListener('dragover', e => { const z = e.target.closest(zoneSel); if (z) { e.preventDefault(); $$(zoneSel + '.over', el).forEach(x => x !== z && x.classList.remove('over')); z.classList.add('over'); } });
  el.addEventListener('dragleave', e => { const z = e.target.closest(zoneSel); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  el.addEventListener('drop', e => { const z = e.target.closest(zoneSel); if (!z) return; e.preventDefault(); z.classList.remove('over'); onDrop(e.dataTransfer.getData('text/plain'), z); });
}
function calendar(el, ps) {
  const now = new Date(); S.cal ||= { y: now.getFullYear(), m: now.getMonth() };
  const { y, m } = S.cal, first = new Date(y, m, 1), start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
  const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = [...Array(42)].map((_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const evs = {};
  for (const p of ps) {
    if (p.plan) (evs[p.plan] ||= []).push(`<span class="ev plan" draggable="true" data-id="${esc(p.id)}" title="计划发布">◷ ${esc(p.title)}</span>`);
    for (const r of p.published) (evs[r.date] ||= []).push(`<span class="ev pub" data-id="${esc(p.id)}" title="已发布到${esc(r.platform)}">✓ ${esc(r.platform)} · ${esc(p.title)}</span>`);
  }
  const unsched = ps.filter(p => !p.plan && p.status !== '已发布');
  el.innerHTML = `<div class="calhead"><button class="btn" data-m="-1">‹</button><b>${y} 年 ${m + 1} 月</b><button class="btn" data-m="1">›</button><button class="btn" data-m="0">今天</button>
      <span class="ty" style="margin-left:8px">虚线是计划发布，绿色是已发布。把下面的项目拖到某一天就排上了。</span></div>
    <div class="cal">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<div class="wd">周${d}</div>`).join('')}
      ${days.map(d => `<div class="day${d.getMonth() !== m ? ' out' : ''}${key(d) === todayStr() ? ' today' : ''}" data-d="${key(d)}"><span class="dn">${d.getDate()}</span>${(evs[key(d)] || []).join('')}</div>`).join('')}</div>
    <div class="unsched">还没排期：${unsched.length ? unsched.map(p => `<span class="ev" draggable="true" data-id="${esc(p.id)}">${esc(p.title)}</span>`).join('') : '都排好了'}</div>`;
  el.onclick = e => {
    const b = e.target.closest('[data-m]');
    if (b) { const k = +b.dataset.m; if (!k) S.cal = { y: now.getFullYear(), m: now.getMonth() }; else { const d = new Date(y, m + k, 1); S.cal = { y: d.getFullYear(), m: d.getMonth() }; } calendar(el, ps); return; }
    const ev = e.target.closest('.ev[data-id]'); if (ev) location.hash = '#/p/' + encodeURIComponent(ev.dataset.id);
  };
  if (!el.dataset.dnd) { el.dataset.dnd = 1; dnd(el, '.ev[draggable]', '.day', (id, day) => patch(id, { plan: day.dataset.d }).then(render)); }
}

/* ---------- 最近动态 ---------- */
async function renderActivity() {
  const items = await api('GET', '/api/activity?limit=120');
  main.innerHTML = `<div class="top"><div class="crumb"><b>最近动态</b></div></div>
    <div class="page"><div class="h1row"><h1>最近动态</h1><span class="cnt">网页和命令行的操作都会记在这里</span></div>
    <div class="feed">${items.length ? items.map(e => {
      const p = S.projects.find(x => x.id === e.id);
      return `<div class="fe"><span class="when">${ago(e.t)}</span><div><b data-id="${esc(e.id)}">${esc(p?.title || e.id)}</b>　<span class="act">${esc(e.action)}${e.detail ? '：' + esc(e.detail) : ''}</span></div></div>`;
    }).join('') : '<div class="empty-state">还没有记录</div>'}</div></div>`;
  main.onclick = e => { const b = e.target.closest('b[data-id]'); if (b) location.hash = '#/p/' + encodeURIComponent(b.dataset.id); };
}

/* ---------- 项目页 ---------- */
async function renderProject(id, tab) {
  if (tab) S.tab = tab;
  const fresh = !S.detail || S.detail.id !== id;
  if (fresh) { S.pvIndex = 0; S.cb = 0; }
  try { S.detail = await api('GET', `/api/projects/${encodeURIComponent(id)}`); }
  catch (e) { main.innerHTML = `<div class="page"><div class="empty-state">${esc(e.message)}<br><br><a class="btn" href="#/all">回到全部项目</a></div></div>`; return; }
  const p = S.detail, art = p.type === 'article', script = p.form === 'script';
  // 文章按四步走；卡片是三个视图。笔记、信息是次要入口，放右边的小图标。视频脚本和文章一样，最后一步换成提词
  const STEPS = art ? [['research', '资料', 'search'], ['outline', '大纲', 'list-tree'], ['write', '写作', 'pen-line'], ['check', '体检', 'stethoscope'], script ? ['prompter', '提词', 'clapperboard'] : ['publish', '发布', 'send']]
                    : [['outline', '大纲', 'list-tree'], ['read', '浏览', 'gallery-horizontal'], ['tune', '精修', 'mouse-pointer-click'], ['preview', '画布', 'frame']];
  const EXTRA = [['notes', '笔记', 'notebook-pen'], ['info', '信息', 'info']];
  if ((fresh && !tab) || ![...STEPS, ...EXTRA].some(t => t[0] === S.tab)) S.tab = p.phase === 'outline' ? 'outline' : art ? 'write' : 'read';
  main.onclick = null;
  main.innerHTML = `
    <div class="top phead">
      <a class="icb" href="#/type/${p.form || p.type}" data-tip="返回${p.typeName}列表">${I('arrow-left')}</a>
      <h1 class="pt" contenteditable="true" spellcheck="false" id="ptitle" title="点击改标题">${esc(p.title)}</h1>
      <select class="stsel st${stIdx(p.status)}" id="pstatus" title="状态">${S.meta.statuses.map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <button class="icb pinsm${p.pinned ? ' on' : ''}" id="pin" data-tip="${p.pinned ? '取消星标' : '加星标'}">${I('star')}</button>
      <div class="sp"></div>
      <span class="ty nowrap">${sizeOf(p)} · ${ago(p.updated)}更新</span>
      ${script ? `<button class="btn" id="pcopysay" data-tip="只复制要说出口的话，不带画面提示和封面、发布文案">${I('clipboard-copy')}<span>复制口播稿</span></button>` : art ? `<button class="btn" id="ptoscript" data-tip="把这篇文章转写成一条视频的口播稿（新建一个视频脚本，文章本身不动）">${I('clapperboard')}<span>转成视频脚本</span></button><button class="btn" id="pcopyx" data-tip="复制推特（X）长文版正文，图片按顺序整理好">${I('send')}<span>复制到推特</span></button><button class="btn" id="pcopywx" data-tip="复制公众号正文，直接粘进公众号编辑器">${I('clipboard-copy')}<span>复制到公众号</span></button>` : `<button class="btn pri" data-run="build">${I('play')}渲染成图</button>`}
      <div class="more"><button class="icb" id="morebtn" data-tip="更多">${I('ellipsis')}</button>
        <div class="menu" id="menu" hidden>
          ${art && !script ? `<button data-run="build">${I('hammer')}重新构建公众号版和 X 版</button><button id="mtpl">${I('palette')}换模板</button>` : ''}
          <button data-run="pack">${I('archive')}打包成 zip</button>
          ${p.zip ? `<a href="${fileUrl(p, p.zip)}" download>${I('download')}下载 ${esc(p.zip)}</a>` : ''}
          <hr>
          <button data-open="preview">${I('external-link')}在浏览器里打开</button>
          <button data-open="edit">${I('file-pen-line')}用文本编辑器打开</button>
          <button data-open="finder">${I('folder-open')}在访达里显示</button>
          <button id="cpcli">${I('copy')}复制命令行写法</button>
          <hr><button data-act="aiset">${I('settings')}AI 设置</button>
        </div></div>
    </div>
    <nav class="steps${art ? ' flow' : ''}" id="tabs">
      ${STEPS.map(([k, n, ic], i) => `<button data-tab="${k}" class="step${S.tab === k ? ' on' : ''}">${I(ic)}<span>${n}</span></button>${art && i < STEPS.length - 1 ? `<span class="arr">${I('chevron-right')}</span>` : ''}`).join('')}
      <div class="sp"></div>
      ${EXTRA.map(([k, n, ic]) => `<button data-tab="${k}" class="icb${S.tab === k ? ' on' : ''}" data-tip="${n}">${I(ic)}${k === 'notes' && p.notes ? '<i class="badge"></i>' : ''}</button>`).join('')}
    </nav>
    <div id="tabbody" class="tabbody"></div>`;
  bindProject(p);
  renderTab(p);
}

function bindProject(p) {
  $$('[data-act]', main).forEach(b => b.onclick = () => { $('#menu').hidden = true; ACTS[b.dataset.act](); });
  const t = $('#ptitle');
  t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } if (e.key === 'Escape') { t.textContent = p.title; t.blur(); } };
  t.onblur = () => { const v = t.textContent.trim(); if (v && v !== p.title) patch(p.id, { title: v }).then(() => renderSide(route())); else t.textContent = p.title; };
  $('#pin').onclick = () => patch(p.id, { pinned: !p.pinned }, true).then(x => { p.pinned = x.pinned; $('#pin').classList.toggle('on', x.pinned); renderSide(route()); });
  $('#pstatus').onchange = e => patch(p.id, { status: e.target.value }).then(() => { e.target.className = 'stsel st' + stIdx(e.target.value); renderSide(route()); });
  $('#morebtn').onclick = e => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; };
  $('#pcopywx') && ($('#pcopywx').onclick = () => copyWechat(p, $('#pcopywx')));
  $('#pcopyx') && ($('#pcopyx').onclick = () => copyX(p, $('#pcopyx')));
  $('#pcopysay') && ($('#pcopysay').onclick = async () => { const d = scriptParts(await scriptSource(p)); copy(d.parts.map(x => x.say.join('\n')).filter(Boolean).join('\n\n'), '口播稿已复制'); });
  $('#mtpl') && ($('#mtpl').onclick = () => { $('#menu').hidden = true; tplDlg({ mode: 'apply', p, onApplied: () => render() }); });
  document.addEventListener('click', () => { const m = $('#menu'); if (m) m.hidden = true; }, { once: true });
  $('#cpcli').onclick = () => copy(`xy show "${p.title}"`, '已复制：xy show "' + p.title + '"');
  $$('[data-open]', main).forEach(b => b.onclick = () => { $('#menu').hidden = true; api('POST', `/api/projects/${encodeURIComponent(p.id)}/open`, { how: b.dataset.open }).then(() => toast('已打开')).catch(e => toast(e.message, true)); });
  main.onclick = e => { const b = e.target.closest('[data-run]'); if (b) { $('#menu') && ($('#menu').hidden = true); run(p, b.dataset.run, b); } };
  $('#tabs').onclick = e => { const k = e.target.closest('[data-tab]')?.dataset.tab; if (k) goTab(p, k); };
  if ($('#ptoscript')) $('#ptoscript').onclick = () => openToScript(p);
}

// 文章转成视频脚本：选时长、可以补一句侧重点；建好后进脚本的写作页，替作者把第一句话发给 AI 助手
function openToScript(p) {
  let secs = 90;
  const SECS = [[60, '1 分钟'], [90, '1 分半'], [120, '2 分钟'], [180, '3 分钟']];
  layer.innerHTML = `<div class="mask"><div class="dlg"><h3>转成视频脚本</h3><div class="bd">
      <div class="ty" style="line-height:1.7">把《${esc(p.title)}》转写成一条视频的口播稿。会新建一个视频脚本，文章本身不动。AI 会先把文章读完，挑最值得讲的几个点，改成说得出口的话，并写好每段配什么画面。</div>
      <label>视频多长<div class="seg" id="tssec">${SECS.map(([v, n]) => `<button type="button" data-s="${v}" class="${v === secs ? 'on' : ''}">${n}</button>`).join('')}</div></label>
      <label>想侧重讲什么（可不填）<textarea id="tsbrief" rows="3" placeholder="比如：只讲价格和怎么买；给完全没用过的人看；开头用那个日活数字" style="border:1px solid var(--line2);border-radius:7px;padding:8px 10px;outline:none;resize:vertical;line-height:1.6;font-size:13.5px"></textarea></label>
    </div><div class="ft"><button class="btn" data-close>取消</button><button class="btn pri" id="tsgo">${I('clapperboard')}开始转写</button></div></div></div>`;
  $('#tssec').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; secs = +b.dataset.s; $$('#tssec button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#tsgo').onclick = async () => {
    const b = $('#tsgo'); b.disabled = true; b.innerHTML = `${I('loader-circle', 'spinning')}创建中`;
    try {
      const n = await api('POST', '/api/projects', { type: 'script', fromArticle: p.id, brief: $('#tsbrief').value.trim(), script: { seconds: secs } });
      layer.innerHTML = ''; await loadAll(); toast('已新建视频脚本：' + n.title);
      S.autoSend = { pid: n.id, text: n.auto };
      location.hash = '#/p/' + encodeURIComponent(n.id) + '/write';
    } catch (e) { toast(e.message, true); b.disabled = false; b.innerHTML = `${I('clapperboard')}开始转写`; }
  };
}

async function run(p, what, btn) {
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<i class="spin"></i>${what === 'pack' ? '打包中…' : p.type === 'card' ? '渲染中…' : '构建中…'}`;
  try {
    const r = await api('POST', `/api/projects/${encodeURIComponent(p.id)}/${what}`, {});
    if (what === 'pack') toast(`打包完成：${r.zip}（${r.size}）`);
    else toast(p.type === 'card' ? '渲染完成' : '构建完成');
    S.projects = await api('GET', '/api/projects'); renderProject(p.id);
  } catch (e) { showLog('出错了', e.message); btn.disabled = false; btn.innerHTML = label; }
}
function showLog(title, text) {
  layer.innerHTML = `<div class="mask"><div class="dlg"><h3>${esc(title)}</h3><div class="bd"><pre>${esc(String(text).split('\n').slice(-40).join('\n'))}</pre></div><div class="ft"><button class="btn pri" data-close>好</button></div></div></div>`;
}

function renderTab(p) {
  const el = $('#tabbody');
  el.className = 'tabbody tb-' + S.tab;
  if (S.tab === 'read') return p.type === 'card' ? cardBrowse(el, p) : articleRead(el, p);
  if (S.tab === 'research') return researchTab(el, p);
  if (S.tab === 'outline') return outlineTab(el, p);
  if (S.tab === 'check') return checkTab(el, p);
  if (S.tab === 'publish') return publishTab(el, p);
  if (S.tab === 'prompter') return prompterTab(el, p);
  if (S.tab === 'write') return writeTab(el, p);
  if (S.tab === 'tune') return tuneTab(el, p);
  if (S.tab === 'preview') return cardCanvas(el, p);
  if (S.tab === 'notes') return notesTab(el, p);
  if (S.tab === 'info') return infoTab(el, p);
}

/* ---------- 阅读：像在微信里打开文章 ---------- */
async function articleRead(el, p) {
  S.rv ||= 'wechat'; S.rw ||= lsGet('wb.rw', 'phone');
  el.innerHTML = '<div class="empty-state">载入中…</div>';
  if (S.rv === 'x') return articleReadX(el, p);
  let d; try { d = await api('GET', `/api/projects/${encodeURIComponent(p.id)}/read?v=${S.rv}`); } catch (e) { el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; return; }
  const date = p.published[0]?.date || p.plan || todayStr();
  el.innerHTML = `
    <div class="rbar">
      <div class="seg" id="rv"><button data-v="wechat" class="${S.rv === 'wechat' ? 'on' : ''}">公众号</button><button data-v="x" class="${S.rv === 'x' ? 'on' : ''}">X 长文</button></div>
      <div class="seg" id="rw"><button data-w="phone" class="${S.rw === 'phone' ? 'on' : ''}">手机</button><button data-w="wide" class="${S.rw === 'wide' ? 'on' : ''}">电脑</button></div>
      <div class="sp"></div>
      ${d.built ? `<span class="ty">${d.stale ? '' : '构建于 ' + ago(d.builtAt)}</span>` : ''}
      <button class="btn" id="rcopy" title="复制带格式的正文，直接粘进公众号编辑器">⧉ 复制正文</button>
      <button class="btn" data-tab-go="write">${I('pen-line')}去写作</button>
    </div>
    ${d.stale ? `<div class="stale">文章改过了，下面还是上次构建的样子。<button class="btn pri" data-run="build">${I('hammer')}重新构建</button></div>` : ''}
    ${!d.built ? `<div class="stale">还没构建过，下面是按 article.md 临时排的版，图表和封面要构建后才完整。<button class="btn pri" data-run="build">${I('hammer')}构建</button></div>` : ''}
    <div class="wxbg"><article class="wx w-${S.rw}">
      ${S.rv === 'wechat' ? `<h1 class="wx-t">${esc(p.title)}</h1><div class="wx-m"><span class="wx-a">${esc(S.profile?.name || '')}</span><span>${esc(date)}</span></div>` : `<h1 class="wx-t x">${esc(p.title)}</h1>`}
      <div id="wxbody"></div>
    </article></div>`;
  const host = $('#wxbody'), root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `${d.css ? `<link rel="stylesheet" href="${d.css}">` : ''}<style>:host{display:block;background:#fff;color:#1f1f1d;color-scheme:light}img{max-width:100%;height:auto}.ph{color:#999;background:#f4f4f2;padding:10px;border-radius:6px;font-size:13px}</style>${d.built ? d.html : `<section class="article">${d.html}</section>`}`;
  $('#rv').onclick = e => { const v = e.target.dataset.v; if (v && v !== S.rv) { S.rv = v; articleRead(el, p); } };
  $('#rw').onclick = e => { const w = e.target.dataset.w; if (w) { S.rw = w; lsSet('wb.rw', w); $('.wx').className = 'wx w-' + w; $$('#rw button').forEach(b => b.classList.toggle('on', b.dataset.w === w)); } };
  $('[data-tab-go]', el).onclick = () => { S.tab = 'write'; $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === 'write')); renderTab(p); };
  $('#rcopy').onclick = async () => {
    const html = [...root.children].filter(n => !['LINK', 'STYLE'].includes(n.tagName)).map(n => n.outerHTML).join('');
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([host.shadowRoot.textContent], { type: 'text/plain' }) })]); toast('已复制，去公众号编辑器里粘贴'); }
    catch { toast('浏览器不让复制，用「⋯ → 在浏览器里打开预览」里的复制按钮', true); }
  };
}

// 浏览页的 X 长文：直接按 X 的格式转好再排（和「复制到推特」用的是同一份）
async function articleReadX(el, p) {
  let r; try { r = await api('POST', `/api/projects/${enc(p.id)}/xpost`, {}); } catch (e) { el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; return; }
  el.innerHTML = `
    <div class="rbar">
      <div class="seg" id="rv"><button data-v="wechat">公众号</button><button data-v="x" class="on">X 长文</button></div>
      <div class="seg" id="rw"><button data-w="phone" class="${S.rw === 'phone' ? 'on' : ''}">手机</button><button data-w="wide" class="${S.rw === 'wide' ? 'on' : ''}">电脑</button></div>
      <div class="sp"></div><span class="ty">仿 X 长文的样子，实际以 X 为准</span>
      <button class="btn" id="rcopyx">${I('send')}复制到推特</button>
      <button class="btn" data-tab-go="write">${I('pen-line')}去写作</button>
    </div>
    ${r.warnings.length ? `<div class="stale">${r.warnings.map(esc).join('；')}</div>` : ''}
    <div class="wxbg"><article class="wx xart w-${S.rw}"><div id="wxbody"></div></article></div>`;
  $('#wxbody').attachShadow({ mode: 'open' }).innerHTML = xPreviewHtml(p, r);
  $('#rv').onclick = e => { const v = e.target.dataset.v; if (v && v !== S.rv) { S.rv = v; articleRead(el, p); } };
  $('#rw').onclick = e => { const w = e.target.dataset.w; if (w) { S.rw = w; lsSet('wb.rw', w); $('.wx').className = 'wx xart w-' + w; $$('#rw button').forEach(b => b.classList.toggle('on', b.dataset.w === w)); } };
  $('[data-tab-go]', el).onclick = () => { S.tab = 'write'; $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === 'write')); renderTab(p); };
  $('#rcopyx').onclick = () => copyX(p, $('#rcopyx'));
}

/* ---------- 浏览：卡片一页页翻着看 ---------- */
function cardBrowse(el, p) {
  const imgs = p.outputs.filter(f => !/候选/.test(f));
  if (!imgs.length) { el.innerHTML = `<div class="empty-state">还没有成品图。<br><br><button class="btn pri" data-run="build">${I('play')}渲染成图</button>　或者去「精修」里先改</div>`; return; }
  S.cb = Math.min(S.cb || 0, imgs.length - 1);
  const label = f => f.split('/').pop().replace(/^\d{4}-\d{2}-\d{2}_[^_]+_/, '').replace(/\.\w+$/, '');
  const v = Date.parse(p.updated);
  el.innerHTML = `
    ${p.stale ? `<div class="stale">卡片改过了，这里还是上次渲染的图。<button class="btn pri" data-run="build">${I('play')}重新渲染</button></div>` : ''}
    <div class="cbrowse"><button class="cnav" data-d="-1">${I('chevron-left')}</button>
      <div class="cmain"><img id="cbimg" src="${fileUrl(p, imgs[S.cb])}?v=${v}" alt=""></div>
      <button class="cnav" data-d="1">${I('chevron-right')}</button></div>
    <div class="cinfo"><b id="cbn">${S.cb + 1} / ${imgs.length}</b>　<span class="ty" id="cbl">${esc(label(imgs[S.cb]))}</span></div>
    <div class="cthumbs">${imgs.map((f, i) => `<button data-i="${i}" class="${i === S.cb ? 'on' : ''}"><img loading="lazy" src="${fileUrl(p, f)}?v=${v}" alt=""></button>`).join('')}</div>`;
  const go = i => { S.cb = (i + imgs.length) % imgs.length; $('#cbimg').src = `${fileUrl(p, imgs[S.cb])}?v=${v}`; $('#cbn').textContent = `${S.cb + 1} / ${imgs.length}`; $('#cbl').textContent = label(imgs[S.cb]); $$('.cthumbs button').forEach((b, k) => b.classList.toggle('on', k === S.cb)); $('.cthumbs .on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
  el.querySelectorAll('.cnav').forEach(b => b.onclick = () => go(S.cb + +b.dataset.d));
  $('.cthumbs').onclick = e => { const b = e.target.closest('[data-i]'); if (b) go(+b.dataset.i); };
  $('#cbimg').onclick = () => lightbox(p, imgs, S.cb);
  S.cbNav = d => go(S.cb + d);
}

/* ---------- 信息：属性、发布记录、文件、操作记录 ---------- */
function infoTab(el, p) {
  el.innerHTML = `<div class="info">
    <div class="props">
      <div class="k">类型</div><div class="v">${p.typeName}　<span class="ty">${p.type === 'card' ? `${p.pages} 页，已渲染 ${p.images} 张` : `${p.chars} 字`}</span></div>
      <div class="k">状态</div><div class="v">${stPill(p.status)}<span class="ty">在页头改</span></div>
      <div class="k">标签</div><div class="v" id="ptags">${p.tags.map(t => `<span class="tag">#${esc(t)}<button data-rmtag="${esc(t)}">×</button></span>`).join('')}<button class="addtag" data-addtag>＋ 添加</button></div>
      <div class="k">计划发布</div><div class="v"><input type="date" id="pplan" value="${esc(p.plan)}">${p.plan ? '<button class="addtag" id="clearplan">清空</button>' : ''}</div>
      <div class="k">发布记录</div><div class="v" style="flex-direction:column;align-items:flex-start;gap:6px" id="ppub">
        ${p.published.map((r, i) => `<div class="pub"><span class="tag">${esc(r.platform)}</span><span class="ty">${esc(r.date)}</span>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>` : ''}<button class="addtag" data-rmpub="${i}">删除</button></div>`).join('')}
        <button class="addtag" id="addpub">＋ 记一笔发布</button></div>
      <div class="k">成品</div><div class="v">${p.zip ? `<a class="tag" href="${fileUrl(p, p.zip)}" download>⬇ ${esc(p.zip)}</a>` : '<span class="ty">还没打包</span>'}</div>
      <div class="k">位置</div><div class="v"><span class="path" id="ppath" title="点击复制路径">${esc(p.dir)}</span></div>
      <div class="k">时间</div><div class="v ty">创建 ${fmtTime(p.created)}　·　更新 ${ago(p.updated)}</div>
    </div>
    <div class="isec">操作记录</div>
    <div class="feed hist">${p.history.length ? p.history.slice(0, 30).map(h => `<div class="fe"><span class="when">${fmtTime(h.t)}</span><div><b>${esc(h.action)}</b>　<span class="act">${esc(h.detail)}</span></div></div>`).join('') : '<div class="ty" style="padding:10px 0">还没有记录。网页和命令行里的修改、构建、打包都会记在这里</div>'}</div>
    <details class="isec2"><summary>文件（${p.files.filter(f => !f.dir).length}）</summary>
      <table class="tb files"><tbody>${p.files.map(f => `<tr><td class="n" style="padding-left:${10 + (f.path.split('/').length - 1) * 18}px">${f.dir ? `<b>▸ ${esc(f.path.split('/').pop())}/</b>` : `<a href="${fileUrl(p, f.path)}" target="_blank">${esc(f.path.split('/').pop())}</a>`}</td>
      <td class="ty">${f.dir ? '' : f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, f.size / 1024 | 0) + ' KB'}</td><td class="ty">${ago(new Date(f.t).toISOString())}</td></tr>`).join('')}</tbody></table></details>
  </div>`;
  const again = () => renderProject(p.id, 'info');
  $('#pplan').onchange = e => patch(p.id, { plan: e.target.value }).then(again);
  $('#clearplan') && ($('#clearplan').onclick = () => patch(p.id, { plan: '' }).then(again));
  $('#ptags').onclick = e => {
    const rm = e.target.closest('[data-rmtag]'); if (rm) patch(p.id, { tags: p.tags.filter(x => x !== rm.dataset.rmtag) }, true).then(again);
    const add = e.target.closest('[data-addtag]'); if (add) inlineTag(add, p, again);
  };
  $('#ppub').onclick = e => {
    const rm = e.target.closest('[data-rmpub]');
    if (rm) patch(p.id, { published: p.published.filter((_, i) => i !== +rm.dataset.rmpub) }).then(again);
    if (e.target.id === 'addpub') {
      e.target.outerHTML = `<div class="pubform"><select id="pf">${PLATFORMS.map(x => `<option>${x}</option>`).join('')}</select><input id="pu" placeholder="链接（可不填）" style="width:260px"><input id="pd" type="date" value="${todayStr()}"><button class="btn acc" id="pok">记下</button><button class="btn" id="pno">取消</button></div>`;
      $('#pok').onclick = () => patch(p.id, { addPublish: { platform: $('#pf').value, url: $('#pu').value.trim(), date: $('#pd').value } }).then(again);
      $('#pno').onclick = again;
    }
  };
  $('#ppath').onclick = () => copy(p.dir, '已复制路径');
}

/* Figma 式画布：所有页面平铺，滚轮平移，⌘/Ctrl + 滚轮缩放，拖动画布 */
function cardCanvas(el, p) {
  const pages = p.cardList;
  const imgFor = n => p.outputs.find(f => new RegExp(`_${String(n).padStart(2, '0')}[^/]*$`).test(f));
  const label = f => f.split('/').pop().replace(/^\d{4}-\d{2}-\d{2}_[^_]+_/, '').replace(/\.\w+$/, '');
  const frames = pages.map(n => {
    const img = imgFor(n);
    return S.cmode === 'img'
      ? (img ? `<div class="frame" data-img="${esc(img)}"><span class="fl">${esc(label(img))}</span><img src="${fileUrl(p, img)}?t=${Date.parse(p.updated)}" draggable="false" alt=""></div>`
             : `<div class="frame"><span class="fl">第 ${n} 页（还没渲染）</span><img alt="" style="opacity:.3"></div>`)
      : `<div class="frame"><span class="fl">第 ${n} 页 · 源页面</span><iframe sandbox="allow-scripts" src="${fileUrl(p, 'index.html')}?c=${n}" scrolling="no"></iframe></div>`;
  }).join('');
  el.innerHTML = `<div class="canvas" id="cv"><div class="seg cmode"><button data-m="img" class="${S.cmode === 'img' ? 'on' : ''}">成品图</button><button data-m="live" class="${S.cmode === 'live' ? 'on' : ''}">源页面（实时）</button></div>
    <div class="stage" id="stage">${frames}</div>
    <div class="hint">拖动画布平移 · ⌘ + 滚轮缩放 · 点一页放大看</div>
    <div class="zoom"><button data-z="-">−</button><span id="zv">100%</span><button data-z="+">＋</button><button class="fit" data-z="fit">适应</button><button class="fit" data-z="1">100%</button></div></div>`;
  const cv = $('#cv'), st = $('#stage'), T = { x: 0, y: 0, k: 1 };
  const apply = () => { st.style.transform = `translate(${T.x}px,${T.y}px) scale(${T.k})`; $('#zv').textContent = Math.round(T.k * 100) + '%'; };
  const fit = () => { const W = st.scrollWidth, H = st.scrollHeight, cw = cv.clientWidth, ch = cv.clientHeight; T.k = Math.min(cw / W, ch / H, 1); T.x = (cw - W * T.k) / 2; T.y = (ch - H * T.k) / 2; apply(); };
  const zoomAt = (f, cx, cy) => { const k = Math.min(3, Math.max(.05, T.k * f)); T.x = cx - (cx - T.x) * (k / T.k); T.y = cy - (cy - T.y) * (k / T.k); T.k = k; apply(); };
  requestAnimationFrame(fit);
  cv.onwheel = e => { e.preventDefault(); const r = cv.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * .01), e.clientX - r.left, e.clientY - r.top); else { T.x -= e.deltaX; T.y -= e.deltaY; apply(); } };
  let drag = null, moved = false;
  cv.onmousedown = e => { if (e.target.closest('.zoom,.cmode')) return; drag = { x: e.clientX - T.x, y: e.clientY - T.y }; moved = false; cv.classList.add('grabbing'); };
  window.onmousemove = e => { if (!drag) return; const nx = e.clientX - drag.x, ny = e.clientY - drag.y; if (Math.abs(nx - T.x) + Math.abs(ny - T.y) > 2) moved = true; T.x = nx; T.y = ny; apply(); };
  window.onmouseup = e => {
    if (!drag) return; drag = null; cv.classList.remove('grabbing');
    if (!moved) { const f = e.target.closest?.('.frame[data-img]'); if (f) lightbox(p, p.outputs, p.outputs.indexOf(f.dataset.img)); }
  };
  $('.zoom', cv).onclick = e => { const z = e.target.dataset.z; const r = { left: cv.clientWidth / 2, top: cv.clientHeight / 2 };
    if (z === '+') zoomAt(1.25, r.left, r.top); if (z === '-') zoomAt(.8, r.left, r.top); if (z === 'fit') fit(); if (z === '1') zoomAt(1 / T.k, r.left, r.top); };
  $('.cmode', cv).onclick = e => { const m = e.target.dataset.m; if (m && m !== S.cmode) { S.cmode = m; cardCanvas(el, p); } };
}
function articlePreview(el, p) {
  if (!p.previews.length) { el.innerHTML = '<div class="empty-state">还没有可预览的文件，点「构建」生成</div>'; return; }
  S.pvIndex = Math.min(S.pvIndex, p.previews.length - 1);
  const pv = p.previews[S.pvIndex];
  el.innerHTML = `<div class="bar"><div class="seg" id="pvs">${p.previews.map((x, i) => `<button data-i="${i}" class="${i === S.pvIndex ? 'on' : ''}">${esc(x.name)}</button>`).join('')}</div>
      <a class="btn" href="${fileUrl(p, pv.file)}" target="_blank">↗ 新标签页打开</a></div>
    <div class="phonewrap"><div class="phone${pv.file.includes('x.html') ? ' wide' : ''}"><iframe sandbox="allow-scripts allow-popups" src="${fileUrl(p, pv.file)}"></iframe></div></div>
    ${p.outputs.length ? `<div class="sec" style="padding:18px 0 0">产出的图（${p.outputs.length}）</div><div class="strip">${p.outputs.map((f, i) => `<figure data-i="${i}"><img loading="lazy" src="${fileUrl(p, f)}" alt=""><figcaption>${esc(f.split('/').pop())}</figcaption></figure>`).join('')}</div>` : ''}`;
  $('#pvs').onclick = e => { const i = e.target.dataset.i; if (i != null) { S.pvIndex = +i; articlePreview(el, p); } };
  $('.strip', el) && ($('.strip', el).onclick = e => { const f = e.target.closest('figure'); if (f) lightbox(p, p.outputs, +f.dataset.i); });
}
function lightbox(p, list, i) {
  const show = () => {
    layer.innerHTML = `<div class="lb"><button class="x" data-close>×</button><button class="nav2" style="left:20px" data-d="-1">‹</button>
      <img src="${fileUrl(p, list[i])}" alt=""><button class="nav2" style="right:20px" data-d="1">›</button><div class="cap2">${esc(list[i].split('/').pop())}　${i + 1} / ${list.length}</div></div>`;
    $('.lb').onclick = e => { const d = e.target.dataset.d; if (d) { i = (i + +d + list.length) % list.length; show(); } else if (e.target.classList.contains('lb')) layer.innerHTML = ''; };
  };
  show(); S.lb = d => { i = (i + d + list.length) % list.length; show(); };
}

/* 笔记：左边写，右边看效果，停手 0.7 秒自动保存 */
function notesTab(el, p) {
  el.innerHTML = `<div class="notes"><div><textarea id="nt" placeholder="写点什么：选题想法、修改意见、发布后的数据……支持 Markdown">${esc(p.notes)}</textarea><div class="saved" id="ns">自动保存</div></div><div class="md" id="nmd"></div></div>`;
  const ta = $('#nt'), md = $('#nmd'); let timer;
  const draw = () => md.innerHTML = mdToHtml(ta.value) || '<span class="ty">右边会显示排版后的效果</span>';
  draw();
  ta.oninput = () => { draw(); $('#ns').textContent = '正在输入…'; clearTimeout(timer); timer = setTimeout(async () => { await patch(p.id, { notes: ta.value }, true); $('#ns').textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN'); }, 700); };
}
function mdToHtml(s) {
  const inl = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--acc-ink)">$1</a>');
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  // 模型常在表格行之间多空一行，先把它们并回去
  const lines = s.replace(/(\|[^\n]*\|)\n\s*\n(?=\s*\|)/g, '$1\n').replace(/(\|[^\n]*\|)\n\s*\n(?=\s*\|)/g, '$1\n').split('\n');
  let html = '', list = '';
  const close = () => { if (list) { html += `</${list}>`; list = ''; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      close();
      const head = cells(l); i++;
      let rows = '';
      while (/^\s*\|.*\|\s*$/.test(lines[i + 1] || '')) { i++; rows += `<tr>${cells(lines[i]).map(c => `<td>${inl(c)}</td>`).join('')}</tr>`; }
      html += `<div class="md-tw"><table><thead><tr>${head.map(c => `<th>${inl(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)/), li = l.match(/^\s*[-*]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/), q = l.match(/^\s*>\s?(.*)/);
    if (li || ol) { const k = li ? 'ul' : 'ol'; if (list !== k) { close(); html += `<${k}>`; list = k; } html += `<li>${inl((li || ol)[1])}</li>`; continue; }
    close();
    if (h) html += `<h${Math.min(h[1].length, 3)}>${inl(h[2])}</h${Math.min(h[1].length, 3)}>`;
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) html += '<hr>';
    else if (q) html += `<blockquote>${inl(q[1])}</blockquote>`;
    else if (l.trim()) html += `<p>${inl(l)}</p>`;
  }
  close();
  return html;
}

/* ---------- 新建 ---------- */
// 新建：题目和要求是主体；类型缩成右上角的切换；找选题收在下面，点开才用。
// 写了要求的话，建好后默认让 AI 按要求先写一版（要求存进项目，助手每次都会读）
function openNew(type = ['article', 'script'].includes(route().b) ? route().b : 'card', preIdea) {
  const tpl = t => S.projects.filter(p => p.type === t);
  let picked = preIdea ? 0 : null, ideas = preIdea ? { t: new Date().toISOString(), items: [preIdea], pre: true } : null, busy = false, ideaOpen = !!preIdea;
  // 建好以后：chat 先和 AI 聊大纲（默认）/ draft 直接写初稿 / self 我自己写
  let chosenTpl = null, after = lsGet('wb.afternew', 'chat');
  const AFTER = [['chat', 'message-circle-question', '先查资料、出大纲', 'AI 先查资料，在大纲页出大纲；你改好、点「开始写」再进写作页'], ['draft', 'wand-sparkles', '直接写初稿', '按题目和要求先写一版'], ['self', 'pen-line', '我自己写', '建好空白的就行']];
  const val = id => $(id)?.value ?? '';
  const ideaBrief = x => [x.angle && `切入角度：${x.angle}`, x.why && `为什么现在写：${x.why}`, x.hook && `开头可以用：${x.hook}`].filter(Boolean).join('\n');
  const ideaCard = (x, i) => `<button class="ncard${picked === i ? ' on' : ''}" data-i="${i}"><span class="nc-t">${esc(x.title)}</span>${x.angle ? `<span class="nc-a">${esc(x.angle)}</span>` : ''}
      <span class="nc-m">${x.evidence?.length ? `${I('link')}${x.evidence.length} 条证据${x.firstHand ? ' · 含一手' : ''}` : x.sources?.length ? `${I('link')}${x.sources.length} 个来源` : ''}${x.brief ? `<em>有写作简报</em>` : ''}</span>${picked === i ? `<i class="nc-ok">${I('check')}</i>` : ''}</button>`;
  const HINTS = [['给谁看', '给谁看：'], ['切入角度', '切入角度：'], ['要写到的内容', '要写到：'], ['参考链接', '参考链接：'], ['篇幅', '篇幅：'], ['不要写的', '不要写：']];
  const loadTpl = async () => { try { const l = await api('GET', '/api/templates'); chosenTpl = l.find(t => t.kind === 'mine') || l[0] || null; if (type === 'article' && $('#ntpl')) draw(); } catch {} };
  const draw = () => {
    const keep = { name: val('#nn'), brief: val('#nbrief'), dir: val('#idir') };
    layer.innerHTML = `<div class="mask"><div class="dlg ndlg"><div class="nhead"><h3>新建</h3><div class="sp"></div>
        <div class="seg ntype"><button data-t="article" class="${type === 'article' ? 'on' : ''}">${I('file-text')}文章</button><button data-t="script" class="${type === 'script' ? 'on' : ''}">${I('clapperboard')}视频脚本</button><button data-t="card" class="${type === 'card' ? 'on' : ''}">${I('images')}小红书卡片</button></div></div>
      <div class="bd">
        <input id="nn" class="ntitle" placeholder="${type === 'card' ? '题目，比如：Kimi Work 拆解' : type === 'script' ? '题目，比如：200 块钱让 AI 当一周产品经理' : '题目，比如：AI 浏览器横评'}" value="${esc(keep.name)}" autocomplete="off">
        <div class="nreq">
          <textarea id="nbrief" rows="7" placeholder="${type === 'card' ? '想做成什么样的卡片？写给谁看、讲哪几个点、参考哪些图或链接、几页……\n想到什么写什么，写得越具体，AI 做得越接近你要的。' : type === 'script' ? '想拍成什么样？给谁看、开头想怎么抓人、要讲到哪几点、是录屏还是出镜、参考哪些视频或链接……\n想到什么写什么，写得越具体，口播稿越接近你要的。' : '想写成什么样？写给谁看、从哪切入、要写到哪些内容、参考链接、大概多长、不要写什么……\n想到什么写什么，写得越具体，AI 写得越接近你要的。'}">${esc(keep.brief)}</textarea>
          <div class="nhints">${HINTS.map(([n, t]) => `<button type="button" data-hint="${esc(t)}">+ ${n}</button>`).join('')}</div>
        </div>
        <div class="nafter"><span class="nlab">建好以后</span><div class="nopts">${AFTER.map(([k, ic, n, d]) => `<button type="button" data-after="${k}" class="${after === k ? 'on' : ''}">${I(ic)}<div><b>${n}</b><span>${k === 'draft' && type === 'card' ? '按题目和要求先做一版' : k === 'draft' && type === 'script' ? '按题目和要求先写一版口播稿' : d}</span></div></button>`).join('')}</div></div>
        ${type === 'article' ? `<div class="tplrow"><span>模板</span><button type="button" class="tplbtn" id="ntpl">${chosenTpl ? `<img src="/tpl-preview/${enc(chosenTpl.id)}" alt=""><div><b>${esc(chosenTpl.name)}</b><span class="ty">${esc(chosenTpl.group)}${chosenTpl.desc ? ' · ' + esc(chosenTpl.desc) : ''}</span></div>` : '<span class="ty">载入中…</span>'}<span class="ty">换一个</span></button></div>`
          : type === 'script' ? `<div class="tplrow"><span>时长</span><select class="sel" id="nsec">${[[30, '30 秒'], [60, '1 分钟'], [90, '1 分半（默认）'], [120, '2 分钟'], [180, '3 分钟']].map(([v, n]) => `<option value="${v}"${v === 90 ? ' selected' : ''}>${n}</option>`).join('')}</select><span class="ty">口播稿按这个时长写，约每秒 4.5 个字</span></div>`
          : `<div class="tplrow"><span>样式</span><select class="sel" id="nf">${tpl(type).map(p => `<option value="${esc(p.id)}">照着「${esc(p.title)}」的样式</option>`).join('')}<option value="">空白开始</option></select></div>`}
        <div class="nidea${ideaOpen ? ' open' : ''}">
          <button type="button" class="ni-h" id="nidea">${I('sparkles')}<b>没想好写什么？让 AI 找选题</b><span class="ty">${ideas?.items?.length && !ideaOpen ? `上次找了 ${ideas.items.length} 个` : ''}</span><span class="sp"></span>${I(ideaOpen ? 'chevron-down' : 'chevron-right')}</button>
          ${ideaOpen ? `<div class="ni-b">
            <div class="ib-ask"><input id="idir" placeholder="方向，可以不填。比如：AI 浏览器、本周 AI 新产品、Agent 怎么收费" value="${esc(keep.dir || ideas?.direction || '')}"><button class="btn" id="igo">${busy ? `${I('loader-circle', 'spinning')}找选题中` : `${I('search')}找选题`}</button></div>
            ${ideas?.items?.length ? `<div class="ncards">${ideas.items.map(ideaCard).join('')}</div><div class="ty">${ideas.pre ? '从选题广场带过来的' : `找于 ${fmtTime(ideas.t)}${ideas.direction ? ` · 方向「${esc(ideas.direction)}」` : ''}`}　点一个，题目和要求会填好，你再改</div>` : '<div class="ty">从选题广场最近 7 天的动态里挑，大约一分钟</div>'}
            <a class="ty" href="#/plaza" data-close>去选题广场看全部动态 ›</a></div>` : ''}
        </div>
      </div><div class="ft"><span class="ty">⌘↵ 创建</span><div class="sp"></div><button class="btn" data-close>取消</button><button class="btn pri" id="nok">${I('plus')}创建</button></div></div></div>`;
    $('.ntype').onclick = e => { const b = e.target.closest('[data-t]'); if (b && b.dataset.t !== type) { type = b.dataset.t; draw(); } };
    $('#ntpl') && ($('#ntpl').onclick = () => tplDlg({ mode: 'pick', current: chosenTpl?.id, onPick: t => { chosenTpl = t; draw(); } }));
    $$('[data-hint]').forEach(b => b.onclick = () => { const ta = $('#nbrief'); ta.value = ta.value.replace(/\s*$/, '') + (ta.value.trim() ? '\n' : '') + b.dataset.hint; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    $$('[data-after]').forEach(b => b.onclick = () => { after = b.dataset.after; lsSet('wb.afternew', after); $$('[data-after]').forEach(x => x.classList.toggle('on', x === b)); });
    $('#nidea').onclick = () => { ideaOpen = !ideaOpen; draw(); if (ideaOpen) $('#idir')?.focus(); };
    $('.ncards')?.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      picked = +b.dataset.i; const x = ideas.items[picked];
      $('#nn').value = x.title;
      const ta = $('#nbrief'); if (!ta.value.trim() || ta.dataset.fromIdea) { ta.value = ideaBrief(x); ta.dataset.fromIdea = '1'; }
      const keepDir = val('#idir'); draw(); $('#idir') && ($('#idir').value = keepDir); $('#nbrief').dataset.fromIdea = '1';
    });
    $('#igo') && ($('#igo').onclick = async () => {
      if (busy) return; busy = true; const dir = val('#idir').trim(); draw();
      const t0 = Date.now(), tk = setInterval(() => { const b = $('#igo'); if (b) b.innerHTML = `${I('loader-circle', 'spinning')}找选题中 ${((Date.now() - t0) / 1000) | 0} 秒`; }, 500);
      try { ideas = await api('POST', '/api/plaza/ideas', { direction: dir, type, days: 7, provider: S.aiDefault }); picked = null; }
      catch (e) { toast(e.message, true); }
      clearInterval(tk); busy = false; draw();
    });
    $('#idir') && ($('#idir').onkeydown = e => { if (e.key === 'Enter') $('#igo').click(); });
    $('#nbrief').oninput = e => { delete e.target.dataset.fromIdea; };
    const ok = async () => {
      const name = val('#nn').trim(); if (!name) { $('#nn').focus(); return toast('先写个题目', true); }
      const brief = val('#nbrief').trim();
      const idea = picked != null && ideas.items[picked].title === name ? ideas.items[picked] : (ideas?.items || []).find(x => x.title === name);
      const b = $('#nok'); b.disabled = true; b.innerHTML = `${I('loader-circle', 'spinning')}创建中`;
      try {
        const p = await api('POST', '/api/projects', { type, name, brief, phase: after === 'chat' ? 'outline' : '', from: type === 'card' ? val('#nf') : '', template: type === 'article' ? chosenTpl?.id : undefined, idea, script: type === 'script' ? { seconds: +val('#nsec') || 90 } : undefined });
        layer.innerHTML = ''; await loadAll(); toast('已新建：' + p.title);
        // 进写作页（卡片进精修页），把第一句话替作者发出去：先聊大纲，或者直接写
        const what = type === 'card' ? '这组卡片' : type === 'script' ? '这条视频的口播稿' : '这篇', need = brief ? '按我新建时写的要求' : '按题目';
        const secs = +val('#nsec') || 90;
        if (after === 'chat') S.autoSend = { pid: p.id, text: `我想做${what}《${name}》，先定大纲。${need}先去查资料，把查到的一手资料记进资料页；再根据资料定标题，把大纲写进大纲页（outline.md）。小标题要让人一眼看懂这节讲什么。拿不准的问我。` };
        if (after === 'draft') S.autoSend = { pid: p.id, text: type === 'card' ? `${need}，先做一版卡片。` : type === 'script' ? `${need}，照 article.md 里的骨架先写一版完整的口播稿，总时长控制在 ${fmtSec(secs)}左右，每段都要写口播原话和画面提示。` : `${need}，先写一版初稿。` };
        location.hash = '#/p/' + encodeURIComponent(p.id) + (after === 'chat' ? '/outline' : after !== 'self' ? (type === 'card' ? '/tune' : '/write') : idea && type !== 'card' ? '/research' : '');
      } catch (e) { toast(e.message, true); b.disabled = false; b.innerHTML = `${I('plus')}创建`; }
    };
    $('#nok').onclick = ok;
    $('#nn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (e.metaKey || e.ctrlKey) ok(); else $('#nbrief').focus(); } };
    $('#nbrief').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ok(); } };
    if (!keep.name) setTimeout(() => $('#nn')?.focus(), 30);
  };
  draw(); loadTpl();
  if (preIdea) setTimeout(() => { $('#nn').value = preIdea.title; $('#nbrief').value = ideaBrief(preIdea); $('#nbrief').dataset.fromIdea = '1'; }, 0);
  if (!preIdea) api('GET', '/api/plaza/ideas').then(d => { if (d?.items?.length && !ideas) { ideas = d; if (!$('#nn')?.value && !$('#nbrief')?.value) draw(); } }).catch(() => {});
  aiProviders().then(d => { S.aiDefault ||= d.default; });
}

/* ---------- ⌘K ---------- */
function openPalette() {
  layer.innerHTML = `<div class="mask"><div class="dlg pal"><input id="pq" placeholder="搜项目、搜正文，或输入命令（新建、看板、日历…）" autocomplete="off"><div class="res" id="pres"></div></div></div>`;
  const inp = $('#pq'), res = $('#pres'); let items = [], on = 0, timer;
  const acts = [
    [I('plus'), '新建小红书卡片', () => openNew('card')], [I('plus'), '新建文章', () => openNew('article')], [I('plus'), '新建视频脚本', () => openNew('script')],
    [I('layout-grid'), '画廊视图', () => setView('gallery')], [I('table-2'), '表格视图', () => setView('table')], [I('kanban'), '看板视图', () => setView('board')], [I('calendar'), '日历视图', () => setView('calendar')],
    [I('history'), '最近动态', () => location.hash = '#/activity'], [I('star'), '星标项目', () => location.hash = '#/starred'],
    [I('settings'), 'AI 设置（选模型、填密钥）', () => openAISettings()],
    [I('code'), '复制命令行帮助：xy help', () => copy('xy help', '已复制')]];
  const draw = (hits = []) => {
    const q = inp.value.trim().toLowerCase();
    const ps = S.projects.filter(p => !q || p.title.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q)) || p.id.toLowerCase().includes(q));
    const as = acts.filter(a => !q || a[1].toLowerCase().includes(q));
    items = [...ps.slice(0, 8).map(p => ({ k: 'p', p })), ...as.map(a => ({ k: 'a', a })), ...hits.filter(h => !ps.slice(0, 8).some(p => p.id === h.id)).map(h => ({ k: 's', h }))];
    on = Math.min(on, Math.max(0, items.length - 1));
    const mark = t => q ? esc(t).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`) : esc(t);
    let html = '', last = '';
    items.forEach((it, i) => {
      const g = { p: '项目', a: '命令', s: '正文里搜到' }[it.k]; if (g !== last) { html += `<div class="grp">${g}</div>`; last = g; }
      if (it.k === 'p') html += `<div class="it${i === on ? ' on' : ''}" data-i="${i}">${it.p.thumb ? `<img src="${fileUrl(it.p, it.p.thumb)}" alt="">` : '<span class="ic">' + ICON[it.p.type] + '</span>'}<span>${mark(it.p.title)}</span><small>${it.p.typeName} · ${it.p.status}</small></div>`;
      if (it.k === 'a') html += `<div class="it${i === on ? ' on' : ''}" data-i="${i}"><span class="ic">${it.a[0]}</span><span>${mark(it.a[1])}</span></div>`;
      if (it.k === 's') html += `<div class="it${i === on ? ' on' : ''}" data-i="${i}"><span class="ic">${ICON[it.h.type]}</span><span>${esc(it.h.title)}<span class="snip">[${esc(it.h.hits[0].where)}] …${mark(it.h.hits[0].snippet)}…</span></span><small>${it.h.hits.length} 处</small></div>`;
    });
    res.innerHTML = html || '<div class="grp">没有结果</div>';
    res.querySelector('.it.on')?.scrollIntoView({ block: 'nearest' });
  };
  const go = it => { if (!it) return; layer.innerHTML = ''; if (it.k === 'a') it.a[2](); else location.hash = '#/p/' + encodeURIComponent(it.k === 'p' ? it.p.id : it.h.id); };
  inp.oninput = () => { on = 0; draw(); clearTimeout(timer); const q = inp.value.trim(); if (q.length >= 2) timer = setTimeout(async () => draw(await api('GET', '/api/search?q=' + encodeURIComponent(q)).catch(() => [])), 220); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { on = Math.min(items.length - 1, on + 1); draw(lastHits()); e.preventDefault(); }
    if (e.key === 'ArrowUp') { on = Math.max(0, on - 1); draw(lastHits()); e.preventDefault(); }
    if (e.key === 'Enter') go(items[on]);
  };
  const lastHits = () => items.filter(x => x.k === 's').map(x => x.h);
  res.onclick = e => { const d = e.target.closest('[data-i]'); if (d) go(items[+d.dataset.i]); };
  draw(); inp.focus();
}
function setView(v) { S.view = v; lsSet('wb.view', v); if (route().a === 'p' || route().a === 'activity') location.hash = '#/all'; else render(); }

/* ---------- 全局 ---------- */
layer.addEventListener('click', e => { if (e.target.matches('[data-close]') || e.target.classList.contains('mask')) layer.innerHTML = ''; });
document.addEventListener('keydown', e => {
  if (route().a === 'p' && S.tab === 'tune' && !layer.innerHTML) S.tuneKeys?.(e);   // 精修页：⌘Z 撤销、Esc 取消、Delete 删除
  const typing = (e.composedPath?.()[0] || e.target).closest?.('input,textarea,select,[contenteditable="true"]');
  if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggleSide(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j' && $('#chatin') && !layer.innerHTML) { e.preventDefault(); const c = $('#chatin'); c.focus(); c.setSelectionRange(c.value.length, c.value.length); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); layer.innerHTML ? (layer.innerHTML = '') : openPalette(); return; }
  if (e.key === 'Escape' && layer.innerHTML) { layer.innerHTML = ''; return; }
  if ($('.lb') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { S.lb?.(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (!typing && route().a === 'p' && S.tab === 'read' && $('.cbrowse') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { S.cbNav?.(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (typing || layer.innerHTML) return;
  if (e.key === '/') { e.preventDefault(); openPalette(); }
  if (e.key === 'n') { e.preventDefault(); openNew(); }
  if (route().a !== 'p' && '1234'.includes(e.key)) setView(['gallery', 'table', 'board', 'calendar'][+e.key - 1]);
});

// 命令行或别的地方改了文件，网页自动跟上（正在输入时不打断）
setInterval(async () => {
  if (document.visibilityState !== 'visible') return;
  try {
    const { stamp, web } = await api('GET', '/api/stamp');
    // 工作台自己更新了：没在打字就直接刷新，正在打字就先提示
    if (S.web && web !== S.web) {
      if (document.activeElement?.closest('input,textarea,[contenteditable="true"],#richhost') || layer.innerHTML || timerBusy() || S.agentStop) { if (!S.webTold) { S.webTold = 1; toast('工作台有更新，停手后会自动刷新'); } }
      else { await S.flush?.(); location.reload(); return; }
    }
    if (stamp === S.stamp) return; S.stamp = stamp;
    if (document.activeElement?.closest('input,textarea,[contenteditable="true"]') || layer.innerHTML) return;
    await loadAll();
    if (route().a === 'videos') { renderSide(route()); return; }   // 视频页自己会定时刷新，不整页重画（不然输入的字和播放进度会丢）
    if (route().a === 'p' && ['write', 'tune'].includes(S.tab)) { renderSide(route()); return; }   // 正在写作 / 精修：只刷新侧栏，不重画页面
    render();
  } catch {}
}, 4000);

const timerBusy = () => !!S.flush && !!document.querySelector('#wsave')?.textContent.includes('正在输入');
(async () => { await Promise.all([loadAll(), loadIcons()]); const st = await api('GET', '/api/stamp'); S.stamp = st.stamp; S.web = st.web; render(); })();

/* ====================================================================
   AI 创作：文章边写边改（写作）、卡片点哪改哪（精修）、AI 设置
   ==================================================================== */
// 悬停提示：一个挂在 body 上的浮层，跟着鼠标下的 [data-tip] 元素定位，放不下就翻到上面
(() => {
  const tip = document.createElement('div'); tip.className = 'wbtip'; document.body.append(tip);
  let timer, cur = null;
  const hide = () => { clearTimeout(timer); tip.classList.remove('on'); cur = null; };
  const show = t => {
    if (!t.isConnected || !t.dataset.tip) return;
    tip.textContent = t.dataset.tip; tip.classList.add('on');
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    let top = r.bottom + 6; if (top + h > innerHeight - 6) top = r.top - h - 6;
    tip.style.left = Math.round(Math.min(Math.max(6, r.left + r.width / 2 - w / 2), innerWidth - w - 6)) + 'px';
    tip.style.top = Math.round(Math.max(6, top)) + 'px';
  };
  document.addEventListener('mouseover', e => {
    const t = e.target.closest?.('[data-tip]');
    if (t === cur) return;
    hide(); if (!t) return;
    cur = t; timer = setTimeout(() => cur === t && show(t), tip.classList.contains('on') ? 0 : 350);
  });
  document.addEventListener('mouseleave', hide);
  ['mousedown', 'keydown', 'wheel'].forEach(ev => document.addEventListener(ev, hide, true));
  addEventListener('blur', hide);
})();
const ACTS = { palette: () => openPalette(), new: () => openNew(), aiset: () => openAISettings(), side: () => toggleSide(), mem: () => memoryDlg(), skills: () => skillsDlg() };
// 左侧导航栏收起 / 展开，记在本机
function toggleSide(off = !document.body.classList.contains('side-off')) {
  document.body.classList.toggle('side-off', off); lsSet('wb.side', off ? '0' : '1');
  setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
}
if (lsGet('wb.side', '1') === '0') document.body.classList.add('side-off');
document.body.insertAdjacentHTML('beforeend', `<button class="icb sideopen" id="sideopen" data-tip="展开侧栏 ⌘\\">${I('panel-left-open')}</button>`);
document.getElementById('sideopen').onclick = () => toggleSide(false);
const enc = encodeURIComponent;
// 视频板块的页面在 video.js
const PULL = mountBreakdown({ $, $$, I, esc, api, toast, main, layer, ago, enc });
const VIDEO = mountVideo({ $, $$, I, esc, api, wbFetch, toast, main, layer, S, ago, enc, pull: PULL });
const ART_TASKS = [['polish', '润色'], ['deai', '去 AI 味'], ['shorten', '精简'], ['expand', '扩写'], ['story', '加故事感'], ['hook', '更抓人']];
const CARD_CHIPS = ['更口语', '更短', '更有冲击力', '换个说法', '改成三条要点', '数字更醒目'];

async function aiProviders() { try { return await api('GET', '/api/ai/providers'); } catch { return { default: 'hermes', providers: [] }; } }
// 模型选择：按钮 + 自绘弹出菜单（不用系统下拉框）
// 能直接动手改文件的助手：直连 Claude，或者本机 Claude Code（订阅额度）
const AGENT_TYPES = ['anthropic', 'claudecode'];
// 选中的值是「接口id」或「接口id::模型」
const provId = v => String(v || '').split('::')[0];
const provModel = (p, v) => { const m = String(v || '').split('::')[1]; return m == null ? null : (p?.models || []).find(x => x.id === m) || null; };
const provShort = (p, v) => { if (!p) return '选模型'; const m = provModel(p, v); const sub = m ? m.label : p.model ? p.model.replace(/^claude-/, '') : ''; return `${esc(p.name.replace(/（.*?）/g, ''))}${sub ? `<small>${esc(sub)}</small>` : ''}`; };
const provTitle = (p, v) => p ? p.name + ' · ' + (provModel(p, v)?.id || p.model || '默认模型') : '';
function provSelect(d, id = 'prov', cls = '') {
  S.aiDefault = d.default; S.provData = d;
  const ready = d.providers.filter(p => p.ready);
  // 记住的是「上次手动选的模型 | 当时的默认」；默认模型换过之后，以新的默认为准
  const [saved, savedDef] = lsGet('wb.prov', '').split('|');
  const sp = ready.find(p => p.id === provId(saved));
  const cur = savedDef === d.default && sp && (!saved.includes('::') || provModel(sp, saved)) ? saved : d.default;
  const p = ready.find(x => x.id === provId(cur)) || ready[0], v = p && provId(cur) === p.id ? cur : p?.id || '';
  return `<button type="button" class="mpick ${cls}" id="${id}" data-v="${esc(v)}" title="${esc(provTitle(p, v))}"><span class="mp-l">${provShort(p, v)}</span>${I('chevron-down')}</button>`;
}
function bindProv(btn) {
  btn.onclick = e => { e.stopPropagation(); provMenu(btn); };
  return () => btn.dataset.v || undefined;
}
async function provMenu(btn) {
  document.querySelector('.mmenu')?.remove();
  // 每次打开都拿最新的：刚登录、刚填好密钥的模型马上出现
  S.provData = await aiProviders();
  const d = S.provData, ready = d.providers.filter(p => p.ready), agentHint = btn.id === 'prov', cur = btn.dataset.v || d.default;
  const tag = p => agentHint ? (AGENT_TYPES.includes(p.type) ? '<em>能直接改文件</em>' : '<em class="mm-g">只提修改建议</em>') : '';
  const row = (v, title, sub, extra = '') => `<button type="button" class="mm-i${v === cur ? ' on' : ''}" data-v="${esc(v)}"><span class="mm-t"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</span>${extra}<span class="mm-c">${v === cur ? I('check') : ''}</span></button>`;
  const def = p => p.id === d.default ? '<i class="mm-d">默认</i>' : '';
  const m = document.createElement('div'); m.className = 'mmenu';
  m.innerHTML = `<div class="mm-h">选择模型</div><div class="mm-list">${ready.map(p => {
    // 有多个模型可挑的接口：先一行接口名，下面一个模型一行；当前设置里的模型就是不带 :: 的那一行
    if (!p.models?.length) return row(p.id, esc(p.name), esc(p.model || ''), tag(p) + def(p));
    return `<div class="mm-grp"><div class="mm-g1"><span>${esc(p.name)}</span>${tag(p)}${def(p)}</div>` + p.models.map(x => row(x.id === (p.model || '') ? p.id : `${p.id}::${x.id}`, esc(x.label), esc([x.note, x.id && x.id !== x.label ? x.id : ''].filter(Boolean).join(' · ')))).join('') + '</div>';
  }).join('')}</div>
    <div class="mm-sep"></div><button type="button" class="mm-i mm-set" data-set>${I('settings')}<span class="mm-t"><b>配置更多模型…</b></span></button>`;
  document.body.append(m);
  // 放在按钮上方（放不下就放下方），左边和按钮对齐；太高就在里面滚动
  const r = btn.getBoundingClientRect(), mw = m.offsetWidth;
  const up = r.top > innerHeight - r.bottom; m.querySelector('.mm-list').style.maxHeight = Math.max(160, (up ? r.top : innerHeight - r.bottom) - 90) + 'px';
  const mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - mw - 8)) + 'px';
  m.style.top = (up ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
  const items = [...m.querySelectorAll('.mm-i')]; let k = Math.max(0, items.findIndex(x => x.classList.contains('on')));
  const hi = (scroll) => { items.forEach((x, i) => x.classList.toggle('mm-on', i === k)); if (scroll) items[k]?.scrollIntoView({ block: 'nearest' }); }; hi(true);
  const close = () => { m.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', keys, true); };
  const pick = it => {
    close();
    if (it.dataset.set != null) return openAISettings();
    const v = it.dataset.v, p = ready.find(x => x.id === provId(v)); if (!p || v === btn.dataset.v) return;
    btn.dataset.v = v; btn.title = provTitle(p, v); btn.querySelector('.mp-l').innerHTML = provShort(p, v);
    lsSet('wb.prov', v + '|' + S.aiDefault);
    btn.dispatchEvent(new Event('change'));
  };
  const out = e => { if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
  const keys = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); k = (k + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; hi(true); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pick(items[k]); }
  };
  m.onclick = e => { const it = e.target.closest('.mm-i'); if (it) pick(it); };
  m.onmousemove = e => { const it = e.target.closest('.mm-i'); if (it) { k = items.indexOf(it); hi(); } };
  document.addEventListener('mousedown', out, true); document.addEventListener('keydown', keys, true);
}
// 读流式返回：边收边回调，出错标记 [[出错：…]] 转成异常
async function streamAI(url, body, onText, signal) {
  const r = await wbFetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || r.statusText); }
  const rd = r.body.getReader(), dec = new TextDecoder(); let all = '';
  for (;;) { const { done, value } = await rd.read(); if (done) break; const t = dec.decode(value, { stream: true }); all += t; onText(all); }
  const m = all.match(/\n*\[\[出错：([\s\S]*)\]\]$/); if (m) throw new Error(m[1]);
  return all.trim();
}

/* ---------- 写作 ---------- */
window.addEventListener('message', e => { if (e.data && typeof e.data.wbScroll === 'number' && e.source === $('#wif')?.contentWindow) S.pvScroll = e.data.wbScroll; });
/* 排版模式：按空行把 article.md 分成块，每块用文章自己的样式显示；
   段落、标题、导语、引言、图注能直接改字；图片、表格这类块原样显示，要改就点「改源码」。
   只有改过的块会重新写回 Markdown，没动过的块原样保留。 */
// 写作页「推特」模式的皮肤：同一个编辑器，按 X 长文的样子显示（不加载文章的 theme.css）
const X_EDIT_CSS = `
  .page.xskin{max-width:600px;padding:0 0 160px;color:#0f1419;font:17px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;word-break:break-word}
  .xskin .xcover{display:block;width:100%;aspect-ratio:5/2;object-fit:cover;margin:0 0 22px}
  .xskin .article{padding:0 16px}
  .xskin .article p{margin:0 0 18px}
  .xskin .article h1{font-size:31px;line-height:1.25;font-weight:800;margin:0;letter-spacing:-.3px}
  .xskin .blk:has(> h1)::after{content:"长文";display:block;font-size:14px;color:#536471;padding:10px 0 16px;margin-bottom:22px;border-bottom:1px solid #eff3f4}
  .xskin .article h2{font-size:24px;line-height:1.3;font-weight:800;margin:34px 0 14px}
  .xskin .article h3,.xskin .article h4{font-size:17px;font-weight:700;margin:24px 0 10px}
  .xskin .article a{color:#1d9bf0;text-decoration:none}
  .xskin .article ul,.xskin .article ol{margin:0 0 18px;padding-left:26px}.xskin .article li{margin:6px 0}
  .xskin .article blockquote,.xskin .callout{margin:0 0 18px;padding:2px 0 2px 16px;border-left:4px solid #cfd9de;background:none;border-radius:0}
  .xskin .article img{display:block;width:100%;height:auto;border-radius:16px;border:1px solid #eff3f4;margin:6px 0 10px}
  .xskin .cap{font-size:15px;line-height:1.6;color:#536471;font-style:italic;text-align:left;margin:-2px 0 18px}
  .xskin .cap b{font-weight:400;margin-right:.5em}
  .xskin .deck{font-style:italic;margin:0 0 18px}
  .xskin .lede .dc{float:none;font:inherit;color:inherit;background:none;padding:0;margin:0}
  .xskin .toc{margin:0 0 18px}.xskin .toc-t{font-weight:700;margin:0 0 6px}.xskin .toc-i{display:list-item;list-style:disc;margin:6px 0 6px 26px}.xskin .toc-i b{font-weight:400;margin-right:.4em}
  .xskin .src-t{font-size:24px;font-weight:800;margin:34px 0 14px}.xskin .src-h{font-weight:700;margin:16px 0 6px}
  .xskin .src-i{display:list-item;list-style:disc;margin:6px 0 6px 26px}.xskin .src-n{margin-right:.4em}.xskin .src-u{display:none}.xskin .src-d::before{content:"："}
  .xskin .src-note{margin:0 0 10px}
  .xskin .mast,.xskin hr{display:none}
  .xskin table{width:100%;border-collapse:collapse;font-size:15px;margin:0 0 18px}.xskin th,.xskin td{border-bottom:1px solid #eff3f4;padding:8px;text-align:left;vertical-align:top}`;
async function richEditor(host, p, text, onChange, onSel, opt = {}) {
  const skinX = opt.skin === 'x';
  const root = host.attachShadow({ mode: 'open' });
  let blocks = [], seps = [], kinds = [], css = '';
  let selInfo = null, lastBlock = -1, sugg = [], sh = {}, marks = [], onMark = null;

  const KIND = src => {
    const s = src.trim();
    if (!s) return 'empty';
    if (/^#{1,6}\s+[^\n]+$/.test(s)) return 'h';
    if (/^>\s?/.test(s) && s.split('\n').every(l => /^>/.test(l))) return 'q';
    const m = s.match(/^<(p|div|h[1-6])(\s+class="[^"]*")?\s*>([\s\S]*)<\/\1>$/);
    if (m && !/<(p|div|section|table|ul|ol)[\s>]/i.test(m[3])) return 'hp';
    // 一层的列表（大纲的要点）：可以直接点进去改，回车加一条
    if (s.split('\n').every(l => /^([-*+]|\d+\.)\s+\S/.test(l))) return 'l';
    if (/^(<|!\[|\||[-*+]\s|\d+\.\s|```|<!--)/.test(s)) return 'raw';
    return 'p';
  };
  const editableOf = (box, k) => k === 'q' ? box.querySelector('blockquote p, blockquote') : k === 'l' ? box.querySelector('ul, ol') : box.firstElementChild;

  // 把改过的块转回 Markdown / HTML
  function toMd(node) {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += n.textContent; continue; }
      if (n.nodeType !== 1) continue;
      const t = n.tagName.toLowerCase(), inner = toMd(n);
      if (t === 'b' || t === 'strong') out += inner.trim() ? `**${inner}**` : inner;
      else if (t === 'em' || t === 'i') out += inner.trim() ? `*${inner}*` : inner;
      else if (t === 'code') out += '`' + n.textContent + '`';
      else if (t === 'a') out += `[${inner}](${n.getAttribute('href') || ''})`;
      else if (t === 'br') out += '\n';
      else if (t === 'div' || t === 'p') out += (out && !out.endsWith('\n') ? '\n' : '') + inner;
      else out += inner;
    }
    return out.replace(/ /g, ' ');
  }
  const cleanHtml = el => el.innerHTML.replace(/\s?contenteditable="[^"]*"/g, '').replace(/&nbsp;/g, ' ').replace(/<div>([\s\S]*?)<\/div>/g, '<br>$1').trim();
  // 改过的块转回源文本时，保留它原来首尾的空白（比如文件末尾的换行）
  function serialize(i) { const lead = blocks[i].match(/^\s*/)[0], tail = blocks[i].match(/\s*$/)[0]; const out = serialize0(i); return out === blocks[i] ? out : lead + out.trim() + tail; }
  function serialize0(i) {
    const box = root.querySelector(`.blk[data-i="${i}"]`), k = kinds[i], el = box && editableOf(box, k);
    if (!el) return blocks[i];
    if (k === 'h') return blocks[i].trim().match(/^#+/)[0] + ' ' + el.textContent.replace(/\s+/g, ' ').trim();
    if (k === 'p') return toMd(el).replace(/\n{2,}/g, '\n').trim();
    if (k === 'q') return '> ' + cleanHtml(el).replace(/\n/g, ' ');
    if (k === 'l') { const ord = el.tagName === 'OL'; return [...el.querySelectorAll(':scope > li')].map(li => toMd(li).replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).map((t, j) => (ord ? `${j + 1}. ` : '- ') + t).join('\n') || blocks[i]; }
    if (k === 'hp') { const m = blocks[i].trim().match(/^<(\w+)([^>]*)>/); return `<${m[1]}${m[2]}>${cleanHtml(el)}</${m[1]}>`; }
    return blocks[i];
  }
  const join = () => blocks.map((b, i) => b + (seps[i] ?? '')).join('');
  const blockPlain = i => (blocks[i] || '').replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  // 重新渲染要请求一次服务端；这期间打的字先存着，渲染完再补上，免得回车后紧接着打字被吞
  let building = 0, queued = '';
  // 图片的原始尺寸：重新渲染时先把位置占好，不然图片加载出来之前高度是 0，滚动位置会对不上，页面看着像跳到了上面
  const imgDims = new Map(), imgKey = src => String(src || '').split('?')[0];
  async function build(t, focus) {
    building++;
    try { await build0(t, focus); } finally { building--; }
    if (!building && queued) { const q = queued; queued = ''; if (curRange()) document.execCommand('insertText', false, q); }
  }
  async function build0(t, focus) {
    selInfo = null; onSel(0);
    const parts = t.split(/(\n{2,})/);
    blocks = []; seps = [];
    for (let i = 0; i < parts.length; i += 2) { blocks.push(parts[i]); seps.push(parts[i + 1] ?? ''); }
    kinds = blocks.map(KIND);
    const r = await api('POST', `/api/projects/${enc(p.id)}/render`, { blocks: blocks.map((b, i) => kinds[i] === 'empty' ? '' : b) });
    css = r.css;
    const scroll = host.scrollTop;
    root.querySelectorAll('img').forEach(im => { if (im.complete && im.naturalWidth) imgDims.set(imgKey(im.getAttribute('src')), [im.naturalWidth, im.naturalHeight]); });
    const html = `${skinX ? '' : `<link rel="stylesheet" href="${css}">`}<style>
      :host{display:block}
      .page{max-width:460px;margin:0 auto;background:#fff;color:#1f1f1d;color-scheme:light;min-height:100%;box-shadow:none!important;border-radius:0!important;padding:30px 24px 160px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-radius:10px}
      .blk{position:relative;border-radius:4px}
      .article{outline:none;cursor:text}
      .k-raw,.sg{cursor:default}
      .k-raw{outline:1px dashed transparent;outline-offset:4px}
      .blk.sg-on{background:rgba(212,137,42,.07);box-shadow:-10px 0 0 rgba(212,137,42,.07),10px 0 0 rgba(212,137,42,.07)}
      .blk.flash{animation:fl 1.6s}
      .page{position:relative}
      .blk.dm-on{background:rgba(111,124,224,.07);box-shadow:-10px 0 0 rgba(111,124,224,.07),10px 0 0 rgba(111,124,224,.07)}
      .blk.dm-on::before{content:attr(data-dmn);position:absolute;left:-30px;top:2px;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:#6f7ce0;color:#fff;font:600 11px/18px -apple-system,"PingFang SC",sans-serif;text-align:center;cursor:pointer;white-space:nowrap}
      @keyframes fl{0%,40%{background:rgba(111,124,224,.18)}100%{background:transparent}}
      .sg{margin:6px -8px 22px;border:1px solid #e3b26b;border-radius:8px;background:#fffaf2;padding:10px 12px;font:13.5px/1.75 -apple-system,"PingFang SC",sans-serif;color:#222}
      .sg-h{display:flex;gap:8px;align-items:baseline;font-size:12px;color:#9a6a1c;margin-bottom:4px}
      .sg-h b{font-weight:700}
      .dif del{color:#b3261e;background:#fde8e6;text-decoration:line-through}
      .dif ins{color:#1f7a45;background:#e3f4e9;text-decoration:none}
      .sg-b{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}
      .sg-b button{font:12.5px -apple-system,"PingFang SC";border:1px solid #dcdbd7;background:#fff;border-radius:5px;padding:3px 12px;cursor:pointer}
      .sg-b button.ok{background:#3e9b62;border-color:#3e9b62;color:#fff}
      .sg svg,.edsrc svg{width:14px;height:14px;vertical-align:-2px;margin-right:3px}
      .sg-b button{display:inline-flex;align-items:center;gap:2px}
      .k-raw:hover{outline-color:#d6d6d2}
      .edsrc{position:absolute;top:-12px;right:-8px;z-index:2;display:none;font:12px -apple-system,"PingFang SC";background:#141414;color:#fff;border:0;border-radius:5px;padding:3px 8px;cursor:pointer}
      .k-raw:hover .edsrc{display:block}
      .edsrc.del{right:78px;background:#fff;color:#b3261e;border:1px solid #f0c9c5}
      textarea.src{width:100%;min-height:90px;box-sizing:border-box;font:12.5px/1.6 "SF Mono",Menlo,monospace;border:1.5px solid #6f7ce0;border-radius:6px;padding:10px;outline:none;resize:vertical;margin:6px 0}
      .srcbar{display:flex;gap:6px;justify-content:flex-end;margin-bottom:12px}
      .srcbar button{font:12.5px -apple-system,"PingFang SC";border:1px solid #dcdbd7;background:#fff;border-radius:5px;padding:3px 10px;cursor:pointer}
      .srcbar button.ok{background:#6f7ce0;border-color:#6f7ce0;color:#fff}
      img{max-width:100%;height:auto}
      ::selection{background:#d9ddfa}
    ${skinX ? X_EDIT_CSS : ''}</style><div class="page${skinX ? ' xskin' : ''}">${skinX ? '<img class="xcover" alt="">' : ''}<section class="article" contenteditable="true" spellcheck="false">${blocks.map((b, i) => kinds[i] === 'empty' ? '' :
      `<div class="blk k-${kinds[i]}" data-i="${i}"${kinds[i] === 'raw' ? ' contenteditable="false"' : ''}>${r.htmls[i]}${kinds[i] === 'raw' ? `<button class="edsrc del" data-delblk>${I('trash-2')}删除</button><button class="edsrc" data-src>${I('code')}改源码</button>` : ''}</div>`).join('')}</section></div>`;
    // 样式表没变就只换正文：整个重来的话样式表要重新加载，那一瞬间没有样式，滚动位置也会乱
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const oldPage = root.querySelector('.page');
    if (oldPage && (skinX || root.querySelector('link[rel=stylesheet]')?.getAttribute('href') === css)) oldPage.replaceWith(tpl.content.querySelector('.page'));
    else root.replaceChildren(tpl.content);
    // 推特皮肤：顶上放 5:2 封面（img/cover-x.png，没有就用构建出来的，再没有就不放）
    const cv = root.querySelector('.xcover');
    if (cv) { const tries = ['img/cover-x.png', 'out/cover-x.png']; let k = 0; cv.onerror = () => { if (++k < tries.length) cv.src = fileUrl(p, tries[k]); else cv.remove(); }; cv.src = fileUrl(p, tries[0]); }
    root.querySelectorAll('img').forEach(im => {
      const k = imgKey(im.getAttribute('src')), d = imgDims.get(k);
      // 先按上次的尺寸占位，加载好以后去掉，按图片自己的尺寸显示（图片换过也不会走样）
      const tmp = d && !im.complete && !im.hasAttribute('width');
      if (tmp) { im.setAttribute('width', d[0]); im.setAttribute('height', d[1]); }
      if (!im.complete) im.addEventListener('load', () => { if (im.naturalWidth) imgDims.set(k, [im.naturalWidth, im.naturalHeight]); if (tmp) { im.removeAttribute('width'); im.removeAttribute('height'); } }, { once: true });
    });
    root.querySelectorAll('.blk').forEach(box => {
      const i = +box.dataset.i, k = kinds[i]; if (k === 'raw') return;
      if (!editableOf(box, k)) { kinds[i] = 'raw'; box.setAttribute('contenteditable', 'false'); box.classList.replace('k-' + k, 'k-raw'); }
    });
    host.scrollTop = scroll;
    renderSugg(); renderMarks();
    if (focus) placeCaret(focus.i, focus.at);
  }
  const artEl = () => root.querySelector('.article');
  const focusArt = () => artEl()?.focus({ preventScroll: true });
  // 当前选区。shadowRoot.getSelection() 会把跨段选区截在第一段里，所以优先用 getComposedRanges
  function curRange() {
    const ds = document.getSelection();
    if (ds?.getComposedRanges) {
      const c = ds.getComposedRanges({ shadowRoots: [root] })[0]; if (!c) return null;
      const r = document.createRange();
      try { r.setStart(c.startContainer, c.startOffset); r.setEnd(c.endContainer, c.endOffset); } catch { return null; }
      return root.contains(r.commonAncestorContainer) || r.commonAncestorContainer === root ? r : null;
    }
    const s = root.getSelection ? root.getSelection() : ds;
    return s?.rangeCount && root.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0) : null;
  }
  const boxOf = n => (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('.blk');
  const spanBoxes = r => [...root.querySelectorAll('.blk')].filter(b => r.intersectsNode(b) && partIn(r, b));
  // 光标所在的可编辑段落（在图片块里、段落之间的空白处都算不在）
  function caretBlock(r) {
    const box = boxOf(r.startContainer); if (!box) return null;
    const i = +box.dataset.i, k = kinds[i]; if (k === 'raw') return null;
    const ed = editableOf(box, k); if (!ed || !(ed === r.startContainer || ed.contains(r.startContainer)) || !(ed === r.endContainer || ed.contains(r.endContainer))) return null;
    return { box, i, k, ed };
  }
  function placeCaret(i, at = 0) {
    const box = root.querySelector(`.blk[data-i="${i}"]`); const ed = box && editableOf(box, kinds[i]); if (!ed) return;
    focusArt();
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n, left = at === 'end' ? Infinity : at, last = null;
    while ((n = w.nextNode())) { last = n; if (left <= n.length) break; left -= n.length; }
    const r = document.createRange();
    if (n) r.setStart(n, Math.min(left, n.length)); else if (last) r.setStart(last, last.length); else r.setStart(ed, 0);
    r.collapse(true); const s = root.getSelection ? root.getSelection() : document.getSelection(); s.removeAllRanges(); s.addRange(r);
    box.scrollIntoView({ block: 'nearest' });
  }

  const dirty = new Set();
  const flushDirty = () => { for (const i of dirty) blocks[i] = serialize(i); dirty.clear(); };
  root.addEventListener('input', e => {
    if (e.target.tagName === 'TEXTAREA') return;
    const r = curRange(); if (!r) return;
    const boxes = spanBoxes(r); if (!boxes.length) { const b = boxOf(r.startContainer); b && boxes.push(b); }
    boxes.forEach(b => dirty.add(+b.dataset.i)); if (boxes.length) onChange();
  });

  // 选区：只认落在可编辑块里的选区
  const readSel = () => {
    const r = curRange(); if (!r) return;
    const span = spanBoxes(r), box = boxOf(r.startContainer) || span[0];
    if (!box || !root.contains(box)) return;
    const endBox = boxOf(r.endContainer) || span[span.length - 1];
    selInfo = { i: +box.dataset.i, iEnd: endBox ? +endBox.dataset.i : +box.dataset.i, range: r.cloneRange(), text: r.toString() };
    lastBlock = selInfo.iEnd;
    onSel(selInfo.text.trim() ? selInfo.text.length : 0);
  };
  // 拖选过程中不处理选区（每动一下都弹工具条会挡住鼠标、拖不顺），松手后再处理；键盘选区停一下再处理
  let dragging = false, selT;
  root.addEventListener('pointerdown', e => { if (e.button === 0 && e.target.closest?.('.article')) { dragging = true; clearTimeout(selT); onSel(0); } });
  const endDrag = () => { if (!dragging) return; dragging = false; clearTimeout(selT); selT = setTimeout(() => host.isConnected && readSel(), 0); };
  if (S.richSel) document.removeEventListener('selectionchange', S.richSel);
  if (S.richUp) { document.removeEventListener('pointerup', S.richUp, true); window.removeEventListener('blur', S.richUp); }
  S.richSel = () => { if (!host.isConnected || dragging) return; clearTimeout(selT); selT = setTimeout(readSel, 150); };
  S.richUp = endDrag;
  document.addEventListener('selectionchange', S.richSel);
  document.addEventListener('pointerup', S.richUp, true);
  window.addEventListener('blur', S.richUp);

  // 整段删除、合并、拆分这类结构改动单独记一份，⌘Z 能撤回（浏览器自带的撤销管不到重新渲染）
  const hist = []; let lastStruct = false;
  const pushHist = () => { flushDirty(); hist.push(join()); if (hist.length > 40) hist.shift(); lastStruct = true; };
  async function undoStruct() { if (!hist.length) return false; dirty.clear(); await build(hist.pop(), null); onChange(); lastStruct = hist.length > 0; toast('已撤销'); return true; }
  root.addEventListener('input', () => { lastStruct = false; });
  // 删掉若干块（下标从大到小删，保住分隔符）
  function removeBlocks(idxs) {
    for (const k of [...new Set(idxs)].sort((a, b) => b - a)) {
      blocks.splice(k, 1); kinds.splice(k, 1);
      if (k < seps.length - 1 || seps.length === 1) seps.splice(k, 1); else { const tail = seps[k]; seps.splice(k - 1, 2, tail); }
    }
  }
  const editableIdx = (from, step) => { for (let j = from; j >= 0 && j < blocks.length; j += step) if (!['empty', 'raw'].includes(kinds[j])) return j; return -1; };
  const isBlank = ed => !ed.textContent.replace(/[\s\u200b]/g, '') && !ed.querySelector('img');
  // 跨好几块选中后按删除：首尾两块各留没选中的部分，中间整块删掉，两头都是普通段落就并成一段
  // 选区在某个节点里真正盖住的那一截；只碰到边界的不算
  function partIn(r, node) {
    const x = document.createRange(); x.selectNodeContents(node);
    if (r.compareBoundaryPoints(Range.START_TO_START, x) > 0) x.setStart(r.startContainer, r.startOffset);
    if (r.compareBoundaryPoints(Range.END_TO_END, x) < 0) x.setEnd(r.endContainer, r.endOffset);
    return x.collapsed ? null : x;
  }
  // 删除跨好几块的选区：整块被盖住的删掉，首尾两块删掉选中的那一截；首尾都是普通段落就并成一段
  async function deleteAcross(r) {
    const parts = [];
    for (const b of root.querySelectorAll('.blk')) {
      if (!r.intersectsNode(b)) continue;
      const i = +b.dataset.i, ed = kinds[i] !== 'raw' && editableOf(b, kinds[i]);
      const x = partIn(r, ed || b); if (x) parts.push({ i, ed, x });
    }
    if (!parts.length) return false;
    pushHist();
    const drop = [], kept = new Set();
    for (const { i, ed, x } of parts) {
      if (!ed) { drop.push(i); continue; }
      const all = document.createRange(); all.selectNodeContents(ed);
      if (x.compareBoundaryPoints(Range.START_TO_START, all) <= 0 && x.compareBoundaryPoints(Range.END_TO_END, all) >= 0) { drop.push(i); continue; }
      x.deleteContents(); blocks[i] = serialize(i);
      if (isBlank(ed)) drop.push(i); else kept.add(i);
    }
    const i0 = parts[0].i, i1 = parts[parts.length - 1].i;
    let focus = null;
    if (kept.has(i0)) {
      const at = editableOf(root.querySelector(`.blk[data-i="${i0}"]`), kinds[i0]).textContent.length;
      if (i1 !== i0 && kept.has(i1) && kinds[i0] === 'p' && kinds[i1] === 'p') { blocks[i0] = blocks[i0].trimEnd() + blocks[i1].trim(); drop.push(i1); }
      focus = { i: i0, at };
    } else if (kept.has(i1)) focus = { i: i1 - drop.filter(d => d < i1).length, at: 0 };
    removeBlocks(drop);
    if (!focus) { const j = editableIdx(Math.min(i0, blocks.length - 1), -1); if (j >= 0) focus = { i: j, at: 'end' }; }
    onChange(); await build(join(), focus);
    return true;
  }
  // ⌘Z：上一步是整段删除、合并、拆分时，撤回这一步
  if (S.richKey) document.removeEventListener('keydown', S.richKey, true);
  S.richKey = async e => {
    if (!host.isConnected || layer.innerHTML) return;
    const t = e.composedPath?.()[0];
    if (t?.closest?.('input,textarea,select') || (t && t !== host && !root.contains(t) && t.closest?.('[contenteditable="true"]'))) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && lastStruct && hist.length) { e.preventDefault(); e.stopPropagation(); await undoStruct(); }
  };
  document.addEventListener('keydown', S.richKey, true);
  // 图片、表格这类块的「删除」
  root.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-delblk]'); if (!b) return;
    const i = +b.closest('.blk').dataset.i; pushHist();
    removeBlocks([i]); onChange(); await build(join());
    toast('已删除，按 ⌘Z 撤销');
  });

  // 在光标处把一段拆开，中间插入几段新内容（回车、粘贴多段文字都用它）
  async function splitAt(c, r, paras = []) {
    pushHist();
    r.deleteContents();
    const tail = document.createRange(); tail.setStart(r.endContainer, r.endOffset); tail.setEnd(c.ed, c.ed.childNodes.length);
    const tmp = document.createElement('p'); tmp.append(tail.extractContents());
    blocks[c.i] = serialize(c.i);
    // 原来块末尾的空白（比如文件结尾的换行）留给拆出来的最后一块
    const ws = blocks[c.i].match(/\s*$/)[0]; blocks[c.i] = blocks[c.i].trimEnd();
    const rest = toMd(tmp).trim(), add = [...paras, rest].filter((x, j, a) => x || j === a.length - 1);
    add[add.length - 1] += ws;
    blocks.splice(c.i + 1, 0, ...add); seps.splice(c.i, 0, ...add.map(() => '\n\n'));
    onChange(); await build(join(), { i: c.i + add.length, at: 0 });
  }
  async function pasteText(text) {
    text = String(text || '').replace(/\r\n?/g, '\n').trim(); if (!text) return;
    let r = curRange(); if (!r) return;
    if (spanBoxes(r).length > 1) { await deleteAcross(r); r = curRange(); if (!r) return; }
    let c = caretBlock(r); if (!c) return;
    const paras = text.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
    document.execCommand('insertText', false, paras[0].replace(/\n+/g, ' '));
    if (paras.length < 2) return;
    r = curRange(); c = r && caretBlock(r); if (!c) return;
    flushDirty(); await splitAt(c, r, paras.slice(1));
  }
  root.addEventListener('paste', e => { if (e.target.tagName === 'TEXTAREA') return; e.preventDefault(); pasteText(e.clipboardData?.getData('text/plain')); });
  root.addEventListener('cut', e => {
    if (e.target.tagName === 'TEXTAREA') return;
    const r = curRange(); if (!r || spanBoxes(r).length < 2) return;
    e.preventDefault(); e.clipboardData.setData('text/plain', r.toString()); deleteAcross(r);
  });
  root.addEventListener('drop', e => { if (e.target.tagName !== 'TEXTAREA') e.preventDefault(); });
  // 兜底：跨段的输入、落在段落外面的输入都不交给浏览器，免得把段落结构弄乱
  root.addEventListener('beforeinput', async e => {
    if (building && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); if (e.inputType === 'insertText' && e.data) queued += e.data; return; }
    if (e.target.tagName === 'TEXTAREA' || e.inputType.startsWith('insertComposition') || e.inputType === 'historyUndo' || e.inputType === 'historyRedo') return;
    const r = curRange(); if (!r) return;
    const multi = spanBoxes(r).length > 1 || (!r.collapsed && !caretBlock(r));
    if (!multi && caretBlock(r)) return;
    e.preventDefault();
    if (!multi) return;
    if (e.inputType.startsWith('delete')) { await deleteAcross(r); return; }
    if (e.inputType === 'insertText' && e.data) { await deleteAcross(r); document.execCommand('insertText', false, e.data); }
  });
  // 中文输入法在跨段选区上开始打字：先把选中的删掉，让输入落进第一段
  root.addEventListener('compositionstart', () => {
    const r = curRange(); if (!r || spanBoxes(r).length < 2) return;
    pushHist();
    const idx = spanBoxes(r).map(b => +b.dataset.i);
    r.deleteContents();
    // 整块被删掉的清空源文本，首尾两块留下的部分照常保存
    for (const k of idx) { if (root.querySelector(`.blk[data-i="${k}"]`)) dirty.add(k); else { blocks[k] = ''; seps[k] = ''; } }
    onChange();
  });

  // 回车：把当前段落从光标处一分为二；段首按删除：和上一段合并；空段按删除：整段删掉
  root.addEventListener('keydown', async e => {
    if (e.target.tagName === 'TEXTAREA' || e.isComposing) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); flushDirty(); S.flush?.(); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); document.execCommand(e.key === 'b' ? 'bold' : 'italic'); return; }
    const isDel = e.key === 'Backspace' || e.key === 'Delete';
    if (!isDel && e.key !== 'Enter') return;
    if (building) { e.preventDefault(); return; }
    const r = curRange(); if (!r) return;
    if (spanBoxes(r).length > 1 || (!r.collapsed && !caretBlock(r))) { e.preventDefault(); await deleteAcross(r); return; }
    const c = caretBlock(r);
    if (!c) { e.preventDefault(); return; }   // 光标在图片块里或段落之间
    const { i, k, ed } = c;
    if (e.key === 'Enter' && k === 'l' && !e.shiftKey) return;   // 列表里回车：交给浏览器，新起一条
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) { document.execCommand('insertLineBreak'); return; }
      flushDirty(); await splitAt(c, r); return;
    }
    if (!r.collapsed) return;   // 段内选中一截再删：交给浏览器
    const back = e.key === 'Backspace';
    if (isBlank(ed)) {
      e.preventDefault(); pushHist();
      removeBlocks([i]);
      let j = back ? editableIdx(i - 1, -1) : editableIdx(i, 1);
      if (j < 0) j = back ? editableIdx(i, 1) : editableIdx(i - 1, -1);
      onChange(); await build(join(), j >= 0 ? { i: j, at: back ? 'end' : 0 } : null);
      return;
    }
    const edge = document.createRange();
    if (back) { edge.setStart(ed, 0); edge.setEnd(r.startContainer, r.startOffset); } else { edge.setStart(r.endContainer, r.endOffset); edge.setEnd(ed, ed.childNodes.length); }
    if (edge.toString().replace(/\u200b/g, '').length) return;   // 不在段首/段尾：交给浏览器
    e.preventDefault();   // 在段首/段尾：不让浏览器把两个块的结构揉在一起
    let a = back ? i - 1 : i + 1; while (a >= 0 && a < blocks.length && kinds[a] === 'empty') a += back ? -1 : 1;
    if (k !== 'p' || a < 0 || a >= blocks.length || kinds[a] !== 'p') return;
    pushHist();
    const [j, n] = back ? [a, i] : [i, a];
    const at = editableOf(root.querySelector(`.blk[data-i="${j}"]`), 'p').textContent.length;
    blocks[j] = blocks[j].trimEnd() + blocks[n].trim(); removeBlocks([n]);
    onChange(); await build(join(), { i: j, at });
  });

  root.addEventListener('focusin', e => { const box = e.target.closest?.('.blk'); if (box) lastBlock = +box.dataset.i; });
  root.addEventListener('click', e => {
    const a = e.target.closest?.('[data-acc]'), r = e.target.closest?.('[data-rej]');
    if (a) sh.accept?.(a.dataset.acc); if (r) sh.reject?.(r.dataset.rej);
  });
  // 修订建议：找到它在原文里的位置，在那几块后面插一张卡片
  function renderSugg() {
    root.querySelectorAll('.sg').forEach(x => x.remove());
    root.querySelectorAll('.sg-on').forEach(x => x.classList.remove('sg-on'));
    if (!sugg.length) return;
    let pos = 0; const offs = blocks.map((b, i) => { const o = pos; pos += b.length + (seps[i] || '').length; return o; });
    const full = join();
    for (const sg of sugg) {
      const at = full.indexOf(sg.old); if (at < 0) continue;
      let i0 = 0, i1 = 0;
      offs.forEach((o, i) => { if (o <= at) i0 = i; if (o < at + sg.old.length) i1 = i; });
      for (let i = i0; i <= i1; i++) root.querySelector(`.blk[data-i="${i}"]`)?.classList.add('sg-on');
      let anchor = null; for (let i = i1; i >= i0 && !anchor; i--) anchor = root.querySelector(`.blk[data-i="${i}"]`);
      if (!anchor) continue;
      while (anchor.nextElementSibling?.classList.contains('sg')) anchor = anchor.nextElementSibling;
      anchor.insertAdjacentHTML('afterend', `<div class="sg" contenteditable="false" data-sg="${sg.id}"><div class="sg-h">${I('pencil-line')}<b>修改建议</b><span>${esc(sg.why || SG_SRC[sg.source] || '')}</span></div><div class="dif">${diffHtml(sg.old, sg.new)}</div><div class="sg-b"><button data-rej="${sg.id}">${I('x')}不要</button><button class="ok" data-acc="${sg.id}">${I('check')}接受</button></div></div>`);
    }
  }
  // 等作者定的事：在对应的段落左边标上编号，点编号跳到右边那张卡片
  function renderMarks() {
    root.querySelectorAll('.dm-on').forEach(x => { x.classList.remove('dm-on'); delete x.dataset.dmn; delete x.dataset.dmid; });
    for (const m of marks) for (const q of m.quotes) {
      const box = boxFor(q); if (!box) continue;
      const ids = box.dataset.dmid ? box.dataset.dmid.split(',') : [];
      if (ids.includes(m.id)) continue;
      ids.push(m.id); box.dataset.dmid = ids.join(','); box.dataset.dmn = (box.dataset.dmn ? box.dataset.dmn + ' · ' : '') + m.n;
      box.classList.add('dm-on');
    }
  }
  root.addEventListener('click', e => {
    const b = e.target.closest?.('.blk.dm-on');
    if (b && e.clientX < b.getBoundingClientRect().left) { e.preventDefault(); onMark?.(b.dataset.dmid.split(',')[0]); }
  });
  const norm = t => plainMd(t).replace(/\s+/g, '');
  function boxFor(text) {
    const q = String(text || ''); if (!q) return null;
    let i = blocks.findIndex(b => b.includes(q));
    if (i < 0) { const qn = norm(q).slice(0, 80); i = blocks.findIndex(b => qn && norm(b).includes(qn)); }
    return i < 0 ? null : root.querySelector(`.blk[data-i="${i}"]`);
  }
  function flash(box) { if (!box) return; box.scrollIntoView({ block: 'center', behavior: 'smooth' }); box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); }

  // 图片、表格这类块：点「改源码」就地改
  root.addEventListener('click', e => {
    const b = e.target.closest?.('[data-src]'); if (!b) return;
    const box = b.closest('.blk'), i = +box.dataset.i;
    box.innerHTML = `<textarea class="src">${esc(blocks[i])}</textarea><div class="srcbar"><button data-x>取消</button><button class="ok" data-ok>完成</button></div>`;
    const ta = box.querySelector('textarea'); ta.style.height = Math.min(420, ta.scrollHeight + 6) + 'px'; ta.focus();
    box.querySelector('[data-x]').onclick = () => build(join());
    box.querySelector('[data-ok]').onclick = async () => { flushDirty(); blocks[i] = ta.value.replace(/\n{2,}/g, '\n'); onChange(); await build(join()); };
  });

  await build(text);
  return {
    reset: t => build(t),
    lock: on => { const a = artEl(); if (a) a.setAttribute('contenteditable', on ? 'false' : 'true'); },
    selRect: () => (selInfo?.text?.trim() ? selInfo.range.getBoundingClientRect() : null),
    setSuggestions(l, h) { sugg = l || []; sh = h || {}; renderSugg(); },
    setMarks(l, cb) { marks = l || []; onMark = cb; renderMarks(); },
    canFind: q => !!boxFor(q),
    outline: () => blocks.map((b, i) => kinds[i] === 'h' ? { i, level: b.trim().match(/^#+/)[0].length, text: b.trim().replace(/^#+\s*/, '') } : null).filter(Boolean),
    scrollToBlock: i => flash(root.querySelector(`.blk[data-i="${i}"]`)),
    scrollTo: t => flash(boxFor(t) || root.querySelector(`.sg[data-sg]`)),
    focusText: () => (selInfo?.text || '').trim(),
    blockText: () => lastBlock >= 0 ? plainMd(blocks[lastBlock] || '') : '',
    text: () => { flushDirty(); return join(); },
    selection: () => {
      flushDirty();
      const si = selInfo || { i: blocks.length - 1, iEnd: blocks.length - 1, text: '' };
      return { text: si.text, ref: si,
        before: blocks.slice(0, si.i).map((_, k) => blockPlain(k)).join('\n\n'), after: blocks.slice(si.iEnd + 1).map((_, k) => blockPlain(si.iEnd + 1 + k)).join('\n\n'),
        cursorBefore: blocks.slice(0, si.iEnd + 1).join('\n\n'), cursorAfter: blocks.slice(si.iEnd + 1).join('\n\n') };
    },
    async replace(ref, out) {
      const whole = ref.i === ref.iEnd && ref.text.trim() === blockPlain(ref.i).trim();
      if (/\n\s*\n/.test(out.trim()) || whole || ref.i !== ref.iEnd) {
        // 整段或跨段替换：直接换掉这些块的源文本
        flushDirty();
        if (ref.i === ref.iEnd && !whole) {
          const box = root.querySelector(`.blk[data-i="${ref.i}"]`), ed = editableOf(box, kinds[ref.i]);
          focusArt(); const s = root.getSelection ? root.getSelection() : document.getSelection(); s.removeAllRanges(); s.addRange(ref.range);
          document.execCommand('insertText', false, out.trim().replace(/\n+/g, ' ')); blocks[ref.i] = serialize(ref.i);
        } else {
          const keepHp = kinds[ref.i] === 'hp' && ref.i === ref.iEnd && !/\n\s*\n/.test(out.trim());
          const m = keepHp && blocks[ref.i].trim().match(/^<(\w+)([^>]*)>/);
          const rep = keepHp ? `<${m[1]}${m[2]}>${out.trim()}</${m[1]}>` : out.trim();
          const tailSep = seps[ref.iEnd];
          blocks.splice(ref.i, ref.iEnd - ref.i + 1, rep); seps.splice(ref.i, ref.iEnd - ref.i + 1, tailSep);
        }
      } else {
        const box = root.querySelector(`.blk[data-i="${ref.i}"]`), ed = editableOf(box, kinds[ref.i]);
        focusArt(); const s = root.getSelection ? root.getSelection() : document.getSelection(); s.removeAllRanges(); s.addRange(ref.range);
        document.execCommand('insertText', false, out.trim()); blocks[ref.i] = serialize(ref.i);
      }
      await build(join());
    },
    async after(ref, out) { flushDirty(); blocks.splice(ref.iEnd + 1, 0, out.trim()); seps.splice(ref.iEnd, 0, '\n\n'); await build(join()); },
    async insertAtCursor(ref, out) { return this.after(ref, out); },
  };
}

async function versionsDlg(p, file, after) {
  const vs = await api('GET', `/api/projects/${enc(p.id)}/versions?file=${enc(file)}`);
  layer.innerHTML = `<div class="mask"><div class="dlg"><h3>历史版本 · ${esc(file)}</h3><div class="bd">
    ${vs.length ? `<div class="ty">每次 AI 改动、手动改样式前都会自动存一份。点「恢复」回到那个版本（恢复前会把现在的也存一份，不怕点错）。</div><div class="vlist">${vs.slice(0, 40).map(v => `<div class="vi"><span>${fmtTime(v.t)}</span><span class="ty">${esc(v.label || '')}</span><div class="sp"></div><button class="btn" data-v="${esc(v.name)}">恢复</button></div>`).join('')}</div>` : '<div class="empty-state">还没有历史版本</div>'}
  </div><div class="ft"><button class="btn" data-close>关闭</button></div></div></div>`;
  $$('[data-v]', layer).forEach(b => b.onclick = async () => { await api('POST', `/api/projects/${enc(p.id)}/restore`, { file, name: b.dataset.v }); layer.innerHTML = ''; toast('已恢复'); after(); });
}

/* ---------- 精修（卡片）：单击选中、双击改字、右边调样式或让 AI 改 ---------- */
async function tuneTab(el, p) {
  const prov = await aiProviders();
  if (S.tn?.id !== p.id) S.tn = { id: p.id, page: p.cardList[0], n: null };
  const imgFor = n => p.outputs.find(f => new RegExp(`_${String(n).padStart(2, '0')}[^/]*$`).test(f));
  el.innerHTML = `<div class="tune">
    <div class="tpages">${p.cardList.map(n => `<button data-pg="${n}" class="${n == S.tn.page ? 'on' : ''}">${imgFor(n) ? `<img src="${fileUrl(p, imgFor(n))}" alt="">` : ''}<span>${n}</span></button>`).join('')}</div>
    <div class="tstage" id="tstage"><div class="tbar"><button class="tbtn" id="tundo" data-tip="撤销 ⌘Z">${I('undo-2')}撤销</button><button class="tbtn" id="tver" data-tip="历史版本">${I('history')}版本</button><div class="sp"></div><span class="ty">单击选中 · 双击直接改字 · Esc 取消选择</span><div class="sp"></div><button class="btn pri" id="trender">${I('play')}渲染成图</button></div>
      <div class="twrap" id="twrap"><div class="tframe" id="tframe"><iframe id="tif" src="${fileUrl(p, 'index.html')}?wb=1&c=${S.tn.page}"></iframe><div class="hl hov" id="hov"></div><div class="hl cur" id="cur"></div></div></div></div>
    <div class="tright"><div class="ttabs" id="ttabs"><button data-t="ai">${I('sparkles')}AI 助手</button><button data-t="el">${I('mouse-pointer-click')}调元素</button></div>
      <aside class="as tas" id="tas"></aside><div class="tside" id="tside"></div></div></div>`;
  const tif = $('#tif'), tframe = $('#tframe'), wrap = $('#twrap');
  // 右栏两个标签：AI 助手（整组卡片对话着改）/ 调元素（点选一块手动调）
  const showTab = t => { S.tn.tab = t; lsSet('wb.ttab', t); $('#tas').hidden = t !== 'ai'; $('#tside').hidden = t !== 'el'; $$('#ttabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); };
  $('#ttabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) showTab(b.dataset.t); };
  showTab(S.tn.tab || lsGet('wb.ttab', 'ai'));
  const refreshThumbs = async () => {
    try {
      const np = await api('GET', `/api/projects/${enc(p.id)}`); p.outputs = np.outputs;
      $$('.tpages button').forEach(b => { const f = imgFor(b.dataset.pg); if (!f) return; const u = fileUrl(p, f) + '?v=' + Date.now(), img = b.querySelector('img'); if (img) img.src = u; else b.insertAdjacentHTML('afterbegin', `<img src="${u}" alt="">`); });
    } catch {}
  };
  const chat = mountChat($('#tas'), p, {
    prov, kind: 'card', emptyTitle: '和 AI 一起做这组卡片',
    focusText: () => { const e = S.tn.n != null ? elOf(S.tn.n) : null; return `作者正在看第 ${S.tn.page} 页${e ? `，选中了 <${e.tagName.toLowerCase()}>：${(e.textContent || '').trim().slice(0, 300)}` : ''}`; },
    lock: on => { tframe.style.pointerEvents = on ? 'none' : ''; },
    onChanged: async () => { S.tn.n = null; reload(false); },
    onDone: refreshThumbs,
    locate: q => {
      const flat = t => String(t || '').replace(/\s+/g, ''), qq = flat(q);
      const sec = [...(doc?.querySelectorAll('section[data-n]') || [])].find(x => flat(x.textContent).includes(qq)); if (!sec) return false;
      el.querySelector(`.tpages button[data-pg="${CSS.escape(sec.dataset.n)}"]`)?.click(); return true;
    },
  });
  chat.draw();
  let k = 1, doc = null;
  const fit = () => { k = Math.min((wrap.clientHeight - 20) / 960, (wrap.clientWidth - 20) / 720); tframe.style.transform = `scale(${k})`; tframe.parentNode.style.setProperty('--w', 720 * k + 'px'); tframe.parentNode.style.setProperty('--h', 960 * k + 'px'); };
  fit(); window.onresize = fit;
  const box = (id, e) => { const b = $(id); if (!e) { b.style.display = 'none'; return; } const r = e.getBoundingClientRect(); Object.assign(b.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); };
  const elOf = n => doc?.querySelector(`[data-wb="${n}"]`);
  const sectionN = () => doc?.querySelector(`section[data-n="${S.tn.page}"]`)?.dataset.wb;
  const reload = (keep) => { const n = S.tn.n; tif.dataset.keep = keep && n != null ? n : ''; tif.contentWindow.location.reload(); };
  const op = async (body, keep = true, msg) => { try { await api('POST', `/api/projects/${enc(p.id)}/card`, body); if (msg) toast(msg); reload(keep); } catch (e) { toast(e.message, true); } };

  tif.onload = () => {
    doc = tif.contentDocument; if (!doc) return;
    const st = doc.createElement('style'); st.textContent = '[data-wb]{cursor:default}[contenteditable]{outline:2px solid #6f7ce0!important;cursor:text}'; doc.head.append(st);
    doc.addEventListener('mousemove', e => { const t = e.target.closest?.('[data-wb]'); box('#hov', t && t.dataset.wb != S.tn.n && !t.matches('body') ? t : null); });
    doc.addEventListener('mouseleave', () => box('#hov', null));
    doc.addEventListener('click', e => { if (e.target.closest('[contenteditable]')) return; S.tn.editing?.(true); e.preventDefault(); e.stopPropagation(); const t = e.target.closest('[data-wb]'); if (t && !t.matches('body')) select(t.dataset.wb); }, true);
    doc.addEventListener('dblclick', e => { const t = e.target.closest('[data-wb]'); if (t && !t.matches('body,section')) editText(t); }, true);
    doc.addEventListener('keydown', keys);
    const keep = tif.dataset.keep; tif.dataset.keep = '';
    if (keep && elOf(keep)) select(keep); else { S.tn.n = null; box('#cur', null); side(); }
  };
  function keys(e) {
    if (e.target.closest?.('[contenteditable],input,textarea')) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'Escape') { S.tn.n = null; box('#cur', null); side(); }
    if ((e.key === 'Backspace' || e.key === 'Delete') && S.tn.n != null) { e.preventDefault(); op({ op: 'remove', n: S.tn.n }, false, '已删除，可撤销'); }
  }
  S.tuneKeys = keys;
  function select(n) { S.tn.editing?.(true); S.tn.n = n; box('#hov', null); box('#cur', elOf(n)); side(); showTab('el'); chat.setFocus((elOf(n)?.textContent || '').trim()); }
  function editText(t) {
    const before = t.innerHTML;
    t.setAttribute('contenteditable', 'true'); t.focus();
    const r = doc.createRange(); r.selectNodeContents(t); const s = doc.getSelection(); s.removeAllRanges(); s.addRange(r);
    const done = ok => {
      if (S.tn.editing !== done) return; S.tn.editing = null;
      t.removeAttribute('contenteditable'); t.removeEventListener('blur', onBlur); t.removeEventListener('keydown', onKey);
      if (!ok) { t.innerHTML = before; return; }
      if (t.innerHTML !== before) op({ op: 'inner', n: t.dataset.wb, inner: t.innerHTML.replace(/ data-wb="\d+"/g, '') }, true, '已改字');
    };
    const onBlur = () => done(true);
    const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); t.blur(); } if (e.key === 'Escape') { e.preventDefault(); done(false); } };
    t.addEventListener('blur', onBlur); t.addEventListener('keydown', onKey);
    S.tn.editing = done;
  }
  async function undo() { try { await api('POST', `/api/projects/${enc(p.id)}/undo`, { file: 'index.html' }); toast('已撤销'); reload(true); } catch (e) { toast(e.message, true); } }

  function side() {
    const n = S.tn.n, e = n != null ? elOf(n) : null;
    let html = '';
    if (e) {
      const cs = tif.contentWindow.getComputedStyle(e);
      const fs = parseFloat(cs.fontSize), mt = parseFloat(cs.marginTop) || 0;
      const hex = rgb => { const m = rgb.match(/\d+/g); return m ? '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('') : '#000000'; };
      const bold = +cs.fontWeight >= 600;
      html += `<div class="tsel"><b>&lt;${e.tagName.toLowerCase()}${e.className ? '.' + esc(String(e.className).split(' ')[0]) : ''}&gt;</b><span class="ty">${esc((e.textContent || '').trim().slice(0, 40))}</span>
        <div class="row"><button class="tbtn" id="tparent">${I('arrow-up')}选外层</button><button class="tbtn" id="tedit">${I('pen-line')}改字</button><button class="tbtn" id="tdel">${I('trash-2')}删除</button></div></div>
        <div class="tsec">样式</div>
        <div class="trow"><span>字号</span><button class="btn" data-fs="-2">−</button><b>${Math.round(fs)}px</b><button class="btn" data-fs="2">＋</button></div>
        <div class="trow"><span>颜色</span><input type="color" id="tcolor" value="${hex(cs.color)}"><button class="btn" id="tbold">${bold ? '取消加粗' : '加粗'}</button></div>
        <div class="trow"><span>对齐</span><div class="seg">${[['left', '左'], ['center', '中'], ['right', '右']].map(([v, l]) => `<button data-al="${v}" class="${cs.textAlign === v || (v === 'left' && cs.textAlign === 'start') ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="trow"><span>上边距</span><button class="btn" data-mt="-4">−</button><b>${Math.round(mt)}px</b><button class="btn" data-mt="4">＋</button></div>
        <div class="trow"><span></span><button class="addtag" id="tclear">清掉手动调的样式</button></div>`;
    } else html += `<div class="tsel empty">在左边卡片上<b>单击</b>选中要改的地方，<b>双击</b>直接改字。<br>不选的话，下面的 AI 会改整页。</div>`;
    html += `<div class="tsec">${I('sparkles')}让 AI 改${e ? '这一块' : '整页'}</div>
      <textarea id="tq" placeholder="${e ? '比如：改得更口语一点；把这句拆成两行；数字放大加粗' : '比如：整页文字精简三分之一；标题更抓人'}"></textarea>
      <div class="chips">${CARD_CHIPS.map(c => `<button class="chip" data-c="${c}">${c}</button>`).join('')}</div>
      <div class="trow">${provSelect(prov, 'tprov')}<button class="btn acc" id="tgo">${I('sparkles')}改</button></div><div class="ty" id="tstat"></div>`;
    $('#tside').innerHTML = html;
    $('#tside').onpointerdown = () => S.tn.editing?.(true);
    const getProv = bindProv($('#tprov'));
    $$('[data-c]').forEach(b => b.onclick = () => { $('#tq').value = ($('#tq').value ? $('#tq').value + '；' : '') + b.dataset.c; $('#tq').focus(); });
    $('#tq').onkeydown = ev => { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) $('#tgo').click(); };
    $('#tgo').onclick = async () => {
      const q = $('#tq').value.trim(); if (!q) return $('#tq').focus();
      const target = S.tn.n ?? sectionN(); if (target == null) return toast('没找到这一页', true);
      const b = $('#tgo'); b.disabled = true; const t0 = Date.now();
      const tick = setInterval(() => { $('#tstat').textContent = `AI 正在改… ${((Date.now() - t0) / 1000) | 0} 秒`; }, 500);
      try { await api('POST', `/api/projects/${enc(p.id)}/card`, { op: 'ai', n: target, instruction: q, provider: getProv() }); clearInterval(tick); toast(`改好了（${((Date.now() - t0) / 1000) | 0} 秒），不满意点撤销`); S.tn.n = null; reload(false); }
      catch (err) { clearInterval(tick); $('#tstat').textContent = ''; toast(err.message, true); b.disabled = false; }
    };
    if (!e) return;
    const cur = () => doc && tif.contentWindow.getComputedStyle(elOf(n));
    $('#tparent').onclick = () => { const pa = e.parentElement?.closest('[data-wb]'); if (pa && !pa.matches('body')) select(pa.dataset.wb); };
    $('#tedit').onclick = () => editText(e);
    $('#tdel').onclick = () => op({ op: 'remove', n }, false, '已删除，可撤销');
    $$('[data-fs]').forEach(b => b.onclick = () => op({ op: 'style', n, styles: { 'font-size': Math.max(8, Math.round(parseFloat(cur().fontSize) + +b.dataset.fs)) + 'px' } }));
    $$('[data-mt]').forEach(b => b.onclick = () => op({ op: 'style', n, styles: { 'margin-top': Math.round((parseFloat(cur().marginTop) || 0) + +b.dataset.mt) + 'px' } }));
    $$('[data-al]').forEach(b => b.onclick = () => op({ op: 'style', n, styles: { 'text-align': b.dataset.al } }));
    $('#tcolor').onchange = ev => op({ op: 'style', n, styles: { color: ev.target.value } });
    $('#tbold').onclick = () => op({ op: 'style', n, styles: { 'font-weight': +cur().fontWeight >= 600 ? '400' : '700' } });
    $('#tclear').onclick = () => op({ op: 'style', n, styles: { 'font-size': '', color: '', 'font-weight': '', 'text-align': '', 'margin-top': '' } }, true, '已清掉手动样式');
  }
  el.querySelector('.tpages').onclick = ev => { const b = ev.target.closest('[data-pg]'); if (!b) return; S.tn.page = +b.dataset.pg; S.tn.n = null; $$('.tpages button').forEach(x => x.classList.toggle('on', x === b)); tif.src = `${fileUrl(p, 'index.html')}?wb=1&c=${S.tn.page}`; };
  $('#tundo').onclick = () => { S.tn.editing?.(true); undo(); };
  $('#tver').onclick = () => versionsDlg(p, 'index.html', () => reload(false));
  $('#trender').onclick = () => run(p, 'build', $('#trender'));
  side();
}

/* ---------- AI 设置 ---------- */
async function openAISettings() {
  const d = await aiProviders();
  layer.innerHTML = `<div class="mask"><div class="dlg wide2"><h3>AI 设置</h3><div class="bd">
    <div class="ty">写作和精修时用哪个模型。选中的那个是默认。<b>Hermes</b> 用你本机已经配好的模型，不用填密钥，但每次要等 10 秒左右；填了密钥的 API 会快很多，还能边写边出字。密钥只存在本机（创作工作台/data/ai.json），这里只显示遮挡后的样子。</div>
    <div class="provs">${d.providers.map(p => `<div class="prov" data-id="${p.id}">
      <div class="pv1"><label class="rad"><input type="radio" name="def" value="${p.id}" ${d.default === p.id ? 'checked' : ''} ${p.ready ? '' : 'disabled'}><b>${esc(p.name)}</b></label>
        <span class="st ${p.ready ? 'st3' : 'st1'}"><i class="dot"></i>${p.ready ? '可用' : '未配置'}</span><span class="ty">${p.keyFrom ? '密钥来自' + esc(p.keyFrom) : p.env ? '也可以用环境变量 ' + p.env : ''}</span><div class="sp"></div>
        ${p.ready ? '<button class="btn" data-test>测试</button>' : ''}</div>
      ${p.type === 'claudecode' ? `<div class="ccrow">${p.cc?.loggedIn ? `${I('circle-check')}<span>已登录${p.cc.email ? ' ' + esc(p.cc.email) : ''}${p.cc.plan ? `（${esc(p.cc.plan)}）` : ''}。用你的 Claude 订阅额度跑：写作页的助手能直接改文章和排版，润色、体检、找选题也能用。</span>`
          : p.cc?.found ? `${I('triangle-alert')}<span>还没登录。点「登录」会打开浏览器，用你的 Claude 账号确认一下就好。</span><button class="btn pri" data-cclogin>${I('log-in')}登录</button>`
          : `${I('triangle-alert')}<span>这台电脑上还没有 Claude Code。点一下会从 claude.ai 下载官方版装好，装完接着登录。</span><button class="btn pri" data-ccinstall>${I('download')}一键安装并登录</button>`}</div>
        <div class="ccwait" hidden></div>
        <div class="pv2 cc2"><input data-f="model" placeholder="模型（可不填：opus / sonnet，默认跟着订阅）" value="${esc(p.model)}"><button class="btn" data-save>保存</button></div>`
      : p.type === 'hermes' ? '' : `<div class="pv2"><input data-f="model" placeholder="模型名" value="${esc(p.model)}"><input data-f="baseUrl" placeholder="${p.type === 'anthropic' ? '接口地址（默认官方，可不填）' : '接口地址'}" value="${esc(p.baseUrl)}"><input data-f="key" type="password" autocomplete="off" placeholder="${p.keyMask ? '已填 ' + p.keyMask + '，留空不改' : 'API 密钥'}"><button class="btn" data-save>保存</button></div>`}
    </div>`).join('')}</div>
    <details class="addp"><summary>＋ 加一个别的接口（OpenAI 兼容格式）</summary><div class="pv2"><input id="np-name" placeholder="名字，比如 硅基流动"><input id="np-url" placeholder="接口地址，比如 https://api.xxx.com/v1"><input id="np-model" placeholder="模型名"><input id="np-key" type="password" autocomplete="off" placeholder="API 密钥"><button class="btn acc" id="np-ok">添加</button></div></details>
  </div><div class="ft"><button class="btn pri" data-close>完成</button></div></div></div>`;
  layer.querySelectorAll('input[name=def]').forEach(r => r.onchange = () => api('PUT', '/api/ai/providers', { default: r.value }).then(() => { S.aiDefault = r.value; lsSet('wb.prov', r.value + '|' + r.value); toast('已设为默认'); }).catch(e => toast(e.message, true)));
  layer.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const box = b.closest('.prov'), v = f => box.querySelector(`[data-f=${f}]`).value.trim();
    const body = { model: v('model'), baseUrl: v('baseUrl') }; if (v('key')) body.key = v('key');
    try { await api('PUT', `/api/ai/providers/${box.dataset.id}`, body); toast('已保存'); openAISettings(); } catch (e) { toast(e.message, true); }
  });
  // Claude Code：一键安装 → 登录，过程显示在这一栏下面，登录好了自动刷新
  const ccBox = layer.querySelector('.ccwait'), ccBtn = layer.querySelector('[data-cclogin],[data-ccinstall]');
  const ccShow = html => { if (!ccBox.isConnected) return false; ccBox.hidden = !html; ccBox.innerHTML = html; return true; };
  const ccFail = msg => { ccShow(`<div class="cce">${I('triangle-alert')}<span>${esc(msg)}</span></div>`); if (ccBtn) ccBtn.disabled = false; };
  const ccLogin = async () => {
    let st;
    try { st = await api('POST', '/api/ai/cc-login', {}); } catch (e) { return ccFail(e.message); }
    ccShow(`<div class="ccs">${I('loader-circle', 'spinning')}<span>浏览器里打开了 Claude 登录页，确认后这里会自动变成「已登录」。</span></div>
      <div class="ccalt">浏览器没打开？${st.url ? `<a href="${esc(st.url)}" target="_blank" rel="noopener">点这里打开登录页</a>` : '再点一次「登录」'}。登录页最后给了一串验证码的话，粘贴到这里：</div>
      <div class="pv2 cc2"><input data-cccode placeholder="验证码" autocomplete="off"><button class="btn" data-ccsend>提交</button></div>`);
    const inp = ccBox.querySelector('[data-cccode]');
    ccBox.querySelector('[data-ccsend]').onclick = async () => { const v = inp.value.trim(); if (!v) return inp.focus(); try { await api('POST', '/api/ai/cc-login', { code: v }); inp.value = ''; toast('验证码交上去了，稍等'); } catch (e) { toast(e.message, true); } };
    inp.onkeydown = e => { if (e.key === 'Enter') ccBox.querySelector('[data-ccsend]').click(); };
    for (;;) {
      await new Promise(r => setTimeout(r, 2000));
      if (!ccBox.isConnected) return;
      const r = await api('GET', '/api/ai/cc').catch(() => null); if (!r) continue;
      if (r.loggedIn) { toast(`Claude Code 登录好了${r.email ? '：' + r.email : ''}`); return openAISettings(); }
      if (!r.login?.running) return ccFail(r.login?.error || '登录没完成，再点一次「登录」');
    }
  };
  layer.querySelector('[data-cclogin]')?.addEventListener('click', e => { e.currentTarget.disabled = true; ccLogin(); });
  layer.querySelector('[data-ccinstall]')?.addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    try { await api('POST', '/api/ai/cc-install', {}); } catch (err) { return ccFail(err.message); }
    for (;;) {
      const r = await api('GET', '/api/ai/cc').catch(() => null);
      if (r?.install && !r.install.running) {
        if (!r.found) return ccFail(r.install.error || '安装没成功');
        toast('Claude Code 装好了，接着登录'); return ccLogin();
      }
      if (!ccShow(`<div class="ccs">${I('loader-circle', 'spinning')}<span>正在下载安装，一般一两分钟…</span></div>${r?.install?.log ? `<pre class="cclog">${esc(r.install.log)}</pre>` : ''}`)) return;
      await new Promise(r => setTimeout(r, 2000));
    }
  });
  layer.querySelectorAll('[data-test]').forEach(b => b.onclick = async () => {
    const id = b.closest('.prov').dataset.id; b.disabled = true; b.innerHTML = '<i class="spin"></i>测试中';
    try { const r = await api('POST', '/api/ai/test', { provider: id }); toast(`能用：回了「${r.text}」，${(r.ms / 1000).toFixed(1)} 秒`); } catch (e) { toast(e.message, true); }
    b.disabled = false; b.textContent = '测试';
  });
  $('#np-ok').onclick = async () => {
    const name = $('#np-name').value.trim(), url = $('#np-url').value.trim(), model = $('#np-model').value.trim(), key = $('#np-key').value.trim();
    if (!name || !url || !model) return toast('名字、接口地址、模型名都要填', true);
    const id = 'x-' + Date.now().toString(36);
    try { await api('PUT', `/api/ai/providers/${id}`, { name, baseUrl: url, model, key, type: 'openai' }); toast('已添加'); openAISettings(); } catch (e) { toast(e.message, true); }
  };
}

/* ====================================================================
   文章写作室：① 资料 ② 写作 ③ 体检 ④ 发布
   ==================================================================== */
const SAPI = (p, sub, method = 'GET', body) => api(method, `/api/projects/${enc(p.id)}/studio/${sub}`, body);
const plainMd = s => String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '［图］').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\*\*|`/g, '').replace(/^#+\s*/gm, '').replace(/^>\s?/gm, '');
// 字级差异：删掉的划线，新加的标色
function diffHtml(a, b) {
  a = plainMd(a); b = plainMd(b);
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0; while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const A = [...a.slice(p, a.length - s)], B = [...b.slice(p, b.length - s)];
  let mid = '';
  if (A.length * B.length <= 160000) {
    const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0, del = '', ins = '';
    const flush = () => { if (del) mid += `<del>${esc(del)}</del>`; if (ins) mid += `<ins>${esc(ins)}</ins>`; del = ins = ''; };
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) { flush(); mid += esc(A[i]); i++; j++; }
      else if (j < B.length && (i >= A.length || dp[i][j + 1] >= dp[i + 1][j])) ins += B[j++];
      else del += A[i++];
    }
    flush();
  } else mid = `<del>${esc(A.join(''))}</del><ins>${esc(B.join(''))}</ins>`;
  const cut = (t, n, end) => t.length > n ? (end ? '…' + t.slice(-n) : t.slice(0, n) + '…') : t;
  return esc(cut(a.slice(0, p), 40, true)) + mid + esc(cut(a.slice(a.length - s), 40, false));
}
const SG_SRC = { chat: 'AI 助手', task: '快捷改法', continue: '续写' };
const QUICK_SCRIPT = ['照骨架先写一版完整的口播稿', '开头 3 秒的钩子再抓人一点，给我 3 个版本', '整条压到 60 秒以内', '这几句念着不顺，改得更口语', '给 3 个封面字和 5 个标题'];
const QUICK_AGENT = ['把整体排版换成更简洁、留白多一点的风格', '给第一章找一张官网的配图插进去', '给开头生成一张头图', '这一段读着像 AI 写的，帮我改', '帮我起 5 个标题'];
const QUICK = ['这一段读着像 AI 写的，帮我改', '这段写得更清楚、更好懂', '这一章开头不够抓人', '这里的数字和说法有没有要核对的', '帮我起 5 个标题'];

/* ---------- ② 写作 ---------- */
async function writeTab(el, p) {
  const [src, prov, sugg, hist] = await Promise.all([api('GET', `/api/projects/${enc(p.id)}/source`), aiProviders(), SAPI(p, 'suggestions'), SAPI(p, 'chat')]);
  const mode = lsGet('wb.wmode', 'rich');
  const TOOL = [['polish', '润色', 'paintbrush'], ['deai', '去 AI 味', 'eraser'], ['shorten', '精简', 'scissors'], ['expand', '扩写', 'expand'], ['story', '加故事', 'book-open'], ['hook', '更抓人', 'zap']];
  el.innerHTML = `<div class="studio${lsGet('wb.ol', '1') === '0' ? ' no-ol' : ''}${lsGet('wb.as', '1') === '0' ? ' no-as' : ''}" style="--asw:${+lsGet('wb.asw', '380') || 380}px">
    <aside class="ol"><div class="ol-h">${I('list-tree')}<span>大纲</span><div class="sp"></div><button class="icb sm" id="olx" data-tip="收起大纲">${I('chevron-left')}</button></div><div id="ol"></div></aside>
    <section class="ed">
      <div class="edbar">
        <button class="icb sm olopen" id="olo" data-tip="展开大纲">${I('list-tree')}</button>
        <span class="save" id="wsave">${I('cloud')}<span>已载入</span></span>
        <div class="sp"></div>
        <button class="icb sm" id="wcont" data-tip="续写：在光标所在段落后面接着写">${I('wand-sparkles')}</button>
        <button class="icb sm" id="wver" data-tip="历史版本">${I('history')}</button>
        <button class="icb sm" id="wasset" data-tip="配图：从素材库插到光标所在段落后面">${I('image-plus')}</button>
        <button class="icb sm" id="wtpl" data-tip="换模板：整篇换一套排版样式，正文不动" ${mode === 'x' ? 'hidden' : ''}>${I('palette')}</button>
        <div class="seg sm wmode3" id="wmode"><button data-m="rich" class="${mode === 'rich' ? 'on' : ''}" data-tip="公众号排版，可以直接改字">公众号</button><button data-m="x" class="${mode === 'x' ? 'on' : ''}" data-tip="推特（X 长文）的样子，也能直接改字">推特</button><button data-m="src" class="${mode === 'src' ? 'on' : ''}" data-tip="Markdown 源码">代码</button></div>
        <button class="icb sm asopen" id="aso" data-tip="展开 AI 助手">${I('sparkles')}</button>
      </div>
      ${mode === 'rich' ? `<div class="wgrid rich nopv"><div class="richhost" id="richhost"></div></div>` : mode === 'x' ? `<div class="wgrid rich nopv"><div class="richhost xhost" id="richhost"></div></div>` : `<div class="wgrid nopv"><textarea id="wed" spellcheck="false">${esc(src.text)}</textarea></div>`}
    </section>
    <aside class="as"><div class="as-drag" id="asdrag" data-tip="拖动调宽，双击恢复"></div>
    </aside></div>
    <div class="seltool" id="seltool" hidden>${TOOL.map(([k, n, ic]) => `<button data-w="${k}">${I(ic)}<span>${n}</span></button>`).join('')}<i class="sep"></i><button data-ask>${I('message-square')}<span>问 AI</span></button></div>`;
  const saveEl = $('#wsave');
  const setSave = (txt, ic = 'cloud') => { saveEl.innerHTML = `${I(ic)}<span>${txt}</span>`; };
  let mtime = src.mtime, timer, list = sugg;
  const save = async (label = '') => {
    clearTimeout(timer); timer = null;
    try { const r = await api('PUT', `/api/projects/${enc(p.id)}/source`, { text: E.text(), mtime, label }); mtime = r.mtime; setSave(`已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, 'check'); }
    catch (e) { setSave('没保存上', 'triangle-alert'); if (/别处被改过/.test(e.message)) { if (confirm('文章在别处被改过了。要载入最新版吗？你这边没保存的改动会丢。')) writeTab(el, p); } else toast(e.message, true); }
  };
  const changed = () => { setSave('正在输入…', 'pen-line'); clearTimeout(timer); timer = setTimeout(save, 900); };
  S.flush = () => timer ? save() : null;

  // 选中文字时，在选区上方弹出改法工具条
  const tool = $('#seltool');
  const setSel = n => {
    const f = E?.focusText?.() || '';
    chat.setFocus(f);
    if (!n) { tool.hidden = true; return; }
    const r = E.selRect?.(); if (!r || !r.width) { tool.hidden = true; return; }
    tool.hidden = false;
    const w = tool.offsetWidth, x = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
    tool.style.left = x + 'px'; tool.style.top = Math.max(64, r.top - tool.offsetHeight - 10) + 'px';
  };

  // 右边的 AI 助手（和精修页共用一个组件）
  const chat = mountChat($('.studio .as'), p, {
    prov, kind: 'article', emptyTitle: p.form === 'script' ? '和 AI 一起写这条口播稿' : '和 AI 一起做这篇文章',
    ...(p.form === 'script' ? { quick: QUICK_SCRIPT, emptyText: '它能直接写和改口播稿：开头钩子、每段的口播原话和画面提示、封面字、标题和发布文案，会按时长删改，也会记住你说过的偏好。每次改动都能一键撤销' } : {}),
    headExtra: `<button class="icb sm" id="asx" data-tip="收起助手">${I('panel-right-close')}</button>`,
    slot: '<div class="as-sg" id="sgbar" hidden></div>',
    focusText: () => E?.focusText?.() || '', lock: on => E?.lock?.(on),
    onChanged: async files => { if (files.length) await reload(); },
    canLocate: q => !!E?.canFind?.(q),
    locate: q => { if (!E?.canFind?.(q)) return false; E.scrollTo(q); return true; },
    onDecisions: list => E?.setMarks?.(list, id => chat.showDecision(id)),
    legacy: { after: async r => { list = await SAPI(p, 'suggestions'); drawSugg(); if (r.suggestions.length) E.scrollTo(r.suggestions[0].old); } },
  });
  const getProv = chat.getProv;
  let E;
  if (mode === 'rich') E = await richEditor($('#richhost'), p, src.text, changed, setSel);
  else if (mode === 'x') E = await richEditor($('#richhost'), p, src.text, changed, setSel, { skin: 'x' });
  else {
    const ta = $('#wed'); ta.oninput = changed;
    ta.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
    ['select', 'keyup', 'mouseup'].forEach(t => ta.addEventListener(t, () => setSel(ta.selectionEnd - ta.selectionStart)));
    E = { text: () => ta.value, focusText: () => ta.value.slice(ta.selectionStart, ta.selectionEnd), selRect: () => { const r = ta.getBoundingClientRect(); return { left: r.left, width: r.width, top: r.top + 8 }; },
      blockText: () => { const v = ta.value, i = ta.selectionEnd; const a = v.lastIndexOf('\n\n', i - 1), b = v.indexOf('\n\n', i); return v.slice(a < 0 ? 0 : a + 2, b < 0 ? v.length : b); }, setSuggestions() {}, setMarks() {}, outline: () => [], scrollToBlock() {},
      canFind: q => !!q && ta.value.includes(q),
      scrollTo(q) { const i = ta.value.indexOf(q || ''); if (i < 0) return; ta.focus(); ta.setSelectionRange(i, i + q.length); ta.scrollTop = Math.max(0, ta.value.slice(0, i).split('\n').length * 22 - ta.clientHeight / 2); } };
  }
  $('#richhost')?.addEventListener('scroll', () => { tool.hidden = true; });
  const reload = async () => { await S.flush?.(); const s = await api('GET', `/api/projects/${enc(p.id)}/source`); mtime = s.mtime; if (E.reset) await E.reset(s.text); else $('#wed').value = s.text; drawOutline(); };
  const accept = async id => { await S.flush?.(); try { const r = await SAPI(p, 'accept', 'POST', { id }); list = r.suggestions; await reload(); drawSugg(); setSave('已接受修改', 'check'); } catch (e) { toast(e.message, true); list = await SAPI(p, 'suggestions'); drawSugg(); } };
  const reject = async id => { const r = await SAPI(p, 'reject', 'POST', { id }); list = r.suggestions; drawSugg(); };
  function drawSugg() {
    E.setSuggestions(list, { accept, reject });
    const n = list.length, bar = $('#sgbar');
    bar.hidden = !n; if (!n) return;
    bar.innerHTML = `${I('pencil-line')}<b>${n} 处修改待确认</b><div class="sp"></div><button class="tbtn" id="sgnext" data-tip="跳到下一处">${I('arrow-right')}下一处</button><button class="tbtn ok" id="sgall">${I('check')}全部接受</button>`;
    if (mode === 'src') bar.insertAdjacentHTML('beforeend', `<div class="sglist">${list.map(s => `<div class="sgi"><div class="dif">${diffHtml(s.old, s.new)}</div><div class="row"><span class="ty">${esc(s.why || SG_SRC[s.source] || '')}</span><div class="sp"></div><button class="tbtn" data-rej="${s.id}">${I('x')}不要</button><button class="tbtn ok" data-acc="${s.id}">${I('check')}接受</button></div></div>`).join('')}</div>`);
    let k = 0;
    $('#sgnext').onclick = () => { E.scrollTo(list[k % n].old); k++; };
    $('#sgall').onclick = async () => { await S.flush?.(); const r = await SAPI(p, 'accept-all', 'POST', {}); list = r.suggestions; await reload(); drawSugg(); toast(`已接受 ${r.n} 处`); };
    $$('[data-acc]', bar).forEach(b => b.onclick = () => accept(b.dataset.acc));
    $$('[data-rej]', bar).forEach(b => b.onclick = () => reject(b.dataset.rej));
  }
  function drawOutline() {
    const o = E.outline();
    $('#ol').innerHTML = o.length ? o.map(h => `<a data-i="${h.i}" class="lv${h.level}">${esc(h.text.replace(/\s*\|\s*[A-Z ;:.&’'-]+$/, ''))}</a>`).join('') : '<span class="ty">还没有小标题</span>';
    $('#ol').onclick = e => { const a = e.target.closest('[data-i]'); if (a) E.scrollToBlock(+a.dataset.i); };
  }
  $('#wasset').onclick = () => pickAssetDlg(p, async a => {
    await S.flush?.();
    try { const r = await SAPI(p, 'insert-asset', 'POST', { asset: a.id, after: E.blockText() || '', alt: a.title || '' }); await reload(); toast('已插入 ' + r.file); E.scrollTo?.(r.file); }
    catch (err) { toast(err.message, true); }
  });
  // 浮动工具条：生成修改建议 / 带着选区去问 AI
  tool.onmousedown = e => e.preventDefault();
  $$('[data-w]', tool).forEach(b => b.onclick = async () => {
    const quote = E.focusText(); if (!quote || tool.dataset.busy) return;
    tool.dataset.busy = '1'; $$('button', tool).forEach(x => x.disabled = true);
    await S.flush?.(); const label = b.innerHTML; b.innerHTML = `${I('loader-circle', 'spinning')}<span>改写中</span>`; const t0 = Date.now();
    try { const s = await SAPI(p, 'suggest', 'POST', { quote, task: b.dataset.w, provider: getProv() }); tool.hidden = true; list = await SAPI(p, 'suggestions'); drawSugg(); E.scrollTo(s.old); toast(`改好了（${((Date.now() - t0) / 1000) | 0} 秒），在原文下面确认`); }
    catch (e) { toast(e.message, true); } b.innerHTML = label;
    delete tool.dataset.busy; $$('button', tool).forEach(x => x.disabled = false);
  });
  $('[data-ask]', tool).onclick = () => { tool.hidden = true; $('#chatin').focus(); $('#chatin').placeholder = '关于你选中的这段，想怎么改？'; };
  $('#wcont').onclick = async () => {
    const b = $('#wcont'); b.innerHTML = `${I('loader-circle', 'spinning')}续写中`; await S.flush?.();
    try { const s = await SAPI(p, 'continue', 'POST', { quote: E.blockText() || '', provider: getProv() }); list = await SAPI(p, 'suggestions'); drawSugg(); E.scrollTo(s.old); toast('续写好了，在原文下面确认'); } catch (e) { toast(e.message, true); }
    b.innerHTML = `${I('wand-sparkles')}续写`;
  };
  $('#wmode').onclick = async e => { const m = e.target.closest('[data-m]')?.dataset.m; if (m && m !== mode) { await S.flush?.(); lsSet('wb.wmode', m); writeTab(el, p); } };
  $('#wver').onclick = () => versionsDlg(p, 'article.md', () => writeTab(el, p));
  $('#wtpl').onclick = () => tplDlg({ mode: 'apply', p, onApplied: () => reload() });
  // 助手栏：拖左边缘调宽，双击恢复；可以整栏收起
  const studio = $('.studio');
  $('#asx').onclick = () => { studio.classList.add('no-as'); lsSet('wb.as', '0'); };
  $('#aso').onclick = () => { studio.classList.remove('no-as'); lsSet('wb.as', '1'); setTimeout(() => $('#chatin')?.focus(), 50); };
  const drag = $('#asdrag');
  drag.onpointerdown = e => {
    if (e.button !== 0) return;
    e.preventDefault(); studio.classList.add('resizing');
    const box = studio.getBoundingClientRect();
    const move = ev => { const w = Math.round(Math.max(300, Math.min(box.right - ev.clientX, box.width - 360))); studio.style.setProperty('--asw', w + 'px'); };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); studio.classList.remove('resizing'); lsSet('wb.asw', parseInt(studio.style.getPropertyValue('--asw')) || 380); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };
  drag.ondblclick = () => { studio.style.setProperty('--asw', '380px'); lsSet('wb.asw', '380'); };
  $('#olx').onclick = () => { $('.studio').classList.add('no-ol'); lsSet('wb.ol', '0'); };
  $('#olo').onclick = () => { $('.studio').classList.remove('no-ol'); lsSet('wb.ol', '1'); };
  drawOutline(); drawSugg(); await chat.draw(hist);
  if (S.pendingFocus) { E.scrollTo(S.pendingFocus); S.pendingFocus = null; }
}

/* ---------- 大纲页：先在这里把大纲定下来，再去写作页写正文 ---------- */
const OL_SKELETON = `# 标题写在这里

备选标题：

> 一句话说这篇讲什么

开头：打算怎么起

## 01 第一节的小标题

- 要点

## 02 第二节的小标题

- 要点
`;
async function outlineTab(el, p) {
  const card = p.type === 'card';
  const [src, prov, hist, notes] = await Promise.all([api('GET', `/api/projects/${enc(p.id)}/outline`), aiProviders(), SAPI(p, 'chat'), SAPI(p, 'research').catch(() => [])]);
  let mode = lsGet('wb.olmode', 'doc'), mtime = src.mtime, text = src.text, timer = null, busy = false;
  const nNotes = (Array.isArray(notes) ? notes : notes?.items || []).length;
  el.innerHTML = `<div class="studio no-ol olstudio${lsGet('wb.as', '1') === '0' ? ' no-as' : ''}" style="--asw:${+lsGet('wb.asw', '380') || 380}px">
    <aside class="ol"></aside>
    <section class="ed">
      <div class="edbar">
        <span class="save" id="osave">${I('cloud')}<span>${text.trim() ? '已载入' : '还没有大纲'}</span></span>
        <div class="sp"></div>
        <span class="olfmt" id="olfmt" ${mode === 'src' ? 'hidden' : ''}><button class="icb sm" data-f="h2" data-tip="把光标这一行变成小标题">${I('heading-2')}</button><button class="icb sm" data-f="ul" data-tip="把光标这一行变成要点">${I('list')}</button><button class="icb sm" data-f="add" data-tip="在最后加一节">${I('plus')}</button></span>
        <button class="icb sm" id="over" data-tip="大纲的历史版本">${I('history')}</button>
        <div class="seg sm"><button data-m="doc" class="${mode === 'doc' ? 'on' : ''}">大纲</button><button data-m="src" class="${mode === 'src' ? 'on' : ''}">源码</button></div>
        <button class="icb sm asopen" id="aso" data-tip="展开 AI 助手">${I('sparkles')}</button>
      </div>
      <div class="olwrap" id="olwrap"></div>
      <div class="olfoot"><a class="olres" href="#/p/${enc(p.id)}/research" data-tip="AI 查到的资料都记在资料页">${I('search')}资料 ${nNotes} 条</a><span class="ty">大纲可以直接改，也可以在右边问 AI</span><div class="sp"></div><button class="btn pri" id="olgo">大纲定了，开始写${card ? '卡片' : '正文'}${I('arrow-right')}</button></div>
    </section>
    <aside class="as"><div class="as-drag" id="asdrag" data-tip="拖动调宽，双击恢复"></div></aside></div>`;
  const saveEl = $('#osave'), wrap = $('#olwrap');
  const setSave = (t, ic = 'cloud') => { saveEl.innerHTML = `${I(ic)}<span>${t}</span>`; };

  // 大纲 ↔ Markdown：只认小标题、要点、引用、普通段落，粗体和链接保留
  const inl = n => [...n.childNodes].map(c => c.nodeType === 3 ? c.textContent : c.nodeType !== 1 ? '' :
    /^(B|STRONG)$/.test(c.tagName) ? (c.textContent.trim() ? `**${inl(c)}**` : inl(c)) : c.tagName === 'A' ? `[${inl(c)}](${c.getAttribute('href') || ''})` :
    c.tagName === 'CODE' ? '`' + c.textContent + '`' : c.tagName === 'BR' ? '\n' : /^(UL|OL)$/.test(c.tagName) ? '' : inl(c)).join('');
  const one = s => s.replace(/\s*\n\s*/g, ' ').replace(/ /g, ' ').trim();
  function toMd(root) {
    const out = [];
    for (const n of root.childNodes) {
      if (n.nodeType === 3) { if (n.textContent.trim()) out.push(one(n.textContent)); continue; }
      if (n.nodeType !== 1) continue;
      const tg = n.tagName;
      if (/^H[1-6]$/.test(tg)) { const t = one(inl(n)); if (t) out.push('#'.repeat(+tg[1]) + ' ' + t); }
      else if (tg === 'UL' || tg === 'OL') { const it = [...n.querySelectorAll(':scope > li')].map(li => one(inl(li))).filter(Boolean); if (it.length) out.push(it.map((t, i) => (tg === 'OL' ? `${i + 1}. ` : '- ') + t).join('\n')); }
      else if (tg === 'BLOCKQUOTE') { const t = one(inl(n)); if (t) out.push('> ' + t); }
      else if (tg === 'HR') continue;
      else { const ls = inl(n).split('\n').map(one).filter(Boolean); if (ls.length) out.push(ls.join('\n\n')); }
    }
    return out.join('\n\n') + '\n';
  }
  const cur = () => mode === 'src' ? $('#olsrc').value : toMd($('#oldoc'));

  const save = async () => {
    clearTimeout(timer); timer = null;
    const t = cur(); if (t === text) { setSave('已保存', 'check'); return; }
    try { const r = await api('PUT', `/api/projects/${enc(p.id)}/outline`, { text: t, mtime }); mtime = r.mtime; text = t; setSave(`已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, 'check'); }
    catch (e) { setSave('没保存上', 'triangle-alert'); if (/别处被改过/.test(e.message)) { if (confirm('大纲刚被 AI 改过了。要载入最新版吗？你这边没保存的改动会丢。')) reload(true); } else toast(e.message, true); }
  };
  const changed = () => { setSave('正在输入…', 'pen-line'); clearTimeout(timer); timer = setTimeout(save, 900); };
  S.flush = () => timer ? save() : null;

  function draw() {
    if (!text.trim() && mode === 'doc') {
      wrap.innerHTML = `<div class="olempty">${busy ? `${I('loader-circle', 'spinning')}<b>AI 正在查资料、写大纲</b><span>查到的资料会先记进资料页，大纲写好会出现在这里，你可以直接改。</span>`
        : `${I('list-tree')}<b>还没有大纲</b><span>在右边告诉 AI 你想写什么，它会先查资料再出大纲；也可以自己先写。</span><button class="btn" id="olself">${I('pen-line')}自己写</button>`}</div>`;
      const b = $('#olself'); if (b) b.onclick = () => { text = ''; wrap.innerHTML = ''; drawDoc(OL_SKELETON); changed(); };
      return;
    }
    if (mode === 'src') {
      wrap.innerHTML = `<textarea id="olsrc" class="olsrc" spellcheck="false" placeholder="# 标题&#10;&#10;## 01 小标题&#10;- 要点"></textarea>`;
      const ta = $('#olsrc'); ta.value = text; ta.oninput = changed; ta.readOnly = busy;
      ta.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
    } else drawDoc(text);
  }
  function drawDoc(md) {
    wrap.innerHTML = `<div class="oldoc" id="oldoc" spellcheck="false">${mdToHtml(md)}</div>`;
    const d = $('#oldoc'); d.contentEditable = busy ? 'false' : 'true';
    d.querySelectorAll('a').forEach(a => a.removeAttribute('target'));
    d.oninput = changed;
    d.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
    // 粘贴只要纯文字，免得带进别处的样式
    d.onpaste = e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); };
    d.onclick = e => { if (e.target.closest('a') && (e.metaKey || e.ctrlKey)) window.open(e.target.closest('a').href, '_blank'); };
  }
  const reload = async (force = false) => {
    if (!force) await S.flush?.();
    const s = await api('GET', `/api/projects/${enc(p.id)}/outline`); mtime = s.mtime;
    if (s.text !== text || force) { text = s.text; draw(); setSave(text.trim() ? '已载入最新' : '还没有大纲', 'refresh-cw'); }
  };
  // AI 在跑的时候：大纲先锁住，每隔几秒看看它有没有写进来
  let poll = null;
  const lock = on => {
    busy = on; clearInterval(poll); poll = null;
    if (on) poll = setInterval(async () => { if (!document.body.contains(wrap)) return clearInterval(poll); const s = await api('GET', `/api/projects/${enc(p.id)}/outline`).catch(() => null); if (s && s.mtime !== mtime) { mtime = s.mtime; text = s.text; draw(); } }, 3000);
    const d = $('#oldoc'); if (d) d.contentEditable = on ? 'false' : 'true';
    const ta = $('#olsrc'); if (ta) ta.readOnly = on;
    if (!text.trim()) draw();
    $('#olgo').disabled = on; $('#olgo').dataset.tip = on ? 'AI 还在改大纲，等它停下' : '';
  };

  const chat = mountChat($('.olstudio .as'), p, {
    prov, kind: card ? 'card' : 'article', stage: 'outline', emptyTitle: '和 AI 一起定大纲',
    emptyText: '它会先查资料、记进资料页，再按资料定标题、写大纲。大纲在左边，你可以直接改，也可以问它哪里有问题、让它改。',
    quick: ['按我的要求先查资料，再出一版大纲', '这版大纲有什么问题？', '小标题再具体一点，让人一眼看懂', '第二节和第三节是不是重了？', '再给 3 个大标题备选'],
    headExtra: `<button class="icb sm" id="asx" data-tip="收起助手">${I('panel-right-close')}</button>`,
    focusText: () => { const s = getSelection(); return s && wrap.contains(s.anchorNode) ? String(s).trim() : $('#olsrc') ? $('#olsrc').value.slice($('#olsrc').selectionStart, $('#olsrc').selectionEnd) : ''; },
    lock, onChanged: async files => { if (files.includes('outline.md')) await reload(true); },
    canLocate: q => !!q && cur().includes(q),
    locate: q => { const d = $('#oldoc'); const n = d && [...d.children].find(x => x.textContent.includes(q)); if (!n) return false; n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.classList.remove('olflash'); void n.offsetWidth; n.classList.add('olflash'); return true; },
  });

  // 小标题 / 要点 / 加一节
  $('#olfmt').onmousedown = e => e.preventDefault();
  $('#olfmt').onclick = e => {
    const f = e.target.closest('[data-f]')?.dataset.f, d = $('#oldoc'); if (!f || busy) return;
    if (!d) { drawDoc(OL_SKELETON); changed(); return; }
    if (f === 'add') {
      const n = d.querySelectorAll('h2').length + 1;
      d.insertAdjacentHTML('beforeend', `<h2>${String(n).padStart(2, '0')} 新的一节</h2><ul><li>要点</li></ul>`);
      const h = d.lastElementChild.previousElementSibling; h.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const r = document.createRange(); r.selectNodeContents(h); const s = getSelection(); s.removeAllRanges(); s.addRange(r); d.focus(); changed(); return;
    }
    if (!wrap.contains(getSelection().anchorNode)) return toast('先点一下要改的那一行');
    document.execCommand('defaultParagraphSeparator', false, 'p');
    if (f === 'h2') document.execCommand('formatBlock', false, 'h2');
    if (f === 'ul') document.execCommand('insertUnorderedList');
    changed();
  };
  $('.olstudio .seg').onclick = async e => { const m = e.target.closest('[data-m]')?.dataset.m; if (!m || m === mode) return; await S.flush?.(); if (mode === 'doc' && $('#oldoc')) text = toMd($('#oldoc')); mode = m; lsSet('wb.olmode', m); $$('.olstudio .seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); $('#olfmt').hidden = m === 'src'; draw(); };
  $('#over').onclick = () => versionsDlg(p, 'outline.md', () => outlineTab(el, p));
  // 定稿：存好大纲，进写作页，替作者说一句“照大纲写”
  $('#olgo').onclick = async () => {
    await S.flush?.();
    if (!cur().trim() || cur().trim() === OL_SKELETON.trim()) return toast('大纲还是空的，先让 AI 出一版或者自己写几条', true);
    const st = await SAPI(p, 'agent-status').catch(() => null); if (st?.running) return toast('AI 还在改大纲，等它停下再开始写', true);
    await api('PATCH', `/api/projects/${enc(p.id)}`, { phase: '' }).catch(() => {});
    S.autoSend = { pid: p.id, text: card ? '大纲定了，照大纲做卡片：每节一页，替换模板里的占位页。' : '大纲定了，照大纲写正文：标题、目录、小标题照大纲来，要点展开成段落；大纲里标了【待查】的先去查。' };
    location.hash = `#/p/${enc(p.id)}/${card ? 'tune' : 'write'}`;
  };
  // 助手栏：收起、拖宽（和写作页一样）
  const studio = $('.olstudio');
  $('#asx').onclick = () => { studio.classList.add('no-as'); lsSet('wb.as', '0'); };
  $('#aso').onclick = () => { studio.classList.remove('no-as'); lsSet('wb.as', '1'); setTimeout(() => $('#chatin')?.focus(), 50); };
  const drag = $('#asdrag');
  drag.onpointerdown = e => {
    if (e.button !== 0) return;
    e.preventDefault(); studio.classList.add('resizing');
    const box = studio.getBoundingClientRect();
    const move = ev => studio.style.setProperty('--asw', Math.round(Math.max(300, Math.min(box.right - ev.clientX, box.width - 360))) + 'px');
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); studio.classList.remove('resizing'); lsSet('wb.asw', parseInt(studio.style.getPropertyValue('--asw')) || 380); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };
  drag.ondblclick = () => { studio.style.setProperty('--asw', '380px'); lsSet('wb.asw', '380'); };
  draw(); await chat.draw(hist);
}

/* ---------- ③ 体检 ---------- */
async function checkTab(el, p) {
  const prov = await aiProviders();
  S.chk ||= {};
  const draw = (r, rev) => {
    const prev = r.history?.length > 1 ? r.history[r.history.length - 2] : null;
    const all = [...(rev || []), ...r.issues];
    el.innerHTML = `<div class="chk">
      <div class="chk-h"><div><b>这篇文章现在的状态</b><div class="ty">体检于 ${fmtTime(r.t)}${r.detector ? '' : ' · 没找到去 AI 味检测脚本，只做了基础统计'}</div></div><div class="sp"></div>
        ${provSelect(prov, 'cprov', 'mini')}<button class="btn" id="crev">${I('scan-text')}让 AI 通读挑问题</button><button class="btn pri" id="cre">${I('refresh-cw')}重新体检</button></div>
      <div class="stats">${[['正文字数', r.stats.chars.toLocaleString()], ['阅读时长', r.stats.minutes + ' 分钟'], ['段落', r.stats.paras], ['最长一段', r.stats.longest + ' 字'], ['图片', r.stats.images], ['表格', r.stats.tables]].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      ${r.metrics.length ? `<div class="isec">AI 味指标 <span class="ty">（对照人类写的文章；红色是明显偏离的）</span></div>
      <div class="metrics">${r.metrics.map(m => { const pv = prev?.metrics?.[m.key]; return `<div class="metric${m.bad ? ' bad' : ''}"><span>${esc(m.desc)}</span><b>${m.value}<small>${m.unit}</small></b><em>人类约 ${m.human}${pv != null && pv !== m.value ? `　上次 ${pv}` : ''}</em></div>`; }).join('')}</div>` : ''}
      <div class="isec">问题清单 <span class="ty">${all.length ? `${all.length} 条 · 点「定位」跳到原文，点「AI 改」生成修改建议，到写作页确认` : ''}</span></div>
      ${all.length ? `<div class="issues">${all.map(x => `<div class="issue${x.done ? ' done' : ''}" data-id="${x.id}"><span class="itype t-${esc(x.type).replace(/\s/g, '')}">${esc(x.type)}</span><div class="ib"><div class="iq">「${esc(x.quote)}」</div><div class="ty">${esc(x.tip)}</div></div>
        <button class="tbtn" data-loc="${x.id}">${I('crosshair')}定位</button><button class="tbtn acc" data-fix="${x.id}" ${x.found === false ? 'title="原文里没找到这句，可能已经改过"' : ''}>${x.done ? I('check') + '已生成' : I('sparkles') + 'AI 改'}</button></div>`).join('')}</div>`
        : `<div class="empty-state">${rev ? 'AI 没挑出问题' : '检测器没发现明显问题。点「让 AI 通读挑问题」，看看逻辑、冗余、需要核对的地方'}</div>`}
    </div>`;
    const getProv = bindProv($('#cprov'));
    $('#cre').onclick = async () => { $('#cre').innerHTML = '<i class="spin"></i>体检中'; S.chk[p.id] = { r: await SAPI(p, 'check', 'POST', {}), rev: S.chk[p.id]?.rev }; draw(S.chk[p.id].r, S.chk[p.id].rev); };
    $('#crev').onclick = async () => {
      const b = $('#crev'), t0 = Date.now(); b.disabled = true; const tk = setInterval(() => b.innerHTML = `<i class="spin"></i>AI 通读中 ${((Date.now() - t0) / 1000) | 0} 秒`, 500);
      try { const rv = await SAPI(p, 'review', 'POST', { provider: getProv() }); S.chk[p.id].rev = rv; clearInterval(tk); draw(S.chk[p.id].r, rv); } catch (e) { clearInterval(tk); toast(e.message, true); b.disabled = false; b.innerHTML = `${I('scan-text')}让 AI 通读挑问题`; }
    };
    $$('[data-loc]', el).forEach(b => b.onclick = () => { const x = all.find(i => i.id === b.dataset.loc); S.pendingFocus = x.quote; goTab(p, 'write'); });
    $$('[data-fix]', el).forEach(b => b.onclick = async () => {
      const x = all.find(i => i.id === b.dataset.fix); if (x.done) { S.pendingFocus = x.quote; return goTab(p, 'write'); }
      b.innerHTML = `${I('loader-circle', 'spinning')}改写中`; b.disabled = true;
      try { await SAPI(p, 'suggest', 'POST', { quote: x.quote, instruction: x.tip, why: `${x.type}：${x.tip}`.slice(0, 60), provider: getProv() }); x.done = true; b.innerHTML = `${I('check')}已生成`; b.disabled = false; b.closest('.issue').classList.add('done'); toast('修改建议已生成，到「② 写作」里确认'); }
      catch (e) { toast(e.message, true); b.innerHTML = `${I('sparkles')}AI 改`; b.disabled = false; }
    });
  };
  if (S.chk[p.id]) return draw(S.chk[p.id].r, S.chk[p.id].rev);
  el.innerHTML = '<div class="empty-state"><i class="spin" style="display:inline-block"></i> 正在体检…</div>';
  try { S.chk[p.id] = { r: await SAPI(p, 'check', 'POST', {}) }; draw(S.chk[p.id].r); } catch (e) { el.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
}
function goTab(p, k) { S.flush?.(); S.flush = null; S.tab = k; $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === k)); renderTab(p); }

/* ---------- ④ 发布 ---------- */
/* ---------- 视频脚本：提词页 ---------- */
const scriptSource = async p => (await fetch(fileUrl(p, 'article.md') + '?t=' + Date.now())).text();
const speakChars = t => (t.match(/[一-鿿]/g) || []).length + (t.match(/[A-Za-z0-9]+/g) || []).length;
// 把口播稿拆成一段一段：口播原话、画面提示；「封面和标题」「发布文案和话题」单独放（规则和 core.mjs 的 spokenText 一致）
function scriptParts(md) {
  const parts = [], extra = []; let cur = null;
  for (const raw of md.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (h[1].length === 1) continue;
      if (h[1].length === 2 && /封面|标题|发布|话题|备注|素材/.test(h[2])) { cur = { title: h[2], lines: [] }; extra.push(cur); }
      else if (h[1].length > 2 && cur?.lines) continue;
      else { cur = { title: h[2], say: [], shot: [] }; parts.push(cur); }
      continue;
    }
    if (!cur || /^<p class="deck">/.test(l)) continue;
    if (cur.lines) { if (!/^[（(].*[）)]$/.test(l)) cur.lines.push(l.replace(/^[-*]\s+/, '')); continue; }
    if (l.startsWith('>')) { const t = l.replace(/^>\s*/, '').replace(/^画面[:：]\s*/, ''); if (t && !/^[（(].*[）)]$/.test(t)) cur.shot.push(t); }
    else if (!/^[（(].*[）)]$/.test(l)) cur.say.push(l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').replace(/^[-*]\s+/, ''));
  }
  return { parts: parts.filter(x => x.say.length || x.shot.length), extra: extra.filter(x => x.lines.length) };
}
async function prompterTab(el, p) {
  el.innerHTML = '<div class="empty-state">载入中…</div>';
  const d = scriptParts(await scriptSource(p));
  const secOf = x => Math.round(speakChars(x.say.join('')) / 4.5);
  const chars = d.parts.reduce((n, x) => n + speakChars(x.say.join('')), 0), total = Math.round(chars / 4.5);
  if (!d.parts.length) { el.innerHTML = `<div class="empty-state">口播稿还没写。回到「写作」，让 AI 照骨架先写一版，或者自己写。<br><br><a class="btn" href="#/p/${enc(p.id)}/write">去写作</a></div>`; return; }
  const sayAll = d.parts.map(x => x.say.join('\n')).filter(Boolean).join('\n\n');
  const table = d.parts.map((x, i) => `${i + 1}. ${x.title}\n口播：${x.say.join(' ') || '（无）'}\n画面：${x.shot.join('；') || '（无）'}`).join('\n\n');
  el.innerHTML = `<div class="prm">
    <div class="prm-h"><div><b>口播约 ${fmtSec(total)}</b><span class="ty">${chars} 字 · ${d.parts.length} 段 · 按每秒约 4.5 个字估</span></div><div class="sp"></div>
      <button class="btn" id="prmbig">${I('maximize')}<span>大字提词</span></button><button class="btn" id="prmtable">${I('table-2')}<span>复制分镜表</span></button><button class="btn pri" id="prmsay">${I('clipboard-copy')}<span>复制口播稿</span></button></div>
    <div class="prm-list">${d.parts.map((x, i) => `<section class="prm-seg"><div class="prm-t"><i>${String(i + 1).padStart(2, '0')}</i><b>${esc(x.title)}</b><em>${x.say.length ? `约 ${fmtSec(secOf(x))}` : '没有口播'}</em></div>
      ${x.say.map(t => `<p class="prm-say">${esc(t)}</p>`).join('')}${x.shot.length ? `<div class="prm-shot">${I('image')}<span>${x.shot.map(esc).join('<br>')}</span></div>` : ''}</section>`).join('')}</div>
    ${d.extra.map((x, i) => `<section class="prm-x"><div class="prm-t"><b>${esc(x.title)}</b><span class="sp"></span><button class="tbtn" data-xcopy="${i}">${I('copy')}复制</button></div><ul>${x.lines.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('')}
  </div>`;
  $('#prmsay').onclick = () => copy(sayAll, '口播稿已复制');
  $('#prmtable').onclick = () => copy(table, '分镜表已复制');
  $$('[data-xcopy]', el).forEach(b => b.onclick = () => copy(d.extra[+b.dataset.xcopy].lines.join('\n')));
  // 大字提词：全屏黑底大字，只显示要说的话，方向键或点击翻段
  $('#prmbig').onclick = () => {
    const say = d.parts.filter(x => x.say.length); let i = 0;
    const box = document.createElement('div'); box.className = 'prm-full';
    const draw = () => { box.innerHTML = `<div class="prm-fh"><span>${i + 1} / ${say.length}　${esc(say[i].title)}</span><span class="sp"></span><span>← → 翻段　Esc 退出</span></div><div class="prm-ft">${say[i].say.map(t => `<p>${esc(t)}</p>`).join('')}</div>`; };
    const close = () => { box.remove(); removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape') close(); else if (['ArrowRight', 'ArrowDown', ' ', 'Enter'].includes(e.key)) { i = Math.min(say.length - 1, i + 1); draw(); } else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { i = Math.max(0, i - 1); draw(); } else return; e.preventDefault(); e.stopPropagation(); };
    box.onclick = e => { if (e.clientX < innerWidth / 3) i = Math.max(0, i - 1); else if (i < say.length - 1) i++; else return close(); draw(); };
    addEventListener('keydown', key, true); document.body.append(box); draw();
  };
}

async function publishTab(el, p) {
  S.pf ||= 'wechat';
  el.innerHTML = '<div class="empty-state">载入中…</div>';
  const [info, read, xr] = await Promise.all([SAPI(p, 'publish'), api('GET', `/api/projects/${enc(p.id)}/read?v=wechat`), S.pf === 'x' ? api('POST', `/api/projects/${enc(p.id)}/xpost`, {}).catch(() => null) : null]);
  const w = info.wechat, x = info.x, ok = b => b ? I('circle-check', 'ok') : I('triangle-alert', 'no');
  const ratio = s => s ? (s[0] / s[1]).toFixed(2) : '';
  const done = p.published.filter(r => r.platform === (S.pf === 'x' ? 'X' : '公众号'));
  el.innerHTML = `
    ${info.stale && S.pf !== 'x' ? `<div class="stale">文章改过了，下面还是上次构建的版本。发布前先重新构建。<button class="btn pri" data-run="build">${I('hammer')}重新构建</button></div>` : ''}
    ${!info.built ? `<div class="stale">还没构建过，先构建出公众号版和 X 版。<button class="btn pri" data-run="build">${I('hammer')}构建</button></div>` : ''}
    <div class="pubwrap">
      <div class="pubpv"><div class="seg" id="pf"><button data-f="wechat" class="${S.pf === 'wechat' ? 'on' : ''}">${I('newspaper')}公众号</button><button data-f="x" class="${S.pf === 'x' ? 'on' : ''}">${I('at-sign')}X 长文</button></div>
        <div class="wxbg"><article class="wx w-phone">${S.pf === 'wechat' ? `<h1 class="wx-t">${esc(w.title)}</h1><div class="wx-m"><span class="wx-a">${esc(w.author)}</span><span>${todayStr()}</span></div>` : `<h1 class="wx-t x">${esc(x.title)}</h1>`}<div id="pvbody"></div></article></div></div>
      <div class="publist">
        <div class="pl-h"><b>${I('list-checks')}发到${S.pf === 'x' ? ' X' : '公众号'}，按顺序做</b>${done.length ? `<span class="st st3">已发布 ${esc(done[0].date)}</span>` : ''}</div>
        ${S.pf === 'wechat' ? `
        <div class="pli">${ok(w.titleLen <= 64)}<div><b>标题</b><span class="ty">${w.titleLen} 字，公众号上限 64</span><div class="pv">${esc(w.title)}</div></div><button class="btn" data-copy-t="${esc(w.title)}">${I('copy')}复制</button></div>
        <div class="pli">${ok(true)}<div><b>作者</b><div class="pv">${esc(w.author)}</div></div><button class="btn" data-copy-t="${esc(w.author)}">${I('copy')}复制</button></div>
        <div class="pli">${ok(w.summaryLen > 0 && w.summaryLen <= 120)}<div style="flex:1"><b>摘要</b><span class="ty" id="sumlen">${w.summaryLen} 字，上限 120</span><textarea id="sum" rows="3">${esc(w.summary)}</textarea></div><button class="btn" id="sumcp">${I('copy')}复制</button></div>
        <div class="pli">${ok(w.cover && Math.abs(ratio(w.coverSize) - 2.35) < 0.05)}<div><b>封面</b><span class="ty">${w.cover ? `${w.coverSize?.join('×')}，比例 ${ratio(w.coverSize)}（要求 2.35:1）` : '还没有封面'}</span>${w.cover ? `<img class="cov" src="${fileUrl(p, w.cover)}?v=${Date.now()}">` : ''}</div>${w.cover ? `<a class="btn" href="${fileUrl(p, w.cover)}" download>${I('download')}下载</a>` : ''}</div>
        <div class="pli">${ok(info.built && !info.stale)}<div><b>正文</b><span class="ty">带格式复制，图片一起嵌进去，粘进公众号编辑器。有图没传上去，就用下面的配图包补</span></div><button class="btn acc" id="cpbody">${I('clipboard-copy')}复制正文</button></div>
        <div class="pli">${ok(w.images.length)}<div><b>配图</b><span class="ty">${w.images.length} 张，按文中顺序编号</span></div>${w.images.length ? `<a class="btn" href="/api/projects/${enc(p.id)}/studio/images?platform=wechat" download>${I('download')}下载配图包</a>` : ''}</div>` : `
        <div class="pli">${ok(true)}<div><b>标题</b><span class="ty">${x.titleLen} 字</span><div class="pv">${esc(x.title)}</div></div><button class="btn" data-copy-t="${esc(x.title)}">${I('copy')}复制</button></div>
        <div class="pli">${ok(x.cover && Math.abs(ratio(x.coverSize) - 2.5) < 0.06)}<div><b>封面</b><span class="ty">${x.cover ? `${x.coverSize?.join('×')}，比例 ${ratio(x.coverSize)}（要求 5:2）` : '还没有封面'}</span>${x.cover ? `<img class="cov" src="${fileUrl(p, x.cover)}?v=${Date.now()}">` : ''}</div>${x.cover ? `<a class="btn" href="${fileUrl(p, x.cover)}" download>${I('download')}下载</a>` : ''}</div>
        <div class="pli">${ok(!!xr)}<div><b>正文</b><span class="ty">已按 X 长文的格式转好（左边就是粘贴后的样子）。复制后会一步步给你标题、封面和每张插图</span></div><button class="btn acc" id="cpbody">${I('clipboard-copy')}复制正文</button></div>
        <div class="pli">${ok(xr?.images.length)}<div><b>配图</b><span class="ty">${xr ? `${xr.images.length} 张，文件名的序号和正文里「【插图 NN】」一致${xr.images.some(i => i.kind === '表') ? `；X 不支持表格，${xr.images.filter(i => i.kind === '表').length} 张表已转成图片` : ''}` : '没整理出来'}</span></div>${xr?.images.length ? `<button class="btn" id="xfolder">${I('folder-open')}打开图片文件夹</button>` : ''}</div>`}
        <div class="pli last">${I('badge-check', 'ok')}<div><b>发完记一笔</b><span class="ty">记下链接，状态自动改成「已发布」，日历上也能看到</span><input id="puburl" placeholder="发布后的链接（可不填）"></div><button class="btn pri" id="pubdone">${I('badge-check')}标记已发布</button></div>
      </div></div>`;
  const host = $('#pvbody'), root = host.attachShadow({ mode: 'open' });
  const body = read.built ? read.html : `<section class="article">${read.html}</section>`;
  if (S.pf === 'x' && xr) { root.innerHTML = xPreviewHtml(p, xr); host.closest('.wx')?.classList.add('xart'); host.closest('.wx')?.querySelector('.wx-t')?.remove(); }
  else root.innerHTML = `${read.css ? `<link rel="stylesheet" href="${read.css}">` : ''}<style>:host{display:block;background:#fff;color:#1f1f1d;color-scheme:light}img{max-width:100%;height:auto}</style>${body}`;
  $('#xfolder') && ($('#xfolder').onclick = () => api('POST', `/api/projects/${enc(p.id)}/xpost`, { open: true }));
  $('#pf').onclick = e => { const f = e.target.closest('[data-f]')?.dataset.f; if (f && f !== S.pf) { S.pf = f; publishTab(el, p); } };
  $$('[data-copy-t]', el).forEach(b => b.onclick = () => copy(b.dataset.copyT));
  const sum = $('#sum'); if (sum) { let t; sum.oninput = () => { $('#sumlen').textContent = `${[...sum.value].length} 字，上限 120`; clearTimeout(t); t = setTimeout(() => SAPI(p, 'publish', 'PUT', { summary: sum.value }), 600); }; $('#sumcp').onclick = () => copy(sum.value); }
  $('#cpbody').onclick = async () => {
    if (S.pf === 'x') return copyX(p, $('#cpbody'));
    const b = $('#cpbody'); b.innerHTML = `${I('loader-circle', 'spinning')}准备中`;
    try {
      // 图片转成内嵌数据，粘到平台编辑器时不依赖本机地址
      const tmp = document.createElement('div'); tmp.innerHTML = body;
      if (S.pf === 'wechat') for (const img of tmp.querySelectorAll('img')) {
        try { const bl = await (await fetch(img.src)).blob(); img.src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(bl); }); } catch {}
      }
      const html = tmp.innerHTML;
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([tmp.textContent], { type: 'text/plain' }) })]);
      toast(`已复制，去${S.pf === 'x' ? ' X' : '公众号'}编辑器里粘贴`);
    } catch (e) { toast('浏览器不让复制：' + e.message, true); }
    b.innerHTML = `${I('clipboard-copy')}复制正文`;
  };
  $('#pubdone').onclick = () => patch(p.id, { addPublish: { platform: S.pf === 'x' ? 'X' : '公众号', url: $('#puburl').value.trim(), date: todayStr() } }).then(() => renderProject(p.id, 'publish'));
}

/* ---------- ① 资料 ---------- */
async function researchTab(el, p) {
  const [list, prov] = await Promise.all([SAPI(p, 'research'), aiProviders()]);
  el.innerHTML = `<div class="rs">
    <div class="rs-ask"><textarea id="rq" rows="2" placeholder="要查什么？比如：WorkBuddy 10 月公布的企业客户数据；豆包工作的最新定价"></textarea>
      <div class="row">${provSelect(prov, 'rprov')}<span class="ty">AI 会联网查，每条结论后面带来源链接。Hermes 一次约半分钟</span><div class="sp"></div><button class="btn" id="rnote">${I('plus')}手动记一条</button><button class="btn acc" id="rgo">${I('globe')}联网查</button></div></div>
    <div id="rlist">${list.length ? '' : '<div class="empty-state">还没有资料。写之前先查清楚数字和说法，写的时候 AI 助手会参考这里的内容</div>'}</div></div>`;
  const getProv = bindProv($('#rprov'));
  const TIER = { '官方一手': 't1', '社区一手': 't2', '报道': 't3', '转述': 't4' };
  const card = r => `<div class="rcard" data-id="${r.id}"><div class="rc-h">${r.tier ? `<em class="rtier ${TIER[r.tier] || ''}">${esc(r.tier)}</em>` : ''}<b>${esc(r.q)}</b><span class="ty">${fmtTime(r.t)}${r.by === 'agent' ? ' · AI 助手查的' : r.web ? ' · 联网' : ' · 手动'}</span><div class="sp"></div>
      <button class="tbtn" data-use="${r.id}" data-tip="带着这条资料去和 AI 助手说">${I('sparkles')}让 AI 用这条</button><button class="tbtn" data-cp="${r.id}">${I('copy')}复制</button><button class="icb sm" data-del="${r.id}" data-tip="删除">${I('trash-2')}</button></div>
    <div class="md">${mdToHtml(r.answer)}</div>${r.quote ? `<blockquote class="rquote">${esc(r.quote)}</blockquote>` : ''}
    ${r.sources?.length ? `<div class="rsrc">${r.sources.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, '').slice(0, 60))}</a>`).join('')}</div>` : ''}</div>`;
  const draw = l => { $('#rlist').innerHTML = l.length ? l.map(card).join('') : '<div class="empty-state">还没有资料</div>'; bind(l); };
  const bind = l => {
    $$('[data-del]', el).forEach(b => b.onclick = async () => { await SAPI(p, 'research', 'DELETE', { id: b.dataset.del }); draw(await SAPI(p, 'research')); });
    $$('[data-cp]', el).forEach(b => b.onclick = () => { const r = l.find(x => x.id === b.dataset.cp); copy(r.answer); });
    $$('[data-use]', el).forEach(b => b.onclick = () => { const r = l.find(x => x.id === b.dataset.use); S.chatDraft = `参考资料「${r.q}」里的内容，把文章里相关的地方核对、补充一下，数字以资料为准，标出来源。`; goTab(p, 'write'); });
  };
  bind(list); if (list.length) draw(list);
  $('#rgo').onclick = async () => {
    const q = $('#rq').value.trim(); if (!q) return $('#rq').focus();
    const b = $('#rgo'), t0 = Date.now(); b.disabled = true; const tk = setInterval(() => b.innerHTML = `${I('loader-circle', 'spinning')}查找中 ${((Date.now() - t0) / 1000) | 0} 秒`, 500);
    try { await SAPI(p, 'research', 'POST', { q, provider: getProv() }); $('#rq').value = ''; draw(await SAPI(p, 'research')); toast('查好了'); } catch (e) { toast(e.message, true); }
    clearInterval(tk); b.disabled = false; b.innerHTML = `${I('globe')}联网查`;
  };
  $('#rq').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#rgo').click(); };
  $('#rnote').onclick = async () => {
    const q = $('#rq').value.trim() || '手动记录'; const a = prompt('记下内容（可以贴一段原文或数据）'); if (!a) return;
    const u = prompt('来源链接（可不填）') || '';
    await SAPI(p, 'research', 'POST', { manual: true, q, answer: a, sources: u ? [u] : [] }); $('#rq').value = ''; draw(await SAPI(p, 'research'));
  };
}

/* ====================================================================
   选题广场：各信息源的最新动态（按可信度和热度排）+ AI 挑选题
   ==================================================================== */
const TIER_CLS = { A: 'ta', B: 'tb', C: 'tc', D: 'td' };
const TIER_SHORT = { A: '官方', B: '社区', C: '报道', D: '转述' };
const tierTag = t => `<span class="tier ${TIER_CLS[t]}">${TIER_SHORT[t]}</span>`;
const bigNum = n => n >= 1e8 ? (n / 1e8).toFixed(1) + ' 亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + ' 万' : String(n);
const heatTxt = h => !h ? '' : [h.views ? `${I('play')}${bigNum(h.views)}` : '', h.points ? `${I('arrow-up')}${h.points}` : '', h.comments ? `${I('message-square')}${h.comments}` : '', h.stars ? `${I('star')}本周 +${h.stars.toLocaleString()}` : ''].filter(Boolean).join(' ');
async function renderPlaza() {
  S.pz ||= { days: 7, tiers: ['A', 'B', 'C', 'D'], source: '', q: '', starred: false };
  const f = S.pz; f.cat ??= ''; f.sort ??= 'score';
  main.onclick = null;
  main.innerHTML = `
    <div class="top"><div class="crumb"><b>选题广场</b></div><div class="sp"></div><span class="ty" id="pzdg"></span><span class="ty" id="pzupd"></span>
      <button class="btn" id="pzref">${I('refresh-cw')}刷新信息源</button><button class="icb" id="pzsrc" data-tip="信息源和分级">${I('sliders-horizontal')}</button></div>
    <div class="pz">
      <section class="pz-feed">
        <div class="pz-cats" id="pzcats"></div>
        <div class="pz-bar">
          <div class="tierchips" id="pztiers">${['A', 'B', 'C', 'D'].map(t => `<button data-t="${t}" class="${f.tiers.includes(t) ? 'on' : ''}">${tierTag(t)}<span id="tc${t}"></span></button>`).join('')}</div>
          <div class="seg sm" id="pzdays">${[[1, '24 小时'], [3, '3 天'], [7, '7 天'], [14, '14 天']].map(([d, n]) => `<button data-d="${d}" class="${f.days === d ? 'on' : ''}">${n}</button>`).join('')}</div>
          <div class="seg sm" id="pzsort">${[['score', '综合'], ['new', '最新'], ['hot', '最热']].map(([k, n]) => `<button data-s="${k}" class="${f.sort === k ? 'on' : ''}">${n}</button>`).join('')}</div>
          <select id="pzsrcsel" class="pz-sel"></select>
          <div class="pz-q">${I('search')}<input id="pzq" placeholder="搜标题、要点" value="${esc(f.q)}"></div>
          <button class="icb${f.starred ? ' on' : ''}" id="pzstar" data-tip="只看收藏">${I('bookmark')}</button>
        </div>
        <div id="pzlist" class="pz-list"><div class="empty-state">载入中…</div></div>
      </section>
      <aside class="pz-ai">
        <div class="pa-top">
          <div class="pa-h">${I('sparkles')}<b>AI 选题</b><span class="ty" id="pzmeta"></span></div>
          <div class="pa-ask"><input id="pzdir" placeholder="关注什么方向？可不填，比如 Agent 收费"><button class="btn acc" id="pzgo">${I('sparkles')}挑选题</button></div>
          <div class="pa-tabs" id="pzgtabs"></div>
        </div>
        <div id="pzideas"></div>
      </aside>
    </div>`;
  // 分类：AI 写过要点的用 AI 分的类，还没写的先按标题里的词猜
  const GUESS = { chat: '模型发布', model: '模型发布', code: '编程开发', agent: 'Agent', opensource: '开源项目', money: '融资商业', chip: '芯片硬件', robot: '芯片硬件', mobile: '产品更新', search: '产品更新', image: '多模态', voice: '多模态', research: '研究论文', people: '公司人事', policy: '政策监管', security: '安全隐私', abstract: '其他' };
  const catOf = it => it.zh?.cat || GUESS[themeOf(`${it.title} ${it.summary || ''}`)] || '其他';
  const hotOf = it => { const h = it.heat || {}; return (h.points || 0) + (h.comments || 0) / 2 + (h.stars || 0) / 40 + (h.likes || 0) / 20 + (h.reposts || 0) / 5; };
  const tOf = it => it.zh?.t || it.title;
  let all = [], shown = [];
  const filtered = () => {
    const k = f.q.toLowerCase();
    // f.cat 平时是分类名；「#gap」只看中文圈还没人讲的，「#video」只看视频平台上的
    const inCat = it => !f.cat || (f.cat === '#gap' ? !!it.gap : f.cat === '#video' ? !!it.video : catOf(it) === f.cat);
    let l = all.filter(it => f.tiers.includes(it.tier) && (!f.source || it.source === f.source) && inCat(it)
      && (!k || `${it.title} ${it.summary || ''} ${it.zh?.t || ''} ${it.zh?.one || ''}`.toLowerCase().includes(k)));
    if (f.sort === 'new') l = l.sort((a, b) => Date.parse(b.time || b.firstSeen) - Date.parse(a.time || a.firstSeen));
    if (f.sort === 'hot') l = l.sort((a, b) => hotOf(b) - hotOf(a));
    return l;
  };
  const card = it => {
    const c = catOf(it), one = it.zh?.one || it.summary || '';
    return `<div class="pzc" data-open="${it.id}" tabindex="0">
      <div class="pzc-img${it.img ? '' : ' noimg'}">${cover({ ...it, title: tOf(it) })}${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('noimg');this.remove()">` : ''}<span class="pzc-cat">${esc(c)}</span></div>
      <div class="pzc-b">
        <div class="pzc-m">${tierTag(it.tier)}<span class="src">${esc(it.sourceName)}</span><span class="tm">${ago(it.time || it.firstSeen)}</span></div>
        <div class="pzc-t">${esc(tOf(it))}</div>
        ${one ? `<div class="pzc-s">${esc(one)}</div>` : ''}
        ${it.gap ? `<div class="pzc-gap" data-tip="海外在讲，工作台接的中文来源里近两周没人提">${I('globe')}中文圈还没人讲${it.gapWhy ? `：${esc(it.gapWhy)}` : ''}</div>` : ''}
        <div class="pzc-f">${it.heat ? `<span class="heat">${heatTxt(it.heat)}</span>` : ''}${it.brief ? `<span class="pzc-done">${I('check')}已整理</span>` : ''}<div class="sp"></div><button class="icb sm${it.starred ? ' on' : ''}" data-star="${it.id}" data-tip="${it.starred ? '取消收藏' : '收藏'}">${I('bookmark')}</button></div>
      </div></div>`;
  };
  const draw = () => {
    const base = all.filter(it => f.tiers.includes(it.tier) && (!f.source || it.source === f.source));
    const cnt = {}; base.forEach(it => { const c = catOf(it); cnt[c] = (cnt[c] || 0) + 1; });
    const cats = (S.pzData.cats || []).filter(c => cnt[c]);
    const nGap = base.filter(it => it.gap).length, nVid = base.filter(it => it.video).length;
    cnt['#gap'] = nGap; cnt['#video'] = nVid;
    if (f.cat && !cnt[f.cat]) f.cat = '';
    $('#pzcats').innerHTML = `<button data-c="" class="${!f.cat ? 'on' : ''}">全部<em>${base.length}</em></button>
      ${nGap ? `<button data-c="#gap" class="sp${f.cat === '#gap' ? ' on' : ''}" data-tip="海外在讲、中文来源里近两周没人提的">${I('globe')}信息差<em>${nGap}</em></button>` : ''}${nVid ? `<button data-c="#video" class="sp${f.cat === '#video' ? ' on' : ''}" data-tip="YouTube、B 站上和 AI 有关的视频，看什么题目有人看">${I('clapperboard')}视频<em>${nVid}</em></button>` : ''}${cats.map(c => `<button data-c="${esc(c)}" class="${f.cat === c ? 'on' : ''}">${esc(c)}<em>${cnt[c]}</em></button>`).join('')}`;
    ['A', 'B', 'C', 'D'].forEach(t => { const el = $('#tc' + t); if (el) el.textContent = all.filter(x => x.tier === t).length; });
    shown = filtered();
    $('#pzlist').innerHTML = shown.length ? `<div class="pzgrid">${shown.map(card).join('')}</div>`
      : `<div class="empty-state">${S.pzData.updated ? '这个范围里没有动态，换个分类或筛选试试' : '还没有素材。点右上角「刷新信息源」，大约 20 秒'}</div>`;
  };
  const drawDigest = d => {
    const el = $('#pzdg'); if (!el || !d) return;
    el.innerHTML = d.running ? `${I('loader-circle', 'spinning')}AI 在写中文要点 ${d.done}/${d.total}` : d.error && d.done < d.total ? `<span title="${esc(d.error)}">中文要点没写完</span>` : '';
  };
  let dgTimer = null;
  const watchDigest = () => {
    clearInterval(dgTimer);
    dgTimer = setInterval(async () => {
      if (!document.body.contains($('#pzlist') || document.createElement('i'))) return clearInterval(dgTimer);
      const d = await api('GET', '/api/plaza/digest').catch(() => null); drawDigest(d);
      if (!d?.running) { clearInterval(dgTimer); }
      const y = $('#pzlist').scrollTop; await load(true); $('#pzlist').scrollTop = y;
    }, 12000);
  };
  const load = async quiet => {
    const d = await api('GET', '/api/plaza/items?' + new URLSearchParams({ days: f.days, starred: f.starred ? '1' : '' }));
    S.pzData = d; all = d.items;
    $('#pzupd').textContent = d.updated ? `更新于 ${ago(d.updated)}` : '还没抓过';
    const srcs = d.sources.filter(s => all.some(x => x.source === s.id));
    $('#pzsrcsel').innerHTML = `<option value="">全部来源</option>${srcs.map(s => `<option value="${s.id}" ${f.source === s.id ? 'selected' : ''}>${esc(s.name)}（${all.filter(x => x.source === s.id).length}）</option>`).join('')}`;
    draw(); drawDigest(d.digest);
    if (quiet) return;
    if (d.digest?.running) watchDigest();
    else if (all.some(x => !x.zh) && !d.digest?.error) { const r = await api('POST', '/api/plaza/digest', { provider: S.aiDefault }).catch(() => null); if (r) { drawDigest(r); watchDigest(); } }
    if (!d.updated || Date.now() - Date.parse(d.updated) > 3 * 3600000) refresh(true);
  };
  const refresh = async auto => {
    const b = $('#pzref'); if (!b || b.disabled) return; b.disabled = true; b.innerHTML = `${I('loader-circle', 'spinning')}抓取中…`;
    try { const r = await api('POST', '/api/plaza/refresh'); const bad = Object.values(r.status).filter(x => !x.ok).length; if (!auto || r.added) toast(`新增 ${r.added} 条${bad ? `，${bad} 个源这次没拉到` : ''}`); await load(true); watchDigest(); }
    catch (e) { toast(e.message, true); }
    if ($('#pzref')) { b.disabled = false; b.innerHTML = `${I('refresh-cw')}刷新信息源`; }
  };
  $('#pzref').onclick = () => refresh(false);
  $('#pzcats').onclick = e => { const c = e.target.closest('[data-c]'); if (!c) return; f.cat = c.dataset.c; draw(); $('#pzlist').scrollTop = 0; };
  $('#pztiers').onclick = e => { const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return; f.tiers = f.tiers.includes(t) ? f.tiers.filter(x => x !== t) : [...f.tiers, t]; if (!f.tiers.length) f.tiers = [t]; $$('#pztiers button').forEach(b => b.classList.toggle('on', f.tiers.includes(b.dataset.t))); draw(); };
  $('#pzdays').onclick = e => { const d = +e.target.closest('[data-d]')?.dataset.d; if (!d) return; f.days = d; $$('#pzdays button').forEach(b => b.classList.toggle('on', +b.dataset.d === d)); load(true); };
  $('#pzsort').onclick = e => { const k = e.target.closest('[data-s]')?.dataset.s; if (!k) return; f.sort = k; $$('#pzsort button').forEach(b => b.classList.toggle('on', b.dataset.s === k)); draw(); $('#pzlist').scrollTop = 0; };
  $('#pzsrcsel').onchange = e => { f.source = e.target.value; draw(); };
  let qt; $('#pzq').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value.trim(); draw(); }, 200); };
  $('#pzstar').onclick = () => { f.starred = !f.starred; $('#pzstar').classList.toggle('on', f.starred); load(true); };
  $('#pzsrc').onclick = () => sourcesDlg();
  const toggleStar = async (it, btn) => { it.starred = !it.starred; $$(`[data-star="${it.id}"]`).forEach(b => b.classList.toggle('on', it.starred)); await api('POST', '/api/plaza/star', { id: it.id, on: it.starred }); };
  $('#pzlist').onclick = e => {
    const s = e.target.closest('[data-star]'); if (s) { e.stopPropagation(); return toggleStar(all.find(x => x.id === s.dataset.star), s); }
    const c = e.target.closest('[data-open]'); if (c) pzDetail(c.dataset.open);
  };
  $('#pzlist').onkeydown = e => { const c = e.target.closest('[data-open]'); if (c && e.key === 'Enter') pzDetail(c.dataset.open); };

  // 点开一条：右边滑出详情，AI 读原文说清这条讲了什么；← → 切换上一条下一条
  function pzDetail(id, ref) {
    const i = shown.findIndex(x => x.id === id), it = shown[i] || all.find(x => x.id === id) || (ref && { ...ref, title: ref.title, firstSeen: new Date().toISOString() }); if (!it) return;
    $$('.pzc.cur').forEach(x => x.classList.remove('cur')); const cel = $(`.pzc[data-open="${CSS.escape(id)}"]`); cel?.classList.add('cur'); cel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    let host = $('#pzd'); if (!host) { document.body.insertAdjacentHTML('beforeend', '<div id="pzd" class="pzd-wrap"><div class="pzd-mask"></div><aside class="pzd"></aside></div>'); host = $('#pzd'); }
    host.dataset.id = id; host.classList.add('open');
    const box = host.querySelector('.pzd'), b = it.brief;
    const sec = (ic, t, body) => `<section class="pzd-sec"><h4>${I(ic)}${t}</h4>${body}</section>`;
    const briefHtml = b => `${sec('list-checks', '这篇讲了什么', `<ul class="pzd-pts">${b.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`)}
      ${b.numbers?.length ? sec('hash', '关键数字', `<div class="pzd-nums">${b.numbers.map(x => `<span>${esc(x)}</span>`).join('')}</div>`) : ''}
      ${b.angle ? sec('lightbulb', '可以怎么写', `<p>${esc(b.angle)}</p>${b.who ? `<p class="ty">谁最该关心：${esc(b.who)}</p>` : ''}`) : ''}
      <div class="pzd-via ty">${esc(b.via || '')}读到原文后整理 · ${fmtTime(b.at)}<button class="lnk" data-rebrief>${I('refresh-cw')}重新整理</button></div>`;
    box.innerHTML = `<div class="pzd-h">${tierTag(it.tier)}<span class="src">${esc(it.sourceName)}</span><span class="ty">${it.time ? ago(it.time) : '首次发现 ' + ago(it.firstSeen)}</span><div class="sp"></div>
        ${i < 0 ? '' : `<button class="icb sm" data-nav="-1" data-tip="上一条 ←" ${i <= 0 ? 'disabled' : ''}>${I('chevron-left')}</button><span class="ty">${i + 1}/${shown.length}</span><button class="icb sm" data-nav="1" data-tip="下一条 →" ${i >= shown.length - 1 ? 'disabled' : ''}>${I('chevron-right')}</button>`}
        <button class="icb sm" data-close-d data-tip="关闭 Esc">${I('x')}</button></div>
      <div class="pzd-body">
        <div class="pzd-hero${it.img ? '' : ' noimg'}">${cover({ ...it, title: tOf(it) })}${it.img ? `<img src="${esc(it.img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
        <span class="pzd-cat">${esc(catOf(it))}</span>
        <h2>${esc(b?.t || tOf(it))}</h2>
        ${(b?.t || it.zh) ? `<a class="pzd-orig" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}${I('external-link')}</a>` : ''}
        <div class="pzd-meta">${it.heat ? `<span class="heat">${heatTxt(it.heat)}</span>` : ''}${it.discuss && it.discuss !== it.url ? `<a href="${esc(it.discuss)}" target="_blank" rel="noopener">${I('message-square')}看讨论</a>` : ''}</div>
        ${(b?.one || it.zh?.one) ? `<div class="pzd-one">${esc(b?.one || it.zh.one)}</div>` : ''}
        <div id="pzdb">${b ? briefHtml(b) : `<div class="pzd-load">${I('loader-circle', 'spinning')}<span>AI 正在读原文、整理要点，大约 20 秒</span></div>${it.summary ? sec('file-text', '原文摘要', `<p class="ty">${esc(it.summary)}</p>`) : ''}`}</div>
      </div>
      <div class="pzd-f"><a class="btn" href="${esc(it.url)}" target="_blank" rel="noopener">${I('external-link')}打开原网页</a><button class="btn" data-full>${I('file-search')}读原文全文</button><button class="icb${it.starred ? ' on' : ''}" data-star="${it.id}" data-tip="收藏">${I('bookmark')}</button><div class="sp"></div><button class="btn pri" data-make>${I('plus')}用它新建</button></div>`;
    const close = () => { host.classList.remove('open'); $$('.pzc.cur').forEach(x => x.classList.remove('cur')); document.removeEventListener('keydown', key); };
    const nav = d => { const n = i < 0 ? null : shown[i + d]; if (n) { document.removeEventListener('keydown', key); pzDetail(n.id); } };
    const key = e => { if (e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight' || e.key === 'j') nav(1); if (e.key === 'ArrowLeft' || e.key === 'k') nav(-1); };
    document.removeEventListener('keydown', S.pzdKey || (() => {})); S.pzdKey = key; document.addEventListener('keydown', key);
    host.querySelector('.pzd-mask').onclick = close;
    box.onclick = async e => {
      if (e.target.closest('[data-close-d]')) return close();
      const nv = e.target.closest('[data-nav]'); if (nv) return nav(+nv.dataset.nav);
      const st = e.target.closest('[data-star]'); if (st) { toggleStar(it); st.classList.toggle('on', it.starred); return; }
      if (e.target.closest('[data-full]')) return readDlg(it);
      if (e.target.closest('[data-rebrief]')) return getBrief(true);
      if (e.target.closest('[data-make]')) {
        const bb = it.brief;
        openNew('article', { title: bb?.t || tOf(it), angle: bb?.angle || '', why: bb?.one || it.zh?.one || '', form: 'article',
          brief: bb ? `${bb.points.map(x => '- ' + x).join('\n')}${bb.numbers?.length ? '\n\n关键数字：\n' + bb.numbers.map(x => '- ' + x).join('\n') : ''}` : '',
          evidence: [{ id: it.id, title: it.title, url: it.url, tier: it.tier, sourceName: it.sourceName, discuss: it.discuss }] });
      }
    };
    const getBrief = async force => {
      if (force) $('#pzdb').innerHTML = `<div class="pzd-load">${I('loader-circle', 'spinning')}<span>AI 正在重新读原文、整理要点</span></div>`;
      try {
        const r = await api('POST', '/api/plaza/brief', { id: it.id, provider: S.aiDefault, force });
        it.brief = r; it.zh = { ...(it.zh || {}), t: r.t || it.zh?.t, one: r.one || it.zh?.one };
        if ($('#pzd')?.dataset.id !== it.id) return;
        $('#pzdb').innerHTML = briefHtml(r);
        if (r.t) box.querySelector('h2').textContent = r.t;
        const c = $(`.pzc[data-open="${CSS.escape(it.id)}"]`); if (c) c.outerHTML = card(it);
        $(`.pzc[data-open="${CSS.escape(it.id)}"]`)?.classList.add('cur');
      } catch (err) {
        // 服务还是旧版（没有这个接口）：说清楚原因，别只显示 not found
        const msg = /not found|404/i.test(err.message) ? '工作台服务还没更新到新版，暂时整理不了要点。重启工作台服务后就能用（有文章的 AI 正在跑时先别重启，跑完再说）。' : err.message;
        if ($('#pzd')?.dataset.id === it.id) $('#pzdb').innerHTML = `<div class="aierr">${esc(msg)}</div>${it.summary ? `<p class="ty">${esc(it.summary)}</p>` : ''}`; }
    };
    if (!b) getBrief(false);
  }
  S.pzLoad = load;

  // AI 选题：适合发文章 / 适合做视频 / 适合发短评 / 适合写的项目
  const GROUPS = [['items', '适合发文章', 'file-text'], ['videos', '适合做视频', 'clapperboard'], ['takes', '适合发短评', 'message-square'], ['projects', '适合写的项目', 'puzzle']];
  let grp = lsGet('wb.pzg', 'items'); if (!GROUPS.some(g => g[0] === grp)) grp = 'items';
  const srcChips = ev => { const by = {}; ev.forEach(e => { const k = e.tier + '|' + e.sourceName; by[k] = (by[k] || 0) + 1; }); return Object.entries(by).map(([k, n]) => { const [t, nm] = k.split('|'); return `<span class="pa-src">${tierTag(t)}${esc(nm)}${n > 1 ? `<em>×${n}</em>` : ''}</span>`; }).join(''); };
  const thumb = it => `<span class="pa-th${it.img ? '' : ' noimg'}">${cover({ ...it, title: '' })}${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
  const artCard = (x, i) => `<div class="pa-card">
      <div class="pa-t"><span class="pa-n">${i + 1}</span><b>${esc(x.title)}</b></div>
      <div class="pa-a">${esc(x.angle)}</div>
      <div class="pa-srcs">${srcChips(x.evidence)}</div>
      <details class="pa-more"><summary>为什么现在写 · ${x.evidence.length} 条依据</summary>
        ${x.why ? `<p>${esc(x.why)}</p>` : ''}${x.hook ? `<p class="ty">开头可以用：${esc(x.hook)}</p>` : ''}
        <div class="pa-evl">${x.evidence.map(e => `<button data-item="${e.id}" data-g="items" data-i="${i}">${tierTag(e.tier)}<span>${esc(e.sourceName)}</span><em>${esc(e.title)}</em></button>`).join('')}</div></details>
      ${x.brief ? `<details class="tcd-b"><summary>${I('book-open')}写作简报</summary><div class="md">${mdToHtml(x.brief)}</div></details>` : ''}
      <div class="pa-f"><button class="tbtn" data-deep="${i}">${x.brief ? I('refresh-cw') + '重新深挖' : I('scan-text') + '深挖简报'}</button><div class="sp"></div><button class="btn pri sm" data-make="${i}">${I('plus')}用它新建</button></div></div>`;
  // 视频选题：参考的视频带播放量，海外才有的带「信息差」标记；点「新建视频脚本」把角度和开头带过去
  const vidCard = (x, i) => `<div class="pa-card">
      <div class="pa-t"><span class="pa-n">${i + 1}</span><b>${esc(x.title)}</b>${x.gap ? `<span class="pa-gap">${I('globe')}信息差</span>` : ''}</div>
      <div class="pa-a">${esc(x.angle)}</div>
      ${x.hook ? `<div class="pa-hook">${I('mic')}开头：${esc(x.hook)}</div>` : ''}
      <details class="pa-more" open><summary>为什么现在做 · ${x.evidence.length} 条依据</summary>
        ${x.why ? `<p>${esc(x.why)}</p>` : ''}
        <div class="pa-evl">${x.evidence.map(e => `<button data-item="${e.id}" data-g="videos" data-i="${i}">${tierTag(e.tier)}<span>${esc(e.sourceName)}</span><em>${e.video ? `${I('play')}${e.views ? bigNum(e.views) + ' ' : ''}` : ''}${esc(e.title)}</em></button>`).join('')}</div></details>
      <div class="pa-f"><span class="pa-form">适合做科普短视频</span><div class="sp"></div><button class="btn pri sm" data-mkv="${i}">${I('plus')}新建视频脚本</button></div></div>`;
  const takeCard = (x, i) => `<div class="pa-card">
      <button class="pa-ref" data-item="${x.item.id}" data-g="takes" data-i="${i}">${x.tag ? `<span class="pa-tag">${esc(x.tag)}</span>` : ''}${tierTag(x.item.tier)}<em>${esc(x.item.title)}</em>${I('chevron-right')}</button>
      <div class="pa-take" contenteditable="true" spellcheck="false" data-take="${i}">${esc(x.take)}</div>
      <div class="pa-f"><span class="ty">${x.take.length} 字 · 可以直接改</span><div class="sp"></div><button class="btn sm" data-copy="${i}">${I('copy')}复制</button></div></div>`;
  const projCard = (x, i) => `<div class="pa-card pa-proj">
      <button class="pa-pt" data-item="${x.item.id}" data-g="projects" data-i="${i}">${thumb(x.item)}<span><b>${esc(x.name)}</b><span class="pa-what">${esc(x.what)}</span></span></button>
      ${x.why ? `<div class="pa-a">${esc(x.why)}</div>` : ''}
      <div class="pa-f"><span class="pa-form">${x.form === 'card' ? '适合做小红书卡片' : '适合写公众号拆解'}</span>${x.heat ? `<span class="heat">${heatTxt(x.heat)}</span>` : ''}<div class="sp"></div><button class="btn pri sm" data-mkp="${i}">${I('plus')}用它新建</button></div></div>`;
  const drawIdeas = d => {
    S.pzIdeas = d;
    const n = k => d?.[k]?.length || 0;
    $('#pzmeta').textContent = d?.t ? `${fmtTime(d.t)}${d.direction ? ` · ${d.direction}` : ''}` : '';
    $('#pzgtabs').innerHTML = GROUPS.map(([k, name, ic]) => `<button data-grp="${k}" class="${grp === k ? 'on' : ''}">${I(ic)}${name}${n(k) ? `<em>${n(k)}</em>` : ''}</button>`).join('');
    const list = d?.[grp] || [];
    $('#pzideas').innerHTML = list.length ? list.map(grp === 'takes' ? takeCard : grp === 'projects' ? projCard : grp === 'videos' ? vidCard : artCard).join('')
      : d?.t && grp !== 'items' ? `<div class="pa-empty">${I('lightbulb')}<p>上次挑选题时还没有这一类。点上面的「挑选题」重新挑一次，文章、视频、短评、项目四类会一起出来。</p></div>`
      : `<div class="pa-empty">${I('lightbulb')}<p>AI 会读左边最近几天的素材，一次挑出四类：适合写成公众号长文的选题、适合做成科普短视频的选题、适合发一条短评的动态（附写好的短评）、值得拆解的产品和开源项目。每条都挂着出处。</p><button class="btn acc" data-go>${I('sparkles')}现在挑</button></div>`;
  };
  $('#pzgo').onclick = async () => {
    const b = $('#pzgo'), t0 = Date.now(); b.disabled = true; const tk = setInterval(() => b.innerHTML = `${I('loader-circle', 'spinning')}${((Date.now() - t0) / 1000) | 0} 秒（约 1 分钟）`, 500);
    try { drawIdeas(await api('POST', '/api/plaza/ideas', { direction: $('#pzdir').value.trim(), days: Math.max(f.days, 3), provider: S.aiDefault })); } catch (e) { toast(e.message, true); }
    clearInterval(tk); b.disabled = false; b.innerHTML = `${I('sparkles')}挑选题`;
  };
  $('#pzdir').onkeydown = e => { if (e.key === 'Enter') $('#pzgo').click(); };
  $('#pzgtabs').onclick = e => { const g = e.target.closest('[data-grp]')?.dataset.grp; if (!g) return; grp = g; lsSet('wb.pzg', g); drawIdeas(S.pzIdeas); $('#pzideas').scrollTop = 0; };
  $('#pzideas').oninput = e => { const t = e.target.closest('[data-take]'); if (t) { const x = S.pzIdeas.takes[+t.dataset.take]; x.take = t.innerText.trim(); t.closest('.pa-card').querySelector('.pa-f .ty').textContent = `${x.take.length} 字 · 可以直接改`; } };
  $('#pzideas').onclick = async e => {
    if (e.target.closest('[data-go]')) return $('#pzgo').click();
    const it = e.target.closest('[data-item]');
    if (it) { const x = S.pzIdeas[it.dataset.g][+it.dataset.i], ref = ['items', 'videos'].includes(it.dataset.g) ? x.evidence.find(v => v.id === it.dataset.item) : x.item; return pzDetail(it.dataset.item, ref); }
    const mv = e.target.closest('[data-mkv]');
    if (mv) { const x = S.pzIdeas.videos[+mv.dataset.mkv]; return openNew('script', x); }
    const cp = e.target.closest('[data-copy]');
    if (cp) { const x = S.pzIdeas.takes[+cp.dataset.copy]; try { await navigator.clipboard.writeText(x.take); toast('已复制，可以直接去发'); } catch { toast('复制失败，手动选中复制一下', true); } return; }
    const mp = e.target.closest('[data-mkp]');
    if (mp) { const x = S.pzIdeas.projects[+mp.dataset.mkp]; return openNew(x.form, { title: x.name + '：' + x.what, angle: x.why, why: x.what, form: x.form, evidence: [x.item] }); }
    const dp = e.target.closest('[data-deep]'), mk = e.target.closest('[data-make]');
    if (dp) {
      const x = S.pzIdeas.items[+dp.dataset.deep], t0 = Date.now(); dp.disabled = true;
      const tk = setInterval(() => dp.innerHTML = `${I('loader-circle', 'spinning')}读原文、整理中 ${((Date.now() - t0) / 1000) | 0} 秒`, 500);
      try { x.brief = (await api('POST', '/api/plaza/deepen', { idea: x, provider: S.aiDefault })).brief; drawIdeas(S.pzIdeas); } catch (err) { toast(err.message, true); }
      clearInterval(tk);
    }
    if (mk) { const x = S.pzIdeas.items[+mk.dataset.make]; openNew('article', x); }
  };
  aiProviders().then(d => { S.aiDefault ||= d.default; });
  drawIdeas(await api('GET', '/api/plaza/ideas').catch(() => null));
  load();
}
function readDlg(it) {
  layer.innerHTML = `<div class="mask"><div class="dlg readdlg"><div class="rd-h">${tierTag(it.tier)}<span class="ty">${esc(it.sourceName)}</span><div class="sp"></div><a class="tbtn" href="${esc(it.url)}" target="_blank" rel="noopener">${I('external-link')}打开原网页</a><button class="icb sm" data-close>${I('x')}</button></div>
    <h3>${esc(it.title)}</h3><div class="bd rd-b"><div class="ty">${I('loader-circle', 'spinning')} 正在抓正文…</div></div></div></div>`;
  api('POST', '/api/plaza/read', { url: it.url }).then(d => { const b = $('.rd-b'); if (b) b.innerHTML = d.content.split('\n\n').map(p => `<p>${esc(p)}</p>`).join(''); })
    .catch(e => { const b = $('.rd-b'); if (b) b.innerHTML = `<div class="aierr">${esc(e.message)}</div><div class="ty">可以点右上角「打开原网页」看。</div>`; });
}
function sourcesDlg() {
  const d = S.pzData || { sources: [], status: {} };
  const stText = (s, st) => !st ? '—' : st.off ? '未接入' : !st.ok ? '没拉到' : st.n + ' 条';
  const draw = xc => {
    layer.innerHTML = `<div class="mask"><div class="dlg wide2"><h3>信息源和分级</h3><div class="bd">
    <div class="ty">按可信度分四档。AI 挑选题时，每个选题至少要有一条「官方」或「社区」一手证据；「转述」只当热度参考。</div>
    ${['A', 'B', 'C', 'D'].map(t => `<div class="src-g"><div class="src-h">${tierTag(t)}<b>${esc(d.tiers?.[t]?.name || '')}</b><span class="ty">${{ A: '公司官方博客、发布、开源仓库、官方 X 账号', B: '开发者和产品方自己发的，带热度数据', C: '有采访和评测的科技媒体', D: '转述、搬运、快讯' }[t]}</span></div>
      <div class="src-l">${d.sources.filter(s => s.tier === t).map(s => { const st = d.status?.[s.id]; return `<span class="src${st && !st.ok && !st.off ? ' bad' : ''}${st?.off ? ' off' : ''}" ${st?.error ? `title="${esc(st.error)}"` : ''}>${esc(s.name)}<em>${stText(s, st)}</em></span>`; }).join('')}</div></div>`).join('')}
    <div class="xbox">
      <div class="src-h">${I('at-sign')}<b>X（推特）</b><span class="ty">${!xc ? '读取中…' : xc.configured ? `已接入，密钥 ${esc(xc.token)}${xc.lastPull ? `，上次拉取 ${fmtTime(xc.lastPull)}（${xc.lastCount} 条）` : '，还没拉过'}` : '还没接入'}</span></div>
      ${xc ? `<label>${I('key-round')}Bearer Token<input id="xtok" type="password" autocomplete="off" placeholder="${xc.configured ? '已保存。要换就粘贴新的' : '在 X 开发者后台（developer.x.com）的应用里复制 Bearer Token'}"></label>
      <label>关注的账号<span class="ty">每行一个，后面加 * 表示官方账号（算「官方一手」），其余算「社区一手」</span>
        <textarea id="xacc" rows="7">${esc(xc.accounts.map(a => a.u + (a.official ? '*' : '')).join('\n'))}</textarea></label>
      <div class="xrow">每次最多读 <input id="xmax" type="number" min="10" max="500" value="${xc.max}"> 条，两次至少隔 <input id="xh" type="number" min="0" step="0.5" value="${xc.everyHours}"> 小时，每月最多花 <input id="xbud" type="number" min="0" max="500" step="1" value="${xc.budget}"> 美元</div>
      <div class="xcost">${I('gauge')}<span>本月已读 <b>${xc.monthReads}</b> 条，约 <b>${xc.monthCost}</b> 美元；到上限还能读 ${xc.readsLeft} 条</span><span class="ty">按每条约 ${xc.price} 美元估算，实际以 X 后台账单为准</span></div>
      <div class="ty">X 按读到的帖子数收费。选题广场只拉上次之后的新帖，不拉转发和回复，没到间隔时间点「刷新」也不会去拉；AI 查资料时也会在 X 上搜讨论、读帖子全文，都算在这个月的上限里，到了上限就停。</div>` : ''}
    </div>
  </div><div class="ft">${xc ? `<button class="btn" id="xsave">${I('save')}保存 X 设置</button><button class="btn" id="xtest" ${xc.configured ? '' : 'disabled'}>${I('refresh-cw')}试拉 10 条</button>` : ''}<div class="sp"></div><button class="btn pri" data-close>好</button></div></div></div>`;
    if (!xc) return;
    const collect = () => ({ token: $('#xtok').value.trim(), accounts: $('#xacc').value.split('\n').map(x => x.trim()).filter(Boolean), max: +$('#xmax').value, everyHours: +$('#xh').value, budget: +$('#xbud').value });
    $('#xsave').onclick = async () => { try { const c = await api('POST', '/api/plaza/x', collect()); toast(c.configured ? '已保存 X 设置' : '已保存账号，还差密钥'); draw(c); } catch (e) { toast(e.message, true); } };
    $('#xtest').onclick = async () => {
      const b = $('#xtest'); b.disabled = true; b.innerHTML = `${I('loader-circle', 'spinning')}拉取中…`;
      try {
        const v = collect(); if (v.token || v.accounts.length) await api('POST', '/api/plaza/x', v);
        const r = await api('POST', '/api/plaza/xpull', { test: true });
        d.status = { ...(d.status || {}), x: r.status };
        if (r.status?.ok) toast(`X 拉到 ${r.status.n} 条，新增 ${r.added} 条`); else toast(r.status?.error || '没拉到', true);
        draw(r.config); if (r.status?.ok && route().a === 'plaza') renderPlaza();
      } catch (e) { toast(e.message, true); draw(xc); }
    };
  };
  draw(null);
  api('GET', '/api/plaza/x').then(draw).catch(e => toast(e.message, true));
}

/* ====================================================================
   素材库：AI 生成的图、网上存下来的图、各篇文章 img/ 里的图，按文章分类看
   ==================================================================== */
const KIND_NAME = { generated: 'AI 生成', web: '网上存的', project: '文章里的' };
const assetTile = a => `<button class="atile" data-a="${esc(a.id)}"><img src="${a.url}" loading="lazy" alt=""><span class="ak k-${a.kind}">${KIND_NAME[a.kind] || ''}</span><span class="at">${esc(a.title || a.file)}</span>${a.projectTitle ? `<span class="ap">${esc(a.projectTitle)}</span>` : ''}</button>`;

async function renderAssets() {
  S.as ||= { kind: '', project: '', q: '' };
  const f = S.as, arts = S.projects.filter(p => p.type === 'article');
  main.onclick = null;
  main.innerHTML = `
    <div class="top"><div class="crumb"><b>素材库</b></div><span class="ty" id="ascount"></span><div class="sp"></div>
      <button class="btn" id="asset-set">${I('settings')}生图设置</button></div>
    <div class="aslib">
      <div class="asgen">
        <textarea id="agp" rows="2" placeholder="描述想要的画面，AI 帮你生成。比如：一张扁平插画，游戏策划和 AI 一起在白板前画关卡草图，暖色，留白多，不要文字"></textarea>
        <div class="row"><div class="seg sm" id="ags">${[['landscape', '横图'], ['square', '方图'], ['portrait', '竖图']].map(([k, n], i) => `<button data-s="${k}" class="${i ? '' : 'on'}">${n}</button>`).join('')}</div>
          <select class="sel mini" id="agn">${[1, 2, 3, 4].map(n => `<option value="${n}">${n} 张</option>`).join('')}</select>
          <select class="sel mini" id="agproj"><option value="">不归到文章</option>${arts.map(p => `<option value="${esc(p.id)}" ${f.project === p.id ? 'selected' : ''}>归到「${esc(p.title.slice(0, 16))}」</option>`).join('')}</select>
          <div class="sp"></div><span class="ty" id="agst"></span><button class="btn pri" id="ago">${I('sparkles')}生成</button></div>
      </div>
      <div class="asbar">
        <div class="seg sm" id="askind">${[['', '全部'], ['generated', 'AI 生成'], ['web', '网上存的'], ['project', '文章里的']].map(([k, n]) => `<button data-k="${k}" class="${f.kind === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <select class="sel mini" id="asproj"><option value="">全部文章</option>${S.projects.map(p => `<option value="${esc(p.id)}" ${f.project === p.id ? 'selected' : ''}>${esc(p.title.slice(0, 22))}</option>`).join('')}</select>
        <div class="sp"></div><div class="pz-q">${I("search")}<input id="asq" placeholder="搜标题、画面描述、来源" value="${esc(f.q)}"></div>
      </div>
      <div class="agrid" id="agrid"><div class="ty">${I('loader-circle', 'spinning')}读取中…</div></div>
    </div>`;
  let items = [];
  const load = async () => {
    items = await api('GET', `/api/assets?kind=${f.kind}&project=${enc(f.project)}&q=${enc(f.q)}`);
    $('#ascount').textContent = `${items.length} 张`;
    $('#agrid').innerHTML = items.length ? items.map(assetTile).join('') : `<div class="empty-state">${f.kind || f.project || f.q ? '没有符合条件的图' : '还没有素材。在上面描述画面生成一张，或者在写作页让 AI 助手去官网找图'}</div>`;
  };
  $('#askind').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; f.kind = b.dataset.k; $$('#askind button').forEach(x => x.classList.toggle('on', x === b)); load(); };
  $('#asproj').onchange = e => { f.project = e.target.value; load(); };
  let qt; $('#asq').oninput = e => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value.trim(); load(); }, 250); };
  $('#ags').onclick = e => { const b = e.target.closest('[data-s]'); if (b) $$('#ags button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#asset-set').onclick = () => imgSettingsDlg();
  $('#ago').onclick = async () => {
    const prompt = $('#agp').value.trim(); if (!prompt) return $('#agp').focus();
    const b = $('#ago'); b.disabled = true; const t0 = Date.now(), tk = setInterval(() => { $('#agst').textContent = `生成中 ${((Date.now() - t0) / 1000) | 0} 秒`; }, 500);
    try { const r = await api('POST', '/api/assets/generate', { prompt, size: $('#ags .on').dataset.s, n: +$('#agn').value, project: $('#agproj').value }); toast(`生成好了 ${r.length} 张`); f.kind = ''; await load(); }
    catch (e) { toast(e.message, true); if (/还没配|没配好/.test(e.message)) imgSettingsDlg(); }
    clearInterval(tk); $('#agst').textContent = ''; b.disabled = false;
  };
  $('#agrid').onclick = e => { const t = e.target.closest('[data-a]'); if (t) assetDlg(items.find(a => a.id === t.dataset.a), load); };
  load();
}

// 一张素材的详情：大图、来源、画面描述；可以插进文章、下载、删除
function assetDlg(a, after) {
  if (!a) return;
  const arts = S.projects.filter(p => p.type === 'article');
  layer.innerHTML = `<div class="mask"><div class="dlg wide2 adlg"><h3>${esc(a.title || a.file)}</h3><div class="bd">
    <div class="abig"><img src="${a.url}" alt=""></div>
    <div class="ameta">
      <div><span>类型</span>${KIND_NAME[a.kind] || ''}${a.w ? `　${a.w}×${a.h}` : ''}　${(a.size / 1024).toFixed(0)} KB　${fmtTime(a.t)}</div>
      ${a.projectTitle ? `<div><span>文章</span>${esc(a.projectTitle)}</div>` : ''}
      ${a.prompt ? `<div><span>画面描述</span>${esc(a.prompt)}</div>` : ''}${a.provider ? `<div><span>生图接口</span>${esc(a.provider)}</div>` : ''}
      ${a.page || a.source ? `<div><span>来源</span><a href="${esc(a.page || a.source)}" target="_blank" rel="noopener">${esc((a.page || a.source).slice(0, 90))}</a></div>` : ''}
    </div>
    <div class="arow"><select class="sel" id="ains">${arts.map(p => `<option value="${esc(p.id)}" ${p.id === a.project ? 'selected' : ''}>${esc(p.title.slice(0, 26))}</option>`).join('')}</select><button class="btn" id="aok">${I('image-plus')}插到这篇文末</button><span class="ty">要插在某段后面，到写作页点「配图」</span></div>
  </div><div class="ft">${a.kind !== 'project' ? `<button class="btn danger" id="adel">${I('trash-2')}删除</button>` : ''}<a class="btn" href="${a.url}" download="${esc(a.file)}">${I('download')}下载</a><div class="sp"></div><button class="btn pri" data-close>关闭</button></div></div></div>`;
  $('#aok').onclick = async () => { try { const r = await api('POST', `/api/projects/${enc($('#ains').value)}/studio/insert-asset`, { asset: a.id, alt: a.title }); toast('已插到文末：' + r.file); layer.innerHTML = ''; after?.(); } catch (e) { toast(e.message, true); } };
  $('#adel') && ($('#adel').onclick = async () => { await api('DELETE', `/api/assets/${enc(a.id)}`); toast('已删除'); layer.innerHTML = ''; after?.(); });
}

// 写作页「配图」：挑一张插到光标所在段落后面
async function pickAssetDlg(p, onPick) {
  let scope = 'mine', items = [];
  const draw = () => {
    layer.innerHTML = `<div class="mask"><div class="dlg wide2"><h3>从素材库插图</h3><div class="bd">
      <div class="asbar"><div class="seg sm" id="pks"><button data-s="mine" class="${scope === 'mine' ? 'on' : ''}">这篇文章的</button><button data-s="all" class="${scope === 'all' ? 'on' : ''}">全部</button></div><div class="sp"></div><a class="ty" href="#/assets" data-close>去素材库生成新图 ›</a></div>
      <div class="agrid sm" id="pkg">${items.length ? items.map(assetTile).join('') : '<div class="empty-state">这里还没有图。可以让右边的 AI 助手去找图或生图</div>'}</div>
      <div class="ty">点一张就插到光标所在那段的后面（没放光标就放文末）。</div>
    </div><div class="ft"><button class="btn" data-close>取消</button></div></div></div>`;
    $('#pks').onclick = async e => { const b = e.target.closest('[data-s]'); if (b && b.dataset.s !== scope) { scope = b.dataset.s; await load(); } };
    $('#pkg').onclick = e => { const t = e.target.closest('[data-a]'); if (!t) return; layer.innerHTML = ''; onPick(items.find(a => a.id === t.dataset.a)); };
  };
  const load = async () => { items = await api('GET', `/api/assets${scope === 'mine' ? '?project=' + enc(p.id) : ''}`); draw(); };
  await load();
}

// 生图接口设置
async function imgSettingsDlg() {
  const d = await api('GET', '/api/images');
  layer.innerHTML = `<div class="mask"><div class="dlg wide2"><h3>生图设置</h3><div class="bd">
    <div class="ty">填好一家就能用。选中的是默认。密钥只存在本机 data/image.json。</div>
    <label class="chk1"><input type="checkbox" id="imgconf" ${d.confirm ? 'checked' : ''}> AI 助手要生图时，先让我确认（推荐：生图按张计费）</label>
    <div class="provs">${d.providers.map(p => `<div class="prov" data-id="${p.id}">
      <div class="pv1"><label class="rad"><input type="radio" name="idef" value="${p.id}" ${d.default === p.id ? 'checked' : ''} ${p.ready ? '' : 'disabled'}><b>${esc(p.name)}</b></label>
        <span class="st ${p.ready ? 'st3' : 'st1'}"><i class="dot"></i>${p.ready ? '可用' : '未配置'}</span><span class="ty">${esc(d.formats[p.format] || p.format)}${p.keyFrom ? ' · 密钥来自' + esc(p.keyFrom) : p.env ? ' · 也可以用环境变量 ' + p.env : ''}</span><div class="sp"></div>${p.custom ? '<button class="tbtn" data-rm>删除</button>' : ''}</div>
      <div class="pv2"><input data-f="model" placeholder="模型名" value="${esc(p.model)}"><input data-f="baseUrl" placeholder="接口地址" value="${esc(p.baseUrl)}"><input data-f="key" type="password" autocomplete="off" placeholder="${p.keyMask ? '已保存 ' + esc(p.keyMask) + '，要换就粘贴新的' : 'API 密钥'}"><button class="btn" data-save>保存</button></div>
    </div>`).join('')}</div>
    <details class="addp"><summary>＋ 加一个别的生图接口</summary><div class="pv2 ib-pv2-5"><input id="ni-name" placeholder="名字"><select class="sel" id="ni-fmt">${Object.entries(d.formats).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select><input id="ni-url" placeholder="接口地址"><input id="ni-model" placeholder="模型名"><input id="ni-key" type="password" placeholder="API 密钥"><button class="btn" id="ni-ok">添加</button></div></details>
  </div><div class="ft"><div class="sp"></div><button class="btn pri" data-close>完成</button></div></div></div>`;
  $('#imgconf').onchange = e => api('PUT', '/api/images', { confirm: e.target.checked }).then(() => toast(e.target.checked ? '生图前会先问你' : '以后 AI 助手会直接生图')).catch(err => toast(err.message, true));
  $$('input[name=idef]', layer).forEach(r => r.onchange = () => api('PUT', '/api/images', { default: r.value }).then(() => toast('已设为默认')).catch(e => toast(e.message, true)));
  $$('[data-save]', layer).forEach(b => b.onclick = async () => {
    const box = b.closest('.prov'), v = k => box.querySelector(`[data-f=${k}]`).value.trim();
    const body = { id: box.dataset.id, model: v('model'), baseUrl: v('baseUrl') }; if (v('key')) body.key = v('key');
    try { const r = await api('PUT', '/api/images', body); if (!r.default && r.providers.find(x => x.id === body.id)?.ready) await api('PUT', '/api/images', { default: body.id }); toast('已保存'); imgSettingsDlg(); } catch (e) { toast(e.message, true); }
  });
  $$('[data-rm]', layer).forEach(b => b.onclick = async () => { await api('PUT', '/api/images', { id: b.closest('.prov').dataset.id, remove: true }); imgSettingsDlg(); });
  $('#ni-ok').onclick = async () => {
    const v = id => $('#' + id).value.trim(), name = v('ni-name');
    if (!name || !v('ni-url') || !v('ni-model')) return toast('名字、接口地址、模型名都要填', true);
    try { await api('PUT', '/api/images', { id: 'x-' + Date.now().toString(36), name, format: $('#ni-fmt').value, baseUrl: v('ni-url'), model: v('ni-model'), key: v('ni-key') }); toast('已添加'); imgSettingsDlg(); } catch (e) { toast(e.message, true); }
  };
}


/* 视频拆关键帧：在浏览器里按时间均匀取一批候选画面，挑变化最大的几帧（第一帧一定要），按时间排好 */
async function videoKeyframes(file, { max = 12, onProgress = () => {} } = {}) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
  try {
    await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error('这个视频浏览器读不了，转成 MP4（H.264）再传')); setTimeout(() => no(new Error('读取视频超时')), 30000); });
    const d = v.duration, vw = v.videoWidth, vh = v.videoHeight;
    if (!isFinite(d) || d <= 0 || !vw) throw new Error('读不到视频的时长或画面');
    const seek = t => new Promise(ok => { const h = () => { v.removeEventListener('seeked', h); ok(); }; v.addEventListener('seeked', h); v.currentTime = Math.min(Math.max(0, t), Math.max(0, d - 0.05)); setTimeout(ok, 5000); });
    // 1. 候选：最多 48 个时间点，每个算一个 32 像素宽的灰度缩略
    const n = Math.min(48, Math.max(6, Math.ceil(d / 0.6)));
    const sw = 32, sh = Math.max(8, Math.round(32 * vh / vw)), sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
    const sx = sc.getContext('2d', { willReadFrequently: true });
    const cand = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i * (d - 0.05)) / (n - 1);
      await seek(t); sx.drawImage(v, 0, 0, sw, sh);
      const px = sx.getImageData(0, 0, sw, sh).data, g = new Float32Array(sw * sh);
      for (let k = 0; k < g.length; k++) g[k] = px[k * 4] * 0.3 + px[k * 4 + 1] * 0.59 + px[k * 4 + 2] * 0.11;
      cand.push({ t, g }); onProgress(i + 1, n);
    }
    const diff = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };
    cand.forEach((c, i) => { c.score = i ? diff(c.g, cand[i - 1].g) : Infinity; });
    // 2. 挑帧：第一帧 + 画面变化最大的几帧，相邻两帧不能太近；画面几乎不动就按时间均匀补几帧
    const gap = d / (max * 2), picked = [cand[0]];
    for (const c of [...cand.slice(1)].sort((a, b) => b.score - a.score)) {
      if (picked.length >= max || c.score < 1.5) break;
      if (picked.every(p => Math.abs(p.t - c.t) >= gap)) picked.push(c);
    }
    const want = Math.min(max, d < 4 ? 3 : 5);
    for (let i = 1; picked.length < want && i < n; i++) { const c = cand[Math.round(i * (n - 1) / (want - 1))]; if (c && !picked.includes(c)) picked.push(c); }
    picked.sort((a, b) => a.t - b.t);
    // 3. 取清晰的帧：宽最多 1280，JPEG
    const W = Math.min(1280, vw), H = Math.round(W * vh / vw), fc = document.createElement('canvas'); fc.width = W; fc.height = H;
    const fx = fc.getContext('2d'), frames = [];
    for (const c of picked) { await seek(c.t); fx.drawImage(v, 0, 0, W, H); frames.push({ t: c.t, data: fc.toDataURL('image/jpeg', 0.82) }); }
    return { duration: d, frames };
  } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); }
}

/* ====================================================================
   AI 助手对话面板（文章写作页、卡片精修页共用）
   root：放面板的容器；ctx：kind、prov、focusText、lock、onChanged(files)、legacy（只有文章有：不是 Claude 时走修改建议）
   ==================================================================== */
const QUICK_CARD = ['封面标题再短一点、更抓人', '整组卡片的字再大一点、留白多一点', '照我上一组卡片的风格来改', '给第 2 页找一张官网截图放进去', '帮我检查有没有文字溢出'];
function mountChat(root, p, ctx) {
  const card = ctx.kind === 'card';
  root.insertAdjacentHTML('beforeend', `
      <div class="as-h">${I('sparkles')}<b>AI 助手</b><div class="sp"></div><button class="icb sm" id="chsk" data-tip="技能：给助手装上做某类事的方法">${I('puzzle')}</button><button class="icb sm" id="chmem" data-tip="AI 记忆：所有文章和卡片通用">${I('bookmark')}</button><button class="icb sm" id="chclr" data-tip="清空对话">${I('trash-2')}</button>${ctx.headExtra || ''}</div>
      ${ctx.slot || ''}
      <div class="as-log" id="chatlog"></div>
      <div class="as-in">
        <div class="focus" id="focusinfo" hidden>${I('crosshair')}<span></span></div>
        <div class="refs" id="refs" hidden></div>
        <div class="inbox"><textarea id="chatin" rows="2" placeholder="说说想怎么改，可以贴参考图、视频或链接（⌘J 随时回到这里）">${esc(S.chatDraft || '')}</textarea>
          <div class="inbar"><button class="att" id="chatt" data-tip="附参考图或视频（视频会拆成关键帧给 AI 看）">${I('paperclip')}</button><input type="file" id="chfile" accept="image/*,video/*" multiple hidden>
            ${provSelect(ctx.prov, 'prov', 'mini pick')}<div class="sp"></div><span class="kh" id="chkh">↵ 发送 · ⇧↵ 换行</span>
            <button class="send" id="chgo" data-tip="发送（回车）">${I('arrow-up')}</button></div></div>
      </div>`);
  S.chatDraft = '';
  const $r = sel => root.querySelector(sel);
  const prov = ctx.prov, getProv = bindProv($r('#prov'));
  const isAgent = () => AGENT_TYPES.includes(((S.provData || prov).providers.find(x => x.id === provId(getProv() || prov.default)) || {}).type);
  const log = $r('#chatlog');
  let jobMap = {}, reqMap = {}, decMap = {};
  const picks = {};   // 作者在卡片上点的选项，还没发出去
  // 每件事在正文里的位置：AI 给的原句；以前的卡片没有，就从标题里引号括起来的话里找
  const guessQuotes = t => [...String(t).matchAll(/[「“『"]([^」”』"]{4,160})[」”』"]/g)].flatMap(m => m[1].split(/……|…|\.{3}/)).map(x => x.trim().replace(/^[，。、；：,.]+|[，。、；：,.]+$/g, '')).filter(x => x.length >= 4);
  const decQuotes = d => !ctx.locate ? [] : (d.quotes?.length ? d.quotes : ctx.canLocate ? guessQuotes(d.title + ' ' + (d.detail || '')) : []).filter(q => !ctx.canLocate || ctx.canLocate(q)).slice(0, 3);
  // 还没定的事按时间编号，和正文里的编号对上
  const decNums = () => { let n = 0; return Object.fromEntries(Object.values(decMap).filter(d => !d.answer).sort((a, b) => String(a.t).localeCompare(String(b.t))).filter(d => decQuotes(d).length).map(d => [d.id, ++n])); };
  const pushMarks = () => { if (!ctx.onDecisions) return; const nums = decNums(); ctx.onDecisions(Object.keys(nums).map(id => ({ id, n: nums[id], title: decMap[id].title, quotes: decQuotes(decMap[id]) }))); };
  const decBlock = ids => {
    const ds = ids.map(id => decMap[id]).filter(Boolean); if (!ds.length) return '';
    const nums = decNums();
    const locs = d => { const qs = decQuotes(d); return qs.length ? `<div class="dlocs">${qs.map((q, k) => `<button class="dloc" data-loc="${esc(q)}" title="${esc(q)}">${I('locate-fixed')}${qs.length > 1 ? `位置 ${k + 1}` : '在正文里看'}</button>`).join('')}</div>` : ''; };
    const open = ds.filter(d => !d.answer), chosen = open.filter(d => picks[d.id]).length;
    return `<div class="decs"><div class="dec-h">${I('list-checks')}<b>${open.length ? '等你定' : '你定好的'}</b><span>${open.length ? `${open.length} 件，点选后一起发给 AI` : `${ds.length} 件`}</span></div>
      ${ds.map(d => `<div class="dec${d.answer ? ' done' : ''}" data-dec="${d.id}"><div class="dt"><b>${nums[d.id] ? `<i class="dnum">${nums[d.id]}</i>` : ''}${esc(d.title)}</b>${d.detail ? `<span>${esc(d.detail)}</span>` : ''}${locs(d)}</div>
        <div class="dopts">${d.answer ? `<span class="dans">${I('check')}${esc(d.answer)}</span>` : d.options.map(o => `<button class="dopt${picks[d.id] === o ? ' on' : ''}" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`).join('')}
      ${open.length ? `<div class="dec-f"><span class="ty">${chosen ? `已选 ${chosen} / ${open.length}` : '也可以直接在下面打字说别的想法'}</span><div class="sp"></div><button class="btn pri sm" data-decsend ${chosen ? '' : 'disabled'}>${I('arrow-up')}把决定发给 AI</button></div>` : ''}</div>`;
  };
  const reqCard = r => !r ? '' : `<div class="job skreq${r.status !== 'pending' ? ' done' : ''}" data-skreq="${r.id}"><div class="job-h">${I('puzzle')}<b>安装技能</b><span>${esc(r.name)}</span></div>
      <div class="ty">${esc(r.reason || '')}</div><a class="ty" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.repo)}/${esc(r.path)}</a>
      ${r.status === 'pending' ? `<div class="job-r"><span class="ty">第三方写的说明会影响 AI 的做法，看过再装</span><div class="sp"></div><button class="tbtn" data-skno>不要</button><button class="btn pri sm" data-skok>${I('download')}安装</button></div>` : `<div class="ty">${r.status === 'installed' ? '已安装，下次发消息就能用' : '没装'}</div>`}</div>`;
  const thumbs = list => list?.length ? `<div class="athumbs">${list.map(a => `<a href="/assets/${enc(a.file)}" target="_blank" title="${esc(a.title || '')}"><img src="/assets/${enc(a.file)}" loading="lazy" alt=""></a>`).join('')}</div>` : '';
  const SIZE_NAME = { landscape: '横图', square: '方图', portrait: '竖图' };
  function jobCard(j) {
    if (!j) return '';
    const head = `<div class="job-h">${I('sparkles')}<b>生成配图</b><span>${esc(j.title || '')}</span></div>`;
    if (j.status === 'done') return `<div class="job done" data-job="${j.id}">${head}${thumbs(j.assets)}<div class="ty">${j.inserted ? '已插进文章' : j.insertError ? '没插进去：' + esc(j.insertError) : '已存进素材库'}</div></div>`;
    if (j.status === 'rejected') return `<div class="job off" data-job="${j.id}">${head}<div class="ty">已取消</div></div>`;
    if (j.status === 'running') return `<div class="job" data-job="${j.id}">${head}<div class="ty">${I('loader-circle', 'spinning')}正在生成…</div></div>`;
    return `<div class="job" data-job="${j.id}">${head}
      <textarea data-jp rows="4">${esc(j.prompt)}</textarea>
      <div class="job-r"><select class="sel mini" data-js>${Object.entries(SIZE_NAME).map(([k, v]) => `<option value="${k}" ${j.size === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select class="sel mini" data-jn>${[1, 2, 3, 4].map(n => `<option value="${n}" ${+j.n === n ? 'selected' : ''}>${n} 张</option>`).join('')}</select>
        <div class="sp"></div><button class="tbtn" data-jrej>不要</button><button class="btn pri sm" data-jok>${I('sparkles')}生成</button></div>
      <div class="ty">${j.after ? `生成后插在「${esc(j.after.slice(0, 24))}…」那段后面。` : '生成后存进素材库。'}生图会按接口计费。${j.error ? `<span class="err">上次失败：${esc(j.error)}</span>` : ''}</div></div>`;
  }
  const OPN = { add: '记住了', update: '更新了', remove: '删掉了', promote: '升为守则', demote: '降为卡片', miss: '被推翻', archive: '归档了' };
  const memoLine = m => (m = { ...m, memo: (m.memo || []).filter(x => x.op !== 'hit') }, m.memo.length) ? `<div class="memo">${I('bookmark')}<div>${m.memo.map(x => `<span><em>${OPN[x.op] || ''}</em>${esc(x.text)}</span>`).join('')}</div><button class="tbtn" data-memopen>看记忆</button></div>` : '';
  function aiMsg(m) {
    if (!m.agent) return `<div class="msg ai"><div class="md">${mdToHtml(m.text || '')}</div>${m.edits ? `<div class="edits">${I('pencil-line')}在文中标了 ${m.edits} 处修改</div>` : ''}${(m.missed || []).map(x => `<div class="miss"><div class="ty">这处没对上原文，可以手动改：</div><div class="dif">${diffHtml(x.old, x.new)}</div></div>`).join('')}${memoLine(m)}</div>`;
    if (m.error && !m.steps?.length) return `<div class="msg ai"><div class="aerr">${I('triangle-alert')}<span>${esc(m.text)}</span></div></div>`;
    return `<div class="msg ai">${m.text ? `<div class="${m.error ? 'aerr' : 'md'}">${m.error ? I('triangle-alert') + `<span>${esc(m.text)}</span>` : mdToHtml(m.text)}</div>` : ''}
      ${m.steps?.length ? `<details class="steps"><summary>${I('list-tree')}做了 ${m.steps.length} 步</summary>${m.steps.map(x => `<div>${I(x.icon || 'chevron-right')}<span>${esc(x.text)}</span></div>`).join('')}</details>` : ''}
      ${m.lint?.length ? `<details class="lintq"><summary>${I('scan-text')}它改完没自查，程序按你的规矩查到 ${m.lint.length} 处可能有问题</summary>${m.lint.map(x => `<div><b>${esc(x.problem)}</b>「${esc(x.quote)}」<span>→ ${esc(x.fix)}</span></div>`).join('')}<div class="ty">让它改：直接说“把自查查出来的几处改掉”</div></details>` : ''}
      ${thumbs(m.assets)}${(m.jobs || []).map(id => jobCard(jobMap[id])).join('')}${(m.skillReqs || []).map(id => reqCard(reqMap[id])).join('')}${decBlock(m.decisions || [])}
      ${memoLine(m)}${m.files?.length ? `<div class="chg${m.undone ? ' off' : ''}">${I('file-pen-line')}<span>改了 ${m.files.map(esc).join('、')}</span><div class="sp"></div>${m.undone ? '<em>已撤销</em>' : m.turn ? `<button class="tbtn" data-undo="${m.turn}">${I('undo-2')}撤销这次改动</button>` : ''}</div>` : ''}</div>`;
  }
  const meMsg = (text, imgs = []) => `<div class="msg me">${imgs.length ? `<div class="mimgs">${imgs.slice(0, 8).map(u => `<a href="${u}" target="_blank"><img src="${u}" alt=""></a>`).join('')}${imgs.length > 8 ? `<span class="more">+${imgs.length - 8}</span>` : ''}</div>` : ''}${esc(text)}</div>`;
  // 附件：图片直接附；视频在浏览器里拆成关键帧（不上传视频本身）
  let refs = [];
  const frameCount = () => refs.reduce((n, r) => n + (r.kind === 'video' ? r.frames?.length || 0 : 1), 0);
  const drawRefs = () => {
    const box = $r('#refs'); box.hidden = !refs.length;
    box.innerHTML = refs.map((r, i) => r.kind === 'video'
      ? `<span class="ref vid">${r.frames?.[0] ? `<img src="${r.frames[0].data}" alt="">` : ''}<span class="vlab">${I('play')}${r.busy ? `拆帧 ${r.prog || ''}` : `${r.frames.length} 帧`}</span><button data-rm="${i}" data-tip="去掉">${I('x')}</button></span>`
      : `<span class="ref"><img src="${r.data}" alt=""><button data-rm="${i}" data-tip="去掉">${I('x')}</button></span>`).join('')
      + (refs.length ? `<span class="ty">${!isAgent() ? '参考图要用 Claude 或 Claude Code 才能看' : refs.some(r => r.busy) ? '正在从视频里挑关键帧…' : refs.some(r => r.kind === 'video') ? '视频拆成了关键帧，和消息一起发给 AI' : '会和消息一起发给 AI 参考'}</span>` : '');
  };
  const addFiles = files => {
    for (const f of [...files || []]) {
      if (/^video\//.test(f.type) || /\.(mov|mp4|m4v|webm)$/i.test(f.name || '')) {
        if (refs.filter(r => r.kind === 'video').length >= 2) { toast('一次最多附 2 个视频', true); continue; }
        const item = { kind: 'video', name: f.name || '视频', frames: [], busy: true, prog: '' };
        refs.push(item); drawRefs();
        videoKeyframes(f, { onProgress: (k, n) => { item.prog = `${k}/${n}`; drawRefs(); } })
          .then(r => { Object.assign(item, { frames: r.frames, duration: r.duration, busy: false }); drawRefs(); })
          .catch(err => { refs = refs.filter(x => x !== item); drawRefs(); toast(err.message, true); });
        continue;
      }
      if (!/^image\//.test(f.type)) continue;
      if (f.size > 20e6) { toast(`${f.name || '图片'} 太大（超过 20 MB）`, true); continue; }
      if (frameCount() >= 30) { toast('一次最多附 30 张图', true); break; }
      const fr = new FileReader(); fr.onload = () => { refs.push({ kind: 'img', data: fr.result, name: f.name }); drawRefs(); }; fr.readAsDataURL(f);
    }
  };
  const flatRefs = list => list.flatMap(r => r.kind === 'video'
    ? r.frames.map(fr => ({ data: fr.data, label: `视频《${r.name}》第 ${fr.t.toFixed(1)} 秒（全长 ${r.duration.toFixed(1)} 秒）` }))
    : [{ data: r.data }]);
  const quick = () => ctx.quick || (isAgent() ? (card ? QUICK_CARD : QUICK_AGENT) : QUICK);
  function drawChat(h) {
    const lastUser = h.length && h[h.length - 1].role === 'user' && !running ? h[h.length - 1] : null;
    log.innerHTML = h.length ? h.map(m => m.role === 'user' ? (m.inject ? meMsg(m.text).replace('<div class="msg me">', `<div class="msg me inj"><div class="injtag">${I('message-square')}补充给正在做的任务</div>`) : meMsg(m.text, (m.images || []).map(f => `/api/projects/${enc(p.id)}/studio/attach?f=${enc(f)}`))) : aiMsg(m)).join('')
      + (lastUser ? `<div class="unfin">${I('triangle-alert')}<span>这一轮没有做完（可能是服务重启或出了错）。</span><button class="tbtn" data-resend>${I('refresh-cw')}重新发送</button></div>` : '')
      : `<div class="as-empty"><div class="spark">${I('sparkles')}</div><b>${esc(ctx.emptyTitle || '和 AI 一起做')}</b><p>${ctx.emptyText && isAgent() ? esc(ctx.emptyText) : !isAgent() ? (ctx.legacy ? '说说哪里不满意，修改会标在原文里，你逐处确认。选 Claude 或 Claude Code 的话它还能直接改排版、找图和生图' : '这里的助手要用 Claude 或 Claude Code，在下面换一个再说') : card ? '它能直接改卡片的文案、版式和样式，找图、生图，会记住你说过的偏好，也能参考你以前的卡片。每次改动都能一键撤销' : '它能直接改正文、调整排版样式、找官网配图、生成配图，会记住你说过的偏好，也能参考你以前的文章。每次改动都能一键撤销'}</p>
         <div class="sugq">${quick().map(q => `<button data-q="${esc(q)}">${I('message-circle-question')}<span>${esc(q)}</span></button>`).join('')}</div></div>`;
    $$('[data-q]', log).forEach(b => b.onclick = () => send(b.dataset.q));
    pushMarks();
    log.scrollTop = 1e9;
  }
  const loadJobs = async () => {
    const [jl, rl, dl] = await Promise.all([SAPI(p, 'imgjobs').catch(() => []), SAPI(p, 'skillreqs').catch(() => []), SAPI(p, 'decisions').catch(() => [])]);
    jobMap = Object.fromEntries(jl.map(j => [j.id, j])); reqMap = Object.fromEntries(rl.map(r => [r.id, r])); decMap = Object.fromEntries(dl.map(d => [d.id, d]));
  };
  const redraw = async () => { await loadJobs(); drawChat(await SAPI(p, 'chat')); };
  // 撤销后问一句：要不要记成“以后别这样”
  const askRemember = () => {
    log.insertAdjacentHTML('beforeend', `<div class="memask">${I('bookmark')}<div class="mq"><span>撤销了。以后要避开这类改动吗？写一句原因，我记进全局记忆，所有文章和卡片都会照做：</span>
      <div class="mrow"><input placeholder="${card ? '比如：封面别用深色底；字不要小于 28 号' : '比如：别动我的标题；图注不要写来源链接'}"><button class="btn sm pri" data-memok>记住</button><button class="tbtn" data-memx>算了</button></div></div></div>`);
    log.scrollTop = 1e9; const box = log.lastElementChild, inp = box.querySelector('input'); inp.focus();
    const ok = async () => { const t = inp.value.trim(); if (!t) return inp.focus(); try { await api('POST', '/api/memory', { text: t, kind: 'avoid' }); box.innerHTML = `${I('bookmark')}<span class="ty">记住了：${esc(t)}</span>`; } catch (e) { toast(e.message, true); } };
    box.querySelector('[data-memok]').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) ok(); if (e.key === 'Escape') box.remove(); };
    box.querySelector('[data-memx]').onclick = () => box.remove();
  };
  log.addEventListener('click', async e => {
    const u = e.target.closest('[data-undo]');
    if (u) { u.disabled = true; try { await S.flush?.(); const r = await SAPI(p, 'agent-undo', 'POST', { turn: u.dataset.undo }); toast('已撤销：' + r.files.join('、')); await ctx.onChanged?.(r.files); await redraw(); askRemember(); } catch (err) { toast(err.message, true); u.disabled = false; } return; }
    // 等你定的卡片：点选项（再点一下取消），点「把决定发给 AI」一起发
    if (e.target.closest('[data-memopen]')) { memoryDlg(); return; }
    if (e.target.closest('[data-relocal]')) { const b = e.target.closest('.unfin'); if (b.previousElementSibling?.classList.contains('me')) b.previousElementSibling.remove(); b.remove(); if (lostLocal) { refs = lostLocal.refs || []; drawRefs(); const t = lostLocal.text; lostLocal = null; sendAgent(t); } return; }
    if (e.target.closest('[data-reload]')) { location.reload(); return; }
    if (e.target.closest('[data-resend]')) { const h = await SAPI(p, 'chat'); const m = h[h.length - 1]; if (m?.role === 'user') { e.target.closest('.unfin').previousElementSibling?.remove(); e.target.closest('.unfin').remove(); send(m.text); } return; }
    const loc = e.target.closest('[data-loc]');
    if (loc) { if (!ctx.locate(loc.dataset.loc)) toast('在正文里没找到这句，可能已经改掉了', true); return; }
    const dob = e.target.closest('.dopt');
    if (dob) {
      const id = dob.closest('[data-dec]').dataset.dec; picks[id] = picks[id] === dob.dataset.o ? undefined : dob.dataset.o;
      const box = dob.closest('.decs'), ids = [...box.querySelectorAll('[data-dec]')].map(x => x.dataset.dec);
      box.outerHTML = decBlock(ids); return;
    }
    if (e.target.closest('[data-decsend]')) {
      if (S.agentStop) return toast('助手还在做上一件事，按 Esc 可以停下');
      const box = e.target.closest('.decs'), ds = [...box.querySelectorAll('[data-dec]')].map(x => decMap[x.dataset.dec]).filter(d => d && !d.answer && picks[d.id]);
      if (!ds.length) return;
      await SAPI(p, 'decisions', 'POST', { answers: ds.map(d => ({ id: d.id, answer: picks[d.id] })) });
      const msg = '我的决定：\n' + ds.map((d, i) => `${i + 1}. ${d.title} → ${picks[d.id]}`).join('\n');
      ds.forEach(d => delete picks[d.id]);
      send(msg); return;
    }
    const sq = e.target.closest('[data-skreq]');
    if (sq && (e.target.closest('[data-skok]') || e.target.closest('[data-skno]'))) {
      const ok = !!e.target.closest('[data-skok]'), b = e.target.closest('button'); b.disabled = true; if (ok) b.innerHTML = `${I('loader-circle', 'spinning')}安装中`;
      try { const r = await SAPI(p, 'skillreq', 'POST', { id: sq.dataset.skreq, action: ok ? 'install' : 'reject' }); if (ok) toast(`装好了：${r.name}`); } catch (err) { toast(err.message, true); }
      await redraw(); return;
    }
    const jc = e.target.closest('[data-job]'); if (!jc) return;
    const jid = jc.dataset.job;
    if (e.target.closest('[data-jrej]')) { await SAPI(p, 'imgjob-reject', 'POST', { id: jid }); await redraw(); return; }
    if (e.target.closest('[data-jok]')) {
      const body = { id: jid, prompt: jc.querySelector('[data-jp]').value, size: jc.querySelector('[data-js]').value, n: +jc.querySelector('[data-jn]').value };
      jobMap[jid] = { ...jobMap[jid], status: 'running' }; jc.outerHTML = jobCard(jobMap[jid]);
      try { await S.flush?.(); const r = await SAPI(p, 'imgjob', 'POST', body); toast(r.job.inserted ? '生成好了，已插进文章' : `生成好了 ${r.assets.length} 张，在素材库里`); if (r.job.inserted) await ctx.onChanged?.(['article.md']); }
      catch (err) { toast(err.message, true); }
      await redraw();
    }
  });
  // 能动手的助手：边做边显示每一步。任务在服务端独立跑：连接断了、页面刷新了，都改成定时查进度接着显示
  let running = false;
  const pendHtml = () => `<div class="msg ai live" id="pend"><div class="md"></div><div class="steps on"></div><div class="stat">${I('loader-circle', 'spinning')}<span>在想怎么做…</span></div></div>`;
  const busyOn = ctrl => {
    running = true; const go = $r('#chgo');
    S.agentStop = { abort: () => { ctrl?.abort(); SAPI(p, 'agent-stop', 'POST', {}).catch(() => {}); } };
    go.innerHTML = I('square'); go.dataset.tip = '停下（Esc）'; go.classList.add('stop'); $r('#chkh').textContent = '↵ 补充给它 · Esc 停下';
    ctx.lock?.(true);
  };
  // keepLog：服务断了时别去重画对话（重画会把断连提示冲掉）
  const busyOff = async (changed = [], keepLog = false) => {
    running = false; S.agentStop = null; ctx.lock?.(false); const go = $r('#chgo');
    if (go) { go.innerHTML = I('arrow-up'); go.dataset.tip = '发送（回车）'; go.classList.remove('stop'); $r('#chkh').textContent = '↵ 发送 · ⇧↵ 换行'; }
    if (changed.length) await ctx.onChanged?.(changed);
    ctx.onDone?.();
    if (keepLog) return;
    await redraw();
    waitMemo();
  };
  // 按服务端的进度画“正在做”的那一块（页面刷新后接上、连接断了时用）
  const follow = async t0 => {
    if (!$r('#pend')) { if (log.querySelector('.as-empty')) log.innerHTML = ''; log.insertAdjacentHTML('beforeend', pendHtml()); }
    let st, last = '在想怎么做', seen = 0, fails = 0;
    for (;;) {
      st = await SAPI(p, 'agent-status').catch(() => null);
      if (st === null) { if (++fails >= 3) return true; await new Promise(r => setTimeout(r, 1500)); continue; }   // 连不上服务：连错 3 次当它断了
      fails = 0;
      if (!st.running) return false;
      const pend = $r('#pend');
      if (pend) {
        if (st.text) pend.querySelector('.md').innerHTML = mdToHtml(st.text);
        const steps = st.steps || [];
        if (steps.length !== seen) { pend.querySelector('.steps').innerHTML = steps.map(x => `<div>${I(x.icon || 'chevron-right')}<span>${esc(x.text)}</span></div>`).join(''); seen = steps.length; last = steps[steps.length - 1]?.text || last; log.scrollTop = 1e9; }
        const x = pend.querySelector('.stat span'); if (x) x.textContent = `${last}… ${((Date.now() - (t0 || Date.parse(st.startedAt))) / 1000) | 0} 秒`;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  };
  // 服务连不上时：撤掉转圈，说清楚，给「重新发送」（消息还没到服务端时从本地重发，带上附的图）
  let lostLocal = null;
  const lostBlock = (why, local) => {
    lostLocal = local || null; $r('#pend')?.remove();
    log.insertAdjacentHTML('beforeend', `<div class="unfin">${I('triangle-alert')}<span>${why}：连不上工作台服务，可能被重启或关掉了。服务起来后${local ? '点「重新发送」' : '刷新页面'}。</span>${local ? `<button class="tbtn" data-relocal>${I('refresh-cw')}重新发送</button>` : `<button class="tbtn" data-reload>${I('refresh-cw')}刷新</button>`}</div>`);
    log.scrollTop = 1e9;
  };
  const sendAgent = async text => {
    await S.flush?.();
    if (log.querySelector('.as-empty')) log.innerHTML = '';
    if (refs.some(r => r.busy)) return toast('视频还在拆关键帧，等一下再发', true);
    const keep = refs, sent = flatRefs(refs); refs = []; drawRefs();
    // 上一轮没完成留下的那条消息先拿掉，免得重复显示
    log.querySelector('.unfin')?.remove();
    log.insertAdjacentHTML('beforeend', `${meMsg(text, sent.map(r => r.data))}${pendHtml()}`); log.scrollTop = 1e9;
    $r('#chatin').value = '';
    const ctrl = new AbortController(); busyOn(ctrl);
    const t0 = Date.now(); let acc = '', last = '在想怎么做', changed = [], finished = false, reached = false;
    const stat = () => { const x = $r('#pend .stat span'); if (x) x.textContent = `${last}… ${((Date.now() - t0) / 1000) | 0} 秒`; };
    const tick = setInterval(stat, 1000);
    const onEv = ev => {
      if (ev.type === 'done' || ev.type === 'error') finished = true;
      const pend = $r('#pend'); if (!pend) return;
      if (ev.type === 'text') { acc += ev.text; pend.querySelector('.md').innerHTML = mdToHtml(acc); last = '在写回复'; }
      if (ev.type === 'step') { pend.querySelector('.steps').insertAdjacentHTML('beforeend', `<div>${I(ev.icon || 'chevron-right')}<span>${esc(ev.text)}</span></div>`); last = ev.text; }
      if (ev.type === 'files') changed = ev.files || [];
      if (ev.type === 'error') throw new Error(ev.error);
      stat(); log.scrollTop = 1e9;
    };
    try {
      const r = await wbFetch(`/api/projects/${enc(p.id)}/studio/agent`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, focus: ctx.focusText?.() || '', stage: ctx.stage || '', provider: getProv(), images: sent }) });
      reached = true;
      if (!r.ok) { const j = await r.json().catch(() => ({})); finished = true; throw new Error(j.error || r.statusText); }
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onEv(JSON.parse(line)); }
      }
    } catch (err) { if (err.name !== 'AbortError' && finished) toast(err.message, true); }
    clearInterval(tick);
    // 连接中途断了但任务还在跑：改成查进度接着等；服务整个连不上就说清楚，别一直转圈
    if (!finished && !ctrl.signal.aborted) {
      const dead = await follow(t0);
      if (dead) { await busyOff([], true); lostBlock(reached ? '连接断了' : '这条没发出去', reached ? null : { text, refs: keep }); return; }
      changed = ['?'];
    }
    await busyOff(changed);
  };
  // 打开页面时，这个项目有任务在跑就接上
  const resume = async () => {
    const st = await SAPI(p, 'agent-status').catch(() => null);
    if (!st?.running || running) return;
    busyOn(null); const dead = await follow(); await busyOff(dead ? [] : ['?'], dead).catch(() => {}); if (dead) lostBlock('连接断了');
  };
  // 记忆整理在后台跑（几秒到十几秒），整理完把“记住了……”补到这一轮下面
  const waitMemo = () => {
    let n = 0;
    const tick = async () => {
      if (!log.isConnected || S.agentStop || ++n > 10) return;
      const h = await SAPI(p, 'chat').catch(() => null); const last = h && [...h].reverse().find(x => x.role === 'ai');
      if (S.agentStop || running) return;
      if (last?.memoDone) { if (last.memo?.length) drawChat(h); return; }
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  };
  const send = async text => {
    text = (text || '').trim(); if (!text && refs.length) text = '参考这几张图来改'; if (!text) return $r('#chatin').focus();
    if (isAgent()) return sendAgent(text);
    if (!ctx.legacy) return toast('这里的助手要用 Claude 或 Claude Code：在输入框下面换一个', true);
    if (refs.length) return toast('参考图要用 Claude 或 Claude Code 才能看：在输入框下面换一个再发', true);
    await S.flush?.();
    if (log.querySelector('.as-empty')) log.innerHTML = '';
    log.insertAdjacentHTML('beforeend', `<div class="msg me">${esc(text)}</div><div class="msg ai pending" id="pend">${I('loader-circle', 'spinning')}<span>正在读全文…</span></div>`); log.scrollTop = 1e9;
    $r('#chatin').value = ''; const t0 = Date.now();
    const tick = setInterval(() => { const x = $r('#pend span'); if (x) x.textContent = `正在读全文、想怎么改… ${((Date.now() - t0) / 1000) | 0} 秒`; }, 1000);
    try {
      const r = await SAPI(p, 'chat', 'POST', { message: text, focus: ctx.focusText?.() || '', provider: getProv() });
      clearInterval(tick); await ctx.legacy.after(r); drawChat(await SAPI(p, 'chat')); waitMemo();
    } catch (e) { clearInterval(tick); $r('#pend').outerHTML = `<div class="msg ai"><div class="aierr">${esc(e.message)}</div></div>`; }
  };
  $r('#chgo').onclick = () => S.agentStop ? S.agentStop.abort() : send($r('#chatin').value);
  $r('#chatt').onclick = () => $r('#chfile').click();
  $r('#chfile').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $r('#refs').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { refs.splice(+b.dataset.rm, 1); drawRefs(); } };
  const chatin = $r('#chatin');
  chatin.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])].filter(f => /^(image|video)\//.test(f.type)); if (fs.length) { e.preventDefault(); addFiles(fs); } });
  root.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); root.classList.add('drop'); } });
  root.addEventListener('dragleave', e => { if (!root.contains(e.relatedTarget)) root.classList.remove('drop'); });
  root.addEventListener('drop', e => { root.classList.remove('drop'); if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  const grow = () => { chatin.style.height = 'auto'; chatin.style.height = Math.min(220, chatin.scrollHeight) + 'px'; };
  chatin.addEventListener('input', grow); grow();
  chatin.onkeydown = e => {
    if (e.key === 'Escape' && S.agentStop) { e.preventDefault(); S.agentStop.abort(); return; }
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    if (e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (S.agentStop) return injectMsg(chatin.value);
    send(chatin.value); grow();
  };
  // 助手干活时又想到什么：直接交给正在做的任务，它下一步就会看到
  const injectMsg = async text => {
    text = String(text || '').trim(); if (!text) return;
    if (refs.length) return toast('参考图要等这一轮做完再发', true);
    try { await SAPI(p, 'agent-inject', 'POST', { text }); } catch (e) { return toast(e.message, true); }
    const pend = $r('#pend'), html = `<div class="msg me inj"><div class="injtag">${I('message-square')}补充给正在做的任务</div>${esc(text).replace(/\n/g, '<br>')}</div>`;
    if (pend) pend.insertAdjacentHTML('beforebegin', html); else log.insertAdjacentHTML('beforeend', html);
    log.scrollTop = 1e9; chatin.value = ''; grow();
  };
  $r('#chclr').onclick = async () => { await SAPI(p, 'chat', 'DELETE'); drawChat([]); };
  $r('#chmem').onclick = () => memoryDlg();
  $r('#chsk').onclick = () => skillsDlg();
  $r('#prov').addEventListener('change', () => { if (!log.querySelector('.msg')) drawChat([]); drawRefs(); });
  const setFocus = f => { const fi = $r('#focusinfo'); fi.hidden = !f; fi.querySelector('span').textContent = f ? `AI 会重点看${card ? '你选中的' : '你选中的'}「${f.slice(0, 22)}${f.length > 22 ? '…' : ''}」` : ''; };
  // 从正文里的编号跳回这张卡片
  const showDecision = id => { const el = log.querySelector(`[data-dec="${CSS.escape(id)}"]`); if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.toggle('dflash', false); void el.offsetWidth; el.classList.add('dflash'); };
  return { getProv, isAgent, send, setFocus, showDecision, draw: async h => { await loadJobs(); const st = await SAPI(p, 'agent-status').catch(() => null); running = !!st?.running; drawChat(h || await SAPI(p, 'chat')); running = false; if (st?.running) resume();
    // 刚新建、勾了“让 AI 按要求先写一版”：进来就发出去
    else if (S.autoSend?.pid === p.id) { const t = S.autoSend.text; S.autoSend = null; setTimeout(() => send(t), 300); } }, focus: () => chatin.focus() };
}

// 全局记忆：所有文章和卡片的 AI 助手每次都会先读
async function memoryDlg(keepScroll) {
  const d = await api('GET', '/api/memory');
  const kinds = d.kinds, scopes = d.scopes || {}, SRC = { seed: '默认', agent: '你让它记的', manual: '你加的', user: '你加的', auto: '对话里学的', learn: '复盘学到的', edits: '从手改学的', tidy: '整理' };
  const projTitle = id => d.projects?.find(x => x.id === id)?.title || S.projects.find(x => x.id === id)?.title || id || '';
  const wk = await api('GET', '/api/works').catch(() => ({ works: [], pending: [] }));
  const workRow = w => `<div class="wk" data-wid="${esc(w.id)}"><div class="wk-h"><b>《${esc(w.title)}》</b><span class="ty">${(w.published || []).map(r => esc(r.platform)).join('、')} · 复盘于 ${esc(w.learnedAt.slice(5, 16).replace('T', ' '))} · 学到 ${w.memo?.length || 0} 条</span><div class="sp"></div><button class="tbtn" data-relearn>${I('refresh-cw')}重新复盘</button><button class="icb sm" data-wdel data-tip="不再参照这篇">${I('x')}</button></div>
    <div class="wk-b">${esc(w.summary)}${w.structure ? `<br><span class="ty">结构：${esc(w.structure)}</span>` : ''}${w.good?.length ? `<br><span class="ty">做得好：${w.good.map(x => esc(x.replace(/[。；;]+$/, ''))).join('；')}</span>` : ''}${w.lessons?.length ? `<br><span class="ty">上次费劲的地方：${w.lessons.map(x => esc(x.replace(/[。；;]+$/, ''))).join('；')}</span>` : ''}</div></div>`;
  const meta = x => [kinds[x.kind], x.scope === 'project' ? `只《${projTitle(x.project).slice(0, 14)}》` : x.scope !== 'all' ? `只管${scopes[x.scope] || x.scope}` : '', SRC[x.source] || '', x.hits ? `印证 ${x.hits}${x.projects?.length > 1 ? `（${x.projects.length} 篇）` : ''}` : '', x.misses ? `推翻 ${x.misses}` : '', x.caught ? `自查拦下 ${x.caught}` : '', x.used ? `带进提示 ${x.used} 次` : '', x.undone ? `撤销过 ${x.undone}` : ''].filter(Boolean).join(' · ');
  const row = (x, acts) => `<div class="mi2" data-id="${x.id}"><div class="mbody"><div class="mt" contenteditable="true" spellcheck="false">${esc(x.text)}</div>
      <div class="mmeta">${esc(meta(x))}${x.why ? `<span class="mwhy">为什么：${esc(x.why)}</span>` : ''}${x.check ? `<span class="mchk">${I('scan-text')}自查：${esc(x.check)}</span>` : ''}${x.archivedWhy ? `<span class="mwhy">归档原因：${esc(x.archivedWhy)}</span>` : ''}</div>
      ${x.detail ? `<details class="mdet"><summary>怎么做</summary><div>${esc(x.detail)}</div></details>` : ''}</div><div class="macts">${acts}</div></div>`;
  const btn = (act, label, tip = '') => `<button class="tbtn" data-act="${act}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${label}</button>`;
  const del = `<button class="icb sm" data-act="del" data-tip="删掉">${I('trash-2')}</button>`;
  const L = d.items, live = x => x.status === 'active';
  // 最近学到：所有写入的流水，作者看到不对就撤（印证这类小动作不显示）
  const OPL = { add: '学到', update: '改写', promote: '升为守则', demote: '降为卡片', miss: '被推翻', archive: '归档', restore: '恢复', remove: '删掉', tidy: '整理' };
  const logs = (d.log || []).filter(e => !e.revoked && e.op !== 'hit' && e.op !== 'tidy').slice(0, 30);
  const logRow = e => `<div class="mlg${e.conflictWith?.length ? ' conflict' : ''}" data-lid="${esc(e.lid)}"><span class="mlo ${e.op}">${OPL[e.op] || e.op}</span><div class="mlb"><div class="mlt">${esc(e.text || '')}${e.tier === 'rule' ? '<em>守则</em>' : ''}</div><div class="ty">${esc(e.t.slice(5, 16).replace('T', ' '))} · ${SRC[e.source] || esc(e.source || '')}${e.project ? ` · 《${esc(projTitle(e.project).slice(0, 12))}》` : ''}${e.conflictWith?.length ? ` · 和 ${e.conflictWith.length} 条旧记忆说反了，旧的记了一次推翻` : ''}</div></div>${['add', 'update', 'promote', 'demote', 'miss', 'archive'].includes(e.op) ? `<button class="tbtn" data-revert>${I('undo-2')}不对</button>` : ''}</div>`;
  const rules = L.filter(x => live(x) && x.tier === 'rule' && x.scope !== 'project' && x.kind !== 'phrase').sort((a, b) => (b.hits - b.misses * 2) - (a.hits - a.misses * 2));
  const proj = L.filter(x => live(x) && x.scope === 'project');
  const phrases = L.filter(x => live(x) && x.kind === 'phrase' && x.scope !== 'project');
  const cards = L.filter(x => live(x) && x.tier === 'card' && x.scope !== 'project' && x.kind !== 'phrase');
  const arch = L.filter(x => x.status === 'archived');
  const sec = (title, tip, body) => `<div class="msec"><div class="mg-h">${title}${tip ? `<span class="ty">　${tip}</span>` : ''}</div>${body}</div>`;
  const byKind = xs => Object.entries(kinds).map(([k, n]) => { const ys = xs.filter(x => x.kind === k); return ys.length ? `<div class="mkind">${esc(n)}</div>${ys.map(x => row(x, btn('promote', '升为守则', '不等证据，直接定成守则') + del)).join('')}` : ''; }).join('');
  const byProj = Object.entries(proj.reduce((m, x) => ((m[x.project] ||= []).push(x), m), {}));
  const rep = d.report;
  layer.innerHTML = `<div class="mask"><div class="dlg wide2 memdlg"><h3>AI 记忆</h3><div class="bd">
    <div class="memtop"><div class="ty">助手每轮开工前，按这一轮要做的事（出大纲、改标题、配图、润色……）从这里挑记忆带上：<b>守则</b>是证据够多、换哪篇都成立的硬规矩；<b>卡片</b>是刚学到的、做法类的，和手上的事相关时才带；<b>只这一篇</b>的约定只在那篇里生效。对话、复盘、你的手改里学到的东西直接生效，不用你审批，不对的在「最近学到」里点一下「不对」就撤。卡片在两篇以上文章里被印证会升成守则，守则被推翻两次以上会降回卡片。</div>
      <label class="memauto"><span class="sw"><input type="checkbox" id="mauto" ${d.auto ? 'checked' : ''}><i></i></span>自动学习</label></div>
    <div class="mtools"><button class="btn sm" id="mtidy" data-tip="合并重复、拆开太长的、分好守则和卡片、归档过时的；整理前会留备份">${I('sparkles')}整理一下</button>
      ${d.canUndo ? `<button class="btn sm" id="muntidy">${I('undo-2')}撤销上次整理</button>` : ''}
      <button class="btn sm" id="medits" data-tip="AI 改完以后你又亲手改了哪些地方，找出反复出现的改法">${I('pen-line')}从手改里学${d.editPairs ? `（${d.editPairs} 处）` : ''}</button>
      <div class="sp"></div><span class="ty">守则 ${rules.length} · 卡片 ${cards.length}${arch.length ? ` · 归档 ${arch.length}` : ''}</span></div>
    ${rep ? `<div class="mrep">${I('sparkles')}<div><b>上次整理</b>（${esc(rep.t.slice(5, 16).replace('T', ' '))}，改了 ${rep.changes} 处）：${esc(rep.summary || '')}${rep.lines?.length ? `<details><summary>明细</summary>${rep.lines.map(l => `<div>${{ edit: '改写', merge: `合并 ${l.n} 条`, split: `拆成 ${l.n} 条`, archive: '归档', demote: '降为卡片' }[l.op] || l.op}：${esc(l.text)}</div>`).join('')}</details>` : ''}</div></div>` : ''}
    ${logs.length ? sec('最近学到', '都已经生效了；哪条不对点「不对」，当场撤掉', `<div class="mlogs">${logs.map(logRow).join('')}</div>`) : ''}
    ${sec(`守则 ${rules.length} / 15`, '证据够多、换哪篇都成立；证据最足的几条每次都带，其余按这一轮的事挑', rules.map(x => row(x, btn('demote', '降为卡片', '不再固定带，和手上的事相关时才带') + del)).join('') || '<div class="ty">还没有</div>')}
    ${byProj.length ? sec('只这一篇', '只在那篇文章或卡片里生效', byProj.map(([pid, xs]) => `<div class="mkind">《${esc(projTitle(pid))}》</div>${xs.map(x => row(x, btn('global', '改成全部适用') + del)).join('')}`).join('')) : ''}
    ${phrases.length ? sec('口头说法', '你常说的话实际指什么，助手照这个理解', phrases.map(x => row(x, del)).join('')) : ''}
    ${sec(`卡片 ${cards.length}`, '刚学到的、做法类的；和这一轮要做的事相关时自动带给助手；在两篇以上文章里被印证会升成守则', byKind(cards) || '<div class="ty">还没有</div>')}
    ${arch.length ? `<details class="march"><summary class="mg-h">已归档 ${arch.length} 条（不再带给助手）</summary>${arch.map(x => row(x, btn('restore', '恢复') + del)).join('')}</details>` : ''}
    <div class="mg wks"><div class="mg-h">复盘过的作品<span class="ty">　标成「已发布」后自动复盘，写下一篇时助手会参照它们的切入、结构和写法</span></div>
      ${wk.works.map(workRow).join('') || '<div class="ty">还没有复盘过的作品</div>'}
      ${wk.pending?.length ? `<div class="wk-p"><span class="ty">${wk.pending.length} 篇已发布还没复盘：${wk.pending.map(p => '《' + esc(p.title) + '》').join('')}</span><button class="btn sm pri" data-learnall>${I('sparkles')}现在复盘</button></div>` : ''}</div>
    <div class="madd"><select class="sel" id="mkind">${Object.entries(kinds).map(([k, n]) => `<option value="${k}" ${k === 'style' ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select><select class="sel" id="mtier"><option value="rule">守则</option><option value="card">卡片</option></select><input id="mtext" placeholder="加一条，比如：标题不超过 20 个字"><button class="btn pri" id="mok">记住</button></div>
  </div><div class="ft"><span class="ty">改文字直接点进去改，离开就保存</span><div class="sp"></div><button class="btn pri" data-close>完成</button></div></div></div>`;
  const bd = layer.querySelector('.memdlg .bd'); if (keepScroll) bd.scrollTop = keepScroll;
  const again = () => memoryDlg(bd.scrollTop);
  $$('.mi2', layer).forEach(r => {
    const t = r.querySelector('.mt'), orig = t.textContent, id = r.dataset.id;
    t.onblur = async () => { const v = t.textContent.trim(); if (v === orig) return; try { await api('PUT', `/api/memory/${id}`, { text: v }); toast('已保存'); } catch (e) { toast(e.message, true); t.textContent = orig; } };
    t.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); t.blur(); } };
    r.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const act = b.dataset.act, patch = { keep: { status: 'active' }, promote: { tier: 'rule' }, demote: { tier: 'card' }, restore: { status: 'active' }, global: { scope: 'all' } }[act];
      try {
        if (act === 'del' || act === 'drop') await api('DELETE', `/api/memory/${id}`);
        else await api('PUT', `/api/memory/${id}`, { ...(t.textContent.trim() !== orig ? { text: t.textContent.trim() } : {}), ...patch });
        again();
      } catch (e) { toast(e.message, true); }
    });
  });
  $('#mauto').onchange = async e => { await api('PUT', '/api/memory', { auto: e.target.checked }); toast(e.target.checked ? '对话、复盘和手改里会自动学，不对的在「最近学到」里撤' : '不再自动学，只在你说“记住”时记'); };
  $$('[data-revert]', layer).forEach(b => b.onclick = async () => { try { await api('POST', '/api/memory/revert', { lid: b.closest('[data-lid]').dataset.lid }); toast('撤掉了'); again(); } catch (e) { toast(e.message, true); } });
  const busyRun = async (b, label, fn) => { b.disabled = true; const t0 = Date.now(), lab = b.innerHTML; const tk = setInterval(() => { b.innerHTML = `${I('loader-circle', 'spinning')}${label} ${((Date.now() - t0) / 1000) | 0} 秒`; }, 500); try { await fn(); } catch (e) { toast(e.message, true); } clearInterval(tk); if (b.isConnected) { b.disabled = false; b.innerHTML = lab; } };
  $('#mtidy').onclick = e => busyRun(e.currentTarget, '整理中', async () => { const r = await api('POST', '/api/memory/tidy', {}); toast(`整理好了，改了 ${r.changes} 处`); again(); });
  $('#muntidy') && ($('#muntidy').onclick = async () => { try { await api('POST', '/api/memory/untidy', {}); toast('已恢复到整理前'); again(); } catch (e) { toast(e.message, true); } });
  $('#medits').onclick = e => busyRun(e.currentTarget, '在看你的手改', async () => { const r = await api('POST', '/api/memory/edits', {}); toast(r.pairs ? `看了 ${r.learned} 处手改，学到 ${r.done.length} 条` : '还没有攒下手改：AI 改完正文后你再亲手改，这里就会记下来'); again(); });
  const runLearn = (b, body, done) => busyRun(b, '复盘中', async () => { const r = await api('POST', '/api/works/learn', body); toast(done(r)); again(); });
  $$('[data-relearn]', layer).forEach(b => b.onclick = () => runLearn(b, { project: b.closest('[data-wid]').dataset.wid }, w => `复盘好了，学到 ${w.memo.length} 条`));
  $$('[data-wdel]', layer).forEach(b => b.onclick = async () => { await api('DELETE', `/api/works/${enc(b.closest('[data-wid]').dataset.wid)}`); again(); });
  $('[data-learnall]', layer) && ($('[data-learnall]', layer).onclick = e => runLearn(e.currentTarget, {}, r => `复盘了 ${r.results.length} 篇`));
  const add = async () => { const v = $('#mtext').value.trim(); if (!v) return $('#mtext').focus(); try { await api('POST', '/api/memory', { text: v, kind: $('#mkind').value, tier: $('#mtier').value }); again(); } catch (e) { toast(e.message, true); } };
  $('#mok').onclick = add; $('#mtext').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) add(); };
}


// 技能：本机已有的 + 工作台装的，开关给助手用；也能在 GitHub 上搜着装
async function skillsDlg(q = '') {
  const l = await api('GET', '/api/skills');
  const groups = [['ws', '工作台装的'], ['cc', '本机 Claude Code'], ['ag', '本机 Agents']];
  const row = s => `<div class="ski${s.enabled ? ' on' : ''}" data-id="${esc(s.id)}"><label class="sw"><input type="checkbox" ${s.enabled ? 'checked' : ''}><i></i></label>
    <div class="skt"><b>${esc(s.name)}</b><span>${esc(s.description || '没有说明')}</span>${s.origin ? `<a class="ty" href="${esc(s.origin)}" target="_blank" rel="noopener">来源</a>` : ''}</div>
    <button class="icb sm" data-view data-tip="看说明">${I('book-open')}</button>${s.source === 'ws' ? `<button class="icb sm" data-del data-tip="删掉">${I('trash-2')}</button>` : ''}</div>`;
  layer.innerHTML = `<div class="mask"><div class="dlg wide2 skdlg"><h3>技能</h3><div class="bd">
    <div class="ty">技能是做某类事的方法和规则（一个 SKILL.md）。打开的技能会告诉 AI 助手，它做相关的事之前先读一遍。技能里的脚本和命令不会执行，只用文字说明。</div>
    <div class="skfind"><div class="pz-q">${I('search')}<input id="skq" placeholder="在 GitHub 上找技能，比如：去 AI 味、小红书文案、公众号排版" value="${esc(q)}"></div><button class="btn pri" id="skgo">搜索</button></div>
    <div id="skres"></div>
    ${groups.map(([k, n]) => { const xs = l.filter(s => s.source === k); return `<div class="skg"><div class="mg-h">${n}<span class="ty">　${xs.filter(s => s.enabled).length} / ${xs.length} 个打开</span></div>${xs.map(row).join('') || '<div class="ty">还没有。在上面搜一个装上</div>'}</div>`; }).join('')}
  </div><div class="ft"><span class="ty">也可以让 AI 助手自己去找：“帮我找个写小红书标题的技能”</span><div class="sp"></div><button class="btn pri" data-close>完成</button></div></div></div>`;
  $$('.ski', layer).forEach(r => {
    r.querySelector('input').onchange = async e => { await api('PUT', `/api/skills/${enc(r.dataset.id)}`, { enabled: e.target.checked }); r.classList.toggle('on', e.target.checked); };
    r.querySelector('[data-view]').onclick = async () => {
      const d = await api('GET', `/api/skills/${enc(r.dataset.id)}/md`);
      r.insertAdjacentHTML('afterend', `<pre class="skmd">${esc(d.md.slice(0, 20000))}</pre>`); r.querySelector('[data-view]').remove();
    };
    r.querySelector('[data-del]') && (r.querySelector('[data-del]').onclick = async () => { await api('DELETE', `/api/skills/${enc(r.dataset.id)}`); skillsDlg($('#skq').value); });
  });
  const go = async () => {
    const v = $('#skq').value.trim(); if (!v) return $('#skq').focus();
    const box = $('#skres'); box.innerHTML = `<div class="ty">${I('loader-circle', 'spinning')}在 GitHub 上找…</div>`;
    try {
      const r = /github\.com\//.test(v) ? (await api('GET', `/api/skills/inspect?url=${enc(v)}`)).skills : await api('GET', `/api/skills/search?q=${enc(v)}`);
      box.innerHTML = r.length ? `<div class="skg"><div class="mg-h">GitHub 上找到的<span class="ty">　装之前可以点仓库链接看看内容</span></div>${r.map((x, i) => `<div class="ski res"><div class="skt"><b>${esc(x.name)}${x.stars != null ? `<em>${x.stars}★</em>` : ''}</b><span>${esc(x.description || '')}</span><a class="ty" href="https://github.com/${esc(x.repo)}/blob/HEAD/${esc(x.path)}" target="_blank" rel="noopener">${esc(x.repo)}/${esc(x.path)}</a></div><button class="btn sm" data-inst="${i}">${I('download')}安装</button></div>`).join('')}</div>` : '<div class="ty">没搜到，换个关键词（英文效果更好）</div>';
      $$('[data-inst]', box).forEach(b => b.onclick = async () => {
        const x = r[+b.dataset.inst]; b.disabled = true; b.innerHTML = `${I('loader-circle', 'spinning')}安装中`;
        try { const sk = await api('POST', '/api/skills/install', { repo: x.repo, path: x.path, ref: x.ref }); toast('装好了：' + sk.name); skillsDlg(v); } catch (e) { toast(e.message, true); b.disabled = false; b.innerHTML = `${I('download')}安装`; }
      });
    } catch (e) { box.innerHTML = `<div class="aierr">${esc(e.message)}</div>`; }
  };
  $('#skgo').onclick = go; $('#skq').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) go(); };
  if (q) go();
}


/* 文章模板：左边按来源分组的缩略图，右边大预览。pick：新建时选一个；apply：给这篇文章换模板 */
async function tplDlg({ mode = 'pick', p = null, current = '', onPick, onApplied } = {}) {
  const [l, st] = await Promise.all([api('GET', '/api/templates'), p ? SAPI(p, 'template').catch(() => ({})) : {}]);
  const usable = l.filter(t => !(p && t.project === p.id));
  let sel = usable.find(t => t.id === current) || usable[0];
  const box = document.createElement('div'); box.className = 'mask tplmask'; document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const groups = [['我的文章', '你其他文章现在用的样式'], ['墨滴 mdnice', '来自 mdnice/markdown-nice 的开源主题'], ['doocs/md', '来自 doocs/md 的开源主题']];
  const card = t => `<button class="tpc${t.id === sel?.id ? ' on' : ''}" data-id="${esc(t.id)}"><div class="tpi"><img loading="lazy" src="/tpl-preview/${enc(t.id)}" alt=""></div><b>${esc(t.name)}</b><span>${esc(t.desc || '')}</span></button>`;
  const draw = () => {
    const sc = box.querySelector('.tplist')?.scrollTop || 0;
    box.innerHTML = `<div class="dlg tpldlg"><h3>${mode === 'apply' ? `给《${esc(p.title.slice(0, 20))}》换模板` : '选一个模板'}</h3><div class="tpbody">
      <div class="tplist">${groups.map(([g, tip]) => { const xs = usable.filter(t => t.group === g); return xs.length ? `<div class="mg-h">${g}<span class="ty">　${tip}</span></div><div class="tpgrid">${xs.map(card).join('')}</div>` : ''; }).join('')}</div>
      <div class="tpview">${sel ? `<div class="tpv-h"><b>${esc(sel.name)}</b><span class="ty">${esc(sel.desc || '')}${sel.author ? ' · 作者 ' + esc(sel.author) : ''}${sel.license ? ' · ' + esc(sel.source) + '（' + esc(sel.license) + '）' : ''}</span></div><div class="tpv-img"><img src="/tpl-preview/${enc(sel.id)}" alt=""></div>` : ''}</div>
    </div><div class="ft">${mode === 'apply' && st.canRevert ? `<button class="btn" id="tprev">${I('undo-2')}恢复换模板前的样式</button>` : `<span class="ty">${mode === 'apply' ? '只换样式，正文不动；换完会重新构建' : '预览用的是一篇示例文章'}</span>`}<div class="sp"></div><button class="btn" data-x>取消</button><button class="btn pri" id="tpok" ${sel ? '' : 'disabled'}>${mode === 'apply' ? `${I('palette')}套用到这篇` : `${I('check')}用这个`}</button></div></div>`;
    box.querySelector('.tplist').scrollTop = sc;
    box.querySelector('[data-x]').onclick = close;
    box.querySelector('#tpok').onclick = async () => {
      if (mode === 'pick') { close(); onPick?.(sel); return; }
      const b = box.querySelector('#tpok'); b.disabled = true; b.innerHTML = `${I('loader-circle', 'spinning')}换模板、重新构建中`;
      try { await S.flush?.(); const r = await SAPI(p, 'template', 'POST', { template: sel.id }); toast(r.built ? `换成了「${sel.name}」，已重新构建` : `换成了「${sel.name}」，但构建报错了：${r.error}`, !r.built); close(); onApplied?.(); }
      catch (e) { toast(e.message, true); b.disabled = false; b.innerHTML = `${I('palette')}套用到这篇`; }
    };
    const rv = box.querySelector('#tprev');
    if (rv) rv.onclick = async () => { rv.disabled = true; try { await SAPI(p, 'template', 'POST', { revert: true }); toast('已恢复换模板前的样式'); close(); onApplied?.(); } catch (e) { toast(e.message, true); rv.disabled = false; } };
  };
  box.onclick = e => { if (e.target === box) return close(); const c = e.target.closest('.tpc'); if (c) { sel = usable.find(t => t.id === c.dataset.id); draw(); } };
  box.ondblclick = e => { if (e.target.closest('.tpc')) box.querySelector('#tpok')?.click(); };
  draw();
}
