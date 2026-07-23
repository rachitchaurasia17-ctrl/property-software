-- ============================================================
-- PlotMap - permanent dealer deletion (DESTRUCTIVE)
-- Additive migration. STAGING FIRST. Review before applying to production.
-- Pair with the `delete-dealer` edge function which removes the owner Auth
-- user(s) — this SQL only purges public-schema rows and returns the Auth
-- user ids that are SAFE to remove.
--
-- Design (production-quality):
--   - platform-admin only; the caller's own account and any platform admin
--     are NEVER returned for Auth deletion;
--   - typed confirmation must equal the dealer id OR the business name;
--   - one advisory lock per dealer serialises concurrent attempts;
--   - single transaction, FK-safe order, guarded per table (missing tables
--     are skipped) — no orphaned dealer rows on success;
--   - idempotent: deleting an already-deleted dealer returns the durable
--     tombstone (including the Auth ids) so the edge function can finish an
--     interrupted Auth cleanup — recoverable if Auth deletion failed after
--     the DB work;
--   - a secret-free tombstone (who / which dealer / when / op id / counts /
--     Auth ids) is retained; no passcodes, codes, tokens, or private data.
--
-- Safety: no DROP TABLE / DROP DATABASE / TRUNCATE; no RLS weakening; no
--   service-role usage (that stays in the edge function).
-- ============================================================

create extension if not exists pgcrypto;

-- Durable, platform-level deletion tombstone (deny-all; admin RPC only).
create table if not exists public.dealer_deletion_log (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  dealer_id text not null,
  deleted_by uuid,
  summary jsonb not null default '{}'::jsonb,
  auth_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now())
);
alter table public.dealer_deletion_log enable row level security;
revoke all on public.dealer_deletion_log from public, anon, authenticated;
create index if not exists dealer_deletion_log_dealer_idx
  on public.dealer_deletion_log (dealer_id, created_at desc);

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
  v_brand text;
  v_confirm text := trim(coalesce(p_confirm, ''));
  v_auth_ids uuid[] := '{}';
  v_summary jsonb := '{}'::jsonb;
  v_op uuid := gen_random_uuid();
  v_n bigint;
  v_existing public.dealer_deletion_log%rowtype;
  -- child tables purged BEFORE dealer_settings, FK-safe; each skipped if
  -- absent. crm_records carries properties/clients/deals; map_overlays the
  -- dealer's overlays; presentation_events/plotmap_daily_usage the analytics.
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

  -- Serialise concurrent deletes of the same dealer.
  perform pg_advisory_xact_lock(hashtext('plotmap:delete:dealer:' || v_dealer));

  -- Idempotent: if already deleted, return the durable tombstone (with the
  -- Auth ids) so the caller/edge function can finish an interrupted cleanup.
  if not exists (select 1 from public.dealer_settings d where d.dealer_id = v_dealer) then
    select * into v_existing from public.dealer_deletion_log l
      where l.dealer_id = v_dealer order by l.created_at desc limit 1;
    if found then
      return jsonb_build_object(
        'dealer_id', v_dealer, 'already_deleted', true,
        'operation_id', v_existing.operation_id,
        'deleted', v_existing.summary,
        'auth_user_ids', to_jsonb(v_existing.auth_user_ids));
    end if;
    raise exception 'unknown dealer';
  end if;

  -- Confirmation must equal the dealer id OR the business/brand name.
  select d.brand_name into v_brand from public.dealer_settings d where d.dealer_id = v_dealer;
  if lower(v_confirm) <> v_dealer and lower(v_confirm) <> lower(coalesce(v_brand, '')) then
    raise exception 'confirmation mismatch — type the exact dealer id or business name to confirm';
  end if;

  -- Owner/team Auth users to remove — but NEVER the caller, NEVER a platform
  -- admin, and NEVER a user who is also linked to another dealer.
  select coalesce(array_agg(p.id), '{}')
    into v_auth_ids
    from public.profiles p
    where p.dealer_id = v_dealer
      and p.id is not null
      and p.id <> v_admin
      and not exists (select 1 from public.platform_admins pa where pa.profile_id = p.id)
      and not exists (select 1 from public.profiles p2 where p2.id = p.id and p2.dealer_id <> v_dealer);

  -- Purge every dealer-scoped table (guarded), tallying row counts.
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is not null then
      execute format('delete from public.%I where dealer_id = $1', v_t) using v_dealer;
      get diagnostics v_n = row_count;
      v_summary := v_summary || jsonb_build_object(v_t, v_n);
    end if;
  end loop;

  delete from public.dealer_settings where dealer_id = v_dealer;
  get diagnostics v_n = row_count;
  v_summary := v_summary || jsonb_build_object('dealer_settings', v_n);

  insert into public.dealer_deletion_log (operation_id, dealer_id, deleted_by, summary, auth_user_ids)
  values (v_op, v_dealer, v_admin, v_summary, v_auth_ids);

  return jsonb_build_object(
    'dealer_id', v_dealer,
    'already_deleted', false,
    'operation_id', v_op,
    'deleted', v_summary,
    'auth_user_ids', to_jsonb(v_auth_ids)
  );
end;
$$;

revoke all on function public.plotmap_admin_delete_dealer(text, text) from public, anon, authenticated;
grant execute on function public.plotmap_admin_delete_dealer(text, text) to authenticated;

-- ============================================================
-- ROLLOUT (staging first; do NOT run against production without approval):
--   1. Review (admin gate; caller/platform-admin/shared-user exclusion;
--      confirmation guard; advisory lock; idempotency; tombstone).
--   2. Apply on STAGING. Verify: anon/dealer refused; a test dealer fully
--      purges; unrelated dealer untouched; platform admin untouched; repeat
--      delete is idempotent; cross-dealer confirmation rejected.
--   3. Deploy the `delete-dealer` edge function (service role) which calls
--      this RPC then deletes the returned auth_user_ids from GoTrue, and on
--      a retry re-reads the tombstone to finish any failed Auth deletions.
--   4. Only then apply to production and deploy the function there.
-- Rollback: drop function public.plotmap_admin_delete_dealer(text,text);
--   (a completed deletion is not reversible without a DB restore — hence the
--    confirmation guard, advisory lock and durable tombstone.)
-- ============================================================
