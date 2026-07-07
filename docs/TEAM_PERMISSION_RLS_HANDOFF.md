# Team Permission RLS — Codex Security Handoff (Phase 3 PREP)

_Prepared by Claude · 2026-07-07 · branch `phase-1-5-role-and-isolation-prep`_

> **STATUS: PREP ONLY.** Draft migration
> `supabase/migrations/20260707_team_permissions_rls_draft.sql` **MUST BE
> REVIEWED BY CODEX BEFORE APPLYING.** Phase 3 stacks on top of Phase 2 —
> apply Phase 2 isolation first.

Goal: replace today's coarse "any staff role can write everything within the
dealer" with per-role write capabilities, all still bounded by dealer_id.

---

## 1. Current state (baseline)

- `profiles.role ∈ (owner, team, manager, map_editor, property_editor, viewer)`
  (widened by the SaaS scaffold). `profiles.status ∈ (active, blocked, disabled)`.
- `plotmap_is_staff()` = role in (owner, team, manager, map_editor,
  property_editor) **AND** status = 'active'. Viewers and inactive users are
  already excluded.
- Every private-table write policy is a single `for all` gated by
  `plotmap_is_staff() AND dealer_id = plotmap_current_dealer_id()`.
- **Gap:** `map_editor` and `property_editor` currently get **full write** on
  every table — the role split is not enforced in RLS yet, only in the browser
  (`admin/core/access-control.js` scopes). Browser scopes are UX, not security.

## 2. Target role matrix (enforced in RLS)

| Capability | owner | manager | map_editor | property_editor | viewer | inactive |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Read dealer data (own dealer) | ✅ | ✅ | ✅ | ✅ | ✅ (read-only) | ❌ |
| Write **properties** (`crm_records` entity_type=`properties`) | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Write **other CRM** (clients, follow-ups, site visits, deals) | ✅ | ✅ | ❌ | ❌* | ❌ | ❌ |
| Write **maps / overlays** (`map_overlays`, `prebuilt_maps`) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage **dealer settings** (branding) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage **billing / account status** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage **team roles / profiles** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Insert audit logs | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

\* `property_editor` is scoped to properties only; whether it may also write
clients/follow-ups is an open question (§6). Matrix assumes **no**.

Plain-language summary of the required rules:
- **viewer** = read-only within their dealer, zero writes.
- **property_editor** = can write properties, not maps/overlays.
- **map_editor** = can write maps/overlays, not properties.
- **manager** = read/write within dealer, but cannot change billing/account or
  team roles.
- **owner** = full control within their own dealer.
- **inactive** (blocked/disabled) = no writes (and no reads of private data).

## 3. Proposed RLS approach

Introduce capability helper functions (all `security definer`, read-only,
active-status-aware), then split each coarse `for all` policy into:

- a **SELECT** policy for all active members of the dealer, and
- **INSERT/UPDATE/DELETE** policies gated by the matching capability.

Proposed helpers:

| Function | True when (role, active) |
| --- | --- |
| `plotmap_is_active_member()` | any of the 6 roles **incl. viewer**, status active |
| `plotmap_can_edit_properties()` | owner / manager / property_editor |
| `plotmap_can_edit_crm()` | owner / manager (non-property CRM) |
| `plotmap_can_edit_maps()` | owner / manager / map_editor |
| `plotmap_can_manage_settings()` | owner / manager (branding only) |
| `plotmap_can_manage_billing()` | owner only |
| `plotmap_can_manage_team()` | owner only |

All capability checks are **AND**ed with
`dealer_id = plotmap_current_dealer_id()` so no capability ever crosses dealers.

Notes for Codex:
- **Viewers gaining private read** is a change: today viewers are not staff and
  get no private-table read. If viewers should read dealer data (matrix says
  read-only), add a SELECT tier via `plotmap_is_active_member()`. If viewers are
  client-only, drop the viewer read column. **Open question (§6).**
- **crm_records properties-vs-other** split needs `entity_type` in the policy
  predicate (e.g. `entity_type = 'properties'` for property_editor writes).
- **billing vs branding on `dealer_settings`** is a *column*-level rule; RLS is
  row-level. Enforce billing/account columns via a `BEFORE UPDATE` trigger that
  rejects changes to billing columns unless `plotmap_can_manage_billing()`, or
  split billing into a separate owner-only table. Flagged for Codex design.
- **profiles role changes** (team management) must be owner-only; today profiles
  is self-read only with no update policy — adding team management needs a
  carefully scoped owner UPDATE policy that cannot escalate another user's
  dealer_id or role beyond the dealer.

## 4. Draft migration created

`supabase/migrations/20260707_team_permissions_rls_draft.sql` — **DRAFT, not
applied.** Active statements are the additive read-only capability functions
only (harmless until a policy references them). The policy re-writes are
included **as commented SQL** for Codex to review/apply. No destructive SQL, no
RLS weakening, no `using(true)`/`with check(true)`.

## 5. Exact Codex prompt to audit/fix

```
You are implementing PlotMap per-role RLS write capabilities on Supabase (Postgres),
on top of the multi-dealer isolation work. Context: supabase_security_patch.sql,
supabase/migrations/20260706_saas_foundation_scaffold.sql,
supabase/migrations/20260707_team_permissions_rls_draft.sql,
docs/TEAM_PERMISSION_RLS_HANDOFF.md.

Enforce this matrix in RLS (all AND dealer_id = plotmap_current_dealer_id()):
  viewer          = read-only, zero writes
  property_editor = write crm_records where entity_type='properties'; no maps/overlays
  map_editor      = write map_overlays + prebuilt_maps; no properties
  manager         = read/write dealer data; NOT billing/account or team roles
  owner           = full control within own dealer
  inactive (blocked/disabled) = no writes (and no private reads)

Requirements:
- Replace each coarse `for all` staff policy with SELECT (active members) +
  capability-gated INSERT/UPDATE/DELETE. Keep audit_logs append-only.
- Handle dealer_settings billing/account columns (owner-only) via trigger or a
  separate owner-only table — row-level RLS alone cannot do column rules.
- Add an owner-only, dealer-bounded UPDATE policy for profiles (team roles) that
  cannot change dealer_id or escalate outside the dealer.
- No using(true)/with check(true). Additive/idempotent. No DROP TABLE/DELETE/TRUNCATE.
- Decide the viewer read tier (private read vs client-only) — see open questions.
- Output final SQL + a per-role test matrix proving each allowed/denied write.
```

## 6. Open questions / assumptions

1. **Viewer read scope:** do viewers read private dealer data (read-only) or are
   they client-presentation-only? Matrix assumes read-only private access;
   confirm before granting.
2. **property_editor breadth:** properties only, or also clients/follow-ups tied
   to their properties? Assumed properties only.
3. **manager settings:** may managers edit branding (`dealer_settings` non-billing
   columns)? Assumed yes; billing/account owner-only.
4. **profiles/team management:** exact owner UPDATE policy shape (prevent
   privilege escalation / dealer_id changes) — Codex to design.
5. **`team` legacy role:** the generic `team` role still exists in the enum and in
   `plotmap_is_staff()`. Map it to `manager`-like or a distinct tier? Assumed it
   keeps today's broad staff write until re-classified.
