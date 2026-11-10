import { $, $$ } from "../../core/dom.js";

/**
 * Safety plan: a checklist whose ticks are remembered on the device and shown as a
 * progress bar. Wiped on quick exit when the user has "wipe on exit" on.
 *
 * @param {ReturnType<import("../../core/store.js").createStore>} store
 */
export function createSos(store) {
  const steps = () => $$("#steps .step");

  function render() {
    const all = steps().length;
    const done = steps().filter((s) => s.classList.contains("done")).length;
    $("#prog").style.width = `${Math.round((done / all) * 100)}%`;
    $("#done-card").hidden = done < all;
    store.set(
      "steps",
      steps().map((s) => s.classList.contains("done")),
    );
  }

  return {
    /** Restore ticks saved on this device. */
    restore() {
      const saved = store.get("steps", []) || [];
      saved.forEach((done, i) => done && steps()[i]?.classList.add("done"));
      render();
    },
    toggle(stepEl) {
      stepEl.classList.toggle("done");
      render();
    },
    reset() {
      steps().forEach((s) => s.classList.remove("done"));
      render();
    },
  };
}
