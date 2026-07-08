# Property Photo Storage — Handoff (Phase 5)

_Prepared by Claude · updated 2026-07-08 · branch `phase-1-5-role-and-isolation-prep`_

> **STATUS: APP-SIDE BUILT · BACKEND CODEX-GATED.** The Properties photo
> workflow (URL links + gated Storage upload, preview, progress, remove) is
> built. The Supabase Storage bucket + per-dealer RLS + signed-URL serving are
> **NOT** live — the uploader stays hidden until a dealer's `storageEnabled` is
> true, which requires the Codex-reviewed policies. No service-role key; no
> policies applied.

## Storage path pattern

`dealers/<dealer_id>/properties/<property_id>/<file>.jpg`
(from `PMFoundation.buildPhotoObjectPath`; the dealer segment is enforced by the
proposed Storage RLS: `(storage.foldername(name))[2] = plotmap_current_dealer_id()`).
Bucket: **`property-photos`** (private).

## Frontend behavior (built, `admin/properties.html` + `PMPhotoManager`)

- **Two photo kinds**, both saved on the property via `photoStorage`:
  - **URL links** — the existing comma-separated `https` field (unchanged; not broken).
  - **Storage uploads** — objects under the per-dealer folder (gated).
- **Photo manager** — chips for every current photo (URL + uploaded), each with
  a **✕ remove**; updates the property record on save.
- **Upload UX** (visible only when `storageEnabled === true`):
  - Multiple files; validates **JPG/PNG/WebP**, **≤ 5 MB** each (rejected files
    flagged in the selection preview).
  - Signed-in user's access token only (`PMAuth.getAccessToken`) — **no
    service-role key**.
  - Per-file **progress/status** ("Uploading 2/3 …").
  - **Graceful failure** — on 400/404 it says the bucket/policies may not be live;
    on 401/403 it points to Storage RLS; on network error it reassures that saved
    photos are unaffected. Nothing crashes; URL photos keep working.
- **Save model** — `photoStorage` entries are `{kind:'external',publicUrl}` for
  URLs and `{kind:'storage',path,publicUrl:null}` for uploads. Storage photos
  show as "stored/pending" and are **not** rendered to clients until signed-URL
  serving lands (private bucket, no anon read → no leak).
- **Client Presentation safety** — unchanged. Photos only ever come from
  client-visible properties; internal/archived/hidden properties never surface
  photos. `app/plotmap/*` untouched.

## Required bucket / policy SQL (draft — Codex must review + apply)

`supabase/migrations/20260708_phase5_property_photo_storage_policies.sql`:
- **ACTIVE (safe):** create the **private** `property-photos` bucket (idempotent).
- Staff write (insert/update/delete) is confined to property editors/managers/
  owners in their own dealer folder for an existing property.
- Staff read is confined to authenticated members of the same dealer.
- Client-safe allow/list helper RPCs support a future signed-URL broker.
- No anon/public object read. No `using(true)`. No destructive ops.

Client Presentation still needs a server-side signed-URL broker or Edge
Function before Storage photos are shown to clients. The broker must keep any
service-role key server-side, call the client-safe helper, and return short-lived
signed URLs only for allowed paths.

## Codex audit checklist

- [ ] Bucket is private; no public policy; no anon object read.
- [ ] Staff write/read limited to `(storage.foldername(name))[2] = plotmap_current_dealer_id()`.
- [ ] Signed-URL broker returns URLs only for paths allowed by
      `plotmap_client_property_photo_allowed` /
      `plotmap_client_property_photo_objects`.
- [ ] No service-role key path in the frontend.
- [ ] Additive/idempotent; no destructive ops; no RLS weakening elsewhere.

## Cross-dealer storage test checklist

- [ ] Dealer A staff cannot upload into dealer B's folder (RLS rejects).
- [ ] Dealer A staff cannot read/list dealer B's objects.
- [ ] Anon cannot GET an object path directly.
- [ ] Signed-URL broker resolves a client-visible photo; returns null for a
      hidden/archived/internal property.
- [ ] Client Presentation shows photos only for client-visible properties.
- [ ] Upload of a >5 MB or non-image file is rejected client-side (and would be
      rejected server-side by content limits Codex sets).

## Rollback / fallback behavior

- **Backend missing / not live:** `storageEnabled=false` → uploader hidden; the
  app runs exactly as before on **URL photos**. If enabled prematurely, uploads
  fail gracefully with a helpful message and existing photos are untouched.
- **Disable the feature:** set `storageEnabled=false` for the dealer — the
  uploader disappears; previously recorded storage paths remain on the property
  (harmless; simply not shown until serving is live).
- **Removing a bad object:** remove its chip in the manager and save; Codex-side,
  orphaned objects can be pruned by a maintenance job (out of scope here).
