# PlotMap

PlotMap is a framework-free, client-facing real-estate map presentation app. The current client experience is map-first and lives at:

```bash
node tools/server.js
# open http://localhost:5173/app/plotmap/
```

The original map files are protected proof layers. Do not edit, compress, rename, delete, or regenerate them casually. The active direction is:

- original map image as the base proof layer
- SVG/CSS overlay layers for roads, blocks, pins, and highlights
- simple tablet-first presentation flow for property dealers
- no client-facing price, sold labels, add/edit controls, admin controls, dealer login, or internal status

## Active Entry Points

- Client app: `app/plotmap/index.html`
- Client JavaScript: `app/plotmap/app.js`
- Client styles: `app/plotmap/styles.css`
- Shared client data: `app/plotmap/data.js`
- Tricity dataset: `app/plotmap/datasets/tricity.dataset.js`
- Sector pins: `app/plotmap/datasets/sector-pins.js`
- Generated map registry: `app/plotmap/map-registry.js`
- Map registry generator: `tools/generate-map-registry.js`
- Admin Map Studio: `admin/map-studio.html`

## Map Assets

The active folder-based map registry reads from:

- `maps/`
- `normal maps/`

Historical source and processed folders are still present and should be treated as protected until each reference is audited:

- `mohali/`
- `new chandigarh/`
- `panchulka/`
- `new_map_files/`
- `public/plotmap-assets/`
- `maps/enhanced/`
- `maps/metadata/`
- `maps/polygons/`

See `docs/MAP_ASSET_GUIDE.md` before touching map assets.

## Cleanup Docs

- `docs/README.md` - documentation index
- `docs/MAP_ASSET_GUIDE.md` - protected map asset rules
- `docs/CLEANUP_NOTES.md` - audit notes and phased cleanup plan

## Validation

Use these checks after safe cleanup phases:

```bash
node --check app/plotmap/app.js
node --check app/plotmap/data.js
node --check app/plotmap/datasets/tricity.dataset.js
node --check app/plotmap/datasets/sector-pins.js
node --check tools/generate-map-registry.js
node --check tools/server.js
node tools/audit-plotmap.js
```

Then open `http://localhost:5173/app/plotmap/` and verify:

- masterplan map loads
- sector maps load
- property list works
- browser console is clean
- client view has no price, sold, add/edit, admin, or dealer-login controls
- map images retain their original proportions
- tablet/mobile layout remains usable
