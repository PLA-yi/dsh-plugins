/**
 * 口碑雷达 · 后台（Host）
 *
 * 每天去全网找提到你（一个品牌、一个账号或一个人）的帖子和评论，让 DSH 里配好的模型判断哪些在骂、在吐槽。
 * 页面只发一句「我要做什么」（action），这里的 handlers 负责真的去做。
 * 数据存在 dataDir 文件夹里的 JSON 文件：settings.json（设置）、items.json（抓到的内容）、state.json（平台状态、日报、花费）、
 * secret.json（付费接口密钥，只存在这台电脑上，不会发给页面）、chrome/（插件自己那个 Chrome 窗口的资料）。
 *
 * 分工：
 *   host/core.js       去重、判断结果解析、日报统计、花钱上限（不碰网络，测试直接测它）
 *   host/free.js       免费方式 A：B 站、公众号（搜狗微信）、新闻（必应 / Google 新闻 RSS）
 *   host/browser.js    免费方式 B：微博、知乎、小红书、抖音，在插件自己的 Chrome 窗口里看（你自己扫码登录）
 *   host/paid.js       付费方式：TikHub，免费抓不到时补
 *   host/judge.js      调 DSH 的模型判断、写日报总结
 *   host/checker.js    检查一次的整个流程，和每天定时
 *
 * 改了这个文件要重启 DSH 才生效（页面文件 client.js 改了会自动生效）。
 */
import { join } from 'node:path'
import { MANUAL_SENTIMENTS, PLATFORMS, PLATFORM_NAME, boardStats, dateOf, dayStats, daysBefore, engagementOf, filterItems, listFacets, makeBudget, monthOf, sentimentOf, severityOf, short, termsOf } from './host/core.js'
import { BROWSER_PLATFORMS, makeBrowser } from './host/browser.js'
import { UserError, makeChecker } from './host/checker.js'
import { makeAsk, modelName } from './host/judge.js'
import { PAID_PLATFORMS } from './host/paid.js'
import { makeStore } from './host/store.js'

export const name = 'reputation-radar'
export const inject = ['connection']

/** 页面调后台走的地址。页面里的 ROUTE 要和它对上（去掉开头的 /api/）。 */
const ROUTE = '/api/reputationRadar/call'

// ------------------------------------------------------------------ 存数据

const firstSettings = () => ({
  targets: [], // [{ id, name, keywords: [] }]
  exclude: [],
  platforms: Object.fromEntries(PLATFORMS.map(p => [p.key, true])),
  autoEnabled: true,
  autoTime: '09:00',
  lookbackDays: 7,
  paid: { enabled: true, monthlyCap: 5, unitPrice: 0.01 },
})
const fixSettings = s => {
  const d = firstSettings()
  return { ...d, ...s, platforms: { ...d.platforms, ...s.platforms }, paid: { ...d.paid, ...s.paid } }
}
const fixState = s => ({ platforms: {}, runs: [], reports: {}, spend: {}, lastAutoDate: '', ...s })

// ------------------------------------------------------------------ 页面用的几个小整理

/** 列表里一行：正文截短，不带太多东西。 */
const row = it => ({
  id: it.id, platform: it.platform, kind: it.kind, url: it.url, author: it.author, time: it.time, foundDate: it.foundDate,
  title: short(it.title, 60), text: short(it.text, 160), parentTitle: short(it.parentTitle, 40), likes: it.stats?.likes ?? null, comments: it.stats?.comments ?? null, shares: it.stats?.shares ?? null, engagement: engagementOf(it), via: it.via,
  sentiment: sentimentOf(it), severity: severityOf(it), reason: it.judge?.reason ?? '', aspect: it.judge?.aspect ?? '', manual: Boolean(it.manual?.sentiment),
  judgeError: it.judge?.status === 'failed' ? it.judge.error : '',
})

/** 各平台现在的连接状态，给页面显示。 */
function platformView(settings, state, secret, browserRunning) {
  const budget = makeBudget(structuredClone(state.spend ?? {}), settings.paid)
  const paidReady = Boolean(secret.tikhubKey) && settings.paid?.enabled !== false
  return PLATFORMS.map(p => {
    const st = state.platforms?.[p.key] ?? {}
    const needsBrowser = BROWSER_PLATFORMS.includes(p.key)
    let status = st.status ?? (needsBrowser ? 'login' : 'unknown')
    if (needsBrowser && !st.status && st.loginOpened) status = 'waiting'
    return {
      key: p.key, name: p.name, on: settings.platforms?.[p.key] !== false,
      way: needsBrowser ? 'browser' : 'free', status, note: st.note ?? (needsBrowser ? '要在插件的 Chrome 窗口里登录一次' : '还没检查过'),
      at: st.at ?? null, found: st.found ?? 0, fresh: st.fresh ?? 0,
      canLogin: needsBrowser, loginOpened: Boolean(st.loginOpened), browserRunning: needsBrowser && browserRunning,
      paidSupported: PAID_PLATFORMS.includes(p.key), paidReady: paidReady && PAID_PLATFORMS.includes(p.key) && budget.canSpend(), paid: st.paid ?? null,
    }
  })
}

const clean = (v, max) => String(v ?? '').trim().slice(0, max)
const words = (list, max, len) => [...new Set((Array.isArray(list) ? list : String(list ?? '').split(/[,，、\n]/)).map(x => clean(x, len)).filter(Boolean))].slice(0, max)

// ------------------------------------------------------------------ 能做的事：一个 action 一个函数

function makeHandlers({ stores, checker, browser, ctx, log }) {
  return {
    /**
     * 「今天」页：一句话结论、日报、最严重的几条、近 14 天、各平台状态、检查进度。
     * board 是看板上的图：今天的大数字、近 days 天（7 到 30）的情绪走势、各平台、负面在骂什么、高频词。
     */
    async overview({ days = 14 } = {}) {
      const [settings, { items }, state, secret] = await Promise.all([stores.settings.read(), stores.items.read(), stores.state.read(), stores.secret.read()])
      const today = dateOf()
      const stats = dayStats(items, today)
      const report = state.reports?.[today] ?? null
      const worst = stats.worstIds.map(id => items.find(x => x.id === id)).filter(Boolean).map(row)
      const spend = makeBudget(structuredClone(state.spend ?? {}), settings.paid).used()
      return {
        today, hasTargets: settings.targets.length > 0, targets: settings.targets.map(t => t.name),
        stats: { ...stats, worstIds: undefined }, report, worst, platforms: platformView(settings, state, secret, browser.running()),
        progress: checker.progress(), lastRun: state.runs?.[0] ?? null, spend, model: modelName(ctx),
        auto: { enabled: settings.autoEnabled, time: settings.autoTime },
        board: boardStats(items, today, { days, terms: settings.targets.flatMap(termsOf) }),
      }
    },

    /** 检查进度（页面在检查时每秒多问几次）。 */
    async progress() { return checker.progress() },

    /** 「立即检查」：在后台跑，马上回话；页面去问 progress。 */
    async check() {
      const job = checker.run({ reason: 'manual' })
      job.catch(e => { if (!(e instanceof UserError)) log(`检查出错：${e?.stack ?? e}`) })
      // 一开始就不让做的（没填监控对象、正在检查），直接告诉用户
      const early = await Promise.race([job.then(() => null, e => e), new Promise(r => setTimeout(() => r(null), 300))])
      if (early instanceof UserError) throw early
      return checker.progress()
    },

    /** 「全部评论」：按平台、情绪、日期、关键词筛。facets 是筛选上方的小图（各平台、各情绪多少条，每天多少条）。 */
    async list({ platform = 'all', sentiment = 'related', range = '7', q = '', aspect = '', page = 1, size = 50 } = {}) {
      const { items } = await stores.items.read()
      const today = dateOf()
      const from = range === 'all' ? '' : range === 'today' ? today : daysBefore(today, Number(range) - 1)
      const f = { platform, sentiment, from, kw: clean(q, 40), aspect: clean(aspect, 20) }
      const rows = filterItems(items, f).sort((a, b) => b.id - a.id)
      const n = Math.min(200, Math.max(10, Number(size) || 50))
      const p = Math.max(1, Number(page) || 1)
      return { total: rows.length, rows: rows.slice(0, p * n).map(row), hasMore: rows.length > p * n, facets: listFacets(items, f, today) }
    },

    /** 一条的全部内容（点开看原文）。 */
    async item({ id }) {
      const it = (await stores.items.read()).items.find(x => x.id === Number(id))
      if (!it) throw new UserError('找不到这一条，可能已经被清掉了')
      return { ...row(it), title: it.title, text: it.text, parentTitle: it.parentTitle, stats: it.stats, keyword: it.keyword, target: it.target, foundAt: it.foundAt, judge: it.judge, manualSentiment: it.manual?.sentiment ?? null }
    },

    /** 「判错了」：手动改情绪。sentiment 传 null 表示改回模型的判断。 */
    async setSentiment({ id, sentiment }) {
      if (sentiment !== null && !MANUAL_SENTIMENTS.includes(sentiment)) throw new UserError('情绪只能是：骂、中性、夸、和我无关')
      return stores.items.change(d => {
        const it = d.items.find(x => x.id === Number(id))
        if (!it) throw new UserError('找不到这一条，可能已经被清掉了')
        it.manual = sentiment ? { sentiment, at: new Date().toISOString() } : null
        return row(it)
      })
    },

    /** 「设置」页要的东西。密钥只告诉页面「填了没有」和末四位。 */
    async settings() {
      const [settings, state, secret] = await Promise.all([stores.settings.read(), stores.state.read(), stores.secret.read()])
      const key = secret.tikhubKey ?? ''
      return {
        ...settings, key: { filled: Boolean(key), tail: key ? key.slice(-4) : '' },
        spend: makeBudget(structuredClone(state.spend ?? {}), settings.paid).used(), platformList: platformView(settings, state, secret, browser.running()), model: modelName(ctx),
      }
    },

    /** 保存设置（传哪几项改哪几项）。 */
    async saveSettings(patch = {}) {
      return stores.settings.change(s => {
        if (patch.targets !== undefined) {
          const list = (Array.isArray(patch.targets) ? patch.targets : []).map((t, i) => ({ id: clean(t.id, 20) || `t${Date.now()}${i}`, name: clean(t.name, 30), keywords: words(t.keywords, 10, 30) })).filter(t => t.name)
          if (list.length > 5) throw new UserError('监控对象最多 5 个')
          s.targets = list
        }
        if (patch.exclude !== undefined) s.exclude = words(patch.exclude, 30, 20)
        if (patch.platforms !== undefined) for (const p of PLATFORMS) if (typeof patch.platforms[p.key] === 'boolean') s.platforms[p.key] = patch.platforms[p.key]
        if (patch.autoEnabled !== undefined) s.autoEnabled = Boolean(patch.autoEnabled)
        if (patch.autoTime !== undefined) {
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(patch.autoTime))) throw new UserError('时间要写成 09:00 这样')
          s.autoTime = patch.autoTime
        }
        if (patch.lookbackDays !== undefined) s.lookbackDays = Math.min(30, Math.max(1, Math.round(Number(patch.lookbackDays) || 7)))
        if (patch.paid !== undefined) {
          const cap = Number(patch.paid.monthlyCap ?? s.paid.monthlyCap)
          const price = Number(patch.paid.unitPrice ?? s.paid.unitPrice)
          if (!(cap >= 0 && cap <= 1000)) throw new UserError('每月上限要在 0 到 1000 元之间')
          if (!(price > 0 && price <= 10)) throw new UserError('每次多少钱要大于 0、不超过 10 元')
          s.paid = { enabled: patch.paid.enabled === undefined ? s.paid.enabled : Boolean(patch.paid.enabled), monthlyCap: cap, unitPrice: price }
        }
        return s
      })
    },

    /** 填付费接口密钥（只存在这台电脑上）。传空字符串就是删掉。 */
    async saveKey({ key }) {
      const k = clean(key, 300)
      if (k && !/^[\w\-./+=]{16,}$/.test(k)) throw new UserError('密钥看起来不对：从 TikHub 后台「API 令牌」那里整个复制过来')
      await stores.secret.change(s => { s.tikhubKey = k })
      return { filled: Boolean(k), tail: k ? k.slice(-4) : '' }
    },

    /** 「打开登录窗口」：在插件自己的 Chrome 窗口里打开这个平台的登录页，你自己扫码。 */
    async openLogin({ platform }) {
      if (!BROWSER_PLATFORMS.includes(platform)) throw new UserError('这个平台不用登录')
      if (!browser.available()) throw new UserError('没找到 Google Chrome：这个平台要靠它打开，先装一个 Chrome')
      await browser.openLogin(platform)
      await stores.state.change(d => { d.platforms[platform] = { ...(d.platforms[platform] ?? {}), loginOpened: true } })
      return { ok: true }
    },

    /** 「我登好了」：看一眼插件的 Chrome 里这个平台登录了没有。 */
    async checkLogin({ platform }) {
      if (!BROWSER_PLATFORMS.includes(platform)) throw new UserError('这个平台不用登录')
      if (!browser.available()) throw new UserError('没找到 Google Chrome')
      const ok = await browser.loggedIn(platform, { start: true })
      await browser.closeIfIdle().catch(() => {})
      await stores.state.change(d => {
        const old = d.platforms[platform] ?? {}
        d.platforms[platform] = ok
          ? { ...old, loginOpened: true, everLoggedIn: true, status: 'ready', note: '已登录，下次检查会在插件的 Chrome 窗口里搜', at: new Date().toISOString() }
          : { ...old, loginOpened: true, status: old.everLoggedIn ? 'expired' : 'login', note: '还没看到登录：在插件的 Chrome 窗口里扫码登录后再点一次', at: new Date().toISOString() }
      })
      return { ok: Boolean(ok), name: PLATFORM_NAME[platform] }
    },

    /** 花费明细：本月和之前几个月。 */
    async spend() {
      const [settings, state] = await Promise.all([stores.settings.read(), stores.state.read()])
      return { month: monthOf(), cap: settings.paid.monthlyCap, unitPrice: settings.paid.unitPrice, months: state.spend ?? {} }
    },
  }
}

// ------------------------------------------------------------------ 把 handlers 接到页面能调的地址上（一般不用改）

async function respond(request, handlers, log) {
  let message
  try {
    message = await request.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (message?.type !== 'client-request' || typeof message.rpcId !== 'string') return new Response('bad request', { status: 400 })
  const { action, ...args } = message.payload ?? {}
  let result
  try {
    const handler = Object.hasOwn(handlers, action) ? handlers[action] : null
    if (!handler) throw new UserError(`后台没有「${action}」这个操作`)
    result = { ok: true, value: (await handler(args)) ?? null }
  } catch (error) {
    if (error instanceof UserError) {
      result = { ok: false, error: { code: `${name}/user`, message: error.message, details: {} } }
    } else {
      log(`操作「${action}」出错：${error?.stack ?? error}`)
      result = { ok: false, error: { code: `${name}/internal`, message: `插件内部出错了，不是你操作的问题（${error?.message ?? error}）`, details: {} } }
    }
  }
  return new Response(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result }), { headers: { 'content-type': 'application/json' } })
}

/**
 * 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ dataDir: string }} config - 来自 cordis.patch.yml。
 */
export function apply(ctx, config) {
  if (!config?.dataDir) throw new Error(`${name}：cordis.patch.yml 里要写 dataDir（这个插件存数据的文件夹）`)
  const dir = config.dataDir
  const log = text => ctx.logger?.warn?.(`${name}: ${text}`)
  const stores = {
    settings: makeStore(dir, 'settings.json', firstSettings, fixSettings),
    items: makeStore(dir, 'items.json', () => ({ seq: 0, items: [] })),
    state: makeStore(dir, 'state.json', () => fixState({}), fixState),
    secret: makeStore(dir, 'secret.json', () => ({ tikhubKey: '' })),
  }
  const browser = makeBrowser({ profileDir: join(dir, 'chrome'), log })
  const checker = makeChecker({ stores, browser, ask: makeAsk(ctx), modelName: () => modelName(ctx), log })
  const handlers = makeHandlers({ stores, checker, browser, ctx, log })

  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => respond(request, handlers, log),
  }), `${name}: 页面调后台的地址`)

  // 每天定时检查：插件进程里自己数时间，DSH 开着就跑；每分钟看一眼到没到点
  ctx.effect(() => {
    const first = setTimeout(() => checker.tick().catch(e => log(`定时检查出错：${e?.message ?? e}`)), 20_000)
    const timer = setInterval(() => checker.tick().catch(e => log(`定时检查出错：${e?.message ?? e}`)), 60_000)
    return () => { clearTimeout(first); clearInterval(timer) }
  }, `${name}: 每天定时检查`)

  // 插件停掉时，把插件自己开的 Chrome 窗口也关掉
  ctx.effect(() => () => { browser.close().catch(() => {}) }, `${name}: 关掉插件的 Chrome 窗口`)
}
