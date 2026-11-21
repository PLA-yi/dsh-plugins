/**
 * 口碑雷达 · 把各平台返回的数据翻成统一的一条条内容。
 *
 * 浏览器窗口里旁听到的数据、付费接口返回的数据，长得都是平台自己的格式（只是外面包的壳不一样），
 * 所以这里不管外壳，直接在整份数据里找「长得像帖子 / 评论」的那一块，翻成统一格式：
 *   { platform, kind: 'post' | 'comment', pid, url, author, time, title, text, parentTitle, parentPid, stats: { likes, comments, shares, views }, extra }
 */
import { parseTime, plain } from './core.js'

const num = v => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).trim()
  const m = /^([\d.]+)\s*(万|w|k|千)?\+?$/i.exec(s)
  if (!m) return null
  const unit = { 万: 1e4, w: 1e4, k: 1e3, 千: 1e3 }[m[2]?.toLowerCase?.() ?? m[2]] ?? 1
  return Math.round(Number(m[1]) * unit)
}
const unwrap = v => (v && typeof v === 'object' && ('_value' in v || '_rawValue' in v) ? v._rawValue ?? v._value : v)

/** 在一份数据里一层层往下找，fn 认出来的就收下（认出来的那一块不再往里找）。 */
function walk(root, fn, out = [], depth = 0, seen = new Set()) {
  root = unwrap(root)
  if (!root || typeof root !== 'object' || depth > 14 || seen.has(root)) return out
  seen.add(root)
  const hit = fn(root)
  if (hit) { out.push(hit); return out }
  for (const v of Array.isArray(root) ? root : Object.values(root)) walk(v, fn, out, depth + 1, seen)
  return out
}

// ------------------------------------------------------------------ 抖音

function douyinPost(o) {
  const a = o.aweme_info && typeof o.aweme_info === 'object' ? o.aweme_info : o
  if (!a.aweme_id || typeof a.desc !== 'string') return null
  const st = a.statistics ?? {}
  return {
    platform: 'douyin', kind: 'post', pid: String(a.aweme_id), url: `https://www.douyin.com/video/${a.aweme_id}`,
    author: a.author?.nickname ?? '', time: parseTime(a.create_time), title: '', text: plain(a.desc),
    stats: { likes: num(st.digg_count), comments: num(st.comment_count), shares: num(st.share_count), views: num(st.play_count) },
  }
}
function douyinComment(o) {
  if (!o.cid || typeof o.text !== 'string' || !o.aweme_id) return null
  return {
    platform: 'douyin', kind: 'comment', pid: String(o.cid), parentPid: String(o.aweme_id), url: `https://www.douyin.com/video/${o.aweme_id}`,
    author: o.user?.nickname ?? '', time: parseTime(o.create_time), title: '', text: plain(o.text), stats: { likes: num(o.digg_count) },
  }
}

// ------------------------------------------------------------------ 小红书

function xhsPost(o) {
  // 网页搜索：{ id, xsec_token, note_card: { display_title, user, interact_info } }
  if (o.note_card && o.id) {
    const c = o.note_card
    const token = o.xsec_token ? `?xsec_token=${encodeURIComponent(o.xsec_token)}&xsec_source=pc_search` : ''
    return {
      platform: 'xhs', kind: 'post', pid: String(o.id), url: `https://www.xiaohongshu.com/explore/${o.id}${token}`,
      author: c.user?.nickname ?? c.user?.nick_name ?? '', time: parseTime(c.time ?? c.last_update_time), title: plain(c.display_title ?? c.title ?? ''), text: plain(c.desc ?? ''),
      stats: { likes: num(c.interact_info?.liked_count), comments: num(c.interact_info?.comment_count), shares: num(c.interact_info?.shared_count) },
      extra: { xsecToken: o.xsec_token ?? '' },
    }
  }
  // App 搜索（付费接口）：{ note: { id, title, desc, timestamp, user, liked_count } } 或直接是 note
  const n = o.note && typeof o.note === 'object' && o.note.id ? o.note : o
  if (n.id && (typeof n.desc === 'string' || typeof n.title === 'string') && (n.user || n.liked_count !== undefined) && !n.content) {
    const token = n.xsec_token ? `?xsec_token=${encodeURIComponent(n.xsec_token)}&xsec_source=pc_search` : ''
    return {
      platform: 'xhs', kind: 'post', pid: String(n.id), url: `https://www.xiaohongshu.com/explore/${n.id}${token}`,
      author: n.user?.nickname ?? n.user?.nick_name ?? '', time: parseTime(n.timestamp ?? n.time ?? n.create_time), title: plain(n.title ?? ''), text: plain(n.desc ?? ''),
      stats: { likes: num(n.liked_count ?? n.likes), comments: num(n.comments_count ?? n.comment_count), shares: num(n.shared_count) },
      extra: { xsecToken: n.xsec_token ?? '' },
    }
  }
  return null
}
function xhsComment(o) {
  if (!o.id || typeof o.content !== 'string' || !(o.user_info || o.user)) return null
  const u = o.user_info ?? o.user
  return {
    platform: 'xhs', kind: 'comment', pid: String(o.id), parentPid: o.note_id ? String(o.note_id) : undefined,
    author: u?.nickname ?? u?.nick_name ?? '', time: parseTime(o.create_time ?? o.time), title: '', text: plain(o.content), stats: { likes: num(o.like_count) },
  }
}

// ------------------------------------------------------------------ 微博

const weiboTime = v => parseTime(v) ?? (typeof v === 'string' ? parseTime(v.replace(/^\w+ (\w+) (\d+) ([\d:]+) ([+-]\d{4}) (\d{4})$/, '$1 $2 $5 $3 $4')) : null)
function weiboPost(o) {
  const m = o.mblog && typeof o.mblog === 'object' ? o.mblog : o
  if (!(m.mid || m.id) || typeof (m.text_raw ?? m.text) !== 'string' || !m.user) return null
  // 帖子带转发数、点赞数；评论没有转发数、带楼层号
  if (m.reposts_count === undefined && m.attitudes_count === undefined) return null
  if (m.floor_number !== undefined) return null
  const mid = String(m.mid ?? m.id)
  return {
    platform: 'weibo', kind: 'post', pid: mid, url: m.user?.id && m.mblogid ? `https://weibo.com/${m.user.id}/${m.mblogid}` : `https://m.weibo.cn/detail/${mid}`,
    author: m.user?.screen_name ?? '', time: weiboTime(m.created_at), title: '', text: plain(m.text_raw ?? m.text),
    stats: { likes: num(m.attitudes_count), comments: num(m.comments_count), shares: num(m.reposts_count) },
  }
}
function weiboComment(o) {
  if (!o.id || typeof (o.text_raw ?? o.text) !== 'string' || !o.user || o.reposts_count !== undefined) return null
  return {
    platform: 'weibo', kind: 'comment', pid: String(o.id), author: o.user?.screen_name ?? '', time: weiboTime(o.created_at), title: '',
    text: plain(o.text_raw ?? o.text), stats: { likes: num(o.like_counts ?? o.like_count) },
  }
}

// ------------------------------------------------------------------ 知乎

function zhihuPost(o) {
  const x = o.object && typeof o.object === 'object' ? o.object : null
  if (!x || !x.id || !['answer', 'article', 'zvideo', 'question'].includes(x.type)) return null
  const url = x.type === 'answer' && x.question?.id ? `https://www.zhihu.com/question/${x.question.id}/answer/${x.id}`
    : x.type === 'article' ? `https://zhuanlan.zhihu.com/p/${x.id}`
      : x.type === 'question' ? `https://www.zhihu.com/question/${x.id}` : `https://www.zhihu.com/zvideo/${x.id}`
  return {
    platform: 'zhihu', kind: 'post', pid: `${x.type}-${x.id}`, url,
    author: x.author?.name ?? '', time: parseTime(x.created_time ?? x.created ?? x.updated_time), title: plain(x.title ?? x.question?.name ?? ''), text: plain(x.excerpt ?? x.content ?? ''),
    stats: { likes: num(x.voteup_count ?? x.vote_count), comments: num(x.comment_count) },
    extra: { answerId: x.type === 'answer' ? String(x.id) : '' },
  }
}
function zhihuComment(o) {
  if (!o.id || typeof o.content !== 'string' || !(o.author || o.author_info) || o.object) return null
  const a = o.author?.member ?? o.author ?? o.author_info
  return {
    platform: 'zhihu', kind: 'comment', pid: String(o.id), author: a?.name ?? '', time: parseTime(o.created_time), title: '',
    text: plain(o.content), stats: { likes: num(o.like_count ?? o.vote_count) },
  }
}

// ------------------------------------------------------------------ B 站（付费接口返回的格式和公开接口一样）

export function biliPost(o) {
  if (!o.aid || !o.bvid || typeof o.title !== 'string') return null
  return {
    platform: 'bilibili', kind: 'post', pid: String(o.aid), url: `https://www.bilibili.com/video/${o.bvid}`,
    author: o.author ?? o.owner?.name ?? '', time: parseTime(o.pubdate ?? o.senddate), title: plain(o.title), text: plain(o.description ?? o.desc ?? ''),
    stats: { likes: num(o.like), comments: num(o.review), views: num(o.play) }, extra: { bvid: o.bvid, aid: String(o.aid) },
  }
}
export function biliComment(o) {
  if (!o.rpid || !o.content || typeof o.content.message !== 'string') return null
  return {
    platform: 'bilibili', kind: 'comment', pid: String(o.rpid), parentPid: o.oid ? String(o.oid) : undefined,
    author: o.member?.uname ?? '', time: parseTime(o.ctime), title: '', text: plain(o.content.message), stats: { likes: num(o.like) },
  }
}

const FINDERS = {
  douyin: { post: douyinPost, comment: douyinComment },
  xhs: { post: xhsPost, comment: xhsComment },
  weibo: { post: weiboPost, comment: weiboComment },
  zhihu: { post: zhihuPost, comment: zhihuComment },
  bilibili: { post: biliPost, comment: biliComment },
}

/**
 * 从一份数据里拿出帖子或评论。
 * @param {string} platform  douyin / xhs / weibo / zhihu / bilibili
 * @param {'post'|'comment'} kind
 * @param {unknown} data 平台或付费接口返回的整份 JSON
 * @param {object} [parent] 评论属于哪个帖子：带上它的标题和链接，模型判断时知道在说什么
 */
export function pick(platform, kind, data, parent) {
  const fn = FINDERS[platform]?.[kind]
  if (!fn) return []
  const list = walk(data, o => { try { return fn(o) } catch { return null } })
  const seen = new Set()
  return list.filter(x => (seen.has(x.pid) ? false : seen.add(x.pid))).map(x => (parent ? {
    ...x, parentPid: x.parentPid ?? parent.pid, parentTitle: parent.title || parent.text?.slice(0, 60) || '', url: x.url ?? parent.url,
  } : x))
}
