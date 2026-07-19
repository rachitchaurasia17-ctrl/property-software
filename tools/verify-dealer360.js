#!/usr/bin/env node
/**
 * Repeatable Dealer 360 security verification.
 *
 * Default mode performs static checks against the draft migration and needs
 * no credentials. Live checks run only when SUPABASE_URL and
 * SUPABASE_ANON_KEY are explicitly provided after the migration is applied.
 * Optional DEALER360_STAFF_JWT + DEALER360_OTHER_DEALER_ID add a cross-dealer
 * authenticated check. Never provide a service-role key.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '20260719_dealer360_analytics_draft.sql');
const PHASE2_LOCKDOWN = path.join(ROOT, 'supabase', 'migrations', '20260707b_multi_dealer_anon_lockdown.sql');
const PHASE3_RLS = path.join(ROOT, 'supabase', 'migrations', '20260708_team_role_rls_enforcement.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');
const sqlWithoutComments = sql.replace(/--.*$/gm, '');
const phase2Sql = fs.readFileSync(PHASE2_LOCKDOWN, 'utf8');
const phase3Sql = fs.readFileSync(PHASE3_RLS, 'utf8');
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}

function bodyFor(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${escaped}\\b[\\s\\S]*?as\\s+\\$\\$([\\s\\S]*?)\\$\\$;`,
    'i'
  ));
  return match ? match[1] : '';
}

function hasAll(haystack, patterns) {
  return patterns.every(pattern => pattern.test(haystack));
}

function runStaticChecks() {
  check('migration file exists', fs.existsSync(MIGRATION), MIGRATION);
  check('no destructive data/schema SQL', !/(^|\n)\s*(drop\s+table|drop\s+database|delete\s+from|truncate\b)/i.test(sql));
  check('no broad RLS predicates', !/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(sqlWithoutComments));
  check('no service-role material',
    !/(service[_ -]?role|supabase_service)/i.test(sqlWithoutComments) &&
    !/sb_secret_[A-Za-z0-9_-]{20,}['"]/i.test(sqlWithoutComments));
  check('Phase 2 anon event lockdown remains present', hasAll(phase2Sql, [
    /revoke insert on public\.presentation_events from anon/i,
    /drop policy if exists "plotmap pevents public insert"/i,
    /drop policy if exists "plotmap pevents insert"/i
  ]));
  check('Phase 3 event reads remain own-dealer only', hasAll(phase3Sql, [
    /create policy "plotmap pevents member read"/i,
    /public\.plotmap_is_active_member\(\)/i,
    /dealer_id = public\.plotmap_current_dealer_id\(\)/i
  ]));
  check('Dealer 360 does not alter event RLS or device helper',
    !/(create|drop)\s+policy[\s\S]{0,100}presentation_events/i.test(sqlWithoutComments) &&
    !/create\s+or\s+replace\s+function\s+public\.plotmap_device_is_approved/i.test(sqlWithoutComments));

  const adminFunctions = [
    'plotmap_rollup_daily_usage',
    'plotmap_admin_dealer_events',
    'plotmap_admin_property_stats',
    'plotmap_admin_dealer_360',
    'plotmap_admin_platform_overview'
  ];
  for (const name of adminFunctions) {
    const body = bodyFor(name);
    check(`${name} exists`, !!body);
    check(`${name} enforces platform admin`, /if\s+not\s+public\.plotmap_is_platform_admin\(\)/i.test(body));
  }

  const deviceBody = bodyFor('plotmap_record_device_presentation_event');
  const staffBody = bodyFor('plotmap_record_presentation_event');
  check('device ingestion keeps approved-device gate first',
    deviceBody.indexOf('plotmap_device_is_approved') >= 0 &&
    deviceBody.indexOf('plotmap_device_is_approved') < deviceBody.indexOf('plotmap_event_name_allowed'));
  check('staff ingestion enforces own dealer and active account', hasAll(staffBody, [
    /p\.id\s*=\s*auth\.uid\(\)/i,
    /p\.dealer_id\s*=\s*p_dealer_id/i,
    /p\.status\s*=\s*'active'/i,
    /plotmap_dealer_is_active\(p_dealer_id\)/i
  ]));
  check('event names are server allowlisted',
    /plotmap_event_name_allowed/i.test(sql) && /raise exception 'unknown event type'/i.test(sql));
  check('metadata is object-only, capped and server-sanitized', hasAll(sql, [
    /metadata must be an object/i,
    /octet_length\(v_input::text\)\s*>\s*2048/i,
    /plotmap_sanitize_event_metadata/i,
    /add constraint presentation_events_metadata_guard/i,
    /\) not valid;/i
  ]));
  check('credential-shaped metadata is rejected', hasAll(sql, [
    /token\|passcode\|activationcode\|accesscode/i,
    /sensitive analytics metadata rejected/i,
    /sb_secret_/i,
    /\[0-9\]\{8\}/i
  ]));
  check('rate cap uses server ingestion time and serial lock', hasAll(sql, [
    /add column if not exists ingested_at timestamptz/i,
    /pg_advisory_xact_lock/i,
    /e\.ingested_at\s*>=\s*v_now\s*-\s*interval '15 minutes'/i,
    /presentation_events_dealer_ingested_idx/i
  ]));
  check('duplicate event replay is idempotent', hasAll(deviceBody, [
    /where e\.id\s*=\s*v_event_id\s+and e\.dealer_id\s*=\s*p_dealer_id/i,
    /on conflict \(id\) do nothing/i
  ]));
  check('daily rollup is deny-all and bounded', hasAll(sql, [
    /alter table public\.plotmap_daily_usage enable row level security/i,
    /revoke all on public\.plotmap_daily_usage from public, anon, authenticated/i,
    /least\(greatest\(coalesce\(p_days, 7\), 1\), 365\)/i,
    /with filtered as materialized/i
  ]));
  check('timeline uses stable timestamp plus id cursor', hasAll(sql, [
    /p_before_id text default null/i,
    /e\.created_at = p_before and e\.id < p_before_id/i,
    /order by e\.created_at desc, e\.id desc/i,
    /presentation_events_dealer_cursor_idx/i
  ]));
  check('analytics indexes cover rate, cursor and recent aggregates', hasAll(sql, [
    /presentation_events_dealer_ingested_idx/i,
    /presentation_events_dealer_cursor_idx/i,
    /presentation_events_recent_analytics_idx/i,
    /presentation_events_type_analytics_idx/i
  ]));
  check('admin RPC execution is authenticated-only', adminFunctions.every(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`revoke all on function public\\.${escaped}[\\s\\S]*?from public, anon, authenticated;[\\s\\S]*?grant execute on function public\\.${escaped}[\\s\\S]*?to authenticated;`, 'i').test(sql);
  }));
}

async function call(baseUrl, anonKey, pathname, body, options = {}) {
  const bearer = options.bearer || anonKey;
  const method = options.method || 'POST';
  const res = await fetch(baseUrl + pathname, {
    method,
    headers: { apikey: anonKey, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, message: (data && (data.message || data.error_description)) || '', data };
}

async function runLiveChecks() {
  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!baseUrl || !anonKey) {
    console.log('\nSKIP  live checks (set SUPABASE_URL and SUPABASE_ANON_KEY after applying the draft).');
    return;
  }
  if (/service[_-]?role|sb_secret_/i.test(anonKey)) {
    throw new Error('Refusing to run: SUPABASE_ANON_KEY appears to be a secret/service-role key.');
  }

  for (const [fn, body] of [
    ['plotmap_admin_dealer_360', { p_dealer_id: 'dealer-demo' }],
    ['plotmap_admin_property_stats', { p_dealer_id: 'dealer-demo' }],
    ['plotmap_admin_dealer_events', { p_dealer_id: 'dealer-demo' }],
    ['plotmap_admin_platform_overview', {}],
    ['plotmap_rollup_daily_usage', {}]
  ]) {
    const result = await call(baseUrl, anonKey, '/rest/v1/rpc/' + fn, body);
    check(`${fn} refuses anon live`, result.status === 400 && /platform admin required/i.test(result.message),
      `HTTP ${result.status} ${result.message}`);
  }

  const table = await call(baseUrl, anonKey, '/rest/v1/plotmap_daily_usage?limit=1', null, { method: 'GET' });
  check('plotmap_daily_usage returns no anon rows live',
    table.status === 401 || table.status === 403 || table.status === 404 ||
      (table.status === 200 && Array.isArray(table.data) && table.data.length === 0),
    `HTTP ${table.status}`);

  const rawEvents = await call(baseUrl, anonKey, '/rest/v1/presentation_events?limit=1', null, { method: 'GET' });
  check('presentation_events returns no anon rows live',
    rawEvents.status === 401 || rawEvents.status === 403 || rawEvents.status === 404 ||
      (rawEvents.status === 200 && Array.isArray(rawEvents.data) && rawEvents.data.length === 0),
    `HTTP ${rawEvents.status}`);

  const gate = await call(baseUrl, anonKey, '/rest/v1/rpc/plotmap_record_device_presentation_event', {
    p_dealer_id: 'dealer-demo', p_device_token: 'not-a-real-token',
    p_session_id: 'verify', p_event_type: 'map_opened'
  });
  check('device ingestion refuses an unapproved token live',
    gate.status === 400 && /approved dealer device required/i.test(gate.message),
    `HTTP ${gate.status} ${gate.message}`);

  const staffJwt = process.env.DEALER360_STAFF_JWT || '';
  const otherDealer = process.env.DEALER360_OTHER_DEALER_ID || '';
  if (staffJwt && otherDealer) {
    const cross = await call(baseUrl, anonKey, '/rest/v1/rpc/plotmap_record_presentation_event', {
      p_dealer_id: otherDealer,
      p_session_id: 'dealer360-cross-dealer-check',
      p_event_type: 'app_open',
      p_event_id: 'pevt-cross-dealer-verification'
    }, { bearer: staffJwt });
    check('authenticated staff cannot inject another dealer live',
      cross.status === 400 && /staff profile for this dealer required/i.test(cross.message),
      `HTTP ${cross.status} ${cross.message}`);
  } else {
    console.log('SKIP  authenticated cross-dealer live check (set DEALER360_STAFF_JWT and DEALER360_OTHER_DEALER_ID).');
  }
}

(async () => {
  runStaticChecks();
  await runLiveChecks();
  const failed = checks.filter(item => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) process.exit(1);
})().catch(err => {
  console.error('verification aborted:', err.message);
  process.exit(2);
});
