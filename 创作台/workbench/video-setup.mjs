// 视频工具一键安装：把 video/runtime 的依赖（HyperFrames、ffmpeg、ffprobe）装好，作者只点一个按钮。
// 不要求电脑上装过 Node.js 或 npm：npm 本身从镜像站下一份（一个压缩包），用工作台自己正在用的这个程序来跑它
// （装在 DeepSeek Harness 里时，这个程序是客户端自带的，不是系统里的 node）。
// 下载线路自动选：npm 官方源和国内的 npmmirror 同时试，哪个先通用哪个；走 npmmirror 时 ffmpeg 也从它的镜像下。
// 只往 video/runtime 和 data/ 里写，不动系统。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { APP_DIR, DATA_DIR } from './core.mjs';

const RT = path.join(APP_DIR, 'video', 'runtime');
const DATA = DATA_DIR;
const NPM_VERSION = '10.9.2';
const REGISTRIES = ['https://registry.npmjs.org', 'https://registry.npmmirror.com'];
const MIRROR = 'https://registry.npmmirror.com';

let job = null;   // { running, ok, step, log, error, registry, t }
export function status() {
  return job ? { running: job.running, ok: job.ok, step: job.step, error: job.error, log: job.log.split('\n').filter(Boolean).slice(-4).join('\n'), registry: job.registry } : { running: false };
}
export const installed = () => fs.existsSync(path.join(RT, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes'));

export function start() {
  if (job?.running) return status();
  job = { running: true, ok: false, step: '准备', log: '', error: '', registry: '', t: Date.now() };
  const me = job;
  install(me).then(() => { me.ok = true; me.step = '装好了'; }, e => { me.error = e.message || String(e); })
    .finally(() => { me.running = false; });
  return status();
}

// 两个源同时试，先通的那个赢
async function pickRegistry() {
  const probe = r => fetch(`${r}/npm`, { method: 'HEAD', signal: AbortSignal.timeout(8000) }).then(res => { if (!res.ok) throw new Error(String(res.status)); return r; });
  try { return await Promise.any(REGISTRIES.map(probe)); }
  catch { throw new Error('连不上下载源（npm 官方源和 npmmirror 都试过了）。检查一下网络再点一次'); }
}

// 解一个 .tgz（npm 包都是这个格式）。只认普通文件和文件夹，长文件名的两种写法（pax、GNU）都支持
function untar(buf, dest) {
  const tar = zlib.gunzipSync(buf);
  let off = 0, longName = null, paxPath = null;
  const str = (a, b) => tar.toString('utf8', a, b).replace(/\0.*$/s, '');
  while (off + 512 <= tar.length) {
    const head = tar.subarray(off, off + 512);
    if (head.every(b => b === 0)) break;
    const size = parseInt(str(off + 124, off + 136).trim() || '0', 8);
    const type = String.fromCharCode(head[156] || 48);
    const mode = parseInt(str(off + 100, off + 108).trim() || '644', 8);
    const prefix = str(off + 345, off + 500);
    let name = str(off, off + 100); if (prefix) name = prefix + '/' + name;
    const body = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = body.toString('utf8').replace(/\0.*$/s, ''); continue; }
    if (type === 'x') { const m = /\d+ path=([^\n]*)\n/.exec(body.toString('utf8')); paxPath = m ? m[1] : null; continue; }
    if (type === 'g') continue;
    name = paxPath || longName || name; paxPath = longName = null;
    const f = path.resolve(dest, name);
    if (!f.startsWith(path.resolve(dest) + path.sep)) continue;   // 不让压缩包往外写
    if (type === '5') { fs.mkdirSync(f, { recursive: true }); continue; }
    if (type !== '0' && type !== '\0') continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body, { mode: mode & 0o111 ? 0o755 : 0o644 });
  }
}

async function ensureNpm(registry) {
  const dir = path.join(DATA, 'npm', NPM_VERSION), cli = path.join(dir, 'package', 'bin', 'npm-cli.js');
  if (fs.existsSync(cli)) return cli;
  const res = await fetch(`${registry}/npm/-/npm-${NPM_VERSION}.tgz`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`下载 npm 失败：HTTP ${res.status}`);
  const tmp = dir + '.part';
  fs.rmSync(tmp, { recursive: true, force: true });
  untar(Buffer.from(await res.arrayBuffer()), tmp);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  if (!fs.existsSync(cli)) throw new Error('npm 解压出来不完整，再点一次试试');
  return cli;
}

// 安装脚本里会直接调用 node（比如 ffmpeg-static 下载 ffmpeg）。电脑上不一定有 node，就放一个叫 node 的小脚本，转给当前这个程序
function nodeShim() {
  const dir = path.join(DATA, 'node-shim');
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') fs.writeFileSync(path.join(dir, 'node.cmd'), `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" %*\r\n`);
  else fs.writeFileSync(path.join(dir, 'node'), `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`, { mode: 0o755 });
  return dir;
}

async function install(me) {
  me.step = '选下载线路';
  const registry = me.registry = await pickRegistry();
  me.step = '准备安装工具';
  const cli = await ensureNpm(registry);
  me.step = '下载视频工具（一百多 MB，网速一般要几分钟）';
  const env = {
    ...process.env, ELECTRON_RUN_AS_NODE: '1',
    PATH: nodeShim() + path.delimiter + (process.env.PATH || ''),
    npm_config_cache: path.join(DATA, 'npm-cache'), npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false',
    ...(registry === MIRROR ? { FFMPEG_BINARIES_URL: 'https://registry.npmmirror.com/-/binary/ffmpeg-static', WB_PIP_MIRROR: '1' } : {}),
  };
  await new Promise((ok, no) => {
    const ch = spawn(process.execPath, [cli, 'install', '--prefix', RT, '--registry', registry, '--no-audit', '--no-fund', '--loglevel', 'http'], { cwd: RT, env });
    const eat = d => { me.log = (me.log + d).slice(-6000); };
    ch.stdout.on('data', eat); ch.stderr.on('data', eat);
    ch.on('error', no);
    ch.on('close', code => code === 0 ? ok() : no(new Error(`安装没成功（${code}）：${me.log.split('\n').filter(l => /ERR|error/i.test(l)).slice(-2).join(' ').slice(0, 300) || me.log.slice(-300)}`)));
  });
  if (!installed()) throw new Error('装完了但没找到 hyperframes，再点一次试试');
}
