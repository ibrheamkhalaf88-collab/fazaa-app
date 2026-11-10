import assert from "node:assert/strict";
import { test } from "node:test";
import { ARTICLES } from "../src/data/law/index.js";
import { RULES } from "../src/data/answers.js";
import { answerFromRules } from "../src/ai/rules-engine.js";

test("every cited article exists in the law corpus", () => {
  for (const rule of RULES) {
    // evaluate each rule with a permissive hit table so every branch is exercised
    const answer = rule.answer({ blackmail: 1, privacy: 1, porn: 1, minor: 1 });
    for (const id of answer.cites) assert.ok(ARTICLES[id], `${rule.id} cites unknown article ${id}`);
  }
});

test("every rule returns a complete answer", () => {
  for (const rule of RULES) {
    const a = rule.answer({ blackmail: 1 });
    assert.ok(a.lead.length > 0, rule.id);
    assert.ok(a.steps.length >= 2 && a.steps.length <= 4, `${rule.id}: 2-4 steps`);
    assert.ok(a.note.length > 0, rule.id);
    assert.ok(Array.isArray(a.cites), rule.id);
  }
});

test("family-law answers are marked general and offer a lawyer", () => {
  for (const q of ["طليقي ما عم يدفع نفقة", "جوزي طلقني", "بيهددني ياخد الولاد", "بدي حصتي من الميراث"]) {
    const a = answerFromRules(q);
    assert.equal(a.general, true, q);
    assert.deepEqual(a.cites, [], `${q}: no statute is cited for family law`);
    assert.ok(a.topic, q);
  }
});

test("blackmail: cites article 15 and offers the safety plan", () => {
  const a = answerFromRules("حدا عم يبتزني بصوري");
  assert.ok(a.cites.includes("15"));
  assert.equal(a.sos, true);
  assert.equal(a.source, "rules");
});

test("a minor being blackmailed cites article 52 (doubled penalty) first", () => {
  const a = answerFromRules("بنتي عمرها ١٥ وحدا عم يبتزها");
  assert.equal(a.cites[0], "52");
  assert.ok(a.cites.includes("15"));
});

test("violence takes priority over family-law topics", () => {
  const a = answerFromRules("جوزي بيضربني وبدو يطلقني");
  assert.equal(a.topic, "عنف أسري");
  assert.equal(a.sos, true);
});

test("unrelated question: null (the app says it has no source, never guesses)", () => {
  assert.equal(answerFromRules("كيف بطبخ مقلوبة؟"), null);
});
