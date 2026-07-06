# QA Checklist

Run after any structural change. Last full pass: 2026-07-06 (local, `node tools/server.js`).

## Entry flow
- [x] `/` shows exactly two cards: **Open Client Presentation** and **Dealer Login** (no Team Login card, no workspace selector)
- [x] Client Presentation opens publicly without login
- [x] Dealer Login opens the inline auth form (Supabase Auth)
- [x] All navigation is same-tab (no `window.open` / `target="_blank"` in active app surfaces)

## Auth & security
- [x] Unauthenticated `/admin/owner.html` → redirect to `/?next=…&reason=missing_session`
- [x] Team-role profile on `/admin/owner.html` → redirect with `reason=role_not_allowed`, safe message shown
- [x] Owner profile sees dealer dashboard; team profile lands on team workspace
- [x] localStorage role keys are display-only; guard requires Supabase session + profiles row
- [x] No service-role key anywhere in frontend (publishable key only)
- [x] Client Presentation body contains no price/₹/sold/seller/commission/finance/internal/draft strings
- [x] Client-side Supabase pull uses `client_safe_properties` view outside `/admin/`

## Navigation
- [x] Dealer nav = Dashboard, Client Presentation, Map Studio, Properties, Area Intelligence, Deals, Client Movement, Property Insights — nothing else
- [x] Team nav = Workspace, Client Presentation, Map Studio, Properties, Deals, Client Movement
- [x] Finance / Reports / Access appear in no nav (single source: `admin/core/nav.js`)

## Redirect routes
- [x] `/admin/index.html` → `/`
- [x] `/admin/finance.html`, `/admin/reports.html`, `/admin/access.html` → `/admin/owner.html`
- [x] `/admin/maps.html`, `/admin/editor.html` → `/admin/map-studio.html`

## Data flow
- [x] Opening a masterplan in Client Presentation writes `presentation_opened` / `map_opened` / `area_viewed` events
- [x] Dashboard "Client sessions today / Map opens today" reflect those events
- [x] Hot areas + Recent client movement populate from presentation events only
- [x] Client Movement page groups events into session timelines
- [x] Area Intelligence & Property Insights count only Client Presentation activity (`computePresentationStats`)
- [x] Admin browsing does not create presentation events (tracker only fires on `/app/plotmap/` path)
- [x] Empty states show friendly copy ("No client activity yet. Open Client Presentation to start tracking.")

## Pages render
- [x] `/admin/owner.html` — dashboard, live registry counts (85 maps / 9 masterplans), sync status
- [x] `/admin/map-studio.html` — loads, publish flow intact, "Present"/"Open in Client Presentation" same-tab
- [x] `/admin/properties.html` — list, filters, add form, Mark Sold fixed (was calling a non-existent function)
- [x] `/admin/deals.html` — clean placeholder
- [x] `/admin/clients.html` — movement timelines with All/Today/7-day filters
- [x] `/admin/property-insights.html`, `/admin/area-intelligence.html` — render with shared nav

## Console
- [x] No console errors or warnings on `/`, `/app/plotmap/`, dashboard, movement, properties, deals, insights, intelligence

## Performance
- [x] Demo data seeds only on localhost (`isLocalDev()`)
- [x] Dashboard loads no finance/command/report engines (script stack trimmed)
- [x] Maps load on demand in presentation; 3D only when a 3D map is selected
- [x] Sync loop unchanged: single debounced drain + 20s interval, failure-tolerant
