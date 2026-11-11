# خطة سند — Sanad plan

Status: ✅ done · ⏳ in progress · ⬜ not started. "Owner" is who must act.

## Phase 0 — What already exists (✅)

- The app (PWA, Arabic, offline, West Bank / Gaza).
- AI answers limited to a fixed set of law articles, with a daily cap.
- Staff dashboard: cases, work, AI answers, AI settings, team (IDs, suspension), usage, audit.
- 41 law articles (personal status West Bank and Gaza, Basic Law, cyber crimes). 207 automated tests.

## Phase 1 — Deploy the staff API (⏳, owner: Ibrahim)

1. ✅ Cloudflare account and `wrangler login`.
2. ✅ Create the D1 database `sanad` (id is in `server/api/wrangler.toml`).
3. ⬜ Apply the tables: `npx wrangler d1 execute sanad --remote --file=schema.sql`.
4. ⬜ Create `MESSAGE_KEY` and store it in a safe place **outside** the repo; `wrangler secret put MESSAGE_KEY`.
5. ⬜ `npx wrangler deploy`.
6. ⬜ Cloudflare Zero Trust -> Access: protect `/admin/*` and `/api/v1/staff/*`; copy the team domain and AUD
   into `wrangler.toml`; deploy again.
7. ⬜ Same-origin routing so the app and API share one domain (needs a domain or a Pages Function route).
8. ⬜ In `src/config.js` set `API_BASE="/api"`, `TELEMETRY_ENDPOINT="/api/v1/ping"`, `AI_ENDPOINT="/api/v1/answer"`.

## Phase 2 — AI live (⬜, owner: Ibrahim)

The detailed AI development plan is in `plan/AI-ROADMAP.md`.

1. Create a **new** Gemini key (the old one was exposed in chat; delete it). Enter it in the dashboard only.
2. Test connection from the dashboard.
3. Ask 50+ real-style questions; a lawyer reviews each answer (good / bad).
4. Fix retrieval phrasings and add the failures to `ai-data/eval/questions.json`.

## Phase 3 — Before any real user (⬜, owner: lawyer + Ibrahim)

- A lawyer verifies every law text (especially Gaza, from an unofficial PDF) and `npm run law:verify`.
- Real support phone numbers; consent text reviewed legally.
- Per-IP rate limit binding; PIN recovery; a penetration test.
- Add the missing law: Gaza custody, 2019 marriage-age amendment.

## Phase 4 — Operate and improve (⬜)

- Weekly: lawyers review new AI answers; developer exports reviewed ones (`ai-data/`).
- Monthly: check usage, backups restore test, rotate staff access.
- Follow `docs/AI-DEVELOPMENT.md` for improving the model.

## Portability rule

Account-specific values live only in the two `wrangler.toml` files and the dashboard. See `docs/TRANSFER.md`.
