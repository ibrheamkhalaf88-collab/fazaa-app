/**
 * Staff sign-in: email + password, checked by the Worker itself.
 *
 *  - Passwords are stored only as salted PBKDF2-SHA256 hashes (table staff_auth).
 *  - 5 wrong passwords lock the account for 15 minutes.
 *  - The owner creates each account with a TEMPORARY password; the member must change it at first
 *    sign-in. A forgotten password is reset by a developer (new temporary password). No emails.
 *  - The session is a random token in an HttpOnly, Secure, SameSite=Strict cookie scoped to
 *    /api/v1/staff; only its SHA-256 is stored (table staff_sessions).
 *
 * ROLES (see resolveStaff):
 *   "lawyer"    sees the waiting queue (topic + region only), claims a case, then reads
 *               and answers THAT case only.
 *   "developer" sees system health / counts and manages staff. Never case content.
 */

export const STAFF_COOKIE = "fz_staff";
export const STAFF_SESSION_MS = 12 * 3_600_000;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/** The value of one cookie, or "". */
export function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

/** Set-Cookie for the staff session; maxAgeSec 0 clears it. */
export const sessionCookie = (token, maxAgeSec) =>
  `${STAFF_COOKIE}=${token}; Path=/api/v1/staff; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;

// no look-alike characters (0/O, 1/l/I), so it can be read out over the phone
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random 14-character temporary password (about 80 bits). */
export function tempPassword(length = 14) {
  const out = [];
  const limit = 256 - (256 % ALPHABET.length); // reject bytes that would bias the choice
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join("");
}

/** null when the new password is acceptable, else an error code. */
export function passwordProblem(password, email) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) return "password-too-short";
  if (password.length > PASSWORD_MAX) return "password-too-long";
  if (password.toLowerCase() === String(email).toLowerCase()) return "password-is-email";
  if (new Set(password).size < 4) return "password-too-simple";
  return null;
}

/**
 * Role of a signed-in email: the staff table first; DEVELOPER_EMAILS (a Worker variable) is a
 * bootstrap for the local dev server and tests only (a real sign-in needs a staff_auth row).
 * @returns {Promise<{email:string, role:"lawyer"|"developer", name:string}|null>}
 */
export async function resolveStaff(email, env, store) {
  if (!email) return null;
  const row = await store.getStaff(email);
  if (row)
    return row.active === false
      ? null
      : { email, role: row.role, name: row.name || "", code: row.code || "" };
  const boot = (env.DEVELOPER_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return boot.includes(email) ? { email, role: "developer", name: "" } : null;
}
