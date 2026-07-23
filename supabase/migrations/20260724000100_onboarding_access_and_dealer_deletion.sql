-- ============================================================
-- PlotMap - onboarding access reasons and permanent dealer deletion
-- Additive migration. STAGING FIRST.
--
-- This migration adds:
--   1. a read-only, token-bound device access reason RPC that never creates
--      a pending device row; and
--   2. a platform-admin-only dealer purge RPC used by the delete-dealer
--      Edge Function for permanent deletion.
--
-- Permanent deletion is destructive. The RPC serializes attempts, requires
-- exact dealer confirmation, blocks deletion of a platform-admin dealer,
-- purges known dealer-owned rows and photo objects, and retains a deny-all
-- tombstone so interrupted Auth cleanup can be retried safely.
-- ============================================================

create extension if not exists pgcrypto;

-- Client-safe reason lookup. A caller must possess a device token already
-- stored for the requested dealer before account state is disclosed.
create or replace function public.plotmap_device_access_reason(
  p_dealer_id text,
  p_device_token text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_dealer text := lower(trim(coalesce(p_dealer_id, '')));
  v_device_status text;
  v_account_status text;
  v_subscription_status text;
  v_trial_end timestamptz;
  v_expiry_date timestamptz;
begin
  if v_dealer = ''
     or p_device_token is null
     or length(trim(p_device_token)) < 32
     or octet_length(trim(p_device_token)) > 512 then
    return 'device_not_activated';
  end if;

  select d.status
    into v_device_status
    from public.dealer_devices d
    where d.dealer_id = v_dealer
      and d.device_token_hash = crypt(trim(p_device_token), d.device_token_hash)
    order by
      case d.status when 'approved' then 0 when 'revoked' then 1 when 'rejected' then 2 else 3 end,
      d.created_at desc
    limit 1;

  -- Do not reveal whether an arbitrary dealer exists or why it is inactive.
  if not found then
    return 'device_not_activated';
  end if;

  select
    coalesce(d.account_status, 'active'),
    coalesce(d.subscription_status, 'trial'),
    d.trial_end,
    d.expiry_date
    into v_account_status, v_subscription_status, v_trial_end, v_expiry_date
    from public.dealer_settings d
    where d.dealer_id = v_dealer;

  if not found then
    return 'account_blocked';
  end if;

  if v_account_status = 'suspended' then
    return 'account_suspended';
  end if;

  if v_subscription_status = 'trial'
     and (v_account_status = 'expired'
       or (v_trial_end is not null and v_trial_end < timezone('utc'::text, now()))) then
    return 'trial_expired';
  end if;

  if v_account_status <> 'active'
     or (v_subscription_status in ('active', 'paid')
       and v_expiry_date is not null
       and v_expiry_date < timezone('utc'::text, now())) then
    return 'account_blocked';
  end if;

  if v_device_status in ('revoked', 'rejected') then
    return 'device_revoked';
  end if;

  if v_device_status = 'approved' then
    return 'approved';
  end if;

  return 'device_not_activated';
end;
$$;

revoke all on function public.plotmap_device_access_reason(text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_device_access_reason(text, text)
  to anon, authenticated;

-- Durable, platform-level deletion tombstone. No table policy is created;
-- normal clients cannot read or modify these rows.
create table if not exists public.dealer_deletion_log (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  dealer_id text not null unique,
  deleted_by uuid,
  summary jsonb not null default '{}'::jsonb,
  auth_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.dealer_deletion_log enable row level security;
revoke all on public.dealer_deletion_log from public, anon, authenticated;

create index if not exists dealer_deletion_log_created_idx
  on public.dealer_deletion_log (created_at desc);

create or replace function public.plotmap_admin_delete_dealer(
  p_dealer_id text,
  p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dealer text := lower(trim(coalesce(p_dealer_id, '')));
  v_admin uuid := auth.uid();
  v_brand text;
  v_photo_bucket text;
  v_confirm text := lower(trim(coalesce(p_confirm, '')));
  v_auth_ids uuid[] := '{}';
  v_summary jsonb := '{}'::jsonb;
  v_op uuid := gen_random_uuid();
  v_n bigint;
  v_existing public.dealer_deletion_log%rowtype;
  -- Child tables precede their referenced parents. Each table is guarded so
  -- the migration remains compatible with installations missing an optional
  -- feature table.
  v_tables text[] := array[
    'presentation_events',
    'map_overlays',
    'prebuilt_maps',
    'plotmap_daily_usage',
    'crm_records',
    'audit_logs',
    'share_links',
    'dealer_activation_requests',
    'dealer_access_codes',
    'dealer_devices',
    'dealer_passcodes',
    'dealer_provisioning_attempts'
  ];
  v_t text;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  if v_dealer = '' then
    raise exception 'dealer id required';
  end if;

  perform pg_advisory_xact_lock(hashtext('plotmap:delete:dealer:' || v_dealer));

  -- A repeat request must still use exact dealer-id confirmation. The brand
  -- no longer exists after deletion, so it cannot be accepted on retries.
  if not exists (
    select 1 from public.dealer_settings d where d.dealer_id = v_dealer
  ) then
    if v_confirm <> v_dealer then
      raise exception 'confirmation mismatch';
    end if;

    select *
      into v_existing
      from public.dealer_deletion_log l
      where l.dealer_id = v_dealer
      limit 1;

    if found then
      return jsonb_build_object(
        'dealer_id', v_dealer,
        'already_deleted', true,
        'operation_id', v_existing.operation_id,
        'deleted', v_existing.summary,
        'auth_user_ids', to_jsonb(v_existing.auth_user_ids)
      );
    end if;

    raise exception 'unknown dealer';
  end if;

  select d.brand_name, d.photo_bucket
    into v_brand, v_photo_bucket
    from public.dealer_settings d
    where d.dealer_id = v_dealer;

  if v_confirm <> v_dealer
     and v_confirm <> lower(trim(coalesce(v_brand, ''))) then
    raise exception 'confirmation mismatch';
  end if;

  -- Never remove a dealer that owns a platform-admin profile. This preserves
  -- both the Auth user and the profile/platform_admins chain and prevents the
  -- only platform administrator from being stranded by a dealer purge.
  if exists (
    select 1
    from public.profiles p
    join public.platform_admins pa on pa.profile_id = p.id
    where p.dealer_id = v_dealer
  ) then
    raise exception 'dealer contains a protected platform administrator';
  end if;

  select coalesce(array_agg(p.id), '{}')
    into v_auth_ids
    from public.profiles p
    where p.dealer_id = v_dealer
      and p.id is not null
      and p.id <> v_admin
      and not exists (
        select 1 from public.platform_admins pa where pa.profile_id = p.id
      );

  -- Remove private property photos under the exact dealer path. Bucket and
  -- object paths are server-owned; no client-supplied path is accepted.
  if to_regclass('storage.objects') is not null then
    execute $storage$
      delete from storage.objects
      where (bucket_id = 'property-photos' or bucket_id = nullif($2, ''))
        and (storage.foldername(name))[1] = 'dealers'
        and (storage.foldername(name))[2] = $1
    $storage$
    using v_dealer, v_photo_bucket;
    get diagnostics v_n = row_count;
    v_summary := v_summary || jsonb_build_object('property_photo_objects', v_n);
  end if;

  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null then
      execute format('delete from public.%I where dealer_id = $1', v_t)
        using v_dealer;
      get diagnostics v_n = row_count;
      v_summary := v_summary || jsonb_build_object(v_t, v_n);
    end if;
  end loop;

  -- Delete only the profiles whose Auth ids were approved for removal above.
  -- This is deliberately not a blanket dealer_id delete.
  delete from public.profiles
  where dealer_id = v_dealer
    and id = any(v_auth_ids);
  get diagnostics v_n = row_count;
  v_summary := v_summary || jsonb_build_object('profiles', v_n);

  delete from public.dealer_settings where dealer_id = v_dealer;
  get diagnostics v_n = row_count;
  v_summary := v_summary || jsonb_build_object('dealer_settings', v_n);

  insert into public.dealer_deletion_log (
    operation_id, dealer_id, deleted_by, summary, auth_user_ids
  ) values (
    v_op, v_dealer, v_admin, v_summary, v_auth_ids
  );

  return jsonb_build_object(
    'dealer_id', v_dealer,
    'already_deleted', false,
    'operation_id', v_op,
    'deleted', v_summary,
    'auth_user_ids', to_jsonb(v_auth_ids)
  );
end;
$$;

revoke all on function public.plotmap_admin_delete_dealer(text, text)
  from public, anon, authenticated;
grant execute on function public.plotmap_admin_delete_dealer(text, text)
  to authenticated;

-- Rollout order:
--   1. Transactional dry run on staging.
--   2. Apply on staging and deploy delete-dealer.
--   3. Verify authorization, isolation, full purge, Auth cleanup retry and
--      idempotency with temporary staging dealers.
--   4. Only after staging passes, repeat the controlled rollout in production.
