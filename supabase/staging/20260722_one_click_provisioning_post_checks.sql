-- One-click provisioning staging post-checks.
-- Read-only except for temporary transaction-local assertions.

do $plotmap_checks$
declare
  v_rls boolean;
  v_policy_count integer;
  v_definer_count integer;
begin
  select c.relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'dealer_provisioning_attempts';
  if coalesce(v_rls, false) is not true then
    raise exception 'PLOTMAP_PROVISIONING_RLS_NOT_ENABLED';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'dealer_provisioning_attempts';
  if v_policy_count <> 0 then
    raise exception 'PLOTMAP_PROVISIONING_TABLE_MUST_BE_DENY_ALL';
  end if;

  if has_table_privilege('anon', 'public.dealer_provisioning_attempts', 'select')
     or has_table_privilege('authenticated', 'public.dealer_provisioning_attempts', 'select') then
    raise exception 'PLOTMAP_PROVISIONING_TABLE_GRANT_LEAK';
  end if;

  if has_function_privilege('anon', 'public.plotmap_admin_begin_dealer_provisioning(text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,timestamptz,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.plotmap_admin_begin_dealer_provisioning(text,text,text,text,text,text,text,text,text,text,timestamptz,timestamptz,integer,timestamptz,text)', 'execute') then
    raise exception 'PLOTMAP_PROVISIONING_BEGIN_GRANT_INVALID';
  end if;

  if has_function_privilege('anon', 'public.plotmap_service_auth_user_by_email(text)', 'execute')
     or has_function_privilege('authenticated', 'public.plotmap_service_auth_user_by_email(text)', 'execute')
     or not has_function_privilege('service_role', 'public.plotmap_service_auth_user_by_email(text)', 'execute') then
    raise exception 'PLOTMAP_SERVICE_AUTH_LOOKUP_GRANT_INVALID';
  end if;

  if has_function_privilege('anon', 'public.plotmap_admin_create_dealer_activation_code(text,text,text,integer,timestamptz)', 'execute')
     or not has_function_privilege('authenticated', 'public.plotmap_admin_create_dealer_activation_code(text,text,text,integer,timestamptz)', 'execute') then
    raise exception 'PLOTMAP_DEALER_CODE_GRANT_INVALID';
  end if;

  if has_function_privilege('authenticated', 'public.plotmap_admin_create_activation_code(text,text,integer,timestamptz)', 'execute') then
    raise exception 'PLOTMAP_OLD_UNSCOPED_CODE_RPC_STILL_EXECUTABLE';
  end if;

  if not has_function_privilege('anon', 'public.plotmap_submit_activation_request(text,text,text,text,text,text,text,text)', 'execute')
     or not has_function_privilege('anon', 'public.plotmap_activation_request_status(uuid,text)', 'execute') then
    raise exception 'PLOTMAP_PUBLIC_DEVICE_REQUEST_GRANT_MISSING';
  end if;

  select count(*) into v_definer_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'plotmap_admin_begin_dealer_provisioning',
      'plotmap_service_auth_user_by_email',
      'plotmap_admin_mark_dealer_provisioning_auth',
      'plotmap_admin_get_dealer_provisioning_attempt',
      'plotmap_admin_fail_dealer_provisioning',
      'plotmap_admin_finalize_dealer_provisioning',
      'plotmap_admin_create_dealer_activation_code',
      'plotmap_submit_activation_request',
      'plotmap_admin_approve_activation_request'
    )
    and p.prosecdef;
  if v_definer_count <> 9 then
    raise exception 'PLOTMAP_PROVISIONING_SECURITY_DEFINER_COUNT_INVALID';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dealer_access_codes' and column_name = 'dealer_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dealer_access_codes' and column_name = 'provisioning_attempt_id'
  ) then
    raise exception 'PLOTMAP_DEALER_CODE_SCOPE_COLUMNS_MISSING';
  end if;

  if exists (
    select 1 from public.profiles
    where email is not null
    group by lower(email)
    having count(*) > 1
  ) then
    raise exception 'PLOTMAP_DUPLICATE_PROFILE_EMAIL';
  end if;

  if exists (
    select 1 from public.dealer_activation_requests
    where status = 'pending' and dealer_id is null
  ) then
    raise exception 'PLOTMAP_UNSCOPED_PENDING_ACTIVATION';
  end if;

  if exists (
    select 1 from public.dealer_access_codes
    where dealer_id is null
      and status = 'active'
      and (expires_at is null or expires_at > timezone('utc'::text, now()))
  ) then
    raise exception 'PLOTMAP_UNSCOPED_ACTIVE_ACTIVATION_CODE';
  end if;
end;
$plotmap_checks$;

select 'PLOTMAP_ONE_CLICK_POST_CHECKS_PASSED' as result;
