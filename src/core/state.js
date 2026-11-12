/**
 * App settings: one small object, persisted key by key, with change notification.
 * Screens never read localStorage directly; they ask the state.
 */

export const DEFAULT_STATE = Object.freeze({
  theme: "auto", // "auto" | "light" | "dark"
  country: "ps-wb", // "ps-wb" | "ps-gaza"
  wipe: true, // clear chat + safety-plan ticks on quick exit
  pin: false, // reserved: real PIN lock is not implemented yet
  dg: "weather", // disguise: "weather" | "calc" | "notes"
  user: null, // demo sign-in name
  aiOnline: true, // owner's decision (2026-11-12): on by default, she can switch it off in Settings
  stats: true, // anonymous usage counters (no ids, no text); user can switch off
});

export const COUNTRY_NAMES = Object.freeze({
  "ps-wb": "فلسطين: الضفة الغربية",
  "ps-gaza": "فلسطين: قطاع غزة",
});

/** @param {ReturnType<import("./store.js").createStore>} store */
export function createState(store) {
  const state = {};
  const listeners = new Set();

  const load = () => {
    for (const [key, fallback] of Object.entries(DEFAULT_STATE)) state[key] = store.get(key, fallback);
  };
  load();

  return {
    get: (key) => state[key],
    set(key, value) {
      state[key] = value;
      store.set(key, value);
      listeners.forEach((fn) => fn(key, value));
    },
    /** Subscribe to changes; returns an unsubscribe function. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Back to defaults (also clears persisted values). */
    reset() {
      store.clear();
      for (const [key, value] of Object.entries(DEFAULT_STATE)) state[key] = value;
      listeners.forEach((fn) => fn("*", null));
    },
  };
}
