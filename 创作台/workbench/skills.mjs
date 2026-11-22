// 技能（Skills）：一个文件夹里放 SKILL.md（开头写 name、description），里面是做某类事的方法和规则。
// 三个来源：工作台自己装的（data/skills/）、本机 Claude Code 的（~/.claude/skills）、本机 Agents 的（~/.agents/skills）。
// 助手的系统提示里只列名字和描述，用到时再读全文；技能里的脚本、命令不会执行，只用文字说明。
// 能在 GitHub 上搜含 SKILL.md 的仓库并安装（用本机已登录的 gh 命令行；安装要作者确认）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { APP_DIR } from './core.mjs';

const WS = path.join(APP_DIR, 'data', 'skills'), CONF = path.join(APP_DIR, 'data', 'skills.json');
export const ROOTS = [
  { src: 'ws', name: '工作台安装', dir: WS },
  { src: 'cc', name: '本机 Claude Code', dir: path.join(os.homedir(), '.claude', 'skills') },
  { src: 'ag', name: '本机 Agents', dir: path.join(os.homedir(), '.agents', 'skills') },
];
// 本机技能默认只开写作相关的；其他的在技能面板里自己打开
const DEFAULT_ON = new Set(['humanizer-zh', 'lieflat-less-ai-tone', 'product-teardown']);
const TEXT = /\.(md|txt|json|ya?ml|csv|html?|css|py|mjs|js|ts|sh)$/i;

const conf = () => { try { return JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch { return { enabled: {} }; } };
const saveConf = c => { fs.mkdirSync(path.dirname(CONF), { recursive: true }); fs.writeFileSync(CONF, JSON.stringify(c, null, 2)); };

// SKILL.md 开头的 --- 块里取 name、description（description 可能是多行）
export function parseFront(md) {
  const m = String(md).match(/^---\s*\n([\s\S]*?)\n---/); const out = {};
  if (!m) return out;
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^(name|description):\s*(.*)$/); if (!kv) continue;
    let v = kv[2].trim();
    if (/^[>|][-+]?$/.test(v)) { const buf = []; while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) buf.push(lines[++i].trim()); v = buf.join(' '); }
    out[kv[1]] = v.replace(/^["']|["']$/g, '');
  }
  return out;
}

export function list() {
  const c = conf(), seen = new Set(), out = [];
  for (const r of ROOTS) {
    let names = []; try { names = fs.readdirSync(r.dir); } catch { continue; }
    for (const n of names.sort()) {
      const dir = path.join(r.dir, n), f = path.join(dir, 'SKILL.md');
      if (n.startsWith('.') || !fs.existsSync(f)) continue;
      const fm = parseFront(fs.readFileSync(f, 'utf8').slice(0, 6000)), name = fm.name || n;
      if (seen.has(name)) continue; seen.add(name);
      const id = `${r.src}:${n}`, on = c.enabled[id] ?? (r.src === 'ws' || DEFAULT_ON.has(name));
      let origin = ''; try { origin = JSON.parse(fs.readFileSync(path.join(dir, '.source.json'), 'utf8')).url || ''; } catch {}
      out.push({ id, name, description: (fm.description || '').slice(0, 600), source: r.src, sourceName: r.name, dir, enabled: !!on, origin });
    }
  }
  return out;
}
export const enabled = () => list().filter(s => s.enabled);
export function setEnabled(id, on) { const c = conf(); c.enabled[id] = !!on; saveConf(c); return list().find(s => s.id === id); }
export function find(key) {
  const l = list(), k = String(key || '').trim();
  return l.find(s => s.id === k) || l.find(s => s.name === k) || l.find(s => s.name.toLowerCase() === k.toLowerCase()) || null;
}
export function read(key) {
  const s = find(key); if (!s) throw new Error('没有这个技能：' + key);
  return { ...s, md: fs.readFileSync(path.join(s.dir, 'SKILL.md'), 'utf8'), files: files(s.dir) };
}
function files(dir) {
  const out = [];
  const walk = (d, rel) => { for (const n of fs.readdirSync(d).sort()) { if (n.startsWith('.') || n === 'node_modules') continue; const p = path.join(d, n), r = rel ? rel + '/' + n : n; let st; try { st = fs.statSync(p); } catch { continue; } if (st.isDirectory()) walk(p, r); else if (r !== 'SKILL.md') out.push(r); if (out.length > 60) return; } };
  walk(dir, ''); return out;
}
export function readFile(key, rel) {
  const s = find(key); if (!s) throw new Error('没有这个技能：' + key);
  const f = path.resolve(s.dir, String(rel || '')); if (!f.startsWith(s.dir + path.sep)) throw new Error('只能读技能文件夹里的文件');
  if (!TEXT.test(f) || !fs.existsSync(f)) throw new Error('没有这个文本文件：' + rel);
  const t = fs.readFileSync(f, 'utf8'); return t.length > 60000 ? t.slice(0, 60000) + '\n…（太长，后面省略了）' : t;
}
export function remove(id) {
  const s = list().find(x => x.id === id); if (!s) throw new Error('没有这个技能');
  if (s.source !== 'ws') throw new Error('本机自带的技能不能在这里删，只能关掉');
  fs.rmSync(s.dir, { recursive: true, force: true }); return { ok: true };
}

/* ---------- GitHub ---------- */
const sh = (args, ms = 30000) => new Promise((ok, no) => execFile('gh', args, { timeout: ms, maxBuffer: 20e6 }, (e, out, err) => e ? no(new Error(String(err || e.message).trim().slice(-300))) : ok(out)));
async function gh(endpoint, params = {}) {
  const args = ['api', '-X', 'GET', endpoint, ...Object.entries(params).flatMap(([k, v]) => ['-f', `${k}=${v}`])];
  try { return JSON.parse(await sh(args)); }
  catch (e) {
    // 没装 gh 或没登录：退回不带登录的 API（代码搜索必须登录，这时只能搜仓库）
    if (!/ENOENT|auth|login|401/i.test(e.message)) throw new Error('GitHub 接口出错：' + e.message);
    const r = await fetch(`https://api.github.com/${endpoint}?${new URLSearchParams(params)}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'xiaoyi-workbench' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`GitHub 接口出错（${r.status}）`);
    return r.json();
  }
}
const raw = async (repo, ref, p) => { const r = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${p.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`下载 ${p} 失败（${r.status}）`); return Buffer.from(await r.arrayBuffer()); };
async function defaultBranch(repo) { const r = await gh(`repos/${repo}`); return { ref: r.default_branch || 'main', stars: r.stargazers_count || 0, description: r.description || '' }; }

// 搜 GitHub 上的技能：登录了就按文件名搜 SKILL.md，否则搜仓库
export async function search(query, limit = 12) {
  const q = String(query || '').trim(); if (!q) throw new Error('要给出关键词');
  let hits = [];
  try {
    const r = await gh('search/code', { q: `${q} filename:SKILL.md`, per_page: '30' });
    hits = (r.items || []).filter(it => /(^|\/)SKILL\.md$/i.test(it.path)).map(it => ({ repo: it.repository.full_name, path: it.path }));
  } catch {
    const r = await gh('search/repositories', { q: `${q} skill SKILL.md`, per_page: '10', sort: 'stars' });
    for (const repo of (r.items || []).slice(0, 6)) { try { hits.push(...(await inspect(`https://github.com/${repo.full_name}`)).skills.map(s => ({ repo: s.repo, path: s.path }))); } catch {} }
  }
  const seen = new Set(); hits = hits.filter(h => { const k = h.repo + '/' + h.path; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
  const meta = {};
  const out = await Promise.all(hits.map(async h => {
    try {
      meta[h.repo] ||= defaultBranch(h.repo);
      const m = await meta[h.repo], fm = parseFront((await raw(h.repo, m.ref, h.path)).toString('utf8').slice(0, 6000));
      return { repo: h.repo, path: h.path, name: fm.name || path.basename(path.dirname(h.path)) || h.repo.split('/')[1], description: (fm.description || (m.description ? '（仓库简介）' + m.description : '')).slice(0, 300), stars: m.stars, url: `https://github.com/${h.repo}/tree/${m.ref}/${path.dirname(h.path)}` };
    } catch { return null; }
  }));
  return out.filter(Boolean).sort((a, b) => b.stars - a.stars);
}

// 看一个仓库（或其中某个文件夹）里有哪些技能
export async function inspect(url) {
  const m = String(url).match(/github\.com\/([^/\s]+\/[^/\s#?]+)(?:\/(?:tree|blob)\/([^/\s]+)(?:\/([^\s#?]*))?)?/);
  if (!m) throw new Error('要给出 GitHub 地址，比如 https://github.com/owner/repo');
  const repo = m[1].replace(/\.git$/, ''), info = await defaultBranch(repo), ref = m[2] || info.ref, sub = (m[3] || '').replace(/\/?SKILL\.md$/i, '').replace(/\/$/, '');
  const tree = await gh(`repos/${repo}/git/trees/${ref}`, { recursive: '1' });
  const paths = (tree.tree || []).filter(t => t.type === 'blob' && /(^|\/)SKILL\.md$/i.test(t.path) && (!sub || t.path === sub + '/SKILL.md' || t.path.startsWith(sub + '/'))).map(t => t.path).slice(0, 20);
  const skills = await Promise.all(paths.map(async p => { try { const fm = parseFront((await raw(repo, ref, p)).toString('utf8').slice(0, 6000)); return { repo, path: p, ref, name: fm.name || path.basename(path.dirname(p)) || repo.split('/')[1], description: (fm.description || '').slice(0, 300) }; } catch { return null; } }));
  return { repo, ref, stars: info.stars, skills: skills.filter(Boolean) };
}

// 安装：把 SKILL.md 所在文件夹整个下载到 data/skills/<名字>/
export async function install({ repo, path: p, ref }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('仓库名不对');
  if (!/(^|\/)SKILL\.md$/i.test(p || '')) throw new Error('要指向一个 SKILL.md');
  ref ||= (await defaultBranch(repo)).ref;
  const base = path.dirname(p) === '.' ? '' : path.dirname(p);
  const tree = await gh(`repos/${repo}/git/trees/${ref}`, { recursive: '1' });
  const blobs = (tree.tree || []).filter(t => t.type === 'blob' && (base ? t.path.startsWith(base + '/') : !t.path.includes('/') || t.path === p)).slice(0, 60);
  if (blobs.reduce((n, b) => n + (b.size || 0), 0) > 8e6) throw new Error('这个技能文件夹太大（超过 8 MB），不装');
  const md = (await raw(repo, ref, p)).toString('utf8'), fm = parseFront(md);
  const name = String(fm.name || path.basename(base) || repo.split('/')[1]).replace(/[^\w一-龥.-]+/g, '-').slice(0, 60) || 'skill';
  const dest = path.join(WS, name);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const b of blobs) {
    const rel = base ? b.path.slice(base.length + 1) : b.path;
    if (rel.split('/').some(s => s.startsWith('.') && s !== '.') || (b.size || 0) > 2e6) continue;
    const f = path.join(dest, rel); if (!f.startsWith(dest + path.sep)) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, rel === 'SKILL.md' ? md : await raw(repo, ref, b.path));
  }
  const url = `https://github.com/${repo}/tree/${ref}/${base}`;
  fs.writeFileSync(path.join(dest, '.source.json'), JSON.stringify({ repo, path: p, ref, url, t: new Date().toISOString() }, null, 2));
  const c = conf(); c.enabled[`ws:${name}`] = true; saveConf(c);
  return list().find(s => s.id === `ws:${name}`);
}
