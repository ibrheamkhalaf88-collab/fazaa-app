import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAnswer } from "../src/ai/validate.js";

const ALLOWED = { articleIds: ["15", "22"] };
const good = () => ({
  lead: "إنتِ مش غلطانة.",
  steps: ["لا تدفعي", "صوّري الرسائل"],
  note: "حسب المادة 15",
  cites: ["15"],
  sos: true,
});

test("accepts a well-formed answer and marks it as AI-written", () => {
  const a = validateAnswer(good(), ALLOWED);
  assert.equal(a.source, "ai");
  assert.deepEqual(a.cites, ["15"]);
  assert.equal(a.sos, true);
});

test("rejects a citation to an article that was not provided", () => {
  assert.throws(() => validateAnswer({ ...good(), cites: ["15", "99"] }, ALLOWED), /unknown-article:99/);
});

test("rejects a citation to a real article that was not retrieved for this question", () => {
  assert.throws(() => validateAnswer({ ...good(), cites: ["52"] }, ALLOWED), /unknown-article:52/);
});

test("rejects missing lead, missing steps, non-objects", () => {
  assert.throws(() => validateAnswer({ ...good(), lead: "" }, ALLOWED), /missing-lead/);
  assert.throws(() => validateAnswer({ ...good(), steps: [] }, ALLOWED), /missing-steps/);
  assert.throws(() => validateAnswer("hello", ALLOWED), /not-an-object/);
  assert.throws(() => validateAnswer(null, ALLOWED), /not-an-object/);
});

test("strips markup and control characters", () => {
  const a = validateAnswer({ ...good(), lead: "مرحبا <img src=x onerror=alert(1)> بك\u0000" }, ALLOWED);
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[<>\u0000]/.test(a.lead));
});

test("truncates runaway fields and caps the step count", () => {
  const a = validateAnswer({ ...good(), lead: "ا".repeat(5000), steps: Array(20).fill("خطوة") }, ALLOWED);
  assert.ok(a.lead.length <= 500);
  assert.equal(a.steps.length, 5);
});

test("sos is true only when exactly true (no truthy strings)", () => {
  assert.equal(validateAnswer({ ...good(), sos: "yes" }, ALLOWED).sos, false);
});
