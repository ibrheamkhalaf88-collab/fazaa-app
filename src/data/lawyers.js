/**
 * Lawyer profiles: what the team manages in the dashboard ("المحاميات") and the little the app may
 * show. One shape shared by the API (validation), the dashboard and the app.
 *
 * Who can do what (enforced on the server):
 *   - developer: everything, and the only one who can make a lawyer a "manager";
 *   - manager (a lawyer with manager: true): adds lawyers, edits their profiles and contact numbers,
 *     switches anyone available / unavailable, sets the case limit;
 *   - lawyer: her own availability and her own public profile (not her case limit, not "manager").
 *
 * The app sees ONLY: first name, speciality, years, regions, avatar, short bio — never the email
 * or the phone. A lawyer is listed when she is active, marked available and below her case limit.
 */

export const LAWYER_REGIONS = { "ps-wb": "الضفة الغربية", "ps-gaza": "قطاع غزة" };
export const AVATARS = { hijab: "حجاب", hair: "شعر", hijab2: "حجاب ٢" };
export const MAX_CASES_DEFAULT = 5;

const LIMITS = { specialty: 60, bio: 160, phone: 20 };

const text = (v, max) =>
  typeof v === "string"
    ? v
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

/**
 * @typedef {{ specialty:string, years:number, regions:string[], bio:string, avatar:string,
 *   phone:string, available:boolean, maxCases:number, manager:boolean }} LawyerProfile
 */

/** @returns {LawyerProfile} */
export const emptyProfile = () => ({
  specialty: "",
  years: 0,
  regions: Object.keys(LAWYER_REGIONS),
  bio: "",
  avatar: "hijab",
  phone: "",
  available: false,
  maxCases: MAX_CASES_DEFAULT,
  manager: false,
});

/**
 * Merge a typed patch into a profile, cleaning every field. Throws a short reason on bad input.
 * @param {LawyerProfile} base
 * @param {Record<string, unknown>} patch
 * @returns {LawyerProfile}
 */
export function applyProfile(base, patch) {
  const p = { ...emptyProfile(), ...base };
  if ("specialty" in patch) p.specialty = text(patch.specialty, LIMITS.specialty);
  if ("bio" in patch) p.bio = text(patch.bio, LIMITS.bio);
  if ("years" in patch) {
    const y = Number(patch.years);
    if (!Number.isInteger(y) || y < 0 || y > 60) throw new Error("bad-years");
    p.years = y;
  }
  if ("regions" in patch) {
    const r = Array.isArray(patch.regions) ? patch.regions.filter((x) => x in LAWYER_REGIONS) : [];
    if (!r.length) throw new Error("bad-regions");
    p.regions = [...new Set(r)];
  }
  if ("avatar" in patch)
    p.avatar = typeof patch.avatar === "string" && patch.avatar in AVATARS ? patch.avatar : "hijab";
  if ("phone" in patch) {
    const s = text(patch.phone, LIMITS.phone);
    if (s && !/^\+?[0-9٠-٩][0-9٠-٩ -]{0,18}$/.test(s)) throw new Error("bad-phone");
    p.phone = s;
  }
  if ("available" in patch) p.available = patch.available === true;
  if ("maxCases" in patch) {
    const n = Number(patch.maxCases);
    if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error("bad-max-cases");
    p.maxCases = n;
  }
  if ("manager" in patch) p.manager = patch.manager === true;
  return p;
}

/** Fields a lawyer may change on her own profile. */
export const SELF_FIELDS = ["specialty", "bio", "years", "regions", "avatar", "phone", "available"];
/** Fields a manager may change on any lawyer (everything except "manager"). */
export const MANAGER_FIELDS = [...SELF_FIELDS, "maxCases"];

/** Keep only allowed keys of a patch. */
export const pick = (patch, keys) =>
  Object.fromEntries(Object.entries(patch || {}).filter(([k]) => keys.includes(k)));

/**
 * The public card for the app, or null when she should not be listed.
 * @param {{name:string, code:string, active:boolean}} staff
 * @param {LawyerProfile} p
 * @param {number} openCases
 */
export function publicLawyer(staff, p, openCases) {
  if (!staff.active || !p.available || openCases >= p.maxCases) return null;
  return {
    id: staff.code,
    name: String(staff.name || "")
      .trim()
      .split(/\s+/)[0], // first name only
    specialty: p.specialty,
    years: p.years,
    regions: p.regions,
    avatar: p.avatar,
    bio: p.bio,
  };
}
