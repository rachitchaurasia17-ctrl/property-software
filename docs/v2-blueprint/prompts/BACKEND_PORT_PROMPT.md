# PlotMap V2 — Backend & Security Port Prompt (Codex, Pass 2)

You are porting PlotMap's proven backend and security systems into the V2 repository and a
**new Supabase project (dev first)**.

**Do NOT inspect the legacy PlotMap repository.** Use only:
1. `docs/v2-blueprint/27_FUTURE_AGENT_INSTRUCTIONS.md`
2. `docs/v2-blueprint/08_DATA_MODEL_AND_ADAPTERS.md`
3. `docs/v2-blueprint/05_AUTH_AND_SESSION_CODE.md` + `06_DEVICE_ACTIVATION_CODE.md`
4. `docs/v2-blueprint/13_PRIVATE_CLIENT_LINKS_INTERNALS.md`
5. `docs/v2-blueprint/14_STORAGE_AND_SIGNED_MEDIA.md`
6. `docs/v2-blueprint/15_SUPABASE_RLS_RPCS_AND_GRANTS.md`
7. `docs/v2-blueprint/16_EDGE_FUNCTIONS.md` + `18_DEALER_DELETION_AND_CLEANUP.md`
8. `docs/v2-blueprint/20_SECURITY_INVARIANTS.md`
9. `migration-kit/**` (the actual files to port + their MANIFESTs)

This is a **backend/data/security** pass. Do not redesign the frontend. Do not weaken any
security rule. Do not omit RLS, grants, storage policies, or cleanup logic. Do not bring any
legacy CSS/HTML into V2.

## Objective — port and reconnect, in this order
1. Supabase migrations from `migration-kit/supabase/migrations/` **in order**, preferring the
   enforced version of each object over any `_draft`. Then run
   `migration-kit/verification/verify-isolation.js` and `verify-private-client-links.sql`.
2. Storage buckets `property-photos` + `client-link-audio` (both **private**) + path
   validators + storage RLS. Verify neither bucket is public.
3. `auth` package (GoTrue REST, session/profile, storage-key contract, lazy refresh, column
   fallback, open-redirect-safe redirect, server-only platform-admin check).
4. `device-access` package (opaque local token, server hash compare, read-only gate, dealer
   binding never from URL, reason vocabulary).
5. `data` layer over `crm_records`/`entity_type` (+ `__unresolved__` fail-closed, append-only
   `presentation_events`).
6. `client-links` package + `resolve-client-link` Edge function (15-min signed media,
   https-only, service-role-only media RPC).
7. `provision-dealer` + `delete-dealer` Edge functions (platform-admin gate, idempotent saga,
   confirmation guard, tombstone retry). Re-point env: URL, anon key, service-role key,
   `PLOTMAP_ALLOWED_ORIGINS` / `PLOTMAP_CLIENT_LINK_ALLOWED_ORIGINS`.
8. Maps package (registry generator + assets + overlay engine) behind a stable API.

## Requirements
- Preserve every invariant in `20_SECURITY_INVARIANTS.md`.
- Service-role key exists only inside Edge runtimes; browser config rejects it.
- Produce verification output for every ported subsystem.
- Recreate environment-specific resources safely in the new project.

## Deliverables
1. Branch + commit(s)
2. Migrations ported (list, order)
3. Edge functions ported + env wired
4. Buckets/policies created
5. Invariants preserved (checklist vs `20`)
6. `verify-*` results (must pass)
7. Remaining blockers
8. Exact files changed

Do not deploy production in this pass unless explicitly instructed.
