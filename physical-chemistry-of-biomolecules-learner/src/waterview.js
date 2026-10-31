// Draws a live MBWater as ink: smooths the jittery Monte Carlo positions, lights arms that are bonded,
// and reports each new bond so the koto can play it.
const SUMI = [0.075, 0.095, 0.165];
const SHELL = [0.09, 0.27, 0.53];
const RED = [0.80, 0.21, 0.11];

export class WaterView {
  constructor(w, bench) {
    this.w = w;
    this.b = bench;
    const { n } = w;
    this.sx = Float64Array.from(w.x);
    this.sy = Float64Array.from(w.y);
    this.st = Float64Array.from(w.t);
    this.lit = new Float32Array(n * 3);
    this.bond = new Int32Array(n * 3).fill(-1);
    this.prev = new Int32Array(n * 3).fill(-1);
    this.tint = new Float32Array(n); // 1 marks a shell water.
    this.fade = new Float32Array(n);
    this.count = 0;
    this.born = 0;
    this.rate = 0; // Bonds formed per second of play.
    this.onBond = null;
    this.bondLines = true;
    this.tile = 1;
    this.shift = [0, 0];
  }

  update(dt) {
    const { w, sx, sy, st, lit, bond, prev } = this;
    const { n, L } = w;
    const k = 1 - Math.exp(-dt / 0.085);
    const third = (2 * Math.PI) / 3;
    for (let i = 0; i < n; i++) {
      let dx = w.x[i] - sx[i];
      let dy = w.y[i] - sy[i];
      dx -= L * Math.round(dx / L);
      dy -= L * Math.round(dy / L);
      sx[i] += dx * k;
      sy[i] += dy * k;
      sx[i] -= L * Math.floor(sx[i] / L);
      sy[i] -= L * Math.floor(sy[i] / L);
      // Three-fold symmetry: turn by the shortest way, so arms do not spin through 120 degrees.
      let da = w.t[i] - st[i];
      da -= third * Math.round(da / third);
      st[i] += da * k;
      this.tint[i] += (this.fade[i] - this.tint[i]) * Math.min(1, dt * 7);
    }
    prev.set(bond);
    this.count = w.bonds(bond);
    let fresh = 0;
    const rise = Math.min(1, dt * 10);
    for (let a = 0; a < n * 3; a++) {
      const on = bond[a] >= 0 ? 1 : 0;
      lit[a] += (on - lit[a]) * rise;
      if (on && prev[a] < 0) fresh++;
    }
    fresh = Math.floor(fresh / 2);
    this.born += fresh;
    this.rate += (fresh / Math.max(dt, 1e-3) - this.rate) * Math.min(1, dt * 1.2);
    if (fresh && this.onBond) this.onBond(fresh);
  }

  // The arm index of a stored angle is fixed, because st is turned by remainders of 120 degrees only
  // when drawing. The Monte Carlo angle and the drawn angle can differ by a whole third, so match them.
  armLit(i, k, st) {
    const { w, lit } = this;
    const third = (2 * Math.PI) / 3;
    const off = Math.round((st - w.t[i]) / third);
    return lit[i * 3 + (((k + off) % 3) + 3) % 3];
  }

  draw(r, size = 0.58) {
    const { b, w, sx, sy, st } = this;
    const s = b.scale;
    const R = size * s;
    const { L, n } = w;
    // Bonds first, under the bodies.
    if (this.bondLines && n < 400) {
      for (let i = 0; i < n; i++) {
        for (let a = 0; a < 3; a++) {
          const j = this.bond[i * 3 + a];
          if (j <= i) continue;
          let dx = sx[j] - sx[i];
          let dy = sy[j] - sy[i];
          dx -= L * Math.round(dx / L);
          dy -= L * Math.round(dy / L);
          const [ax, ay] = b.px(sx[i], sy[i]);
          this.each(ax, ay, L * s, (x, y) => r.line(x, y, x + dx * s, y + dy * s, Math.max(1.4, s * 0.05), RED, 0.42));
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = b.px(sx[i], sy[i]);
      const f = this.tint[i];
      const cr = SUMI[0] + (SHELL[0] - SUMI[0]) * f;
      const cg = SUMI[1] + (SHELL[1] - SUMI[1]) * f;
      const cb = SUMI[2] + (SHELL[2] - SUMI[2]) * f;
      const a = st[i];
      const l0 = this.armLit(i, 0, a), l1 = this.armLit(i, 1, a), l2 = this.armLit(i, 2, a);
      this.each(x, y, L * s, (px, py) => r.water(px, py, a, R, cr, cg, cb, 1, l0, l1, l2));
    }
  }

  // Draw once, and again wherever the periodic image also shows in the print.
  each(x, y, size, put) {
    const { tile } = this;
    const t = this.b.game.tank;
    const pad = this.b.scale * 1.1;
    if (tile > 1) {
      // Title screen: fill the whole window with images of the box.
      const W = innerWidth, H = innerHeight;
      const x0 = ((x % size) + size) % size;
      const y0 = ((y % size) + size) % size;
      for (let u = x0 - size; u < W + pad; u += size) {
        for (let v = y0 - size; v < H + pad; v += size) put(u, v);
      }
      return;
    }
    put(x, y);
    const left = x - t.x < pad, right = t.x + t.s - x < pad, top = y - t.y < pad, bot = t.y + t.s - y < pad;
    if (left) put(x + size, y);
    if (right) put(x - size, y);
    if (top) put(x, y + size);
    if (bot) put(x, y - size);
    if (left && top) put(x + size, y + size);
    if (right && top) put(x - size, y + size);
    if (left && bot) put(x + size, y - size);
    if (right && bot) put(x - size, y - size);
  }
}

// Orientation of a water relative to the line from a centre: 0 means an arm points straight out,
// 1 means an arm points straight in. Folded by the threefold symmetry of the molecule.
export function foldAngle(th, ux, uy) {
  const third = (2 * Math.PI) / 3;
  const phi = Math.atan2(uy, ux);
  let a = (((th - phi) % third) + third) % third;
  if (a > Math.PI / 3) a = third - a;
  return a / (Math.PI / 3);
}

export const entropyOf = (hist) => {
  const total = hist.reduce((s, v) => s + v, 0);
  if (!total) return 0;
  const n = hist.length;
  return hist.reduce((s, v) => (v > 0 ? s - (v / total) * Math.log((v / total) * n) : s), 0);
};

// Counts waters and their orientations in a ring around a point, as a running tally.
export class Ring {
  constructor(r0, r1, bins = 12) {
    this.r0 = r0;
    this.r1 = r1;
    this.hist = new Array(bins).fill(0);
    this.bonds = 0;
    this.waters = 0;
    this.frames = 0;
    this.members = [];
  }

  // Wipes the tally.
  reset() { this.hist.fill(0); this.bonds = 0; this.waters = 0; this.frames = 0; }

  // A copy of the tally, so a control run can be measured and the first result put back whole.
  save() { return { hist: this.hist.slice(), bonds: this.bonds, waters: this.waters, frames: this.frames }; }

  restore(k) { this.hist = k.hist.slice(); this.bonds = k.bonds; this.waters = k.waters; this.frames = k.frames; }

  sample(w, cx, cy, bond, mark = null) {
    const { n, L } = w;
    const { hist, r0, r1 } = this;
    const nb = hist.length;
    this.frames++;
    for (let i = 0; i < n; i++) {
      let dx = w.x[i] - cx;
      let dy = w.y[i] - cy;
      dx -= L * Math.round(dx / L);
      dy -= L * Math.round(dy / L);
      const r2 = dx * dx + dy * dy;
      if (r2 < r0 * r0 || r2 >= r1 * r1) continue;
      const r = Math.sqrt(r2);
      hist[Math.min(nb - 1, Math.floor(foldAngle(w.t[i], dx / r, dy / r) * nb))]++;
      this.waters++;
      for (let a = 0; a < 3; a++) if (bond[3 * i + a] >= 0) this.bonds++;
      if (mark) mark[i] = 1;
    }
  }

  get perWater() { return this.waters ? this.bonds / this.waters : 0; }

  get meanCount() { return this.frames ? this.waters / this.frames : 0; }

  get entropy() { return entropyOf(this.hist); }

  // How many of the equal orientation slots are in effective use.
  get open() { return this.hist.length * Math.exp(this.entropy); }
}
