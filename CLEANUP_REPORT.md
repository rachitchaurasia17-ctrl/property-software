# Cleanup Report — 2026-07-06

Comprehensive repo cleanup, active-product consolidation, and dealer dashboard
correction pass. Companion docs: `ACTIVE_ROUTES.md`, `LEGACY_FILES.md`, `QA_CHECKLIST.md`.

## What was wrong

1. Root gateway still showed a **Team Login card** (third portal) next to Dealer Login.
2. **Navigation was defined separately in 9+ files** with inconsistent link sets
   (some pages still cross-linked "Clients"/"Workspace"-era nav) — the mechanism by
   which removed pages kept reappearing.
3. The **dealer dashboard was the old CRM design**: a "Business momentum" chart driven
   by `Math.random()` (fake data presented as real), client pipeline, staff activity,
   business signals — none of it PlotMap product truth.
4. `clients.html` was titled "Client Movement" but was an old CRM client list.
5. `deals.html` was a generic CRM deal/commission recorder whose client dropdown had no
   remaining data source.
6. `maps.html` was a second, older map write surface next to Map Studio.
7. `finance/reports/access.html` stubs still loaded the full data stack.
8. Map Studio opened Client Presentation in new tabs (`window.open`).
9. Root was littered with temp/audit debris including a pre-redesign Map Studio backup
   containing retired Follow-ups/Site Visits nav.
10. `properties.html` "Mark Sold" called `CRM.updatePropertyStatus`, which doesn't exist.

## Files changed

- `index.html` — removed Team Login card + its CSS; Dealer Login copy notes team signs in there
- `admin/core/nav.js` — **new**: single navigation source (`PMNav.render`), dealer + team variants, sign-out button
- `admin/owner.html` — **rebuilt**: today's client activity, hot areas, most viewed properties, recent client movement, Map Studio publishing status (live maps/masterplans/published markings/pending drafts), sync status, quick actions; all from Client Presentation events with clean empty states; dropped finance/command/report engine scripts
- `admin/clients.html` — **rebuilt** as real Client Movement: presentation events grouped into session timelines (area opened → map clicked → property viewed → overlay clicked, time-stamped), All/Today/7-day filters
- `admin/team.html` — cleaned: shared nav, presentation activity stats, quick actions; removed CRM client table/quick-add
- `admin/deals.html` — clean placeholder: "Deals will connect property interest to follow-up pipeline."
- `admin/properties.html` — shared nav, trimmed script stack, fixed broken Mark Sold, fixed mojibake
- `admin/area-intelligence.html` — shared nav, removed per-page role chip code, fixed mojibake title
- `admin/property-insights.html` — shared nav, removed per-page owner-name code
- `admin/map-studio.html` — 3× `window.open` → same-tab navigation (no new tabs)
- `admin/core/access-control.js` — route requirement lists cleaned (dropped finance/access/reports/followups/site-visits/maps/editor; added property-insights to owner routes)
- `admin/finance.html`, `admin/reports.html`, `admin/access.html` — converted from data-loading stubs to pure redirects → `/admin/owner.html`
- `admin/maps.html` — replaced with redirect → `/admin/map-studio.html` (original archived)

## Files archived (`archive/legacy/`, with README)

`admin/maps.html` (as `admin-maps.html`), `temp-map-studio-backup.html`,
`temp-bounds.js`, `temp-center.js`, `temp-debug.js`, `temp-render.js`,
`temp-debug.svg`, `temp.svg`, `_audit.js`, `_audit2.js`, `_audit.json`,
`_audit2.json`, `_audit_prev.json`.

## Files removed

`_server.log` (gitignored local log). Nothing else deleted.

## Routes kept / redirected

See `ACTIVE_ROUTES.md`. Summary: public `/` + `/app/plotmap/`; guarded
owner.html / map-studio / properties / area-intelligence / deals / clients
(movement) / property-insights / team; six retired routes are pure redirects.

## Nav cleanup

One nav source (`admin/core/nav.js`). Approved dealer items only. Finance,
Reports, Access are not defined anywhere in navigation and cannot return
through a shared component. All per-page `<nav>` blocks removed.

## Dashboard cleanup

Old: fake momentum chart (random numbers), pipeline, staff widgets, business
signals. New: everything computed from `presentationEvents` (Client
Presentation only) plus map registry and overlay store; honest empty states;
no fake analytics.

## Legacy/demo cleanup

- Demo CRM seed (`CRM_DEMO`) confirmed localhost-only (`isLocalDev()` guard) — never seeds in production
- Old Map Studio backup and old Maps & Pins editor off the deploy path
- Old localStorage role keys remain display-only compatibility; never trusted for access

## Security status

- Supabase Auth + `profiles` role guard (`PMAccess.guardPage`) on every admin page — verified: unauthenticated → login redirect; team on owner page → `role_not_allowed`
- No service-role key in frontend (publishable key only)
- Client Presentation public but safe: event tracker sanitizes payloads (price/contact/commission/notes stripped), overlay store publishes only `published + clientVisible + leak-regex-clean` items, client-side pull reads `client_safe_properties` view
- Verified rendered presentation contains no price/sold/seller/commission/finance/internal/draft strings
- Admin browsing does not count as client analytics (tracker fires only on `/app/plotmap/`)

## Performance status

- Dashboard no longer loads finance/command/report engines; no heavy analytics loops
- Retired routes load zero data (pure redirects)
- Maps/3D unchanged: load on demand in presentation
- Sync loop unchanged (debounced drain + 20s interval); no duplicate listeners introduced; nav rendered once per page

## Tests run

Local server (`node tools/server.js`), full route sweep — see `QA_CHECKLIST.md`.
End-to-end event flow verified: opening a masterplan in Client Presentation produced
`presentation_opened`/`map_opened`/`area_viewed`, which appeared on the dashboard
(sessions/opens/hot areas/movement feed) and analytics pages.

## Console error status

Zero console errors and zero warnings across `/`, `/app/plotmap/`, dashboard,
movement, properties, deals, insights, intelligence.

## Remaining risks

1. **Deals is a placeholder** — the old deal recorder was removed with the CRM client
   list; wiring property interest → follow-up pipeline is the next feature pass.
2. `admin/core/finance-engine.js`, `command-engine.js`, `report-engine.js` are unused
   but still on disk (deploys, unreferenced). Archive next pass after one stable release.
3. Historical markdown docs (`HANDOFF.md`, `LAUNCH-MAP-WORKFLOW.md`, etc.) still
   reference retired routes — docs only, no runtime effect.
4. Presentation events store locally when the `presentation_events` table/RLS is not
   deployed; cross-device analytics needs the Supabase SQL applied.
5. Dealer presenting to a client and dealer casually browsing the presentation are
   indistinguishable — both happen on `/app/plotmap/`. Acceptable for the
   dealer-presents-on-their-device model; revisit if client self-serve links ship.
