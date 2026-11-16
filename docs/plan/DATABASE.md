# قاعدة البيانات — Database (Cloudflare D1, SQLite)

One database, `fazaa`, bound to the staff API as `DB`. Schema: `server/api/schema.sql`.
The app on the phone keeps its own data in the browser only; nothing there goes to this database.

## What is stored, by table

| Table                                          | Holds                                                         | Sensitive?                               | Kept                               |
| ---------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- | ---------------------------------- |
| `users`                                        | alias, salted PIN hash, region, **encrypted** name and phone  | Yes (contact encrypted)                  | Until she deletes or 180 days idle |
| `sessions`                                     | SHA-256 of session token                                      | Token hash only                          | 30 days                            |
| `cases`                                        | topic, region, status, assigned lawyer, times                 | Metadata                                 | Closed: 7 days; idle: 30 days      |
| `messages`                                     | **encrypted** conversation text                               | Yes                                      | Deleted with the case              |
| `case_notes`                                   | lawyer's private note, **encrypted**                          | Yes                                      | Deleted with the case              |
| `staff`                                        | email, role, first name, ID (`S-001`), active flag            | Staff data                               | Until removed                      |
| `staff_seen`                                   | first/last sign-in, session count                             | Staff data                               | Until removed                      |
| `audit`                                        | who did what (never what was said)                            | Staff accountability                     | 90 days                            |
| `settings`                                     | AI provider/model and **encrypted** API key; daily AI counter | Key encrypted, write-only from dashboard | Until changed                      |
| `ai_answers`                                   | the AI **answer** only (question and identity never stored)   | Scrubbed of phones, links, emails        | 90 days                            |
| `daily_counts`, `events_daily`, `lawyer_daily` | anonymous counters                                            | No                                       | Long-term (numbers only)           |

Never stored anywhere: IP addresses, user agents, the question typed to the AI, real names of women unless she
gave one (and then encrypted).

## Protection

- Encryption: AES-GCM in the Worker with the secret `MESSAGE_KEY` before data reaches D1.
  **Lose the key and encrypted data is unreadable. Keep it in a safe place outside the repo.**
- PIN: PBKDF2 with a per-user salt; lockout after repeated failures.
- Roles: lawyers read only cases they claimed; developers cannot read case content at all (enforced server side).
- Daily scheduled purge enforces the retention periods above.

## Everyday commands (run in `server/api`)

```
# create tables (safe to repeat)
npx wrangler d1 execute fazaa --remote --file=schema.sql
# look at a table's size (counts, no content)
npx wrangler d1 execute fazaa --remote --command "SELECT COUNT(*) FROM cases"
# backup (the encrypted parts stay encrypted)
npx wrangler d1 export fazaa --remote --output=backup.sql
```

Keep backups private: they contain staff emails and encrypted data. Test a restore into a throwaway database
before trusting a backup.

## Changing the schema

- Add columns with `ALTER TABLE` and also update `schema.sql` so new installs match.
- Existing database from before staff IDs: run the two `ALTER TABLE staff` lines at the top of the `staff` block.
- Tests cover both the in-memory store and the D1 store (`tests/api-store.test.js`); keep them identical in behaviour.

## Moving it

See `docs/TRANSFER.md`: export, import into the new database, and the `MESSAGE_KEY` warning.
