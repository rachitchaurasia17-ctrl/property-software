# 03 · Route and Role Matrix

`VERIFIED-CODE` from `admin/*.html` (16 files), `app/plotmap/index.html`, `client/index.html`,
`index.html`, and the role model in `admin/core/access-control.js`. Machine-readable mirror:
`manifests/routes.json`, `manifests/roles.json`.

## Route inventory

| Route | File | Surface | Allowed roles | Guard mechanism |
|---|---|---|---|---|
| `/` | `index.html` | Landing + device activation | anonymous | none (public); activation-code entry |
| `/admin/owner.html` | dealer | Dealer Home | **owner only** | `guardPage` owner + device + account gate |
| `/admin/area-intelligence.html` | dealer | Area Intelligence | **owner only** | owner + `insights.view` |
| `/admin/property-insights.html` | dealer | Property Insights | **owner only** | owner + `insights.view` |
| `/admin/team.html` | dealer | Team Workspace | owner, manager, team ranks | team requirement |
| `/admin/properties.html` | dealer | My Plots + Client Links entry | owner, `properties.manage` | team + scope `properties.manage` |
| `/admin/clients.html` | dealer | My Customers | owner, `clients.view` | team + scope `clients.view` |
| `/admin/deals.html` | dealer | My Deals | owner, `deals.view` | team + scope `deals.view` |
| `/admin/map-studio.html` | dealer | Map Studio | owner, `mapstudio.manage` | team + scope `mapstudio.manage` |
| `/admin/developer.html` | admin | Developer Control | **platform admin only** | Supabase session + `plotmap_is_platform_admin` |
| `/admin/maps.html` | dealer | Maps (legacy/aux) | team+ | team |
| `/admin/editor.html` | dealer | Editor (legacy/aux) | team+ | team |
| `/admin/finance.html` | dealer | Finance (aux) | owner | owner |
| `/admin/reports.html` | dealer | Reports (aux) | owner | owner |
| `/admin/access.html` | dealer | Access helper | varies | — |
| `/admin/access-expired.html` | dealer | Access-blocked screen | anonymous | reason-aware block copy |
| `/admin/index.html` | dealer | Admin index/redirect | — | — |
| `/app/plotmap/` | presentation | Client Presentation | owner, team ranks, viewer | `PMDeviceAccess` gate |
| `/client/` | client | Private Client Link showcase | anonymous + token | bearer token only |

> The report's "canonical" dealer route list (Home, My Deals, My Plots, My Customers,
> Client Links, Team Workspace, Area Intelligence, Property Insights, Map Studio) all map
> to files above. `maps.html`, `editor.html`, `finance.html`, `reports.html` are older
> auxiliary pages; classify them **rewrite/prohibit** unless a V2 need is confirmed
> (`21_REUSE_ADAPT_REWRITE_PROHIBIT.md`). `INFERENCE`.

## Role model (single source of truth)

`VERIFIED-CODE` `admin/core/access-control.js:8-58`.

### Owner-only routes (`OWNER_ROUTES`)
`/admin/owner.html`, `/admin/area-intelligence.html`, `/admin/property-insights.html`.

### Team-accessible routes (`TEAM_ROUTES`)
`/admin/team.html`, `/admin/clients.html`, `/admin/properties.html`, `/admin/deals.html`,
`/admin/map-studio.html`.

### Permission scopes (`SCOPE_CATALOG`)
`presentation.view`, `properties.manage`, `mapstudio.manage`, `mapstudio.publish`,
`clients.view`, `deals.view`, `insights.view`, `exports.manage`, `audit.view`,
`dealerSettings.manage`, `team.manage`, `billing.manage`.

### Role → scopes (`ROLE_SCOPES`)

| Role | Scopes |
|---|---|
| `owner` | **all** |
| `manager` | presentation.view, properties.manage, mapstudio.manage, mapstudio.publish, clients.view, deals.view, insights.view, exports.manage, audit.view, team.manage |
| `team` (legacy) | presentation.view, properties.manage, mapstudio.manage, mapstudio.publish, clients.view, deals.view, exports.manage, audit.view |
| `map_editor` | presentation.view, mapstudio.manage, mapstudio.publish |
| `property_editor` | presentation.view, properties.manage |
| `viewer` | presentation.view |

An explicit `profile.permissions` array (post-SaaS-migration) **overrides** the preset,
except `owner` which always has everything. `resolveScopes()` filters explicit permissions
to the known catalog. `VERIFIED-CODE` `access-control.js:76-90`.

### Route → required scope (`ROUTE_SCOPES`)
`map-studio.html→mapstudio.manage`, `properties.html→properties.manage`,
`clients.html→clients.view`, `deals.html→deals.view`,
`area-intelligence.html & property-insights.html→insights.view`.

## Role rank (coarse gate)
`viewer=1`, `team/manager/map_editor/property_editor=2`, `owner=3`. `requireProfile(role)`
rejects when `roleRank(profile.role) < roleRank(required)`. `VERIFIED-CODE`
`auth.js:222-236`, `access-control.js:68-72`.

## Redirect rules
`routeForRole()`: owner→`/admin/owner.html`, team ranks→`/admin/team.html`,
viewer→`/app/plotmap/`. `buildLoginRedirect(next, reason)` returns `/` with `next` and
`reason` query params (open-redirect-safe: always same-origin `/`). `VERIFIED-CODE`
`auth.js:65-71, 238-244`.

## Cross-tenant note
Roles are **within** a dealer. Platform admin is orthogonal and is proven **server-side**
via `plotmap_is_platform_admin` (never a client flag). Cross-tenant reach exists only
through the platform-admin Edge Functions (`16_EDGE_FUNCTIONS.md`). `VERIFIED-CODE`.
