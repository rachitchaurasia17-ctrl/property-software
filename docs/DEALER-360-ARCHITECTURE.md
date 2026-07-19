# Dealer 360 — Analytics Architecture

2026-07-19 · branch `developer-intelligence-and-performance` · status: Stage 1
implemented, Stage 2/3 schema drafted (NOT applied to production).

## 1. Principles

1. **One event stream.** `presentation_events` (device-gated ingestion, live
   since the device-lock pass) remains the only event table. No parallel
   analytics system.
2. **Authoritative tables beat events.** Property counts come from
   `crm_records`, device state from `dealer_devices`, account/trial from
   `dealer_settings` — never re-derived from events.
3. **All reads platform-admin-gated.** Every Dealer 360 read is a
   SECURITY DEFINER RPC that raises unless `plotmap_is_platform_admin()`.
   No table is readable by anon/authenticated directly.
4. **Aggregate server-side.** The browser never downloads raw event history
   to compute a metric; the timeline is paginated and date-bounded.
5. **Analytics are secondary.** Ingestion failures queue locally and never
   block maps, properties or Client Presentation (existing PMSyncQueue
   behavior, unchanged).

## 2. Data flow (text diagram)

```
Dealer device (approved)                      Platform admin browser
  app.js / event-tracker.js                     developer.html + dev360.js
        │  logEvent()/trackProductEvent()               │ admin RPCs (session JWT)
        ▼                                               ▼
  PMSyncQueue (localStorage, retry/backoff)      plotmap_admin_dealer_directory   ─┐
        │ drain                                  plotmap_admin_dealer_usage        │ live
        ▼                                        plotmap_admin_dealer_event_…      │ today
  plotmap_record_device_presentation_event       plotmap_admin_list_dealer_devices─┘
   (device gate → validation → INSERT)           plotmap_admin_dealer_360        ─┐
        │                                        plotmap_admin_dealer_events      │ new in
        ▼                                        plotmap_admin_property_stats     │ 20260719
  presentation_events  ──rollup──►               plotmap_admin_platform_overview  │ draft
  plotmap_daily_usage (daily summaries)          plotmap_rollup_daily_usage      ─┘
```

Admin-route dealer events use the legacy `plotmap_record_presentation_event`,
now scoped server-side to the caller's own dealer (device-lock pass).

## 3. What already exists and is reused (audit result, I2)

| Need | Existing source | Status |
|---|---|---|
| Account/trial/status/plan | `dealer_settings` via `plotmap_admin_dealer_directory` | live |
| Usage aggregates (opens, sessions, active days, last active, WA shares, feature counts) | `plotmap_admin_dealer_usage()` | live |
| 30-day per-feature breakdown | `plotmap_admin_dealer_event_breakdown` | live |
| Devices (status, first/last seen, labels, browser info) | `dealer_devices` via `plotmap_admin_list_dealer_devices` | live |
| Activation funnel | `dealer_activation_requests` + admin RPCs | live |
| Event ingestion, device-gated | `plotmap_record_device_presentation_event` | live |
| Presentation/product events | `PMEventTracker` + `PMSyncQueue` + `PMSupaSync` | live |

**Known-unreliable / missing (why the draft exists):** no per-event pagination
for admins (timeline), no property-intelligence aggregation, no platform-wide
overview, no error events, no daily rollups, no server-side event-name
validation (ingestion accepts arbitrary `event_type` strings today), no
session-duration signal, `app_open` not distinguished from `presentation_opened`.

## 4. Event taxonomy (I3)

Existing names are kept (historical continuity). New names added to the
client allowlist and enforced server-side by the hardened ingestion RPC:

- **Lifecycle:** `app_open` (new — see definition), `dealer_login`,
  `presentation_opened`, `session_heartbeat` (NOT used — sessions derive from
  `session_id` + event gaps instead; deliberate)
- **Navigation:** `dealer_dashboard_opened`, `team_workspace_opened`,
  `properties_page_opened`, `map_studio_opened`, `clients_page_opened`,
  `insights_page_opened`, `admin_page_opened`, `client_panel_opened`
- **Maps:** `map_opened`, `area_viewed`, `sector_viewed`,
  `overlay_selected`, `sector_proof_clicked`, `original_proof_clicked`
- **Properties:** `property_add_clicked`, `property_added`,
  `property_selected`, `property_viewed`
- **Sharing:** `property_shared_whatsapp`, `brochure_shared`,
  `property_shared`
- **Health (new):** `app_error`, `asset_load_failure`, `slow_operation`

**`app_open` definition ("PlotMap opened 23 times"):** counted once when a
tab begins a session with no activity in the previous 30 minutes
(localStorage `plotmap_last_activity` gate). NOT counted: route changes,
refreshes inside the window, background tab focus, `/admin/developer.html`,
local-dev activity (tagged `metadata.env='local'` and excluded from
aggregates), automated checks (no approved device token → rejected at
ingestion).

**Session:** the existing per-tab `session_id` (`ps-*`/`as-*`). Session
duration = `max(created_at) - min(created_at)` per session, computed in the
rollup — no extra heartbeat traffic.

## 5. Event structure (I4)

Existing `presentation_events` columns map onto the required structure:
`id` (event_id, client-generated for retry-dedupe via `on conflict do
nothing`), `dealer_id` (server-assigned from the approved device pairing),
`session_id`, `event_type`, `area`, `sector`, `map_id`, `property_id`,
`client_id` (only when explicitly selected), `metadata` (safe JSON; `source`,
`surface`, `env`, `page`, `code`, `duration_ms`), `created_at`.
`device_id`/`profile_id` intentionally NOT added to raw events — device
attribution lives in `dealer_devices.last_seen` and would add a join surface
for little value; revisit if per-device timelines are ever needed.

## 6. Ingestion security (I5) — hardened RPC in the draft

The draft `CREATE OR REPLACE` of `plotmap_record_device_presentation_event`
keeps the device gate byte-identical and adds, in order:
1. event-name allowlist (unknown names rejected),
2. metadata size cap (2 KB) and metadata key strip is client-side (sanitizer),
3. per-device rate cap (≤ 300 events / 15 min / dealer) — flood protection,
4. server timestamp clamp (`p_created_at` accepted only within ±48 h).
Cross-dealer injection remains impossible (dealer↔device pairing is checked
server-side). Suspended/expired dealers remain rejected via the device gate.
Anon/authenticated still have zero direct table access.

## 7. New read surface (draft `20260719_dealer360_analytics_draft.sql`)

- `plotmap_daily_usage` — rollup table (dealer_id, day, app_opens, sessions,
  active_duration_s, presentation_opens, map_opens, highlight_events,
  property_views, whatsapp_shares, errors, events).
- `plotmap_rollup_daily_usage(p_days)` — platform-admin-only upsert of the
  last N days from raw events (idempotent; callable manually or by cron).
- `plotmap_admin_dealer_events(p_dealer_id, p_before, p_limit, p_types)` —
  paginated, date-bounded timeline (≤ 200 rows per call).
- `plotmap_admin_dealer_360(p_dealer_id)` — one-call jsonb summary: account +
  first/last active + session durations + property stats + device stats +
  error stats. One RPC, not N.
- `plotmap_admin_property_stats(p_dealer_id)` — authoritative property
  intelligence from `crm_records` payloads.
- `plotmap_admin_platform_overview()` — platform-wide totals (admin-only).
- Index: `presentation_events (dealer_id, event_type, created_at desc)`.

## 8. Privacy boundaries (I1)

Never collected/displayed: passwords, passcodes, activation codes, tokens or
hashes, auth headers, seller contacts, internal notes, commission/finance,
keystrokes, screenshots, clipboard, GPS, raw IPs. `browser_info` on devices
is the short parsed label the activation flow already stores. Admin/developer
browsing: `/admin/developer.html` never emits events; admin-surface events
are tagged `surface='admin'` and separated in the UI; `env='local'` excluded
from aggregates. End-buyer presentation activity stays anonymous
session-level unless a client record was explicitly selected (existing
behavior, unchanged).

## 9. Retention & performance (I14)

Raw events: keep 180 days (documented target — **no deletion is implemented
in this task**; a future reviewed job may enforce it). `plotmap_daily_usage`
rollups: kept indefinitely (tiny). All list queries indexed + bounded;
timeline pages of ≤ 200; Dealer 360 = 1 summary RPC + lazy per-tab RPCs.

## 10. Staged rollout

- **Stage 1 (this branch, live-backend compatible):** Dealer 360 UI on the
  existing RPCs — overview, health states, device tab, property counts where
  available, upgraded dealer list, platform overview computed client-side
  from the directory+usage+devices responses already loaded.
- **Stage 2 (after the draft is applied):** timeline, property intelligence,
  platform overview RPC, hardened ingestion, `app_open`/error events.
- **Stage 3:** daily rollups + duration metrics + error intelligence panels
  (RPCs ship in the same draft; UI unlocks automatically when they exist —
  the page probes and degrades honestly, the same pattern as before).
- Production rollout steps are listed at the end of the migration file.

## 11. Health states (I12) — transparent, no ML

Computed in `dev360.js` from visible signals; the reason string is always
shown next to the badge. States: Not activated · Activated but unused ·
Exploring · Actively using · Presentation-ready · Highly engaged · At risk ·
Inactive · Expired · Suspended. Exact thresholds live in one commented
function (`healthFor()`), designed to be tuned by reading, not reverse-
engineered. Suggested actions are advisory strings derived from the same
signals (call dealer, approve device, extend trial, investigate errors…).
