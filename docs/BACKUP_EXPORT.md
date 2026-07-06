# Backup, Export, Import & Recovery

Last updated: 2026-07-06.

## Export

Owner dashboard → **Backup & recovery** → *Export dealer backup (JSON)*.

Exports the current dealer's scoped data: `dealerSettings, users, staff, areas, clients, properties, followups, siteVisits, deals, shareLinks, auditLogs, presentationEvents, pins, mapDrawings` — plus the dealer record and an `exportedAt` stamp. **No secrets are exported** (no keys, no sessions, no passwords — none exist in the data layer).

Map overlays drawn in Map Studio live in `plotmap_overlay_store_v1` and sync to Supabase `map_overlays`; they are not yet part of the JSON export (see NEXT_TASKS).

## Import (validated — never silent)

*Import dealer backup* runs a **dry-run first** (`PMFoundation.validateSnapshot`):
1. File must parse as JSON with a `collections` object; unknown/invalid collections are reported and skipped.
2. A per-collection summary is shown: `X new, Y will be overwritten`.
3. Nothing is applied until the owner confirms the summary dialog. Cancel = zero changes.
4. Applied rows are re-stamped to the current dealer, marked `syncStatus: pending`, and queued for cloud sync.
5. The import itself is audit-logged (`dealer_snapshot_imported`).

## Recovery procedure

1. Keep a dated export before risky changes (the export filename includes the date).
2. To recover: sign in as owner → Import dealer backup → pick the file → review the dry-run counts → confirm.
3. After import the page reloads and the sync queue pushes restored rows to Supabase in the background (watch the sync badge in the topbar).
4. If cloud data is newer than the backup, remote pull may re-merge newer rows — the merge is id-based, newer-wins, and never clobbers local rows still marked pending.

## Rules

- Do not overwrite existing data silently — enforced by the dry-run + confirm flow.
- Do not export secrets — nothing secret exists in the exported collections.
- Client Presentation never sees backups or internal collections.
