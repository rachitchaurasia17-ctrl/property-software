# PlotMap — Original / Easy Map Upload & Add-Map Pipeline

This is the repeatable process for adding new masterplans (and improving the
current one) without breaking the app. It is written against the real code in
`app/plotmap/` — follow it exactly and the Original Map, Easy Map, and View
Sector Maps all keep working.

---

## 0. Core principle (read first)

- **Original Map = the official proof.** The real masterplan photo
  (`assets.original`) with a highlight overlay drawn from the *real* traced
  geometry in `geo.json`.
- **Easy Map = a cleaned, premium TRACE of the same real geometry.** It draws
  the **exact same `geo.json` paths** as the Original Map — same coordinate
  system — just without the photo, on a calm background, with Apple-Maps-style
  styling. It is **not** an invented layout.

> **Never invent geometry for the Easy Map.** Roads follow the real road paths,
> blocks/sectors follow the real boundary polygons, zones follow the real zone
> polygons. If a shape has no traced path yet, it is simply **not drawn** on the
> Easy Map until someone traces it (see §3). Approximate rectangles / grids are
> forbidden — that is what the Original Map proof exists to prevent.

The schematic `x/y/w/h` and pin `at:[x,y]` fields in a dataset are **fallback
metadata only** (used by a validity filter and as a last-resort focus target).
They are never drawn when a real `geo.json` path exists.

---

## 1. Architecture & files

Framework-free browser SPA. No React, no TypeScript, no bundler, no build step.

```
app/plotmap/
  index.html              loads data.js → datasets/*.dataset.js → app.js
  data.js                 shared categories + area registry (PM.areas, PM.datasets)
  datasets/
    tricity.dataset.js    the golden example dataset (Aerocity/Aerotropolis)
  geo.json                REAL traced geometry: { viewBox, paths:{ "<svgId>": "<d>" } }
  styles.css              all styling (Original `.orig-ov .o-*`, Easy `.eg-*`)
  app.js                  rendering + interaction (Original/Easy/Sector + manifest)
  map-assets.manifest.json     verified sector-map manifest (View Sector Maps)
public/plotmap-assets/
  aerotropolis-original-web.jpg   the official masterplan image (Original Map)
  aerotropolis-overlays.svg       hand-traced overlay SVG (source for geo.json)
```

The Original Map and Easy Map share **one coordinate system**: the `viewBox` of
`geo.json` (for Aerocity, `0 0 4599 3069` = `IMG_W x IMG_H`). The Easy Map frames
itself to the bounding box of the geometry it draws; the Original Map sits on the
photo. Because both read the same paths, **they always stay aligned.**

---

## 2. How to add a new official masterplan image  *(Original Map)*

1. Export the official masterplan as a web-friendly image (JPG, long edge
   ~3000–4600px, < ~1.5 MB). Keep a full-resolution PNG too if you have it.
2. Save it under `public/plotmap-assets/<city>/` (create the folder), e.g.
   `public/plotmap-assets/mohali/mohali-original-web.jpg`.
3. In the city dataset, set `assets.original` to the public path and set
   `IMG_W` / `IMG_H` to the image's exact pixel size.
4. Do **not** overwrite or rename the existing Aerocity assets.

The Original Map will display this image and overlay the `geo.json` highlights on
top. No code changes needed.

## 3. How to add a hand-traced overlay SVG → `geo.json`  *(the geometry source)*

The Easy Map and the Original Map overlay both read **`geo.json`**. `geo.json` is
extracted from a hand-traced overlay SVG (e.g. `aerotropolis-overlays.svg`).

1. Trace the masterplan in Figma/Illustrator over the official image at the
   image's pixel size (so traces are in image/`IMG_W×IMG_H` coordinates).
2. Give every shape a semantic `id` (see §4).
3. Export as SVG (see §5) → e.g. `public/plotmap-assets/<city>-overlays.svg`.
4. Build `geo.json` for the city: for each traced `<path id="X" d="…"/>`, copy an
   entry into `geo.json` under `paths`:

```json
{
  "viewBox": "0 0 4599 3069",
  "paths": {
    "ROAD-Airport-Road": "M2850 805.5V929L2957 1091.5…",
    "BLOCK-Aerotropolis-Block-A": "M3032 1302.5L3015 1112…",
    "SECTOR-Aerocity-Sector-66A": "M2530.5 1155L2535.79…",
    "ZONE-Commercial-Zone-A": "M3012 1375.5H2969.5…",
    "PIN-IISER-Mohali": "M2413.5 1448.5V1402.5H2504.5…"
  }
}
```

- `viewBox` must equal the SVG's viewBox (= `IMG_W IMG_H`).
- The keys are the `svgId`s the dataset references.
- Point `assets.overlayGeo` in the dataset at this file.

> If a feature (e.g. a future-growth pocket or green belt) has **no** traced
> path, leave it out of `geo.json`. It will appear on neither map until traced.
> Do not fake it.

## 4. How to name SVG layers / IDs

Use the existing convention (uppercase, hyphenated, prefixed by type):

| Type        | Prefix      | Example                              |
| ----------- | ----------- | ------------------------------------ |
| Road        | `ROAD-`     | `ROAD-Airport-Road`                  |
| Block       | `BLOCK-`    | `BLOCK-Aerotropolis-Block-A`         |
| Sector      | `SECTOR-`   | `SECTOR-Aerocity-Sector-66A`         |
| Commercial  | `ZONE-`     | `ZONE-Commercial-Zone-A`             |
| Pin / POI   | `PIN-`      | `PIN-IISER-Mohali`                   |

Rules: ASCII letters/digits/hyphens only; unique per file; the `id` carries
geometry identity, **not** display text (clean names live in the dataset, §7).
Internal/unnamed roads can be grouped (e.g. `internal roads`) and simply not
referenced by the dataset — they stay background-only.

## 5. How to export from Figma correctly

- Frame size = image size (`IMG_W × IMG_H`); trace on top of the official image.
- Outline strokes are fine; keep `id`s on the paths (Figma layer name → SVG `id`).
- Export the frame as **SVG**, "Include id attribute" on, "Outline text" on.
- Flatten transforms where possible so each `<path d="…">` is in absolute
  image coordinates (no nested `transform=`). If a group has a transform, bake it
  in before exporting, otherwise the extracted `d` will be offset.
- One path per feature. Avoid clip-paths/masks/filters in the export.

## 6. How to validate SVG IDs

After building `geo.json`, validate from the repo root:

```sh
# every dataset svgId must exist as a geo.json path
node -e "const d=require('./app/plotmap/datasets/<city>.dataset.js')||0" 2>/dev/null; \
node -e "const fs=require('fs');const geo=JSON.parse(fs.readFileSync('app/plotmap/geo.json','utf8'));console.log('paths:',Object.keys(geo.paths).length)"
node --check app/plotmap/datasets/<city>.dataset.js
node --check app/plotmap/app.js
node tools/audit-plotmap.js          # no price / debug / internal language
```

Quick manual check: open the app, switch to **Easy Map**, and confirm every road
/ block / zone / pin you expect is drawn. Anything missing usually means the
dataset `svgId` doesn't match a `geo.json` key (typo or not traced).

## 7. How to connect SVG/geo paths to app categories

Each dataset item maps a real `geo.json` path (`svgId`) onto a shared category
(`cat`). The categories live in `data.js`:

`roads`, `blocks`, `sectors`, `commercial`, `institutions`, `it`, `green`,
`growth`, `entry`, `landmarks` — displayed as **Key Roads, Blocks, Sectors,
Commercial Zones, Education, IT & Employment, Green & Open Areas, Future Growth,
Entry & Exit Points, Landmarks**.

The clean display name is `name` in the dataset; the raw id never reaches the
client. Example: `name:'Airport Road'`, `svgId:'ROAD-Airport-Road'`.

### Dataset item schema (the reusable shape)

```js
// ROAD
{ id:'airport-road', name:'Airport Road', tier:'major'|'arterial'|'secondary',
  svgId:'ROAD-Airport-Road',          // -> geo.json path (REAL geometry, both maps)
  labelAt:[x,y],                       // legacy/optional
  photos:true, mapsUrl:'…', related:['…'] }

// BLOCK / SECTOR
{ id:'at-a', area:'Aerocity', cat:'blocks'|'sectors', name:'Block A',
  svgId:'BLOCK-Aerotropolis-Block-A',  // -> geo.json polygon (REAL boundary)
  color:'#E0B04A',                     // parcel accent (Easy Map fill + Original highlight)
  x,y,w,h }                            // schematic FALLBACK only (never drawn if svgId exists)

// ZONE (commercial / growth / green)
{ id:'commercial-a', cat:'commercial', name:'Commercial Zone C1',
  svgId:'ZONE-Commercial-Zone-A',      // -> geo.json polygon; omit until traced
  dashed:true,                         // optional dashed border
  x,y,w,h, photos:true }

// PIN (landmark / education / it / entry)
{ id:'pin-iiser', cat:'institutions', name:'IISER Mohali',
  svgId:'PIN-IISER-Mohali',            // -> geo.json marker; omit until traced
  at:[x,y],                            // schematic FALLBACK only
  photos:true }
```

Field meaning at a glance:
- `id` — unique key. `name` — clean client label. `cat` — category/layer.
- `svgId` — **the real geometry** (drives both maps). Add it and the feature
  appears, geographically accurate, on both Original and Easy.
- `color` — premium accent for the parcel. `tier` — road weight on the Easy Map.
- `photos` — enables the gallery button. `mapsUrl` / `related` — context.
- `x/y/w/h` / `at` — schematic fallback only; not the Easy Map geometry.

## 8. How to add roads

1. Trace the road centreline in the overlay SVG, `id="ROAD-<Name>"`.
2. Add its `d` to `geo.json` under that id.
3. Add a `keyRoads` entry with `svgId`, a clean `name`, and a `tier`
   (`major` = primary connectivity / strongest, `arterial` = important sector
   road, `secondary` = lighter link). Tier drives the Easy Map road hierarchy.

## 9. How to add blocks / sectors

1. Trace the parcel boundary, `id="BLOCK-…"` or `id="SECTOR-…"`.
2. Add its `d` to `geo.json`.
3. Add a `blocks` entry with `cat:'blocks'` or `'sectors'`, clean `name`,
   `svgId`, and a `color`. The real boundary is drawn as a soft raised parcel on
   the Easy Map and as a highlight on the Original Map.

## 10. How to add commercial zones

1. Trace the zone polygon, `id="ZONE-Commercial-Zone-<X>"`.
2. Add its `d` to `geo.json`.
3. Add a `zones` entry with `cat:'commercial'`, clean `name`, `svgId`. Commercial
   zones render distinct-but-calm (warm fill, clean border) on the Easy Map.

## 11. How to add future-growth zones

Same as §10 but `cat:'growth'` and `dashed:true`. **Future-growth and green areas
must be traced into `geo.json` to appear on the Easy Map.** Until then, leave the
entry without an `svgId` — it will render on neither map (no invented shapes). The
current Aerocity dataset has `green-belt` and `growth` marked `// needs tracing`.

## 12. How to add pins / landmarks

1. Trace a small marker shape, `id="PIN-<Name>"` (or reuse the POI footprint).
2. Add its `d` to `geo.json`.
3. Add a `pins` entry with the right `cat` (`landmarks` / `institutions` / `it` /
   `entry`), clean `name`, `svgId`. The pin is placed at the marker's centroid.
   Entry/exit pins without an `svgId` show on the Original Map only.

## 13. How to add photos / context

- Set `photos:true` on any road/block/zone/pin/property to enable the gallery
  button. Real images replace the warm placeholder later (Codex/Antigravity).
- `mapsUrl` adds a Google-Maps link; `related:[…]` adds context chips.
- **No price language anywhere** (see §18) — names, sizes, and context only.

## 14. How Original ↔ Easy Map switching works (don't break it)

- `state.mapMode` is `'original'` or `'easy'`; the toggle in `mapControlsHTML()`
  sets it; `buildMap()` renders `origSVG()` (photo + overlay) or `easySVG()`
  (geometry trace). Both pull from `GEO.paths` (= `geo.json`).
- `easySVG()` computes the geometry frame (`EOX/EOY/EGW/EGH`) and draws `.eg-*`
  elements; `origSVG()` draws `.o-*` elements over the photo.
- `updateMapOverlays()` has an `easy` branch (`.eg-*`, always visible + dim/
  highlight) and an `original` branch (`.o-*`, highlight-on-demand). `geoToLayer()`
  converts real coordinates into the active layer's pixels for focus/tags.
- To keep switching working: keep the `.eg-*` / `.o-*` class names, the
  `data-hit` / `data-roadpath` / `data-bid` / `data-zid` / `data-pid` attributes,
  and the `#eSpot` group. Style via `styles.css`, don't rename hooks.

## 15. How to avoid breaking View Sector Maps

- View Sector Maps is **manifest-driven** via `readySectorMaps()` →
  `verifiedManifestMaps()` reading `map-assets.manifest.json`. Do **not** remove
  that integration, the `secCardHTML()` / `sectorsHubHTML()` renderers, or the
  manifest fetch (with its path fallback) near the bottom of `app.js`.
- Masterplan/Easy-Map work touches roads/blocks/zones/pins only — it does not
  touch the manifest. Keep it that way.

## 16. How to add sector maps later from `map-assets.manifest.json`

- Each manifest entry already has `id`, `matchKey`, `sectorOrBlockName`, `city`,
  `area`, `thumbnailPath`, `bestProcessedPath`, `processedPaths`, `originalPath`,
  `launchTier`, `duplicateDisplayStatus`, etc.
- The current strict filter (`readySectorMaps`) shows ~35 client-ready maps.
- The "show all usable maps" expansion is **Antigravity's** job (§17) — pitch/
  library mode. Don't widen the strict default here; just keep the manifest wired.

## 17. What Antigravity should do after this work

See `app/plotmap/HANDOFF.md` → "Next step after Claude". In short: add a pitch/
library mode that shows all usable maps (prefer `bestProcessedPath`, then
`processedPaths[0]`, then a browser-safe `originalPath`; show converted PDFs only
when converted images exist; hide only broken/missing/failed/hidden-duplicate;
**do not** require `showInClientDefault`).

---

## 18. Checklist — every new map package

- [ ] Official original image exists and is web-served (`assets.original`).
- [ ] (Optional) Pre-made Easy Map image — usually **not** needed; the Easy Map
      is generated from `geo.json`.
- [ ] Overlay SVG traced with semantic ids (§4–§5).
- [ ] `geo.json` built; `viewBox` = `IMG_W IMG_H`; every dataset `svgId` has a path.
- [ ] Dataset entry added and registered (`data.js` area → dataset; script in
      `index.html`).
- [ ] Categories mapped; clean `name`s (no raw ids), `tier`/`color` set.
- [ ] Labels cleaned — no raw ids, no internal/debug text.
- [ ] App renders the **Original Map** (photo + highlights).
- [ ] App renders the **Easy Map** (real geometry, premium, framed, dim-to-focus).
- [ ] **View Sector Maps still works** (manifest untouched).
- [ ] No price / ₹ / Rs / Cr / crore / lakh / budget / amount / sold language; no
      `debug` / `verify` / `missing` / internal-review / launchTier / raw ids in
      client UI. Run `node tools/audit-plotmap.js`.
- [ ] `node --check` passes for `app.js`, `data.js`, and the dataset.

---

## 19. Local run & verify

```sh
node tools/server.js                 # http://localhost:5173/app/plotmap/
# (PORT=<n> node tools/server.js to use another port)
node --check app/plotmap/app.js
node --check app/plotmap/data.js
node --check app/plotmap/datasets/tricity.dataset.js
node tools/audit-plotmap.js
```

Open `/app/plotmap/`, pick the area, toggle **Original Map ↔ Easy Map**, and open
**Sector Maps**. The Easy Map must be a clean, premium, spatially-accurate trace
of the official map — never an invented layout.
