# Revenu Ad Library — Build Notes

Comprehensive reference for the Revenu Ad Library at https://library.revenuagency.io — what it is, how it works, every architectural decision, and how to maintain it.

This document was generated at the end of a long, iterative build session. It supersedes any one-off chat reference: anything that lives here is the durable source of truth.

---

## What this is

A free, public library of high-performing B2B SaaS ad examples and landing-page templates, curated and built by Revenu Agency. As of writing: **544 ads** across four libraries:

- **LinkedIn Ads** — Problem, Product, Conversion, Conversation Ads, Gated Content, GIFs, The Playbook
- **Google Ads** — Brand, Non Brand, Competitor, The Playbook
- **Landing Pages** — Above the Fold, Blocks, Product Visuals
- **ChatGPT Ads** — Playbook, Setup (route: `/chatgpt`)

Each ad lives at its own shareable URL (e.g. `/linkedin-ads/problem-1`) and opens in an in-page lightbox preview with swipe/drag/click navigation, favorites, shuffle, search, and a Tinder-style mobile drag. A `/saved` route lists the visitor's favorited ads.

The whole site is fully open — no password, no sign-in. (A `fox` password gate existed in earlier versions and has been removed; see "Password gate — REMOVED" below.)

---

## Live URLs

- **Production**: https://library.revenuagency.io
- **Source of truth**: the Git repo deployed to Vercel (auto-deploy on `git push`)
- **Sitemap**: https://library.revenuagency.io/sitemap.xml
- **Machine-readable index**: https://library.revenuagency.io/api/ads.json
- **LLM index**: https://library.revenuagency.io/llms.txt and `/llms-full.txt`

---

## Tech stack

Intentionally minimal — no framework, no build step required for the runtime app, no server-side code.

- **HTML** — `index.html` is the SPA shell; 522 pre-rendered HTML files (one per URL) hold per-page meta + JSON-LD
- **CSS** — single `styles.css`, no preprocessor
- **JS** — single `app.js`, vanilla, no dependencies
- **Data** — `ads.js` exposes `window.ADS = [...]`
- **Hosting** — Vercel static deploy via GitHub
- **Image format** — WebP (both static and animated)

Build steps exist only for SEO/LLM/pre-rendered files (`scripts/build-seo.js`), and optionally for OG images (`scripts/build-og-images.py`). The runtime app needs none of this — `ads.js` + `app.js` + `styles.css` are enough.

---

## File structure

```
ad-library/
├── index.html              # SPA shell (root URL)
├── 404.html                # Vercel 404 page (mirror of index.html shell)
├── styles.css              # All site styles
├── app.js                  # All runtime JS (3000+ lines)
├── ads.js                  # The data — window.ADS = [...]
├── vercel.json             # Rewrites for clean URLs
├── robots.txt              # Allows all crawlers including GPTBot/ClaudeBot/etc.
├── sitemap.xml             # 524 URLs — generated
├── llms.txt                # Short LLM site summary — generated
├── llms-full.txt           # Full LLM index — generated
├── BUILD-NOTES.md          # This file
│
├── google-ads.html         # Pre-rendered platform page
├── linkedin-ads.html       # Pre-rendered platform page
├── landing-pages.html      # Pre-rendered platform page
├── google-ads/             # Per-category and per-ad pre-rendered HTML
│   ├── all.html, brand.html, competitor.html, non-brand.html, playbook.html
│   └── brand-1.html, brand-2.html, ..., competitor-69.html, etc.
├── linkedin-ads/           # Same layout
├── landing-pages/          # Same layout
│
├── api/
│   ├── ads.json            # Generated — full library as JSON
│   └── library.md          # Generated — markdown index
│
├── images/
│   ├── Google Ads/
│   │   ├── Brand/          # Brand 1.webp, ..., P1 - brand name.webp, ...
│   │   ├── Non Brand/
│   │   ├── Competitor/
│   │   └── The Playbook/
│   ├── LinkedIn Ads/
│   │   ├── Problem/
│   │   ├── Product/
│   │   ├── Conversion/
│   │   ├── Conversation Ads/
│   │   ├── Gated Content/
│   │   ├── Animations/     # Animated WebPs (GIFs converted)
│   │   └── The Playbook/
│   └── Landing Pages/
│       ├── Above the Fold/
│       ├── Blocks/
│       └── Product Visuals/
│
├── favicon/                # All favicons + Apple touch icons
│
└── scripts/
    ├── build-seo.js        # Regenerates sitemap, llms.txt, ads.json, pre-rendered HTML
    └── build-og-images.py  # (Optional) Per-ad 1200×630 OG composite images
```

---

## Data model — `ads.js`

The entire library is a JS array on `window.ADS`. Each entry is a plain object:

```js
{
  image: "Problem 1.webp",        // filename, lives in images/<platform>/<category>/
  title: "Mascot Message",         // shown on the card
  formula: "",                     // shown under title; often empty
  tag: "Problem",                  // visible chip on the card
  category: "problem",             // matches a tab key
  platform: "linkedin",            // optional, defaults to "google"
  priority: { problem: 1, all: 1 } // optional — see "Priority pinning" below
}
```

### IDs are runtime-assigned

There is no explicit `id` field in `ads.js`. On every page load, `app.js` assigns a per-`(platform, category)` sequential 1-based ID:

```js
const _idCounters = {};
allAds.forEach(ad => {
  const key = `${ad.platform || 'google'}|${ad.category}`;
  _idCounters[key] = (_idCounters[key] || 0) + 1;
  ad.id = _idCounters[key];
});
```

This means **the order of entries in `ads.js` determines the URL of each ad**. The first LinkedIn Problem entry becomes `/linkedin-ads/problem-1`, the second is `problem-2`, etc. Don't reorder existing entries without intent — it changes shareable URLs.

### Priority pinning (`priority: { categoryKey: position }`)

An ad's `priority` object lets it appear in multiple categories AND control its position within each.

- `category: 'animations'` + `priority: { product: 5 }` → ad's primary home is the Animations tab; it ALSO appears in the Product tab at position 5.
- `category: 'problem'` + `priority: { problem: 1, all: 1 }` → primary problem ad, locked to position 1 in both Problem and All views.

`Infinity` (effectively: no priority set for that category) means the ad sorts to the bottom of that view in natural ads.js order. Sort is stable — non-priority ads keep their ads.js order.

Examples currently in the library:

- LinkedIn animations are pinned into other categories (Wheel of Fortune → top of Product, Gift Card → top of Conversion, etc.)
- Question Animated (Landing) is pinned to top of Above the Fold and the All view
- Google formulas (P1 - Brand Name etc.) take positions 1–20 of the Google All view, mixed across Brand/Non-Brand/Competitor/Playbook

---

## URL routing

Three flavors:

| URL pattern | What it loads |
|---|---|
| `/` | SPA root — shows password gate if not unlocked; otherwise LinkedIn library |
| `/<platform>` | e.g. `/linkedin-ads` — shows the All view for that platform |
| `/<platform>/<category>` | e.g. `/linkedin-ads/problem` — shows that tab |
| `/<platform>/<category>-<id>` | e.g. `/linkedin-ads/problem-1` — opens ad #1 in the lightbox |

Where `<platform>` is `google-ads`, `linkedin-ads`, or `landing-pages`.

**Default tab is `all`** for every platform — visiting `/linkedin-ads` lands on the All view.

### Parsing

`parsePath()` in `app.js` regex-matches the pathname:

```js
/^\/(google-ads|linkedin-ads|landing-pages)(?:\/(.+))?$/
```

Then splits the second capture group as `<category>-<id>` using a greedy `^(.+)-(\d+)$` so multi-hyphen categories (`convo-ads`, `gated-content`, `above-the-fold`, `product-visuals`) still parse correctly.

### Vercel rewrites

`vercel.json`:

```json
{
  "rewrites": [
    { "source": "/google-ads",        "destination": "/google-ads.html" },
    { "source": "/linkedin-ads",      "destination": "/linkedin-ads.html" },
    { "source": "/landing-pages",     "destination": "/landing-pages.html" },
    { "source": "/google-ads/:rest",    "destination": "/google-ads/:rest.html" },
    { "source": "/linkedin-ads/:rest",  "destination": "/linkedin-ads/:rest.html" },
    { "source": "/landing-pages/:rest", "destination": "/landing-pages/:rest.html" }
  ]
}
```

Each URL serves its pre-rendered HTML file. Invalid URLs (e.g., `/linkedin-ads/random`) hit no matching file and return 404 (Vercel serves `404.html` as the body, which still hydrates the SPA — degraded but functional).

### Asset path resolution trick

Every HTML file has this inline at the top of `<head>`:

```html
<script>
  if (location.protocol !== 'file:') document.write('<base href="/">');
</script>
```

This injects `<base href="/">` on Vercel so relative paths (`href="styles.css"`, `src="ads.js"`, image paths) all resolve from the site root no matter how nested the URL is. On `file://` (when you double-click `index.html` locally) the script skips, and relative paths resolve from the file's directory like normal. Both contexts work.

### Per-page meta and JSON-LD

Each pre-rendered HTML has its own:

- `<title>` (e.g., "Mascot Message — Problem LinkedIn Ads example | Revenu")
- `<meta name="description">` with the ad name, category, and platform
- `<link rel="canonical">` pointing to the canonical URL
- `<meta property="og:image">` pointing to the ad's webp (so social shares show the actual ad)
- `<meta property="og:title">`, `og:description`, `og:url`
- `<meta name="twitter:card content="summary_large_image">` and matching twitter tags
- Static `<script type="application/ld+json">` with Organization + WebSite schema
- Dynamic `<script type="application/ld+json" id="page-jsonld">` with ImageObject (for ad pages) or CollectionPage (for category/platform pages), plus BreadcrumbList

When you navigate via JS (clicking pills/tabs/cards), `app.js` updates these in place via `updateSEOTags()` so even SPA navigation keeps the meta accurate.

---

## Features

### Gallery

- **Cards** are CSS Grid (1/2/3 columns on desktop, 1/2 on mobile via toggle).
- **Card pop-in animation** on first 6 cards on initial load and platform switch (NOT on category switch or shuffle, by user request). The animation only animates scale + translate — no opacity tween — so cards can never be permanently hidden by a stuck animation.
- **Landing-page cards crop to their image's natural aspect ratio** via `aspect-ratio: auto` and `height: auto`, because landing-page screenshots have varied dimensions. Other platforms use a fixed slide aspect.
- **`align-items: start`** on the gallery so cards in a row don't stretch to match the tallest sibling.

### Lightbox

- Click a card or open a deep-link URL.
- **Desktop**: Prev/Next arrow buttons + arrow keys, OR drag the image with the mouse (Tinder-style), OR click the image to advance.
- **Mobile**: Side buttons hidden. Swipe left/right on the image to navigate, OR tap to advance forward. The image follows the finger horizontally with rotation + opacity falloff like Tinder; release past 80px commits the swipe, otherwise springs back.
- Deep-link entrance: library renders, ~400ms pause, then the image slides in from off-screen left with a cubic-bezier overshoot.
- **Sequence counter** (`navSeq`) prevents race conditions when you mash buttons or swipe rapidly.
- **Step (`prev/next`) is fully synchronous** — no async, no awaits, instant src swap. Earlier versions used `await lbImage.decode()` which deadlocked on animated WebPs; that's been removed.
- **Open uses `Promise.race` with a 400ms timeout** so animated WebPs can't hang the open.
- URLs update via `pushState` on open, `replaceState` on step, `replaceState` to platform/category on close. Back/forward buttons fully reproduce platform + category + lightbox state via the `popstate` handler.

### Filters (top of the sticky filter bar)

- **Category tabs** (desktop) / **Category dropdown** (mobile)
- **Shuffle button** (desktop) — Fisher-Yates randomizes the active view. Overrides priority pinning intentionally — pinned ads shuffle with everyone else.
- **Search button** (desktop only) — magnifying glass; click expands an inline input that filters title/formula/tag/image. Enter applies the filter and collapses back to the icon; a small accent dot indicates an active filter.
- **Favorites filter** (heart icon, desktop only) — toggles "show only favorited ads". State is **per-platform** — switching to a different library clears the visual filter, returning preserves it. Auto-releases when you switch to a category with zero favorites (so you don't stare at an empty gallery).
- **Column toggle** (desktop: 1/2/3, mobile: 1/2) — preference saved in `localStorage` under `ad-library-cols`.

### Favorites (per-card hearts)

- Each card has a small heart in the bottom-right (desktop only).
- Click toggles favorite, persists to `localStorage` under `ad-library-favorites` (set of `platform|category|id` strings).
- The toggle is independent of the favorites filter button.

### Password gate — REMOVED

> **The password gate no longer exists.** The site is fully open by design — anyone can browse without signing in or entering anything, and favorites are localStorage-only. The `fox` password, `ad-library-access` unlock state, blur/entrance/success sequences described in earlier versions of this doc were all removed from `app.js`, `index.html`, and `styles.css`. If you find a link elsewhere with `?password=fox`, the param is harmlessly ignored — strip it.

### Shuffle and pinning interaction

- Priority pinning controls the *default* order in each view.
- Shuffle bypasses all priority and randomizes pure-Fisher-Yates.
- Switching categories/platforms re-applies priority (so leaving and returning to a category resets the order).

### Animated WebPs

- Six animation entries in `images/LinkedIn Ads/Animations/` are animated WebPs (originally GIFs).
- Built via `ffmpeg -i source.gif -loop 0 -lossless 0 -q:v 70 output.webp`.
- For oversize animations, re-encode with Pillow (Python) — Pillow's animated-WebP output is more browser-compatible than ffmpeg's:
  ```python
  frames[0].save(out, 'WEBP', save_all=True, append_images=frames[1:],
                 duration=70, loop=0, quality=70, method=4)
  ```

---

## Build pipeline

### `node scripts/build-seo.js`

Run after editing `ads.js`. Regenerates:

- `sitemap.xml` — every URL with lastmod + priority
- `api/ads.json` — full library as machine-readable JSON
- `llms.txt` + `llms-full.txt` — LLM-friendly site summaries (https://llmstxt.org)
- `api/library.md` — markdown index
- **Pre-rendered HTML files** — one for each URL, generated from `index.html` as a template with per-URL meta + JSON-LD swapped in

The script loads `ads.js` via `eval` against a faked `global.window` and uses the same per-category ID assignment as the runtime app, so generated IDs match exactly.

### `python3 scripts/build-og-images.py` (optional)

Composes 1200×630 PNG OG images per ad (ad image fit-centered with Revenu branding overlay). Output: `og/<platform>/<category>-<id>.png`.

Currently NOT in the build flow — each pre-rendered HTML's `og:image` points directly at the ad's webp, which all major social platforms (LinkedIn, Slack, Twitter, Facebook) render correctly. If you ever want branded OG cards, run this script and update the build-seo.js `ogImage` logic to point at the composed PNGs instead.

---

## Maintenance — common tasks

### Add a new ad

1. Drop the source file (PNG, PDF, or GIF) into the right `images/<Platform>/<Category>/` folder.
2. Convert to WebP:
   - **PNG → WebP**: Python + Pillow, `quality=82, method=4`
   - **GIF → animated WebP**: ffmpeg with `-loop 0 -lossless 0 -q:v 70`
   - **PDF page → WebP**: `pdftoppm -png -r 150 in.pdf out` then PIL save as WebP
3. Delete the source file.
4. Add an entry to `ads.js` matching the section's existing convention.
5. `node scripts/build-seo.js`
6. `git add -A && git commit && git push`

### Change the password

`app.js`, search for `const PASSWORD = 'fox';` near the top. Replace the value. Push.

### Change ordering in the "All" view

Update `priority: { all: N }` on any ad. Lower N = higher in the list. After changes:

1. `node scripts/build-seo.js` (rebuilds pre-rendered HTML in case meta references the ordering)
2. Commit and push.

### Add a new category to a platform

1. Add the tab to `platforms[<key>].tabs` in `app.js`:
   ```js
   { key: 'my-category', label: 'My Category', folder: 'My Category' }
   ```
2. Mirror the same entry in `scripts/build-seo.js` `PLATFORMS` config.
3. Create the folder under `images/<Platform>/My Category/`.
4. Add `ads.js` entries with `category: 'my-category'`.
5. `node scripts/build-seo.js` + push.

### Add a new platform

More involved — would need updates to `platforms` config, URL routing maps (`PATH_TO_PLATFORM`, `PLATFORM_TO_PATH`), Vercel rewrites in `vercel.json`, and the build script's `PLATFORMS` config. Defer until needed.

### Regenerate the favicon

Source at `_favicon_source/` (gitignored). Use ImageMagick:

```bash
convert source.png -resize 32x32 favicon/favicon-32.png
convert source.png -resize 180x180 favicon/favicon-180.png
convert source.png -resize 192x192 favicon/favicon-192.png
convert source.png -resize 32x32 favicon/favicon.ico
```

---

## Key architectural decisions and rationale

### 1. No framework, no build step for runtime
Build steps fail. Frameworks churn. A 503-ad static library should load in under a second and run in any browser. The whole runtime is `index.html` + `styles.css` + `app.js` + `ads.js`. The pre-render and SEO generation are offline build steps, not runtime dependencies.

### 2. Pre-rendered HTML per URL
Search crawlers and LLM crawlers still struggle with JS-rendered content despite improvements. Each URL having its own static HTML with baked-in title, description, canonical, and JSON-LD is what makes the library discoverable. The SPA hydrates on top — best of both.

### 3. Per-category, runtime-assigned IDs
Earlier versions used per-platform IDs (`/linkedin-ads-5`). Switched to per-category (`/linkedin-ads/problem-5`) per user feedback — categories are how marketers actually browse. IDs are runtime-assigned to keep `ads.js` simple (no manual ID tracking when adding entries).

### 4. Priority system instead of reordering
Hardcoding card order in `ads.js` would mean moving entries around every time the user wants a different opening view. The priority system lets a single entry declare its position across multiple views — cleaner, lower-risk edits.

### 5. Synchronous `step()` in the lightbox
An earlier async version using `await lbImage.decode()` deadlocked on animated WebPs. Decode can hang indefinitely on some image types in some browsers, and the await trap left the lightbox in a stuck state. Pure synchronous src swap can't deadlock; worst case is a tiny flash if the next image isn't preloaded yet — and `preloadNeighbors()` warms prev/next on every navigation, so it almost never is.

### 6. Card animation only animates transform, not opacity
Earlier the pop-in animation tweened opacity 0 → 1. If the animation ever failed to trigger (browser quirk, prefers-reduced-motion edge case), cards stayed permanently invisible. Removed the opacity tween — the worst case is now "no animation, cards just appear", which is fine.

### 7. `<base href="/">` only on non-file://
For the user (a marketer, not a dev), being able to double-click `index.html` and have it work locally was a requirement. Conditional injection of `<base href="/">` makes both contexts work.

### 8. localStorage for state, no backend
Favorites, unlock state, column preferences all live in localStorage. No login, no database, no API. Pure static site — Vercel CDN handles the entire load.

### 9. WebP for everything
PNG → WebP at quality 82 method 4 typically gives 60-80% file size reduction with imperceptible quality loss. Animated WebP for GIFs gets similar ratios.

### 10. Honor `hidden` attribute explicitly
A subtle CSS bug: `.password-gate-card { display: flex }` overrides the HTML `hidden` attribute, so the success card initially rendered next to the form. Fixed with an explicit `.password-gate-card[hidden] { display: none; }` rule. Lesson: any class that sets `display: <not-none>` needs a matching `[hidden] { display: none; }` companion.

---

## Outstanding ideas (not yet built)

In rough priority order:

1. **Dynamic OG images via `@vercel/og`** — pre-rendered HTML uses ad webps as og:image. For branded preview cards (ad + Revenu logo + title), use either pre-generated PNGs via `build-og-images.py`, or `@vercel/og` edge functions. Each first request renders, then CDN-caches.

2. **Per-formula explainer pages** — `/formulas/mascot-message` style pages with 500+ words on each technique. This is the long-tail SEO play.

3. **Blog at `/blog`** — weekly posts about what's working in B2B ads. Drives long-tail traffic.

4. **Submit to design galleries** — LandBook, OnePageLove, SaaSPages, SaaSLanding, Refind. Backlinks + referral traffic.

5. **Product Hunt launch** — when the library reaches a milestone (e.g., 1000 ads).

6. **OCR cleanup for existing batch entries** — the LinkedIn Problem/Gated/Conversion batches got OCR'd formula labels; a few are imperfect (`Reconcil`, empty, etc.) and could be manually polished.

7. **Per-industry tags** — re-tag ads by industry (SaaS, B2B, dev tools, fintech) and add an industry filter.

8. **Embed widget** — let other sites `<iframe>` specific ads. Each embed = a backlink.

9. **Newsletter signup** — capture interest, build an audience.

10. **"Save as PDF / export" button** — let users download their favorites as a PDF.

---

## Deployment

- **Repo**: GitHub (private repo owned by the user)
- **Hosting**: Vercel — connected to the GitHub repo. Every `git push` triggers an auto-deploy. Build takes ~30 seconds.
- **Domain**: `library.revenuagency.io` configured as a Vercel custom domain with DNS pointing to Vercel's nameservers.
- **HTTPS**: automatic via Vercel.

### When something seems broken in production

1. Check Vercel deploy status — did the latest push deploy?
2. Hard refresh the browser (Cmd+Shift+R / Ctrl+Shift+R) — `app.js` and `styles.css` are heavily cached.
3. Open DevTools → Console — runtime errors will show there.
4. Check `vercel.json` rewrites match the URL pattern you're testing.

---

## Glossary of names

- **Revenu** — the agency
- **The library** — this product (the Revenu Ad Library)
- **Platform** — one of `google`, `linkedin`, `landing`
- **Category** — a sub-grouping within a platform (`problem`, `non-brand`, `above-the-fold`, etc.)
- **Formula** — the named technique/pattern an ad demonstrates ("Mascot Message", "Pop Culture Meme"). Either explicit in `ads.js` or derived from OCR.
- **All view** — the `/<platform>/all` URL showing every ad in a platform across categories
- **Priority** — the `priority: { categoryKey: N }` field on an ad, used to control its position within a view
- **Pinned to top** — an ad with a low `priority` value in a category, appearing near the top of that view
- **Lightbox** — the full-screen preview overlay that appears when you click a card
- **Deep link** — a URL that goes straight to a specific ad, e.g. `/linkedin-ads/problem-3`
- **Gate** — the password screen at the root URL
- **Shuffle** — the refresh/dice button that randomizes the gallery order
- **Step** — moving prev/next within the lightbox (function name in `app.js`)
- **Commit swipe** — the act of swiping past the threshold to actually navigate to the next/prev ad
