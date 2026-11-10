import assert from "node:assert/strict";
import { test } from "node:test";
import { appearsIn } from "../scripts/verify-law.mjs";

const page =
  "<html><script>x()</script><div class='t'>يُعاقَب   كل من\n نشر <b>صورة</b> بدون إذن</div></html>";

test("matches text regardless of tags, spacing and diacritics", () =>
  assert.ok(appearsIn("يعاقب كل من نشر صورة بدون إذن", page)));
test("detects a changed word", () => assert.ok(!appearsIn("يعاقب كل من نشر فيديو بدون إذن", page)));
