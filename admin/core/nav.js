// PlotMap admin navigation — the ONLY place dashboard nav is defined.
// Every admin page renders its topbar through PMNav.render(). Do not add
// per-page <nav> blocks; retired sections (Finance, Reports, Access) must
// never reappear here.
(function () {
  // Dealer Login = the owner's business-intelligence command center.
  // ONLY intelligence surfaces belong here. Work tools (Map Studio,
  // Properties, Deals) intentionally live in Team Workspace, not here, so
  // owner intelligence and daily staff work stay separated (Phase 1.5).
  // Client Presentation is an allowed convenience link. Order matters.
  const DEALER_NAV = [
    { key: 'dashboard', label: 'Dashboard', href: '/admin/owner.html' },
    { key: 'area-intelligence', label: 'Area Intelligence', href: '/admin/area-intelligence.html' },
    { key: 'client-details', label: 'Client Details', href: '/admin/clients.html' },
    { key: 'property-insights', label: 'Property Insights', href: '/admin/property-insights.html' }
  ];

  // Team Workspace = the staff work table. ONLY daily-work surfaces:
  // Workspace, Properties, Map Studio. Owner-intelligence surfaces
  // (Area Intelligence, Client Details, Property Insights, Deals) are
  // deliberately absent (Phase 1.5). Items are still filtered by permission
  // scope (PMAccess.resolveScopes on the cached Supabase profile) and every
  // page is guarded by PMAccess.guardPage — hiding nav is UX, not security.
  const TEAM_NAV = [
    { key: 'workspace', label: 'Workspace', href: '/admin/team.html' },
    { key: 'properties', label: 'Properties', href: '/admin/properties.html', scope: 'properties.manage' },
    { key: 'map-studio', label: 'Map Studio', href: '/admin/map-studio.html', scope: 'mapstudio.manage' }
  ];

  function cachedProfile() {
    try {
      const raw = localStorage.getItem('plotmap_supabase_profile_v1');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function teamNavItems() {
    const profile = cachedProfile();
    if (!profile || !window.PMAccess || typeof window.PMAccess.resolveScopes !== 'function') {
      // no profile context yet — show the classic subset without opt-in pages
      return TEAM_NAV.filter(item => !item.optIn);
    }
    const scopes = new Set(window.PMAccess.resolveScopes(profile));
    return TEAM_NAV.filter(item => !item.scope || scopes.has(item.scope));
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function currentRole() {
    // Display-only. Real access control is PMAccess.guardPage + Supabase RLS.
    const role = localStorage.getItem('plotmap_admin_role');
    return role === 'team' ? 'team' : 'dealer';
  }

  function navFor(role) {
    return role === 'team' ? teamNavItems() : DEALER_NAV;
  }

  // Trial-analytics: one usage event per admin pageview (owner.html calls
  // render twice — banner refresh — so dedupe with a module flag).
  let pageOpenTracked = false;
  function trackPageOpenOnce(active) {
    if (pageOpenTracked) return;
    pageOpenTracked = true;
    try {
      if (window.PMEventTracker && typeof window.PMEventTracker.trackAdminPageOpen === 'function') {
        window.PMEventTracker.trackAdminPageOpen(active);
      }
    } catch (err) {}
  }

  // render(active, navRole?)
  // `navRole` lets a page force which nav SET renders ('team' | 'dealer'),
  // independent of the signed-in role. The Team Workspace forces the team nav
  // so an owner using the workspace sees Workspace/Properties/Map Studio — not
  // the dealer intelligence bar. The brand + role chip still reflect the real
  // role, so an owner can click the logo to return to their dashboard.
  function render(active, navRole) {
    trackPageOpenOnce(active);
    const host = document.getElementById('pm-topbar');
    if (!host) return;
    const role = currentRole();
    const barRole = navRole === 'team' || navRole === 'dealer' ? navRole : role;
    const items = navFor(barRole);
    host.classList.add('pm-topbar', barRole === 'team' ? 'team-bar' : 'dealer-bar');
    host.innerHTML =
      '<a class="brand" href="' + (role === 'team' ? '/admin/team.html' : '/admin/owner.html') + '">' +
        '<div class="brand-icon"><i></i></div>' +
        '<span class="brand-name">PlotMap</span>' +
      '</a>' +
      '<nav>' +
        items.map(item =>
          '<a href="' + item.href + '"' + (item.key === active ? ' class="on"' : '') + '>' + item.label + '</a>'
        ).join('') +
      '</nav>' +
      '<div class="sp"></div>' +
      '<div class="role-chip">' +
        '<div class="role-info">' +
          '<div class="role-name" id="pm-nav-name">' + (role === 'team' ? 'Team' : 'Owner') + '</div>' +
          '<div class="role-kind">' + (role === 'team' ? 'Team' : 'Owner') + '</div>' +
        '</div>' +
        '<div class="role-avatar" style="background:var(' + (role === 'team' ? '--pm-blue' : '--pm-emerald') + ');" id="pm-nav-initial">' + (role === 'team' ? 'T' : 'O') + '</div>' +
      '</div>' +
      '<button type="button" id="pm-nav-signout" style="border:none;background:transparent;font-size:13px;font-weight:700;color:var(--pm-text-mut);cursor:pointer;padding:6px 4px;">Sign out</button>';

    const signout = document.getElementById('pm-nav-signout');
    if (signout) {
      signout.addEventListener('click', async () => {
        if (window.PMAuth) await window.PMAuth.signOut().catch(() => {});
        window.location.replace('/');
      });
    }

    // Fill real name from the authenticated profile (async, non-blocking).
    if (window.PMAuth) {
      window.PMAuth.getCurrentProfile().then(profile => {
        if (!profile) return;
        const name = (profile.email || '').split('@')[0] || (role === 'team' ? 'Team' : 'Owner');
        const nameEl = document.getElementById('pm-nav-name');
        const initEl = document.getElementById('pm-nav-initial');
        if (nameEl) nameEl.textContent = esc(name.charAt(0).toUpperCase() + name.slice(1));
        if (initEl) initEl.textContent = esc(name.charAt(0).toUpperCase());
      }).catch(() => {});
    }

    renderAccountBanner();
  }

  // Non-blocking account banner on admin pages. Informs about suspended /
  // expired / soon-to-expire accounts. It NEVER redirects or hard-locks (the
  // owner must not be locked out accidentally) — real enforcement is Supabase
  // RLS (Codex). Not shown on Client Presentation (nav.js only loads on admin).
  function renderAccountBanner() {
    try {
      if (!window.PMFoundation || typeof window.PMFoundation.getAccountGate !== 'function') return;
      const gate = window.PMFoundation.getAccountGate();
      const existing = document.getElementById('pm-account-banner');
      // Only surface a banner for a truly blocked account (suspended / expired).
      // Trial countdowns / "trial ends in N days" (warning level) are intentionally
      // NOT shown in the normal product experience — gating LOGIC is unchanged;
      // real enforcement stays with Supabase RLS.
      if (!gate || gate.level !== 'blocked') {
        if (existing) existing.remove();
        return;
      }
      const blocked = gate.level === 'blocked';
      const bg = blocked ? '#F7E7E0' : '#FBF3E4';
      const bd = blocked ? '#E4B7A5' : '#E8D9BE';
      const fg = blocked ? '#8A3B1E' : '#8A6224';
      const banner = existing || document.createElement('div');
      banner.id = 'pm-account-banner';
      banner.setAttribute('role', 'status');
      banner.style.cssText = 'padding:11px 18px;font-size:13.5px;font-weight:600;text-align:center;'
        + 'border-bottom:1px solid ' + bd + ';background:' + bg + ';color:' + fg + ';';
      banner.textContent = (blocked ? '⚠ ' : '') + esc(gate.message);
      const host = document.getElementById('pm-topbar');
      if (host && host.parentNode && !existing) host.parentNode.insertBefore(banner, host);
    } catch (err) {}
  }

  window.PMNav = { render, DEALER_NAV, TEAM_NAV };
})();
