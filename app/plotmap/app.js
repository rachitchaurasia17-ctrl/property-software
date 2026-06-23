/* PlotMap — client-facing app (Aerocity / Aerotropolis). Framework-free. */
(async function () {
  const PM = window.PM;
  const GEO = await fetch('./geo.json').then(r => r.json());
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IMG_W = PM.W, IMG_H = PM.H;
  const MAP_W = 1380, MAP_H = 921;
  const pct = (v, max) => (v / max * 100) + '%';

  const state = {
    space: 'area', areaId: 'aerotropolis', areaMenuOpen: false,
    section: 'master', mapMode: 'easy', showProps: false,
    catId: null, itemId: null, itemKind: null, itemOpen: false,
    propView: 'browse', selectedId: null, previewId: null,
    filter: { q: '', area: 'all', near: null },
    lightbox: null, present: false
  };

  /* ---------- lookups ---------- */
  const area = () => PM.areas.find(a => a.id === state.areaId) || PM.areas[0];
  const catById = (id) => PM.categories.find(c => c.id === id);
  const roadById = (id) => PM.keyRoads.find(r => r.id === id);
  const zoneById = (id) => PM.zones.find(z => z.id === id);
  const pinById = (id) => PM.pins.find(p => p.id === id);
  const blockById = (id) => PM.blocks.find(b => b.id === id);
  const propById = (id) => PM.properties.find(p => p.id === id);
  const propsInBlock = (bid) => PM.properties.filter(p => p.blockId === bid);
  const itemObj = (id) => roadById(id) || zoneById(id) || pinById(id) || blockById(id);
  const driverName = (id) => (itemObj(id) || {}).name || id;
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const catColor = (id) => (catById(id) || {}).color || '#16356A';

  function itemCategory(id) {
    if (roadById(id)) return 'roads';
    const z = zoneById(id); if (z) return z.cat;
    const p = pinById(id); if (p) return p.cat;
    const b = blockById(id); if (b) return b.area === 'Aerocity' ? 'aerocity-blk' : 'aerot-blk';
    return state.catId;
  }
  function itemKindOf(id) {
    if (roadById(id)) return 'line';
    if (zoneById(id)) return 'zone';
    if (pinById(id)) return 'pin';
    if (blockById(id)) return 'block';
    return 'pin';
  }
  function catItems(catId) {
    if (catId === 'roads') return PM.keyRoads.map(r => ({ id: r.id, name: r.name + (r.verify ? '  · verify' : ''), sub: 'Key road', kind: 'line', color: '#16356A' }));
    if (catId === 'aerocity-blk') return PM.blocks.filter(b => b.area === 'Aerocity').map(b => ({ id: b.id, name: b.name, sub: propsInBlock(b.id).length + ' available', kind: 'block', color: '#2E4A78' }));
    if (catId === 'aerot-blk') return PM.blocks.filter(b => b.area === 'Aerotropolis').map(b => ({ id: b.id, name: b.name, sub: propsInBlock(b.id).length + ' available', kind: 'block', color: '#3F6B4A' }));
    const c = catById(catId) || {};
    return PM.zones.filter(z => z.cat === catId).map(z => ({ id: z.id, name: z.name, sub: c.label, kind: 'zone', color: c.color }))
      .concat(PM.pins.filter(p => p.cat === catId).map(p => ({ id: p.id, name: p.name, sub: c.label, kind: 'pin', color: c.color })));
  }
  const catCount = (id) => catItems(id).length;
  const inCatItem = (id) => state.catId && catItems(state.catId).some(i => i.id === id);

  // default soft zone tints for the easy map
  const redTint = {};
  PM.zones.forEach(z => { const t = z.cat === 'commercial' ? 'tint-commercial' : z.cat === 'green' ? 'tint-green' : z.cat === 'growth' ? 'tint-growth' : ''; if (t) (z.redIdx || []).forEach(i => { redTint[i] = t; }); });

  /* ---------- premium warm photo placeholder ---------- */
  function photo(grad, h, attrs) {
    return `<button class="photo" style="height:${h}px" ${attrs || ''}>
      <span class="ph-fill" style="background:${grad}"></span><span class="ph-tex"></span>
      <span class="ph-cam"></span><span class="ph-soon">Photo coming soon</span></button>`;
  }
  function photosFor(kind, key, n) {
    const grad = kind === 'property' ? PM.grads.property[hash(key) % PM.grads.property.length] : (PM.grads[key] || PM.grads.roads);
    return Array.from({ length: n || 4 }, () => ({ grad }));
  }

  /* ====================== MAP pan/zoom ====================== */
  let tx = 0, ty = 0, scale = 1, panning = false, moved = false, sx, sy, stx, sty, pinch = null, builtSig = '';
  const wrap = () => el('mapwrap'), layer = () => el('maplayer');
  function applyT(anim) { const l = layer(); if (!l) return; l.style.transition = anim ? 'transform .6s cubic-bezier(.4,0,.2,1)' : 'none'; l.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; }
  function fit() { const vp = wrap(); if (!vp || !vp.clientWidth) return; const W = vp.clientWidth, H = vp.clientHeight; const s = Math.min(W / MAP_W, H / MAP_H) * 0.96; scale = s; tx = (W - MAP_W * s) / 2; ty = (H - MAP_H * s) / 2; applyT(true); }
  function focusPx(px, py, sc) { const vp = wrap(); if (!vp || !vp.clientWidth) return; const W = vp.clientWidth, H = vp.clientHeight; const s = Math.min(Math.min(W / MAP_W, H / MAP_H) * sc, 2.6); scale = s; tx = W / 2 - px * s; ty = H / 2 - py * s; applyT(true); }
  function zoomAt(cx, cy, f) { const vp = wrap(); if (!vp) return; const r = vp.getBoundingClientRect(); const ox = cx - r.left, oy = cy - r.top; const ns = Math.max(0.3, Math.min(scale * f, 4)); const k = ns / scale; tx = ox - (ox - tx) * k; ty = oy - (oy - ty) * k; scale = ns; applyT(false); }
  function bindMap() {
    const vp = wrap(); if (!vp || vp._bound) return; vp._bound = true;
    vp.addEventListener('pointerdown', e => { if (e.target.closest('[data-hit],[data-tag]')) { panning = false; return; } panning = true; moved = false; sx = e.clientX; sy = e.clientY; stx = tx; sty = ty; vp.style.cursor = 'grabbing'; });
    window.addEventListener('pointermove', e => { if (!panning) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true; tx = stx + dx; ty = sty + dy; applyT(false); });
    window.addEventListener('pointerup', () => { panning = false; const v = wrap(); if (v) v.style.cursor = 'grab'; });
    vp.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.892); }, { passive: false });
    vp.addEventListener('touchstart', e => { if (e.touches.length === 2) { e.preventDefault(); pinch = { d: td(e), cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 }; panning = false; } }, { passive: false });
    vp.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { e.preventDefault(); const nd = td(e); zoomAt(pinch.cx, pinch.cy, nd / pinch.d); pinch.d = nd; } }, { passive: false });
    vp.addEventListener('touchend', () => pinch = null);
  }
  function td(e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }

  function mapKind() { if (state.section === 'props' && state.propView === 'sector') return 'sector'; return state.mapMode === 'original' ? 'original' : 'easy'; }
  function buildMap() {
    const kind = mapKind(); const sig = state.areaId + '|' + kind; const fresh = sig !== builtSig;
    const l = layer(); if (!l) return;
    l.style.width = MAP_W + 'px'; l.style.height = MAP_H + 'px';
    l.className = 'maplayer ' + (kind === 'original' ? 'original' : kind);
    if (kind === 'original') l.innerHTML = `<img class="orig" src="${PM.assets.original}" alt="Official masterplan">` + mapSVG();
    else if (kind === 'sector') l.innerHTML = `<div class="sector-wrap" style="width:${MAP_W}px;height:${MAP_H}px;background-image:url('${PM.assets.sector}')"></div><div id="pinG"></div><div id="tagG"></div><div id="proofG"></div>`;
    else l.innerHTML = mapSVG();
    builtSig = sig; updateMapOverlays();
    if (fresh) requestAnimationFrame(fit); else applyT(false);
  }
  function mapSVG() {
    const internal = GEO.black.map(d => `<path d="${d}" class="in-road"></path>`).join('');
    const blocks = GEO.red.map((d, i) => `<path d="${d}" class="block-fill ${redTint[i] || ''}" data-red="${i}"></path>`).join('');
    const roadOf = {}; PM.keyRoads.forEach(r => roadOf[r.cyanIdx] = r.id);
    const casings = GEO.cyan.map(d => `<path d="${d}" class="road-casing"></path>`).join('');
    const lines = GEO.cyan.map((d, i) => `<path d="${d}" class="road-line" data-roadpath="${roadOf[i] || ''}"></path>`).join('');
    const hits = GEO.cyan.map((d, i) => roadOf[i] ? `<path d="${d}" class="key-hit" data-hit="road:${roadOf[i]}"></path>` : '').join('');
    return `<svg class="easy-svg" viewBox="${GEO.viewBox}" preserveAspectRatio="xMidYMid meet">
      <rect class="easy-bg" x="0" y="0" width="${IMG_W}" height="${IMG_H}" fill="#E7DDC8"></rect>
      <g>${internal}</g><g id="blockG">${blocks}</g>
      <g id="casingG">${casings}</g><g id="keyG">${lines}</g><g id="keyHit">${hits}</g>
    </svg><div id="pinG"></div><div id="tagG"></div><div id="proofG"></div>`;
  }

  function updateMapOverlays() {
    const kind = mapKind(); const l = layer(); if (!l) return;
    if (kind === 'sector') { renderProof(); return; }
    const sel = state.itemId, selKind = state.itemKind;
    // key roads
    l.querySelectorAll('.road-line').forEach(p => {
      const rid = p.getAttribute('data-roadpath'); p.classList.remove('soft', 'dim');
      if (sel && selKind === 'line') p.classList.toggle(rid === sel ? 'noop' : 'dim', rid !== sel);
      else if (sel) p.classList.add('dim');
      else if (state.catId === 'roads') p.classList.add('soft');
      else if (state.catId) p.classList.add('dim');
    });
    // spotlight road (navy/white/cyan + glow) — premium selected
    const old = l.querySelector('#spotGlow'); if (old) old.remove();
    if (sel && selKind === 'line') {
      const r = roadById(sel), d = GEO.cyan[r.cyanIdx], keyG = l.querySelector('#keyG');
      const ns = 'http://www.w3.org/2000/svg', g = document.createElementNS(ns, 'g'); g.id = 'spotGlow';
      g.innerHTML = `<path d="${d}" style="fill:none;stroke:#28C8E0;stroke-width:30;opacity:.45;stroke-linecap:round;filter:blur(7px)"></path>
        <path d="${d}" style="fill:none;stroke:#0B2552;stroke-width:21;stroke-linecap:round;stroke-linejoin:round"></path>
        <path d="${d}" style="fill:none;stroke:#FFFFFF;stroke-width:13;stroke-linecap:round"></path>
        <path d="${d}" style="fill:none;stroke:#2BD0E6;stroke-width:6.5;stroke-linecap:round"></path>`;
      keyG.appendChild(g);
    }
    // blocks highlight
    const hiRed = new Set();
    if (sel && selKind === 'zone') (zoneById(sel).redIdx || []).forEach(i => hiRed.add(i));
    else if (!sel && ['commercial', 'green', 'growth'].includes(state.catId)) PM.zones.filter(z => z.cat === state.catId).forEach(z => (z.redIdx || []).forEach(i => hiRed.add(i)));
    l.querySelectorAll('.block-fill').forEach(p => { const i = +p.getAttribute('data-red'); p.classList.toggle('hi', hiRed.has(i)); if (hiRed.has(i)) p.style.fill = hexA(catColor(sel ? zoneById(sel).cat : state.catId), .34), p.style.stroke = catColor(sel ? zoneById(sel).cat : state.catId); else { p.style.fill = ''; p.style.stroke = ''; } });
    renderPins(kind);
    renderTags();
    renderProof();
  }

  function renderPins(kind) {
    const g = layer().querySelector('#pinG'); if (!g) return;
    const sel = state.itemId;
    const items = [];
    PM.pins.forEach(p => items.push({ id: p.id, kind: 'pin', at: p.at, name: p.name, color: catColor(p.cat) }));
    PM.zones.forEach(z => items.push({ id: z.id, kind: 'zone', at: z.at, name: z.name, color: catColor(z.cat) }));
    PM.blocks.forEach(b => items.push({ id: b.id, kind: 'block', at: b.at, name: b.name, color: b.area === 'Aerocity' ? '#2E4A78' : '#3F6B4A' }));
    g.innerHTML = items.map(it => {
      let emp = 'normal';
      if (sel) emp = it.id === sel ? 'spot' : 'dim';
      else if (state.catId) emp = inCatItem(it.id) ? 'soft' : 'dim';
      if (kind === 'original' && emp !== 'spot' && emp !== 'soft') return ''; // keep original clean
      const spot = emp === 'spot'; const op = emp === 'dim' ? .3 : 1; const sz = spot ? 30 : (emp === 'soft' ? 24 : 19);
      const showLabel = spot || emp === 'soft'; const ring = spot ? '#2BD0E6' : '#FBF6EA';
      const inner = Math.round(sz * 0.32);
      return `<button class="pin-wrap" data-hit="${it.kind}:${it.id}" style="left:${pct(it.at[0], IMG_W)};top:${pct(it.at[1], IMG_H)};opacity:${op};z-index:${spot ? 22 : 12}">
        <span class="pin-dot" style="width:${sz}px;height:${sz}px;background:${spot ? '#0B2552' : it.color};border:3px solid ${ring};${spot ? 'animation:lmPulse 2s ease-out infinite' : ''}"><i style="width:${inner}px;height:${inner}px"></i></span>
        ${showLabel ? `<span class="pin-chip" style="font-size:${spot ? 13 : 12}px;padding:${spot ? '4px 11px' : '3px 10px'};border:1px solid ${hexA(spot ? '#22A8C4' : it.color, .4)}">${esc(it.name)}</span>` : ''}
      </button>`;
    }).join('');
  }
  function renderTags() {
    const g = layer().querySelector('#tagG'); if (!g) return;
    if (!(state.mapMode === 'easy' && state.showProps && state.section === 'master')) { g.innerHTML = ''; return; }
    g.innerHTML = PM.properties.map(p =>
      `<button class="ptag ${p.id === state.previewId ? 'sel' : ''}" data-tag="${p.id}" style="left:${pct(p.tagAt[0], IMG_W)};top:${pct(p.tagAt[1], IMG_H)}">
        <span class="no">${esc(p.plotNumber)}</span><span class="sz">${esc(p.size)}</span><span class="av">Available</span></button>`).join('');
  }
  function renderProof() {
    const g = layer().querySelector('#proofG'); if (!g) return;
    if (mapKind() !== 'sector') { g.innerHTML = ''; return; }
    const p = propById(state.selectedId); if (!p) { g.innerHTML = ''; return; }
    const x = p.plotAt[0] / 100 * MAP_W, y = p.plotAt[1] / 100 * MAP_H;
    g.innerHTML = `<div class="plot-hi" style="left:${x}px;top:${y}px"></div><div class="plot-dot" style="left:${x}px;top:${y}px"></div><div class="plot-lbl" style="left:${x}px;top:${y}px">Plot ${esc(p.plotNumber)}</div>`;
    focusPx(x, y, 1.9);
  }

  /* ====================== RENDER ROOT ====================== */
  function render() {
    const root = el('app');
    if (state.space === 'area') { root.innerHTML = areaSelectHTML(); bindAreaSelect(); return; }
    root.innerHTML = planHTML(); bindPlan(); bindMap(); buildMap();
  }

  /* ---------- AREA SELECT ---------- */
  function areaSelectHTML() {
    return `<div class="area-select">
      <div class="as-in">
        <div class="as-brand"><span class="logo" style="width:34px;height:34px"><i style="width:13px;height:13px;border-width:3.5px"></i></span>
          <span style="font-size:19px;font-weight:740;letter-spacing:-.3px;color:#FBF6EA">PlotMap</span>
          <span style="font-size:13px;font-weight:600;color:rgba(251,246,234,.55)">Interactive Masterplans</span></div>
        <div class="as-hero">Open a masterplan.</div>
        <div class="as-sub">Walk your client through the location — roads, blocks, landmarks and properties, with photo proof on the map. You explain; PlotMap shows.</div>
      </div>
      <div class="as-grid">
        ${PM.areas.map(a => `<button class="as-tile ${a.live ? '' : 'soon'}" data-area="${a.id}" ${a.live ? '' : 'disabled'}>
          <div><div style="display:flex;align-items:baseline;gap:9px"><span class="as-name">${esc(a.name)}</span>${a.sub ? `<span style="font-size:12.5px;color:#9C957F;font-weight:600">${esc(a.sub)}</span>` : ''}</div>
            ${a.live ? `<div style="display:flex;align-items:center;gap:7px;margin-top:12px"><span style="width:7px;height:7px;border-radius:50%;background:#B07A2B"></span><span style="font-size:13px;font-weight:600;color:#8A5E22;line-height:1.35">${esc(a.hook)}</span></div>` : `<div style="margin-top:12px"><span class="soon-tag">Coming soon</span></div>`}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;padding-top:15px;border-top:1px solid #ECE2CD">
            <span style="font-size:13.5px;color:#5A554A;font-weight:600">${a.live ? 'Interactive masterplan' : 'Map being prepared'}</span>${a.live ? '<span style="font-size:13px;color:#16356A;font-weight:730">Open →</span>' : ''}</div>
        </button>`).join('')}
      </div></div>`;
  }
  function bindAreaSelect() {
    document.querySelectorAll('.as-tile[data-area]').forEach(b => b.addEventListener('click', () => {
      const a = PM.areas.find(x => x.id === b.getAttribute('data-area')); if (!a || !a.live) return;
      Object.assign(state, resetPlan({ space: 'plan', areaId: a.id })); builtSig = ''; render();
    }));
  }
  function resetPlan(extra) { return Object.assign({ section: 'master', mapMode: 'easy', showProps: false, catId: null, itemId: null, itemKind: null, itemOpen: false, propView: 'browse', selectedId: null, previewId: null, areaMenuOpen: false, filter: { q: '', area: 'all', near: null } }, extra || {}); }

  /* ---------- PLAN SHELL ---------- */
  function planHTML() {
    const showBack = state.section !== 'master';
    const split = state.section === 'master' || (state.section === 'props' && state.propView === 'sector');
    return `
    <div class="topbar">
      <div class="brand"><span class="logo"><i></i></span><span class="brand-name">PlotMap</span></div>
      <button class="area-switch" id="areaToggle"><span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.1"><span class="cur">${esc(area().name)}</span><span class="lab">All maps</span></span><span class="caret">▾</span></button>
      <div class="divider"></div>
      <div style="display:flex;gap:3px"><button class="tab ${state.section === 'master' ? 'on' : ''}" id="tabMaster">Masterplan</button><button class="tab ${state.section === 'props' ? 'on' : ''}" id="tabProps">Properties</button></div>
      <div class="spacer"></div>
      ${showBack ? '<button class="back-btn" id="backMaster"><span>‹</span> Back to Masterplan</button>' : ''}
      <button class="present-btn" id="presentBtn">${state.present ? '✕ Exit' : '◧ Presentation'}</button>
      ${state.areaMenuOpen ? areaMenuHTML() : ''}
    </div>
    <div class="body">
      ${split ? `<div class="mapwrap" id="mapwrap"><div class="maplayer" id="maplayer"></div>${mapControlsHTML()}</div><div class="panel" id="panel">${panelHTML()}</div>`
        : `<div class="full" id="full">${fullHTML()}</div>`}
    </div>
    ${state.lightbox ? lightboxHTML() : ''}`;
  }
  function areaMenuHTML() {
    return `<div class="scrim" id="areaScrim"></div><div class="area-menu">
      <div class="h">Switch area</div>
      ${PM.areas.map(a => `<button class="area-row ${a.live ? '' : 'soon'} ${a.id === state.areaId ? 'cur' : ''}" data-sw="${a.id}">
        <span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.15"><span class="nm">${esc(a.name)}</span><span class="mt">${a.sub ? esc(a.sub) + ' · ' : ''}${a.live ? 'Interactive' : 'Coming soon'}</span></span>
        ${a.id === state.areaId ? '<span class="dot-on"></span>' : (a.live ? '' : '<span class="soon-tag">Soon</span>')}</button>`).join('')}
      <div style="height:1px;background:#EEE4CF;margin:7px 8px"></div>
      <button class="area-row" id="viewAll" style="color:#16356A;font-weight:680">View all masterplans →</button></div>`;
  }
  function mapControlsHTML() {
    const showModes = state.section === 'master';
    return `${showModes ? `<div class="mode-switch"><button class="${state.mapMode === 'original' ? 'on' : ''}" data-mode="original">Original Map</button><button class="${state.mapMode === 'easy' ? 'on' : ''}" data-mode="easy">Easy Map</button></div>` : ''}
      ${showModes && state.mapMode === 'easy' ? `<div class="prop-switch ${state.showProps ? 'on' : ''}" id="propSwitch"><span class="lbl">Show Properties</span><span class="knob"><i></i></span></div>` : ''}
      <div class="zoom"><button id="zin">+</button><div style="height:1px;background:#EEE4CF"></div><button id="zout">−</button></div>
      ${state.previewId ? previewHTML() : ''}`;
  }

  /* ---------- RIGHT PANEL ---------- */
  function panelHTML() {
    if (state.section === 'props' && state.propView === 'sector') return sectorPanelHTML();
    if (state.itemOpen && state.itemId) return driverFullHTML();
    if (state.catId) return catItemsPanelHTML();
    return catListPanelHTML();
  }
  function catListPanelHTML() {
    return `<div class="head"><div class="eyebrow">Location masterplan</div><div class="title-xl serif">${esc(area().name)}</div></div>
      <div class="scroll">
        ${PM.categories.map(c => `<button class="cat-btn" data-cat="${c.id}">
          <span class="cat-ico" style="background:${hexA(c.color, .14)};border:1px solid ${hexA(c.color, .45)}"><i style="background:${c.color}"></i></span>
          <span class="lab"><b>${esc(c.label)}</b><span>${catCount(c.id)} item${catCount(c.id) === 1 ? '' : 's'}</span></span><span class="chev">›</span></button>`).join('')}
      </div>`;
  }
  function catItemsPanelHTML() {
    const c = catById(state.catId); const items = catItems(state.catId);
    const sel = state.itemId && items.some(i => i.id === state.itemId) ? state.itemId : null;
    return `<div class="head" style="padding-bottom:14px">
        <button class="backlink" id="backCats">‹ All categories</button>
        <div class="cat-head"><span class="cat-ico" style="width:34px;height:34px;background:${hexA(c.color, .16)};border:1px solid ${hexA(c.color, .45)}"><i style="background:${c.color}"></i></span><div class="t">${esc(c.label)}</div></div>
      </div>
      <div class="scroll">
        ${sel ? previewCardHTML(sel) : ''}
        ${items.map(i => `<button class="item-btn ${i.id === sel ? 'sel' : ''}" data-item="${i.id}" data-kind="${i.kind}">
          <span class="item-dot" style="width:13px;height:${i.kind === 'line' ? '4px' : '13px'};border-radius:${i.kind === 'line' ? '3px' : '50%'};background:${i.color}"></span>
          <span class="lab"><b>${esc(i.name)}</b><span>${esc(i.sub)}</span></span><span class="chev">${i.kind === 'block' ? '→' : '›'}</span></button>`).join('')}
      </div>`;
  }
  // compact select-first preview (no auto full-open)
  function previewCardHTML(id) {
    const kind = itemKindOf(id);
    if (kind === 'block') {
      const b = blockById(id), props = propsInBlock(id);
      return `<div class="preview-card"><div class="pc-cat" style="color:${b.area === 'Aerocity' ? '#2E4A78' : '#3F6B4A'}">${esc(b.area)} Block</div>
        <div class="pc-name">${esc(b.name)}</div>
        <div class="pc-rel"><span>${props.length} available propert${props.length === 1 ? 'y' : 'ies'}</span></div>
        <div class="pc-actions"><button class="pc-primary" data-viewprops="${id}">View Properties</button></div></div>`;
    }
    const it = itemObj(id); const cat = catById(itemCategory(id)) || { label: 'Value driver', color: '#16356A' };
    const ph = photosFor(kind === 'line' ? 'line' : kind, kind === 'line' ? 'roads' : (it.cat || state.catId), 3);
    return `<div class="preview-card">
      <div class="pc-cat" style="color:${cat.color}">${esc(cat.label)}</div>
      <div class="pc-name">${esc(it.name)}${it.verify ? ' <span style="font-size:12px;color:#B6504A">· verify</span>' : ''}</div>
      <div class="pc-strip">${ph.map(p => `<div class="pc-thumb"><span class="ph-fill" style="background:${p.grad};position:absolute;inset:0"></span><span class="ph-tex" style="position:absolute;inset:0"></span></div>`).join('')}</div>
      ${it.related && it.related.length ? `<div class="pc-rel">${it.related.map(r => `<span>${esc(r)}</span>`).join('')}</div>` : ''}
      <div class="pc-actions"><button class="pc-primary" data-photos="${id}">View Photos</button><button class="pc-ghost" data-details="${id}">View Details</button></div>
      ${it.mapsUrl ? `<div class="gmaps-row"><a href="${it.mapsUrl}" target="_blank" rel="noopener">◎ Open in Google Maps</a></div>` : ''}
    </div>`;
  }
  function driverFullHTML() {
    const id = state.itemId, kind = state.itemKind, it = itemObj(id);
    const cat = catById(itemCategory(id)) || { label: 'Value driver', color: '#16356A' };
    const ph = photosFor(kind === 'line' ? 'line' : kind, kind === 'line' ? 'roads' : (it.cat || state.catId), 4);
    return `<div class="head" style="padding-bottom:14px">
        <button class="backlink" id="backDriver">‹ ${esc(cat.label)}</button>
        <div class="serif" style="font-size:28px;font-weight:560;letter-spacing:-.5px;line-height:1.06;margin-top:10px">${esc(it.name)}</div>
        <span class="cat-pill" style="background:${cat.color}">${esc(cat.label)}</span></div>
      <div class="scroll" style="animation:panelIn .24s ease">
        ${photo(ph[0].grad, 210, `data-lb="0"`)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:9px">${ph.slice(1, 3).map((p, i) => photo(p.grad, 96, `data-lb="${i + 1}"`)).join('')}</div>
        ${it.mapsUrl ? `<div class="gmaps-row" style="margin-top:13px"><a href="${it.mapsUrl}" target="_blank" rel="noopener">◎ Open in Google Maps</a></div>` : ''}
        ${it.related && it.related.length ? `<div class="rel-h">Related areas</div><div style="display:flex;flex-wrap:wrap;gap:8px">${it.related.map(r => `<span class="rel-chip">${esc(r)}</span>`).join('')}</div>` : ''}
      </div>`;
  }
  function sectorPanelHTML() {
    const p = propById(state.selectedId); if (!p) return '';
    return `<div class="head" style="padding-bottom:14px">
        <button class="backlink" id="backToProperty">‹ Back to property</button>
        <div class="serif" style="font-size:26px;font-weight:560;margin-top:10px">${esc(p.block)} · Plot ${esc(p.plotNumber)}</div>
        <div style="font-size:13.5px;color:#9C957F;font-weight:600;margin-top:3px">${esc(p.area)} · ${esc(p.size)}</div></div>
      <div class="scroll">
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <span style="font-size:12.5px;font-weight:700;color:#2E4A78;background:#EAF0F8;padding:6px 11px;border-radius:8px">${esc(p.plotType)}</span>
          <span style="font-size:12.5px;font-weight:700;color:#2E4A78;background:#EAF0F8;padding:6px 11px;border-radius:8px">${esc(p.roadFacing)}</span></div>
        ${p.near.length ? `<div class="rel-h">Nearby value drivers</div><div style="display:flex;flex-wrap:wrap;gap:8px">${p.near.map(n => `<span class="driver-chip">◆ ${esc(driverName(n))}</span>`).join('')}</div>` : ''}
        <button class="btn-ghost" id="areaContext" style="width:100%;height:48px;margin-top:20px;color:#16356A">Show Area Context →</button>
        <button class="btn-ghost" id="backMaster2" style="width:100%;height:46px;margin-top:10px">Back to Masterplan</button></div>`;
  }
  function previewHTML() {
    const p = propById(state.previewId); if (!p) return '';
    const g = PM.grads.property[hash(p.id) % PM.grads.property.length];
    return `<div class="preview">
      <div class="pv-ph"><span class="ph-fill" style="background:${g};position:absolute;inset:0"></span><span class="ph-tex" style="position:absolute;inset:0"></span><span class="ph-soon" style="position:absolute;left:0;right:0;bottom:10px;text-align:center;color:rgba(255,255,255,.8);font-size:11px;font-weight:650">Photo coming soon</span></div>
      <div class="pbody">
        <div style="display:flex;align-items:baseline;justify-content:space-between"><span style="font-size:22px;font-weight:800;letter-spacing:-.5px">${esc(p.size)}</span><span style="font-size:12px;font-weight:700;color:#2E4A78;background:#EAF0F8;padding:4px 9px;border-radius:7px">Plot ${esc(p.plotNumber)}</span></div>
        <div style="font-size:13px;color:#7C7565;font-weight:600;margin-top:6px">${esc(p.block)} · ${esc(p.plotType)} · ${esc(p.roadFacing)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${p.near.map(n => `<span style="font-size:11px;font-weight:640;color:#8A5E22;background:#F4E8CF;border:1px solid #E6D5B4;padding:4px 9px;border-radius:8px">◆ ${esc(driverName(n))}</span>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn-primary" style="flex:1;height:44px;font-size:13.5px" data-details-prop="${p.id}">View Details</button><button class="btn-ghost" style="padding:0 14px;height:44px;font-size:13px" data-sector="${p.id}">On Sector Map</button></div>
        <button style="border:none;background:none;color:#9C957F;font-size:12px;font-weight:600;cursor:pointer;margin-top:8px" id="closePreview">Close</button></div></div>`;
  }

  /* ---------- FULL SCREENS ---------- */
  function fullHTML() { return (state.section === 'props' && state.propView === 'detail') ? detailHTML() : browseHTML(); }
  function browseHTML() {
    const f = state.filter; let list = PM.properties.slice();
    if (f.area !== 'all') list = list.filter(p => p.area === f.area);
    if (f.near === 'road') list = list.filter(p => p.near.some(n => roadById(n)));
    if (f.near === 'commercial') list = list.filter(p => p.near.includes('commercial-belt'));
    const q = f.q.trim().toLowerCase(); if (q) list = list.filter(p => (p.plotNumber + ' ' + p.block + ' ' + p.area + ' ' + p.plotType + ' ' + p.roadFacing).toLowerCase().includes(q));
    const chips = [['all', 'All'], ['Aerocity', 'Aerocity'], ['Aerotropolis', 'Aerotropolis']];
    const facets = [['near', 'road', 'Road Facing'], ['near', 'commercial', 'Near Commercial Belt']];
    return `<div class="full-in">
      <div class="eyebrow">Selected properties</div>
      <div class="serif" style="font-size:40px;font-weight:560;letter-spacing:-1px;line-height:1.02;margin-top:6px">${esc(area().name)} Properties</div>
      <div class="chips">${chips.map(([v, l]) => `<button class="chip ${f.area === v ? 'on' : ''}" data-areachip="${v}">${l}</button>`).join('')}</div>
      <div class="search"><span class="ic"></span><input id="pSearch" value="${esc(f.q)}" placeholder="Search plot number, block, road facing…"></div>
      <div class="chips">${facets.map(([k, v, l]) => `<button class="chip ${f[k] === v ? 'on' : ''}" data-facet="${k}:${v}">${l}</button>`).join('')}${f.near ? '<button class="chip" id="clearF" style="border:none;background:none;color:#8A5E22">Clear</button>' : ''}</div>
      ${list.length ? `<div class="grid-cards">${list.map(cardHTML).join('')}</div>` : '<div style="padding:60px;text-align:center;color:#A89F89;font-weight:650">No properties match these filters.</div>'}
    </div>`;
  }
  function cardHTML(p) {
    const g = PM.grads.property[hash(p.id) % PM.grads.property.length]; const near = p.near.map(n => driverName(n))[0];
    return `<div class="pcard">
      <div class="ph-wrap" data-details-prop="${p.id}"><span class="ph-fill" style="background:${g};position:absolute;inset:0"></span><span class="ph-tex" style="position:absolute;inset:0"></span><span class="ph-cam"></span><span class="ph-soon" style="position:absolute;left:0;right:0;bottom:13px;text-align:center;color:rgba(255,255,255,.8);font-size:11px;font-weight:650">Photo coming soon</span>
        <span class="av-badge"><span style="width:7px;height:7px;border-radius:50%;background:#1C8A57"></span>Available</span>${near ? `<span class="near-badge">◆ ${esc(near)}</span>` : ''}</div>
      <div class="cbody"><div class="size-xl">${esc(p.size)}</div>
        <div style="font-size:16px;font-weight:700;color:#2E2A22;margin-top:9px">${esc(p.block)} · Plot ${esc(p.plotNumber)}</div>
        <div style="font-size:13.5px;color:#7C7565;font-weight:580;margin-top:5px">${esc(p.plotType)} · ${esc(p.roadFacing)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:11px">${p.near.map(n => `<span style="font-size:11px;font-weight:640;color:#8A5E22;background:#F4E8CF;border:1px solid #E6D5B4;padding:4px 9px;border-radius:8px">◆ ${esc(driverName(n))}</span>`).join('')}</div>
        <div style="display:flex;gap:9px;margin-top:15px"><button class="btn-primary" style="flex:1;height:48px;font-size:14px" data-sector="${p.id}">View on Sector Map</button><button class="btn-ghost" style="padding:0 16px;height:48px;font-size:14px" data-details-prop="${p.id}">Details</button></div></div></div>`;
  }
  function detailHTML() {
    const p = propById(state.selectedId); if (!p) return browseHTML();
    const ph = photosFor('property', p.id, 4);
    const meta = [['Plot type', p.plotType], ['Road facing', p.roadFacing], ['Block / pocket', p.block], ['Sector / area', p.area], ['Plot number', p.plotNumber], ['Availability', p.availability]];
    return `<div class="full-in" style="max-width:1040px;padding-top:0;animation:riseIn .22s ease">
      <div class="detail-head"><button class="backlink" id="backBrowse" style="font-size:14px;padding:8px 0">‹ Back to properties</button></div>
      <div style="display:grid;grid-template-columns:1.12fr 1fr;gap:30px;margin-top:8px;align-items:start">
        <div>${photo(ph[0].grad, 332, `data-lb="0"`)}
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">${ph.slice(1, 4).map((x, i) => photo(x.grad, 84, `data-lb="${i + 1}"`)).join('')}</div></div>
        <div>
          <div style="display:inline-flex;align-items:center;gap:6px;background:#E1F0E7;color:#1C8A57;font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px"><span style="width:7px;height:7px;border-radius:50%;background:#1C8A57"></span>Available</div>
          <div style="font-size:52px;font-weight:800;letter-spacing:-2px;line-height:.96;margin-top:14px">${esc(p.size)}</div>
          <div style="font-size:21px;font-weight:730;letter-spacing:-.5px;color:#2E2A22;margin-top:8px">${esc(p.block)} · Plot ${esc(p.plotNumber)}</div>
          <div class="meta-box">${meta.map(([k, v]) => `<div class="meta-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
          <div class="rel-h">Nearby landmarks &amp; value drivers</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">${p.near.map(n => `<span class="driver-chip">◆ ${esc(driverName(n))}</span>`).join('')}</div>
          <div style="display:flex;gap:11px;margin-top:24px"><button class="btn-primary" style="flex:1;height:56px;font-size:16px" data-sector="${p.id}">View on Sector Map</button><button class="btn-ghost" style="flex:1;height:56px;font-size:15px;color:#16356A" data-areacontext="${p.id}">Show Area Context</button></div>
          <button class="btn-ghost" style="width:100%;height:46px;margin-top:11px;color:#7C7565;font-weight:640" id="sendLater">Send Details Later</button></div></div></div>`;
  }
  function lightboxHTML() {
    const lb = state.lightbox; const ph = lb.photos[lb.index];
    return `<div class="lightbox" id="lbScrim"><div style="width:100%;max-width:760px" id="lbInner">
      <div class="lb-img"><span class="ph-fill" style="background:${ph.grad};position:absolute;inset:0"></span><span class="ph-tex" style="position:absolute;inset:0"></span><span class="ph-cam" style="position:absolute;top:46%;left:50%"></span>
        <div class="lb-cap">${esc(lb.name)} · Photo coming soon</div>
        ${lb.photos.length > 1 ? '<button class="lb-nav" style="left:14px" id="lbPrev">‹</button><button class="lb-nav" style="right:14px" id="lbNext">›</button>' : ''}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px"><span style="color:rgba(255,255,255,.6);font-size:13px;font-weight:600">${lb.index + 1} / ${lb.photos.length}</span>
        <button style="border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;font-size:13.5px;font-weight:650;padding:9px 16px;border-radius:11px;cursor:pointer" id="lbClose">Close ×</button></div></div></div>`;
  }

  /* ====================== EVENTS ====================== */
  const on = (id, fn) => { const e = el(id); if (e) e.addEventListener('click', fn); };
  const each = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
  function bindPlan() {
    on('areaToggle', () => { state.areaMenuOpen = !state.areaMenuOpen; render(); });
    on('areaScrim', () => { state.areaMenuOpen = false; render(); });
    on('viewAll', () => { state.space = 'area'; state.areaMenuOpen = false; render(); });
    each('[data-sw]', b => b.addEventListener('click', () => { const a = PM.areas.find(x => x.id === b.getAttribute('data-sw')); if (!a || !a.live) return; Object.assign(state, resetPlan({ areaId: a.id })); builtSig = ''; render(); }));
    on('tabMaster', () => { Object.assign(state, { section: 'master' }); render(); });
    on('tabProps', () => { Object.assign(state, { section: 'props', propView: 'browse', selectedId: null, previewId: null }); render(); });
    on('backMaster', () => { Object.assign(state, { section: 'master', propView: 'browse', selectedId: null, previewId: null }); builtSig = ''; render(); });
    on('backMaster2', () => { Object.assign(state, { section: 'master', propView: 'browse', selectedId: null, previewId: null }); builtSig = ''; render(); });
    on('presentBtn', () => { state.present = !state.present; document.body.classList.toggle('present', state.present); render(); setTimeout(fit, 60); });

    each('[data-mode]', b => b.addEventListener('click', () => { state.mapMode = b.getAttribute('data-mode'); if (state.mapMode === 'original') state.showProps = false; builtSig = ''; render(); }));
    on('propSwitch', toggleProps);
    on('zin', () => zoomBtn(1.25)); on('zout', () => zoomBtn(0.8));

    // categories
    each('[data-cat]', b => b.addEventListener('click', () => { state.catId = b.getAttribute('data-cat'); state.itemId = null; state.itemOpen = false; render(); }));
    on('backCats', () => { state.catId = null; state.itemId = null; state.itemOpen = false; render(); });
    // SELECT-FIRST: clicking an item only spotlights + shows compact preview
    each('[data-item]', b => b.addEventListener('click', () => { selectItem(b.getAttribute('data-item'), b.getAttribute('data-kind')); }));
    on('backDriver', () => { state.itemOpen = false; render(); });
    each('[data-photos]', b => b.addEventListener('click', () => { state.itemId = b.getAttribute('data-photos'); openLightbox(0); }));
    each('[data-details]', b => b.addEventListener('click', () => { state.itemId = b.getAttribute('data-details'); state.itemOpen = true; render(); }));
    each('[data-viewprops]', b => b.addEventListener('click', () => { const bl = blockById(b.getAttribute('data-viewprops')); Object.assign(state, { section: 'props', propView: 'browse', filter: { q: '', area: bl ? bl.area : 'all', near: null } }); render(); }));

    // map hits
    const lay = el('maplayer');
    if (lay) lay.addEventListener('click', e => {
      if (moved) return;
      const tag = e.target.closest('[data-tag]'); if (tag) { state.previewId = tag.getAttribute('data-tag'); refreshControls(); renderTags(); return; }
      const hit = e.target.closest('[data-hit]');
      if (hit) { const id = hit.getAttribute('data-hit').split(':')[1]; selectItem(id, itemKindOf(id)); }
    });

    // photos -> lightbox
    each('[data-lb]', b => b.addEventListener('click', () => openLightbox(+b.getAttribute('data-lb'))));
    // preview popover
    on('closePreview', () => { state.previewId = null; refreshControls(); renderTags(); });
    each('[data-details-prop]', b => b.addEventListener('click', () => openDetail(b.getAttribute('data-details-prop'))));
    each('[data-sector]', b => b.addEventListener('click', () => openSector(b.getAttribute('data-sector'))));
    each('[data-areacontext]', b => b.addEventListener('click', () => showAreaContext(b.getAttribute('data-areacontext'))));

    // browse
    const ps = el('pSearch'); if (ps) ps.addEventListener('input', () => { state.filter.q = ps.value; el('full').innerHTML = browseHTML(); bindPlan(); });
    each('[data-areachip]', b => b.addEventListener('click', () => { state.filter.area = b.getAttribute('data-areachip'); render(); }));
    each('[data-facet]', b => b.addEventListener('click', () => { const [k, v] = b.getAttribute('data-facet').split(':'); state.filter[k] = state.filter[k] === v ? null : v; render(); }));
    on('clearF', () => { state.filter.near = null; render(); });

    // detail / sector
    on('backBrowse', () => { Object.assign(state, { propView: 'browse', selectedId: null }); render(); });
    on('backToProperty', () => { Object.assign(state, { section: 'props', propView: 'detail' }); builtSig = ''; render(); });
    on('areaContext', () => showAreaContext(state.selectedId));
    on('sendLater', () => toast('Saved — share the details whenever you like.'));

    // lightbox
    on('lbScrim', () => { state.lightbox = null; render(); });
    on('lbClose', () => { state.lightbox = null; render(); });
    const inner = el('lbInner'); if (inner) inner.addEventListener('click', e => e.stopPropagation());
    on('lbPrev', e => { e.stopPropagation(); state.lightbox.index = (state.lightbox.index - 1 + state.lightbox.photos.length) % state.lightbox.photos.length; render(); });
    on('lbNext', e => { e.stopPropagation(); state.lightbox.index = (state.lightbox.index + 1) % state.lightbox.photos.length; render(); });
  }
  function zoomBtn(f) { const r = wrap().getBoundingClientRect(); zoomAt(r.left + wrap().clientWidth / 2, r.top + wrap().clientHeight / 2, f); }
  function focusProps() {
    const ps = PM.properties; if (!ps.length) return;
    const cx = ps.reduce((s, p) => s + p.tagAt[0], 0) / ps.length, cy = ps.reduce((s, p) => s + p.tagAt[1], 0) / ps.length;
    setTimeout(() => focusPx(cx / IMG_W * MAP_W, cy / IMG_H * MAP_H, 2.2), 60);
  }
  function toggleProps() {
    state.showProps = !state.showProps; state.previewId = null;
    refreshControls(); renderTags();
    if (state.showProps) focusProps(); else fit();
  }

  // select item: spotlight on map + compact preview in panel; stay in category context
  function selectItem(id, kind) {
    state.itemId = id; state.itemKind = kind; state.itemOpen = false; state.catId = itemCategory(id);
    state.section = 'master'; if (state.mapMode === 'original') { /* keep original; highlight overlay shows */ }
    render();
    const it = itemObj(id); if (it && it.at) setTimeout(() => focusPx(it.at[0] / IMG_W * MAP_W, it.at[1] / IMG_H * MAP_H, 1.5), 60);
  }

  function refreshControls() {
    const vp = el('mapwrap'); if (!vp) { render(); return; }
    vp.querySelectorAll('.mode-switch,.prop-switch,.zoom,.preview').forEach(n => n.remove());
    vp.insertAdjacentHTML('beforeend', mapControlsHTML());
    each('[data-mode]', b => b.addEventListener('click', () => { state.mapMode = b.getAttribute('data-mode'); if (state.mapMode === 'original') state.showProps = false; builtSig = ''; render(); }));
    on('propSwitch', toggleProps);
    on('zin', () => zoomBtn(1.25)); on('zout', () => zoomBtn(0.8));
    on('closePreview', () => { state.previewId = null; refreshControls(); renderTags(); });
    each('.preview [data-details-prop]', b => b.addEventListener('click', () => openDetail(b.getAttribute('data-details-prop'))));
    each('.preview [data-sector]', b => b.addEventListener('click', () => openSector(b.getAttribute('data-sector'))));
  }

  function openDetail(id) { Object.assign(state, { section: 'props', propView: 'detail', selectedId: id, previewId: null }); render(); }
  function openSector(id) { Object.assign(state, { section: 'props', propView: 'sector', selectedId: id, previewId: null }); builtSig = ''; render(); }
  function showAreaContext(id) {
    const p = propById(id); Object.assign(state, { section: 'master', mapMode: 'easy', showProps: true, selectedId: id, itemId: null, itemKind: null, itemOpen: false, previewId: id }); builtSig = ''; render();
    if (p) { const b = blockById(p.blockId); if (b) setTimeout(() => focusPx(b.at[0] / IMG_W * MAP_W, b.at[1] / IMG_H * MAP_H, 1.6), 80); }
  }
  function openLightbox(idx) {
    let photos, name;
    if (state.section === 'props' && state.propView === 'detail') { photos = photosFor('property', state.selectedId, 4); name = 'Plot ' + (propById(state.selectedId) || {}).plotNumber; }
    else if (state.itemId) { const it = itemObj(state.itemId); const k = state.itemKind === 'line' ? 'roads' : (it && it.cat); photos = photosFor(state.itemKind === 'line' ? 'line' : (state.itemKind || 'pin'), k || 'roads', 4); name = it ? it.name : ''; }
    else { photos = photosFor('property', state.selectedId || 'x', 4); name = ''; }
    state.lightbox = { photos, index: idx || 0, name: name || '' }; render();
  }
  function toast(msg) { let t = el('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = '0', 1900); }

  window.addEventListener('resize', () => { if (state.space === 'plan') fit(); });
  render();
})();
