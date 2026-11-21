/**
 * 口碑雷达 · 免费方式 A：不用登录的公开接口和公开页面。
 *
 * 硬底线（别改）：
 *   - 不伪装浏览器：请求头里老实写自己是谁（UA 见下面），不冒充 Chrome、不冒充手机。
 *   - 不绕过验证码、不绕过登录：平台要验证或要登录，就停下来、在页面上照实说「需要登录」「暂时拿不到」。
 *   - 请求放慢：每个平台一次检查有请求上限，两次请求之间有间隔。只读公开能看到的内容。
 *
 * 2026-11-20 实测（关键词「庞巴迪」「DeepSeek」）：
 *   B 站搜索：能拿到，一次 20 条；连着请求太快会被 412 拦，间隔 8 秒没问题
 *   B 站评论：能拿到，但不登录每个视频只给最新 3 条左右
 *   搜狗微信（公众号文章）：能拿到，一次 10 条；不能按时间筛（带时间参数会跳回首页），所以旧文章靠「只看最近几天」过滤
 *   必应新闻 RSS：能拿到，十来条；Google 新闻 RSS：能拿到（要这台电脑能连上 Google）
 *   百度新闻：要人机验证，拿不到，没接
 *   微博公开接口：跳到访客验证页，拿不到 → 走浏览器窗口（要登录）
 *   知乎搜索接口：直接 400/403，拿不到 → 走浏览器窗口（要登录）
 */
import { parseTime, plain } from './core.js'
import { biliComment, biliPost } from './normalize.js'

/** 老实说自己是谁。不改成浏览器的样子。 */
export const UA = 'ReputationRadar/0.1 (DSH plugin; reads public search results)'

const sleepFor = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener?.('abort', () => { clearTimeout(t); reject(signal.reason ?? new Error('已取消')) }, { once: true })
})

/**
 * 一个平台用一个：两次请求之间至少隔 gapMs，一次检查最多 max 个请求。
 * 到上限就不再发（返回 null），调用的地方自然收尾。
 */
export function politeFetcher({ fetchImpl = fetch, gapMs = 5000, max = 10, signal, sleep = sleepFor } = {}) {
  let last = 0
  let count = 0
  return {
    get count() { return count },
    async get(url, headers = {}) {
      if (count >= max) return null
      const wait = last + gapMs - Date.now()
      if (last && wait > 0) await sleep(wait, signal)
      count += 1
      last = Date.now()
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: '*/*', ...headers }, redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) })
      last = Date.now()
      return res
    },
  }
}

const result = (status, note, items = [], extra = {}) => ({ status, note, items, ...extra })

// ------------------------------------------------------------------ B 站

/**
 * B 站：公开搜索（按发布时间排）+ 每个视频的最新评论。
 * 访客 cookie（buvid3）是 B 站自己发给每个访客的，先问它要一个，带着它请求，和普通访客一样。
 */
export async function bilibili(terms, { fetchImpl, signal, sleep, say = () => {}, maxComments = 4 } = {}) {
  const f = politeFetcher({ fetchImpl, gapMs: 8000, max: 3 + terms.length + maxComments, signal, sleep })
  let cookie = ''
  try {
    const r = await f.get('https://api.bilibili.com/x/frontend/finger/spi')
    const j = await r.json()
    if (j?.data?.b_3) cookie = `buvid3=${j.data.b_3}`
  } catch { /* 拿不到访客号也试试搜索 */ }
  const posts = []
  for (const term of terms) {
    say(`B 站：搜「${term}」`)
    const r = await f.get(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&order=pubdate&page=1&keyword=${encodeURIComponent(term)}`, cookie ? { Cookie: cookie } : {})
    if (!r) break
    if (r.status === 412) return result(posts.length ? 'ok' : 'blocked', 'B 站说请求太频繁，这次先停，下次再搜', posts)
    let j
    try { j = await r.json() } catch { return result(posts.length ? 'ok' : 'blocked', `B 站返回的不是数据（${r.status}），这次先跳过`, posts) }
    if (j.code !== 0) return result(posts.length ? 'ok' : 'blocked', `B 站没给结果（${j.message ?? j.code}）`, posts)
    for (const v of j.data?.result ?? []) { const p = biliPost(v); if (p) posts.push({ ...p, keyword: term }) }
  }
  // 评论：挑最近、评论多的几个视频，看最新评论（不登录 B 站每个视频只给最新几条）
  const comments = []
  const pickList = [...posts].filter(p => (p.stats.comments ?? 0) > 0).sort((a, b) => (b.stats.comments ?? 0) - (a.stats.comments ?? 0)).slice(0, maxComments)
  for (const p of pickList) {
    say(`B 站：看「${p.title.slice(0, 16)}」的评论`)
    const r = await f.get(`https://api.bilibili.com/x/v2/reply/main?type=1&mode=2&next=0&ps=20&oid=${p.extra.aid}`, cookie ? { Cookie: cookie } : {})
    if (!r || r.status !== 200) break
    let j
    try { j = await r.json() } catch { break }
    for (const c of [...(j.data?.top_replies ?? []), ...(j.data?.replies ?? [])]) {
      const x = biliComment(c)
      if (x) comments.push({ ...x, url: p.url, parentPid: p.pid, parentTitle: p.title, keyword: p.keyword })
    }
  }
  return result('ok', `免费公开接口：${posts.length} 个视频、${comments.length} 条评论（不登录每个视频只能看到最新几条评论）`, [...posts, ...comments], { requests: f.count })
}

// ------------------------------------------------------------------ 公众号（搜狗微信搜索）

/** 搜狗微信搜索的结果页里拿文章：标题、摘要、公众号名、时间、链接。 */
export function parseSogou(html, term) {
  const out = []
  const re = /<li id="sogou_vr_11002601_box_\d+"\s+d="([^"]*)"[\s\S]*?<\/li>/g
  let m
  while ((m = re.exec(html))) {
    const block = m[0]
    const a = /<h3>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block)
    if (!a) continue
    const summary = /<p class="txt-info"[^>]*>([\s\S]*?)<\/p>/.exec(block)?.[1] ?? ''
    const account = /<span class="all-time-y2">([\s\S]*?)<\/span>/.exec(block)?.[1] ?? ''
    const ts = /timeConvert\('(\d+)'\)/.exec(block)?.[1]
    const href = a[1].replace(/&amp;/g, '&')
    out.push({
      platform: 'wechat', kind: 'post', pid: m[1] || undefined, url: href.startsWith('http') ? href : `https://weixin.sogou.com${href}`,
      author: plain(account), time: parseTime(ts), title: plain(a[2]), text: plain(summary), stats: {}, keyword: term,
    })
  }
  return out
}

export async function wechat(terms, { fetchImpl, signal, sleep, say = () => {} } = {}) {
  const f = politeFetcher({ fetchImpl, gapMs: 6000, max: terms.length, signal, sleep })
  const items = []
  for (const term of terms) {
    say(`公众号：搜「${term}」`)
    const r = await f.get(`https://weixin.sogou.com/weixin?type=2&ie=utf8&query=${encodeURIComponent(term)}`)
    if (!r) break
    const loc = r.headers.get('location') ?? ''
    if (/antispider/.test(loc)) return result(items.length ? 'ok' : 'captcha', '搜狗要求人机验证，这次先停（插件不会去点验证码），过几个小时再试', items)
    if (r.status !== 200) return result(items.length ? 'ok' : 'blocked', `搜狗没给结果（${r.status}），这次先跳过`, items)
    const html = await r.text()
    if (/antispider|请输入验证码/.test(html)) return result(items.length ? 'ok' : 'captcha', '搜狗要求人机验证，这次先停（插件不会去点验证码），过几个小时再试', items)
    items.push(...parseSogou(html, term))
  }
  return result('ok', `免费：搜狗微信搜索，${items.length} 篇文章（只有标题和摘要；链接要从搜狗跳转）`, items, { requests: f.count })
}

// ------------------------------------------------------------------ 新闻资讯（必应新闻、Google 新闻的 RSS）

/** 读 RSS 里的每一条新闻。 */
export function parseRss(xml, term, via) {
  const out = []
  for (const block of String(xml).match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const tag = name => {
      const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block)
      return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') : ''
    }
    let link = plain(tag('link'))
    // 必应的链接是一个跳转，真正的地址在 url= 后面
    try { const u = new URL(link); if (/bing\.com$/.test(u.hostname) && u.searchParams.get('url')) link = u.searchParams.get('url') } catch { /* 用原来的 */ }
    const source = plain(tag('source')) || plain(tag('News:Source'))
    let title = plain(tag('title'))
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -source.length - 3)
    out.push({
      platform: 'news', kind: 'post', url: link, author: source, time: parseTime(plain(tag('pubDate'))), title,
      text: plain(plain(tag('description'))).slice(0, 500), stats: {}, keyword: term, extra: { via },
    })
  }
  return out
}

export async function news(terms, { fetchImpl, signal, sleep, say = () => {} } = {}) {
  const f = politeFetcher({ fetchImpl, gapMs: 3000, max: terms.length * 2, signal, sleep })
  const items = []
  const ok = { 必应新闻: 0, 'Google 新闻': 0 }
  const fail = new Set()
  for (const term of terms) {
    const q = encodeURIComponent(term)
    for (const [name, url] of [
      ['必应新闻', `https://www.bing.com/news/search?q=${q}&format=rss&qft=sortbydate%3d%221%22`],
      ['Google 新闻', `https://news.google.com/rss/search?q=${q}+when:7d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`],
    ]) {
      if (fail.has(name)) continue
      say(`新闻：${name}搜「${term}」`)
      try {
        const r = await f.get(url)
        if (!r) break
        if (r.status !== 200) { fail.add(name); continue }
        const got = parseRss(await r.text(), term, name)
        ok[name] += got.length
        items.push(...got)
      } catch (e) {
        if (e?.name === 'AbortError' && signal?.aborted) throw e
        fail.add(name) // 比如这台电脑连不上 Google：跳过它，别的照常
      }
    }
  }
  const parts = Object.entries(ok).map(([k, n]) => (fail.has(k) && !n ? `${k}连不上` : `${k} ${n} 条`))
  const status = items.length || fail.size < 2 ? 'ok' : 'blocked'
  return result(status, `免费 RSS：${parts.join('、')}。百度新闻要人机验证，没接。`, items, { requests: f.count })
}

/** 免费方式 A 能管的平台。别的平台（微博、知乎、小红书、抖音）不用登录拿不到，走浏览器窗口。 */
export const FREE_SOURCES = { bilibili, wechat, news }
