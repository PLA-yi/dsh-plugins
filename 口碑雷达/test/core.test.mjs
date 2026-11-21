// 不碰网络的部分：去重、筛子、判断结果解析、日报统计、花钱上限、时间换算。跑法：npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dateOf, dayStats, daysBefore, dedupe, extractJson, fallbackSummary, itemKey, judgePrompt, makeBudget, parseJudgement, parseTime, screen, sentimentOf, termsOf } from '../host/core.js'

test('去重：同一条从不同方式抓来只算一条', () => {
  const free = { platform: 'bilibili', kind: 'post', pid: '123', url: 'https://www.bilibili.com/video/BV1?vd_source=a', text: '甲' }
  const paid = { platform: 'bilibili', kind: 'post', pid: '123', url: 'https://www.bilibili.com/video/BV1', text: '甲（付费接口来的）' }
  const other = { platform: 'bilibili', kind: 'post', pid: '456', text: '乙' }
  const out = dedupe([free, paid, other], new Set())
  assert.equal(out.length, 2)
  assert.equal(out[0].key, 'bilibili:p:123')
})

test('去重：已经存过的不再要；评论和帖子编号一样也不混', () => {
  const known = new Set(['weibo:p:9'])
  const out = dedupe([{ platform: 'weibo', kind: 'post', pid: '9' }, { platform: 'weibo', kind: 'comment', pid: '9' }], known)
  assert.deepEqual(out.map(x => x.key), ['weibo:c:9'])
})

test('去重：没有编号时用链接，跟踪参数不影响', () => {
  const a = itemKey({ platform: 'wechat', kind: 'post', url: 'https://mp.weixin.qq.com/s/abc?utm_source=x' })
  const b = itemKey({ platform: 'wechat', kind: 'post', url: 'https://mp.weixin.qq.com/s/abc' })
  assert.equal(a, b)
})

test('去重：新闻按标题，必应和 Google 同一篇算一条', () => {
  const out = dedupe([
    { platform: 'news', kind: 'post', title: '庞巴迪发布新车型', url: 'https://a.com/1' },
    { platform: 'news', kind: 'post', title: '庞巴迪发布新车型 ', url: 'https://b.com/2' },
  ], new Set())
  assert.equal(out.length, 1)
})

test('筛子：排除词、太旧的、帖子没提到的都不要，评论不要求带关键词', () => {
  const now = new Date('2026-11-20T10:00:00+08:00')
  const items = [
    { platform: 'weibo', kind: 'post', text: '小米粥真好喝', time: now.toISOString() },
    { platform: 'weibo', kind: 'post', text: '小米手机又卡了', time: new Date('2026-10-01').toISOString() },
    { platform: 'weibo', kind: 'post', text: '今天天气好', time: now.toISOString() },
    { platform: 'weibo', kind: 'post', text: '小米售后太差', time: now.toISOString() },
    { platform: 'weibo', kind: 'comment', text: '同感，客服根本不理人', time: now.toISOString() },
    { platform: 'weibo', kind: 'post', text: 'XIAOMI 也太贵了', time: null },
  ]
  const { keep, dropped } = screen(items, { terms: ['小米', 'Xiaomi'], exclude: ['小米粥'], lookbackDays: 7, now })
  assert.deepEqual(keep.map(x => x.text), ['小米售后太差', '同感，客服根本不理人', 'XIAOMI 也太贵了'])
  assert.deepEqual(dropped, { excluded: 1, old: 1, offTopic: 1 })
})

test('搜索词：名称加别名，去空去重', () => {
  assert.deepEqual(termsOf({ name: '庞巴迪', keywords: ['Can-Am', ' ', '庞巴迪', 'Spyder'] }), ['庞巴迪', 'Can-Am', 'Spyder'])
})

test('判断结果解析：标准格式', () => {
  const text = '好的\n```json\n{"results":[{"i":0,"related":true,"sentiment":"neg","severity":3,"reason":"投诉售后不处理","aspect":"售后"},{"i":1,"related":false,"sentiment":"neu","severity":0,"reason":"同名","aspect":""}]}\n```'
  const r = parseJudgement(text, 2)
  assert.deepEqual(r[0], { related: true, sentiment: 'neg', severity: 3, reason: '投诉售后不处理', aspect: '售后' })
  assert.equal(r[1].related, false)
  assert.equal(r[1].severity, 0)
})

test('判断结果解析：模型漏答、乱写的那几条算没判断，整体不报废', () => {
  const r = parseJudgement('{"results":[{"i":0,"sentiment":"负面","severity":"5"},{"i":2,"sentiment":"不知道"},{"i":9,"sentiment":"pos"}]}', 3)
  assert.equal(r[0].sentiment, 'neg')
  assert.equal(r[0].severity, 3) // 超过 3 按 3 算
  assert.equal(r[0].related, true) // 没写 related 当相关
  assert.equal(r[1], null) // 漏答
  assert.equal(r[2], null) // 情绪认不出
})

test('判断结果解析：直接给数组也行；读不出 JSON 返回 null（要重试）', () => {
  const r = parseJudgement('[{"sentiment":"pos"},{"sentiment":"neg","severity":0}]', 2)
  assert.equal(r[0].sentiment, 'pos')
  assert.equal(r[1].severity, 1) // 骂但没给严重程度，至少 1
  assert.equal(parseJudgement('抱歉我不能回答', 2), null)
  assert.equal(extractJson('前面 {"a":1} 后面').a, 1)
})

test('题目里带上监控对象和评论所在的帖子', () => {
  const p = judgePrompt({ name: '庞巴迪', keywords: ['Can-Am'] }, [{ platform: 'douyin', kind: 'comment', text: '太贵了', parentTitle: 'Spyder 试驾' }])
  assert.match(p, /监控对象：庞巴迪（也叫：Can-Am）/)
  assert.match(p, /\[0\] 抖音评论（这是「Spyder 试驾」下面的评论） 太贵了/)
})

test('情绪：用户改过就听用户的', () => {
  assert.equal(sentimentOf({ judge: { status: 'done', related: true, sentiment: 'neu' }, manual: { sentiment: 'neg' } }), 'neg')
  assert.equal(sentimentOf({ judge: { status: 'done', related: false, sentiment: 'neg' } }), 'unrelated')
  assert.equal(sentimentOf({ judge: { status: 'failed' } }), 'unknown')
})

const it = (id, foundDate, sentiment, extra = {}) => ({ id, foundDate, platform: extra.platform ?? 'weibo', text: `第${id}条`, stats: { likes: extra.likes ?? 0 }, judge: sentiment === 'unknown' ? { status: 'failed' } : { status: 'done', related: sentiment !== 'unrelated', sentiment: sentiment === 'unrelated' ? 'neu' : sentiment, severity: extra.severity ?? (sentiment === 'neg' ? 1 : 0), aspect: extra.aspect ?? '' }, manual: extra.manual ? { sentiment: extra.manual } : null })

test('日报统计：今天多少条、多少在骂、最严重的排前面、骂什么、和前几天比', () => {
  const today = '2026-11-20'
  const items = [
    it(1, today, 'neg', { severity: 1, aspect: '价格', likes: 100 }),
    it(2, today, 'neg', { severity: 3, aspect: '售后', platform: 'douyin' }),
    it(3, today, 'neg', { severity: 1, aspect: '价格', likes: 5 }),
    it(4, today, 'pos'),
    it(5, today, 'unrelated'),
    it(6, today, 'unknown'),
    it(7, today, 'neu', { manual: 'neg' }), // 用户改成了骂
    it(8, daysBefore(today, 1), 'neg'),
    it(9, daysBefore(today, 2), 'neu'),
  ]
  const s = dayStats(items, today)
  assert.equal(s.total, 7)
  assert.equal(s.neg, 4)
  assert.equal(s.pos, 1)
  assert.equal(s.related, 5) // 不算无关、没判断
  assert.equal(s.unjudged, 1)
  assert.equal(s.severe, 1)
  assert.deepEqual(s.worstIds.slice(0, 2), [2, 7]) // 严重 3 的排第一，用户改成骂的算 2 级
  assert.deepEqual(s.aspects[0], { label: '价格', value: 2 })
  assert.equal(s.series.length, 14)
  assert.equal(s.series.at(-1).neg, 4)
  assert.equal(s.series.at(-2).neg, 1)
  assert.equal(s.prevAvg, 0.5) // 前几天只有两天有数据：1 和 0
  assert.equal(s.trend, 'more')
})

test('日报统计：之前没数据就不比；没提及时保底总结说没有', () => {
  const s = dayStats([], '2026-11-20')
  assert.equal(s.trend, 'none')
  assert.equal(s.prevAvg, null)
  assert.match(fallbackSummary(s), /还没有发现/)
  assert.match(fallbackSummary({ ...s, total: 3, neg: 2, aspects: [{ label: '价格', value: 2 }], trend: 'more', severe: 0, unjudged: 0 }), /今天有 2 条在骂你，主要说价格，比前几天多了/)
})

test('花钱上限：到了就不让花，换月自动恢复', () => {
  const spend = {}
  let now = new Date(2026, 10, 20)
  const b = makeBudget(spend, { monthlyCap: 0.03, unitPrice: 0.01 }, () => now)
  assert.equal(b.canSpend(), true)
  b.record(); b.record(); b.record()
  assert.equal(b.canSpend(), false)
  assert.deepEqual(b.used(), { month: '2026-11', calls: 3, yuan: 0.03, cap: 0.03 })
  now = new Date(2026, 11, 1)
  assert.equal(b.canSpend(), true)
  assert.equal(spend['2026-11'].calls, 3)
})

test('花钱上限：上限填 0 就一次都不花', () => {
  assert.equal(makeBudget({}, { monthlyCap: 0, unitPrice: 0.01 }).canSpend(), false)
})

test('时间换算：各种写法', () => {
  const now = new Date(2026, 10, 20, 12, 0)
  assert.equal(parseTime(1795160974), new Date(1795160974000).toISOString())
  assert.equal(parseTime('1795160974000'), new Date(1795160974000).toISOString())
  assert.equal(parseTime('5分钟前', now), new Date(2026, 10, 20, 11, 55).toISOString())
  assert.equal(parseTime('今天 08:30', now), new Date(2026, 10, 20, 8, 30).toISOString())
  assert.equal(parseTime('昨天 23:10', now), new Date(2026, 10, 19, 23, 10).toISOString())
  assert.equal(parseTime('11月19日 10:23', now), new Date(2026, 10, 19, 10, 23).toISOString())
  assert.equal(parseTime('12月30日 10:23', now), new Date(2025, 11, 30, 10, 23).toISOString()) // 没写年、在未来的算去年
  assert.equal(parseTime('Mon, 16 Nov 2026 01:44:00 GMT'), '2026-11-16T01:44:00.000Z')
  assert.equal(parseTime('不知道'), null)
  assert.equal(dateOf(new Date(2026, 0, 5)), '2026-01-05')
})
