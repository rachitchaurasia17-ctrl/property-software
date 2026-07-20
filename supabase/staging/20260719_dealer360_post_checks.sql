-- Dealer 360 staging-only post-migration shape checks.

select json_build_object(
  'dealer360_index_count', (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'presentation_events'
      and indexname in (
        'presentation_events_dealer_type_idx',
        'presentation_events_dealer_ingested_idx',
        'presentation_events_dealer_cursor_idx',
        'presentation_events_recent_analytics_idx',
        'presentation_events_type_analytics_idx'
      )
  ),
  'ingested_at_has_default', (
    select column_default is not null
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'presentation_events'
      and column_name = 'ingested_at'
  ),
  'metadata_guard_unvalidated', (
    select not convalidated
    from pg_constraint
    where conrelid = 'public.presentation_events'::regclass
      and conname = 'presentation_events_metadata_guard'
  ),
  'admin_security_definer_count', (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'plotmap_admin_dealer_events',
        'plotmap_admin_property_stats',
        'plotmap_admin_dealer_360',
        'plotmap_admin_platform_overview'
      )
      and prosecdef
  ),
  'anon_admin_execute_count', (
    select count(*)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'plotmap_admin_dealer_events',
        'plotmap_admin_property_stats',
        'plotmap_admin_dealer_360',
        'plotmap_admin_platform_overview'
      )
      and has_function_privilege('anon', oid, 'EXECUTE')
  ),
  'rls_table_count', (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('presentation_events', 'plotmap_daily_usage')
      and c.relrowsecurity
  ),
  'daily_usage_public_policy_count', (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'plotmap_daily_usage'
  )
);
