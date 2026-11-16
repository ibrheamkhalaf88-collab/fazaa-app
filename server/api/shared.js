/** Constants and helpers shared by the API routes (server/api/routes/*). */
import { DEFAULT_PROVIDER, PROVIDERS } from "../ai-proxy/providers.js";
import { scrub } from "./scrub.js";

export const REGIONS = ["ps-wb", "ps-gaza"];
export const LIMITS = {
  body: 8192,
  text: 2000,
  note: 4000,
  topic: 60,
  name: 30,
  email: 120,
  fullName: 60,
  phone: 20,
};
export const SESSION_MS = 30 * 86_400_000;
export const USERNAME_RE = /^[a-z0-9_\u0621-\u064a]{3,20}$/;
export const PIN_RE = /^\d{6}$/;
export const PHONE_RE = /^\+?\d{7,15}$/;
/**
 * PINs an attacker tries first on many aliases at once (one guess per alias stays under the lockout):
 * one digit repeated, a run up or down, a pair or triple repeated, and the usual favourites.
 * Checked at sign-up only, so existing accounts keep working.
 */
export const COMMON_PINS = new Set([
  "112233",
  "102030",
  "121212",
  "123123",
  "159753",
  "147258",
  "696969",
  "520520",
]);
export function weakPin(pin) {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const steps = new Set([...pin.slice(1)].map((d, i) => (Number(d) - Number(pin[i]) + 10) % 10));
  if (steps.size === 1 && (steps.has(1) || steps.has(9))) return true; // 123456, 987654, 890123
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return true;
  return COMMON_PINS.has(pin);
}
export const DAY = 86_400_000;
export const RATE_LIMITED = [
  "/v1/answer",
  "/v1/users",
  "/v1/login",
  "/v1/staff/login",
  "/v1/ping",
  "/v1/cases",
];
/** Cases one account may have open (waiting or with a lawyer) at the same time. */
export const MAX_OPEN_CASES = 3;

export const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
export const fail = (status, error) => json({ error }, status);

export function corsHeaders(request, env) {
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

export async function readJson(request, maxBytes = LIMITS.body) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) return { error: 413 };
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? { value } : { error: 400 };
  } catch {
    return { error: 400 };
  }
}

export const cleanText = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const firstName = (s) => (s || "").trim().split(/\s+/)[0].slice(0, LIMITS.name);

/* ---------- AI settings (developer dashboard) ---------- */
export const AI_SETTING = "ai";
export const CONTACTS_SETTING = "contacts";
export const LAWYERS_SETTING = "lawyers";
export const MODEL_RE = /^[\w.\-/:]{1,80}$/;
export const API_KEY_RE = /^[\x21-\x7e]{20,400}$/; // visible ASCII only, no spaces
export const aiProviders = () =>
  Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, defaultModel: p.defaultModel }));

/** The saved AI settings (decrypted) or null. */
export async function loadAi(store, open) {
  const row = await store.getSetting(AI_SETTING);
  if (!row) return null;
  try {
    return { ...JSON.parse(await open(row)), updatedAt: row.updatedAt, updatedBy: row.updatedBy };
  } catch {
    return null; // MESSAGE_KEY changed: treat as not set
  }
}

/** env as the AI step expects it: dashboard settings win, Worker secrets are the fallback. */
export function aiEnv(env, saved) {
  if (!saved) return env;
  return {
    ...env,
    PROVIDER: saved.provider,
    MODEL: saved.model || "",
    ...(saved.fallbackModel ? { FALLBACK_MODEL: saved.fallbackModel } : {}),
    [PROVIDERS[saved.provider].keyName]: saved.apiKey,
  };
}

/**
 * The models this key can use (Gemini only, from Google's own list). Never returns the key.
 * @returns {Promise<{ok: boolean, models: {id: string, label: string}[], error?: string}>}
 */
export async function listModels(saved, fetchImpl) {
  if (!saved?.apiKey) return { ok: false, models: [], error: "no-key" };
  if (saved.provider !== "gemini") return { ok: true, models: [] };
  let res;
  try {
    res = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": saved.apiKey },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, models: [], error: "unreachable" };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no JSON */
  }
  if (!res.ok) {
    const e = data?.error;
    const reason = String(e?.details?.find?.((d) => d.reason)?.reason || e?.status || res.status);
    return { ok: false, models: [], error: reason.replace(/[^\w.-]/g, "").slice(0, 60) };
  }
  const models = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => ({ id: String(m.name || "").replace(/^models\//, ""), label: String(m.displayName || "") }))
    .filter(
      (m) => /^gemini-/.test(m.id) && MODEL_RE.test(m.id) && !/(embedding|image|tts|audio|live)/.test(m.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  return { ok: true, models };
}

/** What the dashboard may know: never the key itself, only whether one exists and its last 4 characters. */
export function aiSummary(env, saved) {
  const provider = saved?.provider || env.PROVIDER || DEFAULT_PROVIDER;
  const def = PROVIDERS[provider] || PROVIDERS[DEFAULT_PROVIDER];
  const key = saved?.apiKey || env[def.keyName] || "";
  return {
    provider,
    model: saved ? saved.model || "" : env.MODEL || "",
    fallbackModel: saved?.fallbackModel || "",
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
export async function keepAnswer(store, answer, region, env, now) {
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
export async function takeAiSlot(store, env, now) {
  const limit = Number(env.AI_DAILY_LIMIT || 3000);
  const day = new Date(now).toISOString().slice(0, 10);
  return store.takeDaily("ai-usage", day, limit, now);
}

export async function aiUsage(store, env, now) {
  const row = await store.getSetting("ai-usage");
  const day = new Date(now).toISOString().slice(0, 10);
  return {
    usedToday: row && row.iv === day ? Number(row.body) || 0 : 0,
    dailyLimit: Number(env.AI_DAILY_LIMIT || 3000),
  };
}

export const parseAnswer = (row) => ({ ...row, body: undefined, answer: JSON.parse(row.body) });
