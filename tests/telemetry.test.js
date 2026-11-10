import assert from "node:assert/strict";
import { test } from "node:test";
import { createState } from "../src/core/state.js";
import { createStore, memoryStorage } from "../src/core/store.js";
import { createTelemetry } from "../src/features/telemetry/telemetry.js";

function setup({ endpoint = "/api/v1/ping", current = "home" } = {}) {
  const store = createStore(memoryStorage());
  const state = createState(store);
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true };
  };
  const router = { current };
  return {
    telemetry: createTelemetry({ endpoint, state, store, router, fetchImpl }),
    state,
    sent,
    router,
    store,
  };
}

test("sends only event + region (+ ms), with no credentials, no referrer, no ids", () => {
  const { telemetry, sent } = setup();
  telemetry.track("ask_ai", 1234.6);
  assert.deepEqual(sent[0].body, { event: "ask_ai", region: "ps-wb", ms: 1235 });
  assert.equal(sent[0].init.credentials, "omit");
  assert.equal(sent[0].init.referrerPolicy, "no-referrer");
  assert.deepEqual(Object.keys(sent[0].body).sort(), ["event", "ms", "region"]);
});

test("does nothing when there is no endpoint, when she switched it off, or while the disguise is showing", () => {
  assert.equal(setup({ endpoint: "" }).sent.length, 0);
  const off = setup();
  off.state.set("stats", false);
  off.telemetry.track("visit");
  assert.equal(off.sent.length, 0);
  const hidden = setup({ current: "disguise" });
  hidden.telemetry.track("visit");
  assert.equal(hidden.sent.length, 0);
});

test("visit vs visit_return: the 'seen' flag stays on the device", () => {
  const a = setup();
  a.telemetry.visit();
  a.telemetry.visit();
  assert.deepEqual(
    a.sent.map((s) => s.body.event),
    ["visit", "visit_return"],
  );
});

test("a failing network never throws into the app", async () => {
  const store = createStore(memoryStorage());
  const state = createState(store);
  const t = createTelemetry({
    endpoint: "/x",
    state,
    store,
    router: { current: "home" },
    fetchImpl: () => Promise.reject(new Error("offline")),
  });
  assert.doesNotThrow(() => t.track("visit"));
  const t2 = createTelemetry({
    endpoint: "/x",
    state,
    store,
    router: { current: "home" },
    fetchImpl: () => {
      throw new Error("sync");
    },
  });
  assert.doesNotThrow(() => t2.track("visit"));
  await new Promise((r) => setTimeout(r, 5));
});
