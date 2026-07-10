// PlotMap Supabase sync — local-first, non-blocking.
// Drains the PMSyncQueue to Supabase and pulls remote changes into the
// local CRM store, so admin (laptop) and Client Presentation (tablet)
// share one dataset. Never blocks the UI: every network call is async,
// batched, and failure-tolerant. If a table does not exist yet (the
// dashboard SQL was not run), that table is marked unavailable for the
// session and everything keeps working from localStorage.
(function () {
  const SUPABASE_URL = 'https://czmkfmkmgqlienmdihul.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DGqcs0JaDVgzImUGGgg_FQ_Q_SkgnhX';
  const REST = SUPABASE_URL + '/rest/v1/';
  const PULL_STAMP_KEY = 'plotmap_supa_pull_v1';
  const DRAIN_INTERVAL_MS = 20000;
  const DEBOUNCE_MS = 2500;
  const CLIENT_SAFE_PROPERTIES_VIEW = 'client_safe_properties';
  const CRM_ENTITY_TYPES = new Set([
    'clients', 'properties', 'deals', 'followups', 'siteVisits',
    'events', 'staff', 'dealers', 'users', 'accessLinks', 'reports', 'pins', 'mapDrawings',
    'overlayMeta', 'dealerSettings', 'shareLinks', 'auditLogs'
  ]);

  // tables confirmed missing — cached across pages for 10 min so every
  // navigation doesn't re-probe endpoints that don't exist yet
  const MISSING_KEY = 'plotmap_supa_missing_v1';
  const MISSING_TTL = 10 * 60 * 1000;
  const unavailable = new Set((() => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(MISSING_KEY) || 'null');
      if (raw && Date.now() - raw.at < MISSING_TTL) return raw.tables || [];
    } catch (e) {}
    return [];
  })());
  function rememberMissing(table) {
    unavailable.add(table);
    try { sessionStorage.setItem(MISSING_KEY, JSON.stringify({ at: Date.now(), tables: [...unavailable] })); } catch (e) {}
  }
  let draining = false;
  let debounceTimer = null;

  function isAdminRoute() {
    return /^\/admin\//i.test(location.pathname || '');
  }

  function resolveCurrentDealerId() {
    try {
      const params = new URLSearchParams(location.search || '');
      const explicit = params.get('dealerId') || params.get('dealer');
      if (explicit) {
        localStorage.setItem('plotmap_dealer_id', explicit);
        return explicit;
      }
    } catch (err) {}
    if (window.PMDataAdapter && typeof window.PMDataAdapter.getCurrentDealerId === 'function') {
      const id = window.PMDataAdapter.getCurrentDealerId();
      if (id) return id;
    }
    try {
      const stored = localStorage.getItem('plotmap_dealer_id');
      if (stored) return stored;
    } catch (err) {}
    if (window.CRM && typeof window.CRM.getScopedCRM === 'function') {
      const data = window.CRM.getScopedCRM();
      const dealer = data && Array.isArray(data.dealers) ? data.dealers[0] : null;
      if (dealer && dealer.id) return dealer.id;
    }
    // Admin routes must NEVER fall back to the demo tenant: a signed-in
    // dealer whose id has not resolved yet would otherwise pull/stamp
    // dealer-demo data (multi-dealer corruption). Null = skip sync until
    // the profile mirror (plotmap_dealer_id) is written by guardPage.
    // The public Client Presentation keeps the demo tenant as its
    // intentional default for bare /app/plotmap/ visits.
    return isAdminRoute() ? null : 'dealer-demo';
  }

  async function authToken() {
    if (!window.PMAuth || typeof window.PMAuth.getAccessToken !== 'function') return null;
    try {
      return await window.PMAuth.getAccessToken();
    } catch (err) {
      return null;
    }
  }

  async function headers(extra) {
    const token = await authToken();
    return Object.assign({
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + (token || SUPABASE_KEY),
      'Content-Type': 'application/json'
    }, extra || {});
  }

  async function rest(path, options) {
    const hdrs = await headers(options && options.prefer ? { Prefer: options.prefer } : {});
    const res = await fetch(REST + path, Object.assign({ headers: hdrs }, options));
    if (res.status === 404) {
      rememberMissing(path.split('?')[0]);
      return { missing: true };
    }
    if (res.status === 401 || res.status === 403) {
      return { forbidden: true, status: res.status };
    }
    if (res.status === 409) {
      return { conflict: true };
    }
    if (!res.ok) throw new Error('supabase ' + res.status + ' on ' + path.split('?')[0]);
    if (res.status === 204) return { ok: true };
    return { ok: true, data: await res.json().catch(() => null) };
  }

  function rpcPath(name) {
    return 'rpc/' + encodeURIComponent(name);
  }

  async function callRpc(name, payload, options) {
    return rest(rpcPath(name), Object.assign({
      method: 'POST',
      body: JSON.stringify(payload || {})
    }, options || {}));
  }

  function tableFor(entityType) {
    if (entityType === 'presentationEvents') return 'presentation_events';
    if (entityType === 'overlays') return 'map_overlays';
    if (CRM_ENTITY_TYPES.has(entityType)) return 'crm_records';
    return null;
  }

  function rowFor(item) {
    const p = item.payload || {};
    const dealerId = p.dealerId || item.dealerId || resolveCurrentDealerId();
    if (item.entityType === 'presentationEvents') {
      const metadata = Object.assign({}, p.metadata || {}, { source: 'client_presentation' });
      return {
        id: p.id || item.entityId,
        dealer_id: dealerId,
        session_id: p.sessionId || '',
        event_type: p.eventType || 'unknown',
        area: p.area || null,
        sector: p.sector || null,
        map_id: (p.metadata && p.metadata.mapId) || p.mapId || null,
        property_id: p.propertyId || null,
        client_id: p.clientId || null,
        metadata,
        created_at: p.createdAt || new Date().toISOString()
      };
    }
    if (item.entityType === 'overlays') {
      return {
        id: p.id || item.entityId,
        dealer_id: dealerId,
        map_id: p.mapId || '',
        kind: p.kind || 'block',
        payload: p,
        status: p.status || 'draft',
        client_visible: p.clientVisible !== false,
        deleted: !!p.deleted,
        updated_at: p.updatedAt || new Date().toISOString()
      };
    }
    return {
      id: item.entityId,
      dealer_id: dealerId,
      entity_type: item.entityType,
      payload: p,
      deleted: item.actionType === 'delete' || item.actionType === 'archive' ? !!p.deleted : false,
      updated_at: new Date().toISOString()
    };
  }

  async function drain() {
    if (draining || !navigator.onLine || !window.PMSyncQueue) return;
    draining = true;
    try {
      const pending = window.PMSyncQueue.getPendingSyncActions() || [];
      if (!pending.length) return;
      const activeDealerId = resolveCurrentDealerId();
      // group by target table for batched upserts
      const groups = {};
      pending.forEach(item => {
        if (activeDealerId && item && item.dealerId && item.dealerId !== activeDealerId) return;
        // never push rows that would land with no dealer scope
        if (!activeDealerId && !(item && item.dealerId) && !(item && item.payload && item.payload.dealerId)) return;
        const table = tableFor(item.entityType);
        if (!table || unavailable.has(table)) return;
        (groups[table] = groups[table] || []).push(item);
      });
      for (const table of Object.keys(groups)) {
        const items = groups[table];
        // updates to the same id: keep the LAST payload (later actions win)
        const byId = new Map();
        items.forEach(it => byId.set(rowFor(it).id, it));
        const rows = [...byId.values()].map(rowFor);
        try {
          items.forEach(it => window.PMSyncQueue.markSyncActionSyncing(it.id));
          if (table === 'presentation_events') {
            const rowOutcome = new Map();
            for (const [rowId, it] of byId) {
              const row = rowFor(it);
              try {
                const single = await callRpc('plotmap_record_presentation_event', {
                  p_dealer_id: row.dealer_id,
                  p_session_id: row.session_id,
                  p_event_type: row.event_type,
                  p_area: row.area,
                  p_sector: row.sector,
                  p_map_id: row.map_id,
                  p_property_id: row.property_id,
                  p_client_id: row.client_id,
                  p_metadata: row.metadata || {},
                  p_event_id: row.id,
                  p_created_at: row.created_at
                }, { prefer: 'return=minimal' });
                rowOutcome.set(rowId, !!single.ok);
              } catch (err) {
                rowOutcome.set(rowId, false);
              }
            }
            items.forEach(it => {
              if (rowOutcome.get(rowFor(it).id)) window.PMSyncQueue.markSyncActionSynced(it.id);
              else window.PMSyncQueue.markSyncActionRetrying(it.id);
            });
            continue;
          }
          // presentation_events is append-only for anon (RLS allows INSERT
          // only, no SELECT/UPDATE) — any ON CONFLICT resolution is rejected
          // by RLS, so it must be a plain insert.
          const appendOnly = table === 'presentation_events';
          const result = await rest(table, {
            method: 'POST',
            body: JSON.stringify(rows),
            prefer: appendOnly
              ? 'return=minimal'
              : 'resolution=merge-duplicates,return=minimal'
          });
          if (result.conflict && appendOnly) {
            // A duplicate id (response lost on a prior attempt) aborts the
            // whole batch — replay per row so fresh rows still land; a
            // per-row 409 means that row is already there, i.e. synced.
            const rowOutcome = new Map();
            for (const [rowId, it] of byId) {
              try {
                const single = await rest(table, {
                  method: 'POST',
                  body: JSON.stringify([rowFor(it)]),
                  prefer: 'return=minimal'
                });
                rowOutcome.set(rowId, !!(single.ok || single.conflict));
              } catch (err) {
                rowOutcome.set(rowId, false);
              }
            }
            items.forEach(it => {
              if (rowOutcome.get(rowFor(it).id)) window.PMSyncQueue.markSyncActionSynced(it.id);
              else window.PMSyncQueue.markSyncActionRetrying(it.id);
            });
            continue;
          }
          if (result.missing || result.forbidden || result.conflict) {
            items.forEach(it => window.PMSyncQueue.markSyncActionRetrying(it.id));
            continue;
          }
          items.forEach(it => window.PMSyncQueue.markSyncActionSynced(it.id));
        } catch (err) {
          items.forEach(it => window.PMSyncQueue.markSyncActionFailed(it.id, err.message));
        }
      }
    } catch (err) {
      /* never surface sync errors to the UI */
    } finally {
      draining = false;
    }
  }

  // ---------- pull: merge remote → local ----------
  function pullStamps() {
    try { return JSON.parse(localStorage.getItem(PULL_STAMP_KEY) || '{}'); } catch (e) { return {}; }
  }
  function setPullStamp(table, iso) {
    const s = pullStamps(); s[table] = iso;
    try { localStorage.setItem(PULL_STAMP_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function mergeById(list, incoming, newerWins) {
    const idx = new Map(list.map((x, i) => [x.id, i]));
    incoming.forEach(row => {
      const i = idx.get(row.id);
      if (i === undefined) { list.push(row); return; }
      if (!newerWins) return;
      const localTime = Date.parse(list[i].updatedAt || list[i].createdAt || 0) || 0;
      const remoteTime = Date.parse(row.updatedAt || row.createdAt || 0) || 0;
      // don't clobber unsynced local edits
      if (list[i].syncStatus === 'pending') return;
      if (remoteTime >= localTime) list[i] = Object.assign({}, list[i], row);
    });
  }

  async function pullCrmRecords() {
    if (!window.CRM) return;
    const since = pullStamps().crm_records || '1970-01-01T00:00:00Z';
    const dealerId = resolveCurrentDealerId();
    if (!dealerId) return;
    const table = isAdminRoute() ? 'crm_records' : CLIENT_SAFE_PROPERTIES_VIEW;
    if (unavailable.has(table)) return;
    const result = isAdminRoute()
      ? await rest('crm_records?select=*&dealer_id=eq.' + encodeURIComponent(dealerId) + '&updated_at=gt.' + encodeURIComponent(since) + '&order=updated_at.asc&limit=500', { method: 'GET' })
      : await callRpc('plotmap_client_properties', { p_dealer_id: dealerId });
    if (result.missing || result.forbidden || !result.data || !result.data.length) return;
    const data = window.CRM.getCRM();
    let latest = since;
    result.data.forEach(row => {
      if (row.updated_at > latest) latest = row.updated_at;
      if (isAdminRoute()) {
        if (row.entity_type === 'overlayMeta') {
          if (window.PMOverlayStore && row.payload) {
            window.PMOverlayStore.mergeRemoteSeedOverrides(row.payload.mapId, row.payload.overrides);
          }
          return;
        }
        const bucket = data[row.entity_type];
        if (!Array.isArray(bucket)) return;
        if (row.deleted) {
          const i = bucket.findIndex(x => x.id === row.id);
          if (i >= 0) bucket.splice(i, 1);
          return;
        }
        mergeById(bucket, [Object.assign({}, row.payload, { id: row.id, syncStatus: 'synced' })], true);
        return;
      }
      if (!Array.isArray(data.properties)) data.properties = [];
      // Client route: strip to the known client-safe column set BEFORE the
      // row touches localStorage — client safety must not depend on the
      // server view never gaining a sensitive column.
      mergeById(data.properties, [{
        id: row.id,
        dealerId: row.dealer_id || '',
        title: row.title || '',
        area: row.area || '',
        plotNumber: row.plot_number || '',
        block: row.block || '',
        blockId: row.block_id || row.blockId || '',
        size: row.size || '',
        facing: row.facing || '',
        roadWidth: row.road_width || '',
        description: row.description || '',
        propertyType: row.property_type || '',
        tags: row.tags || null,
        internalStatus: row.internal_status || 'Available',
        updatedAt: row.updated_at,
        syncStatus: 'synced'
      }], true);
    });
    window.CRM.saveCRM(data);
    setPullStamp('crm_records', latest);
  }

  async function pullPresentationEvents() {
    if (unavailable.has('presentation_events') || !window.CRM || !isAdminRoute()) return;
    const since = pullStamps().presentation_events || '1970-01-01T00:00:00Z';
    const dealerId = resolveCurrentDealerId();
    if (!dealerId) return;
    const result = await rest('presentation_events?select=*&dealer_id=eq.' + encodeURIComponent(dealerId) + '&created_at=gt.' + encodeURIComponent(since) + '&order=created_at.asc&limit=1000', { method: 'GET' });
    if (result.missing || result.forbidden || !result.data || !result.data.length) return;
    const data = window.CRM.getCRM();
    if (!Array.isArray(data.presentationEvents)) data.presentationEvents = [];
    const seen = new Set(data.presentationEvents.map(e => e.id));
    let latest = since;
    result.data.forEach(row => {
      if (row.created_at > latest) latest = row.created_at;
      if (seen.has(row.id)) return;
      data.presentationEvents.push({
        id: row.id,
        dealerId: row.dealer_id,
        sessionId: row.session_id,
        eventType: row.event_type,
        area: row.area,
        sector: row.sector,
        propertyId: row.property_id,
        clientId: row.client_id,
        metadata: Object.assign({}, row.metadata, row.map_id ? { mapId: row.map_id } : {}),
        createdAt: row.created_at,
        syncStatus: 'synced'
      });
    });
    window.CRM.saveCRM(data);
    setPullStamp('presentation_events', latest);
  }

  async function pullOverlays() {
    if (unavailable.has('map_overlays') || !window.PMOverlayStore) return;
    const since = pullStamps().map_overlays || '1970-01-01T00:00:00Z';
    const dealerId = resolveCurrentDealerId();
    if (!dealerId) return;
    const result = isAdminRoute()
      ? await rest('map_overlays?select=*&dealer_id=eq.' + encodeURIComponent(dealerId) + '&updated_at=gt.' + encodeURIComponent(since) + '&order=updated_at.asc&limit=500', { method: 'GET' })
      : await callRpc('plotmap_client_overlays', { p_dealer_id: dealerId });
    if (result.missing || result.forbidden || !result.data || !result.data.length) return;
    let latest = since;
    const rows = result.data.map(row => {
      if (row.updated_at > latest) latest = row.updated_at;
      return Object.assign({}, row.payload, {
        id: row.id, mapId: row.map_id, kind: row.kind,
        status: row.status, clientVisible: row.client_visible,
        deleted: row.deleted, updatedAt: row.updated_at
      });
    });
    window.PMOverlayStore.mergeRemote(rows);
    setPullStamp('map_overlays', latest);
  }

  async function pull() {
    if (!navigator.onLine) return;
    try { await pullCrmRecords(); } catch (e) {}
    try { await pullPresentationEvents(); } catch (e) {}
    try { await pullOverlays(); } catch (e) {}
  }

  function requestDrain() {
    clearTimeout(debounceTimer);
    if (window.PMSyncQueue && typeof window.PMSyncQueue.retryFailedSyncActions === 'function') {
      window.PMSyncQueue.retryFailedSyncActions();
    }
    debounceTimer = setTimeout(drain, DEBOUNCE_MS);
  }

  // Public API
  window.PMSupaSync = { drain, pull, requestDrain, url: SUPABASE_URL, key: SUPABASE_KEY };

  // Boot: pull once shortly after load, then drain + pull on a slow loop.
  const boot = () => {
    setTimeout(() => { pull().then(drain); }, 1200);
    setInterval(() => { drain().then ? drain().then(pull) : pull(); }, DRAIN_INTERVAL_MS);
    window.addEventListener('online', requestDrain);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
