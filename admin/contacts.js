import { CONTACT_CATS, CONTACT_REGIONS, MAX_CONTACTS } from "../src/data/contacts.js";
import { api, errorText } from "./api.js";
import { dateTime, el, pill } from "./util.js";

const PROBLEM = {
  "bad-phone": "رقم فيه رموز غير مسموحة. استعملي أرقام و + و - بس.",
  "name-required": "كل جهة لازم يكون إلها اسم.",
  "bad-cat": "اختاري نوع لكل جهة.",
  "too-many": `الحد الأقصى ${MAX_CONTACTS} جهة.`,
};
const SPECIAL = {
  police: "رقمها بيظهر بردود الطوارئ (عنف وخطر فوري)",
  ambulance: "رقمها بيظهر برد إيذاء النفس",
};
const DAY = 86_400_000;
/** A confirmation older than this is flagged "re-check". */
const RECHECK_DAYS = 90;

/** Where a contact stands, for the summary, the filter and the card's pill. */
function stateOf(c, now = Date.now()) {
  if (!c.active) return "off";
  if (!c.phone && !c.whatsapp) return "nonumber";
  if (!c.verified) return "unverified";
  if (c.verifiedAt && now - c.verifiedAt > RECHECK_DAYS * DAY) return "stale";
  return "ok";
}
const STATE = {
  ok: ["good", "متاحة ورقمها مؤكد"],
  unverified: ["wait", "متاحة، الرقم مش مؤكد"],
  stale: ["wait", `التأكيد أقدم من ${RECHECK_DAYS} يوم`],
  nonumber: ["wait", "بدون رقم"],
  off: ["", "موقوفة (مخفية بالتطبيق)"],
};
const FILTERS = {
  all: "الكل",
  ok: "مؤكدة",
  unverified: "مش مؤكدة",
  stale: "بدها تأكيد جديد",
  nonumber: "بدون رقم",
  off: "موقوفة",
};

/**
 * Developer page: the emergency numbers and support organisations shown in the app ("مين بيساعدني")
 * and inside the fixed emergency replies. For each one the team can switch it off (hidden in the
 * app), mark the number as confirmed with the organisation (the server stamps the date), add hours
 * and an internal note. Everything is typed with textContent / input.value.
 */
export function contactsView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  let rows = [];
  let filter = "all";

  async function load() {
    try {
      render(await api("/contacts"));
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  const field = (title, input) => {
    const label = el("label", "field");
    label.append(el("span", null, title), input);
    return label;
  };
  const input = (value, { dir, placeholder, max } = {}) => {
    const i = el("input");
    i.value = value || "";
    if (dir) i.dir = dir;
    if (placeholder) i.placeholder = placeholder;
    if (max) i.maxLength = max;
    i.autocomplete = "off";
    return i;
  };
  const select = (options, value) => {
    const s = el("select");
    for (const [v, label] of Object.entries(options)) s.append(new Option(label, v));
    s.value = value;
    return s;
  };
  const check = (label, checked) => {
    const wrap = el("label", "check");
    const box = el("input");
    box.type = "checkbox";
    box.checked = checked;
    wrap.append(box, el("span", null, label));
    return { wrap, box };
  };

  function rowCard(c, list) {
    const card = el("section", "card contact-card");
    const f = {
      name: input(c.name, { max: 60, placeholder: "اسم الجهة" }),
      desc: input(c.desc, { max: 140, placeholder: "بتساعد بشو؟" }),
      phone: input(c.phone, { dir: "ltr", max: 20, placeholder: "مثلاً 100" }),
      whatsapp: input(c.whatsapp, { dir: "ltr", max: 20, placeholder: "+970…" }),
      badge: input(c.badge, { max: 20, placeholder: "رسمية / مجانية / سري" }),
      hours: input(c.hours, { max: 40, placeholder: "مثلاً 24 ساعة، أو 8 الصبح لـ 4" }),
      note: input(c.note, { max: 200, placeholder: "مين أكد الرقم، مع مين حكينا… (ما بيظهر بالتطبيق)" }),
      cat: select(CONTACT_CATS, c.cat),
      region: select(CONTACT_REGIONS, c.region),
      active: check("متاحة: بتظهر بالتطبيق", c.active !== false),
      verified: check("الرقم مؤكد: اتصلنا وتأكدنا مع الجهة نفسها", c.verified === true),
    };

    const head = el("div", "contact-head");
    const title = el("b", null, c.name || "جهة جديدة");
    const status = el("span");
    const paint = () => {
      const now = {
        active: f.active.box.checked,
        verified: f.verified.box.checked,
        // a changed number is not the confirmed one any more until it is saved as confirmed
        verifiedAt: f.phone.value === c.phone && f.whatsapp.value === c.whatsapp ? c.verifiedAt : null,
        phone: f.phone.value.trim(),
        whatsapp: f.whatsapp.value.trim(),
      };
      const s = stateOf(now);
      status.replaceChildren(pill(...[STATE[s][1], STATE[s][0]]));
      card.classList.toggle("is-off", !now.active);
      card.dataset.state = s;
    };
    for (const i of [f.active.box, f.verified.box]) i.addEventListener("change", paint);
    for (const i of [f.phone, f.whatsapp]) i.addEventListener("input", paint);
    f.name.addEventListener("input", () => (title.textContent = f.name.value || "جهة جديدة"));
    head.append(title, status);
    if (SPECIAL[c.id]) head.append(pill(SPECIAL[c.id], "wait"));

    const remove = el("button", "ghost", "حذف");
    remove.type = "button";
    remove.addEventListener("click", () => {
      const msg = SPECIAL[c.id]
        ? "رقم هالجهة بيظهر بردود الطوارئ. إذا حذفتيها، الرد رح يطلع بدون رقم. متأكدة؟"
        : `بدك تحذفي «${f.name.value || "هالجهة"}»؟ إذا بدك تخفيها مؤقتاً، شيلي علامة «متاحة» بدل الحذف.`;
      if (!confirm(msg)) return;
      rows = rows.filter((r) => r.c !== c);
      card.remove();
    });
    head.append(remove);

    const checks = el("div", "contact-checks");
    checks.append(f.active.wrap, f.verified.wrap);
    if (c.verified && c.verifiedAt)
      checks.append(el("span", "muted", `آخر تأكيد: ${dateTime(c.verifiedAt)}`));

    const grid = el("div", "contact-grid");
    grid.append(
      field("الاسم", f.name),
      field("النوع", f.cat),
      field("رقم الاتصال", f.phone),
      field("واتساب", f.whatsapp),
      field("ساعات العمل", f.hours),
      field("المنطقة", f.region),
      field("الوصف", f.desc),
      field("شارة", f.badge),
      field("ملاحظة للفريق", f.note),
    );
    card.append(head, checks, grid);
    list.append(card);
    rows.push({ c, f, card });
    paint();
  }

  function collect() {
    return rows.map(({ c, f }) => ({
      id: c.id,
      name: f.name.value,
      desc: f.desc.value,
      phone: f.phone.value,
      whatsapp: f.whatsapp.value,
      badge: f.badge.value,
      hours: f.hours.value,
      note: f.note.value,
      cat: f.cat.value,
      region: f.region.value,
      active: f.active.box.checked,
      verified: f.verified.box.checked,
    }));
  }

  function applyFilter() {
    for (const { card } of rows) card.hidden = filter !== "all" && card.dataset.state !== filter;
  }

  function render(data) {
    ctx.banner();
    rows = [];
    const head = el("div", "page-head");
    head.append(
      el("h1", null, "أرقام التواصل وجهات الدعم"),
      el("span", "muted", "اللي بيظهر بصفحة «مين بيساعدني» وبردود الطوارئ بالتطبيق"),
    );
    const status = el("p", "ai-status");
    status.append(pill(data.custom ? "محفوظة من هون" : "القائمة الأصلية", data.custom ? "good" : "wait"));
    if (data.updatedAt)
      status.append(el("span", "muted", ` · آخر تعديل ${dateTime(data.updatedAt)} (${data.updatedBy})`));

    // summary: how many are confirmed, waiting, without a number, switched off
    const counts = {};
    for (const c of data.contacts) counts[stateOf(c)] = (counts[stateOf(c)] || 0) + 1;
    const kpis = el("div", "contact-kpis");
    for (const [k, label] of Object.entries(FILTERS)) {
      const n = k === "all" ? data.contacts.length : counts[k] || 0;
      const b = el("button", `contact-kpi${k === filter ? " on" : ""}`);
      b.type = "button";
      b.append(el("b", null, String(n)), el("span", null, label));
      b.addEventListener("click", () => {
        filter = k;
        kpis.querySelectorAll(".contact-kpi").forEach((x) => x.classList.toggle("on", x === b));
        applyFilter();
      });
      kpis.append(b);
    }

    const list = el("div", "contact-list");
    for (const c of data.contacts) rowCard({ ...c }, list);
    applyFilter();

    const note = el("p", "hint");
    const setNote = (text, bad = false) => {
      note.textContent = text;
      note.classList.toggle("bad", bad);
    };

    const add = el("button", "ghost", "+ إضافة جهة");
    add.addEventListener("click", () => {
      if (rows.length >= MAX_CONTACTS) return setNote(PROBLEM["too-many"], true);
      filter = "all";
      applyFilter();
      rowCard(
        {
          id: "",
          cat: "law",
          name: "",
          desc: "",
          phone: "",
          whatsapp: "",
          badge: "",
          hours: "",
          note: "",
          region: "all",
          active: true,
          verified: false,
          verifiedAt: null,
        },
        list,
      );
      list.lastElementChild?.querySelector("input:not([type=checkbox])")?.focus();
    });
    const save = el("button", "primary", "حفظ");
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        render(await api("/contacts", { method: "PUT", body: { contacts: collect() } }));
        ctx.banner();
      } catch (e) {
        setNote(PROBLEM[(await e.body?.())?.error] || errorText(e), true);
      } finally {
        save.disabled = false;
      }
    });
    const reset = el("button", "ghost", "رجّعي القائمة الأصلية");
    reset.addEventListener("click", async () => {
      if (!confirm("بدك ترجعي للقائمة الأصلية؟ كل تعديلاتك رح تنحذف.")) return;
      try {
        render(await api("/contacts", { method: "DELETE" }));
      } catch (e) {
        setNote(errorText(e), true);
      }
    });

    const actions = el("div", "ai-actions");
    actions.append(save, add);
    if (data.custom) actions.append(reset);

    body.replaceChildren(
      head,
      status,
      kpis,
      el(
        "p",
        "hint",
        `قبل ما تعلّمي «الرقم مؤكد»، اتصلي بالجهة نفسها وتأكدي إنه شغّال. التاريخ بينحفظ لحاله، وبعد ${RECHECK_DAYS} يوم بتطلع «بدها تأكيد جديد». الجهة الموقوفة بتختفي من التطبيق بدون ما تنحذف. التعديلات بتوصل للتطبيق خلال دقايق.`,
      ),
      list,
      actions,
      note,
    );
  }

  load();
  return { destroy() {} };
}
