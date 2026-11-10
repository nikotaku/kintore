import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CORE_MENU,
  CORE_SESSION,
  CORE_TARGETS,
  CORE_PATTERNS,
  coreClock,
  coreMenuForTarget,
  coreSessionSteps,
  coreSessionTotalSec,
} from "../js/core-menu.js";

const [html, app, css, serviceWorker] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  readFile(new URL("../sw.js", import.meta.url), "utf8"),
]);

test("core menu lists all 15 numbered exercises with targets and cues", () => {
  assert.equal(CORE_MENU.length, 15);
  CORE_MENU.forEach((exercise, index) => {
    assert.equal(exercise.no, index + 1);
    assert.ok(exercise.name.length > 2);
    assert.ok(exercise.targets.length >= 1);
    exercise.targets.forEach(target => assert.ok(CORE_TARGETS.includes(target), `${target} is a known target`));
    assert.ok(exercise.how.length > 10);
    assert.ok(exercise.point.length > 5);
    assert.ok(CORE_PATTERNS[exercise.pattern], "each exercise has a pictogram");
  });
  assert.match(CORE_MENU[0].name, /トゥータッチ/);
  assert.match(CORE_MENU[14].name, /バイシクルクランチ/);
});

test("filtering keeps the order and narrows by target", () => {
  assert.equal(coreMenuForTarget("ALL").length, 15);
  const oblique = coreMenuForTarget("腹斜筋");
  assert.equal(oblique.length, 5);
  assert.deepEqual(oblique.map(exercise => exercise.name), [
    "スターツイスト・シットアップ",
    "レッグサークル",
    "レッグスイング",
    "ニートゥーエルボー",
    "バイシクルクランチ",
  ]);
});

test("the guided session is 40s work / 20s rest and totals 15 minutes", () => {
  assert.deepEqual(CORE_SESSION, { workSec: 40, restSec: 20 });
  const steps = coreSessionSteps();
  assert.equal(steps.length, 30);
  assert.equal(steps[0].kind, "work");
  assert.equal(steps[1].kind, "rest");
  assert.equal(steps.at(-1).kind, "rest");
  assert.equal(coreSessionTotalSec(), 900);
  assert.equal(coreClock(coreSessionTotalSec()), "15:00");
  assert.equal(coreClock(65), "01:05");
});

test("home menu and core screen are wired", () => {
  // 腹筋メニューは「ウェイト > 部位（腹筋）」の中に入っている
  assert.doesNotMatch(html, /id="btn-entry-core"/);
  assert.match(app, /const CORE_PART = "腹筋";/);
  assert.match(app, /if \(focusedPart === CORE_PART\) wrap\.appendChild\(coreMenuEntry\(\)\);/);
  assert.match(app, /<strong>腹筋トレーニング<\/strong>/);
  assert.match(html, /id="view-core"/);
  assert.match(html, /id="core-list"/);
  assert.match(html, /id="btn-core-start"/);
  assert.match(html, /id="core-session"/);
  assert.match(html, /id="core-filters"/);
  assert.match(html, /id="core-cautions"/);
  assert.match(app, /entry\.addEventListener\("click", \(\) => \{ ui\.coreFrom = "picker"; showViewAndFocus\("core", "#core-title"\); \}\)/);
  assert.match(app, /ui\.coreFrom === "picker" \? "picker" : "home"/);
  assert.match(app, /if \(ui\.view === "core" && name !== "core"\) stopCoreSession\(\{ silent: true \}\);/);
  assert.match(app, /core: renderCore/);
  assert.match(app, /name === "core" \|\| name === "parts" \? "home" : name/);
});

test("the session timer advances, pauses and stops", () => {
  assert.match(app, /let coreSession = null;/);
  assert.match(app, /setInterval\(coreSessionTick, 250\)/);
  assert.match(app, /function toggleCoreSession\(\)/);
  assert.match(app, /function nextCoreExercise\(\)/);
  assert.match(app, /function finishCoreSession\(\)/);
  assert.match(app, /15種目 完了！/);
  assert.match(app, /clearInterval\(coreSession\.timerId\)/);
});

test("core styles and offline cache ship the new module", () => {
  assert.match(css, /\.core-card \{/);
  assert.match(css, /\.core-session-timer b/);
  assert.match(css, /\.core-filter\[aria-pressed="true"\]/);
  assert.match(serviceWorker, /"js\/core-menu\.js"/);
  assert.doesNotMatch(Object.values(CORE_PATTERNS).join(""), /<image|https?:\/\//);
});
