import { api, errorText } from "./api.js";
import { ageClass, ago, duration, el, REGION, time } from "./util.js";

const POLL_MS = 5000;
const LIST_MS = 8000;

/** Starting points a lawyer can insert and edit. Kept short; no numbers or promises. */
const REPLIES = [
  ["ترحيب", "أهلاً فيكِ، أنا المحامية. كل اللي بنحكيه هون سري. احكيلي شو صاير معك، وعلى مهلك."],
  ["سؤال عن الأمان", "قبل أي شي: هل إنتِ بأمان هلأ؟ وهل في خطر مباشر عليكِ أو على ولادك؟"],
  ["حفظ الأدلة", "ما تمسحي أي رسالة أو صورة. خليها محفوظة، وصوّري المحادثة مع التاريخ واسم الحساب."],
  ["طلب تفاصيل", "ممكن تحكيلي أكتر: متى بدأ الموضوع؟ وهل في أوراق أو رسائل بتثبته؟"],
  ["الخطوة القادمة", "بناءً على اللي حكيتيه، هاي الخطوات اللي بنصحك فيها:"],
  ["ختام", "إذا صار أي جديد أو احتجتي شي، اكتبيلي هون. وبتقدري تنهي المحادثة بأي وقت."],
];

/**
 * The lawyer workspace: list (waiting / mine) | conversation | case panel (private notes, quick replies).
 * @param {{view: HTMLElement, banner: (msg?: string) => void, notify: {count: (n:number)=>void, ping: ()=>void}}} ctx
 */
export function lawyerView(ctx) {
  const state = {
    tab: "queue",
    region: "all",
    queue: [],
    mine: [],
    current: null, // { id, lastId, topic, region, createdAt }
    seenQueue: new Set(),
  };
  let msgTimer = null;
  let listTimer = null;
  let noteTimer = null;

  /* ----- skeleton ----- */
  const kpis = el("div", "kpis");
  const listCard = el("section", "card list-col");
  const chatCard = el("section", "card chat-col");
  const info = el("div", "info");
  const work = el("div", "work");
  work.append(listCard, chatCard, info);
  ctx.view.replaceChildren(el("div", "page-head"), kpis, work);
  ctx.view.firstChild.append(el("h1", null, "الحالات"));

  /* ----- lists ----- */
  const tabs = el("div", "tabs");
  tabs.setAttribute("role", "tablist");
  const tabQueue = el("button", null);
  const tabMine = el("button", null);
  for (const [b, id] of [
    [tabQueue, "queue"],
    [tabMine, "mine"],
  ]) {
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => {
      state.tab = id;
      renderList();
    });
  }
  tabs.append(tabQueue, tabMine);

  const chips = el("div", "chips");
  for (const [id, label] of [
    ["all", "الكل"],
    ["ps-gaza", "غزة"],
    ["ps-wb", "الضفة"],
  ]) {
    const c = el("button", "chip", label);
    c.dataset.region = id;
    c.addEventListener("click", () => {
      state.region = id;
      renderList();
    });
    chips.appendChild(c);
  }
  const listBody = el("div");
  listCard.append(tabs, chips, listBody);

  function renderKpis() {
    const oldest = state.queue.length ? Date.now() - Math.min(...state.queue.map((c) => c.createdAt)) : 0;
    const k = (n, label, cls = "") => {
      const d = el("div", `card kpi ${cls}`.trim());
      d.append(el("b", null, String(n)), el("span", null, label));
      return d;
    };
    kpis.replaceChildren(
      k(state.queue.length, "بانتظار محامية", state.queue.length ? "wait" : ""),
      k(state.mine.length, "حالاتي الحالية", "good"),
      k(state.queue.length ? duration(oldest) : "—", "أطول انتظار"),
    );
  }

  function renderList() {
    tabQueue.textContent = `بانتظار (${state.queue.length})`;
    tabMine.textContent = `حالاتي (${state.mine.length})`;
    tabQueue.setAttribute("aria-selected", String(state.tab === "queue"));
    tabMine.setAttribute("aria-selected", String(state.tab === "mine"));
    for (const c of chips.children) c.setAttribute("aria-pressed", String(c.dataset.region === state.region));

    const rows = (state.tab === "queue" ? state.queue : state.mine).filter(
      (c) => state.region === "all" || c.region === state.region,
    );
    if (!rows.length) {
      listBody.replaceChildren(
        el("div", "empty", state.tab === "queue" ? "ما في حالات منتظرة. ✓" : "ما عندك حالات حالياً."),
      );
    } else if (state.tab === "queue") {
      listBody.replaceChildren(...rows.map(queueCard));
    } else {
      listBody.replaceChildren(...rows.map(mineCard));
    }
    renderKpis();
    ctx.notify.count(state.queue.length);
  }

  function caseHead(c, ms) {
    const top = el("div", "top");
    top.append(el("b", null, c.topic), el("span", ageClass(ms), ago(ms)));
    return top;
  }

  function queueCard(c) {
    const box = el("div", "case");
    const take = el("button", "primary", "تولّي الحالة");
    take.addEventListener("click", () => claim(c.id, take));
    box.append(caseHead(c, Date.now() - c.createdAt), el("small", null, REGION[c.region]), take);
    return box;
  }

  function mineCard(c) {
    const b = el("button", "case");
    b.setAttribute("aria-current", String(state.current?.id === c.id));
    b.append(caseHead(c, Date.now() - c.lastActivity), el("small", null, REGION[c.region]));
    b.addEventListener("click", () => openCase(c));
    return b;
  }

  async function refreshLists() {
    try {
      const [{ queue }, { cases }] = await Promise.all([api("/queue"), api("/mine")]);
      const fresh = queue.filter((c) => !state.seenQueue.has(c.id));
      if (state.seenQueue.size && fresh.length) ctx.notify.ping();
      queue.forEach((c) => state.seenQueue.add(c.id));
      state.queue = queue;
      state.mine = cases;
      ctx.banner();
      renderList();
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  async function claim(id, button) {
    button.disabled = true;
    try {
      await api(`/cases/${id}/claim`, { method: "POST" });
      await refreshLists();
      state.tab = "mine";
      const c = state.mine.find((x) => x.id === id);
      if (c) await openCase(c);
    } catch (e) {
      ctx.banner(errorText(e));
      await refreshLists();
    }
  }

  /* ----- conversation ----- */
  let msgsBox, input, sendBtn, noteArea, noteState, titleEl;

  function renderEmptyChat() {
    chatCard.replaceChildren(el("div", "empty", "اختاري حالة من «حالاتي» أو تولّي حالة من الانتظار."));
    info.replaceChildren();
  }

  async function openCase(c) {
    clearInterval(msgTimer);
    clearTimeout(noteTimer);
    state.current = { id: c.id, lastId: 0, topic: c.topic, region: c.region, createdAt: c.createdAt };
    work.classList.add("chatting");
    renderList();

    const head = el("div", "chat-head");
    const back = el("button", "ghost", "→ رجوع");
    back.addEventListener("click", closeChat);
    titleEl = el("b", null, `${c.topic} · ${REGION[c.region]}`);
    const finish = el("button", null, "إنهاء الحالة");
    finish.addEventListener("click", () => finishCase(c.id));
    head.append(back, titleEl, finish);

    msgsBox = el("div", "msgs");
    msgsBox.setAttribute("aria-live", "polite");
    input = el("textarea");
    input.placeholder = "اكتبي ردك...";
    input.rows = 1;
    sendBtn = el("button", "primary", "إرسال");
    const composer = el("div", "composer");
    composer.append(input, sendBtn);
    chatCard.replaceChildren(
      head,
      msgsBox,
      composer,
      el("p", "hint", "Enter للإرسال · Shift+Enter سطر جديد"),
    );

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    });
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    renderInfo(c.id);
    await pollMessages();
    msgTimer = setInterval(pollMessages, POLL_MS);
    input.focus();
  }

  async function pollMessages() {
    const cur = state.current;
    if (!cur) return;
    try {
      const data = await api(`/cases/${cur.id}/messages?after=${cur.lastId}`);
      if (state.current?.id !== cur.id) return;
      for (const m of data.messages) {
        const bubble = el("div", `msg ${m.from}`, m.text);
        bubble.appendChild(el("small", null, time(m.at)));
        msgsBox.appendChild(bubble);
        cur.lastId = m.id;
      }
      if (data.messages.length) msgsBox.scrollTop = msgsBox.scrollHeight;
      if (data.status === "closed") closeChat();
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  async function send() {
    const text = input.value.trim();
    if (!text || !state.current) return;
    sendBtn.disabled = true;
    try {
      await api(`/cases/${state.current.id}/messages`, { method: "POST", body: { text } });
      input.value = "";
      input.style.height = "";
      await pollMessages();
    } catch (e) {
      ctx.banner(errorText(e));
    }
    sendBtn.disabled = false;
    input.focus();
  }

  async function finishCase(id) {
    if (
      !window.confirm(
        "بعد إنهاء الحالة ما بتقدر المستخدمة تكتب فيها، وبتنحذف المحادثة تلقائياً بعد مدة. متأكدة؟",
      )
    )
      return;
    try {
      await api(`/cases/${id}/close`, { method: "POST" });
      closeChat();
      refreshLists();
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  function closeChat() {
    clearInterval(msgTimer);
    clearTimeout(noteTimer);
    state.current = null;
    work.classList.remove("chatting");
    renderEmptyChat();
    renderList();
  }

  /* ----- case panel: private note + quick replies ----- */
  async function renderInfo(id) {
    noteArea = el("textarea");
    noteArea.rows = 6;
    noteArea.maxLength = 4000;
    noteArea.placeholder = "ملاحظات لك فقط. ما بتظهر للمستخدمة.";
    noteState = el("div", "note-state");
    const noteCard = el("section", "card");
    noteCard.append(el("h2", null, "ملاحظاتي على الحالة"), noteArea, noteState);

    const repliesCard = el("section", "card");
    const list = el("div", "replies");
    for (const [label, text] of REPLIES) {
      const b = el("button", null, label);
      b.title = text;
      b.addEventListener("click", () => {
        input.value = input.value ? `${input.value}\n${text}` : text;
        input.dispatchEvent(new Event("input"));
        input.focus();
      });
      list.appendChild(b);
    }
    repliesCard.append(
      el("h2", null, "ردود سريعة"),
      list,
      el("p", "hint", "بتنضاف للمربع وبتقدري تعدّليها قبل الإرسال."),
    );
    // who she is: alias, name, phone (visible only to the lawyer who took the case; the view is audited)
    const clientCard = el("section", "card");
    clientCard.appendChild(el("h2", null, "بيانات المستخدمة"));
    info.replaceChildren(clientCard, noteCard, repliesCard);
    try {
      const c = await api(`/cases/${id}/client`);
      const rows = el("dl", "client");
      for (const [k, v] of [
        ["الاسم", c.name],
        ["رقم التواصل", c.phone],
        ["الاسم المستعار", c.username],
        ["المنطقة", REGION[c.region] || c.region],
      ]) {
        const dd = el("dd", null, v);
        if (k === "رقم التواصل") dd.dir = "ltr";
        rows.append(el("dt", null, k), dd);
      }
      clientCard.append(rows, el("p", "hint", "سرّية: لا تشاركيها مع أحد. فتحها بيتسجّل بسجل العمليات."));
    } catch {
      clientCard.appendChild(el("p", "hint", "ما في بيانات تواصل لهالحالة."));
    }

    try {
      noteArea.value = (await api(`/cases/${id}/note`)).note;
    } catch (e) {
      ctx.banner(errorText(e));
    }
    noteArea.addEventListener("input", () => {
      noteState.textContent = "…";
      clearTimeout(noteTimer);
      noteTimer = setTimeout(async () => {
        try {
          await api(`/cases/${id}/note`, { method: "PUT", body: { note: noteArea.value } });
          noteState.textContent = "تم الحفظ";
        } catch (e) {
          noteState.textContent = errorText(e);
        }
      }, 800);
    });
  }

  /* ----- go ----- */
  renderEmptyChat();
  renderList();
  refreshLists();
  listTimer = setInterval(refreshLists, LIST_MS);

  return {
    destroy() {
      clearInterval(msgTimer);
      clearInterval(listTimer);
      clearTimeout(noteTimer);
    },
  };
}
