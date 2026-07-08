# Phase 4/5 Backend Security Audit Handoff

Status: draft SQL only. Do not apply without a separate approval.

Draft migrations:
- `supabase/migrations/20260708_phase4_account_gating_enforcement.sql`
- `supabase/migrations/20260708_phase5_property_photo_storage_policies.sql`

## Phase 4 Account Gating

Decision: SAFE DRAFT TO COMMIT, NOT approved to apply yet.

The draft adds provider-controlled account status, account write gates, plan
limit helpers, and platform-admin RPCs. It also blocks normal dealer writes to
account/billing/storage/plan fields in both normalized `dealer_settings` and
local-first `crm_records` `dealerSettings` payloads.

Before applying:
- Align owner UI so normal owners cannot edit provider-only account/billing
  fields that RLS will reject.
- Seed `platform_admins` from trusted SQL, not from frontend code.
- Verify `dealer-demo` remains active before and after the migration.

## Phase 5 Property Photos

Decision: SAFE DRAFT TO COMMIT, NOT approved to fully launch yet.

The draft creates a private `property-photos` bucket, limits object writes to
authenticated property editors in their own dealer path, enforces:
`dealers/<dealer_id>/properties/<property_id>/<file>`, and restricts file types
to JPG/PNG/WebP up to 5 MB.

Before enabling `storageEnabled`:
- Ensure uploads happen only after the property has a real saved ID.
- Add a server-side signed URL broker or Edge Function for Client Presentation.
- Keep any service-role key server-side only.

## Shared Safety

- No Supabase SQL was applied during cleanup.
- No direct anon table/object access is added.
- No service-role key belongs in frontend or committed tooling.
- Client Presentation safety remains unchanged.
