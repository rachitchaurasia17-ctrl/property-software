// PlotMap approved-device helper.
// Stores only an opaque per-browser token locally. Supabase stores and
// compares only crypt() hashes through SECURITY DEFINER RPCs.
(function () {
  const runtimeSupabase = window.PMRuntimeConfig && window.PMRuntimeConfig.getSupabaseConfig();
  const SUPABASE_URL = runtimeSupabase && runtimeSupabase.url;
  const SUPABASE_KEY = runtimeSupabase && runtimeSupabase.key;
  const TOKEN_KEY = 'plotmap_device_token_v1';

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getToken() {
    let token = '';
    try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (err) {}
    if (token && token.length >= 32) return token;
    const bytes = new Uint8Array(32);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    token = bytesToHex(bytes);
    try { localStorage.setItem(TOKEN_KEY, token); } catch (err) {}
    return token;
  }

  // The dealer binding comes ONLY from local storage (written when the device
  // was activated/approved or from the signed-in profile). It is never taken
  // from the URL: a link alone must grant no access, and reading ?dealerId
  // would let a shared URL silently register/steer a device.
  function resolveDealerId(fallback) {
    try {
      const stored = localStorage.getItem('plotmap_dealer_id');
      if (stored) return stored;
    } catch (err) {}
    return fallback || '';
  }

  function browserInfo() {
    return String(navigator.userAgent || '').slice(0, 220);
  }

  async function callRpc(name, payload, bearer) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + encodeURIComponent(name), {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + (bearer || SUPABASE_KEY),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    });
    if (res.status === 404) return { ok: false, status: 404, migrationMissing: true };
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json().catch(() => null) };
  }

  // Legacy device-status callers may request an authenticated attempt. A stale
  // JWT is allowed to fall back to anon because this RPC is explicitly granted
  // to anon and compares only server-side hashes.
  async function rpc(name, payload, authenticated) {
    if (authenticated && window.PMAuth && typeof window.PMAuth.getAccessToken === 'function') {
      const token = await window.PMAuth.getAccessToken().catch(() => null);
      if (token) {
        const authed = await callRpc(name, payload, token);
        if (authed.ok || (authed.status !== 401 && authed.status !== 403)) return authed;
        // JWT was rejected — fall through to the anon retry below.
      }
    }
    return callRpc(name, payload, SUPABASE_KEY);
  }

  // Read-only approval check used to GATE protected routes. Calls
  // plotmap_device_is_approved, which never inserts a row — so merely loading
  // a page (or opening a shared link) can never register a pending device.
  // Pending requests are created ONLY through the explicit activation flow
  // (plotmap_submit_activation_request). Returns { ok, statusText } where
  // statusText is 'approved' | 'unapproved' | 'no_dealer' | 'migration_required' | 'error'.
  async function isApproved(dealerId, options) {
    const id = dealerId || resolveDealerId('');
    if (!id) return { ok: false, statusText: 'no_dealer', dealerId: '' };
    // Approval is always anon-direct. A stale dealer JWT can therefore never
    // block the server-side token hash check before the RPC runs.
    void (options && options.authenticated);
    const result = await callRpc('plotmap_device_is_approved', {
      p_dealer_id: id,
      p_device_token: getToken()
    }, SUPABASE_KEY);
    if (!result.ok) {
      return { ok: false, dealerId: id, statusText: result.migrationMissing ? 'migration_required' : 'error', migrationMissing: !!result.migrationMissing };
    }
    const approved = result.data === true;
    return { ok: approved, dealerId: id, statusText: approved ? 'approved' : 'unapproved' };
  }

  // Detailed status (may INSERT a pending row) — kept for the developer/admin
  // side only. Not used by the read-only route gate.
  async function getStatus(dealerId, options) {
    const id = dealerId || resolveDealerId('');
    if (!id) return { ok: false, statusText: 'no_dealer', dealerId: '' };
    const result = await rpc('plotmap_device_status', {
      p_dealer_id: id,
      p_device_token: getToken(),
      p_device_label: (options && options.deviceLabel) || '',
      p_browser_info: browserInfo()
    }, !!(options && options.authenticated));
    if (!result.ok) {
      return { ok: false, dealerId: id, statusText: result.migrationMissing ? 'migration_required' : 'error', migrationMissing: !!result.migrationMissing };
    }
    const row = Array.isArray(result.data) ? result.data[0] : null;
    const statusText = row && row.status ? row.status : 'unknown';
    return { ok: statusText === 'approved', dealerId: (row && row.dealer_id) || id, statusText };
  }

  // Read-only reason lookup. Unlike the legacy plotmap_device_status RPC,
  // this never creates a pending device row. Account state is returned only
  // when the caller possesses a token already stored for this dealer.
  async function getAccessReason(dealerId) {
    const id = dealerId || resolveDealerId('');
    if (!id) return { ok: false, dealerId: '', statusText: 'device_not_activated' };
    const result = await callRpc('plotmap_device_access_reason', {
      p_dealer_id: id,
      p_device_token: getToken()
    }, SUPABASE_KEY);
    if (!result.ok) {
      return {
        ok: false,
        dealerId: id,
        statusText: result.migrationMissing ? 'migration_required' : 'device_not_activated',
        migrationMissing: !!result.migrationMissing
      };
    }
    const statusText = typeof result.data === 'string' ? result.data : 'device_not_activated';
    return { ok: statusText === 'approved', dealerId: id, statusText };
  }

  // Reason keys → { title, body }. Falls back to a literal message for any
  // string that isn't a known key (back-compat with earlier callers).
  // Single source of reason copy, shared with the access-expired screen and
  // the guard. Titles/messages match the product spec exactly.
  function blockCopy(reasonOrMessage) {
    switch (reasonOrMessage) {
      case 'device_revoked':
        return { title: 'Device access revoked', body: 'Access for this browser has been removed.', action: 'Enter a new activation code' };
      case 'device_limit_reached':
        return { title: 'Device limit reached', body: 'This account has reached its approved-device limit. An existing device must be removed or the limit increased.', action: 'Back to PlotMap' };
      case 'trial_expired':
        return { title: 'Trial expired', body: 'Your PlotMap trial has ended. Contact your PlotMap provider to continue.', action: 'Back to PlotMap' };
      case 'account_suspended':
        return { title: 'Account suspended', body: 'This PlotMap account is currently inactive. Contact your PlotMap provider.', action: 'Back to PlotMap' };
      case 'account_blocked':
        // Used when the server only tells us the account is inactive without
        // saying suspended-vs-trial. Never implies "trial expired" wrongly.
        return { title: 'Account not active', body: 'This PlotMap account is suspended or its trial has ended. Contact your PlotMap provider to continue.', action: 'Back to PlotMap' };
      case 'migration_required':
        return { title: 'PlotMap not configured', body: 'PlotMap is not fully configured on this server yet. Contact your provider.', action: 'Back to PlotMap' };
      case 'device_not_approved':
      case 'device_not_activated':
      case undefined:
      case null:
      case '':
        return { title: 'Device not activated', body: 'This browser has not been activated for this PlotMap account.', action: 'Enter activation code' };
      default:
        return { title: 'Device not approved', body: String(reasonOrMessage), action: 'Back to PlotMap' };
    }
  }

  function renderBlocked(reasonOrMessage) {
    const copy = blockCopy(reasonOrMessage);
    const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    document.body.innerHTML = '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F5EFE2;color:#1C1E1B;font-family:Plus Jakarta Sans,Segoe UI,system-ui,sans-serif;padding:24px;">'
      + '<section style="max-width:540px;background:#FFFDF8;border:1px solid #E8DFC9;border-radius:20px;padding:32px;box-shadow:0 24px 52px rgba(120,90,30,.12);text-align:center;">'
      + '<div style="width:50px;height:50px;border-radius:16px;border:1px solid #D7C7A4;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;color:#1F5E47;font-weight:800;">PM</div>'
      + '<h1 style="font-family:Fraunces,Georgia,serif;font-weight:500;font-size:26px;margin:0 0 10px;">' + esc(copy.title) + '</h1>'
      + '<p style="margin:0;color:#5F6B61;line-height:1.55;font-size:14.5px;">' + esc(copy.body) + '</p>'
      + '<p style="margin:20px 0 0;"><a href="/" style="font-weight:700;color:#1F5E47;text-decoration:none;font-size:14px;">' + esc(copy.action || 'Back to PlotMap') + ' →</a></p>'
      + '</section></main>';
    document.documentElement.style.visibility = '';
  }

  // Gate a protected route. Read-only (isApproved) — never registers a device.
  // On a block, resolve the precise reason without registering a device or
  // creating a legacy pending request.
  async function requireApproved(dealerId, options) {
    const status = await isApproved(dealerId, options || {});
    if (status.ok) return status;
    // Enrich the block reason when the plain gate only said 'unapproved'.
    if (status.statusText === 'unapproved' && !(options && options.skipReasonLookup)) {
      const detail = await getAccessReason(dealerId).catch(() => null);
      if (detail && detail.statusText) status.statusText = detail.statusText;
    }
    if (options && options.render !== false) {
      // Map the resolved status to a reason key so the block screen names the
      // real cause. 'blocked' from device_status means the dealer account is
      // inactive; 'revoked'/'rejected' are device-level; everything else is
      // "not activated yet".
      const reason = status.migrationMissing ? 'migration_required'
        : status.statusText === 'trial_expired' ? 'trial_expired'
        : status.statusText === 'account_suspended' ? 'account_suspended'
        : status.statusText === 'account_blocked' ? 'account_blocked'
        : status.statusText === 'device_revoked' ? 'device_revoked'
        : 'device_not_approved';
      renderBlocked((options && options.message) || reason);
    }
    return status;
  }

  window.PMDeviceAccess = { getToken, resolveDealerId, isApproved, getStatus, getAccessReason, requireApproved, renderBlocked };
})();
