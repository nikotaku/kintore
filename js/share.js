// SNSシェア用の日別サマリ・投稿テキスト・画像（すべて端末内で作成し、どこにも送信しない）
const WEEKDAYS = "日月火水木金土";
const FONT = '-apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif';
const MAX_TEXT_EXERCISES = 5;
const MAX_CARD_EXERCISES = 6;

export const SHARE_CARD_SIZE = { width: 1080, height: 1350 };

function dateLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  const w = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")} (${w})`;
}

function num(value) {
  return Number(value) || 0;
}

export function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.round(num(totalSeconds)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatPace(paceSeconds) {
  const sec = Math.max(0, Math.round(num(paceSeconds)));
  return sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "—";
}

export function formatNumber(value, digits = 0) {
  return num(value).toLocaleString("ja-JP", { maximumFractionDigits: digits });
}

export function formatSet(set) {
  return set.w > 0 ? `${formatNumber(set.w, 2)}kg×${set.r}` : `${set.r}回`;
}

// 回数が入ったセットだけを「実施したセット」として数える（追加直後の空セットは除外）
export function buildDaySummary(state, key) {
  const exercises = state.exercises || [];
  const weight = (state.workouts?.[key] || [])
    .map(entry => {
      const sets = (entry.sets || [])
        .map(s => ({ w: num(s.w), r: num(s.r) }))
        .filter(s => s.r > 0);
      if (!sets.length) return null;
      const best = sets.reduce((a, b) => (b.w > a.w || (b.w === a.w && b.r > a.r) ? b : a));
      return {
        name: exercises.find(ex => ex.id === entry.exerciseId)?.name || entry.name || "種目",
        sets: sets.length,
        volume: sets.reduce((sum, s) => sum + s.w * s.r, 0),
        best,
      };
    })
    .filter(Boolean);

  const runs = (state.runs?.[key] || []).filter(run => num(run.distance) > 0);
  const distance = runs.reduce((sum, run) => sum + num(run.distance), 0);
  const durationSec = runs.reduce((sum, run) => sum + num(run.durationSec), 0);

  return {
    key,
    dateLabel: dateLabel(key),
    weight,
    weightTotals: {
      exercises: weight.length,
      sets: weight.reduce((sum, ex) => sum + ex.sets, 0),
      volume: weight.reduce((sum, ex) => sum + ex.volume, 0),
    },
    run: runs.length ? { count: runs.length, distance, durationSec, paceSec: distance ? durationSec / distance : 0 } : null,
    hasContent: weight.length > 0 || runs.length > 0,
  };
}

export function formatShareText(summary) {
  const lines = [`${summary.dateLabel} のトレーニング記録`];
  if (summary.weight.length) {
    const t = summary.weightTotals;
    lines.push(`🏋️ ウェイト ${t.exercises}種目・${t.sets}セット・総負荷 ${formatNumber(t.volume)}kg`);
    summary.weight.slice(0, MAX_TEXT_EXERCISES).forEach(ex => {
      lines.push(`・${ex.name} ${formatSet(ex.best)}（${ex.sets}セット）`);
    });
    const rest = summary.weight.length - MAX_TEXT_EXERCISES;
    if (rest > 0) lines.push(`・ほか${rest}種目`);
  }
  if (summary.run) {
    const r = summary.run;
    lines.push(`🏃 ランニング ${formatNumber(r.distance, 2)}km・${formatDuration(r.durationSec)}（${formatPace(r.paceSec)}/km）`);
  }
  const tags = [summary.weight.length ? "#筋トレ" : "", summary.run ? "#ランニング" : "", "#筋トレMEMO"].filter(Boolean);
  lines.push("", tags.join(" "));
  return lines.join("\n");
}

/* ---------- 画像（Instagramの縦長 4:5） ---------- */
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTiles(ctx, y, color, tiles) {
  const gap = 24;
  const width = (SHARE_CARD_SIZE.width - 120 - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([label, value], i) => {
    const x = 60 + i * (width + gap);
    ctx.fillStyle = color;
    roundRect(ctx, x, y, width, 150, 28);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(label, x + 28, y + 50);
    ctx.fillStyle = "#fff";
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(fitText(ctx, value, width - 56), x + 28, y + 118);
  });
  return y + 150;
}

export function drawShareCard(canvas, summary) {
  const { width, height } = SHARE_CARD_SIZE;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, width, height);

  // ヘッダー
  ctx.fillStyle = "#e8332a";
  ctx.fillRect(0, 0, width, 300);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText("TODAY'S TRAINING", 60, 100);
  ctx.fillStyle = "#fff";
  ctx.font = `800 84px ${FONT}`;
  ctx.fillText(summary.dateLabel, 60, 210);

  const headerBottom = 300;
  const footerTop = height - 110;
  const contentTop = 320;
  let y = 360;
  let bottom = contentTop;
  if (summary.weight.length) {
    const t = summary.weightTotals;
    ctx.fillStyle = "#c9241c";
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText("🏋️ ウェイト", 60, y);
    y = drawTiles(ctx, y + 30, "#e8332a", [
      ["種目", `${t.exercises}`],
      ["セット", `${t.sets}`],
      ["総負荷 kg", formatNumber(t.volume)],
    ]) + 50;

    const room = summary.run ? 3 : MAX_CARD_EXERCISES;
    const shown = summary.weight.slice(0, room);
    shown.forEach(ex => {
      const best = formatSet(ex.best);
      ctx.font = `800 38px ${FONT}`;
      const bestWidth = ctx.measureText(best).width;
      ctx.fillStyle = "#c9241c";
      ctx.fillText(best, width - 60 - bestWidth, y);
      ctx.fillStyle = "#222";
      ctx.font = `700 38px ${FONT}`;
      ctx.fillText(fitText(ctx, ex.name, width - 180 - bestWidth), 60, y);
      bottom = y + 12;
      y += 62;
    });
    const rest = summary.weight.length - shown.length;
    if (rest > 0) {
      ctx.fillStyle = "#888";
      ctx.font = `600 32px ${FONT}`;
      ctx.fillText(`ほか${rest}種目`, 60, y);
      bottom = y + 10;
      y += 56;
    }
    y += 30;
  }

  if (summary.run) {
    const r = summary.run;
    ctx.fillStyle = "#197642";
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText("🏃 ランニング", 60, y);
    y = drawTiles(ctx, y + 30, "#2e9e5b", [
      ["距離 km", formatNumber(r.distance, 2)],
      ["時間", formatDuration(r.durationSec)],
      ["ペース /km", formatPace(r.paceSec)],
    ]);
    bottom = y;
  }

  // 記録が少ない日も間延びしないよう、本文をヘッダーとフッターの間で上下中央に寄せる
  const offset = Math.floor((footerTop - headerBottom - (bottom - contentTop)) / 2) - (contentTop - headerBottom);
  if (offset > 0) {
    const body = ctx.getImageData(0, headerBottom, width, bottom - headerBottom);
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(0, headerBottom, width, footerTop - headerBottom);
    ctx.putImageData(body, 0, headerBottom + offset);
  }

  // フッター
  ctx.fillStyle = "#e8332a";
  ctx.fillRect(0, footerTop, width, 110);
  ctx.fillStyle = "#fff";
  ctx.font = `800 38px ${FONT}`;
  ctx.fillText("筋トレ・ランニング MEMO", 60, height - 42);
  return canvas;
}

export function canvasToFile(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error("画像を作成できませんでした")); return; }
      resolve(new File([blob], filename, { type: "image/png" }));
    }, "image/png");
  });
}

export function shareUrls(text) {
  const encoded = encodeURIComponent(text);
  return {
    x: `https://x.com/intent/post?text=${encoded}`,
    line: `https://line.me/R/share?text=${encoded}`,
  };
}
