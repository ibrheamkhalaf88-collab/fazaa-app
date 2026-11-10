import { CALC_CODE } from "../../config.js";
import { $ } from "../../core/dom.js";
import { createCalculator } from "./calculator.js";

/**
 * Quick exit: one tap (or Esc) replaces the app with an innocent-looking screen.
 * If "wipe on exit" is on, the chat and safety-plan progress are erased first.
 *
 * Disguises are static HTML written here (trusted, never built from user input).
 * Each has its own secret way back, shown in Settings.
 */

const DISGUISES = {
  weather: `<span class="city">رام الله</span><button class="temp" data-back aria-label="الحرارة">١٨°</button><b class="fw-5">غائم جزئياً</b><span class="muted">العظمى ٢١° · الصغرى ١٢°</span><div class="hours"><div>الآن<b>١٨°</b></div><div>١ م<b>٢٠°</b></div><div>٤ م<b>١٩°</b></div><div>٧ م<b>١٦°</b></div><div>١٠ م<b>١٤°</b></div></div><div class="wdays"><div>السبت<b>٢٠°</b></div><div>الأحد<b>١٩°</b></div><div>الاثنين<b>١٧°</b></div><div>الثلاثاء<b>١٨°</b></div></div>`,
  calc: `<div class="calc" dir="ltr"><div class="out" id="calc-out" aria-live="polite">0</div><div class="keys"><button data-k="C" class="fn">C</button><button data-k="±" class="fn">±</button><button data-k="%" class="fn">%</button><button data-k="÷" class="op">÷</button><button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button><button data-k="×" class="op">×</button><button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button><button data-k="−" class="op">−</button><button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button><button data-k="+" class="op">+</button><button data-k="0" class="zero">0</button><button data-k=".">.</button><button data-k="=" class="op">=</button></div></div>`,
  notes: `<b class="notes-title">ملاحظاتي</b><div class="notes-list"><button class="temp note-item" data-back>أغراض البيت: خبز، حليب، بندورة</button><div class="note-item">موعد الدكتور الخميس ١٠ الصبح</div><div class="note-item">عيد ميلاد سارة الشهر الجاي</div></div>`,
};

const TAB_TITLES = { weather: "الطقس", calc: "الآلة الحاسبة", notes: "ملاحظات" };
const APP_TITLE = "سَنَد";

/** How to get back, per disguise (shown in Settings). */
export const DISGUISE_HINTS = {
  weather: "للرجوع لسند: اضغطي مرتين على الرقم الكبير",
  calc: `للرجوع لسند: اكتبي ${CALC_CODE} ثم =`,
  notes: "للرجوع لسند: اضغطي مرتين على أول ملاحظة",
};

/**
 * @param {{
 *   state: ReturnType<import("../../core/state.js").createState>,
 *   store: ReturnType<import("../../core/store.js").createStore>,
 *   router: ReturnType<import("../../core/router.js").createRouter>,
 *   wipe: () => void,  // erases chat + safety-plan progress
 * }} deps
 */
export function createDisguise({ state, store, router, wipe }) {
  const calculator = createCalculator(CALC_CODE);
  let returnTo = "home";

  function renderCalculator() {
    const out = $("#calc-out");
    if (!out) return;
    const text = calculator.display;
    out.textContent = text;
    out.style.fontSize = text.length > 9 ? "34px" : text.length > 6 ? "46px" : "62px";
  }

  function quickExit() {
    if (router.current !== "disguise") returnTo = router.current;
    const wiping = state.get("wipe");
    if (wiping) wipe();

    const dg = state.get("dg");
    const city = state.get("country") === "ps-gaza" ? "غزة" : "رام الله";
    // DISGUISES are fixed templates written in this file, never user text.
    // eslint-disable-next-line no-restricted-properties
    $("#disguise-view").innerHTML = DISGUISES[dg].replace("رام الله", city);
    calculator.reset();
    renderCalculator();
    router.show("disguise");
    if (wiping) store.set("last", "home"); // do not reopen into the chat that was just wiped
    document.title = TAB_TITLES[dg];
  }

  function leave() {
    document.title = APP_TITLE;
    router.show(returnTo === "welcome" || returnTo === "country" ? returnTo : "home");
  }

  /** A calculator key was pressed (button or keyboard). */
  function pressKey(key) {
    if (calculator.press(key).unlocked) {
      renderCalculator();
      leave();
      return;
    }
    renderCalculator();
  }

  function bindGlobalInput() {
    // double-click / double-tap on the secret element returns to the app
    document.addEventListener("dblclick", (e) => {
      if (e.target.closest("[data-back]")) leave();
    });
    let lastTap = 0;
    document.addEventListener("touchend", (e) => {
      if (!e.target.closest("[data-back]")) return;
      const now = Date.now();
      if (now - lastTap < 350) {
        e.preventDefault();
        leave();
      }
      lastTap = now;
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && router.current !== "disguise") return quickExit();
      if (router.current !== "disguise" || state.get("dg") !== "calc") return;
      const map = { "*": "×", "/": "÷", "-": "−", Enter: "=", Backspace: "C", Delete: "C", Escape: "C" };
      const key = map[e.key] ?? e.key;
      if (/^[0-9.+×÷−=%C]$/.test(key)) {
        e.preventDefault();
        pressKey(key);
      }
    });
  }

  return { quickExit, leave, pressKey, bindGlobalInput };
}
