// Access, role, permission-scope, trial, and offline grace helpers.
// This file is the single source of truth for the PlotMap role model:
// every admin page loads it, and PMFoundation/PMNav read the presets
// from here. Real security is Supabase RLS; this layer keeps the UI
// honest (blocked pages, hidden nav, guarded actions).
(function() {
  const OFFLINE_GRACE_HOURS = 24;
  const OWNER_ROUTES = [
    '/admin/owner.html',
    '/admin/area-intelligence.html',
    '/admin/property-insights.html'
  ];
  const TEAM_ROUTES = [
    '/admin/team.html',
    '/admin/clients.html',
    '/admin/properties.html',
    '/admin/deals.html',
    '/admin/map-studio.html'
  ];

  // Permission scopes. profiles.permissions (Supabase, post-migration) or the
  // local team-member record hold an array of these; empty array = role preset.
  const SCOPE_CATALOG = [
    { id: 'presentation.view', label: 'Client Presentation' },
    { id: 'properties.manage', label: 'Properties (add / edit / archive)' },
    { id: 'mapstudio.manage', label: 'Map Studio (draw / edit)' },
    { id: 'mapstudio.publish', label: 'Publish maps to clients' },
    { id: 'clients.view', label: 'Client Details' },
    { id: 'deals.view', label: 'Deals' },
    { id: 'insights.view', label: 'Area Intelligence & Property Insights' },
    { id: 'exports.manage', label: 'Backup & Export' },
    { id: 'audit.view', label: 'Audit Logs' },
    { id: 'dealerSettings.manage', label: 'Dealer Settings' },
    { id: 'team.manage', label: 'Team Management' },
    { id: 'billing.manage', label: 'Billing Readiness' }
  ];
  const ALL_SCOPES = SCOPE_CATALOG.map(s => s.id);
  const ROLE_SCOPES = {
    owner: ALL_SCOPES.slice(),
    manager: ['presentation.view', 'properties.manage', 'mapstudio.manage', 'mapstudio.publish',
      'clients.view', 'deals.view', 'insights.view', 'exports.manage', 'audit.view', 'team.manage'],
    // legacy generic role — matches pre-role-model team behavior
    team: ['presentation.view', 'properties.manage', 'mapstudio.manage', 'mapstudio.publish',
      'clients.view', 'deals.view', 'exports.manage', 'audit.view'],
    map_editor: ['presentation.view', 'mapstudio.manage', 'mapstudio.publish'],
    property_editor: ['presentation.view', 'properties.manage'],
    viewer: ['presentation.view']
  };

  // Route → scope needed to open it. owner.html stays owner-only.
  const ROUTE_SCOPES = {
    '/admin/map-studio.html': 'mapstudio.manage',
    '/admin/properties.html': 'properties.manage',
    '/admin/clients.html': 'clients.view',
    '/admin/deals.html': 'deals.view',
    '/admin/area-intelligence.html': 'insights.view',
    '/admin/property-insights.html': 'insights.view'
  };

  let pageGuardPromise = null;

  function normalizeRole(role) {
    if (role === 'dealer') return 'owner';
    if (role === 'staff') return 'team';
    return role || 'viewer';
  }

  function roleRank(role) {
    return ({
      viewer: 1, team: 2, manager: 2, map_editor: 2, property_editor: 2, owner: 3
    })[normalizeRole(role)] || 0;
  }

  // Effective scopes for a Supabase profile or a local team-member record.
  // Owner always has everything; explicit permissions arrays win over presets.
  function resolveScopes(subject) {
    const role = normalizeRole(subject && subject.role);
    if (role === 'owner') return ALL_SCOPES.slice();
    const explicit = subject && Array.isArray(subject.permissions) ? subject.permissions : null;
    const allowed = new Set(ALL_SCOPES);
    if (explicit && explicit.length) {
      return [...new Set(explicit.filter(s => allowed.has(s)))];
    }
    return (ROLE_SCOPES[role] || ROLE_SCOPES.viewer).slice();
  }

  function hasScope(subject, scope) {
    if (!scope) return true;
    return resolveScopes(subject).includes(scope);
  }

  function scopeForRoute(route) {
    const cleanRoute = String(route || location.pathname).toLowerCase();
    const key = Object.keys(ROUTE_SCOPES).find(path => cleanRoute.endsWith(path));
    return key ? ROUTE_SCOPES[key] : null;
  }

  function getRouteRequirement(route) {
    const cleanRoute = String(route || location.pathname).toLowerCase();
    if (OWNER_ROUTES.some(path => cleanRoute.endsWith(path))) return 'owner';
    if (TEAM_ROUTES.some(path => cleanRoute.endsWith(path))) return 'team';
    return 'viewer';
  }

  function parseTime(value) {
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function isDealerAllowed(dealer, now) {
    if (!dealer) return { ok: false, reason: 'missing_dealer' };
    if (dealer.status === 'suspended' || dealer.status === 'expired') return { ok: false, reason: dealer.status };
    if (dealer.status === 'trial' && parseTime(dealer.trialEnd) && parseTime(dealer.trialEnd) < now) {
      return { ok: false, reason: 'trial_expired' };
    }
    return { ok: true, reason: 'ok' };
  }

  function hasRecentAccessCheck(user, now, graceHours) {
    const last = parseTime(user && user.lastAccessCheck);
    return !!last && now - last <= (graceHours || OFFLINE_GRACE_HOURS) * 3600000;
  }

  function isUserAllowed(user, now, graceHours) {
    if (!user) return { ok: false, reason: 'missing_user' };
    if (['blocked', 'disabled', 'expired', 'removed'].includes(user.status)) return { ok: false, reason: user.status };
    if (!navigator.onLine && !hasRecentAccessCheck(user, now, graceHours)) {
      return { ok: false, reason: 'offline_access_check_expired' };
    }
    return { ok: true, reason: 'ok' };
  }

  function canAccessRoute(input) {
    const now = Date.now();
    const data = input && input.data ? input.data : (window.PMDataAdapter && window.PMDataAdapter.getData());
    const dealer = (input && input.dealer) || (window.PMDataAdapter && window.PMDataAdapter.getCurrentDealer(data));
    const user = (input && input.user) || (window.PMDataAdapter && window.PMDataAdapter.getCurrentUser(data));
    const roleRequired = normalizeRole((input && input.roleRequired) || getRouteRequirement(input && input.route));
    const graceHours = Number((data && data.syncMeta && data.syncMeta.offlineGraceHours) || OFFLINE_GRACE_HOURS);
    const dealerCheck = isDealerAllowed(dealer, now);
    if (!dealerCheck.ok) return { ok: false, reason: dealerCheck.reason, dealer, user, roleRequired };
    const userCheck = isUserAllowed(user, now, graceHours);
    if (!userCheck.ok) return { ok: false, reason: userCheck.reason, dealer, user, roleRequired };
    if (roleRank(user.role) < roleRank(roleRequired)) {
      return { ok: false, reason: 'role_not_allowed', dealer, user, roleRequired };
    }
    return { ok: true, reason: 'ok', dealer, user, roleRequired };
  }

  function renderBlockedScreen() {
    if (!/\/admin\/access-expired\.html$/i.test(location.pathname)) {
      window.location.replace('/admin/access-expired.html');
      return;
    }
    document.body.innerHTML = '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif;background:#f7f5ef;color:#1f2933;"><section style="max-width:520px;background:#fff;border:1px solid #e6dcc8;border-radius:12px;padding:28px;text-align:center;"><h1 style="font-size:24px;margin:0 0 10px;">Access expired or blocked</h1><p style="font-size:15px;line-height:1.5;margin:0;color:#5f6b7a;">Please contact your PlotMap provider.</p></section></main>';
  }

  function recordAccessCheck(userId) {
    if (!window.PMDataAdapter) return null;
    const data = window.PMDataAdapter.getData();
    const user = data.users.find(item => item.id === userId) || window.PMDataAdapter.getCurrentUser(data);
    if (!user) return null;
    user.lastAccessCheck = new Date().toISOString();
    user.lastLogin = user.lastAccessCheck;
    user.updatedAt = user.lastAccessCheck;
    window.PMDataAdapter.saveData(data);
    return user;
  }

  // Where to send a signed-in user who is not allowed on this page.
  // Never signs them out — being blocked from one page is not a broken session.
  function deniedHomeFor(profile) {
    const role = normalizeRole(profile && profile.role);
    if (role === 'owner') return '/admin/owner.html';
    if (roleRank(role) >= 2) return '/admin/team.html';
    return '/app/plotmap/';
  }

  function redirectDenied(profile, reason) {
    const home = deniedHomeFor(profile);
    const here = String(location.pathname || '').toLowerCase();
    if (here.endsWith(home.toLowerCase())) {
      // already on the safest page we could send them to — show it
      document.documentElement.style.visibility = '';
      return;
    }
    const target = home.indexOf('/admin/') === 0 ? home + '?denied=' + encodeURIComponent(reason || 'page') : home;
    window.location.replace(target);
  }

  // Audit the first guarded page load of a browser session as a login.
  function auditLoginOnce(profile) {
    try {
      if (sessionStorage.getItem('plotmap_login_audited')) return;
      sessionStorage.setItem('plotmap_login_audited', '1');
      if (window.PMFoundation && typeof window.PMFoundation.audit === 'function') {
        window.PMFoundation.audit('login', {
          entityType: 'profiles',
          entityId: (profile && profile.id) || null,
          role: normalizeRole(profile && profile.role)
        });
      }
    } catch (err) {}
  }

  function guardPage(options) {
    if (!/^\/admin\//i.test(location.pathname || '')) {
      return canAccessRoute(options || {});
    }
    if (pageGuardPromise) return pageGuardPromise;
    const routeOptions = options || {};
    const root = document.documentElement;
    root.style.visibility = 'hidden';
    pageGuardPromise = (async () => {
      const roleRequired = normalizeRole(routeOptions.roleRequired || getRouteRequirement(routeOptions.route));
      if (!window.PMAuth) {
        renderBlockedScreen();
        return { ok: false, reason: 'missing_auth_runtime', roleRequired };
      }
      // Session + active-profile check first (no role yet — role/scope denials
      // must NOT sign the user out, only redirect them to a page they can use).
      const authResult = await window.PMAuth.requireProfile(null);
      if (!authResult.ok) {
        await window.PMAuth.signOut().catch(() => {});
        if (/\/admin\/access-expired\.html$/i.test(location.pathname)) {
          renderBlockedScreen();
          return authResult;
        }
        window.location.replace(window.PMAuth.buildLoginRedirect(location.pathname + location.search + location.hash, authResult.reason));
        return authResult;
      }
      const profile = authResult.profile;
      // 1) owner-only pages stay owner-only
      const routeIsOwnerOnly = /\/admin\/owner\.html$/i.test(routeOptions.route || location.pathname);
      if (routeIsOwnerOnly && normalizeRole(profile.role) !== 'owner') {
        redirectDenied(profile, 'owner_only');
        return { ok: false, reason: 'role_not_allowed', profile };
      }
      // 2) minimum rank for the admin shell (viewers use the client presentation)
      if (roleRank(profile.role) < 2) {
        redirectDenied(profile, 'viewer');
        return { ok: false, reason: 'role_not_allowed', profile };
      }
      // 3) per-page permission scope (owner passes everything).
      //    Insights pages accept owner OR a granted insights.view scope, so the
      //    legacy roleRequired:'owner' hint is only enforced for owner.html.
      const requiredScope = scopeForRoute(routeOptions.route);
      if (requiredScope && !hasScope(profile, requiredScope)) {
        redirectDenied(profile, requiredScope);
        return { ok: false, reason: 'scope_not_allowed', profile, requiredScope };
      }
      window.PMAuth.applyLegacyRole(authResult.profile);
      auditLoginOnce(profile);
      const data = window.PMDataAdapter ? window.PMDataAdapter.getData() : null;
      // The Supabase profile already passed the role/scope gates above; the
      // local check below only validates dealer trial/status + offline grace,
      // so require plain staff rank here (legacy roleRequired hints like
      // 'owner' on insights pages would wrongly block scope-granted teams).
      const result = canAccessRoute(Object.assign({}, routeOptions, {
        data,
        roleRequired: routeIsOwnerOnly ? 'owner' : 'team',
        dealer: data && window.PMDataAdapter ? window.PMDataAdapter.getCurrentDealer(data) : null,
        user: data && window.PMDataAdapter ? window.PMDataAdapter.getCurrentUser(data) : null
      }));
      if (!result.ok) {
        renderBlockedScreen();
        return result;
      }
      if (navigator.onLine && result.user) recordAccessCheck(result.user.id);
      root.style.visibility = '';
      return result;
    })();
    return pageGuardPromise;
  }

  function createAccessLink(input) {
    if (!window.PMDataAdapter) return null;
    const data = window.PMDataAdapter.getData();
    const dealer = window.PMDataAdapter.getCurrentDealer(data);
    const user = window.PMDataAdapter.getCurrentUser(data);
    const link = window.PMDataAdapter.upsert('accessLinks', Object.assign({
      dealerId: dealer && dealer.id,
      createdBy: user && user.id,
      token: window.PMDataAdapter.generateId('trial'),
      label: 'Trial Link',
      roleAllowed: 'viewer',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      maxUses: 1,
      useCount: 0,
      status: 'active'
    }, input || {}));
    if (window.PMSyncQueue) {
      window.PMSyncQueue.enqueueSyncAction({
        dealerId: link.dealerId,
        entityType: 'accessLinks',
        entityId: link.id,
        actionType: 'create',
        payload: link
      });
    }
    return link;
  }

  function findAccessLink(data, token) {
    return (data.accessLinks || []).find(item => item && item.token === token) || null;
  }

  function linkStatus(link, now) {
    if (!link) return { ok: false, reason: 'missing_link' };
    if (link.status !== 'active') return { ok: false, reason: link.status || 'inactive_link' };
    if (parseTime(link.expiresAt) && parseTime(link.expiresAt) < now) return { ok: false, reason: 'link_expired' };
    if (Number(link.maxUses || 0) > 0 && Number(link.useCount || 0) >= Number(link.maxUses || 0)) {
      return { ok: false, reason: 'link_used_up' };
    }
    return { ok: true, reason: 'ok' };
  }

  function ensureLinkUser(data, link) {
    const role = normalizeRole(link.roleAllowed);
    const dealerId = link.dealerId || (data.dealers[0] && data.dealers[0].id) || null;
    const existing = (data.users || []).find(user => user.dealerId === dealerId && normalizeRole(user.role) === role && user.status === 'active');
    if (existing) return existing;
    const ts = new Date().toISOString();
    const user = {
      id: window.PMDataAdapter.generateId('user'),
      dealerId,
      name: role === 'owner' ? 'Trial Owner' : role === 'team' ? 'Trial Team User' : 'Trial Viewer',
      phone: '',
      email: '',
      role,
      status: 'active',
      lastAccessCheck: ts,
      lastLogin: ts,
      createdAt: ts,
      updatedAt: ts
    };
    data.users.push(user);
    return user;
  }

  function adminRoleFromUserRole(role) {
    const normalized = normalizeRole(role);
    if (normalized === 'owner') return 'dealer';
    if (normalized === 'team') return 'team';
    return 'viewer';
  }

  function redirectForRole(role) {
    const normalized = normalizeRole(role);
    if (normalized === 'owner') return '/admin/owner.html';
    if (normalized === 'team') return '/admin/team.html';
    return '/app/plotmap/';
  }

  function consumeAccessLinkFromUrl(options) {
    if (!window.PMAuth || !window.PMAuth.isLocalDev()) {
      return null;
    }
    if (!window.PMDataAdapter) return null;
    const params = new URLSearchParams(location.search || '');
    const token = params.get('access') || params.get('token');
    if (!token) return null;
    const data = window.PMDataAdapter.getData();
    const link = findAccessLink(data, token);
    const status = linkStatus(link, Date.now());
    if (!status.ok) {
      if (link && status.reason === 'link_expired') {
        link.status = 'expired';
        link.updatedAt = new Date().toISOString();
        window.PMDataAdapter.saveData(data);
        if (window.PMSyncQueue) {
          window.PMSyncQueue.enqueueSyncAction({
            dealerId: link.dealerId,
            entityType: 'accessLinks',
            entityId: link.id,
            actionType: 'expire',
            payload: { status: 'expired' }
          });
        }
      }
      return { ok: false, reason: status.reason, link };
    }
    const user = ensureLinkUser(data, link);
    const dealer = (data.dealers || []).find(item => item.id === user.dealerId || item.id === link.dealerId) || data.dealers[0] || null;
    const ts = new Date().toISOString();
    link.useCount = Number(link.useCount || 0) + 1;
    link.lastUsedAt = ts;
    link.updatedAt = ts;
    user.lastAccessCheck = ts;
    user.lastLogin = ts;
    user.updatedAt = ts;
    window.PMDataAdapter.saveData(data);
    if (window.PMSyncQueue) {
      window.PMSyncQueue.enqueueSyncAction({
        dealerId: link.dealerId,
        entityType: 'accessLinks',
        entityId: link.id,
        actionType: 'use',
        payload: { useCount: link.useCount, lastUsedAt: link.lastUsedAt }
      });
    }
    if (dealer) localStorage.setItem('plotmap_dealer_id', dealer.id);
    localStorage.setItem('plotmap_user_id', user.id);
    localStorage.setItem('plotmap_admin_role', adminRoleFromUserRole(user.role));
    const result = { ok: true, reason: 'ok', link, user, dealer, redirectTo: redirectForRole(user.role) };
    if (options && options.redirect) window.location.replace(result.redirectTo);
    return result;
  }

  window.PMAccess = {
    OFFLINE_GRACE_HOURS,
    SCOPE_CATALOG,
    ROLE_SCOPES,
    resolveScopes,
    hasScope,
    scopeForRoute,
    getRouteRequirement,
    canAccessRoute,
    guardPage,
    recordAccessCheck,
    createAccessLink,
    consumeAccessLinkFromUrl,
    hasRecentAccessCheck
  };
})();
