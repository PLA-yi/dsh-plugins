// 各平台返回的数据怎么翻成统一格式：用假的返回内容测（不联网）。跑法：npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockedBy, weiboFromDom } from '../host/browser.js'
import { bilibili, news, parseRss, parseSogou, politeFetcher, UA, wechat } from '../host/free.js'
import { pick } from '../host/normalize.js'
import { paidSearch } from '../host/paid.js'
import { makeBudget } from '../host/core.js'

const json = (body, status = 200) => ({ status, ok: status < 400, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) })
const html = (body, status = 200, headers = {}) => ({ status, ok: status < 400, headers: new Headers(headers), text: async () => body, json: async () => JSON.parse(body) })
const noSleep = async () => {}

test('免费请求：老实写自己的 UA，有间隔、有上限', async () => {
  const seen = []
  const waits = []
  const f = politeFetcher({ fetchImpl: async (url, opt) => { seen.push(opt.headers['User-Agent']); return json({}) }, gapMs: 5000, max: 2, sleep: async ms => { waits.push(ms) } })
  await f.get('a'); await f.get('b')
  assert.equal(await f.get('c'), null) // 到上限不再发
  assert.deepEqual(seen, [UA, UA])
  assert.ok(!/Mozilla|Chrome|Safari/.test(UA), '不能冒充浏览器')
  assert.equal(waits.length, 1)
})

test('B 站：搜索 + 评论，412 时停下不硬来', async () => {
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    if (url.includes('finger/spi')) return json({ code: 0, data: { b_3: 'X' } })
    if (url.includes('search/type')) return json({ code: 0, data: { result: [{ aid: 1, bvid: 'BV1', title: '<em class="keyword">庞巴迪</em> 试驾', author: 'up', pubdate: 1795100000, review: 9, like: 3, play: 100 }] } })
    if (url.includes('reply/main')) return json({ code: 0, data: { replies: [{ rpid: 77, oid: 1, member: { uname: '路人' }, content: { message: '太贵了' }, like: 2, ctime: 1795100100 }] } })
    return json({}, 404)
  }
  const r = await bilibili(['庞巴迪'], { fetchImpl, sleep: noSleep })
  assert.equal(r.status, 'ok')
  const [post, comment] = r.items
  assert.equal(post.title, '庞巴迪 试驾')
  assert.equal(post.url, 'https://www.bilibili.com/video/BV1')
  assert.equal(comment.text, '太贵了')
  assert.equal(comment.parentTitle, '庞巴迪 试驾')
  const blocked = await bilibili(['庞巴迪'], { fetchImpl: async url => (url.includes('spi') ? json({}) : html('<html>', 412)), sleep: noSleep })
  assert.equal(blocked.status, 'blocked')
})

const SOGOU = `<li id="sogou_vr_11002601_box_0" d="ab-cd">
<div class="txt-box"><h3>
<a target="_blank" href="/link?url=abc&amp;type=2&amp;query=x" id="sogou_vr_11002601_title_0"><em><!--red_beg-->庞巴迪<!--red_end--></em>股价暴跌</a>
</h3>
<p class="txt-info" id="sogou_vr_11002601_summary_0"><em>庞巴迪</em>公司宣布...</p>
<div class="s-p"><span class="all-time-y2">航空微读</span><span class="s2"><script>document.write(timeConvert('1579390243'))</script></span></div>
</div></li>`

test('公众号：读搜狗结果页；被要求验证就停', async () => {
  const items = parseSogou(SOGOU, '庞巴迪')
  assert.equal(items.length, 1)
  assert.equal(items[0].title, '庞巴迪股价暴跌')
  assert.equal(items[0].author, '航空微读')
  assert.equal(items[0].url, 'https://weixin.sogou.com/link?url=abc&type=2&query=x')
  assert.equal(items[0].pid, 'ab-cd')
  const r = await wechat(['庞巴迪'], { fetchImpl: async () => html('', 302, { location: 'https://weixin.sogou.com/antispider/?from=x' }), sleep: noSleep })
  assert.equal(r.status, 'captcha')
})

const RSS = `<rss><channel><item><title>庞巴迪发布新车 - 新浪</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3a%2f%2fnews.sina.com%2fa.html</link><description>&lt;b&gt;庞巴迪&lt;/b&gt;今天</description><pubDate>Mon, 16 Nov 2026 01:44:00 GMT</pubDate><source url="x">新浪</source></item></channel></rss>`

test('新闻：读 RSS，必应的跳转链接还原；Google 连不上不影响必应', async () => {
  const [n] = parseRss(RSS, '庞巴迪', '必应新闻')
  assert.equal(n.title, '庞巴迪发布新车')
  assert.equal(n.url, 'https://news.sina.com/a.html')
  assert.equal(n.text, '庞巴迪今天')
  assert.equal(n.author, '新浪')
  const r = await news(['庞巴迪'], { fetchImpl: async url => { if (url.includes('google')) throw new TypeError('fetch failed'); return html(RSS) }, sleep: noSleep })
  assert.equal(r.status, 'ok')
  assert.equal(r.items.length, 1)
  assert.match(r.note, /Google 新闻连不上/)
})

test('抖音、小红书、知乎、微博：从平台数据里找出帖子和评论', () => {
  const dy = pick('douyin', 'post', { data: [{ type: 1, aweme_info: { aweme_id: '7', desc: '庞巴迪 好看', create_time: 1795100000, author: { nickname: 'A' }, statistics: { digg_count: 5, comment_count: 2 } } }] })
  assert.equal(dy[0].url, 'https://www.douyin.com/video/7')
  const dyc = pick('douyin', 'comment', { comments: [{ cid: '9', aweme_id: '7', text: '质量差', create_time: 1795100100, digg_count: 1, user: { nickname: 'B' } }] }, dy[0])
  assert.equal(dyc[0].parentTitle, '庞巴迪 好看')
  const xhs = pick('xhs', 'post', { data: { items: [{ id: 'n1', xsec_token: 'tk', model_type: 'note', note_card: { display_title: '庞巴迪踩坑', user: { nickname: 'C' }, interact_info: { liked_count: '1.2万' } } }] } })
  assert.equal(xhs[0].stats.likes, 12000)
  assert.match(xhs[0].url, /explore\/n1\?xsec_token=tk/)
  const xc = pick('xhs', 'comment', { data: { comments: [{ id: 'c1', note_id: 'n1', content: '别买', create_time: 1795100000000, like_count: '3', user_info: { nickname: 'D' } }] } })
  assert.equal(xc[0].text, '别买')
  const zh = pick('zhihu', 'post', { data: [{ type: 'search_result', object: { type: 'answer', id: 5, question: { id: 4, name: '<em>庞巴迪</em>怎么样' }, excerpt: '不推荐', author: { name: 'E' }, created_time: 1795100000, voteup_count: 8 } }] })
  assert.equal(zh[0].url, 'https://www.zhihu.com/question/4/answer/5')
  assert.equal(zh[0].title, '庞巴迪怎么样')
  const wb = pick('weibo', 'post', { data: { cards: [{ mblog: { mid: '88', text: '庞巴迪<br/>客服太差', created_at: 'Thu Nov 19 10:00:00 +0800 2026', user: { screen_name: 'F', id: 1 }, mblogid: 'Ab', attitudes_count: 2, reposts_count: 0, comments_count: 1 } }] } })
  assert.equal(wb[0].text, '庞巴迪\n客服太差')
  assert.equal(wb[0].url, 'https://weibo.com/1/Ab')
  assert.ok(wb[0].time)
  const wc = pick('weibo', 'comment', { data: [{ id: 101, text_raw: '同感', created_at: 'Thu Nov 19 11:00:00 +0800 2026', like_counts: 4, user: { screen_name: 'G' }, floor_number: 1 }] })
  assert.equal(wc[0].stats.likes, 4)
})

test('微博搜索页上读出来的字翻成帖子', () => {
  const [p] = weiboFromDom([{ mid: '1', text: '庞巴迪 太贵了 收起d', author: '张三', timeText: '今天 10:23 来自 iPhone', href: 'https://weibo.com/123/Abc?refer_flag=1', acts: ['转发 3', '评论 5', '赞 1.1万'] }], '庞巴迪')
  assert.equal(p.text, '庞巴迪 太贵了')
  assert.equal(p.url, 'https://weibo.com/123/Abc')
  assert.deepEqual(p.stats, { likes: 11000, comments: 5, shares: 3 })
  assert.ok(p.time)
})

test('认出验证码页、登录页', () => {
  assert.equal(blockedBy({ title: '验证码中间页', href: 'https://www.douyin.com/search/x' }), 'captcha')
  assert.equal(blockedBy({ title: '安全验证 - 知乎', href: 'https://www.zhihu.com/account/unhuman?type=S6E3V1' }), 'captcha')
  assert.equal(blockedBy({ title: '登录 - 微博', href: 'https://passport.weibo.com/sso/signin' }), 'login')
  assert.equal(blockedBy({ title: '庞巴迪 - 小红书搜索', href: 'https://www.xiaohongshu.com/search_result', body: '全部 图文 视频' }), '')
})

test('付费接口：没密钥不跑；每次调用都记账；到上限自然停下', async () => {
  const none = await paidSearch('douyin', ['x'], { key: '', budget: makeBudget({}, { monthlyCap: 5, unitPrice: 0.01 }) })
  assert.equal(none.calls, 0)
  const spend = {}
  const budget = makeBudget(spend, { monthlyCap: 0.02, unitPrice: 0.01 })
  const urls = []
  const fetchImpl = async (url, opt) => {
    urls.push(url)
    assert.equal(opt.headers.Authorization, 'Bearer KEY')
    return json({ code: 200, data: { business_data: [{ data: { aweme_info: { aweme_id: '1', desc: 'x 好', create_time: 1795100000, statistics: { comment_count: 3 } } } }] } })
  }
  const r = await paidSearch('douyin', ['x', 'y', 'z'], { key: 'KEY', budget, fetchImpl })
  assert.equal(r.calls, 2) // 上限 0.02 元，每次 0.01 元，只调两次
  assert.equal(urls.length, 2)
  assert.equal(spend[Object.keys(spend)[0]].calls, 2)
  assert.equal(r.status, 'paid')
  assert.match(r.note, /到了每月上限/)
  const capped = await paidSearch('douyin', ['x'], { key: 'KEY', budget, fetchImpl })
  assert.equal(capped.status, 'cap')
  assert.equal(capped.calls, 0)
})

test('付费接口：密钥不对时说清楚', async () => {
  const r = await paidSearch('weibo', ['x', 'y'], { key: 'KEY', budget: makeBudget({}, { monthlyCap: 5, unitPrice: 0.01 }), fetchImpl: async () => json({ detail: 'bad' }, 401) })
  assert.equal(r.status, 'error')
  assert.match(r.note, /密钥不对/)
  assert.equal(r.calls, 1) // 密钥不对就不再调第二个词
})
