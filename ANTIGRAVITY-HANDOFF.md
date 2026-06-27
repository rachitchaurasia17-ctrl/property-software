# PlotMap — Antigravity Handoff (continue without prior context)

**Repo:** `rachitchaurasia17-ctrl/property-software`
**Local:** `C:\Users\rachi_l35wosr\OneDrive\Desktop\xyz`
**Branch:** `main` · **Latest commit:** `a8db608` (pushed) · working tree clean.

This document is self-contained. Read it fully before editing.

---

## 0. Product logic (do not violate)

- **Client-facing side:** NO price, NO ₹/Rs/Cr/crore/lakh/budget/amount, NO "sold",
  NO admin/edit controls, NO seller contact, NO commission, NO internal status labels
  (verified/unverified/internal-review/launchTier/processingStatus/etc.), NO raw
  Windows paths, NO "needs tracing". Audit: `node tools/audit-plotmap.js`.
- **Original Map = proof.** **Easy Map / 3D Map = explanation.** **Sector Map = exact plot proof.**
- **Easy Maps are designed MANUALLY by the owner in Figma.** Never auto-generate Easy
  Map geometry or invent roads/blocks/zones.
- **Priority: pitch-ready client product FIRST, then CRM depth (Worker/Owner/Finance).**
- Target users: 45–55 yr old Indian property dealers. Premium, simple, fast, tablet-friendly.

## 1. Architecture (framework-free — no React/TS/bundler/build step)

- Static SPA. Vercel serves files at their repo path via `@vercel/static` (`vercel.json`).
- Local dev: `node tools/server.js` → http://localhost:5173/app/plotmap/ (honors `PORT`).
- Asset URL convention is **`/public/plotmap-assets/...`** (works local + Vercel).

## 2. Exact files — what controls what

| Concern | File |
| --- | --- |
| **Client visible UI / shell / routing-by-state** | `app/plotmap/app.js` (one big IIFE: render(), planHTML(), buildMap(), all sections) |
| Client HTML entry + script includes (+ `?v=` cache-bust) | `app/plotmap/index.html` |
| All client styling | `app/plotmap/styles.css` |
| Shared core: categories, **areas/cities**, dataset registry | `app/plotmap/data.js` (`window.PM`) |
| Aerocity dataset (roads/blocks/zones/pins/properties/assets) | `app/plotmap/datasets/tricity.dataset.js` |
| **Maps geometry** (real traced paths, keyed by svgId) | `app/plotmap/geo.json` |
| **Sector map library** (184 entries) | `app/plotmap/map-assets.manifest.json` (+ `map-assets.grouped.json`) |
| **Sector map pins** (client pins data) | `app/plotmap/datasets/sector-pins.js` (`window.PM_SECTOR_PINS`) |
| **Admin: Command Center + Maps Manager + Pin Manager + Future** | `admin/maps.html` (self-contained) |
| Admin: A/B/C/D highlight-set editor | `admin/editor.html` |
| Older admin (do not rely on) | `admin/index.html`, `admin/prebuilt.html` |
| Dev server | `tools/server.js` · No-price audit | `tools/audit-plotmap.js` · Deploy | `vercel.json` |

**Worker Dashboard / Owner Dashboard / Finance Page: DO NOT EXIST YET (Phase B).**

## 3. Map mode model (in `app.js`)

`state.mapMode` ∈ `original | easy | markings`. `mapKind()` resolves it; falls back to
`original` if a mode's asset is missing. Capability gates: `easyMapAvailable()` =
`DS.assets.overlayGeo`; `markingsAvailable()` = `DS.assets.markings`;
`premiumMasterMode()` = markings if available else original.

- Client bar (this session) = **"3D Map" + A B C D** only. `#mode3d` button resets to base
  view. Default `state.mapMode = 'markings'` (the "3D Map").
- `origSVG()` builds the overlay for both `original` and `markings` (real geo.json paths):
  roads (`.o-road` + always-on `.o-hit`), blocks (`.o-block`), zones (`.o-zone`), pins
  (`.o-pin`), and an always-on transparent hit layer `.o-fillhit` (blocks/zones/pins) so
  clicking the photo selects+highlights. `#oSpot` = road spotlight.
- `easySVG()` builds the geometry-accurate Easy Map (`.eg-*`). Easy Map currently has NO
  client button (hidden); reachable only by setting `state.mapMode='easy'` in code.
- Selecting an item → `selectItem()` → adds to `state.selectedIds` + `state.activeCats`;
  `updateMapOverlays()` applies `.act`/`.dim`/`.show`/`.hide`/`.soft`.

## 4. What is COMPLETE (verified in-browser, pushed)

- **Sector Maps (client):** pitch mode shows ~140 usable maps (`pitchModeMaps()`), browser-safe
  paths (`toPublicAssetPath`), matchKey dedup, clean titles/city filters, NO internal labels.
- **Sector Map Viewer:** layer sized to image `dimensions`, zoom/pan/reset, pins overlay.
- **Sector pins:** normalized % coords; click → info card (no price). 
- **Admin Pin Manager** (`/admin/maps.html`): pick map → click image to drop pin → edit →
  Copy/Download `sector-pins.js` JSON (static save workflow).
- **Dealer Command Center** (`/admin/maps.html#dash`): real-data insights (maps ready,
  today's focus, area intelligence, coverage). Internal-only.
- **Unified admin nav** across `maps.html` + `editor.html`.
- **Block-click fix** on the masterplan (the `.o-fillhit` layer).
- **This session:** cache-busting (visibility fix), bar → "3D Map | A B C D", removed
  client-facing Admin/Editor links, POI pins (landmarks/education/IT/entry) shown by
  default, premium 3D block illumination CSS, default mode = markings.

## 5. PARTIAL / RISKY

- **3D Map (markings) block alignment — VERIFY.** Default mode is now `markings`
  (`markings.jpg`, layer `LW=862 LH=1028`, `geoToLayer` offset `(2493,1084)`). The block/POI
  overlay is built from full-geo `geo.json` (`viewBox 0 0 4599 3069`). The overlay alignment
  vs the markings image is **not fully verified** — illuminated blocks may be slightly off.
  **If it looks off for the pitch, one-line fix:** make `premiumMasterMode()` return
  `'original'` (the full proof masterplan is definitely aligned) and/or set default
  `state.mapMode='original'`. The user said to pause 3D-map work — do this verification first.
- **New Chandigarh / Zirakpur masterplans:** NO masterplan images exist. Areas are
  `live:false` in `data.js`. Their SECTOR maps ARE in the library (New Chandigarh ~43; Zirakpur
  none in manifest). To activate a city masterplan: add `public/plotmap-assets/<city>/<city>-original-web.jpg`,
  create `datasets/<city>.dataset.js` with only `assets.original` + `IMG_W/IMG_H`, point the
  area `dataset` + set `live:true` in `data.js`. (Easy Map/3D-blocks toggles auto-hide if no
  overlayGeo/markings — no broken buttons.) Do NOT guess which existing image is which city;
  `new_map_files/` is Aerocity Easy-Map tracing material, not a new-city masterplan.
- **Production images:** `public/plotmap-assets/processed/` is **gitignored** → ~140 sector
  thumbnails work LOCALLY but are **broken on Vercel** until the folder is deployed (commit it
  + add `public/plotmap-assets/**` to `vercel.json`, OR host externally + repoint manifest).
- **Pins save = local/static** only (no backend write). Supabase is frontend anon-key only
  (powers A/B/C/D `prebuilt_maps`, which needs `supabase_setup.sql` run once or it highlights nothing).

## 6. Known bugs / notes

- `panelHTML()` (right category/layer panel) is defined in `app.js` but NOT mounted; masterplan
  interaction is via map clicks + A/B/C/D. (Mounting it is a viable enhancement.)
- A/B/C/D highlight sets need the Supabase `prebuilt_maps` table (else they highlight nothing).
- Headless screenshots of large map images time out (tooling only; product is fine).

## 7. Manual checks before the pitch

1. Hard-refresh the deployed site (cache-bust `?v=8` should now show all changes).
2. Open Aerocity → confirm bar = "3D Map | A B C D", POI pins visible, no Admin/Editor links.
3. Click a block → confirm it illuminates and **aligns with the image**. If misaligned, flip
   `premiumMasterMode()`/default to `'original'`.
4. Sector Maps tab → ~140 cards, thumbnails load (locally), Open → viewer zoom/pan + pins.
5. `/admin/maps.html` → Command Center + Pin Manager work.
6. Confirm NO price / sold / internal labels anywhere client-facing.

## 8. Data structures present

- `window.PM` (data.js): `categories[]`, `areas[]`, `datasets{}`, helpers.
- Dataset (tricity): `assets{original,overlay,overlayGeo,markings,sector}`, `keyRoads[]`,
  `blocks[]`, `zones[]`, `pins[]`, `properties[]` (8 demo Aerocity properties), `sectorMaps[]`, `filters{}`.
- `window.PM_SECTOR_PINS` (sector-pins.js): `{ "<mapId>": [ {id,title,type,x,y,size,block,roadFacing,status,notes,image} ] }`.
- **No CRM entities yet** (clients/events/follow-ups/site-visits/deals/commissions). Phase B.

## 9. Routes / pages

- Client: `/app/plotmap/` (state-driven sections: Masterplan, Properties, Sector Maps).
- Admin: `/admin/maps.html` (#dash/#maps/#pins/#future), `/admin/editor.html`.
- **No `/worker`, `/owner`, `/finance` yet.**

---

## 10. EXACT NEXT PROMPT FOR ANTIGRAVITY

> You are continuing **PlotMap** (`rachitchaurasia17-ctrl/property-software`, local
> `C:\Users\rachi_l35wosr\OneDrive\Desktop\xyz`, branch `main`). Read `ANTIGRAVITY-HANDOFF.md`
> first — it documents the whole project; you do not need prior chat history. It is a
> framework-free static SPA (no React/TS/build). Run locally with `node tools/server.js`
> (http://localhost:5173/app/plotmap/). Always run `node --check` on changed JS and
> `node tools/audit-plotmap.js` before committing. Commit in small stable units; push to
> `origin main`; never `git add .` (do not commit `.agents/`, `.mcp.json`, `skills-lock.json`,
> `new_map_files/`, or `public/plotmap-assets/processed/`).
>
> **FIRST (pitch-critical, ~30 min):**
> 1. Verify the masterplan "3D Map" (default `state.mapMode='markings'` in `app.js`): open
>    Aerocity, click a block, confirm the illuminated block **aligns with the image**. If it
>    is misaligned, change `premiumMasterMode()` in `app.js` to return `'original'` and set the
>    default `state.mapMode`/`resetPlan` mapMode to `'original'` (the full proof map is aligned).
>    Keep the bar as "3D Map | A B C D". Commit.
> 2. Confirm client-facing has NO price/sold/admin links/internal labels (run the audit).
>
> **THEN build PHASE B — the CRM, as separate admin pages (do NOT touch the client-facing
> `app/plotmap/` experience except to log analytics events).** Keep the client side clean.
>
> Build with a clean local data layer first (localStorage + a `admin/crm-data.js` seed module
> with realistic Tricity demo data clearly marked `demo:true`), structured so it can later move
> to Supabase. Entities: Users/Staff, Clients (+statuses), Properties, MapPins, MapHighlights,
> Activities/Events, Follow-ups, SiteVisits, Deals, CommissionRecords. Most insights compute
> from the Events table.
>
> Create these new admin pages (reuse the `admin/maps.html` premium style + shared top nav;
> add nav links Worker / Owner / Finance):
> - **`admin/worker.html` — Worker Dashboard:** big action cards — Add Client, Add Property,
>   Manage Pins (link to maps.html#pins), Today's Follow-ups, Update Client Status, Schedule
>   Site Visit, Mark Deal Closed, Add Note, Archive Property. Add Client form (required: name,
>   phone; rest optional incl. admin-only budget). Client Profile + auto activity timeline.
>   Client statuses: New/Interested/Warm/Property Shared/Site Visit Planned/Site Visit Done/
>   Negotiation/Closed/Not Answering/Lost/Future Client (one-tap change). Follow-up + Site Visit
>   forms. Property add/edit/archive (no hard delete). All writes log Events.
> - **`admin/owner.html` — Owner Dashboard (insights only, owner reads, never edits):** 13
>   sections — AI Daily Report (rule-based summary from Events, business-internal language only,
>   no market-wide claims), Priority Clients to Call, Follow-up Command Center, Today's Focus,
>   Client Interest by Area (High/Rising/Stable/Low), Inventory Health, Demand vs Inventory Gap,
>   Most Viewed/Shared, Missed Opportunity Alerts, Client Pipeline (counts by status), Site Visit
>   Tracker, Staff Activity Summary, Silent/Non-Responsive Clients. Premium cards, 2-second
>   readable, not graph-heavy. Tiny finance preview card OK; detail lives in Finance.
> - **`admin/finance.html` — Finance Page (owner-only):** Monthly Money Summary, Deal Entry,
>   Commission Tracker (received/pending/overdue), Revenue Analytics (area/type/staff/client/
>   month/source), Client Revenue & Value Tracking, High-Value Clients, Pending Money, optional
>   Expenses → net profit. Money lives ONLY here (₹ allowed here — it is admin/owner, not client).
>
> **Activity tracking:** add a tiny `logEvent(type, meta)` helper used by both the client app
> (property_viewed, map_opened, easy/original/sector_map_opened, property_shared_whatsapp,
> search_performed, highlight/road/landmark_clicked) and the worker pages (client_added,
> status_changed, followup_*, site_visit_*, deal_closed, commission_added, pin/highlight_*).
> Store events in localStorage (and the seed module) keyed for owner-dashboard computation.
>
> **AI report** = rule-based summary computed from real stored Events (no fake numbers; if no
> data, honest empty state). Use "based on your PlotMap activity" language, never "hottest in Tricity".
>
> Scope control: if limited, finish (a) the 3D-map verification, (b) the CRM data layer +
> seed demo data, (c) Worker Dashboard (Add Client + Client Profile + Add Property + statuses +
> follow-ups), (d) Owner Dashboard shell with the 13 cards reading real/seed data, (e) Finance
> shell with Deal Entry + Commission Tracker. Quality over breadth. Commit after each.
>
> At ~85% context: stop, run checks, commit/push, and append a "## Continuation" section to
> `ANTIGRAVITY-HANDOFF.md` listing done / partial / next steps + exact next prompt.

## CRM Foundation Complete

### Work Completed
- Implemented the PlotMap Admin Gateway (/admin/index.html).
- Built the shared data layer (crm-store.js and crm-data.js) with demo data.
- Created a modular design system (crm-ui.css).
- Created the Team Workspace (Clients, Properties, Follow-ups, Site Visits, Deals, Map Studio).
- Created the Dealer Command Center (Business Pulse, Area Intelligence, Finance).
- Implemented logEvent tracking in the client-facing app.
- Verified pitch-safety of the client app (aligned to original map, no admin links).

### Files Changed
- app/plotmap/app.js (Added tracking, fixed map mode)
- admin/maps.html (Added Gateway nav link)
- admin/editor.html (Added Gateway nav link)

### Routes Added
- /admin/index.html (Gateway)
- /admin/team.html (Team Workspace)
- /admin/clients.html (Client Management)
- /admin/properties.html (Inventory Management)
- /admin/map-studio.html (Map Pin/Highlight Editor UI)
- /admin/followups.html (Follow-up Tracker)
- /admin/site-visits.html (Site Visit Tracker)
- /admin/deals.html (Deal Closing)
- /admin/owner.html (Dealer Command Center)
- /admin/area-intelligence.html (Area Insights)
- /admin/finance.html (Finance & Revenue)

### Features Working
- Role gateway branching (Team vs Dealer) via localStorage.plotmap_admin_role.
- Form submission for Clients, Properties, and Deals with localStorage persistence.
- Status updates for Follow-ups and Site Visits.
- Automated owner insights generation based on live data.
- Client-facing logEvent tracking for map interactions.

### Features Partial
- Map Studio UI is a placeholder (canvas needs integration).
- UI is structural, not perfectly styled.

### Known Bugs
- None identified, but UI might break on very small screens.

### Checks Run
- node tools/audit-plotmap.js passed.

### Exact Next Prompt
Redesign the admin UI starting with crm-ui.css to make it look extremely premium, mimicking the Stitch design files. Build out the interactive Map Studio canvas.

## QA & Functional Audit Complete

### What is Actually Working
- **Role Enforcement:** Dealer and Team pages are strictly segregated. Accessing a Dealer page as a Team member redirects back to the Gateway.
- **Client Management:** Adding clients, assigning status, and listing them across the Team and Client pages.
- **Property Management:** Adding properties, archiving them, and listing inventory.
- **Deals & Finance:** Closing deals, tracking total value, and accurately computing received/pending commissions.
- **Activity Tracking:** Scheduling site visits and follow-ups. Marking them as done/missed.
- **Owner Dashboard:** Area Intelligence and Business Pulse compute dynamic insights based on real localStorage CRM data.
- **Client App Safety:** The presentation map is 100% pitch-safe, with event tracking working silently in the background.

### What is still Demo/Static
- **Map Studio:** The Map Studio UI is structurally present but the interactive canvas/pinning system is not yet built.
- **Notifications/Reminders:** There is no active push/alert system for missed follow-ups beyond the Dashboard feed.
- **Authentication:** Roles are currently managed via simple localStorage.plotmap_admin_role rather than secure JWT/Supabase auth.

### What is Broken
- **Nothing critically broken.** The CRM data layer works seamlessly in the browser. 
- (Minor) The UI might look cramped on extremely small mobile screens.

### What Needs Redesign Tomorrow
- The entire Admin interface needs a visual overhaul to look "extremely premium" and match the Stitch design files.
- Forms need better validation and polished input fields.

### Exact Next Steps
Redesign the admin UI starting with crm-ui.css to make it look extremely premium, mimicking the Stitch design files. Build out the interactive Map Studio canvas.

## Phase 2: Visual Polish + Map Studio Rebuild Complete

### What Was Visually Improved
- Rewrote crm-ui.css from scratch � new design tokens, shadows, spacing, consistent border-radius, premium SaaS feel.
- Topbar: sticky header, better proportions, brand icon via CSS, dealer-bar variant with gold accent badge.
- Cards: improved shadows, hover effects, better padding/hierarchy.
- Tables: cleaner headers with background tint, tighter rows, subtle hover.
- Buttons: primary/ghost/danger/sm variants with proper transitions.
- Status badges: consistent colors � green (ok), orange (warn), red (err), blue (info), gray (neutral), purple variant.
- Forms: cleaner inputs with focus ring, tighter labels.
- Metric cards: larger numbers, better spacing.
- Action cards: subtle lift on hover with branded icon backgrounds.
- Gateway (index.html): rebuilt with gradient background, polished role cards, clear dealer/team separation.
- Owner page (owner.html): pulse card now uses a branded gradient instead of plain border. Cleaner layout.
- Dealer pages (area-intelligence, finance): switched to dealer-bar CSS class, removed inline styles.

### Map Studio Status
- Rebuilt from a tiny placeholder into a full 3-column professional editor layout:
  - Left panel: tool buttons (Add Pin, Move Pin, Landmark, Road, Zone, Label), visibility filter, pin list.
  - Center panel: interactive canvas with click-to-place-pin, real coordinate tracking, zoom controls.
  - Right panel: inspector with full pin edit form (title, type, area, X/Y %, linked property, description, visibility, notes, save, delete).
- All pins persist to localStorage CRM store. New pins appear immediately in both the canvas and the pin list.
- Pin markers are color-coded by type (green for property, blue for landmark, orange for road, purple for zone).
- Zoom controls are visual/demo level (CSS transform scale).

### Remaining Design Weaknesses
- No actual map image loaded in Map Studio canvas yet (uses placeholder text). Need to integrate with the actual Aerocity map image.
- Mobile responsiveness is functional but not optimized for phones.
- Empty states on tables are plain text, could use icons/illustrations.
- No dark mode variant.
- UI is clean/professional but not yet luxury/Stitch-level premium.

### Checks Run
- node --check admin/crm-data.js passed.
- node --check admin/crm-store.js passed.
- node tools/audit-plotmap.js passed.
- Role enforcement verified: Team pages redirect to gateway for non-team users. Dealer pages redirect for non-dealer users.
- Nav separation verified: Team nav shows ops pages only. Dealer nav shows command/intelligence/finance only.
- Data layer intact: all forms still persist to localStorage.

### Exact Next Step
Load the actual Aerocity map image into Map Studio canvas. Then do the final luxury design pass (Stitch-level) on all admin pages.

## Phase 3: Functional CRM Data Flow QA Complete

### Workflows Confirmed Working End-to-End
- **Admin Gateway:** Role separation correctly branches to Dealer/Team dashboards.
- **Add Client:** Saves to localStorage, reflects in tables.
- **Client Status:** Full status lifecycle implemented (New -> Warm -> Property Shared -> Site Visit Planned -> Negotiation -> Closed -> Not Answering). Colors correctly mapped.
- **Add Property:** Saves correctly, respects internalStatus.
- **Follow-ups:** Creation, marking done, and marking missed all work.
- **Site Visits:** Scheduling and marking completed work.
- **Deals:** Saving deals updates all finance totals.
- **Map Studio:** Pin creation, edits, deletion, and visibility changes correctly persist to CRM state.

### Demo-Only Sections / Partial
- Map Studio currently uses a blank canvas instead of the real Aerocity map image. The coordinate system works logically but visually needs the actual image.
- Mobile layouts are basic/functional but not refined for true mobile usage.

### Known Bugs
- None critical at this point. Everything persists locally and data flows between components seamlessly.

### Exact Next Step
- Finalize the **Map Studio** by embedding the actual Aerocity base map image so pins can be placed realistically on real coordinates.
- Proceed to the final Phase 4: **Luxury / Premium UI pass** on all admin components (mimicking the Stitch design).


## Phase 4A: Map Studio Integration Complete

### Workflows Confirmed Working End-to-End
- **Actual Map Integration**: Removed the blank placeholder and integrated the true Aerocity masterplan map image.
- **Precision Pin Placement**: Rewrote CSS and JS event listeners so X/Y coordinates precisely calculate percentage relative to the map image dimensions.
- **Audit Passed**: Client-facing app confirmed pitch-safe.

### Exact Next Step
Ready for Phase 4B: Owner + Finance insight polish.


## Phase 4A.5 Complete � Admin Code Organization

### Current Admin File Structure
Since moving files risks breaking the current hardcoded imports across 14 pages, the files remain safely in the root /admin/ directory. The ideal mapped structure is:
- **Gateway**: index.html
- **Team Workspace**: team.html, clients.html, properties.html, followups.html, site-visits.html, deals.html, map-studio.html
- **Dealer Pages**: owner.html, area-intelligence.html, finance.html
- **Shared Assets**: crm-data.js, crm-store.js, crm-ui.css

### Shared JS Responsibilities
- **crm-data.js**: Contains purely demo state and structural initializations. No heavy rendering.
- **crm-store.js**: Single source of truth for localStorage state. Handles CRUD, logging (logEvent), and insight aggregation (computeOwnerInsights, computeFinanceTotals).
- Note: Small presentation helpers (like fmtINR, statusClass) currently live inline in their respective pages to prevent global namespace pollution without a bundler, but can be extracted to a crm-utils.js if a build step is added.

### Shared CSS Structure
- **crm-ui.css**: Extensively commented into clear sections: Tokens, Reset, Topbar, Layout, Grid, Cards (Metric/Action/Pulse), Buttons, Status Badges, Forms, Tables, Empty States, Map Studio Layout, Gateway.

### Legacy Admin Files
- **maps.html & editor.html**: Legacy PlotMap v1 admin files. They are NOT the primary entry points but have been preserved as they may contain useful logic for future map generation capabilities. Do not rely on them for CRM workflows.

### Checks Run & verified Routes
- node --check admin/crm-data.js (Passed)
- node --check admin/crm-store.js (Passed)
- node tools/audit-plotmap.js (Passed)
- All primary CRM routes verified unbroken.

### Known Risks
- Extracting scripts or styles into subdirectories (/admin/js/ or /admin/assets/) risks breaking existing <script> tags across a dozen pages. For stability, they remain in /admin/.

### Exact Next Step
Ready for Phase 4B: Owner + Finance insight polish.


## Phase 4B Complete � Owner + Finance Insight Polish

### What Was Improved
- **Dealer Command Center (owner.html)**: Completely redesigned. Replaced generic CRM forms with an actionable dashboard containing:
  - **Today's Business Pulse**: Dynamic text highlighting the top interest area and active client counts.
  - **Owner Attention Cards**: Call First, Business Leak, Area Moving, Inventory Signal, and Team Movement.
  - **Priority Clients Table**: Filters the top 5 warm/negotiating clients with explicit reasons to call them.
  - **Missed Opportunity Feed**: Flags missed follow-ups and silent clients with priority coloring.
  - **Client Pipeline**: Visual funnel displaying total counts for every status stage.
  - **Staff Activity Summary**: Highlights positive metrics (clients, visits, deals) for each active staff member.
- **Area Intelligence (area-intelligence.html)**: Redesigned for map-first business metrics.
  - **Area Pulse Cards**: Individual cards for each area showing activity status (High Interest, Rising) and client/property counts.
  - **Demand vs Inventory Gap**: Analyzes available inventory against internal client requirements.
  - **Map Activity Insights**: Identifies the most opened maps, shared areas, and viewed properties based on CRM events.
- **Finance Center (finance.html)**: Refined for detailed revenue tracking.
  - **Commission Tracker**: Segments pending commission into 'Due This Week' and 'Overdue'.
  - **Client Revenue & Value**: Highlights top clients by revenue, including 'Repeat' badges.
  - **Revenue Analytics**: Breaks down earned commission by Area, Staff, and Property Type.
- **Data Layer Enhancements**:
  - Expanded crm-data.js to include Zirakpur, Mullanpur, Derabassi, and Airport Road records.
  - Rewrote aggregation logic in crm-store.js (computeOwnerInsights, computeAreaInsights, computeFinanceTotals) to supply rich data structures for the new UI components.

### Files Changed
- dmin/owner.html (Complete rewrite)
- dmin/area-intelligence.html (Complete rewrite)
- dmin/finance.html (Complete rewrite)
- dmin/crm-store.js (Updated insight methods)
- dmin/crm-data.js (Expanded demo data)

### Checks Run
- 
ode --check admin/crm-data.js (Passed)
- 
ode --check admin/crm-store.js (Passed)
- 
ode tools/audit-plotmap.js (Passed)
- Verified that the Owner dashboard no longer contains data-entry forms and functions purely as a read-only insight platform.

### Remaining Issues
- The 'Due This Week' logic in Finance uses a simple 30-day threshold from dealDate since there is no explicit dueDate property on deals yet.

### Exact Next Step
Proceed to the next major phase as instructed by the user.


## Phase 4A.6 Complete � Road/Sector/Block Map Studio

### Status
- **Real Map Display**: Map Studio now displays the exact erotropolis-original-web.jpg image.
- **Road Drawing**: Active. Staff can draw polylines with 'Draw Road', which stores normalized point percentages.
- **Sector Mapping**: Active. Staff can draw polygons with 'Draw Sector', which auto-fills with a light yellow overlay.
- **Block Mapping**: Active. Staff can draw polygons with 'Draw Block', which auto-fills with a light blue overlay.
- **Storage Structure**: Saved locally in window.CRM.mapDrawings alongside other CRM structures. Data uses normalized percentages to remain responsive to window scaling.
- **Export**: Users can export the JSON of drawn layers (Copy or Download) formatted correctly for future SVG generation.

### Limitations
- Users cannot move or drag individual points yet, they must undo the last point during drawing, or delete the entire shape and redraw it.
- Client-facing PlotMap does not yet consume this data; it remains safely in the admin backend.

### Exact Next Step
Proceed to the next major phase as instructed by the user.
