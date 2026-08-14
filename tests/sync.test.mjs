import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = new EventTarget();

const store = await import("../js/store.js");
const cloud = await import("../js/cloud-sync.js");

function makeState(overrides = {}) {
  return store.normalizeState(overrides);
}

test("default state is empty but real records are meaningful", () => {
  assert.equal(store.hasMeaningfulData(makeState()), false);
  assert.equal(store.hasMeaningfulData(makeState({
    workouts: { "2026-08-14": [{ exerciseId: "bench", sets: [{ w: 60, r: 10 }] }] },
  })), true);
  assert.equal(store.hasMeaningfulData(makeState({ targets: { kcal: 2400 } })), true);
});

test("cloud snapshots exclude device-only video data and account email", () => {
  const source = makeState({
    exerciseVideos: { bench: { name: "form.mov", size: 123 } },
    advice: { accountEmail: "private@example.com" },
  });
  const snapshot = store.toCloudSnapshot(source);
  assert.deepEqual(snapshot.exerciseVideos, {});
  assert.equal(snapshot.advice.accountEmail, "");
});

test("cloud replacement preserves video metadata and login email on this device", () => {
  store.state.exerciseVideos = { bench: { name: "local.mov", size: 456 } };
  store.state.advice.accountEmail = "local@example.com";
  store.replaceStateFromCloud(makeState({
    workouts: { "2026-08-14": [{ exerciseId: "squat", sets: [{ w: 80, r: 5 }] }] },
    exerciseVideos: { squat: { name: "remote.mov", size: 999 } },
    advice: { accountEmail: "remote@example.com" },
  }));
  assert.deepEqual(store.state.exerciseVideos, { bench: { name: "local.mov", size: 456 } });
  assert.equal(store.state.advice.accountEmail, "local@example.com");
  assert.ok(store.state.workouts["2026-08-14"]);
});

test("fingerprints are canonical and ignore device-only fields", async () => {
  const a = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "bench", sets: [{ w: 60, r: 10 }] }] },
    exerciseVideos: { bench: { name: "a.mov" } },
    advice: { accountEmail: "a@example.com" },
  });
  const b = JSON.parse(JSON.stringify(a));
  b.exerciseVideos = { bench: { name: "b.mov" } };
  b.advice.accountEmail = "b@example.com";
  assert.equal(await cloud.fingerprintState(a), await cloud.fingerprintState(b));
  assert.equal(cloud.canonicalize({ b: 2, a: 1 }), cloud.canonicalize({ a: 1, b: 2 }));
});

test("reconciliation always pulls a real cloud record onto a fresh device", () => {
  assert.equal(cloud.decideReconciliation({
    remoteExists: true,
    localHash: "blank",
    remoteHash: "cloud",
    baseHash: null,
    dirty: false,
    localMeaningful: false,
    remoteMeaningful: true,
  }), "pull");
});

test("explicit reset pushes only when the unchanged cloud is the known base", () => {
  assert.equal(cloud.decideReconciliation({
    remoteExists: true,
    localHash: "blank",
    remoteHash: "base",
    baseHash: "base",
    dirty: true,
    allowBlankPush: true,
    localMeaningful: false,
    remoteMeaningful: true,
  }), "push");
  assert.equal(cloud.decideReconciliation({
    remoteExists: true,
    localHash: "blank",
    remoteHash: "base",
    baseHash: "base",
    dirty: true,
    allowBlankPush: false,
    localMeaningful: false,
    remoteMeaningful: true,
  }), "pull");
});

test("one-sided edits sync automatically and two-sided edits conflict", () => {
  const common = {
    remoteExists: true,
    baseHash: "base",
    localMeaningful: true,
    remoteMeaningful: true,
  };
  assert.equal(cloud.decideReconciliation({
    ...common, localHash: "base", remoteHash: "remote", dirty: false,
  }), "pull");
  assert.equal(cloud.decideReconciliation({
    ...common, localHash: "local", remoteHash: "base", dirty: true,
  }), "push");
  assert.equal(cloud.decideReconciliation({
    ...common, localHash: "local", remoteHash: "remote", dirty: true,
  }), "conflict");
});

test("initial session reads the snapshot before any write and restores it", async () => {
  localStorage.clear();
  const events = [];
  const session = { user: { id: "user-1", email: "user@example.com" } };
  const remoteState = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "bench", sets: [{ w: 70, r: 8 }] }] },
  });
  let localState = makeState();

  class Query {
    constructor(table) { this.table = table; this.operation = null; }
    select() { this.operation ||= "select"; return this; }
    insert() { this.operation = "insert"; events.push(`${this.table}:insert`); return this; }
    update() { this.operation = "update"; events.push(`${this.table}:update`); return this; }
    upsert() { this.operation = "upsert"; events.push(`${this.table}:upsert`); return this; }
    eq() { return this; }
    order() { return this; }
    limit() { return this; }
    async maybeSingle() {
      if (this.table === "kintore_snapshots") {
        events.push("kintore_snapshots:select");
        return {
          data: { state: remoteState, state_version: 2, synced_at: "2026-08-14T01:00:00.000Z" },
          error: null,
        };
      }
      return { data: null, error: null };
    }
  }

  const fakeClient = {
    auth: {
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { events.push("auth:getSession"); return { data: { session }, error: null }; },
    },
    from(table) { return new Query(table); },
  };
  globalThis.supabase = { createClient: () => fakeClient };

  await cloud.initCloudSync({
    getState: () => localState,
    applyState: value => { localState = store.normalizeState(value); },
    onConflict: () => "cancel",
  });

  assert.ok(localState.workouts["2026-08-14"]);
  assert.equal(events[0], "auth:getSession");
  assert.ok(events.includes("kintore_snapshots:select"));
  assert.equal(events.some(event => /:(?:insert|update|upsert)$/.test(event)), false);
});
