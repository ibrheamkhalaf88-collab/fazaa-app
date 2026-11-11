import { CONTACT_CATS, CONTACT_REGIONS, DEFAULT_CONTACTS, MAX_CONTACTS } from "../src/data/contacts.js";
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

/**
 * Developer page: the emergency numbers and support organisations shown in the app ("مين بيساعدني")
 * and inside the fixed emergency replies. Everything is typed with textContent / input.value.
 */
export function contactsView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  let rows = [];

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

  function rowCard(c, list) {
    const card = el("section", "card contact-card");
    const f = {
      name: input(c.name, { max: 60, placeholder: "اسم الجهة" }),
      desc: input(c.desc, { max: 140, placeholder: "بتساعد بشو؟" }),
      phone: input(c.phone, { dir: "ltr", max: 20, placeholder: "مثلاً 100" }),
      whatsapp: input(c.whatsapp, { dir: "ltr", max: 20, placeholder: "+970…" }),
      badge: input(c.badge, { max: 20, placeholder: "رسمية / مجانية / سري" }),
      cat: select(CONTACT_CATS, c.cat),
      region: select(CONTACT_REGIONS, c.region),
    };
    const head = el("div", "contact-head");
    head.append(el("b", null, c.name || "جهة جديدة"));
    if (SPECIAL[c.id]) head.append(pill(SPECIAL[c.id], "wait"));
    const remove = el("button", "ghost", "حذف");
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (
        SPECIAL[c.id] &&
        !confirm("رقم هالجهة بيظهر بردود الطوارئ. إذا حذفتيها، الرد رح يطلع بدون رقم. متأكدة؟")
      )
        return;
      rows = rows.filter((r) => r.c !== c);
      card.remove();
    });
    head.append(remove);
    const grid = el("div", "contact-grid");
    grid.append(
      field("الاسم", f.name),
      field("النوع", f.cat),
      field("رقم الاتصال", f.phone),
      field("واتساب", f.whatsapp),
      field("الوصف", f.desc),
      field("شارة", f.badge),
      field("المنطقة", f.region),
    );
    card.append(head, grid);
    list.append(card);
    rows.push({ c, f });
  }

  function collect() {
    return rows.map(({ c, f }) => ({
      id: c.id,
      name: f.name.value,
      desc: f.desc.value,
      phone: f.phone.value,
      whatsapp: f.whatsapp.value,
      badge: f.badge.value,
      cat: f.cat.value,
      region: f.region.value,
    }));
  }

  function render(data) {
    ctx.banner();
    rows = [];
    const head = el("div", "page-head");
    head.append(
      el("h1", null, "أرقام التواصل"),
      el("span", "muted", "اللي بيظهر بصفحة «مين بيساعدني» وبردود الطوارئ بالتطبيق"),
    );
    const status = el("p", "ai-status");
    status.append(pill(data.custom ? "محفوظة من هون" : "القائمة الأصلية", data.custom ? "good" : "wait"));
    if (data.updatedAt)
      status.append(el("span", "muted", ` · آخر تعديل ${dateTime(data.updatedAt)} (${data.updatedBy})`));

    const list = el("div", "contact-list");
    for (const c of data.contacts) rowCard({ ...c }, list);

    const note = el("p", "hint");
    const setNote = (text, bad = false) => {
      note.textContent = text;
      note.classList.toggle("bad", bad);
    };

    const add = el("button", "ghost", "+ إضافة جهة");
    add.addEventListener("click", () => {
      if (rows.length >= MAX_CONTACTS) return setNote(PROBLEM["too-many"], true);
      rowCard(
        { id: "", cat: "law", name: "", desc: "", phone: "", whatsapp: "", badge: "", region: "all" },
        list,
      );
      list.lastElementChild?.querySelector("input")?.focus();
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
      el(
        "p",
        "hint",
        "قبل ما تحطي أي رقم، تأكدي منه مع الجهة نفسها. الأرقام بتوصل للتطبيق خلال دقايق، وبتضل محفوظة عند المستخدمة حتى بدون نت.",
      ),
      list,
      actions,
      note,
    );
  }

  load();
  return { destroy() {} };
}

export { DEFAULT_CONTACTS };
