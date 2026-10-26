#!/usr/bin/env node
/**
 * Regenerates SEO + LLM-friendly files from ads.js
 *
 *   sitemap.xml         — every URL on the site (root, platforms, categories, individual ads)
 *   api/ads.json        — full library as JSON
 *   api/library.md      — full library as a crawlable markdown index
 *   llms.txt            — short site summary (https://llmstxt.org standard)
 *   llms-full.txt       — every ad in plain text for LLM indexing
 *
 * Run after editing ads.js:
 *   node scripts/build-seo.js
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://library.revenuagency.io';
const REPO_ROOT = path.join(__dirname, '..');

// Mirror app.js' platform config (kept in sync manually — verify on changes).
const PLATFORMS = {
  linkedin: {
    path: '/linkedin-ads',
    label: 'LinkedIn Ads',
    defaultTab: 'all',
    folder: 'LinkedIn Ads',
    tabs: [
      { key: 'all',           label: 'All',           folder: '' },
      { key: 'problem',       label: 'Problem',       folder: 'Problem' },
      { key: 'product',       label: 'Product',       folder: 'Product' },
      { key: 'conversion',    label: 'Conversion',    folder: 'Conversion' },
      { key: 'convo-ads',     label: 'Conversation Ads',     folder: 'Conversation Ads', shortLabel: 'Convo Ads' },
      { key: 'gated-content', label: 'Gated Content', folder: 'Gated Content' },
      { key: 'playbook',      label: 'The Playbook',  folder: 'The Playbook' },
      { key: 'animations',    label: 'Animations',    folder: 'Animations' },
    ],
  },
  google: {
    path: '/google-ads',
    label: 'Google Ads',
    defaultTab: 'all',
    folder: 'Google Ads',
    tabs: [
      { key: 'all',         label: 'All',          folder: '' },
      { key: 'brand',       label: 'Brand',        folder: 'Brand' },
      { key: 'non-brand',   label: 'Non Brand',    folder: 'Non Brand' },
      { key: 'competitor',  label: 'Competitor',   folder: 'Competitor' },
      { key: 'playbook',    label: 'The Playbook', folder: 'The Playbook' },
    ],
  },
  landing: {
    path: '/landing-pages',
    label: 'Landing Pages',
    defaultTab: 'all',
    folder: 'Landing Pages',
    tabs: [
      { key: 'all',              label: 'All',              folder: '' },
      { key: 'above-the-fold',   label: 'Above the Fold',   folder: 'Above the Fold' },
      { key: 'blocks',           label: 'Blocks',           folder: 'Blocks' },
      { key: 'product-visuals',  label: 'Product Visuals',  folder: 'Product Visuals' },
    ],
  },
  chatgpt: {
    path: '/chatgpt',
    label: 'ChatGPT Ads',
    defaultTab: 'all',
    folder: 'ChatGPT Ads',
    tabs: [
      { key: 'all',      label: 'All',          folder: '' },
      { key: 'playbook', label: 'The Playbook', folder: 'Playbook' },
      { key: 'formulas', label: 'Formulas',     folder: 'Formulas' },
      { key: 'setup',    label: 'The Setup',    folder: 'Setup' },
    ],
  },
};

// Load ads.js by faking `window` then evaluating the file in this scope.
global.window = {};
const adsSource = fs.readFileSync(path.join(REPO_ROOT, 'ads.js'), 'utf8');
// eslint-disable-next-line no-eval
eval(adsSource);
const rawAds = global.window.ADS;
if (!Array.isArray(rawAds)) { console.error('ads.js did not set window.ADS'); process.exit(1); }

// Assign per-category IDs the same way app.js does at runtime (hidden ads included,
// so ids never shift when an ad is removed).
const idCounters = {};
for (const ad of rawAds) {
  const p = ad.platform || 'google';
  const k = `${p}|${ad.category}`;
  idCounters[k] = (idCounters[k] || 0) + 1;
  ad.id = idCounters[k];
}
// Hidden ads keep their slot but are left out of everything generated below.
const hiddenAds = rawAds.filter(ad => ad.hidden);
const ads = rawAds.filter(ad => !ad.hidden);

// Tabs that actually have content in this build (so we don't list empty pages)
const categoriesByPlatform = {};
for (const ad of ads) {
  const p = ad.platform || 'google';
  if (!categoriesByPlatform[p]) categoriesByPlatform[p] = new Set();
  categoriesByPlatform[p].add(ad.category);
}

// ----- sitemap.xml (with image extension) -----
// In addition to <loc>/<lastmod>/<priority>, each per-ad URL now carries an
// <image:image> block so Google Image search indexes all 540+ creative
// assets. The image extension namespace is declared on the root <urlset>.

// Helper to build the full image URL for an ad — mirrors the JSON API path
// resolver below so we never get out of sync.
function imageUrlFor(ad) {
  const cfg = PLATFORMS[ad.platform || 'google'];
  const catFolder = (cfg.tabs.find(t => t.key === ad.category) || {}).folder || '';
  // Path segments may contain spaces (e.g. "LinkedIn Ads") — encode each one.
  const segs = ['/images', cfg.folder, catFolder, ad.image].filter(Boolean);
  return BASE_URL + segs.map(s => encodeURIComponent(s)).join('/').replace('%2F', '/');
}

// Index each ad by its URL so we can attach image data when emitting the URL block.
const adImageByUrl = new Map();
for (const ad of ads) {
  const url = BASE_URL + PLATFORMS[ad.platform || 'google'].path + '/' + ad.category + '-' + ad.id;
  const cfg = PLATFORMS[ad.platform || 'google'];
  const catLabel = (cfg.tabs.find(t => t.key === ad.category) || {}).label || ad.category;
  adImageByUrl.set(url, {
    loc: imageUrlFor(ad),
    title: `${ad.title} — ${catLabel} ${cfg.label} example`,
    caption: ad.formula || `${ad.title}: a ${catLabel.toLowerCase()} ${cfg.label.toLowerCase()} example from the Revenu Ad Library.`,
  });
}

const urls = new Set();
urls.add(BASE_URL + '/');
for (const platform of Object.keys(PLATFORMS)) {
  urls.add(BASE_URL + PLATFORMS[platform].path);
}
for (const [platform, cats] of Object.entries(categoriesByPlatform)) {
  // /platform/all
  urls.add(BASE_URL + PLATFORMS[platform].path + '/all');
  for (const cat of cats) {
    if (cat === PLATFORMS[platform].defaultTab) continue; // default lives at /platform
    urls.add(BASE_URL + PLATFORMS[platform].path + '/' + cat);
  }
}
for (const ad of ads) {
  const p = ad.platform || 'google';
  urls.add(BASE_URL + PLATFORMS[p].path + '/' + ad.category + '-' + ad.id);
}

// XML-escape special characters in <image:title>/<image:caption> values so
// e.g. an ampersand or quote in an ad copy line doesn't break the sitemap.
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[...urls].sort().map(url => {
  let priority = '0.6';
  if (url === BASE_URL + '/') priority = '1.0';
  else if (Object.values(PLATFORMS).some(p => url === BASE_URL + p.path)) priority = '0.9';
  else if (!/-\d+$/.test(url)) priority = '0.8';
  const img = adImageByUrl.get(url);
  const imageBlock = img
    ? `\n    <image:image>\n` +
      `      <image:loc>${xmlEscape(img.loc)}</image:loc>\n` +
      `      <image:title>${xmlEscape(img.title)}</image:title>\n` +
      `      <image:caption>${xmlEscape(img.caption)}</image:caption>\n` +
      `    </image:image>`
    : '';
  return `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>${imageBlock}\n  </url>`;
}).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(REPO_ROOT, 'sitemap.xml'), sitemap);
console.log(`✓ sitemap.xml — ${urls.size} URLs, ${adImageByUrl.size} with image:image`);

// ----- api/ads.json -----
fs.mkdirSync(path.join(REPO_ROOT, 'api'), { recursive: true });
fs.writeFileSync(
  path.join(REPO_ROOT, 'api', 'ads.json'),
  JSON.stringify({
    site: BASE_URL,
    generated: new Date().toISOString(),
    total: ads.length,
    platforms: Object.fromEntries(
      Object.entries(PLATFORMS).map(([k, v]) => [k, { label: v.label, path: v.path }])
    ),
    ads: ads.map(ad => ({
      platform: ad.platform || 'google',
      category: ad.category,
      id: ad.id,
      title: ad.title,
      formula: ad.formula || '',
      tag: ad.tag || '',
      image: ad.image,
      url: BASE_URL + PLATFORMS[ad.platform || 'google'].path + '/' + ad.category + '-' + ad.id,
      imageUrl: BASE_URL + '/images/' +
        PLATFORMS[ad.platform || 'google'].folder + '/' +
        (PLATFORMS[ad.platform || 'google'].tabs.find(t => t.key === ad.category)?.folder || '') + '/' +
        ad.image,
    })),
  }, null, 2)
);
console.log(`✓ api/ads.json — ${ads.length} ads`);

// ----- llms.txt (short, llmstxt.org standard) -----
const adsByPlatform = {};
for (const ad of ads) {
  const p = ad.platform || 'google';
  if (!adsByPlatform[p]) adsByPlatform[p] = [];
  adsByPlatform[p].push(ad);
}

const llmsShort = `# Revenu Ad Library

> A free library of ${ads.length}+ high-performing B2B SaaS ad and landing page examples, curated and built by Revenu Agency. Browse the actual creative — categorized by platform and formula — to learn what's working in LinkedIn ads, Google ads, and landing pages.

## Libraries

- [LinkedIn Ads](${BASE_URL}/linkedin-ads) — ${(adsByPlatform.linkedin || []).length} examples across Problem, Product, Conversion, Conversation Ads, Gated Content, Animations, and Playbook insights
- [Google Ads](${BASE_URL}/google-ads) — ${(adsByPlatform.google || []).length} examples across Brand, Non Brand, Competitor, and Playbook
- [Landing Pages](${BASE_URL}/landing-pages) — ${(adsByPlatform.landing || []).length} examples across Above the Fold, Blocks, and Product Visuals

## Browsing

URL structure: \`/<platform>/<category>-<id>\` opens an individual ad in the preview lightbox.

Example: ${BASE_URL}/linkedin-ads/problem-1 opens the first LinkedIn Problem-stage ad.

## Data

- [Machine-readable ads list (JSON)](${BASE_URL}/api/ads.json)
- [Full library index (Markdown)](${BASE_URL}/api/library.md)
- [Detailed plain-text version of every ad](${BASE_URL}/llms-full.txt)

## About

Built by [Revenu Agency](https://www.revenuagency.io). Each example is a real ad or landing page section observed in the wild, recreated and categorized by its underlying formula so marketers can find proven approaches by intent.
`;
fs.writeFileSync(path.join(REPO_ROOT, 'llms.txt'), llmsShort);
console.log('✓ llms.txt');

// ----- llms-full.txt (every ad in plain text) -----
function tabLabel(platformKey, catKey) {
  return PLATFORMS[platformKey].tabs.find(t => t.key === catKey)?.label || catKey;
}

const llmsFullSections = [];
for (const [platform, platformAds] of Object.entries(adsByPlatform)) {
  const cfg = PLATFORMS[platform];
  llmsFullSections.push(`## ${cfg.label} (${platformAds.length} examples)\n`);

  const byCategory = {};
  for (const ad of platformAds) {
    if (!byCategory[ad.category]) byCategory[ad.category] = [];
    byCategory[ad.category].push(ad);
  }
  for (const [cat, catAds] of Object.entries(byCategory)) {
    llmsFullSections.push(`### ${tabLabel(platform, cat)} — ${catAds.length} examples\n`);
    for (const ad of catAds) {
      const url = BASE_URL + cfg.path + '/' + ad.category + '-' + ad.id;
      const parts = [`- **${ad.title}**`];
      if (ad.formula) parts.push(`(${ad.formula})`);
      parts.push(`— [${url}](${url})`);
      llmsFullSections.push(parts.join(' '));
    }
    llmsFullSections.push('');
  }
}

const llmsFull = `# Revenu Ad Library — Full Index

> Comprehensive list of every ad and landing page example in the Revenu Ad Library.
> Each entry includes the formula name and a direct URL to view it.

Site: ${BASE_URL}
Total entries: ${ads.length}
Generated: ${new Date().toISOString()}

${llmsFullSections.join('\n')}
`;
fs.writeFileSync(path.join(REPO_ROOT, 'llms-full.txt'), llmsFull);
console.log(`✓ llms-full.txt — ${ads.length} ads`);

// ----- api/library.md (mirror of llms-full.txt at a friendlier URL) -----
fs.writeFileSync(path.join(REPO_ROOT, 'api', 'library.md'), llmsFull);
console.log('✓ api/library.md');

// ----- Pre-rendered HTML files per URL --------------------------------
// Strategy: use index.html as a template and only rewrite the head's
// meta tags + JSON-LD per URL. Body + scripts stay identical so the SPA
// hydrates exactly the same way it did before.
const indexTemplate = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function imagePathFor(ad) {
  const cfg = PLATFORMS[ad.platform || 'google'];
  const tab = cfg.tabs.find(t => t.key === ad.category);
  const tabFolder = tab ? tab.folder : '';
  return `images/${cfg.folder}/${tabFolder}/${ad.image}`;
}

function buildBreadcrumbs(platform, category, ad) {
  const cfg = PLATFORMS[platform];
  const list = [
    { name: 'Revenu Ad Library', item: BASE_URL + '/' },
    { name: cfg.label, item: BASE_URL + cfg.path }
  ];
  if (category && category !== cfg.defaultTab) {
    const catLabel = (cfg.tabs.find(t => t.key === category) || {}).label || category;
    if (ad) {
      list.push({ name: catLabel, item: BASE_URL + cfg.path + '/' + category });
      list.push({ name: ad.title, item: BASE_URL + cfg.path + '/' + ad.category + '-' + ad.id });
    } else {
      list.push({ name: catLabel, item: BASE_URL + cfg.path + '/' + category });
    }
  }
  return list;
}

function buildJsonLdFor({ platform, category, ad, canonical }) {
  const cfg = PLATFORMS[platform];
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: buildBreadcrumbs(platform, category, ad).map((b, i) => ({
      '@type': 'ListItem', position: i + 1, name: b.name, item: b.item
    }))
  };
  if (ad) {
    const catLabel = (cfg.tabs.find(t => t.key === ad.category) || {}).label || ad.category;
    return {
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      '@id': canonical,
      name: ad.title,
      caption: ad.title + (ad.formula ? ': ' + ad.formula : ''),
      description: `${ad.title}: a ${catLabel.toLowerCase()} ${cfg.label.toLowerCase()} example curated in the Revenu Ad Library.`,
      contentUrl: BASE_URL + '/' + imagePathFor(ad),
      keywords: [cfg.label, catLabel, ad.title, ad.formula, ad.tag, 'B2B SaaS', 'ad example'].filter(Boolean).join(', '),
      isPartOf: { '@id': BASE_URL + '/#website' },
      breadcrumb
    };
  }
  const name = category
    ? `${(cfg.tabs.find(t => t.key === category) || {}).label || category} | ${cfg.label}`
    : `${cfg.label} Library`;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': canonical,
    name,
    description: `Curated collection of ${cfg.label.toLowerCase()} examples for B2B SaaS marketing.`,
    isPartOf: { '@id': BASE_URL + '/#website' },
    breadcrumb
  };
}

// ---------- Library info-tip content per platform (mirrored from app.js) ----------
// Pre-rendered HTML for each library page carries its platform's tooltip so
// Google indexes the right keywords on the right URL. JS swaps content on
// runtime platform switches, but the static HTML matters for crawl-time.
const PLATFORM_TIPS = {
  // Saved view tooltip — baked into the pre-rendered /saved.html.
  saved: {
    title: 'About your saved items',
    items: [
      { icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
        label: 'Your personal collection',
        blurb: 'every ad you have hearted across every library, all in one place.' },
      { icon: 'polygon:22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3',
        label: 'Filter by source',
        blurb: 'switch tabs to see only your saved LinkedIn, Google, Landing, or ChatGPT ads.' },
      { icon: 'polyline:23 4 23 10 17 10|M20.49 15a9 9 0 1 1-2.12-9.36L23 10',
        label: 'No account required',
        blurb: 'saved ads persist in your browser, so they are there whenever you come back.' },
      { icon: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
        label: 'Add or remove anytime',
        blurb: 'tap the heart on any ad in any library to add or remove it from this view.' },
    ],
  },
  // Homepage / chooser tooltip — shipped baked into index.html so Google
  // sees a four-library overview on the root URL.
  home: {
    title: 'About the Revenu Library',
    items: [
      { icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.35-1.85 3.59 0 4.25 2.36 4.25 5.44v6.3zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.21 0 22.22 0z"/></svg>',
        label: 'LinkedIn Ads',
        blurb: '200+ LinkedIn ad examples and LinkedIn animated ad templates for B2B SaaS.' },
      { icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.141.08L8.704 5.46a.795.795 0 0 0-.392.681v6.732zm1.097-2.365L12.005 8.91l2.6 1.5v3l-2.595 1.5-2.6-1.5z"/></svg>',
        label: 'ChatGPT Ads',
        blurb: 'How to advertise on ChatGPT: 38 real ChatGPT ad examples and OpenAI setup guide.' },
      { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="6.5" cy="7" r="0.6" fill="currentColor" stroke="none"/><circle cx="9" cy="7" r="0.6" fill="currentColor" stroke="none"/></svg>',
        label: 'Landing Pages',
        blurb: '120+ B2B SaaS landing page examples and swipe files including hero and above the fold designs.' },
      { icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 11v2.8h4.51c-.2 1.05-1.55 3.05-4.51 3.05-2.72 0-4.94-2.26-4.94-5.05S9.28 6.75 12 6.75c1.55 0 2.58.66 3.17 1.23l2.15-2.06C15.95 4.66 14.16 3.9 12 3.9 7.61 3.9 4.06 7.45 4.06 11.8s3.55 7.9 7.94 7.9c4.59 0 7.61-3.22 7.61-7.76 0-.52-.06-.91-.13-1.31H12z"/></svg>',
        label: 'Google Ads',
        blurb: '150+ Google Ads examples with Responsive Search Ad templates and copy inspiration.' },
    ],
  },
  linkedin: {
    title: 'About this LinkedIn Ads library',
    items: [
      { icon: 'rect:3 3 7 7 1|rect:14 3 7 7 1|rect:3 14 7 7 1|rect:14 14 7 7 1',
        label: '200+ LinkedIn ad examples',
        blurb: 'real B2B SaaS LinkedIn ads and ad templates you can model your own campaigns on.' },
      { icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
        label: 'Every LinkedIn ad format',
        blurb: 'Conversation Ads, Message Ads, Sponsored Content, Video Ads, and Gated Content examples.' },
      { icon: 'polygon:5 3 19 12 5 21 5 3',
        label: 'LinkedIn animated ads',
        blurb: 'dynamic creative and motion design templates for high-attention LinkedIn ads.' },
      { icon: 'polyline:23 6 13.5 15.5 8.5 10.5 1 18|polyline:17 6 23 6 23 12',
        label: 'LinkedIn ad swipe file',
        blurb: 'headline patterns, hooks, and CTAs from real B2B SaaS LinkedIn campaigns.' },
    ],
  },
  google: {
    title: 'About this Google Ads library',
    items: [
      { icon: 'circle:11 11 8|m21 21-4.35-4.35',
        label: '150+ Google Ads examples',
        blurb: 'real B2B SaaS Google Ads and Responsive Search Ad copy examples.' },
      { icon: 'circle:12 12 10|circle:12 12 6|circle:12 12 2',
        label: 'Brand, Non-Brand, Competitor',
        blurb: 'Google Ads campaigns for every keyword intent, from category to brand to competitor capture.' },
      { icon: 'polyline:4 7 4 4 20 4 20 7|line:9 20 15 20|line:12 4 12 20',
        label: 'Google Ads copy that converts',
        blurb: 'headline formulas and RSA templates pulled from high-CTR B2B SaaS campaigns.' },
      { icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
        label: 'Google Ads swipe file',
        blurb: 'ready-to-use ad copy templates and campaign structures for B2B SaaS.' },
    ],
  },
  landing: {
    title: 'About this Landing Pages library',
    items: [
      { icon: 'rect:3 3 18 18 2 2|line:3 9 21 9',
        label: '120+ landing page examples',
        blurb: 'real B2B SaaS landing page examples and SaaS landing page templates.' },
      { icon: 'line:12 3 12 21|polyline:6 9 12 3 18 9',
        label: 'Above the fold examples',
        blurb: 'hero section, headline, and form layout patterns proven to convert.' },
      { icon: 'rect:3 3 7 7 1|rect:14 3 7 7 1|rect:3 14 7 7 1|rect:14 14 7 7 1',
        label: 'Landing page blocks',
        blurb: 'testimonials, features, comparisons, logos, and proof section examples.' },
      { icon: 'rect:3 3 18 18 2 2|circle:8.5 8.5 1.5|polyline:21 15 16 10 5 21',
        label: 'Landing page swipe file',
        blurb: 'product visuals, mockups, and hero treatments that sell the experience.' },
    ],
  },
  chatgpt: {
    title: 'About this ChatGPT Ads library',
    items: [
      { icon: 'M12 3l1.9 4.7 4.6.5-3.5 3.1 1 4.6L12 13.8 7.9 16l1-4.6L5.5 8.2l4.6-.5L12 3z',
        label: '38 ChatGPT ad examples',
        blurb: 'the first curated ChatGPT ads library for B2B SaaS and AI advertising.' },
      { icon: 'M10 2v7.5a3 3 0 0 1-.6 1.8l-5.4 7.2A2 2 0 0 0 5.6 22h12.8a2 2 0 0 0 1.6-3.5l-5.4-7.2a3 3 0 0 1-.6-1.8V2|line:8 2 16 2',
        label: 'How to advertise on ChatGPT',
        blurb: 'OpenAI ad formulas and short-copy templates that work inside ChatGPT search results.' },
      { icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
        label: 'ChatGPT advertising playbook',
        blurb: 'placement, copy, and headline best practices for ChatGPT ads and OpenAI ads.' },
      { icon: 'circle:12 12 3|M12 2v3|M12 19v3|M4.93 4.93l2.12 2.12|M16.95 16.95l2.12 2.12|M2 12h3|M19 12h3|M4.93 19.07l2.12-2.12|M16.95 7.05l2.12-2.12',
        label: 'ChatGPT ads setup guide',
        blurb: 'full ChatGPT campaign creation and conversion tracking walkthrough.' },
    ],
  },
};
function renderTipIcon(spec) {
  // Mirror of _renderTipIcon in app.js — supports raw <svg> passthrough OR
  // shorthand rect/circle/polygon/polyline/line/path tokens.
  const s = String(spec).trim();
  if (s.startsWith('<svg')) return s;
  const parts = s.split('|').map(token => {
    if (token.startsWith('rect:')) {
      const v = token.slice(5).split(/\s+/).map(Number);
      const [x, y, w, h, rx = 0, ry = 0] = v;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${ry}"/>`;
    }
    if (token.startsWith('circle:')) {
      const [cx, cy, r] = token.slice(7).split(/\s+/).map(Number);
      return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
    }
    if (token.startsWith('polygon:'))  return `<polygon points="${token.slice(8)}"/>`;
    if (token.startsWith('polyline:')) return `<polyline points="${token.slice(9)}"/>`;
    if (token.startsWith('line:')) {
      const [x1, y1, x2, y2] = token.slice(5).split(/\s+/).map(Number);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    return `<path d="${token}"/>`;
  }).join('');
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
}
function buildLibraryTipFor(platform) {
  const tip = PLATFORM_TIPS[platform];
  if (!tip) return null;
  const itemsHtml = tip.items.map(item =>
    `<li>${renderTipIcon(item.icon)}<span><strong>${esc(item.label)}</strong>${esc(item.blurb)}</span></li>`
  ).join('');
  return { title: tip.title, itemsHtml };
}

function buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform }) {
  let html = indexTemplate;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  html = html.replace(/(<link rel="canonical"[^>]*href=")[\s\S]*?(")/, `$1${canonical}$2`);
  html = html.replace(/(<meta property="og:title" content=")[\s\S]*?(")/, `$1${esc(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  html = html.replace(/(<meta property="og:url" content=")[\s\S]*?(")/, `$1${canonical}$2`);
  if (ogImage) {
    html = html.replace(/(<meta property="og:image" content=")[\s\S]*?(")/g, `$1${ogImage}$2`);
    html = html.replace(/(<meta name="twitter:image" content=")[\s\S]*?(")/g, `$1${ogImage}$2`);
  }
  html = html.replace(/(<meta name="twitter:title" content=")[\s\S]*?(")/, `$1${esc(title)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  html = html.replace(
    /(<script type="application\/ld\+json" id="page-jsonld">)([\s\S]*?)(<\/script>)/,
    `$1${JSON.stringify(jsonLd)}$3`
  );
  // Swap the library info-tip content to the active platform's keywords so
  // each pre-rendered URL ships SEO-relevant copy that matches its meta.
  // Includes the 'saved' view (which has its own favorites-explainer tip).
  const tip = activePlatform ? buildLibraryTipFor(activePlatform) : null;
  if (tip) {
    html = html.replace(
      /(<p class="info-tip-title" id="library-info-title">)([\s\S]*?)(<\/p>)/,
      `$1${esc(tip.title)}$3`
    );
    html = html.replace(
      /(<ul class="info-tip-list" id="library-info-list">)([\s\S]*?)(<\/ul>)/,
      `$1${tip.itemsHtml}$3`
    );
  }
  // Inject is-active on the right header pill so it's highlighted from the
  // very first paint. Avoids the "wrong pill briefly active" flash that
  // happens when the static template carries a hard-coded is-active class.
  if (activePlatform) {
    html = html.replace(
      new RegExp(`(<a [^>]*?class="platform-pill(?:\\s+platform-pill-saved)?)(")(\\s+[^>]*?data-platform="${activePlatform}")`),
      '$1 is-active$2$3'
    );
  }
  // Bake the correct hero <h1> + header dropdown label into the static HTML.
  // These mirror exactly what app.js renders at runtime, so users see no
  // change — but crawlers' first-pass (unrendered) HTML no longer shows the
  // template's hard-coded H1 on every URL. That duplicate H1 across all
  // pre-rendered pages was causing Google to cluster pages as duplicates
  // ("Google chose different canonical than user", e.g. /chatgpt → /linkedin-ads).
  if (activePlatform) {
    const platformCfg = PLATFORMS[activePlatform];
    const heroHtml = activePlatform === 'saved'
      ? 'Your <span class="hero-title-accent">Saved Items</span>'
      : platformCfg
        ? `<span class="hero-title-accent">${esc(platformCfg.label)}</span> Library`
        : null;
    const dropdownLabel = activePlatform === 'saved' ? 'Saved' : platformCfg ? platformCfg.label : null;
    if (heroHtml) {
      html = html.replace(
        /(<span class="hero-title-text" id="hero-title-text">)[\s\S]*?(<\/span><span class="info-tip")/,
        `$1${heroHtml}$2`
      );
    }
    if (dropdownLabel) {
      html = html.replace(
        /(<span class="dropdown-label" id="platform-dropdown-label">)[\s\S]*?(<\/span>)/,
        `$1${esc(dropdownLabel)}$2`
      );
    }
  }
  return html;
}

function writePage(urlPath, html) {
  // urlPath like "/linkedin-ads" -> "linkedin-ads.html"
  // urlPath like "/linkedin-ads/problem-3" -> "linkedin-ads/problem-3.html"
  const clean = urlPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return; // root is index.html — left alone
  const filePath = path.join(REPO_ROOT, clean + '.html');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html);
}

let pagesWritten = 0;
// Saved view (/saved). User-specific content, so JSON-LD is intentionally null.
{
  const canonical = BASE_URL + '/saved';
  const title = 'Saved Ads | Revenu Ad Library';
  const description = 'Your personal collection of favorited ads across every Revenu Library. LinkedIn, Google, ChatGPT, and Landing Pages examples all in one place.';
  writePage('/saved', buildPageHtml({ title, description, canonical, jsonLd: {}, activePlatform: 'saved' }));
  pagesWritten++;
}
// Per-platform OG preview images. These sit alongside the default og-image.png
// (which is now homepage-only) and are picked up by social link unfurlers
// (LinkedIn, Slack, X, FB) when sharing a library URL.
const PLATFORM_OG_IMAGE = {
  linkedin: '/og/linkedin-ads.png',
  google:   '/og/google-ads.png',
  landing:  '/og/landing-pages.png',
  chatgpt:  '/og/chatgpt.png',
};
// Per-platform title + description overrides — keyword-rich, unique per library
// so search results distinguish them cleanly. Counts are pinned in the copy so
// each library reads confidently ("200+", "150+", "120+", "38").
const PLATFORM_META = {
  linkedin: {
    title: 'LinkedIn Ads Library | 200+ Examples & Templates | Revenu',
    description: '200+ real LinkedIn ad examples and templates for B2B SaaS. LinkedIn animated ads, Conversation Ads, Sponsored Content, Video Ads, and Gated Content. Free LinkedIn ad library and swipe file.',
  },
  google: {
    title: 'Google Ads Library | 150+ Examples & Templates | Revenu',
    description: '150+ real Google Ads examples and templates for B2B SaaS. Responsive Search Ads, competitor ads, brand and non-brand campaigns. Free Google Ads swipe file and copy inspiration.',
  },
  landing: {
    title: 'Landing Pages Library | 120+ B2B SaaS Templates | Revenu',
    description: '120+ real landing page examples for B2B SaaS. Above the fold hero examples, conversion blocks, product visuals, and design inspiration. Free landing page swipe file.',
  },
  chatgpt: {
    title: 'ChatGPT Ads Library | Examples + How to Advertise | Revenu',
    description: '38 real ChatGPT ad examples plus how to advertise on ChatGPT. The first ChatGPT ads library with OpenAI advertising formulas, playbook, and full campaign setup guide.',
  },
};
// Platform-level pages (/google-ads, /linkedin-ads, /landing-pages, /chatgpt)
for (const [platform, cfg] of Object.entries(PLATFORMS)) {
  const meta = PLATFORM_META[platform] || {
    title: `${cfg.label} Library | Revenu`,
    description: `A free library of ${cfg.label} examples for B2B SaaS.`,
  };
  const canonical = BASE_URL + cfg.path;
  const ogImage = BASE_URL + (PLATFORM_OG_IMAGE[platform] || '/og-image.png');
  const jsonLd = buildJsonLdFor({ platform, category: null, ad: null, canonical });
  writePage(cfg.path, buildPageHtml({ title: meta.title, description: meta.description, canonical, ogImage, jsonLd, activePlatform: platform }));
  pagesWritten++;
}
// Category pages — inherit the platform's OG image so shares of /chatgpt/playbook,
// /linkedin-ads/conversion, etc. show the correct library cover, not the LinkedIn default.
for (const [platform, cats] of Object.entries(categoriesByPlatform)) {
  const cfg = PLATFORMS[platform];
  const ogImage = BASE_URL + (PLATFORM_OG_IMAGE[platform] || '/og-image.png');
  // explicit /all
  {
    const canonical = BASE_URL + cfg.path + '/all';
    const title = `All ${cfg.label} Examples | Revenu`;
    const description = `Every ${cfg.label} example in the Revenu Ad Library. All categories, all formulas.`;
    const jsonLd = buildJsonLdFor({ platform, category: 'all', ad: null, canonical });
    writePage(cfg.path + '/all', buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform: platform }));
    pagesWritten++;
  }
  for (const cat of cats) {
    if (cat === cfg.defaultTab) continue;
    const catLabel = (cfg.tabs.find(t => t.key === cat) || {}).label || cat;
    const canonical = BASE_URL + cfg.path + '/' + cat;
    const title = `${catLabel} | ${cfg.label} Examples | Revenu`;
    const description = `${catLabel} ${cfg.label} examples from the Revenu Ad Library. Real B2B SaaS ad templates and examples to inspire your next campaign.`;
    const jsonLd = buildJsonLdFor({ platform, category: cat, ad: null, canonical });
    writePage(cfg.path + '/' + cat, buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform: platform }));
    pagesWritten++;
  }
}
// Individual ad pages — new pattern uses `|` for the title separator and drops
// the awkward "a real The Playbook" repetition in the description when a formula
// is present (since category is already in the title).
for (const ad of ads) {
  const platform = ad.platform || 'google';
  const cfg = PLATFORMS[platform];
  const catLabel = (cfg.tabs.find(t => t.key === ad.category) || {}).label || ad.category;
  const urlPath = cfg.path + '/' + ad.category + '-' + ad.id;
  const canonical = BASE_URL + urlPath;
  const title = `${ad.title} | ${catLabel} ${cfg.label} Example | Revenu`;
  const description = ad.formula
    ? `${ad.title}: ${ad.formula}. A real ${cfg.label} example from the Revenu Ad Library.`
    : `${ad.title}: a real ${catLabel} ${cfg.label} example from the Revenu Ad Library. A curated collection of high-performing B2B SaaS ad and landing page templates.`;
  const ogImage = BASE_URL + '/' + imagePathFor(ad); // ad's own image as fallback OG
  const jsonLd = buildJsonLdFor({ platform, category: ad.category, ad, canonical });
  writePage(urlPath, buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform: platform }));
  pagesWritten++;
}
console.log(`✓ Pre-rendered HTML — ${pagesWritten} pages`);

console.log('\nAll SEO/LLM files regenerated.');

// ----- Remove stale pre-rendered pages for hidden ads (their URL then 404s) -----
let removed = 0;
for (const ad of hiddenAds) {
  const cfg = PLATFORMS[ad.platform || 'google'];
  const file = path.join(REPO_ROOT, cfg.path.replace(/^\//, ''), `${ad.category}-${ad.id}.html`);
  if (fs.existsSync(file)) { fs.unlinkSync(file); removed++; }
}
if (hiddenAds.length) console.log(`✓ Hidden ads — ${hiddenAds.length} kept out of the build, ${removed} stale page(s) removed`);
