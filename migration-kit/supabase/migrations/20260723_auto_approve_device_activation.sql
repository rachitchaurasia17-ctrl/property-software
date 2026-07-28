-- ============================================================
-- PlotMap - atomic activation-code device approval
-- STAGING FIRST. DO NOT APPLY TO PRODUCTION WITHOUT ROLLOUT APPROVAL.
--
-- New activation-code redemptions approve one device immediately. Existing
-- pending activation requests and their platform-admin controls remain intact
-- for legacy records, but browsers can no longer create new pending requests.
--
-- Safety:
--   - code validation, device-limit enforcement, approval, and consumption
--     occur in one database transaction
--   - the code row and dealer row are locked to serialize concurrent attempts
--   - only bcrypt hashes of activation codes and device tokens are stored
--   - no DROP TABLE / DROP DATABASE / DELETE FROM / TRUNCATE
--   - no RLS policy changes and no service-role credentials
-- ============================================================

create extension if not exists pgcrypto;

do $$
begin
  if to_regprocedure('public.plotmap_dealer_is_active(text)') is null
     or to_regprocedure('public.plotmap_device_is_approved(text,text)') is null
     or to_regprocedure('public.plotmap_submit_activation_request(text,text,text,text,text,text,text,text)') is null
     or to_regprocedure('public.plotmap_admin_approve_activation_request(uuid,text,text,text,text,text,text)') is null then
    raise exception 'PLOTMAP_AUTO_ACTIVATION_PREREQUISITES_MISSING';
  end if;
end;
$$;

-- The redemption link makes a committed response safely recoverable. A retry
-- from the same device can prove it owns the consumed code; another device
-- receives only an already-used result.
alter table public.dealer_access_codes
  add column if not exists redeemed_device_id uuid
    references public.dealer_devices(id) on delete set null,
  add column if not exists redeemed_at timestamptz;

create index if not exists dealer_access_codes_redeemed_device_idx
  on public.dealer_access_codes (redeemed_device_id)
  where redeemed_device_id is not null;

create or replace function public.plotmap_activate_device(
  p_access_code text,
  p_device_token text,
  p_device_label text default null,
  p_browser_info text default null
)
returns table (status text, dealer_id text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_code public.dealer_access_codes%rowtype;
  v_device public.dealer_devices%rowtype;
  v_device_id uuid;
  v_max_devices integer;
  v_approved_devices integer;
begin
  -- Keep malformed and unknown-code timing close to valid-code timing.
  perform pg_sleep(0.25);

  if p_access_code is null or trim(p_access_code) !~ '^[0-9]{8}$' then
    return query select 'invalid_code'::text, null::text;
    return;
  end if;
  if p_device_token is null
     or length(trim(p_device_token)) < 32
     or octet_length(trim(p_device_token)) > 512
     or public.plotmap_provisioning_text_is_unsafe(trim(p_device_token)) then
    return query select 'activation_failed'::text, null::text;
    return;
  end if;
  if length(trim(coalesce(p_device_label, ''))) > 160
     or length(trim(coalesce(p_browser_info, ''))) > 240
     or public.plotmap_provisioning_text_is_unsafe(coalesce(p_device_label, ''))
     or public.plotmap_provisioning_text_is_unsafe(coalesce(p_browser_info, '')) then
    return query select 'activation_failed'::text, null::text;
    return;
  end if;

  -- bcrypt hashes cannot be indexed by plaintext. Active rows are preferred,
  -- while consumed rows remain searchable for same-device retry recovery.
  select c.*
    into v_code
    from public.dealer_access_codes c
    where c.dealer_id is not null
      and c.code_hash = crypt(trim(p_access_code), c.code_hash)
    order by
      case when c.status = 'active' then 0 else 1 end,
      c.created_at desc
    limit 1
    for update;

  if not found then
    return query select 'invalid_code'::text, null::text;
    return;
  end if;

  -- A retry after a committed-but-lost response is idempotent only for the
  -- exact device that consumed the code. Revocation is never bypassed.
  if v_code.redeemed_device_id is not null then
    select d.*
      into v_device
      from public.dealer_devices d
      where d.id = v_code.redeemed_device_id
      for update;

    if found
       and v_device.status = 'approved'
       and v_device.dealer_id = v_code.dealer_id
       and v_device.device_token_hash = crypt(trim(p_device_token), v_device.device_token_hash) then
      update public.dealer_devices
         set last_seen = v_now,
             updated_at = v_now
       where id = v_device.id;
      return query select 'approved'::text, v_code.dealer_id;
      return;
    end if;

    return query select 'already_used'::text, null::text;
    return;
  end if;

  if v_code.status = 'expired'
     or v_code.expires_at is null
     or v_code.expires_at <= v_now then
    return query select 'expired'::text, null::text;
    return;
  end if;
  if v_code.status <> 'active' or v_code.use_count >= v_code.max_uses then
    return query select 'already_used'::text, null::text;
    return;
  end if;
  if v_code.max_uses <> 1 then
    return query select 'invalid_code'::text, null::text;
    return;
  end if;

  -- This row lock serializes all device activations for one dealer, including
  -- redemptions using different valid codes, so the configured limit cannot
  -- be exceeded by concurrent requests.
  select coalesce(d.max_devices_allowed, 1)
    into v_max_devices
    from public.dealer_settings d
    where d.dealer_id = v_code.dealer_id
    for update;

  if not found or not public.plotmap_dealer_is_active(v_code.dealer_id) then
    return query select 'dealer_inactive'::text, null::text;
    return;
  end if;

  -- Reusing a new code on an already-approved physical device is harmless and
  -- consumes the code against that one device without allocating another slot.
  select d.*
    into v_device
    from public.dealer_devices d
    where d.dealer_id = v_code.dealer_id
      and d.status = 'approved'
      and d.device_token_hash = crypt(trim(p_device_token), d.device_token_hash)
    order by d.created_at desc
    limit 1
    for update;

  if found then
    v_device_id := v_device.id;
    update public.dealer_devices
       set last_seen = v_now,
           updated_at = v_now
     where id = v_device_id;
  else
    select count(*)
      into v_approved_devices
      from public.dealer_devices d
      where d.dealer_id = v_code.dealer_id
        and d.status = 'approved';

    if v_approved_devices >= v_max_devices then
      return query select 'device_limit_reached'::text, null::text;
      return;
    end if;

    insert into public.dealer_devices (
      dealer_id,
      device_token_hash,
      status,
      device_label,
      browser_info,
      approved_at,
      updated_at
    ) values (
      v_code.dealer_id,
      crypt(trim(p_device_token), gen_salt('bf', 10)),
      'approved',
      nullif(left(trim(coalesce(p_device_label, '')), 160), ''),
      nullif(left(trim(coalesce(p_browser_info, '')), 240), ''),
      v_now,
      v_now
    ) returning id into v_device_id;
  end if;

  update public.dealer_access_codes c
     set use_count = 1,
         status = 'disabled',
         redeemed_device_id = v_device_id,
         redeemed_at = v_now,
         updated_at = v_now
   where c.id = v_code.id;

  insert into public.audit_logs (
    dealer_id,
    actor_profile_id,
    actor_role,
    action_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_code.dealer_id,
    null,
    null,
    'dealer_device_auto_approved',
    'dealer_devices',
    v_device_id::text,
    jsonb_build_object('accessCodeId', v_code.id, 'automatic', true)
  );

  return query select 'approved'::text, v_code.dealer_id;
exception
  when others then
    -- The exception block rolls back this function's statements before a safe
    -- response is returned. Raw database details never reach the public UI.
    return query select 'activation_failed'::text, null::text;
end;
$$;

revoke all on function public.plotmap_activate_device(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_activate_device(text, text, text, text)
  to anon, authenticated;

-- Legacy rows remain readable through their lookup/admin RPCs, but all new
-- browser redemptions must use the atomic auto-approval function above.
revoke all on function public.plotmap_submit_activation_request(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
