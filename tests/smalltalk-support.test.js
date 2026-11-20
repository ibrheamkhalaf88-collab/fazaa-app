import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnswerer } from "../src/ai/answerer.js";
import { companionAnswer, ventingFeeling } from "../src/ai/companion.js";
import { detectSmallTalk } from "../src/ai/smalltalk.js";
import { detectIntents } from "../src/ai/detect.js";
import { answerQuestion, SUPPORT_TOOL } from "../server/ai-proxy/worker.js";

const ask = (q, deps = {}) => createAnswerer(deps).answer(q, { country: "ps-wb" });

test("greetings, how are you, who are you, help me, thanks: a warm chat reply, never a refusal", async () => {
  for (const [q, kind] of [
    ["مرحبا", "hello"],
    ["السلام عليكم", "hello"],
    ["كيف حالك", "how"],
    ["كيفك؟", "how"],
    ["شو اسمك", "name"],
    ["مين انتي", "name"],
    ["ساعديني", "help"],
    ["دخيلك ساعدني", "help"],
    ["شكرا كتير", "thanks"],
  ]) {
    assert.equal(detectSmallTalk(q)?.kind, kind, q);
    const a = await ask(q);
    assert.equal(a.kind, "chat", q);
    assert.ok(a.lead.length > 10, q);
    // (2026-11-12) short and honest: no promise of secrecy, no "I will never leave you"
    assert.doesNotMatch(a.lead, /بيضل بيننا|ما رح أتركك|بسرية/, q);
  }
});

test("a long question that starts with hello still gets the law answer", async () => {
  assert.equal(detectSmallTalk("مرحبا، حدا عم يبتزني بصوري وبدّه مصاري، شو بعمل؟"), null);
  const a = await ask("مرحبا، حدا عم يبتزني بصوري وبدّه مصاري، شو بعمل؟");
  assert.notEqual(a.kind, "chat");
  assert.equal(a.topic, "ابتزاز"); // the blackmail answer, not a greeting (no article since 2026-11-18)
  assert.equal(a.sos, true);
  // (2026-11-12) no rotating "line of hope" any more: it repeated in every reply
});

test("danger still wins over a greeting", async () => {
  assert.equal((await ask("مرحبا ضربني وخايفة يرجع")).sos, true);
});

test("venting replies follow her feeling and end with hope", () => {
  assert.equal(ventingFeeling("أنا خايفة كتير"), "afraid");
  assert.equal(ventingFeeling("جوزي بيهينني قدام الناس"), "humiliated");
  assert.equal(ventingFeeling("حاسة حالي لحالي"), "alone");
  const a = companionAnswer("جوزي بيهينني قدام الناس");
  assert.match(a.lead, /يهينك/);
  assert.ok(a.steps.length >= 3);
  assert.ok(a.closing);
  assert.deepEqual(a.cites, []);
});

test("'he doesn't spend on us' is recognised as maintenance", () => {
  assert.ok(detectIntents("جوزي ما بيصرف علي").nafaqa);
});

test("server: no matching article -> the model gives a SUPPORT reply, labelled, with no citations", async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
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
                    name: SUPPORT_TOOL.name,
                    args: {
                      lead: "حاسة فيكِ، واللي عم تمري فيه صعب.",
                      steps: ["خدي نفس", "احكي لحدا بتثقي فيه"],
                      closing: "إنتِ أقوى مما بتتخيلي 🤍",
                      cites: ["15"],
                    },
                  },
                },
              ],
            },
          },
        ],
      }),
    };
  };
  const { status, body } = await answerQuestion(
    "كيف بقدر أرجع أبتسم",
    "ps-wb",
    { PROVIDER: "gemini", GEMINI_API_KEY: "k" },
    fetchImpl,
  );
  assert.equal(status, 200);
  assert.equal(sent.tools[0].functionDeclarations[0].name, "give_support");
  assert.match(sent.systemInstruction.parts[0].text, /Say NOTHING about laws/);
  // (2026-11-12) a "talk" reply: it carries no citations at all (a slipped one is dropped)
  assert.equal(body.answer.kind, "talk");
  assert.ok(!body.answer.cites, "a citation slipped by the model is dropped");
  assert.equal(body.answer.general, true);
  assert.match(body.answer.lead, /حاسة فيكِ/);
});

test("server: support mode can be switched off", async () => {
  const { body } = await answerQuestion(
    "كيف بقدر أرجع أبتسم",
    "ps-wb",
    { PROVIDER: "gemini", GEMINI_API_KEY: "k", SUPPORT_MODE: "off" },
    async () => {
      throw new Error("must not be called");
    },
  );
  assert.equal(body.answer, null);
});
