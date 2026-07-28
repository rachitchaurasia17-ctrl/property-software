-- ============================================================
-- PlotMap · Team Permission RLS — DRAFT
-- ⚠️  DRAFT ONLY — MUST BE REVIEWED BY CODEX BEFORE APPLYING. ⚠️
--
-- Prepared by Claude (Phase 3 PREP). NOT applied to Supabase.
--
-- ROLLOUT ORDER (must be respected):
--   1. 20260707a_multi_dealer_rpc_setup.sql   (applied)
--   2. 20260707b_multi_dealer_anon_lockdown.sql (only after RPC frontend
--      verification — see docs/MIGRATION_B_VERIFICATION_CHECKLIST.md)
--   3. THIS FILE — team-role write capabilities (Codex review required)
--
-- Depends on helpers already live from Migration A / the security patch:
--   plotmap_current_role(), plotmap_current_dealer_id(),
--   plotmap_dealer_is_active(text). This file only ADDS capability helpers.
-- See docs/TEAM_PERMISSION_RLS_HANDOFF.md for the role matrix and Codex prompt.
--
-- Safety contract for this file:
--   • ACTIVE statements are additive/idempotent read-only helper functions
--     ONLY. They change NO access until a policy references them.
--   • The policy re-writes that actually enforce the matrix are left
--     COMMENTED OUT in the "PROPOSED" block so an accidental run cannot alter
--     RLS. Codex reviews, completes, and applies them deliberately.
--   • No DROP TABLE / DROP DATABASE / DELETE / TRUNCATE.
--   • No using(true) / with check(true) on private tables. No RLS weakening.
-- ============================================================

-- ---------- ACTIVE · safe, additive, idempotent capability helpers ----------
-- Each mirrors a column in the role matrix. All are status-aware (active only)
-- and read-only. Callers still AND with dealer_id = plotmap_current_dealer_id().

create or replace function public.plotmap_is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.plotmap_current_role()
           in ('owner','manager','map_editor','property_editor','team','viewer')
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), '') = 'active';
$$;

create or replace function public.plotmap_can_edit_properties()
returns boolean language sql stable security definer set search_path = public as $$
  select public.plotmap_current_role() in ('owner','manager','property_editor','team')
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), '') = 'active';
$$;

create or replace function public.plotmap_can_edit_crm()
returns boolean language sql stable security definer set search_path = public as $$
  select public.plotmap_current_role() in ('owner','manager','team')
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), '') = 'active';
$$;

create or replace function public.plotmap_can_edit_maps()
returns boolean language sql stable security definer set search_path = public as $$
  select public.plotmap_current_role() in ('owner','manager','map_editor','team')
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), '') = 'active';
$$;

create or replace function public.plotmap_can_manage_settings()
returns boolean language sql stable security definer set search_path = public as $$
  select public.plotmap_current_role() in ('owner','manager')
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), '') = 'active';
$$;

create or replace function public.plotmap_can_manage_billing()
returns boolean language sql stable security definer set search_path = public as $$
  select public.plotmap_current_role() = 'owner'
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), '') = 'active';
$$;

create or replace function public.plotmap_can_manage_team()
returns boolean language sql stable security definer set search_path = public as $$
  select public.plotmap_current_role() = 'owner'
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), '') = 'active';
$$;

-- ============================================================
-- PROPOSED · DO NOT APPLY UNTIL CODEX REVIEW
-- (commented so this file is safe to run by accident)
-- ============================================================
--
-- -- crm_records: read for all active members; property writes gated by
-- --              plotmap_can_edit_properties(); non-property CRM writes gated
-- --              by plotmap_can_edit_crm(). All AND dealer scope.
-- -- drop policy if exists "plotmap crm admin all" on public.crm_records;
-- -- create policy "plotmap crm member read" on public.crm_records
-- --   for select to authenticated
-- --   using (public.plotmap_is_active_member() and dealer_id = public.plotmap_current_dealer_id());
-- -- create policy "plotmap crm properties write" on public.crm_records
-- --   for all to authenticated
-- --   using (public.plotmap_can_edit_properties() and dealer_id = public.plotmap_current_dealer_id()
-- --          and entity_type = 'properties')
-- --   with check (public.plotmap_can_edit_properties() and dealer_id = public.plotmap_current_dealer_id()
-- --          and entity_type = 'properties');
-- -- create policy "plotmap crm other write" on public.crm_records
-- --   for all to authenticated
-- --   using (public.plotmap_can_edit_crm() and dealer_id = public.plotmap_current_dealer_id()
-- --          and entity_type <> 'properties')
-- --   with check (public.plotmap_can_edit_crm() and dealer_id = public.plotmap_current_dealer_id()
-- --          and entity_type <> 'properties');
-- --   -- NOTE: multiple FOR ALL policies are OR-combined; Codex to verify the
-- --   -- property/non-property split behaves for UPDATE moving entity_type.
-- --
-- -- map_overlays / prebuilt_maps: read for active members (staff view already
-- -- covers admin); writes gated by plotmap_can_edit_maps(). Keep the existing
-- -- anon/public read handling from the Phase 2 isolation migration.
-- -- drop policy if exists "plotmap overlays admin all" on public.map_overlays;
-- -- create policy "plotmap overlays member read" on public.map_overlays
-- --   for select to authenticated
-- --   using (public.plotmap_is_active_member() and dealer_id = public.plotmap_current_dealer_id());
-- -- create policy "plotmap overlays maps write" on public.map_overlays
-- --   for all to authenticated
-- --   using (public.plotmap_can_edit_maps() and dealer_id = public.plotmap_current_dealer_id())
-- --   with check (public.plotmap_can_edit_maps() and dealer_id = public.plotmap_current_dealer_id());
-- -- (repeat the analogous member-read + maps-write split for prebuilt_maps)
-- --
-- -- dealer_settings: branding editable by manager+, billing/account columns
-- -- OWNER ONLY. Row-level RLS cannot express column rules — enforce via trigger:
-- -- create or replace function public.plotmap_guard_dealer_settings_billing()
-- -- returns trigger language plpgsql security definer set search_path = public as $$
-- -- begin
-- --   if not public.plotmap_can_manage_billing() and (
-- --        new.plan_code is distinct from old.plan_code
-- --     or new.subscription_status is distinct from old.subscription_status
-- --     or new.account_status is distinct from old.account_status
-- --     or new.seat_limit is distinct from old.seat_limit
-- --     or new.trial_start is distinct from old.trial_start
-- --     or new.trial_end is distinct from old.trial_end) then
-- --     raise exception 'billing/account columns are owner-only';
-- --   end if;
-- --   return new;
-- -- end; $$;
-- -- create trigger plotmap_dealer_settings_billing_guard
-- --   before update on public.dealer_settings
-- --   for each row execute function public.plotmap_guard_dealer_settings_billing();
-- --   -- and swap the settings write policy to plotmap_can_manage_settings().
-- --
-- -- profiles: owner-only, dealer-bounded team management UPDATE that cannot
-- -- change a row's dealer_id or escalate role outside the dealer. Codex to
-- -- design the exact using()/with check() so it is escalation-proof.
-- --
-- -- viewer read tier: if viewers should read private dealer data, that is
-- -- already covered by plotmap_is_active_member() in the member-read policies
-- -- above (viewer is included). If viewers must stay client-only, remove
-- -- 'viewer' from plotmap_is_active_member(). OPEN QUESTION — see handoff §6.
-- ============================================================
-- END PROPOSED BLOCK
-- ============================================================
