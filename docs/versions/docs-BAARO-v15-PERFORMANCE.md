# BAARO 2.0 v15 — Performance & Global Web Foundation

## Changes

- Heavy application tabs are lazy-loaded to reduce the initial JavaScript payload.
- Recharts and Daily are isolated into dedicated Rollup chunks.
- Supabase and React dependencies are separated from application code.
- Service Worker cache is versioned and bounded to avoid unbounded runtime-cache growth.
- Navigation remains network-first so deployments are not trapped behind stale HTML.
- Only same-origin static assets are runtime-cacheable; API and Supabase traffic is never cached by the Service Worker.
- Added `npm run check:performance` for a lightweight static validation.

## Validation

The local environment did not complete `npm ci` within the available network timeout, so a real Vite production build remains a required external validation step.

Run in a network-enabled CI environment:

```bash
npm ci
npm run check:lock
npm run check:performance
npm run check:ai
npm run check:notifications
npm run build
```
