/**
 * Keywords per intent, in the Palestinian dialect and Modern Standard Arabic.
 * Matching rules live in src/ai/detect.js (word-start only, prefixes allowed, digits exact).
 * Add words here; run `npm test` to make sure no existing example breaks.
 */

/** @typedef {"minor"|"porn"|"blackmail"|"nafaqa"|"divorce"|"custody"|"violence"|"threat"|"inherit"|"privacy"} IntentId */

/** @type {{id: IntentId, words: string[]}[]} */
export const INTENTS = [
  {
    id: "minor",
    words: [
      "بنتي",
      "ابني",
      "ولدي",
      "قاصر",
      "طفل",
      "طفلة",
      "عمرها",
      "عمره",
      "١٤",
      "١٥",
      "١٦",
      "١٧",
      "14",
      "15",
      "16",
      "17",
      "مراهق",
    ],
  },
  {
    id: "porn",
    words: [
      "اباحي",
      "إباحي",
      "اباحية",
      "إباحية",
      "جنسي",
      "جنسية",
      "عاري",
      "عارية",
      "مقاطع وسخة",
      "صور وسخة",
      "بدون ما اطلب",
      "بدون ما أطلب",
    ],
  },
  {
    id: "blackmail",
    // (2026-11-13) the everyday way it is said: «معه صوري وبدّه مصاري وإلا بنشرهم»
    words: [
      "ابتز",
      "يبتز",
      "ابتزاز",
      // (2026-11-13) «هدد / تهديد» alone moved to "threat": «جوزي هددني» is not cyber blackmail.
      // detect.js counts a threat as blackmail only with an online / images / money cue.
      "فضيحة",
      "يفضح",
      "افضح",
      "معه صوري",
      "عنده صوري",
      "معه صور الي",
      "بده مصاري",
      "بدو مصاري",
      "بده فلوس",
      "بدو فلوس",
      "بيطلب مصاري",
      "والا بنشر",
      "والا بينشر",
      "والا رح ينشر",
      "والا بفضح",
    ],
  },
  {
    id: "nafaqa",
    words: [
      "نفقة",
      "نفقتي",
      "نفقتها",
      "مصروف الولاد",
      "مصروف البيت",
      "ما بيدفع",
      "ما عم يدفع",
      "ما دفع",
      "ما صرف",
      "ما بيصرف",
      "ما عم يصرف",
      "ما بيعطيني مصاري",
      "ما بيعطينا",
      "صندوق النفقة",
    ],
  },
  {
    id: "divorce",
    words: [
      "طلاق",
      "طلق",
      "اطلق",
      "أطلق",
      "مطلقة",
      "خلع",
      "مهر",
      "مؤخر",
      "العدة",
      "عدتي",
      "اتطلق",
      "طلقني",
      "بدي انفصل",
      "انفصال",
      "يتركني",
      "رماني",
      "طردني من البيت",
      "تفريق",
      "شقاق",
    ],
  },
  {
    id: "custody",
    words: [
      "حضانة",
      "ياخد الولاد",
      "ياخذ الولاد",
      "ياخدوا الولاد",
      "ياخدوا ولادي",
      "اخد الولاد",
      "الولاد مني",
      "ولادي مني",
      "يحرمني من ولادي",
      "ياخد ولادي",
      "ياخذ ولادي",
      "حرمني من الولاد",
      "حرمني من ولادي",
      "مشاهدة الولاد",
      "رؤية الولاد",
      // (2026-11-13) «وبضل الولاد معي؟»
      "الولاد معي",
      "ولادي معي",
      "يضلوا الولاد",
      "بضلوا معي",
    ],
  },
  {
    id: "violence",
    words: ["ضربني", "يضربني", "عنف", "إيذاء", "بيأذيني", "بيهينني"],
  },
  {
    // a threat of any kind; becomes blackmail only with a cyber / money cue (see detect.js)
    id: "threat",
    words: ["هدد", "تهديد", "بيهددني"],
  },
  {
    id: "inherit",
    words: ["ميراث", "ورثة", "ورث", "حصتي", "تركة"],
  },
  {
    id: "privacy",
    words: ["نشر", "نشروا", "صوري", "صورتي", "خصوصية", "حساب مزيف", "انتحل"],
  },
];
