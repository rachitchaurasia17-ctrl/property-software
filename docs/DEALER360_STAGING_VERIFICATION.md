# Dealer 360 staging verification

Status: staging-only procedure. Do not point these steps, seeds, or test tools at the production project (`czmkfmkmgqlienmdihul`).

## 1. Create and identify staging

1. Create a separate Supabase project named clearly as PlotMap staging.
2. Record its project URL and publishable anon key. Do not obtain or use a service-role key for the verification tools.
3. Confirm the staging project reference is different from `czmkfmkmgqlienmdihul`.
4. Create these Auth users in Staging > Authentication > Users, with separate staging-only passwords:
   - `plotmap.platform.staging@example.com`
   - `plotmap.dealer-a.staging@example.com`
   - `plotmap.dealer-b.staging@example.com`
5. Keep the staging SQL editor open on the staging project and verify the project name before every script.

## 2. Build the prerequisite schema

For a brand-new empty staging project only, run these two root scripts first:

1. `supabase_setup.sql`
2. `supabase_security_patch.sql` immediately afterward

`supabase_setup.sql` is retired for existing/production databases. It is used here only because it is the repository's sole creator of `prebuilt_maps`, `crm_records`, `map_overlays`, and `presentation_events`. Do not stop after it because its temporary policies are permissive.

Then run these existing migrations in this exact order:

1. `supabase/migrations/20260706_saas_foundation_scaffold.sql`
2. `supabase/migrations/20260707a_multi_dealer_rpc_setup.sql`
3. `supabase/migrations/20260707b_multi_dealer_anon_lockdown.sql`
4. `supabase/migrations/20260708_team_role_rls_enforcement.sql`
5. `supabase/migrations/20260708_phase4_account_gating_enforcement.sql`
6. `supabase/migrations/20260710_developer_control_and_trial_analytics_draft.sql`

Do not run these superseded/unrelated drafts for Dealer 360 staging:

- `20260707_multi_dealer_isolation_draft.sql`
- `20260707_team_permissions_rls_draft.sql`
- `20260707_storage_photo_policies_draft.sql`
- `20260708_phase5_property_photo_storage_policies.sql`

## 3. Seed pre-migration fixtures

Run:

`supabase/staging/20260719_dealer360_seed.sql`

Expected fixtures:

- one active platform-admin profile
- active `dealer-staging-a`
- suspended `dealer-staging-b`
- one approved hashed device per dealer
- one property per dealer
- 61 Dealer A events, including 60 `area_viewed` events with the exact same timestamp
- one Dealer B event

The raw staging device values are test fixtures, not production credentials. The database stores only bcrypt hashes.

## 4. Apply Dealer 360 to staging

Run only on the staging project:

`supabase/migrations/20260719_dealer360_analytics_draft.sql`

Record:

- complete SQL editor execution time
- every SQL error and line number
- time spent on each `CREATE INDEX` if the SQL editor exposes statement timing
- `presentation_events` row count before and after (must be unchanged)

Post-apply SQL checks:

```sql
select count(*) from public.presentation_events;

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'presentation_events'
  and column_name = 'ingested_at';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'presentation_events'
order by indexname;

select conname, convalidated
from pg_constraint
where conrelid = 'public.presentation_events'::regclass
  and conname = 'presentation_events_metadata_guard';

select proname, prosecdef, proacl
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'plotmap_record_device_presentation_event',
    'plotmap_record_presentation_event',
    'plotmap_rollup_daily_usage',
    'plotmap_admin_dealer_events',
    'plotmap_admin_property_stats',
    'plotmap_admin_dealer_360',
    'plotmap_admin_platform_overview'
  )
order by proname;

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('presentation_events', 'plotmap_daily_usage')
order by tablename, policyname;
```

Expected results:

- `presentation_events` row count is unchanged by the migration.
- `ingested_at` exists with a server default.
- all five Dealer 360 event indexes exist.
- `presentation_events_metadata_guard` exists with `convalidated = false`; it still protects new/updated rows.
- all analytics/admin RPCs are `SECURITY DEFINER` and executable only by their documented roles.
- `plotmap_daily_usage` has RLS enabled and no public policies.
- existing `presentation_events` member-read policy remains own-dealer scoped.

## 5. Run verification tools

Set these as process environment variables without committing their values:

- `SUPABASE_STAGING_URL`
- `SUPABASE_STAGING_ANON_KEY`
- `DEALER360_STAGING_CONFIRM=staging-only`
- `DEALER360_STAGING_ADMIN_PASSWORD`
- `DEALER360_STAGING_DEALER_A_PASSWORD`
- `DEALER360_STAGING_DEALER_B_PASSWORD`

Optional overrides exist for the three staging emails and two fixture device tokens; the defaults match the seed file.

Run the non-mutating security verifier against staging:

```powershell
$env:SUPABASE_URL = $env:SUPABASE_STAGING_URL
$env:SUPABASE_ANON_KEY = $env:SUPABASE_STAGING_ANON_KEY
node tools/verify-dealer360.js
```

Then run the staging integration suite. It writes two test analytics events and runs the seven-day rollup:

```powershell
node tools/verify-dealer360-staging.js
```

The staging suite verifies:

- anonymous and normal-dealer platform analytics denial
- platform-admin overview, Dealer 360 and property-stat access
- Dealer A to Dealer B event injection denial
- suspended Dealer B staff and device rejection
- credential metadata rejection
- unknown event-name rejection
- duplicate event idempotency
- two-page `(created_at, id)` cursor correctness across equal timestamps
- daily rollup execution
- anonymous raw-event and rollup denial

## 6. Rollout decision

Dealer 360 remains blocked from production if any SQL statement fails, any live check fails, an admin RPC is executable by anon, a cross-dealer write succeeds, a suspended dealer writes, duplicate count is not exactly one, pagination returns overlap/missing rows, or index creation produces unacceptable write interruption.

Only after all staging evidence is recorded should a separate production rollout approval be requested.
