import { $, $$, el } from "../../core/dom.js";
import { COUNTRY_NAMES } from "../../core/state.js";
import { toast } from "../../core/toast.js";
import { DISGUISE_HINTS } from "../disguise/disguise.js";

/**
 * Settings screen + the bits of other screens that mirror a setting
 * (greeting name, chat subtitle). `render()` is idempotent: call it after any change.
 *
 * @param {{
 *   state: ReturnType<import("../../core/state.js").createState>,
 *   router: ReturnType<import("../../core/router.js").createRouter>,
 *   theme: ReturnType<import("./theme.js").createTheme>,
 *   chat: ReturnType<import("../chat/chat.js").createChat>,
 *   sos: ReturnType<import("../sos/sos.js").createSos>,
 *   aiAvailable: boolean,   // false when no AI endpoint is configured
 * }} deps
 */
export function createSettings({ state, router, theme, chat, sos, aiAvailable, saved = null }) {
  /** The saved topics, only when she switched the feature on; built with DOM nodes, never HTML. */
  function renderSaved() {
    const box = $("#saved-topics");
    if (!box) return;
    box.replaceChildren();
    if (!saved || state.get("memoryOn") !== true) return;
    const list = saved.list();
    if (!list.length) {
      box.appendChild(el("p", "fine", "ما في مواضيع محفوظة لهلأ."));
      return;
    }
    for (const t of list) {
      const card = el("div", "saved-topic");
      card.appendChild(el("b", null, t.title));
      const notes = el("ul", "opts");
      t.facts.forEach((f, i) => {
        const li = el("li", null, f);
        const fix = el("button", "chip", "مش صح، احذفيها");
        fix.setAttribute("data-forget-fact", `${t.id}|${i}`);
        li.appendChild(fix);
        notes.appendChild(li);
      });
      card.appendChild(notes);
      const acts = el("div", "acts");
      const cont = el("button", "chip", "كمّلي هالموضوع");
      cont.setAttribute("data-ask", `بدي نكمل موضوع ${t.title}`);
      const del = el("button", "chip", "احذفي الموضوع");
      del.setAttribute("data-forget", t.id);
      acts.append(cont, del);
      card.appendChild(acts);
      box.appendChild(card);
    }
    const all = el("button", "chip", "احذفي كل المواضيع المحفوظة");
    all.setAttribute("data-forget", "*");
    box.appendChild(all);
  }

  function render() {
    renderSaved();
    const country = state.get("country");
    $$(".country[data-country]").forEach((c) =>
      c.classList.toggle("sel", c.getAttribute("data-country") === country),
    );
    const where = aiAvailable && state.get("aiOnline") ? "أجوبة عبر الإنترنت" : "أجوبة من جهازك بس";
    $("#chat-sub").textContent = `${where} · ${COUNTRY_NAMES[country].replace("فلسطين: ", "")}`;
    $("#set-country").textContent = COUNTRY_NAMES[country];

    $$("[data-setting]").forEach((t) =>
      t.setAttribute("aria-checked", String(Boolean(state.get(t.getAttribute("data-setting"))))),
    );
    $$(".dg").forEach((d) => d.classList.toggle("sel", d.getAttribute("data-dg") === state.get("dg")));
    $("#dg-hint").textContent = DISGUISE_HINTS[state.get("dg")] || "";

    // online AI row: a toggle when an endpoint is configured, a "soon" badge otherwise
    $("#ai-toggle").hidden = !aiAvailable;
    $("#ai-soon").hidden = aiAvailable;

    const user = state.get("user");
    $("#hello-name").textContent = user ? `مرحبا ${user}` : "مرحبا فيكِ";
    $("#acct-name").textContent = user || "إنتِ داخلة كضيفة";
    $("#acct-sub").textContent = user ? "مربوطة بـ Google (تجريبي)" : "ما في أي حساب مربوط";
    $("#acct-btn").textContent = user ? "فك الربط" : "ربط Google";
  }

  return {
    render,

    setCountry(id) {
      state.set("country", id);
      render();
    },
    setTheme(value) {
      state.set("theme", value);
      theme.apply();
    },
    setDisguise(id, label) {
      state.set("dg", id);
      render();
      toast(`لما تطلعي بسرعة، فزعة رح تبيّن كأنها ${label}`);
    },
    toggle(key) {
      state.set(key, !state.get(key));
      // switching memory off withdraws consent: everything saved is deleted at once
      if (key === "memoryOn" && !state.get(key)) saved?.clear();
      render();
      if (key === "memoryOn")
        toast(
          state.get(key)
            ? "شغّلناه. بنحفظ ملاحظات قصيرة عن المواضيع على هالجهاز بس، وبتقدري تحذفيها من هون بأي وقت."
            : "طفّيناه، وانمسحت كل المواضيع المحفوظة.",
        );
      if (key === "aiOnline")
        toast(
          state.get(key)
            ? "هلأ أسئلتك بتنبعت لسيرفر فزعة عشان جواب أوضح. بتقدري تطفيها بأي وقت."
            : "طفّيناها. الأجوبة هلأ من جهازك بس، بدون نت.",
        );
    },
    /** Delete one saved topic ("*" = all) or one note in it ("id|index"). */
    forget(id) {
      if (id === "*") saved?.clear();
      else saved?.remove(id);
      render();
      toast(id === "*" ? "انحذفت كل المواضيع المحفوظة" : "انحذف الموضوع");
    },
    forgetFact(ref) {
      const [id, index] = String(ref).split("|");
      saved?.removeFact(id, Number(index));
      render();
      toast("انحذفت الملاحظة");
    },
    /** Demo sign-in (no real Google flow yet). */
    toggleAccount() {
      if (state.get("user")) {
        state.set("user", null);
        render();
        toast("فكّينا الربط مع Google");
        return;
      }
      state.set("user", "ريم");
      render();
      toast("نسخة العرض: الدخول بـ Google تجريبي");
      if (router.current === "welcome") router.show("country");
    },
    /** "Delete all my data": everything stored on the device, then back to the welcome screen. */
    eraseEverything() {
      sos.reset();
      chat.reset({ signOut: true });
      state.reset(); // last, so nothing the resets above wrote to storage survives
      theme.apply();
      render();
      toast("انمسحت كل بياناتك من الجهاز");
      router.show("welcome");
    },
  };
}
