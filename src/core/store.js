/**
 * Persistent key/value store over localStorage, namespaced, JSON-encoded, and failure-proof
 * (private mode, blocked storage and quota errors must never break the app).
 * `storage` is injectable so tests can use an in-memory fake.
 */
import { LEGACY_STORAGE_PREFIX, STORAGE_PREFIX } from "../config.js";

export function createStore(storage = defaultStorage(), prefix = STORAGE_PREFIX) {
  if (prefix === STORAGE_PREFIX) migrateLegacy(storage, LEGACY_STORAGE_PREFIX, prefix);
  return {
    get(key, fallback) {
      try {
        const raw = storage.getItem(prefix + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        storage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        /* storage unavailable: the app keeps working for this session */
      }
    },
    /** Remove everything this app stored, and nothing else. */
    clear() {
      try {
        for (const k of Object.keys(storage)) if (k.startsWith(prefix)) storage.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * The app was renamed (سند → فزعة): move what it saved under the old prefix (settings, the lawyer-chat
 * session) to the new one, so nobody loses anything. A key that already exists under the new prefix wins.
 */
export function migrateLegacy(storage, from, to) {
  try {
    for (const k of Object.keys(storage)) {
      if (!k.startsWith(from)) continue;
      const next = to + k.slice(from.length);
      if (storage.getItem(next) === null) storage.setItem(next, storage.getItem(k));
      storage.removeItem(k);
    }
  } catch {
    /* storage unavailable: nothing to move */
  }
}

function defaultStorage() {
  try {
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

/** Minimal Storage-compatible fallback. Own keys are enumerable like the real thing. */
export function memoryStorage() {
  const data = {};
  return Object.defineProperties(data, {
    getItem: { value: (k) => (k in data ? data[k] : null) },
    setItem: { value: (k, v) => void (data[k] = String(v)) },
    removeItem: { value: (k) => void delete data[k] },
  });
}
