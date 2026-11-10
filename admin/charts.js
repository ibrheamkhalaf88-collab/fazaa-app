import { el, svg } from "./util.js";

/** A KPI tile. */
export function kpi(value, label, cls = "") {
  const d = el("div", `card kpi ${cls}`.trim());
  d.append(el("b", null, String(value)), el("span", null, label));
  return d;
}

/**
 * Bars per day, drawn as inline SVG (no library). `defs` = [{key, color, label}].
 * stacked:false -> side by side, stacked:true -> one stacked bar per day. Oldest day on the right (RTL).
 */
export function barsChart(series, defs, { stacked = false, height = 200, label = "" } = {}) {
  const W = 600;
  const pad = { l: 30, r: 8, t: 10, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const totals = series.map((d) =>
    stacked ? defs.reduce((n, f) => n + (d[f.key] || 0), 0) : Math.max(...defs.map((f) => d[f.key] || 0)),
  );
  const top = Math.max(4, Math.ceil(Math.max(...totals, 1) / 2) * 2);
  const slot = plotW / series.length;
  const bw = stacked ? Math.min(18, slot * 0.6) : Math.min(12, slot / (defs.length + 1));
  const y = (v) => pad.t + plotH - (v / top) * plotH;

  const root = svg("svg", {
    viewBox: `0 0 ${W} ${height}`,
    class: "chart",
    role: "img",
    "aria-label": label,
  });
  for (const v of [0, top / 2, top]) {
    root.append(
      svg("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: "var(--line)", "stroke-width": 1 }),
    );
    root.append(svg("text", { x: pad.l - 6, y: y(v) + 4, "text-anchor": "end" }, String(Math.round(v))));
  }
  const labelEvery = series.length > 30 ? 7 : series.length > 14 ? 3 : 2;
  series.forEach((d, i) => {
    const cx = W - pad.r - slot * (i + 0.5);
    if (stacked) {
      let acc = 0;
      for (const f of defs) {
        const v = d[f.key] || 0;
        if (!v) continue;
        root.append(
          svg("rect", {
            x: cx - bw / 2,
            y: y(acc + v),
            width: bw,
            height: y(acc) - y(acc + v),
            fill: f.color,
          }),
        );
        acc += v;
      }
    } else {
      defs.forEach((f, j) => {
        const v = d[f.key] || 0;
        const x = cx - (bw * defs.length) / 2 + j * bw;
        root.append(
          svg("rect", { x, y: y(v), width: bw - 1, height: pad.t + plotH - y(v), rx: 3, fill: f.color }),
        );
      });
    }
    if (i % labelEvery === 0 || series.length < 8)
      root.append(svg("text", { x: cx, y: height - 8, "text-anchor": "middle" }, d.day.slice(8)));
  });
  return root;
}

export function legend(defs) {
  const box = el("div", "legend");
  for (const f of defs) {
    const item = el("span");
    const dot = el("i");
    dot.style.background = f.color;
    item.append(dot, document.createTextNode(f.label));
    box.appendChild(item);
  }
  return box;
}

/** Horizontal share bars. entries = [[key, n]]. */
export function barRows(entries, labelOf, total = entries.reduce((n, [, v]) => n + v, 0)) {
  const box = el("div", "bars");
  for (const [key, n] of entries) {
    const row = el("div", "bar-row");
    const top = el("div", "top");
    const pct = total ? Math.round((n / total) * 100) : 0;
    top.append(el("span", null, labelOf(key)), el("b", null, `${n} · ${pct}%`));
    const track = el("div", "track");
    const fill = el("div", "fill");
    fill.style.width = `${pct}%`;
    track.appendChild(fill);
    row.append(top, track);
    box.appendChild(row);
  }
  if (!entries.length) box.appendChild(el("div", "empty", "لا بيانات بعد."));
  return box;
}

/** A card with a heading and children. */
export function card(title, ...children) {
  const c = el("section", "card");
  if (title) c.appendChild(el("h2", null, title));
  c.append(...children);
  return c;
}

export const sum = (arr, key) => arr.reduce((n, d) => n + (d[key] || 0), 0);
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Period picker (7 / 14 / 30 / 90 days). */
export function periodPicker(current, onPick) {
  const box = el("div", "chips");
  for (const d of [7, 14, 30, 90]) {
    const b = el("button", "chip", `${d} يوم`);
    b.setAttribute("aria-pressed", String(d === current));
    b.addEventListener("click", () => onPick(d));
    box.appendChild(b);
  }
  return box;
}
