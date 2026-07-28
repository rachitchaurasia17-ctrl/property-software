# 02 · Architecture and Initialization

All facts here are `VERIFIED-CODE` at commit `b894245` unless labelled otherwise.

## Frontend architecture in one paragraph

PlotMap V1 is a **multi-page vanilla app**. Each route is a standalone `.html` file that
pulls in a fixed, ordered list of `<script src>` modules. Every module is an IIFE that
attaches a single global to `window` (`PMAuth`, `PMDataAdapter`, …). There is **no bundler,
no framework, no client router, and no npm runtime dependency** — the only external script
is `@supabase/supabase-js@2` loaded from jsDelivr **on the Client Presentation page only**
(`app/plotmap/index.html`). State is shared between modules exclusively through `window.*`
globals and `localStorage`/`sessionStorage`. This is exactly the "duplicated shells /
implicit global ordering" property that the V2 must replace with an explicit module graph
(see `22_V2_ARCHITECTURE.md`).

## Global object graph

| Global | Defined in | Responsibility |
|---|---|---|
| `window.env` | `config/runtime-env.js` (generated at build) | Raw `{ VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY }` or `{}` |
| `PMRuntimeConfig` | `config/supabase-config.js` | Validates runtime pair, else public fallback; `getSupabaseConfig()` |
| `PMAuth` | `admin/core/auth.js` | Supabase email/password session, profile, role, legacy role mirror |
| `CRM_DEMO` | `admin/crm-data.js` | Local-dev demo seed data |
| `PMDataAdapter` | `admin/core/data-adapter.js` | Local-first CRM store (`plotmap_crm_v1`), dealer scoping |
| `PMSyncQueue` | `admin/core/sync-queue.js` | Outbound mutation queue |
| (event tracker) | `admin/core/event-tracker.js` | Presentation + product usage events |
| (access control) | `admin/core/access-control.js` | `guardPage`, role/scope model, offline grace |
| `CRM` | `admin/crm-store.js` | Higher-level CRM read/derive API used by pages |
| `PMOverlayStore` | `admin/core/overlay-store.js` | Map overlay persistence |
| `PMFoundation` | `admin/core/saas-foundation.js` | Dealer settings, account gate, plan/trial |
| `PMSupaSync` | `admin/core/supabase-sync.js` | Bidirectional Supabase sync (REST) |
| `PMShell` | `admin/core/plotmap-shell.js` | The single canonical dealer chrome (nav + header) |
| `PMClientLinks` | `admin/core/plotmap-client-links.js` | Private Client Link dealer-side client (properties page only) |
| `PMDeviceAccess` | `admin/core/device-access.js` | Approved-device token + gate (presentation + landing) |
| `PM_MAP_REGISTRY` | `app/plotmap/map-registry.js` | 170 map descriptors (generated) |

## Initialization order — dealer admin page (canonical)

`VERIFIED-CODE` from `admin/owner.html` / `admin/properties.html` `<script>` order:

```
1.  /config/runtime-env.js          → window.env         (generated; may be {})
2.  /config/supabase-config.js      → PMRuntimeConfig     (resolves URL+key)
3.  /admin/core/auth.js             → PMAuth              (reads session; local-dev auto-mock)
4.  /admin/crm-data.js              → CRM_DEMO            (demo seed)
5.  /admin/core/data-adapter.js     → PMDataAdapter       (ensures local store)
6.  /admin/core/sync-queue.js       → PMSyncQueue
7.  /admin/core/event-tracker.js    → (product/presentation events)
8.  /admin/core/access-control.js   → guardPage()         (role + device + account gate)
9.  /admin/crm-store.js             → CRM
10. /admin/core/overlay-store.js    → PMOverlayStore
11. /admin/core/saas-foundation.js  → PMFoundation
12. /admin/core/supabase-sync.js    → PMSupaSync          (starts background drain/pull)
13. /admin/core/plotmap-shell.js    → PMShell             (page calls PMShell.mount(...))
14. /admin/core/plotmap-client-links.js → PMClientLinks   (properties.html ONLY)
15. /app/plotmap/map-registry.js    → PM_MAP_REGISTRY
```

**Ordering is load-bearing and implicit.** `auth.js` must run before `data-adapter.js`
(the adapter reads `plotmap_dealer_id` that auth mirrors from the profile),
`access-control.js` runs the guard before the page renders, and `PMShell.mount()` is
called by the page body after `plotmap-shell.js` is present. A wrong order silently breaks
tenant scoping. **V2 must make this graph explicit (imports), not positional.** `INFERENCE`.

## Initialization order — Client Presentation (`/app/plotmap/`)

```
runtime-env.js → supabase-config.js → @supabase/supabase-js@2 (CDN)
→ map-registry.js → datasets/map-config.js → data.js → tricity.dataset.js
→ sector-pins.js → overlays.js → crm-store.js → sync-queue.js → event-tracker.js
→ device-access.js → overlay-store.js → supabase-sync.js
→ overlay-engine.js → overlay-capture.js → app.js
```

Notes: this page gates with **`PMDeviceAccess`** (not the admin `guardPage`), loads the
Supabase JS SDK from a **CDN** (the only external runtime dependency — a CSP/offline risk
V2 should remove by self-hosting or dropping the SDK), and versions each asset with a
`?v=N` query string as a manual cache-bust. `VERIFIED-CODE` `app/plotmap/index.html`.

## Initialization order — Client Link page (`/client/`)

```
runtime-env.js → supabase-config.js → client/app.js
```

Minimal by design — the buyer page ships almost no code and never loads the CRM, adapter,
or auth. `VERIFIED-CODE` `client/index.html`.

## Runtime configuration resolution

`VERIFIED-CODE` `config/supabase-config.js`:

1. Read `window.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
2. Accept the pair **only if** both present, URL is `https://*.supabase.co`, and key is a
   **public** key (rejects `sb_secret_`, `service_role`, and any JWT whose payload
   `role === 'service_role'`). `isPublicKey()` / `isSupabaseUrl()`.
3. Otherwise fall back to the frozen public pair (project `czmkfmkmgqlienmdihul`,
   `sb_publishable_…`). `resolved.source` is `'runtime'` or `'fallback'`.

This is a deliberate defense: a mis-provisioned build cannot accidentally ship a
service-role key to the browser, and always resolves *some* working public config.

## Boot sequence (Mermaid)

```mermaid
sequenceDiagram
  participant HTML as admin/*.html
  participant Cfg as PMRuntimeConfig
  participant Auth as PMAuth
  participant Guard as access-control.guardPage
  participant Dev as PMDeviceAccess
  participant Data as PMDataAdapter
  participant Shell as PMShell
  HTML->>Cfg: resolve Supabase URL+key
  HTML->>Auth: read session / profile (mirror dealer_id, role)
  HTML->>Guard: guardPage(requiredRole)
  Guard->>Auth: requireProfile(role)
  Guard->>Dev: isApproved(dealerId)  (read-only device gate)
  alt not approved / inactive
    Guard-->>HTML: render block screen, stop
  else ok
    Guard-->>HTML: continue
    HTML->>Data: getData() (local-first store)
    HTML->>Shell: PMShell.mount({variant, active, section})
    Shell-->>HTML: returns scroll region; page appends content
  end
```

## Why it was built this way (rationale & trade-offs)

- **No framework** kept the app deployable as pure static files on Vercel with zero build
  of app code (only a copy/allowlist step), and made it trivial to open any page in
  isolation. Trade-off: shared state is implicit global ordering, which is fragile and was
  a documented source of agent confusion (`APPROVED-PRODUCT` — the report's core motivation
  for V2). 
- **Local-first CRM** buys speed and offline tolerance; the cost is a two-layer data model
  (local store + Supabase) that must be reconciled (`08_DATA_MODEL_AND_ADAPTERS.md`).
- **Security lives on the server**, not the client. The client guard is explicitly "keeps
  the UI honest," not a security boundary (`access-control.js:1-5`). V2 must preserve that
  separation: never move an authorization decision into the client.
