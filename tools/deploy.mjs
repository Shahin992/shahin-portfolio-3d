// Uploads dist/ to the R2 bucket through R2's S3-compatible API (no npm packages).
// Only changed files are sent. New assets go up before HTML, so a visitor never gets a page whose
// CSS or JS isn't there yet. Removed files are deleted one day later, because HTML can sit in
// Cloudflare's edge cache for a few minutes and may still point at them.
//
//   node tools/deploy.mjs            upload
//   node tools/deploy.mjs --dry-run  show what would change
//
// Needs R2 credentials in the environment or in .env.deploy (never commit that file):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (default: "bucket" in site.config.json)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { contentTypeFor, cacheControlFor, extOf } from '../worker/router.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DRY = process.argv.includes('--dry-run');
const MANIFEST_KEY = '_deploy/manifest.json';
const GRACE_MS = 24 * 60 * 60 * 1000;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

const envFile = path.join(ROOT, '.env.deploy');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const { R2_ACCOUNT_ID: ACCOUNT, R2_ACCESS_KEY_ID: KEY_ID, R2_SECRET_ACCESS_KEY: SECRET } = process.env;
const BUCKET = process.env.R2_BUCKET || config.bucket;

// Problems are said in plain words; in GitHub Actions they also show in the run's summary
function fail(title, text) {
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${title}::${text.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
  else console.error(`✗ ${title}: ${text}`);
  process.exit(1);
}
function explain(message) {
  if (/NoSuchBucket/.test(message)) return `There is no R2 bucket named "${BUCKET}". Create it (R2 Object Storage → Create bucket, location Automatic) or fix the name.`;
  if (/Credential access key has length/.test(message)) return 'R2_ACCESS_KEY_ID is not an R2 Access Key ID (those are 32 characters). Paste the Access Key ID shown when you created the R2 API token.';
  if (/InvalidAccessKeyId|Unauthorized|401/.test(message)) return 'R2 does not recognise R2_ACCESS_KEY_ID. Paste the Access Key ID of your R2 API token into that GitHub secret.';
  if (/SignatureDoesNotMatch/.test(message)) return 'R2_SECRET_ACCESS_KEY does not match the Access Key ID. Paste the Secret Access Key of the same R2 token into that GitHub secret.';
  if (/AccessDenied|403/.test(message)) return `The R2 token is not allowed to write to "${BUCKET}". Give it Object Read & Write on that bucket (R2 → Manage API tokens).`;
  return message;
}
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, (e) => fail('R2 upload failed', explain(String(e?.message || e))));

if (!DRY && (!ACCOUNT || !KEY_ID || !SECRET)) fail('R2 credentials missing', 'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (GitHub secrets, or .env.deploy on your computer).');
if (!fs.existsSync(path.join(DIST, 'index.html'))) fail('Nothing to upload', 'dist/ is empty: run `node build.mjs` first.');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const encodeKey = (key) => key.split('/').map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

// AWS Signature Version 4, region "auto", as R2 expects
async function r2(method, key, body = Buffer.alloc(0), extraHeaders = {}) {
  const host = `${ACCOUNT}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const uri = `/${BUCKET}/${encodeKey(key)}`;
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  for (const [k, v] of Object.entries(extraHeaders)) headers[k.toLowerCase()] = v;
  const names = Object.keys(headers).sort();
  const canonical = [method, uri, '', names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, day), 'auto'), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(toSign).digest('hex');
  const { host: _omit, ...send } = headers;
  send.authorization = `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  const res = await fetch(`https://${host}${uri}`, { method, headers: send, body: method === 'PUT' ? body : undefined });
  if (res.status === 404 && (method === 'GET' || method === 'DELETE')) {
    // A missing file is fine (first deploy, already deleted); a missing bucket is not
    const text = await res.clone().text();
    if (/NoSuchBucket/.test(text)) throw new Error(`NoSuchBucket ${BUCKET}`);
    return res;
  }
  if (!res.ok) throw new Error(`${method} ${key}: ${res.status} ${await res.text()}`);
  return res;
}

function localFiles() {
  const out = {};
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else out[path.relative(DIST, abs).split(path.sep).join('/')] = { hash: sha256(fs.readFileSync(abs)) };
    }
  };
  walk(DIST);
  return out;
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item); }
  }));
}

const files = localFiles();
let previous = { files: {}, removed: {} };
if (!DRY) {
  const res = await r2('GET', MANIFEST_KEY);
  if (res.ok) previous = await res.json();
}

const changed = Object.keys(files).filter((k) => previous.files[k]?.hash !== files[k].hash);
const pagesLast = (k) => (['html', 'xml', 'txt'].includes(extOf(k)) ? 1 : 0);
changed.sort((a, b) => pagesLast(a) - pagesLast(b));

const now = Date.now();
const removed = { ...previous.removed };
for (const k of Object.keys(previous.files)) if (!files[k] && !removed[k]) removed[k] = now;
for (const k of Object.keys(removed)) if (files[k]) delete removed[k];
const toDelete = Object.keys(removed).filter((k) => now - removed[k] > GRACE_MS);

console.log(`${changed.length} file(s) to upload, ${toDelete.length} to delete, ${Object.keys(removed).length - toDelete.length} kept for now.`);
if (DRY) { changed.forEach((k) => console.log(`  + ${k}`)); process.exit(0); }

const assets = changed.filter((k) => !pagesLast(k));
const pages = changed.filter((k) => pagesLast(k));
for (const group of [assets, pages]) {
  await pool(group, 6, async (key) => {
    await r2('PUT', key, fs.readFileSync(path.join(DIST, key)), { 'content-type': contentTypeFor(key), 'cache-control': cacheControlFor(key) });
    console.log(`  ↑ ${key}`);
  });
}
await pool(toDelete, 6, async (key) => { await r2('DELETE', key); delete removed[key]; console.log(`  ✕ ${key}`); });
await r2('PUT', MANIFEST_KEY, Buffer.from(JSON.stringify({ deployedAt: new Date().toISOString(), files, removed })), { 'content-type': 'application/json' });
console.log('✓ Deployed to R2. HTML at the edge refreshes within 5 minutes.');
