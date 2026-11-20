import { useAddedArticles } from "./index.js";

/**
 * Law articles a lawyer added in the dashboard and a second lawyer approved (2026-11-17). The app needs them
 * to show the original text under an answer that cites one, and to answer «شو بتقول المادة …؟» offline.
 * The last list is kept on the device (public law, nothing personal), so they work without a connection.
 *
 * @param {{store: {get: Function, set: Function}, endpoint: string, fetchImpl?: typeof fetch}} deps
 */
export function createAddedLaws({ store, endpoint, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  useAddedArticles(store.get("addedLaws", []));

  return {
    /** Fetch the current list; a failure keeps the cached one. */
    async refresh() {
      if (!endpoint || !fetchImpl) return;
      try {
        const res = await fetchImpl(endpoint, { credentials: "omit", cache: "no-store" });
        if (!res.ok) return;
        const { articles } = await res.json();
        if (!Array.isArray(articles)) return;
        store.set("addedLaws", articles);
        useAddedArticles(articles);
      } catch {
        /* offline: the cached list stays */
      }
    },
  };
}
