// ストレッチのアニメーション付きガイド（胸椎・肩）の定義
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

// 肩周辺のストレッチ（筋トレTV「肩周辺のストレッチ／ストレッチ講座－筋トレ前後－」の動きと回数を参考に再構成）
export const SHOULDER_GUIDE = [
  {
    no: 1,
    id: "shoulder-cross-body",
    name: "腕を胸に引き寄せる肩のストレッチ",
    purpose: "肩の後ろ / 肩甲骨まわり",
    dose: "20〜30秒 × 左右",
    how: "あぐらで座り、片腕を胸の前で反対側へまっすぐ伸ばす。もう一方の腕で肘のあたりを抱え、胸へ引き寄せる。",
    points: ["肩をすくめず、首はまっすぐ", "息を吐きながらじわっと引き寄せる"],
    svg: figure("あぐらで座り、片腕を胸の前で引き寄せるストレッチの動き", `
      ${limb("M120 110 L92 118 L120 128")}
      ${limb("M120 110 L148 118 L120 128")}
      ${limb("M120 110 L120 70")}
      ${limb("M104 72 L136 72")}
      ${head(120, 54)}
      <g class="fig-move fig-pull-01">
        ${limb("M104 72 L160 80")}
        ${limb("M136 72 L142 96 L122 82")}
      </g>
      ${hint("M168 66 C178 66 186 72 188 82")}`),
  },
  {
    no: 2,
    id: "shoulder-arm-twist",
    name: "両腕を横に伸ばして腕ねじり",
    purpose: "肩関節の回旋 / 肩のインナーマッスル",
    dose: "10回 × 2セット",
    how: "立って両腕を肩の高さで真横に伸ばす。腕を一直線に保ったまま、肩の付け根から腕全体を前・後ろへねじる。",
    points: ["首と体の軸は動かさない", "肘を曲げず、手首だけでごまかさない"],
    svg: figure("両腕を真横に伸ばし、腕全体を前後にねじる動き", `
      ${limb("M120 96 L110 132")}
      ${limb("M120 96 L130 132")}
      ${limb("M120 96 L120 60")}
      ${head(120, 44)}
      ${limb("M120 62 L62 62")}
      ${limb("M120 62 L178 62")}
      <g class="fig-move fig-twist-l"><path d="M64 62 C60 72 52 72 48 62 Z" fill="currentColor"/></g>
      <g class="fig-move fig-twist-r"><path d="M176 62 C180 72 188 72 192 62 Z" fill="currentColor"/></g>
      ${hint("M92 50 C100 50 102 74 92 74")}
      ${hint("M148 50 C140 50 138 74 148 74")}`),
  },
  {
    no: 3,
    id: "shoulder-roll",
    name: "肩回し（前・後ろ）",
    purpose: "首の付け根 / 肩甲骨まわり",
    dose: "前後10回ずつ × 2セット",
    how: "立って腕の力を抜き、肩を大きく回す。前回しを10回、後ろ回しを10回行う。",
    points: ["腕はだらんと下ろしたまま", "肩甲骨から大きな円を描くように"],
    svg: figure("腕の力を抜いて、肩を前後に大きく回す動き", `
      ${limb("M120 96 L110 132")}
      ${limb("M120 96 L130 132")}
      ${limb("M120 96 L120 62")}
      ${head(120, 44)}
      <g class="fig-move fig-roll">
        ${limb("M104 64 L136 64")}
        ${limb("M104 64 L98 92 L100 116")}
        ${limb("M136 64 L142 92 L140 116")}
      </g>
      ${hint("M83 52 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0")}
      ${hint("M143 52 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0")}`),
  },
];

// ストレッチ画面の分岐（部位ごとのガイド）
export const STRETCH_AREAS = [
  {
    id: "thoracic",
    label: "胸椎",
    kicker: "THORACIC MOBILITY",
    title: "胸椎ストレッチ",
    lead: "動きが見えるアニメーションで、フォームを確認しながら30秒ずつ。椅座位や膝立ちで、どこでもできます。",
    note: STRETCH_GUIDE_NOTE,
    guides: STRETCH_GUIDE,
  },
  {
    id: "shoulder",
    label: "肩",
    kicker: "SHOULDER CARE",
    title: "肩周辺のストレッチ",
    lead: "筋トレの前は軽めに、筋トレの後は入念に。座って伸ばすストレッチと、立って動かすストレッチを組み合わせます。",
    note: "痛みのない範囲で。座って伸ばすものは反動をつけずに20〜30秒、立って動かすものは大きくゆっくり回数を目安に行います。",
    guides: SHOULDER_GUIDE,
  },
];

export function stretchArea(id) {
  return STRETCH_AREAS.find(area => area.id === id) || STRETCH_AREAS[0];
}

export function guideDose(guide) {
  return guide.dose || `${guide.seconds}秒 × ${guide.sides}`;
}
