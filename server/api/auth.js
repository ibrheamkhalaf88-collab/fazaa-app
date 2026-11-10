import { fromBase64Url } from "./crypto.js";

/**
 * Staff sign-in is handled by Cloudflare Access (free for up to 50 users): it puts the
 * staff member through email one-time-PIN / SSO and forwards a signed JWT in the
 * `Cf-Access-Jwt-Assertion` header. We do NOT store passwords. Here we only verify
 * that JWT (signature, audience, issuer, expiry) and read the verified email.
 *
 * ROLES (see resolveRole):
 *   "lawyer"    sees the waiting queue (topic + region only), claims a case, then reads
 *               and answers THAT case only.
 *   "developer" sees system health / counts and manages staff. Never case content.
 */

const td = new TextDecoder();
const jwksCache = new Map(); // teamDomain -> { keys, at }
const JWKS_TTL_MS = 10 * 60 * 1000;

async function getJwks(teamDomain, fetchImpl, now) {
  const hit = jwksCache.get(teamDomain);
  if (hit && now - hit.at < JWKS_TTL_MS) return hit.keys;
  const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("jwks-unavailable");
  const { keys } = await res.json();
  jwksCache.set(teamDomain, { keys, at: now });
  return keys;
}

export const clearJwksCache = () => jwksCache.clear();

/**
 * @returns {Promise<string|null>} the verified, lower-cased email, or null if anything is off
 */
export async function verifyAccessJwt(token, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const header = JSON.parse(td.decode(fromBase64Url(h)));
    const payload = JSON.parse(td.decode(fromBase64Url(p)));
    if (header.alg !== "RS256") return null;

    const keys = await getJwks(env.ACCESS_TEAM_DOMAIN, fetchImpl, now);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      fromBase64Url(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;

    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < now) return null;
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Role of a verified email: the staff table first; DEVELOPER_EMAILS (a Worker variable) is
 * the bootstrap so the first developer can add everyone else.
 * @returns {Promise<{email:string, role:"lawyer"|"developer", name:string}|null>}
 */
export async function resolveStaff(email, env, store) {
  if (!email) return null;
  const row = await store.getStaff(email);
  if (row) return { email, role: row.role, name: row.name || "" };
  const boot = (env.DEVELOPER_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return boot.includes(email) ? { email, role: "developer", name: "" } : null;
}
