// Checks the Cloudflare setup before a deploy and says in plain words what to fix. In GitHub Actions each
// problem also shows in the run's summary (Annotations), so nobody has to dig through logs.
// Creates the R2 bucket when it doesn't exist yet (the Workers token can do that).
//   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… node tools/check-cloudflare.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const wrangler = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
const HOST = new URL(config.siteUrl).host;
const ZONE = config.zone || HOST;
const TOML_BUCKET = (wrangler.match(/bucket_name\s*=\s*"([^"]+)"/) || [])[1];
const BUCKET = process.env.R2_BUCKET || TOML_BUCKET;
const { CLOUDFLARE_API_TOKEN: TOKEN = '', CLOUDFLARE_ACCOUNT_ID: ACCOUNT = '', R2_ACCESS_KEY_ID: KEY_ID = '', R2_SECRET_ACCESS_KEY: SECRET = '' } = process.env;

let problems = 0;
const CI = !!process.env.GITHUB_ACTIONS;
const say = (level, title, text) => {
  if (level === 'error') problems++;
  if (CI) console.log(`::${level} title=${title}::${text.replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
  else console.log(`${{ error: '✗', warning: '!', notice: '✓' }[level]} ${title}: ${text}`);
};
const ok = (text) => console.log(`✓ ${text}`);

async function cf(method, p, body) {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4${p}`, {
      method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = {};
    try { json = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, ok: res.ok && json.success !== false, json, why: (json.errors || []).map((e) => `${e.message} (code ${e.code})`).join('; ') || `HTTP ${res.status}` };
  } catch (e) {
    return { status: 0, ok: false, json: {}, why: e.message };
  }
}

// 0. The config files agree with each other
if (TOML_BUCKET && config.bucket && TOML_BUCKET !== config.bucket) say('error', 'Two different bucket names', `wrangler.toml says "${TOML_BUCKET}" but site.config.json says "${config.bucket}". Make them the same.`);
if (!wrangler.includes(`pattern = "${HOST}"`)) say('error', 'Domain mismatch', `site.config.json uses ${HOST} but wrangler.toml has no route for it. Update the routes and CANONICAL_HOST in wrangler.toml.`);

// 1. The four GitHub secrets are there and pasted cleanly
const secrets = { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, R2_ACCESS_KEY_ID: KEY_ID, R2_SECRET_ACCESS_KEY: SECRET };
for (const [name, value] of Object.entries(secrets)) {
  if (!value) say('error', `Secret ${name} is missing`, 'Add it in GitHub: Settings → Secrets and variables → Actions → New repository secret (see DEPLOY.md).');
  else if (value !== value.trim()) say('error', `Secret ${name} has a space or line break`, 'Edit the secret and paste the value again with nothing before or after it.');
}
if (ACCOUNT && !/^[0-9a-f]{32}$/.test(ACCOUNT.trim())) say('error', 'CLOUDFLARE_ACCOUNT_ID looks wrong', 'It should be the 32-character ID from your Cloudflare dashboard address (dash.cloudflare.com/<this part>/…).');
if (process.env.R2_BUCKET && TOML_BUCKET && process.env.R2_BUCKET !== TOML_BUCKET) say('error', 'Two different bucket names', `The GitHub variable R2_BUCKET is "${process.env.R2_BUCKET}" but wrangler.toml says "${TOML_BUCKET}". Make them the same.`);
if (problems) process.exit(1);

// 2. The Workers token is valid (user tokens and account tokens are checked in different places)
let verify = await cf('GET', '/user/tokens/verify');
if (!verify.ok) verify = await cf('GET', `/accounts/${ACCOUNT}/tokens/verify`);
if (!verify.ok || verify.json.result?.status !== 'active') {
  say('error', 'CLOUDFLARE_API_TOKEN is not accepted', `Cloudflare says: ${verify.why}. Create a token from the "Edit Cloudflare Workers" template (My Profile → API Tokens) and paste it into the GitHub secret CLOUDFLARE_API_TOKEN. The R2 token's Access Key ID or secret does not work here.`);
  process.exit(1);
}
ok('Workers token is valid and active');

// 3. The zone tells us which account really owns the domain, so a wrong CLOUDFLARE_ACCOUNT_ID can be told apart
//    from a token that lacks account access. Only the last 4 characters are printed: Actions logs on a public repo are public.
const zones = await cf('GET', `/zones?name=${ZONE}`);
const zone = zones.ok && zones.json.result?.[0];
const owner = zone?.account?.id || '';
const tail = (id) => `…${id.slice(-4)}`;
let accountIdWrong = false;
if (zone && ACCOUNT === zone.id) {
  accountIdWrong = true;
  say('error', 'CLOUDFLARE_ACCOUNT_ID is the Zone ID', `The secret holds the Zone ID of ${ZONE}. On the ${ZONE} Overview page, copy the Account ID (the line under Zone ID, ending ${tail(owner)}) and update the GitHub secret.`);
} else if (owner && owner !== ACCOUNT) {
  accountIdWrong = true;
  say('error', 'CLOUDFLARE_ACCOUNT_ID is not the account that owns the domain', `${ZONE} belongs to the account ending ${tail(owner)}, but the secret ends ${tail(ACCOUNT)}. Copy the Account ID from the ${ZONE} Overview page and update the GitHub secret.`);
} else if (owner) {
  ok(`CLOUDFLARE_ACCOUNT_ID matches the account that owns ${ZONE}`);
}

// 4. The token can reach the account and the Workers in it (skipped when the account ID itself is wrong)
if (!accountIdWrong) {
  const known = owner === ACCOUNT ? 'The account ID is right, so the token itself lacks account access: ' : 'Check CLOUDFLARE_ACCOUNT_ID, and ';
  const account = await cf('GET', `/accounts/${ACCOUNT}`);
  if (!account.ok) say('error', 'The token cannot see this account', `Cloudflare says: ${account.why}. ${known}in Cloudflare → My Profile → API Tokens → your token → Edit, add the "Edit Cloudflare Workers" policy with Account Resources → Include → your account.`);
  else ok('Token can see the account');
  const scripts = await cf('GET', `/accounts/${ACCOUNT}/workers/scripts`);
  if (!scripts.ok) say('error', 'The token cannot see Workers', `Cloudflare says: ${scripts.why}. The token needs Account → Workers Scripts → Edit; the "Edit Cloudflare Workers" policy has it.`);
  else ok('Token can see Workers (uploading needs Workers Scripts → Edit, not Read; the deploy step tests that)');
}

// 5. The token can use the zone, and nothing else is already using the hostnames
if (!zone) {
  say('error', `The token cannot use ${ZONE}`, `Cloudflare says: ${zones.ok ? 'zone not found for this token' : zones.why}. In the token's settings set Zone Resources to Include → Specific zone → ${ZONE}.`);
} else {
  ok(`Zone ${ZONE} (${zone.status})`);
  for (const name of [HOST, `www.${HOST}`]) {
    const recs = await cf('GET', `/zones/${zone.id}/dns_records?name=${name}`);
    if (!recs.ok) { say('warning', `Could not read DNS for ${name}`, `Cloudflare says: ${recs.why}. If the Worker deploy fails on the custom domain, add Zone → DNS → Edit to the token.`); continue; }
    const others = (recs.json.result || []).filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type) && !/worker/i.test(r.comment || '') && !r.meta?.read_only);
    if (others.length) say('error', `${name} still has a DNS record`, `Delete these in Cloudflare → ${ZONE} → DNS → Records, then re-run: ${others.map((r) => `${r.type} ${r.name} → ${r.content}`).join(', ')}. The Worker creates its own record for this name.`);
    else ok(`${name} is free for the Worker`);
  }
}

// 6. The R2 bucket exists (created here if not) and is in the default location the upload uses
let bucket = accountIdWrong ? { ok: false, status: -1 } : await cf('GET', `/accounts/${ACCOUNT}/r2/buckets/${BUCKET}`);
if (!bucket.ok && bucket.status === 404) {
  const made = await cf('POST', `/accounts/${ACCOUNT}/r2/buckets`, { name: BUCKET });
  if (made.ok) { say('notice', `Created the R2 bucket ${BUCKET}`, 'It did not exist yet, so this run made it.'); bucket = await cf('GET', `/accounts/${ACCOUNT}/r2/buckets/${BUCKET}`); }
  else say('error', `The R2 bucket ${BUCKET} does not exist`, `And this token can't create it (${made.why}). Create it yourself: R2 Object Storage → Create bucket → name "${BUCKET}", location Automatic.`);
}
if (bucket.ok) {
  const jurisdiction = bucket.json.result?.jurisdiction;
  if (jurisdiction && jurisdiction !== 'default') say('error', `Bucket ${BUCKET} is in the "${jurisdiction}" jurisdiction`, 'The upload uses the default R2 location. Delete it and create it again with location Automatic (no jurisdiction).');
  else ok(`R2 bucket ${BUCKET} is ready`);
} else if (bucket.status !== 404 && bucket.status !== -1) {
  say('warning', `Could not check the R2 bucket ${BUCKET}`, `Cloudflare says: ${bucket.why}. The upload step will try anyway; make sure the bucket exists.`);
}

if (problems) { console.log(`\n${problems} thing(s) to fix before the site can be published.`); process.exit(1); }
console.log('\nCloudflare setup looks right.');
