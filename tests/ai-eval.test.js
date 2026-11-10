import assert from "node:assert/strict";
import { test } from "node:test";
import { runEval } from "../scripts/ai-eval.mjs";

test("the AI scope set behaves as written: off-topic questions retrieve nothing, legal ones do", () => {
  const bad = runEval().filter((r) => !r.ok);
  assert.deepEqual(
    bad.map((r) => r.q),
    [],
  );
});
