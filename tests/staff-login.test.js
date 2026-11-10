import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRequest } from "../server/api/worker.js";
import { createMemoryStore } from "../server/api/store/memory.js";
import { hashPin, newSalt, toBase64 } from "../server/api/crypto.js";

const ORIGIN = "https://fazaa.example";
const ENV = { MESSAGE_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ALLOWED_ORIGINS: ORIGIN };
const OWNER = "owner@fazaa.example";
const OWNER_PW = "first-owner-pw";

/** A store with one developer whose password is OWNER_PW (temporary, must change). */
async function world() {
  const store = createMemoryStore();
  await store.upsertStaff({ email: OWNER, role: "developer", name: "", now: 1 });
  const salt = newSalt();
  await store.setStaffPassword(OWNER, { salt, hash: await hashPin(OWNER_PW, salt), mustChange: true, now: 1 });
  let clock = 1_000_000;
  const call = async (method, path, { body, cookie, origin = ORIGIN } = {}) =>
    handleRequest(
      new Request(`https://fazaa.example/api${path}`, {
        method,
        headers: {
          ...(origin ? { origin } : {}),
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      ENV,
      { store, now: (clock += 1000) },
    );
  const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];
  const login = async (email, password) => call("POST", "/v1/staff/login", { body: { email, password } });
  return { store, call, cookieOf, login, tick: (ms) => (clock += ms) };
}

test("no cookie, no access; a wrong password and an unknown email get the same answer", async () => {
  const w = await world();
  assert.equal((await w.call("GET", "/v1/staff/me")).status, 401);
  const wrong = await w.login(OWNER, "nope-nope-nope");
  const unknown = await w.login("who@x.org", "nope-nope-nope");
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
  assert.equal(wrong.headers.get("set-cookie"), null);
});

test("temporary password: sign in, nothing allowed until it is changed, then full access", async () => {
  const w = await world();
  const res = await w.login(OWNER, OWNER_PW);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, mustChange: true });
  const cookie = w.cookieOf(res);
  assert.match(res.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);

  assert.equal((await (await w.call("GET", "/v1/staff/me", { cookie })).json()).mustChange, true);
  assert.equal((await w.call("GET", "/v1/staff/stats", { cookie })).status, 403);

  // wrong current password / weak new password are refused
  let r = await w.call("POST", "/v1/staff/password", { cookie, body: { current: "bad", next: "a-good-new-pass" } });
  assert.equal(r.status, 400);
  r = await w.call("POST", "/v1/staff/password", { cookie, body: { current: OWNER_PW, next: "short" } });
  assert.equal((await r.json()).error, "password-too-short");

  r = await w.call("POST", "/v1/staff/password", { cookie, body: { current: OWNER_PW, next: "a-good-new-pass" } });
  assert.equal(r.status, 200);
  const fresh = w.cookieOf(r);
  // the old session was signed out; the new one works fully
  assert.equal((await w.call("GET", "/v1/staff/me", { cookie })).status, 401);
  assert.equal((await w.call("GET", "/v1/staff/stats", { cookie: fresh })).status, 200);
  // and the old password no longer works
  assert.equal((await w.login(OWNER, OWNER_PW)).status, 401);
  assert.equal((await w.login(OWNER, "a-good-new-pass")).status, 200);
});

test("5 wrong passwords lock the account for 15 minutes, even for the right password", async () => {
  const w = await world();
  for (let i = 0; i < 5; i++) assert.equal((await w.login(OWNER, `wrong-${i}-xxxx`)).status, 401);
  assert.equal((await w.login(OWNER, OWNER_PW)).status, 429);
  w.tick(16 * 60_000);
  assert.equal((await w.login(OWNER, OWNER_PW)).status, 200);
});

test("logout ends the session", async () => {
  const w = await world();
  const cookie = w.cookieOf(await w.login(OWNER, OWNER_PW));
  const out = await w.call("POST", "/v1/staff/logout", { cookie });
  assert.equal(out.status, 204);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await w.call("GET", "/v1/staff/me", { cookie })).status, 401);
});

test("state-changing staff calls without an Origin header are refused", async () => {
  const w = await world();
  const res = await w.call("POST", "/v1/staff/login", { origin: null, body: { email: OWNER, password: OWNER_PW } });
  assert.equal(res.status, 403);
});

/** Owner with a real (changed) password, signed in. */
async function signedInOwner() {
  const w = await world();
  const first = w.cookieOf(await w.login(OWNER, OWNER_PW));
  const r = await w.call("POST", "/v1/staff/password", {
    cookie: first,
    body: { current: OWNER_PW, next: "owner-real-pass" },
  });
  return { ...w, cookie: w.cookieOf(r) };
}

test("adding a member returns a temporary password once; the member can sign in with it", async () => {
  const w = await signedInOwner();
  const add = await w.call("PUT", "/v1/staff/team", {
    cookie: w.cookie,
    body: { email: "Lawyer@Fazaa.example", role: "lawyer", name: "سلمى" },
  });
  const { tempPassword } = await add.json();
  assert.equal(tempPassword.length, 14);
  // editing her later does not hand out a new password
  const edit = await w.call("PUT", "/v1/staff/team", {
    cookie: w.cookie,
    body: { email: "lawyer@fazaa.example", role: "lawyer", name: "سلمى" },
  });
  assert.equal((await edit.json()).tempPassword, undefined);

  const res = await w.login("lawyer@fazaa.example", tempPassword);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).mustChange, true);
});

test("suspending signs the member out and blocks sign-in; reset gives a new temporary password", async () => {
  const w = await signedInOwner();
  const { tempPassword } = await (
    await w.call("PUT", "/v1/staff/team", {
      cookie: w.cookie,
      body: { email: "l@fazaa.example", role: "lawyer", name: "ليلى" },
    })
  ).json();
  const lawyer = w.cookieOf(await w.login("l@fazaa.example", tempPassword));
  assert.equal((await w.call("GET", "/v1/staff/me", { cookie: lawyer })).status, 200);

  await w.call("PUT", "/v1/staff/team", {
    cookie: w.cookie,
    body: { email: "l@fazaa.example", role: "lawyer", name: "ليلى", active: false },
  });
  assert.equal((await w.call("GET", "/v1/staff/me", { cookie: lawyer })).status, 401);
  assert.equal((await w.login("l@fazaa.example", tempPassword)).status, 401);

  await w.call("PUT", "/v1/staff/team", {
    cookie: w.cookie,
    body: { email: "l@fazaa.example", role: "lawyer", name: "ليلى", active: true },
  });
  const reset = await (
    await w.call("POST", "/v1/staff/team/reset", { cookie: w.cookie, body: { email: "l@fazaa.example" } })
  ).json();
  assert.notEqual(reset.tempPassword, tempPassword);
  assert.equal((await w.login("l@fazaa.example", tempPassword)).status, 401);
  assert.equal((await w.login("l@fazaa.example", reset.tempPassword)).status, 200);
  // you cannot reset your own password this way
  const self = await w.call("POST", "/v1/staff/team/reset", { cookie: w.cookie, body: { email: OWNER } });
  assert.equal(self.status, 400);
});

test("a lawyer cannot reset passwords, delete users or read system health", async () => {
  const w = await signedInOwner();
  const { tempPassword } = await (
    await w.call("PUT", "/v1/staff/team", {
      cookie: w.cookie,
      body: { email: "l@fazaa.example", role: "lawyer", name: "ليلى" },
    })
  ).json();
  const first = w.cookieOf(await w.login("l@fazaa.example", tempPassword));
  const lawyer = w.cookieOf(
    await w.call("POST", "/v1/staff/password", {
      cookie: first,
      body: { current: tempPassword, next: "lawyer-real-pass" },
    }),
  );
  assert.equal((await w.call("GET", "/v1/staff/health", { cookie: lawyer })).status, 403);
  assert.equal((await w.call("DELETE", "/v1/staff/users/abc", { cookie: lawyer })).status, 403);
  const r = await w.call("POST", "/v1/staff/team/reset", { cookie: lawyer, body: { email: OWNER } });
  assert.equal(r.status, 403);
});

test("developer: health report and deleting a user account (never her name or phone)", async () => {
  const w = await signedInOwner();
  const health = await (await w.call("GET", "/v1/staff/health", { cookie: w.cookie })).json();
  assert.equal(health.db.ok, true);
  assert.equal(health.ai.configured, false);

  const up = await w.call("POST", "/v1/users", {
    body: { username: "noor_1", pin: "123456", name: "نور علي", phone: "0599000000", region: "ps-wb" },
  });
  assert.equal(up.status, 201);
  const list = await (await w.call("GET", "/v1/staff/users", { cookie: w.cookie })).json();
  const row = list.users.find((u) => u.username === "noor_1");
  assert.ok(row);
  assert.equal(JSON.stringify(list).includes("نور علي"), false);
  assert.equal(JSON.stringify(list).includes("0599000000"), false);

  const del = await w.call("DELETE", `/v1/staff/users/${row.id}`, { cookie: w.cookie });
  assert.equal(del.status, 200);
  const after = await (await w.call("GET", "/v1/staff/users", { cookie: w.cookie })).json();
  assert.equal(after.users.some((u) => u.username === "noor_1"), false);
});
