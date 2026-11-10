// 腹筋トレーニング（高強度・全15種目）のメニュー定義と進行ステップ
// 種目名・狙う部位・フォームの要点をここにまとめ、画面側はデータだけを描画する。
export const CORE_TARGETS = ["腹直筋", "腹斜筋", "体幹"];

// 1種目の実施時間と休憩時間。15種目 × (40秒 + 20秒休憩) で約15分。
export const CORE_SESSION = { workSec: 40, restSec: 20 };

export const CORE_MENU = [
  {
    no: 1,
    id: "toe-touch",
    name: "トゥータッチ",
    targets: ["腹直筋"],
    pattern: "crunch",
    how: "仰向けで両脚を90度ほどに上げ、つま先へ向かって上体を起こす。",
    point: "反動を使わず、みぞおちを骨盤へ近づける意識で。",
  },
  {
    no: 2,
    id: "cross-reverse-crunch",
    name: "レッグクロス・リバースクランチ",
    targets: ["腹直筋"],
    pattern: "reverse",
    how: "片脚をもう片方の脚の上へ4の字に重ね、膝を90度ほどに曲げたまま骨盤を丸めて引き寄せる。",
    point: "頭を起こすのではなく、お尻を天井へ持ち上げる。",
  },
  {
    no: 3,
    id: "reverse-crunch",
    name: "リバースクランチ",
    targets: ["腹直筋"],
    pattern: "reverse",
    how: "膝を90度に曲げた状態から、膝を胸へ近づけるようにお腹を丸める。",
    point: "できるだけお腹を丸めることを意識する。",
  },
  {
    no: 4,
    id: "leg-raise",
    name: "レッグレイズ",
    targets: ["腹直筋"],
    pattern: "legraise",
    how: "両脚をそろえて伸ばし、床から90度ほどまで上げ下げする。",
    point: "腰が反りやすいので、手を腰の下へ置くと安心。",
  },
  {
    no: 5,
    id: "low-leg-raise",
    name: "ローレッグレイズ",
    targets: ["腹直筋"],
    pattern: "legraise",
    how: "両脚をそろえたまま、床から30度ほどまで上げ下げする。",
    point: "脚ではなく腹筋を縮めることを意識する。",
  },
  {
    no: 6,
    id: "crawling-plank",
    name: "クラウンピングプランク",
    targets: ["腹直筋", "体幹"],
    pattern: "plank",
    how: "肘を床につけたプランクの姿勢から、肘を片方ずつ伸ばす・つけるを繰り返す。",
    point: "頭から足まで一直線を保ち、一定のリズムで。",
  },
  {
    no: 7,
    id: "mountain-climber",
    name: "マウンテンクライマー",
    targets: ["腹直筋"],
    pattern: "plank",
    how: "四つ這いの姿勢から、足を交互に胸へ引き寄せる。",
    point: "腰を高く上げすぎず、膝をしっかり引き上げる。",
  },
  {
    no: 8,
    id: "knee-to-chest",
    name: "ニートゥチェスト",
    targets: ["腹直筋"],
    pattern: "tuck",
    how: "両脚をそろえて床から浮かせた状態から、膝を胸へ引き寄せる。",
    point: "足を伸ばすときに上体の重心を少し後ろへ置くとより効く。",
  },
  {
    no: 9,
    id: "knee-touch-crunch",
    name: "ニータッチクランチ",
    targets: ["腹直筋"],
    pattern: "crunch",
    how: "膝を曲げて持ち上げ、上体を起こして膝へタッチする。",
    point: "首を手で引っ張らず、みぞおちから丸める。",
  },
  {
    no: 10,
    id: "hip-raise",
    name: "ヒップレイズ",
    targets: ["腹直筋"],
    pattern: "reverse",
    how: "脚を上げた状態から、お尻を床から持ち上げるように丸める。",
    point: "腰を反らせず、お腹を丸めて持ち上げる。",
  },
  {
    no: 11,
    id: "star-twist-sit-up",
    name: "スターツイスト・シットアップ",
    targets: ["腹斜筋"],
    pattern: "twist",
    how: "手足を大きく開いて起き上がり、ひねりながら対角の手足を近づける。",
    point: "腕の勢いで起きず、脇腹を縮める。",
  },
  {
    no: 12,
    id: "leg-circle",
    name: "レッグサークル",
    targets: ["腹直筋", "腹斜筋"],
    pattern: "legraise",
    how: "脚を伸ばして浮かせたまま、円を描くようにゆっくり回す。",
    point: "腰が反らない高さで、小さめの円から始める。",
  },
  {
    no: 13,
    id: "leg-swing",
    name: "レッグスイング",
    targets: ["腹斜筋"],
    pattern: "legraise",
    how: "脚をそろえて浮かせ、左右へ振り子のように動かす。",
    point: "反動をつけず、脇腹で止める。",
  },
  {
    no: 14,
    id: "knee-to-elbow",
    name: "ニートゥーエルボー",
    targets: ["腹斜筋"],
    pattern: "plank",
    how: "四つ這いの姿勢から、膝と反対側の肘を近づける。",
    point: "骨盤を回し、脇腹を縮める。",
  },
  {
    no: 15,
    id: "bicycle-crunch",
    name: "バイシクルクランチ",
    targets: ["腹直筋", "腹斜筋"],
    pattern: "twist",
    how: "脚を交互に伸ばしながら、反対側の肘と膝を近づける。",
    point: "速さより、ひねりの深さを優先する。",
  },
];

// 種目カードのイラスト（外部画像を使わず、オフラインでも表示できる簡易ピクトグラム）
const FIGURE = '#33414a';
const MOTION = '#e07a00';
const FLOOR = '#c9cfd3';
const head = (cx, cy, r = 5) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${FIGURE}"/>`;
const floor = '<path d="M6 42h60" stroke="' + FLOOR + '" stroke-width="2" stroke-linecap="round"/>';
const arc = (d, dotX, dotY) =>
  `<path d="${d}" fill="none" stroke="${MOTION}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 4"/>`
  + `<circle cx="${dotX}" cy="${dotY}" r="2.6" fill="${MOTION}"/>`;
const body = d =>
  `<path d="${d}" fill="none" stroke="${FIGURE}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = inner =>
  `<svg viewBox="0 0 72 48" role="presentation" focusable="false">${inner}</svg>`;

export const CORE_PATTERNS = {
  // 上体を丸めて起こす
  crunch: svg(`${floor}
    ${body("M34 40 L26 28")}
    ${head(21, 23, 5.4)}
    ${body("M34 40 L47 29 L59 40")}
    ${body("M26 29 L41 22")}
    ${arc("M13 38 C8 27 12 16 22 13", 22, 13)}`),
  // 骨盤を丸めて膝を引き寄せる
  reverse: svg(`${floor}
    ${body("M13 38 L33 38")}
    ${head(9, 33, 4.6)}
    ${body("M33 38 L37 24 L50 24")}
    ${body("M50 24 L46 34")}
    ${arc("M27 33 C29 21 41 18 45 25", 45, 25)}`),
  // 脚を上げ下げする
  legraise: svg(`${floor}
    ${body("M14 38 L34 38")}
    ${head(10, 33, 4.6)}
    ${body("M34 38 L40 21 L47 10")}
    ${arc("M53 35 C60 25 57 14 49 10", 49, 10)}`),
  // 四つ這い・プランク
  plank: svg(`${floor}
    ${head(25, 21, 5)}
    ${body("M30 25 L52 28")}
    ${body("M28 27 L27 39 L37 39")}
    ${body("M52 28 L66 39")}
    ${body("M52 28 L45 36 L39 39")}
    ${arc("M56 18 C60 14 65 14 67 17", 67, 17)}`),
  // ひねり
  twist: svg(`${floor}
    ${head(36, 11, 4.8)}
    ${body("M36 16 L36 32")}
    ${body("M21 23 L51 23")}
    ${body("M22 44 L36 32 L52 42")}
    ${arc("M22 29 C24 40 46 42 51 31", 51, 31)}`),
  // 膝を胸へ引き寄せる（V字）
  tuck: svg(`${floor}
    ${head(20, 24, 5)}
    ${body("M25 27 L35 38")}
    ${body("M35 38 L45 27 L40 19")}
    ${body("M27 29 L42 28")}
    ${arc("M12 38 C10 28 15 20 23 18", 23, 18)}`),
};

const TARGET_FILTER_LABEL = { ALL: "すべて" };

export function coreMenuForTarget(target = "ALL") {
  return target === "ALL"
    ? CORE_MENU
    : CORE_MENU.filter(exercise => exercise.targets.includes(target));
}

export function coreTargetLabel(target) {
  return TARGET_FILTER_LABEL[target] || target;
}

export function coreTargetsLabel(exercise) {
  return exercise.targets.join("・");
}

// 実施 → 休憩 を1種目ずつ並べた進行表（15種目 × 60秒 = 15分）
export function coreSessionSteps() {
  const steps = [];
  CORE_MENU.forEach((exercise, index) => {
    steps.push({ kind: "work", index, seconds: CORE_SESSION.workSec });
    // 最後の20秒はクールダウンを兼ねた休憩。合計がちょうど15分になる
    steps.push({ kind: "rest", index, seconds: CORE_SESSION.restSec });
  });
  return steps;
}

export function coreSessionTotalSec() {
  return coreSessionSteps().reduce((sum, step) => sum + step.seconds, 0);
}

// 900秒 → "15:00"
export function coreClock(totalSeconds) {
  const sec = Math.max(0, Math.round(Number(totalSeconds) || 0));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export const CORE_GUIDE = {
  title: "腹筋トレーニング",
  kicker: "高強度 Level Max",
  level: "上級者向け",
  lead: "腹筋全体を狙う全15種目。1種目ずつフォームを確かめながら、約15分で一周します。",
  cautions: [
    "上級者向けの強度です。回数を重ねるより、フォームの正確さを優先してください。",
    "腰に痛みや違和感が出たら中止します。腰痛の既往・妊娠中・医師から運動制限を受けている場合は、開始前に医療専門職へ相談してください。",
    "首を手で引っ張らず、反動や勢いを使わずに動きます。",
    "食後すぐの実施は避け、床にはマットやタオルを敷くと安心です。",
  ],
};
