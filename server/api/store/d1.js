/**
 * Cloudflare D1 implementation of the store contract (see store/memory.js for the
 * reference behaviour; tests/api-store.test.js runs the same checks against both).
 * @param {{prepare(sql:string): {bind(...a:any[]): {first():Promise<any>, all():Promise<{results:any[]}>, run():Promise<{meta:{changes:number}}>}}}} db
 */
import { buildAnalytics, buildSeries, countByDay, dayKey } from "./days.js";

export function createD1Store(db) {
  const q = (sql, ...args) => db.prepare(sql).bind(...args);
  const caseRow = (r) =>
    r && {
      id: r.id,
      tokenHash: r.token_hash,
      userId: r.user_id,
      topic: r.topic,
      region: r.region,
      status: r.status,
      lawyerEmail: r.lawyer_email,
      createdAt: r.created_at,
      claimedAt: r.claimed_at,
      closedAt: r.closed_at,
      lastActivity: r.last_activity,
    };

  const userRow = (r) =>
    r && {
      id: r.id,
      username: r.username,
      salt: r.pin_salt,
      pinHash: r.pin_hash,
      iv: r.contact_iv,
      body: r.contact_body,
      region: r.region,
      createdAt: r.created_at,
      lastLogin: r.last_login,
      fails: r.fails,
      lockedUntil: r.locked_until,
    };

  const bump = (now, col) =>
    q(
      `INSERT INTO daily_counts (day, ${col}) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET ${col} = ${col} + 1`,
      dayKey(now),
    ).run();

  const bumpLawyer = (now, email, col) =>
    q(
      `INSERT INTO lawyer_daily (day, email, ${col}) VALUES (?, ?, 1) ON CONFLICT(day, email) DO UPDATE SET ${col} = ${col} + 1`,
      dayKey(now),
      email,
    ).run();

  return {
    async createCase({ id, tokenHash = "", userId = "", topic, region, now }) {
      await q(
        "INSERT INTO cases (id, token_hash, user_id, topic, region, status, created_at, last_activity) VALUES (?,?,?,?,?, 'open', ?, ?)",
        id,
        tokenHash,
        userId,
        topic,
        region,
        now,
        now,
      ).run();
      await bump(now, "created");
    },
    async getCase(id) {
      return caseRow(await q("SELECT * FROM cases WHERE id = ?", id).first());
    },
    async addMessage({ caseId, sender, iv, body, now }) {
      await q(
        "INSERT INTO messages (case_id, sender, iv, body, created_at) VALUES (?,?,?,?,?)",
        caseId,
        sender,
        iv,
        body,
        now,
      ).run();
      await q("UPDATE cases SET last_activity = ? WHERE id = ?", now, caseId).run();
    },
    async listMessages(caseId, afterId = 0) {
      const { results } = await q(
        "SELECT id, sender, iv, body, created_at FROM messages WHERE case_id = ? AND id > ? ORDER BY id LIMIT 200",
        caseId,
        afterId,
      ).all();
      return results.map((r) => ({
        id: r.id,
        sender: r.sender,
        iv: r.iv,
        body: r.body,
        createdAt: r.created_at,
      }));
    },
    async listQueue() {
      const { results } = await q(
        "SELECT id, topic, region, created_at FROM cases WHERE status = 'open' ORDER BY created_at LIMIT 100",
      ).all();
      return results.map((r) => ({ id: r.id, topic: r.topic, region: r.region, createdAt: r.created_at }));
    },
    async listMine(email) {
      const { results } = await q(
        "SELECT id, topic, region, status, created_at, last_activity FROM cases WHERE lawyer_email = ? AND status = 'claimed' ORDER BY last_activity DESC LIMIT 100",
        email,
      ).all();
      return results.map((r) => ({
        id: r.id,
        topic: r.topic,
        region: r.region,
        status: r.status,
        createdAt: r.created_at,
        lastActivity: r.last_activity,
      }));
    },
    /** Atomic: succeeds only if nobody claimed it first. */
    async claimCase(id, email, now) {
      const r = await q(
        "UPDATE cases SET status = 'claimed', lawyer_email = ?, claimed_at = ?, last_activity = ? WHERE id = ? AND status = 'open'",
        email,
        now,
        now,
        id,
      ).run();
      if (r.meta.changes !== 1) return false;
      const c = await q("SELECT created_at FROM cases WHERE id = ?", id).first();
      await bump(now, "claimed");
      await bumpLawyer(now, email, "claimed");
      await q(
        "UPDATE daily_counts SET claim_wait_ms = claim_wait_ms + ? WHERE day = ?",
        now - c.created_at,
        dayKey(now),
      ).run();
      return true;
    },
    async closeCase(id, now) {
      const r = await q(
        "UPDATE cases SET status = 'closed', closed_at = ?, last_activity = ? WHERE id = ? AND status != 'closed'",
        now,
        now,
        id,
      ).run();
      if (r.meta.changes === 1) {
        await bump(now, "closed");
        const c = await q("SELECT lawyer_email FROM cases WHERE id = ?", id).first();
        if (c?.lawyer_email) await bumpLawyer(now, c.lawyer_email, "closed");
      }
    },
    async stats(now) {
      const by = async (col) =>
        Object.fromEntries(
          (await q(`SELECT ${col} AS k, COUNT(*) AS n FROM cases GROUP BY ${col}`).all()).results.map((r) => [
            r.k,
            r.n,
          ]),
        );
      const oldest = await q("SELECT MIN(created_at) AS t FROM cases WHERE status = 'open'").first();
      const lawyers = await q("SELECT COUNT(*) AS n FROM staff WHERE role = 'lawyer'").first();
      const msgs = await q("SELECT COUNT(*) AS n FROM messages").first();
      return {
        byStatus: await by("status"),
        byRegion: await by("region"),
        oldestWaitingMs: oldest?.t ? now - oldest.t : 0,
        lawyers: lawyers?.n ?? 0,
        messages: msgs?.n ?? 0,
        ...buildSeries(
          (
            await q(
              "SELECT day, created, closed, claimed, claim_wait_ms FROM daily_counts WHERE day >= ?",
              dayKey(now - 14 * 86_400_000),
            ).all()
          ).results.map((r) => ({
            day: r.day,
            created: r.created,
            closed: r.closed,
            claimed: r.claimed,
            claimWaitMs: r.claim_wait_ms,
          })),
          now,
        ),
      };
    },
    /* ---- women's accounts ---- */
    async createUser({ id, username, salt, pinHash, iv, body, region, now }) {
      try {
        await q(
          "INSERT INTO users (id, username, pin_salt, pin_hash, contact_iv, contact_body, region, created_at) VALUES (?,?,?,?,?,?,?,?)",
          id,
          username,
          salt,
          pinHash,
          iv,
          body,
          region,
          now,
        ).run();
        return true;
      } catch {
        return false; // UNIQUE(username)
      }
    },
    async getUser(id) {
      return userRow(await q("SELECT * FROM users WHERE id = ?", id).first());
    },
    async getUserByName(username) {
      return userRow(await q("SELECT * FROM users WHERE username = ?", username).first());
    },
    /** Records a login attempt; 5 wrong PINs lock the account for 15 minutes. */
    async noteLogin(id, ok, now) {
      if (ok) {
        await q("UPDATE users SET fails = 0, locked_until = 0, last_login = ? WHERE id = ?", now, id).run();
        return;
      }
      await q(
        "UPDATE users SET locked_until = CASE WHEN fails + 1 >= 5 THEN ? ELSE locked_until END, fails = CASE WHEN fails + 1 >= 5 THEN 0 ELSE fails + 1 END WHERE id = ?",
        now + 15 * 60_000,
        id,
      ).run();
    },
    async createSession({ tokenHash, userId, now, expiresAt }) {
      await q(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
        tokenHash,
        userId,
        now,
        expiresAt,
      ).run();
    },
    async getSession(tokenHash, now) {
      const r = await q(
        "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
        tokenHash,
        now,
      ).first();
      return r ? r.user_id : null;
    },
    async deleteSession(tokenHash) {
      await q("DELETE FROM sessions WHERE token_hash = ?", tokenHash).run();
    },
    async listUserCases(userId) {
      return (
        await q(
          "SELECT id, topic, status, created_at FROM cases WHERE user_id = ? ORDER BY created_at DESC",
          userId,
        ).all()
      ).results.map((r) => ({ id: r.id, topic: r.topic, status: r.status, createdAt: r.created_at }));
    },
    /** Account + everything attached to it. */
    async deleteUser(id) {
      const ids = (await q("SELECT id FROM cases WHERE user_id = ?", id).all()).results;
      for (const { id: caseId } of ids) {
        await q("DELETE FROM messages WHERE case_id = ?", caseId).run();
        await q("DELETE FROM case_notes WHERE case_id = ?", caseId).run();
      }
      await q("DELETE FROM cases WHERE user_id = ?", id).run();
      await q("DELETE FROM sessions WHERE user_id = ?", id).run();
      await q("DELETE FROM users WHERE id = ?", id).run();
    },
    async userStats(now, days = 14) {
      const byRegion = Object.fromEntries(
        (await q("SELECT region AS k, COUNT(*) AS n FROM users GROUP BY region").all()).results.map((r) => [
          r.k,
          r.n,
        ]),
      );
      const total = (await q("SELECT COUNT(*) AS n FROM users").first()).n;
      const since = async (ms) =>
        (
          await q(
            "SELECT COUNT(*) AS n FROM users WHERE COALESCE(last_login, created_at) >= ?",
            now - ms,
          ).first()
        ).n;
      const created = (
        await q("SELECT created_at FROM users WHERE created_at >= ?", now - days * 86_400_000).all()
      ).results;
      return {
        total,
        byRegion,
        active7: await since(7 * 86_400_000),
        active30: await since(30 * 86_400_000),
        series: countByDay(
          created.map((r) => r.created_at),
          now,
          days,
        ),
      };
    },
    /** No contact details here: developers see accounts, never who they are. */
    async listUsers(limit = 100) {
      return (
        await q(
          "SELECT id, username, region, created_at, last_login FROM users ORDER BY COALESCE(last_login, created_at) DESC LIMIT ?",
          limit,
        ).all()
      ).results.map((r) => ({
        id: r.id,
        username: r.username,
        region: r.region,
        createdAt: r.created_at,
        lastLogin: r.last_login,
      }));
    },
    async getStaff(email) {
      const r = await q("SELECT email, role, name FROM staff WHERE email = ?", email).first();
      return r ? { email: r.email, role: r.role, name: r.name } : null;
    },
    async listStaff() {
      return (await q("SELECT email, role, name FROM staff ORDER BY role, email").all()).results;
    },
    async upsertStaff({ email, role, name, now }) {
      await q(
        "INSERT INTO staff (email, role, name, created_at) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, name = excluded.name",
        email,
        role,
        name,
        now,
      ).run();
    },
    async removeStaff(email) {
      await q("DELETE FROM staff WHERE email = ?", email).run();
    },
    async track({ event, region = "none", ms = 0, now }) {
      await q(
        "INSERT INTO events_daily (day, event, region, n, ms_sum) VALUES (?,?,?,1,?) ON CONFLICT(day, event, region) DO UPDATE SET n = n + 1, ms_sum = ms_sum + excluded.ms_sum",
        dayKey(now),
        event,
        region,
        ms,
      ).run();
    },
    async analytics(now, days = 14) {
      const rows = (
        await q(
          "SELECT day, event, region, n, ms_sum FROM events_daily WHERE day >= ?",
          dayKey(now - (days - 1) * 86_400_000),
        ).all()
      ).results.map((r) => ({ day: r.day, event: r.event, region: r.region, n: r.n, msSum: r.ms_sum }));
      return buildAnalytics(rows, now, days);
    },
    async touchStaff(email, now) {
      await q(
        "INSERT INTO staff_seen (email, first_seen, last_seen, sessions) VALUES (?,?,?,1) ON CONFLICT(email) DO UPDATE SET sessions = sessions + (CASE WHEN ? - last_seen > 1800000 THEN 1 ELSE 0 END), last_seen = ?",
        email,
        now,
        now,
        now,
        now,
      ).run();
    },
    async listStaffActivity() {
      return (
        await q("SELECT email, first_seen, last_seen, sessions FROM staff_seen ORDER BY last_seen DESC").all()
      ).results.map((r) => ({
        email: r.email,
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        sessions: r.sessions,
      }));
    },
    async lawyerStats(email, now, days = 14) {
      const r = await q(
        "SELECT COALESCE(SUM(claimed),0) AS claimed, COALESCE(SUM(closed),0) AS closed FROM lawyer_daily WHERE email = ? AND day >= ?",
        email,
        dayKey(now - (days - 1) * 86_400_000),
      ).first();
      return { claimed: r.claimed, closed: r.closed };
    },
    async setNote({ caseId, iv, body, now }) {
      await q(
        "INSERT INTO case_notes (case_id, iv, body, updated_at) VALUES (?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET iv = excluded.iv, body = excluded.body, updated_at = excluded.updated_at",
        caseId,
        iv,
        body,
        now,
      ).run();
    },
    async getNote(caseId) {
      const r = await q("SELECT iv, body, updated_at FROM case_notes WHERE case_id = ?", caseId).first();
      return r ? { iv: r.iv, body: r.body, updatedAt: r.updated_at } : null;
    },
    async getSetting(key) {
      const r = await q("SELECT iv, body, updated_at, updated_by FROM settings WHERE key = ?", key).first();
      return r ? { iv: r.iv, body: r.body, updatedAt: r.updated_at, updatedBy: r.updated_by } : null;
    },
    async setSetting({ key, iv, body, now, by }) {
      await q(
        "INSERT INTO settings (key, iv, body, updated_at, updated_by) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET iv = excluded.iv, body = excluded.body, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
        key,
        iv,
        body,
        now,
        by,
      ).run();
    },
    async deleteSetting(key) {
      await q("DELETE FROM settings WHERE key = ?", key).run();
    },
    async addAudit({ actor, action, target = "", now }) {
      await q(
        "INSERT INTO audit (at, actor, action, target) VALUES (?,?,?,?)",
        now,
        actor,
        action,
        target,
      ).run();
    },
    async listAudit(limit = 100) {
      return (
        await q("SELECT id, at, actor, action, target FROM audit ORDER BY id DESC LIMIT ?", limit).all()
      ).results;
    },
    /** Retention: delete closed cases after closedMs, and anything idle longer than idleMs. */
    async purge(now, { closedMs, idleMs, auditMs = 90 * 86_400_000, userIdleMs = 180 * 86_400_000 }) {
      await q("DELETE FROM sessions WHERE expires_at <= ?", now).run();
      const where = "(status = 'closed' AND closed_at < ?) OR last_activity < ?";
      const ids = (await q(`SELECT id FROM cases WHERE ${where}`, now - closedMs, now - idleMs).all())
        .results;
      for (const { id } of ids) {
        await q("DELETE FROM messages WHERE case_id = ?", id).run();
        await q("DELETE FROM case_notes WHERE case_id = ?", id).run();
      }
      await q("DELETE FROM audit WHERE at < ?", now - auditMs).run();
      await q(`DELETE FROM cases WHERE ${where}`, now - closedMs, now - idleMs).run();
      const stale = (
        await q("SELECT id FROM users WHERE COALESCE(last_login, created_at) < ?", now - userIdleMs).all()
      ).results;
      for (const { id } of stale) await this.deleteUser(id);
      return ids.length;
    },
  };
}
