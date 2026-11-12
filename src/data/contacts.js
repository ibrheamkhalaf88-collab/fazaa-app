/**
 * Who a woman can contact (emergency numbers and support organisations). One shape shared by
 * the app (support screen + emergency replies), the API (validation) and the dashboard (editor).
 *
 * The owner edits the list in the dashboard ("أرقام التواصل"). Until she saves one, the app uses
 * DEFAULT_CONTACTS. Two ids are special: "police" and "ambulance" fill the numbers in the fixed
 * emergency replies (src/ai/danger.js).
 */

/** Category id -> label (also the filter tabs on the support screen). */
export const CONTACT_CATS = { emergency: "طوارئ", safe: "أمني", law: "قانوني", mind: "نفسي" };
export const CONTACT_REGIONS = { all: "الضفة وغزة", "ps-wb": "الضفة الغربية", "ps-gaza": "قطاع غزة" };
export const MAX_CONTACTS = 30;

/**
 * @typedef {{id:string, cat:keyof typeof CONTACT_CATS, name:string, desc:string, phone:string, whatsapp:string,
 *   badge:string, region:keyof typeof CONTACT_REGIONS, hours:string,
 *   active:boolean,           // false = hidden in the app (the line is down, closed, or not ready)
 *   verified:boolean,         // the owner confirmed the number with the organisation itself
 *   verifiedAt:number|null,   // when (set by the server)
 *   note:string               // internal note for the team; never sent to the app
 * }} Contact
 */

/** The starting list (before the owner saves her own). Completed by validateContacts below. */
const STARTING_LIST = [
  {
    id: "police",
    cat: "emergency",
    name: "الشرطة",
    desc: "إذا إنتِ بخطر هلأ",
    phone: "100",
    whatsapp: "",
    badge: "طوارئ",
    region: "all",
  },
  {
    id: "ambulance",
    cat: "emergency",
    name: "الإسعاف",
    desc: "إصابة أو حالة طبية طارئة",
    phone: "101",
    whatsapp: "",
    badge: "طوارئ",
    region: "all",
  },
  {
    id: "civil",
    cat: "emergency",
    name: "الدفاع المدني",
    desc: "حريق أو خطر بالبيت",
    phone: "102",
    whatsapp: "",
    badge: "طوارئ",
    region: "all",
  },
  {
    id: "cyber",
    cat: "safe",
    name: "وحدة الجرائم الإلكترونية بالشرطة",
    desc: "للابتزاز والتهديد ونشر الصور",
    phone: "",
    whatsapp: "",
    badge: "رسمية",
    region: "all",
  },
  {
    id: "legal",
    cat: "law",
    name: "مساعدة قانونية مجانية للنساء",
    desc: "محاميات بيتابعوا قضايا العنف والابتزاز والأحوال الشخصية",
    phone: "",
    whatsapp: "",
    badge: "مجانية",
    region: "all",
  },
  {
    id: "mind",
    cat: "mind",
    name: "خط الدعم النفسي",
    desc: "حدا يسمعك بسرية",
    phone: "",
    whatsapp: "",
    badge: "سري",
    region: "all",
  },
];

const LIMITS = { id: 24, name: 60, desc: 140, phone: 20, badge: 20, hours: 40, note: 200 };

const text = (v, max) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/** Digits, "+", "-" and spaces only; "" when empty. Throws on anything else. */
const number = (v) => {
  const s = text(v, LIMITS.phone);
  if (s && !/^\+?[0-9٠-٩][0-9٠-٩ -]{0,18}$/.test(s)) throw new Error("bad-phone");
  return s;
};

/**
 * Clean and check a list typed by a person. Throws with a short reason; never trusts the input.
 * @param {unknown} list
 * @returns {Contact[]}
 */
export function validateContacts(list) {
  if (!Array.isArray(list)) throw new Error("bad-list");
  if (list.length > MAX_CONTACTS) throw new Error("too-many");
  const seen = new Set();
  return list.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new Error("bad-item");
    const c = /** @type {Record<string, unknown>} */ (raw);
    let id = text(c.id, LIMITS.id).replace(/[^\w-]/g, "");
    if (!id || seen.has(id)) id = `c${i + 1}-${Math.random().toString(36).slice(2, 7)}`;
    seen.add(id);
    const cat = typeof c.cat === "string" && c.cat in CONTACT_CATS ? c.cat : "";
    if (!cat) throw new Error("bad-cat");
    const name = text(c.name, LIMITS.name);
    if (!name) throw new Error("name-required");
    const region = typeof c.region === "string" && c.region in CONTACT_REGIONS ? c.region : "all";
    return {
      id,
      cat: /** @type {Contact["cat"]} */ (cat),
      name,
      desc: text(c.desc, LIMITS.desc),
      phone: number(c.phone),
      whatsapp: number(c.whatsapp),
      badge: text(c.badge, LIMITS.badge),
      region: /** @type {Contact["region"]} */ (region),
      hours: text(c.hours, LIMITS.hours),
      active: c.active !== false,
      verified: c.verified === true,
      verifiedAt: c.verified === true && Number.isFinite(c.verifiedAt) ? Number(c.verifiedAt) : null,
      note: text(c.note, LIMITS.note),
    };
  });
}

/** @type {Contact[]} */
export const DEFAULT_CONTACTS = validateContacts(STARTING_LIST);

/** What the app may see: active entries only, without the team's internal note. */
export const publicContacts = (list) => list.filter((c) => c.active).map(({ note: _note, ...c }) => c);

/** Active contacts for one region (the user's choice in Settings). */
export const contactsFor = (list, region) =>
  list.filter((c) => c.active !== false && (c.region === "all" || c.region === region));

/** The number of a special contact ("police", "ambulance"), or "" if removed or switched off. */
export const numberOf = (list, id) => list.find((c) => c.id === id && c.active !== false)?.phone || "";
