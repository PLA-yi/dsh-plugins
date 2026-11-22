// 用 lucide-static 里挑出来的图标生成 web/icons.svg（一个 <symbol> 雪碧图）。新增图标：把名字加进 NAMES，再运行 node tools/icons.mjs
import fs from 'node:fs';
const NAMES = `puzzle panel-left-close panel-left-open paperclip at-sign key-round save square image image-plus palette layout-grid file-text images star history sparkles search plus play package archive download ellipsis pen-line stethoscope send notebook-pen info
wand-sparkles code type paintbrush eraser scissors expand book-open zap message-square trash-2 arrow-up check x crosshair copy external-link folder-open
file-pen-line table-2 kanban calendar mouse-pointer-click frame gallery-horizontal refresh-cw scan-text globe badge-check triangle-alert circle-check cloud
chevron-right chevron-left chevron-down list-tree panel-right-close panel-right-open undo-2 settings loader-circle locate-fixed bookmark link square-pen
image smartphone monitor arrow-left arrow-right zoom-in zoom-out maximize lightbulb gauge file-search newspaper at-sign pin hash tag circle-dot list-checks
film clapperboard mic upload volume-2 captions terminal eye
rotate-ccw clipboard-copy sliders-horizontal bold text-quote message-circle-question pencil-line hammer log-in heading-2 list`.split(/\s+/).filter(Boolean);
const out = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none">'];
for (const n of NAMES) {
  const s = fs.readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8');
  const inner = s.replace(/<!--[\s\S]*?-->/, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  out.push(`<symbol id="i-${n}" viewBox="0 0 24 24">${inner}</symbol>`);
}
out.push('</svg>');
fs.writeFileSync('web/icons.svg', out.join('\n'));
console.log(NAMES.length + ' 个图标');
