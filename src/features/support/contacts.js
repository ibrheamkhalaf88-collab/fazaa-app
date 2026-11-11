import {
  CONTACT_CATS,
  contactsFor,
  DEFAULT_CONTACTS,
  numberOf,
  validateContacts,
} from "../../data/contacts.js";
import { $, el, icon } from "../../core/dom.js";

const KEY = "contacts";
const ICON = { emergency: "i-alert", safe: "i-shield", law: "i-scale", mind: "i-brain" };
const TINT = {
  emergency: "background: var(--emphasis-soft); color: var(--emphasis)",
  safe: "background: var(--emphasis-soft); color: var(--emphasis)",
  law: "background: var(--primary-soft); color: var(--primary)",
  mind: "background: var(--primary-soft); color: var(--accent)",
};

/**
 * The support screen ("مين بيساعدني") and the emergency numbers, from the list the owner edits in
 * the dashboard. Last good list is kept on the device, so it works offline; built-in defaults
 * before the first download. Only public numbers travel here: nothing about her is sent.
 *
 * @param {{ store: ReturnType<import("../../core/store.js").createStore>,
 *           state: { get(k: string): any }, endpoint: string, fetchImpl?: typeof fetch }} deps
 */
export function createContacts({ store, state, endpoint, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  let list = DEFAULT_CONTACTS;
  try {
    const saved = store.get(KEY, null);
    if (saved) list = validateContacts(saved);
  } catch {
    /* a broken saved copy: keep the defaults */
  }

  async function refresh() {
    if (!endpoint || !fetchImpl) return;
    try {
      const res = await fetchImpl(endpoint, { headers: { accept: "application/json" } });
      if (!res.ok) return;
      list = validateContacts((await res.json()).contacts);
      store.set(KEY, list);
      render();
    } catch {
      /* offline or server down: keep what we have */
    }
  }

  function card(c) {
    const box = el("div", "org");
    box.setAttribute("data-cat", c.cat);
    const badge = el("span", "oi");
    badge.setAttribute("style", TINT[c.cat]);
    badge.appendChild(icon(ICON[c.cat]));
    const info = el("div");
    info.append(el("b", null, c.name));
    if (c.desc) info.append(el("small", null, c.desc));
    if (c.badge) info.append(el("span", "badge", c.badge));
    const acts = el("div", "acts");
    if (c.phone) {
      const call = el("a", "chip fill");
      call.href = `tel:${c.phone.replace(/[\s-]/g, "")}`;
      call.append(icon("i-phone"), document.createTextNode(`اتصلي ${c.phone}`));
      call.dir = "rtl";
      acts.append(call);
    }
    if (c.whatsapp) {
      const wa = el("a", c.phone ? "chip" : "chip fill");
      wa.href = `https://wa.me/${c.whatsapp.replace(/[^0-9]/g, "")}`;
      wa.target = "_blank";
      wa.rel = "noopener noreferrer";
      wa.append(icon("i-msg"), document.createTextNode("واتساب"));
      acts.append(wa);
    }
    if (!c.phone && !c.whatsapp) acts.append(el("span", "muted", "الرقم بينضاف قريباً"));
    info.append(acts);
    box.append(badge, info);
    return box;
  }

  /** Draw the list for her region into the support screen. */
  function render() {
    const root = $("#support-list");
    if (!root) return;
    const mine = contactsFor(list, state.get("country"));
    const cats = Object.keys(CONTACT_CATS).filter((cat) => mine.some((c) => c.cat === cat));
    root.replaceChildren(...cats.flatMap((cat) => mine.filter((c) => c.cat === cat).map(card)));
    const tabs = $("#stabs");
    if (tabs) {
      const tab = (cat, label, on = false) => {
        const b = el("button", on ? "stab on" : "stab", label);
        b.setAttribute("data-cat", cat);
        return b;
      };
      tabs.replaceChildren(tab("all", "الكل", true), ...cats.map((cat) => tab(cat, CONTACT_CATS[cat])));
    }
  }

  return {
    render,
    refresh,
    /** Numbers used inside the fixed emergency replies. */
    emergencyNumbers: () => ({ police: numberOf(list, "police"), ambulance: numberOf(list, "ambulance") }),
    get list() {
      return list;
    },
  };
}
