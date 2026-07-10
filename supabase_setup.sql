-- ============================================================
-- ⛔ RETIRED — DO NOT RUN. Kept for historical reference only.
--
-- This file predates the security hardening. Re-running it would
-- RE-CREATE the permissive using(true)/with check(true) anon
-- read/write policies on crm_records / map_overlays /
-- prebuilt_maps / presentation_events (permissive RLS policies are
-- OR-ed, so the hardened policies would NOT protect you).
-- Superseded by: supabase_security_patch.sql + supabase/migrations/*.
-- The guard below makes any accidental run fail immediately.
-- ============================================================
do $$ begin
  raise exception 'supabase_setup.sql is RETIRED — do not run. Use supabase_security_patch.sql + supabase/migrations/ instead.';
end $$;

-- ============================================================
-- PlotMap — Supabase setup (ORIGINAL, RETIRED — see guard above)
-- Run ONCE in your Supabase Dashboard -> SQL Editor
-- Project: czmkfmkmgqlienmdihul
--
-- Part 1 keeps the original A/B/C/D highlight-set table.
-- Part 2 adds the real SaaS persistence tables:
--   crm_records          — synced CRM entities (clients/properties/deals/…)
--   map_overlays         — Map Studio published/draft overlay items
--   presentation_events  — client-presentation analytics events
-- The frontend uses the publishable (anon) key; this is an
-- internal dealer tool, so anon read/write is allowed for now.
-- (Tighten with auth later.)
-- ============================================================

-- ---------- Part 1: original highlight sets ----------
create table if not exists public.prebuilt_maps (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.prebuilt_maps enable row level security;

drop policy if exists "plotmap public read"  on public.prebuilt_maps;
drop policy if exists "plotmap public write" on public.prebuilt_maps;
create policy "plotmap public read"  on public.prebuilt_maps for select using (true);
create policy "plotmap public write" on public.prebuilt_maps for all   using (true) with check (true);

insert into public.prebuilt_maps (label, blocks)
select v.label, '[]'::jsonb
from (values ('A'), ('B'), ('C'), ('D')) as v(label)
where not exists (
  select 1 from public.prebuilt_maps p where upper(trim(p.label)) = v.label
);

-- ---------- Part 2: CRM record sync (generic document table) ----------
-- One row per entity. entity_type: clients | properties | deals |
-- followups | siteVisits | events | staff | areas ...
create table if not exists public.crm_records (
  id text primary key,               -- the local entity id (e.g. p-ab12cd34)
  dealer_id text not null default 'dealer-demo',
  entity_type text not null,
  payload jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists crm_records_type_idx on public.crm_records (dealer_id, entity_type, updated_at desc);

alter table public.crm_records enable row level security;
drop policy if exists "plotmap crm read"  on public.crm_records;
drop policy if exists "plotmap crm write" on public.crm_records;
create policy "plotmap crm read"  on public.crm_records for select using (true);
create policy "plotmap crm write" on public.crm_records for all   using (true) with check (true);

-- ---------- Part 3: Map Studio overlays ----------
-- One row per overlay item (road/sector/block/plot/pin/label/landmark).
create table if not exists public.map_overlays (
  id text primary key,               -- local item id (e.g. ovl-ab12cd34)
  dealer_id text not null default 'dealer-demo',
  map_id text not null,              -- PM_MAP_REGISTRY map id
  kind text not null,                -- road | sector | block | plot | pin | label | landmark | commercial | boundary
  payload jsonb not null default '{}'::jsonb,  -- geometry + name + color + group + rows…
  status text not null default 'draft',        -- draft | published
  client_visible boolean not null default true,
  deleted boolean not null default false,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists map_overlays_map_idx on public.map_overlays (dealer_id, map_id, status, updated_at desc);

alter table public.map_overlays enable row level security;
drop policy if exists "plotmap overlays read"  on public.map_overlays;
drop policy if exists "plotmap overlays write" on public.map_overlays;
create policy "plotmap overlays read"  on public.map_overlays for select using (true);
create policy "plotmap overlays write" on public.map_overlays for all   using (true) with check (true);

-- ---------- Part 4: presentation analytics events ----------
-- Only the client presentation writes here (append-only).
create table if not exists public.presentation_events (
  id text primary key,               -- local event id (pevt-…)
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

create index if not exists presentation_events_time_idx on public.presentation_events (dealer_id, created_at desc);
create index if not exists presentation_events_area_idx on public.presentation_events (dealer_id, area);

alter table public.presentation_events enable row level security;
drop policy if exists "plotmap pevents read"   on public.presentation_events;
drop policy if exists "plotmap pevents insert" on public.presentation_events;
create policy "plotmap pevents read"   on public.presentation_events for select using (true);
create policy "plotmap pevents insert" on public.presentation_events for insert with check (true);
