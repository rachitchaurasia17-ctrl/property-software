# PlotMap Production Rollout Package

Status: **PREPARED, NOT EXECUTED.** Nothing in this document has been run
against production. Production project: `czmkfmkmgqlienmdihul` — every step
below must be double-checked against that ref before running, and
repository-wide `supabase db push` is prohibited (drafts and superseded
files live in `supabase/migrations/`; only the listed file may be applied).

Release candidate: branch `release/plotmap-pilot-rc`
(equal to `developer-intelligence-and-performance`).
Verified staging project: `rhmimpcirjbksjmhludg` (22/22 live + 36/36
security checks; five-city QA; deployed-preview runtime checks).

## 1. Git merge order (execute only at rollout time)

Production `main` is at `e1ed51f`. The RC contains main's history plus the
pilot work, so the merge is a single fast-forward-able step:

1. Freeze: no pushes to the RC during rollout.
2. `git checkout main && git merge --ff-only release/plotmap-pilot-rc`
   - If `--ff-only` refuses, STOP — main moved; rebuild the RC first.
3. Do **not** push yet — database first (frontend Stage-2 panels probe RPCs
   and degrade gracefully, but ship DB before UI anyway).
4. The standalone one-file hotfix branch/PR #2 (`ba8e909`) becomes redundant
   the moment the RC merges (same change is in ancestry as `a7b18ca`);
   close PR #2 unmerged at that point.

RC head at packaging time: `f355ac8` (see `git log` for the full list; key
commits: `a7b18ca` blank-page fix, `daf3857` Dealer 360, `78f8632` analytics
hardening, `9dad13e` runtime config, `364d8c0` dist build, `f355ac8` sign-in
error sanitation).

## 2. Database backup / snapshot (mandatory first step)

1. Supabase Dashboard → production project → Database → Backups → confirm a
   fresh daily backup exists; additionally create a manual snapshot (or
   `pg_dump` via the Dashboard connection string on a trusted machine).
2. Record backup timestamp in the rollout log.
3. Do not proceed without a restorable snapshot.

## 3. Production preflight SQL (read-only)

Run in the production SQL editor and verify every row before migrating:

```sql
-- 3.1 confirm the base surface Dealer 360 depends on is present
select proname from pg_proc join pg_namespace n on n.oid = pronamespace
where n.nspname = 'public' and proname in
 ('plotmap_is_platform_admin', 'plotmap_device_is_approved',
  'plotmap_record_device_presentation_event', 'plotmap_record_presentation_event',
  'plotmap_admin_dealer_directory', 'plotmap_admin_dealer_usage');
-- expect: all 6 rows

-- 3.2 confirm the Dealer 360 objects do NOT exist yet
select proname from pg_proc join pg_namespace n on n.oid = pronamespace
where n.nspname = 'public' and proname in
 ('plotmap_admin_dealer_360', 'plotmap_admin_platform_overview',
  'plotmap_admin_dealer_events', 'plotmap_admin_property_stats',
  'plotmap_rollup_daily_usage', 'plotmap_event_name_allowed');
-- expect: zero rows

select to_regclass('public.plotmap_daily_usage');  -- expect: null

-- 3.3 RLS still enabled on the event stream
select relname, relrowsecurity from pg_class
where relname in ('presentation_events','dealer_devices','dealer_passcodes');
-- expect: relrowsecurity = true for all

-- 3.4 active platform admin exists (needed to use the new RPCs)
select count(*) from public.platform_admins where status = 'active';  -- expect >= 1
```

## 4. The Dealer 360 migration (the only SQL to apply)

File: `supabase/migrations/20260719_dealer360_analytics_draft.sql`
(apply the file exactly as committed at the RC head — copy/paste whole file
into the SQL editor on the **production** project after re-reading the ref).

Contents summary: event-name allowlist fn; hardened
`plotmap_record_device_presentation_event` + `plotmap_record_presentation_event`
(device/staff gates byte-identical, adds allowlist, metadata object+2KB cap
+ server-side sanitizer + NOT VALID guard constraint, ingested_at rate cap
with advisory lock, timestamp clamp); deny-all `plotmap_daily_usage` rollup
table + bounded idempotent rollup; platform-admin read RPCs (timeline with
timestamp+id cursor, dealer 360 summary, property stats, platform
overview); four analytics indexes.

### Locks & write impact

- `create index if not exists` here is **plain** (not CONCURRENTLY): each
  takes a SHARE lock on `presentation_events` — writes (event ingestion)
  block for the build duration. At current production volume (single-digit
  thousands of rows) this is sub-second. If volume has grown past ~1M rows,
  split the four index statements out and run each as
  `create index concurrently` outside a transaction instead.
- `alter table ... add column ingested_at` is metadata-only (no rewrite).
- The `not valid` constraint takes no long lock and does not scan existing
  rows.
- `create or replace function` swaps are instantaneous.

### Rollout window

Run at low traffic (early morning IST). Expected total wall time < 30 s.

## 5. Migration-history recording (safe procedure)

Because the SQL is applied via the editor (not `db push`), record it in the
migration history so future tooling agrees, using Supabase CLI **linked to
production explicitly and only for this**:

```
supabase link --project-ref czmkfmkmgqlienmdihul
supabase migration repair --status applied 20260719
```

(Verify `supabase migrations list` afterward. Never run `supabase db push`.)

## 6. Post-migration verification SQL

```sql
-- functions exist and are admin-gated
select proname from pg_proc join pg_namespace n on n.oid = pronamespace
where n.nspname='public' and proname like 'plotmap_admin_dealer_3%';   -- 1 row

-- deny-all rollup table
select relrowsecurity from pg_class where relname='plotmap_daily_usage'; -- true
select count(*) from information_schema.role_table_grants
where table_name='plotmap_daily_usage' and grantee in ('anon','authenticated'); -- 0

-- ingestion still gated (should ERROR: approved dealer device required)
select public.plotmap_record_device_presentation_event(
  'dealer-demo','not-a-real-token','probe','map_opened');

-- allowlist live
select public.plotmap_event_name_allowed('map_opened');      -- true
select public.plotmap_event_name_allowed('made_up_event');   -- false
```

Then from a workstation (uses only the production URL + publishable key):

```
SUPABASE_URL=https://czmkfmkmgqlienmdihul.supabase.co \
SUPABASE_ANON_KEY=<production publishable key> \
node tools/verify-dealer360.js
```

Expect 36/36 (same as staging). Any FAIL → stop and roll back.

## 7. Vercel production deployment sequence

1. Confirm the two **Production**-scoped env vars are intentionally ABSENT
   (production uses the built-in fallback pair, which IS the production
   project) — do not add staging values to Production scope. If explicit
   pinning is preferred, add the production URL + publishable key to the
   Production environment instead; never a secret key.
2. Push `main` (post-merge). Vercel builds with `node tools/build-dist.js`
   → `dist/`, and `property-software.vercel.app` serves the new build.
3. Verify build log lines: `Runtime environment generated (fallback mode)`
   (or `configured` if step 1 chose pinning) and
   `build-dist complete ... secret scan clean`.

## 8. Production smoke-test checklist (10 minutes)

- `/config/runtime-env.js` → 200, `Cache-Control: no-store`, resolved host
  is the production project.
- `/` renders (activation card on an unapproved device; doors on approved).
- `/app/plotmap/` renders the city gallery; open one city; map loads with
  wash → clear; browser Back returns to the gallery.
- `/admin/developer.html` → developer login form (never blank); sign in as
  platform admin → dealer list + Platform Overview load; Dealer 360 drawer
  opens; Stage-2 tabs (Activity/Properties/Errors) now show live data.
- One dealer device: cold-open → exactly one `app_open` in the timeline.
- Console: no errors on any of the above routes.
- Network: only `czmkfmkmgqlienmdihul.supabase.co` requests.

## 9. Monitoring (first 48 h)

- Supabase Dashboard → Logs → Postgres: watch for `unknown event type`,
  `event rate limit exceeded`, `metadata too large` spikes (indicates a
  client emitting rejected events).
- API error rate on `plotmap_record_device_presentation_event`.
- Vercel deployment logs for 404s on `/config/runtime-env.js` (must be 0).
- Dealer 360 → Errors tab per active dealer.
- Run `select public.plotmap_rollup_daily_usage(7);` as the platform admin
  once daily (or schedule pg_cron) and confirm row counts look sane.

## 10. Stop / rollback conditions & procedure

Stop immediately if: any post-migration verification fails; production
ingestion errors spike; Client Presentation stops rendering for an approved
device; any production request resolves a non-production Supabase host.

Rollback (frontend): Vercel → redeploy the previous production deployment
(instant, no build). Rollback (database) — the migration is additive; to
disable without restore:

```sql
drop function if exists public.plotmap_admin_dealer_360(text);
drop function if exists public.plotmap_admin_platform_overview();
drop function if exists public.plotmap_admin_dealer_events(text, timestamptz, integer, text[], text);
drop function if exists public.plotmap_admin_property_stats(text);
drop function if exists public.plotmap_rollup_daily_usage(integer);
alter table public.presentation_events drop constraint if exists presentation_events_metadata_guard;
-- restore prior ingestion functions by re-running their definitions from
-- supabase/migrations/20260710_developer_control_and_trial_analytics_draft.sql
-- (sections for plotmap_record_device_presentation_event and
--  plotmap_record_presentation_event), which do not include the allowlist.
drop table if exists public.plotmap_daily_usage;
```

Full restore path: the Section-2 snapshot.

## 11. Explicitly out of scope for this rollout

- Any change to RLS policies, device-lock semantics, Map Studio, or map
  geometry (none are in the RC's DB delta).
- `supabase db push` in any form.
- Superseded drafts (`20260707_*draft*`, phase-5 storage policies) — never
  apply these to production.
