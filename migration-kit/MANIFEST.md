# PlotMap V2 Migration Kit — Manifest

Sanitized, dependency-complete copies of the **proven** PlotMap V1 systems a V2 agent should
reuse or adapt. Extracted at reference commit **`b894245`**. Read alongside
`docs/v2-blueprint/`. Machine mirror: `manifest.json`.

**No secrets are included.** The only secret-shaped string in this kit is a *secret-detection
regex* inside `supabase/migrations/20260719_dealer360_analytics_draft.sql` (a guard that
*rejects* secrets) and a `your-project.supabase.co` **placeholder** in
`verification/verify-isolation.js`. No real keys, `.env` files, or connection strings.

## What is NOT here (deliberately excluded)
Legacy dealer HTML, `admin/crm-ui.css`, duplicate shells/nav, sage/emerald CSS, generated
`dist/`, `.env*`/`.vercel/`, demo fixtures/mock data, the CDN Supabase SDK dependency, and
unexplained files. See `docs/v2-blueprint/21_REUSE_ADAPT_REWRITE_PROHIBIT.md`.

---

## Contents & per-file porting guide

### `supabase/migrations/` — REUSE (port in order; prefer enforced over draft)
- **Original path:** `supabase/migrations/*` (16 files).
- **Purpose:** the entire proven backend — `profiles`, `crm_records`, dealer isolation RLS,
  team-role scopes, account gating, property-photo storage, developer control + trial
  analytics, one-click provisioning, auto-approve device activation, onboarding access +
  dealer deletion, and Private Client Links (+ grant hardening).
- **Dependencies:** `pgcrypto` (via `extensions` schema); Supabase Auth (`auth.uid()`,
  `auth.role()`); `storage` schema.
- **Public API:** the RPCs and RLS in `docs/.../15_SUPABASE_RLS_RPCS_AND_GRANTS.md` +
  `manifests/rpcs.json`.
- **Env requirements:** a Supabase project; run via `supabase db push` / migration tooling.
- **Classification:** REUSE.
- **Security assumptions:** RLS is the boundary; SECURITY DEFINER RPCs re-check
  `auth.uid`/role/dealer; anon has no direct table grants (grant hardening).
- **V2 destination:** `supabase/migrations/`.
- **Porting steps:** (1) apply in filename order to the new dev project; (2) where a `_draft`
  and an enforced file define the same object, the later enforced definition wins — apply
  both in order so the enforced one is final, or port only the enforced version; (3) run the
  verification suite before trusting.
- **Tests:** `verification/verify-private-client-links.sql`, `verification/verify-isolation.js`.

### `edge-functions/` — REUSE / ADAPT (env re-wire only)
- **Original path:** `supabase/functions/{resolve-client-link,provision-dealer,delete-dealer}/index.ts`.
- **Purpose:** the only service-role layer — resolve+sign client-link media; one-click dealer
  provisioning saga; permanent dealer deletion + cleanup.
- **Dependencies:** Deno runtime; the client-link/provisioning/deletion RPCs from the
  migrations; GoTrue Admin API; Storage API.
- **Env requirements:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `PLOTMAP_ALLOWED_ORIGINS` (provision/delete), `PLOTMAP_CLIENT_LINK_ALLOWED_ORIGINS` (resolve).
- **Classification:** REUSE (resolve, delete) / REUSE-ADAPT (provision).
- **Security assumptions:** service-role key never leaves Edge; strict CORS allowlist;
  `default-src 'none'` CSP; no request/secret logging; provisioning idempotent + rollback;
  deletion confirmation-guarded + tombstone-retryable.
- **V2 destination:** `supabase/functions/`.
- **Porting steps:** (1) deploy after migrations; (2) set env for the new project + origins;
  (3) deploy `provision-dealer`/`delete-dealer` with `--verify-jwt`; (4) test on staging.
- **Tests:** `docs/.../24` suites D/F; `verify-private-client-links.sql` (resolve path).

### `auth/` — ADAPT
- **Files:** `auth.js` (PMAuth), `access-control.js` (guardPage + role model).
- **Purpose:** Supabase GoTrue session/profile handling; role/scope model + route guard.
- **Dependencies:** `PMRuntimeConfig` (build a V2 config module), GoTrue REST, `profiles`,
  `PMDeviceAccess`, `plotmap_is_platform_admin`.
- **Public API:** see `docs/.../05_AUTH_AND_SESSION_CODE.md` + `03_ROUTE_AND_ROLE_MATRIX.md`.
- **Classification:** ADAPT.
- **Security assumptions:** client guard is honesty-only; RLS is real; open-redirect-safe
  redirect; server-only platform-admin check; lazy refresh with 60s skew; profile column
  fallback.
- **V2 destination:** `packages/auth`.
- **Porting steps:** re-house as a typed module; expose an explicit `dealerId` accessor other
  modules import instead of reading `localStorage` directly; gate the local-dev auto-mock
  behind an explicit dev flag.
- **Tests:** `docs/.../24` suite B.

### `device-access/` — ADAPT
- **File:** `device-access.js` (PMDeviceAccess).
- **Purpose:** approved-device gate (opaque local token; server compares only hashes).
- **Dependencies:** `PMRuntimeConfig`; device RPCs (`plotmap_device_is_approved`,
  `plotmap_device_access_reason`, `plotmap_device_status`, `plotmap_submit_activation_request`).
- **Classification:** ADAPT.
- **Security assumptions:** token opaque + local-only; dealer binding never from URL; route
  gate read-only (never inserts); 404 → migration_required.
- **V2 destination:** `packages/device-access`.
- **Porting steps:** keep the security exactly; move `renderBlocked` HTML into the V2
  component system; keep the reason vocabulary.
- **Tests:** `docs/.../24` suite B (read-only-gate, activation, reason-states).

### `client-links/` — REUSE (backend contract) / ADAPT (dealer client) / REWRITE (buyer UI)
- **Files:** `plotmap-client-links.js` (PMClientLinks dealer client), `client-app.js`
  (buyer page logic — was `client/app.js`).
- **Purpose:** create/list/revoke/extend links + audio upload; buyer resolve + event tracking.
- **Dependencies:** `PMAuth`, Storage, client-link RPCs, `resolve-client-link` Edge fn,
  `PM_CLIENT_LINKS_ENABLED` flag.
- **Classification:** ADAPT (dealer client) / logic-preserve (buyer).
- **Security assumptions:** raw token used once; snapshot frozen + client-safe; buyer token
  stripped from history; https-only media; events idempotent.
- **V2 destination:** `packages/client-links` (+ `apps/client` for buyer UI).
- **Porting steps:** keep the full API + validation; rebuild buyer visuals in V2 system;
  preserve `history.replaceState` token-strip and the Edge-first/RPC-fallback resolve.
- **Tests:** `verify-private-client-links.sql`; `docs/.../24` suite D.

### `data-contracts/` — ADAPT
- **File:** `data-adapter.js` (PMDataAdapter).
- **Purpose:** local-first CRM store contract (`plotmap_crm_v1`, collections, dealer scoping,
  `__unresolved__` fail-closed).
- **Dependencies:** `PMAuth` (dealer mirror), `crm_records` server table.
- **Classification:** ADAPT.
- **Security assumptions:** production-admin unresolved dealer → `__unresolved__` (RLS rejects).
- **V2 destination:** `packages/data`.
- **Porting steps:** wrap in a typed data layer; keep `crm_records`/`entity_type` contract
  and the fail-closed stamping; remove scattered direct `localStorage` reads.
- **Tests:** `docs/.../24` suite C.

### `verification/` — REUSE
- **Files:** `verify-isolation.js`, `verify-private-client-links.sql`.
- **Purpose:** the acceptance tests for tenant isolation and client-link security.
- **Env requirements:** `verify-isolation.js` reads `PLOTMAP_SUPABASE_URL` etc. (placeholders
  only in file); the SQL is rollback-wrapped and needs two active dealer profiles.
- **Classification:** REUSE.
- **V2 destination:** `supabase/verification/`.
- **Porting steps:** run both against the new dev project after porting migrations + functions;
  all assertions must pass before trusting the environment.

---

## Recommended porting order
1. `supabase/migrations/` → new dev project (in order).
2. `verification/` → run; must pass.
3. `data-contracts/` + `auth/` + `device-access/` → `packages/*`.
4. `client-links/` + `edge-functions/resolve-client-link` → wire buyer flow.
5. `edge-functions/provision-dealer` + `delete-dealer` → Developer Control.
6. Re-run `verification/` on the new environment.
