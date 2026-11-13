/**
 * Entry point: build the pieces, wire them together, open the first screen.
 * No logic lives here; each feature owns its own behaviour (see docs/ARCHITECTURE.md).
 */
import { AI_BETA_ONLY, AI_ENDPOINT, API_BASE, CONTACTS_ENDPOINT, LAWYERS_ENDPOINT, TELEMETRY_ENDPOINT } from "./config.js";
import { createLawyerCards } from "./features/lawyers/lawyer-cards.js";
import { createContacts } from "./features/support/contacts.js";
import { createAssistant } from "./ai/assistant.js";
import { createRemoteEngine } from "./ai/remote-engine.js";
import { createSavedTopics } from "./ai/saved.js";
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

/** No "محامية الآن" with a live dot when no lawyer service is set up. */
function markLawyerService(enabled) {
  if (enabled) return;
  for (const node of document.querySelectorAll('[data-mode="lawyer"], .path.law')) {
    node.querySelector(".live")?.remove();
    const small = node.querySelector("small");
    for (const t of [...node.childNodes]) if (t.nodeType === 3 && t.textContent.includes("محامية الآن")) t.textContent = " محامية ";
    if (small) small.textContent = "مش متاحة بهالنسخة بعد";
  }
}

/**
 * `?beta=<code>` once on a tester's device: remembered on this device, then removed from the address bar
 * (so it does not stay in history or get shared). `?beta=off` leaves the beta.
 */
function readBetaCode(state) {
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get("beta");
    if (code === null) return;
    state.set("beta", code === "off" ? "" : code.replace(/[^\w-]/g, "").slice(0, 64));
    url.searchParams.delete("beta");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    /* no URL API: not a tester */
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

  const contacts = createContacts({ store, state, endpoint: CONTACTS_ENDPOINT });

  readBetaCode(state);
  // closed beta: the online AI only on a tester's device (src/config.js AI_BETA_ONLY)
  const aiAvailable = AI_ENDPOINT !== "" && (!AI_BETA_ONLY || Boolean(state.get("beta")));
  const account = createAccount({ base: API_BASE, store });
  // saved topics belonged to the rule-based assistant; kept only so quick exit / erase still delete old notes
  const saved = createSavedTopics({ store, state });
  // the AI-first assistant (owner's decision 2026-11-13): every reply from the AI, from the law texts
  const answerer = createAssistant({
    emergencyNumbers: contacts.emergencyNumbers,
    available: () => ({ ...contacts.available(), lawyer: account.enabled }),
    remote: aiAvailable ? createRemoteEngine({ endpoint: AI_ENDPOINT, beta: () => state.get("beta") }) : undefined,
    // owner's decision (2026-11-13): no notice before sending; what is sent is explained in Settings
    isRemoteEnabled: () => aiAvailable && state.get("aiOnline"),
    onRemoteError: (err) => {
      // the reason only (e.g. "proxy-status-502"), never the message
      console.warn("online answer failed:", err.message);
      telemetry.track("ai_error");
    },
  });

  const chat = createChat({
    state,
    router,
    answerer,
    telemetry,
    lawyerAvailable: () => account.enabled,
    ...(account.enabled ? { lawyer: createLiveLawyerSession({ account, state }) } : {}),
  });
  markLawyerService(account.enabled);
  const sos = createSos(store);
  const theme = createTheme(state);
  const disguise = createDisguise({
    state,
    store,
    router,
    // quick exit with "wipe" on: the chat, the AI memory, the unsent text, the safety plan and the
    // lawyer-chat sign-in on this device (see docs/PRIVACY.md for what stays on the server)
    wipe: () => {
      chat.reset({ signOut: true });
      sos.reset();
      saved.clear(); // saved topics too: quick exit leaves nothing that tells her story
    },
  });
  const settings = createSettings({ state, router, theme, chat, sos, aiAvailable, saved });

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
  // the saved-topics list changes while she chats: redraw it when Settings opens
  router.onChange((name) => name === "settings" && settings.render());
  // the list follows her region, so redraw whenever she opens the support screen
  contacts.render();
  router.onChange((name) => (name === "support" || name === "sos") && contacts.render());
  contacts.refresh();

  // real lawyers who are available now; the chat button only appears once the live chat is on
  const lawyerCards = createLawyerCards({ state, endpoint: LAWYERS_ENDPOINT, liveChat: account.enabled });
  lawyerCards.refresh();
  router.onChange((name) => (name === "home" || name === "lawyer") && lawyerCards.refresh());
  window.addEventListener("appinstalled", () => telemetry.track("install"));

  registerServiceWorker();
}

boot();
