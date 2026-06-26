# PlotMap — Launch Map Workflow

How the launch version of PlotMap works: masterplan, the full sector-map library,
the sector viewer + pins, the admin, and what's needed to deploy it.

---

## 1. Launch scope

1. **Masterplan** — Original Map, Easy Map, Aerocity Blocks (markings). Done; preserved.
2. **Sector Maps** — the **full library** of usable proof maps (~140), not just
   strict client-ready ones. Clicking a card opens the Sector Map Viewer.
3. **Sector Map Pins** — property/house/landmark pins on a sector map, normalized
   percentage coordinates, click for an info card. No price anywhere.
4. **Admin** — `/admin/maps.html`: dashboard, maps manager, pin manager, future-update
   placeholders.
5. **Backend** — Supabase is partially configured (frontend anon key, used for the
   masterplan A/B/C/D `prebuilt_maps`). Pins use a **local/static** store today.

## 2. Masterplan — Original / Easy Map

- **Original Map** = the official proof image + a highlight overlay drawn from the
  real `geo.json` geometry.
- **Easy Map** = a cleaned, premium TRACE of the same real `geo.json` geometry (no
  invented shapes). See `app/plotmap/EASY-MAP-PIPELINE.md`.
- **Aerocity Blocks** (markings) = a cropped marking image + overlay.
- These are stable. Do not redesign them while doing sector/pin/admin work.

## 3. Sector Maps — "show all usable proof maps"

The client hub (`Sector Maps` tab) uses **pitch mode** (`pitchModeMaps()` in
`app.js`): it shows **every usable map regardless of internal review tier**. It does
**NOT** require `showInClientDefault`, and does not hide maps for being unverified /
internal-review / review-needed / proof-usable / watermarked / not-yet-cleaned.

A map is **hidden only** when:
- it has no browser-safe image (`mapImage()` returns null), or
- `duplicateDisplayStatus === "hidden-duplicate"`, or
- it's a failed/deferred PDF with no converted image (→ no image → hidden), or
- it's a non-keep duplicate when a better same-`matchKey` representative exists (dedup).

Result locally: **~140 maps** (184 manifest entries − 25 hidden duplicates − entries
with no usable image, then deduped by `matchKey`).

## 4. All maps are shown in pitch mode

This is intentional for pitching/launch — the family owns/approves all maps. Internal
quality is tracked in the manifest and visible only in Admin, never in the client UI.

## 5. Verified/unverified labels are hidden from the client

The client UI never renders `launchTier`, `processingStatus`, `reviewNeeded`,
`duplicateDisplayStatus`, `watermarkType`, "verified/unverified/internal-review",
raw filenames, or raw paths. Card titles come from `mapTitle()` (clean name) and the
subtitle is the city. The Admin page **may** show these internal statuses.

## 6. How path conversion works

`toPublicAssetPath(p)` normalizes any manifest path to the served
`/public/plotmap-assets/…` form (the convention used by the app **and** `vercel.json`):
- backslashes → forward slashes
- strip everything before `/public/` (keeps `/public/...`)
- `public/…` → `/public/…`; `/plotmap-assets/…` → `/public/plotmap-assets/…`
- returns `null` for paths that won't load (e.g. source paths like
  `/maps/enhanced/…`, or `C:\…` absolutes)

Image priority (`mapImage`): `bestProcessedPath` → `processedPaths[0]` →
`thumbnailPath`. `originalPath` is a **source** path that is not browser-served, so it
is intentionally skipped. Thumbnail priority (`mapThumb`): `thumbnailPath` →
`processedPaths[0]` → `mapImage`.

## 7. How to add a new sector map

1. Put the processed image + thumbnail under `public/plotmap-assets/processed/<city>/`.
2. Add/extend a manifest entry in `app/plotmap/map-assets.manifest.json` with
   `id`, `matchKey`, `city`, `sectorOrBlockName`/`displayName`, `dimensions`
   `{width,height}`, and `thumbnailPath` / `bestProcessedPath` / `processedPaths`
   pointing at `/public/plotmap-assets/...`.
3. That's it — pitch mode picks it up automatically (no `showInClientDefault` needed).

## 8. How to add / update thumbnails

Set `thumbnailPath` to a `/public/plotmap-assets/...` image. If missing, the card
falls back to the processed image, then to a clean placeholder. Keep thumbnails small.

## 9. How the Sector Map Viewer works

Open a card → `openSectorHub()` → sector view. `buildMap()` sizes the layer to the
map's `dimensions` and renders the image (`mapImage`) plus a `#sectorPinG` pin layer.
Zoom (+/−), reset (⤢), drag-to-pan, and pinch-zoom all come from the shared map
engine. Title/city show in the side panel; no internal labels; no price.

## 10. How pins work

Pins are stored as **normalized percentages** (`x`,`y` in 0–100) of the map image,
so they stay correct while zooming/panning. They render in `#sectorPinG`; clicking a
pin opens a fixed (screen-space) info card. Pin shape:

```js
{ id, title, type, x, y, size, block, roadFacing, status, notes, image }
// type: 'available-property' | 'highlighted-property' | 'landmark' | 'future-update'
```

Client labels: Available Property, Highlighted Property, Landmark, Future Update.
The card shows title, type, size, block, road facing, status, notes — **never price**.

## 11. How to add a pin

1. Open `/admin/maps.html` → **Pin Manager**.
2. Select a map; choose the new-pin type; **click the image** to drop a pin (its %
   coordinates are computed from the click).
3. Edit the fields, repeat. Delete from the pin list as needed.
4. **Copy JSON** or **Download sector-pins.js**, then paste the object into
   `app/plotmap/datasets/sector-pins.js` and commit. (Browsers can't write project
   files directly; this is the safe local workflow until a backend save is wired.)

## 12. How Admin works

`/admin/maps.html` (self-contained; does not touch `admin/index.html` or
`admin/editor.html`):
- **Dashboard** — manifest totals, pitch-visible vs hidden, thumbnail/processed
  coverage, hidden duplicates, no-image count, pins placed.
- **Sector Maps Manager** — searchable/filterable table of every map with thumbnail,
  clean title, city, image + pitch pills, and internal status (admin-only), Open.
- **Pin Manager** — see §11.
- **Future Updates** — reserved schemas for sector Easy Maps and road/block/
  commercial/landmark markings.

## 13. Supabase / backend status

- A Supabase client is configured in `app/plotmap/app.js` with the **public anon key**
  only (no service-role key in the frontend — keep it that way). It currently powers
  the masterplan A/B/C/D `prebuilt_maps`.
- **Pins are local/static** (`datasets/sector-pins.js`) for launch — no fake backend
  saving. Admin exports JSON you paste + commit.
- When you want pins (and maps) in Supabase, create these tables and switch the
  loader to fetch from them (anon read; writes behind auth):

```sql
create table if not exists sector_maps (
  id text primary key, title text, city text, area text,
  image_path text, thumbnail_path text, visible_in_pitch boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists sector_pins (
  id text primary key,
  sector_map_id text references sector_maps(id) on delete cascade,
  title text, type text, x numeric, y numeric,
  size text, block text, road_facing text, status text, notes text, image_path text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- RLS: enable, allow anon SELECT; restrict INSERT/UPDATE/DELETE to authenticated.
```

Do not hardcode secrets. Do not expose the service-role key in the frontend.

## 14. Local fallback workflow (today)

- Pins: `app/plotmap/datasets/sector-pins.js` (edited via Admin export).
- Maps: `app/plotmap/map-assets.manifest.json`.
- Run locally: `node tools/server.js` → http://localhost:5173/app/plotmap/

## 15. Future road / block marking workflow

Per-map overlay markings (roads/blocks/commercial/landmarks) using normalized
geometry, mirroring the masterplan Easy Map pipeline. Reserved shape:
`{ id, mapId, kind:'road|block|commercial|landmark', points:[[x%,y%]...], label }`.
The Marking Editor (`admin/editor.html`) handles masterplan A/B/C/D today.

## 16. Deployment checklist  ⚠️ READ BEFORE DEPLOYING

**The processed sector images are gitignored** (`.gitignore` →
`public/plotmap-assets/processed/`) and are **not** in the repo. So:

- **Locally** (for pitching via `node tools/server.js`): all ~140 maps show. ✅
- **On Vercel / GitHub Pages**: the processed images are absent, so sector cards
  would show **broken thumbnails**. To deploy the full library you must EITHER:
  1. Remove `public/plotmap-assets/processed/` from `.gitignore`, commit the images,
     and add a folder rule to `vercel.json` builds:
     `{ "src": "public/plotmap-assets/**", "use": "@vercel/static" }`
     (replace the per-file plotmap-assets entries with this glob); **or**
  2. Upload the processed folder to your host / object storage and point the manifest
     paths at that location.

`vercel.json` currently lists only a few specific images, so even the original 35
maps' processed images were not deployed. Decide on (1) or (2) before launch.

Other checks:
- `node --check app/plotmap/app.js app/plotmap/data.js app/plotmap/datasets/tricity.dataset.js app/plotmap/datasets/sector-pins.js`
- `node tools/audit-plotmap.js` (no price / debug / internal language in client files)
- Verify: masterplan modes work; Sector Maps shows all; Open Map → viewer zoom/pan;
  pins render + info card; Admin loads + pin export; client UI shows no internal labels.

---

## 20. Dealer Command Center (admin home)

`/admin/maps.html` opens on the **Command Center** — the dealer's internal "what to
do next" view (never shown to clients). It is computed from real data only (manifest
+ `sector-pins.js` + dataset properties) with honest empty states — no fake numbers.

- **Hero**: how many sector maps are ready to present, across how many cities.
- **Today's focus**: prioritized, clickable actions from real gaps — e.g. "X of Y
  sector maps have no plot pins", "N cities are not live yet", "link properties to a
  pin". Each has a one-click action (Add pins / Manage maps / etc.).
- **Area intelligence**: per-city maps / pinned / pins with coverage bars.
- **Map coverage**, **Inventory & pins** (by type), **Library health** (internal).
- **Quick actions**: open client app, add a plot pin, manage maps, highlight sets.

It reuses the unified admin nav, so Command Center / Sector Maps / Pin Manager /
Highlight Sets are one cohesive tool.

## 21. Adding a new main/original masterplan (future-ready)

The app is set up so adding a city is small and safe — and never creates a fake Easy
Map. To bring a city (e.g. Zirakpur / New Chandigarh) live:

1. Put the official masterplan image under `public/plotmap-assets/<city>/<city>-original-web.jpg`.
2. Create `app/plotmap/datasets/<city>.dataset.js` modelled on `tricity.dataset.js`,
   but with **only** `assets.original` set (and `IMG_W`/`IMG_H` = image size). Leave
   `overlayGeo` and `markings` unset until you trace them.
3. Register it: in `data.js`, point the city's area `dataset` at the new id and set
   `live:true`.
4. Result: the city shows its **Original Map** only. The **Easy Map** and **Aerocity
   Blocks** toggles are automatically hidden (capability-gated on `assets.overlayGeo`
   / `assets.markings`) — no broken buttons, no invented geometry.
5. Later, when YOU manually trace the Easy Map in Figma: export the overlay, build the
   city's `geo.json`, set `assets.overlayGeo`, and the Easy Map toggle appears on its
   own (see EASY-MAP-PIPELINE.md). PlotMap never auto-generates Easy Map geometry.

> Note on the current `new_map_files/` drop: it is an unlabeled Figma **tracing
> workspace** (base crop + individual `Vector N` shapes; `temp*.svg` contain
> Aerotropolis geometry) — i.e. material for the **existing Aerocity** Easy Map, not a
> clearly-labelled Zirakpur/New Chandigarh masterplan. No Zirakpur image was present.
> To add those cities, drop a clearly-named original masterplan image per city and
> follow the steps above.
