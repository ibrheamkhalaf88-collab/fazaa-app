import { RULES } from "../data/answers.js";
import { detectIntents } from "./detect.js";

/**
 * Offline engine: detect intents, return the first matching rule's answer.
 * Deterministic, instant, no network, no data leaves the device.
 *
 * @param {string} question
 * @returns {import("./types.js").Answer | null}  null = nothing in the app covers this
 */
export function answerFromRules(question) {
  const hits = detectIntents(question);
  const rule = RULES.find((r) => r.when(hits));
  return rule ? { ...rule.answer(hits), source: "rules" } : null;
}
