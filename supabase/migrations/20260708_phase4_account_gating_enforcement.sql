-- ============================================================
-- PlotMap - Phase 4 account gating enforcement
-- REVIEWED DRAFT. APPLY ONLY VIA THE RUN ORDER IN THE PHASE 4 AUDIT REPORT.
--
-- Purpose:
--   Backend-enforce suspended/expired account write blocking, plan limits,
--   and provider-only account/plan/status changes.
--
-- Safety:
--   - No DROP TABLE / DROP DATABASE / DELETE FROM / TRUNCATE.
--   - No using(true) or with check(true) on private tables.
--   - Does not weaken Phase 2 anon lockdown.
--   - Normal dealer users do not get cross-dealer access.
-- ============================================================

-- ---------- platform admin registry ----------
create table if not exists public.platform_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled')),
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.platform_admins enable row level security;

drop policy if exists "plotmap platform admins self read" on public.platform_admins;
create policy "plotmap platform admins self read"
on public.platform_admins
for select
to authenticated
using (profile_id = auth.uid());

grant select on public.platform_admins to authenticated;

create or replace function public.plotmap_is_platform_admin()
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
    where a.profile_id = auth.uid()
      and a.status = 'active'
      and p.status = 'active'
      and p.role = 'owner'
  );
$$;

-- ---------- normalized billing/account fields ----------
alter table public.dealer_settings
  add column if not exists paid boolean not null default false,
  add column if not exists expiry_date timestamptz,
  add column if not exists renewal_reminder timestamptz,
  add column if not exists payment_proof_link text,
  add column if not exists payment_notes text;

alter table public.dealer_settings drop constraint if exists dealer_settings_account_status_check;
alter table public.dealer_settings add constraint dealer_settings_account_status_check
  check (account_status in ('active', 'suspended', 'expired'));

alter table public.dealer_settings drop constraint if exists dealer_settings_subscription_status_check;
alter table public.dealer_settings add constraint dealer_settings_subscription_status_check
  check (subscription_status in ('trial', 'active', 'paid', 'past_due', 'expired'));

-- Active means the dealer is allowed to serve Client Presentation and accept
-- presentation events. Expired trials/plans are not active.
create or replace function public.plotmap_dealer_is_active(p_dealer_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_settings d
    where d.dealer_id = p_dealer_id
      and coalesce(d.account_status, 'active') = 'active'
      and (
        (
          coalesce(d.subscription_status, 'trial') = 'trial'
          and (d.trial_end is null or d.trial_end >= timezone('utc'::text, now()))
        )
        or (
          coalesce(d.subscription_status, 'trial') in ('active', 'paid')
          and (d.expiry_date is null or d.expiry_date >= timezone('utc'::text, now()))
        )
      )
  );
$$;

create or replace function public.plotmap_dealer_can_write(p_dealer_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_dealer_is_active(p_dealer_id);
$$;

create or replace function public.plotmap_can_insert_property(p_dealer_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_dealer_can_write(p_dealer_id)
     and (
       select count(*)
       from public.crm_records r
       where r.dealer_id = p_dealer_id
         and r.entity_type = 'properties'
         and coalesce(r.deleted, false) = false
     ) < coalesce((
       select d.max_properties
       from public.dealer_settings d
       where d.dealer_id = p_dealer_id
     ), 500);
$$;

create or replace function public.plotmap_can_insert_prebuilt_map(p_dealer_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_dealer_can_write(p_dealer_id)
     and (
       select count(*)
       from public.prebuilt_maps m
       where m.dealer_id = p_dealer_id
     ) < coalesce((
       select d.max_maps
       from public.dealer_settings d
       where d.dealer_id = p_dealer_id
     ), 10);
$$;

create or replace function public.plotmap_can_insert_team_member(p_dealer_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_dealer_can_write(p_dealer_id)
     and (
       select count(*)
       from public.profiles p
       where p.dealer_id = p_dealer_id
         and p.status = 'active'
     ) < coalesce((
       select d.max_team_members
       from public.dealer_settings d
       where d.dealer_id = p_dealer_id
     ), 5);
$$;

-- ---------- provider-only account status RPCs ----------
create or replace function public.plotmap_admin_set_dealer_account(
  p_dealer_id text,
  p_account_status text,
  p_subscription_status text default null,
  p_trial_end timestamptz default null,
  p_expiry_date timestamptz default null,
  p_plan_code text default null,
  p_paid boolean default null,
  p_seat_limit integer default null,
  p_max_maps integer default null,
  p_max_properties integer default null,
  p_max_team_members integer default null,
  p_payment_notes text default null
)
returns public.dealer_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.dealer_settings;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;

  if p_account_status not in ('active', 'suspended', 'expired') then
    raise exception 'invalid account status';
  end if;

  if p_subscription_status is not null
     and p_subscription_status not in ('trial', 'active', 'paid', 'past_due', 'expired') then
    raise exception 'invalid subscription status';
  end if;

  insert into public.dealer_settings (
    dealer_id,
    account_status,
    subscription_status,
    trial_end,
    expiry_date,
    plan_code,
    paid,
    seat_limit,
    max_maps,
    max_properties,
    max_team_members,
    payment_notes,
    updated_at
  )
  values (
    p_dealer_id,
    p_account_status,
    coalesce(p_subscription_status, 'trial'),
    p_trial_end,
    p_expiry_date,
    p_plan_code,
    coalesce(p_paid, false),
    coalesce(p_seat_limit, 5),
    coalesce(p_max_maps, 10),
    coalesce(p_max_properties, 500),
    coalesce(p_max_team_members, 5),
    p_payment_notes,
    timezone('utc'::text, now())
  )
  on conflict (dealer_id) do update set
    account_status = excluded.account_status,
    subscription_status = coalesce(p_subscription_status, public.dealer_settings.subscription_status),
    trial_end = coalesce(p_trial_end, public.dealer_settings.trial_end),
    expiry_date = coalesce(p_expiry_date, public.dealer_settings.expiry_date),
    plan_code = coalesce(p_plan_code, public.dealer_settings.plan_code),
    paid = coalesce(p_paid, public.dealer_settings.paid),
    seat_limit = coalesce(p_seat_limit, public.dealer_settings.seat_limit),
    max_maps = coalesce(p_max_maps, public.dealer_settings.max_maps),
    max_properties = coalesce(p_max_properties, public.dealer_settings.max_properties),
    max_team_members = coalesce(p_max_team_members, public.dealer_settings.max_team_members),
    payment_notes = coalesce(p_payment_notes, public.dealer_settings.payment_notes),
    updated_at = timezone('utc'::text, now())
  returning * into v_row;

  insert into public.audit_logs (
    dealer_id,
    actor_profile_id,
    actor_role,
    action_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_dealer_id,
    auth.uid(),
    public.plotmap_current_role(),
    'dealer_account_status_set',
    'dealer_settings',
    p_dealer_id,
    jsonb_build_object(
      'accountStatus', p_account_status,
      'subscriptionStatus', p_subscription_status,
      'planCode', p_plan_code
    )
  );

  return v_row;
end;
$$;

grant execute on function public.plotmap_admin_set_dealer_account(
  text, text, text, timestamptz, timestamptz, text, boolean, integer, integer, integer, integer, text
) to authenticated;

create or replace function public.plotmap_admin_list_dealer_accounts()
returns table (
  dealer_id text,
  brand_name text,
  account_status text,
  subscription_status text,
  trial_end timestamptz,
  expiry_date timestamptz,
  plan_code text,
  paid boolean,
  seat_limit integer,
  max_maps integer,
  max_properties integer,
  max_team_members integer,
  updated_at timestamptz
)
language plpgsql
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
    d.account_status,
    d.subscription_status,
    d.trial_end,
    d.expiry_date,
    d.plan_code,
    d.paid,
    d.seat_limit,
    d.max_maps,
    d.max_properties,
    d.max_team_members,
    d.updated_at
  from public.dealer_settings d
  order by d.updated_at desc nulls last, d.dealer_id asc;
end;
$$;

grant execute on function public.plotmap_admin_list_dealer_accounts() to authenticated;

-- ---------- guard normal dealer settings writes ----------
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

drop trigger if exists plotmap_dealer_settings_account_guard on public.dealer_settings;
create trigger plotmap_dealer_settings_account_guard
  before update on public.dealer_settings
  for each row execute function public.plotmap_guard_dealer_settings_account_columns();

create or replace function public.plotmap_guard_crm_dealer_settings_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := coalesce(new.payload, '{}'::jsonb);
begin
  if tg_op = 'INSERT' and new.entity_type <> 'dealerSettings' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(new.entity_type, old.entity_type) <> 'dealerSettings' then
    return new;
  end if;

  if public.plotmap_is_platform_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' and (
       v_new ? 'accountStatus'
    or v_new ? 'subscriptionStatus'
    or v_new ? 'planCode'
    or v_new ? 'trialEnd'
    or v_new ? 'expiryDate'
    or v_new ? 'renewalReminder'
    or v_new ? 'paid'
    or v_new ? 'paymentProofLink'
    or v_new ? 'paymentNotes'
    or v_new ? 'storageEnabled'
    or v_new ? 'seatLimit'
    or v_new ? 'seatCount'
    or v_new ? 'maxMaps'
    or v_new ? 'maxProperties'
    or v_new ? 'maxTeamMembers'
  ) then
    raise exception 'account, storage, and plan fields are provider-only';
  end if;

  if tg_op = 'UPDATE' then
    v_old := coalesce(old.payload, '{}'::jsonb);
  end if;

  if tg_op = 'UPDATE' and (
       v_new->'accountStatus' is distinct from v_old->'accountStatus'
    or v_new->'subscriptionStatus' is distinct from v_old->'subscriptionStatus'
    or v_new->'planCode' is distinct from v_old->'planCode'
    or v_new->'trialEnd' is distinct from v_old->'trialEnd'
    or v_new->'expiryDate' is distinct from v_old->'expiryDate'
    or v_new->'renewalReminder' is distinct from v_old->'renewalReminder'
    or v_new->'paid' is distinct from v_old->'paid'
    or v_new->'paymentProofLink' is distinct from v_old->'paymentProofLink'
    or v_new->'paymentNotes' is distinct from v_old->'paymentNotes'
    or v_new->'storageEnabled' is distinct from v_old->'storageEnabled'
    or v_new->'seatLimit' is distinct from v_old->'seatLimit'
    or v_new->'seatCount' is distinct from v_old->'seatCount'
    or v_new->'maxMaps' is distinct from v_old->'maxMaps'
    or v_new->'maxProperties' is distinct from v_old->'maxProperties'
    or v_new->'maxTeamMembers' is distinct from v_old->'maxTeamMembers'
  ) then
    raise exception 'account, storage, and plan fields are provider-only';
  end if;

  return new;
end;
$$;

drop trigger if exists plotmap_crm_dealer_settings_payload_guard on public.crm_records;
create trigger plotmap_crm_dealer_settings_payload_guard
  before insert or update on public.crm_records
  for each row execute function public.plotmap_guard_crm_dealer_settings_payload();

-- ---------- rewrite write policies with account gates ----------
drop policy if exists "plotmap crm properties insert" on public.crm_records;
drop policy if exists "plotmap crm properties update" on public.crm_records;
drop policy if exists "plotmap crm properties delete" on public.crm_records;
drop policy if exists "plotmap crm other insert" on public.crm_records;
drop policy if exists "plotmap crm other update" on public.crm_records;
drop policy if exists "plotmap crm other delete" on public.crm_records;

create policy "plotmap crm properties insert"
on public.crm_records
for insert
to authenticated
with check (
  public.plotmap_can_edit_properties()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type = 'properties'
  and public.plotmap_can_insert_property(dealer_id)
);

create policy "plotmap crm properties update"
on public.crm_records
for update
to authenticated
using (
  public.plotmap_can_edit_properties()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type = 'properties'
  and public.plotmap_dealer_can_write(dealer_id)
)
with check (
  public.plotmap_can_edit_properties()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type = 'properties'
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap crm properties delete"
on public.crm_records
for delete
to authenticated
using (
  public.plotmap_can_edit_properties()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type = 'properties'
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap crm other insert"
on public.crm_records
for insert
to authenticated
with check (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type <> 'properties'
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap crm other update"
on public.crm_records
for update
to authenticated
using (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type <> 'properties'
  and public.plotmap_dealer_can_write(dealer_id)
)
with check (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type <> 'properties'
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap crm other delete"
on public.crm_records
for delete
to authenticated
using (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type <> 'properties'
  and public.plotmap_dealer_can_write(dealer_id)
);

drop policy if exists "plotmap overlays maps insert" on public.map_overlays;
drop policy if exists "plotmap overlays maps update" on public.map_overlays;
drop policy if exists "plotmap overlays maps delete" on public.map_overlays;

create policy "plotmap overlays maps insert"
on public.map_overlays
for insert
to authenticated
with check (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap overlays maps update"
on public.map_overlays
for update
to authenticated
using (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
)
with check (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap overlays maps delete"
on public.map_overlays
for delete
to authenticated
using (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

drop policy if exists "plotmap prebuilt maps insert" on public.prebuilt_maps;
drop policy if exists "plotmap prebuilt maps update" on public.prebuilt_maps;
drop policy if exists "plotmap prebuilt maps delete" on public.prebuilt_maps;

create policy "plotmap prebuilt maps insert"
on public.prebuilt_maps
for insert
to authenticated
with check (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_can_insert_prebuilt_map(dealer_id)
);

create policy "plotmap prebuilt maps update"
on public.prebuilt_maps
for update
to authenticated
using (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
)
with check (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap prebuilt maps delete"
on public.prebuilt_maps
for delete
to authenticated
using (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

drop policy if exists "plotmap dealer settings insert" on public.dealer_settings;
drop policy if exists "plotmap dealer settings update" on public.dealer_settings;
drop policy if exists "plotmap dealer settings delete" on public.dealer_settings;

create policy "plotmap dealer settings insert"
on public.dealer_settings
for insert
to authenticated
with check (
  public.plotmap_is_platform_admin()
);

create policy "plotmap dealer settings update"
on public.dealer_settings
for update
to authenticated
using (
  dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_can_manage_settings()
  and public.plotmap_dealer_can_write(dealer_id)
)
with check (
  dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_can_manage_settings()
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap dealer settings delete"
on public.dealer_settings
for delete
to authenticated
using (
  public.plotmap_is_platform_admin()
);

drop policy if exists "plotmap share links insert" on public.share_links;
drop policy if exists "plotmap share links update" on public.share_links;
drop policy if exists "plotmap share links delete" on public.share_links;

create policy "plotmap share links insert"
on public.share_links
for insert
to authenticated
with check (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap share links update"
on public.share_links
for update
to authenticated
using (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
)
with check (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap share links delete"
on public.share_links
for delete
to authenticated
using (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

drop policy if exists "plotmap audit logs writer insert" on public.audit_logs;
create policy "plotmap audit logs writer insert"
on public.audit_logs
for insert
to authenticated
with check (
  (
    public.plotmap_can_edit_properties()
    or public.plotmap_can_edit_crm()
    or public.plotmap_can_edit_maps()
    or public.plotmap_can_manage_settings()
  )
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

drop policy if exists "profiles owner dealer insert" on public.profiles;
drop policy if exists "profiles owner dealer update" on public.profiles;

create policy "profiles owner dealer insert"
on public.profiles
for insert
to authenticated
with check (
  public.plotmap_can_manage_team()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_can_insert_team_member(dealer_id)
  and role in ('manager', 'map_editor', 'property_editor', 'viewer')
  and status in ('active', 'blocked', 'disabled', 'suspended', 'removed')
);

create policy "profiles owner dealer update"
on public.profiles
for update
to authenticated
using (
  public.plotmap_can_manage_team()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
)
with check (
  public.plotmap_can_manage_team()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
  and role in ('owner', 'manager', 'map_editor', 'property_editor', 'viewer')
  and status in ('active', 'blocked', 'disabled', 'suspended', 'removed')
);
