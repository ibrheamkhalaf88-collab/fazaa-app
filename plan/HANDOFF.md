# Handoff: continuing Fazaa (formerly Sanad) in a new session

Read this first, then `plan/PLAN.md` and `plan/DATABASE.md`. Reply to the owner in Palestinian-dialect Arabic, short.

## Name

The app is called **فزعة (Fazaa)** (renamed from سند / Sanad on 2026-11-10). User-facing text changed; the repo, Pages
project, D1 `sanad` and the `sanad:` localStorage prefix keep the old name on purpose (changing the prefix would wipe
users' saved data). The staff Worker was redeployed as `fazaa-api` on 2026-11-11 (see below).

## Where things are

- GitHub: https://github.com/ibrheamkhalaf88-collab/sanad-app (branch `master`; the public site auto-deploys from it)
- Public app: https://sanad-app.pages.dev
- Staff API + dashboard (Cloudflare Worker `fazaa-api`): https://fazaa-api.ibrheamkhalaf88.workers.dev
  - dashboard: `/admin/`, API: `/api/*`. D1 database `sanad` (id in `server/api/wrangler.toml`).
  - The old Worker `sanad-api` still exists, locked behind a leftover Cloudflare Access app. Unused; the owner can
    delete it (and the Access app) from the Cloudflare dashboard.
- On the owner's PC: project `C:\Users\Lenovo\sanad-app`; deploy script `C:\Users\Lenovo\Desktop\سند\deploy-sanad.ps1`.
  (There is also an accidental nested clone `C:\Users\Lenovo\sanad-app\server\api\sanad-app`; the owner said keep it for now.)

## State (2026-11-11)

- Staff sign in with **email + password** (`server/api/auth.js`); Cloudflare Access is no longer used. The owner
  (`developer`, S-001) has a temporary password in `Desktop\FAZAA-ADMIN-TEMP-PASSWORD.txt`; first sign-in forces a change.
  Team tab: add member -> temporary password shown once; "كلمة سر جديدة" resets. Lockout 5 tries / 15 min.
  Emergency reset: `node scripts/staff-password.mjs --email ...`.
- Dashboard redesigned (navy/cream/gold): lawyer inbox like a chat app; developer tabs incl. "المحادثات" (read every
  conversation, read-only, each opening audited — owner's decision; a lawyer must review the consent wording),
  "حالة النظام", users list with delete (no names/phones).
- `MESSAGE_KEY` is set on `fazaa-api` (same key as before; copy on the Desktop — owner must move it somewhere safe).
- The public app is NOT connected to the Worker yet, so the in-app AI only uses offline rules. No Gemini key set.

## Next steps, in order

1. Owner signs in at the new link and changes the temporary password; adds lawyers in "الفريق".
2. **AI friend** (owner's request): a warm, Palestinian-dialect companion she can vent to; understands, walks with her,
   gives clear do/don't steps; legal facts only from the law corpus; danger or self-harm -> SOS numbers and "talk to a
   lawyer" at once. Needs a new Gemini key entered by the owner in "إعدادات الذكاء" (never in chat).
3. Connect the public app: `src/config.js` -> `API_BASE`, `TELEMETRY_ENDPOINT`, `AI_ENDPOINT` pointing at
   `https://fazaa-api.ibrheamkhalaf88.workers.dev/api...`, and extend `connect-src` in `_headers` to that origin only.
4. Link: owner to choose free workers.dev or a paid custom domain (~$10–15/yr, bought by the owner).
5. Before real users: lawyer verifies laws (`npm run law:verify`), consent text (developers read chats), real support
   numbers, rate limit, PIN recovery.

## Rules

- Never ask for or store secrets in chat. The owner enters keys in the dashboard or `wrangler secret put`.
- Commit messages: no AI attribution lines. Use Gemini/NVIDIA for the app's AI, not Claude.
- Design: slate-blue / navy / cream / gold, no red. Keep `docs/TRANSFER.md` rules (account values only in `wrangler.toml`).
- Run lint + unit tests before every push. `npm run check`'s prettier step fails on this Windows checkout (CRLF); the
  `precache` test has a Windows path bug. On this PC `git` from PATH may fail with "fork bomb": use
  `"C:\Program Files\Git\mingw64\bin\git.exe"`.
