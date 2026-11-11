import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest } from "../server/api/worker.js";
import { createMemoryStore } from "../server/api/store/memory.js";
import { toBase64 } from "../server/api/crypto.js";

const ORIGIN = "https://fazaa.example";
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)));
const ENV = { MESSAGE_KEY: KEY, ALLOWED_ORIGINS: ORIGIN, DEVELOPER_EMAILS: "dev@fazaa.example" };
const DEV = "dev@fazaa.example";

function world(env = ENV) {
  const store = createMemoryStore();
  let clock = 1_000_000;
  const call = (method, path, { body, token, as } = {}) =>
    handleRequest(
      new Request(`https://fazaa.example/api${path}`, {
        method,
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.7",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      { store, now: (clock += 1000), staffEmail: async () => as ?? null },
    );
  return { store, call };
}

let seq = 0;
async function claimedCase(w, lawyer) {
  await w.call("PUT", "/v1/staff/team", { as: DEV, body: { email: lawyer, role: "lawyer", name: "سلمى" } });
  const up = await w.call("POST", "/v1/users", {
    body: { username: `rel_${++seq}`, pin: "123456", name: "سارة", phone: "0599123456", region: "ps-wb" },
  });
  const { token } = await up.json();
  const { caseId } = await (
    await w.call("POST", "/v1/cases", { token, body: { topic: "نفقة", message: "مرحبا" } })
  ).json();
  assert.equal((await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: lawyer })).status, 200);
  return { caseId, token };
}

const queueIds = async (w, as) =>
  (await (await w.call("GET", "/v1/staff/queue", { as })).json()).queue.map((c) => c.id);

for (const [how, act] of [
  [
    "suspended",
    (w, l) =>
      w.call("PUT", "/v1/staff/team", {
        as: DEV,
        body: { email: l, role: "lawyer", name: "سلمى", active: false },
      }),
  ],
  ["removed", (w, l) => w.call("DELETE", `/v1/staff/team?email=${encodeURIComponent(l)}`, { as: DEV })],
  [
    "made a developer",
    (w, l) =>
      w.call("PUT", "/v1/staff/team", { as: DEV, body: { email: l, role: "developer", name: "سلمى" } }),
  ],
]) {
  test(`a lawyer who is ${how}: her claimed cases go back to the queue (audited)`, async () => {
    const w = world();
    const { caseId, token } = await claimedCase(w, "a@fazaa.example");
    await w.call("PUT", "/v1/staff/team", {
      as: DEV,
      body: { email: "b@fazaa.example", role: "lawyer", name: "منى" },
    });
    assert.ok(!(await queueIds(w, "b@fazaa.example")).includes(caseId));

    assert.equal((await act(w, "a@fazaa.example")).status, 200);

    assert.ok((await queueIds(w, "b@fazaa.example")).includes(caseId), "back in the queue");
    const mine = await (await w.call("GET", `/v1/cases/${caseId}/messages`, { token })).json();
    assert.equal(mine.status, "open");
    assert.equal(mine.lawyer, null);
    assert.equal(
      (await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: "b@fazaa.example" })).status,
      200,
    );
    const audit = (await w.store.listAudit(50)).map((a) => a.action);
    assert.ok(audit.includes("cases-release"));
  });
}

test("restoring a lawyer or renaming her does not release her cases", async () => {
  const w = world();
  const { caseId } = await claimedCase(w, "a@fazaa.example");
  await w.call("PUT", "/v1/staff/team", {
    as: DEV,
    body: { email: "a@fazaa.example", role: "lawyer", name: "سلمى ج" },
  });
  assert.equal((await w.store.getCase(caseId)).status, "claimed");
});

test("the rate limit covers AI, sign-up, sign-in and counters, per IP and endpoint, but not message polling", async () => {
  const keys = [];
  const env = { ...ENV, RATE_LIMITER: { limit: async ({ key }) => (keys.push(key), { success: false }) } };
  const w = world(env);
  for (const path of ["/v1/answer", "/v1/users", "/v1/login", "/v1/staff/login", "/v1/ping"])
    assert.equal((await w.call("POST", path, { body: {} })).status, 429, path);
  assert.deepEqual(keys, [
    "203.0.113.7|/v1/answer",
    "203.0.113.7|/v1/users",
    "203.0.113.7|/v1/login",
    "203.0.113.7|/v1/staff/login",
    "203.0.113.7|/v1/ping",
  ]);
  assert.equal((await w.call("GET", "/v1/cases/abc/messages")).status, 401); // reached the handler
  assert.equal((await w.call("GET", "/v1/staff/queue")).status, 401);
  assert.equal(keys.length, 5);
});
