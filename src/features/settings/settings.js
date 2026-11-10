import { $, $$ } from "../../core/dom.js";
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
export function createSettings({ state, router, theme, chat, sos, aiAvailable }) {
  function render() {
    const country = state.get("country");
    $$(".country[data-country]").forEach((c) =>
      c.classList.toggle("sel", c.getAttribute("data-country") === country),
    );
    $("#chat-sub").textContent = `محادثة على جهازك · ${COUNTRY_NAMES[country].replace("فلسطين: ", "")}`;
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
      render();
      if (key === "aiOnline" && state.get(key)) {
        toast("هلأ أسئلتك بتنبعت لسيرفر فزعة عشان جواب أوضح. بتقدري تطفيها بأي وقت.");
      }
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
      chat.reset();
      state.reset(); // last, so nothing the resets above wrote to storage survives
      theme.apply();
      render();
      toast("انمسحت كل بياناتك من الجهاز");
      router.show("welcome");
    },
  };
}
