# Supabase Setup & Migration Order

Last updated: 2026-07-06.

## ⚠️ Warnings first

- **Do NOT rerun `supabase_setup.sql`.** It is retired and recreates unsafe permissive policies (public read/write). It exists in the repo only as history.
- Use **only** files under `supabase/migrations/` going forward, in filename order.
- Never put the service-role key anywhere in the frontend or this repo.

## Current live state (before this sprint's migration)

Applied earlier, in this order:
1. `supabase_setup.sql` (legacy — do not run again)
2. `supabase_security_patch.sql` — profiles table, `plotmap_*` helper functions, dealer-scoped staff RLS on `crm_records` / `map_overlays` / `prebuilt_maps`, append-only anon insert on `presentation_events`, `client_safe_properties` view.

## Pending migration (NOT yet applied)

`supabase/migrations/20260706_saas_foundation_scaffold.sql`

What it adds (all idempotent — safe to re-run; no drops/deletes/truncates):
- `profiles`: `display_name`, `permissions jsonb`, `metadata jsonb`; role check widened to `owner|team|manager|map_editor|property_editor|viewer`.
- Hardened `plotmap_is_staff()`: excludes `viewer`, requires `status = 'active'`.
- `dealer_settings` table (branding, contact, presentation text, storage, plan/trial/limits).
- `share_links` table + unique slug index + **`plotmap_resolve_share_link(text)` RPC** (security definer, anon-executable, returns only client-safe fields for active non-expired links).
- `audit_logs` table (append-only: SELECT + INSERT policies only).
- Staff-scoped RLS on all three tables; no anon table access.

## Exact application steps

1. Open the Supabase dashboard → SQL Editor (or use `supabase db push` if the CLI is linked).
2. Verify the security patch is live: `select public.plotmap_is_staff();` should exist (returns false for the SQL editor session — that's fine).
3. Paste the full contents of `supabase/migrations/20260706_saas_foundation_scaffold.sql` and run it once. It is safe to run even if parts already exist.
4. Verify:
   - `select * from public.dealer_settings limit 1;` (empty is fine)
   - `select public.plotmap_resolve_share_link('nonexistent');` (returns 0 rows)
   - `select permissions from public.profiles limit 1;`
5. Nothing in the frontend needs a deploy for this — the app detects the new columns/RPC automatically (it falls back gracefully while they're missing).

## What stays local-first until the migration is applied

`dealerSettings`, `shareLinks`, and `auditLogs` records currently sync through the generic `crm_records` table (staff-RLS-protected), so nothing is lost pre-migration. The dedicated tables + RPC turn on: per-member permissions from the profile, server-side share-link enforcement, and normalized audit rows.

## Storage (property photos) — future setup

Planned, not yet created:
1. Create bucket `property-photos` (private).
2. Folder convention: `dealers/<dealer-id>/properties/<property-id>/…` (the app already computes this via `PMFoundation.photoFolderForProperty`).
3. RLS storage policies: staff of the dealer can write to their folder; public read only if the dealer enables it (or serve via signed URLs).
4. Set `storage_enabled = true` in `dealer_settings` once policies are in place.

Until then, photo entry is URL-based (validated `https://` links, max 8 per property) and keeps working unchanged.
