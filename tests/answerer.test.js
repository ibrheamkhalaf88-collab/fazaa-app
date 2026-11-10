import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnswerer } from "../src/ai/answerer.js";

const CTX = { country: "ps-wb" };
const AI = { lead: "ai", steps: ["x"], note: "", cites: ["15"], source: "ai" };

test("remote disabled: uses the offline rules", async () => {
  let called = false;
  const a = createAnswerer({
    remote: { answer: async () => ((called = true), AI) },
    isRemoteEnabled: () => false,
  });
  const r = await a.answer("حدا عم يبتزني", CTX);
  assert.equal(r.source, "rules");
  assert.equal(called, false, "must not contact the server unless the user opted in");
});

test("remote enabled: uses the online answer", async () => {
  const a = createAnswerer({ remote: { answer: async () => AI }, isRemoteEnabled: () => true });
  assert.equal((await a.answer("سؤال", CTX)).source, "ai");
});

test("remote error: falls back to rules and reports the error", async () => {
  const errors = [];
  const a = createAnswerer({
    remote: {
      answer: async () => {
        throw new Error("boom");
      },
    },
    isRemoteEnabled: () => true,
    onRemoteError: (e) => errors.push(e.message),
  });
  const r = await a.answer("حدا عم يبتزني", CTX);
  assert.equal(r.source, "rules");
  assert.deepEqual(errors, ["boom"]);
});

test("remote says 'not covered' (null): falls back to rules", async () => {
  const a = createAnswerer({ remote: { answer: async () => null }, isRemoteEnabled: () => true });
  assert.equal((await a.answer("حدا عم يبتزني", CTX)).source, "rules");
});

test("nothing covers it anywhere: null", async () => {
  const a = createAnswerer({ remote: { answer: async () => null }, isRemoteEnabled: () => true });
  assert.equal(await a.answer("كيف بطبخ مقلوبة", CTX), null);
});

test("safety merge: danger detected offline forces the safety-plan button on the AI answer", async () => {
  const a = createAnswerer({
    remote: { answer: async () => ({ ...AI, sos: false }) },
    isRemoteEnabled: () => true,
  });
  const r = await a.answer("حدا عم يبتزني بصوري", CTX);
  assert.equal(r.source, "ai");
  assert.equal(r.sos, true);
});
