# Handoff: continuing Sanad in a new session

Read this first, then `plan/PLAN.md` and `plan/DATABASE.md`. Reply to the owner in Palestinian-dialect Arabic, short.

## Where things are

- GitHub: https://github.com/ibrheamkhalaf88-collab/sanad-app (branch `master`; the public site auto-deploys from it)
- Public app: https://sanad-app.pages.dev
- Staff API + dashboard (Cloudflare Worker `sanad-api`): https://sanad-api.ibrheamkhalaf88.workers.dev
  - dashboard: `/admin/`, API: `/api/*`. D1 database `sanad` (id in `server/api/wrangler.toml`).
- On the owner's PC: project `C:\Users\Lenovo\sanad-app`; deploy script `C:\Users\Lenovo\Desktop\سند\deploy-sanad.ps1`.
  (There is also an accidental nested clone `C:\Users\Lenovo\sanad-app\server\api\sanad-app`; ignore or delete it.)

## State

- Done: app, AI retrieval (41 law articles), dashboard, staff IDs/suspension, API deployed, tables created,
  `MESSAGE_KEY` secret set (key copy was saved on the Desktop; owner must move it to a safe place).
- Staff routes are locked (401) until Cloudflare Access is configured: `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in
  `server/api/wrangler.toml` are still placeholders.

## Next steps, in order

1. Owner creates the Access application (self-hosted, paths `/admin` and `/api/v1/staff` on the workers.dev host,
   Allow policy for the owner's email) and sends the team domain and AUD. Put them in `wrangler.toml`, run the deploy script.
2. Test sign-in at `/admin/`. If Access will not accept workers.dev paths, a custom domain is needed.
3. Connect the public app: `src/config.js` -> `API_BASE`, `TELEMETRY_ENDPOINT`, `AI_ENDPOINT` pointing at the Worker,
   and extend `connect-src` in `_headers` to the Worker origin only. Run `npm run check` and the e2e tests.
4. New Gemini key, entered by the owner in the dashboard (never in chat); test; lawyer reviews 50+ answers.
5. Before real users: lawyer verifies laws (`npm run law:verify`), real support numbers, consent text, rate limit, PIN recovery.

## Rules

- Never ask for or store secrets in chat. The owner enters keys in the dashboard or `wrangler secret put`.
- Commit messages: no AI attribution lines. Use Gemini/NVIDIA for the app's AI, not Claude.
- Design: slate-blue / navy / cream / gold, no red. Keep `docs/TRANSFER.md` rules (account values only in `wrangler.toml`).
- Run `npm run check` before every push; the working copy needs `node_modules` (`npm install`).
