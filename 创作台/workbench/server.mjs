// 工作台网页服务：node server.mjs [--port 5288]
// 只监听 127.0.0.1。写操作要带启动时生成的令牌（网页里自动带上），别的网站没法借你的浏览器改东西。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as core from './core.mjs';
import * as ai from './ai.mjs';
import * as ed from './edit.mjs';
import * as st from './studio.mjs';
import * as pz from './plaza.mjs';
import * as xapi from './x.mjs';
import * as agent from './agent.mjs';
import * as assets from './assets.mjs';
import * as images from './images.mjs';
import * as memory from './memory.mjs';
import * as skills from './skills.mjs';
import * as tpl from './templates.mjs';
import * as post from './post.mjs';
import * as cn from './cn.mjs';
import * as learn from './learn.mjs';
import * as edits from './edits.mjs';
import * as video from './video.mjs';
import * as videoSetup from './video-setup.mjs';
import * as tts from './tts.mjs';
import * as breakdown from './breakdown.mjs';
import { execFile } from 'node:child_process';
import { openArgs } from './platform.mjs';

const argPort = process.argv.indexOf('--port');
const PORT = argPort > 0 ? +process.argv[argPort + 1] : core.config().port;
// 嵌在别的应用里时（比如 DeepSeek Harness 客户端），由启动它的程序指定令牌，好替用户新建项目；平时每次启动随机生成
// 写操作的令牌：存在 data/.token（权限 600），服务重启后沿用，已经打开的页面不会失效
const TOKEN = process.env.WB_TOKEN || (() => {
  const f = path.join(core.DATA_DIR, '.token');
  try { const t = fs.readFileSync(f, 'utf8').trim(); if (/^[0-9a-f]{32}$/.test(t)) return t; } catch {}
  const t = crypto.randomBytes(16).toString('hex'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, { mode: 0o600 }); return t;
})();
// 预览页默认只许工作台自己嵌入；被别的应用嵌入时，WB_FRAME_ANCESTORS 列出还允许哪些来源（CSP frame-ancestors 的写法）
const FRAME_ANCESTORS = ["'self'", ...(process.env.WB_FRAME_ANCESTORS || '').split(/\s+/).filter(Boolean)].join(' ');
const WEB = path.join(core.APP_DIR, 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.mjs': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };


// 边生成边把文字写回网页
async function stream(req, res, run) {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  try { await run(t => res.write(t)); res.end(); }
  catch (e) { res.end(`\n\n[[出错：${e.message}]]`); }
}
// 网页关掉或点了停止：连接断开但响应还没写完，就中止生成
function abortOn(res) { const c = new AbortController(); res.on('close', () => { if (!res.writableEnded) c.abort(); }); return c.signal; }

// 网页代码的版本：web/ 下文件的最新修改时间，网页发现变了就自动刷新
function webVersion() { return Math.max(...fs.readdirSync(WEB).map(f => fs.statSync(path.join(WEB, f)).mtimeMs)); }

const busy = new Set();   // 同一个项目同时只跑一个构建/打包

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function sendFile(res, f, extraHeaders = {}) {
  const ext = path.extname(f).toLowerCase();
  const head = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...extraHeaders };
  if (ext === '.zip') head['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(f))}`;
  res.writeHead(200, head);
  fs.createReadStream(f).pipe(res);
}
// 音视频文件：带 Range（浏览器拖进度条要用），dl 时当附件下载
const MEDIA = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
function sendMedia(req, res, f, download) {
  const ext = path.extname(f).toLowerCase(), size = fs.statSync(f).size;
  const head = { 'Content-Type': MEDIA[ext] || TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes', 'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}` };
  if (download) head['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(f))}`;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let a = m[1] ? +m[1] : Math.max(0, size - +m[2]), b = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (a > b || a >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
    return fs.createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  fs.createReadStream(f).pipe(res);
}
async function body(req, max = 2e6) {
  let s = ''; for await (const c of req) { s += c; if (s.length > max) throw new Error('请求太大'); }
  return s ? JSON.parse(s) : {};
}
function projectDir(id) {
  const d = core.list().find(p => p.id === id)?.dir;
  if (!d) throw Object.assign(new Error('没有这个项目：' + id), { status: 404 });
  return d;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    // 写操作：校验来源和令牌
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) return send(res, 403, { error: '来源不对' });
      if (req.headers['x-wb-token'] !== TOKEN) return send(res, 403, { error: '令牌不对，刷新页面再试', code: 'token' });
    }

    // 页面
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').replace('__TOKEN__', TOKEN), TYPES['.html']);
    }
    if (parts[0] === 'web') {
      const f = path.resolve(WEB, parts.slice(1).join('/'));
      if (!f.startsWith(WEB + path.sep) || !fs.existsSync(f)) return send(res, 404, { error: 'not found' });
      return sendFile(res, f);
    }
    // 项目里的文件：/p/<id>/<相对路径>
    if (parts[0] === 'p' && parts[1]) {
      const f = core.safeFile(projectDir(parts[1]), parts.slice(2).join('/'));
      if (!f) return send(res, 404, { error: 'not found' });
      if (url.searchParams.get('wb') === '1' && f.endsWith('index.html'))
        return send(res, 200, ed.annotate(fs.readFileSync(f, 'utf8')), TYPES['.html']);
      return sendFile(res, f, { 'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}` });
    }

    // 模板预览图：/tpl-preview/<模板 id>（没有就现做一张）
    if (parts[0] === 'tpl-preview' && parts[1]) {
      try { const f = tpl.previewPath(parts[1]) || await tpl.preview(parts[1]); return sendFile(res, f, { 'Cache-Control': 'max-age=86400' }); } catch (e) { return send(res, 404, { error: e.message }); }
    }
    // 素材库里的图：/assets/<文件名>
    if (parts[0] === 'assets' && parts[1]) {
      const f = assets.filePath(parts[1]);
      // 网上存下来的图不可信：禁止里面跑脚本
      return f ? sendFile(res, f, { 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" }) : send(res, 404, { error: 'not found' });
    }
    // 视频板块：播放器脚本（HyperFrames 自带）、视频文件夹里的文件（预览页、素材、成片，支持拖进度条）
    if (parts[0] === 'video-rt' && ['hyperframes-player.global.js', 'hyperframe.runtime.iife.js'].includes(parts[1])) {
      const f = path.join(video.HF_DIST, parts[1]);
      return fs.existsSync(f) ? sendFile(res, f, { 'Cache-Control': 'max-age=3600' }) : send(res, 404, { error: 'not found' });
    }
    if (parts[0] === 'v-poster' && parts[1]) { const f = video.posterPath(parts[1]); return f ? sendFile(res, f) : send(res, 404, { error: 'not found' }); }
    if (parts[0] === 'v' && parts[1]) {
      const f = video.fileOf(parts[1], parts.slice(2).join('/'));
      if (!f) return send(res, 404, { error: 'not found' });
      // 预览用的画面页：塞进 HyperFrames 的运行时脚本，它负责按时间显示和隐藏每个元素（渲染成片时 HyperFrames 自己会加，这里是给网页预览补上）
      if (f.endsWith('.html')) {
        const html = fs.readFileSync(f, 'utf8'), tag = '<script src="/video-rt/hyperframe.runtime.iife.js"></script>';
        const out = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
        res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store', 'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS}` });
        return res.end(out);
      }
      return sendMedia(req, res, f, url.searchParams.get('dl') === '1');
    }
    // 拉片文件夹里的文件：下载下来的视频、截帧。不可信内容，禁止里面跑脚本
    if (parts[0] === 'b' && parts[1]) {
      const f = breakdown.fileOf(parts[1], parts.slice(2).join('/'));
      if (!f || !/\.(mp4|jpg|jpeg|png)$/i.test(f)) return send(res, 404, { error: 'not found' });
      return sendMedia(req, res, f, false);
    }
    if (parts[0] !== 'api') return send(res, 404, { error: 'not found' });
    const [, a, id, action] = parts;

    if (a === 'meta' && req.method === 'GET')
      return send(res, 200, { statuses: core.STATUSES, types: core.TYPES, tags: core.tags(), config: core.config(), port: PORT });
    if (a === 'stamp') return send(res, 200, { stamp: core.stamp(), web: webVersion() });
    if (a === 'activity') return send(res, 200, core.activity(+url.searchParams.get('limit') || 60, url.searchParams.get('id') || undefined));
    if (a === 'search') return send(res, 200, core.search(url.searchParams.get('q')));
    // 文章模板
    if (a === 'templates') {
      if (!id && req.method === 'GET') return send(res, 200, tpl.list());
      if (id === 'preview' && req.method === 'POST') { const b = await body(req); await tpl.preview(b.id, { force: true }); return send(res, 200, { ok: true }); }
    }
    // 技能
    if (a === 'skills') {
      if (!id && req.method === 'GET') return send(res, 200, skills.list().map(({ dir, ...x }) => x));
      if (id === 'search' && req.method === 'GET') return send(res, 200, await skills.search(url.searchParams.get('q')));
      if (id === 'inspect' && req.method === 'GET') return send(res, 200, await skills.inspect(url.searchParams.get('url')));
      if (id === 'install' && req.method === 'POST') { const b = await body(req); return send(res, 200, await skills.install(b)); }
      if (id && action === 'md' && req.method === 'GET') { const r = skills.read(id); return send(res, 200, { name: r.name, md: r.md, files: r.files, origin: r.origin }); }
      if (id && req.method === 'PUT') { const b = await body(req); return send(res, 200, skills.setEnabled(id, b.enabled)); }
      if (id && req.method === 'DELETE') return send(res, 200, skills.remove(id));
    }
    // 复盘过的作品：已发布的文章 / 卡片复盘后的档案
    if (a === 'works') {
      if (!id && req.method === 'GET') return send(res, 200, { works: learn.list(), busy: learn.busy(), auto: memory.autoOn(), pending: core.list().filter(p => p.status === '已发布' && !learn.list().some(w => w.id === p.id)).map(p => ({ id: p.id, title: p.title, type: p.type })) });
      if (id === 'learn' && req.method === 'POST') {
        const b = await body(req);
        if (learn.busy()) return send(res, 409, { error: `正在复盘《${learn.busy()}》，等它做完` });
        if (b.project) return send(res, 200, await learn.learn(core.resolve(b.project), { provider: b.provider }));
        return send(res, 200, { results: await learn.sweep({ force: true }) });
      }
      if (id && req.method === 'DELETE') return send(res, 200, learn.remove(decodeURIComponent(id)));
    }
    // 全局记忆
    if (a === 'memory') {
      if (!id && req.method === 'GET') return send(res, 200, { kinds: memory.KINDS, scopes: memory.SCOPES, items: memory.list(), log: memory.recent(80), ...memory.state(), editPairs: edits.pending(), projects: core.list().map(p => ({ id: p.id, title: p.title })) });
      // 「最近学到」里点「不对」：撤掉那一笔
      if (id === 'revert' && req.method === 'POST') { const b = await body(req); return send(res, 200, memory.revert(b.lid)); }
      if (!id && req.method === 'PUT') { const b = await body(req); return send(res, 200, { auto: memory.setAuto(b.auto) }); }
      // 整理：合并、拆分、分层、归档；可以撤销
      if (id === 'tidy' && req.method === 'POST') return send(res, 200, await memory.consolidate({ projects: core.list().map(p => ({ id: p.id, title: p.title })) }));
      if (id === 'untidy' && req.method === 'POST') return send(res, 200, memory.undoConsolidate());
      if (id === 'edits' && req.method === 'POST') return send(res, 200, await edits.learnPending({ force: true }));
      if (!id && req.method === 'POST') return send(res, 200, memory.add({ ...(await body(req)), source: 'manual' }));
      if (id && req.method === 'PUT') return send(res, 200, memory.update(id, await body(req)));
      if (id && req.method === 'DELETE') return send(res, 200, memory.remove(id));
    }
    // 素材库
    if (a === 'assets') {
      if (!id && req.method === 'GET') return send(res, 200, assets.list({ project: url.searchParams.get('project') || '', kind: url.searchParams.get('kind') || '', q: url.searchParams.get('q') || '' }));
      if (id === 'save' && req.method === 'POST') { const b = await body(req); return send(res, 200, await assets.fromUrl(b.url, { title: b.title, page: b.page, project: b.project || '' })); }
      if (id === 'generate' && req.method === 'POST') {
        const b = await body(req);
        const r = await images.generate({ prompt: b.prompt, size: b.size, n: b.n, provider: b.provider, signal: abortOn(res) });
        return send(res, 200, r.images.map(buf => assets.add(buf, { kind: 'generated', title: b.title || String(b.prompt).slice(0, 40), prompt: b.prompt, provider: `${r.providerName} · ${r.model}`, project: b.project || '' })));
      }
      if (id && req.method === 'PATCH') return send(res, 200, assets.update(id, await body(req)));
      if (id && req.method === 'DELETE') return send(res, 200, assets.remove(id));
    }
    if (a === 'images') {
      if (req.method === 'GET') return send(res, 200, images.settings());
      if (req.method === 'PUT') return send(res, 200, images.setSettings(await body(req)));
    }
    // 选题广场
    if (a === 'plaza') {
      const sub = id;
      if (sub === 'items') {
        const qs = url.searchParams, f = pz.feed();
        const list = pz.items({ days: +qs.get('days') || 7, tiers: qs.get('tiers') ? qs.get('tiers').split(',') : null, source: qs.get('source') || null, q: qs.get('q') || '', starred: qs.get('starred') === '1' });
        return send(res, 200, { updated: f.updated, status: f.status || {}, sources: pz.SOURCES.map(s => ({ id: s.id, name: s.name, tier: s.tier, zh: !!s.zh })), tiers: pz.TIERS, cats: pz.CATS, digest: pz.digestState(), gap: pz.gapState(), total: list.length,
          // 页面只拿排在前面的 500 条；视频和信息差条目在总榜里可能排得靠后，但「视频」「信息差」两个筛选要看全，所以单独带上
          items: [...list.slice(0, 500), ...list.slice(500).filter(it => it.video || it.gap)] });
      }
      // 手动再判断一次哪些是「中文圈还没人讲」的（平时刷新完会自己判断）
      if (sub === 'gap' && req.method === 'POST') { const b = await body(req); pz.gapScan({ provider: b.provider }).catch(() => {}); return send(res, 200, pz.gapState()); }
      if (sub === 'refresh' && req.method === 'POST') return send(res, 200, await pz.refresh());
      // 国内热榜（百度、抖音、头条、B 站）和国内搜索（公众号、B 站、新闻）
      if (sub === 'hot' && req.method === 'GET') return send(res, 200, await cn.hot({ force: url.searchParams.get('force') === '1' }));
      if (sub === 'search' && req.method === 'GET') return send(res, 200, await cn.search(url.searchParams.get('q')));
      if (sub === 'star' && req.method === 'POST') { const b = await body(req); return send(res, 200, pz.star(b.id, b.on) || {}); }
      if (sub === 'read' && req.method === 'POST') { const b = await body(req); return send(res, 200, await pz.readUrl(b.url)); }
      if (sub === 'brief' && req.method === 'POST') { const b = await body(req); return send(res, 200, await pz.brief(b.id, { provider: b.provider, force: !!b.force })); }
      if (sub === 'digest' && req.method === 'GET') return send(res, 200, pz.digestState());
      if (sub === 'digest' && req.method === 'POST') { const b = await body(req); pz.digestAll({ provider: b.provider }).catch(() => {}); return send(res, 200, pz.digestState()); }
      if (sub === 'ideas' && req.method === 'GET') return send(res, 200, pz.lastIdeas() || {});
      if (sub === 'ideas' && req.method === 'POST') { const b = await body(req); return send(res, 200, await pz.ideas({ ...b, existing: core.list().map(p => p.title) })); }
      // X 接口设置：密钥只收不回，网页上只显示头尾
      if (sub === 'x' && req.method === 'GET') return send(res, 200, xapi.publicConfig());
      if (sub === 'x' && req.method === 'POST') {
        const b = await body(req), patch = {};
        if (typeof b.token === 'string' && b.token.trim()) patch.token = b.token.trim();
        if (b.clearToken) patch.token = '';
        if (Array.isArray(b.accounts)) patch.accounts = b.accounts;
        if (b.max != null) patch.max = b.max;
        if (b.everyHours != null) patch.everyHours = b.everyHours;
        if (b.budget != null) patch.budget = b.budget;
        return send(res, 200, xapi.save(patch));
      }
      // 立即拉一次 X（不管间隔），试拉时只读 10 条
      if (sub === 'xpull' && req.method === 'POST') { const b = await body(req); const r = await pz.refresh(['x'], { force: true, xmax: b.test ? 10 : undefined }); return send(res, 200, { status: r.status.x, added: r.added, config: xapi.publicConfig() }); }
      if (sub === 'deepen' && req.method === 'POST') { const b = await body(req); return send(res, 200, { brief: await pz.deepen(b.idea, b.provider) }); }
    }
    if (a === 'ideas' && req.method === 'GET') return send(res, 200, st.lastIdeas() || {});
    if (a === 'ideas' && req.method === 'POST') { const b = await body(req); return send(res, 200, await st.findIdeas({ ...b, existing: core.list().map(p => p.title) })); }


    // ---------- AI ----------
    if (a === 'ai') {
      if (id === 'providers' && req.method === 'GET') return send(res, 200, ai.providers());
      if (id === 'cc' && req.method === 'GET') { const { bin, ...x } = ai.ccStatus(true); return send(res, 200, { ...x, login: ai.ccLoginState(), install: ai.ccInstallState() }); }
      if (id === 'cc-login' && req.method === 'POST') { const b = await body(req); return send(res, 200, await ai.ccLogin(b)); }
      if (id === 'cc-install' && req.method === 'POST') return send(res, 200, ai.ccInstall());
      if (id === 'providers' && req.method === 'PUT') { const b = await body(req); return send(res, 200, ai.setProvider(action, b)); }
      if (id === 'test' && req.method === 'POST') {
        const b = await body(req); const t0 = Date.now();
        const text = await ai.generate({ provider: b.provider, system: '你是测试助手。', prompt: '只回复两个字：收到' });
        return send(res, 200, { ok: true, text: text.slice(0, 60), ms: Date.now() - t0 });
      }
      if (id === 'article' && req.method === 'POST') {
        const b = await body(req); const dir = projectDir(b.projectId); const p = core.load(dir);
        const { system, prompt } = ai.articlePrompt(b.task, { ...b, title: p.title, script: p.form === 'script' });
        return stream(req, res, onText => ai.generate({ provider: b.provider, system, prompt, onText, signal: abortOn(res) }));
      }
      if (id === 'tasks') return send(res, 200, ai.ARTICLE_TASK_NAMES);
    }

    // 你的账号：名字、定位、读者（AI 写稿、出选题时参考）
    if (a === 'profile' && !id) return send(res, 200, req.method === 'POST' ? core.saveProfile(await body(req)) : core.profile());
    // 视频板块
    if (a === 'video-tts') {
      if (!id && req.method === 'GET') return send(res, 200, tts.publicConfig());
      if (!id && req.method === 'POST') return send(res, 200, tts.save(await body(req)));
      // 试听：合成一句短的。付费服务会按这一句的字数收费
      if (id === 'test' && req.method === 'POST') {
        const rt = video.runtime(); if (!rt.ok) return send(res, 400, { error: rt.error });
        const f = path.join(core.DATA_DIR, 'tts-test.mp3');
        await tts.synth('大家好，这是一段配音试听。', f, { env: { ...process.env, PATH: `${path.join(core.APP_DIR, 'video', 'runtime', 'bin')}:${process.env.PATH}` } });
        return send(res, 200, { ok: true, t: Date.now() });
      }
      if (id === 'sample' && req.method === 'GET') { const f = path.join(core.DATA_DIR, 'tts-test.mp3'); return fs.existsSync(f) ? sendMedia(req, res, f) : send(res, 404, { error: 'not found' }); }
    }
    // 拉片：给链接或上传视频，拆出分镜、结构、手法
    if (a === 'breakdown') {
      if (!id && req.method === 'GET') return send(res, 200, { items: breakdown.list(), maxMinutes: 20 });
      if (!id && req.method === 'POST') return send(res, 200, breakdown.create(await body(req)));
      if (id === 'upload' && req.method === 'POST') return send(res, 200, await breakdown.upload(req, url.searchParams.get('name')));
      if (id === 'douyin-window' && req.method === 'POST') return send(res, 200, breakdown.openDouyinWindow());
      if (id && !action && req.method === 'GET') return send(res, 200, breakdown.get(id));
      if (id && !action && req.method === 'DELETE') return send(res, 200, breakdown.remove(id));
      if (id && req.method === 'POST') {
        const b = await body(req);
        if (action === 'retry') return send(res, 200, breakdown.retry(id));
        if (action === 'save-style') return send(res, 200, breakdown.saveTechnique(id, +b.index));
        if (action === 'open') { const [cmd, args] = openArgs(breakdown.dirOf(id)); execFile(cmd, args, () => {}); return send(res, 200, { ok: true }); }
      }
    }
    if (a === 'video-style' && id && req.method === 'DELETE') return send(res, 200, video.removeStyle(id));
    // 视频工具一键安装：GET 看进度，POST 开始装
    if (a === 'video-setup' && !id) return send(res, 200, req.method === 'POST' ? videoSetup.start() : videoSetup.status());
    if (a === 'video') {
      if (!id && req.method === 'GET') { const rt = video.runtime(); return send(res, 200, { videos: video.list(), aspects: video.ASPECTS, modes: video.MODES, styles: video.allStyles().map(({ id, name, note, custom }) => ({ id, name, note, custom: !!custom })), ready: rt.ok, missing: !!rt.missing, error: rt.error || '', setup: videoSetup.status(), engine: video.engine() }); }
      if (!id && req.method === 'POST') return send(res, 200, video.create(await body(req)));
      if (id && !action && req.method === 'GET') return send(res, 200, video.get(id));
      if (id && !action && req.method === 'PATCH') return send(res, 200, video.patch(id, await body(req)));
      if (id && !action && req.method === 'DELETE') return send(res, 200, video.remove(id));
      if (id && req.method === 'POST') {
        if (action === 'clip') return send(res, 200, await video.uploadClip(id, req, url.searchParams.get('name')));
        const b = await body(req);
        if (action === 'run') return send(res, 200, video.run(id, b.message));
        if (action === 'stop') return send(res, 200, video.stop(id));
        if (action === 'voice') return send(res, 200, video.voice(id));
        if (action === 'render') return send(res, 200, video.render(id, b));
        if (action === 'render-stop') return send(res, 200, video.stopRender(id));
        if (action === 'styles') return send(res, 200, video.setStyles(id, b.styles));
        if (action === 'clip-remove') return send(res, 200, video.removeClip(id, b.clip));
        if (action === 'open') { const [cmd, args] = openArgs(b.file ? path.dirname(video.fileOf(id, b.file) || video.dirOf(id)) : video.dirOf(id)); execFile(cmd, args, () => {}); return send(res, 200, { ok: true }); }
      }
    }
    if (a === 'projects') {
      if (!id && req.method === 'GET') return send(res, 200, core.list());
      if (!id && req.method === 'POST') {
        const b = await body(req);
        // 文章转写成视频脚本：新建一个脚本项目，把「从哪篇转、怎么转」写进要求里（要求每次都会带给 AI 助手），
        // 返回一句替作者发出去的话，让助手先把原文读完再写。原文不动。
        if (b.fromArticle) {
          const src = core.list().find(p => p.id === b.fromArticle && p.type === 'article');
          if (!src) return send(res, 404, { error: '没找到要转写的那篇文章' });
          if (src.chars < 150) return send(res, 400, { error: '这篇文章还没写多少内容，先把文章写出来再转' });
          const secs = Math.min(600, Math.max(30, +b.script?.seconds || 90)), secText = secs < 60 ? `${secs} 秒` : `${secs / 60 | 0} 分${secs % 60 ? ` ${secs % 60} 秒` : '钟'}`;
          const base = (String(b.name || '').trim() || `${src.title}（口播稿）`).replace(/[/\\]/g, ' ');
          let p = null;
          for (let i = 1; i <= 8 && !p; i++) { try { p = core.create('script', i === 1 ? base : `${base} ${i}`, undefined, { script: { seconds: secs } }); } catch (e) { if (!/已存在/.test(e.message)) throw e; } }
          if (!p) throw new Error('这篇文章已经转过好几次了，先整理一下已有的口播稿');
          const brief = [`这条口播稿是从我的文章《${src.title}》转写的。那篇文章的项目 id 是「${src.id}」，正文在它的 article.md，配图在它的 img/ 里。`,
            `时长 ${secText}左右。`, b.brief?.trim() ? `我的要求：${b.brief.trim()}` : '',
            '转写的规矩：',
            '- 不是把文章念一遍。只挑文章里最值得讲的 3–5 个点，别的舍掉；一条视频只讲清一件事。',
            '- 事实、数字、产品名、结论都以那篇文章为准。文章里没有的不要加，文章里不确定的说法不要说成确定的。',
            '- 文章是给人读的，口播是给人听的：长句拆短，书面词换成口语，小标题和列表改成一句接一句的话。',
            '- 开头钩子从文章里最具体、最反常识的那个数字或结论里找。',
            '- 画面提示优先用那篇文章已有的配图和截图，写明用哪一张；文章里没有的画面，写清楚要录什么屏、拍什么。'].filter(Boolean).join('\n');
          const out = core.update(p.dir, { brief, appendNote: `从文章《${src.title}》转写` }, 'web');
          return send(res, 200, { ...out, auto: `把我的文章《${src.title}》转写成这条视频的口播稿。先用 read_project 把那篇文章的 article.md 从头到尾读一遍（project 填「${src.id}」），再照这里 article.md 的骨架写出完整的口播稿：总时长 ${secText}左右，每段都要有口播原话和画面提示。写完告诉我你挑了文章里哪几个点、舍掉了哪些。` });
        }
        // 视频脚本：选题带来的角度、标题备选、开头钩子、口播提纲、时长、封面字直接填进骨架
        const script = core.formOf(b.type) ? { angle: b.idea?.angle, headlines: b.idea?.headlines, ...(b.idea?.script || {}), ...(b.script || {}) } : undefined;
        const p = core.create(b.type, b.name, b.from || undefined, { theme: b.template ? tpl.cssOf(b.template) : null, script });
        if (b.idea) { st.seedIdea(p.dir, b.idea); core.update(p.dir, { appendNote: `选题：${b.idea.title}\n${b.idea.angle || ''}` }, 'web'); }
        if (b.phase === 'outline') core.update(p.dir, { phase: 'outline' }, 'web');
        if (b.brief?.trim()) return send(res, 200, core.update(p.dir, { brief: b.brief.trim() }, 'web'));
        return send(res, 200, b.phase === 'outline' ? core.load(p.dir) : p);
      }
      const dir = projectDir(id);
      if (!action && req.method === 'GET') return send(res, 200, core.load(dir, true));
      // ---------- 写作 / 精修 ----------

      // ---------- 写作室：修订建议、对话、体检、发布、资料 ----------
      if (action === 'studio') {
        const sub = parts[4], b = req.method === 'GET' ? {} : await body(req, parts[4] === 'agent' ? 60e6 : 2e6), title = core.load(dir).title, provider = b.provider;
        const sig = abortOn(res);
        if (sub === 'suggestions' && req.method === 'GET') return send(res, 200, st.clearStale(dir));
        if (sub === 'accept') { st.acceptSuggestion(dir, b.id); return send(res, 200, { ok: true, suggestions: st.suggestions(dir) }); }
        if (sub === 'accept-all') { let n = 0; for (const s of st.suggestions(dir)) { try { st.acceptSuggestion(dir, s.id); n++; } catch {} } return send(res, 200, { ok: true, n, suggestions: st.suggestions(dir) }); }
        if (sub === 'reject') { st.rejectSuggestion(dir, b.id); return send(res, 200, { ok: true, suggestions: st.suggestions(dir) }); }
        if (sub === 'suggest') return send(res, 200, await st.suggestFor(dir, { ...b, title }));
        if (sub === 'continue') return send(res, 200, await st.continueAfter(dir, { ...b, title }));
        if (sub === 'chat' && req.method === 'GET') return send(res, 200, st.chatHistory(dir));
        if (sub === 'chat' && req.method === 'DELETE') { st.clearChat(dir); return send(res, 200, { ok: true }); }
        if (sub === 'chat') return send(res, 200, await st.chat(dir, { ...b, title }));
        // 能动手的助手：一行一个 JSON 事件，边做边发
        if (sub === 'agent-status') return send(res, 200, agent.status(dir));
        if (sub === 'agent-stop') return send(res, 200, agent.stop(dir));
        if (sub === 'agent-inject' && req.method === 'POST') { try { return send(res, 200, agent.inject(dir, b.text)); } catch (e) { return send(res, 409, { error: e.message }); } }
        // Claude Code 跑助手任务时，工具桥（tools/mcp-bridge.mjs）把工具调用转到这里，在正在跑的那一轮里执行
        if (sub === 'agent-tool' && req.method === 'POST') { try { return send(res, 200, await agent.callTool(dir, b)); } catch (e) { return send(res, 409, { error: e.message }); } }
        if (sub === 'agent') {
          if (agent.status(dir).running) return send(res, 409, { error: '助手还在做上一件事，按 Esc 可以停下' });
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
          // 网页断开不停任务：只是不再往这个连接里写，页面可以用 agent-status 接着看进度
          const emit = ev => { try { if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(ev) + '\n'); } catch {} };
          try { const refs = await agent.saveRefs(dir, b.images); const r = await agent.run(dir, { message: b.message, focus: b.focus, stage: b.stage === 'outline' ? 'outline' : '', provider, title, images: refs, onEvent: emit }); emit({ type: 'done', ...r }); }
          catch (e) { emit({ type: 'error', error: e.status === 401 ? 'Claude 密钥不对' : e.message }); }
          return res.end();
        }
        if (sub === 'attach' && req.method === 'GET') { const f = agent.attachment(dir, url.searchParams.get('f')); return f ? sendFile(res, f) : send(res, 404, { error: 'not found' }); }
        if (sub === 'agent-undo') return send(res, 200, agent.undo(dir, b.turn));
        if (sub === 'imgjobs') return send(res, 200, agent.jobs(dir));
        if (sub === 'skillreqs') return send(res, 200, agent.skillReqs(dir));
        if (sub === 'decisions' && req.method === 'GET') return send(res, 200, agent.decisions(dir));
        if (sub === 'decisions') return send(res, 200, agent.answerDecisions(dir, b.answers));
        // 换模板：只换 theme.css，换完重新构建一遍，公众号版和复制出去的样式才是新的
        if (sub === 'template' && req.method === 'GET') return send(res, 200, { canRevert: tpl.canRevert(dir) });
        if (sub === 'template') {
          const r = b.revert ? tpl.revert(dir) : tpl.apply(dir, b.template);
          let built = true, error = ''; try { await core.build(dir); } catch (e) { built = false; error = e.message.slice(-300); }
          return send(res, 200, { ...r, built, error, canRevert: tpl.canRevert(dir) });
        }
        if (sub === 'skillreq') return send(res, 200, await agent.answerSkillReq(dir, b.id, b.action));
        if (sub === 'imgjob') return send(res, 200, await agent.confirmJob(dir, b.id, { prompt: b.prompt, size: b.size, n: b.n, provider: b.imgProvider, insert: b.insert }));
        if (sub === 'imgjob-reject') return send(res, 200, agent.rejectJob(dir, b.id));
        if (sub === 'insert-asset') return send(res, 200, assets.insert(dir, b.asset, { after: b.after || '', caption: b.caption || '', alt: b.alt || '' }));
        if (sub === 'check') return send(res, 200, await st.check(dir));
        if (sub === 'review') return send(res, 200, await st.aiReview(dir, { ...b, title }));
        if (sub === 'publish') {
          if (req.method === 'PUT') core.update(dir, { summary: b.summary }, 'web');
          return send(res, 200, st.publishInfo(dir, core.readMeta(dir)));
        }
        if (sub === 'images') { const z = await st.imagesZip(dir, st.publishInfo(dir, core.readMeta(dir)), url.searchParams.get('platform')); return sendFile(res, z); }
        if (sub === 'research' && req.method === 'GET') return send(res, 200, st.research(dir));
        if (sub === 'research' && req.method === 'POST') return send(res, 200, b.manual ? st.addNote(dir, b) : await st.doResearch(dir, { ...b, title }));
        if (sub === 'research' && req.method === 'DELETE') { st.delResearch(dir, b.id); return send(res, 200, { ok: true }); }
        void sig;
      }
      if (action === 'outline' && req.method === 'GET') return send(res, 200, ed.outlineRead(dir));
      if (action === 'outline' && req.method === 'PUT') { const b = await body(req); return send(res, 200, { ok: true, mtime: ed.outlineWrite(dir, b.text, b.mtime, b.label || '') }); }
      if (action === 'source' && req.method === 'GET') return send(res, 200, ed.articleRead(dir));
      if (action === 'source' && req.method === 'PUT') {
        const b = await body(req); const mtime = ed.articleWrite(dir, b.text, b.mtime, b.label || '');
        if (b.label) core.log(dir, '写作', b.label);
        // 作者亲手改了 AI 写的段落：记一对，攒够了学成记忆
        setImmediate(() => { try { edits.observe(dir, b.text); } catch {} });
        return send(res, 200, { ok: true, mtime });
      }
      if (action === 'render' && req.method === 'POST') {
        const b = await body(req), cf = path.join(dir, 'theme.css'), css = `/p/${encodeURIComponent(id)}/theme.css?v=${fs.existsSync(cf) ? Math.round(fs.statSync(cf).mtimeMs) : 0}`;
        if (Array.isArray(b.blocks)) return send(res, 200, { htmls: await Promise.all(b.blocks.map(async m => m ? ed.absolutizeFor(await ed.renderMarkdown(dir, m), id) : '')), css });
        return send(res, 200, { html: ed.absolutizeFor(await ed.renderMarkdown(dir, b.md || ''), id), css });
      }
      if (action === 'read' && req.method === 'GET') return send(res, 200, await ed.readView(dir, id, url.searchParams.get('v') || 'wechat'));
      if (action === 'versions' && req.method === 'GET') return send(res, 200, ed.versions(dir, url.searchParams.get('file') || 'index.html'));
      if (action === 'undo' && req.method === 'POST') { const b = await body(req); const v = ed.restore(dir, b.file); core.log(dir, '撤销', v.label || ''); return send(res, 200, { ok: true, version: v }); }
      if (action === 'restore' && req.method === 'POST') { const b = await body(req); const v = ed.restore(dir, b.file, b.name); core.log(dir, '恢复版本', v.t); return send(res, 200, { ok: true }); }
      if (action === 'card' && req.method === 'GET') return send(res, 200, ed.cardElement(dir, url.searchParams.get('n')));
      if (action === 'card' && req.method === 'POST') {
        const b = await body(req);
        if (b.op === 'inner') ed.cardSetInner(dir, b.n, b.inner);
        else if (b.op === 'style') ed.cardSetStyle(dir, b.n, b.styles || {});
        else if (b.op === 'remove') ed.cardRemove(dir, b.n);
        else if (b.op === 'replace') ed.cardReplace(dir, b.n, b.outer, '手动替换');
        else if (b.op === 'ai') {
          const el = ed.cardElement(dir, b.n);
          const { system, prompt } = ai.cardPrompt({ css: el.css, section: el.section, element: el.outer, instruction: b.instruction });
          const out = ai.stripFence(await ai.generate({ provider: b.provider, system, prompt, signal: abortOn(res) }));
          if (!/^\s*</.test(out)) throw new Error('AI 没有返回 HTML：' + out.slice(0, 120));
          ed.cardReplace(dir, b.n, out, 'AI：' + String(b.instruction).slice(0, 20));
          core.log(dir, 'AI 精修', String(b.instruction).slice(0, 60));
          return send(res, 200, { ok: true, html: out });
        } else throw new Error('不认识的操作');
        return send(res, 200, { ok: true });
      }

      // 改成「已发布」以后过几秒自动复盘（跟着“自动整理记忆”的开关）
      if (!action && req.method === 'PATCH') { const r = core.update(dir, await body(req), 'web'); if (r.status === '已发布') learn.sweepSoon(); return send(res, 200, r); }
      // 发到国内平台（小红书、知乎、今日头条、微博）：正文转成平台认的格式，图片按顺序整理进 out/<平台>/；open 为真就在访达里打开那个文件夹
      if (action === 'post' && req.method === 'POST') {
        const b = await body(req);
        if (b.open) { const d = post.folderOf(dir, b.platform); fs.mkdirSync(d, { recursive: true }); execFile(...openArgs(d)); return send(res, 200, { ok: true }); }
        return send(res, 200, await post.make(dir, b.platform));
      }
      if (req.method === 'POST' && ['build', 'pack', 'open'].includes(action)) {
        if (action !== 'open') { if (busy.has(id)) return send(res, 409, { error: '这个项目正在构建或打包，等它跑完' }); busy.add(id); }
        try {
          const b = await body(req);
          const r = action === 'build' ? { log: await core.build(dir) } : action === 'pack' ? await core.pack(dir) : { opened: await core.open(dir, b.how, PORT) };
          return send(res, 200, { ok: true, ...r, project: core.load(dir, true) });
        } finally { busy.delete(id); }
      }
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, e.status || 400, { error: e.message });
  }
});

// 工具桥要知道怎么连回来
setTimeout(() => pz.fillImages().catch(() => {}), 5000);   // 选题广场里没配图的条目，后台补上
process.env.WB_SELF = `http://127.0.0.1:${PORT}`; process.env.WB_SELF_TOKEN = TOKEN;
// 命令行 xy publish 标的、以前就发过的：启动后和每半小时补一次复盘
setTimeout(() => learn.sweep().catch(() => {}), 60000); setInterval(() => learn.sweep().catch(() => {}), 30 * 60000);
// 作者的手改攒够了（停手十分钟后）就学一次
setInterval(() => { if (memory.autoOn()) edits.learnPending().catch(() => {}); }, 20 * 60000);
server.listen(PORT, '127.0.0.1', () => console.log(`工作台已启动：http://127.0.0.1:${PORT}`));
