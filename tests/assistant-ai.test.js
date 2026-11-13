/**
 * The AI-first assistant (owner's decision 2026-11-13). Fake provider only, no network.
 * The three things the owner asked to verify:
 *   1. every user's conversation is separate from every other user's;
 *   2. the replies come from the Palestinian law texts in the app (and nothing else);
 *   3. it is a real conversation (it sees what was said before).
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createAssistant } from "../src/ai/assistant.js";
import { createRemoteEngine } from "../src/ai/remote-engine.js";
import { articlesForChat, answerQuestion, parseAnswerRequest, setBreaker } from "../server/ai-proxy/worker.js";
import { createBreaker } from "../server/ai-proxy/breaker.js";

const ENV = { PROVIDER: "gemini", GEMINI_API_KEY: "k", RETRY_PAUSE_MS: "0" };
beforeEach(() => setBreaker(createBreaker()));

const reply = (args) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "give_reply", args } }] } }] }), { status: 200 });

/** A whole stack in one process: app assistant -> remote engine -> server chat -> fake provider. */
function stack(provider, extra = {}) {
  const seen = [];
  const providerFetch = async (url, init) => {
    seen.push(JSON.parse(init.body));
    return provider(JSON.parse(init.body));
  };
  const serverFetch = async (_u, init) => {
    const req = parseAnswerRequest(JSON.parse(init.body));
    const { status, body } = await answerQuestion(req.question, req.country, ENV, providerFetch, req);
    return new Response(JSON.stringify(body), { status });
  };
  const a = createAssistant({
    remote: createRemoteEngine({ endpoint: "x", fetchImpl: serverFetch }),
    isRemoteEnabled: () => true,
    emergencyNumbers: () => ({ police: "100", ambulance: "101" }),
    ...extra,
  });
  return { a, seen, say: (q, country = "ps-wb") => a.answer(q, { country }) };
}

const lastUserText = (body) => body.contents.at(-1).parts[0].text;
const systemText = (body) => body.systemInstruction.parts[0].text;

test("3: a real conversation: the model receives the earlier turns, with their roles", async () => {
  const { seen, say } = stack(() => reply({ reply: "سامعتك، احكيلي أكتر." }));
  await say("جوزي هددني مبارح");
  await say("حكى رح ياخد الولاد");
  await say("طيب شو بقدر أعمل؟");
  const last = seen.at(-1);
  assert.deepEqual(last.contents.map((c) => c.role), ["user", "model", "user", "model", "user"]);
  assert.match(last.contents[0].parts[0].text, /هددني مبارح/);
  assert.match(lastUserText(last), /شو بقدر أعمل/);
});

test("1: two women at the same time: neither conversation reaches the other's request", async () => {
  const echo = (body) => reply({ reply: `وصلني: ${lastUserText(body).slice(0, 20)}` });
  const one = stack(echo);
  const two = stack(echo);
  await Promise.all([one.say("جوزي ما بيصرف علي"), two.say("حماتي بتعيّرني كل يوم")]);
  await Promise.all([one.say("شو حقي؟"), two.say("شو بعمل؟")]);
  const oneAll = JSON.stringify(one.seen);
  const twoAll = JSON.stringify(two.seen);
  assert.ok(!oneAll.includes("حماتي"), "her conversation never carries the other one's words");
  assert.ok(!twoAll.includes("ما بيصرف"), "and the other way round");
  assert.equal(one.a.turns.length, 4);
  assert.equal(two.a.turns.length, 4);
});

test("1: the server keeps nothing between requests: the same server, two users, no leak", async () => {
  const bodies = [];
  const fetchImpl = async (_u, init) => (bodies.push(init.body), reply({ reply: "تمام" }));
  const ask = (messages) => {
    const req = parseAnswerRequest({ messages, country: "ps-wb" });
    return answerQuestion(req.question, req.country, ENV, fetchImpl, req);
  };
  await ask([{ role: "user", text: "سرّ المستخدمة الأولى: طليقي ما بيدفع" }]);
  await ask([{ role: "user", text: "مرحبا، أنا مستخدمة تانية" }]);
  assert.ok(!bodies[1].includes("المستخدمة الأولى"));
});

test("1: new chat / quick exit / another region forgets the conversation", async () => {
  const { a, say, seen } = stack(() => reply({ reply: "تمام" }));
  await say("جوزي هددني");
  a.reset();
  await say("مرحبا");
  assert.equal(seen.at(-1).contents.length, 1);
  await say("سؤال تاني", "ps-gaza");
  assert.equal(seen.at(-1).contents.length, 1, "regions are never mixed");
});

test("2: law comes from the app's texts for HER region, given to the model with each reply", async () => {
  const { seen, say } = stack(() => reply({ reply: "تمام" }));
  await say("قديش مدة العدة؟");
  assert.match(systemText(seen.at(-1)), /<article id="psl:135"/);
  await say("شو حقي بالنفقة؟", "ps-gaza");
  const gaza = systemText(seen.at(-1));
  assert.match(gaza, /<article id="gz:/);
  assert.ok(!/<article id="psl:/.test(gaza), "no West Bank text for a Gaza user");
});

test("2: a short follow-up gets the texts of the topic already going on", () => {
  const turns = [
    { role: "user", text: "طليقي صرله 4 شهور ما بيدفع نفقة للولاد" },
    { role: "assistant", text: "فهمت عليكِ." },
    { role: "user", text: "طيب شو حقي؟" },
  ];
  assert.ok(articlesForChat(turns, "ps-wb").some((a) => a.id.startsWith("psl:")));
});

test("2: a reply citing a text it was not given, or a penalty not in the text: rewritten once, else not shown", async () => {
  const replies = [
    reply({ reply: "حسب المادة 15 العقوبة حبس 10 سنين.", cites: ["15"] }),
    reply({ reply: "النص اللي عندي بيقول إنه مدة العدة محددة بالمادة.", cites: ["psl:135"] }),
  ];
  const { say } = stack(() => replies.shift());
  const r = await say("قديش مدة العدة؟");
  assert.equal(r.source, "ai");
  assert.deepEqual(r.cites, ["psl:135"]);
});

test("2: law stated without any text: refused, she gets the honest «could not answer» message", async () => {
  const { say } = stack(() => reply({ reply: "حسب القانون بتربحي القضية أكيد." }));
  const r = await say("بدي أعرف حقي بالطلاق");
  assert.equal(r.source, "none");
  assert.match(r.lead, /ما قدرت أوصل/);
});

test("«خلاصة حديثنا»: each right is kept with the article it comes from, and joins the cited texts", async () => {
  const { say } = stack(() =>
    reply({
      reply: "فهمت سؤالك عن الحضانة. حسب النص اللي عندي، الأم إلها الأولوية.",
      rights: [{ text: "الأم أحق بحضانة ولدها وتربيته", cite: "psl:154" }],
      steps: ["ما توقّعي على أي تنازل قبل ما تحكي مع محامية"],
    }),
  );
  const r = await say("شو حقي بالحضانة؟");
  assert.equal(r.source, "ai");
  assert.deepEqual(r.rights, [{ text: "الأم أحق بحضانة ولدها وتربيته", cite: "psl:154" }]);
  assert.ok(r.cites.includes("psl:154"));
  assert.equal(r.steps.length, 1);
});

test("«خلاصة حديثنا»: a right from a text it was not given, or a number not in ITS article, is refused", async () => {
  const bad = [
    reply({ reply: "تمام.", rights: [{ text: "الحضانة إلك", cite: "psl:999" }] }),
    reply({ reply: "تمام.", rights: [{ text: "الحضانة لحد عمر 15 سنة", cite: "psl:154" }] }),
  ];
  for (const r of bad) {
    const { say } = stack(() => r.clone());
    assert.equal((await say("شو حقي بالحضانة؟")).source, "none");
  }
});

test("venting: no summary box, a human reply only", async () => {
  const { say } = stack(() => reply({ reply: "صعب لما تحسي إنه ما في حدا بيسمعك. أنا عم بسمعك هلأ.", rights: [], steps: [] }));
  const r = await say("بدي حدا يسمعني بس");
  assert.deepEqual(r.rights, []);
  assert.deepEqual(r.cites, []);
});

test("present danger and self-harm: the fixed safety reply at once, the model is not called", async () => {
  let calls = 0;
  const { say } = stack(() => (calls++, reply({ reply: "x" })));
  for (const q of ["جوزي هلأ عم يكسر الباب", "بدي أموت"]) {
    const r = await say(q);
    assert.equal(r.sos, true);
    assert.equal(r.source, "rules");
  }
  assert.equal(calls, 0);
});

test("violence mentioned (not now): the AI answers, and the safety-plan button is always there", async () => {
  const { say } = stack(() => reply({ reply: "فهمت إنه جوزك هددك، وهاد بيخوّف.", sos: false }));
  const r = await say("جوزي هددني مبارح");
  assert.equal(r.source, "ai");
  assert.equal(r.sos, true);
});

test("the AI is down: one honest sentence, never a fake answer; she can send it again", async () => {
  const errors = [];
  const { a, say } = stack(() => new Response("{}", { status: 503 }), { onRemoteError: (e) => errors.push(e.message) });
  const r = await say("شو حقي بالحضانة؟");
  assert.equal(r.source, "none");
  assert.match(r.lead, /ما قدرت أوصل/);
  assert.equal(a.turns.length, 0, "the failed message is not half-kept");
  assert.match(errors[0], /proxy-status-502/);
});

test("she did not agree to send: the assistant says it is off, nothing is sent", async () => {
  let calls = 0;
  const a = createAssistant({ remote: { chat: async () => (calls++, null) }, isRemoteEnabled: () => false });
  const r = await a.answer("مرحبا", { country: "ps-wb" });
  assert.match(r.lead, /مطفية/);
  assert.equal(calls, 0);
});

test("the model's pet names are removed and its forbidden promises never reach her", async () => {
  const replies = [reply({ reply: "يا حبيبتي، إنتِ بمكان آمن هلا." }), reply({ reply: "يا قلبي، احكيلي شو صار." })];
  const { say } = stack(() => replies.shift());
  const r = await say("مش عارفة مع مين أحكي");
  assert.equal(r.lead, "احكيلي شو صار.");
});
