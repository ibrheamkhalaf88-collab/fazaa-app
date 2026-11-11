# Transferring Fazaa to another owner or organisation

The code is portable: plain HTML/CSS/ES modules, no build step, no vendor lock-in beyond Cloudflare
(Pages, Workers, D1, Access), which can be swapped (see `ARCHITECTURE.md`).

## What belongs to the current owner's accounts (the new owner must replace it)

| Item                                   | Where                                  | New owner does                         |
| -------------------------------------- | -------------------------------------- | -------------------------------------- |
| GitHub repository                      | github.com/ibrheamkhalaf88-collab/...  | GitHub: Settings -> Transfer ownership |
| Cloudflare account (Pages, Worker, D1) | owner's Cloudflare                     | Create their own, redeploy (below)     |
| D1 database id                         | `server/api/wrangler.toml`             | `wrangler d1 create`, paste the new id |
| First developer email                  | `DEVELOPER_EMAILS` in the same file    | Put their own                          |
| `MESSAGE_KEY` (encrypts all messages)  | Worker secret, **not** in the repo     | New random key; see warning below      |
| AI provider key                        | entered in the admin dashboard         | Enter their own; delete the old one    |
| Allowed origins / site URL             | both `wrangler.toml` files, `_headers` | Their domain                           |
| Cloudflare Access team domain and AUD  | `wrangler.toml`                        | Their own Zero Trust                   |
| Support phone numbers, consent text    | `src/data/`                            | Their organisation's real details      |

## Moving the data

- **Messages are encrypted with `MESSAGE_KEY`.** Moving the database without that same key makes every
  message unreadable. Either hand over the key through a secure channel, or accept that old cases are
  not carried over (the app deletes closed cases after 7 days anyway).
- Staff list, settings and reviewed AI answers: `wrangler d1 export fazaa --remote --output=backup.sql`, then
  `wrangler d1 execute <new> --remote --file=backup.sql`. The saved AI provider key is encrypted with
  `MESSAGE_KEY` too, so re-enter it if the key changes.
- Reviewed AI answers (`ai-data/`) contain no identities and can be handed over as files.

## Handover checklist

1. Transfer the repository (or the new owner forks it).
2. New owner: Cloudflare account with two-factor login, then follow `DEPLOYMENT.md` and `ADMIN.md`.
3. Replace the placeholders in the table above; run `npm run check`.
4. Rotate every secret the previous owner ever saw: AI provider key, `MESSAGE_KEY`, Cloudflare API tokens.
5. Remove the previous owner from Cloudflare Access, the repo and the staff table.
6. A lawyer re-verifies the law texts (`npm run law:verify`) before the new owner launches.

## Rules for contributors (keep it portable)

- Never commit a secret, a real phone number or a person's name. Account-specific values live only in the
  two `wrangler.toml` files and the dashboard.
- No code may depend on the original owner's domain or accounts.
