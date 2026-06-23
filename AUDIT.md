# PlotMap — Phase 0: Map Library Technical Audit

**Date:** 2026-06-21
**Scope:** Full inspection of the EasyMap (EasiMap) source library before any processing.
**Verdict:** **DO NOT proceed to Phase 1 as specified.** The audit found one decisive, business-changing fact that invalidates the current POC plan. Recommendation and a corrected plan are in §18.

---

## 0. How this audit was run

- All 187 files enumerated; image headers parsed directly (JPEG SOF / PNG IHDR) for true pixel dimensions — no reliance on filenames or thumbnails.
- EOI/IEND markers checked for truncation/corruption.
- Byte+dimension signatures compared for duplicates.
- Representative images visually inspected at fit-scale **and** at native (100%) resolution to score legibility honestly.
- Raw per-file data: `_audit.json` (kept in repo as evidence).

---

## 1. Total map count

**187 image files** across 4 folders:

| Folder | Files |
|---|---|
| `chandigarh` | 55 |
| `mohali` | 90 |
| `new chandigarh` | 8 |
| `panchulka` (Panchkula) | 34 |

These are not 187 distinct sectors — many are sub-blocks (Aerocity A–J), private colonies (Emaar, JLPL, TDI, Gillco…), industrial phases, and master plans.

---

## 2. Resolution distribution — ⚠️ THE HEADLINE FINDING

The library is **sharply bimodal**. There is no middle.

| Bucket | Count | What they are |
|---|---|---|
| < 0.5 MP (≈320×240–360×240) | **153** | Web **thumbnails** |
| 0.5–8 MP | 0 | — |
| > 8 MP (5658×4000, 22.6 MP) | **34** | Full **print-quality** maps |

- **Median image is 360×240.** Median file size 26 KB.
- **Every full-resolution file is in Panchkula.** All 34 Panchkula maps are ~22.6 MP (one is 17.4 MP).
- **Every Chandigarh, Mohali, and New Chandigarh file is a thumbnail** (≈320–360 px wide, ~17–30 KB).

**Implication:** Panchkula is the *only* region delivered as usable source maps. The other three regions were delivered as ~26 KB web thumbnails, not maps.

---

## 3. File formats

- **185 `.jpg`**, **1 `.png`**, **1 file with no extension** (`new chandigarh/eco city 1` — actually a PNG by byte signature; needs a `.png` rename).
- All JPEGs are standard baseline/progressive. No TIFF, no PDF, no source vector (SVG/AI/PDF) was provided — important for Phase 9.

---

## 4. Image quality score

| Tier | Score (1–10) | Basis |
|---|---|---|
| Panchkula full-res (34 files) | **9 / 10** | Vector-rendered exports. At 100% zoom text edges are crisp and anti-aliased, boundaries are clean polylines, fills are flat distinct colors. Effectively the best a raster source can be. |
| Thumbnails (153 files) | **2 / 10** | Correct map *content* but downscaled to ~26 KB. Plot-number text is sub-pixel and unrecoverable. |

These are **not** noisy photographic scans — they are exports from a print/layout system (page numbers like "Page No. 34" are visible). That is good news for the full-res set and irrelevant for the thumbnails.

---

## 5. OCR readability score

| Set | Est. OCR success on plot numbers | Reason |
|---|---|---|
| Panchkula full-res | **High (~85–95%)** | Clean text, high contrast, large raster. Main losses: rotated road labels, tiny GH sub-codes, Hindi line. |
| Thumbnails | **~0–5%** | Plot numbers are 2–4 px tall. The information physically does not exist in the file. |

OCR is viable **only** on the full-res Panchkula set.

---

## 6. Plot number readability

- **Full-res:** Plot numbers (`GH-64`, `67`, `68`, `15A`…) are individually legible. Confirmed by native crop inspection.
- **Thumbnails:** Plot numbers are colored blobs. Even the data tables (plot no. + area) baked into Mohali sheets are illegible.

---

## 7. Road label readability

- **Full-res:** Road labels legible (`18 M ROAD`, `25 Mtr WIDE ROAD`, `AMBALA-KALKA ROAD 45 Mtr. WIDE`). Some are rotated/vertical — OCR needs orientation handling.
- **Thumbnails:** Road *positions* visible, labels not.

---

## 8. Watermark consistency

**Consistent and mild.** Branding is `EasiMap — a product of Vandan 9876544963` plus `WE BEAR NO RESPONSIBILITY FOR INCORRECT DETAILS…` and a small "Vandan" logo block. There is **no** intrusive full-bleed/tiled watermark across the map face. This is a credit line, not a destructive watermark.

---

## 9. Watermark placement patterns

- Full-res: bottom-left text credit + bottom-right title block (`Page No.`, sector tag). Confined to the bottom margin — easy to crop/replace without touching map content.
- Thumbnails: small "Vandan" logo, usually a corner.
- **Good for Phase 2:** replacing branding is a margin operation, not an inpainting-over-the-map operation.

---

## 10. Duplicate maps

3 exact byte-identical pairs found:

| File A | File B | Note |
|---|---|---|
| `panchulka/sector 8 p.jpg` | `panchulka/sector p 8.jpg` | True duplicate, two naming conventions |
| `chandigarh/26.jpg` | `mohali/67.jpg` | **Misfiled** — same file in two cities |
| `chandigarh/36.jpg` | `mohali/aman city kharar.jpg` | **Misfiled / mislabeled** |

The cross-folder dupes mean some thumbnails are mislabeled by city — manual verification needed before trusting any thumbnail's sector/city tag.

---

## 11. Corrupted files

**None.** 0 unreadable headers, 0 truncated files (all JPEG EOI / PNG IEND markers intact). The only file-integrity issue is the missing extension on `eco city 1`.

---

## 12. Sector naming inconsistencies (high)

- Folder `panchulka` misspells **Panchkula**.
- `"scctor"` typo in **8** Panchkula files (`scctor 10 p`, `scctor p 12a`…).
- "P" token placement is random: `sector 8 p` vs `sector p 8` vs `sector p20` vs `sector p 20` vs `sector1 p`.
- Mixed schemes: bare numbers (`79.jpg`), descriptive (`emaar mgf 99,104,105,106,108,109.jpg`), and sub-blocks (`Aerocity-E1.jpg`).
- No city prefix on numeric files — only the parent folder disambiguates, and §10 shows the folder is sometimes wrong.

A canonical ID scheme (`{city}-sector-{n}` / `{city}-{project}-{block}`) must be imposed in Phase 3.

---

## 13. Missing sectors

Within the numeric ranges present:

- **Chandigarh** gaps: 6, 12, 13, 14 (plus 1 & 2 exist only as named `sector 1/2.jpg`).
- **Mohali** gaps: 57, 58, 72, 73, 74, 75, 76, 81, 83, 84.
- **Panchkula** is the most complete numeric set (1–31 with few gaps) — and it is also the only full-res set.

"100+ maps" is accurate by file count, but coverage is patchy and unverified per city.

---

## 14. Potential processing risks

1. **Upscaling thumbnails is a dead end.** No super-resolution model can reconstruct plot numbers that are not in a 360×240 source. Attempting it produces confident-looking fiction — the worst outcome for a tool sold as "visual proof."
2. **Mislabeled/duplicate files** could put a Chandigarh map under a Mohali sector. Trust must be verified, not assumed.
3. **Rotated labels** will hurt naive OCR.
4. **No vector source** was supplied — Phase 9 vectorization starts from raster only.
5. **JPEG artifacts** on full-res are minor but will compound if re-encoded repeatedly; process from originals once, store lossless (PNG) intermediates.

---

## 15. Estimated enhancement success rate

| Set | Success | Meaning |
|---|---|---|
| Panchkula full-res | **High** | Light sharpening/contrast/standardize-dimensions. Mostly cleanup, not rescue. |
| Thumbnails | **Effectively 0** | Enhancement cannot restore destroyed text. Requires re-sourcing originals, not processing. |

---

## 16. Estimated OCR success rate

- Panchkula full-res: **~85–95%** of plot/road labels.
- Everything else: **not viable** until originals are sourced.

---

## 17. Estimated polygon extraction feasibility

- **Panchkula full-res: feasible.** Flat distinct fill colors + clean boundary polylines make color-segmentation + contour tracing realistic for a strong first pass, then human correction in the Phase 5 tool.
- **Thumbnails: not feasible** at any useful accuracy.

---

## 18. Bottleneck, recommendation & corrected plan

### The single bottleneck
**Source data, not processing.** 82% of the library (153/187) is thumbnails that cannot be enhanced, OCR'd, or vectorized. The pipeline is not the constraint — the missing high-res originals are.

### The plan conflict you need to know about
The master prompt's POC targets are **Mohali 79, 80, 82, Aerocity, and Panchkula 20.** Of these:

- Mohali 79 / 80 / 82 → **360×240 thumbnails** (unusable)
- Aerocity blocks → **320×240 thumbnails** (unusable)
- **Panchkula Sector 20 → 5658×4000 full-res (the only usable target)**

Four of five chosen POC sectors cannot be built from the data on disk.

### Recommendation
1. **Re-scope the POC to Panchkula**, which is the only region delivered at usable resolution. Suggested POC set, all full-res and present: **Panchkula Sector 20, 21, 7, 8, 25.** Build the entire vertical slice (enhance → rebrand → metadata → CV → polygon tool → inventory binding → presentation mode) on these. The workflow validates identically; only the city changes.
2. **In parallel, go back to EasyMap/Vandan and request the high-res originals** for Mohali, Chandigarh, New Chandigarh. They demonstrably exist (Panchkula proves the production pipeline). This is a procurement task, not an engineering one, and it unblocks ~80% of the library.
3. **Do not budget any time for upscaling thumbnails.** Treat the 153 thumbnails as a coverage *index* (which sectors exist) and a UI placeholder only — never as a processing input.

### Recommended processing pipeline (for the full-res set)
```
originals/ (immutable, never written)
  → standardize: strip bottom margin, normalize to fixed long-edge, store lossless PNG → maps/enhanced/
  → light enhance: mild unsharp + contrast (NO denoise/smoothing on vector exports)
  → rebrand: composite "Powered by EasyMap × PlotMap" in cleared bottom margin → Phase 2
  → metadata: canonical id {city}-sector-{n}, w/h, status → maps/metadata/ → Phase 3
  → CV pass (separate output dir, confidence-scored, never overwrites source) → Phase 4
  → human polygon tool → maps/polygons/ → Phase 5
```
Keep map layer and inventory layer fully decoupled (Phase 6) regardless of region.

### Immediate cleanup tasks (cheap, do first)
- Rename `new chandigarh/eco city 1` → `eco city 1.png`.
- Resolve 3 duplicate pairs; verify the 2 cross-city misfiles (`chandigarh/26`↔`mohali/67`, `chandigarh/36`↔`mohali/aman city kharar`) before tagging anything.
- Fix `panchulka`→`panchkula` and `scctor`→`sector` when imposing canonical IDs.

---

## Decision gate

Per the master prompt, implementation is paused pending approval. **Two questions for you:**
1. Re-scope the POC to Panchkula (recommended), or wait for high-res Mohali/Aerocity originals before starting?
2. Can you obtain the high-res originals for the other three regions from EasyMap/Vandan?
