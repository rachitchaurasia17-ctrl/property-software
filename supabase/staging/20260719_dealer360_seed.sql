-- PlotMap Dealer 360 staging fixtures.
-- STAGING ONLY. Never run against the production Supabase project.
--
-- Before running, create these three users in Staging > Authentication > Users:
--   plotmap.platform.staging@example.com
--   plotmap.dealer-a.staging@example.com
--   plotmap.dealer-b.staging@example.com
--
-- Run after 20260710_developer_control_and_trial_analytics_draft.sql and
-- before 20260719_dealer360_analytics_draft.sql. This intentionally creates
-- pre-migration event history, including 60 equal-timestamp rows for cursor
-- pagination verification.

do $seed$
declare
  v_admin_id uuid;
  v_dealer_a_id uuid;
  v_dealer_b_id uuid;
  v_page_time timestamptz := date_trunc('second', now() - interval '2 hours');
begin
  select id into v_admin_id
  from auth.users
  where lower(email) = 'plotmap.platform.staging@example.com';

  select id into v_dealer_a_id
  from auth.users
  where lower(email) = 'plotmap.dealer-a.staging@example.com';

  select id into v_dealer_b_id
  from auth.users
  where lower(email) = 'plotmap.dealer-b.staging@example.com';

  if v_admin_id is null or v_dealer_a_id is null or v_dealer_b_id is null then
    raise exception 'Create all three documented staging Auth users before running the seed';
  end if;

  insert into public.dealer_settings (
    dealer_id, brand_name, account_status, subscription_status,
    trial_start, trial_end, plan_code, paid, max_devices_allowed
  )
  select 'dealer-staging-platform', 'PlotMap Staging Platform', 'active', 'trial',
         now(), now() + interval '30 days', 'staging', false, 1
  where not exists (
    select 1 from public.dealer_settings where dealer_id = 'dealer-staging-platform'
  );

  insert into public.dealer_settings (
    dealer_id, brand_name, account_status, subscription_status,
    trial_start, trial_end, plan_code, paid, max_devices_allowed
  )
  select 'dealer-staging-a', 'Dealer A Staging', 'active', 'trial',
         now(), now() + interval '30 days', 'staging', false, 2
  where not exists (
    select 1 from public.dealer_settings where dealer_id = 'dealer-staging-a'
  );

  insert into public.dealer_settings (
    dealer_id, brand_name, account_status, subscription_status,
    trial_start, trial_end, plan_code, paid, max_devices_allowed
  )
  select 'dealer-staging-b', 'Dealer B Suspended Staging', 'suspended', 'trial',
         now(), now() + interval '30 days', 'staging', false, 1
  where not exists (
    select 1 from public.dealer_settings where dealer_id = 'dealer-staging-b'
  );

  insert into public.profiles (id, email, role, dealer_id, status, display_name)
  values
    (v_admin_id, 'plotmap.platform.staging@example.com', 'owner', 'dealer-staging-platform', 'active', 'Staging Platform Admin'),
    (v_dealer_a_id, 'plotmap.dealer-a.staging@example.com', 'owner', 'dealer-staging-a', 'active', 'Dealer A Owner'),
    (v_dealer_b_id, 'plotmap.dealer-b.staging@example.com', 'owner', 'dealer-staging-b', 'active', 'Dealer B Owner')
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    dealer_id = excluded.dealer_id,
    status = excluded.status,
    display_name = excluded.display_name,
    updated_at = now();

  insert into public.platform_admins (profile_id, status, notes)
  values (v_admin_id, 'active', 'Dealer 360 staging verification only')
  on conflict (profile_id) do update set
    status = 'active',
    notes = excluded.notes,
    updated_at = now();

  insert into public.dealer_devices (
    dealer_id, device_token_hash, status, device_label, browser_info,
    approved_at, approved_by, developer_notes
  )
  select
    'dealer-staging-a',
    crypt('plotmap-staging-device-a-00000000000000000001', gen_salt('bf', 10)),
    'approved',
    'Dealer A staging device',
    'Dealer 360 automated staging fixture',
    now(),
    v_admin_id,
    'STAGING ONLY'
  where not exists (
    select 1 from public.dealer_devices
    where dealer_id = 'dealer-staging-a' and device_label = 'Dealer A staging device'
  );

  insert into public.dealer_devices (
    dealer_id, device_token_hash, status, device_label, browser_info,
    approved_at, approved_by, developer_notes
  )
  select
    'dealer-staging-b',
    crypt('plotmap-staging-device-b-00000000000000000002', gen_salt('bf', 10)),
    'approved',
    'Dealer B staging device',
    'Dealer 360 automated staging fixture',
    now(),
    v_admin_id,
    'STAGING ONLY - dealer remains suspended'
  where not exists (
    select 1 from public.dealer_devices
    where dealer_id = 'dealer-staging-b' and device_label = 'Dealer B staging device'
  );

  insert into public.crm_records (id, dealer_id, entity_type, payload, deleted, updated_at)
  values
    (
      'prop-staging-a-1',
      'dealer-staging-a',
      'properties',
      jsonb_build_object(
        'title', 'Dealer A Client Safe Plot',
        'area', 'Staging City',
        'sector', 'Sector A',
        'plotNumber', 'A-101',
        'clientVisible', true,
        'internalStatus', 'Available',
        'photos', '[]'::jsonb,
        'createdAt', now() - interval '1 day'
      ),
      false,
      now()
    ),
    (
      'prop-staging-b-1',
      'dealer-staging-b',
      'properties',
      jsonb_build_object(
        'title', 'Dealer B Suspended Plot',
        'area', 'Staging City',
        'sector', 'Sector B',
        'plotNumber', 'B-201',
        'clientVisible', true,
        'internalStatus', 'Available',
        'photos', '[]'::jsonb,
        'createdAt', now() - interval '1 day'
      ),
      false,
      now()
    )
  on conflict (id) do nothing;

  insert into public.presentation_events (
    id, dealer_id, session_id, event_type, area, metadata, created_at
  )
  select
    'pevt-staging-page-' || lpad(g::text, 3, '0'),
    'dealer-staging-a',
    'staging-page-session-' || lpad(g::text, 3, '0'),
    'area_viewed',
    'Staging City',
    jsonb_build_object('source', 'client_presentation', 'surface', 'presentation'),
    v_page_time
  from generate_series(1, 60) g
  on conflict (id) do nothing;

  insert into public.presentation_events (
    id, dealer_id, session_id, event_type, area, metadata, created_at
  )
  values
    ('pevt-staging-a-open', 'dealer-staging-a', 'staging-a-open', 'app_open', 'Staging City',
      '{"source":"client_presentation","surface":"presentation"}'::jsonb, v_page_time - interval '1 hour'),
    ('pevt-staging-b-open', 'dealer-staging-b', 'staging-b-open', 'app_open', 'Staging City',
      '{"source":"client_presentation","surface":"presentation"}'::jsonb, v_page_time - interval '1 hour')
  on conflict (id) do nothing;
end;
$seed$;

select dealer_id, account_status, subscription_status, max_devices_allowed
from public.dealer_settings
where dealer_id in ('dealer-staging-platform', 'dealer-staging-a', 'dealer-staging-b')
order by dealer_id;

select dealer_id, status, device_label
from public.dealer_devices
where dealer_id in ('dealer-staging-a', 'dealer-staging-b')
order by dealer_id;

select dealer_id, count(*) as event_count
from public.presentation_events
where dealer_id in ('dealer-staging-a', 'dealer-staging-b')
group by dealer_id
order by dealer_id;
