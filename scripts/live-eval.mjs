/**
 * LIVE evaluation of the assistant with a real model (Gemini), on the app's real path:
 *   app answerer (src/ai/answerer.js) -> remote engine (validation) -> server step (answerQuestion: danger first,
 *   grounding, prompts, retries, circuit breaker) -> provider.
 * Every scenario is SYNTHETIC (tests/fixtures/assistant-scenarios.js). No real user text is ever sent.
 *
 *   node scripts/live-eval.mjs --dry-run                 fake provider, no network, no cost (default)
 *   node scripts/live-eval.mjs --live [--cap-usd 5]      real calls: needs GEMINI_API_KEY in the environment
 *        [--model gemini-3.5-flash-lite] [--fallback-model …] [--modes chat|message,context] [--delay-ms 4000]
 *        [--only C01,L22] [--out docs/evidence/live-eval]
 *
 * Money: the run stops calling the provider once the estimated cost reaches --cap-usd (default 5). The estimate
 * uses the provider's own token counts (usageMetadata) and the prices below (Google's page, read 2026-11-13);
 * check them before a run: https://ai.google.dev/gemini-api/docs/pricing
 * The key is read from the environment only, never printed, never written to the output files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAnswerer } from "../src/ai/answerer.js";
import { createAssistant } from "../src/ai/assistant.js";
import { contactsFor, DEFAULT_CONTACTS } from "../src/data/contacts.js";
import { createRemoteEngine } from "../src/ai/remote-engine.js";
import { answerQuestion, parseAnswerRequest, setBreaker } from "../server/ai-proxy/worker.js";
import { createBreaker } from "../server/ai-proxy/breaker.js";
import { CONVERSATIONS, LEGAL, SAFETY } from "../tests/fixtures/assistant-scenarios.js";
import { checkAnswer } from "../tests/fixtures/check.js";

/** USD per 1M tokens (thinking tokens are billed as output). */
export const PRICES = {
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-3.6-flash": { in: 0.75, out: 3.75 },
  "gemini-3.8-flash": { in: 0.75, out: 3.75 },
};
const DEFAULT_PRICE = { in: 0.75, out: 3.75 }; // unknown model: assume the dearer Flash price

/** Words from other dialects (the prompt asks for Palestinian Arabic). */
const OTHER_DIALECT =
  /(?:^|[^\p{L}])(?:هلق|شلون|ايش|إيش|دلوقتي|دلوقت|كده|كدا|بتاعي|بتاعك|وايد|شنو|اكو|ماكو|ازيك|إزيك)(?=[^\p{L}]|$)/u;

/** Structural expectations only: the model words things differently from the offline replies. */
const STRUCTURAL = (exp = {}) => {
  const keep = {};
  for (const k of ["sos", "notCites", "noOptions", "none"]) if (k in exp) keep[k] = exp[k];
  return keep;
};

/** Scenario list as conversations: [{id, turns: [{say, country, expect}]}]. */
export function scenarioList(only = []) {
  const list = [
    ...CONVERSATIONS.map((c) => ({ id: c.id, turns: c.turns })),
    ...LEGAL.map((l) => ({
      id: l.id,
      turns: (l.turns || [l.say]).map((say) => ({
        say,
        country: l.country,
        expect: l.turns ? {} : l.expect,
      })),
    })),
    ...SAFETY.map((s) => ({
      id: s.id,
      numbers: s.numbers,
      turns: s.turns.map((say, i) => ({ say, expect: s.expect[i] || {} })),
    })),
  ];
  // the app is for Gaza only (2026-11-19): scenarios set to another region are not sent to the model
  const gaza = list.filter((c) =>
    c.turns.every((t) => typeof t === "string" || t.country === undefined || t.country === "ps-gaza"),
  );
  return only.length ? gaza.filter((c) => only.some((p) => c.id.startsWith(p))) : gaza;
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const quantile = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const sentences = (text) =>
  String(text || "")
    .split(/(?<=[.؟!])\s+/)
    .filter((x) => x.trim().length > 2).length;

/**
 * @param {{
 *   fetchImpl: typeof fetch, env: Record<string,string>, scenarios: ReturnType<typeof scenarioList>,
 *   modes?: string[], capUsd?: number, prices?: {in:number,out:number}, delayMs?: number, log?: (s: string) => void,
 * }} o
 * Modes: "chat" (default) drives the AI-first assistant the live site uses (src/ai/assistant.js, the whole
 * conversation sent each turn, «مين بيساعدني» contacts in the prompt, as server/api/routes/public.js does);
 * "message" and "context" drive the older rules-first answerer (src/ai/answerer.js), kept for comparison.
 */
export async function runLiveEval({
  fetchImpl,
  env,
  scenarios,
  modes = ["chat"],
  capUsd = 5,
  prices = DEFAULT_PRICE,
  delayMs = 0,
  log = () => {},
}) {
  setBreaker(createBreaker()); // a fresh circuit for the run
  const cost = { inTok: 0, outTok: 0, usd: 0, calls: 0, blockedByCap: 0 };
  const providerErrors = {};
  let turnServerError = "";

  /** Provider calls: budget gate, timing, token counts. */
  async function providerFetch(url, init) {
    if (cost.usd >= capUsd) {
      cost.blockedByCap++;
      throw new Error("budget-cap"); // the server reports upstream-unreachable; the app answers offline
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    cost.calls++;
    const res = await fetchImpl(url, init);
    const text = await res.text();
    try {
      const u = JSON.parse(text).usageMetadata || {};
      const inTok = Number(u.promptTokenCount) || 0;
      const outTok = (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0);
      cost.inTok += inTok;
      cost.outTok += outTok;
      cost.usd += (inTok * prices.in + outTok * prices.out) / 1e6;
    } catch {
      /* not JSON: counted as a call, no tokens */
    }
    return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
  }

  /** The app's endpoint, served in-process by the real server step. */
  async function serverBridge(_url, init) {
    const req = parseAnswerRequest(JSON.parse(init.body));
    if (req.error) return new Response(JSON.stringify({ error: req.error }), { status: 400 });
    const { status, body } = await answerQuestion(req.question, req.country, env, providerFetch, {
      ...req,
      contacts: contactsFor(DEFAULT_CONTACTS, req.country), // the live list today (no number beyond 100/101/102)
    });
    if (status !== 200) {
      turnServerError = body.error || `status-${status}`;
      const key = turnServerError.replace(/:.*/, (m) => (m.length > 40 ? m.slice(0, 40) : m));
      providerErrors[key] = (providerErrors[key] || 0) + 1;
    }
    return new Response(JSON.stringify(body), { status });
  }

  const rows = [];
  const lines = [];
  for (const mode of modes) {
    for (const sc of scenarios) {
      lines.push(`\n=== [${mode}] ${sc.id}`);
      const clientErrors = [];
      const remote = createRemoteEngine({
        endpoint: "live-eval://answer",
        fetchImpl: serverBridge,
        timeoutMs: 60000,
      });
      const numbers = () => sc.numbers || { police: "100", ambulance: "101" };
      const a =
        mode === "chat"
          ? createAssistant({
              emergencyNumbers: numbers,
              available: () => ({ lawyer: true, contacts: true }),
              remote,
              isRemoteEnabled: () => true,
              onRemoteError: (e) => clientErrors.push(e.message),
            })
          : createAnswerer({
              emergencyNumbers: () => sc.numbers || { police: "100", ambulance: "101" },
              available: () => ({ lawyer: true, contacts: true }),
              remote: createRemoteEngine({
                endpoint: "live-eval://answer",
                fetchImpl: serverBridge,
                timeoutMs: 60000,
              }),
              isRemoteEnabled: () => true,
              shareContext: () => mode === "context",
              onRemoteError: (e) => clientErrors.push(e.message),
            });
      const asks = [];
      for (const turn of sc.turns) {
        // real pacing: one message every few seconds even when no provider call is made (without it a 60-second
        // circuit pause swallowed dozens of turns in a fraction of a second and inflated the failure count)
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        turnServerError = "";
        clientErrors.length = 0;
        const t0 = performance.now();
        const r = await a.answer(turn.say, { country: turn.country || "ps-gaza" });
        const ms = performance.now() - t0;
        const text = r
          ? [r.lead, r.ask, r.safetyAsk, ...(r.options || []), ...(r.steps || []), r.note]
              .filter(Boolean)
              .join(" ")
          : "";
        const problems = checkAnswer(r, STRUCTURAL(turn.expect));
        const reasked = Boolean(r?.ask && asks.includes(r.ask));
        if (r?.ask) asks.push(r.ask);
        const row = {
          mode,
          scenario: sc.id,
          say: turn.say,
          source: r?.source || "none",
          ms: Math.round(ms),
          serverError: turnServerError,
          clientError: clientErrors.find((m) => !m.startsWith("proxy-status")) || "",
          dialect: OTHER_DIALECT.test(text),
          long: sentences(r?.lead) > 5,
          reasked,
          problems,
        };
        rows.push(row);
        lines.push(`SHE: ${turn.say}`);
        lines.push(
          r
            ? `   [${r.source}${r.sos ? " sos" : ""}${r.cites?.length ? ` cites:${r.cites}` : ""}] ${r.lead}${r.ask ? `\n   ? ${r.ask}` : ""}`
            : "   [no reply]",
        );
        for (const o of r?.options || r?.steps || []) lines.push(`   • ${o}`);
        if (row.serverError || row.clientError)
          lines.push(`   (fell back: ${row.serverError || row.clientError})`);
        if (problems.length) lines.push(`   !! ${problems.join("; ")}`);
        log(`${mode} ${sc.id.slice(0, 4)} ${row.source} ${row.ms}ms $${cost.usd.toFixed(4)}`);
      }
    }
  }

  const ai = rows.filter((r) => r.source === "ai");
  const attempted = rows.filter((r) => r.source === "ai" || r.serverError || r.clientError);
  const summary = {
    turns: rows.length,
    aiAnswered: ai.length,
    attemptedOnline: attempted.length,
    aiRate: pct(ai.length, attempted.length),
    fellBack: attempted.length - ai.length,
    providerErrors,
    validationRejections: rows.filter((r) =>
      /invalid-output|legal-leak|forbidden|ungrounded/.test(r.serverError + r.clientError),
    ).length,
    structuralFailures: rows.filter((r) => r.problems.length).length,
    otherDialect: ai.filter((r) => r.dialect).length,
    tooLong: ai.filter((r) => r.long).length,
    questionRepeated: rows.filter((r) => r.reasked).length,
    latencyMs: {
      p50: quantile(
        ai.map((r) => r.ms),
        0.5,
      ),
      p95: quantile(
        ai.map((r) => r.ms),
        0.95,
      ),
    },
    cost: {
      calls: cost.calls,
      inputTokens: cost.inTok,
      outputTokens: cost.outTok,
      usd: Number(cost.usd.toFixed(4)),
      blockedByCap: cost.blockedByCap,
    },
  };
  return { summary, rows, transcript: lines.join("\n") };
}

/** Which models this key can use (a free metadata call: no tokens). */
export async function listModels(fetchImpl, key) {
  const res = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": key },
  });
  if (!res.ok) throw new Error(`models-${res.status}`);
  return ((await res.json()).models || []).map((m) => String(m.name).replace(/^models\//, ""));
}

/** A stand-in for Gemini: same reply shape, plausible text, fake token counts. No network. */
export function fakeGemini({ failEvery = 0 } = {}) {
  let n = 0;
  return async (_url, init) => {
    n++;
    if (failEvery && n % failEvery === 0)
      return new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 });
    const body = JSON.parse(init.body);
    const tool = body.tools?.[0]?.functionDeclarations?.[0]?.name || "give_support";
    const user = body.contents?.[0]?.parts?.[0]?.text || "";
    const ids = [...user.matchAll(/<article id="([^"]+)"/g)].map((m) => m[1]);
    const args =
      tool === "give_answer"
        ? {
            covered: ids.length > 0,
            lead: "فهمت سؤالك.",
            note: "النص بيحكي عن هالموضوع بشكل عام.",
            steps: ["اسألي محامية عن وضعك بالزبط"],
            cites: ids.slice(0, 1),
          }
        : { lead: "سامعتك، واللي بتحكيه مهم.", ask: "بتحبي تحكيلي أكتر؟" };
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ functionCall: { name: tool, args } }] } }],
        usageMetadata: { promptTokenCount: 2500, candidatesTokenCount: 120, thoughtsTokenCount: 300 },
      }),
      { status: 200 },
    );
  };
}

/* ---------- command line ---------- */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback = "") => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[i + 1]
      : fallback;
  };
  const live = process.argv.includes("--live");
  const model = arg("model", process.env.MODEL || "gemini-flash-lite-latest"); // the model the site runs (wrangler.toml)
  const fallbackModel = arg("fallback-model", process.env.FALLBACK_MODEL || "");
  const capUsd = Number(arg("cap-usd", "5"));
  const modes = arg("modes", "chat").split(",").filter(Boolean);
  const only = arg("only", "").split(",").filter(Boolean);
  const out = arg("out", "docs/evidence/live-eval");
  const scenarios = scenarioList(only);
  const prices = PRICES[model] || DEFAULT_PRICE;

  let fetchImpl;
  const env = {
    PROVIDER: "gemini",
    MODEL: model,
    ...(fallbackModel ? { FALLBACK_MODEL: fallbackModel } : {}),
  };
  if (live) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.error("GEMINI_API_KEY is not set in this terminal. Nothing was sent.");
      process.exit(2);
    }
    env.GEMINI_API_KEY = key;
    fetchImpl = fetch;
    const models = await listModels(fetch, key);
    const missing = [model, fallbackModel || "gemini-3.5-flash"].filter((m) => !models.includes(m));
    console.log(`models available to this key: ${models.length}`);
    if (missing.includes(model)) {
      console.error(
        `model ${model} is not available to this key. Pick one of: ${models.filter((m) => /flash/.test(m)).join(", ")}`,
      );
      process.exit(3);
    }
    if (missing.length)
      console.log(
        `warning: backup model ${missing.join(", ")} is not available: busy retries will fail (set --fallback-model)`,
      );
  } else {
    env.GEMINI_API_KEY = "dry-run-not-a-key";
    env.RETRY_PAUSE_MS = "0";
    fetchImpl = fakeGemini();
  }

  const turns = scenarios.reduce((n, s) => n + s.turns.length, 0) * modes.length;
  const worst = ((turns * 3 * (3500 * prices.in + 2048 * prices.out)) / 1e6).toFixed(2);
  console.log(
    `${live ? "LIVE" : "DRY RUN (fake provider, no network, no cost)"}: ${scenarios.length} scenarios x ${modes.join("+")} = ${turns} turns, model ${model}`,
  );
  console.log(
    `price $${prices.in}/$${prices.out} per 1M in/out; worst case (3 tries, full output every turn) ≈ $${worst}; cap $${capUsd}`,
  );

  const { summary, transcript } = await runLiveEval({
    fetchImpl,
    env,
    scenarios,
    modes,
    capUsd,
    prices,
    delayMs: Number(arg("delay-ms", live ? "0" : "0")),
    log: (s) => process.stdout.write(`\r${s.padEnd(60)}`),
  });
  process.stdout.write("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const tag = live ? model : "dry-run";
  mkdirSync(out.replace(/[^/\\]+$/, "") || ".", { recursive: true });
  // never the key: it is not in env dumps, transcripts or the summary
  const header = `# ${live ? "LIVE" : "DRY RUN"} ${tag} ${stamp} (synthetic scenarios; scripts/live-eval.mjs)\n`;
  writeFileSync(`${out}-${tag}-${stamp}.txt`, `${header}${transcript}\n`, "utf8");
  writeFileSync(
    `${out}-${tag}-${stamp}.json`,
    JSON.stringify({ model: tag, date: stamp, modes, summary }, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`written: ${out}-${tag}-${stamp}.txt / .json`);
}
