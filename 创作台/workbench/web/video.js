// 视频板块的页面：视频列表、新建、单条视频的制作页（左边预览和素材，右边和 AI 对话）、配音设置。
// app.js 把公用的小工具传进来（$、图标、请求、提示等），这里不重复写。
export function mountVideo({ $, $$, I, esc, api, wbFetch, toast, main, layer, S, ago, enc, pull }) {
  const fmtSec = s => { s = Math.round(s || 0); return s < 60 ? `${s} 秒` : `${s / 60 | 0} 分 ${String(s % 60).padStart(2, '0')} 秒`; };
  const fmtSize = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB';
  const md = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  const vurl = (id, rel) => `/v/${enc(id)}/` + rel.split('/').map(enc).join('/');
  let playerLoaded = null, listTimer = null;
  const loadPlayer = () => playerLoaded ||= new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/video-rt/hyperframes-player.global.js'; s.onload = ok; s.onerror = () => no(new Error('播放器没加载出来')); document.head.append(s); });

  /* ---------- 列表 ---------- */
  async function list() {
    main.onclick = null;
    // 两个页签：我的视频（自己做的）、拉片（拆别人的）。记住上次停在哪个
    let tab = 'mine'; try { tab = localStorage.getItem('wb.vtab') === 'pull' ? 'pull' : 'mine'; } catch {}
    main.innerHTML = `<div class="top"><div class="crumb"><b>视频</b></div>
        <div class="seg" id="vtabs"><button data-vt="mine" class="${tab === 'mine' ? 'on' : ''}">我的视频</button><button data-vt="pull" class="${tab === 'pull' ? 'on' : ''}">拉片</button></div>
        <span class="ty" id="vcount"></span><div class="sp"></div>
        <button class="btn" id="vtts">${I('volume-2')}配音设置</button><button class="btn pri" id="vnew">${I('plus')}新建视频</button></div>
      <div class="vwrap"><div class="ty" style="padding:40px 0;text-align:center">读取中…</div></div>`;
    $('#vnew').onclick = () => openNew();
    $('#vtts').onclick = () => openTts();
    $('#vtabs').onclick = e => { const k = e.target.closest('[data-vt]')?.dataset.vt; if (!k || k === tab) return; try { localStorage.setItem('wb.vtab', k); } catch {} list(); };
    clearTimeout(listTimer);
    // 新建对话框要用到手法列表，两个页签都先取一次
    let d; try { d = await api('GET', '/api/video'); } catch (e) { $('.vwrap').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; return; }
    S.videoMeta = d;
    if (tab === 'pull') return pull.renderList($('.vwrap'), () => location.hash === '#/videos' && document.body.contains($('#vtabs')));
    $('#vcount').textContent = d.videos.length ? `${d.videos.length} 条` : '';
    const warn = d.ready ? '' : `<div class="unfin">${I('triangle-alert')}<span>${esc(d.error)}</span></div>`;
    if (!d.videos.length) {
      $('.vwrap').innerHTML = `${warn}<div class="vempty">${I('film')}<b>把文章做成视频</b>
        <p>选一篇文章，AI 会写代码把它做成短视频：自动出旁白、做动画画面、配音，最后导出 MP4。<br>也可以上传你自己录的口播，让 AI 配字幕和画面。</p>
        <button class="btn pri" id="vnew2">${I('plus')}新建视频</button></div>`;
      $('#vnew2').onclick = () => openNew(); return;
    }
    $('.vwrap').innerHTML = warn + `<div class="vgrid">${d.videos.map(v => `<a class="vcard" href="#/videos/${enc(v.id)}">
        <div class="vthumb ${v.aspect}">${v.poster ? `<img src="/v-poster/${enc(v.id)}?t=${v.poster}" alt="" loading="lazy">` : `<span class="vph">${I('film')}</span>`}
          <span class="vtag">${esc(v.aspectName.split(' ')[0])}</span>${v.busy ? `<span class="vbusy">${I('loader-circle', 'spinning')}制作中</span>` : ''}</div>
        <div class="vinfo"><b>${esc(v.title)}</b>
          <span class="ty">${esc(v.modeName)}${v.sec > 5.5 ? ` · ${fmtSec(v.sec)}` : ''}${v.renders.length ? ` · 已导出 ${v.renders.length} 次` : ''}</span>
          <span class="ty">${v.fromTitle ? `来自《${esc(v.fromTitle.slice(0, 18))}》 · ` : ''}${ago(v.updated)}</span></div></a>`).join('')}</div>`;
    // 有视频正在做：隔几秒刷新一下列表，做完了「制作中」的标记会自己消失
    clearTimeout(listTimer);
    if (d.videos.some(v => v.busy)) listTimer = setTimeout(() => { if (location.hash === '#/videos' && !layer.innerHTML) list(); }, 5000);
  }

  /* ---------- 新建 ---------- */
  function openNew(preFrom = '') {
    const meta = S.videoMeta || { modes: { explain: { name: '图文动画解读', note: 'AI 写旁白、做画面，不用出镜' }, talk: { name: '口播配画面', note: '你录口播，AI 配字幕和画面' } }, aspects: { portrait: { name: '竖屏 9:16', fit: '抖音、视频号、小红书' }, landscape: { name: '横屏 16:9', fit: 'B 站、YouTube、公众号' } } };
    const arts = S.projects.filter(p => p.type === 'article');
    // 两种形态默认带的剪辑手法；作者动过就不再跟着形态变
    const DEF = { talk: ['jumpcut', 'punch', 'captions', 'keyword'], explain: ['captions'] };
    let mode = 'explain', aspect = 'portrait', from = preFrom || '', busy = false, styles = new Set(DEF.explain), stylesTouched = false;
    const draw = () => {
      const keep = { name: $('#vn')?.value ?? '', brief: $('#vbrief')?.value ?? '' };
      // 口播剪辑优先列视频脚本（口播稿），图文解读优先列普通文章
      const sorted = [...arts].sort((a, b) => (mode === 'talk' ? (b.form === 'script') - (a.form === 'script') : (a.form === 'script') - (b.form === 'script')));
      layer.innerHTML = `<div class="mask"><div class="dlg vdlg"><h3>新建视频</h3><div class="bd">
        <label>用哪篇文章<select id="vfrom"><option value="">不绑定文章（在对话里告诉 AI 做什么）</option>${sorted.map(p => `<option value="${esc(p.id)}" ${from === p.id ? 'selected' : ''}>${p.form === 'script' ? '【口播稿】' : ''}${esc(p.title)}</option>`).join('')}</select></label>
        <div class="vopts">${Object.entries(meta.modes).map(([k, m]) => `<button class="vopt${mode === k ? ' on' : ''}" data-mode="${k}">${I(k === 'talk' ? 'mic' : 'wand-sparkles')}<b>${esc(m.name)}</b><span>${esc(m.note)}</span></button>`).join('')}</div>
        <div class="vopts">${Object.entries(meta.aspects).map(([k, a]) => `<button class="vopt${aspect === k ? ' on' : ''}" data-aspect="${k}">${I(k === 'portrait' ? 'smartphone' : 'monitor')}<b>${esc(a.name)}</b><span>${esc(a.fit)}</span></button>`).join('')}</div>
        ${(S.videoMeta?.styles || []).length ? `<div class="vfield"><span>剪辑手法（可多选，之后还能改）</span><div class="vchips">${S.videoMeta.styles.map(x => `<button class="vchip${styles.has(x.id) ? ' on' : ''}" data-style="${esc(x.id)}" data-tip="${esc(x.note)}">${esc(x.name)}</button>`).join('')}</div></div>` : ''}
        <label>名字<input id="vn" placeholder="不填就用文章标题" value="${esc(keep.name)}" autocomplete="off"></label>
        ${mode === 'explain' ? `<label>想做成什么样（可不填）<textarea id="vbrief" rows="3" placeholder="比如：45 秒左右，重点讲价格和怎么买，开头用那个数字抓人">${esc(keep.brief)}</textarea></label>` : `<div class="ty vhint">${I('info')}建好以后上传口播、录屏、图片这些素材。工作台转好字幕，AI 先给你一份剪辑方案，你点头了再剪。</div>`}
      </div><div class="ft"><button class="btn" data-close>取消</button><button class="btn pri" id="vgo">${I(mode === 'explain' ? 'sparkles' : 'plus')}${mode === 'explain' ? '新建并开始做' : '新建'}</button></div></div></div>`;
      $('#vfrom').onchange = e => { from = e.target.value; };
      $$('[data-mode]', layer).forEach(b => b.onclick = () => { mode = b.dataset.mode; if (!stylesTouched) styles = new Set(DEF[mode]); draw(); });
      $$('[data-style]', layer).forEach(b => b.onclick = () => { const k = b.dataset.style; styles.has(k) ? styles.delete(k) : styles.add(k); stylesTouched = true; b.classList.toggle('on'); });
      $$('[data-aspect]', layer).forEach(b => b.onclick = () => { aspect = b.dataset.aspect; draw(); });
      $('#vgo').onclick = async () => {
        if (busy) return; busy = true; $('#vgo').disabled = true;
        const title = $('#vn').value.trim(), brief = $('#vbrief')?.value.trim() || '';
        if (!from && !title) { toast('选一篇文章，或者起个名字', true); busy = false; $('#vgo').disabled = false; return; }
        try {
          const v = await api('POST', '/api/video', { title, from, mode, aspect, styles: [...styles] });
          if (mode === 'explain') {
            const first = (from ? '把这篇文章做成一条短视频。' : `做一条短视频，主题：${title}。`) + (brief ? `\n要求：${brief}` : '');
            await api('POST', `/api/video/${enc(v.id)}/run`, { message: first }).catch(e => toast(e.message, true));
          }
          layer.innerHTML = ''; location.hash = `#/videos/${enc(v.id)}`;
        } catch (e) { toast(e.message, true); busy = false; $('#vgo').disabled = false; }
      };
    };
    draw();
  }

  /* ---------- 配音设置 ---------- */
  async function openTts(after) {
    let c; try { c = await api('GET', '/api/video-tts'); } catch (e) { return toast(e.message, true); }
    let preset = c.preset;
    const draw = () => {
      const p = c.presets.find(x => x.id === preset), same = preset === c.preset, paid = preset !== 'say';
      const val = k => same ? c[k] : p[k];
      layer.innerHTML = `<div class="mask"><div class="dlg vdlg"><h3>配音设置</h3><div class="bd">
        <div class="ty">视频的旁白用哪种声音来念。付费服务按字数收费，费用直接付给那家服务商。</div>
        <div class="vpres">${c.presets.map(x => `<button class="vopt${preset === x.id ? ' on' : ''}" data-pre="${x.id}"><b>${esc(x.name)}</b><span>${esc(x.note)}</span></button>`).join('')}</div>
        ${paid ? `<label>密钥（API Key）<input id="tkey" type="password" autocomplete="off" placeholder="${same && c.keyMask ? `已保存 ${esc(c.keyMask)}，要换就粘贴新的` : '粘贴这家服务的密钥'}">${p.keyUrl ? `<a class="ty" href="${esc(p.keyUrl)}" target="_blank" rel="noopener">去 ${esc(p.name.split(' ')[0])} 后台拿密钥 ›</a>` : ''}</label>
        <label>接口地址<input id="turl" value="${esc(val('baseUrl'))}" placeholder="https://…/v1"></label>
        <div class="vrow"><label>模型<input id="tmodel" value="${esc(val('model'))}"></label><label>音色<input id="tvoice" value="${esc(val('voice'))}"></label></div>` : `<label>音色<input id="tvoice" value="${esc(val('voice') || 'Tingting')}" placeholder="Tingting"></label>`}
        <label>语速<select id="tspeed">${[0.8, 0.9, 1, 1.1, 1.2, 1.35].map(s => `<option value="${s}" ${(+c.speed || 1) === s ? 'selected' : ''}>${s === 1 ? '正常' : s + ' 倍'}</option>`).join('')}</select></label>
        <audio id="tplay" controls hidden style="width:100%"></audio>
      </div><div class="ft"><button class="btn" id="ttest">${I('play')}保存并试听</button><div class="sp" style="flex:1"></div><button class="btn" data-close>取消</button><button class="btn pri" id="tsave">保存</button></div></div></div>`;
      $$('[data-pre]', layer).forEach(b => b.onclick = () => { preset = b.dataset.pre; draw(); });
      const collect = () => ({ preset, voice: $('#tvoice').value, speed: +$('#tspeed').value, ...(paid ? { baseUrl: $('#turl').value, model: $('#tmodel').value, key: $('#tkey').value } : {}) });
      const save = async () => { c = await api('POST', '/api/video-tts', collect()); preset = c.preset; return c; };
      $('#tsave').onclick = async () => { try { await save(); layer.innerHTML = ''; toast('配音设置已保存'); after?.(); } catch (e) { toast(e.message, true); } };
      $('#ttest').onclick = async () => {
        const b = $('#ttest'); b.disabled = true; b.innerHTML = `<i class="spin"></i>合成中`;
        try { await save(); const r = await api('POST', '/api/video-tts/test', {}); draw(); const a = $('#tplay'); a.hidden = false; a.src = '/api/video-tts/sample?t=' + r.t; a.play().catch(() => {}); }
        catch (e) { toast(e.message, true); b.disabled = false; b.innerHTML = `${I('play')}保存并试听`; }
      };
    };
    draw();
  }

  /* ---------- 单条视频 ---------- */
  async function detail(id) {
    main.onclick = null;
    let v; try { v = await api('GET', `/api/video/${enc(id)}`); } catch (e) { main.innerHTML = `<div class="top"><div class="crumb"><a href="#/videos">视频</a></div></div><div class="empty-state">${esc(e.message)}</div>`; return; }
    const alive = () => location.hash.startsWith('#/videos/') && decodeURIComponent(location.hash.split('/')[2] || '') === id && document.body.contains($('#vpage'));
    main.innerHTML = `<div class="top"><div class="crumb"><a href="#/videos">视频</a>${I('chevron-right')}<b id="vtitle" title="点一下改名">${esc(v.title)}</b></div><span class="ty" id="vsub"></span><div class="sp"></div>
        <button class="icb" id="vdel" data-tip="删除这条视频">${I('trash-2')}</button><button class="btn" id="vopen">${I('folder-open')}打开文件夹</button>
        ${v.mode === 'explain' ? `<button class="btn" id="vvoice">${I('volume-2')}生成配音</button>` : ''}
        <select class="sel" id="vq" data-tip="导出清晰度"><option value="standard">标准</option><option value="draft">草稿（快）</option><option value="high">高清（慢）</option></select>
        <button class="btn pri" id="vrender">${I('download')}导出成片</button></div>
      <div class="vpage" id="vpage">
        <div class="vstage"><div class="vbar" id="vbar" hidden></div>
          <div class="vscreen ${v.aspect}" id="vscreen"></div>
          <div class="vpanels" id="vpanels"></div></div>
        <div class="vchat"><div class="as-h">${I('sparkles')}<b>AI 做视频</b><span class="ty">Claude Code</span></div>
          <div class="as-log" id="vlog"></div>
          <div class="as-in"><div class="inbox"><textarea id="vin" rows="2" placeholder="说说想怎么改：换开头、调节奏、改配色、加一屏对比……"></textarea>
            <div class="inbar"><span class="kh">↵ 发送 · ⇧↵ 换行</span><div class="sp"></div><button class="send" id="vsend" data-tip="发送（回车）">${I('arrow-up')}</button></div></div></div></div>
      </div>`;
    let rev = 0, lastKey = '', timer = null, uploading = null;
    const busy = () => v.run.running || v.render.running || v.voice.running || v.prep.running;

    const drawPlayer = async () => {
      if (rev === v.rev) return; rev = v.rev;
      try { await loadPlayer(); } catch (e) { $('#vscreen').innerHTML = `<div class="ty">${esc(e.message)}</div>`; return; }
      const a = S.videoMeta?.aspects?.[v.aspect] || (v.aspect === 'portrait' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 });
      $('#vscreen').style.aspectRatio = `${a.w} / ${a.h}`;
      $('#vscreen').innerHTML = `<hyperframes-player src="${vurl(id, 'index.html')}?r=${v.rev}" controls></hyperframes-player>`;
    };
    const drawTop = () => {
      $('#vsub').textContent = `${v.modeName} · ${v.aspectName}${v.sec > 5.5 ? ` · ${fmtSec(v.sec)}` : ''}${v.fromTitle ? ` · 来自《${v.fromTitle.slice(0, 16)}》` : ''}`;
      const r = v.render, bar = $('#vbar');
      if (r.running) { bar.hidden = false; bar.innerHTML = `${I('loader-circle', 'spinning')}<span>正在导出：${esc(r.stage || '')} ${r.pct || 0}%</span><i style="--p:${r.pct || 0}%"></i><button class="tbtn" id="vrstop">取消</button>`; $('#vrstop').onclick = () => api('POST', `/api/video/${enc(id)}/render-stop`, {}).then(tick); }
      else if (r.error && r.error !== '已取消') { bar.hidden = false; bar.className = 'vbar err'; bar.innerHTML = `${I('triangle-alert')}<span>${esc(r.error)}</span>`; }
      else if (v.voice.running) { bar.hidden = false; bar.className = 'vbar'; bar.innerHTML = `${I('loader-circle', 'spinning')}<span>正在生成配音：${v.voice.done} / ${v.voice.total} 段</span><i style="--p:${Math.round(100 * v.voice.done / (v.voice.total || 1))}%"></i>`; }
      else if (v.voice.error) { bar.hidden = false; bar.className = 'vbar err'; bar.innerHTML = `${I('triangle-alert')}<span>配音没成功：${esc(v.voice.error)}</span><button class="tbtn" id="vttsfix">配音设置</button>`; $('#vttsfix').onclick = () => openTts(); }
      else { bar.hidden = true; bar.className = 'vbar'; }
      $('#vrender').disabled = v.render.running || v.run.running;
      if ($('#vvoice')) $('#vvoice').disabled = v.voice.running || v.run.running || !v.scenes.length;
    };
    const drawPanels = () => {
      // 口播剪辑：素材列表（可以传多个）、AI 出的剪辑方案
      const KIND = { video: ['clapperboard', '视频'], audio: ['mic', '录音'], image: ['image', '图片'] };
      const working = v.prep.running || uploading != null;
      const talkBox = v.mode !== 'talk' ? '' : `<section><h4>${I('clapperboard')}素材<span class="ty">${v.clips.length ? `${v.clips.length} 个` : ''}</span></h4>
        ${v.clips.length ? `<div class="vclips">${v.clips.map(c => `<div class="vclip"><span class="vck">${I(KIND[c.kind][0])}${esc(c.id)}</span>
            <div><b>${esc(c.name)}</b><span class="ty">${KIND[c.kind][1]}${c.sec ? ` · ${fmtSec(c.sec)}` : ''}${c.width ? ` · ${c.width}×${c.height}` : ''}${c.silence ? ` · 停顿共 ${c.silence} 秒` : ''}${c.kind !== 'image' && !c.hasTranscript ? ' · 没识别出说话' : ''}</span>
            ${c.text ? `<p>${esc(c.text.slice(0, 90))}${c.text.length > 90 ? '…' : ''}</p>` : ''}</div>
            <button class="icb sm" data-delclip="${esc(c.id)}" data-tip="去掉这个素材">${I('trash-2')}</button></div>`).join('')}</div>` : ''}
        ${working ? `<div class="vprep">${I('loader-circle', 'spinning')}<span>${uploading != null ? `上传中 ${uploading}%` : esc(v.prep.stage)}${v.prep.left > 1 ? `（后面还有 ${v.prep.left - 1} 个）` : ''}</span></div>` : ''}
        ${v.prep.error ? `<div class="unfin">${I('triangle-alert')}<span>${esc(v.prep.error)}</span></div>` : ''}
        <label class="vdrop${v.clips.length ? ' sm' : ''}">${I('upload')}<b>${v.clips.length ? '再加素材' : '上传口播和素材'}</b>${v.clips.length ? '' : '<span>口播录像、录音、录屏、图片都行，可以一次选多个。传完会自动转字幕、找出停顿，第一次要多等几分钟</span>'}<input type="file" id="vfile" accept="video/*,audio/*,image/*" multiple hidden></label></section>`;
      const cname = cid => v.clips.find(c => c.id === cid)?.name || cid;
      const plan = v.mode !== 'talk' || !v.plan ? '' : `<section><h4>${I('scissors')}剪辑方案<span class="ty">成片约 ${fmtSec(v.plan.total)}${v.plan.cut ? ` · 明确剪掉 ${fmtSec(v.plan.cut)}` : ''}</span></h4>
        <ol class="vplan">${v.plan.segments.map(x => `<li><em>${esc(x.clip)} ${x.in.toFixed(1)}–${x.out.toFixed(1)}s</em><span>${esc(x.say || cname(x.clip))}${x.note ? `<i>${esc(x.note)}</i>` : ''}</span></li>`).join('')}</ol>
        ${v.plan.removed.length ? `<details class="vcut"><summary>剪掉的 ${v.plan.removed.length} 处</summary>${v.plan.removed.map(x => `<div><em>${esc(x.clip)} ${x.in.toFixed(1)}–${x.out.toFixed(1)}s</em><span><s>${esc(x.say)}</s>${x.note ? `<i>${esc(x.note)}</i>` : ''}</span></div>`).join('')}</details>` : ''}
        <div class="ty">不满意就在右边告诉 AI，比如「第二段留着」「开头再短一点」。</div></section>`;
      // 剪辑手法：两种形态都能选，点一下就开关
      const stylesBox = `<section><h4>${I('wand-sparkles')}剪辑手法<span class="ty">点一下开关；改完告诉 AI「按新的手法调一遍」</span></h4>
        <div class="vchips">${v.styleList.map(x => `<button class="vchip${v.styles.includes(x.id) ? ' on' : ''}" data-style="${esc(x.id)}" data-tip="${esc(x.note)}${x.from ? '（学自：' + esc(x.from) + '）' : ''}">${esc(x.name)}${x.custom ? I('bookmark') : ''}</button>`).join('')}</div></section>`;
      const scenes = v.mode !== 'explain' || !v.scenes.length ? '' : `<section><h4>${I('captions')}旁白稿<span class="ty">${v.scenes.length} 段 · ${v.voiceChars} 字${v.voiced ? ` · 已配音 ${v.voiced} 段` : ' · 还没配音'}</span></h4>
        <ol class="vscenes">${v.scenes.map(s => `<li><span>${esc(s.text)}</span>${s.audio ? `<button class="icb sm" data-play="${esc(s.audio)}" data-tip="听这段">${I('play')}</button><em>${(+s.sec || 0).toFixed(1)}s</em>` : ''}</li>`).join('')}</ol>
        <div class="ty">想改旁白，直接在右边告诉 AI；改完要重新生成配音。</div></section>`;
      const renders = !v.renders.length ? '' : `<section><h4>${I('film')}导出的成片</h4><div class="vrenders">${v.renders.map(r => `<div class="vrender"><video src="${vurl(id, r.file)}" preload="metadata" controls></video>
        <div><b>${esc(r.file.split('/').pop())}</b><span class="ty">${fmtSec(r.sec)} · ${fmtSize(r.size)} · ${ago(r.t)}</span>
        <div class="vrow2"><a class="btn" href="${vurl(id, r.file)}?dl=1">${I('download')}下载</a><button class="tbtn" data-reveal="${esc(r.file)}">${I('folder-open')}在文件夹里看</button></div></div></div>`).join('')}</div></section>`;
      const key = JSON.stringify([v.prep, uploading, v.clips, v.plan, v.styles, v.styleList.length, v.scenes, v.renders]);
      if (key === lastKey) return; lastKey = key;
      $('#vpanels').innerHTML = talkBox + plan + scenes + stylesBox + renders;
      const f = $('#vfile'); if (f) f.onchange = () => f.files.length && uploadAll([...f.files]);
      $$('[data-delclip]', $('#vpanels')).forEach(b => b.onclick = async () => {
        if (!confirm('去掉这个素材？已经剪进成片的地方要让 AI 重新调。')) return;
        try { v = await api('POST', `/api/video/${enc(id)}/clip-remove`, { clip: b.dataset.delclip }); lastKey = ''; draw(); } catch (e) { toast(e.message, true); }
      });
      $$('[data-style]', $('#vpanels')).forEach(b => b.onclick = async () => {
        const k = b.dataset.style, next = v.styles.includes(k) ? v.styles.filter(x => x !== k) : [...v.styles, k];
        try { v = await api('POST', `/api/video/${enc(id)}/styles`, { styles: next }); lastKey = ''; draw(); } catch (e) { toast(e.message, true); }
      });
      $$('[data-play]', $('#vpanels')).forEach(b => b.onclick = () => { const a = new Audio(vurl(id, b.dataset.play) + '?t=' + Date.now()); a.play().catch(() => {}); });
      $$('[data-reveal]', $('#vpanels')).forEach(b => b.onclick = () => api('POST', `/api/video/${enc(id)}/open`, { file: b.dataset.reveal }).catch(e => toast(e.message, true)));
    };
    const msgHtml = m => m.role === 'me' ? `<div class="msg me${m.auto ? ' auto' : ''}">${m.auto ? `<div class="injtag">${I('zap')}工作台自动发的</div>` : ''}${md(m.text)}</div>`
      : `<div class="msg ai">${m.steps?.length ? `<details class="steps"><summary>${I('list-checks')}做了 ${m.steps.length} 步${m.took ? `，用时 ${fmtSec(m.took)}` : ''}</summary>${m.steps.map(s => `<div>${I('check')}<span>${esc(s)}</span></div>`).join('')}</details>` : ''}
          ${m.error ? `<div class="unfin">${I('triangle-alert')}<span>${esc(m.error)}</span></div>` : `<div class="md"><p>${md(m.text || '（没有回复内容）')}</p></div>`}</div>`;
    let chatKey = '';
    const drawChat = () => {
      const log = $('#vlog'), r = v.run;
      const key = JSON.stringify([v.chat.length, r.running, r.steps.length, r.text.length, r.error]);
      if (key === chatKey) return; chatKey = key;
      const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      const live = !r.running ? '' : `<div class="msg ai"><div class="steps on">${r.steps.map((s, i) => `<div>${I(i === r.steps.length - 1 ? 'loader-circle' : 'check', i === r.steps.length - 1 ? 'spinning' : '')}<span>${esc(s[1])}</span></div>`).join('') || `<div>${I('loader-circle', 'spinning')}<span>在想怎么做…</span></div>`}</div>
          ${r.text ? `<div class="md"><p>${md(r.text)}</p></div>` : ''}<div class="stat">${I('gauge')}已经做了 ${fmtSec((Date.now() - r.t) / 1000)}，做一条视频通常要几分钟</div></div>`;
      const empty = v.chat.length || r.running ? '' : `<div class="vhello">${I('sparkles')}<b>${v.mode === 'talk' ? '先在左边上传素材' : '告诉 AI 想做成什么样'}</b><span>${v.mode === 'talk' ? '素材处理好以后，让 AI 先出一份剪辑方案；你同意了它再剪。' : 'AI 会读文章、写旁白、做动画，做完你在左边直接看。'}</span>
          ${(v.mode === 'talk' ? (v.clips.length && !v.prep.running ? ['看看这些素材，给我一份剪辑方案', '不用问我，直接剪成一条能发的'] : []) : ['把这篇文章做成一条 45 秒左右的短视频', '做一条 60 秒的，重点讲结论和关键数字']).map(q => `<button class="tbtn" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
      log.innerHTML = empty + v.chat.map(msgHtml).join('') + live;
      if (atEnd) log.scrollTop = 1e9;
      $$('[data-q]', log).forEach(b => b.onclick = () => send(b.dataset.q));
      const sb = $('#vsend'); sb.innerHTML = r.running ? I('square') : I('arrow-up'); sb.dataset.tip = r.running ? '停止' : '发送（回车）'; sb.classList.toggle('stop', r.running);
    };
    const draw = () => { drawTop(); drawPanels(); drawChat(); drawPlayer(); };
    const tick = async () => {
      if (!alive()) return stopPoll();
      try { v = await api('GET', `/api/video/${enc(id)}`); } catch { return; }
      if (!alive()) return stopPoll();
      draw();
      if (!busy() && uploading == null) stopPoll();
    };
    const stopPoll = () => { clearInterval(timer); timer = null; };
    const poll = () => { if (!timer) timer = setInterval(tick, 1500); };
    const send = async text => {
      text = String(text || '').trim(); if (!text) return;
      if (v.run.running) return toast('AI 还在做上一件事', true);
      try { await api('POST', `/api/video/${enc(id)}/run`, { message: text }); $('#vin').value = ''; await tick(); poll(); $('#vlog').scrollTop = 1e9; }
      catch (e) { toast(e.message, true); }
    };
    // 选了几个文件就一个个传：传完一个，工作台就在后台开始处理它
    const uploadOne = file => new Promise(done => {
      const x = new XMLHttpRequest();
      x.open('POST', `/api/video/${enc(id)}/clip?name=${enc(file.name)}`);
      x.setRequestHeader('x-wb-token', window.WB_TOKEN);
      x.upload.onprogress = e => { if (e.lengthComputable) { uploading = Math.round(100 * e.loaded / e.total); lastKey = ''; drawPanels(); } };
      x.onload = () => { if (x.status >= 400) { let m = '上传失败'; try { m = JSON.parse(x.responseText).error || m; } catch {} toast(`${file.name}：${m}`, true); } done(); };
      x.onerror = () => { toast(`${file.name}：上传断了，再试一次`, true); done(); };
      x.send(file);
    });
    const uploadAll = async files => {
      uploading = 0; lastKey = ''; drawPanels(); poll();
      for (const f of files) { uploading = 0; await uploadOne(f); await tick(); }
      uploading = null; lastKey = ''; await tick(); poll();
    };

    $('#vsend').onclick = () => v.run.running ? api('POST', `/api/video/${enc(id)}/stop`, {}).then(tick) : send($('#vin').value);
    $('#vin').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('#vin').value); } };
    $('#vopen').onclick = () => api('POST', `/api/video/${enc(id)}/open`, {}).catch(e => toast(e.message, true));
    $('#vdel').onclick = async () => {
      if (!confirm(`删除「${v.title}」？\n文件夹不会真的删掉，会改名成「_已删除-…」留在原处，工作台里不再显示。`)) return;
      try { await api('DELETE', `/api/video/${enc(id)}`); toast('已删除'); location.hash = '#/videos'; } catch (e) { toast(e.message, true); }
    };
    $('#vtitle').onclick = async () => { const t = prompt('视频名字', v.title); if (t && t.trim() && t.trim() !== v.title) { try { v = await api('PATCH', `/api/video/${enc(id)}`, { title: t.trim() }); $('#vtitle').textContent = v.title; drawTop(); } catch (e) { toast(e.message, true); } } };
    $('#vrender').onclick = async () => { try { await api('POST', `/api/video/${enc(id)}/render`, { quality: $('#vq').value }); await tick(); poll(); } catch (e) { toast(e.message, true); } };
    if ($('#vvoice')) $('#vvoice').onclick = async () => {
      const t = v.tts;
      if (!t.ready) return openTts(() => tick());
      const name = t.presets.find(p => p.id === t.preset)?.name || '';
      // 付费配音先说清楚要花钱；没改过文字的段不会重做
      if (!confirm(t.paid ? `用「${name}」给 ${v.scenes.length} 段旁白配音，共 ${v.voiceChars} 字。\n这是付费服务，会按字数从你在那家的账户扣费（文字没改过的段不重复收费）。继续吗？` : `用电脑自带的语音给 ${v.scenes.length} 段旁白配音（免费，声音比较机械）。\n想用更自然的声音，先到「配音设置」里接一个付费服务。继续吗？`)) return;
      try { await api('POST', `/api/video/${enc(id)}/voice`, {}); await tick(); poll(); } catch (e) { toast(e.message, true); }
    };
    draw(); $('#vlog').scrollTop = 1e9;
    if (busy()) poll();
  }
  return { list, detail, openNew, openTts };
}
