import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, css] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../css/style.css", import.meta.url), "utf8"),
]);

const homeHtml = html.slice(html.indexOf('id="view-home"'), html.indexOf('id="view-parts"'));
const historyHtml = html.slice(html.indexOf('id="view-history"'), html.indexOf('id="view-picker"'));

test("ウェイトは部位の分岐画面から始まる", () => {
  assert.match(html, /id="view-parts"/);
  assert.match(html, /id="parts-list"/);
  assert.match(html, /id="parts-day"/);
  assert.match(html, /id="btn-parts-back"/);
  assert.match(html, /id="btn-parts-add"/);
  assert.match(app, /function renderParts\(\)/);
  assert.match(app, /parts: renderParts/);
  assert.match(app, /state\.parts\.forEach\(\(part, index\) => \{/);
  assert.match(app, /card\.addEventListener\("click", \(\) => openPickerForPart\(part\)\);/);
  assert.match(app, /function openPickerForPart\(part\) \{[\s\S]*?ui\.pickerPart = part;[\s\S]*?showView\("picker"\);/);
  assert.match(app, /const PART_HUES = \[/);
  assert.match(css, /\.part-card \{/);
  assert.match(css, /\.part-mark \{/);
});

test("種目一覧は選んだ部位だけを表示し、部位を変えられる", () => {
  assert.match(app, /const focusedPart = ui\.pickerPart;/);
  assert.match(app, /for \(const part of \(focusedPart \? \[focusedPart\] : state\.parts\)\) \{/);
  assert.match(app, /#picker-date-label"\)\.textContent = focusedPart \? `\$\{focusedPart\}の種目`/);
  assert.match(html, /id="picker-context"/);
  assert.match(html, /id="btn-picker-parts"/);
  assert.match(app, /btn-picker-parts"\)\.addEventListener\("click", \(\) => \{ ui\.pickerPart = null; showView\("parts"\); \}\)/);
  assert.match(app, /btn-picker-back"\)\.addEventListener\("click", \(\) => showView\(ui\.pickerPart \? "parts" : ui\.pickerFrom\)\)/);
});

test("腹筋メニューはウェイト > 腹筋から開き、戻ると種目一覧に帰る", () => {
  assert.match(app, /if \(focusedPart === CORE_PART\) wrap\.appendChild\(coreMenuEntry\(\)\);/);
  assert.match(app, /function coreMenuEntry\(\)/);
  assert.match(app, /ui\.coreFrom = "picker"; showViewAndFocus\("core", "#core-title"\)/);
  assert.match(app, /btn-core-back"\)\.addEventListener\("click", \(\) => showViewAndFocus\(ui\.coreFrom === "picker" \? "picker" : "home"/);
  assert.match(app, /part === CORE_PART \? '<span class="part-badge">15分メニュー<\/span>'/);
  assert.match(css, /\.core-entry \{/);
});

test("ホームからはカレンダー・負荷量を外し、履歴タブに移した", () => {
  assert.doesNotMatch(homeHtml, /id="home-calendar"/);
  assert.doesNotMatch(homeHtml, /id="stat-vol-7d"/);
  assert.match(historyHtml, /id="history-calendar"/);
  assert.match(historyHtml, /id="stat-vol-7d"/);
  assert.match(historyHtml, /id="week-bars"/);
  assert.match(historyHtml, /id="month-days"/);
  assert.match(app, /function renderHistoryVolume\(markers\)/);
  assert.match(app, /rangeVolume\(addDays\(today, -6\), today, part\)/);
  assert.match(app, /rangeVolume\(fromKey, toKey, part = "ALL"\)/);
  assert.match(app, /totalVolume\(part = "ALL"\)/);
  assert.doesNotMatch(app, /homeMonth/);
});
