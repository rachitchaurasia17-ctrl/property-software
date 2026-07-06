# Team Permissions

Last updated: 2026-07-06.

Team users sign in through **Dealer Login** (there is no separate team login).

## Roles

| Role | Preset scopes | Landing page |
|---|---|---|
| owner | all scopes | `/admin/owner.html` |
| manager | presentation, properties, map studio + publish, clients, deals, insights, exports, audit, team.manage | `/admin/team.html` |
| team (legacy) | presentation, properties, map studio + publish, clients, deals, exports, audit | `/admin/team.html` |
| map_editor | presentation, mapstudio.manage, mapstudio.publish | `/admin/team.html` |
| property_editor | presentation, properties.manage | `/admin/team.html` |
| viewer | presentation.view only | `/app/plotmap/` |

Scope catalog and presets live in `admin/core/access-control.js` (`SCOPE_CATALOG`, `ROLE_SCOPES`). An explicit non-empty `permissions` array (on the Supabase profile or local team record) **overrides** the preset. Owner always has everything.

## Enforcement points

1. **Page open + typed URLs** — `PMAccess.guardPage` on every admin page: requires an active Supabase session/profile, then role rank, then the route's scope (`ROUTE_SCOPES`). Typing a blocked URL redirects to the member's workspace with a friendly notice — it does not sign them out.
2. **Nav** — `admin/core/nav.js` filters team nav items by resolved scopes; insight pages appear only when `insights.view` is granted.
3. **Publish** — Map Studio's publish modal is blocked without `mapstudio.publish` (work is kept as draft).
4. **Team management** — `admin/team.html` add/edit/disable/remove requires `team.manage` (owner or manager).
5. **Plan limits** — adding a team member beyond `max_team_members` is blocked with a clear message.

## Source of truth

- **Post-migration:** `profiles.role` + `profiles.permissions` (fetched at login, cached in `plotmap_supabase_profile_v1`). Edit them in Supabase (owner UI wiring for editing *other* members' profiles requires an owner-scoped RLS policy — see Next tasks).
- **Pre-migration:** the profile role still enforces presets; per-member custom scopes come from the local team record and sync through `crm_records`. This is UX-level control, not backend security — documented in `SECURITY.md`.
- localStorage roles are never security.

## Managing the team (owner)

`/admin/team.html` → Team access card: add member (name, email matching their login email, role, status, permission chips), see exactly which pages each member can open, disable / re-activate / remove. Statuses: `active`, `blocked`, `disabled`, `removed` — anything but `active` locks the workspace.

## RLS dependency

Custom per-member scopes become backend-real only after `supabase/migrations/20260706_saas_foundation_scaffold.sql` is applied (adds `profiles.permissions`) **and** each member has a Supabase auth user + profile row with the right role. Creating those profile rows is a manual/Supabase-side step today.
