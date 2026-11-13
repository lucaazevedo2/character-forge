/* Phone presentation only. Move original nodes: never replace game handlers or write model data. */
(() => {
  'use strict';
  const media = matchMedia('(max-width: 768px), (orientation: landscape) and (max-height: 500px)');
  let current, cleanup = () => {}, queued = false;
  const button = (label, fn, cls = '') => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost ' + cls;
    b.textContent = label; b.title = label; b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b;
  };
  const paths = {
    Select:'M4 3l15 10-7 1-3 7z', Pan:'M7 12V7a2 2 0 014 0v5m0-4V5a2 2 0 014 0v7m0-4a2 2 0 014 0v7c0 5-3 7-7 7-3 0-5-2-7-5l-2-4a2 2 0 013-2l2 2',
    Measure:'M3 8h18v9H3zM7 8v4m5-4v6m5-6v4', Draw:'M4 16L16 4l4 4L8 20H4zM13 7l4 4', More:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    'Combat list':'M4 3l14 14m-1-4l4 4-4 4-4-4M20 3L6 17m1-4l-4 4 4 4 4-4',
    'Character sheet':'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7', Compendium:'M12 5C8 2 4 3 2 4v16c3-2 6-2 10 0 4-2 7-2 10 0V4c-3-1-6-2-10 1zM12 5v15',
    'Token library':'M8 12a4 4 0 100-8 4 4 0 000 8zM2 21v-3c0-5 12-5 12 0v3m1-16c6 0 6 7 0 7m2 3c4 0 5 2 5 6',
    'Scenes & maps':'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16',
    'Fog & lighting':'M8 15c-6-6 2-13 7-9 4 3 2 7 0 9v3H8zM9 21h5M12 1v2M2 9h2m16 0h2',
    'Scene setup':'M6 3v18M12 3v18M18 3v18M3 7h6m0 9h6m0-7h6', Controls:'M6 3v18M12 3v18M18 3v18M3 7h6m0 9h6m0-7h6',
    'Campaign tools':'M4 20l9-9M3 17l4 4M14 3l7 7-4 4-7-7zM4 4l16 16',
    'Exit tabletop':'M10 3H4v18h6M9 12h12m-5-5l5 5-5 5', 'Download backup':'M12 3v12m-5-5l5 5 5-5M4 16v5h16v-5', Undo:'M8 4L3 9l5 5M3 9h10c10 0 10 11 0 11', Redo:'M16 4l5 5-5 5m5-5H11C1 9 1 20 11 20'
  };
  const icon = label => '<svg class="vtt-phone-icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[label]||paths.More)+'"/></svg>';
  function mount(w) {
    const moves = [], made = [], q = s => w.querySelector(s);
    const add = (parent, node) => { parent.append(node); made.push(node); return node; };
    const move = (node, parent) => { if (!node) return; const mark = document.createComment('mobile original position'); node.before(mark); moves.push([node, mark]); parent.append(node); };
    w.classList.add('vtt-phone');
    const bar = q('.vtt-bar'), more = q('.vtt-more'), menu = q('.vtt-more-menu'), summary = more.querySelector('summary');
    const oldSummary = summary.innerHTML; summary.textContent = '⋯'; summary.setAttribute('aria-label', 'More tabletop tools');
    const dock = add(w, document.createElement('nav')); dock.className = 'vtt-phone-dock'; dock.setAttribute('aria-label', 'Map tools');
    const backdrop = add(w, button('Close panel', () => closeAll(), 'vtt-phone-backdrop')); backdrop.hidden = true;
    const head = add(menu, document.createElement('header')); head.className = 'vtt-phone-sheet-header'; head.innerHTML = '<strong>Tools</strong>';
    menu.prepend(head); move(q('[data-shortcuts]'), head); head.append(button('×', () => { more.open = false; }, 'vtt-phone-close'));
    const labels = [], svgIcon = icon;
    for (const [selector, icon, label] of [['[data-tool="select"]','↖','Select'],['[data-tool="pan"]','♧','Pan'],['[data-tool="ruler"]','↔','Measure'],['[data-stage-draw]','✎','Draw']]) {
      const n = q(selector); if (!n) continue;
      labels.push([n, n.innerHTML, n.getAttribute('title'), n.getAttribute('aria-label')]);
      n.innerHTML = '<span aria-hidden="true">'+svgIcon(label)+'</span><small>'+label+'</small>'; n.title = label; n.setAttribute('aria-label', label); move(n, dock);
    }
    const dockMore = button('More', () => { closeAll('more'); more.open = !more.open; }); dockMore.innerHTML = icon('More')+'<small>More</small>'; dock.append(dockMore);
    for (const n of [...q('.vtt-toolbar').querySelectorAll('button'), ...bar.querySelectorAll(':scope > button')]) {
      if (n.closest('.vtt-zoom') || n.matches('[data-inspector-toggle]')) continue;
      move(n, menu);
    }
    move(q('.vtt-presence'), menu); move(q('.vtt-macro-hotbar'), menu);
    for (const n of menu.querySelectorAll(':scope > button')) {
      const label = n.textContent.trim(); n.insertAdjacentHTML('afterbegin', icon(label)); made.push(n.querySelector('.vtt-phone-icon'));
    }
    const layer = q('.vtt-header-layer'), select = q('[data-layer]'); let layerSheet;
    if (layer && select) {
      layerSheet = add(w, document.createElement('section')); layerSheet.className = 'vtt-phone-layer'; layerSheet.hidden = true;
      const h = document.createElement('header'); h.className = 'vtt-phone-sheet-header'; h.innerHTML = '<strong>Map layer</strong>'; h.append(button('×', () => { layerSheet.hidden = true; })); layerSheet.append(h);
      move(layer, layerSheet);
      select.size = select.options.length;
      const chip = add(bar, button('▱ '+select.value+' ⌄', () => { closeAll('layer'); layerSheet.hidden = !layerSheet.hidden; }, 'vtt-phone-layer-chip'));
      const update = () => { chip.textContent = '▱ '+select.value+' ⌄'; layerSheet.hidden = true; };
      select.addEventListener('change', update); made.push({remove:()=>{select.removeEventListener('change',update);select.removeAttribute('size');}});
    }
    const stat = add(q('.vtt-title'), document.createElement('small')); stat.className = 'vtt-phone-status'; stat.setAttribute('role', 'status');
    // Keep the original status sources alive, including asynchronous save/connection updates.
    const sync = () => {
      const online = q('.vtt-people > summary')?.textContent.trim() || 'Local';
      const saved = q('[data-status]')?.textContent.trim() || '';
      const role = w.classList.contains('vtt-dm') ? 'DM' : 'Player';
      const value = online+' · '+role+' · '+saved.replace(/^Saved in this browser$/,'saved locally');
      if (stat.textContent !== value) stat.textContent = value;
      stat.title = value;
      const active = window.ForgeTabletop?.state?.()?.tool;
      if (active) dock.querySelector('[data-stage-draw]')?.classList.toggle('chosen', active === 'draw');
      const panels = [more.open && 'more', layerSheet && !layerSheet.hidden && 'layer', w.classList.contains('inspector-open') && 'inspector', w.classList.contains('scenes-open') && 'scenes', q('.vtt-play-drawer:not([hidden])') && 'chat'].filter(Boolean);
      const newest = panels.find(p => !previous.includes(p));
      if (newest && panels.length > 1) closeAll(newest);
      previous = panels; const open = panels.length > 0;
      if (backdrop.hidden === open) backdrop.hidden = !open;
      w.classList.toggle('vtt-phone-sheet-open', open);
      const warning = q('.vtt-asset-warning');
      if (warning && !warning.querySelector('.vtt-phone-dismiss')) { const dismiss = button('×', () => { warning.hidden = true; }, 'vtt-phone-dismiss'); dismiss.setAttribute('aria-label','Dismiss image warning'); warning.append(dismiss); made.push(dismiss); }
    };
    // Repaint the existing renderer after CSS resizes the map; camera/model state is untouched.
    const resize = new ResizeObserver(() => { window.ForgeTabletop?.redraw(); window.ForgeVTTStage?.invalidate(); });
    resize.observe(q('.vtt-viewport'));
    let previous = [];
    function closeAll(except) {
      if (except !== 'more') more.open = false;
      if (except !== 'layer' && layerSheet) layerSheet.hidden = true;
      if (except !== 'inspector' && w.classList.contains('inspector-open')) q('[data-inspector-close]')?.click();
      if (except !== 'scenes' && w.classList.contains('scenes-open')) q('.vtt-scenes-close')?.click();
      if (except !== 'chat') q('.vtt-play-drawer:not([hidden]) [data-play-close]')?.click();
    }
    // New listeners handle only presentation; all action buttons retain their original listeners.
    const clicked = e => { if (e.target.closest('.vtt-more-menu button') && !e.target.closest('.vtt-phone-sheet-header')) more.open = false; };
    menu.addEventListener('click', clicked);
    const escape = e => { if (e.key === 'Escape') closeAll(); }; w.addEventListener('keydown', escape);
    const observer = new MutationObserver(() => { observer.disconnect(); sync(); observer.observe(w,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','open']}); });
    sync(); observer.observe(w,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','open']});
    cleanup = () => {
      observer.disconnect(); resize.disconnect(); menu.removeEventListener('click',clicked); w.removeEventListener('keydown',escape);
      for (const [node, mark] of moves.reverse()) { if(mark.parentNode)mark.replaceWith(node); }
      for (const [n, html, title, aria] of labels) { n.innerHTML = html; for(const [k,v] of [['title',title],['aria-label',aria]])v===null?n.removeAttribute(k):n.setAttribute(k,v); }
      summary.innerHTML = oldSummary; summary.removeAttribute('aria-label'); made.forEach(n=>n.remove()); w.classList.remove('vtt-phone','vtt-phone-sheet-open');
    };
  }
  function refresh() {
    queued = false; const w = document.querySelector('.vtt-workspace');
    if (!media.matches || current !== w) { cleanup(); cleanup = () => {}; current = null; }
    if (media.matches && w && !current && w.querySelector('.vtt-stage-tools')) { current = w; mount(w); }
    if (media.matches) for (const d of document.querySelectorAll('dialog[class*="vtt-"][open]')) {
      if (d.dataset.phoneBackdrop) continue; d.dataset.phoneBackdrop = 'true';
      d.addEventListener('click', e => { if (!media.matches || e.target !== d) return; const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close(); });
    }
  }
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(refresh); } };
  new MutationObserver(schedule).observe(document.body, {childList:true,subtree:true});
  media.addEventListener('change',schedule); schedule();
})();
