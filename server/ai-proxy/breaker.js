/**
 * A small circuit breaker per provider model. When a model keeps failing (busy, over quota,
 * unreachable), the next questions stop waiting for it: they get an immediate "circuit-open" and the
 * app answers offline at once, instead of making a frightened woman wait 35 seconds for nothing.
 * After `coolMs` one question is let through again to test it.
 *
 * State lives in the Worker isolate's memory only (it resets on deploy or eviction). It holds model
 * names and counters, never a question or a key.
 */
export function createBreaker({ threshold = 3, coolMs = 60_000, now = () => Date.now() } = {}) {
  /** @type {Map<string, {fails: number, openUntil: number}>} */
  const states = new Map();
  return {
    /** May we call this model now? */
    allow(key) {
      const s = states.get(key);
      return !s || s.openUntil <= now();
    },
    success(key) {
      states.delete(key);
    },
    /** A transient failure (busy / unreachable). Config errors (bad key) must not be reported here. */
    failure(key) {
      const s = states.get(key) || { fails: 0, openUntil: 0 };
      s.fails += 1;
      if (s.fails >= threshold) {
        s.openUntil = now() + coolMs;
        s.fails = 0;
      }
      states.set(key, s);
    },
    /** For the dashboard / tests: which models are paused, and until when. */
    snapshot() {
      return [...states.entries()].filter(([, s]) => s.openUntil > now()).map(([key, s]) => ({ key, until: s.openUntil }));
    },
  };
}
