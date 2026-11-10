import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordProblem, readCookie, resolveStaff, sessionCookie, tempPassword } from "../server/api/auth.js";
import { createMemoryStore } from "../server/api/store/memory.js";

test("temporary passwords: 14 characters, no look-alikes, different every time", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = tempPassword();
    assert.equal(p.length, 14);
    assert.match(p, /^[a-km-np-zA-HJ-NP-Z2-9]+$/);
    seen.add(p);
  }
  assert.equal(seen.size, 200);
});

test("password rules", () => {
  assert.equal(passwordProblem("short", "a@b.c"), "password-too-short");
  assert.equal(passwordProblem("x".repeat(201), "a@b.c"), "password-too-long");
  assert.equal(passwordProblem("aaaaaaaaaaaa", "a@b.c"), "password-too-simple");
  assert.equal(passwordProblem("Lawyer@x.org", "lawyer@x.org"), "password-is-email");
  assert.equal(passwordProblem("zeitoun-2026!", "a@b.c"), null);
  assert.equal(passwordProblem(undefined, "a@b.c"), "password-too-short");
});

test("session cookie is HttpOnly, Secure, SameSite=Strict and scoped to the staff API", () => {
  const c = sessionCookie("tok", 60);
  for (const part of ["fz_staff=tok", "HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1/staff", "Max-Age=60"])
    assert.ok(c.includes(part), part);
  const req = new Request("https://x.example/", { headers: { cookie: "a=1; fz_staff=abc=; b=2" } });
  assert.equal(readCookie(req, "fz_staff"), "abc=");
  assert.equal(readCookie(req, "nope"), "");
});

test("roles: staff table wins; DEVELOPER_EMAILS bootstraps; strangers get nothing", async () => {
  const store = createMemoryStore();
  await store.upsertStaff({ email: "l@x.org", role: "lawyer", name: "ليلى", now: 1 });
  const env = { DEVELOPER_EMAILS: "Dev@x.org, other@x.org" };
  assert.deepEqual(await resolveStaff("l@x.org", env, store), {
    email: "l@x.org",
    role: "lawyer",
    name: "ليلى",
    code: "S-001",
  });
  assert.equal((await resolveStaff("dev@x.org", env, store)).role, "developer");
  assert.equal(await resolveStaff("nobody@x.org", env, store), null);
  assert.equal(await resolveStaff(null, env, store), null);
});
