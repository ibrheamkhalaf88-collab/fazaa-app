import { INTENTS } from "../data/intents.js";
import { normalize, tokenize } from "./normalize.js";

/**
 * A keyword matches only at the START of a word, optionally after a common Arabic
 * prefix (و، ف، ال، بال، لل، بي، بت، عم، ب، ل، ي، ت). It never matches inside another
 * word ("عنف" must not fire on "تعنيف المعلومات"), and numbers must match exactly
 * ("16" must not fire on "160").
 */
const PREFIX = " (?:و|ف)?(?:بال|لل|ال|بي|بت|عم|ب|ل|ي|ت)?";
const IS_NUMBER = /^[0-9٠-٩]+$/;

/** Compile once at load time; detection runs on every question. */
const COMPILED = INTENTS.map(({ id, words }) => ({
  id,
  matchers: words.map((word) => {
    const n = normalize(word);
    return IS_NUMBER.test(n) ? { number: n } : { pattern: new RegExp(PREFIX + n) };
  }),
}));

/**
 * @param {string} question
 * @returns {Partial<Record<import("../data/intents.js").IntentId, number>>}
 *          number of keyword hits per intent (absent = no hit)
 */
export function detectIntents(question) {
  const tokens = tokenize(question);
  const text = ` ${tokens.join(" ")} `;
  const hits = {};
  for (const { id, matchers } of COMPILED) {
    for (const m of matchers) {
      const matched = m.number ? tokens.includes(m.number) : m.pattern.test(text);
      if (matched) hits[id] = (hits[id] || 0) + 1;
    }
  }
  return hits;
}
