// PlotMap approved-device helper.
// Stores only an opaque per-browser token locally. Supabase stores and
// compares only crypt() hashes through SECURITY DEFINER RPCs.
(function () {
  const SUPABASE_URL = (window.PMAuth && window.PMAuth.SUPABASE_URL) || 'https://czmkfmkmgqlienmdihul.supabase.co';
  const SUPABASE_KEY = (window.PMAuth && window.PMAuth.SUPABASE_KEY) || 'sb_publishable_DGqcs0JaDVgzImUGGgg_FQ_Q_SkgnhX';
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

  function resolveDealerId(fallback) {
    try {
      const params = new URLSearchParams(location.search || '');
      const explicit = params.get('dealerId') || params.get('dealer');
      if (explicit) {
        localStorage.setItem('plotmap_dealer_id', explicit);
        return explicit;
      }
    } catch (err) {}
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

  async function getStatus(dealerId, options) {
    const id = dealerId || resolveDealerId('dealer-demo');
    if (!id) return { ok: false, statusText: 'unknown', dealerId: '' };
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
    const text = message || 'Device approval required. This PlotMap workspace is available only on an approved dealer device.';
    document.body.innerHTML = '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F5EFE2;color:#1C1E1B;font-family:Plus Jakarta Sans,Segoe UI,system-ui,sans-serif;padding:24px;">'
      + '<section style="max-width:540px;background:#FFFDF8;border:1px solid #E8DFC9;border-radius:20px;padding:32px;box-shadow:0 24px 52px rgba(120,90,30,.12);text-align:center;">'
      + '<div style="width:50px;height:50px;border-radius:16px;border:1px solid #D7C7A4;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;color:#1F5E47;font-weight:800;">PM</div>'
      + '<h1 style="font-family:Fraunces,Georgia,serif;font-weight:500;font-size:26px;margin:0 0 10px;">Device approval required</h1>'
      + '<p style="margin:0;color:#5F6B61;line-height:1.55;font-size:14.5px;">' + text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '</p>'
      + '<p style="margin:18px 0 0;color:#8A7C60;font-size:12.5px;">Open PlotMap on your registered dealer laptop, or ask the developer to approve this device.</p>'
      + '</section></main>';
    document.documentElement.style.visibility = '';
  }

  async function requireApproved(dealerId, options) {
    const status = await getStatus(dealerId, options || {});
    if (status.ok) return status;
    if (options && options.render !== false) {
      const msg = status.migrationMissing
        ? 'Developer control migration required before device-locked access can open.'
        : ((options && options.message) || 'This PlotMap presentation is available only on an approved dealer device.');
      renderBlocked(msg);
    }
    return status;
  }

  window.PMDeviceAccess = { getToken, resolveDealerId, getStatus, requireApproved, renderBlocked };
})();
