import { chip, el } from "../../core/dom.js";
import { lawyerSay } from "./lawyer-ui.js";
import { append, systemNote } from "./messages.js";

const POLL_MS = 4000;
const ERRORS = {
  "bad-username": "الاسم المستعار 3 إلى 20 حرف أو رقم، بدون مسافات.",
  "bad-pin": "الرمز لازم يكون 6 أرقام.",
  "weak-pin": "هالرمز سهل ينحزر (مثل 123456 أو 111111). اختاري 6 أرقام ما إلهم ترتيب.",
  "bad-body": "تأكدي إنك عبّيتي الاسم ورقم الهاتف.",
  "username-taken": "هالاسم المستعار مستخدم. جرّبي غيره.",
  "bad-credentials": "الاسم أو الرمز مش صحيح.",
  locked: "كتير محاولات غلط. استني 15 دقيقة وجرّبي.",
  "rate-limited": "كتير طلبات بوقت قصير. استني دقيقة وجرّبي.",
  "too-many-cases": "عندك حالات مفتوحة كتير. كمّلي بحالتك المفتوحة، أو استني لحد ما تنتهي وحدة منهم.",
  network: "ما في اتصال. جرّبي كمان شوي.",
};
const errorText = (res) => ERRORS[res.error] || "صار خطأ. جرّبي كمان مرة.";

/**
 * "Lawyer now" for real: she signs up or in (alias + 6-digit PIN, plus name and phone that only
 * the lawyer who takes her case can see), her first message opens a case, and the lawyer's
 * replies are polled. Same interface as the scripted demo (lawyer-session.js).
 *
 * @param {{ account: ReturnType<import("../account/account.js").createAccount>,
 *           state: { get(k:string): any }, pollMs?: number }} deps
 */
export function createLiveLawyerSession({ account, state, pollMs = POLL_MS }) {
  let caseId = null;
  let lastId = 0;
  let lawyerName = "";
  let status = "";
  let timer = null;
  let topic = "";
  let form = null;
  let restoring = false; // true while loading an existing case (show her own earlier messages too)
  /** True while the «محامية الآن» tab is the one she is on: the sign-up form only ever shows there. */
  let active = false;
  /** Bumped by reset(): any request started before it is ignored when it comes back. */
  let epoch = 0;
  const shown = new Set();

  const stop = () => {
    clearInterval(timer);
    timer = null;
  };

  function say(text, chips) {
    lawyerSay(lawyerName || "", text, chips);
  }

  /* ---------- sign up / sign in card ---------- */
  function authCard() {
    form?.remove();
    let signup = true;
    const box = el("form", "authbox");
    box.noValidate = true;
    const title = el("b", "fw-5");
    const hint = el("div", "muted");
    const fields = {};
    const field = (key, label, attrs = {}) => {
      const wrap = el("label", "field");
      wrap.appendChild(el("span", null, label));
      const input = el("input");
      Object.assign(input, attrs);
      input.autocomplete = "off";
      wrap.appendChild(input);
      fields[key] = { wrap, input };
      return wrap;
    };
    const rows = [
      field("username", "اسم مستعار (مش اسمك الحقيقي)", { maxLength: 20 }),
      field("pin", "رمز من 6 أرقام", { type: "password", inputMode: "numeric", maxLength: 6 }),
      field("name", "اسمك (بيشوفه المحامي اللي رح يتولى حالتك بس)", { maxLength: 60 }),
      field("phone", "رقم للتواصل (بيشوفه المحامي بس)", { type: "tel", inputMode: "tel", maxLength: 20 }),
    ];
    const msg = el("div", "err");
    msg.setAttribute("role", "alert");
    const note = el(
      "div",
      "muted",
      "رسايلك بيقرأها المحامي اللي بيتولى حالتك، وفريق فزعة التقني للمتابعة. اسمك ورقمك بيتخزّنوا مشفّرين، وما بيشوفهم غير المحامي. بتقدري تحذفي حسابك بأي وقت.",
    );
    const submit = el("button", "chip fill", "");
    submit.type = "submit";
    const toggle = el("button", "chip", "");
    toggle.type = "button";
    const row = el("div", "acts");
    row.append(submit, toggle);

    function render() {
      title.textContent = signup ? "سجّلي عشان نوصلك بمحامية" : "سجّلي دخول";
      hint.textContent = signup
        ? "بس لما تطلبي محامية. الأسئلة العادية بدون تسجيل."
        : "ادخلي بالاسم المستعار والرمز.";
      fields.name.wrap.hidden = fields.phone.wrap.hidden = note.hidden = !signup;
      submit.textContent = signup ? "إنشاء حساب" : "دخول";
      toggle.textContent = signup ? "عندي حساب" : "حساب جديد";
      fields.pin.input.autocomplete = signup ? "new-password" : "current-password";
      msg.textContent = "";
    }
    toggle.addEventListener("click", () => {
      signup = !signup;
      render();
    });
    box.addEventListener("submit", async (e) => {
      e.preventDefault();
      submit.disabled = true;
      const v = (k) => fields[k].input.value.trim();
      const base = { username: v("username"), pin: v("pin") };
      const res = signup
        ? await account.signup({ ...base, name: v("name"), phone: v("phone"), region: state.get("country") })
        : await account.login(base);
      submit.disabled = false;
      if (!res.ok) {
        msg.textContent = errorText(res);
        return;
      }
      box.remove();
      form = null;
      await resume();
    });
    box.append(title, hint, ...rows, note, msg, row);
    render();
    form = append(box);
  }

  /* ---------- the case ---------- */
  function paint(messages) {
    for (const m of messages) {
      if (shown.has(m.id)) continue;
      shown.add(m.id);
      lastId = Math.max(lastId, m.id);
      if (m.from === "lawyer") say(m.text);
      else if (restoring) append(el("div", "u", m.text));
    }
  }

  async function poll() {
    if (!caseId || (typeof document !== "undefined" && document.hidden)) return; // no requests while hidden
    const mine = epoch;
    const res = await account.messages(caseId, lastId);
    if (mine !== epoch) return; // wiped / signed out meanwhile: never repaint old messages
    if (res.status === 401) {
      stop();
      if (!account.signedIn() && active) authCard();
      return;
    }
    if (!res.ok) return;
    const { status: next, lawyer, messages } = res.data;
    if (lawyer) lawyerName = lawyer;
    if (next !== status) {
      if (next === "open" && status === "claimed")
        systemNote("المحامية ما عادت متاحة. حالتك رجعت للانتظار، ولما تستلمها محامية تانية بتشوفي ردها هون.");
      if (next === "claimed") systemNote(`المحامية ${lawyerName || ""} استلمت حالتك`.replace("  ", " "));
      if (next === "closed") {
        systemNote("المحامية أنهت هالحالة. بتقدري تفتحي حالة جديدة بأي وقت.");
        stop();
        caseId = null;
      }
      status = next;
    }
    paint(messages);
    restoring = false;
  }

  function start() {
    stop();
    timer = setInterval(poll, pollMs);
    poll();
  }
  // catch up as soon as she comes back to the app
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", () => {
      if (timer && !document.hidden) poll();
    });

  /** After sign-in: pick up an unfinished case, otherwise wait for her first message. */
  async function resume() {
    const mine = epoch;
    const me = await account.me();
    if (mine !== epoch) return;
    if (!me.ok) return me.status === 0 ? systemNote(errorText(me)) : active && authCard();
    const open = me.data.cases.find((c) => c.status !== "closed");
    const tools = [
      { label: "تسجيل خروج", action: "logout" },
      { label: "حذف حسابي", action: "delete-account" },
    ];
    if (open) {
      caseId = open.id;
      lastId = 0;
      restoring = true;
      shown.clear();
      systemNote("رجعتي لحالتك المفتوحة");
      start();
      return;
    }
    systemNote(
      "اكتبي رسالتك هون. بتوصل لمحامية لما تكون في وحدة متاحة، وممكن ياخد الرد وقت. رسايلك بيقرأها المحامي اللي بيستلم حالتك وفريق فزعة التقني.",
    );
    // account tools in a system box, not in a bubble that looks like it came from a lawyer
    const box = el("div", "a");
    box.appendChild(el("div", "muted", "حسابك:"));
    const row = el("div", "acts");
    for (const t of tools) row.appendChild(chip({ label: t.label, data: { action: t.action } }));
    box.appendChild(row);
    append(box);
  }

  return {
    setName() {},
    /** Switch into lawyer mode. */
    open({ topic: t } = {}) {
      active = true;
      if (t) topic = t;
      if (!account.signedIn()) return authCard();
      if (caseId) return start();
      resume();
    },
    /** She went back to «اسألي فزعة»: an unfinished sign-up form must not stay in the AI chat. */
    leave() {
      active = false;
      form?.remove();
      form = null;
    },
    /** She wrote something while in lawyer mode. */
    async reply(text) {
      if (!account.signedIn()) return authCard();
      const mine = epoch;
      if (!caseId) {
        const res = await account.openCase(topic || "غير محدد", text);
        if (mine !== epoch) return;
        if (res.status === 401) return authCard();
        if (!res.ok) return systemNote(`${errorText(res)} رسالتك ما انبعتت.`);
        caseId = res.data.caseId;
        lastId = 0;
        status = "open";
        restoring = false;
        shown.clear();
        systemNote("وصل طلبك وهو بالانتظار. لما تستلمه محامية بتشوفي ردها هون. ما في وقت محدد للرد.");
        start();
        return;
      }
      const res = await account.send(caseId, text);
      if (mine !== epoch) return;
      if (res.status === 409) return systemNote("هالحالة انتهت. ابعتي رسالة جديدة لفتح حالة.");
      if (!res.ok) systemNote(`${errorText(res)} رسالتك ما انبعتت.`);
    },
    /** Chip actions inside lawyer bubbles. Returns true if handled. */
    async action(name) {
      if (name === "logout") {
        stop();
        await account.logout();
        caseId = null;
        systemNote("سجّلتي خروج.");
        return true;
      }
      if (name === "delete-account") {
        if (!window.confirm("بدك تحذفي حسابك وكل محادثاتك؟ هالشي ما بيرجع.")) return true;
        stop();
        const res = await account.deleteAccount();
        if (res.ok) caseId = null;
        else start(); // nothing was deleted: keep the case as it was
        systemNote(
          res.ok
            ? "انحذف حسابك وكل محادثاتك من السيرفر."
            : `${errorText(res)} ما انحذف إشي. جرّبي كمان مرة، أو اطلبي من فريق فزعة يحذفه.`,
        );
        return true;
      }
      return false;
    },
    /** @param {{signOut?: boolean}} [opts]  quick exit / wipe: forget the sign-in on this device too */
    reset({ signOut = false } = {}) {
      epoch++;
      stop();
      active = false;
      form = null;
      caseId = null;
      lastId = 0;
      status = "";
      lawyerName = "";
      restoring = false;
      shown.clear();
      if (signOut) account.forget?.();
    },
  };
}
