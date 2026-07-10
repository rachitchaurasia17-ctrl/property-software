(function() {
  const SUPABASE_URL = (window.env && window.env.VITE_SUPABASE_URL) || 'https://czmkfmkmgqlienmdihul.supabase.co';
  const SUPABASE_KEY = (window.env && window.env.VITE_SUPABASE_ANON_KEY) || 'sb_publishable_DGqcs0JaDVgzImUGGgg_FQ_Q_SkgnhX';
  const SESSION_KEY = 'plotmap_supabase_session_v1';
  const PROFILE_KEY = 'plotmap_supabase_profile_v1';
  const REFRESH_SKEW_MS = 60000;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('PlotMap Auth [Dev Warning]: Supabase URL or Anon Key is missing. Check your environment configuration (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).');
  }

  function isLocalDev() {
    const host = String(location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  }

  function isAdminRoute() {
    return /^\/admin\//i.test(location.pathname || '');
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function clearJson(key) {
    try { localStorage.removeItem(key); } catch (err) {}
  }

  function clearLegacyRoleState() {
    try { localStorage.removeItem('plotmap_admin_role'); } catch (err) {}
    try { localStorage.removeItem('plotmap_user_id'); } catch (err) {}
    try { localStorage.removeItem('plotmap_dealer_id'); } catch (err) {}
  }

  function normalizeRole(role) {
    if (role === 'dealer') return 'owner';
    if (role === 'staff') return 'team';
    return role || 'viewer';
  }

  const TEAM_RANK_ROLES = ['team', 'manager', 'map_editor', 'property_editor'];

  function adminRoleFromProfile(profile) {
    const role = normalizeRole(profile && profile.role);
    if (role === 'owner') return 'dealer';
    if (TEAM_RANK_ROLES.includes(role)) return 'team';
    return 'viewer';
  }

  function routeForRole(role) {
    const normalized = normalizeRole(role);
    if (normalized === 'owner') return '/admin/owner.html';
    if (TEAM_RANK_ROLES.includes(normalized)) return '/admin/team.html';
    // viewer profiles land on the client presentation, not the admin shell
    return '/app/plotmap/';
  }

  function readSession() {
    return readJson(SESSION_KEY);
  }

  function writeSession(session) {
    return writeJson(SESSION_KEY, session);
  }

  function clearSession() {
    clearJson(SESSION_KEY);
    clearJson(PROFILE_KEY);
    clearLegacyRoleState();
  }

  function sessionHeaders(token) {
    return {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    };
  }

  async function authFetch(path, options = {}) {
    const headers = Object.assign({ apikey: SUPABASE_KEY }, options.headers || {});
    const fetchOptions = Object.assign({}, options, { headers });
    const res = await fetch(SUPABASE_URL + path, fetchOptions);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(body || ('Supabase auth ' + res.status));
    }
    return res;
  }

  async function signIn(email, password) {
    const res = await authFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
      user: data.user || null
    };
    writeSession(session);
    return session;
  }

  async function refreshSession(refreshToken) {
    const res = await authFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await res.json();
    const current = readSession() || {};
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
      user: data.user || current.user || null
    };
    writeSession(session);
    return session;
  }

  async function getSession() {
    const session = readSession();
    if (!session || !session.access_token) return null;
    const expiresAtMs = Number(session.expires_at || 0) * 1000;
    if (expiresAtMs && expiresAtMs - Date.now() > REFRESH_SKEW_MS) return session;
    if (!session.refresh_token) return session;
    try {
      return await refreshSession(session.refresh_token);
    } catch (err) {
      clearSession();
      return null;
    }
  }

  async function getUser(session) {
    const active = session || await getSession();
    if (!active || !active.access_token) return null;
    try {
      const res = await authFetch('/auth/v1/user', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + active.access_token }
      });
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async function fetchProfile(session) {
    const active = session || await getSession();
    if (!active || !active.access_token) return null;
    const user = active.user || await getUser(active);
    if (!user || !user.id) return null;
    // permissions/display_name exist only after the SaaS foundation migration;
    // fall back to the base column set so login keeps working pre-migration.
    const baseSelect = 'id,email,role,dealer_id,status';
    const fullSelect = baseSelect + ',permissions,display_name';
    const fetchWith = (select) => fetch(
      SUPABASE_URL + '/rest/v1/profiles?select=' + select + '&id=eq.' + encodeURIComponent(user.id) + '&limit=1',
      { method: 'GET', headers: sessionHeaders(active.access_token) }
    );
    let res = await fetchWith(fullSelect);
    if (!res.ok) res = await fetchWith(baseSelect);
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    const profile = rows && rows[0] ? rows[0] : null;
    if (profile) {
      writeJson(PROFILE_KEY, profile);
      localStorage.setItem('plotmap_user_id', profile.id);
      localStorage.setItem('plotmap_dealer_id', profile.dealer_id || '');
      localStorage.setItem('plotmap_admin_role', adminRoleFromProfile(profile));
    }
    return profile;
  }

  async function getCurrentProfile() {
    const session = await getSession();
    if (!session) return null;
    const cached = readJson(PROFILE_KEY);
    if (cached && cached.id === (session.user && session.user.id) && cached.status) {
      localStorage.setItem('plotmap_user_id', cached.id);
      localStorage.setItem('plotmap_dealer_id', cached.dealer_id || '');
      localStorage.setItem('plotmap_admin_role', adminRoleFromProfile(cached));
      return cached;
    }
    return fetchProfile(session);
  }

  async function signOut() {
    const session = await getSession();
    try {
      if (session && session.access_token) {
        await fetch(SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: sessionHeaders(session.access_token)
        });
      }
    } catch (err) {}
    clearSession();
  }

  function roleRank(role) {
    return ({
      viewer: 1, team: 2, manager: 2, map_editor: 2, property_editor: 2, owner: 3
    })[normalizeRole(role)] || 0;
  }

  async function requireProfile(requiredRole) {
    const profile = await getCurrentProfile();
    if (!profile) return { ok: false, reason: 'missing_session' };
    if ((profile.status || 'active') !== 'active') return { ok: false, reason: 'inactive_profile', profile };
    if (requiredRole && roleRank(profile.role) < roleRank(requiredRole)) {
      return { ok: false, reason: 'role_not_allowed', profile };
    }
    return { ok: true, profile };
  }

  function buildLoginRedirect(nextUrl, reason) {
    const next = nextUrl || (location.pathname + location.search + location.hash);
    const params = new URLSearchParams();
    if (next) params.set('next', next);
    if (reason) params.set('reason', reason);
    return '/' + (params.toString() ? '?' + params.toString() : '');
  }

  function applyLegacyRole(profile) {
    if (!profile) return;
    localStorage.setItem('plotmap_user_id', profile.id);
    localStorage.setItem('plotmap_dealer_id', profile.dealer_id || '');
    localStorage.setItem('plotmap_admin_role', adminRoleFromProfile(profile));
  }

  const cachedProfile = readJson(PROFILE_KEY);
  if (cachedProfile && cachedProfile.id) {
    applyLegacyRole(cachedProfile);
  }

  // Auto-mock session for local development so login is not required
  if (isLocalDev()) {
    if (!readSession()) {
      writeSession({ access_token: 'mock_local_token', refresh_token: 'mock_local_refresh', expires_at: Math.floor(Date.now() / 1000) + 360000, user: { id: 'user-owner-demo' } });
    }
    if (!readJson(PROFILE_KEY)) {
      writeJson(PROFILE_KEY, { id: 'user-owner-demo', email: 'local@demo.com', role: 'owner', dealer_id: 'dealer-demo', status: 'active' });
    }
    const prof = readJson(PROFILE_KEY);
    if (prof) applyLegacyRole(prof);
  }

  window.PMAuth = {
    SUPABASE_URL,
    SUPABASE_KEY,
    isLocalDev,
    isAdminRoute,
    normalizeRole,
    routeForRole,
    readSession,
    getSession,
    getUser,
    getCurrentProfile,
    getAccessToken: async () => {
      const session = await getSession();
      return session && session.access_token ? session.access_token : null;
    },
    signIn,
    signOut,
    clearSession,
    fetchProfile,
    requireProfile,
    buildLoginRedirect,
    applyLegacyRole,
    clearLegacyRoleState
  };
})();
