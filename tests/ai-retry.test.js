import assert from "node:assert/strict";
import { test } from "node:test";
import { answerQuestion, SUPPORT_TOOL } from "../server/ai-proxy/worker.js";

const ENV = { PROVIDER: "gemini", GEMINI_API_KEY: "k", RETRY_PAUSE_MS: 0 };
const ok = (args) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ functionCall: { name: SUPPORT_TOOL.name, args } }] } }],
  }),
});
const busy = (status, reason) => ({
  ok: false,
  status,
  json: async () => ({ error: { status: reason } }),
});

test("Google busy (429 / 503): one retry on the fallback model, and she gets her answer", async () => {
  const urls = [];
  const replies = [busy(429, "RESOURCE_EXHAUSTED"), ok({ lead: "سامعتك 🤍", steps: ["خدي نفس"] })];
  const { status, body } = await answerQuestion("بدي حدا يسمعني", "ps-wb", ENV, async (url) => {
    urls.push(url);
    return replies.shift();
  });
  assert.equal(status, 200);
  assert.equal(body.answer.lead, "سامعتك 🤍");
  assert.equal(urls.length, 2);
  assert.match(urls[1], /gemini-3\.5-flash:/);
});

test("still busy after the retry: the first error is reported (the app then uses its offline answers)", async () => {
  const { status, body } = await answerQuestion("بدي حدا يسمعني", "ps-wb", ENV, async () =>
    busy(503, "UNAVAILABLE"),
  );
  assert.equal(status, 502);
  assert.equal(body.error, "upstream-503:UNAVAILABLE");
});

test("the request leaves room for a full answer (newer models think before answering)", async () => {
  let body;
  await answerQuestion("بدي حدا يسمعني", "ps-wb", ENV, async (url, init) => {
    body = JSON.parse(init.body);
    return ok({ lead: "سامعتك", steps: ["خدي نفس"] });
  });
  assert.ok(body.generationConfig.maxOutputTokens >= 2048);
});

test("a bad key is not retried", async () => {
  let calls = 0;
  await answerQuestion("بدي حدا يسمعني", "ps-wb", ENV, async () => {
    calls++;
    return busy(400, "INVALID_ARGUMENT");
  });
  assert.equal(calls, 1);
});
