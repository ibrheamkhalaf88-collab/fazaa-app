# سَنَد (Sanad)

A women's legal-rights web app for Palestine, in the Palestinian dialect. It gives clear answers **from the text of the law,
with the article number**, a step-by-step safety plan against online blackmail, and a hand-off to a lawyer.

Built for people who may be in danger, so three things come before features:

| Principle              | What it means in the code                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Never invent law**   | Every answer cites an article from `src/data/law/`. If nothing covers the question, the app says so (`renderNotCovered`). AI output is rejected if it cites anything else (`src/ai/validate.js`). |
| **Private by default** | Everything stays on the device. Online AI is **opt-in** and off by default. No analytics, no third-party requests (fonts are self-hosted).                                                        |
| **Fast, quiet escape** | One tap or `Esc` swaps the app for a weather/calculator/notes screen and wipes the chat. The calculator really works; a secret code returns to the app.                                           |

Status: **prototype**. Lawyer chat, phone numbers and Google sign-in are demos (clearly labelled in the UI). See `docs/ROADMAP.md`.

## Run it

No build step. It is plain HTML, CSS and ES modules.

```bash
npm start            # serves on http://localhost:8080  (or: python -m http.server 8080)
npm test             # 80+ unit tests, no dependencies, ~1 s
npm run test:e2e     # real-browser tests (needs: npm install  -> installs Playwright)
```

> Open it through a server, **not** by double-clicking `index.html`: browsers block ES modules and `fetch` on `file://`.
> On Windows you can double-click `start.bat`.

## Folder map

```
index.html                 the app shell: every screen's markup, in reading order
manifest.webmanifest       install-to-home-screen metadata
sw.js                      offline support (precache list + update strategy)
_headers                   security + cache headers (Cloudflare Pages / Netlify)

styles/                    tokens -> base -> layout -> components -> one file per screen
src/
  main.js                  wiring only: builds the pieces, opens the first screen
  config.js                the few settings an operator edits (AI endpoint, calculator code)
  core/                    store (localStorage), state, router, dom helpers, toast
  ui/actions.js            one delegated click handler driven by data-* attributes
  features/                chat, sos, disguise (+calculator), settings, nav   <- one folder per feature
  ai/                      how an answer is produced (see docs/AI.md)
  data/                    the law text, keywords, and the rule-based answers  <- content lives here
server/api/                staff API (Worker + D1): cases, lawyer/developer roles, retention
admin/                     staff dashboard (lawyers and developers), see docs/ADMIN.md
server/ai-proxy/           optional Cloudflare Worker for online AI (keeps the API key off the device)
tests/                     unit tests (node:test) + e2e/ (Playwright)
docs/                      ARCHITECTURE, AI, DEPLOYMENT, CONTENT, ROADMAP
assets/                    fonts, icon sprite, app icons
archive/                   old landing page (reference only)
```

## Where do I change…?

| I want to…                        | Edit                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| change colours or fonts           | `styles/tokens.css`                                                                           |
| add or reword a rule-based answer | `src/data/answers.js` (+ keywords in `src/data/intents.js`), then `npm test`                  |
| add a law                         | `src/data/law/` (see `docs/CONTENT.md`)                                                       |
| change a screen's layout          | its markup in `index.html` + `styles/screens/<name>.css`                                      |
| turn on online AI                 | `docs/AI.md` (deploy the worker, set `AI_ENDPOINT` in `src/config.js`)                        |
| ship a new version                | bump `CACHE_VERSION` in `sw.js` (the tests tell you if a file is missing from the cache list) |

## Contributing

Read `docs/ARCHITECTURE.md` first (10 minutes). Rules of the house:

1. Legal text is never paraphrased; it is copied from the source and fingerprinted in `tests/law-integrity.test.js`.
2. User text and AI text are rendered with `textContent` only (`core/dom.js` `el()`); never `innerHTML`.
3. No new third-party request without a written reason; the CSP in `_headers` will block it anyway.
4. `npm test` and `npm run test:e2e` pass before merging. Format with `npm run format`.
