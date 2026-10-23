import { DEFAULT_PARTS, DEFAULT_EXERCISES, DEFAULT_TARGETS } from "./data.js";

const KEY = "kintore-memo-v1";
const RECOVERY_KEY = "kintore-memo-recovery-v1";
const DEFAULT_ADVICE = {
  goals: ["国づくり", "居心地のいいコミュニティ作り", "健康の最適化"],
  weaknesses: "",
  notificationEnabled: true,
  notificationTime: "08:00",
  accountEmail: "",
};

function defaults() {
  return {
    parts: [...DEFAULT_PARTS],
    exercises: DEFAULT_EXERCISES.map(e => ({ ...e })),
    // workouts: { "YYYY-MM-DD": [ { exerciseId, sets: [{w, r}] } ] }
    workouts: {},
    // meals: { "YYYY-MM-DD": { breakfast: [ {name, grams, kcal, p, f, c} ], ... } }
    meals: {},
    // body: { "YYYY-MM-DD": { weight, fat } }
    body: {},
    // runs: { "YYYY-MM-DD": [ {id, distance, durationSec, paceSec, memo} ] }
    runs: {},
    // 動画本体は IndexedDB。ここには表示用メタデータのみ保存する
    exerciseVideos: {},
    customFoods: [],
    targets: { ...DEFAULT_TARGETS },
    advice: { ...DEFAULT_ADVICE, goals: [...DEFAULT_ADVICE.goals] },
    meta: { updatedAt: null },
  };
}

export let state = load();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeState(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid data");
  }
  return {
    ...defaults(),
    ...value,
    parts: Array.isArray(value.parts) ? [...value.parts] : [...DEFAULT_PARTS],
    exercises: Array.isArray(value.exercises)
      ? value.exercises.map(exercise => ({ ...exercise }))
      : DEFAULT_EXERCISES.map(exercise => ({ ...exercise })),
    workouts: value.workouts && typeof value.workouts === "object" ? value.workouts : {},
    meals: value.meals && typeof value.meals === "object" ? value.meals : {},
    body: value.body && typeof value.body === "object" ? value.body : {},
    runs: value.runs && typeof value.runs === "object" ? value.runs : {},
    exerciseVideos: value.exerciseVideos && typeof value.exerciseVideos === "object"
      ? value.exerciseVideos
      : {},
    customFoods: Array.isArray(value.customFoods) ? value.customFoods : [],
    targets: { ...DEFAULT_TARGETS, ...(value.targets || {}) },
    advice: {
      ...DEFAULT_ADVICE,
      ...(value.advice || {}),
      goals: [...DEFAULT_ADVICE.goals],
    },
    meta: {
      updatedAt: value.meta?.updatedAt || null,
    },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    console.error("failed to load state", e);
    return defaults();
  }
}

function persist({ source = "local", notify = true, throwOnError = false } = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (notify) {
      window.dispatchEvent(new CustomEvent("kintore:state-saved", {
        detail: { state, source },
      }));
    }
    return true;
  } catch (e) {
    console.error("failed to save state", e);
    if (throwOnError) throw new Error("端末への保存に失敗しました。空き容量を確認してください");
    return false;
  }
}

export function save({ source = "local", touch = source !== "cloud" } = {}) {
  if (touch) {
    state.meta = { ...(state.meta || {}), updatedAt: new Date().toISOString() };
  }
  return persist({ source });
}

export function createRecoveryBackup(value, reason = "sync-conflict") {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    const existing = raw ? JSON.parse(raw) : [];
    const backups = Array.isArray(existing) ? existing : [];
    backups.unshift({
      savedAt: new Date().toISOString(),
      reason,
      state: clone(value),
    });
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(backups.slice(0, 3)));
    return true;
  } catch (error) {
    console.warn("failed to create recovery backup", error);
    return false;
  }
}

export function replaceStateFromCloud(value) {
  const previous = state;
  const localVideos = clone(state.exerciseVideos || {});
  const accountEmail = state.advice?.accountEmail || "";
  const next = normalizeState(value);
  next.exerciseVideos = localVideos;
  next.advice.accountEmail = accountEmail;
  state = next;
  try {
    persist({ source: "cloud", throwOnError: true });
  } catch (error) {
    state = previous;
    throw error;
  }
  window.dispatchEvent(new CustomEvent("kintore:state-replaced", {
    detail: { state, source: "cloud" },
  }));
}

export function toCloudSnapshot(value = state) {
  const snapshot = clone(normalizeState(value));
  snapshot.exerciseVideos = {};
  if (snapshot.advice) snapshot.advice.accountEmail = "";
  return snapshot;
}

function sameJSON(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasMeaningfulData(value = state) {
  const normalized = normalizeState(value);
  const advice = normalized.advice || {};
  return Object.keys(normalized.workouts).length > 0
    || Object.keys(normalized.meals).length > 0
    || Object.keys(normalized.body).length > 0
    || Object.keys(normalized.runs).length > 0
    || normalized.customFoods.length > 0
    || !sameJSON(normalized.parts, DEFAULT_PARTS)
    || !sameJSON(normalized.exercises, DEFAULT_EXERCISES)
    || !sameJSON(normalized.targets, DEFAULT_TARGETS)
    || String(advice.weaknesses || "").trim() !== ""
    || advice.notificationEnabled === false
    || (advice.notificationTime || "08:00") !== "08:00";
}

export function summarizeState(value = state) {
  const normalized = normalizeState(value);
  const workoutDays = Object.keys(normalized.workouts).filter(key =>
    Array.isArray(normalized.workouts[key]) && normalized.workouts[key].length
  );
  const mealDays = Object.keys(normalized.meals).filter(key =>
    normalized.meals[key] && Object.keys(normalized.meals[key]).length
  );
  const bodyDays = Object.keys(normalized.body);
  const runDays = Object.keys(normalized.runs).filter(key =>
    Array.isArray(normalized.runs[key]) && normalized.runs[key].length
  );
  const dates = [...workoutDays, ...mealDays, ...bodyDays, ...runDays].sort();
  return {
    workoutDays: workoutDays.length,
    mealDays: mealDays.length,
    bodyDays: bodyDays.length,
    runDays: runDays.length,
    latestDate: dates.at(-1) || null,
  };
}

export function resetAll() {
  state = defaults();
  save({ source: "reset" });
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text); // throws on invalid
  state = normalizeState(parsed);
  save({ source: "import" });
}

export function uid() {
  return "id-" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
