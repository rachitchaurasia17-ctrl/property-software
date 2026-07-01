#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EASY_DIR = path.join(ROOT, 'maps');
const ORIGINAL_DIR = path.join(ROOT, 'normal maps');
const OUT_FILE = path.join(ROOT, 'app', 'plotmap', 'map-registry.js');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MASTERPLAN_RE = /master\s*[-_ ]?\s*plan|masterplan/i;

function listImages(dir, folderName, sourceType) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase()))
    .map(entry => {
      const fullPath = path.join(dir, entry.name);
      const rawBase = path.basename(entry.name, path.extname(entry.name));
      return {
        sourceType,
        fileName: entry.name,
        rawBase,
        type: MASTERPLAN_RE.test(rawBase) ? 'masterplan' : 'sector',
        webSrc: '/' + encodeURI(`${folderName}/${entry.name}`),
        dimensions: readImageDimensions(fullPath)
      };
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { sensitivity: 'base' }));
}

function readImageDimensions(file) {
  try {
    const ext = path.extname(file).toLowerCase();
    const buf = fs.readFileSync(file);
    if (ext === '.png' && buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if ((ext === '.jpg' || ext === '.jpeg') && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset < buf.length) {
        if (buf[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buf[offset + 1];
        const length = buf.readUInt16BE(offset + 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          return { width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5) };
        }
        offset += 2 + length;
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}

function cleanForMatch(value, options = {}) {
  let s = String(value || '').toLowerCase();
  s = s.replace(/\.[a-z0-9]+$/i, '');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/\bnew\s+chd\b/g, 'new chandigarh');
  s = s.replace(/\bchd\b/g, 'chandigarh');
  s = s.replace(/\bzirkpur\b/g, 'zirakpur');
  s = s.replace(/\bpanchulka\b/g, 'panchkula');
  s = s.replace(/\bextenstion\b/g, 'extension');
  s = s.replace(/\b(?:secter|sctor)\b/g, 'sector');
  s = s.replace(/\b(?:mohalo|mohalli|mohli)\b/g, 'mohali');
  s = s.replace(/\becocity\b/g, 'eco city');
  s = s.replace(/\bindustrial\s+focal\s+point\b/g, 'industrial area');
  s = s.replace(/\blayout\s+plan\s+of\b/g, ' ');
  s = s.replace(/\bgamada\b/g, ' ');
  s = s.replace(/\bphase([0-9]+)\b/g, 'phase $1');
  s = s.replace(/([a-z])([0-9])/g, '$1 $2');
  s = s.replace(/([0-9])([a-z])/g, '$1 $2');
  s = s.replace(/master\s*[-_ ]?\s*plan/g, 'masterplan');
  s = s.replace(/\b(3d|easy|normal|original|proof|final|copy|web|thumbnail|thumb)\b/g, ' ');
  s = s.replace(/\b(map|maps)\b/g, ' ');
  if (options.stripArea) {
    s = s.replace(/\b(new chandigarh|chandigarh|mohali|zirakpur|panchkula|derabassi|kharar|mullanpur)\b/g, ' ');
  }
  s = s.replace(/\b(and|the|of)\b/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function sortedKey(key) {
  return key.split(' ').filter(Boolean).sort().join(' ');
}

function titleFromRaw(raw) {
  let s = String(raw || '').toLowerCase();
  s = s.replace(/\.[a-z0-9]+$/i, '');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/\bnew\s+chd\b/g, 'new chandigarh');
  s = s.replace(/\bchd\b/g, 'chandigarh');
  s = s.replace(/\bzirkpur\b/g, 'zirakpur');
  s = s.replace(/\bpanchulka\b/g, 'panchkula');
  s = s.replace(/\bextenstion\b/g, 'extension');
  s = s.replace(/\b(?:secter|sctor)\b/g, 'sector');
  s = s.replace(/\b(?:mohalo|mohalli|mohli)\b/g, 'mohali');
  s = s.replace(/\becocity\b/g, 'eco city');
  s = s.replace(/\blayout\s+plan\s+of\b/g, ' ');
  s = s.replace(/\bgamada\b/g, ' ');
  s = s.replace(/\bphase([0-9]+)\b/g, 'phase $1');
  s = s.replace(/([a-z])([0-9])/g, '$1 $2');
  s = s.replace(/([0-9])([a-z])/g, '$1 $2');
  s = s.replace(/master\s*[-_ ]?\s*plan/g, 'masterplan');
  s = s.replace(/\b(3d|easy|normal|original|proof|final|copy|web|thumbnail|thumb|map|maps)\b/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.split(' ').map(word => {
    if (word === 'it') return 'IT';
    if (word === 'and') return 'and';
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ').replace(/\bMasterplan\b/g, 'Masterplan');
}

function inferArea(parts) {
  const s = parts.filter(Boolean).join(' ').toLowerCase();
  if (/\baero\s*city\b|\baerocity\b/.test(s)) return 'Aerocity';
  if (/\bnew\s+chandigarh\b|\bmullanpur\b|\beco\s*city\b|\becocity\b/.test(s)) return 'New Chandigarh';
  if (/\bzirakpur\b|\bzirkpur\b/.test(s)) return 'Zirakpur';
  if (/\bderabassi\b/.test(s)) return 'Derabassi';
  if (/\bkharar\b/.test(s)) return 'Kharar';
  if (/\bpanchkula\b|\bpanchulka\b/.test(s)) return 'Panchkula';
  if (/\bchandigarh\b|\bchd\b/.test(s)) return 'Chandigarh';
  if (/\bmohali\b|\bmohalo\b|\bmohalli\b|\bmohli\b|\bgamada\b/.test(s)) return 'Mohali';
  return 'Other';
}

function slugify(value) {
  return cleanForMatch(value, { stripArea: false }).replace(/\s+/g, '-') || 'map';
}

function makeIndex(files, keyFn) {
  const index = new Map();
  files.forEach(file => {
    const key = keyFn(file);
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(file);
  });
  return index;
}

function takeUnique(index, key, used) {
  const candidates = (index.get(key) || []).filter(file => !used.has(file.fileName));
  return candidates.length === 1 ? candidates[0] : null;
}

function findOriginalFor(easy, indexes, usedOriginals) {
  const exactKey = cleanForMatch(easy.rawBase);
  const looseKey = cleanForMatch(easy.rawBase, { stripArea: true });
  const sortedLoose = sortedKey(looseKey);

  const exact = takeUnique(indexes.exact, exactKey, usedOriginals);
  if (exact) return exact;

  const loose = looseKey && looseKey !== 'masterplan'
    ? takeUnique(indexes.loose, looseKey, usedOriginals)
    : null;
  if (loose) return loose;

  const sorted = sortedLoose && sortedLoose !== 'masterplan'
    ? takeUnique(indexes.sortedLoose, sortedLoose, usedOriginals)
    : null;
  if (sorted) return sorted;

  const pool = indexes.all.filter(file => !usedOriginals.has(file.fileName));
  const contained = pool.filter(file => {
    const candidate = cleanForMatch(file.rawBase, { stripArea: true });
    return candidate.length >= 5 && looseKey.length >= 5 &&
      (candidate.includes(looseKey) || looseKey.includes(candidate));
  });
  return contained.length === 1 ? contained[0] : null;
}

function uniqueId(base, used) {
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function buildRegistry() {
  const easyFiles = listImages(EASY_DIR, 'maps', 'easy');
  const originalFiles = listImages(ORIGINAL_DIR, 'normal maps', 'original');
  const originalIndexes = {
    all: originalFiles,
    exact: makeIndex(originalFiles, file => cleanForMatch(file.rawBase)),
    loose: makeIndex(originalFiles, file => cleanForMatch(file.rawBase, { stripArea: true })),
    sortedLoose: makeIndex(originalFiles, file => sortedKey(cleanForMatch(file.rawBase, { stripArea: true })))
  };
  const usedOriginals = new Set();
  const usedIds = new Set();
  const maps = [];

  easyFiles.forEach(easy => {
    const original = findOriginalFor(easy, originalIndexes, usedOriginals);
    if (original) usedOriginals.add(original.fileName);
    maps.push(makeMapItem(easy, original, usedIds));
  });

  originalFiles
    .filter(original => !usedOriginals.has(original.fileName))
    .forEach(original => maps.push(makeMapItem(null, original, usedIds)));

  maps.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'masterplan' ? -1 : 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  const byId = Object.fromEntries(maps.map(map => [map.id, map]));
  const masterplans = maps.filter(map => map.type === 'masterplan').map(map => map.id);
  const sectors = maps.filter(map => map.type === 'sector').map(map => map.id);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceFolders: {
      easy: '/maps/',
      original: '/normal%20maps/'
    },
    maps,
    masterplans,
    sectors,
    byId
  };
}

function makeMapItem(easy, original, usedIds) {
  const source = easy || original;
  const rawParts = [easy && easy.rawBase, original && original.rawBase].filter(Boolean);
  const title = titleFromRaw(source.rawBase);
  const type = rawParts.some(part => MASTERPLAN_RE.test(part)) ? 'masterplan' : 'sector';
  const area = inferArea(rawParts);
  const id = uniqueId(`${type}-${slugify(title)}`, usedIds);
  const dimensions = (original && original.dimensions) || (easy && easy.dimensions) || null;
  const item = {
    id,
    title,
    type,
    area,
    easyMapSrc: easy ? easy.webSrc : null,
    originalMapSrc: original ? original.webSrc : null,
    hasEasyMap: !!easy,
    hasOriginalMap: !!original,
    overlays: [],
    status: 'active',
    overlayCount: 0,
    displayName: title,
    mapType: type,
    city: area,
    sectorOrBlockName: title,
    matchKey: cleanForMatch(source.rawBase, { stripArea: true }).replace(/\s+/g, '-'),
    asset: original ? original.webSrc : (easy ? easy.webSrc : null)
  };
  if (dimensions) item.dimensions = dimensions;
  if (easy && easy.dimensions) item.easyDimensions = easy.dimensions;
  if (original && original.dimensions) item.originalDimensions = original.dimensions;
  if (easy) item.easyFileName = easy.fileName;
  if (original) item.originalFileName = original.fileName;
  return item;
}

const registry = buildRegistry();
const output = `/* Generated by tools/generate-map-registry.js. Do not edit by hand. */\nwindow.PM_MAP_REGISTRY = ${JSON.stringify(registry, null, 2)};\n`;
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, output);
console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} with ${registry.maps.length} maps (${registry.masterplans.length} masterplans, ${registry.sectors.length} sectors).`);
