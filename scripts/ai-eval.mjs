/**
 * Offline scope check for the AI. No key, no network.
 *   npm run ai:eval
 * For every question in ai-data/eval/questions.json it runs the same retrieval the AI proxy uses and checks:
 *   - "none":    nothing is retrieved, so the model is never called (the app answers "not covered");
 *   - "covered": articles are retrieved, including every id in mustInclude.
 * Exits with code 1 on any mismatch, so CI catches a change that widens or narrows what the AI may answer.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { retrieveArticles } from "../src/ai/retrieve.js";
import { articlesFor } from "../src/data/law/index.js";

const FILE = new URL("../ai-data/eval/questions.json", import.meta.url);

export function runEval(questions = JSON.parse(readFileSync(FILE, "utf8")).questions) {
  return questions.map((c) => {
    const ids = retrieveArticles(c.q, articlesFor(c.region)).map((a) => a.id);
    const missing = (c.mustInclude || []).filter((id) => !ids.includes(id));
    const ok = c.expect === "none" ? ids.length === 0 : ids.length > 0 && missing.length === 0;
    return { ...c, ids, ok };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = runEval();
  for (const r of rows)
    console.log(`${r.ok ? "ok  " : "FAIL"} [${r.expect}] ${r.q}  ->  ${r.ids.join(",") || "—"}`);
  const bad = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - bad}/${rows.length} as expected`);
  process.exit(bad ? 1 : 0);
}
