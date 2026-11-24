/**
 * Review of the LIVE AI-first assistant: 50 synthetic scenarios sent, turn by turn, to the deployed endpoint
 * (the same path as the app: role-tagged turns of one conversation, the dashboard's Gemini key, the deployed
 * validation). No real user text. Writes a transcript and a JSON summary to docs/evidence/.
 *
 *   node scripts/live-chat-review.mjs [--endpoint https://…/api/v1/answer] [--delay-ms 2500] [--limit 50]
 *
 * Costs provider quota (about one model call per turn, two when a reply is rewritten).
 */
import { writeFileSync } from "node:fs";
import { scenarioList } from "./live-eval.mjs";
import { validateChat } from "../src/ai/validate.js";
import { articlesFor } from "../src/data/law/index.js";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const ENDPOINT = arg("endpoint", "https://fazaa.ibrheam-app.workers.dev/api/v1/answer");
const ORIGIN = new URL(ENDPOINT).origin;
const DELAY = Number(arg("delay-ms", "2500"));
const LIMIT = Number(arg("limit", "50"));
/**
 * The live app serves ONE region now (server/ai-proxy/worker.js COUNTRIES = ["ps-gaza"]; the West Bank texts
 * are "awaiting-texts"). Every turn is sent and re-checked as Gaza; expectations that name West Bank
 * articles are skipped (they cannot apply).
 */
const COUNTRY = arg("country", "ps-gaza");
const IN_REGION = articlesFor(COUNTRY);

/** 50 scenarios: every conversation except the 30-message one, then legal, then safety. */
const all = scenarioList();
const pick = [
  ...all.filter((s) => s.id.startsWith("C") && !s.id.startsWith("C21")).slice(0, 28),
  ...all.filter((s) => s.id.startsWith("L") && !s.id.startsWith("L21")).slice(0, 14),
  ...all.filter((s) => s.id.startsWith("S")).slice(0, 8),
].slice(0, LIMIT);

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const rows = [];

for (const [n, sc] of pick.entries()) {
  const turns = [];
  lines.push(`\n=== ${n + 1}. ${sc.id}`);
  for (const turn of sc.turns) {
    const country = COUNTRY;
    turns.push({ role: "user", text: turn.say });
    const t0 = Date.now();
    let status = 0;
    let body;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ messages: turns.slice(-12), country }),
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (e) {
      body = { error: `network:${e.message}` };
    }
    const ms = Date.now() - t0;
    const a = body?.answer || null;
    const exp = turn.expect || {};
    const problems = [];
    const source = a?.source || "none";
    if (status !== 200 || !a) problems.push(`no-answer:${status}:${body?.error || ""}`);
    if (a && source === "ai") {
      try {
        validateChat(a, { articleIds: Object.keys(IN_REGION), articles: IN_REGION, region: country });
      } catch (e) {
        problems.push(`client-recheck:${e.message}`);
      }
    }
    const cites = a?.cites || [];
    // only expectations about texts that exist in the region being served
    const wanted = [...(exp.cites || []), ...(exp.related || [])].filter((id) => IN_REGION[id]);
    if (a && wanted.length && !wanted.some((id) => cites.includes(id))) problems.push(`expected-text:${wanted.join("|")} got:${cites.join(",") || "none"}`);
    for (const id of exp.notCites || []) if (cites.includes(id)) problems.push(`wrong-text:${id}`);
    if (a && exp.sos === true && !a.sos) problems.push("sos-missing");
    if (a && exp.noOptions && (a.rights?.length || a.steps?.length)) problems.push("advice-when-she-wanted-to-be-heard");
    rows.push({ scenario: sc.id, say: turn.say, status, source, ms, problems, rights: a?.rights?.length || 0, cites });
    lines.push(`SHE: ${turn.say}`);
    if (a) {
      lines.push(`   [${source}${a.sos ? " sos" : ""}${cites.length ? ` cites:${cites}` : ""}] ${a.lead}`);
      for (const r of a.rights || []) lines.push(`   📋 ${r.text} (${r.cite})`);
      for (const s of a.steps || a.options || []) lines.push(`   • ${s}`);
      if (a.ask) lines.push(`   ? ${a.ask}`);
      turns.push({ role: "assistant", text: [a.lead, a.ask].filter(Boolean).join(" ").slice(0, 700) });
    } else {
      lines.push(`   [no answer ${status}] ${body?.error || ""}`);
      turns.pop(); // as the app does: a failed message is not kept
    }
    if (problems.length) lines.push(`   !! ${problems.join("; ")}`);
    process.stdout.write(`\r${n + 1}/${pick.length} ${sc.id.slice(0, 4)} ${source} ${ms}ms   `);
    await pause(DELAY);
  }
}

const ai = rows.filter((r) => r.source === "ai");
const pct = (x, d) => (d ? `${((100 * x) / d).toFixed(1)}%` : "n/a");
const scenariosClean = pick.filter((sc) => rows.filter((r) => r.scenario === sc.id).every((r) => !r.problems.length)).length;
const sorted = ai.map((r) => r.ms).sort((x, y) => x - y);
const summary = {
  scenarios: pick.length,
  scenariosWithoutProblems: `${scenariosClean}/${pick.length}`,
  turns: rows.length,
  aiReplies: ai.length,
  fixedSafetyReplies: rows.filter((r) => r.source === "rules").length,
  noAnswer: rows.filter((r) => r.problems.some((p) => p.startsWith("no-answer"))).length,
  expectedTextMissing: rows.filter((r) => r.problems.some((p) => p.startsWith("expected-text"))).length,
  wrongText: rows.filter((r) => r.problems.some((p) => p.startsWith("wrong-text"))).length,
  sosMissing: rows.filter((r) => r.problems.includes("sos-missing")).length,
  adviceWhenHeard: rows.filter((r) => r.problems.includes("advice-when-she-wanted-to-be-heard")).length,
  clientRecheckFailed: rows.filter((r) => r.problems.some((p) => p.startsWith("client-recheck"))).length,
  repliesWithSummary: `${ai.filter((r) => r.rights).length}/${ai.length}`,
  latencyMs: { p50: sorted[Math.floor(sorted.length / 2)] || 0, p95: sorted[Math.floor(sorted.length * 0.95)] || 0 },
  noAnswerRate: pct(rows.filter((r) => r.problems.some((p) => p.startsWith("no-answer"))).length, rows.length),
};
const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(`docs/evidence/live-chat-review-${stamp}.txt`, `# LIVE review ${stamp}, ${ENDPOINT}, synthetic scenarios\n${lines.join("\n")}\n`, "utf8");
writeFileSync(`docs/evidence/live-chat-review-${stamp}.json`, JSON.stringify({ summary, rows }, null, 2), "utf8");
console.log(`\n${JSON.stringify(summary, null, 2)}`);
