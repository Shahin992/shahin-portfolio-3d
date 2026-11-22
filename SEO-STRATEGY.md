# SEO · AEO · GEO strategy: Shahin Alam portfolio

How the site is built to rank in Google (SEO), get quoted in answer boxes and voice results (AEO), and get cited by AI assistants such as ChatGPT, Perplexity, Gemini and Claude (GEO).

> **Honest note on data:** I didn't have access to a keyword-volume tool (Ahrefs, Semrush, Keyword Planner). The keywords below are chosen from search intent, competition and what hiring teams search for. After launch, validate them with **Google Search Console → Performance → Queries** and adjust page copy toward the queries that actually bring impressions.

---

## 1. Keyword map

### Tier 1: Branded (you can realistically own #1)
A personal site wins its owner's name first. Every page reinforces this entity.

| Keyword | Target page |
|---|---|
| Shahin Alam | `/` (title, H1 name line, Person schema) |
| Shahin Alam software engineer | `/`, `/about` |
| Shahin Alam developer Dhaka | `/about`, `/contact` |
| Shahin Alam portfolio | `/` |
| Shahin Alam React developer | `/`, `/skills` |
| Shahin Alam Orangetoolz | `/experience` |

### Tier 2: Role + location (long tail, low competition, hiring intent)
| Keyword | Target page |
|---|---|
| software engineer in Dhaka | `/`, `/about` |
| React developer Bangladesh / React.js developer Dhaka | `/`, `/skills` |
| MERN stack developer Bangladesh | `/experience`, `/projects` |
| full stack developer Dhaka | `/about`, `/projects/cliento` |
| Next.js developer Bangladesh | `/skills` |
| Node.js developer Bangladesh | `/skills`, `/projects/cliento` |
| full-stack software engineer Dhaka | `/`, `/about` (the résumé's headline positioning) |
| NestJS developer Bangladesh | `/skills` |
| hire React / Node.js developer Bangladesh | `/contact` (title: "Hire a React & Node.js Developer") |

Market context from research: full-stack postings grew while pure "frontend" titles shrank, and "React developer" is fading as a title even though React is still the most requested skill. So the site leads with **"Software Engineer"** (the broadest, highest-volume title) and puts React and Node.js in titles and H1s as the skill qualifiers.

### Tier 3: Niche proof keywords (very low competition, high relevance)
Few portfolios mention these, so a hiring manager searching them can land on you.

| Keyword | Target page |
|---|---|
| Nylas integration developer / Nylas email calendar React | `/projects#integrations`, `/skills` |
| EZLynx integration / NowCerts integration developer | `/projects#integrations` |
| Zapier integration developer React | `/projects#integrations` |
| CRM developer React Node.js | `/projects`, `/projects/cliento` |
| Stripe subscription React Node.js | `/projects/cliento` |
| Gmail API CRM integration | `/projects/cliento` |
| GPT / OpenAI integration React developer | `/projects#ai-features` |
| Docker microservices Node.js developer | `/projects#integrations`, `/experience` |
| school management software Bangladesh (developer / founder) | `/projects/edufusion` |
| NestJS MongoDB BullMQ SaaS | `/projects/edufusion` |
| AI question paper generator NCTB | `/projects/edufusion` |
| self-hosted cold email platform / email warm-up engine | `/projects/coldmailer` |
| Next.js IMAP IDLE reply tracking | `/projects/coldmailer` |
| EduFusion · ColdMailer (product names) | their case-study pages |
| Cliento CRM | `/projects/cliento` |
| HVAC / plumbing website design | `/projects/kestrel` |
| therapy practice website design | `/projects/willowmere` |
| bespoke kitchen / furniture maker website | `/projects/ashcombe` |
| garment exporter website Bangladesh | `/projects/northbay` |
| Bangla travel agency website | `/projects/swapnojatra` |
| small-group tour website design | `/projects/fernway` |
| Hajj Umrah agency website (Bangla / English) | `/projects/almabrur`, `/projects/rihla` |

---

## 2. On-page SEO (implemented)

- **Clean, crawlable routes**, one canonical URL each (no trailing slash): `/`, `/about`, `/projects`, `/projects/cliento`, `/experience`, `/skills`, `/contact`. `/about/` and `/about.html` redirect with a 301.
- **Unique titles of 50–60 characters and meta descriptions of 140–160 characters** on every page. The generator refuses to build a page outside those limits.
- **One `<h1>` per page**, a logical H2/H3 outline, and semantic HTML (`header`, `nav`, `main`, `article`, `figure`, `dl`, `time`).
- **All content is real HTML text**, never rendered by JavaScript. The 3D scenes are decoration on `<canvas>`, and the 3D tag sphere moves real `<li>` text that crawlers can read.
- **Performance:** no frameworks and no 3D libraries; hand-written canvas runs only while visible. The portrait is served as WebP (29 KB) with a JPEG fallback and preloaded; fonts use `display=swap`. Above-the-fold text animates in with CSS only, so it never waits for JavaScript (good for LCP).
- **Canonical, Open Graph and Twitter cards** on every page, plus a 1200×630 share image with your photo.
- **`sitemap.xml`** with `lastmod` and image entries, **`robots.txt`** pointing to it, and a **404 page** that is `noindex`.
- **Image SEO:** descriptive filenames (`shahin-alam-portrait.webp`) and alt text ("Portrait of Shahin Alam, software engineer based in Dhaka, Bangladesh").

## 3. Structured data (JSON-LD, implemented)

Each page has one `@graph`, with nodes linked by `@id` so search engines see one consistent entity:

| Page | Schema types |
|---|---|
| `/` | WebSite, **Person (full)**, WebPage, FAQPage (5 Q&A) |
| `/about` | WebSite, Person (full), **ProfilePage**, BreadcrumbList, FAQPage (4) |
| `/projects` | WebSite, Person, CollectionPage, BreadcrumbList, **ItemList (18)** |
| `/projects/<website>` (8 pages) | WebSite, Person, WebPage, BreadcrumbList, FAQPage, a **WebSite** node for the website (`creator` → Person, `url` → its subdomain) |
| `/projects/cliento` | WebSite, Person, WebPage, BreadcrumbList, FAQPage (4), **SoftwareApplication**, 2× **SoftwareSourceCode** |
| `/experience` | WebSite, Person, WebPage, BreadcrumbList, FAQPage (3) |
| `/skills` | WebSite, Person, WebPage, BreadcrumbList, FAQPage (3) |
| `/contact` | WebSite, Person, **ContactPage**, BreadcrumbList |

The `Person` node includes `jobTitle`, `worksFor` (Orangetoolz), `alumniOf` (Mirpur College), `hasCredential`, `award`, `knowsAbout` (34 topics), `knowsLanguage`, `address`, `image`, and **`sameAs` → GitHub and LinkedIn** (the key field for entity resolution).

Validate after deploy: [Rich Results Test](https://search.google.com/test/rich-results) and [validator.schema.org](https://validator.schema.org/).

> FAQ rich results have been limited to government and health sites since 2023, so don't expect FAQ dropdowns in Google. The FAQ markup and visible Q&A are there for answer engines and LLMs, which do parse them.

## 4. AEO: Answer Engine Optimization (implemented)

- **Answer-first sentences** in a quotable form: "Shahin Alam is a software engineer based in Mirpur, Dhaka, Bangladesh…" (About "In short" box, home FAQ, `llms.txt`).
- **Question-shaped headings** that match real queries: *Who is Shahin Alam? · What technologies does Shahin Alam work with? · Is Shahin Alam a frontend or a full-stack developer?*
- **Key facts as definition lists** (`<dl>`): role, location, employer, experience and stack are easy to extract.
- **Visible "Last updated" date** in every footer, matching `dateModified` in schema (a freshness signal).

## 5. GEO: Generative Engine Optimization (implemented)

- **`robots.txt` explicitly allows AI crawlers:** GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot(-Extended), Bingbot, DuckAssistBot, meta-externalagent, Amazonbot, MistralAI-User, CCBot.
- **`/llms.txt`**: a curated summary with key facts and links. Adoption by AI crawlers is still low and unproven, but it costs nothing.
- **Facts, not adjectives.** Every claim is concrete and comes from your résumé (20% faster loads, 40% less content time, Q3 2024 award), which is what AI tools quote.
- **Entity consistency:** the same name, title, location and links everywhere. Keep LinkedIn and GitHub saying the same thing (see below).

---

## 6. Off-site checklist (the biggest lever for a personal site)

1. **Deploy to Cloudflare** (`DEPLOY.md`) and keep `shahinkhan.online` as the canonical domain forever.
2. **Google Search Console:** verify the domain, submit `/sitemap.xml`, request indexing for the main URLs (17 in the sitemap).
3. **Bing Webmaster Tools:** submit the sitemap. Bing's index powers ChatGPT search and Copilot, so this matters for GEO.
4. **LinkedIn:** put the site URL in *Contact info* and *Featured*. Match the headline to the site ("Software Engineer · React, Next.js, Node.js · Dhaka").
5. **GitHub:** add the site URL to your profile and pin **Cliento** and **Cliento-server**. Each README should link to `/projects/cliento`.
6. **Write one article** (dev.to or Hashnode) on "How I built a CRM with Stripe subscriptions and the Gmail API", with a canonical link to the case study. This earns your first backlinks.
7. **Keep it fresh:** add a project or update the experience section every few months, and update `UPDATED`, `lastmod` and the footer date.

## 7. Before you deploy, check these

- [x] Domain set to `https://shahinkhan.online` everywhere (canonical URLs, sitemap, structured data, `llms.txt`); deployment in `DEPLOY.md`.
- [ ] Confirm the LinkedIn URL. The résumé says `linkedin.com/in/shahin983` while GitHub is `Shahin992`; check it isn't a typo.
- [x] Years of experience: the site now uses **"2.5+ years"** everywhere, matching the updated résumé.
- [ ] Optional: remove the phone number from `/contact` if you don't want it public.

---

### Research sources
- Developer portfolio structure: [Scrimba](https://scrimba.com/articles/how-to-build-a-web-developer-portfolio-that-gets-you-hired), [BrainStation](https://brainstation.io/career-guides/how-to-build-a-software-engineer-portfolio), [Hyperskill](https://hyperskill.org/blog/post/building-a-developer-portfolio-in-2026-what-actually-gets-attention)
- Title and demand trends: [GreatFrontEnd: frontend vs full-stack](https://www.greatfrontend.com/blog/frontend-vs-fullstack-developer), [GreatFrontEnd: demand check](https://www.greatfrontend.com/blog/frontend-developer-demand-a-job-market-reality-check), [Standout: React engineers 2026](https://standout.work/blog/react-engineers-2026)
- AEO and schema: [Google ProfilePage docs](https://developers.google.com/search/docs/appearance/structured-data/profile-page), [HubSpot: schema for AEO](https://blog.hubspot.com/marketing/schema-markup-aeo), [Ahrefs: technical AEO](https://ahrefs.com/aeo/technical-aeo)
- GEO and AI crawlers: [Search Engine Journal crawler list](https://www.searchenginejournal.com/ai-crawler-user-agents-list/558130/), [Momentic: AI bots (Oct 2026)](https://momenticmarketing.com/blog/ai-search-crawlers-bots), [dev.to: getting a developer site cited by AI](https://dev.to/moksh/how-to-get-your-developer-site-cited-by-ai-search-engines-in-2026-12ga)
