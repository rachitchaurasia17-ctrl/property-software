# Account Gating, Manual Billing & Superadmin — Handoff (Phase 4)

_Prepared by Claude · updated 2026-07-08 · branch `phase-1-5-role-and-isolation-prep`_

> **STATUS: APP-SIDE BUILT · BACKEND CODEX-GATED.** Owner-facing account &
> manual-billing UI + a non-blocking account banner are built. Real
> suspension/expiry **enforcement** (blocking writes for a suspended/expired
> dealer) and any **superadmin** cross-dealer control are **NOT** built — they
> require Supabase RLS/RPCs that only Codex may apply. Not production-trusted
> for paid rollout until the audit below passes. Manual billing only — no
> payment gateway, no service-role key.

## Current implemented UI behavior (this branch)

- **Account & billing card** (`admin/owner.html`, owner-only via `billing.manage`):
  shows status chip (trial/active/suspended/expired), plan, trial-end/expiry,
  seats, limits, paid/unpaid, renewal reminder, payment proof link, payment
  notes. An **Edit billing** form lets the owner record the manual billing state
  (account status, subscription trial/paid, plan, trial end, expiry date,
  renewal reminder, paid flag, proof link, notes). Saved via
  `PMFoundation.saveDealerSettings` and audited (`dealer_settings_saved`).
- **Data model:** the new fields (`paid`, `expiryDate`, `renewalReminder`,
  `paymentNotes`, `paymentProofLink`) ride in the existing dealer-scoped settings
  record payload — **no schema migration required**, never exposed to clients.
- **Account gate** (`PMFoundation.getAccountGate`): resolves status +
  `trial/paid` expiry into `{ status, blocked, level, message, daysLeft }`.
- **Non-blocking banner** (`admin/core/nav.js`): admin pages show a warning
  banner when the plan ends within 7 days, and a blocked-style banner when
  suspended/expired. It **never redirects or hard-locks** (owner is not locked
  out accidentally). Not rendered on Client Presentation.
- **Client Presentation:** unchanged — no billing/admin/account data is exposed
  to clients; `app/plotmap/*` untouched.
- **Existing gating retained:** `PMAccess.isDealerAllowed` (suspended/expired →
  access-expired) and `PMFoundation.checkPlanLimit` (soft property/map/team
  limits + block add-flows when not active).

## Remaining backend / RLS requirements (Codex)

The frontend account state is **UX only**. For paid operation the boundary must
be enforced server-side:

1. **Write-block for suspended/expired dealers** — private-table write policies
   (crm_records, map_overlays, prebuilt_maps, dealer_settings, share_links)
   must additionally require the dealer to be active, e.g. AND
   `plotmap_dealer_is_active(dealer_id)` (helper already live from Migration A).
   Stacks on the Phase 3 team-role capabilities.
2. **Who may change `account_status`** — a normal dealer-owner must **not** be
   able to self-activate/extend. Move `account_status` / `expiry_date` /
   `subscription_status` writes behind a provider/superadmin path (see below);
   until then the owner's edits are a *local record*, not a grant of access.
3. **Persist billing fields server-side** — decide storage: dealer_settings
   columns vs the `metadata` jsonb. Currently they live in the settings payload
   (dealer-scoped) which is fine for a record but should be normalized for
   reporting/enforcement.

## Suggested account status rules

| Status | Meaning | Effect (once RLS enforces) |
| --- | --- | --- |
| `trial` | Active trial; `trial_end` in the future | Full access until `trial_end`. |
| `active` | Paid & current; `expiry_date` in the future | Full access until `expiry_date`. |
| `suspended` | Provider paused (non-payment/abuse) | No writes; read may be limited; owner sees blocked banner + can reach billing/contact. |
| `expired` | Trial/plan end passed, not renewed | No writes; owner prompted to renew. |

Transitions are **provider-driven** (manual). Grace: keep read access + billing
visibility so the owner can renew — never a hard lockout of the account owner.

## Superadmin console — NOT built (needs role + RLS)

A cross-dealer console (list dealers, set status, extend expiry) needs
cross-dealer access, which today's per-dealer RLS forbids and which must never
use a service-role key in the browser. **Documented, not built.** Codex work:

1. Add a `superadmin` concept — prefer a `platform_admins(profile_id)` table +
   `plotmap_is_superadmin()` helper (keeps dealer role logic untouched).
2. Provide audited `security definer` RPCs
   (`plotmap_admin_list_dealers()`, `plotmap_admin_set_dealer_status(dealer_id,status,expiry)`)
   that check `plotmap_is_superadmin()` internally — **preferred** over broad
   `using(plotmap_is_superadmin())` table policies. Never `using(true)`.
3. A superadmin-guarded `/admin/superadmin.html` calling only those RPCs, never
   exposed to normal dealers.

## What Codex must audit

- Suspended/expired dealer **cannot write** any private table (RLS proof, not UI).
- Dealer-owner **cannot** escalate their own `account_status`/`expiry_date`.
- Only a superadmin (via audited RPC) can change another dealer's status.
- No service-role key anywhere in the frontend; no `using(true)`/`with check(true)`.
- Billing fields are dealer-scoped and never readable by anon/clients.

## What must be tested before paid rollout

- [ ] Set a dealer `suspended` → their team/owner writes are rejected by RLS;
      reads/billing still reachable; blocked banner shows.
- [ ] Let a trial `trial_end` pass → account reads `expired`; writes blocked by RLS.
- [ ] Owner edits billing record → persists, audited, and does **not** grant access.
- [ ] Two-dealer: dealer A cannot see or change dealer B's billing/status.
- [ ] Client Presentation shows **no** billing/account/admin data.
- [ ] Owner is never hard-locked out of the account/billing screen.
