/**
 * 口碑雷达 · 存数据：一类数据一个 JSON 文件（照底座的 makeStore 写的）。
 * 多了一层内存缓存：第一次读文件，之后都在内存里改、改完写回文件。几千条内容时页面每秒刷进度也不卡。
 * 只有这个插件自己写这些文件，所以缓存不会和文件对不上。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * @param {string} dataDir 存数据的文件夹
 * @param {string} fileName 文件名，例 'items.json'
 * @param {() => object} first 文件还不存在时用的初始内容
 * @param {(data: object) => object} [fix] 读出来以后补齐缺的字段（老版本存的文件少字段时用）
 */
export function makeStore(dataDir, fileName, first, fix = x => x) {
  const file = join(dataDir, fileName)
  let queue = Promise.resolve()
  let cache = null

  async function load() {
    if (cache) return cache
    try {
      cache = fix(JSON.parse(await readFile(file, 'utf8')))
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      // 文件坏了（比如手动改错了）：留一份备份，从头开始，不让整个插件打不开
      if (error instanceof SyntaxError) await rename(file, `${file}.坏了-${Date.now()}`).catch(() => {})
      cache = fix(first())
    }
    return cache
  }

  async function write(data) {
    await mkdir(dataDir, { recursive: true })
    // 先写临时文件再改名：写到一半断电也不会留下半个文件。
    await writeFile(`${file}.tmp`, JSON.stringify(data))
    await rename(`${file}.tmp`, file)
  }

  /** 读：拿到的是内存里那一份，只看不改（要改走 change）。 */
  const read = () => queue.then(load)

  /** 改数据都走这里：一次只做一件，不会两个操作互相覆盖。 */
  function change(fn) {
    const run = queue.then(async () => {
      const data = await load()
      let result
      try {
        result = await fn(data)
      } catch (error) {
        cache = null // 改到一半出错：丢掉内存里改了一半的，下次从文件重新读
        throw error
      }
      await write(data)
      return result
    })
    queue = run.catch(() => {})
    return run
  }

  return { read, change, file }
}
