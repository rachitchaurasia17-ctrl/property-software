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
--    1. Supabase Dashboard -> Authentication -> Add user:
--       email = <dealer login email>, password = <the passcode>,
--       auto-confirm ON.
--    2. SQL editor: insert the profile row for that auth user:
--         insert into public.profiles (id, email, role, dealer_id, status)
--         values ('<auth user uuid>', '<login email>', 'owner', '<dealer-id>', 'active');
--    3. In /admin/developer.html: "Create dealer" fills dealer_settings
--       (account/trial via plotmap_admin_set_dealer_account, directory via
--       plotmap_admin_upsert_dealer_directory) and stores the passcode
--       hash via plotmap_admin_set_dealer_passcode.
--    The dealer then signs in with ONLY the passcode on the landing page.
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
