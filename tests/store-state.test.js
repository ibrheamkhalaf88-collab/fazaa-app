import assert from "node:assert/strict";
import { test } from "node:test";
import { createState, DEFAULT_STATE } from "../src/core/state.js";
import { createStore, memoryStorage } from "../src/core/store.js";

test("store: namespaced JSON round-trip with fallback", () => {
  const storage = memoryStorage();
  const store = createStore(storage, "t:");
  assert.equal(store.get("x", 42), 42);
  store.set("x", { a: [1, 2] });
  assert.deepEqual(store.get("x"), { a: [1, 2] });
  assert.ok("t:x" in storage);
});

test("store: clear removes only this app's keys", () => {
  const storage = memoryStorage();
  storage.setItem("other", "keep");
  const store = createStore(storage, "t:");
  store.set("a", 1);
  store.clear();
  assert.equal(store.get("a", "gone"), "gone");
  assert.equal(storage.getItem("other"), "keep");
});

test("store: corrupt JSON and a throwing storage do not crash", () => {
  const storage = memoryStorage();
  storage.setItem("t:bad", "{oops");
  assert.equal(createStore(storage, "t:").get("bad", "fallback"), "fallback");

  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("quota");
    },
    removeItem() {},
  };
  const store = createStore(broken, "t:");
  assert.equal(store.get("x", 1), 1);
  assert.doesNotThrow(() => store.set("x", 2));
});

test("state: loads defaults, persists changes, notifies, resets", () => {
  const storage = memoryStorage();
  const store = createStore(storage, "t:");
  const state = createState(store);
  assert.equal(state.get("theme"), DEFAULT_STATE.theme);

  const seen = [];
  state.subscribe((k, v) => seen.push([k, v]));
  state.set("theme", "dark");
  assert.deepEqual(seen, [["theme", "dark"]]);
  assert.equal(createState(createStore(storage, "t:")).get("theme"), "dark", "persisted");

  state.reset();
  assert.equal(state.get("theme"), "auto");
  assert.equal(createState(createStore(storage, "t:")).get("theme"), "auto", "persisted values cleared");
});

test("state: AI online is off by default (opt-in)", () => {
  assert.equal(DEFAULT_STATE.aiOnline, false);
});
