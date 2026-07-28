/* =============================================================================
   PlotMap dealer application shell  ·  window.PMShell
   -----------------------------------------------------------------------------
   The single, canonical violet-dusk chrome for every dealer-facing route.
   A migrated page includes plotmap-ds.css + this file and calls:

     const mount = PMShell.mount({ variant:'owner', active:'home',
                                   section:{ icon:'ph-house', name:'Home' } });
     mount.appendChild(myPageContent);      // mount === the scroll region

   It renders the sidebar (owner or team nav variant), the sticky page header,
   and the scroll region — so no route hand-rolls a shell. Real dealer identity
   and account state come from PMFoundation / PMAuth when present; fallbacks are
   generic ("Dealer", "Your workspace") and NEVER fabricated sample names.

   Also exposes PMShell.toast() and PMShell.confirm() (DS-styled).
   Does not change any auth/guard/data contract — pages still load their own
   guard + data modules exactly as before.
   ========================================================================== */
(function (global) {
  'use strict';

  var LOGO_SVG =
    '<svg viewBox="0 0 40 40" aria-hidden="true">' +
    '<rect x="0" y="0" width="40" height="40" rx="12" fill="#241d0c"></rect>' +
    '<path d="M20 8.5 L33 16 L20 23.5 L7 16 Z" fill="#ffc93c"></path>' +
    '<path d="M7 22 L20 29.5 L33 22 L33 25.5 L20 33 L7 25.5 Z" fill="#f4ae14" opacity="0.55"></path>' +
    '<circle cx="20" cy="16" r="3.6" fill="#241d0c"></circle></svg>';

  // Nav definitions — labels/icons/order are the APPROVED design. hrefs connect
  // to the real existing routes (or, for Client Links this phase, the Client
  // Links section inside My Plots per the approved feature-delta).
  var NAV = {
    owner: [
      { key: 'home',      label: 'Home',         icon: 'ph-house',              href: '/admin/owner.html' },
      { key: 'deals',     label: 'My Deals',     icon: 'ph-handshake',          href: '/admin/deals.html',      badge: 'activeDeals' },
      { key: 'plots',     label: 'My Plots',     icon: 'ph-buildings',          href: '/admin/properties.html' },
      { key: 'customers', label: 'My Customers', icon: 'ph-users-three',        href: '/admin/clients.html' },
      { key: 'links',     label: 'Client Links', icon: 'ph-paper-plane-tilt',   href: '/admin/properties.html#client-links' }
    ],
    team: [
      { key: 'workspace', label: 'Workspace',  icon: 'ph-squares-four', href: '/admin/team.html' },
      { key: 'plots',     label: 'Properties', icon: 'ph-buildings',    href: '/admin/properties.html' },
      { key: 'mapstudio', label: 'Map Studio', icon: 'ph-pen-nib',      href: '/admin/map-studio.html' }
    ]
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initialsOf(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'PM';
    return parts.slice(0, 2).map(function (w) { return (w[0] || '').toUpperCase(); }).join('') || 'PM';
  }

  // Real dealer identity — brand/owner from PMFoundation/PMAuth, no fake names.
  function readIdentity() {
    var brand = '', owner = '';
    try {
      if (global.PMFoundation && typeof global.PMFoundation.getDealerSettings === 'function') {
        var s = global.PMFoundation.getDealerSettings() || {};
        brand = s.brandName || s.businessName || '';
        owner = s.ownerName || s.contactName || '';
      }
    } catch (e) {}
    try {
      if (!owner && global.PMAuth && global.PMAuth.__profile) {
        owner = global.PMAuth.__profile.full_name || global.PMAuth.__profile.name || '';
      }
    } catch (e) {}
    return {
      brand: brand || 'Your workspace',
      owner: owner || 'Dealer',
      initials: initialsOf(owner || brand || 'PlotMap')
    };
  }

  // Real account gate (trial/active/…) — never invented.
  function readAccountPill() {
    try {
      if (global.PMFoundation && typeof global.PMFoundation.getAccountGate === 'function') {
        var g = global.PMFoundation.getAccountGate();
        if (g && g.plan) {
          var plan = g.plan;
          if (plan.subscriptionStatus === 'trial' && plan.trialEnd) {
            var days = Math.ceil((Date.parse(plan.trialEnd) - Date.now()) / 86400000);
            if (isFinite(days)) return { text: 'Trial · ' + Math.max(0, days) + ' day' + (days === 1 ? '' : 's') + ' left', kind: 'trial' };
          }
          if (g.status) return { text: String(g.status).replace(/^\w/, function (m) { return m.toUpperCase(); }), kind: 'trial' };
        }
      }
    } catch (e) {}
    return null;
  }

  function activeDealCount() {
    try {
      var crm = global.CRM;
      var data = crm && (crm.getScopedCRM ? crm.getScopedCRM() : crm.getCRM ? crm.getCRM() : null);
      var deals = data && Array.isArray(data.deals) ? data.deals : [];
      return deals.filter(function (d) { return d && d.stage && d.stage !== 'closed' && d.stage !== 'lost'; }).length;
    } catch (e) { return 0; }
  }

  function dateStr() {
    var d = new Date();
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()];
  }

  function mount(opts) {
    opts = opts || {};
    var variant = opts.variant === 'team' ? 'team' : 'owner';
    var active = opts.active || '';
    var section = opts.section || { icon: 'ph-house', name: 'Home' };
    var ident = readIdentity();
    var accPill = readAccountPill();
    var badges = { activeDeals: activeDealCount() };

    document.body.classList.add('pm-body', 'pm-app-bg');

    var navHtml = NAV[variant].map(function (n) {
      var isActive = n.key === active;
      var badgeVal = n.badge ? badges[n.badge] : 0;
      return '<a href="' + esc(n.href) + '" class="' + (isActive ? 'is-active' : '') + '"' +
        (isActive ? ' aria-current="page"' : '') + '>' +
        '<i class="' + esc(n.icon) + '"></i>' +
        '<span class="pm-nl">' + esc(n.label) + '</span>' +
        '<span class="pm-nb' + (badgeVal ? ' on' : '') + '">' + (badgeVal || '') + '</span>' +
        '</a>';
    }).join('');

    var shell = document.createElement('div');
    shell.className = 'pm-shell';
    shell.innerHTML =
      '<aside class="pm-shell-aside">' +
        '<div class="pm-shell-brand">' + LOGO_SVG + '<div class="pm-wm">Plot<span>Map</span></div></div>' +
        '<nav class="pm-shell-nav pm-scroll" aria-label="Dealer navigation">' + navHtml + '</nav>' +
        '<div class="pm-shell-cta-wrap">' +
          '<div class="pm-shell-cta-eyebrow">With a customer?</div>' +
          '<a class="pm-shell-cta" href="/app/plotmap/" target="_blank" rel="noopener">' +
            '<i class="ph-fill ph-projector-screen-chart"></i>' +
            '<span><span class="t">Show Map to Customer</span><span class="s">Opens the full-screen map</span></span>' +
          '</a>' +
        '</div>' +
        '<div class="pm-shell-user">' +
          '<div class="av">' + esc(ident.initials) + '</div>' +
          '<div class="who"><div class="n">' + esc(ident.owner) + '</div><div class="b">' + esc(ident.brand) + '</div></div>' +
          '<button class="gear" type="button" title="Account & settings" data-pm-settings><i class="ph ph-gear-six"></i></button>' +
        '</div>' +
      '</aside>' +
      '<div class="pm-shell-main">' +
        '<header class="pm-shell-header">' +
          '<i class="' + esc(section.icon || 'ph-house') + ' hi"></i>' +
          '<span class="hn">' + esc(section.name || '') + '</span>' +
          '<div class="hd"><i class="ph ph-calendar-blank"></i>' + esc(dateStr()) + '</div>' +
          '<div class="spacer"></div>' +
          (accPill ? '<span class="pm-hpill pm-hpill-trial"><i class="ph-fill ph-seal-check"></i>' + esc(accPill.text) + '</span>' : '') +
        '</header>' +
        '<div class="pm-shell-scroll pm-scroll" id="pm-shell-scroll"></div>' +
      '</div>';

    document.body.insertBefore(shell, document.body.firstChild);

    // Settings gear → let the page decide (owner Home wires it to its drawer).
    var gear = shell.querySelector('[data-pm-settings]');
    if (gear) gear.addEventListener('click', function () {
      if (typeof opts.onSettings === 'function') { opts.onSettings(); return; }
      var drawer = document.getElementById('account-settings-drawer');
      if (drawer) { drawer.open = true; drawer.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });

    return shell.querySelector('#pm-shell-scroll');
  }

  // --- Toasts -----------------------------------------------------------------
  function toast(message, kind) {
    var host = document.querySelector('.pm-toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'pm-toast-host'; document.body.appendChild(host); }
    var ic = kind === 'ok' ? 'ph-fill ph-check-circle' : kind === 'err' ? 'ph-fill ph-warning-circle' : kind === 'warn' ? 'ph-fill ph-warning' : 'ph-fill ph-info';
    var el = document.createElement('div');
    el.className = 'pm-toast ' + (kind || '');
    el.innerHTML = '<i class="' + ic + '"></i><span>' + esc(message) + '</span>';
    host.appendChild(el);
    setTimeout(function () { el.classList.add('leaving'); setTimeout(function () { el.remove(); }, 220); }, 3200);
  }

  // --- Confirm dialog (DS-styled, promise-based) ------------------------------
  function confirmDialog(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'pm-overlay is-open';
      overlay.innerHTML =
        '<div class="pm-dialog" role="dialog" aria-modal="true">' +
          '<div class="pm-dialog-head"><h3 class="pm-sheet-title">' + esc(o.title || 'Are you sure?') + '</h3></div>' +
          '<p class="pm-body-sm" style="margin:0 0 20px">' + esc(o.body || '') + '</p>' +
          '<div class="pm-row" style="justify-content:flex-end;gap:10px">' +
            '<button class="pm-btn pm-btn-ghost" data-x>' + esc(o.cancelText || 'Cancel') + '</button>' +
            '<button class="pm-btn ' + (o.danger ? 'pm-btn-danger' : 'pm-btn-primary') + '" data-ok>' + esc(o.okText || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      function close(v) { overlay.remove(); resolve(v); }
      overlay.querySelector('[data-ok]').addEventListener('click', function () { close(true); });
      overlay.querySelector('[data-x]').addEventListener('click', function () { close(false); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
    });
  }

  global.PMShell = { mount: mount, toast: toast, confirm: confirmDialog, NAV: NAV, esc: esc, dateStr: dateStr };
})(typeof window !== 'undefined' ? window : this);
