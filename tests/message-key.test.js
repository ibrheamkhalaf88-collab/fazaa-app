import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMessageKey, decryptText, encryptText, toBase64 } from "../server/api/crypto.js";

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)));

test("MESSAGE_KEY pasted with a BOM, quotes or line breaks still works, and decrypts the same", async () => {
  const sealed = await encryptText("سلام", KEY);
  const BOM = String.fromCharCode(0xfeff);
  for (const messy of [BOM + KEY, `"${KEY}"`, `${KEY}\r\n`, ` ${KEY} `]) {
    assert.equal(await decryptText(sealed, messy), "سلام");
    assert.deepEqual(await checkMessageKey(messy), { ok: true, error: null });
  }
});

test("checkMessageKey reports a bad or missing key without revealing it", async () => {
  assert.deepEqual(await checkMessageKey(""), { ok: false, error: "MESSAGE_KEY must be 32 bytes, base64" });
  assert.deepEqual(await checkMessageKey(toBase64(new Uint8Array(16))), {
    ok: false,
    error: "MESSAGE_KEY must be 32 bytes, base64",
  });
  assert.equal((await checkMessageKey(undefined)).ok, false);
});
