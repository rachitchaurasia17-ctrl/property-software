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

---

## Original / Easy Map structure (this pass — Claude)

**Done & verified in-browser (Original, Easy, and View Sector Maps all work, no
console errors):**

- **Original Map = official proof, preserved.** Real masterplan image
  (`assets.original`) + highlight overlay from the real `geo.json` geometry.
  Unchanged behaviour.
- **Easy Map = premium, geometry-accurate trace (re-architected).** It now draws
  the **same real `geo.json` paths** as the Original Map — same coordinate system
  — with no photo, a calm light background, road hierarchy (`tier`), soft raised
  real-boundary parcels, distinct-but-calm commercial zones, and clean labels.
  - **No invented geometry / no approximate grid.** Roads follow real road paths;
    blocks/sectors follow real boundary polygons; pins sit at real marker
    centroids. Earlier schematic-rectangle attempt was removed.
  - Frame is **stable**: the Easy Map always renders the full traced geometry and
    uses dim/highlight for focus (Apple-Maps style) — selecting a block does not
    reframe or hide the rest.
  - Features without a traced path (green belt, future-growth pockets, entry pins)
    are **not drawn** on the Easy Map and are marked `// needs tracing` in the
    dataset. Trace them into `geo.json` to surface them — never fake them.
- **Bug fixed:** Easy Map highlighting threw a `ReferenceError` (`cat`
  undefined in `updateMapOverlays`) — corrected.
- **CSS repaired:** an unterminated `.o-zone.cat-commercial.act` rule was dropping
  ~85 lines of styles (A/B/C/D buttons, etc.); brace closed; authoritative `.eg-*`
  Easy-Map layer appended.
- **Dataset:** added road `tier` metadata; clarified that `svgId → geo.json` is
  the real geometry and `x/y/w/h` / `at` are schematic fallback only.
- **Tooling:** `tools/server.js` now honours `PORT` (defaults to 5173).
- **Docs:** added `app/plotmap/EASY-MAP-PIPELINE.md` (full add-map workflow + schema
  + checklist).
- **View Sector Maps untouched** — still manifest-driven via `readySectorMaps()`
  (≈35 client-ready). Do not break.

Checks run & passing: `node --check app/plotmap/app.js`, `data.js`,
`datasets/tricity.dataset.js`, `tools/server.js`; `node tools/audit-plotmap.js`.

## Next step after Claude

1. Claude completed the Original/Easy Map structure (Easy Map is a real-geometry
   premium trace; Original Map preserved as proof).
2. **Antigravity** should now wire all usable maps into **View Sector Maps**
   (pitch / library mode).
3. Use pitch-mode filtering.
4. **Do not** require `showInClientDefault` for pitch mode.
5. Prefer `bestProcessedPath`, then `processedPaths[0]`, then a browser-safe
   `originalPath` (only if it resolves to a served file).
6. Show converted PDFs only when `pdfConverted === true` & `conversionStatus ===
   "converted"` & converted paths exist. Hide only broken/missing/failed PDFs and
   `duplicateDisplayStatus === "hidden-duplicate"`.
7. Then **Codex** can continue watermark cleanup variants and gradually promote
   maps to `client-ready` after human review.

## Remaining limitations / follow-ups

- Green belt, future-growth pockets, and entry/exit pins have **no traced
  geometry** yet, so they do not appear on the Easy Map. Trace them into
  `geo.json` (add `svgId`) to surface them.
- The right-hand category/layer panel (`panelHTML()`) is defined but not currently
  mounted; masterplan interaction is via map clicks + the A/B/C/D sets. Out of
  scope for this pass.
- Some traced education/IT markers sit close together in the real layout, so their
  Easy-Map labels can overlap at full-zoom-out; they separate on zoom-in.

---

## Launch: full sector library + viewer pins + admin (this pass)

**Done & pushed to `origin/main` (verified in-browser, no console errors):**

- **Show all usable sector maps (35 → ~140).** `pitchModeMaps()` shows every usable
  map regardless of review tier; no `showInClientDefault` required. Hides only
  hidden-duplicates and entries with no browser-safe image; dedups by `matchKey`.
- **Browser-safe paths.** `toPublicAssetPath()` normalizes manifest paths to the
  served `/public/plotmap-assets/…` form; `mapImage`/`mapThumb`/`mapTitle`/`mapCity`
  helpers. Clean client cards (real thumbnails, clean titles, city filters) with **no**
  verified/internal-review/quality labels.
- **Sector viewer + pins.** Viewer sizes to the image (manifest `dimensions`) so
  normalized-% pins are accurate; pins render over the image and open an info card
  (no price). Static store `datasets/sector-pins.js`; editable via Admin.
- **Admin** `admin/maps.html` — dashboard, sector-maps manager (internal status
  shown here only), pin manager (click-to-place + Copy/Download JSON), future-update
  placeholders. Linked from the client topbar.
- **Docs** `app/plotmap/LAUNCH-MAP-WORKFLOW.md` (full launch workflow + Supabase
  schema + deployment checklist).

Commits: `fix: show all usable sector maps…`, `feat: sector map viewer pins…`,
`feat: admin maps + pin manager…`, `docs: launch map workflow…`.

## ⚠️ Production deploy blocker (decision needed)

`public/plotmap-assets/processed/` is **gitignored** — the ~342 processed images are
local only. So **all ~140 maps work locally** (`node tools/server.js`, fine for
pitching), but on **Vercel they'd show broken thumbnails** (even the original 35 were
never deployed — `vercel.json` lists only 4 specific images). Before a hosted launch,
either commit the processed folder + add `public/plotmap-assets/**` to `vercel.json`,
or host the folder externally and repoint manifest paths. See LAUNCH-MAP-WORKFLOW §16.

## Backend status

Supabase is configured frontend-only (anon key, masterplan `prebuilt_maps`). Pins are
local/static for launch (no fake saving). SQL for `sector_maps`/`sector_pins` is in
LAUNCH-MAP-WORKFLOW §13 for when a backed save is wanted (anon read, writes behind auth).

## What to physically map next

1. Place real pins on the top pitch sectors via Admin (start with the most-shown
   Mohali/Panchkula/New-Chandigarh sectors), export, commit `sector-pins.js`.
2. Decide the production image-hosting approach (deploy blocker above).
3. Later: sector-level Easy Maps + per-map road/block/commercial/landmark markings
   (schemas reserved in Admin → Future Updates).
