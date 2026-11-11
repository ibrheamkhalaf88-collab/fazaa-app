import { el } from "../src/core/dom.js";

export { el };

export const REGION = { "ps-wb": "الضفة الغربية", "ps-gaza": "غزة" };
export const ROLE = { lawyer: "محامي", developer: "مطوّر" };
export const ACTION = {
  claim: "تولّت حالة",
  close: "أنهت حالة",
  "staff-add": "أضاف/عدّل عضواً",
  "staff-remove": "حذف عضواً",
  "staff-suspend": "علّق حساب عضو",
  "staff-restore": "أعاد تفعيل عضو",
  purge: "حذف تلقائي للمنتهي",
  "ai-config-set": "حفظت إعدادات الذكاء الاصطناعي",
  "ai-config-clear": "حذفت مفتاح الذكاء الاصطناعي",
  "ai-config-test": "جرّبت اتصال الذكاء الاصطناعي",
  "ai-answers-export": "صدّرت أجوبة الذكاء المراجَعة",
  "view-contact": "فتحت بيانات تواصل مستخدمة",
  "staff-login": "سجّل دخول للوحة",
  "password-change": "غيّر كلمة السر",
  "staff-password-reset": "عمل كلمة سر مؤقتة لعضو",
  "user-delete": "حذف حساب مستخدمة",
  "dev-read-case": "فتح محادثة للقراءة",
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

/* Line icons (24px grid, stroke = currentColor). */
const ICON_PATHS = {
  chat: "M4 5h16v11H8l-4 4z",
  inbox: "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  check: "M4 12l5 5L20 6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  team: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  back: "M9 18l6-6-6-6",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
};
export function icon(name) {
  const node = svg("svg", { class: "icon", viewBox: "0 0 24 24", "aria-hidden": "true" });
  node.appendChild(svg("path", { d: ICON_PATHS[name] || ICON_PATHS.list }));
  return node;
}
/** First letter for an avatar circle. */
export const initial = (s) => (String(s || "").trim()[0] || "؟").toUpperCase();

export function pill(text, cls = "") {
  return el("span", `pill ${cls}`.trim(), text);
}
