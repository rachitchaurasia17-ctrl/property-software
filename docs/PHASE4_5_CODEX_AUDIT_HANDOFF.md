# Phase 4/5 Backend Security Audit Handoff

Status: draft SQL only. Do not apply without a separate approval.

Draft migrations:
- `supabase/migrations/20260708_phase4_account_gating_enforcement.sql`
- `supabase/migrations/20260708_phase5_property_photo_storage_policies.sql`

## Phase 4 Account Gating

Decision: PHASE 4 SQL REVIEWED. Safe to apply only after the explicit run order
and preflight checks from the Phase 4 audit report.

The draft adds provider-controlled account status, account write gates, plan
limit helpers, and platform-admin RPCs. It blocks normal dealer writes to
provider-controlled account/storage/plan fields in both normalized
`dealer_settings` and local-first `crm_records` `dealerSettings` payloads.

Before applying:
- Seed `platform_admins` from trusted SQL, not from frontend code.
- Verify `dealer-demo` remains active before and after the migration.

## Phase 5 Property Photos

Decision: PHASE 5 SQL REVIEWED. Safe to apply for private, authenticated
admin-side uploads after the Phase 5 run order and checks. Not approved as a
full client-photo launch until a server-side signed-URL broker is built and
verified.

The draft creates a private `property-photos` bucket, limits object writes to
authenticated property editors/managers/owners in their own dealer path for an
existing property, enforces:
`dealers/<dealer_id>/properties/<property_id>/<file>`, restricts file types to
JPG/PNG/WebP up to 5 MB, and adds client-safe helper RPCs for future signed URL
serving.

Before enabling `storageEnabled`:
- Ensure uploads happen only after the property has a real saved ID.
- Add a server-side signed URL broker or Edge Function for Client Presentation.
- Keep any service-role key server-side only.

## Shared Safety

- No Supabase SQL was applied during cleanup.
- No direct anon table/object access is added.
- No service-role key belongs in frontend or committed tooling.
- Client Presentation safety remains unchanged.
