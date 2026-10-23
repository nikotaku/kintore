import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDaySummary, formatShareText, formatSet, shareUrls } from "../js/share.js";

const state = {
  exercises: [
    { id: "ex-bench", name: "ベンチプレス", part: "胸" },
    { id: "ex-plank", name: "プランク", part: "腹筋" },
  ],
  workouts: {
    "2026-10-23": [
      { exerciseId: "ex-bench", name: "旧名", sets: [{ w: 60, r: 10 }, { w: 70, r: 5 }, { w: 70, r: 6 }, { w: "", r: "" }] },
      { exerciseId: "ex-plank", sets: [{ w: "", r: 60 }] },
      { exerciseId: "ex-deleted", name: "削除された種目", sets: [{ w: 20, r: 12 }] },
      { exerciseId: "ex-empty", name: "未入力", sets: [{ w: "", r: "" }] },
    ],
  },
  runs: {
    "2026-10-23": [
      { id: "r1", distance: 3, durationSec: 1080, paceSec: 360 },
      { id: "r2", distance: 2.2, durationSec: 720, paceSec: 327 },
    ],
  },
};

test("day summary counts only sets with reps and picks the heaviest set", () => {
  const summary = buildDaySummary(state, "2026-10-23");
  assert.equal(summary.dateLabel, "2026/10/23 (金)");
  assert.deepEqual(summary.weight.map(ex => ex.name), ["ベンチプレス", "プランク", "削除された種目"]);
  assert.deepEqual(summary.weight[0].best, { w: 70, r: 6 });
  assert.equal(summary.weight[0].sets, 3);
  assert.deepEqual(summary.weightTotals, { exercises: 3, sets: 5, volume: 60 * 10 + 70 * 5 + 70 * 6 + 20 * 12 });
  assert.equal(summary.run.distance, 5.2);
  assert.equal(summary.run.durationSec, 1800);
  assert.ok(Math.abs(summary.run.paceSec - 1800 / 5.2) < 1e-9);
  assert.equal(summary.hasContent, true);
});

test("empty or placeholder-only days have nothing to share", () => {
  assert.equal(buildDaySummary(state, "2026-10-24").hasContent, false);
  const placeholderOnly = { exercises: [], workouts: { "2026-10-25": [{ exerciseId: "x", sets: [{ w: 50, r: "" }] }] }, runs: {} };
  assert.equal(buildDaySummary(placeholderOnly, "2026-10-25").hasContent, false);
});

test("share text lists totals, exercises, running and matching hashtags", () => {
  const text = formatShareText(buildDaySummary(state, "2026-10-23"));
  assert.match(text, /^2026\/10\/23 \(金\) のトレーニング記録/);
  assert.match(text, /🏋️ ウェイト 3種目・5セット・総負荷 1,610kg/);
  assert.match(text, /・ベンチプレス 70kg×6（3セット）/);
  assert.match(text, /・プランク 60回（1セット）/);
  assert.match(text, /🏃 ランニング 5\.2km・30:00（5:46\/km）/);
  assert.match(text, /#筋トレ #ランニング #筋トレMEMO$/);

  const runOnly = formatShareText(buildDaySummary({ ...state, workouts: {} }, "2026-10-23"));
  assert.doesNotMatch(runOnly, /ウェイト|#筋トレ /);
  assert.match(runOnly, /#ランニング #筋トレMEMO$/);
});

test("long workouts are summarised instead of listing every exercise", () => {
  const many = {
    exercises: [],
    workouts: { "2026-10-23": Array.from({ length: 7 }, (_, i) => ({ exerciseId: `e${i}`, name: `種目${i}`, sets: [{ w: 10, r: 10 }] })) },
    runs: {},
  };
  const text = formatShareText(buildDaySummary(many, "2026-10-23"));
  assert.match(text, /・種目4 /);
  assert.doesNotMatch(text, /・種目5 /);
  assert.match(text, /・ほか2種目/);
});

test("set and SNS URL formatting", () => {
  assert.equal(formatSet({ w: 62.5, r: 8 }), "62.5kg×8");
  assert.equal(formatSet({ w: 0, r: 15 }), "15回");
  const urls = shareUrls("今日 #筋トレ\n5km");
  assert.equal(urls.x, "https://x.com/intent/post?text=%E4%BB%8A%E6%97%A5%20%23%E7%AD%8B%E3%83%88%E3%83%AC%0A5km");
  assert.ok(urls.line.startsWith("https://line.me/R/share?text="));
});

test("share entry points exist on home, workout and running screens", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const id of ["btn-share-day", "btn-workout-share", "btn-run-share"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
