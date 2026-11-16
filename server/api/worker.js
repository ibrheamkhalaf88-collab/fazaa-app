/**
 * Fazaa staff API (Cloudflare Worker + D1).
 *
 *  Women (alias + 6-digit PIN): sign up when she asks for a lawyer, then open/read/write her own cases.
 *                      Name + phone are encrypted and shown only to the lawyer who claimed the case.
 *  Lawyers:            see the queue (topic + region only), claim a case, answer it, close it.
 *  Developers:         system counts, staff, health; READ every conversation (owner's decision,
 *                      2026-11-11): read-only, each opening audited, never her name or phone.
 *
 * Privacy rules enforced here (each has a test in tests/api.test.js):
 *   - bodies, names and phones are encrypted before storage; no IP / user-agent is stored;
 *   - PINs are salted PBKDF2 hashes; 5 wrong PINs lock the account for 15 minutes;
 *   - a lawyer can read only the case she claimed; developers can read any case but not write to it;
 *   - closed cases are deleted after RETENTION_CLOSED_DAYS, idle ones after RETENTION_IDLE_DAYS.
 *
 * Staff sign in with email + password (see auth.js): salted PBKDF2 hashes, lockout after 5 wrong
 * tries, temporary passwords that must be changed, HttpOnly SameSite=Strict session cookie.
 */
import { createD1Store } from "./store/d1.js";
import { decryptText, encryptText } from "./crypto.js";
import { applyProfile, emptyProfile } from "../../src/data/lawyers.js";
import { DEFAULT_CONTACTS, validateContacts } from "../../src/data/contacts.js";
import { CONTACTS_SETTING, corsHeaders, DAY, fail, LAWYERS_SETTING, RATE_LIMITED } from "./shared.js";
import { publicRoutes } from "./routes/public.js";
import { staffRoutes } from "./routes/staff.js";
import { womenRoutes } from "./routes/women.js";

export { weakPin } from "./shared.js";

/**
 * What every route file receives (built once per request in handleRequest).
 * @typedef {{request: Request, env: Record<string, any>, deps: any, url: URL, path: string,
 *   m: (re: RegExp) => RegExpMatchArray | null, store: any, fetchImpl: typeof fetch, now: number,
 *   reply: (res: Response) => Response, seal: (text: string) => Promise<any>, open: (row: any) => Promise<string>,
 *   loadContacts: () => Promise<any>, loadProfiles: () => Promise<Record<string, any>>,
 *   saveProfiles: (all: Record<string, any>, by: string) => Promise<any>, profileOf: (all: any, email: string) => any}} RouteContext
 */

/**
 * @param {Request} request
 * @param {Record<string,string> & {RATE_LIMITER?: any}} env
 * @param {{store: ReturnType<typeof import("./store/memory.js").createMemoryStore>, fetchImpl?: typeof fetch, now?: number, staffEmail?: (r: Request)=>Promise<string|null>}} deps
 */
export async function handleRequest(request, env, deps) {
  const { store, fetchImpl = fetch } = deps;
  const now = deps.now ?? Date.now();

  const cors = corsHeaders(request, env);
  if (cors === null) return fail(403, "forbidden-origin");
  const reply = (res) => {
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  };
  if (request.method === "OPTIONS") return reply(new Response(null, { status: 204 }));

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");
  const m = (re) => path.match(re);

  // Per-IP limit on the public endpoints that cost money or can be abused (AI, sign-up, sign-in,
  // counters). Message polling is not limited: many women can share one IP (mobile carriers).
  if (env.RATE_LIMITER && request.method === "POST" && RATE_LIMITED.includes(path)) {
    const ip = request.headers.get("cf-connecting-ip") || "anonymous";
    const { success } = await env.RATE_LIMITER.limit({ key: `${ip}|${path}` });
    if (!success) return reply(fail(429, "rate-limited"));
  }
  if (!env.MESSAGE_KEY) return reply(fail(503, "not-configured"));

  const seal = (text) => encryptText(text, env.MESSAGE_KEY);
  const open = (row) => decryptText(row, env.MESSAGE_KEY);

  /** The contacts list the owner saved, or the built-in defaults. */
  const loadContacts = async () => {
    const row = await store.getSetting(CONTACTS_SETTING);
    if (!row) return { contacts: DEFAULT_CONTACTS, updatedAt: null, updatedBy: null, custom: false };
    try {
      return {
        contacts: validateContacts(JSON.parse(await open(row))),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
        custom: true,
      };
    } catch {
      return { contacts: DEFAULT_CONTACTS, updatedAt: null, updatedBy: null, custom: false };
    }
  };

  /** Lawyer profiles, one encrypted setting: { email: LawyerProfile }. */
  const loadProfiles = async () => {
    const row = await store.getSetting(LAWYERS_SETTING);
    if (!row) return {};
    try {
      return JSON.parse(await open(row)) || {};
    } catch {
      return {};
    }
  };
  const saveProfiles = async (all, by) =>
    store.setSetting({ key: LAWYERS_SETTING, ...(await seal(JSON.stringify(all))), now, by });
  const profileOf = (all, email) => applyProfile(all[email] || emptyProfile(), {});

  const ctx = {
    request,
    env,
    deps,
    url,
    path,
    m,
    store,
    fetchImpl,
    now,
    reply,
    seal,
    open,
    loadContacts,
    loadProfiles,
    saveProfiles,
    profileOf,
  };
  // public first, then staff (/v1/staff/*), then the women's account routes; a route returns a Response or nothing
  return (
    (await publicRoutes(ctx)) ??
    (await staffRoutes(ctx)) ??
    (await womenRoutes(ctx)) ??
    reply(fail(404, "not-found"))
  );
}

export async function purgeExpired(env, store, now = Date.now()) {
  const closedMs = Number(env.RETENTION_CLOSED_DAYS || 7) * DAY;
  const idleMs = Number(env.RETENTION_IDLE_DAYS || 30) * DAY;
  const userIdleMs = Number(env.RETENTION_USER_DAYS || 180) * DAY;
  const n = await store.purge(now, { closedMs, idleMs, userIdleMs });
  await store.addAudit({ actor: "system", action: "purge", target: `${n} cases`, now });
  return n;
}

export default {
  fetch: (request, env) => handleRequest(request, env, { store: createD1Store(env.DB) }),
  /** Daily cron (see wrangler.toml): enforces the retention rules. */
  scheduled: (_event, env, ctx) => ctx.waitUntil(purgeExpired(env, createD1Store(env.DB))),
};
