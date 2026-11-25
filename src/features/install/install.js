import { $ } from "../../core/dom.js";

/**
 * "Download" card on the welcome screen: one tap adds Fazaa to the device (a desktop shortcut or
 * a home-screen icon). Chromium and Edge offer the browser's own install prompt; iPhone and iPad
 * have no such prompt, so the card explains the Share menu instead. Nothing is sent anywhere.
 * Once she chooses "later" or installs, the card does not come back.
 *
 * @param {{ store: ReturnType<import("../../core/store.js").createStore>, sel?: string }} deps
 */
export function createInstall({ store }) {
  const card = $("[data-install]");
  if (!card) return;
  const text = $("[data-install-text]", card);
  const goButton = $("[data-install-go]", card);

  /** @type {any} the browser's install prompt, kept until she taps the button */
  let deferred = null;

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || /** @type {any} */ (navigator).standalone === true;
  const done = () => store.get("installDone", false);

  function show() {
    if (standalone || done()) return;
    card.hidden = false;
  }

  function finish() {
    store.set("installDone", true);
    card.hidden = true;
  }

  // Chromium and Edge: the browser offers install once the app meets its criteria
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    if (text) text.textContent = "نزّلي فزعة على جهازك، وبتنحفظ أيقونة على سطح المكتب أو الشاشة الرئيسية.";
    if (goButton) goButton.hidden = false;
    show();
  });

  // iPhone and iPad: no install prompt, so explain the Share menu
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios && !standalone && !done()) {
    if (text) text.textContent = "على الآيفون: اضغطي زر المشاركة، وبعدين «إضافة إلى الشاشة الرئيسية».";
    if (goButton) goButton.hidden = true;
    show();
  }

  card.addEventListener("click", async (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest("[data-install-skip]")) return finish();
    if (target.closest("[data-install-go]") && deferred) {
      const prompt = deferred;
      deferred = null;
      prompt.prompt();
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") finish();
    }
  });

  window.addEventListener("appinstalled", finish);
}
