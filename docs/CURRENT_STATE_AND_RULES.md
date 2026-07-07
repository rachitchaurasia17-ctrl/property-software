# PlotMap — Current State & Rules

_Last updated: 2026-07-07 · branch `phase-1-5-role-and-isolation-prep`_

This is the single orientation doc for anyone (Claude, Codex, Antigravity, or a
human) picking up PlotMap. Read it before touching code, SQL, or infra.

---

## 1. Completed phases

| Phase | Status | What it delivered |
| --- | --- | --- |
| **Phase 0** | ✅ Done | Baseline app: Client Presentation + admin, local-first data, map assets. |
| **Phase 1** | ✅ Done | SaaS foundation migration audited, applied, post-migration checks passed. `profiles`, `dealer_settings`, `share_links`, `audit_logs` + RLS helpers live. Owner profile active (`rachitchaurasia17@gmail.com`, role `owner`, `dealer-demo`, active). |
| **Phase 1.5** | ✅ Done (this branch) | Role architecture split: root 3-card landing, Dealer vs Team nav separation, Team Workspace shell, `docs/ROLE_ARCHITECTURE.md`, additive audit checks. |

**Phase 2 (multi-dealer isolation)** and **Phase 3 (team-permission RLS)** are
**PREP ONLY** on this branch — handoff docs + *draft, unapplied* migrations.
Final RLS approval and application is Codex's job, later.

## 2. Current architecture — three surfaces

1. **Client Presentation** — `/app/plotmap/`. Public, read-only, client-safe.
   No password. The buyer-facing living map.
2. **Dealer Login** — `/` → Dealer Login card → Supabase auth. Owner
   business-intelligence command center (Dashboard, Area Intelligence, Client
   Movement, Property Insights).
3. **Team Workspace** — `/` → Team Workspace card. Staff daily-work table
   (Workspace, Properties, Map Studio). Real Supabase session remembered on
   the device; not globally public. See `docs/ROLE_ARCHITECTURE.md`.

Nav is defined once in `admin/core/nav.js` (`PMNav`). Nav visibility is UX;
real access is `PMAccess.guardPage` (browser) **+ Supabase RLS** (the actual
boundary).

## 3. Absolute forbidden Client Presentation data

Client Presentation must **never** expose:
price · sold status · seller contact · commission · finance · internal notes ·
staff data · owner-only data · admin controls · draft maps · hidden maps ·
archived maps.

Only **published + client-visible + not-deleted** rows may reach it. Enforced
by the dataset build, the `client_safe_properties` view, and the client-safe
word audit (`tools/audit-plotmap.js`). Do not add price/finance wording to any
`app/plotmap/*` file.

## 4. Map Studio must not be replaced

The **current** Map Studio (`admin/map-studio.html`, `admin/core/overlay-store.js`,
the overlay engine, publishing, A/B/C/D groups, highlight system, canvas,
drawing flow) is production. The Map Studio in the UI/UX redesign handoff zips
is **old/different** and must **not** replace it. Redesign work is landing +
Team Workspace visual direction only.

## 5. Supabase / RLS safety rules

- **Do NOT** apply migrations, run SQL, or touch Supabase from this workflow.
  Codex applies migrations after review.
- **Do NOT rerun `supabase_setup.sql`.** It recreates permissive public
  policies and is retired. The live baseline is `supabase_security_patch.sql`
  followed by `supabase/migrations/20260706_saas_foundation_scaffold.sql`.
- No service-role key in the frontend. Anon key only.
- Private tables: no `using(true)`, no `with check(true)`, no anon read/write.
- Never weaken existing RLS. Changes must tighten or stay equal.
- Draft migrations are additive/idempotent: no `DROP TABLE`, `DROP DATABASE`,
  `DELETE FROM`, or `TRUNCATE`.

## 6. Tool strategy

| Tool | Responsibility |
| --- | --- |
| **Claude** | Build, refactor, UI, docs, draft migrations, local checks. |
| **Codex** | SQL / RLS review + approval + application. All policy changes go through Codex before they touch Supabase. |
| **Antigravity** | QA — including the two-dealer isolation test checklist in `docs/MULTI_DEALER_ISOLATION_HANDOFF.md`. |

## 7. Next-phase checklist

- [ ] Codex audits `docs/MULTI_DEALER_ISOLATION_HANDOFF.md` + the Phase 2 draft
      migration; hardens public/anon read + `presentation_events` insert.
- [ ] Codex audits `docs/TEAM_PERMISSION_RLS_HANDOFF.md` + the Phase 3 draft
      migration; splits coarse staff write into per-role capabilities.
- [ ] Apply approved migrations to a Supabase **branch/staging** first, never
      straight to production.
- [ ] Antigravity runs the two-dealer isolation checklist against staging.
- [ ] Only then: promote to production.

## 8. ⚠️ Warnings

- **Do not rerun `supabase_setup.sql`** (permissive public policies — retired).
- Team Workspace "passwordless feel" is a device-remembered real session, **not**
  an independent security primitive — needs Codex/RLS review before production
  trust (see `docs/ROLE_ARCHITECTURE.md`).
- Multi-dealer isolation is **not production-trusted** until Codex audits and
  applies the Phase 2 RLS work.
