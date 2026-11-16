import { normalize, tokenize } from "../ai/normalize.js";

/**
 * Practical procedures: how to actually do a step (which office, which papers, cost, how long, who helps).
 * The AI may name places, documents, fees, durations, organisations or numbers ONLY from here (see CHAT_PROMPT).
 *
 * Rules for adding an entry:
 *  - Written or checked by the reviewing lawyer / a legal aid organisation. Never from memory or the web alone.
 *  - `reviewed: true` only after that check, with `reviewedBy` and `reviewedAt`. Unreviewed entries are never
 *    sent to the model.
 *  - One procedure per entry, short, in plain Palestinian Arabic.
 *
 * @typedef {{
 *   id: string,
 *   regions: ("ps-wb"|"ps-gaza")[],
 *   topic: string,          // e.g. "نفقة"
 *   keywords: string[],     // words that bring this entry into a conversation
 *   text: string,           // the procedure itself
 *   reviewed: boolean,
 *   reviewedBy?: string,
 *   reviewedAt?: string,    // YYYY-MM-DD
 * }} Procedure
 */

/** @type {Procedure[]} */
export const PROCEDURES = [
  // Example of the shape (kept unreviewed, so it is never sent):
  // {
  //   id: "wb-nafaqa-file",
  //   regions: ["ps-wb"],
  //   topic: "نفقة",
  //   keywords: ["نفقة", "بيصرف", "مصروف"],
  //   text: "…",
  //   reviewed: false,
  // },
];

const stem = (w) => (w.startsWith("ال") && w.length > 4 ? w.slice(2) : w);

/**
 * Reviewed procedures for her region that match the conversation (her own messages only).
 * @param {{role: string, text: string}[]} turns
 * @param {string} country
 * @param {Procedure[]} [list]  injectable for tests
 * @param {number} [limit]
 * @returns {Procedure[]}
 */
export function proceduresFor(turns, country, list = PROCEDURES, limit = 2) {
  const hers = turns
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join(" ");
  const words = new Set(tokenize(hers).map(stem));
  return list
    .filter((p) => p.reviewed === true && p.regions.includes(/** @type {any} */ (country)))
    .map((p) => ({ p, score: p.keywords.filter((k) => words.has(stem(normalize(k)))).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}
