# Account Gating & Superadmin Console — Handoff (Phase 4 PREP)

_Prepared by Claude · 2026-07-07 · branch `phase-1-5-role-and-isolation-prep`_

> **STATUS: PARTIAL BUILD + PREP.** A safe, owner-only, read-only **Account &
> plan** view is built. A cross-dealer **superadmin console** is **NOT** built
> because the schema has no superadmin role and RLS cannot safely scope it yet.
> Manual billing only — no payment integration. Nothing here is
> production-trusted until Codex audits the RLS noted below.

## Dealer statuses (already modeled)

`dealer_settings` carries `subscription_status` (`trial`/`active`/…),
`account_status` (`active`/`suspended`/`expired`), `trial_start`, `trial_end`,
`plan_code`, `seat_limit`, `max_maps`, `max_properties`, `max_team_members`.
The four operational statuses used by gating: **trial · active · suspended ·
expired**.

## What IS built (safe, this branch)

1. **Owner-only Account & plan card** (`admin/owner.html`) — read-only view of
   *this dealer's own* status/plan/trial/seats/limits via
   `PMFoundation.getPlanState()`. Gated behind the `billing.manage` scope
   (owner). No writes, no billing actions, no cross-dealer data.
2. **Existing account gating (already in code, confirmed):**
   - `PMAccess` (`admin/core/access-control.js`) — `isDealerAllowed()` blocks
     `suspended`/`expired` and trial-past-end; `renderBlockedScreen()` →
     `/admin/access-expired.html`.
   - `PMFoundation.checkPlanLimit()` — soft limits for properties/maps/team, and
     blocks add-flows when the account is not active.

## What is NOT built (needs schema + RLS — Codex)

A **superadmin console** to view/suspend/expire/reactivate dealers across the
whole platform requires cross-dealer read/write, which today's RLS forbids
(every private policy is `dealer_id = plotmap_current_dealer_id()`, and there is
no superadmin role). Building it in the browser would require either a
service-role key (**forbidden** in frontend) or a superadmin RLS tier. So it is
**documented, not built.**

### Exact Codex work required for a safe superadmin console

1. **Role/claim:** add a `superadmin` concept — either a `profiles.role`
   value `superadmin` (widen the `profiles_role_check` constraint) or a
   separate `platform_admins(profile_id)` table. Prefer the table so dealer
   role logic stays untouched.
2. **Helper:** `plotmap_is_superadmin()` (`security definer`, active-only).
3. **Cross-dealer access:** either
   - (a) additive RLS policies on `dealer_settings` (and read-only on other
     tables as needed) of the form
     `using (plotmap_is_superadmin())` — **never** `using(true)`; or
   - (b) a set of `security definer` admin RPCs
     (`plotmap_admin_list_dealers()`, `plotmap_admin_set_dealer_status(dealer_id, status)`)
     that check `plotmap_is_superadmin()` internally. **(b) is preferred** —
     smaller surface, easier to audit, no broad table exposure.
4. **Account-status writes:** `set_dealer_status` must only change
   `account_status`/`subscription_status`/`trial_end`, log to `audit_logs`, and
   be superadmin-only.
5. **Frontend:** a `/admin/superadmin.html` console guarded to superadmins,
   calling only those RPCs. **Never exposed to normal dealers** (guard + RLS).
6. **No service-role key in the frontend**, ever.

### Draft migration

Not created as SQL yet — the superadmin model is a schema decision (role vs
table) that Codex should make first. Once decided, it is a small additive
migration (helper + admin RPCs + audit). Mark **Codex review required**.

## Verification still required before calling Phase 4 complete

- [ ] Codex chooses the superadmin model and writes the additive migration.
- [ ] RLS/RPC proven: a superadmin can change only account-status fields, only
      via audited RPCs; a normal owner/team **cannot** call them or see other
      dealers.
- [ ] Suspended/expired dealer is blocked from writes end-to-end (RLS, not just
      the browser gate).
- [ ] Owner Account card shows correct live status from Supabase after Migration
      B + team-permission RLS land.
