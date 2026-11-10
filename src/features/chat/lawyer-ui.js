import { chip, el } from "../../core/dom.js";
import { append } from "./messages.js";

/** The small hijab avatar used in lawyer bubbles. */
export function avatar() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 120 150");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", "#w-hijab");
  use.setAttribute("style", "--c1:#17163A;--c2:var(--emphasis);--c3:#fff");
  svg.appendChild(use);
  return svg;
}

/** A lawyer message bubble, optionally with action chips. */
export function lawyerSay(name, text, chips) {
  const bubble = el("div", "lw");
  const who = el("div", "who");
  who.append(avatar(), document.createTextNode(`المحامية ${name}`));
  bubble.append(who, el("div", null, text));
  if (chips) {
    const row = el("div", "acts");
    for (const c of chips)
      row.appendChild(chip({ label: c.label, fill: c.fill, data: { action: c.action } }));
    bubble.appendChild(row);
  }
  return append(bubble);
}
