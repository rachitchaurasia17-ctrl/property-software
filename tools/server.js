#!/usr/bin/env node
/**
 * PlotMap — local dev server for the admin polygon tool and client app.
 * - Serves the whole project statically (maps, app, admin, data).
 * - POST /api/polygons/:id  -> writes maps/polygons/:id.json (Phase 5 save).
 * - GET  /api/maps          -> maps/metadata/index.json
 * No external deps. Run: node tools/server.js  (http://localhost:5173/admin/)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = 5173;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.css':'text/css', '.svg':'image/svg+xml' };

function send(res, code, body, type='application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname);

  if (req.method === 'POST' && pathname.startsWith('/api/polygons/')) {
    const id = pathname.slice('/api/polygons/'.length).replace(/[^a-z0-9\-]/gi, '');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        JSON.parse(body); // validate
        fs.mkdirSync(path.join(ROOT, 'maps', 'polygons'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'maps', 'polygons', `${id}.json`), body);
        send(res, 200, JSON.stringify({ ok: true, id }));
      } catch (e) { send(res, 400, JSON.stringify({ ok: false, error: e.message })); }
    });
    return;
  }

  if (pathname === '/api/maps') {
    try { return send(res, 200, fs.readFileSync(path.join(ROOT, 'maps', 'metadata', 'index.json'))); }
    catch { return send(res, 404, '[]'); }
  }

  if (pathname === '/') pathname = '/admin/index.html';
  if (pathname.endsWith('/')) pathname += 'index.html';
  const fp = path.join(ROOT, pathname);
  if (!fp.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(fp, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(fp)] || 'application/octet-stream');
  });
});

server.listen(PORT, () => {
  console.log(`PlotMap dev server: http://localhost:${PORT}/`);
  console.log(`  Admin polygon tool: http://localhost:${PORT}/admin/`);
  console.log(`  Client experience:  http://localhost:${PORT}/app/`);
});
