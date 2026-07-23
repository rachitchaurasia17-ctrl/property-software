#!/usr/bin/env node
/**
 * Staging-only verification for onboarding access reasons and permanent
 * dealer deletion. Secrets are loaded from the ignored staging env file and
 * are never printed. The disposable dealer is removed before exit.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.dealer360-staging.local');
const LINK_FILE = path.join(ROOT, 'supabase', '.temp', 'project-ref');
const STAGING_REF = 'rhmimpcirjbksjmhludg';
const PRODUCTION_REF = 'czmkfmkmgqlienmdihul';
const PREVIEW_ORIGIN = 'https://xyz-bmr8nc57g-rachitchaurasia17-4865s-projects.vercel.app';
const checks = [];
let verifierAdminUserId = '';

function command(name, args) {
  return spawnSync(name, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false });
}

function parseEnv(source) {
  const out = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('=');
    if (split < 1) continue;
    let value = line.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, split).trim()] = value;
  }
  return out;
}

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

function abort(message) {
  throw new Error(message);
}

const ignored = command('git', ['check-ignore', '-q', '--', '.env.dealer360-staging.local']);
const tracked = command('git', ['ls-files', '--error-unmatch', '--', '.env.dealer360-staging.local']);
if (ignored.status !== 0 || tracked.status === 0 || !fs.existsSync(ENV_FILE)) {
  abort('private staging environment is not safely ignored and untracked');
}

const env = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
const required = [
  'SUPABASE_PROJECT_REF', 'SUPABASE_STAGING_URL', 'SUPABASE_STAGING_PUBLISHABLE_KEY',
  'SUPABASE_STAGING_SECRET_KEY', 'PLATFORM_ADMIN_EMAIL', 'PLATFORM_ADMIN_PASSWORD',
  'DEALER_A_EMAIL', 'DEALER_A_PASSWORD', 'DEALER360_STAGING_CONFIRM'
];
if (required.some(name => !env[name]) || env.DEALER360_STAGING_CONFIRM !== 'staging-only') {
  abort('required staging setting is missing');
}

const BASE_URL = String(env.SUPABASE_STAGING_URL).replace(/\/$/, '');
const ANON_KEY = env.SUPABASE_STAGING_PUBLISHABLE_KEY;
const SECRET_KEY = env.SUPABASE_STAGING_SECRET_KEY;
if (env.SUPABASE_PROJECT_REF !== STAGING_REF
    || env.SUPABASE_PROJECT_REF === PRODUCTION_REF
    || new URL(BASE_URL).hostname !== `${STAGING_REF}.supabase.co`
    || !fs.existsSync(LINK_FILE)
    || fs.readFileSync(LINK_FILE, 'utf8').trim() !== STAGING_REF) {
  abort('resolved project is not the approved linked staging project');
}

async function request(pathname, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 60000);
  const key = options.service ? SECRET_KEY : ANON_KEY;
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      method: options.method || 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${options.bearer || key}`,
        ...(options.origin ? { Origin: PREVIEW_ORIGIN } : {}),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: 'no-store'
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = text; }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (_) {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

async function signIn(email, password) {
  const result = await request('/auth/v1/token?grant_type=password', { body: { email, password } });
  if (!result.ok || !result.data || !result.data.access_token) return null;
  return { token: result.data.access_token, userId: result.data.user && result.data.user.id };
}

function rpc(name, body, bearer, service = false) {
  return request(`/rest/v1/rpc/${name}`, { body: body || {}, bearer, service });
}

function serviceTable(table, query, options = {}) {
  return request(`/rest/v1/${table}${query || ''}`, {
    method: options.method || 'GET',
    service: true,
    body: options.body,
    headers: options.prefer ? { Prefer: options.prefer } : {}
  });
}

async function createAuthUser(email, password) {
  const result = await request('/auth/v1/admin/users', {
    service: true,
    body: { email, password, email_confirm: true }
  });
  const user = result.data && result.data.user ? result.data.user : result.data;
  return result.ok && user && user.id ? user.id : '';
}

async function deleteAuthUser(userId) {
  if (!userId) return true;
  const result = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE', service: true
  });
  return result.ok || result.status === 404;
}

async function edgeProvision(payload, bearer, idempotencyKey) {
  const result = await request('/functions/v1/provision-dealer', {
    body: { ...payload, idempotencyKey },
    bearer,
    headers: { 'X-Idempotency-Key': idempotencyKey },
    timeoutMs: 120000
  });
  if (!result.ok) return null;
  const events = String(result.data || '').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (_) { return null; }
  }).filter(Boolean);
  const final = events.find(event => event.type === 'result');
  return final && final.result;
}

function edgeDelete(dealerId, bearer, confirm = dealerId) {
  return request('/functions/v1/delete-dealer', {
    body: { dealer_id: dealerId, confirm },
    bearer,
    origin: true,
    timeoutMs: 120000
  });
}

function randomPassword() {
  return `Pm!${crypto.randomBytes(18).toString('base64url')}`;
}

async function setAccount(dealerId, adminToken, status, trialEnd) {
  return rpc('plotmap_admin_set_dealer_account', {
    p_dealer_id: dealerId,
    p_account_status: status,
    p_subscription_status: 'trial',
    p_trial_end: trialEnd,
    p_expiry_date: null,
    p_plan_code: null,
    p_paid: null,
    p_seat_limit: null,
    p_max_maps: null,
    p_max_properties: null,
    p_max_team_members: null,
    p_payment_notes: 'staging deletion verifier'
  }, adminToken);
}

async function countRows(table, dealerId) {
  const result = await serviceTable(table, `?dealer_id=eq.${encodeURIComponent(dealerId)}&select=dealer_id`);
  return result.ok && Array.isArray(result.data) ? result.data.length : -1;
}

async function run() {
  check('resolved project is linked staging and not production', true);
  const admin = await signIn(env.PLATFORM_ADMIN_EMAIL, env.PLATFORM_ADMIN_PASSWORD);
  const dealerA = await signIn(env.DEALER_A_EMAIL, env.DEALER_A_PASSWORD);
  if (!admin || !dealerA) abort('required staging login failed');
  check('platform admin and normal dealer authenticate', true);

  const unrelatedBefore = await countRows('dealer_settings', 'dealer-staging-a');
  if (unrelatedBefore < 0) abort('could not snapshot isolation controls');

  const suffix = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.slice(-14);
  const verifierAdminEmail = `plotmap.delete+${suffix}-run-admin@example.com`;
  const verifierAdminPassword = randomPassword();
  verifierAdminUserId = await createAuthUser(verifierAdminEmail, verifierAdminPassword);
  if (!verifierAdminUserId) abort('could not create disposable staging platform admin');
  const verifierAdminProfile = await serviceTable('profiles', '', {
    method: 'POST',
    body: {
      id: verifierAdminUserId,
      email: verifierAdminEmail,
      role: 'owner',
      dealer_id: 'dealer-staging-a',
      status: 'active'
    },
    prefer: 'return=minimal'
  });
  const verifierAdminGrant = verifierAdminProfile.ok ? await serviceTable('platform_admins', '', {
    method: 'POST',
    body: { profile_id: verifierAdminUserId, status: 'active' },
    prefer: 'return=minimal'
  }) : verifierAdminProfile;
  const provisionAdmin = verifierAdminGrant.ok
    ? await signIn(verifierAdminEmail, verifierAdminPassword)
    : null;
  if (!provisionAdmin) abort('disposable staging platform admin could not authenticate');
  check('disposable platform admin isolates provisioning rate fixtures', true);
  const platformBefore = await serviceTable('platform_admins', '?select=profile_id,status');
  if (!platformBefore.ok) abort('could not snapshot platform-admin isolation control');

  const dealerId = `dealer-delete-${suffix}`;
  const email = `plotmap.delete+${suffix}@example.com`;
  const password = randomPassword();
  const now = Date.now();
  const provision = await edgeProvision({
    dealerId,
    businessName: `Deletion Stage ${suffix}`,
    ownerName: 'Deletion Verifier',
    ownerPhone: '+91 90000 00000',
    primaryArea: 'Staging Area',
    loginEmail: email,
    accountStatus: 'active',
    subscriptionStatus: 'trial',
    trialStart: new Date(now).toISOString(),
    trialEnd: new Date(now + 14 * 86400000).toISOString(),
    deviceLimit: 1,
    activationExpiresAt: new Date(now + 2 * 3600000).toISOString(),
    passcode: password
  }, provisionAdmin.token, crypto.randomUUID());
  if (!provision || !/^\d{8}$/.test(String(provision.activationCode || ''))) {
    abort('disposable dealer provisioning failed');
  }
  check('disposable dealer and Auth owner are provisioned', true);

  const deviceToken = crypto.randomBytes(32).toString('hex');
  const activation = await rpc('plotmap_activate_device', {
    p_access_code: provision.activationCode,
    p_device_token: deviceToken,
    p_device_label: 'Deletion verifier device',
    p_browser_info: 'Node staging verifier'
  });
  const activationRow = activation.ok && Array.isArray(activation.data) ? activation.data[0] : null;
  check('first device activates immediately', activationRow && activationRow.status === 'approved');
  if (!activationRow || activationRow.status !== 'approved') abort('device activation failed');

  const owner = await signIn(email, password);
  if (!owner) abort('disposable owner login failed');
  check('dealer login opens immediately', true);

  const reasonApproved = await rpc('plotmap_device_access_reason', {
    p_dealer_id: dealerId, p_device_token: deviceToken
  });
  check('read-only reason RPC reports approved', reasonApproved.ok && reasonApproved.data === 'approved');

  const devices = await rpc('plotmap_admin_list_dealer_devices', {}, admin.token);
  const device = Array.isArray(devices.data) ? devices.data.find(row => row.dealer_id === dealerId) : null;
  if (!device) abort('activated device is missing');
  const revoked = await rpc('plotmap_admin_set_device_status', {
    p_device_id: device.id, p_status: 'revoked', p_developer_notes: 'staging reason verifier'
  }, admin.token);
  const reasonRevoked = revoked.ok ? await rpc('plotmap_device_access_reason', {
    p_dealer_id: dealerId, p_device_token: deviceToken
  }) : null;
  check('revoked device reason is exact', reasonRevoked && reasonRevoked.ok && reasonRevoked.data === 'device_revoked');

  const reapproved = await rpc('plotmap_admin_set_device_status', {
    p_device_id: device.id, p_status: 'approved', p_developer_notes: 'staging reason verifier'
  }, admin.token);
  const suspended = reapproved.ok ? await setAccount(dealerId, admin.token, 'suspended', new Date(now + 86400000).toISOString()) : null;
  const reasonSuspended = suspended && suspended.ok ? await rpc('plotmap_device_access_reason', {
    p_dealer_id: dealerId, p_device_token: deviceToken
  }) : null;
  check('suspended account reason is exact', reasonSuspended && reasonSuspended.ok && reasonSuspended.data === 'account_suspended');

  const expired = await setAccount(dealerId, admin.token, 'active', new Date(now - 60000).toISOString());
  const reasonExpired = expired.ok ? await rpc('plotmap_device_access_reason', {
    p_dealer_id: dealerId, p_device_token: deviceToken
  }) : null;
  check('expired trial reason is exact', reasonExpired && reasonExpired.ok && reasonExpired.data === 'trial_expired');

  const deviceCountBeforeUnknown = await countRows('dealer_devices', dealerId);
  const unknownReason = await rpc('plotmap_device_access_reason', {
    p_dealer_id: dealerId, p_device_token: crypto.randomBytes(32).toString('hex')
  });
  const deviceCountAfterUnknown = await countRows('dealer_devices', dealerId);
  check('unknown token receives no account-state disclosure', unknownReason.ok && unknownReason.data === 'device_not_activated');
  check('reason lookup creates no pending device row', deviceCountBeforeUnknown === deviceCountAfterUnknown);

  const restored = await setAccount(dealerId, admin.token, 'active', new Date(now + 14 * 86400000).toISOString());
  if (!restored.ok) abort('could not restore disposable account');

  const fixtures = [
    serviceTable('crm_records', '', { method: 'POST', body: {
      id: `delete-prop-${suffix}`, dealer_id: dealerId, entity_type: 'properties',
      payload: { title: 'Disposable deletion property', clientVisible: true }
    }, prefer: 'return=minimal' }),
    serviceTable('prebuilt_maps', '', { method: 'POST', body: {
      id: crypto.randomUUID(), dealer_id: dealerId, label: 'Disposable map', blocks: {},
      status: 'draft', client_visible: false
    }, prefer: 'return=minimal' }),
    serviceTable('map_overlays', '', { method: 'POST', body: {
      id: `delete-overlay-${suffix}`, dealer_id: dealerId, map_id: 'delete-map',
      kind: 'pin', payload: {}, status: 'draft', client_visible: false
    }, prefer: 'return=minimal' }),
    serviceTable('presentation_events', '', { method: 'POST', body: {
      id: `delete-event-${suffix}`, dealer_id: dealerId, session_id: 'delete-verifier',
      event_type: 'map_opened', metadata: { source: 'deletion_verifier' }
    }, prefer: 'return=minimal' })
  ];
  const inserted = await Promise.all(fixtures);
  check('dealer-owned property, map, overlay and event fixtures exist', inserted.every(result => result.ok));
  if (!inserted.every(result => result.ok)) abort('dealer-owned fixture insert failed');

  const unauthorizedRpc = await rpc('plotmap_admin_delete_dealer', {
    p_dealer_id: dealerId, p_confirm: dealerId
  }, dealerA.token);
  const unauthorizedEdge = await edgeDelete(dealerId, dealerA.token);
  check('normal dealer cannot call deletion RPC', !unauthorizedRpc.ok);
  check('normal dealer cannot call deletion Edge Function', !unauthorizedEdge.ok && [401, 403].includes(unauthorizedEdge.status));
  check('unauthorized attempts leave dealer intact', await countRows('dealer_settings', dealerId) === 1);

  const wrongConfirm = await edgeDelete(dealerId, admin.token, `${dealerId}-wrong`);
  check('confirmation mismatch is rejected before deletion', !wrongConfirm.ok && wrongConfirm.status === 400);
  check('wrong confirmation leaves dealer intact', await countRows('dealer_settings', dealerId) === 1);

  // Simulate an Edge/Auth cleanup interruption: perform the transactional SQL
  // purge directly as platform admin, then prove the Edge retry consumes the
  // tombstone and removes the still-existing Auth user.
  const directPurge = await rpc('plotmap_admin_delete_dealer', {
    p_dealer_id: dealerId, p_confirm: dealerId
  }, admin.token);
  const purgeDetail = directPurge.ok ? '' : [
    directPurge.data && directPurge.data.code,
    directPurge.data && directPurge.data.message
  ].filter(Boolean).join(' ').replace(/[\r\n]+/g, ' ').slice(0, 220) || `HTTP ${directPurge.status}`;
  check('transactional public-schema purge succeeds', directPurge.ok && directPurge.data && directPurge.data.already_deleted === false, purgeDetail);
  if (!directPurge.ok) abort('direct purge failed');

  const authBeforeRetry = await request(`/auth/v1/admin/users/${encodeURIComponent(owner.userId)}`, {
    method: 'GET', service: true
  });
  check('simulated Auth-deletion failure leaves Auth user recoverable', authBeforeRetry.ok);

  const purgeTables = [
    'dealer_settings', 'profiles', 'dealer_devices', 'dealer_access_codes',
    'dealer_passcodes', 'dealer_provisioning_attempts', 'crm_records',
    'prebuilt_maps', 'map_overlays', 'presentation_events'
  ];
  const purgeCounts = await Promise.all(purgeTables.map(table => countRows(table, dealerId)));
  check('dealer profile/device/code/passcode/property/map/event data is purged', purgeCounts.every(count => count === 0));

  const tombstones = await serviceTable('dealer_deletion_log', `?dealer_id=eq.${encodeURIComponent(dealerId)}&select=dealer_id,operation_id,summary,auth_user_ids`);
  const tombstoneText = tombstones.ok ? JSON.stringify(tombstones.data) : '';
  check('one secret-free deletion tombstone remains', tombstones.ok && tombstones.data.length === 1
    && !tombstoneText.includes(password)
    && !tombstoneText.includes(String(provision.activationCode))
    && !tombstoneText.includes(deviceToken));

  const recovery = await edgeDelete(dealerId, admin.token);
  check('Edge retry completes interrupted Auth cleanup', recovery.ok && recovery.data && recovery.data.ok
    && recovery.data.already_deleted === true && recovery.data.auth_users_pending === 0);
  const authAfterRetry = await request(`/auth/v1/admin/users/${encodeURIComponent(owner.userId)}`, {
    method: 'GET', service: true
  });
  check('dealer Auth user is removed', authAfterRetry.status === 404);

  const repeated = await edgeDelete(dealerId, admin.token);
  check('repeated deletion is idempotent', repeated.ok && repeated.data && repeated.data.already_deleted === true);

  const unrelatedAfter = await countRows('dealer_settings', 'dealer-staging-a');
  const platformAfter = await serviceTable('platform_admins', '?select=profile_id,status');
  check('unrelated dealer is unchanged', unrelatedAfter === unrelatedBefore);
  check('platform-admin rows are preserved', platformAfter.ok && platformAfter.data.length === platformBefore.data.length);

  // Remove disposable dealers left by earlier staging verifier runs. These
  // prefixes are reserved by the test tools; permanent tombstones remain.
  const stale = await serviceTable(
    'dealer_settings',
    '?or=(dealer_id.like.dealer-stage-*,dealer_id.like.dealer-delete-*)&select=dealer_id'
  );
  let staleCleanupOk = stale.ok;
  const staleFailureCodes = [];
  if (stale.ok && Array.isArray(stale.data)) {
    for (const row of stale.data) {
      const result = await edgeDelete(String(row.dealer_id || ''), admin.token);
      if (!result.ok && !result.data?.retryable) {
        staleCleanupOk = false;
        staleFailureCodes.push(String(result.data?.error || `HTTP_${result.status}`));
      }
    }
  }
  // Retry from tombstones to complete any external Auth/storage cleanup after
  // a successful database purge.
  const staleTombstones = await serviceTable(
    'dealer_deletion_log',
    '?or=(dealer_id.like.dealer-stage-*,dealer_id.like.dealer-delete-*)&select=dealer_id'
  );
  if (!staleTombstones.ok) staleCleanupOk = false;
  if (staleTombstones.ok && Array.isArray(staleTombstones.data)) {
    for (const row of staleTombstones.data) {
      const retry = await edgeDelete(String(row.dealer_id || ''), admin.token);
      if (!retry.ok) {
        staleCleanupOk = false;
        staleFailureCodes.push(String(retry.data?.error || `HTTP_${retry.status}`));
      }
    }
  }
  const staleAfter = await serviceTable(
    'dealer_settings',
    '?or=(dealer_id.like.dealer-stage-*,dealer_id.like.dealer-delete-*)&select=dealer_id'
  );
  check('disposable staging dealer fixtures are removed', staleCleanupOk
    && staleAfter.ok && Array.isArray(staleAfter.data) && staleAfter.data.length === 0,
  [...new Set(staleFailureCodes)].join(', ').slice(0, 180));

  const verifierAdminRemoved = await deleteAuthUser(verifierAdminUserId);
  if (verifierAdminRemoved) verifierAdminUserId = '';
  check('disposable platform admin fixture is removed', verifierAdminRemoved);

  const failed = checks.filter(item => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} onboarding/deletion staging checks passed.`);
  if (failed.length) process.exitCode = 1;
}

run().catch(async error => {
  await deleteAuthUser(verifierAdminUserId).catch(() => false);
  console.error(`STAGING VERIFICATION BLOCKED: ${error.message}`);
  process.exitCode = 2;
});
