/*
 * 创作台 · 页面（浏览器端）        用 DSH 插件底座 0.5 做的（2026-11-20）
 *
 * 创作台把小易工作台搬进 DSH：文章（资料→大纲→写作→体检→发布）、小红书卡片、视频和拉片、选题广场、素材、AI 记忆。
 * 页面不直接连工作台，都经过后台 index.js 转一道（见第 3.0 段）。
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
  id: '@local/creator-studio',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useSyncExternalStore } = React

    // ================================================================== 0. 名字（复制底座后改这里）

    const ID = 'creator-studio'      // 和 cordis.patch.yml 里的 id 一样
    const P = 'cs'                   // 样式前缀：两三个小写字母，每个插件用不一样的
    const ROUTE = 'creatorStudio/call'    // 和 index.js 里的 ROUTE 对上（那边多一个开头的 /api/）
    const TEXT = {
      zh: { panel: '创作台' },
      en: { panel: 'Creator Studio' },
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
}
/* 深色：上面哪一行写了自己的色值，就在这里给它写一个深色时用的值。没改颜色就留空。 */
body[data-ds-dark-theme] .$-root{
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
    function Btn({ kind = 'default', sm, lg, block, icon, label, tip, busy, disabled, href, download, onClick, children }) {
      const iconOnly = icon && (children === undefined || children === null)
      const className = cls('btn', `btn-${kind}`, sm && 'btn-sm', lg && 'btn-lg', block && 'btn-block', iconOnly && 'btn-icon')
      const inside = [busy ? h(Spin, { key: 'i', sm: true }) : icon ? h(Icon, { key: 'i', name: icon, size: sm ? 14 : 16 }) : null,
        iconOnly ? null : h('span', { key: 't', className: cls('btn-label') }, children)]
      if (href) return h('a', { className, href, download, title: tip ?? (iconOnly ? label : undefined), 'aria-label': iconOnly ? label : undefined }, inside)
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
    //
    // 3.0 连工作台    3.1 小工具    3.2 选模型    3.3 去哪一页    3.4 显示工作台做出来的 HTML
    // 3.5 以后是各个页面：作品、文章各步、AI 助手、卡片、选题广场、素材、记忆、设置、视频和拉片。

    // ---- 3.0 连工作台：页面不直接连工作台，都经过后台 index.js 转一道（工作台只认后台手里的令牌）

    /** 工作台的地址，图片、视频、下载链接直接用它（只读的文件不用令牌）。挂载后由 App 填上。 */
    let BASE = ''
    const enc = encodeURIComponent
    /**
     * 调工作台的接口，返回它回的 JSON。失败会抛错，error.message 可以直接给人看。
     *   await wb('/api/projects')
     *   await wb('/api/projects/' + enc(id), { method: 'PATCH', body: { status: '待发' } })
     *   await wb('/p/' + enc(id) + '/index.html?wb=1', { raw: true })   → 拿原文（HTML、Markdown）
     */
    const wb = (path, { method = 'GET', body, raw } = {}) => api('wb', { method, path, body, raw })
    const wbPost = (path, body = {}) => wb(path, { method: 'POST', body })
    const wbPut = (path, body = {}) => wb(path, { method: 'PUT', body })
    const wbPatch = (path, body = {}) => wb(path, { method: 'PATCH', body })
    const wbDel = (path, body) => wb(path, { method: 'DELETE', body })
    /**
     * 工作台里一个文件的地址：fileUrl('/assets/xx.png')。图片、视频、下载都用它。
     * 走插件后台转一道（/api/creatorStudio/file），不直接连工作台：桌面版的页面不让加载 http://127.0.0.1 上的图片。
     */
    const fileUrl = path => `/api/creatorStudio/file?p=${enc(path)}`
    /** 在系统浏览器里打开时用工作台的真实地址：window.open(webUrl('/v/xx/index.html'))。 */
    const webUrl = path => BASE + path
    /** 相对地址按工作台里某个文件的位置补全，再换成 fileUrl：fileUrlFrom('img/a.png', '/p/xx/index.html') */
    function fileUrlFrom(rel, basePath) {
      const s = String(rel ?? '').trim()
      if (!s || /^(#|[a-z][\w+.-]*:)/i.test(s) || s.startsWith('//')) return rel
      try { const u = new URL(s, 'http://wb' + basePath); return fileUrl(decodeURIComponent(u.pathname) + u.search) } catch { return rel }
    }
    /** 项目里一个文件的地址：projectFile(p, 'out/1.jpg')。 */
    const projectFile = (p, rel) => fileUrl(`/p/${enc(p.id)}/` + String(rel).split('/').map(enc).join('/'))
    /** 项目接口的路径：pApi(p, 'studio/chat') → /api/projects/<id>/studio/chat */
    const pApi = (p, sub = '') => `/api/projects/${enc(p.id ?? p)}${sub ? '/' + sub : ''}`

    /**
     * 边写边出的请求（AI 写一段字、能动手的助手）。工作台那头一直往外吐字，后台接住，这里每 0.3 秒去取一次新的。
     *   const job = wbStream('/api/ai/article', { … }, { onText: (全文, 新来的) => … })
     *   const text = await job.done      // 写完拿到全文；出错会抛错
     *   job.stop()                       // 中途停下
     */
    function wbStream(path, body, { onText, method = 'POST' } = {}) {
      let id = null, stopped = false, all = ''
      const done = (async () => {
        id = (await api('streamStart', { method, path, body })).id
        if (stopped) { api('streamStop', { id }).catch(() => {}); return all }
        for (;;) {
          const r = await api('streamRead', { id, from: all.length })
          if (r.text) { all += r.text; onText?.(all, r.text) }
          if (r.error) throw new Error(r.error)
          if (r.done) break
          await new Promise(res => setTimeout(res, 300))
        }
        // 工作台写到一半出错时，会在最后补一行 [[出错：…]]
        const m = /\n*\[\[出错：([\s\S]*)\]\]\s*$/.exec(all)
        if (m) throw new Error(m[1])
        return all
      })()
      return { done, stop: () => { stopped = true; if (id) api('streamStop', { id }).catch(() => {}) } }
    }
    /** 一行一个 JSON 的流（能动手的助手用）：wbEvents(path, body, { onEvent: ev => … })，用法同 wbStream。 */
    function wbEvents(path, body, { onEvent } = {}) {
      let used = 0
      return wbStream(path, body, {
        onText(all) {
          const lines = all.slice(used).split('\n')
          const rest = lines.pop()
          used = all.length - rest.length
          for (const line of lines) { if (!line.trim()) continue; try { onEvent?.(JSON.parse(line)) } catch {} }
        },
      })
    }
    /**
     * 把一个文件传给工作台：await uploadFile(file, '/api/breakdown/upload', { onProgress: 百分比 => … })
     * 分成小块经后台转过去，几百 MB 的视频也行；返回工作台回的 JSON。path 里不用带文件名，后台会补上 ?name=。
     */
    async function uploadFile(file, path, { onProgress } = {}) {
      const { id } = await api('uploadStart', { name: file.name })
      const size = 2 * 1024 * 1024
      for (let at = 0; at < file.size; at += size) {
        const buf = new Uint8Array(await file.slice(at, at + size).arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        await api('uploadChunk', { id, data: btoa(bin) })
        onProgress?.(Math.min(100, Math.round((at + buf.length) / file.size * 100)))
      }
      return api('uploadFinish', { id, path })
    }

    // ---- 3.1 小工具

    /** 多久以前：ago('2026-11-20T08:00:00Z') → '3 小时前' */
    function ago(iso) {
      if (!iso) return ''
      const s = (Date.now() - new Date(iso)) / 1000
      return s < 60 ? '刚刚' : s < 3600 ? `${s / 60 | 0} 分钟前` : s < 86400 ? `${s / 3600 | 0} 小时前` : s < 86400 * 30 ? `${s / 86400 | 0} 天前` : new Date(iso).toLocaleDateString('zh-CN')
    }
    /** 今天的日期（本机时间）：'2026-11-20' */
    const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    /** 复制一段字，成功了 toast 一下。 */
    async function copyText(text, what = '已复制') { try { await navigator.clipboard.writeText(text); toast(what) } catch { notify('复制失败，浏览器不让写剪贴板') } }
    /** 复制带格式的 HTML（贴进公众号编辑器能保留排版）；不支持时退回复制纯文字。 */
    async function copyHtml(html, text, what = '已复制') {
      try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text ?? html], { type: 'text/plain' }) })]); toast(what) } catch { copyText(text ?? html, what) }
    }
    /** 记在本机的小偏好（停在哪个视图、选的模型）。读不到就用默认值。 */
    const lsGet = (k, d) => { try { return localStorage.getItem(`cs.${k}`) ?? d } catch { return d } }
    const lsSet = (k, v) => { try { localStorage.setItem(`cs.${k}`, v) } catch {} }
    /** 每隔 ms 毫秒调一次 fn（页面藏起来时不调），on 为假时不调。 */
    function usePoll(fn, ms, on = true) {
      const ref = useRef(fn); ref.current = fn
      useEffect(() => {
        if (!on) return undefined
        const t = setInterval(() => { if (!document.hidden) ref.current() }, ms)
        return () => clearInterval(t)
      }, [ms, on])
    }
    /** 很简单的 Markdown → HTML（AI 回复、笔记、简报里的粗体、列表、链接、小标题）。内容先转义，不会跑脚本。 */
    function mdLite(s) {
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
      const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      const out = []; let list = null
      for (const line of String(s ?? '').split('\n')) {
        const li = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(line)
        if (li) { if (!list) { list = []; out.push(list) } list.push(`<li>${inline(li[1])}</li>`); continue }
        list = null
        const hd = /^(#{1,4})\s+(.*)$/.exec(line)
        if (hd) out.push(`<p><b>${inline(hd[2])}</b></p>`)
        else if (line.trim()) out.push(`<p>${inline(line)}</p>`)
      }
      return out.map(x => (Array.isArray(x) ? `<ul>${x.join('')}</ul>` : x)).join('')
    }
    /** 显示 mdLite 转出来的一段：h(Md, { text }) */
    const Md = ({ text, className }) => h('div', { className: [cls('md'), className].filter(Boolean).join(' '), dangerouslySetInnerHTML: { __html: mdLite(text) } })
    /** 工作台项目的类型和状态 */
    const TYPE_NAMES = { article: '文章', card: '小红书卡片', script: '视频脚本' }
    const STATUS_TONE = { 灵感: undefined, 草稿: 'info', 待发: 'warn', 已发布: 'success' }
    const StatusTag = ({ status }) => h(Tag, { tone: STATUS_TONE[status] }, status || '灵感')

    // ---- 3.2 选模型：工作台里所有 AI 功能共用一个「现在用的模型」，导航底部可以换。默认是 DSH 当前的默认模型（工作台里叫 dsh）。

    /** 现在选的模型（工作台的写法：接口 id，或「接口 id::具体模型」）。空字符串 = 跟着工作台的默认。 */
    const providerStore = makeStore(lsGet('provider', ''))
    /** 调 AI 接口时带上：{ ...body, provider: currentProvider() } */
    const currentProvider = () => providerStore.get() || undefined
    const providersCache = makeStore(null)
    async function loadProviders(force) {
      if (!force && providersCache.get()) return providersCache.get()
      const v = await wb('/api/ai/providers')
      providersCache.set(v)
      return v
    }
    /** 模型切换菜单：放在导航底部，也可以放进任何页面。 */
    function ProviderPicker({ block = true, sm }) {
      const value = useStore(providerStore)
      const list = useStore(providersCache)
      useEffect(() => { loadProviders().catch(() => {}) }, [])
      const all = list?.providers ?? []
      const id = (value || list?.default || '').split('::')[0]
      const cur = all.find(p => p.id === id)
      const model = (value || '').split('::')[1]
      const label = cur ? cur.name.replace(/（.*?）/g, '') : '选模型'
      const items = []
      for (const p of all) {
        if (!p.ready && !p.dsh) continue
        items.push({ key: p.id, label: p.name, note: p.dsh ? 'DSH 里的模型' : p.model, current: id === p.id && !model, onClick: () => { providerStore.set(p.id); lsSet('provider', p.id) } })
        for (const m of p.models ?? []) items.push({ key: `${p.id}::${m.id}`, label: `　${m.label || m.id}`, current: id === p.id && model === m.id, onClick: () => { const v = `${p.id}::${m.id}`; providerStore.set(v); lsSet('provider', v) } })
      }
      items.push({ sep: true }, { key: 'reload', label: '重新读取模型列表', icon: 'refresh', onClick: () => loadProviders(true).catch(e => notify(e.message)) }, { key: 'set', label: '模型设置', icon: 'settings', onClick: () => go('settings') })
      return h(Menu, { icon: 'spark', label, sub: model || (cur?.dsh ? 'DSH 里的模型' : cur?.model) || '', block, sm, tip: 'AI 用哪个模型', items })
    }

    // ---- 3.3 去哪一页：{ page, id, tab }。go('works')、go('project', { id: 项目id, tab: 'write' })

    const route = makeStore({ page: lsGet('page', 'works') })
    function go(page, more = {}) { route.set({ page, ...more }); if (!more.id) lsSet('page', page) }
    /** 工作台的项目列表，几个页面都要用；改完东西调 projects.reload() */
    const projectsStore = makeStore(null)
    const projects = {
      async reload() { const v = await wb('/api/projects'); projectsStore.set(v); return v },
      get: () => projectsStore.get() ?? [],
    }

    // ---- 3.4 显示工作台做出来的 HTML（文章排版、卡片）：放进 shadow DOM，它的样式不会漏到插件里，插件的样式也不会弄乱它
    /**
     * h(ShadowHtml, { html: '<section>…</section>', css: '…', cssUrls: [fileUrl('/p/x/theme.css')], onClick: e => …, onReady: root => … })
     * onReady 拿到 shadowRoot，可以在里面找元素、加选中框。html 变了会整块重画。
     */
    function ShadowHtml({ html, css = '', cssUrls = [], onClick, onReady, className, style }) {
      const ref = useRef(null)
      const ready = useRef(onReady); ready.current = onReady
      useLayoutEffect(() => {
        const host = ref.current
        if (!host) return
        const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
        root.innerHTML = cssUrls.map(u => `<link rel="stylesheet" href="${u}">`).join('') + (css ? `<style>${css}</style>` : '') + (html ?? '')
        ready.current?.(root)
      }, [html, css, cssUrls.join('|')])
      return h('div', { ref, className, style, onClick })
    }

    // 页面自己的样式（各页面的 STYLES_xxx 在最后拼进来）
    const PAGE_STYLES_SHARED = `
.$-md p{margin:0 0 8px}.$-md p:last-child{margin-bottom:0}.$-md ul{margin:0 0 8px;padding-left:20px}.$-md code{padding:0 4px;border-radius:var(--$-r-xs);background:var(--$-soft);font-size:12px}
.$-md a{color:var(--$-accent)}
.$-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.$-clamp3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.$-pre{white-space:pre-wrap;overflow-wrap:anywhere}
`
    /** 各页面把自己的样式 push 进来：STYLE_PARTS.push(`.$-xx{…}`)。挂载时拼在一起。 */
    const STYLE_PARTS = [PAGE_STYLES_SHARED]

    // ================================================================== 3.5 作品（20 段）
    //
    // 作品列表（画廊 / 表格 / 看板 / 日历）、动态、新建、项目详情的外框（顶栏、步骤、右边的 AI 助手），
    // 卡片的浏览和精修、信息、笔记、历史版本、换模板。文章各步的内容在 30 段，助手对话在 40 段。

    Object.assign(ICONS, {
      table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
      kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v7h-4z',
      undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
      archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
      pointer: 'M5 3l14 7-6 2-2 6z',
      minus: 'M5 12h14',
      layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
    })

    const W_STATUSES = Object.keys(STATUS_TONE)
    const W_PLATFORMS = ['小红书', '公众号', 'X', '抖音', '即刻', '微博', '知乎', '其他']
    const W_KINDS = [['all', '全部'], ['article', '文章'], ['script', '视频脚本'], ['card', '卡片']]
    const W_VIEWS = [{ value: 'gallery', label: '画廊' }, { value: 'table', label: '表格' }, { value: 'board', label: '看板' }, { value: 'calendar', label: '日历' }]
    const W_SORTS = [{ value: 'updated', label: '最近更新' }, { value: 'created', label: '创建时间' }, { value: 'title', label: '标题' }, { value: 'status', label: '状态' }]
    const W_CARD_CHIPS = ['更口语', '更短', '更有冲击力', '换个说法', '改成三条要点', '数字更醒目']

    /** 作品的种类：'article' | 'script' | 'card'（视频脚本在工作台里是 form 为 script 的文章） */
    const wKind = p => (p.form === 'script' ? 'script' : p.type)
    const wIcon = p => ({ card: 'image', script: 'film' })[wKind(p)] ?? 'file'
    const wFmtSec = s => (s < 60 ? `${s} 秒` : `${s / 60 | 0} 分${s % 60 ? ` ${s % 60} 秒` : '钟'}`)
    const wSizeOf = p => (p.type === 'card' ? `${p.pages ?? 0} 页` : p.form === 'script' ? `口播约 ${wFmtSec(p.speakSec || 0)}` : `${((p.chars || 0) / 1000).toFixed(1)}k 字`)
    const wFmtTime = iso => (iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
    /** 项目里的图，带上更新时间，换了图浏览器不会拿旧的 */
    const wImg = (p, rel) => projectFile(p, rel) + '?v=' + (Date.parse(p.updated) || 0)
    /** 改项目的属性（状态、标签、计划日期…），改完刷新共享的项目列表。返回改好后的完整项目。 */
    async function wPatch(p, body) {
      const r = await wbPatch(pApi(p), body)
      projects.reload().catch(() => {})
      return r
    }
    /** 键盘事件是不是发生在输入框里（shadow DOM 里的也算） */
    const wTyping = e => !!(e.composedPath?.()[0] ?? e.target)?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]')

    /** 新建项目、文章转视频脚本以后，替作者先发给助手的第一句话：交给 40 段的 queueChatSend，助手栏打开后自己发出去。 */
    const pendingChat = { set: (pid, text) => { if (text) queueChatSend(pid, text) } }

    /** 从口播稿（视频脚本的 article.md）里只取要说出口的话：去掉画面提示（> 开头）、封面和发布文案那几节。 */
    function wSayOf(md) {
      const out = []
      let cur = null, skip = false
      for (const raw of String(md ?? '').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
        const l = raw.trim()
        if (!l) continue
        const hd = /^(#{1,6})\s+(.*)$/.exec(l)
        if (hd) {
          const lv = hd[1].length
          if (lv === 1) continue
          if (lv === 2 && /封面|标题|发布|话题|备注|素材/.test(hd[2])) { skip = true; cur = null } else if (lv > 2 && skip) continue
          else { skip = false; cur = []; out.push(cur) }
          continue
        }
        if (!cur || /^<p class="deck">/.test(l) || l.startsWith('>') || /^[（(].*[）)]$/.test(l)) continue
        cur.push(l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').replace(/^[-*]\s+/, ''))
      }
      return out.map(x => x.join('\n')).filter(Boolean).join('\n\n')
    }

    // ---- 标签：一排 #标签，每个带 ×，最后一个「+」点了变成输入框（回车记下，可以一次写几个，用逗号或空格隔开）
    function WTags({ tags = [], onChange }) {
      const [adding, setAdding] = useState(false)
      const [val, setVal] = useState('')
      const done = ok => {
        const v = val.trim()
        setAdding(false); setVal('')
        if (ok && v) onChange([...tags, ...v.split(/[,，\s]+/).filter(Boolean)])
      }
      return h('span', { className: cls('w-tags') },
        tags.map(tg => h('span', { key: tg, className: cls('tag', 'w-tag') }, '#' + tg,
          h('button', { type: 'button', className: cls('w-tag-x'), title: '去掉这个标签', 'aria-label': `去掉标签 ${tg}`, onClick: e => { e.stopPropagation(); onChange(tags.filter(x => x !== tg)) } }, h(Icon, { name: 'x', size: 10 })))),
        adding
          ? h('input', {
            className: cls('input', 'w-tag-in'), autoFocus: true, value: val, placeholder: '标签，回车', 'aria-label': '新标签',
            onChange: e => setVal(e.target.value), onClick: e => e.stopPropagation(), onBlur: () => done(true),
            onKeyDown: e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); done(true) }
              if (e.key === 'Escape') { e.stopPropagation(); done(false) }
            },
          })
          : h('button', { type: 'button', className: cls('w-tag-add'), onClick: e => { e.stopPropagation(); setAdding(true) } }, tags.length ? '+' : '+ 标签'))
    }

    // ================================================================== 作品列表

    function WorksPage() {
      const list = useStore(projectsStore)
      const [err, setErr] = useState(null)
      const [kind, setKind] = useState(() => lsGet('works.kind', 'all'))
      const [status, setStatus] = useState('')
      const [tag, setTag] = useState('')
      const [starred, setStarred] = useState(false)
      const [q, setQ] = useState('')
      const [hits, setHits] = useState([])
      const [view, setView] = useState(() => lsGet('works.view', 'gallery'))
      const [sort, setSort] = useState(() => lsGet('works.sort', 'updated'))
      const [newType, setNewType] = useState(null)
      const stamp = useRef('')
      const load = useCallback(() => { setErr(null); projects.reload().catch(setErr) }, [])
      useEffect(load, [load])
      // 命令行或助手改了文件：每 4 秒看一眼，有变化就刷新列表
      usePoll(async () => {
        try {
          const s = await wb('/api/stamp')
          if (stamp.current && s.stamp !== stamp.current) projects.reload().catch(() => {})
          stamp.current = s.stamp
        } catch { /* 工作台一时没回，下次再看 */ }
      }, 4000)
      // 搜正文：两个字以上，停手 0.25 秒再搜
      useEffect(() => {
        const qq = q.trim()
        if (qq.length < 2) { setHits([]); return undefined }
        const tm = setTimeout(() => wb('/api/search?q=' + enc(qq)).then(setHits, () => setHits([])), 250)
        return () => clearTimeout(tm)
      }, [q])

      const all = list ?? []
      const pick = (setter, key) => v => { setter(v); if (key) lsSet(key, v) }
      const qq = q.trim().toLowerCase()
      const cmp = {
        updated: (a, b) => b.updated.localeCompare(a.updated),
        created: (a, b) => String(b.created).localeCompare(String(a.created)),
        title: (a, b) => a.title.localeCompare(b.title, 'zh'),
        status: (a, b) => W_STATUSES.indexOf(a.status) - W_STATUSES.indexOf(b.status),
      }[sort] ?? ((a, b) => b.updated.localeCompare(a.updated))
      const shown = all.filter(p => (kind === 'all' || wKind(p) === kind) && (!status || p.status === status) && (!tag || p.tags.includes(tag)) && (!starred || p.pinned)
        && (!qq || p.title.toLowerCase().includes(qq) || p.tags.some(x => x.toLowerCase().includes(qq)) || p.id.toLowerCase().includes(qq)))
        .sort((a, b) => (b.pinned - a.pinned) || cmp(a, b))
      const tagCount = {}
      for (const p of all) for (const tg of p.tags) tagCount[tg] = (tagCount[tg] || 0) + 1
      const tagList = Object.entries(tagCount).sort((a, b) => b[1] - a[1])
      const bodyHits = hits.filter(x => !shown.some(p => p.id === x.id && x.hits.every(hh => hh.where === '标题' || hh.where === '标签')))

      const open = p => go('project', { id: p.id })
      const patch = async (p, body, quiet) => { try { await wPatch(p, body); if (!quiet) toast('已保存') } catch (e) { notify(e.message) } }
      const clearFilters = () => { setStatus(''); setTag(''); setStarred(false); setQ(''); pick(setKind, 'works.kind')('all') }

      const filterItems = [
        { title: '状态' },
        { key: 's:', label: '全部状态', current: !status, onClick: () => setStatus('') },
        ...W_STATUSES.map(s => ({ key: 's:' + s, label: s, note: `${all.filter(p => p.status === s).length} 个`, current: status === s, onClick: () => setStatus(s) })),
        { sep: true },
        { key: 'star', label: '只看星标', icon: 'star', current: starred, onClick: () => setStarred(!starred) },
        tagList.length ? { sep: true } : null,
        tagList.length ? { title: '标签' } : null,
        ...tagList.slice(0, 40).map(([tg, n]) => ({ key: 't:' + tg, label: '#' + tg, note: `${n} 个`, current: tag === tg, onClick: () => setTag(tag === tg ? '' : tg) })),
      ]
      const chip = (key, text, onClear) => h('span', { key, className: cls('w-chip') }, text, h('button', { type: 'button', 'aria-label': `去掉筛选：${text}`, title: '去掉这个筛选', onClick: onClear }, h(Icon, { name: 'x', size: 12 })))
      const chips = [
        status ? chip('s', status, () => setStatus('')) : null,
        tag ? chip('t', '#' + tag, () => setTag('')) : null,
        starred ? chip('p', '星标', () => setStarred(false)) : null,
      ].filter(Boolean)
      const mark = text => {
        if (!qq) return text
        const at = text.toLowerCase().indexOf(qq)
        return at < 0 ? text : [text.slice(0, at), h('mark', { key: 'm' }, text.slice(at, at + qq.length)), text.slice(at + qq.length)]
      }

      const newMenu = h(Menu, {
        kind: 'primary', icon: 'plus', label: '新建', align: 'right', items: [
          { key: 'article', label: '文章', icon: 'file', onClick: () => setNewType('article') },
          { key: 'script', label: '视频脚本', icon: 'film', onClick: () => setNewType('script') },
          { key: 'card', label: '小红书卡片', icon: 'image', onClick: () => setNewType('card') },
        ],
      })
      let body
      if (err && !list) body = h(ErrorBox, { error: err, onRetry: load })
      else if (!list) body = h(Loading)
      else if (!all.length) body = h(Empty, { title: '还没有作品', body: '点右上角「新建」，写一篇文章、一条视频脚本或一组小红书卡片。', action: h(Btn, { kind: 'primary', icon: 'plus', onClick: () => setNewType('article') }, '新建文章') })
      else if (!shown.length && !bodyHits.length) body = h(Empty, { title: '没有符合的作品', body: '换个筛选条件试试。', action: h(Btn, { onClick: clearFilters }, '清除筛选') })
      else {
        const views = { gallery: WGallery, table: WTable, board: WBoard, calendar: WCalendar }
        body = h(Fragment, null,
          bodyHits.length ? h(Card, { title: '正文里搜到', note: `${bodyHits.length} 个作品` }, h('div', { className: cls('w-hits') }, bodyHits.slice(0, 8).map(x => h('button', { key: x.id, type: 'button', className: cls('w-hit'), onClick: () => go('project', { id: x.id }) },
            h('b', null, x.title), h('span', { className: cls('faint') }, `[${x.hits[0].where}] …`, mark(x.hits[0].snippet), `…${x.hits.length > 1 ? `　共 ${x.hits.length} 处` : ''}`))))) : null,
          shown.length ? h(views[view] ?? WGallery, { items: shown, onOpen: open, onPatch: patch }) : null)
      }
      return h(Page, { title: '作品', sub: list ? `${shown.length} 个${shown.length !== all.length ? `（一共 ${all.length} 个）` : ''}` : '', width: 1280, actions: newMenu },
        h('div', { className: cls('w-bar') },
          h(Seg, { label: '按类型看', value: kind, onChange: pick(setKind, 'works.kind'), options: W_KINDS.map(([k, n]) => ({ value: k, label: `${n} ${all.filter(p => k === 'all' || wKind(p) === k).length}` })) }),
          h(Menu, { icon: 'filter', label: '筛选', sm: false, items: filterItems, width: 220 }),
          chips,
          h('span', { className: cls('w-gap') }),
          h(SearchBox, { value: q, onChange: setQ, placeholder: '搜标题、标签、正文', width: 240 }),
          view === 'gallery' || view === 'table' ? h('span', { className: cls('w-sort') }, h(Select, { value: sort, onChange: pick(setSort, 'works.sort'), options: W_SORTS, 'aria-label': '排序' })) : null,
          h(Seg, { label: '怎么排', value: view, onChange: pick(setView, 'works.view'), options: W_VIEWS })),
        body,
        newType ? h(NewProjectModal, { type: newType, onClose: () => setNewType(null) }) : null)
    }

    /** 画廊：一张张小卡，上面是缩略图（卡片项目并排三张成品图），右上角星标。 */
    function WGallery({ items, onOpen, onPatch }) {
      return h('div', { className: cls('w-gallery') }, items.map(p => h('article', { key: p.id, className: cls('w-gc') },
        h('button', { type: 'button', className: cls('w-gc-open'), onClick: () => onOpen(p) },
          h('div', { className: cls('w-gc-thumb', p.type === 'card' && 'w-gc-cards') },
            p.thumbs?.length ? p.thumbs.map(tb => h('img', { key: tb, src: wImg(p, tb), alt: '', loading: 'lazy' }))
              : h('span', { className: cls('w-gc-none') }, h(Icon, { name: wIcon(p), size: 22 }), '还没有成品图')),
          h('div', { className: cls('w-gc-body') },
            h('div', { className: cls('w-gc-title', 'clamp2') }, p.title),
            h('div', { className: cls('row') }, h(StatusTag, { status: p.status }), p.tags.slice(0, 3).map(tg => h('span', { key: tg, className: cls('w-hash') }, '#' + tg))),
            h('div', { className: cls('faint') }, [p.typeName, wSizeOf(p), ago(p.updated), p.plan ? `计划 ${p.plan.slice(5)}` : ''].filter(Boolean).join(' · ')))),
        h('button', { type: 'button', className: cls('w-pin'), 'data-on': p.pinned || undefined, title: p.pinned ? '取消星标' : '加星标', 'aria-label': p.pinned ? '取消星标' : '加星标', onClick: () => onPatch(p, { pinned: !p.pinned }, true) }, h(Icon, { name: 'star', size: 14 })))))
    }

    /** 表格：状态、标签、计划日期在格子里直接改。 */
    function WTable({ items, onOpen, onPatch }) {
      return h(Table, {
        rows: items, rowKey: 'id', columns: [
          { key: 'title', title: '标题', render: p => h('button', { type: 'button', className: cls('w-tt'), onClick: () => onOpen(p) },
            p.thumb ? h('img', { src: wImg(p, p.thumb), alt: '', loading: 'lazy' }) : h('span', { className: cls('w-tt-ph') }, h(Icon, { name: wIcon(p) })),
            p.pinned ? h('span', { className: cls('w-star-sm'), title: '星标' }, h(Icon, { name: 'star', size: 12 })) : null,
            h('span', null, p.title)) },
          { key: 'type', title: '类型', render: p => h('span', { className: cls('muted') }, p.typeName) },
          { key: 'status', title: '状态', render: p => h('select', { className: cls('input', 'w-mini'), value: p.status, 'aria-label': '状态', onChange: e => onPatch(p, { status: e.target.value }) }, W_STATUSES.map(s => h('option', { key: s, value: s }, s))) },
          { key: 'tags', title: '标签', render: p => h(WTags, { tags: p.tags, onChange: tags => onPatch(p, { tags }, true) }) },
          { key: 'size', title: '规模', render: p => h('span', { className: cls('muted') }, wSizeOf(p)) },
          { key: 'plan', title: '计划发布', render: p => h('input', { type: 'date', className: cls('input', 'w-mini'), value: p.plan || '', 'aria-label': '计划发布日期', onChange: e => onPatch(p, { plan: e.target.value }) }) },
          { key: 'pub', title: '已发布', render: p => h('span', { className: cls('muted') }, p.published.length ? p.published.map(r => r.platform).join('、') : '—') },
          { key: 'upd', title: '更新', render: p => h('span', { className: cls('faint') }, ago(p.updated)) },
        ],
      })
    }

    /** 看板：按状态分四列，把作品拖到另一列就改了状态。 */
    function WBoard({ items, onOpen, onPatch }) {
      const [over, setOver] = useState('')
      return h('div', { className: cls('w-board') }, W_STATUSES.map(s => {
        const col = items.filter(p => p.status === s)
        return h('section', {
          key: s, className: cls('w-col'), 'data-over': over === s || undefined, 'aria-label': s,
          onDragOver: e => { e.preventDefault(); if (over !== s) setOver(s) },
          onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver('') },
          onDrop: e => {
            e.preventDefault(); setOver('')
            const p = items.find(x => x.id === e.dataTransfer.getData('text/plain'))
            if (p && p.status !== s) onPatch(p, { status: s })
          },
        },
        h('div', { className: cls('w-col-head') }, h(StatusTag, { status: s }), h('span', { className: cls('faint') }, col.length)),
        col.map(p => h('button', {
          key: p.id, type: 'button', draggable: true, className: cls('w-kc'), onClick: () => onOpen(p),
          onDragStart: e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move' },
        },
        p.thumb ? h('img', { src: wImg(p, p.thumb), alt: '', loading: 'lazy', draggable: false }) : h('span', { className: cls('w-kc-ph') }, h(Icon, { name: wIcon(p) })),
        h('span', { className: cls('w-kc-text') }, h('b', { className: cls('clamp2') }, p.pinned ? '★ ' : '', p.title),
          h('span', { className: cls('faint') }, [p.typeName, wSizeOf(p), p.plan ? `计划 ${p.plan.slice(5)}` : ''].filter(Boolean).join(' · '))))),
        col.length ? null : h('div', { className: cls('w-col-empty') }, '拖到这里'))
      }))
    }

    /** 日历：一个月一屏；计划发布的可以拖到别的日子，下面「还没排期」的拖上去就排上了。 */
    function WCalendar({ items, onOpen, onPatch }) {
      const now = new Date()
      const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
      const [over, setOver] = useState('')
      const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const first = new Date(ym.y, ym.m, 1)
      const start = new Date(ym.y, ym.m, 1 - ((first.getDay() + 6) % 7))
      const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
      const evs = {}
      for (const p of items) {
        if (p.plan) (evs[p.plan] ||= []).push({ p, kind: 'plan' })
        p.published.forEach((r, i) => { if (r.date) (evs[r.date] ||= []).push({ p, kind: 'pub', r, i }) })
      }
      const unsched = items.filter(p => !p.plan && p.status !== '已发布')
      const shift = k => setYm(c => { const d = new Date(c.y, c.m + k, 1); return { y: d.getFullYear(), m: d.getMonth() } })
      const today = todayStr()
      const ev = (x, key) => h('button', {
        key, type: 'button', className: cls('w-ev'), 'data-kind': x.kind, draggable: x.kind !== 'pub',
        title: x.kind === 'pub' ? `已发布到${x.r.platform}` : x.kind === 'plan' ? '计划发布（可以拖到别的日子）' : '拖到某一天就排上了',
        onClick: () => onOpen(x.p),
        onDragStart: x.kind === 'pub' ? undefined : e => { e.dataTransfer.setData('text/plain', x.p.id); e.dataTransfer.effectAllowed = 'move' },
      }, x.kind === 'pub' ? `✓ ${x.r.platform} · ${x.p.title}` : x.p.title)
      return h('div', { className: cls('stack') },
        h('div', { className: cls('row') },
          h(Btn, { sm: true, icon: 'left', label: '上个月', onClick: () => shift(-1) }),
          h('b', { className: cls('w-cal-title') }, `${ym.y} 年 ${ym.m + 1} 月`),
          h(Btn, { sm: true, icon: 'right', label: '下个月', onClick: () => shift(1) }),
          h(Btn, { sm: true, kind: 'ghost', onClick: () => setYm({ y: now.getFullYear(), m: now.getMonth() }) }, '今天'),
          h('span', { className: cls('faint') }, '虚线框是计划发布，绿色是已发布。')),
        h('div', { className: cls('w-cal') },
          ['一', '二', '三', '四', '五', '六', '日'].map(d => h('div', { key: d, className: cls('w-wd') }, '周' + d)),
          days.map(d => {
            const k = dkey(d)
            return h('div', {
              key: k, className: cls('w-day'), 'data-out': d.getMonth() !== ym.m || undefined, 'data-today': k === today || undefined, 'data-over': over === k || undefined,
              onDragOver: e => { e.preventDefault(); if (over !== k) setOver(k) },
              onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver('') },
              onDrop: e => {
                e.preventDefault(); setOver('')
                const p = items.find(x => x.id === e.dataTransfer.getData('text/plain'))
                if (p && p.plan !== k) onPatch(p, { plan: k })
              },
            }, h('span', { className: cls('w-dn') }, d.getDate()), (evs[k] || []).map((x, i) => ev(x, `${x.p.id}:${x.kind}:${i}`)))
          })),
        h('div', { className: cls('w-unsched') }, h('span', { className: cls('muted') }, '还没排期：'),
          unsched.length ? unsched.map(p => ev({ p, kind: 'none' }, p.id)) : h('span', { className: cls('faint') }, '都排好了')))
    }

    // ================================================================== 动态

    function ActivityPage() {
      const data = useData(() => wb('/api/activity?limit=120'), [])
      const list = useStore(projectsStore)
      useEffect(() => { if (!projectsStore.get()) projects.reload().catch(() => {}) }, [])
      const titleOf = id => (list ?? []).find(p => p.id === id)?.title || id
      const dayOf = iso => {
        const d = new Date(iso), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const y = new Date(Date.now() - 86400000)
        const yk = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
        return k === todayStr() ? '今天' : k === yk ? '昨天' : d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
      }
      let body
      if (data.error && !data.data) body = h(ErrorBox, { error: data.error, onRetry: data.reload })
      else if (!data.data) body = h(Loading)
      else if (!data.data.length) body = h(Empty, { title: '还没有记录', body: '新建、改状态、构建、打包、AI 改稿都会记在这里。' })
      else {
        const groups = []
        for (const e of data.data) {
          const g = dayOf(e.t)
          if (groups.at(-1)?.g !== g) groups.push({ g, items: [] })
          groups.at(-1).items.push(e)
        }
        body = groups.map(gr => h(Card, { key: gr.g, title: gr.g, note: `${gr.items.length} 条` }, h('div', { className: cls('w-feed') }, gr.items.map((e, i) => h('div', { key: i, className: cls('w-fe') },
          h('span', { className: cls('w-when') }, new Date(e.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })),
          h('div', { className: cls('grow') },
            h('button', { type: 'button', className: cls('w-link'), onClick: () => go('project', { id: e.id }) }, titleOf(e.id)),
            h('span', { className: cls('muted') }, `　${e.action}${e.detail ? '：' + e.detail : ''}`)))))))
      }
      return h(Page, { title: '动态', sub: '网页和命令行里的操作都会记在这里', actions: h(Btn, { icon: 'refresh', onClick: data.reload, busy: data.loading && !!data.data }, '刷新') }, body)
    }

    // ================================================================== 新建

    const wIdeaBrief = x => [x.angle && `切入角度：${x.angle}`, x.why && `为什么现在写：${x.why}`, x.hook && `开头可以用：${x.hook}`].filter(Boolean).join('\n')
    const W_HINTS = [['给谁看', '给谁看：'], ['切入角度', '切入角度：'], ['要写到的内容', '要写到：'], ['参考链接', '参考链接：'], ['篇幅', '篇幅：'], ['不要写的', '不要写：']]
    const W_AFTER = [
      { value: 'chat', label: '先查资料、出大纲', tip: 'AI 先查资料，在大纲页出大纲；你改好、点「开始写」再进写作页' },
      { value: 'draft', label: '直接写初稿', tip: '按题目和要求先写一版' },
      { value: 'self', label: '我自己写', tip: '建好空白的就行' },
    ]
    const W_SECS = [{ value: '30', label: '30 秒' }, { value: '60', label: '1 分钟' }, { value: '90', label: '1 分半（默认）' }, { value: '120', label: '2 分钟' }, { value: '180', label: '3 分钟' }]
    const W_PLACEHOLDER = {
      article: ['题目，比如：AI 浏览器横评', '想写成什么样？写给谁看、从哪切入、要写到哪些内容、参考链接、大概多长、不要写什么……\n想到什么写什么，写得越具体，AI 写得越接近你要的。'],
      script: ['题目，比如：200 块钱让 AI 当一周产品经理', '想拍成什么样？给谁看、开头想怎么抓人、要讲到哪几点、是录屏还是出镜、参考哪些视频或链接……\n想到什么写什么，写得越具体，口播稿越接近你要的。'],
      card: ['题目，比如：Kimi Work 拆解', '想做成什么样的卡片？写给谁看、讲哪几个点、参考哪些图或链接、几页……\n想到什么写什么，写得越具体，AI 做得越接近你要的。'],
    }

    /**
     * 新建作品。type: 'article' | 'card' | 'script'；idea 是选题广场 / 选题给的对象（可选），会把题目和要求先填好。
     * 写了要求的话，建好后让 AI 按要求先做（要求存进项目，助手每次都会读）。建好进项目。
     */
    function NewProjectModal({ type: initType = 'article', idea, onClose }) {
      const [type, setType] = useState(['article', 'script', 'card'].includes(initType) ? initType : 'article')
      const [name, setName] = useState(idea?.title ?? '')
      const [brief, setBrief] = useState(idea ? wIdeaBrief(idea) : '')
      const [after, setAfter] = useState(() => (W_AFTER.some(x => x.value === lsGet('newAfter', 'chat')) ? lsGet('newAfter', 'chat') : 'chat'))
      const [tpls, setTpls] = useState(null)
      const [tplId, setTplId] = useState('')
      const [pickTpl, setPickTpl] = useState(false)
      const [secs, setSecs] = useState('90')
      const [from, setFrom] = useState(null)
      const [ideas, setIdeas] = useState(idea ? { items: [idea], pre: true } : null)
      const [picked, setPicked] = useState(idea ? 0 : null)
      const [ideaOpen, setIdeaOpen] = useState(!!idea)
      const [dir, setDir] = useState('')
      const [finding, setFinding] = useState(0)
      const [creating, setCreating] = useState(false)
      const [, setNow] = useState(0)
      const fromIdea = useRef(!!idea)   // 要求是选题填进来的（作者还没动过），换一个选题时可以整段换掉
      const nameRef = useRef(null)
      const briefRef = useRef(null)
      const all = useStore(projectsStore) ?? []
      const cardSrc = all.filter(p => p.type === 'card')
      useEffect(() => {
        wb('/api/templates').then(l => { setTpls(l); setTplId(cur => cur || (l.find(x => x.kind === 'mine') || l[0])?.id || '') }, () => setTpls([]))
        if (!idea) wb('/api/plaza/ideas').then(d => { if (d?.items?.length) setIdeas(cur => cur ?? d) }, () => {})
        if (!projectsStore.get()) projects.reload().catch(() => {})
      }, [])
      usePoll(() => setNow(Date.now()), 500, !!finding)

      const tpl = tpls?.find(x => x.id === tplId)
      const [phName, phBrief] = W_PLACEHOLDER[type]
      const addHint = text => {
        fromIdea.current = false
        setBrief(b => b.replace(/\s*$/, '') + (b.trim() ? '\n' : '') + text)
        setTimeout(() => { const el = briefRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }, 0)
      }
      const pickIdea = i => {
        const x = ideas.items[i]
        setPicked(i); setName(x.title)
        if (!brief.trim() || fromIdea.current) { setBrief(wIdeaBrief(x)); fromIdea.current = true }
      }
      const findIdeas = async () => {
        if (finding) return
        setFinding(Date.now())
        try { setIdeas(await wbPost('/api/plaza/ideas', { direction: dir.trim(), type, days: 7, provider: currentProvider() })); setPicked(null) } catch (e) { notify(e.message) } finally { setFinding(0) }
      }
      const create = async () => {
        if (creating) return
        const nm = name.trim()
        if (!nm) { nameRef.current?.focus(); notify('先写个题目', { tone: 'warn' }); return }
        const br = brief.trim()
        const chosen = picked != null && ideas?.items?.[picked]?.title === nm ? ideas.items[picked] : ideas?.items?.find(x => x.title === nm)
        const sec = +secs || 90
        setCreating(true)
        try {
          const p = await wbPost('/api/projects', {
            type, name: nm, brief: br, phase: after === 'chat' ? 'outline' : '',
            from: type === 'card' ? (from ?? cardSrc[0]?.id ?? '') : '',
            template: type === 'article' && tplId ? tplId : undefined,
            idea: chosen, script: type === 'script' ? { seconds: sec } : undefined,
          })
          await projects.reload().catch(() => {})
          // 进项目后替作者把第一句话发给助手：先聊大纲，或者直接写
          const what = type === 'card' ? '这组卡片' : type === 'script' ? '这条视频的口播稿' : '这篇', need = br ? '按我新建时写的要求' : '按题目'
          if (after === 'chat') pendingChat.set(p.id, `我想做${what}《${nm}》，先定大纲。${need}先去查资料，把查到的一手资料记进资料页；再根据资料定标题，把大纲写进大纲页（outline.md）。小标题要让人一眼看懂这节讲什么。拿不准的问我。`)
          if (after === 'draft') pendingChat.set(p.id, type === 'card' ? `${need}，先做一版卡片。` : type === 'script' ? `${need}，照 article.md 里的骨架先写一版完整的口播稿，总时长控制在 ${wFmtSec(sec)}左右，每段都要写口播原话和画面提示。` : `${need}，先写一版初稿。`)
          const tab = after === 'chat' ? 'outline' : after !== 'self' ? (type === 'card' ? 'tune' : 'write') : chosen && type !== 'card' ? 'research' : undefined
          toast('建好了：' + p.title)
          onClose()
          go('project', { id: p.id, tab })
        } catch (e) { notify(e.message); setCreating(false) }
      }
      const cmdEnter = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); create() } }
      const afterTip = W_AFTER.find(x => x.value === after)?.tip
      const sinceFind = finding ? Math.round((Date.now() - finding) / 1000) : 0

      return h(Fragment, null,
        h(Modal, {
          title: '新建', onClose, width: 640, footer: [
            h('span', { key: 'k', className: cls('faint', 'w-gap') }, '⌘↵ 创建'),
            h(Btn, { key: 'c', onClick: onClose }, '取消'),
            h(Btn, { key: 'o', kind: 'primary', icon: 'plus', busy: creating, onClick: create }, '创建'),
          ],
        },
        h(Seg, { label: '类型', value: type, onChange: setType, stretch: true, options: [{ value: 'article', label: '文章' }, { value: 'script', label: '视频脚本' }, { value: 'card', label: '小红书卡片' }] }),
        h(Field, { label: '题目' }, h(Input, {
          inputRef: nameRef, value: name, onChange: v => setName(v), placeholder: phName, autoFocus: true, autoComplete: 'off',
          onKeyDown: e => { cmdEnter(e); if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) { e.preventDefault(); briefRef.current?.focus() } },
        })),
        h(Field, { label: '要求（可以不写）', hint: '写了要求，AI 每次动笔前都会先读一遍' },
          h(Textarea, { inputRef: briefRef, value: brief, rows: 6, placeholder: phBrief, onChange: v => { fromIdea.current = false; setBrief(v) }, onKeyDown: cmdEnter }),
          h('div', { className: cls('w-hints') }, W_HINTS.map(([n, text]) => h('button', { key: n, type: 'button', className: cls('w-hint'), onClick: () => addHint(text) }, '+ ' + n)))),
        h(Field, { label: '建好以后', group: true, hint: after === 'draft' && type === 'card' ? '按题目和要求先做一版' : after === 'draft' && type === 'script' ? '按题目和要求先写一版口播稿' : afterTip },
          h(Seg, { label: '建好以后', value: after, onChange: v => { setAfter(v); lsSet('newAfter', v) }, options: W_AFTER })),
        type === 'article' ? h(Field, { label: '模板', group: true },
          h('button', { type: 'button', className: cls('w-tplbtn'), onClick: () => setPickTpl(true) },
            tpl ? h('img', { src: fileUrl(tpl.preview || `/tpl-preview/${enc(tpl.id)}`), alt: '' }) : null,
            h('span', { className: cls('grow') }, h('b', null, tpl ? tpl.name : tpls ? '默认样式' : '正在读模板…'), tpl ? h('span', { className: cls('faint') }, [tpl.group, tpl.desc].filter(Boolean).join(' · ')) : null),
            h('span', { className: cls('faint') }, '换一个')))
          : type === 'script' ? h(Field, { label: '时长', hint: '口播稿按这个时长写，大约每秒 4.5 个字' }, h(Select, { value: secs, onChange: setSecs, options: W_SECS }))
            : h(Field, { label: '样式', hint: '新卡片照着哪一组的样式做' }, h(Select, {
              value: from ?? cardSrc[0]?.id ?? '', onChange: setFrom,
              options: [...cardSrc.map(p => ({ value: p.id, label: `照着「${p.title}」的样式` })), { value: '', label: '空白开始' }],
            })),
        h('div', { className: cls('w-idea-box') },
          h('button', { type: 'button', className: cls('w-fold'), 'aria-expanded': ideaOpen, onClick: () => setIdeaOpen(!ideaOpen) },
            h(Icon, { name: 'spark' }), h('span', { className: cls('grow') }, '没想好写什么？让 AI 找选题'),
            ideas?.items?.length && !ideaOpen ? h('span', { className: cls('faint') }, `上次找了 ${ideas.items.length} 个`) : null,
            h(Icon, { name: ideaOpen ? 'down' : 'right' })),
          ideaOpen ? h('div', { className: cls('stack') },
            h('div', { className: cls('row') },
              h('span', { className: cls('grow') }, h(Input, { value: dir, onChange: setDir, placeholder: '方向，可以不填。比如：AI 浏览器、本周 AI 新产品', onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); findIdeas() } } })),
              h(Btn, { icon: 'search', busy: !!finding, onClick: findIdeas }, finding ? `找选题中 ${sinceFind} 秒` : '找选题')),
            ideas?.items?.length
              ? h(Fragment, null,
                h('div', { className: cls('w-ideas') }, ideas.items.map((x, i) => h('button', { key: i, type: 'button', className: cls('w-idea'), 'aria-pressed': picked === i, onClick: () => pickIdea(i) },
                  h('b', null, x.title), x.angle ? h('span', { className: cls('muted', 'clamp2') }, x.angle) : null,
                  h('span', { className: cls('faint') }, [x.evidence?.length ? `${x.evidence.length} 条证据${x.firstHand ? ' · 含一手' : ''}` : x.sources?.length ? `${x.sources.length} 个来源` : '', x.brief ? '有写作简报' : ''].filter(Boolean).join(' · '))))),
                h('span', { className: cls('faint') }, ideas.pre ? '从选题广场带过来的。' : `找于 ${wFmtTime(ideas.t)}${ideas.direction ? ` · 方向「${ideas.direction}」` : ''}。`, '点一个，题目和要求会填好，你再改。'))
              : h('span', { className: cls('faint') }, '从选题广场最近 7 天的动态里挑，大约一分钟。'),
            h('span', null, h(Btn, { sm: true, kind: 'ghost', icon: 'right', onClick: () => { onClose(); go('plaza') } }, '去选题广场看全部动态'))) : null)),
        pickTpl ? h(TemplateModal, { current: tplId, onPick: id => setTplId(id), onClose: () => setPickTpl(false) }) : null)
    }

    // ================================================================== 模板、版本

    const W_TPL_GROUPS = [['我的文章', '你其他文章现在用的样式'], ['墨滴 mdnice', '来自 mdnice/markdown-nice 的开源主题'], ['doocs/md', '来自 doocs/md 的开源主题']]

    /**
     * 挑文章模板。不传 project = 新建时挑，onPick(模板 id)；传 project = 给这篇换模板（只换样式、正文不动，换完重新构建），换完 onApplied()。
     */
    function TemplateModal({ project, current, onPick, onApplied, onClose }) {
      const [list, setList] = useState(null)
      const [canRevert, setCanRevert] = useState(false)
      const [sel, setSel] = useState(current || '')
      const [busy, setBusy] = useState('')
      useEffect(() => {
        wb('/api/templates').then(l => {
          const ok = l.filter(x => !(project && x.project === project.id))
          setList(ok); setSel(s => (ok.some(x => x.id === s) ? s : ok[0]?.id || ''))
        }, e => { setList([]); notify(e.message) })
        if (project) wb(pApi(project, 'studio/template')).then(r => setCanRevert(!!r.canRevert), () => {})
      }, [])
      const cur = list?.find(x => x.id === sel)
      const pic = tp => fileUrl(tp.preview || `/tpl-preview/${enc(tp.id)}`)
      const ok = async () => {
        if (!cur) return
        if (!project) { onPick?.(cur.id); onClose(); return }
        setBusy('apply')
        try {
          const r = await wbPost(pApi(project, 'studio/template'), { template: cur.id })
          if (r.built) toast(`换成了「${cur.name}」，已重新构建`)
          else notify(`换成了「${cur.name}」，但构建报错了：${r.error}`, { tone: 'warn' })
          onApplied?.(); onClose()
        } catch (e) { notify(e.message); setBusy('') }
      }
      const revert = async () => {
        setBusy('revert')
        try { await wbPost(pApi(project, 'studio/template'), { revert: true }); toast('已恢复换模板前的样式'); onApplied?.(); onClose() } catch (e) { notify(e.message); setBusy('') }
      }
      const groups = [...W_TPL_GROUPS, ...[...new Set((list ?? []).map(x => x.group))].filter(g => !W_TPL_GROUPS.some(([n]) => n === g)).map(g => [g, ''])]
      return h(Modal, {
        title: project ? `给《${project.title.slice(0, 20)}》换模板` : '选一个模板', onClose, width: 980, footer: [
          project && canRevert ? h(Btn, { key: 'r', icon: 'undo', busy: busy === 'revert', disabled: !!busy, onClick: revert }, '恢复换模板前的样式')
            : h('span', { key: 'r', className: cls('faint') }, project ? '只换样式，正文不动；换完会重新构建' : '预览用的是一篇示例文章'),
          h('span', { key: 'g', className: cls('w-gap') }),
          h(Btn, { key: 'c', onClick: onClose }, '取消'),
          h(Btn, { key: 'o', kind: 'primary', icon: 'check', busy: busy === 'apply', disabled: !cur || !!busy, onClick: ok }, project ? '套用到这篇' : '用这个'),
        ],
      }, !list ? h(Loading) : !list.length ? h(Empty, { title: '没有可用的模板' }) : h('div', { className: cls('w-tpl') },
        h('div', { className: cls('w-tpl-list') }, groups.map(([g, tip]) => {
          const xs = list.filter(x => x.group === g)
          return xs.length ? h('section', { key: g, className: cls('stack') },
            h('div', null, h('b', { className: cls('h2') }, g), tip ? h('span', { className: cls('faint') }, '　' + tip) : null),
            h('div', { className: cls('w-tpl-grid') }, xs.map(tp => h('button', { key: tp.id, type: 'button', className: cls('w-tpc'), 'aria-pressed': tp.id === sel, onClick: () => setSel(tp.id), onDoubleClick: () => { setSel(tp.id); if (!project) { onPick?.(tp.id); onClose() } } },
              h('img', { src: pic(tp), alt: '', loading: 'lazy' }), h('b', null, tp.name), tp.desc ? h('span', { className: cls('clamp2') }, tp.desc) : null)))) : null
        })),
        cur ? h('div', { className: cls('w-tpl-view') },
          h('div', null, h('b', null, cur.name), h('div', { className: cls('faint') }, [cur.desc, cur.author ? '作者 ' + cur.author : '', cur.license ? `${cur.source}（${cur.license}）` : ''].filter(Boolean).join(' · '))),
          h('img', { src: pic(cur), alt: `${cur.name} 的预览` })) : null))
    }

    /** 历史版本：每次 AI 改动、手动改样式前都会自动存一份；恢复前会把现在的也存一份。 */
    function VersionsModal({ project, file = 'index.html', onClose, onRestored }) {
      const data = useData(() => wb(pApi(project, `versions?file=${enc(file)}`)), [project.id, file])
      const [busy, setBusy] = useState('')
      const restore = async v => {
        setBusy(v.name)
        try { await wbPost(pApi(project, 'restore'), { file, name: v.name }); toast('已恢复'); onRestored?.(); onClose() } catch (e) { notify(e.message); setBusy('') }
      }
      return h(Modal, { title: `历史版本 · ${file}`, onClose, width: 520, footer: h(Btn, { onClick: onClose }, '关闭') },
        data.error ? h(ErrorBox, { error: data.error, onRetry: data.reload }) : !data.data ? h(Loading) : !data.data.length ? h(Empty, { title: '还没有历史版本', body: 'AI 改动、手动改样式之前会自动存一份。' })
          : h(Fragment, null,
            h('p', { className: cls('modal-text') }, '点「恢复」回到那个版本。恢复前会把现在的也存一份，不怕点错。'),
            h('div', { className: cls('w-vlist') }, data.data.slice(0, 40).map(v => h('div', { key: v.name, className: cls('w-vi') },
              h('span', null, wFmtTime(v.t)), h('span', { className: cls('faint', 'grow') }, v.label || ''),
              h(Btn, { sm: true, busy: busy === v.name, disabled: !!busy, onClick: () => restore(v) }, '恢复'))))))
    }

    /** 文章转成视频脚本：选时长、可以补一句侧重点；建好进脚本的写作页，替作者把第一句话发给助手。 */
    function WToScriptModal({ project: p, onClose }) {
      const [secs, setSecs] = useState('90')
      const [brief, setBrief] = useState('')
      const [busy, setBusy] = useState(false)
      const go2 = async () => {
        setBusy(true)
        try {
          const n = await wbPost('/api/projects', { type: 'script', fromArticle: p.id, brief: brief.trim(), script: { seconds: +secs } })
          await projects.reload().catch(() => {})
          pendingChat.set(n.id, n.auto)
          toast('建好了视频脚本：' + n.title)
          onClose()
          go('project', { id: n.id, tab: 'write' })
        } catch (e) { notify(e.message); setBusy(false) }
      }
      return h(Modal, { title: '转成视频脚本', onClose, width: 480, footer: [h(Btn, { key: 'c', onClick: onClose }, '取消'), h(Btn, { key: 'o', kind: 'primary', icon: 'film', busy, onClick: go2 }, '开始转写')] },
        h('p', { className: cls('modal-text') }, `把《${p.title}》转写成一条视频的口播稿。会新建一个视频脚本，文章本身不动。AI 会先把文章读完，挑最值得讲的几个点，改成说得出口的话，并写好每段配什么画面。`),
        h(Field, { label: '视频多长', group: true }, h(Seg, { value: secs, onChange: setSecs, options: [{ value: '60', label: '1 分钟' }, { value: '90', label: '1 分半' }, { value: '120', label: '2 分钟' }, { value: '180', label: '3 分钟' }] })),
        h(Field, { label: '想侧重讲什么（可以不填）' }, h(Textarea, { value: brief, onChange: setBrief, rows: 3, placeholder: '比如：只讲价格和怎么买；给完全没用过的人看；开头用那个日活数字' })))
    }

    // ================================================================== 项目详情外框

    /** 每种作品有哪几步（主线），另外几个次要入口（放在步骤条右边）。 */
    function wStepsOf(p) {
      const extra = [['notes', '笔记', 'edit'], ['info', '信息', 'info']]
      if (p.type === 'card') return { main: [['outline', '大纲'], ['browse', '浏览'], ['tune', '精修']], extra }
      if (p.form === 'script') return { main: [['research', '资料'], ['outline', '大纲'], ['write', '写作'], ['check', '体检'], ['prompter', '提词']], extra }
      return { main: [['research', '资料'], ['outline', '大纲'], ['write', '写作'], ['check', '体检'], ['publish', '发布']], extra: [['read', '阅读', 'eye'], ...extra] }
    }

    function ProjectPage({ id, tab }) {
      const [p, setP] = useState(null)
      const [err, setErr] = useState(null)
      const [cur, setCur] = useState(tab || '')
      const [focus, setFocus] = useState('')
      const [version, setVersion] = useState(0)
      const [paneOpen, setPaneOpen] = useState(() => lsGet('chatPane', '1') !== '0')
      const [paneW, setPaneW] = useState(() => +lsGet('chatPaneW', '400') || 400)
      const [busy, setBusy] = useState('')
      const [log, setLog] = useState(null)
      const [dlg, setDlg] = useState('')
      const [title, setTitle] = useState('')
      const stamp = useRef('')
      const reload = useCallback(async () => {
        try { const v = await wb(pApi(id)); setP(v); setErr(null); return v } catch (e) { setErr(e); return null }
      }, [id])
      useEffect(() => { reload() }, [reload])
      useEffect(() => { if (tab) setCur(tab) }, [tab])
      useEffect(() => { if (p) setTitle(p.title) }, [p?.title])
      const onChanged = useCallback(() => { setVersion(v => v + 1); reload() }, [reload])
      const goTab = useCallback(k => { setCur(k); go('project', { id, tab: k }) }, [id])

      const steps = p ? wStepsOf(p) : null
      const keys = steps ? [...steps.main, ...steps.extra].map(x => x[0]) : []
      const at = !p ? '' : keys.includes(cur) ? cur : p.phase === 'outline' ? 'outline' : p.type === 'card' ? 'browse' : 'write'
      useEffect(() => { setFocus('') }, [at])
      // 命令行或别的地方改了这个项目：在写作、精修、大纲时不动（那几页自己会跟上），别的页刷新一下
      usePoll(async () => {
        try {
          const s = await wb('/api/stamp')
          const changed = stamp.current && s.stamp !== stamp.current
          stamp.current = s.stamp
          if (changed && !['write', 'tune', 'outline'].includes(at) && !document.activeElement?.closest?.('input,textarea,[contenteditable="true"]')) reload()
        } catch { /* 下次再看 */ }
      }, 4000, !!p)

      if (!p) {
        if (err) return h(Page, { title: '打不开这个作品' }, h(ErrorBox, { error: err, onRetry: reload }), h(Row, null, h(Btn, { icon: 'left', onClick: () => go('works') }, '回到作品')))
        return h(Loading, { text: '正在打开…' })
      }

      const card = p.type === 'card', script = p.form === 'script'
      const patchP = async (body, msg) => {
        try { const r = await wPatch(p, body); setP(r); if (msg) toast(msg) } catch (e) { notify(e.message) }
      }
      const saveTitle = () => {
        const v = title.trim()
        if (v && v !== p.title) patchP({ title: v }, '标题已改'); else setTitle(p.title)
      }
      const run = async what => {
        if (busy) return
        setBusy(what)
        try {
          const r = await wbPost(pApi(p, what))
          toast(what === 'pack' ? `打包好了：${r.zip}（${r.size}）` : card ? '渲染好了' : '构建好了')
          if (r.project) setP(r.project); else reload()
          setVersion(v => v + 1)
          projects.reload().catch(() => {})
        } catch (e) { setLog({ title: what === 'pack' ? '打包没成功' : card ? '渲染没成功' : '构建没成功', text: e.message }) } finally { setBusy('') }
      }
      const openHow = how => wbPost(pApi(p, 'open'), { how }).then(() => toast('已打开'), e => notify(e.message))
      const copySay = async () => {
        try { copyText(wSayOf(await wb(`/p/${enc(p.id)}/article.md`, { raw: true })), '口播稿已复制') } catch (e) { notify(e.message) }
      }
      const downloadZip = () => { const a = document.createElement('a'); a.href = projectFile(p, p.zip); a.download = p.zip; a.click() }
      const verFile = card ? 'index.html' : 'article.md'

      const moreItems = [
        !card && !script ? { key: 'tpl', label: '换模板', icon: 'image', onClick: () => setDlg('template') } : null,
        !card && !script ? { key: 'toscript', label: '转成视频脚本', icon: 'film', note: '新建一个视频脚本，文章不动', onClick: () => setDlg('script') } : null,
        script ? { key: 'say', label: '复制口播稿', icon: 'copy', note: '只复制要说出口的话', onClick: copySay } : null,
        !card ? { sep: true } : null,
        { key: 'pack', label: busy === 'pack' ? '正在打包…' : '打包成 zip', icon: 'archive', disabled: !!busy, onClick: () => run('pack') },
        p.zip ? { key: 'zip', label: `下载 ${p.zip}`, icon: 'download', onClick: downloadZip } : null,
        { sep: true },
        { key: 'preview', label: '在浏览器里打开', icon: 'eye', onClick: () => openHow('preview') },
        { key: 'edit', label: '用文本编辑器打开', icon: 'edit', onClick: () => openHow('edit') },
        { key: 'cli', label: '复制命令行写法', icon: 'copy', onClick: () => copyText(`xy show "${p.title}"`, `已复制：xy show "${p.title}"`) },
        { sep: true },
        { key: 'set', label: 'AI 设置', icon: 'settings', onClick: () => go('settings') },
      ]
      const header = h('header', { className: cls('w-phead') },
        h(Btn, { kind: 'ghost', sm: true, icon: 'left', label: '回到作品', onClick: () => go('works') }),
        h('input', {
          className: cls('w-ptitle'), value: title, 'aria-label': '标题', title: '点一下改标题',
          onChange: e => setTitle(e.target.value), onBlur: saveTitle,
          onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); if (e.key === 'Escape') { setTitle(p.title); setTimeout(() => e.target.blur(), 0) } },
        }),
        h(Tag, { tone: 'outline' }, p.typeName),
        h(Menu, { kind: 'ghost', sm: true, tip: '改状态', label: h(StatusTag, { status: p.status }), items: W_STATUSES.map(s => ({ key: s, label: s, current: s === p.status, onClick: () => patchP({ status: s }, `状态改成了「${s}」`) })) }),
        h('span', { className: cls('w-star'), 'data-on': p.pinned || undefined }, h(Btn, { kind: 'ghost', sm: true, icon: 'star', label: p.pinned ? '取消星标' : '加星标', onClick: () => patchP({ pinned: !p.pinned }) })),
        h(WTags, { tags: p.tags, onChange: tags => patchP({ tags }) }),
        h('label', { className: cls('w-plan'), title: '计划哪天发' }, h(Icon, { name: 'calendar', size: 14 }),
          h('input', { type: 'date', className: cls('input', 'w-date'), value: p.plan || '', 'aria-label': '计划发布日期', onChange: e => patchP({ plan: e.target.value }) })),
        h('span', { className: cls('w-gap') }),
        h('span', { className: cls('faint', 'w-nowrap') }, `${wSizeOf(p)} · ${ago(p.updated)}更新`),
        card ? h(Btn, { kind: 'primary', sm: true, icon: 'play', busy: busy === 'build', disabled: !!busy && busy !== 'build', onClick: () => run('build') }, '渲染成图')
          : !script ? h(Btn, { sm: true, icon: 'refresh', busy: busy === 'build', disabled: !!busy && busy !== 'build', tip: '重新生成公众号版和 X 版', onClick: () => run('build') }, '构建') : null,
        h(Btn, { kind: 'ghost', sm: true, icon: 'folder', label: '在访达里打开文件夹', onClick: () => openHow('finder') }),
        h(Btn, { kind: 'ghost', sm: true, icon: 'clock', label: '历史版本', onClick: () => setDlg('versions') }),
        h(Menu, { kind: 'ghost', sm: true, icon: 'more', tip: '更多', align: 'right', items: moreItems }))

      const chatStep = at === 'outline' || at === 'write'
      const nav = h('div', { className: cls('w-pnav') },
        h(Steps, { label: '步骤', current: at, onPick: goTab, steps: steps.main.map(([k, label]) => ({ key: k, label, state: k === at ? 'doing' : 'todo' })) }),
        h('span', { className: cls('w-gap') }),
        h('div', { className: cls('w-extra') }, steps.extra.map(([k, label, icon]) => h('button', { key: k, type: 'button', className: cls('btn', 'btn-ghost', 'btn-sm', 'w-xbtn'), 'aria-pressed': k === at, onClick: () => goTab(k) },
          h(Icon, { name: icon, size: 14 }), h('span', { className: cls('btn-label') }, label), k === 'notes' && p.noteSize ? h('i', { className: cls('w-xdot'), 'aria-label': '有笔记' }) : null))),
        chatStep && !paneOpen ? h(Btn, { sm: true, icon: 'chat', onClick: () => { setPaneOpen(true); lsSet('chatPane', '1') } }, 'AI 助手') : null)

      // 各步的内容：文章那几步在 30 段，卡片、信息、笔记在这一段。别的段还没写好时先显示一句话。
      const VIEWS = {
        research: typeof ResearchTab === 'function' ? ResearchTab : null,
        outline: typeof OutlineTab === 'function' ? OutlineTab : null,
        write: typeof WriteTab === 'function' ? WriteTab : null,
        check: typeof CheckTab === 'function' ? CheckTab : null,
        publish: typeof PublishTab === 'function' ? PublishTab : null,
        prompter: typeof PrompterTab === 'function' ? PrompterTab : null,
        read: typeof ReadTab === 'function' ? ReadTab : null,
        browse: CardBrowseTab, tune: CardTuneTab, info: InfoTab, notes: NotesTab,
      }
      const View = VIEWS[at]
      const Chat = typeof ChatPane === 'function' ? ChatPane : null
      const tabProps = { key: `${p.id}:${at}`, project: p, reload, goTab, version, setFocus, onChanged, run, busy }
      const body = h('div', { className: cls('w-pbody'), 'data-fill': at === 'tune' || undefined },
        View ? h(View, tabProps) : h(Empty, { title: '这一步还在做', body: '过一会儿再来看看。' }))
      const side = chatStep && paneOpen ? h(SidePane, {
        width: paneW, min: 320, max: 640, onResize: w => { setPaneW(w); lsSet('chatPaneW', String(w)) },
        title: 'AI 助手', sub: at === 'outline' ? '和你一起查资料、定大纲' : '和你一起写，能直接改稿',
        tools: h(Btn, { kind: 'ghost', sm: true, icon: 'x', label: '收起助手', onClick: () => { setPaneOpen(false); lsSet('chatPane', '0') } }),
      }, Chat ? h(Chat, { key: p.id, project: p, stage: at, focus, version, onChanged }) : h(Empty, { title: 'AI 助手还在做' })) : null

      return h('div', { className: cls('w-proj') },
        h('div', { className: cls('w-proj-main') }, header, nav, body),
        side,
        log ? h(Modal, { title: log.title, onClose: () => setLog(null), width: 640, footer: h(Btn, { kind: 'primary', onClick: () => setLog(null) }, '知道了') },
          h('pre', { className: cls('w-log') }, String(log.text).split('\n').slice(-40).join('\n'))) : null,
        dlg === 'versions' ? h(VersionsModal, { project: p, file: verFile, onClose: () => setDlg(''), onRestored: onChanged }) : null,
        dlg === 'template' ? h(TemplateModal, { project: p, onApplied: onChanged, onClose: () => setDlg('') }) : null,
        dlg === 'script' ? h(WToScriptModal, { project: p, onClose: () => setDlg('') }) : null)
    }

    // ================================================================== 信息、笔记

    function InfoTab({ project: p, reload }) {
      const [brief, setBrief] = useState(p.brief || '')
      const [adding, setAdding] = useState(null)
      useEffect(() => { setBrief(p.brief || '') }, [p.brief])
      const save = async (body, msg = '已保存') => { try { await wPatch(p, body); if (msg) toast(msg); reload() } catch (e) { notify(e.message) } }
      const card = p.type === 'card'
      const files = p.files ?? []
      const fsize = f => (f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.max(1, f.size / 1024 | 0)} KB`)
      const removePub = async i => {
        const r = p.published[i]
        if (!(await ask({ title: '删掉这条发布记录？', text: `${r.platform} · ${r.date}`, ok: '删掉', danger: true }))) return
        save({ published: p.published.filter((_, k) => k !== i) }, '已删掉')
      }
      return h('div', { className: cls('w-tabpad', 'w-info') },
        h(Card, { title: '基本信息' }, h('dl', { className: cls('w-props') },
          h('dt', null, '类型'), h('dd', null, p.typeName, h('span', { className: cls('faint') }, card ? `${p.pages} 页，已渲染 ${p.images} 张` : p.form === 'script' ? wSizeOf(p) : `${p.chars} 字`)),
          h('dt', null, '状态'), h('dd', null, h(Seg, { label: '状态', value: p.status, options: W_STATUSES, onChange: s => save({ status: s }) })),
          h('dt', null, '标签'), h('dd', null, h(WTags, { tags: p.tags, onChange: tags => save({ tags }, '') })),
          h('dt', null, '计划发布'), h('dd', null, h('input', { type: 'date', className: cls('input', 'w-date'), value: p.plan || '', 'aria-label': '计划发布日期', onChange: e => save({ plan: e.target.value }) }),
            p.plan ? h(Btn, { sm: true, kind: 'ghost', onClick: () => save({ plan: '' }) }, '清空') : null),
          h('dt', null, '成品'), h('dd', null, p.zip ? h(Btn, { sm: true, icon: 'download', href: projectFile(p, p.zip), download: p.zip }, p.zip) : h('span', { className: cls('faint') }, '还没打包')),
          h('dt', null, '位置'), h('dd', null, h('button', { type: 'button', className: cls('w-path'), title: '点一下复制路径', onClick: () => copyText(p.dir, '已复制路径') }, p.dir)),
          h('dt', null, '时间'), h('dd', null, h('span', { className: cls('faint') }, `创建 ${wFmtTime(p.created)} · 更新 ${ago(p.updated)}`)))),
        h(Card, { title: '要求', sub: '写给谁看、讲什么、不要写什么。AI 助手每次动笔前都会读。' },
          h(Textarea, { value: brief, onChange: setBrief, rows: 5, placeholder: '还没写要求', onBlur: () => { if (brief !== (p.brief || '')) save({ brief }, '要求已保存') } })),
        h(Card, { title: '发布记录', note: p.published.length ? `${p.published.length} 条` : '', action: adding ? null : h(Btn, { sm: true, icon: 'plus', onClick: () => setAdding({ platform: '公众号', url: '', date: todayStr() }) }, '记一笔') },
          p.published.length ? h('div', { className: cls('w-feed') }, p.published.map((r, i) => h('div', { key: i, className: cls('w-fe') },
            h(Tag, { tone: 'success' }, r.platform), h('span', { className: cls('faint') }, r.date),
            r.url ? h('a', { className: cls('w-url', 'grow'), href: r.url, target: '_blank', rel: 'noreferrer' }, r.url) : h('span', { className: cls('grow') }),
            h(Btn, { sm: true, kind: 'ghost', icon: 'trash', label: '删掉这条', onClick: () => removePub(i) })))) : adding ? null : h('span', { className: cls('faint') }, '还没发布过。发了之后记一笔，状态会自动改成「已发布」。'),
          adding ? h('div', { className: cls('row') },
            h('span', { className: cls('w-pf') }, h(Select, { value: adding.platform, onChange: v => setAdding({ ...adding, platform: v }), options: W_PLATFORMS, 'aria-label': '平台' })),
            h('span', { className: cls('grow') }, h(Input, { value: adding.url, onChange: v => setAdding({ ...adding, url: v }), placeholder: '链接（可以不填）' })),
            h('input', { type: 'date', className: cls('input', 'w-date'), value: adding.date, 'aria-label': '发布日期', onChange: e => setAdding({ ...adding, date: e.target.value }) }),
            h(Btn, { sm: true, kind: 'primary', onClick: () => { save({ addPublish: { ...adding, url: adding.url.trim() } }, '记下了，状态改成了「已发布」'); setAdding(null) } }, '记下'),
            h(Btn, { sm: true, onClick: () => setAdding(null) }, '取消')) : null),
        h(Card, { title: '构建和打包', sub: '这两条命令只能在命令行里改（xy set 项目 --build "命令"），这里只看。' }, h('dl', { className: cls('w-props') },
          h('dt', null, '构建'), h('dd', null, h('code', { className: cls('w-code') }, p.commands?.build || (card ? '默认：用 Chrome 把每页截成图' : '默认：node build.mjs'))),
          h('dt', null, '打包'), h('dd', null, h('code', { className: cls('w-code') }, p.commands?.pack || (card ? '默认：把 out/ 里的图打成 zip' : '默认：把 out/ 和 article.md 打成 zip'))))),
        h(Card, { title: '操作记录', note: p.history?.length ? `最近 ${Math.min(30, p.history.length)} 条` : '' },
          p.history?.length ? h('div', { className: cls('w-feed') }, p.history.slice(0, 30).map((it, i) => h('div', { key: i, className: cls('w-fe') },
            h('span', { className: cls('w-when') }, wFmtTime(it.t)), h('div', { className: cls('grow') }, h('b', { className: cls('w-b') }, it.action), h('span', { className: cls('muted') }, it.detail ? '　' + it.detail : '')))))
            : h('span', { className: cls('faint') }, '还没有记录。网页和命令行里的修改、构建、打包都会记在这里。')),
        h(Card, { title: `文件（${files.filter(f => !f.dir).length}）` }, h('details', { className: cls('w-files') }, h('summary', null, '展开看全部文件'),
          h('div', { className: cls('w-flist') }, files.map(f => h('div', { key: f.path, className: cls('w-frow'), style: { paddingLeft: `${(f.path.split('/').length - 1) * 18}px` } },
            f.dir ? h('b', { className: cls('w-b') }, f.path.split('/').pop() + '/') : h('a', { href: webUrl(`/p/${enc(p.id)}/` + f.path.split('/').map(enc).join('/')), target: '_blank', rel: 'noreferrer' }, f.path.split('/').pop()),
            h('span', { className: cls('grow') }),
            f.dir ? null : h('span', { className: cls('faint') }, fsize(f)),
            h('span', { className: cls('faint', 'w-ftime') }, ago(new Date(f.t).toISOString()))))))))
    }

    /** 笔记：左边写，右边看效果，停手 0.7 秒自动保存（离开这一页时没存的也会存上）。 */
    function NotesTab({ project: p }) {
      const [text, setText] = useState(p.notes || '')
      const [state, setState] = useState('自动保存')
      const timer = useRef(null)
      const latest = useRef(text)
      const save = useCallback(async v => {
        try { await wbPatch(pApi(p), { notes: v }); setState('已保存 ' + new Date().toLocaleTimeString('zh-CN')) } catch (e) { setState('没保存上：' + e.message) }
      }, [p.id])
      useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); save(latest.current) } }, [save])
      const onChange = v => {
        setText(v); latest.current = v; setState('正在输入…')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => { timer.current = null; save(v) }, 700)
      }
      return h('div', { className: cls('w-tabpad') },
        h('div', { className: cls('w-notes') },
          h('div', { className: cls('stack') }, h(Textarea, { value: text, onChange, placeholder: '写点什么：选题想法、修改意见、发布后的数据……支持简单的 Markdown', 'aria-label': '笔记' }), h('span', { className: cls('faint') }, state)),
          h('div', { className: cls('w-notes-md') }, text.trim() ? h(Md, { text }) : h('span', { className: cls('faint') }, '右边会显示排版后的样子'))))
    }

    // ================================================================== 卡片：浏览、精修

    // 卡片是一个 HTML 文件（index.html，每张是 section.card[data-n]）。不用 iframe：把它的 <style> 和正文拿出来放进 shadow DOM。
    // 里面的相对地址（img/xx.png、url(img/ul.svg)）都换成工作台上的完整地址；:root / html / body 的样式换到两层外壳上。
    // 只看一页时，照工作台截图的办法给外壳加 one、给那一页加 show（卡片自己的样式就会只显示那一页）。
    const W_CARD_CSS = `:host{display:block}.wb-html,.wb-body{display:block}
.wb-one section[data-n]:not(.wb-show){display:none!important}
.wb-hov{outline:1.5px dashed var(--${P}-accent)!important;outline-offset:1px}
.wb-cur{outline:2px solid var(--${P}-accent)!important;outline-offset:1px}
[contenteditable=true]{outline:2px solid var(--${P}-accent)!important;outline-offset:1px;cursor:text!important}`
    function wCardParts(p, raw, page) {
      const doc = new DOMParser().parseFromString(String(raw ?? ''), 'text/html')
      const abs = u => fileUrlFrom(u, `/p/${p.id}/index.html`)
      const fixUrls = css => css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]*))\s*\)/g, (m, a, b, c) => { const u = a ?? b ?? c ?? ''; const v = abs(u); return v === u ? m : `url("${v}")` })
      const fixSel = css => css.replace(/:root\b/g, '.wb-html')
        .replace(/(^|[\s,{}>+~(])html(?=[\s,{.:#[>+~)])/g, '$1.wb-html')
        .replace(/(^|[\s,{}>+~(])body(?=[\s,{.:#[>+~)])/g, '$1.wb-body')
      let css = ''
      const links = []
      for (const st of doc.querySelectorAll('style')) { css += fixSel(fixUrls(st.textContent)) + '\n'; st.remove() }
      for (const ln of doc.querySelectorAll('link[rel~=stylesheet][href]')) links.push(abs(ln.getAttribute('href')))
      doc.querySelectorAll('script,noscript,iframe,object,embed,base,meta,title,link').forEach(x => x.remove())
      for (const el of doc.body.querySelectorAll('*')) {
        for (const name of ['src', 'href', 'poster', 'xlink:href']) {
          const v = el.getAttribute(name)
          if (v != null) { const nv = abs(v); if (nv !== v) el.setAttribute(name, nv) }
        }
        const set = el.getAttribute('srcset')
        if (set) el.setAttribute('srcset', set.split(',').map(x => { const [u, ...rest] = x.trim().split(/\s+/); return [abs(u), ...rest].join(' ') }).join(', '))
        const st = el.getAttribute('style')
        if (st && /url\(/.test(st)) el.setAttribute('style', fixUrls(st))
        for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name)
      }
      if (page != null) {
        const s = doc.body.querySelector(`section.card[data-n="${page}"]`) ?? doc.body.querySelector(`section[data-n="${page}"]`)
        s?.classList.add('show', 'wb-show')
      }
      const bodyCls = [doc.body.getAttribute('class') || '', page != null ? 'one wb-one' : ''].join(' ').trim()
      return { html: `<div class="wb-html"><div class="wb-body ${bodyCls}">${doc.body.innerHTML}</div></div>`, css: css + W_CARD_CSS, cssUrls: links }
    }
    /** out/ 里第 n 页的成品图（文件名里带 _01 这样的页码） */
    const wImgFor = (p, n) => (p.outputs ?? []).find(f => new RegExp(`_${String(n).padStart(2, '0')}[^/]*$`).test(f))
    const wImgLabel = f => f.split('/').pop().replace(/^\d{4}-\d{2}-\d{2}_[^_]+_/, '').replace(/\.\w+$/, '')

    /** 看大图：弹窗里一张张翻，左右方向键也能翻。items: [{ src, label }] */
    function WLightbox({ items, at = 0, onClose }) {
      const [i, setI] = useState(Math.min(at, items.length - 1))
      const n = items.length
      useEffect(() => {
        const onKey = e => { if (e.key === 'ArrowRight') setI(x => (x + 1) % n); if (e.key === 'ArrowLeft') setI(x => (x - 1 + n) % n) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [n])
      const it = items[i]
      if (!it) return null
      return h(Modal, { title: `${i + 1} / ${n} · ${it.label}`, onClose, width: 1000 },
        h(Stage, { onPrev: n > 1 ? () => setI((i - 1 + n) % n) : undefined, onNext: n > 1 ? () => setI((i + 1) % n) : undefined }, h('img', { src: it.src, alt: it.label })))
    }

    /** 卡片「源页面」：按 index.html 现在的样子排出来（全部页），可以放大缩小。 */
    function WCardSource({ project: p, version }) {
      const [raw, setRaw] = useState(null)
      const [err, setErr] = useState(null)
      const [k, setK] = useState(() => +lsGet('cardSrcZoom', '0.5') || 0.5)
      useEffect(() => {
        let alive = true
        setErr(null)
        wb(`/p/${enc(p.id)}/index.html`, { raw: true }).then(x => alive && setRaw(x), e => alive && setErr(e))
        return () => { alive = false }
      }, [p.id, version, p.updated])
      const doc = React.useMemo(() => (raw == null ? null : wCardParts(p, raw, null)), [raw, p.id])
      const zoom = d => setK(x => { const v = Math.min(1.5, Math.max(0.2, Math.round((x + d) * 10) / 10)); lsSet('cardSrcZoom', String(v)); return v })
      return h('div', { className: cls('stack') },
        h('div', { className: cls('row') },
          h('span', { className: cls('muted', 'grow') }, '按 index.html 现在的样子排出来，改了马上能看到（成品图要重新渲染才会变）'),
          h(Btn, { sm: true, icon: 'minus', label: '缩小', onClick: () => zoom(-0.1) }), h('span', { className: cls('w-zoom') }, `${Math.round(k * 100)}%`), h(Btn, { sm: true, icon: 'plus', label: '放大', onClick: () => zoom(0.1) })),
        err ? h(ErrorBox, { error: err }) : !doc ? h(Loading) : h('div', { className: cls('w-src') },
          h(ShadowHtml, { html: doc.html, css: doc.css, cssUrls: doc.cssUrls, style: { zoom: k }, onClick: e => e.preventDefault() })))
    }

    /** 卡片浏览：一页页翻着看成品图；也可以全部铺开看，或者看源页面。 */
    function CardBrowseTab({ project: p, version, goTab, run, busy }) {
      const imgs = (p.outputs ?? []).filter(f => !/候选/.test(f))
      const [mode, setMode] = useState(() => lsGet('cardMode', 'one'))
      const [at, setAt] = useState(0)
      const [lb, setLb] = useState(null)
      const [size, setSize] = useState(() => +lsGet('cardGrid', '220') || 220)
      const n = imgs.length
      const i = Math.min(at, Math.max(0, n - 1))
      useEffect(() => {
        if (mode !== 'one' || lb != null || !n) return undefined
        const onKey = e => {
          if (wTyping(e)) return
          if (e.key === 'ArrowRight') setAt(x => (x + 1) % n)
          if (e.key === 'ArrowLeft') setAt(x => (x - 1 + n) % n)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [mode, lb, n])
      const items = imgs.map(f => ({ src: wImg(p, f), label: wImgLabel(f) }))
      const setM = m => { setMode(m); lsSet('cardMode', m) }
      const grid = d => setSize(x => { const v = Math.min(480, Math.max(120, x + d)); lsSet('cardGrid', String(v)); return v })
      const buildBtn = label => h(Btn, { kind: 'primary', icon: 'play', busy: busy === 'build', disabled: !!busy && busy !== 'build', onClick: () => run?.('build') }, label)

      let body
      if (mode === 'source') body = h(WCardSource, { project: p, version })
      else if (!n) body = h(Empty, { title: '还没有成品图', body: '点「渲染成图」把每一页截成图；或者先去「精修」里改。', action: h(Row, null, buildBtn('渲染成图'), h(Btn, { icon: 'pointer', onClick: () => goTab('tune') }, '去精修')) })
      else if (mode === 'grid') {
        body = h(Fragment, null,
          h('div', { className: cls('row') }, h('span', { className: cls('muted', 'grow') }, `${n} 张，点一张看大图`),
            h(Btn, { sm: true, icon: 'minus', label: '缩小', onClick: () => grid(-40) }), h(Btn, { sm: true, icon: 'plus', label: '放大', onClick: () => grid(40) })),
          h(Thumbs, { min: size }, items.map((it, k) => h(Thumb, { key: imgs[k], src: it.src, name: `${k + 1} · ${it.label}`, ratio: '3/4', onClick: () => setLb(k) }))))
      } else {
        body = h(Fragment, null,
          h(Stage, { onPrev: n > 1 ? () => setAt((i - 1 + n) % n) : undefined, onNext: n > 1 ? () => setAt((i + 1) % n) : undefined, caption: `${i + 1} / ${n} · ${items[i].label}` },
            h('img', { src: items[i].src, alt: items[i].label, className: cls('w-zoomin'), title: '点一下看大图', onClick: () => setLb(i) })),
          h(Strip, { current: String(i), onPick: k => setAt(+k), items: items.map((it, k) => ({ key: String(k), thumb: h('img', { src: it.src, alt: '', loading: 'lazy' }), label: String(k + 1) })) }))
      }
      return h('div', { className: cls('w-tabpad') },
        h('div', { className: cls('row') },
          h(Seg, { label: '怎么看', value: mode, onChange: setM, options: [{ value: 'one', label: '一页页看' }, { value: 'grid', label: '全部铺开' }, { value: 'source', label: '源页面' }] }),
          h('span', { className: cls('w-gap') }),
          n && mode !== 'source' ? h(Btn, { icon: 'pointer', onClick: () => goTab('tune') }, '去精修') : null),
        p.stale && mode !== 'source' && n ? h(Alert, { tone: 'warn', action: buildBtn('重新渲染') }, '卡片改过了，这里还是上次渲染的图。') : null,
        body,
        lb != null ? h(WLightbox, { items, at: lb, onClose: () => setLb(null) }) : null)
    }

    /**
     * 卡片精修：左边选页，中间是这一页（单击选中、双击改字、Delete 删除、⌘Z 撤销、Esc 取消选择），
     * 右边两个页签：AI 助手（整组卡片对话着改）/ 调元素（选中的那一块手动调，或者让 AI 只改这一块）。
     */
    function CardTuneTab({ project: p, version, onChanged, run, busy }) {
      const pages = p.cardList ?? []
      const [page, setPage] = useState(() => pages[0] ?? 1)
      const [raw, setRaw] = useState(null)
      const [err, setErr] = useState(null)
      const [tick, setTick] = useState(0)
      const [info, setInfo] = useState(null)
      const [side, setSide] = useState(() => lsGet('tuneSide', 'ai'))
      const [aiText, setAiText] = useState('')
      const [aiAt, setAiAt] = useState(0)
      const [zoomK, setZoomK] = useState(0.5)
      const [showVer, setShowVer] = useState(false)
      const [, setNow] = useState(0)
      const rootRef = useRef(null)
      const selRef = useRef(null)
      const curElRef = useRef(null)
      const hovRef = useRef(null)
      const editRef = useRef(null)
      const keepRef = useRef(null)
      const stageRef = useRef(null)
      const colorTimer = useRef(null)
      const fns = useRef({})
      const modalOpen = useRef(false)
      modalOpen.current = showVer

      useEffect(() => { if (pages.length && !pages.includes(page)) setPage(pages[0]) }, [pages.join(',')])
      useEffect(() => {
        let alive = true
        setErr(null)
        wb(`/p/${enc(p.id)}/index.html?wb=1`, { raw: true }).then(x => alive && setRaw(x), e => alive && setErr(e))
        return () => { alive = false }
      }, [p.id, version, tick])
      const doc = React.useMemo(() => (raw == null ? null : wCardParts(p, raw, page)), [raw, page, p.id])
      // 卡片按 720×960 画，按中间区域的大小缩放
      useLayoutEffect(() => {
        const el = stageRef.current
        if (!el) return undefined
        const fit = () => setZoomK(Math.max(0.1, Math.min((el.clientHeight - 24) / 960, (el.clientWidth - 24) / 720)))
        fit()
        const ro = new ResizeObserver(fit)
        ro.observe(el)
        return () => ro.disconnect()
      }, [])
      useEffect(() => () => clearTimeout(colorTimer.current), [])
      usePoll(() => setNow(Date.now()), 500, !!aiAt)
      // ⌘Z 撤销、Esc 取消选择、Delete 删除选中的那一块（在输入框里打字、开着弹窗时不管）
      useEffect(() => {
        const onKey = e => { if (!modalOpen.current && !wTyping(e)) fns.current.key?.(e) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])

      const elOf = k => (k == null ? null : rootRef.current?.querySelector(`[data-wb="${k}"]`) ?? null)
      const mark = (ref, el, c) => {
        const old = ref.current
        if (old && old !== el) { old.classList.remove(c); if (!old.getAttribute('class')) old.removeAttribute('class') }
        if (el) el.classList.add(c)
        ref.current = el
      }
      const hover = el => mark(hovRef, el, 'wb-hov')
      const hexOf = rgb => { const m = String(rgb).match(/\d+(\.\d+)?/g); return '#' + (m ? m.slice(0, 3) : [0, 0, 0]).map(x => Math.round(+x).toString(16).padStart(2, '0')).join('') }
      const readInfo = el => {
        const cs = getComputedStyle(el)
        return {
          tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').split(/\s+/).filter(x => x && !x.startsWith('wb-'))[0] || '',
          text: (el.textContent || '').trim(), fs: parseFloat(cs.fontSize) || 0, mt: parseFloat(cs.marginTop) || 0,
          color: hexOf(cs.color), bold: +cs.fontWeight >= 600, align: cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign,
        }
      }
      const endEdit = ok => editRef.current?.(ok)
      const clear = () => { selRef.current = null; setInfo(null); mark(curElRef, null, 'wb-cur') }
      const select = k => {
        endEdit(true)
        const el = elOf(k)
        if (!el) { clear(); return }
        selRef.current = k
        hover(null); mark(curElRef, el, 'wb-cur')
        setInfo(readInfo(el)); setSide('el')
      }
      const refetch = keep => { keepRef.current = keep ? selRef.current : null; setTick(x => x + 1) }
      const op = async (body, keep = true, msg) => {
        try { await wbPost(pApi(p, 'card'), body); if (msg) toast(msg); refetch(keep) } catch (e) { notify(e.message) }
      }
      const undo = async () => {
        endEdit(true)
        try { await wbPost(pApi(p, 'undo'), { file: 'index.html' }); toast('已撤销'); refetch(true) } catch (e) { notify(e.message) }
      }
      const edit = el => {
        endEdit(true)
        rootRef.current?.querySelectorAll('.wb-hov').forEach(x => { x.classList.remove('wb-hov'); if (!x.getAttribute('class')) x.removeAttribute('class') })
        hovRef.current = null
        const before = el.innerHTML
        el.setAttribute('contenteditable', 'true')
        el.focus()
        try {
          const s = rootRef.current.getSelection ? rootRef.current.getSelection() : document.getSelection()
          const r = document.createRange(); r.selectNodeContents(el); s.removeAllRanges(); s.addRange(r)
        } catch { /* 选不中全文也能改 */ }
        const done = ok => {
          if (editRef.current !== done) return
          editRef.current = null
          el.removeAttribute('contenteditable'); el.removeEventListener('blur', onBlur); el.removeEventListener('keydown', onKey)
          if (!ok) { el.innerHTML = before; return }
          if (el.innerHTML !== before) op({ op: 'inner', n: el.dataset.wb, inner: el.innerHTML.replace(/ data-wb="\d+"/g, '').replace(/ class="(wb-[\w-]+\s*)+"/g, '') }, true, '已改字')
        }
        const onBlur = () => done(true)
        const onKey = e => {
          e.stopPropagation()
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.blur() }
          if (e.key === 'Escape') { e.preventDefault(); done(false) }
        }
        el.addEventListener('blur', onBlur); el.addEventListener('keydown', onKey)
        editRef.current = done
      }
      const sectionN = () => rootRef.current?.querySelector(`section[data-n="${page}"]`)?.dataset.wb
      const aiGo = async () => {
        const q = aiText.trim()
        if (!q || aiAt) return
        const target = selRef.current ?? sectionN()
        if (target == null) { notify('没找到这一页'); return }
        const t0 = Date.now()
        setAiAt(t0)
        try {
          await wbPost(pApi(p, 'card'), { op: 'ai', n: target, instruction: q, provider: currentProvider() })
          toast(`改好了（${Math.round((Date.now() - t0) / 1000)} 秒），不满意点撤销`)
          setAiText(''); refetch(false)
        } catch (e) { notify(e.message) } finally { setAiAt(0) }
      }
      const style = styles => { const k = selRef.current; if (k != null) op({ op: 'style', n: k, styles }) }
      const cs = () => { const el = elOf(selRef.current); return el ? getComputedStyle(el) : null }
      fns.current = {
        move: e => { if (editRef.current) return; const tg = e.target.closest?.('[data-wb]'); hover(tg && tg !== curElRef.current ? tg : null) },
        click: e => {
          if (e.target.closest?.('[contenteditable="true"]')) return
          e.preventDefault(); e.stopPropagation()
          endEdit(true)
          const tg = e.target.closest?.('[data-wb]')
          if (tg) select(tg.dataset.wb); else clear()
        },
        dbl: e => {
          const tg = e.target.closest?.('[data-wb]')
          if (tg && !tg.matches('section') && !tg.querySelector('section[data-n]')) { e.preventDefault(); edit(tg) }
        },
        key: e => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo() } else if (e.key === 'Escape') clear()
          else if ((e.key === 'Backspace' || e.key === 'Delete') && selRef.current != null) { e.preventDefault(); op({ op: 'remove', n: selRef.current }, false, '已删除，可以撤销') }
        },
      }
      const onReady = root => {
        rootRef.current = root
        hovRef.current = null; curElRef.current = null; editRef.current = null
        if (!root.__wbBound) {
          root.__wbBound = true
          root.addEventListener('mousemove', e => fns.current.move(e))
          root.addEventListener('click', e => fns.current.click(e), true)
          root.addEventListener('dblclick', e => fns.current.dbl(e), true)
        }
        const keep = keepRef.current
        keepRef.current = null
        if (keep != null && elOf(keep)) select(keep); else clear()
      }
      const pickPage = k => { endEdit(true); keepRef.current = null; setPage(k) }
      const pickSide = v => { setSide(v); lsSet('tuneSide', v) }
      const focusText = `作者正在看第 ${page} 页${info ? `，选中了 <${info.tag}>：${info.text.slice(0, 300)}` : ''}`
      const Chat = typeof ChatPane === 'function' ? ChatPane : null
      const aiSec = aiAt ? Math.round((Date.now() - aiAt) / 1000) : 0

      const elPanel = h('div', { className: cls('w-tel') },
        info ? h('div', { className: cls('w-tsel') },
          h('b', null, `<${info.tag}${info.cls ? '.' + info.cls : ''}>`), info.text ? h('span', { className: cls('faint', 'clamp2') }, info.text.slice(0, 80)) : null,
          h('div', { className: cls('row') },
            h(Btn, { sm: true, icon: 'up', onClick: () => { const pa = elOf(selRef.current)?.parentElement?.closest('[data-wb]'); if (pa) select(pa.dataset.wb) } }, '选外层'),
            h(Btn, { sm: true, icon: 'edit', disabled: info.tag === 'section', onClick: () => { const el = elOf(selRef.current); if (el) edit(el) } }, '改字'),
            h(Btn, { sm: true, kind: 'danger', icon: 'trash', onClick: () => op({ op: 'remove', n: selRef.current }, false, '已删除，可以撤销') }, '删除')))
          : h('div', { className: cls('w-tsel') }, h('span', { className: cls('muted') }, '在卡片上单击选中要改的地方，双击直接改字。不选的话，下面的 AI 会改整页。')),
        info ? h(Fragment, null,
          h('b', { className: cls('h2') }, '样式'),
          h('div', { className: cls('w-trow') }, h('span', null, '字号'), h(Btn, { sm: true, icon: 'minus', label: '字小一点', onClick: () => style({ 'font-size': Math.max(8, Math.round(parseFloat(cs()?.fontSize) - 2)) + 'px' }) }),
            h('b', { className: cls('w-num') }, `${Math.round(info.fs)}px`), h(Btn, { sm: true, icon: 'plus', label: '字大一点', onClick: () => style({ 'font-size': Math.round(parseFloat(cs()?.fontSize) + 2) + 'px' }) })),
          h('div', { className: cls('w-trow') }, h('span', null, '颜色'),
            h('input', {
              type: 'color', className: cls('w-color'), value: info.color, 'aria-label': '文字颜色',
              onChange: e => { const v = e.target.value, k = selRef.current; setInfo(x => ({ ...x, color: v })); clearTimeout(colorTimer.current); colorTimer.current = setTimeout(() => op({ op: 'style', n: k, styles: { color: v } }), 400) },
            }),
            h(Btn, { sm: true, onClick: () => style({ 'font-weight': +cs()?.fontWeight >= 600 ? '400' : '700' }) }, info.bold ? '取消加粗' : '加粗')),
          h('div', { className: cls('w-trow') }, h('span', null, '对齐'), h(Seg, { label: '对齐', value: info.align, onChange: v => style({ 'text-align': v }), options: [{ value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' }] })),
          h('div', { className: cls('w-trow') }, h('span', null, '上边距'), h(Btn, { sm: true, icon: 'minus', label: '上边距小一点', onClick: () => style({ 'margin-top': Math.round((parseFloat(cs()?.marginTop) || 0) - 4) + 'px' }) }),
            h('b', { className: cls('w-num') }, `${Math.round(info.mt)}px`), h(Btn, { sm: true, icon: 'plus', label: '上边距大一点', onClick: () => style({ 'margin-top': Math.round((parseFloat(cs()?.marginTop) || 0) + 4) + 'px' }) })),
          h('span', null, h(Btn, { sm: true, kind: 'ghost', onClick: () => op({ op: 'style', n: selRef.current, styles: { 'font-size': '', color: '', 'font-weight': '', 'text-align': '', 'margin-top': '' } }, true, '已清掉手动调的样式') }, '清掉手动调的样式'))) : null,
        h('b', { className: cls('h2') }, info ? '让 AI 改这一块' : '让 AI 改整页'),
        h(Textarea, {
          value: aiText, onChange: setAiText, rows: 3, placeholder: info ? '比如：改得更口语一点；把这句拆成两行；数字放大加粗' : '比如：整页文字精简三分之一；标题更抓人',
          onKeyDown: e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); aiGo() } },
        }),
        h('div', { className: cls('w-hints') }, W_CARD_CHIPS.map(c => h('button', { key: c, type: 'button', className: cls('w-hint'), onClick: () => setAiText(x => (x.trim() ? x.trim() + '；' : '') + c) }, c))),
        h('div', { className: cls('row') }, h(Btn, { kind: 'primary', icon: 'spark', busy: !!aiAt, disabled: !aiText.trim(), onClick: aiGo }, '改'), aiAt ? h('span', { className: cls('faint') }, `AI 正在改… ${aiSec} 秒`) : h('span', { className: cls('faint') }, '⌘↵ 也能改')))

      return h('div', { className: cls('w-tune') },
        h('nav', { className: cls('w-tpages'), 'aria-label': '选页' }, pages.map(k => {
          const f = wImgFor(p, k)
          return h('button', { key: k, type: 'button', className: cls('w-tpage'), 'aria-current': k === page ? 'true' : undefined, onClick: () => pickPage(k) },
            h('span', null, f ? h('img', { src: wImg(p, f), alt: '', loading: 'lazy' }) : null), `第 ${k} 页`)
        })),
        h('div', { className: cls('w-tcenter') },
          h('div', { className: cls('w-tbar') },
            h(Btn, { sm: true, icon: 'undo', tip: '撤销（⌘Z）', onClick: undo }, '撤销'),
            h(Btn, { sm: true, icon: 'clock', onClick: () => setShowVer(true) }, '版本'),
            h('span', { className: cls('faint', 'grow', 'w-thint') }, '单击选中 · 双击改字 · Delete 删除 · Esc 取消选择'),
            h(Btn, { kind: 'primary', sm: true, icon: 'play', busy: busy === 'build', disabled: !!busy && busy !== 'build', onClick: () => run?.('build') }, '渲染成图')),
          h('div', { ref: stageRef, className: cls('w-tstage') },
            err ? h(ErrorBox, { error: err, onRetry: () => setTick(x => x + 1) }) : !doc ? h(Loading) : !pages.length ? h(Empty, { title: '没找到卡片页', body: 'index.html 里要有 <section class="card" data-n="1"> 这样的页。' })
              : h('div', { className: cls('w-tcard'), style: { zoom: zoomK }, onMouseLeave: () => hover(null) },
                h(ShadowHtml, { html: doc.html, css: doc.css, cssUrls: doc.cssUrls, onReady })))),
        h('aside', { className: cls('w-tside'), 'aria-label': '精修工具' },
          h('div', { className: cls('w-tside-head') }, h(Tabs, { value: side, onChange: pickSide, options: [{ value: 'ai', label: 'AI 助手' }, { value: 'el', label: '调元素' }] })),
          h('div', { className: cls('w-tchat'), hidden: side !== 'ai' }, Chat ? h(Chat, { key: p.id, project: p, stage: 'card', focus: focusText, version, onChanged }) : h(Empty, { title: 'AI 助手还在做' })),
          h('div', { className: cls('w-tside-body'), hidden: side !== 'el' }, elPanel)),
        showVer ? h(VersionsModal, { project: p, file: 'index.html', onClose: () => setShowVer(false), onRestored: () => refetch(false) }) : null)
    }

    STYLE_PARTS.push(`
.$-w-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}
.$-w-gap{flex:1;min-width:0}
.$-w-nowrap{white-space:nowrap}
.$-w-sort{display:inline-flex}.$-w-sort .$-input{width:auto}
.$-w-chip{display:inline-flex;align-items:center;gap:2px;height:26px;padding:0 4px 0 10px;border-radius:999px;corner-shape:round;background:var(--$-soft);color:var(--$-text-2);font-size:12px}
.$-w-chip button{display:inline-flex;padding:3px;border:0;border-radius:50%;corner-shape:round;background:none;color:inherit;cursor:pointer}
.$-w-hits{display:flex;flex-direction:column;gap:2px;margin:-4px -6px}
.$-w-hit{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:6px 8px;border:0;border-radius:var(--$-r-md);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.$-w-hit b{font-weight:500}
.$-w-hit mark,.$-w-gc mark{border-radius:2px;background:color-mix(in srgb,var(--$-warn) 25%,transparent);color:inherit}
.$-w-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.$-w-gc{position:relative;display:flex;flex-direction:column;min-width:0;border-radius:var(--$-r-xl);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line);overflow:hidden}
.$-w-gc-open{display:flex;flex-direction:column;width:100%;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.$-w-gc-thumb{display:flex;gap:4px;aspect-ratio:4/3;background:var(--$-soft);overflow:hidden}
.$-w-gc-thumb img{flex:1;min-width:0;width:100%;height:100%;object-fit:cover}
.$-w-gc-cards{gap:6px;padding:12px}.$-w-gc-cards img{border-radius:var(--$-r-xs);box-shadow:var(--$-shadow-1)}
.$-w-gc-none{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--$-text-3);font-size:12px}
.$-w-gc-body{display:flex;flex-direction:column;gap:6px;padding:12px 14px 14px}
.$-w-gc-title{font-size:14px;line-height:21px;font-weight:500}
.$-w-hash{color:var(--$-text-3);font-size:12px;line-height:18px}
.$-w-pin{position:absolute;top:8px;right:8px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:50%;corner-shape:round;background:var(--$-raised);box-shadow:var(--$-shadow-1);color:var(--$-text-3);cursor:pointer;opacity:0}
.$-w-gc:hover .$-w-pin,.$-w-gc:focus-within .$-w-pin,.$-w-pin[data-on]{opacity:1}
.$-w-pin[data-on],.$-w-star[data-on] .$-btn,.$-w-star-sm{color:var(--$-warn)}
.$-w-pin[data-on] svg,.$-w-star[data-on] svg,.$-w-star-sm svg{fill:currentColor}
@media (hover:none){.$-w-pin{opacity:1}}
.$-w-tt{display:flex;align-items:center;gap:8px;max-width:360px;padding:0;border:0;background:none;color:var(--$-text);font:inherit;text-align:left;cursor:pointer}
.$-w-tt:hover{color:var(--$-accent)}
.$-w-tt img,.$-w-tt-ph{flex:none;display:flex;align-items:center;justify-content:center;width:40px;height:30px;border-radius:var(--$-r-xs);object-fit:cover;background:var(--$-soft);color:var(--$-text-3)}
.$-w-star-sm{display:inline-flex}
.$-w-mini{width:auto;min-height:28px;height:28px;padding:0 6px;font-size:13px}
.$-w-tags{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px}
.$-w-tag{gap:2px;padding-right:3px}
.$-w-tag-x{display:inline-flex;padding:2px;border:0;border-radius:50%;corner-shape:round;background:none;color:inherit;cursor:pointer;opacity:.6}
.$-w-tag-x:hover{opacity:1}
.$-w-tag-add{height:20px;padding:0 8px;border:.5px dashed var(--$-line-2);border-radius:999px;corner-shape:round;background:none;color:var(--$-text-3);font-size:11px;line-height:18px;cursor:pointer;white-space:nowrap}
.$-w-tag-add:hover{color:var(--$-text)}
.$-w-tag-in{width:110px;min-height:22px;height:22px;padding:0 6px;font-size:12px}
.$-w-board{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:12px;align-items:start;overflow-x:auto}
.$-w-col{display:flex;flex-direction:column;gap:8px;min-height:200px;padding:10px;border-radius:var(--$-r-xl);background:var(--$-soft)}
.$-w-col[data-over]{box-shadow:inset 0 0 0 1.5px var(--$-accent)}
.$-w-col-head{display:flex;align-items:center;justify-content:space-between;padding:0 4px 2px}
.$-w-col-empty{padding:20px 0;color:var(--$-text-3);font-size:12px;text-align:center}
.$-w-kc{display:flex;align-items:center;gap:10px;width:100%;padding:8px;border:0;border-radius:var(--$-r-md);background:var(--$-card);box-shadow:var(--$-shadow-1);color:inherit;font:inherit;text-align:left;cursor:grab}
.$-w-kc img,.$-w-kc-ph{flex:none;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:var(--$-r-sm);object-fit:cover;background:var(--$-soft);color:var(--$-text-3)}
.$-w-kc-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.$-w-kc-text b{font-size:13px;line-height:19px;font-weight:500}
.$-w-cal-title{min-width:96px;text-align:center;font-weight:500}
.$-w-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:.5px solid var(--$-line);border-left:.5px solid var(--$-line);border-radius:var(--$-r-md);overflow:hidden}
.$-w-wd{padding:6px 8px;border-right:.5px solid var(--$-line);border-bottom:.5px solid var(--$-line);color:var(--$-text-3);font-size:12px;line-height:18px}
.$-w-day{display:flex;flex-direction:column;gap:3px;min-width:0;min-height:96px;padding:4px 6px 6px;border-right:.5px solid var(--$-line);border-bottom:.5px solid var(--$-line)}
.$-w-day[data-out]{background:var(--$-soft)}.$-w-day[data-out] .$-w-dn{color:var(--$-text-3)}
.$-w-day[data-over]{box-shadow:inset 0 0 0 1.5px var(--$-accent)}
.$-w-dn{align-self:flex-start;padding:0 6px;border-radius:999px;corner-shape:round;color:var(--$-text-2);font-size:12px;line-height:18px}
.$-w-day[data-today] .$-w-dn{background:var(--$-brand);color:var(--$-on-brand)}
.$-w-ev{display:block;width:100%;padding:1px 6px;border:.5px dashed var(--$-line-2);border-radius:var(--$-r-xs);background:var(--$-card);color:var(--$-text);font:inherit;font-size:12px;line-height:18px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.$-w-ev[draggable=true]{cursor:grab}
.$-w-ev[data-kind=pub]{border-color:transparent;background:color-mix(in srgb,var(--$-success) 12%,transparent);color:var(--$-success)}
.$-w-ev[data-kind=none]{width:auto;max-width:240px;border-style:solid}
.$-w-unsched{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.$-w-feed{display:flex;flex-direction:column}
.$-w-fe{display:flex;align-items:baseline;gap:12px;padding:8px 0;border-bottom:.5px solid var(--$-line);font-size:13px;line-height:20px}
.$-w-fe:first-child{padding-top:0}.$-w-fe:last-child{padding-bottom:0;border-bottom:0}
.$-w-when{flex:none;width:96px;color:var(--$-text-3);font-size:12px;font-variant-numeric:tabular-nums}
.$-w-link{padding:0;border:0;background:none;color:var(--$-text);font:inherit;font-weight:500;text-align:left;cursor:pointer}
.$-w-link:hover{color:var(--$-accent)}
.$-w-b{font-weight:500}
.$-w-hints{display:flex;flex-wrap:wrap;gap:4px}
.$-w-hint{height:24px;padding:0 8px;border:0;border-radius:var(--$-r-sm);background:var(--$-soft);color:var(--$-text-2);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.$-w-hint:hover{color:var(--$-text)}
.$-w-tplbtn{display:flex;align-items:center;gap:12px;width:100%;padding:8px;border:.5px solid var(--$-line-2);border-radius:var(--$-r-md);background:var(--$-field);color:inherit;font:inherit;text-align:left;cursor:pointer}
.$-w-tplbtn img{flex:none;width:52px;height:52px;border-radius:var(--$-r-sm);object-fit:cover;object-position:top;background:var(--$-soft)}
.$-w-tplbtn .$-grow{display:flex;flex-direction:column}
.$-w-tplbtn b{font-weight:500}
.$-w-idea-box{border-top:.5px solid var(--$-line);padding-top:4px}
.$-w-fold{display:flex;align-items:center;gap:8px;width:100%;padding:6px 0;border:0;background:none;color:var(--$-text-2);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.$-w-fold:hover{color:var(--$-text)}
.$-w-ideas{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.$-w-idea{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:0;border-radius:var(--$-r-md);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line);color:inherit;font:inherit;text-align:left;cursor:pointer}
.$-w-idea b{font-size:13px;line-height:20px;font-weight:500}
.$-w-idea[aria-pressed=true]{box-shadow:inset 0 0 0 1.5px var(--$-accent)}
.$-w-tpl{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:20px;min-height:0}
.$-w-tpl-list{display:flex;flex-direction:column;gap:16px;max-height:62vh;padding:2px;overflow:auto}
.$-w-tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(124px,1fr));gap:8px}
.$-w-tpc{display:flex;flex-direction:column;gap:4px;min-width:0;padding:6px;border:0;border-radius:var(--$-r-md);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.$-w-tpc[aria-pressed=true]{background:var(--$-soft);box-shadow:inset 0 0 0 1.5px var(--$-accent)}
.$-w-tpc img{width:100%;aspect-ratio:3/4;border-radius:var(--$-r-sm);object-fit:cover;object-position:top;background:var(--$-soft)}
.$-w-tpc b{overflow:hidden;font-size:12px;line-height:18px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.$-w-tpc span{color:var(--$-text-3);font-size:11px;line-height:16px}
.$-w-tpl-view{display:flex;flex-direction:column;gap:8px;min-height:0}
.$-w-tpl-view b{font-weight:500}
.$-w-tpl-view img{width:100%;max-height:56vh;border-radius:var(--$-r-md);object-fit:contain;object-position:top;background:var(--$-soft)}
.$-w-vlist{display:flex;flex-direction:column}
.$-w-vi{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid var(--$-line);font-size:13px}
.$-w-vi:last-child{border-bottom:0}
.$-scroll:has(> .$-w-proj){overflow:hidden}
.$-w-proj{position:relative;display:flex;height:100%;min-height:0}
.$-w-proj-main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.$-w-phead{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:calc(8px + var(--dsh-frame-top-clearance,0px)) 12px 8px}
.$-w-ptitle{flex:1 1 200px;min-width:120px;height:32px;padding:0 8px;border:0;border-radius:var(--$-r-sm);background:none;color:var(--$-text);font-family:var(--$-font-title);font-size:17px;line-height:24px;font-weight:500;outline:none;text-overflow:ellipsis}
.$-w-ptitle:hover{background:var(--$-soft)}
.$-w-ptitle:focus{background:var(--$-field);box-shadow:inset 0 0 0 .5px var(--$-accent)}
.$-w-plan{display:inline-flex;align-items:center;gap:4px;color:var(--$-text-3)}
.$-w-date{width:auto;min-height:28px;height:28px;padding:0 6px;font-size:12px}
.$-w-pnav{flex:none;display:flex;align-items:center;gap:8px;min-width:0;padding:4px 12px 6px;border-bottom:.5px solid var(--$-line)}
.$-w-pnav .$-steps{flex:0 1 auto}
.$-w-pnav .$-step[data-state=todo]{color:var(--$-text-2)}
.$-w-extra{flex:none;display:flex;gap:2px}
.$-w-xbtn{position:relative;color:var(--$-text-2)}
.$-w-xbtn[aria-pressed=true]{background:var(--$-soft);color:var(--$-text);font-weight:500}
.$-w-xdot{position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;corner-shape:round;background:var(--$-accent)}
.$-w-pbody{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;overflow:auto;--dsh-frame-top-clearance:0px}
.$-w-pbody>*{flex:none}
.$-w-pbody[data-fill]{overflow:hidden}
.$-w-pbody[data-fill]>*{flex:1;min-height:0}
.$-w-tabpad{display:flex;flex-direction:column;gap:16px;width:100%;padding:20px clamp(16px,3vw,32px) 40px}
.$-w-log{max-height:50vh;margin:0;padding:10px 12px;overflow:auto;border-radius:var(--$-r-md);background:var(--$-soft);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
.$-w-info{max-width:880px;margin:0 auto}
.$-w-props{display:grid;grid-template-columns:84px minmax(0,1fr);align-items:center;gap:12px 16px;margin:0;font-size:13px;line-height:20px}
.$-w-props dt{color:var(--$-text-2)}
.$-w-props dd{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;margin:0}
.$-w-path{padding:0;border:0;background:none;color:var(--$-text-2);font:inherit;font-family:ui-monospace,Menlo,monospace;font-size:12px;text-align:left;overflow-wrap:anywhere;cursor:copy}
.$-w-path:hover{color:var(--$-text)}
.$-w-code{padding:2px 6px;border-radius:var(--$-r-xs);background:var(--$-soft);font-family:ui-monospace,Menlo,monospace;font-size:12px;overflow-wrap:anywhere}
.$-w-url{min-width:0;overflow:hidden;color:var(--$-accent);text-overflow:ellipsis;white-space:nowrap}
.$-w-pf{display:inline-flex}.$-w-pf .$-input{width:auto}
.$-w-files summary{color:var(--$-text-2);font-size:13px;cursor:pointer}
.$-w-flist{display:flex;flex-direction:column;margin-top:8px;font-size:13px;line-height:20px}
.$-w-frow{display:flex;align-items:center;gap:10px;padding:3px 0;border-bottom:.5px solid var(--$-line)}
.$-w-frow a{color:var(--$-text);text-decoration:none}.$-w-frow a:hover{color:var(--$-accent)}
.$-w-ftime{width:72px;text-align:right}
.$-w-notes{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}
.$-w-notes textarea{min-height:min(64vh,640px);line-height:1.75}
.$-w-notes-md{min-height:120px;max-height:min(70vh,720px);padding:12px 16px;overflow:auto;border-radius:var(--$-r-lg);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line);font-size:14px;line-height:1.75}
.$-w-zoom{min-width:44px;color:var(--$-text-2);font-size:12px;text-align:center;font-variant-numeric:tabular-nums}
.$-w-zoomin{cursor:zoom-in}
.$-w-src{max-height:72vh;padding:12px;overflow:auto;border-radius:var(--$-r-xl);background:var(--$-stage-bg)}
.$-w-tune{display:flex;min-height:0;height:100%}
.$-w-tpages{flex:none;display:flex;flex-direction:column;gap:6px;width:96px;padding:10px 8px;overflow:auto;border-right:.5px solid var(--$-line)}
.$-w-tpage{flex:none;display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px;border:0;border-radius:var(--$-r-md);background:none;color:var(--$-text-2);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.$-w-tpage:hover{background:var(--$-soft)}
.$-w-tpage[aria-current=true]{background:var(--$-soft);box-shadow:inset 0 0 0 1.5px var(--$-text);color:var(--$-text)}
.$-w-tpage>span{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:3/4;border-radius:var(--$-r-sm);background:var(--$-soft);overflow:hidden}
.$-w-tpage img{width:100%;height:100%;object-fit:cover}
.$-w-tcenter{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
.$-w-tbar{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;border-bottom:.5px solid var(--$-line)}
.$-w-tstage{position:relative;flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:12px;overflow:hidden;background:var(--$-stage-bg)}
.$-w-tcard{flex:none;width:720px;height:960px;overflow:hidden;background:var(--$-bg);box-shadow:var(--$-shadow-2)}
.$-w-tside{flex:none;display:flex;flex-direction:column;width:340px;min-height:0;border-left:.5px solid var(--$-line)}
.$-w-tside-head{flex:none;padding:0 16px}
.$-w-tchat,.$-w-tside-body{flex:1;display:flex;flex-direction:column;min-height:0}
.$-w-tchat>*{flex:1;min-height:0}
.$-w-tside-body{overflow:auto}
.$-w-tchat[hidden],.$-w-tside-body[hidden]{display:none}
.$-w-tel{display:flex;flex-direction:column;gap:12px;padding:16px}
.$-w-tsel{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:var(--$-r-md);background:var(--$-soft);font-size:13px;line-height:20px}
.$-w-tsel>b{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:500}
.$-w-trow{display:flex;align-items:center;gap:8px;font-size:13px}
.$-w-trow>span:first-child{flex:none;width:48px;color:var(--$-text-2)}
.$-w-num{min-width:44px;font-weight:500;text-align:center;font-variant-numeric:tabular-nums}
.$-w-color{width:36px;height:28px;padding:0 2px;border:.5px solid var(--$-line-2);border-radius:var(--$-r-sm);background:none;cursor:pointer}
@media (hover:hover){.$-w-hit:hover,.$-w-tpc:hover,.$-w-idea:hover{background:var(--$-soft)}}
@container $-shell (max-width:1080px){.$-w-tside{width:300px}.$-w-thint{display:none}}
@container $-shell (max-width:900px){
.$-w-tpl{grid-template-columns:minmax(0,1fr)}.$-w-tpl-view{display:none}
.$-w-notes{grid-template-columns:minmax(0,1fr)}
.$-w-tune{flex-direction:column}
.$-w-tpages{flex-direction:row;width:auto;padding:6px 8px;border-right:0;border-bottom:.5px solid var(--$-line)}
.$-w-tpage{width:60px}
.$-w-tside{width:auto;height:45%;border-left:0;border-top:.5px solid var(--$-line)}
.$-w-xbtn .$-btn-label{display:none}
}
@container $-shell (max-width:560px){.$-w-board{grid-template-columns:repeat(4,minmax(200px,1fr))}.$-w-day{min-height:64px}}
`)


    // ================================================================== 3.6 文章各步：资料、大纲、写作、体检、发布、提词、阅读
    //
    // 导出 7 个组件：ResearchTab、OutlineTab、WriteTab、CheckTab、PublishTab、PrompterTab、ReadTab，
    // 参数都是 { project, reload, goTab, version, setFocus }（见 parts/约定.md）。
    // 正文是 article.md，大纲是 outline.md，存的时候都带 mtime：别处（AI 助手、命令行）先改过就不覆盖，提示一声再读最新的。
    // 文章排版用工作台自己渲染的 HTML，放进 ShadowHtml 里显示（样式是这篇的 theme.css，和插件的样式互不影响）。

    Object.assign(ICONS, {
      heading: 'M6 5v14M18 5v14M6 12h12',
      undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4',
      globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
      target: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
      expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
      palette: 'M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.5-4-8-9-8zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01',
      hammer: 'M14 4l6 6-3 3-6-6zM11 7l-7 7 3 3 7-7',
    })

    // ---- 3.6.0 这几步共用的小东西

    /**
     * 30 段 → 40 段：替作者给右边的 AI 助手说一句话。{ pid: 项目 id, text: '…', send: true 直接发出去 | false 只填进输入框 }
     * 40 段（ChatPane）看到 pid 是当前项目就取走并清空：chatHandoff.set(null)。
     */
    const chatHandoff = makeStore(null)
    /** 替作者跟助手说一句：send 为真时也交给 40 段现成的 queueChatSend（它在助手打开时发出去）。 */
    function artTellChat(pid, text, send) {
      chatHandoff.set({ pid, text, send })
      if (send && typeof queueChatSend === 'function') queueChatSend(pid, text)
    }
    /** 体检页点「定位」：记下要找的那句话，写作页打开后滚过去并闪一下。 */
    const artPending = { quote: null }
    /** 写作室接口：artS(p, 'research')、artS(p, 'suggest', 'POST', { … }) */
    const artS = (p, sub, method = 'GET', body) => wb(pApi(p, 'studio/' + sub), { method, body })
    const artEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    /** 工作台排出来的 HTML 里图片、链接是 /p/… 这种工作台自己的地址，补上工作台地址才显示得出来。 */
    const artAbs = html => String(html ?? '').replace(/(\s(?:src|href)=")(\/(?!\/)[^"]*)"/g, (_, a, path) => `${a}${fileUrl(path.replace(/&amp;/g, '&'))}"`)
    /** 样式表里相对路径的 url(…) 也补成完整地址（样式表放进 <style> 以后就没有自己的位置了）。 */
    function artCssAbs(text, cssPath) {
      const from = String(cssPath).split('?')[0]
      return String(text ?? '').replace(/url\(\s*(['"]?)(?!data:|https?:|\/|#)([^'")]+)\1\s*\)/g, (_, q, u) => `url("${fileUrlFrom(u, from)}")`)
    }
    /** Markdown / HTML 源文 → 屏幕上看到的字（算字数、做对比用） */
    const artPlain = s => String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '［图］').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\*\*|`/g, '').replace(/^#+\s*/gm, '').replace(/^>\s?/gm, '')
    const artCount = s => { const x = artPlain(s).replace(/［图］/g, ''); return (x.match(/[一-鿿]/g) || []).length + (x.match(/[A-Za-z0-9]+/g) || []).length }
    const artSnip = s => artPlain(s).replace(/\s+/g, ' ').trim().slice(0, 16)
    const artFmtSec = s => (s < 60 ? `${s} 秒` : `${s / 60 | 0} 分${s % 60 ? ` ${s % 60} 秒` : '钟'}`)
    /** 字级对比：删掉的划线，新加的标色（两头相同的部分只留一小截） */
    function artDiff(a, b) {
      a = artPlain(a); b = artPlain(b)
      let p0 = 0; while (p0 < a.length && p0 < b.length && a[p0] === b[p0]) p0++
      let s0 = 0; while (s0 < a.length - p0 && s0 < b.length - p0 && a[a.length - 1 - s0] === b[b.length - 1 - s0]) s0++
      const A = [...a.slice(p0, a.length - s0)], B = [...b.slice(p0, b.length - s0)]
      let mid = ''
      if (A.length * B.length <= 160000) {
        const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1))
        for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
        let i = 0, j = 0, del = '', ins = ''
        const out = () => { if (del) mid += `<del>${artEsc(del)}</del>`; if (ins) mid += `<ins>${artEsc(ins)}</ins>`; del = ins = '' }
        while (i < A.length || j < B.length) {
          if (i < A.length && j < B.length && A[i] === B[j]) { out(); mid += artEsc(A[i]); i++; j++ }
          else if (j < B.length && (i >= A.length || dp[i][j + 1] >= dp[i + 1][j])) ins += B[j++]
          else del += A[i++]
        }
        out()
      } else mid = `<del>${artEsc(A.join(''))}</del><ins>${artEsc(B.join(''))}</ins>`
      const cut = (x, n, end) => (x.length > n ? (end ? '…' + x.slice(-n) : x.slice(0, n) + '…') : x)
      return artEsc(cut(a.slice(0, p0), 40, true)) + mid + artEsc(cut(a.slice(a.length - s0), 40, false))
    }

    // 文章按空行切成一块一块（和工作台的写法一样）。seps[i] 是第 i 块后面的空行，拼回去一字不差。
    function artSplit(text) {
      const parts = String(text ?? '').split(/(\n{2,})/), blocks = [], seps = []
      for (let i = 0; i < parts.length; i += 2) { blocks.push(parts[i]); seps.push(parts[i + 1] ?? '') }
      return { blocks, seps }
    }
    const artJoin = d => d.blocks.map((b, i) => b + (d.seps[i] ?? '')).join('')
    function artRemoveBlock(text, i) {
      const d = artSplit(text), old = d.blocks[i]
      if (old == null) return text
      if (i < d.blocks.length - 1 || d.blocks.length === 1) { d.blocks.splice(i, 1); d.seps.splice(i, 1) }
      else { d.blocks.splice(i, 1); d.seps.splice(i - 1, 2, ''); d.blocks[i - 1] = d.blocks[i - 1].trimEnd() + old.match(/\s*$/)[0] }
      return artJoin(d)
    }
    /** 换掉第 i 块：保留它原来首尾的空白（比如文件末尾的换行）。新内容里有空行就自然变成好几块。 */
    function artReplaceBlock(text, i, src) {
      const d = artSplit(text), old = d.blocks[i]
      const next = String(src).replace(/\r\n?/g, '\n').trim()
      if (old == null) return text
      if (!next) return artRemoveBlock(text, i)
      d.blocks[i] = old.match(/^\s*/)[0] + next + old.match(/\s*$/)[0]
      return artJoin(d)
    }
    /** 在第 at 块后面插一段（at = -1 插在最前面）。 */
    function artInsertAfter(text, at, src) {
      const add = String(src).replace(/\r\n?/g, '\n').trim()
      if (!add) return text
      if (!String(text ?? '').trim()) return add + '\n'
      const d = artSplit(text), last = d.blocks.length - 1
      if (at < 0) { d.blocks.unshift(add); d.seps.unshift('\n\n') }
      else if (at >= last) { const ws = d.blocks[last].match(/\s*$/)[0]; d.blocks[last] = d.blocks[last].trimEnd(); d.seps[last] = '\n\n'; d.blocks.push(add + ws); d.seps.push('') }
      else { d.blocks.splice(at + 1, 0, add); d.seps.splice(at + 1, 0, '\n\n') }
      return artJoin(d)
    }
    /** 一句话在第几块：先找一字不差的，找不到再去掉格式比。找不到是 -1。 */
    function artFind(blocks, quote) {
      const q = String(quote || '').trim()
      if (!q) return -1
      let i = blocks.findIndex(b => b.includes(q))
      if (i < 0) { const norm = s => artPlain(s).replace(/\s+/g, ''); const qn = norm(q).slice(0, 60); i = blocks.findIndex(b => qn && norm(b).includes(qn)) }
      return i
    }

    /**
     * 读写 article.md / outline.md，自动保存，不会互相覆盖：
     *   一次只发一个保存请求，排着队来；带上次读到的 mtime，别处先改过就提示、把作者没存上的那几下给他复制、再读最新的。
     *   version 变了（助手改了文件）：先把手上没存的存掉，再读一遍。离开这一步时把没存的存掉。
     * const doc = useArtDoc(p, 'source' | 'outline', version)
     *   doc.text  doc.state（loaded | typing | saving | saved | failed）  doc.setText(新全文, { label: '改了什么', now: 马上存 })
     *   await doc.flush()（存掉手上的）  await doc.load()（重新读）  doc.get()（手上最新的全文，不等重画）
     */
    function useArtDoc(p, kind, version) {
      const path = pApi(p, kind)
      const name = kind === 'outline' ? '大纲' : '文章'
      const [doc, setDoc] = useState(null)
      const [error, setError] = useState(null)
      const [state, setState] = useState('loaded')
      const [savedAt, setSavedAt] = useState(null)
      const s = useRef({ text: '', saved: '', mtime: 0, label: '', timer: null, chain: Promise.resolve(), alive: true }).current
      const load = useCallback(async () => {
        const r = await wb(path)
        clearTimeout(s.timer); s.timer = null
        s.text = s.saved = r.text ?? ''; s.mtime = r.mtime || 0; s.label = ''
        if (s.alive) { setDoc({ text: s.text, mtime: s.mtime }); setState('loaded'); setError(null) }
        return r
      }, [path])
      const flush = useCallback(() => {
        clearTimeout(s.timer); s.timer = null
        s.chain = s.chain.then(async () => {
          if (s.text === s.saved) return
          const text = s.text, label = s.label
          s.label = ''
          if (s.alive) setState('saving')
          try {
            const r = await wbPut(path, { text, mtime: s.mtime, label })
            s.mtime = r.mtime; s.saved = text
            if (s.alive) { setState(s.text === text ? 'saved' : 'typing'); setSavedAt(new Date()) }
          } catch (e) {
            if (/别处被改过/.test(e.message)) {
              const mine = s.text
              s.saved = s.text
              notify(`${name}刚在别处被改过（多半是 AI 助手），已经换成最新的。你这边最后几下改动没存上。`, { tone: 'warn', ms: 15000, action: { label: '复制我的改动', onClick: () => copyText(mine, '已复制，需要的话贴回去') } })
              await load().catch(err => notify(err.message))
            } else {
              if (!s.label) s.label = label
              if (s.alive) setState('failed')
              notify(`${name}没保存上：${e.message}`)
            }
          }
        })
        return s.chain
      }, [path, load])
      const setText = useCallback((text, { label = '', now = false } = {}) => {
        s.text = text
        if (label) s.label = label
        setDoc(d => ({ ...(d ?? {}), text }))
        setState('typing')
        clearTimeout(s.timer); s.timer = null
        if (now) flush(); else s.timer = setTimeout(flush, 900)
      }, [flush])
      /** 手上没有没存的改动时，看看文件有没有被别处改过，改过就换成新的（AI 写大纲时用）。 */
      const peek = useCallback(async () => {
        if (s.text !== s.saved || s.timer) return
        const r = await wb(path).catch(() => null)
        if (r && r.mtime !== s.mtime && s.text === s.saved && !s.timer) { s.text = s.saved = r.text ?? ''; s.mtime = r.mtime || 0; if (s.alive) setDoc({ text: s.text, mtime: s.mtime }) }
      }, [path])
      const first = useRef(true)
      useEffect(() => {
        if (first.current) { first.current = false; load().catch(e => s.alive && setError(e)); return }
        flush().then(load).catch(e => notify(e.message))
      }, [load, version])
      const flushRef = useRef(flush); flushRef.current = flush
      useEffect(() => { s.alive = true; return () => { flushRef.current(); s.alive = false } }, [])
      return { doc, text: doc?.text ?? '', error, state, savedAt, load, flush, setText, peek, get: () => s.text }
    }

    /** 保存状态那一小行 */
    function ArtSave({ state, savedAt, extra }) {
      const label = { loaded: '已载入', typing: '正在输入…', saving: '正在保存…', saved: savedAt ? `已保存 ${savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '已保存', failed: '没保存上' }[state] ?? ''
      return h('span', { className: cls('a-save') },
        state === 'saving' ? h(Spin, { sm: true }) : h(Dot, { tone: state === 'failed' ? 'danger' : state === 'typing' ? 'warn' : 'success' }),
        label, extra ? h('span', null, '· ', extra) : null)
    }

    /** 能动手的助手是不是正在跑（每 3 秒问一次）；从「在跑」变成「停了」时调 onStop。 */
    function useArtAgent(p, onStop) {
      const [running, setRunning] = useState(false)
      const was = useRef(false)
      const stopRef = useRef(onStop); stopRef.current = onStop
      const check = useCallback(() => artS(p, 'agent-status').then(st => {
        const on = !!st?.running
        if (was.current && !on) stopRef.current?.()
        was.current = on; setRunning(on)
      }, () => {}), [p.id])
      useEffect(() => { check() }, [check])
      usePoll(check, 3000)
      return running
    }
    /** 正在做的事过了几秒（按钮上显示「查找中 12 秒」） */
    function useArtElapsed(on) {
      const [n, setN] = useState(0)
      useEffect(() => {
        if (!on) { setN(0); return undefined }
        const t0 = Date.now()
        const timer = setInterval(() => setN((Date.now() - t0) / 1000 | 0), 500)
        return () => clearInterval(timer)
      }, [on])
      return n
    }
    /** 一页的外框（各步都一样宽、一样的边距） */
    const ArtWrap = ({ wide, innerRef, children }) => h('div', { ref: innerRef, className: cls('a-wrap', wide && 'a-wrap-wide') }, children)

    // 工作台的图片不能直接 fetch（不同源，工作台不给跨源读）。先试 fetch，不行再请后台 fileData 转一道。
    async function artBlob(url) {
      try { const r = await fetch(url); if (r.ok) return await r.blob() } catch { /* 跨源读不了，走后台 */ }
      const path = String(url).startsWith(BASE) ? String(url).slice(BASE.length) : String(url)
      const r = await api('fileData', { path })
      return new Blob([Uint8Array.from(atob(r.data), c => c.charCodeAt(0))], { type: r.type || 'application/octet-stream' })
    }
    const artDataUrl = async url => { const bl = await artBlob(url); return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(bl) }) }
    /** 图片复制成 PNG（剪贴板只认 PNG；JPG 先画成 PNG） */
    async function artCopyImage(url) {
      const png = (async () => {
        const bl = await artBlob(url)
        if (bl.type === 'image/png') return bl
        const im = await createImageBitmap(bl), c = document.createElement('canvas')
        c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0)
        return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('转不成 PNG'))), 'image/png'))
      })()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    }
    /** 把图片存到本机（跨源的链接加 download 不管用，会直接打开图片，所以先拿到数据再存） */
    async function artDownload(url, fileName) {
      try {
        const bl = await artBlob(url), href = URL.createObjectURL(bl), a = document.createElement('a')
        a.href = href; a.download = fileName; a.click()
        setTimeout(() => URL.revokeObjectURL(href), 10000)
      } catch { window.open(url, '_blank') }
    }
    /**
     * 复制公众号版正文：没构建或改过就先构建（构建出来的是带行内样式的 HTML），图片转成内嵌数据，粘进公众号不依赖本机地址。
     * onStep('构建中' | '处理图片') 用来改按钮上的字。
     */
    async function artCopyWechat(p, onStep) {
      let v = await wb(pApi(p, 'read') + '?v=wechat')
      if (!v.built || v.stale) { onStep?.('构建中'); await wbPost(pApi(p, 'build'), {}); v = await wb(pApi(p, 'read') + '?v=wechat') }
      onStep?.('处理图片')
      const box = new DOMParser().parseFromString(artAbs(v.html), 'text/html').body
      let n = 0, miss = 0
      for (const img of box.querySelectorAll('img')) { try { img.setAttribute('src', await artDataUrl(img.getAttribute('src'))); n++ } catch { miss++ } }
      await copyHtml(box.innerHTML, box.textContent.trim(), `已复制《${String(p.title).slice(0, 18)}》公众号正文${n ? `（含 ${n} 张图）` : ''}，去公众号编辑器里粘贴`)
      if (miss) notify(`有 ${miss} 张图没能嵌进正文（读不到图片文件）。粘贴后如果显示不出来，用「配图包」补传。`, { tone: 'warn', ms: 12000 })
      return v
    }

    // 显示文章用的「白纸」：文章是给读者看的，深色模式下也按发出去的样子显示。
    // 不写色值：color-scheme 定成浅色，用系统颜色 Canvas / CanvasText / GrayText / LinkText。
    const ART_PAPER_CSS = ':host{display:block;color-scheme:light;background:Canvas;color:CanvasText}img{max-width:100%;height:auto}.ph{color:GrayText;background:color-mix(in srgb,CanvasText 5%,Canvas);padding:10px;border-radius:6px;font-size:13px}'
    // 写作页一块一块显示：.article 是模板样式的根；上下边距去掉，免得每块都多出一截
    const ART_BLOCK_CSS = ':host{display:block}.article{margin-top:0!important;margin-bottom:0!important;padding-top:0!important;padding-bottom:0!important;background:none!important}img{max-width:100%;height:auto}.pend{white-space:pre-wrap;color:GrayText}'
    // 仿 X 长文的排版（实际以 X 为准）
    const artXCss = () => `:host{display:block;color-scheme:light;background:Canvas;color:CanvasText}
.xa{max-width:600px;margin:0 auto;padding:0 0 48px;font:17px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;word-break:break-word}
.cover{display:block;width:100%;aspect-ratio:5/2;object-fit:cover;margin:0 0 22px}
.nocover{aspect-ratio:5/2;margin:0 0 22px;background:color-mix(in srgb,CanvasText 4%,Canvas);color:GrayText;display:grid;place-items:center;font-size:14px}
h1{font-size:31px;line-height:1.25;font-weight:800;margin:0 16px 16px;letter-spacing:-.3px}
.by{display:flex;gap:10px;align-items:center;margin:0 16px 24px;padding-bottom:16px;border-bottom:1px solid color-mix(in srgb,CanvasText 8%,Canvas)}
.av{width:40px;height:40px;border-radius:50%;background:CanvasText;color:Canvas;display:grid;place-items:center;font-weight:700;font-size:16px;flex:none}
.by b{display:block;font-size:15px;line-height:1.3}.by span{font-size:14px;color:GrayText}
.body{padding:0 16px}.body p{margin:0 0 18px}
.body h2{font-size:24px;line-height:1.3;font-weight:800;margin:34px 0 14px}
.body a{color:LinkText;text-decoration:none}
.body ul,.body ol{margin:0 0 18px;padding-left:26px}.body li{margin:6px 0}
.body blockquote{margin:0 0 18px;padding:2px 0 2px 16px;border-left:4px solid color-mix(in srgb,CanvasText 18%,Canvas)}
.body figure{margin:6px 0 10px}.body figure img{display:block;width:100%;border-radius:16px;border:1px solid color-mix(in srgb,CanvasText 8%,Canvas)}
.body figure + p > i:only-child{display:block;font-size:15px;color:GrayText}
.miss{margin:6px 0 18px;padding:14px;border:1px dashed var(--${P}-danger);border-radius:12px;color:var(--${P}-danger);font-size:14px}`
    /** X 长文预览：封面、标题、作者行、正文；「【插图 NN】」换成真实图片，放在粘贴后它该在的位置 */
    function artXHtml(p, r) {
      const u = f => projectFile(p, f) + '?v=' + (r.t || '')
      const byN = Object.fromEntries((r.images ?? []).map(im => [im.n, im]))
      const body = artAbs(r.html).replace(/<p>【插图 (\d+)】<\/p>/g, (_, n) => { const im = byN[+n]; return im?.file ? `<figure><img src="${u(im.file)}" alt="" loading="lazy"></figure>` : `<div class="miss">插图 ${n}：${artEsc(im?.note || '没有图片')}</div>` })
      return `<div class="xa">${r.cover ? `<img class="cover" src="${u(r.cover)}" alt="">` : '<div class="nocover">还没有 5:2 封面</div>'}<h1>${artEsc(r.title)}</h1>
<div class="by"><span class="av">易</span><div><b>AI 产品小易</b><span>${artEsc(todayStr())} · ${r.chars} 字 · ${(r.images ?? []).length} 张图</span></div></div><div class="body">${body}</div></div>`
    }

    /** 预览里的链接点了不跳走（不然整个 DSH 页面会被换掉） */
    const artNoNav = e => { if (e.nativeEvent.composedPath().some(n => n.tagName === 'A')) e.preventDefault() }
    /** 构建提醒：还没构建 / 改过还没重新构建，带一个「构建」按钮 */
    function ArtBuildAlert({ project: p, built, stale, onBuilt }) {
      const [busy, setBusy] = useState(false)
      if (built && !stale) return null
      const build = async () => {
        setBusy(true)
        try { await wbPost(pApi(p, 'build'), {}); toast('构建好了'); onBuilt?.() } catch (e) { notify('构建失败：' + String(e.message).slice(-300)) } finally { setBusy(false) }
      }
      return h(Alert, { tone: 'warn', action: h(Btn, { sm: true, kind: 'primary', icon: 'hammer', busy, onClick: build }, built ? '重新构建' : '构建') },
        built ? '文章改过了，下面还是上次构建的样子。' : '还没构建过，下面是按 article.md 临时排的版，图表和封面要构建后才完整。')
    }

    /** 公众号的样子：标题、作者、日期，下面是正文 */
    function ArtWechatPaper({ project: p, read, width = 420 }) {
      const date = p.published?.[0]?.date || p.plan || todayStr()
      return h('div', { className: cls('a-paper', 'a-paper-read'), style: { '--pw': `${width}px` } },
        h('h1', { className: cls('a-wx-t') }, p.title),
        h('div', { className: cls('a-wx-m') }, h('span', { className: cls('a-wx-a') }, 'AI 产品小易'), h('span', null, date)),
        h(ShadowHtml, {
          css: ART_PAPER_CSS,
          cssUrls: !read.built && read.css ? [fileUrl(read.css)] : [],
          html: read.built ? artAbs(read.html) : `<section class="article">${artAbs(read.html)}</section>`,
          onClick: artNoNav,
        }))
    }

    // ================================================================== ① 资料

    const ART_TIER = { 官方一手: 'success', 社区一手: 'info', 报道: undefined, 转述: 'outline' }
    function ResearchTab({ project: p, goTab, version }) {
      const list = useData(() => artS(p, 'research'), [p.id, version])
      const [q, setQ] = useState('')
      const [busy, setBusy] = useState(false)
      const [noteOpen, setNoteOpen] = useState(false)
      const secs = useArtElapsed(busy)
      const items = Array.isArray(list.data) ? list.data : list.data?.items ?? []
      const search = async () => {
        const text = q.trim()
        if (!text || busy) return
        setBusy(true)
        try { await artS(p, 'research', 'POST', { q: text, provider: currentProvider() }); setQ(''); list.reload(); toast('查好了') } catch (e) { notify('没查成：' + e.message) } finally { setBusy(false) }
      }
      const del = async r => {
        if (!(await ask({ title: '删掉这条资料？', text: `「${r.q}」删了就找不回来了。`, ok: '删除', danger: true }))) return
        try { await artS(p, 'research', 'DELETE', { id: r.id }); list.reload() } catch (e) { notify(e.message) }
      }
      const use = r => {
        artTellChat(p.id, `参考资料「${r.q}」里的内容，把文章里相关的地方核对、补充一下，数字以资料为准，标出来源。`, false)
        goTab('write')
      }
      return h(ArtWrap, null,
        h(Card, { title: '查资料', sub: 'AI 会联网查，每条结论后面带来源链接。写的时候助手会参考这里的内容。' },
          h(Textarea, { value: q, onChange: setQ, rows: 2, disabled: busy, placeholder: '要查什么？比如：某产品 10 月公布的用户数据；最新的定价',
            onKeyDown: e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); search() } } }),
          h(Row, null,
            h('span', { className: cls('faint', 'grow') }, busy ? `正在联网查，已经 ${secs} 秒，一般半分钟左右` : '⌘ + 回车也能查'),
            h(Btn, { icon: 'plus', disabled: busy, onClick: () => setNoteOpen(true) }, '手动记一条'),
            h(Btn, { kind: 'primary', icon: 'globe', busy, disabled: !q.trim(), onClick: search }, busy ? `查找中 ${secs} 秒` : '联网查'))),
        list.error ? h(ErrorBox, { error: list.error, onRetry: list.reload })
          : !list.data ? h(Loading)
            : !items.length ? h(Empty, { title: '还没有资料', body: '写之前先把数字和说法查清楚。你查的、助手查的、手动记的都放在这里。' })
              : h(Stack, null, items.map(r => h(ArtResearchCard, { key: r.id, r, onUse: () => use(r), onDel: () => del(r) }))),
        noteOpen ? h(ArtNoteModal, { project: p, q, onClose: () => setNoteOpen(false), onSaved: () => { setNoteOpen(false); setQ(''); list.reload() } }) : null)
    }
    function ArtResearchCard({ r, onUse, onDel }) {
      const by = r.by === 'agent' ? 'AI 助手查的' : r.web ? '联网' : '手动'
      return h(Card, {
        title: r.q, note: `${ago(r.t)} · ${by}`,
        action: h(Row, null,
          h(Btn, { sm: true, kind: 'ghost', icon: 'spark', tip: '带着这条资料去写作页，让助手核对、补充文章', onClick: onUse }, '让 AI 用'),
          h(Btn, { sm: true, kind: 'ghost', icon: 'copy', onClick: () => copyText(r.answer) }, '复制'),
          h(Btn, { sm: true, kind: 'ghost', icon: 'trash', label: '删除', onClick: onDel })),
      },
      r.tier ? h('div', null, h(Tag, { tone: ART_TIER[r.tier] }, r.tier)) : null,
      h(Md, { text: r.answer }),
      r.quote ? h('blockquote', { className: cls('a-quote') }, r.quote) : null,
      r.sources?.length ? h('div', { className: cls('a-links') }, r.sources.map(u => h('a', { key: u, href: u, target: '_blank', rel: 'noreferrer' }, u.replace(/^https?:\/\//, '').slice(0, 60)))) : null)
    }
    function ArtNoteModal({ project: p, q, onClose, onSaved }) {
      const [title, setTitle] = useState(q.trim())
      const [answer, setAnswer] = useState('')
      const [src, setSrc] = useState('')
      const [busy, setBusy] = useState(false)
      const save = async () => {
        if (!answer.trim()) return notify('先写点内容', { tone: 'warn' })
        setBusy(true)
        try { await artS(p, 'research', 'POST', { manual: true, q: title.trim() || '手动记录', answer: answer.trim(), sources: src.trim() ? [src.trim()] : [] }); toast('记下了'); onSaved() } catch (e) { notify(e.message) } finally { setBusy(false) }
      }
      return h(Modal, { title: '手动记一条资料', onClose, width: 520, footer: [h(Btn, { key: 'n', onClick: onClose }, '取消'), h(Btn, { key: 'y', kind: 'primary', busy, onClick: save }, '记下')] },
        h(Field, { label: '这条讲什么' }, h(Input, { value: title, onChange: setTitle, placeholder: '比如：官方公布的用户数' })),
        h(Field, { label: '内容', hint: '可以贴一段原文或数据' }, h(Textarea, { value: answer, onChange: setAnswer, rows: 6, autoFocus: true })),
        h(Field, { label: '来源链接', hint: '可以不填' }, h(Input, { value: src, onChange: setSrc, placeholder: 'https://…' })))
    }

    // ================================================================== ② 大纲（大纲页和写作页分开：先在这里定下来，再去写正文）

    const ART_OL_SKELETON = `# 标题写在这里

备选标题：

> 一句话说这篇讲什么

开头：打算怎么起

## 01 第一节的小标题

- 要点

## 02 第二节的小标题

- 要点
`
    const ART_OL_QUICK = ['按我的要求先查资料，再出一版大纲', '这版大纲有什么问题？', '小标题再具体一点，让人一眼看懂', '第二节和第三节是不是重了？', '再给 3 个大标题备选']
    function OutlineTab({ project: p, reload, goTab, version, setFocus }) {
      const card = p.type === 'card'
      const doc = useArtDoc(p, 'outline', version)
      const running = useArtAgent(p, () => doc.load().catch(() => {}))
      usePoll(() => doc.peek(), 3000, running)   // AI 在写大纲：每隔几秒看看它写进来没有
      const notes = useData(() => artS(p, 'research').catch(() => []), [p.id, version])
      const [versions, setVersions] = useState(false)
      const [going, setGoing] = useState(false)
      const taRef = useRef(null)
      useEffect(() => () => setFocus?.(''), [])
      const text = doc.text
      const empty = !text.trim()
      const nNotes = (Array.isArray(notes.data) ? notes.data : notes.data?.items ?? []).length

      // 把光标所在的那一行变成小标题 / 要点
      const lineTo = kind => {
        const ta = taRef.current
        if (!ta || running) return
        const v = ta.value, at = ta.selectionStart
        const a = v.lastIndexOf('\n', at - 1) + 1, e0 = v.indexOf('\n', at), b = e0 < 0 ? v.length : e0
        const line = (kind === 'h2' ? '## ' : '- ') + v.slice(a, b).replace(/^(#{1,6}\s+|[-*+]\s+|\d+\.\s+)/, '')
        doc.setText(v.slice(0, a) + line + v.slice(b))
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(a + line.length, a + line.length) })
      }
      const addSection = () => {
        const cur = doc.get(), n = (cur.match(/^##\s/gm) || []).length + 1
        const next = `${cur.trimEnd() ? cur.trimEnd() + '\n\n' : ''}## ${String(n).padStart(2, '0')} 新的一节\n\n- 要点\n`
        doc.setText(next)
        requestAnimationFrame(() => { const ta = taRef.current; if (!ta) return; const i = next.lastIndexOf('新的一节'); ta.focus(); ta.setSelectionRange(i, i + 4); ta.scrollTop = ta.scrollHeight })
      }
      const askAI = (say, send = true) => { artTellChat(p.id, say, send); toast(send ? '交给右边的助手了' : '写进右边的输入框了') }
      // 定稿：存好大纲，去掉「定大纲」阶段，替作者跟助手说一句「照大纲写」，然后进写作页
      const start = async () => {
        await doc.flush()
        const cur = doc.get().trim()
        if (!cur || cur === ART_OL_SKELETON.trim()) return notify('大纲还是空的，先让 AI 出一版，或者自己写几条', { tone: 'warn' })
        setGoing(true)
        try {
          const st = await artS(p, 'agent-status').catch(() => null)
          if (st?.running) { notify('AI 还在改大纲，等它停下再开始写', { tone: 'warn' }); return }
          await wbPatch(pApi(p), { phase: '' })
          artTellChat(p.id, card ? '大纲定了，照大纲做卡片：每节一页，替换模板里的占位页。' : '大纲定了，照大纲写正文：标题、目录、小标题照大纲来，要点展开成段落；大纲里标了【待查】的先去查。', true)
          reload?.()
          goTab(card ? 'tune' : 'write')
        } catch (e) { notify(e.message) } finally { setGoing(false) }
      }

      if (doc.error) return h(ArtWrap, null, h(ErrorBox, { error: doc.error, onRetry: () => doc.load().catch(() => {}) }))
      if (!doc.doc) return h(Loading)
      return h(ArtWrap, null,
        h('div', { className: cls('a-tool') },
          h(ArtSave, { state: doc.state, savedAt: doc.savedAt, extra: empty ? '还没有大纲' : null }),
          running ? h(Tag, { tone: 'info' }, h(Spin, { sm: true }), 'AI 正在改大纲') : null,
          h('span', { className: cls('grow') }),
          empty ? null : h(Btn, { kind: 'ghost', sm: true, icon: 'heading', disabled: running, tip: '把光标所在的这一行变成小标题', onClick: () => lineTo('h2') }, '小标题'),
          empty ? null : h(Btn, { kind: 'ghost', sm: true, icon: 'list', disabled: running, tip: '把光标所在的这一行变成要点', onClick: () => lineTo('ul') }, '要点'),
          empty ? null : h(Btn, { kind: 'ghost', sm: true, icon: 'plus', disabled: running, onClick: addSection }, '加一节'),
          h(Btn, { kind: 'ghost', sm: true, icon: 'clock', label: '大纲的历史版本', onClick: () => doc.flush().then(() => setVersions(true)) })),
        running ? h(Alert, null, 'AI 正在查资料、改大纲，改好会自动出现在这里。这时先别动，免得和它打架。') : null,
        empty && !running
          ? h(Card, null, h(Empty, {
            title: '还没有大纲',
            body: '在右边告诉 AI 你想写什么，它会先查资料、记进资料页，再出一版大纲。也可以自己先写。',
            action: h(Row, null, h(Btn, { icon: 'edit', onClick: () => doc.setText(ART_OL_SKELETON) }, '自己写'), h(Btn, { kind: 'primary', icon: 'spark', onClick: () => askAI(ART_OL_QUICK[0]) }, '让 AI 出一版')),
          }))
          : h(Textarea, {
            inputRef: taRef, className: cls('input', 'a-ol'), value: text, readOnly: running, spellCheck: false,
            placeholder: running ? 'AI 正在写大纲…' : '# 标题\n\n## 01 小标题\n- 要点',
            onChange: v => doc.setText(v),
            onSelect: e => { const ta = e.target; setFocus?.(ta.value.slice(ta.selectionStart, ta.selectionEnd).trim()) },
            onKeyDown: e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); doc.flush() } },
          }),
        h('div', { className: cls('a-foot') },
          h(Btn, { kind: 'ghost', icon: 'search', tip: 'AI 查到的资料都记在资料页', onClick: () => goTab('research') }, `资料 ${nNotes} 条`),
          h(Menu, { kind: 'ghost', icon: 'chat', label: '问 AI', items: ART_OL_QUICK.map(x => ({ key: x, label: x, onClick: () => askAI(x) })) }),
          h('span', { className: cls('grow') }),
          h(Btn, { kind: 'primary', lg: true, icon: 'right', busy: going, disabled: running || empty, tip: running ? 'AI 还在改大纲，等它停下' : empty ? '大纲还是空的' : '', onClick: start }, card ? '大纲定了，开始做卡片' : '大纲定了，开始写正文')),
        versions ? h(VersionsModal, { project: p, file: 'outline.md', onClose: () => setVersions(false), onRestored: () => { setVersions(false); doc.load().catch(e => notify(e.message)) } }) : null)
    }

    // ================================================================== ③ 写作
    //
    // 文章按空行切成一块一块，每块用这篇的模板排好显示。点一块就地变成文本框改这一块的 Markdown，失焦或 ⌘↵ 存整篇。
    // 块之间能插段落、插图；选中文字出浮动工具条（润色、去 AI 味……），AI 改的地方以「修改建议」卡片标在原文下面，接受了才写进文章。

    const ART_TASKS_FALLBACK = { polish: '润色', deai: '去 AI 味', shorten: '精简', expand: '扩写', story: '加故事感', hook: '更抓人' }
    const artTasks = makeStore(null)
    function loadArtTasks() {
      if (artTasks.get()) return
      artTasks.set(ART_TASKS_FALLBACK)
      wb('/api/ai/tasks').then(v => { if (v && typeof v === 'object' && Object.keys(v).length) artTasks.set(v) }, () => {})
    }
    const ART_SG_SRC = { chat: 'AI 助手', task: '快捷改法', continue: '续写' }

    /** 选区在不在这一块里：在就返回 { text, rect, range }（块各自在 shadow 里，要用 getComposedRanges 才拿得到） */
    function artSelIn(root) {
      if (!root) return null
      let r = null
      try {
        const ds = document.getSelection()
        if (ds?.getComposedRanges) {
          let c = null
          try { c = ds.getComposedRanges({ shadowRoots: [root] })[0] } catch { c = ds.getComposedRanges(root)[0] }
          if (c && !c.collapsed) { r = document.createRange(); r.setStart(c.startContainer, c.startOffset); r.setEnd(c.endContainer, c.endOffset) }
        } else if (root.getSelection) { const sel = root.getSelection(); if (sel?.rangeCount) r = sel.getRangeAt(0) }
      } catch { r = null }
      if (!r || r.collapsed || !root.contains(r.commonAncestorContainer)) return null
      const text = r.toString()
      return text.trim() ? { text, rect: r.getBoundingClientRect(), range: r } : null
    }

    /** 排好版的一块。点一下进入编辑；松开鼠标时看看是不是选了字。 */
    function ArtBlock({ i, html, src, css, hl, locked, onPick, onSelectEnd }) {
      return h('div', {
        className: cls('a-blk', hl && 'a-blk-sg', locked && 'a-blk-lock'), 'data-i': i,
        onClick: e => onPick(e, i),
        onMouseUp: e => { const el = e.currentTarget; setTimeout(() => onSelectEnd(el, i), 0) },
      }, h(ShadowHtml, { css, html: `<section class="article">${html ?? `<p class="pend">${artEsc(src.trim())}</p>`}</section>` }))
    }
    /** 正在改的一块：Markdown 原文的文本框，下面一排小按钮（按下时不让文本框失焦，免得先存了再点不到） */
    function ArtBlockEditor({ value, isNew, onChange, onCommit, onCancel, onAddBelow, onImageBelow, onDelete }) {
      const ref = useRef(null)
      useLayoutEffect(() => { const ta = ref.current; if (!ta) return; ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px` }, [value])
      useEffect(() => { const ta = ref.current; if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollIntoView({ block: 'nearest' }) } }, [])
      return h('div', { className: cls('a-edit') },
        h(Textarea, {
          inputRef: ref, value, onChange, spellCheck: false, rows: 2, placeholder: isNew ? '写一段。空一行就是新的一段' : '',
          onBlur: () => onCommit(),
          onKeyDown: e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCommit() }
          },
        }),
        h('div', { className: cls('a-edit-bar'), onMouseDown: e => e.preventDefault() },
          h('span', { className: cls('faint', 'grow') }, '这一段的 Markdown 原文 · 空一行就分成两段 · ⌘↵ 存 · Esc 不改了'),
          isNew ? null : h(Btn, { sm: true, kind: 'ghost', icon: 'trash', onClick: onDelete }, '删除这段'),
          h(Btn, { sm: true, kind: 'ghost', icon: 'image', onClick: onImageBelow }, '下面插图'),
          h(Btn, { sm: true, kind: 'ghost', icon: 'plus', onClick: onAddBelow }, '下面加一段'),
          h(Btn, { sm: true, kind: 'primary', icon: 'check', onClick: () => onCommit() }, '完成')))
    }
    /** 一条修改建议：删掉的划线、新加的标色，「不要」「接受」 */
    function ArtSugg({ s, busy, onAccept, onReject }) {
      return h('div', { className: cls('a-sg'), 'data-sg': s.id },
        h('div', { className: cls('a-sg-head') }, h(Icon, { name: 'edit', size: 14 }), h('b', null, '修改建议'), h('span', null, s.why || ART_SG_SRC[s.source] || '')),
        h('div', { className: cls('a-diff'), dangerouslySetInnerHTML: { __html: artDiff(s.old, s.new) } }),
        h('div', { className: cls('a-sg-foot') },
          h(Btn, { sm: true, kind: 'ghost', icon: 'x', busy: busy === 'rej' + s.id, disabled: !!busy, onClick: onReject }, '不要'),
          h(Btn, { sm: true, kind: 'primary', icon: 'check', busy: busy === 'acc' + s.id, disabled: !!busy, onClick: onAccept }, '接受')))
    }
    /** AI 起标题：流式出几个，点「用这个」换掉文章的大标题 */
    function ArtTitlesModal({ project: p, text, onUse, onClose }) {
      const [out, setOut] = useState('')
      const [state, setState] = useState('run')
      const [round, setRound] = useState(0)
      useEffect(() => {
        let alive = true
        setOut(''); setState('run')
        const job = wbStream('/api/ai/article', { projectId: p.id, task: 'titles', text: artPlain(text).slice(0, 8000), provider: currentProvider() }, { onText: all => alive && setOut(all) })
        job.done.then(() => alive && setState('done'), e => { if (alive) { setState('error'); notify('没起出来：' + e.message) } })
        return () => { alive = false; job.stop() }
      }, [round])
      const lines = out.split('\n').map(l => l.replace(/^\s*(?:\d+[.)、．]|[-*•])\s*/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim()).filter(l => l && !/^[#>]/.test(l))
      return h(Modal, {
        title: p.form === 'script' ? '起标题和封面字' : '起几个标题', onClose, width: 560,
        footer: [h(Btn, { key: 'a', icon: 'refresh', disabled: state === 'run', onClick: () => setRound(n => n + 1) }, '换一批'), h(Btn, { key: 'c', kind: 'primary', onClick: onClose }, '好了')],
      },
      state === 'run' && !lines.length ? h(Loading, { text: 'AI 正在想…' }) : null,
      lines.length ? h('div', { className: cls('a-titles') }, lines.map((l, i) => h('div', { key: i, className: cls('a-title-row') },
        h('span', { className: cls('grow') }, l),
        h(Btn, { sm: true, kind: 'ghost', icon: 'copy', label: '复制', onClick: () => copyText(l) }),
        h(Btn, { sm: true, onClick: () => onUse(l) }, '用这个')))) : null,
      state === 'run' && lines.length ? h('p', { className: cls('faint') }, h(Spin, { sm: true }), ' 还在写…') : null)
    }

    function WriteTab({ project: p, reload, goTab, version, setFocus }) {
      const doc = useArtDoc(p, 'source', version)
      const running = useArtAgent(p, () => { doc.load().catch(() => {}); loadSugg() })
      const [mode, setMode] = useState(lsGet('a.wmode', 'rich'))
      const [sugg, setSugg] = useState([])
      const [cssUrl, setCssUrl] = useState(null)
      const [themeCss, setThemeCss] = useState(null)   // null = 样式表还没读到
      const [gen, setGen] = useState(0)
      const [, setTick] = useState(0)
      const [editing, setEditing] = useState(null)     // { i, orig, draft } 或新的一段 { isNew, at, atOrig, draft }
      const [insertAt, setInsertAt] = useState(null)   // 在第几块后面出「写一段 / 插图」
      const [sel, setSel] = useState(null)             // 选中的字：{ text, i, x, y }
      const [busy, setBusy] = useState('')
      const [modal, setModal] = useState('')           // versions | template | titles
      const [asset, setAsset] = useState(null)         // { after: 插在哪段后面（原文） }
      const [flashQuote, setFlashQuote] = useState(null)
      const [scrollSg, setScrollSg] = useState(null)
      const tasks = useStore(artTasks) ?? ART_TASKS_FALLBACK
      const cacheRef = useRef(new Map())               // 一块 Markdown → 排好的 HTML
      const asking = useRef(new Set())
      const cssAsking = useRef(false)
      const wrapRef = useRef(null)
      const paperRef = useRef(null)
      const lastRef = useRef(-1)                       // 最后点过、改过、选过的那一块（续写、插图放它后面）
      const nextSg = useRef(0)
      const editingRef = useRef(null); editingRef.current = editing
      const selRef = useRef(null); selRef.current = sel
      const busyRef = useRef(''); busyRef.current = busy

      const text = doc.text
      const { blocks, seps } = React.useMemo(() => artSplit(text), [text])
      const keys = React.useMemo(() => { const seen = new Map(); return blocks.map(b => { const k = b.trim(), n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return `${n}\u0001${k}` }) }, [blocks])
      const count = React.useMemo(() => artCount(text), [text])
      const heads = React.useMemo(() => blocks.map((b, i) => { const m = /^(#{1,3})\s+(.+)$/.exec(b.trim()); return m ? { i, level: m[1].length, label: m[2].replace(/\s*\|\s*[A-Z ;:.&’'-]+$/, '') } : null }).filter(Boolean), [blocks])
      // 修改建议标在原文的哪几块：卡片放在最后一块下面，那几块整块标一下
      const { byEnd, hl, loose } = React.useMemo(() => {
        const map = new Map(), lit = new Set(), rest = []
        const offs = []; let pos = 0
        blocks.forEach((b, i) => { offs.push(pos); pos += b.length + (seps[i] ?? '').length })
        for (const s of sugg) {
          const at = text.indexOf(s.old)
          if (at < 0) { rest.push(s); continue }
          let i0 = 0, i1 = 0
          offs.forEach((o, i) => { if (o <= at) i0 = i; if (o < at + s.old.length) i1 = i })
          for (let i = i0; i <= i1; i++) lit.add(i)
          map.set(i1, [...(map.get(i1) ?? []), s])
        }
        return { byEnd: map, hl: lit, loose: rest }
      }, [blocks, seps, sugg, text])

      const loadSugg = useCallback(() => artS(p, 'suggestions').then(l => setSugg(Array.isArray(l) ? l : []), () => {}), [p.id])
      useEffect(() => { loadSugg() }, [loadSugg, version])
      useEffect(() => { loadArtTasks() }, [])
      useEffect(() => () => setFocus?.(''), [])

      // 没排过的块拿去排版（一次请求排一批，排过的记住，不重复排）；顺便拿到这篇的样式表地址
      useEffect(() => {
        if (mode !== 'rich' || !doc.doc) return
        const cache = cacheRef.current, inflight = asking.current
        const need = [...new Set(blocks.map(b => b.trim()).filter(b => b && !cache.has(b) && !inflight.has(b)))]
        const wantCss = !cssUrl && !cssAsking.current
        if (!need.length && !wantCss) return
        const want = need.length ? need : ['']
        need.forEach(b => inflight.add(b))
        cssAsking.current = true
        wbPost(pApi(p, 'render'), { blocks: want }).then(r => {
          want.forEach((b, k) => { if (b) cache.set(b, artAbs(r.htmls?.[k] ?? '')) })
          if (r.css) setCssUrl(r.css)
          setTick(n => n + 1)
        }, e => { notify('排版没出来：' + e.message); setThemeCss(c => c ?? '') }).finally(() => { need.forEach(b => inflight.delete(b)); cssAsking.current = false })
      }, [blocks, mode, doc.doc != null, cssUrl, gen])
      // 样式表读成文字直接放进每块（用 <link> 的话每块都会先闪一下没样式的样子）
      useEffect(() => {
        if (!cssUrl) return undefined
        let alive = true
        wb(cssUrl, { raw: true }).then(css => alive && setThemeCss(artCssAbs(css, cssUrl)), () => alive && setThemeCss(''))
        return () => { alive = false }
      }, [cssUrl])
      const blockCss = (themeCss ?? '') + ART_BLOCK_CSS
      const resetRender = () => { cacheRef.current = new Map(); asking.current = new Set(); cssAsking.current = false; setCssUrl(null); setThemeCss(null); setGen(n => n + 1) }

      // 体检页点了「定位」：打开后滚到那句话
      useEffect(() => { if (doc.doc && artPending.quote) { setFlashQuote(artPending.quote); artPending.quote = null } }, [doc.doc != null])
      const flashAt = i => {
        const el = paperRef.current?.querySelector(`[data-i="${i}"]`)
        if (!el) return
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el.classList.remove(`${P}-a-flash`); void el.offsetWidth; el.classList.add(`${P}-a-flash`)
        setTimeout(() => el.classList.remove(`${P}-a-flash`), 1700)
      }
      useEffect(() => {
        if (!flashQuote || !doc.doc) return
        const i = artFind(blocks, flashQuote)
        setFlashQuote(null)
        if (i < 0) { toast('原文里没找到这句，可能已经改过了'); return }
        if (mode !== 'rich') { setMode('rich'); lsSet('a.wmode', 'rich') }
        lastRef.current = i
        requestAnimationFrame(() => requestAnimationFrame(() => flashAt(i)))
      }, [flashQuote, blocks])
      useEffect(() => {
        if (!scrollSg) return
        requestAnimationFrame(() => wrapRef.current?.querySelector(`[data-sg="${scrollSg}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
        setScrollSg(null)
      }, [scrollSg, sugg])
      // 选区没了就收起浮动工具条
      useEffect(() => {
        let timer = null
        const onChange = () => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            if (!selRef.current || busyRef.current) return
            const any = [...(paperRef.current?.querySelectorAll(`.${P}-a-blk`) ?? [])].some(el => artSelIn(el.firstChild?.shadowRoot))
            if (!any) { setSel(null); if (!editingRef.current) setFocus?.('') }
          }, 200)
        }
        document.addEventListener('selectionchange', onChange)
        return () => { clearTimeout(timer); document.removeEventListener('selectionchange', onChange) }
      }, [])

      const run = async (key, fn) => {
        if (busyRef.current) return
        busyRef.current = key; setBusy(key)
        try { await fn() } catch (e) { notify(e.message) } finally { busyRef.current = ''; setBusy('') }
      }
      const lastSrc = () => { const bl = artSplit(doc.get()).blocks; return lastRef.current >= 0 ? bl[lastRef.current] ?? '' : '' }

      // ---- 一块一块地改
      const startEdit = (i, cur) => {
        if (running) { toast('助手正在改文章，等它停下再改'); return }
        const b = artSplit(cur ?? doc.get()).blocks[i]
        if (b == null) return
        const ed = { i, orig: b, draft: b.trim() }
        editingRef.current = ed; setEditing(ed); setSel(null); setInsertAt(null); lastRef.current = i
        setFocus?.(artPlain(b).trim().slice(0, 1500))
      }
      const startNew = (at, cur) => {
        if (running) { toast('助手正在改文章，等它停下再改'); return }
        const ed = { isNew: true, at, atOrig: at >= 0 ? artSplit(cur ?? doc.get()).blocks[at] : null, draft: '' }
        editingRef.current = ed; setEditing(ed); setSel(null); setInsertAt(null)
      }
      /** 存下正在改的那块，返回 { next: 新全文, end: 改完后它（最后一块）在第几块 }；没在改返回 null */
      const commit = ({ remove = false } = {}) => {
        const e = editingRef.current
        if (!e) return null
        editingRef.current = null; setEditing(null); setFocus?.('')
        const cur = doc.get(), bl = artSplit(cur).blocks, draft = remove ? '' : e.draft
        let next = cur, label = '', end
        if (e.isNew) {
          let at = e.at < 0 ? -1 : bl[e.at] === e.atOrig ? e.at : bl.indexOf(e.atOrig)
          if (e.at >= 0 && at < 0) at = bl.length - 1
          end = at
          if (draft.trim()) { next = artInsertAfter(cur, at, draft); label = '加了一段：' + artSnip(draft); end = at + artSplit(draft.trim()).blocks.length }
        } else {
          const i = bl[e.i] === e.orig ? e.i : bl.indexOf(e.orig)
          if (i < 0) { notify('这段刚在别处被改过，你的改动没写进去', { tone: 'warn', action: { label: '复制我的改动', onClick: () => copyText(draft) } }); return null }
          end = i
          if (!draft.trim()) { next = artRemoveBlock(cur, i); label = '删了一段：' + artSnip(e.orig); end = i - 1; toast('删掉了，点「撤销」能找回来') }
          else if (draft.trim() !== e.orig.trim()) { next = artReplaceBlock(cur, i, draft); label = '改了一段：' + artSnip(draft); end = i + artSplit(draft.trim()).blocks.length - 1 }
        }
        if (next !== cur) doc.setText(next, { label, now: true })
        lastRef.current = end
        return { next, end }
      }
      const cancel = () => { editingRef.current = null; setEditing(null); setFocus?.('') }
      const setDraft = v => { if (!editingRef.current) return; const ed = { ...editingRef.current, draft: v }; editingRef.current = ed; setEditing(ed) }
      const pick = (e, i) => {
        if (e.nativeEvent.composedPath().some(n => n.tagName === 'A')) e.preventDefault()   // 文里的链接不跳走
        if (artSelIn(e.currentTarget.firstChild?.shadowRoot)) return                       // 刚选了字，不进入编辑
        startEdit(i)
      }
      const selectEnd = (el, i) => {
        const got = artSelIn(el.firstChild?.shadowRoot)
        const box = paperRef.current?.getBoundingClientRect()
        if (!got || !box) return
        lastRef.current = i
        const x = got.rect.left + got.rect.width / 2 - box.left
        setSel({ text: got.text.trim(), i, x: Math.max(170, Math.min(x, box.width - 170)), y: got.rect.top - box.top })
        setFocus?.(got.text.trim().slice(0, 1500))
      }

      // ---- AI：选中文字改一改、续写、起标题
      const aiFix = task => {
        const quote = selRef.current?.text
        if (!quote) return
        run('t:' + task, async () => {
          await doc.flush()
          const t0 = Date.now()
          const s = await artS(p, 'suggest', 'POST', { quote, task, provider: currentProvider() })
          await loadSugg(); setSel(null); setScrollSg(s.id)
          toast(`改好了（${(Date.now() - t0) / 1000 | 0} 秒），在原文下面确认`)
        })
      }
      const cont = () => run('cont', async () => {
        await doc.flush()
        const s = await artS(p, 'continue', 'POST', { quote: lastSrc(), provider: currentProvider() })
        await loadSugg(); setScrollSg(s.id)
        toast('续写好了，在原文下面确认')
      })
      const useTitle = title => {
        const cur = doc.get(), i = artSplit(cur).blocks.findIndex(b => /^\s*#\s+/.test(b))
        doc.setText(i >= 0 ? artReplaceBlock(cur, i, '# ' + title) : artInsertAfter(cur, -1, '# ' + title), { label: '换了标题', now: true })
        toast('标题换好了')
      }
      // ---- 修改建议
      const accept = s => run('acc' + s.id, async () => {
        await doc.flush()
        try { const r = await artS(p, 'accept', 'POST', { id: s.id }); setSugg(r.suggestions ?? []); await doc.load() } catch (e) { loadSugg(); throw e }
      })
      const reject = s => run('rej' + s.id, async () => { const r = await artS(p, 'reject', 'POST', { id: s.id }); setSugg(r.suggestions ?? []) })
      const acceptAll = () => run('all', async () => {
        await doc.flush()
        const r = await artS(p, 'accept-all', 'POST', {})
        setSugg(r.suggestions ?? []); await doc.load(); toast(`接受了 ${r.n} 处`)
      })
      const goNext = () => { if (!sugg.length) return; setScrollSg(sugg[nextSg.current % sugg.length].id); nextSg.current++ }
      // ---- 撤销、插图
      const undo = () => run('undo', async () => {
        await doc.flush()
        const r = await wbPost(pApi(p, 'undo'), { file: 'article.md' })
        await doc.load(); loadSugg()
        toast(r.version?.label ? `撤回了：${r.version.label}` : '撤回了上一步')
      })
      const openAsset = after => { if (running) { toast('助手正在改文章，等它停下再插'); return } setAsset({ after: after ?? '' }) }
      const insertAsset = (a, after) => run('asset', async () => {
        await doc.flush()
        const r = await artS(p, 'insert-asset', 'POST', { asset: a.id, after, alt: a.title || '' })
        await doc.load()
        toast('插好了' + (r.file ? '：' + r.file : ''))
        if (r.file) setFlashQuote(r.file)
      })

      if (doc.error) return h(ArtWrap, null, h(ErrorBox, { error: doc.error, onRetry: () => doc.load().catch(() => {}) }))
      if (!doc.doc) return h(Loading)

      const editorFor = isNew => h(ArtBlockEditor, {
        key: isNew ? 'new' : keys[editing.i] ?? 'edit', value: editing.draft, isNew, onChange: setDraft, onCommit: () => commit(), onCancel: cancel,
        onDelete: () => commit({ remove: true }),
        onAddBelow: () => { const r = commit(); if (r) startNew(r.end, r.next); else if (isNew) startNew(editing.at) },
        onImageBelow: () => { const r = commit(); const bl = artSplit(r?.next ?? doc.get()).blocks; openAsset(r && r.end >= 0 ? bl[r.end] ?? '' : '') },
      })
      // 正文：一块一块排下来，中间夹着修改建议、插入条、正在改的文本框
      const items = []
      if (editing?.isNew && editing.at < 0) items.push(editorFor(true))
      for (const s of loose) items.push(h(ArtSugg, { key: 'sg' + s.id, s, busy, onAccept: () => accept(s), onReject: () => reject(s) }))
      blocks.forEach((b, i) => {
        const k = keys[i]
        if (b.trim()) {
          if (editing && !editing.isNew && editing.i === i) items.push(editorFor(false))
          else {
            items.push(h(ArtBlock, { key: k, i, src: b, html: cacheRef.current.get(b.trim()), css: blockCss, hl: hl.has(i), locked: running, onPick: pick, onSelectEnd: selectEnd }))
            items.push(h('div', { key: k + '\u0002+', className: cls('a-ins') }, h('button', { type: 'button', title: '在这里插一段或一张图', 'aria-label': '在这里插入', disabled: running, onClick: () => setInsertAt(i) }, h(Icon, { name: 'plus', size: 14 }))))
          }
        }
        for (const s of byEnd.get(i) ?? []) items.push(h(ArtSugg, { key: 'sg' + s.id, s, busy, onAccept: () => accept(s), onReject: () => reject(s) }))
        if (insertAt === i) {
          items.push(h('div', { key: 'insbar', className: cls('a-insbar') },
            h(Btn, { sm: true, icon: 'edit', onClick: () => startNew(i) }, '写一段'),
            h(Btn, { sm: true, icon: 'image', onClick: () => { setInsertAt(null); openAsset(b) } }, '插一张图'),
            h(Btn, { sm: true, kind: 'ghost', icon: 'x', label: '不插了', onClick: () => setInsertAt(null) })))
        }
        if (editing?.isNew && editing.at === i) items.push(editorFor(true))
      })
      const emptyDoc = !text.trim()
      const taskBtns = Object.entries(tasks).map(([k, name]) => h(Btn, { key: k, sm: true, kind: 'ghost', busy: busy === 't:' + k, disabled: !!busy, onClick: () => aiFix(k) }, name))

      return h(ArtWrap, { innerRef: wrapRef },
        h('div', { className: cls('a-tool') },
          h(ArtSave, { state: doc.state, savedAt: doc.savedAt, extra: `${count.toLocaleString()} 字` }),
          running ? h(Tag, { tone: 'info' }, h(Spin, { sm: true }), '助手正在改文章') : null,
          h('span', { className: cls('grow') }),
          mode === 'rich' && heads.length ? h(Menu, { kind: 'ghost', icon: 'list', tip: '目录：跳到某一节', align: 'right', items: heads.map(x => ({ key: x.i, label: (x.level > 2 ? '　' : '') + x.label, onClick: () => flashAt(x.i) })) }) : null,
          h(Btn, { kind: 'ghost', icon: 'undo', busy: busy === 'undo', disabled: running || (!!busy && busy !== 'undo'), tip: '撤回上一次保存的改动（可以连着点）', onClick: undo }, '撤销'),
          h(Btn, { kind: 'ghost', icon: 'spark', busy: busy === 'cont', disabled: running || (!!busy && busy !== 'cont'), tip: '在你最后点过的那段后面接着写一两段；没点过就接在文末。写好先以修改建议出现', onClick: cont }, '续写'),
          h(Btn, { kind: 'ghost', icon: 'image', busy: busy === 'asset', disabled: running, tip: '从素材库插一张图，放在你最后点过的那段后面', onClick: () => openAsset(lastSrc()) }, '插图'),
          h(Seg, { value: mode, label: '怎么看', onChange: m => { doc.flush(); cancel(); setSel(null); setMode(m); lsSet('a.wmode', m) }, options: [{ value: 'rich', label: '排版', tip: '按发出去的样子看，点一段就能改' }, { value: 'src', label: 'Markdown', tip: '整篇的 Markdown 原文' }] }),
          h(Menu, { kind: 'ghost', icon: 'more', tip: '更多', align: 'right', items: [
            { key: 'titles', label: p.form === 'script' ? '起标题和封面字' : '起几个标题', icon: 'spark', onClick: () => setModal('titles') },
            { key: 'ver', label: '历史版本', icon: 'clock', note: '每次保存都留一份，点一下就能回去', onClick: () => doc.flush().then(() => setModal('versions')) },
            { key: 'tpl', label: '换模板', icon: 'palette', note: '整篇换一套排版，正文不动', onClick: () => setModal('template') },
          ] })),
        sugg.length ? h(Alert, { tone: 'warn', action: [h(Btn, { key: 'n', sm: true, icon: 'down', onClick: goNext }, '下一处'), h(Btn, { key: 'a', sm: true, kind: 'primary', icon: 'check', busy: busy === 'all', disabled: !!busy && busy !== 'all', onClick: acceptAll }, '全部接受')] },
          `${sugg.length} 处修改等你确认，就在原文下面`) : null,
        running ? h(Alert, null, '助手正在改文章，改完会自动刷新。这时先别动，免得和它打架。') : null,
        mode === 'src'
          ? h(Fragment, null,
            sugg.length ? h(Stack, null, sugg.map(s => h(ArtSugg, { key: s.id, s, busy, onAccept: () => accept(s), onReject: () => reject(s) }))) : null,
            h(Textarea, {
              className: cls('input', 'a-src'), value: text, readOnly: running, spellCheck: false,
              onChange: v => doc.setText(v),
              onSelect: e => { const ta = e.target; setFocus?.(ta.value.slice(ta.selectionStart, ta.selectionEnd).trim().slice(0, 1500)) },
              onKeyDown: e => { if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); doc.flush() } },
            }))
          : h('div', { className: cls('a-desk') },
            h('div', { ref: paperRef, className: cls('a-paper'), onMouseDown: e => { if (!e.target.closest?.(`.${P}-a-seltool`)) setSel(null) } },
              emptyDoc && !editing ? h(Empty, { title: '还没有正文', body: p.form === 'script' ? '在右边让 AI 照骨架先写一版口播稿，或者自己写。' : '在右边让 AI 先写一版，或者自己写。', action: h(Btn, { icon: 'edit', onClick: () => startNew(-1) }, '自己写') }) : null,
              themeCss === null && !emptyDoc ? h(Loading, { text: '正在排版…' }) : items,
              emptyDoc ? null : h('div', { className: cls('a-end') },
                h(Btn, { sm: true, kind: 'ghost', icon: 'plus', disabled: running, onClick: () => startNew(blocks.length - 1) }, '在文末加一段'),
                h(Btn, { sm: true, kind: 'ghost', icon: 'image', disabled: running, onClick: () => openAsset('') }, '在文末插图')),
              sel ? h('div', { className: cls('a-seltool'), style: { left: sel.x, top: sel.y }, onMouseDown: e => e.preventDefault() },
                taskBtns,
                h('span', { className: cls('a-seltool-sep') }),
                h(Btn, { sm: true, kind: 'ghost', icon: 'chat', disabled: !!busy, tip: '右边的助手已经知道你选的是哪段，直接跟它说想怎么改', onClick: () => { artTellChat(p.id, '关于我选中的这段：', false); setSel(null); toast('右边的助手已经知道你选的是哪段，直接说想怎么改') } }, '问助手')) : null)),
        modal === 'versions' ? h(VersionsModal, { project: p, file: 'article.md', onClose: () => setModal(''), onRestored: () => { setModal(''); doc.load().catch(e => notify(e.message)); loadSugg() } }) : null,
        modal === 'template' ? h(TemplateModal, { project: p, onClose: () => setModal(''), onApplied: () => { setModal(''); resetRender(); reload?.() } }) : null,
        modal === 'titles' ? h(ArtTitlesModal, { project: p, text, onClose: () => setModal(''), onUse: x => { useTitle(x); setModal('') } }) : null,
        asset ? h(AssetPicker, { project: p, onClose: () => setAsset(null), onPick: a => { const after = asset.after; setAsset(null); insertAsset(a, after) } }) : null)
    }

    // ================================================================== ④ 体检

    const artChecks = new Map()   // 项目 id → { r: 体检结果, rev: AI 挑的问题, done: { 问题 id: 已生成建议 } }，换步再回来不用重新体检
    const artIssueTone = type => (/AI ?味/.test(type) ? 'warn' : /逻辑/.test(type) ? 'danger' : /核对/.test(type) ? 'info' : undefined)
    function CheckTab({ project: p, goTab }) {
      const [st, setSt] = useState(() => artChecks.get(p.id) ?? null)
      const [busy, setBusy] = useState('')
      const [error, setError] = useState(null)
      const [fixing, setFixing] = useState('')
      const secs = useArtElapsed(busy === 'review')
      const save = patch => { const v = { ...(artChecks.get(p.id) ?? {}), ...patch }; artChecks.set(p.id, v); setSt(v) }
      const check = async () => {
        setBusy('check'); setError(null)
        try { save({ r: await artS(p, 'check', 'POST', {}) }) } catch (e) { setError(e) } finally { setBusy('') }
      }
      useEffect(() => { if (!artChecks.get(p.id)?.r) check() }, [p.id])
      const review = async () => {
        setBusy('review')
        try { const rev = await artS(p, 'review', 'POST', { provider: currentProvider() }); save({ rev: Array.isArray(rev) ? rev : [] }); toast(rev?.length ? `AI 挑出 ${rev.length} 处` : 'AI 没挑出问题') } catch (e) { notify('没读完：' + e.message) } finally { setBusy('') }
      }
      const locate = x => { artPending.quote = x.quote; goTab('write') }
      const fix = async x => {
        const done = artChecks.get(p.id)?.done ?? {}
        if (done[x.id]) { locate(x); return }
        setFixing(x.id)
        try {
          await artS(p, 'suggest', 'POST', { quote: x.quote, instruction: x.tip, why: `${x.type}：${x.tip}`.slice(0, 60), provider: currentProvider() })
          save({ done: { ...done, [x.id]: true } }); toast('修改建议生成了，到写作页确认')
        } catch (e) { notify(e.message) } finally { setFixing('') }
      }

      if (!st?.r) return h(ArtWrap, null, error ? h(ErrorBox, { error, onRetry: check }) : h(Loading, { text: '正在体检…' }))
      const { r, rev = [], done = {} } = st
      const prev = r.history?.length > 1 ? r.history[r.history.length - 2] : null
      const all = [...rev, ...(r.issues ?? [])]
      const stats = [['正文字数', r.stats.chars.toLocaleString()], ['阅读时长', `${r.stats.minutes} 分钟`], ['段落', r.stats.paras], ['最长一段', `${r.stats.longest} 字`], ['图片', r.stats.images], ['表格', r.stats.tables]]
      return h(ArtWrap, null,
        h('div', { className: cls('a-tool') },
          h('div', { className: cls('grow') }, h('h2', { className: cls('h2') }, '这篇现在的状态'), h('div', { className: cls('faint') }, `体检于 ${ago(r.t)}`, r.detector ? '' : ' · 没找到去 AI 味检测脚本，只做了基础统计')),
          h(Btn, { icon: 'eye', busy: busy === 'review', disabled: !!busy && busy !== 'review', tip: '让 AI 从头读一遍，挑逻辑、冗余、要核对的地方', onClick: review }, busy === 'review' ? `AI 通读中 ${secs} 秒` : '让 AI 通读挑问题'),
          h(Btn, { kind: 'primary', icon: 'refresh', busy: busy === 'check', disabled: !!busy && busy !== 'check', onClick: check }, '重新体检')),
        h(Grid, { min: 130 }, stats.map(([k, v]) => h(Stat, { key: k, label: k, value: v }))),
        r.metrics?.length ? h(Card, { title: 'AI 味指标', sub: '和真人写的文章对照，标了「偏离」的是明显不一样的地方' }, h(Table, {
          rowKey: 'key', rows: r.metrics, columns: [
            { key: 'desc', title: '看什么', render: m => h(Row, null, m.desc, m.bad ? h(Tag, { tone: 'warn' }, '偏离') : null) },
            { key: 'value', title: '这篇', num: true, render: m => `${m.value}${m.unit}` },
            { key: 'human', title: '真人约', num: true, render: m => `${m.human}${m.unit}` },
            { key: 'prev', title: '上次', num: true, render: m => prev?.metrics?.[m.key] ?? '—' },
          ],
        })) : null,
        h(Card, { title: '问题清单', note: all.length ? `${all.length} 条 · 「定位」跳到原文 · 「AI 改」生成修改建议，到写作页确认` : '' },
          all.length ? h('div', { className: cls('a-issues') }, all.map(x => h('div', { key: x.id, className: cls('a-issue', done[x.id] && 'a-issue-done') },
            h(Tag, { tone: artIssueTone(x.type) }, x.type),
            h('div', { className: cls('grow') },
              h('div', { className: cls('a-issue-q') }, `「${x.quote}」`),
              h('div', { className: cls('muted') }, x.tip),
              x.found === false ? h('div', { className: cls('faint') }, '原文里没找到这句，可能已经改过了') : null),
            h(Btn, { sm: true, kind: 'ghost', icon: 'target', disabled: x.found === false, onClick: () => locate(x) }, '定位'),
            h(Btn, { sm: true, icon: done[x.id] ? 'check' : 'spark', busy: fixing === x.id, disabled: x.found === false || (!!fixing && fixing !== x.id), onClick: () => fix(x) }, done[x.id] ? '去确认' : 'AI 改'))))
            : h(Empty, { title: st.rev ? 'AI 没挑出问题' : '检测器没发现明显问题', body: st.rev ? '可以去发布了。' : '点「让 AI 通读挑问题」，看看逻辑、冗余、需要核对的地方。' })))
    }

    // ================================================================== ⑤ 发布

    /** 发布清单的一行：左边一个圆点（好了是绿的），中间名字、说明和内容，右边按钮 */
    const ArtPubRow = ({ ok, title, note, action, children }) => h('div', { className: cls('a-pl') },
      h(Dot, { tone: ok ? 'success' : 'warn', label: ok ? '好了' : '要看一下' }),
      h('div', { className: cls('a-pl-body') }, h('b', null, title), note ? h('span', { className: cls('faint') }, note) : null, children),
      action ? h('div', { className: cls('a-pl-act') }, action) : null)

    /** 发到 X 长文：一步步给标题、封面、正文和每张插图（发布页和阅读页的「复制到推特」共用） */
    function ArtXSteps({ project: p, data: r, copied: copiedAtFirst = false, extra }) {
      const [copied, setCopied] = useState(copiedAtFirst)
      const [got, setGot] = useState({})
      const u = f => projectFile(p, f) + '?v=' + (r.t || '')
      const nn = n => String(n).padStart(2, '0')
      const img = async (key, f) => { try { await artCopyImage(u(f)); setGot(g => ({ ...g, [key]: true })); toast('图片已复制，回 X 里按 ⌘V') } catch (e) { notify('复制图片失败：' + e.message) } }
      const openDir = () => wbPost(pApi(p, 'xpost'), { open: true }).then(() => toast('在访达里打开了'), e => notify(e.message))
      const steps = []
      const step = (key, title, note, body, action) => steps.push(h('div', { key, className: cls('a-xs') }, h('b', { className: cls('a-xs-no') }, steps.length + 1),
        h('div', { className: cls('a-pl-body') }, h('b', null, title), note ? h('span', { className: cls('faint') }, note) : null, body), action ? h('div', { className: cls('a-pl-act') }, action) : null))
      step('title', '标题', `${[...r.title].length} 字`, h('div', null, r.title), h(Btn, { sm: true, icon: 'copy', onClick: () => copyText(r.title, '标题已复制') }, '复制'))
      if (r.cover) step('cover', '封面（5:2）', null, h('img', { className: cls('a-cov'), src: u(r.cover), alt: '' }), h(Btn, { sm: true, icon: got.cover ? 'check' : 'copy', onClick: () => img('cover', r.cover) }, got.cover ? '已复制' : '复制图片'))
      step('body', copied ? `正文已复制（${r.chars} 字）` : `正文 ${r.chars} 字`, '在 X 长文编辑器的正文里按 ⌘V 粘贴。小标题、粗体、链接、列表、引用都会保留；表格已经转成图片，和插图一起编号。', null,
        h(Btn, { sm: true, kind: copied ? 'default' : 'primary', icon: 'copy', onClick: async () => { await copyHtml(r.html, r.text, '正文已复制，到 X 里粘贴'); setCopied(true) } }, copied ? '再复制一次' : '复制正文'))
      if (r.images?.length) {
        step('imgs', `插图 ${r.images.length} 张`, '正文里每个「【插图 03】」：点一下那一行，在这里点「复制」，回 X 里按 ⌘V，再删掉那行占位字。动图复制不了，打开图片文件夹拖进去。',
          h(Thumbs, { min: 120 }, r.images.map(im => h(Thumb, {
            key: im.n, src: im.file ? u(im.file) : undefined, name: `插图 ${nn(im.n)}${im.anim ? ' · 动图' : ''}${im.kind === '表' ? ' · 表格' : ''}`, meta: im.note || im.caption || '',
          }, im.file && !im.anim ? h(Btn, { sm: true, icon: got[im.n] ? 'check' : 'copy', onClick: () => img(im.n, im.file) }, got[im.n] ? '已复制' : '复制') : h(Btn, { sm: true, icon: 'folder', onClick: openDir }, '文件夹')))))
      }
      return h(Fragment, null, steps,
        r.warnings?.length ? h(Alert, { tone: 'warn' }, r.warnings.join('；')) : null,
        h(Row, null, h(Btn, { sm: true, kind: 'ghost', icon: 'folder', onClick: openDir }, '打开图片文件夹')),
        extra)
    }
    /** 复制到推特：先把正文复制上，再弹窗一步步给剩下的 */
    async function artCopyX(p) {
      const r = await wbPost(pApi(p, 'xpost'), {})
      await copyHtml(r.html, r.text, '正文已复制，到 X 长文编辑器里粘贴')
      return r
    }

    function PublishTab({ project: p, reload, version }) {
      const [pf, setPf] = useState(lsGet('a.pf', 'wechat'))
      const [gen, setGen] = useState(0)
      const data = useData(() => Promise.all([artS(p, 'publish'), wb(pApi(p, 'read') + '?v=wechat'), pf === 'x' ? wbPost(pApi(p, 'xpost'), {}).catch(() => null) : null]), [p.id, pf, version, gen])
      const [sum, setSum] = useState(null)
      const sumRef = useRef({ timer: null, dirty: false, v: '' })
      const [link, setLink] = useState('')
      const [copying, setCopying] = useState('')
      const [marking, setMarking] = useState(false)
      const [info, read, xr] = data.data ?? []
      useEffect(() => { if (info && !sumRef.current.dirty) setSum(info.wechat?.summary ?? '') }, [info])
      const saveSum = () => {
        const s = sumRef.current
        clearTimeout(s.timer); s.timer = null
        if (!s.dirty) return
        s.dirty = false
        artS(p, 'publish', 'PUT', { summary: s.v }).catch(e => notify('摘要没存上：' + e.message))
      }
      const saveRef = useRef(saveSum); saveRef.current = saveSum
      useEffect(() => () => saveRef.current(), [])
      const onSum = v => { setSum(v); const s = sumRef.current; s.v = v; s.dirty = true; clearTimeout(s.timer); s.timer = setTimeout(() => saveRef.current(), 600) }
      const platform = pf === 'x' ? 'X' : '公众号'
      const mark = async () => {
        setMarking(true)
        try {
          await wbPatch(pApi(p), { addPublish: { platform, url: link.trim(), date: todayStr() } })
          setLink(''); toast(`记下了：已发布到${platform}`); reload?.(); projects.reload().catch(() => {})
        } catch (e) { notify(e.message) } finally { setMarking(false) }
      }
      const copyBody = async () => {
        setCopying('准备中')
        try { await artCopyWechat(p, setCopying); setGen(n => n + 1) } catch (e) { notify('没复制成：' + e.message) } finally { setCopying('') }
      }

      const head = h('div', { className: cls('a-tool') },
        h(Seg, { value: pf, label: '发到哪', onChange: v => { saveSum(); setPf(v); lsSet('a.pf', v) }, options: [{ value: 'wechat', label: '公众号' }, { value: 'x', label: 'X 长文' }] }),
        h('span', { className: cls('grow') }),
        h('span', { className: cls('faint') }, '左边是发出去的样子，右边照着顺序做'))
      if (data.error) return h(ArtWrap, { wide: true }, head, h(ErrorBox, { error: data.error, onRetry: data.reload }))
      if (!info || (data.loading && pf === 'x' && !xr)) return h(ArtWrap, { wide: true }, head, h(Loading))
      const w = info.wechat, x = info.x
      const ratio = s => (s ? s[0] / s[1] : 0)
      const done = (p.published ?? []).filter(r => r.platform === platform)
      const markRow = h(ArtPubRow, {
        key: 'mark', ok: done.length > 0, title: '发完记一笔', note: '记下链接，状态自动改成「已发布」，日历上也能看到',
        action: h(Btn, { kind: 'primary', icon: 'check', busy: marking, onClick: mark }, '标记已发布'),
      }, done.length ? h(Row, null, done.map((r, i) => h(Tag, { key: i, tone: 'success' }, `已发布 ${r.date}`))) : null,
      h(Input, { value: link, onChange: setLink, placeholder: '发布后的链接（可以不填）' }))
      const preview = pf === 'x'
        ? (xr ? h('div', { className: cls('a-paper', 'a-paper-read'), style: { '--pw': '420px' } }, h(ShadowHtml, { css: artXCss(), html: artXHtml(p, xr), onClick: artNoNav })) : h(Alert, { tone: 'warn' }, 'X 长文版没整理出来，先去写作页看看正文'))
        : h(ArtWechatPaper, { project: p, read })
      const list = pf === 'x'
        ? (xr ? h(ArtXSteps, { key: 'x' + xr.t, project: p, data: xr, extra: markRow }) : markRow)
        : h(Fragment, null,
          h(ArtPubRow, { ok: w.titleLen <= 64, title: '标题', note: `${w.titleLen} 字，公众号上限 64`, action: h(Btn, { sm: true, icon: 'copy', onClick: () => copyText(w.title, '标题已复制') }, '复制') }, h('div', null, w.title)),
          h(ArtPubRow, { ok: true, title: '作者', action: h(Btn, { sm: true, icon: 'copy', onClick: () => copyText(w.author) }, '复制') }, h('div', null, w.author)),
          h(ArtPubRow, { ok: [...(sum ?? '')].length > 0 && [...(sum ?? '')].length <= 120, title: '摘要', note: `${[...(sum ?? '')].length} 字，上限 120 · 改了自动存`, action: h(Btn, { sm: true, icon: 'copy', onClick: () => copyText(sum ?? '') }, '复制') },
            h(Textarea, { value: sum ?? '', onChange: onSum, rows: 3 })),
          h(ArtPubRow, {
            ok: w.cover && Math.abs(ratio(w.coverSize) - 2.35) < 0.05, title: '封面',
            note: w.cover ? `${w.coverSize?.join('×') ?? ''}，比例 ${ratio(w.coverSize).toFixed(2)}（要求 2.35:1）` : '还没有封面，可以让右边的助手做一张',
            action: w.cover ? h(Btn, { sm: true, icon: 'download', onClick: () => artDownload(projectFile(p, w.cover), 'cover-wechat.png') }, '下载') : null,
          }, w.cover ? h('img', { className: cls('a-cov'), src: projectFile(p, w.cover) + '?v=' + gen, alt: '' }) : null),
          h(ArtPubRow, {
            ok: info.built && !info.stale, title: '正文', note: '带格式复制，图片一起嵌进去，直接粘进公众号编辑器。有图没传上去，用下面的配图包补',
            action: h(Btn, { kind: 'primary', icon: 'copy', busy: !!copying, onClick: copyBody }, copying || '复制正文'),
          }),
          h(ArtPubRow, {
            ok: w.images.length > 0, title: '配图', note: `${w.images.length} 张，按文中顺序编了号`,
            action: w.images.length ? h(Btn, { sm: true, icon: 'download', href: fileUrl(pApi(p, 'studio/images') + '?platform=wechat'), download: '公众号配图.zip' }, '下载配图包') : null,
          }),
          markRow)
      return h(ArtWrap, { wide: true }, head,
        pf === 'x' ? null : h(ArtBuildAlert, { project: p, built: info.built, stale: info.stale, onBuilt: () => { setGen(n => n + 1); reload?.() } }),
        h('div', { className: cls('a-pub') },
          h('div', { className: cls('a-desk') }, preview),
          h(Card, { title: `发到${pf === 'x' ? ' X' : '公众号'}，按顺序做` }, list)))
    }

    // ================================================================== ⑥ 提词（视频脚本）

    const artSpeak = s => (s.match(/[一-鿿]/g) || []).length + (s.match(/[A-Za-z0-9]+/g) || []).length
    /** 口播稿拆成一段一段：口播原话、画面提示；「封面和标题」「发布文案和话题」单独放（规则和 core.mjs 的 spokenText 一致） */
    function artScriptParts(md) {
      const parts = [], extra = []
      let cur = null
      for (const raw of String(md).replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
        const l = raw.trim()
        if (!l) continue
        const m = l.match(/^(#{1,6})\s+(.*)$/)
        if (m) {
          if (m[1].length === 1) continue
          if (m[1].length === 2 && /封面|标题|发布|话题|备注|素材/.test(m[2])) { cur = { title: m[2], lines: [] }; extra.push(cur) }
          else if (m[1].length > 2 && cur?.lines) continue
          else { cur = { title: m[2], say: [], shot: [] }; parts.push(cur) }
          continue
        }
        if (!cur || /^<p class="deck">/.test(l)) continue
        if (cur.lines) { if (!/^[（(].*[）)]$/.test(l)) cur.lines.push(l.replace(/^[-*]\s+/, '')); continue }
        if (l.startsWith('>')) { const s = l.replace(/^>\s*/, '').replace(/^画面[:：]\s*/, ''); if (s && !/^[（(].*[）)]$/.test(s)) cur.shot.push(s) }
        else if (!/^[（(].*[）)]$/.test(l)) cur.say.push(l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').replace(/^[-*]\s+/, ''))
      }
      return { parts: parts.filter(x => x.say.length || x.shot.length), extra: extra.filter(x => x.lines.length) }
    }
    function PrompterTab({ project: p, goTab, version }) {
      const src = useData(() => wb(pApi(p, 'source')), [p.id, version])
      const [big, setBig] = useState(false)
      const d = React.useMemo(() => artScriptParts(src.data?.text ?? ''), [src.data])
      if (src.error) return h(ArtWrap, null, h(ErrorBox, { error: src.error, onRetry: src.reload }))
      if (!src.data) return h(Loading)
      if (!d.parts.length) return h(ArtWrap, null, h(Card, null, h(Empty, { title: '口播稿还没写', body: '回到写作，让 AI 照骨架先写一版，或者自己写。', action: h(Btn, { kind: 'primary', icon: 'edit', onClick: () => goTab('write') }, '去写作') })))
      const secOf = x => Math.round(artSpeak(x.say.join('')) / 4.5)
      const chars = d.parts.reduce((n, x) => n + artSpeak(x.say.join('')), 0)
      const sayAll = d.parts.map(x => x.say.join('\n')).filter(Boolean).join('\n\n')
      const table = d.parts.map((x, i) => `${i + 1}. ${x.title}\n口播：${x.say.join(' ') || '（无）'}\n画面：${x.shot.join('；') || '（无）'}`).join('\n\n')
      const spoken = d.parts.filter(x => x.say.length)
      return h(ArtWrap, null,
        h('div', { className: cls('a-tool') },
          h('div', { className: cls('grow') }, h('h2', { className: cls('h2') }, `口播约 ${artFmtSec(Math.round(chars / 4.5))}`), h('div', { className: cls('faint') }, `${chars} 字 · ${d.parts.length} 段 · 按每秒约 4.5 个字估`)),
          h(Btn, { icon: 'expand', disabled: !spoken.length, tip: '全屏大字，只显示要说的话，方向键或点一下翻段', onClick: () => setBig(true) }, '大字提词'),
          h(Btn, { icon: 'list', onClick: () => copyText(table, '分镜表已复制') }, '复制分镜表'),
          h(Btn, { kind: 'primary', icon: 'copy', onClick: () => copyText(sayAll, '口播稿已复制') }, '复制口播稿')),
        h(Stack, null, d.parts.map((x, i) => h(Card, { key: i, title: h('span', null, h('span', { className: cls('a-pr-no') }, String(i + 1).padStart(2, '0')), ' ', x.title), note: x.say.length ? `约 ${artFmtSec(secOf(x))}` : '没有口播' },
          x.say.map((s, k) => h('p', { key: k, className: cls('a-pr-say') }, s)),
          x.shot.length ? h('div', { className: cls('a-pr-shot') }, h(Icon, { name: 'image', size: 14 }), h('span', null, x.shot.join('；'))) : null))),
        d.extra.map((x, i) => h(Card, { key: 'x' + i, title: x.title, action: h(Btn, { sm: true, kind: 'ghost', icon: 'copy', onClick: () => copyText(x.lines.join('\n')) }, '复制') },
          h('ul', { className: cls('a-pr-list') }, x.lines.map((l, k) => h('li', { key: k }, l))))),
        big ? h(ArtPrompterBig, { parts: spoken, onClose: () => setBig(false) }) : null)
    }
    /** 大字提词：深色底大字，只显示要说的话；← → 翻段，点左边三分之一往回，Esc 退出。能全屏就全屏。 */
    function ArtPrompterBig({ parts, onClose }) {
      const [i, setI] = useState(0)
      const ref = useRef(null)
      const closeRef = useRef(onClose); closeRef.current = onClose
      useEffect(() => {
        const el = ref.current
        el?.focus()
        let full = false
        el?.requestFullscreen?.().then(() => { full = true }, () => {})
        const onFs = () => { if (full && !document.fullscreenElement) closeRef.current() }
        document.addEventListener('fullscreenchange', onFs)
        return () => { document.removeEventListener('fullscreenchange', onFs); if (document.fullscreenElement === el) document.exitFullscreen?.().catch(() => {}) }
      }, [])
      const move = n => setI(k => Math.max(0, Math.min(parts.length - 1, k + n)))
      const cur = parts[i]
      return h('div', {
        ref, className: cls('a-big'), tabIndex: -1, role: 'dialog', 'aria-label': '大字提词',
        onKeyDown: e => {
          if (e.key === 'Escape') onClose()
          else if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown'].includes(e.key)) move(1)
          else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) move(-1)
          else return
          e.preventDefault(); e.stopPropagation()
        },
        onClick: e => { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX - r.left < r.width / 3) move(-1); else if (i < parts.length - 1) move(1); else onClose() },
      },
      h('div', { className: cls('a-big-head') }, h('span', null, `${i + 1} / ${parts.length}　${cur.title}`), h('span', { className: cls('grow') }), h('span', null, '← → 翻段　Esc 退出')),
      h('div', { className: cls('a-big-text') }, cur.say.map((s, k) => h('p', { key: k }, s))))
    }

    // ================================================================== ⑦ 阅读：像在微信里打开、在 X 上打开

    function ReadTab({ project: p, reload, goTab, version }) {
      const [rv, setRv] = useState(lsGet('a.rv', 'wechat'))
      const [rw, setRw] = useState(lsGet('a.rw', 'phone'))
      const [gen, setGen] = useState(0)
      const [copying, setCopying] = useState('')
      const [xDone, setXDone] = useState(null)   // 复制到推特以后：一步步给剩下的
      const view = useData(() => (rv === 'x' ? wbPost(pApi(p, 'xpost'), {}) : wb(pApi(p, 'read') + '?v=wechat')), [p.id, rv, version, gen])
      const d = view.data
      const fits = d && (rv === 'x' ? Array.isArray(d.images) : 'built' in d)
      const copy = async () => {
        if (rv === 'x') {
          setCopying('整理中')
          try { setXDone(await artCopyX(p)) } catch (e) { notify('整理推特版失败：' + e.message) } finally { setCopying('') }
          return
        }
        setCopying('准备中')
        try { const v = await artCopyWechat(p, setCopying); if (v.built !== d?.built || v.stale !== d?.stale) setGen(n => n + 1) } catch (e) { notify('没复制成：' + e.message) } finally { setCopying('') }
      }
      const open = f => window.open(webUrl(`/p/${enc(p.id)}/` + String(f).split('/').map(enc).join('/')), '_blank')
      const width = rw === 'wide' ? 680 : 420
      return h(ArtWrap, { wide: true },
        h('div', { className: cls('a-tool') },
          h(Seg, { value: rv, label: '看哪个版本', onChange: v => { setRv(v); lsSet('a.rv', v) }, options: [{ value: 'wechat', label: '公众号' }, { value: 'x', label: 'X 长文' }] }),
          h(Seg, { value: rw, label: '多宽', onChange: v => { setRw(v); lsSet('a.rw', v) }, options: [{ value: 'phone', label: '手机' }, { value: 'wide', label: '电脑' }] }),
          h('span', { className: cls('grow') }),
          rv === 'x' ? h('span', { className: cls('faint') }, '仿 X 长文的样子，实际以 X 为准') : d?.built && !d.stale && d.builtAt ? h('span', { className: cls('faint') }, `构建于 ${ago(d.builtAt)}`) : null,
          h(Btn, { icon: rv === 'x' ? 'send' : 'copy', busy: !!copying, tip: rv === 'x' ? '正文转成 X 认的格式复制上，再一步步给标题、封面和插图' : '复制带格式的正文，直接粘进公众号编辑器', onClick: copy }, copying || (rv === 'x' ? '复制到推特' : '复制正文')),
          h(Btn, { icon: 'edit', onClick: () => goTab('write') }, '去写作'),
          p.previews?.length ? h(Menu, { kind: 'ghost', icon: 'more', tip: '更多', align: 'right', items: [{ title: '在浏览器里打开' }, ...p.previews.map(x => ({ key: x.file, label: x.name, icon: 'link', onClick: () => open(x.file) }))] }) : null),
        view.error ? h(ErrorBox, { error: view.error, onRetry: view.reload })
          : !fits ? h(Loading)
            : rv === 'x'
              ? h(Fragment, null,
                d.warnings?.length ? h(Alert, { tone: 'warn' }, d.warnings.join('；')) : null,
                h('div', { className: cls('a-desk') }, h('div', { className: cls('a-paper', 'a-paper-read'), style: { '--pw': `${width}px` } }, h(ShadowHtml, { css: artXCss(), html: artXHtml(p, d), onClick: artNoNav }))))
              : h(Fragment, null,
                h(ArtBuildAlert, { project: p, built: d.built, stale: d.stale, onBuilt: () => { setGen(n => n + 1); reload?.() } }),
                h('div', { className: cls('a-desk') }, h(ArtWechatPaper, { project: p, read: d, width }))),
        p.outputs?.length ? h(Card, { title: `产出的图（${p.outputs.length}）`, sub: '点一张在浏览器里打开' },
          h(Thumbs, { min: 140 }, p.outputs.map(f => h(Thumb, { key: f, src: projectFile(p, f), name: f.split('/').pop(), onClick: () => open(f) })))) : null,
        xDone ? h(Modal, { title: '发到 X（推特）长文', width: 600, onClose: () => setXDone(null), footer: [h(Btn, { key: 'ok', kind: 'primary', onClick: () => setXDone(null) }, '完成')] },
          h(ArtXSteps, { project: p, data: xDone, copied: true })) : null)
    }

    STYLE_PARTS.push(`
.$-a-wrap{display:flex;flex-direction:column;gap:16px;width:100%;max-width:1080px;margin:0 auto;padding:16px clamp(16px,3vw,32px) 48px}
.$-a-wrap-wide{max-width:1280px}
.$-a-tool{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:36px}
.$-a-save{display:inline-flex;align-items:center;gap:6px;color:var(--$-text-3);font-size:12px;line-height:18px;white-space:nowrap}
.$-a-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.$-a-ol{min-height:56vh;padding:14px 16px;font-size:15px;line-height:1.9}
.$-a-src{min-height:64vh;padding:14px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.75}
.$-a-quote{margin:0;padding:2px 0 2px 12px;border-left:3px solid var(--$-line-2);color:var(--$-text-2);font-size:13px;line-height:20px}
.$-a-links{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;line-height:18px}
.$-a-links a{color:var(--$-accent);text-decoration:none;overflow-wrap:anywhere}
.$-a-desk{position:relative;min-width:0;padding:4px 0 24px}
.$-a-paper{position:relative;width:100%;max-width:var(--pw,640px);margin:0 auto;padding:36px 36px 48px;border-radius:var(--$-r-lg);background:Canvas;color:CanvasText;color-scheme:light;box-shadow:var(--$-shadow-1)}
.$-a-paper-read{padding:28px 20px 40px}
.$-a-wx-t{margin:0 0 10px;font-size:22px;line-height:1.4;font-weight:700}
.$-a-wx-m{display:flex;gap:10px;margin:0 0 22px;color:GrayText;font-size:15px}
.$-a-wx-a{color:LinkText}
.$-a-blk{position:relative;border-radius:var(--$-r-xs);cursor:text;transition:background-color .15s,box-shadow .15s}
.$-a-blk-lock{cursor:default}
.$-a-blk-sg{background:color-mix(in srgb,var(--$-warn) 10%,transparent);box-shadow:0 0 0 6px color-mix(in srgb,var(--$-warn) 10%,transparent)}
.$-a-flash{animation:$-a-fl 1.6s}
@keyframes $-a-fl{0%,40%{background:color-mix(in srgb,var(--$-accent) 18%,transparent);box-shadow:0 0 0 6px color-mix(in srgb,var(--$-accent) 18%,transparent)}100%{background:transparent;box-shadow:0 0 0 6px transparent}}
.$-a-ins{position:relative;height:0}
.$-a-ins button{position:absolute;left:0;right:0;top:-11px;z-index:2;display:flex;align-items:center;justify-content:center;height:22px;padding:0;border:0;background:none;color:var(--$-on-brand);cursor:pointer;opacity:0;transition:opacity .12s}
.$-a-ins button::before{content:"";position:absolute;left:0;right:0;top:10px;height:2px;border-radius:1px;background:var(--$-accent)}
.$-a-ins button svg{position:relative;width:18px;height:18px;padding:2px;border-radius:50%;corner-shape:round;background:var(--$-accent)}
.$-a-ins button:disabled{display:none}
.$-a-ins button:hover,.$-a-ins button:focus-visible{opacity:1}
.$-a-insbar{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px;padding:8px;border-radius:var(--$-r-md);background:var(--$-raised);box-shadow:var(--$-shadow-2);color:var(--$-text)}
.$-a-edit{display:flex;flex-direction:column;gap:6px;margin:4px -12px 14px;padding:8px;border-radius:var(--$-r-md);background:var(--$-raised);box-shadow:var(--$-shadow-2);color:var(--$-text);color-scheme:normal}
.$-a-edit textarea{min-height:48px;resize:none;overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.75}
.$-a-edit-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.$-a-sg{margin:6px -12px 20px;padding:10px 12px;border-radius:var(--$-r-md);background:var(--$-raised);box-shadow:var(--$-shadow-2);color:var(--$-text);font-size:13px;line-height:1.8}
.$-a-sg-head{display:flex;align-items:center;gap:6px;margin-bottom:4px;color:var(--$-warn);font-size:12px;line-height:18px}
.$-a-sg-head span{color:var(--$-text-3)}
.$-a-sg-foot{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}
.$-a-diff{overflow-wrap:anywhere}
.$-a-diff del{color:var(--$-danger);background:color-mix(in srgb,var(--$-danger) 10%,transparent);text-decoration:line-through}
.$-a-diff ins{color:var(--$-success);background:color-mix(in srgb,var(--$-success) 12%,transparent);text-decoration:none}
.$-a-end{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:28px;color:var(--$-text)}
.$-a-paper .$-a-end .$-btn{color:GrayText}
.$-a-seltool{position:absolute;z-index:8;display:flex;align-items:center;gap:2px;padding:4px;border-radius:var(--$-r-md);background:var(--$-raised);box-shadow:var(--$-shadow-3);color:var(--$-text);transform:translate(-50%,calc(-100% - 8px));white-space:nowrap}
.$-a-seltool-sep{width:.5px;height:18px;margin:0 4px;background:var(--$-line-2)}
.$-a-titles{display:flex;flex-direction:column}
.$-a-title-row{display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:.5px solid var(--$-line);font-size:14px;line-height:22px}
.$-a-title-row:last-child{border-bottom:0}
.$-a-issues{display:flex;flex-direction:column}
.$-a-issue{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:.5px solid var(--$-line)}
.$-a-issue:last-child{border-bottom:0}
.$-a-issue>.$-tag{margin-top:2px}
.$-a-issue-done{opacity:.6}
.$-a-issue-q{font-size:14px;line-height:22px}
.$-a-pub{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,440px);gap:20px;align-items:start}
.$-a-pl,.$-a-xs{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-bottom:.5px solid var(--$-line)}
.$-a-pl:last-child,.$-a-xs:last-child{border-bottom:0}
.$-a-pl>.$-dot{margin-top:7px}
.$-a-pl-body{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0;overflow-wrap:anywhere}
.$-a-pl-act{flex:none;display:flex;gap:6px}
.$-a-xs-no{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;corner-shape:round;background:var(--$-soft);font-size:12px;font-weight:500}
.$-a-cov{align-self:flex-start;max-width:100%;max-height:120px;border-radius:var(--$-r-sm);object-fit:contain}
.$-a-pr-no{color:var(--$-text-3);font-variant-numeric:tabular-nums}
.$-a-pr-say{margin:0;font-size:16px;line-height:1.9}
.$-a-pr-shot{display:flex;align-items:flex-start;gap:6px;padding:6px 10px;border-radius:var(--$-r-sm);background:var(--$-soft);color:var(--$-text-2);font-size:13px;line-height:20px}
.$-a-pr-shot svg{flex:none;margin-top:3px}
.$-a-pr-list{margin:0;padding-left:20px}
.$-a-big{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;padding:24px 6vw;background:linear-gradient(var(--$-stage-bg),var(--$-stage-bg)),var(--$-bg);color:var(--$-stage-text);outline:none;cursor:pointer;user-select:none}
.$-a-big-head{display:flex;gap:12px;font-size:14px;line-height:22px;opacity:.6}
.$-a-big-text{flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px;overflow:auto}
.$-a-big-text p{margin:0;font-size:clamp(28px,4.4vw,56px);line-height:1.5;font-weight:500}
@container $-shell (max-width:1000px){.$-a-pub{grid-template-columns:minmax(0,1fr)}}
@container $-shell (max-width:560px){.$-a-paper{padding:24px 16px 32px}}
`)

    // ---- 3.7 能动手的 AI 助手（文章大纲页、写作页、卡片精修页共用）
    //
    // ChatPane({ project, stage, focus, version, onChanged })：只画对话栏里面的内容，外框（SidePane）由 20 段放。
    //   stage：'outline' 大纲页（只动 outline.md）| 'write' 写作页 | 'card' 卡片精修页
    //   focus：作者现在选中的原文（或「正在看第 3 页」这类说明），发消息时一起带给助手
    //   onChanged(files)：助手改了项目文件、撤销了、生图插进了文章，都会调它；files 是改过的文件，接上进度时不知道改了啥就是 ['?']
    // 任务在工作台那头独立跑：离开页面不会停，回来时用 agent-status 接着看。只有点「停下」或按 Esc 才停。
    //
    // 新建项目时想让助手一进来就先做一版：queueChatSend(项目id, '按我的要求先写一版')，ChatPane 打开后会自己发出去。

    Object.assign(ICONS, {
      undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
      paperclip: 'M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.6-7.6',
      stop: 'M7 7h10v10H7z',
      globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9s1.2-6.5 3.6-9z',
    })

    /** 进项目后要自动发的一句话：{ pid, text }。ChatPane 打开时看一眼，是这个项目的就发出去并清掉。 */
    const chatAutoSend = makeStore(null)
    const queueChatSend = (pid, text) => chatAutoSend.set({ pid, text })

    const sleep = ms => new Promise(res => setTimeout(res, ms))

    /* 视频拆关键帧（照旧网页）：在浏览器里按时间均匀取一批候选画面，挑变化最大的几帧（第一帧一定要），按时间排好。视频本身不上传。 */
    async function videoKeyframes(file, { max = 12, onProgress = () => {} } = {}) {
      const url = URL.createObjectURL(file)
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url
      try {
        await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error('这个视频浏览器读不了，转成 MP4（H.264）再传')); setTimeout(() => no(new Error('读取视频超时')), 30000) })
        const d = v.duration, vw = v.videoWidth, vh = v.videoHeight
        if (!isFinite(d) || d <= 0 || !vw) throw new Error('读不到视频的时长或画面')
        const seek = sec => new Promise(ok => { const done = () => { v.removeEventListener('seeked', done); ok() }; v.addEventListener('seeked', done); v.currentTime = Math.min(Math.max(0, sec), Math.max(0, d - 0.05)); setTimeout(ok, 5000) })
        // 1. 候选：最多 48 个时间点，每个算一个 32 像素宽的灰度缩略
        const n = Math.min(48, Math.max(6, Math.ceil(d / 0.6)))
        const sw = 32, sh = Math.max(8, Math.round(32 * vh / vw)), sc = document.createElement('canvas'); sc.width = sw; sc.height = sh
        const sx = sc.getContext('2d', { willReadFrequently: true })
        const cand = []
        for (let i = 0; i < n; i++) {
          const at = n === 1 ? 0 : (i * (d - 0.05)) / (n - 1)
          await seek(at); sx.drawImage(v, 0, 0, sw, sh)
          const px = sx.getImageData(0, 0, sw, sh).data, g = new Float32Array(sw * sh)
          for (let k = 0; k < g.length; k++) g[k] = px[k * 4] * 0.3 + px[k * 4 + 1] * 0.59 + px[k * 4 + 2] * 0.11
          cand.push({ at, g }); onProgress(i + 1, n)
        }
        const diff = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length }
        cand.forEach((c, i) => { c.score = i ? diff(c.g, cand[i - 1].g) : Infinity })
        // 2. 挑帧：第一帧 + 画面变化最大的几帧，相邻两帧不能太近；画面几乎不动就按时间均匀补几帧
        const gap = d / (max * 2), picked = [cand[0]]
        for (const c of [...cand.slice(1)].sort((a, b) => b.score - a.score)) {
          if (picked.length >= max || c.score < 1.5) break
          if (picked.every(x => Math.abs(x.at - c.at) >= gap)) picked.push(c)
        }
        const want = Math.min(max, d < 4 ? 3 : 5)
        for (let i = 1; picked.length < want && i < n; i++) { const c = cand[Math.round(i * (n - 1) / (want - 1))]; if (c && !picked.includes(c)) picked.push(c) }
        picked.sort((a, b) => a.at - b.at)
        // 3. 取清晰的帧：宽最多 1280，JPEG
        const W = Math.min(1280, vw), H = Math.round(W * vh / vw), fc = document.createElement('canvas'); fc.width = W; fc.height = H
        const fx = fc.getContext('2d'), frames = []
        for (const c of picked) { await seek(c.at); fx.drawImage(v, 0, 0, W, H); frames.push({ t: c.at, data: fc.toDataURL('image/jpeg', 0.82) }) }
        return { duration: d, frames }
      } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load() }
    }

    /** 图片转成 data URL。长边超过 1600 或文件太大就先缩成 JPEG（工作台收到后本来也会缩到 1600），少走点数据。GIF 原样。 */
    function imageToDataUrl(file) {
      return new Promise((ok, no) => {
        const fr = new FileReader()
        fr.onerror = () => no(new Error(`${file.name || '图片'} 读不了`))
        fr.onload = () => {
          const raw = String(fr.result)
          if (/^data:image\/gif/.test(raw)) return ok(raw)
          const img = new Image()
          img.onerror = () => ok(raw)
          img.onload = () => {
            const big = Math.max(img.naturalWidth, img.naturalHeight)
            if (big <= 1600 && file.size < 1.5e6) return ok(raw)
            const k = Math.min(1, 1600 / big), cv = document.createElement('canvas')
            cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k)
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
            ok(cv.toDataURL('image/jpeg', 0.86))
          }
          img.src = raw
        }
        fr.readAsDataURL(file)
      })
    }

    // 助手每一步带的图标名（工作台用的 lucide 名字）→ 底座里有的图标
    const STEP_ICON = {
      search: 'search', globe: 'globe', 'file-text': 'file', 'pen-line': 'edit', 'file-pen-line': 'edit', 'pencil-line': 'edit', play: 'play',
      images: 'image', image: 'image', download: 'download', sparkles: 'spark', bookmark: 'star', 'list-checks': 'check', 'triangle-alert': 'warn',
      'folder-open': 'folder', 'message-square': 'chat', puzzle: 'grid', 'scan-text': 'eye', camera: 'image', link: 'link',
    }
    const stepIcon = name => STEP_ICON[name] ?? 'right'

    const QUICK = {
      outline: ['按我的要求先查资料，再出一版大纲', '这版大纲有什么问题？', '小标题再具体一点，让人一眼看懂', '第二节和第三节是不是重了？', '再给 3 个大标题备选'],
      card: ['封面标题再短一点、更抓人', '整组卡片的字再大一点、留白多一点', '照我上一组卡片的风格来改', '给第 2 页找一张官网截图放进去', '帮我检查有没有文字溢出'],
      script: ['照骨架先写一版完整的口播稿', '开头 3 秒的钩子再抓人一点，给我 3 个版本', '整条压到 60 秒以内', '这几句念着不顺，改得更口语', '给 3 个封面字和 5 个标题'],
      article: ['把整体排版换成更简洁、留白多一点的风格', '给第一章找一张官网的配图插进去', '给开头生成一张头图', '这一段读着像 AI 写的，帮我改', '帮我起 5 个标题'],
    }
    const EMPTY = {
      outline: ['和 AI 一起定大纲', '它会先查资料、记进资料页，再按资料定标题、写大纲。大纲你可以直接改，也可以问它哪里有问题、让它改。'],
      card: ['和 AI 一起做这组卡片', '它能直接改卡片的文案、版式和样式，找图、生图，会记住你说过的偏好，也能参考你以前的卡片。每次改动都能一键撤销。'],
      script: ['和 AI 一起写这条口播稿', '它能直接写和改口播稿：开头钩子、每段的口播原话和画面提示、封面字、标题和发布文案，会按时长删改，也会记住你说过的偏好。每次改动都能一键撤销。'],
      article: ['和 AI 一起做这篇文章', '它能直接改正文、调整排版样式、找官网配图、生成配图，会记住你说过的偏好，也能参考你以前的文章。每次改动都能一键撤销。'],
    }
    const SIZE_NAME = [{ value: 'landscape', label: '横图' }, { value: 'square', label: '方图' }, { value: 'portrait', label: '竖图' }]
    const MEMO_OP = { add: '记住了', update: '更新了', remove: '删掉了', promote: '升为守则', demote: '降为卡片', miss: '被推翻', archive: '归档了' }

    /** 现在选的模型能不能跑「能动手的助手」（Claude、Claude Code、DSH 里的模型）。列表还没拿到时先当能。 */
    function useAgentReady() {
      const value = useStore(providerStore)
      const list = useStore(providersCache)
      useEffect(() => { loadProviders().catch(() => {}) }, [])
      if (!list) return true
      const id = (value || list.default || '').split('::')[0]
      const pv = list.providers?.find(x => x.id === id)
      return !pv || pv.dsh || pv.type === 'anthropic' || pv.type === 'claudecode'
    }

    /** 等确认的生图请求：提示词、尺寸、张数都能改，点「生成」前先问一句（按张计费）。 */
    function ChatJobCard({ job, onConfirm, onReject }) {
      const [prompt, setPrompt] = useState(job.prompt || '')
      const [size, setSize] = useState(job.size || 'landscape')
      const [n, setN] = useState(String(job.n || 1))
      const [busy, setBusy] = useState('')
      const head = h('div', { className: cls('c-box-head') }, h(Icon, { name: 'spark' }), h('b', null, '生成配图'), h('span', { className: cls('faint', 'grow') }, job.title || ''))
      if (job.status === 'done') {
        return h('div', { className: cls('c-box') }, head, h(ChatImgs, { list: job.assets }),
          h('span', { className: cls('faint') }, job.inserted ? '已插进文章' : job.insertError ? `没插进去：${job.insertError}` : '已存进素材库'))
      }
      if (job.status === 'rejected') return h('div', { className: cls('c-box', 'c-off') }, head, h('span', { className: cls('faint') }, '已取消'))
      if (job.status === 'running') return h('div', { className: cls('c-box') }, head, h('span', { className: cls('c-live-stat') }, h(Spin, { sm: true }), '正在生成…'))
      const act = (key, fn) => async () => { setBusy(key); try { await fn() } finally { setBusy('') } }
      return h('div', { className: cls('c-box') }, head,
        h(Textarea, { value: prompt, onChange: setPrompt, rows: 4, 'aria-label': '画面描述' }),
        h('div', { className: cls('c-row') },
          h('span', { className: cls('c-sel') }, h(Select, { value: size, onChange: setSize, options: SIZE_NAME, 'aria-label': '尺寸' })),
          h('span', { className: cls('c-sel') }, h(Select, { value: n, onChange: setN, options: ['1', '2', '3', '4'].map(x => ({ value: x, label: `${x} 张` })), 'aria-label': '张数' })),
          h('span', { className: cls('grow') }),
          h(Btn, { kind: 'ghost', sm: true, busy: busy === 'no', disabled: !!busy, onClick: act('no', onReject) }, '不要'),
          h(Btn, { kind: 'primary', sm: true, icon: 'spark', busy: busy === 'ok', disabled: !!busy || !prompt.trim(), onClick: act('ok', () => onConfirm({ prompt, size, n: Number(n) })) }, '生成')),
        h('span', { className: cls('faint') }, job.after ? `生成后插在「${job.after.slice(0, 24)}…」那段后面。` : '生成后存进素材库。', '生图会按接口计费。',
          job.error ? h('span', { className: cls('c-err-text') }, ` 上次失败：${job.error}`) : null))
    }

    /** 一排小图（素材库里的图），点开看大图。 */
    const ChatImgs = ({ list }) => list?.length ? h('div', { className: cls('c-imgs') }, list.map((a, i) => h('a', { key: a.id ?? i, href: fileUrl('/assets/' + enc(a.file)), target: '_blank', rel: 'noreferrer', title: a.title || '' },
      h('img', { src: fileUrl('/assets/' + enc(a.file)), alt: a.title || '', loading: 'lazy' })))) : null

    function ChatPane({ project, stage = 'write', focus = '', version, onChanged }) {
      const pid = project.id
      const kind = stage === 'outline' ? 'outline' : stage === 'card' || project.type === 'card' ? 'card' : project.form === 'script' ? 'script' : 'article'
      const agentOk = useAgentReady()

      const [booting, setBooting] = useState(true)
      const [hist, setHist] = useState([])                         // 对话记录（GET studio/chat）
      const [maps, setMaps] = useState({ jobs: {}, reqs: {}, decs: {} })   // 生图请求、装技能请求、等你定的事，按 id
      const [live, setLive] = useState(null)                       // 正在跑的这一轮：{ text, steps, t0, last, injected, stopping }
      const [now, setNow] = useState(Date.now())
      const [lost, setLost] = useState(null)                       // 连不上工作台：{ why, local: { text, refs } | null }
      const [memAsk, setMemAsk] = useState(null)                   // 撤销后问一句「以后别这样」：{ text } | { saved }
      const [draft, setDraft] = useState('')
      const [refs, setRefs] = useState([])                         // 附件：{ kind: 'img', data } | { kind: 'video', frames, busy } | { kind: 'link', url }
      const [picks, setPicks] = useState({})                       // 决定卡片上点了的选项，还没发
      const [undoing, setUndoing] = useState(null)
      const [reqBusy, setReqBusy] = useState(null)
      const [drag, setDrag] = useState(false)

      const alive = useRef(true)
      const run = useRef({ busy: false, job: null, stopping: false })
      const memoTimer = useRef(null)
      const logRef = useRef(null)
      const atBottom = useRef(true)
      const taRef = useRef(null)
      const fileRef = useRef(null)
      const latest = useRef({})
      latest.current = { focus, onChanged, stage }

      const P_ = sub => pApi(pid, 'studio/' + sub)
      const changedOut = async files => { try { await latest.current.onChanged?.(files) } catch { /* 外面刷新失败不影响对话 */ } }

      // 对话记录 + 三种卡片一起取
      const reloadAll = useCallback(async () => {
        const [h0, jl, rl, dl] = await Promise.all([wb(P_('chat')), wb(P_('imgjobs')).catch(() => []), wb(P_('skillreqs')).catch(() => []), wb(P_('decisions')).catch(() => [])])
        if (!alive.current) return
        const by = l => Object.fromEntries((Array.isArray(l) ? l : []).map(x => [x.id, x]))
        setMaps({ jobs: by(jl), reqs: by(rl), decs: by(dl) })
        setHist(Array.isArray(h0) ? h0 : [])
      }, [pid])

      // 按工作台的进度画「正在做」那一块（回到页面接上、连接断了时用）。返回 'done' 做完 | 'dead' 连不上 | 'gone' 组件已卸载
      async function follow() {
        let fails = 0
        for (;;) {
          if (!alive.current) return 'gone'
          const st = await wb(P_('agent-status')).catch(() => null)
          if (!alive.current) return 'gone'
          if (!st) { if (++fails >= 3) return 'dead' } else {
            fails = 0
            if (!st.running) return 'done'
            const steps = st.steps || []
            setLive(l => l && { ...l, text: st.text ?? l.text, steps, last: steps[steps.length - 1]?.text || l.last })
          }
          await sleep(1500)
        }
      }

      // 记忆整理在后台跑（几秒到十几秒），整理完把「记住了……」补到这一轮下面
      function waitMemo() {
        let n = 0
        const tickMemo = async () => {
          if (!alive.current || run.current.busy || ++n > 10) return
          const h1 = await wb(P_('chat')).catch(() => null)
          if (!alive.current || run.current.busy) return
          const last = Array.isArray(h1) ? [...h1].reverse().find(x => x.role === 'ai') : null
          if (last?.memoDone) { if (last.memo?.length) setHist(h1); return }
          memoTimer.current = setTimeout(tickMemo, 3000)
        }
        clearTimeout(memoTimer.current)
        memoTimer.current = setTimeout(tickMemo, 3000)
      }

      // 一轮结束：收起「正在做」，告诉外面改了文件，重新取对话
      async function finish(changed) {
        run.current = { busy: false, job: null, stopping: false }
        if (!alive.current) return
        setLive(null)
        if (changed.length) await changedOut(changed)
        await reloadAll().catch(e => notify(e.message))
        waitMemo()
      }
      // 连不上工作台：撤掉转圈，说清楚，给「重新发送」或「重新连接」
      function lostOut(why, local) {
        run.current = { busy: false, job: null, stopping: false }
        setLive(null)
        setLost({ why, local })
      }

      // 打开时这个项目有任务在跑就接上；没有的话看看有没有要自动发的话
      async function resume({ first } = {}) {
        const st = await wb(P_('agent-status')).catch(() => null)
        if (!alive.current) return
        if (first) setBooting(false)
        if (!st?.running || run.current.busy) return
        run.current.busy = true
        setLost(null)
        const steps = st.steps || []
        setLive({ text: st.text || '', steps, t0: Date.parse(st.startedAt) || Date.now(), last: steps[steps.length - 1]?.text || '在想怎么做', injected: [] })
        const r = await follow()
        if (r === 'gone') return
        if (r === 'dead') { lostOut('连接断了', null); return }
        await finish(['?'])
      }

      useEffect(() => {
        alive.current = true
        ;(async () => {
          try { await reloadAll() } catch (e) { if (alive.current) notify(e.message) }
          await resume({ first: true })
        })()
        return () => {
          alive.current = false
          clearTimeout(memoTimer.current)
          // 只停掉「往页面传字」的那条流，工作台那头的任务接着跑，回来时接上
          run.current.job?.stop()
          run.current = { busy: false, job: null, stopping: false }
        }
      }, [pid])

      // 别的页面替作者说的话：queueChatSend 的直接发（新建项目、大纲定稿）；chatHandoff 里 send 为假的只填进输入框（「让 AI 用这条」「问助手」）
      const autoSend = useStore(chatAutoSend)
      const handoff = useStore(chatHandoff)
      useEffect(() => {
        if (booting || autoSend?.pid !== pid || run.current.busy) return
        const text = autoSend.text
        chatAutoSend.set(null)   // 先取走，免得发两遍（这会让本组件重画，所以下面的定时器不能在清理时取消）
        setTimeout(() => { if (alive.current) sendRef.current(text) }, 300)
      }, [autoSend, booting, pid])
      useEffect(() => {
        if (handoff?.pid !== pid) return
        chatHandoff.set(null)
        if (!handoff.send) setDraft(d => (d ? `${d}\n${handoff.text}` : handoff.text))
      }, [handoff, pid])

      // 正在做时每秒刷新一下「已经 N 秒」
      usePoll(() => setNow(Date.now()), 1000, !!live)

      // 新内容来了滚到底（作者往上翻着看的时候不打扰）
      useLayoutEffect(() => {
        const el = logRef.current
        if (el && atBottom.current) el.scrollTop = el.scrollHeight
      }, [hist, live, lost, memAsk, booting])

      // ---- 发消息
      const flatRefs = list => list.flatMap(r => r.kind === 'video'
        ? r.frames.map(fr => ({ data: fr.data, label: `视频《${r.name}》第 ${fr.t.toFixed(1)} 秒（全长 ${r.duration.toFixed(1)} 秒）` }))
        : r.kind === 'img' ? [{ data: r.data }] : [])

      async function sendAgent(text, list) {
        if (run.current.busy) return toast('助手还在做上一件事，按 Esc 可以停下')
        if (list.some(r => r.busy)) return toast('视频还在拆关键帧，等一下再发')
        // 链接直接写进消息：工作台会认出消息里的链接，让助手用 screenshot_page 看样子、read_page 读原文
        const links = list.filter(r => r.kind === 'link').map(r => r.url)
        const message = links.length ? `${text}\n\n参考链接：${links.join('  ')}` : text
        const images = flatRefs(list)
        run.current = { busy: true, job: null, stopping: false }
        atBottom.current = true
        setRefs([]); setDraft(''); setLost(null); setMemAsk(null)
        setHist(l => [...l, { role: 'user', text: message, local: images.map(x => x.data), t: new Date().toISOString() }])
        setLive({ text: '', steps: [], t0: Date.now(), last: '在想怎么做', injected: [] })
        let finished = false, errMsg = '', changed = [], got = false, streamErr = null
        const job = wbEvents(P_('agent'), {
          message, focus: latest.current.focus || '', stage: latest.current.stage === 'outline' ? 'outline' : '', provider: currentProvider(), images,
        }, {
          onEvent(ev) {
            got = true
            if (ev.type === 'done') { finished = true; if (Array.isArray(ev.files)) changed = ev.files }
            else if (ev.type === 'error') { finished = true; errMsg = ev.error || '出错了' }
            else if (ev.type === 'files') changed = ev.files || []
            if (!alive.current) return
            if (ev.type === 'text') setLive(l => l && { ...l, text: l.text + ev.text, last: '在写回复' })
            else if (ev.type === 'step') setLive(l => l && { ...l, steps: [...l.steps, { icon: ev.icon, text: ev.text }], last: ev.text })
          },
        })
        run.current.job = job
        try { await job.done } catch (e) { streamErr = e }
        if (!alive.current) return
        if (errMsg && !run.current.stopping) notify(errMsg)
        if (!finished) {
          // 流断了：任务可能还在跑（改成查进度接着等），也可能根本没发出去
          const st = await wb(P_('agent-status')).catch(() => null)
          if (!alive.current) return
          if (st?.running) {
            const r = await follow()
            if (r === 'gone') return
            if (r === 'dead') { lostOut('连接断了', null); return }
            changed = ['?']
          } else if (!got) {
            if (st === null) { lostOut('这条没发出去', { text, refs: list }); return }
            notify(streamErr?.message || '没发出去，再试一次')
            setDraft(d => d || text); setRefs(r => (r.length ? r : list))
          } else changed = ['?']
        }
        await finish(changed)
      }

      async function send(text, list = refs) {
        text = String(text || '').trim()
        if (!text && list.length) text = list.some(r => r.kind !== 'link') ? '参考这几张图来改' : '参考这个网页来改'
        if (!text) { taRef.current?.focus(); return }
        if (!agentOk) { notify('这里的助手要用 Claude、Claude Code 或 DSH 里的模型，在左下角换一个再发', { tone: 'warn' }); return }
        await sendAgent(text, list)
      }
      const sendRef = useRef(send); sendRef.current = send

      async function stop() {
        if (!run.current.busy || run.current.stopping) return
        run.current.stopping = true
        setLive(l => l && { ...l, stopping: true })
        try { await wbPost(P_('agent-stop'), {}) } catch (e) { notify(e.message) }
      }

      // 助手干活时又想到什么：直接交给正在做的任务，它下一步就会看到
      async function inject(text) {
        text = String(text || '').trim()
        if (!text) return
        if (refs.length) return toast('附件要等这一轮做完再发')
        try { await wbPost(P_('agent-inject'), { text }) } catch (e) { return notify(e.message) }
        atBottom.current = true
        setLive(l => l && { ...l, injected: [...l.injected, text] })
        setDraft('')
      }

      // ---- 附件
      async function addFiles(files) {
        let list = [...refs]
        const put = next => { list = next; setRefs(next) }
        for (const f of [...files || []]) {
          if (/^video\//.test(f.type) || /\.(mov|mp4|m4v|webm)$/i.test(f.name || '')) {
            if (list.filter(r => r.kind === 'video').length >= 2) { toast('一次最多附 2 个视频'); continue }
            const key = Math.random().toString(36).slice(2)
            const item = { key, kind: 'video', name: f.name || '视频', frames: [], busy: true, prog: '' }
            put([...list, item])
            const patch = more => setRefs(rs => rs.map(r => (r.key === key ? { ...r, ...more } : r)))
            videoKeyframes(f, { onProgress: (k, n) => { if (alive.current) patch({ prog: `${k}/${n}` }) } })
              .then(r => { if (alive.current) patch({ frames: r.frames, duration: r.duration, busy: false }) })
              .catch(err => { if (!alive.current) return; setRefs(rs => rs.filter(r => r.key !== key)); notify(err.message) })
            continue
          }
          if (!/^image\//.test(f.type)) continue
          if (f.size > 20e6) { toast(`${f.name || '图片'} 太大（超过 20 MB）`); continue }
          const count = list.reduce((n, r) => n + (r.kind === 'video' ? r.frames?.length || 12 : r.kind === 'img' ? 1 : 0), 0)
          if (count >= 30) { toast('一次最多附 30 张图'); break }
          try {
            const data = await imageToDataUrl(f)
            if (!alive.current) return
            setRefs(rs => [...rs, { key: Math.random().toString(36).slice(2), kind: 'img', data, name: f.name }])
            list = [...list, { kind: 'img' }]
          } catch (e) { notify(e.message) }
        }
      }
      async function addLink() {
        const v = await ask({ title: '附一个网页链接', text: '助手会打开它：截图看版式和配色，读原文拿资料。', input: { placeholder: 'https://…' }, ok: '附上' })
        const url = String(v || '').trim()
        if (!url) return
        if (!/^https?:\/\/\S+$/i.test(url)) return toast('要以 http:// 或 https:// 开头')
        if (refs.filter(r => r.kind === 'link').length >= 6) return toast('一次最多附 6 个链接')
        setRefs(rs => [...rs, { key: Math.random().toString(36).slice(2), kind: 'link', url }])
        taRef.current?.focus()
      }

      // ---- 卡片上的操作
      async function clearChat() {
        if (!(await ask({ title: '清空对话？', text: '这个项目的对话记录会删掉，改过的文件不受影响。', ok: '清空', danger: true }))) return
        try { await wbDel(P_('chat')); setHist([]); setLost(null); setMemAsk(null) } catch (e) { notify(e.message) }
      }
      async function undo(turn) {
        setUndoing(turn)
        try {
          const r = await wbPost(P_('agent-undo'), { turn })
          toast('已撤销：' + (r.files || []).join('、'))
          await changedOut(r.files || [])
          await reloadAll()
          atBottom.current = true
          setMemAsk({ text: '' })
        } catch (e) { notify(e.message) } finally { setUndoing(null) }
      }
      async function remember() {
        const text = String(memAsk?.text || '').trim()
        if (!text) return
        try { await wbPost('/api/memory', { text, kind: 'avoid' }); setMemAsk({ saved: text }) } catch (e) { notify(e.message) }
      }
      async function sendDecisions(ids) {
        if (run.current.busy) return toast('助手还在做上一件事，按 Esc 可以停下')
        const ds = ids.map(id => maps.decs[id]).filter(d => d && !d.answer && picks[d.id])
        if (!ds.length) return
        try { await wbPost(P_('decisions'), { answers: ds.map(d => ({ id: d.id, answer: picks[d.id] })) }) } catch (e) { return notify(e.message) }
        const msg = '我的决定：\n' + ds.map((d, i) => `${i + 1}. ${d.title} → ${picks[d.id]}`).join('\n')
        setPicks(pk => { const next = { ...pk }; ds.forEach(d => { delete next[d.id] }); return next })
        send(msg)
      }
      async function confirmJob(job, edit) {
        if (!(await ask({ title: '生成配图？', text: `会调用生图接口生成 ${edit.n} 张，按张计费。`, ok: '生成' }))) return
        setMaps(m => ({ ...m, jobs: { ...m.jobs, [job.id]: { ...job, status: 'running' } } }))
        try {
          const r = await wbPost(P_('imgjob'), { id: job.id, prompt: edit.prompt, size: edit.size, n: edit.n })
          toast(r.job?.inserted ? '生成好了，已插进文章' : `生成好了 ${r.assets?.length ?? 0} 张，在素材库里`)
          if (r.job?.inserted) await changedOut(['article.md'])
        } catch (e) { notify(e.message) }
        await reloadAll().catch(() => {})
      }
      async function rejectJob(job) {
        try { await wbPost(P_('imgjob-reject'), { id: job.id }) } catch (e) { notify(e.message) }
        await reloadAll().catch(() => {})
      }
      async function answerReq(r, action) {
        setReqBusy(r.id + action)
        try { const x = await wbPost(P_('skillreq'), { id: r.id, action }); if (action === 'install') toast(`装好了：${x.name || r.name}`) } catch (e) { notify(e.message) }
        setReqBusy(null)
        await reloadAll().catch(() => {})
      }

      // ---- 画
      const attachUrl = f => fileUrl(P_('attach') + '?f=' + enc(f))
      const meMsg = (key, text, imgs = [], tag) => h('div', { key, className: cls('c-me') },
        tag ? h('div', { className: cls('c-inj-tag') }, h(Icon, { name: 'chat', size: 12 }), tag) : null,
        imgs.length ? h('div', { className: cls('c-mimgs') }, imgs.slice(0, 8).map((u, i) => h('a', { key: i, href: u, target: '_blank', rel: 'noreferrer' }, h('img', { src: u, alt: '' }))),
          imgs.length > 8 ? h('span', { className: cls('faint') }, `+${imgs.length - 8}`) : null) : null,
        text)
      const stepList = steps => h('div', { className: cls('c-steps-list') }, steps.map((x, i) => h('div', { key: i, className: cls('c-step') }, h(Icon, { name: stepIcon(x.icon), size: 12 }), h('span', null, x.text))))
      const memoLine = m => {
        const list = (m.memo || []).filter(x => x.op !== 'hit')
        if (!list.length) return null
        return h('div', { className: cls('c-memo') }, h(Icon, { name: 'star', size: 14 }),
          h('div', { className: cls('grow') }, list.map((x, i) => h('div', { key: i }, h('em', null, MEMO_OP[x.op] || ''), x.text))),
          h(Btn, { kind: 'ghost', sm: true, onClick: () => go('memory') }, '看记忆'))
      }
      const decBlock = (ids, key) => {
        const ds = (ids || []).map(id => maps.decs[id]).filter(Boolean)
        if (!ds.length) return null
        const open = ds.filter(d => !d.answer), chosen = open.filter(d => picks[d.id]).length
        return h('div', { key, className: cls('c-box') },
          h('div', { className: cls('c-box-head') }, h(Icon, { name: 'check' }), h('b', null, open.length ? '等你定' : '你定好的'),
            h('span', { className: cls('faint') }, open.length ? `${open.length} 件，点选后一起发给 AI` : `${ds.length} 件`)),
          ds.map(d => h('div', { key: d.id, className: cls('c-dec', d.answer && 'c-off') },
            h('b', null, d.title),
            d.detail ? h('span', { className: cls('muted') }, d.detail) : null,
            (d.quotes || []).map((q, i) => h('div', { key: i, className: cls('c-quote'), title: '在正文里的位置' }, `「${q}」`)),
            d.answer ? h('span', { className: cls('c-ans') }, h(Icon, { name: 'check', size: 14 }), d.answer)
              : h('div', { className: cls('c-row') }, d.options.map(o => h(Btn, { key: o, sm: true, kind: picks[d.id] === o ? 'primary' : 'default', onClick: () => setPicks(pk => ({ ...pk, [d.id]: pk[d.id] === o ? undefined : o })) }, o))))),
          open.length ? h('div', { className: cls('c-row') }, h('span', { className: cls('faint', 'grow') }, chosen ? `已选 ${chosen} / ${open.length}` : '也可以直接在下面打字说别的想法'),
            h(Btn, { kind: 'primary', sm: true, icon: 'send', disabled: !chosen || !!live, tip: live ? '等助手做完这一轮' : undefined, onClick: () => sendDecisions(ds.map(d => d.id)) }, '把决定发给 AI')) : null)
      }
      const reqCard = r => r ? h('div', { key: r.id, className: cls('c-box', r.status !== 'pending' && 'c-off') },
        h('div', { className: cls('c-box-head') }, h(Icon, { name: 'grid' }), h('b', null, '安装技能'), h('span', { className: cls('faint', 'grow') }, r.name)),
        r.reason ? h('span', { className: cls('muted') }, r.reason) : null,
        h('a', { className: cls('faint', 'c-link-a'), href: r.url, target: '_blank', rel: 'noreferrer' }, `${r.repo}/${r.path}`),
        r.status === 'pending' ? h('div', { className: cls('c-row') }, h('span', { className: cls('faint', 'grow') }, '第三方写的说明会影响 AI 的做法，看过再装'),
          h(Btn, { kind: 'ghost', sm: true, disabled: !!reqBusy, busy: reqBusy === r.id + 'reject', onClick: () => answerReq(r, 'reject') }, '不要'),
          h(Btn, { kind: 'primary', sm: true, icon: 'download', disabled: !!reqBusy, busy: reqBusy === r.id + 'install', onClick: () => answerReq(r, 'install') }, '安装'))
          : h('span', { className: cls('faint') }, r.status === 'installed' ? '已安装，下次发消息就能用' : '没装')) : null
      const aiMsg = (m, key) => {
        // 以前「修改建议」那种回复（不是能动手的助手）：只显示文字
        if (!m.agent) return h('div', { key, className: cls('c-ai') }, h(Md, { text: m.text || '' }), m.edits ? h('span', { className: cls('faint') }, `在文中标了 ${m.edits} 处修改`) : null, memoLine(m))
        return h('div', { key, className: cls('c-ai') },
          m.text ? (m.error ? h('div', { className: cls('c-err') }, h(Icon, { name: 'warn' }), h('span', null, m.text)) : h(Md, { text: m.text })) : null,
          m.steps?.length ? h('details', { className: cls('c-steps') }, h('summary', null, `做了 ${m.steps.length} 步`), stepList(m.steps)) : null,
          m.lint?.length ? h('details', { className: cls('c-steps') }, h('summary', null, `它改完没自查，按你的规矩查到 ${m.lint.length} 处可能有问题`),
            m.lint.map((x, i) => h('div', { key: i, className: cls('c-step') }, h('span', null, h('b', null, x.problem), `「${x.quote}」→ ${x.fix}`))),
            h('span', { className: cls('faint') }, '让它改：直接说「把自查查出来的几处改掉」')) : null,
          h(ChatImgs, { list: m.assets }),
          (m.jobs || []).map(id => maps.jobs[id] ? h(ChatJobCard, { key: id + ':' + maps.jobs[id].status, job: maps.jobs[id], onConfirm: edit => confirmJob(maps.jobs[id], edit), onReject: () => rejectJob(maps.jobs[id]) }) : null),
          (m.skillReqs || []).map(id => reqCard(maps.reqs[id])),
          decBlock(m.decisions, 'dec'),
          memoLine(m),
          m.files?.length ? h('div', { className: cls('c-chg', m.undone && 'c-off') }, h(Icon, { name: 'edit', size: 14 }), h('span', { className: cls('grow') }, `改了 ${m.files.join('、')}`),
            m.undone ? h('em', null, '已撤销') : m.turn ? h(Btn, { kind: 'ghost', sm: true, icon: 'undo', busy: undoing === m.turn, disabled: !!live || !!undoing, tip: live ? '等助手做完这一轮再撤销' : '这一轮改过的文件全部恢复原样', onClick: () => undo(m.turn) }, '撤销这次改动') : null) : null)
      }

      const lastMsg = hist[hist.length - 1]
      const unfinished = !live && !lost && !booting && lastMsg?.role === 'user' && !lastMsg.local
      const [emptyTitle, emptyText] = EMPTY[kind]
      const sec = live ? Math.max(0, ((now - live.t0) / 1000) | 0) : 0

      const log = h('div', {
        ref: logRef, className: cls('c-log'), 'aria-live': 'polite',
        onScroll: e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 },
      },
      booting ? h(Loading, { text: '正在读对话…' })
        : !hist.length && !live ? h('div', { className: cls('c-empty') },
          h('div', { className: cls('c-empty-title') }, h(Icon, { name: 'spark', size: 18 }), h('b', null, emptyTitle)),
          h('p', { className: cls('muted') }, agentOk ? emptyText : '这里的助手要用 Claude、Claude Code 或 DSH 里的模型，在左下角换一个再说。'),
          h('div', { className: cls('c-quick') }, QUICK[kind].map(q => h('button', { key: q, type: 'button', onClick: () => send(q) }, q))))
          : h(Fragment, null,
            hist.length > 0 && !live ? h('div', { className: cls('c-top') }, h(Btn, { kind: 'ghost', sm: true, icon: 'trash', onClick: clearChat }, '清空对话')) : null,
            hist.map((m, i) => (m.role === 'user'
              ? meMsg(i, m.text, m.local || (m.images || []).map(attachUrl), m.inject ? '补充给正在做的任务' : null)
              : aiMsg(m, i))),
            live ? live.injected.map((x, i) => meMsg('inj' + i, x, [], '补充给正在做的任务')) : null,
            live ? h('div', { className: cls('c-ai') },
              live.text ? h(Md, { text: live.text }) : null,
              live.steps.length ? stepList(live.steps) : null,
              h('div', { className: cls('c-live-stat') }, h(Spin, { sm: true }), live.stopping ? '正在停下…' : `${live.last}… ${sec} 秒`)) : null,
            unfinished ? h(Alert, { tone: 'warn', action: h(Btn, { sm: true, icon: 'refresh', onClick: () => { setHist(l => l.slice(0, -1)); send(lastMsg.text, []) } }, '重新发送') }, '这一轮没有做完（可能是工作台重启了或出了错）。') : null,
            lost ? h(Alert, {
              tone: 'warn',
              action: lost.local ? h(Btn, { sm: true, icon: 'refresh', onClick: () => { const { text, refs: rs } = lost.local; setHist(l => (l[l.length - 1]?.local ? l.slice(0, -1) : l)); send(text, rs) } }, '重新发送')
                : h(Btn, { sm: true, icon: 'refresh', onClick: async () => { setLost(null); await reloadAll().catch(e => notify(e.message)); resume() } }, '重新连接'),
            }, `${lost.why}：连不上工作台，可能被重启或关掉了。等它起来后${lost.local ? '点「重新发送」' : '点「重新连接」'}。`) : null,
            memAsk ? h('div', { className: cls('c-box') }, memAsk.saved
              ? h('span', { className: cls('muted') }, `记住了：${memAsk.saved}`)
              : h(Fragment, null,
                h('span', { className: cls('muted') }, '撤销了。以后要避开这类改动吗？写一句原因，记进 AI 记忆，所有文章和卡片都会照做：'),
                h(Input, {
                  value: memAsk.text, autoFocus: true, onChange: v => setMemAsk({ text: v }),
                  placeholder: kind === 'card' ? '比如：封面别用深色底；字不要小于 28 号' : '比如：别动我的标题；图注不要写来源链接',
                  onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) remember(); if (e.key === 'Escape') { e.stopPropagation(); setMemAsk(null) } },
                }),
                h('div', { className: cls('c-row') }, h('span', { className: cls('grow') }), h(Btn, { kind: 'ghost', sm: true, onClick: () => setMemAsk(null) }, '算了'), h(Btn, { kind: 'primary', sm: true, disabled: !memAsk.text?.trim(), onClick: remember }, '记住')))) : null))

      const refsRow = refs.length ? h('div', { className: cls('c-refs') },
        refs.map(r => h('span', { key: r.key, className: cls('c-ref', r.kind === 'link' && 'c-ref-link') },
          r.kind === 'img' ? h('img', { src: r.data, alt: r.name || '' })
            : r.kind === 'video' ? h(Fragment, null, r.frames?.[0] ? h('img', { src: r.frames[0].data, alt: '' }) : null, h('span', { className: cls('c-ref-lab') }, h(Icon, { name: 'play', size: 12 }), r.busy ? `拆帧 ${r.prog || ''}` : `${r.frames.length} 帧`))
              : h(Fragment, null, h(Icon, { name: 'link', size: 12 }), h('span', { className: cls('c-ref-url'), title: r.url }, r.url.replace(/^https?:\/\//, ''))),
          h('button', { type: 'button', className: cls('c-ref-x'), 'aria-label': '去掉', title: '去掉', onClick: () => setRefs(rs => rs.filter(x => x.key !== r.key)) }, h(Icon, { name: 'x', size: 12 })))),
        h('span', { className: cls('faint') }, !agentOk ? '附件要用 Claude、Claude Code 或 DSH 里的模型才能看'
          : refs.some(r => r.busy) ? '正在从视频里挑关键帧…'
            : refs.some(r => r.kind === 'video') ? '视频拆成了关键帧，和消息一起发给 AI'
              : refs.some(r => r.kind === 'link') && !refs.some(r => r.kind !== 'link') ? '助手会打开链接看样子、读原文' : '会和消息一起发给 AI 参考')) : null

      const grow = el => { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(220, el.scrollHeight) + 'px' }
      useLayoutEffect(() => { grow(taRef.current) }, [draft])

      const onKey = e => {
        if (e.key === 'Escape' && run.current.busy) { e.preventDefault(); e.stopPropagation(); stop(); return }
        if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229 || e.shiftKey || e.altKey) return
        e.preventDefault()
        if (run.current.busy) inject(draft); else send(draft)
      }

      const inputArea = h('div', { className: cls('c-in') },
        focus ? h('div', { className: cls('c-focus'), title: focus }, h(Icon, { name: 'eye', size: 14 }), h('span', null, `AI 会重点看你选中的「${focus.slice(0, 22)}${focus.length > 22 ? '…' : ''}」`)) : null,
        refsRow,
        h('div', { className: cls('c-inbox') },
          h('textarea', {
            ref: taRef, className: cls('c-ta'), rows: 2, value: draft, 'aria-label': '给助手说的话',
            placeholder: live ? '想到什么直接说，它下一步就会看到' : '说说想怎么改，可以贴参考图、视频或链接',
            onChange: e => setDraft(e.target.value), onKeyDown: onKey,
            onPaste: e => { const fs = [...(e.clipboardData?.files || [])].filter(f => /^(image|video)\//.test(f.type)); if (fs.length) { e.preventDefault(); addFiles(fs) } },
          }),
          h('div', { className: cls('c-bar') },
            h(Menu, {
              icon: 'paperclip', tip: '附参考：图片、视频或网页链接', kind: 'ghost', sm: true,
              items: [
                { key: 'file', label: '图片或视频', icon: 'image', note: '视频会拆成关键帧给 AI 看', onClick: () => fileRef.current?.click() },
                { key: 'link', label: '网页链接', icon: 'link', note: '让它截图看样子、读原文', onClick: addLink },
              ],
            }),
            h('input', { ref: fileRef, type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true, onChange: e => { const fs = [...e.target.files]; e.target.value = ''; addFiles(fs) } }),
            h('span', { className: cls('faint', 'grow', 'c-kh') }, live ? '↵ 补充给它 · Esc 停下' : '↵ 发送 · ⇧↵ 换行'),
            live ? h(Btn, { kind: 'default', sm: true, icon: 'stop', busy: live.stopping, onClick: stop, tip: '停下（Esc）' }, '停下') : null,
            h(Btn, {
              kind: 'primary', sm: true, icon: 'send', label: live ? '补充给它' : '发送',
              disabled: live ? !draft.trim() : booting || (!draft.trim() && !refs.length),
              onClick: () => (live ? inject(draft) : send(draft)),
            }))))

      return h('div', {
        className: cls('c-root'), 'data-drop': drag || undefined,
        onKeyDown: e => { if (e.key === 'Escape' && run.current.busy && !e.defaultPrevented) { e.preventDefault(); stop() } },
        onDragOver: e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); setDrag(true) } },
        onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false) },
        onDrop: e => { setDrag(false); if (e.dataTransfer?.files?.length) { e.preventDefault(); addFiles(e.dataTransfer.files) } },
      }, log, inputArea)
    }

    STYLE_PARTS.push(`
.$-c-root{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%}
.$-c-log{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:14px;padding:12px 16px}
.$-c-top{display:flex;justify-content:flex-end;margin:-4px -8px -6px 0}
.$-c-me{align-self:flex-end;max-width:88%;padding:8px 12px;border-radius:var(--$-r-lg);background:var(--$-soft);font-size:14px;line-height:22px;white-space:pre-wrap;overflow-wrap:anywhere}
.$-c-inj-tag{display:flex;align-items:center;gap:4px;margin-bottom:2px;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-c-mimgs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-bottom:6px}
.$-c-mimgs img{display:block;width:56px;height:56px;object-fit:cover;border-radius:var(--$-r-sm)}
.$-c-ai{display:flex;flex-direction:column;gap:8px;min-width:0;font-size:14px;line-height:22px;overflow-wrap:anywhere}
.$-c-err{display:flex;align-items:flex-start;gap:6px;color:var(--$-danger)}
.$-c-err svg{flex:none;margin-top:3px}
.$-c-err-text{color:var(--$-danger)}
.$-c-steps summary{cursor:pointer;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-c-steps[open] summary{margin-bottom:4px}
.$-c-steps-list{display:flex;flex-direction:column;gap:2px}
.$-c-step{display:flex;align-items:flex-start;gap:6px;color:var(--$-text-2);font-size:12px;line-height:18px}
.$-c-step svg{flex:none;margin-top:3px;color:var(--$-text-3)}
.$-c-step b{margin-right:4px;font-weight:500}
.$-c-live-stat{display:flex;align-items:center;gap:6px;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-c-box{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:.5px solid var(--$-card-line);border-radius:var(--$-r-lg);background:var(--$-card);font-size:13px;line-height:20px}
.$-c-box-head{display:flex;align-items:center;gap:6px;min-width:0}
.$-c-box-head .$-faint{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-c-off{opacity:.6}
.$-c-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.$-c-sel .$-input{min-height:28px;width:auto;font-size:13px}
.$-c-dec{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:.5px solid var(--$-line)}
.$-c-dec b{font-weight:500}
.$-c-quote{padding-left:8px;border-left:2px solid var(--$-line-2);color:var(--$-text-2);font-size:12px;line-height:18px}
.$-c-ans{display:inline-flex;align-items:center;gap:4px;color:var(--$-success)}
.$-c-link-a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-c-imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px}
.$-c-imgs img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--$-r-sm)}
.$-c-memo{display:flex;align-items:flex-start;gap:6px;color:var(--$-text-2);font-size:12px;line-height:18px}
.$-c-memo>svg{flex:none;margin-top:2px;color:var(--$-text-3)}
.$-c-memo em{margin-right:4px;font-style:normal;color:var(--$-text-3)}
.$-c-chg{display:flex;align-items:center;gap:6px;color:var(--$-text-2);font-size:12px;line-height:18px}
.$-c-chg em{font-style:normal;color:var(--$-text-3)}
.$-c-empty{display:flex;flex-direction:column;gap:10px;margin:auto 0;padding:8px 0}
.$-c-empty-title{display:flex;align-items:center;gap:6px;font-size:15px}
.$-c-empty p{margin:0}
.$-c-quick{display:flex;flex-direction:column;gap:6px}
.$-c-quick button{padding:8px 10px;border:.5px solid var(--$-line-2);border-radius:var(--$-r-md);background:var(--$-card);color:var(--$-text);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.$-c-quick button:hover{background:var(--$-soft)}
.$-c-in{flex:none;display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px;border-top:.5px solid var(--$-line)}
.$-c-root[data-drop=true] .$-c-inbox{border-color:var(--$-accent);box-shadow:0 0 0 2px var(--$-accent)}
.$-c-focus{display:flex;align-items:center;gap:6px;min-width:0;color:var(--$-text-2);font-size:12px;line-height:18px}
.$-c-focus span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-c-refs{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.$-c-ref{position:relative;display:inline-flex;align-items:center;gap:4px;height:44px;border-radius:var(--$-r-sm);background:var(--$-soft)}
.$-c-ref img{display:block;width:44px;height:44px;object-fit:cover;border-radius:var(--$-r-sm)}
.$-c-ref-lab{display:inline-flex;align-items:center;gap:2px;padding-right:8px;color:var(--$-text-2);font-size:12px}
.$-c-ref-link{height:28px;max-width:220px;padding:0 10px 0 8px;color:var(--$-text-2);font-size:12px}
.$-c-ref-url{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-c-ref-x{position:absolute;top:-6px;right:-6px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:.5px solid var(--$-line-2);border-radius:50%;background:var(--$-raised);color:var(--$-text-2);cursor:pointer}
.$-c-ref-x:hover{color:var(--$-text)}
.$-c-inbox{border:.5px solid var(--$-line-2);border-radius:var(--$-r-md);background:var(--$-field)}
.$-c-inbox:focus-within{border-color:var(--$-accent)}
.$-c-ta{display:block;width:100%;min-height:44px;max-height:220px;padding:8px 10px 0;border:0;background:transparent;color:var(--$-text);font:inherit;font-size:14px;line-height:22px;resize:none;outline:none}
.$-c-ta::placeholder{color:var(--$-text-3)}
.$-c-bar{display:flex;align-items:center;gap:4px;padding:4px 6px 6px}
.$-c-kh{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`)

    // ================================================================== 3.50 选题广场、素材、AI 记忆、设置（parts/50-library.js）
    //
    // 给别段用的：PlazaPage()、AssetsPage()、AssetPicker({ project, onPick, onClose })、MemoryPage()、SettingsPage({ tab })
    // 这一段自己用的小工具和组件都以 lib / Lib / LIB_ 开头，样式类名以 l- 开头，免得和别段撞名。
    // 花钱的地方（AI 生图、付费配音试听、X 接口改上限 / 加账号 / 立即拉取）点了先 ask() 确认。

    Object.assign(ICONS, {
      'lib-globe': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
      'lib-undo': 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
      'lib-out': 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    })

    // ---- 3.50.1 小工具

    /** 信息源的四档可信度 */
    const LIB_TIER = { A: { name: '官方', tone: 'success' }, B: { name: '社区', tone: 'info' }, C: { name: '报道', tone: 'warn' }, D: { name: '转述' } }
    const LibTier = ({ tier, tip }) => h(Tag, { tone: LIB_TIER[tier]?.tone, tip }, LIB_TIER[tier]?.name ?? tier)
    const libBig = n => (n >= 1e8 ? `${(n / 1e8).toFixed(1)} 亿` : n >= 1e4 ? `${(n / 1e4).toFixed(1)} 万` : String(n))
    /** 热度写成一行字：播放 1.2 万 · 赞 300 · 评论 20 */
    const libHeat = x => (!x ? '' : [x.views && `播放 ${libBig(x.views)}`, x.points && `赞 ${x.points}`, x.comments && `评论 ${x.comments}`, x.stars && `本周 +${x.stars.toLocaleString()} 星`].filter(Boolean).join(' · '))
    const libHot = it => { const x = it.heat || {}; return (x.points || 0) + (x.comments || 0) / 2 + (x.stars || 0) / 40 + (x.likes || 0) / 20 + (x.reposts || 0) / 5 }
    const libTime = iso => (iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
    const libHash = s => { let x = 2166136261; for (const c of String(s)) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619) } return x >>> 0 }
    /** 计时：busy 时每半秒刷新一次，返回已经过去几秒。start() 在开始做事时调。 */
    function useLibTimer(on) {
      const [from, setFrom] = useState(0)
      const [now, setNow] = useState(0)
      usePoll(() => setNow(Date.now()), 500, on)
      return { secs: Math.max(0, ((now - from) / 1000) | 0), start: () => { const x = Date.now(); setFrom(x); setNow(x) } }
    }
    /** 外链按钮（新窗口打开，不把 DSH 自己的页面换掉） */
    const LibLinkBtn = ({ href, icon, sm, download, children }) => h('a', { className: cls('btn', 'btn-default', sm && 'btn-sm'), href, download, target: '_blank', rel: 'noreferrer' },
      icon ? h(Icon, { name: icon, size: sm ? 14 : 16 }) : null, h('span', { className: cls('btn-label') }, children))
    /** 一排能多选或单选的小按钮：h(LibChip, { on, onClick, count, tip }, '名字') */
    const LibChip = ({ on, onClick, count, tip, children }) => h('button', { type: 'button', className: cls('l-chip'), 'aria-pressed': Boolean(on), title: tip, onClick }, children, count != null ? h('em', null, count) : null)
    /** 一小节：小标题 + 内容 */
    const LibSec = ({ title, children }) => h('section', { className: cls('l-sec') }, h('h3', null, title), children)

    // 还没让 AI 写中文要点的条目，先按标题里的词猜个分类（AI 写完要点后用 AI 分的）
    const LIB_GUESS = [
      ['安全隐私', /secur|password|leak|breach|vulnerab|exploit|hack|privacy|malware|CVE|安全|漏洞|泄露|隐私|攻击/i],
      ['融资商业', /billion|million|revenue|valuation|IPO|funding|raise[sd]?|invest|acqui|earnings|融资|估值|营收|上市|收购|投资|财报/i],
      ['芯片硬件', /GPU|chip|semiconductor|NVIDIA|TPU|hardware|datacenter|data center|robot|humanoid|芯片|算力|显卡|半导体|数据中心|机器人|具身/i],
      ['编程开发', /coding|developer|programm|IDE|Copilot|Cursor|Codex|SDK|CLI|\bcode\b|编程|代码|开发者|程序员/i],
      ['Agent', /agent|agentic|MCP|workflow|automat|智能体|自动化|工作流/i],
      ['开源项目', /open[- ]source|open weights|GitHub|Hugging ?Face|开源|仓库/i],
      ['多模态', /image|video|photo|vision|diffusion|Sora|Midjourney|Veo|3D|voice|audio|speech|music|TTS|图像|视频|生图|多模态|语音|音频|音乐/i],
      ['研究论文', /research|paper|arXiv|benchmark|dataset|论文|研究|评测|基准|数据集/i],
      ['公司人事', /layoff|hiring|CEO|founder|resign|裁员|招聘|离职|创始人/i],
      ['政策监管', /\blaw\b|policy|regulat|government|court|lawsuit|copyright|政策|监管|法院|诉讼|版权|法案/i],
      ['产品更新', /iPhone|Android|mobile|\bapp\b|iOS|browser|手机|应用|浏览器/i],
      ['模型发布', /ChatGPT|Gemini|Claude|LLM|GPT|model|Llama|Qwen|DeepSeek|Kimi|大模型|模型/i],
    ]
    const libCat = it => it.zh?.cat || LIB_GUESS.find(([, re]) => re.test(`${it.title} ${it.summary || ''}`))?.[0] || '其他'

    /**
     * 封面：有真图用真图，没有（或者图坏了）就用一块按条目挑颜色的色块，上面压着标题。
     * 颜色只取 chart(1..9)，和底色混一下，浅色深色都看得清字。
     */
    function LibCover({ it, title, badge, hero }) {
      const [bad, setBad] = useState(false)
      const showImg = Boolean(it.img) && !bad
      const n = (libHash(it.id || it.url || it.title) % 9) + 1
      return h('div', { className: cls('l-cover', hero && 'l-cover-hero'), style: { background: `color-mix(in srgb,${chart(n)} 26%,var(--${P}-card))` } },
        showImg ? h('img', { src: it.img, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onError: () => setBad(true) }) : null,
        !showImg && title ? h('span', { className: cls('l-cover-t') }, title) : null,
        it.sourceName ? h('span', { className: cls('l-cover-src') }, String(it.sourceName).replace(/^X @/, '@')) : null,
        badge ? h('span', { className: cls('l-cover-cat') }, badge) : null)
    }

    // ================================================================== 3.50.2 选题广场

    /** 一条动态变成「新建」用的选题（和旧网页带过去的字段一样） */
    function libIdeaFromItem(it, form) {
      const bb = it.brief
      return {
        title: bb?.t || it.zh?.t || it.title, angle: bb?.angle || '', why: bb?.one || it.zh?.one || '', form,
        brief: bb ? `${(bb.points || []).map(x => `- ${x}`).join('\n')}${bb.numbers?.length ? `\n\n关键数字：\n${bb.numbers.map(x => `- ${x}`).join('\n')}` : ''}` : '',
        evidence: [{ id: it.id, title: it.title, url: it.url, tier: it.tier, sourceName: it.sourceName, discuss: it.discuss }],
      }
    }

    // 筛选条件记在这里：去别的页再回来还是原样
    const libPlazaFilter = { days: 7, tiers: ['A', 'B', 'C', 'D'], source: '', q: '', starred: false, cat: '', sort: 'score' }
    const LIB_DAYS = [{ value: '1', label: '24 小时' }, { value: '3', label: '3 天' }, { value: '7', label: '7 天' }, { value: '14', label: '14 天' }]
    const LIB_SORT = [{ value: 'score', label: '综合排序' }, { value: 'new', label: '最新' }, { value: 'hot', label: '最热' }]

    function PlazaPage() {
      const [f, setF] = useState(() => ({ ...libPlazaFilter }))
      const upd = patch => setF(x => { const y = { ...x, ...patch }; Object.assign(libPlazaFilter, y); return y })
      const [tab, setTab] = useState(() => (lsGet('plazaTab', 'feed') === 'ideas' ? 'ideas' : 'feed'))
      const feed = useData(() => wb(`/api/plaza/items?${new URLSearchParams({ days: f.days, starred: f.starred ? '1' : '' })}`), [f.days, f.starred])
      const [items, setItems] = useState([])
      const [digest, setDigest] = useState(null)
      const [refreshing, setRefreshing] = useState(false)
      const [limit, setLimit] = useState(60)
      const [openId, setOpenId] = useState(null)
      const [openRef, setOpenRef] = useState(null)
      const [reading, setReading] = useState(null)
      const [sources, setSources] = useState(false)
      const [make, setMake] = useState(null)
      const autoRefreshed = useRef(false)
      const lastKick = useRef(0)

      const refresh = async auto => {
        if (refreshing) return
        setRefreshing(true)
        try {
          const r = await wbPost('/api/plaza/refresh')
          const bad = Object.values(r.status || {}).filter(x => !x.ok && !x.off).length
          if (!auto || r.added) toast(`新增 ${r.added} 条${bad ? `，${bad} 个源这次没拉到` : ''}`)
          feed.reload()
        } catch (e) { if (!auto) notify(e.message) } finally { setRefreshing(false) }
      }
      // AI 给还没写中文要点的条目写标题、一句话、分类（在后台慢慢写，这里每 12 秒看一次进度）
      const kickDigest = async manual => {
        lastKick.current = Date.now()
        // 自动补写（打开页面时）用工作台的默认模型，和旧网页一样，免得用户临时换成贵的模型后后台一直在烧；手动点的才用现在选的
        try { const r = await wbPost('/api/plaza/digest', manual ? { provider: currentProvider() } : {}); setDigest(r); if (manual) toast(r.running ? 'AI 开始补写中文要点了' : '中文要点都写好了') } catch (e) { if (manual) notify(e.message) }
      }
      const findGaps = async () => {
        try { await wbPost('/api/plaza/gap', { provider: currentProvider() }); toast('在找海外在讲、中文圈还没人讲的，找好了会出现在「信息差」里'); feed.reload() } catch (e) { notify(e.message) }
      }

      useEffect(() => {
        const d = feed.data
        if (!d) return
        setItems(d.items ?? [])
        setDigest(d.digest ?? null)
        if (!d.digest?.running && !d.digest?.error && (d.items ?? []).some(x => !x.zh) && Date.now() - lastKick.current > 60000) kickDigest(false)
        if (!autoRefreshed.current) {
          autoRefreshed.current = true
          if (!d.updated || Date.now() - Date.parse(d.updated) > 3 * 3600000) refresh(true)
        }
      }, [feed.data])
      useEffect(() => setLimit(60), [f.cat, f.q, f.sort, f.source, f.tiers.join(), f.days, f.starred])
      const gap = feed.data?.gap
      usePoll(async () => {
        const d = await wb('/api/plaza/digest').catch(() => null)
        if (d) setDigest(d)
        feed.reload()
      }, 12000, Boolean(digest?.running || gap?.running))

      const patchItem = (id, patch) => {
        setItems(list => list.map(x => (x.id === id ? { ...x, ...patch } : x)))
        setOpenRef(r => (r && r.id === id ? { ...r, ...patch } : r))
      }
      const toggleStar = async it => {
        const on = !it.starred
        patchItem(it.id, { starred: on })
        try { await wbPost('/api/plaza/star', { id: it.id, on }) } catch (e) { patchItem(it.id, { starred: !on }); notify(e.message) }
      }
      const openItem = (id, ref) => { setOpenId(id); setOpenRef(ref ? { ...ref } : null) }

      // ---- 筛选
      const all = items
      const base = all.filter(it => f.tiers.includes(it.tier) && (!f.source || it.source === f.source))
      const cnt = {}
      for (const it of base) { const c = libCat(it); cnt[c] = (cnt[c] || 0) + 1 }
      const nGap = base.filter(it => it.gap).length
      const nVid = base.filter(it => it.video).length
      const cats = (feed.data?.cats ?? []).filter(c => cnt[c])
      const cat = f.cat === '#gap' ? (nGap ? f.cat : '') : f.cat === '#video' ? (nVid ? f.cat : '') : cnt[f.cat] ? f.cat : ''
      const kw = f.q.trim().toLowerCase()
      let shown = base.filter(it => (!cat || (cat === '#gap' ? it.gap : cat === '#video' ? it.video : libCat(it) === cat))
        && (!kw || `${it.title} ${it.summary || ''} ${it.zh?.t || ''} ${it.zh?.one || ''}`.toLowerCase().includes(kw)))
      if (f.sort === 'new') shown = [...shown].sort((a, b) => Date.parse(b.time || b.firstSeen) - Date.parse(a.time || a.firstSeen))
      if (f.sort === 'hot') shown = [...shown].sort((a, b) => libHot(b) - libHot(a))
      const srcList = (feed.data?.sources ?? []).filter(s => all.some(x => x.source === s.id))

      const openIdx = shown.findIndex(x => x.id === openId)
      const openIt = openId ? all.find(x => x.id === openId) ?? (openRef && { firstSeen: new Date().toISOString(), ...openRef, id: openId }) : null
      const nav = d => { const nx = openIdx < 0 ? null : shown[openIdx + d]; if (nx) openItem(nx.id) }

      // ---- 页头的小字：什么时候更新的、AI 在做什么
      const upd8 = feed.data?.updated
      const status = [
        upd8 ? `更新于 ${ago(upd8)}` : feed.data ? '还没抓过' : '',
        digest?.running ? `AI 在写中文要点 ${digest.done}/${digest.total}` : digest?.error && digest.done < digest.total ? '中文要点没写完' : '',
        gap?.running ? '正在找信息差' : '',
      ].filter(Boolean).join(' · ')

      const feedView = h(Fragment, null,
        h('div', { className: cls('l-chips') },
          h(LibChip, { on: !cat, count: base.length, onClick: () => upd({ cat: '' }) }, '全部'),
          nGap ? h(LibChip, { on: cat === '#gap', count: nGap, tip: '海外在讲、中文来源里近两周没人提的', onClick: () => upd({ cat: '#gap' }) }, h(Icon, { name: 'lib-globe', size: 14 }), '信息差') : null,
          nVid ? h(LibChip, { on: cat === '#video', count: nVid, tip: 'YouTube、B 站上和 AI 有关的视频，看什么题目有人看', onClick: () => upd({ cat: '#video' }) }, h(Icon, { name: 'film', size: 14 }), '视频') : null,
          cats.map(c => h(LibChip, { key: c, on: cat === c, count: cnt[c], onClick: () => upd({ cat: c }) }, c))),
        h('div', { className: cls('l-filters') },
          h(SearchBox, { value: f.q, onChange: v => upd({ q: v }), placeholder: '搜标题、要点', width: 220 }),
          h(Seg, { value: String(f.days), onChange: v => upd({ days: +v }), options: LIB_DAYS, label: '时间范围' }),
          h(Select, { value: f.sort, onChange: v => upd({ sort: v }), options: LIB_SORT, 'aria-label': '排序' }),
          h(Select, { value: f.source, onChange: v => upd({ source: v }), 'aria-label': '来源', options: [{ value: '', label: '全部来源' }, ...srcList.map(s => ({ value: s.id, label: `${s.name}（${all.filter(x => x.source === s.id).length}）` }))] }),
          h('div', { className: cls('l-chips'), role: 'group', 'aria-label': '可信度' }, ['A', 'B', 'C', 'D'].map(tier => h(LibChip, {
            key: tier, on: f.tiers.includes(tier), count: all.filter(x => x.tier === tier).length, tip: feed.data?.tiers?.[tier]?.name,
            onClick: () => { const next = f.tiers.includes(tier) ? f.tiers.filter(x => x !== tier) : [...f.tiers, tier]; upd({ tiers: next.length ? next : [tier] }) },
          }, LIB_TIER[tier].name))),
          h(LibChip, { on: f.starred, onClick: () => upd({ starred: !f.starred }), tip: '只看收藏的' }, h(Icon, { name: 'star', size: 14 }), '收藏')),
        !feed.data ? (feed.error ? h(ErrorBox, { error: feed.error, onRetry: feed.reload }) : h(Loading))
          : shown.length ? h(Fragment, null,
            h(Grid, { min: 240 }, shown.slice(0, limit).map(it => h(LibPzCard, { key: it.id, it, current: it.id === openId, onOpen: openItem, onStar: toggleStar }))),
            shown.length > limit ? h('div', { className: cls('l-more') }, h(Btn, { onClick: () => setLimit(n => n + 60) }, `再看 60 条（还有 ${shown.length - limit} 条）`)) : null)
            : h(Empty, upd8 ? { title: '这个范围里没有动态', body: '换个分类或筛选试试' }
              : { title: '还没有动态', body: '点右上角「刷新信息源」，大约 20 秒', action: h(Btn, { kind: 'primary', icon: 'refresh', busy: refreshing, onClick: () => refresh(false) }, '刷新信息源') }))

      return h(Page, {
        title: '选题广场', width: 1280,
        sub: h(Fragment, null, digest?.running || gap?.running ? h(Spin, { sm: true }) : null, digest?.running || gap?.running ? ' ' : null, status || '各信息源最近的 AI 动态，按可信度和热度排'),
        actions: [
          h(Btn, { key: 'r', icon: 'refresh', busy: refreshing, onClick: () => refresh(false) }, refreshing ? '抓取中…' : '刷新信息源'),
          h(Menu, { key: 'm', icon: 'more', tip: '更多', align: 'right', items: [
            { key: 'src', label: '信息源和 X 接口', icon: 'settings', onClick: () => setSources(true) },
            { key: 'gap', label: '重新找信息差', icon: 'lib-globe', note: '看看哪些海外在讲、中文圈还没人讲', disabled: gap?.running, onClick: findGaps },
            { key: 'dg', label: '补写中文要点', icon: 'spark', note: '没写完或出错时点这里接着写', disabled: digest?.running, onClick: () => kickDigest(true) },
          ] }),
        ],
      },
      h(Tabs, { value: tab, onChange: v => { setTab(v); lsSet('plazaTab', v) }, options: [{ value: 'feed', label: `最新动态${all.length ? ` ${all.length}` : ''}` }, { value: 'ideas', label: 'AI 选题' }] }),
      // 两块都一直挂着：AI 挑选题要一分钟，切过去看动态不会把它打断
      h('div', { hidden: tab !== 'feed' }, h('div', { className: cls('stack') }, feedView)),
      h('div', { hidden: tab !== 'ideas' }, h(LibIdeas, { days: f.days, onOpen: openItem, onMake: (type, idea) => setMake({ type, idea }) })),
      openIt ? h(LibPzDetail, {
        key: openIt.id, it: openIt, index: openIdx, total: shown.length, onNav: nav, onClose: () => { setOpenId(null); setOpenRef(null) },
        onStar: toggleStar, onBrief: (id, r) => patchItem(id, { brief: r, zh: { ...(all.find(x => x.id === id)?.zh || {}), ...(r.t ? { t: r.t } : {}), ...(r.one ? { one: r.one } : {}) } }),
        onRead: setReading, onMake: type => setMake({ type, idea: libIdeaFromItem(openIt, type) }),
      }) : null,
      reading ? h(LibReadModal, { it: reading, onClose: () => setReading(null) }) : null,
      sources ? h(LibSourcesModal, { data: feed.data, onClose: () => setSources(false), onPulled: feed.reload }) : null,
      make ? h(NewProjectModal, { type: make.type, idea: make.idea, onClose: () => setMake(null) }) : null)
    }

    /** 选题广场的一张卡 */
    function LibPzCard({ it, current, onOpen, onStar }) {
      const title = it.zh?.t || it.title
      const one = it.zh?.one || it.summary || ''
      return h('div', {
        className: cls('l-pz'), role: 'button', tabIndex: 0, 'aria-current': current || undefined, onClick: () => onOpen(it.id),
        onKeyDown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(it.id) },
      },
      h(LibCover, { it, title, badge: libCat(it) }),
      h('div', { className: cls('l-pz-body') },
        h('div', { className: cls('l-meta') }, h(LibTier, { tier: it.tier }), h('span', null, it.sourceName), h('span', null, ago(it.time || it.firstSeen))),
        h('div', { className: cls('l-pz-title', 'clamp2') }, title),
        one ? h('div', { className: cls('muted', 'clamp2') }, one) : null,
        it.gap ? h('div', { className: cls('l-gap') }, h(Icon, { name: 'lib-globe', size: 14 }), h('span', null, `中文圈还没人讲${it.gapWhy ? `：${it.gapWhy}` : ''}`)) : null,
        h('div', { className: cls('l-meta', 'l-pz-foot') },
          it.heat ? h('span', null, libHeat(it.heat)) : null,
          it.brief ? h(Tag, { tone: 'success' }, '已整理') : null,
          h('span', { className: cls('grow') }),
          h('span', { className: cls('l-star'), 'data-on': Boolean(it.starred), onClick: e => e.stopPropagation(), onKeyDown: e => e.stopPropagation() },
            h(Btn, { kind: 'ghost', sm: true, icon: 'star', label: it.starred ? '取消收藏' : '收藏', onClick: () => onStar(it) })))))
    }

    /** 点开一条：右边滑出详情。没整理过的先让 AI 读原文写要点（约 20 秒）；← → 换上一条下一条 */
    function LibPzDetail({ it, index, total, onNav, onClose, onStar, onBrief, onRead, onMake }) {
      const [loadingBrief, setLoadingBrief] = useState(false)
      const [err, setErr] = useState(null)
      const navRef = useRef(onNav)
      navRef.current = onNav
      const getBrief = async force => {
        setErr(null); setLoadingBrief(true)
        try { const r = await wbPost('/api/plaza/brief', { id: it.id, provider: currentProvider(), force }); onBrief(it.id, r) } catch (e) { setErr(e) } finally { setLoadingBrief(false) }
      }
      // 换条目时整个组件会换掉（外面用 id 做 key），所以这里只在第一次打开时取
      useEffect(() => { if (!it.brief) getBrief(false) }, [])
      useEffect(() => {
        const onKey = e => {
          if (e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return
          if (e.key === 'ArrowRight') navRef.current(1)
          if (e.key === 'ArrowLeft') navRef.current(-1)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [])
      const b = it.brief
      const title = b?.t || it.zh?.t || it.title
      const one = b?.one || it.zh?.one
      const errText = err && (/not found|404/i.test(err.message) ? '工作台服务还没更新到新版，暂时整理不了要点。重启工作台后就能用。' : err.message)
      const head = h('div', { className: cls('l-dhead') },
        h(LibTier, { tier: it.tier }), h('span', { className: cls('muted') }, it.sourceName),
        h('span', { className: cls('faint') }, it.time ? ago(it.time) : `首次发现 ${ago(it.firstSeen)}`),
        h('span', { className: cls('grow') }),
        index >= 0 ? h(Fragment, null,
          h(Btn, { kind: 'ghost', sm: true, icon: 'left', label: '上一条（←）', disabled: index <= 0, onClick: () => onNav(-1) }),
          h('span', { className: cls('faint') }, `${index + 1}/${total}`),
          h(Btn, { kind: 'ghost', sm: true, icon: 'right', label: '下一条（→）', disabled: index >= total - 1, onClick: () => onNav(1) })) : null)
      return h(Drawer, { title: '选题详情', head, onClose, width: 520 },
        h(LibCover, { it, title, badge: libCat(it), hero: true }),
        h('div', { className: cls('stack') },
          h('h2', { className: cls('l-dtitle') }, title),
          title !== it.title ? h('a', { className: cls('l-link', 'faint'), href: it.url, target: '_blank', rel: 'noreferrer' }, it.title) : null,
          it.heat || (it.discuss && it.discuss !== it.url) ? h('div', { className: cls('l-meta') },
            it.heat ? h('span', null, libHeat(it.heat)) : null,
            it.discuss && it.discuss !== it.url ? h('a', { className: cls('l-link'), href: it.discuss, target: '_blank', rel: 'noreferrer' }, '看讨论') : null) : null,
          one ? h('div', { className: cls('l-one') }, one) : null,
          it.gap ? h(Alert, null, `中文圈还没人讲${it.gapWhy ? `：${it.gapWhy}` : ''}`) : null,
          h(Row, null,
            h(LibLinkBtn, { href: it.url, icon: 'lib-out', sm: true }, '打开原网页'),
            h(Btn, { sm: true, icon: 'file', onClick: () => onRead(it) }, '读原文全文'),
            h('span', { className: cls('l-star'), 'data-on': Boolean(it.starred) }, h(Btn, { sm: true, icon: 'star', onClick: () => onStar(it) }, it.starred ? '已收藏' : '收藏')))),
        b ? h(Fragment, null,
          h(LibSec, { title: '这篇讲了什么' }, h('ul', null, (b.points || []).map((x, i) => h('li', { key: i }, x)))),
          b.numbers?.length ? h(LibSec, { title: '关键数字' }, h(Row, null, b.numbers.map((x, i) => h(Tag, { key: i }, x)))) : null,
          b.angle ? h(LibSec, { title: '可以怎么写' }, h('p', null, b.angle), b.who ? h('p', { className: cls('muted') }, `谁最该关心：${b.who}`) : null) : null,
          h(Row, null, h('span', { className: cls('faint') }, `${b.via || ''}读到原文后整理 · ${libTime(b.at)}`), h(Btn, { kind: 'ghost', sm: true, icon: 'refresh', busy: loadingBrief, onClick: () => getBrief(true) }, '重新整理')))
          : h(Fragment, null,
            loadingBrief ? h(Alert, null, h(Spin, { sm: true }), ' AI 正在读原文、整理要点，大约 20 秒') : null,
            errText ? h(Alert, { tone: 'danger', action: h(Btn, { sm: true, onClick: () => getBrief(false) }, '重试') }, errText) : null,
            it.summary ? h(LibSec, { title: '原文摘要' }, h('p', { className: cls('muted') }, it.summary)) : null),
        h('div', { className: cls('l-make') },
          h('span', { className: cls('muted') }, '用它来做'),
          h(Row, null,
            h(Btn, { kind: 'primary', icon: 'file', onClick: () => onMake('article') }, '写成文章'),
            h(Btn, { icon: 'image', onClick: () => onMake('card') }, '做成卡片'),
            h(Btn, { icon: 'film', onClick: () => onMake('script') }, '写口播稿'))))
    }

    /** 读原文全文（工作台去抓正文） */
    function LibReadModal({ it, onClose }) {
      const doc = useData(() => wbPost('/api/plaza/read', { url: it.url }), [it.url])
      return h(Modal, { title: it.title, onClose, width: 720, footer: [h(LibLinkBtn, { key: 'o', href: it.url, icon: 'lib-out' }, '打开原网页'), h(Btn, { key: 'c', kind: 'primary', onClick: onClose }, '关闭')] },
        h(Row, null, h(LibTier, { tier: it.tier }), h('span', { className: cls('faint') }, it.sourceName)),
        doc.loading ? h(Loading, { text: '正在抓正文…' })
          : doc.error ? h(Alert, { tone: 'danger' }, `${doc.error.message}。可以点下面「打开原网页」看。`)
            : h('div', { className: cls('l-read') }, String(doc.data?.content || '').split('\n\n').filter(Boolean).map((x, i) => h('p', { key: i }, x))))
    }

    /** 信息源和分级（下面带 X 接口设置） */
    const LIB_TIER_DESC = { A: '公司官方博客、发布、开源仓库、官方 X 账号', B: '开发者和产品方自己发的，带热度数据', C: '有采访和评测的科技媒体', D: '转述、搬运、快讯' }
    function LibSourcesModal({ data, onClose, onPulled }) {
      const d = data ?? { sources: [], status: {}, tiers: {} }
      const stText = st => (!st ? '—' : st.off ? '未接入' : !st.ok ? '没拉到' : `${st.n} 条`)
      return h(Modal, { title: '信息源和分级', onClose, width: 760, footer: [h(Btn, { key: 'ok', kind: 'primary', onClick: onClose }, '好')] },
        h('p', { className: cls('muted', 'l-p') }, '按可信度分四档。AI 挑选题时，每个选题至少要有一条「官方」或「社区」一手证据；「转述」只当热度参考。'),
        ['A', 'B', 'C', 'D'].map(tier => h('div', { key: tier, className: cls('stack') },
          h(Row, null, h(LibTier, { tier }), h('b', null, d.tiers?.[tier]?.name || ''), h('span', { className: cls('faint') }, LIB_TIER_DESC[tier])),
          h('div', { className: cls('l-srcs') }, d.sources.filter(s => s.tier === tier).map(s => {
            const st = d.status?.[s.id]
            return h('span', { key: s.id, className: cls('l-src'), 'data-state': st?.off ? 'off' : st && !st.ok ? 'bad' : undefined, title: st?.error || undefined }, s.name, h('em', null, stText(st)))
          })))),
        h(Card, { title: 'X（推特）' }, h(LibXSettings, { onPulled })))
    }

    /**
     * X 接口设置（选题广场的信息源弹窗和设置页共用）。密钥只收不回，页面上只显示头尾。
     * X 按读到的帖子数收费：提高上限、缩短间隔、加账号、立即拉取之前都先问一句。
     */
    function LibXSettings({ onPulled }) {
      const [xc, setXc] = useState(null)
      const [err, setErr] = useState(null)
      const [form, setForm] = useState(null)
      const [busy, setBusy] = useState('')
      const take = c => {
        setXc(c)
        setForm({ token: '', accounts: (c.accounts || []).map(a => a.u + (a.official ? '*' : '')).join('\n'), max: String(c.max ?? ''), everyHours: String(c.everyHours ?? ''), budget: String(c.budget ?? '') })
      }
      const load = () => { setErr(null); wb('/api/plaza/x').then(take, setErr) }
      useEffect(load, [])
      if (err) return h(ErrorBox, { error: err, onRetry: load })
      if (!xc || !form) return h(Loading)
      const set = k => v => setForm(x => ({ ...x, [k]: v }))
      const collect = () => ({ token: form.token.trim(), accounts: form.accounts.split('\n').map(s => s.trim()).filter(Boolean), max: +form.max, everyHours: +form.everyHours, budget: +form.budget })
      // 这次改动里会让花费变多的地方
      const costLines = v => {
        const old = new Set((xc.accounts || []).map(a => a.u.toLowerCase()))
        const added = v.accounts.map(s => s.replace(/^@/, '').replace(/\*$/, '').trim()).filter(u => u && !old.has(u.toLowerCase()))
        const lines = []
        if (v.budget > xc.budget) lines.push(`每月上限从 ${xc.budget} 美元提到 ${v.budget} 美元`)
        if (v.max > xc.max) lines.push(`每次最多读从 ${xc.max} 条提到 ${v.max} 条`)
        if (v.everyHours < xc.everyHours) lines.push(`两次拉取的间隔从 ${xc.everyHours} 小时缩到 ${v.everyHours} 小时`)
        if (added.length) lines.push(`新加 ${added.length} 个账号：${added.slice(0, 5).join('、')}${added.length > 5 ? ' 等' : ''}`)
        return lines
      }
      const bullet = lines => lines.map(s => `· ${s}`).join('\n')
      const save = async () => {
        const v = collect()
        const lines = costLines(v)
        if (lines.length && !(await ask({ title: '这样改会多花钱', text: `X 按读到的帖子数收费（每条约 ${xc.price} 美元）。这次改动：\n${bullet(lines)}\n\n确定保存吗？`, ok: '保存' }))) return
        setBusy('save')
        try { const c = await wbPost('/api/plaza/x', v); take(c); toast(c.configured ? '已保存 X 设置' : '已保存账号，还差密钥') } catch (e) { notify(e.message) } finally { setBusy('') }
      }
      const pull = async () => {
        const v = collect()
        const lines = costLines(v)
        const text = `马上去 X 读最多 10 条新帖（不管间隔时间），约 ${(10 * xc.price).toFixed(2)} 美元，算在本月上限里。${lines.length ? `\n\n会先保存这些改动：\n${bullet(lines)}` : ''}`
        if (!(await ask({ title: '现在试拉 10 条？', text, ok: '拉取' }))) return
        setBusy('pull')
        try {
          if (v.token || v.accounts.length) take(await wbPost('/api/plaza/x', v))
          const r = await wbPost('/api/plaza/xpull', { test: true })
          if (r.config) take(r.config)
          if (r.status?.ok) { toast(`X 拉到 ${r.status.n} 条，新增 ${r.added} 条`); onPulled?.() } else notify(r.status?.error || '没拉到')
        } catch (e) { notify(e.message) } finally { setBusy('') }
      }
      const numField = (label, k, attrs) => h(Field, { label }, h(Input, { type: 'number', value: form[k], onChange: set(k), ...attrs }))
      return h('div', { className: cls('stack') },
        h(Row, null,
          h(Tag, { tone: xc.configured ? 'success' : undefined }, xc.configured ? '已接入' : '还没接入'),
          xc.configured ? h('span', { className: cls('faint') }, `密钥 ${xc.token}${xc.fromEnv ? '（来自环境变量）' : ''}${xc.lastPull ? ` · 上次拉取 ${libTime(xc.lastPull)}（${xc.lastCount} 条）` : ' · 还没拉过'}`) : null),
        h(Field, { label: 'Bearer Token', hint: '在 X 开发者后台（developer.x.com）的应用里复制。保存后这里不再显示原文。' },
          h(Input, { type: 'password', autoComplete: 'off', value: form.token, onChange: set('token'), placeholder: xc.configured ? '已保存。要换就粘贴新的' : '粘贴 Bearer Token' })),
        h(Field, { label: '关注的账号', hint: '每行一个。后面加 * 表示官方账号（算「官方一手」），其余算「社区一手」' }, h(Textarea, { rows: 6, value: form.accounts, onChange: set('accounts') })),
        h(Grid, { cols: 3 },
          numField('每次最多读（条）', 'max', { min: 10, max: 500 }),
          numField('两次至少隔（小时）', 'everyHours', { min: 0, step: 0.5 }),
          numField('每月最多花（美元）', 'budget', { min: 0, max: 500, step: 1 })),
        h(Alert, null, `本月已读 ${xc.monthReads} 条，约 ${xc.monthCost} 美元；到上限还能读 ${xc.readsLeft} 条。按每条约 ${xc.price} 美元估算，实际以 X 后台账单为准。`),
        h('p', { className: cls('faint', 'l-p') }, '选题广场只拉上次之后的新帖，不拉转发和回复，没到间隔时间点「刷新」也不会去拉。AI 查资料时也会在 X 上搜讨论、读帖子全文，都算在这个月的上限里，到了上限就停。'),
        h(Row, null,
          h(Btn, { kind: 'primary', busy: busy === 'save', disabled: Boolean(busy), onClick: save }, '保存 X 设置'),
          h(Btn, { icon: 'refresh', busy: busy === 'pull', disabled: Boolean(busy) || (!xc.configured && !form.token.trim()), tip: !xc.configured && !form.token.trim() ? '先填密钥' : undefined, onClick: pull }, '试拉 10 条')))
    }

    // ---- AI 选题：适合发文章 / 适合做视频 / 适合发短评 / 适合写的项目
    const LIB_GROUPS = [['items', '适合发文章'], ['videos', '适合做视频'], ['takes', '适合发短评'], ['projects', '适合写的项目']]
    function LibIdeas({ days, onOpen, onMake }) {
      const [ideas, setIdeas] = useState(null)
      const [dir, setDir] = useState('')
      const [grp, setGrp] = useState(() => { const g = lsGet('plazaGroup', 'items'); return LIB_GROUPS.some(x => x[0] === g) ? g : 'items' })
      const [busy, setBusy] = useState(false)
      const [deep, setDeep] = useState(-1)
      const timer = useLibTimer(busy || deep >= 0)
      useEffect(() => { wb('/api/plaza/ideas').then(d => setIdeas(d?.t ? d : null), () => {}) }, [])
      const pick = async () => {
        if (busy) return
        setBusy(true); timer.start()
        try { setIdeas(await wbPost('/api/plaza/ideas', { direction: dir.trim(), days: Math.max(days, 3), provider: currentProvider() })) } catch (e) { notify(e.message) } finally { setBusy(false) }
      }
      const deepen = async i => {
        setDeep(i); timer.start()
        try {
          const r = await wbPost('/api/plaza/deepen', { idea: ideas.items[i], provider: currentProvider() })
          setIdeas(d => ({ ...d, items: d.items.map((y, j) => (j === i ? { ...y, brief: r.brief } : y)) }))
        } catch (e) { notify(e.message) } finally { setDeep(-1) }
      }
      const setTake = (i, v) => setIdeas(d => ({ ...d, takes: d.takes.map((y, j) => (j === i ? { ...y, take: v } : y)) }))
      const n = k => ideas?.[k]?.length || 0
      const list = ideas?.[grp] ?? []
      const srcChips = ev => {
        const by = {}
        for (const e of ev || []) { const k = `${e.tier}|${e.sourceName}`; by[k] = (by[k] || 0) + 1 }
        return h(Row, null, Object.entries(by).map(([k, c]) => { const [tier, name] = k.split('|'); return h('span', { key: k, className: cls('l-src') }, h(LibTier, { tier }), name, c > 1 ? h('em', null, `×${c}`) : null) }))
      }
      const evList = (ev, video) => h('div', null, (ev || []).map(e => h('button', { key: e.id, type: 'button', className: cls('l-ev'), onClick: () => onOpen(e.id, e) },
        h(LibTier, { tier: e.tier }), h('span', null, e.sourceName), h('em', null, video && e.video ? `▶ ${e.views ? `${libBig(e.views)} ` : ''}${e.title}` : e.title))))
      const cardTitle = (i, text, extra) => h(Fragment, null, `${i + 1}. ${text}`, extra ? ' ' : null, extra)
      const views = {
        items: (x, i) => h(Card, { key: i, title: cardTitle(i, x.title) },
          h('div', null, x.angle),
          srcChips(x.evidence),
          h('details', { className: cls('l-det') }, h('summary', null, `为什么现在写 · ${x.evidence?.length || 0} 条依据`),
            x.why ? h('p', { className: cls('l-p') }, x.why) : null, x.hook ? h('p', { className: cls('muted', 'l-p') }, `开头可以用：${x.hook}`) : null, evList(x.evidence)),
          x.brief ? h('details', { className: cls('l-det') }, h('summary', null, '写作简报'), h(Md, { text: x.brief })) : null,
          h('div', { className: cls('l-foot') },
            h(Btn, { sm: true, icon: x.brief ? 'refresh' : 'search', busy: deep === i, disabled: deep >= 0 && deep !== i, onClick: () => deepen(i) }, deep === i ? `读原文、整理中 ${timer.secs} 秒` : x.brief ? '重新深挖' : '深挖简报'),
            h('span', { className: cls('grow') }),
            h(Btn, { kind: 'primary', sm: true, icon: 'file', onClick: () => onMake('article', x) }, '写成文章'))),
        videos: (x, i) => h(Card, { key: i, title: cardTitle(i, x.title, x.gap ? h(Tag, { tone: 'info' }, '信息差') : null) },
          h('div', null, x.angle),
          x.hook ? h('div', { className: cls('muted') }, `开头：${x.hook}`) : null,
          h('details', { className: cls('l-det'), open: true }, h('summary', null, `为什么现在做 · ${x.evidence?.length || 0} 条依据`),
            x.why ? h('p', { className: cls('l-p') }, x.why) : null, evList(x.evidence, true)),
          h('div', { className: cls('l-foot') }, h('span', { className: cls('faint') }, '适合做科普短视频'), h('span', { className: cls('grow') }),
            h(Btn, { kind: 'primary', sm: true, icon: 'film', onClick: () => onMake('script', x) }, '写口播稿'))),
        takes: (x, i) => h(Card, { key: i },
          h('button', { type: 'button', className: cls('l-ev'), onClick: () => onOpen(x.item.id, x.item) },
            x.tag ? h(Tag, { tone: 'info' }, x.tag) : null, h(LibTier, { tier: x.item.tier }), h('em', null, x.item.title), h(Icon, { name: 'right', size: 14 })),
          h(Textarea, { value: x.take, onChange: v => setTake(i, v), rows: 4, 'aria-label': '短评' }),
          h('div', { className: cls('l-foot') }, h('span', { className: cls('faint') }, `${(x.take || '').length} 字 · 可以直接改`), h('span', { className: cls('grow') }),
            h(Btn, { sm: true, icon: 'copy', onClick: () => copyText(x.take, '已复制，可以直接去发') }, '复制'))),
        projects: (x, i) => h(Card, { key: i },
          h('button', { type: 'button', className: cls('l-proj'), onClick: () => onOpen(x.item.id, x.item) },
            h('div', { className: cls('l-proj-th') }, h(LibCover, { it: x.item })),
            h('div', { className: cls('l-col') }, h('b', null, x.name), h('span', { className: cls('muted') }, x.what))),
          x.why ? h('div', null, x.why) : null,
          h('div', { className: cls('l-foot') },
            h('span', { className: cls('faint') }, x.form === 'card' ? '适合做小红书卡片' : '适合写公众号拆解'),
            x.heat ? h('span', { className: cls('faint') }, libHeat(x.heat)) : null,
            h('span', { className: cls('grow') }),
            h(Btn, { kind: 'primary', sm: true, icon: 'plus', onClick: () => onMake(x.form === 'card' ? 'card' : 'article', { title: `${x.name}：${x.what}`, angle: x.why, why: x.what, form: x.form, evidence: [x.item] }) }, '用它新建'))),
      }
      return h('div', { className: cls('stack') },
        h('div', { className: cls('l-filters') },
          h('div', { className: cls('grow') }, h(Input, { value: dir, onChange: setDir, placeholder: '关注什么方向？可不填，比如 Agent 收费', onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) pick() } })),
          h(Btn, { kind: 'primary', icon: 'spark', busy, onClick: pick }, busy ? `挑选中 ${timer.secs} 秒（约 1 分钟）` : '挑选题')),
        ideas ? h(Row, null,
          h(Seg, { value: grp, onChange: g => { setGrp(g); lsSet('plazaGroup', g) }, options: LIB_GROUPS.map(([k, name]) => ({ value: k, label: n(k) ? `${name} ${n(k)}` : name })), label: '选题类型' }),
          h('span', { className: cls('faint') }, `${libTime(ideas.t)}${ideas.direction ? ` · ${ideas.direction}` : ''}`)) : null,
        list.length ? h(Grid, { min: 340 }, list.map((x, i) => views[grp](x, i)))
          : ideas && grp !== 'items' ? h(Empty, { title: '上次挑选题时还没有这一类', body: '点上面的「挑选题」重新挑一次，文章、视频、短评、项目四类会一起出来。' })
            : h(Empty, { title: '让 AI 从最近的动态里挑选题', body: 'AI 会读最近几天的动态，一次挑出四类：适合写成公众号长文的、适合做成科普短视频的、适合发一条短评的（附写好的短评）、值得拆解的产品和开源项目。每条都挂着出处。', action: busy ? null : h(Btn, { kind: 'primary', icon: 'spark', onClick: pick }, '现在挑') }))
    }

    // ================================================================== 3.50.3 素材

    const LIB_KIND = { generated: 'AI 生成', web: '网上存的', project: '文章里的' }
    const LIB_SIZES = [{ value: 'landscape', label: '横图' }, { value: 'square', label: '方图' }, { value: 'portrait', label: '竖图' }]
    const libAssetFilter = { kind: '', project: '', q: '' }
    /** 项目列表（几处下拉要用）：没拿过就去拿一次 */
    function useLibProjects() {
      const list = useStore(projectsStore)
      useEffect(() => { if (!projectsStore.get()) projects.reload().catch(() => {}) }, [])
      return list ?? []
    }

    function AssetsPage() {
      const [f, setF] = useState(() => ({ ...libAssetFilter }))
      const upd = patch => setF(x => { const y = { ...x, ...patch }; Object.assign(libAssetFilter, y); return y })
      const [q, setQ] = useState(f.q)
      // 搜索框停手 0.3 秒再去搜
      useEffect(() => { const tm = setTimeout(() => { if (q.trim() !== f.q) upd({ q: q.trim() }) }, 300); return () => clearTimeout(tm) }, [q])
      const list = useData(() => wb(`/api/assets?kind=${enc(f.kind)}&project=${enc(f.project)}&q=${enc(f.q)}`), [f.kind, f.project, f.q])
      const all = useLibProjects()
      const arts = all.filter(p => p.type === 'article')
      const [open, setOpen] = useState(null)
      const [saving, setSaving] = useState(false)
      const items = list.data ?? []
      return h(Page, {
        title: '素材', width: 1280, sub: list.data ? `${items.length} 张图：AI 生成的、网上存下来的、各篇文章里的` : 'AI 生成的、网上存下来的、各篇文章里的图',
        actions: [
          h(Btn, { key: 'u', icon: 'link', onClick: () => setSaving(true) }, '从网址存图'),
          h(Btn, { key: 's', icon: 'settings', onClick: () => go('settings', { tab: 'images' }) }, '生图设置'),
        ],
      },
      h(LibGenBox, { arts, onDone: () => { upd({ kind: '' }); list.reload() } }),
      h('div', { className: cls('l-filters') },
        h(Seg, { value: f.kind, onChange: v => upd({ kind: v }), options: [{ value: '', label: '全部' }, ...Object.entries(LIB_KIND).map(([value, label]) => ({ value, label }))], label: '来源' }),
        h(Select, { value: f.project, onChange: v => upd({ project: v }), 'aria-label': '哪篇的', options: [{ value: '', label: '全部作品' }, ...all.map(p => ({ value: p.id, label: String(p.title || p.id).slice(0, 24) }))] }),
        h('span', { className: cls('grow') }),
        h(SearchBox, { value: q, onChange: setQ, onEnter: v => upd({ q: v.trim() }), placeholder: '搜标题、画面描述、来源', width: 260 })),
      !list.data ? (list.error ? h(ErrorBox, { error: list.error, onRetry: list.reload }) : h(Loading))
        : items.length ? h(Thumbs, { min: 180 }, items.map(a => h(Thumb, { key: a.id, src: fileUrl(a.url), name: a.title || a.file, meta: a.projectTitle || '', badge: LIB_KIND[a.kind], onClick: () => setOpen(a) })))
          : h(Empty, f.kind || f.project || f.q ? { title: '没有符合条件的图', body: '换个筛选试试' } : { title: '还没有素材', body: '在上面描述画面生成一张，或者在写作页让 AI 助手去官网找图' }),
      open ? h(LibAssetModal, { asset: open, all, onClose: () => setOpen(null), onChanged: list.reload }) : null,
      saving ? h(LibSaveUrlModal, { all, onClose: () => setSaving(false), onDone: list.reload }) : null)
    }

    /** AI 生图：描述画面 → 生成。按张收费，点之前先问。 */
    function LibGenBox({ arts, onDone }) {
      const [prompt, setPrompt] = useState('')
      const [size, setSize] = useState('landscape')
      const [count, setCount] = useState('1')
      const [proj, setProj] = useState('')
      const [busy, setBusy] = useState(false)
      const timer = useLibTimer(busy)
      const run = async () => {
        const text = prompt.trim()
        if (!text) { notify('先描述一下想要的画面', { tone: 'warn' }); return }
        const n = +count
        if (!(await ask({ title: `生成 ${n} 张图？`, text: `生图按张收费，费用由你配的生图服务商收（「设置 → 生图」里标默认的那家）。这次生成 ${n} 张。`, ok: '生成' }))) return
        setBusy(true); timer.start()
        try { const r = await wbPost('/api/assets/generate', { prompt: text, size, n, project: proj }); toast(`生成好了 ${r.length} 张`); onDone() } catch (e) {
          notify(e.message, /还没配|没配好/.test(e.message) ? { action: { label: '去生图设置', onClick: () => go('settings', { tab: 'images' }) } } : undefined)
        } finally { setBusy(false) }
      }
      return h(Card, { title: '用 AI 生成' },
        h(Textarea, { value: prompt, onChange: setPrompt, rows: 2, placeholder: '描述想要的画面。比如：一张扁平插画，游戏策划和 AI 一起在白板前画关卡草图，暖色，留白多，不要文字' }),
        h('div', { className: cls('l-filters') },
          h(Seg, { value: size, onChange: setSize, options: LIB_SIZES, label: '图的形状' }),
          h(Select, { value: count, onChange: setCount, options: ['1', '2', '3', '4'].map(v => ({ value: v, label: `${v} 张` })), 'aria-label': '几张' }),
          h(Select, { value: proj, onChange: setProj, 'aria-label': '归到哪篇', options: [{ value: '', label: '不归到文章' }, ...arts.map(p => ({ value: p.id, label: `归到「${String(p.title).slice(0, 16)}」` }))] }),
          h('span', { className: cls('grow') }),
          h(Btn, { kind: 'primary', icon: 'spark', busy, onClick: run }, busy ? `生成中 ${timer.secs} 秒` : '生成')))
    }

    /** 一张素材的详情：大图、来源、画面描述；改标题和归到哪篇、插进文章、下载、删除 */
    function LibAssetModal({ asset: a, all, onClose, onChanged }) {
      const arts = all.filter(p => p.type === 'article')
      const own = a.kind !== 'project'
      const [title, setTitle] = useState(a.title || '')
      const [proj, setProj] = useState(a.project || '')
      const [target, setTarget] = useState(arts.some(p => p.id === a.project) ? a.project : arts[0]?.id ?? '')
      const act = useAction()
      const dirty = own && (title.trim() !== (a.title || '') || proj !== (a.project || ''))
      const save = () => act.run(async () => { await wbPatch(`/api/assets/${enc(a.id)}`, { title: title.trim(), project: proj }); toast('已保存'); onChanged() })
      const insert = () => act.run(async () => { const r = await wbPost(pApi(target, 'studio/insert-asset'), { asset: a.id, alt: a.title || '' }); toast(`已插到文末：${r.file}`); onClose(); onChanged() })
      const del = async () => {
        if (!(await ask({ title: '删除这张图？', text: '图片文件会一起删掉，找不回来。', ok: '删除', danger: true }))) return
        act.run(async () => { await wbDel(`/api/assets/${enc(a.id)}`); toast('已删除'); onClose(); onChanged() })
      }
      const src = a.page || a.source
      return h(Modal, {
        title: a.title || a.file, onClose, width: 760,
        footer: [
          own ? h(Btn, { key: 'd', kind: 'danger', icon: 'trash', onClick: del }, '删除') : null,
          h(LibLinkBtn, { key: 'dl', href: fileUrl(a.url), download: a.file, icon: 'download' }, '下载'),
          h(Btn, { key: 'c', kind: 'primary', onClick: onClose }, '关闭'),
        ],
      },
      h('div', { className: cls('l-big') }, h('img', { src: fileUrl(a.url), alt: a.title || '' })),
      h(KV, { items: [
        ['类型', [LIB_KIND[a.kind], a.w ? `${a.w}×${a.h}` : '', a.size ? `${(a.size / 1024).toFixed(0)} KB` : '', libTime(a.t)].filter(Boolean).join(' · ')],
        ['作品', a.projectTitle],
        ['画面描述', a.prompt],
        ['生图接口', a.provider],
        ['来源', src ? h('a', { className: cls('l-link'), href: src, target: '_blank', rel: 'noreferrer' }, src.slice(0, 90)) : ''],
      ] }),
      own ? h(Grid, { cols: 2 },
        h(Field, { label: '标题' }, h(Input, { value: title, onChange: setTitle })),
        h(Field, { label: '归到哪篇' }, h(Select, { value: proj, onChange: setProj, options: [{ value: '', label: '不归到作品' }, ...all.map(p => ({ value: p.id, label: String(p.title || p.id).slice(0, 26) }))] }))) : null,
      own ? h(Row, null, h(Btn, { busy: act.busy, disabled: !dirty, onClick: save }, '保存标题和归类')) : null,
      arts.length ? h(Field, { label: '插到文章里', hint: '插到文末。要插在某段后面，到写作页点「配图」' },
        h('div', { className: cls('l-filters') },
          h('div', { className: cls('grow') }, h(Select, { value: target, onChange: setTarget, options: arts.map(p => ({ value: p.id, label: String(p.title).slice(0, 26) })) })),
          h(Btn, { icon: 'plus', busy: act.busy, disabled: !target, onClick: insert }, '插到这篇文末'))) : null,
      act.error ? h(Alert, { tone: 'danger' }, act.error.message) : null)
    }

    /** 从网址存图 */
    function LibSaveUrlModal({ all, onClose, onDone }) {
      const [form, setForm] = useState({ url: '', title: '', page: '', project: '' })
      const set = k => v => setForm(x => ({ ...x, [k]: v }))
      const act = useAction()
      const ok = () => act.run(async () => {
        if (!/^https?:\/\//i.test(form.url.trim())) throw new Error('图片地址要以 http:// 或 https:// 开头')
        await wbPost('/api/assets/save', { url: form.url.trim(), title: form.title.trim(), page: form.page.trim(), project: form.project })
        toast('存好了'); onDone(); onClose()
      })
      return h(Modal, { title: '从网址存图', onClose, width: 520, footer: [h(Btn, { key: 'c', onClick: onClose }, '取消'), h(Btn, { key: 'o', kind: 'primary', busy: act.busy, onClick: ok }, '存下来')] },
        h(Field, { label: '图片地址', hint: '在网页上右键图片「复制图片地址」' }, h(Input, { value: form.url, onChange: set('url'), placeholder: 'https://…/xx.png', autoFocus: true })),
        h(Field, { label: '标题（可不填）' }, h(Input, { value: form.title, onChange: set('title') })),
        h(Field, { label: '来自哪个网页（可不填）', hint: '记下出处，以后好查' }, h(Input, { value: form.page, onChange: set('page'), placeholder: 'https://…' })),
        h(Field, { label: '归到哪篇' }, h(Select, { value: form.project, onChange: set('project'), options: [{ value: '', label: '不归到作品' }, ...all.map(p => ({ value: p.id, label: String(p.title || p.id).slice(0, 26) }))] })),
        act.error ? h(Alert, { tone: 'danger' }, act.error.message) : null)
    }

    /**
     * 从素材库挑一张图（写作页「配图」、卡片等用）：
     *   h(AssetPicker, { project, onPick: 素材 => …, onClose })
     * project 可以是项目对象或项目 id，不传就只看全部。点一张会先调 onPick(素材对象)，再调 onClose()。
     * 素材对象里 url 是工作台里的路径，显示时用 fileUrl(素材.url)；插进文章用 POST pApi(project, 'studio/insert-asset') { asset: 素材.id }。
     */
    function AssetPicker({ project, onPick, onClose }) {
      const pid = project ? project.id ?? project : ''
      const [scope, setScope] = useState(pid ? 'mine' : 'all')
      const list = useData(() => wb(`/api/assets${scope === 'mine' && pid ? `?project=${enc(pid)}` : ''}`), [scope, pid])
      const items = list.data ?? []
      return h(Modal, {
        title: '从素材库挑图', onClose, width: 800,
        footer: [h(Btn, { key: 'g', kind: 'ghost', icon: 'spark', onClick: () => { onClose?.(); go('assets') } }, '去素材库生成新图'), h(Btn, { key: 'c', onClick: onClose }, '取消')],
      },
      pid ? h(Seg, { value: scope, onChange: setScope, options: [{ value: 'mine', label: '这篇的' }, { value: 'all', label: '全部' }], label: '范围' }) : null,
      !list.data ? (list.error ? h(ErrorBox, { error: list.error, onRetry: list.reload }) : h(Loading))
        : items.length ? h(Thumbs, { min: 150 }, items.map(a => h(Thumb, { key: a.id, src: fileUrl(a.url), name: a.title || a.file, meta: a.projectTitle || LIB_KIND[a.kind], onClick: () => { onPick?.(a); onClose?.() } })))
          : h(Empty, { title: '这里还没有图', body: scope === 'mine' ? '看看「全部」，或者让 AI 助手去找图、生图' : '让 AI 助手去找图、生图，或者到素材库生成' }))
    }

    // ================================================================== 3.50.4 AI 记忆（含作品复盘）

    const LIB_SRC = { seed: '默认', agent: '你让它记的', manual: '你加的', user: '你加的', auto: '对话里学的', learn: '复盘学到的', edits: '从手改学的', tidy: '整理' }
    const LIB_OP = { add: '学到', update: '改写', promote: '升为守则', demote: '降为卡片', miss: '被推翻', archive: '归档', restore: '恢复', remove: '删掉', tidy: '整理' }
    const LIB_OP_TONE = { add: 'success', update: 'info', promote: 'success', demote: 'warn', miss: 'danger', restore: 'info', remove: 'danger' }
    const LIB_REVERTABLE = ['add', 'update', 'promote', 'demote', 'miss', 'archive', 'restore', 'remove']
    const LIB_TIDY_OP = { edit: '改写', merge: '合并', split: '拆开', archive: '归档', demote: '降为卡片' }

    function MemoryPage() {
      const [tab, setTab] = useState(() => (lsGet('memoryTab', 'memory') === 'works' ? 'works' : 'memory'))
      const works = useData(() => wb('/api/works'), [])
      const nWorks = works.data?.works?.length ?? 0
      const nPending = works.data?.pending?.length ?? 0
      return h(Page, { title: 'AI 记忆', sub: '助手记住的你的写法和规矩，还有复盘过的作品。学到的直接生效，不对的随时撤。' },
        h(Tabs, {
          value: tab, onChange: v => { setTab(v); lsSet('memoryTab', v); if (v === 'works') works.reload() },
          options: [{ value: 'memory', label: '记忆' }, { value: 'works', label: `作品复盘${nWorks ? ` ${nWorks}` : ''}${nPending ? `（${nPending} 篇待复盘）` : ''}` }],
        }),
        tab === 'memory' ? h(LibMemoryTab) : h(LibWorksTab, { works }))
    }

    function LibMemoryTab() {
      const mem = useData(() => wb('/api/memory'), [])
      const [view, setView] = useState('rule')
      const [kind, setKind] = useState('')
      const [allLogs, setAllLogs] = useState(false)
      const [busy, setBusy] = useState('')
      const [draft, setDraft] = useState({ kind: 'style', tier: 'rule', text: '' })
      const timer = useLibTimer(busy === 'tidy' || busy === 'edits')
      if (!mem.data) return mem.error ? h(ErrorBox, { error: mem.error, onRetry: mem.reload }) : h(Loading)
      const d = mem.data
      const kinds = d.kinds || {}
      const scopes = d.scopes || {}
      const projTitle = id => d.projects?.find(x => x.id === id)?.title || id || ''
      const doing = async (key, fn) => { setBusy(key); timer.start(); try { await fn() } catch (e) { notify(e.message) } finally { setBusy('') } }
      const L = d.items || []
      const live = x => x.status === 'active'
      const groups = {
        rule: L.filter(x => live(x) && x.tier === 'rule' && x.scope !== 'project' && x.kind !== 'phrase').sort((a, b) => (b.hits - b.misses * 2) - (a.hits - a.misses * 2)),
        card: L.filter(x => live(x) && x.tier === 'card' && x.scope !== 'project' && x.kind !== 'phrase'),
        project: L.filter(x => live(x) && x.scope === 'project'),
        phrase: L.filter(x => live(x) && x.kind === 'phrase' && x.scope !== 'project'),
        archived: L.filter(x => x.status === 'archived'),
      }
      const VIEWS = [
        { value: 'rule', label: `守则 ${groups.rule.length}/15`, hint: '证据够多、换哪篇都成立的硬规矩。证据最足的几条每次都带，其余按这一轮要做的事挑。被推翻两次以上会降回卡片。' },
        { value: 'card', label: `卡片 ${groups.card.length}`, hint: '刚学到的、做法类的，和这一轮要做的事相关时才带。在两篇以上作品里被印证会升成守则。' },
        { value: 'project', label: `只这一篇 ${groups.project.length}`, hint: '只在那篇文章或卡片里生效。' },
        { value: 'phrase', label: `口头说法 ${groups.phrase.length}`, hint: '你常说的话实际指什么，助手照这个理解。' },
        { value: 'archived', label: `已归档 ${groups.archived.length}`, hint: '不再带给助手，想用可以恢复。' },
      ]
      const cur = VIEWS.find(v => v.value === view) ?? VIEWS[0]
      const shown = groups[cur.value].filter(x => !kind || x.kind === kind)

      const update = async (id, patch) => { try { await wbPut(`/api/memory/${enc(id)}`, patch); toast('已保存'); mem.reload() } catch (e) { notify(e.message) } }
      const revert = async lid => { try { await wbPost('/api/memory/revert', { lid }); toast('撤掉了'); mem.reload() } catch (e) { notify(e.message) } }
      // 删掉能撤回：删完在右下角给一个「撤销」
      const remove = async x => {
        try {
          await wbDel(`/api/memory/${enc(x.id)}`)
          const fresh = await wb('/api/memory').catch(() => null)
          const e = fresh?.log?.find(y => y.op === 'remove' && y.memId === x.id && !y.revoked)
          notify(`删掉了：${x.text.slice(0, 24)}${x.text.length > 24 ? '…' : ''}`, { tone: 'success', action: e ? { label: '撤销', onClick: () => revert(e.lid) } : undefined })
          mem.reload()
        } catch (e) { notify(e.message) }
      }
      const setAuto = async on => { try { await wbPut('/api/memory', { auto: on }); toast(on ? '对话、复盘和手改里会自动学，不对的在「最近学到」里撤' : '不再自动学，只在你说“记住”时记'); mem.reload() } catch (e) { notify(e.message) } }
      const add = async () => {
        const text = draft.text.trim()
        if (!text) return
        try { await wbPost('/api/memory', { text, kind: draft.kind, tier: draft.tier }); setDraft(x => ({ ...x, text: '' })); toast('记住了'); mem.reload() } catch (e) { notify(e.message) }
      }
      const rowActions = x => {
        const acts = []
        if (x.status === 'archived') acts.push({ key: 'restore', label: '恢复', icon: 'lib-undo', onClick: () => update(x.id, { status: 'active' }) })
        else if (x.kind !== 'phrase' && x.scope !== 'project') acts.push(x.tier === 'rule'
          ? { key: 'demote', label: '降为卡片', icon: 'down', note: '不再固定带，相关时才带', onClick: () => update(x.id, { tier: 'card' }) }
          : { key: 'promote', label: '升为守则', icon: 'up', note: '不等证据，直接定成守则', onClick: () => update(x.id, { tier: 'rule' }) })
        acts.push({ title: '用在哪' })
        for (const s of ['all', 'article', 'card']) acts.push({ key: `s-${s}`, label: s === 'all' ? '全部适用' : `只管${scopes[s] || s}`, current: x.scope === s, onClick: () => update(x.id, { scope: s }) })
        return acts
      }
      const logs = (d.log || []).filter(e => !e.revoked && e.op !== 'hit' && e.op !== 'tidy')
      const rep = d.report
      const rowsOf = xs => h('div', { className: cls('l-list') }, xs.map(x => h(LibMemRow, { key: x.id, x, kinds, scopes, projTitle, actions: rowActions(x), onSave: patch => update(x.id, patch), onDel: () => remove(x) })))
      let listBody
      if (!shown.length) listBody = h('div', { className: cls('center') }, kind ? '这个分类里还没有' : '还没有')
      else if (cur.value === 'project') {
        const by = {}
        for (const x of shown) (by[x.project] ||= []).push(x)
        listBody = h('div', { className: cls('stack') }, Object.entries(by).map(([pid, xs]) => h('div', { key: pid }, h('div', { className: cls('l-group') }, `《${projTitle(pid)}》`), rowsOf(xs))))
      } else listBody = rowsOf(shown)

      return h('div', { className: cls('stack') },
        h('div', { className: cls('l-filters') },
          h('span', { className: cls('row') }, h(Switch, { checked: d.auto !== false, onChange: setAuto, label: '自动学习' }), h('span', null, '自动学习')),
          h(Btn, { icon: 'spark', busy: busy === 'tidy', disabled: Boolean(busy), tip: '合并重复的、拆开太长的、分好守则和卡片、归档过时的；整理前会留备份，可以撤销', onClick: () => doing('tidy', async () => { const r = await wbPost('/api/memory/tidy', { provider: currentProvider() }); toast(`整理好了，改了 ${r.changes} 处`); mem.reload() }) }, busy === 'tidy' ? `整理中 ${timer.secs} 秒` : '整理一下'),
          d.canUndo ? h(Btn, { icon: 'lib-undo', disabled: Boolean(busy), onClick: () => doing('untidy', async () => { await wbPost('/api/memory/untidy', {}); toast('已恢复到整理前'); mem.reload() }) }, '撤销上次整理') : null,
          h(Btn, { icon: 'edit', busy: busy === 'edits', disabled: Boolean(busy), tip: 'AI 改完以后你又亲手改了哪些地方，找出反复出现的改法', onClick: () => doing('edits', async () => {
            const r = await wbPost('/api/memory/edits', { provider: currentProvider() })
            toast(r.pairs ? `看了 ${r.learned} 处手改，学到 ${(r.done || []).length} 条` : '还没有攒下手改：AI 改完正文后你再亲手改，这里就会记下来'); mem.reload()
          }) }, busy === 'edits' ? `在看你的手改 ${timer.secs} 秒` : `从手改里学${d.editPairs ? `（${d.editPairs} 处）` : ''}`)),
        rep ? h(Alert, null,
          h('div', null, h('b', null, '上次整理'), `（${libTime(rep.t)}，改了 ${rep.changes} 处）：${rep.summary || ''}`),
          rep.lines?.length ? h('details', { className: cls('l-det') }, h('summary', null, '明细'), rep.lines.map((l, i) => h('div', { key: i }, `${l.op === 'merge' ? `合并 ${l.n} 条` : l.op === 'split' ? `拆成 ${l.n} 条` : LIB_TIDY_OP[l.op] || l.op}：${l.text}`))) : null) : null,
        logs.length ? h(Card, { title: '最近学到', note: '都已经生效了；哪条不对点「不对」，当场撤掉' },
          h('div', { className: cls('l-list') }, (allLogs ? logs : logs.slice(0, 6)).map(e => h('div', { key: e.lid, className: cls('l-mrow') },
            h(Tag, { tone: LIB_OP_TONE[e.op] }, LIB_OP[e.op] || e.op),
            h('div', { className: cls('l-col') },
              h('div', null, e.text || '', e.tier === 'rule' ? ' ' : null, e.tier === 'rule' ? h(Tag, { tone: 'outline' }, '守则') : null),
              h('div', { className: cls('faint') }, [libTime(e.t), LIB_SRC[e.source] || e.source || '', e.project ? `《${projTitle(e.project).slice(0, 12)}》` : '', e.conflictWith?.length ? `和 ${e.conflictWith.length} 条旧记忆说反了，旧的记了一次推翻` : ''].filter(Boolean).join(' · '))),
            LIB_REVERTABLE.includes(e.op) ? h(Btn, { sm: true, icon: 'lib-undo', onClick: () => revert(e.lid) }, '不对') : null))),
          logs.length > 6 ? h(Row, null, h(Btn, { kind: 'ghost', sm: true, onClick: () => setAllLogs(!allLogs) }, allLogs ? '收起' : `看全部 ${logs.length} 条`)) : null) : null,
        h(Card, null,
          h('div', { className: cls('l-filters') },
            h(Seg, { value: cur.value, onChange: setView, options: VIEWS, label: '哪一类' }),
            h('span', { className: cls('grow') }),
            h(Select, { value: kind, onChange: setKind, 'aria-label': '分类', options: [{ value: '', label: '全部分类' }, ...Object.entries(kinds).map(([value, label]) => ({ value, label }))] })),
          h('p', { className: cls('faint', 'l-p') }, `${cur.hint}点文字可以直接改，回车保存。`),
          listBody,
          h('div', { className: cls('l-filters', 'l-addrow') },
            h(Select, { value: draft.kind, onChange: v => setDraft(x => ({ ...x, kind: v })), 'aria-label': '分类', options: Object.entries(kinds).map(([value, label]) => ({ value, label })) }),
            h(Select, { value: draft.tier, onChange: v => setDraft(x => ({ ...x, tier: v })), 'aria-label': '守则还是卡片', options: [{ value: 'rule', label: '守则' }, { value: 'card', label: '卡片' }] }),
            h('div', { className: cls('grow') }, h(Input, { value: draft.text, onChange: v => setDraft(x => ({ ...x, text: v })), placeholder: '加一条，比如：标题不超过 20 个字', onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add() } })),
            h(Btn, { kind: 'primary', disabled: !draft.text.trim(), onClick: add }, '记住'))))
    }

    /** 一条记忆：点文字就地改；右边「更多」里升降级、改范围、删掉 */
    function LibMemRow({ x, kinds, scopes, projTitle, actions, onSave, onDel }) {
      const [editing, setEditing] = useState(false)
      const [text, setText] = useState(x.text)
      const cancelled = useRef(false)
      useEffect(() => setText(x.text), [x.text])
      const begin = () => { cancelled.current = false; setText(x.text); setEditing(true) }
      const commit = () => {
        setEditing(false)
        if (cancelled.current) return
        const v = text.trim()
        if (v && v !== x.text) onSave({ text: v }); else setText(x.text)
      }
      const meta = [
        x.scope === 'project' ? `只《${projTitle(x.project).slice(0, 14)}》` : x.scope !== 'all' ? `只管${scopes[x.scope] || x.scope}` : '',
        LIB_SRC[x.source] || '',
        x.hits ? `印证 ${x.hits}${x.projects?.length > 1 ? `（${x.projects.length} 篇）` : ''}` : '',
        x.misses ? `推翻 ${x.misses}` : '', x.caught ? `自查拦下 ${x.caught}` : '', x.used ? `带进提示 ${x.used} 次` : '', x.undone ? `撤销过 ${x.undone}` : '',
      ].filter(Boolean).join(' · ')
      return h('div', { className: cls('l-mrow') },
        h('div', { className: cls('l-col') },
          editing ? h(Textarea, {
            value: text, onChange: setText, autoFocus: true, rows: 2, onBlur: commit, 'aria-label': '改这条记忆',
            onKeyDown: e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur() }
              if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; e.currentTarget.blur() }
            },
          }) : h('div', { className: cls('l-mtext'), role: 'button', tabIndex: 0, title: '点一下改文字', onClick: begin, onKeyDown: e => { if (e.key === 'Enter') begin() } }, x.text),
          h('div', { className: cls('l-meta') }, h(Tag, null, kinds[x.kind] || x.kind), x.tier === 'rule' && x.status === 'archived' ? h(Tag, { tone: 'outline' }, '守则') : null, meta ? h('span', null, meta) : null),
          x.why ? h('div', { className: cls('faint') }, `为什么：${x.why}`) : null,
          x.check ? h('div', { className: cls('faint') }, `自查：${x.check}`) : null,
          x.archivedWhy ? h('div', { className: cls('faint') }, `归档原因：${x.archivedWhy}`) : null,
          x.detail ? h('details', { className: cls('l-det') }, h('summary', null, '怎么做'), h('div', { className: cls('muted', 'pre') }, x.detail)) : null),
        h(Menu, { icon: 'more', tip: '更多', kind: 'ghost', sm: true, align: 'right', items: [
          { key: 'edit', label: '改文字', icon: 'edit', onClick: begin },
          ...actions,
          { sep: true },
          { key: 'del', label: '删掉', icon: 'trash', danger: true, onClick: onDel },
        ] }))
    }

    /** 作品复盘：标成「已发布」后自动复盘，写下一篇时助手会参照它们的切入、结构和写法 */
    function LibWorksTab({ works }) {
      const [busy, setBusy] = useState('')
      const timer = useLibTimer(Boolean(busy))
      if (!works.data) return works.error ? h(ErrorBox, { error: works.error, onRetry: works.reload }) : h(Loading)
      const { works: done = [], pending = [] } = works.data
      const learn = async (key, body, msg) => {
        setBusy(key); timer.start()
        try { const r = await wbPost('/api/works/learn', { ...body, provider: currentProvider() }); toast(msg(r)); works.reload() } catch (e) { notify(e.message) } finally { setBusy('') }
      }
      const drop = async w => {
        try { await wbDel(`/api/works/${enc(w.id)}`); toast('不再参照这篇了。想恢复，在「还没复盘」里点「复盘」'); works.reload() } catch (e) { notify(e.message) }
      }
      const line = (label, xs) => (xs?.length ? h('div', { className: cls('muted') }, `${label}：${xs.map(x => String(x).replace(/[。；;]+$/, '')).join('；')}`) : null)
      return h('div', { className: cls('stack') },
        h('p', { className: cls('muted', 'l-p') }, '作品标成「已发布」后会自动复盘，写下一篇时助手会参照它们的切入、结构和写法。复盘学到的也会进「记忆」。'),
        works.data.busy ? h(Alert, null, h(Spin, { sm: true }), ` 正在复盘《${works.data.busy}》…`) : null,
        pending.length ? h(Card, {
          title: `还没复盘 ${pending.length} 篇`,
          action: h(Btn, { kind: 'primary', sm: true, icon: 'spark', busy: busy === 'all', disabled: Boolean(busy), onClick: () => learn('all', {}, r => `复盘了 ${(r.results || []).length} 篇`) }, busy === 'all' ? `复盘中 ${timer.secs} 秒` : '全部复盘'),
        }, h('div', { className: cls('l-list') }, pending.map(p => h('div', { key: p.id, className: cls('l-mrow') },
          h('div', { className: cls('l-col') }, h('span', null, `《${p.title}》`), h('span', { className: cls('faint') }, TYPE_NAMES[p.type] || '')),
          h(Btn, { sm: true, busy: busy === p.id, disabled: Boolean(busy) && busy !== p.id, onClick: () => learn(p.id, { project: p.id }, w => `复盘好了，学到 ${(w.memo || []).length} 条`) }, busy === p.id ? `复盘中 ${timer.secs} 秒` : '复盘'))))) : null,
        done.length ? done.map(w => h(Card, {
          key: w.id, title: `《${w.title}》`,
          note: [(w.published || []).map(r => r.platform).filter(Boolean).join('、'), w.learnedAt ? `复盘于 ${libTime(w.learnedAt)}` : '', `学到 ${(w.memo || []).length} 条`].filter(Boolean).join(' · '),
          action: h(Row, null,
            h(Btn, { sm: true, icon: 'refresh', busy: busy === w.id, disabled: Boolean(busy) && busy !== w.id, onClick: () => learn(w.id, { project: w.id }, r => `复盘好了，学到 ${(r.memo || []).length} 条`) }, busy === w.id ? `复盘中 ${timer.secs} 秒` : '重新复盘'),
            h(Btn, { kind: 'ghost', sm: true, icon: 'x', label: '不再参照这篇', onClick: () => drop(w) })),
        },
        w.summary ? h('div', null, w.summary) : null,
        w.structure ? h('div', { className: cls('muted') }, `结构：${w.structure}`) : null,
        line('做得好', w.good),
        line('上次费劲的地方', w.lessons)))
          : h(Empty, { title: '还没有复盘过的作品', body: pending.length ? '点上面的「复盘」，或者等它自动复盘' : '作品标成「已发布」后会自动复盘' }))
    }

    // ================================================================== 3.50.5 设置：模型、生图、配音、技能、X 接口

    const LIB_SET_TABS = [{ value: 'models', label: '模型' }, { value: 'images', label: '生图' }, { value: 'tts', label: '配音' }, { value: 'skills', label: '技能' }, { value: 'x', label: 'X 接口' }]
    /** 设置页。别的页想直接打开某一块：go('settings', { tab: 'images' }) */
    function SettingsPage({ tab }) {
      const valid = v => LIB_SET_TABS.some(o => o.value === v)
      const [cur, setCur] = useState(() => (valid(tab) ? tab : valid(lsGet('settingsTab', '')) ? lsGet('settingsTab', '') : 'models'))
      const pick = v => { setCur(v); lsSet('settingsTab', v) }
      return h(Page, { title: '设置', sub: '密钥只存在这台电脑上，页面上只显示遮挡后的样子' },
        h(Tabs, { value: cur, onChange: pick, options: LIB_SET_TABS }),
        cur === 'models' ? h(LibModelSettings)
          : cur === 'images' ? h(LibImageSettings)
            : cur === 'tts' ? h(LibTtsSettings)
              : cur === 'skills' ? h(LibSkillSettings)
                : h(Card, { title: 'X（推特）接口', sub: '选题广场拉 X 上的新帖用，AI 查资料时也会用。X 按读到的帖子数收费。' }, h(LibXSettings)))
    }

    // ---- 模型
    function LibModelSettings() {
      // 用共享的 loadProviders(true)：拿列表的同时把导航底部的模型菜单也刷新了
      const list = useData(() => loadProviders(true), [])
      const [adding, setAdding] = useState(false)
      if (!list.data) return list.error ? h(ErrorBox, { error: list.error, onRetry: list.reload }) : h(Loading)
      const d = list.data
      return h('div', { className: cls('stack') },
        h(Alert, null, '写作、精修、挑选题这些 AI 功能用哪个模型。标「默认」的那个先用，导航底部可以临时换。「DSH 里的模型」由 DSH 提供，不用填密钥；其余的填好密钥就能用。'),
        (d.providers || []).map(p => h(LibProviderCard, { key: p.id, p, isDefault: d.default === p.id, onChanged: list.reload })),
        adding ? h(LibAddProvider, { onClose: () => setAdding(false), onDone: () => { setAdding(false); list.reload() } })
          : h(Row, null, h(Btn, { icon: 'plus', onClick: () => setAdding(true) }, '加一个别的接口（OpenAI 兼容格式）')))
    }

    function LibProviderCard({ p, isDefault, onChanged }) {
      const blank = () => ({ model: p.model || '', baseUrl: p.baseUrl || '', key: '' })
      const [form, setForm] = useState(blank)
      useEffect(() => setForm(blank()), [p.model, p.baseUrl, p.keyMask])
      const [testing, setTesting] = useState(false)
      const act = useAction()
      const set = k => v => setForm(x => ({ ...x, [k]: v }))
      const save = () => act.run(async () => {
        const body = p.type === 'claudecode' ? { model: form.model.trim() } : { model: form.model.trim(), baseUrl: form.baseUrl.trim() }
        if (form.key.trim()) body.key = form.key.trim()
        await wbPut(`/api/ai/providers/${enc(p.id)}`, body); toast('已保存'); onChanged()
      })
      const setDefault = () => act.run(async () => { await wbPut('/api/ai/providers', { default: p.id }); toast(`默认用「${p.name}」了`); onChanged() })
      const test = async () => {
        setTesting(true)
        try { const r = await wbPost('/api/ai/test', { provider: p.id }); toast(`能用：回了「${r.text}」，${(r.ms / 1000).toFixed(1)} 秒`) } catch (e) { notify(e.message) } finally { setTesting(false) }
      }
      const note = p.dsh ? 'DSH 里的模型' : p.keyFrom ? `密钥来自${p.keyFrom}` : p.env ? `也可以用环境变量 ${p.env}` : ''
      let body
      if (p.dsh) body = h('p', { className: cls('muted', 'l-p') }, '由 DSH 提供，不用填密钥。要换 DSH 用的模型，到 DSH 自己的设置里改。')
      else if (p.type === 'hermes') body = h('p', { className: cls('muted', 'l-p') }, '用你本机已经配好的 Hermes，不用填密钥，但每次要等 10 秒左右；填了密钥的接口会快很多，还能边写边出字。')
      else if (p.type === 'claudecode') body = h(Fragment, null,
        h(LibCCBlock, { cc: p.cc || {}, onDone: onChanged }),
        h('div', { className: cls('l-filters') },
          h('div', { className: cls('grow') }, h(Input, { value: form.model, onChange: set('model'), placeholder: '模型（可不填：opus / sonnet，默认跟着订阅）', 'aria-label': '模型' })),
          h(Btn, { busy: act.busy, onClick: save }, '保存')))
      else body = h(Fragment, null,
        h(Grid, { cols: 3 },
          h(Field, { label: '模型名' }, h(Input, { value: form.model, onChange: set('model') })),
          h(Field, { label: '接口地址' }, h(Input, { value: form.baseUrl, onChange: set('baseUrl'), placeholder: p.type === 'anthropic' ? '默认官方，可不填' : 'https://…/v1' })),
          h(Field, { label: '密钥' }, h(Input, { type: 'password', autoComplete: 'off', value: form.key, onChange: set('key'), placeholder: p.keyMask ? `已填 ${p.keyMask}，留空不改` : 'API 密钥' }))),
        h(Row, null, h(Btn, { busy: act.busy, onClick: save }, '保存')))
      return h(Card, {
        title: h(Fragment, null, p.name, ' ', h(Tag, { tone: p.ready ? 'success' : undefined }, p.ready ? '可用' : '未配置')),
        note,
        action: h(Row, null,
          isDefault ? h(Tag, { tone: 'info' }, '默认') : p.ready ? h(Btn, { sm: true, disabled: act.busy, onClick: setDefault }, '设为默认') : null,
          p.ready ? h(Btn, { sm: true, busy: testing, onClick: test }, '测试') : null),
      }, body, act.error ? h(Alert, { tone: 'danger' }, act.error.message) : null)
    }

    /** Claude Code：一键安装 → 登录，过程显示在这一栏下面，登录好了自动刷新 */
    function LibCCBlock({ cc, onDone }) {
      const [phase, setPhase] = useState('')   // '' | 'install' | 'login'
      const [info, setInfo] = useState({})
      const [fail, setFail] = useState('')
      const [code, setCode] = useState('')
      const startLogin = async () => {
        setFail(''); setPhase('login'); setInfo({})
        try { const st = await wbPost('/api/ai/cc-login', {}); setInfo({ url: st?.url || '' }) } catch (e) { setPhase(''); setFail(e.message) }
      }
      const startInstall = async () => {
        setFail(''); setPhase('install'); setInfo({})
        try { await wbPost('/api/ai/cc-install', {}) } catch (e) { setPhase(''); setFail(e.message) }
      }
      const sendCode = async () => {
        const v = code.trim()
        if (!v) return
        try { await wbPost('/api/ai/cc-login', { code: v }); setCode(''); toast('验证码交上去了，稍等') } catch (e) { notify(e.message) }
      }
      usePoll(async () => {
        const r = await wb('/api/ai/cc').catch(() => null)
        if (!r) return
        if (phase === 'login') {
          if (r.loggedIn) { setPhase(''); toast(`Claude Code 登录好了${r.email ? `：${r.email}` : ''}`); onDone(); return }
          if (!r.login?.running) { setPhase(''); setFail(r.login?.error || '登录没完成，再点一次「登录」') }
        } else if (phase === 'install') {
          if (r.install && !r.install.running) {
            if (!r.found) { setPhase(''); setFail(r.install.error || '安装没成功'); return }
            toast('Claude Code 装好了，接着登录'); startLogin(); return
          }
          setInfo({ log: r.install?.log || '' })
        }
      }, 2000, Boolean(phase))
      return h(Fragment, null,
        cc.loggedIn ? h(Alert, { tone: 'success' }, `已登录${cc.email ? ` ${cc.email}` : ''}${cc.plan ? `（${cc.plan}）` : ''}。用你的 Claude 订阅额度跑：写作页的助手能直接改文章和排版，润色、体检、找选题也能用。`)
          : cc.found ? h(Alert, { tone: 'warn', action: h(Btn, { kind: 'primary', sm: true, busy: phase === 'login', onClick: startLogin }, '登录') }, '还没登录。点「登录」会打开浏览器，用你的 Claude 账号确认一下就好。')
            : h(Alert, { tone: 'warn', action: h(Btn, { kind: 'primary', sm: true, icon: 'download', busy: phase === 'install', onClick: startInstall }, '一键安装并登录') }, '这台电脑上还没有 Claude Code。点一下会从 claude.ai 下载官方版装好，装完接着登录。'),
        phase === 'install' ? h(Fragment, null, h(Alert, null, h(Spin, { sm: true }), ' 正在下载安装，一般一两分钟…'), info.log ? h('pre', { className: cls('l-pre') }, info.log) : null) : null,
        phase === 'login' ? h('div', { className: cls('stack') },
          h(Alert, null, h(Spin, { sm: true }), ' 浏览器里打开了 Claude 登录页，确认后这里会自动变成「已登录」。'),
          h('p', { className: cls('faint', 'l-p') }, '浏览器没打开？', info.url ? h('a', { className: cls('l-link'), href: info.url, target: '_blank', rel: 'noreferrer' }, '点这里打开登录页') : '再点一次「登录」', '。登录页最后给了一串验证码的话，粘贴到这里：'),
          h('div', { className: cls('l-filters') },
            h('div', { className: cls('grow') }, h(Input, { value: code, onChange: setCode, placeholder: '验证码', autoComplete: 'off', onKeyDown: e => { if (e.key === 'Enter') sendCode() } })),
            h(Btn, { onClick: sendCode }, '提交'))) : null,
        fail ? h(Alert, { tone: 'danger' }, fail) : null)
    }

    function LibAddProvider({ onClose, onDone }) {
      const [form, setForm] = useState({ name: '', url: '', model: '', key: '' })
      const set = k => v => setForm(x => ({ ...x, [k]: v }))
      const act = useAction()
      const ok = () => act.run(async () => {
        if (!form.name.trim() || !form.url.trim() || !form.model.trim()) throw new Error('名字、接口地址、模型名都要填')
        await wbPut(`/api/ai/providers/x-${Date.now().toString(36)}`, { name: form.name.trim(), baseUrl: form.url.trim(), model: form.model.trim(), key: form.key.trim(), type: 'openai' })
        toast('已添加'); onDone()
      })
      return h(Card, { title: '加一个别的接口', sub: 'OpenAI 兼容格式：硅基流动、DeepSeek、Kimi 这类都行' },
        h(Grid, { cols: 2 },
          h(Field, { label: '名字' }, h(Input, { value: form.name, onChange: set('name'), placeholder: '比如 硅基流动', autoFocus: true })),
          h(Field, { label: '接口地址' }, h(Input, { value: form.url, onChange: set('url'), placeholder: 'https://api.xxx.com/v1' })),
          h(Field, { label: '模型名' }, h(Input, { value: form.model, onChange: set('model') })),
          h(Field, { label: '密钥' }, h(Input, { type: 'password', autoComplete: 'off', value: form.key, onChange: set('key'), placeholder: 'API 密钥' }))),
        act.error ? h(Alert, { tone: 'danger' }, act.error.message) : null,
        h(Row, null, h(Btn, { kind: 'primary', busy: act.busy, onClick: ok }, '添加'), h(Btn, { onClick: onClose }, '取消')))
    }

    // ---- 生图
    function LibImageSettings() {
      const st = useData(() => wb('/api/images'), [])
      const [adding, setAdding] = useState(false)
      if (!st.data) return st.error ? h(ErrorBox, { error: st.error, onRetry: st.reload }) : h(Loading)
      const d = st.data
      const setConfirm = async on => { try { await wbPut('/api/images', { confirm: on }); toast(on ? 'AI 助手生图前会先问你' : '以后 AI 助手会直接生图'); st.reload() } catch (e) { notify(e.message) } }
      return h('div', { className: cls('stack') },
        h(Alert, null, '素材页的 AI 生图和 AI 助手配图都用这里的接口。填好一家就能用，标「默认」的那家先用。生图按张收费，费用由服务商收。'),
        h(Card, null, h(Check, { checked: d.confirm, onChange: setConfirm }, 'AI 助手要生图时，先让我确认（推荐：生图按张计费）')),
        (d.providers || []).map(p => h(LibImgProvider, { key: p.id, p, formats: d.formats || {}, isDefault: d.default === p.id, hasDefault: Boolean(d.default), onChanged: st.reload })),
        adding ? h(LibAddImgProvider, { formats: d.formats || {}, onClose: () => setAdding(false), onDone: () => { setAdding(false); st.reload() } })
          : h(Row, null, h(Btn, { icon: 'plus', onClick: () => setAdding(true) }, '加一个别的生图接口')))
    }

    function LibImgProvider({ p, formats, isDefault, hasDefault, onChanged }) {
      const blank = () => ({ model: p.model || '', baseUrl: p.baseUrl || '', key: '' })
      const [form, setForm] = useState(blank)
      useEffect(() => setForm(blank()), [p.model, p.baseUrl, p.keyMask])
      const act = useAction()
      const set = k => v => setForm(x => ({ ...x, [k]: v }))
      const save = () => act.run(async () => {
        const body = { id: p.id, model: form.model.trim(), baseUrl: form.baseUrl.trim() }
        if (form.key.trim()) body.key = form.key.trim()
        const r = await wbPut('/api/images', body)
        // 还没有默认的时候，第一家配好的自动当默认
        if (!hasDefault && !r.default && r.providers?.find(x => x.id === p.id)?.ready) await wbPut('/api/images', { default: p.id })
        toast('已保存'); onChanged()
      })
      const setDefault = () => act.run(async () => { await wbPut('/api/images', { default: p.id }); toast('已设为默认'); onChanged() })
      const remove = async () => {
        if (!(await ask({ title: `删掉「${p.name}」？`, text: '这家的地址和密钥会一起删掉。', ok: '删掉', danger: true }))) return
        act.run(async () => { await wbPut('/api/images', { id: p.id, remove: true }); toast('已删掉'); onChanged() })
      }
      const note = [formats[p.format] || p.format, p.keyFrom ? `密钥来自${p.keyFrom}` : p.env ? `也可以用环境变量 ${p.env}` : ''].filter(Boolean).join(' · ')
      return h(Card, {
        title: h(Fragment, null, p.name, ' ', h(Tag, { tone: p.ready ? 'success' : undefined }, p.ready ? '可用' : '未配置')),
        note,
        action: h(Row, null,
          isDefault ? h(Tag, { tone: 'info' }, '默认') : p.ready ? h(Btn, { sm: true, disabled: act.busy, onClick: setDefault }, '设为默认') : null,
          p.custom ? h(Btn, { kind: 'ghost', sm: true, icon: 'trash', label: '删掉这个接口', onClick: remove }) : null),
      },
      h(Grid, { cols: 3 },
        h(Field, { label: '模型名' }, h(Input, { value: form.model, onChange: set('model') })),
        h(Field, { label: '接口地址' }, h(Input, { value: form.baseUrl, onChange: set('baseUrl') })),
        h(Field, { label: '密钥' }, h(Input, { type: 'password', autoComplete: 'off', value: form.key, onChange: set('key'), placeholder: p.keyMask ? `已保存 ${p.keyMask}，要换就粘贴新的` : 'API 密钥' }))),
      h(Row, null, h(Btn, { busy: act.busy, onClick: save }, '保存')),
      act.error ? h(Alert, { tone: 'danger' }, act.error.message) : null)
    }

    function LibAddImgProvider({ formats, onClose, onDone }) {
      const [form, setForm] = useState({ name: '', format: Object.keys(formats)[0] || 'openai', url: '', model: '', key: '' })
      const set = k => v => setForm(x => ({ ...x, [k]: v }))
      const act = useAction()
      const ok = () => act.run(async () => {
        if (!form.name.trim() || !form.url.trim() || !form.model.trim()) throw new Error('名字、接口地址、模型名都要填')
        await wbPut('/api/images', { id: `x-${Date.now().toString(36)}`, name: form.name.trim(), format: form.format, baseUrl: form.url.trim(), model: form.model.trim(), key: form.key.trim() })
        toast('已添加'); onDone()
      })
      return h(Card, { title: '加一个别的生图接口' },
        h(Grid, { cols: 2 },
          h(Field, { label: '名字' }, h(Input, { value: form.name, onChange: set('name'), autoFocus: true })),
          h(Field, { label: '接口格式' }, h(Select, { value: form.format, onChange: set('format'), options: Object.entries(formats).map(([value, label]) => ({ value, label })) })),
          h(Field, { label: '接口地址' }, h(Input, { value: form.url, onChange: set('url'), placeholder: 'https://…' })),
          h(Field, { label: '模型名' }, h(Input, { value: form.model, onChange: set('model') })),
          h(Field, { label: '密钥' }, h(Input, { type: 'password', autoComplete: 'off', value: form.key, onChange: set('key'), placeholder: 'API 密钥' }))),
        act.error ? h(Alert, { tone: 'danger' }, act.error.message) : null,
        h(Row, null, h(Btn, { kind: 'primary', busy: act.busy, onClick: ok }, '添加'), h(Btn, { onClick: onClose }, '取消')))
    }

    // ---- 配音（视频的旁白用哪种声音念）
    const LIB_SPEEDS = [0.8, 0.9, 1, 1.1, 1.2, 1.35].map(s => ({ value: String(s), label: s === 1 ? '正常' : `${s} 倍` }))
    function LibTtsSettings() {
      const [c, setC] = useState(null)
      const [err, setErr] = useState(null)
      const [preset, setPreset] = useState('')
      const [form, setForm] = useState({ key: '', baseUrl: '', model: '', voice: '', speed: '1' })
      const [busy, setBusy] = useState('')
      const [sample, setSample] = useState('')
      // 选了哪家就填上那家的地址、模型、音色（选回已保存的那家就用保存的值）
      const fill = (cfg, pid, speed) => {
        const same = pid === cfg.preset
        const pre = cfg.presets.find(x => x.id === pid) || {}
        const val = k => (same ? cfg[k] : pre[k]) ?? ''
        setForm({ key: '', baseUrl: val('baseUrl'), model: val('model'), voice: val('voice') || (pid === 'say' ? 'Tingting' : ''), speed: speed ?? String(+cfg.speed || 1) })
      }
      const load = () => { setErr(null); wb('/api/video-tts').then(cfg => { setC(cfg); setPreset(cfg.preset); fill(cfg, cfg.preset) }, setErr) }
      useEffect(load, [])
      if (err) return h(ErrorBox, { error: err, onRetry: load })
      if (!c) return h(Loading)
      const pre = c.presets.find(x => x.id === preset) || {}
      const paid = preset !== 'say'
      const set = k => v => setForm(x => ({ ...x, [k]: v }))
      const choose = pid => { setPreset(pid); fill(c, pid, form.speed) }
      const save = async () => {
        const body = { preset, voice: form.voice, speed: +form.speed, ...(paid ? { baseUrl: form.baseUrl, model: form.model, key: form.key } : {}) }
        const cfg = await wbPost('/api/video-tts', body)
        setC(cfg); setPreset(cfg.preset); setForm(x => ({ ...x, key: '' }))
        return cfg
      }
      const onSave = async () => { setBusy('save'); try { await save(); toast('配音设置已保存') } catch (e) { notify(e.message) } finally { setBusy('') } }
      const onTest = async () => {
        if (paid && !(await ask({ title: '试听要花一点钱', text: `「${pre.name}」是付费服务。试听会合成一句二十来个字的话，按字数收费，费用直接付给服务商。`, ok: '保存并试听' }))) return
        setBusy('test')
        try { await save(); const r = await wbPost('/api/video-tts/test', {}); setSample(fileUrl(`/api/video-tts/sample?t=${r.t}`)) } catch (e) { notify(e.message) } finally { setBusy('') }
      }
      return h(Card, { title: h(Fragment, null, '配音', ' ', h(Tag, { tone: c.ready ? 'success' : undefined }, c.ready ? '可用' : '还没配好')), sub: '视频的旁白用哪种声音来念。付费服务按字数收费，费用直接付给那家服务商。' },
        h(Field, { label: '用哪家', group: true },
          h(Radios, { name: 'lib-tts', value: preset, onChange: choose, options: c.presets.map(x => ({ value: x.id, label: h('span', null, h('b', null, x.name), h('span', { className: cls('faint') }, `　${x.note}`)) })) })),
        paid ? h(Field, { label: '密钥（API Key）', hint: pre.keyUrl ? h('a', { className: cls('l-link'), href: pre.keyUrl, target: '_blank', rel: 'noreferrer' }, `去 ${String(pre.name).split(' ')[0]} 后台拿密钥`) : undefined },
          h(Input, { type: 'password', autoComplete: 'off', value: form.key, onChange: set('key'), placeholder: preset === c.preset && c.keyMask ? `已保存 ${c.keyMask}，要换就粘贴新的` : '粘贴这家服务的密钥' })) : null,
        paid ? h(Grid, { cols: 3 },
          h(Field, { label: '接口地址' }, h(Input, { value: form.baseUrl, onChange: set('baseUrl'), placeholder: 'https://…/v1' })),
          h(Field, { label: '模型' }, h(Input, { value: form.model, onChange: set('model') })),
          h(Field, { label: '音色' }, h(Input, { value: form.voice, onChange: set('voice') })))
          : h(Field, { label: '音色' }, h(Input, { value: form.voice, onChange: set('voice'), placeholder: 'Tingting' })),
        h(Field, { label: '语速' }, h(Select, { value: form.speed, onChange: set('speed'), options: LIB_SPEEDS })),
        h(Row, null,
          h(Btn, { kind: 'primary', busy: busy === 'save', disabled: Boolean(busy), onClick: onSave }, '保存'),
          h(Btn, { icon: 'play', busy: busy === 'test', disabled: Boolean(busy), onClick: onTest }, busy === 'test' ? '合成中' : '保存并试听')),
        sample ? h('audio', { key: sample, src: sample, controls: true, autoPlay: true, className: cls('l-audio') }) : null)
    }

    // ---- 技能：本机已有的 + 工作台装的，开关给助手用；也能在 GitHub 上搜着装
    const LIB_SKILL_GROUPS = [['ws', '工作台装的'], ['cc', '本机 Claude Code'], ['ag', '本机 Agents']]
    function LibSkillSettings() {
      const list = useData(() => wb('/api/skills'), [])
      const [q, setQ] = useState('')
      const [found, setFound] = useState(null)   // { loading } | { error } | { items }
      const [docs, setDocs] = useState({})       // 技能 id → SKILL.md 的内容
      const [installing, setInstalling] = useState(-1)
      const search = async () => {
        const v = q.trim()
        if (!v) return
        setFound({ loading: true })
        try { const r = /github\.com\//.test(v) ? (await wb(`/api/skills/inspect?url=${enc(v)}`)).skills : await wb(`/api/skills/search?q=${enc(v)}`); setFound({ items: r || [] }) } catch (e) { setFound({ error: e }) }
      }
      const toggle = async (s, on) => { try { await wbPut(`/api/skills/${enc(s.id)}`, { enabled: on }); list.reload() } catch (e) { notify(e.message) } }
      const view = async s => {
        if (docs[s.id] != null) { setDocs(m => { const n = { ...m }; delete n[s.id]; return n }); return }
        try { const r = await wb(`/api/skills/${enc(s.id)}/md`); setDocs(m => ({ ...m, [s.id]: String(r.md || '').slice(0, 20000) })) } catch (e) { notify(e.message) }
      }
      const del = async s => {
        if (!(await ask({ title: `删掉技能「${s.name}」？`, text: '删了要重新搜索安装。', ok: '删掉', danger: true }))) return
        try { await wbDel(`/api/skills/${enc(s.id)}`); toast('已删掉'); list.reload() } catch (e) { notify(e.message) }
      }
      const install = async (x, i) => {
        setInstalling(i)
        try { const sk = await wbPost('/api/skills/install', { repo: x.repo, path: x.path, ref: x.ref }); toast(`装好了：${sk.name}`); list.reload() } catch (e) { notify(e.message) } finally { setInstalling(-1) }
      }
      const all = list.data ?? []
      const row = s => h(Fragment, { key: s.id },
        h('div', { className: cls('l-mrow') },
          h(Switch, { checked: s.enabled, onChange: on => toggle(s, on), label: `打开「${s.name}」` }),
          h('div', { className: cls('l-col') },
            h('b', null, s.name),
            h('span', { className: cls('muted') }, s.description || '没有说明'),
            s.origin ? h('a', { className: cls('l-link', 'faint'), href: s.origin, target: '_blank', rel: 'noreferrer' }, '来源') : null),
          h(Btn, { kind: 'ghost', sm: true, icon: 'eye', onClick: () => view(s) }, docs[s.id] != null ? '收起' : '看说明'),
          s.source === 'ws' ? h(Btn, { kind: 'ghost', sm: true, icon: 'trash', label: '删掉', onClick: () => del(s) }) : null),
        docs[s.id] != null ? h('pre', { className: cls('l-pre') }, docs[s.id]) : null)
      return h('div', { className: cls('stack') },
        h(Alert, null, '技能是做某类事的方法和规则（一个 SKILL.md）。打开的技能会告诉 AI 助手，它做相关的事之前先读一遍。技能里的脚本和命令不会执行，只用文字说明。'),
        h('div', { className: cls('l-filters') },
          h(SearchBox, { value: q, onChange: setQ, onEnter: search, onClear: () => setFound(null), placeholder: '在 GitHub 上找技能：去 AI 味、小红书文案、公众号排版，或贴仓库链接', width: 520 }),
          h(Btn, { kind: 'primary', busy: found?.loading, onClick: search }, '搜索')),
        found ? h(Card, { title: 'GitHub 上找到的', note: '装之前可以点仓库链接看看内容' },
          found.loading ? h(Loading, { text: '在 GitHub 上找…' })
            : found.error ? h(Alert, { tone: 'danger' }, found.error.message)
              : found.items.length ? h('div', { className: cls('l-list') }, found.items.map((x, i) => h('div', { key: `${x.repo}/${x.path}`, className: cls('l-mrow') },
                h('div', { className: cls('l-col') },
                  h('b', null, x.name, x.stars != null ? h('span', { className: cls('faint') }, `　${x.stars}★`) : null),
                  x.description ? h('span', { className: cls('muted') }, x.description) : null,
                  h('a', { className: cls('l-link', 'faint'), href: `https://github.com/${x.repo}/blob/HEAD/${x.path}`, target: '_blank', rel: 'noreferrer' }, `${x.repo}/${x.path}`)),
                h(Btn, { sm: true, icon: 'download', busy: installing === i, disabled: installing >= 0 && installing !== i, onClick: () => install(x, i) }, '安装'))))
                : h('div', { className: cls('center') }, '没搜到，换个关键词（英文效果更好）')) : null,
        !list.data ? (list.error ? h(ErrorBox, { error: list.error, onRetry: list.reload }) : h(Loading))
          : LIB_SKILL_GROUPS.map(([k, name]) => {
            const xs = all.filter(s => s.source === k)
            return h(Card, { key: k, title: name, note: `${xs.filter(s => s.enabled).length} / ${xs.length} 个打开` },
              xs.length ? h('div', { className: cls('l-list') }, xs.map(row)) : h('div', { className: cls('faint') }, k === 'ws' ? '还没有。在上面搜一个装上' : '这台电脑上没有'))
          }),
        h('p', { className: cls('faint', 'l-p') }, '也可以让 AI 助手自己去找：“帮我找个写小红书标题的技能”'))
    }

    // ---- 这一段的样式（颜色只用外观段的变量）
    STYLE_PARTS.push(`
.$-l-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.$-l-chip{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border:0;border-radius:var(--$-r-sm);background:none;box-shadow:inset 0 0 0 .5px var(--$-line-2);color:var(--$-text-2);font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer}
.$-l-chip em{font-style:normal;color:var(--$-text-3);font-size:12px;font-variant-numeric:tabular-nums}
.$-l-chip[aria-pressed=true]{background:var(--$-soft);box-shadow:inset 0 0 0 1px var(--$-text-2);color:var(--$-text);font-weight:500}
.$-l-filters{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.$-l-filters>.$-input{width:auto;max-width:240px}
.$-l-filters>.$-grow{flex:1 1 200px}
.$-l-more{display:flex;justify-content:center;padding:8px 0}
.$-l-pz{display:flex;flex-direction:column;min-width:0;border-radius:var(--$-r-xl);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line);overflow:hidden;cursor:pointer;text-align:left}
.$-l-pz[aria-current=true]{box-shadow:inset 0 0 0 1.5px var(--$-accent)}
.$-l-pz-body{flex:1;display:flex;flex-direction:column;gap:6px;padding:12px 14px 10px}
.$-l-pz-title{font-size:14px;line-height:22px;font-weight:500}
.$-l-pz-foot{margin-top:auto}
.$-l-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-l-gap{display:flex;align-items:flex-start;gap:4px;color:var(--$-accent);font-size:12px;line-height:18px}
.$-l-gap svg{flex:none;margin-top:2px}
.$-l-star[data-on=true]{color:var(--$-warn)}
.$-l-star[data-on=true] svg{fill:currentColor}
.$-l-star[data-on=true] .$-btn{color:var(--$-warn)}
.$-l-cover{position:relative;flex:none;display:flex;align-items:flex-end;aspect-ratio:16/9;padding:30px 12px 10px;overflow:hidden}
.$-l-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.$-l-cover-hero{border-radius:var(--$-r-lg)}
.$-l-cover-t{position:relative;color:var(--$-text);font-size:15px;line-height:22px;font-weight:500;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.$-l-cover-hero .$-l-cover-t{font-size:18px;line-height:26px;font-family:var(--$-font-title)}
.$-l-cover-src,.$-l-cover-cat{position:absolute;top:8px;max-width:58%;padding:1px 8px;border-radius:999px;corner-shape:round;background:var(--$-bg);color:var(--$-text-2);font-size:11px;line-height:17px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-l-cover-src{left:8px}.$-l-cover-cat{right:8px}
.$-l-dhead{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-width:0;font-size:13px;line-height:20px}
.$-l-dtitle{margin:0;font-family:var(--$-font-title);font-size:18px;line-height:26px;font-weight:500}
.$-l-one{padding:10px 12px;border-radius:var(--$-r-md);background:var(--$-soft)}
.$-l-sec{display:flex;flex-direction:column;gap:6px}
.$-l-sec h3{margin:0;color:var(--$-text-2);font-size:13px;line-height:20px;font-weight:500}
.$-l-sec ul{display:flex;flex-direction:column;gap:4px;margin:0;padding-left:20px}
.$-l-sec p,.$-l-p{margin:0}
.$-l-link{color:var(--$-accent);text-decoration:none;overflow-wrap:anywhere}
.$-l-link:hover{text-decoration:underline}
.$-l-make{display:flex;flex-direction:column;gap:8px;padding-top:14px;border-top:.5px solid var(--$-line)}
.$-l-det summary{color:var(--$-text-2);font-size:13px;line-height:20px;cursor:pointer}
.$-l-det[open]>summary{margin-bottom:6px}
.$-l-ev{display:flex;align-items:center;gap:6px;width:100%;min-width:0;padding:4px 6px;border:0;border-radius:var(--$-r-sm);background:none;color:var(--$-text-2);font-size:12px;line-height:18px;text-align:left;cursor:pointer}
.$-l-ev em{flex:1;min-width:0;color:var(--$-text);font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.$-l-ev svg{flex:none}
.$-l-proj{display:flex;align-items:center;gap:12px;width:100%;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.$-l-proj-th{flex:none;width:96px;border-radius:var(--$-r-md);overflow:hidden}
.$-l-proj-th .$-l-cover{padding:6px}
.$-l-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.$-l-srcs{display:flex;flex-wrap:wrap;gap:6px}
.$-l-src{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:var(--$-r-sm);background:var(--$-soft);font-size:12px;line-height:18px}
.$-l-src em{color:var(--$-text-3);font-style:normal}
.$-l-src[data-state=bad]{color:var(--$-danger)}
.$-l-src[data-state=off]{opacity:.55}
.$-l-read{display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:24px}
.$-l-read p{margin:0}
.$-l-big{display:flex;align-items:center;justify-content:center;border-radius:var(--$-r-lg);background:var(--$-soft);overflow:hidden}
.$-l-big img{max-width:100%;max-height:min(52vh,460px);object-fit:contain}
.$-l-list{display:flex;flex-direction:column}
.$-l-mrow{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:.5px solid var(--$-line)}
.$-l-mrow:last-child{border-bottom:0}
.$-l-col{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}
.$-l-mtext{margin:-2px -4px;padding:2px 4px;border-radius:var(--$-r-xs);overflow-wrap:anywhere;cursor:text}
.$-l-group{margin-top:6px;color:var(--$-text-3);font-size:12px;line-height:18px}
.$-l-addrow{padding-top:12px;border-top:.5px solid var(--$-line)}
.$-l-pre{max-height:360px;margin:0;padding:12px;overflow:auto;border-radius:var(--$-r-md);background:var(--$-soft);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
.$-l-audio{width:100%}
@media (hover:hover){
.$-l-chip:hover,.$-l-ev:hover,.$-l-mtext:hover{background:var(--$-soft)}
.$-l-pz:hover:not([aria-current=true]){box-shadow:inset 0 0 0 .5px var(--$-line-2),var(--$-shadow-1)}
}
`)


    // ---- 3.9 视频和拉片（第 60 段）
    //
    // VideoPage({ id, tab })：导航「视频」进来的这一页。
    //   没有 id：列表，上面两个页签「我的视频」「拉片」（tab: 'videos' | 'breakdown'，没给就用上次停的那个）
    //   id 以「拉片-」开头：一条拉片的详情；别的 id：一条视频的制作页（左边预览和素材，右边和 Claude Code 对话）
    // 接口都在工作台：/api/video…、/api/breakdown…；文件地址 /v/<id>/…（视频文件夹）、/v-poster/<id>（封面）、/b/<id>/…（拉片文件夹）

    Object.assign(ICONS, {
      vmic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
      vcut: ['M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12'],
      vstop: 'M7 7h10v10H7z',
      vlink: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
      vvoice: 'M4 10v4h4l5 4V6L8 10zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11',
    })

    // 小工具
    const vFmtSec = s => { s = Math.round(s || 0); return s < 60 ? `${s} 秒` : `${s / 60 | 0} 分 ${String(s % 60).padStart(2, '0')} 秒` }
    const vFmtSize = n => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round((n || 0) / 1e3) + ' KB')
    const vClock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    const vBig = n => (n == null ? '' : n >= 1e8 ? (n / 1e8).toFixed(1) + ' 亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + ' 万' : String(n))
    const vNum = n => (+n || 0).toFixed(1)
    const vRel = (kind, id, rel) => `/${kind}/${enc(id)}/` + String(rel).split('/').map(enc).join('/')
    /** 视频文件夹里一个文件的地址 */
    const vFile = (id, rel) => fileUrl(vRel('v', id, rel))
    /** 拉片文件夹里一个文件的地址 */
    const bFile = (id, rel) => fileUrl(vRel('b', id, rel))
    const vApi = (id, sub) => `/api/video/${enc(id)}${sub ? '/' + sub : ''}`
    const bApi = (id, sub) => `/api/breakdown/${enc(id)}${sub ? '/' + sub : ''}`
    const bStatLine = s => [['播放', s?.views], ['赞', s?.likes], ['评论', s?.comments], ['收藏', s?.saves], ['转发', s?.shares]].filter(([, n]) => n != null && n !== 0).map(([k, n]) => `${k} ${vBig(n)}`).join(' · ')
    /** 两种形态默认带的剪辑手法；作者动过就不再跟着形态变 */
    const V_DEF_STYLES = { talk: ['jumpcut', 'punch', 'captions', 'keyword'], explain: ['captions'] }
    const V_KIND = { video: ['film', '视频'], audio: ['vmic', '录音'], image: ['image', '图片'] }
    /** 没导出之前看 AI 做好的画面：新开一个浏览器窗口打开预览页（工作台会往里塞 HyperFrames 的运行时） */
    const vOpenPreview = v => window.open(webUrl(vRel('v', v.id, 'index.html')) + `?r=${v.rev || Date.now()}`, '_blank')
    /** 配音设置放在「设置」页里 */
    const vGoTts = () => go('settings', { tab: 'tts' })
    /** 标题上方的返回 */
    const VBack = ({ label, onClick }) => h('button', { type: 'button', className: cls('v-back'), onClick }, h(Icon, { name: 'left', size: 14 }), label)
    const VProgress = ({ pct }) => h('div', { className: cls('v-prog') }, h('i', { style: { width: `${Math.max(0, Math.min(100, pct || 0))}%` } }))
    /** 剪辑手法的开关（可多选） */
    const VChips = ({ list, on, onToggle, disabled }) => h('div', { className: cls('v-chips') }, list.map(x => h('button', {
      key: x.id, type: 'button', className: cls('v-chip'), 'aria-pressed': on.includes(x.id), disabled,
      title: (x.note || '') + (x.from ? `（学自：${x.from}）` : ''), onClick: () => onToggle(x.id),
    }, x.custom ? h(Icon, { name: 'star', size: 12 }) : null, x.name)))
    /** 取一条（视频或拉片）的详情，并在组件卸载后不再写状态 */
    function useVItem(path) {
      const [item, setItem] = useState(null)
      const [err, setErr] = useState(null)
      const alive = useRef(true)
      useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
      const refresh = useCallback(async () => {
        try { const x = await wb(path); if (alive.current) { setItem(x); setErr(null) } } catch (e) { if (alive.current) setErr(e) }
      }, [path])
      useEffect(() => { refresh() }, [refresh])
      return { item, err, refresh, alive }
    }

    function VideoPage({ id, tab }) {
      if (id) return String(id).startsWith('拉片-') ? h(BreakdownDetail, { id }) : h(VideoDetail, { id })
      return h(VideoHome, { tab })
    }

    // ---- 列表页：我的视频 / 拉片
    function VideoHome({ tab }) {
      const [cur, setCur] = useState(() => tab || (lsGet('vtab', 'videos') === 'breakdown' ? 'breakdown' : 'videos'))
      useEffect(() => { if (tab) setCur(tab) }, [tab])
      const pick = k => { setCur(k); lsSet('vtab', k) }
      const vids = useData(() => wb('/api/video'), [])
      const [newOpen, setNewOpen] = useState(false)
      const list = vids.data?.videos ?? []
      // 有视频正在做：隔几秒刷新一下，做完了「制作中」会自己消失
      usePoll(vids.reload, 5000, cur === 'videos' && list.some(v => v.busy))
      return h(Page, {
        title: '视频', width: 1280,
        sub: cur === 'videos' ? '把文章做成短视频，或者把自己录的口播剪成能发的成片' : '把别人的爆款拆开看：每个镜头、结构怎么排、哪些手法能学走',
        actions: cur === 'videos' ? h(Btn, { kind: 'primary', icon: 'plus', onClick: () => setNewOpen(true) }, '新建视频') : null,
      },
      h(Tabs, { value: cur, onChange: pick, options: [{ value: 'videos', label: list.length ? `我的视频 ${list.length}` : '我的视频' }, { value: 'breakdown', label: '拉片' }] }),
      cur === 'videos' ? h(VideoList, { vids, onNew: () => setNewOpen(true) }) : h(BreakdownList),
      newOpen ? h(NewVideoModal, { meta: vids.data, onClose: () => setNewOpen(false) }) : null)
    }

    function VideoList({ vids, onNew }) {
      if (!vids.data) return vids.error ? h(ErrorBox, { error: vids.error, onRetry: vids.reload }) : h(Loading)
      const d = vids.data
      const warn = d.ready ? null : d.missing ? h(VideoSetup, { setup: d.setup, onDone: vids.reload }) : h(Alert, { tone: 'warn' }, d.error)
      if (!d.videos.length) {
        return h(Fragment, null, warn, h(Empty, {
          title: '把文章做成视频',
          body: '选一篇文章，AI 会写代码把它做成短视频：自动出旁白、做动画画面、配音，最后导出 MP4。也可以上传你自己录的口播，让 AI 剪掉废话、配上字幕和画面。',
          action: h(Btn, { kind: 'primary', icon: 'plus', onClick: onNew }, '新建视频'),
        }))
      }
      return h(Fragment, null, warn, h(Thumbs, { min: 200 }, d.videos.map(v => h(Thumb, {
        key: v.id, ratio: '3/4',
        src: v.poster ? fileUrl(`/v-poster/${enc(v.id)}?t=${v.poster}`) : undefined,
        media: v.poster ? undefined : h('span', { className: cls('v-ph') }, h(Icon, { name: 'film', size: 28 })),
        badge: v.busy ? '制作中…' : (v.aspectName || '').split(' ')[0],
        name: v.title,
        meta: [v.modeName, v.sec > 5.5 ? vFmtSec(v.sec) : '', v.renders?.length ? `已导出 ${v.renders.length} 次` : ''].filter(Boolean).join(' · '),
        onClick: () => go('video', { id: v.id }),
      }, h('div', { className: cls('faint') }, [v.fromTitle ? `来自《${v.fromTitle.slice(0, 18)}》` : '', ago(v.updated)].filter(Boolean).join(' · '))))))
    }

    // ---- 视频工具还没装：一键装好（工作台自己下载，不用电脑上有 Node.js），装的时候显示进度
    function VideoSetup({ setup, onDone }) {
      const [st, setSt] = useState(setup ?? { running: false })
      const [starting, setStarting] = useState(false)
      usePoll(async () => {
        try {
          const s = await wb('/api/video-setup')
          setSt(s)
          if (!s.running && s.ok) { toast('视频工具装好了'); onDone() }
        } catch { /* 下一轮再问 */ }
      }, 2000, !!st.running)
      const start = async () => {
        setStarting(true)
        try { setSt(await wbPost('/api/video-setup', {})) } catch (e) { notify(e.message) } finally { setStarting(false) }
      }
      if (st.running) {
        return h(Card, { title: h(Fragment, null, h(Spin, { sm: true }), ' 正在装视频工具') },
          h('p', { className: cls('muted') }, `${st.step || '准备中'}${st.registry ? `（线路：${/npmmirror/.test(st.registry) ? '国内镜像' : 'npm 官方'}）` : ''}`),
          st.log ? h('pre', { className: cls('l-pre') }, st.log) : null,
          h('p', { className: cls('faint') }, '只装一次，以后都能用。装的时候可以先去做别的。'))
      }
      return h(Alert, {
        tone: st.error ? 'danger' : 'warn',
        action: h(Btn, { kind: 'primary', sm: true, icon: 'download', busy: starting, onClick: start }, st.error ? '再装一次' : '一键装好'),
      }, st.error ? `视频工具没装好：${st.error}` : '做视频要先装视频工具（HyperFrames、ffmpeg，一百多 MB），点一下就自动装好，只装一次。')
    }

    // ---- 新建视频：形态、横竖屏、剪辑手法、从哪篇文章来
    function NewVideoModal({ meta, onClose }) {
      const modes = meta?.modes ?? { explain: { name: '图文动画解读', note: 'AI 写旁白、做画面，不用出镜' }, talk: { name: '口播剪辑', note: '你传口播和素材，AI 剪掉废话、配字幕和画面' } }
      const aspects = meta?.aspects ?? { portrait: { name: '竖屏 9:16', fit: '抖音、视频号、小红书' }, landscape: { name: '横屏 16:9', fit: 'B 站、YouTube、公众号' } }
      const styleList = meta?.styles ?? []
      const [arts, setArts] = useState(() => projects.get().filter(p => p.type === 'article'))
      useEffect(() => { projects.reload().then(l => setArts((l ?? []).filter(p => p.type === 'article'))).catch(() => {}) }, [])
      const [mode, setMode] = useState('explain')
      const [aspect, setAspect] = useState('portrait')
      const [from, setFrom] = useState('')
      const [title, setTitle] = useState('')
      const [brief, setBrief] = useState('')
      const [styles, setStyles] = useState(V_DEF_STYLES.explain)
      const [touched, setTouched] = useState(false)
      const [busy, setBusy] = useState(false)
      const pickMode = k => { setMode(k); if (!touched) setStyles(V_DEF_STYLES[k] ?? []) }
      const toggle = k => { setTouched(true); setStyles(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k])) }
      // 口播剪辑优先列视频脚本（口播稿），图文解读优先列普通文章
      const sorted = [...arts].sort((a, b) => (mode === 'talk' ? (b.form === 'script') - (a.form === 'script') : (a.form === 'script') - (b.form === 'script')))
      const create = async () => {
        const name = title.trim(), want = brief.trim()
        if (!from && !name) { notify('选一篇文章，或者起个名字', { tone: 'warn' }); return }
        setBusy(true)
        try {
          const v = await wbPost('/api/video', { title: name, from, mode, aspect, styles })
          if (mode === 'explain') {
            const first = (from ? '把这篇文章做成一条短视频。' : `做一条短视频，主题：${name}。`) + (want ? `\n要求：${want}` : '')
            await wbPost(vApi(v.id, 'run'), { message: first }).catch(e => notify(e.message))
          }
          go('video', { id: v.id })
        } catch (e) { notify(e.message); setBusy(false) }
      }
      return h(Modal, {
        title: '新建视频', width: 560, onClose,
        footer: [h(Btn, { key: 'no', onClick: onClose }, '取消'), h(Btn, { key: 'ok', kind: 'primary', busy, onClick: create }, mode === 'explain' ? '新建并开始做' : '新建')],
      },
      h(Stack, null,
        h(Field, { label: '从哪篇文章来' }, h(Select, {
          value: from, onChange: setFrom,
          options: [{ value: '', label: '不绑定文章（在对话里告诉 AI 做什么）' }, ...sorted.map(p => ({ value: p.id, label: (p.form === 'script' ? '【口播稿】' : '') + p.title }))],
        })),
        h(Field, { label: '做成哪种', group: true, hint: modes[mode]?.note }, h(Seg, { stretch: true, value: mode, onChange: pickMode, options: Object.entries(modes).map(([k, m]) => ({ value: k, label: m.name })) })),
        h(Field, { label: '竖屏还是横屏', group: true, hint: aspects[aspect]?.fit ? `适合${aspects[aspect].fit}` : '' }, h(Seg, { stretch: true, value: aspect, onChange: setAspect, options: Object.entries(aspects).map(([k, a]) => ({ value: k, label: a.name })) })),
        styleList.length ? h(Field, { label: '剪辑手法', group: true, hint: '可以多选，之后还能改。鼠标停上去看说明' }, h(VChips, { list: styleList, on: styles, onToggle: toggle })) : null,
        h(Field, { label: '名字' }, h(Input, { value: title, onChange: setTitle, placeholder: '不填就用文章标题', autoComplete: 'off' })),
        mode === 'explain'
          ? h(Field, { label: '想做成什么样（可不填）' }, h(Textarea, { value: brief, onChange: setBrief, rows: 3, placeholder: '比如：45 秒左右，重点讲价格和怎么买，开头用那个数字抓人' }))
          : h(Alert, null, '建好以后上传口播、录屏、图片这些素材。工作台转好字幕，AI 先给你一份剪辑方案，你点头了再剪。')))
    }

    // ---- 一条视频的制作页
    function VideoDetail({ id }) {
      const { item: v, err, refresh, alive } = useVItem(vApi(id))
      const [uploading, setUploading] = useState(null)   // 正在上传：{ name, pct, left }
      const [shown, setShown] = useState(0)              // 看第几个成片（0 是最新的）
      const audioRef = useRef(null)
      const busy = !!v && (v.run.running || v.render.running || v.voice.running || v.prep.running)
      // 有事在做（AI 改画面、导出、配音、处理素材、上传）就每 1.5 秒看一次进度；组件卸载时 usePoll 自己停
      usePoll(refresh, 1500, busy || uploading != null)
      const newest = v?.renders?.[0]?.file
      useEffect(() => { setShown(0) }, [newest])
      useEffect(() => () => audioRef.current?.pause(), [])
      const back = h(VBack, { label: '视频', onClick: () => go('video', { tab: 'videos' }) })
      if (!v) return err ? h(Page, { crumb: back, title: '视频' }, h(ErrorBox, { error: err, onRetry: refresh })) : h(Loading)

      const act = async fn => { try { await fn(); await refresh() } catch (e) { notify(e.message) } }
      const send = async text => {
        if (v.run.running) { notify('AI 还在做上一件事，等它做完或者先停下', { tone: 'warn' }); return false }
        try { await wbPost(vApi(id, 'run'), { message: text }); await refresh(); return true } catch (e) { notify(e.message); return false }
      }
      const stop = () => act(() => wbPost(vApi(id, 'stop'), {}))
      const rename = async () => {
        const name = (await ask({ title: '改名', input: { value: v.title, placeholder: '视频名字' }, ok: '保存' }))?.trim()
        if (name && name !== v.title) act(() => wbPatch(vApi(id), { title: name }))
      }
      const openDir = file => wbPost(vApi(id, 'open'), file ? { file } : {}).catch(e => notify(e.message))
      const remove = async () => {
        if (!(await ask({ title: `删除「${v.title}」？`, text: '文件夹不会真的删掉，会改名成「_已删除-…」留在原处，这里不再显示。', ok: '删除', danger: true }))) return
        try { await wbDel(vApi(id)); toast('已删除'); go('video', { tab: 'videos' }) } catch (e) { notify(e.message) }
      }
      const render = quality => act(() => wbPost(vApi(id, 'render'), { quality }))
      const stopRender = () => act(() => wbPost(vApi(id, 'render-stop'), {}))
      const voice = async () => {
        const tt = v.tts ?? {}
        if (!tt.ready) { notify('配音服务还没接好：先到设置里把配音的密钥和地址填上', { tone: 'warn', action: { label: '去配音设置', onClick: vGoTts } }); return }
        if (tt.paid) {
          const name = tt.presets?.find(p => p.id === tt.preset)?.name || '付费配音'
          const ok = await ask({ title: '生成配音要花钱', text: `用「${name}」给 ${v.scenes.length} 段旁白配音，共 ${v.voiceChars} 字。这是付费服务，会按字数从你在那家的账户扣费（文字没改过的段不重复收费）。`, ok: '花钱配音' })
          if (!ok) return
        } else toast('用电脑自带的声音配音（免费，比较机械）。想更自然，到设置里接一个付费配音')
        act(() => wbPost(vApi(id, 'voice'), {}))
      }
      // 选了几个文件就一个个传：传完一个，工作台就在后台开始处理它
      const upload = async files => {
        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          if (alive.current) setUploading({ name: f.name, pct: 0, left: files.length - i - 1 })
          try { await uploadFile(f, vApi(id, 'clip'), { onProgress: pct => alive.current && setUploading(u => (u ? { ...u, pct } : u)) }) } catch (e) { notify(`${f.name}：${e.message}`) }
          await refresh()
        }
        if (alive.current) setUploading(null)
      }
      const removeClip = async c => {
        if (!(await ask({ title: `去掉素材「${c.name}」？`, text: '已经剪进成片的地方，要让 AI 重新调一遍。', ok: '去掉', danger: true }))) return
        act(() => wbPost(vApi(id, 'clip-remove'), { clip: c.id }))
      }
      const toggleStyle = k => act(() => wbPost(vApi(id, 'styles'), { styles: v.styles.includes(k) ? v.styles.filter(x => x !== k) : [...v.styles, k] }))
      const removeStyle = async x => {
        if (!(await ask({ title: `删掉存下来的手法「${x.name}」？`, text: '所有视频都不能再选它。想要回来，到那条拉片里再存一次。', ok: '删掉', danger: true }))) return
        act(() => wbDel(`/api/video-style/${enc(x.id)}`))
      }
      const play = rel => { audioRef.current?.pause(); const a = new Audio(vFile(id, rel) + '?t=' + Date.now()); audioRef.current = a; a.play().catch(() => {}) }

      const talk = v.mode === 'talk'
      const sub = [v.modeName, v.aspectName, v.sec > 5.5 ? vFmtSec(v.sec) : '', v.fromTitle ? `来自《${v.fromTitle.slice(0, 16)}》` : ''].filter(Boolean).join(' · ')
      const exportTip = v.render.running ? '正在导出' : v.run.running ? 'AI 还在改画面，等它做完再导出' : '把画面渲染成 MP4'

      // 顶上的进度条：导出、配音
      const r = v.render
      let bar = null
      if (r.running) bar = h(Alert, { action: h(Btn, { sm: true, onClick: stopRender }, '取消') }, `正在导出：${r.stage || ''} ${r.pct || 0}%`, h(VProgress, { pct: r.pct }))
      else if (r.error && r.error !== '已取消') bar = h(Alert, { tone: 'danger' }, r.error)
      else if (v.voice.running) bar = h(Alert, null, `正在生成配音：${v.voice.done || 0} / ${v.voice.total || 0} 段`, h(VProgress, { pct: Math.round(100 * (v.voice.done || 0) / (v.voice.total || 1)) }))
      else if (v.voice.error) bar = h(Alert, { tone: 'danger', action: h(Btn, { sm: true, onClick: vGoTts }, '配音设置') }, `配音没成功：${v.voice.error}`)

      // 预览：有成片就播成片（左右切换几次导出的），没有就给「在浏览器里预览」
      const renders = v.renders ?? []
      const at = Math.min(shown, Math.max(0, renders.length - 1))
      const cur = renders[at]
      const fname = f => String(f).split('/').pop()
      const preview = h(Card, {
        title: '预览', note: renders.length ? `导出过 ${renders.length} 次` : '还没导出成片',
        action: h(Btn, { sm: true, kind: 'ghost', icon: 'eye', tip: '在新窗口里看 AI 做好的画面（不用导出）', onClick: () => vOpenPreview(v) }, '在浏览器里预览'),
      },
      h(Stage, {
        onPrev: at > 0 ? () => setShown(at - 1) : undefined,
        onNext: at < renders.length - 1 ? () => setShown(at + 1) : undefined,
        badge: renders.length > 1 ? (at === 0 ? '最新' : `往前第 ${at} 次`) : undefined,
        caption: cur ? `${fname(cur.file)} · ${vFmtSec(cur.sec)} · ${vFmtSize(cur.size)} · ${ago(cur.t)}` : undefined,
        empty: '还没导出成片。先点右上角「在浏览器里预览」看看画面，满意了再点「导出成片」',
      }, cur ? h('video', { key: cur.file, src: vFile(id, cur.file), controls: true, preload: 'metadata', playsInline: true }) : null),
      cur ? h(Row, null,
        h(Btn, { kind: 'primary', icon: 'download', href: vFile(id, cur.file) + '?dl=1', download: fname(cur.file) }, '下载成片'),
        h(Btn, { kind: 'ghost', icon: 'folder', onClick: () => openDir(cur.file) }, '在访达里看')) : null)

      // 口播剪辑：素材
      const working = v.prep.running || uploading != null
      const clipsCard = !talk ? null : h(Card, { title: '素材', note: v.clips.length ? `${v.clips.length} 个` : '' },
        v.clips.length ? h('div', { className: cls('v-list') }, v.clips.map(c => h('div', { key: c.id, className: cls('v-clip') },
          h('span', { className: cls('v-clip-k') }, h(Icon, { name: V_KIND[c.kind]?.[0] ?? 'file' }), c.id),
          h('div', { className: cls('grow') },
            h('div', { className: cls('v-clip-name') }, c.name),
            h('div', { className: cls('faint') }, [V_KIND[c.kind]?.[1], c.sec ? vFmtSec(c.sec) : '', c.width ? `${c.width}×${c.height}` : '', c.silence ? `停顿共 ${c.silence} 秒` : '', c.kind !== 'image' && !c.hasTranscript ? '没识别出说话' : ''].filter(Boolean).join(' · ')),
            c.text ? h('p', { className: cls('muted', 'clamp2', 'v-clip-text') }, c.text) : null),
          h(Btn, { kind: 'ghost', sm: true, icon: 'trash', label: '去掉这个素材', onClick: () => removeClip(c) })))) : null,
        working ? h(Alert, null, h(Row, null, h(Spin, { sm: true }),
          uploading != null ? `上传中 ${uploading.pct}%：${uploading.name}${uploading.left ? `（后面还有 ${uploading.left} 个）` : ''}` : `${v.prep.stage || '正在处理'}${v.prep.left > 1 ? `（后面还有 ${v.prep.left - 1} 个）` : ''}`),
        uploading != null ? h(VProgress, { pct: uploading.pct }) : null) : null,
        v.prep.error ? h(Alert, { tone: 'danger' }, v.prep.error) : null,
        uploading != null ? null : h(DropZone, {
          onFiles: upload, accept: 'video/*,audio/*,image/*',
          title: v.clips.length ? '再加素材' : '上传口播和素材',
          hint: v.clips.length ? '拖进来，或点一下选' : '口播录像、录音、录屏、图片都行，可以一次选多个。传完会自动转字幕、找出停顿，第一次要多等几分钟',
        }))

      // 口播剪辑：AI 出的剪辑方案，作者点头了再剪
      const plan = v.plan
      const cname = cid => v.clips.find(c => c.id === cid)?.name || cid
      const planCard = !talk || !plan ? null : h(Card, {
        title: '剪辑方案', note: `成片约 ${vFmtSec(plan.total)}${plan.cut ? ` · 明确剪掉 ${vFmtSec(plan.cut)}` : ''}`,
        sub: '不满意就在右边告诉 AI，比如「第二段留着」「开头再短一点」',
      },
      h('ol', { className: cls('v-plan') }, plan.segments.map((x, i) => h('li', { key: i },
        h('span', { className: cls('v-time') }, `${x.clip} ${vNum(x.in)}–${vNum(x.out)}s`), x.say || cname(x.clip), x.note ? h('small', null, x.note) : null))),
      plan.removed?.length ? h('details', { className: cls('v-cut') }, h('summary', null, `剪掉的 ${plan.removed.length} 处`),
        plan.removed.map((x, i) => h('div', { key: i }, h('span', { className: cls('v-time') }, `${x.clip} ${vNum(x.in)}–${vNum(x.out)}s`), h('s', null, x.say), x.note ? h('small', null, x.note) : null))) : null,
      h(Row, null, h(Btn, { kind: 'primary', icon: 'check', disabled: v.run.running, tip: v.run.running ? 'AI 还在做事，等它做完' : '告诉 AI 方案可以，开始剪', onClick: () => send('方案可以，按这个剪吧。') }, '按这个方案剪')))

      // 图文解读：旁白稿
      const scenesCard = talk || !v.scenes.length ? null : h(Card, {
        title: '旁白稿', note: `${v.scenes.length} 段 · ${v.voiceChars} 字 · ${v.voiced ? `已配音 ${v.voiced} 段` : '还没配音'}`,
        sub: '想改旁白，直接在右边告诉 AI；改完要重新生成配音',
      },
      h('ol', { className: cls('v-plan') }, v.scenes.map((s, i) => h('li', { key: i },
        h('div', { className: cls('v-scene') }, h('span', { className: cls('grow') }, s.text),
          s.audio ? h(Fragment, null, h('span', { className: cls('v-time') }, `${vNum(s.sec)}s`), h(Btn, { kind: 'ghost', sm: true, icon: 'play', label: '听这段', onClick: () => play(s.audio) })) : null)))))

      // 剪辑手法：两种形态都能选，点一下就开关
      const customs = (v.styleList ?? []).filter(x => x.custom)
      const stylesCard = h(Card, {
        title: '剪辑手法', note: '改完告诉 AI「按新的手法调一遍」',
        action: customs.length ? h(Menu, { icon: 'more', sm: true, kind: 'ghost', align: 'right', tip: '管理从拉片里存下来的手法', items: [{ title: '存下来的手法' }, ...customs.map(x => ({ key: x.id, label: `删掉「${x.name}」`, icon: 'trash', danger: true, onClick: () => removeStyle(x) }))] }) : null,
      }, h(VChips, { list: v.styleList ?? [], on: v.styles, onToggle: toggleStyle }))

      return h(Page, {
        wide: true, crumb: back, title: h('button', { type: 'button', className: cls('v-title'), title: '点一下改名', onClick: rename }, v.title), sub,
        actions: [
          v.mode === 'explain' ? h(Btn, { key: 'voice', icon: 'vvoice', busy: v.voice.running, disabled: v.run.running || !v.scenes.length, tip: !v.scenes.length ? '还没有旁白稿：先让 AI 把视频做出来' : v.run.running ? 'AI 还在改画面，等它做完' : '给旁白配上声音', onClick: voice }, '生成配音') : null,
          h(Menu, {
            key: 'export', kind: 'primary', icon: 'download', label: '导出成片', align: 'right', disabled: v.render.running || v.run.running, tip: exportTip,
            items: [
              { key: 'standard', label: '标准', note: '一般选这个', onClick: () => render('standard') },
              { key: 'draft', label: '草稿', note: '快，先看看效果', onClick: () => render('draft') },
              { key: 'high', label: '高清', note: '慢一些', onClick: () => render('high') },
            ],
          }),
          h(Menu, {
            key: 'more', icon: 'more', tip: '更多', align: 'right',
            items: [
              { key: 'rename', label: '改名', icon: 'edit', onClick: rename },
              { key: 'open', label: '在访达打开文件夹', icon: 'folder', onClick: () => openDir() },
              v.mode === 'explain' ? { key: 'tts', label: '配音设置', icon: 'vvoice', onClick: vGoTts } : null,
              { sep: true },
              { key: 'del', label: '删除这条视频', icon: 'trash', danger: true, onClick: remove },
            ],
          }),
        ],
      },
      h('div', { className: cls('v-detail') },
        h('div', { className: cls('v-col') }, bar, preview, clipsCard, planCard, scenesCard, stylesCard),
        h(VideoChat, { v, onSend: send, onStop: stop })))
    }

    // ---- 和 Claude Code 对话做视频
    function VideoChat({ v, onSend, onStop }) {
      const [text, setText] = useState('')
      const [sending, setSending] = useState(false)
      const logRef = useRef(null)
      const atEnd = useRef(true)
      const r = v.run
      // 停在最底下时，来了新内容就跟着往下滚；往上翻着看时不打扰
      useLayoutEffect(() => { const el = logRef.current; if (el && atEnd.current) el.scrollTop = el.scrollHeight }, [v.chat.length, r.running, r.steps.length, r.text.length])
      const submit = async q => {
        const s = String(q ?? text).trim()
        if (!s || sending) return
        setSending(true); atEnd.current = true
        const ok = await onSend(s)
        setSending(false)
        if (ok && q === undefined) setText('')
      }
      const talk = v.mode === 'talk'
      const stepText = s => (Array.isArray(s) ? s[1] : s)
      const msg = (m, i) => (m.role === 'me'
        ? h('div', { key: i, className: cls('v-msg', 'v-msg-me') }, m.auto ? h('div', { className: cls('faint') }, '工作台自动发的') : null, h(Md, { text: m.text }))
        : h('div', { key: i, className: cls('v-msg') },
          m.steps?.length ? h('details', { className: cls('v-steps') }, h('summary', null, `做了 ${m.steps.length} 步${m.took ? `，用时 ${vFmtSec(m.took)}` : ''}`),
            m.steps.map((s, j) => h('div', { key: j }, h(Icon, { name: 'check', size: 12 }), h('span', null, stepText(s))))) : null,
          m.error ? h(Alert, { tone: 'danger' }, m.error) : h(Md, { text: m.text || '（没有回复内容）' })))
      const live = !r.running ? null : h('div', { className: cls('v-msg') },
        h('div', { className: cls('v-steps') }, r.steps.length
          ? r.steps.map((s, j) => h('div', { key: j }, j === r.steps.length - 1 ? h(Spin, { sm: true }) : h(Icon, { name: 'check', size: 12 }), h('span', null, stepText(s))))
          : h('div', null, h(Spin, { sm: true }), h('span', null, '在想怎么做…'))),
        r.text ? h(Md, { text: r.text }) : null,
        h('div', { className: cls('faint') }, `已经做了 ${vFmtSec((Date.now() - (r.t || Date.now())) / 1000)}，做一条视频通常要几分钟`))
      const quick = talk ? (v.clips.length && !v.prep.running ? ['看看这些素材，给我一份剪辑方案', '不用问我，直接剪成一条能发的'] : [])
        : ['把这篇文章做成一条 45 秒左右的短视频', '做一条 60 秒的，重点讲结论和关键数字']
      const hello = v.chat.length || r.running ? null : h('div', { className: cls('v-hello') },
        h('b', null, talk ? '先在左边上传素材' : '告诉 AI 想做成什么样'),
        h('span', { className: cls('muted') }, talk ? '素材处理好以后，让 AI 先出一份剪辑方案；你同意了它再剪。' : 'AI 会读文章、写旁白、做动画，做完你在左边直接看。'),
        quick.map(q => h(Btn, { key: q, sm: true, onClick: () => submit(q) }, q)))
      // 用哪个 AI：本机 Claude Code 登录了就用它，不然用 DSH 里的模型；都没有才提示
      const engineName = v.engine === 'cc' ? 'Claude Code' : v.engine === 'api' ? 'DSH 里的模型' : ''
      const ccWarn = v.engine ? '' : '没有能用的 AI：在 DSH「设置 → 模型」里配好模型，或者在设置里装好 Claude Code'
      return h('section', { className: cls('v-chat'), 'aria-label': 'AI 做视频' },
        h('div', { className: cls('v-chat-head') }, h(Icon, { name: 'spark' }), h('b', null, 'AI 做视频'), h('span', { className: cls('faint', 'grow') }, engineName)),
        ccWarn ? h('div', { className: cls('v-chat-warn') }, h(Alert, { tone: 'warn', action: h(Btn, { sm: true, onClick: () => go('settings') }, '去设置') }, ccWarn)) : null,
        h('div', { ref: logRef, className: cls('v-log'), onScroll: e => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 } },
          hello, v.chat.map(msg), live),
        h('div', { className: cls('v-input') },
          h(Textarea, {
            value: text, onChange: setText, rows: 3, placeholder: '说说想怎么改：换开头、调节奏、改配色、加一屏对比……',
            onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!r.running) submit() } },
          }),
          h('div', { className: cls('v-input-bar') }, h('span', { className: cls('faint', 'grow') }, '回车发送，Shift + 回车换行'),
            r.running ? h(Btn, { icon: 'vstop', onClick: onStop }, '停下')
              : h(Btn, { kind: 'primary', icon: 'send', busy: sending, disabled: !text.trim(), onClick: () => submit() }, '发送'))))
    }

    // ---- 拉片列表：贴链接或上传视频开始拉片
    function BreakdownList() {
      const data = useData(() => wb('/api/breakdown'), [])
      const items = data.data?.items ?? []
      usePoll(data.reload, 4000, items.some(b => b.job?.running))
      const [link, setLink] = useState('')
      const [starting, setStarting] = useState(false)
      const [up, setUp] = useState(null)   // 上传进度（百分比），没在传是 null
      const fileRef = useRef(null)
      const alive = useRef(true)
      useEffect(() => () => { alive.current = false }, [])
      const start = async () => {
        const text = link.trim()
        if (!text) { notify('先粘贴一个视频链接', { tone: 'warn' }); return }
        setStarting(true)
        try { const b = await wbPost('/api/breakdown', { text }); if (alive.current) go('video', { id: b.id }) } catch (e) { notify(e.message); if (alive.current) setStarting(false) }
      }
      const upload = async f => {
        setUp(0)
        try { const b = await uploadFile(f, '/api/breakdown/upload', { onProgress: p => alive.current && setUp(p) }); if (alive.current) go('video', { id: b.id }) } catch (e) { notify(`${f.name}：${e.message}`); if (alive.current) setUp(null) }
      }
      const douyin = () => wbPost('/api/breakdown/douyin-window', {}).then(() => toast('已打开抖音窗口：在里面完成验证或登录，然后关掉它')).catch(e => notify(e.message))
      const max = data.data?.maxMinutes ?? 20
      let body
      if (!data.data) body = data.error ? h(ErrorBox, { error: data.error, onRetry: data.reload }) : h(Loading)
      else if (!items.length) body = h(Empty, { title: '把别人的爆款拆开看', body: '贴一条视频链接，工作台会把它下载下来，找出每个镜头、把口播转成文字，再让 AI 写出：开头怎么抓人、结构怎么排、用了哪些剪辑手法。学到的手法可以存下来，做自己的视频时直接选。' })
      else {
        body = h(Thumbs, { min: 200 }, items.map(b => h(Thumb, {
          key: b.id, ratio: '3/4',
          src: b.thumb ? bFile(b.id, 'frames/001.jpg') : undefined,
          media: b.thumb ? undefined : h('span', { className: cls('v-ph') }, h(Icon, { name: 'film', size: 28 })),
          badge: b.platformName || '视频', name: b.title,
          meta: [b.author, b.sec ? vFmtSec(b.sec) : '', bStatLine(b.stats)].filter(Boolean).join(' · '),
          onClick: () => go('video', { id: b.id }),
        }, h(Row, null,
          b.job?.running ? h(Tag, { tone: 'info' }, b.job.stage || '处理中') : b.job?.error ? h(Tag, { tone: 'danger' }, '没成功') : b.done ? h(Tag, { tone: 'success' }, '已拉片') : h(Tag, null, '还没拉完'),
          h('span', { className: cls('faint') }, ago(b.created))))))
      }
      return h(Fragment, null,
        h(Card, { title: '拉一条新的', sub: `支持抖音、YouTube、B 站、TikTok、X 的视频链接，${max} 分钟以内。拿下来的视频只用来分析，不要搬进自己的成片。` },
          h('div', { className: cls('v-urlrow') },
            h('div', { className: cls('grow') }, h(Input, { value: link, onChange: setLink, placeholder: '粘贴视频链接，或者抖音「分享 → 复制链接」得到的那段话', autoComplete: 'off', onKeyDown: e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) start() } })),
            h(Btn, { kind: 'primary', icon: 'vcut', busy: starting, onClick: start }, '开始拉片'),
            h(Btn, { icon: 'upload', busy: up != null, tip: '平台不让下的、自己录的，直接传视频文件', onClick: () => fileRef.current?.click() }, up != null ? `上传中 ${up}%` : '上传视频'),
            h('input', { ref: fileRef, type: 'file', accept: 'video/*', hidden: true, onChange: e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) } })),
          h('p', { className: cls('faint', 'v-note') }, '下载抖音视频时会弹出一个 Chrome 窗口，下完自己关掉。抖音提示要验证或登录时，',
            h('button', { type: 'button', className: cls('v-link'), onClick: douyin }, '点这里打开抖音窗口'), '，处理完关掉它再拉。')),
        body)
    }

    // ---- 一条拉片：左边视频和分镜表，右边结构和手法
    function BreakdownDetail({ id }) {
      const { item: b, err, refresh } = useVItem(bApi(id))
      usePoll(refresh, 2500, !!b?.job?.running)
      const videoRef = useRef(null)
      const back = h(VBack, { label: '拉片', onClick: () => go('video', { tab: 'breakdown' }) })
      if (!b) return err ? h(Page, { crumb: back, title: '拉片' }, h(ErrorBox, { error: err, onRetry: refresh })) : h(Loading)

      const seek = sec => { const el = videoRef.current; if (el) { el.currentTime = (+sec || 0) + 0.05; el.play().catch(() => {}) } }
      const retry = async () => { try { await wbPost(bApi(id, 'retry'), {}); await refresh() } catch (e) { notify(e.message) } }
      const remove = async () => {
        if (!(await ask({ title: '删除这条拉片？', text: '文件夹不会真的删掉，会改名成「_已删除-…」留在原处。', ok: '删除', danger: true }))) return
        try { await wbDel(bApi(id)); toast('已删除'); go('video', { tab: 'breakdown' }) } catch (e) { notify(e.message) }
      }
      const openDir = () => wbPost(bApi(id, 'open'), {}).catch(e => notify(e.message))
      const douyin = () => wbPost('/api/breakdown/douyin-window', {}).then(() => toast('已打开抖音窗口：处理完关掉它，再点「再试一次」')).catch(e => notify(e.message))
      const save = async i => {
        try { const s = await wbPost(bApi(id, 'save-style'), { index: i }); toast(`已存成剪辑手法「${s.name}」，新建视频时可以选`); refresh() } catch (e) { notify(e.message) }
      }

      const a = b.analysis, pace = b.pace ?? {}
      const job = b.job ?? {}
      const status = job.running ? h(Alert, null, h(Row, null, h(Spin, { sm: true }), job.stage || '正在处理'))
        : job.error ? h(Alert, { tone: 'danger', action: h(Row, null, job.needWindow ? h(Btn, { sm: true, onClick: douyin }, '打开抖音窗口') : null, h(Btn, { sm: true, onClick: retry }, '再试一次')) }, job.error) : null

      const shotsCard = !b.shots?.length ? null : h(Card, { title: '分镜表', note: `${b.shots.length} 个镜头，点一行跳到那里` },
        h('div', { className: cls('v-list') }, b.shots.map(s => h('button', { key: s.n, type: 'button', className: cls('v-shot'), onClick: () => seek(s.start) },
          s.frame ? h('img', { src: bFile(id, s.frame), alt: '', loading: 'lazy' }) : h('i', { className: cls('v-noimg') }),
          h('div', { className: cls('grow') },
            h('span', { className: cls('v-time') }, `#${s.n} · ${vClock(s.start)}–${vClock(s.end)} · ${vNum(s.end - s.start)} 秒`),
            [['画面', s.picture], ['口播', s.line], ['屏上字', s.text], ['剪法', s.cut], ['声音', s.sound]].filter(([, x]) => x).map(([k, x]) => h('p', { key: k }, h('b', null, k), x)))))))

      let right
      if (!a) {
        right = h(Card, null, h(Empty, {
          title: job.running ? '正在拉片' : '还没有分析',
          body: job.running ? '下载、找镜头、转文字、AI 分析，一般三五分钟。可以先去做别的，回来再看。' : '点右上角「重新分析」再试一次。',
        }))
      } else {
        right = h(Fragment, null,
          h(Card, { title: '这条视频' }, h('p', { className: cls('v-p') }, a.summary)),
          a.hook ? h(Card, { title: '开头怎么抓人', note: `前 ${a.hook.sec} 秒` }, a.hook.line ? h('blockquote', { className: cls('v-quote') }, a.hook.line) : null, h('p', { className: cls('v-p') }, a.hook.what)) : null,
          a.structure?.length ? h(Card, { title: '结构', note: '点一段跳到那里' },
            h('div', { className: cls('v-bar') }, a.structure.map((x, i) => h('i', { key: i, title: x.part, style: { flex: Math.max(0.6, x.end - x.start), background: chart(i % 6 + 1) } }))),
            h('div', { className: cls('v-struct') }, a.structure.map((x, i) => h('button', { key: i, type: 'button', onClick: () => seek(x.start) },
              h('i', { className: cls('v-sw'), style: { background: chart(i % 6 + 1) } }),
              h('span', { className: cls('v-time') }, `${vClock(x.start)}–${vClock(x.end)}`),
              h('span', null, h('b', null, x.part), ' ', x.what))))) : null,
          h(Card, { title: '节奏', note: '这几个数是算出来的' },
            h(Grid, { min: 110 },
              h(Stat, { label: '镜头数', value: pace.shots ?? 0 }),
              h(Stat, { label: '平均几秒一个镜头', value: pace.avgShot ?? 0 }),
              h(Stat, { label: '前 3 秒镜头数', value: pace.first3 ?? 0 }),
              pace.perMin ? h(Stat, { label: `每分钟${pace.unit || '字'}数`, value: pace.perMin }) : null),
            a.paceNote ? h('p', { className: cls('v-p') }, a.paceNote) : null),
          a.techniques?.length ? h(Card, { title: '能学走的手法', note: '存下来，做自己的视频时可以直接选' },
            h('div', { className: cls('v-list') }, a.techniques.map((x, i) => h('div', { key: i, className: cls('v-tech') },
              h('div', { className: cls('grow') }, h('b', null, x.name), x.note ? h('div', { className: cls('faint') }, x.note) : null, h('p', { className: cls('v-p', 'muted') }, x.spec)),
              x.saved ? h(Btn, { sm: true, icon: 'check', disabled: true }, '已存')
                : h(Btn, { sm: true, kind: 'primary', icon: 'star', onClick: () => save(i) }, '存成手法'))))) : null,
          a.takeaways?.length ? h(Card, { title: '可以借鉴' }, h('ul', { className: cls('v-ul') }, a.takeaways.map((x, i) => h('li', { key: i }, x)))) : null,
          a.avoid?.length ? h(Card, { title: '别照搬' }, h('ul', { className: cls('v-ul') }, a.avoid.map((x, i) => h('li', { key: i }, x)))) : null)
      }

      return h(Page, {
        wide: true, crumb: back, title: b.title,
        sub: [b.platformName, b.author, b.sec ? vFmtSec(b.sec) : '', bStatLine(b.stats)].filter(Boolean).join(' · '),
        actions: [
          b.url ? h(Btn, { key: 'src', kind: 'ghost', icon: 'vlink', onClick: () => window.open(b.url, '_blank', 'noopener') }, '看原视频') : null,
          h(Btn, { key: 'retry', icon: 'refresh', disabled: job.running, tip: job.running ? '还在处理' : '视频已经在了就只重做分析，不然从下载开始', onClick: retry }, '重新分析'),
          h(Menu, { key: 'more', icon: 'more', tip: '更多', align: 'right', items: [
            { key: 'open', label: '在访达打开文件夹', icon: 'folder', onClick: openDir },
            { sep: true },
            { key: 'del', label: '删除这条拉片', icon: 'trash', danger: true, disabled: job.running, tip: job.running ? '还在处理，等它完成再删' : undefined, onClick: remove },
          ] }),
        ],
      },
      status,
      h('div', { className: cls('v-bd') },
        h('div', { className: cls('v-col') },
          b.hasVideo ? h('div', { className: cls('v-bvideo') }, h('video', { ref: videoRef, src: bFile(id, 'source.mp4'), controls: true, preload: 'metadata', playsInline: true, style: { aspectRatio: b.width && b.height ? `${b.width} / ${b.height}` : undefined } })) : null,
          shotsCard),
        h('div', { className: cls('v-col') }, right)))
    }

    STYLE_PARTS.push(`
.$-v-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--$-text-3)}
.$-v-back{display:inline-flex;align-items:center;gap:2px;padding:0;border:0;background:none;color:var(--$-text-2);font:inherit;cursor:pointer}
.$-v-back:hover{color:var(--$-text)}
.$-v-title{padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:text}
.$-v-title:hover{text-decoration:underline dotted var(--$-text-3);text-underline-offset:4px}
.$-v-chips{display:flex;flex-wrap:wrap;gap:6px}
.$-v-chip{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 12px;border:.5px solid var(--$-line-2);border-radius:999px;background:none;color:var(--$-text-2);font:inherit;font-size:13px;cursor:pointer}
.$-v-chip:hover{background:var(--$-soft)}
.$-v-chip[aria-pressed=true]{border-color:var(--$-brand);background:var(--$-brand);color:var(--$-on-brand)}
.$-v-chip:disabled{opacity:.5;cursor:default}
.$-v-prog{height:4px;margin-top:6px;border-radius:2px;background:var(--$-line);overflow:hidden}
.$-v-prog>i{display:block;height:100%;background:var(--$-accent);transition:width .3s}
.$-v-detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,400px);gap:16px;align-items:start}
.$-v-bd{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,1fr);gap:16px;align-items:start}
.$-v-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.$-v-chat{position:sticky;top:0;display:flex;flex-direction:column;height:min(820px,calc(100vh - 140px));min-height:440px;border-radius:var(--$-r-xl);background:var(--$-card);box-shadow:inset 0 0 0 .5px var(--$-card-line);overflow:hidden}
.$-v-chat-head{display:flex;align-items:center;gap:8px;padding:14px 16px 10px;border-bottom:.5px solid var(--$-line)}
.$-v-chat-head b{font-weight:500}
.$-v-chat-warn{padding:10px 16px 0}
.$-v-log{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:14px;padding:12px 16px}
.$-v-msg{min-width:0;font-size:13.5px;line-height:1.65;overflow-wrap:anywhere}
.$-v-msg-me{align-self:flex-end;max-width:88%;padding:8px 12px;border-radius:var(--$-r-lg);background:var(--$-soft)}
.$-v-steps{display:flex;flex-direction:column;gap:4px;margin-bottom:6px;color:var(--$-text-2);font-size:12px;line-height:18px}
.$-v-steps summary{cursor:pointer}
.$-v-steps>div{display:flex;align-items:center;gap:6px}
.$-v-hello{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:8px 0}
.$-v-hello b{font-weight:500}
.$-v-input{display:flex;flex-direction:column;gap:8px;padding:12px 16px;border-top:.5px solid var(--$-line)}
.$-v-input textarea{resize:none}
.$-v-input-bar{display:flex;align-items:center;gap:8px}
.$-v-list{display:flex;flex-direction:column}
.$-v-clip{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-top:.5px solid var(--$-line)}
.$-v-clip:first-child{border-top:0;padding-top:0}
.$-v-clip-k{display:inline-flex;align-items:center;gap:4px;flex:none;min-width:48px;padding-top:2px;color:var(--$-text-2);font-size:12px}
.$-v-clip-name{font-size:13.5px;line-height:20px;overflow-wrap:anywhere}
.$-v-clip-text{margin:2px 0 0}
.$-v-plan{display:flex;flex-direction:column;gap:8px;margin:0;padding-left:20px;font-size:13px;line-height:20px}
.$-v-plan small,.$-v-cut small{display:block;color:var(--$-text-2);font-size:12px;line-height:18px}
.$-v-cut{font-size:13px;line-height:20px}
.$-v-cut summary{color:var(--$-text-2);cursor:pointer}
.$-v-cut>div{padding:4px 0 0 20px}
.$-v-scene{display:flex;align-items:flex-start;gap:8px}
.$-v-time{flex:none;margin-right:8px;color:var(--$-text-3);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.$-v-urlrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.$-v-urlrow>.$-grow{min-width:240px}
.$-v-note{margin:0}
.$-v-link{padding:0;border:0;background:none;color:var(--$-accent);font:inherit;cursor:pointer}
.$-v-link:hover{text-decoration:underline}
.$-v-bvideo{display:flex;justify-content:center;border-radius:var(--$-r-xl);background:var(--$-stage-bg);overflow:hidden}
.$-v-bvideo video{display:block;max-width:100%;max-height:64vh;object-fit:contain}
.$-v-shot{display:flex;gap:12px;width:100%;padding:10px 6px;border:0;border-top:.5px solid var(--$-line);border-radius:var(--$-r-sm);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.$-v-shot:first-child{border-top:0}
.$-v-shot:hover{background:var(--$-soft)}
.$-v-shot img,.$-v-noimg{flex:none;align-self:flex-start;width:84px;border-radius:var(--$-r-sm);background:var(--$-soft)}
.$-v-noimg{height:84px}
.$-v-shot p{margin:2px 0 0;font-size:13px;line-height:1.65}
.$-v-shot p b{display:inline-block;min-width:44px;margin-right:6px;color:var(--$-text-3);font-size:12px;font-weight:500}
.$-v-p{margin:0;font-size:13.5px;line-height:1.7}
.$-v-quote{margin:0;padding:6px 12px;border-left:3px solid var(--$-accent);border-radius:0 var(--$-r-sm) var(--$-r-sm) 0;background:var(--$-soft);font-size:13.5px;line-height:1.7}
.$-v-bar{display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden}
.$-v-bar i{display:block}
.$-v-struct{display:flex;flex-direction:column;gap:2px}
.$-v-struct button{display:flex;align-items:baseline;gap:8px;padding:4px 6px;border:0;border-radius:var(--$-r-sm);background:none;color:inherit;font:inherit;font-size:13px;line-height:1.65;text-align:left;cursor:pointer}
.$-v-struct button:hover{background:var(--$-soft)}
.$-v-struct b{font-weight:500}
.$-v-sw{flex:none;width:8px;height:8px;border-radius:2px;transform:translateY(-1px)}
.$-v-tech{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-top:.5px solid var(--$-line)}
.$-v-tech:first-child{border-top:0;padding-top:0}
.$-v-tech b{font-weight:500}
.$-v-tech .$-v-p{margin-top:4px}
.$-v-ul{margin:0;padding-left:20px;font-size:13.5px;line-height:1.7}
@media (max-width:960px){.$-v-detail,.$-v-bd{grid-template-columns:minmax(0,1fr)}.$-v-chat{position:static;height:560px}}
`)



    /** 左边导航里有哪些页面。项目详情（page: 'project'）不在导航里，打开时「作品」亮着。 */
    const PAGES = [
      { key: 'plaza', label: '选题广场', icon: 'spark', view: PlazaPage },
      { key: 'works', label: '作品', icon: 'file', view: WorksPage },
      { key: 'video', label: '视频', icon: 'film', view: VideoPage },
      { key: 'assets', label: '素材', icon: 'image', view: AssetsPage },
      { key: 'memory', label: 'AI 记忆', icon: 'star', view: MemoryPage },
      { key: 'activity', label: '动态', icon: 'clock', view: ActivityPage },
      { key: 'settings', label: '设置', icon: 'settings', view: SettingsPage },
    ]

    // ================================================================== 4. 挂载（一般不用改）

    let t = key => TEXT.zh[key] ?? key

    function App() {
      const r = useStore(route)
      const [st, setSt] = useState(null)
      const load = useCallback(() => {
        setSt(null)
        api('status').then(s => { if (s.ready) BASE = s.base; setSt(s) }, e => setSt({ ready: false, error: e.message }))
      }, [])
      useEffect(load, [])
      if (!st) return h(Root, null, h(Loading, { text: '正在启动工作台…' }))
      if (!st.ready) return h(Root, null, h(Page, { title: t('panel') }, h(ErrorBox, { error: { message: st.error || '工作台没起来' }, onRetry: load })))
      const view = r.page === 'project' ? ProjectPage : (PAGES.find(p => p.key === r.page) ?? PAGES[1]).view
      const current = r.page === 'project' ? 'works' : r.page
      return h(Shell, {
        title: t('panel'), nav: PAGES, current, onNav: key => go(key),
        navFoot: [h(ProviderPicker, { key: 'm' }), h('p', { key: 'p', className: cls('faint') }, 'AI 用的模型，所有功能共用')],
      }, h(view, { key: `${r.page}:${r.id ?? ''}`, ...r }))
    }
    const PanelIcon = ({ size = 20 }) => h(Icon, { name: 'edit', size })

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
          el.textContent = (THEME.replaceAll('.$-root', ':is(.$-root,.$-embed)') + STYLES + STYLE_PARTS.join('')).replaceAll('$-', `${P}-`)
          document.head.append(el)
          return () => el.remove()
        }, `${ID}: 样式`)
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID, locale: ID }, App))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: ID, order: 30, locale: ID, label: () => t('panel') }, PanelIcon))
      },
    }
  },
})
