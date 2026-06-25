#!/usr/bin/env node
/**
 * PlotMap processed map verification pass.
 *
 * Validates app/plotmap/map-assets.manifest.json against files on disk,
 * verifies that referenced images are readable, applies conservative quality
 * heuristics, updates manifest safety flags, and creates an HTML review gallery.
 *
 * This script is non-destructive: it does not edit originals or processed images.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'app', 'plotmap', 'map-assets.manifest.json');
const GROUPED_PATH = path.join(ROOT, 'app', 'plotmap', 'map-assets.grouped.json');
const PDF_RESULTS_PATH = path.join(ROOT, 'tools', 'pdf-conversion-results.json');
const REVIEW_MD = path.join(ROOT, 'tools', 'map-processing-review.md');
const GALLERY_PATH = path.join(ROOT, 'tools', 'map-review-gallery.html');

function toAbs(p) {
  if (!p) return null;
  return path.join(ROOT, String(p).replace(/^\/+/, ''));
}

function relWeb(abs) {
  return '/' + path.relative(ROOT, abs).replace(/\\/g, '/');
}

function htmlRel(webPath) {
  if (!webPath) return '';
  return '../' + String(webPath).replace(/^\/+/, '');
}

function existsNonZero(webPath) {
  const abs = toAbs(webPath);
  if (!abs || !fs.existsSync(abs)) return { ok: false, reason: 'missing file' };
  const size = fs.statSync(abs).size;
  if (size <= 0) return { ok: false, reason: 'zero-byte file' };
  return { ok: true, abs, size };
}

function dimsOf(abs) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      abs
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const [width, height] = out.split(',').map(Number);
    if (width > 0 && height > 0) return { width, height };
  } catch {}
  return null;
}

function imageStats(abs) {
  try {
    const buf = execFileSync('ffmpeg', [
      '-v', 'error',
      '-i', abs,
      '-vf', 'scale=48:48:force_original_aspect_ratio=decrease,pad=48:48:(ow-iw)/2:(oh-ih)/2:black,format=gray',
      '-f', 'rawvideo',
      '-'
    ], { encoding: 'buffer', maxBuffer: 1024 * 1024 });
    let sum = 0;
    for (const b of buf) sum += b;
    const mean = sum / buf.length;
    let variance = 0;
    for (const b of buf) variance += (b - mean) ** 2;
    const stddev = Math.sqrt(variance / buf.length);
    return { mean: Number(mean.toFixed(2)), stddev: Number(stddev.toFixed(2)) };
  } catch {
    return null;
  }
}

function verifyImagePath(webPath, role, expectedKind, opts = {}) {
  const withStats = opts.withStats !== false;
  const check = existsNonZero(webPath);
  if (!check.ok) return { ok: false, role, webPath, notes: [`${role}: ${check.reason}`] };
  const dims = dimsOf(check.abs);
  if (!dims) return { ok: false, role, webPath, notes: [`${role}: not a readable image`] };
  const stats = withStats ? imageStats(check.abs) : null;
  const notes = [];
  const mp = (dims.width * dims.height) / 1e6;
  if (expectedKind === 'thumbnail') {
    if (Math.max(dims.width, dims.height) > 900) notes.push(`${role}: thumbnail larger than expected (${dims.width}x${dims.height})`);
    if (Math.max(dims.width, dims.height) < 180) notes.push(`${role}: thumbnail too small (${dims.width}x${dims.height})`);
  } else if (expectedKind === 'best') {
    if (mp < 0.5) notes.push(`${role}: processed map resolution is low (${dims.width}x${dims.height})`);
  }
  if (check.size < 8 * 1024) notes.push(`${role}: suspiciously tiny file (${check.size} bytes)`);
  if (stats) {
    if (stats.stddev < 4) notes.push(`${role}: near-blank/low-variance image`);
    if (stats.mean < 12) notes.push(`${role}: extremely dark image`);
    if (stats.mean > 245) notes.push(`${role}: extremely bright image`);
  } else if (withStats) {
    notes.push(`${role}: could not compute image stats`);
  }
  return { ok: notes.length === 0, role, webPath, abs: check.abs, size: check.size, dims, stats, notes };
}

function aspectRatio(d) {
  return d && d.width && d.height ? d.width / d.height : null;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function verifyEntry(entry) {
  const notes = [];
  const qualityNotes = [];
  const original = existsNonZero(entry.originalPath);
  let originalDims = null;
  if (!original.ok) {
    notes.push(`originalPath: ${original.reason}`);
  } else if (entry.fileType !== 'pdf') {
    originalDims = dimsOf(original.abs);
    if (!originalDims) notes.push('originalPath: not a readable image');
  }

  const verifiedProcessed = [];
  for (const p of entry.processedPaths || []) {
    const v = verifyImagePath(p, 'processedPath', 'processed', { withStats: false });
    if (v.ok || v.dims) verifiedProcessed.push(p);
    if (!v.ok) qualityNotes.push(...v.notes.map(n => `${p}: ${n}`));
  }
  entry.processedPaths = unique(verifiedProcessed);

  if (entry.thumbnailPath) {
    const v = verifyImagePath(entry.thumbnailPath, 'thumbnailPath', 'thumbnail', { withStats: false });
    if (!v.dims) {
      notes.push(...v.notes);
      entry.thumbnailPath = null;
    } else {
      qualityNotes.push(...v.notes);
    }
  }

  let bestDims = null;
  if (entry.bestProcessedPath) {
    const v = verifyImagePath(entry.bestProcessedPath, 'bestProcessedPath', 'best');
    if (!v.dims) {
      notes.push(...v.notes);
      entry.bestProcessedPath = null;
    } else {
      bestDims = v.dims;
      qualityNotes.push(...v.notes);
    }
  }

  if (originalDims && bestDims) {
    const origAr = aspectRatio(originalDims);
    const bestAr = aspectRatio(bestDims);
    const diff = Math.abs(origAr - bestAr) / origAr;
    if (entry.watermarkType === 'bottom-margin credit') {
      if (diff > 0.11) qualityNotes.push(`aspect ratio changed after bottom cleanup (${origAr.toFixed(3)} -> ${bestAr.toFixed(3)})`);
    } else if (diff > 0.08) {
      qualityNotes.push(`processed aspect ratio changed (${origAr.toFixed(3)} -> ${bestAr.toFixed(3)})`);
    }
  }

  if (entry.watermarkType === 'diagonal tiled watermark') {
    qualityNotes.push('diagonal tiled watermark remains a human-review class even when thumbnails exist');
  }
  if (entry.watermarkType === 'corner logo') {
    qualityNotes.push('corner-logo cleanup requires human visual review');
  }
  if (entry.fileType === 'pdf' && !entry.pdfConverted) {
    qualityNotes.push('PDF deferred; no raster output verified');
  }

  const hadUsable = !!entry.usable;
  const hasBrokenClientPath = notes.length > 0;
  const hasRiskyBest = qualityNotes.some(n => /near-blank|extremely|too aggressive|resolution is low|not a readable|missing|zero-byte/i.test(n));
  const isProcessed = entry.processingStatus === 'processed';
  const hasBest = !!entry.bestProcessedPath;
  const duplicateNonKeep = !!entry.duplicateGroupId && entry.recommendedKeep === false;
  const watermarkReview = entry.watermarkType === 'diagonal tiled watermark' || entry.watermarkType === 'corner logo';
  const recommendationReview = /manual|needs better source|defer PDF/i.test(entry.recommendation || '');
  const baseReview = watermarkReview || recommendationReview || (entry.fileType === 'pdf' && !entry.pdfConverted);
  entry.qualityNotes = unique([...(entry.qualityNotes || []), ...qualityNotes]);
  entry.notes = unique([...(entry.notes || []), ...notes]);
  entry.reviewNeeded = baseReview || hasBrokenClientPath || hasRiskyBest;
  if (duplicateNonKeep) entry.reviewNeeded = true;
  entry.usable = isProcessed && hasBest && !entry.reviewNeeded && !duplicateNonKeep;
  entry.verification = {
    verifiedAt: new Date().toISOString(),
    originalExists: original.ok,
    thumbnailExists: !!entry.thumbnailPath,
    bestProcessedExists: !!entry.bestProcessedPath,
    processedPathCount: entry.processedPaths.length,
    movedToReview: hadUsable && !entry.usable,
    brokenPath: hasBrokenClientPath
  };
  return entry.verification;
}

function loadPdfConversions() {
  if (!fs.existsSync(PDF_RESULTS_PATH)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(PDF_RESULTS_PATH, 'utf8'));
    const map = new Map();
    for (const e of data.entries || []) {
      const key = `${e.originalPath}|${e.page || 1}`;
      map.set(key, e);
    }
    return map;
  } catch {
    return new Map();
  }
}

function applyPdfConversion(entry, conversions) {
  if (entry.fileType !== 'pdf') return;
  const conv = conversions.get(`${entry.originalPath}|1`);
  entry.conversionNeeded = true;
  entry.pdfConverted = false;
  entry.conversionStatus = conv ? conv.conversionStatus : 'manual-needed';
  if (!conv || conv.conversionStatus !== 'converted') return;
  entry.convertedImagePath = conv.convertedImagePath;
  entry.bestProcessedPath = conv.bestProcessedPath;
  entry.thumbnailPath = conv.thumbnailPath;
  entry.processedPaths = unique([...(entry.processedPaths || []), conv.convertedImagePath, conv.bestProcessedPath, conv.thumbnailPath]);
  entry.convertedFileType = 'image';
  entry.pdfConverted = true;
  entry.conversionNeeded = false;
  entry.conversionStatus = 'converted';
  entry.processingStatus = 'processed';
  entry.mapType = conv.mapType || entry.mapType || 'map';
  entry.displayName = conv.displayName || entry.displayName;
  entry.matchKey = conv.matchKey || entry.matchKey;
  entry.sectorOrBlockName = conv.sectorOrBlockName || entry.sectorOrBlockName;
  entry.dimensions = conv.dimensions || entry.dimensions;
  entry.notes = unique([...(entry.notes || []), ...(conv.notes || [])]);
}

function classifyLaunchTier(entry) {
  const duplicateNonKeep = !!entry.duplicateGroupId && entry.recommendedKeep === false;
  const broken = entry.verification && entry.verification.brokenPath;
  if (entry.fileType === 'pdf' && !entry.pdfConverted) return 'deferred-pdf';
  if (entry.conversionStatus === 'failed' || entry.conversionStatus === 'tool-unavailable') return 'deferred-pdf';
  if (broken || duplicateNonKeep || /needs better source/i.test(entry.recommendation || '')) return 'internal-review';
  if (entry.processingStatus !== 'processed' || !entry.bestProcessedPath) return 'internal-review';
  if (entry.reviewNeeded) return 'proof-usable';
  return 'client-ready';
}

function applyLaunchFlags(entry) {
  entry.launchTier = classifyLaunchTier(entry);
  entry.needsHumanReview = entry.launchTier === 'proof-usable' || entry.launchTier === 'internal-review';
  entry.showInClientDefault = entry.launchTier === 'client-ready';
  entry.showInExpandedLibrary = entry.launchTier === 'client-ready' || entry.launchTier === 'proof-usable';
  if (entry.launchTier === 'deferred-pdf' || entry.launchTier === 'internal-review') {
    entry.showInClientDefault = false;
    entry.showInExpandedLibrary = false;
  }
  if (entry.duplicateGroupId) {
    entry.duplicateDisplayStatus = entry.recommendedKeep === false ? 'hidden-duplicate' : 'keep';
  } else {
    entry.duplicateDisplayStatus = 'unique';
  }
  if (entry.duplicateDisplayStatus === 'hidden-duplicate') {
    entry.showInClientDefault = false;
    entry.showInExpandedLibrary = false;
  }
}

function writeGroupedManifest(entries) {
  const grouped = {
    generatedAt: new Date().toISOString(),
    source: '/app/plotmap/map-assets.manifest.json',
    cities: {}
  };
  for (const e of entries) {
    if (!grouped.cities[e.city || 'Unknown']) grouped.cities[e.city || 'Unknown'] = {};
    const city = grouped.cities[e.city || 'Unknown'];
    const type = e.mapType || 'map';
    if (!city[type]) city[type] = [];
    city[type].push({
      id: e.id,
      matchKey: e.matchKey,
      displayName: e.displayName || e.sectorOrBlockName,
      sectorOrBlockName: e.sectorOrBlockName,
      sectorNumber: e.sectorNumber || null,
      blockName: e.blockName || null,
      launchTier: e.launchTier,
      showInClientDefault: e.showInClientDefault,
      showInExpandedLibrary: e.showInExpandedLibrary,
      thumbnailPath: e.thumbnailPath,
      bestProcessedPath: e.bestProcessedPath,
      originalPath: e.originalPath,
      mapType: e.mapType,
      fileType: e.fileType,
      pdfConverted: !!e.pdfConverted,
      reviewNeeded: !!e.reviewNeeded,
      duplicateGroupId: e.duplicateGroupId,
      duplicateDisplayStatus: e.duplicateDisplayStatus
    });
  }
  for (const city of Object.values(grouped.cities)) {
    for (const list of Object.values(city)) {
      list.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), undefined, { numeric: true }));
    }
  }
  fs.writeFileSync(GROUPED_PATH, JSON.stringify(grouped, null, 2));
}

function countsBy(entries, fn) {
  const out = {};
  for (const e of entries) {
    const k = fn(e) || 'unknown';
    out[k] = (out[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function table(rows, cols) {
  return [
    `| ${cols.map(c => c.label).join(' | ')} |`,
    `| ${cols.map(() => '---').join(' | ')} |`,
    ...rows.map(r => `| ${cols.map(c => String(c.value(r) ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)
  ].join('\n');
}

function updateReviewMd(manifest, summary) {
  const existing = fs.existsSync(REVIEW_MD) ? fs.readFileSync(REVIEW_MD, 'utf8') : '# PlotMap Map Processing Review\n';
  const marker = '\n## Verification Result\n';
  const base = existing.includes(marker) ? existing.slice(0, existing.indexOf(marker)) : existing.trimEnd() + '\n';
  const lines = [];
  lines.push(marker.trim());
  lines.push('');
  lines.push(`Generated: ${manifest.verifiedAt}`);
  lines.push('');
  lines.push(table([
    ['manifest entries verified', summary.total],
    ['thumbnail paths existing', summary.thumbnailPaths],
    ['bestProcessedPath existing', summary.bestPaths],
    ['client-usable maps after verification', summary.usable],
    ['entries moved to reviewNeeded', summary.movedToReview],
    ['broken paths found', summary.brokenPaths],
    ['duplicate groups remaining', summary.duplicateGroups],
    ['deferred PDFs', summary.deferredPdf]
  ], [
    { label: 'Metric', value: r => r[0] },
    { label: 'Value', value: r => r[1] }
  ]));
  lines.push('');
  lines.push('## Launch Tier Classification');
  lines.push('');
  lines.push(table(Object.entries(summary.byLaunchTier || {}), [
    { label: 'Launch Tier', value: r => r[0] },
    { label: 'Count', value: r => r[1] }
  ]));
  lines.push('');
  lines.push(table([
    ['default client library count', summary.showDefault],
    ['expanded library count', summary.showExpanded],
    ['client-ready', (summary.byLaunchTier || {})['client-ready'] || 0],
    ['proof-usable', (summary.byLaunchTier || {})['proof-usable'] || 0],
    ['internal-review', (summary.byLaunchTier || {})['internal-review'] || 0],
    ['deferred-pdf', (summary.byLaunchTier || {})['deferred-pdf'] || 0]
  ], [
    { label: 'Metric', value: r => r[0] },
    { label: 'Value', value: r => r[1] }
  ]));
  lines.push('');
  lines.push('## PDF Conversion Results');
  lines.push('');
  lines.push(table([
    ['total PDFs found', summary.pdfTotal],
    ['PDFs converted successfully', summary.pdfConverted],
    ['PDF conversion failed', summary.pdfFailed],
    ['PDFs still deferred', summary.pdfDeferred],
    ['converted PDF proof-usable/client-ready', summary.pdfLaunchable],
    ['output folder', '/public/plotmap-assets/processed/pdf-converted/']
  ], [
    { label: 'Metric', value: r => r[0] },
    { label: 'Value', value: r => r[1] }
  ]));
  lines.push('');
  lines.push('### Issue Status');
  lines.push('');
  lines.push(table([
    ['missing processed files', summary.brokenPaths ? 'improved but review needed' : 'fixed'],
    ['missing thumbnails', summary.missingThumbnails ? 'improved but review needed' : 'fixed for non-PDF processed entries'],
    ['dry-run paths', 'fixed: client-facing best/thumbnail paths only point to existing files'],
    ['bottom-margin watermark', 'improved: processed and usable when crop checks pass'],
    ['diagonal tiled watermark', 'improved but review needed: thumbnails exist, full reduction remains human-review'],
    ['corner logos', 'improved but review needed: cleanup variants exist, visual review required'],
    ['duplicates', 'improved: duplicateGroupId/recommendedKeep/matchKey available for filtering'],
    ['deferred PDFs', summary.pdfConverted ? 'improved: converted PDFs included where ffmpeg succeeded' : 'deferred'],
    ['low-resolution maps', 'not fixed: marked review-needed/needs better source where applicable'],
    ['broken/corrupt image files', summary.unreadableImages ? 'improved but review needed' : 'fixed: no unreadable committed client paths']
  ], [
    { label: 'Issue Type', value: r => r[0] },
    { label: 'Status', value: r => r[1] }
  ]));
  fs.writeFileSync(REVIEW_MD, base + '\n' + lines.join('\n') + '\n');
}

function card(entry) {
  const imgA = htmlRel(entry.originalPath);
  const imgB = htmlRel(entry.bestProcessedPath || entry.thumbnailPath || entry.originalPath);
  const notes = [...(entry.qualityNotes || []), ...(entry.notes || [])].slice(0, 5);
  return `
  <article class="card ${entry.usable ? 'usable' : 'review'}">
    <div class="imgs">
      <figure><img loading="lazy" src="${imgA}" alt=""><figcaption>Original</figcaption></figure>
      <figure><img loading="lazy" src="${imgB}" alt=""><figcaption>${entry.bestProcessedPath ? 'Processed' : 'Thumbnail / Original'}</figcaption></figure>
    </div>
    <div class="meta">
      <h3>${esc(entry.sectorOrBlockName || entry.id)}</h3>
      <p><strong>${esc(entry.city || 'Unknown')}</strong> · ${esc(entry.mapType || 'map')} · ${esc(entry.matchKey || '')}</p>
      <p>Watermark: ${esc(entry.watermarkType)} · Recommendation: ${esc(entry.recommendation)}</p>
      <p>Usable: <b>${entry.usable}</b> · Review: <b>${entry.reviewNeeded}</b> · Status: ${esc(entry.processingStatus)}</p>
      <p class="path">Best: ${esc(entry.bestProcessedPath || '')}</p>
      <p class="path">Thumb: ${esc(entry.thumbnailPath || '')}</p>
      ${notes.length ? `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    </div>
  </article>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function section(title, entries) {
  return `<section><h2>${esc(title)} <span>${entries.length}</span></h2><div class="grid">${entries.map(card).join('\n')}</div></section>`;
}

function writeGallery(entries) {
  const dupEntries = entries.filter(e => e.duplicateGroupId).slice(0, 80);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PlotMap Map Review Gallery</title>
<style>
body{margin:0;background:#eee7d8;color:#231f18;font-family:Inter,Arial,sans-serif}
header{position:sticky;top:0;z-index:2;background:#173764;color:white;padding:18px 24px;box-shadow:0 8px 24px #0002}
h1{margin:0;font-size:24px} header p{margin:5px 0 0;color:#dbe8f5}
section{padding:22px 24px} h2{font-size:20px;margin:0 0 14px} h2 span{color:#8a7654}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px}
.card{background:#fffaf0;border:1px solid #dacdb4;border-radius:16px;overflow:hidden;box-shadow:0 8px 22px #38280d14}
.card.review{border-color:#d8b36a}.card.usable{border-color:#9cb987}
.imgs{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#ddd0b7}
figure{margin:0;background:#f5eddd;min-height:150px;display:flex;flex-direction:column}
img{width:100%;height:170px;object-fit:contain;background:#f4eddf}
figcaption{font-size:12px;font-weight:700;color:#7d735f;padding:7px 10px}
.meta{padding:13px 14px}.meta h3{margin:0 0 6px;font-size:18px}.meta p{margin:5px 0;font-size:13px;line-height:1.35;color:#5f584c}
.path{font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all;color:#6d654f}
ul{margin:8px 0 0;padding-left:18px;color:#8b5b18;font-size:12px}
</style>
</head>
<body>
<header><h1>PlotMap Map Review Gallery</h1><p>Human review helper. Client UI should use the manifest, not this page.</p></header>
${section('Client-usable maps', entries.filter(e => e.usable))}
${section('Review-needed maps', entries.filter(e => e.reviewNeeded).slice(0, 80))}
${section('Diagonal watermark reduction attempts', entries.filter(e => e.watermarkType === 'diagonal tiled watermark').slice(0, 80))}
${section('Bottom-margin cleaned maps', entries.filter(e => e.watermarkType === 'bottom-margin credit' && e.bestProcessedPath).slice(0, 80))}
${section('Duplicate groups', dupEntries)}
${section('Converted PDF maps', entries.filter(e => e.pdfConverted))}
${section('Failed PDF conversions', entries.filter(e => e.fileType === 'pdf' && e.conversionStatus === 'failed'))}
${section('Deferred PDFs', entries.filter(e => e.launchTier === 'deferred-pdf'))}
</body>
</html>`;
  fs.writeFileSync(GALLERY_PATH, html);
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('Missing app/plotmap/map-assets.manifest.json');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entries = manifest.entries || [];
  const conversions = loadPdfConversions();
  let movedToReview = 0;
  let brokenPaths = 0;
  let unreadableImages = 0;
  for (const entry of entries) {
    applyPdfConversion(entry, conversions);
    const before = !!entry.usable;
    const v = verifyEntry(entry);
    applyLaunchFlags(entry);
    if (before && entry.verification.movedToReview) movedToReview++;
    if (v.brokenPath) brokenPaths++;
    if ((entry.notes || []).some(n => /not a readable image/i.test(n))) unreadableImages++;
  }
  const duplicateGroups = new Set(entries.filter(e => e.duplicateGroupId).map(e => e.duplicateGroupId)).size;
  manifest.verifiedAt = new Date().toISOString();
  manifest.clientVisibilityRule = 'Default: showInClientDefault === true. Expanded: showInExpandedLibrary === true. Hide internal-review/deferred-pdf and hidden duplicates.';
  const summary = {
    total: entries.length,
    thumbnailPaths: entries.filter(e => e.thumbnailPath).length,
    bestPaths: entries.filter(e => e.bestProcessedPath).length,
    usable: entries.filter(e => e.usable).length,
    movedToReview,
    brokenPaths,
    duplicateGroups,
    deferredPdf: entries.filter(e => e.processingStatus === 'deferred-pdf').length,
    missingThumbnails: entries.filter(e => e.processingStatus === 'processed' && !e.thumbnailPath).length,
    unreadableImages,
    byLaunchTier: countsBy(entries, e => e.launchTier),
    byCity: countsBy(entries, e => e.city),
    byMapType: countsBy(entries, e => e.mapType),
    showDefault: entries.filter(e => e.showInClientDefault).length,
    showExpanded: entries.filter(e => e.showInExpandedLibrary).length,
    pdfTotal: entries.filter(e => e.fileType === 'pdf').length,
    pdfConverted: entries.filter(e => e.fileType === 'pdf' && e.pdfConverted).length,
    pdfFailed: entries.filter(e => e.fileType === 'pdf' && e.conversionStatus === 'failed').length,
    pdfDeferred: entries.filter(e => e.fileType === 'pdf' && e.launchTier === 'deferred-pdf').length,
    pdfLaunchable: entries.filter(e => e.fileType === 'pdf' && (e.launchTier === 'client-ready' || e.launchTier === 'proof-usable')).length
  };
  manifest.verificationSummary = summary;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  writeGroupedManifest(entries);
  updateReviewMd(manifest, summary);
  writeGallery(entries);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Gallery: ${path.relative(ROOT, GALLERY_PATH).replace(/\\/g, '/')}`);
}

main();
