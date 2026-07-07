# Multi-Dealer Isolation — Codex Security Handoff (Phase 2 PREP)

_Prepared by Claude · 2026-07-07 · branch `phase-1-5-role-and-isolation-prep`_

> **STATUS: PREP ONLY.** No migration has been applied. Phase 2 is split into
> a non-breaking RPC setup migration and a later anon lockdown migration. Apply
> them only in the safe rollout order below. Multi-dealer isolation is **not
> production-trusted** until both migrations are applied and verified.

Goal: dealer A can never read or write dealer B's properties, maps, overlays,
settings, share links, audit logs, analytics, or team data — enforced in
Supabase RLS, not browser guards.

---

## 1. Tables reviewed

| Table / view | Purpose | dealer_id column | RLS today |
| --- | --- | --- | --- |
| `crm_records` | Properties, clients, follow-ups, site visits, deals (payload JSON, `entity_type`) | ✅ `dealer_id` | Staff `for all` scoped to `dealer_id = plotmap_current_dealer_id()`. **No anon.** |
| `map_overlays` | Map overlays/highlights | ✅ | Staff `for all` dealer-scoped **+ anon public read** (`published & client_visible & !deleted`) — **not dealer-scoped**. |
| `prebuilt_maps` | Base maps | ✅ (default `dealer-demo`) | Staff `for all` dealer-scoped **+ anon public read** (`published & client_visible`) — **not dealer-scoped**. |
| `presentation_events` | Client analytics events | ✅ | Staff read dealer-scoped **+ anon insert** (`metadata.source='client_presentation'`) — **no dealer_id validation**. |
| `client_safe_properties` (view) | Client-safe projection of `crm_records` properties | ✅ (passthrough) | `grant select to anon` — **no dealer_id filter in the view**. |
| `profiles` | Users (role, dealer_id, status, permissions) | ✅ | Self-read only (`id = auth.uid()`). |
| `dealer_settings` | Branding + billing readiness | ✅ (PK) | Staff `for all` dealer-scoped. No anon. |
| `share_links` | Client share links | ✅ | Staff `for all` dealer-scoped. Public resolution only via `plotmap_resolve_share_link(slug)` RPC (client-safe fields, active/unexpired). No anon table read. |
| `audit_logs` | Append-only audit | ✅ | Staff read + insert dealer-scoped; no update/delete policy. No anon. |

Deals / follow-ups / site visits / clients are **not** separate tables — they
are `crm_records` rows distinguished by `entity_type`, so they inherit
`crm_records` RLS. No separate `team`/access table exists in Supabase; team
membership lives in `profiles` (+ a local scaffold list on `team.html`).

## 2. Admin / client surfaces reviewed

| Surface | dealer_id enforcement |
| --- | --- |
| `admin/core/supabase-sync.js` | Pull queries append `dealer_id=eq.<resolveCurrentDealerId()>` for `crm_records`, `client_safe_properties`, `presentation_events`, `map_overlays`. Push (`rowFor`) stamps `dealer_id` from payload/item/current. Drain skips items whose `dealerId` ≠ active dealer. |
| `admin/core/overlay-store.js` | Local overlays stamped + filtered by `currentDealerId()` (localStorage `plotmap_dealer_id`, default `dealer-demo`). |
| `admin/crm-store.js` | `DEALER_SCOPED_COLLECTIONS` filtered via `scopedArray`/`dealerMatches`; new records stamped `dealerId = firstDealerId(data)`. **Note:** `dealerMatches` returns `true` when an item has no `dealerId` — lenient for legacy rows. |
| `app/plotmap/app.js` (Client Presentation) | Dealer resolved from `?dealer`/`?dealerId`, `?share=<slug>` (RPC → dealer_id), or localStorage; client-side filters `p.dealerId === clientDealerId`. Also reads `prebuilt_maps` directly. |
| `admin/core/access-control.js` / `auth.js` | Role/scope/status guards; `plotmap_dealer_id` cached in localStorage. Browser-only — UX, not isolation. |

## 3. Current dealer_id enforcement findings

**Good — authenticated staff path is isolated by RLS.** Every private-table
staff policy is `plotmap_is_staff() AND dealer_id = plotmap_current_dealer_id()`,
so an authenticated dealer-A user cannot read or write dealer-B rows even by
crafting REST calls. `dealer_settings`, `share_links`, `audit_logs`,
`crm_records`, `map_overlays`, `prebuilt_maps` (admin) all comply.

**Gaps — the public/anon path is not dealer-scoped** (client-side filtering is
the only thing scoping it, and raw REST bypasses client JS):

- **R1 (High) — cross-dealer public property read.** `client_safe_properties`
  is granted to anon with **no dealer_id filter**. A raw call
  `GET /rest/v1/client_safe_properties?dealer_id=eq.dealer-B` (or unfiltered)
  returns dealer B's client-safe properties to anyone.
- **R2 (High) — cross-dealer public map/overlay read.** `prebuilt_maps` and
  `map_overlays` anon read policies filter only on `published/client_visible/
  !deleted`, **not dealer_id**. Anon can enumerate any dealer's published maps.
- **R3 (High) — cross-dealer analytics spoofing.** `presentation_events` anon
  insert only checks `metadata.source = 'client_presentation'`. Anyone can
  insert events with **any `dealer_id`**, polluting dealer B's Client Movement
  / Area Intelligence, or spamming rows.
- **R4 (Medium) — lenient client-side match.** `dealerMatches`/app filters treat
  missing `dealerId` as "belongs to current dealer." Legacy rows without
  `dealer_id` could leak across dealers on the client. Backfill `dealer_id`.
- **R5 (Medium) — default `dealer-demo`.** `prebuilt_maps.dealer_id` defaults to
  `'dealer-demo'` and `overlay-store` defaults to `'dealer-demo'`. New dealers
  must always set an explicit dealer_id or rows collide into the demo tenant.
- **R6 (Low) — presentation_events has no anon SELECT (correct)**; confirm no
  view or RPC re-exposes it. `audit_logs` correctly append-only. Keep it that
  way (no `for all` policy).

## 4. Existing risks (summary for triage)

| ID | Risk | Severity | Table |
| --- | --- | --- | --- |
| R1 | Anon reads any dealer's client-safe properties | High | `client_safe_properties` |
| R2 | Anon reads any dealer's published maps/overlays | High | `prebuilt_maps`, `map_overlays` |
| R3 | Anon inserts events for any dealer_id | High | `presentation_events` |
| R4 | Missing dealer_id treated as in-tenant | Medium | client JS / legacy rows |
| R5 | `dealer-demo` default collides tenants | Medium | `prebuilt_maps`, overlays |

## 5. Proposed RLS approach

The isolation principle: **anon has no dealer identity in its JWT**, so public
reads must be scoped by an explicit, server-validated dealer context — never by
trusting a client-supplied filter. Two complementary options for Codex:

**Approach A (recommended) — dealer-scoped SECURITY DEFINER RPCs for the public
path.** Replace direct anon `SELECT`/`INSERT` on the client-facing tables/view
with RPCs that take a dealer_id (or share slug) and internally enforce it:

- `plotmap_client_properties(p_dealer_id text)` → returns only that dealer's
  client-safe properties (same projection as `client_safe_properties`).
- `plotmap_client_maps(p_dealer_id text)` / `plotmap_client_overlays(p_dealer_id text)`
  → only that dealer's published, client-visible, non-deleted rows.
- `plotmap_record_presentation_event(p_dealer_id text, ...)` → validates the
  dealer exists/active, stamps `dealer_id` and `source='client_presentation'`
  server-side, inserts. Then **revoke anon INSERT** on the table.
- After RPCs exist, **revoke anon SELECT** on `client_safe_properties`,
  `prebuilt_maps`, `map_overlays` (staff policies unchanged).

This gives true isolation: a client can only ever fetch the dealer it was
pointed at, and cannot forge events for another dealer.

**Approach B (lighter, weaker) — keep public reads but require a dealer_id
predicate + accept published data is a shared catalog.** Does **not** satisfy
"dealer A cannot see dealer B properties" for a determined caller, so only
acceptable if published listings are explicitly considered public. Not
recommended for a paid multi-dealer product.

**Supporting, safe-now changes (in the draft migration, active):** add
`dealer_id` indexes; add read-only helper `plotmap_dealer_is_active(text)` for
the RPCs to use. Backfill/parameterize the `dealer-demo` default (R5) and
`dealer_id` on legacy rows (R4) — data task, done by Codex with care.

## 6. Phase 2 rollout migrations

`supabase/migrations/20260707a_multi_dealer_rpc_setup.sql` is Migration A.
It is additive and intended to be safe before the frontend deploy: dealer_id
indexes, `plotmap_dealer_is_active`, dealer-scoped Client Presentation read
RPCs, the presentation event write RPC, and execute grants. It does **not**
revoke anon table/view access or drop public policies, so old production should
continue working if Migration A is applied by itself.

`supabase/migrations/20260707b_multi_dealer_anon_lockdown.sql` is Migration B.
It is the breaking lockdown step and is explicitly marked:
**DO NOT APPLY UNTIL AFTER RPC FRONTEND IS DEPLOYED AND VERIFIED.** It revokes
direct anon access from `client_safe_properties`, `prebuilt_maps`,
`map_overlays`, and `presentation_events`, then drops the old public
read/insert policies.

Safe rollout order:

1. Apply Migration A to the target Supabase project.
2. Deploy the frontend that reads properties/maps/overlays through the RPCs and
   writes presentation analytics through `plotmap_record_presentation_event`.
3. Verify Client Presentation loads for the target dealer, published overlays
   render, and presentation events are written through the RPC.
4. Apply Migration B only after step 3 passes in production.
5. Run the two-dealer Antigravity checklist below.

The older one-shot corrected migration has been removed from the active
migration set to prevent accidentally applying setup and lockdown together.
The original draft migration remains historical prep context only. These
migrations contain no `DROP TABLE`/`DELETE`/`TRUNCATE`, no `using(true)`/`with
check(true)`.

Historical draft context:

`supabase/migrations/20260707_multi_dealer_isolation_draft.sql` — **DRAFT, not
applied.** Active statements are additive/idempotent only (dealer_id indexes +
one read-only helper function). The proposed RPCs and grant/revoke changes are
included **as commented SQL** under a clearly marked block so an accidental run
cannot change access; Codex reviews, completes, and applies them deliberately.
Contains no `DROP TABLE`/`DELETE`/`TRUNCATE`, no `using(true)`/`with check(true)`.

## 7. Exact Codex prompt to audit/fix

```
You are auditing PlotMap multi-dealer RLS isolation on Supabase (Postgres).
Context files: supabase_security_patch.sql, supabase/migrations/20260706_saas_foundation_scaffold.sql,
supabase/migrations/20260707_multi_dealer_isolation_draft.sql, docs/MULTI_DEALER_ISOLATION_HANDOFF.md.

Confirmed-good: authenticated staff policies are `plotmap_is_staff() AND dealer_id = plotmap_current_dealer_id()`.
Fix these gaps WITHOUT weakening any existing policy and WITHOUT anon reading another dealer's data:
  R1: client_safe_properties view is anon-readable with no dealer_id filter.
  R2: prebuilt_maps and map_overlays anon read policies are not dealer-scoped.
  R3: presentation_events anon insert does not validate dealer_id (spoofable).
  R4: legacy rows missing dealer_id are treated as in-tenant.
  R5: dealer_id defaults to 'dealer-demo' and can collide tenants.

Requirements:
- Prefer SECURITY DEFINER RPCs (Approach A) that enforce dealer_id server-side; then revoke direct
  anon SELECT/INSERT on the client-facing tables/view.
- No using(true) / with check(true) on private tables. No service-role in frontend.
- Additive/idempotent migration; no DROP TABLE/DELETE/TRUNCATE. Keep audit_logs append-only.
- Produce: (a) a corrected migration, (b) a backfill plan for R4/R5, (c) the exact anon REST calls
  that must now return zero cross-dealer rows, (d) rollback notes.
Output the final SQL and a short risk sign-off.
```

## 8. Two-dealer Antigravity test checklist

Set up **dealer-A** and **dealer-B**, each with an owner + a team user, distinct
properties, maps, overlays, share links. Run against **staging**, after Codex
applies the approved migration. Every item must PASS.

- [ ] Dealer A (authed) cannot read Dealer B **properties** (`crm_records` REST + UI).
- [ ] Dealer A cannot read Dealer B **maps** (`prebuilt_maps`).
- [ ] Dealer A cannot read Dealer B **overlays** (`map_overlays`).
- [ ] Dealer A cannot read Dealer B **settings** (`dealer_settings`).
- [ ] Dealer A cannot read Dealer B **analytics** (`presentation_events`).
- [ ] Dealer A cannot read Dealer B **share links** (`share_links`).
- [ ] Dealer A cannot read Dealer B **audit logs** (`audit_logs`).
- [ ] Dealer A cannot open a Dealer B **deep link / share slug** and see B data beyond the intended client-safe scope.
- [ ] **Team** member of Dealer A cannot see any Dealer B data (same checks).
- [ ] **Anon** raw REST (`client_safe_properties`, `prebuilt_maps`, `map_overlays`) cannot enumerate a non-target dealer's rows.
- [ ] **Anon** cannot insert a `presentation_events` row for a dealer_id it was not pointed at (spoof attempt rejected).
- [ ] Client Presentation for Dealer A loads **only** Dealer A client-safe data.
- [ ] No price/sold/finance/internal fields appear anywhere in Client Presentation.
- [ ] Writes as `viewer` / inactive user are rejected (ties into Phase 3).

## 9. Open questions / assumptions

1. **Public catalog vs strict isolation:** are published maps/properties meant to
   be a shared public catalog, or strictly per-dealer? This decides Approach A vs
   B. Assumption: **strict per-dealer** (paid SaaS).
2. **Dealer context for anon:** should the client always carry `?dealer=` /
   `?share=`? Assumption: yes — RPCs require an explicit dealer_id/slug.
3. **Legacy `dealer-demo` rows:** backfill to real dealer_ids or keep as the demo
   tenant? Needs a data decision before revoking lenient matching (R4/R5).
4. **Superadmin:** no cross-dealer superadmin role exists yet; owner controls only
   their own dealer. Confirm none is needed for Phase 2.
5. **presentation_events volume/anti-abuse:** RPC insert is a good place to add
   rate-limiting / basic validation — in scope for Codex or later?
