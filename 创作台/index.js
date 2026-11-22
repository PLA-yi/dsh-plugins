/**
 * 创作台 · 后台（Host）
 *
 * 创作台：文章、小红书卡片、视频、选题广场、素材、记忆。
 * 真正干活的是插件自带的工作台（workbench/）：这里在后台起一个工作台服务（只听 127.0.0.1），页面要什么就转给它。
 * 工作台里的 AI 走 DSH 自己的模型：host/gateway.js 开一个本机转发口，工作台把它当成一个模型接口来调，
 * 密钥留在 DSH 里，不经过工作台。
 *
 * 页面调这里的 handlers（和底座一样）：
 *   status        工作台起没起来、地址是什么
 *   wb            转一次普通请求：{ method, path, body } → 工作台返回的 JSON
 *   streamStart   开一个边写边出的请求（AI 写作、能动手的助手），返回编号；streamRead 按编号取新内容；streamStop 停下
 *   uploadStart / uploadChunk / uploadFinish   分块传一个文件（视频素材、拉片的视频），传完转给工作台
 *
 * 改了这个文件要重启 DSH 才生效（页面文件 client.js 改了会自动生效）。
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rm, stat, appendFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { StudioGateway } from './host/gateway.js'
import { htmlText } from './host/html-text.js'

export const name = 'creator-studio'
export const inject = ['connection']

const ROUTE = '/api/creatorStudio/call'
const FILE_ROUTE = '/api/creatorStudio/file'

/** 想让用户直接看到的错误用它抛。 */
export class UserError extends Error {}

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** 工作台和模型回的错误常常是一层套一层的 JSON，剥出里面那句话，常见的换成人话。 */
function readable(text) {
  let msg = String(text ?? '')
  for (let i = 0; i < 3; i++) {
    try { const j = JSON.parse(msg); msg = typeof j === 'string' ? j : j.error?.message ?? j.error ?? j.message ?? msg; if (typeof msg !== 'string') msg = JSON.stringify(msg) } catch { break }
  }
  const m = /\{[\s\S]*"message"\s*:\s*"([^"]+)"/.exec(msg)
  if (m) msg = m[1]
  if (/Insufficient Balance|余额不足|credit balance/i.test(msg)) return '模型账户余额不足：给这个模型的账户充值，或在左下角换一个模型再试。'
  if (/rate.?limit|429/i.test(msg)) return '模型那边说请求太频繁，等一分钟再试。'
  if (/authentication|invalid.*key|401/i.test(msg)) return '模型的密钥不对：去 DSH「设置 → 模型」检查，或在左下角换一个模型。'
  return msg.slice(0, 400)
}
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

// ------------------------------------------------------------------ 工作台的数据放哪

/**
 * 工作台的数据（设置、素材库、记忆、选题广场）放在这个 DSH 自己的目录里（dataDir/workbench），
 * 几个 DSH（比如桌面版和网页测试版）装同一个插件文件夹时各存各的。作品默认放在「文稿/创作台」，在访达里能直接找到；
 * cordis.patch.yml 写了 projectsDir 就用那个。早期版本把数据放在插件的 workbench/data 里，第一次启动时搬过来一份。
 */
function prepareData(dataDir, projectsDir, log) {
  try {
    mkdirSync(projectsDir, { recursive: true })
    const old = join(import.meta.dirname, 'workbench', 'data')
    if (!existsSync(dataDir) && existsSync(old)) cpSync(old, dataDir, { recursive: true })
    mkdirSync(dataDir, { recursive: true })
    const file = join(dataDir, 'config.json')
    let conf = {}
    try { conf = JSON.parse(readFileSync(file, 'utf8')) } catch {}
    if (conf.roots?.length === 1 && conf.roots[0] === projectsDir) return
    writeFileSync(file, JSON.stringify({ ...conf, roots: [projectsDir] }, null, 2) + '\n')
  } catch (e) {
    log(`准备作品文件夹失败：${e.message}`)
  }
}

// ------------------------------------------------------------------ 工作台服务：起、等、挂了再起

function makeRunner({ dir, dataDir, port, token, gateway, log }) {
  let child = null
  let ready = null          // 正在起或已经起好的 Promise
  let lastError = ''
  let stopped = false
  const base = `http://127.0.0.1:${port}`

  async function alive() {
    try { const r = await fetch(`${base}/api/stamp`, { signal: AbortSignal.timeout(1500) }); return r.ok } catch { return false }
  }

  async function start() {
    if (!existsSync(join(dir, 'server.mjs'))) throw new UserError(`插件不完整：没找到 ${dir}。重新下载插件再装一次。`)
    // 端口上已经有程序：多半是 DSH 刚被强行关掉、上一个工作台还没退（它两秒内会自己退），等一会儿
    for (let i = 0; i < 12 && await alive(); i++) await sleep(500)
    if (await alive()) throw new UserError(`端口 ${port} 已经被别的程序占用了。关掉它，或在 cordis.patch.yml 里换一个 port。`)
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', WB_TOKEN: token, WB_DATA_DIR: dataDir }
    if (gateway) { env.WB_DSH_GATEWAY = await gateway.start(); env.WB_DSH_GATEWAY_KEY = gateway.key }
    child = spawn(process.execPath, [join(import.meta.dirname, 'host', 'run-workbench.mjs'), join(dir, 'server.mjs'), '--port', String(port)], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const keep = d => { tail = (tail + d).slice(-2000) }
    child.stdout.on('data', keep); child.stderr.on('data', keep)
    child.on('exit', code => {
      child = null; ready = null
      if (stopped) return
      lastError = `工作台退出了（${code}）：${tail.trim().split('\n').slice(-3).join(' ')}`
      log(lastError)
    })
    for (let i = 0; i < 60; i++) {
      await sleep(250)
      if (!child) throw new Error(lastError || '工作台没起来')
      if (await alive()) { lastError = ''; return base }
    }
    throw new Error('工作台 15 秒内没起来：' + tail.slice(-300))
  }

  return {
    base,
    error: () => lastError,
    running: () => !!child,
    ensure() {
      if (stopped) return Promise.reject(new UserError('插件正在关闭'))
      ready ??= start().catch(e => { ready = null; lastError = e.message; throw e })
      return ready
    },
    stop() { stopped = true; child?.kill(); child = null },
  }
}

// ------------------------------------------------------------------ 能做的事

function makeHandlers({ runner, token, dataDir }) {
  const streams = new Map()   // 编号 → { text, done, error, ctrl, at }
  const uploads = new Map()   // 编号 → 临时文件

  async function call(method = 'GET', path, body, { raw = false } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/')) throw new UserError('地址不对')
    const base = await runner.ensure()
    const init = { method, headers: { 'x-wb-token': token, origin: base } }
    if (body !== undefined && method !== 'GET') { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body) }
    const r = await fetch(base + path, init)
    const text = await r.text()
    if (!r.ok) throw new UserError(readable(text) || `出错了（${r.status}）`)
    if (raw) return text
    try { return JSON.parse(text) } catch { return text }
  }

  // 过期的流和上传：十分钟没人取就丢掉
  setInterval(() => {
    const old = Date.now() - 10 * 60e3
    for (const [id, s] of streams) if (s.done && s.at < old) streams.delete(id)
  }, 60e3).unref?.()

  return {
    async status() {
      try { const base = await runner.ensure(); return { ready: true, base } } catch (e) { return { ready: false, base: runner.base, error: e.message } }
    },

    async wb({ method, path, body, raw }) { return call(method, path, body, { raw }) },

    /** 网页正文（选题广场「读原文」兜底用）。 */
    async htmlToText({ html }) { return htmlText(String(html ?? '')) },

    /** 读工作台里的一个文件，返回 base64（页面复制图片、把图嵌进公众号正文时用；工作台不给浏览器跨源读）。最大 20 MB。 */
    async fileData({ path }) {
      if (typeof path !== 'string' || !path.startsWith('/')) throw new UserError('地址不对')
      const base = await runner.ensure()
      const r = await fetch(base + path)
      if (!r.ok) throw new UserError(`读不到这个文件（${r.status}）`)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 20 * 1024 * 1024) throw new UserError('文件太大了（超过 20 MB）')
      return { data: buf.toString('base64'), type: (r.headers.get('content-type') || '').split(';')[0] }
    },

    async streamStart({ method = 'POST', path, body }) {
      const base = await runner.ensure()
      const id = randomBytes(8).toString('hex')
      const s = { text: '', done: false, error: '', ctrl: new AbortController(), at: Date.now(), status: 0 }
      streams.set(id, s)
      ;(async () => {
        try {
          const r = await fetch(base + path, { method, signal: s.ctrl.signal, headers: { 'x-wb-token': token, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
          s.status = r.status
          if (!r.ok) { s.error = readable(await r.text()); return }
          const dec = new TextDecoder()
          for await (const chunk of r.body) { s.text += dec.decode(chunk, { stream: true }); s.at = Date.now() }
        } catch (e) {
          if (e.name !== 'AbortError') s.error = e.message
        } finally { s.done = true; s.at = Date.now() }
      })()
      return { id }
    },

    async streamRead({ id, from = 0 }) {
      const s = streams.get(id)
      if (!s) throw new UserError('这次生成已经过期了，再试一次')
      return { text: s.text.slice(from), size: s.text.length, done: s.done, error: s.error }
    },

    async streamStop({ id }) { streams.get(id)?.ctrl.abort(); return { ok: true } },

    async uploadStart({ name: fileName }) {
      await mkdir(join(dataDir, 'uploads'), { recursive: true })
      const id = randomBytes(8).toString('hex')
      const file = join(dataDir, 'uploads', id)
      uploads.set(id, { file, name: String(fileName || 'file') })
      return { id }
    },

    async uploadChunk({ id, data }) {
      const u = uploads.get(id)
      if (!u) throw new UserError('上传已经过期了，重新选一次文件')
      await appendFile(u.file, Buffer.from(String(data), 'base64'))
      return { size: (await stat(u.file)).size }
    },

    /** 传完：把整个文件发给工作台的上传地址（path 里不用带 name，这里会补上）。 */
    async uploadFinish({ id, path }) {
      const u = uploads.get(id)
      if (!u) throw new UserError('上传已经过期了，重新选一次文件')
      uploads.delete(id)
      try {
        const base = await runner.ensure()
        const size = (await stat(u.file)).size
        const sep = path.includes('?') ? '&' : '?'
        const r = await fetch(`${base}${path}${sep}name=${encodeURIComponent(u.name)}`, {
          method: 'POST', headers: { 'x-wb-token': token, origin: base, 'content-length': String(size), 'content-type': 'application/octet-stream' },
          body: createReadStream(u.file), duplex: 'half',
        })
        const text = await r.text()
        if (!r.ok) throw new UserError(readable(text))
        return JSON.parse(text)
      } finally { await rm(u.file, { force: true }) }
    },
  }
}

// ------------------------------------------------------------------ 转发工作台里的文件

/** 样式表里的相对 url(…) 按它在工作台里的位置补全，再换成插件的文件地址（样式表经这里转过以后，浏览器以为它在 /api/ 下面）。 */
function fixCssUrls(css, path) {
  return css.replace(/url\(\s*(['"]?)(?!data:|[a-z][\w+.-]*:|\/\/|#)([^'")]+)\1\s*\)/gi, (m, q, rel) => {
    try { const u = new URL(rel, 'http://wb' + path); return `url("${FILE_ROUTE}?p=${encodeURIComponent(decodeURIComponent(u.pathname) + u.search)}")` } catch { return m }
  })
}

async function serveFile(request, runner) {
  const path = new URL(request.url).searchParams.get('p') || ''
  if (!path.startsWith('/') || path.startsWith('/api/') && !/^\/api\/(projects\/[^?]+\/studio\/(images|attach)|video-tts\/sample)/.test(path)) return new Response('not found', { status: 404 })
  let base
  try { base = await runner.ensure() } catch (e) { return new Response(e.message, { status: 503 }) }
  const headers = {}
  const range = request.headers.get('range')
  if (range) headers.range = range
  const r = await fetch(base + path, { headers })
  const out = new Headers()
  for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition', 'cache-control']) { const v = r.headers.get(k); if (v) out.set(k, v) }
  if (/text\/css/.test(r.headers.get('content-type') || '')) {
    out.delete('content-length')
    return new Response(fixCssUrls(await r.text(), path.split('?')[0]), { status: r.status, headers: out })
  }
  return new Response(r.body, { status: r.status, headers: out })
}

// ------------------------------------------------------------------ DSH 的模型和联网，给转发口用

function makeGateway(ctx) {
  const pick = () => {
    const def = ctx.get('agentDefaultModel')?.currentSelection?.()
    return def ? `${def.provider}/${def.model}` : undefined
  }
  return new StudioGateway({
    fetchChars: 60000,
    llm: {
      async models() {
        const llm = ctx.get('llm'), out = []
        for (const p of llm?.listProviders?.() ?? []) {
          try { for (const m of await llm.listModels(p.id)) out.push({ id: `${p.id}/${m.id}`, name: `${m.name || m.id} · ${p.name || p.id}` }) } catch {}
        }
        const d = pick()
        return d && !out.some(m => m.id === d) ? [{ id: d, name: d.split('/').slice(1).join('/') }, ...out] : out
      },
      defaultRoute: pick,
      async *stream(request) {
        const llm = ctx.get('llm')
        if (!llm) throw new Error('DSH 的对话模型服务不可用')
        const call = await llm.prepareCall({ provider: request.provider, model: request.model, maxTokens: request.maxTokens ?? 16000 }, request.signal)
        yield* call.stream({ ...call.config, system: request.system, messages: request.messages, ...(request.tools.length ? { tools: request.tools } : {}), purpose: 'creator-studio', signal: request.signal })
      },
      async saveImage(data, mediaType) {
        const store = ctx.get('attachments')
        if (!store || !IMAGE_TYPES.includes(mediaType)) return undefined
        const [ref] = await store.saveImages([{ data, mediaType }])
        return ref ? { type: 'image', attachment: ref } : undefined
      },
    },
    web: () => {
      const web = ctx.get('web')
      if (!web) return undefined
      return {
        search: async (query, maxResults, signal) => (await web.search({ query, maxResults }, signal)).sources.map(s => ({ url: s.url, title: s.title, snippet: s.snippet ?? s.summary, publishedAt: s.publishedAt })),
        fetch: async (url, signal) => {
          const page = await web.fetch({ url }, signal)
          return { url: page.url, status: page.statusCode, text: page.body.kind === 'html' ? htmlText(page.body.content) : page.body.content }
        },
      }
    },
  })
}

// ------------------------------------------------------------------ 把 handlers 接到页面能调的地址上（和底座一样）

async function respond(request, handlers, log) {
  let message
  try { message = await request.json() } catch { return new Response('bad request', { status: 400 }) }
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
      result = { ok: false, error: { code: `${name}/internal`, message: `插件内部出错了（${error?.message ?? error}）`, details: {} } }
    }
  }
  return new Response(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result }), { headers: { 'content-type': 'application/json' } })
}

/**
 * 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ dataDir: string, projectsDir?: string, port?: number }} config - 来自 cordis.patch.yml。
 */
export function apply(ctx, config) {
  if (!config?.dataDir) throw new Error(`${name}：cordis.patch.yml 里要写 dataDir`)
  const log = text => ctx.logger?.warn?.(`${name}: ${text}`)
  // 工作台的程序在插件的 workbench/，数据在这个 DSH 自己的目录里
  const dir = join(import.meta.dirname, 'workbench')
  const wbData = join(config.dataDir, 'workbench')
  prepareData(wbData, config.projectsDir || join(homedir(), 'Documents', '创作台'), log)
  const token = randomBytes(16).toString('hex')
  const gateway = makeGateway(ctx)
  const runner = makeRunner({ dir, dataDir: wbData, port: Number(config.port) || 5295, token, gateway, log })
  const handlers = makeHandlers({ runner, token, dataDir: config.dataDir })
  // DSH 一起来就在后台把工作台起好，打开页面时不用等
  runner.ensure().catch(e => log(e.message))
  ctx.effect(() => () => { runner.stop(); gateway.stop() }, `${name}: 关掉工作台和转发口`)
  // 工作台里的文件（图片、视频、样式表、下载）：页面用 /api/creatorStudio/file?p=<工作台里的路径> 来拿，这里转给工作台。
  // 桌面版的页面不让直接加载 http://127.0.0.1 上的图片，所以都绕这一道；视频要拖进度条，Range 原样转过去。
  ctx.effect(() => ctx.connection.fetch.register({
    path: FILE_ROUTE, methods: ['GET'], requestBody: 'buffered',
    fetch: request => serveFile(request, runner),
  }), `${name}: 工作台里的文件`)
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE, methods: ['POST'], requestBody: 'buffered',
    fetch: request => respond(request, handlers, log),
  }), `${name}: 页面调后台的地址`)
}
