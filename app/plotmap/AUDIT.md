# PlotMap Engine And Asset Audit

Date: 2026-06-23

## Current Engine

PlotMap is a framework-free SPA loaded by `app/plotmap/index.html`.
Runtime order is:

1. `data.js` creates `window.PM`, shared categories, area registry, and dataset registry helpers.
2. `datasets/tricity.dataset.js` registers the current golden dataset as `tricity-aerotropolis`.
3. `app.js` resolves the active dataset with `PM.datasetFor(areaId)` and renders the app.

Original Map, Easy Map, property browsing, property detail, and sector proof all read from the active dataset. The app should remain dataset-driven as new maps are added.

## Current Data Boundaries

- Shared category taxonomy and area switcher: `app/plotmap/data.js`.
- Current golden dataset assets, key roads, blocks, zones, pins, properties, filters, and sector maps: `app/plotmap/datasets/tricity.dataset.js`.
- Original Map geometry: `app/plotmap/geo.json`.
- Dataset expansion instructions: `app/plotmap/ADDING-A-MAP.md`.
- Source inventory registry: `config/sources.json`.

## Runtime Hotspots

- Dataset loading: `useDataset()` in `app.js`.
- Category and item lists: `catItems()`, `catItemsPanelHTML()`.
- Original Map rendering and road selection: `origSVG()`, `updateMapOverlays()`.
- Easy Map rendering and spotlighting: `easySVG()`, `updateMapOverlays()`.
- Sector hub and proof view: `sectorsHubHTML()`, `openSector()`, `openSectorHub()`, `renderProof()`.

## Untracked Root Assets

- `Untitled (1).png`: official original 4599 x 3069 masterplan image.
- `parent (3).png`: byte-identical duplicate of `Untitled (1).png`.
- `parent (1).svg`: aligned overlay SVG. It has usable semantic IDs for key roads, blocks, zones, pins, Aerocity sectors, and a separate `internal roads` group.

Do not rename or move these files until the source-of-truth asset choice is confirmed. The duplicate PNG should not be committed twice.

## Safe Changes Identified

- Remove client-facing validation wording from roads/items.
- Make block categories, area filters, and sector hub chips data-driven instead of Aerocity/Aerotropolis-specific.
- Allow sector maps to carry their own asset path and hide unavailable maps from the client-facing hub.
- Keep internal roads background-only, unnamed, non-clickable, and out of sidebars.
- Add a small client-facing no-price audit script.
- Expand documentation for future Figma/SVG exports and dataset wiring.
