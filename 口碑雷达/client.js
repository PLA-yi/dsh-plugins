/*
 * 口碑雷达 · 页面（浏览器端）        从 DSH 插件底座 0.5（2026-11-11）复制
 *
 * 三页：「今天」（今天有没有人骂你、骂了什么、在哪）、「全部评论」（筛选、改判错的）、「设置」（盯谁、平台登录、自动检查、付费接口）。
 * 页面只管显示，真正去搜、去判断的都在后台 index.js 和 host/ 里。
 *
 * 这个文件不用打包，DSH 直接执行它；改完保存，页面会自动换成新的（会回到对话首页，再点一下左侧入口）。
 * 写界面只用一个函数 h(组件或标签, 属性, 内容…)，例如 h(Btn, { kind: 'primary', onClick: save }, '保存')。
 *
 * 文件分五段，从上往下：
 *   0. 名字      —— 复制底座后先改这里
 *   1. 外观      —— 颜色、圆角、阴影、字体。想换样子先改这里，一处改完整套都变
 *   2. 底座      —— 现成的组件。想改某个组件的样子或加一个新组件，改这里
 *   3. 你的页面  —— 从这里写自己的内容
 *   4. 挂载      —— 把页面接进 DSH，一般不用改
 *
 * 这个文件就是给你改的：外观、组件、页面都可以动，做成自己的样子。只有三条不能破（破了页面会坏或者和别的插件打架）：
 *   - 色值只写在第 1 段「外观」里，写了浅色的值就要在「深色」那一块也写一个；别的地方用 var(--前缀-名字)。
 *   - 样式类名都通过 cls('名字') 加前缀，不直接写 className: 'btn'。
 *   - 不 require DSH 自己的组件库，不往 document.body 里塞东西，不用 iframe。
 *
 * 两个容易踩的坑：
 *   - 页面里不要把变量叫 cls、h、api 这些底座已经用了的名字（比如 .map(cls => …)），不然整页白屏。
 *   - 自己画 SVG 时，颜色变量要写进 style：h('rect', { style: { fill: chart(1) } })；写成 fill: 'var(…)' 属性不生效。
 */
window.__ModuleLoader__.load({
  id: '@local/reputation-radar',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useSyncExternalStore } = React

    // ================================================================== 0. 名字（复制底座后改这里）

    const ID = 'reputation-radar'        // 和 cordis.patch.yml 里的 id 一样
    const P = 'rr'                       // 样式前缀：两三个小写字母，每个插件用不一样的
    const ROUTE = 'reputationRadar/call' // 和 index.js 里的 ROUTE 对上（那边多一个开头的 /api/）
    const TEXT = {
      zh: { panel: '口碑雷达' },
      en: { panel: 'Reputation radar' },
    }

    // ================================================================== 1. 外观（想换样子，先改这里）
    //
    // 整个插件的颜色、圆角、阴影、字体都从这一段取。默认值跟着 DSH 走：浅色深色自动变，看起来和 DSH 自己的界面一样。
    // 想做成自己的样子：把某一行的 var(--dsw-…) 换成自己的值（比如 --$-brand:#1F4FD8），
    // 然后在下面「深色」那一块给同一个名字写一个深色时用的值。只改圆角、字体不用管深色。
    // 写法里的 $- 会被换成第 0 段的前缀。别的地方要用颜色，写 var(--$-brand) 这样的名字，不要再写色值。
    const THEME = `
.$-root{
  /* 主色：主按钮、开关打开、选中的勾 */
  --$-brand:var(--dsw-alias-button-primary-fill);
  --$-brand-hover:var(--dsw-alias-button-primary-hover);
  --$-on-brand:var(--dsw-alias-label-primary-foreground);   /* 主色上面的字 */
  /* 强调色：输入框聚焦的边、「进行中」的标签、焦点框 */
  --$-accent:var(--dsw-alias-state-business-primary);
  /* 底色 */
  --$-bg:var(--dsw-alias-bg-base);                  /* 页面 */
  --$-card:var(--dsw-alias-settings-card-fill);     /* 卡片 */
  --$-raised:var(--dsw-alias-bg-layer-2);           /* 弹窗、抽屉、菜单 */
  --$-field:var(--dsw-alias-bg-layer-1);            /* 输入框 */
  --$-soft:var(--dsw-alias-interactive-bg-hover);   /* 浅浅的一层：鼠标停上去、选中的导航、灰色标签 */
  --$-mask:var(--dsw-alias-bg-mask-1);              /* 弹窗后面的遮罩 */
  /* 字 */
  --$-text:var(--dsw-alias-label-primary);          /* 正文 */
  --$-text-2:var(--dsw-alias-label-secondary);      /* 说明 */
  --$-text-3:var(--dsw-alias-label-tertiary);       /* 更淡的小字 */
  /* 线 */
  --$-line:var(--dsw-alias-border-l1);              /* 分隔线 */
  --$-line-2:var(--dsw-alias-border-l3);            /* 按钮、输入框的边 */
  --$-card-line:var(--dsw-alias-settings-card-stroke);
  /* 状态 */
  --$-success:var(--dsw-alias-state-success-primary);
  --$-warn:var(--dsw-alias-state-warn-primary);
  --$-danger:var(--dsw-alias-state-error-primary);
  /* 圆角：想方一点就都改小，想圆一点就都改大 */
  --$-r-xs:var(--dsw-radius-xs);   /* 4  */
  --$-r-sm:var(--dsw-radius-sm);   /* 8  小按钮、菜单里的一行 */
  --$-r-md:var(--dsw-radius-md);   /* 12 按钮、输入框 */
  --$-r-lg:var(--dsw-radius-lg);   /* 16 数字卡、缩略图 */
  --$-r-xl:var(--dsw-radius-xl);   /* 20 卡片 */
  --$-r-panel:var(--dsw-radius-panel); /* 28 弹窗、抽屉 */
  /* 阴影：从轻到重 */
  --$-shadow-1:var(--dsw-elevation-soft,0 0 0 .5px var(--dsw-alias-border-l3));
  --$-shadow-2:var(--dsw-elevation-panel);
  --$-shadow-3:var(--dsw-elevation-prominent);
  /* 字体：inherit 就是和 DSH 一样。标题想换一种字体改第二行，比如 "Songti SC",serif */
  --$-font:inherit;
  --$-font-title:inherit;
  /* 小提示条、看图的舞台 */
  --$-toast-bg:var(--dsw-alias-toast-bg,var(--dsw-alias-tooltip-bg));
  --$-toast-text:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary-foreground));
  --$-stage-bg:var(--dsw-alias-bg-mask-photo,var(--dsw-alias-interactive-bg-hover));
  --$-stage-text:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary));
  /* 图表配色 chart(1) 到 chart(9)：1 2 3 4 5 6 各一种颜色，7 8 9 是前三种淡一档 */
  --$-chart-1:var(--$-accent);
  --$-chart-2:var(--$-success);
  --$-chart-3:var(--$-warn);
  --$-chart-4:var(--dsw-alias-state-done-primary);
  --$-chart-5:var(--$-danger);
  --$-chart-6:var(--$-text-3);
  --$-chart-7:color-mix(in srgb,var(--$-chart-1) 45%,var(--$-bg));
  --$-chart-8:color-mix(in srgb,var(--$-chart-2) 45%,var(--$-bg));
  --$-chart-9:color-mix(in srgb,var(--$-chart-3) 45%,var(--$-bg));
  /* 口碑雷达自己的颜色。情绪：骂 / 中性 / 夸 / 没判断 */
  --$-neg:var(--$-danger);
  --$-neu:color-mix(in srgb,var(--$-text-3) 55%,var(--$-bg));
  --$-pos:var(--$-success);
  --$-unk:var(--$-warn);
  /* 严重程度：1 轻微吐槽、2 明确不满、3 严重，越严重越红 */
  --$-sev-1:color-mix(in srgb,var(--$-danger) 36%,var(--$-bg));
  --$-sev-2:color-mix(in srgb,var(--$-danger) 66%,var(--$-bg));
  --$-sev-3:var(--$-danger);
  --$-on-strong:#FFFFFF;                 /* 深红块、平台小方块上的字 */
  /* 各平台的识别色：只用在平台小方块上，图表里不用（免得和「骂」的红色混在一起） */
  --$-p-weibo:#E6162D;
  --$-p-bilibili:#FB7299;
  --$-p-zhihu:#1772F6;
  --$-p-xhs:#FF2442;
  --$-p-douyin:#16151C;
  --$-p-wechat:#07C160;
  --$-p-news:#6A5AD8;
}
/* 深色：上面哪一行写了自己的色值，就在这里给它写一个深色时用的值。没改颜色就留空。 */
body[data-ds-dark-theme] .$-root{
  --$-on-strong:#FFFFFF;
  --$-p-weibo:#F0384D;
  --$-p-bilibili:#F2789E;
  --$-p-zhihu:#3B8AF7;
  --$-p-xhs:#F43D58;
  --$-p-douyin:#4A4857;
  --$-p-wechat:#13B868;
  --$-p-news:#8678E6;
}
`

    // ================================================================== 2. 底座（现成的组件和它们的样式；想改某个组件长什么样，就改这里对应的那几行）

    /** 给类名加上前缀：cls('btn', 是否主按钮 && 'btn-primary') → 'mp-btn mp-btn-primary'。 */
    const cls = (...names) => names.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(n => `${P}-${n}`).join(' ')
    /**
     * 图表配色：chart(1) 到 chart(9)，画图表、分层、占比时从这里取颜色，浅色深色都能区分。
     * 1 蓝 2 绿 3 橙 4 紫 5 红 6 灰，7 8 9 是蓝绿橙淡一档的颜色。用法：style: { background: chart(2) }
     */
    const chart = n => `var(--${P}-chart-${((Number(n) || 1) - 1) % 9 + 1})`

    // ---- 组件的样式：颜色、圆角都取自上面「外观」段的变量。写法里的 $- 会被换成第 0 段的前缀。
    const STYLES = `
.$-root{container:$-shell/inline-size;position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;color:var(--$-text);background:var(--$-bg);font-family:var(--$-font);font-size:14px;line-height:22px}
.$-root *,.$-embed *{box-sizing:border-box}
.$-root button,.$-embed button{font:inherit}
.$-embed{color:var(--$-text);font-family:var(--$-font);font-size:14px;line-height:22px}
.$-h1,.$-h2,.$-nav-title,.$-bar-title,.$-modal-title,.$-empty-title,.$-stat b{font-family:var(--$-font-title)}
.$-root :focus-visible,.$-embed :focus-visible{outline:2px solid var(--$-accent);outline-offset:2px}
.$-root .$-modal:focus-visible,.$-root .$-drawer:focus-visible,.$-root .$-menu-panel:focus-visible{outline:none}
.$-shell{flex:1;display:flex;min-width:0;min-height:0}
.$-nav{flex:none;display:flex;flex-direction:column;gap:12px;width:208px;padding:calc(20px + var(--dsh-frame-top-clearance,0px)) 12px 16px;border-right:.5px solid var(--$-line);overflow-y:auto}
.$-nav-title{padding:0 8px;font-size:16px;line-height:24px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-nav-list{display:flex;flex-direction:column;gap:2px}
.$-nav-item{position:relative;display:flex;align-items:center;gap:10px;width:100%;height:34px;padding:0 10px;border:0;border-radius:var(--$-r-md);background:none;color:var(--$-text-2);font-size:14px;text-align:left;white-space:nowrap;cursor:pointer}
.$-nav-item[aria-current=page]{background:var(--$-soft);color:var(--$-text);font-weight:500}
.$-nav-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.$-nav-badge{flex:none;min-width:18px;padding:0 6px;border-radius:999px;corner-shape:round;background:var(--$-soft);color:var(--$-text-2);font-size:12px;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}
.$-nav-badge-danger{background:color-mix(in srgb,var(--$-danger) 12%,transparent);color:var(--$-danger)}
.$-nav-head,.$-nav-foot{flex:none;display:flex;flex-direction:column;gap:8px;min-width:0}
.$-nav-foot{margin-top:auto}
.$-nav-head p,.$-nav-foot p{margin:0}
.$-nav-group{padding:10px 10px 2px;color:var(--$-text-3);font-size:12px;line-height:18px;white-space:nowrap}
.$-nav-group:first-child{padding-top:0}
.$-nav-item[data-locked=true]{color:var(--$-text-3)}
.$-nav-lock{flex:none;display:inline-flex;color:var(--$-text-3)}
.$-main{position:relative;flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.$-scroll{flex:1;min-height:0;overflow:auto}
.$-page{display:flex;flex-direction:column;gap:16px;max-width:1080px;margin:0 auto;padding:calc(24px + var(--dsh-frame-top-clearance,0px)) clamp(20px,3.5vw,40px) 48px}
.$-page-wide{max-width:none}
.$-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px 16px}
.$-head-text{flex:1 1 280px;min-width:0}
.$-crumb{margin:0 0 2px;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-h1{margin:0;font-size:22px;line-height:30px;font-weight:500}
.$-sub{margin:2px 0 0;color:var(--$-text-2);font-size:13px;line-height:20px}
.$-h2{margin:0;font-size:15px;line-height:22px;font-weight:500}
.$-muted{color:var(--$-text-2);font-size:13px;line-height:20px}
.$-faint{color:var(--$-text-3);font-size:12px;line-height:18px}
.$-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.$-stack{display:flex;flex-direction:column;gap:12px;min-width:0}
.$-grow{flex:1;min-width:0}
.$-grid{display:grid;gap:12px;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr))}
.$-grid.$-grid-auto{grid-template-columns:repeat(auto-fill,minmax(min(var(--min,160px),100%),1fr))}
.$-bar{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:calc(8px + var(--dsh-frame-top-clearance,0px)) 12px 8px 16px;border-bottom:.5px solid var(--$-line)}
.$-bar-title{display:flex;align-items:center;gap:8px;font-size:15px;line-height:22px;font-weight:500;white-space:nowrap}
.$-bar-body{flex:1;display:flex;align-items:center;gap:12px;min-width:0}
.$-bar-tools{display:flex;align-items:center;gap:8px;white-space:nowrap}
.$-bar~*{--dsh-frame-top-clearance:0px}
.$-split{flex:1;display:flex;min-height:0}
.$-split-side{flex:none;display:flex;flex-direction:column;width:35%;min-width:320px;max-width:560px;min-height:0;border-right:.5px solid var(--$-line)}
.$-split-head{flex:none;display:flex;align-items:center;gap:8px;height:44px;padding:0 8px 0 16px;border-bottom:.5px solid var(--$-line);font-size:13px;font-weight:500}
.$-split-body{position:relative;flex:1;display:flex;flex-direction:column;min-height:0}
.$-split-body>*{flex:1;min-height:0}
.$-split-main{flex:1;min-width:0;overflow:auto}
.$-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border:0;border-radius:var(--$-r-md);background:transparent;color:var(--$-text);font-size:14px;line-height:22px;text-decoration:none;white-space:nowrap;cursor:pointer}
.$-btn:disabled{cursor:not-allowed;opacity:.4}
.$-btn-sm{height:28px;padding:0 10px;border-radius:var(--$-r-sm);font-size:12px;line-height:18px}
.$-btn-lg{height:44px;padding:0 20px;font-size:15px}
.$-btn-block{display:flex;width:100%}
.$-btn-label{display:contents}
.$-btn-primary{background:var(--$-brand);color:var(--$-on-brand)}
.$-btn-default{box-shadow:inset 0 0 0 .5px var(--$-line-2)}
.$-btn-danger{box-shadow:inset 0 0 0 .5px var(--$-line-2);color:var(--$-danger)}
.$-btn-icon{width:36px;padding:0}.$-btn-icon.$-btn-sm{width:28px}
.$-btn svg{flex:none}
.$-btn .$-spin{border-color:currentColor;border-top-color:transparent;opacity:.7}
.$-input{display:flex;align-items:center;gap:6px;width:100%;min-height:32px;padding:0 10px;border:.5px solid var(--$-line-2);border-radius:var(--$-r-md);background:var(--$-field);color:var(--$-text);font:inherit;font-size:14px;line-height:22px;outline:none}
.$-input::placeholder{color:var(--$-text-3)}
.$-input:focus{border-color:var(--$-accent)}
.$-input:disabled{opacity:.5}
.$-input:read-only:not(select){border-color:var(--$-line);background:transparent}
textarea.$-input{padding:6px 10px;min-height:72px;resize:vertical}
select.$-input{cursor:pointer}
.$-search{display:flex;align-items:center;gap:8px;width:min(var(--w,420px),100%);height:32px;padding:0 2px 0 10px;border:.5px solid var(--$-line-2);border-radius:var(--$-r-md);background:var(--$-field);color:var(--$-text-3)}
.$-search:focus-within{border-color:var(--$-accent)}
.$-search input{flex:1;min-width:0;height:100%;padding:0;border:0;outline:none;background:none;color:var(--$-text);font:inherit;font-size:14px}
.$-search input::placeholder{color:var(--$-text-3)}
.$-search input:disabled{opacity:.5}
.$-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.$-field>.$-seg,.$-stack>.$-seg{align-self:flex-start}
.$-field>.$-seg-stretch,.$-stack>.$-seg-stretch{align-self:stretch}
.$-field-label{color:var(--$-text-2);font-size:13px;line-height:20px}
.$-field-hint{color:var(--$-text-3);font-size:12px;line-height:18px}
.$-field-error{color:var(--$-danger);font-size:12px;line-height:18px}
.$-check{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px;cursor:pointer;font-size:14px}
.$-check input{width:16px;height:16px;margin:0;accent-color:var(--$-brand);cursor:pointer}
.$-radios{display:flex;flex-direction:column;gap:8px}
.$-switch{position:relative;flex:none;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--$-line-2);cursor:pointer}
.$-switch[aria-checked=true]{background:var(--$-brand)}
.$-switch i{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--$-bg);transition:transform 120ms ease}
.$-switch[aria-checked=true] i{transform:translateX(16px);background:var(--$-on-brand)}
.$-tag{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;corner-shape:round;background:var(--$-soft);color:var(--$-text-2);font-size:11px;line-height:17px;font-weight:500;white-space:nowrap}
.$-tag-success{background:color-mix(in srgb,var(--$-success) 10%,transparent);color:var(--$-success)}
.$-tag-warn{background:color-mix(in srgb,var(--$-warn) 12%,transparent);color:var(--$-warn)}
.$-tag-danger{background:color-mix(in srgb,var(--$-danger) 10%,transparent);color:var(--$-danger)}
.$-tag-info{background:color-mix(in srgb,var(--$-accent) 10%,transparent);color:var(--$-accent)}
.$-tag-outline{background:none;box-shadow:inset 0 0 0 .5px var(--$-line-2);color:var(--$-text-3)}
.$-dot{display:inline-block;flex:none;width:8px;height:8px;border-radius:50%;corner-shape:round;box-shadow:inset 0 0 0 1.5px var(--$-line-2)}
.$-dot-success{background:var(--$-success);box-shadow:none}
.$-dot-warn{background:var(--$-warn);box-shadow:none}
.$-dot-danger{background:var(--$-danger);box-shadow:none}
.$-dot-muted{background:var(--$-text-3);box-shadow:none}
.$-card{display:flex;flex-direction:column;gap:12px;min-width:0;padding:16px;border-radius:var(--$-r-xl);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line)}
.$-card-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
.$-card-note{flex:1;min-width:0;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-card-sub{margin:-8px 0 0;color:var(--$-text-2);font-size:13px;line-height:20px}
.$-stat{display:flex;flex-direction:column;gap:2px;min-width:0;padding:14px 16px;border-radius:var(--$-r-lg);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line)}
.$-stat b{font-size:24px;line-height:32px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.$-seg{display:inline-flex;max-width:100%;gap:2px;padding:4px;border-radius:var(--$-r-md);background:var(--$-soft)}
.$-seg-stretch{display:flex;align-self:stretch}.$-seg-stretch button{flex:1}
.$-seg button{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 14px;border:0;border-radius:var(--$-r-sm);background:none;color:var(--$-text-2);font-size:13px;line-height:20px;font-weight:500;white-space:nowrap;cursor:pointer}
.$-seg button:disabled{opacity:.4;cursor:not-allowed}
.$-seg button[aria-pressed=true]{background:var(--$-bg);color:var(--$-text);box-shadow:var(--$-shadow-1)}
.$-seg button[aria-pressed=true][data-tone=success]{background:color-mix(in srgb,var(--$-success) 14%,var(--$-bg));color:var(--$-success)}
.$-seg button[aria-pressed=true][data-tone=warn]{background:color-mix(in srgb,var(--$-warn) 14%,var(--$-bg));color:var(--$-warn)}
.$-seg button[aria-pressed=true][data-tone=danger]{background:color-mix(in srgb,var(--$-danger) 12%,var(--$-bg));color:var(--$-danger)}
.$-tabs{display:flex;gap:20px;border-bottom:.5px solid var(--$-line)}
.$-tabs button{position:relative;height:38px;padding:0;border:0;background:none;color:var(--$-text-2);font-size:14px;white-space:nowrap;cursor:pointer}
.$-tabs button[aria-selected=true]{color:var(--$-text);font-weight:500}
.$-tabs button[aria-selected=true]::after{content:"";position:absolute;left:0;right:0;bottom:-.5px;height:2px;background:var(--$-text)}
.$-table-wrap{overflow-x:auto;margin:0 -4px}
.$-table{width:100%;border-collapse:collapse;font-size:13px;line-height:20px}
.$-table th{padding:8px 10px;border-bottom:.5px solid var(--$-line);color:var(--$-text-2);font-weight:500;text-align:left;white-space:nowrap}
.$-table td{padding:10px;border-bottom:.5px solid var(--$-line);vertical-align:top}
.$-table tr:last-child td{border-bottom:0}
.$-table .$-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.$-table tr.$-click{cursor:pointer}
.$-steps{display:flex;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none}
.$-step{display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;border:0;border-radius:var(--$-r-md);background:none;color:var(--$-text-2);font-size:13px;white-space:nowrap;cursor:pointer}
.$-step:disabled{cursor:not-allowed;opacity:.5}
.$-step i{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;corner-shape:round;box-shadow:inset 0 0 0 1px currentColor;font-style:normal;font-size:11px;line-height:1}
.$-step[data-state=todo]{color:var(--$-text-3)}
.$-step[data-state=done] i{box-shadow:none;background:color-mix(in srgb,var(--$-success) 14%,transparent);color:var(--$-success)}
.$-step[data-state=doing] i{box-shadow:none;background:var(--$-brand);color:var(--$-on-brand)}
.$-step[aria-current=step]{background:var(--$-soft);color:var(--$-text);font-weight:500}
.$-bars{display:flex;flex-direction:column;gap:8px}
.$-bars-row{display:grid;grid-template-columns:minmax(64px,120px) minmax(0,1fr) auto;align-items:center;gap:10px;font-size:13px;line-height:20px}
.$-bars-track{height:8px;border-radius:999px;corner-shape:round;background:var(--$-soft);overflow:hidden}
.$-bars-fill{display:block;height:100%;min-width:2px;border-radius:999px;corner-shape:round;background:var(--$-brand);opacity:.7}
.$-bars-fill[data-color]{opacity:1}
.$-swatch{display:inline-block;flex:none;width:12px;height:12px;border-radius:var(--$-r-xs)}
.$-bars-value{font-variant-numeric:tabular-nums;white-space:nowrap}
.$-alert{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-radius:var(--$-r-md);background:var(--$-soft);font-size:13px;line-height:20px}
.$-alert>svg{flex:none;margin-top:2px}
.$-alert-action{flex:none;display:flex;align-items:center;gap:8px;margin:-4px -4px -4px 0}
.$-alert-warn{background:color-mix(in srgb,var(--$-warn) 10%,transparent)}.$-alert-warn>svg{color:var(--$-warn)}
.$-alert-danger{background:color-mix(in srgb,var(--$-danger) 8%,transparent)}.$-alert-danger>svg{color:var(--$-danger)}
.$-alert-success{background:color-mix(in srgb,var(--$-success) 9%,transparent)}.$-alert-success>svg{color:var(--$-success)}
.$-empty{display:flex;flex-direction:column;align-items:center;gap:4px;padding:40px 16px;text-align:center}
.$-empty-title{margin:0;font-size:15px;line-height:22px;font-weight:500}
.$-empty-body{margin:0;max-width:420px;color:var(--$-text-2);font-size:13px;line-height:20px}
.$-empty-action{margin-top:12px}
.$-center{display:flex;align-items:center;justify-content:center;gap:8px;min-height:160px;color:var(--$-text-3);font-size:13px}
.$-spin{display:inline-block;flex:none;width:16px;height:16px;border:2px solid var(--$-line-2);border-top-color:var(--$-text-2);border-radius:50%;corner-shape:round;vertical-align:-3px;animation:$-spin .8s linear infinite}
.$-spin-sm{width:11px;height:11px;border-width:1.5px;vertical-align:-1px}
@keyframes $-spin{to{transform:rotate(360deg)}}
.$-kv{display:grid;grid-template-columns:84px minmax(0,1fr);gap:8px 12px;margin:0;font-size:13px;line-height:20px}
.$-kv dt{color:var(--$-text-2)}.$-kv dd{margin:0;overflow-wrap:anywhere}
.$-drop{display:flex;flex-direction:column;align-items:center;gap:4px;padding:22px;border:1px dashed var(--$-line-2);border-radius:var(--$-r-xl);color:var(--$-text-2);font-size:13px;line-height:20px;text-align:center;cursor:pointer}
.$-drop b{color:var(--$-text);font-size:14px;line-height:22px;font-weight:500}
.$-drop[data-drag=true]{border-color:var(--$-accent);background:var(--$-soft)}
.$-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--min,180px),1fr));gap:12px}
.$-thumb{display:flex;flex-direction:column;gap:6px;min-width:0;margin:0}
.$-thumb-img{position:relative;display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:var(--ratio,4/3);padding:0;border:0;border-radius:var(--$-r-lg);background:var(--$-soft);color:inherit;font:inherit;overflow:hidden}
.$-thumb-img img{width:100%;height:100%;object-fit:contain}
.$-thumb-click{cursor:pointer}
.$-thumb-badge{position:absolute;left:6px;top:6px;padding:1px 8px;border-radius:999px;corner-shape:round;background:var(--$-bg);font-size:11px;line-height:17px;font-weight:500}
.$-thumb-x{position:absolute;top:6px;right:6px;display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;corner-shape:round;background:var(--$-bg);color:var(--$-text-2);cursor:pointer}
.$-thumb-cap{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.$-thumb-name{max-width:100%;font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-stage{position:relative;flex:1;display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;height:min(64vh,640px);padding:12px;border-radius:var(--$-r-xl);background:var(--$-stage-bg);color:var(--$-stage-text)}
.$-stage-fig{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-width:0;height:100%;margin:0}
.$-stage-fig img,.$-stage-fig video{max-width:100%;max-height:100%;min-height:0;object-fit:contain;border-radius:var(--$-r-sm)}
.$-stage-fig figcaption{flex:none;font-size:12px;line-height:18px;opacity:.8}
.$-stage-empty{padding:8px;font-size:12px;line-height:18px;text-align:center;opacity:.7}
.$-stage-badge{position:absolute;top:10px;left:10px;display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;corner-shape:round;background:var(--$-raised);box-shadow:var(--$-shadow-2);color:var(--$-text);font-size:12px;line-height:18px}
.$-stage-nav{position:absolute;top:50%;display:flex;align-items:center;justify-content:center;width:34px;height:54px;padding:0;border:0;border-radius:var(--$-r-md);background:var(--$-raised);box-shadow:var(--$-shadow-2);color:var(--$-text);cursor:pointer;opacity:0;transform:translateY(-50%);transition:opacity 120ms ease}
.$-stage-nav:disabled{cursor:default}
.$-stage:hover .$-stage-nav:not(:disabled),.$-stage-nav:focus-visible{opacity:1}
.$-stage-prev{left:10px}.$-stage-next{right:10px}
.$-strip{display:grid;grid-template-columns:repeat(var(--n,6),minmax(0,1fr));gap:8px}
.$-strip-cell{display:flex;flex-direction:column;gap:4px;min-width:0;padding:4px;border:0;border-radius:var(--$-r-md);background:none;color:var(--$-text-2);font-size:12px;line-height:18px;cursor:pointer}
.$-strip-cell[aria-current=true]{background:var(--$-soft);box-shadow:inset 0 0 0 1.5px var(--$-text);color:var(--$-text)}
.$-strip-thumb{display:flex;align-items:center;justify-content:center;height:84px;border-radius:var(--$-r-sm);background:var(--$-soft);overflow:hidden}
.$-strip-thumb img{width:100%;height:100%;object-fit:cover}
.$-strip-label{display:flex;align-items:center;justify-content:center;gap:6px}
.$-mask{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--$-mask)}
.$-modal{display:flex;flex-direction:column;gap:16px;width:min(var(--w,440px),100%);max-height:100%;padding:24px 0;overflow:hidden;border-radius:var(--$-r-panel);background:var(--$-raised);box-shadow:var(--$-shadow-3);outline:none}
.$-modal-head{flex:none;display:flex;align-items:center;gap:8px;padding:0 24px}
.$-modal-title{flex:1;min-width:0;margin:0;font-size:16px;line-height:24px;font-weight:500}
.$-modal-body{flex:0 1 auto;display:flex;flex-direction:column;gap:16px;min-height:0;padding:2px 24px;overflow:auto}
.$-modal-foot{flex:none;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:0 24px}
.$-modal-text{margin:0;color:var(--$-text-2);font-size:14px;line-height:22px;white-space:pre-line}
.$-drawer-mask{position:absolute;inset:0;z-index:19}
.$-drawer{position:absolute;top:12px;right:12px;bottom:12px;z-index:20;display:flex;flex-direction:column;width:min(var(--w,420px),calc(100% - 24px));border-radius:var(--$-r-panel);background:var(--$-raised);box-shadow:var(--$-shadow-3);outline:none}
.$-drawer-head{display:flex;align-items:center;gap:8px;padding:calc(16px + var(--dsh-frame-top-clearance,0px)) 12px 12px 20px;border-bottom:.5px solid var(--$-line)}
.$-drawer-head-own{align-items:flex-start}
.$-drawer-body{flex:1;min-height:0;overflow:auto;padding:16px 20px 24px;display:flex;flex-direction:column;gap:16px}
.$-menu{display:inline-flex;min-width:0;max-width:100%}
.$-menu-block{display:flex;width:100%}
.$-menu-btn{min-width:0;max-width:100%}
.$-menu-btn-2{height:auto;min-height:44px;padding:6px 8px 6px 10px}
.$-menu-text{flex:1;display:flex;flex-direction:column;min-width:0;text-align:left}
.$-menu-text b,.$-menu-text small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-menu-text b{font-weight:inherit}
.$-menu-btn-2 .$-menu-text b{font-size:14px;line-height:20px;font-weight:500}
.$-menu-text small{color:var(--$-text-3);font-size:12px;line-height:18px}
.$-menu-caret{flex:none;display:inline-flex;color:var(--$-text-3)}
.$-menu-panel{position:absolute;left:0;top:0;z-index:25;display:flex;flex-direction:column;gap:2px;width:var(--w,max-content);max-width:min(360px,calc(100% - 16px));max-height:min(60vh,420px);padding:6px;overflow:auto;border-radius:var(--$-r-lg);background:var(--$-raised);box-shadow:var(--$-shadow-3);visibility:hidden}
.$-menu-item{flex:none;display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:5px 8px;border:0;border-radius:var(--$-r-sm);background:none;color:var(--$-text);font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.$-menu-item:focus-visible{outline-offset:-2px}
.$-menu-item:disabled{opacity:.4;cursor:not-allowed}
.$-menu-item[data-danger=true]{color:var(--$-danger)}
.$-menu-item-text{flex:1;display:flex;flex-direction:column;min-width:0}
.$-menu-item-text small{color:var(--$-text-3);font-size:12px;line-height:18px}
.$-menu-sep{flex:none;height:.5px;margin:4px 0;background:var(--$-line)}
.$-menu-title{flex:none;padding:4px 8px 0;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-pane{position:relative;flex:none;display:flex;flex-direction:column;width:var(--w,380px);max-width:50%;min-width:0;min-height:0;border-left:.5px solid var(--$-line);background:var(--$-bg)}
.$-pane[data-drag=true]{user-select:none}
.$-pane-grip{position:absolute;left:-4px;top:0;bottom:0;z-index:5;width:8px;cursor:col-resize;touch-action:none}
.$-pane[data-drag=true] .$-pane-grip{background:var(--$-soft)}
.$-pane-head{flex:none;display:flex;align-items:center;gap:4px;min-height:52px;padding:calc(8px + var(--dsh-frame-top-clearance,0px)) 8px 8px 16px;border-bottom:.5px solid var(--$-line)}
.$-pane-title{flex:1;min-width:0}
.$-pane-title b,.$-pane-title small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-pane-title b{font-size:14px;line-height:20px;font-weight:500}
.$-pane-title small{color:var(--$-text-3);font-size:12px;line-height:18px}
.$-pane-body{position:relative;flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;--dsh-frame-top-clearance:0px}
.$-pane-body>*{flex:1;min-height:0}
.$-toasts{position:absolute;left:50%;bottom:24px;z-index:30;display:flex;flex-direction:column;align-items:center;gap:8px;transform:translateX(-50%);max-width:calc(100% - 32px);pointer-events:none}
.$-toast{padding:8px 14px;border-radius:var(--$-r-md);background:var(--$-toast-bg);color:var(--$-toast-text);font-size:13px;line-height:20px;box-shadow:var(--$-shadow-2)}
.$-notices{position:absolute;right:20px;bottom:20px;z-index:30;display:flex;flex-direction:column;gap:8px;width:min(420px,calc(100% - 40px))}
.$-notice{display:flex;align-items:flex-start;gap:8px;padding:10px 8px 10px 12px;border-radius:var(--$-r-lg);background:var(--$-raised);box-shadow:var(--$-shadow-3);font-size:13px;line-height:20px}
.$-notice>svg{flex:none;margin-top:6px;color:var(--$-text-2)}
.$-notice>span{padding:4px 0}
.$-notice[data-tone=danger]>svg{color:var(--$-danger)}
.$-notice[data-tone=warn]>svg{color:var(--$-warn)}
.$-notice[data-tone=success]>svg{color:var(--$-success)}
@media (hover:hover){
.$-nav-item:hover,.$-btn-default:hover:not(:disabled),.$-btn-ghost:hover:not(:disabled),.$-btn-danger:hover:not(:disabled),.$-step:hover:not(:disabled),.$-drop:hover,.$-strip-cell:hover,.$-menu-item:hover:not(:disabled),.$-pane-grip:hover{background:var(--$-soft)}
.$-btn-primary:hover:not(:disabled){background:var(--$-brand-hover)}
.$-table tr.$-click:hover td{background:var(--$-soft)}
.$-seg button:hover:not(:disabled),.$-tabs button:hover,.$-thumb-x:hover{color:var(--$-text)}
}
@media (prefers-reduced-motion:reduce){.$-spin{animation:none}.$-switch i,.$-stage-nav{transition:none}}
@container $-shell (max-width:1080px){
.$-bar-title~.$-bar-body{order:3;flex-basis:100%}
.$-bar-tools{margin-left:auto}
}
@container $-shell (max-width:900px){
.$-pane{position:absolute;top:0;right:0;bottom:0;z-index:18;width:min(var(--w,380px),100%);max-width:100%;box-shadow:var(--$-shadow-3)}
.$-pane-grip{display:none}
.$-bar .$-step{gap:6px;padding:0 8px}
.$-split{flex-direction:column}
.$-split-side{width:auto;min-width:0;max-width:none;height:42%;border-right:0;border-bottom:.5px solid var(--$-line)}
.$-stage{height:52vh}
}
@container $-shell (max-width:880px){
.$-nav{align-items:center;width:64px;padding-inline:10px}
.$-nav-title,.$-nav-label,.$-nav-badge,.$-nav-lock,.$-nav .$-btn-label,.$-nav .$-menu-text,.$-nav .$-menu-caret,.$-nav-head p,.$-nav-foot p{display:none}
.$-nav-item{justify-content:center;width:40px;padding:0}
.$-nav-head,.$-nav-foot{align-items:center}
.$-nav .$-btn{width:40px;height:40px;min-height:0;padding:0}
.$-nav .$-menu{width:auto}
.$-nav-group{align-self:stretch;height:.5px;margin:6px 4px;padding:0;background:var(--$-line);font-size:0;line-height:0;overflow:hidden}
.$-nav-group:first-child{display:none}
.$-grid{grid-template-columns:repeat(min(var(--cols,3),2),minmax(0,1fr))}
}
@container $-shell (max-width:560px){
.$-shell{flex-direction:column}
.$-nav{flex-direction:row;width:auto;padding:calc(6px + var(--dsh-frame-top-clearance,0px)) 12px 6px;border-right:0;border-bottom:.5px solid var(--$-line);overflow-x:auto}
.$-nav-list,.$-nav-head,.$-nav-foot{flex-direction:row}
.$-nav-foot{margin:0 0 0 auto}
.$-nav-group{display:none}
.$-page{padding-top:20px}
.$-grid{grid-template-columns:minmax(0,1fr)}
}
`

    // ---- 图标：h(Icon, { name: 'plus' })。要新图标，在这里加一行 SVG 路径（24×24 画布，描边）。
    //      一个图标要好几笔时写成数组：more: ['第一笔', '第二笔']。
    const ICONS = {
      home: 'M4 10.5 12 4l8 6.5V20H4zM9.5 20v-6h5v6',
      list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
      chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
      grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
      settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4.5v5M6 14.5v5',
      plus: 'M12 5v14M5 12h14',
      x: 'M6 6l12 12M18 6 6 18',
      check: 'M5 12.5 10 17.5 19 7',
      search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
      edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
      trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
      left: 'M15 6l-6 6 6 6',
      right: 'M9 6l6 6-6 6',
      down: 'M6 9l6 6 6-6',
      refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5',
      download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
      upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
      info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 7.5v.5',
      warn: 'M12 4 2.5 20h19zM12 10v4.5M12 17v.5',
      user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20c1-4 4-6 8-6s7 2 8 6',
      file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
      folder: 'M3 6h6l2 2h10v11H3z',
      film: 'M4 5h16v14H4zM4 9h16M8 5v4M16 5v4M10.5 12.5v4l3.5-2z',
      play: 'M8 5v14l11-7z',
      music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
      spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z',
      up: 'M6 15l6-6 6 6',
      more: ['M5 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z', 'M12 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z', 'M19 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z'],
      lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
      bell: 'M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21.5h4',
      calendar: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4',
      clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5V12l3 2',
      filter: 'M4 5h16l-6 7.5V19l-4-2v-4.5z',
      copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
      link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
      eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
      star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
      send: 'M4 12 20 4l-5 16-3.5-6.5zM11.5 13.5 20 4',
      image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4',
      chat: 'M4 5h16v11H10l-4 4v-4H4z',
      mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
      trend: 'M4 19h16M5 15l4.5-5 4 3L19 6',
      radar: ['M12 3a9 9 0 1 0 9 9', 'M12 7.5a4.5 4.5 0 1 0 4.5 4.5', 'M12 12l6.5-6.5'],
      heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
      share: 'M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v2',
      arrowUp: 'M12 19V5M6 11l6-6 6 6',
      arrowDown: 'M12 5v14M6 13l6 6 6-6',
      flame: 'M12 21a6 6 0 0 0 6-6c0-4-3-6-4-9-1 2-2 3-3.5 3.5C9 8 8.5 6.5 9 5c-3 2-3 6.5-3 10a6 6 0 0 0 6 6z',
      table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
    }
    function Icon({ name, size = 16 }) {
      return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        [ICONS[name] ?? ICONS.info].flat().map((d, i) => h('path', { key: i, d })))
    }
    /** 转圈：h(Spin) 放在一行字前面表示「正在做」；h(Spin, { sm: true }) 是小号。 */
    const Spin = ({ sm }) => h('span', { className: cls('spin', sm && 'spin-sm'), 'aria-hidden': true })

    // ---- 按钮：h(Btn, { kind: 'primary' | 'default' | 'ghost' | 'danger', sm, icon, onClick }, '文字')
    //      busy: 正在做（转圈、不能点）      tip: 鼠标停上去的说明，常用来讲「为什么现在不能点」
    //      lg: 大一号（一页里最主要的那一步）      block: 撑满一行
    //      只有图标的按钮要写 label：h(Btn, { icon: 'x', label: '关闭', onClick })
    //      当下载链接用：h(Btn, { href, download: '成片.mp4', icon: 'download' }, '下载成片')
    //      在新标签页打开外面的网页：h(Btn, { href, target: '_blank', icon: 'link' }, '去原帖看')
    function Btn({ kind = 'default', sm, lg, block, icon, label, tip, busy, disabled, href, download, target, onClick, children }) {
      const iconOnly = icon && (children === undefined || children === null)
      const className = cls('btn', `btn-${kind}`, sm && 'btn-sm', lg && 'btn-lg', block && 'btn-block', iconOnly && 'btn-icon')
      const inside = [busy ? h(Spin, { key: 'i', sm: true }) : icon ? h(Icon, { key: 'i', name: icon, size: sm ? 14 : 16 }) : null,
        iconOnly ? null : h('span', { key: 't', className: cls('btn-label') }, children)]
      if (href) return h('a', { className, href, download, target, rel: target ? 'noopener noreferrer' : undefined, title: tip ?? (iconOnly ? label : undefined), 'aria-label': iconOnly ? label : undefined }, inside)
      return h('button', { type: 'button', className, disabled: disabled || busy, onClick, title: tip ?? (iconOnly ? label : undefined), 'aria-label': iconOnly ? label : undefined, 'aria-busy': busy || undefined }, inside)
    }

    // ---- 输入类。onChange 直接拿到值：h(Input, { value, onChange: setValue, placeholder: '…' })
    //      只读（看得清但不能改）写 readOnly: true；要拿到输入框本身（比如让它聚焦）传 inputRef。
    const Input = ({ value, onChange, inputRef, ...rest }) => h('input', { ref: inputRef, className: cls('input'), value: value ?? '', onChange: e => onChange?.(e.target.value), ...rest })
    const Textarea = ({ value, onChange, inputRef, ...rest }) => h('textarea', { ref: inputRef, className: cls('input'), value: value ?? '', onChange: e => onChange?.(e.target.value), ...rest })
    /** options 可以是 ['甲', '乙']，也可以是 [{ value: 'a', label: '甲' }]。 */
    const norm = options => options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))
    const Select = ({ value, onChange, options = [], inputRef, ...rest }) => h('select', { ref: inputRef, className: cls('input'), value: value ?? '', onChange: e => onChange?.(e.target.value), ...rest },
      norm(options).map(o => h('option', { key: o.value, value: o.value }, o.label)))
    const Check = ({ checked, onChange, disabled, children }) => h('label', { className: cls('check') }, h('input', { type: 'checkbox', checked: Boolean(checked), disabled, onChange: e => onChange?.(e.target.checked) }), children)
    /** 单选（一列里选一个）：h(Radios, { name: 'music', value, onChange, options: [{ value: '', label: '不要配乐' }, { value: 'a', label: 'a.mp3', extra: 旁边再放点东西 }] }) */
    const Radios = ({ name, value, onChange, options = [] }) => h('div', { className: cls('radios'), role: 'radiogroup' }, norm(options).map(o => h('label', { key: o.value, className: cls('check') },
      h('input', { type: 'radio', name, checked: o.value === value, onChange: () => onChange?.(o.value) }), o.label, o.extra)))
    const Switch = ({ checked, onChange, label }) => h('button', { type: 'button', role: 'switch', className: cls('switch'), 'aria-checked': Boolean(checked), 'aria-label': label, onClick: () => onChange?.(!checked) }, h('i'))
    /**
     * 一个表单项：上面是名字，中间放输入框，下面可以有说明或报错。
     * 里面放的是一组按钮（Seg、Radios、几个 Check）时写 group: true，不然点名字会等于点了第一个按钮。
     */
    const Field = ({ label, hint, error, group, children }) => h(group ? 'div' : 'label', { className: cls('field'), role: group ? 'group' : undefined, 'aria-label': group && typeof label === 'string' ? label : undefined },
      h('span', { className: cls('field-label') }, label), children,
      error ? h('span', { className: cls('field-error') }, error) : hint ? h('span', { className: cls('field-hint') }, hint) : null)
    /** 拖文件上传区（拖进来或点一下选）：h(DropZone, { onFiles: files => …, accept: '.jpg,.png', busy, title, hint }) */
    function DropZone({ onFiles, accept, multiple = true, busy, title = '把文件拖到这里', hint = '或点一下选择文件' }) {
      const [drag, setDrag] = useState(false)
      const fileRef = useRef(null)
      const pick = () => fileRef.current?.click()
      return h('div', {
        className: cls('drop'), 'data-drag': drag, role: 'button', tabIndex: 0, onClick: pick,
        onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick() } },
        onDragOver: e => { e.preventDefault(); setDrag(true) }, onDragLeave: () => setDrag(false),
        onDrop: e => { e.preventDefault(); setDrag(false); if (e.dataTransfer?.files?.length) onFiles?.([...e.dataTransfer.files]) },
      },
      h('input', { ref: fileRef, type: 'file', multiple, hidden: true, accept, onClick: e => e.stopPropagation(), onChange: e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) onFiles?.(files) } }),
      busy ? h('span', null, h(Spin), ' 正在放入…') : h(Fragment, null, h(Icon, { name: 'upload', size: 20 }), h('b', null, title), h('span', null, hint)))
    }

    /**
     * 搜索框（带放大镜；回车才搜；有字时右边出一个清空）：
     * h(SearchBox, { value, onChange: setValue, onEnter: 字 => 去搜, placeholder: '姓名、手机号', width: 320 })
     * 点清空会把字清掉；清空后还要做别的事（比如回到全部）就写 onClear。
     */
    const SearchBox = ({ value, onChange, onEnter, onClear, placeholder, disabled, width, label }) => h('label', { className: cls('search'), style: width ? { '--w': `${width}px` } : undefined },
      h(Icon, { name: 'search' }),
      h('input', { value: value ?? '', placeholder, disabled, 'aria-label': label ?? placeholder, onChange: e => onChange?.(e.target.value), onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onEnter?.(e.target.value) } }),
      value && !disabled ? h(Btn, { kind: 'ghost', sm: true, icon: 'x', label: '清空', onClick: e => { e.preventDefault(); onChange?.(''); onClear?.() } }) : null)

    // ---- 展示类
    /** 标签。tone: 不写（灰）| 'success' | 'warn' | 'danger' | 'info' | 'outline'；tip 是鼠标停上去的说明。 */
    const Tag = ({ tone, tip, children }) => h('span', { className: cls('tag', tone && `tag-${tone}`), title: tip }, children)
    /** 状态圆点：h(Dot, { tone: 'success' | 'warn' | 'danger' | 'muted', label: '通过' })；不写 tone 是空心的「还没有」。 */
    const Dot = ({ tone, label }) => h('span', { className: cls('dot', tone && `dot-${tone}`), title: label, role: label ? 'img' : undefined, 'aria-label': label })
    /** 卡片：title 标题，note 标题旁的小字，sub 标题下面的一行说明，action 右上角的按钮，里面放任何内容。要加自己的类名或样式用 className、style。 */
    const Card = ({ title, note, sub, action, className, style, children }) => h('section', { className: [cls('card'), className].filter(Boolean).join(' '), style },
      title || action ? h('div', { className: cls('card-head') }, title ? h('h2', { className: cls('h2') }, title) : null, h('span', { className: cls('card-note') }, note), action) : null,
      sub ? h('p', { className: cls('card-sub') }, sub) : null,
      children)
    /** 数字卡：h(Stat, { label: '总数', value: 128, note: '比上周多 3' }) */
    const Stat = ({ label, value, note }) => h('div', { className: cls('stat') }, h('span', { className: cls('muted') }, label), h('b', null, value), note ? h('span', { className: cls('faint') }, note) : null)
    /**
     * 几列排开：h(Grid, { cols: 4 }, …)。窄的时候自动变两列、一列。
     * 格子数量不一定、说不准排几列时写 min：h(Grid, { min: 140 }, …)，每格最窄 140，一行能放几个放几个。
     */
    const Grid = ({ cols = 3, min, children }) => h('div', { className: cls('grid', min && 'grid-auto'), style: min ? { '--min': `${min}px` } : { '--cols': cols } }, children)
    const Row = ({ children }) => h('div', { className: cls('row') }, children)
    const Stack = ({ children }) => h('div', { className: cls('stack') }, children)
    /** 提示条：tone 不写（普通）| 'warn' | 'danger' | 'success'；action 是右边的按钮：h(Alert, { tone: 'warn', action: h(Btn, { sm: true }, '去处理') }, '有 3 条没确认') */
    const Alert = ({ tone, action, children }) => h('div', { className: cls('alert', tone && `alert-${tone}`), role: tone === 'danger' ? 'alert' : undefined },
      h(Icon, { name: tone === 'success' ? 'check' : tone ? 'warn' : 'info' }), h('div', { className: cls('grow') }, children),
      action ? h('div', { className: cls('alert-action') }, action) : null)
    /** 没有内容时：h(Empty, { title: '还没有事项', body: '点右上角新增', action: h(Btn, …) }) */
    const Empty = ({ title, body, action }) => h('div', { className: cls('empty') }, h('p', { className: cls('empty-title') }, title), body ? h('p', { className: cls('empty-body') }, body) : null, action ? h('div', { className: cls('empty-action') }, action) : null)
    const Loading = ({ text = '正在加载…' }) => h('div', { className: cls('center') }, h(Spin), text)
    /** 出错时：显示原因和「重试」。 */
    const ErrorBox = ({ error, onRetry }) => h(Alert, { tone: 'danger' }, h(Row, null, h('span', { className: cls('grow') }, error?.message ?? String(error)), onRetry ? h(Btn, { sm: true, onClick: onRetry }, '重试') : null))
    /** 两列的「名字：值」清单：h(KV, { items: [['负责人', '小王'], ['状态', '进行中']] })，值是空的那行不显示。 */
    const KV = ({ items }) => h('dl', { className: cls('kv') }, items.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => [h('dt', { key: `${k}-t` }, k), h('dd', { key: `${k}-d` }, v)]))

    // ---- 切换类。options 同 Select。
    /**
     * 几选一（两三个选项，像开关）：h(Seg, { value, onChange, options: ['近 7 天', '近 30 天'] })
     * 给结论上色（通过 / 要改）：options 里写 tone: 'success' | 'warn' | 'danger'，每项还能写 tip。
     * disabled 整组不能点（只禁用一项就在那一项里写 disabled: true）；stretch 占满一行、每项一样宽；label 是给读屏用的名字。
     */
    const Seg = ({ value, onChange, options = [], disabled, stretch, label }) => h('div', { className: cls('seg', stretch && 'seg-stretch'), role: 'group', 'aria-label': label }, norm(options).map(o => h('button', {
      key: o.value, type: 'button', 'aria-pressed': o.value === value, 'data-tone': o.tone, disabled: disabled || o.disabled, title: o.tip, onClick: () => onChange?.(o.value),
    }, o.label)))
    /** 页内标签（一页里分几块内容）：h(Tabs, { value, onChange, options }) */
    const Tabs = ({ value, onChange, options = [] }) => h('div', { className: cls('tabs'), role: 'tablist' }, norm(options).map(o => h('button', { key: o.value, type: 'button', role: 'tab', 'aria-selected': o.value === value, onClick: () => onChange?.(o.value) }, o.label)))
    /**
     * 步骤条。两种用法：
     *   简单：h(Steps, { steps: [{ key: 'a', label: '导入' }, …], current: 'b', onPick })
     *         current 之前的算做完，之后的算没到、不能点。
     *   每步自己带状态（做到第 5 步时可以回头看第 2 步）：
     *         steps: [{ key, label, state: 'todo' | 'doing' | 'done', note: '待审核', noteTone: 'warn', disabled, tip }]
     *         这时 current 只表示「正在看哪一步」。
     */
    function Steps({ steps, current, onPick, label }) {
      const explicit = steps.some(s => s.state)
      const at = steps.findIndex(s => s.key === current)
      const ref = useRef(null)
      // 步骤多、窗口窄时放不下：正在看的那一步自动滚到看得见的地方。
      useEffect(() => { ref.current?.querySelector('[aria-current=step]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [current])
      return h('nav', { ref, className: cls('steps'), 'aria-label': label }, steps.map((s, i) => {
        const state = explicit ? s.state ?? 'todo' : i < at ? 'done' : i === at ? 'doing' : 'todo'
        const disabled = explicit ? s.disabled : state === 'todo' || !onPick
        return h('button', { key: s.key, type: 'button', className: cls('step'), 'data-state': state, 'aria-current': s.key === current ? 'step' : undefined, disabled, title: s.tip, onClick: () => onPick?.(s.key) },
          h('i', null, state === 'done' ? h(Icon, { name: 'check', size: 12 }) : i + 1), s.label, s.note ? h(Tag, { tone: s.noteTone }, s.note) : null)
      }))
    }

    // ---- 表格：h(Table, { columns: [{ key: 'title', title: '标题' }, { key: 'n', title: '数量', num: true, render: row => … }], rows, rowKey: 'id', onRowClick })
    //      没有行的时候显示 empty：可以是一句话，也可以是 h(Empty, …)。
    function Table({ columns, rows, rowKey = 'id', onRowClick, empty = '没有内容' }) {
      if (!rows?.length) return typeof empty === 'string' ? h('div', { className: cls('center') }, empty) : empty
      return h('div', { className: cls('table-wrap') }, h('table', { className: cls('table') },
        h('thead', null, h('tr', null, columns.map(col => h('th', { key: col.key, className: col.num ? cls('num') : undefined }, col.title)))),
        h('tbody', null, rows.map((row, i) => h('tr', { key: row[rowKey] ?? i, className: onRowClick ? cls('click') : undefined, onClick: onRowClick ? () => onRowClick(row) : undefined },
          columns.map(col => h('td', { key: col.key, className: col.num ? cls('num') : undefined }, col.render ? col.render(row) : row[col.key])))))))
    }

    // ---- 条形图：h(Bars, { rows: [{ label: '华东', value: 42 }, …], format: n => `${n} 人` })
    //      每行想用不同颜色就写 color: 1 到 9（图表配色里的第几种）。
    function Bars({ rows, format = n => String(n) }) {
      const max = Math.max(1, ...rows.map(r => r.value))
      return h('div', { className: cls('bars') }, rows.map(r => h('div', { key: r.label, className: cls('bars-row') },
        h('span', null, r.label), h('span', { className: cls('bars-track') }, h('span', { className: cls('bars-fill'), 'data-color': r.color, style: { width: `${(r.value / max) * 100}%`, background: r.color ? chart(r.color) : undefined } })), h('span', { className: cls('bars-value') }, format(r.value)))))
    }

    // ---- 图片和视频
    /**
     * 缩略图网格：h(Thumbs, { min: 180 }, h(Thumb, …), h(Thumb, …))，一格最窄 min 像素，自动排几列。
     * 一格：h(Thumb, { src, name: '文件名', meta: '1200×800 · 2 MB', badge: '参考图', onRemove, ratio: '4/3' }, 下面还想放的东西)
     * 不是图片就用 media 传内容；传 onClick 整张图可以点。
     */
    const Thumbs = ({ min, children }) => h('div', { className: cls('thumbs'), style: min ? { '--min': `${min}px` } : undefined }, children)
    function Thumb({ src, media, alt, ratio, name, meta, badge, onRemove, removing, onClick, children }) {
      const style = ratio ? { '--ratio': ratio } : undefined
      const pic = media ?? (src ? h('img', { src, alt: alt ?? (typeof name === 'string' ? name : ''), loading: 'lazy' }) : null)
      const tag = badge ? h('span', { className: cls('thumb-badge') }, badge) : null
      return h('figure', { className: cls('thumb') },
        onClick ? h('button', { type: 'button', className: cls('thumb-img', 'thumb-click'), style, onClick }, pic, tag)
          : h('div', { className: cls('thumb-img'), style }, pic, tag,
            onRemove ? h('button', { type: 'button', className: cls('thumb-x'), title: '删除', 'aria-label': '删除', disabled: removing, onClick: onRemove }, h(Icon, { name: 'x', size: 14 })) : null),
        h('figcaption', { className: cls('thumb-cap') },
          name ? h('div', { className: cls('thumb-name'), title: typeof name === 'string' ? name : undefined }, name) : null,
          meta ? h('div', { className: cls('faint') }, meta) : null, children))
    }
    /**
     * 大图舞台（深色底，看一张大图或一段视频，两边有上一个、下一个）：
     * h(Stage, { onPrev, onNext, badge: '新版本生成中…', caption: '生成的 v2', side: 左边对照的图, sideCaption: '参考图' }, h('img' 或 'video', …))
     * onPrev / onNext 不传就表示到头了。还没有内容时写 empty: '还没出图'，会在中间显示这句话。
     */
    function Stage({ onPrev, onNext, badge, caption, side, sideCaption, empty, children }) {
      return h('div', { className: cls('stage') },
        side ? h('figure', { className: cls('stage-fig') }, side, sideCaption ? h('figcaption', null, sideCaption) : null) : null,
        h('figure', { className: cls('stage-fig') }, children ?? (empty ? h('div', { className: cls('stage-empty') }, empty) : null), caption ? h('figcaption', null, caption) : null),
        badge ? h('div', { className: cls('stage-badge') }, badge) : null,
        h('button', { type: 'button', className: cls('stage-nav', 'stage-prev'), disabled: !onPrev, onClick: onPrev, 'aria-label': '上一个' }, h(Icon, { name: 'left', size: 20 })),
        h('button', { type: 'button', className: cls('stage-nav', 'stage-next'), disabled: !onNext, onClick: onNext, 'aria-label': '下一个' }, h(Icon, { name: 'right', size: 20 })))
    }
    /** 缩略条（舞台下面一排小图，点哪个看哪个）：h(Strip, { current, onPick, items: [{ key, thumb: h('img', …), label: '1' }] }) */
    const Strip = ({ items, current, onPick }) => h('div', { className: cls('strip'), style: { '--n': items.length } }, items.map(it => h('button', {
      key: it.key, type: 'button', className: cls('strip-cell'), 'aria-current': it.key === current, onClick: () => onPick?.(it.key),
    }, h('span', { className: cls('strip-thumb') }, it.thumb), h('span', { className: cls('strip-label') }, it.label))))

    // ---- 弹窗和抽屉：都画在插件自己的页面里（不盖住 DSH 别的地方），按 Esc 或点外面关掉。
    function useDismiss(onClose) {
      const ref = useRef(null)
      useEffect(() => {
        const before = document.activeElement
        // 里面已经有输入框拿到焦点（autoFocus）就不抢。
        if (!ref.current?.contains(document.activeElement)) ref.current?.focus()
        return () => before?.focus?.()
      }, [])
      const onKeyDown = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.() } }
      return { ref, onKeyDown, tabIndex: -1 }
    }
    /** 弹窗：h(Modal, { title: '新增事项', onClose, width: 440, footer: [取消按钮, 确定按钮] }, 表单…)。内容太长时标题和底下的按钮不动，中间自己滚动。 */
    function Modal({ title, onClose, footer, width, children }) {
      const dismiss = useDismiss(onClose)
      return h('div', { className: cls('mask'), onClick: onClose },
        h('div', { className: cls('modal'), role: 'dialog', 'aria-modal': true, 'aria-label': title, style: width ? { '--w': `${width}px` } : undefined, onClick: e => e.stopPropagation(), ...dismiss },
          h('div', { className: cls('modal-head') }, h('h2', { className: cls('modal-title') }, title), h(Btn, { kind: 'ghost', sm: true, icon: 'x', label: '关闭', onClick: onClose })),
          h('div', { className: cls('modal-body') }, children),
          footer ? h('div', { className: cls('modal-foot') }, footer) : null))
    }
    /**
     * 抽屉（从右边出来，看一条的详情）：h(Drawer, { title: '详情', onClose, width: 420 }, 内容…)
     * 头部想放头像、两行字、一排标签时写 head: 你的内容（title 仍然要写，给读屏用）。
     */
    function Drawer({ title, head, onClose, width = 420, children }) {
      const dismiss = useDismiss(onClose)
      return h(Fragment, null,
        h('div', { className: cls('drawer-mask'), onClick: onClose }),
        h('aside', { className: cls('drawer'), role: 'dialog', 'aria-label': title, style: { '--w': `${width}px` }, ...dismiss },
          h('div', { className: cls('drawer-head', head && 'drawer-head-own') }, head ? h('div', { className: cls('grow') }, head) : h('h2', { className: cls('modal-title') }, title), h(Btn, { kind: 'ghost', sm: true, icon: 'x', label: '关闭', onClick: onClose })),
          h('div', { className: cls('drawer-body') }, children)))
    }

    /**
     * 下拉菜单（一个按钮，点开一列可选的；自己管开关，点别处、按 Esc 会关）：
     *   h(Menu, { label: '更多操作', items: [
     *     { key: 'copy', label: '复制', icon: 'copy', onClick: 复制 },
     *     { sep: true },                                                      // 分隔线
     *     { key: 'del', label: '删除', icon: 'trash', danger: true, onClick: 删除 },
     *   ] })
     * 当切换器用（显示现在是哪个，点开换一个）：
     *   h(Menu, { icon: 'folder', label: '天蝎座车主', sub: '30 位客户', block: true, items: 列表.map(x => ({ key: x.id, label: x.name, note: '第二行小字', current: x.id === 现在的, onClick: () => 切到(x.id) })) })
     * 按钮的样子：kind、sm、block 同 Btn；不写 label 只写 icon 就是一个图标按钮（这时 tip 必须写）；align: 'right' 让菜单靠右对齐；width 定菜单宽度。
     * 每一项还能写 disabled、tip；{ title: '小标题' } 是一行不能点的分组名。
     */
    function Menu({ label, sub, icon, tip, kind = 'default', sm, block, align = 'left', width, disabled, items = [] }) {
      const [open, setOpen] = useState(false)
      const boxRef = useRef(null)
      const btnRef = useRef(null)
      const panelRef = useRef(null)
      const close = useCallback(refocus => { setOpen(false); if (refocus) btnRef.current?.focus() }, [])
      // 菜单画在最近的外框里（不会被导航、卡片裁掉），位置按按钮算：下面放不下就放到上面。
      useLayoutEffect(() => {
        if (!open) return undefined
        const panel = panelRef.current
        const host = panel.offsetParent ?? panel.parentElement
        const b = btnRef.current.getBoundingClientRect()
        const r = host.getBoundingClientRect()
        panel.style.minWidth = `${Math.min(b.width, r.width - 16)}px`
        const w = panel.offsetWidth
        const ph = panel.offsetHeight
        const left = Math.max(8, Math.min((align === 'right' ? b.right - w : b.left) - r.left, r.width - w - 8))
        const below = b.bottom - r.top + 6
        const above = b.top - r.top - 6 - ph
        panel.style.left = `${left + host.scrollLeft}px`
        panel.style.top = `${(below + ph > r.height - 8 && above >= 8 ? above : below) + host.scrollTop}px`
        panel.style.visibility = 'visible'
        ;(panel.querySelector('[aria-current=true]') ?? panel.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true })
        const outside = e => { if (!boxRef.current?.contains(e.target)) close() }
        const scrolled = e => { if (!panel.contains(e.target)) close() }
        const resized = () => close()
        document.addEventListener('pointerdown', outside, true)
        document.addEventListener('scroll', scrolled, true)
        window.addEventListener('resize', resized)
        return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', scrolled, true); window.removeEventListener('resize', resized) }
      }, [open, align, close])
      const onKeyDown = e => {
        if (!open) return
        if (e.key === 'Escape') { e.stopPropagation(); close(true); return }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const list = [...panelRef.current.querySelectorAll('button:not(:disabled)')]
        const at = list.indexOf(document.activeElement)
        list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
      }
      const iconOnly = icon && (label === undefined || label === null)
      return h('span', { ref: boxRef, className: cls('menu', block && 'menu-block'), onKeyDown },
        h('button', { ref: btnRef, type: 'button', className: cls('btn', `btn-${kind}`, sm && 'btn-sm', block && 'btn-block', iconOnly && 'btn-icon', 'menu-btn', sub && 'menu-btn-2'), disabled, title: tip, 'aria-label': iconOnly ? tip : undefined, 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen(!open) },
          icon ? h(Icon, { name: icon, size: sub ? 18 : sm ? 14 : 16 }) : null,
          iconOnly ? null : h('span', { className: cls('menu-text') }, h('b', null, label), sub ? h('small', null, sub) : null),
          iconOnly ? null : h('span', { className: cls('menu-caret') }, h(Icon, { name: 'down', size: 14 }))),
        open ? h('div', { ref: panelRef, className: cls('menu-panel'), role: 'menu', tabIndex: -1, style: width ? { '--w': `${width}px` } : undefined }, items.filter(Boolean).map((it, i) => it.sep ? h('div', { key: `s${i}`, className: cls('menu-sep'), role: 'separator' })
          : it.title ? h('div', { key: `t${i}`, className: cls('menu-title') }, it.title)
            : h('button', { key: it.key ?? i, type: 'button', role: 'menuitem', className: cls('menu-item'), 'aria-current': it.current ? 'true' : undefined, 'data-danger': it.danger || undefined, disabled: it.disabled, title: it.tip, onClick: () => { close(true); it.onClick?.() } },
              it.icon ? h(Icon, { name: it.icon }) : null,
              h('span', { className: cls('menu-item-text') }, h('span', null, it.label), it.note ? h('small', null, it.note) : null),
              it.current ? h(Icon, { name: 'check', size: 14 }) : null))) : null)
    }

    /**
     * 右边能拉宽的一栏（放对话、放说明）。交给 Shell 的 side：
     *   h(SidePane, { title: 'AI 助手', sub: '只看得到统计', tools: [关闭按钮], width: 380, min: 320, max: 640 }, 这一栏的内容)
     * 用户拖左边那条边可以改宽度（最宽占到一半）。想记住宽度就传 width 和 onResize: 宽度 => 记下来；不传 onResize 它自己记（关掉再开会回到 width）。
     * 窗口窄的时候它会盖在页面上面，所以 tools 里要放一个能关掉它的按钮。
     */
    function SidePane({ width = 380, min = 320, max = 640, onResize, title, sub, tools, label, children }) {
      const [own, setOwn] = useState(width)
      const [drag, setDrag] = useState(null)
      const from = useRef(null)
      const base = onResize ? width : own
      const clamp = w => Math.min(max, Math.max(min, Math.round(w)))
      const commit = w => { setDrag(null); if (onResize) onResize(w); else setOwn(w) }
      const at = e => clamp(from.current.w + from.current.x - e.clientX)
      return h('aside', { className: cls('pane'), 'data-drag': drag !== null, 'aria-label': label ?? (typeof title === 'string' ? title : undefined), style: { '--w': `${drag ?? base}px` } },
        h('div', {
          className: cls('pane-grip'), role: 'separator', tabIndex: 0, title: '拖动调整宽度（也可以按左右方向键）', 'aria-label': '调整宽度', 'aria-orientation': 'vertical', 'aria-valuenow': drag ?? base, 'aria-valuemin': min, 'aria-valuemax': max,
          onPointerDown: e => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 抓不住指针也能拖，只是鼠标要留在这条边上 */ } from.current = { x: e.clientX, w: base }; setDrag(base) },
          onPointerMove: e => { if (from.current) setDrag(at(e)) },
          onPointerUp: e => { if (!from.current) return; const w = at(e); from.current = null; commit(w) },
          onPointerCancel: () => { from.current = null; setDrag(null) },
          onKeyDown: e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); commit(clamp(base + (e.key === 'ArrowLeft' ? 24 : -24))) } },
        }),
        title || tools ? h('div', { className: cls('pane-head') }, h('div', { className: cls('pane-title') }, h('b', null, title), sub ? h('small', null, sub) : null), tools) : null,
        h('div', { className: cls('pane-body') }, children))
    }

    // ---- 三种「跟用户说一声」，都不用自己管开关，写一行就行：
    //        toast('已保存')                                  → 底部一条小字，几秒后自己消失。成功、顺手的事用它。
    //        notify('没做成：Key 没填', { tone, action })      → 右下角一张卡，停得久、能关、能带一个按钮。出错和要用户处理的事用它。
    //        await ask({ title, text, ok })                   → 弹窗问一句，等用户点了再往下走。删除、花钱之前用它。
    function makeStore(initial) {
      let state = initial
      const listeners = new Set()
      return {
        get: () => state,
        set(next) { state = typeof next === 'function' ? next(state) : next; listeners.forEach(fn => fn()) },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
      }
    }
    const useStore = store => useSyncExternalStore(store.subscribe, store.get)

    const toasts = makeStore([])
    let seq = 0
    function toast(text, ms = 3000) {
      const id = ++seq
      toasts.set(list => [...list, { id, text }])
      setTimeout(() => toasts.set(list => list.filter(x => x.id !== id)), ms)
    }
    const Toasts = () => h('div', { className: cls('toasts'), role: 'status' }, useStore(toasts).map(x => h('div', { key: x.id, className: cls('toast') }, x.text)))

    /** tone: 'danger'（默认，停 9 秒）| 'warn' | 'success'（停 6 秒）；action: { label: '打开设置', onClick }；ms 自己定停多久。 */
    const notices = makeStore([])
    const dropNotice = id => notices.set(list => list.filter(x => x.id !== id))
    function notify(text, { tone = 'danger', action, ms } = {}) {
      const id = ++seq
      notices.set(list => [...list, { id, text, tone, action }])
      setTimeout(() => dropNotice(id), ms ?? (tone === 'danger' ? 9000 : 6000))
    }
    function Notices() {
      const list = useStore(notices)
      if (!list.length) return null
      return h('div', { className: cls('notices') }, list.map(x => h('div', { key: x.id, className: cls('notice'), 'data-tone': x.tone, role: x.tone === 'danger' ? 'alert' : 'status' },
        h(Icon, { name: x.tone === 'success' ? 'check' : 'warn' }), h('span', { className: cls('grow') }, x.text),
        x.action ? h(Btn, { sm: true, onClick: () => { x.action.onClick(); dropNotice(x.id) } }, x.action.label) : null,
        h(Btn, { kind: 'ghost', sm: true, icon: 'x', label: '关闭', onClick: () => dropNotice(x.id) }))))
    }

    /**
     * 问一句再做：
     *   if (!(await ask({ title: '删除这一条？', text: '删了找不回来。', ok: '删除', danger: true }))) return     → 确定是 true，取消是 false
     *   const name = await ask({ title: '新建项目', text: '叫什么？', input: { placeholder: '…', value: '默认值' } })   → 返回填的字，取消是 null
     */
    const asks = makeStore(null)
    function ask({ title, text, input, ok = '确定', cancel = '取消', danger = false }) {
      return new Promise(resolve => asks.set({ title, text, input, ok, cancel, danger, resolve }))
    }
    function AskHost() {
      const dialog = useStore(asks)
      const [value, setValue] = useState('')
      useEffect(() => { setValue(dialog?.input?.value ?? '') }, [dialog])
      if (!dialog) return null
      const close = result => { asks.set(null); dialog.resolve(result) }
      const yes = () => close(dialog.input ? value : true)
      const no = () => close(dialog.input ? null : false)
      return h(Modal, { title: dialog.title ?? '确认', onClose: no, footer: [h(Btn, { key: 'no', onClick: no }, dialog.cancel), h(Btn, { key: 'ok', kind: dialog.danger ? 'danger' : 'primary', onClick: yes }, dialog.ok)] },
        dialog.text ? h('p', { className: cls('modal-text') }, dialog.text) : null,
        dialog.input ? h(Input, { value, onChange: setValue, placeholder: dialog.input.placeholder ?? '', autoFocus: true, onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) yes() } }) : null)
    }

    // ---- 页面骨架。两种外框任选一种，里面都已经带好 toast / notify / ask 的显示位置。
    /**
     * 最外层的框。一般不直接用，用下面的 Shell；要「顶栏 + 左右分栏」这种布局时用它：h(Root, null, h(TopBar, …), h(Split, …))
     * 要加自己的类名、或者接住整个页面的点击，写 className、onClick。
     */
    /**
     * 插件外框以外的地方（比如画在 DSH 对话区里的卡片）也想用「外观」段的颜色和底座的组件，就在最外面包一层：
     * h(Embed, null, h(Card, { title: '名单已生成' }, …))
     */
    const Embed = ({ className, children }) => h('div', { className: [cls('embed'), className].filter(Boolean).join(' ') }, children)
    const Root = ({ className, onClick, children }) => h('div', { className: [cls('root'), className].filter(Boolean).join(' '), onClick }, children, h(Toasts), h(Notices), h(AskHost))
    /**
     * 外框一：左边一列导航，右边是当前页面（页面自己滚动）。
     * h(Shell, { title: '我的插件', nav: [{ key: 'home', label: '首页', icon: 'home', badge: 3 }], current, onNav }, 当前页面)
     * 只有一个页面时不传 nav，就没有左边那一列。
     *
     * 导航里的一项还能写：badgeTone: 'danger'（数字变红）、tip（鼠标停上去的说明）、
     *                    locked: true（变淡带一把锁；点了照样会调 onNav，由你决定显示什么）。
     * 导航分组：在 nav 里插一行 { group: '工作台' }，它后面的几项就归这一组。
     * 另外四个位置（都可以不写）：
     *   navHead  导航上方，放切换器（Menu）或几个小数字
     *   navFoot  导航底部，放一个按钮和一句说明。窄的时候导航缩成一列图标，这里的按钮要带 icon，文字说明用 h('p', …)
     *   top      页面上方的顶栏，放 h(TopBar, { tools: […] }, h(SearchBox, …))
     *   side     最右边的一栏，放 h(SidePane, …)，不显示时传 null
     */
    function Shell({ title, nav, current, onNav, navHead, navFoot, top, side, children }) {
      const items = nav?.filter(Boolean) ?? []
      return h(Root, null, h('div', { className: cls('shell') },
        items.length || navHead || navFoot ? h('nav', { className: cls('nav'), 'aria-label': title },
          title ? h('div', { className: cls('nav-title') }, title) : null,
          navHead ? h('div', { className: cls('nav-head') }, navHead) : null,
          h('div', { className: cls('nav-list') }, items.map((item, i) => item.group
            ? h('div', { key: `g${i}`, className: cls('nav-group') }, item.group)
            : h('button', { key: item.key, type: 'button', className: cls('nav-item'), 'aria-current': item.key === current ? 'page' : undefined, 'data-locked': item.locked || undefined, title: item.tip ?? item.label, onClick: () => onNav?.(item.key) },
              h(Icon, { name: item.icon ?? 'file', size: 18 }), h('span', { className: cls('nav-label') }, item.label),
              item.badge ? h('span', { className: cls('nav-badge', item.badgeTone === 'danger' && 'nav-badge-danger') }, item.badge) : null,
              item.locked ? h('span', { className: cls('nav-lock') }, h(Icon, { name: 'lock', size: 14 })) : null))),
          navFoot ? h('div', { className: cls('nav-foot') }, navFoot) : null) : null,
        h('div', { className: cls('main') }, top, h('div', { className: cls('scroll') }, children)),
        side))
    }
    /**
     * 外框二的上半：顶栏（左边图标和名字，中间放选择器、步骤条，右边放小工具；窄了自动变两行）。
     * h(TopBar, { icon: 'film', title: '宣传片工坊', tools: [花费, 设置按钮] }, 中间的内容…)
     * 放在 Shell 的 top 里时一般不写 icon 和 title（名字已经在导航上了）。
     */
    const TopBar = ({ icon, title, tools, children }) => h('header', { className: cls('bar') },
      icon || title ? h('div', { className: cls('bar-title') }, icon ? h(Icon, { name: icon, size: 18 }) : null, title) : null,
      h('div', { className: cls('bar-body') }, children),
      tools ? h('div', { className: cls('bar-tools') }, tools) : null)
    /**
     * 外框二的下半：左右分栏（左边一栏固定宽，比如对话；右边是工作区，自己滚动；窄的时候变成上下）。
     * h(Split, { sideTitle: '助手', sideAction: h(Btn, …), side: 左边的内容, mainKey: 当前页面的名字 }, 右边的内容)
     * mainKey 变了（换了页面），右边会回到顶部。
     */
    const Split = ({ side, sideTitle, sideAction, mainKey, children }) => h('div', { className: cls('split') },
      h('aside', { className: cls('split-side'), 'aria-label': sideTitle },
        sideTitle || sideAction ? h('div', { className: cls('split-head') }, h('span', { className: cls('grow') }, sideTitle), sideAction) : null,
        h('div', { className: cls('split-body') }, side)),
      h('main', { key: mainKey, className: cls('split-main') }, children))
    /**
     * 一个页面：上面是标题、一句说明和右上角的按钮，下面放内容。
     * crumb 是标题上方的一行小字（比如「名单 / 第 3 批」）。默认最宽 1080，表格多的页面写 width: 1280，要铺满写 wide: true。
     */
    const Page = ({ title, sub, crumb, actions, wide, width, children }) => h('div', { className: cls('page', wide && 'page-wide'), style: width && !wide ? { maxWidth: width } : undefined },
      title ? h('header', { className: cls('head') }, h('div', { className: cls('head-text') }, crumb ? h('p', { className: cls('crumb') }, crumb) : null, h('h1', { className: cls('h1') }, title), sub ? h('p', { className: cls('sub') }, sub) : null), actions ? h(Row, null, actions) : null) : null,
      children)

    // ---- 调后台和取数据
    /**
     * 调后台：await api('list') 或 await api('add', { title: '…' })。失败会抛错，错误的 message 可以直接给用户看。
     * 它在第 4 段挂载时接上 index.js 里的 ROUTE。后台地址或协议不一样的插件，在第 4 段把 api 换成自己的函数就行。
     */
    let api = async () => { throw new Error('页面还没接上后台') }
    /**
     * 取数据并管好「加载中 / 出错 / 有数据」三种情况：
     *   const items = useData(() => api('list'), [])
     *   items.loading / items.error / items.data / items.reload()
     */
    function useData(load, deps) {
      const [state, setState] = useState({ loading: true, error: null, data: null })
      const [tick, setTick] = useState(0)
      useEffect(() => {
        let alive = true
        setState(s => ({ ...s, loading: true, error: null }))
        load().then(data => alive && setState({ loading: false, error: null, data }), error => alive && setState(s => ({ ...s, loading: false, error })))
        return () => { alive = false }
      }, [...deps, tick])
      const reload = useCallback(() => setTick(n => n + 1), [])
      return { ...state, reload }
    }
    /**
     * 做一件会改数据的事，并管好「正在做 / 出错」：
     *   const { busy, error, run } = useAction()
     *   run(async () => { await api('add', { title }); toast('已新增'); items.reload() })
     * 按钮上写 busy，出错的话 error.message 可以直接显示，或者 notify(error.message)。
     */
    function useAction() {
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const run = useCallback(async fn => {
        setBusy(true); setError(null)
        try { return await fn() } catch (e) { setError(e); return undefined } finally { setBusy(false) }
      }, [])
      return { busy, error, run }
    }

    // ================================================================== 3. 你的页面（从这里改）

    // 这个插件自己的样式写在这里：类名前面写 $-，用的时候 cls('名字')；颜色用「外观」段里的变量。
    const PAGE_STYLES = `
.$-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.$-clamp-3{-webkit-line-clamp:3}
.$-pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:22px}
.$-num{font-variant-numeric:tabular-nums}
/* 严重程度：三根从矮到高的小条，亮几根就是几级 */
.$-sev{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.$-sev-bars{display:inline-flex;align-items:flex-end;gap:2px}
.$-sev-bars i{display:block;width:5px;border-radius:2px;background:var(--$-line-2)}
.$-sev-bars i:nth-child(1){height:6px}.$-sev-bars i:nth-child(2){height:9px}.$-sev-bars i:nth-child(3){height:12px}
.$-sev-text{color:var(--$-text-2);font-size:12px;line-height:18px}
/* 平台小方块 */
.$-pb{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--s,20px);height:var(--s,20px);border-radius:calc(var(--s,20px) * .3);color:var(--$-on-strong);font-size:calc(var(--s,20px) * .55);font-weight:700;line-height:1;box-shadow:inset 0 0 0 .5px var(--$-line)}
.$-pb[data-off=true]{opacity:.35;filter:grayscale(1)}
.$-pname{display:inline-flex;align-items:center;gap:8px;min-width:0;white-space:nowrap}
.$-pname>span:last-child{overflow:hidden;text-overflow:ellipsis}
.$-eng{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}
/* 图表：外框、悬停提示、图例 */
.$-chart{position:relative;min-width:0;width:100%}
.$-chart svg{display:block;overflow:visible}
.$-chart text{font-family:var(--$-font);font-size:11px}
.$-tip{position:absolute;z-index:6;pointer-events:none;min-width:128px;max-width:240px;padding:8px 10px;border-radius:var(--$-r-sm);background:var(--$-raised);box-shadow:var(--$-shadow-3);color:var(--$-text);font-size:12px;line-height:18px;transform:translate(-50%,calc(-100% - 12px));white-space:nowrap}
.$-tip[data-below=true]{transform:translate(-50%,16px)}
.$-tip>b{display:block;margin-bottom:4px;font-weight:600}
.$-tip-row{display:flex;align-items:center;gap:6px}
.$-tip-row i{flex:none;width:8px;height:8px;border-radius:2px}
.$-tip-row span:last-child{margin-left:auto;padding-left:16px;font-variant-numeric:tabular-nums;font-weight:500}
.$-tip-foot{margin-top:4px;padding-top:4px;border-top:.5px solid var(--$-line);color:var(--$-text-2)}
.$-legend{display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;color:var(--$-text-2);font-size:12px;line-height:18px}
.$-legend>span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.$-legend i{flex:none;width:10px;height:10px;border-radius:3px}
.$-legend b{color:var(--$-text);font-weight:500;font-variant-numeric:tabular-nums}
/* 看板外框 */
.$-sec{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:8px}
.$-sec-title{margin:0;font-size:17px;line-height:26px;font-weight:600;font-family:var(--$-font-title)}
.$-duo{display:grid;gap:16px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.$-duo-21{grid-template-columns:minmax(0,1.75fr) minmax(0,1fr)}
.$-kpis{display:grid;gap:12px;grid-template-columns:repeat(4,minmax(0,1fr))}
/* 顶部「今天的局势」 */
.$-board{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px 32px;align-items:center;padding:22px 24px;border-radius:var(--$-r-xl);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line);overflow:hidden}
.$-board::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(110% 150% at 0% 0%,var(--$-glow) 0%,transparent 62%)}
.$-board>*{position:relative;min-width:0}
.$-board[data-level=danger]{--$-glow:color-mix(in srgb,var(--$-danger) 16%,transparent);--$-lv:var(--$-danger)}
.$-board[data-level=warn]{--$-glow:color-mix(in srgb,var(--$-warn) 16%,transparent);--$-lv:var(--$-warn)}
.$-board[data-level=ok]{--$-glow:color-mix(in srgb,var(--$-success) 13%,transparent);--$-lv:var(--$-success)}
.$-board[data-level=idle]{--$-glow:color-mix(in srgb,var(--$-accent) 12%,transparent);--$-lv:var(--$-accent)}
.$-board-text{display:flex;flex-direction:column;gap:10px}
.$-level{display:inline-flex;align-self:flex-start;align-items:center;gap:6px;padding:3px 10px 3px 8px;border-radius:999px;corner-shape:round;background:color-mix(in srgb,var(--$-lv) 13%,transparent);color:var(--$-lv);font-size:12px;line-height:18px;font-weight:600}
.$-headline{margin:0;font-size:30px;line-height:40px;font-weight:600;font-family:var(--$-font-title)}
.$-headline b{color:var(--$-lv);font-size:40px}
.$-board-sum{margin:0;max-width:640px;color:var(--$-text-2);font-size:14px;line-height:23px;white-space:pre-wrap}
.$-board-meta{display:flex;flex-wrap:wrap;gap:6px 16px;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-board-meta>span{display:inline-flex;align-items:center;gap:5px}
.$-board-foot{grid-column:1/-1;display:flex;flex-direction:column;gap:8px}
/* 环形图 */
.$-donut{display:flex;align-items:center;gap:20px}
.$-donut-ring{position:relative;flex:none}
.$-donut-ring svg{display:block}
.$-donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.$-donut-center b{font-size:30px;line-height:36px;font-weight:600}
.$-donut-center span{color:var(--$-text-3);font-size:12px;line-height:16px}
.$-donut-legend{display:flex;flex-direction:column;gap:6px;min-width:112px;font-size:13px;line-height:20px}
.$-donut-legend>div{display:grid;grid-template-columns:10px auto 1fr;align-items:center;gap:8px}
.$-donut-legend i{width:10px;height:10px;border-radius:3px}
.$-donut-legend b{justify-self:end;font-weight:500;font-variant-numeric:tabular-nums}
.$-donut-legend small{color:var(--$-text-3);font-size:11px;margin-left:4px;font-weight:400}
/* 大数字卡 */
.$-kpi{display:flex;flex-direction:column;gap:4px;min-width:0;padding:14px 16px 10px;border-radius:var(--$-r-lg);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line)}
.$-kpi-label{display:flex;align-items:center;gap:6px;color:var(--$-text-2);font-size:13px;line-height:20px}
.$-kpi-label svg{color:var(--$-text-3)}
.$-kpi-value{display:flex;align-items:baseline;gap:4px;font-size:32px;line-height:40px;font-weight:600;white-space:nowrap;overflow:hidden;font-family:var(--$-font-title)}
.$-kpi-value small{color:var(--$-text-3);font-size:13px;line-height:20px;font-weight:400}
.$-kpi[data-tone=danger] .$-kpi-value{color:var(--$-danger)}
.$-delta{display:inline-flex;align-items:center;gap:3px;min-height:18px;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-delta[data-tone=bad]{color:var(--$-danger)}
.$-delta[data-tone=good]{color:var(--$-success)}
.$-delta[data-tone=flat]{color:var(--$-text-2)}
.$-kpi-foot{color:var(--$-text-3);font-size:11px;line-height:16px}
.$-meter{height:6px;border-radius:999px;corner-shape:round;background:color-mix(in srgb,var(--$-neg) 14%,transparent);overflow:hidden;margin:8px 0 6px}
.$-meter i{display:block;height:100%;border-radius:inherit;background:var(--$-neg)}
/* 检查进度 */
.$-prog{border-radius:var(--$-r-xl);background:var(--$-card);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--$-accent) 35%,transparent);padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.$-prog-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.$-prog-pct{margin-left:auto;font-size:22px;line-height:28px;font-weight:600;font-variant-numeric:tabular-nums}
.$-pbar{position:relative;height:10px;border-radius:999px;corner-shape:round;background:var(--$-soft);overflow:hidden}
.$-pbar i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;background:var(--$-accent);transition:width .6s ease}
.$-pbar i::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--$-on-strong) 45%,transparent),transparent);animation:$-shine 1.6s linear infinite}
@keyframes $-shine{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
.$-phases{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;line-height:20px;color:var(--$-text-3)}
.$-phases>span{display:inline-flex;align-items:center;gap:6px}
.$-phases i{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;corner-shape:round;box-shadow:inset 0 0 0 1px currentColor;font-style:normal;font-size:10px}
.$-phases [data-state=doing]{color:var(--$-text);font-weight:500}
.$-phases [data-state=doing] i{box-shadow:none;background:var(--$-accent);color:var(--$-on-strong)}
.$-phases [data-state=done]{color:var(--$-success)}
.$-phases [data-state=done] i{box-shadow:none;background:color-mix(in srgb,var(--$-success) 16%,transparent)}
.$-lights{display:flex;flex-wrap:wrap;gap:6px}
.$-light{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px 0 4px;border-radius:999px;corner-shape:round;background:var(--$-soft);color:var(--$-text-2);font-size:12px;line-height:18px;white-space:nowrap}
.$-light small{color:var(--$-text-3);font-size:11px}
.$-light[data-state=todo]{opacity:.5}
.$-light[data-state=doing]{background:color-mix(in srgb,var(--$-accent) 12%,transparent);color:var(--$-text);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--$-accent) 50%,transparent);animation:$-pulse 1.4s ease-in-out infinite}
.$-light[data-tone=ok]{background:color-mix(in srgb,var(--$-success) 12%,transparent);color:var(--$-text)}
.$-light[data-tone=warn]{background:color-mix(in srgb,var(--$-warn) 14%,transparent);color:var(--$-text)}
.$-light[data-tone=danger]{background:color-mix(in srgb,var(--$-danger) 12%,transparent);color:var(--$-text)}
.$-light[data-tone=ok] small{color:var(--$-success)}.$-light[data-tone=warn] small{color:var(--$-warn)}.$-light[data-tone=danger] small{color:var(--$-danger)}
@keyframes $-pulse{0%,100%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--$-accent) 50%,transparent),0 0 0 0 color-mix(in srgb,var(--$-accent) 30%,transparent)}50%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--$-accent) 50%,transparent),0 0 0 5px transparent}}
.$-counters{display:flex;flex-wrap:wrap;gap:8px 24px}
.$-counters>div{display:flex;flex-direction:column}
.$-counters b{font-size:20px;line-height:28px;font-weight:600;font-variant-numeric:tabular-nums}
.$-counters span{color:var(--$-text-3);font-size:12px;line-height:18px}
/* 平台分布 */
.$-prows{display:flex;flex-direction:column;gap:2px}
.$-prow{display:grid;grid-template-columns:minmax(84px,120px) minmax(0,1fr) minmax(56px,auto);align-items:center;gap:12px;width:100%;padding:7px 8px;border:0;border-radius:var(--$-r-md);background:none;color:inherit;font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.$-prow:disabled{cursor:default}
.$-stackbar{display:flex;gap:2px;height:10px;min-width:0}
.$-stackbar span{display:block;flex:none;height:100%;border-radius:var(--$-r-xs)}
.$-pnum{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.$-pnum small{display:block;color:var(--$-text-3);font-size:11px;line-height:15px}
.$-pnone{display:flex;align-items:center;gap:6px;min-width:0;color:var(--$-text-3);font-size:12px;line-height:18px}
/* 负面在骂什么 */
.$-sevbar{display:flex;gap:2px;height:28px}
.$-sevbar span{display:flex;align-items:center;flex:none;min-width:4px;padding:0 8px;border-radius:var(--$-r-xs);font-size:12px;line-height:18px;font-weight:600;white-space:nowrap}
.$-arows{display:flex;flex-direction:column;gap:2px}
.$-arow{display:grid;grid-template-columns:minmax(44px,76px) minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;padding:4px 6px;border:0;border-radius:var(--$-r-sm);background:none;color:inherit;font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.$-arow>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-sub-title{margin:0;color:var(--$-text-2);font-size:12px;line-height:18px;font-weight:500}
.$-calm{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:140px;color:var(--$-text-2);font-size:13px;text-align:center}
.$-calm svg{color:var(--$-success)}
/* 高频词 */
.$-cloud{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0}
.$-word{display:inline-flex;align-items:baseline;gap:4px;padding:2px 12px;border:0;border-radius:999px;corner-shape:round;background:color-mix(in srgb,var(--$-neg) var(--a,8%),transparent);color:var(--$-text);font:inherit;line-height:1.5;cursor:pointer;white-space:nowrap}
.$-word small{color:var(--$-text-3);font-size:11px;font-weight:400;font-variant-numeric:tabular-nums}
/* 最该看的几条 */
.$-worst{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))}
.$-wcard{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;padding:14px 16px 12px 20px;border:0;border-radius:var(--$-r-lg);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line);color:inherit;font:inherit;text-align:left;cursor:pointer;overflow:hidden;transition:box-shadow 120ms ease,transform 120ms ease}
.$-wcard::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c)}
.$-wtop{display:flex;align-items:center;gap:8px;min-width:0;font-size:13px}
.$-wrank{margin-left:auto;color:var(--$-text-3);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.$-wreason{font-size:15px;line-height:22px;font-weight:600}
.$-wfoot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin-top:auto;padding-top:4px;color:var(--$-text-3);font-size:12px;line-height:18px}
/* 全部评论：筛选和列表 */
.$-frow{display:grid;grid-template-columns:40px minmax(0,1fr);gap:8px 12px;align-items:start}
.$-flabel{padding-top:5px;color:var(--$-text-3);font-size:12px;line-height:20px;white-space:nowrap}
.$-chips{display:flex;flex-wrap:wrap;gap:6px}
.$-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px 0 10px;border:0;border-radius:999px;corner-shape:round;background:var(--$-soft);color:var(--$-text-2);font:inherit;font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer}
.$-chip>i{flex:none;width:8px;height:8px;border-radius:50%;corner-shape:round}
.$-chip b{color:var(--$-text);font-weight:600;font-variant-numeric:tabular-nums}
.$-chip small{color:var(--$-danger);font-size:11px;font-variant-numeric:tabular-nums}
.$-chip[data-empty=true]{opacity:.5}
.$-chip[aria-pressed=true]{background:var(--$-text);color:var(--$-bg)}
.$-chip[aria-pressed=true] b{color:var(--$-bg)}
.$-chip-x{padding-right:6px}
.$-mix{display:flex;gap:2px;height:8px;border-radius:999px;overflow:hidden}
.$-mix span{display:block;min-width:2px;height:100%}
.$-items{display:flex;flex-direction:column}
.$-irow{position:relative;display:grid;grid-template-columns:84px minmax(0,1fr) minmax(150px,220px);gap:6px 16px;width:100%;padding:12px 8px 12px 18px;border:0;border-bottom:.5px solid var(--$-line);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.$-irow:last-child{border-bottom:0}
.$-irow::before{content:"";position:absolute;left:4px;top:14px;bottom:14px;width:3px;border-radius:2px;background:var(--c)}
.$-irow-sent,.$-irow-main{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.$-irow-main b{font-size:14px;line-height:22px;font-weight:600}
.$-irow-meta{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0;color:var(--$-text-3);font-size:12px;line-height:18px;text-align:right}
.$-irow-line{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:2px 10px;max-width:100%}
.$-irow-line>span{white-space:nowrap}
/* 设置页：一个监控对象一行 */
.$-target{display:grid;grid-template-columns:minmax(120px,1fr) minmax(160px,2fr) auto;gap:8px;align-items:center}
/* 第一次打开 */
.$-welcome{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:24px 40px;align-items:center}
.$-eyebrow{margin:0;color:var(--$-accent);font-size:13px;line-height:20px;font-weight:600}
.$-welcome-title{margin:0;font-size:28px;line-height:38px;font-weight:600;font-family:var(--$-font-title)}
.$-howto{display:flex;flex-direction:column;gap:12px;margin:0;padding:0;list-style:none}
.$-howto li{display:flex;gap:12px;align-items:flex-start;font-size:13px;line-height:20px;color:var(--$-text-2)}
.$-howto li>i{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;corner-shape:round;background:color-mix(in srgb,var(--$-accent) 14%,transparent);color:var(--$-accent);font-style:normal;font-size:12px;font-weight:600}
.$-howto b{display:block;color:var(--$-text);font-size:14px;font-weight:500}
.$-radar{position:relative;width:min(300px,100%);aspect-ratio:1;margin:0 auto}
.$-radar svg{position:absolute;inset:0;width:100%;height:100%}
.$-sweep{position:absolute;inset:0;border-radius:50%;corner-shape:round;background:conic-gradient(from 0deg,color-mix(in srgb,var(--$-accent) 30%,transparent),transparent 22%,transparent);animation:$-spin 5s linear infinite}
.$-blip{position:absolute;transform:translate(-50%,-50%);animation:$-blink 5s ease-in-out infinite}
@keyframes $-blink{0%,100%{opacity:.55}50%{opacity:1}}
.$-radar-dot{position:absolute;left:50%;top:50%;width:12px;height:12px;border-radius:50%;corner-shape:round;background:var(--$-accent);transform:translate(-50%,-50%);box-shadow:0 0 0 6px color-mix(in srgb,var(--$-accent) 18%,transparent)}
@media (hover:hover){
.$-prow:hover:not(:disabled),.$-arow:hover{background:var(--$-soft)}
.$-wcard:hover{box-shadow:inset 0 0 0 .5px var(--$-card-line),var(--$-shadow-2);transform:translateY(-1px)}
.$-irow:hover{background:var(--$-soft)}
.$-chip:hover:not([aria-pressed=true]){color:var(--$-text)}
.$-word:hover{background:color-mix(in srgb,var(--$-neg) calc(var(--a,8%) + 10%),transparent)}
}
@media (prefers-reduced-motion:reduce){.$-sweep,.$-blip,.$-light[data-state=doing],.$-pbar i::after{animation:none}.$-wcard{transition:none}}
@container $-shell (max-width:1080px){
.$-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
.$-duo,.$-duo-21{grid-template-columns:minmax(0,1fr)}
}
@container $-shell (max-width:900px){
.$-board{grid-template-columns:minmax(0,1fr);padding:18px}
.$-welcome{grid-template-columns:minmax(0,1fr)}
.$-radar{width:min(220px,100%)}
}
@container $-shell (max-width:760px){
.$-irow{grid-template-columns:72px minmax(0,1fr)}
.$-irow-meta{grid-column:2;flex-direction:row;flex-wrap:wrap;align-items:center;gap:4px 12px;text-align:left}
.$-irow-line{justify-content:flex-start}
.$-headline{font-size:24px;line-height:34px}.$-headline b{font-size:32px}
}
@container $-shell (max-width:560px){
.$-target{grid-template-columns:minmax(0,1fr)}
.$-kpis{grid-template-columns:minmax(0,1fr)}
.$-donut{flex-wrap:wrap}
.$-prow{grid-template-columns:minmax(72px,96px) minmax(0,1fr) auto;gap:8px}
}
`

    // ---- 几个对照表
    const PLAT = { weibo: '微博', bilibili: 'B 站', zhihu: '知乎', xhs: '小红书', douyin: '抖音', wechat: '公众号', news: '新闻资讯' }
    /** 平台小方块上的字。 */
    const PLAT_GLYPH = { weibo: '微', bilibili: 'B', zhihu: '知', xhs: '红', douyin: '抖', wechat: '公', news: '新' }
    const SENT = { neg: ['在骂', 'danger'], neu: ['中性', undefined], pos: ['夸', 'success'], unrelated: ['无关', 'outline'], unknown: ['没判断', 'warn'] }
    const LINK_STATUS = {
      ok: ['免费可用', 'success'], ready: ['已登录', 'success'], login: ['需要登录', 'warn'], waiting: ['等你登录', 'warn'], expired: ['登录过期', 'danger'],
      captcha: ['被验证码挡住', 'danger'], blocked: ['暂时拿不到', undefined], error: ['出错了', 'danger'], unknown: ['还没检查', 'outline'],
    }
    /** 这几种状态算「没连上」：要登录、等登录、过期、被验证码挡住。 */
    const NEED_CONNECT = ['login', 'waiting', 'expired', 'captcha']
    const VIA = { free: '免费接口', browser: '浏览器窗口', paid: '付费接口' }
    const SEV_LABEL = { 1: '轻微吐槽', 2: '明确不满', 3: '严重' }
    /** 外观段的颜色变量（页面 JS 里写颜色都走它）：v('neg') → var(--rr-neg) */
    const v = name => `var(--${P}-${name})`
    const sevColor = n => v(`sev-${Math.min(3, Math.max(1, Number(n) || 1))}`)
    const SENT_COLOR = { neg: v('neg'), neu: v('neu'), pos: v('pos'), unknown: v('unk'), unrelated: v('line-2') }
    const sentColor = (s, sev) => (s === 'neg' ? sevColor(sev) : SENT_COLOR[s] ?? v('line-2'))
    /** 情绪走势图里一根柱子从下往上叠的三层。 */
    const STACK = [{ key: 'neg', label: '骂', color: v('neg') }, { key: 'neu', label: '中性', color: v('neu') }, { key: 'pos', label: '夸', color: v('pos') }]

    const SentTag = ({ value }) => h(Tag, { tone: SENT[value]?.[1] }, SENT[value]?.[0] ?? value)
    const LinkTag = ({ value }) => h(Tag, { tone: LINK_STATUS[value]?.[1] }, LINK_STATUS[value]?.[0] ?? value)
    /** 严重程度：三根从矮到高的小条，亮几根就是几级；label 写 true 时后面跟一句「明确不满」这样的字。 */
    const Sev = ({ n, label }) => h('span', { className: cls('sev'), title: `严重程度 ${n} / 3：${SEV_LABEL[n] ?? ''}`, role: 'img', 'aria-label': `严重程度 ${n} / 3` },
      h('span', { className: cls('sev-bars') }, [1, 2, 3].map(i => h('i', { key: i, style: i <= n ? { background: sevColor(n) } : undefined }))),
      label ? h('span', { className: cls('sev-text') }, SEV_LABEL[n]) : null)
    /** 平台小方块 + 名字。 */
    const PlatBadge = ({ k, size = 20, off }) => h('span', { className: cls('pb'), 'data-off': off || undefined, style: { '--s': `${size}px`, background: v(`p-${k}`) }, 'aria-hidden': true }, PLAT_GLYPH[k] ?? '·')
    const PlatName = ({ k, size, off }) => h('span', { className: cls('pname') }, h(PlatBadge, { k, size, off }), h('span', null, PLAT[k] ?? k))
    const two = n => String(n).padStart(2, '0')
    const fmtTime = iso => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}` }
    const fmtDay = date => `${date.slice(5)} 周${'日一二三四五六'[new Date(`${date}T00:00:00`).getDay()]}`
    const fmtNum = n => (n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万` : String(n))
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
    const splitWords = text => String(text ?? '').split(/[,，、\n]/).map(x => x.trim()).filter(Boolean)
    /** 点赞、评论、转发（有数才显示）。 */
    const Eng = ({ r }) => [['heart', r.likes, '点赞'], ['chat', r.comments, '评论'], ['share', r.shares, '转发']].filter(([, n]) => Number(n) > 0)
      .map(([icon, n, label]) => h('span', { key: icon, className: cls('eng'), title: `${label} ${n}` }, h(Icon, { name: icon, size: 13 }), fmtNum(Number(n))))

    /** 今天骂你的条数，给左边导航上的红色数字用。 */
    const negToday = makeStore(0)
    /** 从看板点进「全部评论」时带过去的筛选（点了某个平台、某个词、某个方面）。 */
    const listPreset = makeStore(null)
    const openList = preset => { listPreset.set(preset); route.set('list') }

    // ---- 画图用的小工具（不引外部图表库，全用 SVG 自己画）

    /**
     * 图表外框：量自己有多宽（窗口变了会重画），管悬停提示。
     *   const c = useChart()；h('div', { ref: c.ref, className: cls('chart') }, …图…, c.tipNode)
     *   图上的东西：onMouseMove: e => c.show(e, 提示内容), onMouseLeave: c.hide
     */
    function useChart() {
      const ref = useRef(null)
      const [w, setW] = useState(0)
      const [tip, setTip] = useState(null)
      useLayoutEffect(() => {
        const el = ref.current
        if (!el) return undefined
        setW(el.clientWidth)
        if (typeof ResizeObserver === 'undefined') return undefined
        const ro = new ResizeObserver(entries => setW(Math.round(entries[0].contentRect.width)))
        ro.observe(el)
        return () => ro.disconnect()
      }, [])
      const show = (e, body) => {
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        // 键盘聚焦时没有鼠标位置，就放在那个东西的正上方
        const box = e.clientX === undefined ? e.currentTarget.getBoundingClientRect() : null
        const x = box ? box.left + box.width / 2 - r.left : e.clientX - r.left
        const y = box ? box.top - r.top : e.clientY - r.top
        setTip({ x, y, w: r.width, body })
      }
      const hide = () => setTip(null)
      const tipNode = tip ? h('div', { className: cls('tip'), role: 'tooltip', 'data-below': tip.y < 72 || undefined, style: { left: Math.max(0, Math.min(Math.max(tip.x, 80), tip.w - 80)), top: tip.y } }, tip.body) : null
      return { ref, w, show, hide, tipNode }
    }
    /** 提示框里的内容：标题、几行「色块 名字 数字」、最下面一行说明。 */
    const TipBody = ({ title, rows = [], foot }) => h(Fragment, null, h('b', null, title),
      rows.map(r => h('div', { key: r.label, className: cls('tip-row') }, r.color ? h('i', { style: { background: r.color } }) : null, h('span', null, r.label), h('span', null, r.value))),
      foot ? h('div', { className: cls('tip-foot') }, foot) : null)
    /** 纵轴取整：最大 7 → 0 2 4 6 8。 */
    function niceScale(max, count = 4) {
      if (!(max > 0)) return { top: count, ticks: Array.from({ length: count + 1 }, (_, i) => i) }
      const raw = max / count
      const mag = 10 ** Math.floor(Math.log10(raw))
      const step = Math.max(1, [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw))
      const top = Math.ceil(max / step) * step
      const ticks = []
      for (let x = 0; x <= top + 1e-9; x += step) ticks.push(Math.round(x))
      return { top, ticks }
    }
    /** 柱子：上面两个角是圆的，底下是方的。 */
    const colPath = (x, y, w, hh, r) => {
      const k = Math.min(r, w / 2, hh)
      return `M${x},${y + hh}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + hh}Z`
    }
    const Legend = ({ items }) => h('div', { className: cls('legend') }, items.map(it => h('span', { key: it.label }, h('i', { style: { background: it.color } }), it.label, it.value !== undefined ? h('b', null, it.value) : null)))

    /**
     * 每天一根的堆叠柱：从下往上是 骂 / 中性 / 夸。没检查过的日子在底下画一个小点。
     * series: [{ date, neg, neu, pos, unknown, checked }]；compact 是「全部评论」上面那个矮的。
     */
    function StackColumns({ series, height = 220, compact, today, label }) {
      const c = useChart()
      const [hover, setHover] = useState(-1)
      const W = c.w
      const n = series.length
      const padL = compact ? 2 : 30
      const padR = 2
      const padT = 8
      const padB = compact ? 18 : 24
      const plotW = Math.max(1, W - padL - padR)
      const plotH = height - padT - padB
      const sum = s => STACK.reduce((a, k) => a + (s[k.key] || 0), 0)
      const { top, ticks } = niceScale(Math.max(0, ...series.map(sum)), compact ? 2 : 4)
      const slot = plotW / Math.max(1, n)
      const bw = Math.max(2, Math.min(24, slot * 0.62))
      const y = val => padT + plotH - (val / top) * plotH
      const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 48))))
      const tipOf = s => h(TipBody, {
        title: s.date === today ? `今天（${fmtDay(s.date)}）` : fmtDay(s.date),
        rows: s.checked === false ? [] : [...STACK.map(k => ({ label: k.label, value: s[k.key] || 0, color: k.color })), ...(s.unknown ? [{ label: '没判断', value: s.unknown, color: v('unk') }] : [])],
        foot: s.checked === false ? '这天没检查' : sum(s) ? `负面占比 ${pct(s.neg, sum(s))}%` : '这天没发现提到你的',
      })
      const svg = W ? h('svg', { width: W, height, role: 'img', 'aria-label': label },
        // 横线和左边的刻度
        ticks.map(tk => h('g', { key: `t${tk}` },
          (!compact || tk === 0) ? h('line', { x1: padL, x2: W - padR, y1: y(tk), y2: y(tk), style: { stroke: tk === 0 ? v('line-2') : v('line') }, strokeWidth: 1 }) : null,
          !compact ? h('text', { x: padL - 8, y: y(tk) + 4, textAnchor: 'end', style: { fill: v('text-3') } }, tk) : null)),
        series.map((s, i) => {
          const cx = padL + i * slot + slot / 2
          const x0 = cx - bw / 2
          let base = padT + plotH
          const total = sum(s)
          const segs = STACK.filter(k => s[k.key] > 0)
          return h('g', { key: s.date },
            hover === i ? h('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH, style: { fill: v('soft') }, rx: 4 }) : null,
            s.checked === false ? h('circle', { cx, cy: padT + plotH - 4, r: 2, style: { fill: v('line-2') } }) : null,
            segs.map((k, j) => {
              const hh = (s[k.key] / top) * plotH
              const last = j === segs.length - 1
              const drawn = last ? hh : Math.max(1, hh - 2) // 两层之间留 2px 缝
              const yy = base - hh
              base -= hh
              return last
                ? h('path', { key: k.key, d: colPath(x0, yy, bw, drawn, Math.min(4, bw / 2)), style: { fill: k.color } })
                : h('rect', { key: k.key, x: x0, y: yy + (hh - drawn), width: bw, height: drawn, style: { fill: k.color } })
            }),
            // 日期：放得下几个放几个，今天一定写
            (i % every === (n - 1) % every || i === n - 1) ? h('text', { x: cx, y: height - 6, textAnchor: 'middle', style: { fill: s.date === today ? v('text') : v('text-3'), fontWeight: s.date === today ? 600 : 400 } }, s.date === today ? '今天' : s.date.slice(5)) : null)
        }),
        // 鼠标停上去的感应区：整列都算
        series.map((s, i) => h('rect', {
          key: `hit${s.date}`, x: padL + i * slot, y: padT, width: slot, height: plotH + padB, style: { fill: 'transparent' },
          onMouseMove: e => { setHover(i); c.show(e, tipOf(s)) }, onMouseLeave: () => { setHover(-1); c.hide() },
        }))) : null
      return h('div', { ref: c.ref, className: cls('chart'), style: { height } }, svg, c.tipNode)
    }

    /** 迷你走势线：灰线 + 淡淡的底色，最后一天是彩色的点。没检查过的日子线断开。 */
    function Spark({ points, color, unit = '', height = 36 }) {
      const c = useChart()
      const W = c.w
      const vals = points.map(p => p.value).filter(x => x !== null && x !== undefined)
      const max = Math.max(1, ...vals)
      const x = i => 4 + (i / Math.max(1, points.length - 1)) * Math.max(1, W - 8)
      const y = val => 4 + (height - 8) * (1 - val / max)
      const runs = []
      let cur = []
      points.forEach((p, i) => {
        if (p.value === null || p.value === undefined) { if (cur.length) runs.push(cur); cur = [] } else cur.push([x(i), y(p.value)])
      })
      if (cur.length) runs.push(cur)
      const last = points.length - 1
      const lastVal = points[last]?.value
      const slot = Math.max(1, W / Math.max(1, points.length))
      return h('div', { ref: c.ref, className: cls('chart'), style: { height } }, W ? h('svg', { width: W, height, 'aria-hidden': true },
        runs.map((r, i) => h('g', { key: i },
          r.length > 1 ? h('path', { d: `M${r[0][0]},${height}${r.map(([a, b]) => `L${a},${b}`).join('')}L${r.at(-1)[0]},${height}Z`, style: { fill: color, fillOpacity: 0.1 } }) : null,
          h('path', { d: r.map(([a, b], j) => `${j ? 'L' : 'M'}${a},${b}`).join(''), style: { stroke: v('text-3'), fill: 'none' }, strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' }))),
        lastVal !== null && lastVal !== undefined ? h('circle', { cx: x(last), cy: y(lastVal), r: 4, style: { fill: color, stroke: v('card') }, strokeWidth: 2 }) : null,
        points.map((p, i) => h('rect', { key: p.date, x: x(i) - slot / 2, y: 0, width: slot, height, style: { fill: 'transparent' }, onMouseMove: e => c.show(e, h(TipBody, { title: fmtDay(p.date), foot: p.value === null || p.value === undefined ? '这天没检查' : `${p.value}${unit}` })), onMouseLeave: c.hide }))) : null, c.tipNode)
    }

    /** 环形图：parts = [{ key, label, value, color }]，中间写一个大数字。 */
    function Donut({ parts, size = 148, thick = 16, center, sub }) {
      const c = useChart()
      const total = parts.reduce((a, p) => a + p.value, 0)
      const r = (size - thick) / 2
      const C = 2 * Math.PI * r
      const nonzero = parts.filter(p => p.value > 0)
      const gap = nonzero.length > 1 ? 2 : 0
      let acc = 0
      return h('div', { className: cls('donut') },
        h('div', { ref: c.ref, className: cls('donut-ring', 'chart'), style: { width: size, height: size } },
          h('svg', { width: size, height: size, role: 'img', 'aria-label': `${sub}：${parts.map(p => `${p.label} ${p.value}`).join('，')}` },
            h('g', { transform: `rotate(-90 ${size / 2} ${size / 2})` },
              h('circle', { cx: size / 2, cy: size / 2, r, style: { fill: 'none', stroke: v('soft') }, strokeWidth: thick }),
              nonzero.map(p => {
                const len = (p.value / total) * C
                const dash = Math.max(0.5, len - gap)
                const el = h('circle', {
                  key: p.key, cx: size / 2, cy: size / 2, r, strokeWidth: thick, strokeDasharray: `${dash} ${C - dash}`, strokeDashoffset: -acc, style: { fill: 'none', stroke: p.color },
                  onMouseMove: e => c.show(e, h(TipBody, { title: p.label, rows: [{ label: '条数', value: p.value, color: p.color }], foot: `占 ${pct(p.value, total)}%` })), onMouseLeave: c.hide,
                })
                acc += len
                return el
              }))),
          h('div', { className: cls('donut-center') }, h('b', null, center ?? total), h('span', null, sub)),
          c.tipNode),
        h('div', { className: cls('donut-legend') }, parts.map(p => h('div', { key: p.key }, h('i', { style: { background: p.color } }), h('span', null, p.label), h('b', null, p.value, total ? h('small', null, `${pct(p.value, total)}%`) : null)))))
    }

    /** 和前 7 天平均比：多了、少了、差不多。upIsBad：多了算坏事（骂的条数）。 */
    function deltaOf(cur, prev, { unit = ' 条', upIsBad = false, neutral = false } = {}) {
      if (cur === null || cur === undefined) return { tone: 'none', text: '今天还没数据' }
      if (prev === null || prev === undefined) return { tone: 'none', text: '前几天没数据，先不比' }
      const diff = Math.round((cur - prev) * 10) / 10
      if (Math.abs(diff) < 0.1 || (prev > 0 && Math.abs(diff) / prev < 0.05)) return { tone: 'flat', text: `和前 7 天平均差不多（${prev}${unit}）` }
      const up = diff > 0
      return { tone: neutral ? 'flat' : up === upIsBad ? 'bad' : 'good', icon: up ? 'arrowUp' : 'arrowDown', text: `比前 7 天平均${up ? '多' : '少'} ${Math.abs(diff)}${unit}` }
    }
    /** 一张大数字卡：名字、数字、和前几天比、迷你走势线。 */
    const Kpi = ({ icon, label, value, unit, delta, tone, children, foot }) => h('div', { className: cls('kpi'), 'data-tone': tone },
      h('span', { className: cls('kpi-label') }, h(Icon, { name: icon, size: 15 }), label),
      h('span', { className: cls('kpi-value') }, value, unit ? h('small', null, unit) : null),
      delta ? h('span', { className: cls('delta'), 'data-tone': delta.tone }, delta.icon ? h(Icon, { name: delta.icon, size: 13 }) : null, delta.text) : null,
      children,
      foot ? h('span', { className: cls('kpi-foot') }, foot) : null)

    // ---- 第一次打开：先填监控对象
    /** 雷达动画：一圈圈的线，扫过去，七个平台在上面一闪一闪。 */
    function RadarArt() {
      const keys = Object.keys(PLAT)
      return h('div', { className: cls('radar'), 'aria-hidden': true },
        h('svg', { viewBox: '0 0 100 100' },
          [48, 34, 20].map(rr => h('circle', { key: rr, cx: 50, cy: 50, r: rr, style: { fill: 'none', stroke: v('line-2') }, strokeWidth: 0.4 })),
          h('line', { x1: 2, x2: 98, y1: 50, y2: 50, style: { stroke: v('line') }, strokeWidth: 0.4 }),
          h('line', { x1: 50, x2: 50, y1: 2, y2: 98, style: { stroke: v('line') }, strokeWidth: 0.4 })),
        h('div', { className: cls('sweep') }),
        h('span', { className: cls('radar-dot') }),
        keys.map((k, i) => {
          const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2
          const rr = i % 2 ? 26 : 40
          return h('span', { key: k, className: cls('blip'), style: { left: `${50 + rr * Math.cos(a)}%`, top: `${50 + rr * Math.sin(a)}%`, animationDelay: `${(i / keys.length) * 5}s` } }, h(PlatBadge, { k, size: 26 }))
        }))
    }

    function Onboarding({ onDone }) {
      const [name, setName] = useState('')
      const [keywords, setKeywords] = useState('')
      const { busy, error, run } = useAction()
      const save = () => run(async () => {
        await api('saveSettings', { targets: [{ name, keywords: splitWords(keywords) }] })
        toast('记下了，先查一次')
        onDone()
      })
      return h(Page, { width: 1080 },
        h('div', { className: cls('welcome') },
          h('div', { className: cls('stack') },
            h('p', { className: cls('eyebrow') }, '口碑雷达'),
            h('h1', { className: cls('welcome-title') }, '先告诉我要盯谁'),
            h('p', { className: cls('muted') }, '一个品牌、一个账号或一个人都行。之后每天会去微博、B 站、知乎、小红书、抖音、公众号和新闻里找提到它的内容，看看有没有人在骂。'),
            h(Card, null,
              h(Field, { label: '名称', hint: '最常用的叫法，比如品牌名、账号名、你的名字', error: error?.message }, h(Input, { value: name, onChange: setName, placeholder: '比如：庞巴迪', autoFocus: true, onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && name.trim()) save() } })),
              h(Field, { label: '别名、产品名（可以不填）', hint: '用逗号隔开，比如：Can-Am，Spyder，Ryker' }, h(Input, { value: keywords, onChange: setKeywords, placeholder: '别名1，别名2' })),
              h(Row, null, h(Btn, { kind: 'primary', lg: true, icon: 'radar', busy, disabled: !name.trim(), onClick: save }, '保存，开始盯'), h('span', { className: cls('faint') }, '以后在「设置」里还能改、能再加几个'))),
            h('ol', { className: cls('howto') },
              h('li', null, h('i', null, '1'), h('div', null, h('b', null, '全网找'), '七个平台挨个搜你的名字和别名，帖子下面的评论也会看。')),
              h('li', null, h('i', null, '2'), h('div', null, h('b', null, '模型判断'), '用 DSH 里配好的模型，一条条看是在骂、中性还是夸，骂的是哪方面、有多严重。')),
              h('li', null, h('i', null, '3'), h('div', null, h('b', null, '每天看一眼'), '「今天」页一眼看懂局势：骂的多不多、在哪骂、骂什么，最该看的几条放在最前面。')))),
          h('div', { className: cls('stack') }, h(RadarArt), h('div', { className: cls('chips'), style: { justifyContent: 'center' } }, Object.keys(PLAT).map(k => h('span', { key: k, className: cls('light') }, h(PlatBadge, { k, size: 20 }), PLAT[k]))))))
    }

    // ---- 看一条的原文，顺手改「判错了」
    function ItemDrawer({ id, onClose, onChanged }) {
      const one = useData(() => api('item', { id }), [id])
      const { busy, run } = useAction()
      const it = one.data
      const fix = sentiment => run(async () => {
        await api('setSentiment', { id, sentiment })
        toast(sentiment ? '改好了' : '改回模型的判断了')
        one.reload()
        onChanged?.()
      })
      const head = it ? h(Stack, null, h('h2', { className: cls('modal-title') }, h(PlatName, { k: it.platform, size: 22 }), h('span', { className: cls('faint') }, it.kind === 'comment' ? ' · 评论' : ' · 帖子')),
        h(Row, null, h(SentTag, { value: it.sentiment }), it.sentiment === 'neg' ? h(Sev, { n: it.severity, label: true }) : null, it.aspect ? h(Tag, { tone: 'outline' }, it.aspect) : null, it.manual ? h(Tag, { tone: 'info' }, '你改过') : null)) : null
      return h(Drawer, { title: '原文', head, onClose, width: 480 },
        one.error ? h(ErrorBox, { error: one.error, onRetry: one.reload }) : !it ? h(Loading) : h(Fragment, null,
          it.reason ? h(Alert, { tone: it.sentiment === 'neg' ? 'danger' : undefined }, `模型说：${it.reason}`) : null,
          it.judgeError ? h(Alert, { tone: 'warn' }, `这条没判断成：${it.judgeError}。下次检查会再试。`) : null,
          it.parentTitle ? h('p', { className: cls('muted') }, `评论在「${it.parentTitle}」下面`) : null,
          it.title ? h('h3', { className: cls('h2') }, it.title) : null,
          h('p', { className: cls('pre') }, it.text || '（没有正文）'),
          h(KV, { items: [
            ['作者', it.author], ['发布时间', fmtTime(it.time) || '不知道'], ['发现时间', fmtTime(it.foundAt)],
            ['点赞', it.stats?.likes ?? null], ['评论数', it.stats?.comments ?? null], ['转发', it.stats?.shares ?? null], ['播放', it.stats?.views ?? null],
            ['搜的词', it.keyword], ['怎么拿到的', VIA[it.via] ?? it.via],
          ] }),
          it.url ? h(Row, null, h(Btn, { href: it.url, target: '_blank', icon: 'link' }, '去原帖看')) : null,
          h(Field, { label: '判错了？改成', group: true, hint: '改了以后统计和日报的数字都按你改的算' },
            h(Seg, { value: it.manualSentiment, disabled: busy, onChange: fix, options: [{ value: 'neg', label: '在骂', tone: 'danger' }, { value: 'neu', label: '中性' }, { value: 'pos', label: '夸', tone: 'success' }, { value: 'unrelated', label: '和我无关' }] })),
          it.manual ? h(Row, null, h(Btn, { sm: true, kind: 'ghost', disabled: busy, onClick: () => fix(null) }, '改回模型的判断')) : null))
    }

    // ---- 检查进度：进度条、三个阶段、各平台逐个点亮
    const lightTone = st => (['ok', 'ready'].includes(st) ? 'ok' : ['login', 'waiting', 'expired'].includes(st) ? 'warn' : ['captcha', 'error'].includes(st) ? 'danger' : undefined)
    function ProgressPanel({ p }) {
      const plats = p.plats ?? []
      const total = p.platformsTotal || plats.length
      const searching = !total || p.platformsDone < total
      const writing = /日报/.test(p.step ?? '')
      const percent = !total ? 3 : searching ? 4 + (66 * (p.platformsDone + (p.platform ? 0.5 : 0))) / total : writing ? 96 : p.toJudge ? 70 + (25 * (p.judged ?? 0)) / p.toJudge : 92
      const phase = searching ? 0 : writing ? 2 : 1
      const where = p.platform ? PLAT[p.platform] : ''
      return h('section', { className: cls('prog'), 'aria-live': 'polite' },
        h('div', { className: cls('prog-head') }, h(Spin), h('b', { className: cls('h2') }, '正在检查'), h('span', { className: cls('muted') }, p.step || (where ? `正在搜${where}` : '准备中')),
          h('span', { className: cls('prog-pct') }, `${Math.round(percent)}%`)),
        h('div', { className: cls('pbar'), role: 'progressbar', 'aria-valuenow': Math.round(percent), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${percent}%` } })),
        h('div', { className: cls('phases') }, ['搜各平台', '模型判断', '写日报'].map((name, i) => h('span', { key: name, 'data-state': i < phase ? 'done' : i === phase ? 'doing' : 'todo' },
          h('i', null, i < phase ? h(Icon, { name: 'check', size: 11 }) : i + 1), name, i === 0 && total ? h('small', { className: cls('faint') }, `${Math.min(p.platformsDone, total)} / ${total}`) : null, i === 1 && p.toJudge ? h('small', { className: cls('faint') }, `${p.judged ?? 0} / ${p.toJudge}`) : null))),
        plats.length ? h('div', { className: cls('lights') }, plats.map(x => h('span', { key: x.key, className: cls('light'), 'data-state': x.state, 'data-tone': x.state === 'done' ? lightTone(x.paid === 'ok' ? 'ok' : x.status) : undefined },
          x.state === 'doing' ? h('span', { style: { display: 'inline-flex', width: 20, justifyContent: 'center' } }, h(Spin, { sm: true })) : h(PlatBadge, { k: x.key, size: 20, off: x.state === 'todo' }),
          x.name, x.state === 'done' ? h('small', null, x.fresh ? `+${x.fresh}` : x.status === 'ok' || x.status === 'ready' ? '没新的' : LINK_STATUS[x.status]?.[0] ?? '') : x.state === 'doing' ? h('small', null, '正在搜') : null))) : null,
        h('div', { className: cls('counters') },
          h('div', null, h('b', null, p.found ?? 0), h('span', null, '搜到')),
          h('div', null, h('b', null, p.fresh ?? 0), h('span', null, '新的')),
          h('div', null, h('b', null, p.toJudge ? `${p.judged ?? 0} / ${p.toJudge}` : '—'), h('span', null, '已判断'))),
        h('p', { className: cls('faint'), style: { margin: 0 } }, '小红书、抖音、微博、知乎会在插件自己的 Chrome 窗口里打开页面看，别关那个窗口；看完会自己关。'))
    }

    // ---- 「今天」页的几块
    const LEVEL = { danger: ['要马上处理', 'warn'], warn: ['需要留意', 'info'], ok: ['平稳', 'check'], idle: ['等第一次检查', 'clock'] }

    /** 最上面那块：今天的局势一句话、小结、今天的情绪构成。 */
    function Board({ d, running }) {
      const s = d.stats
      const k = d.board?.kpi
      const level = !d.lastRun && !s.total ? 'idle' : s.severe ? 'danger' : s.neg ? 'warn' : 'ok'
      const need = d.platforms.filter(p => p.on && NEED_CONNECT.includes(p.status) && p.paid?.status !== 'paid')
      const trend = { more: '比前几天多', less: '比前几天少', same: '和前几天差不多', none: '' }[s.trend]
      const headline = s.neg ? h(Fragment, null, '今天有 ', h('b', null, s.neg), ' 条在骂你') : s.total ? '今天没看到有人骂你' : d.lastRun ? '今天还没发现提到你的内容' : running ? '正在查第一次' : '还没检查过'
      const summary = d.report?.summary || (s.total
        ? `今天新发现 ${s.total} 条提到你的内容，确实在说你的 ${s.related} 条，其中夸你的 ${s.pos} 条${s.neg && trend ? `；骂的${trend}` : ''}。`
        : d.lastRun ? `上次检查 ${fmtTime(d.lastRun.endedAt ?? d.lastRun.startedAt)}，今天还没有新的。` : running ? `第一次要几分钟，查完这里会出结果；以后每天 ${d.auto.time} 会自动检查（DSH 开着就行）。` : `点右上角「立即检查」先看一次；以后每天 ${d.auto.time} 会自动检查（DSH 开着就行）。`)
      const parts = [
        { key: 'neg', label: '骂', value: k?.neg ?? s.neg, color: v('neg') },
        { key: 'neu', label: '中性', value: k?.neu ?? Math.max(0, s.related - s.neg - s.pos), color: v('neu') },
        { key: 'pos', label: '夸', value: k?.pos ?? s.pos, color: v('pos') },
        ...((k?.unknown ?? s.unjudged) ? [{ key: 'unknown', label: '没判断', value: k?.unknown ?? s.unjudged, color: v('unk') }] : []),
      ]
      return h('section', { className: cls('board'), 'data-level': level },
        h('div', { className: cls('board-text') },
          h('span', { className: cls('level') }, h(Icon, { name: LEVEL[level][1], size: 13 }), LEVEL[level][0], s.severe ? ` · ${s.severe} 条严重` : ''),
          h('h2', { className: cls('headline') }, headline),
          h('p', { className: cls('board-sum') }, summary),
          h('div', { className: cls('board-meta') },
            h('span', null, h(Icon, { name: 'eye', size: 13 }), `盯着：${d.targets.join('、')}`),
            d.lastRun ? h('span', null, h(Icon, { name: 'clock', size: 13 }), `上次检查 ${fmtTime(d.lastRun.endedAt ?? d.lastRun.startedAt)}`) : null,
            h('span', null, h(Icon, { name: 'calendar', size: 13 }), d.auto.enabled ? `每天 ${d.auto.time} 自动检查` : '自动检查已关'),
            d.report?.by === 'model' ? h('span', null, h(Icon, { name: 'spark', size: 13 }), '小结是模型写的') : null)),
        h(Donut, { parts, sub: '今天提到', center: parts.reduce((a, p) => a + p.value, 0) }),
        s.unjudged || need.length ? h('div', { className: cls('board-foot') },
          s.unjudged ? h(Alert, { tone: 'warn' }, `还有 ${s.unjudged} 条模型没判断成，下次检查会再试。`) : null,
          need.length ? h(Alert, { tone: 'warn', action: h(Btn, { sm: true, onClick: () => route.set('settings') }, '去连上') }, `${need.map(p => p.name).join('、')}${need.length > 1 ? '这几个平台' : ''}还没连上（要登录或被验证码挡住），这次没搜到它们。`) : null) : null)
    }

    /** 四张大数字卡。 */
    function KpiRow({ k }) {
      const spark = key => k.spark.map(p => ({ date: p.date, value: p.checked ? p[key] : null }))
      return h('div', { className: cls('kpis') },
        // 和上面环形图中间的数一致：算上还没判断的
        h(Kpi, { icon: 'chat', label: '今天提到', value: k.mentions + (k.unknown || 0), unit: '条', delta: deltaOf(k.mentions, k.prev.mentions, { neutral: true }) },
          h(Spark, { points: spark('mentions'), color: v('accent'), unit: ' 条' }),
          k.unknown ? h('span', { className: cls('kpi-foot') }, `其中 ${k.unknown} 条模型还没判断`) : null),
        h(Kpi, { icon: 'warn', label: '在骂', value: k.neg, unit: '条', tone: k.neg ? 'danger' : undefined, delta: deltaOf(k.neg, k.prev.neg, { upIsBad: true }) },
          h(Spark, { points: spark('neg'), color: v('neg'), unit: ' 条在骂' })),
        h(Kpi, { icon: 'chart', label: '负面占比', value: k.negShare === null ? '—' : k.negShare, unit: k.negShare === null ? '' : '%', delta: k.negShare === null ? { tone: 'none', text: '今天还没提到你的' } : deltaOf(k.negShare, k.prev.negShare, { unit: ' 个百分点', upIsBad: true }) },
          h('div', { className: cls('meter'), title: `相关的内容里，${k.negShare ?? 0}% 在骂` }, h('i', { style: { width: `${Math.min(100, k.negShare ?? 0)}%` } })),
          h('span', { className: cls('kpi-foot') }, '确实在说你的内容里，有多少在骂')),
        h(Kpi, { icon: 'flame', label: '负面互动量', value: fmtNum(k.engagement), delta: deltaOf(k.engagement, k.prev.engagement, { unit: '', upIsBad: true }), foot: '骂你的内容收到的点赞、评论、转发加起来。越高，看到的人越多' }))
    }

    function TrendPanel({ b, today }) {
      const [asTable, setAsTable] = useState(false)
      const t0 = b.totals
      const peak = b.series.reduce((a, s) => (s.neg > (a?.neg ?? 0) ? s : a), null)
      const checked = b.series.filter(s => s.checked).length
      return h(Card, {
        title: '情绪走势', note: `近 ${b.days} 天 · 检查过 ${checked} 天${peak ? ` · 骂得最多是 ${peak.date.slice(5)}（${peak.neg} 条）` : ''}`,
        action: h(Btn, { kind: 'ghost', sm: true, icon: asTable ? 'chart' : 'table', onClick: () => setAsTable(!asTable) }, asTable ? '看图' : '看数字'),
      },
      h(Legend, { items: [...STACK.map(k => ({ label: k.label, color: k.color, value: t0[k.key] })), { label: '没检查', color: v('line-2') }] }),
      asTable
        ? h(Table, { rowKey: 'date', rows: [...b.series].reverse(), columns: [
          { key: 'date', title: '日期', render: s => fmtDay(s.date) },
          { key: 'neg', title: '骂', num: true }, { key: 'neu', title: '中性', num: true }, { key: 'pos', title: '夸', num: true },
          { key: 'share', title: '负面占比', num: true, render: s => (s.checked ? (s.related ? `${pct(s.neg, s.related)}%` : '—') : '没检查') },
        ] })
        : h(StackColumns, { series: b.series, today, height: 260, label: `近 ${b.days} 天每天骂、中性、夸的条数` }))
    }

    /** 负面在骂什么：严重程度占比、骂的哪几方面。 */
    function NegPanel({ b }) {
      const negTotal = b.severity.reduce((a, x) => a + x.value, 0)
      const c = useChart()
      const maxA = Math.max(1, ...b.aspects.map(a => a.value))
      const range = String(b.days)
      return h(Card, { title: '负面在骂什么', note: `近 ${b.days} 天 · ${negTotal} 条` },
        !negTotal ? h('div', { className: cls('calm') }, h(Icon, { name: 'check', size: 28 }), h('b', null, '这段时间没人骂你'), h('span', { className: cls('faint') }, '有人骂的话，这里会分出轻重和骂的方面')) : h(Fragment, null,
          h('p', { className: cls('sub-title') }, '严重程度'),
          h('div', { ref: c.ref, className: cls('chart') },
            h('div', { className: cls('sevbar'), role: 'img', 'aria-label': b.severity.map(x => `${SEV_LABEL[x.level]} ${x.value} 条`).join('，') }, b.severity.filter(x => x.value > 0).map(x => {
              const share = x.value / negTotal
              return h('span', {
                key: x.level, tabIndex: 0, style: { width: `calc(${share * 100}% - 2px)`, background: sevColor(x.level), color: x.level === 1 ? v('text') : v('on-strong') },
                onMouseMove: e => c.show(e, h(TipBody, { title: SEV_LABEL[x.level], rows: [{ label: '条数', value: x.value, color: sevColor(x.level) }], foot: `占骂你的 ${pct(x.value, negTotal)}%` })), onMouseLeave: c.hide, onFocus: e => c.show(e, h(TipBody, { title: SEV_LABEL[x.level], foot: `${x.value} 条，占 ${pct(x.value, negTotal)}%` })), onBlur: c.hide,
              }, share >= 0.16 ? `${pct(x.value, negTotal)}%` : '')
            })),
            c.tipNode),
          h(Legend, { items: b.severity.map(x => ({ label: SEV_LABEL[x.level], color: sevColor(x.level), value: x.value })) }),
          b.aspects.length ? h(Fragment, null,
            h('p', { className: cls('sub-title'), style: { marginTop: 4 } }, '骂的哪方面（点一下看是哪几条）'),
            h('div', { className: cls('arows') }, b.aspects.map(a => h('button', { key: a.label, type: 'button', className: cls('arow'), onClick: () => openList({ sentiment: 'neg', aspect: a.label, range }), title: `${a.label}：${a.value} 条，其中严重 ${a.severe} 条` },
              h('span', null, a.label),
              h('span', { className: cls('stackbar') },
                a.severe ? h('span', { style: { width: `${(a.severe / maxA) * 100}%`, background: v('sev-3') } }) : null,
                a.value - a.severe ? h('span', { style: { width: `calc(${((a.value - a.severe) / maxA) * 100}% - ${a.severe ? 2 : 0}px)`, background: v('sev-2') } }) : null),
              h('span', { className: cls('num') }, a.value)))),
            h(Legend, { items: [{ label: '其中严重的', color: v('sev-3') }, { label: '不算严重的', color: v('sev-2') }] })) : null))
    }

    /** 平台分布：每个平台一行，骂 / 中性 / 夸叠成一根横条；没连上的标出来。 */
    function PlatformPanel({ b, platforms }) {
      const c = useChart()
      const on = platforms.filter(p => p.on)
      const rows = on.map(p => ({ ...p, ...(b.platforms.find(x => x.key === p.key) ?? { related: 0, neg: 0, neu: 0, pos: 0 }) }))
        .sort((x, y) => y.related - x.related || y.neg - x.neg)
      const max = Math.max(1, ...rows.map(r => r.related))
      const linked = on.filter(p => !NEED_CONNECT.includes(p.status) && !['error', 'blocked'].includes(p.status) || p.paid?.status === 'paid').length
      const range = String(b.days)
      return h(Card, { title: '平台分布', note: `近 ${b.days} 天 · ${on.length} 个平台里连上了 ${linked} 个` },
        h('div', { ref: c.ref, className: cls('chart') },
          h('div', { className: cls('prows') }, rows.map(r => {
            const broken = NEED_CONNECT.includes(r.status) && r.paid?.status !== 'paid'
            return h('button', {
              key: r.key, type: 'button', className: cls('prow'), disabled: !r.related,
              onClick: () => openList({ platform: r.key, range }),
              onMouseMove: r.related ? e => c.show(e, h(TipBody, { title: r.name, rows: STACK.map(k => ({ label: k.label, value: r[k.key], color: k.color })), foot: `负面占比 ${pct(r.neg, r.related)}% · 点一下看这些评论` })) : undefined,
              onMouseLeave: c.hide,
            },
            h(PlatName, { k: r.key }),
            r.related
              ? h('span', { className: cls('stackbar') }, STACK.filter(k => r[k.key] > 0).map((k, i, arr) => h('span', { key: k.key, style: { width: `calc(${(r[k.key] / max) * 100}% - ${i < arr.length - 1 ? 2 : 0}px)`, background: k.color } })))
              : h('span', { className: cls('pnone') }, broken ? h(Fragment, null, h(LinkTag, { value: r.status }), '没连上，搜不到') : r.status === 'unknown' ? '还没检查过' : '这段时间没搜到'),
            h('span', { className: cls('pnum') }, r.related ? r.related : '', r.related ? h('small', null, r.neg ? `骂 ${r.neg}` : '没人骂') : broken ? h(Btn, { kind: 'ghost', sm: true, onClick: e => { e.stopPropagation(); route.set('settings') } }, '去连上') : null))
          })),
          c.tipNode),
        h(Legend, { items: STACK.map(k => ({ label: k.label, color: k.color })) }))
    }

    /** 负面高频词：词越大说明出现在越多条骂你的内容里，点一个词去看那些评论。 */
    function WordsPanel({ b }) {
      const words = b.keywords ?? []
      const max = Math.max(1, ...words.map(w => w.value))
      const min = Math.min(max, ...words.map(w => w.value))
      const range = String(b.days)
      return h(Card, { title: '骂你时常说的词', note: words.length ? '字越大，出现在越多条里。点一个词，看说它的那些评论' : '' },
        !words.length ? h('div', { className: cls('calm') }, h(Icon, { name: 'chat', size: 26 }), h('span', null, b.totals.neg ? '骂你的还不多，凑不出常说的词' : '这段时间没人骂你'), h('span', { className: cls('faint') }, '同一个说法出现在两条以上，才会放到这里'))
          : h('div', { className: cls('cloud') }, words.map(w => {
            const k = max === min ? 0.5 : Math.sqrt((w.value - min) / (max - min))
            return h('button', { key: w.word, type: 'button', className: cls('word'), title: `${w.value} 条里说到「${w.word}」`, onClick: () => openList({ sentiment: 'neg', q: w.word, range }), style: { fontSize: `${Math.round(12 + k * 14)}px`, fontWeight: k > 0.6 ? 600 : 400, '--a': `${Math.round(6 + k * 18)}%` } },
              w.word, h('small', null, w.value))
          })))
    }

    /** 今天最该看的一条负面（卡片）。 */
    const WorstCard = ({ row: r, rank, onOpen }) => h('button', { type: 'button', className: cls('wcard'), style: { '--c': sevColor(r.severity) }, onClick: () => onOpen(r.id) },
      h('div', { className: cls('wtop') }, h(PlatName, { k: r.platform }), h('span', { className: cls('faint') }, r.kind === 'comment' ? '评论' : '帖子'), h('span', { className: cls('wrank') }, `#${rank}`)),
      h(Row, null, h(Sev, { n: r.severity, label: true }), r.aspect ? h(Tag, { tone: 'outline' }, r.aspect) : null, r.manual ? h(Tag, { tone: 'info' }, '你改过') : null),
      r.reason ? h('span', { className: cls('wreason') }, r.reason) : null,
      h('span', { className: cls('muted', 'clamp', 'clamp-3') }, r.title ? `${r.title}：${r.text}` : r.text),
      r.parentTitle ? h('span', { className: cls('faint', 'clamp') }, `在「${r.parentTitle}」下面`) : null,
      h('div', { className: cls('wfoot') }, h(Eng, { r }), h('span', { style: { marginLeft: 'auto' } }, [r.author, fmtTime(r.time)].filter(Boolean).join(' · '))))

    // ---- 「今天」页
    function TodayPage() {
      const [days, setDays] = useState('14')
      const ov = useData(() => api('overview', { days: Number(days) }), [days])
      const [prog, setProg] = useState(null)
      const [openId, setOpenId] = useState(null)
      const { busy, run } = useAction()
      const d = ov.data
      useEffect(() => { if (d) negToday.set(d.stats.neg); if (d?.progress?.running) setProg(d.progress) }, [d])
      // 检查时每 1.5 秒问一次进度，做完了刷新整页
      useEffect(() => {
        if (!prog?.running) return undefined
        const timer = setInterval(async () => {
          try {
            const p = await api('progress')
            setProg(p)
            if (!p.running) { ov.reload(); if (p.error) notify(`这次检查没做完：${p.error}`); else toast('检查完了') }
          } catch { /* 下一轮再问 */ }
        }, 1500)
        return () => clearInterval(timer)
      }, [prog?.running])
      const start = () => run(async () => { try { setProg(await api('check')) } catch (e) { notify(e.message) } })

      if (ov.error && !d) return h(Page, { title: '今天' }, h(ErrorBox, { error: ov.error, onRetry: ov.reload }))
      if (!d) return h(Loading)
      // 填完要盯谁就直接查第一次，不用再找「立即检查」
      if (!d.hasTargets) return h(Onboarding, { onDone: () => { ov.reload(); start() } })
      const running = Boolean(prog?.running)
      const b = d.board
      return h(Fragment, null,
        h(Page, { title: '今天', sub: fmtDay(d.today), width: 1240, actions: h(Btn, { kind: 'primary', icon: 'refresh', busy: busy || running, onClick: start }, running ? '正在检查' : '立即检查') },
          h(Board, { d, running }),
          running ? h(ProgressPanel, { p: prog }) : null,
          !b ? h(Alert, { tone: 'warn' }, '后台还是旧版本，图表出不来：重启一次 DSH 就好。') : h(Fragment, null,
            h(KpiRow, { k: b.kpi }),
            d.worst.length ? h(Fragment, null,
              h('div', { className: cls('sec') }, h('h2', { className: cls('sec-title') }, '今天最该看的几条'), h('span', { className: cls('faint') }, '按严重程度和互动量排，点一条看原文、改判断')),
              h('div', { className: cls('worst') }, d.worst.map((r, i) => h(WorstCard, { key: r.id, row: r, rank: i + 1, onOpen: setOpenId })))) : null,
            h('div', { className: cls('sec') }, h('h2', { className: cls('sec-title') }, '这段时间的局势'), h('span', { className: cls('grow') }),
              ov.loading ? h(Spin, { sm: true }) : null,
              h(Seg, { value: days, onChange: setDays, label: '看多少天', options: [{ value: '7', label: '近 7 天' }, { value: '14', label: '近 14 天' }, { value: '30', label: '近 30 天' }] })),
            h('div', { className: cls('duo', 'duo-21') }, h(TrendPanel, { b, today: d.today }), h(NegPanel, { b })),
            h('div', { className: cls('duo') }, h(PlatformPanel, { b, platforms: d.platforms }), h(WordsPanel, { b }))),
          h('p', { className: cls('faint') }, [
            `每天 ${d.auto.time} ${d.auto.enabled ? '自动检查' : '（自动检查已关）'}`,
            d.spend?.yuan ? `付费接口本月已用 ${d.spend.yuan.toFixed(2)} 元` : '',
            d.model ? `判断用的模型：${d.model}` : 'DSH 还没选默认模型，没法判断：去 DSH「设置 → 模型」选一个',
          ].filter(Boolean).join(' · '))),
        openId ? h(ItemDrawer, { id: openId, onClose: () => setOpenId(null), onChanged: ov.reload }) : null)
    }

    // ---- 「全部评论」页
    /** 列表里的一行：左边一条颜色（红的越深越严重），情绪、理由、正文，右边平台和时间。 */
    const ItemRow = ({ row: r, onOpen }) => h('button', { type: 'button', className: cls('irow'), style: { '--c': sentColor(r.sentiment, r.severity) }, onClick: () => onOpen(r.id) },
      h('div', { className: cls('irow-sent') }, h(SentTag, { value: r.sentiment }), r.sentiment === 'neg' ? h(Sev, { n: r.severity }) : null),
      h('div', { className: cls('irow-main') },
        r.reason ? h('b', null, r.reason, r.manual ? h('span', { className: cls('faint') }, '（你改过）') : null) : r.manual ? h('span', { className: cls('faint') }, '你改过') : null,
        h('span', { className: cls('muted', 'clamp') }, r.title ? `${r.title}：${r.text}` : r.text),
        r.parentTitle || r.aspect ? h(Row, null, r.aspect ? h(Tag, { tone: 'outline' }, r.aspect) : null, r.parentTitle ? h('span', { className: cls('faint') }, `在「${r.parentTitle}」下面`) : null) : null),
      h('div', { className: cls('irow-meta') },
        h('div', { className: cls('irow-line') }, h(PlatName, { k: r.platform, size: 16 }), h('span', null, fmtTime(r.time) || r.foundDate)),
        h('div', { className: cls('irow-line') }, h('span', null, [r.kind === 'comment' ? '评论' : '帖子', r.author].filter(Boolean).join(' · ')), h(Eng, { r }))))

    const SENT_FILTERS = [
      { value: 'related', label: '相关的', count: f => f.neg + f.neu + f.pos + f.unknown },
      { value: 'neg', label: '在骂', color: v('neg'), count: f => f.neg },
      { value: 'neu', label: '中性', color: v('neu'), count: f => f.neu },
      { value: 'pos', label: '夸', color: v('pos'), count: f => f.pos },
      { value: 'unknown', label: '没判断', color: v('unk'), count: f => f.unknown },
      { value: 'unrelated', label: '无关', color: v('line-2'), count: f => f.unrelated },
      { value: 'all', label: '全部', count: f => f.neg + f.neu + f.pos + f.unknown + f.unrelated },
    ]
    const RANGE_LABEL = { today: '今天', 7: '近 7 天', 14: '近 14 天', 30: '近 30 天', all: '全部' }

    function ListPage() {
      // 从看板点过来的，带着筛选（只用一次）
      const init = useRef(listPreset.get() ?? {}).current
      useEffect(() => { listPreset.set(null) }, [])
      const [platform, setPlatform] = useState(init.platform ?? 'all')
      const [sentiment, setSentiment] = useState(init.sentiment ?? 'related')
      const [range, setRange] = useState(init.range ?? '7')
      const [aspect, setAspect] = useState(init.aspect ?? '')
      const [query, setQuery] = useState(init.q ?? '')
      const [q, setQ] = useState(init.q ?? '')
      const [page, setPage] = useState(1)
      const [openId, setOpenId] = useState(null)
      const list = useData(() => api('list', { platform, sentiment, range, q, aspect, page }), [platform, sentiment, range, q, aspect, page])
      const reset = fn => val => { fn(val); setPage(1) }
      const rows = list.data?.rows ?? []
      const fc = list.data?.facets
      const mix = fc ? [['neg', '在骂'], ['neu', '中性'], ['pos', '夸'], ['unknown', '没判断'], ['unrelated', '无关']].map(([key, label]) => ({ key, label, value: fc.sentiments[key], color: SENT_COLOR[key] })) : []
      const mixTotal = mix.reduce((a, x) => a + x.value, 0)
      const platTotal = fc ? fc.platforms.reduce((a, x) => a + x.total, 0) : 0
      return h(Fragment, null,
        h(Page, { title: '全部评论', sub: '抓到的帖子和评论都在这。点上面的数字筛选，模型判错了点开一条就能改。', width: 1240 },
          h(Card, null,
            h(Row, null,
              h(Seg, { value: range, onChange: reset(setRange), label: '日期', options: ['today', '7', '14', '30', 'all'].map(x => ({ value: x, label: RANGE_LABEL[x] })) }),
              h('span', { className: cls('grow') }),
              h(SearchBox, { value: query, onChange: setQuery, onEnter: text => { setQ(text); setPage(1) }, onClear: () => { setQ(''); setPage(1) }, placeholder: '搜正文、作者，回车', width: 260 })),
            h('div', { className: cls('frow') },
              h('span', { className: cls('flabel') }, '情绪'),
              h('div', { className: cls('stack'), style: { gap: 8 } },
                h('div', { className: cls('chips') }, SENT_FILTERS.map(o => {
                  const n = fc ? o.count(fc.sentiments) : null
                  return h('button', { key: o.value, type: 'button', className: cls('chip'), 'aria-pressed': sentiment === o.value, 'data-empty': n === 0 || undefined, onClick: () => reset(setSentiment)(o.value) },
                    o.color ? h('i', { style: { background: o.color } }) : null, o.label, n !== null ? h('b', null, n) : null)
                })),
                mixTotal ? h('div', { className: cls('mix'), role: 'img', 'aria-label': mix.map(x => `${x.label} ${x.value}`).join('，') }, mix.filter(x => x.value).map(x => h('span', { key: x.key, title: `${x.label} ${x.value} 条（${pct(x.value, mixTotal)}%）`, style: { flexGrow: x.value, background: x.color } }))) : null)),
            h('div', { className: cls('frow') },
              h('span', { className: cls('flabel') }, '平台'),
              h('div', { className: cls('chips') },
                h('button', { type: 'button', className: cls('chip'), 'aria-pressed': platform === 'all', onClick: () => reset(setPlatform)('all') }, '全部平台', fc ? h('b', null, platTotal) : null),
                (fc?.platforms ?? Object.keys(PLAT).map(key => ({ key, name: PLAT[key], total: null, neg: 0 }))).map(p => h('button', { key: p.key, type: 'button', className: cls('chip'), 'aria-pressed': platform === p.key, 'data-empty': p.total === 0 || undefined, onClick: () => reset(setPlatform)(p.key), title: p.total === null ? p.name : `${p.name}：${p.total} 条，其中在骂 ${p.neg} 条` },
                  h(PlatBadge, { k: p.key, size: 16 }), p.name, p.total !== null ? h('b', null, p.total) : null, p.neg ? h('small', null, `骂 ${p.neg}`) : null)))),
            aspect || q ? h('div', { className: cls('frow') },
              h('span', { className: cls('flabel') }, '还筛了'),
              h('div', { className: cls('chips') },
                aspect ? h('button', { type: 'button', className: cls('chip', 'chip-x'), 'aria-pressed': true, title: '去掉这个条件', onClick: () => reset(setAspect)('') }, `骂的方面：${aspect}`, h(Icon, { name: 'x', size: 14 })) : null,
                q ? h('button', { type: 'button', className: cls('chip', 'chip-x'), 'aria-pressed': true, title: '去掉这个条件', onClick: () => { setQ(''); setQuery(''); setPage(1) } }, `说到「${q}」`, h(Icon, { name: 'x', size: 14 })) : null)) : null,
            fc?.days?.length > 1 ? h('div', { className: cls('frow') },
              h('span', { className: cls('flabel') }, '每天'),
              h('div', null, h(StackColumns, { series: fc.days, height: 96, compact: true, today: fc.days.at(-1).date, label: '符合条件的内容每天多少条' }))) : null),
          h(Card, { title: list.data ? `共 ${list.data.total} 条` : '内容', note: list.data && list.data.total > rows.length ? `先显示 ${rows.length} 条，新发现的在前` : '新发现的在前', action: list.loading && list.data ? h(Spin, { sm: true }) : null },
            list.error ? h(ErrorBox, { error: list.error, onRetry: list.reload })
              : !list.data ? h(Loading)
                : !rows.length ? h(Empty, { title: '没有符合的', body: '换个筛选条件，或者去「今天」点「立即检查」。' })
                  : h(Fragment, null,
                    h('div', { className: cls('items') }, rows.map(r => h(ItemRow, { key: r.id, row: r, onOpen: setOpenId }))),
                    list.data.hasMore ? h(Row, null, h(Btn, { busy: list.loading, onClick: () => setPage(page + 1) }, '再看 50 条')) : null))),
        openId ? h(ItemDrawer, { id: openId, onClose: () => setOpenId(null), onChanged: list.reload }) : null)
    }

    // ---- 「设置」页
    function TargetsEditor({ value, onChange }) {
      const set = (i, patch) => onChange(value.map((t, n) => (n === i ? { ...t, ...patch } : t)))
      return h(Stack, null,
        value.map((t, i) => h('div', { key: t.id ?? i, className: cls('target') },
          h(Input, { value: t.name, onChange: v => set(i, { name: v }), placeholder: '名称，比如：庞巴迪', 'aria-label': '名称' }),
          h(Input, { value: t.kw, onChange: v => set(i, { kw: v }), placeholder: '别名、产品名，用逗号隔开', 'aria-label': '别名' }),
          h(Btn, { kind: 'ghost', icon: 'trash', label: '删掉这个', onClick: () => onChange(value.filter((_, n) => n !== i)) }))),
        value.length < 5 ? h(Row, null, h(Btn, { sm: true, icon: 'plus', onClick: () => onChange([...value, { name: '', kw: '' }]) }, '再加一个')) : h('span', { className: cls('faint') }, '最多 5 个'))
    }

    /** 平台表格里「现在」那一格：连接状态、说明、上次检查。 */
    const PlatformStatus = ({ p }) => h(Stack, null,
      h(Row, null, h(LinkTag, { value: p.status }), p.paidReady ? h(Tag, { tone: 'info', tip: '免费方式拿不到时，用付费接口补' }, '付费接口可用') : null),
      h('span', { className: cls('faint') }, p.note), p.paid ? h('span', { className: cls('faint') }, `付费：${p.paid.note}`) : null,
      p.at ? h('span', { className: cls('faint') }, `上次 ${fmtTime(p.at)}${p.fresh ? `，新的 ${p.fresh} 条` : ''}`) : null)

    /** 要登录的平台：「打开登录窗口」「我登好了」。 */
    function LoginButtons({ p, onChanged }) {
      const { busy, run } = useAction()
      if (!p.canLogin) return null
      const login = () => run(async () => {
        try { await api('openLogin', { platform: p.key }); toast(`弹出了一个 Chrome 窗口：在里面登录${p.name}，登好点「我登好了」`); onChanged() } catch (e) { notify(e.message) }
      })
      const check = () => run(async () => {
        try { const r = await api('checkLogin', { platform: p.key }); if (r.ok) toast(`${r.name}已登录`); else notify(`还没看到${r.name}登录：在插件的 Chrome 窗口里扫码登录后再点一次`, { tone: 'warn' }); onChanged() } catch (e) { notify(e.message) }
      })
      return h(Row, null, h(Btn, { sm: true, busy, onClick: login }, '打开登录窗口'), h(Btn, { sm: true, kind: 'ghost', disabled: busy, onClick: check }, '我登好了'))
    }

    function SettingsPage() {
      const cfg = useData(() => api('settings'), [])
      const [form, setForm] = useState(null)
      const [key, setKey] = useState('')
      const save = useAction()
      const keyAct = useAction()
      const c = cfg.data
      useEffect(() => {
        if (!c) return
        setForm({
          targets: c.targets.map(t => ({ id: t.id, name: t.name, kw: t.keywords.join('，') })), exclude: c.exclude.join('，'), autoEnabled: c.autoEnabled, autoTime: c.autoTime,
          lookbackDays: String(c.lookbackDays), paidEnabled: c.paid.enabled, monthlyCap: String(c.paid.monthlyCap), unitPrice: String(c.paid.unitPrice),
        })
      }, [c])
      if (cfg.error && !c) return h(Page, { title: '设置' }, h(ErrorBox, { error: cfg.error, onRetry: cfg.reload }))
      if (!c || !form) return h(Loading)
      const patch = p => setForm({ ...form, ...p })
      const saveAll = () => save.run(async () => {
        await api('saveSettings', {
          targets: form.targets.map(t => ({ id: t.id, name: t.name, keywords: splitWords(t.kw) })), exclude: splitWords(form.exclude), autoEnabled: form.autoEnabled, autoTime: form.autoTime,
          lookbackDays: Number(form.lookbackDays), paid: { enabled: form.paidEnabled, monthlyCap: Number(form.monthlyCap), unitPrice: Number(form.unitPrice) },
        })
        toast('保存了')
        cfg.reload()
      })
      const toggle = (p, on) => api('saveSettings', { platforms: { [p.key]: on } }).then(() => { toast(on ? `${p.name}打开了` : `${p.name}关掉了`); cfg.reload() }, e => notify(e.message))
      const saveKey = value => keyAct.run(async () => {
        try { await api('saveKey', { key: value }); setKey(''); toast(value ? '密钥存好了' : '密钥删掉了'); cfg.reload() } catch (e) { notify(e.message) }
      })
      const used = c.spend
      return h(Page, { title: '设置', sub: '改完点右上角「保存」。平台开关和密钥是单独存的，点了就生效。', actions: h(Btn, { kind: 'primary', icon: 'check', busy: save.busy, onClick: saveAll }, '保存') },
        save.error ? h(Alert, { tone: 'danger' }, save.error.message) : null,
        h(Card, { title: '盯谁', sub: '名称和别名都会拿去搜。别名可以写产品名、账号名、常见错别字。' },
          h(TargetsEditor, { value: form.targets, onChange: targets => patch({ targets }) })),
        h(Card, { title: '排除词', sub: '内容里有这些词的不要。比如盯「小米」时排除「小米粥」。' },
          h(Textarea, { value: form.exclude, onChange: v => patch({ exclude: v }), placeholder: '用逗号隔开' })),
        h(Card, { title: '平台', sub: '小红书、抖音、微博、知乎不登录拿不到：点「打开登录窗口」，在弹出的 Chrome 窗口里自己扫码。这个窗口用插件自己的资料，和你平时的 Chrome 分开。' },
          h(Table, { rowKey: 'key', rows: c.platformList, columns: [
            { key: 'name', title: '平台', render: p => h(PlatName, { k: p.key }) },
            { key: 'on', title: '开', render: p => h(Switch, { checked: p.on, onChange: on => toggle(p, on), label: `${p.name}开关` }) },
            { key: 'way', title: '免费方式', render: p => (p.way === 'browser' ? '浏览器窗口（要登录）' : '免费公开接口') },
            { key: 'status', title: '现在', render: p => h(PlatformStatus, { p }) },
            { key: 'act', title: '', render: p => h(LoginButtons, { p, onChanged: cfg.reload }) },
          ] })),
        h(Card, { title: '自动检查', sub: 'DSH 开着就会按时检查；那个时间 DSH 没开，下次打开时补一次。' },
          h(Grid, { cols: 3 },
            h(Field, { label: '每天自动检查', group: true }, h(Row, null, h(Switch, { checked: form.autoEnabled, onChange: v => patch({ autoEnabled: v }), label: '每天自动检查' }), h('span', { className: cls('muted') }, form.autoEnabled ? '开' : '关'))),
            h(Field, { label: '几点' }, h(Input, { type: 'time', value: form.autoTime, onChange: v => patch({ autoTime: v }) })),
            h(Field, { label: '只看最近几天发的', hint: '更早发的帖子不收' }, h(Select, { value: form.lookbackDays, onChange: v => patch({ lookbackDays: v }), options: ['1', '3', '7', '14', '30'].map(n => ({ value: n, label: `${n} 天` })) })))),
        h(Card, { title: '付费数据接口（可以不填）', sub: '免费方式拿不到的平台（要登录、被验证码挡住），用 TikHub 的接口补。按次收费，钱从你自己的 TikHub 账户扣。没填密钥这一路就不跑。' },
          h(Alert, null, `本月（${used.month}）已用 ${used.yuan.toFixed(2)} 元，调了 ${used.calls} 次，上限 ${used.cap} 元。到上限就停，下个月自动恢复。按每次 ${c.paid.unitPrice} 元估算，实际以 TikHub 后台为准。`),
          h(Grid, { cols: 2 },
            h(Field, { label: 'TikHub 密钥', hint: c.key.filled ? `已经填了（末四位 ${c.key.tail}）。换一个就重新填。` : '在 user.tikhub.io 后台「API 令牌」里创建，整个复制过来' },
              h(Row, null, h('span', { className: cls('grow') }, h(Input, { type: 'password', value: key, onChange: setKey, placeholder: c.key.filled ? '••••••••' : '粘贴密钥', autoComplete: 'off' })),
                h(Btn, { busy: keyAct.busy, disabled: !key.trim(), onClick: () => saveKey(key.trim()) }, '存'),
                c.key.filled ? h(Btn, { kind: 'ghost', disabled: keyAct.busy, onClick: async () => { if (await ask({ title: '删掉密钥？', text: '删了以后付费接口就不跑了。', ok: '删掉', danger: true })) saveKey('') } }, '删掉') : null)),
            h(Field, { label: '免费拿不到时用付费接口补', group: true }, h(Row, null, h(Switch, { checked: form.paidEnabled, onChange: v => patch({ paidEnabled: v }), label: '用付费接口补' }), h('span', { className: cls('muted') }, form.paidEnabled ? '用' : '不用'))),
            h(Field, { label: '每月最多花（元）', hint: '默认 5 元。填 0 就是一分钱都不花' }, h(Input, { type: 'number', min: 0, step: 1, value: form.monthlyCap, onChange: v => patch({ monthlyCap: v }) })),
            h(Field, { label: '每次大约多少钱（元）', hint: '用来记账，照 TikHub 后台的价格填' }, h(Input, { type: 'number', min: 0.001, step: 0.001, value: form.unitPrice, onChange: v => patch({ unitPrice: v }) })))),
        h('p', { className: cls('faint') }, c.model ? `判断用的模型：${c.model}（跟着 DSH 的默认模型走，在 DSH「设置 → 模型」里换）` : 'DSH 还没选默认模型：去 DSH「设置 → 模型」选一个，不然没法判断。'))
    }

    /** 左边导航里有哪些页面。加一个页面：写一个页面函数，在这里加一行。 */
    const PAGES = [
      { key: 'today', label: '今天', icon: 'home', view: TodayPage },
      { key: 'list', label: '全部评论', icon: 'list', view: ListPage },
      { key: 'settings', label: '设置', icon: 'settings', view: SettingsPage },
    ]

    // ================================================================== 4. 挂载（一般不用改）

    let t = key => TEXT.zh[key] ?? key
    /** 记住停在哪一页；切到别的面板再回来还在这一页。 */
    const route = makeStore(PAGES[0].key)

    function App() {
      const current = useStore(route)
      const neg = useStore(negToday)
      const page = PAGES.find(p => p.key === current) ?? PAGES[0]
      // 「今天」旁边的红色数字：今天有几条在骂你
      const nav = PAGES.map(p => (p.key === 'today' && neg ? { ...p, badge: neg, badgeTone: 'danger', tip: `今天有 ${neg} 条在骂你` } : p))
      return h(Shell, { title: t('panel'), nav, current: page.key, onNav: route.set }, h(page.view, { key: page.key }))
    }
    const PanelIcon = ({ size = 20 }) => h(Icon, { name: 'radar', size })


    return {
      inject: ['slots', 'locale', 'connection'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ID, TEXT), `${ID}: 文案`)
        t = ctx.locale.bind(ID)
        api = async (action, args = {}) => {
          const result = await ctx.connection.rpc.call('/api', ROUTE, { action, ...args })
          if (!result.ok) throw Object.assign(new Error(result.error?.message ?? '出错了'), { code: result.error?.code })
          return result.value
        }
        ctx.effect(() => {
          const el = document.createElement('style')
          el.setAttribute('data-plugin-style', ID)
          // 「外观」段的变量同时给 Embed 用（Embed 画在插件外框以外）。
          el.textContent = (THEME.replaceAll('.$-root', ':is(.$-root,.$-embed)') + STYLES + PAGE_STYLES).replaceAll('$-', `${P}-`)
          document.head.append(el)
          return () => el.remove()
        }, `${ID}: 样式`)
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID, locale: ID }, App))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: ID, order: 30, locale: ID, label: () => t('panel') }, PanelIcon))
      },
    }
  },
})
