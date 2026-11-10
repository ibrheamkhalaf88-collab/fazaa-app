import { api, errorText } from "./api.js";
import { barRows, barsChart, card, kpi, legend, pct, periodPicker, sum } from "./charts.js";
import { ago, dateTime, el, REGION } from "./util.js";

const REFRESH_MS = 60_000;
const FEATURES = {
  ask_ai: "أسئلة جاوبها الذكاء الاصطناعي",
  ask_rules: "أسئلة جاوبتها القواعد (بدون إنترنت)",
  ask_none: "أسئلة ما لقت جواب",
  sos_open: "فتح شاشة الطوارئ",
  lawyer_request: "طلبات محامية",
  install: "تثبيت التطبيق",
};

/** Shared loader: fetch analytics for a period and re-render; period is remembered while the view lives. */
function analyticsView(ctx, title, subtitle, render) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  let days = 14;
  async function load() {
    try {
      const a = await api(`/analytics?days=${days}`);
      ctx.banner();
      const head = el("div", "page-head");
      head.append(el("h1", null, title), el("span", "muted", subtitle));
      body.replaceChildren(
        head,
        periodPicker(days, (d) => ((days = d), load())),
        ...render(a, days),
      );
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }
  load();
  const t = setInterval(load, REFRESH_MS);
  return { destroy: () => clearInterval(t) };
}

const note = (t) => el("p", "hint", t);

/* ============ visitors & usage ============ */
export function usageView(ctx) {
  return analyticsView(
    ctx,
    "الزوّار والاستخدام",
    "أعداد مجهولة فقط. ما في حسابات ولا هويات للمستخدمات",
    (a, days) => {
      const t = a.totals;
      const visits = t.visit + t.visit_return;
      const kpis = el("div", "kpis");
      kpis.append(
        kpi(visits, `زيارات (${days} يوم)`, "good"),
        kpi(t.visit, "زيارات جديدة"),
        kpi(t.visit_return, `زيارات متكررة · ${pct(t.visit_return, visits)}%`),
        kpi(t.install, "تثبيتات"),
        kpi(t.sos_open, "فتح الطوارئ"),
        kpi(t.lawyer_request, "طلبات محامية"),
      );

      const defs = [
        { key: "visit", color: "var(--primary)", label: "جديدة" },
        { key: "visit_return", color: "var(--good)", label: "متكررة" },
      ];
      const chart = card(
        "الزيارات كل يوم",
        barsChart(a.series, defs, { stacked: true, label: "الزيارات اليومية" }),
        legend(defs),
      );

      const regions = {};
      for (const ev of ["visit", "visit_return"])
        for (const [r, n] of Object.entries(a.regions[ev] || {})) regions[r] = (regions[r] || 0) + n;
      const side = card(
        "المستخدمات حسب المنطقة",
        barRows(
          Object.entries(regions).sort((x, y) => y[1] - x[1]),
          (k) => REGION[k] || "غير محددة",
          visits,
        ),
        note("المنطقة هي اللي اختارتها المستخدمة بالإعدادات، مش موقعها."),
      );

      const feat = card(
        "استخدام الميزات",
        barRows(
          Object.keys(FEATURES)
            .map((k) => [k, t[k] || 0])
            .filter(([, n]) => n),
          (k) => FEATURES[k],
          Math.max(1, ...Object.keys(FEATURES).map((k) => t[k] || 0)),
        ),
      );
      const topics = card(
        "أكثر المواضيع طلباً للمحامية",
        barRows(
          Object.entries(a.topics)
            .sort((x, y) => y[1] - x[1])
            .slice(0, 8),
          (k) => k,
        ),
      );

      const grid = el("div", "grid2");
      grid.append(chart, side);
      const grid2 = el("div", "grid2");
      grid2.append(feat, topics);

      // who signed in: staff accounts only
      const table = el("table", "table");
      const hr = el("tr");
      for (const h of ["الاسم", "الصلاحية", "آخر دخول", "أيام الدخول"]) hr.appendChild(el("th", null, h));
      const thead = el("thead");
      thead.appendChild(hr);
      const tbody = el("tbody");
      for (const m of a.staff) {
        const tr = el("tr");
        tr.append(
          el("td", null, m.name || m.email),
          el("td", null, m.role === "lawyer" ? "محامية" : "مطوّر"),
          el("td", null, m.lastSeen ? ago(Date.now() - m.lastSeen) : "ما دخل بعد"),
          el("td", null, String(m.sessions || 0)),
        );
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      const wrap = el("div", "table-wrap");
      wrap.appendChild(table);
      const staff = card(
        "مين سجّل دخول (الفريق)",
        wrap,
        note("المستخدمات مجهولات: ما بنعرف مين دخلت ولا بنخزّن أي هوية."),
      );
      return [kpis, grid, grid2, staff];
    },
  );
}

/* ============ AI monitoring ============ */
export function aiView(ctx) {
  return analyticsView(
    ctx,
    "الذكاء الاصطناعي",
    "جودة وسرعة الإجابات. أرقام فقط بدون نص الأسئلة",
    (a, days) => {
      const t = a.totals;
      const asked = t.ask_ai + t.ask_rules + t.ask_none;
      const attempts = t.ask_ai + t.ai_error;
      const kpis = el("div", "kpis");
      kpis.append(
        kpi(asked, `أسئلة (${days} يوم)`),
        kpi(t.ask_ai, "جاوبها الذكاء الاصطناعي", "good"),
        kpi(t.ask_rules, "جاوبتها القواعد"),
        kpi(
          `${pct(t.ask_none, asked)}%`,
          "بدون جواب",
          t.ask_none && pct(t.ask_none, asked) > 20 ? "wait" : "",
        ),
        kpi(
          `${pct(t.ai_error, attempts)}%`,
          `أخطاء الذكاء (${t.ai_error})`,
          t.ai_error && pct(t.ai_error, attempts) > 10 ? "wait" : "",
        ),
        kpi(a.aiAvgMs ? `${(a.aiAvgMs / 1000).toFixed(1)} ث` : "—", "متوسط زمن الإجابة"),
      );
      const defs = [
        { key: "ask_ai", color: "var(--primary)", label: "ذكاء اصطناعي" },
        { key: "ask_rules", color: "var(--good)", label: "قواعد" },
        { key: "ask_none", color: "var(--wait)", label: "بدون جواب" },
      ];
      const chart = card(
        "الأسئلة كل يوم",
        barsChart(a.series, defs, { stacked: true, label: "الأسئلة اليومية" }),
        legend(defs),
      );
      const split = card(
        "مين جاوب؟",
        barRows(
          [
            ["ask_ai", t.ask_ai],
            ["ask_rules", t.ask_rules],
            ["ask_none", t.ask_none],
          ],
          (k) => FEATURES[k],
          asked,
        ),
        note(
          "إذا ارتفعت نسبة «بدون جواب» فهذا معناه نواقص بالقوانين المغذّاة. وإذا ارتفعت الأخطاء افحصي مفتاح المزوّد والحصّة.",
        ),
      );
      const errs = card(
        "الأخطاء كل يوم",
        barsChart(a.series, [{ key: "ai_error", color: "var(--wait)", label: "أخطاء" }], {
          label: "أخطاء الذكاء الاصطناعي",
        }),
      );
      const grid = el("div", "grid2");
      grid.append(chart, split);
      return [
        kpis,
        grid,
        errs,
        note(
          `مجموع أسئلة الذكاء بالفترة: ${sum(a.series, "ask_ai")} · متوسط الزمن ${(a.aiAvgMs / 1000).toFixed(1)} ث`,
        ),
      ];
    },
  );
}

/* ============ registered women (accounts only, never names or phones) ============ */
export function usersView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  async function load() {
    try {
      const u = await api("/users");
      ctx.banner();
      const head = el("div", "page-head");
      head.append(
        el("h1", null, "المستخدمات المسجّلات"),
        el("span", "muted", "اللي سجّلن لطلب محامية. بدون الأسماء ولا الأرقام"),
      );
      const kpis = el("div", "kpis");
      kpis.append(
        kpi(u.total, "حسابات", "good"),
        kpi(u.active7, "دخلن آخر 7 أيام"),
        kpi(u.active30, "دخلن آخر 30 يوم"),
        kpi(sum(u.series, "n"), "حسابات جديدة (14 يوم)"),
      );
      const chart = card(
        "تسجيلات جديدة كل يوم",
        barsChart(
          u.series.map((d) => ({ day: d.day, signups: d.n })),
          [{ key: "signups", color: "var(--primary)", label: "تسجيلات" }],
          {
            label: "التسجيلات اليومية",
          },
        ),
      );
      const regions = card(
        "حسب المنطقة",
        barRows(Object.entries(u.byRegion), (k) => REGION[k] || k, u.total),
      );
      const grid = el("div", "grid2");
      grid.append(chart, regions);

      const table = el("table", "table");
      const hr = el("tr");
      for (const h of ["الاسم المستعار", "المنطقة", "تاريخ التسجيل", "آخر دخول"])
        hr.appendChild(el("th", null, h));
      const thead = el("thead");
      thead.appendChild(hr);
      const tbody = el("tbody");
      for (const r of u.users) {
        const tr = el("tr");
        const alias = el("td", null, r.username);
        alias.dir = "ltr";
        alias.style.textAlign = "start";
        tr.append(
          alias,
          el("td", null, REGION[r.region] || r.region),
          el("td", null, dateTime(r.createdAt)),
          el("td", null, r.lastLogin ? ago(Date.now() - r.lastLogin) : "—"),
        );
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      const wrap = el("div", "table-wrap");
      wrap.appendChild(u.users.length ? table : el("div", "empty", "ما في حسابات بعد."));
      const list = card(
        "آخر الحسابات نشاطاً",
        wrap,
        note("الأسماء وأرقام الهواتف مشفّرة، وبس المحامية اللي تولّت الحالة بتشوفها."),
      );
      body.replaceChildren(head, kpis, grid, list);
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }
  load();
  const t = setInterval(load, REFRESH_MS);
  return { destroy: () => clearInterval(t) };
}
