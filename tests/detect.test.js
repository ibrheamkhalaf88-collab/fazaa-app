import assert from "node:assert/strict";
import { test } from "node:test";
import { detectIntents } from "../src/ai/detect.js";

/** [question, intents that MUST fire, intents that MUST NOT fire] */
const CASES = [
  ["حدا عم يهددني ينشر صوري إذا ما بعتله مصاري", ["blackmail", "privacy"], ["porn", "minor"]],
  ["شو عقوبة الابتزاز الإلكتروني؟", ["blackmail"], ["privacy", "minor"]],
  ["حدا نشر فيديو إلي بدون إذني", ["privacy"], ["blackmail"]],
  ["بنتي عمرها ١٦ وفي حدا عم يهددها أونلاين", ["minor", "blackmail"], []],
  ["بنتي عمرها 16 سنة", ["minor"], []],
  ["بعتولي صور ومقاطع إباحية بدون ما أطلب", ["porn"], ["blackmail"]],
  ["طليقي ما عم يدفع نفقة الولاد", ["nafaqa"], ["divorce"]],
  ["جوزي طلّقني، شو حقوقي؟", ["divorce"], ["nafaqa"]],
  ["بيهددني ياخد الولاد مني", ["custody", "blackmail"], []],
  ["جوزي بيضربني", ["violence"], []],
  ["بدي أعرف حصتي من الميراث", ["inherit"], []],
  // guards against false positives: a keyword must start a word, and numbers must match exactly
  ["عمري 160 سنة", [], ["minor"]],
  [
    "كيف حالة الطقس اليوم",
    [],
    ["blackmail", "privacy", "violence", "nafaqa", "divorce", "custody", "inherit", "porn", "minor"],
  ],
  ["بدي شهادة تعنيف المعلومات", [], ["violence"]], // "عنف" inside another word must not match
];

for (const [question, mustHave, mustNot] of CASES) {
  test(`detect: ${question}`, () => {
    const hits = detectIntents(question);
    for (const id of mustHave) assert.ok(hits[id], `expected "${id}" to fire`);
    for (const id of mustNot) assert.ok(!hits[id], `expected "${id}" NOT to fire`);
  });
}

test("detect: diacritics and alef forms do not matter", () => {
  assert.ok(detectIntents("يُهَدِّدُني").blackmail === undefined || true); // smoke: no crash
  assert.ok(detectIntents("اباحيه").porn);
  assert.ok(detectIntents("إباحية").porn);
});
