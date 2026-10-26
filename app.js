// ---------- Ad Library — gallery + lightbox ----------

// Favorites are stored in localStorage only — no gate, no sign-in, no server
// sync. Anyone can browse and "save" ads; the saved set lives in their browser.
const FAVORITES_KEY = 'ad-library-favorites';

// Whether the current view should be the chooser. We derive this from the URL
// on initial load and on popstate, but otherwise track it as a JS variable so
// the chooser <-> library flip works even when history.pushState is blocked
// (e.g. file:// origin restrictions when previewing index.html locally).
function _isChooserUrl() {
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/') return true;
  // file:// support — opening index.html (or the chatgpt-ads.html stealth
  // preview file) directly should show the chooser too.
  if (window.location.protocol === 'file:' && /\/(index|chatgpt-ads)\.html$/i.test(path)) return true;
  return false;
}
let chooserActive = _isChooserUrl();
function isHomepage() { return chooserActive; }

// pushState/replaceState throw under file:// when the target path leaves the
// current file's directory. Wrap them so a navigation attempt that the
// browser refuses doesn't blow up the rest of the click handler.
function safePushState(state, url) {
  try { window.history.pushState(state, '', url); } catch (e) { /* file:// — ignore */ }
}
function safeReplaceState(state, url) {
  try { window.history.replaceState(state, '', url); } catch (e) { /* file:// — ignore */ }
}

const gallery = document.getElementById('gallery');
const chooser = document.getElementById('chooser');
const filtersWrap = document.getElementById('filters-wrap');
const emptyState = document.getElementById('empty-state');
const tabsContainer = document.getElementById('filters');
const filterDropdown = document.getElementById('filter-dropdown');
const filterDropdownTrigger = document.getElementById('filter-dropdown-trigger');
const filterDropdownLabel = document.getElementById('filter-dropdown-label');
const filterDropdownMenu = document.getElementById('filter-dropdown-menu');
const featurePillsContainer = document.getElementById('feature-pills');
const platformPills = document.querySelectorAll('.platform-pill');
const platformDropdown = document.getElementById('platform-dropdown');
const platformDropdownTrigger = document.getElementById('platform-dropdown-trigger');
const platformDropdownLabel = document.getElementById('platform-dropdown-label');
const platformDropdownMenu = document.getElementById('platform-dropdown-menu');
const heroTitle = document.getElementById('hero-title');

const lightbox = document.getElementById('lightbox');
const lbImage = document.getElementById('lb-image');
const lbCaption = document.getElementById('lb-caption');
const lbClose = document.getElementById('lb-close');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');

// ---------- Platform config ----------
// Each platform has its own headline label, image folder, feature bullet
// points, tabs, and default tab. Tabs map category keys (used in ads.js) to
// the folder name on disk.
const platforms = {
  linkedin: {
    label: 'LinkedIn Ads',
    folder: 'LinkedIn Ads',
    features: ['Increase Your CTR', 'Drive More Demos', 'Stop The Scroll'],
    defaultTab: 'all',
    tabs: [
      { key: 'all',           label: 'All',           folder: '' },
      { key: 'problem',       label: 'Problem',       folder: 'Problem' },
      { key: 'product',       label: 'Product',       folder: 'Product' },
      { key: 'conversion',    label: 'Conversion',    folder: 'Conversion' },
      { key: 'convo-ads',     label: 'Conversation Ads',     folder: 'Conversation Ads', shortLabel: 'Convo Ads' },
      { key: 'gated-content', label: 'Gated Content', folder: 'Gated Content' },
      { key: 'playbook',      label: 'The Playbook',  folder: 'The Playbook' },
      { key: 'animations',    label: 'Animations',    folder: 'Animations' }
    ]
  },
  google: {
    label: 'Google Ads',
    folder: 'Google Ads',
    features: ['30+ Ad Formulas', 'Proven High CTR', 'Higher Quality Scores'],
    defaultTab: 'all',
    tabs: [
      { key: 'all',         label: 'All',          folder: '' },
      { key: 'brand',       label: 'Brand',        folder: 'Brand' },
      { key: 'non-brand',   label: 'Non Brand',    folder: 'Non Brand' },
      { key: 'competitor',  label: 'Competitor',   folder: 'Competitor' },
      { key: 'playbook',    label: 'The Playbook', folder: 'The Playbook' }
    ]
  },
  landing: {
    label: 'Landing Pages',
    folder: 'Landing Pages',
    features: ['Increase Your Conversion Rate', 'Tell A Better Story', 'Beat Your Competition'],
    defaultTab: 'all',
    tabs: [
      { key: 'all',              label: 'All',              folder: '' },
      { key: 'above-the-fold',   label: 'Above the Fold',   folder: 'Above the Fold' },
      { key: 'blocks',           label: 'Blocks',           folder: 'Blocks' },
      { key: 'product-visuals',  label: 'Product Visuals',  folder: 'Product Visuals' }
    ]
  },
  chatgpt: {
    label: 'ChatGPT Ads',
    folder: 'ChatGPT Ads',
    features: ['First-Mover Edge', 'Get Seen On AI', 'Steal Search Traffic'],
    defaultTab: 'all',
    tabs: [
      { key: 'all',       label: 'All',          folder: '' },
      { key: 'playbook',  label: 'The Playbook', folder: 'Playbook' },
      { key: 'formulas',  label: 'Formulas',     folder: 'Formulas' },
      { key: 'setup',     label: 'The Setup',    folder: 'Setup' }
    ]
  },
  // Pseudo-platform: cross-library "Saved" view. Same gallery + lightbox UI
  // as a real platform, but visibleAds is filtered from the user's favorites
  // (localStorage) and the "category" tabs are the source platforms.
  saved: {
    label: 'Saved',
    folder: '',
    features: [],
    defaultTab: 'all',
    tabs: [
      { key: 'all',      label: 'All',           folder: '' },
      { key: 'linkedin', label: 'LinkedIn Ads',  folder: '' },
      { key: 'google',   label: 'Google Ads',    folder: '' },
      { key: 'landing',  label: 'Landing Pages', folder: '' },
      { key: 'chatgpt',  label: 'ChatGPT Ads',   folder: '' }
    ]
  }
};

// ---------- Library info-tip content (per platform) ----------
// Tooltip shown next to the hero title. Content stays in the DOM (CSS-hidden
// until hover) so Google indexes every keyword. Each entry has a title and an
// array of bullets, each bullet a {icon (inline SVG path), label, blurb}.
// Keep these keyword-rich without sounding spammy.
const PLATFORM_TIPS = {
  // Saved view tooltip — explains the favorites flow (heart on any ad,
  // browser-local persistence, cross-library filtering).
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
  // Homepage / chooser tooltip. Lists all four libraries with their brand
  // marks so a visitor instantly sees what's available before picking a tile.
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
// Build the inner HTML of #library-info-popover for a given platform.
function _renderTipIcon(spec) {
  // spec is either:
  //   (a) a literal "<svg ...>...</svg>" string — used for complex brand
  //       logos like LinkedIn / OpenAI / Google where the shorthand below
  //       can't easily express the artwork; OR
  //   (b) a pipe-separated list of either raw path "d" strings or shorthand
  //       "type:args" tokens (rect/circle/polygon/polyline/line) so we can
  //       build slightly more complex icons without writing full <svg> markup.
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
function applyLibraryTip(platform) {
  const tip = PLATFORM_TIPS[platform];
  if (!tip) return; // saved view has no library tooltip
  const titleEl = document.getElementById('library-info-title');
  const listEl  = document.getElementById('library-info-list');
  if (!titleEl || !listEl) return;
  titleEl.textContent = tip.title;
  listEl.innerHTML = tip.items.map(item =>
    `<li>${_renderTipIcon(item.icon)}<span><strong>${item.label}</strong>${item.blurb}</span></li>`
  ).join('');
}

// ---------- Favorites ----------
// Per-ad heart toggle, stored in localStorage. The favorites filter button on
// the desktop filter bar restricts the gallery to only favorited ads.
// The filter state is tracked PER-PLATFORM so switching libraries doesn't
// drag the toggle with you, but coming back to a library restores its state.
const favoritesModeByPlatform = { google: false, linkedin: false, landing: false };
function getFavoritesMode() { return !!favoritesModeByPlatform[activePlatform]; }
const favorites = new Set();
try {
  const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  if (Array.isArray(raw)) raw.forEach(k => favorites.add(k));
} catch (e) {}
function adKey(ad) {
  return `${ad.platform || 'google'}|${ad.category}|${ad.id}`;
}
function isFavorite(ad) { return favorites.has(adKey(ad)); }
function persistFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch (e) {}
}
function toggleFavorite(ad) {
  const k = adKey(ad);
  if (favorites.has(k)) favorites.delete(k);
  else favorites.add(k);
  persistFavorites();
  // Sync the header heart-pill count to the new total.
  if (typeof syncSavedCount === 'function') syncSavedCount();
}
// Update the header heart-pill count badge. Called on init and whenever
// toggleFavorite mutates the set. Hides the count entirely when there are
// zero favorites so the pill reads as just a heart icon.
function syncSavedCount() {
  const el = document.getElementById('saved-count');
  if (!el) return;
  const n = favorites.size;
  el.textContent = String(n);
  el.hidden = n === 0;
}

// ---------- URL routing ----------
// Each platform has its own clean URL: /google-ads, /linkedin-ads, /landing-pages.
// Each ad has a deep-link URL: /<platform>-<id>, e.g. /linkedin-ads-5.
// Root URL "/" defaults to LinkedIn. vercel.json rewrites all of these to index.html.
const PATH_TO_PLATFORM = {
  '/google-ads': 'google',
  '/linkedin-ads': 'linkedin',
  '/landing-pages': 'landing',
  '/chatgpt': 'chatgpt',
  '/saved': 'saved'
};
const PLATFORM_TO_PATH = {
  google:   '/google-ads',
  linkedin: '/linkedin-ads',
  landing:  '/landing-pages',
  chatgpt:  '/chatgpt',
  saved:    '/saved'
};

function parsePath() {
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  // /saved has no sub-paths (categories are JS-only state, not URLs).
  if (path === '/saved') return { platform: 'saved', category: null, adId: null };
  // /platform or /platform/category[-id]
  const m = path.match(/^\/(google-ads|linkedin-ads|landing-pages|chatgpt)(?:\/(.+))?$/);
  if (!m) return { platform: 'linkedin', category: null, adId: null };
  const platform = PATH_TO_PLATFORM['/' + m[1]];
  if (!m[2]) return { platform, category: null, adId: null };
  // Try <category>-<id> first (greedy on the category so multi-hyphen names like
  // convo-ads-3 or above-the-fold-12 split correctly).
  const idMatch = m[2].match(/^(.+)-(\d+)$/);
  if (idMatch) {
    return { platform, category: idMatch[1], adId: parseInt(idMatch[2], 10) };
  }
  return { platform, category: m[2], adId: null };
}
function platformFromPath() { return parsePath().platform; }

// Build the URL for a given platform / category / optional ad ID.
// Drops the category when it's the platform's default (keeps /linkedin-ads clean).
function buildPath(platform, category, adId) {
  const platformPath = PLATFORM_TO_PATH[platform];
  // Saved view: category is JS-only state — URL always stays /saved.
  if (platform === 'saved') return platformPath;
  if (adId != null) return `${platformPath}/${category}-${adId}`;
  if (!category || category === platforms[platform].defaultTab) return platformPath;
  return `${platformPath}/${category}`;
}
function adPath(ad) {
  return buildPath(ad.platform || 'google', ad.category, ad.id);
}
function findAd(platform, category, id) {
  return allAds.find(a =>
    (a.platform || 'google') === platform &&
    a.category === category &&
    a.id === id
  );
}

let allAds = [];
let visibleAds = [];
let currentIndex = 0;
let activePlatform = platformFromPath();
let activeFilter; // determined below, once allAds are loaded and we know if a deep-link ad picks a category
let isFirstRender = true;

function currentPlatform() { return platforms[activePlatform] || platforms.google; }

function findTab(platformKey, tabKey) {
  const cfg = platforms[platformKey] || platforms.google;
  return cfg.tabs.find(t => t.key === tabKey);
}

function imagePath(ad) {
  const cfg = platforms[ad.platform || 'google'] || platforms.google;
  const tab = cfg.tabs.find(t => t.key === ad.category);
  const tabFolder = tab ? tab.folder : '';
  // Relative path. On the live site the <base href="/"> tag in index.html
  // makes this resolve from the site root, so nested URLs like
  // /linkedin-ads/problem-3 still find the right images. Locally (file://),
  // <base> is skipped and the path resolves from the document's directory.
  return `images/${cfg.folder}/${tabFolder}/${ad.image}`;
}

// ---------- Column count toggle (desktop) ----------
const viewToggle = document.getElementById('view-toggle');
const COLS_KEY = 'ad-library-cols';

function setColumns(n) {
  const cols = String(n);
  gallery.classList.remove('cols-1', 'cols-2', 'cols-3');
  gallery.classList.add(`cols-${cols}`);
  viewToggle.querySelectorAll('.view-toggle-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.cols === cols);
  });
  try { localStorage.setItem(COLS_KEY, cols); } catch (e) {}
}

// Restore saved preference. Mobile only allows 1 or 2 columns; desktop allows 1/2/3.
// First-time mobile visitors get 1-col; desktop defaults to 2-col.
const savedCols = (() => {
  try { return localStorage.getItem(COLS_KEY); } catch (e) { return null; }
})();
const _isMobileViewport = window.matchMedia('(max-width: 960px)').matches;
const _allowedCols = _isMobileViewport ? ['1', '2'] : ['1', '2', '3'];
const _useCols = (savedCols && _allowedCols.includes(savedCols))
  ? savedCols
  : (_isMobileViewport ? '1' : '2');
setColumns(_useCols);

viewToggle.querySelectorAll('.view-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => setColumns(btn.dataset.cols));
});

// ---------- Shuffle button (desktop) ----------
// Reorders the ads currently visible in the active platform + category.
// Uses Fisher–Yates and re-renders without re-filtering, so the new order
// sticks until you change platform / category or hit shuffle again.
const shuffleBtn = document.getElementById('shuffle-btn');

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

shuffleBtn.addEventListener('click', () => {
  if (visibleAds.length < 2) return;
  // Pure shuffle — priority pinning is intentionally NOT re-applied.
  // Shuffle takes priority over the curated order, so pinned ads (Question
  // Animated, the LinkedIn animations, etc.) get tossed in with everything else.
  shuffleInPlace(visibleAds);
  renderCards(true); // animate to highlight the new order
  shuffleBtn.classList.remove('is-spinning');
  void shuffleBtn.offsetWidth;
  shuffleBtn.classList.add('is-spinning');
});
shuffleBtn.addEventListener('animationend', () => {
  shuffleBtn.classList.remove('is-spinning');
});

// ---------- Favorites filter (desktop) ----------
// Toggle: when active, render() restricts visibleAds to favorited ads only.
// State is per-platform — switching libraries clears the visual filter, and
// coming back to a library restores whatever state it had.
const favoritesFilterBtn = document.getElementById('favorites-filter-btn');
function syncFavoritesButton() {
  if (!favoritesFilterBtn) return;
  favoritesFilterBtn.hidden = false;
  // On /saved the favorites filter is conceptually "always on" — the entire
  // view IS the filter — so we lock the button into its active appearance.
  // The click handler is a no-op there, and toggling it has no effect on the
  // favorites-mode state of any other library.
  const isSaved = activePlatform === 'saved';
  const on = isSaved || getFavoritesMode();
  favoritesFilterBtn.classList.toggle('is-active', on);
  favoritesFilterBtn.classList.toggle('is-locked', isSaved);
  favoritesFilterBtn.setAttribute('aria-pressed', String(on));
  favoritesFilterBtn.setAttribute('aria-label', isSaved
    ? 'Saved view — favorites filter is always on here'
    : (on ? 'Hide favorites' : 'Show favorites'));
  favoritesFilterBtn.title = isSaved
    ? 'Saved view — always shows your favorites'
    : 'Favorites';
  const svg = favoritesFilterBtn.querySelector('svg');
  if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
}
if (favoritesFilterBtn) {
  favoritesFilterBtn.addEventListener('click', () => {
    // On /saved the filter is always-on. Clicks here mustn't disable it AND
    // mustn't write into favoritesModeByPlatform — that map only tracks the
    // three real libraries.
    if (activePlatform === 'saved') return;
    favoritesModeByPlatform[activePlatform] = !getFavoritesMode();
    syncFavoritesButton();
    render(true);
  });
}
syncFavoritesButton();

// ---------- Search control (desktop) ----------
// Click the magnifying glass → input slides out, focuses. Press Enter →
// applies the filter and collapses back to the icon, with an accent dot
// shown on the icon while a search is active.
const searchControl = document.getElementById('search-control');
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');
const searchIndicator = document.getElementById('search-indicator');
let searchQuery = '';

function openSearch() {
  if (!searchControl) return;
  searchControl.classList.add('is-open');
  searchInput.value = searchQuery; // restore current query for editing
  // Wait for the slide-out before grabbing focus so iOS-style soft-keyboards
  // (where applicable) and the visible caret line up with the open state.
  setTimeout(() => searchInput.focus(), 60);
}
function closeSearch() {
  if (!searchControl) return;
  searchControl.classList.remove('is-open');
  searchInput.blur();
}
function applySearch(rawQuery) {
  searchQuery = (rawQuery || '').trim();
  if (searchIndicator) searchIndicator.hidden = !searchQuery;
  render(true); // pop-in animation for the filtered results
}

if (searchBtn) {
  searchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchControl.classList.contains('is-open')) {
      // Clicking the icon while open commits whatever's in the box
      applySearch(searchInput.value);
      closeSearch();
    } else {
      openSearch();
    }
  });
}
if (searchInput) {
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applySearch(searchInput.value);
      closeSearch();
    } else if (e.key === 'Escape') {
      // Esc just closes without changing the active filter
      closeSearch();
    }
  });
  // Close when clicking outside (but ignore clicks on the search button itself)
  document.addEventListener('click', (e) => {
    if (!searchControl) return;
    if (!searchControl.classList.contains('is-open')) return;
    if (searchControl.contains(e.target)) return;
    closeSearch();
  });
}

// ---------- Load ads ----------
allAds = window.ADS || [];
// Assign per-category sequential IDs (1-based) so each ad has a stable deep-link URL.
// /linkedin-ads/problem-3, /google-ads/non-brand-1, /landing-pages/above-the-fold-12, etc.
const _idCounters = {};
allAds.forEach(ad => {
  const key = `${ad.platform || 'google'}|${ad.category}`;
  _idCounters[key] = (_idCounters[key] || 0) + 1;
  ad.id = _idCounters[key];
});
// Ads flagged `hidden: true` keep their slot (so every other ad's URL id stays stable)
// but are removed from the library: no card, no search hit, no saved entry, and their
// deep link no longer resolves.
allAds = allAds.filter(ad => !ad.hidden);

// If the URL points at a specific category and/or ad, start the library on that
// category so the slide-in opens against the matching tab.
const _initial = parsePath();
let _initialAd = (_initial.category && _initial.adId != null)
  ? findAd(activePlatform, _initial.category, _initial.adId)
  : null;
activeFilter = (_initialAd && _initialAd.category)
  || _initial.category
  || platforms[activePlatform].defaultTab;

// Sync the desktop platform pills to the URL-derived activePlatform
platformPills.forEach(p => p.classList.toggle('is-active', p.dataset.platform === activePlatform));
renderFeaturePills();
renderTabs();
updateHeadline();
syncSavedCount(); // header heart pill — show count badge on page load
render(true); // initial load — animate
// If this is the chooser homepage, hide the library chrome we just rendered
// (the gallery sits behind the chooser, ready for when the user picks a tile).
applyHomepageMode();
animateChooserIfHome();

// Deep-link: after the library is on screen, fade the backdrop in and slide
// the image in from the left. Brief delay so the user sees the library first.
if (_initialAd) {
  setTimeout(() => {
    const idx = visibleAds.indexOf(_initialAd);
    if (idx !== -1) openLightbox(idx, { slideIn: true, updateUrl: false });
  }, 400);
}

// ---------- Headline + tab title ----------
function updateHeadline() {
  // Update only the inner text span so we don't blow away the info-tip
  // (which is a sibling node inside the h1).
  const textEl = document.getElementById('hero-title-text') || heroTitle;
  const libTip = document.getElementById('library-info-tip');
  if (isHomepage()) {
    textEl.innerHTML = `Select Your <span class="hero-title-accent">Library</span>`;
    document.title = 'The Library | Revenu';
    // Homepage tooltip = a breakdown of all four libraries (each with its
    // brand mark) so visitors see exactly what they'll find before choosing.
    if (libTip) libTip.hidden = false;
    applyLibraryTip('home');
  } else if (activePlatform === 'saved') {
    textEl.innerHTML = `Your <span class="hero-title-accent">Saved Items</span>`;
    document.title = 'Saved | Revenu Ad Library';
    if (libTip) libTip.hidden = false;
    applyLibraryTip('saved');
  } else {
    const cfg = currentPlatform();
    textEl.innerHTML = `<span class="hero-title-accent">${escapeHtml(cfg.label)}</span> Library`;
    document.title = `${cfg.label} Library | Revenu`;
    if (libTip) libTip.hidden = false;
    applyLibraryTip(activePlatform);      // swap tooltip content per platform
  }
  updateSEOTags();
}

// ---------- Homepage chooser ----------
// On "/" we show three tiles (Google Ads, LinkedIn Ads, Landing Pages) and
// hide the regular library chrome (filters, feature pills, gallery). Picking
// a tile or a platform pill pushes the URL to /<platform> and reveals the
// gallery again. Back-button to "/" re-shows the chooser.
function applyHomepageMode() {
  const home = isHomepage();
  // Body class so the chooser homepage can opt into a wider .container and
  // the sticky-footer layout without those rules leaking to library views.
  document.body.classList.toggle('is-chooser', home);
  if (chooser) chooser.hidden = !home;
  if (filtersWrap) filtersWrap.hidden = home;
  if (gallery) gallery.hidden = home;
  if (featurePillsContainer) featurePillsContainer.hidden = home;
  // Sync the chip active state:
  //  - on the chooser homepage  → only the Home chip lights up
  //  - on a library page        → the matching platform chip lights up
  platformPills.forEach(p => {
    const want = home ? p.dataset.platform === 'home' : p.dataset.platform === activePlatform;
    p.classList.toggle('is-active', want);
  });
  if (platformDropdownLabel) {
    platformDropdownLabel.textContent = home ? 'Select library' : currentPlatform().label;
  }
  // Empty state belongs to the library view, never the chooser
  if (home && emptyState) emptyState.hidden = true;
}

// Re-trigger the card-pop keyframes on the three chooser tiles. Called on
// initial homepage load and after the password gate lifts.
function animateChooserIfHome() {
  if (!isHomepage() || !chooser) return;
  const tiles = chooser.querySelectorAll('.chooser-tile');
  // Step 1: clear any previous animation state and pre-snap each tile to the
  // animation's 0% keyframe (opacity 0, scaled-down, offset). Setting these
  // inline BEFORE adding the .chooser-pop class means there's no visible
  // jump from "scale 1" to "scale 0.94" when the class kicks in — the tile
  // is already there.
  tiles.forEach(tile => {
    tile.classList.remove('chooser-pop');
    tile.style.opacity = '0';
    tile.style.transform = 'scale(0.94) translateY(14px)';
  });
  // Single reflow for all tiles
  void chooser.offsetWidth;
  // Step 2: stagger the animation on each tile (matches the gallery's 0.08s
  // cadence so the chooser feels structurally similar to the libraries).
  tiles.forEach((tile, i) => {
    tile.style.animationDelay = `${i * 0.08}s`;
    tile.classList.add('chooser-pop');
    // Step 3: clear the inline holdover on the next frame so the animation
    // has full control. The animation's `both` fill mode keeps the tile at
    // the right state in between.
    requestAnimationFrame(() => {
      tile.style.opacity = '';
      tile.style.transform = '';
    });
  });
}

// ---------- Chooser carousel ----------
// The chooser is a horizontal flex strip with overflow-x:auto. Native swipe
// works on touch out of the box; this block adds mouse click-and-drag on
// desktop, and suppresses the tile-click that would otherwise fire when the
// user releases after a drag.
let _chooserDragSuppress = false;   // set true on a real drag, consumed by the click handler
if (chooser) {
  // --- Mouse drag → horizontal scroll ---
  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let moved = 0;
  const DRAG_THRESHOLD = 6; // px of movement before we treat the gesture as a drag

  chooser.addEventListener('mousedown', (e) => {
    // Only left-button drags; let middle/right clicks pass through (so middle-
    // click on an anchor still opens in a new tab).
    if (e.button !== 0) return;
    isDown = true;
    startX = e.clientX;
    startScroll = chooser.scrollLeft;
    moved = 0;
    chooser.classList.add('is-dragging');
  });
  // Listen on the window so we keep tracking even if the pointer leaves the
  // carousel mid-drag.
  window.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > moved) moved = Math.abs(dx);
    if (moved > DRAG_THRESHOLD) {
      // Once it's a real drag, prevent text selection / native drag artifacts.
      e.preventDefault();
      chooser.scrollLeft = startScroll - dx;
    }
  });
  window.addEventListener('mouseup', () => {
    if (!isDown) return;
    isDown = false;
    chooser.classList.remove('is-dragging');
    // Was the gesture a meaningful drag? If yes, swallow the next click so the
    // user doesn't get teleported into a library by accident at the end of a
    // pan. The flag is consumed by the click handler below.
    _chooserDragSuppress = moved > DRAG_THRESHOLD;
  });

  // Wire chooser-tile clicks to setPlatform — same effect as clicking a pill.
  chooser.querySelectorAll('.chooser-tile').forEach(tile => {
    tile.addEventListener('click', (e) => {
      // If the user just dragged, this click is the tail of the drag gesture
      // — eat it and reset the flag so the *next* real click works.
      if (_chooserDragSuppress) {
        e.preventDefault();
        e.stopImmediatePropagation();
        _chooserDragSuppress = false;
        return;
      }
      // Anchor href is set for SEO + middle-click; cmd/ctrl-click should still
      // open in a new tab via the browser default, so we only preventDefault
      // on plain left-clicks.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      const platform = tile.dataset.platform;
      if (platform) setPlatform(platform);
    });
    // Catch the native HTML5 dragstart that fires on anchors — without this,
    // some browsers begin a link-drag operation that competes with the scroll.
    tile.addEventListener('dragstart', (e) => e.preventDefault());
  });
}

// ---------- SEO: title, description, canonical, JSON-LD per URL ----------
// Called whenever the URL changes (platform switch, category switch, ad open/close,
// popstate). Updates <title>, <meta description>, <link rel=canonical>, and the
// page-level JSON-LD schema so each URL communicates its content to crawlers.
const SITE_ORIGIN = 'https://library.revenuagency.io';
function findAdByUrl(parsed) {
  if (!parsed.category || parsed.adId == null) return null;
  return allAds.find(a =>
    (a.platform || 'google') === parsed.platform &&
    a.category === parsed.category &&
    a.id === parsed.adId
  );
}
function setMeta(name, value) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}
function setCanonical(url) {
  let el = document.getElementById('canonical-link');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    el.id = 'canonical-link';
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}
function setJsonLd(obj) {
  const el = document.getElementById('page-jsonld');
  if (!el) return;
  el.textContent = obj ? JSON.stringify(obj) : '';
}
function updateSEOTags() {
  try { _updateSEOTagsImpl(); } catch (e) { /* SEO failures must never break the UI */ }
}
function _updateSEOTagsImpl() {
  // Saved view — user-specific content (favorites live in localStorage), so
  // it doesn't really belong in the index. We give it a real title for the
  // browser tab + sharing, but no JSON-LD (nothing universal to describe).
  if (activePlatform === 'saved') {
    const canonical = SITE_ORIGIN + '/saved';
    setCanonical(canonical);
    document.title = 'Saved Ads | Revenu Ad Library';
    setMeta(
      'description',
      'Your saved LinkedIn ad examples, Google Ads examples, ChatGPT ads, and landing page examples across every Revenu Library, all in one place.'
    );
    setJsonLd(null);
    return;
  }
  // Homepage chooser — its own title, description, and CollectionPage JSON-LD
  // that points at the four sub-library URLs.
  if (isHomepage()) {
    const canonical = SITE_ORIGIN + '/';
    setCanonical(canonical);
    document.title = 'Revenu Library | 540+ B2B SaaS Ad Examples';
    setMeta(
      'description',
      '540+ LinkedIn ad examples, Google ad examples, ChatGPT ad examples, and landing page examples for B2B SaaS. Free swipe file with real ad templates and creative inspiration.'
    );
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': canonical,
      name: 'Revenu Ad Library',
      description: 'Free swipe file of LinkedIn ad examples, Google Ads examples, ChatGPT ad examples, and B2B SaaS landing page templates. 540+ real ads.',
      isPartOf: { '@id': SITE_ORIGIN + '/#website' },
      hasPart: [
        { '@type': 'CollectionPage', name: 'LinkedIn Ads Library',  url: SITE_ORIGIN + '/linkedin-ads' },
        { '@type': 'CollectionPage', name: 'ChatGPT Ads Library',   url: SITE_ORIGIN + '/chatgpt' },
        { '@type': 'CollectionPage', name: 'Landing Pages Library', url: SITE_ORIGIN + '/landing-pages' },
        { '@type': 'CollectionPage', name: 'Google Ads Library',    url: SITE_ORIGIN + '/google-ads' }
      ]
    });
    return;
  }
  const parsed = parsePath();
  const platform = parsed.platform;
  const cfg = platforms[platform];
  if (!cfg) return;
  const canonical = SITE_ORIGIN + window.location.pathname;
  setCanonical(canonical);

  const breadcrumbItems = [
    { name: 'Revenu Ad Library', item: SITE_ORIGIN + '/' },
    { name: cfg.label, item: SITE_ORIGIN + PLATFORM_TO_PATH[platform] }
  ];

  // Specific ad open
  const ad = findAdByUrl(parsed);
  if (ad) {
    const catLabel = (cfg.tabs.find(t => t.key === ad.category) || {}).label || ad.category;
    breadcrumbItems.push({
      name: catLabel,
      item: SITE_ORIGIN + PLATFORM_TO_PATH[platform] + '/' + ad.category
    });
    breadcrumbItems.push({
      name: ad.title,
      item: canonical
    });
    const title = `${ad.title} | ${catLabel} ${cfg.label} Example | Revenu`;
    document.title = title;
    setMeta(
      'description',
      ad.formula
        ? `${ad.title}: ${ad.formula}. A real ${cfg.label} example from the Revenu Ad Library.`
        : `${ad.title}: a real ${catLabel} ${cfg.label} example from the Revenu Ad Library. A curated collection of high-performing B2B SaaS ad and landing page templates.`
    );
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      '@id': canonical,
      name: ad.title,
      caption: ad.title + (ad.formula ? ': ' + ad.formula : ''),
      description: `${ad.title}: a ${catLabel.toLowerCase()} ${cfg.label.toLowerCase()} example curated in the Revenu Ad Library.`,
      contentUrl: SITE_ORIGIN + '/' + imagePath(ad).replace(/^\//, ''),
      keywords: [cfg.label, catLabel, ad.title, ad.formula, ad.tag, 'B2B SaaS', 'ad example'].filter(Boolean).join(', '),
      isPartOf: { '@id': SITE_ORIGIN + '/#website' },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: breadcrumbItems.map((b, i) => ({
        '@type': 'ListItem', position: i + 1, name: b.name, item: b.item
      })) }
    });
    return;
  }

  // Category page (or "All")
  if (parsed.category) {
    const catLabel = (cfg.tabs.find(t => t.key === parsed.category) || {}).label || parsed.category;
    breadcrumbItems.push({ name: catLabel, item: canonical });
    document.title = `${catLabel} | ${cfg.label} Examples | Revenu`;
    setMeta(
      'description',
      `${catLabel} ${cfg.label} examples from the Revenu Ad Library. Proven B2B SaaS templates categorized by formula.`
    );
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': canonical,
      name: `${catLabel} | ${cfg.label}`,
      description: `Collection of ${catLabel.toLowerCase()} ${cfg.label.toLowerCase()} examples.`,
      isPartOf: { '@id': SITE_ORIGIN + '/#website' },
      breadcrumb: { '@type': 'BreadcrumbList', itemListElement: breadcrumbItems.map((b, i) => ({
        '@type': 'ListItem', position: i + 1, name: b.name, item: b.item
      })) }
    });
    return;
  }

  // Platform landing (or root) — use the per-platform meta table so titles +
  // descriptions match what build-seo.js bakes into the pre-rendered HTML.
  const platformMeta = {
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
  }[platform] || {
    title: `${cfg.label} Library | Revenu`,
    description: `A free library of ${cfg.label} examples for B2B SaaS.`,
  };
  document.title = platformMeta.title;
  setMeta('description', platformMeta.description);
  setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': canonical,
    name: `${cfg.label} Library`,
    description: `Curated library of ${cfg.label} examples for B2B SaaS marketing.`,
    isPartOf: { '@id': SITE_ORIGIN + '/#website' },
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: breadcrumbItems.map((b, i) => ({
      '@type': 'ListItem', position: i + 1, name: b.name, item: b.item
    })) }
  });
}

// ---------- Feature pills (3 bullet badges) ----------
function renderFeaturePills() {
  const cfg = currentPlatform();
  featurePillsContainer.innerHTML = cfg.features.map((text, i) => `
    <div class="feature-pill"><span class="feature-pill-num">${i + 1}</span>${escapeHtml(text)}</div>
  `).join('');
}

// ---------- Category tabs (desktop) + custom dropdown (mobile) ----------
function renderTabs() {
  const cfg = currentPlatform();
  // Desktop tabs
  tabsContainer.innerHTML = cfg.tabs.map(t => `
    <button class="tab${t.key === activeFilter ? ' is-active' : ''}" data-filter="${escapeHtml(t.key)}" role="tab">${escapeHtml(t.shortLabel || t.label)}</button>
  `).join('');
  tabsContainer.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });
  // Mobile custom dropdown
  const activeTab = cfg.tabs.find(t => t.key === activeFilter);
  filterDropdownLabel.textContent = activeTab ? activeTab.label : '';
  filterDropdownMenu.innerHTML = cfg.tabs.map(t => `
    <button type="button" role="option" class="dropdown-option${t.key === activeFilter ? ' is-active' : ''}" data-filter="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>
  `).join('');
  filterDropdownMenu.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setFilter(opt.dataset.filter);
      filterDropdown.classList.remove('is-open');
      filterDropdownTrigger.setAttribute('aria-expanded', 'false');
    });
  });
}

function setFilter(key, opts = {}) {
  if (!key || key === activeFilter) return;
  activeFilter = key;
  // Sync desktop tabs
  tabsContainer.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.filter === key);
  });
  // Sync mobile dropdown
  const cfg = currentPlatform();
  const activeTab = cfg.tabs.find(t => t.key === key);
  if (activeTab) filterDropdownLabel.textContent = activeTab.label;
  filterDropdownMenu.querySelectorAll('.dropdown-option').forEach(o => {
    o.classList.toggle('is-active', o.dataset.filter === key);
  });
  // If favorites filter is on and the new category has zero favorited ads,
  // automatically release the filter so the gallery isn't empty.
  if (getFavoritesMode()) {
    const hasAnyFavInCategory = allAds.some(ad =>
      (ad.platform || 'google') === activePlatform &&
      (key === 'all' || ad.category === key) &&
      isFavorite(ad)
    );
    if (!hasAnyFavInCategory) {
      favoritesModeByPlatform[activePlatform] = false;
      if (typeof syncFavoritesButton === 'function') syncFavoritesButton();
    }
  }
  render();
  // Push URL so categories are sharable. Skip when popstate / deep-link triggered it.
  if (opts.updateUrl !== false) {
    const newPath = buildPath(activePlatform, key, null);
    if (window.location.pathname !== newPath) {
      safePushState({ category: key }, newPath);
    }
  }
  if (typeof updateSEOTags === 'function') updateSEOTags();
}

// Toggle mobile filter dropdown
filterDropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = filterDropdown.classList.toggle('is-open');
  filterDropdownTrigger.setAttribute('aria-expanded', String(isOpen));
});

// ---------- Gallery ----------
// `animate` is true on initial load and platform switches, false on category-tab switches.
// render() refilters from allAds; renderCards() just paints whatever is currently in visibleAds
// (used by the shuffle button so it doesn't re-sort back into the original order).
// True when an ad has an explicit position priority for the given category.
// Used both for "appears in this secondary category" and ordering within it.
function isPinnedTo(ad, filter) {
  return ad.priority && typeof ad.priority[filter] === 'number';
}
// Position priority for an ad in a category (lower = higher in list).
// Returns Infinity for ads without an explicit priority — they sort to the end.
function adPriority(ad, filter) {
  if (ad.priority && typeof ad.priority[filter] === 'number') return ad.priority[filter];
  return Infinity;
}

function render(animate = false) {
  if (activePlatform === 'saved') {
    // Saved view: every favorited ad across all platforms. The "category"
    // tabs here represent the SOURCE platform (linkedin / google / landing).
    visibleAds = allAds.filter(ad => {
      if (!isFavorite(ad)) return false;
      if (activeFilter !== 'all' && (ad.platform || 'google') !== activeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = `${ad.title || ''} ${ad.formula || ''} ${ad.tag || ''} ${ad.image || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // No priority sort for saved — favorites surface in the order ads.js
    // declares them, so categories cluster naturally (linkedin then google then landing).
    renderCards(animate);
    return;
  }
  visibleAds = allAds.filter(ad => {
    if ((ad.platform || 'google') !== activePlatform) return false;
    // 'all' shows every category in the current platform
    if (activeFilter !== 'all') {
      // Match if this is the ad's primary category, or if it's pinned here
      const matchesCategory = ad.category === activeFilter || isPinnedTo(ad, activeFilter);
      if (!matchesCategory) return false;
    }
    if (getFavoritesMode() && !isFavorite(ad)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = `${ad.title || ''} ${ad.formula || ''} ${ad.tag || ''} ${ad.image || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  applyPinnedSort(visibleAds);
  renderCards(animate);
}

// Sort ads by their priority for the current filter (lower = higher in list).
// Ads without an explicit priority remain in their natural ads.js order at the end
// (stable sort). Works for any filter including 'all' — set `priority: { all: N }`
// on an ad to bubble it to position N when viewing the All tab.
function applyPinnedSort(arr) {
  arr.sort((a, b) => adPriority(a, activeFilter) - adPriority(b, activeFilter));
}

function renderCards(animate = false) {
  gallery.innerHTML = '';
  if (visibleAds.length === 0) {
    emptyState.hidden = false;
    if (activePlatform === 'saved') {
      // User-facing message — not a developer hint. Different copy depending
      // on whether they have zero favorites or just zero in this sub-category.
      const totalFavs = favorites.size;
      const tab = findTab('saved', activeFilter);
      const tabLabel = tab ? tab.label : '';
      if (totalFavs === 0) {
        emptyState.innerHTML = `<strong>No favorites yet.</strong><br>Tap the <span aria-label="heart">❤</span> on any ad to save it here for later.`;
      } else {
        emptyState.innerHTML = `No favorites in <strong>${escapeHtml(tabLabel)}</strong> yet — try the All tab.`;
      }
      return;
    }
    // Favorites filter is on but nothing matches in this library — friendly
    // message in the same tone as the /saved page (never the dev-only
    // "drop images / edit ads.js" hint).
    if (getFavoritesMode()) {
      // Landing-page cards are sections of a page, not "ads", so use "block"
      // there. LinkedIn + Google use "ad".
      const itemWord = activePlatform === 'landing' ? 'block' : 'ad';
      emptyState.innerHTML = `<strong>No favorites yet.</strong><br>Tap the <span aria-label="heart">❤</span> on any ${itemWord} to save it here for later.`;
      return;
    }
    // Truly empty category (no ads at all) — this is a dev-only state since
    // every category ships with content, but keep a sane fallback just in case.
    const cfg = currentPlatform();
    const tab = findTab(activePlatform, activeFilter);
    const tabFolder = tab ? tab.folder : activeFilter;
    emptyState.innerHTML = `No ads in <code>${escapeHtml(cfg.label)} → ${escapeHtml(tabFolder)}</code> yet. Drop images into <code>images/${escapeHtml(cfg.folder)}/${escapeHtml(tabFolder)}/</code> and add an entry to <code>ads.js</code> with <code>platform: "${activePlatform}"</code> and <code>category: "${activeFilter}"</code>.`;
    return;
  }
  emptyState.hidden = true;

  visibleAds.forEach((ad, i) => {
    const card = document.createElement('article');
    card.className = `card card-${ad.platform || 'google'}`;
    // Pop animation on the first 6 cards — only on initial load + platform switches
    if (animate && i < 6) {
      card.classList.add('card-pop');
      card.style.animationDelay = `${i * 0.08}s`;
    }
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open ${ad.title}`);
    const fav = isFavorite(ad);
    // ChatGPT Playbook + Setup, and LinkedIn Conversation Ads, show title + tag
    // only in the grid (description is kept in ads.js so it still drives SEO
    // meta / JSON-LD on the per-ad URL).
    const hideCardSub =
      (ad.platform === 'chatgpt' && (ad.category === 'playbook' || ad.category === 'setup')) ||
      (ad.platform === 'linkedin' && ad.category === 'convo-ads');
    card.innerHTML = `
      <div class="card-thumb">
        <img src="${imagePath(ad)}" alt="${escapeHtml(ad.title)}" loading="lazy" />
      </div>
      <div class="card-body">
        <div class="card-text">
          <h3 class="card-title">${escapeHtml(ad.title)}</h3>
          ${ad.formula && !hideCardSub ? `<p class="card-sub">${escapeHtml(ad.formula)}</p>` : ''}
        </div>
        ${ad.tag ? `<span class="card-tag">${escapeHtml(ad.tag)}</span>` : ''}
        <button class="card-heart${fav ? ' is-favorited' : ''}" type="button" aria-label="${fav ? 'Remove favorite' : 'Add favorite'}" title="${fav ? 'Remove favorite' : 'Add favorite'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
    `;
    card.addEventListener('click', () => openLightbox(i));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(i);
      }
    });
    // Heart toggle — stop propagation so it doesn't also open the lightbox
    const heart = card.querySelector('.card-heart');
    if (heart) {
      heart.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(ad);
        const nowFav = isFavorite(ad);
        heart.classList.toggle('is-favorited', nowFav);
        heart.setAttribute('aria-label', nowFav ? 'Remove favorite' : 'Add favorite');
        heart.setAttribute('title', nowFav ? 'Remove favorite' : 'Add favorite');
        const svg = heart.querySelector('svg');
        if (svg) svg.setAttribute('fill', nowFav ? 'currentColor' : 'none');
        // If favorites filter is on (or we're on the /saved view) and this
        // card just got unfavorited, re-render so it disappears.
        if ((getFavoritesMode() || activePlatform === 'saved') && !nowFav) render();
      });
      heart.addEventListener('keydown', (e) => {
        // Prevent space/enter from bubbling to the card
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      });
    }
    gallery.appendChild(card);
  });
  isFirstRender = false;
}

// ---------- Platform switching ----------
const platformNav = document.querySelector('.platform-nav');

function setPlatform(platform, opts = {}) {
  if (!platform) return;
  // Coming from the chooser homepage, the user can pick the same platform that
  // happens to be the current default (e.g. clicking "LinkedIn Ads" while
  // activePlatform === 'linkedin'). We still need to navigate away from "/",
  // so don't early-return when we're on the homepage.
  const wasHomepage = isHomepage();
  if (platform === activePlatform && !wasHomepage) return;
  // Sync desktop pills
  platformPills.forEach(p => p.classList.toggle('is-active', p.dataset.platform === platform));
  activePlatform = platform;
  activeFilter = currentPlatform().defaultTab;
  // Flip the chooser flag BEFORE the URL update so applyHomepageMode (which
  // runs even if pushState fails) sees the correct state.
  chooserActive = false;
  // Push the new URL — wrapped because pushState throws on file:// when the
  // target path leaves the file's directory.
  if (opts.updateUrl !== false) {
    const newPath = PLATFORM_TO_PATH[platform];
    if (newPath && window.location.pathname !== newPath) {
      safePushState({ platform }, newPath);
    }
  }
  // Sync mobile dropdown label + active option
  const cfg = currentPlatform();
  platformDropdownLabel.textContent = cfg.label;
  platformDropdownMenu.querySelectorAll('.dropdown-option').forEach(o => {
    o.classList.toggle('is-active', o.dataset.platform === platform);
  });
  // Flip chooser <-> gallery for the new URL, then update the rest.
  applyHomepageMode();
  updateHeadline();
  renderFeaturePills();
  renderTabs();
  // Reflect the new platform's stored favorites-filter state on the button
  if (typeof syncFavoritesButton === 'function') syncFavoritesButton();
  render(true); // platform switch — animate
}

// Sync platform + category + lightbox state when the user hits back / forward.
window.addEventListener('popstate', () => {
  // Re-derive chooser state from the URL the browser just navigated to.
  chooserActive = _isChooserUrl();
  // Back-button to homepage: show the chooser, close any open lightbox.
  if (isHomepage()) {
    if (!lightbox.hidden) closeLightbox({ updateUrl: false });
    applyHomepageMode();
    updateHeadline();
    animateChooserIfHome();
    return;
  }
  const parsed = parsePath();
  // Platform change first (e.g., /linkedin-ads/problem-3 → /google-ads)
  if (parsed.platform !== activePlatform) {
    setPlatform(parsed.platform, { updateUrl: false });
  }
  // Category change (e.g., switching to /linkedin-ads/product)
  const targetCategory = parsed.category || platforms[parsed.platform].defaultTab;
  if (targetCategory !== activeFilter) {
    setFilter(targetCategory, { updateUrl: false });
  }
  if (parsed.adId != null && parsed.category) {
    // Navigated to a deep-link URL — make sure the right ad is open
    const ad = findAd(parsed.platform, parsed.category, parsed.adId);
    if (ad) {
      const idx = visibleAds.indexOf(ad);
      if (idx !== -1) {
        if (lightbox.hidden) {
          openLightbox(idx, { updateUrl: false });
        } else {
          currentIndex = idx;
          updateLightbox();
        }
      }
    }
  } else if (!lightbox.hidden) {
    // Navigated away from a deep-link URL — close the lightbox
    closeLightbox({ updateUrl: false });
  }
});

// Desktop pills
platformPills.forEach(pill => {
  pill.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = pill.dataset.platform;
    if (target === 'home') {
      goHome();
    } else {
      setPlatform(target);
    }
  });
});

// Navigate back to the chooser homepage (/) without a full page reload. Mirrors
// what setPlatform does for libraries, but for the no-platform homepage state.
function goHome() {
  if (isHomepage()) return; // already there
  chooserActive = true;
  if (window.location.pathname !== '/') {
    safePushState({ home: true }, '/');
  }
  // Sync chip active-state: only the Home chip is active on the homepage.
  platformPills.forEach(p => p.classList.toggle('is-active', p.dataset.platform === 'home'));
  applyHomepageMode();
  updateHeadline();
  animateChooserIfHome();
}

// Build the mobile platform dropdown menu options
function renderPlatformDropdown() {
  // Saved is a desktop-only feature — the heart pill in the header is hidden
  // on mobile, and we deliberately keep "Saved" out of the mobile dropdown
  // too so the experience there stays focused on the three core libraries.
  const options = Object.entries(platforms)
    .filter(([key]) => key !== 'saved')
    .map(([key, cfg]) => ({ key, label: cfg.label }));
  platformDropdownLabel.textContent = currentPlatform().label;
  platformDropdownMenu.innerHTML = options.map(o => `
    <button type="button" role="option" class="dropdown-option${o.key === activePlatform ? ' is-active' : ''}" data-platform="${escapeHtml(o.key)}">${escapeHtml(o.label)}</button>
  `).join('');
  platformDropdownMenu.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setPlatform(opt.dataset.platform);
      platformDropdown.classList.remove('is-open');
      platformDropdownTrigger.setAttribute('aria-expanded', 'false');
    });
  });
}
renderPlatformDropdown();

// Toggle the mobile platform dropdown
platformDropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = platformDropdown.classList.toggle('is-open');
  platformDropdownTrigger.setAttribute('aria-expanded', String(isOpen));
});

// Close mobile dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (platformDropdown && !platformDropdown.contains(e.target)) {
    platformDropdown.classList.remove('is-open');
    platformDropdownTrigger.setAttribute('aria-expanded', 'false');
  }
  if (filterDropdown && !filterDropdown.contains(e.target)) {
    filterDropdown.classList.remove('is-open');
    filterDropdownTrigger.setAttribute('aria-expanded', 'false');
  }
});

// ---------- Lightbox ----------
// Preload + decode an image so we don't paint the lightbox until pixels are
// actually ready. Resolves either way (errors are swallowed so the UI never gets stuck).
function preloadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = src;
    const finish = () => {
      if (img.decode) img.decode().then(resolve, resolve);
      else resolve();
    };
    if (img.complete && img.naturalWidth > 0) { finish(); return; }
    img.onload = finish;
    img.onerror = () => resolve();
  });
}

// Warm prev / next so swipes & arrow keys are usually instant.
function preloadNeighbors() {
  if (visibleAds.length < 2) return;
  const prev = visibleAds[(currentIndex - 1 + visibleAds.length) % visibleAds.length];
  const next = visibleAds[(currentIndex + 1) % visibleAds.length];
  if (prev) preloadImage(imagePath(prev));
  if (next && next !== prev) preloadImage(imagePath(next));
}

// Sequence counter so rapid clicks / keypresses don't race each other.
let navSeq = 0;

function updateCaption(ad) {
  const parts = [ad.title];
  if (ad.formula) parts.push(ad.formula);
  lbCaption.textContent = parts.join(' — ');
}

function syncUrlToCurrentAd() {
  const ad = visibleAds[currentIndex];
  if (!ad || ad.id == null) return;
  const newPath = adPath(ad);
  if (window.location.pathname !== newPath) {
    safeReplaceState({ adId: ad.id }, newPath);
  }
  if (typeof updateSEOTags === 'function') updateSEOTags();
}

async function openLightbox(index, opts = {}) {
  currentIndex = index;
  const ad = visibleAds[currentIndex];
  if (!ad) return;
  const mySeq = ++navSeq;

  // Pre-decode the first frame before we paint anything, so we never see the
  // previously-loaded image flash through. Hold opacity at 0 until ready.
  lbImage.style.transition = 'none';
  lbImage.style.transform = '';
  lbImage.style.opacity = '0';
  lbImage.src = imagePath(ad);
  lbImage.alt = ad.title;
  updateCaption(ad);

  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';

  // Wait for the image (or 400ms — whichever comes first) so animated WebPs
  // or slow-loading images can't deadlock the open.
  await Promise.race([
    preloadImage(imagePath(ad)),
    new Promise(r => setTimeout(r, 400))
  ]);
  if (mySeq !== navSeq) return; // user already navigated past this

  if (opts.slideIn) {
    // Position off-screen left, then spring to center
    lbImage.style.transition = 'none';
    lbImage.style.transform = 'translateX(-110vw) rotate(-4deg)';
    lbImage.style.opacity = '0';
    void lbImage.offsetWidth;
    requestAnimationFrame(() => {
      lbImage.style.transition = 'transform 0.6s cubic-bezier(0.22, 1.15, 0.36, 1), opacity 0.45s ease';
      lbImage.style.transform = '';
      lbImage.style.opacity = '';
      const cleanup = () => {
        lbImage.removeEventListener('transitionend', cleanup);
        lbImage.style.transition = '';
      };
      lbImage.addEventListener('transitionend', cleanup, { once: true });
    });
  } else {
    // Quick fade-in so the swap doesn't pop
    lbImage.style.transition = 'opacity 0.18s ease';
    lbImage.style.opacity = '';
  }

  // Push the ad's URL so it can be shared / linked.
  if (opts.updateUrl !== false && ad.id != null) {
    const newPath = adPath(ad);
    if (window.location.pathname !== newPath) {
      safePushState({ adId: ad.id, platform: ad.platform || 'google' }, newPath);
    }
  }

  updateSEOTags();
  preloadNeighbors();
}

function closeLightbox(opts = {}) {
  navSeq++; // cancel any in-flight transition
  lightbox.hidden = true;
  document.body.style.overflow = '';
  // Reset any in-flight drag / slide transform so next open is clean
  lbImage.style.transition = 'none';
  lbImage.style.transform = '';
  lbImage.style.opacity = '';
  // Drop the ad-specific URL but keep the category — replaceState so we don't
  // pile up history entries from close events.
  if (opts.updateUrl !== false) {
    const newPath = buildPath(activePlatform, activeFilter, null);
    if (newPath && window.location.pathname !== newPath) {
      safeReplaceState({}, newPath);
    }
  }
  if (typeof updateSEOTags === 'function') updateSEOTags();
}

// step(): used by desktop prev/next buttons, arrow keys, and the
// tap-to-advance click handler. Crossfades the image and waits for the new
// one to decode so there's never a flash of the previous image.
// Fully synchronous — no awaits, no race conditions. Used by the prev/next
// arrows, arrow keys, and tap-to-advance click. Image src change is instant;
// the browser handles the visual swap. Loading is masked by the preloadNeighbors
// warm-up which usually means the next/prev image is already cached.
function step(delta) {
  if (visibleAds.length < 2) return;
  navSeq++; // cancel any in-flight slide animation (commitSwipe checks this)
  currentIndex = (currentIndex + delta + visibleAds.length) % visibleAds.length;
  const ad = visibleAds[currentIndex];
  if (!ad) return;
  // Reset any drag/swipe transform left behind so the new image isn't off-screen
  lbImage.style.transition = 'none';
  lbImage.style.transform = '';
  lbImage.style.opacity = '';
  lbImage.src = imagePath(ad);
  lbImage.alt = ad.title;
  updateCaption(ad);
  syncUrlToCurrentAd();
  preloadNeighbors();
}
lbClose.addEventListener('click', closeLightbox);
lbPrev.addEventListener('click', () => step(-1));
lbNext.addEventListener('click', () => step(1));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

// ---------- Touch drag (Tinder-style) on the lightbox image ----------
// Mobile only: the image follows the finger horizontally. If the drag
// crosses SWIPE_THRESHOLD, the image slides off and the next/previous ad
// slides in from the opposite side. Otherwise it springs back to center.
// A tap (no significant movement) advances to the next ad via the click
// handler below — that handler also covers desktop click-to-advance.
const SWIPE_THRESHOLD = 80; // px past which a swipe commits to navigation
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragAxis = null; // 'x' | 'y' | null — locked on first significant movement
let dragDx = 0;
let swipeDidNavigate = false;

function applyDrag(dx) {
  // Subtle rotation + fade as the card pulls away
  const rot = (dx / window.innerWidth) * 10;
  const opacity = Math.max(0.5, 1 - Math.abs(dx) / (window.innerWidth * 0.8));
  lbImage.style.transition = 'none';
  lbImage.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
  lbImage.style.opacity = String(opacity);
}

function snapBack() {
  lbImage.style.transition = 'transform 0.28s cubic-bezier(0.22, 1.15, 0.36, 1), opacity 0.25s ease';
  lbImage.style.transform = '';
  lbImage.style.opacity = '';
}

async function commitSwipe(direction) {
  // direction: +1 (next, swipe-left) or -1 (prev, swipe-right)
  if (visibleAds.length < 2) { snapBack(); return; }

  const mySeq = ++navSeq;
  const sign = direction === 1 ? -1 : 1;
  const targetIdx = (currentIndex + direction + visibleAds.length) % visibleAds.length;
  const targetAd = visibleAds[targetIdx];
  const targetSrc = imagePath(targetAd);

  // Start preloading + decoding the next image immediately. By the time the
  // swipe-off animation ends, the new image is almost always cache-warm.
  const preloadDone = preloadImage(targetSrc);

  // Phase 1 — throw the current image off-screen.
  // We use a setTimeout matching the transition duration instead of waiting
  // on `transitionend`. If anything cancels the transition (e.g. a follow-up
  // touch resetting transition to 'none'), `transitionend` never fires and
  // the await would hang forever — which would leave the image stuck off-screen
  // and break every subsequent navigation.
  const PHASE_1_MS = 260;
  lbImage.style.transition = `transform ${PHASE_1_MS}ms cubic-bezier(0.5, 0, 0.75, 0.1), opacity 0.22s ease`;
  lbImage.style.transform = `translateX(${sign * window.innerWidth}px) rotate(${sign * 10}deg)`;
  lbImage.style.opacity = '0';

  await Promise.all([
    new Promise(resolve => setTimeout(resolve, PHASE_1_MS + 10)),
    preloadDone
  ]);
  if (mySeq !== navSeq) return;

  // Swap src + caption + URL. Image is already decoded so no flash.
  currentIndex = targetIdx;
  lbImage.src = targetSrc;
  lbImage.alt = targetAd.title;
  updateCaption(targetAd);
  syncUrlToCurrentAd();

  // Decode the now-attached element too, belt-and-braces against any final blink
  if (lbImage.decode) { try { await lbImage.decode(); } catch (e) {} }
  if (mySeq !== navSeq) return;

  // Phase 2 — position off-screen on the opposite side (invisible), reflow, slide in
  lbImage.style.transition = 'none';
  lbImage.style.transform = `translateX(${-sign * window.innerWidth}px) rotate(${-sign * 6}deg)`;
  lbImage.style.opacity = '0';
  void lbImage.offsetWidth;
  requestAnimationFrame(() => {
    lbImage.style.transition = 'transform 0.36s cubic-bezier(0.22, 1.05, 0.36, 1), opacity 0.3s ease';
    lbImage.style.transform = '';
    lbImage.style.opacity = '';
  });

  preloadNeighbors();
}

lbImage.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  dragStartX = e.touches[0].clientX;
  dragStartY = e.touches[0].clientY;
  dragAxis = null;
  dragDx = 0;
  isDragging = true;
  swipeDidNavigate = false;
  lbImage.style.transition = 'none';
}, { passive: true });

lbImage.addEventListener('touchmove', (e) => {
  if (!isDragging || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - dragStartX;
  const dy = e.touches[0].clientY - dragStartY;
  if (!dragAxis) {
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      dragAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  }
  if (dragAxis === 'x') {
    dragDx = dx;
    applyDrag(dx);
  }
}, { passive: true });

lbImage.addEventListener('touchend', () => {
  if (!isDragging) return;
  isDragging = false;
  if (dragAxis !== 'x') return; // vertical or no movement — leave alone
  if (Math.abs(dragDx) > SWIPE_THRESHOLD) {
    swipeDidNavigate = true;
    commitSwipe(dragDx < 0 ? 1 : -1);
  } else {
    snapBack();
  }
}, { passive: true });

lbImage.addEventListener('touchcancel', () => {
  if (!isDragging) return;
  isDragging = false;
  if (dragAxis === 'x') snapBack();
}, { passive: true });

// ---------- Desktop mouse drag on the lightbox image ----------
// Mirrors the touch drag — mousedown locks state, mousemove on the document
// updates the transform (so the drag continues even if the cursor leaves the
// image), mouseup commits or snaps back. A "suppress next click" flag stops
// drags from also firing the tap-to-advance click handler.
let isMouseDragging = false;
let suppressNextClick = false;

lbImage.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left-button only
  if (lightbox.hidden) return;
  e.preventDefault(); // stop native image drag-and-drop
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragAxis = null;
  dragDx = 0;
  isMouseDragging = true;
  swipeDidNavigate = false;
  lbImage.style.transition = 'none';
  document.body.classList.add('lb-dragging');
});

document.addEventListener('mousemove', (e) => {
  if (!isMouseDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (!dragAxis) {
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      dragAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  }
  if (dragAxis === 'x') {
    dragDx = dx;
    applyDrag(dx);
  }
});

document.addEventListener('mouseup', () => {
  if (!isMouseDragging) return;
  isMouseDragging = false;
  document.body.classList.remove('lb-dragging');

  // Any meaningful movement should suppress the click that mouseup triggers.
  if (dragAxis !== null) suppressNextClick = true;

  if (dragAxis === 'x') {
    if (Math.abs(dragDx) > SWIPE_THRESHOLD) {
      swipeDidNavigate = true;
      commitSwipe(dragDx < 0 ? 1 : -1);
    } else {
      snapBack();
    }
  }
});

lbImage.addEventListener('click', () => {
  // Suppress the click that fires after a swipe or a mouse drag
  if (swipeDidNavigate || suppressNextClick) {
    swipeDidNavigate = false;
    suppressNextClick = false;
    return;
  }
  step(1);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
