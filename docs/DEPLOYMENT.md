# Deployment

The site is static files. It must be served over **HTTPS** (service worker, install prompt) and the
headers in `_headers` should be applied (they carry the CSP).

## Cloudflare Pages (recommended; free)

1. Push the repo to GitHub.
2. Cloudflare dashboard -> Pages -> Connect repo. Build command: _(none)_. Output directory: `/`.
3. `_headers` is applied automatically. Done. Custom domain optional.

## Netlify

Same: no build command, publish directory `.`. `_headers` is supported as-is.

## Vercel / nginx / Apache

Copy the header values from `_headers` into `vercel.json` `headers`, or nginx `add_header` lines. Keep:
CSP, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `no-cache` for HTML and `sw.js`,
long `immutable` cache for `/assets/fonts/`.

## Pre-release checklist

- [ ] `npm test` and `npm run test:e2e` green
- [ ] `CACHE_VERSION` in `sw.js` bumped (otherwise returning users keep the old files)
- [ ] Lighthouse PWA + Accessibility on the deployed URL
- [ ] Open on a real low-end Android phone, airplane mode after first load
- [ ] Lawyer chat: either the API is deployed and `API_BASE` is set, or the demo is still clearly labelled. Phone numbers and the Google button are placeholders until verified.
- [ ] If AI is on: proxy origin in `connect-src` and `ALLOWED_ORIGINS`

## Local

`npm start` or `start.bat`. Do not open via `file://` (ES modules are blocked).
