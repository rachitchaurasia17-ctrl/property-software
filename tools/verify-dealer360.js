#!/usr/bin/env node
/**
 * Dealer 360 backend verification (run AFTER applying
 * supabase/migrations/20260719_dealer360_analytics_draft.sql).
 *
 * Uses ONLY the publishable anon key — every check asserts that an
 * unauthenticated/non-admin caller is refused and that ingestion
 * validation works. Requires no secrets. Exit code 0 = all pass.
 *
 *   node tools/verify-dealer360.js
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node tools/verify-dealer360.js
 */

const URL = process.env.SUPABASE_URL || 'https://czmkfmkmgqlienmdihul.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DGqcs0JaDVgzImUGGgg_FQ_Q_SkgnhX';

async function call(path, body, method) {
  const res = await fetch(URL + path, {
    method: method || 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, message: (data && data.message) || '', data };
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

(async () => {
  // 1. admin read RPCs refuse anon
  for (const fn of [
    'plotmap_admin_dealer_360', 'plotmap_admin_property_stats',
    'plotmap_admin_dealer_events', 'plotmap_admin_platform_overview',
    'plotmap_rollup_daily_usage'
  ]) {
    const body = fn === 'plotmap_admin_platform_overview' || fn === 'plotmap_rollup_daily_usage'
      ? {} : { p_dealer_id: 'dealer-demo' };
    const r = await call('/rest/v1/rpc/' + fn, body);
    check(`${fn} refuses anon`, r.status === 400 && /platform admin required/i.test(r.message),
      `HTTP ${r.status} ${r.message}`);
  }

  // 2. rollup table not readable by anon
  const t = await call('/rest/v1/plotmap_daily_usage?limit=1', null, 'GET');
  check('plotmap_daily_usage denied to anon',
    t.status === 401 || t.status === 403 || t.status === 404 ||
    (t.status === 200 && Array.isArray(t.data) && t.data.length === 0),
    `HTTP ${t.status}`);

  // 3. ingestion: device gate fires BEFORE anything else (no oracle)
  const g = await call('/rest/v1/rpc/plotmap_record_device_presentation_event', {
    p_dealer_id: 'dealer-demo', p_device_token: 'not-a-real-token',
    p_session_id: 'verify', p_event_type: 'map_opened'
  });
  check('ingestion refuses unapproved device',
    g.status === 400 && /approved dealer device required/i.test(g.message),
    `HTTP ${g.status} ${g.message}`);

  // 4. event-name allowlist works (pure function, safe to call)
  const a1 = await call('/rest/v1/rpc/plotmap_event_name_allowed', { p_name: 'map_opened' });
  const a2 = await call('/rest/v1/rpc/plotmap_event_name_allowed', { p_name: 'totally_made_up' });
  check('allowlist accepts known name', a1.status === 200 && a1.data === true, JSON.stringify(a1.data));
  check('allowlist rejects unknown name', a2.status === 200 && a2.data === false, JSON.stringify(a2.data));

  // 5. legacy raw-event surfaces still locked down
  const legacy = await call('/rest/v1/presentation_events?limit=1', null, 'GET');
  check('presentation_events not readable by anon',
    legacy.status === 401 || legacy.status === 403 ||
    (legacy.status === 200 && Array.isArray(legacy.data) && legacy.data.length === 0),
    `HTTP ${legacy.status}`);

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) process.exit(1);
})().catch(err => { console.error('verification aborted:', err.message); process.exit(2); });
