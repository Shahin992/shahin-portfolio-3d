// Tells Bing, Yandex and other IndexNow search engines which pages changed, right after a deploy.
//   node tools/indexnow.mjs                 every URL in dist/sitemap.xml
//   node tools/indexnow.mjs /about /projects/edufusion
// The key is the public/<key>.txt file; it must be deployed first so the engines can verify it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = config.siteUrl.replace(/\/+$/, '');
const keyFile = fs.readdirSync(path.join(ROOT, 'public')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('No IndexNow key file (public/<32 hex>.txt).'); process.exit(1); }
const key = keyFile.replace('.txt', '');
const host = new URL(SITE).host;

let urls = process.argv.slice(2).map((p) => `${SITE}${p}`);
if (!urls.length) {
  const sitemap = fs.readFileSync(path.join(ROOT, 'dist', 'sitemap.xml'), 'utf8');
  urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls }),
});
console.log(`IndexNow: ${res.status} for ${urls.length} URL(s)`);
if (res.status >= 400) process.exit(1);
