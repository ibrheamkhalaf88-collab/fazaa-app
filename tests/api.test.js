import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest, purgeExpired } from "../server/api/worker.js";
import { createMemoryStore } from "../server/api/store/memory.js";
import { toBase64 } from "../server/api/crypto.js";

const ORIGIN = "https://sanad.example";
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)));
const ENV = { MESSAGE_KEY: KEY, ALLOWED_ORIGINS: ORIGIN, DEVELOPER_EMAILS: "dev@sanad.example" };

/** Fresh world: store + a function that calls the API as a given staff email (or anonymous). */
function world() {
  const store = createMemoryStore();
  let clock = 1_000_000;
  const call = (method, path, { body, token, as, env = ENV } = {}) =>
    handleRequest(
      new Request(`https://sanad.example/api${path}`, {
        method,
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      { store, now: (clock += 1000), staffEmail: async () => as ?? null },
    );
  return { store, call };
}
const j = async (res) => res.json();

let seq = 0;
/** Sign a woman up (alias + PIN + contact), then open a case as her. Returns { caseId, token, username }. */
async function openCase(
  w,
  message = "طليقي ما بدفع نفقة",
  { username = `sara_${++seq}`, region = "ps-gaza" } = {},
) {
  const up = await w.call("POST", "/v1/users", {
    body: { username, pin: "123456", name: "سارة محمد", phone: "0599123456", region },
  });
  assert.equal(up.status, 201);
  const { token } = await j(up);
  const res = await w.call("POST", "/v1/cases", { token, body: { topic: "نفقة", message } });
  assert.equal(res.status, 201);
  return { ...(await j(res)), token, username };
}
async function addLawyer(w, email = "salma@sanad.example", name = "سلمى الأحمد") {
  const res = await w.call("PUT", "/v1/staff/team", {
    as: "dev@sanad.example",
    body: { email, role: "lawyer", name },
  });
  assert.equal(res.status, 200);
  return email;
}

test("not configured without MESSAGE_KEY", async () => {
  const w = world();
  assert.equal(
    (await w.call("POST", "/v1/cases", { body: {}, env: { ALLOWED_ORIGINS: ORIGIN } })).status,
    503,
  );
});

test("rejects an origin that is not allowed", async () => {
  const w = world();
  const res = await handleRequest(
    new Request("https://sanad.example/api/v1/cases", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: "{}",
    }),
    ENV,
    { store: w.store },
  );
  assert.equal(res.status, 403);
});

test("a case is created with a token; the message is stored ENCRYPTED, never as plain text", async () => {
  const w = world();
  const { caseId } = await openCase(w, "رسالة سرية جداً");
  const [row] = await w.store.listMessages(caseId);
  assert.ok(!row.body.includes("سرية"));
  assert.ok(row.iv.length > 0);
});

test("only the token holder can read or write her case; wrong id and wrong token look the same", async () => {
  const w = world();
  const { caseId, token } = await openCase(w);
  const other = await openCase(w, "ثانية");
  assert.equal((await w.call("GET", `/v1/cases/${caseId}/messages`)).status, 401);
  assert.equal((await w.call("GET", `/v1/cases/${caseId}/messages`, { token: other.token })).status, 401);
  assert.equal((await w.call("GET", `/v1/cases/nope/messages`, { token })).status, 401);
  const ok = await j(await w.call("GET", `/v1/cases/${caseId}/messages`, { token }));
  assert.equal(ok.status, "open");
  assert.equal(ok.messages[0].text, "طليقي ما بدفع نفقة");
});

test("validates message and size", async () => {
  const w = world();
  const { token } = await openCase(w);
  assert.equal((await w.call("POST", "/v1/cases", { token, body: { message: "  " } })).status, 400);
  const big = await w.call("POST", "/v1/cases", { token, body: { message: "ا".repeat(9000) } });
  assert.equal(big.status, 413);
});

test("staff endpoints need a verified staff identity", async () => {
  const w = world();
  assert.equal((await w.call("GET", "/v1/staff/queue")).status, 401);
  assert.equal((await w.call("GET", "/v1/staff/queue", { as: "stranger@x.org" })).status, 401);
});

test("full flow: lawyer is added, claims, answers; the woman sees the lawyer's first name", async () => {
  const w = world();
  const lawyer = await addLawyer(w);
  const { caseId, token } = await openCase(w);

  const queue = await j(await w.call("GET", "/v1/staff/queue", { as: lawyer }));
  assert.deepEqual(Object.keys(queue.queue[0]).sort(), ["createdAt", "id", "region", "topic"]); // no text in the queue
  assert.equal((await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: lawyer })).status, 200);

  await w.call("POST", `/v1/staff/cases/${caseId}/messages`, {
    as: lawyer,
    body: { text: "أهلاً، احكيلي أكثر" },
  });
  const seen = await j(await w.call("GET", `/v1/cases/${caseId}/messages`, { token }));
  assert.equal(seen.lawyer, "سلمى");
  assert.deepEqual(
    seen.messages.map((m) => m.from),
    ["user", "lawyer"],
  );

  await w.call("POST", `/v1/cases/${caseId}/messages`, { token, body: { text: "عندي ولدين" } });
  const mine = await j(await w.call("GET", `/v1/staff/cases/${caseId}/messages`, { as: lawyer }));
  assert.equal(mine.messages.length, 3);
});

test("two lawyers cannot take the same case; the second cannot read it", async () => {
  const w = world();
  const a = await addLawyer(w, "a@sanad.example", "أ");
  const b = await addLawyer(w, "b@sanad.example", "ب");
  const { caseId } = await openCase(w);
  assert.equal((await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: a })).status, 200);
  assert.equal((await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: b })).status, 409);
  assert.equal((await w.call("GET", `/v1/staff/cases/${caseId}/messages`, { as: b })).status, 403);
  assert.equal(
    (await w.call("POST", `/v1/staff/cases/${caseId}/messages`, { as: b, body: { text: "x" } })).status,
    403,
  );
  assert.equal((await w.call("POST", `/v1/staff/cases/${caseId}/close`, { as: b })).status, 403);
});

test("a lawyer cannot read a case she has not claimed", async () => {
  const w = world();
  const a = await addLawyer(w);
  const { caseId } = await openCase(w);
  assert.equal((await w.call("GET", `/v1/staff/cases/${caseId}/messages`, { as: a })).status, 403);
});

test("DEVELOPERS CANNOT READ CASE CONTENT, claim or answer cases; lawyers cannot see stats or manage staff", async () => {
  const w = world();
  const lawyer = await addLawyer(w);
  const { caseId } = await openCase(w);
  await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: lawyer });
  const dev = "dev@sanad.example";
  assert.equal((await w.call("GET", `/v1/staff/cases/${caseId}/messages`, { as: dev })).status, 403);
  assert.equal((await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: dev })).status, 403);
  assert.equal((await w.call("GET", "/v1/staff/queue", { as: dev })).status, 403);
  assert.equal((await w.call("GET", "/v1/staff/stats", { as: lawyer })).status, 403);
  assert.equal((await w.call("GET", "/v1/staff/team", { as: lawyer })).status, 403);
  assert.equal(
    (await w.call("PUT", "/v1/staff/team", { as: lawyer, body: { email: "x@y.org", role: "developer" } }))
      .status,
    403,
  );
});

test("developer stats contain counts only (no ids, topics or text)", async () => {
  const w = world();
  await openCase(w, "نص سري");
  const st = await j(await w.call("GET", "/v1/staff/stats", { as: "dev@sanad.example" }));
  assert.deepEqual(Object.keys(st).sort(), [
    "avgClaimWaitMs",
    "byRegion",
    "byStatus",
    "lawyers",
    "messages",
    "oldestWaitingMs",
    "retention",
    "series",
  ]);
  assert.ok(!JSON.stringify(st).includes("سري"));
});

test("developer manages the team; cannot remove self; bad input rejected", async () => {
  const w = world();
  const dev = "dev@sanad.example";
  assert.equal(
    (await w.call("PUT", "/v1/staff/team", { as: dev, body: { email: "nope", role: "lawyer" } })).status,
    400,
  );
  assert.equal(
    (await w.call("PUT", "/v1/staff/team", { as: dev, body: { email: "a@b.org", role: "admin" } })).status,
    400,
  );
  await addLawyer(w, "A@B.org", "سلمى");
  const { team } = await j(await w.call("GET", "/v1/staff/team", { as: dev }));
  assert.equal(team[0].email, "a@b.org");
  assert.equal((await w.call("DELETE", `/v1/staff/team?email=${dev}`, { as: dev })).status, 400);
  assert.equal((await w.call("DELETE", "/v1/staff/team?email=a@b.org", { as: dev })).status, 200);
});

test("a closed case rejects new messages from both sides", async () => {
  const w = world();
  const lawyer = await addLawyer(w);
  const { caseId, token } = await openCase(w);
  await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: lawyer });
  await w.call("POST", `/v1/staff/cases/${caseId}/close`, { as: lawyer });
  assert.equal(
    (await w.call("POST", `/v1/cases/${caseId}/messages`, { token, body: { text: "x" } })).status,
    409,
  );
  assert.equal(
    (await w.call("POST", `/v1/staff/cases/${caseId}/messages`, { as: lawyer, body: { text: "x" } })).status,
    409,
  );
  assert.equal((await j(await w.call("GET", `/v1/cases/${caseId}/messages`, { token }))).status, "closed");
});

test("retention: purgeExpired deletes old closed cases", async () => {
  const w = world();
  const lawyer = await addLawyer(w);
  const { caseId } = await openCase(w);
  await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: lawyer });
  await w.call("POST", `/v1/staff/cases/${caseId}/close`, { as: lawyer });
  assert.equal(await purgeExpired({}, w.store, Date.now() + 8 * 86_400_000), 1);
  assert.equal(await w.store.getCase(caseId), null);
});

test("private notes: encrypted at rest, only the lawyer who owns the case can read or write them", async () => {
  const w = world();
  const a = await addLawyer(w, "a@sanad.example", "أ");
  const b = await addLawyer(w, "b@sanad.example", "ب");
  const { caseId, token } = await openCase(w);
  await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: a });
  assert.equal(
    (await w.call("PUT", `/v1/staff/cases/${caseId}/note`, { as: a, body: { note: "ملاحظة سرية للمحامية" } }))
      .status,
    200,
  );
  assert.equal(
    (await j(await w.call("GET", `/v1/staff/cases/${caseId}/note`, { as: a }))).note,
    "ملاحظة سرية للمحامية",
  );
  assert.ok(!(await w.store.getNote(caseId)).body.includes("سرية"));
  assert.equal((await w.call("GET", `/v1/staff/cases/${caseId}/note`, { as: b })).status, 403);
  assert.equal(
    (await w.call("GET", `/v1/staff/cases/${caseId}/note`, { as: "dev@sanad.example" })).status,
    403,
  );
  // never shown to the woman
  const seen = JSON.stringify(await j(await w.call("GET", `/v1/cases/${caseId}/messages`, { token })));
  assert.ok(!seen.includes("سرية"));
});

test("audit log: developer-only, records who did what but never message text", async () => {
  const w = world();
  const lawyer = await addLawyer(w);
  const { caseId } = await openCase(w, "كلام سري جداً");
  await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: lawyer });
  await w.call("POST", `/v1/staff/cases/${caseId}/messages`, { as: lawyer, body: { text: "رد سري" } });
  await w.call("POST", `/v1/staff/cases/${caseId}/close`, { as: lawyer });
  assert.equal((await w.call("GET", "/v1/staff/audit", { as: lawyer })).status, 403);
  const { audit } = await j(await w.call("GET", "/v1/staff/audit", { as: "dev@sanad.example" }));
  assert.deepEqual(
    audit.map((a) => a.action),
    ["close", "claim", "staff-add"],
  );
  assert.ok(!JSON.stringify(audit).includes("سري"));
});

test("stats include the daily series and the average claim wait", async () => {
  const w = world();
  const lawyer = await addLawyer(w);
  const { caseId } = await openCase(w);
  await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: lawyer });
  const st = await j(await w.call("GET", "/v1/staff/stats", { as: "dev@sanad.example" }));
  assert.equal(
    st.series.reduce((n, d) => n + d.created, 0),
    1,
  );
  assert.ok(st.avgClaimWaitMs > 0);
});

test("ping: only whitelisted events, region optional, nothing but counters is stored", async () => {
  const w = world();
  assert.equal(
    (await w.call("POST", "/v1/ping", { body: { event: "visit", region: "ps-gaza" } })).status,
    204,
  );
  assert.equal((await w.call("POST", "/v1/ping", { body: { event: "visit", region: "mars" } })).status, 204); // unknown region -> "none"
  assert.equal((await w.call("POST", "/v1/ping", { body: { event: "steal-data" } })).status, 400);
  assert.equal((await w.call("POST", "/v1/ping", { body: { event: "topic:نفقة" } })).status, 400); // topics are server-made only
  assert.equal(
    (
      await w.call("POST", "/v1/ping", {
        body: { event: "ask_ai", region: "ps-wb", ms: 99999999, text: "سؤال سري" },
      })
    ).status,
    204,
  );
  const a = await w.store.analytics(2_000_000);
  assert.equal(a.totals.visit, 2);
  assert.equal(a.aiAvgMs, 60000); // latency clamped
  assert.ok(!JSON.stringify(a).includes("سري"));
});

test("opening a case counts a lawyer request and a normalised topic (free text never becomes a key)", async () => {
  const w = world();
  const { token } = await openCase(w);
  const other = await openCase(w);
  await w.call("POST", "/v1/cases", { token, body: { topic: "اسمي سعاد وبسكن في ...", message: "x" } });
  const a = await w.store.analytics(2_000_000);
  assert.equal(a.totals.lawyer_request, 3);
  assert.deepEqual(a.topics, { نفقة: 2, أخرى: 1 });
  assert.ok(other.caseId);
});

test("developer analytics: usage + who signed in; lawyers cannot read it", async () => {
  const w = world();
  const lawyer = await addLawyer(w);
  await w.call("GET", "/v1/staff/me", { as: lawyer });
  await w.call("POST", "/v1/ping", { body: { event: "visit", region: "ps-wb" } });
  assert.equal((await w.call("GET", "/v1/staff/analytics", { as: lawyer })).status, 403);
  const a = await j(await w.call("GET", "/v1/staff/analytics?days=30", { as: "dev@sanad.example" }));
  assert.equal(a.series.length, 30);
  assert.equal(a.totals.visit, 1);
  const row = a.staff.find((m) => m.email === lawyer);
  assert.equal(row.sessions, 1);
  assert.ok(row.lastSeen > 0);
});

test("lawyer work dashboard: team counts and her own numbers, no content; developers are refused", async () => {
  const w = world();
  const lawyer = await addLawyer(w);
  const { caseId } = await openCase(w, "كلام سري");
  await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: lawyer });
  await w.call("POST", `/v1/staff/cases/${caseId}/close`, { as: lawyer });
  const work = await j(await w.call("GET", "/v1/staff/work", { as: lawyer }));
  assert.deepEqual(work.me, { claimed: 1, closed: 1 });
  assert.equal(work.byRegion["ps-gaza"], 1);
  assert.ok(!JSON.stringify(work).includes("سري"));
  assert.equal((await w.call("GET", "/v1/staff/work", { as: "dev@sanad.example" })).status, 403);
});

/* ---------------- women's accounts ---------------- */
const signup = (w, over = {}) =>
  w.call("POST", "/v1/users", {
    body: {
      username: "dana",
      pin: "246810",
      name: "دانا خليل",
      phone: "+970599000111",
      region: "ps-wb",
      ...over,
    },
  });

test("asking for a lawyer needs a signed-in account", async () => {
  const w = world();
  const res = await w.call("POST", "/v1/cases", { body: { topic: "نفقة", message: "مرحبا" } });
  assert.equal(res.status, 401);
});

test("signup validates alias, 6-digit PIN, name, phone and region; alias is unique", async () => {
  const w = world();
  for (const bad of [
    { username: "ab" },
    { username: "has space" },
    { pin: "1234" },
    { pin: "abcdef" },
    { name: "" },
    { phone: "12" },
    { region: "x" },
  ])
    assert.equal((await signup(w, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await signup(w)).status, 201);
  assert.equal((await signup(w, { username: "DANA" })).status, 409);
});

test("PIN is stored hashed; name and phone are stored ENCRYPTED", async () => {
  const w = world();
  await signup(w);
  const u = await w.store.getUserByName("dana");
  const blob = JSON.stringify(u);
  assert.ok(
    !blob.includes("246810") &&
      !blob.includes("دانا") &&
      !blob.includes("0599000111") &&
      !blob.includes("970599"),
  );
});

test("login: right PIN works, wrong PIN and unknown alias look the same, 5 failures lock for 15 minutes", async () => {
  const w = world();
  await signup(w);
  const login = (username, pin) => w.call("POST", "/v1/login", { body: { username, pin } });
  assert.equal((await login("dana", "246810")).status, 200);
  const wrong = await login("dana", "000000");
  const unknown = await login("nobody", "000000");
  assert.equal(wrong.status, 401);
  assert.deepEqual(await j(wrong), await j(unknown));
  for (let i = 0; i < 4; i++) await login("dana", "000000");
  assert.equal((await login("dana", "246810")).status, 429); // locked even with the right PIN
});

test("session: /me lists only her cases; logout and account deletion end access", async () => {
  const w = world();
  const a = await openCase(w, "أنا أ");
  const b = await openCase(w, "أنا ب");
  const mine = await j(await w.call("GET", "/v1/me", { token: a.token }));
  assert.deepEqual(
    mine.cases.map((c) => c.id),
    [a.caseId],
  );
  assert.equal((await w.call("GET", `/v1/cases/${a.caseId}/messages`, { token: b.token })).status, 401);
  assert.equal((await w.call("POST", "/v1/logout", { token: a.token })).status, 204);
  assert.equal((await w.call("GET", "/v1/me", { token: a.token })).status, 401);
  assert.equal((await w.call("DELETE", "/v1/me", { token: b.token })).status, 204);
  assert.equal(await w.store.getCase(b.caseId), null);
  assert.equal(await w.store.getUserByName(b.username), null);
});

test("contact card: only the lawyer who claimed the case, and it is audited", async () => {
  const w = world();
  const a = await addLawyer(w, "a@sanad.example", "أ");
  const b = await addLawyer(w, "b@sanad.example", "ب");
  const { caseId } = await openCase(w);
  assert.equal((await w.call("GET", `/v1/staff/cases/${caseId}/client`, { as: a })).status, 403); // not claimed yet
  await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: a });
  const card = await j(await w.call("GET", `/v1/staff/cases/${caseId}/client`, { as: a }));
  assert.equal(card.name, "سارة محمد");
  assert.equal(card.phone, "0599123456");
  assert.equal((await w.call("GET", `/v1/staff/cases/${caseId}/client`, { as: b })).status, 403);
  assert.equal(
    (await w.call("GET", `/v1/staff/cases/${caseId}/client`, { as: "dev@sanad.example" })).status,
    403,
  );
  const audit = await j(await w.call("GET", "/v1/staff/audit", { as: "dev@sanad.example" }));
  assert.ok(audit.audit.some((r) => r.action === "view-contact" && r.target === caseId));
  assert.ok(!JSON.stringify(audit).includes("سارة"));
});

test("developers see accounts and activity but never names or phones", async () => {
  const w = world();
  const { username } = await openCase(w);
  await w.call("POST", "/v1/login", { body: { username, pin: "123456" } });
  const res = await j(await w.call("GET", "/v1/staff/users", { as: "dev@sanad.example" }));
  assert.equal(res.total >= 1, true);
  assert.ok(res.users.every((u) => !("name" in u) && !("phone" in u) && !("body" in u)));
  assert.ok(!JSON.stringify(res).includes("سارة") && !JSON.stringify(res).includes("0599123456"));
  assert.equal((await w.call("GET", "/v1/staff/users", { as: await addLawyer(w) })).status, 403);
  const an = await j(await w.call("GET", "/v1/staff/analytics", { as: "dev@sanad.example" }));
  assert.ok(an.totals.signup >= 1 && an.totals.login >= 1);
});

test("retention: accounts with no login for 180 days are deleted with their cases", async () => {
  const w = world();
  const { caseId, username } = await openCase(w);
  await purgeExpired({}, w.store, Date.now() + 200 * 86_400_000);
  assert.equal(await w.store.getUserByName(username), null);
  assert.equal(await w.store.getCase(caseId), null);
});

/* ---------- AI settings saved from the dashboard ---------- */
const DEV = "dev@sanad.example";
const SECRET_KEY = "AIzaSy-test-key-1234567890abcdef";
const geminiReply = (args) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ functionCall: { name: "give_answer", args } }] } }],
    }),
  );

test("ai-config: developers only, and the key is never returned", async () => {
  const w = world();
  await addLawyer(w);
  assert.equal((await w.call("GET", "/v1/staff/ai-config", { as: "salma@sanad.example" })).status, 403);
  assert.equal((await w.call("GET", "/v1/staff/ai-config")).status, 401);

  const put = await w.call("PUT", "/v1/staff/ai-config", {
    as: DEV,
    body: { provider: "gemini", model: "", apiKey: SECRET_KEY },
  });
  assert.equal(put.status, 200);
  const cfg = await j(put);
  assert.equal(cfg.hasKey, true);
  assert.equal(cfg.source, "dashboard");
  assert.equal(cfg.keyHint, "••••cdef");
  assert.ok(!JSON.stringify(cfg).includes(SECRET_KEY));
  assert.ok(
    !JSON.stringify(await j(await w.call("GET", "/v1/staff/ai-config", { as: DEV }))).includes(SECRET_KEY),
  );
});

test("ai-config: validates input, encrypts at rest, keeps the key when only the model changes", async () => {
  const w = world();
  const put = (body) => w.call("PUT", "/v1/staff/ai-config", { as: DEV, body });
  assert.equal((await put({ provider: "nope", apiKey: SECRET_KEY })).status, 400);
  assert.equal((await put({ provider: "gemini", apiKey: "short" })).status, 400);
  assert.equal((await put({ provider: "gemini", apiKey: "has space in it 1234567890" })).status, 400);
  assert.equal((await put({ provider: "gemini", model: "bad model!", apiKey: SECRET_KEY })).status, 400);
  assert.equal((await put({ provider: "gemini" })).status, 400); // first save needs a key

  assert.equal((await put({ provider: "gemini", apiKey: SECRET_KEY })).status, 200);
  const stored = await w.store.getSetting("ai");
  assert.ok(!JSON.stringify(stored).includes(SECRET_KEY)); // ciphertext only

  const again = await j(await put({ provider: "gemini", model: "gemini-2.5-flash" }));
  assert.equal(again.model, "gemini-2.5-flash");
  assert.equal(again.hasKey, true);
  assert.equal((await put({ provider: "nvidia", model: "x" })).status, 400); // another provider needs its own key
});

test("ai-config: save, test and delete are audited without the key", async () => {
  const w = world();
  await w.call("PUT", "/v1/staff/ai-config", { as: DEV, body: { provider: "gemini", apiKey: SECRET_KEY } });
  await w.call("DELETE", "/v1/staff/ai-config", { as: DEV });
  const log = JSON.stringify(await w.store.listAudit());
  assert.match(log, /ai-config-set/);
  assert.match(log, /ai-config-clear/);
  assert.ok(!log.includes(SECRET_KEY));
  assert.equal((await j(await w.call("GET", "/v1/staff/ai-config", { as: DEV }))).hasKey, false);
});

test("/v1/answer uses the dashboard key and falls back to the Worker secret", async () => {
  const w = world();
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, key: init.headers["x-goog-api-key"] });
    return geminiReply({
      covered: true,
      lead: "مش ذنبك.",
      note: "القانون بيعاقب على الابتزاز الإلكتروني.",
      steps: ["لا تدفعي", "احفظي الأدلة"],
      sos: false,
      citations: [],
    });
  };
  const ask = (env) =>
    handleRequest(
      new Request("https://sanad.example/api/v1/answer", {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ question: "حدا عم يبتزني بصوري", country: "ps-wb" }),
      }),
      env,
      { store: w.store, now: 5_000_000, fetchImpl },
    );

  assert.equal((await ask(ENV)).status, 503); // nothing configured yet
  assert.equal(seen.length, 0);

  await w.call("PUT", "/v1/staff/ai-config", { as: DEV, body: { provider: "gemini", apiKey: SECRET_KEY } });
  await ask(ENV);
  assert.equal(seen.at(-1).key, SECRET_KEY);
  assert.match(seen.at(-1).url, /gemini-2\.5-flash-lite/);

  await w.call("DELETE", "/v1/staff/ai-config", { as: DEV });
  await ask({ ...ENV, GEMINI_API_KEY: "secret-from-worker-1234567890" });
  assert.equal(seen.at(-1).key, "secret-from-worker-1234567890");
});

test("/v1/answer rejects missing origin and bad questions", async () => {
  const w = world();
  const post = (body, origin = ORIGIN) =>
    handleRequest(
      new Request("https://sanad.example/api/v1/answer", {
        method: "POST",
        headers: { ...(origin ? { origin } : {}), "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      ENV,
      { store: w.store, now: 1 },
    );
  assert.equal((await post({ question: "حدا عم يبتزني بصوري" }, null)).status, 403);
  assert.equal((await post({ question: "ab" })).status, 400);
  assert.equal((await post({ question: "ا".repeat(501) })).status, 400);
});

/* ---------- AI answers kept for review (the question is never stored) ---------- */
test("answers are kept without the question, scrubbed, and reviewable by lawyers", async () => {
  const w = world();
  await addLawyer(w);
  await w.call("PUT", "/v1/staff/ai-config", { as: DEV, body: { provider: "gemini", apiKey: SECRET_KEY } });
  const QUESTION = "اسمي ليلى ورقمي 0599123456 وحدا عم يبتزني";
  const fetchImpl = async () =>
    geminiReply({
      covered: true,
      lead: "مش ذنبك. بلغي على 0599123456 أو https://x.test/a",
      note: "تواصلي على help@x.org",
      steps: ["لا تدفعي", "احفظي الأدلة"],
      sos: false,
      cites: [],
    });
  const res = await handleRequest(
    new Request("https://sanad.example/api/v1/answer", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ question: QUESTION, country: "ps-gaza" }),
    }),
    ENV,
    { store: w.store, now: 7_000_000, fetchImpl },
  );
  assert.equal(res.status, 200);

  const stored = JSON.stringify(await w.store.listAiAnswers({ verdict: "all" }));
  assert.ok(!stored.includes("ليلى") && !stored.includes(QUESTION)); // no question text
  assert.ok(!stored.includes("0599123456") && !stored.includes("x.test") && !stored.includes("help@x.org"));
  assert.match(stored, /\[رقم\]/);

  const lawyer = "salma@sanad.example";
  const list = await j(await w.call("GET", "/v1/staff/ai-answers?verdict=pending", { as: lawyer }));
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].region, "ps-gaza");
  assert.equal(list.counts.pending, 1);

  const id = list.items[0].id;
  assert.equal(
    (await w.call("PUT", `/v1/staff/ai-answers/${id}`, { as: lawyer, body: { verdict: "maybe" } })).status,
    400,
  );
  assert.equal(
    (await w.call("PUT", `/v1/staff/ai-answers/${id}`, { as: lawyer, body: { verdict: "good" } })).status,
    200,
  );
  assert.equal(
    (await w.call("PUT", "/v1/staff/ai-answers/9999", { as: lawyer, body: { verdict: "good" } })).status,
    404,
  );
  assert.equal((await w.call("GET", "/v1/staff/ai-answers", { as: null })).status, 401);

  // export: developers only, reviewed answers only, audited
  assert.equal((await w.call("GET", "/v1/staff/ai-answers/export", { as: lawyer })).status, 403);
  const exp = await j(await w.call("GET", "/v1/staff/ai-answers/export", { as: DEV }));
  assert.equal(exp.items.length, 1);
  assert.equal(exp.items[0].verdict, "good");
  assert.match(JSON.stringify(await w.store.listAudit()), /ai-answers-export/);
});

test("a failed or empty AI call keeps nothing", async () => {
  const w = world();
  await w.call("PUT", "/v1/staff/ai-config", { as: DEV, body: { provider: "gemini", apiKey: SECRET_KEY } });
  const post = (fetchImpl) =>
    handleRequest(
      new Request("https://sanad.example/api/v1/answer", {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ question: "حدا عم يبتزني بصوري", country: "ps-wb" }),
      }),
      ENV,
      { store: w.store, now: 8_000_000, fetchImpl },
    );
  await post(async () => new Response("nope", { status: 500 }));
  await post(async () => geminiReply({ covered: false }));
  assert.equal((await w.store.listAiAnswers({ verdict: "all" })).length, 0);
});

test("/v1/answer stops at the daily cap, and the cap resets the next day", async () => {
  const w = world();
  await w.call("PUT", "/v1/staff/ai-config", { as: DEV, body: { provider: "gemini", apiKey: SECRET_KEY } });
  const env = { ...ENV, AI_DAILY_LIMIT: "2" };
  const ask = (now) =>
    handleRequest(
      new Request("https://sanad.example/api/v1/answer", {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ question: "حدا عم يبتزني بصوري", country: "ps-wb" }),
      }),
      env,
      { store: w.store, now, fetchImpl: async () => new Response("x", { status: 500 }) },
    );
  const day1 = Date.UTC(2026, 10, 10, 12);
  assert.equal((await ask(day1)).status, 502);
  assert.equal((await ask(day1)).status, 502);
  assert.equal((await ask(day1)).status, 429); // third call today is refused before any model call
  assert.equal((await ask(day1 + 86_400_000)).status, 502); // next day: allowed again
  const cfg = await j(await w.call("GET", "/v1/staff/ai-config", { as: DEV, env }));
  assert.equal(cfg.dailyLimit, 2);
  assert.ok(cfg.usedToday >= 0);
});
