/**
 * 口碑雷达 · 不碰网络的那部分：去重、判断结果解析、日报统计、花钱上限、时间换算。
 * 这里的函数都是「给数据、还数据」，测试直接调它们（test/core.test.mjs）。
 */
import { createHash } from 'node:crypto'

// ------------------------------------------------------------------ 平台

/** 七类平台。key 是代码里用的名字，name 是页面上显示的名字。 */
export const PLATFORMS = [
  { key: 'weibo', name: '微博' },
  { key: 'bilibili', name: 'B 站' },
  { key: 'zhihu', name: '知乎' },
  { key: 'xhs', name: '小红书' },
  { key: 'douyin', name: '抖音' },
  { key: 'wechat', name: '公众号' },
  { key: 'news', name: '新闻资讯' },
]
export const PLATFORM_NAME = Object.fromEntries(PLATFORMS.map(p => [p.key, p.name]))

/** 情绪：骂/吐槽、中性、夸；用户手动改的时候还能选「和我无关」。 */
export const SENTIMENTS = ['neg', 'neu', 'pos']
export const MANUAL_SENTIMENTS = ['neg', 'neu', 'pos', 'unrelated']

// ------------------------------------------------------------------ 日期

const pad = n => String(n).padStart(2, '0')
/** 按这台电脑的时间算日期（不用 toISOString，那是世界时）。 */
export const dateOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const monthOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
/** 往前数几天的日期，例 daysBefore('2026-11-20', 1) → '2026-11-19'。 */
export function daysBefore(date, n) {
  const [y, m, d] = date.split('-').map(Number)
  return dateOf(new Date(y, m - 1, d - n))
}

/**
 * 把各种平台上的时间写法换成 ISO 时间。认不出来返回 null。
 * 能认：秒/毫秒时间戳、ISO、RSS 的 "Mon, 16 Nov 2026 01:44:00 GMT"、微博的 "刚刚" "5分钟前" "今天 10:23" "11月19日 10:23" "2025年11月19日 10:23"、"2026-11-19"。
 */
export function parseTime(v, now = new Date()) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v).trim())) {
    const n = Number(v)
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) || n <= 0 ? null : d.toISOString()
  }
  const s = String(v).trim()
  if (/^刚刚/.test(s)) return now.toISOString()
  let m = /^(\d+)\s*(秒|分钟|小时|天)前/.exec(s)
  if (m) {
    const unit = { 秒: 1e3, 分钟: 6e4, 小时: 36e5, 天: 864e5 }[m[2]]
    return new Date(now.getTime() - Number(m[1]) * unit).toISOString()
  }
  m = /^(今天|昨天)\s*(\d{1,2}):(\d{2})/.exec(s)
  if (m) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (m[1] === '昨天' ? 1 : 0), Number(m[2]), Number(m[3]))
    return d.toISOString()
  }
  m = /^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/.exec(s)
  if (m) {
    const d = new Date(m[1] ? Number(m[1]) : now.getFullYear(), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0))
    // 没写年份、算出来在未来的，是去年的
    if (!m[1] && d.getTime() > now.getTime() + 864e5) d.setFullYear(d.getFullYear() - 1)
    return d.toISOString()
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString()
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ------------------------------------------------------------------ 文字

/** 去掉 HTML 标签和常见转义，压掉多余空白。 */
export function plain(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

const fold = s => String(s ?? '').toLowerCase().replace(/\s+/g, '')
export const short = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t }
const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 16)

/** 整理一个监控对象的搜索词：名称 + 别名，去空、去重。 */
export function termsOf(target) {
  const list = [target?.name, ...(target?.keywords ?? [])].map(x => String(x ?? '').trim()).filter(Boolean)
  return [...new Set(list)]
}

/** 这段字里有没有提到这些词（不分大小写、不管空格）。 */
export function mentions(text, terms) {
  const t = fold(text)
  return terms.some(w => w && t.includes(fold(w)))
}

/** 命中排除词的不要（比如监控「小米」时排除「小米粥」）。 */
export function excluded(text, words) {
  const t = fold(text)
  return (words ?? []).some(w => fold(w) && t.includes(fold(w)))
}

// ------------------------------------------------------------------ 去重

function normUrl(u) {
  try {
    const x = new URL(u)
    // 去掉跟踪参数，留下能区分内容的部分
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|spm|from|share|xsec_source|source|vd_source|oc)$/i.test(k) || /^utm_/.test(k)) x.searchParams.delete(k)
    x.hash = ''
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}${x.search}`
  } catch { return String(u ?? '') }
}

/**
 * 一条内容的「身份证」：同一条不管从哪种方式抓来（免费、浏览器、付费），算出来都一样。
 * 有平台自己的编号就用编号；新闻用标题（同一篇常被好几个网站转）；都没有就用链接，再不行用作者 + 正文。
 */
export function itemKey(item) {
  const p = item.platform
  const kind = item.kind === 'comment' ? 'c' : 'p'
  if (p === 'news') return `news:${hash(fold(item.title || item.text).replace(/[-_|—–·].{0,30}$/, ''))}`
  if (item.pid) return `${p}:${kind}:${item.pid}`
  if (item.url) return `${p}:${kind}:u:${hash(normUrl(item.url))}`
  return `${p}:${kind}:t:${hash(`${item.author ?? ''}|${fold(item.text).slice(0, 120)}`)}`
}

/**
 * 去重：把这次抓到的和已经存的比，同一条只留一份。
 * @param {object[]} incoming 这次抓到的（还没有 key）
 * @param {Set<string>} known 已经存过的 key
 * @returns {object[]} 真正新的（带上了 key）
 */
export function dedupe(incoming, known) {
  const seen = new Set(known)
  const out = []
  for (const raw of incoming) {
    const key = itemKey(raw)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...raw, key })
  }
  return out
}

/**
 * 抓来的一堆内容先过一遍筛子：排除词、太旧的、帖子里根本没提到监控对象的。
 * 评论不要求自己带关键词（「这车太烂了」也是在骂），交给模型判断。
 * @returns {{ keep: object[], dropped: { excluded: number, old: number, offTopic: number } }}
 */
export function screen(items, { terms, exclude, lookbackDays = 7, now = new Date() }) {
  const since = now.getTime() - lookbackDays * 864e5
  const dropped = { excluded: 0, old: 0, offTopic: 0 }
  const keep = []
  for (const it of items) {
    const all = `${it.title ?? ''} ${it.text ?? ''}`
    if (excluded(all, exclude)) { dropped.excluded += 1; continue }
    if (it.time && new Date(it.time).getTime() < since) { dropped.old += 1; continue }
    if (it.kind !== 'comment' && !mentions(all, terms)) { dropped.offTopic += 1; continue }
    if (!String(it.text ?? '').trim() && !String(it.title ?? '').trim()) continue
    keep.push(it)
  }
  return { keep, dropped }
}

// ------------------------------------------------------------------ 模型判断：拼题目、解析回答

export const JUDGE_SYSTEM = `你是品牌口碑分析员。用户在监控网上有没有人骂他（一个品牌、一个账号或一个人）。
你会收到一批帖子和评论，逐条判断，只输出 JSON，不要别的话。`

/** 一批要判断的内容拼成给模型的题目。每条带编号 i，模型按编号回答。 */
export function judgePrompt(target, batch) {
  const lines = batch.map((it, i) => {
    const ctx = it.kind === 'comment' && it.parentTitle ? `（这是「${short(it.parentTitle, 60)}」下面的评论）` : ''
    const body = it.kind === 'comment' ? it.text : [it.title, it.text].filter(Boolean).join('：')
    return `[${i}] ${PLATFORM_NAME[it.platform] ?? it.platform}${it.kind === 'comment' ? '评论' : '帖子'}${ctx} ${short(String(body ?? '').replace(/\s+/g, ' '), 400)}`
  })
  return `监控对象：${target.name}${target.keywords?.length ? `（也叫：${target.keywords.join('、')}）` : ''}

逐条判断下面 ${batch.length} 条内容：
- related：是不是在说这个监控对象（同名的别的东西、只是顺带提一句算 false）
- sentiment：对监控对象的态度。neg = 骂、吐槽、抱怨、投诉、阴阳怪气；neu = 中性、提问、转述新闻；pos = 夸、推荐
- severity：只在 neg 时填，1 = 轻微吐槽，2 = 明确不满，3 = 严重（投诉维权、指控、可能扩散的负面）；不是 neg 填 0
- reason：一句话理由，20 字以内，说清楚在骂什么
- aspect：骂的是哪方面，两三个字自由归类，比如 价格、质量、服务、售后、体验、态度、安全、宣传；不是 neg 填空字符串

内容：
${lines.join('\n')}

只输出这个格式的 JSON：
{"results":[{"i":0,"related":true,"sentiment":"neg","severity":2,"reason":"…","aspect":"售后"}]}`
}

/** 从模型回复里抠出 JSON（可能包在 ``` 里，前后可能有废话）。 */
export function extractJson(text) {
  if (!text) return null
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  for (const c of [fence?.[1], text]) {
    if (!c) continue
    for (const [open, close] of [['{', '}'], ['[', ']']]) {
      const start = c.indexOf(open)
      const end = c.lastIndexOf(close)
      if (start >= 0 && end > start) {
        try { return JSON.parse(c.slice(start, end + 1)) } catch { /* 换一种再试 */ }
      }
    }
  }
  return null
}

const SENT_ALIAS = { neg: 'neg', negative: 'neg', 骂: 'neg', 负面: 'neg', 吐槽: 'neg', neu: 'neu', neutral: 'neu', 中性: 'neu', pos: 'pos', positive: 'pos', 夸: 'pos', 正面: 'pos' }

/**
 * 解析模型对一批内容的回答。
 * @returns {Array<object|null>} 和 batch 一一对应；某条模型没答、答得不对就是 null（这条算「没判断」）。
 *          整段回答都读不出 JSON 时返回 null（这一批算失败，要重试）。
 */
export function parseJudgement(text, size) {
  const json = extractJson(text)
  const list = Array.isArray(json) ? json : Array.isArray(json?.results) ? json.results : null
  if (!list) return null
  const out = Array.from({ length: size }, () => null)
  list.forEach((r, n) => {
    if (!r || typeof r !== 'object') return
    const i = Number.isInteger(Number(r.i)) && r.i !== '' && r.i !== null && r.i !== undefined ? Number(r.i) : n
    if (i < 0 || i >= size) return
    const sentiment = SENT_ALIAS[String(r.sentiment ?? '').trim().toLowerCase()] ?? SENT_ALIAS[String(r.sentiment ?? '').trim()]
    if (!sentiment) return
    const related = r.related === false || r.related === 'false' || r.related === 0 ? false : true
    const sev = Math.round(Number(r.severity) || 0)
    out[i] = {
      related,
      sentiment,
      severity: sentiment === 'neg' ? Math.min(3, Math.max(1, sev || 1)) : 0,
      reason: short(String(r.reason ?? '').trim(), 60),
      aspect: sentiment === 'neg' ? short(String(r.aspect ?? '').trim(), 8) : '',
    }
  })
  return out
}

/** 一条内容现在算什么情绪：用户改过就听用户的。'unrelated' 表示用户说和自己无关。 */
export function sentimentOf(item) {
  if (item.manual?.sentiment) return item.manual.sentiment
  if (item.judge?.status !== 'done') return 'unknown'
  return item.judge.related === false ? 'unrelated' : item.judge.sentiment
}
export const isNeg = item => sentimentOf(item) === 'neg'
export const isRelated = item => !['unrelated', 'unknown'].includes(sentimentOf(item))
export const severityOf = item => (isNeg(item) ? (item.manual?.sentiment === 'neg' && item.judge?.sentiment !== 'neg' ? 2 : item.judge?.severity || 1) : 0)

// ------------------------------------------------------------------ 日报统计

const likesOf = it => Number(it.stats?.likes) || 0

/**
 * 某一天的统计（按「这一天新发现的」算）。
 * @returns 今天新增多少、多少在骂、最严重的几条、主要骂什么、各平台、和前几天比、近 days 天每天骂的条数。
 */
export function dayStats(items, date, { days = 14, top = 5 } = {}) {
  const byDate = new Map()
  for (const it of items) {
    if (!byDate.has(it.foundDate)) byDate.set(it.foundDate, [])
    byDate.get(it.foundDate).push(it)
  }
  const todays = byDate.get(date) ?? []
  const neg = todays.filter(isNeg)
  const worst = [...neg].sort((a, b) => severityOf(b) - severityOf(a) || likesOf(b) - likesOf(a) || String(b.time ?? '').localeCompare(String(a.time ?? ''))).slice(0, top)
  const count = (list, fn) => {
    const m = new Map()
    for (const it of list) { const k = fn(it) || '其他'; m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
  }
  const series = []
  for (let n = days - 1; n >= 0; n -= 1) {
    const d = daysBefore(date, n)
    const list = byDate.get(d) ?? []
    series.push({ date: d, neg: list.filter(isNeg).length, total: list.filter(isRelated).length })
  }
  // 和前 7 天比（只算有数据的日子，没检查过的日子不算 0）
  const before = series.slice(-8, -1).filter(s => byDate.has(s.date))
  const avg = before.length ? before.reduce((a, s) => a + s.neg, 0) / before.length : null
  let trend = 'none'
  if (avg !== null) trend = neg.length > avg * 1.3 + 0.5 ? 'more' : neg.length < avg * 0.7 - 0.5 ? 'less' : 'same'
  return {
    date,
    total: todays.length,
    related: todays.filter(isRelated).length,
    neg: neg.length,
    pos: todays.filter(it => sentimentOf(it) === 'pos').length,
    unjudged: todays.filter(it => sentimentOf(it) === 'unknown').length,
    severe: neg.filter(it => severityOf(it) >= 3).length,
    worstIds: worst.map(it => it.id),
    aspects: count(neg, it => it.manual?.sentiment === 'neg' && !it.judge?.aspect ? '' : it.judge?.aspect),
    platforms: count(neg, it => PLATFORM_NAME[it.platform]),
    prevAvg: avg === null ? null : Math.round(avg * 10) / 10,
    trend,
    series,
  }
}

/** 模型写日报总结用的题目。 */
export function reportPrompt(target, stats, worstItems) {
  const trendText = { more: '比前几天多', less: '比前几天少', same: '和前几天差不多', none: '之前没有数据可比' }[stats.trend]
  return `监控对象：${target}
今天新发现 ${stats.total} 条提到它的内容，其中 ${stats.related} 条确实相关，${stats.neg} 条在骂/吐槽（严重的 ${stats.severe} 条），${stats.pos} 条在夸。
骂的条数${trendText}${stats.prevAvg !== null ? `（前几天平均每天 ${stats.prevAvg} 条）` : ''}。
主要在骂：${stats.aspects.slice(0, 5).map(a => `${a.label} ${a.value} 条`).join('、') || '无'}
骂得最多的平台：${stats.platforms.slice(0, 3).map(a => `${a.label} ${a.value} 条`).join('、') || '无'}
最严重的几条：
${worstItems.map((it, i) => `${i + 1}. [${PLATFORM_NAME[it.platform]}] ${short(String(it.title ? `${it.title}：${it.text}` : it.text).replace(/\s+/g, ' '), 150)}（${it.judge?.reason ?? ''}）`).join('\n') || '无'}

用两三句大白话给老板写今天的口碑小结：有没有人骂、主要骂什么、要不要马上处理。不要列表、不要标题、不要加粗，直接输出这两三句话。`
}

/** 模型没写成时用的保底总结。 */
export function fallbackSummary(stats) {
  if (!stats.total) return '今天还没有发现新的提及。'
  if (!stats.neg) return `今天新发现 ${stats.total} 条提及，没看到骂你的。${stats.unjudged ? `还有 ${stats.unjudged} 条模型没判断完。` : ''}`
  const what = stats.aspects.slice(0, 2).map(a => a.label).join('和')
  const trend = { more: '比前几天多了', less: '比前几天少了', same: '和前几天差不多', none: '' }[stats.trend]
  return `今天有 ${stats.neg} 条在骂你${what ? `，主要说${what}` : ''}${trend ? `，${trend}` : ''}。${stats.severe ? `其中 ${stats.severe} 条比较严重，建议先看。` : ''}`
}

// ------------------------------------------------------------------ 花钱：每月上限

/**
 * 付费接口的账本。spend 是 state.spend（按月记：{ '2026-11': { calls, yuan } }）。
 * 每次调用前问 canSpend，调完 record。到上限就不再调，这次检查照常往下走（不报错）。
 */
export function makeBudget(spend, { monthlyCap, unitPrice }, now = () => new Date()) {
  const month = () => monthOf(now())
  const cur = () => (spend[month()] ??= { calls: 0, yuan: 0 })
  return {
    canSpend: () => Number(monthlyCap) > 0 && cur().yuan + Number(unitPrice) <= Number(monthlyCap) + 1e-9,
    record(n = 1) { const c = cur(); c.calls += n; c.yuan = Math.round((c.yuan + n * Number(unitPrice)) * 10000) / 10000 },
    used: () => ({ month: month(), ...cur(), cap: Number(monthlyCap) }),
  }
}

// ------------------------------------------------------------------ 看板统计（「今天」页的图表、「全部评论」页的小图）

const num = v => Number(v) || 0
/** 一条的互动量：点赞 + 评论 + 转发（播放量不算，量级差太多）。 */
export const engagementOf = it => num(it.stats?.likes) + num(it.stats?.comments) + num(it.stats?.shares)
const SENT_KEYS = ['neg', 'neu', 'pos', 'unknown', 'unrelated']
const tally = list => {
  const out = Object.fromEntries(SENT_KEYS.map(k => [k, 0]))
  for (const it of list) out[sentimentOf(it)] += 1
  return out
}
const groupByDate = items => {
  const m = new Map()
  for (const it of items) {
    if (!m.has(it.foundDate)) m.set(it.foundDate, [])
    m.get(it.foundDate).push(it)
  }
  return m
}
/** 从 to 往前数 days 天，每天一格：各情绪多少条、严重的几条、这天有没有检查过（有数据才算检查过）。 */
function daySeries(byDate, to, days) {
  const out = []
  for (let n = days - 1; n >= 0; n -= 1) {
    const date = daysBefore(to, n)
    const list = byDate.get(date) ?? []
    const c = tally(list)
    out.push({ date, checked: byDate.has(date), ...c, related: c.neg + c.neu + c.pos, severe: list.filter(it => severityOf(it) >= 3).length })
  }
  return out
}

// 高频词：不引分词库，用「两到六个字的片段出现在几条里」来数，再把被长词包住的短片段去掉。
const STOP_EDGE_START = /^[的了吗呢吧啊呀哦嘛么着过是在和与及或也都就还又把被给让我你他她它这那个]/
const STOP_EDGE_END = /[的了吗呢吧啊呀哦嘛么着过是在和与及或也都就还又把被给让我你他她它这那个]$/
const STOP_WORDS = new Set(['什么', '怎么', '这个', '那个', '就是', '真的', '一个', '没有', '不是', '可以', '自己', '还是', '因为', '但是', '已经', '知道', '现在', '觉得', '这么', '那么', '如果', '时候', '这样', '一下', '还有', '然后', '所以', '而且', '不过', '只是', '起来', '出来', '东西', '大家', '视频', '评论', '回复', '转发', '网页链接', '全文', '展开', '收起', '一样', '不会', '不能', '不要', '为什么', '有没有', '是不是', '有点', '一点', '感觉', '可能', '应该', '其实', '直接', '还要', '根本', '还没', '一直', '非常', '特别', '简直', '真是', '每次', '一次', '两次', '三次', '一个月', '一个多月'])

/**
 * 一批内容里反复出现的词（给词云用）。同一条里出现多次只算一次；模型写的理由里出现的多算一次（理由更像「在骂什么」）。
 * @param {object[]} list 内容
 * @param {string[]} terms 监控对象的名称和别名（这些词每条都有，不算）
 * @returns {{ word: string, value: number }[]}
 */
export function hotWords(list, terms = [], top = 30) {
  const score = new Map()
  const docs = new Map() // 词 → 出现在第几条（用来判断两个片段是不是总一起出现）
  const gramsOf = text => {
    const out = new Set()
    for (const run of String(text ?? '').match(/[\u4e00-\u9fff]+/g) ?? []) {
      for (let n = 2; n <= 6; n += 1) for (let i = 0; i + n <= run.length; i += 1) out.add(run.slice(i, i + n))
    }
    for (const w of String(text ?? '').match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? []) out.add(w)
    return out
  }
  list.forEach((it, idx) => {
    for (const w of gramsOf(`${it.title ?? ''} ${String(it.text ?? '').slice(0, 300)} ${it.judge?.reason ?? ''}`)) {
      score.set(w, (score.get(w) ?? 0) + 1)
      if (!docs.has(w)) docs.set(w, [])
      docs.get(w).push(idx)
    }
    for (const w of gramsOf(it.judge?.reason)) score.set(w, (score.get(w) ?? 0) + 1)
  })
  const banned = terms.map(t => fold(t)).filter(Boolean)
  const keep = [...score.entries()].filter(([w, n]) => {
    if (n < 2) return false
    const f = fold(w)
    if (STOP_WORDS.has(w) || STOP_EDGE_START.test(w) || STOP_EDGE_END.test(w)) return false
    if (banned.some(t => t.includes(f) || f.includes(t))) return false
    return true
  })
  // 长的包住短的、而且短的几乎只在长的里出现：留长的
  const kept = new Map(keep)
  const drop = new Set()
  for (const [long, n] of keep) {
    if (!/^[\u4e00-\u9fff]+$/.test(long)) continue
    for (let len = 2; len < long.length; len += 1) {
      for (let i = 0; i + len <= long.length; i += 1) {
        const s = long.slice(i, i + len)
        const m = kept.get(s)
        if (m !== undefined && m <= n * 1.25) drop.add(s)
      }
    }
  }
  // 两个片段总在同几条里一起出现、首尾接得上（「客服根本不理」「服根本不理人」）：拼成一个
  const rest = keep.filter(([w]) => !drop.has(w)).sort((a, b) => b[1] - a[1]).slice(0, 300)
  const groups = new Map()
  for (const [w, n] of rest) {
    const sig = `${n}|${docs.get(w)?.join(',')}`
    if (!groups.has(sig)) groups.set(sig, [])
    groups.get(sig).push(w)
  }
  const out = []
  for (const [sig, ws] of groups) {
    const n = Number(sig.split('|')[0])
    const pool = [...ws]
    while (pool.length) {
      let cur = pool.shift()
      for (let changed = true; changed;) {
        changed = false
        for (let i = 0; i < pool.length; i += 1) {
          const b = pool[i]
          let joined = null
          if (cur.includes(b)) joined = cur
          else if (b.includes(cur)) joined = b
          for (let k = Math.min(cur.length, b.length) - 1; k >= 1 && !joined; k -= 1) {
            if (cur.endsWith(b.slice(0, k))) joined = cur + b.slice(k)
            else if (b.endsWith(cur.slice(0, k))) joined = b + cur.slice(k)
          }
          if (joined) { cur = joined; pool.splice(i, 1); changed = true; break }
        }
      }
      if (cur.length <= 10) out.push([cur, n])
    }
  }
  // 拼完以后再去一次：被别的词包住、次数也差不多的，不要
  const final = out.filter(([w, n]) => !out.some(([o, m]) => o !== w && o.length > w.length && o.includes(w) && n <= m * 1.25))
  return final
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, top).map(([word, value]) => ({ word, value }))
}

/**
 * 「今天」页看板：今天的几个大数字（和前 7 天比）、近 days 天每天的情绪、各平台、负面在骂什么、严重程度、高频词。
 * @param {object[]} items 全部内容
 * @param {string} date 今天
 * @param {{ days?: number, terms?: string[] }} opts days 只能是 7 到 30；terms 是监控对象的名称和别名（不进词云）
 */
export function boardStats(items, date, { days = 14, terms = [] } = {}) {
  const span = Math.min(30, Math.max(7, Math.round(Number(days) || 14)))
  const byDate = groupByDate(items)
  const from = daysBefore(date, span - 1)
  const inRange = items.filter(it => it.foundDate >= from && it.foundDate <= date)
  const negs = inRange.filter(isNeg)
  const count = (list, fn) => {
    const m = new Map()
    for (const it of list) { const k = fn(it) || '其他'; m.set(k, (m.get(k) ?? 0) + 1) }
    return m
  }
  const aspectCount = count(negs, it => it.judge?.aspect)
  const aspectSevere = count(negs.filter(it => severityOf(it) >= 3), it => it.judge?.aspect)
  const platforms = PLATFORMS.map(p => {
    const c = tally(inRange.filter(it => it.platform === p.key))
    return { key: p.key, name: p.name, related: c.neg + c.neu + c.pos, neg: c.neg, neu: c.neu, pos: c.pos }
  })
  // 今天的大数字，和前 7 天里检查过的日子比（没检查过的日子不算 0）
  const spark = daySeries(byDate, date, 14)
  const todayRow = spark.at(-1)
  const todayNeg = (byDate.get(date) ?? []).filter(isNeg)
  const before = spark.slice(-8, -1).filter(s => s.checked)
  const avg = fn => (before.length ? Math.round((before.reduce((a, s) => a + fn(s), 0) / before.length) * 10) / 10 : null)
  const prevRelated = before.reduce((a, s) => a + s.related, 0)
  const prevEng = before.length ? Math.round(before.reduce((a, s) => a + (byDate.get(s.date) ?? []).filter(isNeg).reduce((x, it) => x + engagementOf(it), 0), 0) / before.length) : null
  const share = (neg, related) => (related ? Math.round((neg / related) * 1000) / 10 : null)
  return {
    date,
    days: span,
    from,
    kpi: {
      mentions: todayRow.related,
      neg: todayRow.neg,
      pos: todayRow.pos,
      neu: todayRow.neu,
      unknown: todayRow.unknown,
      severe: todayRow.severe,
      negShare: share(todayRow.neg, todayRow.related),
      engagement: todayNeg.reduce((a, it) => a + engagementOf(it), 0),
      prev: {
        days: before.length,
        mentions: avg(s => s.related),
        neg: avg(s => s.neg),
        negShare: before.length ? share(before.reduce((a, s) => a + s.neg, 0), prevRelated) : null,
        engagement: prevEng,
      },
      spark: spark.map(s => ({ date: s.date, checked: s.checked, mentions: s.related, neg: s.neg, negShare: share(s.neg, s.related) })),
    },
    series: daySeries(byDate, date, span),
    totals: { ...tally(inRange), related: inRange.filter(isRelated).length, severe: negs.filter(it => severityOf(it) >= 3).length },
    platforms,
    aspects: [...aspectCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value, severe: aspectSevere.get(label) ?? 0 })),
    severity: [1, 2, 3].map(level => ({ level, value: negs.filter(it => severityOf(it) === level).length })),
    keywords: hotWords(negs, terms),
  }
}

/**
 * 「全部评论」的筛选。skip 写 'platform' 或 'sentiment' 时不按那一项筛（算筛选旁边的计数时用）。
 * @param {{ platform?: string, sentiment?: string, from?: string, kw?: string, aspect?: string }} f from 是最早的发现日期，空字符串表示不限；aspect 是「骂的哪方面」（看板上点了某个方面时用）
 */
export function filterItems(items, { platform = 'all', sentiment = 'related', from = '', kw = '', aspect = '' } = {}, skip = '') {
  const q = String(kw ?? '').trim().toLowerCase()
  return items.filter(it => {
    if (skip !== 'platform' && platform !== 'all' && it.platform !== platform) return false
    if (from && it.foundDate < from) return false
    if (aspect && (it.judge?.aspect || '其他') !== aspect) return false
    if (skip !== 'sentiment') {
      const s = sentimentOf(it)
      if (sentiment === 'related' ? s === 'unrelated' : sentiment !== 'all' && s !== sentiment) return false
    }
    if (q && !`${it.title ?? ''} ${it.text ?? ''} ${it.author ?? ''} ${it.parentTitle ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
}

/**
 * 「全部评论」上方的小图：按平台数（不管平台筛选）、按情绪数（不管情绪筛选）、每天多少条（按全部筛选）。
 * 日期不限时，每天的图只画最近 30 天。
 */
export function listFacets(items, f, date) {
  const byPlat = filterItems(items, f, 'platform')
  const bySent = filterItems(items, f, 'sentiment')
  const all = filterItems(items, f)
  const from = f.from || daysBefore(date, 29)
  const spanDays = Math.max(1, Math.min(30, Math.round((new Date(`${date}T00:00:00`) - new Date(`${from}T00:00:00`)) / 864e5) + 1))
  return {
    platforms: PLATFORMS.map(p => {
      const list = byPlat.filter(it => it.platform === p.key)
      return { key: p.key, name: p.name, total: list.length, neg: list.filter(isNeg).length }
    }),
    sentiments: tally(bySent),
    days: daySeries(groupByDate(all), date, spanDays).map(({ date: d, neg, neu, pos, unknown }) => ({ date: d, neg, neu, pos, unknown })),
  }
}
