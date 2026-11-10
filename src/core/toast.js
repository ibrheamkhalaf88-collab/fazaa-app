import { $ } from "./dom.js";

let timer;

/** Show a short message at the bottom of the screen for ~2.6 s. */
export function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => node.classList.remove("show"), 2600);
}
