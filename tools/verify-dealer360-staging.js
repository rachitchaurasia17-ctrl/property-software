#!/usr/bin/env node
/**
 * Destructive-to-fixtures, staging-only Dealer 360 live verification.
 * It creates two analytics events through RPCs and runs the daily rollup.
 * It never uses or accepts a service-role key.
 */

const STAGING_URL = String(process.env.SUPABASE_STAGING_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.SUPABASE_STAGING_ANON_KEY || '';
const CONFIRM = process.env.DEALER360_STAGING_CONFIRM || '';
const ADMIN_EMAIL = process.env.DEALER360_STAGING_ADMIN_EMAIL || 'plotmap.platform.staging@example.com';
const ADMIN_PASSWORD = process.env.DEALER360_STAGING_ADMIN_PASSWORD || '';
const DEALER_A_EMAIL = process.env.DEALER360_STAGING_DEALER_A_EMAIL || 'plotmap.dealer-a.staging@example.com';
const DEALER_A_PASSWORD = process.env.DEALER360_STAGING_DEALER_A_PASSWORD || '';
const DEALER_B_EMAIL = process.env.DEALER360_STAGING_DEALER_B_EMAIL || 'plotmap.dealer-b.staging@example.com';
const DEALER_B_PASSWORD = process.env.DEALER360_STAGING_DEALER_B_PASSWORD || '';
const DEALER_A = 'dealer-staging-a';
const DEALER_B = 'dealer-staging-b';
const DEVICE_A = process.env.DEALER360_STAGING_DEVICE_A || 'plotmap-staging-device-a-00000000000000000001';
const DEVICE_B = process.env.DEALER360_STAGING_DEVICE_B || 'plotmap-staging-device-b-00000000000000000002';
const PRODUCTION_PROJECT_REF = 'czmkfmkmgqlienmdihul';

const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}

function requireSafeStagingConfig() {
  if (CONFIRM !== 'staging-only') throw new Error('Set DEALER360_STAGING_CONFIRM=staging-only.');
  if (!STAGING_URL || !ANON_KEY) throw new Error('SUPABASE_STAGING_URL and SUPABASE_STAGING_ANON_KEY are required.');
  if (STAGING_URL.includes(PRODUCTION_PROJECT_REF)) throw new Error('Refusing to run against the known production Supabase project.');
  if (/service[_-]?role|sb_secret_/i.test(ANON_KEY)) throw new Error('Refusing a secret/service-role key. Use the staging publishable anon key.');
  if (!ADMIN_PASSWORD || !DEALER_A_PASSWORD || !DEALER_B_PASSWORD) {
    throw new Error('All three DEALER360_STAGING_*_PASSWORD variables are required.');
  }
}

async function request(path, options = {}) {
  const started = Date.now();
  const headers = Object.assign({ apikey: ANON_KEY, 'Content-Type': 'application/json' }, options.headers || {});
  if (options.bearer) headers.Authorization = 'Bearer ' + options.bearer;
  else headers.Authorization = 'Bearer ' + ANON_KEY;
  const response = await fetch(STAGING_URL + path, {
    method: options.method || 'POST',
    headers,
    body: options.method === 'GET' ? undefined : JSON.stringify(options.body || {})
  });
  const data = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    ms: Date.now() - started,
    data,
    message: data && (data.message || data.error_description || data.msg) || ''
  };
}

async function signIn(email, password) {
  const result = await request('/auth/v1/token?grant_type=password', {
    body: { email, password }
  });
  if (!result.ok || !result.data || !result.data.access_token) {
    throw new Error(`Staging sign-in failed for ${email}: HTTP ${result.status} ${result.message}`);
  }
  return result.data.access_token;
}

function rpc(name, body, bearer) {
  return request('/rest/v1/rpc/' + encodeURIComponent(name), { body, bearer });
}

function denied(result, pattern) {
  return result.status === 400 && pattern.test(result.message || '');
}

function anonDenied(result) {
  return result.status === 401 || result.status === 403 || result.status === 404 ||
    (result.status === 400 && /platform admin required|permission denied/i.test(result.message || ''));
}

async function run() {
  requireSafeStagingConfig();
  console.log('Target:', new URL(STAGING_URL).host, '(staging confirmation accepted)');

  const [adminJwt, dealerAJwt, dealerBJwt] = await Promise.all([
    signIn(ADMIN_EMAIL, ADMIN_PASSWORD),
    signIn(DEALER_A_EMAIL, DEALER_A_PASSWORD),
    signIn(DEALER_B_EMAIL, DEALER_B_PASSWORD)
  ]);
  check('all staging Auth users sign in', true);

  const anonOverview = await rpc('plotmap_admin_platform_overview', {}, null);
  check('anon cannot read platform analytics', anonDenied(anonOverview),
    `HTTP ${anonOverview.status}`);

  const dealerOverview = await rpc('plotmap_admin_platform_overview', {}, dealerAJwt);
  check('normal dealer cannot read platform analytics', denied(dealerOverview, /platform admin required/i),
    `HTTP ${dealerOverview.status}`);

  const adminOverview = await rpc('plotmap_admin_platform_overview', {}, adminJwt);
  check('platform admin can read platform overview', adminOverview.ok && adminOverview.data && Number(adminOverview.data.dealers) >= 3,
    `HTTP ${adminOverview.status}, ${adminOverview.ms}ms`);

  const admin360 = await rpc('plotmap_admin_dealer_360', { p_dealer_id: DEALER_A }, adminJwt);
  check('platform admin can read Dealer A 360', admin360.ok && admin360.data && admin360.data.account,
    `HTTP ${admin360.status}, ${admin360.ms}ms`);

  const propertyStats = await rpc('plotmap_admin_property_stats', { p_dealer_id: DEALER_A }, adminJwt);
  check('Dealer A property stats use seeded data', propertyStats.ok && Number(propertyStats.data && propertyStats.data.total) >= 1,
    `HTTP ${propertyStats.status}`);

  const crossDealer = await rpc('plotmap_record_presentation_event', {
    p_dealer_id: DEALER_B,
    p_session_id: 'staging-cross-dealer',
    p_event_type: 'app_open',
    p_event_id: 'pevt-staging-cross-dealer-rejected'
  }, dealerAJwt);
  check('Dealer A cannot inject Dealer B events', denied(crossDealer, /staff profile for this dealer required/i),
    `HTTP ${crossDealer.status} ${crossDealer.message}`);

  const suspendedStaff = await rpc('plotmap_record_presentation_event', {
    p_dealer_id: DEALER_B,
    p_session_id: 'staging-suspended-staff',
    p_event_type: 'app_open',
    p_event_id: 'pevt-staging-suspended-staff-rejected'
  }, dealerBJwt);
  check('suspended Dealer B staff ingestion is rejected', denied(suspendedStaff, /unknown or inactive dealer/i),
    `HTTP ${suspendedStaff.status} ${suspendedStaff.message}`);

  const suspendedDevice = await rpc('plotmap_record_device_presentation_event', {
    p_dealer_id: DEALER_B,
    p_device_token: DEVICE_B,
    p_session_id: 'staging-suspended-device',
    p_event_type: 'app_open',
    p_event_id: 'pevt-staging-suspended-device-rejected'
  }, null);
  check('suspended Dealer B approved device is rejected', denied(suspendedDevice, /approved dealer device required/i),
    `HTTP ${suspendedDevice.status} ${suspendedDevice.message}`);

  const secretMetadata = await rpc('plotmap_record_device_presentation_event', {
    p_dealer_id: DEALER_A,
    p_device_token: DEVICE_A,
    p_session_id: 'staging-secret-rejection',
    p_event_type: 'map_opened',
    p_event_id: 'pevt-staging-secret-rejected',
    p_metadata: { access_token: 'Bearer staging-credential-value-that-must-never-persist' }
  }, null);
  check('credential metadata is rejected', denied(secretMetadata, /sensitive analytics metadata rejected/i),
    `HTTP ${secretMetadata.status} ${secretMetadata.message}`);

  const unknownEvent = await rpc('plotmap_record_device_presentation_event', {
    p_dealer_id: DEALER_A,
    p_device_token: DEVICE_A,
    p_session_id: 'staging-unknown-event',
    p_event_type: 'not_allowlisted',
    p_event_id: 'pevt-staging-unknown-rejected'
  }, null);
  check('unknown event type is rejected', denied(unknownEvent, /unknown event type/i),
    `HTTP ${unknownEvent.status} ${unknownEvent.message}`);

  const duplicateId = 'pevt-staging-dedupe-' + Date.now();
  const duplicateBody = {
    p_dealer_id: DEALER_A,
    p_device_token: DEVICE_A,
    p_session_id: 'staging-dedupe-session',
    p_event_type: 'map_opened',
    p_map_id: 'staging-map-a',
    p_event_id: duplicateId,
    p_metadata: { source: 'client_presentation', view: 'masterplan' }
  };
  const duplicateFirst = await rpc('plotmap_record_device_presentation_event', duplicateBody, null);
  const duplicateSecond = await rpc('plotmap_record_device_presentation_event', duplicateBody, null);
  check('duplicate event RPC calls both succeed', duplicateFirst.ok && duplicateSecond.ok,
    `HTTP ${duplicateFirst.status}/${duplicateSecond.status}`);

  const duplicateRows = await rpc('plotmap_admin_dealer_events', {
    p_dealer_id: DEALER_A,
    p_before: null,
    p_limit: 200,
    p_types: ['map_opened'],
    p_before_id: null
  }, adminJwt);
  const duplicateCount = Array.isArray(duplicateRows.data)
    ? duplicateRows.data.filter(row => row.id === duplicateId).length
    : 0;
  check('duplicate event is stored exactly once', duplicateRows.ok && duplicateCount === 1,
    `count ${duplicateCount}`);

  const page1 = await rpc('plotmap_admin_dealer_events', {
    p_dealer_id: DEALER_A,
    p_before: null,
    p_limit: 50,
    p_types: ['area_viewed'],
    p_before_id: null
  }, adminJwt);
  const rows1 = Array.isArray(page1.data) ? page1.data : [];
  const cursor = rows1[rows1.length - 1];
  const page2 = cursor ? await rpc('plotmap_admin_dealer_events', {
    p_dealer_id: DEALER_A,
    p_before: cursor.created_at,
    p_limit: 50,
    p_types: ['area_viewed'],
    p_before_id: cursor.id
  }, adminJwt) : { ok: false, data: [], status: 0 };
  const rows2 = Array.isArray(page2.data) ? page2.data : [];
  const firstIds = new Set(rows1.map(row => row.id));
  const overlap = rows2.filter(row => firstIds.has(row.id)).length;
  check('stable cursor pagination returns all equal-timestamp fixtures',
    page1.ok && page2.ok && rows1.length === 50 && rows2.length === 10 && overlap === 0,
    `pages ${rows1.length}+${rows2.length}, overlap ${overlap}`);

  const rollup = await rpc('plotmap_rollup_daily_usage', { p_days: 7 }, adminJwt);
  check('platform admin can run daily rollup', rollup.ok && rollup.data !== null && Number.isInteger(Number(rollup.data)),
    `HTTP ${rollup.status}, ${rollup.ms}ms, rows ${rollup.data}`);

  const anonEvents = await request('/rest/v1/presentation_events?limit=1', { method: 'GET' });
  check('anon cannot read raw presentation events',
    anonEvents.status === 401 || anonEvents.status === 403 ||
      (anonEvents.status === 200 && Array.isArray(anonEvents.data) && anonEvents.data.length === 0),
    `HTTP ${anonEvents.status}`);

  const anonRollups = await request('/rest/v1/plotmap_daily_usage?limit=1', { method: 'GET' });
  check('anon cannot read daily rollups',
    anonRollups.status === 401 || anonRollups.status === 403 ||
      (anonRollups.status === 200 && Array.isArray(anonRollups.data) && anonRollups.data.length === 0),
    `HTTP ${anonRollups.status}`);

  const failed = checks.filter(item => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} staging checks passed.`);
  if (failed.length) process.exit(1);
}

run().catch(error => {
  console.error('STAGING VERIFICATION BLOCKED:', error.message);
  process.exit(2);
});
