import { companionAnswer, isVenting } from "./companion.js";
import { detectDanger } from "./danger.js";
import { answerFromRules } from "./rules-engine.js";

/**
 * One entry point for the chat. Strategy:
 *
 *   online engine enabled?  --yes-->  ask it  --answer-->  use it
 *            |                           |  \--null/error-->  fall through
 *            no                          v
 *            +---------------------> rules engine (offline, always available)
 *
 * The rules engine is both the default and the safety net: no network, no outage, no
 * rejected AI answer can leave the user without a response.
 *
 * Safety merge: if the rules engine recognises a danger case (blackmail, violence),
 * the "open safety plan" button is forced on even when the AI answer did not ask for it.
 *
 * @param {{
 *   remote?: {answer(q: string, ctx: import("./types.js").AskContext): Promise<import("./types.js").Answer|null>},
 *   isRemoteEnabled?: () => boolean,
 *   onRemoteError?: (err: Error) => void,
 * }} [deps]
 */
export function createAnswerer({ remote, isRemoteEnabled = () => false, onRemoteError = () => {} } = {}) {
  return {
    /**
     * @param {string} question
     * @param {import("./types.js").AskContext} ctx
     * @returns {Promise<import("./types.js").Answer | null>}
     */
    async answer(question, ctx) {
      // 1) danger: a fixed, reviewed safety reply, at once, even offline; nothing is sent anywhere
      const danger = detectDanger(question);
      if (danger) return { ...danger.answer, source: "rules" };

      const local = answerFromRules(question);

      if (remote && isRemoteEnabled()) {
        try {
          const online = await remote.answer(question, ctx);
          if (online) return local?.sos ? { ...online, sos: true } : online;
        } catch (err) {
          onRemoteError(/** @type {Error} */ (err));
        }
      }
      if (local) return local;
      // 2) she is venting and no law fits: listen instead of refusing
      return isVenting(question) ? { ...companionAnswer(), source: "rules" } : null;
    },
  };
}
