// 国内的信息：热榜（百度、抖音、今日头条、B 站）和国内搜索（公众号文章、B 站视频、中文新闻）。
// 规矩：老实说自己是谁，不冒充浏览器；只读不用登录就能看的公开页面和公开接口；平台要验证码或要登录就停下来照实说；请求放慢。
// 2026-11-22 实测这些都能拿到。微博热搜、知乎热榜不登录会被拒（403），没接。
import { UA } from './plaza.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = (url, headers = {}, ms = 15000) => fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9', ...headers }, signal: AbortSignal.timeout(ms), redirect: 'manual' });
const ENT = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–', middot: '·', times: '×', yen: '¥' };
// 有的页面转了两遍（&amp;ldquo;），解两遍
const unent = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const plain = s => unent(unent(String(s ?? '').replace(/<[^>]+>/g, ''))).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const iso = v => { if (v == null || v === '') return null; const n = Number(v); const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

/* ---------- 热榜 ---------- */
const HOT = {
  baidu: {
    name: '百度热搜', home: 'https://top.baidu.com/board?tab=realtime',
    async pull() {
      const html = await (await get(this.home)).text();
      const m = html.match(/<!--s-data:([\s\S]*?)-->/);
      if (!m) throw new Error('百度热搜页面变了，没读到数据');
      const list = JSON.parse(m[1])?.data?.cards?.[0]?.content || [];
      return list.filter(x => !x.isTop).map(x => ({ title: plain(x.word || x.query), url: x.url || x.appUrl || `https://www.baidu.com/s?wd=${encodeURIComponent(x.word)}`, heat: +x.hotScore || 0, desc: plain(x.desc), img: x.img || '' }));
    },
  },
  douyin: {
    name: '抖音热榜', home: 'https://www.douyin.com/hot',
    async pull() {
      const j = await (await get('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/')).json();
      return (j.word_list || []).map(x => ({ title: plain(x.word), url: `https://www.douyin.com/search/${encodeURIComponent(x.word)}`, heat: +x.hot_value || 0, desc: '', img: '' }));
    },
  },
  toutiao: {
    name: '今日头条', home: 'https://www.toutiao.com/',
    async pull() {
      const j = await (await get('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc')).json();
      return (j.data || []).map(x => ({ title: plain(x.Title), url: String(x.Url || '').split('?')[0] || x.Url, heat: +x.HotValue || 0, desc: plain(x.LabelDesc || ''), img: x.Image?.url || '' }));
    },
  },
  bili: {
    name: 'B 站热门', home: 'https://www.bilibili.com/v/popular/all',
    async pull() {
      const j = await (await get('https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1', { Referer: 'https://www.bilibili.com/' })).json();
      if (j.code !== 0) throw new Error(`B 站没给结果（${j.message || j.code}）`);
      return (j.data?.list || []).map(x => ({ title: plain(x.title), url: `https://www.bilibili.com/video/${x.bvid}`, heat: x.stat?.view || 0, desc: plain(x.rcmd_reason?.content || x.owner?.name || ''), img: String(x.pic || '').replace(/^http:/, 'https:') }));
    },
  },
};
const hotCache = { t: 0, lists: null, running: null };
/** 四个热榜，15 分钟内再要就给缓存。force 为真就重新拉 */
export async function hot({ force = false } = {}) {
  if (!force && hotCache.lists && Date.now() - hotCache.t < 15 * 60000) return { t: new Date(hotCache.t).toISOString(), lists: hotCache.lists };
  hotCache.running ??= (async () => {
    const lists = await Promise.all(Object.entries(HOT).map(async ([id, s]) => {
      try { const items = (await s.pull()).filter(x => x.title).slice(0, 50).map((x, i) => ({ rank: i + 1, ...x })); return { id, name: s.name, home: s.home, ok: true, items }; }
      catch (e) { return { id, name: s.name, home: s.home, ok: false, error: e.name === 'TimeoutError' ? '超时了' : e.message, items: [] }; }
    }));
    hotCache.lists = lists; hotCache.t = Date.now();
  })().finally(() => { hotCache.running = null; });
  await hotCache.running;
  return { t: new Date(hotCache.t).toISOString(), lists: hotCache.lists };
}

/* ---------- 国内搜索 ---------- */
// 公众号文章：搜狗微信搜索
function parseSogou(html) {
  const out = [];
  for (const m of html.matchAll(/<li id="sogou_vr_11002601_box_\d+"[\s\S]*?<\/li>/g)) {
    const b = m[0], a = /<h3>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b); if (!a) continue;
    const href = a[1].replace(/&amp;/g, '&');
    out.push({ title: plain(a[2]), url: href.startsWith('http') ? href : `https://weixin.sogou.com${href}`, author: plain(/<span class="all-time-y2">([\s\S]*?)<\/span>/.exec(b)?.[1]), time: iso(/timeConvert\('(\d+)'\)/.exec(b)?.[1]), text: plain(/<p class="txt-info"[^>]*>([\s\S]*?)<\/p>/.exec(b)?.[1]) });
  }
  return out;
}
async function wechat(q) {
  const r = await get(`https://weixin.sogou.com/weixin?type=2&ie=utf8&query=${encodeURIComponent(q)}`);
  if (/antispider/.test(r.headers.get('location') || '')) return { status: 'captcha', note: '搜狗要人机验证，这次先停（不会去点验证码），过一阵再搜', items: [] };
  if (r.status !== 200) return { status: 'blocked', note: `搜狗没给结果（${r.status}）`, items: [] };
  const html = await r.text();
  if (/antispider|请输入验证码/.test(html)) return { status: 'captcha', note: '搜狗要人机验证，这次先停（不会去点验证码），过一阵再搜', items: [] };
  const items = parseSogou(html);
  return { status: 'ok', note: '搜狗微信搜索，只有标题和摘要', items };
}
// B 站视频：公开搜索，带 B 站发给访客的 buvid3
async function bilibili(q) {
  let cookie = '';
  try { const j = await (await get('https://api.bilibili.com/x/frontend/finger/spi')).json(); if (j?.data?.b_3) cookie = `buvid3=${j.data.b_3}`; } catch {}
  await sleep(1500);
  const r = await get(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&page=1&keyword=${encodeURIComponent(q)}`, { Referer: 'https://www.bilibili.com/', ...(cookie ? { Cookie: cookie } : {}) });
  if (r.status === 412) return { status: 'blocked', note: 'B 站说请求太频繁，过一会儿再搜', items: [] };
  let j; try { j = await r.json(); } catch { return { status: 'blocked', note: `B 站没给数据（${r.status}）`, items: [] }; }
  if (j.code !== 0) return { status: 'blocked', note: `B 站没给结果（${j.message || j.code}）`, items: [] };
  const items = (j.data?.result || []).map(v => ({ title: plain(v.title), url: v.arcurl || `https://www.bilibili.com/video/${v.bvid}`, author: plain(v.author), time: iso(v.pubdate), text: plain(v.description).slice(0, 200), img: String(v.pic || '').replace(/^\/\//, 'https://'), stats: { views: +v.play || 0, likes: +v.like || 0, comments: +v.review || 0 } }));
  return { status: 'ok', note: 'B 站公开搜索', items };
}
// 中文新闻：必应新闻 RSS（按时间排）
async function news(q) {
  const r = await get(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=zh-cn&qft=sortbydate%3d%221%22`);
  if (r.status !== 200) return { status: 'blocked', note: `必应新闻没给结果（${r.status}）`, items: [] };
  const xml = await r.text(), items = [];
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const tag = n => (new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(block)?.[1] || '').replace(/^<!\[CDATA\[|\]\]>$/g, '');
    let link = plain(tag('link'));
    try { const u = new URL(link); if (/bing\.com$/.test(u.hostname) && u.searchParams.get('url')) link = u.searchParams.get('url'); } catch {}
    const source = plain(tag('News:Source')) || plain(tag('source'));
    items.push({ title: plain(tag('title')), url: link, author: source, time: iso(plain(tag('pubDate'))), text: plain(plain(tag('description'))).slice(0, 240) });
  }
  return { status: 'ok', note: '必应新闻', items };
}
const SEARCH = { wechat: ['公众号文章', wechat], bili: ['B 站视频', bilibili], news: ['新闻资讯', news] };
/** 在国内平台上搜一个词。三个平台一起搜，一个出错不影响别的 */
export async function search(q) {
  q = String(q || '').trim().slice(0, 60);
  if (!q) throw new Error('要搜什么？');
  const groups = await Promise.all(Object.entries(SEARCH).map(async ([id, [name, fn]]) => {
    try { const r = await fn(q); return { id, name, ...r, items: r.items.filter(x => x.title).slice(0, 20) }; }
    catch (e) { return { id, name, status: 'error', note: e.name === 'TimeoutError' ? '超时了' : e.message, items: [] }; }
  }));
  return { q, t: new Date().toISOString(), groups };
}
/** 给 AI 助手用的：搜完压成一段文字 */
export async function searchText(q) {
  const r = await search(q);
  return r.groups.map(g => `## ${g.name}${g.status !== 'ok' ? `（${g.note}）` : ''}\n` + g.items.slice(0, 8).map((x, i) => `${i + 1}. ${x.title}${x.author ? ` — ${x.author}` : ''}${x.time ? `（${x.time.slice(0, 10)}）` : ''}\n${x.url}${x.text ? `\n${x.text}` : ''}`).join('\n\n')).join('\n\n') || '没有搜到';
}
