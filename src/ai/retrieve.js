import { INTENT_TO_ARTICLES } from "../data/law/index.js";
import { detectIntents } from "./detect.js";
import { tokenize } from "./normalize.js";

/** Words in almost every law question («شو بيقول القانون…»): they say nothing about the topic. */
const GENERIC = new Set([
  ...["القانون", "قانون", "الماده", "ماده", "بيقول", "حسب", "شو"],
  // function words: in most articles, so they only add noise to the score
  ...["اذا", "اللي", "الذي", "التي", "على", "كان", "بدي", "بعد", "قبل"],
]);

/** Strip the definite article (and «بال/وال/لل…» before it) so "بالنفقه" and "نفقه" compare equal. */
const stem = (w) => {
  const m = /^(?:بال|وال|فال|كال|لل|ال)/.exec(w);
  return m && w.length - m[0].length >= 3 ? w.slice(m[0].length) : w;
};

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
 * @param {Record<string, import("../data/law/types.js").Article>} articles
 * @param {number} [limit]
 * @returns {import("../data/law/types.js").Article[]}
 */
export function retrieveArticles(question, articles, limit = 3) {
  const fromIntent = [];
  for (const intent of Object.keys(detectIntents(question))) {
    for (const id of INTENT_TO_ARTICLES[intent] || []) {
      if (articles[id] && !fromIntent.includes(id)) fromIntent.push(id);
    }
  }

  const rank = (id) => (fromIntent.includes(id) ? fromIntent.indexOf(id) : fromIntent.length);
  const query = new Set(
    tokenize(question)
      .filter((w) => w.length >= 3 && !GENERIC.has(w))
      .map(stem),
  );
  const scored = Object.values(articles)
    .map((a) => {
      const words = new Set(tokenize(`${a.topic} ${a.text}`).map(stem));
      // the curated everyday words of a topic («غايب», «بيضربني») are a strong signal: one is enough
      const keys = new Set(tokenize(a.keywords || "").map(stem));
      let score = 0;
      for (const w of query) score += keys.has(w) ? 2 : words.has(w) ? 1 : 0;
      return { a, score };
    })
    .filter((x) => x.score >= 2)
    // equal scores: the hand-curated intent list first, in its order (many articles of a big chapter tie)
    .sort((x, y) => y.score - x.score || rank(x.a.id) - rank(y.a.id));

  // a strong word match («احبسه» + «النفقة» -> enforcement) comes before the generic topic list
  const picked = new Map();
  for (const { a } of scored.filter((x) => x.score >= 4)) picked.set(a.id, a);
  for (const id of fromIntent) picked.set(id, articles[id]);
  for (const { a } of scored) picked.set(a.id, a);
  return [...picked.values()].slice(0, limit);
}
