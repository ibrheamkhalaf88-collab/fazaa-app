import { api, errorText } from "./api.js";
import { ageClass, ago, el, icon, initial, REGION, time } from "./util.js";

const POLL_MS = 5000;
const LIST_MS = 8000;

/** Starting points a lawyer can insert and edit. Kept short; no numbers or promises. */
const REPLIES = [
  ["ترحيب", "أهلاً فيكِ، أنا المحامي. كل اللي بنحكيه هون سري. احكيلي شو صاير معك، وعلى مهلك."],
  ["سؤال عن الأمان", "قبل أي شي: هل إنتِ بأمان هلأ؟ وهل في خطر مباشر عليكِ أو على ولادك؟"],
  ["حفظ الأدلة", "ما تمسحي أي رسالة أو صورة. خليها محفوظة، وصوّري المحادثة مع التاريخ واسم الحساب."],
  ["طلب تفاصيل", "ممكن تحكيلي أكتر: متى بدأ الموضوع؟ وهل في أوراق أو رسائل بتثبته؟"],
  ["الخطوة القادمة", "بناءً على اللي حكيتيه، هاي الخطوات اللي بنصحك فيها:"],
  ["ختام", "إذا صار أي جديد أو احتجتي شي، اكتبيلي هون. وبتقدري تنهي المحادثة بأي وقت."],
];
const STATUS = { open: "بانتظار محامي", claimed: "مفتوحة", closed: "منتهية" };
const dayLabel = (ms) => new Date(ms).toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" });

/**
 * A conversation pane: header, messages (with day separators) and, for the lawyer, a composer.
 * Polls `/cases/:id/messages?after=` and appends only new messages.
 */
function threadPane({ ctx, c, readOnly, onBack, onClosed, headExtra = [] }) {
  const pane = el("section", "chat");
  const head = el("div", "chat-head");
  const back = el("button", "ghost back");
  back.type = "button";
  back.setAttribute("aria-label", "رجوع للقائمة");
  back.append(icon("back"));
  back.addEventListener("click", onBack);
  const avatar = el("span", "avatar", initial(c.topic));
  const title = el("div", "title");
  title.append(el("b", null, c.topic), el("small", null, `${REGION[c.region] || ""} · ${STATUS[c.status] || ""}`));
  head.append(back, avatar, title, ...headExtra);

  const msgs = el("div", "msgs");
  msgs.setAttribute("aria-live", "polite");
  pane.append(head, msgs);

  let lastId = 0;
  let lastDay = "";
  let stopped = false;
  let first = true;
  async function poll() {
    if (stopped) return;
    try {
      const data = await api(`/cases/${c.id}/messages?after=${lastId}`);
      if (stopped) return;
      const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
      for (const m of data.messages) {
        const d = new Date(m.at).toDateString();
        if (d !== lastDay) {
          msgs.appendChild(el("div", "day", dayLabel(m.at)));
          lastDay = d;
        }
        const bubble = el("div", `msg ${m.from}`, m.text);
        bubble.appendChild(el("small", null, time(m.at)));
        msgs.appendChild(bubble);
        lastId = m.id;
      }
      // follow new messages unless the reader scrolled up to read older ones
      if (data.messages.length && (atBottom || first)) msgs.scrollTop = msgs.scrollHeight;
      first = false;
      if (!msgs.children.length) msgs.appendChild(el("div", "day", "ما في رسائل بعد"));
      if (data.status === "closed" && onClosed) onClosed();
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }

  let input;
  if (readOnly) {
    pane.appendChild(el("div", "readonly-bar", "قراءة فقط. الرد بيكون من المحامي اللي تولّى الحالة."));
  } else {
    input = el("textarea");
    input.placeholder = "اكتب ردك...";
    input.rows = 1;
    input.setAttribute("aria-label", "الرد");
    const sendBtn = el("button", "primary");
    sendBtn.type = "button";
    sendBtn.append(icon("send"), el("span", null, "إرسال"));
    const composer = el("div", "composer");
    composer.append(input, sendBtn);
    pane.append(composer, el("p", "composer-hint", "Enter للإرسال · Shift+Enter سطر جديد"));

    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    });
    const send = async () => {
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      try {
        await api(`/cases/${c.id}/messages`, { method: "POST", body: { text } });
        input.value = "";
        input.style.height = "";
        await poll();
        msgs.scrollTop = msgs.scrollHeight;
      } catch (e) {
        ctx.banner(errorText(e));
      }
      sendBtn.disabled = false;
      input.focus();
    };
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  poll();
  const timer = setInterval(poll, POLL_MS);
  return {
    pane,
    input,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

function emptyChat(text) {
  const pane = el("section", "chat");
  const box = el("div", "chat-empty");
  box.append(icon("chat"), el("b", null, "اختار محادثة"), el("span", null, text));
  pane.appendChild(box);
  return pane;
}

/**
 * The lawyer's inbox: conversations list (waiting / mine) | conversation | her details, notes, quick replies.
 * @param {{view: HTMLElement, banner: (msg?: string) => void, notify: {count: (n:number)=>void, ping: ()=>void}}} ctx
 */
export function lawyerView(ctx) {
  const state = { tab: "queue", region: "all", queue: [], mine: [], current: null, seen: new Set() };
  let thread = null;
  let listTimer = null;
  let noteTimer = null;

  const root = el("div", "inbox");
  const listCol = el("aside", "inbox-list");
  let chatCol = emptyChat("من «حالاتي»، أو استلم حالة من «بانتظار».");
  const info = el("aside", "info");
  root.append(listCol, chatCol, info);
  ctx.view.replaceChildren(root);

  /* ----- list ----- */
  const h1 = el("h1", null, "المحادثات");
  const tabs = el("div", "tabs");
  tabs.setAttribute("role", "tablist");
  const tabQueue = el("button");
  const tabMine = el("button");
  for (const [b, id] of [
    [tabQueue, "queue"],
    [tabMine, "mine"],
  ]) {
    b.type = "button";
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => {
      state.tab = id;
      renderList();
    });
  }
  tabs.append(tabMine, tabQueue);
  const chips = el("div", "chips");
  for (const [id, label] of [
    ["all", "الكل"],
    ["ps-gaza", "غزة"],
    ["ps-wb", "الضفة"],
  ]) {
    const c = el("button", "chip", label);
    c.type = "button";
    c.dataset.region = id;
    c.addEventListener("click", () => {
      state.region = id;
      renderList();
    });
    chips.appendChild(c);
  }
  const head = el("div", "inbox-head");
  head.append(h1, tabs, chips);
  const scroll = el("div", "inbox-scroll");
  listCol.append(head, scroll);

  function renderList() {
    tabQueue.textContent = `بانتظار (${state.queue.length})`;
    tabMine.textContent = `حالاتي (${state.mine.length})`;
    tabQueue.setAttribute("aria-selected", String(state.tab === "queue"));
    tabMine.setAttribute("aria-selected", String(state.tab === "mine"));
    for (const c of chips.children) c.setAttribute("aria-pressed", String(c.dataset.region === state.region));
    const rows = (state.tab === "queue" ? state.queue : state.mine).filter(
      (c) => state.region === "all" || c.region === state.region,
    );
    scroll.replaceChildren(
      ...(rows.length
        ? rows.map(state.tab === "queue" ? queueRow : mineRow)
        : [el("div", "empty", state.tab === "queue" ? "ما في حدا بيستنى. ✓" : "ما عندك محادثات مفتوحة.")]),
    );
    ctx.notify.count(state.queue.length);
  }

  function queueRow(c) {
    const ms = Date.now() - c.createdAt;
    const row = el("div", "thread-row waiting");
    const take = el("button", "primary take", "استلام المحادثة");
    take.type = "button";
    take.addEventListener("click", () => claim(c.id, take));
    row.append(
      el("span", "avatar", initial(c.topic)),
      el("b", null, c.topic),
      el("span", ageClass(ms), ago(ms)),
      el("small", null, `${REGION[c.region]} · بتستنى محامي`),
      take,
    );
    return row;
  }

  function mineRow(c) {
    const ms = Date.now() - c.lastActivity;
    const row = el("button", "thread-row");
    row.type = "button";
    row.setAttribute("aria-current", String(state.current?.id === c.id));
    row.append(
      el("span", "avatar", initial(c.topic)),
      el("b", null, c.topic),
      el("span", "muted", ago(ms)),
      el("small", null, REGION[c.region]),
    );
    row.addEventListener("click", () => openCase(c));
    return row;
  }

  async function refreshLists() {
    try {
      const [{ queue }, { cases }] = await Promise.all([api("/queue"), api("/mine")]);
      const fresh = queue.filter((c) => !state.seen.has(c.id));
      if (state.seen.size && fresh.length) ctx.notify.ping();
      queue.forEach((c) => state.seen.add(c.id));
      if (!state.loaded) state.tab = cases.length ? "mine" : "queue"; // open on what needs her first
      state.loaded = true;
      ctx.banner();
      // redraw only when something changed, so a click never lands on a row being replaced
      const sig = JSON.stringify([queue, cases]);
      if (sig === state.sig) return;
      state.sig = sig;
      state.queue = queue;
      state.mine = cases;
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
      renderList();
      const c = state.mine.find((x) => x.id === id);
      if (c) openCase(c);
    } catch (e) {
      ctx.banner(errorText(e));
      await refreshLists();
    }
  }

  /* ----- conversation ----- */
  function setChat(node) {
    chatCol.replaceWith(node);
    chatCol = node;
  }

  function openCase(c) {
    thread?.stop();
    clearTimeout(noteTimer);
    state.current = c;
    root.classList.add("chatting");
    root.classList.remove("show-info");
    renderList();

    const infoBtn = el("button", "ghost info-toggle");
    infoBtn.type = "button";
    infoBtn.setAttribute("aria-label", "بيانات الحالة");
    infoBtn.append(icon("info"));
    infoBtn.addEventListener("click", () => root.classList.toggle("show-info"));
    const finish = el("button", null, "إنهاء الحالة");
    finish.type = "button";
    finish.addEventListener("click", () => finishCase(c.id));

    thread = threadPane({
      ctx,
      c: { ...c, status: "claimed" },
      readOnly: false,
      onBack: closeChat,
      onClosed: closeChat,
      headExtra: [infoBtn, finish],
    });
    setChat(thread.pane);
    renderInfo(c.id);
    thread.input.focus();
  }

  async function finishCase(id) {
    if (!window.confirm("بعد إنهاء الحالة ما بتقدر المستخدمة تكتب فيها، وبتنحذف المحادثة تلقائياً بعد مدة. متأكد؟"))
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
    thread?.stop();
    thread = null;
    clearTimeout(noteTimer);
    state.current = null;
    root.classList.remove("chatting", "show-info");
    setChat(emptyChat("من «حالاتي»، أو استلم حالة من «بانتظار»."));
    info.replaceChildren();
    renderList();
  }

  /* ----- her details (audited), private notes, quick replies ----- */
  async function renderInfo(id) {
    const noteArea = el("textarea");
    noteArea.rows = 6;
    noteArea.maxLength = 4000;
    noteArea.placeholder = "ملاحظات إلك بس. ما بتظهر للمستخدمة.";
    const noteState = el("div", "note-state");
    const noteCard = el("section", "card");
    noteCard.append(el("h2", null, "ملاحظاتي"), noteArea, noteState);

    const repliesCard = el("section", "card");
    const list = el("div", "replies");
    for (const [label, text] of REPLIES) {
      const b = el("button", null, label);
      b.type = "button";
      b.title = text;
      b.addEventListener("click", () => {
        const input = thread?.input;
        if (!input) return;
        input.value = input.value ? `${input.value}\n${text}` : text;
        input.dispatchEvent(new Event("input"));
        input.focus();
      });
      list.appendChild(b);
    }
    repliesCard.append(el("h2", null, "ردود جاهزة"), list, el("p", "hint", "بتنضاف لمربع الرد وبتقدر تعدّلها."));

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
      clientCard.append(rows, el("p", "hint", "سرّية. فتحها بينسجّل بسجل العمليات."));
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
  renderList();
  refreshLists();
  listTimer = setInterval(refreshLists, LIST_MS);

  return {
    destroy() {
      thread?.stop();
      clearInterval(listTimer);
      clearTimeout(noteTimer);
    },
  };
}

/**
 * Developer: every conversation, read-only. Opening one is recorded in the audit log by the server.
 */
export function conversationsView(ctx) {
  const state = { filter: "all", cases: [], current: null };
  let thread = null;

  const root = el("div", "inbox no-info");
  const listCol = el("aside", "inbox-list");
  let chatCol = emptyChat("كل محادثات المستخدمات مع المحامين. قراءة فقط، وكل فتح بينسجّل.");
  root.append(listCol, chatCol);
  ctx.view.replaceChildren(root);

  const h1 = el("h1", null, "كل المحادثات");
  const chips = el("div", "chips");
  for (const [id, label] of [
    ["all", "الكل"],
    ["open", "بانتظار محامي"],
    ["claimed", "مفتوحة"],
    ["closed", "منتهية"],
  ]) {
    const c = el("button", "chip", label);
    c.type = "button";
    c.dataset.filter = id;
    c.addEventListener("click", () => {
      state.filter = id;
      render();
    });
    chips.appendChild(c);
  }
  const head = el("div", "inbox-head");
  head.append(h1, chips);
  const scroll = el("div", "inbox-scroll");
  listCol.append(head, scroll);

  function render() {
    for (const c of chips.children) c.setAttribute("aria-pressed", String(c.dataset.filter === state.filter));
    const rows = state.cases.filter((c) => state.filter === "all" || c.status === state.filter);
    scroll.replaceChildren(
      ...(rows.length
        ? rows.map((c) => {
            const row = el("button", `thread-row${c.status === "open" ? " waiting" : ""}`);
            row.type = "button";
            row.setAttribute("aria-current", String(state.current?.id === c.id));
            row.append(
              el("span", "avatar", initial(c.topic)),
              el("b", null, c.topic),
              el("span", "muted", ago(Date.now() - c.lastActivity)),
              el("small", null, `${REGION[c.region] || ""} · ${c.lawyer ? `مع ${c.lawyer}` : STATUS[c.status]}`),
            );
            row.addEventListener("click", () => open(c));
            return row;
          })
        : [el("div", "empty", "ما في محادثات.")]),
    );
  }

  function setChat(node) {
    chatCol.replaceWith(node);
    chatCol = node;
  }
  function open(c) {
    thread?.stop();
    state.current = c;
    root.classList.add("chatting");
    render();
    thread = threadPane({ ctx, c, readOnly: true, onBack: back });
    setChat(thread.pane);
  }
  function back() {
    thread?.stop();
    thread = null;
    state.current = null;
    root.classList.remove("chatting");
    setChat(emptyChat("كل محادثات المستخدمات مع المحامين. قراءة فقط، وكل فتح بينسجّل."));
    render();
  }

  async function load() {
    try {
      const { cases } = await api("/conversations");
      ctx.banner();
      const sig = JSON.stringify(cases);
      if (sig === state.sig) return;
      state.sig = sig;
      state.cases = cases;
      render();
    } catch (e) {
      ctx.banner(errorText(e));
    }
  }
  render();
  load();
  const t = setInterval(load, LIST_MS);
  return {
    destroy() {
      thread?.stop();
      clearInterval(t);
    },
  };
}
