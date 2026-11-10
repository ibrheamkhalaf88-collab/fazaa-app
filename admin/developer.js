import { api, errorText } from "./api.js";
import { barRows, barsChart, kpi, legend } from "./charts.js";
import { ACTION, ago, dateTime, duration, el, REGION, ROLE } from "./util.js";

const REFRESH_MS = 30_000;
const STATUS = { open: "بانتظار محامية", claimed: "قيد المتابعة", closed: "منتهية" };
export const DAILY_DEFS = [
  { key: "created", color: "var(--primary)", label: "حالات جديدة" },
  { key: "closed", color: "var(--good)", label: "حالات منتهية" },
];

/* ============ overview ============ */
export function overviewView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  async function load() {
    try {
      const s = await api("/stats");
      ctx.banner();
      const by = s.byStatus;
      const total = Object.values(by).reduce((a, b) => a + b, 0);
      const week = s.series.slice(-7).reduce((n, d) => n + d.created, 0);

      const head = el("div", "page-head");
      head.append(
        el("h1", null, "نظرة عامة"),
        el("span", "muted", "أرقام مجمّعة فقط، بدون أي محتوى محادثات"),
      );

      const kpis = el("div", "kpis");
      kpis.append(
        kpi(by.open || 0, STATUS.open, (by.open || 0) > 0 ? "wait" : ""),
        kpi(by.claimed || 0, STATUS.claimed, "good"),
        kpi(by.closed || 0, STATUS.closed),
        kpi(week, "حالات جديدة (7 أيام)"),
        kpi(s.lawyers, "محاميات"),
        kpi(s.avgClaimWaitMs ? duration(s.avgClaimWaitMs) : "—", "متوسط الانتظار قبل التولّي"),
        kpi(s.oldestWaitingMs ? duration(s.oldestWaitingMs) : "—", "أطول انتظار حالياً"),
      );

      const chartCard = el("section", "card");
      chartCard.append(
        el("h2", null, "آخر 14 يوماً"),
        barsChart(s.series, DAILY_DEFS, { label: "الحالات الجديدة والمنتهية يومياً" }),
        legend(DAILY_DEFS),
      );

      const sideCard = el("section", "card");
      sideCard.append(
        el("h2", null, "حسب المنطقة"),
        barRows(Object.entries(s.byRegion), (k) => REGION[k] || k, total),
        el("h2", null, "حسب الحالة"),
        barRows(Object.entries(by), (k) => STATUS[k] || k, total),
      );
      sideCard.children[2].style.marginTop = "18px";

      const grid = el("div", "grid2");
      grid.append(chartCard, sideCard);

      const policy = el("section", "card");
      const list = el("ul", "policy");
      for (const t of [
        `المحادثات المنتهية بتنحذف بعد ${s.retention.closedDays} أيام، وأي حالة بدون نشاط بتنحذف بعد ${s.retention.idleDays} يوماً.`,
        "نص الرسائل مشفّر قبل التخزين، والمطوّرون ما بيقدروا يفتحوا أي محادثة.",
        "ما بنخزّن اسم ولا رقم هاتف ولا عنوان IP للمستخدمات.",
        "الأعداد اليومية مجمّعة ومجهولة، فبتضل للرسم حتى بعد حذف الحالات القديمة.",
      ])
        list.appendChild(el("li", null, t));
      policy.append(el("h2", null, "سياسة الخصوصية والاحتفاظ"), list);

      body.replaceChildren(head, kpis, grid, policy);
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }
  load();
  const t = setInterval(load, REFRESH_MS);
  return { destroy: () => clearInterval(t) };
}

/* ============ permissions matrix (read-only; enforced on the server) ============ */
const PERMISSIONS = [
  ["الحالات والمحادثات مع المستخدمات", true, false],
  ["استلام حالة وإنهاؤها", true, false],
  ["مراجعة أجوبة الذكاء الاصطناعي", true, true],
  ["إحصائيات الاستخدام (أعداد فقط)", false, true],
  ["إعدادات الذكاء الاصطناعي والمفتاح", false, true],
  ["تصدير أجوبة الذكاء المراجَعة", false, true],
  ["إدارة الفريق وتعليق الحسابات", false, true],
  ["سجل التدقيق", false, true],
];

function permissionsCard() {
  const card = el("section", "card");
  const table = el("table", "table");
  const head = el("tr");
  for (const h of ["الصلاحية", "محامية", "مطوّر"]) head.appendChild(el("th", null, h));
  const tbody = el("tbody");
  for (const [label, lawyer, dev] of PERMISSIONS) {
    const tr = el("tr");
    tr.append(el("td", null, label), el("td", null, lawyer ? "✓" : "—"), el("td", null, dev ? "✓" : "—"));
    tbody.appendChild(tr);
  }
  const thead = el("thead");
  thead.appendChild(head);
  table.append(thead, tbody);
  const wrap = el("div", "table-wrap");
  wrap.appendChild(table);
  card.append(
    el("h2", null, "جدول الصلاحيات"),
    wrap,
    el("p", "hint", "المطوّر ما بقدر يقرأ محتوى الحالات أبداً. هاد مفروض من السيرفر مش من الشاشة."),
  );
  return card;
}

/* ============ team ============ */
export function teamView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);

  async function load() {
    try {
      const [{ team }, usage] = await Promise.all([api("/team"), api("/analytics?days=7")]);
      const seen = new Map(usage.staff.map((m) => [m.email, m]));
      ctx.banner();
      const head = el("div", "page-head");
      head.append(
        el("h1", null, "الفريق"),
        el("span", "muted", "المحاميات بيشوفوا الحالات، والمطوّرون بيشوفوا النظام فقط"),
      );

      const table = el("table", "table");
      const thead = el("thead");
      const hr = el("tr");
      for (const h of ["المعرّف", "الاسم", "البريد", "الصلاحية", "الحالة", "آخر دخول", "عدد أيام الدخول", ""])
        hr.appendChild(el("th", null, h));
      thead.appendChild(hr);
      const tbody = el("tbody");
      for (const m of team) {
        const tr = el("tr");
        const isMe = m.email === ctx.me.email;
        const roleSel = el("select");
        roleSel.setAttribute("aria-label", `صلاحية ${m.email}`);
        for (const [v, l] of Object.entries(ROLE)) roleSel.append(new Option(l, v, false, v === m.role));
        roleSel.disabled = isMe;
        roleSel.addEventListener("change", () => save({ email: m.email, name: m.name, role: roleSel.value }));
        const toggle = el("button", null, m.active === false ? "تفعيل" : "تعليق");
        toggle.disabled = isMe;
        toggle.addEventListener("click", () =>
          save({ email: m.email, name: m.name, role: m.role, active: m.active === false }),
        );
        const rm = el("button", null, "حذف");
        rm.disabled = isMe;
        rm.addEventListener("click", async () => {
          if (!window.confirm(`حذف ${m.email} من الفريق؟`)) return;
          try {
            await api(`/team?email=${encodeURIComponent(m.email)}`, { method: "DELETE" });
            load();
          } catch (e) {
            ctx.banner(errorText(e));
          }
        });
        const emailCell = el("td", null, m.email);
        emailCell.dir = "ltr";
        const roleCell = el("td");
        roleCell.appendChild(roleSel);
        const rmCell = el("td");
        rmCell.appendChild(rm);
        const act = seen.get(m.email);
        const idCell = el("td", null, m.code || "—");
        idCell.dir = "ltr";
        rmCell.prepend(toggle, " ");
        tr.append(
          idCell,
          el("td", null, m.name || "—"),
          emailCell,
          roleCell,
          el("td", null, m.active === false ? "معلّق" : "فعّال"),
          el("td", null, act?.lastSeen ? ago(Date.now() - act.lastSeen) : "ما دخل بعد"),
          el("td", null, String(act?.sessions || 0)),
          rmCell,
        );
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      const wrap = el("div", "table-wrap");
      wrap.appendChild(
        team.length ? table : el("div", "empty", "ما في أعضاء بعد. أضيفي أول محامية من الأسفل."),
      );

      const email = el("input");
      email.type = "email";
      email.placeholder = "البريد الإلكتروني";
      email.dir = "ltr";
      email.autocomplete = "off";
      const name = el("input");
      name.placeholder = "الاسم الأول (بيظهر للمستخدمة)";
      const role = el("select");
      for (const [v, l] of Object.entries(ROLE)) role.append(new Option(l, v));
      const add = el("button", "primary", "إضافة");
      add.addEventListener("click", () => save({ email: email.value, name: name.value, role: role.value }));
      const form = el("div", "add-form");
      form.append(email, name, role, add);

      const card = el("section", "card");
      card.append(wrap, form, el("p", "hint", "العضو بيدخل بنفس البريد عبر رمز بيوصله على إيميله."));
      body.replaceChildren(head, card, permissionsCard());
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  async function save(member) {
    try {
      await api("/team", { method: "PUT", body: member });
      ctx.banner();
      load();
    } catch (e) {
      ctx.banner(e.status === 400 ? "تأكدي من البريد والصلاحية." : errorText(e));
    }
  }

  load();
  return { destroy() {} };
}

/* ============ audit ============ */
export function auditView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  async function load() {
    try {
      const { audit } = await api("/audit");
      ctx.banner();
      const head = el("div", "page-head");
      head.append(
        el("h1", null, "سجل العمليات"),
        el("span", "muted", "مين عمل شو ومتى. بدون أي نص رسائل. بيتحفظ 90 يوماً"),
      );
      const table = el("table", "table");
      const hr = el("tr");
      for (const h of ["الوقت", "الجهة", "العملية", "التفاصيل"]) hr.appendChild(el("th", null, h));
      const thead = el("thead");
      thead.appendChild(hr);
      const tbody = el("tbody");
      for (const a of audit) {
        const tr = el("tr");
        const target = el("td", null, a.target);
        target.dir = "ltr";
        target.style.textAlign = "start";
        tr.append(
          el("td", null, dateTime(a.at)),
          el("td", null, a.actor),
          el("td", null, ACTION[a.action] || a.action),
          target,
        );
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      const card = el("section", "card");
      const wrap = el("div", "table-wrap");
      wrap.appendChild(audit.length ? table : el("div", "empty", "ما في عمليات مسجّلة بعد."));
      card.appendChild(wrap);
      body.replaceChildren(head, card);
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }
  load();
  const t = setInterval(load, REFRESH_MS);
  return { destroy: () => clearInterval(t) };
}
