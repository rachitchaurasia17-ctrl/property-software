# Claude Map Pipeline Handoff

## 1. Repo Reality

- Repo: `rachitchaurasia17-ctrl/property-software`
- Local path: `C:\Users\rachi_l35wosr\OneDrive\Desktop\xyz`
- App type: framework-free browser SPA.
- No React, no TypeScript, no bundler, no build step.
- Main app files:
  - `app/plotmap/index.html`
  - `app/plotmap/app.js`
  - `app/plotmap/data.js`
  - `app/plotmap/styles.css`
  - `app/plotmap/geo.json`
  - `app/plotmap/datasets/tricity.dataset.js`

Claude should work inside the existing SPA shape unless explicitly asked otherwise.

## 2. Current Git State

- Branch: `main`
- Staged files: none.
- Modified files:
  - `app/plotmap/app.js`
- Untracked files:
  - `.agents/`
  - `.mcp.json`
  - `skills-lock.json`

Important warning: there are unstaged frontend changes in `app/plotmap/app.js`. Do not overwrite, reset, or rebuild this file without first inspecting the diff. Claude/Antigravity work is at risk only if they replace `app.js` wholesale or apply stale patches.

## 3. Verified Existing Files

Core app:

| Path | Status | Purpose | Claude | Antigravity |
| --- | --- | --- | --- | --- |
| `app/plotmap/index.html` | exists | SPA shell | inspect | inspect if wiring |
| `app/plotmap/app.js` | exists, modified | UI, map rendering, View Sector Maps | inspect first | inspect before wiring |
| `app/plotmap/data.js` | exists | shared categories, dataset registry, area switcher | inspect | inspect |
| `app/plotmap/styles.css` | exists | client UI styling | inspect when polishing | inspect if UI work |
| `app/plotmap/geo.json` | exists | extracted Original Map overlay geometry | inspect | optional |
| `app/plotmap/datasets/tricity.dataset.js` | exists | active Aerocity/Aerotropolis dataset | inspect first | inspect if connecting maps |

Map pipeline:

| Path | Status | Purpose | Claude | Antigravity |
| --- | --- | --- | --- | --- |
| `app/plotmap/map-assets.manifest.json` | exists | flat verified map manifest | skim only | inspect first for sector maps |
| `app/plotmap/map-assets.grouped.json` | exists | grouped manifest by city/map type | optional | inspect for grouped UI |
| `app/plotmap/MAP-ASSET-WORKFLOW.md` | exists | pipeline operating docs | skim | inspect |
| `tools/audit-map-assets.js` | exists | non-destructive source audit | avoid unless needed | Codex later |
| `tools/enhance-map-assets.js` | exists | derivative image generation | do not run now | Codex later |
| `tools/verify-map-assets.js` | exists | validates manifest, launch tiers, gallery | do not run unless needed | Codex later |
| `tools/convert-pdf-maps.js` | exists | PDF to image derivatives | do not run now | Codex later |
| `tools/map-asset-audit.json` | exists | machine audit output | no need | optional |
| `tools/map-asset-audit.md` | exists | human audit report | optional | optional |
| `tools/map-processing-review.md` | exists | processing and verification report | skim | inspect |
| `HANDOFF.md` | exists | Codex/Antigravity map asset handoff | skim | inspect |
| `app/plotmap/HANDOFF.md` | exists | app-local handoff | optional | optional |

Assets:

| Path | Status | Purpose | Claude | Antigravity |
| --- | --- | --- | --- | --- |
| `public/plotmap-assets/` | exists | current app assets | inspect first | inspect |
| `public/plotmap-assets/processed/` | exists | local generated derivatives, gitignored | do not commit huge outputs | inspect locally |
| `public/plotmap-assets/processed/pdf-converted/` | exists | local converted PDF outputs | optional | inspect if showing PDFs |
| `public/plotmap-assets/aerotropolis-original.png` | exists | large original masterplan | inspect/reference |
| `public/plotmap-assets/aerotropolis-original-web.jpg` | exists | current Original Map web asset | inspect first |
| `public/plotmap-assets/aerotropolis-overlays.svg` | exists | hand-mapped SVG overlay asset | inspect first |
| `public/plotmap-assets/aerotropolis-annotated-reference.png` | exists | human annotated reference | inspect/reference |
| `public/plotmap-assets/aerotropolis-easy-map-reference.png` | exists | Easy Map visual reference | inspect/reference |
| `public/plotmap-assets/sector-map.jpg` | exists | placeholder/demo sector map | optional |

Local generated asset counts:

- Processed WebP-like files counted under `public/plotmap-assets/processed/`: 327
- Converted PDF output files under `public/plotmap-assets/processed/pdf-converted/`: 69

## 4. Current Map Asset Pipeline Status

Manifest: `app/plotmap/map-assets.manifest.json`

Verified counts:

- Total manifest entries: 184
- Entries with `originalPath`: 184
- Entries with `bestProcessedPath`: 72
- Entries with `processedPaths`: 159
- Entries with `thumbnailPath`: 159
- Entries with any currently valid image path: 160
- Entries missing a usable/currently resolvable image path: 24
- Entries with `showInClientDefault === true`: 35
- Entries with `showInPitchMode`: field not present
- Entries with `recommendedKeep === true`: 24
- Entries with `duplicateDisplayStatus === "hidden-duplicate"`: 25
- Image entries: 166
- PDF entries: 18
- Converted PDFs: 10
- Failed/deferred PDFs: 8

Launch tiers:

- `client-ready`: 35
- `proof-usable`: 33
- `internal-review`: 108
- `deferred-pdf`: 8

Processing status:

- `processed`: 159
- `not-selected`: 17
- `deferred-pdf`: 8

By city:

- Mohali: 75
- New Chandigarh: 65
- Panchkula: 39
- Unknown: 5

Path integrity:

- Referenced thumbnails missing on disk: 0
- Referenced `bestProcessedPath` files missing on disk: 0
- Converted PDF image/thumb references missing: 0
- `originalPath` fallback paths missing under current repo/public resolution: 179

Important: most `originalPath` values are source-style paths, not browser-safe public URLs. Antigravity should not rely on automatic original fallback unless those originals are copied/mapped into a web-served location.

## 5. Grouped Manifest and Duplicates

Grouped manifest: `app/plotmap/map-assets.grouped.json`

Observed shape:

- Top-level keys: `generatedAt`, `source`, `cities`
- Entries found in grouped file: 184
- MatchKey groups: 164
- Duplicate groups found by repeated `matchKey`: 16
- Hidden duplicates: 25
- Entries with `matchKey`: 184
- `recommendedKeep` is present in the flat manifest; grouped entries did not expose it in the same direct shape during verification.

`matchKey` is the main deterministic grouping key for View Sector Maps, for example sector/block matching. The grouped manifest is usable for city/map-type browsing, but Antigravity should prefer the flat manifest for exact filtering until grouped schema is reviewed.

## 6. Important Scripts

All script syntax checks passed.

| Script | Command | Inputs | Outputs | Safe? | Notes |
| --- | --- | --- | --- | --- | --- |
| `tools/audit-map-assets.js` | `node tools/audit-map-assets.js --include-pdf` | source folders, `public/plotmap-assets`, config | `tools/map-asset-audit.json`, `.md` | non-destructive | Re-scan only when asset folders change. |
| `tools/enhance-map-assets.js` | `node tools/enhance-map-assets.js --manifest-only` or targeted sample commands | audit JSON and source assets | derivatives under `public/plotmap-assets/processed/`, manifest, review MD | originals not overwritten | Do not run full enhancement now unless requested. |
| `tools/verify-map-assets.js` | `node tools/verify-map-assets.js` | manifest, local outputs, PDF results | updated manifest, grouped JSON, review MD, gallery | non-destructive for originals | Can take several minutes because it probes many images. |
| `tools/convert-pdf-maps.js` | `node tools/convert-pdf-maps.js --dry-run` then targeted/force | audited PDFs | `public/plotmap-assets/processed/pdf-converted/`, `tools/pdf-conversion-results.json` | originals not overwritten | Uses ffmpeg and embedded JPEG fallback. |
| `tools/audit-plotmap.js` | `node tools/audit-plotmap.js` | client app files | console result | read-only | Checks no-price/client-facing language issues. |

Checks run and passed:

- `node --check tools/audit-map-assets.js`
- `node --check tools/enhance-map-assets.js`
- `node --check tools/verify-map-assets.js`
- `node --check tools/convert-pdf-maps.js`
- `node --check app/plotmap/app.js`
- `node --check app/plotmap/data.js`
- `node --check app/plotmap/datasets/tricity.dataset.js`
- `node tools/audit-plotmap.js`

## 7. Manifest Schema Summary

Important fields:

- `id`: unique manifest entry key.
- `matchKey`: normalized matching/grouping key for sector/block lookup.
- `city`, `area`, `sectorOrBlockName`, `sectorNumber`, `blockName`: display and matching metadata.
- `originalPath`: source/original path. Many are not browser-safe currently.
- `processedPaths`: all generated derivative paths.
- `bestProcessedPath`: best opened-map image path when available.
- `thumbnailPath`: card thumbnail path.
- `recommendedKeep`: duplicate preference flag in flat manifest.
- `duplicateDisplayStatus`: hide entries with `hidden-duplicate`.
- `showInClientDefault`: strict default client visibility flag.
- `showInPitchMode`: not present currently.
- `launchTier`: `client-ready`, `proof-usable`, `internal-review`, or `deferred-pdf`.
- `processingStatus`: `processed`, `not-selected`, or `deferred-pdf`.
- `pdfConverted`: true for successfully converted PDFs.
- `conversionStatus`: PDF conversion state.
- `reviewNeeded`: human review flag.
- `watermarkType`: bottom-margin credit, corner logo, diagonal tiled watermark, none, unknown.
- `qualityClass`: current quality bucket.

## 8. Current View Sector Maps State

Implementation is in `app/plotmap/app.js`:

- Manifest is loaded near the bottom of `app.js`.
- Sector hub HTML is created by `sectorsHubHTML()`.
- Cards are created by `secCardHTML()`.
- Sector map opening uses `activeSectorMap()` and `bestProcessedPath`.
- Current `readySectorMaps()` filter is strict:
  - `usable === true`
  - `reviewNeeded === false`
  - `processingStatus === "processed"`
  - if duplicate group exists, requires `recommendedKeep === true`

Current likely visible count in View Sector Maps: 35 maps.

Strict-mode hiding:

- 160 entries have some currently valid image path.
- Strict default shows 35.
- Therefore 125 path-valid entries are hidden by strict mode or review/duplicate/pipeline tiering.
- Of those, 33 are `proof-usable` and are the likely pitch-mode candidates if the display rule is relaxed.

Current UI does not use `showInPitchMode` because the field does not exist. It currently has thumbnail usage, best-processed opening, duplicate filtering through `recommendedKeep`, and an `originalPath` fallback for card background in unstaged `app.js`; however most `originalPath` values are not browser-safe, so that fallback is risky.

Later display rule for pitch/library mode:

1. Prefer `bestProcessedPath`.
2. Fallback to `processedPaths[0]`.
3. Fallback to `originalPath` only if it actually resolves to a browser-served file.
4. Show converted PDFs only if `pdfConverted === true`, `conversionStatus === "converted"`, and converted paths exist.
5. Hide only missing/broken paths, failed/deferred PDFs, and `duplicateDisplayStatus === "hidden-duplicate"`.
6. Do not require `showInClientDefault` for pitch mode.

## 9. Current Masterplan Status

Active masterplan:

- Area ID: `aerotropolis`
- Area name shown in data: `Aerocity`
- Dataset ID: `tricity-aerotropolis`
- Dataset name: `Mega Aerocity Map`

Asset references:

- Original Map web asset: `/public/plotmap-assets/aerotropolis-original-web.jpg`
- Raw original: `public/plotmap-assets/aerotropolis-original.png`
- Overlay SVG asset: `/public/plotmap-assets/aerotropolis-overlays.svg`
- Extracted overlay geometry: `/app/plotmap/geo.json`
- Demo sector map fallback: `/public/plotmap-assets/sector-map.jpg`
- Easy Map is generated in `app.js` from authored data, not from a finished reusable SVG parser.

Overlay/geometric sources:

- `tricity.dataset.js`: authored roads, blocks, zones, pins, properties, sector maps.
- `geo.json`: extracted Original Map geometry keyed by SVG-style IDs.
- `aerotropolis-overlays.svg`: raw hand-mapped SVG reference asset.
- `app.js`: rendering and interaction logic.

Current category geometry:

- Key Roads: 9 real authored Easy Map paths, 9 SVG IDs, 9 geo paths.
- Blocks: 10 Aerotropolis block rectangles in Easy Map; 10 block paths in `geo.json`.
- Sectors: 8 Aerocity sector rectangles in Easy Map; 8 sector paths in `geo.json`.
- Commercial: 4 zones with SVG IDs and Easy Map rectangles.
- Education: 6 institution pins with SVG IDs.
- IT & Employment: 3 pins with SVG IDs.
- Landmarks: 4 pins with SVG IDs.
- Green/Open Areas: 1 Easy Map rectangle, no SVG ID.
- Future Growth: 1 Easy Map rectangle, no SVG ID.
- Entry/Exit: 3 Easy Map pins, no SVG ID.

Potential cleanup needed:

- Some text in dataset/comments appears mojibake encoded in terminal output.
- Some labels/IDs are still rough or inconsistent.
- Easy Map geometry is currently a mixed authored schematic: roads use `easyD`, blocks/zones use simple rectangles, Original Map highlights use `geo.json`.
- The Easy Map base is good enough for Claude to turn into a cleaner reusable Easy Map system, but not yet a fully verified Figma/SVG-to-map pipeline.

## 10. What Claude Should Do Next

Claude should focus on:

- Current Aerocity/Aerotropolis masterplan.
- Turning hand-mapped overlays into a proper reusable Easy Map system.
- Preserving Original Map as proof.
- Making Easy Map generation reusable for future city/masterplan datasets.
- Keeping `View Sector Maps` intact while working on the masterplan.
- Using `tricity.dataset.js`, `geo.json`, and `aerotropolis-overlays.svg` as the first golden example.

Claude should inspect first:

1. `app/plotmap/app.js` diff and current implementation.
2. `app/plotmap/datasets/tricity.dataset.js`.
3. `app/plotmap/geo.json`.
4. `public/plotmap-assets/aerotropolis-overlays.svg`.
5. `public/plotmap-assets/aerotropolis-easy-map-reference.png`.
6. `app/plotmap/data.js`.
7. `app/plotmap/map-assets.manifest.json` only enough to avoid breaking View Sector Maps.

## 11. What Claude Should Not Waste Time On

- Do not re-scan all map assets from scratch.
- Do not process watermarks now.
- Do not redo the Codex audit.
- Do not rebuild the frontend from scratch.
- Do not add React, TypeScript, a bundler, backend, login, billing, CRM, admin, or offline systems.
- Do not wire all 180 sector maps until Easy Map/masterplan work is committed.
- Do not assume `originalPath` is safe for browser display.

## 12. What Antigravity Should Do After Claude

After Claude finishes the masterplan/Easy Map system:

- Wire all usable maps into View Sector Maps.
- Add pitch/library mode display rules.
- Use `bestProcessedPath`, then `processedPaths[0]`, then only valid browser-safe `originalPath`.
- Hide broken/missing paths.
- Hide failed/deferred PDFs.
- Hide `duplicateDisplayStatus === "hidden-duplicate"`.
- Avoid requiring `showInClientDefault` for pitch mode.

## 13. What Codex Should Do Later

- Continue watermark reduction variants only after masterplan work is stable.
- Generate/update review gallery as processed outputs change.
- Promote maps gradually from `proof-usable` or `internal-review` to client-ready after human review.
- Update the manifest after cleaning and approvals.
- Harden originalPath web mapping if Antigravity wants fallback-to-original.

## 14. Unresolved Risks

- `app/plotmap/app.js` has unstaged frontend changes that must be preserved.
- Many maps still have watermarks or need manual review.
- Diagonal tiled watermark removal is not solved perfectly.
- 8 PDFs remain failed/deferred.
- Large processed outputs are local/gitignored and may not exist after a fresh clone unless regenerated or copied.
- Most `originalPath` values do not currently resolve as browser-served files.
- Current Easy Map is usable but still mixed/manual, not a completed reusable SVG parser pipeline.

