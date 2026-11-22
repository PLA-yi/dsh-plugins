// 选题广场：从一批固定信息源直接拉最新动态，按可信度和热度排好；AI 从里面挑选题，选题必须有一手证据
// 信息源分四档：A 官方一手 > B 社区一手 > C 原创报道 > D 转述（只当热度信号）
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import * as ai from './ai.mjs';
import * as xapi from './x.mjs';
import { APP_DIR, DATA_DIR } from './core.mjs';
import * as core from './core.mjs';
import { CHROME } from './platform.mjs';

const FEED = path.join(DATA_DIR, 'feed.json');
const IDEAS = path.join(DATA_DIR, 'plaza-ideas.json');
export const TIERS = { A: { name: '官方一手', w: 1 }, B: { name: '社区一手', w: 0.85 }, C: { name: '原创报道', w: 0.6 }, D: { name: '转述', w: 0.35 } };

// ai: true 表示这个源本身就是 AI 频道，不用再按关键词筛
// titleOnly：综合类媒体只看标题里有没有 AI（摘要太长容易误中）
// base：这个源没有热度数时给的基础热度（榜单类的源，上榜本身就说明有人看）；nodate：源里的日期是上架日不是上榜日，按第一次看到的时间算
// skip：标题命中就不要（素材包之类）
export const SOURCES = [
  // —— A 官方一手：公司新闻、产品博客、更新日志 ——
  { id: 'openai', name: 'OpenAI', tier: 'A', kind: 'rss', url: 'https://openai.com/news/rss.xml', ai: true, max: 25 },
  { id: 'anthropic', name: 'Anthropic', tier: 'A', kind: 'anthropic', url: 'https://www.anthropic.com/news', ai: true, max: 20 },
  { id: 'googleai', name: 'Google AI', tier: 'A', kind: 'rss', url: 'https://blog.google/technology/ai/rss/', ai: true },
  { id: 'gemini', name: 'Gemini 产品', tier: 'A', kind: 'rss', url: 'https://blog.google/products/gemini/rss/', ai: true, max: 20 },
  { id: 'deepmind', name: 'Google DeepMind', tier: 'A', kind: 'rss', url: 'https://deepmind.google/blog/rss.xml', ai: true, max: 25 },
  { id: 'hf', name: 'Hugging Face', tier: 'A', kind: 'rss', url: 'https://huggingface.co/blog/feed.xml', ai: true, max: 25 },
  { id: 'qwen', name: '通义 Qwen', tier: 'A', kind: 'rss', url: 'https://qwenlm.github.io/blog/index.xml', ai: true, max: 15 },
  { id: 'deepseek', name: 'DeepSeek 更新', tier: 'A', kind: 'deepseek', url: 'https://api-docs.deepseek.com/updates', ai: true },
  { id: 'mistral', name: 'Mistral', tier: 'A', kind: 'rss', url: 'https://mistral.ai/rss.xml', ai: true, max: 10 },
  { id: 'nvidia', name: 'NVIDIA', tier: 'A', kind: 'rss', url: 'https://blogs.nvidia.com/feed/' },
  { id: 'meta', name: 'Meta 工程', tier: 'A', kind: 'rss', url: 'https://engineering.fb.com/feed/' },
  { id: 'msblog', name: '微软', tier: 'A', kind: 'rss', url: 'https://blogs.microsoft.com/feed/' },
  { id: 'github', name: 'GitHub 博客', tier: 'A', kind: 'rss', url: 'https://github.blog/feed/' },
  { id: 'ghlog', name: 'GitHub 更新日志', tier: 'A', kind: 'rss', url: 'https://github.blog/changelog/feed/' },
  { id: 'cursor', name: 'Cursor 更新日志', tier: 'A', kind: 'rss', url: 'https://cursor.com/changelog/rss.xml', ai: true, max: 10 },
  { id: 'lovable', name: 'Lovable', tier: 'A', kind: 'rss', url: 'https://lovable.dev/blog/rss.xml', ai: true, max: 10 },
  { id: 'figma', name: 'Figma', tier: 'A', kind: 'rss', url: 'https://www.figma.com/blog/feed/atom.xml', max: 15 },
  { id: 'notion', name: 'Notion 发布', tier: 'A', kind: 'rss', url: 'https://www.notion.com/releases/rss.xml', max: 8 },
  { id: 'suno', name: 'Suno', tier: 'A', kind: 'rss', url: 'https://suno.com/blog/rss.xml', ai: true, max: 8 },
  { id: 'ollama', name: 'Ollama', tier: 'A', kind: 'rss', url: 'https://ollama.com/blog/rss.xml', ai: true, max: 8 },
  // X：官方账号的帖子算 A，个人账号算 B（每条帖子自带档位）
  // —— B 社区一手：新产品榜单、开发者自己发的 ——
  { id: 'hn', name: 'Hacker News', tier: 'B', kind: 'hn' },
  { id: 'ghtrend', name: 'GitHub 趋势', tier: 'B', kind: 'ghtrend', url: 'https://github.com/trending?since=weekly' },
  { id: 'phai', name: 'Product Hunt AI', tier: 'B', kind: 'rss', url: 'https://www.producthunt.com/feed?category=artificial-intelligence', ai: true, max: 40, base: 30 },
  { id: 'ph', name: 'Product Hunt', tier: 'B', kind: 'rss', url: 'https://www.producthunt.com/feed', base: 30 },
  { id: 'hfspaces', name: 'HF 热门应用', tier: 'B', kind: 'hf', what: 'spaces', ai: true, max: 30 },
  { id: 'hfmodels', name: 'HF 热门模型', tier: 'B', kind: 'hf', what: 'models', ai: true, max: 30 },
  { id: 'reddit', name: 'Reddit', tier: 'B', kind: 'reddit', subs: ['aigamedev', 'LocalLLaMA'], ai: true, max: 60, base: 60 },
  { id: 'v2ex', name: 'V2EX 分享创造', tier: 'B', kind: 'rss', url: 'https://www.v2ex.com/feed/create.xml', max: 50, base: 15, zh: true },
  { id: 'itch', name: 'itch.io AI 游戏', tier: 'B', kind: 'rss', url: 'https://itch.io/games/new-and-popular/tag-ai-generated.xml', ai: true, max: 20, base: 15, nodate: true, skip: /\b(packs?|assets?|sprites?|tilesets?|fonts?|sfx|soundtrack|icons?|templates?)\b/i },
  { id: 'simon', name: 'Simon Willison', tier: 'B', kind: 'rss', url: 'https://simonwillison.net/atom/everything/', max: 30 },
  { id: 'latent', name: 'Latent Space', tier: 'B', kind: 'rss', url: 'https://www.latent.space/feed', ai: true, max: 12 },
  { id: 'aiandgames', name: 'AI and Games', tier: 'B', kind: 'rss', url: 'https://www.aiandgames.com/feed', ai: true, max: 8 },
  // 视频平台：看 AI 科普类视频最近什么题目有人看。YouTube 没有可订阅的地址了，用 yt-dlp 读频道的视频列表；ai: false 的频道只留标题和 AI 有关的
  { id: 'ytai', name: 'YouTube AI 频道', tier: 'B', kind: 'yt', video: true, ai: true, channels: [
    { id: 'UCbfYPyITQ-7l4upoX8nvctg', name: 'Two Minute Papers', ai: true }, { id: 'UCNJ1Ymd5yFuUPtn21xtRbbw', name: 'AI Explained', ai: true }, { id: 'UChpleBmo18P08aKCIgti38g', name: 'Matt Wolfe', ai: true },
    { id: 'UCawZsQWqfGSbCI5yjkdVkTA', name: 'Matthew Berman', ai: true }, { id: 'UCXUPKJO5MZQN11PqgIvyuvQ', name: 'Andrej Karpathy', ai: true }, { id: 'UCZHmQk67mSJgfCCTn7xBfew', name: 'Yannic Kilcher', ai: true },
    { id: 'UCgfe2ooZD3VJPB6aJAnuQng', name: 'bycloud', ai: true }, { id: 'UCqcbQf6yw5KzRoDDcZ_wBSw', name: 'Wes Roth', ai: true }, { id: 'UC0m81bQuthaQZmFbXEY9QSw', name: 'AICodeKing', ai: true }, { id: 'UCbY9xX3_jW5c2fjlZVBI4cg', name: 'TheAIGRID', ai: true },
    { id: 'UCsBjURrPoezykLs9EqgamOA', name: 'Fireship' }, { id: 'UCYO_jab_esuFRV4b17AJtAw', name: '3Blue1Brown' }, { id: 'UC4QZ_LsYcvcq7qOsOhpAX4A', name: 'ColdFusion' },
    { id: 'UCXl4i9dYBrFOabk0xGmbkRA', name: 'Dwarkesh Patel' }, { id: 'UCSHZKyawb77ixDdsGog4iWA', name: 'Lex Fridman' }, { id: 'UC9x0AN7BWHpCDHSm9NiJFJQ', name: 'NetworkChuck' }] },
  { id: 'bili', name: 'B 站热门', tier: 'B', kind: 'bili', video: true, zh: true },
  // 海外的深度内容：个人专栏、播客、论文。这些在中文圈里被转述得少，是「信息差」的主要来源
  { id: 'hfpapers', name: 'HF 每日论文', tier: 'B', kind: 'hfpapers', ai: true, max: 25 },
  { id: 'importai', name: 'Import AI', tier: 'B', kind: 'rss', url: 'https://importai.substack.com/feed', ai: true, max: 6 },
  { id: 'oneuseful', name: 'One Useful Thing', tier: 'B', kind: 'rss', url: 'https://www.oneusefulthing.org/feed', ai: true, max: 6 },
  { id: 'interconnects', name: 'Interconnects', tier: 'B', kind: 'rss', url: 'https://www.interconnects.ai/feed', ai: true, max: 6 },
  { id: 'aheadofai', name: 'Ahead of AI', tier: 'B', kind: 'rss', url: 'https://magazine.sebastianraschka.com/feed', ai: true, max: 5 },
  { id: 'snakeoil', name: 'AI Snake Oil', tier: 'B', kind: 'rss', url: 'https://www.aisnakeoil.com/feed', ai: true, max: 5 },
  { id: 'understandingai', name: 'Understanding AI', tier: 'B', kind: 'rss', url: 'https://www.understandingai.org/feed', ai: true, max: 5 },
  { id: 'dwarkesh', name: 'Dwarkesh 播客', tier: 'B', kind: 'rss', url: 'https://www.dwarkesh.com/feed', ai: true, max: 5 },
  { id: 'lilian', name: 'Lilian Weng', tier: 'B', kind: 'rss', url: 'https://lilianweng.github.io/index.xml', ai: true, max: 4 },
  { id: 'karpathy', name: 'Karpathy 博客', tier: 'B', kind: 'rss', url: 'https://karpathy.bearblog.dev/feed/', ai: true, max: 4 },
  { id: 'hamel', name: 'Hamel Husain', tier: 'B', kind: 'rss', url: 'https://hamel.dev/index.xml', ai: true, max: 4 },
  { id: 'lenny', name: "Lenny's Newsletter", tier: 'B', kind: 'rss', url: 'https://www.lennysnewsletter.com/feed', max: 8 },
  { id: 'pragmatic', name: 'Pragmatic Engineer', tier: 'B', kind: 'rss', url: 'https://newsletter.pragmaticengineer.com/feed', max: 8 },
  // —— C 原创报道 ——
  { id: 'verge', name: 'The Verge', tier: 'C', kind: 'rss', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', ai: true },
  { id: 'tc', name: 'TechCrunch', tier: 'C', kind: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', ai: true },
  { id: 'testingcatalog', name: 'TestingCatalog', tier: 'C', kind: 'rss', url: 'https://www.testingcatalog.com/rss/', ai: true, max: 30 },
  { id: 'decoder', name: 'The Decoder', tier: 'C', kind: 'rss', url: 'https://the-decoder.com/feed/', ai: true },
  { id: 'ars', name: 'Ars Technica', tier: 'C', kind: 'rss', url: 'https://arstechnica.com/ai/feed/', ai: true },
  { id: 'gresearch', name: 'Google 研究', tier: 'A', kind: 'rss', url: 'https://research.google/blog/rss/', ai: true, max: 10 },
  { id: 'mittr', name: 'MIT 科技评论', tier: 'C', kind: 'rss', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', ai: true, max: 10 },
  { id: 'stratechery', name: 'Stratechery', tier: 'C', kind: 'rss', url: 'https://stratechery.com/feed/', max: 8 },
  { id: 'exponential', name: 'Exponential View', tier: 'C', kind: 'rss', url: 'https://www.exponentialview.co/feed', max: 8 },
  { id: 'techmeme', name: 'Techmeme', tier: 'C', kind: 'rss', url: 'https://www.techmeme.com/feed.xml' },
  // 国内科技媒体（2026-11-22 加的，都是公开 RSS）
  { id: '36krflash', name: '36氪快讯', tier: 'C', kind: 'rss', url: 'https://www.36kr.com/feed-newsflash', zh: true, max: 20 },
  { id: 'huxiu', name: '虎嗅', tier: 'C', kind: 'rss', url: 'https://rss.huxiu.com/', zh: true, max: 30 },
  { id: 'cnbeta', name: 'cnBeta', tier: 'C', kind: 'rss', url: 'https://www.cnbeta.com.tw/backend.php', zh: true, max: 40 },
  { id: 'juejin', name: '掘金', tier: 'C', kind: 'rss', url: 'https://juejin.cn/rss', zh: true, max: 20 },
  { id: 'ifanr', name: '爱范儿', tier: 'C', kind: 'rss', url: 'https://www.ifanr.com/feed', zh: true },
  { id: 'sspai', name: '少数派', tier: 'C', kind: 'rss', url: 'https://sspai.com/feed', zh: true },
  { id: 'appinn', name: '小众软件', tier: 'C', kind: 'rss', url: 'https://www.appinn.com/feed/', zh: true },
  { id: 'bestblogs', name: 'BestBlogs AI', tier: 'C', kind: 'rss', url: 'https://www.bestblogs.dev/zh/feeds/rss?category=ai', ai: true, max: 40, zh: true },
  { id: 'infoq', name: 'InfoQ', tier: 'C', kind: 'rss', url: 'https://www.infoq.cn/feed', titleOnly: true, zh: true },
  { id: 'leiphone', name: '雷峰网', tier: 'C', kind: 'rss', url: 'https://www.leiphone.com/feed', titleOnly: true, zh: true },
  { id: 'tmt', name: '钛媒体', tier: 'C', kind: 'rss', url: 'https://www.tmtpost.com/rss.xml', titleOnly: true, zh: true },
  // 游戏媒体：只留和 AI 有关的
  { id: 'gamelook', name: 'GameLook', tier: 'C', kind: 'rss', url: 'http://www.gamelook.com.cn/feed', zh: true },
  { id: 'gcores', name: '机核', tier: 'C', kind: 'rss', url: 'https://www.gcores.com/rss', titleOnly: true, zh: true },
  { id: 'chuapp', name: '触乐', tier: 'C', kind: 'rss', url: 'http://www.chuapp.com/feed', titleOnly: true, zh: true },
  { id: 'gibiz', name: 'GamesIndustry', tier: 'C', kind: 'rss', url: 'https://www.gamesindustry.biz/feed', titleOnly: true },
  { id: 'pcgamer', name: 'PC Gamer', tier: 'C', kind: 'rss', url: 'https://www.pcgamer.com/rss/', titleOnly: true },
  { id: 'aigc', name: 'AI Gamechangers', tier: 'C', kind: 'rss', url: 'https://aigamechangers.substack.com/feed', ai: true, max: 8 },
  // —— D 转述 ——
  { id: 'qbitai', name: '量子位', tier: 'D', kind: 'rss', url: 'https://www.qbitai.com/feed', ai: true, zh: true },
  { id: 'aiera', name: '新智元', tier: 'D', kind: 'rss', url: 'https://aiera.com.cn/feed/', ai: true, zh: true },
  { id: 'ithome', name: 'IT之家', tier: 'D', kind: 'rss', url: 'https://www.ithome.com/rss/', max: 60, titleOnly: true, zh: true },
  { id: '36kr', name: '36氪', tier: 'D', kind: 'rss', url: 'https://www.36kr.com/feed', zh: true },
];

const AI_RE = /\b(AI|A\.I\.|LLMs?|GPT[-\w.]*|ChatGPT|Claude|Gemini|Llama|Mistral|Qwen|DeepSeek|Kimi|Copilot|agents?|agentic|MCP|RAG|OpenAI|Anthropic|diffusion|transformers?|inference|embeddings?|multimodal|chatbots?|neural|fine-tun\w*|vibe[- ]coding|Cursor|Perplexity|Grok|Sora|Midjourney|Codex|NotebookLM|Runway|Kling|Suno|ElevenLabs|Lovable|Windsurf|MiniMax|GLM|Seedream|Seedance|Genspark)\b|人工智能|大模型|模型|智能体|AIGC|生成式|多模态|具身|算力|机器人|Agent|编程助手|豆包|通义|文心|元宝|千问|扣子|Manus|智谱|混元|即梦|可灵|海螺|讯飞|星火|月之暗面|阶跃|零一万物|百川|秘塔|纳米|夸克|灵光/i;
// Hugging Face 榜单上常见的擦边内容，不要
const JUNK = /uncensored|nsfw|heretic|abliterat|face-?swap|undress|nude|erotic/i;
// 老实说自己是谁，不冒充浏览器
export const UA = 'CreatorStudio/0.1 (DSH plugin; reads public feeds)';
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const text = s => decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const normUrl = u => { try { const x = new URL(u); x.hash = ''; ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'source'].forEach(k => x.searchParams.delete(k)); return x.toString().replace(/\/$/, ''); } catch { return u; } };

async function get(url, ms = 15000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/* ---------- 各类源的解析 ---------- */
function parseRss(xml) {
  const blocks = xml.split(/<(?:item|entry)[\s>]/).slice(1);
  return blocks.map(b => {
    const tag = n => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [])[1];
    const link = (b.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/) || [])[1] || text(tag('link')) || text(tag('guid'));
    const date = tag('pubDate') || tag('published') || tag('updated') || tag('dc:date');
    const img = (b.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/) || b.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/) || b.match(/<enclosure[^>]*type="image[^"]*"[^>]*url="([^"]+)"/) || decode(decode(b)).match(/<img[^>]+src="(https?:[^"]+)"/) || [])[1] || '';
    return { img: /^https?:/.test(img) && !/(feedburner|pixel|tracking|1x1|gravatar|emoji)/i.test(img) ? decode(img) : '', title: text(tag('title')), url: link, time: date ? new Date(text(date)).toISOString() : null, summary: text(tag('description') || tag('summary') || tag('content:encoded') || tag('content')).slice(0, 280) };
  }).filter(x => x.title && /^https?:/.test(x.url || ''));
}
async function fetchSource(s, opts = {}) {
  if (s.kind === 'x') { const r = await xapi.pull({ force: opts.force, max: opts.xmax }); return r.skipped ? null : r.items; }
  if (s.kind === 'rss') {
    let l = parseRss(await get(s.url));
    if (s.skip) l = l.filter(x => !s.skip.test(x.title));
    if (s.nodate) l = l.map(x => ({ ...x, time: null }));
    return l.slice(0, s.max || 40);
  }
  // Hugging Face 热门榜：应用（spaces）和模型。上榜的老项目不带日期，按第一次看到的时间算
  if (s.kind === 'hf') {
    const d = JSON.parse(await get(`https://huggingface.co/api/${s.what}?sort=trendingScore&direction=-1&limit=${s.max || 30}&full=true`, 25000));
    const fresh = t => (t && Date.now() - Date.parse(t) < 14 * 86400000 ? t : null);
    return d.filter(x => x.id && !JUNK.test(x.id + ' ' + (x.cardData?.title || ''))).map(x => {
      const c = x.cardData || {}, space = s.what === 'spaces';
      return { title: space ? `${c.title || x.id.split('/').pop()}（${x.id}）` : x.id + (x.pipeline_tag ? `（${x.pipeline_tag}）` : ''),
        url: `https://huggingface.co/${space ? 'spaces/' : ''}${x.id}`, time: fresh(x.createdAt),
        summary: space ? (c.short_description || 'Hugging Face 上正在热门的 AI 应用') : `Hugging Face 热门模型，作者 ${x.id.split('/')[0]}${x.pipeline_tag ? '，类型 ' + x.pipeline_tag : ''}`, heat: { likes: x.likes || 0 } };
    });
  }
  // YouTube：读每个频道最新的几条视频（标题、播放量、时长、大概的发布日期）。一次并行 4 个频道
  if (s.kind === 'yt') {
    const bin = path.join(APP_DIR, 'video', 'runtime', 'py', 'bin', 'yt-dlp');
    if (!fs.existsSync(bin)) { const e = new Error('没装 yt-dlp（npm install --prefix video/runtime）'); e.off = true; throw e; }
    const one = c => new Promise(ok => execFile(bin, ['--no-warnings', '--flat-playlist', '--playlist-end', '5', '--socket-timeout', '15', '--extractor-args', 'youtubetab:approximate_date', '-J', `https://www.youtube.com/channel/${c.id}/videos`],
      { timeout: 45000, maxBuffer: 16 * 1024 * 1024 }, (e, out) => { try { ok({ c, j: JSON.parse(out) }); } catch { ok({ c, j: null }); } }));
    const out = [];
    for (let i = 0; i < s.channels.length; i += 4) for (const { c, j } of await Promise.all(s.channels.slice(i, i + 4).map(one))) for (const v of j?.entries || []) {
      if (!v?.id || !v.title || (!c.ai && !AI_RE.test(v.title))) continue;
      out.push({ title: v.title, url: `https://www.youtube.com/watch?v=${v.id}`, time: v.timestamp ? new Date(v.timestamp * 1000).toISOString() : null, summary: String(v.description || '').slice(0, 280),
        sourceName: 'YouTube · ' + c.name, img: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, heat: { views: v.view_count || 0 }, sec: v.duration || 0 });
    }
    if (!out.length) throw new Error('YouTube 一个频道都没读到');
    return out;
  }
  // B 站：全站热门榜里和 AI 有关的（科技区、知识区的排行榜常被风控拦，读得到就一起用）。按关键词搜索要登录签名，没有接
  if (s.kind === 'bili') {
    const out = [], seen = new Set();
    const bget = async u => { try { return JSON.parse(await (await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' }, signal: AbortSignal.timeout(15000) })).text()); } catch { return {}; } };
    const lists = [];
    for (const rid of [188, 36]) lists.push((await bget(`https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`)).data?.list || []);
    let ok = lists.some(l => l.length);
    for (const pn of [1, 2, 3]) { const d = await bget(`https://api.bilibili.com/x/web-interface/popular?ps=50&pn=${pn}`); if (d.code === 0) ok = true; lists.push(d.data?.list || []); }
    if (!ok) throw new Error('B 站这次没让读（风控）');
    for (const v of lists.flat()) {
      if (!v.bvid || seen.has(v.bvid) || !AI_RE.test(v.title)) continue; seen.add(v.bvid);
      out.push({ title: v.title, url: `https://www.bilibili.com/video/${v.bvid}`, time: v.pubdate ? new Date(v.pubdate * 1000).toISOString() : null, summary: String(v.desc || '').slice(0, 280), sourceName: 'B 站 · ' + (v.owner?.name || ''),
        img: String(v.pic || '').replace(/^http:/, 'https:'), heat: { views: v.stat?.view || 0, likes: v.stat?.like || 0, comments: v.stat?.reply || 0 }, sec: v.duration || 0 });
    }
    return out;
  }
  // Hugging Face 每日论文：社区顶上来的新论文
  if (s.kind === 'hfpapers') {
    const d = JSON.parse(await get(`https://huggingface.co/api/daily_papers?limit=${s.max || 25}`, 20000));
    return d.filter(x => x.paper?.id).map(x => ({ title: x.title || x.paper.title, url: `https://huggingface.co/papers/${x.paper.id}`, time: x.publishedAt || null, summary: String(x.summary || x.paper.summary || '').replace(/\s+/g, ' ').slice(0, 300),
      img: x.thumbnail || '', heat: { points: x.paper.upvotes || 0, comments: x.numComments || 0 } }));
  }
  // Reddit：几个版块合成一次请求取本周最热（分开拉会被限流），每条按它所在的版块署名
  if (s.kind === 'reddit') {
    const xml = await get(`https://www.reddit.com/r/${s.subs.join('+')}/top/.rss?t=week&limit=${s.max || 60}`);
    return xml.split(/<entry[\s>]/).slice(1).map(b => {
      const x = parseRss('<entry>' + b)[0]; if (!x) return null;
      const sub = (b.match(/<category[^>]*term="([^"]+)"/) || [])[1] || s.subs[0];
      return { ...x, summary: x.summary.replace(/submitted by.*$/i, '').trim().slice(0, 300), sourceName: 'Reddit r/' + sub };
    }).filter(Boolean);
  }
  // DeepSeek 更新页：每个日期下面几条更新
  if (s.kind === 'deepseek') {
    const html = await get(s.url), out = [];
    for (const sec of html.split(/<h2[^>]*id="date-/).slice(1)) {
      const date = (sec.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1]; if (!date) continue;
      for (const m of sec.matchAll(/<h3[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>\s*(?:<p>([\s\S]*?)<\/p>)?/g))
        out.push({ title: 'DeepSeek：' + text(m[2]).replace(/\u200b/g, '').trim(), url: `${s.url}?item=${m[1]}#${m[1]}`, time: new Date(date + 'T04:00:00Z').toISOString(), summary: text(m[3] || '').slice(0, 300) });
    }
    return out.slice(0, s.max || 8);
  }
  if (s.kind === 'hn') {
    const since = Math.floor(Date.now() / 1000) - 10 * 86400;
    const d = JSON.parse(await get(`https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i%3E${since},points%3E60&hitsPerPage=300`));
    return d.hits.map(h => ({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, discuss: `https://news.ycombinator.com/item?id=${h.objectID}`, time: h.created_at, summary: '', heat: { points: h.points, comments: h.num_comments } }));
  }
  if (s.kind === 'ghtrend') {
    const html = await get(s.url);
    return html.split('<article class="Box-row">').slice(1).map(a => {
      const repo = ((a.match(/<h2[\s\S]*?href="\/([^"]+)"/) || [])[1] || '').trim();
      const desc = text((a.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/) || [])[1] || '');
      const week = +(((a.match(/([\d,]+) stars this week/) || [])[1] || '0').replace(/,/g, ''));
      return { img: repo ? `https://opengraph.githubassets.com/1/${repo}` : '', title: repo + (desc ? '：' + desc : ''), url: 'https://github.com/' + repo, time: null, summary: desc, heat: { stars: week } };
    }).filter(x => x.url.length > 19);
  }
  if (s.kind === 'anthropic') {
    const html = await get(s.url);
    const seen = new Set(), out = [];
    for (const m of html.matchAll(/href="(\/news\/[a-z0-9-]+)"[^>]*>(?:\s*<[^>]+>)*\s*([^<]{6,140})</g)) {
      if (seen.has(m[1]) || /^\/news\/(announcements|category)/.test(m[1])) continue;
      seen.add(m[1]); out.push({ title: text(m[2]), url: 'https://www.anthropic.com' + m[1], time: null, summary: '' });
    }
    return out.slice(0, s.max || 20);
  }
  return [];
}

/* ---------- 存储与打分 ---------- */
export function feed() { try { return JSON.parse(fs.readFileSync(FEED, 'utf8')); } catch { return { updated: null, items: {}, status: {} }; } }
function saveFeed(f) { fs.mkdirSync(path.dirname(FEED), { recursive: true }); fs.writeFileSync(FEED, JSON.stringify(f)); }
// 发布类：新模型、产品更新、新产品、AI 游戏。作者最想先看到的就是这些
const LAUNCH = new Set(['模型发布', '产品更新', 'AI 新品', 'AI 游戏']);
// 官方渠道里不算产品动态的：客户案例、活动预告、表态
const SOFT = new Set(['行业观点', '其他', '政策监管', '公司人事']);
export function score(it, now = Date.now()) {
  const t = Date.parse(it.time || it.firstSeen) || now;
  // 没有发布时间的（GitHub 趋势、Anthropic 新闻页）按“几天前”算，免得一直排在最前
  const age = Math.max(it.time ? 0 : 2, (now - t) / 86400000);
  // 官方发布没有热度数，给一个基础热度，免得被社区热帖全部压到后面；报道和转述的基础热度依次降低；榜单类的源自带基础热度
  const h = it.heat || {}, base = Math.max({ A: 200, B: 0, C: 40, D: 10 }[it.tier] || 0, it.base || 0);
  const heat = Math.max(base, (h.points || 0) + (h.comments || 0) / 2 + (h.stars || 0) / 40 + (h.likes || 0) / 20 + (h.reposts || 0) / 5 + (h.replies || 0) / 4 + (h.views || 0) / 2500);
  const cat = it.zh?.cat, launch = LAUNCH.has(cat);
  // 发布类加权；只有媒体在报的发布（官方没有可订阅的渠道，国内厂商大多这样）不再按“二手”压得很低
  let w = TIERS[it.tier].w;
  if (launch) w = Math.max(w, { C: 0.8, D: 0.6 }[it.tier] || 0);
  const k = launch ? 1.3 : it.tier === 'A' && SOFT.has(cat) ? 0.7 : 1;
  // 海外有、中文圈还没人讲的，往前排一点
  const g = it.gap ? 1.15 : 1;
  // 视频平台上的条目是给视频选题当参考的，播放量动辄几十万，放进总榜会把产品动态挤下去：总榜里降权，「视频」筛选里它们之间照常按热度排
  const vd = VIDEO_SRC.has(it.source) ? 0.45 : 1;
  return w * k * g * vd * Math.exp(-age / 5) * (1 + Math.log10(1 + heat));
}

export async function refresh(onlyIds, opts = {}) {
  const f = feed(), now = new Date().toISOString(), status = { ...(f.status || {}) };
  const list = SOURCES.filter(s => !onlyIds || onlyIds.includes(s.id));
  let added = 0;
  // 同时最多拉 6 个源
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async s => {
      try {
        let items = await fetchSource(s, opts);
        if (items === null) { status[s.id] = { ...(status[s.id] || {}), waiting: true }; return; }  // 没到间隔，这次不拉
        if (!s.ai) items = items.filter(x => AI_RE.test(s.titleOnly ? x.title : x.title + ' ' + x.summary));
        for (const x of items) {
          const key = normUrl(x.url), id = hash(key), old = f.items[id];
          if (!x.img) delete x.img;
          f.items[id] = { ...(old || {}), ...x, id, url: key, source: s.id, sourceName: x.sourceName || s.name, tier: x.tier || s.tier, firstSeen: old?.firstSeen || now, starred: old?.starred || false, ...(s.base ? { base: s.base } : {}) };
          if (!old) added++;
        }
        status[s.id] = { ok: true, n: items.length, t: now };
      } catch (e) { status[s.id] = { ok: false, off: !!e.off, error: e.message.slice(0, 80), t: now }; }
    }));
  }
  // 只留最近 30 天，收藏的一直留着
  const cut = Date.now() - 30 * 86400000;
  for (const [id, it] of Object.entries(f.items)) if (!it.starred && (Date.parse(it.time || it.firstSeen) || 0) < cut) delete f.items[id];
  f.updated = now; f.status = status; saveFeed(f);
  setTimeout(() => fillImages().catch(() => {}), 100);   // 没图的条目，后台去原网页找配图
  setTimeout(() => digestAll().then(() => gapScan()).catch(() => {}), 200);    // 新条目写中文标题和一句话要点，写完接着判断哪些是「中文圈还没人讲」的
  return { added, total: Object.keys(f.items).length, status };
}

/* ---------- 配图：原网页声明的分享图（og:image） ---------- */
// 只读网页开头一段，找 og:image / twitter:image；找不到的记下来，一周内不再试
async function headOf(url, ms = 8000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok || !/html/.test(r.headers.get('content-type') || '')) throw new Error('不是网页');
  const rd = r.body.getReader(), dec = new TextDecoder(); let s = '';
  while (s.length < 300000) { const { done, value } = await rd.read(); if (done) break; s += dec.decode(value, { stream: true }); if (/<\/head>/i.test(s)) break; }
  rd.cancel().catch(() => {});
  return { html: s, base: r.url };
}
export async function imageOf(url, opts = {}) {
  const u = new URL(url);
  if (/(^|\.)github\.com$/.test(u.hostname)) { const [, o, r] = u.pathname.split('/'); return o && r ? `https://opengraph.githubassets.com/1/${o}/${r}` : ''; }
  if (WALLED.test(u.hostname) || /news\.ycombinator\.com$/.test(u.hostname)) return '';
  let html = '', base = url;
  try { ({ html, base } = await headOf(url)); } catch {}
  // 直接抓被拦（OpenAI 等）或者页面靠脚本生成（36氪等）：用无头 Chrome 打开再找
  const has = h => /<meta[^>]+(og:image|twitter:image)/i.test(h);
  if (!has(html) && opts.chrome) { try { html = await viaChrome(url); } catch {} }
  const meta = k => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, 'i')) || [])[1];
  const img = meta('og:image') || meta('og:image:url') || meta('twitter:image') || meta('twitter:image:src') || '';
  if (!img || /logo|favicon|default[-_]?(og|share)|placeholder/i.test(img)) return '';   // 网站 logo 当配图不好看，宁可用占位图
  try { return new URL(decode(img), base).href; } catch { return ''; }
}
let filling = null;
export function fillImages({ max = 160 } = {}) {
  if (filling) return filling;
  filling = (async () => {
    const week = Date.now() - 7 * 86400000;
    const slow = [];
    const todo = Object.values(feed().items).filter(it => !it.img && !(it.imgTried && Date.parse(it.imgTried) > week)).sort((a, b) => score(b) - score(a)).slice(0, max);
    for (let i = 0; i < todo.length; i += 8) {
      const got = await Promise.all(todo.slice(i, i + 8).map(async it => { try { return [it.id, await imageOf(it.url)]; } catch { return [it.id, '']; } }));
      for (const g of got) if (!g[1] && slow.length < 30) slow.push(todo.find(t => t.id === g[0]));
      const f = feed(), now = new Date().toISOString();   // 每批重新读一次再写，别冲掉别处刚存的
      for (const [id, img] of got) if (f.items[id]) { if (img) f.items[id].img = img; else f.items[id].imgTried = now; }
      saveFeed(f);
    }
    for (let i = 0; i < slow.length; i += 2) {
      const got = await Promise.all(slow.slice(i, i + 2).map(async it => { try { return [it.id, await imageOf(it.url, { chrome: true })]; } catch { return [it.id, '']; } }));
      const f = feed(); for (const [id, img] of got) if (img && f.items[id]) { f.items[id].img = img; delete f.items[id].imgTried; } saveFeed(f);
    }
    return todo.length;
  })().finally(() => { filling = null; });
  return filling;
}

// 哪些来源是视频平台、哪些是中文来源
const VIDEO_SRC = new Set(SOURCES.filter(s => s.video).map(s => s.id)), ZH_SRC = new Set(SOURCES.filter(s => s.zh).map(s => s.id));
export function items({ days = 7, tiers, source, q, starred } = {}) {
  const f = feed(), cut = Date.now() - days * 86400000;
  let list = Object.values(f.items).filter(it => (Date.parse(it.time || it.firstSeen) || Date.now()) >= cut);
  if (tiers?.length) list = list.filter(it => tiers.includes(it.tier));
  if (source) list = list.filter(it => it.source === source);
  if (starred) list = list.filter(it => it.starred);
  if (q) { const k = q.toLowerCase(); list = list.filter(it => (it.title + ' ' + it.summary).toLowerCase().includes(k)); }
  list = list.map(it => ({ ...it, score: +score(it).toFixed(3), ...(VIDEO_SRC.has(it.source) ? { video: true } : {}), ...(ZH_SRC.has(it.source) ? { cn: true } : {}) })).sort((a, b) => b.score - a.score);
  // 同一个版本的发布（Fable 5.2、Gemini 4 Carbon）官方、媒体、社区会各发一遍：分最高的那条照常排，后面重复的降权，把位置让给别的事
  const seen = new Set();
  for (const it of list) {
    const keys = versionKeys(`${it.zh?.t || ''} ${it.title}`);
    if (keys.some(k => seen.has(k))) { it.score = +(it.score * 0.5).toFixed(3); it.repeat = true; }
    keys.forEach(k => seen.add(k));
  }
  return list.sort((a, b) => b.score - a.score);
}
// 从标题里找「产品名 + 版本号」，如 Fable 5.2、Gemini 4、GPT-6、Qwen4。年份和月份不算
const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|top|chapter|series|issue|week|day|part|vol|no|w)/;
function versionKeys(t) {
  const out = new Set();
  for (const m of String(t).matchAll(/\b([A-Z][A-Za-z]+(?:[ -][A-Z][a-z]+)?)[ -]?(\d+(?:\.\d+)*)\b/g)) {
    const name = m[1].toLowerCase().replace(/[ -]/g, ''), ver = m[2];
    if (+ver >= 1900 || MONTH.test(name) || name.length < 3) continue;
    out.add(name + ver);
  }
  return [...out];
}
export function star(id, on) { const f = feed(); if (f.items[id]) { f.items[id].starred = !!on; saveFeed(f); } return f.items[id]; }

/* ---------- 读原文：抓网页正文 ---------- */
// 读原文。一层层兜底：直接抓 → 无头 Chrome 打开（跑完 JS 再取字）→ Jina Reader → 让 Claude 用网页抓取工具读。
// max 是最多取多少字（选题广场 1.4 万字够了；助手读全文时给得更多）
function extract(html, max) {
  const title = text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  let body = (html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  body = body.replace(/<(script|style|nav|footer|header|aside|form|noscript|svg)[\s\S]*?<\/\1>/gi, ' ');
  const paras = [...body.matchAll(/<(h[1-4]|p|li|blockquote|pre|td)[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => text(m[2])).filter(t => t.length > 18);
  // <article> 里正文太少（比如正文在 div 里），退到整页再抽一次
  if (paras.join('').length < 400 && body !== html) return extract(html.replace(/<article[\s\S]*?<\/article>/i, m => m.replace(/<\/?article[^>]*>/gi, '')).replace(/<\/?main[^>]*>/gi, ''), max);
  return { title, content: [...new Set(paras)].join('\n\n').slice(0, max) };
}
function viaChrome(url) {
  return new Promise((resolve, reject) => {
    execFile(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(DATA_DIR, 'chrome-read')}`, '--virtual-time-budget=8000', `--user-agent=${UA}`, '--dump-dom', url],
      { timeout: 25000, maxBuffer: 30 * 1024 * 1024 }, (e, out) => e ? reject(e) : resolve(out));
  });
}
// GitHub：网页常被墙或超时，用本机登录好的 gh 走接口读（仓库简介 + README、文件、issue / PR 和评论、版本说明）
const gh = args => new Promise((resolve, reject) => execFile('gh', args, { timeout: 30000, maxBuffer: 20 * 1024 * 1024 }, (e, out) => e ? reject(e) : resolve(out)));
async function viaGitHub(u, max) {
  const [, o, r, kind, ...rest] = u.pathname.split('/'); if (!o || !r) return null;
  const repo = `repos/${o}/${r}`, b64 = x => Buffer.from(x, 'base64').toString('utf8');
  if (!kind) {
    const m = JSON.parse(await gh(['api', repo]));
    let readme = ''; try { readme = b64(JSON.parse(await gh(['api', `${repo}/readme`])).content); } catch {}
    return { title: `${o}/${r}`, content: `${m.description || ''}\n星数 ${m.stargazers_count}，最近更新 ${String(m.pushed_at).slice(0, 10)}，许可证 ${m.license?.spdx_id || '未注明'}\n\n${readme}`.slice(0, max) };
  }
  if (kind === 'blob' || kind === 'tree') {
    const [ref, ...p] = rest; let j;
    // 链接里的分支名不对（比如写成 main，实际默认分支是别的）：退到默认分支再读
    try { j = JSON.parse(await gh(['api', `${repo}/contents/${p.join('/')}?ref=${ref}`])); } catch { j = JSON.parse(await gh(['api', `${repo}/contents/${p.join('/')}`])); }
    return { title: `${o}/${r}/${p.join('/')}`, content: (Array.isArray(j) ? j.map(x => `${x.type}  ${x.path}`).join('\n') : b64(j.content)).slice(0, max) };
  }
  if ((kind === 'issues' || kind === 'pull') && rest[0]) {
    const it = JSON.parse(await gh(['api', `${repo}/issues/${rest[0]}`]));
    const cs = JSON.parse(await gh(['api', `${repo}/issues/${rest[0]}/comments?per_page=30`]));
    return { title: it.title, content: `${it.title}（${it.state}，${String(it.created_at).slice(0, 10)}，@${it.user?.login}）\n\n${it.body || ''}\n\n${cs.map(c => `--- @${c.user?.login} ${String(c.created_at).slice(0, 10)}\n${c.body}`).join('\n\n')}`.slice(0, max) };
  }
  if (kind === 'releases') {
    const rs = JSON.parse(await gh(['api', `${repo}/releases?per_page=8`]));
    return { title: `${o}/${r} 版本说明`, content: rs.map(x => `## ${x.name || x.tag_name}（${String(x.published_at).slice(0, 10)}）\n${x.body || ''}`).join('\n\n').slice(0, max) };
  }
  return null;
}
// 要登录才看得全的站：直接抓和无头 Chrome 只能拿到登录页，先走 Jina
const WALLED = /(^|\.)(x\.com|twitter\.com|weibo\.com|weibo\.cn|zhihu\.com|xiaohongshu\.com)$/;
export async function readUrl(url, { max = 14000 } = {}) {
  const u = new URL(url);
  if (/^(www\.)?(x|twitter)\.com$/.test(u.hostname)) {
    const it = Object.values(feed().items).find(i => i.url === normUrl(url));
    if (it) return { title: it.sourceName, url, content: it.full || it.summary, via: 'X 接口' };
    const sid = (u.pathname.match(/\/status(?:es)?\/(\d+)/) || [])[1];
    if (sid && xapi.config().token) {
      try { const t = await xapi.lookup(sid); return { title: `X @${t.handle}（${t.name}）`, url, content: `@${t.handle}（${t.name}），${String(t.time).slice(0, 16).replace('T', ' ')}，${t.metrics}\n\n${t.text}`, via: 'X 官方接口' }; }
      catch (e) { if (e.budget) throw e; }
    }
  }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/.test(u.hostname)) throw new Error('这个地址不能抓');
  if (/(^|\.)github\.com$/.test(u.hostname)) { try { const r = await viaGitHub(u, max); if (r?.content?.length >= 50) return { ...r, url, via: 'GitHub 接口' }; } catch {} }
  if (WALLED.test(u.hostname)) return readViaFallback(url, max);
  try { const r = extract(await get(url, 20000), max); if (r.content.length >= 200) return { ...r, url, via: '直接抓取' }; } catch {}
  try { const r = extract(await viaChrome(url), max); if (r.content.length >= 200) return { ...r, url, via: '无头 Chrome' }; } catch {}
  return readViaFallback(url, max);
}
async function readViaFallback(url, max = 14000) {
  try {
    const md = await get('https://r.jina.ai/' + url, 30000);
    const title = (md.match(/^Title:\s*(.+)$/m) || [])[1] || '';
    const content = (md.split(/^Markdown Content:\s*$/m)[1] || md).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
    if (content.length > 200) return { title, url, content, via: 'Jina Reader' };
  } catch {}
  try {
    const content = await ai.generate({ provider: ai.light(), web: true, searches: 2, system: '你是网页正文提取器。用网页抓取工具打开用户给的网址，原样输出正文的主要内容（保留原文语言，不要总结、不要评论）。打不开就只输出“抓取失败：原因”。', prompt: url });
    if (content && !/^抓取失败/.test(content.trim()) && content.length > 200) return { title: '', url, content: content.slice(0, max), via: 'Claude 网页抓取' };
  } catch {}
  throw new Error('这个页面抓不到正文（可能要登录，或者网站禁止抓取）');
}

/* ---------- 中文要点和分类：让人扫一眼就知道每条在说什么 ---------- */
export const CATS = ['模型发布', '产品更新', 'AI 新品', 'AI 游戏', 'AI 知识', '编程开发', 'Agent', '开源项目', '融资商业', '芯片硬件', '安全隐私', '多模态', '研究论文', '公司人事', '政策监管', '行业观点', '其他'];
const jsonOf = (out, open = '[') => { const close = open === '[' ? ']' : '}', end = out.lastIndexOf(close); for (const i of [...out.matchAll(new RegExp('\\' + open + '\\s*[\\{"\\[]', 'g'))].map(m => m.index)) { try { return JSON.parse(out.slice(i, end + 1)); } catch {} } return null; };
let digesting = null, digestErr = '';
export function digestState() { const l = Object.values(feed().items); return { running: !!digesting, done: l.filter(x => x.zh).length, total: l.length, error: digestErr }; }
// 一批 30 条，交给 AI 写中文标题、一句话要点、分类；排前面的先做
export function digestAll({ provider } = {}) {
  if (digesting) return digesting;
  digestErr = '';
  digesting = (async () => {
    const todo = Object.values(feed().items).filter(x => !x.zh).sort((a, b) => score(b) - score(a));
    const batches = []; for (let i = 0; i < todo.length; i += 30) batches.push(todo.slice(i, i + 30));
    const one = async batch => {
      const out = await ai.generate({ provider: ai.light(provider),
        system: '你是资讯编辑，替中文读者快速看懂每条动态。只根据给的标题和摘要写，不编造没给的事实。只输出 JSON。',
        prompt: `下面每行是一条动态：编号、来源、原标题、摘要。\n${batch.map(it => `#${it.id} [${it.sourceName}] ${it.title}${it.summary ? ' —— ' + String(it.summary).slice(0, 260) : ''}`).join('\n')}\n\n每条输出一项：\n{"id":"编号，不带#","t":"中文标题，20 字以内，说清谁做了什么；产品名、人名保留原文","one":"一句话说清发生了什么、关键数字或结论，40 字以内；信息不够就照标题意思说，不要猜","cat":"分类，只能从这里选一个：${CATS.join('、')}"}\n分类提示：新上线的独立产品、工具、应用（Product Hunt、V2EX、Hugging Face 应用上的这类）选「AI 新品」；已有产品加功能、改版、调价选「产品更新」；用 AI 做的游戏、游戏里的 AI 玩法、AI 游戏开发工具和围绕它们的争议选「AI 游戏」；讲原理、教程、深度长文、论文解读、长访谈、科普视频选「AI 知识」；客户案例、活动预告选「其他」。\n只输出 JSON 数组。` });
      const arr = jsonOf(out) || [], f = feed();
      for (const x of arr) { const it = f.items[String(x?.id || '').replace('#', '')]; if (it && x.t) it.zh = { t: String(x.t).slice(0, 60), one: String(x.one || '').slice(0, 120), cat: CATS.includes(x.cat) ? x.cat : '其他' }; }
      saveFeed(f);
    };
    // 两批并行
    for (let i = 0; i < batches.length; i += 2) {
      const r = await Promise.allSettled(batches.slice(i, i + 2).map(one));
      const bad = r.find(x => x.status === 'rejected'); if (bad) { digestErr = String(bad.reason?.message || bad.reason).slice(0, 120); if (i === 0) break; }
    }
  })().finally(() => { digesting = null; });
  return digesting;
}

// 点开一条：读原文，让 AI 说清这条讲了什么（存下来，下次直接看）
const briefing = new Map();
export function brief(id, { provider, force = false } = {}) {
  if (briefing.has(id)) return briefing.get(id);
  const p = (async () => {
    const it = feed().items[id]; if (!it) throw new Error('这条素材找不到了，刷新一下');
    if (it.brief && !force) return it.brief;
    let text = '', via = '';
    try { const r = await readUrl(it.url, { max: 24000 }); text = r.content; via = r.via; } catch {}
    if (text.length < 200 && (it.full || it.summary)) { text = it.full || it.summary; via = via || '只有摘要'; }
    if (!text) throw new Error('原文读不到（可能要登录或禁止抓取），点「打开原网页」看');
    const out = await ai.generate({ provider: ai.light(provider),
      system: `你是资讯编辑。${core.persona()}只根据给的原文写，原文没说的不要补，数字照抄原文。只输出 JSON。`,
      prompt: `来源：${it.sourceName}（${TIERS[it.tier].name}）\n原标题：${it.title}\n链接：${it.url}\n原文：\n<<<\n${text.slice(0, 24000)}\n>>>\n\n输出一个 JSON 对象：\n{"t":"中文标题，20 字以内","one":"一句话：发生了什么，40 字以内","points":["这篇讲了什么，3–6 条，每条一句，具体到事实"],"numbers":["原文里的关键数字，带对象和口径，没有就空数组"],"angle":"对写 AI 产品拆解的公众号来说，这条可以怎么写、值不值得写，一两句","who":"谁最该关心这条，一句","cat":"分类，只能选一个：${CATS.join('、')}"}` });
    const b = jsonOf(out, '{');
    if (!b?.points?.length) throw new Error('AI 没整理出来，再点一次试试');
    const res = { t: String(b.t || '').slice(0, 60), one: String(b.one || '').slice(0, 160), points: b.points.map(String).slice(0, 8), numbers: (b.numbers || []).map(String).slice(0, 8), angle: String(b.angle || ''), who: String(b.who || ''), via, at: new Date().toISOString() };
    const f = feed(); if (f.items[id]) { f.items[id].brief = res; f.items[id].zh = { t: res.t || f.items[id].zh?.t, one: res.one || f.items[id].zh?.one, cat: CATS.includes(b.cat) ? b.cat : f.items[id].zh?.cat || '其他' }; saveFeed(f); }
    return res;
  })().finally(() => briefing.delete(id));
  briefing.set(id, p);
  return p;
}

/* ---------- 信息差：海外在讲、中文圈还没人讲的 ---------- */
// 拿海外来源里排在前面的条目，对着最近两周中文来源的标题问 AI：哪些事中文这边一条都没提到。
// 只能按工作台接进来的中文来源判断，不代表中文互联网上真的没人讲过。判断过的不重复判断。
let gapping = null;
export function gapState() { const l = Object.values(feed().items); return { running: !!gapping, gaps: l.filter(x => x.gap).length, judged: l.filter(x => x.gap != null).length }; }
export function gapScan({ provider, max = 90 } = {}) {
  if (gapping) return gapping;
  gapping = (async () => {
    const now = Date.now(), all = Object.values(feed().items);
    const age = it => (now - (Date.parse(it.time || it.firstSeen) || now)) / 86400000;
    const cn = all.filter(it => ZH_SRC.has(it.source) && age(it) <= 14).sort((a, b) => score(b) - score(a)).slice(0, 650).map(it => it.zh?.t || it.title);
    // 候选：海外来源、近 7 天、已经有中文要点、还没判断过；转述档不看
    const todo = all.filter(it => !ZH_SRC.has(it.source) && it.tier !== 'D' && it.gap == null && it.zh?.t && age(it) <= 7).sort((a, b) => score(b) - score(a)).slice(0, max);
    if (todo.length < 5 || cn.length < 20) return 0;
    let found = 0;
    for (let i = 0; i < todo.length; i += 45) {
      const batch = todo.slice(i, i + 45);
      const out = await ai.generate({ provider: ai.light(provider),
        system: '你是中文科技媒体的资深编辑，熟悉中文圈和英文圈各自在聊什么。只按给你的两份清单判断，不要凭印象补充。只输出 JSON。',
        prompt: `【中文来源最近两周的标题】\n${cn.map(t => '- ' + t).join('\n')}\n\n【海外来源的条目】（编号、来源、中文概括）\n${batch.map(it => `#${it.id} [${it.sourceName}] ${it.zh.t}${it.zh.one ? ' —— ' + it.zh.one : ''}`).join('\n')}\n\n请挑出「信息差」条目：海外这边在讲，而上面的中文标题里**完全没有提到同一件事、同一个产品或同一个观点**的。\n要求：\n- 只挑有内容的：新的方法、观点、数据、产品、工具、长文、访谈、论文都算；活动预告、招聘、客套话、纯转发不算\n- 中文标题里只要有一条讲的是同一件事（哪怕角度不同、只是顺带提到），就不算信息差\n- 大公司的大新闻（新旗舰模型、上市、收购、高管变动）中文媒体基本都会报，除非清单里确实找不到，否则不要挑\n- 最值得挑的是：小团队的新工具、具体功能更新、个人专栏的长文和观点、论文、访谈\n- 宁缺毋滥\n只输出一个 JSON 数组，每项 {"id":"编号，不带#","why":"中文读者为什么值得知道，20 字以内"}。一个都没有就输出 []。` });
      const arr = jsonOf(out) || [], picked = new Map(arr.map(x => [String(x?.id || '').replace('#', ''), String(x?.why || '').slice(0, 40)]));
      const f = feed();
      for (const it of batch) if (f.items[it.id]) { const hit = picked.has(it.id); f.items[it.id].gap = hit; if (hit) { f.items[it.id].gapWhy = picked.get(it.id); found++; } }
      saveFeed(f);
    }
    return found;
  })().finally(() => { gapping = null; });
  return gapping;
}

/* ---------- AI 从素材里挑选题 ---------- */
export function lastIdeas() { try { return JSON.parse(fs.readFileSync(IDEAS, 'utf8')); } catch { return null; } }
// 一次挑三类：适合写成文章的选题、适合发短评的动态（附一段能直接发的短评）、适合写的项目（产品、开源仓库、工具）
export async function ideas({ direction = '', days = 7, provider, existing = [] }) {
  const pool = items({ days }).slice(0, 160);
  if (pool.length < 10) throw new Error('素材太少，先点「刷新信息源」');
  const lines = pool.map(it => `#${it.id} [${TIERS[it.tier].name}·${it.sourceName}] ${(it.time || it.firstSeen).slice(5, 10)}${it.heat?.points ? ` HN${it.heat.points}分/${it.heat.comments}评` : ''}${it.heat?.stars ? ` 本周+${it.heat.stars}星` : ''}${it.heat?.likes ? ` ${it.heat.likes}赞` : ''}${it.video ? ` 【视频${it.heat?.views ? '·播放' + (it.heat.views >= 10000 ? (it.heat.views / 10000).toFixed(1) + '万' : it.heat.views) : ''}】` : ''}${it.gap ? ' 【中文圈还没人讲】' : ''} ${it.zh?.t || it.title}${it.zh?.one ? ' — ' + it.zh.one : it.summary ? ' — ' + it.summary.slice(0, 90) : ''}`).join('\n');
  const out = await ai.generate({ provider: ai.light(provider),
    system: `你是选题编辑。${core.persona()}能发的平台有公众号长文、小红书卡片和图文、知乎、今日头条、微博，以及抖音和视频号上的短视频。你只能用给你的素材，不编造。只输出 JSON。`,
    prompt: `下面是最近 ${days} 天从各信息源抓到的 ${pool.length} 条动态，每条前面是编号和可信度：官方一手 > 社区一手 > 原创报道 > 转述。
${lines}

${direction ? `这次关注的方向：${direction}。\n` : ''}请分四类挑：
1. articles：适合写成公众号长文的选题，5–7 个。要能写出深度拆解、横向对比或行业分析；多个来源同时在说、有争议或有信息差的优先；证据至少一条「官方一手」或「社区一手」，「转述」只能当热度参考。避开已经写过的：${existing.slice(0, 30).join('、') || '（无）'}。
2. takes：适合发一条短评的动态，6–8 条。新鲜、有反差、一句话就能说出观点的事。每条替作者写好一段能直接发在微博或朋友圈的短评：60–120 字，第一人称，有自己的判断，说清楚事实再给看法；像真人随手写的，不用“不是……而是……”，不用排比和金句收尾，不堆感叹号和表情。
3. projects：适合专门写一篇或做一组卡片来拆解的项目，5–7 个：新产品、新功能、开源仓库、工具。要说清它是什么、为什么值得拆；形式是 article（公众号拆解）或 card（小红书卡片，适合一眼能看懂的产品）。
4. videos：适合做成 AI 科普短视频（60–120 秒口播 + 画面）的选题，5–7 个。优先三种：素材里带【视频】标记、播放量高的题目换个角度讲（写明参考的是哪条、播放多少）；带【中文圈还没人讲】标记的海外内容，讲给中文观众听；普通人用得上的 AI 新功能、新工具。每个要能一句话说清「看完能知道什么」，开头第一句话要让人想听下去。避开已经写过的。
标题像真人起的：具体、有信息量，不要标题党。
只输出一个 JSON 对象：
{"videos":[{"title":"视频标题，15 字以内","angle":"讲什么、分几步讲清楚","hook":"开头第一句原话","why":"为什么现在做（引用素材里的事实：哪条视频播放多少、哪个消息中文圈还没人讲）","evidence":["素材编号，2–5 条"]}],
 "articles":[{"title":"暂定标题","angle":"从什么角度写、读者能得到什么","why":"为什么现在值得写（引用素材里的事实和日期）","hook":"开头可以用的具体场景或数字","evidence":["素材编号，不带#，按重要性排，2–6 条"]}],
 "takes":[{"id":"素材编号","take":"短评正文","tag":"观点、吐槽、数据、提醒 里选一个"}],
 "projects":[{"id":"素材编号","name":"项目或产品名","what":"一句话说它是什么","why":"为什么值得拆","form":"article 或 card"}]}` });
  let o = null; const end = out.lastIndexOf('}');
  for (const m of [...out.matchAll(/\{\s*"/g)]) { try { o = JSON.parse(out.slice(m.index, end + 1)); if (o && (o.articles || o.takes || o.projects || o.videos)) break; } catch {} o = null; }
  if (!o) throw new Error('AI 这次没给出能用的选题，再试一次');
  const byId = Object.fromEntries(pool.map(it => [it.id, it]));
  const ref = e => ({ id: e.id, title: e.zh?.t || e.title, url: e.url, tier: e.tier, sourceName: e.sourceName, discuss: e.discuss, img: e.img || '', ...(e.video ? { video: true, views: e.heat?.views || 0 } : {}), ...(e.gap ? { gap: true } : {}) });
  const articles = (o.articles || []).filter(x => x?.title).map(x => {
    const ev = (x.evidence || []).map(id => byId[String(id).replace('#', '')]).filter(Boolean);
    return { id: hash(x.title + Date.now()), title: x.title, angle: x.angle || '', why: x.why || '', hook: x.hook || '', form: 'article',
      evidence: ev.map(ref), firstHand: ev.some(e => e.tier === 'A' || e.tier === 'B'), sources: ev.map(e => e.url) };
  }).filter(x => x.evidence.length);
  const videos = (o.videos || []).filter(x => x?.title).map(x => {
    const ev = (x.evidence || []).map(id => byId[String(id).replace('#', '')]).filter(Boolean);
    return { id: hash('v' + x.title + Date.now()), title: x.title, angle: x.angle || '', why: x.why || '', hook: x.hook || '', form: 'script', evidence: ev.map(ref), gap: ev.some(e => e.gap), sources: ev.map(e => e.url) };
  }).filter(x => x.evidence.length);
  const takes = (o.takes || []).map(x => { const it = byId[String(x?.id || '').replace('#', '')]; return it && x.take ? { id: hash(x.take), take: String(x.take), tag: x.tag || '', item: ref(it) } : null; }).filter(Boolean);
  const projects = (o.projects || []).map(x => { const it = byId[String(x?.id || '').replace('#', '')]; return it && x.name ? { id: hash(x.name + it.id), name: x.name, what: x.what || '', why: x.why || '', form: x.form === 'card' ? 'card' : 'article', item: ref(it), heat: it.heat || null } : null; }).filter(Boolean);
  if (!articles.length && !takes.length && !projects.length && !videos.length) throw new Error('AI 这次没给出能用的选题，再试一次');
  const res = { t: new Date().toISOString(), direction, days, items: articles, takes, projects, videos };
  fs.writeFileSync(IDEAS, JSON.stringify(res, null, 2));
  return res;
}

// 深挖一个选题：把它的一手证据原文抓下来，让 AI 整理成写作简报
export async function deepen(idea, provider) {
  const ev = (idea.evidence || []).slice(0, 4);
  const docs = (await Promise.all(ev.map(async e => { try { const d = await readUrl(e.url); return `【${TIERS[e.tier]?.name || ''}·${e.sourceName}】${d.title}\n${e.url}\n${d.content.slice(0, 5000)}`; } catch (err) { return `【${e.sourceName}】${e.title}\n${e.url}\n（正文抓取失败：${err.message}）`; } }))).join('\n\n---\n\n');
  const brief = await ai.generate({ provider: ai.light(provider), web: true, searches: 8,
    system: '你是认真的资料员，给作者准备写作简报。只写原文里有的事实，每条后面标出处链接；原文没有的就说没有，可以联网补查但要标来源。用中文。',
    prompt: `选题：${idea.title}\n角度：${idea.angle}\n\n下面是这个选题的一手材料原文：\n\n${docs}\n\n请整理成写作简报（Markdown）：\n## 发生了什么（时间线，带日期）\n## 关键事实和数字（每条带 [来源](链接)）\n## 原话摘录（谁说的，原文一两句）\n## 争议和不同看法\n## 还缺什么、要去哪核实` });
  // 存回选题文件，刷新页面后简报还在
  const saved = lastIdeas(), hit = saved?.items?.find(x => x.title === idea.title);
  if (hit) { hit.brief = brief.trim(); hit.briefAt = new Date().toISOString(); fs.writeFileSync(IDEAS, JSON.stringify(saved, null, 2)); }
  return brief.trim();
}
