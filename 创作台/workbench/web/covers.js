// 选题广场的生成封面：素材没有真实配图（或者图加载失败）时用。
// 按标题判断主题画对应的图案，再按条目 id 挑配色和随机细节，同一条每次画出来一样，不同条尽量不重样。
// 返回一段 HTML：底下是 SVG 图案，上面压着标题。

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hashOf = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// 配色：bg 两个渐变色，a/b/c 是图案颜色，ink 是标题颜色。dark 的用白字
const PALETTES = [
  { bg: ['#1e1b4b', '#312e81'], a: '#818cf8', b: '#c4b5fd', c: '#f0abfc', ink: '#fff', dark: 1 },
  { bg: ['#0f172a', '#1e293b'], a: '#38bdf8', b: '#34d399', c: '#fbbf24', ink: '#fff', dark: 1 },
  { bg: ['#052e2b', '#064e3b'], a: '#34d399', b: '#a7f3d0', c: '#fde68a', ink: '#fff', dark: 1 },
  { bg: ['#3b0764', '#581c87'], a: '#e879f9', b: '#f9a8d4', c: '#93c5fd', ink: '#fff', dark: 1 },
  { bg: ['#431407', '#7c2d12'], a: '#fb923c', b: '#fdba74', c: '#fde047', ink: '#fff', dark: 1 },
  { bg: ['#111827', '#0b0f19'], a: '#f472b6', b: '#60a5fa', c: '#a3e635', ink: '#fff', dark: 1 },
  { bg: ['#082f49', '#0c4a6e'], a: '#7dd3fc', b: '#f0f9ff', c: '#fcd34d', ink: '#fff', dark: 1 },
  { bg: ['#eef2ff', '#e0e7ff'], a: '#4f46e5', b: '#818cf8', c: '#f59e0b', ink: '#1e1b4b' },
  { bg: ['#ecfdf5', '#d1fae5'], a: '#059669', b: '#34d399', c: '#0ea5e9', ink: '#064e3b' },
  { bg: ['#fff7ed', '#ffedd5'], a: '#ea580c', b: '#fb923c', c: '#7c3aed', ink: '#431407' },
  { bg: ['#fdf2f8', '#fce7f3'], a: '#db2777', b: '#f472b6', c: '#6366f1', ink: '#500724' },
  { bg: ['#f0f9ff', '#e0f2fe'], a: '#0284c7', b: '#38bdf8', c: '#e11d48', ink: '#0c4a6e' },
  { bg: ['#fefce8', '#fef9c3'], a: '#ca8a04', b: '#65a30d', c: '#dc2626', ink: '#422006' },
  { bg: ['#f5f5f4', '#e7e5e4'], a: '#292524', b: '#78716c', c: '#ef4444', ink: '#1c1917' },
];

// 主题：按标题和摘要里的词判断，排在前面的优先
const THEMES = [
  ['security', /secur|password|leak|breach|vulnerab|exploit|hack|privacy|malware|phish|CVE|attack|安全|漏洞|泄露|密码|隐私|攻击/i],
  ['money', /\$\s?\d|billion|million|trillion|revenue|valuation|IPO|S-1|funding|raise[sd]?|invest|acqui|deal|price|pricing|earnings|stock|融资|估值|营收|收入|上市|收购|投资|亿|美元|价格|收费|财报/i],
  ['chip', /GPU|chip|semiconductor|NVIDIA|TPU|CUDA|hardware|datacenter|data center|compute|silicon|wafer|fab\b|CPU|芯片|算力|显卡|半导体|数据中心|服务器/i],
  ['robot', /robot|humanoid|embodied|drone|autonomous|self-driving|Waymo|Tesla|机器人|具身|人形|自动驾驶|无人机/i],
  ['code', /code|coding|developer|programm|IDE|Copilot|Cursor|Codex|Claude Code|compiler|debug|API|SDK|terminal|CLI|编程|代码|开发者|程序员/i],
  ['agent', /agent|agentic|MCP|tool use|workflow|automat|assistant|智能体|自动化|工作流|助手/i],
  ['opensource', /open[- ]source|open weights|GitHub|repo|release|v\d+\.\d|Hugging ?Face|开源|仓库|发布/i],
  ['image', /image|video|photo|vision|diffusion|Sora|Midjourney|Veo|render|generat\w* (art|image|video)|3D|图像|视频|生图|画|渲染|多模态/i],
  ['voice', /voice|audio|speech|music|podcast|TTS|sound|语音|音频|音乐|播客/i],
  ['research', /research|paper|arXiv|benchmark|study|scien|eval|dataset|math|论文|研究|评测|基准|数据集|科学/i],
  ['search', /search|browser|web|Google|Perplexity|crawl|index|搜索|浏览器|网页/i],
  ['people', /layoff|hire|hiring|CEO|founder|team|group|leav|join|resign|fire[sd]?|employee|talent|裁员|招聘|离职|加入|团队|创始人|员工/i],
  ['policy', /law|policy|regulat|government|court|lawsuit|copyright|EU|Congress|SEC|ban|政策|监管|法院|诉讼|版权|政府|法案/i],
  ['mobile', /iPhone|Android|mobile|app\b|apps\b|phone|iOS|watch|glasses|wearable|手机|应用|App|眼镜|穿戴/i],
  ['chat', /chat|ChatGPT|Gemini|Claude|conversation|prompt|LLM|GPT|model|Llama|Qwen|DeepSeek|Kimi|对话|聊天|大模型|模型/i],
];
export const themeOf = s => (THEMES.find(([, re]) => re.test(s)) || ['abstract'])[0];

const W = 320, H = 180;
const r2 = x => Math.round(x * 10) / 10;

// 每个主题的图案。R 是随机数，P 是配色，都画在右侧和上半部，给左下的标题留地方
const ART = {
  code(R, P) {
    const x = 150 + R() * 30, y = 18 + R() * 10, w = 150, h = 108;
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${P.dark ? '#00000055' : '#ffffffcc'}" stroke="${P.a}" stroke-opacity=".5"/>`;
    s += [0, 1, 2].map(i => `<circle cx="${x + 12 + i * 10}" cy="${y + 10}" r="3" fill="${[P.c, P.b, P.a][i]}"/>`).join('');
    for (let i = 0, yy = y + 26; i < 7; i++, yy += 11) {
      const ind = (R() < .5 ? 0 : R() < .5 ? 12 : 24), l1 = 14 + R() * 40, l2 = 10 + R() * 50;
      s += `<rect x="${x + 12 + ind}" y="${yy}" width="${r2(l1)}" height="5" rx="2.5" fill="${P.a}" opacity=".9"/><rect x="${r2(x + 16 + ind + l1)}" y="${yy}" width="${r2(Math.min(l2, w - 40 - ind - l1))}" height="5" rx="2.5" fill="${i % 3 ? P.b : P.c}" opacity=".7"/>`;
    }
    return s + `<rect x="${x + 12}" y="${y + 26 + 7 * 11}" width="7" height="9" fill="${P.c}"><animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite"/></rect>`;
  },
  chat(R, P) {
    let s = '';
    const n = 3 + (R() * 2 | 0);
    for (let i = 0, y = 14; i < n; i++) {
      const me = i % 2 === 1, w = 70 + R() * 70, h = 22 + R() * 10, x = me ? W - 16 - w : 150 + R() * 20;
      s += `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="11" fill="${me ? P.a : (P.dark ? '#ffffff22' : '#ffffffdd')}" stroke="${P.a}" stroke-opacity="${me ? 0 : .35}"/>`;
      s += `<rect x="${r2(x + 10)}" y="${r2(y + h / 2 - 2.5)}" width="${r2(w * (.4 + R() * .4))}" height="5" rx="2.5" fill="${me ? '#ffffffcc' : P.b}"/>`;
      y += h + 8; if (y > 150) break;
    }
    return s;
  },
  agent(R, P) {
    const cx = 230 + R() * 20, cy = 70 + R() * 10;
    let s = `<circle cx="${cx}" cy="${cy}" r="58" fill="none" stroke="${P.b}" stroke-opacity=".35" stroke-dasharray="3 5"/><circle cx="${cx}" cy="${cy}" r="34" fill="none" stroke="${P.a}" stroke-opacity=".4"/>`;
    const k = 5 + (R() * 3 | 0);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + R() * .3, rr = i % 2 ? 58 : 34, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      s += `<line x1="${cx}" y1="${cy}" x2="${r2(x)}" y2="${r2(y)}" stroke="${P.a}" stroke-opacity=".5"/><rect x="${r2(x - 8)}" y="${r2(y - 8)}" width="16" height="16" rx="4" fill="${[P.a, P.b, P.c][i % 3]}"/>`;
    }
    return s + `<circle cx="${cx}" cy="${cy}" r="15" fill="${P.c}"/><circle cx="${cx - 5}" cy="${cy - 2}" r="2.5" fill="${P.bg[0]}"/><circle cx="${cx + 5}" cy="${cy - 2}" r="2.5" fill="${P.bg[0]}"/>`;
  },
  money(R, P) {
    let s = '', pts = [];
    const n = 7, bw = 16, x0 = 150;
    let v = 20 + R() * 20;
    for (let i = 0; i < n; i++) {
      v = Math.max(14, Math.min(120, v + (R() - .25) * 26)); const x = x0 + i * 22, y = 140 - v;
      s += `<rect x="${x}" y="${r2(y)}" width="${bw}" height="${r2(v)}" rx="3" fill="${i === n - 1 ? P.c : P.a}" opacity="${.45 + i * .08}"/>`;
      pts.push(`${x + bw / 2},${r2(y - 8)}`);
    }
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${P.b}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    const cx = 288 + (R() * 12 | 0);
    return s + `<circle cx="${cx}" cy="28" r="15" fill="${P.c}"/><text x="${cx}" y="34" font-size="17" font-weight="700" text-anchor="middle" fill="${P.bg[0]}">$</text>`;
  },
  chip(R, P) {
    const x = 180 + R() * 30, y = 22 + R() * 10, sz = 78;
    let s = '';
    for (let i = 0; i < 8; i++) {
      const t = 12 + i * 8;
      s += `<line x1="${x + t}" y1="${y - 10}" x2="${x + t}" y2="${y}" stroke="${P.b}" stroke-width="2"/><line x1="${x + t}" y1="${y + sz}" x2="${x + t}" y2="${y + sz + 10}" stroke="${P.b}" stroke-width="2"/>`;
      s += `<line x1="${x - 10}" y1="${y + t}" x2="${x}" y2="${y + t}" stroke="${P.b}" stroke-width="2"/><line x1="${x + sz}" y1="${y + t}" x2="${x + sz + 10}" y2="${y + t}" stroke="${P.b}" stroke-width="2"/>`;
    }
    for (let i = 0; i < 6; i++) {
      const yy = y + 10 + R() * (sz - 20), side = R() < .5;
      s += `<polyline points="${side ? x - 10 : x + sz + 10},${r2(yy)} ${side ? x - 30 - R() * 40 : x + sz + 30},${r2(yy)} ${side ? x - 40 - R() * 40 : x + sz + 40},${r2(yy + (R() - .5) * 30)}" fill="none" stroke="${P.a}" stroke-opacity=".5"/>`;
    }
    return s + `<rect x="${x}" y="${y}" width="${sz}" height="${sz}" rx="8" fill="${P.a}"/><rect x="${x + 16}" y="${y + 16}" width="${sz - 32}" height="${sz - 32}" rx="4" fill="${P.bg[0]}" opacity=".8"/><rect x="${x + 28}" y="${y + 28}" width="${sz - 56}" height="${sz - 56}" rx="2" fill="${P.c}"/>`;
  },
  security(R, P) {
    const cx = 240 + R() * 20, cy = 70;
    let s = '';
    for (let i = 0; i < 40; i++) s += `<text x="${r2(140 + R() * 180)}" y="${r2(10 + R() * 120)}" font-size="9" font-family="monospace" fill="${P.b}" opacity="${r2(.15 + R() * .35)}">${'*#01$%'[R() * 6 | 0].repeat(1 + (R() * 4 | 0))}</text>`;
    s += `<path d="M${cx} ${cy - 52} L${cx + 42} ${cy - 36} L${cx + 42} ${cy + 2} Q${cx + 42} ${cy + 36} ${cx} ${cy + 54} Q${cx - 42} ${cy + 36} ${cx - 42} ${cy + 2} L${cx - 42} ${cy - 36} Z" fill="${P.a}"/>`;
    return s + `<rect x="${cx - 15}" y="${cy - 4}" width="30" height="26" rx="4" fill="${P.bg[0]}"/><path d="M${cx - 9} ${cy - 4} v-8 a9 9 0 0 1 18 0 v8" fill="none" stroke="${P.bg[0]}" stroke-width="4"/><circle cx="${cx}" cy="${cy + 8}" r="3.5" fill="${P.c}"/>`;
  },
  opensource(R, P) {
    let s = '';
    const lanes = [170, 210, 250, 290].slice(0, 3 + (R() * 2 | 0));
    lanes.forEach((x, i) => { s += `<line x1="${x}" y1="${10 + i * 14}" x2="${x}" y2="${150 - i * 8}" stroke="${[P.a, P.b, P.c, P.a][i]}" stroke-width="3" stroke-linecap="round"/>`; });
    for (let i = 1; i < lanes.length; i++) { const y = 30 + R() * 80; s += `<path d="M${lanes[0]} ${r2(y)} C${lanes[0]} ${r2(y + 20)}, ${lanes[i]} ${r2(y)}, ${lanes[i]} ${r2(y + 24)}" fill="none" stroke="${[P.a, P.b, P.c, P.a][i]}" stroke-width="3"/>`; }
    for (let i = 0; i < 12; i++) { const k = R() * lanes.length | 0, y = 20 + R() * 120; s += `<circle cx="${lanes[k]}" cy="${r2(y)}" r="6" fill="${P.bg[0]}" stroke="${[P.a, P.b, P.c, P.a][k]}" stroke-width="3"/>`; }
    return s;
  },
  image(R, P) {
    let s = '';
    for (let i = 0; i < 3; i++) {
      const x = 160 + i * 34 + R() * 8, y = 18 + i * 12, rot = (R() - .5) * 16;
      s += `<g transform="rotate(${r2(rot)} ${x + 50} ${y + 40})"><rect x="${r2(x)}" y="${y}" width="100" height="78" rx="6" fill="${P.dark ? '#ffffff18' : '#fff'}" stroke="${[P.a, P.b, P.c][i]}" stroke-width="2"/><circle cx="${r2(x + 28)}" cy="${y + 24}" r="9" fill="${P.c}"/><path d="M${r2(x + 6)} ${y + 70} L${r2(x + 38)} ${y + 40} L${r2(x + 60)} ${y + 58} L${r2(x + 76)} ${y + 46} L${r2(x + 94)} ${y + 70} Z" fill="${[P.a, P.b, P.a][i]}"/></g>`;
    }
    return s + `<path d="M296 18 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" fill="${P.c}"/>`;
  },
  voice(R, P) {
    let s = ''; const n = 26;
    for (let i = 0; i < n; i++) { const h = 8 + Math.abs(Math.sin(i * .5 + R() * 2)) * 70 * (.4 + R() * .6), x = 150 + i * 6.5; s += `<rect x="${r2(x)}" y="${r2(70 - h / 2)}" width="4" height="${r2(h)}" rx="2" fill="${i % 5 === 0 ? P.c : P.a}" opacity="${r2(.5 + R() * .5)}"/>`; }
    return s;
  },
  research(R, P) {
    let s = '';
    for (let i = 2; i >= 0; i--) {
      const x = 170 + i * 14, y = 14 + i * 8;
      s += `<rect x="${x}" y="${y}" width="96" height="120" rx="5" fill="${P.dark ? '#ffffff' + ['22', '18', '12'][i] : '#fff'}" stroke="${P.a}" stroke-opacity=".5"/>`;
      if (!i) { for (let k = 0; k < 4; k++) s += `<rect x="${x + 10}" y="${y + 12 + k * 9}" width="${r2(40 + R() * 36)}" height="4" rx="2" fill="${P.b}" opacity=".7"/>`; const pts = Array.from({ length: 6 }, (_, k) => `${x + 12 + k * 14},${r2(y + 100 - k * 6 - R() * 20)}`); s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${P.c}" stroke-width="2.5"/>`; }
    }
    return s;
  },
  search(R, P) {
    const x = 150 + R() * 20, y = 20;
    let s = `<rect x="${x}" y="${y}" width="160" height="100" rx="8" fill="${P.dark ? '#ffffff14' : '#ffffffcc'}" stroke="${P.a}" stroke-opacity=".5"/><rect x="${x + 16}" y="${y + 18}" width="128" height="18" rx="9" fill="none" stroke="${P.a}" stroke-width="2"/>`;
    for (let i = 0; i < 4; i++) s += `<rect x="${x + 16}" y="${y + 48 + i * 12}" width="${r2(50 + R() * 70)}" height="5" rx="2.5" fill="${i ? P.b : P.a}" opacity=".7"/>`;
    return s + `<circle cx="${x + 140}" cy="${y + 92}" r="20" fill="none" stroke="${P.c}" stroke-width="6"/><line x1="${x + 154}" y1="${y + 106}" x2="${x + 170}" y2="${y + 122}" stroke="${P.c}" stroke-width="7" stroke-linecap="round"/>`;
  },
  people(R, P) {
    let s = ''; const hl = R() * 15 | 0;
    for (let i = 0; i < 15; i++) {
      const x = 170 + (i % 5) * 30, y = 22 + (i / 5 | 0) * 38, c = i === hl ? P.c : P.a, o = i === hl ? 1 : .35 + R() * .4;
      s += `<g opacity="${r2(o)}"><circle cx="${x}" cy="${y}" r="7" fill="${c}"/><path d="M${x - 11} ${y + 20} a11 10 0 0 1 22 0 Z" fill="${c}"/></g>`;
    }
    return s;
  },
  policy(R, P) {
    const x = 180 + R() * 20, y = 30;
    let s = `<path d="M${x - 8} ${y + 18} L${x + 60} ${y - 12} L${x + 128} ${y + 18} Z" fill="${P.a}"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="${x + 4 + i * 26}" y="${y + 26}" width="12" height="70" rx="2" fill="${i % 2 ? P.b : P.a}" opacity=".85"/>`;
    return s + `<rect x="${x - 8}" y="${y + 100}" width="136" height="10" rx="2" fill="${P.a}"/><circle cx="${x + 60}" cy="${y + 6}" r="5" fill="${P.c}"/>`;
  },
  mobile(R, P) {
    let s = '';
    for (let i = 0; i < 2; i++) {
      const x = 190 + i * 62 + R() * 6, y = 12 + i * 18;
      s += `<rect x="${r2(x)}" y="${y}" width="54" height="104" rx="10" fill="${P.dark ? '#ffffff18' : '#fff'}" stroke="${[P.a, P.b][i]}" stroke-width="2.5"/>`;
      for (let k = 0; k < 6; k++) s += `<rect x="${r2(x + 8 + (k % 3) * 14)}" y="${y + 16 + (k / 3 | 0) * 14}" width="10" height="10" rx="3" fill="${[P.a, P.b, P.c][(k + i) % 3]}"/>`;
    }
    return s;
  },
  robot(R, P) {
    const x = 220 + R() * 20, y = 20;
    return `<rect x="${x - 30}" y="${y + 10}" width="60" height="48" rx="12" fill="${P.a}"/><circle cx="${x - 12}" cy="${y + 32}" r="7" fill="${P.bg[0]}"/><circle cx="${x + 12}" cy="${y + 32}" r="7" fill="${P.bg[0]}"/><circle cx="${x - 12}" cy="${y + 32}" r="3" fill="${P.c}"/><circle cx="${x + 12}" cy="${y + 32}" r="3" fill="${P.c}"/><line x1="${x}" y1="${y + 10}" x2="${x}" y2="${y - 4}" stroke="${P.b}" stroke-width="3"/><circle cx="${x}" cy="${y - 6}" r="4" fill="${P.c}"/><rect x="${x - 36}" y="${y + 64}" width="72" height="56" rx="10" fill="${P.b}" opacity=".85"/><path d="M${x + 36} ${y + 76} l30 ${r2(-10 - R() * 20)} l14 18" fill="none" stroke="${P.a}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x - 36} ${y + 76} l-26 22" fill="none" stroke="${P.a}" stroke-width="7" stroke-linecap="round"/>`;
  },
  abstract(R, P) {
    const v = R() * 4 | 0;
    if (v === 0) { let s = ''; for (let i = 0; i < 6; i++) s += `<circle cx="${250 + R() * 20}" cy="${60 + R() * 10}" r="${18 + i * 16}" fill="none" stroke="${[P.a, P.b, P.c][i % 3]}" stroke-width="${r2(1 + R() * 3)}" opacity="${r2(.3 + R() * .5)}"/>`; return s; }
    if (v === 1) { let s = ''; for (let y = 10; y < 140; y += 14) for (let x = 150; x < 320; x += 14) { const d = R(); if (d < .5) s += `<circle cx="${x}" cy="${y}" r="${r2(1 + d * 4)}" fill="${d < .1 ? P.c : P.a}" opacity="${r2(.3 + d)}"/>`; } return s; }
    if (v === 2) { let s = ''; for (let i = 0; i < 5; i++) { const y = 20 + i * 24; s += `<path d="M140 ${y} C190 ${r2(y - 30 * R())}, 240 ${r2(y + 40 * R())}, 330 ${r2(y - 10)}" fill="none" stroke="${[P.a, P.b, P.c][i % 3]}" stroke-width="${r2(2 + R() * 4)}" opacity=".7" stroke-linecap="round"/>`; } return s; }
    let s = ''; for (let i = 0; i < 9; i++) { const x = 160 + R() * 140, y = 10 + R() * 110, sz = 14 + R() * 34; s += `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(sz)}" height="${r2(sz)}" rx="${r2(sz * .25)}" fill="${[P.a, P.b, P.c][i % 3]}" opacity="${r2(.35 + R() * .5)}" transform="rotate(${r2(R() * 40 - 20)} ${r2(x + sz / 2)} ${r2(y + sz / 2)})"/>`; } return s;
  },
};
// 大模型类的标题很多，再给它两种画法轮换
ART.model = (R, P) => {
  let s = ''; const layers = [3, 5, 5, 3], xs = [170, 210, 250, 290], pts = [];
  layers.forEach((n, li) => { pts.push(Array.from({ length: n }, (_, k) => [xs[li], 70 + (k - (n - 1) / 2) * 24 + (R() - .5) * 4])); });
  for (let li = 0; li < 3; li++) for (const a of pts[li]) for (const b of pts[li + 1]) if (R() < .7) s += `<line x1="${a[0]}" y1="${r2(a[1])}" x2="${b[0]}" y2="${r2(b[1])}" stroke="${P.b}" stroke-opacity="${r2(.2 + R() * .4)}"/>`;
  pts.flat().forEach(([x, y], i) => { s += `<circle cx="${x}" cy="${r2(y)}" r="7" fill="${R() < .2 ? P.c : P.a}"/>`; });
  return s;
};

const SOURCE_TINT = { A: 0, B: 1, C: 2, D: 3 };
export function cover(it) {
  const key = it.id || it.url || it.title, h = hashOf(key), R = rng(h);
  const text = `${it.title || ''} ${it.summary || ''}`;
  let theme = themeOf(text);
  if (theme === 'chat' && h % 3 === 0) theme = 'model';
  const P = PALETTES[(h + (SOURCE_TINT[it.tier] || 0) * 3) % PALETTES.length];
  const gid = 'g' + h.toString(36);
  const art = (ART[theme] || ART.abstract)(R, P);
  // 背景再撒一层淡淡的网格或点，让每张底子也有变化
  const tex = h % 3 === 0 ? `<pattern id="p${gid}" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="${P.dark ? '#ffffff' : '#000000'}" stroke-opacity=".05"/></pattern><rect width="${W}" height="${H}" fill="url(#p${gid})"/>`
    : h % 3 === 1 ? `<pattern id="p${gid}" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${P.dark ? '#ffffff' : '#000000'}" fill-opacity=".07"/></pattern><rect width="${W}" height="${H}" fill="url(#p${gid})"/>` : '';
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.bg[0]}"/><stop offset="1" stop-color="${P.bg[1]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${gid})"/>${tex.replace('<pattern', '<defs><pattern').replace('</pattern>', '</pattern></defs>')}${art}</svg>`;
  const src = String(it.sourceName || '').replace(/^X @/, '@');
  return `<span class="gcov${P.dark ? ' dark' : ''}" style="--gink:${P.ink};--gbg:${P.bg[0]}" data-theme="${theme}">${svg}<span class="gcov-src">${esc(src)}</span><span class="gcov-t">${esc(it.title || '')}</span></span>`;
}
