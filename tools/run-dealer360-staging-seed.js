#!/usr/bin/env node
/**
 * Applies the Dealer 360 staging seed with private Auth identities supplied
 * through the ignored local env file. No environment value is printed or
 * persisted in the repository; the generated SQL wrapper is always removed.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.dealer360-staging.local');
const LINK_FILE = path.join(ROOT, 'supabase', '.temp', 'project-ref');
const SEED_FILE = path.join(ROOT, 'supabase', 'staging', '20260719_dealer360_seed.sql');
const PRODUCTION_PROJECT_REF = 'czmkfmkmgqlienmdihul';

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    ...options
  });
}

function parseEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function redact(text, values) {
  let safe = String(text || '');
  for (const value of Object.values(values)) {
    if (value) safe = safe.split(value).join('[REDACTED]');
  }
  return safe;
}

function fail(message) {
  console.error(`STAGING SEED BLOCKED: ${message}`);
  process.exit(2);
}

const ignored = command('git', ['check-ignore', '-q', '--', '.env.dealer360-staging.local']);
const tracked = command('git', ['ls-files', '--error-unmatch', '--', '.env.dealer360-staging.local']);
if (ignored.status !== 0 || tracked.status === 0) fail('private env file is not safely ignored and untracked');
if (!fs.existsSync(ENV_FILE)) fail('private staging env file is missing');

const env = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
const required = [
  'SUPABASE_PROJECT_REF',
  'SUPABASE_STAGING_URL',
  'PLATFORM_ADMIN_USER_ID',
  'PLATFORM_ADMIN_EMAIL',
  'DEALER_A_USER_ID',
  'DEALER_A_EMAIL',
  'DEALER_B_USER_ID',
  'DEALER_B_EMAIL'
];
if (required.some(name => !env[name])) fail('required staging identity setting is missing');

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (![env.PLATFORM_ADMIN_USER_ID, env.DEALER_A_USER_ID, env.DEALER_B_USER_ID].every(value => uuidPattern.test(value))) {
  fail('a staging Auth user ID is not a valid UUID');
}

let stagingUrl;
try {
  stagingUrl = new URL(env.SUPABASE_STAGING_URL);
} catch (_) {
  fail('staging URL is invalid');
}
if (env.SUPABASE_PROJECT_REF === PRODUCTION_PROJECT_REF ||
    stagingUrl.protocol !== 'https:' ||
    stagingUrl.hostname !== `${env.SUPABASE_PROJECT_REF}.supabase.co`) {
  fail('staging URL/project ref safety check failed');
}
if (!fs.existsSync(LINK_FILE) || fs.readFileSync(LINK_FILE, 'utf8').trim() !== env.SUPABASE_PROJECT_REF) {
  fail('repository is not linked to the approved staging project');
}

const settings = [
  ['plotmap.staging_platform_admin_user_id', env.PLATFORM_ADMIN_USER_ID],
  ['plotmap.staging_dealer_a_user_id', env.DEALER_A_USER_ID],
  ['plotmap.staging_dealer_b_user_id', env.DEALER_B_USER_ID],
  ['plotmap.staging_platform_admin_email', env.PLATFORM_ADMIN_EMAIL],
  ['plotmap.staging_dealer_a_email', env.DEALER_A_EMAIL],
  ['plotmap.staging_dealer_b_email', env.DEALER_B_EMAIL]
];
const preamble = settings
  .map(([name, value]) => `select set_config('${name}', ${sqlLiteral(value)}, false);`)
  .join('\n');
const wrapperPath = path.join(os.tmpdir(), `plotmap-dealer360-seed-${process.pid}-${Date.now()}.sql`);

try {
  fs.writeFileSync(wrapperPath, `${preamble}\n${fs.readFileSync(SEED_FILE, 'utf8')}`, { encoding: 'utf8', mode: 0o600 });
  const started = Date.now();
  if (process.platform === 'win32' && !/^[A-Za-z0-9_:\\.\-~]+$/.test(wrapperPath)) {
    fail('temporary SQL path contains unsupported command characters');
  }
  const result = process.platform === 'win32'
    ? command(process.env.ComSpec || 'cmd.exe', [
      '/d', '/s', '/c',
      `npx --yes supabase@latest db query --linked --file ${wrapperPath}`
    ])
    : command('npx', ['--yes', 'supabase@latest', 'db', 'query', '--linked', '--file', wrapperPath]);
  const elapsed = Date.now() - started;
  if (result.status !== 0) {
    console.error(redact([result.stdout, result.stderr, result.error && result.error.message].filter(Boolean).join('\n'), env));
    fail(`seed SQL failed after ${elapsed}ms`);
  }
  console.log(`APPLIED staging seed duration_ms=${elapsed}`);
} finally {
  if (fs.existsSync(wrapperPath)) fs.unlinkSync(wrapperPath);
}

console.log('temporary_seed_wrapper_removed=true');
