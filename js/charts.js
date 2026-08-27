// 依存ライブラリなしの軽量SVGチャート
const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// points: [{label, value}]
export function lineChart(container, points, { color = "#e8332a", unit = "" } = {}) {
  container.innerHTML = "";
  if (!points.length) {
    container.innerHTML = '<div class="chart-empty">データがありません</div>';
    return;
  }
  const W = Math.max(320, points.length * 44);
  const H = 200;
  const PAD = { l: 42, r: 14, t: 14, b: 30 };
  const vals = points.map(p => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.1; max += span * 0.1;

  const x = i => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = v => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });

  // 横グリッド線 + 目盛り
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    const gy = y(v);
    svg.appendChild(svgEl("line", { x1: PAD.l, y1: gy, x2: W - PAD.r, y2: gy, stroke: "#eee", "stroke-width": 1 }));
    const t = svgEl("text", { x: PAD.l - 6, y: gy + 4, "text-anchor": "end", "font-size": 10, fill: "#999" });
    t.textContent = v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v * 10) / 10;
    svg.appendChild(t);
  }

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  svg.appendChild(svgEl("path", { d, fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linejoin": "round" }));

  points.forEach((p, i) => {
    svg.appendChild(svgEl("circle", { cx: x(i), cy: y(p.value), r: 3.5, fill: color }));
    const t = svgEl("text", { x: x(i), y: H - 10, "text-anchor": "middle", "font-size": 9, fill: "#888" });
    t.textContent = p.label;
    svg.appendChild(t);
    const title = svgEl("title", {});
    title.textContent = `${p.label}: ${p.value}${unit}`;
    svg.lastChild.appendChild(title);
  });

  container.appendChild(svg);
  container.scrollLeft = container.scrollWidth; // 最新（右端）を表示
}

// bars: [{label, value}]
export function barChart(container, bars, { color = "#e8332a", unit = "" } = {}) {
  container.innerHTML = "";
  if (!bars.length || bars.every(b => b.value === 0)) {
    container.innerHTML = '<div class="chart-empty">データがありません</div>';
    return;
  }
  const W = Math.max(320, bars.length * 48);
  const H = 200;
  const PAD = { l: 42, r: 14, t: 14, b: 30 };
  const max = Math.max(...bars.map(b => b.value)) * 1.1 || 1;
  const bw = (W - PAD.l - PAD.r) / bars.length;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });

  for (let i = 0; i <= 3; i++) {
    const v = (max * i) / 3;
    const gy = PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
    svg.appendChild(svgEl("line", { x1: PAD.l, y1: gy, x2: W - PAD.r, y2: gy, stroke: "#eee", "stroke-width": 1 }));
    const t = svgEl("text", { x: PAD.l - 6, y: gy + 4, "text-anchor": "end", "font-size": 10, fill: "#999" });
    t.textContent = v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v);
    svg.appendChild(t);
  }

  bars.forEach((b, i) => {
    const h = (b.value / max) * (H - PAD.t - PAD.b);
    const rect = svgEl("rect", {
      x: PAD.l + i * bw + bw * 0.18,
      y: PAD.t + (H - PAD.t - PAD.b) - h,
      width: bw * 0.64,
      height: Math.max(h, b.value > 0 ? 2 : 0),
      rx: 3,
      fill: color,
    });
    const title = svgEl("title", {});
    title.textContent = `${b.label}: ${Math.round(b.value)}${unit}`;
    rect.appendChild(title);
    svg.appendChild(rect);
    const t = svgEl("text", { x: PAD.l + i * bw + bw / 2, y: H - 10, "text-anchor": "middle", "font-size": 9, fill: "#888" });
    t.textContent = b.label;
    svg.appendChild(t);
  });

  container.appendChild(svg);
  container.scrollLeft = container.scrollWidth; // 最新（右端）を表示
}
