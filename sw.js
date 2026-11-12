/**
 * Service worker: makes the app load instantly and work offline.
 *
 *  - On install it downloads every file in PRECACHE (the whole app is ~0.5 MB).
 *  - Pages (navigations): network first, cache fallback, so updates arrive as soon as
 *    the user is online and the app still opens with no connection.
 *  - Everything else: cache first, refreshed in the background (stale-while-revalidate).
 *  - Only same-origin GET requests are handled. The AI proxy is cross-origin POST, so
 *    questions are never cached or replayed.
 *
 * RELEASING: bump CACHE_VERSION on every deploy. tests/precache.test.js fails if a file
 * in the app is missing from PRECACHE, so a forgotten file cannot ship unnoticed.
 */
const CACHE_VERSION = "fazaa-v19";

const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/sprite.svg",
  "assets/icons/favicon.svg",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/fonts/aref-ruqaa-arabic-700-normal.woff2",
  "assets/fonts/ibm-plex-sans-arabic-arabic-300-normal.woff2",
  "assets/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2",
  "assets/fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2",
  "assets/fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2",
  "assets/fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2",
  "assets/fonts/ibm-plex-sans-arabic-latin-400-normal.woff2",
  "assets/fonts/ibm-plex-sans-arabic-latin-500-normal.woff2",
  "assets/fonts/ibm-plex-sans-arabic-latin-600-normal.woff2",
  "styles/fonts.css",
  "styles/tokens.css",
  "styles/base.css",
  "styles/layout.css",
  "styles/components.css",
  "styles/screens/intro.css",
  "styles/screens/welcome.css",
  "styles/screens/country.css",
  "styles/screens/home.css",
  "styles/screens/chat.css",
  "styles/screens/sos.css",
  "styles/screens/support.css",
  "styles/screens/lawyer.css",
  "styles/screens/settings.css",
  "styles/screens/disguise.css",
  "src/main.js",
  "src/config.js",
  "src/core/dom.js",
  "src/core/router.js",
  "src/core/state.js",
  "src/core/store.js",
  "src/core/toast.js",
  "src/ui/actions.js",
  "src/ai/answerer.js",
  "src/data/contacts.js",
  "src/data/lawyers.js",
  "src/features/lawyers/lawyer-cards.js",
  "src/features/support/contacts.js",
  "src/ai/companion.js",
  "src/ai/danger.js",
  "src/ai/detect.js",
  "src/ai/normalize.js",
  "src/ai/remote-engine.js",
  "src/ai/retrieve.js",
  "src/ai/rules-engine.js",
  "src/ai/types.js",
  "src/ai/validate.js",
  "src/data/answers.js",
  "src/data/intents.js",
  "src/data/law/index.js",
  "src/data/law/basic-law-2003.js",
  "src/data/law/cyber-crimes-2018.js",
  "src/data/law/family-rights-gaza-1954.js",
  "src/data/law/personal-status-wb-1976.js",
  "src/features/chat/chat.js",
  "src/features/chat/lawyer-session.js",
  "src/features/chat/lawyer-live.js",
  "src/features/chat/lawyer-ui.js",
  "src/features/account/account.js",
  "src/features/chat/messages.js",
  "src/features/disguise/calculator.js",
  "src/features/disguise/disguise.js",
  "src/features/intro/intro.js",
  "src/features/nav/tabs.js",
  "src/features/settings/settings.js",
  "src/features/settings/theme.js",
  "src/features/sos/sos.js",
  "src/features/telemetry/telemetry.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Staff dashboard and API are never cached or served offline: they carry private case data.
  if (/^\/(api|admin)(\/|$)/.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("index.html")));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    }),
  );
});
