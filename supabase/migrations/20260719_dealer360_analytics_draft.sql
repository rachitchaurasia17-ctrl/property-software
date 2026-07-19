-- ============================================================
-- PlotMap — Dealer 360 analytics (Stage 2/3 backend)
-- DRAFT — DO NOT APPLY TO PRODUCTION WITHOUT REVIEW + APPROVAL.
-- Branch: developer-intelligence-and-performance
-- Verify after applying with: node tools/verify-dealer360.js
--
-- What this adds (see docs/DEALER-360-ARCHITECTURE.md):
--   1. Hardened event ingestion (allowlist, metadata cap, rate cap,
--      timestamp clamp) — device gate unchanged.
--   2. plotmap_daily_usage rollup table + idempotent rollup function.
--   3. Platform-admin read RPCs: paginated dealer timeline, one-call
--      Dealer 360 summary, property intelligence, platform overview.
--   4. Supporting ingestion, pagination and aggregate indexes.
--
-- Safety:
--   - No DROP TABLE / DELETE / TRUNCATE. No data deleted or mutated.
--   - No using(true)/with check(true). No anonymous analytics read grants.
--   - plotmap_daily_usage: RLS enabled, zero policies, zero grants —
--     reachable only through the SECURITY DEFINER functions below.
--   - Every plotmap_admin_* function raises unless
--     public.plotmap_is_platform_admin().
--   - Device-lock semantics untouched: the ingestion gate line is
--     byte-identical to the live function.
--   - Reversible: `drop function` / `drop table plotmap_daily_usage`
--     restores the prior surface (raw events untouched); re-running is
--     idempotent (create or replace / if not exists / on conflict).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. supporting columns and indexes ----------
-- Client timestamps are retained in created_at for offline-lite analytics.
-- Rate limiting uses server-controlled ingested_at so a backdated payload
-- cannot bypass the cap.
alter table public.presentation_events
  add column if not exists ingested_at timestamptz;

alter table public.presentation_events
  alter column ingested_at set default now();

create index if not exists presentation_events_dealer_type_idx
  on public.presentation_events (dealer_id, event_type, created_at desc);

create index if not exists presentation_events_dealer_ingested_idx
  on public.presentation_events (dealer_id, ingested_at desc)
  where ingested_at is not null;

create index if not exists presentation_events_dealer_cursor_idx
  on public.presentation_events (dealer_id, created_at desc, id desc);

create index if not exists presentation_events_recent_analytics_idx
  on public.presentation_events (created_at desc, dealer_id, event_type)
  where coalesce(metadata->>'env', '') <> 'local';

create index if not exists presentation_events_type_analytics_idx
  on public.presentation_events (event_type, created_at desc, dealer_id)
  where coalesce(metadata->>'env', '') <> 'local';

-- ---------- 2. event-name allowlist ----------
-- Single source of truth for names the ingestion accepts. Additions are a
-- reviewed migration, never a client-side decision.
create or replace function public.plotmap_event_name_allowed(p_name text)
returns boolean
language sql
immutable
as $$
  select p_name = any (array[
    -- lifecycle
    'app_open', 'dealer_login', 'presentation_opened',
    -- navigation
    'dealer_dashboard_opened', 'team_workspace_opened', 'properties_page_opened',
    'map_studio_opened', 'clients_page_opened', 'insights_page_opened',
    'admin_page_opened', 'client_panel_opened', 'inventory_opened',
    -- maps
    'map_opened', 'area_viewed', 'sector_viewed', 'overlay_selected',
    'sector_proof_clicked', 'original_proof_clicked',
    -- properties
    'property_add_clicked', 'property_added', 'property_selected',
    'property_viewed', 'followup_created_from_presentation',
    -- sharing
    'property_shared_whatsapp', 'brochure_shared', 'property_shared',
    -- health
    'app_error', 'asset_load_failure', 'slow_operation'
  ]);
$$;

revoke all on function public.plotmap_event_name_allowed(text)
  from public, anon, authenticated;
grant execute on function public.plotmap_event_name_allowed(text)
  to anon, authenticated;

create or replace function public.plotmap_event_text_has_secret(p_value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_value, '') ~* '(bearer[[:space:]]+[a-z0-9._~+/-]{12,}|sb_secret_[a-z0-9_-]+|eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{8,})';
$$;

revoke all on function public.plotmap_event_text_has_secret(text)
  from public, anon, authenticated;

-- Reject secret-shaped metadata at every nesting level. Analytics metadata
-- is context, never a credential transport. The checks cover both sensitive
-- key names and common token/access-code value shapes.
create or replace function public.plotmap_event_metadata_has_secret(
  p_value jsonb,
  p_depth integer default 0
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
  v_child jsonb;
  v_text text;
  v_normalized_key text;
begin
  if p_value is null then
    return false;
  end if;
  if p_depth > 5 then
    return true;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      v_normalized_key := regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g');
      if v_normalized_key ~ '(token|passcode|activationcode|accesscode|password|secret|authorization|apikey|cookie)' then
        return true;
      end if;
      if public.plotmap_event_metadata_has_secret(v_child, p_depth + 1) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if public.plotmap_event_metadata_has_secret(v_child, p_depth + 1) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'string' then
    v_text := p_value #>> '{}';
    if public.plotmap_event_text_has_secret(v_text)
       or v_text ~ '(^|[^0-9])[0-9]{8}([^0-9]|$)' then
      return true;
    end if;
  end if;

  return false;
end;
$$;

revoke all on function public.plotmap_event_metadata_has_secret(jsonb, integer)
  from public, anon, authenticated;

-- Return a compact, known-shape analytics object. Arbitrary client keys and
-- raw error messages are discarded; error text is reduced to a coarse code.
create or replace function public.plotmap_sanitize_event_metadata(
  p_event_type text,
  p_metadata jsonb,
  p_surface text
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_input jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_output jsonb := jsonb_build_object(
    'surface', case when p_surface = 'admin' then 'admin' else 'presentation' end
  );
  v_value text;
  v_key text;
begin
  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'metadata must be an object';
  end if;
  if octet_length(v_input::text) > 2048 then
    raise exception 'metadata too large';
  end if;
  if public.plotmap_event_metadata_has_secret(v_input, 0) then
    raise exception 'sensitive analytics metadata rejected';
  end if;

  if v_input->>'env' = 'local' then
    v_output := v_output || jsonb_build_object('env', 'local');
  end if;

  v_value := v_input->>'source';
  if v_value = any (array[
    'client_presentation', 'area_select', 'area_switcher', 'properties_tab',
    'property_detail', 'send_details_later', 'whatsapp'
  ]) then
    v_output := v_output || jsonb_build_object('source', v_value);
  end if;

  foreach v_key in array array['page', 'role', 'view', 'kind', 'via', 'group', 'itemId', 'mapId', 'name']
  loop
    v_value := v_input->>v_key;
    if v_value is not null
       and length(v_value) <= 120
       and v_value ~ '^[A-Za-z0-9][A-Za-z0-9 _.:/()-]*$' then
      v_output := v_output || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  if p_event_type in ('app_error', 'asset_load_failure', 'slow_operation') then
    v_value := lower(coalesce(v_input->>'code', ''));
    v_output := v_output || jsonb_build_object('code', case
      when p_event_type = 'asset_load_failure' then 'asset_load_failure'
      when p_event_type = 'slow_operation' then 'slow_operation'
      when v_value like '%timeout%' or v_value like '%timed out%' then 'timeout'
      when v_value like '%network%' or v_value like '%failed to fetch%' then 'network_error'
      when v_value like '%script error%' then 'script_error'
      else 'client_error'
    end);
  end if;

  return v_output;
end;
$$;

revoke all on function public.plotmap_sanitize_event_metadata(text, jsonb, text)
  from public, anon, authenticated;

-- Enforce the secret/size boundary even if a future privileged writer skips
-- the RPC. NOT VALID avoids breaking rollout on legacy rows; PostgreSQL still
-- enforces the constraint for every new or updated row.
do $metadata_guard$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'presentation_events_metadata_guard'
      and conrelid = 'public.presentation_events'::regclass
  ) then
    alter table public.presentation_events
      add constraint presentation_events_metadata_guard
      check (
        jsonb_typeof(metadata) = 'object'
        and octet_length(metadata::text) <= 2048
        and not public.plotmap_event_metadata_has_secret(metadata, 0)
      ) not valid;
  end if;
end;
$metadata_guard$;

-- ---------- 3. hardened device-gated ingestion ----------
-- Reproduces the live function and adds validation AFTER the (unchanged)
-- device gate: allowlist, metadata size cap, per-dealer rate cap,
-- timestamp clamp. Rejections raise — the client queue marks the item
-- failed and retries with backoff; the product is never blocked.
create or replace function public.plotmap_record_device_presentation_event(
  p_dealer_id text,
  p_device_token text,
  p_session_id text,
  p_event_type text,
  p_area text default null,
  p_sector text default null,
  p_map_id text default null,
  p_property_id text default null,
  p_client_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_event_id text default null,
  p_created_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id text := coalesce(nullif(p_event_id, ''), 'pevt-' || replace(gen_random_uuid()::text, '-', ''));
  v_metadata jsonb;
  v_now timestamptz := now();
  v_created timestamptz;
  v_recent bigint;
begin
  if not public.plotmap_device_is_approved(p_dealer_id, p_device_token) then
    raise exception 'approved dealer device required';
  end if;

  -- validation (Dealer 360 hardening)
  if not public.plotmap_event_name_allowed(coalesce(nullif(p_event_type, ''), 'unknown')) then
    raise exception 'unknown event type';
  end if;
  if length(v_event_id) > 128
     or v_event_id !~ '^[A-Za-z0-9._:-]+$'
     or public.plotmap_event_text_has_secret(v_event_id) then
    raise exception 'invalid event id';
  end if;
  if length(coalesce(p_session_id, '')) > 128
     or length(coalesce(p_area, '')) > 160
     or length(coalesce(p_sector, '')) > 160
     or length(coalesce(p_map_id, '')) > 160
     or length(coalesce(p_property_id, '')) > 160
     or length(coalesce(p_client_id, '')) > 160 then
    raise exception 'event field too large';
  end if;
  if public.plotmap_event_text_has_secret(p_session_id)
     or public.plotmap_event_text_has_secret(p_area)
     or public.plotmap_event_text_has_secret(p_sector)
     or public.plotmap_event_text_has_secret(p_map_id)
     or public.plotmap_event_text_has_secret(p_property_id)
     or public.plotmap_event_text_has_secret(p_client_id) then
    raise exception 'sensitive analytics field rejected';
  end if;
  v_metadata := public.plotmap_sanitize_event_metadata(p_event_type, p_metadata, 'presentation');

  -- Serialize each dealer's rate check so concurrent requests cannot all
  -- pass the same count. A replayed event id succeeds without consuming a
  -- second quota slot.
  perform pg_advisory_xact_lock(hashtextextended('plotmap:event-rate:' || p_dealer_id, 0));
  if exists (
    select 1 from public.presentation_events e
    where e.id = v_event_id and e.dealer_id = p_dealer_id
  ) then
    return;
  end if;
  select count(*) into v_recent
  from public.presentation_events e
  where e.dealer_id = p_dealer_id
    and e.ingested_at >= v_now - interval '15 minutes';
  if v_recent >= 300 then
    raise exception 'event rate limit exceeded';
  end if;
  v_created := coalesce(p_created_at, v_now);
  if v_created < v_now - interval '48 hours' or v_created > v_now + interval '5 minutes' then
    v_created := v_now;
  end if;

  insert into public.presentation_events
    (id, dealer_id, session_id, event_type, area, sector, map_id, property_id, client_id, metadata, created_at, ingested_at)
  values
    (
      v_event_id,
      p_dealer_id,
      coalesce(p_session_id, ''),
      coalesce(nullif(p_event_type, ''), 'unknown'),
      p_area,
      p_sector,
      p_map_id,
      p_property_id,
      p_client_id,
      v_metadata,
      v_created,
      v_now
    )
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.plotmap_record_device_presentation_event(
  text, text, text, text, text, text, text, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.plotmap_record_device_presentation_event(
  text, text, text, text, text, text, text, text, text, jsonb, text, timestamptz
) to anon, authenticated;

-- ---------- 3b. hardened admin-route ingestion (same validation) ----------
-- Reproduces the live dealer-scoped function (auth + own-dealer + active
-- checks byte-identical) and adds the same allowlist / metadata / rate /
-- timestamp validation as the device path, so BOTH ingestion doors enforce
-- one taxonomy.
create or replace function public.plotmap_record_presentation_event(
  p_dealer_id text,
  p_session_id text,
  p_event_type text,
  p_area text default null,
  p_sector text default null,
  p_map_id text default null,
  p_property_id text default null,
  p_client_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_event_id text default null,
  p_created_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id text := coalesce(nullif(p_event_id, ''), 'pevt-' || replace(gen_random_uuid()::text, '-', ''));
  v_metadata jsonb;
  v_now timestamptz := now();
  v_created timestamptz;
  v_recent bigint;
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  if not public.plotmap_is_platform_admin() and not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.dealer_id = p_dealer_id
      and p.status = 'active'
  ) then
    raise exception 'staff profile for this dealer required';
  end if;
  if not public.plotmap_dealer_is_active(p_dealer_id) then
    raise exception 'unknown or inactive dealer';
  end if;

  -- validation (Dealer 360 hardening — identical to the device path)
  if not public.plotmap_event_name_allowed(coalesce(nullif(p_event_type, ''), 'unknown')) then
    raise exception 'unknown event type';
  end if;
  if length(v_event_id) > 128
     or v_event_id !~ '^[A-Za-z0-9._:-]+$'
     or public.plotmap_event_text_has_secret(v_event_id) then
    raise exception 'invalid event id';
  end if;
  if length(coalesce(p_session_id, '')) > 128
     or length(coalesce(p_area, '')) > 160
     or length(coalesce(p_sector, '')) > 160
     or length(coalesce(p_map_id, '')) > 160
     or length(coalesce(p_property_id, '')) > 160
     or length(coalesce(p_client_id, '')) > 160 then
    raise exception 'event field too large';
  end if;
  if public.plotmap_event_text_has_secret(p_session_id)
     or public.plotmap_event_text_has_secret(p_area)
     or public.plotmap_event_text_has_secret(p_sector)
     or public.plotmap_event_text_has_secret(p_map_id)
     or public.plotmap_event_text_has_secret(p_property_id)
     or public.plotmap_event_text_has_secret(p_client_id) then
    raise exception 'sensitive analytics field rejected';
  end if;
  v_metadata := public.plotmap_sanitize_event_metadata(p_event_type, p_metadata, 'admin');

  perform pg_advisory_xact_lock(hashtextextended('plotmap:event-rate:' || p_dealer_id, 0));
  if exists (
    select 1 from public.presentation_events e
    where e.id = v_event_id and e.dealer_id = p_dealer_id
  ) then
    return;
  end if;
  select count(*) into v_recent
  from public.presentation_events e
  where e.dealer_id = p_dealer_id
    and e.ingested_at >= v_now - interval '15 minutes';
  if v_recent >= 300 then
    raise exception 'event rate limit exceeded';
  end if;
  v_created := coalesce(p_created_at, v_now);
  if v_created < v_now - interval '48 hours' or v_created > v_now + interval '5 minutes' then
    v_created := v_now;
  end if;

  insert into public.presentation_events
    (id, dealer_id, session_id, event_type, area, sector, map_id, property_id, client_id, metadata, created_at, ingested_at)
  values
    (
      v_event_id,
      p_dealer_id,
      coalesce(p_session_id, ''),
      coalesce(nullif(p_event_type, ''), 'unknown'),
      p_area,
      p_sector,
      p_map_id,
      p_property_id,
      p_client_id,
      v_metadata,
      v_created,
      v_now
    )
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.plotmap_record_presentation_event(
  text, text, text, text, text, text, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.plotmap_record_presentation_event(
  text, text, text, text, text, text, text, text, jsonb, text, timestamptz
) to authenticated;

-- ---------- 4. daily rollups ----------
create table if not exists public.plotmap_daily_usage (
  dealer_id text not null references public.dealer_settings(dealer_id) on delete cascade,
  day date not null,
  events bigint not null default 0,
  app_opens bigint not null default 0,
  sessions bigint not null default 0,
  active_duration_s bigint not null default 0,
  presentation_opens bigint not null default 0,
  map_opens bigint not null default 0,
  highlight_events bigint not null default 0,
  property_views bigint not null default 0,
  whatsapp_shares bigint not null default 0,
  errors bigint not null default 0,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (dealer_id, day)
);

alter table public.plotmap_daily_usage enable row level security;
-- deny-all: no policies, no grants — SECURITY DEFINER access only
revoke all on public.plotmap_daily_usage from public, anon, authenticated;

-- Idempotent rollup of the last N days from raw events. Excludes local-dev
-- traffic (metadata.env = 'local'). Session duration = per-session
-- max(created_at) - min(created_at), capped at 4h per session as a sanity
-- bound against clock-skewed rows.
create or replace function public.plotmap_rollup_daily_usage(p_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 365);
  v_from date := (timezone('utc'::text, now()))::date - (v_days - 1);
  v_rows integer;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  insert into public.plotmap_daily_usage as t
    (dealer_id, day, events, app_opens, sessions, active_duration_s,
     presentation_opens, map_opens, highlight_events, property_views,
     whatsapp_shares, errors, updated_at)
  with filtered as materialized (
    select
      e.dealer_id,
      (e.created_at at time zone 'utc')::date as day,
      e.session_id,
      e.event_type,
      e.metadata,
      e.created_at
    from public.presentation_events e
    where e.created_at >= (v_from::timestamp at time zone 'utc')
      and coalesce(e.metadata->>'env', '') <> 'local'
  ),
  session_spans as (
    select
      f.dealer_id,
      f.day,
      f.session_id,
      least(
        greatest(extract(epoch from max(f.created_at) - min(f.created_at))::bigint, 0),
        14400
      ) as duration_s
    from filtered f
    where coalesce(f.session_id, '') <> ''
    group by f.dealer_id, f.day, f.session_id
  ),
  durations as (
    select s.dealer_id, s.day, sum(s.duration_s)::bigint as active_duration_s
    from session_spans s
    group by s.dealer_id, s.day
  ),
  aggregates as (
    select
      f.dealer_id,
      f.day,
      count(*) as events,
      count(*) filter (where f.event_type = 'app_open') as app_opens,
      count(distinct f.session_id) filter (where coalesce(f.session_id, '') <> '') as sessions,
      count(*) filter (where f.event_type = 'presentation_opened') as presentation_opens,
      count(*) filter (where f.event_type in ('map_opened', 'sector_viewed', 'area_viewed')) as map_opens,
      count(*) filter (where f.event_type = 'overlay_selected') as highlight_events,
      count(*) filter (where f.event_type in ('property_viewed', 'property_selected')) as property_views,
      count(*) filter (where f.event_type = 'property_shared_whatsapp'
                          or (f.event_type = 'brochure_shared' and f.metadata->>'source' = 'whatsapp')) as whatsapp_shares,
      count(*) filter (where f.event_type in ('app_error', 'asset_load_failure')) as errors
    from filtered f
    group by f.dealer_id, f.day
  )
  select
    a.dealer_id,
    a.day,
    a.events,
    a.app_opens,
    a.sessions,
    coalesce(d.active_duration_s, 0),
    a.presentation_opens,
    a.map_opens,
    a.highlight_events,
    a.property_views,
    a.whatsapp_shares,
    a.errors,
    timezone('utc'::text, now())
  from aggregates a
  left join durations d on d.dealer_id = a.dealer_id and d.day = a.day
  on conflict (dealer_id, day) do update set
    events = excluded.events,
    app_opens = excluded.app_opens,
    sessions = excluded.sessions,
    active_duration_s = excluded.active_duration_s,
    presentation_opens = excluded.presentation_opens,
    map_opens = excluded.map_opens,
    highlight_events = excluded.highlight_events,
    property_views = excluded.property_views,
    whatsapp_shares = excluded.whatsapp_shares,
    errors = excluded.errors,
    updated_at = excluded.updated_at;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.plotmap_rollup_daily_usage(integer)
  from public, anon, authenticated;
grant execute on function public.plotmap_rollup_daily_usage(integer) to authenticated;

-- ---------- 5. paginated dealer timeline ----------
create or replace function public.plotmap_admin_dealer_events(
  p_dealer_id text,
  p_before timestamptz default null,
  p_limit integer default 50,
  p_types text[] default null,
  p_before_id text default null
)
returns table (
  id text,
  event_type text,
  area text,
  sector text,
  map_id text,
  property_id text,
  session_id text,
  surface text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  return query
  select
    e.id,
    e.event_type,
    e.area,
    e.sector,
    e.map_id,
    e.property_id,
    e.session_id,
    case when e.metadata->>'surface' = 'admin' then 'admin' else 'presentation' end as surface,
    case
      when jsonb_typeof(coalesce(e.metadata, '{}'::jsonb)) <> 'object'
        or public.plotmap_event_metadata_has_secret(coalesce(e.metadata, '{}'::jsonb), 0)
      then jsonb_build_object(
        'surface', case when e.metadata->>'surface' = 'admin' then 'admin' else 'presentation' end,
        'redacted', true
      )
      else public.plotmap_sanitize_event_metadata(
        e.event_type,
        e.metadata,
        coalesce(e.metadata->>'surface', 'presentation')
      )
    end as metadata,
    e.created_at
  from public.presentation_events e
  where e.dealer_id = p_dealer_id
    and (
      p_before is null
      or e.created_at < p_before
      or (p_before_id is not null and e.created_at = p_before and e.id < p_before_id)
    )
    and (p_types is null or e.event_type = any (p_types))
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke all on function public.plotmap_admin_dealer_events(text, timestamptz, integer, text[], text)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_dealer_events(text, timestamptz, integer, text[], text)
  to authenticated;

-- ---------- 6. property intelligence (authoritative, from crm_records) ----------
-- Legacy/local property payloads are not guaranteed to contain a valid ISO
-- timestamp. One malformed row must not take down the complete Dealer 360
-- response.
create or replace function public.plotmap_safe_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  if p_value is null or trim(p_value) = '' then
    return null;
  end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

revoke all on function public.plotmap_safe_timestamptz(text)
  from public, anon, authenticated;

create or replace function public.plotmap_admin_property_stats(p_dealer_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'available', count(*) filter (where coalesce(r.payload->>'internalStatus', 'Available') = 'Available'),
    'sold', count(*) filter (where r.payload->>'internalStatus' = 'Sold'),
    'onHold', count(*) filter (where r.payload->>'internalStatus' = 'On Hold'),
    'internalOnly', count(*) filter (where r.payload->>'internalStatus' = 'Internal Only'),
    'clientVisible', count(*) filter (where coalesce(r.payload->>'clientVisible', 'true') <> 'false'),
    'hidden', count(*) filter (where r.payload->>'clientVisible' = 'false'),
    'missingPhotos', count(*) filter (where case
      when jsonb_typeof(r.payload->'photos') = 'array' then jsonb_array_length(r.payload->'photos') = 0
      else true
    end),
    'missingArea', count(*) filter (where coalesce(r.payload->>'area', '') = ''),
    'missingSector', count(*) filter (where coalesce(r.payload->>'sector', r.payload->>'block', '') = ''),
    'missingMapLink', count(*) filter (where coalesce(r.payload->>'sectorMapId', '') = '' and coalesce(r.payload->>'masterMapId', '') = ''),
    'added7d', count(*) filter (where public.plotmap_safe_timestamptz(r.payload->>'createdAt') >= now() - interval '7 days'),
    'added30d', count(*) filter (where public.plotmap_safe_timestamptz(r.payload->>'createdAt') >= now() - interval '30 days'),
    'lastAdded', max(public.plotmap_safe_timestamptz(r.payload->>'createdAt')),
    'lastUpdated', max(r.updated_at)
  ) into v
  from public.crm_records r
  where r.dealer_id = p_dealer_id
    and r.entity_type = 'properties'
    and coalesce(r.deleted, false) = false;

  return coalesce(v, '{}'::jsonb);
end;
$$;

revoke all on function public.plotmap_admin_property_stats(text)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_property_stats(text) to authenticated;

-- ---------- 7. one-call Dealer 360 summary ----------
create or replace function public.plotmap_admin_dealer_360(p_dealer_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_account jsonb;
  v_usage jsonb;
  v_devices jsonb;
  v_errors jsonb;
  v_maps jsonb;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  select to_jsonb(d) - 'developer_notes' || jsonb_build_object('developer_notes', d.developer_notes)
    into v_account
  from public.dealer_settings d where d.dealer_id = p_dealer_id;
  if v_account is null then
    raise exception 'unknown dealer';
  end if;

  select jsonb_build_object(
    'firstActive', min(e.created_at),
    'lastActive', max(e.created_at),
    'totalEvents', count(*),
    'appOpens', count(*) filter (where e.event_type = 'app_open'),
    'sessions', count(distinct e.session_id) filter (where coalesce(e.session_id,'') <> ''),
    'activeDays', count(distinct e.created_at::date),
    'events7d', count(*) filter (where e.created_at >= timezone('utc'::text, now()) - interval '7 days'),
    'events30d', count(*) filter (where e.created_at >= timezone('utc'::text, now()) - interval '30 days'),
    'presentationOpens', count(*) filter (where e.event_type = 'presentation_opened'),
    'whatsappShares', count(*) filter (where e.event_type = 'property_shared_whatsapp'
                        or (e.event_type = 'brochure_shared' and e.metadata->>'source' = 'whatsapp')),
    'durationS', coalesce((
      select sum(least(extract(epoch from s.dur)::bigint, 14400))
      from (
        select max(e2.created_at) - min(e2.created_at) as dur
        from public.presentation_events e2
        where e2.dealer_id = p_dealer_id
          and coalesce(e2.session_id, '') <> ''
          and coalesce(e2.metadata->>'env', '') <> 'local'
        group by e2.session_id
      ) s
    ), 0)
  ) into v_usage
  from public.presentation_events e
  where e.dealer_id = p_dealer_id
    and coalesce(e.metadata->>'env', '') <> 'local';

  select jsonb_build_object(
    'approved', count(*) filter (where dv.status = 'approved'),
    'pending', count(*) filter (where dv.status = 'pending'),
    'rejected', count(*) filter (where dv.status = 'rejected'),
    'revoked', count(*) filter (where dv.status = 'revoked'),
    'lastSeen', max(dv.last_seen)
  ) into v_devices
  from public.dealer_devices dv where dv.dealer_id = p_dealer_id;

  select jsonb_build_object(
    'errors24h', count(*) filter (where e.created_at >= timezone('utc'::text, now()) - interval '24 hours'),
    'errors7d', count(*) filter (where e.created_at >= timezone('utc'::text, now()) - interval '7 days'),
    'latest', max(e.created_at),
    'latestCode', (
      select e3.metadata->>'code' from public.presentation_events e3
      where e3.dealer_id = p_dealer_id
        and e3.event_type in ('app_error', 'asset_load_failure')
        and coalesce(e3.metadata->>'env', '') <> 'local'
      order by e3.created_at desc limit 1
    )
  ) into v_errors
  from public.presentation_events e
  where e.dealer_id = p_dealer_id
    and e.event_type in ('app_error', 'asset_load_failure')
    and coalesce(e.metadata->>'env', '') <> 'local';

  select jsonb_build_object(
    'citiesOpened', (
      select coalesce(jsonb_agg(distinct e.area) filter (where e.area is not null), '[]'::jsonb)
      from public.presentation_events e
      where e.dealer_id = p_dealer_id
        and e.event_type in ('map_opened', 'area_viewed')
        and coalesce(e.metadata->>'env', '') <> 'local'
    ),
    'topMap', (
      select e.map_id from public.presentation_events e
      where e.dealer_id = p_dealer_id
        and e.event_type = 'map_opened'
        and e.map_id is not null
        and coalesce(e.metadata->>'env', '') <> 'local'
      group by e.map_id order by count(*) desc limit 1
    ),
    'mapOpens', (
      select count(*) from public.presentation_events e
      where e.dealer_id = p_dealer_id
        and e.event_type = 'map_opened'
        and coalesce(e.metadata->>'env', '') <> 'local'
    ),
    'highlights', (
      select count(*) from public.presentation_events e
      where e.dealer_id = p_dealer_id
        and e.event_type = 'overlay_selected'
        and coalesce(e.metadata->>'env', '') <> 'local'
    ),
    'mapFailures', (
      select count(*) from public.presentation_events e
      where e.dealer_id = p_dealer_id
        and e.event_type = 'asset_load_failure'
        and coalesce(e.metadata->>'env', '') <> 'local'
    )
  ) into v_maps;

  return jsonb_build_object(
    'account', v_account,
    'usage', coalesce(v_usage, '{}'::jsonb),
    'devices', coalesce(v_devices, '{}'::jsonb),
    'errors', coalesce(v_errors, '{}'::jsonb),
    'maps', coalesce(v_maps, '{}'::jsonb),
    'properties', public.plotmap_admin_property_stats(p_dealer_id)
  );
end;
$$;

revoke all on function public.plotmap_admin_dealer_360(text)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_dealer_360(text) to authenticated;

-- ---------- 8. platform overview ----------
create or replace function public.plotmap_admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  select jsonb_build_object(
    'dealers', (select count(*) from public.dealer_settings),
    'dealersActivePlan', (select count(*) from public.dealer_settings d
      where d.account_status = 'active' and coalesce(d.subscription_status, 'trial') <> 'trial'),
    'dealersTrial', (select count(*) from public.dealer_settings d
      where d.account_status = 'active' and coalesce(d.subscription_status, 'trial') = 'trial'),
    'dealersSuspended', (select count(*) from public.dealer_settings d
      where d.account_status in ('suspended', 'expired')),
    'trialsEndingSoon', (select count(*) from public.dealer_settings d
      where coalesce(d.subscription_status, 'trial') = 'trial'
        and d.trial_end between timezone('utc'::text, now()) and timezone('utc'::text, now()) + interval '7 days'),
    'devicesApproved', (select count(*) from public.dealer_devices where status = 'approved'),
    'devicesPending', (select count(*) from public.dealer_devices where status = 'pending'),
    'properties', (select count(*) from public.crm_records r
      where r.entity_type = 'properties' and coalesce(r.deleted, false) = false),
    'activeDealers24h', (select count(distinct e.dealer_id) from public.presentation_events e
      where e.created_at >= timezone('utc'::text, now()) - interval '24 hours'
        and coalesce(e.metadata->>'env', '') <> 'local'),
    'activeDealers7d', (select count(distinct e.dealer_id) from public.presentation_events e
      where e.created_at >= timezone('utc'::text, now()) - interval '7 days'
        and coalesce(e.metadata->>'env', '') <> 'local'),
    'presentationOpens', (select count(*) from public.presentation_events e
      where e.event_type = 'presentation_opened' and coalesce(e.metadata->>'env', '') <> 'local'),
    'mapInteractions', (select count(*) from public.presentation_events e
      where e.event_type in ('map_opened', 'sector_viewed', 'area_viewed', 'overlay_selected')
        and coalesce(e.metadata->>'env', '') <> 'local'),
    'errors24h', (select count(*) from public.presentation_events e
      where e.event_type in ('app_error', 'asset_load_failure')
        and e.created_at >= timezone('utc'::text, now()) - interval '24 hours'
        and coalesce(e.metadata->>'env', '') <> 'local')
  ) into v;

  return v;
end;
$$;

revoke all on function public.plotmap_admin_platform_overview()
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_platform_overview() to authenticated;

-- ============================================================
-- PRODUCTION ROLLOUT (do NOT run any of this without approval)
--   1. Review this file (security: deny-all rollup table, admin gates,
--      unchanged device gate).
--   2. Apply in the SQL editor.
--   3. node tools/verify-dealer360.js   (checks gating + validation)
--   4. Open /admin/developer.html — the Stage 2/3 panels detect the new
--      RPCs automatically and light up; nothing else to deploy.
--   5. Optionally schedule plotmap_rollup_daily_usage(7) daily (pg_cron or
--      manual button in Developer Control).
-- Retention: raw events target 180 days (documented; enforcement is a
-- future reviewed job — nothing is deleted by this migration).
-- ============================================================
