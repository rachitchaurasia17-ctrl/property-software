// PlotMap one-click dealer provisioning.
//
// This function is the only layer allowed to use SUPABASE_SERVICE_ROLE_KEY.
// It never logs request bodies, credentials, tokens, activation codes, or
// Supabase responses. Database mutations remain guarded by platform-admin
// SECURITY DEFINER RPCs and the final dealer/profile/passcode/code write is
// transactional inside Postgres.

type JsonRecord = Record<string, unknown>;

class ProvisioningError extends Error {
  code: string;
  status: number;
  recoverable: boolean;

  constructor(code: string, status = 400, recoverable = false) {
    super(code);
    this.code = code;
    this.status = status;
    this.recoverable = recoverable;
  }
}

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(Deno.env.get('SUPABASE_ANON_KEY') || '');
const SUPABASE_SERVICE_ROLE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const ALLOWED_ORIGINS = new Set(
  String(Deno.env.get('PLOTMAP_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean),
);

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_ACTIVATION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_ACTIVATION_MS = 10 * 60 * 1000;
const encoder = new TextEncoder();

const publicMessages: Record<string, string> = {
  PLATFORM_ADMIN_REQUIRED: 'Active platform-admin access is required.',
  INVALID_REQUEST: 'Review the dealer details and try again.',
  INVALID_IDEMPOTENCY_KEY: 'This provisioning request is invalid. Refresh and try again.',
  INVALID_REQUEST_FINGERPRINT: 'This provisioning request is invalid. Refresh and try again.',
  INVALID_DEALER_ID: 'Use a unique lowercase dealer slug.',
  INVALID_BUSINESS_NAME: 'Enter a valid business name.',
  INVALID_OWNER_NAME: 'Enter a valid owner name.',
  INVALID_OWNER_PHONE: 'Enter a valid owner phone number.',
  INVALID_PRIMARY_AREA: 'Enter a valid primary area.',
  INVALID_LOGIN_EMAIL: 'Enter a valid login email.',
  INVALID_PASSCODE: 'Use a passcode between 8 and 72 bytes.',
  NEW_DEALER_MUST_BE_ACTIVE: 'New onboarding accounts must start active.',
  INVALID_SUBSCRIPTION_STATUS: 'Choose trial or active subscription status.',
  TRIAL_DATES_REQUIRED: 'Trial start and end dates are required.',
  INVALID_TRIAL_DATES: 'Trial end cannot be before trial start.',
  TRIAL_END_MUST_BE_FUTURE: 'Trial end must be in the future.',
  INVALID_DEVICE_LIMIT: 'Device limit must be between 1 and 20.',
  INVALID_ACTIVATION_EXPIRY: 'Activation expiry must be between 10 minutes and 30 days from now.',
  IDEMPOTENCY_CONFLICT: 'This retry does not match the original request. Start a new request.',
  PROVISIONING_RATE_LIMIT: 'Too many provisioning attempts. Wait 15 minutes and try again.',
  PROVISIONING_RETRY_LIMIT: 'This onboarding attempt needs manual review.',
  PROVISIONING_IN_PROGRESS: 'This dealer is already being provisioned. Wait a moment before retrying.',
  DEALER_ALREADY_EXISTS: 'That dealer ID is already in use.',
  DEALER_ACCOUNT_BLOCKED: 'This existing dealer account must be reviewed before onboarding.',
  LOGIN_EMAIL_ALREADY_IN_USE: 'That login email is already linked to PlotMap.',
  AUTH_EMAIL_ALREADY_EXISTS: 'That login email already exists in Auth and needs manual review.',
  AUTH_USER_CREATE_FAILED: 'The secure login could not be created.',
  AUTH_USER_BINDING_INVALID: 'The secure login could not be linked safely.',
  PROFILE_BINDING_CONFLICT: 'The login profile conflicts with another workspace.',
  DEALER_PARTIAL_STATE_CHANGED: 'The partial dealer record changed and needs manual review.',
  AUTH_USER_NOT_READY: 'The secure login is not ready for provisioning.',
  PASSCODE_RETRY_MISMATCH: 'Retry with the same passcode used for this attempt.',
  ACTIVATION_CODE_GENERATION_FAILED: 'The onboarding code could not be generated safely.',
  DATABASE_FINALIZE_FAILED: 'Dealer setup did not complete. It is safe to retry.',
  AUTH_ROLLBACK_FAILED: 'Setup needs a safe retry to reconcile the secure login.',
  COMPLETED_CREDENTIALS_UNAVAILABLE: 'Dealer setup completed, but one-time credentials cannot be shown again.',
  PROVISIONING_ATTEMPT_NOT_RETRYABLE: 'This onboarding attempt needs manual review.',
  PROVISIONING_ATTEMPT_NOT_FOUND: 'This onboarding attempt could not be found.',
  EDGE_CONFIGURATION_MISSING: 'Provisioning is not configured on this environment.',
  NETWORK_FAILURE: 'Provisioning could not reach the secure backend. Try again.',
};

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin.replace(/\/$/, '')) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-idempotency-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
}

function jsonResponse(origin: string | null, body: JsonRecord, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function safeCode(value: unknown, fallback: string): string {
  const candidate = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9_]{3,64}$/.test(candidate) && publicMessages[candidate] ? candidate : fallback;
}

function publicError(code: string, status = 400, recoverable = false): JsonRecord {
  const safe = safeCode(code, 'INVALID_REQUEST');
  return { ok: false, code: safe, message: publicMessages[safe], recoverable };
}

function unsafeText(value: string): boolean {
  return /[<>\u0000-\u001f\u007f]/.test(value)
    || /(javascript:|data:text\/html|on[a-z]+\s*=)/i.test(value);
}

function cleanText(value: unknown): string {
  return String(value == null ? '' : value).trim();
}

function normalizeInput(body: JsonRecord, idempotencyHeader: string): JsonRecord {
  const dealerId = cleanText(body.dealerId).toLowerCase();
  const businessName = cleanText(body.businessName);
  const ownerName = cleanText(body.ownerName);
  const ownerPhone = cleanText(body.ownerPhone);
  const primaryArea = cleanText(body.primaryArea);
  const loginEmail = cleanText(body.loginEmail).toLowerCase();
  const accountStatus = cleanText(body.accountStatus);
  const subscriptionStatus = cleanText(body.subscriptionStatus);
  const passcode = cleanText(body.passcode);
  const idempotencyKey = cleanText(idempotencyHeader || body.idempotencyKey);
  const trialStart = cleanText(body.trialStart);
  const trialEnd = cleanText(body.trialEnd);
  const activationExpiresAt = cleanText(body.activationExpiresAt);
  const deviceLimit = Number(body.deviceLimit);

  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(dealerId)) {
    throw new ProvisioningError('INVALID_DEALER_ID');
  }
  if (businessName.length < 2 || businessName.length > 160 || unsafeText(businessName)) {
    throw new ProvisioningError('INVALID_BUSINESS_NAME');
  }
  if (ownerName.length < 2 || ownerName.length > 120 || unsafeText(ownerName)) {
    throw new ProvisioningError('INVALID_OWNER_NAME');
  }
  if (ownerPhone && (
    ownerPhone.length < 7 || ownerPhone.length > 40 || !/^[0-9+() -]+$/.test(ownerPhone) || unsafeText(ownerPhone)
  )) {
    throw new ProvisioningError('INVALID_OWNER_PHONE');
  }
  if (primaryArea.length < 2 || primaryArea.length > 120 || unsafeText(primaryArea)) {
    throw new ProvisioningError('INVALID_PRIMARY_AREA');
  }
  if (loginEmail.length > 254
    || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(loginEmail)
    || unsafeText(loginEmail)) {
    throw new ProvisioningError('INVALID_LOGIN_EMAIL');
  }
  if (accountStatus !== 'active') throw new ProvisioningError('NEW_DEALER_MUST_BE_ACTIVE');
  if (!['trial', 'active'].includes(subscriptionStatus)) {
    throw new ProvisioningError('INVALID_SUBSCRIPTION_STATUS');
  }
  if (!Number.isInteger(deviceLimit) || deviceLimit < 1 || deviceLimit > 20) {
    throw new ProvisioningError('INVALID_DEVICE_LIMIT');
  }
  if (passcode.length < 8 || encoder.encode(passcode).byteLength > 72 || unsafeText(passcode)) {
    throw new ProvisioningError('INVALID_PASSCODE');
  }
  if (idempotencyKey.length < 16 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new ProvisioningError('INVALID_IDEMPOTENCY_KEY');
  }

  const trialStartMs = trialStart ? Date.parse(trialStart) : NaN;
  const trialEndMs = trialEnd ? Date.parse(trialEnd) : NaN;
  if (subscriptionStatus === 'trial' && (!Number.isFinite(trialStartMs) || !Number.isFinite(trialEndMs))) {
    throw new ProvisioningError('TRIAL_DATES_REQUIRED');
  }
  if (trialStart && !Number.isFinite(trialStartMs)) throw new ProvisioningError('INVALID_TRIAL_DATES');
  if (trialEnd && !Number.isFinite(trialEndMs)) throw new ProvisioningError('INVALID_TRIAL_DATES');
  if (Number.isFinite(trialStartMs) && Number.isFinite(trialEndMs) && trialEndMs < trialStartMs) {
    throw new ProvisioningError('INVALID_TRIAL_DATES');
  }
  if (subscriptionStatus === 'trial' && trialEndMs <= Date.now()) {
    throw new ProvisioningError('TRIAL_END_MUST_BE_FUTURE');
  }

  const activationMs = Date.parse(activationExpiresAt);
  const activationDelta = activationMs - Date.now();
  if (!Number.isFinite(activationMs) || activationDelta < MIN_ACTIVATION_MS || activationDelta > MAX_ACTIVATION_MS) {
    throw new ProvisioningError('INVALID_ACTIVATION_EXPIRY');
  }

  return {
    dealerId,
    businessName,
    ownerName,
    ownerPhone,
    primaryArea,
    loginEmail,
    accountStatus,
    subscriptionStatus,
    trialStart: trialStart ? new Date(trialStartMs).toISOString() : null,
    trialEnd: trialEnd ? new Date(trialEndMs).toISOString() : null,
    deviceLimit,
    activationExpiresAt: new Date(activationMs).toISOString(),
    passcode,
    idempotencyKey,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchJson(url: string, options: RequestInit, timeoutMs = 15000): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    return { response, data };
  } catch {
    throw new ProvisioningError('NETWORK_FAILURE', 503, true);
  } finally {
    clearTimeout(timer);
  }
}

function rpcData(data: unknown): JsonRecord {
  if (Array.isArray(data)) return (data[0] || {}) as JsonRecord;
  return data && typeof data === 'object' ? data as JsonRecord : {};
}

async function callerRpc(name: string, payload: JsonRecord, token: string): Promise<JsonRecord> {
  const { response, data } = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const rawCode = data && typeof data === 'object' ? (data as JsonRecord).message : '';
    throw new ProvisioningError(safeCode(rawCode, 'DATABASE_FINALIZE_FAILED'), response.status, response.status >= 500);
  }
  return rpcData(data);
}

async function serviceRpc(name: string, payload: JsonRecord): Promise<JsonRecord> {
  const { response, data } = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new ProvisioningError('AUTH_USER_CREATE_FAILED', 500, true);
  return rpcData(data);
}

async function authenticatedUser(token: string): Promise<JsonRecord> {
  const { response, data } = await fetchJson(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok || !data || typeof data !== 'object' || !(data as JsonRecord).id) {
    throw new ProvisioningError('PLATFORM_ADMIN_REQUIRED', 401);
  }
  return data as JsonRecord;
}

async function isPlatformAdmin(token: string): Promise<boolean> {
  const { response, data } = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/plotmap_is_platform_admin`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  return response.ok && data === true;
}

async function authUserByEmail(loginEmail: string): Promise<JsonRecord> {
  return serviceRpc('plotmap_service_auth_user_by_email', { p_email: loginEmail });
}

async function createAuthUser(input: JsonRecord, attemptId: string): Promise<string> {
  const { response, data } = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.loginEmail,
      password: input.passcode,
      email_confirm: true,
      user_metadata: { display_name: input.ownerName },
      app_metadata: {
        plotmap_provisioned: true,
        plotmap_dealer_id: input.dealerId,
        plotmap_provisioning_attempt_id: attemptId,
      },
    }),
  }, 20000);
  const user = data && typeof data === 'object' && (data as JsonRecord).user
    ? (data as JsonRecord).user as JsonRecord
    : data as JsonRecord;
  if (!response.ok || !user || typeof user.id !== 'string') {
    throw new ProvisioningError('AUTH_USER_CREATE_FAILED', 500, true);
  }
  return user.id;
}

async function deleteAuthUser(userId: string): Promise<boolean> {
  const { response } = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }, 20000).catch(() => ({ response: new Response(null, { status: 503 }), data: null }));
  return response.ok;
}

function ownedByAttempt(authUser: JsonRecord, attemptId: string, dealerId: string): boolean {
  return String(authUser.id || '') !== ''
    && authUser.plotmap_provisioned === true
    && String(authUser.provisioning_attempt_id || '') === attemptId
    && String(authUser.dealer_id || '') === dealerId;
}

function streamResponse(
  origin: string | null,
  token: string,
  input: JsonRecord,
  fingerprint: string,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: JsonRecord) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let attemptId = '';
      let authUserId = '';
      let authCreatedThisCall = false;
      let finalResult: JsonRecord = {};

      try {
        send({ type: 'stage', stage: 'creating_account' });
        const begin = await callerRpc('plotmap_admin_begin_dealer_provisioning', {
          p_idempotency_key: input.idempotencyKey,
          p_request_fingerprint: fingerprint,
          p_dealer_id: input.dealerId,
          p_business_name: input.businessName,
          p_owner_name: input.ownerName,
          p_owner_phone: input.ownerPhone || null,
          p_primary_area: input.primaryArea,
          p_login_email: input.loginEmail,
          p_account_status: input.accountStatus,
          p_subscription_status: input.subscriptionStatus,
          p_trial_start: input.trialStart,
          p_trial_end: input.trialEnd,
          p_device_limit: input.deviceLimit,
          p_activation_expires_at: input.activationExpiresAt,
          p_passcode: input.passcode,
        }, token);
        attemptId = String(begin.attempt_id || '');
        if (!attemptId) throw new ProvisioningError('DATABASE_FINALIZE_FAILED', 500, true);

        if (begin.completed === true || begin.status === 'completed') {
          send({
            type: 'result',
            result: {
              attemptId,
              dealerId: input.dealerId,
              completed: true,
              credentialsAvailable: false,
              code: 'COMPLETED_CREDENTIALS_UNAVAILABLE',
            },
          });
          return;
        }
        if (begin.proceed !== true) {
          throw new ProvisioningError('PROVISIONING_IN_PROGRESS', 409, true);
        }

        send({ type: 'stage', stage: 'creating_login' });
        const existing = await authUserByEmail(String(input.loginEmail));
        if (existing && existing.id) {
          if (!ownedByAttempt(existing, attemptId, String(input.dealerId))) {
            await callerRpc('plotmap_admin_fail_dealer_provisioning', {
              p_attempt_id: attemptId,
              p_failure_code: 'AUTH_EMAIL_ALREADY_EXISTS',
              p_recoverable: false,
              p_auth_user_retained: false,
            }, token).catch(() => ({}));
            throw new ProvisioningError('AUTH_EMAIL_ALREADY_EXISTS', 409);
          }
          authUserId = String(existing.id);
        } else {
          authUserId = await createAuthUser(input, attemptId);
          authCreatedThisCall = true;
        }

        send({ type: 'stage', stage: 'linking_owner' });
        await callerRpc('plotmap_admin_mark_dealer_provisioning_auth', {
          p_attempt_id: attemptId,
          p_auth_user_id: authUserId,
        }, token);

        send({ type: 'stage', stage: 'securing_passcode' });
        finalResult = await callerRpc('plotmap_admin_finalize_dealer_provisioning', {
          p_attempt_id: attemptId,
          p_passcode: input.passcode,
        }, token);

        if (finalResult.credentials_available !== true || !finalResult.activation_code) {
          throw new ProvisioningError('COMPLETED_CREDENTIALS_UNAVAILABLE', 409);
        }

        send({ type: 'stage', stage: 'generating_onboarding_code' });
        send({
          type: 'result',
          result: {
            attemptId,
            dealerId: finalResult.dealer_id,
            businessName: finalResult.business_name,
            ownerName: finalResult.owner_name,
            loginEmail: finalResult.login_email,
            passcode: input.passcode,
            activationCode: finalResult.activation_code,
            codeExpiresAt: finalResult.activation_expires_at,
            deviceLimit: finalResult.device_limit,
            trialStart: finalResult.trial_start,
            trialEnd: finalResult.trial_end,
            completed: true,
            credentialsAvailable: true,
          },
        });
      } catch (error) {
        let err = error instanceof ProvisioningError
          ? error
          : new ProvisioningError('DATABASE_FINALIZE_FAILED', 500, true);

        if (attemptId && err.code !== 'PROVISIONING_IN_PROGRESS') {
          const status: JsonRecord = await callerRpc('plotmap_admin_get_dealer_provisioning_attempt', {
            p_attempt_id: attemptId,
          }, token).catch(() => ({} as JsonRecord));

          if (status.completed === true || status.status === 'completed') {
            err = new ProvisioningError('COMPLETED_CREDENTIALS_UNAVAILABLE', 409, false);
          } else if (authCreatedThisCall && authUserId) {
            const removed = await deleteAuthUser(authUserId);
            await callerRpc('plotmap_admin_fail_dealer_provisioning', {
              p_attempt_id: attemptId,
              p_failure_code: removed ? 'DATABASE_FINALIZE_FAILED' : 'AUTH_ROLLBACK_FAILED',
              p_recoverable: true,
              p_auth_user_retained: !removed,
            }, token).catch(() => ({}));
            err = new ProvisioningError(
              removed ? 'DATABASE_FINALIZE_FAILED' : 'AUTH_ROLLBACK_FAILED',
              500,
              true,
            );
          } else if (err.code !== 'AUTH_EMAIL_ALREADY_EXISTS') {
            await callerRpc('plotmap_admin_fail_dealer_provisioning', {
              p_attempt_id: attemptId,
              p_failure_code: safeCode(err.code, 'DATABASE_FINALIZE_FAILED'),
              p_recoverable: err.recoverable,
              p_auth_user_retained: Boolean(authUserId),
            }, token).catch(() => ({}));
          }
        }

        const code = safeCode(err.code, 'DATABASE_FINALIZE_FAILED');
        send({ type: 'error', ...publicError(code, err.status, err.recoverable) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    if (origin && !ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''))) {
      return jsonResponse(origin, publicError('PLATFORM_ADMIN_REQUIRED'), 403);
    }
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') return jsonResponse(origin, publicError('INVALID_REQUEST'), 405);
  if (origin && !ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''))) {
    return jsonResponse(origin, publicError('PLATFORM_ADMIN_REQUIRED'), 403);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(origin, publicError('EDGE_CONFIGURATION_MISSING'), 503);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) return jsonResponse(origin, publicError('INVALID_REQUEST'), 413);

  const authorization = String(request.headers.get('Authorization') || '');
  const tokenMatch = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!tokenMatch) return jsonResponse(origin, publicError('PLATFORM_ADMIN_REQUIRED'), 401);
  const token = tokenMatch[1];

  try {
    const user = await authenticatedUser(token);
    if (!await isPlatformAdmin(token)) throw new ProvisioningError('PLATFORM_ADMIN_REQUIRED', 403);

    const rawBody = await request.text();
    if (encoder.encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      throw new ProvisioningError('INVALID_REQUEST', 413);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); } catch { throw new ProvisioningError('INVALID_REQUEST'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ProvisioningError('INVALID_REQUEST');
    }

    const idempotencyHeader = cleanText(request.headers.get('X-Idempotency-Key'));
    const input = normalizeInput(parsed as JsonRecord, idempotencyHeader);
    const fingerprint = await sha256(JSON.stringify({
      dealerId: input.dealerId,
      businessName: input.businessName,
      ownerName: input.ownerName,
      ownerPhone: input.ownerPhone,
      primaryArea: input.primaryArea,
      loginEmail: input.loginEmail,
      accountStatus: input.accountStatus,
      subscriptionStatus: input.subscriptionStatus,
      trialStart: input.trialStart,
      trialEnd: input.trialEnd,
      deviceLimit: input.deviceLimit,
      activationExpiresAt: input.activationExpiresAt,
    }));

    return streamResponse(origin, token, input, fingerprint);
  } catch (error) {
    const err = error instanceof ProvisioningError
      ? error
      : new ProvisioningError('INVALID_REQUEST', 400);
    return jsonResponse(origin, publicError(err.code, err.status, err.recoverable), err.status);
  }
});
