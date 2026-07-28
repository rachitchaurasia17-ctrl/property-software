-- Repeatable production-safe verification for Private Client Links.
-- All fixtures and mutations are wrapped in a transaction and rolled back.

begin;

do $$
declare
  v_a record;
  v_b record;
  v_client_id text := 'verify-client-link-customer';
  v_property_id text := 'verify-client-link-property';
  v_created jsonb;
  v_token text;
  v_link_id uuid;
  v_resolved jsonb;
  v_listed jsonb;
  v_event jsonb;
  v_count integer;
begin
  select p.id, p.dealer_id into v_a
  from public.profiles p
  where p.status = 'active'
    and p.role in ('owner', 'manager', 'property_editor')
    and public.plotmap_dealer_is_active(p.dealer_id)
  order by p.dealer_id, p.id
  limit 1;

  select p.id, p.dealer_id into v_b
  from public.profiles p
  where p.status = 'active'
    and p.dealer_id <> v_a.dealer_id
    and public.plotmap_dealer_is_active(p.dealer_id)
  order by p.dealer_id, p.id
  limit 1;

  if v_a.id is null or v_b.id is null then
    raise exception 'verification requires two active dealer profiles';
  end if;

  insert into public.crm_records (id, dealer_id, entity_type, payload, deleted, updated_at)
  values
    (v_client_id, v_a.dealer_id, 'clients', jsonb_build_object(
      'name', 'Verification Client',
      'phone', '+910000000000',
      'notes', 'must never be returned'
    ), false, timezone('utc'::text, now())),
    (v_property_id, v_a.dealer_id, 'properties', jsonb_build_object(
      'title', 'Verification Plot',
      'area', 'Safe Area',
      'sector', 'Secret Sector',
      'plotNumber', 'SECRET-42',
      'size', '250 sq yd',
      'description', 'Client-safe description',
      'price', 12345678,
      'clientVisible', true,
      'internalStatus', 'Available',
      'sellerName', 'DO-NOT-LEAK-SELLER',
      'sellerPhone', '+919999999999',
      'commission', 999999,
      'negotiationNotes', 'DO-NOT-LEAK-NOTES',
      'photos', jsonb_build_array('https://example.com/approved-photo.jpg'),
      'photoStorage', '[]'::jsonb
    ), false, timezone('utc'::text, now()));

  perform set_config('request.jwt.claim.sub', v_a.id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_created := public.plotmap_create_client_link(jsonb_build_object(
    'clientId', v_client_id,
    'propertyIds', jsonb_build_array(v_property_id),
    'photoSelections', jsonb_build_object(v_property_id, jsonb_build_array('external:0')),
    'priceVisibility', 'hidden',
    'locationVisibility', 'area',
    'expiresInDays', 7
  ));
  if coalesce((v_created ->> 'ok')::boolean, false) is not true then
    raise exception 'dealer A create failed';
  end if;

  v_token := v_created ->> 'token';
  v_link_id := (v_created ->> 'id')::uuid;
  if v_token !~ '^[0-9a-f]{64}$' then raise exception 'token is not 256-bit hex'; end if;
  if exists (
    select 1 from public.share_links s
    where s.id = v_link_id
      and (s.token_hash = v_token or s.url like '%' || v_token || '%' or s.metadata::text like '%' || v_token || '%')
  ) then raise exception 'plaintext token stored'; end if;

  v_resolved := public.plotmap_resolve_client_link(v_token);
  if coalesce((v_resolved ->> 'ok')::boolean, false) is not true then raise exception 'valid token did not resolve'; end if;
  if v_resolved::text ~* '(DO-NOT-LEAK|sellerPhone|sellerName|commission|negotiationNotes|Secret Sector|SECRET-42|12345678)' then
    raise exception 'client-safe resolver leaked a protected field';
  end if;
  if v_resolved #>> '{link,properties,0,area}' <> 'Safe Area' then raise exception 'area-only location missing'; end if;
  if v_resolved #> '{link,properties,0,price}' is not null then raise exception 'hidden price returned'; end if;

  perform set_config('request.jwt.claim.role', 'anon', true);
  if public.plotmap_resolve_client_link_media(v_token) is not null then raise exception 'anon received media sources'; end if;
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_event := public.plotmap_record_client_link_event(
    v_token, 'opened', repeat('a', 32), repeat('b', 32), '{}'::jsonb
  );
  if coalesce((v_event ->> 'ok')::boolean, false) is not true then raise exception 'valid event rejected'; end if;
  perform public.plotmap_record_client_link_event(
    v_token, 'opened', repeat('a', 32), repeat('b', 32), '{}'::jsonb
  );
  select count(*) into v_count from public.client_link_events e where e.link_id = v_link_id;
  if v_count <> 1 then raise exception 'duplicate event was not idempotent'; end if;
  if coalesce((public.plotmap_record_client_link_event(
    repeat('0', 64), 'opened', repeat('a', 32), repeat('c', 32), '{}'::jsonb
  ) ->> 'ok')::boolean, false) is true then raise exception 'invalid token event accepted'; end if;

  perform set_config('request.jwt.claim.sub', v_b.id::text, true);
  v_listed := public.plotmap_list_client_links(v_property_id);
  if jsonb_array_length(v_listed) <> 0 then raise exception 'dealer B listed dealer A link'; end if;
  if coalesce((public.plotmap_revoke_client_link(v_link_id) ->> 'ok')::boolean, false) is true then
    raise exception 'dealer B revoked dealer A link';
  end if;
  if coalesce((public.plotmap_extend_client_link(v_link_id, 7) ->> 'ok')::boolean, false) is true then
    raise exception 'dealer B extended dealer A link';
  end if;

  perform set_config('request.jwt.claim.sub', v_a.id::text, true);
  if coalesce((public.plotmap_extend_client_link(v_link_id, 7) ->> 'ok')::boolean, false) is not true then
    raise exception 'dealer A could not extend own link';
  end if;
  update public.share_links set expires_at = timezone('utc'::text, now()) - interval '1 minute' where id = v_link_id;
  if public.plotmap_resolve_client_link(v_token) ->> 'reason' <> 'expired' then raise exception 'expired link resolved'; end if;
  update public.share_links set expires_at = timezone('utc'::text, now()) + interval '1 day' where id = v_link_id;
  if coalesce((public.plotmap_revoke_client_link(v_link_id) ->> 'ok')::boolean, false) is not true then
    raise exception 'dealer A could not revoke own link';
  end if;
  if public.plotmap_resolve_client_link(v_token) ->> 'reason' <> 'revoked' then raise exception 'revoked link resolved'; end if;

  delete from public.share_links where id = v_link_id;
  select count(*) into v_count from public.client_link_events e where e.link_id = v_link_id;
  if v_count <> 0 then raise exception 'link deletion did not cascade events'; end if;

  if has_table_privilege('anon', 'public.share_links', 'SELECT')
     or has_table_privilege('anon', 'public.client_link_events', 'SELECT')
     or has_table_privilege('anon', 'public.client_link_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.client_link_events', 'INSERT') then
    raise exception 'unsafe direct table grant found';
  end if;
  if exists (select 1 from storage.buckets b where b.id = 'client-link-audio' and b.public) then
    raise exception 'client-link-audio bucket is public';
  end if;
end;
$$;

rollback;
