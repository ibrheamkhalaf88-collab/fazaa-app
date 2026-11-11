import { $$, el, icon } from "../../core/dom.js";

/** [screen, icon id, label]. "Emergency and support" is one tab that covers two screens (sos + support). */
const TABS = [
  ["home", "i-home", "الرئيسية"],
  ["chat", "i-chat", "اسألي"],
  ["sos", "i-alert", "طوارئ ودعم"],
  ["lawyer", "i-scale", "محامية"],
];

/** Screens that light up another screen's tab. */
const TAB_OF = { support: "sos" };

/** Fill every <nav data-tabs="screen"> with the tab bar, marking its own screen as active. */
export function renderTabs() {
  for (const nav of $$("nav[data-tabs]")) {
    const raw = nav.getAttribute("data-tabs");
    const current = TAB_OF[raw] || raw;
    nav.replaceChildren(
      ...TABS.map(([screen, ic, label]) => {
        const cls = [screen === "sos" ? "urgent" : "", screen === current ? "on" : ""].join(" ").trim();
        const button = el("button", cls);
        button.setAttribute("data-go", screen);
        button.append(icon(ic), document.createTextNode(label));
        return button;
      }),
    );
  }
}
