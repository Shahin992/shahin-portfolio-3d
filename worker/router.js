// URL rules shared by the Cloudflare Worker (worker/index.js), the local server (server.js) and the
// R2 upload (tools/deploy.mjs), so the site behaves the same locally and in production.

export const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  ico: 'image/x-icon',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  webmanifest: 'application/manifest+json',
  woff2: 'font/woff2',
  pdf: 'application/pdf',
};

export const extOf = (key) => (key.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
export const contentTypeFor = (key) => CONTENT_TYPES[extOf(key)] || 'application/octet-stream';

// One address per page: no www, no .html, no trailing slash, no /index
export function redirectFor(url, { canonicalHost = '' } = {}) {
  let { hostname, pathname } = url;
  let changed = false;
  if (canonicalHost && hostname === `www.${canonicalHost}`) { hostname = canonicalHost; changed = true; }
  if (/\/index(\.html)?$/.test(pathname)) { pathname = pathname.replace(/\/index(\.html)?$/, '/'); changed = true; }
  if (pathname.endsWith('.html') && pathname !== '/404.html') { pathname = pathname.slice(0, -5) || '/'; changed = true; }
  if (pathname.length > 1 && pathname.endsWith('/')) { pathname = pathname.replace(/\/+$/, '') || '/'; changed = true; }
  if (!changed) return null;
  return `${url.protocol}//${hostname}${url.port ? `:${url.port}` : ''}${pathname}${url.search}`;
}

// The stored file for a URL: "/" → index.html, "/about" → about/index.html, files as they are
export function keyFor(pathname) {
  let p;
  try { p = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch { return null; }
  if (p.includes('..') || p.includes('\0')) return null;
  if (p === '') return 'index.html';
  if (!extOf(p)) return `${p}/index.html`;
  return p;
}

// CSS and JS are fingerprinted by build.mjs (style.<10 hex>.css), so they can be cached for a year
const FINGERPRINTED = /\.[0-9a-f]{10}\.(css|js)$/;

export function cacheControlFor(key) {
  if (FINGERPRINTED.test(key)) return 'public, max-age=31536000, immutable';
  const ext = extOf(key);
  if (ext === 'html') return 'public, max-age=0, must-revalidate';
  if (['webp', 'png', 'jpg', 'jpeg', 'ico', 'woff2', 'svg'].includes(ext)) return 'public, max-age=604800';
  if (ext === 'pdf') return 'public, max-age=86400';
  return 'public, max-age=3600';
}

// How long the edge keeps HTML before checking R2 again (seconds)
export const EDGE_HTML_TTL = 300;

// The only inline script on the pages (theme + "js" class, set before paint). build.mjs fails if a page
// has an inline script whose hash is not listed here, so the CSP never silently breaks the site.
export const INLINE_SCRIPT_HASHES = ["'sha256-P79FeZY3tWpzsVTv2oo2WcNRqycaxT1/xPtc8eEKBGI='"];

export const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    `script-src 'self' ${INLINE_SCRIPT_HASHES.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY',
};

export function responseHeaders(key, { status = 200 } = {}) {
  const h = { 'Content-Type': contentTypeFor(key), 'Cache-Control': cacheControlFor(key) };
  if (extOf(key) === 'html') Object.assign(h, SECURITY_HEADERS);
  if (status === 404) h['X-Robots-Tag'] = 'noindex';
  return h;
}
