/**
 * Anonymous usage counters (opt-out in Settings). What leaves the device, and nothing else:
 *     { event: "visit" | "ask_ai" | ..., region: "ps-wb" | "ps-gaza", ms?: number }
 * No id, no cookie, no question text, no answer, no referrer. The server only increments a
 * counter (see server/api/worker.js POST /v1/ping). Never sent while the disguise is showing.
 *
 * @param {{
 *   endpoint: string,                       // "" disables everything
 *   state: ReturnType<import("../../core/state.js").createState>,
 *   store: ReturnType<import("../../core/store.js").createStore>,
 *   router: ReturnType<import("../../core/router.js").createRouter>,
 *   fetchImpl?: typeof fetch,
 * }} deps
 */
export function createTelemetry({
  endpoint,
  state,
  store,
  router,
  fetchImpl = globalThis.fetch?.bind(globalThis),
}) {
  const enabled = () => endpoint !== "" && state.get("stats") && router.current !== "disguise";

  function track(event, ms) {
    if (!enabled() || !fetchImpl) return;
    const body = { event, region: state.get("country") };
    if (typeof ms === "number") body.ms = Math.round(ms);
    try {
      Promise.resolve(
        fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        }),
      ).catch(() => {});
    } catch {
      /* analytics must never break the app */
    }
  }

  return {
    track,
    /** Once per app open; "return" only says this device has opened Fazaa before. */
    visit() {
      const returning = store.get("seen", false);
      store.set("seen", true);
      track(returning ? "visit_return" : "visit");
    },
  };
}
