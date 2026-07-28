# 16 · Edge Functions

Three Deno Edge Functions under `supabase/functions/`. All `VERIFIED-CODE`. Reusable
extracts: `migration-kit/edge-functions/`. Manifest: `manifests/edge-functions.json`.

| Function | Lines | Uses service role? | Public? | Purpose |
|---|---|---|---|---|
| `resolve-client-link` | 115 | **yes** (media sign only) | yes (buyer) | resolve client-link snapshot + sign media |
| `provision-dealer` | 566 | **yes** | no (platform admin) | one-click dealer onboarding saga |
| `delete-dealer` | 258 | **yes** | no (platform admin) | permanent dealer deletion + cleanup |

**The service-role key lives only inside the Edge runtime.** No browser code ever holds it
(the browser config layer actively rejects service-role keys — `02`). All three functions
share the same hardening idioms below.

## Shared security idioms (`VERIFIED-CODE`)
- **CORS allowlist** from env (`PLOTMAP_ALLOWED_ORIGINS` / `PLOTMAP_CLIENT_LINK_ALLOWED_ORIGINS`):
  an origin not in the set gets an empty `Access-Control-Allow-Origin` and a 403.
- **Security headers:** `Content-Security-Policy: default-src 'none'`, `Referrer-Policy:
  no-referrer`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Vary: Origin`.
- **Body size caps** (`resolve`=2 KB, `provision`=16 KB, `delete`=4 KB) → 413.
- **No logging** of bodies, tokens, credentials, or Supabase responses.
- **503** when required env (`SUPABASE_URL`/`ANON`/`SERVICE_ROLE`) is missing.

## `resolve-client-link`
Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`PLOTMAP_CLIENT_LINK_ALLOWED_ORIGINS`. Flow: validate origin+method+token(`^[0-9a-f]{64}$`)
→ `plotmap_resolve_client_link` (anon) for safe snapshot → `plotmap_resolve_client_link_media`
(service) for sources → sign `property-photos`/`client-link-audio` (15 min) or pass https
verbatim → drop non-https photos → return `{ok, link}`. Full detail in `13`/`14`.
`VERIFIED-CODE` `resolve-client-link/index.ts`.

## `provision-dealer`
Env: same three + `PLOTMAP_ALLOWED_ORIGINS`. Streaming NDJSON saga documented in `07`. Key
points: platform-admin gate (`plotmap_is_platform_admin`), strict input validation
(`normalizeInput`), idempotency key + SHA-256 fingerprint, GoTrue admin user create with
`app_metadata` binding, transactional finalize RPC, Auth-user rollback on failure. Deploy
with `--verify-jwt`. `VERIFIED-CODE` `provision-dealer/index.ts`.

## `delete-dealer`
Env: same three + `PLOTMAP_ALLOWED_ORIGINS`. Documented in `18`. Confirmation-guarded
(`confirm===dealer_id`), platform-admin gated, purges public rows via
`plotmap_admin_delete_dealer` (as the signed-in admin, so the RPC re-checks), deletes storage
objects in both buckets via the Storage API, deletes owner Auth users from GoTrue, and
reports partial failures as **retryable** (durable SQL tombstone makes cleanup idempotent).
`VERIFIED-CODE` `delete-dealer/index.ts`.

## Deployment notes (`HISTORICAL`/`VERIFIED-CODE` from headers)
- `delete-dealer` header: apply migration `20260724000100_…` first, then deploy the function;
  until both live, Developer Control "Delete dealer" degrades to "not enabled on this server."
- Deploy with `--verify-jwt` and correct `PLOTMAP_ALLOWED_ORIGINS`; test on staging first.

## V2 decision
**REUSE/ADAPT.** Port all three near-verbatim; only re-point env vars (URL, keys, allowed
origins) to the new project. Keep the service-role-only boundary, the CORS allowlist, the
size caps, the no-logging rule, and (for provisioning) the idempotent saga + rollback.
