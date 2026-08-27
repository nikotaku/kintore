import {
  state,
  save,
  resetAll,
  exportJSON,
  importJSON,
  replaceStateFromCloud,
  uid,
} from "./store.js";
import { FOOD_DB, MEAL_TYPES, VOLUME_COMPARES } from "./data.js";
import { dkey, parseKey, todayKey, addDays, fmtDateJP, estimate1RM, round1, esc, el } from "./util.js";
import { lineChart, barChart } from "./charts.js";
import { getExerciseVideo, saveExerciseVideo, deleteExerciseVideo, clearExerciseVideos } from "./video-store.js";
import {
  connectCloud,
  disconnectCloud,
  getCloudStatus,
  initCloudSync,
  sendTestAdvice,
  syncCloudNow,
} from "./cloud-sync.js";

/* ================= グローバルUI状態 ================= */
const ui = {
  view: "home",
  homeMonth: new Date(),      // ホームのカレンダー表示月
  selectedDate: todayKey(),   // ホームで選択中の日付
  historyMonth: new Date(),
  historyPart: "ALL",
  historyMode: "calendar",
  historySelected: null,
  mealDate: todayKey(),
  runDate: todayKey(),
  runTipOffset: 0,
  runDrafts: {},              // 日付ごとの未保存入力（ガイド往復・再描画で保持）
  workoutDate: todayKey(),    // ワークアウト詳細の対象日
  pickerDate: todayKey(),
  pickerFrom: "home",         // picker の戻り先
  pickerEdit: false,
};

const $ = sel => document.querySelector(sel);
const MONTH_EN = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const RUNNING_TIPS = [
  { kind: "フォーム", text: "目線は足元ではなく10〜20m先へ。頭が起きると上体も安定しやすい。" },
  { kind: "豆知識", text: "平均ペースは信号や坂で変わる。単発の数字より、同じコースでの推移を見る。" },
  { kind: "フォーム", text: "肩と手の力を抜き、腕は前へ振るより肘を後ろへ引く意識で。" },
  { kind: "豆知識", text: "楽な日は会話できる強度が一つの目安。毎回速く走る必要はない。" },
  { kind: "フォーム", text: "腰から折れず、足首から体全体をわずかに前へ傾ける。" },
  { kind: "豆知識", text: "最初の5〜10分を抑えると、後半までフォームを保ちやすい。" },
  { kind: "フォーム", text: "足を前へ伸ばしすぎず、体の真下に近い位置で着地する。" },
  { kind: "豆知識", text: "暑さや向かい風では同じペースでも負荷が上がる。数字より体感を優先する。" },
  { kind: "フォーム", text: "接地音が大きいときは、歩幅を少し狭めて静かな着地を試す。" },
  { kind: "豆知識", text: "距離を増やす日は速さを控え、速さを上げる日は距離を控えると負荷を管理しやすい。" },
  { kind: "フォーム", text: "疲れてきたら胸を軽く起こし、肘を後ろへ引いて姿勢を戻す。" },
  { kind: "豆知識", text: "睡眠不足の日は、目標ペースより短時間の軽い走りへ切り替える選択もある。" },
  { kind: "フォーム", text: "歩幅を無理に広げず、自然に足が回るリズムを優先する。" },
  { kind: "豆知識", text: "痛みで走り方が変わるなら、その日は記録より中止を優先する。" },
  { kind: "フォーム", text: "顎を上げすぎず、首から背中までを長く保つ。" },
  { kind: "豆知識", text: "坂道では平地のペースを守らず、呼吸のきつさを一定に保つ。" },
];

/* ================= 共通ヘルパー ================= */
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => { t.hidden = true; }, 1800);
}

function openModal(html) {
  const bd = $("#modal-backdrop");
  const box = $("#modal-box");
  box.innerHTML = html;
  bd.hidden = false;
  return box;
}
let activeVideoUrl = null;
function closeModal() {
  if (activeVideoUrl) {
    URL.revokeObjectURL(activeVideoUrl);
    activeVideoUrl = null;
  }
  $("#modal-backdrop").hidden = true;
}
$("#modal-backdrop").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeModal();
});

function exName(id) {
  const ex = state.exercises.find(e => e.id === id);
  return ex ? ex.name : null;
}

/* ================= 計算 ================= */
function dayVolume(key, part = "ALL") {
  const entries = state.workouts[key] || [];
  let v = 0;
  for (const en of entries) {
    if (part !== "ALL" && entryPart(en) !== part) continue;
    for (const s of en.sets) v += (Number(s.w) || 0) * (Number(s.r) || 0);
  }
  return v;
}

function entryPart(en) {
  const ex = state.exercises.find(e => e.id === en.exerciseId);
  return ex ? ex.part : en.part || "";
}

function entryName(en) {
  return exName(en.exerciseId) || en.name || "（削除された種目）";
}

function rangeVolume(fromKey, toKey) {
  let v = 0;
  for (const key of Object.keys(state.workouts)) {
    if (key >= fromKey && key <= toKey) v += dayVolume(key);
  }
  return v;
}

function totalVolume() {
  return Object.keys(state.workouts).reduce((a, k) => a + dayVolume(k), 0);
}

function workoutDays() {
  const days = new Set(Object.keys(state.workouts).filter(k => dayVolume(k) > 0 || (state.workouts[k] || []).some(e => e.sets.length)));
  Object.keys(state.runs || {}).forEach(k => {
    if ((state.runs[k] || []).length) days.add(k);
  });
  return [...days];
}

function runsForDay(key) {
  return state.runs?.[key] || [];
}

function runDistance(key) {
  return runsForDay(key).reduce((sum, run) => sum + (Number(run.distance) || 0), 0);
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(paceSeconds) {
  const sec = Math.max(0, Math.round(Number(paceSeconds) || 0));
  if (!sec) return "—";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function formatDistance(distance) {
  return Number(distance || 0).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

function lastExerciseEntryBefore(exerciseId, key) {
  for (const date of Object.keys(state.workouts).filter(k => k < key).sort().reverse()) {
    const entry = (state.workouts[date] || []).find(en => en.exerciseId === exerciseId && en.sets?.length);
    if (entry) return { date, entry };
  }
  return null;
}

// 週の開始（月曜）キー
function weekStart(key) {
  const d = parseKey(key);
  const dow = (d.getDay() + 6) % 7; // 月=0
  d.setDate(d.getDate() - dow);
  return dkey(d);
}

function bestRM(en) {
  let best = 0;
  for (const s of en.sets) best = Math.max(best, estimate1RM(Number(s.w) || 0, Number(s.r) || 0));
  return best;
}

function mealDayTotals(key) {
  const day = state.meals[key] || {};
  const tot = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const mt of MEAL_TYPES) {
    for (const item of day[mt.key] || []) {
      tot.kcal += item.kcal; tot.p += item.p; tot.f += item.f; tot.c += item.c;
    }
  }
  return tot;
}

/* ================= ナビゲーション ================= */
function showView(name) {
  ui.view = name;
  document.querySelectorAll(".view").forEach(v => { v.hidden = v.id !== `view-${name}`; });
  const activeNav = name === "running-guide" ? "running" : name;
  document.querySelectorAll(".nav-item").forEach(b => {
    b.classList.toggle("active", b.dataset.view === activeNav);
  });
  window.scrollTo(0, 0);
  const renderers = { home: renderHome, history: renderHistory, running: renderRunning, meals: renderMeals, body: renderBody, settings: renderSettings, picker: renderPicker, workout: renderWorkout };
  renderers[name]?.();
}

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function showViewAndFocus(name, selector) {
  showView(name);
  requestAnimationFrame(() => $(selector)?.focus({ preventScroll: true }));
}

/* ================= カレンダー共通描画 ================= */
function renderCalendar(container, monthDate, { light = false, markers = new Set(), selectedKey = null, onSelect, onMonthChange, title } = {}) {
  container.innerHTML = "";
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  const head = el(`<div class="cal-head">
    <button class="cal-nav" aria-label="前の月">‹</button>
    <span class="month-title">${title || `${y}年${String(m + 1).padStart(2, "0")}月`}</span>
    <button class="cal-nav" aria-label="次の月">›</button>
  </div>`);
  head.children[0].addEventListener("click", () => onMonthChange?.(-1));
  head.children[2].addEventListener("click", () => onMonthChange?.(1));
  container.appendChild(head);

  const table = document.createElement("table");
  table.className = "cal-grid";
  const days = light ? ["日", "月", "火", "水", "木", "金", "土"] : ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  table.innerHTML = `<thead><tr>${days.map(d => `<th>${d}</th>`).join("")}</tr></thead>`;
  const tbody = document.createElement("tbody");

  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay()); // 日曜始まり
  const today = todayKey();
  for (let w = 0; w < 6; w++) {
    const tr = document.createElement("tr");
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      const key = dkey(d);
      const inMonth = d.getMonth() === m;
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.className = "cal-day " + (inMonth ? "in-month" : "out-month");
      if (markers.has(key)) btn.classList.add("has-workout");
      if (key === today) btn.classList.add("today");
      if (key === selectedKey) btn.classList.add("selected");
      btn.textContent = d.getDate();
      if (inMonth && onSelect) btn.addEventListener("click", () => onSelect(key));
      td.appendChild(btn);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

/* ================= ホーム ================= */
function renderHome() {
  const workoutKeys = new Set(workoutDays());

  // カレンダー
  const m = ui.homeMonth;
  renderCalendar($("#home-calendar"), m, {
    markers: workoutKeys,
    selectedKey: ui.selectedDate,
    title: `${MONTH_EN[m.getMonth()]} ${m.getFullYear()}`,
    onSelect: key => { ui.selectedDate = key; renderHome(); },
    onMonthChange: d => { ui.homeMonth = new Date(m.getFullYear(), m.getMonth() + d, 1); renderHome(); },
  });

  // 負荷量統計
  const today = todayKey();
  const v7 = rangeVolume(addDays(today, -6), today);
  const v28 = rangeVolume(addDays(today, -27), today);
  const vAll = totalVolume();
  const fmtT = v => `${(v / 1000).toFixed(1)} t`;
  $("#stat-vol-7d").textContent = fmtT(v7);
  $("#stat-vol-28d").textContent = fmtT(v28);
  $("#stat-vol-all").textContent = fmtT(vAll);
  const [car, bus, plane] = VOLUME_COMPARES;
  $("#stat-cmp-7d").textContent = `${car.icon} × ${(v7 / 1000 / car.tons).toFixed(1)}`;
  $("#stat-cmp-28d").textContent = `${bus.icon} × ${(v28 / 1000 / bus.tons).toFixed(1)}`;
  $("#stat-cmp-all").textContent = `${plane.icon} × ${(vAll / 1000 / plane.tons).toFixed(1)}`;

  // 週バー（今週〜5週前）
  const ws = weekStart(today);
  const weeks = [];
  for (let i = 0; i < 6; i++) {
    const start = addDays(ws, -7 * i);
    weeks.push({ label: i === 0 ? "今週" : `${i}週前`, v: rangeVolume(start, addDays(start, 6)) });
  }
  const maxW = Math.max(...weeks.map(w => w.v), 1);
  $("#week-bars").innerHTML = weeks.map(w => `
    <div class="week-bar-row">
      <span class="lbl">${w.label}</span>
      <span class="bar-track"><span class="bar" style="width:${Math.round((w.v / maxW) * 100)}%"></span></span>
    </div>`).join("");

  // アーカイブ日数
  const monthPrefix = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
  $("#month-days").textContent = [...workoutKeys].filter(k => k.startsWith(monthPrefix)).length;
  $("#total-days").textContent = workoutKeys.size;

  // 選択日のワークアウト一覧
  $("#home-date-heading").textContent = `📋 ${fmtDateJP(ui.selectedDate)} のトレーニング`;
  const list = $("#home-workout-list");
  const entries = state.workouts[ui.selectedDate] || [];
  if (!entries.length) {
    list.innerHTML = `<div class="empty-note">まだ記録がありません。<br>「トレーニングを追加」から始めましょう💪</div>`;
  } else {
    list.innerHTML = "";
    for (const en of entries) {
      const card = el(`<div class="wo-card">
        <div class="wo-card-head">
          <span class="wo-card-name">${esc(entryName(en))}</span>
          <span class="wo-card-rm">RM : ${round1(bestRM(en)).toFixed(1)}kg</span>
        </div>
        ${en.sets.map((s, i) => `<div class="wo-set-line"><span class="idx">${i + 1}</span> ${Number(s.w) || 0} kg × ${Number(s.r) || 0} reps</div>`).join("")}
      </div>`);
      card.addEventListener("click", () => { ui.workoutDate = ui.selectedDate; showView("workout"); });
      list.appendChild(card);
    }
  }

  const previousWorkoutDate = Object.keys(state.workouts)
    .filter(k => k < ui.selectedDate && (state.workouts[k] || []).length)
    .sort().reverse()[0];
  $("#btn-copy-workout").disabled = !previousWorkoutDate;

  // 選択日のランニング
  const dayRuns = runsForDay(ui.selectedDate);
  const runWrap = $("#home-running-summary");
  if (!dayRuns.length) {
    runWrap.innerHTML = `<div class="summary-empty">まだ記録がありません</div>
      <button class="btn-outline full" id="btn-home-run">ランニングを記録する</button>`;
  } else {
    const distance = runDistance(ui.selectedDate);
    const duration = dayRuns.reduce((sum, run) => sum + (Number(run.durationSec) || 0), 0);
    const pace = distance ? duration / distance : 0;
    runWrap.innerHTML = `<div class="running-summary-main">
        <strong>${formatDistance(distance)} km</strong>
        <span>${formatDuration(duration)}</span>
        <span>${formatPace(pace)} /km</span>
      </div>
      <button class="btn-outline full" id="btn-home-run">記録を確認・追加</button>`;
  }
  $("#btn-home-run").addEventListener("click", () => {
    ui.runDate = ui.selectedDate;
    showView("running");
  });

  // 食事サマリ
  const tot = mealDayTotals(ui.selectedDate);
  const tg = state.targets;
  $("#home-meal-summary").innerHTML = `
    <div class="kcal-line">${Math.round(tot.kcal)} kcal <small>/ ${tg.kcal} kcal</small></div>
    ${macroBars(tot, tg)}
    <button class="btn-outline full" id="btn-goto-meals">🍽 食事を記録する</button>`;
  $("#btn-goto-meals").addEventListener("click", () => { ui.mealDate = ui.selectedDate; showView("meals"); });
}

function macroBars(tot, tg) {
  const rows = [
    ["kcal", "カロリー", tot.kcal, tg.kcal, "kcal"],
    ["p", "タンパク質", tot.p, tg.p, "g"],
    ["f", "脂質", tot.f, tg.f, "g"],
    ["c", "炭水化物", tot.c, tg.c, "g"],
  ];
  return rows.map(([cls, label, v, t, unit]) => `
    <div class="macro-row"><span>${label}</span>
      <span class="val ${v > t ? "over" : ""}">${Math.round(v * 10) / 10} / ${t} ${unit}</span></div>
    <div class="macro-track"><div class="macro-fill ${cls}" style="width:${Math.min(100, t ? (v / t) * 100 : 0)}%"></div></div>`).join("");
}

$("#btn-add-training").addEventListener("click", () => {
  ui.pickerDate = ui.selectedDate;
  ui.pickerFrom = "home";
  showView("picker");
});
$("#btn-copy-workout").addEventListener("click", () => {
  const sourceKey = Object.keys(state.workouts)
    .filter(k => k < ui.selectedDate && (state.workouts[k] || []).length)
    .sort().reverse()[0];
  if (!sourceKey) { toast("コピーできる過去の記録がありません"); return; }

  const target = state.workouts[ui.selectedDate] || [];
  const existingIds = new Set(target.map(en => en.exerciseId));
  const additions = state.workouts[sourceKey]
    .filter(en => !existingIds.has(en.exerciseId))
    .map(en => ({
      exerciseId: en.exerciseId,
      name: en.name,
      part: en.part,
      sets: (en.sets || []).map(s => ({ w: s.w, r: s.r })),
    }));
  if (!additions.length) { toast("前回の種目はすべて追加済みです"); return; }
  state.workouts[ui.selectedDate] = [...target, ...additions];
  save();
  ui.workoutDate = ui.selectedDate;
  toast(`${sourceKey.replaceAll("-", "/")} のメニューをコピーしました`);
  showView("workout");
});
$("#btn-quick-run").addEventListener("click", () => {
  ui.runDate = ui.selectedDate;
  showView("running");
});
$("#btn-settings").addEventListener("click", () => showView("settings"));

/* ---------- RM計算機 ---------- */
$("#btn-rm-calc").addEventListener("click", () => {
  const box = openModal(`
    <h3>🏋 RM 計算機</h3>
    <div class="form-row">
      <label>重量 (kg)<input type="number" id="rm-w" class="input" inputmode="decimal" value="60"></label>
      <label>回数 (reps)<input type="number" id="rm-r" class="input" inputmode="numeric" value="10"></label>
    </div>
    <div class="rm-result" id="rm-out">—</div>
    <table class="rm-table"><thead><tr><th>回数</th><th>推定重量</th></tr></thead><tbody id="rm-tbody"></tbody></table>
    <div class="modal-actions"><button class="btn-ghost" id="rm-close">閉じる</button></div>`);
  const update = () => {
    const w = Number(box.querySelector("#rm-w").value);
    const r = Number(box.querySelector("#rm-r").value);
    const rm = estimate1RM(w, r);
    box.querySelector("#rm-out").textContent = rm ? `推定1RM : ${round1(rm).toFixed(1)} kg` : "—";
    box.querySelector("#rm-tbody").innerHTML = rm ? [1, 2, 3, 5, 8, 10, 12, 15].map(n =>
      `<tr><td>${n} 回</td><td>${round1(rm / (1 + 0.025 * n) * (n === 1 ? 1.025 : 1)).toFixed(1)} kg</td></tr>`
    ).join("") : "";
  };
  box.querySelector("#rm-w").addEventListener("input", update);
  box.querySelector("#rm-r").addEventListener("input", update);
  box.querySelector("#rm-close").addEventListener("click", closeModal);
  update();
});

/* ================= 種目選択 ================= */
function lastDoneLabel(part) {
  const keys = Object.keys(state.workouts).sort().reverse();
  for (const k of keys) {
    if ((state.workouts[k] || []).some(en => entryPart(en) === part && en.sets.length)) {
      const diff = Math.floor((parseKey(todayKey()) - parseKey(k)) / 86400000);
      if (diff <= 0) return "たった今";
      if (diff === 1) return "昨日";
      return `${diff}日前`;
    }
  }
  return "";
}

function renderPicker() {
  $("#picker-date-label").textContent = ui.pickerDate.replaceAll("-", "/");
  $("#btn-picker-edit").textContent = ui.pickerEdit ? "完了" : "Edit";
  const wrap = $("#picker-groups");
  wrap.innerHTML = "";
  const dayEntries = state.workouts[ui.pickerDate] || [];

  for (const part of state.parts) {
    const exs = state.exercises.filter(e => e.part === part);
    const last = lastDoneLabel(part);
    const group = el(`<div class="picker-group">
      <div class="picker-group-head"><span>${esc(part)}${last ? ` <small>– ${last}</small>` : ""}</span>
        ${ui.pickerEdit ? `<button class="picker-item-del" data-del-part="${esc(part)}" title="部位を削除">✕</button>` : ""}
      </div>
    </div>`);
    for (const ex of exs) {
      const added = dayEntries.some(en => en.exerciseId === ex.id);
      const previous = lastExerciseEntryBefore(ex.id, ui.pickerDate);
      const hasVideo = Boolean(state.exerciseVideos?.[ex.id]);
      const row = el(`<button class="picker-item">
        <span class="picker-item-main"><span>${esc(ex.name)} ${hasVideo ? '<span class="video-badge">🎥</span>' : ""} ${added ? '<span class="badge">✔ 追加済</span>' : ""}</span>
          ${previous ? `<small>前回 ${previous.entry.sets.map(s => `${Number(s.w) || 0}kg×${Number(s.r) || 0}`).join(" / ")}</small>` : ""}
        </span>
        ${ui.pickerEdit ? '<span class="picker-item-del">🗑</span>' : ""}
      </button>`);
      row.addEventListener("click", () => {
        if (ui.pickerEdit) {
          if (confirm(`「${ex.name}」を種目リストから削除しますか？\n（過去の記録は残ります）`)) {
            state.exercises = state.exercises.filter(e => e.id !== ex.id);
            save(); renderPicker();
          }
          return;
        }
        addExerciseToDay(ex);
      });
      group.appendChild(row);
    }
    const foot = el(`<div class="picker-foot"><button class="add">＋ 種目を追加</button></div>`);
    foot.querySelector(".add").addEventListener("click", () => promptAddExercise(part));
    group.appendChild(foot);

    const delPartBtn = group.querySelector("[data-del-part]");
    if (delPartBtn) delPartBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (exs.length) { toast("種目が残っている部位は削除できません"); return; }
      if (confirm(`部位「${part}」を削除しますか？`)) {
        state.parts = state.parts.filter(p => p !== part);
        save(); renderPicker();
      }
    });
    wrap.appendChild(group);
  }
}

function addExerciseToDay(ex) {
  const key = ui.pickerDate;
  if (!state.workouts[key]) state.workouts[key] = [];
  if (!state.workouts[key].some(en => en.exerciseId === ex.id)) {
    state.workouts[key].push({ exerciseId: ex.id, name: ex.name, part: ex.part, sets: [{ w: "", r: "" }] });
    save();
  }
  ui.workoutDate = key;
  showView("workout");
}

function promptAddExercise(part) {
  const box = openModal(`
    <h3>種目を追加（${esc(part)}）</h3>
    <input type="text" id="new-ex-name" class="input" placeholder="種目名（例: インクラインプレス）">
    <div class="modal-actions">
      <button class="btn-ghost" id="cancel">キャンセル</button>
      <button class="btn-primary" id="ok">追加</button>
    </div>`);
  box.querySelector("#cancel").addEventListener("click", closeModal);
  box.querySelector("#ok").addEventListener("click", () => {
    const name = box.querySelector("#new-ex-name").value.trim();
    if (!name) return;
    state.exercises.push({ id: uid(), name, part });
    save(); closeModal(); renderPicker();
    toast(`「${name}」を追加しました`);
  });
  box.querySelector("#new-ex-name").focus();
}

$("#btn-add-part").addEventListener("click", () => {
  const box = openModal(`
    <h3>部位を追加</h3>
    <input type="text" id="new-part-name" class="input" placeholder="部位名（例: 全身）">
    <div class="modal-actions">
      <button class="btn-ghost" id="cancel">キャンセル</button>
      <button class="btn-primary" id="ok">追加</button>
    </div>`);
  box.querySelector("#cancel").addEventListener("click", closeModal);
  box.querySelector("#ok").addEventListener("click", () => {
    const name = box.querySelector("#new-part-name").value.trim();
    if (!name) return;
    if (state.parts.includes(name)) { toast("同じ部位が既にあります"); return; }
    state.parts.push(name);
    save(); closeModal(); renderPicker();
  });
});

$("#btn-picker-back").addEventListener("click", () => showView(ui.pickerFrom));
$("#btn-picker-edit").addEventListener("click", () => { ui.pickerEdit = !ui.pickerEdit; renderPicker(); });

/* ================= ワークアウト詳細 ================= */
function renderWorkout() {
  const key = ui.workoutDate;
  $("#workout-date-label").textContent = key.replaceAll("-", "/");
  const entries = state.workouts[key] || [];

  // 合計
  const nSets = entries.reduce((a, e) => a + e.sets.length, 0);
  const nReps = entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + (Number(s.r) || 0), 0), 0);
  const vol = dayVolume(key);
  $("#workout-totals").innerHTML = [
    ["合計種目数", entries.length],
    ["合計セット数", nSets],
    ["合計レップ数", nReps],
    ["合計負荷量", Math.round(vol)],
  ].map(([l, n]) => `<div class="wt-box"><div class="lbl">${l}</div><div class="num">${n}</div></div>`).join("");

  const wrap = $("#workout-exercises");
  wrap.innerHTML = "";
  if (!entries.length) {
    wrap.innerHTML = `<div class="empty-note" style="margin:12px">右下の＋から種目を追加してください</div>`;
  }
  entries.forEach((en, idx) => {
    const exercise = state.exercises.find(ex => ex.id === en.exerciseId) || { id: en.exerciseId, name: entryName(en), part: entryPart(en) };
    const previous = lastExerciseEntryBefore(en.exerciseId, key);
    const hasVideo = Boolean(state.exerciseVideos?.[en.exerciseId]);
    const card = el(`<div class="ex-card">
      <div class="ex-card-head">
        <span>${esc(entryName(en))}</span>
        <span class="mv">
          <button data-act="video" title="フォーム動画">${hasVideo ? "▶" : "🎥"}</button>
          <button data-act="up" title="上へ">∧</button>
          <button data-act="down" title="下へ">∨</button>
          <button data-act="del" class="del" title="削除">🗑</button>
        </span>
      </div>
      ${previous ? `<div class="exercise-quickbar">
        <span>前回 ${previous.date.replaceAll("-", "/")}</span>
        <button data-act="copy-previous">重量・回数を反映</button>
      </div>` : ""}
      <div class="set-head"><span>セット</span><span style="text-align:center">重さ(kg)</span><span style="text-align:center">回数</span><span style="text-align:center">RM</span><span></span></div>
    </div>`);

    card.querySelector('[data-act="video"]').addEventListener("click", () => openExerciseVideo(exercise));
    card.querySelector('[data-act="copy-previous"]')?.addEventListener("click", () => {
      const hasValues = en.sets.some(s => s.w !== "" || s.r !== "");
      if (hasValues && !confirm("現在の重量・回数を前回の記録で置き換えますか？")) return;
      en.sets = previous.entry.sets.map(s => ({ w: s.w, r: s.r }));
      save(); renderWorkout();
      toast("前回の重量・回数を反映しました");
    });

    card.querySelector('[data-act="up"]').addEventListener("click", () => {
      if (idx === 0) return;
      [entries[idx - 1], entries[idx]] = [entries[idx], entries[idx - 1]];
      save(); renderWorkout();
    });
    card.querySelector('[data-act="down"]').addEventListener("click", () => {
      if (idx === entries.length - 1) return;
      [entries[idx + 1], entries[idx]] = [entries[idx], entries[idx + 1]];
      save(); renderWorkout();
    });
    card.querySelector('[data-act="del"]').addEventListener("click", () => {
      if (!confirm(`「${entryName(en)}」をこの日の記録から削除しますか？`)) return;
      entries.splice(idx, 1);
      if (!entries.length) delete state.workouts[key];
      save(); renderWorkout();
    });

    en.sets.forEach((s, si) => {
      const row = el(`<div class="set-row">
        <span class="set-no">${si + 1}</span>
        <input type="number" step="0.5" min="0" inputmode="decimal" value="${s.w ?? ""}" placeholder="0">
        <input type="number" step="1" min="0" inputmode="numeric" value="${s.r ?? ""}" placeholder="0">
        <span class="rm"></span>
        <button class="del-btn" title="セット削除">🗑</button>
      </div>`);
      const [wIn, rIn] = row.querySelectorAll("input");
      const rmCell = row.querySelector(".rm");
      const updateRM = () => {
        const rm = estimate1RM(Number(wIn.value), Number(rIn.value));
        rmCell.textContent = rm ? `${round1(rm).toFixed(1)}kg` : "–";
      };
      const onInput = () => {
        s.w = wIn.value === "" ? "" : Number(wIn.value);
        s.r = rIn.value === "" ? "" : Number(rIn.value);
        updateRM(); updateWorkoutTotals(key);
        save();
      };
      wIn.addEventListener("input", onInput);
      rIn.addEventListener("input", onInput);
      [wIn, rIn].forEach(input => input.addEventListener("focus", () => input.select()));
      wIn.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); rIn.focus(); }
      });
      rIn.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const rows = [...card.querySelectorAll(".set-row")];
        const nextWeight = rows[si + 1]?.querySelector("input");
        if (nextWeight) { nextWeight.focus(); return; }
        en.sets.push({ w: wIn.value === "" ? "" : Number(wIn.value), r: rIn.value === "" ? "" : Number(rIn.value) });
        save(); renderWorkout();
        requestAnimationFrame(() => {
          const inputs = [...document.querySelectorAll("#workout-exercises .ex-card")][idx]?.querySelectorAll(".set-row input");
          inputs?.[inputs.length - 2]?.focus();
        });
      });
      row.querySelector(".del-btn").addEventListener("click", () => {
        en.sets.splice(si, 1);
        save(); renderWorkout();
      });
      updateRM();
      card.appendChild(row);
    });

    const addRow = el(`<div class="add-set-row"><button title="セット追加">＋</button></div>`);
    addRow.querySelector("button").addEventListener("click", () => {
      const lastSet = en.sets[en.sets.length - 1];
      en.sets.push({ w: lastSet ? lastSet.w : "", r: lastSet ? lastSet.r : "" });
      save(); renderWorkout();
    });
    card.appendChild(addRow);
    wrap.appendChild(card);
  });
}

function updateWorkoutTotals(key) {
  const entries = state.workouts[key] || [];
  const boxes = $("#workout-totals").querySelectorAll(".num");
  if (boxes.length < 4) return;
  boxes[0].textContent = entries.length;
  boxes[1].textContent = entries.reduce((a, e) => a + e.sets.length, 0);
  boxes[2].textContent = entries.reduce((a, e) => a + e.sets.reduce((b, s) => b + (Number(s.r) || 0), 0), 0);
  boxes[3].textContent = Math.round(dayVolume(key));
}

async function openExerciseVideo(exercise) {
  if (activeVideoUrl) {
    URL.revokeObjectURL(activeVideoUrl);
    activeVideoUrl = null;
  }
  const box = openModal(`
    <h3>🎥 ${esc(exercise.name)}のフォーム動画</h3>
    <div class="video-modal-body" id="video-modal-body"><div class="chart-empty">読み込み中…</div></div>
    <input type="file" id="form-video-file" accept="video/*" hidden>
    <p class="hint">動画はこの端末内だけに保存されます。JSONのバックアップには含まれません。</p>
    <div class="modal-actions">
      <button class="btn-ghost" id="video-close">閉じる</button>
      <button class="btn-primary" id="video-choose">動画を選択</button>
    </div>`);
  box.querySelector("#video-close").addEventListener("click", closeModal);
  const input = box.querySelector("#form-video-file");
  box.querySelector("#video-choose").addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast("動画ファイルを選択してください"); return; }
    if (file.size > 250 * 1024 * 1024) { toast("動画は250MB以下にしてください"); return; }
    try {
      box.querySelector("#video-modal-body").innerHTML = '<div class="chart-empty">保存中…</div>';
      await saveExerciseVideo(exercise.id, file);
      state.exerciseVideos[exercise.id] = { name: file.name, type: file.type, size: file.size, updatedAt: new Date().toISOString() };
      save({ source: "device-only", touch: false });
      toast("フォーム動画を保存しました");
      openExerciseVideo(exercise);
    } catch (err) {
      console.error(err);
      toast("動画を保存できませんでした。端末の空き容量を確認してください");
    }
  });

  try {
    const blob = await getExerciseVideo(exercise.id);
    const body = box.querySelector("#video-modal-body");
    if (!body) return;
    if (!blob) {
      body.innerHTML = `<div class="video-empty"><span>🎬</span><p>フォーム動画は未登録です</p></div>`;
      if (state.exerciseVideos[exercise.id]) {
        delete state.exerciseVideos[exercise.id];
        save({ source: "device-only", touch: false });
      }
      return;
    }
    activeVideoUrl = URL.createObjectURL(blob);
    body.innerHTML = `<video class="form-video" src="${activeVideoUrl}" controls playsinline preload="metadata"></video>
      <button class="video-delete" id="video-delete">動画を削除</button>`;
    body.querySelector("#video-delete").addEventListener("click", async () => {
      if (!confirm("このフォーム動画を削除しますか？")) return;
      await deleteExerciseVideo(exercise.id);
      delete state.exerciseVideos[exercise.id];
      save({ source: "device-only", touch: false }); closeModal(); renderWorkout();
      toast("フォーム動画を削除しました");
    });
  } catch (err) {
    console.error(err);
    box.querySelector("#video-modal-body").innerHTML = '<div class="chart-empty">動画を読み込めませんでした</div>';
  }
}

$("#btn-workout-back").addEventListener("click", () => {
  ui.selectedDate = ui.workoutDate;
  showView("home");
});
$("#btn-workout-add").addEventListener("click", () => {
  ui.pickerDate = ui.workoutDate;
  ui.pickerFrom = "workout";
  showView("picker");
});

/* ================= 履歴 / 分析 ================= */
function renderHistory() {
  // 部位タブ
  const tabs = $("#part-tabs");
  tabs.innerHTML = "";
  for (const p of ["ALL", ...state.parts]) {
    const b = el(`<button class="part-tab ${ui.historyPart === p ? "active" : ""}">${esc(p)}</button>`);
    b.addEventListener("click", () => { ui.historyPart = p; renderHistory(); });
    tabs.appendChild(b);
  }

  // モード切替
  document.querySelectorAll(".seg").forEach(s => {
    s.classList.toggle("active", s.dataset.mode === ui.historyMode);
    s.onclick = () => { ui.historyMode = s.dataset.mode; renderHistory(); };
  });
  $("#history-calendar-pane").hidden = ui.historyMode !== "calendar";
  $("#history-graph-pane").hidden = ui.historyMode !== "graph";

  if (ui.historyMode === "calendar") {
    const markers = new Set(
      Object.keys(state.workouts).filter(k =>
        (state.workouts[k] || []).some(en => (ui.historyPart === "ALL" || entryPart(en) === ui.historyPart) && en.sets.length))
    );
    if (ui.historyPart === "ALL" || ui.historyPart === "有酸素") {
      Object.keys(state.runs || {}).forEach(k => {
        if (runsForDay(k).length) markers.add(k);
      });
    }
    const m = ui.historyMonth;
    renderCalendar($("#history-calendar"), m, {
      light: true,
      markers,
      selectedKey: ui.historySelected,
      onSelect: key => { ui.historySelected = key; renderHistory(); },
      onMonthChange: d => { ui.historyMonth = new Date(m.getFullYear(), m.getMonth() + d, 1); renderHistory(); },
    });
    renderHistoryDayDetail();
  } else {
    renderHistoryGraphs();
  }
}

function renderHistoryDayDetail() {
  const wrap = $("#history-day-detail");
  wrap.innerHTML = "";
  if (!ui.historySelected) return;
  const entries = (state.workouts[ui.historySelected] || [])
    .filter(en => ui.historyPart === "ALL" || entryPart(en) === ui.historyPart);
  const runs = (ui.historyPart === "ALL" || ui.historyPart === "有酸素") ? runsForDay(ui.historySelected) : [];
  wrap.appendChild(el(`<h2 class="section-heading">${fmtDateJP(ui.historySelected)}</h2>`));
  if (!entries.length && !runs.length) {
    wrap.appendChild(el(`<div class="empty-note">この日の記録はありません</div>`));
    return;
  }
  for (const en of entries) {
    const card = el(`<div class="wo-card">
      <div class="wo-card-head">
        <span class="wo-card-name">${esc(entryName(en))}</span>
        <span class="wo-card-rm">RM : ${round1(bestRM(en)).toFixed(1)}kg</span>
      </div>
      ${en.sets.map((s, i) => `<div class="wo-set-line"><span class="idx">${i + 1}</span> ${Number(s.w) || 0} kg × ${Number(s.r) || 0} reps</div>`).join("")}
    </div>`);
    card.addEventListener("click", () => { ui.workoutDate = ui.historySelected; showView("workout"); });
    wrap.appendChild(card);
  }
  for (const run of runs) {
    const card = el(`<div class="wo-card run-history-card">
      <div class="wo-card-head">
        <span class="wo-card-name">🏃 ランニング ${round1(run.distance)} km</span>
        <span class="wo-card-rm">${formatPace(run.paceSec)} /km</span>
      </div>
      <div class="wo-set-line">所要時間 ${formatDuration(run.durationSec)}${run.memo ? ` · ${esc(run.memo)}` : ""}</div>
    </div>`);
    card.addEventListener("click", () => { ui.runDate = ui.historySelected; showView("running"); });
    wrap.appendChild(card);
  }
}

function renderHistoryGraphs() {
  // 週別負荷量（直近12週）
  const today = todayKey();
  const ws = weekStart(today);
  const bars = [];
  for (let i = 11; i >= 0; i--) {
    const start = addDays(ws, -7 * i);
    let v = 0;
    for (let d = 0; d < 7; d++) {
      v += dayVolume(addDays(start, d), ui.historyPart);
    }
    const sd = parseKey(start);
    bars.push({ label: `${sd.getMonth() + 1}/${sd.getDate()}`, value: v });
  }
  barChart($("#chart-volume"), bars, { unit: "kg" });

  const runBars = [];
  for (let i = 11; i >= 0; i--) {
    const start = addDays(ws, -7 * i);
    let distance = 0;
    for (let d = 0; d < 7; d++) distance += runDistance(addDays(start, d));
    const sd = parseKey(start);
    runBars.push({ label: `${sd.getMonth() + 1}/${sd.getDate()}`, value: round1(distance) });
  }
  barChart($("#chart-run-distance"), runBars, { unit: "km", color: "#2e9e5b" });

  // 種目別 推定1RM
  const sel = $("#chart-exercise-select");
  const exs = state.exercises.filter(e => ui.historyPart === "ALL" || e.part === ui.historyPart);
  sel.innerHTML = exs.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("");
  if (!sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", () => renderRMChart(sel.value));
  }
  if (exs.length) {
    if (![...sel.options].some(o => o.value === sel.value)) sel.value = exs[0].id;
    renderRMChart(sel.value);
  } else {
    $("#chart-rm").innerHTML = '<div class="chart-empty">種目がありません</div>';
  }
}

function renderRMChart(exerciseId) {
  const points = [];
  for (const key of Object.keys(state.workouts).sort()) {
    for (const en of state.workouts[key]) {
      if (en.exerciseId !== exerciseId) continue;
      const rm = bestRM(en);
      if (rm > 0) {
        const d = parseKey(key);
        points.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: round1(rm) });
      }
    }
  }
  lineChart($("#chart-rm"), points.slice(-20), { unit: "kg" });
}

/* ================= ランニング ================= */
function currentRunInput() {
  const distance = Number($("#run-distance").value) || 0;
  const hours = Math.max(0, Number($("#run-hours").value) || 0);
  const minutes = Math.min(59, Math.max(0, Number($("#run-minutes").value) || 0));
  const seconds = Math.min(59, Math.max(0, Number($("#run-seconds").value) || 0));
  const durationSec = hours * 3600 + minutes * 60 + seconds;
  return { distance, durationSec, paceSec: distance ? durationSec / distance : 0 };
}

function currentRunDraft() {
  return {
    distance: $("#run-distance").value,
    hours: $("#run-hours").value,
    minutes: $("#run-minutes").value,
    seconds: $("#run-seconds").value,
    memo: $("#run-memo").value,
  };
}

function rememberRunDraft() {
  const draft = currentRunDraft();
  if (Object.values(draft).some(value => value !== "")) ui.runDrafts[ui.runDate] = draft;
  else delete ui.runDrafts[ui.runDate];
}

function contextualRunningTip(run) {
  const distance = Number(run?.distance) || 0;
  const durationSec = Number(run?.durationSec) || 0;
  const paceSec = Number(run?.paceSec) || 0;
  if (distance >= 10 || durationSec >= 3600) {
    return { kind: "豆知識", text: "長めの距離では前半を少し抑える。後半に姿勢と呼吸を保ちやすくなる。" };
  }
  if (paceSec > 0 && paceSec <= 330) {
    return { kind: "フォーム", text: "速いペースほど肩と手に力が入りやすい。息を吐くたびに上半身をゆるめる。" };
  }
  if (paceSec >= 420) {
    return { kind: "フォーム", text: "ゆっくり走る日は歩幅を欲張らず、会話できる呼吸と静かな着地を保つ。" };
  }
  if (paceSec > 0) {
    return { kind: "フォーム", text: "足を前へ伸ばすより、体の真下に近い位置へ置く意識を優先する。" };
  }
  return null;
}

function runningTipSeed(key) {
  return [...key].reduce((seed, char) => ((seed * 31) + char.charCodeAt(0)) >>> 0, 0);
}

function updateRunTip() {
  const badge = $("#run-tip-badge");
  const text = $("#run-tip-text");
  if (!badge || !text) return;

  const input = currentRunInput();
  const hasCompleteInput = input.distance > 0 && input.durationSec > 0;
  const dayRuns = runsForDay(ui.runDate);
  const latestRun = dayRuns.length ? dayRuns[dayRuns.length - 1] : null;
  const contextualTip = contextualRunningTip(hasCompleteInput ? input : latestRun);

  let tip = null;
  if (contextualTip && ui.runTipOffset === 0) {
    tip = contextualTip;
  } else {
    const adjustment = contextualTip ? Math.max(0, ui.runTipOffset - 1) : ui.runTipOffset;
    const index = (runningTipSeed(ui.runDate) + adjustment) % RUNNING_TIPS.length;
    tip = RUNNING_TIPS[index];
  }

  badge.textContent = tip.kind;
  badge.classList.toggle("trivia", tip.kind === "豆知識");
  text.textContent = tip.text;
}

function updateRunPacePreview() {
  const { distance, durationSec, paceSec } = currentRunInput();
  $("#run-pace-preview").textContent = distance > 0 && durationSec > 0
    ? `平均ペース ${formatPace(paceSec)} /km`
    : "平均ペース — /km";
  updateRunTip();
}

function renderRunRow(key, run, { showDate = false } = {}) {
  const row = el(`<div class="run-log-row">
    <div class="run-log-main">
      ${showDate ? `<span class="run-log-date">${fmtDateJP(key)}</span>` : ""}
      <strong>${formatDistance(run.distance)} km</strong>
      <span>${formatDuration(run.durationSec)} · ${formatPace(run.paceSec)} /km</span>
      ${run.memo ? `<small>${esc(run.memo)}</small>` : ""}
    </div>
    <button class="del-btn" title="削除">✕</button>
  </div>`);
  row.querySelector(".del-btn").addEventListener("click", () => {
    if (!confirm(`${fmtDateJP(key)} のランニング記録を削除しますか？`)) return;
    const records = runsForDay(key);
    const index = records.findIndex(item => item.id === run.id);
    if (index >= 0) records.splice(index, 1);
    if (!records.length) delete state.runs[key];
    save(); renderRunning();
    toast("ランニング記録を削除しました");
  });
  return row;
}

function renderRunning() {
  const draft = ui.runDrafts[ui.runDate] || {};
  $("#run-date-label").textContent = fmtDateJP(ui.runDate);
  $("#run-distance").value = draft.distance || "";
  $("#run-hours").value = draft.hours || "";
  $("#run-minutes").value = draft.minutes || "";
  $("#run-seconds").value = draft.seconds || "";
  $("#run-memo").value = draft.memo || "";
  updateRunPacePreview();

  const week = weekStart(ui.runDate);
  let weekDistance = 0;
  for (let i = 0; i < 7; i++) weekDistance += runDistance(addDays(week, i));
  const monthPrefix = ui.runDate.slice(0, 7);
  const monthDistance = Object.keys(state.runs || {})
    .filter(key => key.startsWith(monthPrefix))
    .reduce((sum, key) => sum + runDistance(key), 0);
  $("#run-stats").innerHTML = `
    <div class="run-stat"><span>今週</span><strong>${round1(weekDistance)} km</strong></div>
    <div class="run-stat"><span>今月</span><strong>${round1(monthDistance)} km</strong></div>`;

  const dayList = $("#run-day-list");
  dayList.innerHTML = "";
  const dayRuns = runsForDay(ui.runDate);
  if (!dayRuns.length) dayList.innerHTML = '<div class="chart-empty">この日の記録はありません</div>';
  dayRuns.forEach(run => dayList.appendChild(renderRunRow(ui.runDate, run)));

  const history = Object.keys(state.runs || {}).sort().reverse()
    .flatMap(key => runsForDay(key).slice().reverse().map(run => ({ key, run })))
    .filter(item => item.key !== ui.runDate || !dayRuns.some(run => run.id === item.run.id))
    .slice(0, 20);
  const historyList = $("#run-history-list");
  historyList.innerHTML = "";
  if (!history.length) historyList.innerHTML = '<div class="chart-empty">過去の記録はありません</div>';
  history.forEach(({ key, run }) => historyList.appendChild(renderRunRow(key, run, { showDate: true })));
}

["#run-distance", "#run-hours", "#run-minutes", "#run-seconds"].forEach(selector => {
  $(selector).addEventListener("input", () => {
    rememberRunDraft();
    updateRunPacePreview();
  });
  $(selector).addEventListener("focus", e => e.target.select());
});
$("#run-memo").addEventListener("input", rememberRunDraft);
$("#btn-next-run-tip").addEventListener("click", () => {
  ui.runTipOffset += 1;
  updateRunTip();
});
$("#btn-running-guide").addEventListener("click", () => {
  rememberRunDraft();
  showViewAndFocus("running-guide", "#running-guide-title");
});
$("#btn-running-guide-back").addEventListener("click", () => showViewAndFocus("running", "#btn-running-guide"));
$("#btn-running-guide-done").addEventListener("click", () => showViewAndFocus("running", "#btn-running-guide"));
$("#run-prev").addEventListener("click", () => {
  ui.runDate = addDays(ui.runDate, -1);
  ui.runTipOffset = 0;
  renderRunning();
});
$("#run-next").addEventListener("click", () => {
  ui.runDate = addDays(ui.runDate, 1);
  ui.runTipOffset = 0;
  renderRunning();
});
$("#btn-save-run").addEventListener("click", () => {
  const { distance, durationSec, paceSec } = currentRunInput();
  if (distance <= 0) { toast("距離を入力してください"); return; }
  if (durationSec <= 0) { toast("所要時間を入力してください"); return; }
  if (!state.runs[ui.runDate]) state.runs[ui.runDate] = [];
  state.runs[ui.runDate].push({
    id: uid(),
    distance: Math.round(distance * 100) / 100,
    durationSec,
    paceSec,
    memo: $("#run-memo").value.trim(),
  });
  save();
  delete ui.runDrafts[ui.runDate];
  ui.runTipOffset = 0;
  renderRunning();
  toast("ランニングを記録しました");
});

/* ================= 食事 ================= */
function renderMeals() {
  $("#meal-date-label").textContent = fmtDateJP(ui.mealDate);

  const tot = mealDayTotals(ui.mealDate);
  const tg = state.targets;
  $("#meal-totals").innerHTML = `
    <div class="kcal-line" style="font-size:1.15rem;font-weight:800;margin-bottom:8px">
      ${Math.round(tot.kcal)} kcal <small style="font-weight:400;color:#888">/ ${tg.kcal} kcal（残り ${Math.max(0, Math.round(tg.kcal - tot.kcal))} kcal）</small>
    </div>
    ${macroBars(tot, tg)}`;

  const wrap = $("#meal-sections");
  wrap.innerHTML = "";
  const day = state.meals[ui.mealDate] || {};
  for (const mt of MEAL_TYPES) {
    const items = day[mt.key] || [];
    const kcal = items.reduce((a, i) => a + i.kcal, 0);
    const sec = el(`<div class="meal-section">
      <div class="meal-section-head"><span>${mt.icon} ${mt.label}</span><span class="kcal">${Math.round(kcal)} kcal</span></div>
    </div>`);
    items.forEach((item, i) => {
      const row = el(`<div class="meal-item">
        <span class="m-name">${esc(item.name)}${item.grams ? ` <small style="color:#999">${item.grams}g</small>` : ""}</span>
        <span class="m-detail">${Math.round(item.kcal)}kcal P${round1(item.p)} F${round1(item.f)} C${round1(item.c)}</span>
        <button class="del-btn" title="削除">✕</button>
      </div>`);
      row.querySelector(".del-btn").addEventListener("click", () => {
        items.splice(i, 1);
        if (!items.length) delete day[mt.key];
        if (!Object.keys(day).length) delete state.meals[ui.mealDate];
        save(); renderMeals();
      });
      sec.appendChild(row);
    });
    const addRow = el(`<div class="meal-add-row"><button>＋ 食品を追加</button></div>`);
    addRow.querySelector("button").addEventListener("click", () => openFoodModal(mt));
    sec.appendChild(addRow);
    wrap.appendChild(sec);
  }
}

$("#meal-prev").addEventListener("click", () => { ui.mealDate = addDays(ui.mealDate, -1); renderMeals(); });
$("#meal-next").addEventListener("click", () => { ui.mealDate = addDays(ui.mealDate, 1); renderMeals(); });

function allFoods() {
  return [...state.customFoods, ...FOOD_DB];
}

function openFoodModal(mt) {
  const box = openModal(`
    <h3>${mt.icon} ${mt.label}に追加</h3>
    <input type="text" id="food-search" class="input" placeholder="食品を検索（例: 鶏むね）">
    <div class="food-search-list" id="food-list"></div>
    <div class="modal-actions">
      <button class="btn-ghost" id="food-cancel">キャンセル</button>
      <button class="btn-primary" id="food-manual">手入力で追加</button>
    </div>`);
  const listEl = box.querySelector("#food-list");
  const renderList = q => {
    const foods = allFoods().filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()));
    listEl.innerHTML = "";
    if (!foods.length) { listEl.innerHTML = '<div class="chart-empty">見つかりません</div>'; return; }
    foods.slice(0, 60).forEach(f => {
      const row = el(`<button class="food-row">
        <span>${esc(f.name)}</span>
        <span class="f-detail">${Math.round(f.kcal * f.unit / 100)}kcal / ${f.unit}g</span>
      </button>`);
      row.addEventListener("click", () => openPortionModal(mt, f));
      listEl.appendChild(row);
    });
  };
  box.querySelector("#food-search").addEventListener("input", e => renderList(e.target.value.trim()));
  box.querySelector("#food-cancel").addEventListener("click", closeModal);
  box.querySelector("#food-manual").addEventListener("click", () => openManualFoodModal(mt));
  renderList("");
  box.querySelector("#food-search").focus();
}

function openPortionModal(mt, food) {
  const box = openModal(`
    <h3>${esc(food.name)}</h3>
    <div class="form-row">
      <label>量 (g)<input type="number" id="portion-g" class="input" inputmode="decimal" value="${food.unit}" min="0"></label>
    </div>
    <div class="rm-result" id="portion-out"></div>
    <p class="hint">100gあたり: ${food.kcal}kcal / P${food.p} F${food.f} C${food.c}</p>
    <div class="modal-actions">
      <button class="btn-ghost" id="portion-cancel">戻る</button>
      <button class="btn-primary" id="portion-ok">追加する</button>
    </div>`);
  const gIn = box.querySelector("#portion-g");
  const calc = () => {
    const g = Number(gIn.value) || 0;
    const k = g / 100;
    return { kcal: food.kcal * k, p: food.p * k, f: food.f * k, c: food.c * k, g };
  };
  const update = () => {
    const v = calc();
    box.querySelector("#portion-out").innerHTML =
      `${Math.round(v.kcal)} kcal <span style="font-size:.9rem;color:#666">P ${round1(v.p)}g / F ${round1(v.f)}g / C ${round1(v.c)}g</span>`;
  };
  gIn.addEventListener("input", update);
  box.querySelector("#portion-cancel").addEventListener("click", () => openFoodModal(mt));
  box.querySelector("#portion-ok").addEventListener("click", () => {
    const v = calc();
    if (!v.g) { toast("量を入力してください"); return; }
    addMealItem(mt.key, {
      id: uid(), name: food.name, grams: v.g,
      kcal: round1(v.kcal), p: round1(v.p), f: round1(v.f), c: round1(v.c),
    });
    closeModal();
  });
  update();
  gIn.select();
}

function openManualFoodModal(mt) {
  const box = openModal(`
    <h3>手入力で追加（${mt.label}）</h3>
    <div class="form-row wrap">
      <label style="flex-basis:100%">名前<input type="text" id="mf-name" class="input" placeholder="例: コンビニ弁当"></label>
      <label>カロリー (kcal)<input type="number" id="mf-kcal" class="input" inputmode="decimal"></label>
      <label>タンパク質 (g)<input type="number" id="mf-p" class="input" inputmode="decimal"></label>
      <label>脂質 (g)<input type="number" id="mf-f" class="input" inputmode="decimal"></label>
      <label>炭水化物 (g)<input type="number" id="mf-c" class="input" inputmode="decimal"></label>
      <label>量 (g・任意)<input type="number" id="mf-g" class="input" inputmode="decimal"></label>
    </div>
    <label style="font-size:.85rem;display:flex;gap:6px;align-items:center">
      <input type="checkbox" id="mf-save"> 食品リストに保存する（量gの入力が必要）
    </label>
    <div class="modal-actions">
      <button class="btn-ghost" id="mf-cancel">戻る</button>
      <button class="btn-primary" id="mf-ok">追加する</button>
    </div>`);
  box.querySelector("#mf-cancel").addEventListener("click", () => openFoodModal(mt));
  box.querySelector("#mf-ok").addEventListener("click", () => {
    const name = box.querySelector("#mf-name").value.trim();
    const kcal = Number(box.querySelector("#mf-kcal").value) || 0;
    const p = Number(box.querySelector("#mf-p").value) || 0;
    const f = Number(box.querySelector("#mf-f").value) || 0;
    const c = Number(box.querySelector("#mf-c").value) || 0;
    const g = Number(box.querySelector("#mf-g").value) || 0;
    if (!name) { toast("名前を入力してください"); return; }
    addMealItem(mt.key, { id: uid(), name, grams: g || null, kcal, p, f, c });
    if (box.querySelector("#mf-save").checked && g > 0) {
      const k = 100 / g;
      state.customFoods.unshift({
        name, kcal: round1(kcal * k), p: round1(p * k), f: round1(f * k), c: round1(c * k), unit: g,
      });
      save();
      toast("食品リストに保存しました");
    }
    closeModal();
  });
}

function addMealItem(typeKey, item) {
  if (!state.meals[ui.mealDate]) state.meals[ui.mealDate] = {};
  if (!state.meals[ui.mealDate][typeKey]) state.meals[ui.mealDate][typeKey] = [];
  state.meals[ui.mealDate][typeKey].push(item);
  save();
  renderMeals();
  toast(`${item.name} を追加しました`);
}

/* ================= 体組成 ================= */
function renderBody() {
  const today = todayKey();
  const rec = state.body[today];
  const keys = Object.keys(state.body).sort();
  const lastRec = keys.length ? state.body[keys[keys.length - 1]] : null;
  $("#body-weight").value = rec?.weight ?? lastRec?.weight ?? "";
  $("#body-fat").value = rec?.fat ?? "";

  const wPoints = keys.slice(-30).filter(k => state.body[k].weight != null).map(k => {
    const d = parseKey(k);
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, value: state.body[k].weight };
  });
  lineChart($("#chart-weight"), wPoints, { color: "#e8332a", unit: "kg" });

  const fPoints = keys.slice(-30).filter(k => state.body[k].fat != null).map(k => {
    const d = parseKey(k);
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, value: state.body[k].fat };
  });
  lineChart($("#chart-fat"), fPoints, { color: "#3f51b5", unit: "%" });

  const list = $("#body-log-list");
  list.innerHTML = "";
  const recent = keys.slice(-14).reverse();
  if (!recent.length) list.innerHTML = '<div class="chart-empty">記録がありません</div>';
  for (const k of recent) {
    const r = state.body[k];
    const row = el(`<div class="body-log-row">
      <span class="d">${fmtDateJP(k)}</span>
      <span>${r.weight != null ? r.weight + " kg" : "–"} / ${r.fat != null ? r.fat + " %" : "–"}</span>
      <button class="del-btn">✕</button>
    </div>`);
    row.querySelector(".del-btn").addEventListener("click", () => {
      if (!confirm(`${fmtDateJP(k)} の記録を削除しますか？`)) return;
      delete state.body[k];
      save(); renderBody();
    });
    list.appendChild(row);
  }
}

$("#btn-save-body").addEventListener("click", () => {
  const w = $("#body-weight").value;
  const f = $("#body-fat").value;
  if (w === "" && f === "") { toast("体重か体脂肪率を入力してください"); return; }
  state.body[todayKey()] = {
    weight: w === "" ? null : Number(w),
    fat: f === "" ? null : Number(f),
  };
  save(); renderBody();
  toast("体組成を記録しました");
});

/* ================= 設定 ================= */
let cloudStatus = getCloudStatus();

function updateCloudUI(nextStatus = getCloudStatus()) {
  cloudStatus = nextStatus;
  const badge = $("#cloud-badge");
  const statusText = $("#cloud-status");
  const login = $("#cloud-login");
  const connected = $("#cloud-connected");
  if (!badge || !statusText || !login || !connected) return;

  badge.textContent = nextStatus.phase === "conflict"
    ? "要確認"
    : nextStatus.phase === "pending"
      ? "同期待ち"
      : nextStatus.phase === "error"
        ? "同期失敗"
        : nextStatus.connected
          ? nextStatus.busy ? "同期中" : "同期済み"
          : nextStatus.available ? "未ログイン" : "利用不可";
  badge.classList.toggle("connected", nextStatus.connected);
  badge.classList.toggle("error", !nextStatus.available || nextStatus.phase === "conflict");
  statusText.textContent = nextStatus.message || "";
  statusText.classList.toggle("error", /失敗|できません|正しくありません|選択してください/.test(nextStatus.message || ""));
  login.hidden = nextStatus.connected;
  connected.hidden = !nextStatus.connected;
  $("#cloud-account").textContent = nextStatus.connected
    ? `${nextStatus.email} で接続中`
    : "";

  const lastAdvice = nextStatus.lastAdvice;
  $("#last-advice").textContent = lastAdvice?.advice_date
    ? `前回の自動送信：${lastAdvice.advice_date}（履歴分析）`
    : "自動送信の履歴はまだありません";

  const lastSync = $("#last-sync");
  if (lastSync) {
    const synced = nextStatus.lastSyncedAt ? new Date(nextStatus.lastSyncedAt) : null;
    lastSync.textContent = synced && !Number.isNaN(synced.getTime())
      ? `最終同期：${synced.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}`
      : "最終同期：まだありません";
  }

  ["#btn-cloud-connect", "#btn-cloud-sync", "#btn-test-advice", "#btn-cloud-disconnect", "#btn-save-advice"]
    .forEach(selector => {
      const button = $(selector);
      if (button) button.disabled = !!nextStatus.busy || !nextStatus.available;
    });
}

function renderSettings() {
  $("#target-kcal").value = state.targets.kcal;
  $("#target-p").value = state.targets.p;
  $("#target-f").value = state.targets.f;
  $("#target-c").value = state.targets.c;
  $("#advice-weaknesses").value = state.advice?.weaknesses || "";
  $("#advice-time").value = state.advice?.notificationTime || "08:00";
  $("#advice-enabled").checked = state.advice?.notificationEnabled !== false;
  $("#cloud-email").value = state.advice?.accountEmail || "";
  updateCloudUI(cloudStatus);
}

$("#btn-settings-back").addEventListener("click", () => showView("home"));

$("#btn-save-targets").addEventListener("click", () => {
  state.targets = {
    kcal: Number($("#target-kcal").value) || 0,
    p: Number($("#target-p").value) || 0,
    f: Number($("#target-f").value) || 0,
    c: Number($("#target-c").value) || 0,
  };
  save();
  toast("目標を保存しました");
});

function saveAdviceForm() {
  state.advice = {
    ...(state.advice || {}),
    goals: ["国づくり", "居心地のいいコミュニティ作り", "健康の最適化"],
    weaknesses: $("#advice-weaknesses").value.trim(),
    notificationEnabled: $("#advice-enabled").checked,
    notificationTime: $("#advice-time").value || "08:00",
    accountEmail: $("#cloud-email").value.trim(),
  };
  save();
}

$("#btn-save-advice").addEventListener("click", async () => {
  saveAdviceForm();
  try {
    if (cloudStatus.connected) {
      await syncCloudNow(state);
      toast("設定を保存・同期しました");
    } else {
      toast("設定を端末に保存しました");
    }
  } catch (error) {
    console.error(error);
    toast("端末には保存しましたが、同期に失敗しました");
  }
});

$("#btn-cloud-connect").addEventListener("click", async () => {
  const email = $("#cloud-email").value.trim();
  const password = $("#cloud-password").value;
  try {
    const result = await connectCloud({ email, password });
    state.advice = { ...(state.advice || {}), accountEmail: email };
    save({ source: "device-only", touch: false });
    $("#cloud-password").value = "";
    if (result.reconciliation?.action === "pulled") {
      toast("クラウドの記録を復元しました");
    } else if (result.reconciliation?.action === "conflict") {
      toast("同期する記録を選択してください");
    } else {
      toast("ログインして自動保存を開始しました");
    }
  } catch (error) {
    console.error(error);
    toast(error.message || "接続に失敗しました");
  }
});

$("#btn-cloud-sync").addEventListener("click", async () => {
  saveAdviceForm();
  try {
    await syncCloudNow(state);
    toast("最新の履歴を同期しました");
  } catch (error) {
    console.error(error);
    toast("同期に失敗しました");
  }
});

$("#btn-test-advice").addEventListener("click", async () => {
  if (!confirm("全力エステ予約通知用LINEへ、テストメッセージを1通送ります。よろしいですか？")) return;
  saveAdviceForm();
  try {
    await sendTestAdvice(state);
    toast("LINEへテスト送信しました");
  } catch (error) {
    console.error(error);
    toast(error.message || "テスト送信に失敗しました");
  }
});

$("#btn-cloud-disconnect").addEventListener("click", async () => {
  try {
    await disconnectCloud();
    toast("ログアウトしました");
  } catch (error) {
    console.error(error);
    toast("ログアウトに失敗しました");
  }
});

$("#btn-export").addEventListener("click", () => {
  const blob = new Blob([exportJSON()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kintore-memo-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#btn-import").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    importJSON(await file.text());
    toast("インポートしました");
    showView("home");
  } catch (err) {
    console.error(err);
    toast("インポートに失敗しました（不正なファイル）");
  }
  e.target.value = "";
});

$("#btn-reset").addEventListener("click", async () => {
  if (!confirm("すべてのデータを削除します。よろしいですか？")) return;
  if (!confirm("本当に削除しますか？この操作は取り消せません。")) return;
  resetAll();
  try { await clearExerciseVideos(); } catch (err) { console.error(err); }
  toast("データを削除しました");
  showView("home");
});

/* ================= 起動 ================= */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

initCloudSync({
  getState: () => state,
  onStatus: updateCloudUI,
  applyState: remoteState => {
    replaceStateFromCloud(remoteState);
    showView(ui.view);
  },
  onConflict: info => {
    const describe = summary => summary
      ? `筋トレ ${summary.workoutDays}日・食事 ${summary.mealDays}日・体組成 ${summary.bodyDays}日・ラン ${summary.runDays}日${summary.latestDate ? `（最終 ${summary.latestDate}）` : ""}`
      : "保存データなし";

    if (!info.remoteExists) {
      return confirm(
        `この端末には別アカウントの記録があります。\n\nこの端末：${describe(info.local)}\n\nこの記録を現在のアカウントへ保存しますか？`
      ) ? "local" : "cancel";
    }

    const useCloud = confirm(
      `この端末とクラウドの両方に別の記録があります。\n\nクラウド：${describe(info.remote)}\nこの端末：${describe(info.local)}\n\n「OK」：クラウドの記録をこの端末へ復元\n「キャンセル」：次の確認へ進む`
    );
    if (useCloud) return "cloud";
    return confirm(
      "この端末の記録でクラウドを置き換えますか？\nクラウド側の現在の記録は復旧用バックアップを作成してから置き換えます。"
    ) ? "local" : "cancel";
  },
}).catch(error => {
  console.error("cloud sync initialization failed", error);
});

showView("home");
