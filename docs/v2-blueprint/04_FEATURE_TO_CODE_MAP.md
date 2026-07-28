# 04 · Feature → Code Map

The index that turns "which feature?" into "which files, functions, tables, RPCs?"
`VERIFIED-CODE` / `VERIFIED-SQL` unless noted. Machine mirror: `manifests/features.json`,
`manifests/source-files.json`.

| Feature | Frontend files | Core symbols | Server objects (RPC / table / bucket) | Deep doc |
|---|---|---|---|---|
| Runtime config | `config/runtime-env.js`, `config/supabase-config.js` | `PMRuntimeConfig.getSupabaseConfig` | — | `02`, `17` |
| Auth / session | `admin/core/auth.js` | `PMAuth.signIn/getSession/getCurrentProfile/requireProfile` | GoTrue `/auth/v1/*`, `profiles` table | `05` |
| Device activation gate | `admin/core/device-access.js`, `index.html`, `access-expired.html` | `PMDeviceAccess.isApproved/getAccessReason/requireApproved` | `plotmap_device_is_approved`, `plotmap_device_status`, `plotmap_device_access_reason`, `plotmap_submit_activation_request` | `06` |
| Route/role guard | `admin/core/access-control.js` | `guardPage`, `resolveScopes`, `hasScope` | `plotmap_is_platform_admin` (dev route) | `03`, `05` |
| Local-first CRM | `admin/core/data-adapter.js`, `admin/crm-store.js`, `admin/crm-data.js` | `PMDataAdapter.getData/list/upsert/patch`, `CRM.*` | `localStorage plotmap_crm_v1` | `08` |
| Background sync | `admin/core/sync-queue.js`, `admin/core/supabase-sync.js` | `PMSyncQueue.enqueueSyncAction`, `PMSupaSync.requestDrain` | REST `crm_records`, `presentation_events`, mapping in `supabase-sync.js:124` | `08` |
| Dealer settings / account gate | `admin/core/saas-foundation.js`, `admin/owner.html` | `PMFoundation.getDealerSettings/getAccountGate/saveDealerSettings` | `dealer_settings` table | `10` |
| Dealer app shell | `admin/core/plotmap-shell.js`, `admin/core/plotmap-ds.css` | `PMShell.mount/toast/confirm`, `PMShell.NAV` | — | `02` |
| Properties (My Plots) | `admin/properties.html` | photo upload, place-on-map, client-link drawer | `crm_records(entity_type=properties)`, bucket `property-photos` | `09`, `14` |
| Customers | `admin/clients.html` | CRM client records | `crm_records(entity_type=clients)` | `09` |
| Deals | `admin/deals.html` | follow-ups `plotmap_deal_followups_v1` | `crm_records(entity_type=deals)` | `09` |
| Demand | (CRM collection `demand`/`followups`/`siteVisits`) | adapter collections | `crm_records` | `09` |
| Dashboard analytics | `admin/owner.html`, `admin/core/command-engine.js`, `report-engine.js`, `finance-engine.js`, `dev360.js` | derive-from-events | `presentation_events`, local CRM | `10` |
| Map engine | `app/plotmap/app.js`, `map-registry.js`, `overlay-engine.js`, `overlay-capture.js`, `datasets/*` | `PM_MAP_REGISTRY`, overlay/pin rendering | maps under `/maps/` and `/normal maps/` | `11` |
| Client Presentation | `app/plotmap/index.html`, `app/plotmap/app.js`, `styles/violet-dusk-foundation.css` | presentation events | `presentation_events` (append-only) | `12` |
| Private Client Links (dealer) | `admin/core/plotmap-client-links.js`, `admin/properties.html` (`#client-links`) | `PMClientLinks.create/list/revoke/extend/uploadAudio/removeAudio` | `plotmap_create/list/revoke/extend_client_link`, `share_links`, bucket `client-link-audio` | `13` |
| Private Client Links (buyer) | `client/index.html`, `client/app.js`, `client/styles.css` | `resolveLink`, `event()` | Edge `resolve-client-link`, `plotmap_resolve_client_link`, `plotmap_record_client_link_event` | `13`, `16` |
| Signed media broker | `supabase/functions/resolve-client-link/index.ts` | `sign()`, `plotmap_resolve_client_link_media` | Storage sign API; service role | `14`, `16` |
| Dealer provisioning | `admin/developer.html`, `supabase/functions/provision-dealer/index.ts` | `plotmap_admin_begin/mark/finalize/fail/get_dealer_provisioning*` | provisioning RPC chain | `07`, `16` |
| Dealer deletion | `admin/developer.html`, `supabase/functions/delete-dealer/index.ts` | `plotmap_admin_delete_dealer` | purge RPC + storage/auth cleanup | `16`, `18` |
| Build / deploy | `tools/build-dist.js`, `tools/generate-runtime-env.js`, `vercel.json`, `.vercelignore` | allowlist copy + secret scan | Vercel static hosting | `17` |
| Isolation verification | `tools/verify-isolation.js`, `tools/verify-private-client-links.sql` | rollback-wrapped SQL probes | all RLS/RPCs | `19`, `24` |

## Feature-delta the report flagged (verify in V2 planning)

`APPROVED-PRODUCT` (Master Context Report) listed these as **pending redesign** at the time
of writing (may or may not have been completed later): My Deals, My Customers, Demand,
Team Workspace, Area Intelligence, Property Insights, Map Studio, full Client Presentation
layout/photo rail. The **backend and Client Links** were reported complete. Treat the
pending list as a V2 **completeness checklist**, not as proof of current state. `REPORT-CLAIM`.

## Legacy vs current design layers (must not blend in V2)

- Current: `admin/core/plotmap-ds.css` (dealer), `app/plotmap/styles/violet-dusk-foundation.css`
  (presentation) — the "violet-dusk" system. `VERIFIED-CODE`.
- Legacy: `admin/crm-ui.css` — the old CRM styling. **Prohibited in V2** (`21`).
