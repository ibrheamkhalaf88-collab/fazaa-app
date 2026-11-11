import { tokenize } from "./normalize.js";

/**
 * "A friend who listens": when she is venting and no law in the app fits, she gets a warm reply with
 * safe, general steps instead of a refusal. Fixed text, never generated, and it never states a
 * legal fact (no articles, no penalties).
 */

const FEELINGS = [
  "تعبت",
  "تعبانه",
  "زهقت",
  "طفشت",
  "مخنوقه",
  "حزينه",
  "زعلانه",
  "خايفه",
  "مقهوره",
  "مكسوره",
  "لحالي",
  "وحيده",
  "ما حدا فاهمني",
  "ما حدا بيسمعني",
  "بدي حدا يسمعني",
  "بدي احكي",
  "بعيط",
  "ببكي",
  "مش قادره",
  "ما بعرف شو اعمل",
  "ما بعرف لمين احكي",
  "بيهينني",
  "بيصرخ",
  "بيصرخ علي",
  "بيذلني",
  "بيحقرني",
];

const PATTERNS = FEELINGS.map((p) => new RegExp(`(?:^| )(?:و|ف|ب|بت|عم)?${tokenize(p).join(" ")}`));

/** @param {string} question */
export function isVenting(question) {
  const text = tokenize(question).join(" ");
  return PATTERNS.some((re) => re.test(text));
}

/** @returns {Omit<import("./types.js").Answer, "source">} */
export function companionAnswer() {
  return {
    lead: "أنا سامعتك، واللي عم تحكيه مش سهل أبداً. مشاعرك مفهومة، وإنتِ مش غلطانة إنك تعبتي.",
    steps: [
      "خدي نفس، واكتبي هون شو اللي صار بالزبط إذا حابة، أنا بسمعك",
      "احكي لحدا بتثقي فيه، أخت أو صاحبة أو قريبة، وما تضلي شايلة الحمل لحالك",
      "إذا في إهانة أو تهديد بيتكرر، وثّقيه (رسائل، تواريخ)، بيفيدك بعدين",
      "إذا بدك تعرفي حقوقك بالزبط، المحامية بتسمعك وبتحكيلك شو بتقدري تعملي",
    ],
    note: "هاد كلام دعم عام، مش معلومة قانونية. لموضوعك بالتفصيل احكي مع محامية.",
    cites: [],
    general: true,
    topic: "دعم",
  };
}
