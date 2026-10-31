// Hard disks: two big ones and many crowders. No energy anywhere, only the rule that disks cannot overlap.
import { makeRandom } from './mbwater.js';

export class Disks {
  constructor({ L = 30, big = 2.4, small = 0.8, nSmall = 200, seed = 5 } = {}) {
    this.L = L;
    this.big = big;
    this.small = small;
    this.rand = makeRandom(seed);
    this.bx = [L * 0.3, L * 0.7];
    this.by = [L * 0.5, L * 0.5];
    this.held = -1;
    this.step = 0.6;
    this.bstep = 0.18;
    this.setCrowd(nSmall);
  }

  // Crowders start on a shuffled triangular lattice, which reaches densities random insertion cannot.
  setCrowd(n) {
    const { L, rand } = this;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.next = new Int32Array(n);
    this.cs = Math.max(2 * this.small + 0.01, 2);
    this.nc = Math.floor(L / this.cs);
    this.cs = L / this.nc;
    this.head = new Int32Array(this.nc * this.nc).fill(-1);
    const a = 2 * this.small * 1.005;
    const sites = [];
    const rows = Math.floor(L / (a * 0.8660254));
    const h = L / rows;
    for (let r = 0; r < rows; r++) {
      const cols = Math.floor(L / a);
      for (let c = 0; c < cols; c++) sites.push([(c + (r % 2 ? 0.5 : 0)) * (L / cols), r * h]);
    }
    for (let i = sites.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [sites[i], sites[j]] = [sites[j], sites[i]];
    }
    this.n = 0;
    for (const [x, y] of sites) {
      if (this.n >= n) break;
      if (this.freeSmall(-1, x, y)) {
        this.x[this.n] = x; this.y[this.n] = y;
        this.add(this.n);
        this.n++;
      }
    }
  }

  cell(x, y) { return Math.min(this.nc - 1, Math.floor(x / this.cs)) + Math.min(this.nc - 1, Math.floor(y / this.cs)) * this.nc; }

  add(i) { const c = this.cell(this.x[i], this.y[i]); this.next[i] = this.head[c]; this.head[c] = i; }

  remove(i) {
    const c = this.cell(this.x[i], this.y[i]);
    if (this.head[c] === i) { this.head[c] = this.next[i]; return; }
    let k = this.head[c];
    while (this.next[k] !== i) k = this.next[k];
    this.next[k] = this.next[i];
  }

  gap(a, b) { const { L } = this; const d = a - b; return d - L * Math.round(d / L); }

  freeSmall(i, x, y) {
    const { L, small, big, nc, cs, head, next } = this;
    const dd = 4 * small * small;
    const bb = (small + big) ** 2;
    for (let k = 0; k < 2; k++) {
      const dx = this.gap(x, this.bx[k]), dy = this.gap(y, this.by[k]);
      if (dx * dx + dy * dy < bb) return false;
    }
    const gx = Math.min(nc - 1, Math.floor(x / cs));
    const gy = Math.min(nc - 1, Math.floor(y / cs));
    for (let oy = -1; oy <= 1; oy++) {
      const ky = (gy + oy + nc) % nc;
      for (let ox = -1; ox <= 1; ox++) {
        const kx = (gx + ox + nc) % nc;
        for (let j = head[kx + ky * nc]; j >= 0; j = next[j]) {
          if (j === i) continue;
          const dx = this.gap(x, this.x[j]), dy = this.gap(y, this.y[j]);
          if (dx * dx + dy * dy < dd) return false;
        }
      }
    }
    return L > 0;
  }

  freeBig(k, x, y) {
    const { big, small, n } = this;
    const o = 1 - k;
    const dx = this.gap(x, this.bx[o]), dy = this.gap(y, this.by[o]);
    if (dx * dx + dy * dy < 4 * big * big) return false;
    const bb = (small + big) ** 2;
    for (let i = 0; i < n; i++) {
      const ax = this.gap(x, this.x[i]), ay = this.gap(y, this.y[i]);
      if (ax * ax + ay * ay < bb) return false;
    }
    return true;
  }

  sweep(count = 1) {
    const { L, rand, step, bstep } = this;
    for (let c = 0; c < count; c++) {
      for (let k = 0; k < this.n; k++) {
        const i = Math.floor(rand() * this.n);
        let x = this.x[i] + (rand() - 0.5) * 2 * step;
        let y = this.y[i] + (rand() - 0.5) * 2 * step;
        if (x < 0) x += L; else if (x >= L) x -= L;
        if (y < 0) y += L; else if (y >= L) y -= L;
        if (this.freeSmall(i, x, y)) { this.remove(i); this.x[i] = x; this.y[i] = y; this.add(i); }
      }
      for (let k = 0; k < 2; k++) {
        if (k === this.held || this.frozen) continue;
        for (let q = 0; q < 4; q++) {
          let x = this.bx[k] + (rand() - 0.5) * 2 * bstep;
          let y = this.by[k] + (rand() - 0.5) * 2 * bstep;
          if (x < 0) x += L; else if (x >= L) x -= L;
          if (y < 0) y += L; else if (y >= L) y -= L;
          if (this.freeBig(k, x, y)) { this.bx[k] = x; this.by[k] = y; }
        }
      }
    }
  }

  // The force on the two big disks along the line between them, read from crowders in a thin skin.
  // A hard wall feels kT times the crowder density at contact, so counting skin crowders by side gives the
  // push on each disk. Positive pushes the disks apart. In units of kT per unit length.
  skinForce(skin = 0.07) {
    const R = this.big + this.small;
    const lim = (R + skin) ** 2;
    let ax = this.gap(this.bx[1], this.bx[0]);
    let ay = this.gap(this.by[1], this.by[0]);
    const d = Math.hypot(ax, ay) || 1;
    ax /= d; ay /= d;
    let a = 0, b = 0;
    for (let i = 0; i < this.n; i++) {
      for (let k = 0; k < 2; k++) {
        const dx = this.gap(this.x[i], this.bx[k]);
        const dy = this.gap(this.y[i], this.by[k]);
        const r2 = dx * dx + dy * dy;
        if (r2 >= lim) continue;
        const r = Math.sqrt(r2);
        const c = (dx * ax + dy * ay) / r;
        if (k === 0) a -= c; else b -= c;
      }
    }
    return (b - a) / 2 / skin;
  }

  distance() { return Math.hypot(this.gap(this.bx[0], this.bx[1]), this.gap(this.by[0], this.by[1])); }

  // The hand sets a big disk down at (x, y). Crowders in its way go straight out; if that spot is taken they
  // look round the disk, then anywhere in the box. No crowder may stay overlapped: a hard disk left inside
  // another would push from the wrong side for ever, so this keeps looking until each one has a place.
  freeBigShoving(k, x, y) {
    const { big, small, n, L, rand } = this;
    const bb = (small + big) ** 2;
    const out = small + big + 0.02;
    for (let i = 0; i < n; i++) {
      const ax = this.gap(this.x[i], x), ay = this.gap(this.y[i], y);
      const r2 = ax * ax + ay * ay;
      if (r2 >= bb) continue;
      const r = Math.sqrt(r2) || 0.01;
      let nx = (x + (ax / r) * out + L) % L;
      let ny = (y + (ay / r) * out + L) % L;
      let tries = 0;
      while (!this.freeSmall(i, nx, ny) || this.gap(nx, x) ** 2 + this.gap(ny, y) ** 2 < bb) {
        tries++;
        if (tries < 300) {
          const a = rand() * 2 * Math.PI;
          const q = out + rand() * 2;
          nx = (x + q * Math.cos(a) + L) % L;
          ny = (y + q * Math.sin(a) + L) % L;
        } else {
          nx = rand() * L;
          ny = rand() * L;
        }
      }
      this.remove(i);
      this.x[i] = nx;
      this.y[i] = ny;
      this.add(i);
    }
    return true;
  }

  // Crowders inside a big disk. Always zero, unless something is wrong.
  overlaps() {
    const bb = (this.small + this.big) ** 2;
    let c = 0;
    for (let i = 0; i < this.n; i++) {
      for (let k = 0; k < 2; k++) {
        const dx = this.gap(this.x[i], this.bx[k]), dy = this.gap(this.y[i], this.by[k]);
        if (dx * dx + dy * dy < bb - 1e-9) c++;
      }
    }
    return c;
  }
}
