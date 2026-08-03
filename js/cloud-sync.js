const SUPABASE_URL = "https://imrxzkivwrkqbhqfbbes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T0a9mtOIbupU5n_VAe9caw_xlnbbWfB";
const FUNCTION_NAME = "daily-kintore-advice";

let client = null;
let currentSession = null;
let listener = null;
let getCurrentState = null;
let syncTimer = null;
let pendingState = null;

const status = {
  available: true,
  connected: false,
  busy: false,
  email: "",
  message: "LINE連携は未接続です",
  lastSyncedAt: null,
  lastAdvice: null,
};

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
  if (/Failed to fetch|NetworkError/i.test(message)) return "通信できませんでした。ネット接続を確認してください";
  return message || fallback;
}

function snapshotForUpload(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

async function refreshLastAdvice() {
  if (!currentSession || !client) {
    emit({ lastAdvice: null });
    return null;
  }
  const { data, error } = await client
    .from("kintore_advice_deliveries")
    .select("advice_date,sent_at,generation_source")
    .eq("is_test", false)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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

export async function initCloudSync({ onStatus, getState } = {}) {
  listener = onStatus || null;
  getCurrentState = getState || null;

  if (!globalThis.supabase?.createClient) {
    emit({ busy: true, message: "クラウド連携を読み込んでいます…" });
    await Promise.race([
      new Promise(resolve => window.addEventListener("supabase:ready", resolve, { once: true })),
      new Promise(resolve => setTimeout(resolve, 8000)),
    ]);
  }

  if (!globalThis.supabase?.createClient) {
    emit({
      available: false,
      busy: false,
      message: "クラウド連携を読み込めませんでした。オンラインで再読み込みしてください",
    });
    return;
  }

  emit({ available: true, busy: false });
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
    currentSession = session;
    emit({
      connected: !!session,
      email: session?.user?.email || "",
      message: session ? "LINEアドバイスと履歴同期が有効です" : "LINE連携は未接続です",
    });
    if (session && event !== "INITIAL_SESSION") refreshLastAdvice();
  });

  const { data, error } = await client.auth.getSession();
  if (error) {
    emit({ message: normalizeError(error, "ログイン状態を確認できませんでした") });
    return;
  }
  currentSession = data.session;
  emit({
    connected: !!currentSession,
    email: currentSession?.user?.email || "",
    message: currentSession ? "LINEアドバイスと履歴同期が有効です" : "LINE連携は未接続です",
  });
  if (currentSession) await refreshLastAdvice();

  window.addEventListener("kintore:state-saved", (event) => {
    if (!currentSession) return;
    scheduleCloudSync(event.detail?.state || getCurrentState?.());
  });
}

export async function connectCloud({ email, password, state }) {
  const supabaseClient = requireClient();
  if (!email || !password) throw new Error("メールアドレスとパスワードを入力してください");
  emit({ busy: true, message: "ログインしています…" });
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    currentSession = data.session;
    await syncCloudNow(state);
    await refreshLastAdvice();
    emit({
      connected: true,
      busy: false,
      email: data.user?.email || email.trim(),
      message: "接続しました。以後の記録は自動同期されます",
    });
    return data;
  } catch (error) {
    emit({ busy: false, message: normalizeError(error, "ログインに失敗しました") });
    throw new Error(normalizeError(error, "ログインに失敗しました"));
  }
}

export async function disconnectCloud() {
  const supabaseClient = requireClient();
  emit({ busy: true, message: "切断しています…" });
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    emit({ busy: false, message: normalizeError(error, "切断に失敗しました") });
    throw error;
  }
  currentSession = null;
  clearTimeout(syncTimer);
  emit({
    connected: false,
    busy: false,
    email: "",
    message: "LINE連携を解除しました",
    lastSyncedAt: null,
    lastAdvice: null,
  });
}

export async function syncCloudNow(state = getCurrentState?.()) {
  const supabaseClient = requireClient();
  clearTimeout(syncTimer);
  pendingState = null;
  const { data: sessionData } = await supabaseClient.auth.getSession();
  currentSession = sessionData.session;
  if (!currentSession) throw new Error("先にLINE連携へログインしてください");

  const advice = state?.advice || {};
  const now = new Date().toISOString();
  emit({ busy: true, message: "トレーニング履歴を同期しています…" });
  try {
    const [profileResult, snapshotResult] = await Promise.all([
      supabaseClient.from("kintore_profiles").upsert({
        user_id: currentSession.user.id,
        goals: ["国づくり", "居心地のいいコミュニティ作り", "健康の最適化"],
        weaknesses: String(advice.weaknesses || "").slice(0, 2000),
        notification_enabled: advice.notificationEnabled !== false,
        notification_time: `${(advice.notificationTime || "08:00").slice(0, 5)}:00`,
        timezone: "Asia/Tokyo",
        updated_at: now,
      }, { onConflict: "user_id" }),
      supabaseClient.from("kintore_snapshots").upsert({
        user_id: currentSession.user.id,
        state: snapshotForUpload(state),
        state_version: 1,
        synced_at: now,
      }, { onConflict: "user_id" }),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (snapshotResult.error) throw snapshotResult.error;
    emit({ busy: false, lastSyncedAt: now, message: "最新の履歴を同期しました" });
    return now;
  } catch (error) {
    emit({ busy: false, message: normalizeError(error, "同期に失敗しました") });
    throw new Error(normalizeError(error, "同期に失敗しました"));
  }
}

export function scheduleCloudSync(state = getCurrentState?.()) {
  if (!currentSession) return;
  pendingState = snapshotForUpload(state);
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const upload = pendingState;
    pendingState = null;
    try {
      await syncCloudNow(upload);
    } catch (error) {
      console.warn("background cloud sync failed", error);
    }
  }, 1200);
}

export async function sendTestAdvice(state = getCurrentState?.()) {
  const supabaseClient = requireClient();
  await syncCloudNow(state);
  emit({ busy: true, message: "テスト通知を作成してLINEへ送っています…" });
  try {
    const { data, error } = await supabaseClient.functions.invoke(FUNCTION_NAME, {
      body: { action: "test" },
    });
    if (error) throw error;
    const failed = data?.results?.find((result) => result.status === "failed");
    if (failed) throw new Error(failed.error || "LINE送信に失敗しました");
    await refreshLastAdvice();
    emit({ busy: false, message: "LINEへテスト通知を送りました" });
    return data;
  } catch (error) {
    emit({ busy: false, message: normalizeError(error, "テスト通知に失敗しました") });
    throw new Error(normalizeError(error, "テスト通知に失敗しました"));
  }
}
