/**
 * 口碑雷达 · 免费方式 B：要登录的平台（微博、知乎、小红书、抖音），在一个看得见的普通 Chrome 窗口里看。
 *
 * 怎么做的：
 *   插件自己开一个 Chrome 窗口，用的是插件自己的一份资料目录（dataDir/chrome，和你平时用的 Chrome 分开）。
 *   你在这个窗口里自己扫码登录一次，之后它会记住。检查时插件在这个窗口里打开站内搜索页、帖子页，
 *   页面像平时一样自己加载，插件只做两件事：读页面上显示出来的内容；旁听页面自己收到的数据。
 *
 * 硬底线（别改）：
 *   - 不伪装浏览器：不改浏览器标识（UA），不隐藏自动化痕迹（webdriver），不往页面里注入任何反检测脚本。
 *     只多开了一个调试接口（--remote-debugging-port），好读页面内容。
 *   - 不绕过验证码或登录：碰到验证码、登录过期就停下来，那个标签页留着，页面上提示你去窗口里自己处理。
 *   - 不在浏览器里重放平台的内部接口：插件不替页面发任何请求，只读页面自己加载出来的东西。
 *   - 放慢：每个平台一次检查最多搜 3 个词、看 3 个帖子的评论，两次打开页面之间隔 6 秒以上。
 *   - 只读你自己账号能看到的内容。不用 MediaCrawler 这类靠反检测的爬虫。
 */
import { spawn } from 'node:child_process'
import { accessSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseTime, plain } from './core.js'
import { pick } from './normalize.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function findChrome() {
  const list = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
    : process.platform === 'win32'
      ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean).map(d => join(d, 'Google/Chrome/Application/chrome.exe'))
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  for (const p of list) { try { accessSync(p); return p } catch { /* 下一个 */ } }
  return ''
}

/** 每个平台：登录页、搜索页、要旁听的数据地址、判断「登录了没有」的 cookie。 */
export const SITES = {
  douyin: {
    login: 'https://www.douyin.com/',
    search: t => `https://www.douyin.com/search/${encodeURIComponent(t)}?type=video`,
    listen: /\/aweme\/v1\/web\/(search\/item|general\/search\/single)\//,
    comments: { url: p => p.url, listen: /\/aweme\/v1\/web\/comment\/list\// },
    loggedIn: cs => cs.some(c => /douyin\.com$/.test(c.domain) && /^sessionid(_ss)?$/.test(c.name) && c.value),
  },
  xhs: {
    login: 'https://www.xiaohongshu.com/explore',
    search: t => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(t)}&source=web_search_result_notes`,
    listen: /\/api\/sns\/web\/v1\/search\/notes/,
    comments: { url: p => p.url, listen: /\/api\/sns\/web\/v2\/comment\/page/ },
    loggedIn: cs => cs.some(c => /xiaohongshu\.com$/.test(c.domain) && c.name === 'web_session' && c.value),
  },
  weibo: {
    login: 'https://passport.weibo.com/sso/signin?entry=miniblog&source=miniblog&url=https%3A%2F%2Fweibo.com%2F',
    search: t => `https://s.weibo.com/realtime?q=${encodeURIComponent(t)}&rd=realtime&tw=realtime`,
    dom: true, // 微博搜索结果是直接画在页面上的，读页面上显示的字
    comments: { url: p => `https://weibo.com/detail/${p.pid}`, listen: /\/ajax\/statuses\/buildComments/ },
    loggedIn: cs => cs.some(c => /weibo\.com$/.test(c.domain) && c.name === 'SUB' && c.value) && cs.some(c => /weibo\.com$/.test(c.domain) && /^(ALF|SSOLoginState)$/.test(c.name)),
  },
  zhihu: {
    login: 'https://www.zhihu.com/signin',
    search: t => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(t)}`,
    listen: /\/api\/v4\/search_v3/,
    comments: null, // 知乎的评论要点开才加载，插件不替你点，所以浏览器方式只看搜索结果
    loggedIn: cs => cs.some(c => /zhihu\.com$/.test(c.domain) && c.name === 'z_c0' && c.value),
  },
}
export const BROWSER_PLATFORMS = Object.keys(SITES)

/** 看页面是不是被验证码或登录挡住了。 */
export function blockedBy(page) {
  const all = `${page?.href ?? ''} ${page?.title ?? ''} ${page?.body ?? ''}`
  if (/验证码|captcha|安全验证|unhuman|人机验证|滑块|拖动下方|verify_page|verifycenter/i.test(all)) return 'captcha'
  if (/passport\.|\/signin|\/login|登录后查看|扫码登录|请先登录|登录后即可|登录查看更多|马上登录/i.test(all)) return 'login'
  return ''
}

/** 微博搜索页上读出来的每条（在页面里跑的，只读显示出来的字）。 */
const WEIBO_DOM = `(() => [...document.querySelectorAll('div.card-wrap[mid]')].slice(0, 20).map(c => {
  const full = c.querySelector('p[node-type=feed_list_content_full]') || c.querySelector('p[node-type=feed_list_content]');
  const from = c.querySelector('.from a');
  const name = c.querySelector('.name');
  return { mid: c.getAttribute('mid'), text: full ? full.innerText : '', author: name ? (name.getAttribute('nick-name') || name.innerText) : '',
    timeText: from ? from.innerText : '', href: from ? from.href : '', acts: [...c.querySelectorAll('.card-act li')].map(li => li.innerText.trim()) };
}))()`

export function weiboFromDom(rows, term) {
  return (rows ?? []).filter(r => r?.mid && r.text).map(r => {
    const n = s => { const m = /(\d[\d.]*)(万)?/.exec(s ?? ''); return m ? Math.round(Number(m[1]) * (m[2] ? 1e4 : 1)) : null }
    const [shares, comments, likes] = (r.acts ?? []).slice(-3).map(n)
    return {
      platform: 'weibo', kind: 'post', pid: String(r.mid), url: r.href?.startsWith('http') ? r.href.split('?')[0] : `https://weibo.com/detail/${r.mid}`,
      author: plain(r.author), time: parseTime(String(r.timeText ?? '').trim().split(/\s+来自|\s{2,}/)[0]), title: '', text: plain(r.text).replace(/\s*收起d?$/, ''),
      stats: { likes, comments, shares }, keyword: term,
    }
  })
}

/** 小红书帖子页：页面自己带着的帖子正文和时间（读出来补全搜索结果里没有的正文）。 */
const XHS_NOTE = id => `(() => { try {
  const s = window.__INITIAL_STATE__; const m = s && s.note && (s.note.noteDetailMap && (s.note.noteDetailMap._rawValue || s.note.noteDetailMap._value || s.note.noteDetailMap));
  const n = m && m[${JSON.stringify(id)}] && m[${JSON.stringify(id)}].note; if (!n) return null;
  return { title: n.title || '', desc: n.desc || '', time: n.time || null, liked: n.interactInfo && n.interactInfo.likedCount, comments: n.interactInfo && n.interactInfo.commentCount };
} catch (e) { return null } })()`

/**
 * 插件自己的那个 Chrome 窗口。整个插件只开一个。
 * @param {{ profileDir: string, chromePath?: string, log?: (s: string) => void }} opts
 */
export function makeBrowser({ profileDir, chromePath = findChrome(), log = () => {} }) {
  let proc = null
  let cdp = null
  let starting = null
  let keepOpen = false // 有标签页留给你处理（验证码、登录）时，检查完不关窗口

  async function start() {
    if (!chromePath) throw new Error('没找到 Google Chrome。小红书、抖音、微博、知乎要靠它打开，先装一个 Chrome')
    mkdirSync(profileDir, { recursive: true })
    // 就是一个普通的 Chrome 窗口，只多开了调试接口好读页面。不改浏览器标识，不做任何伪装。
    const args = [`--user-data-dir=${profileDir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--window-size=1200,860', 'about:blank']
    const ch = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    const wsUrl = await new Promise((ok, no) => {
      let buf = ''
      const t = setTimeout(() => no(new Error('Chrome 没启动起来')), 25000)
      ch.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok(m[1]) } })
      ch.on('exit', () => { clearTimeout(t); no(new Error('Chrome 一启动就退出了：可能插件的 Chrome 窗口已经开着但没连上，把它关掉再试')) })
      ch.on('error', e => { clearTimeout(t); no(new Error(`Chrome 没能启动：${e.message}`)) })
    })
    const ws = new WebSocket(wsUrl)
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('连不上 Chrome')) })
    let seq = 0
    const waiters = new Map()
    const listeners = new Set()
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); if (m.error) w.no(new Error(m.error.message)); else w.ok(m.result) } else if (m.method) for (const l of listeners) l(m)
    }
    const send = (method, params = {}, sessionId) => new Promise((ok, no) => {
      if (ws.readyState !== 1) { no(new Error('Chrome 窗口已经关了')); return }
      const id = ++seq
      waiters.set(id, { ok, no })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      setTimeout(() => { if (waiters.delete(id)) no(new Error(`${method} 超时`)) }, 40000)
    })
    ch.on('exit', () => { if (proc === ch) { proc = null; cdp = null; keepOpen = false } try { ws.close() } catch { /* 已经关了 */ } })
    proc = ch
    cdp = { send, on: l => { listeners.add(l); return () => listeners.delete(l) }, ws }
    return cdp
  }

  async function ensure() {
    if (cdp && proc && proc.exitCode === null) return cdp
    starting ??= start().finally(() => { starting = null })
    return starting
  }

  const running = () => Boolean(cdp && proc && proc.exitCode === null)

  async function cookies() {
    const c = await ensure()
    const r = await c.send('Storage.getCookies')
    return r.cookies ?? []
  }

  /**
   * 这个平台在插件的窗口里登录了没有（看这个窗口里的登录 cookie）。
   * 窗口没开时：start 为 true 就先把窗口开起来再看；否则返回 null（不知道）。
   */
  async function loggedIn(platform, { start = false } = {}) {
    if (!running() && !start) return null
    return SITES[platform].loggedIn(await cookies())
  }

  /** 打开一个标签页，开始旁听它收到的数据。 */
  async function openTab(url, listen) {
    const c = await ensure()
    const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true })
    const bodies = []
    const pending = new Set()
    const off = c.on(async m => {
      if (m.sessionId !== sessionId || !listen) return
      if (m.method === 'Network.responseReceived' && listen.test(m.params.response.url)) pending.add(m.params.requestId)
      if (m.method === 'Network.loadingFinished' && pending.has(m.params.requestId)) {
        pending.delete(m.params.requestId)
        try {
          const r = await c.send('Network.getResponseBody', { requestId: m.params.requestId }, sessionId)
          bodies.push(JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body))
        } catch { /* 读不到这一份就算了 */ }
      }
    })
    await c.send('Network.enable', {}, sessionId)
    await c.send('Page.enable', {}, sessionId)
    await c.send('Page.navigate', { url }, sessionId)
    const evaluate = async expr => { try { return (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value } catch { return null } }
    const page = () => evaluate('({ href: location.href, title: document.title, body: document.body ? document.body.innerText.slice(0, 600) : "" })')
    const close = async () => { off(); try { await c.send('Target.closeTarget', { targetId }) } catch { /* 已经关了 */ } }
    const front = async () => { try { await c.send('Target.activateTarget', { targetId }) } catch { /* 无所谓 */ } }
    return { bodies, evaluate, page, close, front }
  }

  /** 等数据来：拿到第一份后再多等一会儿（页面可能分几次加载）；最多等 ms。 */
  async function waitFor(tab, ms, ready) {
    const t0 = Date.now()
    let firstAt = 0
    while (Date.now() - t0 < ms) {
      await sleep(800)
      if (await ready()) { firstAt ||= Date.now(); if (Date.now() - firstAt > 1500) return true }
      // 前几秒页面还在跳转，先不下结论；之后看到验证码或登录页就不等了
      if (Date.now() - t0 > 5000 && blockedBy(await tab.page())) return false
    }
    return false
  }

  /**
   * 在窗口里搜一个词。
   * @returns {{ status: 'ok'|'captcha'|'expired'|'error', note?: string, items: object[] }}
   */
  async function search(platform, term) {
    const site = SITES[platform]
    const tab = await openTab(site.search(term), site.listen)
    try {
      const got = await waitFor(tab, 15000, async () => (site.dom ? Boolean(await tab.evaluate("document.querySelector('div.card-wrap[mid]') ? 1 : 0")) : tab.bodies.length > 0))
      const p = await tab.page()
      const block = blockedBy(p)
      if (!got && block) {
        // 挡住了：标签页留着，你去窗口里自己处理（插件不碰验证码，不替你登录）
        keepOpen = true
        await tab.front()
        return { status: block === 'captcha' ? 'captcha' : 'expired', items: [] }
      }
      let items = []
      if (site.dom) items = weiboFromDom(await tab.evaluate(WEIBO_DOM), term)
      else for (const b of tab.bodies) items.push(...pick(platform, 'post', b))
      // 小红书没登录时搜索接口会回一个「要登录」的错误
      const err = tab.bodies.find(b => b && typeof b === 'object' && b.success === false)
      if (!items.length && err && /登录|login/i.test(`${err.msg ?? ''}`)) { keepOpen = true; await tab.front(); return { status: 'expired', items: [] } }
      await tab.close()
      return { status: 'ok', items: items.map(x => ({ ...x, keyword: term })) }
    } catch (e) {
      await tab.close()
      return { status: 'error', note: e.message, items: [] }
    }
  }

  /** 打开一个帖子，读它的评论（页面自己加载的那一页）。小红书顺便补上正文和时间。 */
  async function comments(platform, post) {
    const site = SITES[platform]
    if (!site.comments) return { post, items: [] }
    const tab = await openTab(site.comments.url(post), site.comments.listen)
    try {
      await waitFor(tab, 12000, async () => tab.bodies.length > 0)
      const p = await tab.page()
      const block = blockedBy(p)
      if (!tab.bodies.length && block) { keepOpen = true; await tab.front(); return { post, items: [], status: block === 'captcha' ? 'captcha' : 'expired' } }
      let full = post
      if (platform === 'xhs') {
        const n = await tab.evaluate(XHS_NOTE(post.pid))
        if (n) full = { ...post, title: n.title || post.title, text: plain(n.desc) || post.text, time: parseTime(n.time) ?? post.time }
      }
      const items = []
      for (const b of tab.bodies) items.push(...pick(platform, 'comment', b, full))
      await tab.close()
      return { post: full, items: items.map(x => ({ ...x, keyword: post.keyword })) }
    } catch (e) {
      await tab.close()
      return { post, items: [], note: e.message }
    }
  }

  /** 「打开登录窗口」：在插件的窗口里打开这个平台的登录页，放到最前面。你扫码登录完，直接关窗口就行。 */
  async function openLogin(platform) {
    const c = await ensure()
    const { targetId } = await c.send('Target.createTarget', { url: SITES[platform].login })
    try { await c.send('Target.activateTarget', { targetId }) } catch { /* 无所谓 */ }
    keepOpen = true
    return { ok: true }
  }

  /** 检查完：没有留给你处理的标签页，就把窗口关掉。 */
  async function closeIfIdle() {
    if (!running()) return
    if (keepOpen) {
      // 留了标签页给你处理；但你已经把它们都关了（Mac 上关掉窗口 Chrome 不会自己退出），那就收掉
      let pages = []
      try { pages = ((await cdp.send('Target.getTargets')).targetInfos ?? []).filter(x => x.type === 'page' && x.url !== 'about:blank') } catch { /* 读不到就当还有 */ return }
      if (pages.length) return
    }
    await close()
  }

  async function close() {
    const ch = proc
    if (!ch) return
    try { await Promise.race([cdp?.send('Browser.close'), sleep(2000)]) } catch { /* 直接结束 */ }
    await Promise.race([new Promise(r => ch.once('exit', r)), sleep(3000)])
    if (ch.exitCode === null) { try { ch.kill('SIGKILL') } catch { /* 已经退了 */ } }
  }

  return { available: () => Boolean(chromePath), running, loggedIn, search, comments, openLogin, closeIfIdle, close, cookies }
}
