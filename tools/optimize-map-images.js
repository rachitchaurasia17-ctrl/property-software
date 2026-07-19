#!/usr/bin/env node
/**
 * PlotMap map-image optimizer (staged rollout tool — run manually).
 *
 * Creates .webp derivatives NEXT TO the original PNGs for every masterplan /
 * sector image actually referenced by app/plotmap/map-registry.js. Originals
 * are NEVER modified or deleted — the PNG stays the canonical fallback.
 *
 * Safety gates (the reason this is a supervised tool, not an auto step):
 *   1. The derivative must have EXACTLY the same pixel dimensions as the
 *      original (overlay geometry is aligned to pixels — any resize breaks
 *      alignment). The script hard-fails on any mismatch.
 *   2. The derivative must actually be smaller; otherwise it is discarded.
 *   3. Wiring the .webp into the client (<picture> / try-webp-first) is a
 *      SEPARATE reviewed change — do not flip the client until every
 *      derivative has been visually compared against its original at 100%.
 *
 * Usage:
 *   npm i sharp            (one-time, not committed)
 *   node tools/optimize-map-images.js          # dry-run report
 *   node tools/optimize-map-images.js --write  # write .webp files
 *   node tools/optimize-map-images.js --write --quality 82
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const qIdx = process.argv.indexOf('--quality');
const QUALITY = qIdx > -1 ? Number(process.argv[qIdx + 1]) || 82 : 82;

let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('sharp is not installed. Run:  npm i sharp   (do not commit node_modules)');
  process.exit(1);
}

// Collect every image path the registry can actually serve to a client.
function registryImagePaths() {
  const src = fs.readFileSync(path.join(ROOT, 'app/plotmap/map-registry.js'), 'utf8');
  const rel = new Set();
  const re = /"(\/(?:maps|normal(?: |%20)maps)\/[^"]+\.(?:png|jpg|jpeg))"/gi;
  let m;
  while ((m = re.exec(src))) rel.add(decodeURIComponent(m[1]));
  return [...rel];
}

(async () => {
  const paths = registryImagePaths();
  console.log('Registry-referenced raster images:', paths.length);
  let totalIn = 0, totalOut = 0, written = 0, skipped = 0, failed = 0;

  for (const relPath of paths) {
    const abs = path.join(ROOT, relPath.replace(/^\//, ''));
    if (!fs.existsSync(abs)) { console.warn('  MISSING on disk:', relPath); failed++; continue; }
    const inBytes = fs.statSync(abs).size;
    const out = abs.replace(/\.(png|jpe?g)$/i, '.webp');
    try {
      const img = sharp(abs, { limitInputPixels: false });
      const meta = await img.metadata();
      const buf = await img.webp({ quality: QUALITY, effort: 4 }).toBuffer();
      const outMeta = await sharp(buf).metadata();
      if (outMeta.width !== meta.width || outMeta.height !== meta.height) {
        console.error('  DIMENSION MISMATCH — refused:', relPath);
        failed++; continue;
      }
      if (buf.length >= inBytes) {
        console.log('  no gain, skipped:', relPath);
        skipped++; continue;
      }
      totalIn += inBytes; totalOut += buf.length;
      console.log(
        `  ${WRITE ? 'WROTE' : 'would write'} ${path.basename(out)}  ` +
        `${(inBytes / 1048576).toFixed(1)}MB -> ${(buf.length / 1048576).toFixed(1)}MB  ` +
        `(${meta.width}x${meta.height} preserved)`
      );
      if (WRITE) { fs.writeFileSync(out, buf); written++; }
    } catch (err) {
      console.error('  FAILED:', relPath, '-', err.message);
      failed++;
    }
  }

  console.log('');
  console.log(`Summary: ${written} written, ${skipped} skipped, ${failed} failed.`);
  if (totalIn) {
    console.log(`Convertible weight: ${(totalIn / 1048576).toFixed(1)}MB -> ${(totalOut / 1048576).toFixed(1)}MB ` +
      `(${Math.round(100 - (totalOut / totalIn) * 100)}% smaller)`);
  }
  if (!WRITE) console.log('Dry run only. Re-run with --write to create the .webp files.');
  console.log('Client wiring is a separate reviewed step — see docs/PERFORMANCE-BASELINE.md.');
})();
