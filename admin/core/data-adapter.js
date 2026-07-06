// PlotMap data adapter: local-first today, backend-ready later.
(function() {
  const STORE_KEY = 'plotmap_crm_v1';
  const DEFAULT_DEALER_ID = 'dealer-demo';
  const DEFAULT_USER_ID = 'user-owner-demo';
  const COLLECTIONS = [
    'dealers', 'users', 'accessLinks', 'staff', 'areas', 'clients', 'properties',
    'followups', 'siteVisits', 'deals', 'events', 'presentationEvents', 'reports',
    'pins', 'mapDrawings', 'syncQueue', 'dealerSettings', 'shareLinks', 'auditLogs'
  ];
  const DEALER_SCOPED_COLLECTIONS = new Set([
    'users', 'accessLinks', 'staff', 'areas', 'clients', 'properties', 'followups',
    'siteVisits', 'deals', 'events', 'presentationEvents', 'reports', 'pins',
    'mapDrawings', 'dealerSettings', 'shareLinks', 'auditLogs'
  ]);

  function nowIso() {
    return new Date().toISOString();
  }

  function generateId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function isLocalDev() {
    if (window.PMAuth && typeof window.PMAuth.isLocalDev === 'function') return window.PMAuth.isLocalDev();
    const host = String(location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('PlotMap data adapter could not read local store', err);
      return null;
    }
  }

  function writeLocal(data) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data || {}));
      return true;
    } catch (err) {
      console.warn('PlotMap data adapter could not write local store', err);
      return false;
    }
  }

  function ensureArray(data, key) {
    if (!Array.isArray(data[key])) data[key] = [];
  }

  function readSearchParams() {
    try {
      return new URLSearchParams(location.search || '');
    } catch (err) {
      return new URLSearchParams();
    }
  }

  function sanitizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getDealerSelection(data) {
    const params = readSearchParams();
    const explicitId = params.get('dealerId') || params.get('dealer');
    const explicitSlug = params.get('dealerSlug');
    const selected = localStorage.getItem('plotmap_dealer_id');
    const dealers = Array.isArray(data && data.dealers) ? data.dealers : [];
    if (explicitId) {
      return dealers.find(item => item && item.id === explicitId) || null;
    }
    if (explicitSlug) {
      const slugKey = sanitizeKey(explicitSlug);
      return dealers.find(item => sanitizeKey(item && item.slug) === slugKey) || null;
    }
    if (selected) {
      return dealers.find(item => item && item.id === selected) || null;
    }
    return dealers[0] || null;
  }

  function syncDealerSelection(data) {
    const dealer = getDealerSelection(data);
    if (!dealer || !dealer.id) return dealer;
    try { localStorage.setItem('plotmap_dealer_id', dealer.id); } catch (err) {}
    return dealer;
  }

  function isDealerScopedEntity(entityType) {
    return DEALER_SCOPED_COLLECTIONS.has(entityType);
  }

  function belongsToDealer(item, dealerId) {
    if (!dealerId || !item || typeof item !== 'object') return true;
    if (!Object.prototype.hasOwnProperty.call(item, 'dealerId')) return true;
    return !item.dealerId || item.dealerId === dealerId;
  }

  function scopedRecords(entityType, list, dealerId) {
    if (!isDealerScopedEntity(entityType) || !dealerId) return Array.isArray(list) ? list : [];
    return (Array.isArray(list) ? list : []).filter(item => belongsToDealer(item, dealerId));
  }

  function ensureFoundationData(input) {
    const data = input || (isLocalDev() ? clone(window.CRM_DEMO || {}) : {});
    COLLECTIONS.forEach(key => ensureArray(data, key));

    if (!data.dealers.length && isLocalDev()) {
      const createdAt = nowIso();
      data.dealers.push({
        id: DEFAULT_DEALER_ID,
        name: 'Demo Dealer',
        slug: 'demo-dealer',
        businessName: 'PlotMap Demo Realty',
        phone: '',
        email: '',
        status: 'trial',
        trialStart: createdAt,
        trialEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
        createdAt,
        updatedAt: createdAt
      });
    }

    if (!data.users.length && data.dealers.length && isLocalDev()) {
      const createdAt = nowIso();
      data.users.push({
        id: DEFAULT_USER_ID,
        dealerId: data.dealers[0].id,
        name: 'Owner',
        phone: '',
        email: '',
        role: 'owner',
        status: 'active',
        lastAccessCheck: createdAt,
        lastLogin: createdAt,
        createdAt,
        updatedAt: createdAt
      });
      data.users.push({
        id: 'user-team-demo',
        dealerId: data.dealers[0].id,
        name: 'Team Member',
        phone: '',
        email: '',
        role: 'team',
        status: 'active',
        lastAccessCheck: createdAt,
        lastLogin: createdAt,
        createdAt,
        updatedAt: createdAt
      });
    }

    if (!data.accessLinks.length && data.dealers.length && data.users.length && isLocalDev()) {
      const createdAt = nowIso();
      data.accessLinks.push({
        id: 'link-demo-owner',
        dealerId: data.dealers[0].id,
        createdBy: data.users[0].id,
        token: 'demo-owner',
        label: 'Demo Owner Trial',
        roleAllowed: 'owner',
        expiresAt: data.dealers[0].trialEnd,
        maxUses: 100,
        useCount: 0,
        status: 'active',
        createdAt,
        updatedAt: createdAt
      });
    }

    if (!data.syncMeta || typeof data.syncMeta !== 'object') {
      data.syncMeta = {
        lastSyncedAt: null,
        pendingCount: data.syncQueue.length,
        failedCount: 0,
        offlineGraceHours: 24
      };
    }

    return data;
  }

  function getData() {
    const data = ensureFoundationData(readLocal());
    syncDealerSelection(data);
    writeLocal(data);
    return data;
  }

  function saveData(data) {
    return writeLocal(ensureFoundationData(data || {}));
  }

  function list(entityType, options) {
    const data = getData();
    const rows = Array.isArray(data[entityType]) ? data[entityType] : [];
    if (options && options.scoped) {
      return scopedRecords(entityType, rows, (options && options.dealerId) || getCurrentDealerId(data));
    }
    return rows;
  }

  function findById(entityType, id, options) {
    return list(entityType, options).find(item => item && item.id === id) || null;
  }

  function upsert(entityType, record, options) {
    const data = getData();
    ensureArray(data, entityType);
    const item = Object.assign({}, record || {});
    if (!item.id) item.id = generateId(entityType.slice(0, 3));
    if (isDealerScopedEntity(entityType)) {
      item.dealerId = item.dealerId || (options && options.dealerId) || getCurrentDealerId(data) || DEFAULT_DEALER_ID;
    }
    item.updatedAt = nowIso();
    if (!item.createdAt) item.createdAt = item.updatedAt;
    const idx = data[entityType].findIndex(existing => existing.id === item.id);
    if (idx >= 0) data[entityType][idx] = Object.assign({}, data[entityType][idx], item);
    else data[entityType].push(item);
    saveData(data);
    return item;
  }

  function patch(entityType, id, changes, options) {
    const current = findById(entityType, id, options);
    if (!current) return null;
    return upsert(entityType, Object.assign({}, current, changes || {}), options);
  }

  function getCurrentDealer(data) {
    const source = data || getData();
    return syncDealerSelection(source) || null;
  }

  function getCurrentDealerId(data) {
    const dealer = getCurrentDealer(data);
    return dealer && dealer.id ? dealer.id : null;
  }

  function getCurrentUser(data) {
    const source = data || getData();
    const selected = localStorage.getItem('plotmap_user_id');
    const role = localStorage.getItem('plotmap_admin_role');
    const dealerId = getCurrentDealerId(source);
    return source.users.find(u => u.id === selected && belongsToDealer(u, dealerId)) ||
      source.users.find(u => belongsToDealer(u, dealerId) && (role === 'dealer' ? u.role === 'owner' : u.role === role)) ||
      source.users.find(u => belongsToDealer(u, dealerId)) ||
      source.users[0] ||
      null;
  }

  function getScopedData(input, dealerId) {
    const source = ensureFoundationData(clone(input || getData()));
    const activeDealerId = dealerId || getCurrentDealerId(source);
    COLLECTIONS.forEach(key => {
      if (!isDealerScopedEntity(key)) return;
      source[key] = scopedRecords(key, source[key], activeDealerId);
    });
    return source;
  }

  window.PMDataAdapter = {
    STORE_KEY,
    DEFAULT_DEALER_ID,
    DEFAULT_USER_ID,
    DEALER_SCOPED_COLLECTIONS,
    nowIso,
    generateId,
    ensureFoundationData,
    getData,
    getScopedData,
    saveData,
    list,
    findById,
    upsert,
    patch,
    getCurrentDealer,
    getCurrentDealerId,
    isDealerScopedEntity,
    belongsToDealer,
    getCurrentUser
  };
})();
