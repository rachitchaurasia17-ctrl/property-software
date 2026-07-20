(function (global) {
  'use strict';

  const FALLBACK = Object.freeze({
    url: 'https://czmkfmkmgqlienmdihul.supabase.co',
    key: 'sb_publishable_DGqcs0JaDVgzImUGGgg_FQ_Q_SkgnhX'
  });

  function isPublicKey(value) {
    const key = String(value || '').trim();
    if (!key || /sb_secret_|service[_-]?role/i.test(key)) return false;
    if (key.split('.').length === 3) {
      try {
        let encoded = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        encoded += '='.repeat((4 - (encoded.length % 4)) % 4);
        const payload = JSON.parse(global.atob(encoded));
        if (payload && payload.role === 'service_role') return false;
      } catch (_) {}
    }
    return true;
  }

  function isSupabaseUrl(value) {
    try {
      const parsed = new URL(String(value || '').trim());
      return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
    } catch (_) {
      return false;
    }
  }

  const runtimeEnv = global.env || {};
  const runtimeUrl = String(runtimeEnv.VITE_SUPABASE_URL || '').trim();
  const runtimeKey = String(runtimeEnv.VITE_SUPABASE_ANON_KEY || '').trim();
  const hasCompleteRuntimePair = Boolean(runtimeUrl && runtimeKey);
  const runtimePairIsSafe = hasCompleteRuntimePair && isSupabaseUrl(runtimeUrl) && isPublicKey(runtimeKey);
  const resolved = Object.freeze({
    url: runtimePairIsSafe ? runtimeUrl : FALLBACK.url,
    key: runtimePairIsSafe ? runtimeKey : FALLBACK.key,
    source: runtimePairIsSafe ? 'runtime' : 'fallback'
  });

  global.PMRuntimeConfig = Object.freeze({
    supabase: resolved,
    getSupabaseConfig: function () { return resolved; }
  });
})(window);
