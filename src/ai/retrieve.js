import { INTENT_TO_ARTICLES } from "../data/law/index.js";
import { detectIntents } from "./detect.js";
import { tokenize } from "./normalize.js";

/** Strip the definite article so "الابتزاز" and "ابتزاز" compare equal. */
const stem = (w) => (w.startsWith("ال") && w.length > 4 ? w.slice(2) : w);

/**
 * Pick the articles an answer may be built from. Two signals, in order:
 *   1. intent -> article map (precise, hand-curated);
 *   2. word overlap between the question and the article text (catches phrasing
 *      the keyword lists do not know yet). Needs 2+ shared words to count.
 *
 * Returns [] when nothing applies. The caller must then NOT ask a language model:
 * with no source text, any answer would be unsourced.
 *
 * @param {string} question
 * @param {Record<string, import("../data/law/cyber-crimes-2018.js").Article>} articles
 * @param {number} [limit]
 * @returns {import("../data/law/cyber-crimes-2018.js").Article[]}
 */
export function retrieveArticles(question, articles, limit = 3) {
  const picked = new Map();

  for (const intent of Object.keys(detectIntents(question))) {
    for (const id of INTENT_TO_ARTICLES[intent] || []) {
      if (articles[id]) picked.set(id, articles[id]);
    }
  }

  const query = new Set(
    tokenize(question)
      .filter((w) => w.length >= 3)
      .map(stem),
  );
  const scored = Object.values(articles)
    .filter((a) => !picked.has(a.id))
    .map((a) => {
      const words = new Set(tokenize(`${a.topic} ${a.text}`).map(stem));
      let score = 0;
      for (const w of query) if (words.has(w)) score++;
      return { a, score };
    })
    .filter((x) => x.score >= 2)
    .sort((x, y) => y.score - x.score);
  for (const { a } of scored) picked.set(a.id, a);

  return [...picked.values()].slice(0, limit);
}
