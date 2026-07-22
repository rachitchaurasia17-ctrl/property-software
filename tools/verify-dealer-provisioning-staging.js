#!/usr/bin/env node
/**
 * Staging-only integration verification for one-click dealer provisioning.
 *
 * This script creates disposable Auth identities and isolated dealer fixtures
 * in the explicitly linked staging project. It never prints response bodies,
 * environment values, passwords, passcodes, activation codes, JWTs, or keys.
 * Completed dealer fixtures are suspended after verification; temporary Auth
 * users that never become dealers are removed through the Auth admin API.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.dealer360-staging.local');
const LINK_FILE = path.join(ROOT, 'supabase', '.temp', 'project-ref');
const PRODUCTION_PROJECT_REF = 'czmkfmkmgqlienmdihul';
const checks = [];
const temporaryAuthUsers = new Set();
const completedDealers = new Set();

function command(name, args) {
  return spawnSync(name, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false });
}

function parseEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

function abort(message) {
  throw new Error(message);
}

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  - ${detail}` : ''}`);
}

const ignored = command('git', ['check-ignore', '-q', '--', '.env.dealer360-staging.local']);
const tracked = command('git', ['ls-files', '--error-unmatch', '--', '.env.dealer360-staging.local']);
if (ignored.status !== 0 || tracked.status === 0) abort('private staging environment is not safely ignored and untracked');
if (!fs.existsSync(ENV_FILE)) abort('private staging environment is missing');

const env = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
const required = [
  'SUPABASE_PROJECT_REF',
  'SUPABASE_STAGING_URL',
  'SUPABASE_STAGING_PUBLISHABLE_KEY',
  'SUPABASE_STAGING_SECRET_KEY',
  'PLATFORM_ADMIN_EMAIL',
  'PLATFORM_ADMIN_PASSWORD',
  'DEALER_A_EMAIL',
  'DEALER_A_PASSWORD',
  'DEALER360_STAGING_CONFIRM'
];
if (required.some(name => !env[name])) abort('required staging setting is missing');
if (env.DEALER360_STAGING_CONFIRM !== 'staging-only') abort('staging confirmation is missing');

const PROJECT_REF = env.SUPABASE_PROJECT_REF;
const BASE_URL = String(env.SUPABASE_STAGING_URL || '').replace(/\/$/, '');
const ANON_KEY = env.SUPABASE_STAGING_PUBLISHABLE_KEY;
const SECRET_KEY = env.SUPABASE_STAGING_SECRET_KEY;
let parsedUrl;
try { parsedUrl = new URL(BASE_URL); } catch (_) { abort('staging URL is invalid'); }
if (PROJECT_REF === PRODUCTION_PROJECT_REF || parsedUrl.hostname !== `${PROJECT_REF}.supabase.co`) {
  abort('resolved project does not match the approved non-production staging project');
}
if (!fs.existsSync(LINK_FILE) || fs.readFileSync(LINK_FILE, 'utf8').trim() !== PROJECT_REF) {
  abort('repository is not linked to the approved staging project');
}

async function request(pathname, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
  const key = options.service ? SECRET_KEY : ANON_KEY;
  const bearer = options.bearer || key;
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      method: options.method || 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
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
  const result = await request('/auth/v1/token?grant_type=password', {
    body: { email, password }
  });
  if (!result.ok || !result.data || !result.data.access_token) return null;
  return { token: result.data.access_token, userId: result.data.user && result.data.user.id };
}

async function rpc(name, body, bearer, service = false) {
  return request(`/rest/v1/rpc/${name}`, { body: body || {}, bearer, service });
}

function rpcMessage(result) {
  return String(result && result.data && result.data.message || '');
}

function rpcDenied(result, pattern) {
  return !result.ok && (result.status === 401 || result.status === 403 || pattern.test(rpcMessage(result)));
}

async function edgeProvision(payload, bearer, idempotencyKey) {
  const result = await request('/functions/v1/provision-dealer', {
    body: { ...payload, idempotencyKey },
    bearer,
    headers: { 'X-Idempotency-Key': idempotencyKey },
    timeoutMs: 120000
  });
  if (!result.ok) {
    const data = result.data && typeof result.data === 'object' ? result.data : {};
    return { status: result.status, error: data.code || 'HTTP_ERROR', recoverable: Boolean(data.recoverable) };
  }
  const events = String(result.data || '').split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (_) { return { type: 'invalid' }; }
  });
  const finalError = events.find(event => event.type === 'error');
  const finalResult = events.find(event => event.type === 'result');
  return finalError
    ? { status: result.status, error: finalError.code || 'UNKNOWN', recoverable: Boolean(finalError.recoverable) }
    : { status: result.status, result: finalResult && finalResult.result, stages: events.filter(event => event.type === 'stage').map(event => event.stage) };
}

async function createAuthUser(email, password, appMetadata = {}) {
  const result = await request('/auth/v1/admin/users', {
    service: true,
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata
    }
  });
  const user = result.data && result.data.user ? result.data.user : result.data;
  if (!result.ok || !user || !user.id) return null;
  temporaryAuthUsers.add(user.id);
  return user.id;
}

async function updateAuthUser(userId, changes) {
  return request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT', service: true, body: changes
  });
}

async function deleteAuthUser(userId) {
  const result = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE', service: true
  });
  if (result.ok) temporaryAuthUsers.delete(userId);
  return result.ok;
}

async function serviceTable(table, query, options = {}) {
  return request(`/rest/v1/${table}${query || ''}`, {
    method: options.method || 'GET',
    service: true,
    body: options.body,
    headers: options.prefer ? { Prefer: options.prefer } : {}
  });
}

async function authLookup(email) {
  const result = await rpc('plotmap_service_auth_user_by_email', { p_email: email }, null, true);
  return result.ok && result.data && typeof result.data === 'object' ? result.data : {};
}

function randomPasscode() {
  return `Pm!${crypto.randomBytes(18).toString('base64url')}`;
}

function randomCode() {
  let code = '';
  while (code.length < 8) {
    for (const byte of crypto.randomBytes(16)) {
      if (byte < 250) code += String(byte % 10);
      if (code.length === 8) break;
    }
  }
  return code;
}

function payloadFor(suffix, passcode, overrides = {}) {
  const now = Date.now();
  return {
    dealerId: `dealer-stage-${suffix}`.slice(0, 40),
    businessName: `Provisioning Stage ${suffix}`,
    ownerName: 'Staging Owner',
    ownerPhone: '+91 90000 00000',
    primaryArea: 'Staging Area',
    loginEmail: `plotmap.provisioning+${suffix}@example.com`,
    accountStatus: 'active',
    subscriptionStatus: 'trial',
    trialStart: new Date(now).toISOString(),
    trialEnd: new Date(now + 14 * 86400000).toISOString(),
    deviceLimit: 1,
    activationExpiresAt: new Date(now + 2 * 3600000).toISOString(),
    passcode,
    ...overrides
  };
}

async function suspendDealer(dealerId, adminToken) {
  const result = await rpc('plotmap_admin_set_dealer_account', {
    p_dealer_id: dealerId,
    p_account_status: 'suspended',
    p_subscription_status: null,
    p_trial_end: null,
    p_expiry_date: null,
    p_plan_code: null,
    p_paid: null,
    p_seat_limit: null,
    p_max_maps: null,
    p_max_properties: null,
    p_max_team_members: null,
    p_payment_notes: 'staging provisioning verifier fixture'
  }, adminToken);
  return result.ok;
}

async function run() {
  check('resolved project is the linked non-production staging project', true);
  check('private staging environment is ignored and untracked', true);

  const admin = await signIn(env.PLATFORM_ADMIN_EMAIL, env.PLATFORM_ADMIN_PASSWORD);
  const dealerA = await signIn(env.DEALER_A_EMAIL, env.DEALER_A_PASSWORD);
  if (!admin || !dealerA) abort('required staging login failed');
  check('staging platform admin and dealer fixtures can authenticate', true);

  const seed = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.slice(-14);
  const probePayload = payloadFor(`${seed}-anon`, randomPasscode());

  const anonymous = await edgeProvision(probePayload, null, crypto.randomUUID());
  check('anonymous caller cannot provision', anonymous.status === 401 && anonymous.error === 'PLATFORM_ADMIN_REQUIRED', `HTTP ${anonymous.status}`);

  const normalDealer = await edgeProvision(probePayload, dealerA.token, crypto.randomUUID());
  check('normal dealer cannot provision', normalDealer.status === 403 && normalDealer.error === 'PLATFORM_ADMIN_REQUIRED', `HTTP ${normalDealer.status}`);

  const passcodeOne = randomPasscode();
  const first = payloadFor(`${seed}-one`, passcodeOne);
  const firstKey = crypto.randomUUID();
  const firstResult = await edgeProvision(first, admin.token, firstKey);
  check('completely new dealer provisions successfully', Boolean(firstResult.result && firstResult.result.credentialsAvailable),
    firstResult.error ? `code ${firstResult.error}` : '');
  if (!firstResult.result || !firstResult.result.credentialsAvailable) abort('primary provisioning fixture failed');
  completedDealers.add(first.dealerId);

  const expectedStages = ['creating_account', 'creating_login', 'linking_owner', 'securing_passcode', 'generating_onboarding_code'];
  check('all safe progress stages are emitted', expectedStages.every(stage => firstResult.stages.includes(stage)));
  check('activation code is exactly eight digits', /^\d{8}$/.test(String(firstResult.result.activationCode || '')));
  check('one-time response contains no Auth tokens or service details', !/(access_token|refresh_token|service_role|secret_key|database)/i.test(JSON.stringify(firstResult.result)));

  const firstLogin = await signIn(first.loginEmail, passcodeOne);
  check('generated dealer can sign in with email and passcode', Boolean(firstLogin && firstLogin.token));
  if (!firstLogin) abort('new dealer Auth login failed');

  const currentDealer = await rpc('plotmap_current_dealer_id', {}, firstLogin.token);
  const currentRole = await rpc('plotmap_current_role', {}, firstLogin.token);
  check('new owner session is bound to the correct dealer', currentDealer.ok && currentDealer.data === first.dealerId);
  check('new owner session has owner role', currentRole.ok && currentRole.data === 'owner');

  const dealer360 = await rpc('plotmap_admin_dealer_360', { p_dealer_id: first.dealerId }, admin.token);
  check('new dealer appears in Dealer 360', dealer360.ok && dealer360.data && typeof dealer360.data === 'object');

  const completedRetry = await edgeProvision(first, admin.token, firstKey);
  check('completed idempotent retry returns no credentials',
    (completedRetry.error === 'COMPLETED_CREDENTIALS_UNAVAILABLE' && !completedRetry.result)
      || Boolean(completedRetry.result
        && completedRetry.result.credentialsAvailable === false
        && completedRetry.result.code === 'COMPLETED_CREDENTIALS_UNAVAILABLE'));

  const duplicateSlug = await edgeProvision({ ...payloadFor(`${seed}-slug`, randomPasscode()), dealerId: first.dealerId }, admin.token, crypto.randomUUID());
  check('duplicate dealer slug is rejected', duplicateSlug.error === 'DEALER_ALREADY_EXISTS');

  const duplicateEmail = await edgeProvision({ ...payloadFor(`${seed}-email`, randomPasscode()), loginEmail: first.loginEmail }, admin.token, crypto.randomUUID());
  check('duplicate login email is rejected', duplicateEmail.error === 'LOGIN_EMAIL_ALREADY_IN_USE');

  const invalidTrial = await edgeProvision(payloadFor(`${seed}-dates`, randomPasscode(), {
    trialStart: new Date(Date.now() + 2 * 86400000).toISOString(),
    trialEnd: new Date(Date.now() + 86400000).toISOString()
  }), admin.token, crypto.randomUUID());
  check('invalid trial dates are rejected', invalidTrial.error === 'INVALID_TRIAL_DATES');

  const weakPasscode = await edgeProvision(payloadFor(`${seed}-weak`, 'weak'), admin.token, crypto.randomUUID());
  check('weak passcode is rejected', weakPasscode.error === 'INVALID_PASSCODE');

  const invalidLimit = await edgeProvision(payloadFor(`${seed}-limit`, randomPasscode(), { deviceLimit: 21 }), admin.token, crypto.randomUUID());
  check('invalid device limit is rejected', invalidLimit.error === 'INVALID_DEVICE_LIMIT');

  const expiredCode = await edgeProvision(payloadFor(`${seed}-expiry`, randomPasscode(), {
    activationExpiresAt: new Date(Date.now() - 60000).toISOString()
  }), admin.token, crypto.randomUUID());
  check('expired activation date is rejected', expiredCode.error === 'INVALID_ACTIVATION_EXPIRY');

  const passcodeTwo = randomPasscode();
  const concurrentPayload = payloadFor(`${seed}-race`, passcodeTwo);
  const concurrentKey = crypto.randomUUID();
  const concurrentResults = await Promise.all([
    edgeProvision(concurrentPayload, admin.token, concurrentKey),
    edgeProvision(concurrentPayload, admin.token, concurrentKey)
  ]);
  const credentialResults = concurrentResults.filter(result => result.result && result.result.credentialsAvailable);
  const safeSecond = concurrentResults.find(result => result.error === 'PROVISIONING_IN_PROGRESS' || result.error === 'COMPLETED_CREDENTIALS_UNAVAILABLE');
  check('double submission creates one credential-bearing result', credentialResults.length === 1);
  check('concurrent duplicate is safely idempotent', Boolean(safeSecond));
  if (credentialResults.length === 1) completedDealers.add(concurrentPayload.dealerId);

  const collision = payloadFor(`${seed}-recover`, passcodeOne);
  const collisionKey = crypto.randomUUID();
  const collisionFailure = await edgeProvision(collision, admin.token, collisionKey);
  check('database finalization failure is sanitized and recoverable', collisionFailure.error === 'DATABASE_FINALIZE_FAILED' && collisionFailure.recoverable);
  const collisionAuthAfterFailure = await authLookup(collision.loginEmail);
  check('new Auth user is compensated after finalization failure', !collisionAuthAfterFailure.id);

  const replacementPasscode = randomPasscode();
  const authUpdated = await updateAuthUser(firstLogin.userId, { password: replacementPasscode });
  const passcodeUpdated = authUpdated.ok
    ? await rpc('plotmap_admin_set_dealer_passcode', {
      p_dealer_id: first.dealerId,
      p_login_email: first.loginEmail,
      p_passcode: replacementPasscode
    }, admin.token)
    : authUpdated;
  check('staging fixture passcode can be rotated for recovery test', authUpdated.ok && passcodeUpdated.ok);
  if (!authUpdated.ok || !passcodeUpdated.ok) abort('recovery fixture passcode rotation failed');

  const recovered = await edgeProvision(collision, admin.token, collisionKey);
  check('recoverable incomplete provisioning resumes safely', Boolean(recovered.result && recovered.result.credentialsAvailable));
  if (recovered.result && recovered.result.credentialsAvailable) completedDealers.add(collision.dealerId);

  const preexistingAuthPayload = payloadFor(`${seed}-auth`, randomPasscode());
  const unrelatedUserId = await createAuthUser(preexistingAuthPayload.loginEmail, preexistingAuthPayload.passcode);
  if (!unrelatedUserId) abort('could not create pre-existing Auth staging fixture');
  const existingAuthResult = await edgeProvision(preexistingAuthPayload, admin.token, crypto.randomUUID());
  const unrelatedLookup = await authLookup(preexistingAuthPayload.loginEmail);
  check('unrelated existing Auth user is rejected', existingAuthResult.error === 'AUTH_EMAIL_ALREADY_EXISTS');
  check('unrelated existing Auth user is not deleted', unrelatedLookup.id === unrelatedUserId);
  await deleteAuthUser(unrelatedUserId);

  const partialPayload = payloadFor(`${seed}-partial`, randomPasscode());
  const partialInsert = await serviceTable('dealer_settings', '', {
    method: 'POST',
    body: {
      dealer_id: partialPayload.dealerId,
      brand_name: 'Partial staging dealer',
      account_status: 'active',
      subscription_status: 'trial',
      trial_start: partialPayload.trialStart,
      trial_end: partialPayload.trialEnd,
      max_devices_allowed: 1
    },
    prefer: 'return=minimal'
  });
  check('existing ownerless dealer fixture is created', partialInsert.ok);
  const partialResult = partialInsert.ok
    ? await edgeProvision(partialPayload, admin.token, crypto.randomUUID())
    : {};
  check('existing dealer with no owner can be reconciled', Boolean(partialResult.result && partialResult.result.credentialsAvailable));
  if (partialResult.result && partialResult.result.credentialsAvailable) completedDealers.add(partialPayload.dealerId);

  const teamEmail = `plotmap.provisioning+${seed}-team@example.com`;
  const teamPassword = randomPasscode();
  const teamUserId = await createAuthUser(teamEmail, teamPassword);
  if (!teamUserId) abort('could not create team-user staging fixture');
  const teamProfile = await serviceTable('profiles', '', {
    method: 'POST',
    body: { id: teamUserId, email: teamEmail, role: 'manager', dealer_id: 'dealer-staging-a', status: 'active' },
    prefer: 'return=minimal'
  });
  const teamSession = teamProfile.ok ? await signIn(teamEmail, teamPassword) : null;
  const teamAttempt = teamSession ? await edgeProvision(probePayload, teamSession.token, crypto.randomUUID()) : {};
  check('team user cannot call provisioning endpoint', Boolean(teamSession) && teamAttempt.error === 'PLATFORM_ADMIN_REQUIRED');
  await deleteAuthUser(teamUserId);

  const suspendedEmail = `plotmap.provisioning+${seed}-suspended-admin@example.com`;
  const suspendedPassword = randomPasscode();
  const suspendedUserId = await createAuthUser(suspendedEmail, suspendedPassword);
  if (!suspendedUserId) abort('could not create suspended-admin staging fixture');
  const suspendedProfile = await serviceTable('profiles', '', {
    method: 'POST',
    body: { id: suspendedUserId, email: suspendedEmail, role: 'owner', dealer_id: 'dealer-staging-a', status: 'suspended' },
    prefer: 'return=minimal'
  });
  const suspendedAdmin = suspendedProfile.ok
    ? await serviceTable('platform_admins', '', {
      method: 'POST', body: { profile_id: suspendedUserId, status: 'active' }, prefer: 'return=minimal'
    })
    : suspendedProfile;
  const suspendedSession = suspendedAdmin.ok ? await signIn(suspendedEmail, suspendedPassword) : null;
  const suspendedAttempt = suspendedSession ? await edgeProvision(probePayload, suspendedSession.token, crypto.randomUUID()) : {};
  check('suspended platform admin cannot provision', Boolean(suspendedSession) && suspendedAttempt.error === 'PLATFORM_ADMIN_REQUIRED');
  await deleteAuthUser(suspendedUserId);

  const activationCode = String(firstResult.result.activationCode);
  const deviceToken = crypto.randomBytes(32).toString('hex');
  const activation = await rpc('plotmap_submit_activation_request', {
    p_access_code: activationCode,
    p_device_token: deviceToken,
    p_business_name: first.businessName,
    p_owner_name: first.ownerName,
    p_owner_phone: first.ownerPhone,
    p_primary_area: first.primaryArea,
    p_device_label: 'Provisioning verifier device',
    p_browser_info: 'Node staging verifier'
  });
  const activationRow = Array.isArray(activation.data) ? activation.data[0] : null;
  check('fresh device creates a pending activation request', activation.ok && activationRow && activationRow.status === 'pending',
    `HTTP ${activation.status}${rpcMessage(activation) ? ` ${rpcMessage(activation)}` : ''}`);

  const requestList = await rpc('plotmap_admin_list_activation_requests', {}, admin.token);
  const pendingRequest = Array.isArray(requestList.data) && activationRow
    ? requestList.data.find(row => row.id === activationRow.request_id)
    : null;
  check('pending request is scoped to the correct dealer', Boolean(pendingRequest && pendingRequest.dealer_id === first.dealerId),
    `list HTTP ${requestList.status}`);

  const approval = pendingRequest ? await rpc('plotmap_admin_approve_activation_request', {
    p_request_id: pendingRequest.id,
    p_dealer_id: first.dealerId,
    p_business_name: first.businessName,
    p_owner_name: first.ownerName,
    p_owner_phone: first.ownerPhone,
    p_primary_area: first.primaryArea,
    p_developer_notes: 'staging verifier approval'
  }, admin.token) : { ok: false };
  check('platform admin can approve the physical device', approval.ok,
    `HTTP ${approval.status || 0}${rpcMessage(approval) ? ` ${rpcMessage(approval)}` : ''}`);

  const requestStatus = activationRow ? await rpc('plotmap_activation_request_status', {
    p_request_id: activationRow.request_id,
    p_lookup_token: activationRow.lookup_token
  }) : { ok: false };
  const statusRow = Array.isArray(requestStatus.data) ? requestStatus.data[0] : null;
  check('approved request status resolves to the correct dealer', requestStatus.ok && statusRow && statusRow.status === 'approved' && statusRow.dealer_id === first.dealerId);

  const approved = await rpc('plotmap_device_is_approved', {
    p_dealer_id: first.dealerId,
    p_device_token: deviceToken
  });
  check('approved device silently passes the device gate', approved.ok && approved.data === true);

  const secondCode = randomCode();
  const codeCreated = await rpc('plotmap_admin_create_dealer_activation_code', {
    p_dealer_id: first.dealerId,
    p_access_code: secondCode,
    p_label: 'Second-device limit test',
    p_max_uses: 1,
    p_expires_at: new Date(Date.now() + 2 * 3600000).toISOString()
  }, admin.token);
  const secondToken = crypto.randomBytes(32).toString('hex');
  const secondActivation = codeCreated.ok ? await rpc('plotmap_submit_activation_request', {
    p_access_code: secondCode,
    p_device_token: secondToken,
    p_business_name: first.businessName,
    p_owner_name: first.ownerName,
    p_owner_phone: first.ownerPhone,
    p_primary_area: first.primaryArea,
    p_device_label: 'Second verifier device',
    p_browser_info: 'Node staging verifier'
  }) : { ok: false };
  const secondRow = Array.isArray(secondActivation.data) ? secondActivation.data[0] : null;
  const secondApproval = secondRow ? await rpc('plotmap_admin_approve_activation_request', {
    p_request_id: secondRow.request_id,
    p_dealer_id: first.dealerId,
    p_business_name: first.businessName,
    p_owner_name: first.ownerName,
    p_owner_phone: first.ownerPhone,
    p_primary_area: first.primaryArea,
    p_developer_notes: 'device limit verification'
  }, admin.token) : { ok: false, data: null };
  check('second device is blocked at the configured limit', !secondApproval.ok && /DEALER_DEVICE_LIMIT_REACHED|device limit/i.test(rpcMessage(secondApproval)),
    `code HTTP ${codeCreated.status}, submit HTTP ${secondActivation.status || 0}, approve HTTP ${secondApproval.status || 0}`);

  const devices = await rpc('plotmap_admin_list_dealer_devices', {}, admin.token);
  const approvedDevice = Array.isArray(devices.data)
    ? devices.data.find(row => row.dealer_id === first.dealerId && row.status === 'approved')
    : null;
  const revoked = approvedDevice ? await rpc('plotmap_admin_set_device_status', {
    p_device_id: approvedDevice.id,
    p_status: 'revoked',
    p_developer_notes: 'staging verifier cleanup'
  }, admin.token) : { ok: false };
  const afterRevoke = revoked.ok ? await rpc('plotmap_device_is_approved', {
    p_dealer_id: first.dealerId,
    p_device_token: deviceToken
  }) : { ok: false };
  check('revoked device is blocked', revoked.ok && afterRevoke.ok && afterRevoke.data === false);

  const passcodeRows = await serviceTable('dealer_passcodes', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=passcode_hash`);
  const codeRows = await serviceTable('dealer_access_codes', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=code_hash`);
  const attemptRows = await serviceTable('dealer_provisioning_attempts', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=passcode_retry_hash,idempotency_key_hash,request_fingerprint,status`);
  const auditRows = await serviceTable('audit_logs', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=action_type,metadata`);
  const analyticsRows = await serviceTable('presentation_events', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=event_type,metadata`);
  const inspected = [passcodeRows, codeRows, attemptRows, auditRows, analyticsRows].every(result => result.ok);
  const storedText = inspected ? JSON.stringify([passcodeRows.data, codeRows.data, attemptRows.data, auditRows.data, analyticsRows.data]) : '';
  check('credential tables contain hashes and completed retry hash is cleared', inspected
    && Array.isArray(passcodeRows.data) && passcodeRows.data.every(row => /^\$2[aby]\$/.test(row.passcode_hash))
    && Array.isArray(codeRows.data) && codeRows.data.every(row => /^\$2[aby]\$/.test(row.code_hash))
    && Array.isArray(attemptRows.data) && attemptRows.data.every(row => row.status !== 'completed' || row.passcode_retry_hash === null));
  check('credentials are absent from audit and analytics records', inspected
    && !storedText.includes(passcodeOne)
    && !storedText.includes(replacementPasscode)
    && !storedText.includes(activationCode)
    && !storedText.includes(secondCode));

  for (const dealerId of completedDealers) {
    check(`completed staging dealer suspended (${dealerId})`, await suspendDealer(dealerId, admin.token));
  }

  for (const userId of [...temporaryAuthUsers]) await deleteAuthUser(userId);

  const failed = checks.filter(item => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} staging checks passed.`);
  if (failed.length) process.exitCode = 1;
}

run().catch(async error => {
  for (const userId of [...temporaryAuthUsers]) await deleteAuthUser(userId).catch(() => false);
  console.error(`STAGING VERIFICATION BLOCKED: ${error.message}`);
  process.exitCode = 2;
});
