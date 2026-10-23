// 日付ユーティリティ（すべてローカルタイム基準の YYYY-MM-DD キー）
export function dkey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return dkey(new Date());
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dkey(d);
}

export function fmtDateJP(key) {
  const d = parseKey(key);
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} (${w})`;
}

// O'Conner式 推定1RM（参考アプリと同じ: 60kg×10回 → 75.0kg）
export function estimate1RM(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps <= 1) return weight;
  return weight * (1 + 0.025 * reps);
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
