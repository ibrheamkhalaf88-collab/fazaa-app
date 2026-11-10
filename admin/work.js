import { api, errorText } from "./api.js";
import { barRows, barsChart, card, kpi, legend, sum } from "./charts.js";
import { duration, el, REGION } from "./util.js";

const REFRESH_MS = 30_000;
const STATUS = { open: "بانتظار محامية", claimed: "قيد المتابعة", closed: "منتهية" };
const DEFS = [
  { key: "created", color: "var(--primary)", label: "حالات جديدة" },
  { key: "closed", color: "var(--good)", label: "حالات منتهية" },
];

/** Lawyer work dashboard: team workload, her own numbers, regions and topics. Counts only. */
export function workView(ctx) {
  const body = el("div");
  ctx.view.replaceChildren(body);
  async function load() {
    try {
      const w = await api("/work");
      ctx.banner();
      const total = Object.values(w.byStatus).reduce((a, b) => a + b, 0);
      const head = el("div", "page-head");
      head.append(
        el("h1", null, "لوحة العمل"),
        el("span", "muted", "أرقام الفريق وأرقامك، بدون أي محتوى محادثات"),
      );

      const mine = el("div", "kpis k4");
      mine.append(
        kpi(w.me.claimed, "حالات تولّيتِها (14 يوم)", "good"),
        kpi(w.me.closed, "حالات أنهيتِها (14 يوم)"),
        kpi(w.byStatus.open || 0, STATUS.open, (w.byStatus.open || 0) > 0 ? "wait" : ""),
        kpi(w.byStatus.claimed || 0, STATUS.claimed),
        kpi(w.avgClaimWaitMs ? duration(w.avgClaimWaitMs) : "—", "متوسط الانتظار قبل التولّي"),
        kpi(w.oldestWaitingMs ? duration(w.oldestWaitingMs) : "—", "أطول انتظار حالياً"),
        kpi(w.visits, "زيارات التطبيق (14 يوم)"),
        kpi(sum(w.series, "created"), "حالات جديدة (14 يوم)"),
      );

      const chart = card(
        "حالات الفريق كل يوم",
        barsChart(w.series, DEFS, { label: "الحالات اليومية" }),
        legend(DEFS),
      );
      const regions = card(
        "وين المستخدمات؟ (حسب المنطقة)",
        barRows(
          Object.entries(w.byRegion).sort((a, b) => b[1] - a[1]),
          (k) => REGION[k] || k,
          total,
        ),
      );
      const status = card(
        "الحالات حسب الوضع",
        barRows(Object.entries(w.byStatus), (k) => STATUS[k] || k, total),
      );
      const topics = card(
        "أكثر المواضيع",
        barRows(
          Object.entries(w.topics)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8),
          (k) => k,
        ),
        el("p", "hint", "المواضيع من قائمة جاهزة فقط، أي نص حر بيتحوّل إلى «أخرى»."),
      );
      const g1 = el("div", "grid2");
      g1.append(chart, regions);
      const g2 = el("div", "grid2");
      g2.append(status, topics);
      body.replaceChildren(head, mine, g1, g2);
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }
  load();
  const t = setInterval(load, REFRESH_MS);
  return { destroy: () => clearInterval(t) };
}
