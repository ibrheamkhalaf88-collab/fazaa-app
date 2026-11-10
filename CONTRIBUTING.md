# Contributing to Fazaa

Welcome. This is a small codebase on purpose: **no build step, no framework**. If you can read JavaScript, you can
change it. Read this page (5 minutes), then `docs/ARCHITECTURE.md`.

## Set up

```bash
git clone https://github.com/ibrheamkhalaf88-collab/sanad-app && cd sanad-app
npm install              # only dev tools: Playwright, ESLint
npm run dev:admin        # app + staff API + dashboards -> http://localhost:8787  (admin at /admin/)
SEED=1 npm run dev:admin # same, with demo data (lawyers, cases, a month of statistics)
```

Needs Node 20+ (22 recommended). Open the site through a server, never by double-clicking `index.html`.
The dev server signs you in as the email in `DEV_STAFF_EMAIL` (default `dev@local`, a developer);
send the header `x-dev-staff: salma@local.test` to act as a lawyer. It is **local only**: never deploy it.

## Before every commit

```bash
npm run check        # prettier + eslint + all unit tests (about 3 seconds)
npm run test:e2e     # real browser, when you touched UI or the API (needs Chromium from Playwright)
```

`npm run format` fixes formatting. CI runs the same commands.

## Where things live

| You want to change…             | Go to                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| colours, fonts, spacing         | `styles/tokens.css` (the only place with raw colours)                     |
| a screen's markup               | `index.html` (one `<section data-screen>` per screen) + `styles/screens/` |
| what a button does              | `src/ui/actions.js` (driven by `data-*` attributes in the markup)         |
| the chat and lawyer chat        | `src/features/chat/` (`lawyer-live.js` real, `lawyer-session.js` demo)    |
| how an answer is found          | `src/ai/` (rules first, then optional AI, citations are validated)        |
| law text and rule-based answers | `src/data/law/`, `src/data/answers.js`, `src/data/intents.js`             |
| the server API                  | `server/api/worker.js` (routes), `server/api/store/` (data)               |
| the staff dashboards            | `admin/` (one file per section; `charts.js` has the shared widgets)       |
| settings an operator edits      | `src/config.js`                                                           |

## Rules of the house

These exist because users may be in danger. Most are enforced by a test or by ESLint.

1. **Never paraphrase law.** Legal text is copied verbatim and fingerprinted (`tests/law-integrity.test.js`).
   Adding a law: `docs/CONTENT.md`.
2. **No `innerHTML`.** User text and AI text go in with `textContent` or `el()` from `src/core/dom.js` (ESLint blocks it).
3. **Colours only from tokens.** Use `var(--token)`. There is deliberately no red.
4. **No new third-party request.** The CSP in `_headers` blocks it anyway.
5. **Privacy on the server:** never store IPs, never log message text, never put names or phones anywhere except the
   encrypted contact blob. A developer account must not be able to read a case. Each rule has a test in
   `tests/api.test.js`; keep them passing and add one when you add a route.
6. **Two stores, one behaviour.** `server/api/store/memory.js` is the reference; `d1.js` must behave the same.
   `tests/api-store.test.js` runs every check against both.
7. **New file the app loads?** Add it to `PRECACHE` in `sw.js` and bump `CACHE_VERSION`
   (`tests/precache.test.js` tells you if you forget).
8. **Keep it simple.** Small functions, plain names, a short comment saying _why_ (not _what_). Prefer a new small
   module over a long file. No clever one-liners.

## Pull requests

- One change per PR, with a test when behaviour changes.
- Say what you tested (`npm run check`, e2e, and a screenshot for UI).
- Do not commit secrets. Keys live in Cloudflare secrets (`wrangler secret put ...`), never in the repo.

## Good first tasks

See `docs/ROADMAP.md`. Safe starting points: reword an answer in `src/data/answers.js`, add a test, improve a
dashboard chart in `admin/`, or fix an accessibility issue.
