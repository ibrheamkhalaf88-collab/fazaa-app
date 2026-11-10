/**
 * End-to-end: the real lawyer flow in a browser. Static server + the staff API (in-memory store)
 * on one origin, with API_BASE switched on. A woman signs up in the app and writes; a lawyer
 * (through the API) claims, reads her contact card and replies; the reply shows up in her chat.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";
import { toBase64 } from "../../server/api/crypto.js";
import { createMemoryStore } from "../../server/api/store/memory.js";
import { handleRequest } from "../../server/api/worker.js";

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
const env = {
  MESSAGE_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
  ALLOWED_ORIGINS: "",
  DEVELOPER_EMAILS: "dev@x.test",
};
const store = createMemoryStore();
await store.upsertStaff({ email: "salma@x.test", role: "lawyer", name: "سلمى الأحمد", now: 1 });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await handleRequest(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      }),
      env,
      { store, staffEmail: async (q) => q.headers.get("x-staff") },
    );
    return res.writeHead(r.status, Object.fromEntries(r.headers)).end(Buffer.from(await r.arrayBuffer()));
  }
  try {
    const clean = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const rel = clean.endsWith("/") ? `${clean}index.html` : clean;
    let body = await readFile(join(ROOT, rel));
    if (rel.endsWith("src/config.js"))
      body = Buffer.from(String(body).replace('API_BASE = ""', 'API_BASE = "/api"'));
    res.writeHead(200, { "content-type": TYPES[extname(rel)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("nf");
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
env.ALLOWED_ORIGINS = base;
const staff = (path, init = {}) =>
  fetch(`${base}/api${path}`, {
    ...init,
    headers: { "x-staff": "salma@x.test", "content-type": "application/json" },
  }).then((r) => r.json());

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
let failed = false;
try {
  await page.goto(base + "/");
  await page.evaluate(() => localStorage.setItem("sanad:last", JSON.stringify("chat")));
  await page.reload();
  await page.waitForSelector('.screen[data-screen="chat"]:not([hidden])');

  // lawyer tab -> sign-up card (no account yet)
  await page.click('[data-mode="lawyer"]');
  const card = page.locator(".authbox");
  await card.waitFor();
  await card.locator("button.chip.fill").click(); // empty form -> readable error, still on the card
  assert.match(await card.locator(".err").textContent(), /\S/);
  problems.length = 0; // the 400 for the empty form is expected
  const [alias, pin, name, phone] = await card.locator("input").all();
  await alias.fill("sara_g");
  await pin.fill("123456");
  await name.fill("سارة محمد");
  await phone.fill("0599123456");
  await card.locator("button.chip.fill").click();
  await page.locator("#msgs .lw", { hasText: "احكيلي شو صاير" }).waitFor();

  // her first message opens a case
  await page.fill("#q", "طليقي ما بدفع نفقة");
  await page.press("#q", "Enter");
  await page.locator("#msgs .sys", { hasText: "وصل طلبك" }).waitFor();
  const { queue } = await staff("/v1/staff/queue");
  assert.equal(queue.length, 1);

  // the lawyer claims, sees her contact card, and answers
  const id = queue[0].id;
  await staff(`/v1/staff/cases/${id}/claim`, { method: "POST" });
  const contact = await staff(`/v1/staff/cases/${id}/client`);
  assert.equal(contact.name, "سارة محمد");
  assert.equal(contact.phone, "0599123456");
  await staff(`/v1/staff/cases/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ text: "أهلاً سارة، احكيلي أكثر" }),
  });
  await page.locator("#msgs .lw", { hasText: "احكيلي أكثر" }).waitFor({ timeout: 15000 });
  assert.equal(
    await page.locator("#msgs .u", { hasText: "طليقي ما بدفع نفقة" }).count(),
    1,
    "her message shows once",
  );

  // a reload keeps the session and restores the open case (no sign-up card again)
  await page.reload();
  await page.waitForSelector('.screen[data-screen="chat"]:not([hidden])');
  await page.click('[data-mode="lawyer"]');
  await page.locator("#msgs .lw", { hasText: "احكيلي أكثر" }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator(".authbox").count(), 0);

  assert.deepEqual(problems, [], "console/page errors");
  console.log("ok   live lawyer chat: sign-up, case, claim, reply, resume");
} catch (err) {
  failed = true;
  await page.screenshot({ path: "/tmp/live-fail.png" });
  console.log((await page.locator("#msgs").innerText()).slice(0, 600), problems);
  console.log(`FAIL live lawyer chat\n     ${err.message.split("\n")[0]}`);
} finally {
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
}
