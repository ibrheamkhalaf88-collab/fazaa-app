import { api, errorText } from "./api.js";
import { dateTime, el, pill, REGION } from "./util.js";

const FILTERS = [
  ["pending", "بانتظار المراجعة"],
  ["good", "صحيحة"],
  ["bad", "فيها خطأ"],
  ["all", "الكل"],
];

/**
 * Review the AI's answers (never the questions: those are not stored). A lawyer marks each answer
 * correct or wrong. Developers can export the reviewed answers to improve the prompt or train a model.
 * All text is inserted with textContent.
 */
export function answersView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  let filter = "pending";

  async function load() {
    try {
      const { items, counts } = await api(`/ai-answers?verdict=${filter}`);
      ctx.banner();
      render(items, counts);
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  async function mark(id, verdict) {
    try {
      await api(`/ai-answers/${id}`, { method: "PUT", body: { verdict } });
      load();
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  async function exportAll() {
    try {
      const data = await api("/ai-answers/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = Object.assign(document.createElement("a"), { href: url, download: "sanad-ai-answers.json" });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  function card(item) {
    const a = item.answer;
    const c = el("section", "card answer");
    const meta = el("div", "answer-meta");
    meta.append(
      pill(REGION[item.region] || item.region),
      el("span", "muted", `${dateTime(item.at)} · ${item.model}`),
    );
    if (item.verdict)
      meta.append(
        pill(item.verdict === "good" ? "صحيحة" : "فيها خطأ", item.verdict === "good" ? "good" : "wait"),
      );
    if (a.sos) meta.append(pill("طوارئ"));

    const steps = el("ol", "answer-steps");
    for (const s of a.steps) steps.append(el("li", null, s));
    const cites = el("p", "muted", `المواد المستشهد بها: ${a.cites.join("، ") || "لا شي"}`);

    const actions = el("div", "ai-actions");
    const good = el("button", item.verdict === "good" ? "primary" : "ghost", "صحيحة");
    const bad = el("button", item.verdict === "bad" ? "primary" : "ghost", "فيها خطأ");
    good.addEventListener("click", () => mark(item.id, item.verdict === "good" ? "" : "good"));
    bad.addEventListener("click", () => mark(item.id, item.verdict === "bad" ? "" : "bad"));
    actions.append(good, bad);

    c.append(meta, el("p", "answer-lead", a.lead), steps);
    if (a.note) c.append(el("p", null, a.note));
    c.append(cites, actions);
    return c;
  }

  function render(items, counts) {
    const head = el("div", "page-head");
    head.append(
      el("h1", null, "مراجعة أجوبة الذكاء"),
      el(
        "span",
        "muted",
        "بنحتفظ بنص الجواب فقط، بدون سؤال المستخدمة وبدون أي معلومة عنها. بيتحذف بعد 90 يوم",
      ),
    );

    const tabs = el("div", "filters");
    for (const [id, label] of FILTERS) {
      const n = id === "all" ? counts.pending + counts.good + counts.bad : counts[id];
      const b = el("button", null, `${label} (${n})`);
      b.setAttribute("aria-selected", String(id === filter));
      b.addEventListener("click", () => {
        filter = id;
        load();
      });
      tabs.append(b);
    }
    if (ctx.me.role === "developer") {
      const ex = el("button", "ghost", "تصدير المراجَعة (JSON)");
      ex.addEventListener("click", exportAll);
      tabs.append(ex);
    }

    const list = el("div", "answers");
    if (items.length) list.append(...items.map(card));
    else list.append(el("div", "empty", "ما في أجوبة هون بعد."));
    body.replaceChildren(head, tabs, list);
  }

  load();
  return { destroy() {} };
}
