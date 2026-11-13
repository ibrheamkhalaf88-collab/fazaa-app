import { tokenize } from "./normalize.js";
import { detectIntents } from "./detect.js";
import { CONTEXT } from "./limits.js";
import { createSituation, currentTopic, LEGAL_TOPICS, observe, reflectEvents, summarize, TOPIC_LABELS } from "./situation.js";

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
const STEPS = ["شو كمان", "غير هيك", "شو اعمل", "شو بعمل", "شو لازم اعمل", "شو بتنصحيني", "شو الحل", "بدي حل", "كيف بتصرف", "شو خياراتي", "شو بقدر اعمل", "ساعديني احل", "كيف اطلع من", "شو الخطوه"];
const LEGAL = ["القانون", "قانونيا", "قانوني", "حقي", "حقوقي", "بيحقلي", "عقوبه", "العقوبه", "عقوبته", "ماده", "الماده", "المحكمه", "محكمه", "شكوى", "اشتكي", "قضيه", "مسموح", "ممنوع قانونيا", "سن الزواج", "بيعاقب", "شو بيقول"];
const UNDERSTAND = ["ليش", "مش فاهمه", "طبيعي", "انا غلطانه", "غلطي", "هل هاد", "شو يعني"];
const QUESTION_WORDS = ["شو", "كيف", "هل", "بقدر", "بيصير", "اذا", "متى", "وين"];
const FAMILY_INTENTS = ["nafaqa", "divorce", "custody", "inherit"];
const CYBER_INTENTS = ["blackmail", "privacy", "porn"];

/** «مش عارفة شو أعمل» is being lost, not (yet) a request for steps. */
const LOST = /(?:^| )(?:و)?(?:مش عارفه|مش عارف|ما بعرف|ما عدت عارفه)(?: (?:شو|مع مين|لمين|كيف))/;
const LOST_FULL = /(?:مش عارفه|مش عارف|ما بعرف|ما عدت عارفه) (?:شو (?:اعمل|بعمل|لازم اعمل)|كيف بتصرف)/g;
/** She asks how to help someone else («كيف بساعدها؟»). */
export const HELP_OTHER = /(?:^| )(?:كيف|شو) (?:بساعدها|اساعدها|بقدر اساعدها|بعملها|اعملها|بساعدهم|اساعدهم)(?= |$)/;
const YES = /^(?:اه|ايوه|ايوا|اي|نعم|اكيد|صح|بالزبط|طبعا|يعني اه|ماشي|تمام)(?: |$)/;
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
  بخاف: "خوف",
  قلقانه: "خوف",
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
    dangerKind: "", // "violence" | "selfharm" | "forced" after a danger reply (chooses the safety plan)
    minor: false, // she said she is under 18 (kept for the session: «عمري 16» then «جايبين عريس»)
    situation: createSituation(), // people, events, time, topics, asked/answered (src/ai/situation.js)
    carried: [], // short notes from a saved topic she chose to continue (her earlier report)
    newConstraints: [], // constraints she stated in THIS message (acknowledged once)
    justRejected: false, // she just refused one of our ideas
    newGoal: "", // a goal she stated in THIS message
    quietTurns: 0, // replies in a row without a question (after 3, one gentle check-in)
  };
}

/** Forget everything (wipe, quick exit, region change). */
export function clearMemory(memory) {
  Object.assign(memory, createMemory());
}

/** Read what she said into the memory: constraints, who, feeling, corrections. */
export function remember(memory, text) {
  const t = norm(text);
  memory.newConstraints = [];
  const rejectedBefore = memory.rejected.size;
  for (const [id, phrases] of Object.entries(CONSTRAINTS))
    if (has(t, phrases) && !memory.constraints.has(id)) memory.constraints.add(id), memory.newConstraints.push(id);
  // an explicit correction replaces the earlier fact («لا، قصدي أختي»)
  const correction = /(?:^| )قصدي (?:انا )?([^ ]+)/.exec(t);
  const words = t.split(" ");
  const said = words.map((w) => w.replace(/^و/, "")).find((w) => PEOPLE[w]);
  if (correction && PEOPLE[correction[1]]) memory.person = PEOPLE[correction[1]];
  else if (said) memory.person = PEOPLE[said];
  const feel = words.find((w) => FEELINGS[strip1(w)]);
  if (feel) memory.feeling = FEELINGS[strip1(feel)];
  memory.feelingNow = feel ? FEELINGS[strip1(feel)] : ""; // a sympathy line only for what she says NOW
  // her age, if she says it: a minor stays a minor for the whole session («عمري 16» … «جايبين عريس»)
  const age = /(?:^| )(?:عمري|انا عمري|صار عمري)(?: [^ ]+)? ([0-9٠-٩]{1,2})(?: |$)/.exec(t);
  if (age) memory.minor = Number(age[1].replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))) < 18;
  else if (/(?:^| )(?:قاصر|قاصره|بالمدرسه|بالصف|بالتوجيهي|طالبه بمدرسه)(?: |$)/.test(t)) memory.minor = true;
  if (has(t, LISTEN)) memory.mode = "listen";
  if ((has(t, STEPS) && !LOST.test(t)) || has(t, LEGAL)) memory.mode = "";
  // she refused one of the ideas we just gave: never suggest it again this session
  if (memory.lastOptionIds?.length && /(?:^| )(?:ما بقدر|مش امن|مستحيل|ما بنفع|ما بزبط|ما في)(?: |$)/.test(t)) {
    for (const [id, cue] of Object.entries(REFUSAL_CUES))
      if (memory.lastOptionIds.includes(id) && cue.test(t)) memory.rejected.add(id);
  }
  // a constraint that rules out an idea we just gave counts as refusing it («ما بقدر أحكي لحدا»)
  if (memory.lastOptionIds?.includes("trusted") && (memory.newConstraints.includes("noTrusted") || memory.newConstraints.includes("familyUnsafe")))
    memory.rejected.add("trusted");
  memory.justRejected = memory.rejected.size > rejectedBefore;
  const goalBefore = memory.situation.goal;
  observe(memory.situation, text);
  memory.newGoal = memory.situation.goal !== goalBefore ? memory.situation.goal : "";
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
  if (HELP_OTHER.test(t)) return "steps";
  if (has(t.replace(LOST_FULL, " "), STEPS)) return "steps";
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
};

const strip1 = (w) => (FEELINGS[w] ? w : w.replace(/^(?:و|ف)/, ""));

function opener(memory) {
  const list = OPENERS[memory.feelingNow] || ACKS;
  const fresh = list.find((o) => !memory.usedOpeners.has(o)) || "";
  if (fresh) memory.usedOpeners.add(fresh);
  return fresh; // "" when all were used: no repeated sympathy line
}

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
  const s = memory.situation;
  const fresh = s.newThisTurn;
  const topic = currentTopic(s);
  const t = norm(memory.turns.filter((x) => x.role === "user").at(-1)?.text || "");
  const lead = [];

  // 1) what changed: a correction, her own progress, what happened (said back in her terms)
  if (fresh.correction) lead.push(`تمام، صححتيلي: الموضوع مع ${fresh.correction.to} مش مع ${fresh.correction.from}.`);
  const progress = fresh.progress[0]?.type;
  if (progress) lead.push(PROGRESS_ACK[progress]);
  const events = fresh.events.filter((e) => e.type !== "talked-to" || e.with);
  const reflected = !fresh.correction && events.length ? reflectEvents(events) : "";
  if (reflected) lead.push(`فهمت إنه ${reflected}${whenWords(events[0].when)}.`);
  const empathy = progress ? "" : empathyFor(events, memory);
  if (empathy) lead.push(empathy);
  // what she just told about herself: a refusal, what she wants, what she cannot do
  if (memory.justRejected) lead.push("مفهوم، مش رح أقترح هالفكرة مرة تانية.");
  if (memory.newGoal && GOAL_ACK[memory.newGoal]) lead.push(GOAL_ACK[memory.newGoal]);
  const limit = memory.newConstraints.find((c) => CONSTRAINT_ACK[c]);
  if (limit && !memory.justRejected) lead.push(CONSTRAINT_ACK[limit]);
  if (!events.length && fresh.when === "since" && !lead.length) lead.push("يعني صارله وقت، مش إشي جديد.");
  if (!lead.length && need !== "steps") {
    const open = WHO_TO_TALK.test(t) ? "" : opener(memory);
    if (open) lead.push(open);
  }
  if (WHO_TO_TALK.test(t))
    lead.push("منيح إنك كتبتي. أنا مساعدة رقمية، بس بقدر أسمعك وأساعدك ترتبي أفكارك، وبنقدر نفكر سوا مين ممكن يكون آمن تحكي معه.");

  if (need === "listen") {
    // heard, not advised: no options; a short, varied invitation instead of the same sentence each time
    const invite = pick(memory, LISTEN_INVITES);
    return { kind: "talk", lead: [...lead, invite].filter(Boolean).join(" ") || "كمّلي، عم بسمعك.", options: [], ask: "", note: "" };
  }

  if (need === "steps") return stepsReply(memory, available, lead, topic, t);

  // understand: ONE question about what we do not know yet, never one she already answered
  let q = nextQuestion(memory, topic, fresh, progress, t);
  // after a few replies without a question, one gentle check-in on what she wants from this
  memory.quietTurns = q.ask ? 0 : memory.quietTurns + 1;
  if (!q.ask && memory.quietTurns >= 3) {
    const ask = pick(memory, CHECK_INS);
    if (ask) (q = { slot: "help", ask }), (memory.quietTurns = 0), (memory.lastAsk = "help");
  }
  if (lead.length === 0) lead.push(pick(memory, ACKS) || (q.ask ? "" : "كمّلي، عم بسمعك."));
  return { kind: "talk", lead: lead.filter(Boolean).join(" "), options: [], ask: q.ask, note: "" };
}

const ACKS = ["سامعتك.", "فهمت عليكِ.", "مفهوم.", "كمّلي، عم بسمعك.", "آه، فهمت.", "تمام، كمّلي.", "عم بسمعك."];
const CHECK_INS = [
  "شو أكتر إشي بتحتاجيه هلأ: حدا يسمعك، ولا نفكر سوا بخطوة؟",
  "بتحبي نرتب سوا اللي حكيتيه لهلأ؟",
  "في إشي بدك ياه مني بالزبط هلأ؟",
];
const GOAL_ACK = {
  "keep-kids": "فهمت إنه أهم إشي إلك إنه الولاد يضلوا معك.",
  stay: "فهمت إنك مش بدك تتطلقي، وهاد قرارك.",
  separate: "فهمت إنك بتفكري تنفصلي، وهاد قرارك إنتِ.",
  "know-rights": "تمام، بدك تعرفي حقوقك.",
  calm: "فهمت إنك بدك الوضع يهدى، مش أكتر من هيك.",
  safety: "سلامتك أولاً، وهاد أهم إشي.",
  money: "فهمت إنه المصروف هو الأهم هلأ.",
};
const CONSTRAINT_ACK = {
  noMoney: "مفهوم، رح آخد ببالي إنه ما معك مصاري.",
  noTrusted: "مفهوم إنه ما في حدا قريب بتقدري تحكيله هلأ.",
  monitored: "مفهوم، إذا حدا بيشوف تلفونك لازم ننتبه لأي خطوة.",
  familyUnsafe: "مفهوم، ما رح أقترح إشي بيكشفك قدام أهلك.",
  cannotLeave: "مفهوم إنه الطلعة من البيت مش سهلة إلك.",
  noPhone: "مفهوم إنه التلفون مش إلك لحالك.",
};

/* ---------- pieces of the local reply ---------- */

const WHO_TO_TALK = /(?:^| )(?:مع مين|لمين) (?:احكي|بدي احكي)(?= |$)|(?:^| )ما في حدا احكي معه(?= |$)/;

const PROGRESS_ACK = {
  lawyer: "منيح إنك قدرتِ تحكي مع المحامية.",
  complaint: "خطوة مش سهلة إنك قدّمتي شكوى.",
  "told-someone": "منيح إنك حكيتي لحدا قريب منك.",
  "support-org": "منيح إنك تواصلتي مع جهة دعم.",
};

const LISTEN_INVITES = ["أنا سامعتك، كمّلي إذا بدك.", "خدي وقتك، عم بسمعك.", "احكي اللي بدك ياه، بدون ترتيب.", "كمّلي، أنا معك بالحكي."];

function pick(memory, list) {
  const fresh = list.find((o) => o && !memory.usedOpeners.has(o));
  if (fresh) memory.usedOpeners.add(fresh);
  return fresh || "";
}

function whenWords(when) {
  return { yesterday: " مبارح", today: " اليوم" }[when] || "";
}

/** One line that fits what happened (rotated, never the same twice in a session). */
const EMPATHY = {
  "threat-kids": ["هاد تهديد بيخوّف، وطبيعي تكوني قلقانة على الولاد."],
  "took-kids": ["هاد صعب كتير، وطبيعي تكوني موجوعة وقلقانة."],
  threat: ["التهديد بيخوّف، وخوفك مفهوم."],
  hit: ["ما في إشي بيبرر إنه حدا يأذيكِ."],
  divorced: ["هاد كتير بمرة وحدة."],
  "kicked-out": ["هاد كتير بمرة وحدة."],
  "no-support": ["موضوع المصروف بيضغط كتير، خصوصاً لما في ولاد."],
  "money-held": ["صعب لما المصاري مش بإيدك."],
  yelled: ["مش سهل تعيشي هيك كل يوم."],
  insulted: ["من حقك تنعاملي باحترام."],
  silenced: ["صعب لما ما حدا يخليكِ تكمّلي حكيك."],
  "not-understood": ["صعب لما تحسي إنه أقرب الناس مش فاهم عليكِ."],
  pressure: ["ضغط الأهل تقيل، خصوصاً لما يطوّل."],
  helped: ["منيح إنه كان في حدا جنبك."],
  broke: ["هاد بيخوّف، حتى لو ما في ضرب."],
  "kids-scared": ["طبيعي تكوني قلقانة عليهم."],
};

function empathyFor(events, memory) {
  for (const e of events) {
    if (e.on) continue; // it happened to someone else: no «you» sympathy line
    const line = pick(memory, EMPATHY[e.type] || []);
    if (line) return line;
  }
  return "";
}

/** The questions worth asking per topic, in order. Each is asked at most once per session. */
const SLOTS = {
  custody: [
    ["repeat", (s) => (s.events.some((e) => e.type === "threat-kids") ? "حكى هيك قبل، ولا هاي أول مرة؟" : "")],
    ["what", (s) => (s.events.some((e) => e.topic === "custody") ? "" : "شو اللي صاير بموضوع الولاد بالزبط؟")],
    ["goal", () => "شو أكتر إشي بيقلقك هلأ بموضوع الولاد؟"],
  ],
  violence: [
    ["repeat", () => "صار هيك قبل، ولا هاي أول مرة؟"],
    ["goal", () => "شو أكتر إشي بيخوّفك هلأ؟"],
  ],
  nafaqa: [
    ["since", () => "من إيمتى وقف الصرف؟"],
    ["goal", () => "شو أكتر إشي ضاغط عليكِ هلأ بموضوع المصاري؟"],
  ],
  money: [["goal", () => "شو أكتر إشي ضاغط عليكِ هلأ بموضوع المصاري؟"]],
  divorce: [["goal", () => "شو أكتر إشي محتاجة تفهميه هلأ: حقوقك، ولا الولاد، ولا وين رح تكوني؟"]],
  family: [
    ["about", () => "ضاغطين عليكِ بخصوص شو؟"],
    ["since", () => "من إيمتى صاير هاد؟"],
  ],
  conflict: [
    ["since", () => "من إيمتى صاير هاد؟"],
    ["goal", () => "شو بتتمني يتغير أكتر إشي؟"],
  ],
};
const GENERIC_SLOTS = [
  ["what", (s) => (s.events.length || s.people.length ? "" : "شو اللي صاير معك؟")],
  ["after", (s) => (["yesterday", "today"].includes(s.events.at(-1)?.when) ? "وشو صار بعدها؟" : "")],
  ["since", (s) => (s.events.length ? "من إيمتى صاير هاد؟" : "")],
  ["help", () => "بدك نفكر سوا بخطوة صغيرة، ولا بدك تحكي أكتر؟"],
];

function nextQuestion(memory, topic, fresh, progress, t) {
  const s = memory.situation;
  const choose = (slot, ask) => {
    s.asked.add(slot);
    s.pending = { slot };
    memory.lastAsk = slot;
    return { slot, ask };
  };
  if (fresh.ambiguous) return choose("clarify", `قصدك ${fresh.ambiguous.options[0]} ولا ${fresh.ambiguous.options[1]}؟`);
  if (fresh.unknownRef) {
    const about = fresh.unknownRef.about;
    const verb = { m: "حكى", f: "حكت", pl: "حكوا" }[s.people.find((p) => p.label === about)?.g] || "";
    const pronoun = { m: "هو", f: "هي", pl: "هم" }[fresh.unknownRef.g];
    return choose("clarify", about && verb ? `مع مين ${verb} ${about}؟` : pronoun ? `مين قصدك بـ«${pronoun}»؟` : "مين قصدك؟");
  }
  if (progress === "lawyer") return choose("progress", "إذا بتحبي، احكيلي شو وضّحتلك، وبنشوف سوا شو الخطوة اللي بعدها.");
  if (progress) return choose("progress", "كيف حسّيتي بعدها؟");
  if (WHO_TO_TALK.test(t)) return choose("help", "بتحبي تبلّشي تحكيلي شو اللي شاغل بالك؟");
  if (LOST.test(t) && !s.asked.has("help")) return choose("help", "بتحبي تحكيلي شو اللي صاير، ولا نفكر سوا بخطوة صغيرة؟");
  if (memory.feeling === "خوف" && !fresh.events.length && !s.asked.has("fear")) return choose("fear", "خايفة من شو بالزبط؟");
  for (const [slot, make] of [...(SLOTS[topic] || []), ...GENERIC_SLOTS]) {
    if (s.asked.has(slot) || s.answered.has(slot)) continue;
    const ask = make(s);
    if (ask) return choose(slot, ask);
  }
  memory.lastAsk = "";
  s.pending = null;
  return { slot: "", ask: "" };
}

/** Topic-specific small steps: what protects her most for the least loss. */
const TOPIC_OPTIONS = {
  custody: [
    { id: "no-sign", text: "ما توقّعي على أي ورقة أو تنازل عن الولاد قبل ما تفهمي وضعك من محامية." },
    { id: "kids-docs", text: "إذا بتقدري بأمان، خلي أوراق الولاد (شهادات الميلاد والهويات) بمكان بتوصليله." },
    { id: "write", text: "إذا آمن إلك، اكتبي متى صار التهديد وشو انقال بالزبط، بمكان ما حدا بيوصله.", not: ["monitored"], when: "threat-kids" },
  ],
  nafaqa: [
    { id: "write-money", text: "اكتبي من إيمتى وقف الصرف وقديش كان بيعطي، إذا آمن إلك.", not: ["monitored"] },
    { id: "marriage-docs", text: "خلي عقد الزواج وشهادات ميلاد الولاد بمكان بتوصليله." },
  ],
  divorce: [
    { id: "no-sign", text: "ما توقّعي على أي ورقة أو تنازل قبل ما تفهمي حقوقك." },
    { id: "safe-night", text: "إذا انطردتي من البيت، فكّري وين بتقدري تكوني الليلة بأمان.", when: "kicked-out" },
  ],
  violence: [
    { id: "safe-place", text: "فكّري من هلأ بمكان أو شخص بتقدري تروحيله إذا الوضع زاد." },
    { id: "no-confront", text: "ما تواجهي لحالك إذا هاد ممكن يخلّي الأذى أكبر." },
    { id: "plan", text: "زر «افتحي خطة الأمان» فيه خطوات حسب وضعك." },
  ],
  money: [{ id: "own-docs", text: "خلي هويتك وأوراقك الشخصية بمكان بتوصليله إنتِ." }],
};
const OTHER_OPTIONS = [
  { id: "danger-now", text: "إذا هي بخطر هلأ، سلامتها أولاً: الشرطة أو الإسعاف إذا بتقدر تتصل بأمان." },
  // safety advice first: confronting him on her behalf can make it worse for her
  { id: "no-confront-him", text: "ما تواجهي جوزها عنها، هاد ممكن يزيد الخطر عليها." },
  { id: "listen-her", text: "اسمعيها بدون ما تضغطي عليها تاخد قرار، وخليها تعرف إنه مش ذنبها." },
  { id: "ask-her", text: "اسأليها شو بدها هي، وشو بتحس إنه آمن إلها." },
  { id: "support", text: "إذا بدها، بتقدر تشوف جهات الدعم بصفحة «مين بيساعدني».", needs: ["contacts"] },
];

const allowed = (memory, available) => (o) =>
  !memory.rejected.has(o.id) &&
  (o.needs || []).every((n) => available[n]) &&
  !(o.not || []).some((c) => memory.constraints.has(c)) &&
  (!o.only || o.only.some((c) => memory.constraints.has(c))) &&
  (!o.when || memory.situation.events.some((e) => e.type === o.when));

function stepsReply(memory, available, lead, topic, t) {
  const s = memory.situation;
  const forOther = HELP_OTHER.test(t);
  const pool = forOther
    ? OTHER_OPTIONS
    : [
        ...OPTIONS.filter((o) => o.only), // what answers a stated constraint first («تلفوني مراقب»)
        ...(TOPIC_OPTIONS[topic] || []),
        ...OPTIONS.filter((o) => !o.only),
      ];
  const ok = pool.filter(allowed(memory, available));
  // not the same ideas again when she asks twice: new ones first, then the rest
  const ordered = [...ok.filter((o) => !s.offered.has(o.id)), ...ok.filter((o) => s.offered.has(o.id))];
  // the first (most specific) version of an idea wins
  const options = ordered.filter((o, i) => ordered.findIndex((x) => x.id === o.id) === i).slice(0, 3);
  // every idea that fits was already given: say so instead of pretending these are new
  const nothingNew = options.length > 0 && options.every((o) => s.offered.has(o.id));
  for (const o of options) s.offered.add(o.id);
  memory.lastOptionIds = options.map((o) => o.id);

  const intro = forOther
    ? "إنك بدك تساعديها إشي مهم. في كم إشي ممكن يفرق معها:"
    : nothingNew
      ? "بصراحة، ما عندي أفكار صغيرة جديدة غير اللي حكيناها. إذا بتحكيلي شو أصعب إشي فيهم، بفكر معك بشكل أدق:"
      : pick(memory, ["خلينا نفكر بأصغر خطوة آمنة، بدون ما تخسري إشي مهم:", "في كم إشي صغير ممكن يساعد، اختاري اللي بيناسبك:"]) ||
        "هاي كم فكرة، اختاري اللي بيناسبك:";
  let ask = "";
  if (forOther) ask = "شو بتحسي إنها محتاجة أكتر هلأ؟";
  else if (LEGAL_TOPICS.includes(topic) && !s.asked.has(`offer-law:${topic}`)) {
    ask = `بتحبي أوريكِ شو بيقول القانون عن ${TOPIC_LABELS[topic]} بمنطقتك؟`;
    s.asked.add(`offer-law:${topic}`);
    s.pending = { slot: "offer-law", topic };
    memory.lastAsk = "offer-law";
  } else if (!s.goal && !s.asked.has("protect")) {
    ask = "شو أهم إشي بدك تحميه أول: سلامتك، الولاد، ولا إشي تاني؟";
    s.asked.add("protect");
    s.pending = { slot: "goal" };
    memory.lastAsk = "goal";
  }
  return { kind: "talk", lead: [...lead, intro].join(" "), options: options.map((o) => o.text), ask, note: "" };
}

/**
 * «بتتذكري شو قلتلك؟»: what she told in this session, as HER words, so she can correct it.
 * @returns {object} a talk answer
 */
export function recallReply(memory) {
  const sum = summarize(memory.situation);
  const notes = [...memory.carried, ...sum.facts];
  if (!notes.length && !sum.topic)
    return {
      kind: "talk",
      lead: "لسا ما حكيتيلي تفاصيل بهالمحادثة. أنا ما بتذكر محادثات قديمة إلا إذا إنتِ شغّلتي «تذكّر المواضيع» من الإعدادات.",
      options: [],
      ask: "بتحبي تحكيلي من الأول؟",
      note: "",
    };
  return {
    kind: "talk",
    lead: `هاد اللي فهمته منك${sum.topic ? ` عن ${sum.topic}` : ""}:`,
    options: [...notes.slice(-5), ...(sum.goal ? [`و${sum.goal}.`] : [])],
    ask: "في إشي فهمته غلط؟ صححيني.",
    note: "",
  };
}

/** «صار معي إشي جديد»: she is bringing news; listen first. */
export function newsReply(memory) {
  const topic = TOPIC_LABELS[currentTopic(memory.situation)];
  memory.lastAsk = "news";
  return { kind: "talk", lead: topic ? `أكيد، بموضوع ${topic}؟` : "أكيد.", options: [], ask: "احكيلي شو اللي صار.", note: "" };
}

/**
 * What may be sent to the AI provider as context (only if she agreed): the last turns, the constraints
 * she stated and a short summary of what she told (each line her report, not a fact). Never her name,
 * phone, account or the lawyer chat.
 */
export function contextFor(memory) {
  const sum = summarize(memory.situation, CONTEXT.facts);
  return {
    mode: memory.mode || "",
    person: memory.person || "",
    constraints: [...memory.constraints].map((c) => CONSTRAINT_LABELS[c]).slice(0, CONTEXT.facts),
    rejected: [...memory.rejected].slice(0, CONTEXT.facts),
    topic: sum.topic,
    facts: [...memory.carried, ...sum.facts].slice(-CONTEXT.facts),
    goal: sum.goal,
    progress: sum.progress,
    asked: [...memory.situation.asked].filter((x) => !x.includes(":")).slice(0, CONTEXT.facts),
    turns: memory.turns.slice(-CONTEXT.turns),
  };
}
