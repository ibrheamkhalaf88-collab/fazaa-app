import { ARTICLES, articleNumber, COURT_NAMES, LAWS } from "../data/law/index.js";
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
  "family-gaza-1954": ["حقوق العائله", "العائله"],
  "sharia-execution-2021": ["التنفيذ الشرعي", "قانون التنفيذ"],
  "cyber-2018": ["الجرائم الالكترونيه", "الكترونيه", "الكتروني", "ابتزاز"],
  "majalla-claims": ["المجله", "مجله الاحكام"],
  "hanafi-personal-status": ["الاحوال الشخصيه", "احوال شخصيه", "ابي حنيفه"],
  "sharia-procedure-1965": ["اصول المحاكمات", "المحاكمات الشرعيه"],
};
const PREFIX = {
  "family-gaza-1954": "gz:",
  "sharia-execution-2021": "ex:",
  "cyber-2018": "cy:",
  "majalla-claims": "mj:",
  "hanafi-personal-status": "hn:",
  "sharia-procedure-1965": "sp:",
};
/** Names of laws that are NOT in the app (yet). Asked by name, they get an honest "not in my texts". */
const NOT_IN_APP = ["العقوبات", "القانون الاساسي"];

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
  // she named a law the app does not have («المادة 66 من قانون الأحوال الشخصية»): never answer from another law
  if (!hinted.length && NOT_IN_APP.some((w) => t.includes(norm(w))))
    return { number, found: [], missing: true, ambiguous: false, outOfRegion: [] };
  const laws = hinted.length ? LAWS.filter((l) => hinted.includes(l.key)) : LAWS;
  const all = laws.map((l) => ARTICLES[`${PREFIX[l.key]}${number}`]).filter(Boolean);
  // articles added in the dashboard: by their law's name when she names a law, else every one with this number
  const added = Object.values(ARTICLES).filter((a) => a.added && a.number === number);
  const named = added.filter((a) => t.includes(norm(a.lawName)));
  all.push(...(named.length ? named : hinted.length ? [] : added));
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
  // (2026-11-19) a legal-accuracy run on the live model found these questions answered without their article:
  // with ~1,300 articles the word match picked unrelated ones («ابني عمره 7» -> the cyber-crimes minors article)
  {
    label: "سن الزواج",
    all: [/(?:^| )(?:عمر|سن|عمرها|عمره)(?= |$)/, /(?:تتزوج|يتزوج|زواج|الزواج|جواز|تجوز|اجوز|نجوز)/],
    ids: ["gz:5", "gz:6", "gz:9"],
  },
  {
    label: "تنفيذ حكم النفقة أو المهر وحبس الممتنع",
    all: [
      /(?:احبسه|حبس|ينحبس|تنفيذ|انفذ|بنفذ|حكمت|حكم المحكمه|الحكم)/,
      /(?:نفقه|بيدفع|يدفع|مهر|مصروف|مصاري)/,
    ],
    ids: ["ex:14", "ex:5", "ex:7"],
  },
  {
    label: "السفر بالأولاد",
    all: [/(?:سافر|اسافر|بسافر|سفر|يسافر)/, /(?:ولاد|اولاد|الولد|ابني|بنتي|الصغير|الصغار)/],
    ids: ["hn:393", "hn:392", "hn:394"],
  },
  {
    label: "انتهاء الحضانة وأخذ الأب للولد",
    all: [/(?:ياخد|ياخده|ياخدها|ياخدهم|ياخذ|ياخذه|يوخد)/, /(?:عمر|سنين|سنه|سنتين|كبر)/],
    ids: ["hn:391", "gz:118", "hn:380"],
  },
  {
    label: "التفريق لغياب الزوج",
    all: [
      /(?:غايب|مسافر|سافر|غاب|غيابه|مختفي|ما بعرف وينه|ما حدا بيعرف وينه)/,
      /(?:اطلق|طلاق|تطلق|اتطلق|انفصل|افسخ|التفريق|سنه|سنتين|سنين|شهور|تركني|ما بيبعت|ما بيصرف|ما بيسال)/,
    ],
    ids: ["gz:94", "gz:95", "gz:64"],
  },
  {
    label: "الاستئناف",
    all: [/(?:استئناف|استانف|استئنف|اعترض علي الحكم|اطعن)/],
    ids: ["sp:183", "sp:184", "ex:9"],
  },
  {
    label: "المحكمة المختصة بالمكان",
    all: [
      /(?:^| )(?:وين|اي|انهي)(?= |$)/,
      /(?:دعوي|الدعوي|ارفع|برفع|بقدم|اقدم) /,
      /(?:محكمه|دعوي|بلدي|بلده)/,
    ],
    ids: ["sp:7"],
  },
  {
    label: "الاعتداد ببيت الزوجية",
    all: [/عده|عدتي|اعتد/, /بيت|البيت|اضل|بضل|مسكن|اطلع/],
    ids: ["hn:322"],
  },
  {
    label: "نفقة العدة",
    all: [/عده|عدتي|اعتد/, /نفقه|مصروف|مصاري|بيصرف|يصرف|بيدفع/],
    ids: ["gz:112", "gz:113", "gz:115"],
  },
  {
    label: "مدة العدة",
    all: [/(?:^| )(?:و|ب|بال|ال|لل)?(?:عده|عدتي)(?= |$)|اعتد/],
    ids: ["gz:103", "gz:104", "gz:105", "gz:107", "gz:108"],
  },
  {
    label: "المهر",
    all: [/(?:^| )(?:و|ب|بال|ال|لل)?(?:مهر|مهري|مؤخر|مقدم)(?= |$)/],
    ids: ["gz:46", "gz:47", "gz:48", "gz:49", "gz:55"],
  },
  {
    label: "الخلع",
    all: [/(?:^| )(?:و|ب|بال|ال|لل)?(?:خلع|مخالعه|اخلعه)(?= |$)/],
    ids: ["hn:273", "hn:278", "hn:277"],
  },
  {
    label: "رؤية الولاد",
    all: [/(?:اشوف|بشوف|رؤيه|مشاهده|زياره|يشوف)/, /(?:الولاد|ولادي|الصغير|البنات|ابني|بنتي)/],
    ids: ["ex:17"],
  },
  {
    label: "شروط الحاضنة",
    all: [/(?:شروط|تسقط|بتسقط|بسقط|سقوط) (?:ال)?(?:حضانه|حضانتي|الحاضنه)/],
    ids: ["hn:382", "hn:383"],
  },
  {
    label: "سن الحضانة",
    all: [/(?:حضانه|حضانتي|الحاضنه)/, /(?:سن|عمر|لعمر|قديش|لحد|متى|ايمتى)/],
    ids: ["gz:118", "hn:391"],
  },
  { label: "التعويض عن الطلاق", all: [/(?:تعويض|تعسفي)/], ids: [] },
  {
    label: "التفريق للشقاق",
    all: [/(?:شقاق|نزاع|تفريق للضرر|بدي افسخ)/],
    ids: ["gz:97", "gz:98", "gz:100"],
  },
  {
    label: "المسكن المستقل",
    all: [
      /(?:مسكن|بيت|اسكن|ساكنه|ساكنين|عايشه|عايشين)/,
      /(?:لحالي|مستقل|حماتي|اهله|اهل جوزي|سلفي|معنا)/,
      /(?:حقي|بيحقلي|القانون|مسموح|بقدر اطلب)/,
    ],
    ids: ["gz:39", "gz:41"],
  },
  {
    label: "نفقة الولاد",
    all: [/(?:نفقه|مصروف)(?: (?:لكل|ل|كل|عن|على))? (?:ال)?(?:ولد|ولاد|اولاد|ولادي|الصغير|طفل|ابن|بنت)/],
    ids: ["hn:395", "hn:396", "hn:388"],
  },
  {
    label: "نفقة الزوجة",
    all: [/(?:ما بيصرف|ما بصرف|ما بيدفع|ما بدفع|مش عم يصرف|مش عم يدفع|ما عم يصرف|ممتنع عن)/],
    ids: ["gz:59", "gz:61", "gz:57"],
  },
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
  return {
    label: hit.label,
    found: all.filter((a) => a.regions.includes(region)),
    outOfRegion: all.filter((a) => !a.regions.includes(region)),
  };
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
  // the law's own name counts too: «قانون حقوق العائلة لسنة 1954» is not an invented number (live test, 2026-11-19)
  const sourceText = toLatin(
    norm(sources.map((a) => `${a.text} ${a.amended || ""} ${a.lawName || ""}`).join(" ")),
  );
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
  const citedNumbers = new Set(answer.cites.map((id) => articleNumber(id)));

  const named = [...toLatin(norm(prose)).matchAll(/(?:^| )(?:ال)?ماده(?: رقم)? ([0-9]{1,3})/g)].map(
    (x) => x[1],
  );
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
/**
 * (2026-11-19, live test) law stated without citing it: «حسب قانون حقوق العائلة…», «القانون بيلزم الأب»,
 * «القاضي بيقدر…», «مخالف للقانون», «الزوج ملزم». Rejected when nothing is cited, so the reply is rewritten
 * either without law or with the article (and its text shown under the reply).
 */
const LAW_STATED = new RegExp(
  [
    "(?:^| )و?(?:حسب|بحسب|بموجب) (?:ال)?قانون",
    "(?:^| )و?قانون (?:حقوق|الاحوال|الجرائم|التنفيذ|اصول|العقوبات)",
    "(?:^| )و?(?:ال)?قانون (?:بي|ب|في غزه )[^ ]+",
    "(?:^| )و?(?:ال)?قاضي (?:بي|ب)[^ ]+",
    "(?:^| )و?(?:مخالف|مخالفه) (?:لل|ل)?قانون",
    "(?:^| )و?(?:ملزم|ملزمه|بيلزم|بتلزم|يلزم)(?= |$)",
  ].join("|"),
);

/** True when a support / listening reply contains legal claims (it must not). */
export const legalLeak = (text) => LEGAL_CLAIM.test(norm(text)) || LAW_STATED.test(norm(text));

/**
 * Laws of the OTHER region, by the words that name them (2026-11-18). Gaza and the West Bank apply different
 * laws, and a lawyer found answers that mixed them. A reply for a Gaza user that names a West Bank law (or
 * the reverse) is rejected, whatever it cites. Years are matched as whole numbers, Arabic or Latin digits.
 */
const REGION_LAW_MARKS = {
  // named in a reply to a GAZA user -> wrong region
  "ps-gaza": [/(?:^|[^0-9])(?:1976|1960|1959)(?:[^0-9]|$)/, /الاردني/],
  // named in a reply to a WEST BANK user -> wrong region
  "ps-wb": [/(?:^|[^0-9])(?:1954|1936|1965)(?:[^0-9]|$)/, /حقوق العائله/, /قطاع غزه|في غزه/],
};

/**
 * The first mark of another region's law found in `text`, or "".
 * @param {string} text
 * @param {string} region
 */
export function otherRegionLaw(text, region) {
  const marks = REGION_LAW_MARKS[region];
  if (!marks) return "";
  const t = toLatin(norm(text));
  const hit = marks.map((re) => re.exec(t)).find(Boolean);
  return hit ? hit[0].trim() : "";
}

/**
 * Lines shown under every AI reply that cites a law (owner's rule, 2026-11-19): which court applies the cited
 * texts in Gaza, the caveats the lawyer has not settled yet, and ALWAYS the lawyer, before any step and after.
 * Built from the cited ids, never by the model, so they are there even when the model forgets them.
 * @param {string[]} ids
 * @returns {string[]}
 */
export function lawScope(ids) {
  const laws = [...new Set(ids.map((id) => ARTICLES[id]?.lawKey))]
    .map((k) => LAWS.find((l) => l.key === k))
    .filter(Boolean);
  if (!laws.length) return [];
  const lines = [];
  const courts = [...new Set(laws.map((l) => COURT_NAMES[l.court]).filter(Boolean))];
  if (courts.length) lines.push(`هالنصوص بتطبقها ${courts.join(" و")} بقطاع غزة.`);
  if (laws.some((l) => l.key === "cyber-2018"))
    lines.push("انتبهي: تطبيق قانون الجرائم الإلكترونية بغزة مش مؤكد، فاسألي محامية قبل ما تعتمدي عليه.");
  if (laws.some((l) => l.key === "family-gaza-1954") && laws.some((l) => l.key === "hanafi-personal-status"))
    lines.push("إذا اختلف النصين، المحامية بتقدر تحكيلك أي واحد بتطبقه المحكمة.");
  lines.push("قبل ما تعملي أي خطوة، وبعدها كمان، استشيري محامية (تبويب «محامية»).");
  return lines;
}

/** Law registry metadata for the UI and the review list. */
export function lawMeta(articleId) {
  const a = ARTICLES[articleId];
  if (!a) return null;
  const law = LAWS.find((l) => l.key === a.lawKey);
  // added in the dashboard: entered and approved by the team (a lawyer or a developer) before it reached the app
  if (a.added)
    return {
      lawName: a.lawName,
      regions: a.regions,
      source: a.url,
      review: { status: "reviewed", by: "فريق فزعة", at: "" },
      amended: a.amended || "",
    };
  return {
    lawName: a.lawName,
    regions: a.regions,
    source: law?.source || "",
    review: law?.review || { status: "pending", by: "", at: "" },
    amended: a.amended || "",
  };
}

export { NUMBER_WORDS };
