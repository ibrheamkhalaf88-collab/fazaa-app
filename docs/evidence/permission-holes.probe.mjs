/**
 * Run: node --test docs/evidence/permission-holes.probe.mjs
 * Probe written during the 2026-11-13 review: it PROVES two permission holes exist today.
 * These tests pass while the holes exist; when a hole is fixed, flip the assertion (see the comments).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest } from "../../server/api/worker.js";
import { createMemoryStore } from "../../server/api/store/memory.js";
import { toBase64 } from "../../server/api/crypto.js";

const ORIGIN = "https://fazaa.example";
const ENV = { MESSAGE_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ALLOWED_ORIGINS: ORIGIN };

function world() {
  const store = createMemoryStore();
  let clock = 1_000_000;
  const call = (method, path, { body, token, as } = {}) =>
    handleRequest(
      new Request(`https://fazaa.example/api${path}`, {
        method,
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      ENV,
      { store, now: (clock += 1000), staffEmail: async () => as ?? null },
    );
  return { store, call };
}

test("HOLE 1 (exists): a developer can read a case with ?after=1 and the opening is NOT audited", async () => {
  const w = world();
  await w.store.upsertStaff({ email: "dev@x.org", role: "developer", name: "", now: 1 });
  const up = await (
    await w.call("POST", "/v1/users", {
      body: { username: "probe_1", pin: "123456", name: "اسم", phone: "0599000000", region: "ps-wb" },
    })
  ).json();
  const { caseId } = await (
    await w.call("POST", "/v1/cases", { token: up.token, body: { topic: "x", message: "أول رسالة" } })
  ).json();
  await w.call("POST", `/v1/cases/${caseId}/messages`, {
    token: up.token,
    body: { text: "رسالة تانية سرية" },
  });

  const read = await (
    await w.call("GET", `/v1/staff/cases/${caseId}/messages?after=1`, { as: "dev@x.org" })
  ).json();
  assert.ok(
    read.messages.some((m) => m.text === "رسالة تانية سرية"),
    "content was read",
  );
  const audit = await (await w.call("GET", "/v1/staff/audit", { as: "dev@x.org" })).json();
  // when fixed: assert.ok(audit.audit.some(...))
  assert.equal(
    audit.audit.some((a) => a.action === "dev-read-case"),
    false,
    "no audit entry",
  );
});

test("HOLE 2 (exists): any developer can reset another developer's password and remove the owner", async () => {
  const w = world();
  await w.store.upsertStaff({ email: "owner@x.org", role: "developer", name: "", now: 1 });
  await w.store.upsertStaff({ email: "dev2@x.org", role: "developer", name: "", now: 1 });
  const reset = await (
    await w.call("POST", "/v1/staff/team/reset", { as: "dev2@x.org", body: { email: "owner@x.org" } })
  ).json();
  // when fixed: only the owner can reset or remove a developer
  assert.equal(typeof reset.tempPassword, "string", "dev2 got a working temporary password for the owner");
  const del = await w.call("DELETE", "/v1/staff/team?email=owner%40x.org", { as: "dev2@x.org" });
  assert.equal(del.status, 200, "dev2 removed the owner");
});

test("GAP (exists): a lawyer marked unavailable, or not covering the region, can still claim a case", async () => {
  const w = world();
  await w.store.upsertStaff({ email: "dev@x.org", role: "developer", name: "", now: 1 });
  await w.store.upsertStaff({ email: "l@x.org", role: "lawyer", name: "ليلى", now: 1 });
  await w.call("PUT", "/v1/staff/lawyers", {
    as: "dev@x.org",
    body: { email: "l@x.org", regions: ["ps-wb"], available: false },
  });
  const up = await (
    await w.call("POST", "/v1/users", {
      body: { username: "probe_2", pin: "123456", name: "اسم", phone: "0599000001", region: "ps-gaza" },
    })
  ).json();
  const { caseId } = await (
    await w.call("POST", "/v1/cases", { token: up.token, body: { topic: "x", message: "غزة" } })
  ).json();
  const claim = await w.call("POST", `/v1/staff/cases/${caseId}/claim`, { as: "l@x.org" });
  assert.equal(claim.status, 200, "claimed although unavailable and West-Bank only");
});
