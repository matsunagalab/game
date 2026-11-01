// Things several chapters share.
export { Tank, Pour, fieldOf, sigmaLevel, placeInk } from '../tank.js';
export { Board } from '../board.js';
export const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

// The end of every chapter: a new case, answer then reason. The third drop needs both right first time.
export async function check(run, questions, tags = ['paper']) {
  run.ui.tags(...tags);
  let all = true;
  for (const q of questions) {
    const first = await run.choose(q.q, q.options);
    if (!first) all = false;
  }
  if (all) run.reach(3);
  return all;
}

// The glass plate behind a board's panel. Older Safari has no roundRect.
export function plate(g, { x, y, w, h }) {
  g.fillStyle = 'rgba(250, 250, 247, .62)';
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, 14); else g.rect(x, y, w, h);
  g.fill();
}

// A small chart on the card, drawn at the screen's real resolution.
export function chart({ height = 86 } = {}) {
  const c = document.createElement('canvas');
  c.className = 'chart';
  c.style.height = `${height}px`;
  const prep = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth || 300, h = height;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    g.font = '500 12px "Ysabeau Office", sans-serif';
    return { g, w, h };
  };
  c.bars = (bars, { max = 1, line = null, unit = '' } = {}) => {
    const { g, w, h } = prep(), n = bars.length, gap = 8, bw = (w - gap * (n - 1)) / Math.max(n, 1), base = h - 16;
    g.textAlign = 'center';
    bars.forEach((b, i) => {
      const v = Math.max(0, b.value) / max, x = i * (bw + gap), top = base - v * (base - 14);
      g.fillStyle = b.color ?? '#2336a8';
      g.globalAlpha = 0.86; g.fillRect(x, top, bw, Math.max(1.5, base - top)); g.globalAlpha = 1;
      g.fillStyle = '#1d2141'; if (b.text) g.fillText(b.text, x + bw / 2, top - 3);
      g.fillStyle = '#565c7c'; g.fillText(b.label ?? '', x + bw / 2, h - 3);
    });
    if (line !== null) { const y = base - (line / max) * (base - 14); g.strokeStyle = '#c2185b'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.setLineDash([]); }
    void unit;
  };
  // series: [{ y: [...], x: [...], color, dash }]. Axes run from the data's own range unless given.
  c.lines = (series, { x0, x1, y0, y1, xlabel = '', ylabel = '', logx = false } = {}) => {
    const { g, w, h } = prep(), L = 4, B = 15, T = 5, R = 4;
    const xs = series.flatMap((s) => s.x), ys = series.flatMap((s) => s.y);
    const a = x0 ?? Math.min(...xs), b = x1 ?? Math.max(...xs), lo = y0 ?? Math.min(...ys), hi = y1 ?? Math.max(...ys);
    const fx = (v) => L + (w - L - R) * (logx ? Math.log(v / a) / Math.log(b / a) : (v - a) / (b - a || 1)), fy = (v) => h - B - (h - B - T) * ((v - lo) / (hi - lo || 1));
    g.strokeStyle = 'rgba(29,33,65,.2)'; g.beginPath(); g.moveTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
    for (const s of series) {
      g.strokeStyle = s.color ?? '#2336a8'; g.lineWidth = s.width ?? 2; g.setLineDash(s.dash ?? []);
      g.beginPath();
      s.y.forEach((v, i) => { const X = fx(s.x[i]), Y = fy(Math.min(hi, Math.max(lo, v))); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
      g.stroke(); g.setLineDash([]);
    }
    g.fillStyle = '#565c7c'; g.textAlign = 'left'; g.fillText(xlabel, L, h - 2);
    g.textAlign = 'right'; g.fillText(ylabel, w - R, 11);
  };
  return c;
}
