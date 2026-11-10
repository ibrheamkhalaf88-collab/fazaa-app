import { el } from "../../core/dom.js";
import { avatar, lawyerSay } from "./lawyer-ui.js";
import { append, systemNote, typingBubble } from "./messages.js";

/**
 * "Lawyer now" mode. DEMO ONLY: the replies are scripted placeholders. The real
 * product connects to a human lawyer; every demo message is labelled as such.
 *
 * The session survives switching between "Sanad" and "lawyer" tabs inside one visit.
 */
export function createLawyerSession() {
  let name = "سلمى";
  let connected = false;
  let turn = 0;

  const say = (text, chips) => lawyerSay(name, text, chips);

  const topicLine = (topic) => `فهمت إنو سؤالك عن ${topic}`;

  return {
    setName(newName) {
      if (newName) name = newName;
    },
    /** Switch into lawyer mode: connect on first use, greet by topic afterwards. */
    open({ topic } = {}) {
      if (connected) {
        if (topic) say(`${topicLine(topic)}. احكيلي شو صاير معك.`);
        return;
      }
      const box = el("div", "connect");
      const av = avatar();
      av.setAttribute("class", "av");
      const text = el("div");
      const title = el("b", "fw-5", "عم نوصلك بمحامية...");
      text.append(title, el("div", "muted", "بتاخد أقل من دقيقة"));
      box.append(av, text);
      append(box);

      setTimeout(() => {
        box.remove();
        connected = true;
        turn = 0;
        systemNote("عرض تجريبي: بالنسخة الحقيقية بتحكي هون مع محامية حقيقية");
        say(
          `أهلاً فيكِ، أنا المحامية ${name}. كل إشي بنحكيه هون سري. ` +
            (topic ? `${topicLine(topic)}، احكيلي شو صاير معك.` : "احكيلي شو صاير معك، وعلى مهلك."),
        );
      }, 1600);
    },
    /** The user wrote something while in lawyer mode. */
    reply() {
      const typing = typingBubble("lw", "المحامية عم تكتب");
      setTimeout(() => {
        typing.remove();
        connected = true;
        turn++;
        if (turn === 1) {
          say(
            "شكراً إنك حكيتيلي، وإنتِ عملتي الصح. عشان أساعدك صح، بدي أعرف: وين ساكنة بالزبط؟ في ولاد؟ ومن قديش صار هالشي؟",
          );
        } else {
          say("تمام، الصورة وضحت. بقترح نحكي بمكالمة قصيرة نرتّب فيها الأوراق والخطوات. شو بيناسبك؟", [
            { label: "اتصلي فيّ", action: "callback", fill: true },
            { label: "خليني أكمل كتابة", action: "keep" },
          ]);
        }
      }, 1400);
    },
    reset() {
      connected = false;
      turn = 0;
    },
  };
}
