// 能动手的 AI 助手（文章写作页、小红书卡片精修页都用它）：直接改正文 / 卡片、样式和排版脚本，联网找配图、存进素材库、插进去，也能调用生图接口。
// 每次都先读全局记忆（memory.mjs），也能翻作者别的文章和卡片、选题广场。
// 每一轮改过的文件都记下原样，可以整轮撤销；改之前也照常存历史版本。生图要花钱，默认先让作者确认。
import * as xapi from './x.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import * as ai from './ai.mjs';
import * as core from './core.mjs';
import * as ed from './edit.mjs';
import * as assets from './assets.mjs';
import * as images from './images.mjs';
import * as memory from './memory.mjs';
import * as pz from './plaza.mjs';
import * as skills from './skills.mjs';
import * as tpl from './templates.mjs';
import * as learn from './learn.mjs';
import { CHROME, fileUrl } from './platform.mjs';

const TEXT_EXT = /\.(md|css|html?|mjs|cjs|js|json|svg|txt|py|ya?ml)$/i;
const wdir = dir => { const d = path.join(dir, '.workbench'); fs.mkdirSync(d, { recursive: true }); return d; };
const readJ = (dir, f, d) => { try { return JSON.parse(fs.readFileSync(path.join(wdir(dir), f), 'utf8')); } catch { return d; } };
const writeJ = (dir, f, v) => fs.writeFileSync(path.join(wdir(dir), f), JSON.stringify(v, null, 2));
const brief = a => ({ id: a.id, file: a.file, title: a.title });
const run1 = (cmd, args, ms = 90000) => new Promise((ok, no) => execFile(cmd, args, { timeout: ms }, (e, out, err) => e ? no(new Error(String(err || e.message).slice(-400))) : ok(out)));
const SHOTS = path.join(core.APP_DIR, 'data', 'shots');
// 无头 Chrome 截图；长页面切成几段，每段 2000 像素高
export async function shoot(url, width, height, segs) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const f = path.join(SHOTS, uid() + '.png');
  await run1(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${path.join(SHOTS, '.chrome')}`, '--force-device-scale-factor=1', '--blink-settings=preferredColorScheme=1', `--window-size=${width},${height}`, '--virtual-time-budget=6000', `--screenshot=${f}`, url]);
  const out = [];
  for (const [y, h] of segs) {
    const g = f.replace('.png', `-${y}.png`);
    // sips 的偏移写 0 会被当成没写、改成居中裁剪，所以从 1 开始
    await run1('sips', ['-c', String(h), String(width), '--cropOffset', String(y + 1), '1', f, '--out', g]);
    out.push(fs.readFileSync(g).toString('base64')); fs.rmSync(g);
  }
  fs.rmSync(f);
  return out;
}
const imgBlock = data => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data } });
const uid = () => Date.now().toString(36) + crypto.randomBytes(2).toString('hex');

// 只能动项目里的文件；out/（构建产物）、node_modules、隐藏目录不碰
function safe(dir, rel) {
  rel = String(rel || '').trim().replace(/^\.?\/+/, '');
  if (!rel) throw new Error('要给出文件路径');
  const f = path.resolve(dir, rel), r = path.relative(dir, f);
  if (r.startsWith('..') || path.isAbsolute(r)) throw new Error('只能动这个项目里的文件');
  const parts = r.split(path.sep);
  if (parts.some(s => s.startsWith('.')) || ['node_modules', 'out'].includes(parts[0])) throw new Error(`不能动这个位置：${rel}（out/ 是构建出来的，改了也会被覆盖）`);
  return { f, rel: parts.join('/') };
}

const TOOLS = [
  { name: 'list_files', description: '列出这篇文章项目里的文件（不含 out/ 和 node_modules）。', input_schema: { type: 'object', properties: {} } },
  { name: 'read_file', description: '读项目里的一个文本文件，比如 theme.css、build.mjs、article.md。', input_schema: { type: 'object', properties: { path: { type: 'string', description: '相对项目根目录的路径' } }, required: ['path'] } },
  { name: 'edit_file', description: '精确替换文件里的一段文字。old_text 必须从文件里原样复制，且在文件里只出现一次（不唯一就多带几行上下文，或者设 replace_all）。改之前会自动存历史版本。', input_schema: { type: 'object', properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' }, replace_all: { type: 'boolean' } }, required: ['path', 'old_text', 'new_text'] } },
  { name: 'write_file', description: '新建文件，或者整个重写一个文件（大改模板时用）。只能写文本文件。改之前会自动存历史版本。', input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'build_cards', only: 'card', description: '把 index.html 里的每张卡片渲染成图（out/ 里的 jpg），每页几秒。改完卡片最后渲染一次，作者的成品图才会更新。', input_schema: { type: 'object', properties: {} } },
  { name: 'view_cards', only: 'card', description: '看卡片现在的样子（直接按 index.html 渲染，不用先 build_cards）。pages 填页码（data-n 的值，比如 ["1","2"]），不填就看全部。改完一定要看一眼有没有文字溢出、被截掉、挤在一起。', input_schema: { type: 'object', properties: { pages: { type: 'array', items: { type: 'string' } } } } },
  { name: 'copy_asset', description: '把素材库里的一张图复制到这个项目的 img/ 里，返回相对路径（卡片里用 <img src="img/…">）。', input_schema: { type: 'object', properties: { asset_id: { type: 'string' } }, required: ['asset_id'] } },
  { name: 'remember', description: '把作者明确要求记住的偏好马上记下（作者说“记住”“以后都……”“我不喜欢……”时用）。一次性的修改要求不要记；只对这一篇成立的（这篇的读者、角度、约定）scope 填 project。记之前先看系统提示里已有的记忆，别重复。', input_schema: { type: 'object', properties: { text: { type: 'string', description: '一句话写清楚（60 字以内），单独拿出来也看得懂' }, kind: { type: 'string', enum: Object.keys(memory.KINDS), description: 'profile 我是谁 / style 写作风格 / avoid 不要这样 / layout 排版和视觉 / cards 小红书卡片 / phrase 口头说法（作者的模糊说法实际指什么）/ ideas 想法和选题 / howto 做法和经验 / other' }, scope: { type: 'string', enum: ['all', 'article', 'card', 'project'], description: 'all 所有作品 / article 只管文章 / card 只管卡片 / project 只对这一篇' }, why: { type: 'string', description: '为什么：作者的原话或理由' }, detail: { type: 'string', description: '怎么做：具体做法、例子（可空）' }, check: { type: 'string', description: '能在成稿里逐句检查的，写成一句检查项（可空）' } }, required: ['text', 'kind'] } },
  { name: 'search_x', needs: 'x', description: '在 X（推特）上搜最近 7 天的帖子，看官方账号原话、开发者和用户的一手反应、实测和吐槽。X 按读到的帖子收费，所以少用、搜得准：关键词用英文或产品原名，能限定账号就填 from；一次 10–30 条够了，同一个问题别反复搜。读某条帖子的全文用 read_page 打开它的链接。', input_schema: { type: 'object', properties: { query: { type: 'string', description: 'X 搜索语法，比如 "DeepSeek Harness" lang:en、"Kimi K2" min_faves:50' }, from: { type: 'string', description: '只看这些账号，空格隔开，比如 deepseek_ai karpathy' }, max: { type: 'integer', description: '最多几条，10–50，默认 20' } }, required: ['query'] } },
  { name: 'read_page', description: '读一个网页的原文全文（不是摘要）。查资料时用它代替 web_fetch / WebFetch：拿到的是原文，数字、原话、口径都不会丢。会自动换办法读：直接抓 → 无头 Chrome → GitHub 接口 → Jina → 让 Claude 读，要登录的站（X、微博、知乎、小红书）也能读到大部分。长文分段读：返回里会告诉你 from 填多少接着读。原文会存进这篇的资料夹。', input_schema: { type: 'object', properties: { url: { type: 'string' }, from: { type: 'integer', description: '从第几个字开始读，默认 0' } }, required: ['url'] } },
  { name: 'save_research', description: '把查到的资料记进这篇的「资料」页（作者能看到，之后每一轮你也会读到）。每条一个问题或主题；结论写具体事实和数字（带时间和口径）；tier 标来源等级；quote 放原文里支撑结论的那句话（原样摘，不改字）；sources 放出处链接。只有转述、没有一手来源的关键数字，结论里写明“待核”。资料页已有的不要重复记。', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { q: { type: 'string', description: '问题或主题，比如「日活和月活」' }, answer: { type: 'string', description: '查到的结论：具体事实、数字（带时间、口径）、谁说的' }, tier: { type: 'string', enum: ['官方一手', '社区一手', '报道', '转述'], description: '官方一手：公司官网、官方文档、官方账号、GitHub 官方仓库；社区一手：开发者、用户本人的帖子和实测；报道：媒体原创报道；转述：转载、聚合、二手解读' }, quote: { type: 'string', description: '原文里支撑结论的那句话，原样摘录' }, sources: { type: 'array', items: { type: 'string' }, description: '出处链接' } }, required: ['q', 'answer', 'tier'] } } }, required: ['items'] } },
  { name: 'recall_memory', description: '按编号读某几条记忆的全文。平时用不到：相关的记忆已经按这一轮的事挑好放在系统提示里了。', input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] } },
  { name: 'self_check', description: '按作者记忆里能自查的规则，检查这一轮改过的正文或卡片文案（不传 text 就自动取这一轮改过的段落）。返回违反的地方和改法。改完正文收尾前调用；查出问题改掉后再调一次。', input_schema: { type: 'object', properties: { text: { type: 'string', description: '要检查的文字（可空）' } } } },
  { name: 'forget', description: '删掉一条全局记忆（作者说某条不对、不用再记了）。id 在系统提示的记忆列表里，括号里的就是。', input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'list_projects', description: '列出作者所有的文章和小红书卡片项目（标题、类型、状态、更新时间、标签）。', input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['article', 'card'] } } } },
  { name: 'read_project', description: '只读地看作者另一个项目的文件，用来参考以前的写法、版式、选题。project 填项目 id 或标题；path 不填就读正文（文章是 article.md，卡片是 index.html）。', input_schema: { type: 'object', properties: { project: { type: 'string' }, path: { type: 'string' } }, required: ['project'] } },
  { name: 'search_projects', description: '在作者所有文章和卡片的标题、标签、笔记、正文里搜关键词，返回命中的片段。', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'browse_plaza', description: '看选题广场里最近的动态（按一手程度和热度排好，官方一手 > 社区一手 > 报道 > 转述）。', input_schema: { type: 'object', properties: { query: { type: 'string' }, days: { type: 'integer', description: '最近几天，默认 7' } } } },
  { name: 'ask_decisions', description: '把需要作者拍板的事做成卡片：每件一张，带 2–3 个选项按钮，作者点完会把决定一起发回给你。用在“改不改某处”“二选一”“要不要接着做某件事”。用了它，回复正文里就不要再把这些问题列一遍。', input_schema: { type: 'object', properties: { items: { type: 'array', description: '要定的事，一般 1–5 件', items: { type: 'object', properties: { title: { type: 'string', description: '一句话说清要定什么，比如“导语里『游戏上线后…』这句改成更顺的说法？”' }, detail: { type: 'string', description: '可选：背景或你的建议，一两句' }, options: { type: 'array', items: { type: 'string' }, description: '2–3 个选项，短，比如 ["改", "不改"]、["挪到处决那段后面", "放着不动"]。不填默认 ["好，改吧", "先不用"]' }, quotes: { type: 'array', items: { type: 'string' }, description: '这件事在正文里的位置：从正文（文章是 article.md，卡片是 index.html 里的文字）原样复制 1–3 小段，每段 8–40 字，能唯一定位到那一处，不要加省略号、不要改字。正文里会标出来，作者点一下就跳过去。涉及正文某处时一定要填' } }, required: ['title'] } } }, required: ['items'] } },
  { name: 'load_skill', description: '读一个技能的完整说明（SKILL.md）和它带的文件列表。做的事和系统提示里列出的某个技能相关时，先读再做。', input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'read_skill_file', description: '读技能文件夹里的其他文件（SKILL.md 里提到的参考资料、模板等）。', input_schema: { type: 'object', properties: { name: { type: 'string' }, path: { type: 'string' } }, required: ['name', 'path'] } },
  { name: 'search_github_skills', description: '在 GitHub 上搜别人写好的技能（含 SKILL.md 的文件夹），返回仓库、路径、名字、简介、星数。关键词用英文效果更好，可以中英文各搜一次。', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'inspect_github_skills', description: '看一个 GitHub 仓库（或其中某个文件夹）里有哪些技能。', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'request_install_skill', description: '请作者确认安装一个 GitHub 上的技能（第三方技能会影响你的做法，必须作者点头才装）。先 search_github_skills / inspect_github_skills 确认路径，必要时 web_fetch 看过 SKILL.md 内容再申请。装好后作者下次发消息时就能用。', input_schema: { type: 'object', properties: { repo: { type: 'string', description: 'owner/repo' }, path: { type: 'string', description: 'SKILL.md 在仓库里的路径' }, reason: { type: 'string', description: '为什么推荐这个，一句话' } }, required: ['repo', 'path', 'reason'] } },
  { name: 'list_templates', only: 'article', description: '列出可以套用的文章模板（墨滴 mdnice、doocs/md 的开源主题，加上作者其他文章的样式），带名字、说明、主色。', input_schema: { type: 'object', properties: {} } },
  { name: 'apply_template', only: 'article', description: '把这篇文章的样式整体换成某个模板（只换 theme.css，正文不动；会自动存旧样式，可以撤销）。换完要 build_article，再 screenshot_page("article") 看效果。', input_schema: { type: 'object', properties: { template: { type: 'string', description: '模板名字或 id' } }, required: ['template'] } },
  { name: 'build_article', only: 'article', description: '按现在的 article.md、theme.css、build.mjs 构建一遍公众号版和 X 版，返回是否成功和报错。改了样式或排版脚本后要调用一次。', input_schema: { type: 'object', properties: {} } },
  { name: 'find_images', description: '打开一个网页，列出上面的图片（先列 og:image 分享图，再列正文图片），返回图片地址、alt、尺寸。用来从官网、产品页、发布公告里找一手配图。', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'save_image', description: '把一张网上的图片下载进素材库，返回 asset_id。之后用 insert_image 插进文章。', input_schema: { type: 'object', properties: { url: { type: 'string', description: '图片地址' }, title: { type: 'string', description: '这张图是什么，一句话' }, page: { type: 'string', description: '图片所在的网页地址（写图注来源用）' } }, required: ['url', 'title'] } },
  { name: 'generate_image', description: '调用生图接口生成配图，存进素材库。可以同时给出插在文章哪段后面和图注，生成后自动插入。', input_schema: { type: 'object', properties: { prompt: { type: 'string', description: '画面描述，要具体：主体、构图、风格、配色、光线；尽量不要画面里的文字' }, title: { type: 'string', description: '这张图是干什么用的，一句话' }, size: { type: 'string', enum: ['landscape', 'square', 'portrait'], description: '横图（默认，适合正文）、方图、竖图' }, n: { type: 'integer', description: '生成几张备选，1 到 4，默认 1' }, insert_after: { type: 'string', description: '可选。生成后插在文章里哪段后面：从 article.md 原样复制那段里的一句话' }, caption: { type: 'string', description: '可选。图注' } }, required: ['prompt', 'title'] } },
  { name: 'insert_image', only: 'article', description: '把素材库里的一张图插进文章：复制到 img/，在 after 那段后面插入图片和图注。after 为空就放在文末。', input_schema: { type: 'object', properties: { asset_id: { type: 'string' }, after: { type: 'string', description: '从 article.md 原样复制的一句话，图片插在它所在那段的后面' }, caption: { type: 'string', description: '图注，可以带 <a href> 链接到来源' }, alt: { type: 'string' } }, required: ['asset_id'] } },
  { name: 'screenshot_page', description: '截图看一个网页长什么样（做模板时看参考网页的版式、配色、字号）。文章项目里 url 填 "article" 表示看这篇文章现在构建出来的公众号版成品（先 build_article）；from 是从页面多少像素开始往下看，长文章可以分几次看。', input_schema: { type: 'object', properties: { url: { type: 'string', description: '网页地址，或 "article"' }, from: { type: 'integer', description: '从第几像素开始，默认 0' } }, required: ['url'] } },
  { name: 'search_assets', description: '在素材库里找图（包括 AI 生成的、网上存的、各篇文章 img/ 里已有的）。', input_schema: { type: 'object', properties: { query: { type: 'string' }, this_article_only: { type: 'boolean' } } } },
];
// 生成长内容时边生成边传过来；收到后自己检查参数是否完整
const CHECK_SYS = '你是校对员。给你的通常只是这一轮改过的几段，不是全文：检查项里讲全文结构的（首段、末段、小标题、目录、两节重复）只在给的文字确实包含那部分时才查，没给的不要报。拿作者给的检查项逐条对照文字，只报真正违反的地方：原样引用那一句（quote，要能在原文里找到），说明违反了哪一条（id）、问题是什么（problem）、怎么改（fix，给出改好的句子）。没把握的不要报。只输出 JSON：{"issues":[{"id":"","quote":"","problem":"","fix":""}]}，没有问题就输出 {"issues":[]}。最多 12 条。';
const toolsFor = type => TOOLS.filter(t => (!t.only || t.only === type) && (t.needs !== 'x' || xapi.config().token)).map(({ needs, ...t }) => t);
const apiTools = list => list.map(({ only, ...t }) => ({ ...t, eager_input_streaming: true }));
const SERVER_TOOLS = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 12 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 12 }];

const ARTICLE_FILES = `项目里的文件：
- outline.md：大纲（大纲页里编辑的就是它，和正文分开）。
- article.md：正文。Markdown，夹着一些 HTML 块，比如 <p class="deck"> 导语、<p class="lede"> 首段、<p class="cap"> 图注、<div class="toc"> 目录、<div class="mast"> 刊头。
  格式要照模板的写法，别自己发明：大标题「# 标题」只有一个；小标题写「## 01 小标题」（编号两位）；目录写成 <div class="toc"><p class="toc-t">本篇内容</p><p class="toc-i"><b>01</b>　小标题</p>……</div>，一节一个 <p class="toc-i">；图注写 <p class="cap"><b>图 1</b>说明</p>。不要加「**第一部分：……**」这类分组标签，也不要用「---」分隔线，模板不认，排出来很难看；想分几大块就体现在小标题和目录里。改格式前先 read_file 看看文章里现有的写法照着来。
- theme.css：文章样式。build.mjs 用 juice 把它写成行内样式贴进公众号，所以只用普通 CSS：不要 CSS 变量、:has()、动画、position:fixed、外部字体，公众号会过滤掉。
- build.mjs：排版脚本，决定 Markdown 怎么变成公众号版和 X 版 HTML。比如图片按文件名套样式：img/hero.png 头图，img/c-* 章节封面，img/p-* 人物卡，img/d数字开头 是示意图，其余是普通配图。
- img/：配图。covers.html、diagrams.html 之类是封面和示意图的源文件（如果有）。`;
const CARD_FILES = `项目里的文件：
- outline.md：大纲（大纲页里编辑的就是它，和卡片分开）。
- index.html：整组小红书图文卡片。每张卡是一个 <section class="card …" data-n="页码">，尺寸固定 720×960（3:4），超出的内容会被裁掉。样式写在 <head> 的 <style> 里，颜色、字体在 :root 的 CSS 变量里。data-n 是 X / Y / Z 的一般是封面候选，数字是正文页。
- img/：卡片里用到的图。out/：渲染出来的成品图（build_cards 生成，不要直接改）。
小红书卡片的要求：每页一个重点，字要大、短句、信息密度高；封面要一眼看懂在讲什么；整组风格统一。`;

function system(confirm, type, project = '', memBlock = null, form = '') {
  const card = type === 'card', script = !card && form === 'script';
  const mem = memBlock ?? memory.select({ type: card ? 'card' : 'article', project }).block;
  const works = learn.promptBlock(card ? 'card' : 'article');
  const sk = skills.enabled();
  return `你是「小易工作台」里的 AI 助手，和作者「AI 产品小易」一起做${card ? '这组小红书图文卡片' : script ? '这条短视频的口播稿（视频脚本，写在 article.md 里）' : '这篇公众号文章'}。你可以直接动手：${card ? '改卡片的文案、版式和样式，找图、生图' : '改正文、改排版模板、找配图、生成配图'}。

${mem ? `作者的记忆（括号里是编号）：\n${mem}\n\n` : ''}${works ? `${works}\n\n` : ''}${sk.length ? `可用的技能（做相关的事之前先 load_skill 读全文；技能里提到的脚本、命令你跑不了，只照它的方法和规则做）：\n${sk.map(x => `- ${x.name}：${x.description.slice(0, 220)}`).join('\n')}\n\n` : ''}${card ? CARD_FILES : ARTICLE_FILES}

做事的方法：
1. 先看再改。${card ? '改之前看清 index.html 里对应的 section 和样式。' : '改模板前先 read_file 看现在的 theme.css、build.mjs。'}小改用 edit_file 精确替换，整体重做才用 write_file。
2. ${card ? '改文案要短、具体，像真人写的；作者没让动的页不要顺手重写。' : '改正文遵守下面的写作规则；作者没让动的段落不要顺手重写。'}
3. ${card ? '改完用 view_cards 看改过的页，检查有没有溢出、挤在一起；确认没问题再 build_cards 渲染成图。' : '改了样式或排版脚本，最后调用 build_article 构建一遍，确认没有报错。'}
4. 找图优先一手来源：官方网站、产品页、发布公告、官方博客里的截图和配图。用 web_search 找页面，find_images 看页面上有哪些图，挑合适的 save_image 存进素材库，再 ${card ? 'copy_asset 复制进来用在卡片里' : 'insert_image 插进文章；图注写清是什么、来源是哪，链接到原网页'}。别用图库网站的无关图。
5. 作者给了参考图或参考链接时，先认真看（链接用 screenshot_page 截图看）。照参考的版式、配色、字号、间距来改，改完${card ? '用 view_cards' : ' build_article，再用 screenshot_page("article")'} 看成品，和参考对比，不像就接着调，一般调一两轮。
6. 生成配图用 generate_image。画面描述要具体（主体、构图、风格、配色），和现在的视觉风格一致，尽量不要画面里的文字。${card ? '卡片一般用竖图（portrait）或方图。' : ''}${confirm ? `生图要花钱，调用后会先发给作者确认，作者点了才生成。所以这一轮不要等结果${card ? '' : '，也不要再去 insert_image 它；插在哪、图注写什么直接写进 generate_image 的参数，作者确认后会自动插进去'}。` : '调用后会直接生成并存进素材库。'}
7. 可以参考作者别的作品：list_projects、search_projects、read_project 只读地看以前的文章和卡片（比如“照上一篇的版式来”“别和以前写过的重复”）；browse_plaza 看最近的一手动态。
8. 上面的记忆是按这一轮要做的事挑出来的：守则每次都要守；这篇的约定只对这篇，优先于守则；「和这一轮相关的经验」是具体做法，照着做。觉得还缺哪方面的经验，可以 recall_memory 按编号读，但一般不用。作者明确说“记住……”时马上用 remember 记（只对这篇成立的 scope 填 project），并在回复里说一句记了什么；作者说某条不对，用 forget 删掉。其余的每轮结束后工作台会自动整理，你不用每次都记。
9. 需要作者拍板的事（改不改、二选一、要不要接着做），最后用 ask_decisions 做成卡片，不要在回复里列“还在等你定的几件事”这种清单。涉及正文某处的，quotes 里原样复制那几句，正文里会标出来、作者能直接跳过去。能自己判断的小事直接做，别什么都问。
10. 作者让你找技能、装技能时：用 search_github_skills 搜（英文关键词为主），挑两三个星多、说明清楚、和需求最贴的，用 request_install_skill 请作者确认，别一次推太多。
11. 所有文字都用中文。调用工具的过程中不用解说自己在干什么（界面上会自动显示每一步），最后统一总结。
12. 每次改文件都会自动存历史版本，作者可以一键撤销整轮改动，所以明确的要求放手去改，不用反复确认。
13. 大纲稿：作者说“先聊聊”“先定大纲”“先出个框架”“等我点头再写”时，先出大纲稿，不写正文。顺序不能乱：
    ① 先查资料。顺序：先看「资料」里已经有的；再 browse_plaza 看选题广场里分好级的动态；然后去涉及公司的官方渠道找（官网、官方文档、更新日志、官方博客、GitHub 官方仓库，用 site: 限定域名搜）；${xapi.config().token ? '再用 search_x 在 X 上搜官方账号的原话和开发者、用户的一手反应（这是社区一手，要带账号和日期）；' : ''}最后才是媒体报道。找到的页面用 read_page 读原文，不要只看搜索摘要或 web_fetch / WebFetch 的概括。关键事实和数字用 save_research 记进资料页：标来源等级，quote 摘原文那句话，写清时间、口径、出处；关键数字只有转述、没有一手来源的，写明“待核”，正文里写成“据某某报道”。资料没查够之前不要定标题。
    ② 汇总资料，想清楚这篇最值得讲的几件事、每件的核心结论是什么，再定结构。
    ③ 定标题。小标题必须自带信息：读者只看这一行，就知道这节讲什么、能得到什么结论。写具体的主语和事实（谁、做了什么、结果是什么；数字要带对象和单位，比如“每天烧掉 92 万亿 Token，多半花在插件反复调用上”，而不是“92 万亿 Token 一天，这笔账怎么算”）。小标题写成陈述句、直接给结论，不写问句（“为什么……”“怎么算的”“能拿走什么”都不行），不用谜语和双关、不用没头没尾的数字、不用圈内黑话，20 字左右。比如“154 万只算官方 API 用户，人均每天约 6000 万 Token”“装到十几个插件就容易卡死，官方说会补稳定性”。大标题也按这个标准起 2–3 个。写完把所有标题单独读一遍，有一个看不懂、或者是问句就重写。
    ④ 把大纲写进 outline.md（大纲页编辑的就是它，和${card ? '卡片' : '正文'}分开；这时不要动 ${card ? 'index.html' : 'article.md'}）。照这个格式写，别的格式大纲页显示不好：
       第一行「# 最推荐的大标题」（只有这一个一级标题）；下一行「备选标题：A／B」；然后「> 一句话说这篇讲什么」；「开头：打算怎么起，一两句」；
       每节「## 01 小标题」，下面 3–5 条「- 要点」（每条一句，写清讲什么、用资料里的哪个事实或数字，没查到的标【待查】）；要配图或表就在要点后面加一行「配图：……」。${card ? '卡片每页算一节，「## 01 封面」「## 02 …」，要点就是这页要放的文案要点。' : ''}大纲里不要写成段的正文。
    写完先调一次 self_check 查标题和要点，有问题改掉。然后在回复里用两三句话说这版大纲的思路和查到了哪些关键资料；还不清楚、又会影响整篇的事（最多 3–4 个，要求里写了的不要问）做成 ask_decisions 卡片。不要发「大纲这样行吗」这类卡片，也不要问“可以开始写了吗”：大纲页上有「大纲定了，开始写${card ? '卡片' : '正文'}」按钮，作者点了才进写作页。
    还在大纲页的时候：作者在大纲里直接改过的，以改后的为准；作者问“大纲有什么问题”，具体指出问题（哪两节重了、哪里缺资料、标题哪个看不懂、顺序哪里不顺、和要求哪里对不上），能直接改的用 edit_file 改 outline.md、拿不准的做成卡片问，缺资料就先去查；只改大纲，不要写${card ? '卡片' : '正文'}。
    作者点了按钮（会说“大纲定了，照大纲写${card ? '卡片' : '正文'}”）：照 outline.md 一节一节写进 ${card ? 'index.html，每节一页，替换模板里的占位页' : 'article.md：「# 」用大纲里的推荐标题，替换模板里的占位内容，目录和小标题照大纲，要点展开成段落'}；大纲里标【待查】的先去查，查不到就写得稳妥些（“据某某报道”或者不写这个数字）。
14. 作者的要求模糊，或者会大面积改动（整篇、整节、结构、风格、语气）时，先别动手：用 ask_decisions 发一张卡片，title 写“我理解你要……”，detail 写打算改哪几处、改到什么程度，quotes 放涉及的原句，options 给「就这么改」「不对，我再说说」，这一轮就停在这里。作者的说法在【作者的口头说法】里有的，照那里的意思理解，不用再问。作者说“像我”“照以前那样”时，参照作品档案里的成稿片段，必要时 read_project 看全文。明确的小改动直接做。
15. 改完正文或卡片文案，收尾前调用 self_check 按作者的记忆自查；查出来的问题自己改掉，再查一遍没问题了才总结。
16. 做完用几句大白话告诉作者：做了什么、改了哪些文件、还有什么建议。不要客套，不要列一长串。

写作规则：
${ai.WRITING_RULES.replace('只输出改好的文字本身，不要前言、不要解释、不要用代码块包起来。', '')}${script ? `
${ai.SCRIPT_RULES}
- 上面讲文章格式的地方（目录、两位编号的小标题、图注）口播稿不用；大纲页的每一节对应口播稿的一段。没人要求就不用给口播稿找配图、换模板。
- 作者说“压到 60 秒”“改成 90 秒”这类时长要求时，按每秒约 4.5 个字删改口播原话，并把各段小标题里的「约 X 秒」改对。` : ''}`;
}

export const history = dir => readJ(dir, 'chat.json', []);
export const jobs = dir => readJ(dir, 'imgjobs.json', []);

// 跑一轮。onEvent 收到的事件：text（回复文字）、step（做了哪一步）、asset（新存的图）、job（待确认的生图）、files（改过的文件）
// 正在跑的任务：按项目登记在服务端，和网页的连接脱钩——页面刷新、网络断了都不影响，只有作者点「停下」才停
const RUNS = new Map();
export function status(dir) {
  const r = RUNS.get(dir); if (!r) return { running: false };
  return { running: true, tid: r.tid, startedAt: r.startedAt, message: r.message, steps: r.steps, text: r.text };
}
export function stop(dir) { const r = RUNS.get(dir); if (r) r.ctrl.abort(); return { ok: true, stopped: !!r }; }
// 助手干活时作者又说了几句：放进这一轮的收件箱，助手下一步就会看到，一起考虑
export function inject(dir, text) {
  const r = RUNS.get(dir); if (!r) throw new Error('助手已经做完了，直接发就行');
  text = String(text || '').trim(); if (!text) throw new Error('说点什么再发');
  r.inbox.push(text); r.injected.push(text);
  const h = history(dir); h.push({ role: 'user', text, images: [], t: new Date().toISOString(), tid: r.tid, inject: true }); writeJ(dir, 'chat.json', h.slice(-60));
  return { ok: true };
}
// Claude Code 的工具桥调回来：只认这一轮的密钥
export async function callTool(dir, { key, list, name, input } = {}) {
  const r = RUNS.get(dir);
  if (!r?.key || r.key !== key) throw new Error('这一轮任务已经结束了');
  if (list) return { tools: r.toolDefs };
  const { content, is_error } = await r.exec(name, input);
  const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content) }];
  return { is_error, content: blocks.map(b => b.type === 'image' ? { type: 'image', data: b.source.data, mimeType: b.source.media_type } : { type: 'text', text: String(b.text ?? '') }) };
}

export async function run(dir, opts = {}) {
  if (RUNS.has(dir)) throw new Error('助手还在做上一件事，按 Esc 可以停下');
  try { return await run0(dir, opts); } finally { RUNS.delete(dir); }   // 不管在哪一步出错，都不能一直挂着“正在跑”
}
async function run0(dir, { message, focus = '', stage = '', provider, title = '', images: refs = [], onEvent = () => {}, signal } = {}) {
  const c = ai.claudeFor(provider), cc = c ? null : ai.ccFor(provider);
  if (!c && !cc) throw new Error('能动手的助手要用 Claude、Claude Code 或客户端的模型，在对话框下面换一个');
  const id = path.basename(dir), confirm = images.needConfirm(), loaded = core.load(dir), ptype = loaded?.type || 'article', pform = loaded?.form || '', myTools = toolsFor(ptype);
  const turn = { id: uid(), t: new Date().toISOString(), files: {}, steps: [], assets: [], jobs: [], skillReqs: [], decisions: [], memo: [] };
  // 自己管停止：外面传进来的信号也接上
  const own = new AbortController(); if (signal) signal.addEventListener('abort', () => own.abort()); signal = own.signal;
  const live0 = { tid: turn.id, startedAt: turn.t, message, steps: turn.steps, text: '', ctrl: own, inbox: [], injected: [] }; RUNS.set(dir, live0);
  const takeInbox = () => { const x = live0.inbox.splice(0); if (x.length) step('message-square', `收到你的补充：${x.join('；').slice(0, 40)}`); return x; };
  const emit0 = onEvent; onEvent = ev => { if (ev.type === 'text') live0.text += ev.text; try { emit0(ev); } catch {} };
  // 作者的消息先存下来：中途出什么事，至少看得到自己说了什么；上一轮没完成留下的同一句话不重复
  const histBefore = history(dir).slice(-12);
  { const h = history(dir), last = h[h.length - 1]; if (last?.role === 'user' && last.text === message) h.pop(); h.push({ role: 'user', text: message, images: refs.map(r => r.file), t: turn.t, tid: turn.id }); writeJ(dir, 'chat.json', h.slice(-60)); }
  const step = (icon, text) => { turn.steps.push({ icon, text }); onEvent({ type: 'step', icon, text }); };
  const track = rel => {
    if (rel in turn.files) return;
    const f = path.join(dir, rel);
    turn.files[rel] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    if (turn.files[rel] != null) ed.snapshot(dir, rel, 'AI助手');
  };

  const tools = {
    // 用客户端的模型时，联网搜索和读网页由工作台调客户端来做（直连 Claude 时是服务端自己做的）
    ...(c?.dsh ? {
      async web_search({ query }) { step('search', `搜索「${query}」`); return ai.dshWeb('web_search', { query }, signal); },
      async web_fetch({ url }) { step('globe', `打开 ${String(url).replace(/^https?:\/\//, '').slice(0, 60)}`); return ai.dshWeb('web_fetch', { url }, signal); },
    } : {}),
    list_files() {
      const out = [];
      const walk = (d, rel) => { for (const n of fs.readdirSync(d).sort()) { if (n.startsWith('.') || n === 'node_modules' || (!rel && n === 'out')) continue; const p = path.join(d, n), r = rel ? rel + '/' + n : n; const s = fs.statSync(p); if (s.isDirectory()) walk(p, r); else out.push(`${r}  ${(s.size / 1024).toFixed(1)} KB`); if (out.length > 200) return; } };
      walk(dir, ''); return out.join('\n');
    },
    read_file({ path: p }) {
      const { f, rel } = safe(dir, p);
      if (!TEXT_EXT.test(f)) throw new Error('只能读文本文件');
      if (!fs.existsSync(f)) throw new Error('没有这个文件：' + rel);
      step('file-text', `看了 ${rel}`);
      const t = fs.readFileSync(f, 'utf8');
      return t.length > 80000 ? t.slice(0, 80000) + '\n…（太长，后面省略了）' : t;
    },
    edit_file({ path: p, old_text, new_text, replace_all }) {
      const { f, rel } = safe(dir, p);
      if (!fs.existsSync(f)) throw new Error('没有这个文件：' + rel);
      const t = fs.readFileSync(f, 'utf8'), n = old_text ? t.split(old_text).length - 1 : 0;
      if (!n) throw new Error(`在 ${rel} 里没找到 old_text。要从文件里原样复制（先 read_file 看一下现在的内容）`);
      if (n > 1 && !replace_all) throw new Error(`old_text 在 ${rel} 里出现了 ${n} 次，多带几行上下文让它唯一，或者设 replace_all: true`);
      track(rel);
      fs.writeFileSync(f, replace_all ? t.split(old_text).join(new_text) : t.replace(old_text, () => new_text));
      step('pen-line', `改了 ${rel}`);
      return `已改好${n > 1 ? `（替换了 ${n} 处）` : ''}`;
    },
    write_file({ path: p, content }) {
      const { f, rel } = safe(dir, p);
      if (!TEXT_EXT.test(f)) throw new Error('只能写文本文件（.md .css .html .mjs .js .json .svg 等）');
      track(rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, content);
      step('file-pen-line', `${turn.files[rel] == null ? '新建' : '重写'}了 ${rel}`);
      return `已写入 ${rel}（${content.length} 字符）`;
    },
    async build_article() {
      try { const out = await core.build(dir); step('play', '构建了一遍，没有报错'); return '构建成功：\n' + String(out).slice(-800); }
      catch (e) { step('triangle-alert', '构建报错了'); throw new Error('构建失败：\n' + e.message.slice(-2000)); }
    },
    async find_images({ url }) {
      const r = await assets.pageImages(url);
      step('images', `看了网页上的图片：${new URL(r.page).hostname}（${r.images.length} 张）`);
      return JSON.stringify({ page: r.page, title: r.title, images: r.images.slice(0, 25) });
    },
    async save_image({ url, title: t, page }) {
      const a = await assets.fromUrl(url, { title: t, page: page || '', project: id });
      turn.assets.push(brief(a)); onEvent({ type: 'asset', asset: a });
      step('download', `存进素材库：${t}`);
      return JSON.stringify({ asset_id: a.id, file: a.file, width: a.w || null, height: a.h || null });
    },
    async generate_image({ prompt, title: t, size = 'landscape', n = 1, insert_after = '', caption = '' }) {
      const job = { id: uid(), turn: turn.id, prompt, title: t, size, n: Math.min(4, Math.max(1, +n || 1)), after: insert_after, caption, status: 'pending', t: new Date().toISOString(), assets: [] };
      if (confirm) {
        const l = jobs(dir); l.push(job); writeJ(dir, 'imgjobs.json', l);
        turn.jobs.push(job.id); onEvent({ type: 'job', job });
        step('sparkles', `准备生成配图：${t}（等你确认）`);
        return '已经把生图请求发给作者确认（生图要花钱，作者点了才生成）。确认后会自动生成' + (insert_after ? '并插到你指定的位置' : '并存进素材库') + '。这一轮不用再管这张图。';
      }
      step('sparkles', `生成配图：${t}`);
      if (insert_after) track('article.md');
      const done = await runJob(dir, job, {});
      turn.assets.push(...done.assets.map(brief)); done.assets.forEach(a => onEvent({ type: 'asset', asset: a }));
      return JSON.stringify({ asset_ids: done.assets.map(a => a.id), inserted: !!done.inserted });
    },
    insert_image({ asset_id, after = '', caption = '', alt = '' }) {
      track('article.md');
      const r = assets.insert(dir, asset_id, { after, caption, alt });
      step('images', `插入配图 ${r.file}`);
      return `已插入：${r.markdown || r.file}`;
    },
    async screenshot_page({ url, from = 0 }) {
      from = Math.max(0, Math.min(16000, +from || 0));
      if (url === 'article') {
        const f = path.join(dir, 'out', 'wechat.html');
        if (!fs.existsSync(f)) throw new Error('还没构建过，先调用 build_article');
        const shots = await shoot(fileUrl(f), 600, from + 4000, [[from, 2000], [from + 2000, 2000]]);
        step('scan-text', `看了成品效果（${from}–${from + 4000} 像素）`);
        return [...shots.map(imgBlock), { type: 'text', text: `这是公众号版成品从 ${from} 到 ${from + 4000} 像素的截图（分两段）。要往下看就把 from 设成 ${from + 4000}。` }];
      }
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/.test(u.hostname)) throw new Error('这个地址不能截图');
      const shots = await shoot(u.toString(), 1280, from + 1600, [[from, 1600]]);
      step('scan-text', `截图看了 ${u.hostname}`);
      return [imgBlock(shots[0]), { type: 'text', text: `${u} 从 ${from} 像素开始往下 1600 像素的截图（宽 1280）。要往下看就把 from 设成 ${from + 1600}。` }];
    },
    list_templates() {
      step('palette', '翻了模板库');
      return JSON.stringify(tpl.list().filter(t => t.project !== id).map(t => ({ id: t.id, name: t.name, group: t.group, desc: t.desc, accent: t.accent })));
    },
    apply_template({ template }) {
      const t = tpl.find(template); if (!t) throw new Error('没有这个模板：' + template + '。先 list_templates 看看有哪些');
      track('theme.css'); tpl.apply(dir, t.id);
      step('palette', `换成了模板「${t.name}」`);
      return `已换成「${t.name}」。记得 build_article 后用 screenshot_page("article") 看效果；作者的专有元素（刊头、导语、目录、图注）模板里都有样式。`;
    },
    async build_cards() {
      try { const out = await core.build(dir); step('play', '把卡片渲染成图了'); return '渲染成功：\n' + String(out).slice(-800); }
      catch (e) { step('triangle-alert', '渲染报错了'); throw new Error('渲染失败：\n' + e.message.slice(-2000)); }
    },
    async view_cards({ pages = [] }) {
      const html = path.join(dir, 'index.html');
      const all = [...fs.readFileSync(html, 'utf8').matchAll(/<section\b[^>]*class="[^"]*\bcard\b[^"]*"[^>]*data-n="([^"]+)"/g)].map(m => m[1]);
      const want = (pages?.length ? pages.map(String) : all).filter(n => all.includes(n)).slice(0, 8);
      if (!want.length) throw new Error(`没有这些页。现有的页码：${all.join('、')}`);
      const out = [];
      for (const n of want) { const [b64] = await shoot(`${fileUrl(html)}?c=${encodeURIComponent(n)}`, 720, 960, [[0, 960]]); out.push({ type: 'text', text: `第 ${n} 页` }, imgBlock(b64)); }
      step('scan-text', `看了卡片 ${want.join('、')}`);
      return [...out, { type: 'text', text: `以上是第 ${want.join('、')} 页现在的样子（720×960）。全部页码：${all.join('、')}。` }];
    },
    copy_asset({ asset_id }) {
      const r = assets.copyInto(dir, asset_id);
      step('images', `把素材放进了 ${r.file}`);
      return `已复制到 ${r.file}，在卡片里写 <img src="${r.file}"> 就能用`;
    },
    remember({ text, kind, scope, why, detail, check }) {
      const it = memory.add({ text, kind, scope, why, detail, check, source: 'agent', project: id, evidence: String(message).slice(0, 60), ctx: { title, body: mainText } });
      turn.memo.push({ op: 'add', id: it.id, kind: it.kind, text: it.text });
      step('bookmark', `记住了：${it.text.slice(0, 40)}`);
      return `已记进全局记忆（${it.id}）`;
    },
    async search_x({ query, from = '', max = 20 }) {
      const l = await xapi.search(query, { from, max: Math.min(50, max) });
      step('at-sign', `在 X 上搜「${String(query).slice(0, 30)}」（${l.length} 条，本月还能读 ${xapi.readsLeft()} 条）`);
      if (!l.length) return '没搜到。换个关键词（产品原名、英文），或者去掉账号限制再试一次。';
      return l.map((t, i) => `${i + 1}. @${t.handle}（${t.name}）${String(t.time).slice(0, 10)}，${t.metrics}\n${t.text.slice(0, 1200)}\n${t.url}`).join('\n\n');
    },
    async read_page({ url, from = 0 }) {
      const sd = path.join(wdir(dir), 'sources'); fs.mkdirSync(sd, { recursive: true });
      const f = path.join(sd, crypto.createHash('md5').update(String(url)).digest('hex').slice(0, 12) + '.json');
      let r = null; try { r = JSON.parse(fs.readFileSync(f, 'utf8')); if (Date.now() - Date.parse(r.t) > 864e5) r = null; } catch {}
      if (!r) { r = { ...(await pz.readUrl(url, { max: 80000 })), t: new Date().toISOString() }; fs.writeFileSync(f, JSON.stringify(r, null, 2)); }
      from = Math.max(0, +from || 0); const CH = 12000, part = r.content.slice(from, from + CH), more = from + CH < r.content.length;
      if (!from) step('globe', `读了原文 ${String(url).replace(/^https?:\/\//, '').slice(0, 50)}（${r.via}，${r.content.length} 字）`);
      return `《${r.title || ''}》${url}\n（${r.via}读到，全文 ${r.content.length} 字，这是第 ${from}–${from + part.length} 字${more ? `；接着读把 from 设成 ${from + CH}` : '，已读完'}）\n\n${part}`;
    },
    save_research({ items }) {
      const list = readJ(dir, 'research.json', []), added = [];
      for (const it of (items || []).slice(0, 20)) {
        if (!it?.q || !it?.answer) continue;
        const x = { id: uid(), q: String(it.q).slice(0, 120), answer: String(it.answer).slice(0, 3000), tier: ['官方一手', '社区一手', '报道', '转述'].includes(it.tier) ? it.tier : '', quote: String(it.quote || '').slice(0, 600), sources: (it.sources || []).map(String).filter(u => /^https?:/.test(u)).slice(0, 8), t: new Date().toISOString(), web: true, by: 'agent' };
        list.unshift(x); added.push(x.q);
      }
      writeJ(dir, 'research.json', list.slice(0, 200));
      step('notebook-pen', `记进资料 ${added.length} 条：${added.join('、').slice(0, 40)}`);
      return `已记进资料页 ${added.length} 条`;
    },
    recall_memory({ ids }) {
      const l = memory.recall(Array.isArray(ids) ? ids : []);
      if (!l.length) throw new Error('没找到这些编号的记忆');
      step('bookmark', `读了 ${l.length} 张经验卡片`);
      return l.map(it => `(${it.id}) [${memory.KINDS[it.kind]}] ${it.text}${it.why ? `\n为什么：${it.why}` : ''}${it.detail ? `\n怎么做：${it.detail}` : ''}`).join('\n\n');
    },
    async self_check({ text = '' } = {}) {
      turn.checked = true;
      let body = String(text || '').trim();
      if (!body) {
        const rel = ptype === 'card' ? 'index.html' : 'article.md', f = path.join(dir, rel);
        const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '', before = turn.files[rel];
        if (before == null) return '这一轮还没改正文，没东西要查。';
        const old = new Set(before.split(/\n{2,}/).map(x => x.trim()));
        body = cur.split(/\n{2,}/).map(x => x.trim()).filter(x => x && !old.has(x)).join('\n\n');
        if (ptype === 'card') body = body.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        if (!body.trim()) return '这一轮改动里没有新写的文字，没东西要查。';
      }
      // 第一层：程序规则，固定句式、问句标题、图注带来源这些直接找出来
      const auto = memory.lint(body, { type: ptype });
      // 第二层：和这段文字相关的检查项给小模型看语义层（Haiku）
      const rules = memory.checklist(ptype, id, { query: body.slice(0, 1500) });
      step('scan-text', `自查：${auto.length ? `程序规则先找出 ${auto.length} 处，` : ''}再按 ${rules.length} 条记忆查`);
      let issues = [...auto];
      if (rules.length) {
        const skip = auto.length ? `\n程序已经查出下面这些，不要重复报：\n${auto.map(x => '- ' + x.quote.slice(0, 50)).join('\n')}\n` : '';
        const out = await ai.generate({ provider: ai.cheap('fast'), signal, system: CHECK_SYS, prompt: `检查项（括号里是编号）：\n${rules.map(r => `- (${r.id}) ${r.check}`).join('\n')}\n${skip}\n要检查的文字：\n<<<\n${body.slice(0, 12000)}\n>>>` });
        const s0 = String(out || ''), a = s0.indexOf('{'), b = s0.lastIndexOf('}');
        try { issues.push(...(JSON.parse(s0.slice(a, b + 1)).issues || []).filter(x => x?.quote && body.includes(String(x.quote).slice(0, 12))).slice(0, 10)); } catch {}
      }
      issues = issues.slice(0, 14);
      for (const rid of new Set(issues.map(x => x.id).filter(Boolean))) memory.mark(rid, 'caught', { project: id, source: 'check' });
      if (!issues.length) { step('circle-check', '自查通过'); return '自查通过，没发现违反记忆的地方。'; }
      step('triangle-alert', `自查发现 ${issues.length} 处，接着改`);
      return `自查发现 ${issues.length} 处违反作者记忆的地方，逐处改掉（edit_file），改完再调一次 self_check：\n` + issues.map((x, i) => `${i + 1}. 「${x.quote}」\n   问题：${x.problem || ''}${x.id ? `（${x.id}）` : ''}\n   改法：${x.fix || ''}`).join('\n');
    },
    forget({ id: mid }) {
      const old = memory.list().find(x => x.id === mid); memory.remove(mid); turn.memo.push({ op: 'remove', id: mid, kind: old?.kind, text: old?.text || '' }); step('bookmark', '删掉了一条记忆'); return '已删除';
    },
    list_projects({ type }) {
      const l = core.list(type ? { type } : {});
      step('folder-open', `翻了作者的${type === 'card' ? '卡片' : type === 'article' ? '文章' : '项目'}列表`);
      return JSON.stringify(l.map(p => ({ id: p.id, title: p.title, type: p.typeName, status: p.status, tags: p.tags, updated: p.updated.slice(0, 10), size: p.type === 'article' ? `${p.chars} 字` : `${p.pages} 页` })));
    },
    read_project({ project, path: rel }) {
      const pdir = core.resolve(project), pp = core.load(pdir);
      const { f, rel: r } = safe(pdir, rel || (pp.type === 'card' ? 'index.html' : 'article.md'));
      if (!TEXT_EXT.test(f) || !fs.existsSync(f)) throw new Error('没有这个文本文件：' + r);
      step('file-text', `看了《${pp.title}》的 ${r}`);
      const t = fs.readFileSync(f, 'utf8');
      return `《${pp.title}》（${pp.typeName}，只读）的 ${r}：\n` + (t.length > 60000 ? t.slice(0, 60000) + '\n…（太长，后面省略了）' : t);
    },
    search_projects({ query }) {
      const r = core.search(query).slice(0, 12);
      step('search', `在以前的作品里搜「${query}」`);
      return JSON.stringify(r.map(x => ({ project: x.id, title: x.title, type: x.typeName || x.type, hits: (x.hits || []).slice(0, 4) })));
    },
    browse_plaza({ query = '', days = 7 }) {
      const l = pz.items({ days: Math.min(30, Math.max(1, +days || 7)), q: query }).slice(0, 30);
      step('lightbulb', `看了选题广场${query ? `：「${query}」` : ''}`);
      return JSON.stringify(l.map(it => ({ title: it.title, source: it.sourceName, tier: pz.TIERS[it.tier]?.name, time: (it.time || it.firstSeen || '').slice(0, 10), url: it.url, summary: (it.summary || '').slice(0, 160) })));
    },
    ask_decisions({ items }) {
      const l = readJ(dir, 'decisions.json', []), missing = [];
      // 原句在不在正文里：去掉空白、Markdown 符号和 HTML 标签后比
      const flat = t => String(t || '').replace(/<[^>]+>/g, '').replace(/[\s*_`#>|]/g, '');
      const main = flat(fs.existsSync(path.join(dir, ptype === 'card' ? 'index.html' : 'article.md')) ? fs.readFileSync(path.join(dir, ptype === 'card' ? 'index.html' : 'article.md'), 'utf8') : '');
      const inMain = q => main.includes(flat(q));
      for (const it of (items || []).slice(0, 8)) {
        if (!it || typeof it.title !== 'string' || !it.title.trim()) continue;
        const opts = (Array.isArray(it.options) ? it.options : []).map(o => String(o).trim()).filter(Boolean).slice(0, 4);
        const quotes = (Array.isArray(it.quotes) ? it.quotes : []).map(q => String(q).trim().slice(0, 200)).filter(Boolean).slice(0, 3);
        quotes.filter(q => !inMain(q)).forEach(q => missing.push(q));
        const d = { id: uid(), title: it.title.trim().slice(0, 200), detail: String(it.detail || '').trim().slice(0, 300), options: opts.length >= 2 ? opts : ['好，改吧', '先不用'], quotes, answer: null, t: new Date().toISOString() };
        l.push(d); turn.decisions.push(d.id);
      }
      writeJ(dir, 'decisions.json', l.slice(-300));
      step('list-checks', `列了 ${turn.decisions.length} 件等你定的事`);
      return '已经做成卡片给作者了，作者点完会把决定发给你。回复正文里不用再列这些问题。' + (missing.length ? `\n注意：这几句在正文里没找到，作者跳不过去：${missing.map(q => `「${q}」`).join('、')}。要从正文原样复制（不加省略号、不改字），可以再调一次 ask_decisions 补上，旧卡片不用管。` : '');
    },
    load_skill({ name }) {
      const sk = skills.read(name);
      step('puzzle', `用了技能：${sk.name}`);
      return `技能「${sk.name}」（${sk.sourceName}）的 SKILL.md：\n${sk.md.length > 50000 ? sk.md.slice(0, 50000) + '\n…（太长，后面省略了）' : sk.md}\n\n这个技能带的其他文件：${sk.files.join('、') || '没有'}（要看用 read_skill_file）`;
    },
    read_skill_file({ name, path: rel }) { const t = skills.readFile(name, rel); step('puzzle', `看了技能 ${name} 的 ${rel}`); return t; },
    async search_github_skills({ query }) {
      const r = await skills.search(query);
      step('search', `在 GitHub 上搜技能「${query}」（${r.length} 个）`);
      return JSON.stringify(r);
    },
    async inspect_github_skills({ url }) {
      const r = await skills.inspect(url);
      step('search', `看了 ${r.repo} 里的技能（${r.skills.length} 个）`);
      return JSON.stringify(r);
    },
    request_install_skill({ repo, path: sp, reason }) {
      const req = { id: uid(), repo, path: sp, reason, name: path.basename(path.dirname(sp)) || repo.split('/')[1], url: `https://github.com/${repo}/blob/HEAD/${sp}`, status: 'pending', t: new Date().toISOString() };
      const l = readJ(dir, 'skillreqs.json', []); l.push(req); writeJ(dir, 'skillreqs.json', l);
      turn.skillReqs.push(req.id);
      step('puzzle', `推荐安装技能：${req.name}（等你确认）`);
      return '已经请作者确认安装（装好后作者下次发消息时就能用）。这一轮不用再管它。';
    },
    search_assets({ query = '', this_article_only = false }) {
      const l = assets.list({ q: query, project: this_article_only ? id : '' }).slice(0, 30);
      step('folder-open', `翻了素材库${query ? `：「${query}」` : ''}`);
      return JSON.stringify(l.map(x => ({ asset_id: x.id, title: x.title, kind: x.kind, article: x.projectTitle || '', size: x.w ? `${x.w}x${x.h}` : '', prompt: x.prompt ? x.prompt.slice(0, 120) : undefined, source: x.page || x.source || undefined })));
    },
  };

  const links = [...new Set(String(message).match(/https?:\/\/[^\s，。、）)」"'<>]+/g) || [])].slice(0, 6);
  // 对话上下文：最近几轮的文字 + 当前全文
  const hist = histBefore.filter(x => x.tid !== turn.id);
  const mainFile = stage === 'outline' ? 'outline.md' : ptype === 'card' ? 'index.html' : 'article.md';
  let mainText = fs.existsSync(path.join(dir, mainFile)) ? fs.readFileSync(path.join(dir, mainFile), 'utf8') : '';
  if (mainText.length > 70000) mainText = mainText.slice(0, 70000) + '\n…（太长，后面省略了，要看用 read_file）';
  // 按这一轮的事挑记忆（作者这句话 + 阶段 + 正文小标题），记下带了哪些，撤销和手改学习时好对账
  const memSel = memory.select({ type: ptype, project: id, message, stage: stage === 'outline' ? 'outline' : undefined, headings: (mainText.match(/^#{1,3} .+$/gm) || []).slice(0, 30).join(' ') });
  turn.memIds = memSel.ids; turn.memStage = memSel.stage;
  const notes = readJ(dir, 'research.json', []).length ? readJ(dir, 'research.json', []).slice(0, 16).map(r => `- ${r.tier ? `[${r.tier}] ` : ''}${r.q}：${String(r.answer || '').replace(/\s+/g, ' ').slice(0, 600)}${r.quote ? `（原文：「${String(r.quote).replace(/\s+/g, ' ').slice(0, 200)}」）` : ''}`).join('\n') : '';
  const ask = core.load(dir)?.brief || '';   // 作者新建时写的要求（别叫 brief：上面存图工具用的 brief() 会被它盖住）
  const olf = path.join(dir, 'outline.md'), outline = stage !== 'outline' && fs.existsSync(olf) ? fs.readFileSync(olf, 'utf8').slice(0, 12000) : '';
  const where = stage === 'outline'
    ? `【作者现在在大纲页】这一轮只动 outline.md（大纲）${ptype === 'card' ? '，不要动 index.html' : '，不要动 article.md'}，除非作者明确让你写${ptype === 'card' ? '卡片' : '正文'}。\n\n`
    : outline.trim() ? `作者在大纲页定下的大纲（outline.md，写${ptype === 'card' ? '卡片' : '正文'}照它来；作者在正文里改过的以正文为准）：\n<<<\n${outline}\n>>>\n\n` : '';
  const prompt = `${where}${ask ? `作者新建这篇时写的要求（一直有效，除非作者后来改了主意）：\n${ask.slice(0, 3000)}\n\n` : ''}${ptype === 'card' ? `小红书卡片《${title}》` : pform === 'script' ? `视频口播稿《${title}》` : `文章《${title}》`}现在的 ${mainFile}${stage === 'outline' && !mainText.trim() ? '（还没有，你来写）' : ''}：\n<<<\n${mainText}\n>>>\n\n${notes ? `这篇文章「资料」页里已经查到的内容（可以引用，标出来源）：\n${notes}\n\n` : ''}${hist.length ? '之前的对话：\n' + hist.map(h => `${h.role === 'user' ? '作者' : '你'}：${(h.text || '').slice(0, 800)}${h.images?.length ? `（附了 ${h.images.length} 张参考图）` : ''}${h.files?.length ? `（改了：${h.files.join('、')}${h.undone ? '，后来被作者撤销了' : ''}）` : ''}`).join('\n') + '\n\n' : ''}${focus ? `作者现在选中了这段：\n「${focus.slice(0, 1500)}」\n\n` : ''}${refs.length ? `作者附了 ${refs.length} 张参考图（在这段文字前面）${refs.some(r => r.label) ? '，其中标着“视频”的是从作者上传的视频里按时间顺序挑出的关键帧，连起来看就是视频里发生的过程' : ''}，照着它们来改。\n` : ''}${links.length ? `作者给了参考链接：${links.join('  ')}。要看网页长什么样用 screenshot_page，要读文字用 web_fetch。\n` : ''}作者说：${message}`;

  // 执行一次工具调用：两条路（直连 Claude、Claude Code）共用，参数先检查
  const exec = async (name, input) => {
    try {
      const t = myTools.find(x => x.name === name) || (c?.dsh ? ai.DSH_WEB_TOOLS.find(x => x.name === name) : null); if (!t || !tools[name]) throw new Error('没有这个工具：' + name);
      if (!input || typeof input !== 'object') throw new Error('参数不是 JSON 对象，请重发');
      for (const k of t.input_schema.required || []) { const ty = t.input_schema.properties?.[k]?.type || 'string'; if (ty === 'array' ? !Array.isArray(input[k]) : typeof input[k] !== ty) throw new Error(`参数 ${k} 缺失或不完整（可能被截断），请重发`); }
      return { content: await tools[name](input), is_error: false };
    } catch (e) { return { content: e.message, is_error: true }; }
  };
  const userContent = refs.length ? [...refs.flatMap(r => [...(r.label ? [{ type: 'text', text: r.label }] : []), { type: 'image', source: { type: 'base64', media_type: r.media_type, data: r.data } }]), { type: 'text', text: prompt }] : prompt;
  if (cc) {
    let r = { reply: '', live: '' };
    try { r = await ccLoop({ cc, id, sys: system(confirm, ptype, id, memSel.block, pform) + CC_NOTE, userContent, myTools, exec, step, onEvent, signal, live0, takeInbox }); }
    catch (e) { r = { ...(e.partial || r), error: e.message }; throw e; }
    finally { finish(r); }
    return { reply: r.reply.trim(), files: Object.keys(turn.files), turn: turn.id };
  }
  const params = {
    model: c.model, max_tokens: 32000, system: system(confirm, ptype, id, memSel.block, pform),
    thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
    tools: [...apiTools(myTools), ...(c.dsh ? ai.DSH_WEB_TOOLS : SERVER_TOOLS)],
    messages: [{ role: 'user', content: userContent }],
    ...(c.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  };
  // 过程中边做边说的话只在界面上实时显示；记进对话的是最后一轮的总结
  let reply = '', live = '', err = '';
  try {
    for (let round = 0; round < 40; round++) {
      const stream = c.client.beta.messages.stream(params, { signal });
      let started = false, roundText = '';
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          if (!started && live) { live += '\n\n'; onEvent({ type: 'text', text: '\n\n' }); }
          started = true; live += ev.delta.text; roundText += ev.delta.text; onEvent({ type: 'text', text: ev.delta.text });
        }
      }
      if (roundText.trim()) reply = roundText;
      const msg = await stream.finalMessage();
      params.messages.push({ role: 'assistant', content: msg.content });
      for (const b of msg.content) {
        if (b.type === 'server_tool_use' && b.name === 'web_search') step('search', `搜索「${b.input?.query || ''}」`);
        if (b.type === 'server_tool_use' && b.name === 'web_fetch') step('globe', `打开 ${String(b.input?.url || '').replace(/^https?:\/\//, '').slice(0, 60)}`);
      }
      if (msg.stop_reason === 'pause_turn') continue;
      if (msg.stop_reason === 'refusal') throw new Error('模型拒绝了这次请求');
      const uses = msg.content.filter(b => b.type === 'tool_use');
      if (!uses.length) {
        const extra = takeInbox(); if (!extra.length) break;
        params.messages.push({ role: 'user', content: `作者在你干活时又补充了：\n${extra.map(x => '- ' + x).join('\n')}\n把这些一起考虑进去，接着做。` });
        continue;
      }
      const results = [];
      for (const b of uses) {
        const { content, is_error } = msg.stop_reason === 'max_tokens'
          ? { content: '输出太长被截断了，这次调用的参数不完整，请分几步做（比如用 edit_file 小改，别一次重写整个文件）', is_error: true }
          : await exec(b.name, b.input);
        results.push({ type: 'tool_result', tool_use_id: b.id, content: Array.isArray(content) ? content : String(content), ...(is_error ? { is_error: true } : {}) });
      }
      const extra = takeInbox();
      if (extra.length) results.push({ type: 'text', text: `（作者在你干活时又补充了：${extra.join('；')}。把这些一起考虑进去。）` });
      params.messages.push({ role: 'user', content: results });
    }
  } catch (e) { err = e.message; throw e; } finally { finish({ reply, live, error: err }); }
  return { reply: reply.trim(), files: Object.keys(turn.files), turn: turn.id };

  // 收尾（两条路共用）：不管成没成功，已经改过的文件都要记下来，好撤销
  function finish({ reply, live, error = '' }) {
    const files = Object.keys(turn.files);
    for (const rel of ['article.md', 'index.html']) if (rel in turn.files) { try { (turn.after ||= {})[rel] = fs.readFileSync(path.join(dir, rel), 'utf8'); } catch {} }
    // 改了正文却没自查：收尾时程序按规则查一遍新写的段落，结果挂在回复下面（不花额度）
    let lint = [];
    if (!turn.checked && !signal?.aborted) {
      const rel = ptype === 'card' ? 'index.html' : 'article.md';
      if (rel in turn.files && turn.after?.[rel] != null) {
        const old = new Set(String(turn.files[rel] || '').split(/\n{2,}/).map(x => x.trim()));
        let body = turn.after[rel].split(/\n{2,}/).map(x => x.trim()).filter(x => x && !old.has(x)).join('\n\n');
        if (ptype === 'card') body = body.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
        if (body.trim()) { lint = memory.lint(body, { type: ptype }); for (const rid of new Set(lint.map(x => x.id).filter(Boolean))) memory.mark(rid, 'caught', { project: id, source: 'check' }); }
      }
    }
    if (files.length || turn.assets.length || turn.jobs.length) writeJ(dir, `turn-${turn.id}.json`, turn);
    const h = history(dir);
    h.push({ role: 'ai', agent: true, tid: turn.id, memo: turn.memo, ...(lint.length ? { lint } : {}), text: live.trim() || reply.trim() || (signal?.aborted ? '（停下了）' : error ? `这一轮出错了：${error}` : ''), ...(error && !signal?.aborted ? { error } : {}), steps: turn.steps, files, turn: files.length ? turn.id : null, assets: turn.assets, jobs: turn.jobs, skillReqs: turn.skillReqs, decisions: turn.decisions, t: new Date().toISOString() });
    writeJ(dir, 'chat.json', h.slice(-60));
    if (files.length) core.log(dir, 'AI 助手改动', files.join('、'));
    onEvent({ type: 'files', files });
    if (!signal?.aborted) rememberTurn(dir, turn.id, { message: message + (live0.injected.length ? `\n（干活中又补充：${live0.injected.join('；')}）` : ''), reply: reply || live, steps: turn.steps, files, kind: ptype, title, body: mainText.slice(0, 20000) }, provider);
    RUNS.delete(dir);
  }
}

/* ---------- 用 Claude Code（作者自己的订阅额度）跑助手 ----------
   工作台的工具通过 MCP 工具桥（tools/mcp-bridge.mjs）交给 Claude Code，工具还是在这一轮里执行（存历史、能撤销、显示进度）。
   Claude Code 自带的读写文件、终端这些工具全关，只留联网搜索和读网页；在空文件夹里跑，不读作者的设置、钩子和插件。 */
const BRIDGE = path.join(core.APP_DIR, 'tools', 'mcp-bridge.mjs');
const CC_NOTE = `

（你现在跑在 Claude Code 里：上面说的工具在你这里名字前面带 mcp__wb__，比如 mcp__wb__edit_file；web_search、web_fetch 对应 WebSearch、WebFetch。WebFetch 只给概括、引用有字数限制，读原文一律用 mcp__wb__read_page。只用这些工具改作者的项目，别的办法都碰不到项目文件。）`;
function ccLoop({ cc, id, sys, userContent, myTools, exec, step, onEvent, signal, live0, takeInbox = () => [] }) {
  live0.key = crypto.randomBytes(16).toString('hex');
  live0.exec = exec;
  live0.toolDefs = myTools.map(({ name, description, input_schema }) => ({ name, description, inputSchema: input_schema }));
  const mcp = { mcpServers: { wb: { type: 'stdio', command: process.execPath, args: [BRIDGE], env: { WB_URL: process.env.WB_SELF || 'http://127.0.0.1:5288', WB_TOKEN: process.env.WB_SELF_TOKEN || '', WB_PROJECT: id, WB_RUN: live0.key } } } };
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--no-session-persistence', '--strict-mcp-config', '--mcp-config', JSON.stringify(mcp),
    '--setting-sources', 'project', '--disable-slash-commands', '--no-chrome', '--effort', 'medium', '--max-turns', '80',
    '--system-prompt', sys, ...(cc.model ? ['--model', cc.model] : []),
    '--tools', 'WebSearch', 'WebFetch', '--allowedTools', 'mcp__wb', 'WebSearch', 'WebFetch'];
  return new Promise((resolve, reject) => {
    const ch = spawn(cc.bin, args, { cwd: cc.cwd, env: { ...cc.env, MCP_TOOL_TIMEOUT: '900000', MCP_TIMEOUT: '30000', ENABLE_TOOL_SEARCH: 'false' } });
    let buf = '', err = '', reply = '', live = '', roundText = '', started = false, result = null, done = false;
    const fail = e => { if (done) return; done = true; try { ch.kill(); } catch {} reject(Object.assign(e, { partial: { reply, live } })); };
    const line = l => {
      let j; try { j = JSON.parse(l); } catch { return; }
      if (j.type === 'system' && j.subtype === 'init') {
        const s = (j.mcp_servers || []).find(x => x.name === 'wb');
        if (s && /fail|error|needs-auth/i.test(s.status || '')) fail(new Error('Claude Code 没连上工作台的工具（' + s.status + '）'));
      }
      if (j.type === 'stream_event') {
        const ev = j.event || {};
        if (ev.type === 'message_start') { started = false; roundText = ''; }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          if (!started && live) { live += '\n\n'; onEvent({ type: 'text', text: '\n\n' }); }
          started = true; live += ev.delta.text; roundText += ev.delta.text; onEvent({ type: 'text', text: ev.delta.text });
        }
      }
      if (j.type === 'assistant') {
        if (roundText.trim()) reply = roundText;
        for (const b of j.message?.content || []) {
          if (b.type !== 'tool_use') continue;
          if (b.name === 'WebSearch') step('search', `搜索「${b.input?.query || ''}」`);
          if (b.name === 'WebFetch') step('globe', `打开 ${String(b.input?.url || '').replace(/^https?:\/\//, '').slice(0, 60)}`);
        }
      }
      if (j.type === 'result') {
        result = j;
        const extra = !j.is_error && !signal?.aborted ? takeInbox() : [];
        if (extra.length) ch.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: `作者在你干活时又补充了：\n${extra.map(x => '- ' + x).join('\n')}\n把这些一起考虑进去，接着做。` }] } }) + '\n');
        else try { ch.stdin.end(); } catch {}
      }
    };
    ch.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    ch.stderr.on('data', d => { err = (err + d).slice(-4000); });
    const onAbort = () => { try { ch.kill(); } catch {} };
    signal?.addEventListener('abort', onAbort);
    ch.on('error', e => fail(new Error('Claude Code 没能启动：' + e.message)));
    ch.on('close', code => {
      signal?.removeEventListener('abort', onAbort);
      if (buf.trim()) line(buf);
      if (done) return; done = true;
      if (signal?.aborted) return resolve({ reply, live });
      if (result && !result.is_error) return resolve({ reply: reply || String(result.result || ''), live });
      const m = result?.result || (result?.subtype && result.subtype !== 'success' ? result.subtype : '') || err || `退出码 ${code}`;
      if (result?.subtype === 'error_max_turns') return resolve({ reply: (reply || live) + '\n\n（步骤太多先停在这里了，说“继续”接着做）', live });
      reject(Object.assign(ai.ccError(m), { partial: { reply, live } }));
    });
    // 输入先不关：这一轮做完时作者要是又补充了话，接着发进去
    ch.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: typeof userContent === 'string' ? [{ type: 'text', text: userContent }] : userContent } }) + '\n');
  });
}

// 后台整理这一轮的记忆（不让作者等），整理出的结果记在这一轮的对话记录上，界面会显示“记住了……”
export function rememberTurn(dir, tid, turn, provider) {
  setImmediate(async () => {
    try {
      const r = await memory.memorize(turn, { project: path.basename(dir) });
      // 作者那条消息也带着同一个 tid，要找的是助手的回复
      const h = history(dir), m = h.find(x => x.tid === tid && x.role === 'ai');
      if (m) { m.memo = [...(m.memo || []), ...r]; m.memoDone = true; writeJ(dir, 'chat.json', h); }
    } catch (e) { const h = history(dir), m = h.find(x => x.tid === tid && x.role === 'ai'); if (m) { m.memoDone = true; m.memoError = e.message.slice(0, 120); writeJ(dir, 'chat.json', h); } }
  });
}

// 撤销一整轮：改过的文件恢复原样，新建的删掉
export function undo(dir, turnId) {
  const turn = readJ(dir, `turn-${turnId}.json`, null);
  if (!turn) throw new Error('找不到这一轮的记录');
  const back = [];
  for (const [rel, orig] of Object.entries(turn.files)) {
    const { f } = safe(dir, rel);
    if (fs.existsSync(f)) ed.snapshot(dir, rel, '撤销AI前');
    if (orig == null) { try { fs.rmSync(f); } catch {} } else fs.writeFileSync(f, orig);
    back.push(rel);
  }
  const h = history(dir); for (const m of h) if (m.turn === turnId) m.undone = true; writeJ(dir, 'chat.json', h);
  for (const mid of turn.memIds || []) memory.mark(mid, 'undone', { project: path.basename(dir), source: 'undo' });
  core.log(dir, '撤销 AI 改动', back.join('、'));
  return { files: back };
}

// 执行一个生图请求（作者确认后），生成的图进素材库；要求了插入位置就插进文章
export async function runJob(dir, job, patch = {}) {
  const prompt = (patch.prompt || job.prompt || '').trim(), size = patch.size || job.size, n = patch.n || job.n || 1;
  const r = await images.generate({ prompt, size, n, provider: patch.provider });
  const made = r.images.map(buf => assets.add(buf, { kind: 'generated', title: job.title || prompt.slice(0, 40), prompt, provider: `${r.providerName} · ${r.model}`, project: path.basename(dir) }));
  let inserted = false, insertError = '';
  if (job.after != null && (job.after || patch.insert) && patch.insert !== false) {
    try { assets.insert(dir, made[0].id, { after: job.after, caption: job.caption || '', alt: job.title || '' }); inserted = true; } catch (e) { insertError = e.message; }
  }
  core.log(dir, 'AI 生图', `${made.length} 张：${(job.title || prompt).slice(0, 40)}`);
  return { assets: made, inserted, insertError };
}
export async function confirmJob(dir, jobId, patch = {}) {
  const l = jobs(dir), job = l.find(j => j.id === jobId); if (!job) throw new Error('找不到这个生图请求');
  if (job.status === 'done') throw new Error('这张已经生成过了');
  job.status = 'running'; writeJ(dir, 'imgjobs.json', l);
  try {
    const r = await runJob(dir, job, patch);
    Object.assign(job, { status: 'done', error: '', prompt: patch.prompt || job.prompt, assets: r.assets.map(brief), inserted: r.inserted, insertError: r.insertError, doneAt: new Date().toISOString() });
    writeJ(dir, 'imgjobs.json', l);
    return { job, assets: r.assets };
  } catch (e) { job.status = 'pending'; job.error = e.message; writeJ(dir, 'imgjobs.json', l); throw e; }
}
export function rejectJob(dir, jobId) {
  const l = jobs(dir), job = l.find(j => j.id === jobId); if (!job) throw new Error('找不到这个生图请求');
  job.status = 'rejected'; writeJ(dir, 'imgjobs.json', l); return { job };
}

// 作者在对话里附的参考图：data:image/...;base64,... → 存一份（聊天记录里显示），缩到长边 1600 再发给模型
export async function saveRefs(dir, list = []) {
  const d = path.join(wdir(dir), 'attachments'); fs.mkdirSync(d, { recursive: true });
  const out = [];
  for (const x of list.slice(0, 30)) {
    const m = String(x?.data || '').match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
    if (!m) continue;
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1], file = uid() + '.' + ext, f = path.join(d, file);
    fs.writeFileSync(f, Buffer.from(m[2], 'base64'));
    if (ext !== 'gif') { try { await run1('sips', ['-Z', '1600', f]); } catch {} }
    const data = fs.readFileSync(f);
    if (data.length > 4.5e6) { try { await run1('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', f, '--out', f]); } catch {} }
    out.push({ file, label: String(x.label || '').slice(0, 120), media_type: { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext], data: fs.readFileSync(f).toString('base64') });
  }
  return out;
}
export function attachment(dir, name) { const f = path.join(wdir(dir), 'attachments', path.basename(name || '')); return fs.existsSync(f) ? f : null; }

// 助手推荐安装的技能：作者点「安装」才装
export const skillReqs = dir => readJ(dir, 'skillreqs.json', []);
export async function answerSkillReq(dir, id, action) {
  const l = skillReqs(dir), r = l.find(x => x.id === id); if (!r) throw new Error('找不到这个安装请求');
  if (action === 'install') { const sk = await skills.install({ repo: r.repo, path: r.path }); Object.assign(r, { status: 'installed', name: sk.name, installedAt: new Date().toISOString() }); }
  else r.status = 'rejected';
  writeJ(dir, 'skillreqs.json', l); return r;
}

// 等作者拍板的事：作者点了选项就记下答案
export const decisions = dir => readJ(dir, 'decisions.json', []);
export function answerDecisions(dir, answers = []) {
  const l = decisions(dir);
  for (const a of answers) { const d = l.find(x => x.id === a.id); if (d && !d.answer) { d.answer = String(a.answer || '').slice(0, 200); d.answeredAt = new Date().toISOString(); } }
  writeJ(dir, 'decisions.json', l); return l;
}
