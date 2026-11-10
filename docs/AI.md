# AI layer

## Goal

Answer free-text questions in plain dialect **without ever inventing law**. The model may only rephrase and
organise text that the app has already retrieved from its own law corpus.

## Flow (`src/ai/answerer.js`)

```
question
  |- offline rules (always)  ---> Answer | null          src/ai/rules-engine.js
  |- online AI, only if opt-in:
  |     retrieve articles (keyword overlap)              src/ai/retrieve.js
  |     none found?  -> STOP, model is never called
  |     POST {question, articles} to proxy               src/ai/remote-engine.js
  |     validate reply (citations ⊆ retrieved ids)       src/ai/validate.js
  '- safety merge: if rules detect danger, force sos=true on any answer
result -> chat shows it, labelled "written by AI" when source = "ai"; null -> "not covered" screen
```

If the network, proxy or validation fails the user silently gets the offline answer.

## Privacy contract

- Off by default; the toggle is in Settings and stored only on the device.
- When on, only the typed question (<=500 chars) and article ids/text go to **your** proxy. No cookies
  (`credentials:"omit"`), no referrer, no user id, no history.
- The proxy does not log bodies, sends `Cache-Control: no-store`, and forwards only to the Anthropic API.
- Phone numbers / names are not requested anywhere; still, tell users not to type identifying details.

## Safety rules enforced in code

1. Citations must be a subset of the retrieved article ids (client **and** proxy re-check).
2. Lengths capped, markup stripped, at least one concrete step required.
3. Model is forced to answer through one tool schema (`give_answer`), so there is no free-form text path.
4. User text is wrapped and `<` `>` stripped before it reaches the prompt (prompt-injection hardening).
5. Danger keywords always add the emergency (SOS) block regardless of what the model says.

## Turn it on

1. `cd server/ai-proxy`; set `ALLOWED_ORIGINS` in `wrangler.toml` to your site origin(s).
2. Pick the provider in `wrangler.toml` (`PROVIDER = "gemini" | "nvidia" | "anthropic"`), then store its key:
   `npx wrangler secret put GEMINI_API_KEY` (or `NVIDIA_API_KEY`, `ANTHROPIC_API_KEY`), then `npx wrangler deploy`.
   Optional: `MODEL` var, a `RATE_LIMITER` binding.
3. In `src/config.js` set `AI_ENDPOINT` to the worker URL.
4. In `_headers` add that origin to `connect-src`. Bump `CACHE_VERSION` in `sw.js`. Deploy.

## Providers (`server/ai-proxy/providers.js`)

| PROVIDER           | Key secret                          | Default model                 | Notes                                      |
| ------------------ | ----------------------------------- | ----------------------------- | ------------------------------------------ |
| `gemini` (default) | `GEMINI_API_KEY` (Google AI Studio) | `gemini-2.5-flash-lite`            | free tier; good Arabic                     |
| `nvidia`           | `NVIDIA_API_KEY` (build.nvidia.com) | `meta/llama-3.3-70b-instruct` | free trial credits; Arabic weaker, test it |
| `anthropic`        | `ANTHROPIC_API_KEY`                 | `claude-sonnet-5-5`           | paid                                       |

All providers go through the same validation, so changing provider cannot weaken the citation rules.
**Privacy catch:** free tiers of hosted models may use submitted text to improve their products (check the current
terms of Google AI Studio and NVIDIA before launch). Users type sensitive things. Either use a paid tier with data-use
disabled, or state this clearly in the AI opt-in text. Model names change; check the provider's model list.

## Honest limits (read before launch)

- The corpus is only the 2018 Cyber Crimes decree (articles 15, 16, 22, 52). AI adds value there only;
  family-law questions are answered by canned rules or "not covered".
- The proxy was tested with **mocks**, not against the live API. Run a real end-to-end test and review 50+ answers
  with a lawyer before enabling for the public.
- Applicability differs between Gaza and the West Bank (and decrees have been amended); get a legal audit.
- Not legal advice; the UI says so and points to a lawyer.

## Adding a law

See `CONTENT.md`. Retrieval and the proxy pick it up automatically once it is exported from `src/data/law/index.js`.
