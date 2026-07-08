# Phase 3 Team RLS Verification

Status: applied in Supabase and smoke-tested outside this cleanup task.

Tracked migration:
`supabase/migrations/20260708_team_role_rls_enforcement.sql`

What it enforces:
- `owner`: full control within own dealer.
- `manager`: ordinary dealer writes, excluding billing/account/team role control.
- `map_editor`: map/overlay writes only.
- `property_editor`: property writes only.
- `viewer`: read-only dealer access.
- inactive/suspended/blocked/disabled/removed users: no private writes.

Safety notes:
- Contains no `DROP TABLE`, `DROP DATABASE`, `DELETE FROM`, or `TRUNCATE`.
- Contains no `using(true)` or `with check(true)` private-table policies.
- Does not restore direct anon table access from Phase 2.
- Keeps the primary owner guard for `rachitchaurasia17@gmail.com` / `dealer-demo`.

Smoke-test expectation:
- Each role should be tested against allowed and denied writes.
- Cross-dealer reads/writes must fail for every authenticated role.
- Client Presentation remains public through Phase 2 RPCs only.
