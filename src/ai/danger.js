import { tokenize } from "./normalize.js";

/**
 * Danger first, but not by keyword alone.
 *
 * A word like «ضربني» can mean very different things:
 *   «جوزي بيضربني هلأ وقافل علي»   -> immediate danger: a short reply, safety first;
 *   «ما حدا بيضربني»               -> a denial: nothing to do;
 *   «شو عقوبة اللي ضربني؟»         -> a legal question: answer it, then ask once if she is safe now;
 *   «كان يهددني قبل سنة»           -> an old event: ask once if she is safe now, do not assume;
 *   «صاحبتي جوزها بيضربها»         -> about someone else: no emergency script for her.
 * When it is not clear, the app asks ONE gentle, direct safety question instead of guessing either way.
 *
 * Everything here is fixed text written for review (docs/SAFETY-REVIEW.md), never generated, and it
 * works offline. It never invents a phone number: numbers come from the contacts list the owner saved.
 *
 * Levels:
 *   "immediate"        present danger to her          -> fixed reply, sos
 *   "selfharm"         she says she wants to hurt or kill herself -> fixed reply, sos
 *   "selfharm-check"   indirect words (disappear, everyone better without me) -> one direct question
 *   "forced-marriage"  pressure to marry her (often a minor) -> fixed reply
 *   "check"            violence mentioned but past / a question / unclear -> continue + one safety question
 *   null               nothing found
 */

const norm = (s) => tokenize(s).join(" ");
const PRE = "(?:^| )(?:و|ف)?(?:بال|لل|ال|بي|بت|عم|ب|ل|ي|ت)?";
const compile = (list) => list.map((p) => new RegExp(PRE + norm(p) + "(?= |$)"));

/** Clear, present danger (unless denied, past, or asked about as law). */
const SEVERE = compile([
  "خايفه يرجع",
  "خايفه يجي",
  "رح يقتلني",
  "بده يقتلني",
  "بيقتلني",
  "رح يذبحني",
  "هددني بالقتل",
  "حابسني",
  "قافل علي",
  "قفل علي الباب",
  "مش امنه",
  "مش بامان",
  "انا بخطر",
  "خنقني",
  "بيخنقني",
  "طعنني",
  "اغتصبني",
  "معه سكين",
  "معه سلاح",
  "واقف عالباب",
  "عم يكسر الباب",
  "كسر الباب",
]);

/** Violence words that need a safety question, not an automatic emergency script. */
const VIOLENCE = compile([
  "ضربني",
  "بيضربني",
  "يضربني",
  "ضربتني",
  "اعتدى علي",
  "تحرش فيي",
  "بيتحرش فيي",
  "بيهددني",
  "هددني",
  "دفشني",
  "شدني من شعري",
]);

const SELF_HARM = compile([
  "بدي اموت",
  "بدي موت",
  "نفسي اموت",
  "ما بدي اعيش",
  "مش حابه اعيش",
  "انتحر",
  "انتحار",
  "اقتل حالي",
  "اقتل نفسي",
  "اذي حالي",
  "اذي نفسي",
  "اموت حالي",
  "انهي حياتي",
]);

/** Indirect words: never treated as an emergency, never ignored: one direct, gentle question. */
const SELF_HARM_INDIRECT = compile([
  "تعبت من الحياه",
  "تعبت من كل اشي",
  "بدي اختفي",
  "بدي انام وما اصحى",
  "انام وما اصحى",
  "الكل احسن بدوني",
  "احسن لو مش موجوده",
  "احسن لو مت",
  "ما الي لزمه",
  "ما في داعي اكمل",
  "ما في فايده من اشي",
  "مش رح تشوفوني",
  "اخر مره بحكي",
]);

const FORCED_MARRIAGE = compile([
  "بدهم يجوزوني",
  "بدهم يزوجوني",
  "رح يجوزوني",
  "يجوزوني غصب",
  "جوزوني غصب",
  "زوجوني غصب",
  "اجبروني اتجوز",
  "غاصبيني اتجوز",
]);

// a denial right before the phrase («ما حدا بيضربني», «ولا مرة ضربني»); one word between at most, so
// «ما بعرف ليش بيضربني» is NOT read as a denial
const NEGATION = /(?:^| )(?:ما|مش|مو|ولا|لا|عمره ما|عمرو ما|بطل|ابدا)(?: [^ ]+)?$/;
const PAST = /(?:^| )(?:قبل (?:سنه|سنتين|سنين|شهر|شهرين|شهور|فتره|مده|زمان)|من زمان|زمان|بالماضي|لما كنت|كان (?:بي|ي)?[^ ]+|من سنين)(?: |$)/;
const PRESENT = /(?:^| )(?:هلا|هلق|هسا|هسه|الحين|اليوم|الليله|هالليله|لسا|عم يضربني|عم يهددني|كل يوم|كل ليله|رح يرجع)(?: |$)/;
const LEGAL_QUESTION =
  /(?:^| )(?:عقوبه|عقوبته|العقوبه|بيعاقب|القانون|قانونيا|شكوى|اشتكي|اشتكى|ارفع قضيه|حقي|حقوقي|شو بيصير|شو حكم|بيتحاسب|بيتسجن)(?: |$)/;
const OTHER_PERSON =
  /(?:^| )(?:صاحبتي|صديقتي|اختي|جارتي|قريبتي|بنت عمي|بنت خالي|امي|وحده بعرفها|بنت بعرفها|زميلتي)(?: |$)/;
const MINOR = /(?:^| )(?:1[0-7]|١[٠-٧]|قاصر|قاصره|بالمدرسه|بالصف)(?: |$)/;
const ARRANGED = /(?:^| )(?:جايبين عريس|جابولي عريس|عريس|خطبوني|بدهم يخطبوني|كتب الكتاب|بدهم يزوجوني|بدهم يجوزوني)(?: |$)/;
export const FORCED_QUESTION = "في حدا عم يضغط عليكِ تتجوزي وإنتِ مش بدك؟";

/** First match of `patterns` that is not denied in the few words before it. @returns {number} index or -1 */
function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const before = text.slice(0, m.index).trim();
    if (NEGATION.test(before)) continue;
    return m.index;
  }
  return -1;
}

/* ---------- fixed replies (reviewed text; see docs/SAFETY-REVIEW.md) ---------- */

const callStep = (label, number) => (number ? `إذا بتقدري تتصلي بأمان: ${label} ${number}.` : "");

function immediateReply(n) {
  return {
    kind: "talk",
    lead: "سلامتك أولاً.",
    options: [
      callStep("الشرطة", n.police),
      "إذا الاتصال مش آمن هلأ، فكّري بأقرب مكان أو شخص بتقدري توصليله بدون ما تعرّضي حالك لخطر أكبر.",
      "ما تواجهيه هلأ، وما تحاولي تجمعي أدلة إذا هاد بيخليكِ بخطر.",
    ].filter(Boolean),
    ask: "إنتِ هلأ بمكان بتقدري تحكي فيه بأمان؟",
    note: "أنا مساعدة رقمية: ما بقدر أتصل بحدا عنك، وما بقدر أتأكد إذا في حدا متاح هلأ.",
    sos: true,
    topic: "عنف أسري",
  };
}

function selfHarmReply(n, { mindLine }) {
  return {
    kind: "talk",
    lead: "شكراً إنك حكيتيلي. اللي حاسة فيه تقيل، وسلامتك مهمة هلأ.",
    options: [
      n.ambulance
        ? `إذا ممكن تأذي حالك هلأ، اتصلي بالإسعاف ${n.ambulance} أو روحي لأقرب طوارئ إذا بتقدري.`
        : "إذا ممكن تأذي حالك هلأ، روحي لأقرب طوارئ إذا بتقدري.",
      "إذا في شخص بتأمنيله قريب منك، خليه يعرف إنك محتاجة حدا جنبك هلأ.",
      mindLine ? "في خط دعم نفسي بصفحة «مين بيساعدني»." : "",
    ].filter(Boolean),
    ask: "إنتِ هلأ لحالك؟",
    note: "أنا مساعدة رقمية، مش مختصة نفسية، وما بقدر أتصل بحدا عنك.",
    sos: true,
    topic: "دعم نفسي",
  };
}

const SELF_HARM_CHECK = {
  kind: "talk",
  lead: "اللي عم تحكيه بيبيّن قديش إنتِ تعبانة.",
  options: [],
  ask: "بدي أسألك بشكل مباشر عشان أطمّن عليكِ: هل عم تفكري تأذي حالك؟",
  note: "",
  sos: true,
  topic: "دعم نفسي",
};

function forcedMarriageReply(n) {
  return {
    kind: "talk",
    lead: "من حقك تحكي «لأ»، وإنتِ مش غلطانة إنك رافضة أو خايفة.",
    options: [
      "إذا في شخص كبير بتأمنيله وبتحسي إنه آمن تحكيله (قريبة، معلمة، مرشدة)، ممكن يوقف معك.",
      "بتقدري تطلبي محامية من فزعة تشرحلك وضعك وحقوقك.",
      callStep("وإذا في تهديد أو ضرب هلأ، الشرطة", n.police),
    ].filter(Boolean),
    ask: "إنتِ بأمان بالبيت هلأ؟",
    note: "",
    sos: true,
    topic: "زواج قاصرات",
  };
}

/** The one safety question added to an ordinary reply when violence is mentioned but not clearly now. */
export const SAFETY_QUESTION = "وقبل ما نكمل: إنتِ بأمان هلأ؟";
export const SAFETY_QUESTION_OTHER = "وإذا هي بخطر هلأ، الأمان أولاً قبل أي خطوة تانية.";

/**
 * @param {string} question
 * @param {{police?: string, ambulance?: string}} [numbers]  from the contacts list (never invented)
 * @param {{mindLine?: boolean}} [opts]  true when a verified mental-health line is listed
 * @returns {{level: string, answer?: object, ask?: string} | null}
 */
export function assessDanger(question, numbers = {}, opts = {}) {
  const text = norm(question);
  if (!text) return null;
  const otherPerson = OTHER_PERSON.test(text);
  const legal = LEGAL_QUESTION.test(text);
  const past = PAST.test(text) && !PRESENT.test(text);

  if (firstMatch(text, SELF_HARM) >= 0)
    return { level: "selfharm", answer: selfHarmReply(numbers, { mindLine: opts.mindLine }) };
  if (firstMatch(text, SELF_HARM_INDIRECT) >= 0) return { level: "selfharm-check", answer: { ...SELF_HARM_CHECK } };

  if (firstMatch(text, FORCED_MARRIAGE) >= 0 && !legal)
    return { level: "forced-marriage", answer: forcedMarriageReply(numbers) };
  // a minor whose marriage is being arranged: not an emergency script, not ignored either
  if (MINOR.test(text) && ARRANGED.test(text) && !legal)
    return { level: "check", ask: FORCED_QUESTION, about: "forced" };

  const severe = firstMatch(text, SEVERE) >= 0;
  const violence = firstMatch(text, VIOLENCE) >= 0;
  if (!severe && !violence) return null;

  if (otherPerson) return { level: "check", ask: SAFETY_QUESTION_OTHER, about: "other" };
  if (legal || past) return { level: "check", ask: SAFETY_QUESTION };
  if (severe || PRESENT.test(text)) return { level: "immediate", answer: immediateReply(numbers) };
  return { level: "check", ask: SAFETY_QUESTION };
}

/**
 * Backwards-compatible wrapper: only the levels that REPLACE the normal answer.
 * @returns {{kind: string, answer: object} | null}
 */
export function detectDanger(question, numbers = {}, opts = {}) {
  const d = assessDanger(question, numbers, opts);
  return d?.answer ? { kind: LEGACY_KIND[d.level] || d.level, answer: d.answer } : null;
}
const LEGACY_KIND = { immediate: "imminent", selfharm: "self-harm" };

/** The fixed forced-marriage reply (used when she answers «آه» to FORCED_QUESTION). */
export const forcedMarriageAnswer = (numbers = {}) => forcedMarriageReply(numbers);

export const isMinorMentioned = (question) => MINOR.test(norm(question));
