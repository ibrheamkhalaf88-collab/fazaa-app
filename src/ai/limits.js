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

/** Body size the servers accept: message + context + JSON overhead. */
export const MAX_BODY_BYTES = 16384;
