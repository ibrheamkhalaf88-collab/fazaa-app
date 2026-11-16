# AI layer

## Goal

Answer free-text questions in plain dialect **without ever inventing law**. The model may only rephrase and
organise text that the app has already retrieved from its own law corpus.

## Flow (`src/ai/answerer.js`, updated 2026-11-13)

```
her message
  1. read into memory (RAM only)                       conversation.js remember() + situation.js observe()
       people («جوزي», «أختي»), events with who/when («هددني مبارح»), denials dropped («ما ضربني»),
       pronouns resolved only when unambiguous («هي حكت معه» -> asks «مع مين؟»), topics, goal, progress,
       limits she stated, which questions were asked / answered, corrections («مش جوزي، أخوي»)
  2. answers to OUR last question (safety question, danger follow-up, «بتحبي أوريكِ القانون؟»)
  3. danger                                           danger.js  fixed reviewed text, offline, before any model
  4. small talk, «بتتذكري شو قلتلك؟», «صار معي إشي جديد», «بدي نكمل موضوع …» (opt-in saved topics)
  5. what she needs: listen / understand / steps / legal   conversation.js classifyNeed()
       legal: exact article by number | online AI (grounded) | offline rules (+ the topic of the conversation
              when the question alone is too short) ; then verbatim region texts for the topic when nothing
              is cited, the law and region named, the missing Gaza custody text said plainly
       other: online AI (talk, no law) | offline reply built from the situation (localTalk):
              say back what she told, one fitting line, ONE question never asked/answered before,
              topic-specific smallest safe steps, check-in after 3 replies without a question
  6. one gentle safety question when violence was mentioned without a clear "now"
  7. opt-in only: short notes per topic saved on the device              saved.js
reply -> chat; "written by AI" label only when source = "ai"; null -> "not covered" screen
```

If the network, proxy or validation fails she gets the offline reply, never labelled as AI.

### Closed beta and one rewrite (2026-11-13)

- **Closed beta** (`src/config.js` `AI_BETA_ONLY = true`): the online AI runs only on a device that opened the
  site once with `?beta=<code>` (stored on that device, removed from the address bar; `?beta=off` leaves).
  Everyone else gets the offline replies, sees «قريباً» for the online AI, and nothing they type leaves the
  phone. Server side, set the Worker secret `AI_BETA_CODE` (`cd server/api && npx wrangler secret put AI_BETA_CODE`)
  and requests without that code never reach the model and use no quota. Open to everyone only after the live
  evaluation and the reviews: `AI_BETA_ONLY = false` and delete the secret.
- **One rewrite:** a model reply that breaks a rule (safety promised, "always here", law in a support reply,
  a number not in the article) is sent back ONCE with the rule it broke; if the rewrite still breaks a rule,
  the app answers offline. `REWRITE=off` disables it.
- Lines Gemini actually wrote on the live site on 2026-11-13 are test cases (`REAL_MODEL_LINES`).

### Provider reliability (`server/ai-proxy/worker.js`, `breaker.js`)

Per model: retries while busy (primary, backup model, primary) within 35 s; a **circuit breaker** stops calling a
model after 3 transient failures for 60 s (the app answers offline at once instead of waiting); per-provider
timeouts (`UPSTREAM_MS_GEMINI`, `UPSTREAM_MS`). A bad key is never retried and never opens the circuit.
Cross-provider fallback is deliberately not wired (see `docs/PRIVACY.md` §3).

### Evaluation

`npm run ai:assistant-eval` runs `tests/fixtures/assistant-scenarios.js` on the offline path and prints measured
rates (pass rates, repetition, questions asked twice, latency) and a transcript in `docs/evidence/`. The same set
runs in `npm test` (`tests/assistant-eval.test.js`). It measures the app's own behaviour, NOT the model's.

## Privacy contract

- On by default (since 2026-11-12); the toggle is in Settings and stored only on the device.
- When on (no notice in the chat since 2026-11-13, owner's decision; Settings explains it): the message (<=1200 chars, never cut silently), the region and the kind of
  reply needed go to **your** server. With it: the last 6 messages of the session, the
  limits she stated, and a short summary (topic, notes labelled as her unverified report, goal, questions already
  asked). No cookies (`credentials:"omit"`), no referrer, no user id, never the lawyer chat.
  The session memory is RAM only and is wiped with the chat (src/ai/conversation.js).
- The proxy does not log bodies, sends `Cache-Control: no-store`, and forwards only to the Anthropic API.
- Phone numbers / names are not requested anywhere; still, tell users not to type identifying details.

## Safety rules enforced in code

1. Citations must be a subset of the retrieved article ids (client **and** proxy re-check).
2. Lengths capped, markup stripped, at least one concrete step required.
3. Model is forced to answer through one tool schema (`give_answer`), so there is no free-form text path.
4. User text is wrapped and `<` `>` stripped before it reaches the prompt (prompt-injection hardening).
5. Danger keywords always add the emergency (SOS) block regardless of what the model says.

## Turn it on

### Option A (recommended): from the admin dashboard, no terminal

1. Deploy the staff API (see `DEPLOYMENT.md`). It serves the endpoint `POST /api/v1/answer` on the site's own domain, so the CSP needs no change.
2. In `src/config.js` set `AI_ENDPOINT = "/api/v1/answer"`, bump `CACHE_VERSION` in `sw.js`, deploy the site.
3. A developer opens the dashboard, section **إعدادات الذكاء**, picks the provider, optionally a model (default is the lightest one, `gemini-flash-lite-latest`), pastes the API key, saves, and presses **جرّبي الاتصال**.

The key is stored encrypted (AES-GCM, `MESSAGE_KEY`) in D1, is write-only (the dashboard shows only its last 4 characters), and every save, test and delete is written to the audit log without the key. Settings saved in the dashboard win over Worker secrets; deleting them falls back to `GEMINI_API_KEY` / `NVIDIA_API_KEY` / `ANTHROPIC_API_KEY` if those exist.

### Option B: standalone proxy (no database)

1. `cd server/ai-proxy`; set `ALLOWED_ORIGINS` in `wrangler.toml` to your site origin(s).
2. Pick the provider (`PROVIDER = "gemini" | "nvidia" | "anthropic"`), then store its key:
   `npx wrangler secret put GEMINI_API_KEY` (or `NVIDIA_API_KEY`, `ANTHROPIC_API_KEY`), then `npx wrangler deploy`.
   Optional: `MODEL` var, a `RATE_LIMITER` binding.
3. In `src/config.js` set `AI_ENDPOINT` to the worker URL.
4. In `_headers` add that origin to `connect-src`. Bump `CACHE_VERSION` in `sw.js`. Deploy.

## Answers kept for review

When the AI answers through the staff API, the **answer** is stored (lead, steps, note, cited articles, region, model) so lawyers can mark it correct or wrong in the dashboard (**مراجعة أجوبة الذكاء**). The **question is never stored**, nor any account, IP or device. Phone numbers, links, e-mails and @handles are scrubbed from the answer first (`server/api/scrub.js`), and rows are deleted after 90 days. A developer can export the reviewed answers as JSON to improve the prompt, build an evaluation set, or later fine-tune. The settings text tells users that only the answer text is kept.

## Providers (`server/ai-proxy/providers.js`)

| PROVIDER           | Key secret                          | Default model                 | Notes                                      |
| ------------------ | ----------------------------------- | ----------------------------- | ------------------------------------------ |
| `gemini` (default) | `GEMINI_API_KEY` (Google AI Studio) | `gemini-flash-lite-latest`    | free tier; good Arabic                     |
| `nvidia`           | `NVIDIA_API_KEY` (build.nvidia.com) | `meta/llama-3.3-70b-instruct` | free trial credits; Arabic weaker, test it |
| `anthropic`        | `ANTHROPIC_API_KEY`                 | `claude-sonnet-5-5`           | paid                                       |

All providers go through the same validation, so changing provider cannot weaken the citation rules.
**Privacy catch:** free tiers of hosted models may use submitted text to improve their products (check the current
terms of Google AI Studio and NVIDIA before launch). Users type sensitive things. Either use a paid tier with data-use
disabled, or state this clearly in the AI opt-in text. Model names change; check the provider's model list.

## Honest limits (read before launch)

- The corpus is small and selective: Cyber Crimes decree (4 articles), West Bank Personal Status Law 1976
  (23 articles: maintenance, divorce, custody), Gaza Family Rights Law 1954 (9 articles: maintenance, divorce),
  Basic Law 2003 (5 articles). Anything outside these gets "not covered" with no model call.
- Gaza texts come from an unofficial PDF copy (the official one has damaged glyphs). A lawyer must verify them.
- Known gaps: Gaza custody, the 2019 marriage-age amendment, Gaza application of the cyber decree.
- Run `npm run law:verify` on a machine with internet: it compares each West Bank / Basic Law article with maqam.
- The proxy was tested with **mocks**, not against the live API. Run a real end-to-end test and review 50+ answers
  with a lawyer before enabling for the public.
- Applicability differs between Gaza and the West Bank (and decrees have been amended); get a legal audit.
- Not legal advice; the UI says so and points to a lawyer.

## Adding a law

See `CONTENT.md`. Retrieval and the proxy pick it up automatically once it is exported from `src/data/law/index.js`.
