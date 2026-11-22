/**
 * 口碑雷达 · 检查一次：按平台搜 → 去重存下 → 模型判断 → 写日报。还有每天定时自动检查。
 *
 * 每个平台先走免费方式（A 公开接口 / B 浏览器窗口），抓不到的（要登录、被验证码挡住、暂时拿不到）
 * 再用付费接口补（要填了密钥、没到每月上限）。
 * 抓到的先存下来（标成「待判断」），再一批批交给模型判断：中途出错，已经抓到的也不会丢。
 */
import { PLATFORMS, PLATFORM_NAME, dateOf, dayStats, dedupe, makeBudget, screen, short, termsOf } from './core.js'
import { BROWSER_PLATFORMS } from './browser.js'
import { FREE_SOURCES } from './free.js'
import { judgeAll, writeSummary } from './judge.js'
import { PAID_PLATFORMS, paidSearch } from './paid.js'

/** 每个平台一次检查最多搜几个词（词多了轮着来会更好，先简单地取前几个）。 */
export const MAX_TERMS = 4
/** 浏览器方式：每个平台最多搜 3 个词、看 3 个帖子的评论，两次打开页面隔 6 秒。 */
const BROWSER_TERMS = 3
const BROWSER_COMMENTS = 3
const BROWSER_GAP = 6000
/** 一次检查最多判断多少条（太多了留到下次，省模型的钱）。 */
const JUDGE_LIMIT = 300
/** 最多存多少条，超了先删最早的。 */
export const MAX_ITEMS = 20000

export class UserError extends Error {}

const realSleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * @param {object} deps
 * @param {{ settings, items, state, secret }} deps.stores 四个 makeStore
 * @param {object} deps.browser makeBrowser() 的结果（测试时传假的）
 * @param {Function} deps.ask 问模型：ask({ system, prompt }) → 文字（测试时传假的）
 * @param {typeof fetch} [deps.fetchImpl]
 * @param {() => Date} [deps.now]
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {() => string} [deps.modelName]
 * @param {object} [deps.sources] 免费方式 A 的各个平台（测试时换成假的）
 */
export function makeChecker({ stores, browser, ask, fetchImpl = fetch, now = () => new Date(), sleep = realSleep, modelName = () => '', sources = FREE_SOURCES, paid = paidSearch, log = () => {} }) {
  let progress = { running: false }

  const say = text => {
    progress.step = text
    progress.log = [...(progress.log ?? []), { at: now().toISOString(), text }].slice(-40)
  }

  /** 浏览器方式抓一个平台（微博、知乎、小红书、抖音）。 */
  async function viaBrowser(key, terms, st) {
    if (!browser?.available?.()) return { status: 'blocked', note: '没找到 Google Chrome，这个平台要靠它打开。装好 Chrome 再试', items: [] }
    if (!st?.loginOpened) return { status: 'login', note: '还没登录：去「设置」点这个平台的「打开登录窗口」，在弹出的 Chrome 里扫码登录', items: [] }
    say(`${PLATFORM_NAME[key]}：打开插件的 Chrome 窗口`)
    const logged = await browser.loggedIn(key, { start: true })
    if (!logged) return { status: st.everLoggedIn ? 'expired' : 'login', note: st.everLoggedIn ? '登录过期了：去「设置」点「打开登录窗口」重新扫码' : '还没登录：在弹出的 Chrome 窗口里扫码登录，登好直接关窗口', items: [] }
    const posts = []
    let block = ''
    for (const [i, term] of terms.slice(0, BROWSER_TERMS).entries()) {
      if (i) await sleep(BROWSER_GAP)
      say(`${PLATFORM_NAME[key]}：在窗口里搜「${term}」`)
      const r = await browser.search(key, term)
      if (r.status === 'captcha' || r.status === 'expired') { block = r.status; break }
      if (r.status === 'error') log(`${key} 搜索出错：${r.note}`)
      posts.push(...r.items)
    }
    const items = [...posts]
    if (!block) {
      // 看评论：挑评论多的几个帖子（小红书搜索结果里没有评论数，就按顺序挑前几个）
      const list = [...new Map(posts.map(p => [p.pid, p])).values()].sort((a, b) => (b.stats?.comments ?? 0) - (a.stats?.comments ?? 0)).slice(0, BROWSER_COMMENTS)
      for (const p of list) {
        await sleep(BROWSER_GAP)
        say(`${PLATFORM_NAME[key]}：看「${short(p.title || p.text, 14)}」的评论`)
        const r = await browser.comments(key, p)
        if (r.status === 'captcha' || r.status === 'expired') { block = r.status; break }
        // 小红书：帖子页上补全了正文和时间，换掉搜索结果里那条
        const at = items.findIndex(x => x.pid === p.pid && x.kind === 'post')
        if (at >= 0 && r.post) items[at] = r.post
        items.push(...r.items)
      }
    }
    if (block === 'captcha') return { status: 'captcha', note: `${PLATFORM_NAME[key]}弹了验证：去插件弹出的 Chrome 窗口里自己点一下，弄完再「立即检查」`, items }
    if (block === 'expired') return { status: 'expired', note: `${PLATFORM_NAME[key]}要重新登录：去插件弹出的 Chrome 窗口里扫码，弄完再「立即检查」`, items }
    return { status: 'ok', note: `浏览器窗口：${posts.length} 个帖子、${items.length - posts.length} 条评论`, items }
  }

  /** 免费方式抓一个平台。 */
  async function viaFree(key, terms, st) {
    if (sources[key]) {
      const r = await sources[key](terms, { fetchImpl, sleep, say })
      return { ...r, via: 'free' }
    }
    if (BROWSER_PLATFORMS.includes(key)) return { ...(await viaBrowser(key, terms, st)), via: 'browser' }
    return { status: 'blocked', note: '这个平台暂时没有免费方式', items: [], via: 'free' }
  }

  /** 检查一次。reason：'manual'（点了立即检查）或 'auto'（定时）。 */
  async function run({ reason = 'manual' } = {}) {
    if (progress.running) throw new UserError('正在检查，等这次做完')
    // 一进来就标上「正在检查」（在第一个 await 之前），连点两次也只跑一次
    const startedAt = now()
    progress = { running: true, reason, startedAt: startedAt.toISOString(), step: '准备', platform: null, platformsDone: 0, platformsTotal: 0, found: 0, fresh: 0, toJudge: 0, judged: 0, log: [] }
    const summary = { reason, startedAt: startedAt.toISOString(), found: 0, fresh: 0, judged: 0, failed: 0, platforms: {} }
    try {
      const settings = await stores.settings.read()
      const targets = settings.targets ?? []
      if (!targets.length) throw new UserError('先去「设置」填要监控的对象')
      const enabled = PLATFORMS.filter(p => settings.platforms?.[p.key] !== false)
      if (!enabled.length) throw new UserError('平台都关了：去「设置」至少打开一个')
      progress.platformsTotal = enabled.length
      // 每个平台一格，给页面「逐个点亮」用：todo 还没搜、doing 正在搜、done 搜完了（带结果）
      progress.plats = enabled.map(p => ({ key: p.key, name: p.name, state: 'todo' }))
      // 搜索词：每个监控对象的名称 + 别名，记住每个词属于哪个对象
      const termTarget = new Map()
      for (const t of targets) for (const w of termsOf(t)) if (!termTarget.has(w)) termTarget.set(w, t.name)
      const terms = [...termTarget.keys()].slice(0, MAX_TERMS)
      const allTerms = [...termTarget.keys()]
      const secret = await stores.secret.read()
      const state = await stores.state.read()
      const spend = structuredClone(state.spend ?? {})
      const budget = makeBudget(spend, settings.paid ?? {}, now)
      const usePaid = Boolean(secret.tikhubKey) && settings.paid?.enabled !== false
      const known = new Set((await stores.items.read()).items.map(x => x.key))

      for (const p of enabled) {
        const key = p.key
        progress.platform = key
        progress.plats = progress.plats.map(x => (x.key === key ? { ...x, state: 'doing' } : x))
        say(`正在搜${p.name}`)
        const st = (await stores.state.read()).platforms?.[key] ?? {}
        let res
        try {
          res = await viaFree(key, terms, st)
        } catch (e) {
          log(`${key} 出错：${e?.stack ?? e}`)
          res = { status: 'error', note: `出错了：${e?.message ?? e}`, items: [], via: 'free' }
        }
        const tagged = res.items.map(x => ({ ...x, via: res.via }))
        // 免费抓不到的，用付费接口补
        let paidInfo = null
        if (res.status !== 'ok' && usePaid && PAID_PLATFORMS.includes(key)) {
          try {
            const pr = await paid(key, terms, { key: secret.tikhubKey, budget, fetchImpl, say, onSpend: () => stores.state.change(d => { d.spend = structuredClone(spend) }) })
            paidInfo = { status: pr.status, note: pr.note, calls: pr.calls, at: now().toISOString() }
            tagged.push(...pr.items.map(x => ({ ...x, via: 'paid' })))
          } catch (e) {
            paidInfo = { status: 'error', note: `付费接口出错：${e?.message ?? e}`, at: now().toISOString() }
          }
        }
        // 过筛子、去重、存下来（先标「待判断」）
        const at = now()
        const withTarget = tagged.map(x => ({ ...x, target: termTarget.get(x.keyword) ?? targets[0].name }))
        const { keep, dropped } = screen(withTarget, { terms: allTerms, exclude: settings.exclude, lookbackDays: settings.lookbackDays ?? 7, now: at })
        const fresh = dedupe(keep, known)
        for (const x of fresh) known.add(x.key)
        if (fresh.length) {
          await stores.items.change(d => {
            for (const x of fresh) {
              d.seq += 1
              d.items.push({ ...x, id: d.seq, foundAt: at.toISOString(), foundDate: dateOf(at), judge: { status: 'pending' }, manual: null })
            }
            if (d.items.length > MAX_ITEMS) d.items.splice(0, d.items.length - MAX_ITEMS)
          })
        }
        progress.found += tagged.length
        progress.fresh += fresh.length
        progress.platformsDone += 1
        progress.plats = progress.plats.map(x => (x.key === key ? { ...x, state: 'done', status: res.status, paid: paidInfo?.status ?? null, found: tagged.length, fresh: fresh.length } : x))
        const rec = { status: res.status, note: res.note, via: res.via, at: at.toISOString(), found: tagged.length, fresh: fresh.length, dropped, paid: paidInfo }
        summary.platforms[key] = { status: res.status, found: tagged.length, fresh: fresh.length, paid: paidInfo?.status ?? null }
        await stores.state.change(d => {
          const old = d.platforms[key] ?? {}
          d.platforms[key] = { ...old, ...rec, everLoggedIn: old.everLoggedIn || (res.via === 'browser' && res.status === 'ok') }
          d.spend = structuredClone(spend)
        })
      }
      progress.platform = null
      await browser?.closeIfIdle?.().catch(() => {})

      // 交给模型判断：这次新抓的，加上之前没判断成的（最近 3 天的）
      const since = now().getTime() - 3 * 864e5
      const todo = (await stores.items.read()).items
        .filter(x => (x.judge?.status === 'pending' || x.judge?.status === 'failed') && new Date(x.foundAt).getTime() >= since)
        .sort((a, b) => b.id - a.id).slice(0, JUDGE_LIMIT)
      progress.toJudge = todo.length
      if (todo.length) {
        say(`正在判断 ${todo.length} 条`)
        const { byId, failed, errors } = await judgeAll(ask, todo, targets, { model: modelName(), onProgress: done => { progress.judged = done; say(`正在判断：${done} / ${todo.length}`) } })
        await stores.items.change(d => { for (const x of d.items) if (byId.has(x.id)) x.judge = byId.get(x.id) })
        summary.judged = todo.length - failed
        summary.failed = failed
        if (errors.length) summary.judgeError = errors[0]
      }

      // 日报：按今天新发现的算
      say('正在写日报')
      const today = dateOf(now())
      const items = (await stores.items.read()).items
      const stats = dayStats(items, today)
      const worst = stats.worstIds.map(id => items.find(x => x.id === id)).filter(Boolean)
      const sum = await writeSummary(ask, targets.map(t => t.name).join('、'), stats, worst)
      summary.found = progress.found
      summary.fresh = progress.fresh
      summary.endedAt = now().toISOString()
      await stores.state.change(d => {
        d.reports[today] = { summary: sum.text, by: sum.by, at: summary.endedAt, neg: stats.neg, total: stats.total }
        d.runs = [summary, ...(d.runs ?? [])].slice(0, 30)
      })
      say('检查完了')
      return summary
    } catch (e) {
      progress.error = e?.message ?? String(e)
      throw e
    } finally {
      progress = { ...progress, running: false, endedAt: now().toISOString() }
    }
  }

  /**
   * 定时：每分钟看一眼，到了设置的时间、今天还没自动检查过，就检查一次。
   * DSH 晚于这个时间才打开，打开后马上补一次。
   */
  async function tick() {
    if (progress.running) return false
    const s = await stores.settings.read()
    if (!s.autoEnabled || !s.targets?.length) return false
    const [hh, mm] = String(s.autoTime ?? '09:00').split(':').map(Number)
    const t = now()
    if (t.getHours() * 60 + t.getMinutes() < hh * 60 + mm) return false
    const today = dateOf(t)
    if ((await stores.state.read()).lastAutoDate === today) return false
    await stores.state.change(d => { d.lastAutoDate = today })
    run({ reason: 'auto' }).catch(e => log(`自动检查没做成：${e?.message ?? e}`))
    return true
  }

  return { run, tick, progress: () => progress }
}
