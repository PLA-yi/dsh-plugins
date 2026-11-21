// 真的去请求一次每个免费源，看现在还能不能拿到数据（会联网，比较慢，B 站每次请求隔 8 秒）。
// 跑法：npm run probe            或者 node test/实测免费源.mjs 庞巴迪
// 不会调用付费接口；要登录的四个平台（微博、知乎、小红书、抖音）要在插件的 Chrome 窗口里登录后才能实测。
import { bilibili, news, wechat } from '../host/free.js'

const term = process.argv[2] || '庞巴迪'
const say = text => console.log(`  · ${text}`)
for (const [name, fn] of [['B 站', bilibili], ['公众号（搜狗微信）', wechat], ['新闻（必应 / Google RSS）', news]]) {
  console.log(`\n${name}：搜「${term}」`)
  const t0 = Date.now()
  try {
    const r = await fn([term], { say })
    const posts = r.items.filter(x => x.kind === 'post').length
    const comments = r.items.length - posts
    console.log(`  结果：${r.status}，帖子 ${posts} 条，评论 ${comments} 条，${((Date.now() - t0) / 1000).toFixed(0)} 秒`)
    console.log(`  说明：${r.note}`)
    for (const x of r.items.slice(0, 2)) console.log(`  例：[${x.kind}] ${x.author || '-'} | ${(x.title || x.text).slice(0, 40)} | ${x.time ?? '没有时间'}`)
  } catch (e) {
    console.log(`  出错：${e.message}`)
  }
}
