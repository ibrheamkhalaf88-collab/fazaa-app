import { INTENT_COURTS, INTENT_TO_ARTICLES } from "../data/law/index.js";
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
 * The words of an article, worked out ONCE per article object and kept for the life of the Worker isolate
 * (2026-11-24). With 2,000+ Gaza articles, tokenising every text on every message took 60-75 ms of CPU and
 * Cloudflare started refusing the chat (error 1102). A WeakMap: an article that is replaced (a lawyer's edit)
 * gets its own entry, the old one is dropped with it.
 * @type {WeakMap<object, {words: Set<string>, keys: Set<string>}>}
 */
const WORDS = new WeakMap();
function wordsOf(a) {
  let w = WORDS.get(a);
  if (!w) {
    // the curated everyday words of a topic («غايب», «بيضربني») are a strong signal: one is enough
    w = { words: new Set(tokenize(`${a.topic} ${a.text}`).map(stem)), keys: new Set(tokenize(a.keywords || "").map(stem)) };
    WORDS.set(a, w);
  }
  return w;
}

/**
 * Word -> articles index of one article list (the per-region list from articlesFor, cached there), built once
 * and kept while that list lives. `order` is each article's position in the list.
 * @type {WeakMap<object, {byWord: Map<string, object[]>, order: Map<object, number>}>}
 */
const INDEX = new WeakMap();
function indexOf(articles) {
  let idx = INDEX.get(articles);
  if (!idx) {
    idx = { byWord: new Map(), order: new Map() };
    Object.values(articles).forEach((a, i) => {
      idx.order.set(a, i);
      const { words, keys } = wordsOf(a);
      for (const w of new Set([...words, ...keys])) {
        const list = idx.byWord.get(w);
        if (list) list.push(a);
        else idx.byWord.set(w, [a]);
      }
    });
    INDEX.set(articles, idx);
  }
  return idx;
}

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
  const intents = detectIntents(question);
  for (const intent of Object.keys(intents)) {
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
  // only the articles that share a word with the question are scored (word index), in their original order,
  // so equal scores keep the same order as a scan of every article would give
  const { byWord, order } = indexOf(articles);
  const candidates = new Set();
  for (const w of query) for (const a of byWord.get(w) || []) candidates.add(a);
  const scored = [...candidates]
    .sort((x, y) => order.get(x) - order.get(y))
    .map((a) => {
      const { words, keys } = wordsOf(a);
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
  const score = new Map(scored.map((x) => [x.a.id, x.score]));
  return keepCourtsApart([...picked.values()], courtsOf(intents), score).slice(0, limit);
}

/** The courts her topic belongs to (src/data/law/index.js INTENT_COURTS); empty when no topic was detected. */
function courtsOf(intents) {
  return new Set(Object.keys(intents).flatMap((i) => INTENT_COURTS[i] || []));
}

/**
 * Keep the sharia and the nizami texts apart (owner, 2026-11-21). A text of general rules (Majalla) goes with
 * either.
 *  - Her topic belongs to ONE court (custody -> sharia, blackmail -> nizami): texts of the other court are
 *    dropped, however many words they share («ضرب» is in a penal article and in divorce for harm).
 *  - No topic detected: the court of the best text leads; a text of the other court stays only when it matches
 *    strongly on its own (score 4+), so a passing shared word does not bring in the other court.
 *  - Her topic belongs to both (violence, threats): both stay, taking turns court by court so the long
 *    divorce list does not push every nizami text past the limit, and the reply keeps the two parts apart.
 * @param {{id:string, court?:string}[]} list  ranked
 * @param {Set<string>} courts
 * @param {Map<string, number>} score
 */
export function keepCourtsApart(list, courts, score) {
  const own = (a) => !a.court || a.court === "general";
  if (courts.size === 1) {
    const [court] = courts;
    return list.filter((a) => own(a) || a.court === court);
  }
  if (courts.size === 0) {
    const lead = list.find((a) => !own(a))?.court;
    return list.filter((a) => own(a) || a.court === lead || (score.get(a.id) || 0) >= 4);
  }
  // both courts: take turns, best first within each court
  const groups = new Map();
  for (const a of list) {
    const key = a.court || "general";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  const out = [];
  for (let i = 0; out.length < list.length; i++) for (const g of groups.values()) if (g[i]) out.push(g[i]);
  return out;
}
