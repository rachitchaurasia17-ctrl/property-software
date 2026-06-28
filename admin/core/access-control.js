// Access, role, trial, and offline grace helpers.
(function() {
  const OFFLINE_GRACE_HOURS = 24;
  const OWNER_ROUTES = [
    '/admin/owner.html',
    '/admin/area-intelligence.html',
    '/admin/finance.html',
    '/admin/reports.html'
  ];
  const TEAM_ROUTES = [
    '/admin/team.html',
    '/admin/clients.html',
    '/admin/properties.html',
    '/admin/followups.html',
    '/admin/site-visits.html',
    '/admin/deals.html',
    '/admin/map-studio.html'
  ];

  function normalizeRole(role) {
    if (role === 'dealer') return 'owner';
    if (role === 'staff') return 'team';
    return role || 'viewer';
  }

  function roleRank(role) {
    return ({ viewer: 1, team: 2, owner: 3 })[normalizeRole(role)] || 0;
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
    if (['blocked', 'expired', 'removed'].includes(user.status)) return { ok: false, reason: user.status };
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

  function guardPage(options) {
    const result = canAccessRoute(options || {});
    if (!result.ok) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderBlockedScreen);
      } else {
        renderBlockedScreen();
      }
      return result;
    }
    if (navigator.onLine && result.user) recordAccessCheck(result.user.id);
    return result;
  }

  function createAccessLink(input) {
    if (!window.PMDataAdapter) return null;
    const data = window.PMDataAdapter.getData();
    const dealer = window.PMDataAdapter.getCurrentDealer(data);
    const user = window.PMDataAdapter.getCurrentUser(data);
    return window.PMDataAdapter.upsert('accessLinks', Object.assign({
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
  }

  window.PMAccess = {
    OFFLINE_GRACE_HOURS,
    getRouteRequirement,
    canAccessRoute,
    guardPage,
    recordAccessCheck,
    createAccessLink,
    hasRecentAccessCheck
  };
})();
