/**
 * Closed AI beta (only testers reach the model) and the one-rewrite rule for model replies that break a
 * rule. Fake provider only, no network.
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { answerQuestion, handleRequest, setBreaker } from "../server/ai-proxy/worker.js";
import { createBreaker } from "../server/ai-proxy/breaker.js";
import { createRemoteEngine } from "../src/ai/remote-engine.js";

const ENV = { PROVIDER: "gemini", GEMINI_API_KEY: "k", RETRY_PAUSE_MS: "0" };
const talk = (args) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "give_support", args } }] } }] }), {
    status: 200,
  });
beforeEach(() => setBreaker(createBreaker()));

test("a reply that promises safety gets ONE rewrite, told which rule it broke; the rewrite is used", async () => {
  const sent = [];
  const replies = [talk({ lead: "إنتِ بمكان آمن هلا، ما تخافي من حدا." }), talk({ lead: "سامعتك. شو اللي صار؟" })];
  const { status, body } = await answerQuestion("مش عارفة مع مين أحكي", "ps-wb", ENV, async (_u, init) => {
    sent.push(JSON.parse(init.body).contents[0].parts[0].text);
    return replies.shift();
  });
  assert.equal(status, 200);
  assert.equal(body.answer.lead, "سامعتك. شو اللي صار؟");
  assert.equal(sent.length, 2);
  assert.match(sent[1], /<feedback>.*promised safety/);
});

test("still breaking the rule after the rewrite: 502 (the app answers offline), never a third call", async () => {
  let calls = 0;
  const { status, body } = await answerQuestion("مش عارفة مع مين أحكي", "ps-wb", ENV, async () => (calls++, talk({ lead: "أنا هون دايماً وما أتركك." })));
  assert.equal(status, 502);
  assert.match(body.error, /forbidden/);
  assert.equal(calls, 2);
});

test("REWRITE=off: one call only", async () => {
  let calls = 0;
  await answerQuestion("مش عارفة مع مين أحكي", "ps-wb", { ...ENV, REWRITE: "off" }, async () => (calls++, talk({ lead: "أنا هون دايماً" })));
  assert.equal(calls, 1);
});

test("closed beta: without the tester code the model is never called and the app answers offline", async () => {
  const env = { ...ENV, AI_BETA_CODE: "tester-7", ALLOWED_ORIGINS: "https://fazaa.example" };
  let calls = 0;
  const fetchImpl = async () => (calls++, talk({ lead: "سامعتك" }));
  const post = (body) =>
    handleRequest(
      new Request("https://x/v1/answer", {
        method: "POST",
        headers: { origin: "https://fazaa.example", "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
      { fetchImpl },
    );
  const outsider = await (await post({ question: "بدي حدا يسمعني", country: "ps-wb" })).json();
  assert.equal(outsider.answer, null);
  const wrong = await (await post({ question: "بدي حدا يسمعني", country: "ps-wb", beta: "guess" })).json();
  assert.equal(wrong.answer, null);
  assert.equal(calls, 0);
  const tester = await (await post({ question: "بدي حدا يسمعني", country: "ps-wb", beta: "tester-7" })).json();
  assert.equal(tester.answer.lead, "سامعتك");
  assert.equal(calls, 1);
});

test("the app sends the tester code only when it has one", async () => {
  const bodies = [];
  const fetchImpl = async (_u, init) => (bodies.push(JSON.parse(init.body)), new Response(JSON.stringify({ answer: null }), { status: 200 }));
  let code = "";
  const remote = createRemoteEngine({ endpoint: "x", fetchImpl, beta: () => code });
  await remote.answer("سؤال", { country: "ps-wb" });
  assert.equal(bodies[0].beta, undefined);
  code = "tester-7";
  await remote.answer("سؤال", { country: "ps-wb" });
  assert.equal(bodies[1].beta, "tester-7");
});
