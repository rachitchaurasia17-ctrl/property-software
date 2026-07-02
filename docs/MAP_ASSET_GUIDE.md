# Map Asset Guide

PlotMap's maps are proof layers. Treat every original map file as protected.

## Active Sources

The current folder-based registry is generated from:

- `maps/`
- `normal maps/`

The generated browser registry is:

- `app/plotmap/map-registry.js`

Regenerate it with:

```bash
node tools/generate-map-registry.js
```

## Protected Folders

Do not delete, rename, compress, or regenerate assets in these folders without a reference audit and visual validation:

- `maps/`
- `normal maps/`
- `mohali/`
- `new chandigarh/`
- `panchulka/`
- `new_map_files/`
- `public/plotmap-assets/`
- `maps/enhanced/`
- `maps/metadata/`
- `maps/polygons/`

## Safe Rules

- Preserve original filenames unless every reference is updated and tested.
- Prefer adding overlays or metadata instead of editing map images.
- Keep original aspect ratios. Do not stretch maps in CSS or generated thumbnails.
- Keep processed copies separate from originals.
- Move uncertain old files to an archive folder only after proving they are not used by the active app.
- Validate client map loading after every change.

## Active Runtime Flow

1. `app/plotmap/index.html` loads `map-registry.js`.
2. `app/plotmap/data.js` builds shared areas and dataset registration.
3. `app/plotmap/datasets/tricity.dataset.js` uses the registry where available.
4. `app/plotmap/app.js` resolves the current masterplan or sector map and renders the base image plus overlays.

The client view must stay price-free and admin-free.
