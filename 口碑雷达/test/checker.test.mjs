// 检查一次的整个流程、定时、后台接口：全用假的（假平台、假浏览器、假模型、假 ctx），不联网。跑法：npm test
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeChecker } from '../host/checker.js'
import { makeStore } from '../host/store.js'
import { apply } from '../index.js'

const NOW = new Date(2026, 10, 20, 10, 0)
const iso = NOW.toISOString()

async function setup({ settings = {}, state = {}, secret = { tikhubKey: '' } } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'rr-test-'))
  const stores = {
    settings: makeStore(dir, 'settings.json', () => ({ targets: [{ id: 't1', name: '庞巴迪', keywords: ['Can-Am'] }], exclude: ['飞机'], platforms: { weibo: false, bilibili: true, zhihu: false, xhs: true, douyin: false, wechat: false, news: true }, autoEnabled: true, autoTime: '09:00', lookbackDays: 7, paid: { enabled: true, monthlyCap: 5, unitPrice: 0.01 }, ...settings })),
    items: makeStore(dir, 'items.json', () => ({ seq: 0, items: [] })),
    state: makeStore(dir, 'state.json', () => ({ platforms: {}, runs: [], reports: {}, spend: {}, lastAutoDate: '', ...state })),
    secret: makeStore(dir, 'secret.json', () => secret),
  }
  return { dir, stores, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

/** 假平台：B 站给两个帖子一条评论（其中一个帖子带排除词），新闻给一条。 */
const sources = {
  bilibili: async () => ({ status: 'ok', note: '假的', items: [
    { platform: 'bilibili', kind: 'post', pid: '1', title: '庞巴迪 Spyder 售后差', text: '', time: iso, stats: { likes: 9 }, keyword: '庞巴迪' },
    { platform: 'bilibili', kind: 'post', pid: '2', title: '庞巴迪飞机', text: '', time: iso, stats: {}, keyword: '庞巴迪' },
    { platform: 'bilibili', kind: 'comment', pid: 'c1', text: '同感，太贵了', time: iso, stats: {}, keyword: '庞巴迪', parentTitle: '庞巴迪 Spyder 售后差' },
  ] }),
  news: async () => ({ status: 'ok', note: '假的', items: [{ platform: 'news', kind: 'post', title: 'Can-Am 发布新车', text: '', url: 'https://a.com', time: iso, stats: {}, keyword: 'Can-Am' }] }),
}

/** 假浏览器：小红书没登录。 */
const browser = { available: () => true, loggedIn: async () => false, closeIfIdle: async () => {}, running: () => false }

/** 假模型：按题目里的编号回答；评论算骂、帖子第一条算骂、别的中性。日报总结回一句话。 */
function fakeModel({ failTimes = 0 } = {}) {
  let calls = 0
  const ask = async ({ prompt }) => {
    calls += 1
    if (prompt.includes('口碑小结')) return '今天有人骂售后。'
    if (calls <= failTimes) throw new Error('模型说请求太频繁')
    const n = (prompt.match(/^\[\d+\]/gm) ?? []).length
    const results = Array.from({ length: n }, (_, i) => ({ i, related: true, sentiment: /同感|售后差/.test(prompt.split('\n').find(l => l.startsWith(`[${i}]`))) ? 'neg' : 'neu', severity: 2, reason: '嫌贵', aspect: '价格' }))
    return JSON.stringify({ results })
  }
  return { ask, count: () => calls }
}

test('检查一次：搜 → 筛 → 去重存下 → 判断 → 日报；再查一次不重复存', async () => {
  const { stores, cleanup } = await setup()
  try {
    const m = fakeModel()
    const checker = makeChecker({ stores, browser, ask: m.ask, now: () => NOW, sleep: async () => {}, sources })
    const sum = await checker.run()
    assert.equal(sum.fresh, 3) // 带「飞机」的被排除
    const { items } = await stores.items.read()
    assert.equal(items.length, 3)
    assert.ok(items.every(x => x.judge.status === 'done'))
    assert.equal(items.filter(x => x.judge.sentiment === 'neg').length, 2)
    assert.equal(items.find(x => x.platform === 'news').target, '庞巴迪') // 别名 Can-Am 归到庞巴迪名下
    const state = await stores.state.read()
    assert.equal(state.reports['2026-11-20'].summary, '今天有人骂售后。')
    assert.equal(state.reports['2026-11-20'].neg, 2)
    assert.equal(state.platforms.xhs.status, 'login') // 小红书没登录：老实标「需要登录」
    assert.equal(state.platforms.bilibili.status, 'ok')
    // 再查一次：同样的内容不重复存、不重复判
    const before = m.count()
    const again = await checker.run()
    assert.equal(again.fresh, 0)
    assert.equal((await stores.items.read()).items.length, 3)
    assert.equal(m.count() - before, 1) // 只调了一次（写日报），没有再判断
  } finally { await cleanup() }
})

test('模型失败：重试一次能成就成', async () => {
  const { stores, cleanup } = await setup()
  try {
    const checker = makeChecker({ stores, browser, ask: fakeModel({ failTimes: 1 }).ask, now: () => NOW, sleep: async () => {}, sources })
    await checker.run()
    assert.ok((await stores.items.read()).items.every(x => x.judge.status === 'done'))
  } finally { await cleanup() }
})

test('模型一直失败：这批标「没判断」，抓到的照样存下，日报用保底的话；下次再判', async () => {
  const { stores, cleanup } = await setup()
  try {
    const broken = async () => { throw new Error('模型说请求太频繁') }
    const checker = makeChecker({ stores, browser, ask: broken, now: () => NOW, sleep: async () => {}, sources })
    const sum = await checker.run()
    assert.equal(sum.failed, 3)
    assert.equal(sum.judgeError, '模型说请求太频繁')
    const { items } = await stores.items.read()
    assert.equal(items.length, 3)
    assert.ok(items.every(x => x.judge.status === 'failed'))
    const state = await stores.state.read()
    assert.equal(state.reports['2026-11-20'].by, 'fallback')
    // 下次模型好了：之前没判断的补上
    const fixed = makeChecker({ stores, browser, ask: fakeModel().ask, now: () => NOW, sleep: async () => {}, sources })
    await fixed.run()
    assert.ok((await stores.items.read()).items.every(x => x.judge.status === 'done'))
  } finally { await cleanup() }
})

test('模型漏答其中一条：只有那一条算没判断', async () => {
  const { stores, cleanup } = await setup()
  try {
    const ask = async ({ prompt }) => (prompt.includes('口碑小结') ? '小结' : JSON.stringify({ results: [{ i: 0, sentiment: 'neg', severity: 1 }, { i: 1, sentiment: 'neu' }] }))
    const checker = makeChecker({ stores, browser, ask, now: () => NOW, sleep: async () => {}, sources })
    await checker.run()
    const { items } = await stores.items.read()
    assert.equal(items.filter(x => x.judge.status === 'failed').length, 1)
    assert.equal(items.find(x => x.judge.status === 'failed').judge.error, '模型漏答了这一条')
  } finally { await cleanup() }
})

test('免费拿不到的用付费补，按次记账；没填密钥就不跑', async () => {
  const { stores, cleanup } = await setup({ secret: { tikhubKey: 'KEY' } })
  try {
    let paidCalls = 0
    const paid = async (platform, terms, { budget, onSpend }) => {
      paidCalls += 1
      budget.record(1)
      await onSpend()
      return { status: 'paid', note: '付费接口补了 1 条', calls: 1, items: [{ platform, kind: 'post', pid: 'x1', title: '庞巴迪 太差了', text: '', time: iso, stats: {}, keyword: '庞巴迪' }] }
    }
    const checker = makeChecker({ stores, browser, ask: fakeModel().ask, now: () => NOW, sleep: async () => {}, sources, paid })
    await checker.run()
    assert.equal(paidCalls, 1) // 只有小红书（没登录）走付费，B 站和新闻免费能拿到就不花钱
    const { items } = await stores.items.read()
    assert.equal(items.find(x => x.platform === 'xhs').via, 'paid')
    const state = await stores.state.read()
    assert.equal(state.platforms.xhs.paid.status, 'paid')
    assert.equal(state.spend['2026-11'].calls, 1)
  } finally { await cleanup() }
  const noKey = await setup()
  try {
    let called = false
    const checker = makeChecker({ stores: noKey.stores, browser, ask: fakeModel().ask, now: () => NOW, sleep: async () => {}, sources, paid: async () => { called = true; return { items: [] } } })
    await checker.run()
    assert.equal(called, false)
  } finally { await noKey.cleanup() }
})

test('浏览器方式：登录过的平台在窗口里搜、看评论；碰到验证码就停', async () => {
  const { stores, cleanup } = await setup({ settings: { platforms: { weibo: false, bilibili: false, zhihu: false, xhs: false, douyin: true, wechat: false, news: false } }, state: { platforms: { douyin: { loginOpened: true } } } })
  try {
    let searches = 0
    const b = {
      available: () => true, running: () => true, closeIfIdle: async () => {},
      loggedIn: async () => true,
      search: async (key, term) => { searches += 1; return searches === 1 ? { status: 'ok', items: [{ platform: 'douyin', kind: 'post', pid: 'v1', text: `${term} 真难开`, time: iso, stats: { comments: 3 }, keyword: term }] } : { status: 'captcha', items: [] } },
      comments: async () => ({ items: [] }),
    }
    const checker = makeChecker({ stores, browser: b, ask: fakeModel().ask, now: () => NOW, sleep: async () => {}, sources })
    await checker.run()
    const st = (await stores.state.read()).platforms.douyin
    assert.equal(st.status, 'captcha')
    assert.match(st.note, /自己点一下/)
    assert.equal(searches, 2) // 第二个词碰到验证码就停，不再搜第三个
    assert.equal((await stores.items.read()).items.length, 1) // 第一个词抓到的照样存下
  } finally { await cleanup() }
})

test('定时：到点、今天没检查过才跑；跑过一次当天不再跑', async () => {
  const { stores, cleanup } = await setup()
  try {
    let now = new Date(2026, 10, 20, 8, 59)
    const checker = makeChecker({ stores, browser, ask: fakeModel().ask, now: () => now, sleep: async () => {}, sources })
    assert.equal(await checker.tick(), false) // 还没到 9 点
    now = new Date(2026, 10, 20, 9, 0)
    assert.equal(await checker.tick(), true)
    while (checker.progress().running) await new Promise(r => setTimeout(r, 10))
    assert.equal((await stores.state.read()).runs[0].reason, 'auto')
    now = new Date(2026, 10, 20, 15, 0)
    assert.equal(await checker.tick(), false) // 今天已经跑过
    now = new Date(2026, 10, 21, 9, 5)
    assert.equal(await checker.tick(), true) // 第二天又跑
    while (checker.progress().running) await new Promise(r => setTimeout(r, 10))
  } finally { await cleanup() }
})

test('没填监控对象不让检查；同时点两次只跑一次', async () => {
  const empty = await setup({ settings: { targets: [] } })
  try {
    const checker = makeChecker({ stores: empty.stores, browser, ask: fakeModel().ask, now: () => NOW, sleep: async () => {}, sources })
    await assert.rejects(checker.run(), /先去「设置」填要监控的对象/)
    assert.equal(checker.progress().running, false)
  } finally { await empty.cleanup() }
  const { stores, cleanup } = await setup()
  try {
    const checker = makeChecker({ stores, browser, ask: fakeModel().ask, now: () => NOW, sleep: async () => {}, sources })
    const first = checker.run()
    await assert.rejects(checker.run(), /正在检查/)
    await first
  } finally { await cleanup() }
})

// ------------------------------------------------------------------ 后台接口（index.js）：用假的 ctx 装上插件，直接调页面会调的那些操作

async function mountPlugin() {
  const dir = await mkdtemp(join(tmpdir(), 'rr-plugin-'))
  const effects = []
  let route = null
  const ctx = {
    logger: { warn: () => {} },
    get: () => undefined, // 假装 DSH 没有模型服务
    effect: (fn) => { const off = fn(); effects.push(off) },
    connection: { fetch: { register: (r) => { route = r; return () => {} } } },
  }
  apply(ctx, { dataDir: dir })
  let n = 0
  const call = async (action, args = {}) => {
    const res = await route.fetch(new Request('http://x/api/reputationRadar/call', { method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: String(++n), payload: { action, ...args } }) }))
    const body = await res.json()
    if (!body.result.ok) throw Object.assign(new Error(body.result.error.message), { code: body.result.error.code })
    return body.result.value
  }
  return { dir, route, call, stop: async () => { for (const off of effects) if (typeof off === 'function') off(); await rm(dir, { recursive: true, force: true }) } }
}

test('后台接口：第一次打开没有监控对象；设置能存能校验；密钥不回给页面', async () => {
  const p = await mountPlugin()
  try {
    assert.equal(p.route.path, '/api/reputationRadar/call')
    const ov = await p.call('overview')
    assert.equal(ov.hasTargets, false)
    assert.equal(ov.platforms.length, 7)
    assert.equal(ov.platforms.find(x => x.key === 'xhs').status, 'login')
    await assert.rejects(p.call('check'), /先去「设置」填要监控的对象/)
    await p.call('saveSettings', { targets: [{ name: ' 庞巴迪 ', keywords: 'Can-Am，Spyder' }], autoTime: '08:30' })
    await assert.rejects(p.call('saveSettings', { autoTime: '8点' }), /09:00/)
    await assert.rejects(p.call('saveSettings', { paid: { monthlyCap: -1 } }), /0 到 1000/)
    await p.call('saveKey', { key: 'abcdefghijklmnop1234' })
    const s = await p.call('settings')
    assert.deepEqual(s.targets.map(t => [t.name, t.keywords]), [['庞巴迪', ['Can-Am', 'Spyder']]])
    assert.equal(s.autoTime, '08:30')
    assert.deepEqual(s.key, { filled: true, tail: '1234' })
    assert.ok(!JSON.stringify(s).includes('abcdefghijklmnop'))
    assert.equal(s.paid.monthlyCap, 5) // 默认每月上限 5 元
    await assert.rejects(p.call('nope'), /没有「nope」/)
    await assert.rejects(p.call('openLogin', { platform: 'bilibili' }), /不用登录/)
  } finally { await p.stop() }
})

test('后台接口：列表筛选、手动改情绪、今天页的数字跟着变', async () => {
  const p = await mountPlugin()
  try {
    // 插件还没读过 items.json（它有内存缓存），先直接往文件里放几条，模拟检查过
    const t = new Date()
    const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    const at = t.toISOString()
    const judged = (sentiment, related = true) => ({ status: 'done', related, sentiment, severity: sentiment === 'neg' ? 2 : 0, reason: sentiment === 'neg' ? '骂售后' : '', aspect: sentiment === 'neg' ? '售后' : '' })
    await makeStore(p.dir, 'items.json', () => ({ seq: 0, items: [] })).change(x => {
      x.seq = 3
      x.items.push(
        { id: 1, key: 'a', platform: 'weibo', kind: 'post', text: '售后太差', foundDate: d, foundAt: at, stats: {}, judge: judged('neg'), manual: null },
        { id: 2, key: 'b', platform: 'bilibili', kind: 'post', text: '挺好', author: '小王', foundDate: d, foundAt: at, stats: {}, judge: judged('pos'), manual: null },
        { id: 3, key: 'c', platform: 'bilibili', kind: 'post', text: '同名的别的东西', foundDate: d, foundAt: at, stats: {}, judge: judged('neu', false), manual: null },
      )
    })
    const all = await p.call('list', {})
    assert.equal(all.total, 2) // 默认不显示无关的
    assert.equal((await p.call('list', { sentiment: 'neg' })).rows[0].reason, '骂售后')
    assert.equal((await p.call('list', { platform: 'bilibili', sentiment: 'all' })).total, 2)
    assert.equal((await p.call('list', { q: '小王' })).total, 1)
    assert.equal((await p.call('overview')).stats.neg, 1)
    // 判错了：把「挺好」改成在骂
    const row = await p.call('setSentiment', { id: 2, sentiment: 'neg' })
    assert.equal(row.sentiment, 'neg')
    assert.equal(row.manual, true)
    assert.equal((await p.call('overview')).stats.neg, 2)
    await assert.rejects(p.call('setSentiment', { id: 2, sentiment: '生气' }), /情绪只能是/)
    // 改回模型的判断
    assert.equal((await p.call('setSentiment', { id: 2, sentiment: null })).sentiment, 'pos')
    const one = await p.call('item', { id: 1 })
    assert.equal(one.text, '售后太差')
    // 存进文件的是改过的
    const saved = JSON.parse(await readFile(join(p.dir, 'items.json'), 'utf8'))
    assert.equal(saved.items.find(x => x.id === 2).manual, null)
  } finally { await p.stop() }
})
