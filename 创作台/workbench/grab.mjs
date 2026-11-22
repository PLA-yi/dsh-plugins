// 按链接把视频拿下来，给「拉片」用。
// 抖音：用工作台自己的一份 Chrome 配置（data/chrome-video）弹一个看得见的普通窗口打开视频页，页面像平时一样加载，
//       工作台只旁听页面自己收到的视频信息和播放地址。不伪装浏览器、不替页面发请求、不处理验证码。
//       不碰作者平时用的浏览器。抖音要验证码或登录时，作者自己在弹出的窗口里处理一次，之后这份配置就记住了。
// 其他站（YouTube、B 站、TikTok、X 等）：用开源的 yt-dlp（装在 video/runtime/py）。
// 拿下来的视频只用来分析学习，不要搬进自己的成片。
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { APP_DIR } from './core.mjs';
import { CHROME } from './platform.mjs';

const PROFILE = path.join(APP_DIR, 'data', 'chrome-video');
const RT = path.join(APP_DIR, 'video', 'runtime');
const YTDLP = path.join(RT, 'py', 'bin', 'yt-dlp');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
export const MAX_MINUTES = 20;   // 太长的视频拉片意义不大，也很慢

/* ---------- 认链接 ---------- */
// 从粘贴的一段话里找出链接（抖音分享出来的是「7.94 复制打开抖音… https://v.douyin.com/xxx/ 」这种）
export function findUrl(text) { const m = String(text || '').match(/https?:\/\/[^\s，。；、"'<>）)】]+/); return m ? m[0] : ''; }
const douyinId = u => (String(u).match(/\/(?:share\/)?video\/(\d{15,})/) || String(u).match(/[?&](?:modal_id|aweme_id|vid)=(\d{15,})/) || [])[1] || '';
// 抖音短链接要跳转一下才知道是哪条视频
async function resolve(url) {
  let u = url;
  for (let i = 0; i < 6; i++) {
    if (douyinId(u)) return u;
    const r = await fetch(u, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }, signal: AbortSignal.timeout(15000) }).catch(() => null);
    const next = r?.headers.get('location'); if (!next) return u;
    u = new URL(next, u).href;
  }
  return u;
}
export function platformOf(url) {
  let h = ''; try { h = new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  if (/(^|\.)(douyin|iesdouyin)\.com$/.test(h)) return 'douyin';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
  if (/(^|\.)(bilibili\.com|b23\.tv)$/.test(h)) return 'bilibili';
  if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
  if (/(^|\.)(x|twitter)\.com$/.test(h)) return 'x';
  if (/(^|\.)(xiaohongshu\.com|xhslink\.com)$/.test(h)) return 'xiaohongshu';
  return 'other';
}
export const PLATFORM_NAMES = { douyin: '抖音', youtube: 'YouTube', bilibili: 'B 站', tiktok: 'TikTok', x: 'X', xiaohongshu: '小红书', other: '网页视频', upload: '本地上传' };

/* ---------- 控制工作台自己的 Chrome（调试接口） ---------- */
let busyChrome = false;
async function chrome({ headless = true, url = 'about:blank' } = {}) {
  if (!CHROME || !exists(CHROME)) throw new Error('没找到 Google Chrome，抖音视频要靠它打开');
  fs.mkdirSync(PROFILE, { recursive: true });
  // 就是一个普通的 Chrome 窗口，只多开了调试接口好旁听页面的网络请求。不改浏览器标识，不做任何伪装
  const args = [`--user-data-dir=${PROFILE}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1000,760',
    ...(headless ? ['--headless=new', '--disable-gpu'] : []), url];
  const ch = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((ok, no) => {
    let buf = ''; const t = setTimeout(() => no(new Error('Chrome 没启动起来')), 25000);
    ch.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok(m[1]); } });
    ch.on('exit', () => { clearTimeout(t); no(new Error('Chrome 一启动就退出了：可能抖音窗口还开着，先把它关掉')); });
    ch.on('error', e => { clearTimeout(t); no(new Error('Chrome 没能启动：' + e.message)); });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('连不上 Chrome')); });
  let seq = 0; const waiters = new Map(), listeners = new Set();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.no(new Error(m.error.message)) : w.ok(m.result); }
    else if (m.method) for (const l of listeners) l(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => {
    const id = ++seq; waiters.set(id, { ok, no });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => { if (waiters.delete(id)) no(new Error(method + ' 超时')); }, 40000);
  });
  // 关窗口：先客气地让它自己退，三秒还没退就直接结束进程
  const close = async () => {
    const gone = new Promise(r => ch.once('exit', r));
    try { await Promise.race([send('Browser.close'), sleep(2000)]); } catch {}
    try { ws.close(); } catch {}
    await Promise.race([gone, sleep(3000)]);
    if (ch.exitCode == null) { try { ch.kill('SIGKILL'); } catch {} }
  };
  return { send, on: l => { listeners.add(l); return () => listeners.delete(l); }, close, process: ch };
}

/* ---------- 抖音 ---------- */
// 在一堆页面数据里找到那条视频：有文案、有 video、video 里有播放地址
function findAweme(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return null;
  const v = o.video;
  if (v && typeof v === 'object' && (v.playAddr || v.play_addr || v.playApi || v.bitRateList || v.bit_rate) && (typeof o.desc === 'string' || o.awemeId || o.aweme_id)) return o;
  for (const k of Object.keys(o)) { const r = findAweme(o[k], depth + 1); if (r) return r; }
  return null;
}
const abs = u => !u ? '' : u.startsWith('//') ? 'https:' + u : u;
function playUrl(v) {
  const list = [];
  for (const b of v.bitRateList || v.bit_rate || []) { const p = b.playAddr || b.play_addr; for (const x of Array.isArray(p) ? p : p?.url_list || []) list.push({ u: abs(x.src || x), h: b.height || b.play_addr?.height || 0, br: b.bitRate || b.bit_rate || 0 }); }
  const p = v.playAddr || v.play_addr; for (const x of Array.isArray(p) ? p : p?.url_list || []) list.push({ u: abs(x.src || x), h: v.height || 0, br: 0 });
  if (v.playApi) list.push({ u: abs(v.playApi), h: v.height || 0, br: 0 });
  // 1080p 以内挑最清楚的；带 playwm 的是有水印的，换成没水印的
  const ok = list.filter(x => /^https?:/.test(x.u)).sort((a, b) => (Math.min(b.h, 1080) - Math.min(a.h, 1080)) || (b.br - a.br));
  return (ok.find(x => !x.h || x.h <= 1920) || ok[0])?.u.replace('/playwm/', '/play/') || '';
}
const num = x => (x == null ? null : +x || 0);
async function douyin(id, out, say) {
  if (busyChrome) throw new Error('上一条抖音视频还在下载，等它完成');
  busyChrome = true;
  let c;
  try {
    say('打开抖音页面（会弹出一个 Chrome 窗口，下完自己关）');
    // 开一个看得见的普通窗口，页面像平时一样加载；这里只旁听页面自己收到的视频信息，不替它发请求
    c = await chrome({ headless: false });
    const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
    await c.send('Network.enable', {}, sessionId); await c.send('Page.enable', {}, sessionId);
    // 页面可能自己去请求视频详情（aweme/detail），也可能直接把数据写在页面里（RENDER_DATA），两种都接
    const pending = new Set(); let apiBody = null;
    c.on(async m => {
      if (m.sessionId !== sessionId) return;
      if (m.method === 'Network.responseReceived' && /\/aweme\/v1\/web\/aweme\/detail\//.test(m.params.response.url)) pending.add(m.params.requestId);
      if (m.method === 'Network.loadingFinished' && pending.has(m.params.requestId)) { try { const r = await c.send('Network.getResponseBody', { requestId: m.params.requestId }, sessionId); apiBody = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body; } catch {} }
    });
    await c.send('Page.navigate', { url: `https://www.douyin.com/video/${id}` }, sessionId);
    const evalJs = async expr => { try { return (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value; } catch { return null; } };
    let item = null, title = '';
    for (let i = 0; i < 22 && !item; i++) {
      await sleep(1200);
      if (apiBody) { try { item = findAweme(JSON.parse(apiBody)); } catch {} }
      if (!item) {
        const raw = await evalJs("(()=>{const e=document.getElementById('RENDER_DATA');return e?e.textContent:''})()");
        if (raw) { try { item = findAweme(JSON.parse(decodeURIComponent(raw))); } catch {} }
      }
      title = (await evalJs('document.title')) || title;
      if (!item && /验证码|captcha|verify/i.test(title)) break;
    }
    if (!item) {
      const text = (await evalJs('document.body ? document.body.innerText.slice(0,300) : ""')) || '';
      const e = new Error(/验证|captcha/i.test(title + text) ? '抖音要先过一次验证：点「打开抖音窗口」，在弹出的窗口里完成验证（或登录），关掉窗口再试'
        : /不存在|已删除|找不到|私密/.test(text) ? '这条视频看不了：可能删了，或者设成了私密'
          : '没能从抖音页面里读到这条视频。点「打开抖音窗口」登录一次再试；还不行就手动下载后上传');
      e.needWindow = true; throw e;
    }
    const v = item.video, a = item.authorInfo || item.author || {}, st = item.stats || item.statistics || {};
    // 图文帖也带一个「视频」字段，里面其实是背景音乐：没有时长、没有清晰度档位，或者带图片列表的，都按图文算
    const isImages = (Array.isArray(item.images) && item.images.length) || (Array.isArray(item.image_post_info?.images) && item.image_post_info.images.length) || item.aweme_type === 68 || item.awemeType === 68
      || (!(v.duration > 0) && !(v.bit_rate || v.bitRateList || []).length);
    const url = isImages ? '' : playUrl(v);
    if (!url) throw new Error('这条抖音是图文，不是视频，拉不了片');
    const info = { platform: 'douyin', id, url: `https://www.douyin.com/video/${id}`, title: String(item.desc || '').trim().slice(0, 200) || `抖音 ${id}`, author: a.nickname || '',
      sec: +(((v.duration || 0) > 1000 ? v.duration / 1000 : v.duration) || 0).toFixed(1),
      stats: { likes: num(st.diggCount ?? st.digg_count), comments: num(st.commentCount ?? st.comment_count), shares: num(st.shareCount ?? st.share_count), saves: num(st.collectCount ?? st.collect_count), views: num(st.playCount ?? st.play_count) || null },
      published: item.createTime || item.create_time ? new Date((item.createTime || item.create_time) * 1000).toISOString() : '' };
    if (info.sec > MAX_MINUTES * 60) throw new Error(`这条视频有 ${Math.round(info.sec / 60)} 分钟，先只支持 ${MAX_MINUTES} 分钟以内的`);
    say('下载视频');
    // 带上这份 Chrome 里抖音的 Cookie 去下（有的地址要）
    let cookie = ''; try { const ck = await c.send('Network.getCookies', { urls: ['https://www.douyin.com/', url] }, sessionId); cookie = (ck.cookies || []).map(x => `${x.name}=${x.value}`).join('; '); } catch {}
    // 下载时用的浏览器标识就是这个 Chrome 自己的
    let ua = UA; try { ua = (await c.send('Browser.getVersion')).userAgent || UA; } catch {}
    const r = await fetch(url, { headers: { 'User-Agent': ua, Referer: 'https://www.douyin.com/', ...(cookie ? { Cookie: cookie } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(240000) });
    if (!r.ok) throw new Error(`抖音视频下载失败（${r.status}）`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 20000) throw new Error('抖音返回的视频是空的，过一会再试');
    fs.writeFileSync(out, buf);
    return info;
  } finally { busyChrome = false; if (c) await c.close(); }
}
// 抖音要验证码或登录时：弹出一个看得见的窗口（还是工作台自己那份配置），作者自己处理，处理完关掉窗口
export function openDouyinWindow() {
  if (busyChrome) throw new Error('正在下载抖音视频，等它完成');
  if (!CHROME || !exists(CHROME)) throw new Error('没找到 Google Chrome');
  fs.mkdirSync(PROFILE, { recursive: true });
  const ch = spawn(CHROME, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--window-size=1200,860', 'https://www.douyin.com/'], { detached: true, stdio: 'ignore' });
  ch.unref();
  return { ok: true };
}

/* ---------- 其他站：yt-dlp ---------- */
const run = (cmd, args, ms = 600000) => new Promise((ok, no) => execFile(cmd, args, { timeout: ms, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PATH: `${path.join(RT, 'bin')}:${process.env.PATH}` } },
  (e, out, err) => e ? no(new Error(String(err || e.message).split('\n').filter(l => /ERROR/.test(l)).pop()?.slice(0, 300) || String(err || e.message).trim().slice(-300))) : ok(String(out))));
function ytError(platform, m) {
  if (/cookies|sign in|login|not a bot|confirm you/i.test(m)) return `${PLATFORM_NAMES[platform]}要登录才给下：先手动下载这条视频，再用「上传视频」来拉片`;
  if (/geo|region|not available in your country|deleted/i.test(m)) return `${PLATFORM_NAMES[platform]}说这条视频在当前网络下看不了（地区限制，或者已删除）：换个网络，或者手动下载后上传`;
  if (/unsupported url|no video|unable to extract/i.test(m)) return '这个链接里没找到能下的视频：确认粘的是视频页的链接';
  return `下载没成功：${m.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '').slice(0, 200)}`;
}
async function ytdlp(url, platform, out, say) {
  if (!exists(YTDLP)) throw new Error('下载工具还没装：在工作台文件夹里运行 npm install --prefix video/runtime');
  say('读取视频信息');
  let j;
  try { j = JSON.parse(await run(YTDLP, ['--no-warnings', '--no-playlist', '--socket-timeout', '25', '-J', url], 90000)); } catch (e) { throw new Error(ytError(platform, e.message)); }
  const sec = +(j.duration || 0).toFixed(1);
  if (sec > MAX_MINUTES * 60) throw new Error(`这条视频有 ${Math.round(sec / 60)} 分钟，先只支持 ${MAX_MINUTES} 分钟以内的`);
  say('下载视频');
  const tmp = out.replace(/\.mp4$/, '') + '.dl';
  try {
    await run(YTDLP, ['--no-warnings', '--no-playlist', '--socket-timeout', '25', '-f', 'bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[vcodec^=avc1][height<=1080]/bv*[height<=1080]+ba/b[height<=1080]/b', '--merge-output-format', 'mp4', '--ffmpeg-location', path.join(RT, 'bin'), '-o', tmp + '.%(ext)s', url]);
  } catch (e) { throw new Error(ytError(platform, e.message)); }
  const made = fs.readdirSync(path.dirname(out)).filter(f => f.startsWith(path.basename(tmp) + '.')).map(f => path.join(path.dirname(out), f))[0];
  if (!made) throw new Error('下载完没找到文件');
  fs.renameSync(made, out);
  const d = String(j.upload_date || '');
  return { platform, id: String(j.id || ''), url: j.webpage_url || url, title: String(j.title || '').slice(0, 200), author: j.uploader || j.channel || '', sec,
    stats: { likes: num(j.like_count), comments: num(j.comment_count), shares: num(j.repost_count), saves: null, views: num(j.view_count) },
    published: /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00.000Z` : '', lang: j.language || '', description: String(j.description || '').slice(0, 1500) };
}

// 入口：text 是作者粘贴的内容（链接或分享口令），视频存到 out（mp4），say 报进度
export async function grab(text, out, say = () => {}) {
  let url = findUrl(text);
  if (!url) throw new Error('没看到链接：把视频的分享链接粘进来');
  let platform = platformOf(url);
  if (platform === 'douyin') {
    url = await resolve(url);
    const id = douyinId(url);
    if (!id) throw new Error(/\/note\//.test(url) ? '这是抖音图文，不是视频，拉不了片' : '没认出这是哪条抖音视频：用抖音「分享 → 复制链接」得到的链接');
    return douyin(id, out, say);
  }
  if (platform === 'xiaohongshu') throw new Error('小红书的视频要登录才能下：先手动保存视频，再用「上传视频」来拉片');
  return ytdlp(url, platform, out, say);
}
