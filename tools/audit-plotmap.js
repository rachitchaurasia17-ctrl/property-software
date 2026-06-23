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
