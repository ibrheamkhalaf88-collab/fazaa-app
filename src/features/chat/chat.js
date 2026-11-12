import { TYPING_DELAY } from "../../config.js";
import { ARTICLES } from "../../data/law/index.js";
import { $, $$, chip, el, icon } from "../../core/dom.js";
import { append, messageList, scrollChat, systemNote, typingBubble } from "./messages.js";
import { createLawyerSession } from "./lawyer-session.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SUGGESTIONS = [
  ["حدا بيهددني بصوري", "حدا عم يهددني ينشر صوري إذا ما بعتله مصاري"],
  ["شو عقوبة الابتزاز؟", "شو عقوبة الابتزاز الإلكتروني؟"],
  ["نشروا فيديو إلي", "حدا نشر فيديو إلي بدون إذني"],
];

/**
 * The chat screen. Two modes share one message list:
 *   "ai"     answers from the law (offline rules, or the online AI if the user opted in)
 *   "lawyer" a human lawyer: live via the staff API when API_BASE is set, otherwise a scripted demo
 *
 * @param {{
 *   state: ReturnType<import("../../core/state.js").createState>,
 *   router: ReturnType<import("../../core/router.js").createRouter>,
 *   answerer: ReturnType<import("../../ai/answerer.js").createAnswerer>,
 * }} deps
 */
export function createChat({ state, router, answerer, telemetry, lawyer = createLawyerSession() }) {
  let mode = "ai";
  /** Bumped by reset(): a reply that was still "typing" when the chat was wiped is dropped. */
  let epoch = 0;

  /* ---------- rendering ---------- */

  /** An expandable card with the verbatim article text and its source link. */
  function citationCard(id, open = false) {
    const article = ARTICLES[id];
    const card = el("details", "cite");
    card.open = open;

    const summary = el("summary");
    const label = el("div");
    label.append(
      el("b", null, `المادة ${id}: ${article.topic}`),
      el("span", null, `${article.lawName}. نص القانون الأصلي`),
    );
    summary.append(icon("i-file"), label);

    const law = el("div", "law");
    law.appendChild(document.createTextNode(article.text));
    if (article.amended) law.appendChild(document.createTextNode(`\n\n${article.amended}.`));
    law.appendChild(document.createTextNode("\n\nالمصدر: "));
    const link = el("a", null, "قاعدة مقام، جامعة النجاح");
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    law.appendChild(link);

    card.append(summary, law);
    return card;
  }

  /** A conversational reply (hello, who are you…): just the words and topics she can tap. */
  function renderChat(answer) {
    const box = el("div", "a");
    box.appendChild(el("div", null, answer.lead));
    if (answer.chips?.length) {
      const acts = el("div", "acts");
      for (const [label, question] of answer.chips)
        acts.appendChild(chip({ label, data: { ask: question } }));
      box.appendChild(acts);
    }
    return box;
  }

  function renderAnswer(answer) {
    if (answer.kind === "chat") return renderChat(answer);
    const box = el("div", "a");
    box.appendChild(el("div", null, answer.lead));

    // 1) what the law says, in plain words, followed by the verbatim article(s)
    if (answer.cites.length) {
      box.appendChild(el("div", "sec", "شو بيقول القانون"));
      if (answer.note) box.appendChild(el("div", "note-line", answer.note));
    } else if (answer.note) {
      box.appendChild(el("div", answer.general ? "note-line general" : "note-line", answer.note));
    }

    // 2) what to do now
    box.appendChild(el("div", "sec", "شو بتعملي هلأ"));
    const list = el("ol");
    for (const step of answer.steps) list.appendChild(el("li", null, step));
    box.appendChild(list);

    // 3) the original article text, so she can check the summary herself
    if (answer.cites.length) {
      box.appendChild(el("div", "sec", "نص القانون الأصلي"));
      answer.cites.forEach((id, i) => box.appendChild(citationCard(id, i === 0)));
    }
    if (answer.closing) box.appendChild(el("div", "closing", answer.closing));
    if (answer.source === "ai") {
      box.appendChild(
        el(
          "div",
          "src",
          answer.cites.length
            ? "كُتب بالذكاء الاصطناعي من نص القانون. اقرئي النص المذكور للتأكد."
            : "كُتب بالذكاء الاصطناعي ككلام دعم، مش كمعلومة قانونية.",
        ),
      );
    }

    const actions = el("div", "acts");
    if (answer.general) {
      actions.appendChild(
        chip({
          label: "احكي مع محامية الآن",
          iconId: "i-phone",
          fill: true,
          data: { chat: "lawyer", topic: answer.topic || "" },
        }),
      );
    }
    if (answer.sos) {
      actions.appendChild(
        chip({ label: "افتحي خطة الأمان", iconId: "i-shield", fill: true, data: { go: "sos" } }),
      );
    }
    actions.appendChild(
      chip({
        label: "مين بيساعدني",
        iconId: "i-hands",
        fill: !(answer.sos || answer.general),
        data: { go: "support" },
      }),
    );
    box.appendChild(actions);
    return box;
  }

  /** Shown when nothing in the app covers the question: honest refusal, never a guess. */
  function renderNotCovered() {
    const box = el("div", "a");
    box.appendChild(
      el(
        "div",
        null,
        "سؤالك مهم، بس ما لقيت نص قانوني بيغطّيه بالقوانين اللي بفزعة لهلأ (الجرائم الإلكترونية، الأحوال الشخصية، حقوق العائلة، والقانون الأساسي)، وما بدي أعطيكِ معلومة بدون مصدر.",
      ),
    );
    box.appendChild(
      el(
        "div",
        "gap-top",
        "جرّبي تسألي عن الابتزاز، أو نشر الصور، أو النفقة والطلاق والحضانة. وإذا موضوعك مختلف، احكي مع محامية مباشرة.",
      ),
    );
    const actions = el("div", "acts");
    actions.append(
      chip({ label: "احكي مع محامية الآن", iconId: "i-phone", fill: true, data: { chat: "lawyer" } }),
      chip({ label: "مين بيساعدني", iconId: "i-hands", data: { go: "support" } }),
    );
    box.appendChild(actions);
    return box;
  }

  /* ---------- asking ---------- */

  async function ask(rawQuestion) {
    const question = (rawQuestion || "").trim();
    if (!question) return;
    if (router.current !== "chat") router.show("chat");
    $("#suggest")?.remove();
    append(el("div", "u", question));

    if (mode === "lawyer") {
      lawyer.reply(question);
      return;
    }

    const myEpoch = epoch;
    const typing = typingBubble("a", "فزعة عم تكتب");
    const started = Date.now();
    const answer = await answerer.answer(question, { country: state.get("country") });
    // anonymous counter only: which engine answered (never the question or the answer)
    if (answer?.source === "ai") telemetry?.track("ask_ai", Date.now() - started);
    else telemetry?.track(answer ? "ask_rules" : "ask_none");

    // keep the artificial typing pause even when the answer was instant
    const { base, perChar, max } = TYPING_DELAY;
    await sleep(Math.max(0, base + Math.min(question.length * perChar, max) - (Date.now() - started)));

    if (myEpoch !== epoch) return; // chat was wiped meanwhile
    typing.remove();
    append(answer ? renderAnswer(answer) : renderNotCovered());
  }

  /* ---------- modes ---------- */

  function setMode(next, { name, topic } = {}) {
    lawyer.setName(name);
    mode = next;
    $$(".mode").forEach((button) => {
      const on = button.getAttribute("data-mode") === next;
      button.classList.toggle("on", on);
      button.setAttribute("aria-selected", String(on));
    });
    $("#q").placeholder = next === "lawyer" ? "اكتبي للمحامية..." : "اكتبي سؤالك هون...";

    if (next === "ai") {
      systemNote("رجعتي لفزعة. الأجوبة فورية وعامة.");
      return;
    }
    $("#suggest")?.remove();
    lawyer.open({ topic });
  }

  /** Erase the conversation and restore the welcome message + suggestions. */
  function reset() {
    epoch++;
    mode = "ai";
    lawyer.reset();
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

  /** Composer: textarea auto-grows, Enter sends, Shift+Enter adds a line. */
  function bindComposer() {
    const form = $("#composer");
    const input = $("#q");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = input.value;
      input.value = "";
      input.style.height = "";
      ask(value);
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
    bindComposer,
    get mode() {
      return mode;
    },
    scrollToEnd: scrollChat,
  };
}
