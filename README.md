# World News Globe

A lightweight interactive world-news explorer built around a 3D globe, static Google News RSS caches, and optional live Cloudflare Worker requests.

Live site:

`https://trina0224.github.io/world-news-globe/`

## What it does

- Interactive 3D globe with country selection.
- Traditional Chinese / English / Japanese UI.
- Japan drill-down with all 47 prefectures.
- United States drill-down with all 50 states + Washington, DC.
- Country-level news for the rest of the world.
- Responsive layout for desktop, iPad, and phone.
- PWA support for installable/mobile use.
- URL state for country, region, language, and keyword sharing.

## News architecture

The default news experience is intentionally static-first:

1. GitHub Actions fetches Google News RSS on a schedule.
2. Ranked results are written into static JSON files.
3. GitHub Pages serves the globe and cached news without requiring a backend for normal browsing.

This keeps the site inexpensive, resilient, and fast even when live upstream services are unavailable.

The deployment workflow attempts a refresh **every two hours**, validating the country, Japan prefecture, and US state datasets before publishing. It restores the last-known-good snapshot from GitHub Actions cache (or bootstraps it from the published Pages site when the cache is cold). If an upstream RSS fetch fails, the workflow skips publishing and leaves the previously deployed site intact. Prefecture GeoJSON is reused instead of being downloaded on every refresh.

## Keyword search

A single global keyword can be applied while browsing the globe.

- When a keyword is active, selecting a country, US state, or Japan prefecture searches that area for the keyword.
- The keyword is also reflected in the URL so the current view can be shared.
- Empty keyword results stay empty rather than falling back to unrelated cached headlines.
- Keyword search localizes common topics for the selected news edition: `election` becomes `選舉` in Taiwan and `選挙` in Japan. Other terms use best-effort translation with a 1.2-second wait limit; failures use the original term. The actual search term is shown below the input.
- Each search uses one final RSS query rather than parallel original/translated queries. Valid zero results are not cached. Only successful results for the same country, region, and keyword may be reused, with a stale label if an upstream error requires fallback.

Live keyword search is handled by the Cloudflare Worker at:

`https://world-news-refresh.kozakurayuki.workers.dev`

The Worker queries Google News RSS directly and returns ranked results to the frontend.

### Keyword reliability

The frontend uses identity-safe single-flight control: duplicate triggers share one request, while old responses cannot overwrite a newer keyword, an empty-input Search, or the world view. Ordinary cached-news responses also check the current request generation before updating the panel.

The Worker also retries transient Google News failures such as HTTP 429, HTTP 5xx, network errors, and timeouts with short backoff. This is important because Google News RSS can occasionally return temporary 503 responses even when the same request succeeds again shortly afterward.

A temporary diagnostic endpoint is available for troubleshooting live keyword behavior:

`/debug-keyword?country=Japan&keyword=AI`

It uses the same search/localization pipeline and reports the version, request ID, actual search term, cache state, and per-attempt diagnostics. This is a separate request, not a replay of a prior failure.

See [keyword behavior and regression tests](docs/keyword-search.md) for limits and testing instructions. The [news quality review protocol](docs/news-quality-review.md) separates technical reliability from relevance, editorial diversity, and important-event omissions; it is not yet a completed quality assessment.

## Live refresh and translation

The Cloudflare Worker also exposes optional live-refresh and headline-translation endpoints.

- Cached GitHub Pages news remains the default path.
- **Refresh this area** requests a live update when needed.
- Headline translation is optional and uses Cloudflare Workers AI when available.
- Original headline links remain unchanged.

## Maps and interaction

The main world view uses Globe.gl and WebGL.

Japan and the United States use separate fixed SVG overlays for regional drill-down. This avoids unnecessary WebGL complexity on iPad and mobile devices while keeping pinch, zoom, drag, and tap interactions stable.

## Main files

- `app-v2.js` — globe, base UI state, country selection
- `news-static.js` — static cached-news adapter
- `japan-overlay.js` — Japan prefecture map
- `us-overlay.js` — US state/DC map
- `keyword-search.js` — keyword UI and frontend request control
- `live-refresh.js` — live refresh and headline translation UI
- `client-state.js` — URL state and service-worker registration
- `cloudflare/news-refresh/src/router.js` — Worker routes
- `cloudflare/news-refresh/src/keyword.js` — live keyword search and upstream retry logic
- `scripts/` — Google News RSS fetch, ranking, and map-generation scripts
- `.github/workflows/pages.yml` — scheduled news refresh and GitHub Pages deployment

## Deployment

GitHub Pages is deployed through GitHub Actions. The workflow builds and deploys in separate jobs and waits for the uploaded Pages artifact to become visible before deployment. The news snapshot uses GitHub Actions cache, which is best effort; the published site is the recovery source if that cache expires. A skipped refresh is logged as a warning/notice rather than taking the existing site offline.

If Pages is not already enabled, open:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

The Cloudflare Worker is configured in:

`cloudflare/news-refresh/wrangler.jsonc`

and can be deployed with Wrangler when needed.

## Design goal

The project is intentionally designed around free or low-cost infrastructure and graceful degradation:

- GitHub Pages handles the main site.
- GitHub Actions prepares cached news.
- Cloudflare Worker adds live functionality without being required for ordinary browsing.
- If live search fails temporarily, the static news experience still works.

**One topic. Different countries. Different headlines.**
