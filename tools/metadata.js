#!/usr/bin/env node
/**
 * PlotMap — Phase 3: Map Metadata System
 * Generates one metadata record per enhanced map into maps/metadata/.
 * Also writes an index.json the client/admin apps load.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'sources.json'), 'utf8'));
const enhanced = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'enhanced', '_enhanced.json'), 'utf8'));
const META = path.join(ROOT, 'maps', 'metadata');
fs.mkdirSync(META, { recursive: true });

const brandOf = {};
cfg.sources.forEach(s => { brandOf[s.city] = s.brand; });

const index = [];
for (const m of enhanced) {
  const rec = {
    id: m.id,
    city: m.city,
    sector: m.sector,
    image: `/maps/enhanced/${m.id}.png`,
    width: m.dims.w,
    height: m.dims.h,
    sourceBrand: brandOf[m.city] || 'unknown',
    status: 'processed',          // processed -> annotated -> live
    polygons: `/maps/polygons/${m.id}.json`,
    hasPolygons: fs.existsSync(path.join(ROOT, 'maps', 'polygons', `${m.id}.json`))
  };
  fs.writeFileSync(path.join(META, `${m.id}.json`), JSON.stringify(rec, null, 2));
  index.push(rec);
}
fs.writeFileSync(path.join(META, 'index.json'), JSON.stringify(index, null, 2));
console.log(`Phase 3 — wrote ${index.length} metadata records + index.json`);
index.forEach(r => console.log(`  ${r.id}  ${r.width}x${r.height}  status=${r.status}  polygons=${r.hasPolygons}`));
