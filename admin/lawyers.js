import { AVATARS, LAWYER_REGIONS, MAX_CASES_DEFAULT } from "../src/data/lawyers.js";
import { api, errorText } from "./api.js";
import { ago, el, pill } from "./util.js";

const PROBLEM = {
  "bad-phone": "رقم الهاتف فيه رموز غير مسموحة.",
  "bad-years": "سنين الخبرة رقم من 0 لـ 60.",
  "bad-regions": "اختاري منطقة وحدة على الأقل.",
  "bad-max-cases": "أقصى عدد حالات من 1 لـ 50.",
  "bad-staff": "البريد مش صحيح.",
  "name-required": "اكتبي اسم المحامية.",
  "not-a-lawyer": "هالبريد لعضو مش محامية (مطوّر). ما بنقدر نحوّله من هون.",
  "no-such-lawyer": "ما في محامية بهالبريد.",
};

const field = (title, input, wide = false) => {
  const label = el("label", wide ? "field wide" : "field");
  label.append(el("span", null, title), input);
  return label;
};
const input = (value, { dir, placeholder, max, type } = {}) => {
  const i = el("input");
  if (type) i.type = type;
  i.value = value ?? "";
  if (dir) i.dir = dir;
  if (placeholder) i.placeholder = placeholder;
  if (max) i.maxLength = max;
  i.autocomplete = "off";
  return i;
};
const check = (label, checked) => {
  const wrap = el("label", "check");
  const box = el("input");
  box.type = "checkbox";
  box.checked = checked;
  wrap.append(box, el("span", null, label));
  return { wrap, box };
};
const regionsField = (selected) => {
  const wrap = el("div", "region-checks");
  const boxes = Object.entries(LAWYER_REGIONS).map(([id, label]) => {
    const c = check(label, selected.includes(id));
    c.box.value = id;
    wrap.append(c.wrap);
    return c.box;
  });
  return { wrap, value: () => boxes.filter((b) => b.checked).map((b) => b.value) };
};
const avatarSelect = (value) => {
  const s = el("select");
  for (const [v, label] of Object.entries(AVATARS)) s.append(new Option(label, v));
  s.value = value || "hijab";
  return s;
};

/** Where she stands, as the app sees it. */
function status(l) {
  if (!l.active) return ["", "موقوفة (ما بتقدر تدخل)"];
  if (!l.available) return ["", "مش متاحة"];
  if (!l.listed) return ["wait", `مليانة (${l.openCases} من ${l.maxCases})`];
  return ["good", "متاحة وبتظهر بالتطبيق"];
}

/**
 * "المحاميات": for a developer, or a lawyer who is a manager. Add a lawyer (temporary password shown
 * once), edit her profile and contact number, switch her available / unavailable, set her case limit.
 * Only a developer can make a lawyer a manager. Suspending or removing a member stays in "الفريق".
 */
export function lawyersView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  const note = el("p", "hint");
  const setNote = (text, bad = false) => {
    note.textContent = text;
    note.classList.toggle("bad", bad);
  };
  const problem = async (e) => PROBLEM[(await e.body?.())?.error] || errorText(e);

  async function load() {
    try {
      render(await api("/lawyers"));
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  function showTemp(email, pw) {
    const box = el("section", "card temp-pw");
    box.append(
      el("b", null, `كلمة سر مؤقتة لـ ${email}`),
      el("code", null, pw),
      el("p", "hint", "بتظهر هالمرة بس. ابعتيها للمحامية بطريقة آمنة، ورح يطلب منها تغيّرها أول دخول."),
    );
    body.prepend(box);
  }

  function lawyerCard(l, canSetManager) {
    const card = el("section", "card contact-card");
    const [cls, label] = status(l);
    const head = el("div", "contact-head");
    head.append(el("b", null, `${l.name || l.email.split("@")[0]} · ${l.code || ""}`), pill(label, cls));
    if (l.manager) head.append(pill("مديرة المحاميات", "good"));

    const f = {
      name: input(l.name, { max: 40 }),
      phone: input(l.phone, { dir: "ltr", max: 20, placeholder: "رقم للتواصل معها (للفريق بس)" }),
      specialty: input(l.specialty, { max: 60, placeholder: "نفقة وحضانة، طلاق، عنف أسري…" }),
      years: input(l.years, { type: "number" }),
      maxCases: input(l.maxCases ?? MAX_CASES_DEFAULT, { type: "number" }),
      bio: input(l.bio, { max: 160, placeholder: "سطر قصير بيظهر للمستخدمة (اختياري)" }),
      avatar: avatarSelect(l.avatar),
      regions: regionsField(l.regions || []),
      available: check("متاحة هلأ: بتظهر بالتطبيق وبتستلم حالات", l.available),
      manager: check("مديرة المحاميات (بتتحكم بالمحاميات)", l.manager),
    };
    f.years.min = "0";
    f.years.max = "60";
    f.maxCases.min = "1";
    f.maxCases.max = "50";

    const quick = el(
      "button",
      l.available ? "ghost" : "primary",
      l.available ? "خلّيها مش متاحة" : "خلّيها متاحة",
    );
    quick.addEventListener("click", () => save({ email: l.email, available: !l.available }));
    head.append(quick);

    const meta = el("div", "contact-checks");
    meta.append(
      el("span", "muted", l.email),
      el("span", "muted", `حالات مفتوحة: ${l.openCases} من ${l.maxCases}`),
      el("span", "muted", l.lastSeen ? `آخر ظهور: ${ago(Date.now() - l.lastSeen)}` : "ما دخلت لسا"),
    );

    const checks = el("div", "contact-checks");
    checks.append(f.available.wrap);
    if (canSetManager) checks.append(f.manager.wrap);

    const grid = el("div", "contact-grid");
    grid.append(
      field("الاسم (الأول بيظهر للمستخدمة)", f.name),
      field("رقم التواصل", f.phone),
      field("التخصص", f.specialty),
      field("سنين الخبرة", f.years),
      field("أقصى عدد حالات بنفس الوقت", f.maxCases),
      field("الرسمة", f.avatar),
      field("المناطق", f.regions.wrap),
      field("تعريف قصير", f.bio, true),
    );
    const saveBtn = el("button", "primary", "حفظ التعديلات");
    saveBtn.addEventListener("click", () =>
      save({
        email: l.email,
        name: f.name.value,
        phone: f.phone.value,
        specialty: f.specialty.value,
        years: Number(f.years.value || 0),
        maxCases: Number(f.maxCases.value || MAX_CASES_DEFAULT),
        bio: f.bio.value,
        avatar: f.avatar.value,
        regions: f.regions.value(),
        available: f.available.box.checked,
        ...(canSetManager ? { manager: f.manager.box.checked } : {}),
      }),
    );
    const acts = el("div", "ai-actions");
    acts.append(saveBtn);
    card.append(head, meta, checks, grid, acts);
    return card;
  }

  async function save(patch) {
    try {
      render(await api("/lawyers", { method: "PUT", body: patch }));
      setNote("انحفظ.");
    } catch (e) {
      setNote(await problem(e), true);
    }
  }

  function addForm() {
    const card = el("section", "card");
    const email = input("", { dir: "ltr", placeholder: "lawyer@example.com" });
    email.type = "email";
    const name = input("", { max: 40, placeholder: "الاسم" });
    const phone = input("", { dir: "ltr", max: 20, placeholder: "رقم التواصل" });
    const specialty = input("", { max: 60, placeholder: "التخصص" });
    const regions = regionsField(Object.keys(LAWYER_REGIONS));
    const btn = el("button", "primary", "إضافة محامية");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const r = await api("/lawyers", {
          method: "POST",
          body: {
            email: email.value,
            name: name.value,
            phone: phone.value,
            specialty: specialty.value,
            regions: regions.value(),
          },
        });
        render(r);
        if (r.tempPassword) showTemp(email.value.trim().toLowerCase(), r.tempPassword);
        setNote("انضافت. لسا مش متاحة: هي أو إنتِ بتفعّليها لما تكون جاهزة.");
      } catch (e) {
        setNote(await problem(e), true);
      } finally {
        btn.disabled = false;
      }
    });
    const grid = el("div", "contact-grid");
    grid.append(
      field("البريد", email),
      field("الاسم", name),
      field("رقم التواصل", phone),
      field("التخصص", specialty),
      field("المناطق", regions.wrap),
    );
    card.append(el("h2", null, "إضافة محامية جديدة"), grid, btn);
    return card;
  }

  function render(data) {
    ctx.banner();
    const head = el("div", "page-head");
    head.append(
      el("h1", null, "المحاميات"),
      el("span", "muted", "مين متاحة، ملفاتهن، أرقام التواصل معهن، وكم حالة بتستلم كل وحدة"),
    );
    const listed = data.lawyers.filter((l) => l.listed).length;
    const kpis = el("div", "contact-kpis");
    for (const [n, label] of [
      [data.lawyers.length, "كل المحاميات"],
      [listed, "متاحات وبيظهرن بالتطبيق"],
      [data.lawyers.filter((l) => l.available && !l.listed && l.active).length, "مليانات"],
      [data.lawyers.filter((l) => !l.available || !l.active).length, "مش متاحات"],
    ]) {
      const k = el("div", "contact-kpi");
      k.append(el("b", null, String(n)), el("span", null, label));
      kpis.append(k);
    }
    const list = el("div", "contact-list");
    for (const l of data.lawyers) list.append(lawyerCard(l, data.canSetManager));
    if (!data.lawyers.length) list.append(el("p", "muted", "ما في محاميات لسا. ضيفي أول وحدة من تحت."));
    body.replaceChildren(
      head,
      kpis,
      el(
        "p",
        "hint",
        "المستخدمة بتشوف الاسم الأول والتخصص والخبرة بس، وما بتشوف البريد ولا الرقم. المحامية بتختفي من التطبيق لحالها لما توصل لأقصى عدد حالات. التعليق والحذف من صفحة «الفريق».",
      ),
      list,
      addForm(),
      note,
    );
  }

  load();
  return { destroy() {} };
}
