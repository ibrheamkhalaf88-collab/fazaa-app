import { $ } from "../../core/dom.js";

/**
 * Desktop/home-screen download. A download button sits in the home top bar next to Settings, and
 * the first time she opens home a notice asks her to add Fazaa to the device, so the icon stays
 * there. Chromium and Edge offer the browser's install prompt; iPhone and iPad have no such prompt,
 * so the notice explains the Share menu instead. Nothing is sent anywhere.
 * Once she chooses "later" or installs, the notice does not come back; the top button stays until installed.
 *
 * @param {{
 *   store: ReturnType<import("../../core/store.js").createStore>,
 *   router: ReturnType<import("../../core/router.js").createRouter>,
 * }} deps
 */
export function createInstall({ store, router }) {
  const topButton = $("[data-install-top]");
  const banner = $("[data-install-banner]");
  if (!topButton || !banner) return;
  const text = $("[data-install-text]", banner);
  const goButton = $("[data-install-go]", banner);

  /** @type {any} the browser's install prompt, kept until she taps a download button */
  let deferred = null;

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || /** @type {any} */ (navigator).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installed = () => store.get("installDone", false);
  const canInstall = () => !standalone && !installed() && (deferred !== null || ios);

  const CHROMIUM_TEXT = "نزّلي فزعة على جهازك، وبتنحفظ أيقونة على سطح المكتب تبقى موجودة دايماً.";
  const IOS_TEXT = "على الآيفون: اضغطي زر المشاركة، وبعدين «إضافة إلى الشاشة الرئيسية».";

  function setText() {
    if (text) text.textContent = deferred ? CHROMIUM_TEXT : IOS_TEXT;
    if (goButton) goButton.hidden = !deferred;
  }

  function refreshTop() {
    topButton.hidden = !canInstall();
  }

  function showBanner() {
    setText();
    banner.hidden = false;
  }

  function hideBanner() {
    banner.hidden = true;
  }

  // the one-time notice: the first time she is on home and the install is possible
  function maybeNotice() {
    if (router.current !== "home" || store.get("installAsked", false) || !canInstall()) return;
    store.set("installAsked", true);
    showBanner();
  }

  function finish() {
    store.set("installDone", true);
    hideBanner();
    refreshTop();
  }

  async function prompt() {
    if (!deferred) return;
    const event = deferred;
    deferred = null;
    event.prompt();
    const choice = await event.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") finish();
    else refreshTop();
  }

  // Chromium and Edge: the browser offers install once the app meets its criteria
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    refreshTop();
    maybeNotice();
  });

  topButton.addEventListener("click", () => {
    if (deferred) return prompt();
    if (ios) showBanner();
  });

  banner.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest("[data-install-skip]")) return hideBanner();
    if (target.closest("[data-install-go]")) return prompt();
  });

  window.addEventListener("appinstalled", finish);
  router.onChange(() => maybeNotice());

  refreshTop();
  maybeNotice();
}
