/**
 * Build-time and deploy-time settings. The only file an operator needs to edit.
 */

/** localStorage key prefix. Everything the app stores starts with this, so "wipe" can find it. */
export const STORAGE_PREFIX = "fazaa:";
/** The prefix used before the rename to Fazaa. Keys found under it are moved once to STORAGE_PREFIX. */
export const LEGACY_STORAGE_PREFIX = "sanad:";

/** Typing this on the disguise calculator, then "=", returns to the app. */
export const CALC_CODE = "1379";

/**
 * URL of the online AI endpoint. Two ways to serve it:
 *   - the staff API (recommended): "/api/v1/answer". A developer pastes the provider key in the
 *     admin dashboard (إعدادات الذكاء), no terminal needed;
 *   - the standalone proxy (server/ai-proxy): "https://fazaa-ai.<subdomain>.workers.dev/v1/answer".
 * Leave empty to ship WITHOUT online AI: the setting then shows "قريباً" and the app
 * works fully offline with the rules engine.
 */
export const AI_ENDPOINT = "/api/v1/answer";

/**
 * Closed beta of the online AI (2026-11-13). true = only a device that opened the site once with
 * `?beta=<code>` uses the online AI; everyone else gets the offline replies and nothing they type leaves
 * the phone. The server checks the code too when the Worker secret AI_BETA_CODE is set.
 * (2026-11-13, owner's decision) false: the assistant is AI-first for everyone. Set true again to limit the
 * online AI to testers; non-testers then see that the assistant is off.
 */
export const AI_BETA_ONLY = false;

/** Answers are artificially delayed to feel conversational; milliseconds. */
export const TYPING_DELAY = { base: 900, perChar: 12, max: 900 };

/**
 * Anonymous usage counters. "" = off. When the staff API is deployed on the same domain: "/api/v1/ping".
 * (The user can also switch it off in Settings.)
 */
export const TELEMETRY_ENDPOINT = "";

/**
 * Staff API for real lawyer chat (accounts + cases). "" = off: the lawyer tab stays the scripted
 * demo. When the API is deployed on the same domain: "/api".
 * (2026-11-17, owner's decision) on: women can open a case with a real lawyer from the app.
 */
export const API_BASE = "/api";

/**
 * Public list of emergency numbers and support organisations (edited in the dashboard, "أرقام التواصل").
 * Served by the same Worker as the app. "" = use only the numbers built into the app.
 */
export const CONTACTS_ENDPOINT = "/api/v1/contacts";

/** Law articles added and approved by lawyers in the dashboard («القوانين»). "" = only the built-in laws. */
export const LAWS_ENDPOINT = "/api/v1/laws";

/** Lawyers available now (managed in the dashboard, "المحاميات"). "" = hide the lawyer cards' live data. */
export const LAWYERS_ENDPOINT = "/api/v1/lawyers";
