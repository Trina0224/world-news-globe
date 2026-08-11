# World News Globe

A lightweight 3D globe for exploring recent news around the world.

## First prototype

- Spin, zoom, hover, and click countries on a 3D globe.
- Fetch recent headlines from GDELT without an API key.
- UI language switch: Traditional Chinese / English / Japanese.
- United States: filter news by the 50 states.
- Japan: filter news by the 47 prefectures.
- Other countries: country-level news.
- Responsive layout for desktop, iPad, and phone.

Headlines intentionally remain in their original language for now. A translation layer can be added later without changing the core news-source architecture.

## GitHub Pages

This repository includes a GitHub Pages Actions workflow. If Pages is not already enabled, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.

The expected site URL is:

`https://trina0224.github.io/world-news-globe/`

## Notes

Regional filtering is query-based. A state or prefecture selection searches recent local references within the selected country's news rather than relying on a dedicated state/prefecture news API.

Deployment trigger refreshed after enabling GitHub Pages.
