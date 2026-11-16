# docs — دليل المستندات

New to the project? Read in this order: `../README.md` → `../CONTRIBUTING.md` → `ARCHITECTURE.md`.

## How the app works

| File              | What it explains                                                         |
| ----------------- | ------------------------------------------------------------------------ |
| `ARCHITECTURE.md` | Layers, boot sequence, state, navigation, styling, the disguise          |
| `AI.md`           | How a chat reply is produced and checked (AI-first, grounded in the law) |
| `ADMIN.md`        | The staff dashboard: lawyer and developer roles, what each can see       |
| `CONTENT.md`      | Where the law texts, keywords and safety plans live and how to edit them |

## Running it

| File                | What it explains                                           |
| ------------------- | ---------------------------------------------------------- |
| `DEPLOYMENT.md`     | Deploying to Cloudflare (Pages, Worker, D1), headers, CSP  |
| `TRANSFER.md`       | Handing the project to another owner or organisation       |
| `AI-DEVELOPMENT.md` | Improving the AI answers, and the evaluation set           |
| `LIVE-EVAL.md`      | Running the real-model evaluation (`npm run ai:live-eval`) |

## Safety, privacy and status

| File               | What it explains                                                |
| ------------------ | --------------------------------------------------------------- |
| `PRIVACY.md`       | What is stored, who can read it, what each erase button removes |
| `SECURITY.md`      | Security status and open items                                  |
| `LEGAL-REVIEW.md`  | Law texts waiting for a lawyer's review                         |
| `SAFETY-REVIEW.md` | Safety texts waiting for a specialist's review                  |
| `ROADMAP.md`       | Known gaps before a public launch                               |

## Folders

| Folder         | What is in it                                                                   |
| -------------- | ------------------------------------------------------------------------------- |
| `plan/`        | The work plan: phases, AI roadmap, database, lawyers dashboard, session handoff |
| `reports/`     | Dated audits and reviews (snapshots, not kept up to date)                       |
| `evidence/`    | Transcripts and probe scripts the reports cite                                  |
| `screenshots/` | Screenshots of the app's screens                                                |
