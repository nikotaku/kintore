import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildAIContext, formatAIContext } from "../js/ai-context.js";

const state = {
  exercises: [{ id: "bench", name: "ベンチプレス", part: "胸" }],
  workouts: {
    "2026-11-01": [{ exerciseId: "bench", sets: [{ w: 60, r: 10 }, { w: 70, r: 5 }, { w: "", r: "" }] }],
    "2026-01-01": [{ exerciseId: "bench", sets: [{ w: 40, r: 10 }] }],
  },
  runs: { "2026-11-02": [{ distance: 5.2, durationSec: 1800 }] },
  meals: { "2026-11-02": { breakfast: [{ name: "卵" }] } },
  body: { "2026-11-02": { weight: 69, fat: 12 } },
  targets: { kcal: 2400, p: 140, f: 60, c: 300 },
  advice: { weaknesses: "背中を強くしたい", accountEmail: "private@example.com" },
  exerciseVideos: { bench: { name: "private.mov" } },
};

test("AI context filters the period and calculates compact totals", () => {
  const result = buildAIContext(state, { days: 180, now: new Date("2026-11-02T12:00:00Z") });
  assert.equal(result.format, "kintore-ai-context-v1");
  assert.deepEqual(Object.keys(result.workouts), ["2026-11-01"]);
  assert.equal(result.summary.workoutDays, 1);
  assert.equal(result.summary.sets, 2);
  assert.equal(result.summary.reps, 15);
  assert.equal(result.summary.totalVolumeKg, 950);
  assert.equal(result.summary.runDistanceKm, 5.2);
  assert.equal(result.profile.weaknesses, "背中を強くしたい");
});

test("AI context excludes credentials and video metadata", () => {
  const text = formatAIContext(state, { now: new Date("2026-11-02T12:00:00Z") });
  assert.doesNotMatch(text, /private@example\.com/);
  assert.doesNotMatch(text, /private\.mov/);
  assert.match(text, /ベンチプレス/);
});

test("early morning exports include today's local records", () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  try {
    const result = buildAIContext(state, { days: 1, now: new Date("2026-11-02T07:00:00+09:00") });
    assert.equal(result.period.to, "2026-11-02");
    assert.equal(result.period.from, "2026-11-02");
    assert.equal(result.summary.runDistanceKm, 5.2);
    assert.equal(result.body["2026-11-02"].weight, 69);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test("AI database view keeps the snapshot RLS and read-only grants", async () => {
  const view = await readFile(new URL("../supabase/migrations/20261102000000_kintore_ai_context.sql", import.meta.url), "utf8");
  const grants = await readFile(new URL("../supabase/migrations/20261102000100_kintore_ai_context_read_only.sql", import.meta.url), "utf8");
  assert.match(view, /security_invoker\s*=\s*true/i);
  assert.doesNotMatch(view, /accountEmail|exerciseVideos/);
  assert.match(grants, /revoke all[\s\S]+authenticated[\s\S]+service_role/i);
  assert.match(grants, /grant select[\s\S]+authenticated[\s\S]+service_role/i);
});
