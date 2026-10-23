import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, css] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../css/style.css", import.meta.url), "utf8"),
]);

const homeHtml = html.slice(html.indexOf('id="view-home"'), html.indexOf("<!-- ============ ストレッチ ============ -->"));

test("home opens with a date field that is auto-filled with today", () => {
  assert.match(homeHtml, /<input type="date" id="home-date"/);
  assert.match(app, /selectedDate: todayKey\(\)/);
  assert.match(app, /\$\("#home-date"\)\.value = key;/);
  assert.match(app, /document\.addEventListener\("visibilitychange"/);
});

test("home entrance offers running, stretch and weight in that order", () => {
  const order = ["btn-entry-run", "btn-entry-stretch", "btn-entry-weight"].map(id => homeHtml.indexOf(`id="${id}"`));
  assert.ok(order.every(index => index > 0), "all three entrance buttons exist");
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(homeHtml.indexOf('id="home-date"') < order[0], "date comes before the menu buttons");
  assert.doesNotMatch(html, /id="btn-add-training"|id="btn-quick-run"/);
});

test("each entrance opens its own screen for the selected date", () => {
  assert.match(app, /btn-entry-run"\)\.addEventListener\("click", \(\) => \{\s*ui\.runDate = ui\.selectedDate;\s*showView\("running"\);/);
  assert.match(app, /btn-entry-stretch"\)\.addEventListener\("click", \(\) => showView\("stretch"\)\)/);
  assert.match(app, /btn-entry-weight"\)[\s\S]*?ui\.pickerDate = key;[\s\S]*?showView\("picker"\);/);
  assert.match(app, /stretch: renderStretch/);
});

test("stretch screen lists registered stretch videos stored on the device", () => {
  assert.match(html, /id="view-stretch"/);
  assert.match(html, /id="stretch-list"/);
  assert.match(html, /id="btn-add-stretch"/);
  assert.match(app, /const STRETCH_PART = "ストレッチ";/);
  assert.match(app, /getExerciseVideo\(stretch\.id\)/);
  assert.match(app, /<video class="form-video" src="\$\{url\}" controls playsinline/);
  assert.match(app, /if \(ui\.view === "stretch" && name !== "stretch"\) releaseStretchVideos\(\);/);
  assert.match(css, /\.stretch-card/);
});

test("copying the previous menu moved to the exercise picker", () => {
  const pickerHtml = html.slice(html.indexOf('id="view-picker"'));
  assert.match(pickerHtml, /id="btn-copy-workout"/);
  assert.match(app, /const key = ui\.pickerDate;\s*const sourceKey = previousWorkoutDate\(key\);/);
});
