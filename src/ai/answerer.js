import { ARTICLES, COURT_NAMES, INTENT_TO_ARTICLES, LAWS, articlesFor } from "../data/law/index.js";
import {
  answeredNo,
  answeredYes,
  classifyNeed,
  clearMemory,
  contextFor,
  createMemory,
  localTalk,
  newsReply,
  pushTurn,
  recallReply,
  remember,
} from "./conversation.js";
import { currentTopic, LEGAL_TOPICS } from "./situation.js";
import { assessDanger, forcedMarriageAnswer } from "./danger.js";
import { findArticleByNumber, findSpecificArticles } from "./legal.js";
import { answerFromRules } from "./rules-engine.js";
import { detectSmallTalk } from "./smalltalk.js";
import { ventingFeeling } from "./companion.js";
import { detectIntents } from "./detect.js";
import { tokenize } from "./normalize.js";

const norm = (s) => tokenize(s).join(" ");

/** «بتتذكري شو قلتلك؟», «حكيتلك قبل»: she asks what we remember. */
const RECALL = /(?:^| )(?:بتتذكري|بتذكري|متذكره|فاكره|حكيتلك قبل|قلتلك قبل|شو قلتلك|شو حكيتلك)(?= |$)/;
/** «صار معي إشي جديد». */
const NEWS = /(?:^| )صار (?:معي )?(?:اشي|شي) جديد(?= |$)|(?:^| )في (?:اشي|شي) جديد(?= |$)/;
/** «بدي نكمل موضوع الحضانة», «نكمل من وين وقفنا». */
const RESUME = /(?:^| )(?:بدي |خلينا )?نكمل(?: (?:موضوع|بموضوع|حكي|حديث|من وين وقفنا|اللي حكينا))?(?= |$)/;
/** «وإذا بغزة؟», «طب بالضفة؟». */
const OTHER_REGION = /(?:^| )(?:ب|في |ف)?((?:ال)?غزه|(?:ال)?ضفه|بالضفه|بغزه)(?= |$)/;
const SHOW_ME = /(?:^| )(?:وريني|فرجيني|ورجيني|بدي اعرف|احكيلي)(?= |$)/;
const TOPIC_WORDS = {
  custody: /حضان|الولاد|ولادي/,
  nafaqa: /نفق|مصروف/,
  divorce: /طلاق|طلق/,
  blackmail: /ابتزاز|بيبتز|صور/,
  violence: /تهديد|عنف|ضرب/,
  family: /اهلي/,
  inherit: /ميراث|ورث/,
  inlaws: /حماتي|اهله|اهل جوزي|السكن/,
  polygamy: /يتجوز|الزواج التاني|ضره/,
};
/** The question a topic stands for, when she says «آه» to «بتحبي أوريكِ شو بيقول القانون؟». */
const TOPIC_QUESTION = {
  custody: "شو حقي بالحضانة؟",
  nafaqa: "شو حقي بالنفقة؟",
  divorce: "شو حقوقي بالطلاق؟",
  blackmail: "شو عقوبة الابتزاز الإلكتروني؟",
  privacy: "شو عقوبة نشر الصور بدون إذن؟",
  inherit: "شو حقي بالميراث؟",
  inlaws: "شو حقي بمسكن لحالي بعيد عن أهله؟",
};

/** She is talking about her own situation (not asking for a recipe or a restaurant). */
const onTopic = (q) =>
  Boolean(ventingFeeling(q)) ||
  Object.keys(detectIntents(q)).length > 0 ||
  /(?:جوزي|زوجي|طليقي|خطيبي|اهلي|أهلي|ابوي|أبوي|اخوي|أخوي|اختي|أختي|حماتي|البيت|ولادي|الولاد|حالي|نفسي|تعبانة|خايفة|زعلانة|مقهورة|بدي|ما بقدر|مش قادرة)/.test(
    q,
  );

/**
 * One entry point for the chat.
 *
 *   1. danger (fixed reviewed text, offline, nothing sent anywhere)
 *   2. answers to our last safety question («لا» after «إنتِ بأمان هلأ؟» is an emergency)
 *   3. greetings
 *   4. what she needs: listen / understand / steps / legal
 *        legal  -> exact article number? the article itself : online AI (grounded) : offline rules
 *        other  -> online AI (talk, no law) : offline talk
 *   5. one gentle safety question when violence was mentioned but not clearly now (once per session)
 *
 * The offline path is both the default and the safety net: no network, no outage, no rejected AI
 * answer can leave her without a response. The session memory lives in RAM only (see conversation.js).
 *
 * @param {{
 *   remote?: {answer(q: string, ctx: object): Promise<object|null>},
 *   isRemoteEnabled?: () => boolean,
 *   shareContext?: () => boolean,       // she agreed to send the last messages as context
 *   onRemoteError?: (err: Error) => void,
 *   emergencyNumbers?: () => {police?: string, ambulance?: string},
 *   available?: () => {lawyer?: boolean, contacts?: boolean, mindLine?: boolean},
 * }} [deps]
 */
export function createAnswerer({
  remote,
  isRemoteEnabled = () => false,
  shareContext = () => false,
  onRemoteError = () => {},
  emergencyNumbers = () => ({}),
  available = () => ({}),
  saved = null, // optional, opt-in saved topics across visits (src/ai/saved.js); null = never persists
} = {}) {
  const memory = createMemory();

  /* ---------- verified texts for a topic (offline), with where they apply ---------- */

  /** Up to `n` articles for this topic that apply in her region, in the curated order. */
  function relatedArticles(topic, country, n = 2) {
    const intent = { privacy: "privacy", blackmail: "blackmail" }[topic] || topic;
    const inRegion = articlesFor(country);
    return (INTENT_TO_ARTICLES[intent] || []).filter((id) => inRegion[id]).slice(0, n);
  }

  /** Which law, court and region the texts come from, and what the corpus does NOT have. */
  function jurisdiction(ids, topic, country) {
    const lines = [];
    const region = "قطاع غزة"; // the app is for Gaza only (2026-11-19)
    const laws = [...new Set(ids.map((id) => ARTICLES[id]?.lawKey))]
      .map((k) => LAWS.find((l) => l.key === k))
      .filter(Boolean);
    if (laws.length) {
      lines.push(`النصوص من ${laws.map((l) => `«${l.name}»`).join(" و")}، حسب منطقتك (${region}).`);
      const courts = [...new Set(laws.map((l) => COURT_NAMES[l.court]).filter(Boolean))];
      if (courts.length) lines.push(`هالقضايا بتنظر فيها ${courts.join(" و")}.`);
      // decree-law issued in Ramallah: whether the Gaza courts apply it is not confirmed yet
      if (laws.some((l) => l.key === "cyber-2018"))
        lines.push("انتبهي: تطبيق قانون الجرائم الإلكترونية بغزة مش مؤكد، فاسألي محامية قبل ما تعتمدي عليه.");
      // both family laws are applied by the sharia courts; which one prevails is a question for the lawyer
      if (
        laws.some((l) => l.key === "family-gaza-1954") &&
        laws.some((l) => l.key === "hanafi-personal-status")
      )
        lines.push("إذا اختلف النصين، المحامية بتقدر تحكيلك أي واحد بتطبقه المحكمة.");
    }
    if (country !== "ps-gaza") lines.push("فزعة هلأ لقطاع غزة بس، فما بعطيكِ نص قانوني لمكان تاني.");
    return lines;
  }

  /** «بدي نكمل موضوع الحضانة»: only from topics she chose to save, never brought up by itself. */
  function resume(question) {
    const t = norm(question);
    const topic = Object.entries(TOPIC_WORDS).find(([, re]) => re.test(t))?.[0] || "";
    if (!saved?.enabled?.()) {
      return {
        kind: "talk",
        lead: "أنا ما بحفظ المحادثات بين الزيارات، لأنه «تذكّر المواضيع» مطفي بالإعدادات. ما في مشكلة، احكيلي باختصار وين وصل الموضوع.",
        options: [],
        ask: "",
        note: "",
      };
    }
    const threads = saved.list();
    const thread = topic ? threads.find((x) => x.topic === topic) : threads.length === 1 ? threads[0] : null;
    if (!thread) {
      return {
        kind: "talk",
        lead: threads.length
          ? "عندي أكتر من موضوع محفوظ. أي واحد بدك نكمل؟"
          : "ما في موضوع محفوظ بهالاسم. احكيلي باختصار وين وصل الموضوع.",
        options: threads.map((x) => x.title),
        ask: "",
        note: "",
      };
    }
    memory.carried = thread.facts.slice(-6);
    memory.situation.topics = [thread.topic];
    if (thread.goal) memory.situation.goal = thread.goal;
    return {
      kind: "talk",
      lead: `أكيد، نكمل بموضوع ${thread.title}. آخر مرة حكيتيلي:`,
      options: thread.facts.slice(-3),
      ask: "صار إشي جديد من وقتها؟",
      note: "",
    };
  }

  /* ---------- after a danger reply (fixed text, see docs/SAFETY-REVIEW.md) ---------- */

  const DANGER_KIND = { immediate: "violence", selfharm: "selfharm", "forced-marriage": "forced" };

  /** Remember which danger reply was given, so her next words are read as an answer to it. */
  function rememberDanger(d) {
    memory.dangerKind = DANGER_KIND[d.level] || memory.dangerKind || "violence";
    memory.lastAsk = memory.dangerKind === "selfharm" ? "alone" : "safe-place";
    return { ...d.answer, sosPlan: memory.dangerKind };
  }

  const isShort = (q) => norm(q).split(" ").filter(Boolean).length <= 4;
  const SAFE_NOW = /(?:^| )(?:صرت بامان|انا بامان|بامان هلا|امنه|راح|طلع|مشي|هدي|نام)(?: |$)/;

  /** Her answer to our safety question; null = it is something else, carry on normally. */
  function dangerFollowUp(question, numbers) {
    const t = norm(question);
    const plan = memory.dangerKind;
    if (plan === "selfharm") {
      if (answeredYes(question) || /(?:^| )لحالي(?: |$)/.test(t)) {
        memory.lastAsk = "";
        return {
          kind: "talk",
          lead: "شكراً إنك حكيتيلي. مش لازم تضلي لحالك مع هالشعور.",
          options: [
            numbers.ambulance
              ? `إذا ممكن تأذي حالك هلأ، اتصلي بالإسعاف ${numbers.ambulance} أو روحي لأقرب طوارئ إذا بتقدري.`
              : "إذا ممكن تأذي حالك هلأ، روحي لأقرب طوارئ إذا بتقدري.",
            "إذا في شخص بتقدري تتصلي فيه أو تروحي عنده هلأ، حتى لو بس ليقعد جنبك.",
            "إذا في إشي حواليكِ ممكن تأذي فيه حالك، بعّديه عنك إذا بتقدري.",
          ],
          ask: "بدك تضلي تحكي معي شوي هلأ؟",
          note: "",
          sos: true,
          sosPlan: "selfharm",
        };
      }
      if (answeredNo(question)) {
        memory.lastAsk = "";
        return {
          kind: "talk",
          lead: "منيح إنه في حدا جنبك.",
          options: [],
          ask: "بتقدري تحكيله إنك تعبانة الليلة؟",
          note: "",
          sos: true,
          sosPlan: "selfharm",
        };
      }
      return null;
    }
    // violence / forced marriage: we asked if she can talk safely.
    // A denial first: «مش آمنة» contains «آمنة» and must never read as "safe".
    if (answeredNo(question) || /(?:^| )(?:مش|ما|مو) ?(?:امنه|بامان)(?: |$)/.test(t))
      return stillUnsafe(numbers, plan);
    if (answeredYes(question) || SAFE_NOW.test(t)) {
      memory.lastAsk = "";
      return {
        kind: "talk",
        lead: "منيح إنك بأمان هلأ. خدي نفس، ما في استعجال.",
        options: [],
        ask: "بدك تحكيلي شو صار، أو نفكر سوا شو بيحميكِ إذا تكرر؟",
        note: "",
        sos: true,
        sosPlan: plan,
      };
    }
    if (isShort(question)) return stillUnsafe(numbers, plan); // unclear short answer: stay on safety
    memory.lastAsk = ""; // a longer message about something else: answer it normally
    return null;
  }

  /** She is still not safe: short, no questions about the past, nothing that keeps her typing. */
  function stillUnsafe(numbers, plan) {
    memory.lastAsk = "safe-place";
    return {
      kind: "talk",
      lead: "خليكِ مركّزة على سلامتك هلأ.",
      options: [
        numbers.police ? `إذا بتقدري تتصلي بأمان، الشرطة ${numbers.police}، حتى لو ما بتقدري تحكي كتير.` : "",
        "إذا الكتابة أو الصوت ممكن يلفت انتباهه، وقّفي هلأ وارجعي لما تكوني بأمان.",
        "زر «خروج سريع» فوق بيخبّي التطبيق بلحظة.",
      ].filter(Boolean),
      ask: "اكتبيلي «آمنة» لما تصيري بأمان.",
      note: "",
      sos: true,
      sosPlan: plan || "violence",
    };
  }

  /** A reply the app adds after violence was mentioned without a clear "now". */
  function withSafetyQuestion(answer, ask, about = "") {
    if (memory.safetyAsked || !ask) return answer;
    memory.safetyAsked = true;
    // each question has its own polarity: «لا» to «إنتِ بأمان؟» is danger, «لا» to «بخطر هلأ؟» is not
    // about someone else: a reminder, not a question to her (keep the question we already asked)
    if (about === "other") {
      return answer.kind === "talk"
        ? { ...answer, options: [ask, ...(answer.options || [])].slice(0, 4), sos: true, sosPlan: "violence" }
        : { ...answer, scope: [...(answer.scope || []), ask], sos: true };
    }
    memory.lastAsk = about === "forced" ? "forced" : about === "family" ? "family" : "safety";
    if (answer.kind === "talk") {
      // the question this reply was going to ask was replaced by the safety one: it was NOT asked
      const s = memory.situation;
      if (answer.ask && s.pending?.slot) s.asked.delete(s.pending.slot);
      s.pending = null;
      return { ...answer, ask, sos: true };
    }
    return { ...answer, safetyAsk: ask, sos: true };
  }

  /** Law answers: limits the app knows about, said next to the answer. */
  function withScope(answer) {
    if (!answer.cites?.length) return answer;
    const extra = [];
    if (memory.constraints.has("monitored"))
      extra.push("إذا حدا بيشوف تلفونك، لا تحفظي أدلة عليه إذا هاد ممكن يعرّضك لخطر.");
    const before = answer.steps || [];
    const steps = memory.constraints.has("monitored")
      ? before.filter((s) => !/صور|احتفظ|وثق|وثّق|احفظ/.test(s))
      : before;
    // only when evidence steps were REMOVED (never on the article-text reply, which has no steps)
    const removedAll = before.length > 0 && steps.length === 0;
    return {
      ...answer,
      steps: removedAll ? ["محامية أو جهة رسمية بتقدر تقلك كيف تحتفظي بالأدلة بأمان"] : steps,
      scope: extra,
    };
  }

  /** «شو بتقول المادة 15؟»: the article itself, or an honest "not in my texts". */
  function articleAnswer(hit, country) {
    if (hit.missing) {
      return {
        kind: "talk",
        lead: hit.outOfRegion.length
          ? `المادة ${hit.number} اللي عندي بقانون بيطبق بمنطقة غير منطقتك، فما رح أعتمد عليها إلك.`
          : `المادة ${hit.number} مش موجودة بالنصوص القانونية اللي عندي.`,
        options: [],
        ask: "بتعرفي من أي قانون هي؟ أو بتحبي تسألي محامية؟",
        note: "",
        general: true,
      };
    }
    return {
      kind: "article",
      lead: hit.ambiguous
        ? `في أكتر من قانون فيه المادة ${hit.number}. هاي النصوص اللي عندي لمنطقتك:`
        : `هاد نص المادة ${hit.number} زي ما هو عندي:`,
      steps: [],
      note: "النص الأصلي تحت. شو بيعني لوضعك بالزبط بيحتاج محامية، لأنه بيعتمد على تفاصيل حالتك.",
      cites: hit.found.slice(0, 4).map((a) => a.id),
      general: false,
      ...(hit.ambiguous ? { ask: "عن أي قانون كنتِ بتسألي؟" } : {}),
      country,
    };
  }

  /** «قديش مدة العدة؟»: the article(s) that answer exactly that, verbatim; or an honest "not for your region". */
  function specificAnswer(spec, country, can) {
    if (!spec.found.length) {
      return {
        kind: "talk",
        lead: spec.outOfRegion.length
          ? `النص اللي عندي عن «${spec.label}» من قانون بيطبق بمنطقة غير منطقتك، فما رح أعتمد عليه إلك.`
          : `ما عندي نص عن «${spec.label}» بقانون منطقتك، وما بدي أعطيكِ معلومة مش متأكدة منها.`,
        options: [],
        ask: can.lawyer ? "بتحبي تسألي محامية شو بيطبق عندك؟" : "",
        note: "",
        general: true,
      };
    }
    return {
      kind: "article",
      lead: `هاد النص اللي بيحكي عن «${spec.label}» بقانون منطقتك، زي ما هو:`,
      steps: [],
      note: "النص الأصلي تحت. شو بيعني لوضعك بالزبط بيحتاج محامية، لأنه بيعتمد على تفاصيل حالتك.",
      cites: spec.found.slice(0, 2).map((a) => a.id),
      general: false,
      country,
    };
  }

  async function online(question, need, ctx) {
    if (!remote || !isRemoteEnabled()) return null;
    try {
      return await remote.answer(question, {
        country: ctx.country,
        need,
        signal: ctx.signal,
        ...(shareContext() ? { context: contextFor(memory) } : {}),
      });
    } catch (err) {
      if (err?.name === "AbortError") throw err; // wiped / quick exit: stop here
      onRemoteError(/** @type {Error} */ (err));
      return null;
    }
  }

  /**
   * A legal question: the exact article when she names one, else the online AI (grounded in retrieved
   * texts), else the offline rules. Then: where the texts apply, verbatim texts for the topic when the
   * answer cites none, and her worry acknowledged when she said she is afraid to ask for her right.
   */
  async function legalAnswer(question, ctx, can, topicHint = "") {
    const hit = findArticleByNumber(question, ctx.country);
    const topic = topicHint || currentTopic(memory.situation);
    // context-aware: «شو حقي إذا ما صرف؟» inside a conversation about maintenance is about maintenance
    const local =
      answerFromRules(question) || (TOPIC_QUESTION[topic] ? answerFromRules(TOPIC_QUESTION[topic]) : null);
    const specific = hit ? null : findSpecificArticles(question, ctx.country);
    let answer;
    if (hit) answer = articleAnswer(hit, ctx.country);
    else if (specific) answer = specificAnswer(specific, ctx.country, can);
    else {
      const remoteAnswer = await online(question, "legal", ctx);
      // the offline rules know some cases are dangerous (blackmail): keep the safety-plan button
      answer = remoteAnswer ? (local?.sos ? { ...remoteAnswer, sos: true } : remoteAnswer) : local;
    }
    if (!answer) {
      answer = {
        kind: "talk",
        lead: "ما عندي نص قانوني بيغطي هالسؤال بالزبط، وما بدي أعطيكِ معلومة مش متأكدة منها.",
        options: [],
        ask: can.lawyer ? "بتحبي تسألي محامية؟" : "بتحبي تحكيلي شو اللي صاير معك أكتر؟",
        note: "",
        general: true,
      };
    }
    answer = withScope(answer);
    if (answer.kind === "article") {
      if (!specific) {
        // an article asked by number: no extra lines, except the warning about the cyber-crimes decree-law
        const caveat = jurisdiction(answer.cites, topic, ctx.country).filter((l) =>
          /الجرائم الإلكترونية/.test(l),
        );
        return caveat.length ? { ...answer, scope: [...(answer.scope || []), ...caveat] } : answer;
      }
      answer.cites.forEach((id) => memory.situation.shownArticles.add(id));
      return {
        ...answer,
        scope: [...(answer.scope || []), ...jurisdiction(answer.cites, topic, ctx.country)],
      };
    }

    let ids = answer.cites || [];
    if (!ids.length && answer.kind !== "talk" && LEGAL_TOPICS.includes(topic)) {
      const related = relatedArticles(topic, ctx.country).filter(
        (id) => !memory.situation.shownArticles.has(id),
      );
      if (related.length) answer = { ...answer, related };
      ids = related;
    }
    ids.forEach((id) => memory.situation.shownArticles.add(id));
    const where = jurisdiction(ids, topic, ctx.country);
    if (where.length) answer = { ...answer, scope: [...(answer.scope || []), ...where] };

    // «بدي أعرف حقي بالنفقة، بس خايفة أطالب فيه»: the worry first, the information after
    if (ventingFeeling(question) === "afraid") {
      answer = { ...answer, lead: `خوفك مفهوم، وما في إشي لازم تقرريه اليوم. ${answer.lead}` };
      const worry = "خايفة من ردة فعل حدا إذا طالبتي بحقك؟";
      if (answer.kind === "talk") answer.ask = answer.ask || worry;
      else if (!answer.safetyAsk) answer.safetyAsk = worry;
    }
    return answer;
  }

  async function decide(question, ctx) {
    const numbers = emergencyNumbers();
    const can = available();

    // answers to our own last question come first
    if (memory.lastAsk === "safety" && answeredNo(question))
      return rememberDanger(assessDanger("مش بامان", numbers));
    // «آه بأمان» to our safety question: said back, then the conversation goes on
    const safeNow =
      memory.lastAsk === "safety" &&
      (answeredYes(question) || /(?:^| )(?:بامان|امنه)(?= |$)/.test(norm(question)));
    // After a danger reply we asked ONE safety question. Her answer is about her safety: never drift to
    // "since when?" while she may still be in danger.
    if (memory.dangerKind && ["safe-place", "alone"].includes(memory.lastAsk)) {
      const fresh = assessDanger(question, numbers, { mindLine: can.mindLine, minor: memory.minor });
      if (fresh?.answer && fresh.level !== "selfharm-check") return rememberDanger(fresh);
      const follow = dangerFollowUp(question, numbers, can);
      if (follow) return follow;
    }
    if (memory.lastAsk === "family") {
      const t = norm(question);
      if (answeredYes(question) || /(?:^| )(?:هلا|هلق|هسا|الحين|اليوم)(?: |$)/.test(t))
        return rememberDanger(assessDanger("مش بامان", numbers));
      if (answeredNo(question) || /(?:^| )(?:اذا|لو) (?:عرفوا|عرف|درو)(?: |$)/.test(t)) {
        memory.lastAsk = "";
        memory.constraints.add("familyUnsafe");
        return {
          kind: "talk",
          lead: "مفهوم. ما رح أقترح عليكِ تحكي لأهلك، وأي خطوة بنفكر فيها لازم ما تكشفك قدامهم.",
          options: [],
          ask: "شو أكتر إشي خايفة منه هلأ؟",
          note: "",
          sos: true,
          sosPlan: "violence",
        };
      }
    }
    if (memory.lastAsk === "forced" && answeredYes(question)) {
      return rememberDanger({ level: "forced-marriage", answer: forcedMarriageAnswer(numbers) });
    }
    if (memory.lastAsk === "selfharm") {
      if (answeredYes(question)) {
        return rememberDanger(assessDanger("بدي اموت", numbers, { mindLine: can.mindLine }));
      }
      if (answeredNo(question)) {
        memory.lastAsk = "";
        return {
          kind: "talk",
          lead: "منيح إنك حكيتيلي.",
          options: [],
          ask: "شو أكتر إشي تاعبك هلأ؟",
          note: "",
        };
      }
    }

    const danger = assessDanger(question, numbers, { mindLine: can.mindLine, minor: memory.minor });
    if (danger?.answer) {
      if (danger.level === "selfharm-check") {
        memory.lastAsk = "selfharm";
        return danger.answer;
      }
      return rememberDanger(danger);
    }
    if (danger?.about === "family") memory.constraints.add("familyUnsafe");

    const small = detectSmallTalk(question);
    if (small && !memory.turns.some((t) => t.role === "assistant")) return small.answer;
    if (small?.kind === "thanks" || small?.kind === "name") return small.answer;

    // the conversation itself: what we remember, news, continuing a saved topic
    const t = norm(question);
    if (RECALL.test(t)) return recallReply(memory);
    if (RESUME.test(t)) return resume(question);
    if (NEWS.test(t) && t.split(" ").length <= 6) return newsReply(memory);

    // her answer to «بتحبي أوريكِ شو بيقول القانون عن …؟»
    if (memory.lastAsk === "offer-law") {
      const topic = memory.situation.pending?.topic || currentTopic(memory.situation);
      memory.lastAsk = "";
      if ((answeredYes(question) || SHOW_ME.test(t)) && TOPIC_QUESTION[topic]) {
        memory.lastNeed = "legal";
        return legalAnswer(TOPIC_QUESTION[topic], ctx, can, topic);
      }
      // a short «لا» only: «ما بقدر أطلع من البيت» is something she tells, not a refusal of the offer
      if (answeredNo(question) && t.split(" ").length <= 3)
        return {
          kind: "talk",
          lead: "تمام، مش لازم هلأ.",
          options: [],
          ask: "بدك نكمل حكي، ولا في إشي تاني على بالك؟",
          note: "",
        };
    }

    // «وإذا بغزة؟» right after a legal answer. (2026-11-18) Gaza and the West Bank apply different laws and a
    // lawyer found answers that mixed them, so the app never shows the other region's law: it says so instead.
    const other = OTHER_REGION.exec(t);
    const legalTopic = currentTopic(memory.situation);
    if (other && t.split(" ").length <= 4 && TOPIC_QUESTION[legalTopic]) {
      const gaza = /غزه/.test(other[1]);
      memory.lastNeed = "legal";
      return {
        kind: "talk",
        lead: gaza
          ? "اللي حكيتلك ياه هو حسب قوانين غزة، لأنه فزعة هلأ لقطاع غزة بس."
          : "فزعة هلأ لقطاع غزة بس، وما عندي نصوص قانون للضفة. محامية بتقدر تحكيلك شو القانون هناك.",
        options: [],
        ask: "",
        note: "",
      };
    }

    let need = classifyNeed(question, memory);
    if (need === "followup")
      need = memory.lastNeed === "legal" ? "understand" : memory.lastNeed || "understand";
    memory.lastNeed = need;
    if (need !== "understand") memory.lastAsk = "";

    let answer;
    if (need === "legal") {
      answer = await legalAnswer(question, ctx, can);
    } else {
      answer = await online(question, need, ctx);
      // offline: only when she talks about herself (a feeling, a person, a limit, «اسمعيني»);
      // an off-topic question («كيف بطبخ مقلوبة») gets the honest "not covered" screen instead
      // a short follow-up («شو بقدر أعمل طيب؟») belongs to the conversation already going on
      const ongoing =
        Boolean(memory.person || memory.feeling || memory.constraints.size) ||
        memory.turns.filter((t) => t.role === "user").length > 1;
      if (!answer && (onTopic(question) || ongoing || memory.mode === "listen" || danger?.ask))
        answer = { ...localTalk(need, memory, can), general: true };
    }
    if (!answer) return null;
    if (safeNow && answer.kind === "talk") answer = { ...answer, lead: `منيح إنك بأمان هلأ. ${answer.lead}` };
    return withSafetyQuestion(answer, danger?.ask, danger?.about);
  }

  return {
    memory,
    /** Forget the session (wipe, quick exit, region change). */
    reset: () => clearMemory(memory),
    /**
     * @param {string} question
     * @param {{country: string, signal?: AbortSignal}} ctx
     */
    async answer(question, ctx) {
      if (memory.country && memory.country !== ctx.country) clearMemory(memory); // never mix regions
      memory.country = ctx.country;
      remember(memory, question);
      pushTurn(memory, "user", question);
      let answer = await decide(question, ctx);
      if (ctx.signal?.aborted) return null; // wiped while thinking: write nothing back
      // never the same opening sentence twice in a session (a law reply repeated word for word)
      if (answer?.lead && answer.kind !== "chat" && !answer.sos) {
        if (memory.usedLeads.has(answer.lead))
          answer = {
            ...answer,
            lead:
              answer.cites?.length || answer.related?.length
                ? "هاي النصوص اللي عندي عن سؤالك:"
                : "متل ما حكيتلك، هاد بيعتمد على تفاصيل وضعك، والمحامية بتقدر تقلك بالزبط.",
          };
        memory.usedLeads.add(answer.lead);
      }
      pushTurn(memory, "assistant", [answer?.lead, answer?.ask].filter(Boolean).join(" "));
      // opt-in only: short labels of what she told, per topic; never after a self-harm reply
      if (saved?.enabled?.() && memory.dangerKind !== "selfharm" && memory.lastAsk !== "selfharm")
        saved.remember(memory);
      return answer ? { source: "rules", ...answer } : null;
    },
  };
}
