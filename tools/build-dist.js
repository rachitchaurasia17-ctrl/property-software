#!/usr/bin/env node
/**
 * PlotMap static deployment build.
 *
 * Produces a clean `dist/` containing ONLY runtime-required files, then
 * generates `dist/config/runtime-env.js` from the two public build
 * variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) via
 * tools/generate-runtime-env.js, and finally secret-scans the output.
 *
 * Guarantees:
 *   - dist/ never contains .env files, secrets, SQL, docs, tools or
 *     design/dev intermediates (allowlist copy + explicit excludes + scan).
 *   - Exactly one of the two public variables present => the build FAILS
 *     (generate-runtime-env.js enforces the pair) and no stale
 *     runtime-env.js survives (dist is rebuilt from empty every run).
 *   - Both absent => runtime-env.js is generated in fallback mode ({}),
 *     and the browser-side config (config/supabase-config.js) resolves the
 *     production fallback pair — unchanged local/default behaviour.
 *   - Secret-shaped values are rejected by generate-runtime-env.js.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Runtime-required top-level entries (allowlist — nothing else is copied).
const INCLUDE = [
  'index.html',
  'app',
  'admin',
  'config',
  'maps',
  'normal maps',
  'public'
];

// Path fragments never allowed into dist even under an included root.
const EXCLUDE_PATTERNS = [
  /(^|[\\/])\.git([\\/]|$)/i,
  /(^|[\\/])node_modules([\\/]|$)/i,
  /(^|[\\/])\.env[^\\/]*$/i,
  /(^|[\\/])dist([\\/]|$)/i,
  /\.sql$/i,
  /\.md$/i,
  // dev-only image intermediates (never fetched by the app — verified by grep)
  /(^|[\\/])public[\\/]plotmap-assets[\\/]processed([\\/]|$)/i,
  /-annotated-reference\.png$/i,
  /aerotropolis-easy-map-reference\.png$/i,
  /(^|[\\/])public[\\/]plotmap-assets[\\/]aerotropolis-original\.png$/i,
  // never ship a stale committed runtime env; it is generated below
  /(^|[\\/])config[\\/]runtime-env\.js$/i
];

function excluded(rel) {
  return EXCLUDE_PATTERNS.some(re => re.test(rel));
}

function copyTree(srcAbs, destAbs, relBase) {
  const stat = fs.statSync(srcAbs);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(srcAbs)) {
      const rel = path.join(relBase, name);
      if (excluded(rel)) continue;
      copyTree(path.join(srcAbs, name), path.join(destAbs, name), rel);
    }
    return;
  }
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(srcAbs, destAbs);
}

function fail(message) {
  console.error(`build-dist failed: ${message}`);
  process.exit(1);
}

// 1. clean dist (only ever the repo-local dist directory)
if (!DIST.startsWith(ROOT)) fail('refusing to delete a dist outside the repository');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 2. allowlist copy
for (const entry of INCLUDE) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) {
    if (entry === 'index.html' || entry === 'app' || entry === 'admin' || entry === 'config') {
      fail(`required entry missing: ${entry}`);
    }
    console.warn(`build-dist: optional entry missing, skipped: ${entry}`);
    continue;
  }
  if (excluded(entry)) continue;
  copyTree(src, path.join(DIST, entry), entry);
}

// 3. generate the runtime env INTO dist (pair rules enforced inside;
//    a validation failure exits non-zero and fails the whole build)
execFileSync(process.execPath, [
  path.join(ROOT, 'tools', 'generate-runtime-env.js'),
  '--output', path.join(DIST, 'config', 'runtime-env.js')
], { stdio: 'inherit' });

if (!fs.existsSync(path.join(DIST, 'config', 'runtime-env.js'))) {
  fail('dist/config/runtime-env.js was not generated');
}

// 4. secret scan of the finished output — belt over braces.
const SECRET_PATTERNS = [
  { name: 'sb_secret key', re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'service-role marker', re: /service[_-]role["':\s]*["'][A-Za-z0-9._-]{20,}/i },
  { name: 'service-role JWT', re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\./ },
  { name: 'postgres connection string', re: /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];
const TEXT_EXT = new Set(['.js', '.html', '.css', '.json', '.svg', '.txt', '.map']);
const hits = [];
(function scan(dir) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) { scan(abs); continue; }
    if (/^\.env/i.test(name)) { hits.push({ file: abs, what: 'env file present' }); continue; }
    if (!TEXT_EXT.has(path.extname(name).toLowerCase())) continue;
    if (st.size > 5 * 1024 * 1024) continue;
    const body = fs.readFileSync(abs, 'utf8');
    for (const p of SECRET_PATTERNS) {
      if (p.re.test(body)) hits.push({ file: path.relative(DIST, abs), what: p.name });
    }
  }
})(DIST);
if (hits.length) {
  hits.forEach(h => console.error(`SECRET SCAN HIT: ${h.what} in ${h.file}`));
  fail('secret scan found disallowed content in dist');
}

const fileCount = (function count(dir) {
  let c = 0;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    c += fs.statSync(abs).isDirectory() ? count(abs) : 1;
  }
  return c;
})(DIST);
console.log(`build-dist complete: ${fileCount} files in dist/, secret scan clean.`);
