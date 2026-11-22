// Runs the real Worker (worker/index.js) against dist/ with an in-memory R2 bucket and edge cache,
// so routing, redirects, headers and status codes are verified before anything reaches Cloudflare.
//   node build.mjs && node tools/test-worker.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const ORIGIN = config.siteUrl.replace(/\/+$/, '');
const HOST = new URL(ORIGIN).host;
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('✗ dist/ is empty: run `node build.mjs` first.'); process.exit(1); }

const env = {
  CANONICAL_HOST: HOST,
  SITE: {
    async get(key) {
      const p = path.join(DIST, key);
      if (!p.startsWith(DIST) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
      const buf = fs.readFileSync(p);
      return { body: buf, httpEtag: `"${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}"` };
    },
  },
};
const store = new Map();
globalThis.caches = { default: { async match(req) { return store.get(req.url)?.clone(); }, async put(req, res) { store.set(req.url, res); } } };
const ctx = { waitUntil: (p) => p };
const call = (p, init = {}) => worker.fetch(new Request(p.startsWith('http') ? p : `${ORIGIN}${p}`, init), env, ctx);

let failed = 0, passed = 0;
const check = (name, cond, detail = '') => {
  if (cond) passed++;
  else { failed++; console.log(`✗ ${name}${detail ? ` (${detail})` : ''}`); }
};

const css = fs.readdirSync(path.join(DIST, 'assets/css')).find((f) => /^style\.[0-9a-f]{10}\.css$/.test(f));
const pages = [...fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

// Every page in the sitemap: 200, HTML, CSP and HSTS, no-store-at-browser, served again from the edge cache
for (const p of pages) {
  const r = await call(p);
  check(`GET ${p} → 200`, r.status === 200, `got ${r.status}`);
  check(`${p} is HTML`, (r.headers.get('content-type') || '').startsWith('text/html'));
  check(`${p} has CSP`, (r.headers.get('content-security-policy') || '').includes("script-src 'self' 'sha256-"));
  check(`${p} has HSTS`, !!r.headers.get('strict-transport-security'));
  check(`${p} revalidates`, r.headers.get('cache-control') === 'public, max-age=0, must-revalidate', r.headers.get('cache-control'));
  const again = await call(p);
  check(`${p} second hit`, again.status === 200);
}

// One canonical address per page
const redirects = [
  ['/about/', `${ORIGIN}/about`], ['/about.html', `${ORIGIN}/about`], ['/index.html', `${ORIGIN}/`],
  ['/about/index.html', `${ORIGIN}/about`], ['/projects/cliento/', `${ORIGIN}/projects/cliento`],
  [`https://www.${HOST}/skills?x=1`, `${ORIGIN}/skills?x=1`],
];
for (const [from, to] of redirects) {
  const r = await call(from, { redirect: 'manual' });
  check(`${from} → 301 ${to}`, r.status === 301 && r.headers.get('location') === to, `${r.status} ${r.headers.get('location')}`);
}

// Not found, hidden files, methods, conditional requests, assets
let r = await call('/no-such-page');
check('unknown page → 404', r.status === 404 && r.headers.get('x-robots-tag') === 'noindex');
check('404 has a body', (await r.text()).includes('404'));
check('/404.html → 404', (await call('/404.html')).status === 404);
check('/_deploy/manifest.json hidden', (await call('/_deploy/manifest.json')).status === 404);
check('path traversal blocked', (await call('/%2e%2e/wrangler.toml')).status === 404);
check('POST → 405', (await call('/', { method: 'POST', body: 'x' })).status === 405);
r = await call('/', { method: 'HEAD' });
check('HEAD / → 200, no body', r.status === 200 && (await r.text()) === '');
const etag = (await call('/about')).headers.get('etag');
check('If-None-Match → 304', (await call('/about', { headers: { 'If-None-Match': etag } })).status === 304);
r = await call(`/assets/css/${css}`);
check('fingerprinted CSS cached a year', r.status === 200 && r.headers.get('cache-control') === 'public, max-age=31536000, immutable' && r.headers.get('content-type').startsWith('text/css'));
check('CSS has no CSP header (HTML only)', !r.headers.get('content-security-policy'));
r = await call('/assets/img/shahin-alam-at-work-900.webp');
check('image → webp, cached a week', r.status === 200 && r.headers.get('content-type') === 'image/webp' && r.headers.get('cache-control') === 'public, max-age=604800');
r = await call('/assets/Shahin-Alam-Resume.pdf');
check('résumé → application/pdf', r.status === 200 && r.headers.get('content-type') === 'application/pdf');
for (const f of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/site.webmanifest', '/favicon.ico']) check(`${f} → 200`, (await call(f)).status === 200);
check('excluded original photo not deployed', (await call('/assets/img/office-working.jpg')).status === 404);

console.log(`${failed ? '✗' : '✓'} Worker: ${passed} checks passed${failed ? `, ${failed} failed` : ''} (${pages.length} pages).`);
if (failed) process.exit(1);
