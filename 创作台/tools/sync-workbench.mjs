// 把小易工作台的代码打进插件的 workbench/ 文件夹，让插件装上就能用，不用另外装工作台。
// 跑法：node tools/sync-workbench.mjs [工作台仓库，默认 ../创作工作台] [版本，默认 HEAD]
// 做三件事：
//   1. 用 git archive 取工作台已提交的代码（不带 dsh-plugins/、数据和视频运行时）；
//   2. 工作台用到的三个依赖（@anthropic-ai/sdk、marked、juice）用 esbuild 各打成一个文件，
//      这样插件不用 npm install；
//   3. ai.mjs 里引用 SDK 的那一行改成引用打好的文件。
// esbuild 用 DSH 仓库里的那份，可以用环境变量 ESBUILD 换。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const PLUGIN = path.resolve(import.meta.dirname, '..')
const SRC = path.resolve(process.argv[2] || path.join(PLUGIN, '..', '创作工作台'))
const REF = process.argv[3] || 'HEAD'
const OUT = path.join(PLUGIN, 'workbench')
const ESBUILD = process.env.ESBUILD || path.join(PLUGIN, '..', 'deepseek-harness', 'node_modules', '.bin', 'esbuild')

if (!fs.existsSync(path.join(SRC, 'server.mjs'))) throw new Error(`没找到工作台：${SRC}`)
if (!fs.existsSync(ESBUILD)) throw new Error(`没找到 esbuild：${ESBUILD}（用环境变量 ESBUILD 指定）`)

// 1. 取代码。保留用户的数据、设置和已经装好的视频工具
const keep = ['data', 'config.json', 'video/runtime/node_modules', 'video/runtime/py', 'video/runtime/bin'].filter(n => fs.existsSync(path.join(OUT, n)))
const stash = path.join(PLUGIN, '.workbench-keep')
const stashed = n => path.join(stash, n.replaceAll('/', '__'))
fs.rmSync(stash, { recursive: true, force: true })
if (keep.length) { fs.mkdirSync(stash); for (const n of keep) fs.renameSync(path.join(OUT, n), stashed(n)) }
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT)
const tar = execFileSync('git', ['-C', SRC, 'archive', REF, '--', '.', ':!dsh-plugins', ':!package-lock.json'], { maxBuffer: 1 << 30 })
execFileSync('tar', ['-x', '-C', OUT], { input: tar })
for (const n of keep) { fs.mkdirSync(path.dirname(path.join(OUT, n)), { recursive: true }); fs.renameSync(stashed(n), path.join(OUT, n)) }
fs.rmSync(stash, { recursive: true, force: true })

// 2. 打依赖
const nm = path.join(SRC, 'node_modules'), rtNm = path.join(SRC, 'templates', 'runtime', 'node_modules')
// CommonJS 的包打成 ES 模块后还会 require node 自带的模块，补一个 require
const banner = "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
function bundle(entry, out, resolveDir) {
  execFileSync(ESBUILD, ['--bundle', '--platform=node', '--format=esm', '--target=node20', '--minify', '--legal-comments=none',
    `--banner:js=${banner}`, `--outfile=${out}`, '--log-level=warning'], { input: entry, cwd: resolveDir, stdio: ['pipe', 'inherit', 'inherit'] })
}
const vendor = path.join(OUT, 'vendor')
fs.mkdirSync(vendor, { recursive: true })
bundle("export { default } from '@anthropic-ai/sdk'", path.join(vendor, 'anthropic-sdk.mjs'), SRC)
// marked、juice 给文章模板用：templates/runtime/node_modules 里放两个只有一个文件的包
for (const [name, entry] of [['marked', "export { marked } from 'marked'"], ['juice', "export { default } from 'juice'"]]) {
  const dir = path.join(OUT, 'templates', 'runtime', 'node_modules', name)
  fs.mkdirSync(dir, { recursive: true })
  bundle(entry, path.join(dir, 'index.mjs'), path.dirname(rtNm))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, private: true, type: 'module', exports: './index.mjs' }, null, 2) + '\n')
}

// 3. 改 SDK 的引用
const ai = path.join(OUT, 'ai.mjs')
const code = fs.readFileSync(ai, 'utf8')
if (!code.includes("from '@anthropic-ai/sdk'")) throw new Error('ai.mjs 里没找到 @anthropic-ai/sdk 的引用，工作台代码变了，要看一下这个脚本')
fs.writeFileSync(ai, code.replace("from '@anthropic-ai/sdk'", "from './vendor/anthropic-sdk.mjs'"))

// 工作台自己的 .gitignore 忽略所有 node_modules；这里要让打好的 templates/runtime/node_modules 进仓库
const gi = path.join(OUT, '.gitignore')
fs.writeFileSync(gi, fs.readFileSync(gi, 'utf8').replace(/^node_modules$/m, '/node_modules\ntemplates/sample/node_modules\nvideo/runtime/node_modules\nconfig.json'))

const rev = execFileSync('git', ['-C', SRC, 'rev-parse', '--short', REF]).toString().trim()
fs.writeFileSync(path.join(OUT, 'VERSION'), `小易工作台 ${rev}（由 tools/sync-workbench.mjs 打进来，别直接改这里的代码）\n`)
const size = execFileSync('du', ['-sh', OUT]).toString().split('\t')[0]
console.log(`已打进 workbench/：工作台 ${rev}，${size}${keep.length ? `，保留了 ${keep.join('、')}` : ''}`)
