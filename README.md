# Shahin Alam · Portfolio

Editorial-style portfolio built with plain **HTML, CSS and vanilla JavaScript**: no framework and no npm dependencies. It includes 3D scenes and data visualizations, plus full SEO, AEO and GEO setup (see [SEO-STRATEGY.md](SEO-STRATEGY.md)). Live at **https://shahinkhan.online**, served by a **Cloudflare Worker from R2** (see [DEPLOY.md](DEPLOY.md)).

## Run locally

```bash
npm start
```

This opens on **http://localhost:2026**, using the same URL rules and security headers as the Cloudflare Worker. Use another port with `PORT=3000 npm start`. Requires Node 20 or newer.

| URL | File |
|---|---|
| `/` | `public/index.html` |
| `/about` | `public/about/index.html` |
| `/projects` | `public/projects/index.html` |
| `/projects/edufusion` | `public/projects/edufusion/index.html` |
| `/projects/coldmailer` | `public/projects/coldmailer/index.html` |
| `/projects/cliento` | `public/projects/cliento/index.html` |
| `/projects/kestrel`, `/projects/willowmere`, `/projects/ashcombe`, `/projects/northbay`, `/projects/swapnojatra`, `/projects/fernway`, `/projects/almabrur`, `/projects/rihla` | `public/projects/<name>/index.html`: one case study per website, each linking to `https://<name>.shahinkhan.online` |
| `/experience` | `public/experience/index.html` |
| `/skills` | `public/skills/index.html` |
| `/contact` | `public/contact/index.html` |
| anything else | `public/404.html` (status 404) |

`/about/`, `/about.html` and `/about/index.html` all redirect (301) to `/about`, and `www.` redirects to the bare domain: one canonical URL per page.

| Command | What it does |
| --- | --- |
| `npm start` | Local site from `public/` |
| `npm run build` | Builds `dist/` and runs every page check |
| `npm run preview` | Builds, then serves `dist/` exactly as production will |
| `npm run test:worker` | Runs the real Worker against the build with an in-memory R2 |
| `npm run deploy:dry` | Shows which files would be uploaded to R2 |

## Structure

```
public/                    the site (source of truth: edit these files)
  index.html, about/, projects/, projects/{edufusion,coldmailer,cliento}/, experience/, skills/, contact/, 404.html
  projects/{kestrel,willowmere,ashcombe,northbay,swapnojatra,fernway,almabrur,rihla}/   website case studies
  assets/css/style.css     design system (paper light theme + ink dark theme)
  assets/js/main.js        theme, menu, reveals, counters, Dhaka clock, tilt cards, scroll 3D
  assets/js/viz.js         3D terrain, globe, tag sphere, header wireframes, stack map
  assets/img/              portraits, project screenshots, og-image.png, icons
  assets/img/websites/     desktop, phone and feature screenshots of the eight websites (WebP)
  robots.txt, sitemap.xml, llms.txt, site.webmanifest, favicon.ico, <IndexNow key>.txt
worker/index.js            Cloudflare Worker: serves the site from R2
worker/router.js           URL rules, cache and security headers (shared by Worker, local server, upload)
wrangler.toml              Worker name, custom domains, R2 binding
site.config.json           domain, zone, bucket, files kept out of the deploy
build.mjs                  public/ → dist/, fingerprints CSS/JS, page checks
server.js                  local server (port 2026)
tools/deploy.mjs           uploads changed files to R2
tools/check-cloudflare.mjs checks secrets, token, zone, DNS and bucket before a deploy
tools/test-worker.mjs      Worker tests against dist/
tools/indexnow.mjs         tells search engines which pages changed
.github/workflows/deploy.yml  build → test → check → upload → deploy Worker → IndexNow
```

## Deploy

Push to the `production` branch; GitHub Actions does the rest. The one-time Cloudflare and GitHub setup (bucket, two tokens, four secrets) is in **[DEPLOY.md](DEPLOY.md)**.

## What's on the pages

- **3D (hand-written canvas and CSS 3D, no libraries):** wireframe terrain in the home hero, wireframe shapes in page headers, a draggable globe pinned on Dhaka, a draggable tech-stack sphere made of real crawlable text, scroll-linked 3D screenshots and tilt cards.
- **Visualizations (all from résumé and repo facts):** impact charts, a career timeline, animated architecture diagrams, a warm-up ramp, a commit-activity chart and an interactive "where I've used what" stack map.
- Everything animates only while on screen and respects *reduce motion*. Every page works without JavaScript.

## Editing tips

- Colors and fonts are tokens at the top of `public/assets/css/style.css` (`--accent`, `--serif`, …).
- The header and footer repeat in each page's HTML. If you change navigation, update every HTML file.
- When you change content, update the "Last updated" date in the footers and `<lastmod>` in `sitemap.xml`.
- `npm run build` tells you if a page breaks a rule (title or description length, missing `<h1>`, broken link, invalid JSON-LD).
