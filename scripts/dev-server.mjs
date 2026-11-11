#!/usr/bin/env node
/**
 * LOCAL ONLY. Serves the site plus the staff API backed by an in-memory store, and signs
 * you in as the email in DEV_STAFF_EMAIL (no Cloudflare Access here). Never deploy this.
 *
 *   DEV_STAFF_EMAIL=dev@local node scripts/dev-server.mjs        -> http://localhost:8787/admin/
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { toBase64 } from "../server/api/crypto.js";
import { handleRequest } from "../server/api/worker.js";
import { createMemoryStore } from "../server/api/store/memory.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 8787);
const staffEmail = (process.env.DEV_STAFF_EMAIL || "dev@local").toLowerCase();
const env = {
  MESSAGE_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
  ALLOWED_ORIGINS: `http://localhost:${port}`,
  DEVELOPER_EMAILS: process.env.DEVELOPERS || staffEmail,
};
const store = createMemoryStore();

/** SEED=1 fills the in-memory store with demo data (staff, a 2-week history, a few live cases). */
if (process.env.SEED) {
  for (const [i, lead] of ["مش ذنبك. الابتزاز جريمة.", "بتقدري تبلّغي وما بتدفعي."].entries())
    await store.addAiAnswer({
      at: Date.now() - i * 3_600_000,
      region: i ? "ps-gaza" : "ps-wb",
      provider: "gemini",
      model: "gemini-flash-lite-latest",
      body: JSON.stringify({
        lead,
        steps: ["لا تدفعي ولا تردّي", "احفظي الأدلة"],
        note: "القانون بيعاقب على التهديد الإلكتروني.",
        cites: ["cyber-15"],
        sos: false,
        topic: "ابتزاز",
      }),
    });
  const { encryptText, sha256Hex } = await import("../server/api/crypto.js");
  const DAY = 86_400_000;
  const now = Date.now();
  const topics = ["نفقة", "حضانة", "ابتزاز إلكتروني", "طلاق", "ميراث", "صور مسرّبة"];
  await store.upsertStaff({ email: "salma@local.test", role: "lawyer", name: "سلمى الأحمد", now });
  await store.upsertStaff({ email: "huda@local.test", role: "lawyer", name: "هدى", now });
  for (let d = 13; d >= 1; d--) {
    for (let k = 0; k < 1 + ((d * 7) % 4); k++) {
      const id = `h${d}-${k}`;
      const t = now - d * DAY + k * 3_600_000;
      await store.createCase({
        id,
        tokenHash: "x",
        topic: topics[(d + k) % 6],
        region: (d + k) % 3 ? "ps-wb" : "ps-gaza",
        now: t,
      });
      await store.claimCase(id, "huda@local.test", t + (5 + ((d * 11 + k * 7) % 40)) * 60_000);
      await store.closeCase(id, t + 2 * 3_600_000);
    }
  }
  // anonymous usage history for the visitors / AI panels
  for (let d = 29; d >= 0; d--) {
    const t = now - d * DAY;
    const pick = (n) => Math.max(0, Math.round(n));
    for (const region of ["ps-wb", "ps-gaza"]) {
      const base = region === "ps-wb" ? 14 : 9;
      const wave = 1 + 0.4 * Math.sin(d / 3);
      for (let i = 0; i < pick(base * wave); i++) await store.track({ event: "visit", region, now: t });
      for (let i = 0; i < pick(base * wave * 0.6); i++)
        await store.track({ event: "visit_return", region, now: t });
      for (let i = 0; i < pick(base * wave * 0.5); i++)
        await store.track({ event: "ask_ai", region, ms: 1400 + ((i * 331) % 1800), now: t });
      for (let i = 0; i < pick(base * wave * 0.3); i++)
        await store.track({ event: "ask_rules", region, now: t });
      for (let i = 0; i < pick(base * wave * 0.08); i++)
        await store.track({ event: "ask_none", region, now: t });
    }
    if (d % 4 === 0) await store.track({ event: "ai_error", region: "ps-wb", now: t });
    if (d % 3 === 0) await store.track({ event: "sos_open", region: "ps-gaza", now: t });
    if (d % 5 === 0) await store.track({ event: "install", region: "ps-wb", now: t });
  }
  for (const [i, tp] of topics.entries())
    for (let k = 0; k < 12 - i * 2; k++) await store.track({ event: `topic:${tp}`, region: "ps-wb", now });
  await store.touchStaff("salma@local.test", now - 2 * 3_600_000);
  await store.touchStaff("huda@local.test", now - 26 * 3_600_000);
  const live = [
    ["نفقة", "ps-gaza", "طليقي ما بدفع نفقة الأولاد من ثلاث شهور، وما بعرف شو أعمل.", 95],
    ["ابتزاز إلكتروني", "ps-wb", "في حدا بهددني ينشر صوري إذا ما بعتتله مصاري.", 22],
    ["حضانة", "ps-gaza", "بدي أعرف إذا بقدر آخد ولادي لما نتطلق، عمر الصغير ٤ سنين.", 6],
  ];
  for (const [i, [topic, region, text, ageMin]] of live.entries()) {
    const id = `live${i}`;
    const t = now - ageMin * 60_000;
    const userId = `u${i}`;
    await store.createUser({
      id: userId,
      username: ["sara_g", "lina_wb", "noor_22"][i],
      salt: "x",
      pinHash: "x",
      ...(await encryptText(
        JSON.stringify({ name: ["سارة محمد", "لينا خالد", "نور سالم"][i], phone: `05991234${i}0` }),
        env.MESSAGE_KEY,
      )),
      region,
      now: t - 3_600_000,
    });
    await store.noteLogin(userId, true, t);
    await store.createCase({ id, userId, tokenHash: await sha256Hex(id), topic, region, now: t });
    await store.addMessage({
      caseId: id,
      sender: "user",
      ...(await encryptText(text, env.MESSAGE_KEY)),
      now: t,
    });
  }
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
      body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const r = await handleRequest(request, env, {
      store,
      staffEmail: async (r) => (r.headers.get("x-dev-staff") || staffEmail).toLowerCase(),
    });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let file = join(root, normalize(url.pathname));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!file.startsWith(root) || !existsSync(file)) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  // local only: turn the real lawyer chat on (the shipped config keeps API_BASE = "")
  if (file.endsWith(join("src", "config.js")))
    return res.end(
      readFileSync(file, "utf8")
        .replace('API_BASE = ""', 'API_BASE = "/api"')
        .replace('AI_ENDPOINT = ""', 'AI_ENDPOINT = "/api/v1/answer"'),
    );
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`dev server http://localhost:${port}  (signed in as ${staffEmail})`));
