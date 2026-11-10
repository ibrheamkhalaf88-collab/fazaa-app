import { $, el } from "../../core/dom.js";

/** Low-level helpers for the message list. Everything is appended with textContent. */

export const messageList = () => $("#msgs");

export function scrollChat() {
  const body = $("#chat-body");
  body.scrollTop = body.scrollHeight;
}

/** Add a node to the chat and keep the newest message in view. */
export function append(node) {
  messageList().appendChild(node);
  scrollChat();
  return node;
}

/** Three animated dots in a bubble ("...is typing"). */
export function typingBubble(className, label) {
  const bubble = el("div", className);
  const dots = el("span", "typing-dots");
  dots.setAttribute("aria-label", label);
  dots.append(el("i"), el("i"), el("i"));
  bubble.appendChild(dots);
  return append(bubble);
}

/** Small centred system note ("you are back with Fazaa"). */
export const systemNote = (text) => append(el("div", "sys", text));
