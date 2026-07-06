(function () {
  const TEAM_SCOPES = [
    'presentation.view',
    'properties.manage',
    'mapstudio.manage',
    'clients.view',
    'deals.view',
    'exports.manage',
    'audit.view'
  ];
  const OWNER_SCOPES = TEAM_SCOPES.concat([
    'dealerSettings.manage',
    'team.manage',
    'billing.manage'
  ]);
  const EXPORT_COLLECTIONS = [
    'dealerSettings', 'users', 'staff', 'areas', 'clients',
    'properties', 'followups', 'siteVisits', 'deals', 'shareLinks', 'auditLogs'
  ];

  function adapter() {
    return window.PMDataAdapter || null;
  }

  function nowIso() {
    return (adapter() && adapter().nowIso()) || new Date().toISOString();
  }

  function generateId(prefix) {
    return (adapter() && adapter().generateId(prefix)) || (prefix + '-' + Math.random().toString(36).slice(2, 11));
  }

  function readData() {
    if (adapter() && typeof adapter().getData === 'function') return adapter().getData();
    return window.CRM && typeof window.CRM.getCRM === 'function' ? window.CRM.getCRM() : {};
  }

  function saveData(data) {
    if (adapter() && typeof adapter().saveData === 'function') return adapter().saveData(data);
    if (window.CRM && typeof window.CRM.saveCRM === 'function') return window.CRM.saveCRM(data);
    return false;
  }

  function ensureArray(data, key) {
    if (!Array.isArray(data[key])) data[key] = [];
  }

  function currentDealer(data) {
    if (adapter() && typeof adapter().getCurrentDealer === 'function') return adapter().getCurrentDealer(data);
    const rows = Array.isArray(data && data.dealers) ? data.dealers : [];
    const selected = localStorage.getItem('plotmap_dealer_id');
    return rows.find(item => item && item.id === selected) || rows[0] || null;
  }

  function currentUser(data) {
    if (adapter() && typeof adapter().getCurrentUser === 'function') return adapter().getCurrentUser(data);
    const rows = Array.isArray(data && data.users) ? data.users : [];
    const selected = localStorage.getItem('plotmap_user_id');
    return rows.find(item => item && item.id === selected) || rows[0] || null;
  }

  function currentDealerId(data) {
    const dealer = currentDealer(data);
    return dealer && dealer.id ? dealer.id : localStorage.getItem('plotmap_dealer_id') || 'dealer-demo';
  }

  function scopedRows(data, key) {
    const dealerId = currentDealerId(data);
    ensureArray(data, key);
    return data[key].filter(item => !item || !item.dealerId || item.dealerId === dealerId);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(String(text || ''));
    }
    const input = document.createElement('textarea');
    input.value = String(text || '');
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    return Promise.resolve();
  }

  function enqueue(entityType, entityId, actionType, payload, dealerId) {
    if (!window.PMSyncQueue) return;
    window.PMSyncQueue.enqueueSyncAction({
      dealerId: dealerId || currentDealerId(readData()),
      entityType,
      entityId,
      actionType,
      payload
    });
    if (window.PMSupaSync && typeof window.PMSupaSync.requestDrain === 'function') {
      window.PMSupaSync.requestDrain();
    }
  }

  function sanitizeSegment(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';
  }

  function sanitizeMetadata(input) {
    const out = {};
    Object.keys(input || {}).forEach(key => {
      const value = input[key];
      if (value == null) return;
      if (Array.isArray(value)) {
        out[key] = value.slice(0, 24).map(item => typeof item === 'object' ? JSON.stringify(item).slice(0, 200) : String(item).slice(0, 200));
        return;
      }
      if (typeof value === 'object') {
        out[key] = JSON.parse(JSON.stringify(value));
        return;
      }
      out[key] = typeof value === 'string' ? value.slice(0, 300) : value;
    });
    return out;
  }

  function audit(actionType, meta) {
    const data = readData();
    ensureArray(data, 'auditLogs');
    const dealerId = currentDealerId(data);
    const user = currentUser(data);
    const entry = {
      id: generateId('audit'),
      dealerId,
      actorUserId: user && user.id ? user.id : null,
      actorRole: user && user.role ? user.role : (localStorage.getItem('plotmap_admin_role') || 'viewer'),
      actionType: actionType || 'unknown',
      entityType: meta && meta.entityType ? meta.entityType : null,
      entityId: meta && meta.entityId ? meta.entityId : null,
      metadata: sanitizeMetadata(meta || {}),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      syncStatus: 'pending'
    };
    data.auditLogs.push(entry);
    saveData(data);
    enqueue('auditLogs', entry.id, 'create', entry, dealerId);
    return entry;
  }

  function listRecentAudit(limit) {
    const data = readData();
    return scopedRows(data, 'auditLogs')
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, Number(limit || 8));
  }

  function defaultSettings(dealer, teamCount) {
    const dealerId = dealer && dealer.id ? dealer.id : currentDealerId(readData());
    return {
      id: 'dealer-settings-' + dealerId,
      dealerId,
      brandName: (dealer && (dealer.businessName || dealer.name)) || 'PlotMap',
      brandTagline: 'Premium Real Estate Map Studio',
      accentColor: '#1F5E47',
      supportEmail: (dealer && dealer.email) || '',
      supportPhone: (dealer && dealer.phone) || '',
      billingEmail: (dealer && dealer.email) || '',
      shareBaseUrl: location.origin + '/app/plotmap/',
      photoBucket: 'property-photos',
      photoFolder: 'dealers/' + sanitizeSegment(dealerId) + '/properties',
      storageEnabled: false,
      subscriptionStatus: (dealer && dealer.status) || 'trial',
      planCode: 'founding',
      seatLimit: 5,
      seatCount: Number(teamCount || 1),
      updatedAt: nowIso(),
      createdAt: nowIso(),
      syncStatus: 'pending'
    };
  }

  function getDealerSettings() {
    const data = readData();
    ensureArray(data, 'dealerSettings');
    const dealer = currentDealer(data);
    const dealerId = currentDealerId(data);
    const existing = data.dealerSettings.find(item => item && item.dealerId === dealerId);
    if (existing) return existing;
    const teamCount = scopedRows(data, 'users').filter(item => item && ['owner', 'team'].includes(item.role)).length || 1;
    const created = defaultSettings(dealer, teamCount);
    data.dealerSettings.push(created);
    saveData(data);
    enqueue('dealerSettings', created.id, 'upsert', created, dealerId);
    return created;
  }

  function saveDealerSettings(changes) {
    const data = readData();
    ensureArray(data, 'dealerSettings');
    const dealer = currentDealer(data);
    const dealerId = currentDealerId(data);
    const current = getDealerSettings();
    const next = Object.assign({}, current, sanitizeMetadata(changes || {}), {
      dealerId,
      updatedAt: nowIso(),
      syncStatus: 'pending'
    });
    const idx = data.dealerSettings.findIndex(item => item && item.id === next.id);
    if (idx >= 0) data.dealerSettings[idx] = next;
    else data.dealerSettings.push(next);
    if (dealer) {
      dealer.businessName = next.brandName || dealer.businessName || dealer.name;
      dealer.email = next.supportEmail || dealer.email || '';
      dealer.phone = next.supportPhone || dealer.phone || '';
      dealer.updatedAt = nowIso();
    }
    saveData(data);
    enqueue('dealerSettings', next.id, 'upsert', next, dealerId);
    audit('dealer_settings_saved', { entityType: 'dealerSettings', entityId: next.id, fields: Object.keys(changes || {}) });
    return next;
  }

  function permissionCatalog() {
    return [
      { id: 'presentation.view', label: 'Client Presentation' },
      { id: 'properties.manage', label: 'Properties' },
      { id: 'mapstudio.manage', label: 'Map Studio' },
      { id: 'clients.view', label: 'Client Movement' },
      { id: 'deals.view', label: 'Deals' },
      { id: 'exports.manage', label: 'Backup & Export' },
      { id: 'audit.view', label: 'Audit Logs' },
      { id: 'dealerSettings.manage', label: 'Dealer Settings' },
      { id: 'team.manage', label: 'Team Management' },
      { id: 'billing.manage', label: 'Billing Readiness' }
    ];
  }

  function defaultPermissions(role) {
    return (role === 'owner' ? OWNER_SCOPES : TEAM_SCOPES).slice();
  }

  function normalizePermissions(role, list) {
    const allowed = new Set(permissionCatalog().map(item => item.id));
    const source = Array.isArray(list) && list.length ? list : defaultPermissions(role);
    return [...new Set(source.filter(item => allowed.has(item)))];
  }

  function listTeamMembers() {
    const data = readData();
    return scopedRows(data, 'users')
      .filter(item => item && ['owner', 'team'].includes(item.role))
      .map(item => Object.assign({}, item, {
        permissions: normalizePermissions(item.role, item.permissions)
      }))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }

  function saveTeamMember(input) {
    const data = readData();
    ensureArray(data, 'users');
    const dealerId = currentDealerId(data);
    const now = nowIso();
    const existing = input && input.id ? data.users.find(item => item && item.id === input.id && (!item.dealerId || item.dealerId === dealerId)) : null;
    const member = Object.assign({}, existing || {}, {
      id: existing && existing.id ? existing.id : generateId('user'),
      dealerId,
      role: input && input.role === 'owner' ? 'owner' : 'team',
      name: String((input && input.name) || '').trim() || (existing && existing.name) || 'Team Member',
      email: String((input && input.email) || '').trim(),
      phone: String((input && input.phone) || '').trim(),
      status: String((input && input.status) || (existing && existing.status) || 'active'),
      permissions: normalizePermissions(input && input.role ? input.role : (existing && existing.role) || 'team', input && input.permissions),
      lastAccessCheck: existing && existing.lastAccessCheck ? existing.lastAccessCheck : now,
      lastLogin: existing && existing.lastLogin ? existing.lastLogin : now,
      updatedAt: now,
      createdAt: existing && existing.createdAt ? existing.createdAt : now,
      syncStatus: 'pending'
    });
    const idx = data.users.findIndex(item => item && item.id === member.id);
    if (idx >= 0) data.users[idx] = member;
    else data.users.push(member);
    const settings = getDealerSettings();
    const seatCount = listTeamMembers().filter(item => item.status !== 'removed').length + (idx < 0 ? 1 : 0);
    saveData(data);
    enqueue('users', member.id, existing ? 'update' : 'create', member, dealerId);
    saveDealerSettings({ seatCount: Math.max(settings.seatCount || 0, seatCount) });
    audit(existing ? 'team_member_updated' : 'team_member_added', { entityType: 'users', entityId: member.id, role: member.role });
    return member;
  }

  function setTeamMemberStatus(id, status) {
    return saveTeamMember({ id, status });
  }

  function currentUserCan(scope) {
    const user = currentUser(readData());
    if (!user) return false;
    return normalizePermissions(user.role, user.permissions).includes(scope);
  }

  function photoFolderForProperty(propertyId) {
    const settings = getDealerSettings();
    const dealerId = currentDealerId(readData());
    return (settings.photoFolder || ('dealers/' + sanitizeSegment(dealerId) + '/properties')) + '/' + sanitizeSegment(propertyId || 'draft');
  }

  function buildPhotoObjectPath(propertyId, fileName) {
    return photoFolderForProperty(propertyId) + '/' + sanitizeSegment(fileName || 'photo') + '.jpg';
  }

  function hydratePropertyPhotos(property) {
    const item = property || {};
    const meta = Array.isArray(item.photoStorage) ? item.photoStorage : [];
    const photos = Array.isArray(item.photos) ? item.photos.slice() : [];
    meta.forEach(entry => {
      if (entry && entry.publicUrl && !photos.includes(entry.publicUrl)) photos.push(entry.publicUrl);
    });
    return photos.slice(0, 8);
  }

  function buildPresentationShareUrl(input) {
    const dealerId = currentDealerId(readData());
    const settings = getDealerSettings();
    const url = new URL(settings.shareBaseUrl || (location.origin + '/app/plotmap/'));
    if (dealerId) url.searchParams.set('dealer', dealerId);
    if (input && input.propertyId) url.searchParams.set('property', input.propertyId);
    if (input && input.view) url.searchParams.set('view', input.view);
    if (input && input.area) url.searchParams.set('area', input.area);
    return url.toString();
  }

  function createShareLink(input) {
    const data = readData();
    ensureArray(data, 'shareLinks');
    const dealerId = currentDealerId(data);
    const record = {
      id: generateId('share'),
      dealerId,
      label: String((input && input.label) || 'Client presentation').trim() || 'Client presentation',
      targetType: (input && input.targetType) || 'presentation',
      targetId: (input && input.targetId) || null,
      url: buildPresentationShareUrl(input || {}),
      status: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      syncStatus: 'pending'
    };
    data.shareLinks.push(record);
    saveData(data);
    enqueue('shareLinks', record.id, 'create', record, dealerId);
    audit('share_link_created', { entityType: 'shareLinks', entityId: record.id, targetType: record.targetType, targetId: record.targetId });
    return record;
  }

  function exportSnapshot() {
    const data = readData();
    const dealer = currentDealer(data);
    const dealerId = currentDealerId(data);
    const scoped = {
      dealer,
      exportedAt: nowIso(),
      collections: {}
    };
    EXPORT_COLLECTIONS.forEach(key => {
      if (key === 'dealerSettings') {
        scoped.collections[key] = scopedRows(data, key).slice(0, 1);
        return;
      }
      scoped.collections[key] = scopedRows(data, key);
    });
    audit('dealer_snapshot_exported', { entityType: 'dealer', entityId: dealerId, collections: Object.keys(scoped.collections) });
    return scoped;
  }

  function importSnapshot(raw) {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!payload || typeof payload !== 'object' || !payload.collections) {
      throw new Error('Invalid PlotMap backup file');
    }
    const data = readData();
    const dealerId = currentDealerId(data);
    Object.keys(payload.collections).forEach(key => {
      if (!EXPORT_COLLECTIONS.includes(key)) return;
      ensureArray(data, key);
      const incoming = Array.isArray(payload.collections[key]) ? payload.collections[key] : [];
      incoming.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const copy = Object.assign({}, item, {
          dealerId,
          updatedAt: nowIso(),
          syncStatus: 'pending'
        });
        const idx = data[key].findIndex(existing => existing && existing.id === copy.id);
        if (idx >= 0) data[key][idx] = Object.assign({}, data[key][idx], copy);
        else data[key].push(copy);
        enqueue(key, copy.id, 'upsert', copy, dealerId);
      });
    });
    saveData(data);
    audit('dealer_snapshot_imported', { entityType: 'dealer', entityId: dealerId, collections: Object.keys(payload.collections) });
    return true;
  }

  window.PMFoundation = {
    TEAM_SCOPES,
    OWNER_SCOPES,
    permissionCatalog,
    defaultPermissions,
    normalizePermissions,
    getDealerSettings,
    saveDealerSettings,
    listTeamMembers,
    saveTeamMember,
    setTeamMemberStatus,
    currentUserCan,
    photoFolderForProperty,
    buildPhotoObjectPath,
    hydratePropertyPhotos,
    buildPresentationShareUrl,
    createShareLink,
    exportSnapshot,
    importSnapshot,
    audit,
    listRecentAudit,
    copyText
  };
})();
