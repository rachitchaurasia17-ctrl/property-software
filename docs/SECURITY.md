# PlotMap Security Model

Last updated: 2026-07-06 (SaaS foundation sprint).

## Non-negotiable rules

1. **Dealer Login is the only login.** Team members and the owner sign in through the same login on `/`. There is no separate team login and no client login.
2. **Client Presentation (`/app/plotmap/`) is public and client-safe.** It must never show: price, sold status, seller contact, commission, finance, internal notes, staff data, owner-only data, admin controls, draft maps, hidden maps, or archived maps.
3. **Finance / Reports / Access pages must not return.** They are retired; `admin/core/nav.js` is the only nav source and documents this.
4. **Never rerun `supabase_setup.sql`.** It recreates permissive public policies. Use only files under `supabase/migrations/`.
5. **No service-role key in the frontend, ever.** Only the publishable anon key (`sb_publishable_…`) appears in `admin/core/auth.js` and `admin/core/supabase-sync.js`.
6. **localStorage roles are display/UX only.** Real security is Supabase Auth + RLS. `plotmap_admin_role` etc. are convenience mirrors of the authenticated profile and are never trusted as authorization.

## Layers

| Layer | What it enforces | Where |
|---|---|---|
| Supabase RLS | dealer isolation, staff-only writes, public read of published/client-safe rows only | `supabase_security_patch.sql` (live), `supabase/migrations/20260706_saas_foundation_scaffold.sql` (pending) |
| `PMAccess.guardPage` | admin pages require an active Supabase profile; role rank + permission scopes per route | `admin/core/access-control.js` |
| Scope model | owner / manager / map_editor / property_editor / viewer / legacy team → permission scopes | `admin/core/access-control.js` (`SCOPE_CATALOG`, `ROLE_SCOPES`) |
| Action guards | publish permission in Map Studio, team management, plan limits | `admin/map-studio.html`, `admin/team.html`, `admin/core/saas-foundation.js` |
| Client-safe projection | `client_safe_properties` view + `crmClientProperties()` whitelist + overlay `publishedForClient()` leak regex | security patch SQL, `app/plotmap/app.js`, `admin/core/overlay-store.js` |

## Roles

- `owner` — full access, only role that can open `/admin/owner.html`.
- `manager` — everything except owner dashboard/settings/billing (has `team.manage`, `insights.view`).
- `team` (legacy) — pre-role-model members; classic team access (no team.manage, no insights).
- `map_editor` — Map Studio draw + publish only.
- `property_editor` — Properties only.
- `viewer` — client presentation only; cannot open the admin shell. Signed-in viewers are routed to `/app/plotmap/`.

Explicit `profiles.permissions` (jsonb array of scopes) overrides the role preset when non-empty. Owner always has all scopes.

**Backend note:** `plotmap_is_staff()` (which gates all dealer-data RLS writes) includes owner/team/manager/map_editor/property_editor and requires `status = 'active'`. `viewer` is deliberately excluded so viewers never get backend write (or internal read) access.

## Denial behavior

- No session / inactive profile → signed out, redirected to `/` login with reason.
- Signed in but wrong role/scope for a page → **not** signed out; redirected to their safe home (`/admin/team.html?denied=…` for team ranks, `/app/plotmap/` for viewers).

## Known gaps (documented, not hidden)

- Until the `20260706_saas_foundation_scaffold.sql` migration is applied, `profiles.permissions` does not exist, so per-member custom scopes come from local team records (UX-level only). Role presets from the profile role still apply.
- Share-link enable/disable/expiry is enforced server-side only after the migration (via `plotmap_resolve_share_link` RPC). Before that, a disabled link still opens the public presentation — which by design contains no internal data.
- Frontend action guards are honesty/UX; a hostile authenticated team member is limited by RLS (dealer isolation + staff write), not by page JS. Per-scope RLS (e.g., publish-only columns) is future work.
