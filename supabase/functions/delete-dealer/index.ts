// PlotMap permanent dealer deletion (DESTRUCTIVE) — DRAFT, NOT DEPLOYED.
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
// ROLLOUT: apply supabase/migrations/20260724_delete_dealer_draft.sql first,
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
  if (raw.length > MAX_REQUEST_BYTES) return json(origin, { error: 'INVALID_REQUEST' }, 413);
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
  const authIds = Array.isArray(summary.auth_user_ids) ? (summary.auth_user_ids as string[]) : [];

  // 2) Remove the owner Auth user(s) from GoTrue (service role).
  const authResults: Record<string, string> = {};
  for (const id of authIds) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) continue;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    authResults[String(id)] = res.ok ? 'deleted' : 'auth_delete_failed';
  }

  return json(origin, {
    ok: true,
    dealer_id: dealerId,
    removed: summary.deleted || {},
    auth_users: authResults,
  }, 200);
});
