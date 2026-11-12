import { tokenize } from "./normalize.js";

/**
 * "A friend who listens": when she is venting and no law in the app fits, she gets a warm reply with
 * safe, general steps and a word of hope, instead of a refusal. Fixed text, never generated, and it
 * never states a legal fact (no articles, no penalties). The reply follows the main feeling she
 * names (sad, afraid, alone, humiliated, angry, worn out), so it does not read like a form letter.
 */

const FEELINGS = {
  afraid: ["خايفه", "خوف", "مرعوبه", "قلقانه", "مرعوب"],
  humiliated: [
    "بيهينني",
    "بيصرخ",
    "بيذلني",
    "بيحقرني",
    "بيسبني",
    "بيشتمني",
    "بيعيرني",
    "بيقلل مني",
    "بيستهزئ",
  ],
  alone: ["لحالي", "وحيده", "ما حدا فاهمني", "ما حدا بيسمعني", "ما حدا معي", "ما الي حدا", "ما الي غير"],
  sad: ["حزينه", "زعلانه", "مقهوره", "مكسوره", "بعيط", "ببكي", "قلبي موجوعه", "مجروحه", "مخذوله"],
  worn: ["تعبت", "تعبانه", "زهقت", "طفشت", "مخنوقه", "مش قادره", "استنفدت", "خلصت طاقتي", "ما عاد فيي"],
  lost: ["ما بعرف شو اعمل", "ما بعرف لمين احكي", "بدي احكي", "بدي حدا يسمعني", "محتاره", "ضايعه"],
};

const COMPILED = Object.entries(FEELINGS).map(([feeling, words]) => ({
  feeling,
  patterns: words.map((p) => new RegExp(`(?:^| )(?:و|ف|ب|بت|عم)?${tokenize(p).join(" ")}`)),
}));

/** @param {string} question @returns {string|null} the main feeling, or null when she is not venting */
export function ventingFeeling(question) {
  const text = tokenize(question).join(" ");
  return COMPILED.find(({ patterns }) => patterns.some((re) => re.test(text)))?.feeling ?? null;
}

/** @param {string} question */
export const isVenting = (question) => ventingFeeling(question) !== null;

const LEADS = {
  afraid:
    "حاسة فيكِ، والخوف اللي عم تحكي عنه حقيقي ومفهوم. إنتِ مش ضعيفة لأنك خايفة، إنتِ قوية لأنك عم تحكي وتدوري على حل.",
  humiliated:
    "اللي عم يصير معك مش طبيعي ومش مقبول. ما حدا إله حق يهينك أو يصرّخ عليكِ أو يقلل من قيمتك، مهما كانت الظروف. وإنتِ مش غلطانة.",
  alone:
    "أنا سامعتك، وحاسة قديش الوحدة صعبة. بس هلأ، بهاللحظة، إنتِ مش لحالك. أنا معك، وفي ناس بيهتموا فيكِ أكتر مما بتتخيلي.",
  sad: "قلبي معك. الوجع اللي جواتك مفهوم، ومن حقك تزعلي وتبكي. البكي مش ضعف، هو طريقة قلبك ليرتاح شوي.",
  worn: "واضح إنك شايلة كتير من زمان، وتعبك مفهوم. إنتِ عملتي اللي بتقدري عليه، ومن حقك ترتاحي وتطلبي مساعدة.",
  lost: "أنا هون وسامعتك. مش لازم يكون عندك كل الأجوبة هلأ، خلينا نمشيها خطوة خطوة مع بعض.",
};

const STEPS = {
  afraid: [
    "إذا الخطر قريب، فكري بمكان آمن بتقدري تروحي عليه، وحدا بتثقي فيه بتقدري تتصلي فيه بأي وقت",
    "خلي تلفونك مشحون، وخبّي أوراقك المهمة (الهوية، أوراق الولاد) بمكان سهل",
    "احكيلي شو اللي مخوّفك بالزبط، عشان أقدر أعطيكِ معلومة أوضح",
  ],
  humiliated: [
    "اكتبي بدفتر أو بتلفونك متى صار وشو انقال، حتى لو بدا الإشي صغير. التوثيق بيحميكِ بعدين",
    "احكي لحدا بتثقي فيه: أخت، صاحبة، قريبة. ما تضلي شايلة الحمل لحالك",
    "إذا صار في ضرب أو تهديد، هاد عنف وإلك حماية، والمحامية بتقدر تحكيلك شو حقوقك بالزبط",
  ],
  alone: [
    "فكري بشخص واحد بتثقي فيه، حتى لو ما حكيتي معه من زمان، وابعتيله رسالة صغيرة",
    "اكتبي هون كل اللي بقلبك، أنا بسمعك بدون حكم وبدون ما حدا يعرف",
    "في جهات دعم نفسي بتسمع بسرية، موجودة بصفحة «مين بيساعدني»",
  ],
  sad: [
    "خدي دقيقة لحالك، اشربي مي، وخدي نفس عميق ببطء",
    "احكيلي شو اللي زعّلك، الحكي بيخفف الحمل",
    "إذا الحزن طوّل وصار تقيل كل يوم، خطوط الدعم النفسي موجودة بصفحة «مين بيساعدني»",
  ],
  worn: [
    "ريّحي حالك شوي اليوم، ولو بإشي صغير بتحبيه",
    "اختاري شغلة وحدة بس بدك تحليها هلأ، ونحكي فيها سوا",
    "إذا في موضوع قانوني ورا التعب (نفقة، طلاق، حضانة)، المحامية بتقدر تشيل عنك جزء منه",
  ],
  lost: [
    "احكيلي بكلمتين شو اللي صار، من الأول، وبأي ترتيب بيجي على بالك",
    "إذا الموضوع فيه ابتزاز أو مصاري أو ولاد أو طلاق، احكيلي، عندي معلومات عنهم",
    "وإذا بدك حدا حقيقي، المحامية بتسمعك وبتحكيلك شو بتقدري تعملي",
  ],
};

/** Words of hope, rotated so the same sentence does not repeat every time. */
const HOPE = [
  "تذكّري: إنتِ أقوى مما بتتخيلي، والأيام الصعبة بتمرق. 🤍",
  "كل خطوة صغيرة بتعمليها هي خطوة لقدّام، وإنتِ بتستاهلي حياة فيها أمان واحترام. 🤍",
  "مش لازم تحلي كل إشي اليوم. يكفي إنك هون وعم تدوري، وهاد بحد ذاته شجاعة. 🤍",
  "في ناس كتير مرقوا بإشي شبه اللي إنتِ فيه، وطلعوا منه أقوى. وإنتِ كمان رح تطلعي. 🤍",
];
let hopeTurn = 0;
/** One encouraging closing line (rotates). */
export const hopeLine = () => HOPE[hopeTurn++ % HOPE.length];

/**
 * @param {string} [question]
 * @returns {Omit<import("./types.js").Answer, "source">}
 */
export function companionAnswer(question = "") {
  const feeling = ventingFeeling(question) || "lost";
  return {
    lead: LEADS[feeling],
    steps: STEPS[feeling],
    note: "هاد كلام دعم، مش معلومة قانونية. لموضوعك بالتفصيل احكي مع محامية.",
    closing: hopeLine(),
    cites: [],
    general: true,
    topic: "دعم",
  };
}
