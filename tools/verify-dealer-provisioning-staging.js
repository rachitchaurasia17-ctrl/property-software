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

async function setDealerAccount(dealerId, adminToken, accountStatus, trialEnd) {
  return rpc('plotmap_admin_set_dealer_account', {
    p_dealer_id: dealerId,
    p_account_status: accountStatus,
    p_subscription_status: 'trial',
    p_trial_end: trialEnd,
    p_expiry_date: null,
    p_plan_code: null,
    p_paid: null,
    p_seat_limit: null,
    p_max_maps: null,
    p_max_properties: null,
    p_max_team_members: null,
    p_payment_notes: 'staging auto-activation verifier fixture'
  }, adminToken);
}

function firstRow(result) {
  return result && Array.isArray(result.data) && result.data[0] ? result.data[0] : null;
}

async function activateDevice(code, token, label = 'Provisioning verifier device', extra = {}) {
  return rpc('plotmap_activate_device', {
    p_access_code: code,
    p_device_token: token,
    p_device_label: label,
    p_browser_info: 'Node staging verifier',
    ...extra
  });
}

async function createDealerActivationCode(dealerId, adminToken, label) {
  const code = randomCode();
  const result = await rpc('plotmap_admin_create_dealer_activation_code', {
    p_dealer_id: dealerId,
    p_access_code: code,
    p_label: label,
    p_max_uses: 1,
    p_expires_at: new Date(Date.now() + 2 * 3600000).toISOString()
  }, adminToken);
  return { code, result };
}

async function run() {
  check('resolved project is the linked non-production staging project', true);
  check('private staging environment is ignored and untracked', true);

  const configuredAdmin = await signIn(env.PLATFORM_ADMIN_EMAIL, env.PLATFORM_ADMIN_PASSWORD);
  const dealerA = await signIn(env.DEALER_A_EMAIL, env.DEALER_A_PASSWORD);
  if (!configuredAdmin || !dealerA) abort('required staging login failed');
  check('staging platform admin and dealer fixtures can authenticate', true);

  const seed = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.slice(-14);
  const verifierAdminEmail = `plotmap.provisioning+${seed}-run-admin@example.com`;
  const verifierAdminPassword = randomPasscode();
  const verifierAdminId = await createAuthUser(verifierAdminEmail, verifierAdminPassword);
  if (!verifierAdminId) abort('could not create disposable staging platform admin');
  const verifierAdminProfile = await serviceTable('profiles', '', {
    method: 'POST',
    body: { id: verifierAdminId, email: verifierAdminEmail, role: 'owner', dealer_id: 'dealer-staging-a', status: 'active' },
    prefer: 'return=minimal'
  });
  const verifierAdminGrant = verifierAdminProfile.ok ? await serviceTable('platform_admins', '', {
    method: 'POST', body: { profile_id: verifierAdminId, status: 'active' }, prefer: 'return=minimal'
  }) : verifierAdminProfile;
  const provisionAdmin = verifierAdminGrant.ok ? await signIn(verifierAdminEmail, verifierAdminPassword) : null;
  if (!provisionAdmin) abort('disposable staging platform admin could not authenticate');
  const admin = configuredAdmin;
  check('disposable platform admin isolates provisioning rate fixtures', true);

  const probePayload = payloadFor(`${seed}-anon`, randomPasscode());

  const anonymous = await edgeProvision(probePayload, null, crypto.randomUUID());
  check('anonymous caller cannot provision', anonymous.status === 401 && anonymous.error === 'PLATFORM_ADMIN_REQUIRED', `HTTP ${anonymous.status}`);

  const normalDealer = await edgeProvision(probePayload, dealerA.token, crypto.randomUUID());
  check('normal dealer cannot provision', normalDealer.status === 403 && normalDealer.error === 'PLATFORM_ADMIN_REQUIRED', `HTTP ${normalDealer.status}`);

  const passcodeOne = randomPasscode();
  const first = payloadFor(`${seed}-one`, passcodeOne);
  const firstKey = crypto.randomUUID();
  const firstResult = await edgeProvision(first, provisionAdmin.token, firstKey);
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

  const completedRetry = await edgeProvision(first, provisionAdmin.token, firstKey);
  check('completed idempotent retry returns no credentials',
    (completedRetry.error === 'COMPLETED_CREDENTIALS_UNAVAILABLE' && !completedRetry.result)
      || Boolean(completedRetry.result
        && completedRetry.result.credentialsAvailable === false
        && completedRetry.result.code === 'COMPLETED_CREDENTIALS_UNAVAILABLE'));

  const duplicateSlug = await edgeProvision({ ...payloadFor(`${seed}-slug`, randomPasscode()), dealerId: first.dealerId }, provisionAdmin.token, crypto.randomUUID());
  check('duplicate dealer slug is rejected', duplicateSlug.error === 'DEALER_ALREADY_EXISTS');

  const duplicateEmail = await edgeProvision({ ...payloadFor(`${seed}-email`, randomPasscode()), loginEmail: first.loginEmail }, provisionAdmin.token, crypto.randomUUID());
  check('duplicate login email is rejected', duplicateEmail.error === 'LOGIN_EMAIL_ALREADY_IN_USE');

  const invalidTrial = await edgeProvision(payloadFor(`${seed}-dates`, randomPasscode(), {
    trialStart: new Date(Date.now() + 2 * 86400000).toISOString(),
    trialEnd: new Date(Date.now() + 86400000).toISOString()
  }), provisionAdmin.token, crypto.randomUUID());
  check('invalid trial dates are rejected', invalidTrial.error === 'INVALID_TRIAL_DATES');

  const weakPasscode = await edgeProvision(payloadFor(`${seed}-weak`, 'weak'), provisionAdmin.token, crypto.randomUUID());
  check('weak passcode is rejected', weakPasscode.error === 'INVALID_PASSCODE');

  const invalidLimit = await edgeProvision(payloadFor(`${seed}-limit`, randomPasscode(), { deviceLimit: 21 }), provisionAdmin.token, crypto.randomUUID());
  check('invalid device limit is rejected', invalidLimit.error === 'INVALID_DEVICE_LIMIT');

  const expiredCode = await edgeProvision(payloadFor(`${seed}-expiry`, randomPasscode(), {
    activationExpiresAt: new Date(Date.now() - 60000).toISOString()
  }), provisionAdmin.token, crypto.randomUUID());
  check('expired activation date is rejected', expiredCode.error === 'INVALID_ACTIVATION_EXPIRY');

  const passcodeTwo = randomPasscode();
  const concurrentPayload = payloadFor(`${seed}-race`, passcodeTwo);
  const concurrentKey = crypto.randomUUID();
  const concurrentResults = await Promise.all([
    edgeProvision(concurrentPayload, provisionAdmin.token, concurrentKey),
    edgeProvision(concurrentPayload, provisionAdmin.token, concurrentKey)
  ]);
  const credentialResults = concurrentResults.filter(result => result.result && result.result.credentialsAvailable);
  const safeSecond = concurrentResults.find(result => result.error === 'PROVISIONING_IN_PROGRESS' || result.error === 'COMPLETED_CREDENTIALS_UNAVAILABLE');
  check('double submission creates one credential-bearing result', credentialResults.length === 1);
  check('concurrent duplicate is safely idempotent', Boolean(safeSecond));
  if (credentialResults.length === 1) completedDealers.add(concurrentPayload.dealerId);

  const collision = payloadFor(`${seed}-recover`, passcodeOne);
  const collisionKey = crypto.randomUUID();
  const collisionFailure = await edgeProvision(collision, provisionAdmin.token, collisionKey);
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

  const recovered = await edgeProvision(collision, provisionAdmin.token, collisionKey);
  check('recoverable incomplete provisioning resumes safely', Boolean(recovered.result && recovered.result.credentialsAvailable));
  if (recovered.result && recovered.result.credentialsAvailable) completedDealers.add(collision.dealerId);

  const preexistingAuthPayload = payloadFor(`${seed}-auth`, randomPasscode());
  const unrelatedUserId = await createAuthUser(preexistingAuthPayload.loginEmail, preexistingAuthPayload.passcode);
  if (!unrelatedUserId) abort('could not create pre-existing Auth staging fixture');
  const existingAuthResult = await edgeProvision(preexistingAuthPayload, provisionAdmin.token, crypto.randomUUID());
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
    ? await edgeProvision(partialPayload, provisionAdmin.token, crypto.randomUUID())
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

  const activationSecrets = [];
  const deviceSecrets = [];
  const activationCode = String(firstResult.result.activationCode);
  const deviceToken = crypto.randomBytes(32).toString('hex');
  activationSecrets.push(activationCode);
  deviceSecrets.push(deviceToken);

  const activation = await activateDevice(activationCode, deviceToken);
  const activationRow = firstRow(activation);
  check('new dealer first device is approved immediately', activation.ok && activationRow
    && activationRow.status === 'approved' && activationRow.dealer_id === first.dealerId,
  `HTTP ${activation.status}`);

  const approved = await rpc('plotmap_device_is_approved', {
    p_dealer_id: first.dealerId,
    p_device_token: deviceToken
  });
  check('immediate approved device passes the device gate', approved.ok && approved.data === true);

  const immediateLogin = await rpc('plotmap_passcode_login', { p_passcode: replacementPasscode });
  const immediateLoginRow = firstRow(immediateLogin);
  check('dealer login is available immediately after activation', immediateLogin.ok && immediateLoginRow
    && immediateLoginRow.status === 'ok' && immediateLoginRow.login_email === first.loginEmail.toLowerCase());

  const requestListAfterActivation = await rpc('plotmap_admin_list_activation_requests', {}, admin.token);
  check('automatic redemption creates no pending request', requestListAfterActivation.ok
    && !requestListAfterActivation.data.some(row => row.dealer_id === first.dealerId && row.status === 'pending'));

  const idempotentRetry = await activateDevice(activationCode, deviceToken);
  const idempotentRow = firstRow(idempotentRetry);
  check('same-device retry safely recovers a committed activation', idempotentRetry.ok && idempotentRow
    && idempotentRow.status === 'approved' && idempotentRow.dealer_id === first.dealerId);

  const reusedToken = crypto.randomBytes(32).toString('hex');
  deviceSecrets.push(reusedToken);
  const reusedCode = await activateDevice(activationCode, reusedToken, 'Code reuse verifier');
  const reusedRow = firstRow(reusedCode);
  check('consumed code cannot approve another device', reusedCode.ok && reusedRow
    && reusedRow.status === 'already_used' && reusedRow.dealer_id === null);

  const raceProvisioning = credentialResults.find(result => result.result && result.result.credentialsAvailable);
  if (!raceProvisioning) abort('concurrent activation fixture is unavailable');
  const raceCode = String(raceProvisioning.result.activationCode);
  const raceTokens = [crypto.randomBytes(32).toString('hex'), crypto.randomBytes(32).toString('hex')];
  activationSecrets.push(raceCode);
  deviceSecrets.push(...raceTokens);
  const raceActivations = await Promise.all(raceTokens.map((token, index) =>
    activateDevice(raceCode, token, `Concurrent verifier device ${index + 1}`)));
  const raceRows = raceActivations.map(firstRow);
  const raceApprovedIndex = raceRows.findIndex(row => row && row.status === 'approved');
  check('simultaneous same-code redemption approves exactly one device', raceActivations.every(result => result.ok)
    && raceRows.filter(row => row && row.status === 'approved').length === 1
    && raceRows.filter(row => row && row.status === 'already_used').length === 1);
  if (raceApprovedIndex < 0) abort('concurrent activation did not produce an approved device');
  const raceWinnerToken = raceTokens[raceApprovedIndex];
  const raceDevices = await serviceTable('dealer_devices', `?dealer_id=eq.${encodeURIComponent(concurrentPayload.dealerId)}&status=eq.approved&select=id,device_token_hash`);
  check('same-code concurrency stores one approved device row', raceDevices.ok && raceDevices.data.length === 1);

  let invalidActivation = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomCode();
    const result = await activateDevice(candidate, crypto.randomBytes(32).toString('hex'), 'Invalid-code verifier');
    if (firstRow(result) && firstRow(result).status === 'invalid_code') { invalidActivation = result; break; }
  }
  const invalidRow = firstRow(invalidActivation);
  check('unknown eight-digit code is rejected safely', Boolean(invalidActivation && invalidActivation.ok
    && invalidRow && invalidRow.status === 'invalid_code' && invalidRow.dealer_id === null));

  const expiredActivationCode = String(recovered.result.activationCode);
  activationSecrets.push(expiredActivationCode);
  const expiringRows = await serviceTable('dealer_access_codes', `?dealer_id=eq.${encodeURIComponent(collision.dealerId)}&status=eq.active&select=id`);
  const expiringId = expiringRows.ok && expiringRows.data[0] ? expiringRows.data[0].id : null;
  const expiredPatch = expiringId ? await serviceTable('dealer_access_codes', `?id=eq.${encodeURIComponent(expiringId)}`, {
    method: 'PATCH', body: { expires_at: new Date(Date.now() - 60000).toISOString() }, prefer: 'return=minimal'
  }) : { ok: false };
  const expiredActivation = expiredPatch.ok
    ? await activateDevice(expiredActivationCode, crypto.randomBytes(32).toString('hex'), 'Expired-code verifier')
    : { ok: false };
  const expiredActivationRow = firstRow(expiredActivation);
  check('expired activation code is rejected', expiredActivation.ok && expiredActivationRow
    && expiredActivationRow.status === 'expired' && expiredActivationRow.dealer_id === null);

  const partialCode = String(partialResult.result.activationCode);
  const partialToken = crypto.randomBytes(32).toString('hex');
  const futureTrialEnd = new Date(Date.now() + 14 * 86400000).toISOString();
  activationSecrets.push(partialCode);
  deviceSecrets.push(partialToken);
  const suspended = await setDealerAccount(partialPayload.dealerId, admin.token, 'suspended', futureTrialEnd);
  const suspendedActivation = suspended.ok
    ? await activateDevice(partialCode, partialToken, 'Suspended-dealer verifier')
    : { ok: false };
  const suspendedRow = firstRow(suspendedActivation);
  check('suspended dealer activation is rejected', suspendedActivation.ok && suspendedRow
    && suspendedRow.status === 'dealer_inactive' && suspendedRow.dealer_id === null);

  const expiredTrialSet = await setDealerAccount(
    partialPayload.dealerId,
    admin.token,
    'active',
    new Date(Date.now() - 60000).toISOString()
  );
  const expiredTrialActivation = expiredTrialSet.ok
    ? await activateDevice(partialCode, partialToken, 'Expired-trial verifier')
    : { ok: false };
  const expiredTrialRow = firstRow(expiredTrialActivation);
  check('expired dealer trial activation is rejected', expiredTrialActivation.ok && expiredTrialRow
    && expiredTrialRow.status === 'dealer_inactive' && expiredTrialRow.dealer_id === null);
  const partialRestored = await setDealerAccount(partialPayload.dealerId, admin.token, 'active', futureTrialEnd);
  check('inactive-account fixture is restored for isolation test', partialRestored.ok);

  const crossDealerAttempt = partialRestored.ok
    ? await activateDevice(partialCode, partialToken, 'Cross-dealer verifier', { p_dealer_id: first.dealerId })
    : { ok: false };
  check('caller cannot inject a different dealer id', !crossDealerAttempt.ok);
  const scopedActivation = partialRestored.ok
    ? await activateDevice(partialCode, partialToken, 'Dealer-scoped verifier')
    : { ok: false };
  const scopedRow = firstRow(scopedActivation);
  check('activation dealer comes only from the code row', scopedActivation.ok && scopedRow
    && scopedRow.status === 'approved' && scopedRow.dealer_id === partialPayload.dealerId);

  const secondCodeResult = await createDealerActivationCode(first.dealerId, admin.token, 'Second-device verifier');
  const secondCode = secondCodeResult.code;
  const secondToken = crypto.randomBytes(32).toString('hex');
  activationSecrets.push(secondCode);
  deviceSecrets.push(secondToken);
  const limitAttempt = secondCodeResult.result.ok
    ? await activateDevice(secondCode, secondToken, 'Second verifier device')
    : { ok: false };
  const limitRow = firstRow(limitAttempt);
  check('device limit is enforced before code consumption', limitAttempt.ok && limitRow
    && limitRow.status === 'device_limit_reached' && limitRow.dealer_id === null);

  const raisedLimit = await rpc('plotmap_admin_set_dealer_device_limit', {
    p_dealer_id: first.dealerId,
    p_max_devices_allowed: 2
  }, admin.token);
  const secondActivation = raisedLimit.ok
    ? await activateDevice(secondCode, secondToken, 'Second verifier device')
    : { ok: false };
  const secondRow = firstRow(secondActivation);
  check('second device with a new code auto-approves within the raised limit', secondActivation.ok && secondRow
    && secondRow.status === 'approved' && secondRow.dealer_id === first.dealerId);

  const replacementCodeResult = await createDealerActivationCode(first.dealerId, admin.token, 'Replacement-device verifier');
  const replacementCode = replacementCodeResult.code;
  const replacementToken = crypto.randomBytes(32).toString('hex');
  activationSecrets.push(replacementCode);
  deviceSecrets.push(replacementToken);
  const replacementAtLimit = replacementCodeResult.result.ok
    ? await activateDevice(replacementCode, replacementToken, 'Replacement verifier device')
    : { ok: false };
  const replacementLimitRow = firstRow(replacementAtLimit);
  check('replacement device is blocked while the limit is full', replacementAtLimit.ok && replacementLimitRow
    && replacementLimitRow.status === 'device_limit_reached' && replacementLimitRow.dealer_id === null);

  const devices = await rpc('plotmap_admin_list_dealer_devices', {}, admin.token);
  const approvedDevice = Array.isArray(devices.data)
    ? devices.data.find(row => row.dealer_id === first.dealerId
      && row.status === 'approved' && row.device_label === 'Provisioning verifier device')
    : null;
  const revoked = approvedDevice ? await rpc('plotmap_admin_set_device_status', {
    p_device_id: approvedDevice.id,
    p_status: 'revoked',
    p_developer_notes: 'staging replacement verification'
  }, admin.token) : { ok: false };
  const afterRevoke = revoked.ok ? await rpc('plotmap_device_is_approved', {
    p_dealer_id: first.dealerId,
    p_device_token: deviceToken
  }) : { ok: false };
  check('revoked device is blocked', revoked.ok && afterRevoke.ok && afterRevoke.data === false);

  const replacementActivation = revoked.ok
    ? await activateDevice(replacementCode, replacementToken, 'Replacement verifier device')
    : { ok: false };
  const replacementRow = firstRow(replacementActivation);
  check('new replacement-device code works after revocation', replacementActivation.ok && replacementRow
    && replacementRow.status === 'approved' && replacementRow.dealer_id === first.dealerId);

  const oldSubmit = await rpc('plotmap_submit_activation_request', {
    p_access_code: randomCode(),
    p_device_token: crypto.randomBytes(32).toString('hex'),
    p_business_name: null,
    p_owner_name: null,
    p_owner_phone: null,
    p_primary_area: null,
    p_device_label: 'Blocked legacy submit',
    p_browser_info: 'Node staging verifier'
  });
  check('anonymous callers cannot create new legacy pending requests', !oldSubmit.ok);

  const raceLimitRaised = await rpc('plotmap_admin_set_dealer_device_limit', {
    p_dealer_id: concurrentPayload.dealerId,
    p_max_devices_allowed: 2
  }, admin.token);
  const raceHashRows = await serviceTable('dealer_devices', `?dealer_id=eq.${encodeURIComponent(concurrentPayload.dealerId)}&status=eq.approved&select=device_token_hash&limit=1`);
  const legacyHash = raceHashRows.ok && raceHashRows.data[0] ? raceHashRows.data[0].device_token_hash : null;
  const legacyInsert = raceLimitRaised.ok && legacyHash ? await serviceTable('dealer_activation_requests', '', {
    method: 'POST',
    body: {
      lookup_token_hash: legacyHash,
      status: 'pending',
      dealer_id: concurrentPayload.dealerId,
      requested_business_name: concurrentPayload.businessName,
      requested_owner_name: concurrentPayload.ownerName,
      requested_primary_area: concurrentPayload.primaryArea,
      device_label: 'Legacy pending verifier',
      device_token_hash: legacyHash,
      browser_info: 'Node staging verifier'
    },
    prefer: 'return=representation'
  }) : { ok: false };
  const legacyRequest = legacyInsert.ok && legacyInsert.data[0] ? legacyInsert.data[0] : null;
  const legacyApproval = legacyRequest ? await rpc('plotmap_admin_approve_activation_request', {
    p_request_id: legacyRequest.id,
    p_dealer_id: concurrentPayload.dealerId,
    p_business_name: null,
    p_owner_name: null,
    p_owner_phone: null,
    p_primary_area: null,
    p_developer_notes: 'legacy staging verification'
  }, admin.token) : { ok: false };
  const legacyStatus = legacyApproval.ok ? await rpc('plotmap_activation_request_status', {
    p_request_id: legacyRequest.id,
    p_lookup_token: raceWinnerToken
  }) : { ok: false };
  const legacyStatusRow = firstRow(legacyStatus);
  check('existing legacy pending requests can still be approved', legacyApproval.ok && legacyStatus.ok
    && legacyStatusRow && legacyStatusRow.status === 'approved'
    && legacyStatusRow.dealer_id === concurrentPayload.dealerId);

  const dealer360AfterActivation = await rpc('plotmap_admin_dealer_360', { p_dealer_id: first.dealerId }, admin.token);
  check('auto-approved dealer remains available in Dealer 360', dealer360AfterActivation.ok
    && dealer360AfterActivation.data && typeof dealer360AfterActivation.data === 'object');

  const passcodeRows = await serviceTable('dealer_passcodes', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=passcode_hash`);
  const codeRows = await serviceTable('dealer_access_codes', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=code_hash,redeemed_device_id`);
  const deviceRows = await serviceTable('dealer_devices', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=device_token_hash,status`);
  const attemptRows = await serviceTable('dealer_provisioning_attempts', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=passcode_retry_hash,idempotency_key_hash,request_fingerprint,status`);
  const auditRows = await serviceTable('audit_logs', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=action_type,metadata`);
  const analyticsRows = await serviceTable('presentation_events', `?dealer_id=eq.${encodeURIComponent(first.dealerId)}&select=event_type,metadata`);
  const inspected = [passcodeRows, codeRows, deviceRows, attemptRows, auditRows, analyticsRows].every(result => result.ok);
  const storedText = inspected ? JSON.stringify([passcodeRows.data, codeRows.data, deviceRows.data, attemptRows.data, auditRows.data, analyticsRows.data]) : '';
  check('credential tables contain hashes and completed retry hash is cleared', inspected
    && Array.isArray(passcodeRows.data) && passcodeRows.data.every(row => /^\$2[aby]\$/.test(row.passcode_hash))
    && Array.isArray(codeRows.data) && codeRows.data.every(row => /^\$2[aby]\$/.test(row.code_hash))
    && Array.isArray(deviceRows.data) && deviceRows.data.every(row => /^\$2[aby]\$/.test(row.device_token_hash))
    && Array.isArray(attemptRows.data) && attemptRows.data.every(row => row.status !== 'completed' || row.passcode_retry_hash === null));
  check('activation codes and device tokens are absent from stored records', inspected
    && !storedText.includes(passcodeOne)
    && !storedText.includes(replacementPasscode)
    && activationSecrets.every(secret => !storedText.includes(secret))
    && deviceSecrets.every(secret => !storedText.includes(secret)));

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
