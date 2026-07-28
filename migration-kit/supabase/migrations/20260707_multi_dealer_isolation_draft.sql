-- ============================================================
-- PlotMap · Multi-Dealer Isolation — DRAFT
-- ⚠️  DRAFT ONLY — MUST BE REVIEWED BY CODEX BEFORE APPLYING. ⚠️
--
-- Prepared by Claude (Phase 2 PREP). NOT applied to Supabase.
-- See docs/MULTI_DEALER_ISOLATION_HANDOFF.md for findings R1–R5,
-- the proposed approach, and the Codex audit prompt.
--
-- Safety contract for this file:
--   • The ACTIVE statements below are additive/idempotent ONLY:
--     dealer_id indexes + one read-only helper function. Running them
--     changes NO access and drops NO data.
--   • The behavior-changing isolation fixes (dealer-scoped RPCs, and the
--     grant/revoke of anon access) are intentionally left COMMENTED OUT
--     in the "PROPOSED" block so an accidental run cannot alter RLS.
--     Codex reviews, completes, and applies them deliberately.
--   • No DROP TABLE / DROP DATABASE / DELETE / TRUNCATE.
--   • No using(true) / with check(true) on private tables.
-- ============================================================

-- ---------- ACTIVE · safe, additive, idempotent ----------

-- Indexes to make dealer_id scoping cheap on every private/public-path table.
create index if not exists crm_records_dealer_idx
  on public.crm_records (dealer_id);
create index if not exists crm_records_dealer_entity_idx
  on public.crm_records (dealer_id, entity_type);
create index if not exists map_overlays_dealer_idx
  on public.map_overlays (dealer_id, map_id);
create index if not exists prebuilt_maps_dealer_idx
  on public.prebuilt_maps (dealer_id);
create index if not exists presentation_events_dealer_idx
  on public.presentation_events (dealer_id, created_at desc);

-- Read-only helper the proposed RPCs will use to reject events/reads for
-- dealers that do not exist or are not active. Harmless until referenced.
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
  );
$$;

-- ============================================================
-- PROPOSED · DO NOT APPLY UNTIL CODEX REVIEW
-- (kept as comments so this file is safe to run by accident)
-- ============================================================
--
-- -- R1/R2: dealer-scoped public reads via SECURITY DEFINER RPCs.
-- --        Clients call these with the dealer_id resolved from ?dealer= or
-- --        the share-link slug; the function enforces the scope internally.
-- --
-- -- create or replace function public.plotmap_client_properties(p_dealer_id text)
-- -- returns setof public.client_safe_properties
-- -- language sql stable security definer set search_path = public as $$
-- --   select * from public.client_safe_properties c where c.dealer_id = p_dealer_id;
-- -- $$;
-- -- grant execute on function public.plotmap_client_properties(text) to anon, authenticated;
-- --
-- -- create or replace function public.plotmap_client_maps(p_dealer_id text)
-- -- returns setof public.prebuilt_maps
-- -- language sql stable security definer set search_path = public as $$
-- --   select * from public.prebuilt_maps m
-- --   where m.dealer_id = p_dealer_id and m.status = 'published' and m.client_visible = true;
-- -- $$;
-- -- grant execute on function public.plotmap_client_maps(text) to anon, authenticated;
-- --
-- -- create or replace function public.plotmap_client_overlays(p_dealer_id text)
-- -- returns setof public.map_overlays
-- -- language sql stable security definer set search_path = public as $$
-- --   select * from public.map_overlays o
-- --   where o.dealer_id = p_dealer_id and o.status = 'published'
-- --     and o.client_visible = true and o.deleted = false;
-- -- $$;
-- -- grant execute on function public.plotmap_client_overlays(text) to anon, authenticated;
-- --
-- -- -- After the RPCs are live and app/plotmap is switched to them, remove the
-- -- -- un-scoped anon read paths (staff policies stay untouched):
-- -- revoke select on public.client_safe_properties from anon;
-- -- drop policy if exists "plotmap prebuilt public read" on public.prebuilt_maps;   -- replaced by RPC
-- -- drop policy if exists "plotmap overlays public read" on public.map_overlays;    -- replaced by RPC
-- -- revoke select on public.prebuilt_maps from anon;
-- -- revoke select on public.map_overlays from anon;
-- --
-- -- R3: validated presentation-event insert; then revoke direct anon insert.
-- -- create or replace function public.plotmap_record_presentation_event(
-- --   p_dealer_id text, p_session_id text, p_event_type text,
-- --   p_area text default null, p_sector text default null, p_map_id text default null,
-- --   p_property_id text default null, p_client_id text default null, p_metadata jsonb default '{}'::jsonb)
-- -- returns void language plpgsql security definer set search_path = public as $$
-- -- begin
-- --   if not public.plotmap_dealer_is_active(p_dealer_id) then
-- --     raise exception 'unknown or inactive dealer';
-- --   end if;
-- --   insert into public.presentation_events
-- --     (dealer_id, session_id, event_type, area, sector, map_id, property_id, client_id, metadata)
-- --   values (p_dealer_id, p_session_id, p_event_type, p_area, p_sector, p_map_id,
-- --           p_property_id, p_client_id, jsonb_set(coalesce(p_metadata,'{}'::jsonb),
-- --           '{source}', '"client_presentation"'));
-- -- end; $$;
-- -- grant execute on function public.plotmap_record_presentation_event(
-- --   text,text,text,text,text,text,text,text,jsonb) to anon, authenticated;
-- -- drop policy if exists "plotmap pevents public insert" on public.presentation_events;
-- -- revoke insert on public.presentation_events from anon;
-- --
-- -- R4/R5: backfill legacy dealer_id and tighten the 'dealer-demo' default —
-- --        DATA change; Codex must confirm the real dealer mapping first.
-- ============================================================
-- END PROPOSED BLOCK
-- ============================================================
