import { $ } from "../core/dom.js";
import { toast } from "../core/toast.js";

/**
 * All clicks are handled here, by event delegation on `document`, driven by data attributes
 * in the HTML. This keeps markup declarative: to make something clickable you add an attribute,
 * not a listener.
 *
 *   data-go="screen"            open a screen
 *   data-chat="ai|lawyer"       open the chat in that mode (+ data-lawyer name, data-topic)
 *   data-ask="question"         open the chat and ask (empty = just open)
 *   data-exit                   quick exit
 *   data-k="7"                  calculator key (disguise)
 *   data-mode="ai|lawyer"       chat mode tab
 *   data-country / data-dg / data-theme-set / data-setting / #steps .step / .stab
 *   data-action="name"          one of ACTIONS below
 *
 * The FIRST matching entry wins, so order matters (specific before generic).
 *
 * @param {{
 *   router, chat, sos, disguise, settings
 * }} ctx
 */
export function bindActions({ router, chat, sos, disguise, settings }) {
  const attr = (node, name) => node.getAttribute(name);

  /** Things a button can do by name; the ones marked "demo" are placeholders for the full version. */
  const ACTIONS = {
    google: () => settings.toggleAccount(),
    reset: () => settings.eraseEverything(),
    mic: () => toast("التسجيل الصوتي بيشتغل بالنسخة الكاملة. هلأ اكتبي سؤالك"), // demo
    soon: () => toast("رقم التواصل بينضاف بعد التحقق منه"), // demo
    callback: () => toast("نسخة العرض: بالنسخة الحقيقية المحامية بتتصل فيكِ على رقمك"), // demo
    keep: () => $("#q").focus(),
  };

  const handlers = [
    ["[data-exit]", () => disguise.quickExit()],
    ["[data-k]", (n) => disguise.pressKey(attr(n, "data-k"))],
    [
      "[data-mode]",
      (n) => {
        const next = attr(n, "data-mode");
        if (next !== chat.mode) chat.setMode(next);
      },
    ],
    [
      "[data-chat]",
      (n) => {
        router.show("chat");
        const next = attr(n, "data-chat");
        const topic = attr(n, "data-topic");
        if (next !== chat.mode || topic) chat.setMode(next, { name: attr(n, "data-lawyer"), topic });
      },
    ],
    ["[data-go]", (n) => router.show(attr(n, "data-go"))],
    [
      "[data-ask]",
      (n) => {
        const question = attr(n, "data-ask");
        if (question) chat.ask(question);
        else router.show("chat");
      },
    ],
    [".country[data-country]", (n) => settings.setCountry(attr(n, "data-country"))],
    ["#steps .step", (n) => sos.toggle(n)],
    [
      ".stab",
      (n) => {
        const cat = attr(n, "data-cat");
        document.querySelectorAll(".stab").forEach((t) => t.classList.toggle("on", t === n));
        document
          .querySelectorAll(".org")
          .forEach((o) => (o.hidden = !(cat === "all" || attr(o, "data-cat") === cat)));
      },
    ],
    ["[data-setting]", (n) => settings.toggle(attr(n, "data-setting"))],
    ["[data-theme-set]", (n) => settings.setTheme(attr(n, "data-theme-set"))],
    [".dg", (n) => settings.setDisguise(attr(n, "data-dg"), n.textContent.trim())],
    ["[data-action]", (n) => ACTIONS[attr(n, "data-action")]?.()],
  ];

  document.addEventListener("click", (event) => {
    for (const [selector, handle] of handlers) {
      const target = event.target.closest(selector);
      if (target) return handle(target);
    }
  });
}
