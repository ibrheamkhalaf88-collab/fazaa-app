import { test } from "node:test";
import assert from "node:assert/strict";
import { PROCEDURES, proceduresFor } from "../src/data/procedures.js";
import { CHAT_PROMPT } from "../server/ai-proxy/worker.js";

const entry = (over = {}) => ({
  id: "x",
  regions: ["ps-wb"],
  topic: "نفقة",
  keywords: ["نفقة", "بيصرف"],
  text: "خطوة",
  reviewed: true,
  ...over,
});
const turns = [{ role: "user", text: "جوزي ما بيصرف علينا" }];

test("only reviewed procedures for her region reach the model", () => {
  assert.deepEqual(
    proceduresFor(turns, "ps-wb", [entry()]).map((p) => p.id),
    ["x"],
  );
  assert.equal(proceduresFor(turns, "ps-wb", [entry({ reviewed: false })]).length, 0);
  assert.equal(proceduresFor(turns, "ps-gaza", [entry()]).length, 0);
});

test("matching uses her messages only, not the app's replies", () => {
  const t = [
    { role: "assistant", text: "النفقة حقك" },
    { role: "user", text: "مرحبا" },
  ];
  assert.equal(proceduresFor(t, "ps-wb", [entry()]).length, 0);
});

test("shipped list has no unreviewed entry marked reviewed", () => {
  for (const p of PROCEDURES) if (p.reviewed) assert.ok(p.reviewedBy && p.reviewedAt, p.id);
});

test("chat prompt asks for conversation first and forbids invented practical details", () => {
  assert.match(CHAT_PROMPT, /CONVERSATION FIRST/);
  assert.match(CHAT_PROMPT, /ONLY if they are written in <procedures>/);
  assert.doesNotMatch(CHAT_PROMPT, /With "rights", always give steps/);
});
