import { chip, el } from "../../core/dom.js";
import { append, systemNote } from "./messages.js";

/**
 * The lawyer tab when the real service is NOT set up (config API_BASE = ""): an honest message, never a
 * pretend lawyer.
 *
 * Until 2026-11-12 this file played a scripted demo ("عم نوصلك بمحامية... بتاخد أقل من دقيقة", a lawyer
 * called سلمى promising secrecy). In a public build that reads like a real service to someone who may be
 * in danger, so it was removed. A demo for presentations must run on a separate, clearly marked build.
 *
 * Same interface as the live session (lawyer-live.js): open, reply, reset, setName, action.
 */
export function createLawyerSession() {
  function unavailable() {
    const box = el("div", "a");
    box.append(
      el("b", null, "خدمة المحامية مش شغّالة بهالنسخة بعد."),
      el(
        "div",
        null,
        "يعني ما في محامية بتستقبل رسايل من هون هلأ، ورسايلك بهالتبويب ما بتنبعت لحدا. بتقدري تكمّلي مع فزعة، أو تشوفي الجهات اللي ممكن تساعدك.",
      ),
    );
    const row = el("div", "acts");
    row.append(
      chip({ label: "رجوع لفزعة", fill: true, data: { mode: "ai" } }),
      chip({ label: "مين بيساعدني", iconId: "i-hands", data: { go: "support" } }),
    );
    box.appendChild(row);
    return append(box);
  }

  return {
    setName() {},
    open() {
      unavailable();
    },
    /** She wrote while in this tab: say clearly that it was not sent. */
    reply() {
      systemNote("رسالتك ما انبعتت لحدا: خدمة المحامية مش متوفرة هلأ.");
    },
    reset() {},
    action() {
      return false;
    },
  };
}
