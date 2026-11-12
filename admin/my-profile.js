import { AVATARS, LAWYER_REGIONS } from "../src/data/lawyers.js";
import { api, errorText } from "./api.js";
import { el, pill } from "./util.js";

/**
 * "حالتي": a lawyer switches herself available / unavailable with one big button, and edits what
 * women see about her. She cannot change her case limit or make herself a manager.
 */
export function myProfileView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  const note = el("p", "hint");

  async function load() {
    try {
      render((await api("/profile")).profile);
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  async function save(patch) {
    try {
      render((await api("/profile", { method: "PUT", body: patch })).profile);
      note.textContent = "انحفظ.";
      note.classList.remove("bad");
    } catch (e) {
      note.textContent = errorText(e);
      note.classList.add("bad");
    }
  }

  function render(p) {
    ctx.banner();
    const head = el("div", "page-head");
    head.append(el("h1", null, "حالتي وملفي"), el("span", "muted", "اللي بتشوفه المستخدمة عنك"));

    const big = el("section", `card availability ${p.available ? "on" : ""}`);
    big.append(
      el("b", null, p.available ? "إنتِ متاحة هلأ" : "إنتِ مش متاحة هلأ"),
      el(
        "p",
        "muted",
        p.available
          ? `بتظهري بالتطبيق وبتستلمي حالات جديدة (لحد ${p.maxCases} حالات بنفس الوقت).`
          : "ما بتظهري بالتطبيق. حالاتك المفتوحة بتضل معك.",
      ),
    );
    const toggle = el(
      "button",
      p.available ? "ghost" : "primary",
      p.available ? "خلّيني مش متاحة" : "خلّيني متاحة",
    );
    toggle.addEventListener("click", () => save({ available: !p.available }));
    big.append(toggle);

    const specialty = el("input");
    specialty.value = p.specialty;
    specialty.maxLength = 60;
    const years = el("input");
    years.type = "number";
    years.min = "0";
    years.max = "60";
    years.value = String(p.years);
    const phone = el("input");
    phone.dir = "ltr";
    phone.value = p.phone;
    phone.maxLength = 20;
    const bio = el("input");
    bio.value = p.bio;
    bio.maxLength = 160;
    const avatar = el("select");
    for (const [v, label] of Object.entries(AVATARS)) avatar.append(new Option(label, v));
    avatar.value = p.avatar;
    const regionWrap = el("div", "region-checks");
    const boxes = Object.entries(LAWYER_REGIONS).map(([id, label]) => {
      const lab = el("label", "check");
      const b = el("input");
      b.type = "checkbox";
      b.value = id;
      b.checked = p.regions.includes(id);
      lab.append(b, el("span", null, label));
      regionWrap.append(lab);
      return b;
    });
    const field = (t, i) => {
      const l = el("label", "field");
      l.append(el("span", null, t), i);
      return l;
    };
    const form = el("section", "card");
    const grid = el("div", "contact-grid");
    grid.append(
      field("التخصص", specialty),
      field("سنين الخبرة", years),
      field("رقم التواصل (للفريق بس)", phone),
      field("الرسمة", avatar),
      field("المناطق", regionWrap),
      field("تعريف قصير", bio),
    );
    const saveBtn = el("button", "primary", "حفظ");
    saveBtn.addEventListener("click", () =>
      save({
        specialty: specialty.value,
        years: Number(years.value || 0),
        phone: phone.value,
        bio: bio.value,
        avatar: avatar.value,
        regions: boxes.filter((b) => b.checked).map((b) => b.value),
      }),
    );
    form.append(el("h2", null, "ملفي"), grid, saveBtn);
    const facts = el("p", "ai-status");
    facts.append(pill(`أقصى عدد حالات: ${p.maxCases}`, ""), el("span", "muted", " · بتحدده مديرة المحاميات"));
    body.replaceChildren(head, big, facts, form, note);
  }

  load();
  return { destroy() {} };
}
