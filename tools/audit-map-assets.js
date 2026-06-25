#!/usr/bin/env node
/**
 * PlotMap map asset audit pipeline.
 *
 * Non-destructive. Scans configured map source folders plus public PlotMap
 * assets, records image/PDF metadata, classifies likely watermark patterns,
 * flags duplicate candidates, and writes machine + human review reports.
 *
 * Usage:
 *   node tools/audit-map-assets.js
 *   node tools/audit-map-assets.js --city mohali --limit 20
 *   node tools/audit-map-assets.js --include-pdf
 *   node tools/audit-map-assets.js --json tools/audit.json --md tools/audit.md
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_JSON = path.join(ROOT, 'tools', 'map-asset-audit.json');
const DEFAULT_MD = path.join(ROOT, 'tools', 'map-asset-audit.md');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const PDF_EXTS = new Set(['.pdf']);

function parseArgs(argv) {
  const out = { includePdf: false, limit: 0, city: '', json: DEFAULT_JSON, md: DEFAULT_MD };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--include-pdf') out.includePdf = true;
    else if (a === '--limit') out.limit = Number(argv[++i] || 0);
    else if (a === '--city') out.city = String(argv[++i] || '').toLowerCase();
    else if (a === '--json') out.json = path.resolve(ROOT, argv[++i] || DEFAULT_JSON);
    else if (a === '--md') out.md = path.resolve(ROOT, argv[++i] || DEFAULT_MD);
  }
  return out;
}

const args = parseArgs(process.argv);

function readConfigSources() {
  const cfgPath = path.join(ROOT, 'config', 'sources.json');
  if (!fs.existsSync(cfgPath)) return [];
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  return (cfg.sources || []).map(s => ({
    city: s.city || s.slug || s.folder,
    slug: s.slug || slugify(s.city || s.folder),
    folder: s.folder,
    expectedWatermark: s.watermark || 'unknown',
    qualityHint: s.quality || ''
  }));
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

function walk(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) found.push(...walk(abs));
    else if (ent.isFile()) found.push(abs);
  }
  return found;
}

function ffprobeDims(abs) {
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
  return { width: null, height: null };
}

function sha1Head(abs) {
  const fd = fs.openSync(abs, 'r');
  try {
    const stat = fs.statSync(abs);
    const len = Math.min(stat.size, 1024 * 256);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    return crypto.createHash('sha1').update(buf).digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function fullSha1(abs) {
  return crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
}

function inferCity(rel, sourceMap) {
  const lower = rel.toLowerCase().replace(/\\/g, '/');
  for (const s of sourceMap) {
    if (lower.startsWith(String(s.folder || '').toLowerCase() + '/')) return s.city;
  }
  if (lower.includes('mohali') || lower.includes('aerocity')) return 'Mohali';
  if (lower.includes('panch')) return 'Panchkula';
  if (lower.includes('new chandigarh')) return 'New Chandigarh';
  if (lower.includes('chandigarh')) return 'Chandigarh';
  if (lower.includes('zirakpur') || lower.includes('zirkpur')) return 'Zirakpur';
  return 'Unknown';
}

function inferSectorOrBlock(fileName) {
  const base = path.basename(fileName, path.extname(fileName))
    .replace(/[_-]+/g, ' ')
    .replace(/\bscctor\b/gi, 'sector')
    .replace(/\s+/g, ' ')
    .trim();
  const sector = /\bsector\s*(?:p\s*)?([0-9]+[a-z]?)\b/i.exec(base)
    || /\bsector\s*([0-9]+[a-z]?)\s*p\b/i.exec(base)
    || /^([0-9]+[a-z]?)$/i.exec(base);
  if (sector) return `Sector ${sector[1].toUpperCase()}`;
  const aeroBlock = /\baerocity\s+(?:block\s*)?([a-z])\b/i.exec(base);
  if (aeroBlock) return `Block ${aeroBlock[1].toUpperCase()}`;
  const block = /\bblock\s*[- ]?([a-z0-9]+)\b/i.exec(base);
  if (block) return `Block ${block[1].toUpperCase()}`;
  if (/aerocity/i.test(base)) return base;
  return base;
}

function qualityClass(mp, width, height, fileType) {
  if (fileType === 'pdf') return 'unknown';
  if (!mp) return 'unknown';
  if (mp >= 15 && Math.min(width, height) >= 2500) return 'excellent';
  if (mp >= 7) return 'good';
  if (mp >= 2) return 'usable';
  return 'low';
}

function readabilityRisk(q, mp, fileType) {
  if (fileType === 'pdf') return 'medium';
  if (q === 'excellent' || q === 'good') return 'low';
  if (q === 'usable') return 'medium';
  if (!mp) return 'unknown';
  return 'high';
}

function sourceHintFor(city, sourceMap) {
  return sourceMap.find(s => String(s.city).toLowerCase() === String(city).toLowerCase()) || {};
}

function classifyWatermark(rel, city, ext, width, height, sourceMap) {
  const lower = rel.toLowerCase().replace(/\\/g, '/');
  if (PDF_EXTS.has(ext)) return 'unknown';
  const hint = sourceHintFor(city, sourceMap).expectedWatermark || '';

  if (lower.includes('aerotropolis-original') || lower.includes('original-web')) return 'none';
  if (String(hint).includes('diagonal')) return 'diagonal tiled watermark';
  if (String(hint).includes('bottom') || lower.includes('panchulka/')) return 'bottom-margin credit';
  if (String(hint).includes('margin') || lower.includes('new chandigarh/')) return 'corner logo';
  if (width && height && width >= 5000 && height >= 3500 && lower.includes('panch')) return 'bottom-margin credit';
  return 'unknown';
}

function recommendationFor(rec) {
  if (rec.fileType === 'pdf') return 'defer PDF';
  if (rec.duplicateConfidence >= 0.98) return 'duplicate candidate';
  if (rec.qualityClass === 'low') return 'needs better source';
  if (rec.watermarkType === 'none') return rec.qualityClass === 'excellent' || rec.qualityClass === 'good' ? 'ready' : 'enhance';
  if (rec.watermarkType === 'bottom-margin credit') return 'crop bottom margin';
  if (rec.watermarkType === 'corner logo') return 'auto-clean';
  if (rec.watermarkType === 'diagonal tiled watermark') return 'watermark reduction attempt';
  return rec.qualityClass === 'good' || rec.qualityClass === 'excellent' ? 'manual review' : 'enhance';
}

function notesFor(rec) {
  const notes = [];
  if (rec.fileType === 'pdf') notes.push('PDF rasterization deferred unless Poppler/Ghostscript is added.');
  if (rec.qualityClass === 'excellent') notes.push('High-resolution map; enhancement should be mild.');
  if (rec.qualityClass === 'low') notes.push('Small source; plot labels may not survive processing.');
  if (rec.watermarkType === 'diagonal tiled watermark') notes.push('Use reduction variants only; review plot labels carefully.');
  if (rec.watermarkType === 'bottom-margin credit') notes.push('Likely safe to crop/mask only if credit is outside map content.');
  return notes;
}

function collectFiles(sourceMap) {
  const roots = [
    path.join(ROOT, 'public', 'plotmap-assets'),
    ...sourceMap.map(s => path.join(ROOT, s.folder)).filter(Boolean),
    path.join(ROOT, 'maps', 'enhanced')
  ];
  const seen = new Set();
  const files = [];
  for (const r of roots) {
    for (const abs of walk(r)) {
      const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
      if (rel.startsWith('public/plotmap-assets/processed/')) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);
      const ext = path.extname(abs).toLowerCase();
      if (!IMAGE_EXTS.has(ext) && !PDF_EXTS.has(ext)) continue;
      if (PDF_EXTS.has(ext) && !args.includePdf) continue;
      files.push(abs);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function audit() {
  const sourceMap = readConfigSources();
  let files = collectFiles(sourceMap);
  if (args.city) files = files.filter(abs => inferCity(path.relative(ROOT, abs), sourceMap).toLowerCase().includes(args.city));
  if (args.limit > 0) files = files.slice(0, args.limit);

  const records = files.map(abs => {
    const stat = fs.statSync(abs);
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const ext = path.extname(abs).toLowerCase();
    const fileType = PDF_EXTS.has(ext) ? 'pdf' : 'image';
    const dims = fileType === 'image' ? ffprobeDims(abs) : { width: null, height: null };
    const mp = dims.width && dims.height ? Number(((dims.width * dims.height) / 1e6).toFixed(2)) : null;
    const aspectRatio = dims.width && dims.height ? Number((dims.width / dims.height).toFixed(4)) : null;
    const city = inferCity(rel, sourceMap);
    const q = qualityClass(mp, dims.width, dims.height, fileType);
    const wm = classifyWatermark(rel, city, ext, dims.width, dims.height, sourceMap);
    const rec = {
      originalPath: abs,
      relativePath: rel,
      fileName: path.basename(abs),
      extension: ext.replace('.', ''),
      fileType,
      fileSizeBytes: stat.size,
      dimensions: dims.width ? { width: dims.width, height: dims.height } : null,
      megapixels: mp,
      aspectRatio,
      city,
      sectorOrBlockName: inferSectorOrBlock(path.basename(abs)),
      qualityClass: q,
      readabilityRisk: readabilityRisk(q, mp, fileType),
      watermarkType: wm,
      processingRecommendation: '',
      duplicateGroupId: null,
      duplicateConfidence: 0,
      duplicateReason: '',
      recommendedKeep: false,
      notes: [],
      contentHeadSha1: sha1Head(abs)
    };
    rec.processingRecommendation = recommendationFor(rec);
    rec.notes = notesFor(rec);
    return rec;
  });

  attachDuplicates(records);
  for (const rec of records) rec.processingRecommendation = recommendationFor(rec);
  return { generatedAt: new Date().toISOString(), root: ROOT, records, summary: summarize(records) };
}

function attachDuplicates(records) {
  const exactGroups = new Map();
  for (const r of records) {
    const key = `${r.fileSizeBytes}|${r.dimensions ? r.dimensions.width + 'x' + r.dimensions.height : 'pdf'}|${r.contentHeadSha1}`;
    if (!exactGroups.has(key)) exactGroups.set(key, []);
    exactGroups.get(key).push(r);
  }
  let groupNo = 1;
  for (const group of exactGroups.values()) {
    if (group.length < 2) continue;
    const hashes = group.map(r => ({ r, h: fullSha1(r.originalPath) }));
    const fullGroups = new Map();
    for (const x of hashes) {
      if (!fullGroups.has(x.h)) fullGroups.set(x.h, []);
      fullGroups.get(x.h).push(x.r);
    }
    for (const g of fullGroups.values()) {
      if (g.length < 2) continue;
      const id = `dup-${String(groupNo++).padStart(3, '0')}`;
      const keep = chooseKeep(g);
      for (const r of g) {
        r.duplicateGroupId = id;
        r.duplicateConfidence = 1;
        r.duplicateReason = 'Exact content hash, dimensions, and file size match.';
        r.recommendedKeep = r.relativePath === keep.relativePath;
      }
    }
  }

  const near = new Map();
  for (const r of records) {
    if (r.duplicateGroupId || !r.dimensions) continue;
    const norm = slugify(r.sectorOrBlockName).replace(/\bsector-\b/g, '');
    const key = `${r.city}|${norm}|${Math.round((r.megapixels || 0) * 10)}`;
    if (!near.has(key)) near.set(key, []);
    near.get(key).push(r);
  }
  for (const group of near.values()) {
    if (group.length < 2) continue;
    const id = `near-${String(groupNo++).padStart(3, '0')}`;
    const keep = chooseKeep(group);
    for (const r of group) {
      r.duplicateGroupId = id;
      r.duplicateConfidence = Math.max(r.duplicateConfidence, 0.72);
      r.duplicateReason = 'Similar city, inferred name, and resolution; visually review before deleting.';
      r.recommendedKeep = r.relativePath === keep.relativePath;
    }
  }
}

function chooseKeep(group) {
  return [...group].sort((a, b) => {
    const mp = (b.megapixels || 0) - (a.megapixels || 0);
    if (mp) return mp;
    const len = a.relativePath.length - b.relativePath.length;
    if (len) return len;
    return a.relativePath.localeCompare(b.relativePath);
  })[0];
}

function countsBy(records, key) {
  const out = {};
  for (const r of records) {
    const v = typeof key === 'function' ? key(r) : r[key];
    out[v || 'unknown'] = (out[v || 'unknown'] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}

function summarize(records) {
  const duplicateGroups = new Set(records.filter(r => r.duplicateGroupId).map(r => r.duplicateGroupId));
  return {
    totalFiles: records.length,
    byCity: countsBy(records, 'city'),
    byFileType: countsBy(records, 'fileType'),
    byQualityClass: countsBy(records, 'qualityClass'),
    byWatermarkType: countsBy(records, 'watermarkType'),
    byRecommendation: countsBy(records, 'processingRecommendation'),
    duplicateCandidateFiles: records.filter(r => r.duplicateGroupId).length,
    duplicateGroups: duplicateGroups.size,
    pdfDeferred: records.filter(r => r.fileType === 'pdf').length
  };
}

function mdTable(rows, cols) {
  const header = `| ${cols.map(c => c.label).join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${cols.map(c => String(c.value(r) ?? '').replace(/\|/g, '\\|')).join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

function writeMarkdown(auditResult, mdPath) {
  const { records, summary } = auditResult;
  const topDupes = records.filter(r => r.duplicateGroupId).slice(0, 40);
  const manual = records.filter(r => /manual|diagonal|needs better|defer/i.test(r.processingRecommendation)).slice(0, 40);
  const lines = [];
  lines.push('# PlotMap Map Asset Audit');
  lines.push('');
  lines.push(`Generated: ${auditResult.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(mdTable(Object.entries(summary).filter(([, v]) => typeof v !== 'object'), [
    { label: 'Metric', value: r => r[0] },
    { label: 'Value', value: r => r[1] }
  ]));
  for (const section of [
    ['By city/area', summary.byCity],
    ['By file type', summary.byFileType],
    ['By quality class', summary.byQualityClass],
    ['By watermark type', summary.byWatermarkType],
    ['By recommendation', summary.byRecommendation]
  ]) {
    lines.push('');
    lines.push(`## ${section[0]}`);
    lines.push('');
    lines.push(mdTable(Object.entries(section[1]), [
      { label: 'Value', value: r => r[0] },
      { label: 'Count', value: r => r[1] }
    ]));
  }
  lines.push('');
  lines.push('## Duplicate Candidates');
  lines.push('');
  lines.push(topDupes.length ? mdTable(topDupes, [
    { label: 'Group', value: r => r.duplicateGroupId },
    { label: 'Keep?', value: r => r.recommendedKeep ? 'yes' : '' },
    { label: 'Confidence', value: r => r.duplicateConfidence },
    { label: 'Path', value: r => r.relativePath },
    { label: 'Reason', value: r => r.duplicateReason }
  ]) : 'No duplicate candidates found.');
  lines.push('');
  lines.push('## Manual Review / Hard Cases');
  lines.push('');
  lines.push(manual.length ? mdTable(manual, [
    { label: 'Path', value: r => r.relativePath },
    { label: 'City', value: r => r.city },
    { label: 'Watermark', value: r => r.watermarkType },
    { label: 'Quality', value: r => r.qualityClass },
    { label: 'Recommendation', value: r => r.processingRecommendation },
    { label: 'Notes', value: r => r.notes.join('; ') }
  ]) : 'No manual-review candidates found.');
  fs.writeFileSync(mdPath, lines.join('\n') + '\n');
}

function main() {
  const result = audit();
  fs.mkdirSync(path.dirname(args.json), { recursive: true });
  fs.mkdirSync(path.dirname(args.md), { recursive: true });
  fs.writeFileSync(args.json, JSON.stringify(result, null, 2));
  writeMarkdown(result, args.md);
  console.log(`Scanned ${result.summary.totalFiles} files.`);
  console.log(`JSON: ${path.relative(ROOT, args.json).replace(/\\/g, '/')}`);
  console.log(`MD:   ${path.relative(ROOT, args.md).replace(/\\/g, '/')}`);
  console.log(`Watermarks: ${JSON.stringify(result.summary.byWatermarkType)}`);
  console.log(`Recommendations: ${JSON.stringify(result.summary.byRecommendation)}`);
}

main();
