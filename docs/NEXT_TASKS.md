# Next Tasks

Last updated: 2026-07-06 (after the SaaS foundation sprint).

## Blocked on the migration being applied (highest priority)

1. **Apply `supabase/migrations/20260706_saas_foundation_scaffold.sql`** — steps in SUPABASE_SETUP.md. Until then: per-member custom permissions, share-link revocation, and normalized dealer_settings/share_links/audit_logs tables are local-first scaffolds (they sync via `crm_records`).
2. After applying: smoke-test a disabled share link (should show "no longer active"), and confirm `profiles.permissions` round-trips into the admin guard.

## Backend hardening (next sprint candidates)

3. **Owner-managed profiles:** RLS policy + UI so the owner can edit other profiles' `role`/`permissions`/`status` for their dealer (today profiles are self-read-only; role changes are Supabase-side).
4. **Per-scope RLS:** e.g. block `map_overlays` writes with `status='published'` for profiles lacking `mapstudio.publish` (mirror the frontend guard server-side).
5. **Server-side audit sink:** write audit rows into the dedicated `audit_logs` table instead of `crm_records` payloads once the table is live (change `tableFor('auditLogs')` mapping in `supabase-sync.js`).
6. **Supabase Storage bucket** for property photos + upload UI (plan in SUPABASE_SETUP.md; app already computes per-dealer folder paths and hydrates `photoStorage` entries).

## Product

7. Include Map Studio overlays (`plotmap_overlay_store_v1`) in the JSON backup export.
8. Service Worker cache-first for `maps/**` images — the remaining gap for true offline presentations (OFFLINE_PLAN.md).
9. Owner-facing audit log page (full list + filters); today the owner dashboard shows the 8 most recent entries.
10. Map-count plan limit enforcement in Map Studio (display-only today).
11. Share-link open counts surfaced in the share-links card (events already carry `shareSlug`).

## Explicitly out of scope (do not re-add)

- Payment integration (billing is readiness-only)
- Finance / Reports / Access pages
- Full offline sync engine (offline-lite is the product decision)
- Separate team login
