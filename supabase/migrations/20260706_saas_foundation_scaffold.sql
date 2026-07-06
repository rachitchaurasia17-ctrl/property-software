-- ============================================================
-- PlotMap SaaS foundation scaffold (hardened)
-- Incremental migration only. Do NOT rerun supabase_setup.sql —
-- it recreates permissive public policies and is retired.
--
-- Safe to re-run: contains only IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS statements. No table drops, no deletes,
-- no truncates. Does not touch existing dealer-demo data.
--
-- Apply order: supabase_security_patch.sql should already be live,
-- but this file is self-contained — the helper functions and the
-- profiles table are (re)created here with identical definitions,
-- so it applies cleanly either way.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- profiles (base table from security patch, kept identical) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null,
  dealer_id text not null,
  status text not null default 'active' check (status in ('active', 'blocked', 'disabled')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.profiles enable row level security;

-- Expand the allowed role set for the SaaS role model.
-- Original constraint only allowed ('owner','team'); the new model adds
-- manager / map_editor / property_editor / viewer. Existing rows all use
-- 'owner' or 'team', so this widening cannot fail on existing data.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'team', 'manager', 'map_editor', 'property_editor', 'viewer'));

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- ---------- helper functions (identical to security patch; idempotent) ----------
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

-- Staff = active dealer-side roles that may WRITE dealer data.
-- 'viewer' is deliberately NOT staff: plotmap_is_staff() gates the
-- "for all" (read+write) policies on crm_records / map_overlays /
-- dealer_settings, and viewers must never gain backend write access.
-- Viewers use the public client presentation plus whatever local pages
-- the owner allows; a dedicated read-only RLS tier can be added later.
-- Also hardened vs the original patch: blocked/disabled profiles lose
-- staff access immediately.
create or replace function public.plotmap_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() in ('owner', 'team', 'manager', 'map_editor', 'property_editor')
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), '') = 'active';
$$;

-- ---------- dealer settings (branding + billing readiness) ----------
create table if not exists public.dealer_settings (
  dealer_id text primary key,
  brand_name text,
  brand_tagline text,
  logo_url text,
  accent_color text,
  support_email text,
  support_phone text,
  whatsapp_number text,
  billing_email text,
  default_city text,
  default_map_id text,
  presentation_title text,
  presentation_tagline text,
  share_message text,
  share_base_url text,
  photo_bucket text,
  photo_folder text,
  storage_enabled boolean not null default false,
  -- billing / subscription readiness (no payment integration yet)
  plan_code text,
  subscription_status text not null default 'trial',
  account_status text not null default 'active',
  trial_start timestamptz,
  trial_end timestamptz,
  seat_limit integer not null default 5,
  seat_count integer not null default 1,
  max_maps integer not null default 10,
  max_properties integer not null default 500,
  max_team_members integer not null default 5,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- If the table pre-exists from the earlier scaffold, add the new columns.
alter table public.dealer_settings
  add column if not exists logo_url text,
  add column if not exists whatsapp_number text,
  add column if not exists default_city text,
  add column if not exists default_map_id text,
  add column if not exists presentation_title text,
  add column if not exists presentation_tagline text,
  add column if not exists share_message text,
  add column if not exists account_status text not null default 'active',
  add column if not exists trial_start timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists max_maps integer not null default 10,
  add column if not exists max_properties integer not null default 500,
  add column if not exists max_team_members integer not null default 5;

-- ---------- share links ----------
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  created_by uuid references public.profiles(id) on delete set null,
  target_type text not null,
  target_id text,
  map_id text,
  label text not null default 'Client presentation',
  slug text,
  url text not null,
  status text not null default 'active',
  expires_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.share_links
  add column if not exists map_id text,
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz;

create unique index if not exists share_links_slug_key
  on public.share_links (slug)
  where slug is not null;

create index if not exists share_links_dealer_idx on public.share_links (dealer_id, status);

-- Public share-link resolution WITHOUT exposing the table to anon.
-- Returns only client-safe fields, and only for links that are active
-- and not expired. Clients call this RPC with the slug from the URL;
-- everything else about share_links stays behind staff RLS.
create or replace function public.plotmap_resolve_share_link(share_slug text)
returns table (dealer_id text, target_type text, target_id text, map_id text, label text)
language sql
stable
security definer
set search_path = public
as $$
  select s.dealer_id, s.target_type, s.target_id, s.map_id, s.label
  from public.share_links s
  where s.slug = share_slug
    and s.status = 'active'
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > timezone('utc'::text, now()))
  limit 1;
$$;

grant execute on function public.plotmap_resolve_share_link(text) to anon, authenticated;

-- ---------- audit logs ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action_type text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists audit_logs_dealer_idx on public.audit_logs (dealer_id, created_at desc);

-- ---------- RLS ----------
alter table public.dealer_settings enable row level security;
alter table public.share_links enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "plotmap dealer settings staff" on public.dealer_settings;
create policy "plotmap dealer settings staff"
on public.dealer_settings
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

drop policy if exists "plotmap share links staff" on public.share_links;
create policy "plotmap share links staff"
on public.share_links
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

-- Audit logs are append-only for staff: SELECT + INSERT policies only,
-- never UPDATE/DELETE (an "for all" policy would allow rewriting history
-- if grants ever widen).
drop policy if exists "plotmap audit logs staff" on public.audit_logs;
drop policy if exists "plotmap audit logs staff read" on public.audit_logs;
create policy "plotmap audit logs staff read"
on public.audit_logs
for select
to authenticated
using (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
);

drop policy if exists "plotmap audit logs staff insert" on public.audit_logs;
create policy "plotmap audit logs staff insert"
on public.audit_logs
for insert
to authenticated
with check (
  public.plotmap_is_staff()
  and dealer_id = public.plotmap_current_dealer_id()
);

-- ---------- grants (no anon access to any of these tables) ----------
grant select, insert, update on public.dealer_settings to authenticated;
grant select, insert, update on public.share_links to authenticated;
grant select, insert on public.audit_logs to authenticated;
