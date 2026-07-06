# SaaS Foundation QA

Use this checklist after the SaaS foundation scaffold changes.

## Routes

- `/`
- `/app/plotmap/`
- `/admin/owner.html`
- `/admin/team.html`
- `/admin/properties.html`
- `/admin/map-studio.html`

## Security

- Confirm admin routes redirect anonymous users back to `/`.
- Confirm `/app/plotmap/` still shows no dealer, team, price, sold, seller, or contact data.
- Confirm client analytics still come only from the client route.
- Confirm dealer-scoped admin pages do not show another dealer's properties, users, overlays, or presentation events when `plotmap_dealer_id` changes.

## Dealer Foundation

- Owner page saves dealer brand/contact/billing settings without console errors.
- Owner page exports a JSON backup.
- Owner page imports a previously exported JSON backup.
- Owner page generates a client share link with `dealer=` in the URL.

## Team Foundation

- Team page lists current dealer members only.
- Adding a team member stores role, status, and permission scopes.
- Removing a team member marks status as `removed`.

## Property Foundation

- Property form still adds and edits properties.
- Property cards still open, place, share, archive, and hide properties.
- Photo storage note/path updates when opening the property form.
- Client share links still open the client presentation safely.

## Sync And Offline

- `node tools/audit-plotmap.js`
- `node --check admin/core/data-adapter.js`
- `node --check admin/core/sync-queue.js`
- `node --check admin/core/supabase-sync.js`
- `node --check admin/core/overlay-store.js`
- `node --check admin/core/saas-foundation.js`
- `node --check admin/crm-store.js`
- `node --check app/plotmap/app.js`

- Confirm sync queue drains while online.
- Confirm synced queue items prune after retention.
- Confirm offline edits remain in queue and retry later.
