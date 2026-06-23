#!/usr/bin/env node
/**
 * PlotMap — Phase 1: Map Enhancement Pipeline
 *
 * Reads source maps (immutable, never written), standardizes dimensions,
 * applies mild sharpening/contrast (NO denoise — preserves small plot text),
 * and writes lossless PNGs to maps/enhanced/.
 *
 * City-agnostic: driven entirely by config/sources.json. Defaults to the POC set.
 * Usage:
 *   node tools/enhance.js            # POC set
 *   node tools/enhance.js --all      # every source folder (when ready)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'sources.json'), 'utf8'));
const OUT = path.join(ROOT, 'maps', 'enhanced');
fs.mkdirSync(OUT, { recursive: true });

const { longEdge, enhance } = cfg.standardize;
const vf = [
  `scale=w='min(${longEdge},iw)':h='min(${longEdge},ih)':force_original_aspect_ratio=decrease`,
  `unsharp=${enhance.unsharp}`,
  `eq=contrast=${enhance.contrast}:saturation=${enhance.saturation}`
].join(',');

function dimsOf(file) {
  const out = execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0', file], { encoding: 'utf8' }).trim();
  const [w, h] = out.split(',').map(Number);
  return { w, h };
}

const maps = (process.argv.includes('--all'))
  ? [] /* TODO: enumerate per-source once names are normalized */
  : cfg.poc.maps;

if (!maps.length) { console.error('No maps selected (use POC set or implement --all).'); process.exit(1); }

console.log(`Phase 1 — enhancing ${maps.length} map(s) -> maps/enhanced/\n`);
const results = [];
for (const m of maps) {
  const src = path.join(ROOT, m.file);
  if (!fs.existsSync(src)) { console.error(`  MISSING: ${m.file}`); continue; }
  const dst = path.join(OUT, `${m.id}.png`);
  const before = dimsOf(src);
  execFileSync('ffmpeg', ['-y','-loglevel','error','-i', src, '-vf', vf, dst]);
  const after = dimsOf(dst);
  const bytes = fs.statSync(dst).size;
  results.push({ ...m, srcDims: before, dims: after, bytes });
  console.log(`  ✓ ${m.id}  ${before.w}x${before.h} -> ${after.w}x${after.h}  (${(bytes/1024/1024).toFixed(1)} MB)`);
}
fs.writeFileSync(path.join(OUT, '_enhanced.json'), JSON.stringify(results, null, 2));
console.log(`\nDone. ${results.length} enhanced. Manifest: maps/enhanced/_enhanced.json`);
