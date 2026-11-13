import { tokenize } from "./normalize.js";
import { detectIntents } from "./detect.js";

/**
 * Working memory for ONE chat session (Layer A): who she talks about, what happened, when, what the
 * conversation is about, what we already asked and what she already answered.
 *
 * Rules this module keeps:
 *   - It stores only what SHE said, tagged as her report (`source: "user"`). Nothing here is a finding
 *     of fact, and nothing is inferred beyond the words (a "he" is resolved to a person only when there
 *     is exactly one candidate; otherwise the reply asks).
 *   - It lives in RAM inside the answerer's memory: wiped with the chat, by quick exit and on reload.
 *     Saving across visits is a separate, opt-in step (src/ai/saved.js) that copies only short labels.
 *   - Fixed vocabulary, offline, deterministic: the same words always give the same reading.
 */

const norm = (s) => tokenize(s).join(" ");
/** Leading particles: و (and), ف (so), ب (in/with), ل (to), مع is a separate word. */
const strip = (w) => w.replace(/^(?:و|ف)/, "").replace(/^(?:ل|ب)(?=(?:اخ|اب|ام|اه|جوز|زوج|صاحب|طليق|خطيب|حما|مدير))/, "");

/**
 * People she may mention, by the word she uses. `label` is how the reply refers back to them,
 * `g` is the grammatical gender used to resolve «هو / هي / حكى / حكت» ("pl" for a group).
 */
const PEOPLE = {
  جوزي: { id: "husband", label: "جوزك", g: "m" },
  زوجي: { id: "husband", label: "جوزك", g: "m" },
  طليقي: { id: "ex", label: "طليقك", g: "m" },
  خطيبي: { id: "fiance", label: "خطيبك", g: "m" },
  ابوي: { id: "father", label: "أبوكِ", g: "m" },
  بابا: { id: "father", label: "أبوكِ", g: "m" },
  امي: { id: "mother", label: "إمك", g: "f" },
  ماما: { id: "mother", label: "إمك", g: "f" },
  اخوي: { id: "brother", label: "أخوكِ", g: "m" },
  اختي: { id: "sister", label: "أختك", g: "f" },
  اهلي: { id: "family", label: "أهلك", g: "pl" },
  حماتي: { id: "mil", label: "حماتك", g: "f" },
  حماي: { id: "fil", label: "حماكِ", g: "m" },
  سلفي: { id: "bil", label: "سلفك", g: "m" },
  مديري: { id: "boss", label: "مديرك", g: "m" },
  صاحبتي: { id: "friend", label: "صاحبتك", g: "f" },
  صديقتي: { id: "friend", label: "صاحبتك", g: "f" },
  عمي: { id: "uncle", label: "عمك", g: "m" },
  خالي: { id: "uncle-m", label: "خالك", g: "m" },
};
/** The lawyer she may have seen: a person in the story, never "the app's lawyer". */
const LAWYER = { المحاميه: { id: "lawyer", label: "المحامية", g: "f" }, محاميه: { id: "lawyer", label: "المحامية", g: "f" }, المحامي: { id: "lawyer-m", label: "المحامي", g: "m" } };

/**
 * Things that happen in these stories. `re` runs on normalised text; `subj` is the person who did it
 * when the verb form says so ("m" / "f" / "pl"), `me` means she did it herself.
 * `say` builds the reflection in the second person for each subject gender.
 */
const EVENTS = [
  { type: "threat-kids", topic: "custody", re: /(?:^| )(?:ياخد|ياخذ|ياخدوا|ياخذوا|تاخد|يحرمني من|يحرموني من) (?:الولاد|ولادي|البنات|الاولاد)(?= |$)/, say: { m: "هددك ياخد الولاد", f: "هددتك تاخد الولاد", pl: "هددوكِ ياخدوا الولاد", x: "في تهديد إنه ياخدوا الولاد" } },
  { type: "took-kids", topic: "custody", re: /(?:^| )(?:و)?(?:اخد|اخذ|خد|اخدوا|اخذوا) (?:الولاد|ولادي|البنات|الاولاد)/, say: { m: "أخد الولاد", f: "أخدت الولاد", pl: "أخدوا الولاد", x: "الولاد انأخدوا منك" } },
  { type: "threat", topic: "violence", re: /(?:^| )(?:و|ف)?(?:بي|عم ي|ي|رح ي)?هدد(?:ني|وني|تني)(?= |$)/, say: { m: "هددك", f: "هددتك", pl: "هددوكِ", x: "في حدا هددك" } },
  { type: "divorced", topic: "divorce", re: /(?:^| )(?:و)?طلقني(?= |$)/, say: { m: "طلقك", f: "طلقك", pl: "طلقك", x: "صار طلاق" } },
  { type: "kicked-out", topic: "divorce", re: /(?:^| )(?:و)?(?:طردني|طردوني|طلعني من البيت|طلعوني من البيت)(?= |$)/, say: { m: "طردك من البيت", f: "طردتك من البيت", pl: "طردوكِ من البيت", x: "انطردتي من البيت" } },
  { type: "hit", topic: "violence", re: /(?:^| )(?:و)?(?:ضربني|بيضربني|ضربوني|بيضربوني|ضربتني)(?= |$)/, say: { m: "ضربك", f: "ضربتك", pl: "ضربوكِ", x: "في حدا ضربك" } },
  { type: "no-support", topic: "nafaqa", re: /(?:^| )(?:ما|مش) (?:بيصرف|عم يصرف|بيدفع|عم يدفع|بيعطيني|دفع|صرف)(?= |$)/, say: { m: "ما بيصرف عليكِ", f: "ما بتصرف عليكِ", pl: "ما بيصرفوا عليكِ", x: "ما في مصروف" } },
  { type: "money-held", topic: "money", re: /(?:^| )(?:ماسك|ماسكه|ماسكين|اخد|اخذ) (?:المصاري|مصاريي|راتبي|فلوسي)(?= |$)/, say: { m: "ماسك المصاري", f: "ماسكة المصاري", pl: "ماسكين المصاري", x: "المصاري مش بإيدك" } },
  { type: "yelled", topic: "conflict", re: /(?:^| )(?:و)?(?:صرخ|بيصرخ|بيصرخوا|عم يصرخ|صرخوا)(?= |$)/, say: { m: "صرخ عليكِ", f: "صرخت عليكِ", pl: "صرخوا عليكِ", x: "في صراخ" } },
  { type: "insulted", topic: "conflict", re: /(?:^| )(?:و)?(?:بيهينني|بيذلني|بيسبني|بيشتمني|بيحقرني|بيهينوني|هانني)(?= |$)/, say: { m: "بيهينك", f: "بتهينك", pl: "بيهينوكِ", x: "في إهانة" } },
  { type: "silenced", topic: "conflict", re: /(?:^| )(?:و)?(?:بيسكتني|بسكتني|بيسكتوني)(?= |$)/, say: { m: "بيسكّتك كل ما تحكي", f: "بتسكّتك", pl: "بيسكّتوكِ", x: "ما حدا بيخليكِ تحكي" } },
  { type: "not-understood", topic: "conflict", re: /(?:^| )(?:مش|ما) (?:فاهم|فاهمين|بيفهم|بيفهموا) علي(?= |$)/, say: { m: "مش فاهم عليكِ", f: "مش فاهمة عليكِ", pl: "مش فاهمين عليكِ", x: "ما حدا فاهم عليكِ" } },
  { type: "pressure", topic: "family", re: /(?:^| )(?:ضاغطين|ضاغط|ضاغطه|بيضغطوا|بيضغط|عم يضغطوا) علي(?= |$)/, say: { m: "ضاغط عليكِ", f: "ضاغطة عليكِ", pl: "ضاغطين عليكِ", x: "في ضغط عليكِ" } },
  { type: "broke", topic: "violence", re: /(?:^| )(?:و)?(?:كسر|بيكسر|كسروا|كسرت) (?!الباب)(?:صحن|صحون|اغراض|الاغراض|التلفون|تلفوني|الشباك|اشي|اشيا|كل اشي|الصحون)(?= |$)/, say: { m: "كسّر أغراض", f: "كسّرت أغراض", pl: "كسّروا أغراض", x: "في أغراض انكسرت" } },
  { type: "kids-scared", topic: "", re: /(?:^| )(?:و)?(?:الولاد|ولادي|البنات|الاولاد) (?:خافوا|خايفين|انرعبوا|بيعيطوا|عيطوا)(?= |$)/, say: { m: "الولاد خافوا", f: "الولاد خافوا", pl: "الولاد خافوا", x: "الولاد خافوا" }, noSubject: true },
  { type: "helped", topic: "", re: /(?:^| )(?:و)?(?:ساعدتني|ساعدني|ساعدوني|وقفت معي|وقف معي|وقفوا معي)(?= |$)/, say: { m: "ساعدك", f: "ساعدتك", pl: "ساعدوكِ", x: "في حدا ساعدك" } },
  { type: "talked-to", topic: "", re: /(?:^| )(?:و)?(?:حكى|حكت|حكيوا|حكوا) (?:معه|معها|معهم|مع)(?= |$)/, say: { m: "حكى مع", f: "حكت مع", pl: "حكوا مع", x: "صار حكي مع" } },
];

/** A denial right before an event («ما ضربني», «عمره ما هددني», «ولا مرة ضربني»). */
// one word between at most («ما حدا بيضربني»), as in danger.js, so «ما بعرف ليش بيضربني» stays an event
// «كل ما» means "whenever" («كل ما أحكي بيسكتني»), never a denial
const NEGATED = /(?:^|(?<!كل) )(?:ما|مش|مو|ولا|عمره ما|عمرو ما|ابدا ما|بطل)(?: [^ ]+)?$/;
/** Events whose own wording is negative («ما بيصرف», «مش فاهم علي»): the negation is the event. */
const ev_isNegativeForm = (ev) => ev.type === "no-support" || ev.type === "not-understood";
/** Habitual / present forms («بيصرخ», «عم يهددني») are said back in the present. */
const HABIT = /^(?: )?(?:و|ف)?(?:بي|عم ي|عم )/;
const NOW = {
  yelled: { m: "بيصرّخ عليكِ", f: "بتصرّخ عليكِ", pl: "بيصرّخوا عليكِ" },
  hit: { m: "بيضربك", f: "بتضربك", pl: "بيضربوكِ" },
  threat: { m: "بيهددك", f: "بتهددك", pl: "بيهددوكِ" },
};

/** Things SHE did: progress worth noticing («اليوم حكيت مع المحامية»). */
const PROGRESS = [
  { type: "lawyer", re: /(?:^| )(?:حكيت|رحت|شفت|تواصلت|قعدت|زرت|اتصلت) (?:مع |ع |عند |ل|على )?(?:ال)?محامي(?:ه)?(?= |$)/ },
  { type: "complaint", re: /(?:^| )(?:قدمت|رفعت|سجلت|عملت) (?:شكوى|قضيه|دعوى|بلاغ)(?= |$)/ },
  { type: "told-someone", re: /(?:^| )(?:حكيت|خبرت|قلت) (?:ل|مع )?(?:اختي|امي|اخوي|صاحبتي|اهلي|حدا)(?= |$)/ },
  { type: "support-org", re: /(?:^| )(?:اتصلت|تواصلت|رحت) (?:ع|على|مع|ل)?(?:ال)?(?:جمعيه|مؤسسه|مركز|خط)(?= |$)/ },
];

/** When it happened. A frequency or a duration answers «من إيمتى؟». */
const WHEN = [
  { when: "yesterday", re: /(?:^| )(?:مبارح|امبارح|البارحه|مبارحه)(?= |$)/ },
  { when: "today", re: /(?:^| )(?:اليوم|هلا|هلق|الصبح|العصر|الليله|اليوم الصبح)(?= |$)/ },
  { when: "since", re: /(?:^| )(?:من|صرلي|صرلو|صارلي|صارلو) (?:سنه|سنتين|سنين|شهر|شهرين|شهور|اسبوع|اسبوعين|زمان|فتره|مده|يوم|يومين|ايام|[0-9٠-٩]+)(?= |$)/ },
  { when: "often", re: /(?:^| )(?:كل (?:يوم|ليله|شهر|اسبوع|مره|ما)|دايما|دايمن|على طول|عطول|كتير مرات)(?= |$)/ },
  { when: "first", re: /(?:^| )(?:اول مره|لاول مره|ما صار قبل)(?= |$)/ },
];

/** What she wants (her goal), in her words. */
// the negated forms come first: «ما بدي أتطلق» must never read as «بدي أتطلق»
const GOALS = [
  { goal: "stay", re: /(?:^| )(?:بدي|حابه) (?:اضل|نضل|اكمل) (?:معه|سوا)(?= |$)|(?:^| )(?:ما|مش) (?:بدي|حابه) (?:اتطلق|انفصل|اخرب البيت|اتركه)(?= |$)/ },
  { goal: "keep-kids", re: /(?:^| )بدي (?:الولاد|ولادي) (?:يضلوا|يضل|يكونوا) معي(?= |$)|(?:^| )ما بدي (?:اخسر|اترك) (?:الولاد|ولادي)(?= |$)/ },
  { goal: "separate", re: /(?:^| )(?<!(?:ما|مش) )بدي (?:اتطلق|انفصل|اطلق|اترك البيت|اتركه)(?= |$)/ },
  { goal: "calm", re: /(?:^| )بدي (?:بس )?(?:يهدى|يهدا|يهدي|يتغير|يرجع زي ما كان|نرجع زي اول)(?= |$)/ },
  { goal: "know-rights", re: /(?:^| )بدي اعرف (?:حقي|حقوقي|شو حقي)(?= |$)/ },
  { goal: "safety", re: /(?:^| )بدي (?:اكون بامان|اتحمى|حدا يحميني)(?= |$)/ },
  { goal: "money", re: /(?:^| )بدي (?:مصروف|نفقه|مصاري للولاد)(?= |$)/ },
];

/** Topic names said to her (and used for saved threads). */
export const TOPIC_LABELS = {
  custody: "الحضانة والولاد",
  nafaqa: "النفقة والمصروف",
  divorce: "الطلاق",
  violence: "العنف والتهديد",
  blackmail: "الابتزاز",
  privacy: "نشر الصور",
  family: "ضغط الأهل",
  conflict: "مشاكل بالبيت",
  money: "المصاري",
  inherit: "الميراث",
};
const INTENT_TOPIC = { custody: "custody", nafaqa: "nafaqa", divorce: "divorce", blackmail: "blackmail", privacy: "privacy", porn: "privacy", violence: "violence", inherit: "inherit" };
/** Topics that can be ASKED as law (the corpus has articles for them). */
export const LEGAL_TOPICS = ["custody", "nafaqa", "divorce", "blackmail", "privacy", "inherit"];

/** A fresh situation for one session. */
export function createSituation() {
  return {
    turn: 0,
    people: [], // {id, label, g, firstTurn, lastTurn}
    events: [], // {type, who (person id or ""), whoLabel, when, turn, source: "user", detail}
    progress: [], // {type, turn}
    topics: [], // topic ids, most recent last
    goal: "",
    answered: new Set(), // slots she answered: "since", "who", "goal", "repeat", "help"
    asked: new Set(), // slots we asked (never the same one twice)
    offered: new Set(), // option ids already suggested
    shownArticles: new Set(),
    corrections: 0,
    pending: null, // {slot, about}: what our last question was about
    newThisTurn: { events: [], people: [], progress: [], correction: null, ambiguous: null, unknownRef: null, topicSwitch: "" },
  };
}

const findPerson = (s, id) => s.people.find((p) => p.id === id);

function touchPerson(s, def) {
  let p = findPerson(s, def.id);
  if (!p) {
    p = { id: def.id, label: def.label, g: def.g, firstTurn: s.turn, lastTurn: s.turn };
    s.people.push(p);
  } else p.lastTurn = s.turn;
  return p;
}

/** People named in the text, in order (with «لأختي», «وجوزي» prefixes). Lawyer included. */
function namedPeople(t) {
  const out = [];
  for (const raw of t.split(" ")) {
    const w = strip(raw);
    const def = PEOPLE[w] || LAWYER[raw] || LAWYER[w];
    if (def && !out.some((d) => d.id === def.id)) out.push(def);
  }
  return out;
}

/** The person a «he / she / they» points to, or an ambiguity / unknown marker. */
function resolve(s, g, exclude = []) {
  const recent = s.people
    .filter((p) => p.g === g && !exclude.includes(p.id) && p.id !== "lawyer" && p.id !== "lawyer-m")
    .sort((a, b) => b.lastTurn - a.lastTurn);
  if (recent.length === 0) return { unknown: true };
  if (recent.length > 1 && recent[0].lastTurn - recent[1].lastTurn <= 1) return { ambiguous: [recent[0], recent[1]] };
  return { person: recent[0] };
}

/** Gender of the subject from the verb form / pronoun in the text (for unnamed subjects). */
function subjectGender(t, type) {
  if (/(?:^| )هي(?= |$)/.test(t)) return "f";
  if (/(?:^| )هو(?= |$)/.test(t)) return "m";
  if (/(?:^| )(?:هم|همه)(?= |$)/.test(t)) return "pl";
  const female = /(?:^| )(?:و)?(?:حكت|قالت|ساعدتني|هددتني|ضربتني|طردتني|اخدت|اخذت|وقفت معي)(?= |$)/;
  const plural = /(?:^| )(?:و)?(?:حكوا|حكيوا|قالوا|ساعدوني|هددوني|ضربوني|طردوني|اخدوا|اخذوا|ضاغطين|بيضغطوا|بيهينوني|بيسكتوني|ياخدوا|ياخذوا|وقفوا معي)(?= |$)/;
  if (female.test(t)) return "f";
  if (plural.test(t)) return "pl";
  // the remaining verb forms in EVENTS are masculine 3rd person
  return type ? "m" : "";
}

/** Object pronoun after «مع / على»: «حكت معه» = with HIM. */
function objectGender(t) {
  if (/(?:^| )(?:معه|معو|عليه|الو|إله)(?= |$)/.test(t)) return "m";
  if (/(?:^| )(?:معها|عليها|الها|إلها)(?= |$)/.test(t)) return "f";
  if (/(?:^| )(?:معهم|عليهم)(?= |$)/.test(t)) return "pl";
  return "";
}

/** «لا، قصدي أختي» / «مش جوزي، أخوي»: the new person replaces the old one in what she just told. */
function readCorrection(s, t, named) {
  const qasdi = /(?:^| )قصدي (?:انا )?([^ ]+)/.exec(t);
  const notX = /(?:^| )(?:مش|مو) ([^ ]+)/.exec(t);
  let to = qasdi ? PEOPLE[strip(qasdi[1])] : null;
  let from = notX ? PEOPLE[strip(notX[1])] : null;
  if (!to && from) to = named.find((d) => d.id !== from.id) || null;
  if (!to) return null;
  if (!from) {
    // «لا قصدي أختي»: the person of the last event of a DIFFERENT person
    const last = [...s.events].reverse().find((e) => e.who && e.who !== to.id);
    from = last ? Object.values(PEOPLE).find((d) => d.id === last.who) : null;
  }
  if (!from || from.id === to.id) return null;
  return { from, to };
}

/**
 * Read one message of hers into the situation. Returns what is new this turn (also kept in
 * `situation.newThisTurn`) so the reply can reflect it.
 * @param {ReturnType<typeof createSituation>} s
 * @param {string} text
 */
export function observe(s, text) {
  s.turn++;
  const t = norm(text);
  const fresh = { events: [], people: [], progress: [], correction: null, ambiguous: null, unknownRef: null, topicSwitch: "" };
  s.newThisTurn = fresh;
  if (!t) return fresh;

  const named = namedPeople(t);

  // 1) corrections first: they change what was already stored
  if (/(?:^| )(?:لا|لأ|مش|قصدي)(?= |$)/.test(t)) {
    const c = readCorrection(s, t, named);
    if (c) {
      const to = touchPerson(s, c.to);
      for (const e of s.events) if (e.who === c.from.id) Object.assign(e, { who: to.id, whoLabel: to.label, corrected: true });
      const stillUsed = s.events.some((e) => e.who === c.from.id);
      if (!stillUsed) s.people = s.people.filter((p) => p.id !== c.from.id);
      s.corrections++;
      fresh.correction = { from: c.from.label, to: to.label };
    }
  }

  for (const def of named) fresh.people.push(touchPerson(s, def));
  if (named.some((d) => d.id !== "lawyer" && d.id !== "lawyer-m")) s.answered.add("who");

  // 2) when
  const when = WHEN.find((w) => w.re.test(t))?.when || "";
  fresh.when = when;
  if (when) s.answered.add("since"); // a date, a duration or «كل يوم» all answer «من إيمتى؟»
  if (when === "first" || when === "often") s.answered.add("repeat");

  // 3) events, each with its subject: a named person, else resolved from «هو/هي/حكى/حكت»
  const subjectNamed = named.find((d) => d.id !== "lawyer" && d.id !== "lawyer-m" && d.id !== "friend") || named[0];
  // in the order she said them («طلقني وطردني وأخد الولاد»); a denied event («ما ضربني», «عمره ما
  // هددني») is NOT an event: storing it would put words in her mouth
  const matches = EVENTS.map((ev) => ({ ev, at: t.search(ev.re) }))
    .filter((x) => x.at >= 0 && (ev_isNegativeForm(x.ev) || !NEGATED.test(t.slice(0, x.at + 1).trimEnd())))
    .sort((a, b) => a.at - b.at);
  for (const { ev, at } of matches) {
    // a threat to take the kids also counts as a threat: keep the specific one only
    if (ev.type === "threat" && fresh.events.some((e) => e.type === "threat-kids")) continue;
    let who = subjectNamed && !ev.noSubject ? findPerson(s, subjectNamed.id) : null;
    const gender = ev.noSubject ? "" : who?.g || subjectGender(t, ev.type);
    if (!who && gender) {
      const r = resolve(s, gender);
      if (r.person) who = r.person;
      else if (r.ambiguous) fresh.ambiguous = { g: gender, options: r.ambiguous.map((p) => p.label) };
      // «هو صرخ عليها» with no man in the story yet: ask, never guess
      else if (r.unknown && /(?:^| )(?:هو|هي|هم)(?= |$)/.test(t)) fresh.unknownRef = { g: gender, about: "" };
    }
    // «حكى رح ياخد الولاد» right after «جوزي هددني»: the same threat, now with what it was about
    const last = s.events.at(-1);
    if (ev.type === "threat-kids" && last?.type === "threat" && (!who || last.who === who.id) && last.turn >= s.turn - 2) {
      Object.assign(last, { type: "threat-kids", topic: "custody" });
      fresh.events.push(last);
      continue;
    }
    const e = {
      type: ev.type,
      topic: ev.topic,
      who: who?.id || "",
      whoLabel: who?.label || "",
      g: who?.g || gender || "x",
      when,
      turn: s.turn,
      source: "user",
      present: Boolean(NOW[ev.type]) && HABIT.test(t.slice(at, at + 6)),
    };
    if (ev.type === "talked-to") {
      const og = objectGender(t);
      const target = og ? resolve(s, og, who ? [who.id] : []) : null;
      if (target?.person) e.with = target.person.label;
      else if (target?.unknown && og) fresh.unknownRef = { g: og, about: who?.label || "" };
      else if (target?.ambiguous) fresh.ambiguous = { g: og, options: target.ambiguous.map((p) => p.label) };
    }
    // «صرخ عليها»: it happened to someone else, not to her
    if (["yelled", "insulted"].includes(ev.type) && /(?:^| )(?:عليها|عليه|عليهم)(?= |$)/.test(t)) {
      const og = objectGender(t) || "f";
      const target = resolve(s, og, who ? [who.id] : []);
      e.on = target.person?.label || { m: "عليه", f: "عليها", pl: "عليهم" }[og];
    }
    s.events.push(e);
    fresh.events.push(e);
  }
  if (s.events.length > 24) s.events.splice(0, s.events.length - 24);

  // a pronoun with no event («هو كمان») still needs a referent
  if (!fresh.events.length && !named.length && !fresh.ambiguous) {
    const g = subjectGender(t, "");
    if (g) {
      const r = resolve(s, g);
      if (r.ambiguous) fresh.ambiguous = { g, options: r.ambiguous.map((p) => p.label) };
      else if (r.unknown) fresh.unknownRef = { g, about: "" };
    }
  }

  // 4) her own progress
  for (const p of PROGRESS) if (p.re.test(t)) fresh.progress.push({ type: p.type, turn: s.turn }), s.progress.push({ type: p.type, turn: s.turn });

  // 5) goal
  const goal = GOALS.find((g) => g.re.test(t))?.goal;
  if (goal) {
    s.goal = goal;
    s.answered.add("goal");
  }

  // 6) topics: from the keywords and from the events
  const before = s.topics.at(-1) || "";
  const intents = Object.keys(detectIntents(text));
  const found = [...intents.map((i) => INTENT_TOPIC[i]).filter(Boolean), ...fresh.events.map((e) => e.topic).filter(Boolean)];
  for (const topic of found) {
    s.topics = s.topics.filter((x) => x !== topic);
    s.topics.push(topic);
  }
  const now = s.topics.at(-1) || "";
  if (before && now && now !== before && found.length) fresh.topicSwitch = now;

  // 7) her answer to our last question
  if (s.pending?.slot && t.split(" ").length <= 8) s.answered.add(s.pending.slot);
  return fresh;
}

/** The topic the conversation is about now ("" = not known yet). */
export const currentTopic = (s) => s.topics.at(-1) || "";

/** What happened, said back to her in one short clause (her report, never our finding). */
export function eventClause(e) {
  const def = EVENTS.find((x) => x.type === e.type);
  if (!def) return "";
  let verb = (e.present && e.whoLabel && NOW[e.type]?.[e.g]) || def.say[e.whoLabel ? e.g : "x"] || def.say.m;
  // «صرخ عليها»: said about the person it happened to, not «عليكِ»
  if (e.on && verb.includes("عليكِ")) verb = verb.replace("عليكِ", e.on.startsWith("علي") ? e.on : `على ${e.on}`);
  else if (e.on && !e.whoLabel) verb = `${{ yelled: "في حدا صرخ", insulted: "في حدا أهان" }[e.type] || def.say.x} ${e.on.startsWith("علي") ? e.on : `على ${e.on}`}`;
  if (!e.whoLabel) return e.g && e.g !== "x" ? verb : def.say.x;
  if (e.type === "talked-to") return `${e.whoLabel} ${verb}${e.with ? ` ${e.with}` : ""}`.replace(/ مع$/, "");
  return `${e.whoLabel} ${verb}`;
}

/** Join this turn's events into one sentence: «جوزك طلقك وطردك من البيت وأخد الولاد». */
export function reflectEvents(events) {
  if (!events.length) return "";
  const who = events[0].whoLabel;
  const sameWho = events.every((e) => e.whoLabel === who);
  if (sameWho && events.length > 1) {
    const verbs = events.map((e) => {
      const def = EVENTS.find((x) => x.type === e.type);
      return who ? def.say[e.g] || def.say.m : e.g && e.g !== "x" ? def.say[e.g] || def.say.m : def.say.x;
    });
    const list = verbs.length > 1 ? `${verbs.slice(0, -1).join(" و")} و${verbs.at(-1)}` : verbs[0];
    return who ? `${who} ${list}` : list;
  }
  return events.map(eventClause).filter(Boolean).join("، و");
}

/**
 * A short summary of the session for the AI (only with her consent) and for «بتتذكري شو قلتلك؟».
 * Every line is HER report; nothing is stated as a fact.
 * @returns {{topic: string, facts: string[], goal: string, progress: string[]}}
 */
export function summarize(s, max = 6) {
  // one line per thing she told (the same event told twice is one note, with its latest time word)
  const byClause = new Map();
  for (const e of s.events) {
    const clause = eventClause(e);
    if (!clause) continue;
    const when = { yesterday: " (مبارح)", today: " (اليوم)", since: " (من فترة)", often: " (بيتكرر)" }[e.when] || "";
    const prev = byClause.get(clause);
    byClause.delete(clause);
    byClause.set(clause, `${clause}${when || (prev ? prev.slice(clause.length) : "")}`);
  }
  const facts = [...byClause.values()].slice(-max);
  const progress = s.progress.map((p) => ({ lawyer: "حكت مع محامية", complaint: "قدّمت شكوى", "told-someone": "حكت لحدا قريب", "support-org": "تواصلت مع جهة دعم" })[p.type]).filter(Boolean);
  const goal = { "keep-kids": "بدها الولاد يضلوا معها", separate: "بتفكر بالانفصال", stay: "بدها تضل بالبيت", "know-rights": "بدها تعرف حقوقها", safety: "بدها تكون بأمان", money: "بدها مصروف" }[s.goal] || "";
  return { topic: TOPIC_LABELS[currentTopic(s)] || "", facts, goal, progress: [...new Set(progress)] };
}
