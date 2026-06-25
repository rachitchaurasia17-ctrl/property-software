# PlotMap Map Asset Workflow

This workflow is for safely auditing, enhancing, and watermark-reducing the approved PlotMap map batch without overwriting source files.

## Purpose

PlotMap needs cleaned, readable sector/block/masterplan images that can later be connected to the client-facing Sector Maps hub. The goal is to avoid manually cleaning 170+ maps one by one while still keeping review control for hard cases such as diagonal tiled watermarks.

## Ownership

The maps in this batch are approved for cleaning and processing. Watermark removal/reduction, cropping, enhancement, and derivative generation are allowed for this project. The pipeline treats this as an image-quality problem, not a permissions blocker.

## Source Rules

- Originals are never overwritten.
- Processed files are written only under `public/plotmap-assets/processed/`.
- Reports are written under `tools/`.
- The client-facing integration manifest is `app/plotmap/map-assets.manifest.json`.
- Large generated processed outputs are ignored by git by default.

## Audit

Run the full audit, including PDFs:

```bash
node tools/audit-map-assets.js --include-pdf
```

Outputs:

- `tools/map-asset-audit.json`
- `tools/map-asset-audit.md`

Useful filters:

```bash
node tools/audit-map-assets.js --city mohali --limit 20
node tools/audit-map-assets.js --city panchkula
node tools/audit-map-assets.js --include-pdf --json tools/custom-audit.json --md tools/custom-audit.md
```

The audit records dimensions, megapixels, inferred city/sector/block, quality class, readability risk, watermark type, duplicate candidates, and processing recommendation.

## Enhancement and Watermark Reduction

Dry-run first:

```bash
node tools/enhance-map-assets.js --dry-run --sample
```

Run targeted samples:

```bash
node tools/enhance-map-assets.js --city panchkula --recommendation "crop bottom margin" --limit 3
node tools/enhance-map-assets.js --city mohali --recommendation "watermark reduction attempt" --limit 3
node tools/enhance-map-assets.js --city "new chandigarh" --recommendation "auto-clean" --limit 3
```

Generate thumbnails for all image maps:

```bash
node tools/enhance-map-assets.js --thumbnails-only
```

Refresh the manifest from already-existing local processed outputs without writing new images:

```bash
node tools/enhance-map-assets.js --manifest-only
```

Verify the manifest and generated outputs before wiring into the client UI:

```bash
node tools/verify-map-assets.js
```

Outputs:

- updates `app/plotmap/map-assets.manifest.json`
- updates `app/plotmap/map-assets.grouped.json`
- updates `tools/map-processing-review.md`
- creates `tools/map-review-gallery.html`

Run a larger batch only after reviewing samples:

```bash
node tools/enhance-map-assets.js --city mohali --recommendation "watermark reduction attempt" --limit 25
node tools/enhance-map-assets.js --city panchkula --recommendation "crop bottom margin"
```

Use `--force` only to regenerate processed copies. It still never overwrites originals.

## Processing Types

### Ready / Enhance

Creates:

- `*-thumb.webp`
- `*-enhanced.webp`

Enhancement is mild: slight contrast, saturation, and sharpening. It avoids denoise/smoothing so plot numbers and road labels remain readable.

### Bottom-Margin Credit

Creates:

- `*-thumb.webp`
- `*-cleaned.webp`
- `*-cleaned-enhanced.webp`

This uses a conservative bottom crop. Review before approval because some maps may have useful content near the bottom edge.

### Corner Logo

Creates:

- `*-thumb.webp`
- `*-corner-cleaned.webp`
- `*-enhanced.webp`

Corner cleanup is marked review-needed because logos can overlap useful content.

### Diagonal Tiled Watermark

Creates:

- `*-thumb.webp`
- `*-watermark-reduced.webp`
- `*-watermark-reduced-strong.webp`
- `*-enhanced.webp`

Diagonal watermark removal is inherently hard. These outputs are reduction attempts, not guaranteed perfect removals. Always review plot numbers, road names, boundaries, and sector labels before approval.

### PDFs

PDF maps are included in audit counts when `--include-pdf` is used. Convert them separately so PDF failures do not block the image-map batch:

```bash
node tools/convert-pdf-maps.js --dry-run
node tools/convert-pdf-maps.js --limit 2
node tools/convert-pdf-maps.js --force
```

Converted PDF outputs are written under:

- `public/plotmap-assets/processed/pdf-converted/`

The converter never overwrites source PDFs. It first tries ffmpeg PDF rendering, then falls back to extracting the largest embedded JPEG stream for page 1 when direct rendering fails. Results are recorded in:

- `tools/pdf-conversion-results.json`

After conversion, refresh the manifest and grouped launch-tier manifest:

```bash
node tools/verify-map-assets.js
```

PDFs that convert successfully are added to the manifest with `pdfConverted: true`, `conversionStatus: "converted"`, a `thumbnailPath`, and a `bestProcessedPath`. PDFs that fail remain in the manifest as `launchTier: "deferred-pdf"` and must be hidden from the client UI.

## Review

After processing, inspect:

- `tools/map-processing-review.md`
- `tools/map-review-gallery.html`
- `app/plotmap/map-assets.manifest.json`
- Files under `public/plotmap-assets/processed/`

The review report includes:

- total scanned
- count by city/area
- count by file type
- count by watermark type
- count by recommendation
- count processed successfully
- manual-review-needed count
- deferred PDF count
- sample before/after paths

## Approval Workflow

1. Run audit.
2. Run small processing samples by city/recommendation.
3. Manually inspect the processed WebP outputs.
4. For acceptable outputs, use `bestProcessedPath` in `app/plotmap/map-assets.manifest.json`.
5. Wire approved paths into the Sector Maps hub later.
6. Keep rejected/problem outputs out of the live client UI.

## Manifest Shape

Each manifest entry includes:

- `id`
- `matchKey`
- `mapType`
- `originalPath`
- `processedPaths`
- `plannedProcessedPaths`
- `bestProcessedPath`
- `thumbnailPath`
- `city`
- `area`
- `sectorOrBlockName`
- `fileType`
- `dimensions`
- `megapixels`
- `fileSizeBytes`
- `watermarkType`
- `processingStatus`
- `recommendation`
- `launchTier`
- `needsHumanReview`
- `showInClientDefault`
- `showInExpandedLibrary`
- `reviewNeeded`
- `usable`
- `duplicateGroupId`
- `duplicateDisplayStatus`
- `recommendedKeep`
- `qualityClass`
- `conversionNeeded`
- `pdfConverted`
- `conversionStatus`
- `pdfPageCount`
- `notes`

Use `matchKey` for UI matching and grouping, for example:

- `mohali-sector-78`
- `mohali-sector-70`
- `panchkula-sector-20`
- `mohali-block-a`

Use `id` as the unique entry key. Duplicate source files may share the same `matchKey` but must have distinct `id` values.

## Launch Tiers

The verifier classifies every manifest entry into a launch tier:

- `client-ready`: default client library candidate. Use `thumbnailPath` on cards and `bestProcessedPath` when opened.
- `proof-usable`: usable for an expanded/internal-approved library, but still needs human review before default client exposure.
- `internal-review`: keep out of client UI until reviewed.
- `deferred-pdf`: PDF exists but no usable converted image was generated.

Default client UI should use:

```js
entry.showInClientDefault === true
```

Expanded review/approved UI can use:

```js
entry.showInExpandedLibrary === true
```

Hide entries with:

- `launchTier === "internal-review"`
- `launchTier === "deferred-pdf"`
- `duplicateDisplayStatus === "hidden-duplicate"`
- missing `thumbnailPath` or missing `bestProcessedPath`

## Connecting to PlotMap Later

Antigravity/Codex should connect only `showInClientDefault === true` entries by default. Use `thumbnailPath` for cards and `bestProcessedPath` for the opened sector/block map. Hide `needsHumanReview` maps from the client UI unless an explicit review/approval workflow allows them. Do not connect every processed output automatically.

The client-facing app should continue to use:

- Original Map as proof.
- Easy Map as explanation.
- Sector Map as exact plot proof.

This pipeline only prepares the cleaned image library for that future integration.
