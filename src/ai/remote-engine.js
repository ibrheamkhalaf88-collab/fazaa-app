import { articlesFor } from "../data/law/index.js";
import { validateAnswer } from "./validate.js";

const MAX_QUESTION_CHARS = 500;

/**
 * Client for the AI proxy (server/ai-proxy). Opt-in only: the caller decides whether
 * the user has agreed to send the question online.
 *
 * Privacy contract of the request body: the question text (truncated) and the country.
 * No user id, no chat history, no device info, no cookies (credentials: "omit").
 *
 * @param {{endpoint: string, timeoutMs?: number, fetchImpl?: typeof fetch}} opts
 */
export function createRemoteEngine({ endpoint, timeoutMs = 12000, fetchImpl = fetch }) {
  return {
    /**
     * @param {string} question
     * @param {import("./types.js").AskContext} ctx
     * @returns {Promise<import("./types.js").Answer | null>}
     *          null = the server says the corpus does not cover this question
     * @throws on network error, timeout, bad status or an answer that fails validation
     */
    async answer(question, ctx) {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ question: question.slice(0, MAX_QUESTION_CHARS), country: ctx.country }),
      });
      if (!res.ok) throw new Error(`proxy-status-${res.status}`);
      const data = await res.json();
      if (data.answer == null) return null;
      return validateAnswer(data.answer, { articleIds: Object.keys(articlesFor(ctx.country)) });
    },
  };
}
