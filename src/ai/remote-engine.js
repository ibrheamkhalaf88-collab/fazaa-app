import { articlesFor } from "../data/law/index.js";
import { MAX_MESSAGE_CHARS } from "./limits.js";
import { validateAnswer, validateChat, validateTalk } from "./validate.js";

/**
 * Client for the AI endpoint (the staff API's /api/v1/answer, or server/ai-proxy).
 *
 * What is sent (and nothing else): her message, the region, what kind of reply she needs
 * (listen / understand / steps / legal) and, ONLY if she agreed to share context, the last few
 * messages of this session plus the limits she stated ("no money", "phone is checked").
 * Never: a user id, the lawyer chat, her account, her name or phone, cookies (credentials: "omit").
 *
 * The message is never cut: a longer one is refused here, and the app tells her before sending.
 *
 * @param {{endpoint: string, timeoutMs?: number, fetchImpl?: typeof fetch}} opts
 */
export function createRemoteEngine({
  endpoint,
  timeoutMs = 45000 /* the server may wait for a busy model, then try a backup one */,
  fetchImpl = fetch,
  beta = () => "", // closed-beta tester code (not an identity: the same code for every tester)
}) {
  return {
    /**
     * The AI-first chat: this device's conversation as role-tagged turns (the last one is hers).
     * @param {{role: "user"|"assistant", text: string}[]} turns
     * @param {{country: string, signal?: AbortSignal}} ctx
     * @returns {Promise<object | null>}
     */
    async chat(turns, ctx) {
      const last = turns.at(-1)?.text || "";
      if (last.length > MAX_MESSAGE_CHARS) throw new Error("message-too-long");
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal =
        ctx.signal && AbortSignal.any ? AbortSignal.any([ctx.signal, timeout]) : ctx.signal || timeout;
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal,
        body: JSON.stringify({ messages: turns, country: ctx.country, ...(beta() ? { beta: beta() } : {}) }),
      });
      if (!res.ok) throw new Error(`proxy-status-${res.status}`);
      const data = await res.json();
      if (data.answer == null) return null;
      // a fixed safety reply from the server (danger seen there)
      if (data.answer.source === "rules") return { ...data.answer, source: "rules" };
      // checked again here: the app trusts its own rules, not the server's word
      const articles = articlesFor(ctx.country);
      return validateChat(data.answer, { articleIds: Object.keys(articles), articles, region: ctx.country });
    },

    /**
     * @param {string} message
     * @param {{country: string, need?: string, context?: object, signal?: AbortSignal}} ctx
     * @returns {Promise<object | null>}  null = the server has nothing it can stand behind
     * @throws on network error, timeout, abort, bad status or an answer that fails validation
     */
    async answer(message, ctx) {
      if (message.length > MAX_MESSAGE_CHARS) throw new Error("message-too-long");
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal =
        ctx.signal && AbortSignal.any ? AbortSignal.any([ctx.signal, timeout]) : ctx.signal || timeout;
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal,
        body: JSON.stringify({
          question: message,
          country: ctx.country,
          ...(ctx.need ? { need: ctx.need } : {}),
          ...(ctx.context ? { context: ctx.context } : {}),
          ...(beta() ? { beta: beta() } : {}),
        }),
      });
      if (!res.ok) throw new Error(`proxy-status-${res.status}`);
      const data = await res.json();
      if (data.answer == null) return null;
      // checked again here: the app trusts its own rules, not the server's word
      if (data.answer.kind === "talk") return validateTalk(data.answer, { need: ctx.need });
      const articles = articlesFor(ctx.country);
      return validateAnswer(data.answer, {
        articleIds: Object.keys(articles),
        articles,
        region: ctx.country,
      });
    },
  };
}
