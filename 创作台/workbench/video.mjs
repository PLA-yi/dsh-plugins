// 视频板块：让 Claude Code 写代码，把一篇文章做成视频。
// 用的是开源的 HyperFrames（写 HTML，渲染成 MP4）。每条视频是一个文件夹「视频-<名字>」，和文章、卡片放在同一层；
// 里面是一个 HyperFrames 项目，外加 .video.json（标题、来源文章、形态、画幅、对话记录、导出记录）。
// 两种形态：explain 图文动画解读（AI 写旁白和画面，配音由工作台合成）；talk 口播剪辑（作者传口播、录屏、图片，AI 先出剪辑方案，再剪掉停顿口误、配字幕和画面）。
// 剪辑手法（STYLES）：快切、推近、花字、画中画……新建时选，写进给 AI 的说明里；拉片学到的手法存在 data/video-styles.json。
// 依赖装在 video/runtime（HyperFrames、ffmpeg、ffprobe、编译 whisper 用的 cmake），不动系统。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import * as core from './core.mjs';
import * as ai from './ai.mjs';
import * as tts from './tts.mjs';
import * as vagent from './vagent.mjs';

const RT = path.join(core.APP_DIR, 'video', 'runtime');
const RT_BIN = path.join(RT, 'bin');
export const HF_DIST = path.join(RT, 'node_modules', 'hyperframes', 'dist');
const META = '.video.json', PREFIX = '视频-';
export const ASPECTS = { portrait: { name: '竖屏 9:16', w: 1080, h: 1920, fit: '抖音、视频号、小红书' }, landscape: { name: '横屏 16:9', w: 1920, h: 1080, fit: 'B 站、YouTube、公众号' } };
export const MODES = { explain: { name: '图文动画解读', note: 'AI 写旁白、做画面，不用出镜' }, talk: { name: '口播剪辑', note: '你传口播和素材，AI 剪掉废话、配字幕和画面' } };

// 剪辑手法：每种手法一段给 AI 的具体做法。新建时选，之后可以在视频页里改
export const STYLES = [
  { id: 'jumpcut', name: '去停顿快切', note: '剪掉停顿、口误和重复的几遍，节奏紧凑', spec: '口播里超过 0.4 秒的停顿、嗯啊这类语气词、说错重来的半句、重复说的整句都剪掉；同一句说了几遍，留最顺的一遍。剪完每句之间只留 0.1 秒左右的气口。' },
  { id: 'punch', name: '推近强调', note: '剪接处和重点句轻微推近，跳切不生硬', spec: '每个剪接点之后，把人像画面的缩放在 1.0 和 1.12 之间交替（瞬间切换，不要缓动），让跳切看起来像换了机位；说到重点句时用 0.3 秒缓慢推到 1.15 再回落。缩放以人脸所在的上三分之一处为中心。' },
  { id: 'captions', name: '逐句大字幕', note: '一句一行的大字幕，关键词变色', spec: '字幕按语义断成 6–14 个字的短句，一次只显示一行，跟着说话出现；每句里最关键的一个词换成强调色并略微放大；字幕带半透明底或描边，压在任何画面上都看得清。' },
  { id: 'keyword', name: '花字关键词', note: '说到数字、产品名、结论时弹出大字', spec: '说到关键数字、产品名、结论的那一刻，在画面空处弹出大字（竖屏 96px 以上），用弹性缩放进场，停留 1.5–3 秒后退场；同一时刻最多一个，不要挡脸。' },
  { id: 'broll', name: '插入配图和录屏', note: '讲到对应内容时切到配图、录屏，声音不断', spec: '说到具体产品、界面、数据的地方，画面切到对应的配图或录屏素材（铺满，或带圆角边框居中），口播声音继续；每段 2–5 秒，然后切回人像。素材对不上就不要硬插。' },
  { id: 'pip', name: '画中画', note: '录屏或配图铺满，人像缩到角落', spec: '演示类内容用画中画：录屏或配图铺满画面，人像缩成圆角小窗，放在不挡内容的角落（竖屏放左下或右下，宽度约 30%）；回到表达观点时切回人像全屏。' },
  { id: 'split', name: '分屏对比', note: '两样东西并排对比', spec: '出现对比（前后、两个产品、两种做法）时用分屏：竖屏上下分、横屏左右分，中间一条分隔线，各自带小标题；两边同时进场，差异处用强调色标出。' },
  { id: 'chapters', name: '章节进度条', note: '顶部进度条和小标题，告诉观众讲到哪了', spec: '画面顶部安全区内放一条分段进度条，段数等于内容的小节数，当前小节高亮并显示 4–8 个字的小标题；每进入新的小节，小标题切换一次。' },
  { id: 'sfx', name: '音效点', note: '弹字、转场时加轻音效', spec: '大字弹出、切换小节、画面切到配图时加一个很短的音效（whoosh、pop、click 这类），音量压到口播的三分之一以下。音效只用 /media-use 技能里自带的素材，不要引用网上的。整片不超过 12 个。' },
];
const DEFAULT_STYLES = { talk: ['jumpcut', 'punch', 'captions', 'keyword'], explain: ['captions'] };
const STYLE_FILE = path.join(core.APP_DIR, 'data', 'video-styles.json');
// 自己攒的手法（拉片时存下来的）
export function customStyles() { try { const j = JSON.parse(fs.readFileSync(STYLE_FILE, 'utf8')); return Array.isArray(j) ? j.filter(x => x?.id && x.name && x.spec) : []; } catch { return []; } }
export const allStyles = () => [...STYLES, ...customStyles().map(x => ({ ...x, custom: true }))];
export function saveStyle({ name, note = '', spec, from = '' }) {
  name = String(name || '').trim().slice(0, 20); spec = String(spec || '').trim().slice(0, 1200);
  if (!name || spec.length < 10) throw new Error('手法要有名字和具体做法');
  const l = customStyles().filter(x => x.name !== name), it = { id: 'u-' + crypto.createHash('sha1').update(name).digest('hex').slice(0, 8), name, note: String(note).trim().slice(0, 60), spec, from: String(from).slice(0, 80), t: new Date().toISOString() };
  fs.mkdirSync(path.dirname(STYLE_FILE), { recursive: true }); fs.writeFileSync(STYLE_FILE, JSON.stringify([...l, it], null, 2) + '\n');
  return it;
}
export function removeStyle(id) { const l = customStyles().filter(x => x.id !== id); fs.writeFileSync(STYLE_FILE, JSON.stringify(l, null, 2) + '\n'); return { ok: true }; }

const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const mtime = p => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const ls = d => { try { return fs.readdirSync(d); } catch { return []; } };
const root = () => core.config().roots[0];

/* ---------- 运行环境 ---------- */
// ffmpeg / ffprobe / cmake 链到 video/runtime/bin，跑命令时把这个目录放到 PATH 最前
export function runtime() {
  const hf = path.join(RT, 'node_modules', '.bin', 'hyperframes');
  if (!exists(hf)) return { ok: false, missing: true, error: '视频要用的工具还没装（HyperFrames、ffmpeg），点「一键装好」就行，装一次以后都能用' };
  fs.mkdirSync(RT_BIN, { recursive: true });
  const link = (name, target) => { const f = path.join(RT_BIN, name); if (target && exists(target) && !exists(f)) { try { fs.symlinkSync(target, f); } catch {} } };
  link('ffmpeg', path.join(RT, 'node_modules', 'ffmpeg-static', 'ffmpeg'));
  const probeDir = path.join(RT, 'node_modules', '@ffprobe-installer');
  link('ffprobe', ls(probeDir).filter(n => n !== 'ffprobe').map(n => path.join(probeDir, n, 'ffprobe')).find(exists));
  link('cmake', path.join(RT, 'py', 'bin', 'cmake'));
  if (!exists(path.join(RT_BIN, 'ffmpeg')) || !exists(path.join(RT_BIN, 'ffprobe'))) return { ok: false, error: '没找到 ffmpeg / ffprobe：在工作台文件夹里重新运行 npm install --prefix video/runtime' };
  return { ok: true, hf };
}
const env = (base = process.env) => ({ ...base, PATH: `${RT_BIN}:${path.join(RT, 'node_modules', '.bin')}:${base.PATH || ''}`, DO_NOT_TRACK: '1', HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_TELEMETRY_DISABLED: '1' });
const sh = (cmd, args, opts = {}) => new Promise((ok, no) => execFile(cmd, args, { env: env(), timeout: 180000, maxBuffer: 16 * 1024 * 1024, ...opts }, (e, out, err) => e ? no(new Error(String(err || out || e.message).trim().slice(-400))) : ok(String(out))));
async function mediaSeconds(file) { try { return +(+(await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).trim()).toFixed(2) || 0; } catch { return 0; } }

/* ---------- 读写 ---------- */
export function dirOf(id) {
  const d = path.join(root(), path.basename(String(id || '')));
  if (!id || /^[._]/.test(path.basename(String(id))) || !exists(path.join(d, META))) throw Object.assign(new Error('没有这条视频：' + id), { status: 404 });
  return d;
}
const readMeta = dir => readJson(path.join(dir, META), {});
function patchMeta(dir, fn) { const m = readMeta(dir); fn(m); fs.writeFileSync(path.join(dir, META), JSON.stringify(m, null, 2) + '\n'); return m; }
const narration = dir => { const j = readJson(path.join(dir, 'narration.json'), null); return Array.isArray(j?.scenes) ? j.scenes.filter(s => s && s.id && typeof s.text === 'string') : []; };
// 口播剪辑的素材清单：clips.json（工作台写，AI 只读）
const readClips = dir => { const j = readJson(path.join(dir, 'clips.json'), null); return Array.isArray(j?.clips) ? j.clips.filter(c => c?.id && exists(path.join(dir, c.file))) : []; };
const writeClips = (dir, clips) => fs.writeFileSync(path.join(dir, 'clips.json'), JSON.stringify({ clips }, null, 2) + '\n');
// AI 写的剪辑方案：edit-plan.json
function readPlan(dir) {
  const j = readJson(path.join(dir, 'edit-plan.json'), null); if (!j || !Array.isArray(j.segments)) return null;
  const n = v => +(+v || 0).toFixed(2), seg = x => ({ clip: String(x.clip || ''), in: n(x.in), out: n(x.out), say: String(x.say || '').slice(0, 200), note: String(x.note || x.why || '').slice(0, 200) });
  const segments = j.segments.filter(x => x && x.clip).map(seg), removed = (Array.isArray(j.removed) ? j.removed : []).filter(x => x && x.clip).map(seg);
  return { segments, removed, total: n(segments.reduce((a, x) => a + Math.max(0, x.out - x.in), 0)), cut: n(removed.reduce((a, x) => a + Math.max(0, x.out - x.in), 0)), t: mtime(path.join(dir, 'edit-plan.json')) };
}
function posterOf(dir) { const d = path.join(dir, '.poster'); const f = ls(d).filter(n => /\.(png|jpe?g)$/i.test(n) && !/contact/.test(n)).sort()[0]; return f ? path.join(d, f) : null; }
// 画面总长：index.html 根元素上写的 data-duration
function durationOf(dir) { const m = read(path.join(dir, 'index.html')).match(/data-composition-id="[^"]*"[^>]*data-duration="([\d.]+)"|data-duration="([\d.]+)"[^>]*data-composition-id=/); return m ? +(m[1] || m[2]) : 0; }

function summary(dir) {
  const m = readMeta(dir), id = path.basename(dir);
  const renders = (m.renders || []).filter(r => exists(path.join(dir, r.file)));
  return { id, title: m.title || id.replace(PREFIX, ''), mode: m.mode, modeName: MODES[m.mode]?.name || '', aspect: m.aspect, aspectName: ASPECTS[m.aspect]?.name || '',
    from: m.from || '', fromTitle: m.fromTitle || '', created: m.created, updated: new Date(Math.max(mtime(path.join(dir, 'index.html')), mtime(path.join(dir, META)))).toISOString(),
    sec: durationOf(dir), started: (m.chat || []).length > 0, renders, poster: posterOf(dir) ? mtime(posterOf(dir)) : 0, busy: !!RUNS.get(id)?.running || !!RENDERS.get(id)?.running };
}
export function list() {
  return ls(root()).filter(n => !/^[._]/.test(n)).map(n => path.join(root(), n)).filter(d => exists(path.join(d, META))).map(summary).sort((a, b) => (b.updated > a.updated ? 1 : -1));
}
export function get(id) {
  const dir = dirOf(id), m = readMeta(dir);
  const scenes = narration(dir);
  const clips = readClips(dir).map(c => ({ id: c.id, name: c.name, kind: c.kind, file: c.file, sec: c.sec || 0, width: c.width, height: c.height, text: c.text || '', hasTranscript: !!c.transcript, silence: +(c.silences || []).reduce((a, x) => a + (x[1] - x[0]), 0).toFixed(1) }));
  return { ...summary(dir), dir, chat: m.chat || [], scenes, voiceChars: scenes.reduce((n, s) => n + [...s.text].length, 0), voiced: scenes.filter(s => s.audio && exists(path.join(dir, s.audio))).length,
    clips, plan: readPlan(dir), styles: m.styles || [], styleList: allStyles().map(({ id, name, note, custom, from }) => ({ id, name, note, custom: !!custom, from: from || '' })), rev: mtime(path.join(dir, 'index.html')),
    run: runState(id), render: renderState(id), voice: voiceState(id), prep: prepState(id), tts: tts.publicConfig(), cc: ai.ccStatus(), engine: engine() };
}

/* ---------- 新建 ---------- */
// 把来源文章的正文、配图、样式拷一份进视频文件夹（source/），Claude Code 只在这个文件夹里干活，不碰原文章
function syncSource(dir, m) {
  if (!m.from) return;
  const p = core.list().find(x => x.id === m.from); if (!p) return;
  const src = path.join(dir, 'source'); fs.mkdirSync(src, { recursive: true });
  for (const f of ['article.md', 'theme.css']) if (exists(path.join(p.dir, f))) fs.copyFileSync(path.join(p.dir, f), path.join(src, f));
  const img = path.join(p.dir, 'img');
  for (const f of ls(img)) {
    const s = path.join(img, f); let st; try { st = fs.statSync(s); } catch { continue; }
    if (!st.isFile() || !/\.(png|jpe?g|gif|webp|svg)$/i.test(f) || st.size > 12 * 1024 * 1024) continue;
    const d = path.join(src, 'img', f);
    if (mtime(d) < st.mtimeMs) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
  }
}
const starter = (title, a) => `<!doctype html>
<html lang="zh-CN" data-resolution="${a.w > a.h ? 'landscape' : 'portrait'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${a.w}, height=${a.h}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      /* 中文字体用这台电脑装好的那份。这几行声明要留着：没有它们检查会报「字体没有声明」 */
      @font-face { font-family: "PingFang SC"; font-weight: 100 450; src: local("PingFangSC-Regular"), local("PingFang SC"); }
      @font-face { font-family: "PingFang SC"; font-weight: 451 599; src: local("PingFangSC-Medium"); }
      @font-face { font-family: "PingFang SC"; font-weight: 600 900; src: local("PingFangSC-Semibold"); }
      @font-face { font-family: "Noto Sans SC"; font-weight: 100 450; src: local("NotoSansSC-Regular"), local("Noto Sans SC"); }
      @font-face { font-family: "Noto Sans SC"; font-weight: 451 900; src: local("NotoSansSC-Bold"), local("Noto Sans SC Bold"); }
      @font-face { font-family: "Microsoft YaHei"; font-weight: 100 450; src: local("Microsoft YaHei"); }
      @font-face { font-family: "Microsoft YaHei"; font-weight: 451 900; src: local("Microsoft YaHei Bold"); }
      :root { --ground: #101014; --ink: #ffffff; --font: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${a.w}px; height: ${a.h}px; overflow: hidden; background: var(--ground); }
      #root { position: relative; width: 100%; height: 100%; font-family: var(--font); color: var(--ink); }
      .clip { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      #title { font-size: ${a.w > a.h ? 88 : 84}px; font-weight: 700; padding: 0 ${a.w > a.h ? 160 : 90}px; text-align: center; line-height: 1.3; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="5" data-width="${a.w}" data-height="${a.h}">
      <h1 id="title" class="clip" data-start="0" data-duration="5" data-track-index="0">${title.replace(/[<&]/g, '')}</h1>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#title", { opacity: 0.2, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0);
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
// 说明里的「剪辑手法」一节：作者选了哪些，每个具体怎么做
function styleSection(m) {
  const picked = allStyles().filter(x => (m.styles || []).includes(x.id));
  if (!picked.length) return '## 剪辑手法\n\n作者没有指定手法。按内容自己判断，保持克制，不要为了热闹堆效果。\n';
  return `## 这条视频用的剪辑手法\n\n作者选了下面这些，成片里都要用上；没选的不要擅自加。\n\n${picked.map(x => `- **${x.name}**：${x.spec}`).join('\n')}\n`;
}
// 写给 Claude Code 的说明：放在视频文件夹里的 CLAUDE.md，它每次开工都会读
function guide(m) {
  const a = ASPECTS[m.aspect], portrait = a.h > a.w, talk = m.mode === 'talk';
  return `# 小易工作台里的一条视频

你在帮「AI 产品小易」做一条短视频。作者不懂代码，只看成片和你的回复。**用中文回复，说人话，每次回复控制在几句话**：做了什么、现在是什么样、接下来要作者做什么。配音、导出这些都是工作台上的按钮：作者点「生成配音」后，工作台会自动把结果告诉你，不用让作者再来转告。不要贴代码，不要讲技术细节。

## 这条视频

- 标题：${m.title}
- 形态：${MODES[m.mode].name}
- 画幅：${a.name}，${a.w}×${a.h}，常发在${a.fit}
${m.from ? `- 来源文章：\`source/article.md\`（文章的配图在 \`source/img/\`，配色和气质可以参考 \`source/theme.css\`）。这是拷过来的副本，只读，不要改。` : '- 没有绑定文章，按作者在对话里说的做。'}

## 用什么做

HyperFrames：写 HTML，逐帧渲染成视频。**动手前先读 \`/hyperframes\` 技能**，里面有必须遵守的写法（时间轴怎么注册、哪些属性能动、怎么检查）。

命令直接用 \`hyperframes …\`（已经装好、在 PATH 里；不要用 npx 去下载别的版本）：

- \`hyperframes check\`：每次改完都跑，报错全部改掉
- \`hyperframes snapshot --at 1,6,12\`：截几帧出来，用 Read 看图确认版式没问题，再告诉作者做好了

**不要运行** render、preview、publish、share、cloud、tts、transcribe：导出成片、配音、转字幕都由工作台的按钮来做。也不要装别的依赖。

## 文件约定（工作台按这些名字找文件，不要改名）

- \`index.html\`：主画面，根元素的 \`data-composition-id\` 保持 \`main\`，\`data-duration\` 写全片总时长
- \`narration.json\`：旁白稿，格式 \`{"scenes":[{"id":"s1","text":"要说出口的话"}]}\`。id 用 s1、s2……；工作台合成配音后会给每段补上 \`sec\`（秒）和 \`audio\`（文件路径）
- \`assets/voice/<id>.mp3\`：工作台合成的配音，不要自己造
- \`assets/\`：你用到的图片等素材。文章配图要用的话，从 \`source/img/\` 拷到 \`assets/\` 再引用
- \`clips.json\`：作者上传的素材清单（工作台写，你只读）。每个素材有编号 id、类型 kind（video / audio / image）、文件 file、时长 sec、宽高、逐字时间轴 transcript（\`transcripts/c1.json\`）、检测到的停顿 silences（\`[[开始秒, 结束秒], …]\`）
- \`edit-plan.json\`：你写的剪辑方案，工作台会把它展示给作者看
- 所有素材都用本地文件，不要引用网上的图片和字体

${talk ? `## 口播剪辑怎么做

作者上传了一段或几段素材：口播录像、录音、录屏、图片。你的活是把它们剪成一条能直接发的成片：剪掉废话，排好顺序，配上字幕和画面。

1. \`clips.json\` 里没有素材时，先告诉作者：到左边「素材」里上传，等工作台处理完再回来。不要自己编内容。
2. **先出剪辑方案，不要直接动手剪。** 读每段口播的逐字时间轴（它是机器听写的，常有错字，还可能是繁体${m.from ? '；来源文章就是口播稿，以它为准' : ''}），定下成片保留哪些片段、什么顺序、哪里插配图或录屏。写进 \`edit-plan.json\`：
   \`{"segments":[{"clip":"c1","in":1.25,"out":8.4,"say":"这段说了什么","note":"怎么处理"}],"removed":[{"clip":"c1","in":8.4,"out":11.2,"say":"被剪掉的话","note":"口误重说"}]}\`
   segments 按成片里的先后排；in、out 是片段在素材里的起止秒数。removed 只记值得告诉作者的（口误、重复、跑题），零碎的停顿不用一条条记。
   然后用几句话告诉作者：成片大概多长，剪掉了什么（停顿一共多少秒、哪几处口误或重复），顺序有没有调，哪里会插画面。最后问一句「按这个剪可以吗？」。作者一开始就说了「直接剪」「不用问我」，就跳过确认。
3. **作者同意后再剪。** 按方案把片段依次排上时间轴。每个片段一个 \`<video>\`：\`src\` 指向素材文件，\`data-media-start\` 写片段在素材里的起点（in），\`data-start\` 写它在成片里的起点，\`data-duration\` 写片段时长；带声音的写 \`data-has-audio="true"\`，不要 \`muted\`。只有录音时用 \`<audio>\`，画面用纯色或配图做底。
4. 剪点落在词和词之间的空当里（参考 silences 和每个词的起止时间），前后各留 0.08–0.15 秒，不要剪在一个字中间。
5. 画幅和成片不一样的素材，居中裁切铺满（\`object-fit: cover\`）；录屏不要裁掉内容，等比缩放放进画面，四周用底色。
6. 字幕按成片时间重新算：成片里的时间 = 片段在成片里的起点 +（这个词在素材里的时间 − 片段的 in）。字幕一律简体，错字和专有名词改对。${portrait ? '竖屏字幕放在画面中下部，离底边至少 420px。' : '横屏字幕放在底部，离底边至少 90px。'}
7. 全片总时长 = 所有保留片段的时长之和（加上你有意留的片头片尾）。剪完跑检查、截几帧看，再告诉作者成片多长、和方案有没有出入。
8. 作者之后说「第二段再紧一点」「把那句加回来」，同时改 \`edit-plan.json\` 和画面，两边保持一致。` : `## 图文动画解读怎么做

不用真人出镜，把文章讲成一条 40–90 秒的短视频（作者另有要求按作者的来）。

1. **先定旁白**：读完文章，挑最值得讲的 5–9 个点，写成口语旁白存进 \`narration.json\`，一段对应一屏。旁白是要念出来的：短句、不念括号和链接、数字读法自然；开头第一句就要让人想听下去。
2. **再做画面**：每段旁白一屏，屏上放这段的核心信息：大标题、关键数字、对比、清单、文章里的配图或截图。屏上的字是提炼出来的，不要把旁白原样铺上去；另外在底部加一行跟着旁白走的字幕。
3. **时长**：还没配音时，每段按「字数 ÷ 4.5」秒估，段与段之间留 0.3 秒。把每屏的起止时间集中写在一处（比如脚本开头的一个数组），方便之后整体调整。
4. **配音回来之后**：作者点了「生成配音」后，\`narration.json\` 里每段会有 \`sec\` 和 \`audio\`。这时按真实时长重排每一屏，并给每段加上音轨：\`<audio class="clip" data-start="该段开始秒" data-duration="该段 sec" src="该段 audio"></audio>\`。字幕也按新时间对齐。
5. 改了旁白文字，要告诉作者「需要重新生成配音」。`}

${styleSection(m)}
## 画面要求

- 字要大：${portrait ? '竖屏正文不小于 44px，标题 80px 以上' : '横屏正文不小于 36px，标题 72px 以上'}；一屏只讲一件事，字数宁少勿多
- ${portrait ? '竖屏上方 200px、下方 380px 会被平台的按钮和文案盖住，重要内容不要放进去' : '四边各留 90px 以上的边距'}
- 第 0 秒画面上就要有标题或主图（平台拿第一帧当封面），不要从空白开始
- 每屏 3–8 秒，元素分先后进场，转场干净利落，不要花哨到看不清字
- 中文字体用 \`"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif\`。\`index.html\` 开头已经用 \`@font-face\` + \`local()\` 声明好了这几种字体，保留那几行；要用别的字体（比如等宽字体）也照这个写法声明，不然检查会报错
- 配色、气质跟文章保持一致；没有参考就用深色底、一个强调色
- 只用确定性的逻辑：不用 \`Date.now()\`、\`Math.random()\`、网络请求
`;
}
export function create({ title, from = '', mode = 'explain', aspect = 'portrait', styles }) {
  const rt = runtime(); if (!rt.ok) throw new Error(rt.error);
  if (!MODES[mode]) throw new Error('形态只能是 explain（图文动画解读）或 talk（口播剪辑）');
  if (!ASPECTS[aspect]) throw new Error('画幅只能是 portrait（竖屏）或 landscape（横屏）');
  const src = from ? core.list().find(p => p.id === from) : null;
  if (from && !src) throw new Error('没找到来源文章：' + from);
  title = String(title || src?.title || '').trim().replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').slice(0, 60);
  if (!title) throw new Error('要给视频起个名字，或者选一篇文章');
  let name = `${PREFIX}${title}-${aspect === 'portrait' ? '竖屏' : '横屏'}`, dir = path.join(root(), name);
  for (let i = 2; exists(dir); i++) dir = path.join(root(), `${name}-${i}`);
  const id = path.basename(dir), a = ASPECTS[aspect];
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const m = { type: 'video', title, from: src?.id || '', fromTitle: src?.title || '', mode, aspect, styles: pickStyles(styles, mode), created: new Date().toISOString(), chat: [], renders: [] };
  fs.writeFileSync(path.join(dir, META), JSON.stringify(m, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'index.html'), starter(title, a));
  fs.writeFileSync(path.join(dir, 'hyperframes.json'), JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry', paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true } }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id, name: title, createdAt: m.created }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'workbench-video', private: true, type: 'module', scripts: { check: 'hyperframes check' } }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), guide(m));
  // HyperFrames 自带的技能（写法规范）拷进来，Claude Code 在这个文件夹里开工时会自己加载
  const skills = path.join(HF_DIST, 'skills');
  for (const s of ls(skills)) if (exists(path.join(skills, s, 'SKILL.md'))) fs.cpSync(path.join(skills, s), path.join(dir, '.claude', 'skills', s), { recursive: true });
  syncSource(dir, m);
  return get(id);
}
const pickStyles = (ids, mode) => { const ok = new Set(allStyles().map(x => x.id)); return Array.isArray(ids) ? [...new Set(ids.filter(x => ok.has(x)))] : DEFAULT_STYLES[mode] || []; };
// 改这条视频用的手法：存下来，并重写给 AI 的说明
export function setStyles(id, ids) {
  const dir = dirOf(id), m = patchMeta(dir, m => { m.styles = pickStyles(ids || [], m.mode); });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), guide(m));
  return get(id);
}
export function remove(id) {
  const dir = dirOf(id);
  if (RUNS.get(id)?.running || RENDERS.get(id)?.running) throw new Error('这条视频还在制作或导出，先停下来再删');
  // 挪到废纸篓的做法各系统不一样，这里改个名字留在原地（前面加 _，工作台不再显示），真要删自己到文件夹里删
  fs.renameSync(dir, path.join(root(), `_已删除-${id}-${Date.now().toString(36)}`));
  return { ok: true };
}
export function patch(id, { title }) {
  const dir = dirOf(id);
  if (typeof title === 'string' && title.trim()) { const m = patchMeta(dir, m => { m.title = title.trim().slice(0, 60); }); fs.writeFileSync(path.join(dir, 'CLAUDE.md'), guide(m)); }
  return get(id);
}

/* ---------- 让 Claude Code 干活 ---------- */
const RUNS = new Map();   // id → { running, steps, text, t, error, ch }
function runState(id) { const r = RUNS.get(id); return r ? { running: r.running, steps: r.steps.slice(-40), text: r.text.slice(-4000), t: r.t, error: r.error || '' } : { running: false, steps: [], text: '' }; }
// 把 Claude Code 的一次工具调用说成作者看得懂的一句话
function stepOf(name, input = {}) {
  const f = input.file_path ? path.basename(String(input.file_path)) : '';
  if (name === 'Read') return /\.(png|jpe?g|gif|webp)$/i.test(f) ? ['eye', /[\\/](source|assets)[\\/]/.test(String(input.file_path)) ? '看文章配图' : '看截出来的画面'] : /SKILL\.md$|references/.test(String(input.file_path)) ? ['book-open', '读视频的制作规范'] : ['file-text', `读 ${f}`];
  if (name === 'Write') return ['pen-line', f === 'narration.json' ? '写旁白稿' : `写 ${f}`];
  if (name === 'Edit' || name === 'MultiEdit') return ['pen-line', f === 'narration.json' ? '改旁白稿' : `改 ${f}`];
  if (name === 'Skill') return ['book-open', '读视频的制作规范'];
  if (name === 'Glob' || name === 'Grep') return ['search', '找文件'];
  if (name === 'Bash') {
    const c = String(input.command || '');
    if (/hyperframes\s+check|hyperframes\s+lint|hyperframes\s+validate/.test(c)) return ['stethoscope', '检查画面有没有问题'];
    if (/hyperframes\s+snapshot/.test(c)) return ['eye', '截几帧看效果'];
    if (/hyperframes\s+(inspect|timeline|info|compositions|docs)/.test(c)) return ['search', '核对时间轴'];
    if (/^\s*(cp|mkdir)\b/.test(c)) return ['images', '整理素材'];
    const bare = c.replace(/^\s*cd\s+("[^"]*"|\S+)\s*(&&|;)\s*/, '');
    if (/^\s*(ls|cat|head|tail|find|wc|pwd)\b/.test(bare)) return ['search', '看看文件夹里有什么'];
    if (/^\s*(node|python3?)\b/.test(bare)) return ['gauge', '算每一屏的时长'];
    if (/^\s*ffprobe\b/.test(bare)) return ['gauge', '量素材的时长'];
    return ['terminal', c.replace(/\s+/g, ' ').slice(0, 60)];
  }
  return null;
}
const TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Skill', 'TodoWrite', 'Bash(hyperframes:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(mkdir:*)', 'Bash(cp:*)', 'Bash(ffprobe:*)'];
const SYSTEM = '你在「小易工作台」的视频板块里工作，替不懂代码的作者把文章做成视频。严格按这个文件夹里 CLAUDE.md 的约定做。只在当前文件夹里读写文件。用中文回复，简短，不贴代码。';
// 用模型接口干活时（没有 Claude Code）：说明直接放进系统提示，工具名和 Claude Code 的对应一下
const SYSTEM_API = `${SYSTEM}

你用的工具：read_file（读文件、看图片）、write_file、edit_file、copy_file、list_files，跑命令用 run（只能跑 hyperframes 的检查、截帧这些和 ffprobe）。下面说明里说的「用 Read 看」就是用 read_file 看；「/hyperframes 技能」是文件 .claude/skills/hyperframes/SKILL.md，动手前先用 read_file 读它，命令行用法在 .claude/skills/hyperframes-cli/SKILL.md。
做完一件事就停下来，用几句话告诉作者结果，不要反复确认已经做好的东西。

下面是这个文件夹里 CLAUDE.md 的内容：

`;
/** 视频的 AI 用哪个：本机 Claude Code 登录了就用它（作者自己的订阅）；不然用模型接口（DSH 里的模型、Claude API）。都没有返回 null。 */
export function engine() {
  if (process.env.WB_VIDEO_AI !== 'api' && ai.ccBin() && ai.ccStatus().loggedIn) return 'cc';
  return vagent.model() ? 'api' : null;
}
const noEngine = () => new Error(ai.ccBin() ? 'Claude Code 还没登录：到「AI 设置」里点「登录」' : '没有能用的 AI：装好 Claude Code 并登录，或者在 DeepSeek Harness 里配好模型');

export function run(id, message, { auto = false } = {}) {
  const dir = dirOf(id);
  message = String(message || '').trim(); if (!message) throw new Error('说说想做成什么样');
  if (RUNS.get(id)?.running) throw Object.assign(new Error('AI 还在做上一件事，等它做完或者先点停止'), { status: 409 });
  const rt = runtime(); if (!rt.ok) throw new Error(rt.error);
  const eng = engine(); if (!eng) throw noEngine();
  const bin = eng === 'cc' ? ai.ccBin() : null;
  const m = patchMeta(dir, m => { m.chat = [...(m.chat || []), { role: 'me', text: message, t: new Date().toISOString(), ...(auto ? { auto: true } : {}) }].slice(-200); });
  syncSource(dir, m);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), guide(m));
  const st = { running: true, steps: [], text: '', t: Date.now(), error: '', ch: null, stopped: false };
  RUNS.set(id, st);
  const start = resume => {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--strict-mcp-config', '--permission-mode', 'acceptEdits',
      '--append-system-prompt', SYSTEM, '--allowedTools', ...TOOLS, ...(resume ? ['--resume', resume] : [])];
    const ch = st.ch = spawn(bin, args, { cwd: dir, env: env(ai.ccEnv()) });
    let buf = '', err = '', result = null, isErr = false, session = '', cur = '';
    const line = l => {
      let j; try { j = JSON.parse(l); } catch { return; }
      if (j.session_id) session = j.session_id;
      if (j.type === 'stream_event' && j.event?.type === 'content_block_delta' && j.event.delta?.type === 'text_delta') { cur += j.event.delta.text; st.text = cur; }
      if (j.type === 'assistant') for (const c of j.message?.content || []) {
        if (c.type === 'tool_use') { const s = stepOf(c.name, c.input); if (s && st.steps.at(-1)?.[1] !== s[1]) st.steps.push(s); cur = ''; }
        if (c.type === 'text' && c.text) st.text = cur = c.text;
      }
      if (j.type === 'result') { result = j.result; isErr = !!j.is_error; }
    };
    ch.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    ch.stderr.on('data', d => { err = (err + d).slice(-2000); });
    ch.on('error', e => finish('Claude Code 没能启动：' + e.message));
    ch.on('close', code => {
      if (buf.trim()) line(buf);
      // 上次的会话找不到了（清过缓存之类）：不带会话重来一次
      if (resume && !st.stopped && (isErr || code !== 0) && /no conversation found|session.*not found|invalid.*session/i.test(String(result || err))) { st.steps = []; st.text = ''; return start(null); }
      if (st.stopped) return finish('', '（已停止）', session);
      if (isErr || (code !== 0 && result == null)) return finish(ai.ccError(String(result || err)).message, '', session);
      finish('', String(result ?? st.text).trim(), session);
    });
    ch.stdin.end(message);
  };
  const finish = (error, text = '', session = '') => {
    if (!st.running) return;
    st.running = false; st.error = error; st.ch = null;
    patchMeta(dir, m => {
      if (session) m.session = session;
      m.chat = [...(m.chat || []), { role: 'ai', text: error ? '' : text, error: error || undefined, steps: st.steps.map(s => s[1]).slice(-30), t: new Date().toISOString(), took: Math.round((Date.now() - st.t) / 1000) }].slice(-200);
    });
    makePoster(id).catch(() => {});
  };
  if (eng === 'api') {
    // 没有会话可以接着聊：把最近的对话带上，文件夹里的文件就是之前做到的样子
    const before = (m.chat || []).slice(-13, -1).filter(x => x.text).map(x => `${x.role === 'me' ? '作者' : '你'}：${x.text}`).join('\n\n');
    const prompt = `${before ? `之前的对话（文件夹里的文件就是之前做到的样子）：\n\n${before}\n\n---\n\n` : ''}作者这次说：${message}`;
    const ctrl = st.ctrl = new AbortController();
    vagent.runAgent({
      dir, system: SYSTEM_API + guide(m), prompt, signal: ctrl.signal,
      canWrite: rel => !/^(\.|source\/|transcripts\/)/.test(rel) && !['clips.json', 'CLAUDE.md', META].includes(rel),
      exec: (cmd, args) => sh(cmd, args, { cwd: dir, timeout: 180000 }),
      step: (icon, text) => { if (st.steps.at(-1)?.[1] !== text) st.steps.push([icon, text]); st.text = ''; },
      onText: t => { st.text = t; },
    }).then(reply => finish('', st.stopped ? '（已停止）' : reply || st.text), e => finish(st.stopped ? '' : e.message, st.stopped ? '（已停止）' : ''));
    return { ok: true, engine: eng };
  }
  start(m.session || null);
  return { ok: true, engine: eng };
}
export function stop(id) { const r = RUNS.get(id); if (r?.running) { r.stopped = true; r.ch?.kill(); r.ctrl?.abort(); } return { ok: true }; }

// 列表里的缩略图：从画面三分之一处截一帧
const postering = new Set();
async function makePoster(id) {
  if (postering.has(id)) return; postering.add(id);
  try {
    const dir = dirOf(id), out = path.join(dir, '.poster'), at = Math.max(0.5, +(durationOf(dir) / 3).toFixed(1));
    await sh('hyperframes', ['snapshot', '--at', String(at), '--no-end', '-o', out], { cwd: dir, timeout: 120000 });
  } catch {} finally { postering.delete(id); }
}
export function posterPath(id) { return posterOf(dirOf(id)); }

/* ---------- 配音 ---------- */
const VOICE = new Map();
function voiceState(id) { const v = VOICE.get(id); return v ? { running: v.running, done: v.done, total: v.total, error: v.error || '' } : { running: false }; }
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
// 按 narration.json 一段段合成；文字和配音设置都没变的段不重做（不重复花钱）。做完自动让 Claude Code 按真实时长对齐画面
export function voice(id) {
  const dir = dirOf(id), scenes = narration(dir);
  if (!scenes.length) throw new Error('还没有旁白稿：先让 AI 把视频做出来');
  if (VOICE.get(id)?.running) throw Object.assign(new Error('配音正在生成'), { status: 409 });
  if (RUNS.get(id)?.running) throw Object.assign(new Error('AI 还在改画面，等它做完再生成配音'), { status: 409 });
  const rt = runtime(); if (!rt.ok) throw new Error(rt.error);
  const c = tts.config(), sig = hash([c.preset, c.baseUrl, c.model, c.voice, c.speed].join('|'));
  const st = { running: true, done: 0, total: scenes.length, error: '' }; VOICE.set(id, st);
  (async () => {
    try {
      const file = path.join(dir, 'narration.json'), all = readJson(file, { scenes: [] });
      for (const s of all.scenes) {
        if (!s?.id || typeof s.text !== 'string') continue;
        const rel = `assets/voice/${String(s.id).replace(/[^\w-]/g, '')}.mp3`, out = path.join(dir, rel), h = hash(sig + s.text);
        if (!(s.hash === h && exists(out))) { await tts.synth(s.text, out, { env: env() }); s.hash = h; }
        s.audio = rel; s.sec = await mediaSeconds(out);
        st.done++;
        fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
      }
      st.running = false;
      try { run(id, '配音已经生成好了，narration.json 里每段都有真实时长（sec）和音频文件（audio）。请按真实时长重排每一屏和字幕，加上各段的音轨，更新全片总时长，检查一遍，然后告诉我现在全片多长。', { auto: true }); } catch {}
    } catch (e) { st.error = e.message; st.running = false; }
  })();
  return { ok: true };
}

/* ---------- 素材：上传、转码、找停顿、转字幕 ---------- */
// 每条视频一个处理队列，素材一个个处理（转字幕很吃 CPU，不并行）
const PREP = new Map();   // id → { running, stage, error, queue: [job] }
function prepState(id) { const p = PREP.get(id); return p ? { running: p.running, stage: p.stage, error: p.error || '', left: p.queue.length } : { running: false, left: 0 }; }
const KINDS = { video: /^(mp4|mov|m4v|webm|mkv)$/, audio: /^(mp3|m4a|wav|aac)$/, image: /^(png|jpe?g|webp|gif)$/ };
// req 是上传请求（文件内容就是请求体）。先落到临时文件，再进队列处理
export async function uploadClip(id, req, name) {
  const dir = dirOf(id);
  const rt = runtime(); if (!rt.ok) throw new Error(rt.error);
  const ext = path.extname(String(name || '')).toLowerCase().slice(1), kind = Object.keys(KINDS).find(k => KINDS[k].test(ext));
  if (!kind) throw new Error('只收视频（mp4、mov、webm）、录音（mp3、m4a、wav）和图片（png、jpg）');
  const tmp = path.join(dir, 'assets', 'clips', `.upload-${crypto.randomBytes(4).toString('hex')}.${ext}`); fs.mkdirSync(path.dirname(tmp), { recursive: true });
  try {
    let size = 0;
    await new Promise((ok, no) => { const w = fs.createWriteStream(tmp); req.on('data', d => { size += d.length; if (size > 4e9) { req.destroy(); no(new Error('文件超过 4 GB，先压一下再传')); } }); req.pipe(w); w.on('finish', ok); w.on('error', no); req.on('error', no); });
    if (size < 500) throw new Error('传上来的文件是空的');
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  const st = PREP.get(id) || { running: false, stage: '', error: '', queue: [] }; PREP.set(id, st);
  st.queue.push({ tmp, kind, ext, name: path.basename(String(name)).slice(0, 80) }); st.error = '';
  if (!st.running) drain(id, dir, st);
  return { ok: true };
}
async function drain(id, dir, st) {
  st.running = true;
  while (st.queue.length) {
    const job = st.queue[0], label = job.name.length > 18 ? job.name.slice(0, 16) + '…' : job.name;
    try { await prepClip(dir, job, s => { st.stage = `${label}：${s}`; }); } catch (e) { st.error = `${label} 没处理成：${e.message}`; }
    fs.rmSync(job.tmp, { force: true }); st.queue.shift();
  }
  st.running = false; st.stage = '';
}
async function prepClip(dir, job, say) {
  const clips = readClips(dir), prefix = job.kind === 'image' ? 'p' : 'c';
  const n = Math.max(0, ...clips.filter(c => c.id.startsWith(prefix)).map(c => +c.id.slice(1) || 0)) + 1, cid = prefix + n;
  const rel = `assets/clips/${cid}.${job.kind === 'video' ? 'mp4' : job.kind === 'audio' ? 'mp3' : job.ext.replace('jpeg', 'jpg')}`, out = path.join(dir, rel);
  const clip = { id: cid, name: job.name, kind: job.kind, file: rel };
  if (job.kind === 'image') { fs.copyFileSync(job.tmp, out); }
  else {
    say('转码中');
    // 视频统一转成 H.264 的 mp4（手机录的 mov 浏览器放不了），长边超过 1920 的缩到 1920；纯录音转成 mp3
    await sh('ffmpeg', job.kind === 'audio' ? ['-y', '-loglevel', 'error', '-i', job.tmp, '-ar', '44100', '-ac', '1', '-b:a', '160k', out]
      : ['-y', '-loglevel', 'error', '-i', job.tmp, '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { timeout: 40 * 60000 });
  }
  // 量一下：时长、宽高、有没有声音
  const info = JSON.parse(await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', out]).catch(() => '{}'));
  const vs = (info.streams || []).find(x => x.codec_type === 'video'), hasAudio = (info.streams || []).some(x => x.codec_type === 'audio');
  if (vs) { clip.width = vs.width; clip.height = vs.height; }
  if (job.kind !== 'image') clip.sec = +(+info.format?.duration || 0).toFixed(2);
  if (job.kind !== 'image' && hasAudio) {
    say('找停顿');
    // 安静超过 0.4 秒的地方记下来，AI 剪的时候把剪点落在这些空当里
    const log = await new Promise(ok => execFile('ffmpeg', ['-hide_banner', '-i', out, '-af', 'silencedetect=noise=-32dB:d=0.4', '-f', 'null', '-'], { env: env(), timeout: 20 * 60000, maxBuffer: 32 * 1024 * 1024 }, (e, so, se) => ok(String(se || ''))));
    const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map(m => +m[1]), ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map(m => +m[1]);
    clip.silences = starts.map((a, i) => [+a.toFixed(2), +(ends[i] ?? clip.sec).toFixed(2)]).filter(x => x[1] > x[0]);
    say('转字幕中（第一次要下载语音模型，会久一些）');
    try {
      await sh('hyperframes', ['transcribe', rel, '-e', 'whisper', '-m', 'small', '-l', 'zh'], { cwd: dir, timeout: 90 * 60000 });
      // HyperFrames 把字幕文件写在素材旁边（或项目根目录），挪到 transcripts/ 下按素材编号存
      const made = [path.join(path.dirname(out), 'transcript.json'), path.join(dir, 'transcript.json')].find(exists);
      if (made) {
        const t = `transcripts/${cid}.json`; fs.mkdirSync(path.join(dir, 'transcripts'), { recursive: true }); fs.renameSync(made, path.join(dir, t));
        const j = readJson(path.join(dir, t), []), words = Array.isArray(j) ? j : j.words || [];
        if (words.length) { clip.transcript = t; clip.text = words.map(w => w.text || '').join('').slice(0, 400); }
      }
    } catch (e) { clip.transcriptError = e.message.slice(0, 120); }
    if (!clip.transcript && !clip.silences.length && clip.sec > 0) clip.note = '没有识别出说话内容';
  }
  writeClips(dir, [...readClips(dir), clip]);
}
export function removeClip(id, cid) {
  const dir = dirOf(id);
  if (PREP.get(id)?.running) throw Object.assign(new Error('素材还在处理，等处理完再删'), { status: 409 });
  if (RUNS.get(id)?.running) throw Object.assign(new Error('AI 正在用这些素材，等它做完再删'), { status: 409 });
  const clips = readClips(dir), c = clips.find(x => x.id === cid); if (!c) return get(id);
  for (const f of [c.file, c.transcript]) if (f) fs.rmSync(path.join(dir, f), { force: true });
  writeClips(dir, clips.filter(x => x.id !== cid));
  return get(id);
}

/* ---------- 导出成片 ---------- */
const RENDERS = new Map();
function renderState(id) { const r = RENDERS.get(id); return r ? { running: r.running, pct: r.pct, stage: r.stage, error: r.error || '', file: r.file || '' } : { running: false }; }
const STAGES = { compile: '准备画面', extract: '处理素材', audio: '混音', capture: '逐帧截图', encode: '编码', assemble: '合成' };
export function render(id, { quality = 'standard' } = {}) {
  const dir = dirOf(id), m = readMeta(dir);
  if (RENDERS.get(id)?.running) throw Object.assign(new Error('已经在导出了'), { status: 409 });
  if (RUNS.get(id)?.running) throw Object.assign(new Error('AI 还在改画面，等它做完再导出'), { status: 409 });
  const rt = runtime(); if (!rt.ok) throw new Error(rt.error);
  if (!['draft', 'standard', 'high'].includes(quality)) quality = 'standard';
  const stamp = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(5, 16).replace(/[-:]/g, '').replace('T', '-');
  const file = `renders/${(m.title || '视频').replace(/[/\\:*?"<>|\s]+/g, '-').slice(0, 30)}-${m.aspect === 'portrait' ? '竖屏' : '横屏'}-${stamp}.mp4`;
  fs.mkdirSync(path.join(dir, 'renders'), { recursive: true });
  const st = { running: true, pct: 0, stage: '准备画面', error: '', file: '', ch: null, stopped: false }; RENDERS.set(id, st);
  const ch = st.ch = spawn('hyperframes', ['render', '-o', file, '-q', quality], { cwd: dir, env: env() });
  let buf = '', tail = '';
  const eat = d => { buf += d; tail = (tail + d).slice(-1500); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const p = l.match(/@hf-progress (\{.*\})/); if (p) { try { const j = JSON.parse(p[1]); st.pct = Math.max(st.pct, Math.round(j.pct || 0)); st.stage = STAGES[j.code] || st.stage; } catch {} } } };
  ch.stdout.on('data', eat); ch.stderr.on('data', eat);
  ch.on('error', e => { st.running = false; st.error = '没能开始导出：' + e.message; });
  ch.on('close', async code => {
    st.ch = null;
    const out = path.join(dir, file);
    if (st.stopped) { st.running = false; st.error = '已取消'; fs.rmSync(out, { force: true }); return; }
    if (code !== 0 || !exists(out)) { st.running = false; st.error = '导出失败：' + (tail.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('@hf-') && !/^\[INFO\]|█|░/.test(l)).slice(-3).join(' ').slice(0, 300) || '退出码 ' + code); return; }
    const sec = await mediaSeconds(out), size = fs.statSync(out).size;
    patchMeta(dir, m => { m.renders = [{ file, t: new Date().toISOString(), sec, size, quality }, ...(m.renders || [])].slice(0, 30); });
    st.pct = 100; st.file = file; st.running = false;
    makePoster(id).catch(() => {});
  });
  return { ok: true };
}
export function stopRender(id) { const r = RENDERS.get(id); if (r?.running && r.ch) { r.stopped = true; r.ch.kill(); } return { ok: true }; }
// 有没有哪条视频正在做（重启服务前要看）
export const anyBusy = () => [...RUNS.values(), ...RENDERS.values(), ...VOICE.values(), ...PREP.values()].some(x => x.running);

// 视频文件夹里的文件给网页用（预览、成片、素材）；点开头的隐藏文件不给，只放行缩略图
export function fileOf(id, rel) {
  const dir = dirOf(id), f = path.resolve(dir, rel);
  if (!f.startsWith(dir + path.sep) || f.split(path.sep).some(s => s.startsWith('.'))) return null;
  return exists(f) && fs.statSync(f).isFile() ? f : null;
}
