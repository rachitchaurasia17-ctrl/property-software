-- PlotMap minimal base schema for a brand-new isolated staging project.
-- STAGING ONLY. This replaces the retired supabase_setup.sql bootstrap.
-- RLS is enabled immediately and no access policies or grants are created;
-- apply supabase_security_patch.sql next, before any API verification.

create extension if not exists pgcrypto;

create table if not exists public.prebuilt_maps (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.crm_records (
  id text primary key,
  dealer_id text not null default 'dealer-demo',
  entity_type text not null,
  payload jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.map_overlays (
  id text primary key,
  dealer_id text not null default 'dealer-demo',
  map_id text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  client_visible boolean not null default true,
  deleted boolean not null default false,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.presentation_events (
  id text primary key,
  dealer_id text not null default 'dealer-demo',
  session_id text not null default '',
  event_type text not null,
  area text,
  sector text,
  map_id text,
  property_id text,
  client_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists crm_records_type_idx
  on public.crm_records (dealer_id, entity_type, updated_at desc);
create index if not exists map_overlays_map_idx
  on public.map_overlays (dealer_id, map_id, status, updated_at desc);
create index if not exists presentation_events_time_idx
  on public.presentation_events (dealer_id, created_at desc);
create index if not exists presentation_events_area_idx
  on public.presentation_events (dealer_id, area);

alter table public.prebuilt_maps enable row level security;
alter table public.crm_records enable row level security;
alter table public.map_overlays enable row level security;
alter table public.presentation_events enable row level security;
