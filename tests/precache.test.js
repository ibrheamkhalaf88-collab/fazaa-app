import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url).pathname;
const sw = readFileSync(join(root, "sw.js"), "utf8");
const precache = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p)];
  });
}

test("every file in PRECACHE exists", () => {
  for (const f of precache) {
    if (f === "./") continue;
    assert.ok(statSync(join(root, f), { throwIfNoEntry: false }), `PRECACHE lists missing file: ${f}`);
  }
});

test("every app file is in PRECACHE (a forgotten file would break offline use)", () => {
  const shipped = ["src", "styles", "assets"]
    .flatMap((d) => walk(join(root, d)))
    .concat(["index.html", "manifest.webmanifest"]);
  const missing = shipped.filter((f) => !precache.includes(f));
  assert.deepEqual(missing, [], `add to PRECACHE in sw.js: ${missing.join(", ")}`);
});

test("manifest icons exist and the app is installable", () => {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.dir, "rtl");
  for (const icon of manifest.icons)
    assert.ok(statSync(join(root, icon.src), { throwIfNoEntry: false }), icon.src);
  assert.ok(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
});

test("index.html references only files that exist", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  for (const [, ref] of html.matchAll(
    /(?:href|src)="((?:styles|src|assets)\/[^"]+|manifest\.webmanifest)"/g,
  )) {
    assert.ok(statSync(join(root, ref), { throwIfNoEntry: false }), `index.html references missing ${ref}`);
  }
});
