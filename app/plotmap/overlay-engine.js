/* PlotMap overlay engine: mounts interactive overlays above untouched map images.
   Data source: PMOverlayStore.publishedForClient(mapId) when available (Map
   Studio published items + seeded dataset), falling back to the static
   PLOTMAP_OVERLAYS dataset. Adds the premium selection language from the
   design handoff: dim veil, glass-road glow with flow pulses, lifted blocks,
   ring pins and a client-safe side drawer. */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COLORS = { gold: '#A87F1F', blue: '#1E5FA8', emerald: '#157A56', bronze: '#B06A2C', ink: '#23201A' };
  const GLOW = { '#1E5FA8': '#1FC8FF', '#157A56': '#2CEAA6', '#B06A2C': '#F5A84E', '#A87F1F': '#FFD97A', '#23201A': '#FFD97A' };
  const KIND_LABEL = { road: 'Road', sector: 'Sector', block: 'Block', landmark: 'Landmark', pin: 'Location', commercial: 'Commercial', label: 'Label', plot: 'Plot', boundary: 'Boundary' };
  const GROUP_NAMES = { A: 'Connectivity', B: 'Residential', C: 'Commercial & Civic', D: 'Growth Corridor' };
  const GROUP_COLORS = { A: '#1E5FA8', B: '#A87F1F', C: '#157A56', D: '#B06A2C' };

  let current = null;   // { root, container, mapId, mode, items, vb, selId, groupKey }

  function itemHex(item) {
    return COLORS[item.color] || (item.kind === 'road' || item.kind === 'boundary' ? COLORS.blue
      : item.kind === 'landmark' ? COLORS.emerald
      : item.kind === 'commercial' ? COLORS.bronze : COLORS.gold);
  }
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function lighten(hex, amt) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt); return 'rgb(' + r + ',' + g + ',' + b + ')'; }
  function darken(hex, amt) { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return 'rgb(' + Math.round(r * (1 - amt)) + ',' + Math.round(g * (1 - amt)) + ',' + Math.round(b * (1 - amt)) + ')'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function legacyOverlayFor(mapId, mode) {
    const overlays = window.PLOTMAP_OVERLAYS || {};
    const overlay = mapId ? overlays[mapId] : null;
    if (!overlay) return null;
    if (Array.isArray(overlay.modes) && overlay.modes.length && !overlay.modes.includes(mode)) return null;
    return overlay;
  }

  /* items in the common shape: {id, kind, name, d?, paths?, pts?, at?, color?, group?, rows?, propertyId?, mode?} */
  function itemsFor(mapId, mode) {
    const store = window.PMOverlayStore;
    if (store) {
      const seedOverlay = legacyOverlayFor(mapId, mode);
      const seedAllowed = !!seedOverlay;
      return store.publishedForClient(mapId).filter(it => {
        if (it.seed) return seedAllowed;
        // custom items drawn in a specific view mode only appear in that mode
        if (it.mode && (mode === 'easy' || mode === 'original')) return it.mode === mode;
        return true;
      });
    }
    // fallback: static dataset only (no store loaded)
    const overlay = legacyOverlayFor(mapId, mode);
    if (!overlay) return [];
    const out = [];
    (overlay.roads || []).forEach(r => { if (r.public) out.push({ id: r.id, kind: 'road', name: r.label, d: r.d, color: 'blue', group: r.group, rows: r.rows }); });
    (overlay.shapes || []).forEach(s => { if (s.public) out.push({ id: s.id, kind: s.type === 'landmark' ? 'landmark' : (s.type || 'sector'), name: s.label, paths: s.paths, color: s.type === 'landmark' ? 'emerald' : 'gold', group: s.group, rows: s.rows }); });
    return out;
  }

  function viewBoxFor(mapId, mode, options) {
    if (window.PMOverlayStore) return window.PMOverlayStore.viewBoxFor(mapId, mode);
    const overlay = legacyOverlayFor(mapId, mode);
    return (overlay && overlay.viewBox) || ('0 0 ' + (options.width || 1) + ' ' + (options.height || 1));
  }

  function parseViewBox(raw, w, h) {
    const parts = String(raw || '').trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) return parts;
    return [0, 0, w || 1, h || 1];
  }

  function centroidOf(item, vb) {
    if (item.at) return [item.at[0], item.at[1] - 14];
    const d = item.d || (item.paths && item.paths[0]) || '';
    if (Array.isArray(item.pts) && item.pts.length) {
      const pts = item.pts.length === 2 && item.kind === 'plot'
        ? [[item.pts[0][0], item.pts[0][1]], [item.pts[1][0], item.pts[1][1]]]
        : item.pts;
      return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    }
    if (d) {
      const nums = [];
      const re = /-?\d+(?:\.\d+)?/g; let m;
      while ((m = re.exec(d)) !== null) nums.push(+m[0]);
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i + 1 < nums.length; i += 2) { sx += nums[i]; sy += nums[i + 1]; n++; }
      if (n) return [sx / n, sy / n];
    }
    return [vb[2] / 2, vb[3] / 2];
  }

  function pathsOf(item) {
    if (item.paths && item.paths.length) return item.paths;
    if (item.d) return [item.d];
    return [];
  }

  function track(type, meta) {
    try { if (typeof window.logEvent === 'function') window.logEvent(type, meta || {}); } catch (e) {}
  }

  /* ---------- idle layer (calm, always visible) ---------- */
  function buildIdleSvg(items, vb) {
    let html = '';
    items.forEach(item => {
      if (item.kind === 'pin' || item.kind === 'label') return;
      const isLine = item.kind === 'road' || item.kind === 'boundary';
      pathsOf(item).forEach((d, i) => {
        if (isLine) {
          html += '<g class="plotmap-road" data-overlay-id="' + esc(item.id) + '">'
            + '<path d="' + d + '" class="road-shadow"/><path d="' + d + '" class="road-body"/><path d="' + d + '" class="road-core"/>'
            + '<path d="' + d + '" class="road-hit" data-hit="' + esc(item.id) + '" tabindex="0" role="button" aria-label="' + esc(item.name || 'Road') + '"/></g>';
        } else {
          html += '<path d="' + d + '" class="plotmap-shape plotmap-shape-' + esc(item.kind) + '" data-overlay-id="' + esc(item.id) + '" data-hit="' + esc(item.id) + '" tabindex="0" role="button" aria-label="' + esc(item.name || 'Map area') + '"/>';
        }
      });
    });
    return html;
  }

  /* ---------- selection layer (premium, from the design handoff) ---------- */
  function buildSelectionSvg(items, strong, soft, vb) {
    let under = '', mid = '', top = '';
    items.forEach(item => {
      if (item.kind === 'pin' || item.kind === 'label') return;
      const col = itemHex(item);
      const isStrong = strong.has(item.id), isSoft = soft.has(item.id);
      if (!isStrong && !isSoft) return;
      const isLine = item.kind === 'road' || item.kind === 'boundary';
      pathsOf(item).forEach(d => {
        if (isStrong && isLine) {
          const glow = GLOW[col] || '#FFD97A';
          under += '<path d="' + d + '" fill="none" stroke="rgba(0,24,48,.55)" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,5)" style="filter:blur(6px)"/>';
          mid += '<path d="' + d + '" fill="none" stroke="' + rgba(glow, .72) + '" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px ' + rgba(glow, .9) + ') drop-shadow(0 0 18px ' + rgba(col, .65) + ')"/>';
          mid += '<path d="' + d + '" fill="none" stroke="rgba(235,255,255,.98)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px rgba(255,255,255,.95)) drop-shadow(0 0 14px ' + rgba(glow, .95) + ') drop-shadow(0 0 28px ' + rgba(col, .8) + ')"/>';
          mid += '<path d="' + d + '" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 32" style="pointer-events:none;filter:drop-shadow(0 0 5px rgba(255,255,255,1)) drop-shadow(0 0 10px ' + rgba(glow, 1) + ');animation:pm-flowdash 1.4s linear infinite"/>';
        } else if (isStrong) {
          const isBlockish = item.kind === 'block' || item.kind === 'plot';
          const lift = isBlockish ? 14 : 8, steps = 4;
          const topFace = lighten(col, isBlockish ? .34 : .44), topEdge = lighten(col, .74);
          under += '<path d="' + d + '" fill="rgba(22,15,4,.45)" transform="translate(0,' + (lift + 4) + ')" style="filter:blur(8px)"/>';
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            mid += '<path d="' + d + '" fill="' + darken(col, 0.6 - 0.44 * t) + '" transform="translate(0,' + (-lift * t).toFixed(1) + ')"/>';
          }
          top += '<path d="' + d + '" fill="' + topFace + '" fill-opacity=".92" stroke="' + topEdge + '" stroke-width="2" stroke-linejoin="round" transform="translate(0,' + (-lift) + ')" style="filter:drop-shadow(0 3px 3px rgba(26,18,6,.3))"/>';
          top += '<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1" stroke-linejoin="round" transform="translate(0,' + (-lift - 1) + ')"/>';
        } else if (isSoft) {
          under += isLine
            ? '<path d="' + d + '" fill="none" stroke="' + rgba(col, .55) + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
            : '<path d="' + d + '" fill="' + rgba(col, .12) + '" stroke="' + rgba(col, .72) + '" stroke-width="2.4" stroke-linejoin="round"/>';
        }
      });
    });
    return under + mid + top;
  }

  /* ---------- pins / labels / boxes (HTML in the fitted layer) ---------- */
  function pctPos(x, y, vb) {
    return { left: (x / vb[2] * 100).toFixed(3) + '%', top: (y / vb[3] * 100).toFixed(3) + '%' };
  }

  function buildHtmlLayer(layer, items, vb, state) {
    layer.innerHTML = '';
    const anySel = state.strong.size > 0;
    items.forEach(item => {
      if (item.kind === 'plot' || (item.kind === 'landmark' && item.pts && !item.d && !item.paths)) {
        // rectangle selections (seed selectedPlots/selectedLandmarks + studio plot tool)
        const pts = item.pts && item.pts.length >= 2 ? item.pts : null;
        if (!pts) return;
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
        const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        const box = document.createElement('button');
        box.type = 'button';
        box.className = item.kind === 'plot' ? 'selected-house' : 'selected-school';
        box.dataset.overlayId = item.id;
        box.title = item.name || '';
        box.setAttribute('aria-label', item.name || 'Selected area');
        Object.assign(box.style, {
          left: (x0 / vb[2] * 100) + '%', top: (y0 / vb[3] * 100) + '%',
          width: ((x1 - x0) / vb[2] * 100) + '%', height: ((y1 - y0) / vb[3] * 100) + '%'
        });
        if (anySel && !state.strong.has(item.id)) box.classList.add('pm-faded');
        if (state.strong.has(item.id)) box.classList.add('pm-active');
        box.addEventListener('click', e => { e.stopPropagation(); api.select(item.id); });
        const shine = document.createElement('span');
        shine.className = 'overlay-box-shine';
        box.appendChild(shine);
        layer.appendChild(box);
        return;
      }
      if (item.kind === 'pin' && item.at) {
        const wrap = document.createElement('div');
        wrap.className = 'pm-pinwrap';
        const p = pctPos(item.at[0], item.at[1], vb);
        wrap.style.left = p.left; wrap.style.top = p.top;
        if (anySel && !state.strong.has(item.id)) wrap.classList.add('pm-faded');
        if (state.strong.has(item.id)) {
          const ring = document.createElement('span');
          ring.className = 'pm-pin-ring';
          ring.style.borderColor = itemHex(item);
          wrap.appendChild(ring);
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'map-pin' + (state.strong.has(item.id) ? ' pm-pin-active' : '');
        btn.title = item.name || 'Pin';
        btn.setAttribute('aria-label', item.name || 'Pin');
        btn.dataset.overlayId = item.id;
        btn.appendChild(document.createElement('span'));
        btn.addEventListener('click', e => { e.stopPropagation(); api.select(item.id); });
        wrap.appendChild(btn);
        layer.appendChild(wrap);
        return;
      }
      if (item.kind === 'label' && item.at) {
        const chip = document.createElement('div');
        chip.className = 'pm-label-chip';
        const p = pctPos(item.at[0], item.at[1], vb);
        chip.style.left = p.left; chip.style.top = p.top;
        if (anySel) chip.classList.add('pm-faded');
        chip.innerHTML = '<span>' + esc(item.name || '') + '</span>';
        layer.appendChild(chip);
      }
    });
  }

  /* ---------- selection label + drawer ---------- */
  function buildSelLabel(root, item, vb) {
    root.querySelectorAll('.pm-sellbl').forEach(n => n.remove());
    if (!item || item.kind === 'label') return;
    const c = centroidOf(item, vb);
    const el = document.createElement('div');
    el.className = 'pm-sellbl';
    const p = pctPos(c[0], c[1], vb);
    el.style.left = p.left; el.style.top = p.top;
    el.innerHTML = '<div class="in"><span class="dot" style="background:' + itemHex(item) + '"></span>'
      + '<span class="nm">' + esc(item.name || 'Untitled') + '</span>'
      + '<span class="kd">' + esc(KIND_LABEL[item.kind] || item.kind) + '</span></div>';
    root.querySelector('.plotmap-selection-layer').appendChild(el);
  }

  function drawerRows(item) {
    if (Array.isArray(item.rows) && item.rows.length) return item.rows;
    const rows = [['Type', KIND_LABEL[item.kind] || item.kind]];
    if (item.group && GROUP_NAMES[item.group]) rows.push(['Group', item.group + ' · ' + GROUP_NAMES[item.group]]);
    if (item.propertyId && window.CRM) {
      try {
        const data = window.CRM.getCRM();
        const prop = (data.properties || []).find(x => x.id === item.propertyId);
        if (prop) {
          if (prop.area) rows.push(['Area', prop.area]);
          if (prop.block || prop.sector) rows.push(['Block', prop.block || prop.sector]);
          if (prop.plotSize || prop.size) rows.push(['Size', prop.plotSize || prop.size]);
          if (prop.facing) rows.push(['Facing', prop.facing]);
          if (prop.roadWidth) rows.push(['Road width', prop.roadWidth]);
        }
      } catch (e) {}
    }
    return rows;
  }

  function removeDrawer() {
    document.querySelectorAll('.pm-overlay-drawer').forEach(n => n.remove());
  }

  function showDrawer(item) {
    removeDrawer();
    if (!item || item.kind === 'label') return;
    const col = itemHex(item);
    const drawer = document.createElement('div');
    drawer.className = 'pm-overlay-drawer';
    drawer.innerHTML =
      '<div class="hd"><span class="kindchip" style="color:' + col + ';background:' + rgba(col, .1) + ';border-color:' + rgba(col, .3) + '">' + esc(KIND_LABEL[item.kind] || item.kind) + '</span>'
      + '<button class="x" aria-label="Close">✕</button></div>'
      + '<div class="ttl">' + esc(item.name || 'Untitled') + '</div>'
      + (item.sub ? '<div class="sub">' + esc(item.sub) + '</div>' : '')
      + '<div class="rows">' + drawerRows(item).map(r => '<div class="r"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>').join('') + '</div>'
      + '<div class="ft">Client-safe view · internal data never shown</div>';
    drawer.querySelector('.x').addEventListener('click', () => api.deselect());
    document.body.appendChild(drawer);
  }

  /* ---------- group banner ---------- */
  function showGroupBanner(root, groupKey, count) {
    root.querySelectorAll('.pm-group-banner').forEach(n => n.remove());
    if (!groupKey) return;
    const el = document.createElement('div');
    el.className = 'pm-group-banner';
    el.innerHTML = '<span class="badge" style="background:' + (GROUP_COLORS[groupKey] || '#A87F1F') + '">' + esc(groupKey) + '</span>'
      + '<div class="tx"><div class="nm">' + esc(GROUP_NAMES[groupKey] || 'Group ' + groupKey) + '</div><div class="ct">' + count + ' areas highlighted</div></div>'
      + '<button class="x" aria-label="Clear">✕</button>';
    el.querySelector('.x').addEventListener('click', () => api.setGroup(null));
    root.appendChild(el);
  }

  /* ---------- state → DOM ---------- */
  function applyState() {
    if (!current) return;
    const { root, items, vb } = current;
    const strong = new Set(), soft = new Set();
    if (current.groupKey) {
      items.forEach(it => { if (it.group === current.groupKey) strong.add(it.id); });
    } else if (current.selId) {
      const sel = items.find(x => x.id === current.selId);
      if (sel) {
        strong.add(sel.id);
        (sel.rel || []).forEach(r => soft.add(r));
        if (sel.parent) soft.add(sel.parent);
        if (sel.nearRoad) soft.add(sel.nearRoad);
        if (sel.targetId) strong.add(sel.targetId);
      }
    }
    const anySel = strong.size > 0;
    current.strong = strong;

    root.classList.toggle('pm-has-selection', anySel);
    const dim = root.querySelector('.pm-dim-veil');
    if (dim) dim.style.opacity = anySel ? '0.45' : '0';

    const selSvg = root.querySelector('.plotmap-sel-layer');
    if (selSvg) selSvg.innerHTML = anySel ? buildSelectionSvg(items, strong, soft, vb) : '';

    buildHtmlLayer(root.querySelector('.plotmap-selection-layer'), items, vb, { strong, soft });

    const selItem = !current.groupKey && current.selId ? items.find(x => x.id === current.selId) : null;
    buildSelLabel(root, selItem, vb);
    if (selItem) showDrawer(selItem); else removeDrawer();
    showGroupBanner(root, current.groupKey, strong.size);
  }

  /* ---------- mount ---------- */
  function mount(options) {
    const container = options && options.container;
    if (!container) return null;
    container.querySelectorAll(':scope > .plotmap-overlay-root').forEach(node => node.remove());
    removeDrawer();

    const items = itemsFor(options.mapId, options.mode);
    if (!items.length) { current = null; return null; }

    const vbRaw = viewBoxFor(options.mapId, options.mode, options);
    const vb = parseViewBox(vbRaw, options.width, options.height);

    const root = document.createElement('div');
    root.className = 'plotmap-overlay-root plotmap-map-stage';
    root.dataset.overlayMap = options.mapId || '';
    root.style.width = (options.width || container.clientWidth || 0) + 'px';
    root.style.height = (options.height || container.clientHeight || 0) + 'px';

    // 1. idle svg
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'plotmap-road-layer');
    svg.setAttribute('viewBox', vbRaw);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.innerHTML = '<defs><filter id="plotmapRoadGlow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
      + buildIdleSvg(items, vb);

    // 2. dim veil
    const veil = document.createElement('div');
    veil.className = 'pm-dim-veil';

    // 3. selection svg (premium render, above the veil)
    const selSvg = document.createElementNS(SVG_NS, 'svg');
    selSvg.setAttribute('class', 'plotmap-sel-layer');
    selSvg.setAttribute('viewBox', vbRaw);
    selSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // 4. fitted html layer (pins / boxes / labels / sel label)
    const selectionLayer = document.createElement('div');
    selectionLayer.className = 'plotmap-selection-layer';
    const w = Number(options.width) || vb[2], h = Number(options.height) || vb[3];
    const scale = Math.min(w / vb[2], h / vb[3]);
    const fitW = vb[2] * scale, fitH = vb[3] * scale;
    selectionLayer.style.left = ((w - fitW) / 2) + 'px';
    selectionLayer.style.top = ((h - fitH) / 2) + 'px';
    selectionLayer.style.width = fitW + 'px';
    selectionLayer.style.height = fitH + 'px';

    root.append(svg, veil, selSvg, selectionLayer);
    root.addEventListener('click', e => {
      const hit = e.target && e.target.getAttribute && e.target.getAttribute('data-hit');
      if (hit) { e.stopPropagation(); api.select(hit); return; }
      if (current && (current.selId || current.groupKey)) api.deselect();
    });
    container.appendChild(root);

    current = { root, container, mapId: options.mapId, mode: options.mode, items, vb, selId: null, groupKey: null, strong: new Set() };
    applyState();
    return root;
  }

  const api = {
    mount,
    getOverlay: legacyOverlayFor,
    clear(container) {
      if (container) container.querySelectorAll(':scope > .plotmap-overlay-root').forEach(node => node.remove());
      removeDrawer();
      current = null;
    },
    select(id) {
      if (!current) return;
      if (current.selId === id) { api.deselect(); return; }
      current.selId = id;
      current.groupKey = null;
      applyState();
      const item = current.items.find(x => x.id === id);
      if (item) {
        track('overlay_selected', { metadata: { itemId: item.id, kind: item.kind, mapId: current.mapId, name: item.name || '' } });
        if (item.kind === 'pin' && item.propertyId) track('property_viewed', { propertyId: item.propertyId, metadata: { mapId: current.mapId, via: 'map-pin' } });
      }
    },
    deselect() {
      if (!current) return;
      current.selId = null;
      current.groupKey = null;
      applyState();
    },
    setGroup(groupKey) {
      if (!current) return;
      current.groupKey = groupKey || null;
      current.selId = null;
      applyState();
      if (groupKey) track('overlay_selected', { metadata: { group: groupKey, mapId: current.mapId } });
    },
    hasGroupItems(groupKey) {
      return !!(current && current.items.some(it => it.group === groupKey));
    }
  };

  window.PlotMapOverlayEngine = api;
})();
