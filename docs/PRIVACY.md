# Privacy: what is stored, who can read it, what each button erases

Written 2026-11-12 from the code (not from intentions). Keep it in sync with the code and with the texts in the
app (`index.html`, `src/features/chat/chat.js`, `src/features/chat/lawyer-live.js`).

## 1. Data map

| Data | Where | Who can read it | Kept for |
| --- | --- | --- | --- |
| Chat with Fazaa (the assistant) | the phone's screen; session memory in RAM only (`src/ai/conversation.js`) | her | until wipe, quick exit (with wipe on), or the page is closed/reloaded |
| Message sent to the online AI (AI on by default; no notice in the chat since 2026-11-13, see below) | in transit: Fazaa server → AI provider | the provider, under its terms | Fazaa does not store it. The provider may keep it for a short time (see the provider's terms; `server/ai-proxy/providers.js` lists them) |
| Session context (last 6 messages, stated limits, and since 2026-11-13 a short summary of what she told: topic, up to 8 one-line notes marked "her report, not verified", her stated goal, which questions were already asked) | same as above | same | sent with each AI message while the AI is on (the notice that asked first was removed on 2026-11-13) |
| Working memory of the session (people, events, time words, topics, asked/answered; `src/ai/situation.js`) | RAM only, inside the answerer | her | until «محادثة جديدة», quick exit, region change, or the page is closed/reloaded |
| **Saved topics** (OFF by default; `src/ai/saved.js`) | the phone's localStorage (`fazaa:savedTopics`): per topic, up to 8 short notes like «جوزك هددك ياخد الولاد (مبارح)» + her stated goal. Never the messages, never limits such as "her phone is checked", never anything from a self-harm exchange, never the lawyer chat. **Not encrypted.** | anyone holding the unlocked phone (Settings lists them) | 30 days (deleted on every read), or until she deletes a note / a topic / all, switches it off, quick exit with wipe, or «امسحي كل شي». Never sent to a server, never shown in a greeting or notification. |
| AI LAW answers (never the question; names, phones, links scrubbed) | D1 `ai_answers` | lawyers and developers (review) | 90 days |
| Settings (region, theme, disguise, AI on/off) | the phone's localStorage (`fazaa:*`) | anyone holding the unlocked phone | until «امسحي كل شي» in Settings |
| Lawyer-chat account: alias, hashed PIN, region | D1 `users` | developers see alias/region/dates only | deleted on request, or after 180 days without sign-in |
| Name + phone given for the lawyer | D1 `users`, ENCRYPTED | only the lawyer who took her case (every opening is audited) | with the account |
| Case messages (her and the lawyer) | D1 `messages`, ENCRYPTED | the lawyer who took the case; **developers (read-only, audited — owner's decision 2026-11-11)** | closed case: 7 days; idle case: 30 days; or with the account |
| Lawyer's private notes | D1 `case_notes`, ENCRYPTED | that lawyer | with the case |
| Lawyer-chat sign-in token | the phone's localStorage (`fazaa:session`); only its hash on the server | — | 30 days, or until logout / quick exit with wipe |
| Anonymous counters (event × day × region) | D1 `events_daily` | developers | indefinitely (no person in them) |
| Audit log (who did what, never text) | D1 `audit` | developers | 90 days |
| Backups | Cloudflare D1 Time Travel (restore points) | the Cloudflare account owner | Cloudflare's window (check the current plan; the encrypted fields stay encrypted in a restore). A deleted account can therefore still exist in a restore point until that window passes. |

## 2. What each action erases

| Action | On this phone | On the server |
| --- | --- | --- |
| **Quick exit (wipe ON, the default)** | the chat on screen, the AI session memory, the unsent text in the box, the safety-plan ticks, the lawyer-chat sign-in token, **all saved topics** (the «تذكّر المواضيع» switch itself stays as she set it); a reply still on its way is cancelled and dropped | the lawyer-chat session is revoked (best effort: if offline, it expires on its own; the phone no longer has the token). Case messages are NOT deleted. |
| Quick exit (wipe OFF) | nothing: the app is only hidden | nothing |
| Settings → «امسحي كل شي» | everything above + all settings | same as quick exit |
| Chat → «محادثة جديدة» (trash icon) | the chat and the session memory (saved topics stay) | nothing |
| Settings → «تذكّر المواضيع» OFF | all saved topics (consent withdrawn) | nothing (they were never there) |
| Settings → «مش صح، احذفيها» / «احذفي الموضوع» / «احذفي كل المواضيع» | that note / that topic / all saved topics | nothing |
| Lawyer chat → «تسجيل خروج» | the sign-in token | the session |
| Lawyer chat → «حذف حسابي» | the sign-in token (only if the deletion succeeded) | the account, her name/phone, all her cases, messages and notes. If it fails, nothing is deleted and she is told so. |

Quick exit does **not** erase the browser history or other traces outside the app, and the app says so in Settings.

## 3. Decisions the owner should review

- **Developers can read every conversation** (decided 2026-11-11). Impact: anyone with a developer account (or a
  stolen one) reads women's case messages. Safer alternative: a single "supervisor" role (the owner only), every
  opening audited and visible to the lawyer, or read access only after a lawyer flags the case. The app texts now
  say «فريق فزعة التقني» can read the messages, so the promise matches the behaviour either way.
- **Saved topics are not encrypted** (2026-11-13). A key stored in the same browser would not protect against
  the person holding the phone, which is the realistic threat, so the app does not claim encryption. Real
  protection needs the PIN lock (a PIN-derived key); until then the feature is OFF by default and its text says
  plainly that anyone opening the app can see the notes. Decide whether to keep it, or hide it until the PIN lock.
- **Cross-provider fallback is NOT wired** (2026-11-13). `configuredProviders()` in the uncommitted
  `providers.js` would let a question go to a second provider; that sends her text to a company the notice does
  not name. Wire it only together with a notice that names every provider in the chain.
- **AI on by default** (decided 2026-11-12). **No notice in the chat (owner's decision, 2026-11-13):** her first
  message goes to the AI provider (Google Gemini) without asking first. What is sent is explained only under
  «أجوبة أذكى عبر الإنترنت» in Settings, where she can switch it off. Risk accepted by the owner: a woman who never
  opens Settings may not know her text leaves for a third party. A legal review of this is advised before launch. Re-check the provider's data terms before launch (see the uncommitted work in
  `server/ai-proxy/providers.js`, which adds per-provider privacy summaries and requires a PAID Gemini project).
