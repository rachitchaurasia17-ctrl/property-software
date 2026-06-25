/* PlotMap — client-facing app (Aerocity / Aerotropolis). Framework-free. */
(async function () {
  const PM = window.PM;
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- reusable map engine: resolve the active dataset + its geometry ---- */
  let PM_MANIFEST = null;
  const verifiedManifestMaps = () => {
    if (!PM_MANIFEST || !PM_MANIFEST.entries) return [];
    return PM_MANIFEST.entries.filter(e => 
      e.usable === true && e.reviewNeeded === false && e.processingStatus === 'processed' &&
      (!e.duplicateGroupId || e.recommendedKeep === true)
    );
  };

  let DS = null, GEO = { viewBox: '0 0 4599 3069', cyan: [], red: [], black: [] };
  let EW = 1440, EH = 960, IW = 4599, IH = 3069;
  // Easy Map viewport, in REAL geometry space (same coordinates as the Original
  // Map / geo.json). Computed in easySVG() from the bounding box of the actual
  // traced paths so the Easy Map is a framed, spatially-accurate trace — never
  // an invented layout. EOX/EOY = top-left offset; EGW/EGH = framed width/height.
  let EOX = 0, EOY = 0, EGW = 1440, EGH = 960;
  const geoCache = {};
  async function useDataset(areaId) {
    const ds = PM.datasetFor(areaId); if (!ds) return;
    DS = ds; EW = ds.EASY_W; EH = ds.EASY_H; IW = ds.IMG_W; IH = ds.IMG_H;
    const gp = ds.assets && ds.assets.overlayGeo;
    if (gp) { if (!geoCache[gp]) geoCache[gp] = await fetch(gp).then(r => r.json()).catch(() => ({ viewBox: `0 0 ${IW} ${IH}`, cyan: [], red: [], black: [] })); GEO = geoCache[gp]; }
    else GEO = { viewBox: `0 0 ${IW} ${IH}`, cyan: [], red: [], black: [] };
  }

  const supabaseUrl = 'https://czmkfmkmgqlienmdihul.supabase.co';
  const supabaseKey = 'sb_publishable_DGqcs0JaDVgzImUGGgg_FQ_Q_SkgnhX';
  const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

  const state = {
    space: 'area', areaId: 'aerotropolis', areaMenuOpen: false,
    prebuiltMaps: [], activeLetter: null,
    section: 'master', mapMode: 'original', showProps: false,
    activeCats: new Set(), displayCatId: null, selectedIds: new Set(), itemOpen: false,
    propView: 'browse', selectedId: null, previewId: null, sectorBlock: null, sectorFrom: null,
    filters: { type: new Set(), area: new Set(), location: new Set(), size: new Set(), blockId: new Set() },
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
  const blockById = (id) => mapBlocks().find(b => b.id === id);
  const roadById = (id) => keyRoads().find(r => r.id === id);
  const zoneById = (id) => mapZones().find(z => z.id === id);
  const pinById = (id) => mapPins().find(p => p.id === id);
  const mapProperties = () => (DS.properties || []).filter(p => p && p.clientVisible !== false && p.id && p.plotNumber && p.blockId && blockById(p.blockId));
  const propById = (id) => mapProperties().find(p => p.id === id);
  const propsInBlock = (blockId) => mapProperties().filter(p => p.blockId === blockId);

  const scopedRoads = () => state.activeCats.size > 0 ? keyRoads().filter(r => state.activeCats.has('roads')) : keyRoads();
  const scopedBlocks = () => state.activeCats.size > 0 ? mapBlocks().filter(b => state.activeCats.has(b.cat)) : mapBlocks();
  const scopedZones = () => state.activeCats.size > 0 ? mapZones().filter(z => state.activeCats.has(z.cat)) : mapZones();
  const scopedPins = () => state.activeCats.size > 0 ? mapPins().filter(p => state.activeCats.has(p.cat)) : mapPins();
  const scopedProperties = () => state.activeCats.size > 0 ? mapProperties().filter(p => { const b = blockById(p.blockId); return b && state.activeCats.has(b.cat); }) : mapProperties();

  const readySectorMaps = verifiedManifestMaps;
  const sectorMapById = (id) => readySectorMaps().find(s => s.id === id);
  const sectorMapForProperty = (p) => {
    if (!p) return null;
    const blk = (p.block || '').toLowerCase().replace(/ /g,'-');
    return readySectorMaps().find(s => 
      (s.matchKey && s.matchKey.toLowerCase() === blk) ||
      (s.sectorOrBlockName && s.sectorOrBlockName.toLowerCase() === (p.block || '').toLowerCase())
    );
  };
  const sectorMapForItem = (id) => {
    const it = itemObj(id);
    if (!it) return null;
    const n = (it.name || '').toLowerCase();
    const cleanN = n.replace(/ /g,'-');
    return readySectorMaps().find(s => 
      (s.matchKey && s.matchKey.toLowerCase() === cleanN) ||
      (s.sectorOrBlockName && s.sectorOrBlockName.toLowerCase() === n)
    );
  };
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
  const inCatItem = (id) => { const cid = getCatId(); return cid && catItems(cid).some(i => i.id === id); };

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
    const o = itemObj(id); if (!o) return;
    const kind = itemKindOf(id);
    // Prefer the real traced geometry (geo.json) so focus is geographically
    // accurate and works on both Original and Easy maps. geoToLayer() converts
    // real coordinates into the current layer's pixel space.
    if (o.svgId && GEO.paths && GEO.paths[o.svgId]) {
      const b = pathBounds(GEO.paths[o.svgId]);
      const [cx, cy] = geoToLayer((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
      focusBox(cx, cy, Math.max(b.maxX - b.minX, 300), Math.max(b.maxY - b.minY, 300), kind === 'pin' ? 2 : 1.7);
      return;
    }
    // Fallback for items without traced geometry (schematic coords).
    if (kind === 'block' || kind === 'zone') { focusBox(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, 1.7); }
    else if (kind === 'pin') { focusBox(o.at[0], o.at[1], 260, 260, 1.5); }
  }
  function pathPoints(d) { return (d.match(/-?\d+(\.\d+)?/g) || []).map(Number).reduce((a, n, i, arr) => { if (i % 2 === 0) a.push([n, arr[i + 1]]); return a; }, []); }
  /* --- real-geometry helpers (shared by Original + Easy maps) ---
     pathBounds parses an SVG path (M/L/H/V/C/Z) and returns its bounding box in
     real geometry space. pathCenter returns its centre. geoToLayer maps a real
     coordinate into the active layer's pixel space: the Easy Map is framed to the
     geometry bbox (subtract EOX/EOY); the Original Map is 1:1 with geo space. */
  function pathBounds(d) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, cx = 0, cy = 0;
    const upd = () => { if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy; };
    const re = /([MLHVCZmlhvcz])([^MLHVCZmlhvcz]*)/g; let m;
    while ((m = re.exec(d)) !== null) {
      const cmd = m[1].toUpperCase(); if (cmd === 'Z') continue;
      const a = [...m[2].matchAll(/-?\d+(\.\d+)?/g)].map(x => parseFloat(x[0]));
      if (cmd === 'H') { a.forEach(x => { cx = x; upd(); }); }
      else if (cmd === 'V') { a.forEach(y => { cy = y; upd(); }); }
      else if (cmd === 'C') { for (let i = 0; i < a.length; i += 6) { cx = a[i + 4]; cy = a[i + 5]; upd(); [[a[i], a[i + 1]], [a[i + 2], a[i + 3]]].forEach(([px, py]) => { if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; }); } }
      else { for (let i = 0; i < a.length; i += 2) { cx = a[i]; cy = a[i + 1]; upd(); } }
    }
    return { minX, minY, maxX, maxY };
  }
  function pathCenter(d) { const b = pathBounds(d); return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 }; }
  const geoToLayer = (gx, gy) => mapKind() === 'easy' ? [gx - EOX, gy - EOY] : [gx, gy];

  /* ====================== MAP build ====================== */
  const getCatId = () => {
    if (state.displayCatId) return state.displayCatId;
    if (state.activeCats.size > 0) return Array.from(state.activeCats).pop();
    return null;
  };
  function mapKind() { if (state.section === 'markings') return 'markings'; if (state.section === 'props' && state.propView === 'sector') return 'sector'; return state.mapMode === 'original' ? 'original' : 'easy'; }
  function buildMap() {
    const kind = mapKind(); const sig = state.areaId + '|' + kind; const fresh = sig !== builtSig;
    const l = layer(); if (!l) return;
    let html = '';
    if (kind === 'easy') {
      // easySVG() computes the geometry frame (EGW/EGH) before we size the layer
      html = easySVG(); LW = EGW; LH = EGH;
    } else { LW = 3880; LH = 3069; }
    l.style.width = LW + 'px'; l.style.height = LH + 'px';
    l.className = 'maplayer ' + kind;
    if (kind === 'original') l.innerHTML = `<img class="orig" src="${DS.assets.original}" alt="Official masterplan">` + origSVG();
    else if (kind === 'markings') l.innerHTML = `<img class="orig" src="/public/plotmap-assets/markings.png" alt="Masterplan Marking">`;
    else if (kind === 'sector') { const sm = activeSectorMap(); const sectorAsset = (sm && sm.bestProcessedPath) || DS.assets.sector; l.innerHTML = `<div class="sector-wrap" style="width:${LW}px;height:${LH}px;background-image:url('${sectorAsset}')"></div><div id="proofG"></div>`; }
    else l.innerHTML = html;
    builtSig = sig; updateMapOverlays();
    if (fresh) requestAnimationFrame(fit); else applyT(false);
  }

  /* ---------- EASY MAP (premium, geometry-accurate explanation layer) ----------
     The Easy Map is a CLEANED, PREMIUM TRACE of the official masterplan: it draws
     the SAME real geometry as the Original Map (geo.json paths, in real IMG
     coordinate space) — no photo, calm Apple-Maps-style styling. No invented
     blocks and no approximate grid; every shape is the actual traced boundary.
     Items without a traced path (no svgId in geo.json — e.g. future-growth or
     green areas not yet traced) are intentionally NOT drawn and must be traced
     first (see EASY-MAP-PIPELINE.md). Interaction hooks (.eg-road/.eg-block/
     .eg-zone/.eg-pin, data-hit, data-roadpath/-bid/-zid/-pid, #eSpot, #eglow,
     #tagG) drive updateMapOverlays() and event binding. */
  const roadTier = (r) => r.tier || 'arterial';
  const hasGeo = (o) => !!(o && o.svgId && GEO.paths && GEO.paths[o.svgId]);
  function easySVG() {
    // Always draw the FULL traced geometry so the frame is stable and context
    // never disappears. Selection/category only dims + highlights (Apple-Maps
    // style), so picking a block does not reframe or hide the rest of the map.
    const roads  = keyRoads().filter(hasGeo);
    const blocks = mapBlocks().filter(hasGeo);
    const zones  = mapZones().filter(hasGeo);
    const pins   = mapPins().filter(hasGeo);

    // Frame the Easy Map to the bounding box of the real geometry being shown.
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const acc = (d) => { const b = pathBounds(d); if (b.minX < bx0) bx0 = b.minX; if (b.minY < by0) by0 = b.minY; if (b.maxX > bx1) bx1 = b.maxX; if (b.maxY > by1) by1 = b.maxY; };
    [roads, blocks, zones, pins].forEach(arr => arr.forEach(o => acc(GEO.paths[o.svgId])));
    if (!isFinite(bx0)) { const vb = (GEO.viewBox || `0 0 ${IW} ${IH}`).split(/\s+/).map(Number); bx0 = vb[0]; by0 = vb[1]; bx1 = vb[0] + vb[2]; by1 = vb[1] + vb[3]; }
    const pad = 150;
    EOX = bx0 - pad; EOY = by0 - pad; EGW = (bx1 - bx0) + pad * 2; EGH = (by1 - by0) + pad * 2;

    const roadsHTML = roads.map(r => `<path d="${GEO.paths[r.svgId]}" class="eg-road-casing tier-${roadTier(r)}"/>`).join('')
      + roads.map(r => `<path d="${GEO.paths[r.svgId]}" class="eg-road tier-${roadTier(r)}" data-roadpath="${r.id}"/>`).join('')
      + roads.map(r => `<path d="${GEO.paths[r.svgId]}" class="eg-road-hit" data-hit="line:${r.id}"/>`).join('');

    const blocksHTML = blocks.map(b => {
      const c = b.color || catColor(b.cat); const ctr = pathCenter(GEO.paths[b.svgId]);
      const short = (b.name || '').replace(/^(Block|Sector|Pocket)\s+/i, '');
      return `<g class="eg-block cat-${b.cat}" data-hit="block:${b.id}" data-bid="${b.id}" style="--egc:${c}">
        <path d="${GEO.paths[b.svgId]}" class="egfill"/>
        <text x="${ctr.cx}" y="${ctr.cy}" class="eg-blabel">${esc(short)}</text></g>`;
    }).join('');

    const zonesHTML = zones.map(z => {
      const c = catColor(z.cat); const ctr = pathCenter(GEO.paths[z.svgId]);
      const short = (z.name || '').replace(/^(Commercial Zone|Zone)\s+/i, '');
      return `<g class="eg-zone cat-${z.cat}" data-hit="zone:${z.id}" data-zid="${z.id}" style="--egc:${c}">
        <path d="${GEO.paths[z.svgId]}" class="egfill"/>
        <text x="${ctr.cx}" y="${ctr.cy}" class="eg-zlabel">${esc(short)}</text></g>`;
    }).join('');

    const pinsHTML = pins.map(p => {
      const c = catColor(p.cat); const ctr = pathCenter(GEO.paths[p.svgId]);
      return `<g class="eg-pin cat-${p.cat}" data-hit="${itemKindOf(p.id)}:${p.id}" data-pid="${p.id}" style="--egc:${c}">
        <circle cx="${ctr.cx}" cy="${ctr.cy}" r="20" class="eg-dot"/>
        <text x="${ctr.cx}" y="${ctr.cy - 34}" class="eg-plabel">${esc(p.name)}</text></g>`;
    }).join('');

    // Road name labels at each real road's geometric centre (geographically accurate).
    const roadLabels = roads.map(r => { const ctr = pathCenter(GEO.paths[r.svgId]); return `<g class="eg-rlabel-g tier-${roadTier(r)}" data-roadlabel="${r.id}"><text x="${ctr.cx}" y="${ctr.cy}" class="eg-rlabel">${esc(r.label || r.name)}</text></g>`; }).join('');

    return `<svg class="easy-svg eg-ov" viewBox="${EOX} ${EOY} ${EGW} ${EGH}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="easyBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F8F5EE"/><stop offset="100%" stop-color="#EFEADC"/></linearGradient>
        <filter id="eglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
      </defs>
      <rect x="${EOX}" y="${EOY}" width="${EGW}" height="${EGH}" fill="url(#easyBg)"/>
      <g id="egZones">${zonesHTML}</g>
      <g id="egBlocks">${blocksHTML}</g>
      <g id="egRoads">${roadsHTML}</g>
      <g id="egRoadLabels">${roadLabels}</g>
      <g id="egPins">${pinsHTML}</g>
      <g id="eSpot"></g>
    </svg><div id="tagG"></div>`;
  }

  /* ---------- ORIGINAL MAP overlay (real geometry highlights) ---------- */
  function origSVG() {
    const roadPaths = keyRoads().filter(r => r.svgId && GEO.paths && GEO.paths[r.svgId]);
    const casing = roadPaths.map(r => `<path d="${GEO.paths[r.svgId]}" class="o-road-case" style="--rfill:${catColor('roads')}" data-roadpath="${r.id}"/>`).join('');
    const lines = roadPaths.map(r => `<path d="${GEO.paths[r.svgId]}" class="o-road" style="--rfill:${catColor('roads')}" data-roadpath="${r.id}"/>`).join('');
    const hits = roadPaths.map(r => `<path d="${GEO.paths[r.svgId]}" class="o-hit" data-hit="line:${r.id}"/>`).join('');
    
    function getPathCenter(d) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let currX = 0, currY = 0;
      const regex = /([MLHVCZmlhvcz])([^MLHVCZmlhvcz]*)/g;
      let match;
      while ((match = regex.exec(d)) !== null) {
        const cmd = match[1].toUpperCase();
        if (cmd === 'Z') continue;
        const args = [...match[2].matchAll(/-?\d+(\.\d+)?/g)].map(m => parseFloat(m[0]));
        if (cmd === 'H') {
          args.forEach(x => { currX = x; updateBounds(); });
        } else if (cmd === 'V') {
          args.forEach(y => { currY = y; updateBounds(); });
        } else if (cmd === 'C') {
           for (let i = 0; i < args.length; i += 6) {
               currX = args[i+4]; currY = args[i+5]; updateBounds();
               let cx1=args[i], cy1=args[i+1], cx2=args[i+2], cy2=args[i+3];
               if (cx1 < minX) minX = cx1; if (cx1 > maxX) maxX = cx1;
               if (cy1 < minY) minY = cy1; if (cy1 > maxY) maxY = cy1;
               if (cx2 < minX) minX = cx2; if (cx2 > maxX) maxX = cx2;
               if (cy2 < minY) minY = cy2; if (cy2 > maxY) maxY = cy2;
           }
        } else if (cmd === 'M' || cmd === 'L') {
          for (let i = 0; i < args.length; i += 2) {
            currX = args[i]; currY = args[i+1];
            updateBounds();
          }
        }
      }
      function updateBounds() {
        if (currX < minX) minX = currX;
        if (currX > maxX) maxX = currX;
        if (currY < minY) minY = currY;
        if (currY > maxY) maxY = currY;
      }
      return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }

    const blockPaths = scopedBlocks().filter(b => b.svgId && GEO.paths && GEO.paths[b.svgId]);
    const blocksHTML = blockPaths.map(b => {
      const center = getPathCenter(GEO.paths[b.svgId]);
      let cx = center.cx;
      let cy = center.cy;
      let shortLabel = b.name.replace(/^(Block|Sector|Pocket)\s+/i, '');
      return `<path d="${GEO.paths[b.svgId]}" class="o-block" style="${b.color ? `--bfill:${b.color}` : ''}" data-itempath="${b.id}" data-hit="block:${b.id}"/><text x="${cx}" y="${cy}" class="o-block-lbl" data-itempath="${b.id}">${esc(shortLabel)}</text>`;
    }).join('');

    const zonePaths = scopedZones().filter(z => z.svgId && GEO.paths && GEO.paths[z.svgId]);
    const zonesHTML = zonePaths.map(z => {
      const center = getPathCenter(GEO.paths[z.svgId]);
      let cx = center.cx, cy = center.cy;
      let shortLabel = z.name.replace(/^(Commercial Zone|Zone)\s+/i, '');
      return `<path d="${GEO.paths[z.svgId]}" class="o-zone cat-${z.cat}" style="--zfill:${catColor(z.cat)}" data-itempath="${z.id}" data-hit="zone:${z.id}"/>
        <text x="${cx}" y="${cy}" class="o-zone-lbl cat-${z.cat}" data-itempath="${z.id}">${esc(shortLabel)}</text>`;
    }).join('');

    const pinsHTML = [];
    const addPin = (item, kind) => {
      let cx = 0, cy = 0;
      if (item.svgId && GEO.paths && GEO.paths[item.svgId]) {
         const center = getPathCenter(GEO.paths[item.svgId]);
         cx = center.cx; cy = center.cy;
      }
      else if (item.at) { cx = (item.at[0] / EW) * IW; cy = (item.at[1] / EH) * IH; }
      else if (item.w) { cx = ((item.x + item.w/2) / EW) * IW; cy = ((item.y + item.h/2) / EH) * IH; }
      else return;
      const c = catColor(item.cat);
      pinsHTML.push(`<g class="o-pin" data-hit="${kind}:${item.id}" data-itempath="${item.id}" style="transform:translate(${cx}px,${cy}px)">
        <g class="pin-inner">
          <ellipse cx="0" cy="-4" rx="12" ry="4" fill="rgba(0,0,0,0.25)" filter="blur(3px)"/>
          <path class="pin-shape" d="M 0 -80 H 112 A 28 28 0 0 1 140 -52 A 28 28 0 0 1 112 -24 H 14 L 0 0 L -14 -24 H -112 A 28 28 0 0 1 -140 -52 A 28 28 0 0 1 -112 -80 Z" fill="${c}" stroke="#ffffff" stroke-width="3.5" filter="drop-shadow(0 8px 12px rgba(0,0,0,0.25))"/>
          <text x="0" y="-49" class="pin-lbl" fill="#ffffff" text-anchor="middle" font-size="24" font-weight="750" font-family="'Inter', sans-serif" letter-spacing="0.3">${esc(item.name)}</text>
        </g>
      </g>`);
    };
    scopedBlocks().filter(b => !b.svgId || !GEO.paths || !GEO.paths[b.svgId]).forEach(b => addPin(b, 'block')); // Fallback
    scopedZones().filter(z => !z.svgId || !GEO.paths || !GEO.paths[z.svgId]).forEach(z => addPin(z, 'zone')); // Fallback
    scopedPins().forEach(p => addPin(p, 'pin'));

    return `<svg class="easy-svg orig-ov" viewBox="${GEO.viewBox || '0 0 4599 3069'}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="eglow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="15"/>
        </filter>
        <pattern id="commercial-hatch" width="30" height="30" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="30" height="30" fill="color-mix(in srgb, #F05A28 25%, transparent)"/>
          <line x1="0" y1="0" x2="0" y2="30" stroke="#F05A28" stroke-width="8" stroke-opacity="0.4"/>
        </pattern>
      </defs>
      <g id="oRoadCase">${casing}</g>
      <g id="oBlocks">${blocksHTML}</g>
      <g id="oZones">${zonesHTML}</g>
      <g id="oRoads">${lines}</g>
      <g id="oPins">${pinsHTML.join('')}</g>
      <g id="oSpot"></g>
      <g id="oHit">${hits}</g>
    </svg>`;
  }

  /* ---------- overlays: highlight / declutter / spotlight ---------- */
  function updateMapOverlays() {
    const kind = mapKind(); const l = layer(); if (!l) return;
    if (kind === 'sector') { renderProof(); return; }
    const selIds = state.selectedIds;
    const hasSel = selIds.size > 0;
    const dimAll = hasSel || state.activeCats.size > 0;
    const relate = (id, k) => { // is this item active (selected or in selected category)?
      if (hasSel) return selIds.has(id);
      if (state.activeCats.size > 0) { const ic = (k === 'line') ? 'roads' : itemCategory(id); return state.activeCats.has(ic); }
      return true;
    };
    if (kind === 'easy') {
      // All real geometry stays visible (premium overview); selection/category emphasizes.
      l.querySelectorAll('.eg-road').forEach(p => { const id = p.getAttribute('data-roadpath'); const on = relate(id, 'line'); p.classList.toggle('act', on && (selIds.has(id) || state.activeCats.has('roads'))); p.classList.toggle('dim', !!dimAll && !on); });
      l.querySelectorAll('.eg-block').forEach(g => { const id = g.getAttribute('data-bid'); const on = relate(id, 'block'); g.classList.toggle('act', on && (selIds.has(id) || state.activeCats.has(itemCategory(id)))); g.classList.toggle('dim', !!dimAll && !on); });
      l.querySelectorAll('.eg-zone').forEach(g => { const id = g.getAttribute('data-zid'); const on = relate(id, 'zone'); g.classList.toggle('act', on && (selIds.has(id) || state.activeCats.has(itemCategory(id)))); g.classList.toggle('dim', !!dimAll && !on); });
      l.querySelectorAll('.eg-pin').forEach(g => { const id = g.getAttribute('data-pid'); const on = relate(id, 'pin'); g.classList.toggle('act', on && (selIds.has(id) || state.activeCats.has(itemCategory(id)))); g.classList.toggle('dim', (!!dimAll && !on) || (state.showProps && !hasSel && state.activeCats.size === 0)); });
      l.querySelectorAll('.eg-rlabel-g').forEach(g => { const id = g.getAttribute('data-roadlabel'); const on = relate(id, 'line'); g.classList.toggle('act', on && (selIds.has(id) || state.activeCats.has('roads'))); g.classList.toggle('dim', !!dimAll && !on); });
      // spotlight selected / active-category roads using the REAL road geometry
      const sp = l.querySelector('#eSpot'); if (sp) {
        let roadIds = [];
        if (hasSel) roadIds = Array.from(selIds).filter(s => itemKindOf(s) === 'line');
        else if (state.activeCats.has('roads')) roadIds = catItems('roads').map(i => i.id);
        const paths = roadIds.map(id => { const r = roadById(id); return r && GEO.paths && GEO.paths[r.svgId]; }).filter(Boolean);
        const widths = [[60, '#2BD0E6', '.4', 'url(#eglow)'], [40, '#0B2552', '1', ''], [20, '#fff', '1', ''], [10, '#2BD0E6', '1', '']];
        sp.innerHTML = paths.length ? widths.map(([w, col, op, flt]) =>
          `<g ${flt ? `filter="${flt}"` : ''} style="fill:none;stroke:${col};stroke-width:${w};opacity:${op};stroke-linecap:round;stroke-linejoin:round">${paths.map(d => `<path d="${d}"/>`).join('')}</g>`).join('') : '';
      }
      renderTags();
    } else if (kind === 'original') {
      l.querySelectorAll('.o-road, .o-road-case').forEach(p => { 
        p.classList.remove('act', 'show', 'soft');
        p.classList.add('hide');
      });
      l.querySelectorAll('.o-block, .o-zone, .o-block-lbl, .o-zone-lbl').forEach(p => { 
        const id = p.getAttribute('data-itempath'); 
        const on = relate(id, itemKindOf(id)); 
        const inCat = state.activeCats.size > 0 && state.activeCats.has(itemCategory(id));
        const isSel = selIds.has(id);
        
        const isActive = isSel || (inCat && on);
        
        p.classList.toggle('act', isActive);
        p.classList.toggle('soft', false);
        p.classList.toggle('show', false);
        p.classList.toggle('hide', !isActive);
      });
      l.querySelectorAll('.o-pin').forEach(g => {
        const id = g.getAttribute('data-itempath');
        const inCat = state.activeCats.size > 0 && state.activeCats.has(itemCategory(id));
        const isSel = selIds.has(id);
        // If the category is active, all pins in it should be visible. Or if this specific pin is selected.
        const isActive = isSel || inCat;
        g.classList.toggle('act', isSel);
        g.classList.toggle('soft', false);
        g.classList.toggle('hide', !isActive);
        g.classList.toggle('show', isActive);
      });
      const sp = l.querySelector('#oSpot'); if (sp) { sp.innerHTML = '';
        if (hasSel) {
           const lines = Array.from(selIds).filter(sel => itemKindOf(sel) === 'line');
           if (lines.length > 0) {
             const paths = lines.map(sel => GEO.paths[roadById(sel).svgId]).filter(Boolean);
             let html = '';
             html += `<g filter="url(#eglow)" style="fill:none;stroke:#2BD0E6;stroke-width:44;opacity:.4;stroke-linecap:round;stroke-linejoin:round">`;
             paths.forEach(d => { html += `<path d="${d}"/>`; });
             html += `</g>`;
             html += `<g style="fill:none;stroke:#0B2552;stroke-width:28;stroke-linecap:round;stroke-linejoin:round">`;
             paths.forEach(d => { html += `<path d="${d}"/>`; });
             html += `</g>`;
             html += `<g style="fill:none;stroke:#fff;stroke-width:14;stroke-linecap:round;stroke-linejoin:round">`;
             paths.forEach(d => { html += `<path d="${d}"/>`; });
             html += `</g>`;
             html += `<g style="fill:none;stroke:#2BD0E6;stroke-width:8;stroke-linecap:round;stroke-linejoin:round">`;
             paths.forEach(d => { html += `<path d="${d}"/>`; });
             html += `</g>`;
             sp.insertAdjacentHTML('beforeend', html);
           }
           let pinHtml = '';
           selIds.forEach(sel => {
             if (itemKindOf(sel) === 'pin') {
               const it = itemObj(sel); let cx = 0, cy = 0;
               if (it.at) { cx = (it.at[0] / EW) * IW; cy = (it.at[1] / EH) * IH; }
               const c = catColor(it.cat);
               pinHtml += `<g style="transform:translate(${cx}px,${cy}px)"><circle cx="0" cy="0" r="58" fill="${c}" opacity="0.3"/><circle cx="0" cy="0" r="42" fill="none" stroke="${c}" stroke-width="12"/></g>`;
             }
           });
           if (pinHtml) sp.insertAdjacentHTML('beforeend', pinHtml);
        } else if (state.activeCats.has('roads')) {
           const paths = catItems('roads').map(item => GEO.paths[roadById(item.id).svgId]).filter(Boolean);
           let html = '';
           html += `<g filter="url(#eglow)" style="fill:none;stroke:#2BD0E6;stroke-width:44;opacity:.4;stroke-linecap:round;stroke-linejoin:round">`;
           paths.forEach(d => { html += `<path d="${d}"/>`; });
           html += `</g>`;
           html += `<g style="fill:none;stroke:#0B2552;stroke-width:28;stroke-linecap:round;stroke-linejoin:round">`;
           paths.forEach(d => { html += `<path d="${d}"/>`; });
           html += `</g>`;
           html += `<g style="fill:none;stroke:#fff;stroke-width:14;stroke-linecap:round;stroke-linejoin:round">`;
           paths.forEach(d => { html += `<path d="${d}"/>`; });
           html += `</g>`;
           html += `<g style="fill:none;stroke:#2BD0E6;stroke-width:8;stroke-linecap:round;stroke-linejoin:round">`;
           paths.forEach(d => { html += `<path d="${d}"/>`; });
           html += `</g>`;
           sp.insertAdjacentHTML('beforeend', html);
        }
      }
      l.classList.toggle('dimmed', !!(hasSel || state.activeCats.size > 0));
    }
  }
  function renderTags() {
    const g = layer() && layer().querySelector('#tagG'); if (!g) return;
    if (!(state.mapMode === 'easy' && state.showProps && state.section === 'master')) { g.innerHTML = ''; return; }
    g.innerHTML = scopedProperties().map(p => {
      const b = blockById(p.blockId);
      let x, y;
      if (b && hasGeo(b)) { const bd = pathBounds(GEO.paths[b.svgId]); [x, y] = geoToLayer((bd.minX + bd.maxX) / 2, bd.minY); }
      else { x = EGW / 2; y = EGH / 2; }
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
  function resetPlan(extra) { return Object.assign({ section: 'master', mapMode: 'original', showProps: false, activeCats: new Set(), displayCatId: null, selectedIds: new Set(), previewIdx: 0, itemOpen: false, propView: 'browse', selectedId: null, previewId: null, sectorBlock: null, sectorFrom: null, areaMenuOpen: false, filters: { type: new Set(), area: new Set(), location: new Set(), size: new Set(), blockId: new Set() }, secQ: '', secArea: 'all' }, extra || {}); }

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
    const showBack = state.section !== 'master' && state.section !== 'markings';
    const split = state.section === 'master' || state.section === 'markings' || (state.section === 'props' && state.propView === 'sector');
    const full = !split;
    return `<div style="flex:1; display:flex; flex-direction:column; min-width:0; position:relative;">
      <div class="topbar">
        <div class="brand"><span class="logo"><i></i></span><span class="brand-name">PlotMap</span></div>
        <button class="area-switch" id="areaToggle"><span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.1"><span class="cur">${esc(area().name)}</span><span class="lab">View all maps</span></span><span class="caret">▾</span></button>
        <div class="divider"></div>
        <div style="display:flex;gap:3px"><button class="tab ${state.section === 'master' ? 'on' : ''}" id="tabMaster">Masterplan</button><button class="tab ${state.section === 'props' && state.propView !== 'sector' ? 'on' : ''}" id="tabProps">Properties</button><button class="tab ${state.section === 'sectors' ? 'on' : ''}" id="tabSectors">Sector Maps</button><button class="tab ${state.section === 'markings' ? 'on' : ''}" id="tabMarkings">Masterplan Marking</button></div>
        <div class="spacer"></div>
        <a href="/admin/editor.html" style="color:#A19B8D; font-size:12px; font-weight:600; text-decoration:none; margin-right:16px;">Editor</a>
        ${showBack ? '<button class="back-btn" id="backMaster"><span>‹</span> Back to Masterplan</button>' : ''}

        ${state.areaMenuOpen ? areaMenuHTML() : ''}
      </div>
      <div class="body" style="flex:1; display:flex; position:relative; min-height:0;">
        ${split ? `<div class="mapwrap" id="mapwrap"><div class="maplayer" id="maplayer"></div>${mapControlsHTML()}</div>`
          : `<div class="full" id="full">${fullHTML()}</div>`}
      </div>
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
    const LETTERS = ['A', 'B', 'C', 'D'];
    const prebuiltBtns = LETTERS.map(L => `<button class="transparent-btn ${state.activeLetter === L ? 'on' : ''}" data-prebuilt-label="${L}" title="Highlight set ${L}">${L}</button>`).join('');
    const divider = `<div class="divider" style="margin: 3px 6px; width:1px; background:#E1D6BF;"></div>`;
    return `${showModes ? `<div class="mode-switch"><button class="${state.mapMode === 'original' ? 'on' : ''}" data-mode="original">Original Map</button><button class="${state.mapMode === 'easy' ? 'on' : ''}" data-mode="easy">Easy Map</button>${divider}${prebuiltBtns}</div>` : ''}
      ${showModes && state.mapMode === 'easy' ? `<div class="prop-switch ${state.showProps ? 'on' : ''}" id="propSwitch"><span class="lbl">Show Properties</span><span class="knob"><i></i></span></div>` : ''}
      <div class="zoom"><button id="zin" title="Zoom in">+</button><div class="zsep"></div><button id="zout" title="Zoom out">−</button><div class="zsep"></div><button id="zfit" title="Reset view">⤢</button></div>
      ${state.previewId ? previewHTML() : ''}`;
  }

  /* ---------- RIGHT PANEL ---------- */
  function panelHTML() {
    if (state.section === 'props' && state.propView === 'sector') return sectorPanelHTML();
    
    const displayCatId = (state.selectedIds.size === 0 && state.activeCats.size === 0) ? 'roads' : getCatId();
    
    return `<div class="scroll" style="padding-top:16px;">
        ${state.selectedIds.size > 0 || displayCatId ? previewCardHTML(displayCatId) : ''}
        
        <div style="font-size:12px;font-weight:750;color:#A89F89;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;margin-top:${state.selectedIds.size > 0 || displayCatId ? '16px' : '0'}">Map Layers</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px">
          ${activeCategories().map(c => `
            <button class="layer-pill ${state.activeCats.has(c.id) ? 'act' : ''}" data-cat="${c.id}">
              ${esc(c.label)}
            </button>`).join('')}
        </div>

        ${displayCatId && catItems(displayCatId).some(i => i.kind !== 'pin') ? `
          <div style="font-size:12px;font-weight:750;color:#A89F89;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;margin-top:24px;">Select Items in ${esc(catById(displayCatId).label)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px">
            ${catItems(displayCatId).map(i => `
              <button class="item-chip ${state.selectedIds.has(i.id) ? 'act' : ''}" data-item="${i.id}" data-kind="${i.kind}">
                ${esc(i.name)}
              </button>`).join('')}
          </div>
        ` : ''}
      </div>`;
  }

  function previewCardHTML(fallbackCatId) {
    const ids = Array.from(state.selectedIds);
    let idx = state.previewIdx || 0;
    if (idx < 0 || idx >= ids.length) {
      idx = Math.max(0, ids.length - 1);
      state.previewIdx = idx;
    }
    
    let cat, name, metaLine, hasPhotos, id = null, kind = null, it = null;

    if (ids.length === 0 && fallbackCatId) {
      cat = catById(fallbackCatId) || { label: 'Category', color: '#16356A' };
      name = `All ${cat.label}`;
      metaLine = `Official ${cat.label.toLowerCase()}`;
      hasPhotos = true;
      id = fallbackCatId;
    } else {
      if (ids.length === 0) return '';
      id = ids[idx];
      kind = itemKindOf(id);
      it = itemObj(id);
      cat = catById(itemCategory(id)) || { label: 'Value driver', color: '#16356A' };
      hasPhotos = it.photos !== false;

      if (kind === 'block') {
        const props = propsInBlock(id);
        metaLine = `${props.length} available propert${props.length === 1 ? 'y' : 'ies'}`;
      } else {
        metaLine = it.sub || `Official ${cat.label.toLowerCase()}`;
      }
      name = it.name;
    }

    return `<div class="preview-card" style="margin-top:0; border:none; padding:0; box-shadow:none; background:transparent;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <div style="flex:1; padding-right:12px; min-width:0;">
          <div class="pc-cat" style="color:${cat.color}">${esc(cat.label)}</div>
          <div class="pc-name" style="font-size:24px; margin-bottom:6px; line-height:1.1;">${esc(name)}</div>
          <div class="pc-desc" style="color:#6A6150; font-size:14px;">${esc(metaLine)}</div>
        </div>
        ${ids.length > 0 ? `
        <div style="flex:none; max-width:180px; text-align:right;">
          <div style="font-size:10px; font-weight:750; color:#8A5E22; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">Active Selection <button id="clearAllItems" style="background:none;border:none;color:#16356A;font-weight:680;font-size:11px;cursor:pointer;padding:0;margin-left:4px;">Clear</button></div>
          <div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end;">
            ${ids.map(selId => `<span class="tray-chip" style="background:#F9F7F1;border:1px solid #EBE1CC;border-radius:6px;padding:3px 5px 3px 7px;font-size:11px;font-weight:650;display:flex;align-items:center;gap:3px;white-space:nowrap;color:#5A554A;">${esc(itemObj(selId).name)} <button data-unsel="${selId}" style="border:none;background:none;cursor:pointer;color:#8A5E22;font-size:14px;line-height:1;padding:0;transition:color .15s;">&times;</button></span>`).join('')}
          </div>
        </div>
        ` : ''}
      </div>
      
      <div class="pc-photo-area" style="width:100%; height:180px; border-radius:12px; background:${hasPhotos ? PM.grads[itemCategory(id) || id] || '#A0AAB5' : '#F4EFE6'}; display:flex; align-items:center; justify-content:center; margin-bottom:16px; position:relative; overflow:hidden;">
        ${hasPhotos ? `
           <span style="color:rgba(255,255,255,0.9); font-weight:600; font-size:14px; position:relative; z-index:2">Preview Available</span>
        ` : `
           <span style="color:#A89F89; font-weight:600; font-size:13px;">Photos/context can be added here</span>
        `}
      </div>

      <div class="pc-actions" style="display:flex; gap:8px; height:40px;">
        ${hasPhotos ? `<button class="btn-primary" data-photos="${id}" style="flex:1; max-width:200px;">View Gallery</button>` : ''}
        ${sectorMapForItem(id) ? `<button class="btn-primary" data-opensec="${sectorMapForItem(id).id}" style="flex:1; max-width:200px;">View Map</button>` : ''}
        <button class="pc-ghost" id="btnPreviewProps" style="flex:1; max-width:200px;">Properties</button>
        ${ids.length > 1 ? `
          <div style="display:flex; align-items:center; background:#F8FAFC; border-radius:8px; border:1px solid #EBE1CC; flex:1; justify-content:space-between; padding:0 12px; height:100%;">
            <button id="prevItemBtn" style="border:none; background:none; cursor:pointer; font-size:22px; line-height:1; color:#16356A; font-weight:700; padding:0;">&lsaquo;</button>
            <span style="font-size:12.5px; font-weight:650; color:#3F3A30;">Item ${idx + 1} of ${ids.length}</span>
            <button id="nextItemBtn" style="border:none; background:none; cursor:pointer; font-size:22px; line-height:1; color:#16356A; font-weight:700; padding:0;">&rsaquo;</button>
          </div>
        ` : ''}
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
        <div class="serif" style="font-size:26px;font-weight:560;margin-top:10px">${b ? esc(b.sectorOrBlockName) : 'Sector Map'}</div>
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
    if (f.blockId && f.blockId.size && !f.blockId.has(p.blockId)) return false;
    if (f.type.size && ![...f.type].some(t => p.plotType === t || p.roadFacing === t || (t === 'Road Facing' && /Road/.test(p.roadFacing)) || (t === 'Corner Plot' && /Corner/.test(p.roadFacing)) || (t === 'Park Facing' && /Park/.test(p.roadFacing)))) return false;
    return true;
  }
  function browseHTML() {
    const list = mapProperties().filter(matchProp);
    const active = ['type', 'area', 'location', 'size', 'blockId'].reduce((n, k) => n + state.filters[k].size, 0);
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
    if (state.secArea !== 'all') list = list.filter(s => (s.area || '').toLowerCase() === state.secArea.toLowerCase());
    if (q) list = list.filter(s => (s.sectorOrBlockName + ' ' + (s.area||'') + ' ' + (s.city||'')).toLowerCase().includes(q));
    const areas = [...new Set(list.map(s => s.area).filter(Boolean))];
    const chips = [['all', 'All']].concat(areas.map(a => [a, a]));
    return `<div class="full-in">
      <div class="eyebrow">Exact plot proof</div>
      <div class="serif" style="font-size:40px;font-weight:560;letter-spacing:-1px;line-height:1.02;margin-top:6px">Verified Sector Maps</div>
      <div style="font-size:16px; color:#6B6456; margin-top:8px; font-weight:600;">${list.length} available maps</div>
      <div class="chips" style="margin-top:16px">${chips.map(([v, l]) => `<button class="chip ${state.secArea === v ? 'on' : ''}" data-secarea="${v}">${l}</button>`).join('')}</div>
      <div class="search"><span class="ic"></span><input id="secSearch" value="${esc(state.secQ)}" placeholder="Search sector or block… e.g. Block A, Sector 20"></div>
      ${list.length ? `<div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin-top:22px">${list.map(secCardHTML).join('')}</div>` : `<div class="empty" style="background:#fff; border:1px solid #EBE1CC; border-radius:18px; padding:60px 40px; margin-top:24px;"><div style="font-size:36px; margin-bottom:12px;">🗺️</div><div style="font-size:18px; font-weight:700; color:#0B1A36;">No verified sector maps found.</div><div style="font-size:14px; margin-top:6px; color:#6B6456;">Check manifest filtering or processed asset paths.</div></div>`}
    </div>`;
  }
  function secCardHTML(s) {
    const block = mapBlocks().find(b => b.area === s.area && b.name === s.sectorOrBlockName);
    const accent = catColor(block ? block.cat : 'sectors');
    const thumb = s.thumbnailPath ? esc(s.thumbnailPath) : (s.originalPath ? esc(s.originalPath) : '');
    return `<div class="seccard">
      <div class="sec-thumb" style="--a:${accent}; background-image:url('${thumb}'); background-size:cover; background-position:center;">
        ${!thumb ? `<span class="sec-grid"></span><span class="sec-big">${esc((s.sectorOrBlockName || '').replace(/[^A-Z0-9]/gi, '').slice(-2))}</span>` : ''}
        <span class="sec-tag ready">Verified</span></div>
      <div class="sec-body"><div class="sec-name">${esc(s.sectorOrBlockName)}</div><div class="sec-area">${esc(s.city || '')}${s.city && s.area ? ' · ' : ''}${esc(s.area || '')}</div>
        <button class="btn-primary wfull" style="height:44px;margin-top:11px;font-size:13.5px" data-opensec="${s.id}">Open Map</button></div></div>`;
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
    on('tabMarkings', () => { Object.assign(state, { section: 'markings' }); builtSig = ''; render(); });
    on('tabProps', () => { Object.assign(state, { section: 'props', propView: 'browse', selectedId: null, previewId: null }); render(); });
    on('tabSectors', () => { Object.assign(state, { section: 'sectors' }); render(); });
    on('qAllMaps', () => { state.areaMenuOpen = true; render(); });
    on('qAllSectors', () => { Object.assign(state, { section: 'sectors' }); render(); });
    on('backMaster', () => { Object.assign(state, { section: 'master', propView: 'browse', selectedId: null, previewId: null, sectorBlock: null }); builtSig = ''; render(); });
    on('backMaster2', () => { Object.assign(state, { section: 'master', propView: 'browse', selectedId: null, previewId: null, sectorBlock: null }); builtSig = ''; render(); });
    on('presentBtn', () => { state.present = !state.present; render(); setTimeout(fit, 70); });

    each('[data-mode]', b => b.addEventListener('click', () => { state.mapMode = b.getAttribute('data-mode'); if (state.mapMode === 'original') state.showProps = false; builtSig = ''; render(); }));
    each('[data-prebuilt-label]', b => b.addEventListener('click', () => {
      const L = b.getAttribute('data-prebuilt-label');
      const row = state.prebuiltMaps.find(m => String(m.label || '').trim().toUpperCase() === L);
      const targetIds = (row && Array.isArray(row.blocks)) ? row.blocks : [];
      const currentlyActive = state.activeLetter === L;

      state.selectedIds.clear();
      state.activeCats.clear();
      state.displayCatId = null;

      if (!currentlyActive && targetIds.length) {
        targetIds.forEach(id => state.selectedIds.add(id));
        state.activeLetter = L;
      } else {
        state.activeLetter = null;
      }

      state.mapMode = 'original';
      state.showProps = false;
      builtSig = '';
      render();
    }));
    on('propSwitch', toggleProps);
    on('zin', () => zoomBtn(1.2)); on('zout', () => zoomBtn(1 / 1.2)); on('zfit', fit);

    each('[data-cat]', b => b.addEventListener('click', () => {
      const c = b.getAttribute('data-cat');
      state.activeLetter = null;
      if (state.activeCats.has(c)) {
        state.activeCats.delete(c);
      } else {
        state.activeCats.add(c);
        state.displayCatId = c;
      }
      
      if (state.activeCats.size > 0) {
        if (!state.activeCats.has(state.displayCatId)) {
          state.displayCatId = Array.from(state.activeCats).pop();
        }
      } else {
        state.displayCatId = null;
      }
      
      // Removed state.selectedIds.clear() to allow cross-category multi-selection
      // Removed state.previewIdx = 0 to avoid losing preview position when toggling categories
      render(); 
    }));
    on('backCats', () => { state.activeCats.clear(); state.displayCatId = null; state.selectedIds.clear(); state.itemOpen = false; render(); });
    each('[data-item]', b => b.addEventListener('click', () => selectItem(b.getAttribute('data-item'), b.getAttribute('data-kind'))));
    each('[data-photoico]', b => b.addEventListener('click', e => { e.stopPropagation(); const id = b.getAttribute('data-photoico'); state.selectedIds = new Set([id]); openLightbox(0); }));
    each('[data-photos]', b => b.addEventListener('click', () => { state.selectedIds = new Set([b.getAttribute('data-photos')]); openLightbox(0); }));
    
    // Multi-select tray actions
    on('clearAllItems', () => { state.selectedIds.clear(); render(); });
    each('[data-unsel]', b => b.addEventListener('click', e => { e.stopPropagation(); state.selectedIds.delete(b.getAttribute('data-unsel')); render(); }));
    
    // Preview card pagination
    on('prevItemBtn', () => { state.previewIdx = (state.previewIdx - 1 + state.selectedIds.size) % state.selectedIds.size; render(); });
    on('nextItemBtn', () => { state.previewIdx = (state.previewIdx + 1) % state.selectedIds.size; render(); });
    
    each('[data-focus]', b => b.addEventListener('click', () => focusItem(b.getAttribute('data-focus'))));
    const btnPreviewProps = el('btnPreviewProps');
    if (btnPreviewProps) btnPreviewProps.addEventListener('click', () => {
      let locs = new Set(), blocks = new Set();
      if (state.selectedIds.size > 0) {
        state.selectedIds.forEach(id => {
          if (itemKindOf(id) === 'block') blocks.add(id);
          else locs.add(id);
        });
      } else if (state.displayCatId) {
        catItems(state.displayCatId).forEach(i => {
          if (i.kind === 'block') blocks.add(i.id);
          else locs.add(i.id);
        });
      }
      Object.assign(state, { section: 'props', propView: 'browse', filters: { type: new Set(), area: new Set(), location: locs, size: new Set(), blockId: blocks } });
      builtSig = '';
      render();
    });
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
  function focusProps() {
    const ps = scopedProperties(); if (!ps.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ps.forEach(p => { const b = blockById(p.blockId); if (b && hasGeo(b)) { const bd = pathBounds(GEO.paths[b.svgId]); if (bd.minX < x0) x0 = bd.minX; if (bd.minY < y0) y0 = bd.minY; if (bd.maxX > x1) x1 = bd.maxX; if (bd.maxY > y1) y1 = bd.maxY; } });
    if (!isFinite(x0)) return;
    const [cx, cy] = geoToLayer((x0 + x1) / 2, (y0 + y1) / 2);
    setTimeout(() => focusBox(cx, cy, Math.max(x1 - x0, 600), Math.max(y1 - y0, 600), 1.5), 60);
  }
  function toggleProps() { state.showProps = !state.showProps; state.previewId = null; refreshControls(); updateMapOverlays(); if (state.showProps) focusProps(); else fit(); }
  function clearFilters() { state.filters = { type: new Set(), area: new Set(), location: new Set(), size: new Set(), blockId: new Set() }; render(); }

  function selectItem(id, kind) {
    if (state.selectedIds.has(id)) {
       state.selectedIds.delete(id);
       if (state.previewIdx >= state.selectedIds.size) {
           state.previewIdx = Math.max(0, state.selectedIds.size - 1);
       }
    } else {
       state.selectedIds.add(id);
       state.previewIdx = state.selectedIds.size - 1;
    }
    state.itemOpen = false;
    // Removed state.activeCats.clear() so we can keep multiple categories active
    state.activeCats.add(itemCategory(id));
    state.displayCatId = itemCategory(id);
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
  function showAreaContext(id) { const p = propById(id); Object.assign(state, { section: 'master', mapMode: 'easy', showProps: true, selectedId: id, selectedIds: new Set([id]), itemOpen: false, previewId: id }); builtSig = ''; render(); if (p) { const b = blockById(p.blockId); if (b && hasGeo(b)) { const bd = pathBounds(GEO.paths[b.svgId]); const [cx, cy] = geoToLayer((bd.minX + bd.maxX) / 2, (bd.minY + bd.maxY) / 2); setTimeout(() => focusBox(cx, cy, Math.max(bd.maxX - bd.minX, 300), Math.max(bd.maxY - bd.minY, 300), 1.8), 80); } else if (b) { setTimeout(() => focusBox(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, 1.7), 80); } } }
  function openLightbox(idx) {
    let photos, name;
    if (state.section === 'props' && state.propView === 'detail') { photos = photosFor('property', state.selectedId, 4); name = 'Plot ' + (propById(state.selectedId) || {}).plotNumber; }
    else if (state.selectedIds.size === 1) { const id = Array.from(state.selectedIds)[0]; const it = itemObj(id); photos = photosFor(itemKindOf(id) === 'line' ? 'line' : (itemCategory(id) || 'pin'), photoKeyOf(id, itemKindOf(id)), 4); name = it ? it.name : ''; }
    else { photos = photosFor('property', state.selectedId || 'x', 4); name = ''; }
    state.lightbox = { photos, index: idx || 0, name: name || '' }; render();
  }
  function toast(msg) { let t = el('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = '0', 1900); }

  window.addEventListener('resize', () => { if (state.space === 'plan') fit(); });
  
  try {
    let mRes;
    try {
      mRes = await fetch('./map-assets.manifest.json');
    } catch(err1) {
      mRes = await fetch('/app/plotmap/map-assets.manifest.json');
    }
    PM_MANIFEST = await mRes.json();
  } catch(e) { 
    console.error('Failed to load map manifest', e); 
  }

  await useDataset(state.areaId);
  
  if (supabase) {
    const { data } = await supabase.from('prebuilt_maps').select('*').order('created_at', { ascending: true });
    if (data) state.prebuiltMaps = data;
  }
  
  render();
})();
