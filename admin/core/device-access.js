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

  async function rpc(name, payload, authenticated) {
    let bearer = SUPABASE_KEY;
    if (authenticated && window.PMAuth && typeof window.PMAuth.getAccessToken === 'function') {
      bearer = await window.PMAuth.getAccessToken().catch(() => null) || SUPABASE_KEY;
    }
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + encodeURIComponent(name), {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + bearer,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    });
    if (res.status === 404) return { ok: false, status: 404, migrationMissing: true };
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json().catch(() => null) };
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
    const result = await rpc('plotmap_device_is_approved', {
      p_dealer_id: id,
      p_device_token: getToken()
    }, !!(options && options.authenticated));
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

  function renderBlocked(message) {
    const text = message || 'This device is not approved for this PlotMap workspace.';
    document.body.innerHTML = '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F5EFE2;color:#1C1E1B;font-family:Plus Jakarta Sans,Segoe UI,system-ui,sans-serif;padding:24px;">'
      + '<section style="max-width:540px;background:#FFFDF8;border:1px solid #E8DFC9;border-radius:20px;padding:32px;box-shadow:0 24px 52px rgba(120,90,30,.12);text-align:center;">'
      + '<div style="width:50px;height:50px;border-radius:16px;border:1px solid #D7C7A4;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;color:#1F5E47;font-weight:800;">PM</div>'
      + '<h1 style="font-family:Fraunces,Georgia,serif;font-weight:500;font-size:26px;margin:0 0 10px;">Device not approved</h1>'
      + '<p style="margin:0;color:#5F6B61;line-height:1.55;font-size:14.5px;">' + text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '</p>'
      + '<p style="margin:18px 0 0;color:#8A7C60;font-size:12.5px;">Open PlotMap on your approved dealer device, or activate this one from the main PlotMap page.</p>'
      + '</section></main>';
    document.documentElement.style.visibility = '';
  }

  // Gate a protected route. Read-only (isApproved) — never registers a device.
  async function requireApproved(dealerId, options) {
    const status = await isApproved(dealerId, options || {});
    if (status.ok) return status;
    if (options && options.render !== false) {
      const msg = status.migrationMissing
        ? 'PlotMap is not fully configured on this server yet. Contact your provider.'
        : ((options && options.message) || 'This device is not approved for this PlotMap workspace.');
      renderBlocked(msg);
    }
    return status;
  }

  window.PMDeviceAccess = { getToken, resolveDealerId, isApproved, getStatus, requireApproved, renderBlocked };
})();
