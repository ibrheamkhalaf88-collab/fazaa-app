import { tokenize } from "./normalize.js";

/**
 * Everyday words a person says before (or instead of) a question: hello, how are you, who are you,
 * help me, thank you. They get a warm, fixed reply that invites her to talk, never a refusal.
 * Fixed text, offline, nothing leaves the device. Only for SHORT messages: a long message that
 * starts with "مرحبا" is a real question and goes through the normal answer path.
 */

const MAX_WORDS = 7;

/** Topics she can tap to start (sent as a question). */
export const START_CHIPS = [
  ["حدا عم يبتزني", "حدا عم يبتزني بصوري"],
  ["مشاكل مع جوزي", "جوزي ما بيصرف علي وبيعاملني بقسوة"],
  ["الحضانة والولاد", "خايفة ياخدوا الولاد مني"],
  ["بدي أفضفض", "بدي حدا يسمعني، تعبانة"],
];

const KINDS = [
  {
    kind: "thanks",
    words: ["شكرا", "يسلمو", "يعطيكي العافيه", "يعطيك العافيه", "مشكوره", "تسلمي", "الله يسعدك", "ممنونه"],
    replies: [
      "العفو يا قلبي، وجودك هون بحد ذاته خطوة شجاعة. أنا موجودة كل ما احتجتيني، بأي ساعة.",
      "تسلمي إنتِ. تذكّري إنك مش لحالك، وكل خطوة صغيرة بتعمليها لحالك بتفرق. إذا في إشي تاني، احكيلي.",
    ],
  },
  {
    kind: "name",
    words: [
      "شو اسمك",
      "مين انتي",
      "مين انت",
      "انتي مين",
      "انت مين",
      "شو انتي",
      "مين معي",
      "انتي انسان",
      "انتي بنت",
      "روبوت",
    ],
    replies: [
      "أنا فزعة 🤍 مساعدة رقمية بتحكي معك بسرية، وبتعرف عن حقوقك بالقانون الفلسطيني: الابتزاز، والنفقة، والطلاق، والحضانة. أنا مش إنسانة، بس إذا بدك حدا حقيقي، في محاميات بفزعة بيسمعوكِ.",
    ],
  },
  {
    kind: "how",
    words: ["كيف حالك", "كيفك", "شلونك", "كيف الحال", "شو اخبارك", "كيفك اليوم", "شو الاخبار"],
    replies: [
      "أنا منيحة لما بعرف إنك بخير 🤍 إنتِ كيفك؟ احكيلي شو اللي على بالك اليوم، أنا سامعتك وما في استعجال.",
      "الحمد لله، وإنتِ؟ إذا يومك تقيل أو في إشي مضايقك، احكيلي فيه براحتك، هون مكان آمن إلك.",
    ],
  },
  {
    kind: "help",
    words: [
      "ساعديني",
      "ساعدني",
      "بدي مساعده",
      "محتاجه مساعده",
      "الحقوني",
      "دخيلك",
      "بترجاكي",
      "مش عارفه شو اعمل",
      "ما بعرف شو اعمل",
    ],
    replies: [
      "أنا هون معك، وما رح أتركك 🤍 خدي نفس عميق. احكيلي شو اللي صار، حتى لو بكلمتين، ومع بعض منشوف شو الخطوة الجاية. وإذا إنتِ بخطر هلأ، افتحي «طوارئ ودعم» تحت.",
    ],
  },
  {
    kind: "hello",
    words: [
      "مرحبا",
      "مرحبه",
      "مرحبتين",
      "هاي",
      "هلا",
      "اهلين",
      "اهلا",
      "السلام عليكم",
      "سلام",
      "صباح الخير",
      "مسا الخير",
      "مساء الخير",
      "هاللو",
      "hi",
      "hello",
    ],
    replies: [
      "أهلين فيكِ 🤍 أنا فزعة. هون مكان آمن، بتقدري تحكي فيه عن أي إشي مضايقك: ابتزاز، مشاكل بالبيت، نفقة، طلاق، أو بس بدك حدا يسمعك. من وين حابة نبلّش؟",
      "يا هلا 🤍 منيح إنك هون. أي إشي بتحكيه بيضل بيننا. احكيلي شو اللي على بالك، أو اختاري موضوع من تحت.",
    ],
  },
];

const COMPILED = KINDS.map((k) => ({
  ...k,
  patterns: k.words.map((w) => new RegExp(`(?:^| )(?:و|ف|ب|يا)?${tokenize(w).join(" ")}(?: |$)`)),
}));

let turn = 0;

/**
 * @param {string} question
 * @returns {{kind: string, answer: Omit<import("./types.js").Answer, "source">} | null}
 */
export function detectSmallTalk(question) {
  const words = tokenize(question.toLowerCase());
  if (!words.length || words.length > MAX_WORDS) return null;
  const text = words.join(" ");
  for (const k of COMPILED) {
    if (!k.patterns.some((re) => re.test(text))) continue;
    const lead = k.replies[turn++ % k.replies.length];
    return {
      kind: k.kind,
      answer: {
        kind: "chat",
        lead,
        steps: [],
        note: "",
        cites: [],
        chips: k.kind === "thanks" ? [] : START_CHIPS,
      },
    };
  }
  return null;
}
