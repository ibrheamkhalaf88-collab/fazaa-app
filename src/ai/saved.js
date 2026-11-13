import { currentTopic, summarize, TOPIC_LABELS } from "./situation.js";

/**
 * Saved topics across visits (Layer C of the memory). OFF by default.
 *
 * What it is: when she switches on «تذكّر المواضيع» in Settings, the app keeps, ON THIS DEVICE only,
 * a few short notes per topic («جوزك هددك ياخد الولاد (مبارح)», «حكت مع محامية»), so that a later
 * «بدي نكمل موضوع الحضانة» can continue. Nothing else.
 *
 * What it is NOT, said plainly in the UI and docs/PRIVACY.md:
 *   - not the conversation: no messages, no replies, no constraints (e.g. "her phone is checked"),
 *     nothing from a self-harm exchange, nothing from the lawyer chat;
 *   - not encrypted: anyone who opens the app on this phone can read the list in Settings. A key kept
 *     in the same browser would not protect against that person, so we do not pretend it does
 *     (a PIN-derived key needs the PIN lock, which is not built yet);
 *   - not sent anywhere and never shown by itself: no greeting, no notification, no preview. It comes
 *     back only when she asks to continue, or opens the list in Settings.
 *
 * Deleting: one topic, one note, or all; switching it off deletes everything; quick exit with
 * «امسحي كل شي» deletes everything; notes older than `days` are deleted on every read.
 */

export const SAVED_KEY = "savedTopics";
export const MAX_FACTS = 8;
const DAY = 24 * 60 * 60 * 1000;

/**
 * @param {{
 *   store: {get(k: string, f: any): any, set(k: string, v: any): void, remove(k: string): void},
 *   state: {get(k: string): any, set(k: string, v: any): void},
 *   now?: () => number,
 * }} deps
 */
export function createSavedTopics({ store, state, now = () => Date.now() }) {
  const days = () => Number(state.get("memoryDays")) || 30;

  /** Read, dropping anything expired or malformed (storage is untrusted input too). */
  function read() {
    const raw = store.get(SAVED_KEY, []);
    const cutoff = now() - days() * DAY;
    const list = (Array.isArray(raw) ? raw : [])
      .filter((x) => x && typeof x.topic === "string" && TOPIC_LABELS[x.topic] && Array.isArray(x.facts))
      .map((x) => ({
        id: String(x.id || x.topic),
        topic: x.topic,
        title: TOPIC_LABELS[x.topic],
        facts: x.facts.filter((f) => typeof f === "string" && f.length <= 160).slice(-MAX_FACTS),
        goal: typeof x.goal === "string" ? x.goal : "",
        updatedAt: Number(x.updatedAt) || 0,
      }))
      .filter((x) => x.updatedAt >= cutoff);
    if (list.length !== (Array.isArray(raw) ? raw.length : 0)) write(list);
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function write(list) {
    // the title is derived from the topic on read: never stored
    if (list.length) store.set(SAVED_KEY, list.map(({ id, topic, facts, goal, updatedAt }) => ({ id, topic, facts, goal, updatedAt })));
    else store.remove(SAVED_KEY);
  }

  return {
    enabled: () => state.get("memoryOn") === true,

    list: () => read(),

    /** After a reply: merge this session's notes into the thread of the current topic. */
    remember(memory) {
      if (state.get("memoryOn") !== true) return;
      const s = memory.situation;
      const topic = currentTopic(s);
      if (!topic || !TOPIC_LABELS[topic]) return;
      const sum = summarize(s, MAX_FACTS);
      const notes = [...sum.facts, ...sum.progress];
      if (!notes.length && !s.goal) return;
      const list = read();
      const old = list.find((x) => x.topic === topic);
      const facts = [...new Set([...(old?.facts || []), ...notes])].slice(-MAX_FACTS);
      const thread = { id: topic, topic, title: TOPIC_LABELS[topic], facts, goal: s.goal || old?.goal || "", updatedAt: now() };
      write([thread, ...list.filter((x) => x.topic !== topic)]);
    },

    /** Delete one note she says is wrong («صححي»). */
    removeFact(id, index) {
      const list = read();
      const t = list.find((x) => x.id === id);
      if (!t) return;
      t.facts.splice(index, 1);
      write(t.facts.length || t.goal ? list : list.filter((x) => x.id !== id));
    },

    remove(id) {
      write(read().filter((x) => x.id !== id));
    },

    clear() {
      store.remove(SAVED_KEY);
    },
  };
}
