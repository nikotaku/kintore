import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, app, css, serviceWorker] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  readFile(new URL("../sw.js", import.meta.url), "utf8"),
]);

test("running screen links to a complete learning guide", () => {
  assert.match(html, /id="btn-running-guide"/);
  assert.match(html, /id="view-running-guide"/);
  assert.match(html, /id="running-form-basics"/);
  assert.match(html, /id="running-warmup"/);
  assert.match(html, /id="running-safety"/);
  assert.match(html, /正しいフォーム・走る前の準備/);
  assert.match(html, /走る前の8〜10分/);
});

test("guide open and back controls are wired without adding another bottom tab", () => {
  assert.match(app, /btn-running-guide"\)\.addEventListener\("click", \(\) => showViewAndFocus\("running-guide", "#running-guide-title"\)\)/);
  assert.match(app, /btn-running-guide-back"\)\.addEventListener\("click", \(\) => showViewAndFocus\("running", "#btn-running-guide"\)\)/);
  assert.match(app, /btn-running-guide-done"\)\.addEventListener\("click", \(\) => showViewAndFocus\("running", "#btn-running-guide"\)\)/);
  assert.match(app, /name === "running-guide" \? "running" : name/);
  assert.match(html, /id="running-guide-title" tabindex="-1"/);
  assert.equal((html.match(/class="nav-item/g) || []).length, 5);
});

test("guide has local offline-friendly visuals and accessible references", () => {
  assert.match(html, /<svg[^>]+role="img"/);
  assert.doesNotMatch(html, /<img[^>]+src="https?:\/\//);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(css, /\.running-form-figure/);
  assert.match(css, /\.running-warmup-flow/);
});

test("service worker cache is bumped for the new HTML, CSS and behavior", () => {
  assert.match(serviceWorker, /kintore-memo-v6/);
  for (const asset of ["index.html", "css/style.css", "js/app.js"]) {
    assert.ok(serviceWorker.includes(`"${asset}"`), `${asset} should be precached`);
  }
});
