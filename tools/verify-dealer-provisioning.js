#!/usr/bin/env node
/**
 * Static security verification for one-click dealer provisioning.
 *
 * This tool reads tracked source files only. It never loads environment
 * variables, contacts Supabase, or prints credential material.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const files = {
  migration: path.join(ROOT, 'supabase', 'migrations', '20260722_one_click_dealer_provisioning.sql'),
  edge: path.join(ROOT, 'supabase', 'functions', 'provision-dealer', 'index.ts'),
  developer: path.join(ROOT, 'admin', 'developer.html'),
  css: path.join(ROOT, 'admin', 'developer-control.css')
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, filename]) => [name, fs.readFileSync(filename, 'utf8')])
);
const sqlWithoutComments = source.migration.replace(/--.*$/gm, '');
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  - ${detail}` : ''}`);
}

function functionBody(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.migration.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${escaped}\\b[\\s\\S]*?as\\s+\\$\\$([\\s\\S]*?)\\$\\$;`,
    'i'
  ));
  return match ? match[1] : '';
}

function hasAll(haystack, patterns) {
  return patterns.every(pattern => pattern.test(haystack));
}

function run() {
  check('all provisioning files exist', Object.values(files).every(fs.existsSync));
  check('migration has no destructive SQL', !/(^|\n)\s*(drop\s+table|drop\s+database|delete\s+from|truncate\b)/i.test(sqlWithoutComments));
  check('migration has no broad RLS predicate', !/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(sqlWithoutComments));
  check('no credential literal is present', !/(sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^\s'"`]+)/i.test(Object.values(source).join('\n')));

  check('provisioning table is deny-all with RLS', hasAll(source.migration, [
    /alter table public\.dealer_provisioning_attempts enable row level security/i,
    /revoke all on public\.dealer_provisioning_attempts from public, anon, authenticated/i
  ]));
  check('passcode retry material is bcrypt only', hasAll(source.migration, [
    /passcode_retry_hash text/i,
    /crypt\(trim\(p_passcode\), gen_salt\('bf', 10\)\)/i,
    /set status = 'completed',[\s\S]*?passcode_retry_hash = null/i
  ]));
  check('idempotency key is hashed', /digest\(trim\(p_idempotency_key\), 'sha256'\)/i.test(source.migration));
  check('provisioning rate limit is server-side', hasAll(functionBody('plotmap_admin_begin_dealer_provisioning'), [
    /created_at >= timezone\('utc'::text, now\(\)\) - interval '15 minutes'/i,
    />= 5/i,
    /PROVISIONING_RATE_LIMIT/i
  ]));
  check('concurrent submissions use an atomic lease', hasAll(functionBody('plotmap_admin_begin_dealer_provisioning'), [
    /pg_advisory_xact_lock/i,
    /lease_expires_at/i,
    /PROVISIONING_IN_PROGRESS/i,
    /'proceed', true/i,
    /'proceed', false/i
  ]));

  const adminFunctions = [
    'plotmap_admin_begin_dealer_provisioning',
    'plotmap_admin_mark_dealer_provisioning_auth',
    'plotmap_admin_get_dealer_provisioning_attempt',
    'plotmap_admin_fail_dealer_provisioning',
    'plotmap_admin_finalize_dealer_provisioning',
    'plotmap_admin_create_dealer_activation_code',
    'plotmap_admin_approve_activation_request'
  ];
  for (const name of adminFunctions) {
    const body = functionBody(name);
    check(`${name} exists`, Boolean(body));
    check(`${name} is platform-admin guarded`, /plotmap_(?:provisioning_admin_is_active|is_platform_admin)/i.test(body));
  }

  check('service Auth lookup is service-role only', hasAll(source.migration, [
    /revoke all on function public\.plotmap_service_auth_user_by_email\(text\)[\s\S]*?from public, anon, authenticated/i,
    /grant execute on function public\.plotmap_service_auth_user_by_email\(text\)[\s\S]*?to service_role/i
  ]));
  check('service Auth lookup returns no hash or token fields', !/(password|encrypted_password|refresh_token|access_token)/i.test(functionBody('plotmap_service_auth_user_by_email')));
  check('owner profile is bound to the Auth UUID and dealer', hasAll(functionBody('plotmap_admin_finalize_dealer_provisioning'), [
    /v_attempt\.auth_user_id/i,
    /v_attempt\.dealer_id/i,
    /'owner'/i,
    /p\.status = 'active'/i,
    /AUTH_USER_BINDING_INVALID/i
  ]));
  check('existing passcode hashing RPC is reused', /perform public\.plotmap_admin_set_dealer_passcode/i.test(functionBody('plotmap_admin_finalize_dealer_provisioning')));
  check('activation code uses secure generation and bcrypt', hasAll(functionBody('plotmap_admin_finalize_dealer_provisioning'), [
    /plotmap_secure_numeric_code\(8\)/i,
    /crypt\(v_activation_code, gen_salt\('bf', 10\)\)/i,
    /max_uses[\s\S]*?1/i
  ]));
  check('activation request derives dealer only from code row', hasAll(functionBody('plotmap_submit_activation_request'), [
    /v_code\.dealer_id/i,
    /plotmap_dealer_is_active\(c\.dealer_id\)/i,
    /status = case[\s\S]*?access_code\.use_count \+ 1 >= access_code\.max_uses[\s\S]*?'disabled'/i
  ]));
  check('device approval enforces request dealer match and limit', hasAll(functionBody('plotmap_admin_approve_activation_request'), [
    /v_request\.dealer_id <> v_dealer_id/i,
    /DEALER_DEVICE_LIMIT_REACHED/i,
    /status = 'pending'/i
  ]));
  check('old unscoped activation RPC is revoked', /revoke all on function public\.plotmap_admin_create_activation_code[\s\S]*?from public, anon, authenticated/i.test(source.migration));

  const envNames = [...source.edge.matchAll(/Deno\.env\.get\('([^']+)'\)/g)].map(match => match[1]).sort();
  const expectedEnv = ['PLOTMAP_ALLOWED_ORIGINS', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'].sort();
  check('Edge Function reads only approved environment names', JSON.stringify(envNames) === JSON.stringify(expectedEnv), envNames.join(', '));
  check('Edge Function validates JWT and platform admin server-side', hasAll(source.edge, [
    /\/auth\/v1\/user/i,
    /plotmap_is_platform_admin/i,
    /if \(!await isPlatformAdmin\(token\)\)/i
  ]));
  check('Edge Function does not log', !/console\.(log|info|warn|error|debug)\s*\(/i.test(source.edge));
  check('Edge Function response is no-store', /Cache-Control': 'no-store, max-age=0'/i.test(source.edge));
  check('Edge Function never adopts unrelated Auth users', hasAll(source.edge, [
    /ownedByAttempt/i,
    /AUTH_EMAIL_ALREADY_EXISTS/i,
    /plotmap_provisioning_attempt_id/i,
    /plotmap_dealer_id/i
  ]));
  check('Edge Function compensates only users created by its invocation', hasAll(source.edge, [
    /authCreatedThisCall/i,
    /authCreatedThisCall && authUserId/i,
    /deleteAuthUser\(authUserId\)/i,
    /p_auth_user_retained/i
  ]));
  check('Edge Function honors the database orchestration lease', hasAll(source.edge, [
    /begin\.proceed !== true/i,
    /PROVISIONING_IN_PROGRESS/i,
    /err\.code !== 'PROVISIONING_IN_PROGRESS'/i
  ]));
  check('request fingerprint excludes passcode', !/fingerprint = await sha256\([\s\S]{0,900}passcode/i.test(source.edge));

  const createSection = source.developer.split('// ---------- create dealer ----------')[1]
    .split('// ---------- table actions ----------')[0];
  check('browser provisioning uses Edge Function', /\/functions\/v1\/provision-dealer/i.test(createSection));
  check('browser create flow does not call legacy multi-step RPC chain', !/plotmap_admin_(set_dealer_account|upsert_dealer_directory|set_dealer_trial|set_dealer_passcode)/i.test(createSection));
  check('one-time credentials are memory-only', hasAll(createSection, [
    /let onboardingSecrets = null|onboardingSecrets = Object\.freeze/i,
    /clearProvisioningSecrets/i,
    /addEventListener\('pagehide', clearProvisioningSecrets\)/i
  ]) && !/localStorage|sessionStorage|console\./i.test(createSection));
  check('navigation cannot hide an in-flight credential result', /nextSection !== 'create' && provisioningSubmitting/i.test(source.developer));
  check('activation UI calls dealer-scoped RPC', /plotmap_admin_create_dealer_activation_code/i.test(source.developer));
  check('approval dealer field is read-only', /id="a-dealer-id" readonly/i.test(source.developer));
  check('new success and progress UI has responsive CSS', hasAll(source.css, [
    /\.provisioning-progress/i,
    /\.provisioning-success/i,
    /\.provisioning-summary/i,
    /@media \(max-width: 880px\)/i
  ]));

  const inlineScripts = [...source.developer.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(code => code.trim());
  let syntaxError = '';
  try { inlineScripts.forEach(code => new vm.Script(code)); } catch (error) { syntaxError = error.message; }
  check('Developer Control inline JavaScript parses', !syntaxError, syntaxError);

  const failed = checks.filter(item => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  if (failed.length) process.exit(1);
}

run();
