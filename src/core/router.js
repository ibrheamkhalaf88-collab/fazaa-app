import { $, $$ } from "./dom.js";

/**
 * Screen switching. Every screen is a <section data-screen="name"> already in the page;
 * "navigating" just shows one and hides the rest. `data-cur` on #app lets CSS react to
 * the current screen (for example hiding the floating quick-exit on the chat screen).
 *
 * The last screen is remembered so reopening the app resumes there, except the
 * disguise, which must never be restored.
 *
 * @param {ReturnType<import("./store.js").createStore>} store
 */
export function createRouter(store) {
  let current = "welcome";
  const listeners = new Set();

  return {
    get current() {
      return current;
    },
    show(name) {
      for (const screen of $$(".screen")) {
        const on = screen.getAttribute("data-screen") === name;
        screen.hidden = !on;
        if (on) {
          screen.classList.remove("enter");
          void (/** @type {HTMLElement} */ (screen).offsetWidth); // restart the CSS animation
          screen.classList.add("enter");
        }
      }
      current = name;
      $("#app")?.setAttribute("data-cur", name);
      if (name !== "disguise") store.set("last", name);
      listeners.forEach((fn) => fn(name));
    },
    /** Subscribe to screen changes; returns an unsubscribe function. */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** The screen to open at startup. */
    restore() {
      const last = store.get("last", null);
      return last && last !== "disguise" ? last : "welcome";
    },
  };
}
