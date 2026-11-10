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

## Laws differ by region (Gaza vs West Bank)

`src/data/law/index.js` holds the **law registry** (`LAWS`). Each entry lists the regions where that law applies
(`"ps-wb"`, `"ps-gaza"`). The user's region comes from the country screen (`state.country`).
Retrieval, the AI proxy and citation validation all use `articlesFor(region)`, so a Gaza user is never shown or
quoted a West-Bank-only article, and vice versa.

Planned corpus (each needs verbatim text from an official source + a legal reviewer):

| Topic                                                    | West Bank                                 | Gaza                                                |
| -------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| Personal status (divorce, custody, alimony, inheritance) | Jordanian Personal Status Law No. 61/1976 | Family Rights Law of 1954 (verify exact instrument) |
| Penal                                                    | Jordanian Penal Code 16/1960              | Mandate-era Criminal Code Ordinance 1936            |
| Cyber crimes                                             | Decree-Law 10/2018 (in corpus)            | **unconfirmed** - see TODO in `law/index.js`        |

Do not enable a law for a region until a lawyer confirms it is in force there.
