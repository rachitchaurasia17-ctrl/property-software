#!/usr/bin/env node
/*
 * PlotMap Phase 2 isolation verifier.
 *
 * Runs repeatable anon-key checks against a Supabase project:
 * - direct anon table access should be blocked
 * - dealer-scoped Client Presentation RPCs should still work
 *
 * Usage:
 *   PLOTMAP_SUPABASE_URL=https://your-project.supabase.co \
 *   PLOTMAP_SUPABASE_ANON_KEY=your-publishable-or-anon-key \
 *   PLOTMAP_DEVICE_TOKEN=approved-device-token \
 *   node tools/verify-isolation.js
 *
 * This script must never use a service-role key.
 */

const SUPABASE_URL = process.env.PLOTMAP_SUPABASE_URL;
const SUPABASE_KEY = process.env.PLOTMAP_SUPABASE_ANON_KEY;
const PRIMARY_DEALER_ID = process.env.PLOTMAP_PRIMARY_DEALER_ID || 'dealer-demo';
const OTHER_DEALER_ID = process.env.PLOTMAP_OTHER_DEALER_ID || 'dealer-b';
const DEVICE_TOKEN = process.env.PLOTMAP_DEVICE_TOKEN || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing PLOTMAP_SUPABASE_URL or PLOTMAP_SUPABASE_ANON_KEY.');
  process.exit(2);
}

if (/service[_-]?role/i.test(SUPABASE_KEY)) {
  console.error('Refusing to run with a key that looks like a service-role key.');
  process.exit(2);
}

async function fetchSupa(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + path, options);
  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text) };
  } catch (err) {
    return { status: res.status, ok: res.ok, data: text };
  }
}

function isBlockedStatus(status) {
  return status === 401 || status === 403 || status === 404;
}

function isBlockedRead(response) {
  return isBlockedStatus(response.status)
    || (response.status === 200 && Array.isArray(response.data) && response.data.length === 0);
}

function printCheck(label, pass, detail) {
  const marker = pass ? 'PASS' : 'FAIL';
  console.log(`${marker} ${label}${detail ? `: ${detail}` : ''}`);
  return pass;
}

async function expectBlocked(label, path, method = 'GET', body = null) {
  const res = await fetchSupa(path, method, body);
  const blocked = method === 'GET' ? isBlockedRead(res) : isBlockedStatus(res.status);
  return printCheck(label, blocked, `status ${res.status}`);
}

async function expectRpcDealerRows(label, rpcName, dealerId) {
  const body = { p_dealer_id: dealerId };
  if (DEVICE_TOKEN) body.p_device_token = DEVICE_TOKEN;
  const res = await fetchSupa(`/rest/v1/rpc/${rpcName}`, 'POST', body);
  const rows = Array.isArray(res.data) ? res.data : [];
  const isolated = rows.every(row => row && row.dealer_id === dealerId);
  return printCheck(
    `${label} (${dealerId})`,
    res.ok && isolated,
    `status ${res.status}, ${rows.length} row(s)`
  );
}

async function run() {
  const checks = [];

  console.log('--- PlotMap direct anon access checks ---');
  checks.push(await expectBlocked('anon cannot read client_safe_properties', '/rest/v1/client_safe_properties?select=*'));
  checks.push(await expectBlocked('anon cannot read prebuilt_maps', '/rest/v1/prebuilt_maps?select=*'));
  checks.push(await expectBlocked('anon cannot read map_overlays', '/rest/v1/map_overlays?select=*'));
  checks.push(await expectBlocked('anon cannot insert presentation_events directly', '/rest/v1/presentation_events', 'POST', {
    dealer_id: PRIMARY_DEALER_ID,
    session_id: 'phase2-direct-deny',
    event_type: 'presentation_opened'
  }));
  checks.push(await expectBlocked('anon cannot read crm_records', '/rest/v1/crm_records?select=*'));
  checks.push(await expectBlocked('anon cannot read dealer_settings', '/rest/v1/dealer_settings?select=*'));
  checks.push(await expectBlocked('anon cannot read share_links', '/rest/v1/share_links?select=*'));
  checks.push(await expectBlocked('anon cannot read audit_logs', '/rest/v1/audit_logs?select=*'));

  console.log('\n--- PlotMap dealer-scoped RPC checks ---');
  const suffix = DEVICE_TOKEN ? '_for_device' : '';
  checks.push(await expectRpcDealerRows('client properties RPC is dealer-scoped', `plotmap_client_properties${suffix}`, PRIMARY_DEALER_ID));
  checks.push(await expectRpcDealerRows('client maps RPC is dealer-scoped', `plotmap_client_maps${suffix}`, PRIMARY_DEALER_ID));
  checks.push(await expectRpcDealerRows('client overlays RPC is dealer-scoped', `plotmap_client_overlays${suffix}`, PRIMARY_DEALER_ID));

  const eventRpc = DEVICE_TOKEN
    ? 'plotmap_record_device_presentation_event'
    : 'plotmap_record_presentation_event';
  const eventBody = {
    p_dealer_id: OTHER_DEALER_ID,
    p_session_id: 'phase2-rpc-check',
    p_event_type: 'app_open'
  };
  if (DEVICE_TOKEN) {
    eventBody.p_device_token = DEVICE_TOKEN;
    eventBody.p_event_id = `phase2-cross-dealer-${Date.now().toString(36)}`;
  }
  const eventRes = await fetchSupa(`/rest/v1/rpc/${eventRpc}`, 'POST', eventBody);
  const eventSafe = DEVICE_TOKEN
    ? !eventRes.ok && eventRes.status < 500
    : eventRes.status < 500;
  checks.push(printCheck('presentation event RPC cannot bypass dealer scope', eventSafe, `status ${eventRes.status}`));

  const failed = checks.filter(Boolean).length !== checks.length;
  if (failed) process.exit(1);
}

run().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
