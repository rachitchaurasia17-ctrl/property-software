# Client Presentation Rules

Last updated: 2026-07-06.

`/app/plotmap/` is the client-facing surface. It is **public** (no login) and must stay client-safe.

## Never show

- price / rate / budget / any money figure
- sold status (sold properties are filtered out entirely)
- seller contact / owner contact
- commission / finance / deals data
- internal notes or internal-only properties
- staff / team data
- admin controls of any kind
- draft, hidden, or archived maps and overlays

## How this is enforced in code

1. **Property shape whitelist** — `crmClientProperties()` in `app/plotmap/app.js` maps CRM records to an explicit client-safe shape (title, size, block, plotNumber, area, type, facing, description, https photos, availability). Fields not in the map cannot leak.
2. **Status filter** — regex `archived|internal|hold|sold|hidden` on `internalStatus`, plus `clientVisible !== false`.
3. **Overlay filter** — `PMOverlayStore.publishedForClient()`: only `status === 'published' && clientVisible !== false && !deleted`, plus a leak-word regex on names (`price|₹|Rs|crore|lakh|budget|sold|seller|commission|finance|internal|draft|…`).
4. **Backend projection** — anon devices pull properties only through the `client_safe_properties` view; `crm_records` is staff-only RLS.
5. **Analytics are one-way** — the presentation only INSERTs `presentation_events` (anon insert policy requires `metadata.source = 'client_presentation'`); it can read nothing back.
6. **Audit** — `node tools/audit-plotmap.js` greps the client bundle for leak words; run it before every commit that touches `app/plotmap/`.

## Dealer branding on the presentation

Allowed (client-safe, from dealer settings): business name, brand tagline, presentation title, presentation tagline, share message. Applied in the topbar brand and the area-select hero. **Not allowed:** billing fields, plan state, team data, contact lists, internal settings.

## Tracking rules

- Only real client actions in the presentation fire events (`window.logEvent` exists only in `app/plotmap/app.js`).
- Admin browsing must never count as client analytics — admin pages have no logEvent.
- Share-link opens are tagged with the link slug (`shareSlug`) for attribution; nothing about the client is collected beyond the anonymous session id.
- Never upsert `presentation_events` — the table is append-only for anon (plain INSERT; a 409 means the row already landed).
