import {
  createRecoveryBackup,
  hasMeaningfulData,
  summarizeState,
  toCloudSnapshot,
} from "./store.js";

const SUPABASE_URL = "https://imrxzkivwrkqbhqfbbes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T0a9mtOIbupU5n_VAe9caw_xlnbbWfB";
const FUNCTION_NAME = "daily-kintore-advice";
const SYNC_META_KEY = "kintore-cloud-sync-meta-v1";
const OWNER_KEY = "kintore-cloud-owner-v1";
const STATE_VERSION = 2;

let client = null;
let currentSession = null;
let listener = null;
let getCurrentState = null;
let applyRemoteState = null;
let conflictResolver = null;
let syncTimer = null;
let pendingState = null;
let syncInFlight = null;
let reconcilePromise = null;
let reconciledUserId = null;
let reconciledEpoch = null;
let syncReady = false;
let lastRemoteToken = null;
let pendingConflict = null;
let localMutationVersion = 0;
let authEpoch = 0;

const status = {
  available: true,
  connected: false,
  busy: false,
  email: "",
  phase: "disconnected",
  message: "ログインすると記録をクラウドへ保存できます",
  lastSyncedAt: null,
  lastAdvice: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emit(patch = {}) {
  Object.assign(status, patch);
  listener?.({ ...status });
}

function requireClient() {
  if (!client) throw new Error("クラウド連携を読み込めませんでした。通信環境を確認してください");
  return client;
}

function normalizeError(error, fallback) {
  const message = error?.message || String(error || "");
  if (/Invalid login credentials/i.test(message)) return "メールアドレスまたはパスワードが正しくありません";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) return "通信できませんでした。ネット接続を確認してください";
  return message || fallback;
}

function readAllSyncMeta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_META_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getSyncMeta(userId) {
  return readAllSyncMeta()[userId] || {};
}

function updateSyncMeta(userId, patch) {
  if (!userId) return;
  const all = readAllSyncMeta();
  all[userId] = { ...(all[userId] || {}), ...patch };
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(all));
}

function getLocalOwner() {
  return localStorage.getItem(OWNER_KEY) || null;
}

function setLocalOwner(userId) {
  if (userId) localStorage.setItem(OWNER_KEY, userId);
}

function staleSessionError() {
  const error = new Error("stale auth session");
  error.code = "STALE_AUTH_SESSION";
  return error;
}

function isStaleSessionError(error) {
  return error?.code === "STALE_AUTH_SESSION";
}

function sessionContext(session = currentSession, epoch = authEpoch) {
  if (!session?.user?.id) throw staleSessionError();
  return { session, userId: session.user.id, epoch };
}

function assertSessionContext(context) {
  if (context.epoch !== authEpoch || currentSession?.user?.id !== context.userId) {
    throw staleSessionError();
  }
}

function resetSyncGate() {
  authEpoch += 1;
  clearTimeout(syncTimer);
  pendingState = null;
  syncReady = false;
  lastRemoteToken = null;
  pendingConflict = null;
  syncInFlight = null;
  reconciledUserId = null;
  reconciledEpoch = null;
  reconcilePromise = null;
}

function adoptSession(session, { event = "", schedule = false } = {}) {
  const previousUserId = currentSession?.user?.id || null;
  const nextUserId = session?.user?.id || null;
  const userChanged = previousUserId !== nextUserId;
  if (userChanged) resetSyncGate();
  currentSession = session || null;

  if (!currentSession) {
    emit({
      connected: false,
      busy: false,
      email: "",
      phase: "disconnected",
      message: event === "SIGNED_OUT"
        ? "ログアウトしました。端末内の記録は残っています"
        : "ログインすると記録をクラウドへ保存できます",
      lastSyncedAt: null,
      lastAdvice: null,
    });
    return null;
  }

  emit({
    connected: true,
    email: currentSession.user.email || "",
    phase: syncReady || pendingConflict ? status.phase : "checking",
    message: syncReady || pendingConflict ? status.message : "クラウドの記録を確認しています…",
  });

  const shouldPrepare = userChanged
    || (!syncReady && !pendingConflict && (event === "SIGNED_IN" || event === "INITIAL_SESSION"));
  if (schedule && shouldPrepare) {
    const scheduledSession = currentSession;
    const scheduledEpoch = authEpoch;
    setTimeout(async () => {
      try {
        await prepareSession(scheduledSession, scheduledEpoch);
        await refreshLastAdvice(scheduledSession, scheduledEpoch);
      } catch (error) {
        if (!isStaleSessionError(error)) console.warn("background session reconciliation failed", error);
      }
    }, 0);
  }
  return sessionContext(currentSession, authEpoch);
}

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalize(value[key])}`
  ).join(",")}}`;
}

export async function fingerprintState(value) {
  const serialized = canonicalize(toCloudSnapshot(value));
  const bytes = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function decideReconciliation({
  remoteExists,
  localHash,
  remoteHash,
  baseHash = null,
  dirty = false,
  allowBlankPush = false,
  localMeaningful = false,
  remoteMeaningful = false,
}) {
  if (!remoteExists) return "seed-local";
  if (localHash === remoteHash) return "same";

  // A fresh device or cleared browser must never overwrite a real cloud snapshot.
  // An explicit reset is distinguishable because a previous base exists and dirty=true.
  if (!localMeaningful && remoteMeaningful) {
    if (baseHash && dirty && allowBlankPush && remoteHash === baseHash) return "push";
    return "pull";
  }

  if (baseHash) {
    const localChanged = localHash !== baseHash;
    const remoteChanged = remoteHash !== baseHash;
    if (!localChanged && remoteChanged) return "pull";
    if (localChanged && !remoteChanged && dirty) return "push";
    if (!localChanged && !remoteChanged) return "same";
  }

  if (!localMeaningful && !remoteMeaningful) return "pull";
  return "conflict";
}

function nextSyncToken(previousToken = null) {
  const previous = Date.parse(previousToken || "") || 0;
  return new Date(Math.max(Date.now(), previous + 1)).toISOString();
}

function assertSupportedRemote(remote) {
  if (!remote?.state || typeof remote.state !== "object" || Array.isArray(remote.state)) {
    throw new Error("クラウドの保存データを読み込めませんでした");
  }
  const version = remote.state_version == null ? 1 : Number(remote.state_version);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("クラウドの保存データの形式が正しくありません");
  }
  if (version > STATE_VERSION) {
    throw new Error("クラウドデータが新しい形式です。アプリを更新してください");
  }
  if (!remote.synced_at || Number.isNaN(Date.parse(remote.synced_at))) {
    throw new Error("クラウドの更新日時を確認できませんでした");
  }
}

async function fetchCloudSnapshot(context) {
  assertSessionContext(context);
  const { data, error } = await requireClient()
    .from("kintore_snapshots")
    .select("state,state_version,synced_at")
    .eq("user_id", context.userId)
    .maybeSingle();
  assertSessionContext(context);
  if (error) throw error;
  if (data) assertSupportedRemote(data);
  return data || null;
}

async function insertCloudSnapshot(context, value) {
  assertSessionContext(context);
  const snapshot = toCloudSnapshot(value);
  const token = nextSyncToken();
  const { data, error } = await requireClient()
    .from("kintore_snapshots")
    .insert({
      user_id: context.userId,
      state: snapshot,
      state_version: STATE_VERSION,
      synced_at: token,
    })
    .select("synced_at")
    .maybeSingle();
  assertSessionContext(context);
  if (error) throw error;
  return data?.synced_at || token;
}

async function updateCloudSnapshotCAS(context, value, expectedToken) {
  assertSessionContext(context);
  const snapshot = toCloudSnapshot(value);
  const token = nextSyncToken(expectedToken);
  const { data, error } = await requireClient()
    .from("kintore_snapshots")
    .update({
      state: snapshot,
      state_version: STATE_VERSION,
      synced_at: token,
    })
    .eq("user_id", context.userId)
    .eq("synced_at", expectedToken)
    .select("synced_at")
    .maybeSingle();
  assertSessionContext(context);
  if (error) throw error;
  return data?.synced_at || null;
}

async function syncProfile(context, value) {
  assertSessionContext(context);
  const advice = value?.advice || {};
  const now = new Date().toISOString();
  const { error } = await requireClient().from("kintore_profiles").upsert({
    user_id: context.userId,
    goals: ["国づくり", "居心地のいいコミュニティ作り", "健康の最適化"],
    weaknesses: String(advice.weaknesses || "").slice(0, 2000),
    notification_enabled: advice.notificationEnabled !== false,
    notification_time: `${(advice.notificationTime || "08:00").slice(0, 5)}:00`,
    timezone: "Asia/Tokyo",
    updated_at: now,
  }, { onConflict: "user_id" });
  assertSessionContext(context);
  if (error) throw error;
}

async function commitSuccessfulSync(context, value, remoteToken, message = "最新の記録を保存しました") {
  assertSessionContext(context);
  const hash = await fingerprintState(value);
  assertSessionContext(context);
  const versionBeforeCurrentHash = localMutationVersion;
  const currentValue = clone(getCurrentState?.() || value);
  const currentHash = await fingerprintState(currentValue);
  assertSessionContext(context);
  let localChangedWhileSaving = localMutationVersion !== versionBeforeCurrentHash
    || currentHash !== hash;
  const versionAfterCurrentHash = localMutationVersion;
  try {
    await syncProfile(context, value);
  } catch (error) {
    if (isStaleSessionError(error)) throw error;
    console.warn("fitness history saved but profile sync failed", error);
    message = "記録は保存しましたが、LINE設定の同期に失敗しました";
  }
  assertSessionContext(context);
  localChangedWhileSaving = localChangedWhileSaving
    || localMutationVersion !== versionAfterCurrentHash;
  const existingMeta = getSyncMeta(context.userId);
  lastRemoteToken = remoteToken;
  syncReady = true;
  pendingConflict = null;
  setLocalOwner(context.userId);
  updateSyncMeta(context.userId, {
    baseHash: hash,
    remoteToken,
    dirty: localChangedWhileSaving,
    allowBlankPush: localChangedWhileSaving && !!existingMeta.allowBlankPush,
  });
  emit({
    connected: true,
    busy: false,
    phase: "synced",
    email: context.session.user.email || "",
    lastSyncedAt: remoteToken,
    message,
  });
  return remoteToken;
}

async function applyCloudSnapshot(context, remote, localValue, reason = "cloud-restore") {
  assertSessionContext(context);
  assertSupportedRemote(remote);
  if (hasMeaningfulData(localValue) && !createRecoveryBackup(localValue, reason)) {
    throw new Error("端末データの復旧用バックアップを作成できなかったため、復元を中止しました");
  }
  assertSessionContext(context);
  applyRemoteState(clone(remote.state));
  setLocalOwner(context.userId);
  const appliedMutationVersion = localMutationVersion;
  const applied = clone(getCurrentState?.() || remote.state);
  const hash = await fingerprintState(applied);
  assertSessionContext(context);
  const localChangedAfterApply = localMutationVersion !== appliedMutationVersion;
  const existingMeta = getSyncMeta(context.userId);
  lastRemoteToken = remote.synced_at;
  syncReady = true;
  pendingState = localChangedAfterApply ? clone(getCurrentState?.() || applied) : null;
  pendingConflict = null;
  updateSyncMeta(context.userId, {
    baseHash: hash,
    remoteToken: remote.synced_at,
    dirty: localChangedAfterApply,
    allowBlankPush: localChangedAfterApply && !!existingMeta.allowBlankPush,
  });
  emit({
    connected: true,
    busy: false,
    phase: "restored",
    email: context.session.user.email || "",
    lastSyncedAt: remote.synced_at,
    message: "クラウドの記録をこの端末に復元しました",
  });
  if (localChangedAfterApply) scheduleCloudSync(getCurrentState?.(), 0);
  return { action: "pulled", remoteToken: remote.synced_at };
}

async function handleConflict(context, { localValue, remote, reason = "both-changed" }) {
  assertSessionContext(context);
  syncReady = false;
  pendingConflict = { localValue: clone(localValue), remote: remote ? clone(remote) : null, reason };
  const info = {
    reason,
    remoteExists: !!remote,
    remoteSyncedAt: remote?.synced_at || null,
    local: summarizeState(localValue),
    remote: remote?.state ? summarizeState(remote.state) : null,
  };
  emit({
    connected: true,
    busy: false,
    phase: "conflict",
    message: "この端末とクラウドの両方に別の記録があります",
  });

  const choice = await Promise.resolve(conflictResolver?.(info) || "cancel");
  assertSessionContext(context);
  if (choice === "cloud" && remote) {
    const latestLocal = clone(getCurrentState?.() || localValue);
    return applyCloudSnapshot(context, remote, latestLocal, "before-conflict-cloud-restore");
  }
  if (choice === "local") {
    if (remote?.state
      && !createRecoveryBackup(remote.state, "before-conflict-local-overwrite")) {
      throw new Error("クラウドデータの復旧用バックアップを作成できなかったため、上書きを中止しました");
    }
    const latestLocal = clone(getCurrentState?.() || localValue);
    const capturedMutationVersion = localMutationVersion;
    let token;
    if (remote) {
      token = await updateCloudSnapshotCAS(context, latestLocal, remote.synced_at);
      if (!token) {
        const latestRemote = await fetchCloudSnapshot(context);
        pendingConflict = { localValue: clone(latestLocal), remote: latestRemote, reason: "changed-again" };
        emit({
          busy: false,
          phase: "conflict",
          message: "別端末の記録が再び更新されました。もう一度同期してください",
        });
        return { action: "conflict" };
      }
    } else {
      try {
        token = await insertCloudSnapshot(context, latestLocal);
      } catch (error) {
        if (String(error?.code || "") !== "23505" && !/duplicate key/i.test(error?.message || "")) {
          throw error;
        }
        const latestRemote = await fetchCloudSnapshot(context);
        pendingConflict = {
          localValue: clone(latestLocal),
          remote: latestRemote,
          reason: "created-elsewhere",
        };
        emit({
          busy: false,
          phase: "conflict",
          message: "別端末に新しい記録が作成されました。もう一度同期方法を選んでください",
        });
        return { action: "conflict" };
      }
    }
    await commitSuccessfulSync(context, latestLocal, token, "この端末の記録をクラウドへ保存しました");
    if (capturedMutationVersion === localMutationVersion) {
      pendingState = null;
    } else {
      scheduleCloudSync(getCurrentState?.(), 0);
    }
    return { action: "pushed", remoteToken: token };
  }
  return { action: "conflict" };
}

async function reconcileSession(session, epoch = authEpoch) {
  const context = sessionContext(session, epoch);
  assertSessionContext(context);
  syncReady = false;
  pendingConflict = null;
  emit({
    connected: true,
    busy: true,
    phase: "checking",
    email: session.user.email || "",
    message: "クラウドの記録を確認しています…",
  });

  const remote = await fetchCloudSnapshot(context);
  const localValue = clone(getCurrentState?.() || {});
  const capturedMutationVersion = localMutationVersion;
  const localOwner = getLocalOwner();

  if (localOwner && localOwner !== session.user.id && hasMeaningfulData(localValue)) {
    return handleConflict(context, { localValue, remote, reason: "different-account" });
  }

  const localHash = await fingerprintState(localValue);
  const remoteHash = remote ? await fingerprintState(remote.state) : null;
  // Sync metadata is only valid for the account that owns the local state.
  // Stale metadata must never authorize a blank overwrite after an account switch.
  const meta = localOwner === session.user.id ? getSyncMeta(session.user.id) : {};
  const decision = decideReconciliation({
    remoteExists: !!remote,
    localHash,
    remoteHash,
    baseHash: meta.baseHash || null,
    dirty: !!meta.dirty,
    allowBlankPush: !!meta.allowBlankPush,
    localMeaningful: hasMeaningfulData(localValue),
    remoteMeaningful: remote ? hasMeaningfulData(remote.state) : false,
  });

  // A record may be entered while the initial SELECT/hash check is in flight.
  // Re-run before applying or writing so that recent local input is never lost.
  if (capturedMutationVersion !== localMutationVersion) {
    return reconcileSession(session, epoch);
  }

  if (decision === "seed-local") {
    try {
      const token = await insertCloudSnapshot(context, localValue);
      await commitSuccessfulSync(context, localValue, token, "この端末の記録をクラウドへ初回保存しました");
      if (capturedMutationVersion === localMutationVersion) {
        pendingState = null;
      } else {
        scheduleCloudSync(getCurrentState?.(), 0);
      }
      return { action: "seeded", remoteToken: token };
    } catch (error) {
      // Another device may have created the row after our SELECT. Re-read; never overwrite it.
      if (String(error?.code || "") === "23505" || /duplicate key/i.test(error?.message || "")) {
        const latestRemote = await fetchCloudSnapshot(context);
        return handleConflict(context, { localValue, remote: latestRemote, reason: "created-elsewhere" });
      }
      throw error;
    }
  }

  if (decision === "same") {
    assertSessionContext(context);
    lastRemoteToken = remote.synced_at;
    syncReady = true;
    pendingState = null;
    setLocalOwner(session.user.id);
    updateSyncMeta(session.user.id, {
      baseHash: remoteHash,
      remoteToken: remote.synced_at,
      dirty: false,
      allowBlankPush: false,
    });
    emit({
      connected: true,
      busy: false,
      phase: "synced",
      email: session.user.email || "",
      lastSyncedAt: remote.synced_at,
      message: "この端末はクラウドの最新状態です",
    });
    return { action: "same", remoteToken: remote.synced_at };
  }

  if (decision === "pull") {
    return applyCloudSnapshot(context, remote, localValue);
  }

  if (decision === "push") {
    const token = await updateCloudSnapshotCAS(context, localValue, remote.synced_at);
    if (!token) {
      const latestRemote = await fetchCloudSnapshot(context);
      return handleConflict(context, { localValue, remote: latestRemote, reason: "changed-elsewhere" });
    }
    await commitSuccessfulSync(context, localValue, token);
    if (capturedMutationVersion === localMutationVersion) {
      pendingState = null;
    } else {
      scheduleCloudSync(getCurrentState?.(), 0);
    }
    return { action: "pushed", remoteToken: token };
  }

  return handleConflict(context, { localValue, remote });
}

async function prepareSession(session = currentSession, epoch = authEpoch) {
  if (!session) return { action: "signed-out" };
  if (reconcilePromise
    && reconciledUserId === session.user.id
    && reconciledEpoch === epoch) return reconcilePromise;
  reconciledUserId = session.user.id;
  reconciledEpoch = epoch;
  const ownPromise = reconcileSession(session, epoch)
    .catch(error => {
      if (isStaleSessionError(error)) throw error;
      syncReady = false;
      emit({
        connected: true,
        busy: false,
        phase: "error",
        message: normalizeError(error, "クラウドの記録を確認できませんでした"),
      });
      throw error;
    })
    .finally(() => {
      if (reconcilePromise === ownPromise) reconcilePromise = null;
    });
  reconcilePromise = ownPromise;
  return ownPromise;
}

async function refreshLastAdvice(session = currentSession, epoch = authEpoch) {
  if (!session || !client) {
    emit({ lastAdvice: null });
    return null;
  }
  const context = sessionContext(session, epoch);
  assertSessionContext(context);
  const { data, error } = await client
    .from("kintore_advice_deliveries")
    .select("advice_date,sent_at,generation_source")
    .eq("is_test", false)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertSessionContext(context);
  if (error) {
    console.warn("failed to load last advice", error);
    return null;
  }
  emit({ lastAdvice: data || null });
  return data || null;
}

export function getCloudStatus() {
  return { ...status };
}

export async function initCloudSync({ onStatus, getState, applyState, onConflict } = {}) {
  listener = onStatus || null;
  getCurrentState = getState || null;
  applyRemoteState = applyState || null;
  conflictResolver = onConflict || null;

  if (typeof getCurrentState !== "function" || typeof applyRemoteState !== "function") {
    emit({
      available: false,
      busy: false,
      phase: "error",
      message: "安全なクラウド復元を初期化できませんでした",
    });
    return;
  }

  if (!globalThis.supabase?.createClient) {
    emit({ busy: true, phase: "loading", message: "クラウド連携を読み込んでいます…" });
    await Promise.race([
      new Promise(resolve => window.addEventListener("supabase:ready", resolve, { once: true })),
      new Promise(resolve => setTimeout(resolve, 8000)),
    ]);
  }

  if (!globalThis.supabase?.createClient) {
    emit({
      available: false,
      busy: false,
      phase: "error",
      message: "クラウド連携を読み込めませんでした。オンラインで再読み込みしてください",
    });
    return;
  }

  client = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: localStorage,
      storageKey: "kintore-cloud-auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  client.auth.onAuthStateChange((event, session) => {
    adoptSession(session, { event, schedule: true });
  });

  window.addEventListener("kintore:state-saved", event => {
    const source = event.detail?.source;
    if (source === "cloud" || source === "device-only") return;
    localMutationVersion += 1;
    scheduleCloudSync(event.detail?.state || getCurrentState?.(), 1200, {
      allowBlankPush: source === "reset" || source === "import",
    });
  });
  window.addEventListener("online", () => {
    if (!currentSession || pendingConflict) return;
    if (!syncReady) {
      const session = currentSession;
      const epoch = authEpoch;
      setTimeout(() => prepareSession(session, epoch).catch(error => {
        if (!isStaleSessionError(error)) console.warn("online reconciliation failed", error);
      }), 0);
      return;
    }
    if (pendingState) scheduleCloudSync(pendingState, 0);
  });

  const { data, error } = await client.auth.getSession();
  if (error) {
    emit({ busy: false, phase: "error", message: normalizeError(error, "ログイン状態を確認できませんでした") });
    return;
  }
  const context = adoptSession(data.session, { event: "INITIAL_SESSION" });
  if (!context) {
    emit({ available: true, connected: false, busy: false, phase: "disconnected" });
    return;
  }
  await prepareSession(context.session, context.epoch);
  await refreshLastAdvice(context.session, context.epoch);
}

export async function connectCloud({ email, password }) {
  const supabaseClient = requireClient();
  if (!email || !password) throw new Error("メールアドレスとパスワードを入力してください");
  emit({ busy: true, phase: "signing-in", message: "ログインしています…" });
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    const context = adoptSession(data.session, { event: "SIGNED_IN" });
    const reconciliation = await prepareSession(context.session, context.epoch);
    if (reconciliation?.action === "same" || reconciliation?.action === "pulled") {
      try {
        await syncProfile(context, clone(getCurrentState?.() || {}));
      } catch (profileError) {
        if (isStaleSessionError(profileError)) throw profileError;
        console.warn("profile repair after sign-in failed", profileError);
        emit({ message: "記録は同期しましたが、LINE設定の同期に失敗しました" });
      }
    }
    await refreshLastAdvice(context.session, context.epoch);
    return { ...data, reconciliation };
  } catch (error) {
    if (isStaleSessionError(error)) {
      throw new Error("ログイン状態が別の操作で切り替わりました。もう一度お試しください");
    }
    emit({ busy: false, phase: "error", message: normalizeError(error, "ログインに失敗しました") });
    throw new Error(normalizeError(error, "ログインに失敗しました"));
  }
}

export async function disconnectCloud() {
  const supabaseClient = requireClient();
  emit({ busy: true, message: "ログアウトしています…" });
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    emit({ busy: false, phase: "error", message: normalizeError(error, "ログアウトに失敗しました") });
    throw error;
  }
  adoptSession(null, { event: "SIGNED_OUT" });
}

async function performCloudWrite(context, value) {
  assertSessionContext(context);
  const expectedToken = lastRemoteToken || getSyncMeta(context.userId).remoteToken;
  if (!expectedToken) {
    syncReady = false;
    const reconciliation = await prepareSession(context.session, context.epoch);
    if (reconciliation?.action === "conflict") {
      throw new Error("同期する記録を選択してください");
    }
    return reconciliation;
  }

  emit({ busy: true, phase: "syncing", message: "記録をクラウドへ保存しています…" });
  const token = await updateCloudSnapshotCAS(context, value, expectedToken);
  if (!token) {
    const remote = await fetchCloudSnapshot(context);
    await handleConflict(context, { localValue: value, remote, reason: "changed-elsewhere" });
    if (!syncReady) throw new Error("別端末の更新が見つかりました");
    return status.lastSyncedAt;
  }
  return commitSuccessfulSync(context, value, token);
}

async function syncOne(value) {
  requireClient();
  if (!currentSession) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    adoptSession(data.session, { event: "INITIAL_SESSION" });
  }
  if (!currentSession) throw new Error("先にデータ保存用アカウントへログインしてください");
  const context = sessionContext(currentSession, authEpoch);
  if (pendingConflict) {
    const result = await handleConflict(context, {
      localValue: getCurrentState?.() || pendingConflict.localValue,
      remote: pendingConflict.remote,
      reason: pendingConflict.reason,
    });
    if (result?.action === "conflict") {
      throw new Error("同期する記録を選択してください");
    }
    return result;
  }
  if (!syncReady) {
    const reconciliation = await prepareSession(context.session, context.epoch);
    if (reconciliation?.action === "conflict") {
      throw new Error("同期する記録を選択してください");
    }
    return reconciliation;
  }
  assertSessionContext(context);
  if (!syncReady) throw new Error("クラウドとの同期準備が完了していません");
  return performCloudWrite(context, clone(value || {}));
}

export function syncCloudNow(value = getCurrentState?.()) {
  requireClient();
  clearTimeout(syncTimer);
  const userId = currentSession?.user?.id || getLocalOwner();
  if (userId) updateSyncMeta(userId, { dirty: true });
  pendingState = clone(value || {});
  return drainSyncQueue();
}

async function drainSyncQueue() {
  if (syncInFlight) return syncInFlight;
  let failed = false;
  const ownPromise = (async () => {
    let lastResult = null;
    while (pendingState) {
      clearTimeout(syncTimer);
      const upload = pendingState;
      pendingState = null;
      try {
        lastResult = await syncOne(upload);
      } catch (error) {
        if (isStaleSessionError(error)) throw error;
        failed = true;
        pendingState = pendingState || upload;
        console.warn("background cloud sync failed", error);
        if (!pendingConflict) {
          emit({
            busy: false,
            phase: "pending",
            message: navigator.onLine === false
              ? "オフラインです。記録は端末に保存し、接続後に同期します"
              : normalizeError(error, "自動保存に失敗しました。記録は端末に残っています"),
          });
        }
        throw error;
      }
    }
    return lastResult;
  })().finally(() => {
    if (syncInFlight === ownPromise) syncInFlight = null;
    if (!failed && pendingState && currentSession && !pendingConflict) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => drainSyncQueue().catch(error => {
        if (!isStaleSessionError(error)) console.warn("queued cloud sync failed", error);
      }), 0);
    }
  });
  syncInFlight = ownPromise;
  return ownPromise;
}

export function scheduleCloudSync(value = getCurrentState?.(), delay = 1200, { allowBlankPush = false } = {}) {
  const userId = currentSession?.user?.id || getLocalOwner();
  if (userId) {
    updateSyncMeta(userId, {
      dirty: true,
      ...(allowBlankPush ? { allowBlankPush: true } : {}),
    });
  }
  if (!currentSession) return;
  pendingState = clone(value || {});
  if (pendingConflict) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => drainSyncQueue().catch(error => {
    if (!isStaleSessionError(error)) console.warn("scheduled cloud sync failed", error);
  }), delay);
}

export async function sendTestAdvice(value = getCurrentState?.()) {
  const supabaseClient = requireClient();
  const context = sessionContext(currentSession, authEpoch);
  await syncCloudNow(value);
  assertSessionContext(context);
  emit({ busy: true, phase: "sending-advice", message: "テスト通知を作成してLINEへ送っています…" });
  try {
    const { data, error } = await supabaseClient.functions.invoke(FUNCTION_NAME, {
      body: { action: "test" },
    });
    assertSessionContext(context);
    if (error) throw error;
    const failed = data?.results?.find(result => result.status === "failed");
    if (failed) throw new Error(failed.error || "LINE送信に失敗しました");
    await refreshLastAdvice(context.session, context.epoch);
    emit({ busy: false, phase: "synced", message: "LINEへテスト通知を送りました" });
    return data;
  } catch (error) {
    emit({ busy: false, phase: "error", message: normalizeError(error, "テスト通知に失敗しました") });
    throw new Error(normalizeError(error, "テスト通知に失敗しました"));
  }
}
