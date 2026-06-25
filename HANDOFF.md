# PlotMap Handoff

## Current Focus

This handoff covers the map asset audit, enhancement, watermark-cleaning/reduction, manifest, and review workflow. It intentionally does not implement backend, offline mode, login, billing, CRM, admin dashboards, or full 170+ map frontend integration.

## Completed in This Pass

### Map Asset Audit

Created:

- `tools/audit-map-assets.js`
- `tools/map-asset-audit.json`
- `tools/map-asset-audit.md`

The audit scans:

- `public/plotmap-assets/`
- configured source folders from `config/sources.json`
- `maps/enhanced/`

It records metadata, dimensions, megapixels, inferred city/sector/block, quality class, readability risk, watermark type, processing recommendation, and duplicate candidates.

### Processing Pipeline

Created:

- `tools/enhance-map-assets.js`
- `app/plotmap/map-assets.manifest.json`
- `tools/map-processing-review.md`

The pipeline creates local derivatives only under:

- `public/plotmap-assets/processed/`

That folder is ignored by git to avoid bloating the repo with large generated batches.

Sample outputs were generated locally for:

- Panchkula bottom-margin cleanup
- Mohali diagonal watermark reduction
- New Chandigarh corner logo cleanup

### Documentation

Created:

- `app/plotmap/MAP-ASSET-WORKFLOW.md`

It documents audit, enhancement, watermark reduction, review, approval, and future integration.

## Commits Made

- `78218e3` - `tools: add map asset audit pipeline`

Additional pipeline/docs commit should follow after final verification in this session.

## Known Current Counts

Latest audit scanned 184 files including PDFs.

High-level audit buckets:

- bottom-margin credit: 39
- corner logo: 47
- diagonal tiled watermark: 75
- none: 2
- unknown: 21
- deferred PDFs: 18
- duplicate/near-duplicate files: 35

Current manifest after sample processing:

- total manifest entries: 184
- processed sample entries: 9
- planned entries from dry run: 139
- deferred PDFs: 18
- review-needed entries: 76

## Important Caveats

- Diagonal tiled watermark reduction is not perfect automatic removal. Treat generated variants as review candidates.
- Corner-logo cleanup uses conservative masking and must be reviewed because logos may overlap map content.
- Bottom-margin crop is usually safe for Panchkula-style credits but still requires spot checks.
- PDF rasterization is deferred because this pass avoids adding heavy tooling.
- Processed outputs are local and git-ignored by default.

## Antigravity Next Steps

1. Review visual quality of local processed samples under `public/plotmap-assets/processed/`.
2. Approve or reject each sample using `app/plotmap/map-assets.manifest.json`.
3. Run larger targeted processing batches by city/recommendation once sample quality is accepted.
4. Wire approved `bestProcessedPath` and `thumbnailPath` values into the Sector Maps hub.
5. Lazy-load thumbnails in the client UI when connecting sector maps.
6. Apply the same manifest pattern to future masterplans and sector/block maps.
7. Keep originals untouched and out of destructive workflows.

## Codex Next Steps

1. Harden `tools/audit-map-assets.js` duplicate detection with a lightweight perceptual hash if needed.
2. Harden `tools/enhance-map-assets.js` diagonal watermark reduction after visual review.
3. Add a manifest approval field/workflow if the team wants approved/rejected state tracked in JSON.
4. Add no-price audit coverage to any future client-facing map/sector integrations.
5. Add tests only after the pipeline shape stabilizes.
6. Add optional PDF extraction later if Poppler/Ghostscript becomes available.
7. Consider a generated `approved-sector-maps.json` once processed outputs are reviewed.

## Commands

Full audit:

```bash
node tools/audit-map-assets.js --include-pdf
```

Dry-run sample:

```bash
node tools/enhance-map-assets.js --dry-run --sample
```

Targeted samples:

```bash
node tools/enhance-map-assets.js --city panchkula --recommendation "crop bottom margin" --limit 3
node tools/enhance-map-assets.js --city mohali --recommendation "watermark reduction attempt" --limit 3
node tools/enhance-map-assets.js --city "new chandigarh" --recommendation "auto-clean" --limit 3
```

Safety checks:

```bash
node --check tools/audit-map-assets.js
node --check tools/enhance-map-assets.js
node --check app/plotmap/app.js
node --check app/plotmap/data.js
node --check app/plotmap/datasets/tricity.dataset.js
node tools/audit-plotmap.js
```
