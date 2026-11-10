// 胸椎ストレッチ（アニメーション付きガイド）の定義
// 参考にした動きを、外部画像・動画なしで動きが伝わるようにSVGで再構成している。
// 各SVGのアニメーションは css/style.css の .stretch-fig 系クラスで制御する。

const GROUND = '<path class="fig-ground" d="M10 132h220"/>';

const head = (cx, cy, r = 10) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>`;
const limb = d =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const hint = d => `<path class="fig-hint" d="${d}"/>`;

const figure = (label, inner) =>
  `<svg class="stretch-fig" viewBox="0 0 240 150" role="img" aria-label="${label}">${GROUND}${inner}</svg>`;

export const STRETCH_GUIDE = [
  {
    no: 1,
    id: "thoracic-kneeling",
    name: "片膝立ち胸椎ストレッチ",
    purpose: "胸を開く / 肩甲骨まわり",
    seconds: 30,
    sides: "左右",
    how: "片膝立ちになり、反対側の足の前に手をつく。反対の腕を斜め上へ大きく伸ばし、胸を開きながら天井を見る。",
    points: ["胸を開きながら視線を上げる", "手は反対側の足の前に置く"],
    svg: figure("片膝立ちで腕を上げ、胸を開くストレッチの動き", `
      ${limb("M118 98 L96 118 L76 132")}
      ${limb("M118 98 L154 104 L166 132")}
      ${limb("M118 98 L122 62")}
      ${limb("M122 62 L146 92 L172 132")}
      ${head(127, 46)}
      <g class="fig-open fig-open-01">
        ${limb("M122 62 L148 48 L170 22")}
      </g>
      ${hint("M184 38 C194 30 194 18 184 10")}`),
  },
  {
    no: 2,
    id: "thoracic-seated-reach",
    name: "座位わき下リーチ",
    purpose: "脇の下 / 肩甲骨の間",
    seconds: 30,
    sides: "左右",
    how: "あぐらで座り、片腕を反対の膝の下へ通して遠くへ伸ばす。肩を床へ近づけるように上体を倒す。",
    points: ["脇の下から手を遠くへ伸ばす", "肩を床に近づけるように"],
    svg: figure("あぐらで腕を反対側へ伸ばし、肩を床へ近づけるストレッチの動き", `
      ${limb("M128 112 L104 120 L128 130")}
      ${limb("M128 112 L152 120 L132 130")}
      ${limb("M128 112 L102 84")}
      ${head(90, 74)}
      ${limb("M102 84 L130 96")}
      <g class="fig-open fig-open-02">
        ${limb("M102 84 L74 104 L38 124")}
      </g>
      ${hint("M62 104 C48 110 38 118 28 128")}`),
  },
  {
    no: 3,
    id: "thoracic-side-twist",
    name: "側座位ツイスト",
    purpose: "胸椎の回旋 / 体側",
    seconds: 30,
    sides: "左右",
    how: "横向きに座り、頭の後ろへ手を添える。視線を上げながら胸を開き、上側の肘を後ろへ回す。",
    points: ["視線は上げたまま胸を開く", "脚と腰は動かさない"],
    svg: figure("横向きに座り、肘を後ろへ回して胸を開くストレッチの動き", `
      ${limb("M118 112 L140 120 L156 132")}
      ${limb("M118 112 L132 130 L150 134")}
      ${limb("M100 80 L74 100 L58 128")}
      <g class="fig-open fig-open-03">
        ${limb("M118 112 L100 80")}
        ${head(92, 66)}
        ${limb("M100 80 L126 72 L104 58")}
      </g>
      ${hint("M140 46 C154 40 166 46 170 58")}`),
  },
];

export const STRETCH_GUIDE_NOTE =
  "呼吸を止めず、痛みのない範囲で。反動をつけずに、息を吐きながら30秒ほどキープします。";
