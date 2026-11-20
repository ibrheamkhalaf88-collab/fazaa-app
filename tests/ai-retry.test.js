import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { answerQuestion, setBreaker, SUPPORT_TOOL } from "../server/ai-proxy/worker.js";
import { createBreaker } from "../server/ai-proxy/breaker.js";

// each test starts with a closed circuit (the breaker is shared by all questions in one Worker)
beforeEach(() => setBreaker(createBreaker()));

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

test("still busy after all tries: three attempts (primary, backup, primary), then the app uses its offline answers", async () => {
  const urls = [];
  const { status, body } = await answerQuestion("بدي حدا يسمعني", "ps-wb", ENV, async (url) => {
    urls.push(url);
    return busy(503, "UNAVAILABLE");
  });
  assert.equal(status, 502);
  assert.equal(body.error, "upstream-503:UNAVAILABLE");
  assert.equal(urls.length, 3);
  assert.match(urls[1], /gemini-3\.5-flash:/);
});

test("busy twice, free on the third try: she gets her answer", async () => {
  const replies = [
    busy(503, "UNAVAILABLE"),
    busy(429, "RESOURCE_EXHAUSTED"),
    ok({ lead: "سامعتك", steps: ["خدي نفس"] }),
  ];
  const { status } = await answerQuestion("بدي حدا يسمعني", "ps-wb", ENV, async () => replies.shift());
  assert.equal(status, 200);
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
    // what Google really sends for a bad key: status INVALID_ARGUMENT, reason API_KEY_INVALID
    return {
      ok: false,
      status: 400,
      json: async () => ({ error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }),
    };
  });
  assert.equal(calls, 1);
});

test("(2026-11-17) Gemini too slow: the backup model is tried, and she gets her answer", async () => {
  const urls = [];
  let n = 0;
  const { status, body } = await answerQuestion("بدي حدا يسمعني", "ps-wb", ENV, async (url) => {
    urls.push(url);
    if (n++ === 0) throw new DOMException("timed out", "TimeoutError");
    return ok({ lead: "سامعتك", steps: ["خدي نفس"] });
  });
  assert.equal(status, 200);
  assert.equal(body.answer.lead, "سامعتك");
  assert.match(urls[1], /gemini-3\.5-flash:/);
});

test("(2026-11-17) every try is cut to the time that is left, so the app never waits past its limit", async () => {
  const timeouts = [];
  const real = AbortSignal.timeout;
  AbortSignal.timeout = (ms) => (timeouts.push(ms), real.call(AbortSignal, ms));
  try {
    await answerQuestion("بدي حدا يسمعني", "ps-wb", { ...ENV, UPSTREAM_MS: "60000" }, async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
  } finally {
    AbortSignal.timeout = real;
  }
  assert.ok(timeouts.length >= 2);
  assert.ok(
    timeouts.every((ms) => ms <= 35000),
    `timeouts: ${timeouts}`,
  );
});

test("(2026-11-17) thinking is kept to the minimum, and a model that rejects the setting is asked again without it", async () => {
  const bodies = [];
  const replies = [busy(400, "INVALID_ARGUMENT"), ok({ lead: "سامعتك", steps: ["خدي نفس"] })];
  const { status } = await answerQuestion("بدي حدا يسمعني", "ps-wb", ENV, async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return replies.shift();
  });
  assert.equal(status, 200);
  assert.deepEqual(bodies[0].generationConfig.thinkingConfig, { thinkingLevel: "minimal" });
  assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
});
