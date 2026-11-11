import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CONTACTS, contactsFor, numberOf, validateContacts } from "../src/data/contacts.js";
import { detectDanger } from "../src/ai/danger.js";
import { createAnswerer } from "../src/ai/answerer.js";
import { handleRequest } from "../server/api/worker.js";
import { createMemoryStore } from "../server/api/store/memory.js";
import { toBase64 } from "../server/api/crypto.js";

const ORIGIN = "https://fazaa.example";
const ENV = {
  MESSAGE_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
  ALLOWED_ORIGINS: ORIGIN,
  DEVELOPER_EMAILS: "dev@fazaa.example",
};

function world() {
  const store = createMemoryStore();
  let clock = 1_000_000;
  const call = (method, path, { body, as } = {}) =>
    handleRequest(
      new Request(`https://fazaa.example/api${path}`, {
        method,
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      ENV,
      { store, now: (clock += 1000), staffEmail: async () => as ?? null },
    );
  return { store, call };
}

test("validateContacts cleans input and rejects bad numbers, categories and empty names", () => {
  const [c] = validateContacts([
    { id: "x y<>", cat: "law", name: "  جمعية <b>نسوية</b> ", phone: "+970 59-123", region: "mars" },
  ]);
  assert.equal(c.name, "جمعية b نسوية /b");
  assert.equal(c.phone, "+970 59-123");
  assert.equal(c.region, "all");
  assert.match(c.id, /^xy$/);
  assert.throws(() => validateContacts([{ cat: "law", name: "x", phone: "call me" }]), /bad-phone/);
  assert.throws(() => validateContacts([{ cat: "other", name: "x" }]), /bad-cat/);
  assert.throws(() => validateContacts([{ cat: "law", name: " " }]), /name-required/);
  assert.throws(
    () => validateContacts(Array.from({ length: 31 }, () => ({ cat: "law", name: "x" }))),
    /too-many/,
  );
});

test("region filter and special numbers", () => {
  const list = validateContacts([
    { id: "police", cat: "emergency", name: "شرطة", phone: "100" },
    { id: "g", cat: "law", name: "غزة فقط", region: "ps-gaza" },
  ]);
  assert.deepEqual(
    contactsFor(list, "ps-wb").map((c) => c.id),
    ["police"],
  );
  assert.equal(contactsFor(list, "ps-gaza").length, 2);
  assert.equal(numberOf(list, "police"), "100");
  assert.equal(numberOf(list, "ambulance"), "");
});

test("emergency replies use the numbers from the list, and drop a removed one cleanly", async () => {
  const d = detectDanger("ضربني وخايفة يرجع", { police: "112", ambulance: "" });
  assert.match(d.answer.steps[0], /بالشرطة 112 أو/);
  const noNum = detectDanger("ضربني وخايفة يرجع", { police: "", ambulance: "" });
  assert.match(noNum.answer.steps[0], /بالشرطة أو/);
  const a = await createAnswerer({ emergencyNumbers: () => ({ police: "999", ambulance: "998" }) }).answer(
    "بدي أموت",
    { country: "ps-wb" },
  );
  assert.match(a.steps[0], /998/);
});

test("API: public list falls back to defaults; only a developer can edit; edits are audited and reach the app", async () => {
  const w = world();
  const pub = await (await w.call("GET", "/v1/contacts")).json();
  assert.deepEqual(pub.contacts, DEFAULT_CONTACTS);

  const next = [
    { id: "police", cat: "emergency", name: "الشرطة", phone: "100" },
    { cat: "mind", name: "خط دعم", phone: "121", desc: "مجاني" },
  ];
  assert.equal((await w.call("PUT", "/v1/staff/contacts", { body: { contacts: next } })).status, 401);
  await w.call("PUT", "/v1/staff/team", {
    as: "dev@fazaa.example",
    body: { email: "l@fazaa.example", role: "lawyer", name: "ليلى" },
  });
  assert.equal(
    (await w.call("PUT", "/v1/staff/contacts", { as: "l@fazaa.example", body: { contacts: next } })).status,
    403,
  );
  const bad = await w.call("PUT", "/v1/staff/contacts", {
    as: "dev@fazaa.example",
    body: { contacts: [{ cat: "law", name: "x", phone: "abc" }] },
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "bad-phone");

  const saved = await (
    await w.call("PUT", "/v1/staff/contacts", { as: "dev@fazaa.example", body: { contacts: next } })
  ).json();
  assert.equal(saved.custom, true);
  assert.equal(saved.contacts.length, 2);
  const after = await (await w.call("GET", "/v1/contacts")).json();
  assert.equal(after.contacts[1].phone, "121");
  assert.ok((await w.store.listAudit(20)).some((a) => a.action === "contacts-set"));

  const reset = await (await w.call("DELETE", "/v1/staff/contacts", { as: "dev@fazaa.example" })).json();
  assert.equal(reset.custom, false);
  assert.deepEqual(reset.contacts, DEFAULT_CONTACTS);
});
