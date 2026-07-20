#!/usr/bin/env node
/** Offline verification for the static runtime Supabase configuration. */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools', 'generate-runtime-env.js');
const RESOLVER = path.join(ROOT, 'config', 'supabase-config.js');
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'plotmap-runtime-config-'));
const OUTPUT = path.join(TEMP, 'runtime-env.js');
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    checks.push({ name, ok: false });
    console.error(`FAIL  ${name} - ${error.message}`);
  }
}

function generate(env) {
  return spawnSync(process.execPath, [GENERATOR, '--output', OUTPUT], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    windowsHide: true
  });
}

function resolveGenerated() {
  const sandbox = { window: {}, URL, console };
  sandbox.window.atob = value => Buffer.from(value, 'base64').toString('binary');
  vm.runInNewContext(fs.readFileSync(OUTPUT, 'utf8'), sandbox, { filename: 'runtime-env.js' });
  vm.runInNewContext(fs.readFileSync(RESOLVER, 'utf8'), sandbox, { filename: 'supabase-config.js' });
  return sandbox.window.PMRuntimeConfig.supabase;
}

try {
  check('no env variables generate complete production fallback mode', () => {
    const result = generate({});
    assert.strictEqual(result.status, 0);
    assert.strictEqual(resolveGenerated().source, 'fallback');
  });

  check('public staging pair resolves atomically to runtime mode', () => {
    const result = generate({
      VITE_SUPABASE_URL: 'https://preview-staging-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_preview_test_public_value'
    });
    assert.strictEqual(result.status, 0);
    const resolved = resolveGenerated();
    assert.strictEqual(resolved.source, 'runtime');
    assert.strictEqual(resolved.url, 'https://preview-staging-test.supabase.co');
    assert.strictEqual(resolved.key, 'sb_publishable_preview_test_public_value');
  });

  check('incomplete pair fails and removes stale output', () => {
    const result = generate({ VITE_SUPABASE_URL: 'https://preview-staging-test.supabase.co' });
    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(fs.existsSync(OUTPUT), false);
  });

  check('secret-shaped key fails and is never generated', () => {
    const result = generate({
      VITE_SUPABASE_URL: 'https://preview-staging-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_secret_test_value_that_must_be_rejected'
    });
    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(fs.existsSync(OUTPUT), false);
  });

  check('all Supabase consumers use the shared resolver', () => {
    const consumers = [
      'app/plotmap/app.js',
      'admin/core/auth.js',
      'admin/core/supabase-sync.js',
      'admin/core/device-access.js'
    ];
    for (const relative of consumers) {
      const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.match(source, /PMRuntimeConfig/);
      assert.doesNotMatch(source, /https:\/\/[a-z0-9]+\.supabase\.co|sb_publishable_/i);
    }
  });

  check('every active Supabase HTML entry loads runtime config first', () => {
    const roots = [path.join(ROOT, 'index.html'), path.join(ROOT, 'app', 'plotmap', 'index.html')];
    for (const name of fs.readdirSync(path.join(ROOT, 'admin'))) {
      if (name.endsWith('.html')) roots.push(path.join(ROOT, 'admin', name));
    }
    for (const file of roots) {
      const source = fs.readFileSync(file, 'utf8');
      const consumerIndex = source.search(/(?:core\/(?:auth|supabase-sync|device-access)\.js|\.\/app\.js)/);
      if (consumerIndex < 0) continue;
      const runtimeIndex = source.indexOf('/config/runtime-env.js');
      const resolverIndex = source.indexOf('/config/supabase-config.js');
      assert(runtimeIndex >= 0 && resolverIndex > runtimeIndex && consumerIndex > resolverIndex,
        `${path.relative(ROOT, file)} has unsafe script order`);
    }
  });
} finally {
  fs.rmSync(TEMP, { recursive: true, force: true });
}

const failed = checks.filter(item => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} runtime config checks passed.`);
if (failed.length) process.exit(1);
