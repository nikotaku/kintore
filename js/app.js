import { state, save, resetAll, exportJSON, importJSON, uid } from "./store.js";
import { FOOD_DB, MEAL_TYPES, VOLUME_COMPARES } from "./data.js";
import { dkey, parseKey, todayKey, addDays, fmtDateJP, estimate1RM, round1, esc, el } from "./util.js";
import { lineChart, barChart } from "./charts.js";

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
  workoutDate: todayKey(),    // ワークアウト詳細の対象日
  pickerDate: todayKey(),
  pickerFrom: "home",         // picker の戻り先
  pickerEdit: false,
};

const $ = sel => document.querySelector(sel);
const MONTH_EN = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

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
function closeModal() { $("#modal-backdrop").hidden = true; }
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
  return Object.keys(state.workouts).filter(k => dayVolume(k) > 0 || (state.workouts[k] || []).some(e => e.sets.length));
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
  document.querySelectorAll(".nav-item").forEach(b => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  window.scrollTo(0, 0);
  const renderers = { home: renderHome, history: renderHistory, meals: renderMeals, body: renderBody, settings: renderSettings, picker: renderPicker, workout: renderWorkout };
  renderers[name]?.();
}

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

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
      const row = el(`<button class="picker-item">
        <span>${esc(ex.name)} ${added ? '<span class="badge">✔ 追加済</span>' : ""}</span>
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
    const card = el(`<div class="ex-card">
      <div class="ex-card-head">
        <span>${esc(entryName(en))}</span>
        <span class="mv">
          <button data-act="up" title="上へ">∧</button>
          <button data-act="down" title="下へ">∨</button>
          <button data-act="del" class="del" title="削除">🗑</button>
        </span>
      </div>
      <div class="set-head"><span>セット</span><span style="text-align:center">重さ(kg)</span><span style="text-align:center">回数</span><span style="text-align:center">RM</span><span></span></div>
    </div>`);

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
  wrap.appendChild(el(`<h2 class="section-heading">${fmtDateJP(ui.historySelected)}</h2>`));
  if (!entries.length) {
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
function renderSettings() {
  $("#target-kcal").value = state.targets.kcal;
  $("#target-p").value = state.targets.p;
  $("#target-f").value = state.targets.f;
  $("#target-c").value = state.targets.c;
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

$("#btn-reset").addEventListener("click", () => {
  if (!confirm("すべてのデータを削除します。よろしいですか？")) return;
  if (!confirm("本当に削除しますか？この操作は取り消せません。")) return;
  resetAll();
  toast("データを削除しました");
  showView("home");
});

/* ================= 起動 ================= */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

showView("home");
