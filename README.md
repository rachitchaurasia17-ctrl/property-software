# PlotMap — Map Infrastructure (POC)

> "Google Maps for Property Inventory." The maps are the moat. Inventory sits on top.

This repo contains the Phase-0 audit of the EasyMap library and a **working city-agnostic POC** built on the highest-quality region (Panchkula).

## Reports (read first)
- [AUDIT.md](AUDIT.md) — full technical assessment of the map library.
- [DELTA.md](DELTA.md) — what changed when high-res Mohali/New-Chandigarh originals were added.

## ⭐ Client prototype — Aerocity / Aerotropolis (Phase 1)
The polished, client-facing presentation app built from the Claude Design base + the real Aerotropolis assets.
- Run `node tools/server.js`, open **http://localhost:5173/app/plotmap/**
- Source: [app/plotmap/](app/plotmap/) — `index.html`, `data.js` (editable demo data, NO price), `geo.json` (geometry extracted from the overlay SVG), `app.js`, `styles.css`.
- Two map modes only: **Original Map** (official proof PNG) + **Easy Map** (rebuilt from your overlay geometry). Properties are a toggle inside Easy Map. Flow: area → masterplan → category → driver (photo-first) → properties → detail → **sector-map plot proof** → WhatsApp. Client-facing only (no login/admin/upload/sold), no price anywhere.

## Run the POC
```bash
node tools/enhance.js     # Phase 1: standardize + enhance -> maps/enhanced/
node tools/metadata.js    # Phase 3: per-map metadata -> maps/metadata/
node tools/server.js      # serve apps at http://localhost:5173
```
- Admin polygon tool: http://localhost:5173/admin/
- Client experience:  http://localhost:5173/app/

## Architecture (city-agnostic, decoupled)
```
config/sources.json     ← add a region here; nothing downstream hard-codes a city
SOURCE FOLDERS          ← immutable originals (panchulka/, mohali/, new chandigarh/)
  │  Phase 1 enhance
maps/enhanced/          ← standardized lossless PNGs
maps/metadata/          ← {id, city, sector, image, w, h, status}  (MAP LAYER)
maps/polygons/          ← {plotNo, polygon[], centroid}            (MAP LAYER)
maps/cv/                ← Phase 4 detections, confidence-scored (never overwrites source)
data/inventory/         ← {mapId, plotNo, price, size, photos…}    (INVENTORY LAYER)
```
**Join key is `(mapId + plotNo)` only.** A plot polygon exists permanently; an inventory
record may or may not exist on it. The two layers never embed each other.

## Phase status
| Phase | Status |
|---|---|
| 0 Audit | ✅ AUDIT.md + DELTA.md |
| 1 Enhancement pipeline | ✅ `tools/enhance.js` (ffmpeg, mild, no smoothing) |
| 2 Branding replacement | ◑ display-layer overlay in client ("Powered by EasyMap × PlotMap"); baked-in compositing TODO |
| 3 Metadata | ✅ `tools/metadata.js` |
| 4 CV experiments | ☐ not started (separate dir reserved, confidence-scored) |
| 5 Polygon annotation tool | ✅ `admin/` — zoom/pan/draw/edit/delete/search/save |
| 6 Inventory architecture | ✅ decoupled `data/inventory/` |
| 7 Client experience | ✅ `app/` — inventory-first, map zooms+highlights on select |
| 8 Presentation mode | ✅ toggle in `app/` hides dealer chrome |
| 9 Vectorization-ready | ✅ polygons stored as coordinates (SVG-ready), image-only assumptions avoided |

## Scale-up backlog (from DELTA.md §7)
1. **Mohali (Batch 2)** — 8 MP, ready; needs diagonal-watermark handling (Phase 2).
2. **New Chandigarh** — de-dupe (47→33 unique), verify city label, confirm Anurag/Aerocity licensing.
3. **PDFs (18)** — install a rasterizer (poppler/ghostscript); split the 18-page Aerocity booklet.
4. **Hygiene** — fix `panchulka`→Panchkula, `scctor`→sector; resolve mislabel `aerocity-mohali.jpg ≡ hpso-...-122-1.jpg`.
