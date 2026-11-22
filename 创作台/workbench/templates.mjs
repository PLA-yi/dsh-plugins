// 文章模板：一套模板就是一份 theme.css（文章的样式），换模板只换 theme.css，正文不动。
//   模板库：templates/article/<id>/（tools/templates.mjs 从 mdnice、doocs/md 的开源主题转出来的）
//   我的文章：每篇文章自己的 theme.css 也能当模板，套到别的文章上
// 预览图：把模板套到 templates/sample 这篇示例文章上，走一遍真实构建，再截图（存在 data/template-previews/）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import * as core from './core.mjs';
import * as ed from './edit.mjs';
import { CHROME, MAC, fileUrl } from './platform.mjs';

const LIB = path.join(core.APP_DIR, 'templates', 'article'), SAMPLE_SRC = path.join(core.APP_DIR, 'templates', 'sample');
// 做预览图要改示例文章的样式再构建：在数据目录里放一份示例来改，不动程序自带的那份（几个 DSH 共用同一份程序）
const SAMPLE = path.join(core.DATA_DIR, 'template-sample');
function ensureSample() { if (!fs.existsSync(path.join(SAMPLE, 'build.mjs'))) fs.cpSync(SAMPLE_SRC, SAMPLE, { recursive: true, filter: f => !/[\\/](out|node_modules)$/.test(f) }); }
const PREV = path.join(core.DATA_DIR, 'template-previews');
const run = (cmd, args, opts = {}) => new Promise((ok, no) => execFile(cmd, args, { timeout: 180000, maxBuffer: 20e6, ...opts }, (e, out, err) => e ? no(new Error(String(err || e.message).slice(-600))) : ok(out)));
// 预览图文件名：中文会被替换掉，所以后面加一段由完整 id 算出的编码，免得两篇文章撞名
const safeId = id => id.replace(/[^\w.-]+/g, '_').slice(0, 40) + '-' + crypto.createHash('sha1').update(id).digest('hex').slice(0, 8);

// 文件开头注释的第一句当说明
const descOf = css => (String(css).match(/^\/\*\s*([\s\S]*?)\*\//) || [, ''])[1].split(/\n/)[0].replace(/^[^：:]*[：:]/, '').trim().slice(0, 60);

export function list() {
  const out = [];
  for (const id of (fs.existsSync(LIB) ? fs.readdirSync(LIB) : []).sort()) {
    try { const m = JSON.parse(fs.readFileSync(path.join(LIB, id, 'meta.json'), 'utf8')); out.push({ ...m, id, kind: 'lib' }); } catch {}
  }
  // 墨滴放前面，doocs 其次
  out.sort((a, b) => (a.group === b.group ? 0 : a.group.includes('mdnice') ? -1 : 1));
  const mine = [];
  for (const p of core.list({ type: 'article' })) {   // 最近改过的排前面
    const f = path.join(p.dir, 'theme.css'); if (!fs.existsSync(f)) continue;
    mine.push({ id: 'p:' + p.id, name: p.title, desc: descOf(fs.readFileSync(f, 'utf8')) || '这篇文章现在用的样式', group: '我的文章', kind: 'mine', project: p.id });
  }
  out.unshift(...mine);
  return out.map(t => ({ ...t, preview: fs.existsSync(prevFile(t.id)) ? `/tpl-preview/${encodeURIComponent(t.id)}?v=${Math.round(fs.statSync(prevFile(t.id)).mtimeMs)}` : null }));
}
export function cssOf(id) {
  if (id.startsWith('p:')) { const p = core.list({ type: 'article' }).find(x => x.id === id.slice(2)); if (!p || !fs.existsSync(path.join(p.dir, 'theme.css'))) return null; return fs.readFileSync(path.join(p.dir, 'theme.css'), 'utf8'); }
  const f = path.join(LIB, path.basename(id), 'theme.css'); if (!fs.existsSync(f)) throw new Error('没有这个模板：' + id);
  return fs.readFileSync(f, 'utf8');
}
export function find(key) {
  const k = String(key || '').trim(), l = list();
  return l.find(t => t.id === k) || l.find(t => t.name === k) || l.find(t => t.id === 'mdnice-' + k || t.id === 'doocs-' + k) || null;
}
// 套用：先存一份旧样式（可以在版本里恢复），再换 theme.css
export function apply(dir, key) {
  const t = find(key); if (!t) throw new Error('没有这个模板：' + key);
  if (t.project && path.basename(dir) === t.project) throw new Error('这就是这篇文章现在的样式');
  const css = cssOf(t.id); if (css == null) throw new Error('那篇文章已经删了，换一个模板');
  ed.snapshot(dir, 'theme.css', '换模板前');
  fs.writeFileSync(path.join(dir, 'theme.css'), css);
  core.log(dir, '换模板', t.name);
  return { ok: true, template: t };
}
// 上一次换模板前的样式恢复回来
export function revert(dir) {
  const v = ed.versions(dir, 'theme.css').find(x => /换模板前/.test(x.label));
  if (!v) throw new Error('没有换模板前的样式记录');
  ed.restore(dir, 'theme.css', v.name); core.log(dir, '恢复换模板前的样式'); return { ok: true };
}
export const canRevert = dir => ed.versions(dir, 'theme.css').some(x => /换模板前/.test(x.label));

/* ---------- 预览图 ---------- */
const prevFile = id => path.join(PREV, safeId(id) + '.jpg');
let queue = Promise.resolve();
export function preview(id, { force = false } = {}) {
  const job = queue.then(() => make(id, force)); queue = job.catch(() => {}); return job;
}
async function make(id, force) {
  const out = prevFile(id), css = cssOf(id);
  if (css == null) throw new Error('那篇文章已经删了');
  const hash = crypto.createHash('sha1').update(css).digest('hex').slice(0, 12), stamp = out + '.hash';
  if (!force && fs.existsSync(out) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === hash) return out;
  fs.mkdirSync(PREV, { recursive: true });
  ensureSample();
  fs.writeFileSync(path.join(SAMPLE, 'theme.css'), css);
  // 示例项目的依赖链到工作台自带的那份；工作台换了位置（比如装到学员电脑上）就重新链
  const nm = path.join(SAMPLE, 'node_modules'), rt = path.join(core.APP_DIR, 'templates', 'runtime', 'node_modules');
  let linked = false;
  try { linked = fs.realpathSync(nm) === fs.realpathSync(rt); } catch {}
  if (!linked) {
    fs.rmSync(nm, { recursive: true, force: true });
    fs.symlinkSync(rt, nm, 'junction');
  }
  await run(process.execPath, ['build.mjs'], { cwd: SAMPLE });
  const png = path.join(PREV, safeId(id) + '.png');
  await run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${path.join(PREV, '.chrome')}`, '--force-device-scale-factor=2', '--blink-settings=preferredColorScheme=1', '--window-size=520,1500', '--virtual-time-budget=4000', `--screenshot=${png}`, fileUrl(path.join(SAMPLE, 'out', 'wechat.html'))]);
  // 去掉顶上的说明条，只留正文，缩小存成 jpg
  if (MAC) {
    await run('sips', ['-c', '2860', '1040', '--cropOffset', '100', '1', png, '--out', png]);   // 窗口窄时预览页的手机框是满宽的
    await run('sips', ['-Z', '1100', '-s', 'format', 'jpeg', '-s', 'formatOptions', '78', png, '--out', out]);
  } else {
    fs.copyFileSync(png, out);   // 别的系统没有 sips，直接用整张截图
  }
  fs.rmSync(png, { force: true }); fs.writeFileSync(stamp, hash);
  return out;
}
export const previewPath = id => { const f = prevFile(id); return fs.existsSync(f) ? f : null; };
export async function previewAll(onProgress = () => {}) {
  const l = list(); let i = 0;
  for (const t of l) { try { await preview(t.id); } catch (e) { onProgress(++i, l.length, t, e); continue; } onProgress(++i, l.length, t); }
}
