# Legal content: pending lawyer review

Status: **NOT REVIEWED** by a lawyer. Every law in `src/data/law/index.js` has `review.status = "pending"`; the app
shows «لسا ما راجعت محامية هالنص ولا تأكدت إنه النص النافذ اليوم» under every quoted article until a lawyer
signs off (set `review: { status: "reviewed", by, at }` per law, only after a real review).

## To check, per law

| Law | Open questions |
| --- | --- |
| Cyber-crimes decree-law 10/2018 (`cyber-crimes-2018.js`) | Is the stored text of art. 15 and 52 the text in force after the 2020 / 2021 amendments? Is this decree-law applied by courts in Gaza? (the app now warns Gaza users that it is not confirmed) |
| Personal status law 1976, West Bank (`personal-status-wb-1976.js`) | Text vs official gazette; later decree-laws (e.g. marriage age 2019) that change articles; scope (applies before sharia courts; other communities differ) |
| Family rights law 1954, Gaza (`family-rights-gaza-1954.js`) | Text comes from an unofficial PDF with OCR damage: check every article against an official copy; custody and harm/shiqaq articles are missing |
| Basic Law 2003 (`basic-law-2003.js`) | Constitutional principles only: confirm the plain-language notes do not imply a direct remedy |

## Source check run (2026-11-12)

`node scripts/verify-law.mjs` (fixed the same day: before, it silently did nothing on Windows and exited 0):
32 / 32 articles hosted on maqam.najah.edu match their source page (15, 16, 22, 52, 23 × psl, 5 × bl). The 9 Gaza
articles (gz:*) are not on maqam and were NOT checked. A match proves the copy, not that the text is the version
in force, nor that it applies to a given case.

## To check, in the answers

| Item | File |
| --- | --- |
| Offline cyber answers state penalties (art. 15, 16, 22, 52): numbers were checked by the team against the stored text, not against the official text | `src/data/answers.js` |
| Offline family answers were rewritten to state NO rights or procedures (only "what to prepare" and "ask a lawyer") | `src/data/answers.js` |
| The AI law prompt and the grounding check (numbers and article numbers must appear in the cited text) | `server/ai-proxy/worker.js`, `src/ai/legal.js` |
| `npm run law:verify` compares the stored text with the source pages; a match proves the copy, not that the law is in force or applies to her case | `scripts/verify-law.mjs` |
