-- ============================================================
-- PlotMap - Multi-Dealer Isolation RPC setup
-- Phase 2 Migration A. Safe to apply before the RPC frontend deploy.
--
-- Purpose:
--   Add dealer-scoped SECURITY DEFINER RPCs for Client Presentation
--   reads/writes without removing the old direct anon table/view paths.
--
-- Rollout safety:
--   - Non-breaking for old production frontend.
--   - No revokes.
--   - No public policy drops.
--   - No destructive schema or data operations.
--   - No unconditional private-table policies.
--   - Does not mutate existing data rows.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- indexes for dealer-scoped reads/writes ----------
create index if not exists crm_records_dealer_idx
  on public.crm_records (dealer_id);

create index if not exists crm_records_dealer_entity_idx
  on public.crm_records (dealer_id, entity_type);

create index if not exists map_overlays_dealer_idx
  on public.map_overlays (dealer_id, map_id);

create index if not exists prebuilt_maps_dealer_idx
  on public.prebuilt_maps (dealer_id);

create index if not exists presentation_events_dealer_idx
  on public.presentation_events (dealer_id, created_at desc);

-- ---------- shared active-dealer guard ----------
create or replace function public.plotmap_dealer_is_active(p_dealer_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_settings d
    where d.dealer_id = p_dealer_id
      and coalesce(d.account_status, 'active') = 'active'
  );
$$;

-- ---------- public Client Presentation reads ----------
create or replace function public.plotmap_client_properties(p_dealer_id text)
returns setof public.client_safe_properties
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from public.client_safe_properties c
  where c.dealer_id = p_dealer_id
    and public.plotmap_dealer_is_active(p_dealer_id);
$$;

create or replace function public.plotmap_client_maps(p_dealer_id text)
returns setof public.prebuilt_maps
language sql
stable
security definer
set search_path = public
as $$
  select m.*
  from public.prebuilt_maps m
  where m.dealer_id = p_dealer_id
    and m.status = 'published'
    and m.client_visible = true
    and public.plotmap_dealer_is_active(p_dealer_id)
  order by m.created_at asc;
$$;

create or replace function public.plotmap_client_overlays(p_dealer_id text)
returns setof public.map_overlays
language sql
stable
security definer
set search_path = public
as $$
  select o.*
  from public.map_overlays o
  where o.dealer_id = p_dealer_id
    and o.status = 'published'
    and o.client_visible = true
    and o.deleted = false
    and public.plotmap_dealer_is_active(p_dealer_id)
  order by o.updated_at asc;
$$;

grant execute on function public.plotmap_client_properties(text) to anon, authenticated;
grant execute on function public.plotmap_client_maps(text) to anon, authenticated;
grant execute on function public.plotmap_client_overlays(text) to anon, authenticated;

-- ---------- public Client Presentation analytics write ----------
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
  v_metadata jsonb := jsonb_set(coalesce(p_metadata, '{}'::jsonb), '{source}', '"client_presentation"', true);
begin
  if not public.plotmap_dealer_is_active(p_dealer_id) then
    raise exception 'unknown or inactive dealer';
  end if;

  insert into public.presentation_events
    (id, dealer_id, session_id, event_type, area, sector, map_id, property_id, client_id, metadata, created_at)
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
      coalesce(p_created_at, timezone('utc'::text, now()))
    )
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.plotmap_record_presentation_event(
  text, text, text, text, text, text, text, text, jsonb, text, timestamptz
) to anon, authenticated;
