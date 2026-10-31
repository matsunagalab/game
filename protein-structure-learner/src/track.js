// The zipper: every residue twice, its C=O along the top rail and its N-H along the bottom rail.
// A hydrogen bond is a line between the rails, so a helix prints as slanted teeth and a ladder as a fan.
import { $ } from './ui.js';
import { classOf } from './proteins.js';

const RED = '#f0402a';
const BLUE = '#1f2aa6';
const PINK = '#ff4a9e';
const YELLOW = '#ffd21f';
const ORANGE = '#ff9a1f';
export const GAP_INK = { 3: BLUE, 4: PINK, 5: ORANGE };
export const SS_INK = { H: PINK, G: BLUE, I: ORANGE, E: YELLOW, C: 'rgba(31,42,166,.12)' };

export class Track {
  // cols: [{ i, aa, label }, or null for a break between two strands]
  constructor(layer, hooks = {}) {
    this.hooks = hooks;
    this.el = $('div', 'track');
    this.canvas = $('canvas');
    this.el.append(this.canvas);
    layer.append(this.el);
    this.cols = [];
    this.lines = [];
    this.marks = new Map(); // key `${rail}${i}` -> ink, for free groups
    this.paint = null; // residue index -> letter, for the reader
    this.lightCol = null;
    this.reading = '';
    this.bar = null;
    this.drag = null;
    const g = (this.g = this.canvas.getContext('2d'));
    void g;
    this.bind();
  }

  setCols(cols) {
    this.cols = cols;
    this.lines = [];
    this.marks.clear();
    this.paint = null;
    this.drag = null;
    this.layout();
  }

  layout(w = this.el.clientWidth, h = this.el.clientHeight) {
    const r = Math.min(2, devicePixelRatio || 1);
    this.ratio = r;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.max(1, w * r);
    this.canvas.height = Math.max(1, h * r);
    const n = this.cols.length || 1;
    const pad = 8;
    this.cw = (w - pad * 2) / n;
    this.pad = pad;
    this.top = 48; // centre of the upper letters
    this.bottom = h - 15; // centre of the lower letters
    this.railA = this.top + 18;
    this.railB = this.bottom - 18;
  }

  xOf(pos) {
    return this.pad + (pos + 0.5) * this.cw;
  }

  colOf(i) {
    return this.cols.findIndex((c) => c && c.i === i);
  }

  near(x) {
    let best = -1;
    let d = 1e9;
    this.cols.forEach((c, k) => {
      if (!c) return;
      const dx = Math.abs(this.xOf(k) - x);
      if (dx < d) {
        d = dx;
        best = k;
      }
    });
    return this.cols[best]?.i ?? null;
  }

  bind() {
    const point = (e) => {
      const r = this.el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const rail = (y) => (y < this.h * 0.55 ? 'O' : 'H');
    this.el.addEventListener('pointerdown', (e) => {
      const p = point(e);
      if (p.y < 22) return;
      const i = this.near(p.x);
      if (i === null) return;
      e.preventDefault();
      this.el.setPointerCapture?.(e.pointerId);
      this.drag = { rail: rail(p.y), i, x: p.x, y: p.y, moved: false, sx: p.x, sy: p.y };
      this.hooks.down?.(this.drag.rail, i);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const p = point(e);
      this.drag.x = p.x;
      this.drag.y = p.y;
      if (Math.hypot(p.x - this.drag.sx, p.y - this.drag.sy) > 6) this.drag.moved = true;
      this.hooks.move?.(this.drag, this.near(p.x), rail(p.y));
    });
    const up = (e) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      const p = point(e);
      this.hooks.up?.(d, this.near(p.x), rail(p.y));
    };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', () => {
      this.drag = null;
      this.hooks.cancel?.();
    });
  }

  // A residue's letter tile, tinted by the assignment when the reader paints it.
  tile(g, x, y, c, bright) {
    const w = Math.min(this.cw - 2, 26);
    const paint = this.paint?.get(c.i);
    g.fillStyle = paint ? SS_INK[paint] : bright ? BLUE : 'rgba(255,255,255,.72)';
    g.beginPath();
    g.roundRect(x - w / 2, y - 11, w, 22, 5);
    g.fill();
    const onDark = paint === 'H' || paint === 'G' || bright;
    g.fillStyle = onDark ? '#fff' : BLUE;
    g.font = `800 ${Math.min(14, this.cw * 0.62)}px Bricolage, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(c.aa, x, y + 0.5);
  }

  peg(g, x, y, kind, free, on) {
    const r = Math.min(5.5, this.cw * 0.26);
    g.beginPath();
    g.arc(x, y, on ? r + 2.5 : r, 0, 7);
    g.fillStyle = kind === 'O' ? RED : '#fff';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = BLUE;
    g.stroke();
    if (free) {
      g.beginPath();
      g.arc(x, y, r + 5, 0, 7);
      g.strokeStyle = free;
      g.lineWidth = 3;
      g.stroke();
    }
  }

  line(g, x0, y0, x1, y1, ink, grow = 1, faint = false) {
    const xe = x0 + (x1 - x0) * grow;
    const ye = y0 + (y1 - y0) * grow;
    g.lineCap = 'round';
    if (!faint) {
      g.lineWidth = 6;
      g.strokeStyle = '#fff';
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(xe, ye);
      g.stroke();
    }
    g.lineWidth = faint ? 2.5 : 3.5;
    g.strokeStyle = ink;
    g.setLineDash(faint ? [3, 7] : []);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(xe, ye);
    g.stroke();
    g.setLineDash([]);
  }

  draw(dt = 0) {
    const { g, ratio, w, h } = this;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, w, h);
    // The reading strip along the top: energy, with the -0.5 line to cross.
    if (this.bar) this.drawBar(g);
    g.textBaseline = 'middle';
    for (const l of this.lines) {
      if (l.t === undefined) l.t = 0;
      l.t = Math.min(1, l.t + dt / 0.18);
      const a = this.colOf(l.a);
      const d = this.colOf(l.d);
      if (a < 0 || d < 0) continue;
      this.line(g, this.xOf(a), this.railA, this.xOf(d), this.railB, l.ink ?? GAP_INK[l.d - l.a] ?? BLUE, l.t);
    }
    if (this.preview) {
      const { a, d, ok } = this.preview;
      const ca = this.colOf(a);
      const cd = this.colOf(d);
      if (ca >= 0 && cd >= 0) this.line(g, this.xOf(ca), this.railA, this.xOf(cd), this.railB, ok ? PINK : 'rgba(31,42,166,.7)', 1, !ok);
    }
    if (this.drag?.moved && !this.preview) {
      const c = this.colOf(this.drag.i);
      this.line(g, this.xOf(c), this.drag.rail === 'O' ? this.railA : this.railB, this.drag.x, this.drag.y, 'rgba(31,42,166,.5)', 1, true);
    }
    this.cols.forEach((c, k) => {
      const x = this.xOf(k);
      if (!c) {
        g.strokeStyle = 'rgba(31,42,166,.35)';
        g.lineWidth = 2;
        g.setLineDash([2, 5]);
        g.beginPath();
        g.moveTo(x, this.top - 10);
        g.lineTo(x, this.bottom + 10);
        g.stroke();
        g.setLineDash([]);
        return;
      }
      const lit = this.lightCol === c.i;
      const noH = c.noH;
      this.tile(g, x, this.top, c, lit);
      this.tile(g, x, this.bottom, c, lit);
      this.peg(g, x, this.railA, 'O', this.marks.get(`O${c.i}`), this.pegOn === `O${c.i}`);
      if (!noH) this.peg(g, x, this.railB, 'H', this.marks.get(`H${c.i}`), this.pegOn === `H${c.i}`);
      if (c.label) {
        g.fillStyle = BLUE;
        g.font = '700 10px Bricolage, sans-serif';
        g.textAlign = 'center';
        g.fillText(c.label, x, this.top - 16);
      }
    });
  }

  // bar: { e, text, off } e in kcal/mol, or null when nothing is held
  drawBar(g) {
    const { w } = this;
    const b = this.bar;
    const left = 8;
    const right = w - 8;
    const y = 23;
    const at = (e) => left + ((1 - Math.max(-4, Math.min(1, e))) / 5) * (right - left);
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.beginPath();
    g.roundRect(left, y - 4, right - left, 8, 4);
    g.fill();
    if (b.e !== null && b.e !== undefined && !b.off) {
      g.fillStyle = b.e < -0.5 ? PINK : BLUE;
      if (b.e < 0) {
        g.beginPath();
        g.roundRect(at(0), y - 4, Math.max(4, at(b.e) - at(0)), 8, 4);
        g.fill();
      }
      g.beginPath();
      g.arc(at(b.e), y, 7, 0, 7);
      g.fill();
    }
    g.fillStyle = BLUE;
    g.fillRect(at(-0.5) - 1, y - 7, 2.5, 14);
    g.font = '750 13px Bricolage, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(b.text ?? '', left, 8);
    g.textAlign = 'right';
    g.fillText('bond below −0.5', right, 8);
  }

  dispose() {
    this.el.remove();
  }
}

export const colsOf = (p, ranges) => {
  const cols = [];
  ranges.forEach(([a, b], s) => {
    if (s) cols.push(null);
    for (let i = a; i <= b; i++) cols.push({ i, aa: p.seq[i], noH: p.seq[i] === 'P', label: p.resno[i] % 5 === 0 ? String(p.resno[i]) : '' });
  });
  return cols;
};
void classOf;
