// Cloudflare Worker: serves the portfolio from an R2 bucket (binding SITE) with clean URLs,
// one canonical address per page, edge caching for HTML and security headers.
import { redirectFor, keyFor, responseHeaders, EDGE_HTML_TTL, extOf } from './router.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const redirect = redirectFor(url, { canonicalHost: env.CANONICAL_HOST });
    if (redirect) return Response.redirect(redirect, 301);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const key = keyFor(url.pathname);
    if (!key || key === '404.html' || key.startsWith('_deploy/')) return notFound(env, request);

    const isHtml = extOf(key) === 'html';
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });

    // HTML is kept at the edge for a few minutes; everything else is cached by browsers and Cloudflare
    if (isHtml) {
      const cached = await cache.match(cacheKey);
      if (cached) return finish(request, cached, key);
    }

    const object = await env.SITE.get(key);
    if (!object) return notFound(env, request);

    const headers = new Headers(responseHeaders(key));
    headers.set('ETag', object.httpEtag);
    const response = new Response(object.body, { headers });

    if (isHtml) {
      const forEdge = new Response(response.clone().body, { headers });
      forEdge.headers.set('Cache-Control', `public, s-maxage=${EDGE_HTML_TTL}`);
      ctx.waitUntil(cache.put(cacheKey, forEdge));
    }
    return finish(request, response, key);
  },
};

// Answers 304 when the browser already has this version, and strips the body for HEAD
function finish(request, response, key) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', responseHeaders(key)['Cache-Control']);
  const etag = headers.get('ETag');
  const inm = request.headers.get('If-None-Match');
  if (etag && inm && inm.split(',').map((s) => s.trim()).includes(etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
}

async function notFound(env, request) {
  const object = await env.SITE.get('404.html');
  const headers = new Headers(responseHeaders('404.html', { status: 404 }));
  return new Response(request.method === 'HEAD' || !object ? null : object.body, { status: 404, headers });
}
