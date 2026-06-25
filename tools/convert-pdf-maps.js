#!/usr/bin/env node
/**
 * Convert PlotMap PDF maps into image derivatives using ffmpeg.
 *
 * Outputs are non-destructive and written under:
 *   public/plotmap-assets/processed/pdf-converted/
 *
 * Defaults to page 1 because most project PDFs are single-map PDFs. Use --all
 * to attempt all detected pages.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AUDIT_PATH = path.join(ROOT, 'tools', 'map-asset-audit.json');
const OUT_ROOT = path.join(ROOT, 'public', 'plotmap-assets', 'processed', 'pdf-converted');
const RESULTS_PATH = path.join(ROOT, 'tools', 'pdf-conversion-results.json');

function parseArgs(argv) {
  const out = { dryRun: false, all: false, limit: 0, city: '', pdf: '', page: 1, quality: 'high', force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--all') out.all = true;
    else if (a === '--force') out.force = true;
    else if (a === '--limit') out.limit = Number(argv[++i] || 0);
    else if (a === '--city') out.city = String(argv[++i] || '').toLowerCase();
    else if (a === '--pdf') out.pdf = String(argv[++i] || '');
    else if (a === '--page') out.page = Number(argv[++i] || 1);
    else if (a === '--quality') out.quality = String(argv[++i] || 'high');
  }
  return out;
}

const args = parseArgs(process.argv);

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'pdf-map';
}

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

function web(abs) {
  return '/' + rel(abs);
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function dimsOf(abs) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', abs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const [width, height] = out.split(',').map(Number);
    if (width > 0 && height > 0) return { width, height };
  } catch {}
  return null;
}

function selectPdfRecords() {
  if (!fs.existsSync(AUDIT_PATH)) {
    console.error('Missing tools/map-asset-audit.json. Run node tools/audit-map-assets.js --include-pdf first.');
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
  let records = audit.records.filter(r => r.fileType === 'pdf');
  if (args.city) records = records.filter(r => String(r.city || '').toLowerCase().includes(args.city));
  if (args.pdf) {
    const wanted = path.resolve(ROOT, args.pdf);
    records = records.filter(r => path.resolve(r.originalPath) === wanted || r.relativePath === args.pdf.replace(/\\/g, '/'));
  }
  if (args.limit > 0) records = records.slice(0, args.limit);
  return records;
}

function outputPaths(rec, page) {
  const city = slugify(rec.city || 'unknown');
  const base = `${slugify(path.basename(rec.fileName, path.extname(rec.fileName)))}-page-${page}`;
  const dir = path.join(OUT_ROOT, city);
  return {
    converted: path.join(dir, `${base}.webp`),
    enhanced: path.join(dir, `${base}-enhanced.webp`),
    thumb: path.join(dir, `${base}-thumb.webp`)
  };
}

function ffmpegConvert(rec, page, paths) {
  const scale = args.quality === 'high' ? "scale=w='min(3600,iw)':h='min(3600,ih)':force_original_aspect_ratio=decrease" : "scale=w='min(2200,iw)':h='min(2200,ih)':force_original_aspect_ratio=decrease";
  const select = `select=eq(n\\,${page - 1})`;
  ensureDir(paths.converted);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', rec.originalPath, '-vf', `${select},${scale}`, '-frames:v', '1', '-quality', '86', paths.converted], { stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', paths.converted, '-vf', 'unsharp=5:5:0.45:5:5:0,eq=contrast=1.035:saturation=1.01', '-quality', '84', paths.enhanced], { stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', paths.enhanced, '-vf', "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease", '-quality', '78', paths.thumb], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function extractLargestEmbeddedJpeg(pdfPath, outPath) {
  const buf = fs.readFileSync(pdfPath);
  const ranges = [];
  let start = -1;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && start < 0) start = i;
    if (buf[i] === 0xff && buf[i + 1] === 0xd9 && start >= 0) {
      const end = i + 2;
      const len = end - start;
      if (len > 50 * 1024) ranges.push({ start, end, len });
      start = -1;
    }
  }
  if (!ranges.length) throw new Error('No embedded JPEG stream found in PDF');
  ranges.sort((a, b) => b.len - a.len);
  ensureDir(outPath);
  fs.writeFileSync(outPath, buf.subarray(ranges[0].start, ranges[0].end));
  return ranges[0].len;
}

function convertViaEmbeddedJpeg(rec, paths) {
  const jpg = paths.converted.replace(/\.webp$/i, '-embedded.jpg');
  extractLargestEmbeddedJpeg(rec.originalPath, jpg);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', jpg, '-vf', "scale=w='min(3600,iw)':h='min(3600,ih)':force_original_aspect_ratio=decrease", '-quality', '86', paths.converted], { stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', paths.converted, '-vf', 'unsharp=5:5:0.45:5:5:0,eq=contrast=1.035:saturation=1.01', '-quality', '84', paths.enhanced], { stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', paths.enhanced, '-vf', "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease", '-quality', '78', paths.thumb], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function existingResults() {
  if (!fs.existsSync(RESULTS_PATH)) return { generatedAt: null, entries: [] };
  try { return JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8')); } catch { return { generatedAt: null, entries: [] }; }
}

function main() {
  const records = selectPdfRecords();
  const results = existingResults();
  const byKey = new Map((results.entries || []).map(e => [`${e.originalPath}|${e.page}`, e]));
  const written = [];
  for (const rec of records) {
    const pageCount = rec.pdfPageCount || 1;
    const pages = args.all ? Array.from({ length: pageCount }, (_, i) => i + 1) : [args.page || 1];
    for (const page of pages) {
      const paths = outputPaths(rec, page);
      const entry = {
        originalPath: '/' + rec.relativePath,
        relativePath: rec.relativePath,
        city: rec.city,
        area: rec.area || rec.city,
        fileName: rec.fileName,
        page,
        pdfPageCount: rec.pdfPageCount || null,
        displayName: `${rec.displayName || rec.sectorOrBlockName}${pageCount > 1 ? ` (Page ${page})` : ''}`,
        matchKey: `${rec.matchKey || slugify(rec.displayName || rec.fileName)}${pageCount > 1 ? `-page-${page}` : ''}`,
        mapType: rec.mapType === 'pdf' ? 'map' : rec.mapType,
        sectorOrBlockName: rec.sectorOrBlockName,
        conversionStatus: 'planned',
        pdfConverted: false,
        conversionNeeded: true,
        convertedImagePath: web(paths.converted),
        bestProcessedPath: web(paths.enhanced),
        thumbnailPath: web(paths.thumb),
        dimensions: null,
        notes: []
      };
      console.log(`${args.dryRun ? 'planned' : 'convert'} ${rec.relativePath} page ${page}`);
      if (!args.dryRun) {
        try {
          if (fs.existsSync(paths.enhanced) && fs.existsSync(paths.thumb) && !args.force) {
            entry.conversionStatus = 'converted';
            entry.pdfConverted = true;
          } else {
            try {
              ffmpegConvert(rec, page, paths);
            } catch (firstError) {
              if (page !== 1) throw firstError;
              convertViaEmbeddedJpeg(rec, paths);
              entry.notes.push('ffmpeg PDF render failed; used largest embedded JPEG stream fallback.');
            }
            entry.conversionStatus = 'converted';
            entry.pdfConverted = true;
          }
          entry.conversionNeeded = false;
          entry.dimensions = dimsOf(paths.enhanced);
          entry.notes.push('Converted from PDF with ffmpeg; visual review recommended before default client exposure.');
        } catch (e) {
          entry.conversionStatus = 'failed';
          entry.notes.push(`PDF conversion failed: ${e.message}`);
        }
      }
      byKey.set(`${entry.originalPath}|${page}`, entry);
      written.push(entry);
    }
  }
  results.generatedAt = new Date().toISOString();
  results.outputRoot = web(OUT_ROOT);
  results.entries = [...byKey.values()].sort((a, b) => `${a.city}-${a.displayName}`.localeCompare(`${b.city}-${b.displayName}`));
  if (!args.dryRun) {
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  }
  console.log(`PDFs selected: ${records.length}`);
  console.log(`Page entries ${args.dryRun ? 'planned' : 'updated'}: ${written.length}`);
  console.log(`Results: ${rel(RESULTS_PATH)}`);
}

main();
