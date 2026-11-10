import { el } from "../src/core/dom.js";

export { el };

export const REGION = { "ps-wb": "الضفة الغربية", "ps-gaza": "غزة" };
export const ROLE = { lawyer: "محامية", developer: "مطوّر" };
export const ACTION = {
  claim: "تولّت حالة",
  close: "أنهت حالة",
  "staff-add": "أضاف/عدّل عضواً",
  "staff-remove": "حذف عضواً",
  purge: "حذف تلقائي للمنتهي",
  "view-contact": "فتحت بيانات تواصل مستخدمة",
};

export const minutes = (ms) => Math.max(0, Math.floor(ms / 60000));

/** "قبل 5 دقائق" style relative time. */
export function ago(ms) {
  const min = minutes(ms);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} دقيقة`;
  const h = Math.floor(min / 60);
  return h < 24 ? `قبل ${h} ساعة` : `قبل ${Math.floor(h / 24)} يوم`;
}

/** Short duration, e.g. "12 د" / "2 س 10 د". */
export function duration(ms) {
  const min = minutes(ms);
  if (min < 60) return `${min} د`;
  const h = Math.floor(min / 60);
  return `${h} س ${min % 60} د`;
}

/** Calm urgency: green under 15 min, amber under an hour, solid amber after that. */
export const ageClass = (ms) => (minutes(ms) < 15 ? "age" : minutes(ms) < 60 ? "age mid" : "age old");

const SVG_NS = "http://www.w3.org/2000/svg";
export function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

export const time = (ms) => new Date(ms).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
export const dateTime = (ms) =>
  new Date(ms).toLocaleString("ar", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function pill(text, cls = "") {
  return el("span", `pill ${cls}`.trim(), text);
}
