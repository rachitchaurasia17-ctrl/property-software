# PlotMap Handoff

## Product Model

- Original Map is the official proof layer.
- Easy Map is the premium explanation layer.
- Properties are inventory browsing.
- Property Detail is property presentation.
- Sector Hub / Sector Map is exact map proof.

Maps are the moat. Inventory sits on top.

## Architecture

PlotMap is a pure ES-module/browser SPA. There is no React, no TypeScript, and no
build step.

- `index.html` loads `data.js`, dataset files, then `app.js`.
- `data.js` owns shared categories, area registry, and `PM.datasetFor(areaId)`.
- `datasets/*.dataset.js` registers map datasets.
- `app.js` renders the active dataset.

## Golden Dataset Pattern

A dataset exports:

- `categories`
- `assets`
- `keyRoads`
- `blocks`
- `zones`
- `pins`
- `properties`
- `sectorMaps`
- `filters`

Future Mohali, Panchkula, Chandigarh, New Chandigarh, Zirakpur, and Kharar maps
should follow this pattern.

## Current Asset Notes

The untracked root files inspected on 2026-06-23 are:

- `Untitled (1).png`: official original 4599 x 3069 masterplan image.
- `parent (3).png`: byte-identical duplicate of `Untitled (1).png`.
- `parent (1).svg`: aligned overlay SVG with semantic ids for key roads, blocks,
  zones, pins, Aerocity sectors, and internal roads.

Do not commit both duplicate PNGs. Do not move/rename any of these until the final
asset source of truth is confirmed.

## Safety Rules

- Do not guess road names, sector names, block names, zone names, coordinates, or labels.
- Figma/SVG provides geometry. Dataset/config provides meaning.
- Internal roads are unnamed, non-clickable, background-only, and hidden from sidebars.
- Planned or incomplete sector maps stay hidden from client UI.
- Do not add client-facing price language or price-like fields.

Run:

```sh
node tools/audit-plotmap.js
```

## What Antigravity/Codex Should Do Next

- Add future maps by creating `datasets/<city>.dataset.js`.
- Place assets under `public/plotmap-assets/<city>/`.
- Add the dataset script to `index.html`.
- Register/switch the area in `data.js`.
- Keep `app.js` generic.

## What Claude Should Polish Later

- Easy Map visual design and label placement.
- Presentation-mode polish.
- Gallery/photo treatment once real assets exist.
- Future brand theming after the map/data workflow is stable.

---

## A/B/C/D Highlight Sets + Admin Editor (this pass)

**Done & pushed:**
- Main site shows 4 fixed buttons **A B C D** beside the Original/Easy toggle
  (`app/plotmap/app.js` → `mapControlsHTML` / `[data-prebuilt-label]` handler).
  Each resolves its `prebuilt_maps` row by `label` and highlights those item ids
  on the Original Map.
- **Admin visual editor**: `admin/editor.html` — official map in the middle,
  A/B/C/D on the left. Click verified items (map shapes or grouped chips) to assign
  them to a set; **Save** upserts to Supabase `prebuilt_maps` (by label) → live on the site.
  Reuses the golden verified geometry (only items whose `svgId` exists in `geo.json` are selectable).

**ONE manual step required (Supabase project `czmkfmkmgqlienmdihul`):**
Run `supabase_setup.sql` once in the Supabase Dashboard → SQL Editor. It creates
`prebuilt_maps`, adds anon read+write RLS policies, and seeds A/B/C/D. Until then the
editor loads but Save returns "table not found", and the A/B/C/D buttons highlight nothing.

**Next steps (Antigravity):** lazy-load editor map image; optional per-letter rename;
show A/B/C/D highlight on Easy Map too (currently forces Original Map on click).
**Next steps (Codex):** tighten `prebuilt_maps` RLS (writes behind auth), add a manifest
generator, no-price audit in CI.
