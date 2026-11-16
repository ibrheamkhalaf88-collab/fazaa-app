# Legal content: pending lawyer review

Status: **NOT REVIEWED** by a lawyer. Every law in `src/data/law/index.js` has `review.status = "pending"`; the app
shows «لسا ما راجعت محامية هالنص ولا تأكدت إنه النص النافذ اليوم» under every quoted article until a lawyer
signs off (set `review: { status: "reviewed", by, at }` per law, only after a real review).

## To check, per law

| Law                                                                | Open questions                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cyber-crimes decree-law 10/2018 (`cyber-crimes-2018.js`)           | Is the stored text of art. 15 and 52 the text in force after the 2020 / 2021 amendments? Is this decree-law applied by courts in Gaza? (the app now warns Gaza users that it is not confirmed) |
| Personal status law 1976, West Bank (`personal-status-wb-1976.js`) | Text vs official gazette; later decree-laws (e.g. marriage age 2019) that change articles; scope (applies before sharia courts; other communities differ)                                      |
| Family rights law 1954, Gaza (`family-rights-gaza-1954.js`)        | Text comes from an unofficial PDF with OCR damage: check every article against an official copy; custody and harm/shiqaq articles are missing                                                  |
| Basic Law 2003 (`basic-law-2003.js`)                               | Constitutional principles only: confirm the plain-language notes do not imply a direct remedy                                                                                                  |

## Source check run (2026-11-12)

`node scripts/verify-law.mjs` (fixed the same day: before, it silently did nothing on Windows and exited 0):
32 / 32 articles hosted on maqam.najah.edu match their source page (15, 16, 22, 52, 23 × psl, 5 × bl). The 9 Gaza
articles (gz:*) are not on maqam and were NOT checked. A match proves the copy, not that the text is the version
in force, nor that it applies to a given case.

## Check against the amending decrees and an official Gaza copy (2026-11-15)

Done by the development team from public sources, **not a legal review**. It narrows what the lawyer has to confirm.

**Cyber-crimes decree-law 10/2018: two corrections made in the app**

| Article              | What was wrong                                                                                                                                                                                                                     | Now                                                                                                                                                                                                         | Source                                                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 15 (blackmail)       | The app stored the ORIGINAL 2018 text: «الحبس أو غرامة 200 إلى 1000 دينار». Decree-law 28/2020 (Official Gazette 171, 24/9/2020) replaced it. maqam's article page still shows the 2018 wording, which is why `law:verify` passed. | Stored as amended: 1-2 years' prison + 2 years suspended + fine 1000-3000 JD; threat touching honour: 2-3 years + 3 suspended + 5000-10000 JD. The offline answer in `answers.js` was updated the same way. | [decree-law 28/2020](https://security-legislation.ps/ar/latest-laws/%D9%82%D8%B1%D8%A7%D8%B1-%D8%A8%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-28-%D9%84%D8%B3%D9%86%D8%A9-2020%D9%85-%D8%A8%D8%AA%D8%B9%D8%AF%D9%8A%D9%84-%D9%82%D8%B1%D8%A7%D8%B1-%D8%A8%D9%82/) |
| 52 (doubled penalty) | Decree-law 38/2021, art. 27, renumbered articles 31-53 as 51-73.                                                                                                                                                                   | Cited as article **72**, with the note «كانت المادة (52)». Text unchanged.                                                                                                                                  | [decree-law 38/2021](https://mjr.ogb.gov.ps/Decrees/ViewText/32028)                                                                                                                                                                                                      |
| 16, 22               | Below 31: not renumbered. No amendment found for them in 28/2020 or 38/2021.                                                                                                                                                       | Unchanged.                                                                                                                                                                                                  | same                                                                                                                                                                                                                                                                     |

For the lawyer: (1) confirm no amendment after 38/2021 touches arts. 15, 16, 22, 72 (the Ministry of Justice held public
consultations on a new amendment in 2025); (2) whether Gaza courts apply the decree-law.

**Personal status (West Bank):** decree-law 21/2019 sets the marriage age at 18 for both parties and is listed as in force in
the West Bank and Gaza ([maqam](https://maqam.najah.edu/legislation/287/), [official text](https://mjr.ogb.gov.ps/Decrees/ViewText/29492)). Any marriage-age article
of the 1976 law or the 1954 Gaza law must be read with it. No article on marriage age is stored in the app today.

**Family rights law 1954 (Gaza):** compared with the copy published by the Ministry of Women's Affairs
([mowa.pna.ps](http://mowa.pna.ps/public/storage/image/17629590821696871455.pdf), citing «مجموعة القوانين الفلسطينية، الجزء العاشر»).

| Article                | Result                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| 38, 65, 66, 77, 92, 94 | Match the ministry copy word for word                                                                   |
| 59, 61                 | The ministry PDF lost the start of the article in extraction; the end matches. Check the start on paper |
| 55                     | Missing from the ministry PDF text. Not verified                                                        |

The same official copy contains articles the app does **not** have yet: **97-102** (divorce for harm, arbitrators) and **118**
(custody: the judge may extend women's custody of a boy from 7 to 9 and a girl from 9 to 11). The app now says plainly that
the Gaza custody text is missing; adding these is a content decision for the lawyer.

## To check, in the answers

| Item                                                                                                                                                 | File                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Offline cyber answers state penalties (art. 15, 16, 22, 52): numbers were checked by the team against the stored text, not against the official text | `src/data/answers.js`                          |
| Offline family answers were rewritten to state NO rights or procedures (only "what to prepare" and "ask a lawyer")                                   | `src/data/answers.js`                          |
| The AI law prompt and the grounding check (numbers and article numbers must appear in the cited text)                                                | `server/ai-proxy/worker.js`, `src/ai/legal.js` |
| `npm run law:verify` compares the stored text with the source pages; a match proves the copy, not that the law is in force or applies to her case    | `scripts/verify-law.mjs`                       |
