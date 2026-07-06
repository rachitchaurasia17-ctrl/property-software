// PlotMap overlay store — the single source of truth for Map Studio markings.
// Seed items come from the static dataset (datasets/overlays.js). Items the
// team draws in Map Studio are stored here (localStorage), synced to Supabase
// via PMSyncQueue/PMSupaSync, and rendered in Client Presentation only when
// status === 'published' AND clientVisible === true.
(function () {
  const STORE_KEY = 'plotmap_overlay_store_v1';
  const LEAK_RE = /(price|₹|\bRs\.?\b|crore|lakh|budget|sold|seller|commission|finance|internal|draft|debug|demo|unverified|review)/i;
  const COLOR_HEX = { gold: '#A87F1F', blue: '#1E5FA8', emerald: '#157A56', bronze: '#B06A2C', ink: '#23201A' };
  const KIND_COLOR = { road: 'blue', boundary: 'blue', sector: 'gold', block: 'gold', plot: 'gold', pin: 'gold', landmark: 'emerald', commercial: 'bronze', label: 'ink' };
  const listeners = [];

  function nowIso() { return new Date().toISOString(); }
  function generateId() { return 'ovl-' + Math.random().toString(36).slice(2, 11); }
  function currentDealerId() {
    if (window.PMDataAdapter && typeof window.PMDataAdapter.getCurrentDealerId === 'function') {
      return window.PMDataAdapter.getCurrentDealerId() || 'dealer-demo';
    }
    try { return localStorage.getItem('plotmap_dealer_id') || 'dealer-demo'; } catch (e) {}
    return 'dealer-demo';
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return {
        items: Array.isArray(raw.items) ? raw.items : [],
        // per-map overrides applied to SEED items: { [mapId]: { [itemId]: { group, hidden } } }
        seedOverrides: raw.seedOverrides && typeof raw.seedOverrides === 'object' ? raw.seedOverrides : {}
      };
    } catch (e) {
      return { items: [], seedOverrides: {} };
    }
  }

  function save(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
    listeners.forEach(fn => { try { fn(); } catch (e) {} });
  }

  function enqueue(item) {
    if (window.PMSyncQueue) {
      window.PMSyncQueue.enqueueSyncAction({
        dealerId: item.dealerId || currentDealerId(),
        entityType: 'overlays', entityId: item.id, actionType: item.deleted ? 'delete' : 'upsert', payload: item
      });
    }
    if (window.PMSupaSync) window.PMSupaSync.requestDrain();
  }

  function audit(actionType, meta) {
    if (window.PMFoundation && typeof window.PMFoundation.audit === 'function') {
      try { window.PMFoundation.audit(actionType, meta || {}); } catch (e) {}
    }
  }

  function enqueueSeedOverrides(mapId, overrides) {
    if (window.PMSyncQueue) {
      window.PMSyncQueue.enqueueSyncAction({
        dealerId: currentDealerId(),
        entityType: 'overlayMeta', entityId: 'ovlmeta-' + mapId, actionType: 'upsert',
        payload: { mapId, overrides }
      });
    }
    if (window.PMSupaSync) window.PMSupaSync.requestDrain();
  }

  function colorHex(color) { return COLOR_HEX[color] || COLOR_HEX.gold; }

  function pathFromPts(kind, pts) {
    if (!Array.isArray(pts) || !pts.length) return '';
    let d = 'M' + pts.map(p => (+p[0]).toFixed(1) + ' ' + (+p[1]).toFixed(1)).join('L');
    if (kind !== 'road' && kind !== 'boundary') d += 'Z';
    return d;
  }

  function viewBoxFor(mapId, mode) {
    const seed = (window.PLOTMAP_OVERLAYS || {})[mapId];
    if (seed && seed.viewBox) return seed.viewBox;
    const registry = window.PM_MAP_REGISTRY;
    const map = registry && registry.maps ? registry.maps.find(m => m.id === mapId) : null;
    if (map) {
      const dims = (mode === 'easy' || mode === 'markings')
        ? (map.easyDimensions || map.dimensions)
        : (map.originalDimensions || map.dimensions);
      if (dims && dims.width && dims.height) return '0 0 ' + dims.width + ' ' + dims.height;
    }
    return '0 0 1414 1036';
  }

  // ---------- seed items (from datasets/overlays.js) → common shape ----------
  function seedItems(mapId) {
    const seed = (window.PLOTMAP_OVERLAYS || {})[mapId];
    if (!seed) return [];
    const overrides = load().seedOverrides[mapId] || {};
    const vb = String(seed.viewBox || '0 0 1414 1036').split(/\s+/).map(Number);
    const toAbs = (pct, axis) => (Number(pct) / 100) * (axis === 'x' ? vb[2] : vb[3]);
    const out = [];
    const push = (item) => {
      const o = overrides[item.id] || {};
      out.push(Object.assign(item, {
        seed: true, status: 'published',
        group: o.group !== undefined ? o.group : item.group || null,
        clientVisible: o.hidden ? false : item.public !== false
      }));
    };
    (seed.roads || []).forEach(r => push({ id: r.id, mapId, kind: 'road', name: r.label || r.id, sub: r.sub, d: r.d, color: 'blue', group: r.group, public: r.public, rows: r.rows, rel: r.rel }));
    (seed.shapes || []).forEach(s => push({
      id: s.id, mapId, kind: s.type === 'landmark' ? 'landmark' : (s.type || 'sector'), name: s.label || s.id, sub: s.sub,
      d: (s.paths || [])[0] || '', paths: s.paths, color: s.type === 'landmark' ? 'emerald' : 'gold', group: s.group, public: s.public, rows: s.rows, rel: s.rel, parent: s.parent
    }));
    (seed.labels || []).forEach(l => push({ id: l.id, mapId, kind: 'label', name: l.label || l.text || '', at: l.at, color: 'ink', group: l.group, public: l.public, big: l.big }));
    (seed.selectedPlots || []).forEach(p => push({
      id: p.id, mapId, kind: 'plot', name: p.label || p.id, color: 'gold', group: p.group, public: p.public,
      pts: [[toAbs(p.x, 'x'), toAbs(p.y, 'y')], [toAbs(p.x + p.w, 'x'), toAbs(p.y + p.h, 'y')]]
    }));
    (seed.selectedLandmarks || []).forEach(p => push({
      id: p.id, mapId, kind: 'landmark', name: p.label || p.id, color: 'emerald', group: p.group, public: p.public,
      pts: [[toAbs(p.x, 'x'), toAbs(p.y, 'y')], [toAbs(p.x + p.w, 'x'), toAbs(p.y + p.h, 'y')]]
    }));
    (seed.pins || []).forEach(p => {
      let at = null;
      if (Number.isFinite(+p.x) && Number.isFinite(+p.y)) at = [toAbs(p.x, 'x'), toAbs(p.y, 'y')];
      else if (p.targetId) {
        const t = (seed.selectedPlots || []).concat(seed.selectedLandmarks || []).find(x => x.id === p.targetId);
        if (t) at = [toAbs(+t.x + (+t.w || 0) / 2, 'x'), toAbs(+t.y + (+t.h || 0) / 2, 'y')];
      }
      if (at) push({ id: p.id, mapId, kind: 'pin', name: p.label || p.id, sub: p.sub, at, color: 'gold', group: p.group, public: p.public, targetId: p.targetId || null, rows: p.rows, parent: p.parent, nearRoad: p.nearRoad });
    });
    return out;
  }

  function customItems(mapId) {
    const dealerId = currentDealerId();
    return load().items.filter(it => !it.deleted && (!it.dealerId || it.dealerId === dealerId) && (!mapId || it.mapId === mapId));
  }

  function list(mapId) {
    return seedItems(mapId).concat(customItems(mapId));
  }

  function get(id) {
    return load().items.find(it => it.id === id) || null;
  }

  function upsert(input) {
    const store = load();
    const now = nowIso();
    let item = store.items.find(it => it.id === input.id);
    if (item) Object.assign(item, input, { dealerId: item.dealerId || currentDealerId(), updatedAt: now });
    else {
      item = Object.assign({
        id: generateId(), kind: 'block', name: '', color: KIND_COLOR[input.kind] || 'gold',
        status: 'draft', clientVisible: true, deleted: false, createdAt: now,
        dealerId: currentDealerId()
      }, input, { updatedAt: now });
      store.items.push(item);
    }
    if (Array.isArray(item.pts) && !item.at) item.d = pathFromPts(item.kind, item.kind === 'plot' ? rectPts(item.pts) : item.pts);
    save(store);
    enqueue(item);
    if (input && (Object.prototype.hasOwnProperty.call(input, 'status') || Object.prototype.hasOwnProperty.call(input, 'clientVisible') || Object.prototype.hasOwnProperty.call(input, 'propertyId'))) {
      audit('overlay_updated', { entityType: 'overlays', entityId: item.id, kind: item.kind, mapId: item.mapId, status: item.status, clientVisible: item.clientVisible !== false, propertyId: item.propertyId || null });
    }
    return item;
  }

  function rectPts(pts) {
    if (!Array.isArray(pts) || pts.length < 2) return pts || [];
    if (pts.length > 2) return pts;
    const [a, b] = pts;
    return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
  }

  function remove(id) {
    const store = load();
    const item = store.items.find(it => it.id === id);
    if (!item) return null;
    item.deleted = true;
    item.updatedAt = nowIso();
    save(store);
    enqueue(item);
    audit('overlay_deleted', { entityType: 'overlays', entityId: item.id, kind: item.kind, mapId: item.mapId });
    return item;
  }

  // group/visibility for BOTH seed and custom items
  function setGroup(mapId, itemId, group) {
    const store = load();
    const custom = store.items.find(it => it.id === itemId);
    if (custom) {
      custom.group = group;
      custom.updatedAt = nowIso();
      save(store);
      enqueue(custom);
      return;
    }
    const forMap = store.seedOverrides[mapId] = store.seedOverrides[mapId] || {};
    forMap[itemId] = Object.assign({}, forMap[itemId], { group });
    save(store);
    enqueueSeedOverrides(mapId, store.seedOverrides[mapId]);
  }

  function setVisibility(mapId, itemId, visible) {
    const store = load();
    const custom = store.items.find(it => it.id === itemId);
    if (custom) {
      custom.clientVisible = !!visible;
      custom.updatedAt = nowIso();
      save(store);
      enqueue(custom);
      return;
    }
    const forMap = store.seedOverrides[mapId] = store.seedOverrides[mapId] || {};
    forMap[itemId] = Object.assign({}, forMap[itemId], { hidden: !visible });
    save(store);
    enqueueSeedOverrides(mapId, store.seedOverrides[mapId]);
  }

  // Client Presentation reads ONLY through this: published + visible + leak-safe.
  function publishedForClient(mapId) {
    return list(mapId).filter(it =>
      it.status === 'published' &&
      it.clientVisible !== false &&
      !it.deleted &&
      !LEAK_RE.test(String(it.name || '')) &&
      (it.d || it.at || (it.paths && it.paths.length) || (it.pts && it.pts.length))
    );
  }

  // remote merge (from PMSupaSync.pull) — newer wins, local pending edits kept
  function mergeRemote(rows) {
    const store = load();
    let changed = false;
    (rows || []).forEach(row => {
      if (!row || !row.id) return;
      const i = store.items.findIndex(it => it.id === row.id);
      if (i < 0) {
        if (!row.deleted) { store.items.push(row); changed = true; }
        return;
      }
      const local = store.items[i];
      const localTime = Date.parse(local.updatedAt || 0) || 0;
      const remoteTime = Date.parse(row.updatedAt || 0) || 0;
      if (remoteTime > localTime) { store.items[i] = row; changed = true; }
    });
    if (changed) save(store);
  }

  function mergeRemoteSeedOverrides(mapId, overrides) {
    if (!mapId || !overrides) return;
    const store = load();
    store.seedOverrides[mapId] = Object.assign({}, store.seedOverrides[mapId], overrides);
    save(store);
  }

  function subscribe(fn) {
    listeners.push(fn);
    window.addEventListener('storage', e => { if (e.key === STORE_KEY) fn(); });
  }

  window.PMOverlayStore = {
    list, get, upsert, remove, customItems, seedItems,
    setGroup, setVisibility, publishedForClient,
    mergeRemote, mergeRemoteSeedOverrides,
    viewBoxFor, colorHex, pathFromPts, rectPts, subscribe,
    KIND_COLOR
  };
})();
