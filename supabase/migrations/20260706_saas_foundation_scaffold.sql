-- PlotMap SaaS foundation scaffold
-- Incremental migration only. Do not rerun supabase_setup.sql.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists display_name text,
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.dealer_settings (
  dealer_id text primary key,
  brand_name text,
  brand_tagline text,
  accent_color text,
  support_email text,
  support_phone text,
  billing_email text,
  share_base_url text,
  photo_bucket text,
  photo_folder text,
  storage_enabled boolean not null default false,
  subscription_status text not null default 'trial',
  plan_code text,
  seat_limit integer not null default 5,
  seat_count integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  created_by uuid references public.profiles(id) on delete set null,
  target_type text not null,
  target_id text,
  label text not null default 'Client presentation',
  slug text,
  url text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

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

drop policy if exists "plotmap audit logs staff" on public.audit_logs;
create policy "plotmap audit logs staff"
on public.audit_logs
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

grant select, insert, update on public.dealer_settings to authenticated;
grant select, insert, update on public.share_links to authenticated;
grant select, insert on public.audit_logs to authenticated;
