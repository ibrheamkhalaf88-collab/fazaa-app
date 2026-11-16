/**
 * Women's routes: alias + PIN account, her own cases and messages (/v1/users, /v1/login, /v1/me, /v1/cases).
 */
import { hashPin, newSalt, randomId, safeEqual, sha256Hex } from "../crypto.js";
import { normalizeTopic } from "../store/days.js";
import {
  REGIONS,
  LIMITS,
  SESSION_MS,
  USERNAME_RE,
  PIN_RE,
  PHONE_RE,
  weakPin,
  MAX_OPEN_CASES,
  json,
  fail,
  readJson,
  cleanText,
  firstName,
} from "../shared.js";

/** @param {import("../worker.js").RouteContext} ctx  @returns {Promise<Response|undefined>} */
export async function womenRoutes(ctx) {
  const { request, url, path, m, store, now, reply, seal, open } = ctx;

  /* ============ women: alias + PIN account ============ */
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const sessionHash = bearer ? await sha256Hex(bearer) : "";
  const me = async () => {
    const id = sessionHash ? await store.getSession(sessionHash, now) : null;
    return id ? store.getUser(id) : null;
  };
  const startSession = async (user) => {
    const token = randomId(32);
    await store.createSession({
      tokenHash: await sha256Hex(token),
      userId: user.id,
      now,
      expiresAt: now + SESSION_MS,
    });
    return token;
  };

  if (path === "/v1/users" && request.method === "POST") {
    const { value, error } = await readJson(request);
    if (error) return reply(fail(error, "bad-body"));
    const username = cleanText(value.username, 20).toLowerCase();
    const name = cleanText(value.name, LIMITS.fullName);
    const phone = cleanText(value.phone, LIMITS.phone).replace(/[\s-]/g, "");
    if (!USERNAME_RE.test(username)) return reply(fail(400, "bad-username"));
    if (!PIN_RE.test(String(value.pin ?? ""))) return reply(fail(400, "bad-pin"));
    if (weakPin(String(value.pin))) return reply(fail(400, "weak-pin"));
    if (!name || !PHONE_RE.test(phone) || !REGIONS.includes(value.region))
      return reply(fail(400, "bad-body"));
    const salt = newSalt();
    const user = {
      id: randomId(9),
      username,
      salt,
      pinHash: await hashPin(String(value.pin), salt),
      ...(await seal(JSON.stringify({ name, phone }))),
      region: value.region,
      now,
    };
    if (!(await store.createUser(user))) return reply(fail(409, "username-taken"));
    await store.track({ event: "signup", region: value.region, now });
    return reply(json({ token: await startSession(user), username }, 201));
  }

  if (path === "/v1/login" && request.method === "POST") {
    const { value, error } = await readJson(request);
    if (error) return reply(fail(error, "bad-body"));
    const user = await store.getUserByName(cleanText(value.username, 20).toLowerCase());
    if (user && user.lockedUntil > now) return reply(fail(429, "locked"));
    // same answer for "no such alias" and "wrong PIN"
    const ok = user && safeEqual(await hashPin(String(value.pin ?? ""), user.salt), user.pinHash);
    if (user) await store.noteLogin(user.id, !!ok, now);
    if (!ok) return reply(fail(401, "bad-credentials"));
    await store.track({ event: "login", region: user.region, now });
    return reply(json({ token: await startSession(user), username: user.username }));
  }

  if (path === "/v1/logout" && request.method === "POST") {
    if (sessionHash) await store.deleteSession(sessionHash);
    return reply(new Response(null, { status: 204 }));
  }

  if (path === "/v1/me") {
    const user = await me();
    if (!user) return reply(fail(401, "unauthorized"));
    if (request.method === "GET")
      return reply(
        json({ username: user.username, region: user.region, cases: await store.listUserCases(user.id) }),
      );
    if (request.method === "DELETE") {
      await store.deleteUser(user.id);
      return reply(new Response(null, { status: 204 }));
    }
  }

  if (path === "/v1/cases" && request.method === "POST") {
    const user = await me();
    if (!user) return reply(fail(401, "unauthorized"));
    const { value, error } = await readJson(request);
    if (error) return reply(fail(error, "bad-body"));
    const topic = cleanText(value.topic, LIMITS.topic) || "غير محدد";
    const text = cleanText(value.message, LIMITS.text);
    if (!text) return reply(fail(400, "bad-body"));
    // one account cannot flood the lawyers' queue
    const openCount = (await store.listUserCases(user.id)).filter((k) => k.status !== "closed").length;
    if (openCount >= MAX_OPEN_CASES) return reply(fail(429, "too-many-cases"));
    const id = randomId(9);
    await store.createCase({ id, userId: user.id, topic, region: user.region, now });
    await store.track({ event: "lawyer_request", region: user.region, now });
    await store.track({ event: `topic:${normalizeTopic(topic)}`, region: user.region, now });
    await store.addMessage({ caseId: id, sender: "user", ...(await seal(text)), now });
    return reply(json({ caseId: id }, 201));
  }

  const w = m(/^\/v1\/cases\/([\w-]+)\/messages$/);
  if (w) {
    const user = await me();
    const kase = await store.getCase(w[1]);
    // same answer for "no such case" and "not yours", so ids cannot be probed
    if (!user || !kase || kase.userId !== user.id) return reply(fail(401, "unauthorized"));

    if (request.method === "GET") {
      const rows = await store.listMessages(kase.id, Number(url.searchParams.get("after")) || 0);
      const messages = await Promise.all(
        rows.map(async (r) => ({ id: r.id, from: r.sender, text: await open(r), at: r.createdAt })),
      );
      let lawyer = null;
      if (kase.lawyerEmail) lawyer = firstName((await store.getStaff(kase.lawyerEmail))?.name) || "محامية";
      return reply(json({ status: kase.status, lawyer, messages }));
    }
    if (request.method === "POST") {
      if (kase.status === "closed") return reply(fail(409, "case-closed"));
      const { value, error } = await readJson(request);
      const text = cleanText(value?.text, LIMITS.text);
      if (error || !text) return reply(fail(error || 400, "bad-body"));
      await store.addMessage({ caseId: kase.id, sender: "user", ...(await seal(text)), now });
      return reply(json({ ok: true }));
    }
  }
}
