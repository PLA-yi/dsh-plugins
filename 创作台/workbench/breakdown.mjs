// 拉片：把一条别人的视频拆开看。给个链接（或者上传文件），工作台下载、找出每个镜头的切点、每个镜头截一帧、把口播转成文字，
// 再让 Claude Code 看着这些材料写出：开头怎么抓人、结构怎么排、每个镜头的画面和剪法、节奏数据、能学走的手法。
// 学到的手法可以存进「剪辑手法」库，以后新建视频时直接选。
// 每次拉片是一个文件夹「拉片-<平台>-<时间>」，和文章、视频放在同一层；.breakdown.json 记标题、来源、数据。
// 下载下来的视频只用来分析，不要搬进自己的成片。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import * as core from './core.mjs';
import * as ai from './ai.mjs';
import * as grab from './grab.mjs';
import * as video from './video.mjs';
import * as vagent from './vagent.mjs';

const RT = path.join(core.APP_DIR, 'video', 'runtime');
const META = '.breakdown.json', PREFIX = '拉片-';
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const ls = d => { try { return fs.readdirSync(d); } catch { return []; } };
const root = () => core.config().roots[0];
const env = (base = process.env) => ({ ...base, PATH: `${path.join(RT, 'bin')}:${path.join(RT, 'node_modules', '.bin')}:${base.PATH || ''}`, DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_TELEMETRY_DISABLED: '1' });
const sh = (cmd, args, opts = {}) => new Promise((ok, no) => execFile(cmd, args, { env: env(), timeout: 600000, maxBuffer: 64 * 1024 * 1024, ...opts }, (e, out, err) => e ? no(new Error(String(err || out || e.message).trim().slice(-300))) : ok({ out: String(out), err: String(err) })));
const pad = n => String(n).padStart(3, '0');
const hasCJK = s => /[一-鿿]/.test(String(s || ''));

/* ---------- 读写 ---------- */
export function dirOf(id) {
  const d = path.join(root(), path.basename(String(id || '')));
  if (!id || /^[._]/.test(path.basename(String(id))) || !exists(path.join(d, META))) throw Object.assign(new Error('没有这条拉片：' + id), { status: 404 });
  return d;
}
const readMeta = dir => readJson(path.join(dir, META), {});
function patchMeta(dir, fn) { const m = readMeta(dir); fn(m); fs.writeFileSync(path.join(dir, META), JSON.stringify(m, null, 2) + '\n'); return m; }
const JOBS = new Map();   // id → { running, stage, error, needWindow }
const jobState = id => { const j = JOBS.get(id); return j ? { running: j.running, stage: j.stage, error: j.error || '', needWindow: !!j.needWindow } : { running: false, stage: '', error: '' }; };
export const anyBusy = () => [...JOBS.values()].some(x => x.running);

// 节奏数据是算出来的，不靠 AI 估
function paceOf(dir, m) {
  const shots = readJson(path.join(dir, 'shots.json'), []), tr = readJson(path.join(dir, 'transcript.json'), null);
  const words = Array.isArray(tr) ? tr : tr?.words || [], sec = m.sec || 0;
  const chars = words.reduce((n, w) => n + [...String(w.text || '').replace(/[\s，。！？、,.!?]/g, '')].length, 0);
  const speak = words.length ? (words.at(-1).end || 0) - (words[0].start || 0) : 0;
  const first = shots.filter(s => s.start < 3).length;
  return { shots: shots.length, avgShot: shots.length ? +(sec / shots.length).toFixed(1) : 0, longest: +Math.max(0, ...shots.map(s => s.end - s.start)).toFixed(1), shortest: shots.length ? +Math.min(...shots.map(s => s.end - s.start)).toFixed(1) : 0,
    first3: first, perMin: speak > 3 ? Math.round(chars / speak * 60) : 0, unit: m.lang === 'en' ? '词' : '字', spoken: chars };
}
function summary(dir) {
  const m = readMeta(dir), id = path.basename(dir), an = readJson(path.join(dir, 'analysis.json'), null);
  return { id, title: m.title || id, platform: m.platform || '', platformName: grab.PLATFORM_NAMES[m.platform] || '', author: m.author || '', url: m.url || '', sec: m.sec || 0, stats: m.stats || {}, published: m.published || '', created: m.created,
    thumb: exists(path.join(dir, 'frames', '001.jpg')), done: !!an, summary: an?.summary || '', job: jobState(id) };
}
export function list() {
  return ls(root()).filter(n => !/^[._]/.test(n)).map(n => path.join(root(), n)).filter(d => exists(path.join(d, META))).map(summary).sort((a, b) => (b.created > a.created ? 1 : -1));
}
export function get(id) {
  const dir = dirOf(id), m = readMeta(dir), an = readJson(path.join(dir, 'analysis.json'), null);
  const shots = readJson(path.join(dir, 'shots.json'), []);
  // AI 写的每个镜头的说明，按镜头号并到切点数据上
  const notes = new Map((an?.shots || []).map(x => [+x.n, x]));
  const str = (x, n = 300) => String(x ?? '').slice(0, n);
  const saved = new Set(video.customStyles().map(x => x.name));
  return { ...summary(dir), dir, hasVideo: exists(path.join(dir, 'source.mp4')), width: m.width || 0, height: m.height || 0, lang: m.lang || 'zh', pace: paceOf(dir, m),
    shots: shots.map(s => { const x = notes.get(s.n) || {}; return { ...s, picture: str(x.picture), line: str(x.line), text: str(x.text), cut: str(x.cut), sound: str(x.sound) }; }),
    analysis: !an ? null : { summary: str(an.summary, 400), hook: an.hook ? { what: str(an.hook.what, 400), line: str(an.hook.line), sec: +an.hook.sec || 3 } : null,
      structure: (an.structure || []).filter(x => x && x.part).map(x => ({ start: +x.start || 0, end: +x.end || 0, part: str(x.part, 20), what: str(x.what) })),
      paceNote: str(an.paceNote, 400), techniques: (an.techniques || []).filter(x => x?.name && x.spec).map(x => ({ name: str(x.name, 20), note: str(x.note, 80), spec: str(x.spec, 1200), saved: saved.has(str(x.name, 20)) })),
      takeaways: (an.takeaways || []).map(x => str(x)).slice(0, 8), avoid: (an.avoid || []).map(x => str(x)).slice(0, 6) } };
}
export function remove(id) {
  const dir = dirOf(id);
  if (JOBS.get(id)?.running) throw new Error('这条还在处理，等它完成再删');
  fs.renameSync(dir, path.join(root(), `_已删除-${id}-${Date.now().toString(36)}`));
  return { ok: true };
}
export function fileOf(id, rel) {
  const dir = dirOf(id), f = path.resolve(dir, rel);
  if (!f.startsWith(dir + path.sep) || f.split(path.sep).some(s => s.startsWith('.'))) return null;
  return exists(f) && fs.statSync(f).isFile() ? f : null;
}

/* ---------- 新建 ---------- */
function newDir(platform) {
  const t = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(5, 16).replace(/[-:]/g, '').replace('T', '-');
  let name = `${PREFIX}${grab.PLATFORM_NAMES[platform] || '视频'}-${t}`.replace(/\s/g, ''), dir = path.join(root(), name);
  for (let i = 2; exists(dir); i++) dir = path.join(root(), `${name}-${i}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
// 粘贴链接来拉片
export function create({ text }) {
  const rt = video.runtime(); if (!rt.ok) throw new Error(rt.error);
  const url = grab.findUrl(text); if (!url) throw new Error('没看到链接：把视频的分享链接粘进来');
  const platform = grab.platformOf(url), dir = newDir(platform), id = path.basename(dir);
  fs.writeFileSync(path.join(dir, META), JSON.stringify({ type: 'breakdown', title: '正在读取…', platform, url, share: String(text).slice(0, 500), created: new Date().toISOString() }, null, 2) + '\n');
  start(id, dir, { download: true });
  return get(id);
}
// 上传本地视频来拉片（平台不让下的、自己录的都走这条）
export async function upload(req, name) {
  const rt = video.runtime(); if (!rt.ok) throw new Error(rt.error);
  const ext = path.extname(String(name || '')).toLowerCase().slice(1);
  if (!/^(mp4|mov|m4v|webm|mkv)$/.test(ext)) throw new Error('只收视频文件（mp4、mov、webm）');
  const dir = newDir('upload'), id = path.basename(dir), raw = path.join(dir, 'raw.' + ext);
  try {
    let size = 0;
    await new Promise((ok, no) => { const w = fs.createWriteStream(raw); req.on('data', d => { size += d.length; if (size > 3e9) { req.destroy(); no(new Error('文件超过 3 GB')); } }); req.pipe(w); w.on('finish', ok); w.on('error', no); req.on('error', no); });
    if (size < 5000) throw new Error('传上来的文件是空的');
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  fs.writeFileSync(path.join(dir, META), JSON.stringify({ type: 'breakdown', title: path.basename(String(name), path.extname(String(name))).slice(0, 80), platform: 'upload', url: '', raw: 'raw.' + ext, created: new Date().toISOString() }, null, 2) + '\n');
  start(id, dir, { download: false });
  return get(id);
}
// 重来：视频已经在了就只重做分析，不然从下载开始
export function retry(id) {
  const dir = dirOf(id), m = readMeta(dir);
  if (JOBS.get(id)?.running) throw Object.assign(new Error('还在处理'), { status: 409 });
  const have = exists(path.join(dir, 'source.mp4')) && exists(path.join(dir, 'shots.json'));
  start(id, dir, { download: !have && m.platform !== 'upload', onlyAnalysis: have });
  return get(id);
}

/* ---------- 处理流程 ---------- */
function start(id, dir, opts) {
  const st = { running: true, stage: '排队中', error: '', needWindow: false }; JOBS.set(id, st);
  (async () => {
    try {
      if (!opts.onlyAnalysis) await prepare(dir, opts, s => { st.stage = s; });
      st.stage = 'AI 正在拉片（通常 2–5 分钟）';
      await analyze(dir);
      st.stage = '好了';
    } catch (e) { st.error = e.message; st.needWindow = !!e.needWindow; }
    st.running = false;
  })();
}
async function prepare(dir, { download }, say) {
  let m = readMeta(dir), raw = path.join(dir, m.raw || 'raw.mp4');
  if (download) {
    const info = await grab.grab(m.share || m.url, raw, say);
    m = patchMeta(dir, x => { Object.assign(x, { title: info.title, author: info.author, url: info.url, platform: info.platform, stats: info.stats, published: info.published, description: info.description || '', raw: 'raw.mp4', lang: info.lang || '' }); });
  }
  if (!exists(raw)) throw new Error('视频文件不见了，重新来一次');
  say('转码');
  // 统一成 H.264，长边不超过 1280：浏览器能放，后面找镜头、截帧也快
  const src = path.join(dir, 'source.mp4');
  await sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', src], { timeout: 40 * 60000 });
  fs.rmSync(raw, { force: true });
  const info = JSON.parse((await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', src])).out);
  const vs = (info.streams || []).find(x => x.codec_type === 'video'), sec = +(+info.format?.duration || 0).toFixed(2);
  if (!vs || sec < 1) throw new Error('这个文件里没有能看的画面');
  if (sec > grab.MAX_MINUTES * 60) throw new Error(`这条视频有 ${Math.round(sec / 60)} 分钟，先只支持 ${grab.MAX_MINUTES} 分钟以内的`);
  // 语言：有中文标题就按中文转，不然按英文
  m = patchMeta(dir, x => { x.sec = sec; x.width = vs.width; x.height = vs.height; delete x.raw; x.lang = /^zh|^cmn|^yue/.test(x.lang || '') || hasCJK(x.title) || x.platform === 'douyin' || x.platform === 'bilibili' || x.platform === 'upload' ? 'zh' : 'en'; });

  say('找镜头切点');
  // 画面突然大变的地方就是切点；切得太碎（超过 150 个）就把门槛调高再找一遍
  let cuts = [];
  for (const th of [0.3, 0.42, 0.55]) {
    const r = await new Promise(ok => execFile('ffmpeg', ['-hide_banner', '-i', src, '-an', '-vf', `select='gt(scene,${th})',showinfo`, '-f', 'null', '-'], { env: env(), timeout: 30 * 60000, maxBuffer: 128 * 1024 * 1024 }, (e, so, se) => ok(String(se || ''))));
    cuts = [...r.matchAll(/pts_time:([\d.]+)/g)].map(x => +x[1]).filter(t => t > 0.3 && t < sec - 0.3);
    if (cuts.length <= 150) break;
  }
  const pts = [0]; for (const t of cuts) if (t - pts.at(-1) >= 0.4) pts.push(+t.toFixed(2));
  const shots = pts.map((a, i) => ({ n: i + 1, start: a, end: +(pts[i + 1] ?? sec).toFixed(2) }));

  say('截关键帧');
  // 每个镜头截中间一帧；镜头很长（口播常见）就每 5 秒多截一帧。总数不超过 60
  const fdir = path.join(dir, 'frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
  const want = [];
  for (const s of shots) { const d = s.end - s.start; want.push({ s, t: s.start + Math.min(d / 2, 1.2) }); for (let t = s.start + 5; t < s.end - 1.5; t += 5) want.push({ s, t, extra: true }); }
  let picked = want;
  if (picked.length > 60) picked = picked.filter(x => !x.extra);                                                        // 太多：先不要长镜头里多截的那些
  if (picked.length > 60) { const every = Math.ceil(picked.length / 60); picked = picked.filter((x, i) => i % every === 0); }   // 还多：隔几个镜头截一帧
  let k = 0;
  for (const w of picked) {
    const name = `${pad(++k)}.jpg`;
    try { await sh('ffmpeg', ['-y', '-loglevel', 'error', '-ss', w.t.toFixed(2), '-i', src, '-frames:v', '1', '-vf', "scale='if(gt(iw,ih),480,-2)':'if(gt(iw,ih),-2,480)'", '-q:v', '5', path.join(fdir, name)], { timeout: 60000 }); } catch { continue; }
    if (!w.s.frame) w.s.frame = 'frames/' + name; (w.s.frames ||= []).push({ t: +w.t.toFixed(2), file: 'frames/' + name });
  }
  fs.writeFileSync(path.join(dir, 'shots.json'), JSON.stringify(shots, null, 1));

  say('把口播转成文字（第一次要下载语音模型，会久一些）');
  fs.rmSync(path.join(dir, 'transcript.json'), { force: true });
  try { await sh('hyperframes', ['transcribe', 'source.mp4', '-e', 'whisper', '-m', 'small', '-l', m.lang === 'en' ? 'en' : 'zh'], { cwd: dir, timeout: 90 * 60000 }); } catch {}
  // 给 AI 看的口播稿：一句一行，带时间
  const tr = readJson(path.join(dir, 'transcript.json'), null), words = Array.isArray(tr) ? tr : tr?.words || [];
  const lines = []; let cur = null;
  for (const w of words) {
    const t = String(w.text || ''); if (!t.trim()) continue;
    if (!cur || w.start - cur.end > 0.6 || cur.text.length > 26) { if (cur) lines.push(cur); cur = { start: w.start, end: w.end, text: '' }; }
    cur.text += (m.lang === 'en' && cur.text && !/^[,.!?;:']/.test(t) ? ' ' : '') + t; cur.end = w.end;
    if (/[。！？.!?]$/.test(t)) { lines.push(cur); cur = null; }
  }
  if (cur) lines.push(cur);
  fs.writeFileSync(path.join(dir, 'lines.txt'), lines.length ? lines.map(l => `[${l.start.toFixed(1)}–${l.end.toFixed(1)}] ${l.text.trim()}`).join('\n') + '\n' : '（这条视频没有识别出说话内容）\n');
}

// 让 Claude Code 看着截帧、口播稿、切点表写分析。它只能读这个文件夹、写 analysis.json
const BRIEF = m => `# 拉片

这个文件夹里是一条别人的视频，作者（「AI 产品小易」，做 AI 产品拆解和科普的短视频）想学它是怎么做的。你来拉片：看材料，写出一份能直接拿来用的分析。

## 这条视频

- 标题：${m.title}
- 来源：${grab.PLATFORM_NAMES[m.platform] || ''}${m.author ? `，作者 ${m.author}` : ''}${m.published ? `，发布于 ${m.published.slice(0, 10)}` : ''}
- 时长 ${m.sec} 秒，画面 ${m.width}×${m.height}
- 数据：${Object.entries({ 播放: m.stats?.views, 点赞: m.stats?.likes, 评论: m.stats?.comments, 收藏: m.stats?.saves, 转发: m.stats?.shares }).filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join('，') || '没有拿到'}

## 材料

- \`shots.json\`：每个镜头的编号 n、起止秒数，和这个镜头的截帧（frames 里每张图带时间 t）
- \`frames/\`：截帧图片。**每一张都要用 Read 看**，画面、屏上的字、构图、花字样式只能从图里看出来
- \`lines.txt\`：口播稿，一句一行带时间。机器听写的，会有错字${m.lang === 'en' ? '；原视频是英文的，分析用中文写，引用原话时保留英文并附一句中文意思' : '，可能是繁体，引用时改成简体并把明显的错字改对'}
- 你看不到视频本身，也听不到声音：转场只能根据前后两帧的差别判断；音乐和音效听不到，\`sound\` 一栏只写能从口播节奏、画面推断出来的，推断不出来就留空，不要编

## 要写的东西

写一个文件 \`analysis.json\`，只写这一个文件，格式：

\`\`\`json
{
  "summary": "两三句话：这条视频讲了什么，它靠什么让人看下去",
  "hook": { "sec": 3, "line": "开头那句原话", "what": "前几秒具体用了什么办法抓人（画面 + 话术），为什么有效" },
  "structure": [ { "start": 0, "end": 3.2, "part": "钩子", "what": "这一段在干什么" } ],
  "shots": [ { "n": 1, "picture": "画面里是什么、怎么构图", "line": "这个镜头里说的话（原话，可截短）", "text": "屏上出现的字、花字、字幕样式", "cut": "这个镜头怎么接上一个的：硬切、推近、画中画、切到录屏……", "sound": "" } ],
  "paceNote": "节奏上的特点：哪里快哪里慢、信息密度、多久换一次画面",
  "techniques": [ { "name": "手法名字，8 个字以内", "note": "一句话说它是什么", "spec": "具体怎么做，写成别人照着就能剪出来的做法：什么时候用、画面怎么摆、字多大放哪、持续多久。80–200 字" } ],
  "takeaways": [ "作者可以直接借鉴的点，一条一句，要具体" ],
  "avoid": [ "不适合照搬的地方和原因" ]
}
\`\`\`

要求：

- \`shots\` 要覆盖 shots.json 里的每一个镜头，n 对上。镜头超过 60 个时，只写最有代表性的 40 个
- \`structure\` 把全片切成 3–7 段（钩子、铺垫、展开、转折、收尾、引导互动这类），时间首尾相接，覆盖全片
- \`techniques\` 写 3–6 个这条视频里真正用了、而且值得学的剪辑和包装手法。不要写「内容要有价值」这种空话；\`spec\` 是之后要交给另一个 AI 照着剪的，写清楚到能执行
- 只写看得到、读得到的。数字（时长、镜头数）以材料为准，不要估
- 用中文，大白话
`;
async function analyze(dir) {
  const m = readMeta(dir);
  const eng = video.engine(); if (!eng) throw new Error(ai.ccBin() ? 'Claude Code 还没登录：到「AI 设置」里点「登录」' : '没有能用的 AI：装好 Claude Code 并登录，或者在 DeepSeek Harness 里配好模型');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), BRIEF(m));
  fs.rmSync(path.join(dir, 'analysis.json'), { force: true });
  if (eng === 'api') {
    // 没有 Claude Code：用模型接口，只能读这个文件夹、只能写 analysis.json
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20 * 60000);
    try {
      await vagent.runAgent({
        dir, signal: ctrl.signal, commands: false, maxRounds: 120, canWrite: rel => rel === 'analysis.json',
        system: '你在「小易工作台」里做拉片。严格按下面的要求做，只读这个文件夹里的材料，只写 analysis.json。工具：read_file（读文件、看截帧图片）、list_files、write_file。下面说的「用 Read 看」就是用 read_file 看。\n\n' + BRIEF(m),
        prompt: '按要求给这条视频拉片：先读 shots.json 和 lines.txt，再把 frames/ 里的截帧一张张看过，然后写 analysis.json。写完回一句「好了」。',
        step: () => {}, onText: () => {},
      });
    } finally { clearTimeout(timer); }
    const an = readJson(path.join(dir, 'analysis.json'), null);
    if (!an || !an.summary) throw new Error('AI 没写出分析，点「重新分析」再试一次');
    return;
  }
  const bin = ai.ccBin();
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--no-session-persistence', '--permission-mode', 'acceptEdits',
    '--append-system-prompt', '你在「小易工作台」里做拉片。严格按这个文件夹里 CLAUDE.md 的要求做，只读这个文件夹里的材料，只写 analysis.json。', '--allowedTools', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(ls:*)', 'Bash(cat:*)'];
  await new Promise((ok, no) => {
    const ch = spawn(bin, args, { cwd: dir, env: env(ai.ccEnv()) });
    let buf = '', err = '', result = null, isErr = false;
    const line = l => { let j; try { j = JSON.parse(l); } catch { return; } if (j.type === 'result') { result = j.result; isErr = !!j.is_error; } };
    ch.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    ch.stderr.on('data', d => { err = (err + d).slice(-2000); });
    ch.on('error', e => no(new Error('Claude Code 没能启动：' + e.message)));
    ch.on('close', code => { if (buf.trim()) line(buf); (isErr || (code !== 0 && result == null)) ? no(ai.ccError(String(result || err))) : ok(); });
    ch.stdin.end('按 CLAUDE.md 的要求给这条视频拉片：先读 shots.json 和 lines.txt，再把 frames/ 里的截帧一张张看过，然后写 analysis.json。写完回一句「好了」。');
    setTimeout(() => { try { ch.kill(); } catch {} }, 20 * 60000);
  });
  const an = readJson(path.join(dir, 'analysis.json'), null);
  if (!an || !an.summary) throw new Error('AI 没写出分析，点「重新分析」再试一次');
}

// 把拉片里的一个手法存进「剪辑手法」库
export function saveTechnique(id, index) {
  const dir = dirOf(id), m = readMeta(dir), an = readJson(path.join(dir, 'analysis.json'), null), t = an?.techniques?.[index];
  if (!t) throw new Error('没有这个手法');
  return video.saveStyle({ name: t.name, note: t.note, spec: t.spec, from: `${grab.PLATFORM_NAMES[m.platform] || ''}《${String(m.title).slice(0, 24)}》` });
}
export const openDouyinWindow = () => grab.openDouyinWindow();
