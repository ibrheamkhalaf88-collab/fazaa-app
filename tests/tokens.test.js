import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

/** Declarations inside the block that starts at `opener`. */
function block(opener) {
  const start = css.indexOf(opener);
  assert.ok(start >= 0, `missing block: ${opener}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}
const decls = (text) =>
  [...text.matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);/g)].map((m) => `${m[1]}:${m[2].trim()}`).sort();

test("the two dark-mode blocks (system + manual) define identical tokens", () => {
  const system = decls(block("@media (prefers-color-scheme: dark)"));
  const manual = decls(block(':root[data-theme="dark"]'));
  assert.deepEqual(system, manual);
});

test("every token a component uses is defined", () => {
  const defined = new Set([...css.matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
  const files = [
    "base",
    "layout",
    "components",
    "screens/welcome",
    "screens/country",
    "screens/home",
    "screens/chat",
    "screens/sos",
    "screens/support",
    "screens/lawyer",
    "screens/settings",
    "screens/disguise",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(`../styles/${f}.css`, import.meta.url), "utf8");
    for (const [, name] of src.matchAll(/var\((--[\w-]+)/g))
      assert.ok(defined.has(name), `${f}.css uses undefined ${name}`);
  }
});

test("no red anywhere in the palette (design decision: alarming colours are the wrong signal)", () => {
  for (const [, hex] of css.matchAll(/#([0-9a-f]{6})\b/gi)) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(!(r > 150 && g < 90 && b < 90), `#${hex} looks red`);
  }
});
