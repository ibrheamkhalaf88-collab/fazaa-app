/**
 * The live-evaluation harness (scripts/live-eval.mjs), run against a FAKE provider: no network, no cost.
 * It must stop spending at the cap, count failures, and never leak the key.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeGemini, listModels, runLiveEval, scenarioList } from "../scripts/live-eval.mjs";

const KEY = "SECRET-TEST-KEY-1234567890";
const ENV = { PROVIDER: "gemini", GEMINI_API_KEY: KEY, MODEL: "gemini-3.5-flash-lite", RETRY_PAUSE_MS: "0" };
const few = () => scenarioList(["C01 ", "C05", "L22", "S01"]);

test("dry run: every turn goes through the real app + server path and is measured", async () => {
  const { summary, rows } = await runLiveEval({ fetchImpl: fakeGemini(), env: ENV, scenarios: few(), modes: ["message"] });
  assert.equal(summary.turns, rows.length);
  assert.ok(summary.aiAnswered > 0);
  assert.ok(rows.some((r) => r.source === "rules"), "danger replies stay offline, never the model");
  assert.ok(summary.cost.calls > 0 && summary.cost.usd > 0);
});

test("the budget cap stops provider calls; she still gets the offline reply", async () => {
  const { summary, rows } = await runLiveEval({ fetchImpl: fakeGemini(), env: ENV, scenarios: few(), modes: ["message"], capUsd: 0.0005 });
  assert.equal(summary.cost.calls, 1, "one call, then the cap");
  assert.ok(summary.cost.blockedByCap > 0);
  assert.ok(rows.every((r) => r.source !== "none" || r.problems.length === 0));
});

test("provider failures are counted and fall back offline", async () => {
  const { summary } = await runLiveEval({ fetchImpl: fakeGemini({ failEvery: 1 }), env: ENV, scenarios: few(), modes: ["message"] });
  assert.equal(summary.aiAnswered, 0);
  assert.ok(summary.fellBack > 0);
  assert.ok(Object.keys(summary.providerErrors).some((k) => /upstream-503|circuit-open/.test(k)));
});

test("the key never appears in the results or the transcript", async () => {
  const result = await runLiveEval({ fetchImpl: fakeGemini(), env: ENV, scenarios: few(), modes: ["message", "context"] });
  assert.ok(!JSON.stringify(result).includes(KEY));
});

test("context mode sends the session summary; message mode does not", async () => {
  const bodies = [];
  const fake = fakeGemini();
  const spy = async (url, init) => (bodies.push(JSON.parse(init.body).contents[0].parts[0].text), fake(url, init));
  await runLiveEval({ fetchImpl: spy, env: ENV, scenarios: scenarioList(["C01 "]), modes: ["message"] });
  assert.ok(!bodies.some((b) => b.includes("<context>")));
  bodies.length = 0;
  await runLiveEval({ fetchImpl: spy, env: ENV, scenarios: scenarioList(["C01 "]), modes: ["context"] });
  assert.ok(bodies.some((b) => b.includes("her report, not verified")));
});

test("model list: names without the «models/» prefix; the key goes in a header, not the URL", async () => {
  let seen;
  const names = await listModels(async (url, init) => {
    seen = { url, key: init.headers["x-goog-api-key"] };
    return new Response(JSON.stringify({ models: [{ name: "models/gemini-3.5-flash-lite" }] }), { status: 200 });
  }, KEY);
  assert.deepEqual(names, ["gemini-3.5-flash-lite"]);
  assert.ok(!seen.url.includes(KEY));
  assert.equal(seen.key, KEY);
});
