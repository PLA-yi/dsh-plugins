/**
 * 口碑雷达 · 付费方式：第三方数据接口 TikHub（tikhub.io，按次计费）。
 *
 * 只在免费方式抓不到的时候补（平台要登录、被验证码挡住、暂时拿不到）。没填密钥这一路就不跑。
 * 花钱规矩：
 *   - 每次调用都记账（不管成没成功，按「每次多少钱」估算，宁可多记）。页面上显示本月已用。
 *   - 到了每月上限就不再调，这次检查照常往下走，不报错（下个月自动恢复）。
 *   - 每个平台一次检查最多调 6 次（每个词搜一次 + 看两个帖子的评论）。
 *
 * 接口路径按 2026-11-20 的 TikHub 文档（https://api.tikhub.io/openapi.json，版本 V5.3.2）核对过；
 * 没有密钥，没真调过，返回格式靠 normalize.js 里「找长得像帖子的那一块」来适应。
 */
import { PLATFORM_NAME } from './core.js'
import { pick } from './normalize.js'

const BASE = 'https://api.tikhub.io'

/** 每个平台：怎么搜、怎么看评论。 */
const API = {
  douyin: {
    search: t => ({ method: 'POST', path: '/api/v1/douyin/search/fetch_video_search_v2', body: { keyword: t, cursor: 0, sort_type: '2', publish_time: '7', filter_duration: '0', content_type: '0', search_id: '', backtrace: '' } }),
    comments: p => ({ path: `/api/v1/douyin/web/fetch_video_comments?aweme_id=${encodeURIComponent(p.pid)}&cursor=0&count=20` }),
  },
  xhs: {
    search: t => ({ path: `/api/v1/xiaohongshu/app_v2/search_notes?keyword=${encodeURIComponent(t)}&page=1&sort_type=time_descending&time_filter=${encodeURIComponent('一周内')}` }),
    comments: p => ({ path: `/api/v1/xiaohongshu/app_v2/get_note_comments?note_id=${encodeURIComponent(p.pid)}` }),
  },
  weibo: {
    search: t => ({ path: `/api/v1/weibo/web_v2/fetch_realtime_search?query=${encodeURIComponent(t)}&page=1` }),
    comments: p => ({ path: `/api/v1/weibo/web_v2/fetch_post_comments?id=${encodeURIComponent(p.pid)}&count=20` }),
  },
  zhihu: {
    search: t => ({ path: `/api/v1/zhihu/web/fetch_article_search_v3?keyword=${encodeURIComponent(t)}&offset=0&limit=20` }),
    comments: p => (p.extra?.answerId ? { path: `/api/v1/zhihu/web/fetch_comment_v5?answer_id=${encodeURIComponent(p.extra.answerId)}&limit=20` } : null),
  },
  bilibili: {
    search: t => ({ path: `/api/v1/bilibili/web/fetch_general_search?keyword=${encodeURIComponent(t)}&order=pubdate&page=1&page_size=20` }),
    comments: p => (p.extra?.bvid ? { path: `/api/v1/bilibili/web/fetch_video_comments?bv_id=${encodeURIComponent(p.extra.bvid)}&pn=1` } : null),
  },
}
export const PAID_PLATFORMS = Object.keys(API)

/** 付费接口出错翻成一句话。 */
function paidError(status, body) {
  if (status === 401 || status === 403) return 'TikHub 密钥不对或没权限，去设置里检查一下'
  if (status === 402 || /balance|余额|insufficient/i.test(JSON.stringify(body ?? ''))) return 'TikHub 账户余额不够了，去 TikHub 后台充值'
  if (status === 429) return 'TikHub 说请求太快，这次先停'
  return `TikHub 没给结果（${status}）`
}

/**
 * 用付费接口补一个平台。
 * @param {string} platform
 * @param {string[]} terms
 * @param {{ key: string, budget: ReturnType<import('./core.js').makeBudget>, fetchImpl?: typeof fetch, say?: Function, maxCalls?: number, onSpend?: Function }} opts
 * @returns {{ status: 'paid'|'cap'|'error', note: string, items: object[], calls: number }}
 */
export async function paidSearch(platform, terms, { key, budget, fetchImpl = fetch, say = () => {}, maxCalls = 6, signal, onSpend = () => {} }) {
  const api = API[platform]
  if (!api || !key) return { status: 'error', note: '这个平台没有付费接口', items: [], calls: 0 }
  let calls = 0
  let capHit = false
  let lastError = ''
  async function call(req) {
    if (!req || calls >= maxCalls) return null
    if (!budget.canSpend()) { capHit = true; return null } // 到上限：不调了，自然收尾
    calls += 1
    budget.record(1)
    await onSpend()
    const res = await fetchImpl(`${BASE}${req.path}`, {
      method: req.method ?? 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...(req.body ? { 'Content-Type': 'application/json' } : {}) },
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    })
    let body = null
    try { body = await res.json() } catch { /* 不是 JSON */ }
    if (!res.ok || (body && body.code !== undefined && body.code !== 200 && body.code !== 0)) { lastError = paidError(res.status, body); return null }
    return body
  }
  const posts = []
  for (const term of terms) {
    say(`付费接口：在${PLATFORM_NAME[platform]}搜「${term}」`)
    const body = await call(api.search(term))
    if (!body) { if (capHit || /密钥|余额/.test(lastError)) break; continue }
    posts.push(...pick(platform, 'post', body).map(x => ({ ...x, keyword: term })))
  }
  const items = [...posts]
  for (const p of [...posts].sort((a, b) => (b.stats?.comments ?? 0) - (a.stats?.comments ?? 0)).slice(0, 2)) {
    if (capHit) break
    const body = await call(api.comments(p))
    if (body) items.push(...pick(platform, 'comment', body, p).map(x => ({ ...x, keyword: p.keyword })))
  }
  const used = budget.used()
  if (capHit && !items.length) return { status: 'cap', note: `本月付费额度用完了（${used.yuan.toFixed(2)} / ${used.cap} 元），下个月自动恢复`, items, calls }
  if (!items.length && lastError) return { status: 'error', note: lastError, items, calls }
  return { status: 'paid', note: `付费接口补了 ${items.length} 条，调了 ${calls} 次${capHit ? '（中途到了每月上限，后面的没调）' : ''}`, items, calls }
}
