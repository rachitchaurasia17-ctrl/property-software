(function () {
  // Role/scope model lives in PMAccess (admin pages always load
  // access-control.js before this file); these are last-resort fallbacks.
  const FALLBACK_TEAM_SCOPES = [
    'presentation.view', 'properties.manage', 'mapstudio.manage', 'mapstudio.publish',
    'clients.view', 'deals.view', 'exports.manage', 'audit.view'
  ];
  const FALLBACK_OWNER_SCOPES = FALLBACK_TEAM_SCOPES.concat([
    'insights.view', 'dealerSettings.manage', 'team.manage', 'billing.manage'
  ]);
  // Assignable team roles (owner is implicit; 'team' is the legacy generic role)
  const TEAM_ROLES = [
    { id: 'manager', label: 'Manager' },
    { id: 'map_editor', label: 'Map Editor' },
    { id: 'property_editor', label: 'Property Editor' },
    { id: 'viewer', label: 'Viewer' },
    { id: 'team', label: 'Team (legacy, full team access)' }
  ];
  const EXPORT_COLLECTIONS = [
    'dealerSettings', 'users', 'staff', 'areas', 'clients',
    'properties', 'followups', 'siteVisits', 'deals', 'shareLinks', 'auditLogs',
    'presentationEvents', 'pins', 'mapDrawings'
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
      logoUrl: '',
      accentColor: '#1F5E47',
      supportEmail: (dealer && dealer.email) || '',
      supportPhone: (dealer && dealer.phone) || '',
      whatsappNumber: (dealer && dealer.phone) || '',
      billingEmail: (dealer && dealer.email) || '',
      defaultCity: '',
      defaultMapId: '',
      presentationTitle: '',
      presentationTagline: '',
      shareMessage: 'Here is our property map — tap to explore available plots.',
      shareBaseUrl: location.origin + '/app/plotmap/',
      photoBucket: 'property-photos',
      photoFolder: 'dealers/' + sanitizeSegment(dealerId) + '/properties',
      storageEnabled: false,
      subscriptionStatus: (dealer && dealer.status) || 'trial',
      accountStatus: 'active',
      planCode: 'founding',
      trialStart: (dealer && dealer.trialStart) || nowIso(),
      trialEnd: (dealer && dealer.trialEnd) || null,
      seatLimit: 5,
      seatCount: Number(teamCount || 1),
      maxMaps: 10,
      maxProperties: 500,
      maxTeamMembers: 5,
      updatedAt: nowIso(),
      createdAt: nowIso(),
      syncStatus: 'pending'
    };
  }

  // Billing/subscription readiness — no payment integration, just honest
  // plan state + limits so expired/limit behavior exists before payments do.
  function getPlanState() {
    const settings = getDealerSettings();
    const now = Date.now();
    const trialEnd = settings.trialEnd ? Date.parse(settings.trialEnd) : 0;
    const trialExpired = settings.subscriptionStatus === 'trial' && trialEnd && trialEnd < now;
    return {
      planCode: settings.planCode || 'founding',
      subscriptionStatus: settings.subscriptionStatus || 'trial',
      accountStatus: settings.accountStatus || 'active',
      trialStart: settings.trialStart || null,
      trialEnd: settings.trialEnd || null,
      trialExpired,
      active: (settings.accountStatus || 'active') === 'active' && !trialExpired,
      seatLimit: Number(settings.seatLimit || 5),
      maxMaps: Number(settings.maxMaps || 10),
      maxProperties: Number(settings.maxProperties || 500),
      maxTeamMembers: Number(settings.maxTeamMembers || settings.seatLimit || 5)
    };
  }

  // Soft limit check used by add-flows: returns { ok, message }.
  function checkPlanLimit(kind, currentCount) {
    const plan = getPlanState();
    const limit = kind === 'properties' ? plan.maxProperties
      : kind === 'maps' ? plan.maxMaps
      : kind === 'team' ? plan.maxTeamMembers
      : 0;
    if (!plan.active) {
      return { ok: false, message: 'This account is ' + (plan.trialExpired ? 'past its trial end' : plan.accountStatus) + '. Contact your PlotMap provider.' };
    }
    if (limit && Number(currentCount || 0) >= limit) {
      return { ok: false, message: 'Plan limit reached for ' + kind + ' (' + limit + ').' };
    }
    return { ok: true, message: '' };
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
    if (window.PMAccess && Array.isArray(window.PMAccess.SCOPE_CATALOG)) {
      return window.PMAccess.SCOPE_CATALOG.slice();
    }
    return FALLBACK_OWNER_SCOPES.map(id => ({ id, label: id }));
  }

  function defaultPermissions(role) {
    if (window.PMAccess && window.PMAccess.ROLE_SCOPES) {
      const preset = window.PMAccess.ROLE_SCOPES[role === 'dealer' ? 'owner' : role];
      if (preset) return preset.slice();
      return window.PMAccess.ROLE_SCOPES.viewer.slice();
    }
    return (role === 'owner' ? FALLBACK_OWNER_SCOPES : FALLBACK_TEAM_SCOPES).slice();
  }

  function normalizePermissions(role, list) {
    const allowed = new Set(permissionCatalog().map(item => item.id));
    const source = Array.isArray(list) && list.length ? list : defaultPermissions(role);
    return [...new Set(source.filter(item => allowed.has(item)))];
  }

  function isTeamRole(role) {
    return role === 'owner' || TEAM_ROLES.some(item => item.id === role);
  }

  function listTeamMembers() {
    const data = readData();
    return scopedRows(data, 'users')
      .filter(item => item && isTeamRole(item.role))
      .map(item => Object.assign({}, item, {
        permissions: normalizePermissions(item.role, item.permissions)
      }))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'owner' ? -1 : (b.role === 'owner' ? 1 : String(a.role).localeCompare(String(b.role)));
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }

  function saveTeamMember(input) {
    const data = readData();
    ensureArray(data, 'users');
    const dealerId = currentDealerId(data);
    const now = nowIso();
    const existing = input && input.id ? data.users.find(item => item && item.id === input.id && (!item.dealerId || item.dealerId === dealerId)) : null;
    const requestedRole = input && input.role && isTeamRole(input.role) ? input.role : null;
    const role = requestedRole || (existing && existing.role) || 'team';
    // plan limit: adding a NEW active member beyond max_team_members is blocked
    if (!existing) {
      const limits = getPlanState();
      const activeCount = listTeamMembers().filter(item => item.status === 'active').length;
      if (limits.maxTeamMembers && activeCount >= limits.maxTeamMembers) {
        throw new Error('Team member limit reached (' + limits.maxTeamMembers + '). Adjust the plan in owner settings first.');
      }
    }
    const member = Object.assign({}, existing || {}, {
      id: existing && existing.id ? existing.id : generateId('user'),
      dealerId,
      role: role === 'owner' && !(existing && existing.role === 'owner') ? 'team' : role,
      name: String((input && input.name) || '').trim() || (existing && existing.name) || 'Team Member',
      email: String((input && input.email) || '').trim() || (existing && existing.email) || '',
      phone: String((input && input.phone) || '').trim() || (existing && existing.phone) || '',
      status: String((input && input.status) || (existing && existing.status) || 'active'),
      permissions: normalizePermissions(role, input && input.permissions),
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
    audit(existing ? 'team_member_updated' : 'team_member_added', { entityType: 'users', entityId: member.id, role: member.role, permissions: member.permissions });
    return member;
  }

  function setTeamMemberStatus(id, status) {
    const member = saveTeamMember({ id, status });
    audit('team_member_status_changed', { entityType: 'users', entityId: id, status });
    return member;
  }

  function cachedAuthProfile() {
    try {
      const raw = localStorage.getItem('plotmap_supabase_profile_v1');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  // Effective permission check for the person using this browser.
  // Source of truth: the authenticated Supabase profile (role + permissions
  // column, post-migration). Local team-member records are a fallback for
  // pre-migration/local-dev only — never treat localStorage as security.
  function currentUserCan(scope) {
    if (!scope) return true;
    const profile = cachedAuthProfile();
    if (profile && profile.role) {
      if (window.PMAccess && typeof window.PMAccess.hasScope === 'function') {
        return window.PMAccess.hasScope(profile, scope);
      }
      const role = profile.role === 'dealer' ? 'owner' : profile.role;
      if (role === 'owner') return true;
      return normalizePermissions(role, profile.permissions).includes(scope);
    }
    const user = currentUser(readData());
    if (!user) return false;
    if (user.role === 'owner') return true;
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

  function shareSlug() {
    try {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      return [...bytes].map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    } catch (err) {
      return Math.random().toString(36).slice(2, 11) + Math.random().toString(36).slice(2, 5);
    }
  }

  function buildPresentationShareUrl(input) {
    const dealerId = currentDealerId(readData());
    const settings = getDealerSettings();
    const url = new URL(settings.shareBaseUrl || (location.origin + '/app/plotmap/'));
    if (dealerId) url.searchParams.set('dealer', dealerId);
    if (input && input.slug) url.searchParams.set('share', input.slug);
    if (input && input.mapId) url.searchParams.set('map', input.mapId);
    if (input && input.propertyId) url.searchParams.set('property', input.propertyId);
    if (input && input.view) url.searchParams.set('view', input.view);
    if (input && input.area) url.searchParams.set('area', input.area);
    return url.toString();
  }

  function createShareLink(input) {
    const data = readData();
    ensureArray(data, 'shareLinks');
    const dealerId = currentDealerId(data);
    const slug = shareSlug();
    const expiresAt = input && input.expiresAt ? new Date(input.expiresAt).toISOString() : null;
    const record = {
      id: generateId('share'),
      dealerId,
      slug,
      label: String((input && input.label) || 'Client presentation').trim() || 'Client presentation',
      targetType: (input && input.targetType) || 'presentation',
      targetId: (input && input.targetId) || null,
      mapId: (input && input.mapId) || null,
      url: buildPresentationShareUrl(Object.assign({}, input || {}, { slug })),
      status: 'active',
      expiresAt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      syncStatus: 'pending'
    };
    data.shareLinks.push(record);
    saveData(data);
    enqueue('shareLinks', record.id, 'create', record, dealerId);
    audit('share_link_created', { entityType: 'shareLinks', entityId: record.id, targetType: record.targetType, targetId: record.targetId, slug });
    return record;
  }

  function listShareLinks() {
    const data = readData();
    return scopedRows(data, 'shareLinks')
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function setShareLinkStatus(id, status) {
    const data = readData();
    ensureArray(data, 'shareLinks');
    const record = data.shareLinks.find(item => item && item.id === id);
    if (!record) return null;
    record.status = status === 'active' ? 'active' : 'disabled';
    record.revokedAt = record.status === 'disabled' ? nowIso() : null;
    record.updatedAt = nowIso();
    record.syncStatus = 'pending';
    saveData(data);
    enqueue('shareLinks', record.id, 'update', record, record.dealerId);
    audit(record.status === 'active' ? 'share_link_enabled' : 'share_link_disabled', { entityType: 'shareLinks', entityId: record.id, slug: record.slug || null });
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

  // Validate a backup payload WITHOUT applying it. Returns a dry-run summary
  // the UI must show before calling importSnapshot — no silent overwrites.
  function validateSnapshot(raw) {
    let payload;
    try {
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      return { ok: false, errors: ['File is not valid JSON.'], summary: [] };
    }
    if (!payload || typeof payload !== 'object' || !payload.collections || typeof payload.collections !== 'object') {
      return { ok: false, errors: ['Not a PlotMap backup file (missing collections).'], summary: [] };
    }
    const data = readData();
    const errors = [];
    const summary = [];
    Object.keys(payload.collections).forEach(key => {
      if (!EXPORT_COLLECTIONS.includes(key)) {
        errors.push('Unknown collection "' + key + '" will be skipped.');
        return;
      }
      const incoming = payload.collections[key];
      if (!Array.isArray(incoming)) {
        errors.push('Collection "' + key + '" is not a list and will be skipped.');
        return;
      }
      const existingIds = new Set((Array.isArray(data[key]) ? data[key] : []).map(item => item && item.id));
      let overwrites = 0;
      let fresh = 0;
      let invalid = 0;
      incoming.forEach(item => {
        if (!item || typeof item !== 'object' || !item.id) { invalid += 1; return; }
        if (existingIds.has(item.id)) overwrites += 1;
        else fresh += 1;
      });
      summary.push({ collection: key, incoming: incoming.length, adds: fresh, overwrites, invalid });
    });
    const hasRows = summary.some(row => row.adds + row.overwrites > 0);
    if (!hasRows) errors.push('Backup contains no importable rows.');
    return { ok: hasRows, payload, errors, summary };
  }

  function importSnapshot(raw, options) {
    const check = validateSnapshot(raw);
    if (!check.ok) {
      throw new Error('Invalid PlotMap backup file: ' + (check.errors[0] || 'no importable rows'));
    }
    if (options && options.dryRun) return check;
    const payload = check.payload;
    const data = readData();
    const dealerId = currentDealerId(data);
    Object.keys(payload.collections).forEach(key => {
      if (!EXPORT_COLLECTIONS.includes(key)) return;
      ensureArray(data, key);
      const incoming = Array.isArray(payload.collections[key]) ? payload.collections[key] : [];
      incoming.forEach(item => {
        if (!item || typeof item !== 'object' || !item.id) return;
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
    return check;
  }

  window.PMFoundation = {
    TEAM_ROLES,
    permissionCatalog,
    defaultPermissions,
    normalizePermissions,
    getDealerSettings,
    saveDealerSettings,
    getPlanState,
    checkPlanLimit,
    listTeamMembers,
    saveTeamMember,
    setTeamMemberStatus,
    currentUserCan,
    photoFolderForProperty,
    buildPhotoObjectPath,
    hydratePropertyPhotos,
    buildPresentationShareUrl,
    createShareLink,
    listShareLinks,
    setShareLinkStatus,
    exportSnapshot,
    validateSnapshot,
    importSnapshot,
    audit,
    listRecentAudit,
    copyText
  };
})();
