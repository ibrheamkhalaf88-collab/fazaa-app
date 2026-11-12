import { ARTICLES } from "../data/law/index.js";
import { answeredNo, answeredYes, classifyNeed, clearMemory, contextFor, createMemory, localTalk, pushTurn, remember } from "./conversation.js";
import { assessDanger, forcedMarriageAnswer } from "./danger.js";
import { findArticleByNumber } from "./legal.js";
import { answerFromRules } from "./rules-engine.js";
import { detectSmallTalk } from "./smalltalk.js";
import { ventingFeeling } from "./companion.js";
import { detectIntents } from "./detect.js";
import { tokenize } from "./normalize.js";

const norm = (s) => tokenize(s).join(" ");

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
} = {}) {
  const memory = createMemory();

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
    if (answeredNo(question) || /(?:^| )(?:مش|ما|مو) ?(?:امنه|بامان)(?: |$)/.test(t)) return stillUnsafe(numbers, plan);
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
    memory.lastAsk = about === "forced" ? "forced" : about === "family" ? "family" : "safety";
    if (answer.kind === "talk") return { ...answer, ask, sos: true };
    return { ...answer, safetyAsk: ask, sos: true };
  }

  /** Law answers: limits the app knows about, said next to the answer. */
  function withScope(answer, country) {
    if (!answer.cites?.length) return answer;
    const extra = [];
    if (country === "ps-gaza" && answer.cites.some((id) => ARTICLES[id]?.lawKey === "cyber-2018"))
      extra.push("انتبهي: تطبيق قانون الجرائم الإلكترونية بغزة مش مؤكد، فاسألي محامية قبل ما تعتمدي عليه.");
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

  async function decide(question, ctx) {
    const numbers = emergencyNumbers();
    const can = available();

    // answers to our own last question come first
    if (memory.lastAsk === "safety" && answeredNo(question)) return rememberDanger(assessDanger("مش بامان", numbers));
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
        return { kind: "talk", lead: "منيح إنك حكيتيلي.", options: [], ask: "شو أكتر إشي تاعبك هلأ؟", note: "" };
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

    let need = classifyNeed(question, memory);
    if (need === "followup") need = memory.lastNeed === "legal" ? "understand" : memory.lastNeed || "understand";
    memory.lastNeed = need;
    if (need !== "understand") memory.lastAsk = "";

    let answer;
    if (need === "legal") {
      const hit = findArticleByNumber(question, ctx.country);
      const local = answerFromRules(question);
      if (hit) answer = articleAnswer(hit, ctx.country);
      else {
        const remoteAnswer = await online(question, need, ctx);
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
      answer = withScope(answer, ctx.country);
    } else {
      answer = await online(question, need, ctx);
      // offline: only when she talks about herself (a feeling, a person, a limit, «اسمعيني»);
      // an off-topic question («كيف بطبخ مقلوبة») gets the honest "not covered" screen instead
      // a short follow-up («شو بقدر أعمل طيب؟») belongs to the conversation already going on
      const ongoing = Boolean(memory.person || memory.feeling || memory.constraints.size) ||
        memory.turns.filter((t) => t.role === "user").length > 1;
      if (!answer && (onTopic(question) || ongoing || memory.mode === "listen" || danger?.ask))
        answer = { ...localTalk(need, memory, can), general: true };
    }
    if (!answer) return null;
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
      const answer = await decide(question, ctx);
      if (ctx.signal?.aborted) return null; // wiped while thinking: write nothing back
      pushTurn(memory, "assistant", [answer?.lead, answer?.ask].filter(Boolean).join(" "));
      return answer ? { source: "rules", ...answer } : null;
    },
  };
}
