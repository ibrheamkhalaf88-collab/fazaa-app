import { CYBER_CRIMES, CYBER_NAME } from "./cyber-crimes-2018.js";
import { FAMILY_GAZA_1954, FAMILY_GAZA_NAME } from "./family-rights-gaza-1954.js";
import { HANAFI_NAME, HANAFI_PERSONAL_STATUS } from "./hanafi-personal-status.js";
import { MAJALLA_CLAIMS, MAJALLA_NAME } from "./majalla-claims.js";
import { EXECUTION_NAME, SHARIA_EXECUTION_2021 } from "./sharia-execution-2021.js";
import { SHARIA_PROCEDURE_1965, SHARIA_PROCEDURE_NAME } from "./sharia-procedure-1965.js";

/** @typedef {import("./types.js").Region} Region */
/** @typedef {import("./types.js").Court} Court */

/** Region codes used everywhere (state.country, proxy body, law registry). */
export const REGIONS = /** @type {const} */ (["ps-wb", "ps-gaza"]);

/** Arabic names, for the prompt and for replies. */
export const REGION_NAMES = { "ps-gaza": "قطاع غزة", "ps-wb": "الضفة الغربية" };
export const COURT_NAMES = { sharia: "المحاكم الشرعية", nizami: "المحاكم النظامية", general: "" };

/**
 * LAW REGISTRY: the single list of laws the app may cite.
 *
 * GAZA FIRST (2026-11-18): the old corpus (mostly West Bank law and Ramallah decree-laws) was removed after a
 * lawyer found errors in it. The corpus is rebuilt ONLY from the files the owner's lawyer gave, Gaza first.
 * West Bank law comes later, after the owner meets the lawyer again; until then a West Bank question gets no
 * law text and is told so honestly.
 *
 * Gaza and the West Bank apply DIFFERENT laws (penal code 1936 vs 1960, family rights 1954 vs personal status
 * 1976, sharia procedure 1965 vs 1959). So every law names exactly where it applies (`regions`) and which
 * courts apply it (`court`). Retrieval only ever sees the laws of the user's region (articlesFor), and the
 * AI reply is rejected if it names a law of the other region (src/ai/legal.js otherRegionLaw).
 *
 * Always store the LATEST text in force: when a later law amends an article, store the amended wording and
 * name the amending law in `amended`. An article that was repealed is removed.
 *
 * To add a law: create src/data/law/<name>.js (shape: ./types.js Article), import it below, add one entry,
 * and add its names to OTHER_REGION_NAMES in src/ai/legal.js if it is region-specific. Ids must be unique
 * across ALL laws, so prefix them (e.g. "gzp:12").
 *
 * `review.status` is "pending" until a LAWYER has checked the text against the official gazette, its
 * current force (amendments, repeals) and its application in each region. Nothing here may say "reviewed"
 * before that happens.
 *
 * @type {{key:string, name:string, regions:Region[], court:Court, articles:import("./types.js").Article[],
 *         source:string, scope:string[], review:{status:string, by:string, at:string}}[]}
 */
export const LAWS = [
  {
    key: "family-gaza-1954",
    name: FAMILY_GAZA_NAME,
    regions: ["ps-gaza"],
    court: "sharia",
    articles: FAMILY_GAZA_1954,
    source: "PDF from the owner's lawyer, 2026-11-18 («قانون-حقوق-العائلة-معدل.pdf»)",
    scope: [
      "Applied by the sharia courts in the Gaza Strip.",
      "The PDF is titled «معدل» (amended) but has no amendment notes: a lawyer must confirm it is the current text.",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "hanafi-personal-status",
    name: HANAFI_NAME,
    regions: ["ps-gaza"],
    court: "sharia",
    articles: HANAFI_PERSONAL_STATUS,
    source: "PDF from the owner's lawyer, 2026-11-18; transcribed from the page images (see the file header)",
    scope: [
      "The detailed personal-status rules (Hanafi school) applied by the sharia courts in Gaza.",
      "Where it and the 1954 family-rights law differ, which one the court applies is a question for the lawyer.",
      "Transcribed from images and checked three ways; the lawyer is reviewing it through the app (2026-11-19).",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "sharia-procedure-1965",
    name: SHARIA_PROCEDURE_NAME,
    regions: ["ps-gaza"],
    court: "sharia",
    articles: SHARIA_PROCEDURE_1965,
    source: "PDF from the owner's lawyer, 2026-11-18; transcribed from the page images (see the file header)",
    scope: [
      "How a case is brought and decided in the sharia courts of Gaza (procedure, evidence, appeal).",
      "Transcribed from images and checked three ways; the lawyer is reviewing it through the app (2026-11-19).",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "sharia-execution-2021",
    name: EXECUTION_NAME,
    regions: ["ps-gaza"],
    court: "sharia",
    articles: SHARIA_EXECUTION_2021,
    source:
      "PDF from the owner's lawyer, 2026-11-18 (Palestinian Gazette no. 102); text transcribed from the page images",
    scope: [
      "Passed by the Legislative Council and issued in Gaza City (14/10/2021): applied by the sharia courts in Gaza.",
      "How a sharia judgment (maintenance, mahr, custody, visits) is enforced when the other side does not comply.",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    key: "cyber-2018",
    name: CYBER_NAME,
    regions: ["ps-gaza"],
    court: "nizami",
    articles: CYBER_CRIMES,
    source: "PDFs from the owner's lawyer, 2026-11-18 (decree-law 10/2018 and decree-law 38/2021)",
    scope: [
      "Decree-law issued in Ramallah: whether the courts in Gaza apply it is NOT confirmed (question for the lawyer).",
      "Stored as amended by decree-law 38/2021 (new articles 31-50, renumbering of 31-57).",
      "Article 15 is the 2018 wording from the lawyer's file; a later amendment (decree-law 28/2020) is not in the lawyer's files.",
    ],
    review: { status: "pending", by: "", at: "" },
  },
  {
    // general rules on claims and evidence: not tied to one court, so no court is named in replies
    key: "majalla-claims",
    name: MAJALLA_NAME,
    regions: ["ps-gaza"],
    court: "general",
    articles: MAJALLA_CLAIMS,
    source: "maqam.najah.edu/legislation/158, checked against the lawyer's PDF (2026-11-18)",
    scope: [
      "Book 14 (claims, articles 1616-1770) only: the lawyer's file holds this book.",
      "maqam lists the Majalla as in force in the West Bank and Gaza; kept Gaza-only until the West Bank texts are reviewed.",
    ],
    review: { status: "pending", by: "", at: "" },
  },
];

/**
 * Everyday words people use for a topic («غايب», «بيضربني»), so retrieval finds the formal text. They only
 * help retrieval; they are never shown or cited as law.
 */
const TOPIC_KEYWORDS = {
  المهر: "مهر مهري مقدم مؤخر",
  "نفقة الزوجة": "نفقه مصروف بيصرف بصرف مصاري ما بدفع",
  "الطلاق: أحكام عامة": "طلاق طلقني اطلق اتطلق",
  "التفريق لعدم الإنفاق": "ما بيصرف ما بصرف نفقه اتطلق",
  "التفريق للغياب أو السجن": "غايب غاب مسافر سافر مختفي محبوس مسجون سجن",
  "التفريق للضرر والشقاق والحكمين": "بيضربني بضربني ضرب اهانه بهينني مشاكل شقاق اتطلق",
  العدة: "عده عدتي",
  "نفقة العدة": "نفقه العده مصروف",
  الحضانة: "حضانه الولاد ولادي اولادي الاحق",
  المفقود: "مفقود مختفي",
  "حقوق الزوجين وأحكام الزواج": "بيت مسكن اهله حماتي",
  // sharia enforcement law 6/2021
  "تنفيذ النفقة والحضانة فوراً وضم الصغار": "تنفيذ حكم النفقه ما دفع ما بيدفع ياخد الولاد",
  "حبس المدين في المهر والنفقة": "حبس احبسه يحبسوه ينحبس ما دفع المهر النفقه مؤخر",
  "الحجز على الراتب وأولوية النفقة": "راتب معاش يحجزوا حجز",
  "الحبس عند منع رؤية الأطفال أو عدم تسليمهم": "يشوف اشوف ولادي الولاد رؤيه مشاهده استضافه ما بيخليني",
  "منع السفر": "يسافر سفر يهرب",
  "ترتيب الديون: النفقة أولاً": "ديون",
  // cyber-crimes decree-law
  "التهديد والابتزاز الإلكتروني": "ابتزاز يبتزني بيبتزني بيهددني يهددني تهديد صوري",
  "إرسال محتوى إباحي دون رضا والقاصرون": "اباحيه اباحي صور فاضحه",
  "انتهاك الخصوصية ونشر الصور الخاصة": "نشر نشروا صوري فيديو خصوصيه فضحني",
  "الدخول غير المشروع إلى المواقع والأنظمة": "اختراق اخترق هكر حسابي",
  "الاحتيال الإلكتروني": "احتيال نصب",
  "تشديد العقوبة (ومنها استغلال القاصرين)": "قاصر بنتي ابني طفل",
  "الجهة المختصة: المحاكم النظامية والنيابة": "وين اشتكي شكوى نيابه شرطه",
};

/** Everyday words for whole groups of chapters, matched on the chapter title (personal status, procedure). */
const TOPIC_RULES = [
  [/حضان/, "حضانه حضانتي الولاد ولادي اولادي الاحق ياخد الولاد"],
  [/نفق|الكسوة/, "نفقه مصروف بيصرف بصرف ما بدفع مصاري"],
  [/السكنى|المسكن/, "بيت مسكن سكن لحالي اهله حماتي"],
  [/مهر|الجهاز/, "مهر مهري مقدم مؤخر جهاز عفش"],
  [/الخلع/, "خلع اخلعه افتدي اتنازل عن مهري"],
  [/طلاق|الفرقة|التفريق/, "طلاق طلقني اطلق اتطلق"],
  [/عدة|العدة|عدت|اعتد/, "عده عدتي"],
  [/نسب|ولد المطلقة/, "نسب ابوه يعترف بالولد"],
  [/رضاع/, "رضاعه ارضع"],
  [/ميراث|المواريث|إرث|الارث|التركة|الفروض|العصب|الحجب|ذوي الأرحام/, "ورثه ميراث حصتي ارث تركه مات"],
  [/وصي|وصاي|الوصايا/, "وصيه وصي"],
  [/ولي|الولاية/, "ولي ولايه"],
  [/الاستئناف|استئناف/, "استئناف استانف اعترض على الحكم"],
  [/التبليغ|الإعلان/, "تبليغ بلغوني"],
  [/الشهود|الشهادة|البينة/, "شهود شاهد"],
];
/**
 * A chapter titled «العدة ونفقة المعتدة» matches two rules; an article in it gets a rule's words only when its own
 * text is about that too, so an article on the waiting period alone is not ranked for «النفقة» (found 2026-11-19).
 */
const ruleKeywords = (topic, text) => {
  const rules = TOPIC_RULES.filter(([re]) => re.test(topic || ""));
  const own = rules.length > 1 ? rules.filter(([re]) => re.test(text || "")) : rules;
  return own.map(([, words]) => words).join(" ");
};

/** Every article, tagged with its law and regions. Used for rendering a cited id. */
export const ARTICLES = Object.fromEntries(
  LAWS.flatMap((law) =>
    law.articles.map((a) => [
      a.id,
      {
        ...a,
        keywords: a.keywords || TOPIC_KEYWORDS[a.topic] || ruleKeywords(a.topic, a.text),
        lawKey: law.key,
        lawName: law.name,
        regions: law.regions,
        court: law.court,
      },
    ]),
  ),
);

export const ARTICLE_IDS = Object.keys(ARTICLES);

/** The article number people say («المادة 15»), for built-in ids («psl:66») and added ones («x12:66»). */
export const articleNumber = (id) => ARTICLES[id]?.number || String(id).replace(/^[a-z]+\d*:/, "");

/* ---------- articles added by lawyers in the dashboard (2026-11-17) ---------- */

/** Ids of the added articles currently in ARTICLES, so the next update replaces them all at once. */
const ADDED = new Set();
export const ADDED_REGIONS = { "ps-wb": ["ps-wb"], "ps-gaza": ["ps-gaza"], both: ["ps-wb", "ps-gaza"] };

/**
 * Put the APPROVED articles from the dashboard into ARTICLES, next to the built-in laws, so retrieval, the AI
 * prompt, the grounding check and the citation card all use them like any other text. Called by the server
 * (from the database) and by the app (from /api/v1/laws, cached for offline). A built-in id is never replaced.
 * @param {{id:number|string, lawName:string, number:string, region:string, topic:string, text:string,
 *          amended?:string, url:string, keywords?:string}[]} list
 */
export function useAddedArticles(list) {
  for (const id of ADDED) delete ARTICLES[id];
  ADDED.clear();
  for (const a of Array.isArray(list) ? list : []) {
    const id = `x${a.id}:${a.number}`;
    const regions = ADDED_REGIONS[a.region];
    if (!regions || ARTICLES[id] || !a.text || !a.lawName || !/^\d{1,4}$/.test(String(a.number))) continue;
    ARTICLES[id] = {
      id,
      number: String(a.number),
      topic: String(a.topic || ""),
      // the keywords only help retrieval find it; they are not shown as law
      keywords: String(a.keywords || ""),
      url: String(a.url || ""),
      amended: String(a.amended || ""),
      text: String(a.text),
      lawKey: `added:${a.lawName}`,
      lawName: String(a.lawName),
      regions,
      added: true,
    };
    ADDED.add(id);
  }
}

/**
 * Only the articles that apply in `region`. Retrieval and citation validation must use
 * this, never ARTICLES, so a Gaza user is never shown (or quoted) a West-Bank-only law.
 * @param {string} region
 */
export function articlesFor(region) {
  return Object.fromEntries(Object.entries(ARTICLES).filter(([, a]) => a.regions.includes(region)));
}

/**
 * Which articles are relevant to which detected intent. Ids missing for the user's
 * region are skipped by retrieval. Whether the Gaza courts apply the cyber-crimes law is still a question for
 * the lawyer (the 2018 decree-law was issued in Ramallah); answers carry that caveat.
 */
export const INTENT_TO_ARTICLES = {
  blackmail: ["cy:15", "cy:3"],
  porn: ["cy:16"],
  privacy: ["cy:22"],
  minor: ["cy:72", "cy:16"],
  nafaqa: [
    "gz:59",
    "gz:38",
    "gz:57",
    "gz:61",
    "gz:62",
    "gz:92",
    "gz:65",
    "gz:66",
    "gz:112",
    "ex:7",
    "ex:14",
    "ex:15",
    "hn:395",
  ],
  divorce: [
    "gz:97",
    "gz:92",
    "gz:94",
    "gz:96",
    "gz:77",
    "gz:72",
    "gz:76",
    "gz:78",
    "gz:103",
    "gz:112",
    "gz:49",
    "gz:48",
  ],
  custody: ["gz:118", "hn:380", "hn:382", "hn:383", "hn:391", "hn:392", "ex:17", "ex:7"],
  inherit: ["hn:583", "hn:584"],
};
