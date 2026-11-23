# Content guide (law, keywords, answers)

Everything a legal reviewer needs to check lives in `src/data/`.

- `law/<name>.js` - article text copied **verbatim** from the official source, with article number and source.
  Never paraphrase. After adding or fixing a text, update its fingerprint in `tests/law-integrity.test.js`
  (the test prints the new hash on failure).
- `law/index.js` - exports `ARTICLES` and `INTENT_TO_ARTICLES` (which intent cites which article).
- `intents.js` - keyword lists per intent. Matching is at word start after allowed Arabic prefixes, numbers exact.
- `answers.js` - ordered `RULES`; the first match wins, so put the more specific/dangerous ones first.
  Each answer has: short summary, steps, cited articles, `sos` flag.

Workflow: edit -> `npm test` (the rules tests contain sample questions per intent) -> have a lawyer sign off the diff.
Dialect: Palestinian; avoid legal Latin/MSA jargon unless quoting an article.

## Laws differ by region and by court (2026-11-21)

The law texts live in **five separate boxes**, one per region and court (`src/data/law/corpora.js`):
`gaza/sharia`, `gaza/nizami`, `gaza/general`, `wb/sharia`, `wb/nizami`. A law sits in exactly one box, and the
box (not the law) sets where it applies and which court applies it. The two West Bank boxes are ready and empty.
Retrieval only sees the boxes of the user's region (`articlesFor(region)`), keeps the sharia and nizami texts
apart (`keepCourtsApart` in `src/ai/retrieve.js`), every text reaches the model tagged with its court, and a reply
naming a law of the other region is rejected. `tests/law-separation.test.js` guards all of it.

**To add a law or fill a box, follow `docs/LAW-INTAKE.md`.** Do not enable a law for a region until a lawyer
confirms it is in force there.

## Adding an article from the dashboard («القوانين», 2026-11-17)

No developer needed. A lawyer pastes the article verbatim with its official source (https link required) in
`/admin/` → «القوانين». It stays a draft until a lawyer or a developer (the one who added it is enough, owner's decision 2026-11-17) ticks
«قارنت النص بالمصدر الرسمي» and approves. Then, without a redeploy:

- the server reads approved articles from D1 (`law_articles`, cached one minute per Worker isolate) and adds them
  to `ARTICLES` (`useAddedArticles` in `src/data/law/index.js`), so retrieval, the AI prompt, the grounding
  check and «شو بتقول المادة …؟» use them like the built-in laws;
- the app downloads them from `/api/v1/laws` at start and keeps them on the device for offline use.

Approved texts are not edited in place: hide it and add the corrected one. Anyone on the team can hide an
article at once. Added ids look like `x12:9` (row 12, article 9). Built-in laws in the boxes under `src/data/law/` are not
affected and keep their fingerprint test. Existing database: re-run `schema.sql` once (it adds `law_articles`).
