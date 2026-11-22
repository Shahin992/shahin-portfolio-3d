// Builds dist/ from public/ for Cloudflare (R2 + Worker) and fails on any page check. No npm packages.
//   node build.mjs
//
// 1. Copies public/ to dist/ (minus the files listed in site.config.json "exclude").
// 2. Fingerprints CSS and JS (style.<10 hex>.css) and rewrites the pages to match, so the Worker can
//    let browsers cache them for a year.
// 3. Checks every page: one <h1>, title 50–60 and description 140–160 characters, canonical on the
//    configured domain, valid JSON-LD, inline scripts allowed by the CSP, and no broken internal links.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INLINE_SCRIPT_HASHES } from './worker/router.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = config.siteUrl.replace(/\/+$/, '');
const exclude = new Set(config.exclude || []);
const CI = !!process.env.GITHUB_ACTIONS;

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out); else out.push(abs);
  }
  return out;
};
const rel = (abs, base) => path.relative(base, abs).split(path.sep).join('/');
const decode = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// 1. copy
fs.rmSync(DIST, { recursive: true, force: true });
let copied = 0;
for (const abs of walk(SRC)) {
  const r = rel(abs, SRC);
  if (exclude.has(r)) continue;
  const dst = path.join(DIST, r);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(abs, dst);
  copied++;
}

// 2. fingerprint CSS + JS
const renames = {};
for (const abs of walk(DIST)) {
  const r = rel(abs, DIST);
  if (!/^assets\/.+\.(css|js)$/.test(r)) continue;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 10);
  const next = r.replace(/\.(css|js)$/, `.${hash}.$1`);
  fs.renameSync(abs, path.join(DIST, next));
  renames[`/${r}`] = `/${next}`;
}
const htmlFiles = walk(DIST).filter((f) => f.endsWith('.html'));
for (const f of htmlFiles) {
  let s = fs.readFileSync(f, 'utf8');
  for (const [from, to] of Object.entries(renames)) s = s.split(`"${from}"`).join(`"${to}"`);
  fs.writeFileSync(f, s);
}

// 3. checks
const problems = [];
const problem = (file, text) => problems.push({ file, text });
const exists = (urlPath) => {
  let p;
  try { p = decodeURIComponent(urlPath.split(/[?#]/)[0]).replace(/^\/+/, ''); } catch { return false; }
  if (p === '') p = 'index.html';
  else if (!/\.[a-z0-9]+$/i.test(p)) p = `${p}/index.html`;
  return fs.existsSync(path.join(DIST, p));
};

for (const f of htmlFiles) {
  const r = rel(f, DIST);
  const s = fs.readFileSync(f, 'utf8');
  const h1 = (s.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) problem(r, `has ${h1} <h1> elements; each page needs exactly one`);
  const title = decode((s.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
  if (title.length < 50 || title.length > 60) problem(r, `title is ${title.length} characters (needs 50–60): "${title}"`);
  const desc = decode((s.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
  if (desc.length < 140 || desc.length > 160) problem(r, `meta description is ${desc.length} characters (needs 140–160)`);
  if (r !== '404.html') {
    const canonical = (s.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (!canonical || !canonical.startsWith(SITE)) problem(r, `canonical is "${canonical}"; it should start with ${SITE} (site.config.json)`);
  }
  for (const m of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { problem(r, `invalid JSON-LD: ${e.message}`); }
  }
  for (const m of s.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)) {
    const h = `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`;
    if (!INLINE_SCRIPT_HASHES.includes(h)) problem(r, `inline script is not allowed by the CSP; add ${h} to INLINE_SCRIPT_HASHES in worker/router.js`);
  }
  const refs = [...s.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  for (const m of s.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) refs.push(part.trim().split(/\s+/)[0]);
  for (const ref of new Set(refs)) if (ref.startsWith('/') && !ref.startsWith('//') && !exists(ref)) problem(r, `broken link or missing file: ${ref}`);
}
for (const name of ['sitemap.xml', 'robots.txt', 'llms.txt']) {
  const p = path.join(DIST, name);
  if (!fs.existsSync(p)) problem(name, 'is missing');
  else if (!fs.readFileSync(p, 'utf8').includes(SITE)) problem(name, `does not mention ${SITE}; regenerate the site for the domain in site.config.json`);
}

if (problems.length) {
  for (const { file, text } of problems) {
    if (CI) console.log(`::error title=Page check failed (${file})::${text.replace(/%/g, '%25')}`);
    else console.error(`✗ ${file}: ${text}`);
  }
  console.error(`\n${problems.length} problem(s). Nothing was deployed.`);
  process.exit(1);
}
const size = walk(DIST).reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`✓ Built dist/: ${copied} files (${(size / 1024 / 1024).toFixed(2)} MB), ${htmlFiles.length} pages checked, ` +
  `${Object.keys(renames).length} CSS/JS files fingerprinted. Domain: ${SITE}`);
