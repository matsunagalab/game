// A flat chart drawn over the plate, in the same inks: white is the reference, gold is yours.
const FONT = '"Old Standard TT", "STIX Greek", Georgia, serif';
export const INKS = { white: '#eaf3f4', dim: 'rgba(234,243,244,.62)', faint: 'rgba(234,243,244,.2)', gold: '#f0bb45', red: '#ff8a70', aqua: '#63e6da' };

export class Panel {
  constructor() {
    this.cv = document.getElementById('panel');
    this.ctx = this.cv.getContext('2d');
    this.rect = { x: 0, y: 0, w: 0, h: 0 };
    this.size();
    this.wipe();
  }
  size() {
    const d = Math.min(devicePixelRatio || 1, 2), w = innerWidth, h = innerHeight;
    if (this.cv.width !== w * d || this.cv.height !== h * d) { this.cv.width = w * d; this.cv.height = h * d; }
    this.d = d;
  }
  place(rect) { this.size(); this.rect = rect; }
  wipe() { const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height); }
  begin() { this.size(); this.wipe(); const c = this.ctx; c.setTransform(this.d, 0, 0, this.d, 0, 0); return c; }

  // Maps data to the rectangle, leaving room for the axis labels.
  axes({ x0, x1, y0, y1, xlabel, ylabel, xticks = [], yticks = [], inset = [34, 8, 28, 18] }) {
    const { x, y, w, h } = this.rect, [l, t, b, r] = [inset[0], inset[1], inset[2], inset[3]];
    const X = v => x + l + (v - x0) / (x1 - x0) * (w - l - r), Y = v => y + h - b - (v - y0) / (y1 - y0) * (h - t - b);
    const c = this.ctx;
    c.strokeStyle = INKS.faint; c.lineWidth = 1; c.fillStyle = INKS.dim; c.font = `12px ${FONT}`;
    c.beginPath(); c.moveTo(X(x0), Y(y1)); c.lineTo(X(x0), Y(y0)); c.lineTo(X(x1), Y(y0)); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (const v of xticks) { c.fillText(String(v), X(v), Y(y0) + 4); c.beginPath(); c.moveTo(X(v), Y(y0)); c.lineTo(X(v), Y(y0) + 3); c.stroke(); }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (const v of yticks) c.fillText(String(v), X(x0) - 4, Y(v));
    c.font = `italic 13px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    if (xlabel) c.fillText(xlabel, X((x0 + x1) / 2), y + h - 1);
    if (ylabel) { c.save(); c.translate(x + 11, Y((y0 + y1) / 2)); c.rotate(-Math.PI / 2); c.fillText(ylabel, 0, 0); c.restore(); }
    return { X, Y };
  }
  line(pts, { color = INKS.gold, width = 2.2, dash = null, glow = 6 } = {}) {
    const c = this.ctx;
    c.save(); c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.shadowColor = color; c.shadowBlur = glow;
    if (dash) c.setLineDash(dash);
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.stroke(); c.restore();
  }
  dots(pts, { color = INKS.white, r = 2.6 } = {}) {
    const c = this.ctx;
    c.fillStyle = color;
    for (const p of pts) { c.beginPath(); c.arc(p[0], p[1], r, 0, 6.2832); c.fill(); }
  }
  text(s, x, y, { color = INKS.white, size = 13, align = 'left', italic = true } = {}) {
    const c = this.ctx;
    c.font = `${italic ? 'italic ' : ''}${size}px ${FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(7,27,63,.95)'; c.shadowBlur = 4;
    c.fillText(s, x, y);
    c.shadowBlur = 0;
  }
  // An n×m field stored in a small offscreen canvas, stretched to fit, smoothed by the browser.
  heat(field, n, m, rect, colour) {
    if (!this.off || this.off.width !== n || this.off.height !== m) {
      this.off = document.createElement('canvas'); this.off.width = n; this.off.height = m;
      this.offCtx = this.off.getContext('2d'); this.img = this.offCtx.createImageData(n, m);
    }
    const d = this.img.data;
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
      const q = 4 * (i + n * (m - 1 - j)), [r, g, b, a = 255] = colour(field[i + n * j]);
      d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = a;
    }
    this.offCtx.putImageData(this.img, 0, 0);
    const c = this.ctx;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(this.off, rect.x, rect.y, rect.w, rect.h);
  }
}

// Cool paper-blue through to warm gold, for energies and populations.
export function ramp(t) {
  t = Math.max(0, Math.min(1, t));
  const s = [[10, 34, 84], [24, 84, 150], [120, 190, 214], [240, 214, 140], [250, 170, 70]];
  const f = t * (s.length - 1), i = Math.min(s.length - 2, f | 0), u = f - i;
  return [0, 1, 2].map(k => s[i][k] + (s[i + 1][k] - s[i][k]) * u);
}
// Diverging: red below zero, paper at zero, aqua above.
export function diverge(v) {
  const t = Math.max(-1, Math.min(1, v)), a = Math.abs(t) ** 0.8;
  const n = [12, 38, 92], c = t < 0 ? [255, 122, 102] : [99, 230, 218];
  return [0, 1, 2].map(k => n[k] + (c[k] - n[k]) * a);
}
