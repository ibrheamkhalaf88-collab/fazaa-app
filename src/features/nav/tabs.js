import { $$ } from "../../core/dom.js";

/** [screen, icon id, label]. The SOS tab is styled as the raised centre button (components.css). */
const TABS = [
  ["home", "i-home", "الرئيسية"],
  ["chat", "i-chat", "اسألي"],
  ["sos", "i-alert", "طوارئ"],
  ["lawyer", "i-scale", "محامية"],
  ["support", "i-hands", "الدعم"],
];

/** Fill every <nav data-tabs="screen"> with the tab bar, marking its own screen as active. */
export function renderTabs() {
  for (const nav of $$("nav[data-tabs]")) {
    const current = nav.getAttribute("data-tabs");
    nav.innerHTML = TABS.map(([screen, ic, label]) => {
      const cls = [screen === "sos" ? "sos" : "", screen === current ? "on" : ""].join(" ").trim();
      return `<button data-go="${screen}" class="${cls}"><svg class="ic"><use href="#${ic}"/></svg>${label}</button>`;
    }).join("");
  }
}
