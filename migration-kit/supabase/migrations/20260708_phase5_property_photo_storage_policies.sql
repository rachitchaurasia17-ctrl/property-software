-- ============================================================
-- PlotMap - Phase 5 property photo storage policies
-- REVIEWED DRAFT. APPLY ONLY AFTER PHASE 4 ACCOUNT GATING IS LIVE.
--
-- Purpose:
--   Create a private Supabase Storage bucket and enforce per-dealer object
--   access for property photos.
--
-- Important:
--   This migration does NOT make Client Presentation photo serving live.
--   Anonymous signed URL serving still needs a server-side broker/Edge
--   Function with the service role stored server-side, never in frontend JS.
--
-- Safety:
--   - Private bucket; no public or anon storage object read policy.
--   - No DROP TABLE / DROP DATABASE / DELETE FROM / TRUNCATE.
--   - No using(true) or with check(true).
-- ============================================================

create index if not exists crm_records_photo_property_lookup_idx
  on public.crm_records (dealer_id, id)
  where entity_type = 'properties' and coalesce(deleted, false) = false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-photos',
  'property-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.plotmap_photo_dealer_id(p_object_path text)
returns text
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
    when (storage.foldername(p_object_path))[1] = 'dealers'
     and (storage.foldername(p_object_path))[3] = 'properties'
    then (storage.foldername(p_object_path))[2]
    else null
  end;
$$;

create or replace function public.plotmap_photo_property_id(p_object_path text)
returns text
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
    when (storage.foldername(p_object_path))[1] = 'dealers'
     and (storage.foldername(p_object_path))[3] = 'properties'
    then (storage.foldername(p_object_path))[4]
    else null
  end;
$$;

create or replace function public.plotmap_property_photo_path_is_valid(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select (storage.foldername(p_object_path))[1] = 'dealers'
     and (storage.foldername(p_object_path))[2] is not null
     and (storage.foldername(p_object_path))[3] = 'properties'
     and (storage.foldername(p_object_path))[4] is not null
     and (storage.foldername(p_object_path))[5] is null
     and nullif(storage.filename(p_object_path), '') is not null
     and lower(storage.extension(p_object_path)) in ('jpg', 'jpeg', 'png', 'webp');
$$;

create or replace function public.plotmap_property_photo_belongs_to_existing_property(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.crm_records r
    where r.dealer_id = public.plotmap_photo_dealer_id(p_object_path)
      and r.id = public.plotmap_photo_property_id(p_object_path)
      and r.entity_type = 'properties'
      and coalesce(r.deleted, false) = false
  );
$$;

create or replace function public.plotmap_client_property_photo_allowed(
  p_dealer_id text,
  p_property_id text,
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select p_dealer_id = public.plotmap_photo_dealer_id(p_object_path)
     and p_property_id = public.plotmap_photo_property_id(p_object_path)
     and public.plotmap_property_photo_path_is_valid(p_object_path)
     and exists (
       select 1
       from public.client_safe_properties c
       where c.dealer_id = p_dealer_id
         and c.id = p_property_id
         and public.plotmap_dealer_is_active(p_dealer_id)
     );
$$;

create or replace function public.plotmap_client_property_photo_objects(
  p_dealer_id text,
  p_property_id text
)
returns table(path text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select entry ->> 'path' as path
  from public.crm_records r
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(r.payload -> 'photoStorage') = 'array' then r.payload -> 'photoStorage'
      else '[]'::jsonb
    end
  ) entry
  where r.dealer_id = p_dealer_id
    and r.id = p_property_id
    and r.entity_type = 'properties'
    and coalesce(r.deleted, false) = false
    and coalesce((r.payload ->> 'clientVisible')::boolean, true) = true
    and coalesce(r.payload ->> 'internalStatus', '') !~* '(archived|internal|hold|sold|hidden)'
    and entry ->> 'kind' = 'storage'
    and nullif(entry ->> 'path', '') is not null
    and public.plotmap_client_property_photo_allowed(p_dealer_id, p_property_id, entry ->> 'path')
  order by entry ->> 'id'
  limit 8;
$$;

revoke all on function public.plotmap_photo_dealer_id(text)
  from public, anon, authenticated;
revoke all on function public.plotmap_photo_property_id(text)
  from public, anon, authenticated;
revoke all on function public.plotmap_property_photo_path_is_valid(text)
  from public, anon, authenticated;
revoke all on function public.plotmap_property_photo_belongs_to_existing_property(text)
  from public, anon, authenticated;
revoke all on function public.plotmap_client_property_photo_allowed(text, text, text)
  from public, anon, authenticated;
revoke all on function public.plotmap_client_property_photo_objects(text, text)
  from public, anon, authenticated;

grant execute on function public.plotmap_photo_dealer_id(text)
  to authenticated;
grant execute on function public.plotmap_photo_property_id(text)
  to authenticated;
grant execute on function public.plotmap_property_photo_path_is_valid(text)
  to authenticated;
grant execute on function public.plotmap_property_photo_belongs_to_existing_property(text)
  to authenticated;
grant execute on function public.plotmap_client_property_photo_allowed(text, text, text)
  to authenticated;
grant execute on function public.plotmap_client_property_photo_objects(text, text)
  to authenticated;

drop policy if exists "plotmap photos staff write" on storage.objects;
drop policy if exists "plotmap photos staff read" on storage.objects;
drop policy if exists "plotmap photos member read" on storage.objects;
drop policy if exists "plotmap photos property insert" on storage.objects;
drop policy if exists "plotmap photos property update" on storage.objects;
drop policy if exists "plotmap photos property delete" on storage.objects;

create policy "plotmap photos member read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'property-photos'
  and public.plotmap_is_active_member()
  and public.plotmap_photo_dealer_id(name) = public.plotmap_current_dealer_id()
  and public.plotmap_property_photo_path_is_valid(name)
);

create policy "plotmap photos property insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'property-photos'
  and public.plotmap_can_edit_properties()
  and public.plotmap_dealer_can_write(public.plotmap_photo_dealer_id(name))
  and public.plotmap_photo_dealer_id(name) = public.plotmap_current_dealer_id()
  and public.plotmap_property_photo_path_is_valid(name)
  and public.plotmap_property_photo_belongs_to_existing_property(name)
);

create policy "plotmap photos property update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'property-photos'
  and public.plotmap_can_edit_properties()
  and public.plotmap_dealer_can_write(public.plotmap_photo_dealer_id(name))
  and public.plotmap_photo_dealer_id(name) = public.plotmap_current_dealer_id()
  and public.plotmap_property_photo_path_is_valid(name)
  and public.plotmap_property_photo_belongs_to_existing_property(name)
)
with check (
  bucket_id = 'property-photos'
  and public.plotmap_can_edit_properties()
  and public.plotmap_dealer_can_write(public.plotmap_photo_dealer_id(name))
  and public.plotmap_photo_dealer_id(name) = public.plotmap_current_dealer_id()
  and public.plotmap_property_photo_path_is_valid(name)
  and public.plotmap_property_photo_belongs_to_existing_property(name)
);

create policy "plotmap photos property delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'property-photos'
  and public.plotmap_can_edit_properties()
  and public.plotmap_dealer_can_write(public.plotmap_photo_dealer_id(name))
  and public.plotmap_photo_dealer_id(name) = public.plotmap_current_dealer_id()
  and public.plotmap_property_photo_path_is_valid(name)
  and public.plotmap_property_photo_belongs_to_existing_property(name)
);
