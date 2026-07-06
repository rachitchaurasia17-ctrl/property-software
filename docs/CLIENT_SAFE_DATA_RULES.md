# Client-Safe Data Rules

Last updated: 2026-07-06.

The single question every field must pass: **"Would the dealer be comfortable with a rival buyer reading this?"**

## Client-safe property fields (the complete whitelist)

`id, title, size, block, plotNumber, area, plotType, roadFacing, description, photos (https URLs only, max 8), availability ('Available' only), blockId, masterMapId, sectorMapId`

Everything else on a property record is internal by definition — including but not limited to: `price`, any money field, `internalStatus` raw values, `sellerContact`, `commission`, `notes`, `dealerId` internals, sync metadata.

## Client-safe dealer-branding fields

`brandName, brandTagline, presentationTitle, presentationTagline, shareMessage` — display text only. Phone/WhatsApp numbers are used to *compose* outbound share messages, never displayed as internal data dumps.

## Where the boundary lives

| Boundary | File |
|---|---|
| `crmClientProperties()` whitelist map | `app/plotmap/app.js` |
| `client_safe_properties` SQL view | `supabase_security_patch.sql` |
| `publishedForClient()` + `LEAK_RE` | `admin/core/overlay-store.js` |
| `dealerBranding` whitelist | `app/plotmap/app.js` |
| Leak-word audit | `tools/audit-plotmap.js` |

## Rules for future changes

1. Add a field to the client view? Add it to **both** `crmClientProperties()` and the `client_safe_properties` view, and ask the rival-buyer question first.
2. Never pass a raw CRM record into any client render function.
3. Never add user-facing technical words (SVG, polygon, coordinates, geometry, vector, path, layer) to client or dealer UI copy.
4. Run `node tools/audit-plotmap.js` after any client-bundle change.
