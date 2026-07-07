#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  'app/plotmap/index.html',
  'app/plotmap/app.js',
  'app/plotmap/data.js',
  'app/plotmap/styles.css',
  ...fs.readdirSync(path.join(root, 'app/plotmap/datasets'))
    .filter(name => name.endsWith('.js'))
    .map(name => `app/plotmap/datasets/${name}`)
];

const checks = [
  { label: 'currency symbol', re: /₹/i },
  { label: 'Rs', re: /\bRs\b/i },
  { label: 'Cr', re: /\bCr\b/i },
  { label: 'crore', re: /\bcrore\b/i },
  { label: 'lakh', re: /\blakh\b/i },
  { label: 'price', re: /\bprice\b/i },
  { label: 'rate', re: /\brate\b/i },
  { label: 'budget', re: /\bbudget\b/i },
  { label: 'cost', re: /\bcost\b/i },
  { label: 'amount', re: /\bamount\b/i },
  { label: 'price range', re: /\bprice\s+range\b/i },
  { label: 'client validation text: verify', re: /\bverify\b/i },
  { label: 'client validation text: missing', re: /\bmissing\b/i },
  { label: 'client validation text: unmatched', re: /\bunmatched\b/i },
  { label: 'client validation text: debug', re: /\bdebug\b/i }
];

function stripComments(text, file) {
  if (file.endsWith('.html')) return text.replace(/<!--[\s\S]*?-->/g, '');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

let failures = [];
for (const rel of targets) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const raw = fs.readFileSync(abs, 'utf8');
  const body = stripComments(raw, rel);
  for (const check of checks) {
    const match = check.re.exec(body);
    if (match) failures.push({ file: rel, line: lineNumber(body, match.index), check: check.label, match: match[0] });
  }
}

if (failures.length) {
  console.error('PlotMap client-facing audit failed:');
  for (const f of failures) console.error(`- ${f.file}:${f.line} ${f.check} (${f.match})`);
  process.exit(1);
}

console.log('PlotMap client-facing audit passed.');

// ── Phase 1.5 role-architecture checks (structural, additive) ──
// These are lightweight text checks over the nav source and root landing.
// They protect the Dealer/Team separation; they are NOT a security control.
const roleFailures = [];

function readIfExists(rel) {
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

function arrayBlock(text, name) {
  const start = text.indexOf('const ' + name + ' = [');
  if (start === -1) return null;
  const end = text.indexOf('];', start);
  return end === -1 ? null : text.slice(start, end);
}

// 1) Root landing exposes the three role cards.
const rootHtml = readIfExists('index.html');
if (rootHtml === null) {
  roleFailures.push('index.html missing — cannot verify the three role cards');
} else {
  for (const card of ['Client Presentation', 'Dealer Login', 'Team Workspace']) {
    if (!rootHtml.includes(card)) roleFailures.push(`index.html is missing the "${card}" card`);
  }
}

// 2) Nav separation in admin/core/nav.js.
const navJs = readIfExists('admin/core/nav.js');
if (navJs === null) {
  roleFailures.push('admin/core/nav.js missing — cannot verify nav separation');
} else {
  const dealerNav = arrayBlock(navJs, 'DEALER_NAV');
  const teamNav = arrayBlock(navJs, 'TEAM_NAV');
  if (!dealerNav) roleFailures.push('nav.js: DEALER_NAV block not found');
  if (!teamNav) roleFailures.push('nav.js: TEAM_NAV block not found');
  // Dealer nav must not surface work tools as primary intelligence nav.
  for (const forbidden of ['map-studio', 'properties']) {
    if (dealerNav && dealerNav.includes(`'${forbidden}'`)) {
      roleFailures.push(`nav.js: DEALER_NAV must not expose "${forbidden}" (work tool, belongs in Team Workspace)`);
    }
  }
  // Team nav must not surface owner intelligence surfaces.
  for (const forbidden of ['area-intelligence', 'client-movement', 'property-insights']) {
    if (teamNav && teamNav.includes(`'${forbidden}'`)) {
      roleFailures.push(`nav.js: TEAM_NAV must not expose "${forbidden}" (owner intelligence)`);
    }
  }
}

if (roleFailures.length) {
  console.error('PlotMap role-architecture audit failed:');
  for (const f of roleFailures) console.error(`- ${f}`);
  process.exit(1);
}

console.log('PlotMap role-architecture audit passed.');
