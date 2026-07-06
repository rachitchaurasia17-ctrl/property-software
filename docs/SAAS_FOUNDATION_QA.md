# SaaS Foundation QA

Use this checklist after SaaS foundation changes. Updated 2026-07-06 (permissions enforcement + share links + billing readiness sprint).

## Automated checks

```
node tools/audit-plotmap.js
node --check admin/core/auth.js
node --check admin/core/access-control.js
node --check admin/core/nav.js
node --check admin/core/data-adapter.js
node --check admin/core/sync-queue.js
node --check admin/core/supabase-sync.js
node --check admin/core/overlay-store.js
node --check admin/core/saas-foundation.js
node --check admin/crm-store.js
node --check app/plotmap/app.js
```

## Routes

- `/` — only two cards (Open Client Presentation, Dealer Login)
- `/app/plotmap/` — public, no login, no internal data
- `/admin/owner.html` — owner only
- `/admin/team.html` — any staff rank; viewers bounced to `/app/plotmap/`
- `/admin/map-studio.html` — needs `mapstudio.manage`
- `/admin/properties.html` — needs `properties.manage`
- `/admin/deals.html` — needs `deals.view`
- `/admin/clients.html` — needs `clients.view`
- `/admin/area-intelligence.html`, `/admin/property-insights.html` — owner OR granted `insights.view`

## Permissions

- Signed-out user on any admin route → redirected to `/` login.
- Team member typing a blocked admin URL → redirected to `/admin/team.html?denied=…` with a notice, NOT signed out.
- Viewer profile → routed to `/app/plotmap/`; cannot open the admin shell.
- Team nav shows only permitted pages; insights entries appear only with `insights.view`.
- Map Studio publish without `mapstudio.publish` → "Saved as draft" modal; work preserved.
- Team page: add/edit/disable/remove requires `team.manage`; others see read-only list + note.
- Adding a member beyond the plan's `max_team_members` shows a clear error.

## Dealer settings & branding

- Owner saves business name, logo URL, phone, WhatsApp, emails, default city/map, presentation title/tagline, share message, bucket — no console errors.
- Sync state line shows "waiting to sync" (pending) vs "synced".
- Client Presentation topbar brand + area-select hero reflect brand/presentation title on the same device (other devices after sync).
- No billing/team/internal settings visible anywhere in `/app/plotmap/`.

## Share links

- Create whole-presentation and map-specific links, with and without expiry.
- Copy / Open / Disable / Enable each work; disabled state renders red.
- Link opens the public presentation; `presentation_opened` event metadata carries `shareSlug`.
- Pre-migration: disabling records + queues only (documented). Post-migration: disabled/expired link shows "no longer active" notice.

## Backup

- Export downloads a dated JSON including settings/users/properties/events.
- Importing a bad file → blocked with reason; importing a valid file → dry-run counts confirm dialog; cancel changes nothing.

## Plan & billing readiness

- Plan card shows plan, state, trial end, property usage vs limit.
- Setting account status to `suspended` or an expired trial blocks add-flows with a message.
- No billing entry in main nav.

## Sync / offline

- Topbar badge: Synced / Pending / Failed (tap to retry) / Offline states; tap always triggers a drain.
- Client Presentation shows the offline badge when connectivity drops and keeps rendering cached data.
- Queue items drain online, prune after retention, back off on failure.

## Audit

- Owner dashboard "Recent audit activity" shows entries for: login, property add/edit/archive, overlay publish/hide/delete, team changes, settings saves, share-link create/disable, export/import.
