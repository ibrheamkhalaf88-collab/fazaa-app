import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest } from "../server/ai-proxy/worker.js";
import { extractJson } from "../server/ai-proxy/providers.js";

const ORIGIN = "https://fazaa.example";
const GOOD = {
  covered: true,
  lead: "إنتِ مش غلطانة.",
  steps: ["لا تدفعي", "صوّري الرسائل"],
  note: "المادة 15",
  cites: ["15"],
  sos: true,
};
const post = () =>
  new Request("https://ai.example/v1/answer", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ question: "حدا عم يبتزني بصوري", country: "ps-wb" }),
  });
const fake = (payload) => {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => payload };
    },
  };
};

test("a provider error returns its short reason code, never the key or the request", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key. key=g-key",
        status: "INVALID_ARGUMENT",
        details: [{ reason: "API_KEY_INVALID" }],
      },
    }),
  });
  const res = await handleRequest(
    post(),
    { PROVIDER: "gemini", GEMINI_API_KEY: "g-key", ALLOWED_ORIGINS: ORIGIN },
    { fetchImpl },
  );
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "upstream-400:API_KEY_INVALID");
  assert.ok(!JSON.stringify(body).includes("g-key"));
});

test("gemini: calls generateContent with the key in a header and reads functionCall.args", async () => {
  const api = fake({
    candidates: [{ content: { parts: [{ functionCall: { name: "give_answer", args: GOOD } }] } }],
  });
  const res = await handleRequest(
    post(),
    { PROVIDER: "gemini", GEMINI_API_KEY: "g-key", ALLOWED_ORIGINS: ORIGIN },
    { fetchImpl: api.fetchImpl },
  );
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).answer.cites, ["15"]);
  const c = api.calls[0];
  assert.match(
    c.url,
    /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash-lite:generateContent$/,
  );
  assert.equal(c.init.headers["x-goog-api-key"], "g-key");
  assert.ok(!c.url.includes("g-key"), "key must not be in the URL");
  assert.equal(c.body.toolConfig.functionCallingConfig.mode, "ANY");
});

test("gemini is the default provider and MODEL overrides the model", async () => {
  const api = fake({
    candidates: [{ content: { parts: [{ functionCall: { name: "give_answer", args: GOOD } }] } }],
  });
  await handleRequest(
    post(),
    { GEMINI_API_KEY: "k", MODEL: "gemini-x", ALLOWED_ORIGINS: ORIGIN },
    { fetchImpl: api.fetchImpl },
  );
  assert.match(api.calls[0].url, /models\/gemini-x:generateContent/);
});

test("nvidia: OpenAI-style call, reads tool_calls arguments (a JSON string)", async () => {
  const api = fake({
    choices: [
      { message: { tool_calls: [{ function: { name: "give_answer", arguments: JSON.stringify(GOOD) } }] } },
    ],
  });
  const res = await handleRequest(
    post(),
    { PROVIDER: "nvidia", NVIDIA_API_KEY: "nvapi-1", ALLOWED_ORIGINS: ORIGIN },
    { fetchImpl: api.fetchImpl },
  );
  assert.equal(res.status, 200);
  const c = api.calls[0];
  assert.equal(c.url, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(c.init.headers.authorization, "Bearer nvapi-1");
  assert.equal(c.body.tool_choice.function.name, "give_answer");
});

test("nvidia: accepts JSON in plain text when the model ignores tools", async () => {
  const api = fake({ choices: [{ message: { content: "```json\n" + JSON.stringify(GOOD) + "\n```" } }] });
  const res = await handleRequest(
    post(),
    { PROVIDER: "nvidia", NVIDIA_API_KEY: "k", ALLOWED_ORIGINS: ORIGIN },
    { fetchImpl: api.fetchImpl },
  );
  assert.equal(res.status, 200);
});

test("a provider answer citing an article that was not retrieved is still rejected", async () => {
  const api = fake({
    choices: [
      { message: { tool_calls: [{ function: { arguments: JSON.stringify({ ...GOOD, cites: ["52"] }) } }] } },
    ],
  });
  const res = await handleRequest(
    post(),
    { PROVIDER: "nvidia", NVIDIA_API_KEY: "k", ALLOWED_ORIGINS: ORIGIN },
    { fetchImpl: api.fetchImpl },
  );
  assert.equal(res.status, 502);
});

test("unknown provider and missing key are clean errors", async () => {
  assert.equal((await handleRequest(post(), { PROVIDER: "x", ALLOWED_ORIGINS: ORIGIN })).status, 500);
  assert.equal((await handleRequest(post(), { PROVIDER: "gemini", ALLOWED_ORIGINS: ORIGIN })).status, 503);
});

test("extractJson handles fences, prose around JSON and garbage", () => {
  assert.deepEqual(extractJson('هاي النتيجة: {"a":1} شكراً'), { a: 1 });
  assert.equal(extractJson("no json"), undefined);
  assert.equal(extractJson("{broken"), undefined);
});
