// Small ink charts on the washi. Every function takes a 2D context and a box { x, y, w, h } in CSS pixels.
export const INK = '#101d38';
export const RED = '#c8402a';
export const BLUE = '#1b3f6b';
export const OCHRE = '#c3923f';
export const SAGE = '#6e8b6a';
export const FONT = "500 12.5px 'Zen Kaku Gothic New', system-ui, sans-serif";

export function text(g, s, x, y, { color = INK, align = 'left', font = FONT, base = 'alphabetic' } = {}) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = base;
  g.fillText(s, x, y);
}

// Label on the print with a small washi backing, so it reads over ink molecules.
export function tag(g, s, x, y, { color = INK, align = 'center' } = {}) {
  g.font = FONT;
  const w = g.measureText(s).width + 8;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.fillStyle = 'rgba(244,237,220,.9)';
  g.fillRect(left, y - 12, w, 17);
  text(g, s, left + 4, y, { color });
}

// Bars side by side. values in [0, max]. Optional second series is drawn as a hollow outline over the first.
export function bars(g, box, values, { max = 1, color = BLUE, other = null, otherColor = RED, labels = null, base = null } = {}) {
  const { x, y, w, h } = box;
  const n = values.length;
  const gap = 2;
  const bw = (w - gap * (n - 1)) / n;
  const foot = labels ? 14 : 0;
  const H = h - foot;
  g.fillStyle = 'rgba(16,29,56,.07)';
  g.fillRect(x, y, w, H);
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, values[i] / max));
    g.fillStyle = color;
    g.fillRect(x + i * (bw + gap), y + H * (1 - v), bw, H * v);
    if (other) {
      const o = Math.max(0, Math.min(1, other[i] / max));
      g.strokeStyle = otherColor;
      g.lineWidth = 1.8;
      g.strokeRect(x + i * (bw + gap) + 0.9, y + H * (1 - o), bw - 1.8, H * o);
    }
  }
  if (base !== null) {
    const v = y + H * (1 - base / max);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(x, v); g.lineTo(x + w, v); g.stroke();
    g.setLineDash([]);
  }
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x, y + H); g.lineTo(x + w, y + H); g.stroke();
  if (labels) labels.forEach((l, i) => { if (l) text(g, l, x + i * (bw + gap) + bw / 2, y + h - 2, { align: 'center' }); });
}

// An axes box. Returns mappers for data to pixels.
export function axes(g, box, { xmin, xmax, ymin, ymax, xlabel = '', ylabel = '', zero = true, logx = false, ticks = true }) {
  const { x, y, w, h } = box;
  const left = x + (ylabel ? 15 : 2);
  const bot = y + h - (xlabel ? 15 : 2);
  const W = x + w - left;
  const H = bot - y;
  const fx = (v) => left + ((logx ? Math.log(v / xmin) / Math.log(xmax / xmin) : (v - xmin) / (xmax - xmin)) * W);
  const fy = (v) => bot - ((v - ymin) / (ymax - ymin)) * H;
  g.fillStyle = 'rgba(16,29,56,.07)';
  g.fillRect(left, y, W, H);
  g.strokeStyle = INK;
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(left, y); g.lineTo(left, bot); g.lineTo(left + W, bot); g.stroke();
  if (zero && ymin < 0 && ymax > 0) {
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(left, fy(0)); g.lineTo(left + W, fy(0)); g.stroke();
    g.setLineDash([]);
  }
  if (ticks) {
    const f = (v) => (Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));
    text(g, f(ymax), left + 3, y + 11, { color: 'rgba(16,29,56,.7)', font: "500 11px 'Zen Kaku Gothic New', system-ui, sans-serif" });
    text(g, f(ymin), left + 3, bot - 3, { color: 'rgba(16,29,56,.7)', font: "500 11px 'Zen Kaku Gothic New', system-ui, sans-serif" });
    if (xlabel) {
      text(g, f(xmin), left, y + h - 2, { font: "500 11px 'Zen Kaku Gothic New', system-ui, sans-serif" });
      text(g, f(xmax), left + W, y + h - 2, { align: 'right', font: "500 11px 'Zen Kaku Gothic New', system-ui, sans-serif" });
    }
  }
  if (xlabel) text(g, xlabel, left + W / 2, y + h - 2, { align: 'center' });
  if (ylabel) {
    g.save();
    g.translate(x + 10, y + H / 2);
    g.rotate(-Math.PI / 2);
    text(g, ylabel, 0, 0, { align: 'center' });
    g.restore();
  }
  return { fx, fy, left, bot, W, H };
}

export function curve(g, a, pts, { color = RED, width = 2, dash = null } = {}) {
  g.strokeStyle = color;
  g.lineWidth = width;
  if (dash) g.setLineDash(dash);
  g.beginPath();
  let pen = false;
  for (const [u, v] of pts) {
    if (!Number.isFinite(v)) { pen = false; continue; }
    const px = a.fx(u);
    const py = Math.max(a.bot - a.H, Math.min(a.bot, a.fy(v)));
    if (pen) g.lineTo(px, py); else g.moveTo(px, py);
    pen = true;
  }
  g.stroke();
  g.setLineDash([]);
}

export function dot(g, a, u, v, { color = RED, r = 4 } = {}) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(a.fx(u), Math.max(a.bot - a.H, Math.min(a.bot, a.fy(v))), r, 0, 6.3);
  g.fill();
}

// A horizontal ledger bar: signed, centred on a zero line.
export function ledgerBar(g, x, y, w, h, value, max, color) {
  const mid = x + w / 2;
  const len = (Math.max(-max, Math.min(max, value)) / max) * (w / 2);
  g.fillStyle = color;
  g.fillRect(Math.min(mid, mid + len), y, Math.abs(len), h);
}
