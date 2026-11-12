import { tokenize } from "./normalize.js";
import { detectIntents } from "./detect.js";
import { CONTEXT } from "./limits.js";

/**
 * Conversation understanding + a SESSION memory (in RAM only: never written to storage, wiped with the
 * chat, by quick exit and on reload).
 *
 * What she needs right now is decided from the whole turn, not from one keyword:
 *   "listen"     she wants to be heard («بس اسمعيني», «بدي أفضفض»): no advice, no lists;
 *   "understand" she is telling what happens: reflect one real detail, ask ONE question;
 *   "steps"      she asks what to do: a few small options that fit what she said she can do;
 *   "legal"      she asks about the law / her rights / a penalty / an article;
 *   "followup"   a short answer to the last question («آه», «كل يوم», «لا، قصدي أختي»).
 * A word like «جوزي» or «طلاق» alone never makes a turn "legal".
 *
 * The memory keeps only what she SAID (facts and constraints), never guesses, and an explicit
 * correction replaces the earlier fact at once.
 */

const norm = (s) => tokenize(s).join(" ");
const has = (text, list) => list.some((p) => new RegExp(`(?:^| )(?:و|ف|ب)?${norm(p)}(?= |$)`).test(text));

const LISTEN = [
  "بس اسمعيني",
  "اسمعيني بس",
  "بدي افضفض",
  "بدي حدا يسمعني",
  "بس حدا يسمعني",
  "حدا يسمعني",
  "بدي احكي بس",
  "مش بدي نصايح",
  "بلا نصايح",
  "ما بدي حلول",
  "بس بدي احكي",
  "خليني احكي",
];
const STEPS = ["شو اعمل", "شو بعمل", "شو لازم اعمل", "شو بتنصحيني", "شو الحل", "بدي حل", "كيف بتصرف", "شو خياراتي", "شو بقدر اعمل", "ساعديني احل", "كيف اطلع من", "شو الخطوه"];
const LEGAL = ["القانون", "قانونيا", "قانوني", "حقي", "حقوقي", "بيحقلي", "عقوبه", "العقوبه", "عقوبته", "ماده", "الماده", "المحكمه", "محكمه", "شكوى", "اشتكي", "قضيه", "مسموح", "ممنوع قانونيا", "سن الزواج", "بيعاقب", "شو بيقول"];
const UNDERSTAND = ["ليش", "مش فاهمه", "طبيعي", "انا غلطانه", "غلطي", "هل هاد", "شو يعني"];
const QUESTION_WORDS = ["شو", "كيف", "هل", "بقدر", "بيصير", "اذا", "متى", "وين"];
const FAMILY_INTENTS = ["nafaqa", "divorce", "custody", "inherit"];
const CYBER_INTENTS = ["blackmail", "privacy", "porn"];

const YES = /^(?:اه|ايوه|ايوا|اي|نعم|اكيد|صح|بالزبط|طبعا)(?: |$)/;
const NO = /^(?:لا|لأ|لاء|مش|ما|ابدا)(?: |$)/;

/** What she told us she cannot do or does not have. Used to never suggest it again. */
const CONSTRAINTS = {
  noMoney: ["ما معي مصاري", "ما عندي مصاري", "ما بقدر ادفع", "ما معي ولا شيكل", "ما عندي دخل"],
  noPhone: ["ما عندي تلفون", "تلفوني مش الي", "ما عندي جوال", "التلفون مش الي"],
  monitored: ["بيفتش تلفوني", "بيفتشوا تلفوني", "بيراقب تلفوني", "بيراقبوا تلفوني", "بيقرأ رسايلي", "بيشوف تلفوني", "بيفتحوا تلفوني"],
  noTrusted: ["ما عندي حدا", "ما الي حدا", "ما في حدا اوثق فيه", "ما بثق بحدا", "ما في حدا"],
  familyUnsafe: ["اهلي هم المشكله", "ما بقدر احكي لاهلي", "خايفه من اهلي", "اهلي ضدي", "اهلي بيقتلوني", "اذا عرفوا اهلي"],
  cannotLeave: ["ما بقدر اطلع", "ما عندي مواصلات", "ما بقدر اروح", "ما الي مكان اروح عليه", "ما بقدر اترك البيت"],
};
export const CONSTRAINT_LABELS = {
  noMoney: "ما عندها مصاري",
  noPhone: "ما عندها تلفون خاص",
  monitored: "تلفونها ممكن يكون مراقب",
  noTrusted: "ما عندها شخص بتثق فيه",
  familyUnsafe: "أهلها مش آمنين إلها أو مصدر خوف",
  cannotLeave: "ما بتقدر تطلع من البيت بسهولة",
};

const PEOPLE = {
  جوزي: "جوزك",
  زوجي: "جوزك",
  خطيبي: "خطيبك",
  طليقي: "طليقك",
  ابوي: "أبوكِ",
  امي: "إمك",
  اخوي: "أخوكِ",
  اختي: "أختك",
  اهلي: "أهلك",
  حماتي: "حماتك",
  مديري: "مديرك",
  صاحبتي: "صاحبتك",
};

const FEELINGS = {
  تعبانه: "تعب",
  تعبت: "تعب",
  مخنوقه: "ضيق",
  زهقت: "تعب",
  حزينه: "حزن",
  زعلانه: "زعل",
  مقهوره: "قهر",
  خايفه: "خوف",
  مرعوبه: "خوف",
  وحيده: "وحدة",
  لحالي: "وحدة",
  مكسوره: "وجع",
  ضايعه: "حيرة",
  محتاره: "حيرة",
};

/** A fresh memory for one chat session. */
export function createMemory() {
  return {
    turns: [], // {role: "user"|"assistant", text}
    mode: "", // sticky "listen" when she asked to just be heard
    lastNeed: "",
    lastAsk: "", // the question we asked last ("safety", "selfharm", "detail", ...)
    person: "", // who she is talking about, as she said it («أختك»)
    feeling: "",
    constraints: new Set(),
    rejected: new Set(), // option ids she refused
    usedOpeners: new Set(),
    lastOptionIds: [],
    safetyAsked: false,
    country: "",
  };
}

/** Forget everything (wipe, quick exit, region change). */
export function clearMemory(memory) {
  Object.assign(memory, createMemory());
}

/** Read what she said into the memory: constraints, who, feeling, corrections. */
export function remember(memory, text) {
  const t = norm(text);
  for (const [id, phrases] of Object.entries(CONSTRAINTS)) if (has(t, phrases)) memory.constraints.add(id);
  // an explicit correction replaces the earlier fact («لا، قصدي أختي»)
  const correction = /(?:^| )قصدي (?:انا )?([^ ]+)/.exec(t);
  const words = t.split(" ");
  const said = words.map((w) => w.replace(/^و/, "")).find((w) => PEOPLE[w]);
  if (correction && PEOPLE[correction[1]]) memory.person = PEOPLE[correction[1]];
  else if (said) memory.person = PEOPLE[said];
  const feel = words.find((w) => FEELINGS[w]);
  if (feel) memory.feeling = FEELINGS[feel];
  if (has(t, LISTEN)) memory.mode = "listen";
  if (has(t, STEPS) || has(t, LEGAL)) memory.mode = "";
  // she refused one of the ideas we just gave: never suggest it again this session
  if (memory.lastOptionIds?.length && /(?:^| )(?:ما بقدر|مش امن|مستحيل|ما بنفع|ما بزبط|ما في)(?: |$)/.test(t)) {
    for (const [id, cue] of Object.entries(REFUSAL_CUES))
      if (memory.lastOptionIds.includes(id) && cue.test(t)) memory.rejected.add(id);
  }
}

const REFUSAL_CUES = {
  trusted: /(?:^| )(?:احكي|احد|حدا|اهلي|اثق)(?: |$)/,
  write: /(?:^| )(?:اكتب|اوثق|تلفوني)(?: |$)/,
  lawyer: /(?:^| )(?:محامي|محاميه|قضيه)(?: |$)/,
  support: /(?:^| )(?:اتصل|جهه|جمعيه)(?: |$)/,
};

/** Keep the last turns (cut, never silently: a cut turn ends with "…"). */
export function pushTurn(memory, role, text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  const cut = clean.length > CONTEXT.turnChars ? `${clean.slice(0, CONTEXT.turnChars - 1)}…` : clean;
  memory.turns.push({ role, text: cut });
  if (memory.turns.length > CONTEXT.turns) memory.turns.splice(0, memory.turns.length - CONTEXT.turns);
}

/**
 * @param {string} text
 * @param {ReturnType<typeof createMemory>} memory
 * @returns {"listen"|"understand"|"steps"|"legal"|"followup"}
 */
export function classifyNeed(text, memory) {
  const t = norm(text);
  const words = t.split(" ").filter(Boolean);
  if (has(t, LISTEN)) return "listen";
  const intents = detectIntents(text);
  // blackmail / leaked images: the useful reply IS the practical + legal one (it has the steps)
  if (CYBER_INTENTS.some((i) => intents[i])) return "legal";
  if (has(t, STEPS)) return "steps";
  if (/(?:^| )(?:الماده|ماده)(?: رقم)? [0-9٠-٩]+/.test(t)) return "legal";
  const asks = text.includes("؟") || text.includes("?") || has(t, QUESTION_WORDS);
  if (has(t, LEGAL)) return "legal";
  if (FAMILY_INTENTS.some((i) => intents[i]) && asks) return "legal";
  if (memory.lastAsk && words.length <= 4) return "followup";
  if (has(t, UNDERSTAND)) return "understand";
  if (memory.mode === "listen") return "listen";
  return "understand";
}

/** Did she answer yes / no to our last question? */
export const answeredYes = (text) => YES.test(norm(text));
export const answeredNo = (text) => NO.test(norm(text));

/* ---------- local replies (offline, fixed phrases; never legal facts) ---------- */

const OPENERS = {
  تعب: ["واضح إنك شايلة كتير.", "التعب اللي بتحكي عنه مفهوم."],
  حزن: ["الحزن اللي بتحكي عنه تقيل.", "مفهوم إنك زعلانة."],
  زعل: ["مفهوم إنك زعلانة.", "زعلك إله سبب."],
  قهر: ["القهر اللي بتحكي عنه واضح.", "مفهوم ليش إنتِ مقهورة."],
  خوف: ["خوفك مفهوم.", "منطقي تكوني خايفة."],
  وحدة: ["الشعور إنك لحالك صعب.", "صعب لما تحسي إنه ما في حدا."],
  وجع: ["اللي صار وجعك، وهاد مفهوم."],
  ضيق: ["واضح إنك مخنوقة."],
  حيرة: ["مفهوم إنك محتارة."],
  "": ["سامعتك.", "فهمت عليكِ.", "مكمّلة معك."],
};

function opener(memory) {
  const list = OPENERS[memory.feeling] || OPENERS[""];
  const fresh = list.find((o) => !memory.usedOpeners.has(o)) || "";
  if (fresh) memory.usedOpeners.add(fresh);
  return fresh; // "" when all were used: no repeated sympathy line
}

const aboutPerson = (memory) => (memory.person ? ` مع ${memory.person}` : "");

/** Ideas for "steps", each tagged so a constraint or a refusal removes it. */
const OPTIONS = [
  { id: "write", text: "تكتبي لحالك متى صار الإشي وشو انقال، بمكان ما حدا بيوصله.", needs: [], not: ["monitored"] },
  { id: "trusted", text: "تختاري شخص واحد بتثقي فيه وتحكيله شوي من اللي صاير.", needs: [], not: ["noTrusted", "familyUnsafe"] },
  { id: "lawyer", text: "تحكي مع محامية تشرحلك خياراتك قبل ما تاخدي أي قرار.", needs: ["lawyer"], not: [] },
  { id: "support", text: "تشوفي جهات الدعم بصفحة «مين بيساعدني».", needs: ["contacts"], not: [] },
  { id: "pause", text: "تاخدي وقت قبل أي قرار كبير، ما في إشي لازم ينحسم اليوم.", needs: [], not: [] },
  { id: "quickexit", text: "إذا حدا بيشوف تلفونك، زر «خروج سريع» بيخبّي التطبيق بلحظة.", needs: [], not: [], only: ["monitored"] },
];

/**
 * A short local reply that answers what she needs. Never a legal fact, never a promise.
 * @param {"listen"|"understand"|"steps"} need
 * @param {ReturnType<typeof createMemory>} memory
 * @param {{lawyer?: boolean, contacts?: boolean}} available  what the app can really offer now
 */
export function localTalk(need, memory, available = {}) {
  const open = opener(memory);
  if (need === "listen") {
    return {
      kind: "talk",
      lead: [open, `كمّلي، أنا سامعة كل اللي بدك تحكيه${aboutPerson(memory)}.`].filter(Boolean).join(" "),
      options: [],
      ask: "",
      note: "",
    };
  }
  if (need === "steps") {
    const options = OPTIONS.filter(
      (o) =>
        !memory.rejected.has(o.id) &&
        o.needs.every((n) => available[n]) &&
        !o.not.some((c) => memory.constraints.has(c)) &&
        (!o.only || o.only.some((c) => memory.constraints.has(c))),
    )
      // what answers her stated situation first («تلفوني مراقب» -> the quick-exit button)
      .sort((x, y) => Number(Boolean(y.only)) - Number(Boolean(x.only)))
      .slice(0, 3);
    memory.lastOptionIds = options.map((o) => o.id);
    return {
      kind: "talk",
      lead: [open, "في كم إشي صغير ممكن يساعدوا، اختاري اللي بيناسبك:"].filter(Boolean).join(" "),
      options: options.map((o) => o.text),
      ask: memory.person ? "شو أكتر إشي بيضغط عليكِ هلأ بالموضوع؟" : "مع مين المشكلة بالزبط؟",
      note: "",
    };
  }
  // understand: reflect one detail she gave, then ONE question about what we do not know yet
  const ask = !memory.person
    ? "شو اللي صاير معك؟"
    : memory.lastAsk !== "since"
      ? "من إيمتى صاير هاد؟"
      : "بدك نفكر سوا بخطوة، ولا بدك تحكي أكتر؟";
  memory.lastAsk = ask.includes("إيمتى") ? "since" : "detail";
  return {
    kind: "talk",
    lead: [open, memory.person ? `فهمت إن الموضوع${aboutPerson(memory)}.` : ""].filter(Boolean).join(" ") || "سامعتك.",
    options: [],
    ask,
    note: "",
  };
}

/**
 * What may be sent to the AI provider as context (only if she agreed): the last turns and the
 * constraints she stated. Never her name, phone, account or the lawyer chat.
 */
export function contextFor(memory) {
  return {
    mode: memory.mode || "",
    person: memory.person || "",
    constraints: [...memory.constraints].map((c) => CONSTRAINT_LABELS[c]).slice(0, CONTEXT.facts),
    rejected: [...memory.rejected].slice(0, CONTEXT.facts),
    turns: memory.turns.slice(-CONTEXT.turns),
  };
}
