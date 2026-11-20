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

/* ---------- law articles added by lawyers in the dashboard (2026-11-17) ---------- */

export const LAW_LIMITS = { lawName: 160, topic: 80, text: 8000, amended: 2000, url: 500, keywords: 300 };
const LAW_REGIONS = ["ps-wb", "ps-gaza", "both"];

/**
 * What a lawyer typed for one article, checked. The text is kept VERBATIM (only outer spaces trimmed and line
 * ends unified): it is quoted to women and to the AI as law. Angle brackets are refused because the text goes
 * inside the AI prompt's <article> tags; a real law text never needs them.
 * @returns {{value: object} | {error: string}}
 */
export function parseLawArticle(v) {
  const s = (x, max) =>
    typeof x === "string"
      ? x
          .replace(/\r\n?/g, "\n")
          .trim()
          .slice(0, max + 1)
      : "";
  const out = {
    lawName: s(v?.lawName, LAW_LIMITS.lawName),
    number: s(v?.number, 4).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))),
    region: s(v?.region, 10),
    topic: s(v?.topic, LAW_LIMITS.topic),
    text: s(v?.text, LAW_LIMITS.text),
    amended: s(v?.amended, LAW_LIMITS.amended),
    url: s(v?.url, LAW_LIMITS.url),
    keywords: s(v?.keywords, LAW_LIMITS.keywords),
  };
  for (const [k, max] of Object.entries(LAW_LIMITS))
    if (out[k].length > max) return { error: `too-long:${k}` };
  if (out.lawName.length < 5) return { error: "law-name-required" };
  if (!/^\d{1,4}$/.test(out.number)) return { error: "bad-number" };
  if (!LAW_REGIONS.includes(out.region)) return { error: "bad-region" };
  if (out.topic.length < 2) return { error: "topic-required" };
  if (out.text.length < 20) return { error: "text-required" };
  if (/[<>]/.test(out.text + out.amended + out.topic + out.lawName + out.keywords))
    return { error: "angle-brackets" };
  let url;
  try {
    url = new URL(out.url);
  } catch {
    return { error: "source-required" };
  }
  if (url.protocol !== "https:") return { error: "source-required" };
  return { value: out };
}

/** The approved articles, kept by each Worker isolate for a minute so a busy chat does not read D1 every time. */
let lawCache = { at: -Infinity, list: [] };
export async function loadAddedLaws(store, now, { fresh = false } = {}) {
  if (!fresh && now - lawCache.at < 60_000) return lawCache.list;
  try {
    const rows = await store.listLawArticles({ status: "approved" });
    lawCache = {
      at: now,
      list: rows.map(({ id, lawName, number, region, topic, text, amended, url, keywords }) => ({
        id,
        lawName,
        number,
        region,
        topic,
        text,
        amended,
        url,
        keywords,
      })),
    };
  } catch {
    /* table missing (schema not re-run yet) or D1 hiccup: the built-in laws still work */
  }
  return lawCache.list;
}
/** After an approve / hide in the dashboard: the next question sees the change at once. */
export const forgetAddedLaws = () => (lawCache = { at: -Infinity, list: [] });
