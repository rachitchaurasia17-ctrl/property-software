-- ============================================================
-- PlotMap - permanent dealer deletion (DESTRUCTIVE)
-- DRAFT — DO NOT APPLY TO PRODUCTION WITHOUT SECURITY REVIEW + APPROVAL.
-- Pair with the `delete-dealer` edge function (drafted alongside) which
-- removes the Supabase Auth user(s) — this SQL only purges public schema
-- rows. Test on staging first.
--
-- Why a function (not ad-hoc DELETEs):
--   - one platform-admin gate, one transaction, FK-safe order;
--   - a required typed confirmation (p_confirm must equal the dealer id)
--     so a mis-click cannot wipe a dealer;
--   - a durable deletion record in a platform-level log that itself is NOT
--     dealer-scoped (so it survives the purge);
--   - returns the owner Auth user ids the edge function must delete.
--
-- Safety properties:
--   - platform-admin only (raises otherwise);
--   - confirmation-guarded;
--   - every DELETE is guarded by to_regclass so missing tables are skipped;
--   - no DROP TABLE / DROP DATABASE / TRUNCATE; no RLS weakening;
--   - all-or-nothing (single function transaction).
-- ============================================================

create extension if not exists pgcrypto;

-- Durable, platform-level audit of deletions (deny-all; admin RPC only).
create table if not exists public.dealer_deletion_log (
  id uuid primary key default gen_random_uuid(),
  dealer_id text not null,
  deleted_by uuid,
  summary jsonb not null default '{}'::jsonb,
  auth_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now())
);
alter table public.dealer_deletion_log enable row level security;
revoke all on public.dealer_deletion_log from public, anon, authenticated;

create or replace function public.plotmap_admin_delete_dealer(
  p_dealer_id text,
  p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dealer text := lower(trim(coalesce(p_dealer_id, '')));
  v_admin uuid := auth.uid();
  v_auth_ids uuid[] := '{}';
  v_summary jsonb := '{}'::jsonb;
  v_n bigint;
  -- child tables to purge BEFORE dealer_settings. Order is FK-safe; each is
  -- skipped if the table does not exist on this deployment.
  v_tables text[] := array[
    'presentation_events','crm_records','map_overlays','plotmap_daily_usage',
    'audit_logs','share_links','dealer_provisioning_attempts','dealer_access_codes',
    'dealer_devices','dealer_passcodes','dealer_activation_requests','profiles'
  ];
  v_t text;
begin
  if not public.plotmap_is_platform_admin() then
    raise exception 'platform admin required';
  end if;
  if v_dealer = '' then
    raise exception 'dealer id required';
  end if;
  -- Typed confirmation: the caller must echo the exact dealer id.
  if lower(trim(coalesce(p_confirm, ''))) <> v_dealer then
    raise exception 'confirmation mismatch — pass the exact dealer id to confirm deletion';
  end if;
  if not exists (select 1 from public.dealer_settings d where d.dealer_id = v_dealer) then
    raise exception 'unknown dealer';
  end if;

  -- Capture the owner Auth user ids for the edge function to remove from
  -- GoTrue (this SQL never touches auth.users directly).
  select coalesce(array_agg(p.id), '{}')
    into v_auth_ids
    from public.profiles p
    where p.dealer_id = v_dealer;

  -- Purge every dealer-scoped table (guarded), tallying row counts.
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null then
      execute format('delete from public.%I where dealer_id = $1', v_t) using v_dealer;
      get diagnostics v_n = row_count;
      v_summary := v_summary || jsonb_build_object(v_t, v_n);
    end if;
  end loop;

  -- Parent row last.
  delete from public.dealer_settings where dealer_id = v_dealer;
  get diagnostics v_n = row_count;
  v_summary := v_summary || jsonb_build_object('dealer_settings', v_n);

  -- Durable record (survives — not dealer-scoped).
  insert into public.dealer_deletion_log (dealer_id, deleted_by, summary, auth_user_ids)
  values (v_dealer, v_admin, v_summary, v_auth_ids);

  return jsonb_build_object(
    'dealer_id', v_dealer,
    'deleted', v_summary,
    'auth_user_ids', to_jsonb(v_auth_ids)
  );
end;
$$;

revoke all on function public.plotmap_admin_delete_dealer(text, text) from public, anon, authenticated;
grant execute on function public.plotmap_admin_delete_dealer(text, text) to authenticated;

-- ============================================================
-- ROLLOUT (do NOT run without approval):
--   1. Review (platform-admin gate, confirmation guard, table list).
--   2. Apply on STAGING; run tools/verify-dealer-delete.js (draft) to
--      confirm anon is refused and a test dealer is fully purged.
--   3. Deploy the `delete-dealer` edge function (service role) which calls
--      this RPC then deletes the returned auth_user_ids from GoTrue.
--   4. Only then apply to production.
-- Rollback: drop function public.plotmap_admin_delete_dealer(text,text);
--           (the deletion itself is not reversible without a DB restore —
--            hence the confirmation guard and the durable deletion log.)
-- ============================================================
