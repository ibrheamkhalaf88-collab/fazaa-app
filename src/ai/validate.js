import { checkGrounding, legalLeak } from "./legal.js";
import { tokenize } from "./normalize.js";

/**
 * Gatekeeper for answers that come from OUTSIDE the app (a language model).
 * The model's output is untrusted: these functions rebuild a clean answer and reject anything that
 * breaks the rules. The UI renders only the result, never the raw payload.
 *
 * Structure is not the same as content: a well-formed answer can still be wrong. So on top of the
 * shape checks:
 *  - law answers: every cited id must be one of the articles the server gave the model, AND every
 *    number / article number in the text must appear in those articles (checkGrounding);
 *  - talk answers (listening, support, steps): no legal claim at all (legalLeak), no promises of
 *    secrecy / safety / outcomes, no emotional dependence, and at most one question.
 */

const LIMITS = { lead: 500, talk: 600, step: 260, note: 800, steps: 5, cites: 4, topic: 40, closing: 240, ask: 220, options: 3 };

const clean = (v, max) =>
  typeof v === "string"
    ? v
        // strip control characters and angle brackets on purpose
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

const norm = (s) => tokenize(s).join(" ");
/** Things a digital helper must never say to someone in a fragile situation. */
const FORBIDDEN = [
  "ما رح اتركك",
  "مش رح اتركك",
  "انا الوحيده اللي",
  "رح ضل معك دايما",
  "بضل معك دايما",
  "انا محاميه",
  "انا محامي",
  "انا اخصائيه",
  "انا معالجه",
  "سريه تامه",
  "سري تماما",
  "رح تكوني بامان",
  "نتيجه مضمونه",
  "امانك مضمون",
  "اكيد رح تربحي",
  "المحكمه رح تحكملك",
].map(norm);
const forbidden = (text) => {
  const t = ` ${norm(text)} `;
  return FORBIDDEN.find((p) => t.includes(` ${p} `)) || "";
};

/** Keep only the first question: one question per reply. */
function oneQuestion(text) {
  const i = text.indexOf("؟");
  return i >= 0 ? text.slice(0, i + 1) : text;
}

/**
 * Law answer (cites articles).
 * @param {unknown} raw
 * @param {{articleIds: string[], articles?: Record<string, {text:string, amended?:string}>}} opts
 *        ids the answer may cite; with `articles`, the text is also checked against them
 * @returns {import("./types.js").Answer}
 * @throws {Error} with a short machine-readable reason
 */
export function validateAnswer(raw, { articleIds, articles }) {
  if (!raw || typeof raw !== "object") throw new Error("not-an-object");
  const a = /** @type {Record<string, unknown>} */ (raw);

  const lead = clean(a.lead, LIMITS.lead);
  if (!lead) throw new Error("missing-lead");

  const steps = (Array.isArray(a.steps) ? a.steps : [])
    .map((s) => clean(s, LIMITS.step))
    .filter(Boolean)
    .slice(0, LIMITS.steps);
  if (steps.length === 0) throw new Error("missing-steps");

  const cites = [...new Set(Array.isArray(a.cites) ? a.cites.map(String) : [])];
  if (cites.length > LIMITS.cites) throw new Error("too-many-cites");
  const unknown = cites.find((id) => !articleIds.includes(id));
  if (unknown) throw new Error(`unknown-article:${unknown}`);

  const answer = {
    lead,
    steps,
    note: clean(a.note, LIMITS.note),
    ...(clean(a.closing, LIMITS.closing) ? { closing: clean(a.closing, LIMITS.closing) } : {}),
    cites,
    sos: a.sos === true,
    ...(a.general === true && cites.length === 0 ? { general: true } : {}),
    ...(typeof a.topic === "string" && a.topic ? { topic: clean(a.topic, LIMITS.topic) } : {}),
    source: "ai",
  };

  const all = [answer.lead, answer.note, answer.closing || "", ...answer.steps].join(" ");
  const bad = forbidden(all);
  if (bad) throw new Error(`forbidden:${bad}`);
  if (cites.length === 0 && legalLeak(all)) throw new Error("legal-leak");
  if (articles) {
    const problems = checkGrounding(answer, articles);
    if (problems.length) throw new Error(`ungrounded:${problems[0]}`);
  }
  return answer;
}

/**
 * Talk answer (listening, understanding, small options): no law, one question at most.
 * @param {unknown} raw  {reply|lead, ask?, options?, sos?}
 * @param {{need?: string}} [opts]  "listen" removes options (she asked to be heard)
 */
export function validateTalk(raw, { need } = {}) {
  if (!raw || typeof raw !== "object") throw new Error("not-an-object");
  const a = /** @type {Record<string, unknown>} */ (raw);
  const lead = clean(a.reply ?? a.lead, LIMITS.talk);
  if (!lead) throw new Error("missing-reply");
  const ask = oneQuestion(clean(a.ask, LIMITS.ask));
  let options = (Array.isArray(a.options) ? a.options : Array.isArray(a.steps) ? a.steps : [])
    .map((s) => clean(s, LIMITS.step))
    .filter(Boolean)
    .slice(0, LIMITS.options);
  if (need === "listen") options = []; // «بس اسمعيني»: no advice
  const answer = { kind: "talk", lead: oneQuestion(lead), ask, options, note: "", sos: a.sos === true, source: "ai" };
  const all = [answer.lead, answer.ask, ...answer.options].join(" ");
  const bad = forbidden(all);
  if (bad) throw new Error(`forbidden:${bad}`);
  if (legalLeak(all)) throw new Error("legal-leak");
  // a lead that already asks a question: do not add a second one
  if (answer.lead.includes("؟") && answer.ask) answer.ask = "";
  return answer;
}
