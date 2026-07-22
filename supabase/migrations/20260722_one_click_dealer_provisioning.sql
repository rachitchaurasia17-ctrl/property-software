-- ============================================================
-- PlotMap - one-click dealer provisioning
-- STAGING FIRST. DO NOT APPLY TO PRODUCTION WITHOUT ROLLOUT APPROVAL.
--
-- This migration adds the database half of the authenticated Edge Function
-- provisioning flow. Supabase Auth user creation remains inside the Edge
-- Function because it requires the service-role key.
--
-- Safety:
--   - no DROP TABLE / DROP DATABASE / DELETE FROM / TRUNCATE
--   - no broad USING (true) / WITH CHECK (true) policies
--   - provisioning state and credential hashes are deny-all tables
--   - existing Phase 2/3/4 RLS and device approval remain in force
--   - activation codes create pending device requests only
-- ============================================================

create extension if not exists pgcrypto;

do $$
begin
  if to_regprocedure('public.plotmap_is_platform_admin()') is null
     or to_regprocedure('public.plotmap_dealer_is_active(text)') is null
     or to_regprocedure('public.plotmap_admin_set_dealer_passcode(text,text,text)') is null
     or to_regprocedure('public.plotmap_submit_activation_request(text,text,text,text,text,text,text,text)') is null
     or to_regprocedure('public.plotmap_admin_approve_activation_request(uuid,text,text,text,text,text,text)') is null then
    raise exception 'PLOTMAP_PROVISIONING_PREREQUISITES_MISSING';
  end if;
end;
$$;

-- Auth already guarantees unique emails, but the public profile relationship
-- also needs a database-level, case-insensitive invariant.
create unique index if not exists profiles_email_lower_unique_idx
  on public.profiles (lower(email))
  where email is not null;

create table if not exists public.dealer_provisioning_attempts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key_hash text not null,
  request_fingerprint text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  dealer_id text not null,
  login_email text not null,
  business_name text not null,
  owner_name text not null,
  owner_phone text,
  primary_area text not null,
  account_status text not null check (account_status in ('active', 'suspended', 'expired')),
  subscription_status text not null check (subscription_status in ('trial', 'active')),
  trial_start timestamptz,
  trial_end timestamptz,
  device_limit integer not null check (device_limit between 1 and 20),
  activation_expires_at timestamptz not null,
  passcode_retry_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'auth_created', 'profile_created', 'dealer_created', 'completed', 'failed')),
  auth_user_id uuid,
  auth_user_was_created boolean not null default false,
  dealer_preexisted boolean not null default false,
  failure_code text,
  recoverable boolean not null default true,
  attempt_count integer not null default 1 check (attempt_count between 1 and 10),
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (created_by, idempotency_key_hash)
);

create index if not exists dealer_provisioning_attempts_actor_created_idx
  on public.dealer_provisioning_attempts (created_by, created_at desc);

create index if not exists dealer_provisioning_attempts_dealer_idx
  on public.dealer_provisioning_attempts (dealer_id, created_at desc);

create unique index if not exists dealer_provisioning_attempts_open_dealer_idx
  on public.dealer_provisioning_attempts (dealer_id)
  where status <> 'failed' or recoverable;

create unique index if not exists dealer_provisioning_attempts_open_email_idx
  on public.dealer_provisioning_attempts (lower(login_email))
  where status <> 'failed' or recoverable;

alter table public.dealer_provisioning_attempts enable row level security;
revoke all on public.dealer_provisioning_attempts from public, anon, authenticated;

-- Existing generic access codes become inert until explicitly attached to a
-- dealer. This avoids silently rebinding a code to a dealer during approval.
alter table public.dealer_access_codes
  add column if not exists dealer_id text references public.dealer_settings(dealer_id) on delete cascade,
  add column if not exists provisioning_attempt_id uuid
    references public.dealer_provisioning_attempts(id) on delete set null;

create index if not exists dealer_access_codes_dealer_status_idx
  on public.dealer_access_codes (dealer_id, status, expires_at desc);

create unique index if not exists dealer_access_codes_provisioning_attempt_idx
  on public.dealer_access_codes (provisioning_attempt_id)
  where provisioning_attempt_id is not null;

create or replace function public.plotmap_provisioning_admin_is_active(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins a
    join public.profiles p on p.id = a.profile_id
    where a.profile_id = p_actor_id
      and a.status = 'active'
      and p.status = 'active'
      and p.role = 'owner'
      and public.plotmap_dealer_is_active(p.dealer_id)
  );
$$;

revoke all on function public.plotmap_provisioning_admin_is_active(uuid)
  from public, anon, authenticated;

create or replace function public.plotmap_provisioning_text_is_unsafe(p_value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    p_value ~ '[<>]'
    or p_value ~ '[[:cntrl:]]'
    or lower(p_value) ~ '(javascript:|data:text/html|on[a-z]+[[:space:]]*=)',
    false
  );
$$;

revoke all on function public.plotmap_provisioning_text_is_unsafe(text)
  from public, anon, authenticated;

-- Uses pgcrypto bytes with rejection sampling, avoiding modulo bias.
create or replace function public.plotmap_secure_numeric_code(p_length integer default 8)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_result text := '';
  v_bytes bytea;
  v_byte integer;
  v_i integer;
begin
  if p_length < 1 or p_length > 32 then
    raise exception 'INVALID_NUMERIC_CODE_LENGTH';
  end if;

  while length(v_result) < p_length loop
    v_bytes := gen_random_bytes(16);
    for v_i in 0..15 loop
      v_byte := get_byte(v_bytes, v_i);
      if v_byte < 250 then
        v_result := v_result || (v_byte % 10)::text;
        exit when length(v_result) = p_length;
      end if;
    end loop;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.plotmap_secure_numeric_code(integer)
  from public, anon, authenticated;

create or replace function public.plotmap_admin_begin_dealer_provisioning(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_dealer_id text,
  p_business_name text,
  p_owner_name text,
  p_owner_phone text,
  p_primary_area text,
  p_login_email text,
  p_account_status text,
  p_subscription_status text,
  p_trial_start timestamptz,
  p_trial_end timestamptz,
  p_device_limit integer,
  p_activation_expires_at timestamptz,
  p_passcode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_actor_id uuid := auth.uid();
  v_dealer_id text := lower(trim(coalesce(p_dealer_id, '')));
  v_business_name text := trim(coalesce(p_business_name, ''));
  v_owner_name text := trim(coalesce(p_owner_name, ''));
  v_owner_phone text := nullif(trim(coalesce(p_owner_phone, '')), '');
  v_primary_area text := trim(coalesce(p_primary_area, ''));
  v_login_email text := lower(trim(coalesce(p_login_email, '')));
  v_idempotency_hash text;
  v_attempt public.dealer_provisioning_attempts%rowtype;
  v_dealer_preexisted boolean := false;
  v_existing_auth_user_id uuid;
begin
  if v_actor_id is null or not public.plotmap_provisioning_admin_is_active(v_actor_id) then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;

  if p_idempotency_key is null
     or length(trim(p_idempotency_key)) < 16
     or length(trim(p_idempotency_key)) > 128
     or trim(p_idempotency_key) !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_request_fingerprint is null or lower(p_request_fingerprint) !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_REQUEST_FINGERPRINT';
  end if;
  if v_dealer_id !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    raise exception 'INVALID_DEALER_ID';
  end if;
  if length(v_business_name) < 2 or length(v_business_name) > 160
     or public.plotmap_provisioning_text_is_unsafe(v_business_name) then
    raise exception 'INVALID_BUSINESS_NAME';
  end if;
  if length(v_owner_name) < 2 or length(v_owner_name) > 120
     or public.plotmap_provisioning_text_is_unsafe(v_owner_name) then
    raise exception 'INVALID_OWNER_NAME';
  end if;
  if v_owner_phone is not null and (
       length(v_owner_phone) < 7 or length(v_owner_phone) > 40
       or v_owner_phone !~ '^[0-9+() -]+$'
       or public.plotmap_provisioning_text_is_unsafe(v_owner_phone)
     ) then
    raise exception 'INVALID_OWNER_PHONE';
  end if;
  if length(v_primary_area) < 2 or length(v_primary_area) > 120
     or public.plotmap_provisioning_text_is_unsafe(v_primary_area) then
    raise exception 'INVALID_PRIMARY_AREA';
  end if;
  if length(v_login_email) > 254
     or v_login_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$'
     or public.plotmap_provisioning_text_is_unsafe(v_login_email) then
    raise exception 'INVALID_LOGIN_EMAIL';
  end if;
  if p_account_status <> 'active' then
    raise exception 'NEW_DEALER_MUST_BE_ACTIVE';
  end if;
  if p_subscription_status not in ('trial', 'active') then
    raise exception 'INVALID_SUBSCRIPTION_STATUS';
  end if;
  if p_subscription_status = 'trial' and (p_trial_start is null or p_trial_end is null) then
    raise exception 'TRIAL_DATES_REQUIRED';
  end if;
  if p_trial_start is not null and p_trial_end is not null and p_trial_end < p_trial_start then
    raise exception 'INVALID_TRIAL_DATES';
  end if;
  if p_subscription_status = 'trial' and p_trial_end <= timezone('utc'::text, now()) then
    raise exception 'TRIAL_END_MUST_BE_FUTURE';
  end if;
  if coalesce(p_device_limit, 0) < 1 or coalesce(p_device_limit, 0) > 20 then
    raise exception 'INVALID_DEVICE_LIMIT';
  end if;
  if p_activation_expires_at is null
     or p_activation_expires_at < timezone('utc'::text, now()) + interval '10 minutes'
     or p_activation_expires_at > timezone('utc'::text, now()) + interval '30 days' then
    raise exception 'INVALID_ACTIVATION_EXPIRY';
  end if;
  if p_passcode is null
     or length(trim(p_passcode)) < 8
     or octet_length(trim(p_passcode)) > 72
     or public.plotmap_provisioning_text_is_unsafe(trim(p_passcode)) then
    raise exception 'INVALID_PASSCODE';
  end if;

  v_idempotency_hash := encode(digest(trim(p_idempotency_key), 'sha256'), 'hex');

  -- Serialize duplicate browser submissions and concurrent platform admins
  -- before looking up or creating the idempotency row.
  perform pg_advisory_xact_lock(hashtext('plotmap:provision:actor:' || v_actor_id::text));
  perform pg_advisory_xact_lock(hashtext('plotmap:provision:dealer:' || v_dealer_id));
  perform pg_advisory_xact_lock(hashtext('plotmap:provision:email:' || v_login_email));

  select *
    into v_attempt
    from public.dealer_provisioning_attempts a
    where a.created_by = v_actor_id
      and a.idempotency_key_hash = v_idempotency_hash
    for update;

  if found then
    if v_attempt.request_fingerprint <> lower(p_request_fingerprint)
       or v_attempt.dealer_id <> v_dealer_id
       or lower(v_attempt.login_email) <> v_login_email
       or (
         v_attempt.passcode_retry_hash is not null
         and v_attempt.passcode_retry_hash <> crypt(trim(p_passcode), v_attempt.passcode_retry_hash)
       ) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;

    if v_attempt.status = 'completed' then
      return jsonb_build_object(
        'attempt_id', v_attempt.id,
        'status', v_attempt.status,
        'recoverable', false,
        'completed', true,
        'proceed', false
      );
    end if;
    if v_attempt.status = 'failed' and not v_attempt.recoverable then
      raise exception 'PROVISIONING_ATTEMPT_NOT_RETRYABLE';
    end if;
    if v_attempt.status not in ('pending', 'auth_created', 'failed') then
      raise exception 'PROVISIONING_ATTEMPT_NOT_RETRYABLE';
    end if;

    if v_attempt.status = 'failed' and v_attempt.recoverable then
      if v_attempt.attempt_count >= 10 then
        raise exception 'PROVISIONING_RETRY_LIMIT';
      end if;
      update public.dealer_provisioning_attempts
         set status = case when auth_user_id is null then 'pending' else 'auth_created' end,
              failure_code = null,
              attempt_count = attempt_count + 1,
              lease_expires_at = timezone('utc'::text, now()) + interval '5 minutes',
              updated_at = timezone('utc'::text, now())
       where id = v_attempt.id
       returning * into v_attempt;
    elsif v_attempt.lease_expires_at is not null
          and v_attempt.lease_expires_at > timezone('utc'::text, now()) then
      return jsonb_build_object(
        'attempt_id', v_attempt.id,
        'status', v_attempt.status,
        'recoverable', true,
        'completed', false,
        'in_progress', true,
        'proceed', false
      );
    else
      if v_attempt.attempt_count >= 10 then
        raise exception 'PROVISIONING_RETRY_LIMIT';
      end if;
      update public.dealer_provisioning_attempts
         set attempt_count = attempt_count + 1,
             lease_expires_at = timezone('utc'::text, now()) + interval '5 minutes',
             updated_at = timezone('utc'::text, now())
       where id = v_attempt.id
       returning * into v_attempt;
    end if;

    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'auth_user_id', v_attempt.auth_user_id,
      'auth_user_was_created', v_attempt.auth_user_was_created,
      'dealer_preexisted', v_attempt.dealer_preexisted,
      'recoverable', v_attempt.recoverable,
      'completed', false,
      'in_progress', false,
      'proceed', true
    );
  end if;

  if (
    select count(*)
    from public.dealer_provisioning_attempts a
    where a.created_by = v_actor_id
      and a.created_at >= timezone('utc'::text, now()) - interval '15 minutes'
  ) >= 5 then
    raise exception 'PROVISIONING_RATE_LIMIT';
  end if;

  if exists (
    select 1
    from public.dealer_provisioning_attempts a
    where (a.dealer_id = v_dealer_id or lower(a.login_email) = v_login_email)
      and (a.status in ('pending', 'auth_created') or (a.status = 'failed' and a.recoverable))
  ) then
    raise exception 'PROVISIONING_IN_PROGRESS';
  end if;

  if exists (select 1 from public.profiles p where p.dealer_id = v_dealer_id)
     or exists (select 1 from public.dealer_passcodes pc where pc.dealer_id = v_dealer_id) then
    raise exception 'DEALER_ALREADY_EXISTS';
  end if;

  if exists (select 1 from public.dealer_settings d where d.dealer_id = v_dealer_id) then
    if not exists (
      select 1 from public.dealer_settings d
      where d.dealer_id = v_dealer_id
        and coalesce(d.account_status, 'active') = 'active'
    ) then
      raise exception 'DEALER_ACCOUNT_BLOCKED';
    end if;
    v_dealer_preexisted := true;
  end if;

  if exists (select 1 from public.profiles p where lower(p.email) = v_login_email)
     or exists (select 1 from public.dealer_passcodes pc where lower(pc.login_email) = v_login_email) then
    raise exception 'LOGIN_EMAIL_ALREADY_IN_USE';
  end if;

  select u.id
    into v_existing_auth_user_id
    from auth.users u
    where lower(u.email) = v_login_email
    limit 1;

  insert into public.dealer_provisioning_attempts (
    idempotency_key_hash,
    request_fingerprint,
    created_by,
    dealer_id,
    login_email,
    business_name,
    owner_name,
    owner_phone,
    primary_area,
    account_status,
    subscription_status,
    trial_start,
    trial_end,
    device_limit,
    activation_expires_at,
    passcode_retry_hash,
    dealer_preexisted,
    lease_expires_at
  ) values (
    v_idempotency_hash,
    lower(p_request_fingerprint),
    v_actor_id,
    v_dealer_id,
    v_login_email,
    v_business_name,
    v_owner_name,
    v_owner_phone,
    v_primary_area,
    p_account_status,
    p_subscription_status,
    p_trial_start,
    p_trial_end,
    p_device_limit,
    p_activation_expires_at,
    crypt(trim(p_passcode), gen_salt('bf', 10)),
    v_dealer_preexisted,
    timezone('utc'::text, now()) + interval '5 minutes'
  )
  returning * into v_attempt;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'existing_auth_user_id', v_existing_auth_user_id,
    'dealer_preexisted', v_attempt.dealer_preexisted,
    'recoverable', true,
    'completed', false,
    'in_progress', false,
    'proceed', true
  );
end;
$$;

revoke all on function public.plotmap_admin_begin_dealer_provisioning(
  text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, integer, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.plotmap_admin_begin_dealer_provisioning(
  text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, integer, timestamptz, text
) to authenticated;

-- Edge Function-only Auth lookup. The service role is never present in the
-- browser, and no password, token, or user metadata is returned.
create or replace function public.plotmap_service_auth_user_by_email(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = auth, public
as $$
  select coalesce((
    select jsonb_build_object(
      'id', u.id,
      'provisioning_attempt_id', u.raw_app_meta_data->>'plotmap_provisioning_attempt_id',
      'dealer_id', u.raw_app_meta_data->>'plotmap_dealer_id',
      'plotmap_provisioned', coalesce(u.raw_app_meta_data->>'plotmap_provisioned', '') = 'true'
    )
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
    limit 1
  ), '{}'::jsonb);
$$;

revoke all on function public.plotmap_service_auth_user_by_email(text)
  from public, anon, authenticated;
grant execute on function public.plotmap_service_auth_user_by_email(text)
  to service_role;

create or replace function public.plotmap_admin_mark_dealer_provisioning_auth(
  p_attempt_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_attempt public.dealer_provisioning_attempts%rowtype;
  v_auth_email text;
  v_auth_attempt text;
  v_auth_dealer text;
begin
  if v_actor_id is null or not public.plotmap_provisioning_admin_is_active(v_actor_id) then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;

  select * into v_attempt
  from public.dealer_provisioning_attempts
  where id = p_attempt_id and created_by = v_actor_id
  for update;

  if not found then raise exception 'PROVISIONING_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status = 'completed' then
    return jsonb_build_object('attempt_id', v_attempt.id, 'status', 'completed');
  end if;
  if v_attempt.status not in ('pending', 'auth_created') then
    raise exception 'PROVISIONING_ATTEMPT_NOT_RETRYABLE';
  end if;

  select lower(u.email),
         u.raw_app_meta_data->>'plotmap_provisioning_attempt_id',
         u.raw_app_meta_data->>'plotmap_dealer_id'
    into v_auth_email, v_auth_attempt, v_auth_dealer
    from auth.users u
    where u.id = p_auth_user_id;

  if not found
     or v_auth_email <> lower(v_attempt.login_email)
     or v_auth_attempt <> v_attempt.id::text
     or v_auth_dealer <> v_attempt.dealer_id then
    raise exception 'AUTH_USER_BINDING_INVALID';
  end if;

  update public.dealer_provisioning_attempts
     set auth_user_id = p_auth_user_id,
         auth_user_was_created = true,
         status = 'auth_created',
         failure_code = null,
         updated_at = timezone('utc'::text, now())
   where id = v_attempt.id
   returning * into v_attempt;

  return jsonb_build_object('attempt_id', v_attempt.id, 'status', v_attempt.status);
end;
$$;

revoke all on function public.plotmap_admin_mark_dealer_provisioning_auth(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_mark_dealer_provisioning_auth(uuid, uuid)
  to authenticated;

create or replace function public.plotmap_admin_get_dealer_provisioning_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_attempt public.dealer_provisioning_attempts%rowtype;
begin
  if v_actor_id is null or not public.plotmap_provisioning_admin_is_active(v_actor_id) then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;

  select * into v_attempt
  from public.dealer_provisioning_attempts
  where id = p_attempt_id and created_by = v_actor_id;

  if not found then raise exception 'PROVISIONING_ATTEMPT_NOT_FOUND'; end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'dealer_id', v_attempt.dealer_id,
    'recoverable', v_attempt.recoverable,
    'auth_user_id', v_attempt.auth_user_id,
    'auth_user_was_created', v_attempt.auth_user_was_created,
    'completed', v_attempt.status = 'completed'
  );
end;
$$;

revoke all on function public.plotmap_admin_get_dealer_provisioning_attempt(uuid)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_get_dealer_provisioning_attempt(uuid)
  to authenticated;

create or replace function public.plotmap_admin_fail_dealer_provisioning(
  p_attempt_id uuid,
  p_failure_code text,
  p_recoverable boolean,
  p_auth_user_retained boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_attempt public.dealer_provisioning_attempts%rowtype;
  v_code text := upper(trim(coalesce(p_failure_code, 'UNKNOWN_FAILURE')));
begin
  if v_actor_id is null or not public.plotmap_provisioning_admin_is_active(v_actor_id) then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  if v_code !~ '^[A-Z0-9_]{3,64}$' then v_code := 'UNKNOWN_FAILURE'; end if;

  select * into v_attempt
  from public.dealer_provisioning_attempts
  where id = p_attempt_id and created_by = v_actor_id
  for update;

  if not found then raise exception 'PROVISIONING_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status = 'completed' then return; end if;

  update public.dealer_provisioning_attempts
     set status = 'failed',
         failure_code = v_code,
         recoverable = coalesce(p_recoverable, false),
         auth_user_id = case when p_auth_user_retained then auth_user_id else null end,
         auth_user_was_created = case when p_auth_user_retained then auth_user_was_created else false end,
         lease_expires_at = null,
         updated_at = timezone('utc'::text, now())
   where id = v_attempt.id;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata
  ) values (
    v_attempt.dealer_id,
    v_actor_id,
    public.plotmap_current_role(),
    'dealer_provisioning_failed',
    'dealer_provisioning_attempts',
    v_attempt.id::text,
    jsonb_build_object(
      'attemptId', v_attempt.id,
      'resultCode', v_code,
      'recoverable', coalesce(p_recoverable, false)
    )
  );
end;
$$;

revoke all on function public.plotmap_admin_fail_dealer_provisioning(uuid, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_fail_dealer_provisioning(uuid, text, boolean, boolean)
  to authenticated;

create or replace function public.plotmap_admin_finalize_dealer_provisioning(
  p_attempt_id uuid,
  p_passcode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_actor_id uuid := auth.uid();
  v_attempt public.dealer_provisioning_attempts%rowtype;
  v_auth_email text;
  v_auth_attempt text;
  v_auth_dealer text;
  v_activation_code text;
  v_activation_code_id uuid;
  v_collision boolean;
  v_code_try integer;
begin
  if v_actor_id is null or not public.plotmap_provisioning_admin_is_active(v_actor_id) then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;

  select * into v_attempt
  from public.dealer_provisioning_attempts
  where id = p_attempt_id and created_by = v_actor_id
  for update;

  if not found then raise exception 'PROVISIONING_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status = 'completed' then
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'status', 'completed',
      'dealer_id', v_attempt.dealer_id,
      'credentials_available', false
    );
  end if;
  if v_attempt.status <> 'auth_created' or v_attempt.auth_user_id is null then
    raise exception 'AUTH_USER_NOT_READY';
  end if;
  if v_attempt.passcode_retry_hash is null
     or p_passcode is null
     or v_attempt.passcode_retry_hash <> crypt(trim(p_passcode), v_attempt.passcode_retry_hash) then
    raise exception 'PASSCODE_RETRY_MISMATCH';
  end if;

  select lower(u.email),
         u.raw_app_meta_data->>'plotmap_provisioning_attempt_id',
         u.raw_app_meta_data->>'plotmap_dealer_id'
    into v_auth_email, v_auth_attempt, v_auth_dealer
    from auth.users u
    where u.id = v_attempt.auth_user_id;

  if not found
     or v_auth_email <> lower(v_attempt.login_email)
     or v_auth_attempt <> v_attempt.id::text
     or v_auth_dealer <> v_attempt.dealer_id then
    raise exception 'AUTH_USER_BINDING_INVALID';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id <> v_attempt.auth_user_id
      and (lower(p.email) = lower(v_attempt.login_email) or p.dealer_id = v_attempt.dealer_id)
  ) then
    raise exception 'PROFILE_BINDING_CONFLICT';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = v_attempt.auth_user_id
      and (lower(p.email) <> lower(v_attempt.login_email)
           or p.dealer_id <> v_attempt.dealer_id
           or p.role <> 'owner')
  ) then
    raise exception 'PROFILE_BINDING_CONFLICT';
  end if;

  if v_attempt.dealer_preexisted then
    if not exists (select 1 from public.dealer_settings d where d.dealer_id = v_attempt.dealer_id)
       or exists (select 1 from public.dealer_passcodes pc where pc.dealer_id = v_attempt.dealer_id)
       or exists (select 1 from public.profiles p where p.dealer_id = v_attempt.dealer_id) then
      raise exception 'DEALER_PARTIAL_STATE_CHANGED';
    end if;

    update public.dealer_settings
       set brand_name = v_attempt.business_name,
           owner_name = v_attempt.owner_name,
           owner_phone = v_attempt.owner_phone,
           primary_area = v_attempt.primary_area,
           account_status = v_attempt.account_status,
           subscription_status = v_attempt.subscription_status,
           trial_start = v_attempt.trial_start,
           trial_end = v_attempt.trial_end,
           paid = v_attempt.subscription_status = 'active',
           max_devices_allowed = v_attempt.device_limit,
           updated_at = timezone('utc'::text, now())
     where dealer_id = v_attempt.dealer_id;
  else
    if exists (select 1 from public.dealer_settings d where d.dealer_id = v_attempt.dealer_id) then
      raise exception 'DEALER_ALREADY_EXISTS';
    end if;

    insert into public.dealer_settings (
      dealer_id, brand_name, owner_name, owner_phone, primary_area,
      account_status, subscription_status, trial_start, trial_end,
      paid, max_devices_allowed, updated_at
    ) values (
      v_attempt.dealer_id, v_attempt.business_name, v_attempt.owner_name,
      v_attempt.owner_phone, v_attempt.primary_area, v_attempt.account_status,
      v_attempt.subscription_status, v_attempt.trial_start, v_attempt.trial_end,
      v_attempt.subscription_status = 'active', v_attempt.device_limit,
      timezone('utc'::text, now())
    );
  end if;

  insert into public.profiles (
    id, email, role, dealer_id, status, display_name, permissions, metadata, updated_at
  ) values (
    v_attempt.auth_user_id,
    lower(v_attempt.login_email),
    'owner',
    v_attempt.dealer_id,
    'active',
    v_attempt.owner_name,
    '[]'::jsonb,
    jsonb_build_object(
      'provisionedBy', 'one_click',
      'provisioningAttemptId', v_attempt.id
    ),
    timezone('utc'::text, now())
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_attempt.auth_user_id
      and lower(p.email) = lower(v_attempt.login_email)
      and p.dealer_id = v_attempt.dealer_id
      and p.role = 'owner'
      and p.status = 'active'
  ) then
    raise exception 'OWNER_PROFILE_NOT_ACTIVE';
  end if;

  -- Reuse the established bcrypt, uniqueness, ownership and audit contract.
  perform public.plotmap_admin_set_dealer_passcode(
    v_attempt.dealer_id,
    v_attempt.login_email,
    p_passcode
  );

  update public.dealer_access_codes
     set status = 'disabled',
         updated_at = timezone('utc'::text, now())
   where dealer_id = v_attempt.dealer_id
     and status = 'active';

  for v_code_try in 1..25 loop
    v_activation_code := public.plotmap_secure_numeric_code(8);
    select exists (
      select 1 from public.dealer_access_codes c
      where c.status = 'active'
        and (c.expires_at is null or c.expires_at > timezone('utc'::text, now()))
        and c.code_hash = crypt(v_activation_code, c.code_hash)
    ) into v_collision;
    exit when not v_collision;
  end loop;
  if v_collision then raise exception 'ACTIVATION_CODE_GENERATION_FAILED'; end if;

  insert into public.dealer_access_codes (
    dealer_id, provisioning_attempt_id, label, code_hash, status,
    max_uses, use_count, expires_at, created_by, updated_at
  ) values (
    v_attempt.dealer_id,
    v_attempt.id,
    left(v_attempt.business_name || ' onboarding', 160),
    crypt(v_activation_code, gen_salt('bf', 10)),
    'active',
    1,
    0,
    v_attempt.activation_expires_at,
    v_actor_id,
    timezone('utc'::text, now())
  ) returning id into v_activation_code_id;

  update public.dealer_provisioning_attempts
     set status = 'completed',
         passcode_retry_hash = null,
         failure_code = null,
         recoverable = false,
         lease_expires_at = null,
         completed_at = timezone('utc'::text, now()),
         updated_at = timezone('utc'::text, now())
   where id = v_attempt.id;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata
  ) values (
    v_attempt.dealer_id,
    v_actor_id,
    public.plotmap_current_role(),
    'dealer_provisioning_completed',
    'dealer_provisioning_attempts',
    v_attempt.id::text,
    jsonb_build_object(
      'attemptId', v_attempt.id,
      'resultCode', 'COMPLETED',
      'deviceLimit', v_attempt.device_limit,
      'subscriptionStatus', v_attempt.subscription_status
    )
  );

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', 'completed',
    'dealer_id', v_attempt.dealer_id,
    'business_name', v_attempt.business_name,
    'owner_name', v_attempt.owner_name,
    'login_email', lower(v_attempt.login_email),
    'activation_code', v_activation_code,
    'activation_code_id', v_activation_code_id,
    'activation_expires_at', v_attempt.activation_expires_at,
    'device_limit', v_attempt.device_limit,
    'trial_start', v_attempt.trial_start,
    'trial_end', v_attempt.trial_end,
    'credentials_available', true
  );
end;
$$;

revoke all on function public.plotmap_admin_finalize_dealer_provisioning(uuid, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_finalize_dealer_provisioning(uuid, text)
  to authenticated;

-- Existing dealers receive dealer-scoped, single-use device codes. The old
-- generic RPC is left in place for rollback compatibility but loses browser
-- execution permission.
revoke all on function public.plotmap_admin_create_activation_code(text, text, integer, timestamptz)
  from public, anon, authenticated;

create or replace function public.plotmap_admin_create_dealer_activation_code(
  p_dealer_id text,
  p_access_code text,
  p_label text default null,
  p_max_uses integer default 1,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_dealer_id text := lower(trim(coalesce(p_dealer_id, '')));
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  if not public.plotmap_dealer_is_active(v_dealer_id) then
    raise exception 'DEALER_NOT_ACTIVE';
  end if;
  if p_access_code is null or trim(p_access_code) !~ '^[0-9]{8}$' then
    raise exception 'INVALID_ACTIVATION_CODE';
  end if;
  if p_label is not null and (
       length(trim(p_label)) > 160
       or public.plotmap_provisioning_text_is_unsafe(trim(p_label))
     ) then
    raise exception 'INVALID_ACTIVATION_LABEL';
  end if;
  if coalesce(p_max_uses, 1) <> 1 then
    raise exception 'ACTIVATION_CODE_MUST_BE_SINGLE_USE';
  end if;
  if p_expires_at is null
     or p_expires_at < timezone('utc'::text, now()) + interval '10 minutes'
     or p_expires_at > timezone('utc'::text, now()) + interval '30 days' then
    raise exception 'INVALID_ACTIVATION_EXPIRY';
  end if;
  if exists (
    select 1 from public.dealer_access_codes c
    where c.status = 'active'
      and (c.expires_at is null or c.expires_at > timezone('utc'::text, now()))
      and c.code_hash = crypt(trim(p_access_code), c.code_hash)
  ) then
    raise exception 'ACTIVATION_CODE_ALREADY_ACTIVE';
  end if;

  update public.dealer_access_codes
     set status = 'disabled', updated_at = timezone('utc'::text, now())
   where dealer_id = v_dealer_id and status = 'active';

  insert into public.dealer_access_codes (
    dealer_id, label, code_hash, status, max_uses, use_count,
    expires_at, created_by, updated_at
  ) values (
    v_dealer_id,
    nullif(left(trim(coalesce(p_label, '')), 160), ''),
    crypt(trim(p_access_code), gen_salt('bf', 10)),
    'active', 1, 0, p_expires_at, auth.uid(), timezone('utc'::text, now())
  ) returning id into v_id;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata
  ) values (
    v_dealer_id, auth.uid(), public.plotmap_current_role(),
    'dealer_activation_code_created', 'dealer_access_codes', v_id::text,
    jsonb_build_object('dealerId', v_dealer_id, 'maxUses', 1)
  );

  return v_id;
end;
$$;

revoke all on function public.plotmap_admin_create_dealer_activation_code(text, text, text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_create_dealer_activation_code(text, text, text, integer, timestamptz)
  to authenticated;

-- Public code redemption remains pre-auth, but the dealer relationship now
-- comes only from the hashed code row. The browser cannot inject dealer_id.
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
set search_path = public, extensions
as $$
declare
  v_code public.dealer_access_codes%rowtype;
  v_dealer public.dealer_settings%rowtype;
  v_request_id uuid;
  v_lookup_token text := encode(gen_random_bytes(24), 'hex');
begin
  perform pg_sleep(0.25);

  if p_access_code is null or trim(p_access_code) !~ '^[0-9]{8}$' then return; end if;
  if p_device_token is null
     or length(trim(p_device_token)) < 32
     or octet_length(trim(p_device_token)) > 512
     or public.plotmap_provisioning_text_is_unsafe(trim(p_device_token)) then
    return;
  end if;
  if length(trim(coalesce(p_business_name, ''))) > 160
     or length(trim(coalesce(p_owner_name, ''))) > 120
     or length(trim(coalesce(p_owner_phone, ''))) > 40
     or length(trim(coalesce(p_primary_area, ''))) > 120
     or length(trim(coalesce(p_device_label, ''))) > 160
     or length(trim(coalesce(p_browser_info, ''))) > 240
     or public.plotmap_provisioning_text_is_unsafe(coalesce(p_business_name, ''))
     or public.plotmap_provisioning_text_is_unsafe(coalesce(p_owner_name, ''))
     or public.plotmap_provisioning_text_is_unsafe(coalesce(p_owner_phone, ''))
     or public.plotmap_provisioning_text_is_unsafe(coalesce(p_primary_area, ''))
     or public.plotmap_provisioning_text_is_unsafe(coalesce(p_device_label, ''))
     or public.plotmap_provisioning_text_is_unsafe(coalesce(p_browser_info, '')) then
    return;
  end if;

  select * into v_code
  from public.dealer_access_codes c
  where c.status = 'active'
    and c.dealer_id is not null
    and public.plotmap_dealer_is_active(c.dealer_id)
    and (c.expires_at is null or c.expires_at > timezone('utc'::text, now()))
    and c.use_count < c.max_uses
    and c.code_hash = crypt(trim(p_access_code), c.code_hash)
  order by c.created_at asc
  limit 1
  for update;

  if not found then return; end if;

  select * into v_dealer
  from public.dealer_settings d
  where d.dealer_id = v_code.dealer_id;

  insert into public.dealer_activation_requests (
    access_code_id, lookup_token_hash, dealer_id,
    requested_business_name, requested_owner_name, requested_owner_phone,
    requested_primary_area, device_label, device_token_hash, browser_info
  ) values (
    v_code.id,
    crypt(v_lookup_token, gen_salt('bf', 10)),
    v_code.dealer_id,
    coalesce(nullif(left(trim(coalesce(p_business_name, '')), 160), ''), v_dealer.brand_name),
    coalesce(nullif(left(trim(coalesce(p_owner_name, '')), 120), ''), v_dealer.owner_name),
    coalesce(nullif(left(trim(coalesce(p_owner_phone, '')), 40), ''), v_dealer.owner_phone),
    coalesce(nullif(left(trim(coalesce(p_primary_area, '')), 120), ''), v_dealer.primary_area),
    nullif(left(trim(coalesce(p_device_label, '')), 160), ''),
    crypt(trim(p_device_token), gen_salt('bf', 10)),
    nullif(left(trim(coalesce(p_browser_info, '')), 240), '')
  ) returning id into v_request_id;

  update public.dealer_access_codes as access_code
     set use_count = access_code.use_count + 1,
         status = case
           when access_code.use_count + 1 >= access_code.max_uses then 'disabled'
           else access_code.status
         end,
         updated_at = timezone('utc'::text, now())
   where access_code.id = v_code.id;

  return query select v_request_id, v_lookup_token, 'pending'::text;
end;
$$;

revoke all on function public.plotmap_submit_activation_request(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_submit_activation_request(text, text, text, text, text, text, text, text)
  to anon, authenticated;

-- Approval can no longer bind a request to a different dealer. It still only
-- approves the physical device after a platform-admin decision.
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
  v_dealer_id text := lower(trim(coalesce(p_dealer_id, '')));
  v_max_devices integer;
  v_approved_devices integer;
begin
  if not public.plotmap_is_platform_admin() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;

  select * into v_request
  from public.dealer_activation_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then raise exception 'PENDING_REQUEST_NOT_FOUND'; end if;
  if v_request.dealer_id is null or v_request.dealer_id <> v_dealer_id then
    raise exception 'ACTIVATION_DEALER_MISMATCH';
  end if;
  if not exists (select 1 from public.dealer_settings d where d.dealer_id = v_dealer_id) then
    raise exception 'DEALER_NOT_FOUND';
  end if;
  if not public.plotmap_dealer_is_active(v_dealer_id) then
    raise exception 'DEALER_NOT_ACTIVE';
  end if;
  if v_request.device_token_hash is null then raise exception 'DEVICE_TOKEN_MISSING'; end if;

  update public.dealer_settings
     set brand_name = coalesce(nullif(trim(p_business_name), ''), brand_name),
         owner_name = coalesce(nullif(trim(p_owner_name), ''), owner_name),
         owner_phone = coalesce(nullif(trim(p_owner_phone), ''), owner_phone),
         primary_area = coalesce(nullif(trim(p_primary_area), ''), primary_area),
         developer_notes = coalesce(nullif(trim(p_developer_notes), ''), developer_notes),
         updated_at = timezone('utc'::text, now())
   where dealer_id = v_dealer_id;

  select coalesce(max_devices_allowed, 1) into v_max_devices
  from public.dealer_settings where dealer_id = v_dealer_id for update;

  select count(*) into v_approved_devices
  from public.dealer_devices
  where dealer_id = v_dealer_id and status = 'approved';

  if v_approved_devices >= v_max_devices then
    raise exception 'DEALER_DEVICE_LIMIT_REACHED';
  end if;

  insert into public.dealer_devices (
    dealer_id, device_token_hash, status, device_label, browser_info,
    approved_by, approved_at, developer_notes, updated_at
  ) values (
    v_dealer_id, v_request.device_token_hash, 'approved',
    v_request.device_label, v_request.browser_info, auth.uid(),
    timezone('utc'::text, now()), p_developer_notes,
    timezone('utc'::text, now())
  );

  update public.dealer_activation_requests
     set status = 'approved',
         approved_by = auth.uid(),
         approved_at = timezone('utc'::text, now()),
         developer_notes = coalesce(p_developer_notes, developer_notes),
         updated_at = timezone('utc'::text, now())
   where id = p_request_id;

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata
  ) values (
    v_dealer_id, auth.uid(), public.plotmap_current_role(),
    'dealer_activation_approved', 'dealer_activation_requests',
    p_request_id::text, '{}'::jsonb
  );
end;
$$;

revoke all on function public.plotmap_admin_approve_activation_request(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_approve_activation_request(uuid, text, text, text, text, text, text)
  to authenticated;
