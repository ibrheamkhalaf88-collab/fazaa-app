import { activeCorpora, CORPORA } from "./corpora.js";
import { LAWS as GAZA_GENERAL } from "./gaza/general/index.js";
import { LAWS as GAZA_NIZAMI } from "./gaza/nizami/index.js";
import { LAWS as GAZA_SHARIA } from "./gaza/sharia/index.js";
import { LAWS as WB_NIZAMI } from "./wb/nizami/index.js";
import { LAWS as WB_SHARIA } from "./wb/sharia/index.js";

/** @typedef {import("./types.js").Region} Region */
/** @typedef {import("./types.js").Court} Court */

/** Region codes used everywhere (state.country, proxy body, law registry). */
export const REGIONS = /** @type {const} */ (["ps-wb", "ps-gaza"]);

/** Arabic names, for the prompt and for replies. */
export const REGION_NAMES = { "ps-gaza": "قطاع غزة", "ps-wb": "الضفة الغربية" };
export const COURT_NAMES = { sharia: "المحاكم الشرعية", nizami: "المحاكم النظامية", general: "" };

/**
 * One law as written in a box's index.js. Region and court are NOT here: they come from the box.
 *
 * @typedef {{
 *   key: string,              unique across all boxes
 *   name: string,             the law's full Arabic name, shown to users
 *   prefix: string,           every article id starts with it ("gz:"); unique across all boxes
 *   articles: import("./types.js").Article[],
 *   hints: string[],          normalised words that name the law in a question («حقوق العائله»)
 *   marks: string[],          words or years that name THIS law and no law of the other region: a reply to a
 *                             user of the other region that contains one is rejected (src/ai/legal.js)
 *   caveat?: string,          a line shown under every reply that cites this law (e.g. «تطبيقه بغزة مش مؤكد»)
 *   conflicts?: {with: string, note: string}[],  a line shown when this law and `with` are cited together
 *   source: string, scope: string[], review: {status: string, by: string, at: string},
 * }} LawEntry
 *
 * @typedef {LawEntry & {corpus: string, regions: Region[], court: Court}} Law
 */

/** Each box's laws, by box key. A new box needs a line here and in corpora.js. */
const BOXES = {
  "gaza-sharia": GAZA_SHARIA,
  "gaza-nizami": GAZA_NIZAMI,
  "gaza-general": GAZA_GENERAL,
  "wb-sharia": WB_SHARIA,
  "wb-nizami": WB_NIZAMI,
};

/**
 * LAW REGISTRY: the single list of laws the app may cite, built from the boxes in corpora.js.
 *
 * GAZA FIRST (2026-11-18): the old corpus (mostly West Bank law and Ramallah decree-laws) was removed after a
 * lawyer found errors in it. The corpus is rebuilt ONLY from the files the owner's lawyer gave, Gaza first.
 * The West Bank boxes are ready and empty (2026-11-21); until they are filled and reviewed, a West Bank question
 * gets no law text and is told so honestly.
 *
 * SEPARATION (owner, 2026-11-21): Gaza and the West Bank apply DIFFERENT laws (penal code 1936 vs 1960, family
 * rights 1954 vs personal status 1976, sharia procedure 1965 vs 1959), and the sharia and nizami courts apply
 * different laws. Each law sits in exactly ONE box (region + court), and the box stamps `regions` and `court`
 * on it, so a law cannot claim to be somewhere else. Retrieval only ever sees the boxes of the user's region
 * (articlesFor), keeps the courts apart (src/ai/retrieve.js), every article reaches the model tagged with its
 * court, and a reply naming a law of the other region is rejected (src/ai/legal.js otherRegionLaw).
 * tests/law-separation.test.js guards all of this.
 *
 * Always store the LATEST text in force: when a later law amends an article, store the amended wording and
 * name the amending law in `amended`. An article that was repealed is removed.
 *
 * To add a law: docs/LAW-INTAKE.md.
 *
 * `review.status` is "pending" until a LAWYER has checked the text against the official gazette, its
 * current force (amendments, repeals) and its application in its region. Nothing here may say "reviewed"
 * before that happens.
 *
 * Only boxes with status "active" are registered: an "awaiting-texts" box that already holds files stays out
 * of the app until its status is changed on purpose.
 *
 * @type {Law[]}
 */
export const LAWS = CORPORA.filter((c) => c.status === "active").flatMap((c) =>
  (BOXES[c.key] || []).map((law) => ({ ...law, corpus: c.key, regions: [c.region], court: c.court })),
);

/** Every law of every box, active or not, for the separation tests and the review list. */
export const ALL_BOX_LAWS = CORPORA.flatMap((c) =>
  (BOXES[c.key] || []).map((law) => ({ ...law, corpus: c.key, regions: [c.region], court: c.court })),
);

/** True when the app has law texts for this region. @param {string} region */
export const hasLawTexts = (region) => LAWS.some((l) => l.regions.includes(region));

export { activeCorpora, CORPORA };

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
  // penal code 1936
  الاعتداء: "بيضربني بضربني ضربني ضرب يضرب لطمني كف عنف اعتدى",
  "الإيذاء بالاعتداء": "ضربني ضرب جرح كدمات اذى عنف",
  "الإيذاء البليغ": "ضرب كسر جرح اذى بليغ عنف",
  "التهديد باستعمال العنف": "تهديد هددني بيهددني يهددني",
  "التهديد بالقتل": "يقتلني بيقتلني رح يقتلني هددني بالقتل تهديد",
  "التدخل بغير حق": "بيلحقني يلاحقني بيراقبني بيخوفني يجبرني غصب",
  "الجرائم الجنسية": "اغتصاب اغتصبني غصبا عني",
  "الأفعال المنافية للحياء بالقوة": "تحرش تحرشني تحرش بي لمسني",
  // criminal procedure 3/2001 (topics are its chapter titles)
  "من له حق إقامة الدعوى الجزائية": "شكوى اشتكي اقدم شكوى بلاغ نيابه",
  // not «اتنازل»: a woman giving up her dower («اتنازل عن مهري») is a sharia question
  "انقضاء الدعوى الجزائية": "اسحب سحب الشكوى اسقط",
  "مأمورو الضبطية القضائية وواجباتهم": "شرطه الشرطه بوليس بلاغ",
  "في القبض على المتهم": "قبض قبضوا يقبضوا اعتقال اعتقلوا مسكوه يمسكوه",
  "التوقيف والحبس الاحتياطي": "توقيف موقوف محبوس حبس",
  "الإفراج بالكفالة": "كفاله يطلع يطلعوه افراج",
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
        corpus: law.corpus,
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
export const INTENT_COURTS = {
  // which court a detected topic belongs to, so retrieval does not mix the sharia and the nizami texts
  // (owner, 2026-11-21). Violence and threats are both: a crime for the nizami courts, and a ground for
  // divorce for harm at the sharia courts, so they keep both and the reply keeps the two parts apart.
  blackmail: ["nizami"],
  porn: ["nizami"],
  privacy: ["nizami"],
  minor: ["nizami"],
  violence: ["nizami", "sharia"],
  threat: ["nizami", "sharia"],
  nafaqa: ["sharia"],
  divorce: ["sharia"],
  custody: ["sharia"],
  inherit: ["sharia"],
};

export const INTENT_TO_ARTICLES = {
  blackmail: ["cy:15", "cy:3"],
  porn: ["cy:16"],
  privacy: ["cy:22"],
  minor: ["cy:72", "cy:16"],
  // penal code 1936: assault, injury, coercion by violence, sexual violence; threats
  violence: ["pc:248", "pc:249", "pc:250", "pc:238", "pc:211", "pc:152", "pc:157"],
  threat: ["pc:100", "pc:224", "pc:211"],
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
