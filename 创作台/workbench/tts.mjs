// 配音：把一段文字合成成 mp3。给视频板块用。
// 付费服务走「OpenAI 兼容的语音接口」（POST <地址>/audio/speech）：OpenAI、硅基流动等都是这个格式，换服务只换地址、模型和音色。
// 没配密钥时用电脑自带的语音（macOS 的 say），免费但机械，只适合先听个节奏。
// 密钥存在 data/tts.json（权限 600），不进仓库；网页上只显示头尾。
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { APP_DIR, DATA_DIR } from './core.mjs';

const FILE = path.join(DATA_DIR, 'tts.json');
// 预设：选了就填好地址、模型和默认音色，都可以再改
export const PRESETS = [
  { id: 'siliconflow', name: '硅基流动 · CosyVoice2', baseUrl: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'FunAudioLLM/CosyVoice2-0.5B:anna', note: '国内服务，中文自然，按字数计费，价格低', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'openai', name: 'OpenAI · gpt-4o-mini-tts', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', voice: 'alloy', note: '海外服务，要能访问 OpenAI', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'custom', name: '其他兼容接口', baseUrl: '', model: '', voice: '', note: '任何支持 /audio/speech 的服务：自己填地址、模型和音色' },
  { id: 'say', name: '电脑自带语音（免费）', baseUrl: '', model: '', voice: 'Tingting', note: '不花钱，声音机械，先听节奏用' },
];
const readRaw = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } };
export function config() {
  const c = readRaw(), pre = PRESETS.find(p => p.id === c.preset) || PRESETS[3];
  return { preset: pre.id, baseUrl: c.baseUrl ?? pre.baseUrl, model: c.model ?? pre.model, voice: c.voice ?? pre.voice, speed: +c.speed || 1, key: c.key || '' };
}
// 给网页看的：密钥只露头尾
export function publicConfig() {
  const c = config(), k = c.key;
  return { ...c, key: undefined, keyMask: k ? k.slice(0, 4) + '…' + k.slice(-4) : '', paid: c.preset !== 'say', ready: c.preset === 'say' || !!(k && c.baseUrl && c.model), presets: PRESETS };
}
export function save(patch) {
  const c = readRaw();
  if (patch.preset && PRESETS.some(p => p.id === patch.preset)) {
    // 换了服务：地址、模型、音色回到那家的默认，除非这次一起给了
    if (patch.preset !== c.preset) { delete c.baseUrl; delete c.model; delete c.voice; }
    c.preset = patch.preset;
  }
  for (const k of ['baseUrl', 'model', 'voice']) if (typeof patch[k] === 'string') c[k] = patch[k].trim().replace(/\/+$/, '');
  if (patch.speed != null) c.speed = Math.min(2, Math.max(0.5, +patch.speed || 1));
  if (typeof patch.key === 'string' && patch.key.trim()) c.key = patch.key.trim();
  if (patch.clearKey) delete c.key;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 }); fs.chmodSync(FILE, 0o600);
  return publicConfig();
}

const run = (cmd, args, opts = {}) => new Promise((ok, no) => execFile(cmd, args, { timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...opts }, (e, out, err) => e ? no(new Error(String(err || e.message).trim().slice(-300))) : ok(out)));
function errorOf(status, text) {
  let m = ''; try { const j = JSON.parse(text); m = j.error?.message || j.message || j.error || ''; } catch { m = text; }
  m = String(m || '').slice(0, 160);
  if (status === 401 || status === 403) return `配音服务不认这个密钥（${status}）${m ? '：' + m : ''}`;
  if (status === 402 || /balance|insufficient|quota|余额/i.test(m)) return `配音服务的余额不够了${m ? '：' + m : ''}`;
  if (status === 404) return `配音接口地址或模型名不对（404）${m ? '：' + m : ''}`;
  if (status === 429) return '配音请求太频繁（429），过一会再试';
  return `配音服务出错（${status}）${m ? '：' + m : ''}`;
}
// 把 text 合成到 file（mp3）。env 里要有 ffmpeg（自带语音要转格式）
export async function synth(text, file, { env } = {}) {
  const c = config(); text = String(text || '').trim();
  if (!text) throw new Error('这段没有旁白文字');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (c.preset === 'say') {
    if (process.platform !== 'darwin') throw new Error('电脑自带语音只在 Mac 上有，换一个配音服务');
    const tmp = file.replace(/\.mp3$/, '') + '.aiff';
    await run('say', ['-v', c.voice || 'Tingting', '-r', String(Math.round(190 * c.speed)), '-o', tmp, text]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ar', '44100', '-ac', '1', '-b:a', '128k', file], { env });
    fs.rmSync(tmp, { force: true });
    return file;
  }
  if (!c.key) throw new Error('还没填配音服务的密钥：点「配音设置」填一下');
  if (!c.baseUrl || !c.model) throw new Error('配音设置里的接口地址或模型没填');
  const r = await fetch(c.baseUrl + '/audio/speech', { method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: c.model, input: text, voice: c.voice, response_format: 'mp3', speed: c.speed }) });
  if (!r.ok) throw new Error(errorOf(r.status, await r.text().catch(() => '')));
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 800) throw new Error('配音服务返回的音频是空的，检查模型和音色写得对不对');
  fs.writeFileSync(file, buf);
  return file;
}
