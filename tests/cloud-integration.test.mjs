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
const store = await import("../js/store.js?integration-store");

class Query {
  constructor(table, execute) {
    this.table = table;
    this.executeQuery = execute;
    this.operation = null;
    this.payload = null;
    this.filters = [];
  }
  select(columns) { this.operation ||= "select"; this.columns = columns; return this; }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  upsert(payload) { this.operation = "upsert"; this.payload = payload; return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this.executeQuery(this); }
  then(resolve, reject) { return Promise.resolve(this.executeQuery(this)).then(resolve, reject); }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function waitFor(predicate, timeout = 1000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("timed out waiting for condition");
}

let moduleNumber = 0;
async function freshCloud() {
  globalThis.localStorage = new MemoryStorage();
  globalThis.window = new EventTarget();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  moduleNumber += 1;
  return import(`../js/cloud-sync.js?integration=${moduleNumber}`);
}

function makeState(overrides = {}) {
  return store.normalizeState(overrides);
}

function createClient({ session = null, onQuery }) {
  let authListener = null;
  const auth = {
    onAuthStateChange(callback) {
      authListener = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async getSession() { return { data: { session }, error: null }; },
    async signInWithPassword() { return { data: { session, user: session?.user }, error: null }; },
    async signOut() { return { error: null }; },
  };
  return {
    client: {
      auth,
      from(table) { return new Query(table, onQuery); },
      functions: { async invoke() { return { data: {}, error: null }; } },
    },
    emitAuth(event, nextSession) {
      session = nextSession;
      authListener?.(event, nextSession);
    },
  };
}

function dispatchSaved(state, source = "local") {
  window.dispatchEvent(new CustomEvent("kintore:state-saved", {
    detail: { state, source },
  }));
}

test("cloud sync fails closed when no restore callback is provided", async () => {
  const cloud = await freshCloud();
  const statuses = [];
  await cloud.initCloudSync({
    getState: () => makeState(),
    onStatus: status => statuses.push(status),
  });
  assert.equal(statuses.at(-1).available, false);
  assert.equal(statuses.at(-1).phase, "error");
});

test("device-only saves never mark an old cloud snapshot dirty", async () => {
  const cloud = await freshCloud();
  localStorage.setItem("kintore-cloud-owner-v1", "user-1");
  localStorage.setItem("kintore-cloud-sync-meta-v1", JSON.stringify({
    "user-1": { baseHash: "known", remoteToken: "2026-08-14T00:00:00.000Z", dirty: false },
  }));
  const fake = createClient({
    session: null,
    onQuery: async () => ({ data: null, error: null }),
  });
  globalThis.supabase = { createClient: () => fake.client };

  await cloud.initCloudSync({
    getState: () => makeState(),
    applyState: () => {},
  });
  dispatchSaved(makeState({ advice: { accountEmail: "local@example.com" } }), "device-only");

  const meta = JSON.parse(localStorage.getItem("kintore-cloud-sync-meta-v1"));
  assert.equal(meta["user-1"].dirty, false);
});

test("a newer unsupported cloud state fails closed without applying or writing", async () => {
  const cloud = await freshCloud();
  const session = { user: { id: "user-1", email: "user@example.com" } };
  let applyCount = 0;
  let writeCount = 0;
  const fake = createClient({
    session,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        return {
          data: { state: makeState(), state_version: 3, synced_at: "2026-08-14T00:00:00.000Z" },
          error: null,
        };
      }
      if (["insert", "update", "upsert"].includes(query.operation)) writeCount += 1;
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  await assert.rejects(cloud.initCloudSync({
    getState: () => makeState(),
    applyState: () => { applyCount += 1; },
  }), /新しい形式/);
  assert.equal(applyCount, 0);
  assert.equal(writeCount, 0);
});

test("a queued blank state cannot overwrite the cloud while sign-in reconciliation is pending", async () => {
  const cloud = await freshCloud();
  const session = { user: { id: "user-1", email: "user@example.com" } };
  const remoteState = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "remote", sets: [{ w: 60, r: 6 }] }] },
  });
  let localState = makeState();
  let snapshotWrites = 0;
  const fake = createClient({
    session: null,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        return {
          data: { state: remoteState, state_version: 2, synced_at: "2026-08-14T00:00:00.000Z" },
          error: null,
        };
      }
      if (query.table === "kintore_snapshots" && ["insert", "update"].includes(query.operation)) {
        snapshotWrites += 1;
      }
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  await cloud.initCloudSync({
    getState: () => localState,
    applyState: value => { localState = makeState(value); },
  });
  fake.emitAuth("SIGNED_IN", session);
  const result = await cloud.syncCloudNow(localState);

  assert.equal(result.action, "pulled");
  assert.ok(localState.workouts["2026-08-14"]);
  assert.equal(snapshotWrites, 0);
});

test("blank local data never trusts reset intent owned by another account", async () => {
  const cloud = await freshCloud();
  const session = { user: { id: "user-b", email: "b@example.com" } };
  const remoteState = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "remote-b", sets: [{ w: 70, r: 7 }] }] },
  });
  const remoteHash = await cloud.fingerprintState(remoteState);
  localStorage.setItem("kintore-cloud-owner-v1", "user-a");
  localStorage.setItem("kintore-cloud-sync-meta-v1", JSON.stringify({
    "user-b": {
      baseHash: remoteHash,
      remoteToken: "2026-08-14T00:00:00.000Z",
      dirty: true,
      allowBlankPush: true,
    },
  }));
  let localState = makeState();
  let snapshotWrites = 0;
  const fake = createClient({
    session,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        return {
          data: { state: remoteState, state_version: 2, synced_at: "2026-08-14T00:00:00.000Z" },
          error: null,
        };
      }
      if (query.table === "kintore_snapshots" && ["insert", "update"].includes(query.operation)) {
        snapshotWrites += 1;
      }
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  await cloud.initCloudSync({
    getState: () => localState,
    applyState: value => { localState = makeState(value); },
  });

  assert.ok(localState.workouts["2026-08-14"]);
  assert.equal(snapshotWrites, 0);
});

test("an auth switch makes an older in-flight restore stale", async () => {
  const cloud = await freshCloud();
  const sessionA = { user: { id: "user-a", email: "a@example.com" } };
  const sessionB = { user: { id: "user-b", email: "b@example.com" } };
  const queryAStarted = deferred();
  const queryAResult = deferred();
  const remoteA = makeState({
    workouts: { "2026-08-13": [{ exerciseId: "a", sets: [{ w: 1, r: 1 }] }] },
  });
  const remoteB = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "b", sets: [{ w: 2, r: 2 }] }] },
  });
  let localState = makeState();
  const appliedExerciseIds = [];
  let writes = 0;
  const fake = createClient({
    session: sessionA,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        const userId = query.filters.find(([column]) => column === "user_id")?.[1];
        if (userId === "user-a") {
          queryAStarted.resolve();
          return queryAResult.promise;
        }
        return {
          data: { state: remoteB, state_version: 2, synced_at: "2026-08-14T02:00:00.000Z" },
          error: null,
        };
      }
      if (["insert", "update"].includes(query.operation)) writes += 1;
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  const statuses = [];
  const initPromise = cloud.initCloudSync({
    getState: () => localState,
    applyState: value => {
      localState = makeState(value);
      const entry = Object.values(localState.workouts).flat()[0];
      if (entry) appliedExerciseIds.push(entry.exerciseId);
    },
    onStatus: status => statuses.push(status),
    onConflict: () => "cancel",
  });
  await queryAStarted.promise;
  fake.emitAuth("SIGNED_IN", sessionB);
  queryAResult.resolve({
    data: { state: remoteA, state_version: 2, synced_at: "2026-08-14T01:00:00.000Z" },
    error: null,
  });

  await assert.rejects(initPromise, /stale auth session/);
  await waitFor(() => appliedExerciseIds.includes("b"));
  assert.deepEqual(appliedExerciseIds, ["b"]);
  assert.ok(localState.workouts["2026-08-14"]);
  assert.equal(writes, 0);
  assert.equal(statuses.at(-1).email, "b@example.com");
});

test("a new account can reconcile while the previous account write is still in flight", async () => {
  const cloud = await freshCloud();
  const sessionA = { user: { id: "user-a", email: "a@example.com" } };
  const sessionB = { user: { id: "user-b", email: "b@example.com" } };
  const baseState = makeState();
  const updateAStarted = deferred();
  const releaseUpdateA = deferred();
  let insertedForB = false;
  let localState = baseState;
  const statuses = [];

  const fake = createClient({
    session: sessionA,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        const userId = query.filters.find(([column]) => column === "user_id")?.[1];
        if (userId === "user-a") {
          return {
            data: { state: baseState, state_version: 2, synced_at: "2026-08-14T00:00:00.000Z" },
            error: null,
          };
        }
        return { data: null, error: null };
      }
      if (query.table === "kintore_snapshots" && query.operation === "update") {
        const userId = query.filters.find(([column]) => column === "user_id")?.[1];
        if (userId === "user-a") {
          updateAStarted.resolve();
          await releaseUpdateA.promise;
          return { data: { synced_at: "2026-08-14T00:00:01.000Z" }, error: null };
        }
      }
      if (query.table === "kintore_snapshots" && query.operation === "insert") {
        if (query.payload.user_id === "user-b") insertedForB = true;
        return { data: { synced_at: "2026-08-14T00:00:02.000Z" }, error: null };
      }
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  await cloud.initCloudSync({
    getState: () => localState,
    applyState: value => { localState = makeState(value); },
    onStatus: status => statuses.push(status),
  });

  const stateA = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "a", sets: [{ w: 10, r: 1 }] }] },
  });
  const writeA = cloud.syncCloudNow(stateA);
  const aRejected = assert.rejects(writeA, /stale auth session/);
  await updateAStarted.promise;

  fake.emitAuth("SIGNED_IN", sessionB);
  const writeB = cloud.syncCloudNow(baseState);
  const resultB = await writeB;
  assert.equal(resultB.action, "seeded");
  assert.equal(insertedForB, true);

  releaseUpdateA.resolve();
  await aRejected;
  assert.equal(statuses.at(-1).email, "b@example.com");
});

test("manual and automatic writes are serialized and keep the latest state", async () => {
  const cloud = await freshCloud();
  const session = { user: { id: "user-1", email: "user@example.com" } };
  const baseState = makeState();
  const firstUpdateStarted = deferred();
  const releaseFirstUpdate = deferred();
  const updates = [];
  let activeUpdates = 0;
  let maxActiveUpdates = 0;
  let updateNumber = 0;
  let localState = baseState;

  const fake = createClient({
    session,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        return {
          data: { state: baseState, state_version: 2, synced_at: "2026-08-14T00:00:00.000Z" },
          error: null,
        };
      }
      if (query.table === "kintore_snapshots" && query.operation === "update") {
        updateNumber += 1;
        activeUpdates += 1;
        maxActiveUpdates = Math.max(maxActiveUpdates, activeUpdates);
        const expectedToken = query.filters.find(([column]) => column === "synced_at")?.[1];
        updates.push({ state: query.payload.state, expectedToken });
        if (updateNumber === 1) {
          firstUpdateStarted.resolve();
          await releaseFirstUpdate.promise;
        }
        activeUpdates -= 1;
        return { data: { synced_at: `2026-08-14T00:00:0${updateNumber}.000Z` }, error: null };
      }
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  await cloud.initCloudSync({
    getState: () => localState,
    applyState: value => { localState = makeState(value); },
  });

  const stateOne = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "first", sets: [{ w: 10, r: 1 }] }] },
  });
  const stateTwo = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "latest", sets: [{ w: 20, r: 2 }] }] },
  });
  localState = stateOne;
  dispatchSaved(localState);
  const firstWrite = cloud.syncCloudNow(localState);
  await firstUpdateStarted.promise;
  localState = stateTwo;
  dispatchSaved(localState);
  const secondWrite = cloud.syncCloudNow(localState);
  releaseFirstUpdate.resolve();
  await Promise.all([firstWrite, secondWrite]);

  assert.equal(maxActiveUpdates, 1);
  assert.equal(updates.length, 2);
  assert.equal(updates[0].expectedToken, "2026-08-14T00:00:00.000Z");
  assert.equal(updates[1].expectedToken, "2026-08-14T00:00:01.000Z");
  assert.equal(updates[0].state.workouts["2026-08-14"][0].exerciseId, "first");
  assert.equal(updates[1].state.workouts["2026-08-14"][0].exerciseId, "latest");
});

test("an explicit reset made during profile sync keeps its blank-write intent", async () => {
  const cloud = await freshCloud();
  const session = { user: { id: "user-1", email: "user@example.com" } };
  const baseState = makeState({
    workouts: { "2026-08-13": [{ exerciseId: "base", sets: [{ w: 40, r: 4 }] }] },
  });
  let localState = baseState;
  const firstProfileStarted = deferred();
  const releaseFirstProfile = deferred();
  const secondUpdateStarted = deferred();
  const releaseSecondUpdate = deferred();
  let profileCalls = 0;
  let updateCalls = 0;
  const uploadedStates = [];
  const fake = createClient({
    session,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        return {
          data: { state: baseState, state_version: 2, synced_at: "2026-08-14T00:00:00.000Z" },
          error: null,
        };
      }
      if (query.table === "kintore_snapshots" && query.operation === "update") {
        updateCalls += 1;
        uploadedStates.push(query.payload.state);
        if (updateCalls === 2) {
          secondUpdateStarted.resolve();
          await releaseSecondUpdate.promise;
        }
        return { data: { synced_at: `2026-08-14T00:00:0${updateCalls}.000Z` }, error: null };
      }
      if (query.table === "kintore_profiles" && query.operation === "upsert") {
        profileCalls += 1;
        if (profileCalls === 1) {
          firstProfileStarted.resolve();
          await releaseFirstProfile.promise;
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  await cloud.initCloudSync({
    getState: () => localState,
    applyState: value => { localState = makeState(value); },
  });
  localState = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "before-reset", sets: [{ w: 50, r: 5 }] }] },
  });
  dispatchSaved(localState);
  const syncing = cloud.syncCloudNow(localState);
  await firstProfileStarted.promise;

  localState = makeState();
  dispatchSaved(localState, "reset");
  releaseFirstProfile.resolve();
  await secondUpdateStarted.promise;

  const metaDuringReset = JSON.parse(localStorage.getItem("kintore-cloud-sync-meta-v1"))["user-1"];
  assert.equal(metaDuringReset.dirty, true);
  assert.equal(metaDuringReset.allowBlankPush, true);
  assert.equal(store.hasMeaningfulData(uploadedStates[1]), false);

  releaseSecondUpdate.resolve();
  await syncing;
  const finalMeta = JSON.parse(localStorage.getItem("kintore-cloud-sync-meta-v1"))["user-1"];
  assert.equal(finalMeta.dirty, false);
  assert.equal(finalMeta.allowBlankPush, false);
});

test("a failed write stays pending without a retry loop and retries when online", async t => {
  t.mock.method(console, "warn", () => {});
  const cloud = await freshCloud();
  const session = { user: { id: "user-1", email: "user@example.com" } };
  const baseState = makeState();
  let localState = baseState;
  let updateAttempts = 0;
  let failUpdate = true;
  const statuses = [];
  const fake = createClient({
    session,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        return {
          data: { state: baseState, state_version: 2, synced_at: "2026-08-14T00:00:00.000Z" },
          error: null,
        };
      }
      if (query.table === "kintore_snapshots" && query.operation === "update") {
        updateAttempts += 1;
        if (failUpdate) return { data: null, error: new Error("Failed to fetch") };
        return { data: { synced_at: "2026-08-14T00:00:01.000Z" }, error: null };
      }
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  await cloud.initCloudSync({
    getState: () => localState,
    applyState: value => { localState = makeState(value); },
    onStatus: status => statuses.push(status),
  });
  localState = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "pending", sets: [{ w: 30, r: 3 }] }] },
  });
  dispatchSaved(localState);
  await assert.rejects(cloud.syncCloudNow(localState), /Failed to fetch/);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(updateAttempts, 1);
  assert.equal(statuses.at(-1).phase, "pending");

  failUpdate = false;
  window.dispatchEvent(new Event("online"));
  await waitFor(() => updateAttempts === 2);
  await waitFor(() => statuses.at(-1).phase === "synced");
  assert.equal(updateAttempts, 2);
});

test("an edit made while a cloud restore is hashing is queued and uploaded", async () => {
  const cloud = await freshCloud();
  const session = { user: { id: "user-1", email: "user@example.com" } };
  const remoteState = makeState({
    workouts: { "2026-08-14": [{ exerciseId: "remote", sets: [{ w: 50, r: 5 }] }] },
  });
  let localState = makeState();
  const updates = [];
  const fake = createClient({
    session,
    onQuery: async query => {
      if (query.table === "kintore_snapshots" && query.operation === "select") {
        return {
          data: { state: remoteState, state_version: 2, synced_at: "2026-08-14T00:00:00.000Z" },
          error: null,
        };
      }
      if (query.table === "kintore_snapshots" && query.operation === "update") {
        updates.push(query.payload.state);
        return { data: { synced_at: "2026-08-14T00:00:01.000Z" }, error: null };
      }
      return { data: null, error: null };
    },
  });
  globalThis.supabase = { createClient: () => fake.client };

  await cloud.initCloudSync({
    getState: () => localState,
    applyState: value => {
      localState = makeState(value);
      queueMicrotask(() => {
        localState = makeState({
          ...localState,
          runs: { "2026-08-14": [{ id: "new-run", distance: 5, durationSec: 1800 }] },
        });
        dispatchSaved(localState);
      });
    },
  });

  await waitFor(() => updates.length === 1);
  assert.equal(localState.runs["2026-08-14"][0].id, "new-run");
  assert.equal(updates[0].runs["2026-08-14"][0].id, "new-run");
});
