# Phase 1 — Launch Safety Report (2026-07-06)

## Security patch status: APPLIED ✓ (verified live)

Verified against the live Supabase project (`czmkfmkmgqlienmdihul`) from the
running app with the anon key:

| Probe (as anon / logged out)              | Result | Expected |
|-------------------------------------------|--------|----------|
| `GET /rest/v1/crm_records`                 | 0 rows | 0 rows ✓ |
| `GET /rest/v1/presentation_events`         | 0 rows | 0 rows ✓ |
| `GET /rest/v1/profiles`                    | 0 rows | 0 rows ✓ |
| `GET /rest/v1/map_overlays`                | published + client_visible only ✓ | |
| `GET /rest/v1/client_safe_properties`      | 200, safe columns only ✓ | |
| `POST /rest/v1/presentation_events` (plain insert, `metadata.source='client_presentation'`) | 201 ✓ | |
| `POST` upsert (`resolution=merge-duplicates`) | rejected by RLS ✓ | |

No service-role key exists anywhere in the frontend — only the publishable
(anon) key. The patch file drops no tables and deletes no data (re-verified by
inspection).

**Rule going forward:** never re-run `supabase_setup.sql` after the patch —
it recreates the permissive `using (true)` policies. If it must ever be
re-run, immediately re-run `supabase_security_patch.sql` after it.

## Owner profile setup

1. Supabase Dashboard → **Authentication → Users → Add user**
   - Email: `rachitchaurasia17@gmail.com`
   - Set a password, tick **Auto Confirm User**.
2. Dashboard → **SQL Editor**, run:

```sql
insert into public.profiles (id, email, role, dealer_id, status)
select id, email, 'owner', 'dealer-demo', 'active'
from auth.users
where email = 'rachitchaurasia17@gmail.com'
on conflict (id) do update
  set role = 'owner', dealer_id = 'dealer-demo', status = 'active';
```

No UUID copying needed — the insert selects it from `auth.users` by email.
(If you ever need the UUID: Dashboard → Authentication → Users → click the
user → UID.)

`dealer_id` must be **`dealer-demo`** — every existing row in `crm_records`,
`map_overlays`, `prebuilt_maps`, and `presentation_events` uses that value
(it is the schema default), and the RLS staff policies only grant access to
rows matching your profile's `dealer_id`.

3. Verify:

```sql
select id, email, role, dealer_id, status from public.profiles;
```

Expect one row: role `owner`, dealer_id `dealer-demo`, status `active`.

## One-time cleanup (test rows from Phase 1 verification)

Diagnosing the analytics 401 required a few probe inserts into
`presentation_events` on the live project. Remove them with:

```sql
delete from public.presentation_events
where session_id = 'ps-test'
   or id like 'pevt-test-%'
   or id like 'pevt-fresh-%'
   or id like 'pevt-x-%';
```

## Bug found & fixed: client analytics were silently failing

Every `presentation_events` batch from the Client Presentation was rejected
with 401 (RLS). Cause: the sync drain used `Prefer:
resolution=merge-duplicates` (an upsert). Anon has INSERT-only rights on that
table, and any `ON CONFLICT` resolution engages read/update paths that RLS
denies. Fix in `admin/core/supabase-sync.js`: plain insert for
`presentation_events`; on a 409 duplicate (lost response + retry) it replays
the batch row-by-row and treats per-row 409 as already-synced. Verified live:
37 stuck events drained to 0 pending, all 201.

Also fixed: open redirect on the Dealer Login page — `?next=` is now
restricted to same-origin paths.

## Route sweep (local, verified)

- `/` → 200, Dealer Login + Client Presentation cards, no console errors.
- `/app/plotmap/` → 200, renders, no console errors, no failed requests
  (after the analytics fix).
- All 9 admin pages → 200 and call `PMAccess.guardPage(...)` with
  `document.documentElement` hidden until auth resolves; logged-out access to
  `/admin/owner.html` verified to bounce to `/?next=…&reason=missing_session`.
- Legacy `finance/reports/access/maps/editor/index` pages under `/admin/` are
  data-free redirect stubs (verified by content).
- All 69 map image paths referenced by the app exist on disk and are covered
  by `vercel.json` builds. `archive/` is not in `vercel.json` builds → not
  deployed.
- Nav registry (`admin/core/nav.js`) contains only the 8 approved dealer items
  (6 for team); no Finance/Reports/Access.

## Client-safe notes / accepted risks

- `client_safe_properties` exposes an `internal_status` column, but the view
  filters out rows whose status matches archived/internal/hold/sold/hidden,
  so only benign values (e.g. "Available") can appear. Consider renaming the
  column later; not a launch blocker.
- `presentation_events` insert is open to anon by design (analytics). The
  `dealer_id` is client-supplied, so event spam/pollution is possible;
  acceptable for launch, revisit in Phase 4 (dedup + validation).
- Static hosting means admin page *source* (HTML/JS) is publicly fetchable;
  all *data* is behind Supabase RLS. This is inherent to the architecture and
  fine.
- Admin pages fall back to legacy `localStorage` role state for display-only
  nav; real enforcement is `guardPage` + RLS.

## Production push checklist

1. `git push` (3+ commits ahead of origin).
2. Wait for Vercel build.
3. Hard-refresh `https://<prod-domain>/app/plotmap/` — confirm the
   `supabase-sync.js?v=13` script loads (Network tab) so the analytics fix is
   actually picked up (bumped `?v=` handles this).
4. Re-run the anon probes above against prod (same results expected — same DB).
5. Log in as owner (after profile setup) and confirm redirect to
   `/admin/owner.html`.
