import { assessDanger, childSafetyAnswer, sexualSupportAnswer } from "./danger.js";
import { CHAT } from "./limits.js";
import { createAnswerer } from "./answerer.js";
import { findArticleByNumber } from "./legal.js";

/**
 * The AI-first assistant (owner's decision, 2026-11-13): every reply is written by the online AI from the
 * Palestinian law texts in the app (server/ai-proxy/worker.js chatAnswer). There is no rule-based reply.
 *
 * Two things stay on the device, on purpose:
 *   1. Present danger and self-harm («هلأ عم يكسر الباب», «بدي أموت»): the fixed, reviewed safety reply
 *      appears at once (src/ai/danger.js). Seconds matter, and nothing is sent anywhere for it.
 *   2. When the AI cannot answer (no network, provider down, a reply that broke the rules twice): (2026-11-17)
 *      the app's own offline engine answers when it has something solid (a law text, a safety reply), with a
 *      line saying so; otherwise one honest sentence. Before, every rejected reply showed «ما قدرت أوصل لخدمة
 *      الذكاء» although the service was up (11 of 144 turns in the evaluation of 2026-11-17).
 *   3. (2026-11-17) «شو بتقول المادة 15؟»: the article itself, verbatim, from the app (the AI's free text about
 *      an article number was rejected by the checker, and the exact text is what she asked for).
 *
 * Separation between users: the conversation lives ONLY in this object, in RAM, on this device. Each
 * request carries this device's own turns; the server keeps nothing between requests. Reset (new chat,
 * quick exit, region change, reload) forgets everything.
 *
 * @param {{
 *   remote?: {chat(turns: {role:string,text:string}[], ctx: object): Promise<object|null>},
 *   isRemoteEnabled?: () => boolean,
 *   onRemoteError?: (err: Error) => void,
 *   emergencyNumbers?: () => {police?: string, ambulance?: string},
 *   available?: () => {mindLine?: boolean, lawyer?: boolean},
 * }} deps
 */
export function createAssistant({
  remote,
  isRemoteEnabled = () => false,
  onRemoteError = () => {},
  emergencyNumbers = () => ({}),
  available = () => ({}),
} = {}) {
  /** This device's conversation: {role: "user"|"assistant", text}. */
  let turns = [];
  let country = "";

  const remember = (role, text) => {
    const clean = String(text || "").trim();
    if (!clean) return;
    turns.push({
      role,
      text:
        role === "assistant" && clean.length > CHAT.assistantChars
          ? `${clean.slice(0, CHAT.assistantChars - 1)}…`
          : clean,
    });
    if (turns.length > CHAT.turns * 2) turns = turns.slice(-CHAT.turns * 2);
  };

  /** What the app says when the AI could not answer: the truth, and the ways to get help. */
  function unavailable(reason, sos) {
    const lead =
      reason === "off"
        ? "المساعدة بتشتغل بالذكاء الاصطناعي عبر الإنترنت، وهي مطفية هلأ. بتقدري تشغّليها من الإعدادات، أو تفتحي «مين بيساعدني»."
        : "ما قدرت أوصل لخدمة الذكاء هلأ. جرّبي تبعتي رسالتك كمان شوي.";
    return {
      kind: "talk",
      lead,
      options: [],
      ask: "",
      note: "",
      general: true,
      sos: Boolean(sos),
      source: "none",
    };
  }

  /** The offline engine (reviewed texts and rules only, never the network): article lookups and fallbacks. */
  const local = createAnswerer({ emergencyNumbers, available });
  const SOLID = new Set(["article", "law"]);
  /** What the offline engine can stand behind for this message, or null. */
  async function offline(question, ctx, { any = false } = {}) {
    try {
      local.reset();
      const a = await local.answer(question, ctx);
      return a && (any || SOLID.has(a.kind) || a.cites?.length || a.sos) ? a : null;
    } catch {
      return null;
    }
  }

  /** She told about sexual violence earlier in this conversation (the AI may fail on a later message). */
  const sexualEarlier = () =>
    turns.some((t) => t.role === "user" && assessDanger(t.text, {})?.about === "sexual");

  return {
    get turns() {
      return turns;
    },
    /** Forget the conversation (new chat, quick exit, region change). */
    reset() {
      turns = [];
    },
    /**
     * @param {string} question
     * @param {{country: string, signal?: AbortSignal}} ctx
     */
    async answer(question, ctx) {
      if (country && country !== ctx.country) turns = []; // never mix regions
      country = ctx.country;
      const can = available();
      const danger = assessDanger(question, emergencyNumbers(), { mindLine: can.mindLine });

      // present danger / self-harm: the fixed safety reply at once (it joins the conversation, so the AI
      // knows about it in the next turn)
      if (danger?.level === "immediate" || danger?.level === "selfharm") {
        remember("user", question);
        remember("assistant", [danger.answer.lead, danger.answer.ask].filter(Boolean).join(" "));
        return {
          ...danger.answer,
          sosPlan: danger.level === "selfharm" ? "selfharm" : "violence",
          source: "rules",
        };
      }

      // an article by its number: the exact text from the app (verbatim, with its source)
      if (findArticleByNumber(question, ctx.country)) {
        const a = await offline(question, ctx, { any: true }); // also «مش موجودة» / another region
        if (a) {
          remember("user", question);
          remember("assistant", [a.lead, a.ask].filter(Boolean).join(" "));
          return a;
        }
      }

      if (!remote || !isRemoteEnabled()) return unavailable("off", Boolean(danger));

      remember("user", question);
      let answer = null;
      try {
        answer = await remote.chat(turns.slice(-CHAT.turns), { country: ctx.country, signal: ctx.signal });
      } catch (err) {
        if (err?.name === "AbortError") throw err; // wiped / quick exit: stop here
        onRemoteError(/** @type {Error} */ (err));
      }
      if (ctx.signal?.aborted) return null;
      if (!answer) {
        turns.pop(); // she can send it again; the failed turn is not half-kept
        // (2026-11-17) she told about sexual violence: support and real options, not «جرّبي كمان شوي»
        if (danger?.about === "sexual" || sexualEarlier())
          return { ...sexualSupportAnswer(emergencyNumbers()), sosPlan: "violence" };
        // (2026-11-19) sexual content sent to her child: Gemini always blocks it, so a fixed safety reply
        if (danger?.about === "child")
          return { ...childSafetyAnswer(emergencyNumbers()), sosPlan: "violence" };
        // (2026-11-18, owner's rule) the AI is down: NO information at all, no law text, no advice; only the
        // honest message. Danger is the one exception: the fixed safety question and the safety-plan button.
        if (danger) {
          const down = unavailable("down", true);
          return danger.answer
            ? {
                ...danger.answer,
                note: [danger.answer.note, down.lead].filter(Boolean).join(" "),
                sos: true,
                source: "rules",
              }
            : {
                ...down,
                lead:
                  danger.about === "child"
                    ? "ما قدرت أوصل لخدمة الذكاء هلأ، بس سلامة بنتك أو ابنك أهم إشي."
                    : "ما قدرت أوصل لخدمة الذكاء هلأ، بس سلامتك أهم إشي.",
                ask: danger.ask || "",
              };
        }
        return unavailable("down", false);
      }
      remember("assistant", [answer.lead, answer.ask].filter(Boolean).join(" "));
      // any mention of violence, a threat or self-harm: the safety-plan button is there
      return danger ? { ...answer, sos: true } : answer;
    },
  };
}
