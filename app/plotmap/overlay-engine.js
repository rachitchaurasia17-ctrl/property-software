/* PlotMap overlay engine — the premium highlight system.
   Mounts interactive overlays ABOVE untouched map images. The base map is
   sacred: every effect here is an SVG/CSS layer, never an image edit.

   Data source: PMOverlayStore.publishedForClient(mapId) when available
   (Map Studio published items + seeded dataset), falling back to the static
   PLOTMAP_OVERLAYS dataset — so any map marked inside Map Studio gets this
   look automatically, now and for future masterplans.

   Visual language (reference: premium 3D masterplan):
   • Roads   — raised electric-cyan glass light strips (shadow/body/core).
   • Blocks  — true 3D slabs: gradient top face, stepped darker side wall,
               glossy sheen, bevel hairline, soft ground shadow, color glow.
   • Pins    — small blue gradient pins with white core.
   • Select  — dim veil + selected item lifts higher and glows brighter. */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ---------- premium block palette (bold, not dull) ---------- */
  const PALETTE = {
    gold:    { top: '#FFD34F', mid: '#E19A10', side: '#7C4A04', glow: 'rgba(255,190,45,.5)', text: '#111111' },
    magenta: { top: '#FF4FA3', mid: '#D31368', side: '#6D0735', glow: 'rgba(255,45,145,.48)', text: '#FFFFFF' },
    purple:  { top: '#9B5CFF', mid: '#6B27C7', side: '#35115F', glow: 'rgba(155,92,255,.46)', text: '#FFFFFF' },
    teal:    { top: '#3FF2D0', mid: '#079E91', side: '#04534F', glow: 'rgba(40,235,210,.42)', text: '#111111' },
    emerald: { top: '#79EF65', mid: '#2CA83C', side: '#0D541B', glow: 'rgba(90,230,80,.42)', text: '#111111' },
    blue:    { top: '#4AA8FF', mid: '#145CC8', side: '#082A68', glow: 'rgba(55,150,255,.46)', text: '#FFFFFF' },
    orange:  { top: '#FF9847', mid: '#DF5614', side: '#6B2108', glow: 'rgba(255,130,40,.46)', text: '#111111' },
    cyan:    { top: '#53E8FF', mid: '#0FA8D8', side: '#065C7A', glow: 'rgba(60,220,255,.46)', text: '#111111' },
    ruby:    { top: '#FF6052', mid: '#CC251D', side: '#68100D', glow: 'rgba(255,80,70,.46)', text: '#FFFFFF' }
  };
  const PALETTE_KEYS = Object.keys(PALETTE);
  // Legacy store color names → palette families.
  const COLOR_MAP = { gold: 'gold', blue: 'blue', emerald: 'emerald', bronze: 'orange', ink: 'purple' };
  // Store defaults per kind — a default color means "auto-assign variety".
  const KIND_DEFAULT = { sector: 'gold', block: 'gold', plot: 'gold', landmark: 'emerald', commercial: 'emerald', road: 'blue', boundary: 'blue', pin: 'gold' };
  // Auto-assignment order tuned so neighbouring blocks contrast well.
  const AUTO_ORDER = ['gold', 'teal', 'purple', 'blue', 'magenta', 'emerald', 'orange', 'cyan', 'ruby'];

  const KIND_LABEL = { road: 'Road', sector: 'Sector', block: 'Block', landmark: 'Landmark', pin: 'Location', commercial: 'Commercial', label: 'Label', plot: 'Plot', boundary: 'Boundary' };
  const GROUP_NAMES = { A: 'Connectivity', B: 'Residential', C: 'Commercial & Civic', D: 'Growth Corridor' };
  const GROUP_COLORS = { A: '#1E5FA8', B: '#A87F1F', C: '#157A56', D: '#B06A2C' };
  // Drawer chip colors per palette (mid tones read best on parchment).
  const KIND_COLOR_HEX = { gold: '#A87F1F', blue: '#1E5FA8', emerald: '#157A56', orange: '#B06A2C', purple: '#6B27C7', magenta: '#D31368', teal: '#079E91', cyan: '#0FA8D8', ruby: '#CC251D' };

  let current = null;   // { root, container, mapId, mode, items, vb, selId, groupKey }
  let uidSeq = 0;

  /* ---------- color helpers ---------- */
  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgba(hex, a) { const c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(hexA, hexB, t) {
    const a = hexRgb(hexA), b = hexRgb(hexB);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function lighten(hex, amt) { const c = hexRgb(hex); return 'rgb(' + c.map(v => Math.round(v + (255 - v) * amt)).join(',') + ')'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function hashStr(s) { let h = 0; s = String(s || ''); for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h); }

  /* Palette for an item: explicit non-default colors are honored; default
     colors get a stable per-item auto color so a freshly marked map already
     looks like the reference (varied premium blocks, no config needed). */
  function paletteKeyFor(item) {
    const mapped = COLOR_MAP[item.color] || (PALETTE[item.color] ? item.color : null);
    const isDefault = !item.color || item.color === KIND_DEFAULT[item.kind];
    if (mapped && !isDefault) return mapped;
    return AUTO_ORDER[hashStr(item.id) % AUTO_ORDER.length];
  }
  function paletteFor(item) { return PALETTE[paletteKeyFor(item)] || PALETTE.gold; }
  function itemHex(item) { return KIND_COLOR_HEX[paletteKeyFor(item)] || '#A87F1F'; }

  /* Lift per item — small premium variation (never huge). viewBox units. */
  function liftFor(item) {
    if (item.kind === 'sector') return 8;
    if (item.kind === 'landmark' || item.kind === 'commercial') return 9;
    return [10, 12, 14][hashStr(item.id + 'l') % 3]; // blocks / plots
  }
  /* Sectors are large zone polygons: render them as raised GLASS panels so
     the original map stays readable beneath. Blocks/landmarks/plots are the
     solid 3D slabs that pop (the reference look). */
  function isGlass(item) { return item.kind === 'sector'; }

  /* ---------- data plumbing (unchanged contract) ---------- */
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
    (overlay.roads || []).forEach(r => { if (r.public) out.push({ id: r.id, kind: 'road', name: r.label, d: r.d, color: 'blue', group: r.group, rows: r.rows, rel: r.rel, sub: r.sub }); });
    (overlay.shapes || []).forEach(s => { if (s.public) out.push({ id: s.id, kind: s.type === 'landmark' ? 'landmark' : (s.type || 'sector'), name: s.label, paths: s.paths, color: s.type === 'landmark' ? 'emerald' : 'gold', group: s.group, rows: s.rows, rel: s.rel, parent: s.parent, sub: s.sub }); });
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
      const pts = item.pts;
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

  /* ---------- shared defs: top-face gradients + gloss ---------- */
  function buildDefs(sfx) {
    let g = '';
    PALETTE_KEYS.forEach(key => {
      const p = PALETTE[key];
      g += '<linearGradient id="pmTop-' + key + '-' + sfx + '" x1="0" y1="0" x2="0.25" y2="1">'
        + '<stop offset="0" stop-color="' + lighten(p.top, 0.28) + '"/>'
        + '<stop offset="0.42" stop-color="' + p.top + '"/>'
        + '<stop offset="1" stop-color="' + p.mid + '"/>'
        + '</linearGradient>';
    });
    g += '<linearGradient id="pmGloss-' + sfx + '" x1="0" y1="0" x2="0.18" y2="1">'
      + '<stop offset="0" stop-color="rgba(255,255,255,.5)"/>'
      + '<stop offset="0.4" stop-color="rgba(255,255,255,.14)"/>'
      + '<stop offset="0.72" stop-color="rgba(255,255,255,0)"/>'
      + '</linearGradient>';
    return '<defs>' + g + '</defs>';
  }

  /* ---------- 3D block builder (the hero) ----------
     One group per item; every effect is a translated copy of the SAME path,
     so the geometry always matches the map. Layers bottom→top:
     ground shadow → stepped side wall → gradient top face → gloss → bevel
     hairline → transparent hit path → fitted label. */
  function blockSvg(item, pal, sfx, opts) {
    const o = opts || {};
    const lift = (o.lift != null ? o.lift : liftFor(item));
    const key = paletteKeyFor(item);
    const paths = pathsOf(item);
    if (!paths.length) return '';
    const glass = isGlass(item) && !o.strong;
    // Idle glass panel: no extrusion at all — a luminous edge + faint tint so
    // the original map stays fully readable. Selected sectors extrude lightly.
    const glassSel = isGlass(item) && o.strong;
    const eLift = glass ? 0 : lift;
    const wallSteps = glassSel ? 5 : 9;
    const wallOpacity = glassSel ? 0.5 : 1;
    const topOpacity = glass ? 0.14 : glassSel ? 0.22 : 0.93;
    const glowPart = 'drop-shadow(0 0 ' + (o.strong ? 16 : 9) + 'px ' + pal.glow + ')';
    const shadeStyle = glass
      ? 'filter:' + glowPart + ';'
      : 'filter:drop-shadow(0 2.5px 2.5px rgba(24,16,4,.34)) ' + glowPart + ';';

    let html = '<g class="pm-block3d' + (o.strong ? ' pm-block3d-active' : '') + '" data-overlay-id="' + esc(item.id) + '"'
      + (o.delay ? ' style="animation-delay:' + o.delay + 'ms"' : '') + '>';
    paths.forEach(d => {
      if (!glass) {
        // 1 · soft ground shadow (offset down, blurred) — sells the lift
        html += '<path d="' + d + '" fill="rgba(14,10,3,' + (glassSel ? '.22' : '.42') + ')" transform="translate(3 ' + (eLift * 0.6 + 6).toFixed(1) + ')" style="filter:blur(7px);pointer-events:none"/>';
        // 2 · stepped side wall: deep shadow at base → mid near the top, so the
        //     slab reads as truly extruded (dark grounding = "out of screen")
        for (let k = 0; k <= wallSteps; k++) {
          const t = k / wallSteps;
          html += '<path d="' + d + '" fill="' + mix(pal.side, pal.mid, 0.04 + 0.66 * t) + '" fill-opacity="' + wallOpacity + '" '
            + 'stroke="rgba(0,0,0,0.75)" stroke-width="1.5" stroke-linejoin="round" '
            + 'transform="translate(0 ' + (-eLift * t).toFixed(2) + ')" style="pointer-events:none"/>';
        }
      }
      // 3 · top face: bright gradient + light edge + color glow. Glass panels
      //     stay near-transparent so the base map reads through; the glowing
      //     edge in the block color is what defines them.
      html += '<path d="' + d + '" fill="url(#pmTop-' + key + '-' + sfx + ')" fill-opacity="' + topOpacity + '" stroke="' + (glass || glassSel ? pal.top : lighten(pal.top, 0.6)) + '" stroke-width="' + (glassSel ? 3.6 : glass ? 2.8 : 1.5) + '" stroke-linejoin="round" transform="translate(0 ' + (-eLift) + ')" style="' + shadeStyle + 'pointer-events:none"/>';
      // 4 · glossy sheen sweeping from the top-left
      html += '<path d="' + d + '" fill="url(#pmGloss-' + sfx + ')" fill-opacity="' + (glass ? 0.3 : glassSel ? 0.55 : 1) + '" transform="translate(0 ' + (-eLift) + ')" style="pointer-events:none"/>';
      // 5 · inner bevel hairline just above the face
      if (!glass) {
        html += '<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="0.9" stroke-linejoin="round" transform="translate(0 ' + (-eLift - 1.2) + ')" style="pointer-events:none"/>';
      }
      // 6 · invisible hit surface on the lifted face
      if (!o.noHit) {
        html += '<path d="' + d + '" class="pm-block-hit" data-hit="' + esc(item.id) + '" transform="translate(0 ' + (-eLift) + ')" tabindex="0" role="button" aria-label="' + esc(item.name || 'Map area') + '"/>';
      }
    });
    // 7 · fitted label on the face (sized after mount via fitBlockLabels)
    if (item.name && !o.noLabel) {
      const c = centroidOf(item, o.vb || [0, 0, 1, 1]);
      const tColor = pal.text || '#FFFFFF';
      const tStroke = tColor === '#111111' ? 'rgba(255,255,255,0.7)' : 'rgba(18,12,2,0.5)';
      html += '<text class="pm-block-label' + (glass ? ' pm-glass-label' : '') + '" data-fit="1" x="' + c[0].toFixed(1) + '" y="' + (c[1] - eLift).toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" style="fill:' + tColor + ';stroke:' + tStroke + ';">' + esc(item.name) + '</text>';
    }
    html += '</g>';
    return html;
  }

  /* Fit block labels to their faces; hide labels that cannot fit legibly. */
  function fitBlockLabels(svg) {
    if (!svg) return;
    svg.querySelectorAll('g.pm-block3d').forEach(g => {
      const t = g.querySelector('text.pm-block-label');
      if (!t) return;
      const hit = g.querySelector('.pm-block-hit') || g.querySelector('path');
      if (!hit) { t.style.display = 'none'; return; }
      let bb;
      try { bb = hit.getBBox(); } catch (e) { t.style.display = 'none'; return; }
      const len = Math.max((t.textContent || '').length, 1);
      const fs = Math.min(bb.width / (len * 0.64), bb.height * 0.3, 26);
      if (fs < 8.5) { t.style.display = 'none'; return; }
      t.setAttribute('font-size', fs.toFixed(1));
      t.setAttribute('stroke-width', Math.max(1.6, fs * 0.16).toFixed(1));
    });
  }

  /* ---------- glass road builder ---------- */
  function roadSvg(item, opts) {
    const o = opts || {};
    let html = '';
    pathsOf(item).forEach(d => {
      html += '<g class="plotmap-road' + (o.strong ? ' pm-road-active' : '') + '" data-overlay-id="' + esc(item.id) + '">'
        + '<path d="' + d + '" class="road-shadow"/>'
        + '<path d="' + d + '" class="road-body"/>'
        + '<path d="' + d + '" class="road-core"/>'
        + (o.strong ? '<path d="' + d + '" class="road-flow"/>' : '')
        + (o.noHit ? '' : '<path d="' + d + '" class="road-hit" data-hit="' + esc(item.id) + '" tabindex="0" role="button" aria-label="' + esc(item.name || 'Road') + '"/>')
        + '</g>';
    });
    return html;
  }

  /* ---------- idle layer: the hero state (reference look, always on) ---------- */
  function buildIdleSvg(items, vb, sfx) {
    let roads = '', glass = '', solid = '';
    let i = 0;
    items.forEach(item => {
      if (item.kind === 'pin' || item.kind === 'label') return;
      const isLine = item.kind === 'road' || item.kind === 'boundary';
      if (isLine) { roads += roadSvg(item); return; }
      if (!pathsOf(item).length) return; // pts-based rects render in the HTML layer
      const html = blockSvg(item, paletteFor(item), sfx, { vb, delay: Math.min(i * 70, 560) });
      if (isGlass(item)) glass += html; else solid += html;
      i++;
    });
    // stack: glass zone panels → glowing roads → solid 3D blocks on top,
    // matching the physical metaphor (slabs sit on the lit map)
    return buildDefs(sfx) + glass + roads + solid;
  }

  /* ---------- selection layer (above the veil, even more premium) ---------- */
  function buildSelectionSvg(items, strong, soft, vb, sfx) {
    let out = buildDefs(sfx);
    items.forEach(item => {
      if (item.kind === 'pin' || item.kind === 'label') return;
      const isStrong = strong.has(item.id), isSoft = soft.has(item.id);
      if (!isStrong && !isSoft) return;
      const isLine = item.kind === 'road' || item.kind === 'boundary';
      if (isStrong && isLine) {
        out += roadSvg(item, { strong: true, noHit: false });
      } else if (isStrong) {
        out += blockSvg(item, paletteFor(item), sfx, { vb, strong: true, lift: liftFor(item) + 6 });
      } else if (isSoft) {
        const col = itemHex(item);
        pathsOf(item).forEach(d => {
          out += isLine
            ? '<path d="' + d + '" fill="none" stroke="' + rgba(col, .55) + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
            : '<path d="' + d + '" fill="' + rgba(col, .12) + '" stroke="' + rgba(col, .72) + '" stroke-width="2.4" stroke-linejoin="round"/>';
        });
      }
    });
    return out;
  }

  /* ---------- pins / plot boxes / labels (HTML in the fitted layer) ---------- */
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
        const key = paletteKeyFor(item);
        const box = document.createElement('button');
        box.type = 'button';
        box.className = 'plotmap-block block-' + key;
        box.dataset.overlayId = item.id;
        box.title = item.name || '';
        box.setAttribute('aria-label', item.name || 'Selected area');
        Object.assign(box.style, {
          left: (x0 / vb[2] * 100) + '%', top: (y0 / vb[3] * 100) + '%',
          width: ((x1 - x0) / vb[2] * 100) + '%', height: ((y1 - y0) / vb[3] * 100) + '%'
        });
        box.style.setProperty('--lift', [8, 10, 12][hashStr(item.id) % 3] + 'px');
        if (anySel && !state.strong.has(item.id)) box.classList.add('pm-faded');
        if (state.strong.has(item.id)) box.classList.add('is-selected');
        box.addEventListener('click', e => { e.stopPropagation(); api.select(item.id); });
        if (item.name) {
          const lbl = document.createElement('span');
          lbl.className = 'plotmap-block-label';
          lbl.textContent = item.name;
          box.appendChild(lbl);
        }
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
        const pIds = String(item.propertyId).split(',').map(x => x.trim()).filter(Boolean);
        pIds.forEach((pid, idx) => {
          const prop = (data.properties || []).find(x => x.id === pid);
          if (prop) {
            const prefix = pIds.length > 1 ? `Property ${idx + 1} ` : '';
            if (prop.title || prop.propertyCode) rows.push([prefix + 'Name', prop.title || prop.propertyCode]);
            if (prop.area) rows.push([prefix + 'Area', prop.area]);
            if (prop.block || prop.sector) rows.push([prefix + 'Block', prop.block || prop.sector]);
            if (prop.plotSize || prop.size) rows.push([prefix + 'Size', prop.plotSize || prop.size]);
            if (prop.facing) rows.push([prefix + 'Facing', prop.facing]);
            if (prop.roadWidth) rows.push([prefix + 'Road width', prop.roadWidth]);
          }
        });
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
    if (selSvg) {
      selSvg.innerHTML = anySel ? buildSelectionSvg(items, strong, soft, vb, current.uid + 's') : '';
      if (anySel) fitBlockLabels(selSvg);
    }

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
    const uid = 'u' + (++uidSeq);

    const root = document.createElement('div');
    root.className = 'plotmap-overlay-root plotmap-map-stage';
    root.dataset.overlayMap = options.mapId || '';
    root.style.width = (options.width || container.clientWidth || 0) + 'px';
    root.style.height = (options.height || container.clientHeight || 0) + 'px';

    // 1. idle svg — the hero layer (glass roads + 3D blocks, always on)
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'plotmap-road-layer');
    svg.setAttribute('viewBox', vbRaw);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.innerHTML = buildIdleSvg(items, vb, uid);

    // 2. dim veil
    const veil = document.createElement('div');
    veil.className = 'pm-dim-veil';

    // 3. selection svg (premium re-render of selected items, above the veil)
    const selSvg = document.createElementNS(SVG_NS, 'svg');
    selSvg.setAttribute('class', 'plotmap-sel-layer');
    selSvg.setAttribute('viewBox', vbRaw);
    selSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // 4. fitted html layer (pins / plot boxes / labels / sel label)
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

    current = { root, container, mapId: options.mapId, mode: options.mode, items, vb, uid, selId: null, groupKey: null, strong: new Set() };
    applyState();
    fitBlockLabels(svg);
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
