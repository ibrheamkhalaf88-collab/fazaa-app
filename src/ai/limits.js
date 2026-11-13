/**
 * Size limits shared by the app, the AI proxy and the staff API, so a message the app accepts is never
 * cut or refused somewhere else. Nothing is truncated silently: the app refuses a longer message with
 * a visible note, and the servers refuse it with "bad-question".
 */
export const MAX_MESSAGE_CHARS = 1200;
export const MIN_MESSAGE_CHARS = 2;

/** Optional session context (only when she agreed to share it). */
export const CONTEXT = Object.freeze({
  turns: 6, // last messages sent with the question
  turnChars: 400, // each one is cut to this length (the cut is marked with "…")
  facts: 8, // short notes the app took during the session ("ما عندها مصاري")
  factChars: 80,
});

/**
 * The AI-first chat (2026-11-13): the conversation of THIS device's session goes with each message, as
 * role-tagged turns. Older turns beyond `turns` are dropped (never cut silently inside a turn: a long reply
 * is cut at `assistantChars` with "…").
 */
export const CHAT = Object.freeze({ turns: 12, assistantChars: 700 });

/** Body size the servers accept: the chat turns + JSON overhead (Arabic is 2 bytes per letter). */
export const MAX_BODY_BYTES = 40960;
