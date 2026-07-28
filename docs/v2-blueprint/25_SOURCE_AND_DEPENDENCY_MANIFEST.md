# 25 · Source and Dependency Manifest

Narrative index of the runtime source files that matter, with dependencies and V2 class.
Machine mirror: `manifests/source-files.json`, `manifests/dependencies.json`. All paths
`VERIFIED-CODE` (exist at commit `b894245`).

## Config & runtime
| Path | Depends on | Provides | V2 class |
|---|---|---|---|
| `config/runtime-env.js` (generated) | build vars | `window.env` | ADAPT |
| `config/supabase-config.js` | `window.env` | `PMRuntimeConfig` | ADAPT |

## Admin core (`admin/core/`)
| Path | Depends on | Provides | V2 class |
|---|---|---|---|
| `auth.js` | `PMRuntimeConfig`, GoTrue REST, `profiles` | `PMAuth` | ADAPT |
| `data-adapter.js` | `PMAuth` (dealer mirror), `CRM_DEMO` | `PMDataAdapter` | ADAPT |
| `sync-queue.js` | `plotmap_dealer_id` | `PMSyncQueue` | ADAPT |
| `supabase-sync.js` | `PMAuth`, `CRM`, REST | `PMSupaSync` | ADAPT |
| `event-tracker.js` | adapter, `PMSyncQueue`, `PMSupaSync` | presentation/product events | ADAPT |
| `access-control.js` | `PMAuth`, `PMDeviceAccess`, `plotmap_is_platform_admin` | `guardPage`, role model | ADAPT |
| `overlay-store.js` | `plotmap_dealer_id` | `PMOverlayStore` | ADAPT |
| `saas-foundation.js` | `PMAuth`, `dealer_settings` | `PMFoundation` | ADAPT |
| `plotmap-shell.js` | `PMFoundation`, `CRM` | `PMShell` (nav+chrome) | REWRITE (keep NAV data) |
| `plotmap-client-links.js` | `PMAuth`, storage, link RPCs | `PMClientLinks` | ADAPT |
| `device-access.js` | `PMRuntimeConfig`, device RPCs | `PMDeviceAccess` | ADAPT |
| `plotmap-ds.css` | — | dealer design system | REWRITE |
| `command-engine.js`, `report-engine.js`, `finance-engine.js`, `dev360.js` | CRM/events | analytics derivation | ADAPT |
| `nav.js` | `plotmap_admin_role`, profile | legacy nav | PROHIBIT/REWRITE |
| `crm-store.js`, `crm-data.js` | adapter | `CRM`, demo seed | ADAPT / dev-only |

## Admin pages (`admin/*.html`) — all REWRITE (UI)
`owner, properties, deals, clients, team, area-intelligence, property-insights, map-studio,
developer, access-expired` (rewrite); `maps, editor, finance, reports, access, index`
(rewrite/prohibit unless V2 need confirmed). `crm-ui.css` = **PROHIBIT**.

## Client Presentation (`app/plotmap/`)
| Path | Provides | V2 class |
|---|---|---|
| `map-registry.js` (generated, 170) | `PM_MAP_REGISTRY` | REUSE |
| `datasets/{map-config,tricity.dataset,sector-pins,overlays}.js` | map data | REUSE |
| `overlay-engine.js`, `overlay-capture.js` | overlay render/author | REUSE |
| `app.js` (2213) | presentation engine | ADAPT |
| `index.html`, `styles/violet-dusk-foundation.css` | chrome | REWRITE |

## Buyer page (`client/`)
| Path | V2 class |
|---|---|
| `app.js` | ADAPT (keep logic contract) |
| `index.html`, `styles.css` | REWRITE |

## Supabase (`supabase/`)
| Path | V2 class |
|---|---|
| `migrations/*` (enforced set, in order) | REUSE |
| `functions/{resolve-client-link,provision-dealer,delete-dealer}/index.ts` | REUSE/ADAPT |

## Tools (`tools/`)
| Path | V2 class |
|---|---|
| `build-dist.js`, `generate-runtime-env.js` | ADAPT (concepts) |
| `generate-map-registry.js` | REUSE |
| `verify-isolation.js`, `verify-private-client-links.sql`, other `verify-*` | REUSE |

## External / build-time dependencies
- **Runtime:** none via npm on admin/buyer pages. Client Presentation loads
  `@supabase/supabase-js@2` from **jsDelivr CDN** — the only external runtime dep;
  **drop/self-host in V2**.
- **Build-time:** Node (`tools/*.js`), Vercel static hosting, Supabase CLI (migrations,
  functions deploy). `node_modules/` present but not shipped to dist.
