-- PlotMap Private Client Links
-- Additive production migration. Extends share_links; does not replace the
-- existing client presentation or its Phase 2/3/4 security boundaries.

create extension if not exists pgcrypto;

alter table public.share_links
  add column if not exists client_id text,
  add column if not exists property_ids text[] not null default '{}',
  add column if not exists token_hash text,
  add column if not exists token_hint text,
  add column if not exists snapshot_version integer,
  add column if not exists opened_at timestamptz,
  add column if not exists last_opened_at timestamptz;

create unique index if not exists share_links_client_token_hash_uidx
  on public.share_links (token_hash)
  where token_hash is not null;

create index if not exists share_links_client_dealer_created_idx
  on public.share_links (dealer_id, created_at desc)
  where target_type = 'client_link';

create index if not exists share_links_client_property_ids_gin_idx
  on public.share_links using gin (property_ids)
  where target_type = 'client_link';

create table if not exists public.client_link_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.share_links(id) on delete cascade,
  dealer_id text not null,
  event_type text not null check (
    event_type in ('opened', 'audio_played', 'call_clicked', 'whatsapp_clicked', 'visit_requested')
  ),
  session_hash text not null,
  idempotency_hash text,
  property_public_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint client_link_events_metadata_size_check
    check (octet_length(metadata::text) <= 2048)
);

create unique index if not exists client_link_events_idempotency_uidx
  on public.client_link_events (link_id, idempotency_hash)
  where idempotency_hash is not null;

create index if not exists client_link_events_dealer_created_idx
  on public.client_link_events (dealer_id, created_at desc, id desc);

create index if not exists client_link_events_link_created_idx
  on public.client_link_events (link_id, created_at desc, id desc);

-- Small server-maintained counters protect a valid bearer link from automated
-- resolver abuse. Rows disappear automatically when the link is removed.
create table if not exists public.client_link_access_windows (
  link_id uuid not null references public.share_links(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (link_id, window_start)
);

alter table public.client_link_events enable row level security;
alter table public.client_link_access_windows enable row level security;

revoke all on public.client_link_events from public, anon, authenticated;
revoke all on public.client_link_access_windows from public, anon, authenticated;
grant select on public.client_link_events to authenticated;

drop policy if exists "plotmap client link events member read" on public.client_link_events;
create policy "plotmap client link events member read"
on public.client_link_events
for select
to authenticated
using (
  public.plotmap_is_active_member()
  and dealer_id = public.plotmap_current_dealer_id()
);

create or replace function public.plotmap_client_link_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.plotmap_can_edit_crm()
    or public.plotmap_can_edit_properties()
  )
  and public.plotmap_dealer_can_write(public.plotmap_current_dealer_id());
$$;

create or replace function public.plotmap_client_link_audio_path_is_valid(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select (storage.foldername(p_path))[1] = 'dealers'
     and (storage.foldername(p_path))[2] = public.plotmap_current_dealer_id()
     and (storage.foldername(p_path))[3] = 'client-links'
     and (storage.foldername(p_path))[4] is null
     and nullif(storage.filename(p_path), '') is not null
     and lower(storage.extension(p_path)) in ('webm', 'mp3', 'mp4', 'ogg', 'wav');
$$;

revoke all on function public.plotmap_client_link_can_manage()
  from public, anon, authenticated;
revoke all on function public.plotmap_client_link_audio_path_is_valid(text)
  from public, anon, authenticated;
grant execute on function public.plotmap_client_link_can_manage() to authenticated;
grant execute on function public.plotmap_client_link_audio_path_is_valid(text) to authenticated;

-- Existing staff policies remain in place for ordinary share links. Private
-- client-link rows are writable only through the validating RPCs below.
drop policy if exists "plotmap share links insert" on public.share_links;
drop policy if exists "plotmap share links update" on public.share_links;
drop policy if exists "plotmap share links delete" on public.share_links;

create policy "plotmap share links insert"
on public.share_links for insert to authenticated
with check (
  target_type <> 'client_link'
  and public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap share links update"
on public.share_links for update to authenticated
using (
  target_type <> 'client_link'
  and public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
)
with check (
  target_type <> 'client_link'
  and public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

create policy "plotmap share links delete"
on public.share_links for delete to authenticated
using (
  target_type <> 'client_link'
  and public.plotmap_can_edit_crm()
  and dealer_id = public.plotmap_current_dealer_id()
  and public.plotmap_dealer_can_write(dealer_id)
);

create or replace function public.plotmap_create_client_link(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_dealer_id text := public.plotmap_current_dealer_id();
  v_client_id text := nullif(trim(coalesce(p_payload ->> 'clientId', '')), '');
  v_property_ids text[];
  v_property_count integer;
  v_price_visibility text := coalesce(nullif(p_payload ->> 'priceVisibility', ''), 'hidden');
  v_location_visibility text := coalesce(nullif(p_payload ->> 'locationVisibility', ''), 'area');
  v_expiry_days integer := coalesce((p_payload ->> 'expiresInDays')::integer, 7);
  v_expires_at timestamptz;
  v_client_name text;
  v_branding jsonb;
  v_properties jsonb := '[]'::jsonb;
  v_media jsonb := '{}'::jsonb;
  v_property record;
  v_property_public_id text;
  v_photos_safe jsonb;
  v_refs jsonb;
  v_ref text;
  v_kind text;
  v_index integer;
  v_source text;
  v_photo_public_id text;
  v_photo_count integer;
  v_raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash text;
  v_link_id uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_audio_path text;
  v_audio_seconds integer;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 65536 then
    raise exception 'invalid client link payload';
  end if;

  if auth.uid() is null or v_dealer_id is null or not public.plotmap_client_link_can_manage() then
    raise exception 'client link access denied';
  end if;

  if v_client_id is not null and not exists (
    select 1 from public.crm_records r
    where r.dealer_id = v_dealer_id
      and r.id = v_client_id
      and r.entity_type = 'clients'
      and coalesce(r.deleted, false) = false
  ) then
    raise exception 'customer is not available';
  end if;

  if jsonb_typeof(p_payload -> 'propertyIds') <> 'array' then
    raise exception 'choose between one and four properties';
  end if;

  select array_agg(item order by ord), count(*)
    into v_property_ids, v_property_count
  from jsonb_array_elements_text(p_payload -> 'propertyIds') with ordinality as x(item, ord);

  if v_property_count < 1 or v_property_count > 4
     or cardinality(array(select distinct unnest(v_property_ids))) <> v_property_count
     or exists (select 1 from unnest(v_property_ids) x where nullif(trim(x), '') is null) then
    raise exception 'choose between one and four unique properties';
  end if;

  if v_price_visibility not in ('hidden', 'shown') then
    raise exception 'invalid price visibility';
  end if;
  if v_location_visibility not in ('hidden', 'area', 'exact') then
    raise exception 'invalid location visibility';
  end if;
  if v_expiry_days not in (3, 7, 14, 30) then
    raise exception 'invalid expiry';
  end if;
  v_expires_at := timezone('utc'::text, now()) + make_interval(days => v_expiry_days);

  if v_client_id is not null then
    select left(coalesce(nullif(trim(r.payload ->> 'name'), ''), 'Client'), 80)
      into v_client_name
    from public.crm_records r
    where r.dealer_id = v_dealer_id and r.id = v_client_id and r.entity_type = 'clients';
  else
    v_client_name := 'Client';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'brandName', left(coalesce(nullif(trim(d.brand_name), ''), 'PlotMap'), 120),
    'tagline', left(coalesce(nullif(trim(d.brand_tagline), ''), nullif(trim(d.presentation_tagline), '')), 180),
    'logoUrl', case when d.logo_url ~ '^https://' then left(d.logo_url, 2048) else null end,
    'phone', left(nullif(regexp_replace(coalesce(d.support_phone, ''), '[^0-9+ -]', '', 'g'), ''), 32),
    'whatsapp', left(nullif(regexp_replace(coalesce(d.whatsapp_number, ''), '[^0-9+]', '', 'g'), ''), 24)
  )) into v_branding
  from public.dealer_settings d
  where d.dealer_id = v_dealer_id;

  v_branding := coalesce(v_branding, jsonb_build_object('brandName', 'PlotMap'));

  for v_property in
    select r.id, r.payload, x.ord
    from unnest(v_property_ids) with ordinality as x(id, ord)
    join public.crm_records r on r.id = x.id and r.dealer_id = v_dealer_id
    where r.entity_type = 'properties'
      and coalesce(r.deleted, false) = false
      and coalesce((r.payload ->> 'clientVisible')::boolean, true) = true
      and coalesce(r.payload ->> 'internalStatus', '') !~* '(archived|internal|hold|sold|hidden)'
    order by x.ord
  loop
    v_property_public_id := encode(extensions.gen_random_bytes(12), 'hex');
    v_photos_safe := '[]'::jsonb;
    v_photo_count := 0;
    v_refs := coalesce(p_payload -> 'photoSelections' -> v_property.id, '[]'::jsonb);
    if jsonb_typeof(v_refs) <> 'array' or jsonb_array_length(v_refs) > 8 then
      raise exception 'invalid photo selection';
    end if;

    for v_ref in select value from jsonb_array_elements_text(v_refs)
    loop
      if v_ref !~ '^(external|storage):[0-7]$' then
        raise exception 'invalid photo selection';
      end if;
      v_kind := split_part(v_ref, ':', 1);
      v_index := split_part(v_ref, ':', 2)::integer;
      v_source := null;

      if v_kind = 'external' then
        v_source := v_property.payload -> 'photos' ->> v_index;
        if v_source is null or v_source !~ '^https://' or length(v_source) > 2048 then
          raise exception 'selected external photo is not approved';
        end if;
      else
        if coalesce(v_property.payload -> 'photoStorage' -> v_index ->> 'kind', '') <> 'storage' then
          raise exception 'selected stored photo is not approved';
        end if;
        v_source := v_property.payload -> 'photoStorage' -> v_index ->> 'path';
        if v_source is null
           or public.plotmap_photo_dealer_id(v_source) <> v_dealer_id
           or public.plotmap_photo_property_id(v_source) <> v_property.id
           or not public.plotmap_property_photo_path_is_valid(v_source) then
          raise exception 'selected stored photo is not approved';
        end if;
      end if;

      v_photo_public_id := encode(extensions.gen_random_bytes(10), 'hex');
      v_photos_safe := v_photos_safe || jsonb_build_array(jsonb_build_object(
        'id', v_photo_public_id,
        'kind', v_kind,
        'url', case when v_kind = 'external' then v_source else null end
      ));
      v_media := v_media || jsonb_build_object(v_photo_public_id, jsonb_build_object(
        'kind', v_kind,
        'source', v_source
      ));
      v_photo_count := v_photo_count + 1;
    end loop;

    if v_photo_count < 1 then
      raise exception 'choose at least one approved photo for each property';
    end if;

    v_properties := v_properties || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', v_property_public_id,
      'title', left(coalesce(nullif(trim(v_property.payload ->> 'title'), ''), 'Property'), 160),
      'propertyType', left(nullif(trim(coalesce(v_property.payload ->> 'propertyType', v_property.payload ->> 'type')), ''), 80),
      'size', left(nullif(trim(v_property.payload ->> 'size'), ''), 80),
      'facing', left(nullif(trim(v_property.payload ->> 'facing'), ''), 80),
      'roadWidth', left(nullif(trim(v_property.payload ->> 'roadWidth'), ''), 80),
      'description', left(nullif(trim(v_property.payload ->> 'description'), ''), 500),
      'area', case when v_location_visibility in ('area', 'exact') then left(nullif(trim(v_property.payload ->> 'area'), ''), 120) else null end,
      'sector', case when v_location_visibility = 'exact' then left(nullif(trim(coalesce(v_property.payload ->> 'sector', v_property.payload ->> 'block')), ''), 120) else null end,
      'plotNumber', case when v_location_visibility = 'exact' then left(nullif(trim(v_property.payload ->> 'plotNumber'), ''), 80) else null end,
      'price', case when v_price_visibility = 'shown' then nullif(v_property.payload ->> 'price', '') else null end,
      'photos', v_photos_safe
    )));
  end loop;

  if jsonb_array_length(v_properties) <> v_property_count then
    raise exception 'one or more properties are not client-visible';
  end if;

  v_audio_path := nullif(trim(coalesce(p_payload -> 'audio' ->> 'objectPath', '')), '');
  v_audio_seconds := coalesce((p_payload -> 'audio' ->> 'seconds')::integer, 0);
  if v_audio_path is not null then
    if v_audio_seconds < 1 or v_audio_seconds > 120
       or not public.plotmap_client_link_audio_path_is_valid(v_audio_path)
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'client-link-audio' and o.name = v_audio_path
       ) then
      raise exception 'invalid client link audio';
    end if;
  end if;

  v_snapshot := jsonb_build_object(
    'version', 1,
    'customer', jsonb_build_object('name', split_part(v_client_name, ' ', 1)),
    'branding', v_branding,
    'visibility', jsonb_build_object('price', v_price_visibility, 'location', v_location_visibility),
    'properties', v_properties,
    'audio', case when v_audio_path is null then null else jsonb_build_object('available', true, 'seconds', v_audio_seconds) end
  );
  v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

  insert into public.share_links (
    id, dealer_id, created_by, target_type, target_id, client_id, property_ids,
    label, slug, url, status, expires_at, metadata, token_hash, token_hint,
    snapshot_version, created_at, updated_at
  ) values (
    v_link_id, v_dealer_id, auth.uid(), 'client_link', v_property_ids[1], v_client_id, v_property_ids,
    'Private client link', null, '/client/', 'active', v_expires_at,
    jsonb_build_object(
      'client_snapshot', v_snapshot,
      'client_media', v_media,
      'audio_object_path', v_audio_path,
      'audio_seconds', case when v_audio_path is null then null else v_audio_seconds end
    ),
    v_token_hash, right(v_raw_token, 4), 1,
    timezone('utc'::text, now()), timezone('utc'::text, now())
  );

  insert into public.audit_logs (
    dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata
  ) values (
    v_dealer_id, auth.uid(), public.plotmap_current_role(), 'client_link_created',
    'share_links', v_link_id::text,
    jsonb_build_object('property_count', v_property_count, 'expires_at', v_expires_at)
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_link_id,
    'token', v_raw_token,
    'slug', v_raw_token,
    'url', '/client/?token=' || v_raw_token,
    'expiresAt', v_expires_at
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid client link payload';
end;
$$;

create or replace function public.plotmap_list_client_links(p_property_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or not public.plotmap_is_active_member() then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'label', s.label,
      'status', case
        when s.revoked_at is not null or s.status = 'revoked' then 'revoked'
        when s.expires_at is not null and s.expires_at <= timezone('utc'::text, now()) then 'expired'
        else s.status
      end,
      'propertyCount', cardinality(s.property_ids),
      'tokenHint', s.token_hint,
      'expiresAt', s.expires_at,
      'createdAt', s.created_at,
      'openedAt', s.opened_at,
      'lastOpenedAt', s.last_opened_at,
      'hasAudio', nullif(s.metadata ->> 'audio_object_path', '') is not null,
      'events', jsonb_build_object(
        'opens', (select count(*) from public.client_link_events e where e.link_id = s.id and e.event_type = 'opened'),
        'audioPlays', (select count(*) from public.client_link_events e where e.link_id = s.id and e.event_type = 'audio_played'),
        'calls', (select count(*) from public.client_link_events e where e.link_id = s.id and e.event_type = 'call_clicked'),
        'whatsapp', (select count(*) from public.client_link_events e where e.link_id = s.id and e.event_type = 'whatsapp_clicked'),
        'visits', (select count(*) from public.client_link_events e where e.link_id = s.id and e.event_type = 'visit_requested')
      )
    ) order by s.created_at desc), '[]'::jsonb)
  end
  from public.share_links s
  where s.dealer_id = public.plotmap_current_dealer_id()
    and s.target_type = 'client_link'
    and (p_property_id is null or p_property_id = any(s.property_ids));
$$;

create or replace function public.plotmap_revoke_client_link(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id text := public.plotmap_current_dealer_id();
  v_changed integer;
begin
  if auth.uid() is null or not public.plotmap_client_link_can_manage() then
    raise exception 'client link access denied';
  end if;

  update public.share_links
     set status = 'revoked', revoked_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
   where id = p_link_id
     and dealer_id = v_dealer_id
     and target_type = 'client_link'
     and revoked_at is null;
  get diagnostics v_changed = row_count;

  if v_changed = 1 then
    insert into public.audit_logs (
      dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata
    ) values (
      v_dealer_id, auth.uid(), public.plotmap_current_role(), 'client_link_revoked',
      'share_links', p_link_id::text, '{}'::jsonb
    );
  end if;

  return jsonb_build_object('ok', v_changed = 1);
end;
$$;

create or replace function public.plotmap_extend_client_link(
  p_link_id uuid,
  p_expires_in_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer_id text := public.plotmap_current_dealer_id();
  v_expires_at timestamptz;
  v_changed integer;
begin
  if auth.uid() is null or not public.plotmap_client_link_can_manage() then
    raise exception 'client link access denied';
  end if;
  if p_expires_in_days not in (3, 7, 14, 30) then
    raise exception 'invalid expiry';
  end if;
  v_expires_at := timezone('utc'::text, now()) + make_interval(days => p_expires_in_days);

  update public.share_links
     set status = 'active', expires_at = v_expires_at, updated_at = timezone('utc'::text, now())
   where id = p_link_id
     and dealer_id = v_dealer_id
     and target_type = 'client_link'
     and revoked_at is null;
  get diagnostics v_changed = row_count;

  if v_changed = 1 then
    insert into public.audit_logs (
      dealer_id, actor_profile_id, actor_role, action_type, entity_type, entity_id, metadata
    ) values (
      v_dealer_id, auth.uid(), public.plotmap_current_role(), 'client_link_extended',
      'share_links', p_link_id::text, jsonb_build_object('expires_at', v_expires_at)
    );
  end if;

  return jsonb_build_object('ok', v_changed = 1, 'expiresAt', v_expires_at);
end;
$$;

create or replace function public.plotmap_resolve_client_link(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_link public.share_links%rowtype;
  v_window timestamptz := date_trunc('minute', timezone('utc'::text, now()))
    - make_interval(mins => (extract(minute from timezone('utc'::text, now()))::integer % 15));
  v_count integer;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');

  select * into v_link
  from public.share_links s
  where s.token_hash = v_hash and s.target_type = 'client_link'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));
  insert into public.client_link_access_windows (link_id, window_start, request_count)
  values (v_link.id, v_window, 1)
  on conflict (link_id, window_start)
  do update set request_count = public.client_link_access_windows.request_count + 1
  returning request_count into v_count;

  if v_count > 120 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  if v_link.revoked_at is not null or v_link.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if v_link.expires_at is not null and v_link.expires_at <= timezone('utc'::text, now()) then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if not public.plotmap_dealer_is_active(v_link.dealer_id) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  return jsonb_build_object(
    'ok', true,
    'link', (v_link.metadata -> 'client_snapshot') || jsonb_build_object(
      'expiresAt', v_link.expires_at,
      'linkId', encode(extensions.digest(v_link.id::text, 'sha256'), 'hex')
    )
  );
end;
$$;

-- Service-role-only companion for the Edge broker. It returns frozen media
-- sources, never dealer inventory or customer records.
create or replace function public.plotmap_resolve_client_link_media(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.role() <> 'service_role' then null
    else jsonb_build_object(
      'media', coalesce(s.metadata -> 'client_media', '{}'::jsonb),
      'audioObjectPath', s.metadata ->> 'audio_object_path',
      'audioSeconds', s.metadata -> 'audio_seconds'
    )
  end
  from public.share_links s
  where p_token ~ '^[0-9a-f]{64}$'
    and s.token_hash = encode(extensions.digest(lower(p_token), 'sha256'), 'hex')
    and s.target_type = 'client_link'
    and s.status = 'active'
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > timezone('utc'::text, now()))
    and public.plotmap_dealer_is_active(s.dealer_id)
  limit 1;
$$;

create or replace function public.plotmap_record_client_link_event(
  p_token text,
  p_event_type text,
  p_session_id text,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_link public.share_links%rowtype;
  v_session_hash text;
  v_idempotency_hash text;
  v_property_public_id text;
  v_inserted integer;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$'
     or p_event_type not in ('opened', 'audio_played', 'call_clicked', 'whatsapp_clicked', 'visit_requested')
     or p_session_id is null or length(p_session_id) < 16 or length(p_session_id) > 128
     or p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128
     or p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
     or octet_length(p_metadata::text) > 2048
     or p_metadata::text ~* '(password|passcode|activation.?code|access.?token|refresh.?token|authorization|service.?role|secret|jwt)' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_hash := encode(extensions.digest(lower(p_token), 'sha256'), 'hex');
  select * into v_link
  from public.share_links s
  where s.token_hash = v_hash
    and s.target_type = 'client_link'
    and s.status = 'active'
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > timezone('utc'::text, now()))
    and public.plotmap_dealer_is_active(s.dealer_id)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  v_session_hash := encode(extensions.digest(p_session_id, 'sha256'), 'hex');
  v_idempotency_hash := encode(extensions.digest(p_idempotency_key, 'sha256'), 'hex');
  if (select count(*) from public.client_link_events e
      where e.link_id = v_link.id
        and e.session_hash = v_session_hash
        and e.created_at > timezone('utc'::text, now()) - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  v_property_public_id := nullif(left(trim(coalesce(p_metadata ->> 'propertyId', '')), 64), '');
  if v_property_public_id is not null and not exists (
    select 1
    from jsonb_array_elements(v_link.metadata -> 'client_snapshot' -> 'properties') p
    where p ->> 'id' = v_property_public_id
  ) then
    v_property_public_id := null;
  end if;

  insert into public.client_link_events (
    link_id, dealer_id, event_type, session_hash, idempotency_hash,
    property_public_id, metadata, created_at
  ) values (
    v_link.id, v_link.dealer_id, p_event_type, v_session_hash, v_idempotency_hash,
    v_property_public_id,
    jsonb_strip_nulls(jsonb_build_object('source', 'private_client_link', 'propertyId', v_property_public_id)),
    timezone('utc'::text, now())
  ) on conflict (link_id, idempotency_hash) where idempotency_hash is not null do nothing;
  get diagnostics v_inserted = row_count;

  if p_event_type = 'opened' and v_inserted = 1 then
    update public.share_links
       set opened_at = coalesce(opened_at, timezone('utc'::text, now())),
           last_opened_at = timezone('utc'::text, now()),
           updated_at = timezone('utc'::text, now())
     where id = v_link.id;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', v_inserted = 0);
end;
$$;

revoke all on function public.plotmap_create_client_link(jsonb)
  from public, anon, authenticated;
revoke all on function public.plotmap_list_client_links(text)
  from public, anon, authenticated;
revoke all on function public.plotmap_revoke_client_link(uuid)
  from public, anon, authenticated;
revoke all on function public.plotmap_extend_client_link(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.plotmap_resolve_client_link(text)
  from public, anon, authenticated;
revoke all on function public.plotmap_resolve_client_link_media(text)
  from public, anon, authenticated;
revoke all on function public.plotmap_record_client_link_event(text, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.plotmap_create_client_link(jsonb) to authenticated;
grant execute on function public.plotmap_list_client_links(text) to authenticated;
grant execute on function public.plotmap_revoke_client_link(uuid) to authenticated;
grant execute on function public.plotmap_extend_client_link(uuid, integer) to authenticated;
grant execute on function public.plotmap_resolve_client_link(text) to anon, authenticated;
grant execute on function public.plotmap_resolve_client_link_media(text) to service_role;
grant execute on function public.plotmap_record_client_link_event(text, text, text, text, jsonb) to anon, authenticated;

-- Private voice-note storage. No anonymous read policy exists; the Edge broker
-- signs only the frozen object path attached to an active link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-link-audio',
  'client-link-audio',
  false,
  5242880,
  array['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'];

drop policy if exists "plotmap client link audio member read" on storage.objects;
drop policy if exists "plotmap client link audio insert" on storage.objects;
drop policy if exists "plotmap client link audio update" on storage.objects;
drop policy if exists "plotmap client link audio delete" on storage.objects;

create policy "plotmap client link audio member read"
on storage.objects for select to authenticated
using (
  bucket_id = 'client-link-audio'
  and public.plotmap_is_active_member()
  and public.plotmap_client_link_audio_path_is_valid(name)
);

create policy "plotmap client link audio insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-link-audio'
  and public.plotmap_client_link_can_manage()
  and public.plotmap_client_link_audio_path_is_valid(name)
);

create policy "plotmap client link audio update"
on storage.objects for update to authenticated
using (
  bucket_id = 'client-link-audio'
  and public.plotmap_client_link_can_manage()
  and public.plotmap_client_link_audio_path_is_valid(name)
)
with check (
  bucket_id = 'client-link-audio'
  and public.plotmap_client_link_can_manage()
  and public.plotmap_client_link_audio_path_is_valid(name)
);

create policy "plotmap client link audio delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'client-link-audio'
  and public.plotmap_client_link_can_manage()
  and public.plotmap_client_link_audio_path_is_valid(name)
);

comment on table public.client_link_events is
  'Append-only client-link engagement events. Public writes are accepted only through an allowlisted, rate-limited SECURITY DEFINER RPC.';
