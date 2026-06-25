#!/usr/bin/env node
/**
 * PlotMap safe map enhancement + watermark-reduction pipeline.
 *
 * Reads tools/map-asset-audit.json and writes derivative copies only under:
 *   public/plotmap-assets/processed/
 *
 * Originals are never overwritten. The generated manifest is written to:
 *   app/plotmap/map-assets.manifest.json
 *
 * Usage:
 *   node tools/enhance-map-assets.js --dry-run --sample
 *   node tools/enhance-map-assets.js --sample
 *   node tools/enhance-map-assets.js --city mohali --recommendation "watermark reduction attempt" --limit 10
 *   node tools/enhance-map-assets.js --force --limit 25
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AUDIT_PATH = path.join(ROOT, 'tools', 'map-asset-audit.json');
const OUT_ROOT = path.join(ROOT, 'public', 'plotmap-assets', 'processed');
const MANIFEST_PATH = path.join(ROOT, 'app', 'plotmap', 'map-assets.manifest.json');
const REVIEW_PATH = path.join(ROOT, 'tools', 'map-processing-review.md');

function parseArgs(argv) {
  const out = { dryRun: false, sample: false, force: false, manifestOnly: false, thumbnailsOnly: false, city: '', recommendation: '', limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--sample') out.sample = true;
    else if (a === '--force') out.force = true;
    else if (a === '--manifest-only') out.manifestOnly = true;
    else if (a === '--thumbnails-only') out.thumbnailsOnly = true;
    else if (a === '--city') out.city = String(argv[++i] || '').toLowerCase();
    else if (a === '--recommendation' || a === '--only') out.recommendation = String(argv[++i] || '').toLowerCase();
    else if (a === '--limit') out.limit = Number(argv[++i] || 0);
  }
  return out;
}

const args = parseArgs(process.argv);

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

function webPath(abs) {
  return '/' + rel(abs);
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function safeBaseName(rec) {
  const ext = path.extname(rec.fileName);
  return path.basename(rec.fileName, ext)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'map';
}

function matchKeyFor(rec) {
  const name = rec.sectorOrBlockName || safeBaseName(rec);
  return `${rec.city || 'unknown'} ${name}`
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function mapTypeFor(rec) {
  const name = String(rec.sectorOrBlockName || '').toLowerCase();
  if (name.startsWith('sector ')) return 'sector';
  if (name.startsWith('block ')) return 'block';
  if (name.includes('pocket')) return 'pocket';
  return 'map';
}

function outDirFor(rec) {
  const city = String(rec.city || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
  return path.join(OUT_ROOT, city);
}

function targetFor(rec, suffix) {
  return path.join(outDirFor(rec), `${safeBaseName(rec)}-${suffix}.webp`);
}

function ffmpeg(src, filters, dst) {
  ensureDir(dst);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel', 'error',
    '-i', src,
    '-vf', filters,
    '-compression_level', '5',
    '-quality', '82',
    dst
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function fileExistsForWrite(dst) {
  return fs.existsSync(dst) && !args.force;
}

function writeVariant(rec, suffix, filters, outputs) {
  const dst = targetFor(rec, suffix);
  outputs.planned.push({ suffix, path: webPath(dst), filters });
  if (args.dryRun) return;
  if (fileExistsForWrite(dst)) {
    outputs.skipped.push({ suffix, path: webPath(dst), reason: 'exists; use --force to regenerate' });
    return;
  }
  ffmpeg(rec.originalPath, filters, dst);
  outputs.written.push({ suffix, path: webPath(dst), bytes: fs.statSync(dst).size });
}

function thumbFilters() {
  return [
    "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease",
    'unsharp=3:3:0.35:3:3:0',
    'eq=contrast=1.03:saturation=1.02'
  ].join(',');
}

function enhancedFilters() {
  return [
    "scale=w='min(4200,iw)':h='min(4200,ih)':force_original_aspect_ratio=decrease",
    'unsharp=5:5:0.55:5:5:0',
    'eq=contrast=1.045:brightness=0.004:saturation=1.02'
  ].join(',');
}

function bottomCleanFilters() {
  return [
    "crop=iw:floor(ih*0.965):0:0",
    "scale=w='min(4200,iw)':h='min(4200,ih)':force_original_aspect_ratio=decrease",
    'unsharp=5:5:0.5:5:5:0',
    'eq=contrast=1.035:saturation=1.015'
  ].join(',');
}

function cornerCleanFilters() {
  // Conservative: softly covers a likely logo region in the lower-right margin.
  // These outputs are always reviewNeeded because logos may overlap useful map content.
  return [
    "drawbox=x=iw*0.80:y=ih*0.88:w=iw*0.19:h=ih*0.10:color=white@0.82:t=fill",
    "scale=w='min(4200,iw)':h='min(4200,ih)':force_original_aspect_ratio=decrease",
    'unsharp=5:5:0.45:5:5:0',
    'eq=contrast=1.035:saturation=1.01'
  ].join(',');
}

function diagonalReductionFilters(strength) {
  const contrast = strength === 'strong' ? '1.085' : '1.055';
  const saturation = strength === 'strong' ? '0.90' : '0.96';
  const brightness = strength === 'strong' ? '0.010' : '0.006';
  return [
    "scale=w='min(4200,iw)':h='min(4200,ih)':force_original_aspect_ratio=decrease",
    `eq=contrast=${contrast}:brightness=${brightness}:saturation=${saturation}`,
    'unsharp=5:5:0.45:5:5:0'
  ].join(',');
}

function shouldProcess(rec) {
  if (rec.fileType !== 'image') return false;
  if (args.city && !String(rec.city || '').toLowerCase().includes(args.city)) return false;
  if (args.recommendation && !String(rec.processingRecommendation || '').toLowerCase().includes(args.recommendation)) return false;
  if (rec.duplicateConfidence >= 0.98 && !rec.recommendedKeep) return false;
  return true;
}

function sampleRecords(records) {
  if (!args.sample) return records;
  const buckets = [
    ['ready', r => /ready/.test(r.processingRecommendation)],
    ['enhance', r => /enhance/.test(r.processingRecommendation)],
    ['bottom', r => /crop bottom margin/.test(r.processingRecommendation)],
    ['corner', r => /auto-clean/.test(r.processingRecommendation)],
    ['diagonal', r => /watermark reduction attempt/.test(r.processingRecommendation)],
    ['manual', r => /manual|needs better source/.test(r.processingRecommendation)]
  ];
  const picked = [];
  const seen = new Set();
  for (const [, pred] of buckets) {
    for (const r of records.filter(pred).slice(0, 3)) {
      if (!seen.has(r.relativePath)) {
        picked.push(r);
        seen.add(r.relativePath);
      }
    }
  }
  return picked;
}

function processOne(rec) {
  const outputs = { planned: [], written: [], skipped: [], errors: [] };
  try {
    writeVariant(rec, 'thumb', thumbFilters(), outputs);
    if (args.thumbnailsOnly) return outputs;
    if (/ready|enhance|manual review|needs better source/i.test(rec.processingRecommendation)) {
      writeVariant(rec, 'enhanced', enhancedFilters(), outputs);
    }
    if (rec.processingRecommendation === 'crop bottom margin') {
      writeVariant(rec, 'cleaned', bottomCleanFilters(), outputs);
      writeVariant(rec, 'cleaned-enhanced', bottomCleanFilters(), outputs);
    }
    if (rec.processingRecommendation === 'auto-clean') {
      writeVariant(rec, 'corner-cleaned', cornerCleanFilters(), outputs);
      writeVariant(rec, 'enhanced', enhancedFilters(), outputs);
    }
    if (rec.processingRecommendation === 'watermark reduction attempt') {
      writeVariant(rec, 'watermark-reduced', diagonalReductionFilters('mild'), outputs);
      writeVariant(rec, 'watermark-reduced-strong', diagonalReductionFilters('strong'), outputs);
      writeVariant(rec, 'enhanced', enhancedFilters(), outputs);
    }
  } catch (e) {
    outputs.errors.push(e.message);
  }
  return outputs;
}

function statusFor(rec, outputs) {
  if (rec.fileType === 'pdf') return 'deferred-pdf';
  if (outputs.errors.length) return 'error';
  if (args.dryRun) return 'planned';
  if (outputs.written.length || outputs.skipped.length) return 'processed';
  return 'not-selected';
}

function bestPath(outputs) {
  const preferred = ['cleaned-enhanced', 'watermark-reduced', 'corner-cleaned', 'enhanced', 'cleaned'];
  for (const suffix of preferred) {
    const found = [...outputs.written, ...outputs.skipped].find(o => o.suffix === suffix);
    if (found) return found.path;
  }
  return null;
}

function thumbPath(outputs) {
  const found = [...outputs.written, ...outputs.skipped].find(o => o.suffix === 'thumb');
  return found ? found.path : null;
}

function reviewNeeded(rec, outputs) {
  if (rec.fileType === 'pdf') return true;
  if (/diagonal|manual|needs better/i.test(rec.processingRecommendation)) return true;
  if (rec.watermarkType === 'corner logo') return true;
  if (outputs.errors.length) return true;
  return false;
}

function buildManifest(records, resultByPath) {
  const knownSuffixes = [
    'thumb',
    'enhanced',
    'cleaned',
    'cleaned-enhanced',
    'corner-cleaned',
    'watermark-reduced',
    'watermark-reduced-strong'
  ];
  const baseIds = records.map(rec => matchKeyFor(rec));
  const baseCounts = baseIds.reduce((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
  const seenIds = {};
  function uniqueIdFor(rec) {
    const base = matchKeyFor(rec);
    if (baseCounts[base] <= 1) return base;
    const withSource = `${base}-${safeBaseName(rec)}`;
    seenIds[withSource] = (seenIds[withSource] || 0) + 1;
    return seenIds[withSource] === 1 ? withSource : `${withSource}-${seenIds[withSource]}`;
  }

  return {
    generatedAt: new Date().toISOString(),
    processedRoot: '/public/plotmap-assets/processed/',
    entries: records.map((rec) => {
      const outputs = resultByPath.get(rec.relativePath) || { planned: [], written: [], skipped: [], errors: [] };
      const existing = knownSuffixes
        .map(suffix => ({ suffix, abs: targetFor(rec, suffix) }))
        .filter(o => fs.existsSync(o.abs))
        .map(o => ({ suffix: o.suffix, path: webPath(o.abs), bytes: fs.statSync(o.abs).size }));
      const byPath = new Map();
      for (const o of existing) byPath.set(o.path, o);
      for (const o of outputs.written) byPath.set(o.path, o);
      for (const o of outputs.skipped) byPath.set(o.path, o);
      const processedPaths = [...byPath.values()].map(o => o.path);
      const allOutputs = {
        planned: outputs.planned,
        written: [...outputs.written, ...existing],
        skipped: outputs.skipped,
        errors: outputs.errors
      };
      const status = rec.fileType === 'pdf'
        ? 'deferred-pdf'
        : outputs.errors.length
          ? 'error'
          : processedPaths.length
            ? 'processed'
            : args.dryRun && outputs.planned.length
            ? 'planned'
            : 'not-selected';
      const needsReview = reviewNeeded(rec, outputs);
      const usable = status === 'processed' && !needsReview && !!bestPath(allOutputs);
      return {
        id: uniqueIdFor(rec),
        matchKey: matchKeyFor(rec),
        mapType: mapTypeFor(rec),
        originalPath: '/' + rec.relativePath,
        processedPaths,
        plannedProcessedPaths: args.dryRun ? outputs.planned.map(o => o.path) : [],
        bestProcessedPath: bestPath(allOutputs),
        thumbnailPath: thumbPath(allOutputs),
        city: rec.city,
        area: rec.city,
        sectorOrBlockName: rec.sectorOrBlockName,
        fileType: rec.fileType,
        dimensions: rec.dimensions,
        megapixels: rec.megapixels,
        fileSizeBytes: rec.fileSizeBytes,
        watermarkType: rec.watermarkType,
        processingStatus: status,
        recommendation: rec.processingRecommendation,
        reviewNeeded: needsReview,
        usable,
        duplicateGroupId: rec.duplicateGroupId,
        recommendedKeep: rec.recommendedKeep,
        qualityClass: rec.qualityClass,
        notes: [...(rec.notes || []), ...outputs.errors.map(e => `Processing error: ${e}`)]
      };
    })
  };
}

function countsBy(items, fn) {
  const out = {};
  for (const item of items) {
    const key = fn(item) || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}

function table(rows, cols) {
  return [
    `| ${cols.map(c => c.label).join(' | ')} |`,
    `| ${cols.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${cols.map(c => String(c.value(r) ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)
  ].join('\n');
}

function sampleEntries(manifest, pred, n = 3) {
  return manifest.entries.filter(pred).slice(0, n);
}

function writeReview(audit, manifest, processedRecords) {
  const entries = manifest.entries;
  const processed = entries.filter(e => e.processingStatus === 'processed');
  const lines = [];
  lines.push('# PlotMap Map Processing Review');
  lines.push('');
  lines.push(`Generated: ${manifest.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(table([
    ['total maps scanned', audit.records.length],
    ['processed successfully', processed.length],
    ['manual review needed', entries.filter(e => e.reviewNeeded).length],
    ['deferred PDFs', entries.filter(e => e.processingStatus === 'deferred-pdf').length],
    ['duplicate/near duplicate files', entries.filter(e => e.duplicateGroupId).length],
    ['selected this run', processedRecords.length],
    ['dry run', args.dryRun ? 'yes' : 'no']
  ], [
    { label: 'Metric', value: r => r[0] },
    { label: 'Value', value: r => r[1] }
  ]));
  for (const [title, obj] of [
    ['Count by city/area', countsBy(entries, e => e.city)],
    ['Count by file type', countsBy(entries, e => e.fileType)],
    ['Count by watermark type', countsBy(entries, e => e.watermarkType)],
    ['Count by recommendation', countsBy(entries, e => e.recommendation)],
    ['Count by processing status', countsBy(entries, e => e.processingStatus)]
  ]) {
    lines.push('');
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(table(Object.entries(obj), [
      { label: 'Value', value: r => r[0] },
      { label: 'Count', value: r => r[1] }
    ]));
  }
  const sections = [
    ['Clean / ready maps', e => e.recommendation === 'ready'],
    ['Enhanced maps', e => e.processedPaths.some(p => p.includes('-enhanced.webp'))],
    ['Bottom-margin cleaned maps', e => e.processedPaths.some(p => p.includes('-cleaned'))],
    ['Diagonal watermark reduction attempts', e => e.processedPaths.some(p => p.includes('watermark-reduced'))],
    ['Manual-review-needed maps', e => e.reviewNeeded]
  ];
  for (const [title, pred] of sections) {
    const rows = sampleEntries(manifest, pred);
    lines.push('');
    lines.push(`## Sample: ${title}`);
    lines.push('');
    lines.push(rows.length ? table(rows, [
      { label: 'Original', value: e => e.originalPath },
      { label: 'Best processed', value: e => e.bestProcessedPath || '' },
      { label: 'Thumbnail', value: e => e.thumbnailPath || '' },
      { label: 'Recommendation', value: e => e.recommendation },
      { label: 'Review?', value: e => e.reviewNeeded ? 'yes' : 'no' }
    ]) : 'No matching samples in this run.');
  }
  lines.push('');
  lines.push('## Next Steps');
  lines.push('');
  lines.push('- Review processed samples under `public/plotmap-assets/processed/` before approving them for client use.');
  lines.push('- Run larger batches by city after checking sample quality, especially for diagonal tiled watermark maps.');
  lines.push('- Keep originals untouched; connect approved `bestProcessedPath` values to the Sector Maps hub later.');
  fs.writeFileSync(REVIEW_PATH, lines.join('\n') + '\n');
}

function main() {
  if (!fs.existsSync(AUDIT_PATH)) {
    console.error('Missing tools/map-asset-audit.json. Run: node tools/audit-map-assets.js --include-pdf');
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
  const eligible = audit.records.filter(shouldProcess);
  let selected = args.manifestOnly ? [] : sampleRecords(eligible);
  if (args.limit > 0) selected = selected.slice(0, args.limit);

  const resultByPath = new Map();
  for (const rec of selected) {
    const outputs = processOne(rec);
    resultByPath.set(rec.relativePath, outputs);
    const status = args.dryRun ? 'planned' : (outputs.errors.length ? 'error' : 'ok');
    console.log(`${status.padEnd(8)} ${rec.relativePath}`);
    for (const o of outputs.written) console.log(`  wrote ${o.path} (${Math.round(o.bytes / 1024)} KB)`);
    for (const o of outputs.skipped) console.log(`  skip  ${o.path} (${o.reason})`);
    for (const e of outputs.errors) console.log(`  ERROR ${e}`);
  }

  const manifest = buildManifest(audit.records, resultByPath);
  ensureDir(MANIFEST_PATH);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  writeReview(audit, manifest, selected);
  console.log('');
  console.log(`Selected ${selected.length} image(s).`);
  console.log(`Manifest: ${rel(MANIFEST_PATH)}`);
  console.log(`Review:   ${rel(REVIEW_PATH)}`);
  console.log(args.dryRun ? 'Dry run only; no processed images written.' : `Processed output root: ${rel(OUT_ROOT)}/`);
}

main();
