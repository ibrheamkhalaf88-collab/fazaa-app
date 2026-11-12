import { TYPING_DELAY } from "../../config.js";
import { ARTICLES } from "../../data/law/index.js";
import { $, $$, chip, el, icon } from "../../core/dom.js";
import { append, messageList, scrollChat, systemNote, typingBubble } from "./messages.js";
import { createLawyerSession } from "./lawyer-session.js";
import { START_CHIPS } from "../../ai/smalltalk.js";
import { lawMeta } from "../../ai/legal.js";
import { MAX_MESSAGE_CHARS } from "../../ai/limits.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SUGGESTIONS = [
  ["حدا بيهددني بصوري", "حدا عم يهددني ينشر صوري إذا ما بعتله مصاري"],
  ["شو عقوبة الابتزاز؟", "شو عقوبة الابتزاز الإلكتروني؟"],
  ["بدي حدا يسمعني", "بدي حدا يسمعني بس"],
];

/** Bump when the text of the AI notice changes: everyone sees the new notice once. */
export const AI_NOTICE_VERSION = "2026-11-12";

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * The chat screen. Two modes share one message list:
 *   "ai"     the assistant: offline rules, or the online AI after she saw what is sent
 *   "lawyer" a human lawyer via the staff API, or an honest "not available" when it is not set up
 *
 * Every reply in flight is tied to an AbortController and an epoch: wiping the chat, quick exit or
 * switching mode cancels it, and a late reply is dropped (it never repaints or refills the memory).
 *
 * @param {{
 *   state: ReturnType<import("../../core/state.js").createState>,
 *   router: ReturnType<import("../../core/router.js").createRouter>,
 *   answerer: ReturnType<import("../../ai/answerer.js").createAnswerer>,
 *   telemetry?: any,
 *   lawyer?: any,
 *   lawyerAvailable?: () => boolean,
 *   aiOnline?: () => boolean,     // the online AI is configured AND switched on
 * }} deps
 */
export function createChat({
  state,
  router,
  answerer,
  telemetry,
  lawyer = createLawyerSession(),
  lawyerAvailable = () => false,
  aiOnline = () => false,
}) {
  let mode = "ai";
  /** Bumped by reset() and mode changes: a reply that arrives later is dropped. */
  let epoch = 0;
  let controller = null;
  let busy = false;

  /* ---------- rendering ---------- */

  /** An expandable card with the verbatim article text, its source and its review status. */
  function citationCard(id, open = false) {
    const article = ARTICLES[id];
    const meta = lawMeta(id);
    const card = el("details", "cite");
    card.open = open;

    const summary = el("summary");
    const label = el("div");
    label.append(el("b", null, `المادة ${id.replace(/^[a-z]+:/, "")}: ${article.topic}`), el("span", null, `${article.lawName}. النص الأصلي`));
    summary.append(icon("i-file"), label);

    const law = el("div", "law");
    law.appendChild(document.createTextNode(article.text));
    if (article.amended) law.appendChild(document.createTextNode(`\n\n${article.amended}.`));
    law.appendChild(document.createTextNode("\n\nالمصدر: "));
    const link = el("a", null, hostOf(article.url) || "رابط المصدر");
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    law.appendChild(link);
    if (meta?.review?.status !== "reviewed")
      law.appendChild(document.createTextNode("\nلسا ما راجعت محامية هالنص ولا تأكدت إنه النص النافذ اليوم."));

    card.append(summary, law);
    return card;
  }

  /** Buttons under a reply: only what really exists now. */
  function actionsFor(answer) {
    const actions = el("div", "acts");
    if (answer.sos)
      actions.appendChild(chip({ label: "افتحي خطة الأمان", iconId: "i-shield", fill: true, data: { go: "sos" } }));
    if (lawyerAvailable() && (answer.general || answer.cites?.length))
      actions.appendChild(
        chip({ label: "احكي مع محامية", iconId: "i-phone", fill: !answer.sos, data: { chat: "lawyer", topic: answer.topic || "" } }),
      );
    actions.appendChild(chip({ label: "مين بيساعدني", iconId: "i-hands", data: { go: "support" } }));
    return actions;
  }

  /** Where the words came from, said plainly. */
  function sourceLine(answer) {
    if (answer.source !== "ai") return null;
    return el(
      "div",
      "src",
      answer.cites?.length
        ? "كتبه ذكاء اصطناعي من نص القانون المذكور. اقرئي النص للتأكد، وهاد مش استشارة قانونية."
        : "كتبه ذكاء اصطناعي. مش معلومة قانونية ومش استشارة.",
    );
  }

  /** A greeting reply: just the words and topics she can tap. */
  function renderChat(answer) {
    const box = el("div", "a");
    box.appendChild(el("div", null, answer.lead));
    if (answer.chips?.length) {
      const acts = el("div", "acts");
      for (const [label, question] of answer.chips) acts.appendChild(chip({ label, data: { ask: question } }));
      box.appendChild(acts);
    }
    return box;
  }

  /** Listening / understanding / small options / safety: short, at most one question. */
  function renderTalk(answer) {
    const box = el("div", "a");
    box.appendChild(el("div", null, answer.lead));
    if (answer.options?.length) {
      const list = el("ul", "opts");
      for (const o of answer.options) list.appendChild(el("li", null, o));
      box.appendChild(list);
    }
    if (answer.ask) box.appendChild(el("div", "ask", answer.ask));
    if (answer.note) box.appendChild(el("div", "note-line general", answer.note));
    const src = sourceLine(answer);
    if (src) box.appendChild(src);
    if (answer.sos || answer.general) box.appendChild(actionsFor(answer));
    return box;
  }

  /** «شو بتقول المادة 15؟»: the article itself. */
  function renderArticle(answer) {
    const box = el("div", "a");
    box.appendChild(el("div", null, answer.lead));
    answer.cites.forEach((id, i) => box.appendChild(citationCard(id, i === 0)));
    if (answer.note) box.appendChild(el("div", "note-line", answer.note));
    if (answer.ask) box.appendChild(el("div", "ask", answer.ask));
    for (const line of answer.scope || []) box.appendChild(el("div", "note-line general", line));
    box.appendChild(actionsFor({ ...answer, general: true }));
    return box;
  }

  function renderAnswer(answer) {
    if (answer.kind === "chat") return renderChat(answer);
    if (answer.kind === "talk") return renderTalk(answer);
    if (answer.kind === "article") return renderArticle(answer);
    const box = el("div", "a");
    box.appendChild(el("div", null, answer.lead));

    // 1) what the law says, in plain words (only when a text is cited)
    if (answer.cites.length) {
      box.appendChild(el("div", "sec", "شو بيقول النص"));
      if (answer.note) box.appendChild(el("div", "note-line", answer.note));
    } else if (answer.note) {
      box.appendChild(el("div", "note-line general", answer.note));
    }
    for (const line of answer.scope || []) box.appendChild(el("div", "note-line general", line));

    // 2) small options she can choose from
    if (answer.steps?.length) {
      box.appendChild(el("div", "sec", "خيارات ممكن تساعدك"));
      const list = el("ol");
      for (const step of answer.steps) list.appendChild(el("li", null, step));
      box.appendChild(list);
    }

    // 3) the original article text, so she can check the summary herself
    if (answer.cites.length) {
      box.appendChild(el("div", "sec", "نص القانون الأصلي"));
      answer.cites.forEach((id, i) => box.appendChild(citationCard(id, i === 0)));
    }
    if (answer.safetyAsk) box.appendChild(el("div", "ask", answer.safetyAsk));
    const src = sourceLine(answer);
    if (src) box.appendChild(src);
    box.appendChild(actionsFor(answer));
    return box;
  }

  /**
   * Nothing answered (offline and no rule fits, or the AI was unreachable): never a cold refusal and
   * never a guess.
   */
  function renderNotCovered() {
    const box = el("div", "a");
    box.appendChild(el("div", null, "ما عندي جواب أكيد على هاد، وما بدي أعطيكِ معلومة مش متأكدة منها."));
    box.appendChild(el("div", "gap-top", "إذا بدك، احكيلي شو اللي صاير معك، أو اختاري موضوع:"));
    const topics = el("div", "acts");
    for (const [label, question] of START_CHIPS) topics.appendChild(chip({ label, data: { ask: question } }));
    box.appendChild(topics);
    box.appendChild(actionsFor({ general: true }));
    return box;
  }

  /* ---------- the one-time notice before anything is sent to the AI provider ---------- */

  function needsNotice() {
    return aiOnline() && state.get("aiNotice") !== AI_NOTICE_VERSION;
  }

  /** @returns {Promise<"message"|"context"|"offline">} */
  function askNotice() {
    return new Promise((resolve) => {
      const box = el("div", "a notice");
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", "قبل ما نبعت رسالتك");
      box.append(
        el("b", null, "قبل ما أبعت رسالتك"),
        el(
          "div",
          null,
          "لجواب أوضح، رسالتك بتنبعت عبر سيرفر فزعة لخدمة ذكاء اصطناعي خارجية. اللي بينبعت: نص الرسالة ومنطقتك بس. ما بينبعت اسمك ولا رقمك ولا محادثتك مع المحامية.",
        ),
        el(
          "div",
          "muted",
          "إذا اخترتي «مع آخر الرسائل»، بتنبعت كمان آخر 6 رسائل من هالجلسة عشان أفهم عليكِ أحسن. ما بنحفظ رسايلك بالسيرفر، بس مزوّد الخدمة ممكن يحتفظ فيها فترة قصيرة حسب شروطه.",
        ),
      );
      const row = el("div", "acts");
      const choose = (choice) => {
        box.remove();
        resolve(choice);
      };
      const b1 = chip({ label: "موافقة، رسالتي بس", fill: true });
      const b2 = chip({ label: "موافقة مع آخر الرسائل" });
      const b3 = chip({ label: "لأ، جاوبيني من الجهاز بس" });
      b1.addEventListener("click", () => choose("message"));
      b2.addEventListener("click", () => choose("context"));
      b3.addEventListener("click", () => choose("offline"));
      row.append(b1, b2, b3);
      box.appendChild(row);
      append(box);
      b1.focus({ preventScroll: true });
    });
  }

  /* ---------- asking ---------- */

  /**
   * @param {string} rawQuestion
   * @returns {Promise<boolean>} false when the message was NOT taken (too long, or busy): keep it in the box
   */
  async function ask(rawQuestion) {
    const question = (rawQuestion || "").trim();
    if (!question) return false;
    if (question.length > MAX_MESSAGE_CHARS) {
      systemNote(`رسالتك أطول من ${MAX_MESSAGE_CHARS} حرف. قسّميها لرسالتين وابعتيهم ورا بعض.`);
      return false;
    }
    if (busy) {
      systemNote("لحظة، لسا عم جهّز الرد على رسالتك السابقة. رسالتك الجديدة ضلت بالمربع.");
      return false;
    }
    if (router.current !== "chat") router.show("chat");
    $("#suggest")?.remove();

    if (mode === "lawyer") {
      append(el("div", "u", question));
      lawyer.reply(question);
      return true;
    }

    const myEpoch = epoch;
    busy = true;
    try {
      if (needsNotice()) {
        const choice = await askNotice();
        if (myEpoch !== epoch) return true;
        state.set("aiNotice", AI_NOTICE_VERSION);
        state.set("shareContext", choice === "context");
        if (choice === "offline") state.set("aiOnline", false);
      }
      append(el("div", "u", question));
      controller = new AbortController();
      const typing = typingBubble("a", "فزعة عم تكتب");
      const started = Date.now();
      let answer = null;
      try {
        answer = await answerer.answer(question, { country: state.get("country"), signal: controller.signal });
      } catch (err) {
        if (err?.name !== "AbortError") throw err;
      }
      if (myEpoch !== epoch) return true; // wiped or mode changed meanwhile: write nothing
      if (answer?.source === "ai") telemetry?.track("ask_ai", Date.now() - started);
      else telemetry?.track(answer ? "ask_rules" : "ask_none");

      const { base, perChar, max } = TYPING_DELAY;
      await sleep(Math.max(0, base + Math.min(question.length * perChar, max) - (Date.now() - started)));
      if (myEpoch !== epoch) return true;
      typing.remove();
      append(answer ? renderAnswer(answer) : renderNotCovered());
      return true;
    } finally {
      if (myEpoch === epoch) {
        busy = false;
        controller = null;
      }
    }
  }

  /** Cancel whatever is in flight and make sure a late reply is dropped. */
  function cancelPending() {
    epoch++;
    controller?.abort();
    controller = null;
    busy = false;
    $$(".typing-dots").forEach((n) => n.closest(".a")?.remove());
  }

  /* ---------- modes ---------- */

  function setMode(next, { name, topic } = {}) {
    if (mode === "ai" && next !== "ai") cancelPending(); // an AI reply must not land in the lawyer chat
    lawyer.setName(name);
    mode = next;
    $$(".mode").forEach((button) => {
      const on = button.getAttribute("data-mode") === next;
      button.classList.toggle("on", on);
      button.setAttribute("aria-selected", String(on));
    });
    $("#q").placeholder = next === "lawyer" ? "اكتبي للمحامية..." : "اكتبي هون...";

    if (next === "ai") {
      systemNote("رجعتي لفزعة، المساعدة الرقمية.");
      return;
    }
    $("#suggest")?.remove();
    lawyer.open({ topic });
  }

  /**
   * Erase the conversation on this device and restore the welcome message.
   * @param {{signOut?: boolean}} [opts]  also forget the lawyer-chat sign-in on this device
   */
  function reset({ signOut = false } = {}) {
    cancelPending();
    answerer.reset?.();
    mode = "ai";
    lawyer.reset({ signOut });
    const input = $("#q");
    if (input) {
      input.value = "";
      input.style.height = "";
      updateCounter();
    }
    $$(".mode").forEach((button) => {
      const on = button.getAttribute("data-mode") === "ai";
      button.classList.toggle("on", on);
      button.setAttribute("aria-selected", String(on));
    });

    const list = messageList();
    const welcome = list.firstElementChild.cloneNode(true);
    list.replaceChildren(welcome);

    const suggest = el("div", "suggest");
    suggest.id = "suggest";
    for (const [label, question] of SUGGESTIONS) {
      const b = el("button", "chip", label);
      b.setAttribute("data-ask", question);
      suggest.appendChild(b);
    }
    list.appendChild(suggest);
  }

  /** "123 / 1200" under the box once she gets close to the limit. */
  function updateCounter() {
    const input = $("#q");
    const counter = $("#q-count");
    if (!input || !counter) return;
    const n = input.value.length;
    counter.hidden = n < MAX_MESSAGE_CHARS * 0.8;
    counter.textContent = `${n} / ${MAX_MESSAGE_CHARS}`;
    counter.classList.toggle("over", n > MAX_MESSAGE_CHARS);
  }

  /** Composer: textarea auto-grows, Enter sends, Shift+Enter adds a line. */
  function bindComposer() {
    const form = $("#composer");
    const input = $("#q");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = input.value;
      if (!value.trim()) return;
      // the text leaves the box only once the message was really taken
      const taken = await ask(value);
      if (taken && input.value === value) {
        input.value = "";
        input.style.height = "";
        updateCounter();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
      updateCounter();
    });
    // chips inside lawyer bubbles (log out, delete account)
    $("#msgs").addEventListener("click", (e) => {
      const name = e.target.closest?.("[data-action]")?.getAttribute("data-action");
      if (name) lawyer.action?.(name);
    });
    router.onChange((screen) => {
      if (screen === "chat") setTimeout(() => input.focus({ preventScroll: true }), 50);
    });
  }

  return {
    ask,
    setMode,
    reset,
    cancelPending,
    bindComposer,
    get mode() {
      return mode;
    },
    get busy() {
      return busy;
    },
    scrollToEnd: scrollChat,
  };
}
