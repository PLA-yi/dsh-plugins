// 拉片的页面：贴链接或上传视频开始拉片、拉片列表、单条拉片（左边视频和分镜表，右边结构和手法）。
// 放在「视频」板块里的「拉片」页签下。公用的小工具由 app.js 传进来。
export function mountBreakdown({ $, $$, I, esc, api, toast, main, layer, ago, enc }) {
  const fmtSec = s => { s = Math.round(s || 0); return s < 60 ? `${s} 秒` : `${s / 60 | 0} 分 ${String(s % 60).padStart(2, '0')} 秒`; };
  const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const big = n => n == null ? '' : n >= 1e8 ? (n / 1e8).toFixed(1) + ' 亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + ' 万' : String(n);
  const burl = (id, rel) => `/b/${enc(id)}/` + rel.split('/').map(enc).join('/');
  const statLine = s => [['播放', s.views], ['赞', s.likes], ['评论', s.comments], ['收藏', s.saves], ['转发', s.shares]].filter(([, v]) => v != null && v !== 0).map(([k, v]) => `${k} ${big(v)}`).join(' · ');
  let timer = null;

  /* ---------- 列表（画在「视频」页的内容区里） ---------- */
  async function renderList(el, alive) {
    clearTimeout(timer);
    el.innerHTML = `<div class="bnew"><div class="brow"><input id="burl" placeholder="粘贴视频链接，或者抖音「分享 → 复制链接」得到的那段话" autocomplete="off">
          <button class="btn pri" id="bgo">${I('scissors')}开始拉片</button><label class="btn">${I('upload')}上传视频<input type="file" id="bfile" accept="video/*" hidden></label></div>
        <div class="ty">支持抖音、YouTube、B 站、TikTok、X 的视频链接，20 分钟以内。下载抖音视频时会弹出一个 Chrome 窗口，下完自己关掉。拿下来的视频只用来分析，不要搬进自己的成片。
          <button class="lnk" id="bwin">抖音提示要验证或登录？点这里打开抖音窗口</button></div></div>
      <div id="blist"><div class="ty" style="padding:30px 0;text-align:center">读取中…</div></div>`;
    const go = async () => {
      const text = $('#burl').value.trim(); if (!text) return toast('先粘贴一个视频链接', true);
      $('#bgo').disabled = true;
      try { const b = await api('POST', '/api/breakdown', { text }); location.hash = `#/videos/${enc(b.id)}`; } catch (e) { toast(e.message, true); $('#bgo').disabled = false; }
    };
    $('#bgo').onclick = go; $('#burl').onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#bwin').onclick = () => api('POST', '/api/breakdown/douyin-window', {}).then(() => toast('已打开抖音窗口：在里面完成验证或登录，然后关掉它')).catch(e => toast(e.message, true));
    $('#bfile').onchange = () => {
      const f = $('#bfile').files[0]; if (!f) return;
      toast('上传中…');
      const x = new XMLHttpRequest();
      x.open('POST', `/api/breakdown/upload?name=${enc(f.name)}`); x.setRequestHeader('x-wb-token', window.WB_TOKEN);
      x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} if (x.status >= 400) return toast(j.error || '上传失败', true); location.hash = `#/videos/${enc(j.id)}`; };
      x.onerror = () => toast('上传断了，再试一次', true);
      x.send(f);
    };
    const draw = async () => {
      if (!alive() || !$('#blist')) return;
      let d; try { d = await api('GET', '/api/breakdown'); } catch (e) { $('#blist').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; return; }
      if (!alive() || !$('#blist')) return;
      $('#blist').innerHTML = !d.items.length ? `<div class="vempty">${I('scissors')}<b>把别人的爆款拆开看</b><p>贴一条视频链接，工作台会把它下载下来，找出每个镜头、把口播转成文字，再让 AI 写出：开头怎么抓人、结构怎么排、用了哪些剪辑手法。<br>学到的手法可以存下来，下次做自己的视频时直接选。</p></div>`
        : `<div class="vgrid">${d.items.map(b => `<a class="vcard" href="#/videos/${enc(b.id)}">
          <div class="vthumb">${b.thumb ? `<img src="${burl(b.id, 'frames/001.jpg')}" alt="" loading="lazy">` : `<span class="vph">${I('film')}</span>`}
            <span class="vtag">${esc(b.platformName)}</span>${b.job.running ? `<span class="vbusy">${I('loader-circle', 'spinning')}处理中</span>` : b.job.error ? `<span class="vbusy err">${I('triangle-alert')}没成功</span>` : ''}</div>
          <div class="vinfo"><b>${esc(b.title)}</b><span class="ty">${b.author ? esc(b.author) + ' · ' : ''}${b.sec ? fmtSec(b.sec) : ''}${statLine(b.stats) ? ' · ' + statLine(b.stats) : ''}</span>
            <span class="ty">${b.done ? '已拉片' : b.job.running ? esc(b.job.stage) : '还没拉完'} · ${ago(b.created)}</span></div></a>`).join('')}</div>`;
      if (d.items.some(b => b.job.running)) timer = setTimeout(draw, 4000);
    };
    draw();
  }

  /* ---------- 单条拉片 ---------- */
  async function detail(id) {
    main.onclick = null; clearTimeout(timer);
    let b; try { b = await api('GET', `/api/breakdown/${enc(id)}`); } catch (e) { main.innerHTML = `<div class="top"><div class="crumb"><a href="#/videos">视频</a></div></div><div class="empty-state">${esc(e.message)}</div>`; return; }
    const alive = () => location.hash.startsWith('#/videos/') && decodeURIComponent(location.hash.split('/')[2] || '') === id && document.body.contains($('#bpage'));
    main.innerHTML = `<div class="top"><div class="crumb"><a href="#/videos" id="bback">视频 · 拉片</a>${I('chevron-right')}<b id="btitle"></b></div><span class="ty" id="bsub"></span><div class="sp"></div>
        <button class="icb" id="bdel" data-tip="删除这条拉片">${I('trash-2')}</button><a class="btn" id="bsrc" target="_blank" rel="noopener" hidden>${I('external-link')}看原视频</a>
        <button class="btn" id="bopen">${I('folder-open')}打开文件夹</button><button class="btn" id="bretry">${I('refresh-cw')}重新分析</button></div>
      <div class="bpage" id="bpage"></div>`;
    $('#bback').onclick = () => { try { localStorage.setItem('wb.vtab', 'pull'); } catch {} };
    $('#bdel').onclick = async () => { if (!confirm(`删除这条拉片？\n文件夹不会真的删掉，会改名成「_已删除-…」留在原处。`)) return; try { await api('DELETE', `/api/breakdown/${enc(id)}`); try { localStorage.setItem('wb.vtab', 'pull'); } catch {} location.hash = '#/videos'; } catch (e) { toast(e.message, true); } };
    $('#bopen').onclick = () => api('POST', `/api/breakdown/${enc(id)}/open`, {}).catch(e => toast(e.message, true));
    $('#bretry').onclick = async () => { try { b = await api('POST', `/api/breakdown/${enc(id)}/retry`, {}); key = ''; draw(); poll(); } catch (e) { toast(e.message, true); } };
    let key = '';
    const draw = () => {
      $('#btitle').textContent = b.title;
      $('#bsub').textContent = [b.platformName, b.author, b.sec ? fmtSec(b.sec) : '', statLine(b.stats)].filter(Boolean).join(' · ');
      if (b.url) { $('#bsrc').hidden = false; $('#bsrc').href = b.url; }
      $('#bretry').disabled = b.job.running;
      const k = JSON.stringify([b.job, b.done, b.hasVideo, b.shots.length, b.analysis?.techniques.map(t => t.saved)]);
      if (k === key) return; key = k;
      const a = b.analysis, p = b.pace;
      const stage = b.job.running ? `<div class="vbar">${I('loader-circle', 'spinning')}<span>${esc(b.job.stage)}</span></div>`
        : b.job.error ? `<div class="vbar err">${I('triangle-alert')}<span>${esc(b.job.error)}</span>${b.job.needWindow ? `<button class="tbtn" id="bwin2">打开抖音窗口</button>` : ''}<button class="tbtn" id="bagain">再试一次</button></div>` : '';
      const left = `${stage}
        ${b.hasVideo ? `<div class="bvideo${b.height > b.width ? ' portrait' : ''}"><video id="bv" src="${burl(id, 'source.mp4')}" controls preload="metadata" playsinline></video></div>` : ''}
        ${b.shots.length ? `<section><h4>${I('film')}分镜表<span class="ty">${b.shots.length} 个镜头，点一行跳到那里</span></h4>
          <div class="bshots">${b.shots.map(s => `<div class="bshot" data-t="${s.start}">${s.frame ? `<img src="${burl(id, s.frame)}" alt="" loading="lazy">` : '<i class="noimg"></i>'}
            <div><em>#${s.n} · ${clock(s.start)}–${clock(s.end)} · ${(s.end - s.start).toFixed(1)} 秒</em>
            ${s.picture ? `<p><b>画面</b>${esc(s.picture)}</p>` : ''}${s.line ? `<p><b>口播</b>${esc(s.line)}</p>` : ''}${s.text ? `<p><b>屏上字</b>${esc(s.text)}</p>` : ''}${s.cut ? `<p><b>剪法</b>${esc(s.cut)}</p>` : ''}${s.sound ? `<p><b>声音</b>${esc(s.sound)}</p>` : ''}</div></div>`).join('')}</div></section>` : ''}`;
      const right = !a ? `<div class="vhello">${I('scissors')}<b>${b.job.running ? '正在拉片' : '还没有分析'}</b><span>${b.job.running ? '下载、找镜头、转文字、AI 分析，一般三五分钟。可以先去做别的，回来再看。' : '点右上角「重新分析」再试一次。'}</span></div>`
        : `<section><h4>${I('lightbulb')}这条视频</h4><p class="bp">${esc(a.summary)}</p></section>
          ${a.hook ? `<section><h4>${I('zap')}开头怎么抓人<span class="ty">前 ${a.hook.sec} 秒</span></h4>${a.hook.line ? `<blockquote>${esc(a.hook.line)}</blockquote>` : ''}<p class="bp">${esc(a.hook.what)}</p></section>` : ''}
          ${a.structure.length ? `<section><h4>${I('list-tree')}结构</h4><div class="bbar">${a.structure.map((x, i) => `<i style="flex:${Math.max(0.6, x.end - x.start)}" class="c${i % 6}" data-tip="${esc(x.part)}"></i>`).join('')}</div>
            <div class="bstruct">${a.structure.map((x, i) => `<div data-t="${x.start}"><i class="c${i % 6}"></i><em>${clock(x.start)}–${clock(x.end)}</em><span><b>${esc(x.part)}</b>${esc(x.what)}</span></div>`).join('')}</div></section>` : ''}
          <section><h4>${I('gauge')}节奏<span class="ty">这几个数是算出来的</span></h4>
            <div class="bnums"><div><b>${p.shots}</b><span>个镜头</span></div><div><b>${p.avgShot}</b><span>秒一个镜头</span></div><div><b>${p.first3}</b><span>前 3 秒镜头数</span></div>${p.perMin ? `<div><b>${p.perMin}</b><span>${p.unit}/分钟</span></div>` : ''}</div>
            ${a.paceNote ? `<p class="bp">${esc(a.paceNote)}</p>` : ''}</section>
          ${a.techniques.length ? `<section><h4>${I('wand-sparkles')}能学走的手法<span class="ty">存下来，做自己的视频时可以直接选</span></h4>
            ${a.techniques.map((t, i) => `<div class="btech"><div><b>${esc(t.name)}</b><span class="ty">${esc(t.note)}</span><p>${esc(t.spec)}</p></div>
              <button class="btn${t.saved ? '' : ' pri'}" data-save="${i}" ${t.saved ? 'disabled' : ''}>${I(t.saved ? 'check' : 'bookmark')}${t.saved ? '已存' : '存为手法'}</button></div>`).join('')}</section>` : ''}
          ${a.takeaways.length ? `<section><h4>${I('circle-check')}可以借鉴</h4><ul class="bul">${a.takeaways.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
          ${a.avoid.length ? `<section><h4>${I('triangle-alert')}别照搬</h4><ul class="bul">${a.avoid.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}`;
      const t = $('#bv')?.currentTime || 0;
      $('#bpage').innerHTML = `<div class="bleft">${left}</div><div class="bright">${right}</div>`;
      if (t && $('#bv')) $('#bv').currentTime = t;
      $$('[data-t]', $('#bpage')).forEach(el => el.onclick = () => { const v = $('#bv'); if (v) { v.currentTime = +el.dataset.t + 0.05; v.play().catch(() => {}); } });
      $$('[data-save]', $('#bpage')).forEach(el => el.onclick = async () => { try { const s = await api('POST', `/api/breakdown/${enc(id)}/save-style`, { index: +el.dataset.save }); toast(`已存为剪辑手法「${s.name}」，新建视频时可以选`); b = await api('GET', `/api/breakdown/${enc(id)}`); draw(); } catch (e) { toast(e.message, true); } });
      if ($('#bagain')) $('#bagain').onclick = () => $('#bretry').click();
      if ($('#bwin2')) $('#bwin2').onclick = () => api('POST', '/api/breakdown/douyin-window', {}).then(() => toast('已打开抖音窗口：处理完关掉它，再点「再试一次」')).catch(e => toast(e.message, true));
    };
    let ptimer = null;
    const poll = () => { if (ptimer) return; ptimer = setInterval(async () => {
      if (!alive()) { clearInterval(ptimer); ptimer = null; return; }
      try { b = await api('GET', `/api/breakdown/${enc(id)}`); } catch { return; }
      if (!alive()) return;
      draw(); if (!b.job.running) { clearInterval(ptimer); ptimer = null; }
    }, 2500); };
    draw(); if (b.job.running) poll();
  }
  return { renderList, detail };
}
