/* PlotMap Private Client Links - authenticated dealer client. */
(function (global) {
  'use strict';

  var AUDIO_BUCKET = 'client-link-audio';
  var MAX_AUDIO_BYTES = 5 * 1024 * 1024;
  var AUDIO_TYPES = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'];

  var PENDING = Object.freeze({
    ok: false,
    pending: true,
    reason: 'backend_not_enabled',
    message: 'Private Client Links are not enabled for this environment yet.'
  });

  function isEnabled() {
    return global.PM_CLIENT_LINKS_ENABLED === true;
  }

  function validate(payload) {
    var errors = [];
    payload = payload || {};
    if (!Array.isArray(payload.propertyIds) || payload.propertyIds.length < 1) errors.push('Add at least one plot.');
    if (Array.isArray(payload.propertyIds) && payload.propertyIds.length > 4) errors.push('A client link can hold at most 4 plots.');
    if (payload.priceVisibility && ['hidden', 'shown'].indexOf(payload.priceVisibility) < 0) errors.push('Invalid price visibility.');
    if (payload.locationVisibility && ['area', 'exact', 'hidden'].indexOf(payload.locationVisibility) < 0) errors.push('Invalid location visibility.');
    if ([3, 7, 14, 30].indexOf(Number(payload.expiresInDays || 7)) < 0) errors.push('Invalid expiry.');
    return { ok: errors.length === 0, errors: errors };
  }

  function withDefaults(payload) {
    payload = payload || {};
    return {
      clientId: payload.clientId || null,
      propertyIds: (payload.propertyIds || []).slice(0, 4),
      photoSelections: payload.photoSelections || {},
      priceVisibility: payload.priceVisibility || 'hidden',
      locationVisibility: payload.locationVisibility || 'area',
      audio: payload.audio || null,
      expiresInDays: payload.expiresInDays == null ? 7 : Number(payload.expiresInDays)
    };
  }

  async function authContext() {
    if (!global.PMAuth) return null;
    var token = await global.PMAuth.getAccessToken().catch(function () { return null; });
    if (!token) return null;
    return {
      url: global.PMAuth.SUPABASE_URL,
      key: global.PMAuth.SUPABASE_KEY,
      token: token
    };
  }

  function safeFailure(status) {
    if (status === 401) return { ok: false, reason: 'session_expired', errors: ['Your session expired. Sign in again.'] };
    if (status === 403) return { ok: false, reason: 'not_allowed', errors: ['Your role cannot manage private links.'] };
    if (status === 404) return PENDING;
    return { ok: false, reason: 'request_failed', errors: ['Private link could not be completed.'] };
  }

  async function rpc(name, payload) {
    var ctx = await authContext();
    if (!ctx) return safeFailure(401);
    var response;
    try {
      response = await fetch(ctx.url + '/rest/v1/rpc/' + encodeURIComponent(name), {
        method: 'POST',
        headers: {
          apikey: ctx.key,
          Authorization: 'Bearer ' + ctx.token,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify(payload || {})
      });
    } catch (_) {
      return { ok: false, reason: 'network', errors: ['Check your connection and try again.'] };
    }
    if (!response.ok) return safeFailure(response.status);
    return response.json().catch(function () { return safeFailure(500); });
  }

  async function create(payload) {
    var full = withDefaults(payload);
    var checked = validate(full);
    if (!checked.ok) return { ok: false, reason: 'invalid', errors: checked.errors };
    if (!isEnabled()) return PENDING;
    var result = await rpc('plotmap_create_client_link', { p_payload: full });
    if (result && result.ok && result.url) {
      result.url = new URL(result.url, global.location.origin).toString();
    }
    return result;
  }

  async function list(propertyId) {
    if (!isEnabled()) return { ok: false, pending: true, links: [] };
    var rows = await rpc('plotmap_list_client_links', { p_property_id: propertyId || null });
    if (Array.isArray(rows)) return { ok: true, links: rows };
    return rows && rows.ok === false ? rows : { ok: true, links: [] };
  }

  async function revoke(id) {
    if (!isEnabled()) return PENDING;
    return rpc('plotmap_revoke_client_link', { p_link_id: id });
  }

  async function extend(id, days) {
    if (!isEnabled()) return PENDING;
    return rpc('plotmap_extend_client_link', { p_link_id: id, p_expires_in_days: Number(days || 7) });
  }

  function extensionFor(type) {
    return ({
      'audio/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'mp4',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav'
    })[type] || '';
  }

  async function uploadAudio(blob, seconds) {
    if (!isEnabled()) return PENDING;
    var mimeType = String(blob && blob.type || '').split(';')[0].toLowerCase();
    if (!blob || blob.size < 1 || blob.size > MAX_AUDIO_BYTES || AUDIO_TYPES.indexOf(mimeType) < 0) {
      return { ok: false, reason: 'invalid_audio', errors: ['Voice note must be under 5 MB and no longer than 2 minutes.'] };
    }
    seconds = Math.max(1, Math.min(120, Math.ceil(Number(seconds) || 0)));
    var ctx = await authContext();
    if (!ctx) return safeFailure(401);
    var profile = await global.PMAuth.getCurrentProfile().catch(function () { return null; });
    var dealerId = profile && profile.dealer_id;
    if (!dealerId || !/^[a-zA-Z0-9._-]{1,120}$/.test(dealerId)) return safeFailure(403);
    var randomId = global.crypto && global.crypto.randomUUID
      ? global.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    var path = 'dealers/' + dealerId + '/client-links/' + randomId + '.' + extensionFor(mimeType);
    var response;
    try {
      response = await fetch(ctx.url + '/storage/v1/object/' + AUDIO_BUCKET + '/' + path, {
        method: 'POST',
        headers: {
          apikey: ctx.key,
          Authorization: 'Bearer ' + ctx.token,
          'Content-Type': mimeType,
          'x-upsert': 'false'
        },
        body: blob
      });
    } catch (_) {
      return { ok: false, reason: 'network', errors: ['Voice note upload failed. Check your connection.'] };
    }
    if (!response.ok) return safeFailure(response.status);
    return { ok: true, objectPath: path, seconds: seconds };
  }

  async function removeAudio(path) {
    if (!path) return;
    var ctx = await authContext();
    if (!ctx) return;
    await fetch(ctx.url + '/storage/v1/object/' + AUDIO_BUCKET + '/' + path, {
      method: 'DELETE',
      headers: { apikey: ctx.key, Authorization: 'Bearer ' + ctx.token }
    }).catch(function () {});
  }

  global.PMClientLinks = {
    isEnabled: isEnabled,
    validate: validate,
    withDefaults: withDefaults,
    create: create,
    list: list,
    revoke: revoke,
    extend: extend,
    uploadAudio: uploadAudio,
    removeAudio: removeAudio,
    PENDING: PENDING
  };
})(typeof window !== 'undefined' ? window : this);
