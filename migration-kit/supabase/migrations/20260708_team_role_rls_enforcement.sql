-- ============================================================
-- PlotMap - Team Role RLS Enforcement
-- Phase 3 corrected migration. REVIEW BEFORE APPLYING.
--
-- Purpose:
--   Replace coarse "any staff can write anything in their dealer" RLS
--   with backend-enforced per-role capabilities.
--
-- Safety:
--   - No DROP TABLE / DROP DATABASE / DELETE FROM / TRUNCATE.
--   - No using(true) or with check(true) on private tables.
--   - Does not weaken Phase 2 anon lockdown or Client Presentation RPCs.
--   - Owner profile remains self-readable; owner role remains full-control
--     within the owner's dealer.
-- ============================================================

-- ---------- compatibility constraints ----------
-- Keep legacy "team" accepted so existing rows do not make the migration fail.
-- It is not granted write capabilities below; reclassify team rows to one of
-- manager/map_editor/property_editor/viewer before relying on Phase 3 in live use.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'team', 'manager', 'map_editor', 'property_editor', 'viewer'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'blocked', 'disabled', 'suspended', 'removed'));

-- Ensure settings columns referenced by the billing/account guard exist even
-- if dealer_settings was created before the SaaS scaffold.
alter table public.dealer_settings
  add column if not exists billing_email text,
  add column if not exists storage_enabled boolean not null default false,
  add column if not exists plan_code text,
  add column if not exists subscription_status text not null default 'trial',
  add column if not exists account_status text not null default 'active',
  add column if not exists trial_start timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists seat_limit integer not null default 5,
  add column if not exists seat_count integer not null default 1,
  add column if not exists max_maps integer not null default 10,
  add column if not exists max_properties integer not null default 500,
  add column if not exists max_team_members integer not null default 5;

-- ---------- role helpers ----------
create or replace function public.plotmap_current_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.status from public.profiles p where p.id = auth.uid()), '');
$$;

create or replace function public.plotmap_is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() in ('owner', 'manager', 'map_editor', 'property_editor', 'viewer', 'team')
     and public.plotmap_current_status() = 'active';
$$;

create or replace function public.plotmap_can_edit_properties()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() in ('owner', 'manager', 'property_editor')
     and public.plotmap_current_status() = 'active';
$$;

create or replace function public.plotmap_can_edit_crm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() in ('owner', 'manager')
     and public.plotmap_current_status() = 'active';
$$;

create or replace function public.plotmap_can_edit_maps()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() in ('owner', 'manager', 'map_editor')
     and public.plotmap_current_status() = 'active';
$$;

create or replace function public.plotmap_can_manage_settings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() in ('owner', 'manager')
     and public.plotmap_current_status() = 'active';
$$;

create or replace function public.plotmap_can_manage_billing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() = 'owner'
     and public.plotmap_current_status() = 'active';
$$;

create or replace function public.plotmap_can_manage_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() = 'owner'
     and public.plotmap_current_status() = 'active';
$$;

-- Keep the older helper aligned so any remaining code/policies that reference
-- plotmap_is_staff() no longer grant broad editor writes.
create or replace function public.plotmap_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.plotmap_current_role() in ('owner', 'manager', 'map_editor', 'property_editor')
     and public.plotmap_current_status() = 'active';
$$;

-- ---------- guard triggers ----------
create or replace function public.plotmap_guard_dealer_settings_account_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and not public.plotmap_can_manage_billing()
     and (
       new.billing_email is distinct from old.billing_email
       or new.storage_enabled is distinct from old.storage_enabled
       or new.plan_code is distinct from old.plan_code
       or new.subscription_status is distinct from old.subscription_status
       or new.account_status is distinct from old.account_status
       or new.trial_start is distinct from old.trial_start
       or new.trial_end is distinct from old.trial_end
       or new.seat_limit is distinct from old.seat_limit
       or new.seat_count is distinct from old.seat_count
       or new.max_maps is distinct from old.max_maps
       or new.max_properties is distinct from old.max_properties
       or new.max_team_members is distinct from old.max_team_members
     ) then
    raise exception 'billing/account columns are owner-only';
  end if;

  return new;
end;
$$;

drop trigger if exists plotmap_dealer_settings_account_guard on public.dealer_settings;
create trigger plotmap_dealer_settings_account_guard
  before update on public.dealer_settings
  for each row execute function public.plotmap_guard_dealer_settings_account_columns();

create or replace function public.plotmap_guard_profile_team_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_active_owner_count integer;
begin
  if new.id is distinct from old.id then
    raise exception 'profile id cannot be changed';
  end if;

  if new.dealer_id is distinct from old.dealer_id then
    raise exception 'profile dealer_id cannot be changed';
  end if;

  if old.id = auth.uid()
     and (
       new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.dealer_id is distinct from old.dealer_id
     ) then
    raise exception 'owners cannot change their own role, status, or dealer';
  end if;

  if old.email = 'rachitchaurasia17@gmail.com'
     and old.dealer_id = 'dealer-demo'
     and (
       new.role is distinct from 'owner'
       or new.status is distinct from 'active'
       or new.dealer_id is distinct from 'dealer-demo'
     ) then
    raise exception 'primary PlotMap owner cannot be locked out';
  end if;

  if old.role = 'owner'
     and old.status = 'active'
     and (new.role is distinct from 'owner' or new.status is distinct from 'active') then
    select count(*)
      into v_other_active_owner_count
      from public.profiles p
      where p.dealer_id = old.dealer_id
        and p.id <> old.id
        and p.role = 'owner'
        and p.status = 'active';

    if coalesce(v_other_active_owner_count, 0) = 0 then
      raise exception 'cannot remove the last active owner for this dealer';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists plotmap_profile_team_update_guard on public.profiles;
create trigger plotmap_profile_team_update_guard
  before update on public.profiles
  for each row execute function public.plotmap_guard_profile_team_update();

-- ---------- crm_records ----------
drop policy if exists "plotmap crm read" on public.crm_records;
drop policy if exists "plotmap crm write" on public.crm_records;
drop policy if exists "plotmap crm admin all" on public.crm_records;
drop policy if exists "plotmap crm member read" on public.crm_records;
drop policy if exists "plotmap crm properties insert" on public.crm_records;
drop policy if exists "plotmap crm properties update" on public.crm_records;
drop policy if exists "plotmap crm properties delete" on public.crm_records;
drop policy if exists "plotmap crm other insert" on public.crm_records;
drop policy if exists "plotmap crm other update" on public.crm_records;
drop policy if exists "plotmap crm other delete" on public.crm_records;

create policy "plotmap crm member read"
on public.crm_records
for select
to authenticated
using (
  public.plotmap_is_active_member()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap crm properties insert"
on public.crm_records
for insert
to authenticated
with check (
  public.plotmap_can_edit_properties()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type = 'properties'
);

create policy "plotmap crm properties update"
on public.crm_records
for update
to authenticated
using (
  public.plotmap_can_edit_properties()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type = 'properties'
)
with check (
  public.plotmap_can_edit_properties()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type = 'properties'
);

create policy "plotmap crm properties delete"
on public.crm_records
for delete
to authenticated
using (
  public.plotmap_can_edit_properties()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type = 'properties'
);

create policy "plotmap crm other insert"
on public.crm_records
for insert
to authenticated
with check (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type <> 'properties'
);

create policy "plotmap crm other update"
on public.crm_records
for update
to authenticated
using (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type <> 'properties'
)
with check (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type <> 'properties'
);

create policy "plotmap crm other delete"
on public.crm_records
for delete
to authenticated
using (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and entity_type <> 'properties'
);

-- ---------- map_overlays ----------
drop policy if exists "plotmap overlays read" on public.map_overlays;
drop policy if exists "plotmap overlays write" on public.map_overlays;
drop policy if exists "plotmap overlays admin all" on public.map_overlays;
drop policy if exists "plotmap overlays member read" on public.map_overlays;
drop policy if exists "plotmap overlays maps insert" on public.map_overlays;
drop policy if exists "plotmap overlays maps update" on public.map_overlays;
drop policy if exists "plotmap overlays maps delete" on public.map_overlays;

create policy "plotmap overlays member read"
on public.map_overlays
for select
to authenticated
using (
  public.plotmap_is_active_member()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap overlays maps insert"
on public.map_overlays
for insert
to authenticated
with check (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap overlays maps update"
on public.map_overlays
for update
to authenticated
using (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
)
with check (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap overlays maps delete"
on public.map_overlays
for delete
to authenticated
using (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
);

-- ---------- prebuilt_maps ----------
drop policy if exists "plotmap prebuilt admin all" on public.prebuilt_maps;
drop policy if exists "plotmap prebuilt member read" on public.prebuilt_maps;
drop policy if exists "plotmap prebuilt maps insert" on public.prebuilt_maps;
drop policy if exists "plotmap prebuilt maps update" on public.prebuilt_maps;
drop policy if exists "plotmap prebuilt maps delete" on public.prebuilt_maps;

create policy "plotmap prebuilt member read"
on public.prebuilt_maps
for select
to authenticated
using (
  public.plotmap_is_active_member()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap prebuilt maps insert"
on public.prebuilt_maps
for insert
to authenticated
with check (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap prebuilt maps update"
on public.prebuilt_maps
for update
to authenticated
using (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
)
with check (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap prebuilt maps delete"
on public.prebuilt_maps
for delete
to authenticated
using (
  public.plotmap_can_edit_maps()
  and dealer_id = public.plotmap_current_dealer_id()
);

-- ---------- presentation_events ----------
drop policy if exists "plotmap pevents admin read" on public.presentation_events;
drop policy if exists "plotmap pevents member read" on public.presentation_events;

create policy "plotmap pevents member read"
on public.presentation_events
for select
to authenticated
using (
  public.plotmap_is_active_member()
  and dealer_id = public.plotmap_current_dealer_id()
);

-- ---------- dealer_settings ----------
drop policy if exists "plotmap dealer settings staff" on public.dealer_settings;
drop policy if exists "plotmap dealer settings member read" on public.dealer_settings;
drop policy if exists "plotmap dealer settings insert" on public.dealer_settings;
drop policy if exists "plotmap dealer settings update" on public.dealer_settings;
drop policy if exists "plotmap dealer settings delete" on public.dealer_settings;

create policy "plotmap dealer settings member read"
on public.dealer_settings
for select
to authenticated
using (
  public.plotmap_is_active_member()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap dealer settings insert"
on public.dealer_settings
for insert
to authenticated
with check (
  public.plotmap_can_manage_billing()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap dealer settings update"
on public.dealer_settings
for update
to authenticated
using (
  public.plotmap_can_manage_settings()
  and dealer_id = public.plotmap_current_dealer_id()
)
with check (
  public.plotmap_can_manage_settings()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap dealer settings delete"
on public.dealer_settings
for delete
to authenticated
using (
  public.plotmap_can_manage_billing()
  and dealer_id = public.plotmap_current_dealer_id()
);

-- ---------- share_links ----------
drop policy if exists "plotmap share links staff" on public.share_links;
drop policy if exists "plotmap share links member read" on public.share_links;
drop policy if exists "plotmap share links insert" on public.share_links;
drop policy if exists "plotmap share links update" on public.share_links;
drop policy if exists "plotmap share links delete" on public.share_links;

create policy "plotmap share links member read"
on public.share_links
for select
to authenticated
using (
  public.plotmap_is_active_member()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap share links insert"
on public.share_links
for insert
to authenticated
with check (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap share links update"
on public.share_links
for update
to authenticated
using (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
)
with check (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "plotmap share links delete"
on public.share_links
for delete
to authenticated
using (
  public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
);

-- ---------- audit_logs ----------
drop policy if exists "plotmap audit logs staff" on public.audit_logs;
drop policy if exists "plotmap audit logs staff read" on public.audit_logs;
drop policy if exists "plotmap audit logs staff insert" on public.audit_logs;
drop policy if exists "plotmap audit logs member read" on public.audit_logs;
drop policy if exists "plotmap audit logs writer insert" on public.audit_logs;

create policy "plotmap audit logs member read"
on public.audit_logs
for select
to authenticated
using (
  public.plotmap_is_active_member()
  and dealer_id = public.plotmap_current_dealer_id()
);

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
);

-- ---------- profiles / team management ----------
drop policy if exists "profiles self read" on public.profiles;
drop policy if exists "profiles owner dealer read" on public.profiles;
drop policy if exists "profiles owner dealer insert" on public.profiles;
drop policy if exists "profiles owner dealer update" on public.profiles;

create policy "profiles self read"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles owner dealer read"
on public.profiles
for select
to authenticated
using (
  public.plotmap_can_manage_team()
  and dealer_id = public.plotmap_current_dealer_id()
);

create policy "profiles owner dealer insert"
on public.profiles
for insert
to authenticated
with check (
  public.plotmap_can_manage_team()
  and dealer_id = public.plotmap_current_dealer_id()
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
)
with check (
  public.plotmap_can_manage_team()
  and dealer_id = public.plotmap_current_dealer_id()
  and role in ('owner', 'manager', 'map_editor', 'property_editor', 'viewer')
  and status in ('active', 'blocked', 'disabled', 'suspended', 'removed')
);

-- ---------- grants ----------
grant select, insert, update, delete on public.crm_records to authenticated;
grant select, insert, update, delete on public.map_overlays to authenticated;
grant select, insert, update, delete on public.prebuilt_maps to authenticated;
grant select on public.presentation_events to authenticated;
grant select, insert, update, delete on public.dealer_settings to authenticated;
grant select, insert, update, delete on public.share_links to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update on public.profiles to authenticated;
