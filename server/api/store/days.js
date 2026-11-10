/** UTC day key, e.g. "2026-11-10". */
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Turn sparse rows ({day, created, closed, claimed, claimWaitMs}) into a gap-free series of the last
 * `days` days (oldest first) plus the average wait before a lawyer claimed a case.
 */
export function buildSeries(rows, now, days = 14) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const series = [];
  let claimed = 0;
  let wait = 0;
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(now - i * 86_400_000);
    const r = byDay.get(day) || { created: 0, closed: 0, claimed: 0, claimWaitMs: 0 };
    series.push({ day, created: r.created, closed: r.closed });
    claimed += r.claimed;
    wait += r.claimWaitMs;
  }
  return { series, avgClaimWaitMs: claimed ? Math.round(wait / claimed) : 0 };
}

/** Count timestamps per day over the last `days` days (oldest first). */
export function countByDay(timestamps, now, days = 14) {
  const counts = new Map();
  for (const t of timestamps) counts.set(dayKey(t), (counts.get(dayKey(t)) || 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const day = dayKey(now - (days - 1 - i) * 86_400_000);
    return { day, n: counts.get(day) || 0 };
  });
}

/** Anonymous usage events the app may report. Anything else is rejected. */
export const EVENTS = Object.freeze([
  "visit", // app opened
  "visit_return", // app opened by someone who opened it before (flag kept on her device, no id sent)
  "install", // added to home screen
  "signup", // a woman created an account to reach a lawyer
  "login", // a woman signed in
  "ask_rules", // question answered by the offline rules
  "ask_ai", // question answered by the online AI
  "ask_none", // question not covered
  "ai_error", // online AI failed and the app fell back
  "sos_open", // emergency screen opened
  "lawyer_request", // a case was opened with a lawyer
]);
export const TOPICS = Object.freeze([
  "نفقة",
  "حضانة",
  "طلاق",
  "ميراث",
  "ابتزاز إلكتروني",
  "صور مسرّبة",
  "عنف أسري",
]);
/** Free text never becomes a counter key: anything unknown is "أخرى". */
export const normalizeTopic = (t) => (TOPICS.includes(t) ? t : "أخرى");

const emptyDay = () => Object.fromEntries(EVENTS.map((e) => [e, 0]));

/**
 * rows: [{day, event, region, n, msSum}] -> everything the usage / AI dashboards need.
 * Totals per event, a gap-free per-day series, region split per event, topic counts, AI latency.
 */
export function buildAnalytics(rows, now, days = 14) {
  const dayList = Array.from({ length: days }, (_, i) => dayKey(now - (days - 1 - i) * 86_400_000));
  const series = new Map(dayList.map((d) => [d, { day: d, ...emptyDay() }]));
  const totals = emptyDay();
  const regions = Object.fromEntries(EVENTS.map((e) => [e, {}]));
  const topics = {};
  let aiMs = 0;
  let aiN = 0;
  for (const r of rows) {
    if (!series.has(r.day)) continue;
    if (r.event.startsWith("topic:")) {
      const t = r.event.slice(6);
      topics[t] = (topics[t] || 0) + r.n;
      continue;
    }
    if (!(r.event in totals)) continue;
    series.get(r.day)[r.event] += r.n;
    totals[r.event] += r.n;
    regions[r.event][r.region] = (regions[r.event][r.region] || 0) + r.n;
    if (r.event === "ask_ai") {
      aiMs += r.msSum;
      aiN += r.n;
    }
  }
  return { series: [...series.values()], totals, regions, topics, aiAvgMs: aiN ? Math.round(aiMs / aiN) : 0 };
}
