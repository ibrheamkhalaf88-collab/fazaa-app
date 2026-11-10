# How the AI gets better

The AI is a thin layer on top of a **law corpus**. Quality comes from the corpus and the checks around the model, not from the model alone. Work in this order; each step is cheaper and safer than the next.

## What it may answer (and why it cannot wander)

The model is called **only** when retrieval finds articles in our corpus (`src/ai/retrieve.js`). No articles, no model call: the app says the question is not covered and falls back to the offline rules. This is enforced in code, not in the prompt, so "write a poem" or "ignore your instructions" never reach the model. `npm run ai:eval` proves it on every change (`ai-data/eval/questions.json`).

## The improvement loop

1. **Feed the law (biggest gain).** Today the corpus is only the 2018 cyber-crimes decree. Divorce, maintenance, custody and the Basic Law are not answered at all until their official texts are added (`docs/AI.md` → "Adding a law"). Use official sources only; a lawyer confirms which text applies in the West Bank and in Gaza.
2. **Teach retrieval the way women actually ask.** Add intents and keywords in `src/ai/detect.js` and `src/data/law`. Add each new phrasing to `ai-data/eval/questions.json` first, watch it fail, then fix it.
3. **Lawyers review answers.** Dashboard → مراجعة أجوبة الذكاء. A wrong answer becomes (a) a new question in `eval/`, (b) a prompt fix in `server/ai-proxy/worker.js` (`SYSTEM_PROMPT`).
4. **Export the reviewed answers** (developer: تصدير المراجَعة) into `ai-data/exports/` and use them to measure quality (share marked good) and to pick better examples for the prompt.
5. **Try a stronger model only if needed.** Change provider/model in the dashboard (إعدادات الذكاء). The same checks apply to any model, so the safety rules do not change. Compare on the same `eval` set.
6. **Fine-tuning last.** It needs thousands of lawyer-approved examples and a privacy review. Until then, steps 1 to 4 give more for less.

## Guardrails that never change

- Every citation must be an article we retrieved; otherwise the answer is dropped (`src/ai/validate.js`).
- Output is forced into a fixed schema and length-limited; danger words always add the emergency block.
- The question is never stored. Only the scrubbed answer is kept, 90 days, for review.
- A daily cap (`AI_DAILY_LIMIT`) and an optional per-IP rate limit protect the provider quota.
