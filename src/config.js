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
export const AI_ENDPOINT = "";

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
 */
export const API_BASE = "";
