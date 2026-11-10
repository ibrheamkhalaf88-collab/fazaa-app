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

const GENERAL_NOTE =
  "هاد شرح عام. نص قانون الأحوال الشخصية لسا مش مضاف لهالنسخة، والتفاصيل بتختلف بين الضفة وغزة، فالمحامية بتقلك شو بينطبق عليكِ بالزبط.";

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
      note: "المادة ٥٢ بتضاعف العقوبة إذا الجريمة فيها استغلال لحدا عمره أقل من ١٨ سنة.",
      cites: ["52", h.blackmail ? "15" : h.porn ? "16" : "22"],
    }),
  },
  {
    id: "domestic-violence",
    when: (h) => h.violence && !h.privacy && !h.porn,
    answer: () => ({
      lead: "سلامتك أهم إشي. ما حدا إله حق يأذيكِ.",
      steps: [
        "إذا إنتِ بخطر هلأ، روحي لمكان آمن وتواصلي مع جهة رسمية",
        "وثّقي الإصابات والتهديدات: صور، وتقارير طبية، ورسائل",
        "احكي مع محامية عن الحماية وعن حقوقك وحقوق ولادك",
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
      lead: "نفقة الولاد حق إلهم على أبوهم، حتى بعد الطلاق.",
      steps: [
        "جهّزي الأوراق: عقد الزواج، وشهادات ميلاد الولاد، وورقة الطلاق إذا موجودة",
        "ارفعي دعوى نفقة بالمحكمة الشرعية بمنطقتك",
        "إذا صدر الحكم وما التزم بالدفع، في طرق تنفيذ، واسألي المحامية عن صندوق النفقة",
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
      lead: "التهديد بأخد الولاد مش هو اللي بيقرر. المحكمة هي اللي بتقرر الحضانة.",
      steps: [
        "لا تتنازلي عن الحضانة بورقة أو باتفاق قبل ما تستشيري محامية",
        "احتفظي بأي رسائل تهديد",
        "اسألي المحامية عن سن الحضانة بمنطقتك وحقك برؤية الولاد",
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
      lead: "الطلاق ما بيلغي حقوقك. في حقوق إلك وإلولادك لازم تعرفيها.",
      steps: [
        "احتفظي بعقد الزواج وأي ورقة طلاق",
        "اسألي عن حقوقك المالية متل المهر المؤجل ونفقة العدة",
        "إذا عندك ولاد، اسألي عن النفقة والحضانة سوا",
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
      lead: "حصتك بالميراث حق إلك، وما حدا بيقدر يجبرك تتنازلي عنها.",
      steps: [
        "لا توقّعي على أي تنازل قبل ما تستشيري",
        "اطلبي حصر إرث من المحكمة الشرعية",
        "احكي مع محامية إذا في ضغط عليكِ",
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
      note: "حسب المادة ١٥، الابتزاز الإلكتروني عقوبته حبس أو غرامة من ٢٠٠ لـ ١٠٠٠ دينار. وإذا التهديد بأمور بتمس الشرف، الحبس ما بيقل عن سنة أو غرامة من ١٠٠٠ لـ ٣٠٠٠ دينار.",
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
