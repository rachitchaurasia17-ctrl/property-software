# PlotMap violet-dusk redesign — implementation handoff

Foundation phase. Branch `feat/plotmap-violet-dusk-redesign` (off `main` @ `13e22f8`).
No migrations applied, no production deploy, no staging. This document is the
contract for continuing the remaining route migration without reinterpreting the
design.

## Files created / changed

| File | What |
|---|---|
| `admin/core/plotmap-ds.css` | **NEW** — the design system: `--pm-*` tokens (violet-dusk), Newsreader/Hanken type, buttons/inputs/cards/nav/badges/tabs/dialogs/drawers/alerts/loading/empty/error, the dealer **app shell** chrome, tables, toasts, filter pills, responsive. |
| `admin/core/plotmap-shell.js` | **NEW** — `window.PMShell`: `.mount({variant,active,section})` renders the sidebar (owner/team nav) + header + scroll region; `.toast()`, `.confirm()`, `.esc()`, `.dateStr()`. |
| `admin/core/plotmap-client-links.js` | **NEW** — `window.PMClientLinks` frontend contract for Private Client Links (honest pending until backend enabled). Full backend contract documented in-file. |
| `index.html` | Landing + device gate re-skinned; **all** gate wiring preserved. |
| `admin/access-expired.html` | Guard screen re-skinned; 7 reason states preserved. |
| `admin/owner.html` | **Canonical Dealer Home** — design Home wired to real demand data + preserved settings drawer. |
| `admin/properties.html` | **Canonical My Plots** — design + all handlers + Client Link entry points. |
| `app/plotmap/index.html` | Added Newsreader/Hanken fonts + the foundation layer link. |
| `app/plotmap/styles/violet-dusk-foundation.css` | **NEW** — presentation chrome re-tint (token remap + signature chrome). Engine untouched. |

## Shared shell structure (`PMShell.mount`)

```
<div class="pm-shell">                      (flex, 100vh)
  <aside class="pm-shell-aside">            270px; logo · nav · "Show Map to
                                             Customer" CTA · owner footer
  <div class="pm-shell-main">
    <header class="pm-shell-header">        section icon+name · date · account pill
    <div class="pm-shell-scroll" #pm-shell-scroll>   ← mount() RETURNS this; page fills it
```
- `variant:'owner'` → nav: Home `/admin/owner.html` · My Deals `/admin/deals.html`
  · My Plots `/admin/properties.html` · My Customers `/admin/clients.html`
  · Client Links `/admin/properties.html#client-links`.
- `variant:'team'` → Workspace `/admin/team.html` · Properties `/admin/properties.html`
  · Map Studio `/admin/map-studio.html`.
- Identity/account read from `PMFoundation.getDealerSettings()` / `getAccountGate()`;
  generic fallbacks ("Dealer", "Your workspace") — never fabricated sample names.

## Component & class conventions

- **One stylesheet per page.** A migrated page loads **only** `plotmap-ds.css`,
  **never** the legacy `admin/crm-ui.css` — both define `.pm-*`/`--pm-*` with
  different values. `crm-ui.css` stays only until every route is off it.
- Reuse DS classes; do **not** hand-roll per-page palettes. Page-specific layout
  goes in a small `<style>` that references `--pm-*` tokens (see `owner.html`).
- Buttons `.pm-btn` + `-primary/-forest/-violet/-ghost/-soft/-danger` (+`-sm/-lg/-block`);
  inputs `.pm-field/.pm-label/.pm-input/.pm-select`; cards `.pm-card` (+`-gold/-violet/-green/-alt`);
  badges `.pm-badge` (+`-live/-neutral/-gold/-violet/-sold/-rose`); dialogs `.pm-overlay>.pm-dialog`;
  drawers `.pm-drawer` (`.is-open`); alerts `.pm-alert` (+`-info/-success/-warn/-error`);
  loading `.pm-skeleton/.pm-spinner`; empty `.pm-empty`; error `.pm-error-state`;
  scroll containers add `.pm-scroll`.
- Feedback: `PMShell.toast(msg,'ok'|'warn'|'err')`, `await PMShell.confirm({...})`
  (replaces `alert`/`confirm`). Escape user data with `PMShell.esc`.

## Responsive rules

- Desktop-first. Breakpoints: `1200` (gutter), `1024` (grid 3→2, sidebar 232),
  `900` (shell sidebar → horizontal rail, grids → 1col, CTA/footer hidden),
  `560` (mobile client pages).
- Content max-width `1120–1140px`; wide content scrolls inside its own
  `overflow-x:auto` (`.pm-table-wrap`). Verified no horizontal overflow at
  1440×900, 1366×768, 1024×768 on Home + My Plots.

## Preserved IDs & contracts (do not rename)

- **Landing/device gate** (`index.html`): body states `s-loading/s-access/s-doors`;
  ids `ac-code/ac-submit/ac-refresh/ac-status/ac-title/ac-msg`, `auth-shell/
  auth-form/auth-email/auth-password/auth-passcode/auth-submit/auth-mode-toggle/
  auth-title/auth-status`; handlers `openDealer/openTeam/closeAuth`; RPCs
  `plotmap_passcode_login/plotmap_activate_device/plotmap_activation_request_status`;
  keys `plotmap_dealer_id/plotmap_activation_request`.
- **access-expired**: `?reason=` → ids `ae-title/ae-body/ae-action` (7 states).
- **owner.html**: guard `PMAccess.guardPage({roleRequired:'owner'})`; data via
  `CRM.getScopedCRM/computePresentationStats`; settings drawer ids preserved
  (`dealer-settings-form`, `dealer-plan-form`, `share-create`, `share-links-list`,
  `dealer-export-data`, `dealer-import-file`, …) with the same `PMFoundation` calls.
- **properties.html**: guard `roleRequired:'team'`; every `p-*` form input id kept
  so `PMPhotoManager` (URL + gated Storage upload; bucket/RLS contract intact)
  and the submit path are unchanged; window handlers `editProp/toggleVisible/
  markSold/archiveProp/placeProp/viewPropOnMap`; CRM `addProperty/updateProperty/
  archiveProperty`; `PM_MAP_REGISTRY`, `PMOverlayStore` bindings.
- **Client Presentation**: `app.js`, `map-registry.js`, overlays, datasets,
  coordinates — **untouched**. Only a CSS layer added.

## Route-by-route remaining work

| Route | Status |
|---|---|
| `index.html` landing/gate | ✅ migrated |
| `admin/access-expired.html` | ✅ migrated |
| `admin/owner.html` (Home) | ✅ canonical reference |
| `admin/properties.html` (My Plots) | ✅ canonical reference |
| `app/plotmap/` Client Presentation | ✅ visual **foundation** (chrome re-tint); fine chrome remaining (below) |
| `admin/deals.html` (My Deals) | ⬜ migrate onto shell (owner variant) + real deals data; design §"My Deals" (STAGES pipeline, finished-deals list, detail pane, two-step delete) |
| `admin/clients.html` (My Customers) | ⬜ shell + real clients; design §"My Customers" leaderboard + reason chips + detail pane. NOTE: existing `clients.html` is "Client Movement" (session timelines) — reconcile with the design's leaderboard. |
| `admin/team.html` (Team Workspace) | ⬜ shell (team variant) + design "work table" launcher + Map Studio hero |
| `admin/area-intelligence.html`, `admin/property-insights.html` | ⬜ owner surfaces; fold into Home/§Demand or migrate onto shell |
| `admin/map-studio.html` | ⬜ migrate chrome onto the presentation foundation layer pattern |
| `admin/developer.html` | 🚫 **do not restyle** — platform-admin, separate approved design |

Owner↔team nav reconciliation: `properties.html` mounts the **team** shell
(preserves the role-split "Properties is a workspace tool"). The owner nav's
"My Plots" links here, so an owner sees the team rail on that page — existing
production behaviour. Decide later whether owners get an owner-rail variant.

## Private Client Links — exact frontend↔backend contract

Frontend is live (`PMClientLinks`, "Send private link" drawer on ready plots).
Backend is **not** built; `create()` returns `{ok:false,pending:true}` today.
To enable: implement these (additive) and set `window.PM_CLIENT_LINKS_ENABLED=true`:

- **`plotmap_create_client_link`** (auth RPC, dealer-scoped, owner/team). Payload:
  `{clientId, propertyIds[≤4], photoSelections{[pid]:idx[]}, priceVisibility
  'hidden'|'shown' (default hidden), locationVisibility 'area'|'exact'|'hidden'
  (default area), audio null|{objectPath,seconds}, expiresInDays, branding}`.
  Mint an **unguessable slug (≥128-bit)**; write a `share_links` row
  `target_type='client_link'` with a **frozen client-safe snapshot** in
  `metadata` (so later inventory edits never leak), `expires_at`, `status='active'`.
- **`plotmap_resolve_client_link(slug)`** (anon, `security definer`) — returns
  **only** client-safe fields honoring the visibility flags; **never** seller
  contact, commission, source, internal price, negotiation/staff notes, internal
  ids, full inventory, or exact location unless `locationVisibility='exact'`.
  Rejects expired/revoked/unknown. (Extends existing `plotmap_resolve_share_link`.)
- **`plotmap_list_client_links` / `plotmap_revoke_client_link`** (auth, dealer-scoped, immediate revoke).
- **`client_link_events`** table (append-only: opens/played/called/whatsapp/visit) → surfaced to dealer.
- **Audio**: private per-dealer bucket, MIME+size validation, **signed delivery only**,
  cleaned on dealer deletion. Wire the drawer's disabled "Record" button + `audio` payload.
- **Client page**: new mobile-first route resolving via the anon RPC only.
- Injection points in `admin/properties.html`: `openClientLink(propertyId)` builds
  the payload; swap the `PENDING` result handling for the real `{ok,url}`.

## Client Presentation integration notes

- The foundation is a **CSS override layer** (`styles/violet-dusk-foundation.css`,
  loaded last). It (1) remaps the presentation's own `:root --pm-*` tokens to
  violet-dusk, and (2) overrides signature chrome. Never edit `app.js`/engine to restyle.
- Key chrome selectors (from `styles.css`): `.topbar`, `.logo`, `.brand-name`,
  `.area-switch` (map picker), `.tab`/`.tab.on` (view tabs), `.mode-switch`/
  `.mode-switch.topbar-mode` (Original/Easy), `.zoom`, `.ptag` (part selector /
  plot tags), `.panel`/`.head` (proof/property sheet), `.cat-btn/.item-btn/
  .layer-pill/.item-chip`, `.btn-primary/.btn-ghost`, `.o-block/.o-zone/.o-pin`
  (overlay glow), `.area-select/.as-hero/.as-tile` (city selector).
- Remaining fine chrome to migrate on this layer: photo rail, part selector
  polish, property sheet internals, iPad on-demand photo drawer, `map-studio.html`.
- Active view tab = gold `#ffc93c` on dark `#1f1a12`; map highlights + pins glow
  gold `#ffc21e`. Contrast-sensitive spots use `!important` overrides intentionally.

## Known issues / notes

- `properties.html` My Plots follows the design (city filter, ready/need-work
  split); the old free-text **search box was dropped** to match the design —
  re-add if large inventories need it.
- Owner "My Plots" shows the **team** nav rail (see reconciliation above).
- The "client on your map now" live pill in the design Home is demonstration
  content — omitted (no genuine real-time signal); re-add only with real presence data.
- Font/icons load from Google Fonts + Phosphor CDN; self-host for production.
- Local verification used `tools/server.js` (port 5173). Screenshots need the
  Browser pane displayed; verification here used computed-style/DOM assertions.

## Latest commit

`de649fc` — Client Presentation visual foundation (last foundation-code commit;
this handoff is committed on top).
