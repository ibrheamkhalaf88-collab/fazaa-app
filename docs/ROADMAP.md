# Roadmap / known gaps

Done: redesign, home, chat, SOS, disguise, offline PWA, strict CSP, region-aware law retrieval, AI proxy (Gemini / NVIDIA / Claude adapters, mocked), staff API (accounts, cases, roles, encrypted contact and messages, retention), lawyer and developer dashboards, anonymous analytics, tests.

Before a public launch

1. Legal audit of every answer; confirm which law applies in Gaza vs the West Bank.
2. Deploy the API (D1 + Access), set `API_BASE` / `TELEMETRY_ENDPOINT`, and verify support numbers. The lawyer chat itself is built and tested.
3. Add the personal-status (family) law corpus so "divorce / custody / inheritance" cite articles too.
4. Real PIN lock (the setting exists, enforcement is not wired).
5. Live end-to-end test of the AI proxy and of D1 on Cloudflare (today both are tested only against mocks / SQLite).
6. Data-protection review and wording of the consent text (women give a real name and phone to reach a lawyer).
7. PIN recovery for women's accounts (today a forgotten PIN means a new account).

Nice to have

- Neutral app name/icon option for the home screen.
- Restyle the old landing page (`archive/landing-v1.html`) to the new tokens.
- English/Arabic switch; screen-reader audit.
