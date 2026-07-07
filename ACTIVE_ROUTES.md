# Active Routes

Updated: 2026-07-06 (repo cleanup + product consolidation pass)

## Public

| Route | Purpose | Auth | Decision |
| --- | --- | --- | --- |
| `/` | Entry: 3 cards — **Client Presentation** + **Dealer Login** + **Team Workspace** (Phase 1.5 role split) | Public | Keep |
| `/app/plotmap/` | Client Presentation (maps, sectors, properties — client-safe data only) | Public | Keep |
| `/app/index.html` | Redirect → `/app/plotmap/` | Public | Keep (safe redirect) |

## Dealer / Admin (Supabase Auth + role guard via `PMAccess.guardPage`)

| Route | Purpose | Role | Decision |
| --- | --- | --- | --- |
| `/admin/owner.html` | Dealer dashboard (presentation activity, hot areas, top properties, Map Studio + sync status, quick actions) | owner | Keep — **rebuilt** |
| `/admin/map-studio.html` | Map Studio (only map write surface) | team+ | Keep |
| `/admin/properties.html` | Property inventory | team+ | Keep — nav cleaned |
| `/admin/area-intelligence.html` | Area intelligence from Client Presentation events | owner | Keep — nav cleaned |
| `/admin/deals.html` | Deals placeholder ("Deals will connect property interest to follow-up pipeline.") | team+ | Keep — replaced CRM deal recorder |
| `/admin/clients.html` | **Client Movement** — presentation session timelines | team+ | Keep — **rebuilt** (was old CRM client list) |
| `/admin/property-insights.html` | Property-level presentation activity + inventory health | owner | Keep — nav cleaned |
| `/admin/team.html` | Team workspace (team users land here after Dealer Login) | team+ | Keep — cleaned |
| `/admin/access-expired.html` | Blocked/expired screen used by the auth guard | public shell | Keep |

## Redirects (retired surfaces — load no data, no auth needed)

| Route | Redirects to | Why |
| --- | --- | --- |
| `/admin/index.html` | `/` | Old admin gateway retired |
| `/admin/finance.html` | `/admin/owner.html` | Finance intentionally removed |
| `/admin/reports.html` | `/admin/owner.html` | Reports intentionally removed |
| `/admin/access.html` | `/admin/owner.html` | Access management intentionally removed |
| `/admin/maps.html` | `/admin/map-studio.html` | Old Maps & Pins editor retired (archived) |
| `/admin/editor.html` | `/admin/map-studio.html` | Old highlight editor retired (guarded redirect) |

## Navigation source

All admin topbars render from **one** definition: `admin/core/nav.js` (`PMNav.render`).

**Phase 1.5 role split** — Dealer Login and Team Workspace now have distinct navs:

- **Dealer nav (owner intelligence):** Dashboard, Area Intelligence, Client Movement,
  Property Insights, Client Presentation. **No** Map Studio / Properties / Deals here —
  those are Team Workspace work tools.
- **Team nav (staff workspace):** Workspace, Properties, Map Studio (scope-filtered).
  **No** Area Intelligence / Client Movement / Property Insights / Deals / Dashboard.

Finance/Reports/Access are not defined anywhere in nav and cannot come back through a
shared component. Nav visibility is UX; real access is `PMAccess.guardPage` + Supabase
RLS. See `docs/ROLE_ARCHITECTURE.md`.
