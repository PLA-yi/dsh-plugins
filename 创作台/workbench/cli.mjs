#!/usr/bin/env node
// xy：小易工作台的命令行。人和 AI 都能用；每条命令加 --json 就输出机器可读的结果。
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import * as core from './core.mjs';
import * as ai from './ai.mjs';
import * as ed from './edit.mjs';
import * as st from './studio.mjs';
import * as pz from './plaza.mjs';
import * as xapi from './x.mjs';
import * as assets from './assets.mjs';
import * as images from './images.mjs';
import * as memory from './memory.mjs';
import * as learn from './learn.mjs';
import * as skills from './skills.mjs';
import * as tpl from './templates.mjs';
import { openArgs } from './platform.mjs';

const HELP = `xy · 小易工作台命令行（管理文章和小红书卡片）

项目用名字指代，写一部分就行，比如 xy show deepseek。加 --json 输出 JSON（给 AI 用）。

查看
  xy list [--type 文章|卡片] [--status 草稿] [--tag 标签] [--pinned]   列出项目
  xy show <项目>                         看详情：状态、标签、笔记、成品、发布记录
  xy files <项目>                        列出项目里的文件
  xy search <文字>                       在标题、标签、笔记、正文里全文搜索
  xy log [<项目>] [--limit 20]           最近的操作记录
  xy status                              各状态的项目数量

新建和编辑
  xy new <article|script|card> <名字> [--from <模板项目>]   新建文章、视频脚本（口播稿）或卡片（默认复制最近一个同类项目当模板）
  xy set <项目> [--title 标题] [--status 灵感|草稿|待发|已发布] [--tags a,b] [--plan 2026-11-20] [--pin|--unpin]
  xy tag <项目> +标签 -标签               加 / 去标签
  xy note <项目> [文字]                   不带文字就显示笔记，带文字就追加一条（自动加日期）
  xy publish <项目> --platform 小红书 [--url 链接] [--date 2026-11-07]   记一条发布记录，状态改成已发布
  xy set <项目> --build "命令" | --pack "命令"     自定义这个项目的构建 / 打包命令（只能在命令行改）

产出
  xy build <项目>                        文章：跑 build.mjs + embed.py；卡片：把每页渲染成 1440×1920 的 jpg
  xy pack <项目>                         打包成 zip（覆盖旧包）
  xy open <项目> [--finder|--preview|--edit|--zip|--web]   打开文件夹 / 预览 / 编辑源文件 / 定位 zip / 在工作台里打开

工作台
  xy ui                                  启动网页工作台并在浏览器打开
  xy add <路径> [--type article|card]    把别处的文件夹加进来管理

AI 创作（网页里的「写作」「精修」也是这些）
  xy ai                                  看有哪些模型、哪个能用、哪个是默认
  xy ai use <模型>                        设默认模型（hermes / claude / deepseek / qwen / kimi / doubao / glm / openai）
  xy ai set <模型> [--model 名字] [--base-url 地址] [--key 密钥]
  xy ai test [<模型>]                     试一下能不能用
  xy ai <润色|去AI味|精简|扩写|故事感|抓人> "文字" [--provider 模型] [--project 项目]
  xy ai 改 "文字" --要求 "怎么改"          按自己的要求改
  xy ai 体检 <项目> | xy ai 标题 <项目>     整篇挑问题 / 起标题（文章）
  xy ai 卡片 <项目> --page 2 [--n 元素编号] "怎么改"   AI 改卡片的一页或其中一块（会存版本，可撤销）
  xy undo <项目> [--file index.html|article.md]       撤销最近一次修改
  xy feed [关键词] [--refresh] [--days 3] [--tier A,B]   选题广场的素材（按可信度和热度排）
  xy ideas [方向] [--type card]          AI 从素材里挑选题，每个都带一手证据
  xy templates                           文章模板（墨滴 mdnice、doocs/md 的主题，加上你自己文章的样式）
  xy templates apply <项目> <模板> / xy templates revert <项目> / xy templates preview [--all]
  xy new article 题目 --template 橙心     新建文章时直接用某个模板
  xy skills                              AI 助手能用的技能（工作台装的、本机 Claude Code / Agents 的）
  xy skills search 关键词 / xy skills install <GitHub 地址> / xy skills on|off|rm <名字>
  xy memory                              全局记忆（所有项目的 AI 助手都会读）
  xy learn [项目]                        复盘已发布的作品：总结写法和经验进记忆，写下一篇时助手会参照（不给项目就补齐所有没复盘的）
  xy works                               看复盘过的作品档案
  xy memory add "一句话" [--kind style|avoid|layout|cards|profile|other] / xy memory rm <id>
  xy assets [关键词] [--project 项目] [--kind generated|web|project]   素材库里的图
  xy assets insert <素材id> <项目> [--after "原文里的一句"] [--caption 图注]   把素材插进文章
  xy assets save <图片网址> --title 说明 [--project 项目] [--page 来源网页]       存一张网上的图
  xy img "画面描述" [--project 项目] [--size landscape|square|portrait] [--n 1]   生成配图（会计费）
  xy img list / use <接口> / set <接口> --key … [--model …] [--base …] / confirm on|off   生图接口设置
  xy ai login                            给工作台用的 Claude Code 登录你的 Claude 账号（用订阅额度跑文字类任务）
  xy x                                   X（推特）接口设置：密钥、关注的账号、条数和间隔
  xy x token <Bearer Token>              保存密钥（也可以 echo 密钥 | xy x token -）
  xy x add 账号… [--official]  /  xy x rm 账号…   增删关注的账号（--official 算官方一手）
  xy x max 100 / xy x every 3            每次最多读几条 / 两次至少隔几小时（X 按读到的帖子收费）
  xy x pull [--test]                     立刻拉一次（--test 只读 10 条）
  xy versions <项目> [--file …]                       看历史版本
`;

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2), nx = argv[i + 1];
    if (nx != null && !nx.startsWith('--') && !['json', 'pin', 'unpin', 'pinned', 'finder', 'preview', 'edit', 'zip', 'web'].includes(k)) { flags[k] = nx; i++; }
    else flags[k] = true;
  } else pos.push(a);
}
const JSONOUT = !!flags.json;
const [cmd, ...rest] = pos;

const out = (data, text) => { if (JSONOUT) console.log(JSON.stringify(data, null, 2)); else console.log(typeof text === 'function' ? text(data) : text ?? data); };
const fail = msg => { if (JSONOUT) console.log(JSON.stringify({ error: msg })); else console.error('✗ ' + msg); process.exit(1); };
const ago = iso => { const s = (Date.now() - new Date(iso)) / 1000; return s < 60 ? '刚刚' : s < 3600 ? `${s / 60 | 0} 分钟前` : s < 86400 ? `${s / 3600 | 0} 小时前` : `${s / 86400 | 0} 天前`; };
const w = s => [...String(s)].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - w(s)));

function line(p) {
  const size = p.type === 'card' ? `${p.pages} 页` : `${p.chars} 字`;
  return `${p.pinned ? '★' : ' '} ${pad(p.title, 30)} ${pad(p.typeName, 10)} ${pad(p.status, 6)} ${pad(size, 8)} ${pad(ago(p.updated), 10)} ${p.tags.map(t => '#' + t).join(' ')}`;
}
function detail(p) {
  const L = [`${p.pinned ? '★ ' : ''}${p.title}`, `  类型　${p.typeName}　　状态　${p.status}${p.plan ? '　　计划发布　' + p.plan : ''}`,
    `  标签　${p.tags.join('、') || '—'}`, `  位置　${p.dir}`,
    `  规模　${p.type === 'card' ? `${p.pages} 页，已渲染 ${p.images} 张` : `${p.chars} 字`}　　更新　${ago(p.updated)}`,
    `  成品　${p.zip || '还没打包'}`];
  if (p.published.length) L.push('  发布　' + p.published.map(r => `${r.date} ${r.platform}${r.url ? ' ' + r.url : ''}`).join('\n　　　　'));
  if (p.previews?.length) L.push('  预览　' + p.previews.map(x => x.file).join('、'));
  if (p.notes) L.push('  笔记\n' + p.notes.split('\n').map(s => '    ' + s).join('\n'));
  if (p.history?.length) L.push('  最近　' + p.history.slice(0, 3).map(h => `${ago(h.t)} ${h.action}：${h.detail}`).join('\n　　　　'));
  return L.join('\n');
}
const need = (n, what) => { if (!rest[n]) fail(`缺少${what}。用 xy help 看用法`); return rest[n]; };
const dirOf = q => { try { return core.resolve(q); } catch (e) { fail(e.message); } };

try {
  switch (cmd) {
    case undefined: case 'help': case '-h': out({ help: HELP }, HELP); break;

    case 'list': case 'ls': {
      const ps = core.list({ type: flags.type, status: flags.status, tag: flags.tag, pinned: flags.pinned });
      out(ps, () => ps.length ? `${ps.length} 个项目\n` + ps.map(line).join('\n') : '没有项目'); break;
    }
    case 'show': { const p = core.load(dirOf(need(0, '项目名')), true); out(p, detail); break; }
    case 'files': { const p = core.load(dirOf(need(0, '项目名')), true); out(p.files, () => p.files.map(f => `${f.dir ? '▸' : ' '} ${f.path}${f.dir ? '/' : '  ' + (f.size / 1024).toFixed(0) + ' KB'}`).join('\n')); break; }
    case 'search': {
      const r = core.search(rest.join(' '));
      out(r, () => r.length ? r.map(x => `${x.title}（${core.TYPES[x.type]}）\n` + x.hits.slice(0, 4).map(h => `   [${h.where}] …${h.snippet}…`).join('\n')).join('\n') : '没搜到'); break;
    }
    case 'log': {
      const id = rest[0] ? path.basename(dirOf(rest[0])) : undefined;
      const r = core.activity(+flags.limit || 20, id);
      out(r, () => r.map(e => `${ago(e.t).padEnd(8)} ${e.id}　${e.action}：${e.detail}`).join('\n') || '还没有记录'); break;
    }
    case 'status': {
      const ps = core.list(); const c = Object.fromEntries(core.STATUSES.map(s => [s, ps.filter(p => p.status === s).length]));
      out(c, () => core.STATUSES.map(s => `${pad(s, 6)} ${c[s]}`).join('\n') + `\n共 ${ps.length} 个（文章 ${ps.filter(p => p.type === 'article').length}，卡片 ${ps.filter(p => p.type === 'card').length}）`); break;
    }
    case 'new': {
      const tp = flags.template ? (tpl.find(flags.template) || fail('没有这个模板：' + flags.template)) : null;
      const p = core.create(need(0, '类型（article 或 card）'), rest.slice(1).join(' ') || fail('缺少名字'), flags.from, { theme: tp ? tpl.cssOf(tp.id) : null });
      out(p, () => `✓ 新建了${p.typeName}「${p.title}」\n  ${p.dir}\n  接着可以编辑 ${p.type === 'card' ? 'index.html' : 'article.md'}，再 xy build "${p.title}"`); break;
    }
    case 'set': {
      const dir = dirOf(need(0, '项目名'));
      const patch = { title: flags.title, status: flags.status, tags: flags.tags, plan: flags.plan === true ? '' : flags.plan };
      if (flags.pin) patch.pinned = true; if (flags.unpin) patch.pinned = false;
      if (flags.build || flags.pack) patch.commands = { ...(flags.build ? { build: flags.build } : {}), ...(flags.pack ? { pack: flags.pack } : {}) };
      const p = core.update(dir, patch, 'cli'); out(p, () => '✓ 已更新\n' + detail(p)); break;
    }
    case 'tag': {
      const dir = dirOf(need(0, '项目名'));
      const add = rest.slice(1).filter(t => !t.startsWith('-')).map(t => t.replace(/^\+/, ''));
      const rm = rest.slice(1).filter(t => t.startsWith('-')).map(t => t.slice(1));
      const p = core.update(dir, { addTags: add, removeTags: rm }, 'cli'); out(p, () => `✓ 标签：${p.tags.join('、') || '—'}`); break;
    }
    case 'note': {
      const dir = dirOf(need(0, '项目名')); const text = rest.slice(1).join(' ');
      if (!text) { const p = core.load(dir, true); out({ notes: p.notes }, p.notes || '（还没有笔记）'); break; }
      const p = core.update(dir, { appendNote: text }, 'cli'); out(p, () => '✓ 已记下\n' + p.notes); break;
    }
    case 'publish': {
      const dir = dirOf(need(0, '项目名'));
      if (!flags.platform) fail('要写 --platform，比如 --platform 小红书');
      const p = core.update(dir, { addPublish: { platform: flags.platform, url: flags.url === true ? '' : flags.url, date: flags.date } }, 'cli');
      out(p, () => `✓ 已记录发布，状态改为已发布\n` + p.published.map(r => `  ${r.date} ${r.platform} ${r.url || ''}`).join('\n')); break;
    }
    case 'build': {
      const dir = dirOf(need(0, '项目名')); if (!JSONOUT) console.error('构建中…');
      const log = await core.build(dir); out({ ok: true, log }, () => '✓ 构建完成\n' + log.split('\n').slice(-8).join('\n')); break;
    }
    case 'pack': {
      const dir = dirOf(need(0, '项目名')); const r = await core.pack(dir);
      out(r, () => `✓ 打包完成：${r.zip}（${r.size}）\n  ${r.path}`); break;
    }
    case 'open': {
      const dir = dirOf(need(0, '项目名'));
      const how = ['finder', 'preview', 'edit', 'zip', 'web'].find(k => flags[k]) || 'finder';
      if (how === 'web') await ensureServer();
      const t = await core.open(dir, how); out({ ok: true, opened: t }, `✓ 已打开 ${t}`); break;
    }
    case 'ui': case 'serve': {
      await ensureServer(); const url = `http://127.0.0.1:${core.config().port}/`;
      { const [c, a] = openArgs(url); execFileSync(c, a); } out({ ok: true, url }, `✓ 工作台：${url}`); break;
    }
    case 'ai': {
      const sub = rest[0];
      const TASK = { 润色: 'polish', 去AI味: 'deai', 去ai味: 'deai', 精简: 'shorten', 扩写: 'expand', 故事感: 'story', 加故事感: 'story', 抓人: 'hook', 更抓人: 'hook', 改: 'custom',
        polish: 'polish', deai: 'deai', shorten: 'shorten', expand: 'expand', story: 'story', hook: 'hook', custom: 'custom' };
      if (!sub) { const d = ai.providers(); out(d, () => d.providers.map(x => `${x.id === d.default ? '●' : ' '} ${pad(x.id, 10)} ${pad(x.name, 22)} ${pad(x.ready ? '可用' : '未配置', 8)} ${x.model || ''}${x.keyFrom ? '　密钥来自' + x.keyFrom : ''}`).join('\n') + '\n\n● 是默认。设默认：xy ai use <模型>；填密钥：xy ai set <模型> --key …'); break; }
      if (sub === 'use') { const d = ai.setProvider(null, { default: need(1, '模型名') }); out(d, `✓ 默认模型改为 ${d.default}`); break; }
      // 给工作台用的 Claude Code 登录你的 Claude 账号（用订阅额度）：会打开浏览器，在网页上确认
      if (sub === 'login') {
        const bin = ai.ccBin() || fail('没找到 Claude Code：装一下命令行版，或者打开一次 Claude 桌面 App');
        const code = await new Promise(r => spawn(bin, ['auth', 'login', ...(flags.console ? ['--console'] : ['--claudeai'])], { stdio: 'inherit', env: ai.ccEnv() }).on('close', r));
        const st = ai.ccStatus(true);
        if (!st.loggedIn) fail('还没登录上' + (code ? `（退出码 ${code}）` : ''));
        out(st, `✓ 登录好了${st.email ? '：' + st.email : ''}${st.plan ? `（${st.plan}）` : ''}。在工作台的模型菜单里选「Claude Code（订阅额度）」就能用`); break;
      }
      if (sub === 'logout') { const bin = ai.ccBin() || fail('没找到 Claude Code'); execFileSync(bin, ['auth', 'logout'], { stdio: 'inherit', env: ai.ccEnv() }); ai.ccStatus(true); out({ ok: true }, '✓ 已退出 Claude Code 登录'); break; }
      if (sub === 'set') {
        const patch = {}; if (typeof flags.model === 'string') patch.model = flags.model; if (typeof flags['base-url'] === 'string') patch.baseUrl = flags['base-url']; if (typeof flags.key === 'string') patch.key = flags.key; if (typeof flags.name === 'string') patch.name = flags.name;
        const d = ai.setProvider(need(1, '模型名'), patch); const x = d.providers.find(v => v.id === rest[1]);
        out(x, `✓ 已保存：${x.name}　${x.ready ? '可用' : '还没配好'}　${x.model}`); break;
      }
      if (sub === 'test') {
        const t0 = Date.now(); const text = await ai.generate({ provider: rest[1], system: '你是测试助手。', prompt: '只回复两个字：收到' });
        out({ ok: true, text, ms: Date.now() - t0 }, `✓ 能用：回了「${text.trim().slice(0, 30)}」，${((Date.now() - t0) / 1000).toFixed(1)} 秒`); break;
      }
      const stream = t => { if (!JSONOUT) process.stdout.write(t); };
      if (sub === '体检' || sub === 'review' || sub === '标题' || sub === 'titles') {
        const dir = dirOf(need(1, '项目名')); const p = core.load(dir);
        if (p.type !== 'article') fail('体检和起标题只用于文章');
        const { system, prompt } = ai.articlePrompt(['体检', 'review'].includes(sub) ? 'review' : 'titles', { text: ed.articleRead(dir).text, instruction: flags['要求'] || flags.ask || '', title: p.title });
        const r = await ai.generate({ provider: flags.provider, system, prompt, onText: stream });
        if (JSONOUT) out({ result: r }); else console.log(); break;
      }
      if (sub === '卡片' || sub === 'card') {
        const dir = dirOf(need(1, '项目名')); const q = rest.slice(2).join(' ') || flags['要求'] || fail('要写怎么改');
        let n = flags.n;
        if (n == null) {
          const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
          const pg = String(flags.page || 1);
          const sec = ed.parse(html).find(e => e.tag === 'section' && /data-n="(\d+)"/.exec(html.slice(e.start, e.openEnd))?.[1] === pg);
          if (!sec) fail(`没找到第 ${pg} 页`); n = sec.n;
        }
        const el = ed.cardElement(dir, n);
        const { system, prompt } = ai.cardPrompt({ css: el.css, section: el.section, element: el.outer, instruction: q });
        if (!JSONOUT) console.error(`AI 正在改${flags.n != null ? '第 ' + n + ' 号元素' : '第 ' + (flags.page || 1) + ' 页'}…`);
        const html = ai.stripFence(await ai.generate({ provider: flags.provider, system, prompt }));
        if (!/^\s*</.test(html)) fail('AI 没有返回 HTML：' + html.slice(0, 120));
        ed.cardReplace(dir, n, html, 'AI：' + q.slice(0, 20)); core.log(dir, 'AI 精修', q.slice(0, 60));
        out({ ok: true, html }, `✓ 改好了，已存旧版本（不满意就 xy undo "${core.load(dir).title}"）。再 xy build 出图`); break;
      }
      const task = TASK[sub]; if (!task) fail(`不认识「${sub}」。可用：润色、去AI味、精简、扩写、故事感、抓人、改、体检、标题、卡片`);
      const text = rest.slice(1).join(' ') || (flags.file ? fs.readFileSync(flags.file, 'utf8') : '') || fail('要给出要改的文字（或 --file 文件）');
      const title = flags.project ? core.load(dirOf(flags.project)).title : '';
      const { system, prompt } = ai.articlePrompt(task, { text, instruction: flags['要求'] || flags.ask || '', title });
      const r = await ai.generate({ provider: flags.provider, system, prompt, onText: stream });
      if (JSONOUT) out({ result: r }); else console.log(); break;
    }
    case 'feed': {
      if (flags.refresh || !pz.feed().updated) { if (!JSONOUT) console.error('正在抓信息源…'); const r = await pz.refresh(); if (!JSONOUT) console.error(`新增 ${r.added} 条，共 ${r.total} 条`); }
      const list = pz.items({ days: +flags.days || 3, tiers: typeof flags.tier === 'string' ? flags.tier.split(',') : null, q: rest.join(' ') }).slice(0, +flags.limit || 30);
      out(list, () => list.map(it => `[${pz.TIERS[it.tier].name}·${it.sourceName}] ${it.title}${it.heat?.points ? `  (HN ${it.heat.points})` : ''}${it.heat?.stars ? `  (本周+${it.heat.stars}★)` : ''}\n    ${it.url}`).join('\n')); break;
    }
    case 'ideas': {
      if (!pz.feed().updated || Date.now() - Date.parse(pz.feed().updated) > 3 * 3600000) { if (!JSONOUT) console.error('先抓一遍信息源…'); await pz.refresh(); }
      if (!JSONOUT) console.error('AI 正在从素材里挑选题，大约 1 分钟…');
      const r = await pz.ideas({ direction: rest.join(' '), days: +flags.days || 7, type: core.typeOf(flags.type) || 'article', provider: flags.provider, existing: core.list().map(p => p.title) });
      out(r, () => r.items.map((x, i) => `${i + 1}. ${x.title}${x.firstHand ? '' : '（缺一手证据）'}\n   角度：${x.angle}\n   由头：${x.why}\n   证据：${x.evidence.map(e => `[${pz.TIERS[e.tier].name}·${e.sourceName}] ${e.url}`).join('\n         ')}`).join('\n\n') + `\n\n用其中一个建项目：xy new ${r.type} "题目"`); break;
    }
    case 'templates': {
      const sub = rest[0];
      if (sub === 'apply') { const dir = dirOf(rest[1] || fail('用法：xy templates apply <项目> <模板>')); const r = tpl.apply(dir, rest.slice(2).join(' ') || fail('要给出模板名')); if (!JSONOUT) console.error('换好了，正在重新构建…'); await core.build(dir); out(r, `✓ 换成了「${r.template.name}」，已重新构建。不满意：xy templates revert "${rest[1]}"`); break; }
      if (sub === 'revert') { const dir = dirOf(rest[1] || fail('要给出项目')); tpl.revert(dir); await core.build(dir); out({ ok: true }, '✓ 已恢复换模板前的样式'); break; }
      if (sub === 'preview') { if (!JSONOUT) console.error('正在生成预览图…'); if (flags.all) await tpl.previewAll((i, n, t) => !JSONOUT && console.error(`${i}/${n} ${t.name}`)); else { const t = tpl.find(rest.slice(1).join(' ')) || fail('没有这个模板'); console.log(await tpl.preview(t.id, { force: true })); } break; }
      const l = tpl.list();
      out(l, () => l.map(t => `${t.name.padEnd(16)} ${t.group.padEnd(10)} ${t.desc}`).join('\n')); break;
    }
    case 'skills': {
      const sub = rest[0];
      if (sub === 'search') { const r = await skills.search(rest.slice(1).join(' ')); out(r, () => r.map(x => `${x.stars}★ ${x.name}  ${x.repo}/${x.path}\n    ${x.description}`).join('\n') || '没搜到'); break; }
      if (sub === 'install') {
        const u = rest[1] || fail('要给出 GitHub 地址'); const r = await skills.inspect(u);
        if (!r.skills.length) fail('这个地址下没找到 SKILL.md');
        if (r.skills.length > 1 && !flags.all) fail(`这里有 ${r.skills.length} 个技能，指到具体文件夹，或者加 --all 全装：\n` + r.skills.map(x => '  ' + x.path).join('\n'));
        const done = []; for (const x of r.skills) done.push(await skills.install({ repo: x.repo, path: x.path, ref: x.ref }));
        out(done, done.map(x => `✓ 装好了：${x.name}`).join('\n')); break;
      }
      if (sub === 'on' || sub === 'off') { const sk = skills.find(rest[1]) || fail('没有这个技能'); skills.setEnabled(sk.id, sub === 'on'); out({ ok: true }, `✓ ${sk.name} 已${sub === 'on' ? '打开' : '关掉'}`); break; }
      if (sub === 'rm') { const sk = skills.find(rest[1]) || fail('没有这个技能'); skills.remove(sk.id); out({ ok: true }, '✓ 已删除'); break; }
      const l = skills.list().map(({ dir, ...x }) => x);
      out(l, () => l.map(x => `${x.enabled ? '●' : '○'} ${x.name.padEnd(28)} ${x.sourceName}`).join('\n')); break;
    }
    // 复盘已发布的作品：xy learn <项目> 复盘一篇；xy learn 把还没复盘的已发布作品都复盘一遍
    case 'learn': {
      const w = rest[0] ? await learn.learn(dirOf(rest[0])) : null;
      if (w) { out(w, () => `✓ 复盘了《${w.title}》\n  ${w.summary}\n  学到 ${w.memo.length} 条记忆：\n${w.memo.map(x => `    [${x.op === 'add' ? '新增' : x.op === 'update' ? '合并' : '删除'}] ${x.text}`).join('\n')}`); break; }
      const r = await learn.sweep({ force: true });
      out(r, () => r.length ? r.map(x => x.error ? `✗ 《${x.title}》${x.error}` : `✓ 《${x.title}》学到 ${x.memo.length} 条`).join('\n') : '已发布的作品都复盘过了'); break;
    }
    case 'works': {
      const l = learn.list();
      out(l, () => l.length ? l.map(w => `《${w.title}》 复盘于 ${w.learnedAt.slice(0, 10)}\n  ${w.summary}\n  结构：${w.structure}`).join('\n\n') : '还没有复盘过的作品（xy learn 复盘已发布的）'); break;
    }
    case 'memory': {
      const sub = rest[0];
      if (sub === 'add') { const it = memory.add({ text: rest.slice(1).join(' ') || fail('要给出内容'), kind: flags.kind || 'other' }); out(it, `✓ 记住了（${it.id}）`); break; }
      if (sub === 'rm') { memory.remove(rest[1] || fail('要给出 id')); out({ ok: true }, '✓ 已删除'); break; }
      const l = memory.list();
      out(l, () => Object.entries(memory.KINDS).map(([k, n]) => { const xs = l.filter(x => x.kind === k); return xs.length ? `【${n}】\n` + xs.map(x => `  ${x.id}  ${x.text}`).join('\n') : ''; }).filter(Boolean).join('\n') || '还没有记忆'); break;
    }
    case 'assets': {
      if (rest[0] === 'insert') {
        const dir = dirOf(rest[2] || fail('用法：xy assets insert <素材id> <项目>'));
        const r = assets.insert(dir, rest[1], { after: typeof flags.after === 'string' ? flags.after : '', caption: typeof flags.caption === 'string' ? flags.caption : '' });
        out(r, `✓ 已插入 ${r.file}`); break;
      }
      if (rest[0] === 'save') {
        const a = await assets.fromUrl(rest[1] || fail('要给出图片网址'), { title: flags.title || '', page: flags.page || '', project: flags.project ? path.basename(dirOf(flags.project)) : '' });
        out(a, `✓ 存进素材库：${a.id}（${a.file}${a.w ? `，${a.w}×${a.h}` : ''}）`); break;
      }
      const l = assets.list({ q: rest.join(' '), project: flags.project ? path.basename(dirOf(flags.project)) : '', kind: typeof flags.kind === 'string' ? flags.kind : '' }).slice(0, +flags.limit || 50);
      out(l, () => l.map(a => `${a.id}  [${{ generated: 'AI 生成', web: '网上存的', project: '文章里的' }[a.kind]}] ${a.title || a.file}${a.projectTitle ? '  · ' + a.projectTitle : ''}${a.w ? `  ${a.w}×${a.h}` : ''}`).join('\n') || '素材库是空的'); break;
    }
    case 'img': {
      const sub = rest[0];
      const show = r => out(r, () => [`生图前确认：${r.confirm ? '开' : '关'}`, ...r.providers.map(p => `${p.id === r.default ? '●' : '○'} ${p.id.padEnd(12)} ${p.name}  ${p.ready ? '可用' : '未配置'}  ${p.model}`)].join('\n'));
      if (!sub || sub === 'list') { show(images.settings()); break; }
      if (sub === 'use') { show(images.setSettings({ default: rest[1] })); break; }
      if (sub === 'confirm') { show(images.setSettings({ confirm: rest[1] !== 'off' })); break; }
      if (sub === 'set') { const patch = { id: rest[1] || fail('要给出接口 id（xy img list 看）') }; if (flags.key) patch.key = flags.key; if (flags.model) patch.model = flags.model; if (flags.base) patch.baseUrl = flags.base; if (flags.name) patch.name = flags.name; if (flags.format) patch.format = flags.format; show(images.setSettings(patch)); break; }
      const prompt = rest.join(' ') || fail('要给出画面描述');
      if (!JSONOUT) console.error('正在生成…');
      const r = await images.generate({ prompt, size: flags.size || 'landscape', n: +flags.n || 1, provider: flags.provider });
      const project = flags.project ? path.basename(dirOf(flags.project)) : '';
      const made = r.images.map(buf => assets.add(buf, { kind: 'generated', title: flags.title || prompt.slice(0, 40), prompt, provider: `${r.providerName} · ${r.model}`, project }));
      out(made, () => made.map(a => `✓ ${a.id}  ${a.file}`).join('\n') + `\n插进文章：xy assets insert ${made[0].id} <项目> --after "原文里的一句"`); break;
    }
    case 'x': {
      const sub = rest[0] || 'show', args = rest.slice(1), c = xapi.config();
      const show = r => out(r, () => [`X 接口：${r.configured ? '已接入，密钥 ' + r.token : '还没配密钥（xy x token …）'}`, `每次最多读 ${r.max} 条，两次至少隔 ${r.everyHours} 小时${r.lastPull ? `；上次 ${new Date(r.lastPull).toLocaleString('zh-CN')} 拉到 ${r.lastCount} 条` : ''}`, `关注 ${r.accounts.length} 个账号（* 是官方）：`, '  ' + r.accounts.map(a => a.u + (a.official ? '*' : '')).join('  ')].join('\n'));
      if (sub === 'show') { show(xapi.publicConfig()); break; }
      if (sub === 'token') { let t = args[0] || fail('要给出 Bearer Token'); if (t === '-') t = fs.readFileSync(0, 'utf8'); show(xapi.save({ token: t.trim() })); break; }
      if (sub === 'add') { if (!args.length) fail('要给出账号'); show(xapi.save({ accounts: [...c.accounts, ...args.map(u => ({ u, official: !!flags.official }))] })); break; }
      if (sub === 'rm') { const del = new Set(args.map(u => u.replace(/^@/, '').toLowerCase())); show(xapi.save({ accounts: c.accounts.filter(a => !del.has(a.u.toLowerCase())) })); break; }
      if (sub === 'max') { show(xapi.save({ max: +args[0] })); break; }
      if (sub === 'every') { show(xapi.save({ everyHours: +args[0] })); break; }
      if (sub === 'pull') {
        const r = await pz.refresh(['x'], { force: true, xmax: flags.test ? 10 : undefined }), st = r.status.x;
        if (!st.ok) fail(st.error); out({ ...st, added: r.added }, `✓ X 拉到 ${st.n} 条，新增 ${r.added} 条。看：xy feed --tier A,B`); break;
      }
      fail('可用：xy x / token / add / rm / max / every / pull');
    }
    case 'undo': {
      const dir = dirOf(need(0, '项目名')); const p = core.load(dir);
      const file = typeof flags.file === 'string' ? flags.file : p.type === 'card' ? 'index.html' : 'article.md';
      const v = ed.restore(dir, file); core.log(dir, '撤销', v.label || '');
      out({ ok: true, restored: v }, `✓ 已撤销，回到 ${new Date(v.t).toLocaleString('zh-CN')} 之前的样子${v.label ? '（撤掉的是：' + v.label + '）' : ''}`); break;
    }
    case 'versions': {
      const dir = dirOf(need(0, '项目名')); const p = core.load(dir);
      const file = typeof flags.file === 'string' ? flags.file : p.type === 'card' ? 'index.html' : 'article.md';
      const vs = ed.versions(dir, file); out(vs, () => vs.map(v => `${new Date(v.t).toLocaleString('zh-CN')}　${v.label}`).join('\n') || '还没有历史版本'); break;
    }
    case 'add': {
      const p = core.addRoot(need(0, '路径'), flags.type); out(p, () => `✓ 已加入：${p.title}（${p.typeName}）`); break;
    }
    default: fail(`不认识的命令「${cmd}」。用 xy help 看用法`);
  }
} catch (e) { fail(e.message); }

// 工作台服务没开就在后台开起来
async function ensureServer() {
  const port = core.config().port;
  const up = async () => { try { const r = await fetch(`http://127.0.0.1:${port}/api/stamp`); return r.ok; } catch { return false; } };
  if (await up()) return;
  const child = spawn(process.execPath, [path.join(core.APP_DIR, 'server.mjs')], { detached: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 150)); if (await up()) return; }
  fail('工作台服务没能启动，手动运行 node server.mjs 看报错');
}
