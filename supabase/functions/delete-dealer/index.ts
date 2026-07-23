// PlotMap permanent dealer deletion (DESTRUCTIVE).
//
// Inverse of `provision-dealer`. The ONLY layer allowed to use
// SUPABASE_SERVICE_ROLE_KEY. It:
//   1. validates the caller's JWT and confirms an active platform admin;
//   2. calls the platform-admin SECURITY DEFINER RPC
//      plotmap_admin_delete_dealer (confirmation-guarded) to purge all
//      public-schema rows in one transaction;
//   3. deletes the returned owner Auth user id(s) from GoTrue.
//
// It never logs request bodies, tokens, or Supabase responses. Deploy with
// `--verify-jwt` and PLOTMAP_ALLOWED_ORIGINS set to the production origin.
// Test on staging before enabling in production.
//
// ROLLOUT: apply
// supabase/migrations/20260724000100_onboarding_access_and_dealer_deletion.sql first,
// then deploy this function. Until both are live the Developer Control
// "Delete dealer" action degrades to "not enabled on this server yet".

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(Deno.env.get('SUPABASE_ANON_KEY') || '');
const SUPABASE_SERVICE_ROLE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const ALLOWED_ORIGINS = new Set(
  String(Deno.env.get('PLOTMAP_ALLOWED_ORIGINS') || '')
    .split(',').map((v) => v.trim().replace(/\/$/, '')).filter(Boolean),
);
const MAX_REQUEST_BYTES = 4 * 1024;
const PHOTO_BUCKET = 'property-photos';
const MAX_STORAGE_OBJECTS = 10000;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin.replace(/\/$/, '')) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
}

function json(origin: string | null, body: JsonRecord, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function fetchJson(url: string, init: RequestInit): Promise<{ response: Response; data: unknown }> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function isPlatformAdmin(token: string): Promise<boolean> {
  const { response, data } = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/plotmap_is_platform_admin`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return response.ok && data === true;
}

async function validUser(token: string): Promise<boolean> {
  const { response, data } = await fetchJson(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return response.ok && !!(data && (data as JsonRecord).id);
}

function storageBucketMissing(response: Response, data: unknown): boolean {
  if (response.status === 404) return true;
  const message = data && typeof data === 'object' ? String((data as JsonRecord).message || '') : '';
  return response.status === 400 && /bucket[^a-z]+not[^a-z]+found/i.test(message);
}

async function deleteDealerPhotoObjects(dealerId: string): Promise<number> {
  const root = `dealers/${dealerId}`;
  const directories = [root];
  const visited = new Set<string>();
  const objects: string[] = [];

  while (directories.length) {
    const prefix = directories.shift() as string;
    if (visited.has(prefix)) continue;
    visited.add(prefix);
    let offset = 0;

    while (true) {
      const listed = await fetchJson(`${SUPABASE_URL}/storage/v1/object/list/${PHOTO_BUCKET}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      if (storageBucketMissing(listed.response, listed.data)) return 0;
      if (!listed.response.ok || !Array.isArray(listed.data)) throw new Error('storage_list_failed');

      for (const raw of listed.data) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as JsonRecord;
        const name = String(item.name || '').replace(/^\/+|\/+$/g, '');
        if (!name || name === '.' || name === '..') continue;
        const objectPath = `${prefix}/${name}`;
        if (item.id || item.metadata) objects.push(objectPath);
        else directories.push(objectPath);
        if (objects.length > MAX_STORAGE_OBJECTS || directories.length > MAX_STORAGE_OBJECTS) {
          throw new Error('storage_limit_exceeded');
        }
      }

      if (listed.data.length < 100) break;
      offset += listed.data.length;
    }
  }

  for (let i = 0; i < objects.length; i += 100) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: objects.slice(i, i + 100) }),
    });
    if (!response.ok) throw new Error('storage_delete_failed');
  }

  return objects.length;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json(origin, { error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!origin || !ALLOWED_ORIGINS.has(origin.replace(/\/$/, ''))) return json(origin, { error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(origin, { error: 'EDGE_CONFIGURATION_MISSING' }, 500);
  }

  const authorization = String(request.headers.get('Authorization') || '');
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return json(origin, { error: 'PLATFORM_ADMIN_REQUIRED' }, 401);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return json(origin, { error: 'INVALID_REQUEST' }, 413);
  }
  let payload: JsonRecord;
  try { payload = raw ? JSON.parse(raw) as JsonRecord : {}; } catch { return json(origin, { error: 'INVALID_REQUEST' }, 400); }

  const dealerId = String(payload.dealer_id || '').trim().toLowerCase();
  const confirm = String(payload.confirm || '').trim().toLowerCase();
  if (!dealerId || confirm !== dealerId) return json(origin, { error: 'CONFIRMATION_MISMATCH' }, 400);

  if (!(await validUser(token)) || !(await isPlatformAdmin(token))) {
    return json(origin, { error: 'PLATFORM_ADMIN_REQUIRED' }, 401);
  }

  // 1) Purge public-schema rows via the confirmation-guarded RPC (as the
  //    signed-in platform admin, so the RPC's own gate re-checks).
  const purge = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/plotmap_admin_delete_dealer`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_dealer_id: dealerId, p_confirm: dealerId }),
  });
  if (!purge.response.ok || !purge.data || typeof purge.data !== 'object') {
    return json(origin, { error: 'DELETE_FAILED' }, 400);
  }
  const summary = purge.data as JsonRecord;
  // Works for a fresh delete AND for a retry: when the dealer is already
  // gone the RPC returns the tombstone's auth_user_ids, so we can finish an
  // interrupted Auth cleanup (compensation / recoverable path).
  const authIds = Array.isArray(summary.auth_user_ids) ? (summary.auth_user_ids as string[]) : [];

  // Storage is intentionally removed through the Storage API. Supabase
  // forbids direct SQL deletion from storage.objects. On failure, the durable
  // SQL tombstone makes this whole external cleanup path safely retryable.
  let photoObjectsDeleted = 0;
  try {
    photoObjectsDeleted = await deleteDealerPhotoObjects(dealerId);
  } catch (_) {
    return json(origin, {
      ok: false,
      error: 'STORAGE_CLEANUP_INCOMPLETE',
      retryable: true,
      dealer_id: dealerId,
      operation_id: summary.operation_id || null,
    }, 502);
  }

  // 2) Remove the owner Auth user(s) from GoTrue (service role).
  let authDeleted = 0;
  let authFailed = 0;
  for (const id of authIds) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
      authFailed += 1;
      continue;
    }
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (res.ok || res.status === 404) {
      authDeleted += 1;
      continue;
    }
    if (res.status === 422) {
      const body = await res.json().catch(() => ({})) as JsonRecord;
      const code = String(body.code || body.error_code || '').toLowerCase();
      const message = String(body.message || body.msg || body.error || '').toLowerCase();
      if (code === 'user_not_found' || message.includes('user not found')) {
        authDeleted += 1;
        continue;
      }
    }
    authFailed += 1;
  }

  // The database purge is durable and idempotent. Surface incomplete Auth
  // cleanup as a retryable failure so the UI cannot report full success while
  // a login still exists. A repeat call reuses the tombstone's Auth ids.
  if (authFailed > 0) {
    return json(origin, {
      ok: false,
      error: 'AUTH_CLEANUP_INCOMPLETE',
      retryable: true,
      dealer_id: dealerId,
      operation_id: summary.operation_id || null,
      auth_users_deleted: authDeleted,
      auth_users_pending: authFailed,
    }, 502);
  }

  return json(origin, {
    ok: true,
    dealer_id: dealerId,
    already_deleted: summary.already_deleted === true,
    operation_id: summary.operation_id || null,
    removed: summary.deleted || {},
    property_photo_objects_deleted: photoObjectsDeleted,
    auth_users_deleted: authDeleted,
    auth_users_pending: 0,
  }, 200);
});
