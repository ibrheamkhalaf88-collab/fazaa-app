/**
 * Staff routes (lawyers and developers), email + password session: /v1/staff/*.
 * The order of the checks inside matters (see the comments): keep it.
 */
import { answerQuestion } from "../../ai-proxy/worker.js";
import { PROVIDERS } from "../../ai-proxy/providers.js";
import {
  passwordProblem,
  PASSWORD_MAX,
  readCookie,
  resolveStaff,
  sessionCookie,
  STAFF_COOKIE,
  STAFF_SESSION_MS,
  tempPassword,
} from "../auth.js";
import { checkMessageKey, hashPin, newSalt, randomId, safeEqual, sha256Hex } from "../crypto.js";
import { validateContacts } from "../../../src/data/contacts.js";
import { applyProfile, MANAGER_FIELDS, pick, publicLawyer, SELF_FIELDS } from "../../../src/data/lawyers.js";
import {
  LIMITS,
  json,
  fail,
  readJson,
  cleanText,
  firstName,
  AI_SETTING,
  CONTACTS_SETTING,
  MODEL_RE,
  API_KEY_RE,
  loadAi,
  aiEnv,
  listModels,
  aiSummary,
  aiUsage,
  parseAnswer,
} from "../shared.js";

/** @param {import("../worker.js").RouteContext} ctx  @returns {Promise<Response|undefined>} */
export async function staffRoutes(ctx) {
  const {
    request,
    env,
    deps,
    url,
    path,
    m,
    store,
    fetchImpl,
    now,
    reply,
    seal,
    open,
    loadContacts,
    loadProfiles,
    saveProfiles,
    profileOf,
  } = ctx;

  /* ============ staff routes (email + password session) ============ */
  if (path.startsWith("/v1/staff/")) {
    // State-changing calls must come from a page (the cookie is also SameSite=Strict).
    if (request.method !== "GET" && !request.headers.get("origin"))
      return reply(fail(403, "forbidden-origin"));

    const newSession = async (email) => {
      const token = randomId(32);
      await store.createStaffSession({
        tokenHash: await sha256Hex(token),
        email,
        now,
        expiresAt: now + STAFF_SESSION_MS,
      });
      return sessionCookie(token, Math.floor(STAFF_SESSION_MS / 1000));
    };
    const checkPassword = async (auth, password) =>
      typeof password === "string" &&
      password.length <= PASSWORD_MAX &&
      safeEqual(await hashPin(password, auth.salt), auth.hash);
    const setTemp = async (email) => {
      const password = tempPassword();
      const salt = newSalt();
      await store.setStaffPassword(email, {
        salt,
        hash: await hashPin(password, salt),
        mustChange: true,
        now,
      });
      await store.deleteStaffSessions(email);
      return password;
    };

    if (path === "/v1/staff/login" && request.method === "POST") {
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      const email = cleanText(value.email, LIMITS.email).toLowerCase();
      const member = email ? await store.getStaff(email) : null;
      const auth = member ? await store.getStaffAuth(email) : null;
      if (auth && auth.lockedUntil > now) return reply(fail(429, "locked"));
      let ok = false;
      if (auth) ok = (await checkPassword(auth, value.password)) && member.active !== false;
      else await hashPin("x", newSalt()); // same work either way, so timing does not reveal accounts
      if (auth) await store.noteStaffLogin(email, ok, now);
      // one answer for "no such account", "wrong password" and "suspended"
      if (!ok) return reply(fail(401, "bad-credentials"));
      await store.touchStaff(email, now);
      await store.addAudit({ actor: email, action: "staff-login", target: "", now });
      return reply(
        json({ ok: true, mustChange: auth.mustChange }, 200, { "set-cookie": await newSession(email) }),
      );
    }

    const token = deps.staffEmail ? "" : readCookie(request, STAFF_COOKIE);
    const tokenHash = token ? await sha256Hex(token) : "";
    const email = deps.staffEmail
      ? await deps.staffEmail(request)
      : tokenHash
        ? await store.getStaffSession(tokenHash, now)
        : null;
    const staff = await resolveStaff(email, env, store);

    if (path === "/v1/staff/logout" && request.method === "POST") {
      if (tokenHash) await store.deleteStaffSession(tokenHash);
      return reply(new Response(null, { status: 204, headers: { "set-cookie": sessionCookie("", 0) } }));
    }

    if (!staff) return reply(fail(401, "not-staff"));
    const need = (role) => (staff.role === role ? null : reply(fail(403, "wrong-role")));
    /**
     * The OWNER is the only one who manages developers (add, promote, demote, suspend, reset password,
     * remove). Without it, one stolen developer account could reset the owner's password and lock her out.
     * OWNER_EMAILS (Worker variable/secret, comma separated) wins; otherwise the first developer (S-001…).
     */
    const ownerEmails = async () => {
      const set = String(env.OWNER_EMAILS || "")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (set.length) return set;
      const devs = (await store.listStaff())
        .filter((s) => s.role === "developer" && s.active !== false && /^S-\d+$/.test(s.code || ""))
        .sort((a, b) => Number(a.code.slice(2)) - Number(b.code.slice(2)));
      if (devs.length) return [devs[0].email];
      // no developer in the table yet (first run, local dev server): the bootstrap list
      return String(env.DEVELOPER_EMAILS || "")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    };
    const isOwner = async () => staff.role === "developer" && (await ownerEmails()).includes(staff.email);
    const ownerOnly = () => reply(fail(403, "owner-only"));
    const auth = await store.getStaffAuth(staff.email);
    const mustChange = Boolean(auth?.mustChange) && !deps.staffEmail;

    // a lawyer may also be a "manager" of the lawyers (set by a developer)
    const profiles =
      staff.role === "lawyer" || path.startsWith("/v1/staff/lawyers") ? await loadProfiles() : {};
    const isManager = staff.role === "lawyer" && profileOf(profiles, staff.email).manager;
    const canManageLawyers = staff.role === "developer" || isManager;

    if (path === "/v1/staff/me" && request.method === "GET") {
      await store.touchStaff(staff.email, now);
      const extra =
        staff.role === "lawyer"
          ? { manager: isManager, available: profileOf(profiles, staff.email).available }
          : {};
      return reply(
        json({
          email: staff.email,
          role: staff.role,
          name: staff.name,
          code: staff.code || "",
          mustChange,
          owner: await isOwner(),
          ...extra,
        }),
      );
    }

    // A temporary password allows only /me, /logout and /password (above and below) until it is
    // changed. This check stays ABOVE every other staff route: before 2026-11-14 it sat lower and a
    // temporary password could still add lawyers and edit profiles.
    if (mustChange && path !== "/v1/staff/password") return reply(fail(403, "must-change-password"));

    /* ---- a lawyer's own profile and availability ---- */
    if (path === "/v1/staff/profile") {
      const denied = need("lawyer");
      if (denied) return denied;
      if (request.method === "GET") return reply(json({ profile: profileOf(profiles, staff.email) }));
      if (request.method === "PUT") {
        const { value, error } = await readJson(request);
        if (error) return reply(fail(error, "bad-body"));
        try {
          profiles[staff.email] = applyProfile(profileOf(profiles, staff.email), pick(value, SELF_FIELDS));
        } catch (e) {
          return reply(fail(400, e.message));
        }
        await saveProfiles(profiles, staff.email);
        if ("available" in value)
          await store.addAudit({
            actor: staff.email,
            action: profiles[staff.email].available ? "lawyer-available" : "lawyer-unavailable",
            target: staff.email,
            now,
          });
        return reply(json({ profile: profiles[staff.email] }));
      }
    }

    /* ---- managing the lawyers (developer, or a lawyer who is a manager) ---- */
    if (path === "/v1/staff/lawyers") {
      if (!canManageLawyers) return reply(fail(403, "wrong-role"));
      const lawyerRows = async () => {
        const seen = new Map((await store.listStaffActivity()).map((r) => [r.email, r.lastSeen]));
        const rows = [];
        for (const s of await store.listStaff()) {
          if (s.role !== "lawyer") continue;
          const p = profileOf(profiles, s.email);
          const open = (await store.listMine(s.email)).length;
          rows.push({
            ...s,
            ...p,
            openCases: open,
            listed: Boolean(publicLawyer(s, p, open)),
            lastSeen: seen.get(s.email) ?? null,
          });
        }
        return rows;
      };
      if (request.method === "GET")
        return reply(json({ lawyers: await lawyerRows(), canSetManager: staff.role === "developer" }));

      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      const target = cleanText(value.email, LIMITS.email).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return reply(fail(400, "bad-staff"));
      const existing = await store.getStaff(target);
      const fields = staff.role === "developer" ? [...MANAGER_FIELDS, "manager"] : MANAGER_FIELDS;
      let tempPw = null;

      if (request.method === "POST") {
        // Creating an account that can read women's cases is a developer's job, not a manager's
        // (since 2026-11-13): a manager edits profiles, availability and case limits only.
        if (staff.role !== "developer") return reply(fail(403, "developer-only"));
        // add a new lawyer (or turn an unknown email into one); never touch a developer's account
        const bootDev = (env.DEVELOPER_EMAILS || "")
          .toLowerCase()
          .split(",")
          .map((s) => s.trim());
        if ((existing && existing.role !== "lawyer") || bootDev.includes(target) || target === staff.email)
          return reply(fail(409, "not-a-lawyer"));
        const name = firstName(value.name);
        if (!name) return reply(fail(400, "name-required"));
        await store.upsertStaff({ email: target, role: "lawyer", name, now });
        await store.addAudit({ actor: staff.email, action: "staff-add", target: `${target} (lawyer)`, now });
        tempPw = (await store.getStaffAuth(target)) ? null : await setTemp(target);
      } else if (request.method === "PUT") {
        if (!existing || existing.role !== "lawyer") return reply(fail(404, "no-such-lawyer"));
        if (typeof value.name === "string" && firstName(value.name))
          await store.upsertStaff({ email: target, role: "lawyer", name: firstName(value.name), now });
      } else {
        return reply(fail(405, "method"));
      }
      try {
        profiles[target] = applyProfile(profileOf(profiles, target), pick(value, fields));
      } catch (e) {
        return reply(fail(400, e.message));
      }
      await saveProfiles(profiles, staff.email);
      await store.addAudit({ actor: staff.email, action: "lawyer-update", target, now });
      return reply(
        json({
          lawyers: await lawyerRows(),
          canSetManager: staff.role === "developer",
          ...(tempPw ? { tempPassword: tempPw } : {}),
        }),
      );
    }

    if (path === "/v1/staff/password" && request.method === "POST") {
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      if (!auth || !(await checkPassword(auth, value.current))) return reply(fail(400, "wrong-password"));
      const problem = passwordProblem(value.next, staff.email);
      if (problem) return reply(fail(400, problem));
      if (value.next === value.current) return reply(fail(400, "password-unchanged"));
      const salt = newSalt();
      await store.setStaffPassword(staff.email, {
        salt,
        hash: await hashPin(value.next, salt),
        mustChange: false,
        now,
      });
      await store.deleteStaffSessions(staff.email); // signs out every other device
      await store.addAudit({ actor: staff.email, action: "password-change", target: "", now });
      return reply(json({ ok: true }, 200, { "set-cookie": await newSession(staff.email) }));
    }

    /* ---- developer: system health ---- */
    if (path === "/v1/staff/health" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      const started = Date.now();
      let dbOk = true;
      try {
        await store.userStats(now, 1);
      } catch {
        dbOk = false;
      }
      const dbMs = Date.now() - started;
      let site = null;
      if (env.PUBLIC_SITE_URL) {
        const t = Date.now();
        try {
          const res = await fetchImpl(env.PUBLIC_SITE_URL, {
            method: "HEAD",
            signal: AbortSignal.timeout(6000),
          });
          site = { url: env.PUBLIC_SITE_URL, ok: res.ok, status: res.status, ms: Date.now() - t };
        } catch {
          site = { url: env.PUBLIC_SITE_URL, ok: false, status: 0, ms: Date.now() - t };
        }
      }
      const ai = aiSummary(env, await loadAi(store, open));
      const week = await store.analytics(now, 7);
      return reply(
        json({
          checkedAt: now,
          db: { ok: dbOk, ms: dbMs },
          encryption: await checkMessageKey(env.MESSAGE_KEY),
          site,
          ai: {
            configured: ai.hasKey,
            provider: ai.provider,
            model: ai.model || ai.defaultModel,
            ...(await aiUsage(store, env, now)),
            asked7: week.totals.ask_ai || 0,
            errors7: week.totals.ai_error || 0,
          },
          lastPurgeAt: await store.lastAuditAt("purge"),
        }),
      );
    }

    /* ---- developer ---- */
    if (path === "/v1/staff/stats" && request.method === "GET")
      return (
        need("developer") ||
        reply(
          json({
            ...(await store.stats(now)),
            retention: {
              closedDays: Number(env.RETENTION_CLOSED_DAYS || 7),
              idleDays: Number(env.RETENTION_IDLE_DAYS || 30),
            },
          }),
        )
      );

    /* ---- AI answers kept for review: lawyers and developers ---- */
    if (path === "/v1/staff/ai-answers" && request.method === "GET") {
      const verdict = ["pending", "good", "bad"].includes(url.searchParams.get("verdict"))
        ? url.searchParams.get("verdict")
        : "all";
      const rows = await store.listAiAnswers({ verdict, limit: 50 });
      return reply(json({ items: rows.map(parseAnswer), counts: await store.aiAnswerCounts() }));
    }

    const review = m(/^\/v1\/staff\/ai-answers\/(\d+)$/);
    if (review && request.method === "PUT") {
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      if (!["good", "bad", ""].includes(value.verdict)) return reply(fail(400, "bad-verdict"));
      const ok = await store.reviewAiAnswer(Number(review[1]), value.verdict || null, staff.email, now);
      return ok ? reply(json({ ok: true })) : reply(fail(404, "not-found"));
    }

    // reviewed answers as JSON, to improve the prompt/evaluation set or train a model
    if (path === "/v1/staff/ai-answers/export" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      const rows = (await store.listAiAnswers({ verdict: "all", limit: 5000 })).filter((r) => r.verdict);
      await store.addAudit({
        actor: staff.email,
        action: "ai-answers-export",
        target: `${rows.length} answers`,
        now,
      });
      return reply(json({ items: rows.map(parseAnswer) }));
    }

    /* ---- AI settings: developer only; the key is write-only ---- */
    if (path === "/v1/staff/ai-config" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      return reply(
        json({ ...aiSummary(env, await loadAi(store, open)), ...(await aiUsage(store, env, now)) }),
      );
    }

    if (path === "/v1/staff/ai-config" && request.method === "PUT") {
      const denied = need("developer");
      if (denied) return denied;
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      const saved = await loadAi(store, open);
      const provider = value.provider;
      if (!PROVIDERS[provider]) return reply(fail(400, "bad-provider"));
      const model = cleanText(value.model, 80);
      if (model && !MODEL_RE.test(model)) return reply(fail(400, "bad-model"));
      const fallbackModel = cleanText(value.fallbackModel, 80);
      if (fallbackModel && !MODEL_RE.test(fallbackModel)) return reply(fail(400, "bad-model"));
      const typedKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";
      if (typedKey && !API_KEY_RE.test(typedKey)) return reply(fail(400, "bad-key"));
      // keep the stored key when only the model/provider changes (and the provider is the same)
      const apiKey = typedKey || (saved?.provider === provider ? saved.apiKey : "");
      if (!apiKey) return reply(fail(400, "key-required"));
      await store.setSetting({
        key: AI_SETTING,
        ...(await seal(JSON.stringify({ provider, model, fallbackModel, apiKey }))),
        now,
        by: staff.email,
      });
      await store.addAudit({
        actor: staff.email,
        action: "ai-config-set",
        target: `${provider}${model ? ` / ${model}` : ""}${fallbackModel ? ` (+ ${fallbackModel})` : ""}${typedKey ? " (new key)" : ""}`,
        now,
      });
      return reply(
        json({ ...aiSummary(env, await loadAi(store, open)), ...(await aiUsage(store, env, now)) }),
      );
    }

    /* ---- contacts editor (developer) ---- */
    if (path === "/v1/staff/contacts") {
      const denied = need("developer");
      if (denied) return denied;
      if (request.method === "GET") return reply(json(await loadContacts()));
      if (request.method === "PUT") {
        const { value, error } = await readJson(request, 32768);
        if (error) return reply(fail(error, "bad-body"));
        let contacts;
        try {
          contacts = validateContacts(value.contacts);
        } catch (e) {
          return reply(fail(400, e.message));
        }
        // the confirmation date comes from the server: kept while the same number stays confirmed,
        // set to now when she ticks "confirmed" or confirms a changed number
        const before = new Map((await loadContacts()).contacts.map((c) => [c.id, c]));
        for (const c of contacts) {
          const old = before.get(c.id);
          const same = old?.verified && old.phone === c.phone && old.whatsapp === c.whatsapp;
          c.verifiedAt = c.verified ? (same && old.verifiedAt) || now : null;
        }
        await store.setSetting({
          key: CONTACTS_SETTING,
          ...(await seal(JSON.stringify(contacts))),
          now,
          by: staff.email,
        });
        await store.addAudit({
          actor: staff.email,
          action: "contacts-set",
          target: `${contacts.length}`,
          now,
        });
        return reply(json(await loadContacts()));
      }
      if (request.method === "DELETE") {
        await store.deleteSetting(CONTACTS_SETTING);
        await store.addAudit({ actor: staff.email, action: "contacts-reset", target: "", now });
        return reply(json(await loadContacts()));
      }
    }

    if (path === "/v1/staff/ai-config" && request.method === "DELETE") {
      const denied = need("developer");
      if (denied) return denied;
      await store.deleteSetting(AI_SETTING);
      await store.addAudit({ actor: staff.email, action: "ai-config-clear", target: "", now });
      return reply(json(aiSummary(env, null)));
    }

    // the models this key can use, straight from the provider (the key itself never leaves the server)
    if (path === "/v1/staff/ai-models" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      return reply(json(await listModels(await loadAi(store, open), fetchImpl)));
    }

    // one real round trip with a fixed sample question, so a developer knows the key works.
    // {model} tests that one model alone (no backup, no retry) without saving it.
    if (path === "/v1/staff/ai-config/test" && request.method === "POST") {
      const denied = need("developer");
      if (denied) return denied;
      const { value } = await readJson(request);
      const only = cleanText(value?.model, 80);
      if (only && !MODEL_RE.test(only)) return reply(fail(400, "bad-model"));
      const live = aiEnv(env, await loadAi(store, open));
      const started = Date.now();
      const { status, body } = await answerQuestion(
        "حدا عم يبتزني بصوري",
        "ps-wb",
        only ? { ...live, MODEL: only, RETRY: "off" } : live,
        fetchImpl,
      );
      const ok = status === 200 && Boolean(body.answer);
      await store.addAudit({
        actor: staff.email,
        action: "ai-config-test",
        target: `${only || "current"}: ${ok ? "ok" : body.error || "no-answer"}`,
        now,
      });
      return reply(json({ ok, error: ok ? null : body.error || "no-answer", ms: Date.now() - started }));
    }

    if (path === "/v1/staff/analytics" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days")) || 14));
      const team = await store.listStaff();
      const seen = new Map((await store.listStaffActivity()).map((r) => [r.email, r]));
      return reply(
        json({
          ...(await store.analytics(now, days)),
          staff: team.map((m) => ({
            ...m,
            lastSeen: seen.get(m.email)?.lastSeen ?? null,
            sessions: seen.get(m.email)?.sessions ?? 0,
          })),
        }),
      );
    }

    // team-wide work numbers + her own, for the lawyer dashboard (counts only, no content)
    if (path === "/v1/staff/work" && request.method === "GET") {
      const denied = need("lawyer");
      if (denied) return denied;
      const stats = await store.stats(now);
      const usage = await store.analytics(now, 14);
      return reply(
        json({
          byStatus: stats.byStatus,
          byRegion: stats.byRegion,
          series: stats.series,
          avgClaimWaitMs: stats.avgClaimWaitMs,
          oldestWaitingMs: stats.oldestWaitingMs,
          topics: usage.topics,
          visits: usage.totals.visit + usage.totals.visit_return,
          me: await store.lawyerStats(staff.email, now, 14),
        }),
      );
    }

    // developers: accounts and activity, never names or phones
    if (path === "/v1/staff/users" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      return reply(json({ ...(await store.userStats(now)), users: await store.listUsers(100) }));
    }

    // developers can delete an account (with her cases); still never see her name or phone
    const delUser = m(/^\/v1\/staff\/users\/([\w-]+)$/);
    if (delUser && request.method === "DELETE") {
      const denied = need("developer");
      if (denied) return denied;
      const user = await store.getUser(delUser[1]);
      if (!user) return reply(fail(404, "not-found"));
      await store.deleteUser(user.id);
      await store.addAudit({ actor: staff.email, action: "user-delete", target: user.username, now });
      return reply(json({ ok: true }));
    }

    if (path === "/v1/staff/team/reset" && request.method === "POST") {
      const denied = need("developer");
      if (denied) return denied;
      const { value, error } = await readJson(request);
      if (error) return reply(fail(error, "bad-body"));
      const target = cleanText(value.email, LIMITS.email).toLowerCase();
      if (target === staff.email) return reply(fail(400, "use-change-password"));
      const member = await store.getStaff(target);
      if (!member) return reply(fail(404, "not-found"));
      // a developer's password can only be reset by the owner (a stolen account cannot take over hers)
      if (member.role === "developer" && !(await isOwner())) return ownerOnly();
      const password = await setTemp(target);
      await store.addAudit({ actor: staff.email, action: "staff-password-reset", target, now });
      return reply(json({ ok: true, tempPassword: password }));
    }

    if (path === "/v1/staff/audit" && request.method === "GET")
      return need("developer") || reply(json({ audit: await store.listAudit(100) }));

    if (path === "/v1/staff/team") {
      const denied = need("developer");
      if (denied) return denied;
      const releaseCases = async (email) => {
        const n = await store.releaseCases(email);
        if (n)
          await store.addAudit({
            actor: staff.email,
            action: "cases-release",
            target: `${email} (${n})`,
            now,
          });
      };
      if (request.method === "GET") return reply(json({ team: await store.listStaff() }));
      if (request.method === "PUT") {
        const { value, error } = await readJson(request);
        if (error) return reply(fail(error, "bad-body"));
        const target = cleanText(value.email, LIMITS.email).toLowerCase();
        const role = value.role;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target) || !["lawyer", "developer"].includes(role))
          return reply(fail(400, "bad-staff"));
        const existing = await store.getStaff(target);
        if (target === staff.email && (role !== staff.role || value.active === false))
          return reply(fail(400, "cannot-change-self"));
        // creating, promoting, changing or suspending a DEVELOPER is for the owner only
        if (
          (role === "developer" || existing?.role === "developer") &&
          target !== staff.email &&
          !(await isOwner())
        )
          return ownerOnly();
        await store.upsertStaff({ email: target, role, name: firstName(value.name), now });
        const activeChanged =
          typeof value.active === "boolean" && existing && value.active !== existing.active;
        if (activeChanged) {
          await store.setStaffActive(target, value.active);
          if (!value.active) await store.deleteStaffSessions(target); // signed out at once
          await store.addAudit({
            actor: staff.email,
            action: value.active ? "staff-restore" : "staff-suspend",
            target,
            now,
          });
        }
        // nobody else can answer her claimed cases, so they go back to the queue
        if (existing?.role === "lawyer" && (role !== "lawyer" || (activeChanged && !value.active)))
          await releaseCases(target);
        await store.addAudit({ actor: staff.email, action: "staff-add", target: `${target} (${role})`, now });
        // a new member (or one from before passwords) gets a temporary password, shown once
        const tempPw = (await store.getStaffAuth(target)) ? null : await setTemp(target);
        return reply(json({ ok: true, ...(tempPw ? { tempPassword: tempPw } : {}) }));
      }
      if (request.method === "DELETE") {
        const target = (url.searchParams.get("email") || "").toLowerCase();
        if (target === staff.email) return reply(fail(400, "cannot-remove-self"));
        if ((await store.getStaff(target))?.role === "developer" && !(await isOwner())) return ownerOnly();
        await releaseCases(target);
        await store.removeStaff(target);
        await store.addAudit({ actor: staff.email, action: "staff-remove", target, now });
        return reply(json({ ok: true }));
      }
    }

    /* ---- lawyer ---- */
    if (path === "/v1/staff/queue" && request.method === "GET")
      return need("lawyer") || reply(json({ queue: await store.listQueue() }));
    if (path === "/v1/staff/mine" && request.method === "GET")
      return need("lawyer") || reply(json({ cases: await store.listMine(staff.email) }));

    /* ---- developer: read-only view of every conversation (each opening is audited) ---- */
    if (path === "/v1/staff/conversations" && request.method === "GET") {
      const denied = need("developer");
      if (denied) return denied;
      const team = new Map((await store.listStaff()).map((s) => [s.email, s]));
      const cases = (await store.listAllCases(200)).map((k) => ({
        ...k,
        lawyer: k.lawyerEmail ? team.get(k.lawyerEmail)?.name || k.lawyerEmail : null,
      }));
      return reply(json({ cases }));
    }

    const c = m(/^\/v1\/staff\/cases\/([\w-]+)\/(claim|messages|close|note|client)$/);
    if (c && staff.role === "developer") {
      const [, id, action] = c;
      if (action !== "messages" || request.method !== "GET") return reply(fail(403, "wrong-role"));
      const kase = await store.getCase(id);
      if (!kase) return reply(fail(404, "no-case"));
      const after = Number(url.searchParams.get("after")) || 0;
      // Every reading is accounted for. A refresh does not add a line each time, but the request
      // parameters can never skip the log: before 2026-11-13, "?after=1" read the case unlogged.
      const last = await store.lastAuditFor({ actor: staff.email, action: "dev-read-case", target: id });
      if (!after || last == null || now - last > 30 * 60_000)
        await store.addAudit({ actor: staff.email, action: "dev-read-case", target: id, now });
      const rows = await store.listMessages(id, after);
      const messages = await Promise.all(
        rows.map(async (r) => ({ id: r.id, from: r.sender, text: await open(r), at: r.createdAt })),
      );
      return reply(json({ status: kase.status, topic: kase.topic, region: kase.region, messages }));
    }
    if (c) {
      const denied = need("lawyer");
      if (denied) return denied;
      const [, id, action] = c;
      const kase = await store.getCase(id);
      if (!kase) return reply(fail(404, "no-case"));

      if (action === "claim" && request.method === "POST") {
        // she takes a case only if she is on duty, covers the woman's region and has room for it
        const me = profileOf(profiles, staff.email);
        if (!me.available) return reply(fail(409, "not-available"));
        if (!me.regions.includes(kase.region)) return reply(fail(409, "other-region"));
        if ((await store.listMine(staff.email)).length >= me.maxCases) return reply(fail(409, "case-limit"));
        const ok = await store.claimCase(id, staff.email, now);
        if (ok) await store.addAudit({ actor: staff.email, action: "claim", target: id, now });
        return reply(ok ? json({ ok: true }) : fail(409, "already-claimed"));
      }
      // everything below: only the lawyer who claimed it
      if (kase.lawyerEmail !== staff.email) return reply(fail(403, "not-your-case"));

      if (action === "client" && request.method === "GET") {
        const user = await store.getUser(kase.userId);
        if (!user) return reply(fail(404, "no-client"));
        await store.addAudit({ actor: staff.email, action: "view-contact", target: id, now });
        const contact = JSON.parse(await open({ iv: user.iv, body: user.body }));
        return reply(
          json({ username: user.username, name: contact.name, phone: contact.phone, region: user.region }),
        );
      }
      if (action === "messages" && request.method === "GET") {
        const rows = await store.listMessages(id, Number(url.searchParams.get("after")) || 0);
        const messages = await Promise.all(
          rows.map(async (r) => ({ id: r.id, from: r.sender, text: await open(r), at: r.createdAt })),
        );
        return reply(json({ status: kase.status, topic: kase.topic, region: kase.region, messages }));
      }
      if (action === "messages" && request.method === "POST") {
        if (kase.status !== "claimed") return reply(fail(409, "case-closed"));
        const { value, error } = await readJson(request);
        const text = cleanText(value?.text, LIMITS.text);
        if (error || !text) return reply(fail(error || 400, "bad-body"));
        const sealed = await seal(text);
        await store.addMessage({ caseId: id, sender: "lawyer", ...sealed, now });
        return reply(json({ ok: true }));
      }
      if (action === "note") {
        if (request.method === "GET") {
          const row = await store.getNote(id);
          return reply(json({ note: row ? await open(row) : "" }));
        }
        if (request.method === "PUT") {
          const { value, error } = await readJson(request);
          if (error) return reply(fail(error, "bad-body"));
          const text = cleanText(value.note, LIMITS.note);
          await store.setNote({ caseId: id, ...(await seal(text)), now });
          return reply(json({ ok: true }));
        }
      }
      if (action === "close" && request.method === "POST") {
        await store.closeCase(id, now);
        await store.addAudit({ actor: staff.email, action: "close", target: id, now });
        return reply(json({ ok: true }));
      }
    }
    return reply(fail(404, "not-found"));
  }
}
