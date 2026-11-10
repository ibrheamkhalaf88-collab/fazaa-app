# Architecture

Zero-build, no framework: HTML + CSS + native ES modules. Reason: the app must load fast on weak phones and
poor networks, work offline, and be auditable by a lawyer-or-engineer reading the source.

## Boot sequence (`src/main.js`)

1. Fetch `assets/sprite.svg` and inline it into `<body>` (so `<use href="#id">` works under a strict CSP).
2. Build the pieces with plain factory functions, passing dependencies in (no globals, no singletons):
   `createStore` -> `createState` -> `createRouter` -> `createAnswerer` -> `createChat` / `createSos` /
   `createTheme` / `createDisguise` / `createSettings`, plus `createTelemetry` (anonymous counters) and `createAccount` +
   `createLiveLawyerSession` (only when `API_BASE` is set; otherwise the scripted demo session is used).
3. Bind one delegated click handler (`src/ui/actions.js`) and the composer / keyboard inputs.
4. Show the last screen (never the disguise), register `sw.js`.

## Layers (imports only go downward)

```
main.js
  ui/actions.js            click -> feature call, via data-* attributes
  features/*               chat, account, sos, disguise, settings, nav, telemetry   (own their DOM)
  ai/*                     question -> Answer (no DOM)
  data/*                   law text, keywords, canned answers   (no logic)
  core/*                   dom, store, state, router, toast     (no feature knowledge)
```

`ai/` and `data/` never touch the DOM, so they are unit-tested in Node without a browser.

## State and storage

`core/store.js` wraps `localStorage` (namespace `sanad:`, JSON, never throws; falls back to memory when storage
is blocked). `core/state.js` holds `{theme, country, wipe, pin, dg, user, aiOnline}` and notifies subscribers.
Chat messages are **not** persisted. The only things that identify her to the server are the session token
(`sanad:session`, created when she signs up for a lawyer) and nothing else; wiping the app removes it. "Erase all" resets state and bumps the chat `epoch` so a late async reply
cannot reappear.

## Navigation

Screens are `<section class="screen" data-screen="x">` in `index.html`. `router.show(name)` toggles `hidden` and
sets `#app[data-cur]`, which CSS uses (e.g. to show the tab bar). The disguise screen is never saved as "last".

## Click handling

Markup declares intent, `actions.js` executes it: `data-go="home"`, `data-chat="blackmail"`, `data-ask="..."`,
`data-exit`, `data-setting="aiOnline"`, `data-action="mic"`. First matching attribute wins. To add a button you
usually only touch `index.html`.

## Styling

Load order = cascade order (see `<link>`s in `index.html`): `fonts` -> `tokens` -> `base` -> `layout` ->
`components` -> `screens/*`. Colours and radii are CSS variables in `tokens.css`; dark mode is defined twice
(OS preference and the manual `[data-theme=dark]`) and a unit test keeps both copies identical.
Component classes are generic (`.btn`, `.chip`, `.card`); anything screen-specific lives in `screens/<name>.css`.

## Disguise

`features/disguise/calculator.js` is a pure state machine (tested). `disguise.js` swaps screens, wipes chat and
listens for `Esc` / the floating exit button. Typing `CALC_CODE` followed by `=` returns to the app.
Honest limit: it hides the app from a glance, not from someone who inspects the phone or browser history.

## Offline / PWA

`sw.js`: precache list of every shipped file (a test fails if a file is missing), network-first for page
navigations, stale-while-revalidate for the rest, same-origin GET only. Bump `CACHE_VERSION` on every release.

## Tests

| Command            | Covers                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`         | intent detection, rules, law-text fingerprints, calculator, validation, retrieval, answerer, remote engine, proxy worker, store/state, tokens, precache list |
| `npm run test:e2e` | real Chromium against a server that applies the real `_headers` (so CSP violations fail the test)                                                            |
