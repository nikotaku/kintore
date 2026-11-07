import { addDays, dkey } from "./util.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(`${key}T00:00:00Z`));
}

function filterDateMap(value, from, to) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => validDateKey(key) && key >= from && key <= to)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, clone(entry)]));
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function buildAIContext(state, { days = 180, now = new Date() } = {}) {
  const safeDays = Math.min(730, Math.max(1, Math.trunc(Number(days) || 180)));
  const to = dkey(now);
  const from = addDays(to, -(safeDays - 1));
  const workouts = filterDateMap(state?.workouts, from, to);
  const runs = filterDateMap(state?.runs, from, to);
  const meals = filterDateMap(state?.meals, from, to);
  const body = filterDateMap(state?.body, from, to);

  let workoutCount = 0;
  let setCount = 0;
  let repCount = 0;
  let totalVolumeKg = 0;
  for (const entries of Object.values(workouts)) {
    if (!Array.isArray(entries)) continue;
    workoutCount += entries.length;
    for (const exercise of entries) {
      for (const set of Array.isArray(exercise?.sets) ? exercise.sets : []) {
        const reps = finite(set?.r);
        if (reps <= 0) continue;
        setCount += 1;
        repCount += reps;
        totalVolumeKg += finite(set?.w) * reps;
      }
    }
  }

  let runCount = 0;
  let runDistanceKm = 0;
  let runDurationSec = 0;
  for (const entries of Object.values(runs)) {
    if (!Array.isArray(entries)) continue;
    runCount += entries.length;
    for (const run of entries) {
      runDistanceKm += finite(run?.distance);
      runDurationSec += finite(run?.durationSec);
    }
  }

  return {
    format: "kintore-ai-context-v1",
    generatedAt: now.toISOString(),
    period: { from, to, days: safeDays },
    summary: {
      workoutDays: Object.keys(workouts).length,
      exercises: workoutCount,
      sets: setCount,
      reps: repCount,
      totalVolumeKg: Math.round(totalVolumeKg * 100) / 100,
      runDays: Object.keys(runs).length,
      runs: runCount,
      runDistanceKm: Math.round(runDistanceKm * 100) / 100,
      runDurationSec: Math.round(runDurationSec),
      mealDays: Object.keys(meals).length,
      bodyDays: Object.keys(body).length,
    },
    profile: {
      targets: clone(state?.targets || {}),
      weaknesses: String(state?.advice?.weaknesses || ""),
    },
    exercises: Array.isArray(state?.exercises) ? clone(state.exercises) : [],
    workouts,
    runs,
    kickboxing: Object.fromEntries(Object.entries(filterDateMap(state?.kickboxing, from, to))
      .filter(([, entries]) => Array.isArray(entries))
      .map(([date, entries]) => [date, entries.map(entry => ({
        practice: String(entry?.practice || ""),
        feedback: String(entry?.feedback || ""),
      }))])),
    meals,
    body,
  };
}

export function formatAIContext(state, options) {
  return JSON.stringify(buildAIContext(state, options), null, 2);
}
