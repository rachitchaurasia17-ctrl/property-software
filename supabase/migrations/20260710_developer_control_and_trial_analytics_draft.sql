-- ============================================================
-- PlotMap - Developer Control Panel + Passcode Login + Trial Analytics
-- DRAFT — REVIEW BEFORE APPLYING (Codex/security review requested).
-- Apply manually in the Supabase SQL editor AFTER review.
--
-- Why this migration is required (cannot be done frontend-only):
--   1. Device-gated passcode login: a static frontend shipping only the publishable
--      anon key can never verify a secret safely — any check in JS is
--      readable by the client. Verification must happen server-side in
--      a SECURITY DEFINER function against a bcrypt hash, and the only
--      way a passcode can yield a REAL authorized session (RLS-scoped
--      writes) is to map it to a dedicated Supabase Auth user per
--      dealer. This file stores hashes + resolves passcode -> dealer;
--      the auth user itself is created once by the provider (see the
--      onboarding notes at the bottom).
--      The dealer device is separately approved through dealer_devices;
--      Client Presentation and dealer routes must provide the locally
--      stored device token to RPCs, while the database stores only hashes.
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
  add column if not exists developer_notes text,
  add column if not exists max_devices_allowed integer not null default 1
    check (max_devices_allowed between 1 and 20);

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
       or new.max_devices_allowed is distinct from old.max_devices_allowed
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
  lookup_token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  dealer_id text references public.dealer_settings(dealer_id) on delete set null,
  requested_business_name text,
  requested_owner_name text,
  requested_owner_phone text,
  requested_primary_area text,
  device_label text,
  device_token_hash text,
  browser_info text,
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

-- Approved dealer devices. The frontend stores the opaque device token
-- locally; Postgres stores only crypt() hashes and never returns them.
create table if not exists public.dealer_devices (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null references public.dealer_settings(dealer_id) on delete cascade,
  device_token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  device_label text,
  browser_info text,
  first_seen timestamptz not null default timezone('utc'::text, now()),
  last_seen timestamptz not null default timezone('utc'::text, now()),
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  developer_notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists dealer_devices_dealer_status_idx
  on public.dealer_devices (dealer_id, status, updated_at desc);

alter table public.dealer_access_codes enable row level security;
alter table public.dealer_activation_requests enable row level security;
alter table public.dealer_devices enable row level security;
revoke all on public.dealer_access_codes from public, anon, authenticated;
revoke all on public.dealer_activation_requests from public, anon, authenticated;
revoke all on public.dealer_devices from public, anon, authenticated;

create or replace function public.plotmap_submit_activation_request(
  p_access_code text,
  p_device_token text,
  p_business_name text default null,
  p_owner_name text default null,
  p_owner_phone text default null,
  p_primary_area text default null,
  p_device_label text default null,
  p_browser_info text default null
)
returns table (request_id uuid, lookup_token text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.dealer_access_codes%rowtype;
  v_request_id uuid;
  v_lookup_token text := encode(gen_random_bytes(24), 'hex');
begin
  perform pg_sleep(0.25);

  if p_access_code is null or trim(p_access_code) !~ '^\d{8}$' then
    return;
  end if;
  if p_device_token is null or length(trim(p_device_token)) < 32 then
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
    limit 1
    for update;

  if not found then
    return;
  end if;

  insert into public.dealer_activation_requests (
    access_code_id,
    lookup_token_hash,
    requested_business_name,
    requested_owner_name,
    requested_owner_phone,
    requested_primary_area,
    device_label,
    device_token_hash,
    browser_info
  )
  values (
    v_code.id,
    crypt(v_lookup_token, gen_salt('bf', 10)),
    nullif(left(trim(coalesce(p_business_name, '')), 160), ''),
    nullif(left(trim(coalesce(p_owner_name, '')), 120), ''),
    nullif(left(trim(coalesce(p_owner_phone, '')), 40), ''),
    nullif(left(trim(coalesce(p_primary_area, '')), 120), ''),
    nullif(left(trim(coalesce(p_device_label, '')), 160), ''),
    crypt(trim(p_device_token), gen_salt('bf', 10)),
    nullif(left(trim(coalesce(p_browser_info, '')), 240), '')
  )
  returning id into v_request_id;

  update public.dealer_access_codes
     set use_count = use_count + 1,
         updated_at = timezone('utc'::text, now())
   where id = v_code.id;

  return query select v_request_id, v_lookup_token, 'pending'::text;
end;
$$;

revoke all on function public.plotmap_submit_activation_request(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_submit_activation_request(text, text, text, text, text, text, text, text)
  to anon, authenticated;

create or replace function public.plotmap_activation_request_status(
  p_request_id uuid,
  p_lookup_token text
)
returns table (status text, dealer_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_sleep(0.15);
  if p_request_id is null or p_lookup_token is null or length(trim(p_lookup_token)) < 32 then
    return;
  end if;

  return query
  select r.status, case when r.status = 'approved' then r.dealer_id else null end
  from public.dealer_activation_requests r
  where r.id = p_request_id
    and r.lookup_token_hash = crypt(trim(p_lookup_token), r.lookup_token_hash);
end;
$$;

revoke all on function public.plotmap_activation_request_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_activation_request_status(uuid, text)
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
  browser_info text,
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
    r.browser_info,
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
  v_max_devices integer;
  v_approved_devices integer;
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
  if v_request.device_token_hash is null then
    raise exception 'activation request has no device token';
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

  select coalesce(max_devices_allowed, 1)
    into v_max_devices
    from public.dealer_settings
    where dealer_id = p_dealer_id
    for update;

  select count(*)
    into v_approved_devices
    from public.dealer_devices
    where dealer_id = p_dealer_id
      and status = 'approved';

  if v_approved_devices >= v_max_devices then
    raise exception 'dealer has reached approved device limit';
  end if;

  insert into public.dealer_devices (
    dealer_id,
    device_token_hash,
    status,
    device_label,
    browser_info,
    approved_by,
    approved_at,
    developer_notes,
    updated_at
  )
  values (
    p_dealer_id,
    v_request.device_token_hash,
    'approved',
    v_request.device_label,
    v_request.browser_info,
    auth.uid(),
    timezone('utc'::text, now()),
    p_developer_notes,
    timezone('utc'::text, now())
  );

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

-- ---------- 3. approved-device gate ----------
create or replace function public.plotmap_device_status(
  p_dealer_id text,
  p_device_token text,
  p_device_label text default null,
  p_browser_info text default null
)
returns table (status text, dealer_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.dealer_devices%rowtype;
begin
  perform pg_sleep(0.12);
  if p_dealer_id is null or trim(p_dealer_id) = '' then
    return query select 'unknown'::text, null::text;
    return;
  end if;
  if p_device_token is null or length(trim(p_device_token)) < 32 then
    return query select 'unknown'::text, null::text;
    return;
  end if;
  if not public.plotmap_dealer_is_active(p_dealer_id) then
    return query select 'blocked'::text, p_dealer_id;
    return;
  end if;

  select *
    into v_device
    from public.dealer_devices d
    where d.dealer_id = p_dealer_id
      and d.device_token_hash = crypt(trim(p_device_token), d.device_token_hash)
    order by d.created_at desc
    limit 1;

  if not found then
    insert into public.dealer_devices (
      dealer_id,
      device_token_hash,
      status,
      device_label,
      browser_info
    )
    values (
      p_dealer_id,
      crypt(trim(p_device_token), gen_salt('bf', 10)),
      'pending',
      nullif(left(trim(coalesce(p_device_label, '')), 160), ''),
      nullif(left(trim(coalesce(p_browser_info, '')), 240), '')
    )
    returning * into v_device;
  else
    update public.dealer_devices
       set last_seen = timezone('utc'::text, now()),
           device_label = coalesce(nullif(left(trim(coalesce(p_device_label, '')), 160), ''), device_label),
           browser_info = coalesce(nullif(left(trim(coalesce(p_browser_info, '')), 240), ''), browser_info),
           updated_at = timezone('utc'::text, now())
     where id = v_device.id
     returning * into v_device;
  end if;

  return query select v_device.status, v_device.dealer_id;
end;
$$;

revoke all on function public.plotmap_device_status(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_device_status(text, text, text, text)
  to anon, authenticated;

create or replace function public.plotmap_device_is_approved(
  p_dealer_id text,
  p_device_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_dealer_id is null or trim(p_dealer_id) = '' then
    return false;
  end if;
  if p_device_token is null or length(trim(p_device_token)) < 32 then
    return false;
  end if;
  if not public.plotmap_dealer_is_active(p_dealer_id) then
    return false;
  end if;

  select d.id
    into v_id
    from public.dealer_devices d
    where d.dealer_id = p_dealer_id
      and d.status = 'approved'
      and d.device_token_hash = crypt(trim(p_device_token), d.device_token_hash)
    order by d.approved_at desc nulls last, d.created_at desc
    limit 1;

  if not found then
    return false;
  end if;

  update public.dealer_devices
     set last_seen = timezone('utc'::text, now()),
         updated_at = timezone('utc'::text, now())
   where id = v_id;

  return true;
end;
$$;

revoke all on function public.plotmap_device_is_approved(text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_device_is_approved(text, text)
  to anon, authenticated;

create or replace function public.plotmap_client_properties_for_device(
  p_dealer_id text,
  p_device_token text
)
returns setof public.client_safe_properties
language sql
security definer
set search_path = public
as $$
  with allowed as (
    select public.plotmap_device_is_approved(p_dealer_id, p_device_token) as ok
  )
  select c.*
  from public.client_safe_properties c
  cross join allowed
  where c.dealer_id = p_dealer_id
    and allowed.ok;
$$;

create or replace function public.plotmap_client_maps_for_device(
  p_dealer_id text,
  p_device_token text
)
returns setof public.prebuilt_maps
language sql
security definer
set search_path = public
as $$
  with allowed as (
    select public.plotmap_device_is_approved(p_dealer_id, p_device_token) as ok
  )
  select m.*
  from public.prebuilt_maps m
  cross join allowed
  where m.dealer_id = p_dealer_id
    and m.status = 'published'
    and m.client_visible = true
    and allowed.ok
  order by m.created_at asc;
$$;

create or replace function public.plotmap_client_overlays_for_device(
  p_dealer_id text,
  p_device_token text
)
returns setof public.map_overlays
language sql
security definer
set search_path = public
as $$
  with allowed as (
    select public.plotmap_device_is_approved(p_dealer_id, p_device_token) as ok
  )
  select o.*
  from public.map_overlays o
  cross join allowed
  where o.dealer_id = p_dealer_id
    and o.status = 'published'
    and o.client_visible = true
    and o.deleted = false
    and allowed.ok
  order by o.updated_at asc;
$$;

revoke all on function public.plotmap_client_properties_for_device(text, text) from public, anon, authenticated;
revoke all on function public.plotmap_client_maps_for_device(text, text) from public, anon, authenticated;
revoke all on function public.plotmap_client_overlays_for_device(text, text) from public, anon, authenticated;
grant execute on function public.plotmap_client_properties_for_device(text, text) to anon, authenticated;
grant execute on function public.plotmap_client_maps_for_device(text, text) to anon, authenticated;
grant execute on function public.plotmap_client_overlays_for_device(text, text) to anon, authenticated;

-- Hold the older Phase-2 public presentation RPCs closed once this
-- migration is applied. The updated frontend calls the *_for_device
-- functions above. This is what makes device approval backend-enforced.
revoke execute on function public.plotmap_client_properties(text) from public, anon, authenticated;
revoke execute on function public.plotmap_client_maps(text) from public, anon, authenticated;
revoke execute on function public.plotmap_client_overlays(text) from public, anon, authenticated;

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
  v_metadata jsonb := jsonb_set(coalesce(p_metadata, '{}'::jsonb), '{source}', '"client_presentation"', true);
begin
  if not public.plotmap_device_is_approved(p_dealer_id, p_device_token) then
    raise exception 'approved dealer device required';
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

revoke all on function public.plotmap_record_device_presentation_event(
  text, text, text, text, text, text, text, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.plotmap_record_device_presentation_event(
  text, text, text, text, text, text, text, text, text, jsonb, text, timestamptz
) to anon, authenticated;
revoke execute on function public.plotmap_record_presentation_event(
  text, text, text, text, text, text, text, text, jsonb, text, timestamptz
) from anon;

create or replace function public.plotmap_admin_list_dealer_devices()
returns table (
  id uuid,
  dealer_id text,
  dealer_name text,
  status text,
  device_label text,
  browser_info text,
  first_seen timestamptz,
  last_seen timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  max_devices_allowed integer,
  approved_device_count bigint,
  developer_notes text
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
    d.id,
    d.dealer_id,
    s.brand_name,
    d.status,
    d.device_label,
    d.browser_info,
    d.first_seen,
    d.last_seen,
    d.approved_at,
    d.approved_by,
    coalesce(s.max_devices_allowed, 1),
    (
      select count(*)
      from public.dealer_devices x
      where x.dealer_id = d.dealer_id
        and x.status = 'approved'
    ) as approved_device_count,
    d.developer_notes
  from public.dealer_devices d
  join public.dealer_settings s on s.dealer_id = d.dealer_id
  order by
    case d.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    d.updated_at desc;
end;
$$;

revoke all on function public.plotmap_admin_list_dealer_devices() from public, anon, authenticated;
grant execute on function public.plotmap_admin_list_dealer_devices() to authenticated;

create or replace function public.plotmap_admin_set_dealer_device_limit(
  p_dealer_id text,
  p_max_devices_allowed integer
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
  if p_max_devices_allowed is null or p_max_devices_allowed < 1 or p_max_devices_allowed > 20 then
    raise exception 'device limit must be between 1 and 20';
  end if;

  update public.dealer_settings
     set max_devices_allowed = p_max_devices_allowed,
         updated_at = timezone('utc'::text, now())
   where dealer_id = p_dealer_id;

  if not found then
    raise exception 'unknown dealer';
  end if;

  insert into public.audit_logs (dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata)
  values (p_dealer_id, auth.uid(), public.plotmap_current_role(), 'dealer_device_limit_updated',
          'dealer_settings', p_dealer_id, jsonb_build_object('maxDevicesAllowed', p_max_devices_allowed));
end;
$$;

revoke all on function public.plotmap_admin_set_dealer_device_limit(text, integer) from public, anon, authenticated;
grant execute on function public.plotmap_admin_set_dealer_device_limit(text, integer) to authenticated;

create or replace function public.plotmap_admin_set_device_status(
  p_device_id uuid,
  p_status text,
  p_developer_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.dealer_devices%rowtype;
  v_max_devices integer;
  v_approved_devices integer;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if p_device_id is null then
    raise exception 'device id required';
  end if;
  if p_status not in ('approved', 'rejected', 'revoked') then
    raise exception 'unsupported device status';
  end if;

  select *
    into v_device
    from public.dealer_devices
    where id = p_device_id
    for update;

  if not found then
    raise exception 'device not found';
  end if;
  if not public.plotmap_dealer_is_active(v_device.dealer_id) then
    raise exception 'dealer is suspended or expired';
  end if;

  if p_status = 'approved' then
    select coalesce(max_devices_allowed, 1)
      into v_max_devices
      from public.dealer_settings
      where dealer_id = v_device.dealer_id
      for update;
    select count(*)
      into v_approved_devices
      from public.dealer_devices
      where dealer_id = v_device.dealer_id
        and status = 'approved'
        and id <> p_device_id;
    if v_approved_devices >= v_max_devices then
      raise exception 'dealer has reached approved device limit';
    end if;
  end if;

  update public.dealer_devices
     set status = p_status,
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
         approved_at = case when p_status = 'approved' then timezone('utc'::text, now()) else approved_at end,
         rejected_by = case when p_status = 'rejected' then auth.uid() else rejected_by end,
         rejected_at = case when p_status = 'rejected' then timezone('utc'::text, now()) else rejected_at end,
         revoked_by = case when p_status = 'revoked' then auth.uid() else revoked_by end,
         revoked_at = case when p_status = 'revoked' then timezone('utc'::text, now()) else revoked_at end,
         developer_notes = coalesce(p_developer_notes, developer_notes),
         updated_at = timezone('utc'::text, now())
   where id = p_device_id;

  insert into public.audit_logs (dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata)
  values (v_device.dealer_id, auth.uid(), public.plotmap_current_role(), 'dealer_device_' || p_status,
          'dealer_devices', p_device_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.plotmap_admin_set_device_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.plotmap_admin_set_device_status(uuid, text, text) to authenticated;

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
revoke all on public.dealer_passcodes from public, anon, authenticated;

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
  max_devices_allowed integer,
  approved_device_count bigint,
  pending_device_count bigint,
  last_device_seen timestamptz,
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
    coalesce(d.max_devices_allowed, 1),
    (
      select count(*)
      from public.dealer_devices dev
      where dev.dealer_id = d.dealer_id
        and dev.status = 'approved'
    ) as approved_device_count,
    (
      select count(*)
      from public.dealer_devices dev
      where dev.dealer_id = d.dealer_id
        and dev.status = 'pending'
    ) as pending_device_count,
    (
      select max(dev.last_seen)
      from public.dealer_devices dev
      where dev.dealer_id = d.dealer_id
    ) as last_device_seen,
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
