/* PlotMap — client-facing app (Aerocity / Aerotropolis). Framework-free. */
(async function () {
  const PM = window.PM;
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- reusable map engine: resolve the active dataset + its geometry ---- */
  let DS = null, GEO = { viewBox: '0 0 4599 3069', cyan: [], red: [], black: [] };
  let EW = 1440, EH = 960, IW = 4599, IH = 3069;
  const geoCache = {};
  async function useDataset(areaId) {
    const ds = PM.datasetFor(areaId); if (!ds) return;
    DS = ds; EW = ds.EASY_W; EH = ds.EASY_H; IW = ds.IMG_W; IH = ds.IMG_H;
    const gp = ds.assets && ds.assets.overlayGeo;
    if (gp) { if (!geoCache[gp]) geoCache[gp] = await fetch(gp).then(r => r.json()).catch(() => ({ viewBox: `0 0 ${IW} ${IH}`, cyan: [], red: [], black: [] })); GEO = geoCache[gp]; }
    else GEO = { viewBox: `0 0 ${IW} ${IH}`, cyan: [], red: [], black: [] };
  }

  const state = {
    space: 'area', areaId: 'aerotropolis', areaMenuOpen: false,
    section: 'master', mapMode: 'original', showProps: false,
    catId: null, selectedIds: new Set(), itemOpen: false,
    propView: 'browse', selectedId: null, previewId: null, sectorBlock: null, sectorFrom: null,
    filters: { type: new Set(), area: new Set(), location: new Set(), size: new Set() },
    secQ: '', secArea: 'all',
    lightbox: null, present: false
  };

  /* ---------- lookups ---------- */
  const area = () => PM.areas.find(a => a.id === state.areaId) || PM.areas[0];
  const num = (n) => typeof n === 'number' && Number.isFinite(n);
  const rectOk = (o) => o && ['x','y','w','h'].every(k => num(o[k]));
  const activeCategories = () => PM.categoriesFor(DS).filter(c => c.id !== 'green' && c.id !== 'entry');
  const catById = (id) => activeCategories().find(c => c.id === id) || PM.categoryById(id);
  const keyRoads = () => (DS.keyRoads || []).filter(r => r && r.clientVisible !== false && r.id && r.name && r.easyD && Array.isArray(r.labelAt));
  const mapBlocks = () => (DS.blocks || []).filter(b => b && b.clientVisible !== false && b.id && b.name && b.cat && rectOk(b));
  const mapZones = () => (DS.zones || []).filter(z => z && z.clientVisible !== false && z.id && z.name && z.cat && rectOk(z));
  const mapPins = () => (DS.pins || []).filter(p => p && p.clientVisible !== false && p.id && p.name && p.cat && Array.isArray(p.at) && p.at.length === 2);
  const mapProperties = () => (DS.properties || []).filter(p => p && p.clientVisible !== false && p.id && p.plotNumber && p.blockId && blockById(p.blockId));
  const readySectorMaps = () => (DS.sectorMaps || []).filter(s => s && s.status === 'ready' && (s.asset || DS.assets.sector));
  const roadById = (id) => keyRoads().find(r => r.id === id);
  const zoneById = (id) => mapZones().find(z => z.id === id);
  const pinById = (id) => mapPins().find(p => p.id === id);
  const blockById = (id) => mapBlocks().find(b => b.id === id);
  const propById = (id) => mapProperties().find(p => p.id === id);
  const scopedRoads = () => { const f = area().focusArea; return f ? keyRoads().filter(r => !r.related || r.related.includes(f) || r.related.some(x => x.includes(f))) : keyRoads(); };
  const scopedBlocks = () => { const f = area().focusArea; return f ? mapBlocks().filter(b => b.area === f) : mapBlocks(); };
  const scopedZones = () => { const f = area().focusArea; return f ? mapZones().filter(z => !z.related || z.related.includes(f) || z.related.some(x => x.includes(f))) : mapZones(); };
  const scopedPins = () => { const f = area().focusArea; return f ? mapPins().filter(p => !p.related || p.related.includes(f) || p.related.some(x => x.includes(f))) : mapPins(); };
  const scopedProperties = () => { const f = area().focusArea; return f ? mapProperties().filter(p => p.area === f) : mapProperties(); };
  const propsInBlock = (bid) => mapProperties().filter(p => p.blockId === bid);
  const sectorMapById = (id) => readySectorMaps().find(s => s.id === id);
  const sectorMapForProperty = (p) => p && readySectorMaps().find(s => s.area === p.area && s.block === p.block);
  const activeSectorMap = () => sectorMapById(state.sectorBlock) || sectorMapForProperty(propById(state.selectedId)) || readySectorMaps()[0] || null;
  const hasSectorMap = (p) => !!sectorMapForProperty(p);
  const itemObj = (id) => roadById(id) || zoneById(id) || pinById(id) || blockById(id);
  const driverName = (id) => (itemObj(id) || {}).name || id;
  const catColor = (id) => (catById(id) || {}).color || '#16356A';
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  function itemCategory(id) {
    if (roadById(id)) return 'roads';
    const z = zoneById(id); if (z) return z.cat;
    const p = pinById(id); if (p) return p.cat;
    const b = blockById(id); if (b) return b.cat;
    return state.catId;
  }
  function itemKindOf(id) { if (roadById(id)) return 'line'; if (zoneById(id)) return 'zone'; if (pinById(id)) return 'pin'; if (blockById(id)) return 'block'; return 'pin'; }
  function catItems(catId) {
    const c = catById(catId) || {};
    if (catId === 'roads' || c.kind === 'line') return scopedRoads().map(r => ({ id: r.id, name: r.name, sub: 'Key road', kind: 'line', color: c.color || '#16356A', photos: r.photos }));
    return scopedBlocks().filter(b => b.cat === catId).map(b => ({ id: b.id, name: b.name, sub: `${b.area} · ${propsInBlock(b.id).length} available`, kind: 'block', color: c.color || catColor(catId) }))
      .concat(scopedZones().filter(z => z.cat === catId).map(z => ({ id: z.id, name: z.name, sub: c.label, kind: 'zone', color: c.color, photos: z.photos })))
      .concat(scopedPins().filter(p => p.cat === catId).map(p => ({ id: p.id, name: p.name, sub: c.label, kind: 'pin', color: c.color, photos: p.photos })));
  }
  const catCount = (id) => catItems(id).length;
  const inCatItem = (id) => state.catId && catItems(state.catId).some(i => i.id === id);

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
  const photoKeyOf = (id, kind) => kind === 'line' ? 'roads' : (itemCategory(id) || 'roads');

  /* ====================== MAP pan/zoom (smooth) ====================== */
  let tx = 0, ty = 0, scale = 1, panning = false, moved = false, sx, sy, stx, sty, pinch = null, builtSig = '';
  let LW = EW, LH = EH;
  const wrap = () => el('mapwrap'), layer = () => el('maplayer');
  function applyT(anim) { 
    const vp = wrap(); if (!vp || !vp.clientWidth) return;
    const W = vp.clientWidth, H = vp.clientHeight;
    const minX = W - LW * scale, maxX = 0;
    const minY = H - LH * scale, maxY = 0;
    if (minX > maxX) { tx = (W - LW * scale) / 2; } else { tx = Math.max(minX, Math.min(maxX, tx)); }
    if (minY > maxY) { ty = (H - LH * scale) / 2; } else { ty = Math.max(minY, Math.min(maxY, ty)); }
    const l = layer(); if (!l) return; 
    l.style.transition = anim ? 'transform .5s cubic-bezier(.33,0,.2,1)' : 'none'; 
    l.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; 
  }
  function fit() { const vp = wrap(); if (!vp || !vp.clientWidth) return; const W = vp.clientWidth, H = vp.clientHeight; const s = Math.max(W / LW, H / LH); scale = s; tx = (W - LW * s) / 2; ty = (H - LH * s) / 2; applyT(true); }
  function focusBox(cx, cy, bw, bh, maxZoom) {
    const vp = wrap(); if (!vp || !vp.clientWidth) return; const W = vp.clientWidth, H = vp.clientHeight;
    const pad = 2.4; const sFit = Math.min(W / (bw * pad), H / (bh * pad));
    const minScale = Math.max(W / LW, H / LH);
    const s = Math.max(minScale, Math.min(sFit, maxZoom || 1.6));
    scale = s; tx = W / 2 - cx * s; ty = H / 2 - cy * s; applyT(true);
  }
  function zoomAt(cx, cy, f) { const vp = wrap(); if (!vp) return; const r = vp.getBoundingClientRect(); const ox = cx - r.left, oy = cy - r.top; const W = vp.clientWidth, H = vp.clientHeight; const minScale = Math.max(W / LW, H / LH); const ns = Math.max(minScale, Math.min(scale * f, 5)); const k = ns / scale; tx = ox - (ox - tx) * k; ty = oy - (oy - ty) * k; scale = ns; applyT(false); }
  function bindMap() {
    const vp = wrap(); if (!vp || vp._bound) return; vp._bound = true;
    vp.addEventListener('pointerdown', e => { if (e.target.closest('[data-hit],[data-tag]')) { panning = false; return; } panning = true; moved = false; sx = e.clientX; sy = e.clientY; stx = tx; sty = ty; vp.style.cursor = 'grabbing'; });
    window.addEventListener('pointermove', e => { if (!panning) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true; tx = stx + dx; ty = sty + dy; applyT(false); });
    window.addEventListener('pointerup', () => { panning = false; const v = wrap(); if (v) v.style.cursor = 'grab'; });
    vp.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.07 : 1 / 1.07); }, { passive: false });   // gentler
    vp.addEventListener('touchstart', e => { if (e.touches.length === 2) { e.preventDefault(); pinch = { d: td(e), cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 }; panning = false; } }, { passive: false });
    vp.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { e.preventDefault(); const nd = td(e); zoomAt(pinch.cx, pinch.cy, 1 + (nd / pinch.d - 1) * 0.7); pinch.d = nd; } }, { passive: false });
    vp.addEventListener('touchend', () => pinch = null);
  }
  function td(e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
  function focusItem(id) {
    const kind = itemKindOf(id);
    if (kind === 'block' || kind === 'zone') { const o = itemObj(id); focusBox(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, 1.7); }
    else if (kind === 'pin') { const o = itemObj(id); focusBox(o.at[0], o.at[1], 260, 260, 1.5); }
    else if (kind === 'line') { const r = roadById(id); const pts = pathPoints(r.easyD); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); focusBox((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, 120), Math.max(y1 - y0, 120), 1.35); }
  }
  function pathPoints(d) { return (d.match(/-?\d+(\.\d+)?/g) || []).map(Number).reduce((a, n, i, arr) => { if (i % 2 === 0) a.push([n, arr[i + 1]]); return a; }, []); }

  /* ====================== MAP build ====================== */
  function mapKind() { if (state.section === 'props' && state.propView === 'sector') return 'sector'; return state.mapMode === 'original' ? 'original' : 'easy'; }
  function buildMap() {
    const kind = mapKind(); const sig = state.areaId + '|' + kind; const fresh = sig !== builtSig;
    const l = layer(); if (!l) return;
    if (kind === 'easy') { LW = EW; LH = EH; } else { LW = 1080; LH = 921; }
    l.style.width = LW + 'px'; l.style.height = LH + 'px';
    l.className = 'maplayer ' + kind;
    if (kind === 'original') l.innerHTML = `<img class="orig" src="${DS.assets.original}" alt="Official masterplan">` + origSVG();
    else if (kind === 'sector') { const sm = activeSectorMap(); const sectorAsset = (sm && sm.asset) || DS.assets.sector; l.innerHTML = `<div class="sector-wrap" style="width:${LW}px;height:${LH}px;background-image:url('${sectorAsset}')"></div><div id="proofG"></div>`; }
    else l.innerHTML = easySVG();
    builtSig = sig; updateMapOverlays();
    if (fresh) requestAnimationFrame(fit); else applyT(false);
  }

  /* ---------- EASY MAP (authored premium schematic) ---------- */
  function easySVG() {
    const internal = [
      'M 200 120 L 200 880', 'M 1240 120 L 1240 880', 'M 120 350 L 1330 350',
      'M 120 820 L 1330 820', 'M 760 120 L 770 900', 'M 430 120 L 440 900'
    ].map(d => `<path d="${d}" class="in-road"/>`).join('');
    const roads = scopedRoads().map(r => `<path d="${r.easyD}" class="e-road-casing"/>`).join('')
      + scopedRoads().map(r => `<path d="${r.easyD}" class="e-road" data-roadpath="${r.id}"/>`).join('')
      + scopedRoads().map(r => `<path d="${r.easyD}" class="e-road-hit" data-hit="line:${r.id}"/>`).join('');
    const zones = scopedZones().map(z => {
      const c = catColor(z.cat);
      return `<g class="e-zone" data-hit="zone:${z.id}" data-zid="${z.id}">
        <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="18" fill="${hexA(c, .16)}" stroke="${hexA(c, .55)}" stroke-width="2" ${z.dashed ? 'stroke-dasharray="11 8"' : ''} class="zfill"/>
        <text x="${z.x + z.w / 2}" y="${z.y + 26}" class="e-zlabel" fill="${c}" text-anchor="middle">${esc(z.name)}</text>
        ${(z.pins || []).map(p => `<g><circle cx="${p.at[0]}" cy="${p.at[1]}" r="4.5" fill="${c}"/><text x="${p.at[0]}" y="${p.at[1] + 20}" class="e-sublabel" text-anchor="middle">${esc(p.name)}</text></g>`).join('')}
      </g>`;
    }).join('');
    const blocks = scopedBlocks().map(b => {
      const c = catColor(b.cat);
      return `<g class="e-block" data-hit="block:${b.id}" data-bid="${b.id}">
        <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="${hexA(c, .2)}" stroke="${hexA(c, .7)}" stroke-width="2" class="bfill"/>
        <text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 6}" class="e-blabel" fill="${c}" text-anchor="middle">${esc(b.name)}</text>
        <text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 24}" class="e-bsub" text-anchor="middle">${esc(b.area)}</text>
      </g>`;
    }).join('');
    const roadLabels = scopedRoads().map(r => `<g class="e-rlabel-g" data-roadlabel="${r.id}"><text x="${r.labelAt[0]}" y="${r.labelAt[1]}" class="e-rlabel" text-anchor="middle">${esc(r.label || r.name)}</text></g>`).join('');
    const pins = scopedPins().map(p => {
      const c = catColor(p.cat);
      return `<g class="e-pin" data-hit="${itemKindOf(p.id)}:${p.id}" data-pid="${p.id}">
        <circle cx="${p.at[0]}" cy="${p.at[1]}" r="8" fill="${c}" stroke="#fff" stroke-width="2.5"/>
        <text x="${p.at[0]}" y="${p.at[1] - 14}" class="e-plabel" text-anchor="middle">${esc(p.name)}</text></g>`;
    }).join('');
    return `<svg class="easy-svg" viewBox="0 0 ${EW} ${EH}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="sand" cx="42%" cy="38%" r="80%"><stop offset="0%" stop-color="#F1E7D0"/><stop offset="100%" stop-color="#E4D7BB"/></radialGradient>
        <filter id="eglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      <rect x="0" y="0" width="${EW}" height="${EH}" fill="url(#sand)"/>
      <g id="eInternal">${internal}</g>
      <g id="eZones">${zones}</g>
      <g id="eBlocks">${blocks}</g>
      <g id="eRoads">${roads}</g>
      <g id="eRoadLabels">${roadLabels}</g>
      <g id="ePins">${pins}</g>
      <g id="eSpot"></g>
    </svg><div id="tagG"></div>`;
  }

  /* ---------- ORIGINAL MAP overlay (real geometry highlights) ---------- */
  function origSVG() {
    const roadPaths = keyRoads().filter(r => r.svgId && GEO.paths && GEO.paths[r.svgId]);
    const casing = roadPaths.map(r => `<path d="${GEO.paths[r.svgId]}" class="o-road-case" style="--rfill:${catColor('roads')}" data-roadpath="${r.id}"/>`).join('');
    const lines = roadPaths.map(r => `<path d="${GEO.paths[r.svgId]}" class="o-road" style="--rfill:${catColor('roads')}" data-roadpath="${r.id}"/>`).join('');
    const hits = roadPaths.map(r => `<path d="${GEO.paths[r.svgId]}" class="o-hit" data-hit="line:${r.id}"/>`).join('');
    
    const blockPaths = scopedBlocks().filter(b => b.svgId && GEO.paths && GEO.paths[b.svgId]);
    const blocksHTML = blockPaths.map(b => `<path d="${GEO.paths[b.svgId]}" class="o-block" style="${b.color ? `--bfill:${b.color}` : ''}" data-itempath="${b.id}" data-hit="block:${b.id}"/>`).join('');

    const zonePaths = scopedZones().filter(z => z.svgId && GEO.paths && GEO.paths[z.svgId]);
    const zonesHTML = zonePaths.map(z => `<path d="${GEO.paths[z.svgId]}" class="o-zone cat-${z.cat}" style="--zfill:${catColor(z.cat)}" data-itempath="${z.id}" data-hit="zone:${z.id}"/>`).join('');

    const pinsHTML = [];
    const addPin = (item, kind) => {
      let cx = 0, cy = 0;
      if (item.at) { cx = (item.at[0] / EW) * IW; cy = (item.at[1] / EH) * IH; }
      else if (item.w) { cx = ((item.x + item.w/2) / EW) * IW; cy = ((item.y + item.h/2) / EH) * IH; }
      else return;
      const c = catColor(item.cat);
      pinsHTML.push(`<g class="o-pin" data-hit="${kind}:${item.id}" data-itempath="${item.id}" style="transform:translate(${cx}px,${cy}px)">
        <circle cx="0" cy="0" r="32" fill="${c}" stroke="#fff" stroke-width="10" class="pin-dot"/>
        <rect x="-140" y="50" width="280" height="70" rx="35" fill="${hexA(c, .95)}" class="pin-lbl-bg"/>
        <text x="0" y="96" class="pin-lbl" fill="#fff" text-anchor="middle" font-size="32" font-weight="700">${esc(item.name)}</text>
      </g>`);
    };
    scopedBlocks().filter(b => !b.svgId || !GEO.paths || !GEO.paths[b.svgId]).forEach(b => addPin(b, 'block')); // Fallback
    scopedZones().filter(z => !z.svgId || !GEO.paths || !GEO.paths[z.svgId]).forEach(z => addPin(z, 'zone')); // Fallback
    scopedPins().forEach(p => addPin(p, 'pin'));

    return `<svg class="easy-svg orig-ov" viewBox="${GEO.viewBox || '0 0 4599 3069'}" preserveAspectRatio="xMidYMid meet"><g id="oRoadCase">${casing}</g><g id="oBlocks">${blocksHTML}</g><g id="oZones">${zonesHTML}</g><g id="oRoads">${lines}</g><g id="oPins">${pinsHTML.join('')}</g><g id="oSpot"></g><g id="oHit">${hits}</g></svg>`;
  }

  /* ---------- overlays: highlight / declutter / spotlight ---------- */
  function updateMapOverlays() {
    const kind = mapKind(); const l = layer(); if (!l) return;
    if (kind === 'sector') { renderProof(); return; }
    const selIds = state.selectedIds, cat = state.catId;
    const hasSel = selIds.size > 0;
    const dimAll = hasSel || cat;
    const relate = (id, k) => { // is this item active (selected or in selected category)?
      if (hasSel) return selIds.has(id);
      if (cat) { const ic = (k === 'line') ? 'roads' : itemCategory(id); return ic === cat; }
      return true;
    };
    if (kind === 'easy') {
      l.querySelectorAll('.e-road').forEach(p => { const id = p.getAttribute('data-roadpath'); const on = relate(id, 'line'); p.classList.toggle('act', !!(hasSel || cat) && on); p.classList.toggle('dim', !!dimAll && !on); });
      l.querySelectorAll('.e-block').forEach(g => { const id = g.getAttribute('data-bid'); const on = relate(id, 'block'); g.classList.toggle('act', on && (selIds.has(id) || cat === itemCategory(id))); g.classList.toggle('dim', !!dimAll && !on); });
      l.querySelectorAll('.e-zone').forEach(g => { const id = g.getAttribute('data-zid'); const on = relate(id, 'zone'); g.classList.toggle('act', on && (selIds.has(id) || cat === itemCategory(id))); g.classList.toggle('dim', !!dimAll && !on); });
      l.querySelectorAll('.e-pin').forEach(g => { const id = g.getAttribute('data-pid'); const on = relate(id, 'pin'); g.classList.toggle('act', on && (selIds.has(id) || cat === itemCategory(id))); g.classList.toggle('dim', (!!dimAll && !on) || (state.showProps && !hasSel && !cat)); });
      l.querySelectorAll('.e-rlabel-g').forEach(g => { const id = g.getAttribute('data-roadlabel'); g.classList.toggle('act', selIds.has(id)); g.classList.toggle('dim', !!dimAll && !relate(id, 'line')); });
      // spotlight selected road (layered) in easy
      const sp = l.querySelector('#eSpot'); if (sp) { sp.innerHTML = '';
        if (hasSel) {
           selIds.forEach(sel => {
             if (itemKindOf(sel) === 'line') { const d = roadById(sel).easyD; sp.insertAdjacentHTML('beforeend', `<path d="${d}" filter="url(#eglow)" style="fill:none;stroke:#28C8E0;stroke-width:18;opacity:.5;stroke-linecap:round"/><path d="${d}" style="fill:none;stroke:#0B2552;stroke-width:11;stroke-linecap:round"/><path d="${d}" style="fill:none;stroke:#fff;stroke-width:7;stroke-linecap:round"/><path d="${d}" style="fill:none;stroke:#2BD0E6;stroke-width:3.5;stroke-linecap:round"/>`); }
           });
        }
      }
      renderTags();
    } else if (kind === 'original') {
      l.querySelectorAll('.o-road, .o-road-case').forEach(p => { 
        const id = p.getAttribute('data-roadpath'); 
        const on = relate(id, 'line'); 
        const inCat = !!cat && cat === 'roads';
        const isSel = selIds.has(id);
        p.classList.toggle('soft', !isSel && inCat);
        p.classList.toggle('cat-act', false); // replaced by solid .act
        p.classList.toggle('hide', !isSel && !inCat); 
        p.classList.toggle('show', isSel || inCat);
        p.classList.toggle('act', isSel);
      });
      l.querySelectorAll('.o-block, .o-zone').forEach(p => { 
        const id = p.getAttribute('data-itempath'); 
        const on = relate(id, itemKindOf(id)); 
        const inCat = !!cat && cat === itemCategory(id);
        const isSel = selIds.has(id);
        if (hasSel) {
          p.classList.toggle('act', isSel);
          p.classList.toggle('soft', !isSel && inCat);
          p.classList.toggle('hide', !isSel && !inCat);
          p.classList.toggle('show', isSel || inCat);
        } else {
          p.classList.toggle('act', false);
          p.classList.toggle('soft', false);
          p.classList.toggle('hide', !inCat);
          p.classList.toggle('show', inCat && on);
        }
      });
      l.querySelectorAll('.o-pin').forEach(g => {
        const id = g.getAttribute('data-itempath');
        const on = relate(id, itemKindOf(id));
        const inCat = !!cat && cat === itemCategory(id);
        const isSel = selIds.has(id);
        g.classList.toggle('soft', inCat && on && !isSel);
        g.classList.toggle('hide', hasSel ? !isSel && !inCat : (cat ? !on : true));
        g.classList.toggle('show', isSel || (on && !g.classList.contains('hide')));
      });
      const sp = l.querySelector('#oSpot'); if (sp) { sp.innerHTML = '';
        if (hasSel) {
           selIds.forEach(sel => {
             const k = itemKindOf(sel);
             if (k === 'line') { const d = GEO.paths[roadById(sel).svgId]; if(d) sp.insertAdjacentHTML('beforeend', `<path d="${d}" filter="url(#eglow)" style="fill:none;stroke:#2BD0E6;stroke-width:44;opacity:.4;stroke-linecap:round"/><path d="${d}" style="fill:none;stroke:#0B2552;stroke-width:28;stroke-linecap:round"/><path d="${d}" style="fill:none;stroke:#fff;stroke-width:14;stroke-linecap:round"/><path d="${d}" style="fill:none;stroke:#2BD0E6;stroke-width:8;stroke-linecap:round"/>`); }
             else if (k === 'pin') {
               const it = itemObj(sel); let cx = 0, cy = 0;
               if (it.at) { cx = (it.at[0] / EW) * IW; cy = (it.at[1] / EH) * IH; }
               const c = catColor(it.cat);
               sp.insertAdjacentHTML('beforeend', `<g style="transform:translate(${cx}px,${cy}px)"><circle cx="0" cy="0" r="58" fill="${c}" opacity="0.3"/><circle cx="0" cy="0" r="42" fill="none" stroke="${c}" stroke-width="12"/></g>`);
             }
           });
        }
      }
      l.classList.toggle('dimmed', !!(hasSel || cat));
    }
  }
  function renderTags() {
    const g = layer() && layer().querySelector('#tagG'); if (!g) return;
    if (!(state.mapMode === 'easy' && state.showProps && state.section === 'master')) { g.innerHTML = ''; return; }
    g.innerHTML = scopedProperties().map(p => { const b = blockById(p.blockId) || { x: 700, y: 480, w: 120, h: 100 };
      const x = b.x + b.w / 2, y = b.y + 14;
      return `<button class="ptag ${p.id === state.previewId ? 'sel' : ''}" data-tag="${p.id}" style="left:${x}px;top:${y}px">
        <span class="no">${esc(p.plotNumber)}</span><span class="sz">${esc(p.size)}</span><span class="av">Available</span></button>`;
    }).join('');
  }
  function renderProof() {
    const g = layer() && layer().querySelector('#proofG'); if (!g) return;
    const p = propById(state.selectedId);
    if (!p) { g.innerHTML = ''; requestAnimationFrame(fit); return; }
    const x = p.plotAt[0] / 100 * LW, y = p.plotAt[1] / 100 * LH;
    g.innerHTML = `<div class="plot-hi" style="left:${x}px;top:${y}px"></div><div class="plot-dot" style="left:${x}px;top:${y}px"></div><div class="plot-lbl" style="left:${x}px;top:${y}px">Plot ${esc(p.plotNumber)}</div>`;
    requestAnimationFrame(() => focusBox(x, y, 360, 360, 1.9));
  }

  /* ====================== RENDER ROOT ====================== */
  function render() {
    const root = el('app');
    if (state.space === 'area') { root.innerHTML = areaSelectHTML(); bindAreaSelect(); return; }
    root.className = state.present ? 'present' : '';
    root.innerHTML = planHTML(); bindPlan(); bindMap(); buildMap();
  }
  function resetPlan(extra) { return Object.assign({ section: 'master', mapMode: 'original', showProps: false, catId: null, selectedIds: new Set(), itemOpen: false, propView: 'browse', selectedId: null, previewId: null, sectorBlock: null, sectorFrom: null, areaMenuOpen: false, filters: { type: new Set(), area: new Set(), location: new Set(), size: new Set() }, secQ: '', secArea: 'all' }, extra || {}); }

  /* ---------- AREA SELECT ---------- */
  function areaSelectHTML() {
    return `<div class="area-select"><div class="as-in">
        <div class="as-brand"><span class="logo" style="width:34px;height:34px"><i style="width:13px;height:13px;border-width:3.5px"></i></span>
          <span style="font-size:19px;font-weight:740;letter-spacing:-.3px;color:#FBF6EA">PlotMap</span>
          <span style="font-size:13px;font-weight:600;color:rgba(251,246,234,.55)">Interactive Masterplans</span></div>
        <div class="as-hero">Open a masterplan.</div>
        <div class="as-sub">Walk your client through the location — roads, blocks, landmarks and properties, with photo proof on the map. You explain; PlotMap shows.</div>
      </div>
      <div class="as-grid">${PM.areas.map(a => `<button class="as-tile ${a.live ? '' : 'soon'}" data-area="${a.id}" ${a.live ? '' : 'disabled'}>
        <div><div style="display:flex;align-items:baseline;gap:9px"><span class="as-name">${esc(a.name)}</span>${a.sub ? `<span style="font-size:12.5px;color:#9C957F;font-weight:600">${esc(a.sub)}</span>` : ''}</div>
          ${a.live ? `<div style="display:flex;align-items:center;gap:7px;margin-top:12px"><span style="width:7px;height:7px;border-radius:50%;background:#B07A2B"></span><span style="font-size:13px;font-weight:600;color:#8A5E22;line-height:1.35">${esc(a.hook)}</span></div>` : `<div style="margin-top:12px"><span class="soon-tag">Coming soon</span></div>`}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;padding-top:15px;border-top:1px solid #ECE2CD"><span style="font-size:13.5px;color:#5A554A;font-weight:600">${a.live ? 'Interactive masterplan' : 'Map being prepared'}</span>${a.live ? '<span style="font-size:13px;color:#16356A;font-weight:730">Open →</span>' : ''}</div></button>`).join('')}</div></div>`;
  }
  function bindAreaSelect() { document.querySelectorAll('.as-tile[data-area]').forEach(b => b.addEventListener('click', async () => { const a = PM.areas.find(x => x.id === b.getAttribute('data-area')); if (!a || !a.live) return; Object.assign(state, resetPlan({ space: 'plan', areaId: a.id })); await useDataset(a.id); builtSig = ''; render(); })); }

  /* ---------- PLAN SHELL ---------- */
  function planHTML() {
    const showBack = state.section !== 'master';
    const split = state.section === 'master' || (state.section === 'props' && state.propView === 'sector');
    const full = !split;
    return `
    <div class="topbar">
      <div class="brand"><span class="logo"><i></i></span><span class="brand-name">PlotMap</span></div>
      <button class="area-switch" id="areaToggle"><span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.1"><span class="cur">${esc(area().name)}</span><span class="lab">View all maps</span></span><span class="caret">▾</span></button>
      <div class="divider"></div>
      <div style="display:flex;gap:3px"><button class="tab ${state.section === 'master' ? 'on' : ''}" id="tabMaster">Masterplan</button><button class="tab ${state.section === 'props' && state.propView !== 'sector' ? 'on' : ''}" id="tabProps">Properties</button><button class="tab ${state.section === 'sectors' ? 'on' : ''}" id="tabSectors">Sector Maps</button></div>
      <div class="spacer"></div>
      ${showBack ? '<button class="back-btn" id="backMaster"><span>‹</span> Back to Masterplan</button>' : ''}
      <button class="present-btn" id="presentBtn">${state.present ? '✕ Exit presentation' : '◧ Presentation'}</button>
      ${state.areaMenuOpen ? areaMenuHTML() : ''}
    </div>
    <div class="body">
      ${split ? `<div class="mapwrap" id="mapwrap"><div class="maplayer" id="maplayer"></div>${mapControlsHTML()}</div>${state.present ? '' : `<div class="panel" id="panel">${panelHTML()}</div>`}`
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
      <button class="area-row" id="viewAllSectors" style="color:#16356A;font-weight:680">View all sector maps →</button></div>`;
  }
  function mapControlsHTML() {
    const showModes = state.section === 'master';
    return `${showModes ? `<div class="mode-switch"><button class="${state.mapMode === 'original' ? 'on' : ''}" data-mode="original">Original Map</button><button class="${state.mapMode === 'easy' ? 'on' : ''}" data-mode="easy">Easy Map</button></div>` : ''}
      ${showModes && state.mapMode === 'easy' ? `<div class="prop-switch ${state.showProps ? 'on' : ''}" id="propSwitch"><span class="lbl">Show Properties</span><span class="knob"><i></i></span></div>` : ''}
      <div class="zoom"><button id="zin" title="Zoom in">+</button><div class="zsep"></div><button id="zout" title="Zoom out">−</button><div class="zsep"></div><button id="zfit" title="Reset view">⤢</button></div>
      ${state.previewId ? previewHTML() : ''}`;
  }

  /* ---------- RIGHT  /* ---------- RIGHT PANEL ---------- */
  function panelHTML() {
    if (state.section === 'props' && state.propView === 'sector') return sectorPanelHTML();
    
    return `<div class="scroll" style="padding-top:16px;">
        <div style="display:flex;gap:6px;margin-bottom:20px;">
          <button class="quick-btn ${state.mapMode === 'original' ? 'on' : ''}" data-mode="original" style="${state.mapMode==='original'?'background:#0B1A36;color:#fff;border-color:#0B1A36':''}">Original Map</button>
          <button class="quick-btn ${state.mapMode === 'easy' ? 'on' : ''}" data-mode="easy" style="${state.mapMode==='easy'?'background:#0B1A36;color:#fff;border-color:#0B1A36':''}">Easy Map</button>
          <button class="quick-btn" id="qAllSectors">Sector Maps</button>
        </div>
        <div style="font-size:12px;font-weight:750;color:#A89F89;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Map Layers</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px">
          ${activeCategories().map(c => `
            <button class="layer-pill ${state.catId === c.id ? 'act' : ''}" data-cat="${c.id}">
              ${esc(c.label)}
            </button>`).join('')}
        </div>

        ${state.catId ? `
          <div style="font-size:12px;font-weight:750;color:#A89F89;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Select Items in ${esc(catById(state.catId).label)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px">
            ${catItems(state.catId).map(i => `
              <button class="item-chip ${state.selectedIds.has(i.id) ? 'act' : ''}" data-item="${i.id}" data-kind="${i.kind}">
                ${esc(i.name)}
              </button>`).join('')}
          </div>
        ` : ''}

        ${state.selectedIds.size > 0 ? `
          <div style="background:#F9F7F1;border:1px solid #EBE1CC;border-radius:14px;padding:14px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-size:12px;font-weight:750;color:#8A5E22;text-transform:uppercase;letter-spacing:1px;">Active Selection</span>
              <button id="clearAllItems" style="background:none;border:none;color:#16356A;font-weight:680;font-size:12.5px;cursor:pointer;padding:0;">Clear All</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${Array.from(state.selectedIds).map(id => `<span class="tray-chip" style="background:#fff;border:1px solid #DCD0B6;border-radius:8px;padding:5px 8px 5px 10px;font-size:12.5px;font-weight:650;display:flex;align-items:center;gap:6px;">${esc(itemObj(id).name)} <button data-unsel="${id}" style="border:none;background:none;cursor:pointer;color:#8A5E22;font-size:14px;line-height:1;padding:0;">&times;</button></span>`).join('')}
            </div>
          </div>
        ` : ''}

        ${state.selectedIds.size > 0 ? previewCardHTML() : (state.catId ? `
          <div style="background:#fff;border:1px solid #EBE1CC;border-radius:12px;padding:20px;text-align:center">
            <div style="color:#6A6150;font-size:14px;font-weight:550;line-height:1.5">
              All ${esc(catById(state.catId).label.toLowerCase())} are active on the map.<br>Select chips above to focus them and view context.
            </div>
          </div>
        ` : '')}
      </div>`;
  }
  function previewCardHTML() {
    const ids = Array.from(state.selectedIds);
    if (ids.length === 1) {
      const id = ids[0];
      const kind = itemKindOf(id);
      const it = itemObj(id);
      const cat = catById(itemCategory(id)) || { label: 'Value driver', color: '#16356A' };
      const hasPhotos = it.photos !== false;

      let metaLine = '';
      if (kind === 'block') {
        const props = propsInBlock(id);
        metaLine = `${props.length} available propert${props.length === 1 ? 'y' : 'ies'}`;
      } else {
        metaLine = it.sub || `Official ${cat.label.toLowerCase()}`;
      }

      return `<div class="preview-card" style="margin-top:12px; border:none; padding:0; box-shadow:none; background:transparent;">
        <div class="pc-cat" style="color:${cat.color}">${esc(cat.label)}</div>
        <div class="pc-name" style="font-size:24px; margin-bottom:6px;">${esc(it.name)}</div>
        <div class="pc-desc" style="color:#6A6150; font-size:14px; margin-bottom:16px;">${esc(metaLine)}</div>
        
        <div class="pc-photo-area" style="width:100%; height:180px; border-radius:12px; background:${hasPhotos ? PM.grads[itemCategory(id)] || '#A0AAB5' : '#F4EFE6'}; display:flex; align-items:center; justify-content:center; margin-bottom:16px; position:relative; overflow:hidden;">
          ${hasPhotos ? `
             <span style="color:rgba(255,255,255,0.9); font-weight:600; font-size:14px; position:relative; z-index:2">Preview Available</span>
          ` : `
             <span style="color:#A89F89; font-weight:600; font-size:13px;">Photos/context can be added here</span>
          `}
        </div>

        <div class="pc-actions" style="display:flex; gap:8px;">
          ${hasPhotos ? `<button class="btn-primary" data-photos="${id}" style="flex:1;">View Gallery</button>` : ''}
          ${kind === 'block' ? `<button class="pc-ghost" data-viewprops="${id}" style="flex:1;">Properties</button>` : ''}
          <button class="pc-ghost" data-focus="${id}" style="${hasPhotos || kind === 'block' ? 'flex:none; padding:0 16px;' : 'flex:1;'}">Focus Map</button>
          ${it.mapsUrl ? `<a href="${it.mapsUrl}" target="_blank" rel="noopener" class="pc-ghost" style="flex:none; padding:0 16px; text-decoration:none; display:flex; align-items:center;">Map</a>` : ''}
        </div>
      </div>`;
    }
    
    // Multiple items selected
    let roadsCount = 0, blocksCount = 0, zonesCount = 0;
    ids.forEach(id => {
      const k = itemKindOf(id);
      if (k === 'line') roadsCount++;
      else if (k === 'block') blocksCount++;
      else zonesCount++;
    });
    
    const parts = [];
    if (roadsCount) parts.push(`${roadsCount} road${roadsCount>1?'s':''}`);
    if (blocksCount) parts.push(`${blocksCount} block${blocksCount>1?'s':''}`);
    if (zonesCount) parts.push(`${zonesCount} zone${zonesCount>1?'s':''}`);
    
    return `<div class="preview-card" style="margin-top:12px; border:none; padding:0; box-shadow:none; background:transparent;">
      <div class="pc-cat" style="color:#A89F89">MULTIPLE SELECTION</div>
      <div class="pc-name" style="font-size:24px; margin-bottom:6px;">Context Overview</div>
      <div class="pc-desc" style="color:#6A6150; font-size:14px; margin-bottom:16px;">${parts.join(', ')} selected</div>
      <div class="pc-photo-area" style="width:100%; height:140px; border-radius:12px; background:#F4EFE6; display:flex; align-items:center; justify-content:center; margin-bottom:16px; position:relative; overflow:hidden;">
        <span style="color:#A89F89; font-weight:600; font-size:13px;">Photos/context can be added here</span>
      </div>
    </div>`;
  }
  function sectorPanelHTML() {
    const p = propById(state.selectedId);
    if (p) return `<div class="head" style="padding-bottom:14px">
        <button class="backlink" id="backToProperty">‹ Back to property</button>
        <div class="serif" style="font-size:26px;font-weight:560;margin-top:10px">${esc(p.block)} · Plot ${esc(p.plotNumber)}</div>
        <div style="font-size:13.5px;color:#9C957F;font-weight:600;margin-top:3px">${esc(p.area)} · ${esc(p.size)}</div></div>
      <div class="scroll">
        <div style="display:flex;flex-wrap:wrap;gap:8px"><span class="tagchip">${esc(p.plotType)}</span><span class="tagchip">${esc(p.roadFacing)}</span></div>
        ${p.near.length ? `<div class="rel-h">Nearby value drivers</div><div style="display:flex;flex-wrap:wrap;gap:8px">${p.near.map(n => `<span class="driver-chip">◆ ${esc(driverName(n))}</span>`).join('')}</div>` : ''}
        <button class="btn-ghost wfull" id="areaContext" style="height:48px;margin-top:20px;color:#16356A">Show Area Context →</button>
        <button class="btn-ghost wfull" id="backMaster2" style="height:46px;margin-top:10px">Back to Masterplan</button></div>`;
    const b = activeSectorMap();
    return `<div class="head" style="padding-bottom:14px">
        <button class="backlink" id="backToSectors">‹ All sector maps</button>
        <div class="serif" style="font-size:26px;font-weight:560;margin-top:10px">${b ? esc(b.name) : 'Sector Map'}</div>
        <div style="font-size:13.5px;color:#9C957F;font-weight:600;margin-top:3px">Exact layout — official sector map proof</div></div>
      <div class="scroll"><div class="note-soft">Pinch / scroll to zoom into the exact plots on this sector layout.</div>
        <button class="btn-ghost wfull" id="backMaster2" style="height:46px;margin-top:16px">Back to Masterplan</button></div>`;
  }
  function previewHTML() {
    const p = propById(state.previewId); if (!p) return '';
    const g = PM.grads.property[hash(p.id) % PM.grads.property.length];
    const sectorAction = hasSectorMap(p) ? `<button class="btn-ghost" style="padding:0 14px;height:44px;font-size:13px" data-sector="${p.id}">On Sector Map</button>` : '';
    return `<div class="preview">
      <div class="pv-ph"><span class="ph-fill" style="background:${g};position:absolute;inset:0"></span><span class="ph-tex" style="position:absolute;inset:0"></span><span class="ph-soon" style="position:absolute;left:0;right:0;bottom:10px;text-align:center;color:rgba(255,255,255,.8);font-size:11px;font-weight:650">Photo coming soon</span></div>
      <div class="pbody">
        <div style="display:flex;align-items:baseline;justify-content:space-between"><span style="font-size:22px;font-weight:800;letter-spacing:-.5px">${esc(p.size)}</span><span class="tagchip">Plot ${esc(p.plotNumber)}</span></div>
        <div style="font-size:13px;color:#7C7565;font-weight:600;margin-top:6px">${esc(p.block)} · ${esc(p.plotType)} · ${esc(p.roadFacing)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${p.near.map(n => `<span class="near-mini">◆ ${esc(driverName(n))}</span>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:14px"><button class="btn-primary" style="flex:1;height:44px;font-size:13.5px" data-details-prop="${p.id}">View Details</button>${sectorAction}</div>
        <button class="linklike" id="closePreview">Close</button></div></div>`;
  }

  /* ---------- FULL SCREENS ---------- */
  function fullHTML() {
    if (state.section === 'sectors') return sectorsHubHTML();
    if (state.section === 'props' && state.propView === 'detail') return detailHTML();
    return browseHTML();
  }
  function matchProp(p) {
    const f = state.filters;
    if (f.area.size && !f.area.has(p.area)) return false;
    if (f.size.size && !f.size.has(p.size)) return false;
    if (f.location.size && ![...f.location].some(l => p.near.includes(l))) return false;
    if (f.type.size && ![...f.type].some(t => p.plotType === t || p.roadFacing === t || (t === 'Road Facing' && /Road/.test(p.roadFacing)) || (t === 'Corner Plot' && /Corner/.test(p.roadFacing)) || (t === 'Park Facing' && /Park/.test(p.roadFacing)))) return false;
    return true;
  }
  function browseHTML() {
    const list = mapProperties().filter(matchProp);
    const active = ['type', 'area', 'location', 'size'].reduce((n, k) => n + state.filters[k].size, 0);
    const grp = (key) => { const g = DS.filters[key]; return `<div class="fgroup"><div class="fglabel">${g.label}</div><div class="fchips">${g.values.map(v => { const val = v.val || v, lab = v.label || v; const on = state.filters[key].has(val); return `<button class="fchip ${on ? 'on' : ''}" data-fk="${key}" data-fv="${esc(val)}">${esc(lab)}</button>`; }).join('')}</div></div>`; };
    return `<div class="full-in">
      <div class="eyebrow">Selected properties</div>
      <div class="serif" style="font-size:40px;font-weight:560;letter-spacing:-1px;line-height:1.02;margin-top:6px">${esc(area().name)} Properties</div>
      <div class="filters">${grp('type')}${grp('area')}${grp('location')}${grp('size')}${active ? '<button class="clear-all" id="clearF">Clear all filters</button>' : ''}</div>
      ${list.length ? `<div class="grid-cards">${list.map(cardHTML).join('')}</div>` : `<div class="empty" style="background:#fff; border:1px solid #EBE1CC; border-radius:18px; padding:60px 40px; margin-top:24px;"><div style="font-size:36px; margin-bottom:12px;">🔍</div><div style="font-size:18px; font-weight:700; color:#0B1A36;">No properties match</div><div style="font-size:14px; margin-top:6px; color:#6B6456;">Try adjusting your filters to see more results.</div><button class="btn-ghost" id="clearF2" style="margin:6px auto 0; height:42px; padding:0 18px">Clear all filters</button></div>`}
    </div>`;
  }
  function cardHTML(p) {
    const g = PM.grads.property[hash(p.id) % PM.grads.property.length]; const near = p.near.map(n => driverName(n))[0];
    const sectorAction = hasSectorMap(p) ? `<button class="btn-primary" style="flex:1;height:48px;font-size:14px" data-sector="${p.id}">View on Sector Map</button>` : '';
    return `<div class="pcard">
      <div class="ph-wrap" data-details-prop="${p.id}"><span class="ph-fill" style="background:${g};position:absolute;inset:0"></span><span class="ph-tex" style="position:absolute;inset:0"></span><span class="ph-cam"></span><span class="ph-soon" style="position:absolute;left:0;right:0;bottom:13px;text-align:center;color:rgba(255,255,255,.8);font-size:11px;font-weight:650">Photo coming soon</span>
        <span class="av-badge"><span style="width:7px;height:7px;border-radius:50%;background:#1C8A57"></span>Available</span>${near ? `<span class="near-badge">◆ ${esc(near)}</span>` : ''}</div>
      <div class="cbody"><div class="size-xl">${esc(p.size)}</div>
        <div style="font-size:16px;font-weight:700;color:#2E2A22;margin-top:9px">${esc(p.block)} · Plot ${esc(p.plotNumber)}</div>
        <div style="font-size:13.5px;color:#7C7565;font-weight:580;margin-top:5px">${esc(p.area)} · ${esc(p.plotType)} · ${esc(p.roadFacing)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:11px">${p.near.map(n => `<span class="near-mini">◆ ${esc(driverName(n))}</span>`).join('')}</div>
        <div style="display:flex;gap:9px;margin-top:15px">${sectorAction}<button class="btn-ghost" style="padding:0 16px;height:48px;font-size:14px" data-details-prop="${p.id}">Details</button></div></div></div>`;
  }
  function detailHTML() {
    const p = propById(state.selectedId); if (!p) return browseHTML();
    const ph = photosFor('property', p.id, 4);
    const meta = [['Plot type', p.plotType], ['Road facing', p.roadFacing], ['Block / pocket', p.block], ['Sector / area', p.area], ['Plot number', p.plotNumber], ['Availability', p.availability]];
    const sectorAction = hasSectorMap(p) ? `<button class="btn-primary" style="flex:1;height:56px;font-size:16px" data-sector="${p.id}">View on Sector Map</button>` : '';
    return `<div class="full-in" style="max-width:1040px;padding-top:0;animation:riseIn .22s ease">
      <div class="detail-head"><button class="backlink" id="backBrowse" style="font-size:14px;padding:8px 0">‹ Back to properties</button></div>
      <div style="display:grid;grid-template-columns:1.12fr 1fr;gap:30px;margin-top:8px;align-items:start">
        <div>${photo(ph[0].grad, 332, `data-lb="0"`)}<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">${ph.slice(1, 4).map((x, i) => photo(x.grad, 84, `data-lb="${i + 1}"`)).join('')}</div></div>
        <div>
          <div class="avail-chip"><span style="width:7px;height:7px;border-radius:50%;background:#1C8A57"></span>Available</div>
          <div style="font-size:52px;font-weight:800;letter-spacing:-2px;line-height:.96;margin-top:14px">${esc(p.size)}</div>
          <div style="font-size:21px;font-weight:730;letter-spacing:-.5px;color:#2E2A22;margin-top:8px">${esc(p.block)} · Plot ${esc(p.plotNumber)}</div>
          <div class="meta-box">${meta.map(([k, v]) => `<div class="meta-row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
          <div class="rel-h">Nearby landmarks &amp; value drivers</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">${p.near.map(n => `<span class="driver-chip">◆ ${esc(driverName(n))}</span>`).join('')}</div>
          <div style="display:flex;gap:11px;margin-top:24px">${sectorAction}<button class="btn-ghost" style="flex:1;height:56px;font-size:15px;color:#16356A" data-areacontext="${p.id}">Show Area Context</button></div>
          <button class="btn-ghost wfull" style="height:46px;margin-top:11px;color:#7C7565;font-weight:640" id="sendLater">Send Details Later</button></div></div></div>`;
  }
  function sectorsHubHTML() {
    const q = state.secQ.trim().toLowerCase();
    let list = readySectorMaps();
    if (state.secArea !== 'all') list = list.filter(s => s.area === state.secArea);
    if (q) list = list.filter(s => (s.name + ' ' + s.block).toLowerCase().includes(q));
    const areas = [...new Set(readySectorMaps().map(s => s.area))];
    const chips = [['all', 'All']].concat(areas.map(a => [a, a]));
    return `<div class="full-in">
      <div class="eyebrow">Exact plot proof</div>
      <div class="serif" style="font-size:40px;font-weight:560;letter-spacing:-1px;line-height:1.02;margin-top:6px">Sector Maps</div>
      <div class="chips" style="margin-top:16px">${chips.map(([v, l]) => `<button class="chip ${state.secArea === v ? 'on' : ''}" data-secarea="${v}">${l}</button>`).join('')}</div>
      <div class="search"><span class="ic"></span><input id="secSearch" value="${esc(state.secQ)}" placeholder="Search sector or block… e.g. Block A, Aerotropolis"></div>
      ${list.length ? `<div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin-top:22px">${list.map(secCardHTML).join('')}</div>` : `<div class="empty" style="background:#fff; border:1px solid #EBE1CC; border-radius:18px; padding:60px 40px; margin-top:24px;"><div style="font-size:36px; margin-bottom:12px;">🗺️</div><div style="font-size:18px; font-weight:700; color:#0B1A36;">No sector maps match</div><div style="font-size:14px; margin-top:6px; color:#6B6456;">Try adjusting your search or area filter.</div></div>`}
    </div>`;
  }
  function secCardHTML(s) {
    const block = mapBlocks().find(b => b.area === s.area && b.name === s.block);
    const accent = catColor(block ? block.cat : 'roads');
    return `<div class="seccard">
      <div class="sec-thumb" style="--a:${accent}"><span class="sec-grid"></span><span class="sec-big">${esc(s.block.replace(/[^A-Z0-9]/gi, '').slice(-2))}</span><span class="sec-tag ready">Ready</span></div>
      <div class="sec-body"><div class="sec-name">${esc(s.block)}</div><div class="sec-area">${esc(s.area)}</div>
        <button class="btn-primary wfull" style="height:44px;margin-top:11px;font-size:13.5px" data-opensec="${s.id}">Open Sector Map</button></div></div>`;
  }
  function lightboxHTML() {
    const lb = state.lightbox; const ph = lb.photos[lb.index];
    return `<div class="lightbox" id="lbScrim"><div style="width:100%;max-width:760px" id="lbInner">
      <div class="lb-img"><span class="ph-fill" style="background:${ph.grad};position:absolute;inset:0"></span><span class="ph-tex" style="position:absolute;inset:0"></span><span class="ph-cam" style="position:absolute;top:46%;left:50%"></span>
        <div class="lb-cap">${esc(lb.name)} · Photo coming soon</div>
        ${lb.photos.length > 1 ? '<button class="lb-nav" style="left:14px" id="lbPrev">‹</button><button class="lb-nav" style="right:14px" id="lbNext">›</button>' : ''}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px"><span style="color:rgba(255,255,255,.6);font-size:13px;font-weight:600">${lb.index + 1} / ${lb.photos.length}</span>
        <button class="lb-close" id="lbClose">Close ×</button></div></div></div>`;
  }

  /* ====================== EVENTS ====================== */
  const on = (id, fn) => { const e = el(id); if (e) e.addEventListener('click', fn); };
  const each = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
  function bindPlan() {
    on('areaToggle', () => { state.areaMenuOpen = !state.areaMenuOpen; render(); });
    on('areaScrim', () => { state.areaMenuOpen = false; render(); });
    on('viewAllSectors', () => { Object.assign(state, { section: 'sectors', areaMenuOpen: false }); render(); });
    each('[data-sw]', b => b.addEventListener('click', async () => { const a = PM.areas.find(x => x.id === b.getAttribute('data-sw')); if (!a || !a.live) return; Object.assign(state, resetPlan({ areaId: a.id })); await useDataset(a.id); builtSig = ''; render(); }));
    on('tabMaster', () => { Object.assign(state, { section: 'master' }); builtSig = ''; render(); });
    on('tabProps', () => { Object.assign(state, { section: 'props', propView: 'browse', selectedId: null, previewId: null }); render(); });
    on('tabSectors', () => { Object.assign(state, { section: 'sectors' }); render(); });
    on('qAllMaps', () => { state.areaMenuOpen = true; render(); });
    on('qAllSectors', () => { Object.assign(state, { section: 'sectors' }); render(); });
    on('backMaster', () => { Object.assign(state, { section: 'master', propView: 'browse', selectedId: null, previewId: null, sectorBlock: null }); builtSig = ''; render(); });
    on('backMaster2', () => { Object.assign(state, { section: 'master', propView: 'browse', selectedId: null, previewId: null, sectorBlock: null }); builtSig = ''; render(); });
    on('presentBtn', () => { state.present = !state.present; render(); setTimeout(fit, 70); });

    each('[data-mode]', b => b.addEventListener('click', () => { state.mapMode = b.getAttribute('data-mode'); if (state.mapMode === 'original') state.showProps = false; builtSig = ''; render(); }));
    on('propSwitch', toggleProps);
    on('zin', () => zoomBtn(1.2)); on('zout', () => zoomBtn(1 / 1.2)); on('zfit', fit);

    each('[data-cat]', b => b.addEventListener('click', () => { state.catId = b.getAttribute('data-cat'); render(); }));
    on('backCats', () => { state.catId = null; state.selectedIds.clear(); state.itemOpen = false; render(); });
    each('[data-item]', b => b.addEventListener('click', () => selectItem(b.getAttribute('data-item'), b.getAttribute('data-kind'))));
    each('[data-photoico]', b => b.addEventListener('click', e => { e.stopPropagation(); const id = b.getAttribute('data-photoico'); state.selectedIds = new Set([id]); openLightbox(0); }));
    each('[data-photos]', b => b.addEventListener('click', () => { state.selectedIds = new Set([b.getAttribute('data-photos')]); openLightbox(0); }));
    
    // Multi-select tray actions
    on('clearAllItems', () => { state.selectedIds.clear(); render(); });
    each('[data-unsel]', b => b.addEventListener('click', e => { e.stopPropagation(); state.selectedIds.delete(b.getAttribute('data-unsel')); render(); }));
    
    each('[data-focus]', b => b.addEventListener('click', () => focusItem(b.getAttribute('data-focus'))));
    each('[data-viewprops]', b => b.addEventListener('click', () => { const bl = blockById(b.getAttribute('data-viewprops')); Object.assign(state, { section: 'props', propView: 'browse', filters: { type: new Set(), area: new Set(bl ? [bl.area] : []), location: new Set(), size: new Set() } }); render(); }));
    each('[data-blocksector]', b => b.addEventListener('click', () => { const bl = blockById(b.getAttribute('data-blocksector')); const sm = bl && readySectorMaps().find(s => s.area === bl.area && s.block === bl.name); if (sm) openSectorHub(sm.id); }));

    const lay = el('maplayer');
    if (lay) lay.addEventListener('click', e => {
      if (moved) return;
      const tag = e.target.closest('[data-tag]'); if (tag) { state.previewId = tag.getAttribute('data-tag'); refreshControls(); renderTags(); return; }
      const hit = e.target.closest('[data-hit]');
      if (hit) { const [k, id] = hit.getAttribute('data-hit').split(':'); selectItem(id, k); }
    });

    each('[data-lb]', b => b.addEventListener('click', () => openLightbox(+b.getAttribute('data-lb'))));
    on('closePreview', () => { state.previewId = null; refreshControls(); renderTags(); });
    each('[data-details-prop]', b => b.addEventListener('click', () => openDetail(b.getAttribute('data-details-prop'))));
    each('[data-sector]', b => b.addEventListener('click', () => openSector(b.getAttribute('data-sector'))));
    each('[data-areacontext]', b => b.addEventListener('click', () => showAreaContext(b.getAttribute('data-areacontext'))));

    // filters (multi-select)
    each('[data-fk]', b => b.addEventListener('click', () => { const k = b.getAttribute('data-fk'), v = b.getAttribute('data-fv'); const s = state.filters[k]; s.has(v) ? s.delete(v) : s.add(v); el('full').innerHTML = browseHTML(); bindPlan(); }));
    on('clearF', clearFilters); on('clearF2', clearFilters);

    // sector hub
    const ss = el('secSearch'); if (ss) ss.addEventListener('input', () => { state.secQ = ss.value; el('full').innerHTML = sectorsHubHTML(); bindPlan(); const r = el('secSearch'); if (r) { r.focus(); r.setSelectionRange(r.value.length, r.value.length); } });
    each('[data-secarea]', b => b.addEventListener('click', () => { state.secArea = b.getAttribute('data-secarea'); el('full').innerHTML = sectorsHubHTML(); bindPlan(); }));
    each('[data-opensec]', b => b.addEventListener('click', () => openSectorHub(b.getAttribute('data-opensec'))));

    on('backBrowse', () => { Object.assign(state, { propView: 'browse', selectedId: null }); render(); });
    on('backToProperty', () => { Object.assign(state, { section: 'props', propView: 'detail' }); builtSig = ''; render(); });
    on('backToSectors', () => { Object.assign(state, { section: 'sectors', propView: 'browse', selectedId: null, sectorBlock: null }); render(); });
    on('areaContext', () => showAreaContext(state.selectedId));
    on('sendLater', () => toast('Saved — share the details whenever you like.'));

    on('lbScrim', () => { state.lightbox = null; render(); });
    on('lbClose', () => { state.lightbox = null; render(); });
    const inner = el('lbInner'); if (inner) inner.addEventListener('click', e => e.stopPropagation());
    on('lbPrev', e => { e.stopPropagation(); state.lightbox.index = (state.lightbox.index - 1 + state.lightbox.photos.length) % state.lightbox.photos.length; render(); });
    on('lbNext', e => { e.stopPropagation(); state.lightbox.index = (state.lightbox.index + 1) % state.lightbox.photos.length; render(); });
  }
  function zoomBtn(f) { const r = wrap().getBoundingClientRect(); zoomAt(r.left + wrap().clientWidth / 2, r.top + wrap().clientHeight / 2, f); }
  function focusProps() { const ps = mapProperties(); if (!ps.length) return; const cx = ps.reduce((s, p) => { const b = blockById(p.blockId) || { x: 700, w: 100 }; return s + b.x + b.w / 2; }, 0) / ps.length; const cy = ps.reduce((s, p) => { const b = blockById(p.blockId) || { y: 500, h: 100 }; return s + b.y + b.h / 2; }, 0) / ps.length; setTimeout(() => focusBox(cx, cy, 760, 520, 1.7), 60); }
  function toggleProps() { state.showProps = !state.showProps; state.previewId = null; refreshControls(); updateMapOverlays(); if (state.showProps) focusProps(); else fit(); }
  function clearFilters() { state.filters = { type: new Set(), area: new Set(), location: new Set(), size: new Set() }; render(); }

  function selectItem(id, kind) {
    if (state.selectedIds.has(id)) {
       state.selectedIds.delete(id);
    } else {
       state.selectedIds.add(id);
    }
    state.itemOpen = false;
    state.catId = itemCategory(id);
    state.section = 'master';
    render();
  }
  function refreshControls() {
    const vp = el('mapwrap'); if (!vp) { render(); return; }
    vp.querySelectorAll('.mode-switch,.prop-switch,.zoom,.preview').forEach(n => n.remove());
    vp.insertAdjacentHTML('beforeend', mapControlsHTML());
    each('[data-mode]', b => b.addEventListener('click', () => { state.mapMode = b.getAttribute('data-mode'); if (state.mapMode === 'original') state.showProps = false; builtSig = ''; render(); }));
    on('propSwitch', toggleProps); on('zin', () => zoomBtn(1.2)); on('zout', () => zoomBtn(1 / 1.2)); on('zfit', fit);
    on('closePreview', () => { state.previewId = null; refreshControls(); renderTags(); });
    each('.preview [data-details-prop]', b => b.addEventListener('click', () => openDetail(b.getAttribute('data-details-prop'))));
    each('.preview [data-sector]', b => b.addEventListener('click', () => openSector(b.getAttribute('data-sector'))));
  }
  function openDetail(id) { Object.assign(state, { section: 'props', propView: 'detail', selectedId: id, previewId: null }); render(); }
  function openSector(id) {
    const p = propById(id), sm = sectorMapForProperty(p);
    if (!p || !sm) return;
    Object.assign(state, { section: 'props', propView: 'sector', selectedId: id, sectorBlock: sm.id, previewId: null, sectorFrom: state.section });
    builtSig = '';
    render();
  }
  function openSectorHub(smId) { if (!sectorMapById(smId)) return; Object.assign(state, { section: 'props', propView: 'sector', selectedId: null, sectorBlock: smId, previewId: null }); builtSig = ''; render(); }
  function showAreaContext(id) { const p = propById(id); Object.assign(state, { section: 'master', mapMode: 'easy', showProps: true, selectedId: id, selectedIds: new Set([id]), itemOpen: false, previewId: id }); builtSig = ''; render(); if (p) { const b = blockById(p.blockId); if (b) setTimeout(() => focusBox(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, 1.7), 80); } }
  function openLightbox(idx) {
    let photos, name;
    if (state.section === 'props' && state.propView === 'detail') { photos = photosFor('property', state.selectedId, 4); name = 'Plot ' + (propById(state.selectedId) || {}).plotNumber; }
    else if (state.selectedIds.size === 1) { const id = Array.from(state.selectedIds)[0]; const it = itemObj(id); photos = photosFor(itemKindOf(id) === 'line' ? 'line' : (itemCategory(id) || 'pin'), photoKeyOf(id, itemKindOf(id)), 4); name = it ? it.name : ''; }
    else { photos = photosFor('property', state.selectedId || 'x', 4); name = ''; }
    state.lightbox = { photos, index: idx || 0, name: name || '' }; render();
  }
  function toast(msg) { let t = el('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = '0', 1900); }

  window.addEventListener('resize', () => { if (state.space === 'plan') fit(); });
  await useDataset(state.areaId);
  render();
})();
