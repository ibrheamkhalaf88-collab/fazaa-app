/**
 * In-memory store: the reference implementation of the store contract. Used by tests and
 * for running the API locally without Cloudflare. Same behaviour as store/d1.js.
 */
import { buildAnalytics, buildSeries, countByDay, dayKey } from "./days.js";

export function createMemoryStore() {
  const cases = new Map();
  let messages = [];
  const staff = new Map();
  let nextId = 1;
  const notes = new Map();
  let audit = [];
  const settings = new Map();
  let aiAnswers = [];
  let aiSeq = 0;
  const daily = new Map();
  const events = new Map();
  const seen = new Map();
  let staffSeq = 0;
  const nextStaffCode = () => `S-${String(++staffSeq).padStart(3, "0")}`;
  const lawyerDaily = new Map();
  const users = new Map();
  const sessions = new Map();
  const staffAuth = new Map();
  const staffSessions = new Map();
  const bumpLawyer = (now, email, field) => {
    const k = `${dayKey(now)}|${email}`;
    const r = lawyerDaily.get(k) || { day: dayKey(now), email, claimed: 0, closed: 0 };
    r[field] += 1;
    lawyerDaily.set(k, r);
  };
  const bump = (now, patch) => {
    const k = dayKey(now);
    const d = daily.get(k) || { day: k, created: 0, closed: 0, claimed: 0, claimWaitMs: 0 };
    for (const [f, v] of Object.entries(patch)) d[f] += v;
    daily.set(k, d);
  };

  return {
    async createCase({ id, tokenHash = "", userId = "", topic, region, now }) {
      bump(now, { created: 1 });
      cases.set(id, {
        id,
        tokenHash,
        userId,
        topic,
        region,
        status: "open",
        lawyerEmail: null,
        createdAt: now,
        claimedAt: null,
        closedAt: null,
        lastActivity: now,
      });
    },
    async getCase(id) {
      const c = cases.get(id);
      return c ? { ...c } : null;
    },
    async addMessage({ caseId, sender, iv, body, now }) {
      messages.push({ id: nextId++, caseId, sender, iv, body, createdAt: now });
      cases.get(caseId).lastActivity = now;
    },
    async listMessages(caseId, afterId = 0) {
      return messages
        .filter((m) => m.caseId === caseId && m.id > afterId)
        .slice(0, 200)
        .map(({ id, sender, iv, body, createdAt }) => ({ id, sender, iv, body, createdAt }));
    },
    /** Every case, most recently active first (developers' read-only view). */
    async listAllCases(limit = 200) {
      return [...cases.values()]
        .sort((a, b) => b.lastActivity - a.lastActivity)
        .slice(0, limit)
        .map(({ id, topic, region, status, lawyerEmail, createdAt, lastActivity }) => ({
          id,
          topic,
          region,
          status,
          lawyerEmail,
          createdAt,
          lastActivity,
        }));
    },
    async listQueue() {
      return [...cases.values()]
        .filter((c) => c.status === "open")
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, 100)
        .map(({ id, topic, region, createdAt }) => ({ id, topic, region, createdAt }));
    },
    async listMine(email) {
      return [...cases.values()]
        .filter((c) => c.lawyerEmail === email && c.status === "claimed")
        .sort((a, b) => b.lastActivity - a.lastActivity)
        .map(({ id, topic, region, status, createdAt, lastActivity }) => ({
          id,
          topic,
          region,
          status,
          createdAt,
          lastActivity,
        }));
    },
    async claimCase(id, email, now) {
      const c = cases.get(id);
      if (!c || c.status !== "open") return false;
      Object.assign(c, { status: "claimed", lawyerEmail: email, claimedAt: now, lastActivity: now });
      bump(now, { claimed: 1, claimWaitMs: now - c.createdAt });
      bumpLawyer(now, email, "claimed");
      return true;
    },
    async closeCase(id, now) {
      const c = cases.get(id);
      if (!c || c.status === "closed") return;
      Object.assign(c, { status: "closed", closedAt: now, lastActivity: now });
      bump(now, { closed: 1 });
      if (c.lawyerEmail) bumpLawyer(now, c.lawyerEmail, "closed");
    },
    async stats(now) {
      const count = (key) => {
        const out = {};
        for (const c of cases.values()) out[c[key]] = (out[c[key]] || 0) + 1;
        return out;
      };
      const open = [...cases.values()].filter((c) => c.status === "open");
      return {
        byStatus: count("status"),
        byRegion: count("region"),
        oldestWaitingMs: open.length ? now - Math.min(...open.map((c) => c.createdAt)) : 0,
        lawyers: [...staff.values()].filter((s) => s.role === "lawyer").length,
        messages: messages.length,
        ...buildSeries([...daily.values()], now),
      };
    },
    /* ---- women's accounts ---- */
    async createUser({ id, username, salt, pinHash, iv, body, region, now }) {
      if ([...users.values()].some((u) => u.username === username)) return false;
      users.set(id, {
        id,
        username,
        salt,
        pinHash,
        iv,
        body,
        region,
        createdAt: now,
        lastLogin: null,
        fails: 0,
        lockedUntil: 0,
      });
      return true;
    },
    async getUser(id) {
      const u = users.get(id);
      return u ? { ...u } : null;
    },
    async getUserByName(username) {
      const u = [...users.values()].find((x) => x.username === username);
      return u ? { ...u } : null;
    },
    /** Records a login attempt; 5 wrong PINs lock the account for 15 minutes. */
    async noteLogin(id, ok, now) {
      const u = users.get(id);
      if (!u) return;
      if (ok) Object.assign(u, { fails: 0, lockedUntil: 0, lastLogin: now });
      else {
        u.fails += 1;
        if (u.fails >= 5) Object.assign(u, { fails: 0, lockedUntil: now + 15 * 60_000 });
      }
    },
    async createSession({ tokenHash, userId, now, expiresAt }) {
      sessions.set(tokenHash, { userId, createdAt: now, expiresAt });
    },
    async getSession(tokenHash, now) {
      const s = sessions.get(tokenHash);
      return s && s.expiresAt > now ? s.userId : null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async listUserCases(userId) {
      return [...cases.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ id, topic, status, createdAt }) => ({ id, topic, status, createdAt }));
    },
    /** Account + everything attached to it. */
    async deleteUser(id) {
      for (const c of [...cases.values()].filter((x) => x.userId === id)) {
        messages = messages.filter((m) => m.caseId !== c.id);
        cases.delete(c.id);
        notes.delete(c.id);
      }
      for (const [k, v] of sessions) if (v.userId === id) sessions.delete(k);
      users.delete(id);
    },
    async userStats(now, days = 14) {
      const all = [...users.values()];
      const byRegion = {};
      for (const u of all) byRegion[u.region] = (byRegion[u.region] || 0) + 1;
      const series = countByDay(
        all.map((u) => u.createdAt),
        now,
        days,
      );
      const since = (ms) => all.filter((u) => (u.lastLogin ?? u.createdAt) >= now - ms).length;
      return {
        total: all.length,
        byRegion,
        active7: since(7 * 86_400_000),
        active30: since(30 * 86_400_000),
        series,
      };
    },
    /** No contact details here: developers see accounts, never who they are. */
    async listUsers(limit = 100) {
      return [...users.values()]
        .sort((a, b) => (b.lastLogin ?? b.createdAt) - (a.lastLogin ?? a.createdAt))
        .slice(0, limit)
        .map(({ id, username, region, createdAt, lastLogin, lockedUntil }) => ({
          id,
          username,
          region,
          createdAt,
          lastLogin,
          lockedUntil,
        }));
    },
    async getStaff(email) {
      const s = staff.get(email);
      return s ? { ...s } : null;
    },
    async listStaff() {
      return [...staff.values()]
        .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email))
        .map((s) => ({ ...s }));
    },
    async upsertStaff({ email, role, name }) {
      const old = staff.get(email);
      staff.set(email, {
        email,
        role,
        name,
        code: old?.code || nextStaffCode(),
        active: old ? old.active : true,
      });
    },
    async setStaffActive(email, active) {
      const s = staff.get(email);
      if (s) s.active = !!active;
    },
    async removeStaff(email) {
      staff.delete(email);
      staffAuth.delete(email);
      for (const [k, v] of staffSessions) if (v.email === email) staffSessions.delete(k);
    },
    /* ---- staff passwords and sessions ---- */
    async getStaffAuth(email) {
      const a = staffAuth.get(email);
      return a ? { ...a } : null;
    },
    async setStaffPassword(email, { salt, hash, mustChange, now }) {
      staffAuth.set(email, { email, salt, hash, mustChange: !!mustChange, fails: 0, lockedUntil: 0, changedAt: now });
    },
    /** 5 wrong passwords lock the account for 15 minutes. */
    async noteStaffLogin(email, ok, now) {
      const a = staffAuth.get(email);
      if (!a) return;
      if (ok) Object.assign(a, { fails: 0, lockedUntil: 0 });
      else {
        a.fails += 1;
        if (a.fails >= 5) Object.assign(a, { fails: 0, lockedUntil: now + 15 * 60_000 });
      }
    },
    async createStaffSession({ tokenHash, email, now, expiresAt }) {
      staffSessions.set(tokenHash, { email, createdAt: now, expiresAt });
    },
    async getStaffSession(tokenHash, now) {
      const s = staffSessions.get(tokenHash);
      return s && s.expiresAt > now ? s.email : null;
    },
    async deleteStaffSession(tokenHash) {
      staffSessions.delete(tokenHash);
    },
    async deleteStaffSessions(email) {
      for (const [k, v] of staffSessions) if (v.email === email) staffSessions.delete(k);
    },
    async lastAuditAt(action) {
      const hit = [...audit].reverse().find((a) => a.action === action);
      return hit ? hit.at : null;
    },
    async track({ event, region = "none", ms = 0, now }) {
      const day = dayKey(now);
      const k = `${day}|${event}|${region}`;
      const r = events.get(k) || { day, event, region, n: 0, msSum: 0 };
      r.n += 1;
      r.msSum += ms;
      events.set(k, r);
    },
    async analytics(now, days = 14) {
      return buildAnalytics([...events.values()], now, days);
    },
    async touchStaff(email, now) {
      const r = seen.get(email);
      if (!r) seen.set(email, { email, firstSeen: now, lastSeen: now, sessions: 1 });
      else {
        if (now - r.lastSeen > 1_800_000) r.sessions += 1;
        r.lastSeen = now;
      }
    },
    async listStaffActivity() {
      return [...seen.values()].sort((a, b) => b.lastSeen - a.lastSeen).map((r) => ({ ...r }));
    },
    /** Her own numbers over the last `days` days (counts only). */
    async lawyerStats(email, now, days = 14) {
      const keys = new Set(Array.from({ length: days }, (_, i) => dayKey(now - i * 86_400_000)));
      let claimed = 0;
      let closed = 0;
      for (const r of lawyerDaily.values()) {
        if (r.email === email && keys.has(r.day)) {
          claimed += r.claimed;
          closed += r.closed;
        }
      }
      return { claimed, closed };
    },
    async setNote({ caseId, iv, body, now }) {
      notes.set(caseId, { iv, body, updatedAt: now });
    },
    async getNote(caseId) {
      return notes.get(caseId) ? { ...notes.get(caseId) } : null;
    },
    async getSetting(key) {
      return settings.get(key) ? { ...settings.get(key) } : null;
    },
    async setSetting({ key, iv, body, now, by }) {
      settings.set(key, { iv, body, updatedAt: now, updatedBy: by });
    },
    async deleteSetting(key) {
      settings.delete(key);
    },
    async addAiAnswer({ at, region, provider, model, body }) {
      aiAnswers.push({
        id: ++aiSeq,
        at,
        region,
        provider,
        model,
        body,
        verdict: null,
        reviewedBy: null,
        reviewedAt: null,
      });
    },
    async listAiAnswers({ verdict = "all", limit = 50 } = {}) {
      const match = (a) =>
        verdict === "all" || (verdict === "pending" ? a.verdict === null : a.verdict === verdict);
      return aiAnswers
        .filter(match)
        .slice(-limit)
        .reverse()
        .map((a) => ({ ...a }));
    },
    async reviewAiAnswer(id, verdict, by, now) {
      const a = aiAnswers.find((x) => x.id === id);
      if (!a) return false;
      Object.assign(a, { verdict, reviewedBy: verdict ? by : null, reviewedAt: verdict ? now : null });
      return true;
    },
    async aiAnswerCounts() {
      const c = { pending: 0, good: 0, bad: 0 };
      for (const a of aiAnswers) c[a.verdict ?? "pending"]++;
      return c;
    },
    async addAudit({ actor, action, target = "", now }) {
      audit.push({ id: audit.length + 1, at: now, actor, action, target });
    },
    async listAudit(limit = 100) {
      return audit.slice(-limit).reverse();
    },
    async purge(
      now,
      { closedMs, idleMs, auditMs = 90 * 86_400_000, userIdleMs = 180 * 86_400_000, aiMs = 90 * 86_400_000 },
    ) {
      for (const [k, v] of sessions) if (v.expiresAt <= now) sessions.delete(k);
      for (const [k, v] of staffSessions) if (v.expiresAt <= now) staffSessions.delete(k);
      const doomed = [...cases.values()].filter(
        (c) => (c.status === "closed" && c.closedAt < now - closedMs) || c.lastActivity < now - idleMs,
      );
      const ids = new Set(doomed.map((c) => c.id));
      messages = messages.filter((m) => !ids.has(m.caseId));
      ids.forEach((id) => {
        cases.delete(id);
        notes.delete(id);
      });
      audit = audit.filter((a) => a.at >= now - auditMs);
      aiAnswers = aiAnswers.filter((a) => a.at >= now - aiMs);
      for (const u of [...users.values()])
        if ((u.lastLogin ?? u.createdAt) < now - userIdleMs) await this.deleteUser(u.id);
      return ids.size;
    },
  };
}
