/**
 * Small crypto helpers (WebCrypto only, so they run in Workers and in Node tests).
 *  - message bodies are encrypted at rest with AES-256-GCM (key = Worker secret MESSAGE_KEY);
 *  - a woman's case token is random, and only its SHA-256 hash is stored.
 */
const te = new TextEncoder();
const td = new TextDecoder();

export const toBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const toBase64Url = (buf) => toBase64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromBase64Url = (s) =>
  fromBase64(
    s
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(s.length / 4) * 4, "="),
  );

export const randomId = (bytes = 12) => toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", te.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compare two equal-purpose strings without leaking where they differ. */
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function aesKey(base64Key) {
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) throw new Error("MESSAGE_KEY must be 32 bytes, base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** @returns {Promise<{iv: string, body: string}>} */
export async function encryptText(text, base64Key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(base64Key), te.encode(text));
  return { iv: toBase64(iv), body: toBase64(body) };
}

export async function decryptText({ iv, body }, base64Key) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    await aesKey(base64Key),
    fromBase64(body),
  );
  return td.decode(plain);
}

/** PIN hash: PBKDF2-SHA256, per-user salt. (Workers cap PBKDF2 at 100k iterations.) */
export async function hashPin(pin, saltB64) {
  const key = await crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(saltB64), iterations: 100_000 },
    key,
    256,
  );
  return toBase64(bits);
}
export const newSalt = () => toBase64(crypto.getRandomValues(new Uint8Array(16)));
