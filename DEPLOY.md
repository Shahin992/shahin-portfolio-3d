# Deploying the portfolio (R2 + Worker)

The site is served by a **Cloudflare Worker** (`worker/`, `wrangler.toml`) that reads the files from an **R2 bucket**, on **shahinkhan.online** (`www` redirects to it). It's the same setup as the EduFusion website.

- **`main`**: where you work.
- **`production`**: what's live. A push to `production` runs `.github/workflows/deploy.yml`:
  1. builds the site (`node build.mjs`: copies `public/` to `dist/`, fingerprints CSS/JS, and **fails on any page check**: one `<h1>`, title 50–60 and description 140–160 characters, canonical on the right domain, valid JSON-LD, CSP-allowed inline scripts, no broken links);
  2. tests the Worker against the build (`tools/test-worker.mjs`: every page, redirects, 404s, headers, caching);
  3. checks the Cloudflare setup (`tools/check-cloudflare.mjs`): the four secrets, the token's permissions, the zone and its DNS, and the R2 bucket, which it creates if it's missing. Each problem appears in plain words in the run's **Annotations**;
  4. uploads the changed files to the R2 bucket (`tools/deploy.mjs`);
  5. deploys the Worker;
  6. tells Bing and other IndexNow engines which pages changed.

## Settings in one place

| File | What |
| --- | --- |
| `site.config.json` | `siteUrl`, Cloudflare `zone`, `worker` and `bucket` names, files kept out of the deploy (`exclude`) |
| `wrangler.toml` | Worker name, custom domains (`routes`), R2 binding, `CANONICAL_HOST` |

If you ever change the domain, update both files, then replace it in the pages:

```bash
grep -rl "https://shahinkhan.online" public | xargs sed -i 's#https://shahinkhan.online#https://NEW-DOMAIN#g'
```

`node build.mjs` refuses to build if a page's canonical URL doesn't match `site.config.json`, so a half-done change can't go live.

## One-time setup

### 1. Git and GitHub

The folder isn't a Git repository yet. Create a **private** GitHub repository, then:

```bash
git init -b main
git add .
git commit -m "Portfolio site"
git remote add origin git@github.com:Shahin992/<repo-name>.git
git push -u origin main
git checkout -b production
git push -u origin production
git checkout main
```

`.gitignore` already keeps `dist/`, `.env*` and `.wrangler/` out of the repository.

### 2. Cloudflare

1. **Domain:** `shahinkhan.online` must be in your Cloudflare account. Your other subdomains (the eight project sites such as `kestrel.shahinkhan.online`, and any others) are unaffected.
2. **Old DNS records:** delete any A, AAAA or CNAME record for `shahinkhan.online` and `www.shahinkhan.online` (**only those two names**). The Worker's custom domains create their own; the check step lists any that are still there.
3. **R2 bucket:** R2 Object Storage → **Create bucket** → name it `shahin-portfolio`, location **Automatic**. (If you skip this, the first run creates it.)
4. **R2 API token:** R2 → **Manage R2 API Tokens** → **Create API token** → permission **Object Read & Write**, applied to that bucket only. Copy the **Access Key ID** and **Secret Access Key** (the secret is shown once).
5. **Cloudflare API token for the Worker:** My Profile → API Tokens → **Create Token** → template **Edit Cloudflare Workers**. Set Account resources to your account and Zone resources to `shahinkhan.online`. If the first deploy says it can't add the custom domain, edit the token and add **Zone → DNS → Edit**.
6. **Account ID:** shown on the Workers & Pages and R2 overview pages (it's also the part after `dash.cloudflare.com/` in the address bar).
7. **AI crawlers:** under Security → Bots (and AI Crawl Control, where shown), keep **Block AI bots** and the **managed robots.txt** off. Otherwise Cloudflare blocks AI crawlers whatever the site's `robots.txt` says, which undoes the GEO work.

### 3. GitHub secrets

In the repository: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the Workers token from step 5 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 6 |
| `R2_ACCESS_KEY_ID` | from the R2 token (step 4) |
| `R2_SECRET_ACCESS_KEY` | from the R2 token (step 4) |

If one is missing or pasted with a stray space, the check step names it in the run's Annotations.

Optional: **Settings → Branches → Add rule** for `production`, so it only changes through merges.

## Each deploy

Work and commit on `main` (try it with `npm start`), then:

```bash
git checkout production
git merge main
git push
git checkout main
```

Or on GitHub: **Pull requests → New pull request**, base `production`, compare `main`, then **Merge**.

Follow the run under **Actions → Deploy portfolio (R2 + Worker)**. To run it again without a new commit: **Run workflow** on `production`.

When the run is green, check `https://shahinkhan.online`, a few pages, the dark/light toggle, `/robots.txt`, `/sitemap.xml` and `/llms.txt`.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Local site from `public/` on http://localhost:2026 (same URL rules and headers as the Worker) |
| `npm run build` | Builds `dist/` and runs every page check |
| `npm run preview` | Builds, then serves `dist/` exactly as production will |
| `npm run test:worker` | Builds, then runs the Worker against the build with an in-memory R2 |
| `npm run deploy:dry` | Shows which files would be uploaded |
| `npm run deploy:check` | Checks the Cloudflare setup (needs the four values in your environment) |
| `npm run deploy` | Builds, uploads to R2, deploys the Worker, pings IndexNow (from your own computer) |

## How the upload works

`tools/deploy.mjs` talks to R2's S3-compatible API (no npm packages):

- It sends only files whose content changed, compared with `_deploy/manifest.json` in the bucket (the Worker never serves that file).
- New CSS, JS and images go up before the HTML that uses them, so no visitor gets a page whose files aren't there yet.
- Files that disappeared are deleted a day later, because pages can stay in Cloudflare's edge cache for 5 minutes.

## How the Worker serves the site

- `/` → `index.html`, `/about` → `about/index.html`, files as they are.
- One address per page: `www.`, `.html`, `/index` and trailing slashes all 301 to the clean URL.
- HTML: `max-age=0, must-revalidate` for browsers, 5 minutes at the edge; fingerprinted CSS/JS: 1 year, immutable; images: 1 week.
- Security headers on every page: CSP (scripts limited to the site itself plus the one inline theme script by hash; fonts from Google Fonts), HSTS, `nosniff`, `X-Frame-Options: DENY`, Referrer and Permissions policies.
- Unknown URLs get the 404 page with status 404 and `noindex`.

If you ever change the small inline script in the page `<head>`, `node build.mjs` prints the new hash to put in `INLINE_SCRIPT_HASHES` (`worker/router.js`).

## Undo a bad deploy

```bash
git checkout production
git revert HEAD        # or the commit that broke it
git push
```

The workflow uploads the previous versions again. Files from the bad deploy are cleaned up a day later.

## Deploy from your own computer (optional)

Put the credentials in `.env.deploy` (ignored by git):

```
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=shahin-portfolio
```

Then:

```bash
npm run deploy:dry
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run deploy
```

## After the first deploy

1. **Google Search Console:** add `shahinkhan.online`, submit `https://shahinkhan.online/sitemap.xml`, request indexing for the main pages.
2. **Bing Webmaster Tools:** submit the sitemap. Bing's index feeds ChatGPT search and Copilot; IndexNow pings it on every deploy.
3. **Rich Results Test** and **validator.schema.org** on the home, about and case-study pages.
4. Add `https://shahinkhan.online` to your LinkedIn and GitHub profiles (see `SEO-STRATEGY.md`).
