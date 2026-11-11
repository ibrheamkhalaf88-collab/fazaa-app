/**
 * Entry point: build the pieces, wire them together, open the first screen.
 * No logic lives here; each feature owns its own behaviour (see docs/ARCHITECTURE.md).
 */
import { AI_ENDPOINT, API_BASE, TELEMETRY_ENDPOINT } from "./config.js";
import { createAnswerer } from "./ai/answerer.js";
import { createRemoteEngine } from "./ai/remote-engine.js";
import { createRouter } from "./core/router.js";
import { createState } from "./core/state.js";
import { createStore } from "./core/store.js";
import { createChat } from "./features/chat/chat.js";
import { createDisguise } from "./features/disguise/disguise.js";
import { createIntro } from "./features/intro/intro.js";
import { renderTabs } from "./features/nav/tabs.js";
import { createSettings } from "./features/settings/settings.js";
import { createTheme } from "./features/settings/theme.js";
import { createSos } from "./features/sos/sos.js";
import { createAccount } from "./features/account/account.js";
import { createLiveLawyerSession } from "./features/chat/lawyer-live.js";
import { createTelemetry } from "./features/telemetry/telemetry.js";
import { bindActions } from "./ui/actions.js";

/** The icon sprite is a separate file (easier to review); inline it so <use href="#id"> works everywhere. */
async function inlineSprite() {
  try {
    const res = await fetch(new URL("../assets/sprite.svg", import.meta.url));
    // our own same-origin SVG file, not user text
    // eslint-disable-next-line no-restricted-properties
    if (res.ok) document.body.insertAdjacentHTML("afterbegin", await res.text());
  } catch {
    /* offline on very first load: icons stay blank, the app still works */
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("service worker:", err));
}

async function boot() {
  await inlineSprite();

  const store = createStore();
  const state = createState(store);
  const router = createRouter(store);

  const telemetry = createTelemetry({ endpoint: TELEMETRY_ENDPOINT, state, store, router });

  const aiAvailable = AI_ENDPOINT !== "";
  const answerer = createAnswerer({
    remote: aiAvailable ? createRemoteEngine({ endpoint: AI_ENDPOINT }) : undefined,
    isRemoteEnabled: () => aiAvailable && state.get("aiOnline"),
    onRemoteError: (err) => {
      console.warn("online answer failed, using offline rules:", err.message);
      telemetry.track("ai_error");
    },
  });

  const account = createAccount({ base: API_BASE, store });
  const chat = createChat({
    state,
    router,
    answerer,
    telemetry,
    ...(account.enabled ? { lawyer: createLiveLawyerSession({ account, state }) } : {}),
  });
  const sos = createSos(store);
  const theme = createTheme(state);
  const disguise = createDisguise({
    state,
    store,
    router,
    wipe: () => {
      chat.reset();
      sos.reset();
    },
  });
  const settings = createSettings({ state, router, theme, chat, sos, aiAvailable });

  renderTabs();
  chat.bindComposer();
  disguise.bindGlobalInput();
  bindActions({ router, chat, sos, disguise, settings });

  theme.apply();
  settings.render();
  sos.restore();
  const intro = createIntro({ store, router });
  router.show(intro.startScreen());

  telemetry.visit();
  router.onChange((name) => name === "sos" && telemetry.track("sos_open"));
  window.addEventListener("appinstalled", () => telemetry.track("install"));

  registerServiceWorker();
}

boot();
