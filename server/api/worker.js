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
import { answerQuestion, LIMITS_FOR_QUESTION } from "../ai-proxy/worker.js";
import { DEFAULT_PROVIDER, PROVIDERS } from "../ai-proxy/providers.js";
import {
  passwordProblem,
  PASSWORD_MAX,
  readCookie,
  resolveStaff,
  sessionCookie,
  STAFF_COOKIE,
  STAFF_SESSION_MS,
  tempPassword,
} from "./auth.js";
import {
  checkMessageKey,
  decryptText,
  encryptText,
  hashPin,
  newSalt,
  randomId,
  safeEqual,
  sha256Hex,
} from "./crypto.js";
import { createD1Store } from "./store/d1.js";
import { scrub } from "./scrub.js";
import { EVENTS, normalizeTopic } from "./store/days.js";

const REGIONS = ["ps-wb", "ps-gaza"];
const LIMITS = {
  body: 8192,
  text: 2000,
  note: 4000,
  topic: 60,
  name: 30,
  email: 120,
  fullName: 60,
  phone: 20,
};
const SESSION_MS = 30 * 86_400_000;
const USERNAME_RE = /^[a-z0-9_\u0621-\u064a]{3,20}$/;
const PIN_RE = /^\d{6}$/;
const PHONE_RE = /^\+?\d{7,15}$/;
const DAY = 86_400_000;
const RATE_LIMITED = ["/v1/answer", "/v1/users", "/v1/login", "/v1/staff/login", "/v1/ping"];

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
const fail = (status, error) => json({ error }, status);

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

async function readJson(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > LIMITS.body) return { error: 413 };
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? { value } : { error: 400 };
  } catch {
    return { error: 400 };
  }
}

const cleanText = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const firstName = (s) => (s || "").trim().split(/\s+/)[0].slice(0, LIMITS.name);

/* ---------- AI settings (developer dashboard) ---------- */
const AI_SETTING = "ai";
const MODEL_RE = /^[\w.\-/:]{1,80}$/;
const API_KEY_RE = /^[\x21-\x7e]{20,400}$/; // visible ASCII only, no spaces
const aiProviders = () =>
  Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, defaultModel: p.defaultModel }));

/** The saved AI settings (decrypted) or null. */
async function loadAi(store, open) {
  const row = await store.getSetting(AI_SETTING);
  if (!row) return null;
  try {
    return { ...JSON.parse(await open(row)), updatedAt: row.updatedAt, updatedBy: row.updatedBy };
  } catch {
    return null; // MESSAGE_KEY changed: treat as not set
  }
}

/** env as the AI step expects it: dashboard settings win, Worker secrets are the fallback. */
function aiEnv(env, saved) {
  if (!saved) return env;
  return {
    ...env,
    PROVIDER: saved.provider,
    MODEL: saved.model || "",
    [PROVIDERS[saved.provider].keyName]: saved.apiKey,
  };
}

/** What the dashboard may know: never the key itself, only whether one exists and its last 4 characters. */
function aiSummary(env, saved) {
  const provider = saved?.provider || env.PROVIDER || DEFAULT_PROVIDER;
  const def = PROVIDERS[provider] || PROVIDERS[DEFAULT_PROVIDER];
  const key = saved?.apiKey || env[def.keyName] || "";
  return {
    provider,
    model: saved ? saved.model || "" : env.MODEL || "",
    defaultModel: def.defaultModel,
    hasKey: Boolean(key),
    keyHint: key ? `••••${key.slice(-4)}` : "",
    source: saved ? "dashboard" : key ? "secret" : "none",
    updatedAt: saved?.updatedAt ?? null,
    updatedBy: saved?.updatedBy ?? null,
    providers: aiProviders(),
  };
}

/**
 * Keep the AI's ANSWER (never the question) so lawyers can review it. Failure here must never
 * break the reply the woman is waiting for.
 */
async function keepAnswer(store, answer, region, env, now) {
  try {
    const { lead, steps, note, cites, sos, topic } = answer;
    await store.addAiAnswer({
      at: now,
      region,
      provider: env.PROVIDER || DEFAULT_PROVIDER,
      model: env.MODEL || PROVIDERS[env.PROVIDER || DEFAULT_PROVIDER].defaultModel,
      body: JSON.stringify({
        lead: scrub(lead),
        steps: steps.map(scrub),
        note: scrub(note),
        cites,
        sos,
        topic: topic || "",
      }),
    });
  } catch {
    /* the answer is still delivered */
  }
}

/**
 * Daily cap on AI calls, so nobody can burn the provider quota with forged requests.
 * Over the cap the app simply falls back to its offline rules.
 */
async function takeAiSlot(store, env, now) {
  const limit = Number(env.AI_DAILY_LIMIT || 3000);
  const day = new Date(now).toISOString().slice(0, 10);
  const row = await store.getSetting("ai-usage");
  const used = row && row.iv === day ? Number(row.body) || 0 : 0;
  if (used >= limit) return false;
  await store.setSetting({ key: "ai-usage", iv: day, body: String(used + 1), now, by: "system" });
  return true;
}

async function aiUsage(store, env, now) {
  const row = await store.getSetting("ai-usage");
  const day = new Date(now).toISOString().slice(0, 10);
  return {
    usedToday: row && row.iv === day ? Number(row.body) || 0 : 0,
    dailyLimit: Number(env.AI_DAILY_LIMIT || 3000),
  };
}

const parseAnswer = (row) => ({ ...row, body: undefined, answer: JSON.parse(row.body) });

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

  /* ============ public AI endpoint: the key is the one a developer saved in the dashboard ============ */
  if (path === "/v1/answer" && request.method === "POST") {
    if (!request.headers.get("origin")) return reply(fail(403, "forbidden-origin")); // browsers only
    const { value, error } = await readJson(request);
    const question = typeof value?.question === "string" ? value.question.trim() : "";
    if (error || question.length < LIMITS_FOR_QUESTION.min || question.length > LIMITS_FOR_QUESTION.max)
      return reply(fail(400, "bad-question"));
    const country = REGIONS.includes(value.country) ? value.country : "ps-wb";
    if (!(await takeAiSlot(store, env, now))) return reply(fail(429, "daily-limit"));
    const saved = await loadAi(store, open);
    const live = aiEnv(env, saved);
    const { status, body } = await answerQuestion(question, country, live, fetchImpl);
    if (body.answer) await keepAnswer(store, body.answer, country, live, now);
    return reply(json(body, status));
  }

  /* ============ staff routes (email + password session) ============ */
  if (path.startsWith("/v1/staff/")) {
    // State-changing calls must come from a page (the cookie is also SameSite=Strict).
    if (request.method !== "GET" && !request.headers.get("origin"))
      return reply(fail(403, "forbidden-origin"));

    const newSession = async (email) => {
      const token = randomId(32);
      await store.createStaffSession({
        tokenHash: await sha256Hex(token),
        email,
        now,
        expiresAt: now + STAFF_SESSION_MS,
      });
      return sessionCookie(token, Math.floor(STAFF_SESSION_MS / 1000));
    };
    const checkPassword = async (auth, password) =>
      typeof password === "string" &&
      password.length <= PASSWORD_MAX &&
      safeEqual(await hashPin(password, auth.salt), auth.hash);
    const setTemp = async (email) => {
      const password = tempPassword();
      const salt = newSalt();
      await store.setStaffPassword(email, {
        salt,
        hash: await hashPin(password, salt),
        mustChange: true,
        now,
      });
      await store.deleteStaffSessions(email);
      return password;
    };

    if (path === "/v1/staff/login" && request.method === "POST") {
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      const email = cleanText(value.email, LIMITS.email).toLowerCase();
      const member = email ? await store.getStaff(email) : null;
      const auth = member ? await store.getStaffAuth(email) : null;
      if (auth && auth.lockedUntil > now) return reply(fail(429, "locked"));
      let ok = false;
      if (auth) ok = (await checkPassword(auth, value.password)) && member.active !== false;
      else await hashPin("x", newSalt()); // same work either way, so timing does not reveal accounts
      if (auth) await store.noteStaffLogin(email, ok, now);
      // one answer for "no such account", "wrong password" and "suspended"
      if (!ok) return reply(fail(401, "bad-credentials"));
      await store.touchStaff(email, now);
      await store.addAudit({ actor: email, action: "staff-login", target: "", now });
      return reply(
        json({ ok: true, mustChange: auth.mustChange }, 200, { "set-cookie": await newSession(email) }),
      );
    }

    const token = deps.staffEmail ? "" : readCookie(request, STAFF_COOKIE);
    const tokenHash = token ? await sha256Hex(token) : "";
    const email = deps.staffEmail
      ? await deps.staffEmail(request)
      : tokenHash
        ? await store.getStaffSession(tokenHash, now)
        : null;
    const staff = await resolveStaff(email, env, store);

    if (path === "/v1/staff/logout" && request.method === "POST") {
      if (tokenHash) await store.deleteStaffSession(tokenHash);
      return reply(new Response(null, { status: 204, headers: { "set-cookie": sessionCookie("", 0) } }));
    }

    if (!staff) return reply(fail(401, "not-staff"));
    const need = (role) => (staff.role === role ? null : reply(fail(403, "wrong-role")));
    const auth = await store.getStaffAuth(staff.email);
    const mustChange = Boolean(auth?.mustChange) && !deps.staffEmail;

    if (path === "/v1/staff/me" && request.method === "GET") {
      await store.touchStaff(staff.email, now);
      return reply(
        json({ email: staff.email, role: staff.role, name: staff.name, code: staff.code || "", mustChange }),
      );
    }

    if (path === "/v1/staff/password" && request.method === "POST") {
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      if (!auth || !(await checkPassword(auth, value.current))) return reply(fail(400, "wrong-password"));
      const problem = passwordProblem(value.next, staff.email);
      if (problem) return reply(fail(400, problem));
      if (value.next === value.current) return reply(fail(400, "password-unchanged"));
      const salt = newSalt();
      await store.setStaffPassword(staff.email, {
        salt,
        hash: await hashPin(value.next, salt),
        mustChange: false,
        now,
      });
      await store.deleteStaffSessions(staff.email); // signs out every other device
      await store.addAudit({ actor: staff.email, action: "password-change", target: "", now });
      return reply(json({ ok: true }, 200, { "set-cookie": await newSession(staff.email) }));
    }

    // A temporary password allows nothing else until it is changed.
    if (mustChange) return reply(fail(403, "must-change-password"));

    /* ---- developer: system health ---- */
    if (path === "/v1/staff/health" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      const started = Date.now();
      let dbOk = true;
      try {
        await store.userStats(now, 1);
      } catch {
        dbOk = false;
      }
      const dbMs = Date.now() - started;
      let site = null;
      if (env.PUBLIC_SITE_URL) {
        const t = Date.now();
        try {
          const res = await fetchImpl(env.PUBLIC_SITE_URL, {
            method: "HEAD",
            signal: AbortSignal.timeout(6000),
          });
          site = { url: env.PUBLIC_SITE_URL, ok: res.ok, status: res.status, ms: Date.now() - t };
        } catch {
          site = { url: env.PUBLIC_SITE_URL, ok: false, status: 0, ms: Date.now() - t };
        }
      }
      const ai = aiSummary(env, await loadAi(store, open));
      const week = await store.analytics(now, 7);
      return reply(
        json({
          checkedAt: now,
          db: { ok: dbOk, ms: dbMs },
          encryption: await checkMessageKey(env.MESSAGE_KEY),
          site,
          ai: {
            configured: ai.hasKey,
            provider: ai.provider,
            model: ai.model || ai.defaultModel,
            ...(await aiUsage(store, env, now)),
            asked7: week.totals.ask_ai || 0,
            errors7: week.totals.ai_error || 0,
          },
          lastPurgeAt: await store.lastAuditAt("purge"),
        }),
      );
    }

    /* ---- developer ---- */
    if (path === "/v1/staff/stats" && request.method === "GET")
      return (
        need("developer") ||
        reply(
          json({
            ...(await store.stats(now)),
            retention: {
              closedDays: Number(env.RETENTION_CLOSED_DAYS || 7),
              idleDays: Number(env.RETENTION_IDLE_DAYS || 30),
            },
          }),
        )
      );

    /* ---- AI answers kept for review: lawyers and developers ---- */
    if (path === "/v1/staff/ai-answers" && request.method === "GET") {
      const verdict = ["pending", "good", "bad"].includes(url.searchParams.get("verdict"))
        ? url.searchParams.get("verdict")
        : "all";
      const rows = await store.listAiAnswers({ verdict, limit: 50 });
      return reply(json({ items: rows.map(parseAnswer), counts: await store.aiAnswerCounts() }));
    }

    const review = m(/^\/v1\/staff\/ai-answers\/(\d+)$/);
    if (review && request.method === "PUT") {
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      if (!["good", "bad", ""].includes(value.verdict)) return reply(fail(400, "bad-verdict"));
      const ok = await store.reviewAiAnswer(Number(review[1]), value.verdict || null, staff.email, now);
      return ok ? reply(json({ ok: true })) : reply(fail(404, "not-found"));
    }

    // reviewed answers as JSON, to improve the prompt/evaluation set or train a model
    if (path === "/v1/staff/ai-answers/export" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      const rows = (await store.listAiAnswers({ verdict: "all", limit: 5000 })).filter((r) => r.verdict);
      await store.addAudit({
        actor: staff.email,
        action: "ai-answers-export",
        target: `${rows.length} answers`,
        now,
      });
      return reply(json({ items: rows.map(parseAnswer) }));
    }

    /* ---- AI settings: developer only; the key is write-only ---- */
    if (path === "/v1/staff/ai-config" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      return reply(
        json({ ...aiSummary(env, await loadAi(store, open)), ...(await aiUsage(store, env, now)) }),
      );
    }

    if (path === "/v1/staff/ai-config" && request.method === "PUT") {
      const denied = need("developer");
      if (denied) return denied;
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      const saved = await loadAi(store, open);
      const provider = value.provider;
      if (!PROVIDERS[provider]) return reply(fail(400, "bad-provider"));
      const model = cleanText(value.model, 80);
      if (model && !MODEL_RE.test(model)) return reply(fail(400, "bad-model"));
      const typedKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
      if (typedKey && !API_KEY_RE.test(typedKey)) return reply(fail(400, "bad-key"));
      // keep the stored key when only the model/provider changes (and the provider is the same)
      const apiKey = typedKey || (saved?.provider === provider ? saved.apiKey : "");
      if (!apiKey) return reply(fail(400, "key-required"));
      await store.setSetting({
        key: AI_SETTING,
        ...(await seal(JSON.stringify({ provider, model, apiKey }))),
        now,
        by: staff.email,
      });
      await store.addAudit({
        actor: staff.email,
        action: "ai-config-set",
        target: `${provider}${model ? ` / ${model}` : ""}${typedKey ? " (new key)" : ""}`,
        now,
      });
      return reply(
        json({ ...aiSummary(env, await loadAi(store, open)), ...(await aiUsage(store, env, now)) }),
      );
    }

    if (path === "/v1/staff/ai-config" && request.method === "DELETE") {
      const denied = need("developer");
      if (denied) return denied;
      await store.deleteSetting(AI_SETTING);
      await store.addAudit({ actor: staff.email, action: "ai-config-clear", target: "", now });
      return reply(json(aiSummary(env, null)));
    }

    // one real round trip with a fixed sample question, so a developer knows the key works
    if (path === "/v1/staff/ai-config/test" && request.method === "POST") {
      const denied = need("developer");
      if (denied) return denied;
      const started = Date.now();
      const { status, body } = await answerQuestion(
        "حدا عم يبتزني بصوري",
        "ps-wb",
        aiEnv(env, await loadAi(store, open)),
        fetchImpl,
      );
      const ok = status === 200 && Boolean(body.answer);
      await store.addAudit({
        actor: staff.email,
        action: "ai-config-test",
        target: ok ? "ok" : body.error || "no-answer",
        now,
      });
      return reply(json({ ok, error: ok ? null : body.error || "no-answer", ms: Date.now() - started }));
    }

    if (path === "/v1/staff/analytics" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days")) || 14));
      const team = await store.listStaff();
      const seen = new Map((await store.listStaffActivity()).map((r) => [r.email, r]));
      return reply(
        json({
          ...(await store.analytics(now, days)),
          staff: team.map((m) => ({
            ...m,
            lastSeen: seen.get(m.email)?.lastSeen ?? null,
            sessions: seen.get(m.email)?.sessions ?? 0,
          })),
        }),
      );
    }

    // team-wide work numbers + her own, for the lawyer dashboard (counts only, no content)
    if (path === "/v1/staff/work" && request.method === "GET") {
      const denied = need("lawyer");
      if (denied) return denied;
      const stats = await store.stats(now);
      const usage = await store.analytics(now, 14);
      return reply(
        json({
          byStatus: stats.byStatus,
          byRegion: stats.byRegion,
          series: stats.series,
          avgClaimWaitMs: stats.avgClaimWaitMs,
          oldestWaitingMs: stats.oldestWaitingMs,
          topics: usage.topics,
          visits: usage.totals.visit + usage.totals.visit_return,
          me: await store.lawyerStats(staff.email, now, 14),
        }),
      );
    }

    // developers: accounts and activity, never names or phones
    if (path === "/v1/staff/users" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      return reply(json({ ...(await store.userStats(now)), users: await store.listUsers(100) }));
    }

    // developers can delete an account (with her cases); still never see her name or phone
    const delUser = m(/^\/v1\/staff\/users\/([\w-]+)$/);
    if (delUser && request.method === "DELETE") {
      const denied = need("developer");
      if (denied) return denied;
      const user = await store.getUser(delUser[1]);
      if (!user) return reply(fail(404, "not-found"));
      await store.deleteUser(user.id);
      await store.addAudit({ actor: staff.email, action: "user-delete", target: user.username, now });
      return reply(json({ ok: true }));
    }

    if (path === "/v1/staff/team/reset" && request.method === "POST") {
      const denied = need("developer");
      if (denied) return denied;
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      const target = cleanText(value.email, LIMITS.email).toLowerCase();
      if (target === staff.email) return reply(fail(400, "use-change-password"));
      if (!(await store.getStaff(target))) return reply(fail(404, "not-found"));
      const password = await setTemp(target);
      await store.addAudit({ actor: staff.email, action: "staff-password-reset", target, now });
      return reply(json({ ok: true, tempPassword: password }));
    }

    if (path === "/v1/staff/audit" && request.method === "GET")
      return need("developer") || reply(json({ audit: await store.listAudit(100) }));

    if (path === "/v1/staff/team") {
      const denied = need("developer");
      if (denied) return denied;
      const releaseCases = async (email) => {
        const n = await store.releaseCases(email);
        if (n)
          await store.addAudit({
            actor: staff.email,
            action: "cases-release",
            target: `${email} (${n})`,
            now,
          });
      };
      if (request.method === "GET") return reply(json({ team: await store.listStaff() }));
      if (request.method === "PUT") {
        const { value, error } = await readJson(request);
        if (error) return reply(fail(error, "bad-body"));
        const target = cleanText(value.email, LIMITS.email).toLowerCase();
        const role = value.role;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target) || !["lawyer", "developer"].includes(role))
          return reply(fail(400, "bad-staff"));
        const existing = await store.getStaff(target);
        if (target === staff.email && (role !== staff.role || value.active === false))
          return reply(fail(400, "cannot-change-self"));
        await store.upsertStaff({ email: target, role, name: firstName(value.name), now });
        const activeChanged =
          typeof value.active === "boolean" && existing && value.active !== existing.active;
        if (activeChanged) {
          await store.setStaffActive(target, value.active);
          if (!value.active) await store.deleteStaffSessions(target); // signed out at once
          await store.addAudit({
            actor: staff.email,
            action: value.active ? "staff-restore" : "staff-suspend",
            target,
            now,
          });
        }
        // nobody else can answer her claimed cases, so they go back to the queue
        if (existing?.role === "lawyer" && (role !== "lawyer" || (activeChanged && !value.active)))
          await releaseCases(target);
        await store.addAudit({ actor: staff.email, action: "staff-add", target: `${target} (${role})`, now });
        // a new member (or one from before passwords) gets a temporary password, shown once
        const tempPw = (await store.getStaffAuth(target)) ? null : await setTemp(target);
        return reply(json({ ok: true, ...(tempPw ? { tempPassword: tempPw } : {}) }));
      }
      if (request.method === "DELETE") {
        const target = (url.searchParams.get("email") || "").toLowerCase();
        if (target === staff.email) return reply(fail(400, "cannot-remove-self"));
        await releaseCases(target);
        await store.removeStaff(target);
        await store.addAudit({ actor: staff.email, action: "staff-remove", target, now });
        return reply(json({ ok: true }));
      }
    }

    /* ---- lawyer ---- */
    if (path === "/v1/staff/queue" && request.method === "GET")
      return need("lawyer") || reply(json({ queue: await store.listQueue() }));
    if (path === "/v1/staff/mine" && request.method === "GET")
      return need("lawyer") || reply(json({ cases: await store.listMine(staff.email) }));

    /* ---- developer: read-only view of every conversation (each opening is audited) ---- */
    if (path === "/v1/staff/conversations" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      const team = new Map((await store.listStaff()).map((s) => [s.email, s]));
      const cases = (await store.listAllCases(200)).map((k) => ({
        ...k,
        lawyer: k.lawyerEmail ? team.get(k.lawyerEmail)?.name || k.lawyerEmail : null,
      }));
      return reply(json({ cases }));
    }

    const c = m(/^\/v1\/staff\/cases\/([\w-]+)\/(claim|messages|close|note|client)$/);
    if (c && staff.role === "developer") {
      const [, id, action] = c;
      if (action !== "messages" || request.method !== "GET") return reply(fail(403, "wrong-role"));
      const kase = await store.getCase(id);
      if (!kase) return reply(fail(404, "no-case"));
      const after = Number(url.searchParams.get("after")) || 0;
      // log the opening, not every refresh
      if (!after) await store.addAudit({ actor: staff.email, action: "dev-read-case", target: id, now });
      const rows = await store.listMessages(id, after);
      const messages = await Promise.all(
        rows.map(async (r) => ({ id: r.id, from: r.sender, text: await open(r), at: r.createdAt })),
      );
      return reply(json({ status: kase.status, topic: kase.topic, region: kase.region, messages }));
    }
    if (c) {
      const denied = need("lawyer");
      if (denied) return denied;
      const [, id, action] = c;
      const kase = await store.getCase(id);
      if (!kase) return reply(fail(404, "no-case"));

      if (action === "claim" && request.method === "POST") {
        const ok = await store.claimCase(id, staff.email, now);
        if (ok) await store.addAudit({ actor: staff.email, action: "claim", target: id, now });
        return reply(ok ? json({ ok: true }) : fail(409, "already-claimed"));
      }
      // everything below: only the lawyer who claimed it
      if (kase.lawyerEmail !== staff.email) return reply(fail(403, "not-your-case"));

      if (action === "client" && request.method === "GET") {
        const user = await store.getUser(kase.userId);
        if (!user) return reply(fail(404, "no-client"));
        await store.addAudit({ actor: staff.email, action: "view-contact", target: id, now });
        const contact = JSON.parse(await open({ iv: user.iv, body: user.body }));
        return reply(
          json({ username: user.username, name: contact.name, phone: contact.phone, region: user.region }),
        );
      }
      if (action === "messages" && request.method === "GET") {
        const rows = await store.listMessages(id, Number(url.searchParams.get("after")) || 0);
        const messages = await Promise.all(
          rows.map(async (r) => ({ id: r.id, from: r.sender, text: await open(r), at: r.createdAt })),
        );
        return reply(json({ status: kase.status, topic: kase.topic, region: kase.region, messages }));
      }
      if (action === "messages" && request.method === "POST") {
        if (kase.status !== "claimed") return reply(fail(409, "case-closed"));
        const { value, error } = await readJson(request);
        const text = cleanText(value?.text, LIMITS.text);
        if (error || !text) return reply(fail(error || 400, "bad-body"));
        const sealed = await seal(text);
        await store.addMessage({ caseId: id, sender: "lawyer", ...sealed, now });
        return reply(json({ ok: true }));
      }
      if (action === "note") {
        if (request.method === "GET") {
          const row = await store.getNote(id);
          return reply(json({ note: row ? await open(row) : "" }));
        }
        if (request.method === "PUT") {
          const { value, error } = await readJson(request);
          if (error) return reply(fail(error, "bad-body"));
          const text = cleanText(value.note, LIMITS.note);
          await store.setNote({ caseId: id, ...(await seal(text)), now });
          return reply(json({ ok: true }));
        }
      }
      if (action === "close" && request.method === "POST") {
        await store.closeCase(id, now);
        await store.addAudit({ actor: staff.email, action: "close", target: id, now });
        return reply(json({ ok: true }));
      }
    }
    return reply(fail(404, "not-found"));
  }

  /* ============ anonymous usage counters ============ */
  // Whitelisted event + region only. Nothing identifying is read, stored or logged.
  if (path === "/v1/ping" && request.method === "POST") {
    const { value, error } = await readJson(request);
    if (error || !EVENTS.includes(value.event)) return reply(fail(error || 400, "bad-event"));
    const region = REGIONS.includes(value.region) ? value.region : "none";
    const ms =
      value.event === "ask_ai" ? Math.min(60_000, Math.max(0, Math.round(Number(value.ms) || 0))) : 0;
    await store.track({ event: value.event, region, ms, now });
    return reply(new Response(null, { status: 204 }));
  }

  /* ============ women: alias + PIN account ============ */
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const sessionHash = bearer ? await sha256Hex(bearer) : "";
  const me = async () => {
    const id = sessionHash ? await store.getSession(sessionHash, now) : null;
    return id ? store.getUser(id) : null;
  };
  const startSession = async (user) => {
    const token = randomId(32);
    await store.createSession({
      tokenHash: await sha256Hex(token),
      userId: user.id,
      now,
      expiresAt: now + SESSION_MS,
    });
    return token;
  };

  if (path === "/v1/users" && request.method === "POST") {
    const { value, error } = await readJson(request);
    if (error) return reply(fail(error, "bad-body"));
    const username = cleanText(value.username, 20).toLowerCase();
    const name = cleanText(value.name, LIMITS.fullName);
    const phone = cleanText(value.phone, LIMITS.phone).replace(/[\s-]/g, "");
    if (!USERNAME_RE.test(username)) return reply(fail(400, "bad-username"));
    if (!PIN_RE.test(String(value.pin ?? ""))) return reply(fail(400, "bad-pin"));
    if (!name || !PHONE_RE.test(phone) || !REGIONS.includes(value.region))
      return reply(fail(400, "bad-body"));
    const salt = newSalt();
    const user = {
      id: randomId(9),
      username,
      salt,
      pinHash: await hashPin(String(value.pin), salt),
      ...(await seal(JSON.stringify({ name, phone }))),
      region: value.region,
      now,
    };
    if (!(await store.createUser(user))) return reply(fail(409, "username-taken"));
    await store.track({ event: "signup", region: value.region, now });
    return reply(json({ token: await startSession(user), username }, 201));
  }

  if (path === "/v1/login" && request.method === "POST") {
    const { value, error } = await readJson(request);
    if (error) return reply(fail(error, "bad-body"));
    const user = await store.getUserByName(cleanText(value.username, 20).toLowerCase());
    if (user && user.lockedUntil > now) return reply(fail(429, "locked"));
    // same answer for "no such alias" and "wrong PIN"
    const ok = user && safeEqual(await hashPin(String(value.pin ?? ""), user.salt), user.pinHash);
    if (user) await store.noteLogin(user.id, !!ok, now);
    if (!ok) return reply(fail(401, "bad-credentials"));
    await store.track({ event: "login", region: user.region, now });
    return reply(json({ token: await startSession(user), username: user.username }));
  }

  if (path === "/v1/logout" && request.method === "POST") {
    if (sessionHash) await store.deleteSession(sessionHash);
    return reply(new Response(null, { status: 204 }));
  }

  if (path === "/v1/me") {
    const user = await me();
    if (!user) return reply(fail(401, "unauthorized"));
    if (request.method === "GET")
      return reply(
        json({ username: user.username, region: user.region, cases: await store.listUserCases(user.id) }),
      );
    if (request.method === "DELETE") {
      await store.deleteUser(user.id);
      return reply(new Response(null, { status: 204 }));
    }
  }

  if (path === "/v1/cases" && request.method === "POST") {
    const user = await me();
    if (!user) return reply(fail(401, "unauthorized"));
    const { value, error } = await readJson(request);
    if (error) return reply(fail(error, "bad-body"));
    const topic = cleanText(value.topic, LIMITS.topic) || "غير محدد";
    const text = cleanText(value.message, LIMITS.text);
    if (!text) return reply(fail(400, "bad-body"));
    const id = randomId(9);
    await store.createCase({ id, userId: user.id, topic, region: user.region, now });
    await store.track({ event: "lawyer_request", region: user.region, now });
    await store.track({ event: `topic:${normalizeTopic(topic)}`, region: user.region, now });
    await store.addMessage({ caseId: id, sender: "user", ...(await seal(text)), now });
    return reply(json({ caseId: id }, 201));
  }

  const w = m(/^\/v1\/cases\/([\w-]+)\/messages$/);
  if (w) {
    const user = await me();
    const kase = await store.getCase(w[1]);
    // same answer for "no such case" and "not yours", so ids cannot be probed
    if (!user || !kase || kase.userId !== user.id) return reply(fail(401, "unauthorized"));

    if (request.method === "GET") {
      const rows = await store.listMessages(kase.id, Number(url.searchParams.get("after")) || 0);
      const messages = await Promise.all(
        rows.map(async (r) => ({ id: r.id, from: r.sender, text: await open(r), at: r.createdAt })),
      );
      let lawyer = null;
      if (kase.lawyerEmail) lawyer = firstName((await store.getStaff(kase.lawyerEmail))?.name) || "محامية";
      return reply(json({ status: kase.status, lawyer, messages }));
    }
    if (request.method === "POST") {
      if (kase.status === "closed") return reply(fail(409, "case-closed"));
      const { value, error } = await readJson(request);
      const text = cleanText(value?.text, LIMITS.text);
      if (error || !text) return reply(fail(error || 400, "bad-body"));
      await store.addMessage({ caseId: kase.id, sender: "user", ...(await seal(text)), now });
      return reply(json({ ok: true }));
    }
  }
  return reply(fail(404, "not-found"));
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
