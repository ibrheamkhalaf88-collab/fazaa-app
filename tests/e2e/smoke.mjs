/**
 * End-to-end smoke test in a real browser (Playwright). Run: npm run test:e2e
 * Starts its own static server, so nothing else needs to be running.
 * Covers the flows that matter most: navigation, asking, privacy wipe, disguise, offline.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("../../", import.meta.url).pathname;
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/** Apply the real `/*` block of _headers (CSP included) so the test fails if the policy blocks anything. */
const SECURITY_HEADERS = Object.fromEntries(
  (await readFile(join(ROOT, "_headers"), "utf8"))
    .split(/\n(?=\S)/)
    .find((block) => block.startsWith("/*\n"))
    .split("\n")
    .slice(1)
    .map((line) =>
      line
        .trim()
        .split(/:\s(.+)/)
        .slice(0, 2),
    )
    .filter(([k, v]) => k && v),
);

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  try {
    const rel = path.endsWith("/") ? `${path}index.html` : path;
    const file = await readFile(join(ROOT, rel));
    res
      .writeHead(200, {
        ...SECURITY_HEADERS,
        "content-type": TYPES[extname(rel)] || "application/octet-stream",
      })
      .end(file);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
let failed = 0;
const results = [];
const problems = []; // console/page errors of the running test
async function test(name, fn, { serviceWorkers = "block" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers });
  const page = await context.newPage();
  problems.length = 0;
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  try {
    await page.goto(URL_);
    await page.waitForSelector(".screen:not([hidden])"); // app booted
    await fn(page, context);
    assert.deepEqual(problems, [], "console/page errors");
    results.push(`ok   ${name}`);
  } catch (err) {
    failed++;
    results.push(`FAIL ${name}\n     ${err.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
}
const open = async (page, screen) => {
  await page.evaluate((s) => localStorage.setItem("sanad:last", JSON.stringify(s)), screen);
  await page.reload();
  await page.waitForSelector(`.screen[data-screen="${screen}"]:not([hidden])`);
};
const current = (page) => page.evaluate(() => document.querySelector("#app").dataset.cur);

await test("security headers are served and the CSP forbids inline scripts", async (page) => {
  const res = await page.request.get(URL_);
  const csp = res.headers()["content-security-policy"];
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers()["referrer-policy"], "no-referrer");
  const ran = await page.evaluate(() => {
    document.addEventListener("securitypolicyviolation", () => {}, { once: true });
    const s = document.createElement("script");
    s.textContent = "window.__inline = 1";
    document.head.appendChild(s);
    return window.__inline === 1;
  });
  assert.equal(ran, false, "inline script must be blocked by CSP");
  problems.length = 0; // the violation report is the expected console error
});

await test("first run: welcome -> country -> home", async (page) => {
  assert.equal(await current(page), "welcome");
  await page.click('[data-screen="welcome"] .btn.primary');
  assert.equal(await current(page), "country");
  await page.click('[data-screen="country"] .btn.primary');
  assert.equal(await current(page), "home");
});

await test("chat has a way back to home (not only the whole app)", async (page) => {
  await open(page, "home");
  await page.click(".ask-pill");
  assert.equal(await current(page), "chat");
  await page.click('[data-screen="chat"] .top .iconbtn >> nth=0');
  assert.equal(await current(page), "home");
});

await test("asking about blackmail returns a cited answer with the safety-plan button", async (page) => {
  await open(page, "chat");
  await page.fill("#q", "حدا بيهددني بصوري");
  await page.press("#q", "Enter");
  const answer = page.locator("#msgs .a:has(ol)");
  await answer.waitFor({ timeout: 5000 });
  assert.match(await answer.textContent(), /المادة 15/);
  assert.ok(await answer.locator('[data-go="sos"]').isVisible());
  await answer.locator("details summary").first().click();
  assert.match(await answer.locator(".law").first().textContent(), /ابتزاز|تهديد/);
  assert.equal(await answer.locator(".law a").first().getAttribute("rel"), "noopener noreferrer");
});

await test("a question outside the corpus is refused honestly, not guessed", async (page) => {
  await open(page, "chat");
  await page.fill("#q", "كيف بطبخ مقلوبة؟");
  await page.press("#q", "Enter");
  const refusal = page.locator("#msgs .a", { hasText: "بدون مصدر" });
  await refusal.waitFor({ timeout: 5000 }); // (the first .a is the welcome bubble, the second may be "typing")
  assert.equal(await page.locator("#msgs .a ol").count(), 0, "no invented steps or citations");
});

await test("user text is never interpreted as HTML", async (page) => {
  await open(page, "chat");
  await page.fill("#q", '<img src=x onerror="window.__xss=1">');
  await page.press("#q", "Enter");
  await page.waitForSelector("#msgs .u");
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator("#msgs .u img").count(), 0);
});

await test("quick exit wipes the chat and safety ticks, shows the disguise, and leaks no title", async (page) => {
  await open(page, "chat");
  await page.fill("#q", "حدا بيهددني بصوري");
  await page.press("#q", "Enter");
  await page.waitForSelector("#msgs .a ol", { timeout: 5000 });
  await page.keyboard.press("Escape");
  assert.equal(await current(page), "disguise");
  assert.equal(await page.title(), "الطقس");
  assert.equal(await page.evaluate(() => localStorage.getItem("sanad:last")), '"home"');
  await page.dblclick(".weather .temp"); // secret way back
  assert.equal(await current(page), "home");
  await page.click(".ask-pill");
  assert.equal(await page.locator("#msgs .u").count(), 0, "chat was wiped");
  assert.equal(await page.title(), "فَزعة");
});

await test("a reply still 'typing' when the user exits never appears afterwards", async (page) => {
  await open(page, "chat");
  await page.fill("#q", "حدا بيهددني بصوري");
  await page.press("#q", "Enter");
  await page.keyboard.press("Escape"); // before the typing delay ends
  await page.waitForTimeout(2200);
  await page.dblclick(".weather .temp");
  await page.click(".ask-pill");
  assert.equal(await page.locator("#msgs .a ol").count(), 0);
});

await test("calculator disguise works and the code unlocks the app", async (page) => {
  await open(page, "settings");
  await page.click('[data-dg="calc"]');
  await page.click(".qx");
  for (const k of ["7", "+", "5", "="]) await page.click(`[data-k="${k}"]`);
  assert.equal(await page.textContent("#calc-out"), "12");
  assert.equal(await current(page), "disguise");
  for (const k of ["1", "3", "7", "9", "="]) await page.click(`[data-k="${k}"]`);
  assert.equal(await current(page), "home");
});

await test("lawyer demo mode connects and replies", async (page) => {
  await open(page, "home");
  await page.click('.lawmini [data-chat="lawyer"]');
  await page.waitForSelector("#msgs .lw", { timeout: 4000 });
  await page.fill("#q", "عندي مشكلة");
  await page.press("#q", "Enter");
  await page.waitForFunction(() => document.querySelectorAll("#msgs .lw").length >= 2, null, {
    timeout: 4000,
  });
});

await test("settings: theme switch, erase everything", async (page) => {
  await open(page, "settings");
  await page.click('[data-theme-set="dark"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.click('[data-action="reset"]');
  assert.equal(await current(page), "welcome");
  assert.equal(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sanad:")).length),
    1 /* only "last" */,
  );
});

await test("online AI is off and unavailable without an endpoint (shows 'soon')", async (page) => {
  await open(page, "settings");
  assert.ok(await page.isVisible("#ai-soon"));
  assert.ok(!(await page.isVisible("#ai-toggle")));
});

await test(
  "works offline after the first visit (service worker)",
  async (page, context) => {
    await page.waitForFunction(
      () => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true),
    );
    await page.reload(); // now controlled by the worker
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector(".screen:not([hidden])");
    assert.ok(await page.isVisible(".screen:not([hidden])"));
    await page.fill("#q", "x").catch(() => {});
  },
  { serviceWorkers: "allow" },
);

console.log(results.join("\n"));
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
