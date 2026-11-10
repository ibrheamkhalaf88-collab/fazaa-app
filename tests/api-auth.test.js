import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { clearJwksCache, resolveStaff, verifyAccessJwt } from "../server/api/auth.js";
import { toBase64Url } from "../server/api/crypto.js";
import { createMemoryStore } from "../server/api/store/memory.js";

const TEAM = "team.cloudflareaccess.com";
const ENV = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: "aud123" };
const NOW = 1_700_000_000_000;
const enc = (o) => toBase64Url(new TextEncoder().encode(JSON.stringify(o)));

let pair, jwk;
beforeEach(async () => {
  clearJwksCache();
  pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
});

async function sign(payload, { kid = "k1", alg = "RS256", key = pair.privateKey } = {}) {
  const head = enc({ alg, kid });
  const body = enc(payload);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${toBase64Url(sig)}`;
}
const good = (over = {}) => ({
  aud: ["aud123"],
  iss: `https://${TEAM}`,
  exp: NOW / 1000 + 600,
  email: "Salma@Sanad.Example",
  ...over,
});
const fetchImpl = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const verify = (token, env = ENV) => verifyAccessJwt(token, env, { fetchImpl, now: NOW });

test("accepts a valid token and lower-cases the email", async () => {
  assert.equal(await verify(await sign(good())), "salma@sanad.example");
});

test("rejects: wrong audience, wrong issuer, expired, unknown key id, bad signature, alg none, missing config", async () => {
  assert.equal(await verify(await sign(good({ aud: ["other"] }))), null);
  assert.equal(await verify(await sign(good({ iss: "https://evil.example" }))), null);
  assert.equal(await verify(await sign(good({ exp: NOW / 1000 - 1 }))), null);
  assert.equal(await verify(await sign(good(), { kid: "zzz" })), null);

  const other = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  assert.equal(await verify(await sign(good(), { key: other.privateKey })), null);

  const none = `${enc({ alg: "none", kid: "k1" })}.${enc(good())}.`;
  assert.equal(await verify(none), null);
  assert.equal(await verify(await sign(good()), {}), null);
  assert.equal(await verify(null), null);
  assert.equal(await verify("a.b"), null);
});

test("roles: staff table wins; DEVELOPER_EMAILS bootstraps; strangers get nothing", async () => {
  const store = createMemoryStore();
  await store.upsertStaff({ email: "l@x.org", role: "lawyer", name: "ليلى", now: 1 });
  const env = { DEVELOPER_EMAILS: "Dev@x.org, other@x.org" };
  assert.deepEqual(await resolveStaff("l@x.org", env, store), {
    email: "l@x.org",
    role: "lawyer",
    name: "ليلى",
  });
  assert.equal((await resolveStaff("dev@x.org", env, store)).role, "developer");
  assert.equal(await resolveStaff("nobody@x.org", env, store), null);
  assert.equal(await resolveStaff(null, env, store), null);
});
