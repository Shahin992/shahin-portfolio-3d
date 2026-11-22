#!/usr/bin/env node
// Local server with the same URL rules and headers as the Cloudflare Worker (worker/router.js).
//   npm start             serves public/  on http://localhost:2026 (editing: no caching)
//   npm run preview       builds, then serves dist/ exactly as production does
//   PORT=3000 npm start   another port
//   npm run start:wifi    serves public/ to phones and laptops on the same Wi-Fi (port 2027)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { redirectFor, keyFor, responseHeaders, contentTypeFor } from './worker/router.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USE_DIST = process.argv.includes('--dist');
const DIR = path.join(ROOT, USE_DIST ? 'dist' : 'public');
const PORT = Number(process.env.PORT) || 2026;
const HOST = process.env.HOST || 'localhost';
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg)/;

if (!fs.existsSync(path.join(DIR, 'index.html'))) {
  console.error(`✗ ${path.relative(ROOT, DIR)}/ is empty${USE_DIST ? ': run `node build.mjs` first' : ''}.`);
  process.exit(1);
}

function fileFor(key) {
  const abs = path.resolve(DIR, key);
  if (!abs.startsWith(DIR + path.sep)) return null;
  try { return fs.statSync(abs).isFile() ? abs : null; } catch { return null; }
}

function send(req, res, file, key, status) {
  const headers = responseHeaders(key, { status });
  if (!USE_DIST) headers['Cache-Control'] = 'no-cache';           // editing: always revalidate
  headers['Content-Type'] = contentTypeFor(key);
  const stat = fs.statSync(file);
  headers['Last-Modified'] = stat.mtime.toUTCString();
  const since = req.headers['if-modified-since'];
  if (status === 200 && since && new Date(since) >= new Date(stat.mtime.toUTCString())) {
    res.writeHead(304, headers);
    return res.end();
  }
  let stream = fs.createReadStream(file);
  const accept = String(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.test(headers['Content-Type'])) {
    headers.Vary = 'Accept-Encoding';
    if (/\bbr\b/.test(accept)) { headers['Content-Encoding'] = 'br'; stream = stream.pipe(zlib.createBrotliCompress()); }
    else if (/\bgzip\b/.test(accept)) { headers['Content-Encoding'] = 'gzip'; stream = stream.pipe(zlib.createGzip()); }
  }
  if (!headers['Content-Encoding']) headers['Content-Length'] = stat.size;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started}ms)`));
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`); } catch { res.writeHead(400); return res.end('Bad Request'); }

  const redirect = redirectFor(url);
  if (redirect) { res.writeHead(301, { Location: redirect, 'Cache-Control': 'no-cache' }); return res.end(); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end('Method Not Allowed'); }

  const key = keyFor(url.pathname);
  const file = key && key !== '404.html' && fileFor(key);
  if (file) return send(req, res, file, key, 200);
  return send(req, res, path.join(DIR, '404.html'), '404.html', 404);
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`\n  Port ${PORT} is already in use, so the site is probably already running at http://localhost:${PORT}.`);
  console.error(`  Open that address, stop the other server first, or pick another port: PORT=${PORT + 10} npm ${HOST === '0.0.0.0' ? 'run start:wifi' : 'start'}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Portfolio (${USE_DIST ? 'dist/, production rules' : 'public/'}) at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST === '0.0.0.0') {
    // Wi-Fi / LAN addresses other devices on the same network can open (Docker bridges skipped).
    const lan = Object.entries(os.networkInterfaces())
      .filter(([name]) => !/^(docker|br-|veth|lo)/.test(name))
      .flatMap(([, list]) => list.filter((a) => a.family === 'IPv4' && !a.internal).map((a) => a.address));
    for (const ip of lan) console.log(`  On your network:  http://${ip}:${PORT}`);
  }
  console.log('');
});
