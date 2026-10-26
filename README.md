# Revenu Ad Library

A free, public library of 544 high-performing B2B SaaS ad examples and landing-page templates, organised by formula.

Live at **[library.revenuagency.io](https://library.revenuagency.io)**.

## What's inside

Four libraries, each broken down by category:

- **LinkedIn Ads** — Problem · Product · Conversion · Conversation Ads · Gated Content · Animations · The Playbook
- **Google Ads** — Brand · Non Brand · Competitor · The Playbook
- **Landing Pages** — Above the Fold · Blocks · Product Visuals
- **ChatGPT Ads** — Playbook · Setup

Every ad has its own shareable URL (e.g. `/linkedin-ads/problem-1`) and opens in an in-page lightbox with prev/next, swipe, drag, favorites, search, and shuffle. A `/saved` route shows the user's favorited ads.

**Access is fully open — no sign-in, no gate.** Favorites are stored in the visitor's browser via `localStorage` only; there is no server, no database, and no auth anywhere in this project. (Earlier iterations had a client-side password gate and a planned LinkedIn OAuth flow — both are gone. If you see docs or links referencing a `?password=` param or `/admin`, they're stale.)

## Setup

None. This is a pure static site — no env vars, no database, no serverless functions. `api/ads.json` and `api/library.md` are generated static files, not endpoints.

## Local preview

Double-click `index.html`. The site uses a conditional `<base href="/">` so it works both in the browser via `file://` and on the live server — no terminal or local server needed.

## Add an ad

1. Drop the source file into the right folder, e.g. `images/LinkedIn Ads/Problem/My New Ad.webp`.
2. Convert to WebP if it isn't already (the runtime expects `.webp`).
3. Open `ads.js` and add an entry following the existing pattern:
   ```js
   {
     image: "My New Ad.webp",
     title: "Branded Notes",
     formula: "",
     tag: "Problem",
     category: "problem",
     platform: "linkedin"
   }
   ```
   **Append new entries at the end of their category block.** Ad URLs (`/linkedin-ads/problem-12`) are derived from entry order within each `(platform, category)` group — reordering existing entries silently changes every shared deep link after the insertion point.
4. Run `node scripts/build-seo.js` to regenerate `sitemap.xml`, `api/ads.json`, the LLM-friendly files, and all pre-rendered HTML pages.
5. Commit and push — Vercel auto-deploys.

## Remove an ad

Never delete an entry from `ads.js`: URL ids are positional, so deleting one renumbers every ad after it in that category and breaks shared links. Instead add `hidden: true` to the entry and run `node scripts/build-seo.js`. The ad disappears from the library (no card, no search, no saved entry, not in the sitemap or API files), its old URL returns 404, and every other ad keeps its number.

## Backfill formula labels

472 of the 544 ads currently have an empty `formula` field. `scripts/backfill-formulas.js` uses the Anthropic API (vision) to propose a formula label for every ad missing one:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node scripts/backfill-formulas.js            # writes proposals to scripts/formulas-proposed.json
node scripts/backfill-formulas.js --apply    # reviews applied: patches ads.js from the proposals file
```

It runs in two steps on purpose — propose first, review `formulas-proposed.json`, then `--apply`. Re-running skips ads that already have a proposal. After applying, run `node scripts/build-seo.js` and commit.

## Files at a glance

```
ad-library/
├── index.html              # SPA shell (root URL)
├── 404.html                # Vercel 404
├── styles.css
├── app.js                  # All runtime JS (no framework)
├── ads.js                  # The data — window.ADS = [...]
├── vercel.json             # Rewrites to per-URL HTML files
├── sitemap.xml             # Generated
├── robots.txt              # Allows all crawlers including AI bots
├── llms.txt / llms-full.txt# Generated — LLM-friendly site summaries
├── api/
│   ├── ads.json            # Generated — machine-readable library
│   └── library.md          # Generated — markdown index
├── google-ads.html, linkedin-ads.html, landing-pages.html, chatgpt.html  # Pre-rendered platform pages
├── google-ads/, linkedin-ads/, landing-pages/, chatgpt/                  # Pre-rendered per-category and per-ad
├── images/                 # WebP assets, organised by platform → category
├── favicon/
├── scripts/
│   ├── build-seo.js            # Regenerate SEO + LLM + pre-rendered HTML
│   ├── backfill-formulas.js    # AI-assisted formula labels for ads missing one
│   ├── smoke-test.js           # JSDOM checks on the built pages (node scripts/smoke-test.js)
│   └── build-og-images.py      # (Optional) Per-ad 1200×630 OG card composer — not wired into the build
└── BUILD-NOTES.md          # Full architectural reference — read this for anything non-trivial
```

## Full reference

For the deep dive — data model, URL routing, every feature, build pipeline, maintenance recipes, architectural decisions and rationale — see **[BUILD-NOTES.md](./BUILD-NOTES.md)**. Note: BUILD-NOTES sections describing the password gate are historical; the gate has been removed.

## Deploy

Push to GitHub → Vercel auto-builds → `library.revenuagency.io` updates within ~30 seconds. No build step at runtime; pre-rendered HTML and SEO files are generated locally via `node scripts/build-seo.js` before committing.
