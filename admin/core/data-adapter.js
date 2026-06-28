// PlotMap data adapter: local-first today, backend-ready later.
(function() {
  const STORE_KEY = 'plotmap_crm_v1';
  const DEFAULT_DEALER_ID = 'dealer-demo';
  const DEFAULT_USER_ID = 'user-owner-demo';
  const COLLECTIONS = [
    'dealers', 'users', 'accessLinks', 'staff', 'areas', 'clients', 'properties',
    'followups', 'siteVisits', 'deals', 'events', 'presentationEvents', 'reports',
    'pins', 'mapDrawings', 'syncQueue'
  ];

  function nowIso() {
    return new Date().toISOString();
  }

  function generateId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
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

  function ensureFoundationData(input) {
    const data = input || clone(window.CRM_DEMO || {});
    COLLECTIONS.forEach(key => ensureArray(data, key));

    if (!data.dealers.length) {
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

    if (!data.users.length) {
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

    if (!data.accessLinks.length) {
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
    writeLocal(data);
    return data;
  }

  function saveData(data) {
    return writeLocal(ensureFoundationData(data || {}));
  }

  function list(entityType) {
    const data = getData();
    return Array.isArray(data[entityType]) ? data[entityType] : [];
  }

  function findById(entityType, id) {
    return list(entityType).find(item => item && item.id === id) || null;
  }

  function upsert(entityType, record) {
    const data = getData();
    ensureArray(data, entityType);
    const item = Object.assign({}, record || {});
    if (!item.id) item.id = generateId(entityType.slice(0, 3));
    item.updatedAt = nowIso();
    if (!item.createdAt) item.createdAt = item.updatedAt;
    const idx = data[entityType].findIndex(existing => existing.id === item.id);
    if (idx >= 0) data[entityType][idx] = Object.assign({}, data[entityType][idx], item);
    else data[entityType].push(item);
    saveData(data);
    return item;
  }

  function patch(entityType, id, changes) {
    const current = findById(entityType, id);
    if (!current) return null;
    return upsert(entityType, Object.assign({}, current, changes || {}));
  }

  function getCurrentDealer(data) {
    const source = data || getData();
    const selected = localStorage.getItem('plotmap_dealer_id');
    return source.dealers.find(d => d.id === selected) || source.dealers[0] || null;
  }

  function getCurrentUser(data) {
    const source = data || getData();
    const selected = localStorage.getItem('plotmap_user_id');
    const role = localStorage.getItem('plotmap_admin_role');
    return source.users.find(u => u.id === selected) ||
      source.users.find(u => role === 'dealer' ? u.role === 'owner' : u.role === role) ||
      source.users[0] ||
      null;
  }

  window.PMDataAdapter = {
    STORE_KEY,
    DEFAULT_DEALER_ID,
    DEFAULT_USER_ID,
    nowIso,
    generateId,
    ensureFoundationData,
    getData,
    saveData,
    list,
    findById,
    upsert,
    patch,
    getCurrentDealer,
    getCurrentUser
  };
})();
