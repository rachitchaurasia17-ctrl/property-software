# Property Photo Storage — Handoff (Phase 5 PREP)

_Prepared by Claude · 2026-07-07 · branch `phase-1-5-role-and-isolation-prep`_

> **STATUS: PREP + INERT UI.** A gated upload UI is added to the Properties page
> but is **hidden until `dealer_settings.storageEnabled = true`**, which requires
> the bucket + Storage RLS from the draft migration to be applied and reviewed by
> Codex first. Nothing is applied to Supabase. Not production-trusted until Codex
> audits the Storage RLS below.

## What IS built (safe, this branch)

- **Upload UI** in `admin/properties.html` — a file picker + "Upload to storage"
  button inside the Add/Edit Property form. **Hidden** unless
  `PMFoundation.getDealerSettings().storageEnabled === true` (default `false`),
  so production behavior is unchanged.
- **Client-side validation** — only `image/jpeg|png|webp`, max **5 MB** each.
- **Per-dealer path** via existing `PMFoundation.buildPhotoObjectPath`:
  `dealers/<dealer_id>/properties/<property_id>/<file>.jpg`.
- **Upload call** — `POST {SUPABASE_URL}/storage/v1/object/<bucket>/<path>` with
  the signed-in user's access token (no service-role key). On success the object
  path is appended to the property's photo list and saved with the property.

## What is NOT done (needs Supabase + Codex)

1. **Bucket + RLS** — `supabase/migrations/20260707_storage_photo_policies_draft.sql`
   creates the private `property-photos` bucket (active, safe) and contains, as
   **commented** SQL, the per-dealer staff write/read policies and the
   client-visibility signed-URL RPC. **Codex must review + apply.**
2. **Serving to Client Presentation** — the bucket is **private**. Photos must be
   served via short-lived **signed URLs** returned by a security-definer RPC that
   checks the property is client-visible + published + not-deleted for that
   dealer (drafted as `plotmap_client_photo_url`). Client Presentation must show
   photos **only for client-visible properties**.
3. **Enable the flag** — after policies land, set `storageEnabled = true` per
   dealer (owner setting) to reveal the upload UI.
4. **Draft vs saved property** — uploading before first save uses a `draft`
   folder segment; Codex/impl should move/rename objects to the real
   `property_id` on save, or require save-before-upload.

## Rules honored

- Per-dealer folder isolation (`dealer_id` in the path, enforced by the proposed
  `(storage.foldername(name))[2] = plotmap_current_dealer_id()` policy).
- No anon direct object read; client read only via visibility-checked signed URL.
- No service-role key in the frontend.
- Client Presentation shows photos only for client-visible properties.

## Exact Codex prompt

```
Implement PlotMap property-photo Storage RLS on Supabase.
Context: supabase/migrations/20260707_storage_photo_policies_draft.sql,
docs/STORAGE_PHOTO_UPLOAD_HANDOFF.md. Bucket 'property-photos' is private.
Folder: dealers/<dealer_id>/properties/<property_id>/<file>.
Requirements:
- Staff (plotmap_is_staff) may insert/update/delete/select ONLY objects whose
  path dealer segment = plotmap_current_dealer_id(). No using(true).
- No anon/public object read. Serve Client Presentation photos via a
  security-definer RPC returning a signed URL ONLY when the property
  (crm_records, entity_type='properties') is client-visible + not deleted for
  that dealer.
- No service-role in frontend. Additive/idempotent. No destructive ops.
Output final SQL + the signed-URL mechanism + a test matrix (staff cross-dealer
write denied; anon object read denied; client-visible photo resolves, hidden
one does not).
```

## Verification still required before calling Phase 5 complete

- [ ] Codex applies bucket + Storage RLS on staging.
- [ ] Staff of dealer A cannot read/write dealer B's photo objects.
- [ ] Anon cannot read objects directly; only visibility-checked signed URLs work.
- [ ] Client Presentation shows photos for client-visible properties only.
- [ ] Upload UI enabled (`storageEnabled`) and round-trips (upload → save →
      appears in presentation) on staging.
