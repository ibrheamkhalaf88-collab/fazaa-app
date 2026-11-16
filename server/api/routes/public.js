/**
 * Public routes, no account needed: lawyers on duty, contacts, the AI answer, anonymous counters.
 */
import { answerQuestion, betaAllowed, parseAnswerRequest } from "../../ai-proxy/worker.js";
import { MAX_BODY_BYTES } from "../../../src/ai/limits.js";
import { EVENTS } from "../store/days.js";
import { publicContacts } from "../../../src/data/contacts.js";
import { publicLawyer } from "../../../src/data/lawyers.js";
import { REGIONS, json, fail, readJson, loadAi, aiEnv, keepAnswer, takeAiSlot } from "../shared.js";

/** @param {import("../worker.js").RouteContext} ctx  @returns {Promise<Response|undefined>} */
export async function publicRoutes(ctx) {
  const {
    request,
    env,
    url,
    path,
    store,
    fetchImpl,
    now,
    reply,
    open,
    loadContacts,
    loadProfiles,
    profileOf,
  } = ctx;

  /* ============ public: lawyers available now (first name and speciality only) ============ */
  if (path === "/v1/lawyers" && request.method === "GET") {
    const region = url.searchParams.get("region");
    const all = await loadProfiles();
    const out = [];
    for (const s of await store.listStaff()) {
      if (s.role !== "lawyer") continue;
      const p = profileOf(all, s.email);
      if (region && !p.regions.includes(region)) continue;
      const card = publicLawyer(s, p, (await store.listMine(s.email)).length);
      if (card) out.push(card);
    }
    return reply(json({ lawyers: out }, 200, { "cache-control": "no-store" }));
  }

  /* ============ public: emergency numbers and support organisations (no personal data) ============ */
  if (path === "/v1/contacts" && request.method === "GET") {
    const { contacts, updatedAt } = await loadContacts();
    // switched-off entries and the team's internal notes never leave the server
    return reply(
      json({ contacts: publicContacts(contacts), updatedAt }, 200, {
        "cache-control": "public, max-age=300",
      }),
    );
  }

  /* ============ public AI endpoint: the key is the one a developer saved in the dashboard ============ */
  if (path === "/v1/answer" && request.method === "POST") {
    if (!request.headers.get("origin")) return reply(fail(403, "forbidden-origin")); // browsers only
    const { value, error } = await readJson(request, MAX_BODY_BYTES);
    if (error) return reply(fail(error === 413 ? 413 : 400, "bad-question"));
    const req = parseAnswerRequest(value);
    if (req.error) return reply(fail(400, req.error));
    // closed beta: not a tester -> no model call, no quota used; the app answers offline
    if (!betaAllowed(req, env)) return reply(json({ answer: null }, 200, { "cache-control": "no-store" }));
    if (!(await takeAiSlot(store, env, now))) return reply(fail(429, "daily-limit"));
    const saved = await loadAi(store, open);
    const live = aiEnv(env, saved);
    const { status, body } = await answerQuestion(req.question, req.country, live, fetchImpl, req);
    // kept for lawyer review: law answers only (talk replies echo her words more closely)
    // (chat replies retell her story: never kept)
    if (
      body.answer &&
      body.answer.kind !== "talk" &&
      body.answer.kind !== "chat-ai" &&
      body.answer.source === "ai"
    )
      await keepAnswer(store, body.answer, req.country, live, now);
    return reply(json(body, status));
  }

  /* ============ anonymous usage counters ============ */
  // Whitelisted event + region only. Nothing identifying is read, stored or logged.
  if (path === "/v1/ping" && request.method === "POST") {
    const { value, error } = await readJson(request);
    if (error || !EVENTS.includes(value.event)) return reply(fail(error || 400, "bad-event"));
    const region = REGIONS.includes(value.region) ? value.region : "none";
    const ms =
      value.event === "ask_ai" ? Math.min(60_000, Math.max(0, Math.round(Number(value.ms) || 0))) : 0;
    await store.track({ event: value.event, region, ms, now });
    return reply(new Response(null, { status: 204 }));
  }
}
