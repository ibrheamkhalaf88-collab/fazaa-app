/**
 * The rule-based answers (the offline engine). Pure data + small predicates, no DOM.
 *
 * RULES is ordered by priority: the first rule whose `when(hits)` is true wins.
 * `hits` comes from detectIntents(). Order matters: a minor being blackmailed must
 * match before plain blackmail; violence must match before the family-law topics.
 *
 * Content rules (agreed with the project owner):
 *  - never invent a penalty or article number; cite only ids from src/data/law;
 *  - family-law answers are GENERAL (the personal-status law is not in the app yet),
 *    so they carry `general: true` and a lawyer hand-off;
 *  - tone: warm, short, Palestinian dialect, addressed to a woman.
 */

// Offline, the app does not interpret family law: the texts it has are partial and still pending a
// lawyer's review, and the answer depends on facts (region, religion, contract, dates) it does not know.
const GENERAL_NOTE =
  "هاد مش جواب قانوني. القواعد بتختلف بين الضفة وغزة وحسب تفاصيل وضعك، فمحامية بتقدر تقلك شو بينطبق عليكِ بالزبط.";

/** True when the question is a cyber-abuse case (blackmail, leaked images, unwanted porn). */
const isCyberAbuse = (h) => h.blackmail || h.privacy || h.porn;

/**
 * @typedef {Object} Rule
 * @property {string} id
 * @property {(hits: Record<string, number>) => boolean} when
 * @property {(hits: Record<string, number>) => Omit<import("../ai/types.js").Answer, "source">} answer
 */

/** @type {Rule[]} */
export const RULES = [
  {
    id: "minor-cyber-abuse",
    when: (h) => h.minor && isCyberAbuse(h),
    answer: (h) => ({
      lead: "خوفك مفهوم، والقانون بيتعامل مع هالحالة بشدة أكبر لأنها قاصر.",
      steps: [
        "طمّنيها إنها مش غلطانة، وخليها ما ترد على الشخص ولا تبعتله شي",
        "احتفظوا بكل الرسائل وصوّروا الشاشة واسم الحساب",
        "بلّغوا عن الحساب بالمنصة، وتواصلوا مع جهة رسمية بأسرع وقت",
      ],
      note: "المادة ٧٢ (كانت ٥٢) بتضاعف العقوبة إذا الجريمة فيها استغلال لحدا عمره أقل من ١٨ سنة.",
      cites: ["72", h.blackmail ? "15" : h.porn ? "16" : "22"],
    }),
  },
  {
    id: "domestic-violence",
    when: (h) => h.violence && !h.privacy && !h.porn,
    answer: () => ({
      lead: "ما حدا إله حق يأذيكِ، وإنتِ مش غلطانة.",
      steps: [
        "إذا بتحسي إنك بخطر هلأ، فكري بخطوة آمنة بتقدري تعمليها بدون ما تعرّضي حالك لخطر أكبر",
        "إذا آمن إلك، احتفظي بأي تقرير طبي أو رسالة بمكان ما حدا بيوصله",
        "محامية بتقدر تحكيلك شو خيارات الحماية بمنطقتك",
      ],
      note: GENERAL_NOTE,
      cites: [],
      general: true,
      topic: "عنف أسري",
      sos: true,
    }),
  },
  {
    id: "child-support",
    when: (h) => h.nafaqa && !h.privacy && !h.porn,
    answer: () => ({
      lead: "موضوع النفقة بيضغط كتير، خصوصاً لما في ولاد.",
      steps: [
        "إذا بتقدري، خلي الأوراق المهمة بمكان آمن: عقد الزواج وشهادات ميلاد الولاد",
        "اكتبي من إيمتى وقف الصرف وقديش كان بيعطي",
        "محامية بتقدر تشرحلك الإجراءات والجهة المختصة بمنطقتك",
      ],
      note: GENERAL_NOTE,
      cites: [],
      general: true,
      topic: "نفقة",
    }),
  },
  {
    id: "custody",
    when: (h) => h.custody && !h.privacy && !h.porn,
    answer: () => ({
      lead: "الخوف على الولاد من أصعب الإشيات.",
      steps: [
        "لا توقّعي على أي تنازل أو اتفاق عن الولاد قبل ما تستشيري محامية",
        "إذا آمن إلك، احتفظي بأي رسالة فيها تهديد",
        "محامية بتقدر تحكيلك شو القواعد بمنطقتك ووضعك بالزبط",
      ],
      note: GENERAL_NOTE,
      cites: [],
      general: true,
      topic: "حضانة",
    }),
  },
  {
    id: "divorce",
    when: (h) => h.divorce && !h.privacy && !h.porn,
    answer: () => ({
      lead: "قرار أو موضوع الطلاق تقيل، ومش لازم تحسميه لحالك.",
      steps: [
        "إذا بتقدري، احتفظي بعقد الزواج وأي ورقة طلاق بمكان آمن",
        "اكتبي الأسئلة اللي ببالك عن الولاد والمصاري",
        "محامية بتقدر تشرحلك خياراتك وحقوقك حسب منطقتك",
      ],
      note: GENERAL_NOTE,
      cites: [],
      general: true,
      topic: "طلاق",
    }),
  },
  {
    id: "inheritance",
    when: (h) => h.inherit && !h.privacy && !h.porn,
    answer: () => ({
      lead: "مفهوم إنك بدك تعرفي شو وضعك بالميراث.",
      steps: [
        "لا توقّعي على أي تنازل قبل ما تستشيري محامية",
        "إذا في ضغط عليكِ لتتنازلي، احكي مع محامية",
      ],
      note: GENERAL_NOTE,
      cites: [],
      general: true,
      topic: "ميراث",
    }),
  },
  {
    id: "blackmail",
    when: (h) => Boolean(h.blackmail),
    answer: (h) => ({
      lead: "إنتِ مش غلطانة. الابتزاز جريمة، والقانون بيعاقب عليها.",
      steps: [
        "لا تبعتي مصاري ولا صور، ولا تردّي عليه",
        "لا تمسحي المحادثة، وصوّري الرسائل واسم الحساب",
        "بلّغي عن الحساب بالمنصة، وتواصلي مع جهة رسمية",
      ],
      note: "حسب المادة ١٥ بعد تعديلها سنة ٢٠٢٠، الابتزاز الإلكتروني عقوبته حبس من سنة لسنتين وغرامة من ١٠٠٠ لـ ٣٠٠٠ دينار. وإذا التهديد بأمور بتمس الشرف، الحبس من سنتين لـ ٣ سنين وغرامة من ٥٠٠٠ لـ ١٠٠٠٠ دينار.",
      cites: h.privacy ? ["15", "22"] : ["15"],
      sos: true,
    }),
  },
  {
    id: "privacy-leak",
    when: (h) => Boolean(h.privacy),
    answer: () => ({
      lead: "نشر صورك أو أمورك الخاصة بدون إذنك ممنوع بالقانون، حتى لو الصور حقيقية.",
      steps: [
        "صوّري المنشور ورابطه واسم الحساب قبل ما ينحذف",
        "بلّغي المنصة إنو المحتوى خاص ومنشور بدون إذنك",
        "تواصلي مع جهة رسمية ومعك الأدلة",
      ],
      note: "حسب المادة ٢٢، اللي بينشر صور أو تسجيلات عن الحياة الخاصة عقوبته حبس ما بيقل عن سنة، أو غرامة من ١٠٠٠ لـ ٣٠٠٠ دينار.",
      cites: ["22"],
    }),
  },
  {
    id: "unwanted-porn",
    when: (h) => Boolean(h.porn),
    answer: () => ({
      lead: "اللي بيبعتلك محتوى إباحي بدون رضاكِ عم يرتكب جريمة.",
      steps: [
        "لا تردّي، واعملي حظر للحساب بعد ما توثّقي",
        "صوّري الرسائل والحساب",
        "بلّغي المنصة وجهة رسمية",
      ],
      note: "حسب المادة ١٦، العقوبة حبس من ٣ شهور لسنتين أو غرامة من ٢٠٠ لـ ١٠٠٠ دينار.",
      cites: ["16"],
    }),
  },
];
