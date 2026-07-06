# Client Share Links

Last updated: 2026-07-06.

Dealers create shareable links that open the **public, client-safe** Client Presentation. Links never expose admin data, prices, sold status, or internal fields, and never allow editing — they are plain URLs into `/app/plotmap/`, which contains only published client-safe data by design.

## Creating & managing

Owner dashboard (`/admin/owner.html`) → **Client share links** card:
- Create a link for the whole presentation or a specific map, with an optional expiry date.
- Copy / Open / Disable / Enable per link. Every action is audit-logged.
- Property-specific links are also created automatically when a property is shared via WhatsApp from `/admin/properties.html`.

## Anatomy

`https://<host>/app/plotmap/?dealer=<dealer-id>&share=<slug>[&map=…][&property=…]`

- `slug` — 12-char random token generated with `crypto.getRandomValues` (`PMFoundation.createShareLink`).
- The record (`shareLinks` collection): `dealerId`, `slug`, `label`, `targetType`, `targetId`, `mapId`, `url`, `status`, `expiresAt`, `revokedAt`.

## Enforcement — honest status

| Capability | Now (migration NOT applied) | After migration applied |
|---|---|---|
| Link opens client-safe presentation | ✅ | ✅ |
| Works on mobile/tablet | ✅ | ✅ |
| Presentation events tagged with the slug | ✅ (`shareSlug` in `presentation_opened` metadata) | ✅ |
| Active/disabled enforced | ⚠️ recorded + queued only; a disabled link still opens the public presentation | ✅ `plotmap_resolve_share_link` RPC returns nothing for disabled/expired links; client shows "link no longer active" notice |
| Expiry enforced | ⚠️ shown in admin UI only | ✅ via the same RPC |
| Map-specific | ✅ (URL param) | ✅ |

This is deliberately **not** presented as a fully-enforced system pre-migration. The fallback is safe because the presentation is public anyway; enforcement adds revocation, not confidentiality.

## Backend

- `share_links` table: staff-only RLS (dealer-scoped); anon has **no** table access.
- `plotmap_resolve_share_link(share_slug text)` — security-definer RPC, executable by anon, returns only `(dealer_id, target_type, target_id, map_id, label)` for active, non-revoked, non-expired links.
- Client code: `resolveShareLink()` in `app/plotmap/app.js` — calls the RPC when online; silently falls back when the RPC doesn't exist yet or the device is offline.
