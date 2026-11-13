import { assessDanger } from "./danger.js";
import { CHAT } from "./limits.js";

/**
 * The AI-first assistant (owner's decision, 2026-11-13): every reply is written by the online AI from the
 * Palestinian law texts in the app (server/ai-proxy/worker.js chatAnswer). There is no rule-based reply.
 *
 * Two things stay on the device, on purpose:
 *   1. Present danger and self-harm («هلأ عم يكسر الباب», «بدي أموت»): the fixed, reviewed safety reply
 *      appears at once (src/ai/danger.js). Seconds matter, and nothing is sent anywhere for it.
 *   2. When the AI cannot answer (no network, provider down, a reply that broke the rules twice, she did not
 *      agree to send): one honest sentence saying so, with the safety-plan / support buttons. Never a fake
 *      answer.
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
    turns.push({ role, text: role === "assistant" && clean.length > CHAT.assistantChars ? `${clean.slice(0, CHAT.assistantChars - 1)}…` : clean });
    if (turns.length > CHAT.turns * 2) turns = turns.slice(-CHAT.turns * 2);
  };

  /** What the app says when the AI could not answer: the truth, and the ways to get help. */
  function unavailable(reason, sos) {
    const lead =
      reason === "off"
        ? "المساعدة بتشتغل بالذكاء الاصطناعي عبر الإنترنت، وهي مطفية هلأ. بتقدري تشغّليها من الإعدادات، أو تفتحي «مين بيساعدني»."
        : "ما قدرت أوصل لخدمة الذكاء هلأ. جرّبي تبعتي رسالتك كمان شوي.";
    return { kind: "talk", lead, options: [], ask: "", note: "", general: true, sos: Boolean(sos), source: "none" };
  }

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
        return { ...danger.answer, sosPlan: danger.level === "selfharm" ? "selfharm" : "violence", source: "rules" };
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
        return unavailable("down", Boolean(danger));
      }
      remember("assistant", [answer.lead, answer.ask].filter(Boolean).join(" "));
      // any mention of violence, a threat or self-harm: the safety-plan button is there
      return danger ? { ...answer, sos: true } : answer;
    },
  };
}
