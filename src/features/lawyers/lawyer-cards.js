import { $, el } from "../../core/dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const AVATAR = {
  hijab: ["#w-hijab", "--c1: #17163a; --c2: var(--emphasis); --c3: #fff"],
  hair: ["#w-hair", "--c1: #17163a; --c3: #fff"],
  hijab2: ["#w-hijab", "--c1: #17163a; --c2: var(--accent); --c3: #fff"],
};

function avatar(kind) {
  const [href, style] = AVATAR[kind] || AVATAR.hijab;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "av");
  svg.setAttribute("viewBox", "0 0 120 150");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("style", "background: var(--primary-soft)");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", href);
  use.setAttribute("style", style);
  svg.append(use);
  return svg;
}

/**
 * The real lawyers who are available now, from the list the team manages in the dashboard
 * ("المحاميات"). Only first name, speciality and years arrive here. When the live chat is not
 * switched on yet (`liveChat` false), the cards show the lawyers but say the service is coming, so
 * no scripted demo ever speaks in a real lawyer's name.
 *
 * @param {{ state: { get(k: string): any }, endpoint: string, liveChat: boolean, fetchImpl?: typeof fetch }} deps
 */
export function createLawyerCards({
  state,
  endpoint,
  liveChat,
  fetchImpl = globalThis.fetch?.bind(globalThis),
}) {
  /** @type {{id:string, name:string, specialty:string, years:number, avatar:string, bio:string}[] | null} */
  let lawyers = null; // null = not loaded (offline)

  async function refresh() {
    if (!endpoint || !fetchImpl) return render();
    try {
      const res = await fetchImpl(`${endpoint}?region=${encodeURIComponent(state.get("country") || "")}`);
      if (res.ok) lawyers = (await res.json()).lawyers || [];
    } catch {
      /* offline: keep the last list */
    }
    render();
  }

  function action(l) {
    if (!liveChat) {
      const soon = el("span", "avail busy");
      soon.append(el("i"), document.createTextNode("الخدمة قريباً"));
      return soon;
    }
    const b = el("button", "chip fill", "احكي معها");
    b.setAttribute("data-chat", "lawyer");
    b.setAttribute("data-lawyer", l.name);
    return b;
  }

  function line(l) {
    return [l.specialty, l.years ? `${l.years} سنة خبرة` : ""].filter(Boolean).join(" · ");
  }

  function emptyCard() {
    const box = el("div", "lawmini");
    const text = el("div");
    text.style.flex = "1";
    text.append(
      el("b", null, lawyers === null ? "ما قدرنا نجيب القائمة" : "ما في محامية متاحة هلأ"),
      el(
        "small",
        null,
        lawyers === null
          ? "تأكدي من الإنترنت. لحد ما ترجع، بتقدري تسألي فزعة أو تشوفي جهات الدعم."
          : "جرّبي كمان شوي. ولحد هداك الوقت، جهات الدعم موجودة بصفحة «مين بيساعدني».",
      ),
    );
    const help = el("button", "chip", "مين بيساعدني");
    help.setAttribute("data-go", "support");
    box.append(text, help);
    return box;
  }

  function render() {
    const list = lawyers || [];
    const note = liveChat ? "متاحات هلأ" : "المحادثة مع المحاميات قريباً";
    for (const id of ["#home-lawyer-note", "#lawyer-list-note"]) {
      const n = $(id);
      if (n) n.textContent = list.length ? note : "";
    }

    const home = $("#home-lawyer");
    if (home) {
      if (!list.length) home.replaceChildren(emptyCard());
      else {
        const l = list[0];
        const box = el("div", "lawmini");
        const info = el("div");
        info.style.flex = "1";
        info.style.minWidth = "0";
        info.append(el("b", null, `أ. ${l.name}`), el("small", null, line(l)));
        const st = el("span", liveChat ? "avail" : "avail busy");
        st.append(el("i"), document.createTextNode(liveChat ? "متاحة الآن" : "الخدمة قريباً"));
        info.append(st);
        box.append(avatar(l.avatar), info);
        if (liveChat) box.append(action(l));
        home.replaceChildren(box);
      }
    }

    const all = $("#lawyer-list");
    if (all) {
      if (!list.length) all.replaceChildren(emptyCard());
      else
        all.replaceChildren(
          ...list.map((l) => {
            const card = el("div", "lawyer");
            const lh = el("div", "lh");
            const info = el("div");
            info.append(el("b", null, `أ. ${l.name}`), el("small", null, line(l)));
            lh.append(avatar(l.avatar), info);
            card.append(lh);
            if (l.bio) card.append(el("small", "muted", l.bio));
            if (liveChat) {
              const st = el("span", "avail");
              st.append(el("i"), document.createTextNode("متاحة الآن"));
              card.append(st);
            }
            card.append(action(l));
            return card;
          }),
        );
    }
  }

  return { refresh, render };
}
