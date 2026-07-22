#!/usr/bin/env node
/**
 * Controlled staging-only runner for the one-click provisioning migration.
 *
 * Usage:
 *   node tools/run-dealer-provisioning-staging-migration.js --dry-run
 *   node tools/run-dealer-provisioning-staging-migration.js --apply
 *
 * The dry run executes the complete migration inside a transaction and rolls
 * it back. Apply commits that same single migration. This tool never invokes
 * `supabase db push` and never prints private environment values.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.dealer360-staging.local');
const LINK_FILE = path.join(ROOT, 'supabase', '.temp', 'project-ref');
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '20260722_one_click_dealer_provisioning.sql');
const PRODUCTION_PROJECT_REF = 'czmkfmkmgqlienmdihul';
const mode = process.argv[2];

function command(name, args) {
  return spawnSync(name, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, shell: false });
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

function redact(text, values) {
  let safe = String(text || '');
  for (const value of Object.values(values)) {
    if (value) safe = safe.split(value).join('[REDACTED]');
  }
  return safe;
}

function fail(message) {
  console.error(`STAGING MIGRATION BLOCKED: ${message}`);
  process.exit(2);
}

if (!['--dry-run', '--apply'].includes(mode)) fail('choose --dry-run or --apply');
const ignored = command('git', ['check-ignore', '-q', '--', '.env.dealer360-staging.local']);
const tracked = command('git', ['ls-files', '--error-unmatch', '--', '.env.dealer360-staging.local']);
if (ignored.status !== 0 || tracked.status === 0) fail('private staging environment is not safely ignored and untracked');
if (!fs.existsSync(ENV_FILE) || !fs.existsSync(MIGRATION)) fail('staging environment or migration file is missing');

const env = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
if (!env.SUPABASE_PROJECT_REF || !env.SUPABASE_STAGING_URL || env.DEALER360_STAGING_CONFIRM !== 'staging-only') {
  fail('required staging confirmation is missing');
}
let stagingUrl;
try { stagingUrl = new URL(env.SUPABASE_STAGING_URL); } catch (_) { fail('staging URL is invalid'); }
if (env.SUPABASE_PROJECT_REF === PRODUCTION_PROJECT_REF
    || stagingUrl.hostname !== `${env.SUPABASE_PROJECT_REF}.supabase.co`) {
  fail('resolved project is not the approved non-production staging project');
}
if (!fs.existsSync(LINK_FILE) || fs.readFileSync(LINK_FILE, 'utf8').trim() !== env.SUPABASE_PROJECT_REF) {
  fail('repository is not linked to the approved staging project');
}

const preflight = `
do $plotmap_preflight$
begin
  if exists (
    select 1 from public.profiles
    where email is not null
    group by lower(email)
    having count(*) > 1
  ) then
    raise exception 'PLOTMAP_DUPLICATE_PROFILE_EMAIL_PREFLIGHT';
  end if;
  if exists (
    select 1 from public.dealer_activation_requests
    where status = 'pending' and dealer_id is null
  ) then
    raise exception 'PLOTMAP_LEGACY_PENDING_ACTIVATION_PREFLIGHT';
  end if;
  if exists (
    select 1 from public.dealer_access_codes
    where dealer_id is null
      and status = 'active'
      and (expires_at is null or expires_at > timezone('utc'::text, now()))
  ) then
    raise exception 'PLOTMAP_LEGACY_ACTIVE_CODE_PREFLIGHT';
  end if;
  if not exists (select 1 from public.platform_admins where status = 'active') then
    raise exception 'PLOTMAP_ACTIVE_PLATFORM_ADMIN_PREFLIGHT';
  end if;
end;
$plotmap_preflight$;
`;

const transactionEnd = mode === '--dry-run' ? 'rollback;' : 'commit;';
const wrapper = `begin;\n${preflight}\n${fs.readFileSync(MIGRATION, 'utf8')}\n${transactionEnd}\n`;
const wrapperPath = path.join(os.tmpdir(), `plotmap-provisioning-${process.pid}-${Date.now()}.sql`);

try {
  fs.writeFileSync(wrapperPath, wrapper, { encoding: 'utf8', mode: 0o600 });
  if (process.platform === 'win32' && !/^[A-Za-z0-9_:\\.\-~]+$/.test(wrapperPath)) {
    fail('temporary SQL path contains unsupported command characters');
  }
  const started = Date.now();
  const result = process.platform === 'win32'
    ? command(process.env.ComSpec || 'cmd.exe', [
      '/d', '/s', '/c', `npx --yes supabase@latest db query --linked --file ${wrapperPath}`
    ])
    : command('npx', ['--yes', 'supabase@latest', 'db', 'query', '--linked', '--file', wrapperPath]);
  const elapsed = Date.now() - started;
  if (result.status !== 0) {
    const diagnostic = redact([result.stdout, result.stderr, result.error && result.error.message]
      .filter(Boolean).join('\n'), env);
    if (diagnostic) console.error(diagnostic);
    fail(`${mode === '--dry-run' ? 'dry run' : 'apply'} failed after ${elapsed}ms`);
  }
  console.log(`${mode === '--dry-run' ? 'DRY_RUN_ROLLED_BACK' : 'APPLIED_STAGING_ONLY'} duration_ms=${elapsed}`);
  console.log('target_verified_non_production_staging=true');
} finally {
  if (fs.existsSync(wrapperPath)) fs.unlinkSync(wrapperPath);
}
