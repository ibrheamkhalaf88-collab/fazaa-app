# سَنَد (Sanad)

A women's legal-rights web app for Palestine, in the Palestinian dialect. It gives clear answers **from the text of the law,
with the article number**, a step-by-step safety plan against online blackmail, and a hand-off to a lawyer.

Built for people who may be in danger, so three things come before features:

| Principle              | What it means in the code                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Never invent law**   | Every answer cites an article from `src/data/law/`. If nothing covers the question, the app says so (`renderNotCovered`). AI output is rejected if it cites anything else (`src/ai/validate.js`).                         |
| **Private by default** | Questions are answered on the device. Online AI is **opt-in**. Anonymous counters (no ids, no text) are **opt-out** and off until configured. An account exists only when she asks for a lawyer. No third-party requests. |
| **Fast, quiet escape** | One tap or `Esc` swaps the app for a weather/calculator/notes screen and wipes the chat. The calculator really works; a secret code returns to the app.                                                                   |

Status: **prototype**. The app works fully offline with the rule engine. The real lawyer chat, staff dashboards and analytics are built and tested but switched off until the API is deployed (`API_BASE`, `TELEMETRY_ENDPOINT` in `src/config.js`). Until then the lawyer tab is a labelled demo; phone numbers and the Google button are placeholders. See `docs/ROADMAP.md`.

## Run it

No build step. It is plain HTML, CSS and ES modules.

```bash
npm start            # serves on http://localhost:8080  (or: python -m http.server 8080)
npm test             # 150 unit tests, no dependencies, ~1 s
npm run test:e2e     # real-browser tests (needs: npm install  -> installs Playwright)
npm run lint         # ESLint (also forbids innerHTML)
npm run check        # format + lint + unit tests: run this before every commit
npm run dev:admin    # app + staff API + dashboards on http://localhost:8787 (admin at /admin/, SEED=1 for demo data)
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
  config.js                the few settings an operator edits (AI endpoint, API_BASE, telemetry, calculator code)
  core/                    store (localStorage), state, router, dom helpers, toast
  ui/actions.js            one delegated click handler driven by data-* attributes
  features/                chat, account, sos, disguise (+calculator), settings, nav, telemetry   <- one folder per feature
  ai/                      how an answer is produced (see docs/AI.md)
  data/                    the law text, keywords, and the rule-based answers  <- content lives here
server/api/                API (Worker + D1): women's accounts, cases, lawyer/developer roles, analytics, retention
admin/                     staff dashboard (lawyers and developers), see docs/ADMIN.md
server/ai-proxy/           optional Cloudflare Worker for online AI (keeps the API key off the device)
tests/                     unit tests (node:test) + e2e/ (Playwright)
plan/                      PLAN, DATABASE (the roadmap and the database)
docs/                      ARCHITECTURE, AI, ADMIN, DEPLOYMENT, TRANSFER, CONTENT, ROADMAP
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
| how the AI improves; scope check  | `docs/AI-DEVELOPMENT.md`, `ai-data/`, `npm run ai:eval`                                       |
| security status                   | `docs/SECURITY.md`                                                                            |
| turn on online AI                 | `docs/AI.md` (deploy the worker, set `AI_ENDPOINT` in `src/config.js`)                        |
| ship a new version                | bump `CACHE_VERSION` in `sw.js` (the tests tell you if a file is missing from the cache list) |

## Contributing

New to the project? Read **`CONTRIBUTING.md`** (setup in 5 minutes, the map of the code, and the rules of the house),
then `docs/ARCHITECTURE.md`.
