# PlotMap Map Processing Review

Generated: 2026-06-25T11:13:42.821Z

## Summary

| Metric | Value |
| --- | --- |
| total maps scanned | 184 |
| processed successfully | 149 |
| manual review needed | 76 |
| deferred PDFs | 18 |
| duplicate/near duplicate files | 49 |
| selected this run | 0 |
| dry run | no |

## Count by city/area

| Value | Count |
| --- | --- |
| Mohali | 75 |
| New Chandigarh | 65 |
| Panchkula | 39 |
| Unknown | 5 |

## Count by file type

| Value | Count |
| --- | --- |
| image | 166 |
| pdf | 18 |

## Count by watermark type

| Value | Count |
| --- | --- |
| bottom-margin credit | 39 |
| corner logo | 47 |
| diagonal tiled watermark | 75 |
| none | 2 |
| unknown | 21 |

## Count by recommendation

| Value | Count |
| --- | --- |
| auto-clean | 20 |
| crop bottom margin | 37 |
| defer PDF | 18 |
| duplicate candidate | 35 |
| enhance | 1 |
| needs better source | 11 |
| ready | 1 |
| watermark reduction attempt | 61 |

## Count by processing status

| Value | Count |
| --- | --- |
| deferred-pdf | 18 |
| not-selected | 17 |
| processed | 149 |

## Sample: Clean / ready maps

| Original | Best processed | Thumbnail | Recommendation | Review? |
| --- | --- | --- | --- | --- |
| /public/plotmap-assets/aerotropolis-original.png | /public/plotmap-assets/processed/unknown/aerotropolis-original-enhanced.webp | /public/plotmap-assets/processed/unknown/aerotropolis-original-thumb.webp | ready | no |

## Sample: Enhanced maps

| Original | Best processed | Thumbnail | Recommendation | Review? |
| --- | --- | --- | --- | --- |
| /maps/enhanced/panchkula-sector-20.png | /public/plotmap-assets/processed/panchkula/panchkula-sector-20-cleaned-enhanced.webp | /public/plotmap-assets/processed/panchkula/panchkula-sector-20-thumb.webp | crop bottom margin | no |
| /maps/enhanced/panchkula-sector-21.png | /public/plotmap-assets/processed/panchkula/panchkula-sector-21-cleaned-enhanced.webp | /public/plotmap-assets/processed/panchkula/panchkula-sector-21-thumb.webp | crop bottom margin | no |
| /maps/enhanced/panchkula-sector-25.png | /public/plotmap-assets/processed/panchkula/panchkula-sector-25-cleaned-enhanced.webp | /public/plotmap-assets/processed/panchkula/panchkula-sector-25-thumb.webp | crop bottom margin | no |

## Sample: Bottom-margin cleaned maps

| Original | Best processed | Thumbnail | Recommendation | Review? |
| --- | --- | --- | --- | --- |
| /maps/enhanced/panchkula-sector-20.png | /public/plotmap-assets/processed/panchkula/panchkula-sector-20-cleaned-enhanced.webp | /public/plotmap-assets/processed/panchkula/panchkula-sector-20-thumb.webp | crop bottom margin | no |
| /maps/enhanced/panchkula-sector-21.png | /public/plotmap-assets/processed/panchkula/panchkula-sector-21-cleaned-enhanced.webp | /public/plotmap-assets/processed/panchkula/panchkula-sector-21-thumb.webp | crop bottom margin | no |
| /maps/enhanced/panchkula-sector-25.png | /public/plotmap-assets/processed/panchkula/panchkula-sector-25-cleaned-enhanced.webp | /public/plotmap-assets/processed/panchkula/panchkula-sector-25-thumb.webp | crop bottom margin | no |

## Sample: Diagonal watermark reduction attempts

| Original | Best processed | Thumbnail | Recommendation | Review? |
| --- | --- | --- | --- | --- |
| /mohali/aerocity-mohali-1.jpg | /public/plotmap-assets/processed/mohali/aerocity-mohali-1-watermark-reduced.webp | /public/plotmap-assets/processed/mohali/aerocity-mohali-1-thumb.webp | watermark reduction attempt | no |
| /mohali/ansal-sector-116-1.jpg | /public/plotmap-assets/processed/mohali/ansal-sector-116-1-watermark-reduced.webp | /public/plotmap-assets/processed/mohali/ansal-sector-116-1-thumb.webp | watermark reduction attempt | no |
| /mohali/ansal-sector-116.jpg | /public/plotmap-assets/processed/mohali/ansal-sector-116-watermark-reduced.webp | /public/plotmap-assets/processed/mohali/ansal-sector-116-thumb.webp | watermark reduction attempt | no |

## Sample: Manual-review-needed maps

| Original | Best processed | Thumbnail | Recommendation | Review? |
| --- | --- | --- | --- | --- |
| /mohali/aero_city_map.webp |  | /public/plotmap-assets/processed/mohali/aero-city-map-thumb.webp | needs better source | yes |
| /mohali/aerocity-block-a.jpg |  | /public/plotmap-assets/processed/mohali/aerocity-block-a-thumb.webp | needs better source | yes |
| /mohali/aerocity-block-b.jpg |  | /public/plotmap-assets/processed/mohali/aerocity-block-b-thumb.webp | needs better source | yes |

## Next Steps

- Review processed samples under `public/plotmap-assets/processed/` before approving them for client use.
- Run larger batches by city after checking sample quality, especially for diagonal tiled watermark maps.
- Keep originals untouched; connect approved `bestProcessedPath` values to the Sector Maps hub later.

## Verification Result

Generated: 2026-06-25T12:25:41.975Z

| Metric | Value |
| --- | --- |
| manifest entries verified | 184 |
| thumbnail paths existing | 149 |
| bestProcessedPath existing | 62 |
| client-usable maps after verification | 35 |
| entries moved to reviewNeeded | 4 |
| broken paths found | 0 |
| duplicate groups remaining | 24 |
| deferred PDFs | 18 |

### Issue Status

| Issue Type | Status |
| --- | --- |
| missing processed files | fixed |
| missing thumbnails | fixed for non-PDF processed entries |
| dry-run paths | fixed: client-facing best/thumbnail paths only point to existing files |
| bottom-margin watermark | improved: processed and usable when crop checks pass |
| diagonal tiled watermark | improved but review needed: thumbnails exist, full reduction remains human-review |
| corner logos | improved but review needed: cleanup variants exist, visual review required |
| duplicates | improved: duplicateGroupId/recommendedKeep/matchKey available for filtering |
| deferred PDFs | deferred |
| low-resolution maps | not fixed: marked review-needed/needs better source where applicable |
| broken/corrupt image files | fixed: no unreadable committed client paths |
