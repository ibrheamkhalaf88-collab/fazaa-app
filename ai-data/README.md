# ai-data: everything we use to develop the AI

| Path                                   | What                                                                                                | In git?                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- |
| `eval/questions.json`                  | Invented test questions with the expected outcome (answered from the law, or not answered at all).  | yes                     |
| `samples/exported-answer.example.json` | An invented example of one exported item, to show the format.                                       | yes                     |
| `exports/`                             | Real AI answers a lawyer reviewed, downloaded from the dashboard (**مراجعة أجوبة الذكاء → تصدير**). | **never** (git-ignored) |

Run the scope check any time, with no key and no network: `npm run ai:eval`. CI runs it too.

Rules for this folder:

- `exports/` holds data that came from real women's questions. It must stay off GitHub (the repo is public). Keep it on a developer machine, encrypted disk, and delete it when the work is done.
- A stored item is only the AI's **answer** (no question, no account, no IP). Even so, treat it as sensitive.
- Never paste real user text into `eval/`. Invent the questions, keeping the same meaning.

How the AI improves: `docs/AI-DEVELOPMENT.md`.
