# 10 · Dashboard Analytics

Sources: `admin/owner.html` (Dealer Home), `admin/core/command-engine.js` (186),
`admin/core/report-engine.js` (83), `admin/core/finance-engine.js` (179),
`admin/core/dev360.js` (680), `admin/core/event-tracker.js` (290),
`admin/core/saas-foundation.js` (665). `VERIFIED-CODE`.

## Principle: derive, never fabricate

Analytics are **derived from real events and CRM data** — the shell explicitly refuses to
invent names or numbers ("fallbacks are generic … and NEVER fabricated sample names",
`plotmap-shell.js:12-14`). The report flags "fabricated dashboard intelligence" and
"fabricated demo activity" as things to keep out of V2. **Rule: no fake metrics.**
`VERIFIED-CODE` + `APPROVED-PRODUCT`.

## Event sources

Two event streams both persist into the local `presentationEvents` collection and mirror to
the append-only `presentation_events` table:

| Stream | Fired on | Emitter | Tag |
|---|---|---|---|
| Presentation events | `/app/plotmap/` only | `trackPresentationEvent` | `metadata.source='client_presentation'` |
| Product usage events | `/admin/*` (not developer) | `trackProductEvent` | `metadata.surface='admin'` |

Event shape (`event-tracker.js:154-168, 219-233`): `{ id, dealerId, userId, sessionId,
eventType, clientId, propertyId, mapId, area, sector, metadata, createdAt, syncStatus }`.
Allowed event types are constrained by `PRESENTATION_EVENTS` / `PRODUCT_EVENTS` sets;
payloads are sanitized (`sanitizePayload`) and env-tagged (`envTag`). Sessions:
`sessionStorage['plotmap_presentation_session']` and `['plotmap_admin_session']`.

**`app_open` ordering guard:** `app_open` must record + save before any other event
snapshots the store, or the outer save clobbers it (read-modify-write on localStorage).
`maybeMarkAppOpen` enforces this. `VERIFIED-CODE` `event-tracker.js:145-147, 216`.

## Derivation engines

| Engine | File | Role |
|---|---|---|
| Command engine | `command-engine.js` | filters/aggregates `events`+`presentationEvents` by type (`:12,:69`) |
| Report engine | `report-engine.js` | report rollups |
| Finance engine | `finance-engine.js` | finance/commission readiness views |
| Dealer-360 (dev360) | `dev360.js` | dealer analytics surface (largest analytics module) |
| SaaS foundation | `saas-foundation.js` | `PMFoundation`: dealer settings, account gate, plan/trial pill |

`PMFoundation.getAccountGate()` returns `{ status, plan:{ subscriptionStatus, trialEnd, … } }`
which the shell turns into the "Trial · N days left" pill (`plotmap-shell.js:83-98`).
`VERIFIED-CODE`.

## Known past defect (see `19`)
**Dashboard empty-array crash / fabricated-data risk.** `HISTORICAL`/`REPORT-CLAIM`: an
empty events array must not crash the dashboard, and the dashboard must not synthesize
activity. Current code guards with `Array.isArray(...) ? ... : []` throughout the derivation
engines. V2 must keep the same defensive derivation. Regression test in `24`.

## V2 decision
**ADAPT (logic) / REWRITE (UI).** Port the event vocabulary, the append-only rule, the
`app_open` ordering guard, and derive-don't-fabricate principle. Rebuild the derivation as a
typed analytics module with unit tests for empty/partial inputs; rebuild the dashboard UI in
the V2 design system.
