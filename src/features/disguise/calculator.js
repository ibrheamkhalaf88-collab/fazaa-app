/**
 * The calculator shown after "quick exit" when the user picked the calculator disguise.
 * It is a real, working calculator (a fake one would give the game away), with one
 * secret: typing the access code and then "=" unlocks the app again.
 *
 * Pure state machine (no DOM) so it can be unit-tested.
 */

const ERROR = "خطأ";
const round = (n) => String(Math.round(n * 1e10) / 1e10);

function compute(a, b, op) {
  const x = parseFloat(a);
  const y = parseFloat(b);
  const result =
    op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : op === "÷" ? (y === 0 ? NaN : x / y) : y;
  return Number.isFinite(result) ? round(result) : ERROR;
}

/** @param {string} accessCode digits that, followed by "=", unlock the app */
export function createCalculator(accessCode) {
  let s;
  const reset = () => (s = { cur: "0", prev: null, op: null, fresh: true, typed: "" });
  reset();

  return {
    get display() {
      return s.cur;
    },
    reset,
    /**
     * @param {string} key  "0"-"9", ".", "C", "±", "%", "=", "+", "−", "×", "÷"
     * @returns {{unlocked: boolean}}
     */
    press(key) {
      if (/^[0-9]$/.test(key)) {
        s.typed = (s.typed + key).slice(-12);
        s.cur = s.fresh || s.cur === "0" || s.cur === ERROR ? key : s.cur + key;
        s.fresh = false;
      } else if (key === ".") {
        s.typed = "";
        if (s.fresh || s.cur === ERROR) {
          s.cur = "0.";
          s.fresh = false;
        } else if (!s.cur.includes(".")) {
          s.cur += ".";
        }
      } else if (key === "C") {
        reset();
      } else if (key === "±") {
        s.typed = "";
        if (s.cur !== "0" && s.cur !== ERROR) s.cur = s.cur.startsWith("-") ? s.cur.slice(1) : `-${s.cur}`;
      } else if (key === "%") {
        s.typed = "";
        if (s.cur !== ERROR) s.cur = round(parseFloat(s.cur) / 100);
      } else if (key === "=") {
        if (s.typed.slice(-accessCode.length) === accessCode) {
          reset();
          return { unlocked: true };
        }
        if (s.op && s.prev !== null) s.cur = compute(s.prev, s.cur, s.op);
        s.prev = null;
        s.op = null;
        s.fresh = true;
        s.typed = "";
      } else {
        // + − × ÷
        if (s.op && s.prev !== null && !s.fresh) s.cur = compute(s.prev, s.cur, s.op);
        s.prev = s.cur;
        s.op = key;
        s.fresh = true;
        s.typed = "";
      }
      return { unlocked: false };
    },
  };
}
