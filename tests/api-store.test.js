import assert from "node:assert/strict";
import { test } from "node:test";
import { createD1Store } from "../server/api/store/d1.js";
import { createMemoryStore } from "../server/api/store/memory.js";
import { createFakeD1 } from "./helpers/d1-sqlite.js";

const DAY = 86_400_000;
const impls = { memory: createMemoryStore, d1: () => createD1Store(createFakeD1()) };

for (const [name, make] of Object.entries(impls)) {
  const T = (title, fn) => test(`store[${name}]: ${title}`, () => fn(make()));

  T("a new case is open and appears in the queue without any message text", async (s) => {
    await s.createCase({ id: "c1", tokenHash: "h", topic: "نفقة", region: "ps-gaza", now: 1000 });
    const [q] = await s.listQueue();
    assert.deepEqual(q, { id: "c1", topic: "نفقة", region: "ps-gaza", createdAt: 1000 });
  });

  T("claiming is atomic: only the first lawyer wins", async (s) => {
    await s.createCase({ id: "c1", tokenHash: "h", topic: "t", region: "ps-wb", now: 1 });
    assert.equal(await s.claimCase("c1", "a@x.org", 2), true);
    assert.equal(await s.claimCase("c1", "b@x.org", 3), false);
    assert.equal((await s.getCase("c1")).lawyerEmail, "a@x.org");
    assert.equal((await s.listQueue()).length, 0);
    assert.equal((await s.listMine("a@x.org")).length, 1);
    assert.equal((await s.listMine("b@x.org")).length, 0);
  });

  T("messages come back in order and 'after' skips the old ones", async (s) => {
    await s.createCase({ id: "c1", tokenHash: "h", topic: "t", region: "ps-wb", now: 1 });
    await s.addMessage({ caseId: "c1", sender: "user", iv: "i", body: "b1", now: 2 });
    await s.addMessage({ caseId: "c1", sender: "lawyer", iv: "i", body: "b2", now: 3 });
    const all = await s.listMessages("c1");
    assert.deepEqual(
      all.map((m) => m.body),
      ["b1", "b2"],
    );
    assert.deepEqual(
      (await s.listMessages("c1", all[0].id)).map((m) => m.body),
      ["b2"],
    );
  });

  T("closing removes it from 'mine'; stats count by status and region", async (s) => {
    await s.createCase({ id: "c1", tokenHash: "h", topic: "t", region: "ps-wb", now: 10 });
    await s.createCase({ id: "c2", tokenHash: "h", topic: "t", region: "ps-gaza", now: 20 });
    await s.claimCase("c1", "a@x.org", 30);
    await s.closeCase("c1", 40);
    await s.upsertStaff({ email: "a@x.org", role: "lawyer", name: "سلمى", now: 1 });
    const st = await s.stats(120);
    assert.deepEqual(st.byStatus, { closed: 1, open: 1 });
    assert.deepEqual(st.byRegion, { "ps-wb": 1, "ps-gaza": 1 });
    assert.equal(st.oldestWaitingMs, 100);
    assert.equal(st.lawyers, 1);
    assert.equal((await s.listMine("a@x.org")).length, 0);
  });

  T("notes upsert, audit lists newest first, daily counts survive the purge of old cases", async (st) => {
    const now = 100 * DAY;
    await st.createCase({ id: "c1", tokenHash: "h", topic: "t", region: "ps-wb", now: now - 20 * DAY });
    await st.claimCase("c1", "a@x.org", now - 20 * DAY + 5000);
    await st.closeCase("c1", now - 19 * DAY);
    await st.closeCase("c1", now - 19 * DAY); // closing twice must not double count
    await st.setNote({ caseId: "c1", iv: "i", body: "n1", now: 1 });
    await st.setNote({ caseId: "c1", iv: "i", body: "n2", now: 2 });
    assert.equal((await st.getNote("c1")).body, "n2");
    await st.addAudit({ actor: "a", action: "claim", target: "c1", now: now - 5 * DAY });
    await st.addAudit({ actor: "b", action: "close", target: "c1", now: now - 4 * DAY });
    assert.deepEqual(
      (await st.listAudit()).map((a) => a.action),
      ["close", "claim"],
    );

    await st.createCase({ id: "c2", tokenHash: "h", topic: "t", region: "ps-wb", now: now - 2 * DAY });
    await st.purge(now, { closedMs: 7 * DAY, idleMs: 30 * DAY });
    assert.equal(await st.getCase("c1"), null);
    assert.equal(await st.getNote("c1"), null);
    const stats = await st.stats(now);
    assert.equal(stats.series.length, 14);
    assert.equal(
      stats.series.reduce((n, d) => n + d.created, 0),
      1,
    ); // c1 is 20 days old: outside the 14-day window
    assert.equal(stats.series.at(-3).created, 1);
  });

  T("average claim wait is computed from the daily counters", async (st) => {
    const now = 50 * DAY;
    await st.createCase({ id: "a", tokenHash: "h", topic: "t", region: "ps-wb", now: now - 1000 });
    await st.claimCase("a", "x@y.org", now);
    await st.createCase({ id: "b", tokenHash: "h", topic: "t", region: "ps-wb", now: now - 3000 });
    await st.claimCase("b", "x@y.org", now);
    assert.equal((await st.stats(now)).avgClaimWaitMs, 2000);
  });

  T("usage counters: per day, per region, AI latency average, topics separated from events", async (st) => {
    const now = 40 * DAY;
    await st.track({ event: "visit", region: "ps-gaza", now });
    await st.track({ event: "visit", region: "ps-gaza", now });
    await st.track({ event: "visit", region: "ps-wb", now: now - DAY });
    await st.track({ event: "ask_ai", region: "ps-wb", ms: 1000, now });
    await st.track({ event: "ask_ai", region: "ps-wb", ms: 3000, now });
    await st.track({ event: "topic:نفقة", region: "ps-wb", now });
    await st.track({ event: "visit", region: "ps-wb", now: now - 30 * DAY }); // outside the window
    const a = await st.analytics(now, 14);
    assert.equal(a.series.length, 14);
    assert.equal(a.totals.visit, 3);
    assert.deepEqual(a.regions.visit, { "ps-gaza": 2, "ps-wb": 1 });
    assert.equal(a.series.at(-1).visit, 2);
    assert.equal(a.series.at(-2).visit, 1);
    assert.equal(a.aiAvgMs, 2000);
    assert.deepEqual(a.topics, { نفقة: 1 });
  });

  T("staff activity: a new session counts only after 30 quiet minutes", async (st) => {
    await st.touchStaff("a@x.org", 1_000_000);
    await st.touchStaff("a@x.org", 1_000_000 + 5 * 60_000);
    await st.touchStaff("a@x.org", 1_000_000 + 60 * 60_000);
    await st.touchStaff("b@x.org", 2_000_000);
    const [first, second] = await st.listStaffActivity();
    assert.equal(first.email, "a@x.org"); // most recent first
    assert.equal(first.sessions, 2);
    assert.equal(first.lastSeen, 1_000_000 + 60 * 60_000);
    assert.equal(second.sessions, 1);
  });

  T("lawyer stats count her own claims and closes only", async (st) => {
    const now = 60 * DAY;
    for (const id of ["a", "b", "c"])
      await st.createCase({ id, tokenHash: "h", topic: "t", region: "ps-wb", now });
    await st.claimCase("a", "l1@x.org", now);
    await st.claimCase("b", "l1@x.org", now);
    await st.claimCase("c", "l2@x.org", now);
    await st.closeCase("a", now);
    await st.closeCase("a", now);
    await st.closeCase("c", now);
    assert.deepEqual(await st.lawyerStats("l1@x.org", now), { claimed: 2, closed: 1 });
    assert.deepEqual(await st.lawyerStats("l2@x.org", now), { claimed: 1, closed: 1 });
    assert.deepEqual(await st.lawyerStats("nobody@x.org", now), { claimed: 0, closed: 0 });
  });

  T("staff upsert replaces role, remove deletes", async (s) => {
    await s.upsertStaff({ email: "a@x.org", role: "lawyer", name: "A", now: 1 });
    await s.upsertStaff({ email: "a@x.org", role: "developer", name: "B", now: 2 });
    assert.deepEqual(await s.getStaff("a@x.org"), { email: "a@x.org", role: "developer", name: "B" });
    await s.removeStaff("a@x.org");
    assert.equal(await s.getStaff("a@x.org"), null);
  });

  T(
    "purge deletes closed cases after the closed window and idle ones after the idle window, with their messages",
    async (s) => {
      const now = 100 * DAY;
      await s.createCase({ id: "closed-old", tokenHash: "h", topic: "t", region: "ps-wb", now: 1 * DAY });
      await s.addMessage({ caseId: "closed-old", sender: "user", iv: "i", body: "x", now: 1 * DAY });
      await s.closeCase("closed-old", 50 * DAY);
      await s.createCase({ id: "closed-new", tokenHash: "h", topic: "t", region: "ps-wb", now: 90 * DAY });
      await s.closeCase("closed-new", 99 * DAY);
      await s.createCase({ id: "idle", tokenHash: "h", topic: "t", region: "ps-wb", now: 10 * DAY });
      await s.createCase({ id: "fresh", tokenHash: "h", topic: "t", region: "ps-wb", now: 99 * DAY });
      const n = await s.purge(now, { closedMs: 7 * DAY, idleMs: 30 * DAY });
      assert.equal(n, 2);
      assert.equal(await s.getCase("closed-old"), null);
      assert.equal(await s.getCase("idle"), null);
      assert.ok(await s.getCase("closed-new"));
      assert.ok(await s.getCase("fresh"));
      assert.deepEqual(await s.listMessages("closed-old"), []);
    },
  );
}
