import assert from "node:assert/strict";
import { test } from "node:test";
import { createCalculator } from "../src/features/disguise/calculator.js";

const press = (calc, keys) => keys.split(" ").forEach((k) => calc.press(k));

test("arithmetic", () => {
  const c = createCalculator("1379");
  press(c, "7 + 5 =");
  assert.equal(c.display, "12");
  press(c, "× 3 =");
  assert.equal(c.display, "36");
  press(c, "÷ 4 =");
  assert.equal(c.display, "9");
});

test("decimals are rounded to avoid 0.30000000000000004", () => {
  const c = createCalculator("1379");
  press(c, "0 . 1 + 0 . 2 =");
  assert.equal(c.display, "0.3");
});

test("division by zero shows an error and recovers on the next digit", () => {
  const c = createCalculator("1379");
  press(c, "5 ÷ 0 =");
  assert.equal(c.display, "خطأ");
  press(c, "4");
  assert.equal(c.display, "4");
});

test("percent, sign and clear", () => {
  const c = createCalculator("1379");
  press(c, "5 0 %");
  assert.equal(c.display, "0.5");
  press(c, "C 8 ±");
  assert.equal(c.display, "-8");
  press(c, "C");
  assert.equal(c.display, "0");
});

test("access code + = unlocks, and resets the display", () => {
  const c = createCalculator("1379");
  press(c, "1 3 7");
  assert.deepEqual(c.press("9"), { unlocked: false });
  assert.deepEqual(c.press("="), { unlocked: true });
  assert.equal(c.display, "0");
});

test("the code works after other digits, but not with an operator in between", () => {
  const c = createCalculator("1379");
  press(c, "5 5 1 3 7 9");
  assert.equal(c.press("=").unlocked, true);

  const d = createCalculator("1379");
  press(d, "1 3 + 7 9");
  assert.equal(d.press("=").unlocked, false);
});

test("a wrong code just calculates", () => {
  const c = createCalculator("1379");
  press(c, "1 3 7 8");
  assert.equal(c.press("=").unlocked, false);
  assert.equal(c.display, "1378");
});
