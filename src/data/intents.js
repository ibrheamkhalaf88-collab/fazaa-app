/**
 * Keywords per intent, in the Palestinian dialect and Modern Standard Arabic.
 * Matching rules live in src/ai/detect.js (word-start only, prefixes allowed, digits exact).
 * Add words here; run `npm test` to make sure no existing example breaks.
 */

/** @typedef {"minor"|"porn"|"blackmail"|"nafaqa"|"divorce"|"custody"|"violence"|"inherit"|"privacy"} IntentId */

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
    words: ["ابتز", "يبتز", "ابتزاز", "هدد", "تهديد", "فضيحة", "يفضح", "افضح"],
  },
  {
    id: "nafaqa",
    words: ["نفقة", "مصروف الولاد", "ما بيدفع", "ما عم يدفع", "ما دفع", "صندوق النفقة"],
  },
  {
    id: "divorce",
    words: ["طلاق", "طلق", "مطلقة", "خلع", "مهر", "مؤخر", "العدة", "عدتي", "اتطلق"],
  },
  {
    id: "custody",
    words: [
      "حضانة",
      "ياخد الولاد",
      "ياخذ الولاد",
      "ياخد ولادي",
      "ياخذ ولادي",
      "حرمني من الولاد",
      "حرمني من ولادي",
      "مشاهدة الولاد",
      "رؤية الولاد",
    ],
  },
  {
    id: "violence",
    words: ["ضربني", "يضربني", "عنف", "إيذاء", "بيأذيني", "بيهينني"],
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
