import assert from "node:assert/strict";
import { test } from "node:test";
import { createRemoteEngine } from "../src/ai/remote-engine.js";

const okResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const GOOD = { lead: "إنتِ مش غلطانة.", steps: ["لا تدفعي"], note: "", cites: ["15"] };

test("sends only the question and the country, with no credentials or referrer", async () => {
  let seen;
  const engine = createRemoteEngine({
    endpoint: "https://ai.example/v1/answer",
    fetchImpl: async (url, init) => ((seen = { url, init }), okResponse({ answer: GOOD })),
  });
  await engine.answer("سؤالي", { country: "ps-gaza" });
  assert.equal(seen.url, "https://ai.example/v1/answer");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.credentials, "omit");
  assert.equal(seen.init.referrerPolicy, "no-referrer");
  assert.deepEqual(JSON.parse(seen.init.body), { question: "سؤالي", country: "ps-gaza" });
});

test("truncates very long questions before sending", async () => {
  let body;
  const engine = createRemoteEngine({
    endpoint: "x",
    fetchImpl: async (_u, init) => ((body = JSON.parse(init.body)), okResponse({ answer: GOOD })),
  });
  await engine.answer("ا".repeat(2000), { country: "ps-wb" });
  assert.equal(body.question.length, 500);
});

test("returns a validated answer, marked as AI", async () => {
  const engine = createRemoteEngine({ endpoint: "x", fetchImpl: async () => okResponse({ answer: GOOD }) });
  const a = await engine.answer("q", { country: "ps-wb" });
  assert.equal(a.source, "ai");
});

test("null answer means 'not covered'", async () => {
  const engine = createRemoteEngine({ endpoint: "x", fetchImpl: async () => okResponse({ answer: null }) });
  assert.equal(await engine.answer("q", { country: "ps-wb" }), null);
});

test("throws on HTTP errors", async () => {
  const engine = createRemoteEngine({ endpoint: "x", fetchImpl: async () => okResponse({}, 502) });
  await assert.rejects(() => engine.answer("q", { country: "ps-wb" }), /proxy-status-502/);
});

test("throws when the server returns a citation the app does not have", async () => {
  const bad = { ...GOOD, cites: ["999"] };
  const engine = createRemoteEngine({ endpoint: "x", fetchImpl: async () => okResponse({ answer: bad }) });
  await assert.rejects(() => engine.answer("q", { country: "ps-wb" }), /unknown-article:999/);
});
