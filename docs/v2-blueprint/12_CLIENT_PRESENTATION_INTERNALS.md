# 12 · Client Presentation Internals

Sources: `app/plotmap/index.html`, `app/plotmap/app.js` (2213), `app/plotmap/data.js`,
`app/plotmap/styles/violet-dusk-foundation.css`, `admin/core/event-tracker.js`,
`admin/core/device-access.js`. `VERIFIED-CODE`.

## What it is

`/app/plotmap/` is the **full-screen, in-person selling surface** the dealer opens to show a
walk-in customer maps and properties. It reuses the map engine (`11`) and the CRM store, and
records **presentation events** for analytics. The dealer shell links to it via a "Show Map
to Customer" CTA that opens `/app/plotmap/` in a new tab (`plotmap-shell.js:145-149`).

## Gate
The presentation page is gated by **`PMDeviceAccess`** (device approval), not the admin
`guardPage`. `viewer` role is allowed here (and only here). `VERIFIED-CODE`
`app/plotmap/index.html` includes `device-access.js`; `auth.routeForRole` sends viewers to
`/app/plotmap/`.

## Initialization (see `02` for full list)
Loads runtime config → Supabase JS SDK (CDN) → map registry + datasets → CRM store + sync →
device-access + overlay store/engine → `app.js`. Assets are `?v=N` cache-busted.

## Event tracking (initialization + interaction)
`trackPresentationEvent(eventType, payload)` (`event-tracker.js:141-194`):
- Only fires on `^/app/plotmap/?$`.
- Ensures `app_open` is recorded+saved first (ordering guard, `10`).
- Resolves dealer/user from the adapter, sanitizes payload, env-tags metadata
  (`source='client_presentation'`).
- Persists to local `presentationEvents` and enqueues a sync action; triggers
  `PMSupaSync.requestDrain()`.
- Session id in `sessionStorage['plotmap_presentation_session']`.

`presentation_events` is **append-only** server-side (anon may INSERT only). **Never upsert.**
`VERIFIED-CODE` `supabase-sync.js:235-238`.

## Client-safe rules
Presentation runs on the dealer's own device with the dealer's session, so it can show more
than a Private Client Link — but the project keeps explicit `CLIENT_PRESENTATION_RULES.md` /
`CLIENT_SAFE_DATA_RULES.md` docs governing what is appropriate to show. The **hard** client-
safe boundary is enforced only on the Private Client Link path (`13`), which is a different,
tokenized, server-frozen surface. `VERIFIED-CODE` (doc files exist) / `INFERENCE`.

## Presentation flow (Mermaid)
```mermaid
flowchart TD
  A[Dealer clicks 'Show Map to Customer'] --> B[/app/plotmap/ opens]
  B --> C[PMDeviceAccess gate]
  C -->|approved| D[Load map registry + CRM]
  D --> E[app_open event recorded + saved]
  E --> F[Dealer selects map / property / sector]
  F --> G[trackPresentationEvent(...) → local + presentation_events]
```

## Known risk
Report/handoffs flag "map cropping and distortion" specifically in Client Presentation —
Original/Easy toggle, zoom, Fit Map, sector maps, and the photo rail must all render without
clipping. Regression test in `24`. `REPORT-CLAIM`/`HISTORICAL`.

## V2 decision
**ADAPT.** Keep the engine intact and the event contract; rebuild the presentation *chrome*
(header, controls, photo rail) in the V2 design system around the ported engine. Drop the
CDN Supabase SDK dependency (self-host or use the same REST approach as admin pages).
