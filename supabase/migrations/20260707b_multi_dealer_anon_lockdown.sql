-- ============================================================
-- PlotMap - Multi-Dealer Isolation anon lockdown
-- Phase 2 Migration B.
--
-- DO NOT APPLY UNTIL AFTER RPC FRONTEND IS DEPLOYED AND VERIFIED.
--
-- Purpose:
--   Remove old direct anon table/view access after Client Presentation
--   has been deployed and verified against the dealer-scoped RPCs from
--   20260707a_multi_dealer_rpc_setup.sql.
--
-- Rollout safety:
--   - Breaking if applied before the RPC frontend is live.
--   - Staff authenticated RLS policies remain unchanged.
--   - No destructive schema or data operations.
--   - No unconditional private-table policies.
--   - Does not mutate existing data rows.
-- ============================================================

-- ---------- remove old unscoped public paths after RPC frontend is live ----------
revoke select on public.client_safe_properties from anon;
revoke select on public.prebuilt_maps from anon;
revoke select on public.map_overlays from anon;
revoke insert on public.presentation_events from anon;

drop policy if exists "plotmap prebuilt public read" on public.prebuilt_maps;
drop policy if exists "plotmap overlays public read" on public.map_overlays;
drop policy if exists "plotmap pevents public insert" on public.presentation_events;

-- Retired policies from the original setup are included defensively. These
-- names should already be gone if supabase_security_patch.sql is live.
drop policy if exists "plotmap public read" on public.prebuilt_maps;
drop policy if exists "plotmap public write" on public.prebuilt_maps;
drop policy if exists "plotmap overlays read" on public.map_overlays;
drop policy if exists "plotmap overlays write" on public.map_overlays;
drop policy if exists "plotmap pevents insert" on public.presentation_events;
