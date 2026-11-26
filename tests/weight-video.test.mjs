import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, css] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../css/style.css", import.meta.url), "utf8"),
]);

const picker = html.slice(html.indexOf('id="view-picker"'), html.indexOf("</section>", html.indexOf('id="view-picker"')));

test("each weight part's exercise screen switches between logging and form videos", () => {
  assert.match(picker, /id="picker-mode" role="tablist"[^>]*hidden/);
  assert.match(picker, /data-mode="log" aria-selected="true">記録する</);
  assert.match(picker, /data-mode="video" aria-selected="false">🎥 フォーム動画<small id="picker-video-count">/);
  assert.match(picker, /<input type="file" id="picker-video-file" accept="video\/\*" hidden>/);
  assert.ok(picker.indexOf('id="picker-mode"') < picker.indexOf('id="picker-groups"'), "tabs sit above the list");
  // 部位を開き直したら「記録する」から始める
  assert.match(app, /function openPickerForPart\(part\) \{\s*ui\.pickerPart = part;\s*ui\.pickerMode = "log";/);
  // タブは部位を選んだときだけ表示し、動画表示中は記録用のツールバーと Edit を隠す
  assert.match(app, /const videoMode = Boolean\(focusedPart\) && ui\.pickerMode === "video";/);
  assert.match(app, /bar\.hidden = !part;/);
  assert.match(app, /\$\("#picker-toolbar"\)\.hidden = videoMode;/);
  assert.match(app, /\$\("#btn-picker-edit"\)\.hidden = videoMode;/);
});

test("form video cards reuse the stretch video store and loader", () => {
  assert.match(app, /function renderPickerVideos\(part, wrap\)/);
  assert.match(app, /class="stretch-card weight-video-card" data-exercise-id="\$\{esc\(ex\.id\)\}"/);
  assert.match(app, /loadExerciseVideoInto\(ex, card, \(\) => token === pickerVideoToken && ui\.view === "picker", pickerVideoUrls\)/);
  assert.match(app, /await storeExerciseVideo\(id, file\);/);
  assert.match(app, /const error = videoFileError\(file\);/);
  assert.match(app, /data-act="log">この種目を記録</);
  assert.match(app, /addExerciseToDay\(ex\)/);
  assert.match(app, /async function removeExerciseVideo\(ex\)[\s\S]*?await deleteExerciseVideo\(ex\.id\)[\s\S]*?delete state\.exerciseVideos\[ex\.id\];[\s\S]*?save\(\{ source: "device-only", touch: false \}\);/);
});

test("videos are released when leaving or re-rendering the exercise screen", () => {
  assert.match(app, /if \(ui\.view === "picker" && name !== "picker"\) releasePickerVideos\(\);/);
  assert.match(app, /function renderPicker\(\) \{\s*releasePickerVideos\(\);/);
  assert.match(app, /function releasePickerVideos\(\) \{\s*pickerVideoToken \+= 1;\s*pickerVideoUrls\.forEach\(url => URL\.revokeObjectURL\(url\)\);/);
});

test("weight video cards use the red weight theme", () => {
  assert.match(css, /\.picker-mode-tab\[aria-selected="true"\]/);
  assert.match(css, /\.weight-video-card \.stretch-card-head \{ background: var\(--red\); \}/);
});
