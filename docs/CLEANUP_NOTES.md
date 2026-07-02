# Cleanup Notes

## Phase 1 - Documentation And Route Hygiene

Started after a read-only audit. This phase intentionally avoids app behavior changes and map asset changes.

Files in scope:

- `README.md`
- `docs/README.md`
- `docs/MAP_ASSET_GUIDE.md`
- `docs/CLEANUP_NOTES.md`
- `tools/server.js`

## Audit Summary

- Repo root: `C:\Users\rachi_l35wosr\OneDrive\Desktop\xyz`
- Visible files scanned: 511
- Active client route: `/app/plotmap/`
- Active client entry: `app/plotmap/index.html`
- Active registry: `app/plotmap/map-registry.js`
- Registry count at audit time: 85 maps, 9 masterplans, 76 sectors
- Existing client audit: `node tools/audit-plotmap.js` passes
- Static HTML reference scan found no real missing local `src` or `href` references; only template placeholders were flagged.

## Important Findings

- `/app/plotmap/` is the clean client app.
- `/app/` currently points to an older demo with price and budget UI. It should not be used as the client route.
- `README.md` and `tools/server.js` had stale `/app/` guidance.
- `app/plotmap/styles.css` contains repeated sections for controls, filters, grids, and overlay styling.
- `app/plotmap/app.js` is a large monolithic runtime. Extracting modules should be done only after route and CSS cleanup.
- `admin/*` intentionally contains dealer/team/admin workflows. Keep it separate from the client route.
- Duplicate source map files exist, especially in `new chandigarh/`, but no map assets should be deleted in early cleanup phases.
- Temporary/generated files exist at the repo root and are archive candidates after the active app is validated.

## Safe Cleanup Plan

1. Documentation and route hygiene.
2. Protect or redirect the old `/app/` demo route.
3. De-duplicate CSS carefully while preserving cascade behavior.
4. Centralize data and map reference docs before moving code.
5. Keep admin tools under `/admin` and remove any accidental client links.
6. Archive obvious temp/generated files in small commits.
7. Only then consider splitting `app.js` into smaller vanilla JS files.

## Validation Checklist

Run after each phase:

```bash
node --check app/plotmap/app.js
node --check app/plotmap/data.js
node --check app/plotmap/datasets/tricity.dataset.js
node --check app/plotmap/datasets/sector-pins.js
node --check tools/generate-map-registry.js
node --check tools/server.js
node tools/audit-plotmap.js
```

Then manually verify `http://localhost:5173/app/plotmap/`:

- main page opens
- masterplan map loads
- sector maps open
- property list works
- no console errors
- no price, sold, add/edit, admin, or dealer-login controls in client view
- map images keep their original proportions
- tablet/mobile layout is still usable

## Phase 3 - Data Reference Centralization

Added `app/plotmap/datasets/map-config.js` as the first client data config loaded after `map-registry.js`.

Centralized:

- dataset ids
- Tricity fallback original, overlay, geometry, markings, and sector map paths
- legacy manifest fetch paths
- public/private visibility rules for hidden categories, CRM drawing kinds, POI defaults, and sector pin types
- sector pin labels
- sector city ordering
- property filter key order

Existing behavior stays the same: `app/plotmap/data.js` still owns shared categories and the dataset registry, `app/plotmap/datasets/tricity.dataset.js` still owns the Tricity roads/blocks/zones/pins/properties/sector maps, and `app/plotmap/app.js` still owns rendering.
