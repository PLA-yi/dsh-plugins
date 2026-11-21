/**
 * 口碑雷达 · 让 DSH 里配好的模型判断「是不是在骂」，以及写日报总结。
 *
 * 用的是 DSH 自己的对话模型服务（ctx.get('llm')），默认跟随 DSH 当前的默认模型（一般是 DeepSeek）。
 * 写法照宣传片工坊的 host/reviewer.js。
 * 失败规矩：一批调用失败会重试一次；再失败就把这一批标成「没判断」，别的批照常判，整次检查不白跑。
 */
import { JUDGE_SYSTEM, fallbackSummary, judgePrompt, parseJudgement, reportPrompt } from './core.js'

/** 模型出错翻成一句话。 */
export function llmErrorText(code, message) {
  const all = `${code ?? ''} ${message ?? ''}`
  if (/MISSING_CREDENTIAL|INVALID_CREDENTIAL|401|authentication|api key/i.test(all)) return '模型还没填 Key 或 Key 不对：去 DSH「设置 → 模型」看看'
  if (/QUOTA|credit|insufficient|余额|billing|402/i.test(all)) return '模型账户余额不够了'
  if (/RATE_LIMIT|429|rate/i.test(all)) return '模型说请求太频繁'
  if (/network|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(all)) return '连模型时网络断了'
  return `模型出错了（${code || String(message ?? '').slice(0, 60) || '未知'}）`
}

/**
 * 接上 DSH 的模型，返回 ask({ system, prompt }) → 回答的文字。
 * '@deepseek-ai/dsh-llm' 这个包在 DSH 里能直接用；放在函数里才加载，这样测试时（不在 DSH 里）也能导入这个文件。
 */
export function makeAsk(ctx) {
  return async function ask({ system, prompt, maxTokens = 4000, signal }) {
    const llm = ctx.get?.('llm')
    if (!llm) throw new Error('DSH 的模型服务不可用')
    const def = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (!def) throw new Error('DSH 还没选默认模型：去「设置 → 模型」选一个')
    const { BlockAssembler, createUserMessage } = await import('@deepseek-ai/dsh-llm')
    const messages = [createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'reputation-radar' } })]
    const assembler = new BlockAssembler()
    try {
      // 会思考的模型会先用掉一截输出额度，给少了正文会被截断，所以至少 8000
      const call = await llm.prepareCall({ provider: def.provider, model: def.model, maxTokens: Math.max(maxTokens, 8000), ...(def.reasoningEffort ? { reasoningEffort: def.reasoningEffort } : {}) }, signal)
      for await (const chunk of call.stream({ ...call.config, messages, system, signal, purpose: undefined })) assembler.push(chunk)
    } catch (e) {
      throw new Error(llmErrorText(e?.code, e?.message))
    }
    const finish = assembler.finish
    if (finish?.kind === 'error') throw new Error(llmErrorText(finish.failure?.code, finish.failure?.message))
    return assembler.blocks().filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
  }
}

/** 现在用的是哪个模型（页面上显示用）。 */
export function modelName(ctx) {
  const def = ctx.get?.('agentDefaultModel')?.currentSelection?.()
  return def ? `${def.provider}/${def.model}` : ''
}

/**
 * 判断一批内容（同一个监控对象的）。
 * @returns {Promise<{ results: Array<object|null>, error?: string }>} results 和 batch 一一对应，null 表示这条没判断
 */
export async function judgeBatch(ask, target, batch, { signal } = {}) {
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await ask({ system: JUDGE_SYSTEM, prompt: judgePrompt(target, batch), maxTokens: 4000, signal })
      const results = parseJudgement(text, batch.length)
      if (results) return { results }
      lastError = '模型的回答读不懂（不是要的格式）'
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e?.message ?? String(e)
    }
  }
  return { results: batch.map(() => null), error: lastError }
}

/**
 * 判断很多条：按监控对象分组，每组 size 条一批。
 * @param {object[]} items 要判断的内容（带 id 和 target）
 * @param {object[]} targets 监控对象
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ byId: Map<number, object>, failed: number, errors: string[] }>}
 *          byId 里每条是写进 item.judge 的值：判断成功是 { status: 'done', ... }，失败是 { status: 'failed', error }
 */
export async function judgeAll(ask, items, targets, { size = 20, onProgress = () => {}, signal, model = '' } = {}) {
  const byId = new Map()
  const errors = new Set()
  let failed = 0
  let done = 0
  const groups = new Map()
  for (const it of items) {
    const t = targets.find(x => x.name === it.target) ?? targets[0]
    if (!groups.has(t)) groups.set(t, [])
    groups.get(t).push(it)
  }
  for (const [target, list] of groups) {
    for (let i = 0; i < list.length; i += size) {
      const batch = list.slice(i, i + size)
      const { results, error } = await judgeBatch(ask, target, batch, { signal })
      if (error) errors.add(error)
      const at = new Date().toISOString()
      batch.forEach((it, n) => {
        const r = results[n]
        if (r) byId.set(it.id, { status: 'done', ...r, model, at })
        else { failed += 1; byId.set(it.id, { status: 'failed', error: error || '模型漏答了这一条', at }) }
      })
      done += batch.length
      onProgress(done, items.length)
    }
  }
  return { byId, failed, errors: [...errors] }
}

/** 让模型写两三句日报总结；写不成就用保底的那句。 */
export async function writeSummary(ask, targetName, stats, worstItems, { signal } = {}) {
  if (!stats.total || !stats.related) return { text: fallbackSummary(stats), by: 'fallback' }
  try {
    const text = await ask({ system: '你是品牌口碑分析员，说话直接、口语化。', prompt: reportPrompt(targetName, stats, worstItems), maxTokens: 1200, signal })
    const clean = String(text ?? '').replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim()
    if (clean) return { text: clean.slice(0, 400), by: 'model' }
  } catch { /* 用保底的 */ }
  return { text: fallbackSummary(stats), by: 'fallback' }
}
