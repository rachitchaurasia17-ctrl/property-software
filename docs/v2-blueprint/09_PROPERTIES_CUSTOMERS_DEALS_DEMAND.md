# 09 · Properties, Customers, Deals, Demand

CRM entities all persist through `PMDataAdapter` into local `plotmap_crm_v1` and mirror to
`crm_records` (`entity_type` discriminator) in Supabase. `VERIFIED-CODE`/`VERIFIED-SQL`.

## Properties (My Plots) — `admin/properties.html`

The richest CRM surface. Also the **entry point for Private Client Links** (`#client-links`
anchor and `window.PM_CLIENT_LINKS_ENABLED = true`).

### Property payload fields (observed in create-link snapshot logic, `VERIFIED-SQL`
`20260728000100_private_client_links.sql:318-331` + verification fixture)

Client-safe / shown fields: `title`, `propertyType` (or `type`), `size`, `facing`,
`roadWidth`, `description`, `area`, `sector` (or `block`), `plotNumber`, `price`, `photos`
(array of https URLs), `photoStorage` (array of `{kind:'storage', path}`).
Gating fields: `clientVisible` (bool, default true), `internalStatus` (excluded if
`archived|internal|hold|sold|hidden`).
**Internal-only fields that MUST NEVER reach a client:** `sellerName`, `sellerPhone`,
`commission`, `negotiationNotes` (proven by the verification script's leak assertions,
`verify-private-client-links.sql:56-93`). `VERIFIED-SQL`.

### Photos
- Uploaded to Supabase Storage bucket **`property-photos`**, path
  `dealers/<dealerId>/...` (dealer-scoped; RLS-validated). `VERIFIED-SQL`
  `20260708_phase5_property_photo_storage_policies.sql`.
- Photo bucket name is a dealer setting (`photoBucket`, default `property-photos`).
  `VERIFIED-CODE` `admin/owner.html:313,357,377`, `admin/properties.html:523`.
- A property can hold up to 8 selectable photos for client links; each is referenced as
  `external:<0-7>` (an https URL in `payload.photos`) or `storage:<0-7>` (a
  `payload.photoStorage[i]` with `kind:'storage'` + `path`). `VERIFIED-SQL` link migration:274-299.

### Place-on-map
Properties link to a map/sector via pins/coordinates persisted in `pins`/`mapDrawings`
collections and the overlay store (`11`). `VERIFIED-CODE` (adapter collections, overlay-store).

## Customers (My Customers) — `admin/clients.html`
`entity_type='clients'`. Payload includes at least `name`, `phone`, `notes` (the fixture
uses `name`, `phone`, `notes`; `notes` is internal — the client link snapshot exposes only
the customer's **first name**). `VERIFIED-SQL` link migration:236-242, 351-353.

## Deals (My Deals) — `admin/deals.html`
`entity_type='deals'`. Stage vocabulary drives the shell "active deals" badge — a deal is
active when `stage !== 'closed' && stage !== 'lost'` (`plotmap-shell.js:100-107`). Deal
follow-ups persist under **`localStorage['plotmap_deal_followups_v1']`**
(`admin/deals.html:65`). `VERIFIED-CODE`.

## Demand
Represented through CRM collections (`followups`, `siteVisits`, and demand-style records in
`crm_records`). No dedicated table — it is CRM data with its own `entity_type`. The report
lists Demand as its own product surface pending redesign. `VERIFIED-CODE` (collections) /
`REPORT-CLAIM` (as a standalone screen).

## Lifecycle (Mermaid) — property create → client-safe share

```mermaid
flowchart TD
  A[Create/edit property in My Plots] --> B[PMDataAdapter.upsert('properties', payload)]
  B --> C[(local plotmap_crm_v1)]
  B --> D[PMSyncQueue → crm_records]
  A --> E[Upload photos → property-photos/dealers/<id>/...]
  A --> F[Open Client Links drawer #client-links]
  F --> G[Select ≤4 properties, ≤8 photos each, visibility, audio]
  G --> H[plotmap_create_client_link → frozen snapshot]
  H --> I[Internal fields stripped; only client-safe fields survive]
```

## Preserve / rewrite
- **Preserve (contract):** the `entity_type`/`payload` shape, the client-safe vs
  internal-only field split, the photo `external:`/`storage:` reference scheme, the
  `plotmap_deal_followups_v1` key, and the active-deal stage rule.
- **Rewrite (UI):** every page's markup/design in the V2 component system.
- **Verify in V2:** the internal-field leak protections are re-asserted by porting
  `verify-private-client-links.sql` (`24`).
