import { $, $$ } from "../../core/dom.js";

/**
 * First-run introduction: what the app is, how to use it, privacy, quick exit.
 * Shown once (remembered in the store) and reachable again from the welcome screen.
 * Leaving it, by finishing or skipping, always opens the welcome screen.
 *
 * @param {{ store: ReturnType<import("../../core/store.js").createStore>, router: ReturnType<import("../../core/router.js").createRouter> }} deps
 */
export function createIntro({ store, router }) {
  const root = $('[data-screen="intro"]');
  const slides = $$("[data-slide]", root);
  const dots = $$(".dots i", root);
  const next = $('[data-intro="next"]', root);
  const back = $('[data-intro="back"]', root);
  let index = 0;

  function render() {
    slides.forEach((s, i) => (s.hidden = i !== index));
    dots.forEach((d, i) => d.classList.toggle("on", i === index));
    back.hidden = index === 0;
    next.textContent = index === slides.length - 1 ? "ابدئي" : "التالي";
  }

  function finish() {
    store.set("introSeen", true);
    index = 0;
    render();
    router.show("welcome");
  }

  root.addEventListener("click", (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest("[data-intro]");
    if (!button) return;
    const action = button.getAttribute("data-intro");
    if (action === "skip") return finish();
    if (action === "back") index = Math.max(0, index - 1);
    if (action === "next") {
      if (index === slides.length - 1) return finish();
      index += 1;
    }
    render();
  });

  // re-opened from the welcome screen: start from the first slide again
  router.onChange((name) => {
    if (name === "intro") {
      index = 0;
      render();
    }
  });

  render();

  return {
    /** The first screen: the intro until it has been seen, otherwise wherever the user left off. */
    startScreen: () => (store.get("introSeen", false) ? router.restore() : "intro"),
  };
}
