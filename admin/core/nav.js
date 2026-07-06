// PlotMap admin navigation — the ONLY place dashboard nav is defined.
// Every admin page renders its topbar through PMNav.render(). Do not add
// per-page <nav> blocks; retired sections (Finance, Reports, Access) must
// never reappear here.
(function () {
  // Approved dealer navigation. Order matters.
  const DEALER_NAV = [
    { key: 'dashboard', label: 'Dashboard', href: '/admin/owner.html' },
    { key: 'presentation', label: 'Client Presentation', href: '/app/plotmap/' },
    { key: 'map-studio', label: 'Map Studio', href: '/admin/map-studio.html' },
    { key: 'properties', label: 'Properties', href: '/admin/properties.html' },
    { key: 'area-intelligence', label: 'Area Intelligence', href: '/admin/area-intelligence.html' },
    { key: 'deals', label: 'Deals', href: '/admin/deals.html' },
    { key: 'client-movement', label: 'Client Movement', href: '/admin/clients.html' },
    { key: 'property-insights', label: 'Property Insights', href: '/admin/property-insights.html' }
  ];

  // Team members see the workspace subset filtered by their permission
  // scopes (PMAccess.resolveScopes on the cached Supabase profile). Pages
  // are also guarded by PMAccess.guardPage — hiding nav is UX, not security.
  const TEAM_NAV = [
    { key: 'dashboard', label: 'Workspace', href: '/admin/team.html' },
    { key: 'presentation', label: 'Client Presentation', href: '/app/plotmap/', scope: 'presentation.view' },
    { key: 'map-studio', label: 'Map Studio', href: '/admin/map-studio.html', scope: 'mapstudio.manage' },
    { key: 'properties', label: 'Properties', href: '/admin/properties.html', scope: 'properties.manage' },
    { key: 'deals', label: 'Deals', href: '/admin/deals.html', scope: 'deals.view' },
    { key: 'client-movement', label: 'Client Movement', href: '/admin/clients.html', scope: 'clients.view' },
    { key: 'area-intelligence', label: 'Area Intelligence', href: '/admin/area-intelligence.html', scope: 'insights.view', optIn: true },
    { key: 'property-insights', label: 'Property Insights', href: '/admin/property-insights.html', scope: 'insights.view', optIn: true }
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

  function render(active) {
    const host = document.getElementById('pm-topbar');
    if (!host) return;
    const role = currentRole();
    const items = navFor(role);
    host.classList.add('pm-topbar', role === 'team' ? 'team-bar' : 'dealer-bar');
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
  }

  window.PMNav = { render, DEALER_NAV, TEAM_NAV };
})();
