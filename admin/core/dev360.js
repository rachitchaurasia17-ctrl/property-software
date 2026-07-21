// Dealer 360 — platform-admin intelligence layer for Developer Control.
// Loaded ONLY by /admin/developer.html. All data arrives through the ctx
// object injected by that page (rpc/state/helpers); this file renders and
// computes, it never talks to Supabase on its own paths other than ctx.rpc.
//
// Progressive enhancement contract: developer.html works without this file
// (its own renderRows fallback); when PMDev360 is present the page delegates
// the dealer table, platform overview and the Dealer 360 drawer to it.
// Stage-2/3 panels probe their RPCs and show honest pending states until
// supabase/migrations/20260719_dealer360_analytics_draft.sql is applied.
(function () {
  let ctx = null;                 // injected by developer.html
  const flags = { d360Rpc: null, eventsRpc: null, overviewRpc: null };
  const cache = { d360: {}, events: {}, breakdown: {} };
  const list = { filter: 'all', sort: 'lastActive', q: '' };
  let drawerDealerId = null;
  let timelineCursor = null;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (id) => document.getElementById(id);
  const n = (v) => Number(v || 0);

  /* ────────────────────────── health model (I12) ──────────────────────────
     Transparent, tunable by reading. Signals in, {state, reason, actions}
     out. Order matters: account states win, then activity states. */
  function healthFor(d, u, deviceRows) {
    const now = Date.now();
    const acc = d.account_status || 'active';
    const devices = deviceRows || [];
    const approved = devices.filter(x => x.status === 'approved').length;
    const pending = devices.filter(x => x.status === 'pending').length;
    const lastActive = u && u.last_active ? new Date(u.last_active).getTime() : 0;
    const daysSince = lastActive ? Math.floor((now - lastActive) / 86400000) : null;
    const trialEnd = d.trial_end ? new Date(d.trial_end).getTime() : 0;
    const trialDaysLeft = trialEnd ? Math.ceil((trialEnd - now) / 86400000) : null;
    const sessions = n(u && u.sessions);
    const activeDays = n(u && u.active_days);
    const presOpens = n(u && u.presentation_opens);
    const shares = n(u && u.whatsapp_shares);
    const events7d = n(u && u.events_7d);

    const mk = (state, cls, reason, actions) => ({ state, cls, reason, actions: actions || [] });

    if (acc === 'suspended') return mk('Suspended', 'suspended', 'Account suspended by provider.', ['Reactivate if resolved']);
    if (acc === 'expired' || (trialDaysLeft !== null && trialDaysLeft < 0 && (d.subscription_status || 'trial') === 'trial')) {
      return mk('Expired', 'expired', trialDaysLeft !== null ? `Trial ended ${Math.abs(trialDaysLeft)} day(s) ago.` : 'Account expired.',
        ['Follow up on renewal', 'Extend trial if promising']);
    }
    if (!approved && !lastActive) {
      return mk('Not activated', 'expired', pending ? `${pending} device request pending approval.` : 'No approved device and no recorded activity.',
        pending ? ['Approve the pending device'] : ['Onboard in person', 'Create activation code']);
    }
    if (approved && !lastActive) {
      return mk('Activated but unused', 'low', 'Device approved but no usage recorded yet.', ['Call the dealer', 'Walk through first property']);
    }
    if (daysSince !== null && daysSince >= 10) {
      return mk('Inactive', 'expired', `No activity for ${daysSince} days.`, ['Call the dealer', 'Check if device failed']);
    }
    if (daysSince !== null && daysSince >= 5) {
      return mk('At risk', 'suspended', `No activity for ${daysSince} days` + (trialDaysLeft !== null ? `, ${trialDaysLeft} trial day(s) left.` : '.'),
        ['Call the dealer', trialDaysLeft !== null && trialDaysLeft <= 5 ? 'Discuss extension or plan' : 'Ask what is blocking them']);
    }
    if (activeDays >= 5 && presOpens >= 5 && shares >= 2) {
      return mk('Highly engaged', 'strong',
        `Active on ${activeDays} day(s), ${presOpens} presentation open(s), ${shares} WhatsApp share(s).`,
        ['Discuss the paid plan']);
    }
    if (presOpens >= 2) {
      return mk('Presentation-ready', 'strong', `${presOpens} Client Presentation open(s), ${sessions} session(s).`,
        ['Encourage client demos', 'Check property completeness']);
    }
    if (events7d > 0 && activeDays >= 2) {
      return mk('Actively using', 'medium', `${events7d} action(s) in the last 7 days across ${activeDays} active day(s).`,
        ['Help add more properties']);
    }
    return mk('Exploring', 'low', `${sessions} session(s), ${activeDays} active day(s) so far.`,
      ['Call and guide the first presentation']);
  }

  function healthScoreFor(health, usage) {
    const raw = ctx ? ctx.usageStrength(usage).score : 0;
    const fixed = {
      Suspended: 8,
      Expired: 18,
      'Not activated': 15,
      'Activated but unused': 28,
      Inactive: 24,
      'At risk': 40,
      'Highly engaged': 94,
      'Presentation-ready': 84,
      'Actively using': 72
    }[health.state];
    return fixed == null ? Math.min(65, Math.round(35 + raw / 4)) : fixed;
  }

  function healthScoreClass(score) {
    return score >= 70 ? 'strong' : score >= 45 ? 'medium' : 'low';
  }

  /* ────────────────────────── platform overview ────────────────────────── */
  async function renderPlatformOverview() {
    if (!ctx) return;
    const host = $('platform-overview');
    if (!host) return;
    // Try the Stage-2 RPC once; fall back to client-side aggregation over
    // data the page already loaded (still real numbers, just fewer of them).
    let o = null;
    if (flags.overviewRpc !== false) {
      const r = await ctx.rpc('plotmap_admin_platform_overview', {});
      flags.overviewRpc = r.status !== 404;
      if (r.ok) o = r.data;
    }
    const ds = ctx.state.dealers || [];
    const devs = ctx.state.devices || [];
    const us = Object.values(ctx.state.usage || {});
    const now = Date.now();
    const local = {
      dealers: ds.length,
      dealersTrial: ds.filter(d => (d.account_status || 'active') === 'active' && (d.subscription_status || 'trial') === 'trial').length,
      dealersActivePlan: ds.filter(d => (d.account_status || 'active') === 'active' && (d.subscription_status || 'trial') !== 'trial').length,
      dealersSuspended: ds.filter(d => ['suspended', 'expired'].includes(d.account_status)).length,
      trialsEndingSoon: ds.filter(d => d.trial_end && (new Date(d.trial_end) - now) > 0 && (new Date(d.trial_end) - now) < 7 * 86400000).length,
      devicesApproved: devs.filter(d => d.status === 'approved').length,
      devicesPending: devs.filter(d => d.status === 'pending').length,
      activeDealers7d: us.filter(u => u.last_active && now - new Date(u.last_active) < 7 * 86400000).length,
      activeDealers24h: us.filter(u => u.last_active && now - new Date(u.last_active) < 86400000).length,
      presentationOpens: us.reduce((a, u) => a + n(u.presentation_opens), 0),
      atRisk: ds.filter(d => {
        const h = healthFor(d, ctx.state.usage[d.dealer_id], devs.filter(x => x.dealer_id === d.dealer_id));
        return h.state === 'At risk' || h.state === 'Inactive';
      }).length,
      engaged: ds.filter(d => healthFor(d, ctx.state.usage[d.dealer_id], devs.filter(x => x.dealer_id === d.dealer_id)).state === 'Highly engaged').length
    };
    const v = o || local;
    const usageScores = ds.map(d => {
      const usage = ctx.state.usage[d.dealer_id];
      const health = healthFor(d, usage, devs.filter(x => x.dealer_id === d.dealer_id));
      return healthScoreFor(health, usage);
    });
    const averageHealth = usageScores.length
      ? Math.round(usageScores.reduce((sum, score) => sum + score, 0) / usageScores.length)
      : 0;
    const metric = (label, value, detail) => '<div class="overview-hero-metric">'
      + '<div class="k">' + esc(label) + '</div>'
      + '<div class="v">' + esc(value == null ? '—' : value) + '</div>'
      + '<div class="metric-detail">' + detail + '</div>'
      + '</div>';
    const secondary = (label, value, alert) => '<div class="stat' + (alert ? ' is-alert' : '') + '">'
      + '<div class="k">' + esc(label) + '</div><div class="v">' + esc(value == null ? '—' : value) + '</div></div>';
    const accountTotal = Math.max(1, n(v.dealers));
    const mixRow = (label, value, cls) => '<div class="overview-list-row"><span>' + esc(label) + '</span>'
      + '<span class="overview-bar"><i class="' + cls + '" style="width:' + Math.round(n(value) / accountTotal * 100) + '%"></i></span>'
      + '<strong>' + n(value) + '</strong></div>';

    host.innerHTML =
      '<div class="overview-hero">'
      + metric('Total dealers', v.dealers, '<span class="metric-good">' + n(v.dealersActivePlan) + ' paid</span><span>' + n(v.dealersTrial) + ' trial</span>')
      + metric('Active users · 7d', v.activeDealers7d, '<span>' + n(v.activeDealers24h) + ' active in 24h</span>')
      + metric('Approved devices', v.devicesApproved, '<span>' + n(v.devicesPending) + ' pending approval</span>')
      + metric('Avg dealer health', averageHealth + '%', '<span>live usage-strength score</span>')
      + '</div>'
      + '<div class="overview-secondary">'
      + secondary('Properties on platform', o ? n(o.properties) : null)
      + secondary('Map interactions', o ? n(o.mapInteractions) : null)
      + secondary('Presentation opens', n(v.presentationOpens))
      + secondary('Errors · 24h', o ? n(o.errors24h) : null, o && n(o.errors24h) > 0)
      + '</div>'
      + '<div class="overview-detail-grid">'
      + '<article class="overview-detail-card"><h3>Account mix</h3><p>Current dealer account state</p>'
      + mixRow('Paid', v.dealersActivePlan, 'mix-paid')
      + mixRow('Trial', v.dealersTrial, 'mix-trial')
      + mixRow('Suspended / expired', v.dealersSuspended, 'mix-blocked')
      + '</article>'
      + '<article class="overview-detail-card"><h3>Needs attention</h3><p>Live operational follow-up</p>'
      + '<div class="attention-row"><span>Trials ending within 7 days</span><strong>' + n(v.trialsEndingSoon) + '</strong></div>'
      + '<div class="attention-row"><span>Pending device approvals</span><strong>' + n(v.devicesPending) + '</strong></div>'
      + '<div class="attention-row"><span>At-risk dealers</span><strong>' + n(local.atRisk) + '</strong></div>'
      + '<div class="attention-row"><span>Highly engaged dealers</span><strong>' + n(local.engaged) + '</strong></div>'
      + '</article></div>'
      + (o ? '' : '<div class="hint overview-pending">Platform totals for properties, map interactions and errors need the 20260719 Dealer&nbsp;360 migration. Everything else shown here is live data already loaded by this page.</div>');
  }

  /* ────────────────────────── dealer list (I13) ────────────────────────── */
  function filteredSortedDealers() {
    if (!ctx) return [];
    const ds = (ctx.state.dealers || []).slice();
    const q = list.q.trim().toLowerCase();
    const wants = (d) => {
      const u = ctx.state.usage[d.dealer_id];
      const devRows = (ctx.state.devices || []).filter(x => x.dealer_id === d.dealer_id);
      const h = healthFor(d, u, devRows);
      switch (list.filter) {
        case 'active': return (d.account_status || 'active') === 'active' && (d.subscription_status || 'trial') !== 'trial';
        case 'trial': return (d.account_status || 'active') === 'active' && (d.subscription_status || 'trial') === 'trial';
        case 'expiringSoon': return d.trial_end && (new Date(d.trial_end) - Date.now()) > 0 && (new Date(d.trial_end) - Date.now()) < 7 * 86400000;
        case 'atRisk': return h.state === 'At risk' || h.state === 'Inactive';
        case 'engaged': return h.state === 'Highly engaged' || h.state === 'Presentation-ready';
        case 'devicePending': return devRows.some(x => x.status === 'pending');
        case 'neverUsed': return h.state === 'Not activated' || h.state === 'Activated but unused';
        default: return true;
      }
    };
    let rows = ds.filter(d => wants(d) && (!q
      || String(d.dealer_id).toLowerCase().includes(q)
      || String(d.brand_name || '').toLowerCase().includes(q)
      || String(d.owner_name || '').toLowerCase().includes(q)));
    const key = {
      lastActive: d => { const u = ctx.state.usage[d.dealer_id]; return u && u.last_active ? new Date(u.last_active).getTime() : 0; },
      engagement: d => { const u = ctx.state.usage[d.dealer_id]; return ctx.usageStrength(u).score; },
      trialEnd: d => d.trial_end ? -new Date(d.trial_end).getTime() : -Infinity,
      newest: d => d.updated_at ? new Date(d.updated_at).getTime() : 0
    }[list.sort] || (() => 0);
    rows.sort((a, b) => key(b) - key(a));
    return rows;
  }

  function renderDealerTable() {
    if (!ctx) return;
    const tbody = $('dealer-rows');
    if (!tbody) return;
    const rows = filteredSortedDealers().map(d => {
      const u = ctx.state.usage[d.dealer_id];
      const devRows = (ctx.state.devices || []).filter(x => x.dealer_id === d.dealer_id);
      const h = healthFor(d, u, devRows);
      const healthScore = healthScoreFor(h, u);
      const approved = devRows.filter(x => x.status === 'approved').length;
      const pending = devRows.filter(x => x.status === 'pending').length;
      return '<tr>'
        + '<td><div class="dname"><a href="#" data-open360="' + esc(d.dealer_id) + '" style="color:#1F5E47;text-decoration:none;">' + esc(d.brand_name || d.dealer_id) + '</a></div>'
        +   '<div class="dmeta">' + esc(d.dealer_id) + (d.owner_name ? ' · ' + esc(d.owner_name) : '') + '</div></td>'
        + '<td>' + esc(d.primary_area || '—') + '</td>'
        + '<td>' + ctx.statusChip(d) + '</td>'
        + '<td style="white-space:nowrap;">' + ctx.fmtDate(d.trial_end) + '<div class="dmeta">from ' + ctx.fmtDate(d.trial_start) + '</div></td>'
        + '<td>' + (u ? ctx.fmtWhen(u.last_active) : '—') + '</td>'
        + '<td>' + (u ? n(u.sessions) + '<div class="dmeta">' + n(u.active_days) + ' active days</div>' : '—') + '</td>'
        + '<td>' + (u ? n(u.presentation_opens) : '—') + '</td>'
        + '<td>' + approved + (pending ? ' <span class="chip trial">+' + pending + ' pending</span>' : '') + '</td>'
        + '<td><div class="health-meter" title="' + esc(h.state + ': ' + h.reason) + '" aria-label="' + esc(h.state + ', health ' + healthScore) + '">'
        +   '<span><i class="' + healthScoreClass(healthScore) + '" style="width:' + healthScore + '%"></i></span><strong>' + healthScore + '</strong></div></td>'
        + '<td><div class="rowbtns">'
        +   '<button data-open360="' + esc(d.dealer_id) + '">Dealer 360</button>'
        +   '<button data-act="trial" data-id="' + esc(d.dealer_id) + '">Trial…</button>'
        +   '<button data-act="passcode" data-id="' + esc(d.dealer_id) + '">Passcode…</button>'
        +   ((d.account_status || 'active') === 'active'
              ? '<button class="danger" data-act="suspend" data-id="' + esc(d.dealer_id) + '">Suspend</button>'
              : '<button data-act="activate" data-id="' + esc(d.dealer_id) + '">Activate</button>')
        + '</div></td>'
        + '</tr>';
    });
    tbody.innerHTML = rows.join('') || '<tr><td colspan="10" class="muted">No dealers match this filter.</td></tr>';
  }

  function bindListControls() {
    const bar = $('dealer-list-controls');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-filter]');
      if (!b) return;
      list.filter = b.getAttribute('data-filter');
      bar.querySelectorAll('button[data-filter]').forEach(x => x.classList.toggle('on', x === b));
      renderDealerTable();
    });
    const q = $('dealer-search');
    if (q) q.addEventListener('input', () => { list.q = q.value; renderDealerTable(); });
    const s = $('dealer-sort');
    if (s) s.addEventListener('change', () => { list.sort = s.value; renderDealerTable(); });
  }

  /* ────────────────────────── Dealer 360 drawer ────────────────────────── */
  const EVENT_LABELS = {
    app_open: 'Opened PlotMap', dealer_login: 'Signed in', presentation_opened: 'Opened Client Presentation',
    dealer_dashboard_opened: 'Opened dealer dashboard', team_workspace_opened: 'Opened Team Workspace',
    properties_page_opened: 'Opened Properties', map_studio_opened: 'Opened Map Studio',
    clients_page_opened: 'Opened Client Details', insights_page_opened: 'Opened insights',
    admin_page_opened: 'Opened an admin page', client_panel_opened: 'Opened property panel',
    inventory_opened: 'Opened inventory', map_opened: 'Opened a map', area_viewed: 'Viewed a city',
    sector_viewed: 'Viewed a sector map', overlay_selected: 'Highlighted a map item',
    sector_proof_clicked: 'Opened sector proof', original_proof_clicked: 'Opened original proof',
    property_add_clicked: 'Started adding a property', property_added: 'Added a property',
    property_selected: 'Selected a property', property_viewed: 'Viewed a property',
    property_shared_whatsapp: 'Shared on WhatsApp', brochure_shared: 'Shared details',
    property_shared: 'Shared a property', followup_created_from_presentation: 'Created a follow-up',
    app_error: '⚠ App error', asset_load_failure: '⚠ Map asset failed', slow_operation: '⚠ Slow operation'
  };
  function eventLabel(ev) {
    let base = EVENT_LABELS[ev.event_type] || ev.event_type;
    const bits = [];
    if (ev.area) bits.push(ev.area);
    if (ev.sector) bits.push(ev.sector);
    if (ev.map_id && !ev.sector) bits.push(ev.map_id);
    return base + (bits.length ? ' — ' + bits.join(' · ') : '');
  }

  function drawerEl() { return $('d360-drawer'); }

  async function open360(dealerId) {
    drawerDealerId = dealerId;
    timelineCursor = null;
    const d = (ctx.state.dealers || []).find(x => x.dealer_id === dealerId);
    if (!d || !drawerEl()) return;
    if (window.PMDeveloperUI && typeof window.PMDeveloperUI.openDealer360 === 'function') {
      window.PMDeveloperUI.openDealer360(dealerId);
    }
    drawerEl().style.display = '';
    if (!(window.PMDeveloperUI && window.PMDeveloperUI.embeddedDealer360)) {
      document.body.style.overflow = 'hidden';
    }
    $('d360-title').textContent = d.brand_name || dealerId;
    $('d360-sub').innerHTML = esc(dealerId) + ' · ' + ctx.statusChip(d);
    switchTab('overview');
    renderOverviewTab();     // instant from loaded data
    // Stage-2 deep summary (one RPC) — upgrades the overview in place.
    if (flags.d360Rpc !== false) {
      const r = await ctx.rpc('plotmap_admin_dealer_360', { p_dealer_id: dealerId });
      flags.d360Rpc = r.status !== 404;
      if (r.ok && r.data) { cache.d360[dealerId] = r.data; if (drawerDealerId === dealerId) renderOverviewTab(); }
    }
  }

  function close360() {
    if (drawerEl()) drawerEl().style.display = 'none';
    document.body.style.overflow = '';
    drawerDealerId = null;
    if (window.PMDeveloperUI && typeof window.PMDeveloperUI.closeDealer360 === 'function') {
      window.PMDeveloperUI.closeDealer360();
    }
  }

  function switchTab(tab) {
    document.querySelectorAll('#d360-tabs button').forEach(b => b.classList.toggle('on', b.getAttribute('data-tab') === tab));
    document.querySelectorAll('.d360-panel').forEach(p => { p.style.display = p.id === 'd360-' + tab ? '' : 'none'; });
    if (tab === 'activity') renderActivityTab();
    if (tab === 'properties') renderPropertiesTab();
    if (tab === 'maps') renderMapsTab();
    if (tab === 'devices') renderDevicesTab();
    if (tab === 'errors') renderErrorsTab();
    if (tab === 'account') renderAccountTab();
  }

  function pendingNote(what) {
    return '<div class="banner warn" style="margin:10px 0 0;">' + esc(what) + ' unlocks after the 20260719 Dealer&nbsp;360 migration is applied (see <code>supabase/migrations/20260719_dealer360_analytics_draft.sql</code>). Nothing here is simulated.</div>';
  }

  function cell(k, v, title) {
    return '<div class="cell"' + (title ? ' title="' + esc(title) + '"' : '') + '><div class="k">' + esc(k) + '</div><div class="v">' + esc(v == null || v === '' ? '—' : v) + '</div></div>';
  }

  function fmtDur(s) {
    s = n(s);
    if (!s) return '—';
    if (s < 3600) return Math.round(s / 60) + ' min';
    return (s / 3600).toFixed(1) + ' h';
  }

  function renderOverviewTab() {
    const d = (ctx.state.dealers || []).find(x => x.dealer_id === drawerDealerId);
    if (!d) return;
    const u = ctx.state.usage[drawerDealerId];
    const devRows = (ctx.state.devices || []).filter(x => x.dealer_id === drawerDealerId);
    const h = healthFor(d, u, devRows);
    const deep = cache.d360[drawerDealerId];
    const du = deep && deep.usage;
    const dp = deep && deep.properties;
    const healthScore = healthScoreFor(h, u);
    const trialDays = d.trial_start ? Math.max(0, Math.floor((Date.now() - new Date(d.trial_start)) / 86400000)) : null;
    const trialLeft = d.trial_end ? Math.ceil((new Date(d.trial_end) - Date.now()) / 86400000) : null;

    $('d360-health').innerHTML = '<div class="d360-health-summary">'
      + '<svg viewBox="0 0 100 100" aria-label="Dealer health ' + healthScore + '"><circle cx="50" cy="50" r="42" fill="none" stroke="oklch(0.30 0.014 70)" stroke-width="9"/>'
      + '<circle cx="50" cy="50" r="42" fill="none" stroke="oklch(0.72 0.10 72)" stroke-width="9" stroke-linecap="round" transform="rotate(-90 50 50)" pathLength="100" stroke-dasharray="' + healthScore + ' 100"/>'
      + '<text x="50" y="48" text-anchor="middle" class="d360-score">' + healthScore + '</text><text x="50" y="64" text-anchor="middle" class="d360-score-label">HEALTH</text></svg>'
      + '<div class="d360-health-copy"><span class="chip ' + h.cls + '">' + esc(h.state) + '</span><p>' + esc(h.reason) + '</p>'
      + (h.actions.length ? '<small><b>Suggested:</b> ' + h.actions.map(esc).join(' · ') + ' <span>(advisory only)</span></small>' : '')
      + '</div></div>';

    const cells = [
      cell('Account', (d.account_status || 'active') + ' / ' + (d.subscription_status || 'trial')),
      cell('Trial', trialDays !== null ? 'day ' + trialDays + (trialLeft !== null ? ' · ' + trialLeft + ' left' : '') : '—'),
      cell('Last active', u ? ctx.fmtWhen(u.last_active) : '—'),
      cell('First active', du ? ctx.fmtDate(du.firstActive) : '—', du ? '' : 'needs migration'),
      cell('App opens', du ? n(du.appOpens) : '—', du ? '' : 'needs migration'),
      cell('Sessions', u ? n(u.sessions) : '—'),
      cell('Active days', u ? n(u.active_days) : '—'),
      cell('Usage time', du ? fmtDur(du.durationS) : '—', du ? 'sum of session spans' : 'needs migration'),
      cell('Events 7d', u ? n(u.events_7d) : '—'),
      cell('Events 30d', du ? n(du.events30d) : '—'),
      cell('Presentation opens', u ? n(u.presentation_opens) : '—'),
      cell('WhatsApp shares', u ? n(u.whatsapp_shares) : '—'),
      cell('Properties', dp ? n(dp.total) : '—'),
      cell('Client-ready', dp ? n(dp.clientVisible) : '—'),
      cell('Devices', devRows.filter(x => x.status === 'approved').length + ' approved'
        + (devRows.filter(x => x.status === 'pending').length ? ' · ' + devRows.filter(x => x.status === 'pending').length + ' pending' : '')),
      cell('Errors 7d', deep && deep.errors ? n(deep.errors.errors7d) : '—')
    ];
    $('d360-overview-cells').innerHTML = cells.join('');
    $('d360-overview-note').innerHTML = deep ? '' : pendingNote('First-active, app opens, usage time, 30-day totals, property and error depth');
  }

  async function renderActivityTab() {
    const host = $('d360-activity-list');
    if (flags.eventsRpc === false) { host.innerHTML = pendingNote('The activity timeline'); return; }
    host.innerHTML = '<div class="muted" style="padding:12px 0;">Loading activity…</div>';
    const types = $('d360-activity-filter').value;
    const r = await ctx.rpc('plotmap_admin_dealer_events', {
      p_dealer_id: drawerDealerId,
      p_before: timelineCursor && timelineCursor.createdAt,
      p_before_id: timelineCursor && timelineCursor.id,
      p_limit: 50,
      p_types: types === 'all' ? null
        : types === 'errors' ? ['app_error', 'asset_load_failure', 'slow_operation']
        : types === 'sharing' ? ['property_shared_whatsapp', 'brochure_shared']
        : types === 'maps' ? ['map_opened', 'area_viewed', 'sector_viewed', 'overlay_selected']
        : null
    });
    flags.eventsRpc = r.status !== 404;
    if (!flags.eventsRpc) { host.innerHTML = pendingNote('The activity timeline'); return; }
    if (!r.ok) { host.innerHTML = '<div class="muted">Could not load activity (' + esc(r.message || r.status) + ').</div>'; return; }
    const rows = (r.data || []).filter(ev => !(ev.metadata && ev.metadata.env === 'local'));
    const adminIncluded = $('d360-activity-admin').checked;
    const visible = adminIncluded ? rows : rows.filter(ev => !(ev.metadata && ev.metadata.surface === 'admin'));
    if (!visible.length && !timelineCursor) {
      host.innerHTML = '<div class="muted" style="padding:12px 0;">No recorded activity' + (adminIncluded ? '' : ' (dealer surfaces)') + ' yet.</div>';
      return;
    }
    const items = visible.map(ev => {
      const t = new Date(ev.created_at);
      const when = t.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const isErr = /app_error|asset_load_failure|slow_operation/.test(ev.event_type);
      return '<details style="border-bottom:1px solid #F1EADB;padding:8px 2px;">'
        + '<summary style="cursor:pointer;list-style:none;display:flex;gap:12px;align-items:baseline;">'
        +   '<span style="flex:none;font-size:12px;color:#8A8371;white-space:nowrap;width:120px;">' + esc(when) + '</span>'
        +   '<span style="font-size:13.5px;' + (isErr ? 'color:#8A3B1E;font-weight:600;' : '') + '">' + esc(eventLabel(ev)) + '</span>'
        +   ((ev.metadata && ev.metadata.surface === 'admin') ? '<span class="chip low" style="margin-left:auto;">admin</span>' : '')
        + '</summary>'
        + '<div style="font-size:12px;font-family:ui-monospace,Consolas,monospace;color:#6B7268;padding:6px 0 2px 132px;">'
        +   esc(ev.event_type) + (ev.property_id ? ' · property ' + esc(ev.property_id) : '') + (ev.session_id ? ' · session ' + esc(String(ev.session_id).slice(0, 12)) : '')
        + '</div></details>';
    });
    if (timelineCursor) host.insertAdjacentHTML('beforeend', items.join(''));
    else host.innerHTML = items.join('');
    const last = rows[rows.length - 1];
    const more = $('d360-activity-more');
    if (rows.length >= 50 && last) {
      timelineCursor = { createdAt: last.created_at, id: last.id };
      more.style.display = '';
    } else more.style.display = 'none';
  }

  async function renderPropertiesTab() {
    const host = $('d360-properties-body');
    const deep = cache.d360[drawerDealerId];
    if (flags.d360Rpc === false) { host.innerHTML = pendingNote('Property intelligence'); return; }
    if (!deep) { host.innerHTML = '<div class="muted">Loading…</div>'; setTimeout(renderPropertiesTab, 600); return; }
    const p = deep.properties || {};
    host.innerHTML = '<div class="summary-grid">'
      + cell('Total', n(p.total)) + cell('Available', n(p.available)) + cell('Sold', n(p.sold))
      + cell('On hold', n(p.onHold)) + cell('Internal only', n(p.internalOnly))
      + cell('Client-visible', n(p.clientVisible)) + cell('Hidden', n(p.hidden))
      + cell('Missing photos', n(p.missingPhotos)) + cell('Missing city', n(p.missingArea))
      + cell('Missing sector', n(p.missingSector)) + cell('No map link', n(p.missingMapLink))
      + cell('Added 7d', n(p.added7d)) + cell('Added 30d', n(p.added30d))
      + cell('Last added', p.lastAdded ? ctx.fmtDate(p.lastAdded) : '—')
      + cell('Last updated', p.lastUpdated ? ctx.fmtWhen(p.lastUpdated) : '—')
      + '</div>'
      + '<div class="hint">Counts come from the authoritative <code>crm_records</code> table, not events. Most-presented properties appear in the Activity tab (property events).</div>';
  }

  async function renderMapsTab() {
    const host = $('d360-maps-body');
    const u = ctx.state.usage[drawerDealerId];
    const deep = cache.d360[drawerDealerId];
    let breakdown = cache.breakdown[drawerDealerId];
    if (!breakdown) {
      const r = await ctx.rpc('plotmap_admin_dealer_event_breakdown', { p_dealer_id: drawerDealerId, p_days: 30 });
      breakdown = r.ok && Array.isArray(r.data) ? r.data : [];
      cache.breakdown[drawerDealerId] = breakdown;
    }
    const m = deep && deep.maps;
    const cities = m && Array.isArray(m.citiesOpened) ? m.citiesOpened.filter(Boolean) : null;
    host.innerHTML = '<div class="summary-grid">'
      + cell('Map opens', u ? n(u.map_opens) : '—')
      + cell('Highlights', m ? n(m.highlights) : '—', m ? '' : 'needs migration')
      + cell('Most-used map', m && m.topMap ? m.topMap : '—', m ? '' : 'needs migration')
      + cell('Map failures', m ? n(m.mapFailures) : '—', m ? '' : 'needs migration')
      + '</div>'
      + (cities ? '<div class="hint"><b>Cities opened:</b> ' + (cities.length ? cities.map(esc).join(' · ') : 'none yet') + '</div>' : pendingNote('Cities opened, top map and failure depth'))
      + (breakdown.length
        ? '<div class="hint" style="margin-top:8px;"><b>Last 30 days by feature:</b> ' + breakdown.slice(0, 12).map(row => esc(row.event_type) + ' × ' + n(row.events)).join(' · ') + '</div>'
        : '<div class="muted">No feature activity recorded in the last 30 days.</div>');
  }

  function renderDevicesTab() {
    const host = $('d360-devices-body');
    const devRows = (ctx.state.devices || []).filter(x => x.dealer_id === drawerDealerId);
    if (!devRows.length) { host.innerHTML = '<div class="muted">No devices recorded for this dealer.</div>'; return; }
    host.innerHTML = '<table><thead><tr><th>Status</th><th>Device</th><th>First seen</th><th>Last seen</th><th>Actions</th></tr></thead><tbody>'
      + devRows.map(v => '<tr>'
        + '<td><span class="chip ' + (v.status === 'approved' ? 'active' : v.status === 'pending' ? 'trial' : 'suspended') + '">' + esc(v.status) + '</span></td>'
        + '<td>' + esc(v.device_label || '—') + '<div class="dmeta">' + esc(v.browser_info || '') + '</div></td>'
        + '<td>' + ctx.fmtDate(v.first_seen) + '</td>'
        + '<td>' + ctx.fmtWhen(v.last_seen) + '</td>'
        + '<td><div class="rowbtns">'
        + (v.status === 'pending' ? '<button data-devact="approved" data-dev="' + esc(v.id) + '">Approve</button><button class="danger" data-devact="rejected" data-dev="' + esc(v.id) + '">Reject</button>' : '')
        + (v.status === 'approved' ? '<button class="danger" data-devact="revoked" data-dev="' + esc(v.id) + '">Revoke</button>' : '')
        + (v.status === 'revoked' || v.status === 'rejected' ? '<button data-devact="approved" data-dev="' + esc(v.id) + '">Re-approve</button>' : '')
        + '</div></td>'
        + '</tr>').join('')
      + '</tbody></table>'
      + '<div class="hint" style="margin-top:10px;">Device tokens and hashes are never shown. Approve/revoke confirm before acting; the server re-checks platform-admin rights on every call.</div>';
  }

  function renderErrorsTab() {
    const host = $('d360-errors-body');
    const deep = cache.d360[drawerDealerId];
    if (flags.d360Rpc === false) { host.innerHTML = pendingNote('Error intelligence'); return; }
    if (!deep) { host.innerHTML = '<div class="muted">Loading…</div>'; setTimeout(renderErrorsTab, 600); return; }
    const e = deep.errors || {};
    host.innerHTML = '<div class="summary-grid">'
      + cell('Errors 24h', n(e.errors24h)) + cell('Errors 7d', n(e.errors7d))
      + cell('Latest', e.latest ? ctx.fmtWhen(e.latest) : '—')
      + cell('Latest code', e.latestCode || '—')
      + '</div>'
      + '<div class="hint">Individual error events (sanitized codes only — never stack traces) are in the Activity tab under the “Errors” filter.</div>';
  }

  function renderAccountTab() {
    const d = (ctx.state.dealers || []).find(x => x.dealer_id === drawerDealerId);
    if (!d) return;
    $('d360-account-body').innerHTML = '<div class="summary-grid">'
      + cell('Account status', d.account_status || 'active')
      + cell('Plan', (d.subscription_status || 'trial') + (d.plan_code ? ' · ' + d.plan_code : ''))
      + cell('Trial start', ctx.fmtDate(d.trial_start)) + cell('Trial end', ctx.fmtDate(d.trial_end))
      + cell('Expiry', ctx.fmtDate(d.expiry_date)) + cell('Paid', d.paid ? 'yes' : 'no')
      + cell('Passcode', d.has_passcode ? 'set' : 'not set') + cell('Login email', d.login_email || '—')
      + '</div>'
      + '<div class="rowbtns" style="margin-top:12px;">'
      + '<button data-act="trial" data-id="' + esc(d.dealer_id) + '">Trial &amp; notes…</button>'
      + '<button data-act="passcode" data-id="' + esc(d.dealer_id) + '">Passcode…</button>'
      + ((d.account_status || 'active') === 'active'
          ? '<button class="danger" data-act="suspend" data-id="' + esc(d.dealer_id) + '">Suspend</button>'
          : '<button data-act="activate" data-id="' + esc(d.dealer_id) + '">Activate</button>')
      + ((d.account_status || 'active') !== 'expired' ? '<button class="danger" data-act="expire" data-id="' + esc(d.dealer_id) + '">Expire</button>' : '')
      + '</div>'
      + (d.developer_notes ? '<div class="hint" style="margin-top:12px;"><b>Developer notes:</b> ' + esc(d.developer_notes) + '</div>' : '');
  }

  /* ────────────────────────── wiring ────────────────────────── */
  function bindDrawer() {
    const dr = drawerEl();
    if (!dr || dr.dataset.bound) return;
    dr.dataset.bound = '1';
    $('d360-close').addEventListener('click', close360);
    dr.addEventListener('click', (e) => { if (e.target === dr) close360(); });
    $('d360-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) switchTab(b.getAttribute('data-tab'));
    });
    $('d360-activity-filter').addEventListener('change', () => { timelineCursor = null; renderActivityTab(); });
    $('d360-activity-admin').addEventListener('change', () => { timelineCursor = null; renderActivityTab(); });
    $('d360-activity-more').addEventListener('click', renderActivityTab);
    dr.addEventListener('click', async (e) => {
      const devBtn = e.target.closest('button[data-devact]');
      if (devBtn) {
        const status = devBtn.getAttribute('data-devact');
        if (!confirm(status === 'approved' ? 'Approve this device?' : status === 'revoked' ? 'Revoke this device? The dealer laptop loses access immediately.' : 'Reject this device request?')) return;
        const r = await ctx.rpc('plotmap_admin_set_device_status', { p_device_id: devBtn.getAttribute('data-dev'), p_status: status });
        if (!r.ok) alert('Failed: ' + (r.message || r.status));
        await ctx.refresh();
        renderDevicesTab();
        return;
      }
      const actBtn = e.target.closest('button[data-act]');
      if (actBtn) {
        // delegate account actions to the page's existing handlers
        ctx.handleAction(actBtn.getAttribute('data-act'), actBtn.getAttribute('data-id'));
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerDealerId) close360(); });
  }

  function bindTableOpen() {
    const tbody = $('dealer-rows');
    if (!tbody || tbody.dataset.d360bound) return;
    tbody.dataset.d360bound = '1';
    tbody.addEventListener('click', (e) => {
      const link = e.target.closest('[data-open360]');
      if (link) { e.preventDefault(); open360(link.getAttribute('data-open360')); }
    });
  }

  window.PMDev360 = {
    init(context) {
      ctx = context;
      bindListControls();
      bindDrawer();
      bindTableOpen();
    },
    // True once init() has supplied the shared context. developer.html checks
    // this before delegating any render, so a render can never run against a
    // null ctx (the boot-crash this guards against).
    isReady() { return ctx !== null; },
    renderDealerTable,
    renderPlatformOverview,
    healthFor,
    open360
  };
})();
