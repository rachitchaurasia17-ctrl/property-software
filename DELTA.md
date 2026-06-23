# PlotMap — Map Library Delta Report

**Date:** 2026-06-21
**Trigger:** High-resolution originals added for Mohali, New Chandigarh, Chandigarh since the Phase 0 audit.
**Method:** Full re-scan from the live filesystem (source of truth). Previous audit snapshot preserved in `_audit_prev.json`; current scan in `_audit2.json`. Image dimensions parsed from headers; PDFs parsed for MediaBox/page-count/structure.

---

## 1. Headline

The thumbnail problem is **solved**. The previous library was 82% unusable thumbnails. The current library is **100% processable resolution — zero thumbnails remain.** The original POC targets (Mohali 79/80/82) now exist at full resolution.

| Metric | Previous | Current |
|---|---|---|
| Total files | 187 | **173** |
| Thumbnails (<0.5 MP) | 153 | **0** |
| Median image resolution | 0.09 MP (360×240) | **8.16 MP** |
| Formats | jpg, png | **jpg + 18 PDFs** |
| Usable regions | Panchkula only | **Mohali, New Chandigarh, Panchkula** |

---

## 2. Delta summary

- **Removed:** 148 files — the entire `chandigarh/` folder (55 thumbnails) and all Mohali/New-Chandigarh thumbnails.
- **Added:** 134 files — high-res replacements + 18 PDFs.
- **Net:** −14 files, but a massive quality jump.
- **Chandigarh folder is now empty.** Its sectors appear to have been re-issued as the high-res numbered JPGs now sitting under `new chandigarh/` (verify the city label — see §6).

---

## 3. Current library by region

| Region | Files | Resolution | Source brand | Notes |
|---|---|---|---|---|
| **Panchkula** | 34 JPG | 22.6 MP | EasiMap/Vandan | Unchanged. Still the gold standard. |
| **Mohali** | 74 JPG | 65 × ~8.3 MP + 9 Aerocity blocks @1.17 MP | EasiMap/Vandan | Full sectors 53–85 + colonies + industrial. |
| **New Chandigarh** | 47 JPG (~3.5 MP) + 18 PDF | mixed | **Anurag Property / BuyChandigarh.com** + Aerocity Infra | Different brand; ~30% duplicates. |

---

## 4. Resolution improvements (verified by inspection)

- **Mohali Sector 79** 360×240 (0.09 MP) → **3368×2424 (8.16 MP)**. Native-res plot numbers (325, 344, 301, 957, 1616…) are clearly legible. OCR + polygon extraction now viable. Same uplift across all Mohali sectors.
- **New Chandigarh Sector 8** thumbnail → **2241×1665 (3.73 MP)**, clean color-coded layout with full legend. Legible, slightly tighter than Mohali.
- Files that improved in place (same name): `mohali/70.jpg`, `mohali/masterplan.jpg`, `Aerocity-D/E/F.jpg` (0.08→1.17 MP). Most regions were *replaced wholesale* with new filenames rather than overwritten.

---

## 5. NEW: format & source findings (not in prior audit)

### 5a. 18 PDFs in New Chandigarh — raster-in-PDF, not vector
All are **scanned/CAD raster images wrapped in PDF**, NOT structured vector. This means they are *not* the SVG/vector source that would shortcut Phase 9 — they still need CV/manual polygon work.
- `AEROCITY-Mohali-Map.pdf` — **18-page booklet**, one block per page (A–J etc.), CAD-style 4-Marla plot grids. Brand: **Aerocity Infra**.
- `Omaxe-New-Chandigarh-map.pdf` (11 MB), `The-Greater-Punjab-Officers...pdf` (9 MB), `Eco-City-I-Map.pdf` (12 MB) — large, high-detail.
- DLF Hyde Park (5 files), Eco City I/II, IT City, Emaar, Suntec, PCL, Landchester, zonal plan.
- **Tooling gap:** no PDF rasterizer (poppler/ghostscript/mutool) is installed. Required before PDFs can enter the pipeline. (The POC set avoids this — see §7.)

### 5b. Three different map brands now coexist
- **EasiMap / Vandan** — Mohali + Panchkula. *Mohali maps carry a faint diagonal "EasiMap" watermark tiled across the map face* (more intrusive than Panchkula's bottom-margin credit).
- **Anurag Property / BuyChandigarh.com** — New Chandigarh numbered JPGs (margin logo only).
- **Aerocity Infra** — Aerocity PDF (diagonal watermark).
- **Legal flag:** the master prompt states all maps are EasyMap-owned with rights to rebrand. That assumption holds for Mohali/Panchkula but **not** for the Anurag/Aerocity-branded additions. Confirm ownership/licensing before replacing their branding for those.

---

## 6. Data-hygiene issues (current)

- **New Chandigarh: 47 JPGs → only 33 unique.** ~14 are exact byte duplicates (`8==9`, `11==15`, `19==19'==20`, `21==22`, `27==28`, `30==31`, `34==35`, `37==38`, `40==41`, `46==47`, `48==49`, `50==51`). De-dupe before metadata.
- **Mislabel risk:** `mohali/aerocity-mohali.jpg` is **byte-identical** to `mohali/hpso-developers-sector-122-1.jpg` — two different names, same file → one is mislabeled.
- `mohali/70.jpg` == `mohali/sector-70-mohali.jpg` (naming-transition dup).
- `new chandigarh/PH-1 (1).jpg` == `PH-1.jpg`.
- `panchulka/sector 8 p.jpg` == `panchulka/sector p 8.jpg` (carried over).
- Folder still misspelled `panchulka` → Panchkula. `scctor` typo persists in 8 Panchkula files.
- New Chandigarh files are numbered with no city/sector semantics in the name — needs canonical IDs and a verified city tag (some may actually be Chandigarh sectors re-homed here).

---

## 7. Updated implementation priorities

| Priority | Region/set | Why | Blocker |
|---|---|---|---|
| **P0 — POC (now)** | **Panchkula 20, 21, 7, 8, 25** | Highest res (22.6 MP), single brand, clean bottom-margin credit (no tiled watermark), all JPG. Validates the full workflow with zero tooling gaps. | none |
| **P1 — Batch 2** | **Mohali sectors 53–85** (esp. 79/80/82) | Now full 8 MP, OCR/polygon-viable. Same EasiMap style. | needs watermark handling for diagonal overlay (Phase 2) |
| **P2** | **New Chandigarh numbered JPGs** | 3.5 MP, usable. | de-dupe + verify city + Anurag licensing |
| **P3** | **18 PDFs** | High detail but locked in PDF. | install rasterizer; multi-page splitting (Aerocity booklet) |

**POC decision stands: Panchkula.** The dataset change does not unseat it — Panchkula remains the highest-quality, lowest-risk validation vehicle, and building the POC there keeps the architecture city-agnostic so Mohali (now ready) drops in as Batch 2 with no refactor.

---

## 8. What changed in the plan

- ✅ Mohali POC targets are no longer blocked — they move to **Batch 2 (immediate next)** instead of "waiting on procurement."
- ➕ New work item: **PDF rasterization + multi-page splitting** pipeline stage (P3).
- ➕ New work item: **multi-brand watermark handling** (3 brands, 2 watermark styles) for Phase 2.
- ➕ New work item: **de-dupe + city-label verification** before Phase 3 metadata.
- ⚠️ New legal check: confirm rebrand rights for Anurag/Aerocity-sourced maps.
