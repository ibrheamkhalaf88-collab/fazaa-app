import { api, errorText } from "./api.js";
import { dateTime, el, pill, REGION } from "./util.js";

const FILTERS = [
  ["draft", "بانتظار موافقة"],
  ["approved", "منشورة بالتطبيق"],
  ["hidden", "مخفية"],
];
// the app is for Gaza only (owner, 2026-11-19): new texts are for Gaza; old records keep their label
const REGIONS = [["ps-gaza", REGION["ps-gaza"]]];
const REGION_LABEL = { both: "الضفة وغزة", "ps-wb": REGION["ps-wb"], "ps-gaza": REGION["ps-gaza"] };
const STATUS = { draft: ["بانتظار موافقة", "wait"], approved: ["منشورة", "good"], hidden: ["مخفية", ""] };

/** The server's short reasons, said plainly. */
const PROBLEM = {
  "law-name-required": "اكتبي اسم القانون كامل (مع رقمه وسنته).",
  "bad-number": "رقم المادة لازم يكون أرقام بس، زي 15.",
  "bad-region": "اختاري وين بينطبق القانون.",
  "topic-required": "اكتبي موضوع المادة بكلمتين.",
  "text-required": "الصقي نص المادة كامل.",
  "source-required": "رابط المصدر الرسمي لازم يكون رابط كامل بيبلش بـ https://",
  "angle-brackets": "النص فيه علامات < أو > ، شيليهم (النص القانوني ما بيحتاجهم).",
  "not-yours": "بتقدر تعدّل المادة اللي أضافتها بس.",
  "not-a-draft": "المادة مش بانتظار موافقة (يمكن انعملت موافقة عليها أو انخفت).",
};
const problemText = async (e) => {
  const code = String((await e.body?.())?.error || "").replace(/:.*/, "");
  return PROBLEM[code] || (code.startsWith("too-long") ? "في خانة أطول من المسموح." : errorText(e));
};

const field = (title, control, hint) => {
  const label = el("label", "field");
  label.append(el("span", null, title), control);
  if (hint) label.append(el("small", "muted", hint));
  return label;
};
const textInput = (id, { dir, placeholder, max } = {}) => {
  const i = el("input");
  i.id = id;
  i.autocomplete = "off";
  if (dir) i.dir = dir;
  if (placeholder) i.placeholder = placeholder;
  if (max) i.maxLength = max;
  return i;
};
const area = (id, rows, max) => {
  const t = el("textarea");
  t.id = id;
  t.rows = rows;
  t.maxLength = max;
  return t;
};

/**
 * «القوانين» (2026-11-17): lawyers add law articles to the app without a developer. A lawyer pastes the text
 * verbatim with its official source; a lawyer (she herself is enough, owner's decision 2026-11-17) compares it with the
 * source and approves it; only then
 * do the app and the AI use it (no redeploy). Anyone on the team can hide an article at once. Every step is
 * in the audit log. All text is inserted with textContent.
 */
export function lawsView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  let filter = "draft";
  let editing = null; // the draft being edited, or null for a new one
  let data = { articles: [], me: "", role: "" };

  async function load() {
    try {
      data = await api("/laws");
      ctx.banner();
      render();
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  async function act(path, opts) {
    try {
      await api(path, opts);
      ctx.banner();
      await load();
      return true;
    } catch (e) {
      ctx.banner(await problemText(e));
      return false;
    }
  }

  /* ---------- the add / edit form ---------- */
  function form() {
    const box = el("details", "card law-form");
    box.open = Boolean(editing);
    box.append(
      el("summary", null, editing ? `تعديل: ${editing.lawName} م${editing.number}` : "+ إضافة مادة جديدة"),
    );

    const f = {
      lawName: textInput("law-name", {
        placeholder: "قرار بقانون رقم (10) لسنة 2018 بشأن الجرائم الإلكترونية",
        max: 160,
      }),
      number: textInput("law-number", { dir: "ltr", placeholder: "15", max: 4 }),
      region: el("select"),
      topic: textInput("law-topic", { placeholder: "الابتزاز الإلكتروني", max: 80 }),
      text: area("law-text", 8, 8000),
      amended: area("law-amended", 2, 2000),
      url: textInput("law-url", { dir: "ltr", placeholder: "https://…", max: 500 }),
      keywords: textInput("law-keywords", { placeholder: "تهديد، صور، فلوس", max: 300 }),
    };
    f.region.id = "law-region";
    for (const [v, label] of REGIONS) f.region.append(new Option(label, v));
    if (editing) for (const k of Object.keys(f)) f[k].value = editing[k] ?? "";

    const note = el("p", "form-error");
    const save = el(
      "button",
      "primary",
      editing ? "احفظي التعديل" : "أضيفي (بعدها بتراجعيها وبتوافقي عليها)",
    );
    save.type = "button";
    save.addEventListener("click", async () => {
      const value = Object.fromEntries(Object.entries(f).map(([k, c]) => [k, c.value]));
      save.disabled = true;
      try {
        if (editing) await api(`/laws/${editing.id}`, { method: "PUT", body: value });
        else await api("/laws", { method: "POST", body: value });
        editing = null;
        filter = "draft";
        ctx.banner();
        await load();
      } catch (e) {
        note.textContent = await problemText(e);
        save.disabled = false;
      }
    });
    const actions = el("div", "ai-actions");
    actions.append(save);
    if (editing) {
      const cancel = el("button", "ghost", "إلغاء التعديل");
      cancel.type = "button";
      cancel.addEventListener("click", () => {
        editing = null;
        render();
      });
      actions.append(cancel);
    }

    box.append(
      el(
        "p",
        "muted",
        "انسخي النص حرفياً من مصدر رسمي (الوقائع الفلسطينية، المقتفي، موقع وزارة العدل). PDF مصوّر بالسكانر ممكن يطلع نصه بأخطاء: قارنيه بعينك. إذا المادة انعدّلت، اكتبي النص المعدّل والتعديل تحت.",
      ),
      field("اسم القانون كامل", f.lawName),
      field("رقم المادة", f.number),
      field("وين بينطبق", f.region),
      field("موضوع المادة", f.topic, "بيبين كعنوان فوق النص بالتطبيق"),
      field("نص المادة حرفياً", f.text),
      field("التعديلات (إذا في)", f.amended, "مثلاً: معدّلة بالقرار بقانون رقم 28 لسنة 2020"),
      field("رابط المصدر الرسمي", f.url, "إجباري: المحامية اللي بتوافق بتقارن النص فيه"),
      field("كلمات بتساعد الذكاء يلاقيها", f.keywords, "كلمات الناس العادية عن الموضوع، مفصولة بفواصل"),
      note,
      actions,
    );
    return box;
  }

  /* ---------- one article ---------- */
  function card(a) {
    const c = el("section", "card answer law");
    const [label, cls] = STATUS[a.status] || [a.status, ""];
    const meta = el("div", "answer-meta");
    meta.append(pill(label, cls), pill(REGION_LABEL[a.region] || a.region));
    const who = [`أضافتها ${a.createdBy} ${dateTime(a.createdAt)}`];
    if (a.approvedBy) who.push(`وافقت ${a.approvedBy} ${dateTime(a.approvedAt)}`);
    meta.append(el("span", "muted", who.join(" · ")));

    const source = el("a", null, "المصدر الرسمي");
    source.href = a.url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";

    c.append(
      meta,
      el("p", "answer-lead", `${a.lawName} · المادة ${a.number}: ${a.topic}`),
      el("p", "law-text", a.text),
    );
    if (a.amended) c.append(el("p", "muted", a.amended));
    const src = el("p");
    src.append(source);
    c.append(src);

    const actions = el("div", "ai-actions");
    const mine = a.createdBy === data.me;
    if (a.status === "draft") {
      const check = el("input");
      check.type = "checkbox";
      check.id = `law-checked-${a.id}`;
      const lab = el("label", "law-check");
      lab.append(check, document.createTextNode(" قارنت النص بالمصدر الرسمي وهو مطابق ونافذ"));
      const ok = el("button", "primary", "وافقي وانشري بالتطبيق");
      ok.type = "button";
      ok.disabled = true;
      check.addEventListener("change", () => (ok.disabled = !check.checked));
      ok.addEventListener("click", () => act(`/laws/${a.id}/approve`, { method: "POST" }));
      actions.append(lab, ok);
    }
    if (a.status === "draft" && (mine || data.role === "developer")) {
      const edit = el("button", "ghost", "تعديل");
      edit.type = "button";
      edit.addEventListener("click", () => {
        editing = a;
        render();
        body.querySelector(".law-form")?.scrollIntoView({ block: "start" });
      });
      actions.append(edit);
    }
    if (a.status !== "hidden") {
      const hide = el("button", "ghost", a.status === "approved" ? "خبّيها من التطبيق" : "خبّيها");
      hide.type = "button";
      hide.addEventListener("click", () => act(`/laws/${a.id}/hide`, { method: "POST" }));
      actions.append(hide);
    } else {
      const back = el("button", "ghost", "رجّعيها للمراجعة");
      back.type = "button";
      back.addEventListener("click", () => act(`/laws/${a.id}/restore`, { method: "POST" }));
      actions.append(back);
    }
    c.append(actions);
    return c;
  }

  function render() {
    const head = el("div", "page-head");
    head.append(
      el("h1", null, "القوانين"),
      el(
        "span",
        "muted",
        "مواد قانونية بتضيفها محامية وبتوافق عليها بعد ما تقارنها بالمصدر الرسمي. بعد الموافقة التطبيق والذكاء بيستعملوها فوراً بدون أي برمجة. أي حدا من الفريق بيقدر يخبّي مادة فيها غلط بلحظة.",
      ),
    );

    const tabs = el("div", "filters");
    for (const [id, label] of FILTERS) {
      const n = data.articles.filter((a) => a.status === id).length;
      const b = el("button", null, `${label} (${n})`);
      b.setAttribute("aria-selected", String(id === filter));
      b.addEventListener("click", () => {
        filter = id;
        render();
      });
      tabs.append(b);
    }

    const list = el("div", "answers");
    const shown = data.articles.filter((a) => a.status === filter);
    if (shown.length) list.append(...shown.map(card));
    else
      list.append(
        el(
          "div",
          "empty",
          filter === "draft"
            ? "ما في مواد بانتظار موافقة."
            : filter === "approved"
              ? "ما في مواد منشورة لسا."
              : "ما في مواد مخفية.",
        ),
      );
    body.replaceChildren(head, form(), tabs, list);
  }

  load();
  return { destroy() {} };
}
