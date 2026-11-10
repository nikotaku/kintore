import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STRETCH_GUIDE, STRETCH_GUIDE_NOTE } from "../js/stretch-guide.js";

const [html, app, css, serviceWorker] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  readFile(new URL("../sw.js", import.meta.url), "utf8"),
]);

const homeHtml = html.slice(html.indexOf('id="view-home"'), html.indexOf('id="view-stretch"'));

test("stretch is the first menu button, above running", () => {
  assert.ok(homeHtml.indexOf('id="btn-entry-stretch"') > 0);
  assert.ok(homeHtml.indexOf('id="btn-entry-stretch"') < homeHtml.indexOf('id="btn-entry-run"'));
  assert.match(homeHtml, /<strong>ストレッチ<\/strong>/);
  assert.match(app, /btn-entry-stretch"\)\.addEventListener\("click", \(\) => showView\("stretch"\)\)/);
});

test("three thoracic stretches carry name, hold time and cues", () => {
  assert.equal(STRETCH_GUIDE.length, 3);
  STRETCH_GUIDE.forEach((guide, index) => {
    assert.equal(guide.no, index + 1);
    assert.ok(guide.name.length > 3);
    assert.equal(guide.seconds, 30);
    assert.equal(guide.sides, "左右");
    assert.ok(guide.points.length >= 2);
    assert.match(guide.svg, /^<svg class="stretch-fig"/);
    assert.match(guide.svg, /role="img"/);
    assert.match(guide.svg, /aria-label="[^"]+"/);
  });
  assert.match(STRETCH_GUIDE[0].name, /胸椎/);
  assert.match(STRETCH_GUIDE_NOTE, /呼吸/);
});

test("figures animate with local CSS and respect reduced motion", () => {
  assert.match(css, /@keyframes stretchArm/);
  assert.match(css, /@keyframes stretchReach/);
  assert.match(css, /@keyframes stretchTwist/);
  assert.match(css, /@keyframes hintFlow/);
  assert.match(css, /\.stretch-fig \.fig-open-01 \{ transform-origin: 122px 62px/);
  assert.match(css, /animation: stretchArm 4\.6s ease-in-out infinite/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const svgOnly = STRETCH_GUIDE.map(guide => guide.svg).join("");
  assert.doesNotMatch(svgOnly, /<image|https?:\/\//);
  assert.match(serviceWorker, /"js\/stretch-guide\.js"/);
});

test("stretch screen renders the guide before registered videos", () => {
  const view = html.slice(html.indexOf('id="view-stretch"'), html.indexOf('id="view-groups"'));
  assert.ok(view.indexOf('id="stretch-guide-list"') < view.indexOf('id="stretch-list"'));
  assert.match(view, /THORACIC MOBILITY/);
  assert.match(app, /function renderStretchGuide\(\)/);
  assert.match(app, /if \(!list \|\| list\.dataset\.ready === "1"\) return;/);
  assert.match(app, /function renderStretch\(\) \{\s*renderStretchGuide\(\);/);
  assert.match(app, /guide\.points\.map\(point => `<li>/);
});

test("home entry copy reflects the guide plus registered videos", () => {
  assert.match(app, /胸椎ストレッチ3種・登録\$\{stretchCount\}件/);
  assert.match(app, /胸椎ストレッチ3種のアニメーション/);
});
