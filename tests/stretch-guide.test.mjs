import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STRETCH_GUIDE, STRETCH_GUIDE_NOTE, SHOULDER_GUIDE, MOBILITY_GUIDE, STRETCH_AREAS, stretchArea, guideDose } from "../js/stretch-guide.js";

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
  assert.match(app, /if \(list\.dataset\.area === area\.id\) return;/);
  assert.match(app, /function renderStretch\(\) \{\s*renderStretchGuide\(\);/);
  assert.match(app, /guide\.points\.map\(point => `<li>/);
});

test("home entry copy reflects every guide area plus registered videos", () => {
  assert.match(app, /STRETCH_AREAS\.map\(area => area\.label\)\.join\("・"\)/);
  assert.match(app, /`\$\{guideLabel\}・登録\$\{stretchCount\}件`/);
  assert.match(app, /`\$\{guideLabel\}のアニメーション`/);
});

test("stretch screen branches into thoracic and shoulder guides", () => {
  assert.deepEqual(STRETCH_AREAS.map(area => [area.id, area.label]), [["thoracic", "胸椎"], ["shoulder", "肩"], ["mobility", "全身"]]);
  assert.equal(STRETCH_AREAS[0].guides, STRETCH_GUIDE);
  assert.equal(STRETCH_AREAS[0].note, STRETCH_GUIDE_NOTE);
  for (const area of STRETCH_AREAS) {
    assert.ok(area.kicker && area.title && area.lead && area.note, `${area.id} has header copy`);
  }
  assert.equal(stretchArea("shoulder").label, "肩");
  assert.equal(stretchArea("unknown").id, "thoracic", "unknown ids fall back to the first area");
  assert.equal(stretchArea(null).id, "thoracic");

  const view = html.slice(html.indexOf('id="view-stretch"'), html.indexOf('id="view-groups"'));
  assert.ok(view.indexOf('id="stretch-area-tabs"') < view.indexOf('id="stretch-guide-list"'), "tabs sit above the guide");
  assert.match(view, /role="tablist"/);
  assert.match(app, /role="tab"[\s\S]*?aria-selected="\$\{item\.id === area\.id\}"/);
  assert.match(app, /const STRETCH_AREA_KEY = "kintore-stretch-area-v1";[\s\S]*const ui = \{/, "storage key is defined before ui reads it");
});

test("shoulder guide follows the video's three moves with its reps and hold times", () => {
  assert.deepEqual(SHOULDER_GUIDE.map(guide => guide.no), [1, 2, 3]);
  assert.match(SHOULDER_GUIDE[0].name, /胸に引き寄せる/);
  assert.match(SHOULDER_GUIDE[1].name, /腕ねじり/);
  assert.match(SHOULDER_GUIDE[2].name, /肩回し/);
  assert.deepEqual(SHOULDER_GUIDE.map(guideDose), ["20〜30秒 × 左右", "10回 × 2セット", "前後10回ずつ × 2セット"]);
  assert.equal(guideDose(STRETCH_GUIDE[0]), "30秒 × 左右", "thoracic guides keep their hold time");
  SHOULDER_GUIDE.forEach(guide => {
    assert.ok(guide.points.length >= 2);
    assert.match(guide.svg, /^<svg class="stretch-fig"/);
    assert.match(guide.svg, /role="img"/);
    assert.match(guide.svg, /aria-label="[^"]+"/);
    assert.match(guide.svg, /class="fig-move /, `${guide.id} has a moving part`);
    assert.doesNotMatch(guide.svg, /<image|https?:\/\//);
  });
  assert.match(css, /@keyframes shoulderPull/);
  assert.match(css, /@keyframes armTwist/);
  assert.match(css, /@keyframes shoulderRoll/);
  assert.match(css, /\.stretch-fig \.fig-move \{ transform-box: view-box; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*\.stretch-fig \.fig-move,/);
});

test("mobility tab redraws the referenced routine and credits the original post", () => {
  const area = stretchArea("mobility");
  assert.equal(area.guides, MOBILITY_GUIDE);
  assert.deepEqual(MOBILITY_GUIDE.map(guide => guide.no), [1, 2, 3, 4, 5]);
  assert.deepEqual(MOBILITY_GUIDE.map(guide => guide.id), [
    "mobility-90-90", "mobility-squat-reach", "mobility-half-kneel-rock", "mobility-cossack", "mobility-inchworm-cobra",
  ]);
  // 元の動画に回数の指定はないので、目安であることを明記する
  MOBILITY_GUIDE.forEach(guide => assert.match(guideDose(guide), /目安/));
  assert.match(area.note, /回数は目安/);
  assert.equal(area.source.url, "https://x.com/MuscleB1ueprint/status/2123046405832909155");
  assert.match(area.source.label, /Muscle Blueprint/);
  // 動画や画像は使わず、SVGの姿勢を切り替えて動きを見せる
  MOBILITY_GUIDE.forEach(guide => {
    assert.ok(guide.points.length >= 2);
    assert.match(guide.svg, /^<svg class="stretch-fig"/);
    assert.match(guide.svg, /role="img"/);
    assert.match(guide.svg, /class="fig-(move|pose) /, `${guide.id} animates`);
    assert.doesNotMatch(guide.svg, /<image|<video|https?:\/\/|twimg/);
  });
  for (const guide of MOBILITY_GUIDE.filter(g => /fig-pose-a/.test(g.svg))) {
    assert.match(guide.svg, /fig-pose-b/, `${guide.id} has both poses`);
  }
  assert.match(css, /@keyframes poseSwap/);
  assert.match(css, /@keyframes reachUp/);
  assert.match(css, /\.stretch-fig \.fig-pose-b \{ animation-delay: -2\.4s; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[\s\S]*?\.stretch-fig \.fig-pose,[\s\S]*?\.stretch-fig \.fig-pose-b \{ opacity: 0; \}/);

  const view = html.slice(html.indexOf('id="view-stretch"'), html.indexOf('id="view-groups"'));
  assert.match(view, /<a class="stretch-guide-source" id="stretch-guide-source" target="_blank" rel="noopener noreferrer" hidden><\/a>/);
  assert.match(app, /source\.hidden = !area\.source;/);
});
