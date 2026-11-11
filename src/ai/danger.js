import { tokenize } from "./normalize.js";

/**
 * Danger first: some messages must get a fixed, reviewed safety reply at once, before any law lookup
 * or language model, and even offline. A missed law answer is a gap; a missed "he will come back
 * tonight" is a harm. So this list errs on the side of showing the safety reply.
 *
 * Phrases match at the start of a word (a common prefix such as و / ف / ب / بت / عم is allowed),
 * after the same normalisation as intent detection (أ/إ/آ → ا, ة → ه, ى → ي).
 *
 * The phone numbers below are Palestine's general emergency numbers. The owner must confirm them,
 * and the women's helplines, before launch (they are also listed on the support screen).
 */

const PREFIX = "(?:^| )(?:و|ف)?(?:بال|لل|ال|بي|بت|عم|ب|ل|ي|ت)?";

const KINDS = [
  {
    kind: "self-harm",
    phrases: [
      "بدي اموت",
      "بدي موت",
      "نفسي اموت",
      "ما بدي اعيش",
      "مش حابه اعيش",
      "تعبت من الحياه",
      "انتحر",
      "انتحار",
      "اقتل حالي",
      "اقتل نفسي",
      "اذي حالي",
      "اذي نفسي",
      "اموت حالي",
    ],
  },
  {
    kind: "imminent",
    phrases: [
      "خايفه يرجع",
      "خايفه يجي",
      "رح يقتلني",
      "بده يقتلني",
      "بيقتلني",
      "هددني بالقتل",
      "هددني يقتلني",
      "حابسني",
      "قافل علي",
      "قفل علي",
      "بخطر",
      "مش امنه",
      "مش بامان",
      "ضربني",
      "بيضربني",
      "ضربتني",
      "خنقني",
      "بيخنقني",
      "طعنني",
      "اعتدى علي",
      "اغتصبني",
      "تحرش فيي",
      "بيتحرش",
    ],
  },
  {
    kind: "forced-marriage",
    phrases: ["يجوزوني", "جوزوني", "يزوجوني", "زوجوني", "بدهم يجوزوني", "غصب عني", "اجبروني", "بالغصب"],
  },
];

const MINOR = /(?:^| )(?:1[0-7]|١[٠-٧]|قاصر|قاصره|بالمدرسه)(?: |$)/;

const COMPILED = KINDS.map(({ kind, phrases }) => ({
  kind,
  patterns: phrases.map((p) => new RegExp(PREFIX + tokenize(p).join(" "))),
}));

/** Fixed replies: reviewed text, never generated. `sos` opens the safety plan button. */
const REPLIES = {
  "self-harm": {
    lead: "أنا سامعتك، واللي حاسة فيه وجع حقيقي. إنتِ مش لحالك، وفي ناس بدهم يساعدوكِ هلأ.",
    steps: [
      "إذا ممكن تأذي حالك هلأ، اتصلي بالإسعاف{ambulance}، أو روحي لأقرب طوارئ",
      "احكي لحدا بتثقي فيه وخليه يضل معكِ الليلة",
      "خطوط الدعم النفسي المجانية موجودة بصفحة «مين بيساعدني»",
    ],
    note: "",
    topic: "دعم نفسي",
  },
  imminent: {
    lead: "سلامتك أهم إشي هلأ. ما حدا إله حق يأذيكِ، وإنتِ مش غلطانة.",
    steps: [
      "إذا إنتِ بخطر هلأ، اتصلي بالشرطة{police} أو روحي لمكان آمن عند حدا بتثقي فيه",
      "جهّزي تلفونك وهويتك وأوراق الولاد بمكان سهل تاخديهم منه",
      "وثّقي أي إصابة أو تهديد: صور، وتقرير طبي، ورسائل",
      "احكي مع محامية عن الحماية وعن حقوقك",
    ],
    note: "",
    topic: "عنف أسري",
  },
  "forced-marriage": {
    lead: "إنتِ مش غلطانة، ومن حقك تحكي «لأ». جوازك غصب عنكِ مش طبيعي ولازم حدا يوقف معكِ.",
    steps: [
      "احكي لحدا كبير بتثقي فيه: قريبة، أو معلمة، أو مرشدة المدرسة",
      "اطلبي محامية من فزعة، بتعرف شو حقوقك وشو بيحميكِ",
      "إذا في تهديد أو ضرب، اتصلي بالشرطة{police}",
    ],
    note: "",
    topic: "زواج قاصرات",
  },
};

/** Fill {police} / {ambulance} with the numbers the owner set in the dashboard (" 100"), or nothing. */
function reply(kind, numbers) {
  const fill = (s) => s.replace(/\{(police|ambulance)\}/g, (_, k) => (numbers[k] ? ` ${numbers[k]}` : ""));
  const r = REPLIES[kind];
  return { ...r, lead: fill(r.lead), steps: r.steps.map(fill), cites: [], general: true, sos: true };
}

/**
 * @param {string} question
 * @param {{police?: string, ambulance?: string}} [numbers]  from the contacts list; defaults 100 / 101
 * @returns {{kind: "self-harm"|"imminent"|"forced-marriage", answer: Omit<import("./types.js").Answer, "source">} | null}
 */
export function detectDanger(question, numbers = { police: "100", ambulance: "101" }) {
  const text = tokenize(question).join(" ");
  for (const { kind, patterns } of COMPILED) {
    if (!patterns.some((re) => re.test(text))) continue;
    // "غصب عني" alone is too wide; forced marriage needs a marriage word or a minor's age
    if (kind === "forced-marriage" && !/(?:جوز|زوج|عريس|خطب)/.test(text) && !MINOR.test(text)) continue;
    return { kind, answer: reply(kind, numbers) };
  }
  // a minor talking about marriage at all is treated as forced marriage
  if (MINOR.test(text) && /(?:^| )(?:ب|و)?(?:يجوز|جواز|زواج|عريس|يزوج|يخطب)/.test(text)) {
    return { kind: "forced-marriage", answer: reply("forced-marriage", numbers) };
  }
  return null;
}
