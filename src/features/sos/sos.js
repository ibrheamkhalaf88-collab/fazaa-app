import { $, $$, el, icon } from "../../core/dom.js";
import { DEFAULT_PLAN, SAFETY_PLANS } from "../../data/safety-plans.js";

/**
 * Safety plan: one checklist per kind of danger (src/data/safety-plans.js), chosen by the reply that
 * opened it (data-plan) or by the tabs on the screen.
 *
 * Ticks live in memory only (since 2026-11-13): a list of ticked steps saved on the phone told anyone
 * who opens it that she was following a safety plan. Quick exit / wipe clears them.
 *
 * @param {ReturnType<import("../../core/store.js").createStore>} store
 */
export function createSos(store) {
  let plan = DEFAULT_PLAN;
  const ticks = {}; // plan id -> Set of step indexes (RAM only)

  const steps = () => $$("#steps .step");

  function renderProgress() {
    const all = steps().length || 1;
    const done = steps().filter((s) => s.classList.contains("done")).length;
    const prog = $("#prog");
    if (prog) prog.style.width = `${Math.round((done / all) * 100)}%`;
    const card = $("#done-card");
    if (card) card.hidden = done < steps().length || steps().length === 0;
  }

  function renderPlan() {
    const p = SAFETY_PLANS[plan];
    const root = $("#steps");
    if (!root) return;
    const head = $("#sos-title");
    if (head) head.textContent = p.title;
    const hint = $("#sos-hint");
    if (hint) hint.textContent = p.hint;
    const tabs = $("#sos-plans");
    if (tabs)
      tabs.replaceChildren(
        ...Object.entries(SAFETY_PLANS).map(([id, x]) => {
          const b = el("button", id === plan ? "chip fill" : "chip", x.label);
          b.type = "button";
          b.setAttribute("data-plan", id);
          b.setAttribute("aria-pressed", String(id === plan));
          return b;
        }),
      );
    const mine = (ticks[plan] ||= new Set());
    root.replaceChildren(
      ...p.steps.map(([title, small], i) => {
        const b = el("button", mine.has(i) ? "step done" : "step");
        b.type = "button";
        b.dataset.i = String(i);
        const box = el("span", "box");
        box.appendChild(icon("i-check", "ic ic-16"));
        const text = el("span");
        text.append(el("b", "fw-5", title), el("small", null, small));
        b.append(box, text);
        return b;
      }),
    );
    renderProgress();
  }

  return {
    /** Old builds saved ticks on the device: remove them (they were a trace). */
    restore() {
      store.remove?.("steps");
      renderPlan();
    },
    /** Open a plan: "blackmail" | "violence" | "selfharm" | "forced". */
    show(id) {
      if (SAFETY_PLANS[id]) plan = id;
      renderPlan();
    },
    get plan() {
      return plan;
    },
    toggle(stepEl) {
      const mine = (ticks[plan] ||= new Set());
      const i = Number(stepEl.dataset.i);
      if (mine.has(i)) mine.delete(i);
      else mine.add(i);
      stepEl.classList.toggle("done", mine.has(i));
      renderProgress();
    },
    reset() {
      for (const k of Object.keys(ticks)) delete ticks[k];
      plan = DEFAULT_PLAN;
      renderPlan();
    },
  };
}
