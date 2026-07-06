# Offline-Lite Plan

Last updated: 2026-07-06.

PlotMap targets property offices with weak internet. The approach is **offline-lite**: local-first data with a queued sync — not a full offline-sync engine, and deliberately so.

## What works offline today

- **All data is local-first.** CRM data (`plotmap_crm_v1`), overlays (`plotmap_overlay_store_v1`), and settings live in localStorage; every page renders from local data first. If internet drops after a device has been used once, maps/properties/overlays that were cached keep working.
- **Client Presentation offline badge** — "Offline — showing saved maps" appears when connectivity drops (`app/plotmap/app.js`).
- **Admin sync badge** (topbar, every admin page) shows: Offline (+ waiting count), pending count, failed count with tap-to-retry, and last-synced time in the tooltip. Tap = manual "sync now" (retries failed + drains queue).
- **Admin changes queue offline.** Every write enqueues to `PMSyncQueue`; the drain runs when online, with exponential backoff on failures (15s → 5min max). Nothing is dropped silently — failed items stay visible in the badge until they sync.
- **Offline access grace:** admin access checks tolerate up to 24h offline (`OFFLINE_GRACE_HOURS`), then require re-verification.
- **Conflict behavior:** remote pull merges by id, newer-wins, but **never overwrites local rows still marked `syncStatus: pending`** — local unsynced edits win until they've been pushed.

## Known limitations (honest)

- **Map image assets are cached by the browser HTTP cache only.** There is no Service Worker, so a map image never viewed on this device won't display offline. Adding a SW with a cache-first strategy for `maps/**` is the single biggest offline upgrade (see NEXT_TASKS).
- Conflict handling is last-write-wins per record; there is no field-level merge UI. The pending-edit protection prevents the silent-loss case; a visible "conflict warning" list is future work.
- The presentation must be opened online at least once per device to seed data.

## Do not overbuild

Per product decision: no CRDTs, no full offline database, no background sync workers. The current queue + badge + grace window is the intended scope; extend only with the Service Worker asset cache when needed.
