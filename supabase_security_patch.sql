-- ============================================================
-- PlotMap launch-blocker security patch
-- Run after supabase_setup.sql
-- Safe to re-run.
-- ============================================================

create extension if not exists pgcrypto;

alter table if exists public.prebuilt_maps
  add column if not exists dealer_id text not null default 'dealer-demo',
  add column if not exists status text not null default 'published',
  add column if not exists client_visible boolean not null default true,
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('owner', 'team')),
  dealer_id text not null,
  status text not null default 'active' check (status in ('active', 'blocked', 'disabled')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.profiles enable row level security;

create or replace function public.plotmap_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), '');
$$;

create or replace function public.plotmap_current_dealer_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.dealer_id from public.profiles p where p.id = auth.uid()), '');
$$;

create or replace function public.plotmap_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() in ('owner', 'team');
$$;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "plotmap public read" on public.prebuilt_maps;
drop policy if exists "plotmap public write" on public.prebuilt_maps;
drop policy if exists "plotmap prebuilt public read" on public.prebuilt_maps;
drop policy if exists "plotmap prebuilt admin all" on public.prebuilt_maps;
create policy "plotmap prebuilt public read"
on public.prebuilt_maps
for select
to anon, authenticated
using (
  client_visible = true
  and status = 'published'
);
create policy "plotmap prebuilt admin all"
on public.prebuilt_maps
for all
to authenticated
using (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
)
with check (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
);

drop policy if exists "plotmap crm read" on public.crm_records;
drop policy if exists "plotmap crm write" on public.crm_records;
drop policy if exists "plotmap crm admin all" on public.crm_records;
create policy "plotmap crm admin all"
on public.crm_records
for all
to authenticated
using (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
)
with check (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
);

drop policy if exists "plotmap overlays read" on public.map_overlays;
drop policy if exists "plotmap overlays write" on public.map_overlays;
drop policy if exists "plotmap overlays public read" on public.map_overlays;
drop policy if exists "plotmap overlays admin all" on public.map_overlays;
create policy "plotmap overlays public read"
on public.map_overlays
for select
to anon, authenticated
using (
  status = 'published'
  and client_visible = true
  and deleted = false
);
create policy "plotmap overlays admin all"
on public.map_overlays
for all
to authenticated
using (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
)
with check (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
);

drop policy if exists "plotmap pevents read" on public.presentation_events;
drop policy if exists "plotmap pevents insert" on public.presentation_events;
drop policy if exists "plotmap pevents admin read" on public.presentation_events;
drop policy if exists "plotmap pevents public insert" on public.presentation_events;
create policy "plotmap pevents admin read"
on public.presentation_events
for select
to authenticated
using (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
);
create policy "plotmap pevents public insert"
on public.presentation_events
for insert
to anon, authenticated
with check (
  coalesce(metadata ->> 'source', '') = 'client_presentation'
);

create or replace view public.client_safe_properties as
select
  r.id,
  r.dealer_id,
  coalesce(r.payload ->> 'title', r.payload ->> 'name', r.id) as title,
  r.payload ->> 'area' as area,
  coalesce(r.payload ->> 'block', r.payload ->> 'sector', '') as block,
  r.payload ->> 'plotNumber' as plot_number,
  r.payload ->> 'size' as size,
  r.payload ->> 'facing' as facing,
  r.payload ->> 'roadWidth' as road_width,
  r.payload ->> 'description' as description,
  r.payload ->> 'type' as property_type,
  r.payload ->> 'tags' as tags,
  coalesce(r.payload ->> 'internalStatus', 'Available') as internal_status,
  r.updated_at
from public.crm_records r
where r.entity_type = 'properties'
  and r.deleted = false
  and coalesce((r.payload ->> 'clientVisible')::boolean, true) = true
  and coalesce(r.payload ->> 'internalStatus', '') !~* '(archived|internal|hold|sold|hidden)';

grant select on public.client_safe_properties to anon, authenticated;
grant select on public.prebuilt_maps to anon, authenticated;
grant select on public.map_overlays to anon, authenticated;
grant insert on public.presentation_events to anon, authenticated;

comment on view public.client_safe_properties is 'Client-safe property projection for PlotMap presentation route.';
