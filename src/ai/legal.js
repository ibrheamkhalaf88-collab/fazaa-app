import { ARTICLES, LAWS } from "../data/law/index.js";
import { tokenize } from "./normalize.js";

/**
 * Legal safety checks shared by the app (offline) and the AI servers.
 *
 * 1. findArticleByNumber: «شو بتقول المادة 15؟» is answered with THAT article (or an honest "not in
 *    the texts I have"), never with articles that merely share words.
 * 2. checkGrounding: a law answer may only state numbers (penalties, amounts, ages, durations) and
 *    article numbers that appear in the articles it cites. A correct article id is not enough.
 * 3. legalLeak: a support / listening reply must not carry legal claims (penalties, articles, court
 *    outcomes, deadlines), whatever the model wrote.
 */

const toLatin = (s) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const norm = (s) => tokenize(s).join(" ");

/** Words that name a law, to pick between laws that share an article number. */
const LAW_HINTS = {
  "cyber-2018": ["الجرائم الالكترونيه", "الكترونيه", "الكتروني", "ابتزاز", "الجرائم"],
  "psl-wb-1976": ["الاحوال الشخصيه", "احوال شخصيه", "الضفه"],
  "family-gaza-1954": ["حقوق العائله", "العائله", "غزه"],
  "basic-law-2003": ["الاساسي", "القانون الاساسي"],
};
const PREFIX = { "cyber-2018": "", "psl-wb-1976": "psl:", "family-gaza-1954": "gz:", "basic-law-2003": "bl:" };

/**
 * @param {string} question
 * @param {string} region  "ps-wb" | "ps-gaza"
 * @returns {null | {number: string, found: object[], missing: boolean, ambiguous: boolean, outOfRegion: object[]}}
 *          null when the question does not ask about an article number
 */
export function findArticleByNumber(question, region) {
  const t = toLatin(norm(question));
  const m = /(?:^| )(?:ال)?ماده(?: رقم)? ([0-9]{1,3})(?: |$)/.exec(t);
  if (!m) return null;
  const number = String(Number(m[1]));
  const hinted = Object.entries(LAW_HINTS)
    .filter(([, words]) => words.some((w) => t.includes(norm(w))))
    .map(([key]) => key);
  const laws = hinted.length ? LAWS.filter((l) => hinted.includes(l.key)) : LAWS;
  const all = laws.map((l) => ARTICLES[`${PREFIX[l.key]}${number}`]).filter(Boolean);
  const found = all.filter((a) => a.regions.includes(region));
  const outOfRegion = all.filter((a) => !a.regions.includes(region));
  return { number, found, missing: found.length === 0, ambiguous: found.length > 1, outOfRegion };
}

/**
 * Specific questions that one or two articles answer directly («قديش مدة العدة؟» -> «مدة العدة»), checked in
 * order (the most specific first). Without this, a keyword like «العدة» only reached the whole divorce list
 * and the app showed «الشقاق» and «التعويض» for a question about the waiting period (found 2026-11-13).
 * Each entry: all regexes must match the normalised question.
 */
const SPECIFIC = [
  { label: "الاعتداد ببيت الزوجية", all: [/عده|عدتي|اعتد/, /بيت|البيت|اضل|بضل|مسكن|اطلع/], ids: ["psl:146", "psl:135"] },
  { label: "نفقة العدة", all: [/عده|عدتي|اعتد/, /نفقه|مصروف|مصاري/], ids: ["psl:79", "psl:135"] },
  { label: "مدة العدة", all: [/(?:^| )(?:و|ب|بال|ال|لل)?(?:عده|عدتي)(?= |$)|اعتد/], ids: ["psl:135", "psl:146"] },
  { label: "المهر", all: [/(?:^| )(?:و|ب|بال|ال|لل)?(?:مهر|مهري|مؤخر|مقدم)(?= |$)/], ids: ["psl:61", "gz:55", "gz:38"] },
  { label: "الخلع", all: [/(?:^| )(?:و|ب|بال|ال|لل)?(?:خلع|مخالعه|اخلعه)(?= |$)/], ids: ["psl:102"] },
  { label: "رؤية الولاد", all: [/(?:اشوف|بشوف|رؤيه|مشاهده|زياره|يشوف)/, /(?:الولاد|ولادي|الصغير|البنات|ابني|بنتي)/], ids: ["psl:163"] },
  { label: "شروط الحاضنة", all: [/(?:شروط|تسقط|بتسقط|بسقط|سقوط) (?:ال)?(?:حضانه|حضانتي|الحاضنه)/], ids: ["psl:155", "psl:157"] },
  { label: "التعويض عن الطلاق", all: [/(?:تعويض|تعسفي)/], ids: ["psl:134"] },
  { label: "التفريق للشقاق", all: [/(?:شقاق|نزاع|تفريق للضرر|بدي افسخ)/], ids: ["psl:132", "psl:123", "gz:94"] },
  { label: "المسكن المستقل", all: [/(?:مسكن|بيت|اسكن|ساكنه|ساكنين|عايشه|عايشين)/, /(?:لحالي|مستقل|حماتي|اهله|اهل جوزي|سلفي|معنا)/, /(?:حقي|بيحقلي|القانون|مسموح|بقدر اطلب)/], ids: ["psl:38"] },
  { label: "نفقة الولاد", all: [/(?:نفقه|مصروف)(?: (?:لكل|ل|كل|عن|على))? (?:ال)?(?:ولد|ولاد|اولاد|ولادي|الصغير|طفل|ابن|بنت)/], ids: ["psl:168", "gz:59"] },
];

/**
 * @param {string} question
 * @param {string} region
 * @returns {null | {label: string, found: object[], outOfRegion: object[]}}
 */
export function findSpecificArticles(question, region) {
  const t = norm(question);
  const hit = SPECIFIC.find((s) => s.all.every((re) => re.test(t)));
  if (!hit) return null;
  const all = hit.ids.map((id) => ARTICLES[id]).filter(Boolean);
  return { label: hit.label, found: all.filter((a) => a.regions.includes(region)), outOfRegion: all.filter((a) => !a.regions.includes(region)) };
}

/** Numbers written as digits or as Arabic number words, normalised for comparison. */
const NUMBER_WORDS = [
  "مائتي",
  "مئتي",
  "مائتين",
  "ميتين",
  "الف",
  "الفين",
  "ثلاثه الاف",
  "تلات الاف",
  "ثلاثه اشهر",
  "سنه",
  "سنتين",
  "شهر",
  "شهرين",
  "اشهر",
  "شهور",
  "يوم",
  "ايام",
];
function numbersIn(text) {
  const t = toLatin(norm(text));
  const digits = t.match(/[0-9]+/g) || [];
  return digits.filter((d) => d.length < 6);
}

/**
 * A law answer is grounded when every number it states, and every article it names, is in the
 * cited articles. Returns the list of problems ([] = grounded).
 * @param {{lead:string, note:string, steps:string[], closing?:string, cites:string[]}} answer
 * @param {Record<string, {text:string, amended?:string}>} articles  the cited articles (by id)
 */
export function checkGrounding(answer, articles) {
  const problems = [];
  const prose = [answer.lead, answer.note, ...(answer.steps || []), answer.closing || ""].join(" ");
  const sources = answer.cites.map((id) => articles[id]).filter(Boolean);
  if (answer.cites.length && sources.length !== answer.cites.length) problems.push("cite-not-provided");
  const sourceText = toLatin(norm(sources.map((a) => `${a.text} ${a.amended || ""}`).join(" ")));
  const sourceNumbers = new Set(numbersIn(sourceText));
  // spelled amounts in the sources ("مائتي دينار") count as their digits
  const SPELLED = {
    200: ["مائتي", "مئتي"],
    1000: ["الف"],
    3000: ["ثلاثه الاف"],
    5000: ["خمسه الاف"],
    10000: ["عشره الاف"],
    18: ["الثامنه عشر"],
    3: ["ثلاثه اشهر", "ثلاث سنوات"],
    5: ["خمس سنوات"],
    2: ["سنتين"],
  };
  for (const [n, words] of Object.entries(SPELLED))
    if (words.some((w) => sourceText.includes(norm(w)))) sourceNumbers.add(n);
  const citedNumbers = new Set(answer.cites.map((id) => id.replace(/^[a-z]+:/, "")));

  const named = [...toLatin(norm(prose)).matchAll(/(?:^| )(?:ال)?ماده(?: رقم)? ([0-9]{1,3})/g)].map((x) => x[1]);
  for (const n of named) if (!citedNumbers.has(String(Number(n)))) problems.push(`article-not-cited:${n}`);

  for (const n of numbersIn(prose)) {
    if (citedNumbers.has(n)) continue; // the article's own number
    if (!sourceNumbers.has(n)) problems.push(`number-not-in-source:${n}`);
  }
  if (!answer.cites.length && LEGAL_CLAIM.test(norm(prose))) problems.push("legal-claim-without-source");
  return problems;
}

/** Wording that states law: penalties, articles, court outcomes, legal deadlines. */
const LEGAL_CLAIM = new RegExp(
  `(?:^| )(?:${[
    "ماده",
    "الماده",
    "عقوبه",
    "العقوبه",
    "عقوبته",
    "بيعاقب",
    "يعاقب",
    "حبس",
    "بالحبس",
    "سجن",
    "بالسجن",
    "غرامه",
    "دينار",
    "شيكل",
    "القانون بيقول",
    "حسب القانون",
    "القانون بيعطيكي",
    "القانون بيحميكي",
    "المحكمه رح",
    "المحكمه بتحكم",
    "بتحكملك",
    "رح تربحي",
    "من حقك قانونيا",
    "حقك القانوني",
    "خلال [0-9]+ يوم",
  ]
    .map(norm)
    .join("|")})(?= |$)`,
);

/** True when a support / listening reply contains legal claims (it must not). */
export const legalLeak = (text) => LEGAL_CLAIM.test(norm(text));

/** Law registry metadata for the UI and the review list. */
export function lawMeta(articleId) {
  const a = ARTICLES[articleId];
  if (!a) return null;
  const law = LAWS.find((l) => l.key === a.lawKey);
  return {
    lawName: a.lawName,
    regions: a.regions,
    source: law?.source || "",
    review: law?.review || { status: "pending", by: "", at: "" },
    amended: a.amended || "",
  };
}

export { NUMBER_WORDS };
