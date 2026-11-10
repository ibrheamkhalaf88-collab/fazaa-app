# Security status (honest)

Not independently audited. Designed defensively, tested in CI, but get a professional review before a public launch.

## In place

- **No script injection:** strict CSP (`_headers`: `script-src 'self'`, no inline scripts, `frame-ancestors 'none'`); user text is inserted with `textContent`; the only two `innerHTML` uses take fixed, same-origin content (lint rule forbids others).
- **No runtime dependencies** in the app: `npm audit --omit=dev` reports 0. (Dev-only: a moderate `minimatch` advisory via ESLint; it never ships.)
- **Staff access:** Cloudflare Access JWT on `/api/v1/staff/*` and `/admin/*`; roles checked on the server for every route.
- **Women's accounts:** salted PBKDF2 PIN hashes, 5 wrong PINs lock for 15 minutes, session tokens stored hashed.
- **Data at rest:** messages, names, phones and the AI key encrypted with AES-GCM (`MESSAGE_KEY`); only the claiming lawyer reads a case; developers read no message.
- **SQL:** parameterised queries only.
- **AI:** retrieval-gated, schema-forced, citations verified; the API key is write-only; a daily cap limits abuse.
- **Retention:** closed cases 7 days, idle 30, audit 90, AI answers 90, inactive accounts 180.

## Still open (do before launch)

- Turn on the per-IP **rate limit** bindings (`RATE_LIMITER`) for both Workers; signup and login are public.
- Deploy behind Cloudflare Access on a real domain; the staff API is not live yet.
- 6-digit PINs have no recovery and are guessable if an attacker can try many accounts: keep the rate limit on.
- A penetration test and a data-protection/legal review (consent text, retention, who may read what).
- Rotate any API key that was ever pasted in chat.
