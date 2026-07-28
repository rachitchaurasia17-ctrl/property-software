// PlotMap public Private Client Link resolver.
// The service-role key remains inside Supabase Edge runtime. Public callers
// receive only the safe RPC snapshot and short-lived signed media URLs.

type JsonRecord = Record<string, unknown>;

const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
const ANON_KEY = String(Deno.env.get('SUPABASE_ANON_KEY') || '');
const SERVICE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const ALLOWED_ORIGINS = new Set(
  String(Deno.env.get('PLOTMAP_CLIENT_LINK_ALLOWED_ORIGINS') || '')
    .split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean),
);
const MAX_BODY_BYTES = 2048;
const SIGNED_URL_SECONDS = 15 * 60;

function headers(origin: string | null): HeadersInit {
  const clean = String(origin || '').replace(/\/$/, '');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(clean) ? clean : '',
    'Access-Control-Allow-Headers': 'apikey, content-type',
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
    headers: { ...headers(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function rpc(name: string, body: JsonRecord, key: string): Promise<{ ok: boolean; data: unknown }> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

async function sign(bucket: string, path: string): Promise<string | null> {
  if (!path || path.includes('..') || path.startsWith('/')) return null;
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
    },
  );
  if (!response.ok) return null;
  const data = await response.json().catch(() => null) as JsonRecord | null;
  const signed = data && String(data.signedURL || data.signedUrl || '');
  if (!signed || !signed.startsWith('/')) return null;
  return `${SUPABASE_URL}/storage/v1${signed}`;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  const cleanOrigin = String(origin || '').replace(/\/$/, '');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== 'POST') return json(origin, { ok: false, reason: 'unavailable' }, 405);
  if (!origin || !ALLOWED_ORIGINS.has(cleanOrigin)) return json(origin, { ok: false, reason: 'unavailable' }, 403);
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return json(origin, { ok: false, reason: 'unavailable' }, 503);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(origin, { ok: false, reason: 'invalid' }, 413);
  let input: JsonRecord;
  try { input = JSON.parse(raw || '{}') as JsonRecord; } catch { return json(origin, { ok: false, reason: 'invalid' }, 400); }
  const token = String(input.token || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(token)) return json(origin, { ok: false, reason: 'invalid' }, 400);

  const resolved = await rpc('plotmap_resolve_client_link', { p_token: token }, ANON_KEY);
  if (!resolved.ok || !resolved.data || typeof resolved.data !== 'object') {
    return json(origin, { ok: false, reason: 'unavailable' }, 404);
  }
  const safe = resolved.data as JsonRecord;
  if (safe.ok !== true || !safe.link || typeof safe.link !== 'object') {
    return json(origin, { ok: false, reason: String(safe.reason || 'unavailable') }, 404);
  }

  const mediaResult = await rpc('plotmap_resolve_client_link_media', { p_token: token }, SERVICE_KEY);
  const mediaEnvelope = mediaResult.ok && mediaResult.data && typeof mediaResult.data === 'object'
    ? mediaResult.data as JsonRecord : {};
  const media = mediaEnvelope.media && typeof mediaEnvelope.media === 'object'
    ? mediaEnvelope.media as JsonRecord : {};
  const link = structuredClone(safe.link as JsonRecord);
  const properties = Array.isArray(link.properties) ? link.properties as JsonRecord[] : [];

  for (const property of properties) {
    const photos = Array.isArray(property.photos) ? property.photos as JsonRecord[] : [];
    for (const photo of photos) {
      const source = media[String(photo.id || '')];
      if (!source || typeof source !== 'object') continue;
      const item = source as JsonRecord;
      if (item.kind === 'storage') photo.url = await sign('property-photos', String(item.source || ''));
      if (item.kind === 'external' && /^https:\/\//i.test(String(item.source || ''))) photo.url = String(item.source);
    }
    property.photos = photos.filter((photo) => /^https:\/\//i.test(String(photo.url || '')));
  }

  const audioPath = String(mediaEnvelope.audioObjectPath || '');
  if (audioPath && link.audio && typeof link.audio === 'object') {
    (link.audio as JsonRecord).url = await sign('client-link-audio', audioPath);
    if (!(link.audio as JsonRecord).url) link.audio = null;
  }

  return json(origin, { ok: true, link }, 200);
});
