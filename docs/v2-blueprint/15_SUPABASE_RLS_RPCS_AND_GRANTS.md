# 15 · Supabase RLS, RPCs, and Grants

Authoritative source: the 16 migration files in `supabase/migrations/` (`VERIFIED-SQL`).
Live DB state is `UNVERIFIED-LIVE` (Supabase MCP unauthenticated this session) — the
migrations on disk are the contract to port. Manifests: `manifests/database-objects.json`,
`manifests/rpcs.json`, `manifests/rls-policies.json`, `manifests/grants.json`.

## Migration timeline (on disk, in order)

| File | Brings |
|---|---|
| `20260706_saas_foundation_scaffold.sql` | `profiles`, `plotmap_current_role()`, `plotmap_current_dealer_id()` |
| `20260707_multi_dealer_isolation_draft.sql` | dealer isolation draft, `plotmap_dealer_is_active` |
| `20260707a_multi_dealer_rpc_setup.sql` | multi-dealer RPC setup, `plotmap_dealer_is_active` |
| `20260707b_multi_dealer_anon_lockdown.sql` | anon lockdown |
| `20260707_storage_photo_policies_draft.sql` | `property-photos` bucket (draft) |
| `20260707_team_permissions_rls_draft.sql` | `plotmap_is_active_member/can_edit_properties/can_edit_crm` (draft) |
| `20260708_team_role_rls_enforcement.sql` | enforced team-role RLS + helper functions |
| `20260708_phase4_account_gating_enforcement.sql` | `plotmap_dealer_is_active`, `plotmap_dealer_can_write` |
| `20260708_phase5_property_photo_storage_policies.sql` | `property-photos` bucket + `plotmap_photo_dealer_id/property_id/property_photo_path_is_valid` + policies |
| `20260710_developer_control_and_trial_analytics_draft.sql` | developer control + trial analytics (draft) |
| `20260719_dealer360_analytics_draft.sql` | dealer-360 analytics (draft) |
| `20260722_one_click_dealer_provisioning.sql` | provisioning RPC saga + device/activation |
| `20260723_auto_approve_device_activation.sql` | auto-approve device activation |
| `20260724000100_onboarding_access_and_dealer_deletion.sql` | onboarding access + `plotmap_admin_delete_dealer` |
| `20260728000100_private_client_links.sql` | Private Client Links (tables, RPCs, storage, grants) |
| `20260728000200_private_client_links_grant_hardening.sql` | revoke legacy broad grants on share_links/events |

> Note `_draft` files: several early drafts were later superseded by enforced versions
> (e.g. team-role RLS `20260707_…draft` → `20260708_team_role_rls_enforcement`, storage
> `20260707_…draft` → `20260708_phase5_…`). When porting, prefer the **enforced** version;
> see `19` (migration-history mismatch). `INFERENCE`/`HISTORICAL`.

## Core RLS helper functions (the isolation primitives)

| Function | Defined in | Meaning |
|---|---|---|
| `plotmap_current_role()` | `20260706_saas_foundation_scaffold.sql:52` | caller's role from JWT/profile |
| `plotmap_current_dealer_id()` | `…scaffold.sql:62` | caller's tenant id — the RLS anchor |
| `plotmap_is_active_member()` | `20260708_team_role_rls_enforcement.sql:56` | active team member of a dealer |
| `plotmap_can_edit_properties()` | `…enforcement.sql:67` | property-edit scope |
| `plotmap_can_edit_crm()` | `…enforcement.sql:78` | CRM-edit scope |
| `plotmap_dealer_is_active(dealer)` | `20260708_phase4_account_gating_enforcement.sql:72` | account/trial gate |
| `plotmap_dealer_can_write(dealer)` | `…phase4…:97` | write allowed for dealer state |
| `plotmap_photo_dealer_id(path)` | `20260708_phase5_…:37` | dealer from photo path |
| `plotmap_photo_property_id(path)` | `…phase5…:52` | property from photo path |
| `plotmap_property_photo_path_is_valid(path)` | `…phase5…:67` | photo path validator |
| `plotmap_is_platform_admin()` | provisioning migration | platform-admin check (used by Edge fns + dev route) |

Every table policy is anchored to `dealer_id = plotmap_current_dealer_id()` plus a scope
check. Example (`share_links` non-client-link DML): `target_type<>'client_link' AND
plotmap_can_edit_crm() AND dealer_id=plotmap_current_dealer_id() AND
plotmap_dealer_can_write(dealer_id)`. `VERIFIED-SQL` link migration:122-153.

## RPC catalog (by domain)

**Device / activation:** `plotmap_device_is_approved`, `plotmap_device_access_reason`
(read-only, anon), `plotmap_device_status` (may insert), `plotmap_submit_activation_request`,
`plotmap_admin_create_dealer_activation_code`.
**Provisioning:** `plotmap_admin_begin/mark/finalize/fail/get_dealer_provisioning*`,
`plotmap_service_auth_user_by_email`, `plotmap_is_platform_admin`.
**Deletion:** `plotmap_admin_delete_dealer` (confirmation-guarded).
**Client links:** `plotmap_create/list/revoke/extend_client_link`,
`plotmap_resolve_client_link` (anon), `plotmap_resolve_client_link_media` (service only),
`plotmap_record_client_link_event` (anon), `plotmap_client_link_can_manage`,
`plotmap_client_link_audio_path_is_valid`.
**Analytics:** `plotmap_record_presentation_event` (referenced by event tracker).

Full signatures for client-link RPCs are in `13`. `VERIFIED-SQL`/`VERIFIED-CODE`.

## SECURITY DEFINER discipline
Every privileged RPC is `security definer`, `set search_path = public[, storage]`, and does
`revoke all … from public, anon, authenticated` **then** grants only to the exact needed
role. The public snapshot resolver is granted to `anon`; the media resolver is granted to
`service_role` **only** and internally checks `auth.role()='service_role'`. `VERIFIED-SQL`.

## Grant hardening (a real past bug — see `19`)
`20260728000200` revokes **legacy broad table grants** that RLS was masking:
```
revoke all on public.share_links from anon, authenticated;
grant select,insert,update,delete on public.share_links to authenticated;
revoke all on public.client_link_events from anon, authenticated;
grant select on public.client_link_events to authenticated;
revoke all on public.client_link_access_windows from anon, authenticated;
```
So anon has **no** direct table privileges; authenticated has only the DML that dealer-scoped
RLS then constrains. The verification script asserts these grants are absent. `VERIFIED-SQL`.

## Isolation model (Mermaid)
```mermaid
flowchart TD
  Q[Any query] --> R{RLS policy}
  R --> A[dealer_id = plotmap_current_dealer_id()]
  R --> B[scope: is_active_member / can_edit_*]
  R --> C[account: dealer_is_active / dealer_can_write]
  A & B & C --> OK[Row visible/writable]
  D[Privileged action] --> E[SECURITY DEFINER RPC]
  E --> F[re-checks auth.uid + role + dealer inside body]
  F --> OK
```

## V2 decision
**REUSE.** Port the migrations into the new Supabase project **in order**, preferring
enforced over draft versions, keep the helper functions and the grant-hardening, and re-run
the verification scripts before trusting the environment. Never grant a table directly to
anon; never expose the media resolver beyond `service_role`.
