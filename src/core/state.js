/**
 * App settings: one small object, persisted key by key, with change notification.
 * Screens never read localStorage directly; they ask the state.
 */

export const DEFAULT_STATE = Object.freeze({
  theme: "light", // "auto" | "light" | "dark"; light by default (owner, 2026-11-20), she can change it in Settings
  country: "ps-gaza", // Gaza only for now (owner, 2026-11-19): the West Bank is out of the app until its laws are reviewed
  wipe: true, // clear chat + safety-plan ticks on quick exit
  pin: false, // reserved: real PIN lock is not implemented yet
  dg: "weather", // disguise: "weather" | "calc" | "notes"
  user: null, // demo sign-in name
  aiOnline: true, // owner's decision (2026-11-12): on by default, she can switch it off in Settings
  beta: "", // tester code for the closed AI beta (from ?beta=…); "" = not a tester
  memoryOn: false, // saved topics across visits (src/ai/saved.js): OFF unless she switches it on
  memoryDays: 30, // saved notes older than this are deleted on read
  stats: true, // anonymous usage counters (no ids, no text); user can switch off
});

export const COUNTRY_NAMES = Object.freeze({
  "": "المنطقة مش محددة",
  "ps-gaza": "فلسطين: قطاع غزة",
});

/** @param {ReturnType<import("./store.js").createStore>} store */
export function createState(store) {
  const state = {};
  const listeners = new Set();

  const load = () => {
    for (const [key, fallback] of Object.entries(DEFAULT_STATE)) state[key] = store.get(key, fallback);
    // a region saved before the app became Gaza-only («ps-wb» or not chosen) is Gaza now
    if (!(state.country in COUNTRY_NAMES) || !state.country) state.country = DEFAULT_STATE.country;
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
