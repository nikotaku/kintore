import { DEFAULT_PARTS, DEFAULT_EXERCISES, DEFAULT_TARGETS } from "./data.js";

const KEY = "kintore-memo-v1";
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
  };
}

export let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return {
      ...defaults(),
      ...parsed,
      targets: { ...DEFAULT_TARGETS, ...(parsed.targets || {}) },
      advice: {
        ...DEFAULT_ADVICE,
        ...(parsed.advice || {}),
        goals: [...DEFAULT_ADVICE.goals],
      },
    };
  } catch (e) {
    console.error("failed to load state", e);
    return defaults();
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("kintore:state-saved", { detail: { state } }));
  } catch (e) {
    console.error("failed to save state", e);
  }
}

export function resetAll() {
  state = defaults();
  save();
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text); // throws on invalid
  if (typeof parsed !== "object" || parsed === null) throw new Error("invalid data");
  state = {
    ...defaults(),
    ...parsed,
    targets: { ...DEFAULT_TARGETS, ...(parsed.targets || {}) },
    advice: {
      ...DEFAULT_ADVICE,
      ...(parsed.advice || {}),
      goals: [...DEFAULT_ADVICE.goals],
    },
  };
  save();
}

export function uid() {
  return "id-" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
