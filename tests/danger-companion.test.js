import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnswerer } from "../src/ai/answerer.js";
import { isVenting } from "../src/ai/companion.js";
import { assessDanger, detectDanger, FORCED_QUESTION } from "../src/ai/danger.js";
import { detectIntents } from "../src/ai/detect.js";

const ask = (q, remote) =>
  createAnswerer(remote ? { remote, isRemoteEnabled: () => true } : {}).answer(q, { country: "ps-wb" });

test("danger: imminent violence gets the fixed safety reply with the SOS button", () => {
  for (const q of ["ضربني امبارح وأنا خايفة يرجع الليلة", "بدّه يقتلني", "حابسني بالبيت وما بخليني أطلع"]) {
    const d = detectDanger(q, { police: "100" });
    assert.equal(d?.kind, "imminent", q);
    assert.equal(d.answer.sos, true);
    // (2026-11-12) the reply is now a short "talk" reply: options instead of a numbered list
    assert.match(d.answer.options[0], /100/);
  }
});

test("danger: self-harm and forced marriage of a minor", () => {
  assert.equal(detectDanger("تعبت وبدي أموت")?.kind, "self-harm");
  assert.equal(detectDanger("صرت بفكر أنتحر")?.kind, "self-harm");
  assert.equal(detectDanger("عمري 16 وأهلي بدهم يجوزوني غصب عني")?.kind, "forced-marriage");
  // (2026-11-12) age + a suitor is no longer an automatic emergency script: one direct question instead
  assert.equal(detectDanger("عمري ١٥ وجايبين عريس"), null);
  assert.equal(assessDanger("عمري ١٥ وجايبين عريس").ask, FORCED_QUESTION);
});

test("danger does not fire on ordinary questions", () => {
  for (const q of [
    "شو عقوبة الابتزاز الإلكتروني؟",
    "جوزي ما بيدفع مصروف البيت من 4 شهور",
    "عمري 30 وبدي أتجوز",
    "غصب عني نسيت الموعد",
    "عندي 160 شيكل دين",
  ])
    assert.equal(detectDanger(q), null, q);
});

test("the danger reply wins over the online AI, and the AI is not even called", async () => {
  let called = false;
  const remote = {
    answer: async () => {
      called = true;
      return { lead: "x", steps: ["y"], note: "", cites: [], source: "ai" };
    },
  };
  const a = await ask("ضربني وخايفة يرجع", remote);
  assert.equal(a.sos, true);
  assert.equal(a.source, "rules");
  assert.equal(called, false);
});

test("venting with no law match gets the listening reply, not a refusal", async () => {
  assert.ok(isVenting("بحس حالي لحالي وما حدا فاهمني، بدي بس حدا يسمعني"));
  const a = await ask("بحس حالي لحالي وما حدا فاهمني، بدي بس حدا يسمعني");
  assert.ok(a, "an answer, not null");
  assert.equal(a.general, true);
  assert.ok(!a.cites?.length, "no law in a listening reply");
  // (2026-11-12) she asked to be heard: a short listening reply, no list of steps
  assert.match(a.lead, /سامع/);
  assert.deepEqual(a.options, []);
});

test("a question nobody covers and that is not venting still gets the honest refusal (null)", async () => {
  assert.equal(await ask("شو أحسن مطعم بنابلس؟"), null);
});

test("colloquial divorce and custody phrasing is recognised", () => {
  assert.ok(detectIntents("بدي أطلق بس خايفة ياخدوا الولاد مني").custody);
  assert.ok(detectIntents("طلقني ورماني بالشارع").divorce);
  assert.ok(detectIntents("طردني من البيت").divorce);
});

test("the eight test messages from the owner's review all get a reply", async () => {
  const msgs = [
    "تعبت كتير، جوزي بيصرّخ عليّ قدام الولاد كل يوم وبيهينني، وما بعرف لمين أحكي",
    "في شب بعتلي إنه معه صوري وبدّه مصاري وإلا بنشرهم، أنا خايفة كتير وما بقدر أحكي لأهلي",
    "طلّقني وطردني من البيت وأخد الولاد، شو بعمل؟ ما معي ولا شيكل",
    "جوزي ما بيدفع مصروف البيت من 4 شهور وأنا عايشة عند أهلي مع البنات",
    "بحس حالي لحالي وما حدا فاهمني، بدي بس حدا يسمعني",
    "عمري 16 وأهلي بدهم يجوزوني غصب عني",
    "ضربني امبارح وأنا خايفة يرجع الليلة",
    "بدي أطلق بس خايفة آخد الولاد مني",
  ];
  for (const q of msgs) assert.ok(await ask(q), q);
  assert.equal((await ask(msgs[5])).sos, true);
  assert.equal((await ask(msgs[6])).sos, true);
});
