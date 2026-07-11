-- ============================================================
-- PlotMap - Developer Control Panel + Passcode Login + Trial Analytics
-- DRAFT — REVIEW BEFORE APPLYING (Codex/security review requested).
-- Apply manually in the Supabase SQL editor AFTER review.
--
-- Why this migration is required (cannot be done frontend-only):
--   1. Passcode login: a static frontend shipping only the publishable
--      anon key can never verify a secret safely — any check in JS is
--      readable by the client. Verification must happen server-side in
--      a SECURITY DEFINER function against a bcrypt hash, and the only
--      way a passcode can yield a REAL authorized session (RLS-scoped
--      writes) is to map it to a dedicated Supabase Auth user per
--      dealer. This file stores hashes + resolves passcode -> dealer;
--      the auth user itself is created once by the provider (see the
--      onboarding notes at the bottom).
--   2. Cross-dealer trial analytics: staff RLS scopes presentation_events
--      SELECT to the caller's own dealer. The developer needs aggregates
--      across ALL dealers -> platform-admin-gated SECURITY DEFINER RPCs.
--   3. Dealer directory fields (owner name/phone/area, developer notes)
--      do not exist in dealer_settings yet.
--
-- Safety properties (mirrors the phase 1-5 conventions):
--   - No DROP TABLE / DELETE / TRUNCATE. No using(true) policies.
--   - dealer_passcodes has RLS enabled with NO policies (deny-all) and
--     no table grants — it is reachable ONLY through the SECURITY
--     DEFINER functions below. Hashes never leave the database.
--   - Every plotmap_admin_* function raises unless
--     public.plotmap_is_platform_admin() (phase 4) is true.
--   - plotmap_passcode_login never returns data for a wrong passcode,
--     never distinguishes "unknown" from "wrong", never returns the
--     login email for a blocked dealer, and sleeps ~250ms per call to
--     damp brute force. Passcodes must be >= 8 chars at set time.
--   - Does not weaken the phase 2 anon lockdown or phase 4 gating.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. dealer directory fields ----------
alter table public.dealer_settings
  add column if not exists owner_name text,
  add column if not exists owner_phone text,
  add column if not exists primary_area text,
  add column if not exists developer_notes text;

-- Extend the phase-4 provider-only column guard so a dealer cannot edit
-- developer_notes (their own row is UPDATE-able under "plotmap dealer
-- settings update"). Full function body reproduced from
-- 20260708_phase4_account_gating_enforcement.sql with ONE addition:
-- new.developer_notes is distinct from old.developer_notes.
create or replace function public.plotmap_guard_dealer_settings_account_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and not public.plotmap_is_platform_admin()
     and (
       new.billing_email is distinct from old.billing_email
       or new.storage_enabled is distinct from old.storage_enabled
       or new.plan_code is distinct from old.plan_code
       or new.subscription_status is distinct from old.subscription_status
       or new.account_status is distinct from old.account_status
       or new.trial_start is distinct from old.trial_start
       or new.trial_end is distinct from old.trial_end
       or new.expiry_date is distinct from old.expiry_date
       or new.paid is distinct from old.paid
       or new.renewal_reminder is distinct from old.renewal_reminder
       or new.payment_proof_link is distinct from old.payment_proof_link
       or new.payment_notes is distinct from old.payment_notes
       or new.developer_notes is distinct from old.developer_notes
       or new.seat_limit is distinct from old.seat_limit
       or new.seat_count is distinct from old.seat_count
       or new.max_maps is distinct from old.max_maps
       or new.max_properties is distinct from old.max_properties
       or new.max_team_members is distinct from old.max_team_members
     ) then
    raise exception 'account, storage, and plan columns are provider-only';
  end if;

  return new;
end;
$$;

-- ---------- 2. access gateway activation requests ----------
-- 8-digit activation/access codes create pending requests only. They do NOT
-- create Supabase Auth sessions, approve dealers, or unlock admin routes.
-- Fully automated approval needs an Edge Function/server layer to create or
-- update the real Auth user with a service-role key kept off the frontend.
create table if not exists public.dealer_access_codes (
  id uuid primary key default gen_random_uuid(),
  label text,
  code_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'expired')),
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.dealer_activation_requests (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid references public.dealer_access_codes(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  dealer_id text references public.dealer_settings(dealer_id) on delete set null,
  requested_business_name text,
  requested_owner_name text,
  requested_owner_phone text,
  requested_primary_area text,
  device_label text,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  developer_notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists dealer_activation_requests_status_idx
  on public.dealer_activation_requests (status, created_at desc);

create index if not exists dealer_activation_requests_dealer_idx
  on public.dealer_activation_requests (dealer_id, created_at desc);

alter table public.dealer_access_codes enable row level security;
alter table public.dealer_activation_requests enable row level security;
revoke all on public.dealer_access_codes from anon, authenticated;
revoke all on public.dealer_activation_requests from anon, authenticated;

create or replace function public.plotmap_submit_activation_request(
  p_access_code text,
  p_business_name text default null,
  p_owner_name text default null,
  p_owner_phone text default null,
  p_primary_area text default null,
  p_device_label text default null
)
returns table (request_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.dealer_access_codes%rowtype;
  v_request_id uuid;
begin
  perform pg_sleep(0.25);

  if p_access_code is null or trim(p_access_code) !~ '^\d{8}$' then
    return;
  end if;

  select *
    into v_code
    from public.dealer_access_codes c
    where c.status = 'active'
      and (c.expires_at is null or c.expires_at > timezone('utc'::text, now()))
      and c.use_count < c.max_uses
      and c.code_hash = crypt(trim(p_access_code), c.code_hash)
    order by c.created_at asc
    limit 1;

  if not found then
    return;
  end if;

  insert into public.dealer_activation_requests (
    access_code_id,
    requested_business_name,
    requested_owner_name,
    requested_owner_phone,
    requested_primary_area,
    device_label
  )
  values (
    v_code.id,
    nullif(left(trim(coalesce(p_business_name, '')), 160), ''),
    nullif(left(trim(coalesce(p_owner_name, '')), 120), ''),
    nullif(left(trim(coalesce(p_owner_phone, '')), 40), ''),
    nullif(left(trim(coalesce(p_primary_area, '')), 120), ''),
    nullif(left(trim(coalesce(p_device_label, '')), 160), '')
  )
  returning id into v_request_id;

  update public.dealer_access_codes
     set use_count = use_count + 1,
         updated_at = timezone('utc'::text, now())
   where id = v_code.id;

  return query select v_request_id, 'pending'::text;
end;
$$;

revoke all on function public.plotmap_submit_activation_request(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_submit_activation_request(text, text, text, text, text, text)
  to anon, authenticated;

create or replace function public.plotmap_activation_request_status(p_request_id uuid)
returns table (status text)
language sql
stable
security definer
set search_path = public
as $$
  select r.status
  from public.dealer_activation_requests r
  where r.id = p_request_id;
$$;

revoke all on function public.plotmap_activation_request_status(uuid)
  from public, anon, authenticated;
grant execute on function public.plotmap_activation_request_status(uuid)
  to anon, authenticated;

create or replace function public.plotmap_admin_create_activation_code(
  p_access_code text,
  p_label text default null,
  p_max_uses integer default 1,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_access_code is null or trim(p_access_code) !~ '^\d{8}$' then
    raise exception 'activation code must be exactly 8 digits';
  end if;
  if coalesce(p_max_uses, 1) < 1 or coalesce(p_max_uses, 1) > 100 then
    raise exception 'max uses must be between 1 and 100';
  end if;
  if exists (
    select 1
    from public.dealer_access_codes c
    where c.status = 'active'
      and (c.expires_at is null or c.expires_at > timezone('utc'::text, now()))
      and c.code_hash = crypt(trim(p_access_code), c.code_hash)
  ) then
    raise exception 'activation code already active';
  end if;

  insert into public.dealer_access_codes (
    label,
    code_hash,
    max_uses,
    expires_at,
    created_by
  )
  values (
    nullif(left(trim(coalesce(p_label, '')), 160), ''),
    crypt(trim(p_access_code), gen_salt('bf', 10)),
    coalesce(p_max_uses, 1),
    p_expires_at,
    auth.uid()
  )
  returning id into v_id;

  insert into public.audit_logs (dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata)
  values ('platform', auth.uid(), public.plotmap_current_role(), 'dealer_activation_code_created',
          'dealer_access_codes', v_id::text, jsonb_build_object('label', p_label, 'maxUses', p_max_uses));

  return v_id;
end;
$$;

revoke all on function public.plotmap_admin_create_activation_code(text, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_create_activation_code(text, text, integer, timestamptz)
  to authenticated;

create or replace function public.plotmap_admin_list_activation_requests()
returns table (
  id uuid,
  status text,
  dealer_id text,
  requested_business_name text,
  requested_owner_name text,
  requested_owner_phone text,
  requested_primary_area text,
  device_label text,
  developer_notes text,
  created_at timestamptz,
  updated_at timestamptz
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
    r.id,
    r.status,
    r.dealer_id,
    r.requested_business_name,
    r.requested_owner_name,
    r.requested_owner_phone,
    r.requested_primary_area,
    r.device_label,
    r.developer_notes,
    r.created_at,
    r.updated_at
  from public.dealer_activation_requests r
  order by r.created_at desc;
end;
$$;

revoke all on function public.plotmap_admin_list_activation_requests()
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_list_activation_requests()
  to authenticated;

create or replace function public.plotmap_admin_approve_activation_request(
  p_request_id uuid,
  p_dealer_id text,
  p_business_name text default null,
  p_owner_name text default null,
  p_owner_phone text default null,
  p_primary_area text default null,
  p_developer_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.dealer_activation_requests%rowtype;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_request_id is null then
    raise exception 'request id required';
  end if;
  if p_dealer_id is null or trim(p_dealer_id) = '' then
    raise exception 'dealer id required';
  end if;

  select *
    into v_request
    from public.dealer_activation_requests
    where id = p_request_id
      and status = 'pending'
    for update;

  if not found then
    raise exception 'pending activation request not found';
  end if;

  if exists (
    select 1
    from public.dealer_settings d
    where d.dealer_id = p_dealer_id
      and not public.plotmap_dealer_is_active(d.dealer_id)
  ) then
    raise exception 'dealer is suspended or expired; reactivate through account controls first';
  end if;

  insert into public.dealer_settings (
    dealer_id,
    brand_name,
    owner_name,
    owner_phone,
    primary_area,
    developer_notes,
    account_status,
    subscription_status,
    updated_at
  )
  values (
    p_dealer_id,
    coalesce(nullif(p_business_name, ''), v_request.requested_business_name),
    coalesce(nullif(p_owner_name, ''), v_request.requested_owner_name),
    coalesce(nullif(p_owner_phone, ''), v_request.requested_owner_phone),
    coalesce(nullif(p_primary_area, ''), v_request.requested_primary_area),
    p_developer_notes,
    'active',
    'trial',
    timezone('utc'::text, now())
  )
  on conflict (dealer_id) do update set
    brand_name = coalesce(excluded.brand_name, public.dealer_settings.brand_name),
    owner_name = coalesce(excluded.owner_name, public.dealer_settings.owner_name),
    owner_phone = coalesce(excluded.owner_phone, public.dealer_settings.owner_phone),
    primary_area = coalesce(excluded.primary_area, public.dealer_settings.primary_area),
    developer_notes = coalesce(excluded.developer_notes, public.dealer_settings.developer_notes),
    updated_at = timezone('utc'::text, now());

  update public.dealer_activation_requests
     set status = 'approved',
         dealer_id = p_dealer_id,
         approved_by = auth.uid(),
         approved_at = timezone('utc'::text, now()),
         developer_notes = coalesce(p_developer_notes, developer_notes),
         updated_at = timezone('utc'::text, now())
   where id = p_request_id;

  insert into public.audit_logs (dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata)
  values (p_dealer_id, auth.uid(), public.plotmap_current_role(), 'dealer_activation_approved',
          'dealer_activation_requests', p_request_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.plotmap_admin_approve_activation_request(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_approve_activation_request(uuid, text, text, text, text, text, text)
  to authenticated;

create or replace function public.plotmap_admin_reject_activation_request(
  p_request_id uuid,
  p_developer_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  update public.dealer_activation_requests
     set status = 'rejected',
         rejected_by = auth.uid(),
         rejected_at = timezone('utc'::text, now()),
         developer_notes = coalesce(p_developer_notes, developer_notes),
         updated_at = timezone('utc'::text, now())
   where id = p_request_id
     and status = 'pending';

  if not found then
    raise exception 'pending activation request not found';
  end if;
end;
$$;

revoke all on function public.plotmap_admin_reject_activation_request(uuid, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_reject_activation_request(uuid, text)
  to authenticated;

-- ---------- 2. dealer passcodes (deny-all table, RPC access only) ----------
create table if not exists public.dealer_passcodes (
  dealer_id text primary key references public.dealer_settings(dealer_id) on delete cascade,
  login_email text not null,
  passcode_hash text not null,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists dealer_passcodes_login_email_unique_idx
  on public.dealer_passcodes (lower(login_email));

alter table public.dealer_passcodes enable row level security;
-- Intentionally NO policies and NO grants: deny-all. Only the SECURITY
-- DEFINER functions below may touch this table.
revoke all on public.dealer_passcodes from anon, authenticated;

-- ---------- 3. passcode -> dealer resolution (public, pre-auth) ----------
-- Called by the landing page BEFORE any session exists. Returns at most
-- one row:
--   status = 'ok'      -> dealer_id + login_email; frontend completes a
--                         normal Supabase password sign-in with
--                         (login_email, the same passcode).
--   status = 'blocked' -> dealer matched but is suspended/expired; the
--                         frontend shows a clean blocked message. The
--                         login_email is withheld.
-- Wrong/unknown passcode -> zero rows (no oracle for which dealers exist).
create or replace function public.plotmap_passcode_login(p_passcode text)
returns table (dealer_id text, login_email text, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- constant work-factor damping for online brute force
  perform pg_sleep(0.25);

  if p_passcode is null or length(trim(p_passcode)) < 8 then
    return;
  end if;

  return query
  select
    pc.dealer_id,
    case when public.plotmap_dealer_is_active(pc.dealer_id) then lower(p.email) else null end,
    case when public.plotmap_dealer_is_active(pc.dealer_id) then 'ok' else 'blocked' end
  from public.dealer_passcodes pc
  join public.profiles p
    on lower(p.email) = lower(pc.login_email)
   and p.dealer_id = pc.dealer_id
   and p.role = 'owner'
   and p.status = 'active'
  where pc.passcode_hash = crypt(trim(p_passcode), pc.passcode_hash)
  limit 1;
end;
$$;

revoke all on function public.plotmap_passcode_login(text) from public, anon, authenticated;
grant execute on function public.plotmap_passcode_login(text) to anon, authenticated;

-- ---------- 4. provider-only passcode management ----------
create or replace function public.plotmap_admin_set_dealer_passcode(
  p_dealer_id text,
  p_login_email text,
  p_passcode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_dealer_id is null or trim(p_dealer_id) = '' then
    raise exception 'dealer id required';
  end if;
  if p_passcode is null or length(trim(p_passcode)) < 8 then
    raise exception 'passcode must be at least 8 characters';
  end if;
  if p_login_email is null or position('@' in p_login_email) = 0 then
    raise exception 'valid login email required';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where lower(p.email) = lower(trim(p_login_email))
      and p.dealer_id = p_dealer_id
      and p.role = 'owner'
      and p.status = 'active'
  ) then
    raise exception 'login email must belong to an active owner profile for this dealer';
  end if;
  -- passcodes must be unique across dealers, or login could resolve the
  -- wrong dealer
  if exists (
    select 1 from public.dealer_passcodes pc
    where pc.dealer_id <> p_dealer_id
      and pc.passcode_hash = crypt(trim(p_passcode), pc.passcode_hash)
  ) then
    raise exception 'passcode already in use by another dealer — choose a different one';
  end if;

  insert into public.dealer_passcodes (dealer_id, login_email, passcode_hash, updated_by, updated_at)
  values (
    p_dealer_id,
    lower(trim(p_login_email)),
    crypt(trim(p_passcode), gen_salt('bf', 10)),
    auth.uid(),
    timezone('utc'::text, now())
  )
  on conflict (dealer_id) do update set
    login_email = excluded.login_email,
    passcode_hash = excluded.passcode_hash,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  -- audit WITHOUT the passcode
  insert into public.audit_logs (dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata)
  values (p_dealer_id, auth.uid(), public.plotmap_current_role(), 'dealer_passcode_set',
          'dealer_passcodes', p_dealer_id, jsonb_build_object('loginEmail', lower(trim(p_login_email))));
end;
$$;

revoke all on function public.plotmap_admin_set_dealer_passcode(text, text, text) from public, anon, authenticated;
grant execute on function public.plotmap_admin_set_dealer_passcode(text, text, text) to authenticated;

-- ---------- 5. provider-only dealer directory ----------
create or replace function public.plotmap_admin_upsert_dealer_directory(
  p_dealer_id text,
  p_business_name text default null,
  p_owner_name text default null,
  p_owner_phone text default null,
  p_primary_area text default null,
  p_developer_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_dealer_id is null or trim(p_dealer_id) = '' then
    raise exception 'dealer id required';
  end if;

  insert into public.dealer_settings (dealer_id, brand_name, owner_name, owner_phone, primary_area, developer_notes, updated_at)
  values (p_dealer_id, p_business_name, p_owner_name, p_owner_phone, p_primary_area, p_developer_notes, timezone('utc'::text, now()))
  on conflict (dealer_id) do update set
    brand_name = coalesce(excluded.brand_name, public.dealer_settings.brand_name),
    owner_name = coalesce(excluded.owner_name, public.dealer_settings.owner_name),
    owner_phone = coalesce(excluded.owner_phone, public.dealer_settings.owner_phone),
    primary_area = coalesce(excluded.primary_area, public.dealer_settings.primary_area),
    developer_notes = coalesce(excluded.developer_notes, public.dealer_settings.developer_notes),
    updated_at = timezone('utc'::text, now());

  insert into public.audit_logs (dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata)
  values (p_dealer_id, auth.uid(), public.plotmap_current_role(), 'dealer_directory_updated',
          'dealer_settings', p_dealer_id, '{}'::jsonb);
end;
$$;

revoke all on function public.plotmap_admin_upsert_dealer_directory(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.plotmap_admin_upsert_dealer_directory(text, text, text, text, text, text) to authenticated;

-- Trial details: phase-4 plotmap_admin_set_dealer_account covers status /
-- trial_end / expiry, but cannot set trial_start or notes — this fills
-- that gap without touching the phase-4 function.
create or replace function public.plotmap_admin_set_dealer_trial(
  p_dealer_id text,
  p_trial_start timestamptz default null,
  p_trial_end timestamptz default null,
  p_developer_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_dealer_id is null or trim(p_dealer_id) = '' then
    raise exception 'dealer id required';
  end if;

  update public.dealer_settings set
    trial_start = coalesce(p_trial_start, trial_start),
    trial_end = coalesce(p_trial_end, trial_end),
    developer_notes = coalesce(p_developer_notes, developer_notes),
    updated_at = timezone('utc'::text, now())
  where dealer_id = p_dealer_id;

  if not found then
    raise exception 'unknown dealer';
  end if;

  insert into public.audit_logs (dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata)
  values (p_dealer_id, auth.uid(), public.plotmap_current_role(), 'dealer_trial_updated',
          'dealer_settings', p_dealer_id,
          jsonb_build_object('trialStart', p_trial_start, 'trialEnd', p_trial_end));
end;
$$;

revoke all on function public.plotmap_admin_set_dealer_trial(text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.plotmap_admin_set_dealer_trial(text, timestamptz, timestamptz, text) to authenticated;

-- Directory listing: phase-4 plotmap_admin_list_dealer_accounts stays
-- untouched; this richer variant adds the new fields + passcode state.
create or replace function public.plotmap_admin_dealer_directory()
returns table (
  dealer_id text,
  brand_name text,
  owner_name text,
  owner_phone text,
  primary_area text,
  developer_notes text,
  payment_notes text,
  account_status text,
  subscription_status text,
  trial_start timestamptz,
  trial_end timestamptz,
  expiry_date timestamptz,
  plan_code text,
  paid boolean,
  storage_enabled boolean,
  has_passcode boolean,
  login_email text,
  is_active boolean,
  updated_at timestamptz
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
    d.dealer_id,
    d.brand_name,
    d.owner_name,
    d.owner_phone,
    d.primary_area,
    d.developer_notes,
    d.payment_notes,
    d.account_status,
    d.subscription_status,
    d.trial_start,
    d.trial_end,
    d.expiry_date,
    d.plan_code,
    d.paid,
    d.storage_enabled,
    (pc.dealer_id is not null) as has_passcode,
    pc.login_email,
    public.plotmap_dealer_is_active(d.dealer_id) as is_active,
    d.updated_at
  from public.dealer_settings d
  left join public.dealer_passcodes pc on pc.dealer_id = d.dealer_id
  order by d.updated_at desc nulls last, d.dealer_id asc;
end;
$$;

revoke all on function public.plotmap_admin_dealer_directory() from public, anon, authenticated;
grant execute on function public.plotmap_admin_dealer_directory() to authenticated;

-- ---------- 6. provider-only trial usage aggregates ----------
create or replace function public.plotmap_admin_dealer_usage()
returns table (
  dealer_id text,
  total_events bigint,
  events_today bigint,
  events_7d bigint,
  sessions bigint,
  active_days bigint,
  last_active timestamptz,
  presentation_opens bigint,
  property_opens bigint,
  map_opens bigint,
  whatsapp_shares bigint,
  studio_opens bigint,
  dashboard_opens bigint,
  properties_page_opens bigint,
  logins bigint,
  top_event_type text
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
    e.dealer_id,
    count(*) as total_events,
    count(*) filter (where e.created_at >= date_trunc('day', timezone('utc'::text, now()))) as events_today,
    count(*) filter (where e.created_at >= timezone('utc'::text, now()) - interval '7 days') as events_7d,
    count(distinct e.session_id) filter (where coalesce(e.session_id, '') <> '') as sessions,
    count(distinct date_trunc('day', e.created_at)) as active_days,
    max(e.created_at) as last_active,
    count(*) filter (where e.event_type = 'presentation_opened') as presentation_opens,
    count(*) filter (where e.event_type in ('property_viewed', 'property_selected')) as property_opens,
    count(*) filter (where e.event_type in ('map_opened', 'sector_viewed', 'area_viewed')) as map_opens,
    count(*) filter (where e.event_type = 'property_shared_whatsapp'
                        or (e.event_type = 'brochure_shared' and e.metadata->>'source' = 'whatsapp')) as whatsapp_shares,
    count(*) filter (where e.event_type = 'map_studio_opened') as studio_opens,
    count(*) filter (where e.event_type in ('dealer_dashboard_opened', 'team_workspace_opened')) as dashboard_opens,
    count(*) filter (where e.event_type = 'properties_page_opened') as properties_page_opens,
    count(*) filter (where e.event_type = 'dealer_login') as logins,
    (
      select e2.event_type
      from public.presentation_events e2
      where e2.dealer_id = e.dealer_id
      group by e2.event_type
      order by count(*) desc, e2.event_type asc
      limit 1
    ) as top_event_type
  from public.presentation_events e
  group by e.dealer_id;
end;
$$;

revoke all on function public.plotmap_admin_dealer_usage() from public, anon, authenticated;
grant execute on function public.plotmap_admin_dealer_usage() to authenticated;

-- Per-dealer event-type breakdown for the trial summary drawer.
create or replace function public.plotmap_admin_dealer_event_breakdown(
  p_dealer_id text,
  p_days integer default 30
)
returns table (event_type text, events bigint, last_seen timestamptz)
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
  select e.event_type, count(*) as events, max(e.created_at) as last_seen
  from public.presentation_events e
  where e.dealer_id = p_dealer_id
    and e.created_at >= timezone('utc'::text, now()) - make_interval(days => greatest(1, coalesce(p_days, 30)))
  group by e.event_type
  order by events desc, e.event_type asc;
end;
$$;

revoke all on function public.plotmap_admin_dealer_event_breakdown(text, integer) from public, anon, authenticated;
grant execute on function public.plotmap_admin_dealer_event_breakdown(text, integer) to authenticated;

-- ============================================================
-- ONBOARDING NOTES (manual steps — read before first use)
--
-- A. Register yourself as platform admin (one-time, SQL editor):
--      insert into public.platform_admins (profile_id, status, notes)
--      select id, 'active', 'PlotMap developer'
--      from public.profiles
--      where email = 'YOUR-ADMIN-EMAIL'
--      on conflict (profile_id) do update set status = 'active';
--    (Your profile row must exist and have role 'owner'.)
--
-- B. Creating a dealer (until an edge function automates it):
--    1. Optional access gateway: developer creates an 8-digit activation
--       code with plotmap_admin_create_activation_code. The dealer submits
--       it through plotmap_submit_activation_request, which creates only a
--       pending request. It does NOT approve access or create a session.
--    2. Developer approves the pending request with
--       plotmap_admin_approve_activation_request. Approval creates/updates
--       dealer_settings only; it does NOT create a Supabase Auth user.
--    3. Supabase Dashboard -> Authentication -> Add user:
--       email = <dealer login email>, password = <the passcode>,
--       auto-confirm ON.
--    4. SQL editor: insert the profile row for that auth user:
--         insert into public.profiles (id, email, role, dealer_id, status)
--         values ('<auth user uuid>', '<login email>', 'owner', '<dealer-id>', 'active');
--    5. Store the passcode hash via plotmap_admin_set_dealer_passcode.
--    The dealer then signs in with ONLY the passcode on the landing page.
--
--    Production automation: replace steps 3-5 with an Edge Function that
--    runs with the service role server-side, creates/updates the Auth user,
--    writes the profile, stores the passcode hash, and returns no secrets.
--
-- C. Passcode reset: developer sets a new passcode in the panel
--    (updates the hash), then updates the auth user's password to the
--    same value in Dashboard -> Authentication (or via a server-side
--    admin API call). A pure-SQL auth.users password update is possible
--    but touches GoTrue internals — intentionally NOT included here;
--    flag for review if you want it automated:
--      -- update auth.users set encrypted_password = crypt('<new>', gen_salt('bf'))
--      -- where email = '<login email>';   -- REVIEW REQUIRED, not applied
--
-- D. Rollback: this migration only adds columns/table/functions. To
--    disable passcode login: drop function public.plotmap_passcode_login(text);
-- ============================================================
