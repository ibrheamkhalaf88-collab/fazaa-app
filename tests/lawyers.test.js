import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest } from "../server/api/worker.js";
import { createMemoryStore } from "../server/api/store/memory.js";
import { toBase64 } from "../server/api/crypto.js";
import { applyProfile, emptyProfile, publicLawyer } from "../src/data/lawyers.js";

const ORIGIN = "https://fazaa.example";
const DEV = "dev@fazaa.example";
const ENV = {
  MESSAGE_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
  ALLOWED_ORIGINS: ORIGIN,
  DEVELOPER_EMAILS: DEV,
};

function world() {
  const store = createMemoryStore();
  let clock = 1_000_000;
  const call = async (method, path, { body, as } = {}) => {
    const res = await handleRequest(
      new Request(`https://fazaa.example/api${path}`, {
        method,
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      ENV,
      { store, now: (clock += 1000), staffEmail: async () => as ?? null },
    );
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { store, call };
}

test("profile validation", () => {
  const p = applyProfile(emptyProfile(), {
    specialty: " نفقة <b> ",
    years: 8,
    regions: ["ps-gaza", "x"],
    phone: "+970 599",
  });
  assert.equal(p.specialty, "نفقة b");
  assert.deepEqual(p.regions, ["ps-gaza"]);
  assert.throws(() => applyProfile(p, { years: -1 }), /bad-years/);
  assert.throws(() => applyProfile(p, { regions: [] }), /bad-regions/);
  assert.throws(() => applyProfile(p, { phone: "call" }), /bad-phone/);
  assert.throws(() => applyProfile(p, { maxCases: 0 }), /bad-max-cases/);
});

test("public card: only active, available and below the case limit; never email or phone", () => {
  const s = { email: "a@x.org", name: "سلمى", code: "S-002", active: true };
  const p = applyProfile(emptyProfile(), { available: true, phone: "0599", maxCases: 2 });
  const card = publicLawyer(s, p, 1);
  assert.equal(card.name, "سلمى");
  assert.ok(!("phone" in card) && !("email" in card));
  assert.equal(publicLawyer(s, p, 2), null, "full");
  assert.equal(publicLawyer({ ...s, active: false }, p, 0), null, "suspended");
  assert.equal(publicLawyer(s, { ...p, available: false }, 0), null, "unavailable");
});

test("developer adds a lawyer and makes her manager; the manager manages lawyers; plain lawyers cannot", async () => {
  const w = world();
  const add = await w.call("POST", "/v1/staff/lawyers", {
    as: DEV,
    body: { email: "boss@x.org", name: "منى", specialty: "إدارة", manager: true },
  });
  assert.equal(add.status, 200);
  assert.ok(add.body.tempPassword, "a temporary password is shown once");
  assert.equal(add.body.lawyers[0].manager, true);

  // the manager adds a lawyer with her contact number, but cannot make anyone a manager
  const m = await w.call("POST", "/v1/staff/lawyers", {
    as: "boss@x.org",
    body: {
      email: "salma@x.org",
      name: "سلمى أحمد",
      phone: "0599123456",
      regions: ["ps-wb"],
      available: true,
      manager: true,
    },
  });
  assert.equal(m.status, 200);
  const salma = m.body.lawyers.find((l) => l.email === "salma@x.org");
  assert.equal(salma.name, "سلمى");
  assert.equal(salma.phone, "0599123456");
  assert.equal(salma.manager, false, "manager flag ignored when set by a manager");
  assert.equal(m.body.canSetManager, false);

  // a plain lawyer cannot see or change the list
  assert.equal((await w.call("GET", "/v1/staff/lawyers", { as: "salma@x.org" })).status, 403);
  assert.equal(
    (
      await w.call("PUT", "/v1/staff/lawyers", {
        as: "salma@x.org",
        body: { email: "boss@x.org", available: true },
      })
    ).status,
    403,
  );
  // the manager switches her off
  const off = await w.call("PUT", "/v1/staff/lawyers", {
    as: "boss@x.org",
    body: { email: "salma@x.org", available: false },
  });
  assert.equal(off.body.lawyers.find((l) => l.email === "salma@x.org").available, false);
  // and cannot turn a developer into a lawyer
  assert.equal(
    (await w.call("POST", "/v1/staff/lawyers", { as: "boss@x.org", body: { email: DEV, name: "x" } })).status,
    409,
  );
  assert.ok((await w.store.listAudit(50)).some((a) => a.action === "lawyer-update"));
});

test("a lawyer switches herself available; the app lists her by region without email or phone", async () => {
  const w = world();
  await w.call("POST", "/v1/staff/lawyers", {
    as: DEV,
    body: {
      email: "salma@x.org",
      name: "سلمى",
      specialty: "نفقة وحضانة",
      years: 12,
      regions: ["ps-wb"],
      phone: "0599",
    },
  });
  assert.deepEqual((await w.call("GET", "/v1/lawyers")).body.lawyers, [], "not available yet");

  const me = await w.call("PUT", "/v1/staff/profile", {
    as: "salma@x.org",
    body: { available: true, maxCases: 40, manager: true },
  });
  assert.equal(me.body.profile.available, true);
  assert.equal(me.body.profile.maxCases, 5, "a lawyer cannot raise her own limit");
  assert.equal(me.body.profile.manager, false, "nor make herself manager");
  assert.equal((await w.call("GET", "/v1/staff/me", { as: "salma@x.org" })).body.available, true);

  const list = (await w.call("GET", "/v1/lawyers?region=ps-wb")).body.lawyers;
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), [
    "avatar",
    "bio",
    "id",
    "name",
    "regions",
    "specialty",
    "years",
  ]);
  assert.deepEqual((await w.call("GET", "/v1/lawyers?region=ps-gaza")).body.lawyers, []);

  // suspended by the developer: gone from the app at once
  await w.call("PUT", "/v1/staff/team", {
    as: DEV,
    body: { email: "salma@x.org", role: "lawyer", name: "سلمى", active: false },
  });
  assert.deepEqual((await w.call("GET", "/v1/lawyers")).body.lawyers, []);
});
