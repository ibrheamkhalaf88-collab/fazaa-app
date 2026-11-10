/** Tiny DOM helpers. No framework: the app is a handful of screens. */

/** @param {string} selector @param {ParentNode} [root] */
export const $ = (selector, root = document) => root.querySelector(selector);

/** @param {string} selector @param {ParentNode} [root] @returns {Element[]} */
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Create an element. Text is set with textContent, never innerHTML, so user input and
 * AI output can never inject markup.
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** An <svg><use href="#id"/></svg> referencing a symbol in assets/sprite.svg. */
export function icon(id, className = "ic") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.appendChild(use);
  return svg;
}

/** A chip button with an icon, a label and data attributes. */
export function chip({ label, iconId, fill = false, data = {} }) {
  const b = el("button", `chip${fill ? " fill" : ""}`);
  b.type = "button";
  if (iconId) b.appendChild(icon(iconId));
  b.appendChild(document.createTextNode(label));
  for (const [k, v] of Object.entries(data)) b.setAttribute(`data-${k}`, v);
  return b;
}
