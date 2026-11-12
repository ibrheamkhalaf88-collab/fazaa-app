import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest } from "../server/api/worker.js";
import { createMemoryStore } from "../server/api/store/memory.js";
import { toBase64 } from "../server/api/crypto.js";

const ORIGIN = "https://fazaa.example";
const DEV = "dev@fazaa.example";
const ENV = {
  MESSAGE_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
  ALLOWED_ORIGINS: ORIGIN,
  DEVELOPER_EMAILS: DEV,
};
const KEY = "AIzaTestKey_000000000000000000000000";

function world(fetchImpl) {
  const store = createMemoryStore();
  let clock = 1_000_000;
  const call = async (method, path, { body, as = DEV } = {}) => {
    const res = await handleRequest(
      new Request(`https://fazaa.example/api${path}`, {
        method,
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      ENV,
      { store, fetchImpl, now: (clock += 1000), staffEmail: async () => as },
    );
    return { status: res.status, body: await res.json().catch(() => null), text: "" };
  };
  return { store, call };
}

test("model list: the key's models from Google, chat models only, and the key is never in the reply", async () => {
  const seen = [];
  const w = world(async (url, init) => {
    seen.push({ url, key: init.headers["x-goog-api-key"] });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          {
            name: "models/gemini-3.5-flash-lite",
            displayName: "Lite",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3.5-flash",
            displayName: "Flash",
            supportedGenerationMethods: ["generateContent"],
          },
          { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
          { name: "models/gemini-3.5-flash-tts", supportedGenerationMethods: ["generateContent"] },
        ],
      }),
    };
  });
  await w.call("PUT", "/v1/staff/ai-config", { body: { provider: "gemini", apiKey: KEY } });
  const r = await w.call("GET", "/v1/staff/ai-models");
  assert.equal(r.body.ok, true);
  assert.deepEqual(
    r.body.models.map((m) => m.id),
    ["gemini-3.5-flash", "gemini-3.5-flash-lite"],
  );
  assert.equal(seen[0].key, KEY, "the key goes to Google in a header");
  assert.ok(!JSON.stringify(r.body).includes(KEY), "never back to the browser");
  assert.equal((await w.call("GET", "/v1/staff/ai-models", { as: "l@x.org" })).status, 401);
});

test("model list: a bad or suspended key says why", async () => {
  const w = world(async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      error: { status: "PERMISSION_DENIED", details: [{ reason: "CONSUMER_SUSPENDED" }] },
    }),
  }));
  await w.call("PUT", "/v1/staff/ai-config", { body: { provider: "gemini", apiKey: KEY } });
  const r = await w.call("GET", "/v1/staff/ai-models");
  assert.deepEqual(r.body, { ok: false, models: [], error: "CONSUMER_SUSPENDED" });
});

test("backup model is saved, shown, and used when the main one is busy; a single model can be tested alone", async () => {
  const urls = [];
  let busyFirst = true;
  const w = world(async (url) => {
    urls.push(url);
    if (busyFirst && /gemini-3\.5-flash-lite:/.test(url)) {
      busyFirst = false;
      return { ok: false, status: 503, json: async () => ({ error: { status: "UNAVAILABLE" } }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "give_answer",
                    args: { covered: true, lead: "مش غلطانة", steps: ["لا تدفعي"], note: "", cites: ["15"] },
                  },
                },
              ],
            },
          },
        ],
      }),
    };
  });
  const saved = await w.call("PUT", "/v1/staff/ai-config", {
    body: {
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      fallbackModel: "gemini-3.5-flash",
      apiKey: KEY,
    },
  });
  assert.equal(saved.body.fallbackModel, "gemini-3.5-flash");
  assert.equal(
    (
      await w.call("PUT", "/v1/staff/ai-config", {
        body: { provider: "gemini", fallbackModel: "bad model!" },
      })
    ).status,
    400,
  );

  const t = await w.call("POST", "/v1/staff/ai-config/test", { body: {} });
  assert.equal(t.body.ok, true);
  assert.match(urls.at(-1), /gemini-3\.5-flash:/, "the saved backup answered after the main one was busy");

  urls.length = 0;
  const only = await w.call("POST", "/v1/staff/ai-config/test", {
    body: { model: "gemini-flash-lite-latest" },
  });
  assert.equal(only.body.ok, true);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /gemini-flash-lite-latest:/);
});
