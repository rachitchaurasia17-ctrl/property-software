#!/usr/bin/env node
/** Generate the browser-safe public runtime config used by static deployments. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const outputFlag = process.argv.indexOf('--output');
const OUTPUT = outputFlag >= 0 && process.argv[outputFlag + 1]
  ? path.resolve(process.argv[outputFlag + 1])
  : path.join(ROOT, 'config', 'runtime-env.js');

// Deliberately read only these two public build variables.
const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
const supabaseKey = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim();

function removeOutput() {
  try { fs.unlinkSync(OUTPUT); } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }
}

function fail(message) {
  removeOutput();
  console.error(`Runtime environment generation failed: ${message}`);
  process.exit(1);
}

function jwtRole(key) {
  if (key.split('.').length !== 3) return '';
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role || '';
  } catch (_) {
    return '';
  }
}

function isSafePublicKey(key) {
  return Boolean(key) &&
    !/sb_secret_|service[_-]?role/i.test(key) &&
    jwtRole(key) !== 'service_role';
}

function isSafeSupabaseUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  } catch (_) {
    return false;
  }
}

if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
  fail('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be provided together.');
}
if (supabaseUrl && !isSafeSupabaseUrl(supabaseUrl)) {
  fail('VITE_SUPABASE_URL must be an HTTPS Supabase project URL.');
}
if (supabaseKey && !isSafePublicKey(supabaseKey)) {
  fail('VITE_SUPABASE_ANON_KEY must be a public publishable/anon key.');
}

const publicValues = supabaseUrl
  ? { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_ANON_KEY: supabaseKey }
  : {};
const body = [
  '// Generated at deploy time. Contains public browser configuration only.',
  '(function (global) {',
  `  global.env = Object.assign({}, global.env || {}, ${JSON.stringify(publicValues)});`,
  '})(window);',
  ''
].join('\n');

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, body, { encoding: 'utf8', mode: 0o644 });
console.log(`Runtime environment generated (${supabaseUrl ? 'configured' : 'fallback'} mode).`);
