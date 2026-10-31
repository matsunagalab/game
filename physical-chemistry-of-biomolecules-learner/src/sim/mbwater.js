// Two-dimensional Mercedes-Benz water (Ben-Naim 1971; Silverstein, Haymet and Dill 1998).
// Each water is a disk with three arms 120 degrees apart. Energy units are one ideal hydrogen bond,
// lengths are one ideal bond length. Monte Carlo with Metropolis acceptance. No screen code here.

export const MB = {
  eHB: 1,        // Depth of an ideal hydrogen bond (the model writes it as eps_HB = -1).
  rHB: 1,        // Length of an ideal hydrogen bond.
  sigma: 0.085,  // Width of all three Gaussians.
  eLJ: 0.1,      // Lennard-Jones depth between waters.
  sLJ: 0.7,      // Lennard-Jones diameter between waters.
  rc: 2.5,       // Cut-off of the Lennard-Jones term.
};

const S2 = 2 * MB.sigma * MB.sigma;
const RC2 = MB.rc * MB.rc;
const SIG6 = MB.sLJ ** 6;
const TAU3 = (2 * Math.PI) / 3;
const HBNEAR = 1 - 0.6; // Beyond this distance from 1 the angular Gaussians are below 2e-5.
const RMIN2 = 0.4 * 0.4;
const RMAX2 = 1.6 * 1.6;

// The full sum over all nine arm pairs, as the model is written. Slow; used to check the fast version.
export function pairExact(xi, yi, ti, xj, yj, tj) {
  const dx = xj - xi;
  const dy = yj - yi;
  const r = Math.hypot(dx, dy);
  const ux = dx / r;
  const uy = dy / r;
  const sr6 = (MB.sLJ / r) ** 6;
  let e = 4 * MB.eLJ * (sr6 * sr6 - sr6);
  const g = (v) => Math.exp(-(v * v) / S2);
  for (let k = 0; k < 3; k++) {
    const ci = Math.cos(ti + k * TAU3) * ux + Math.sin(ti + k * TAU3) * uy;
    for (let l = 0; l < 3; l++) {
      const cj = Math.cos(tj + l * TAU3) * ux + Math.sin(tj + l * TAU3) * uy;
      e -= MB.eHB * g(r - MB.rHB) * g(ci - 1) * g(cj + 1);
    }
  }
  return e;
}

// Free energy of two waters at distance r in empty space, by exact quadrature over both angles.
// With bondsOnly it leaves out the Lennard-Jones part, so it can be added to a bondless fluid.
export function pairFree(r, T, { bondsOnly = false, N = 72 } = {}) {
  const third = (2 * Math.PI) / 3;
  const lj = bondsOnly ? pairExact(0, 0, Math.PI / 3, r, 0, Math.PI / 3) : 0;
  let z = 0;
  for (let a = 0; a < N; a++) for (let c = 0; c < N; c++) z += Math.exp(-(pairExact(0, 0, (a / N) * third, r, 0, (c / N) * third) - lj) / T);
  return -T * Math.log(z / (N * N));
}

// A tiny seeded generator, so that tools and tests are repeatable.
export function makeRandom(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MBWater {
  constructor({ n = 150, L = 13.3, T = 0.2, seed = 1, random = null } = {}) {
    this.n = n;
    this.L = L;
    this.T = T;
    this.rand = random ?? makeRandom(seed);
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.t = new Float64Array(n);
    this.cx = new Float64Array(n * 3); // Arm cosines, three per water.
    this.cy = new Float64Array(n * 3);
    this.solutes = []; // { x, y, s (LJ diameter to water), e (depth), hard (optional radius) }
    this.hb = 1; // 0 switches hydrogen bonds off and leaves plain Lennard-Jones disks.
    this.step = 0.16;
    this.turn = 0.5;
    this.tries = 0;
    this.takes = 0;
    this.cellHead = null;
    this.next = new Int32Array(n);
    this.cellOf = new Int32Array(n);
    this.grid(L);
    this.lattice();
  }

  grid(L) {
    this.nc = Math.max(3, Math.floor(L / MB.rc));
    this.cs = L / this.nc;
    this.cellHead = new Int32Array(this.nc * this.nc);
  }

  setArms(i, th) {
    const a = i * 3;
    this.t[i] = th;
    this.cx[a] = Math.cos(th); this.cy[a] = Math.sin(th);
    this.cx[a + 1] = Math.cos(th + TAU3); this.cy[a + 1] = Math.sin(th + TAU3);
    this.cx[a + 2] = Math.cos(th - TAU3); this.cy[a + 2] = Math.sin(th - TAU3);
  }

  // Start on a loose square lattice with random orientations.
  lattice() {
    const { n, L } = this;
    const m = Math.ceil(Math.sqrt(n));
    const d = L / m;
    for (let i = 0; i < n; i++) {
      this.x[i] = ((i % m) + 0.5) * d;
      this.y[i] = (Math.floor(i / m) + 0.5) * d;
      this.setArms(i, this.rand() * 2 * Math.PI);
    }
    this.rebuild();
  }

  rebuild() {
    const { n, L, nc, cs, cellHead, next, cellOf } = this;
    cellHead.fill(-1);
    for (let i = 0; i < n; i++) {
      this.x[i] -= L * Math.floor(this.x[i] / L);
      this.y[i] -= L * Math.floor(this.y[i] / L);
      let cx = Math.floor(this.x[i] / cs);
      let cy = Math.floor(this.y[i] / cs);
      if (cx >= nc) cx = nc - 1;
      if (cy >= nc) cy = nc - 1;
      const c = cx + cy * nc;
      cellOf[i] = c;
      next[i] = cellHead[c];
      cellHead[c] = i;
    }
  }

  // Move i to its own new cell, keeping the chains correct.
  relink(i) {
    const { nc, cs, cellHead, next, cellOf } = this;
    let cx = Math.floor(this.x[i] / cs);
    let cy = Math.floor(this.y[i] / cs);
    if (cx >= nc) cx = nc - 1;
    if (cy >= nc) cy = nc - 1;
    const c = cx + cy * nc;
    const old = cellOf[i];
    if (c === old) return;
    if (cellHead[old] === i) cellHead[old] = next[i];
    else {
      let k = cellHead[old];
      while (next[k] !== i) k = next[k];
      next[k] = next[i];
    }
    next[i] = cellHead[c];
    cellHead[c] = i;
    cellOf[i] = c;
  }

  // Energy of a water at (x, y) with arms (c0..c2), with everything except water i.
  energyAt(i, x, y, c0, s0, c1, s1, c2, s2) {
    const { L, nc, cs, cellHead, next, cx, cy } = this;
    const X = this.x;
    const Y = this.y;
    const half = L / 2;
    const { hb } = this;
    let e = 0;
    let gx = Math.floor(x / cs);
    let gy = Math.floor(y / cs);
    if (gx >= nc) gx = nc - 1;
    if (gy >= nc) gy = nc - 1;
    for (let oy = -1; oy <= 1; oy++) {
      let ky = gy + oy;
      if (ky < 0) ky += nc; else if (ky >= nc) ky -= nc;
      for (let ox = -1; ox <= 1; ox++) {
        let kx = gx + ox;
        if (kx < 0) kx += nc; else if (kx >= nc) kx -= nc;
        for (let j = cellHead[kx + ky * nc]; j >= 0; j = next[j]) {
          if (j === i) continue;
          let dx = X[j] - x;
          let dy = Y[j] - y;
          if (dx > half) dx -= L; else if (dx < -half) dx += L;
          if (dy > half) dy -= L; else if (dy < -half) dy += L;
          const r2 = dx * dx + dy * dy;
          if (r2 >= RC2) continue;
          const ir2 = 1 / r2;
          const s6 = SIG6 * ir2 * ir2 * ir2;
          e += 0.4 * (s6 * s6 - s6);
          if (r2 > RMIN2 && r2 < RMAX2) {
            const r = Math.sqrt(r2);
            const dr = r - 1;
            const ux = dx / r;
            const uy = dy / r;
            // Best arm of i toward j.
            let a = c0 * ux + s0 * uy;
            const a1 = c1 * ux + s1 * uy;
            const a2 = c2 * ux + s2 * uy;
            if (a1 > a) a = a1;
            if (a2 > a) a = a2;
            a -= 1;
            if (a > -HBNEAR) {
              const J = j * 3;
              let b = -(cx[J] * ux + cy[J] * uy);
              const b1 = -(cx[J + 1] * ux + cy[J + 1] * uy);
              const b2 = -(cx[J + 2] * ux + cy[J + 2] * uy);
              if (b1 > b) b = b1;
              if (b2 > b) b = b2;
              b -= 1;
              if (b > -HBNEAR) e -= hb * Math.exp(-(dr * dr + a * a + b * b) / S2);
            }
          }
        }
      }
    }
    for (let k = 0; k < this.solutes.length; k++) e += this.soluteEnergy(this.solutes[k], x, y);
    return e;
  }

  soluteEnergy(sol, x, y) {
    const { L } = this;
    let dx = sol.x - x;
    let dy = sol.y - y;
    dx -= L * Math.round(dx / L);
    dy -= L * Math.round(dy / L);
    const r2 = dx * dx + dy * dy;
    if (sol.hard !== undefined) return r2 < sol.hard * sol.hard ? Infinity : 0;
    if (r2 >= sol.rc2) return 0;
    if (r2 < 1e-4) return 1e20; // Exact overlap: a huge finite wall, so the move away is accepted.
    const ir2 = 1 / r2;
    const s6 = sol.s6 * ir2 * ir2 * ir2;
    return 4 * sol.e * (s6 * s6 - s6) + (sol.shift || 0);
  }

  addSolute({ x, y, s = 0.7, e = 0.1, hard, rc = 2.5 }) {
    const sol = { x, y, s, e, hard, s6: s ** 6, rc2: rc * rc, rc };
    this.solutes.push(sol);
    return sol;
  }

  // Push waters out of hard cavities, for a clean start.
  clearHard() {
    for (const sol of this.solutes) {
      if (sol.hard === undefined) continue;
      for (let i = 0; i < this.n; i++) {
        const dx = this.x[i] - sol.x;
        const dy = this.y[i] - sol.y;
        const r = Math.hypot(dx, dy);
        if (r >= sol.hard * 1.05) continue;
        const f = (sol.hard * 1.05 + this.rand() * 1.5) / Math.max(r, 0.05);
        this.x[i] = sol.x + dx * f;
        this.y[i] = sol.y + dy * f;
      }
    }
    this.rebuild();
  }

  energyOf(i) {
    const a = i * 3;
    const { cx, cy } = this;
    return this.energyAt(i, this.x[i], this.y[i], cx[a], cy[a], cx[a + 1], cy[a + 1], cx[a + 2], cy[a + 2]);
  }

  // One Metropolis move of one water. Translation and rotation together; the proposal is symmetric.
  moveOne(i) {
    const { rand, L, T, step, turn } = this;
    const e0 = this.energyOf(i);
    let nx = this.x[i] + (rand() - 0.5) * 2 * step;
    let ny = this.y[i] + (rand() - 0.5) * 2 * step;
    if (nx < 0) nx += L; else if (nx >= L) nx -= L;
    if (ny < 0) ny += L; else if (ny >= L) ny -= L;
    const nt = this.t[i] + (rand() - 0.5) * 2 * turn;
    const c0 = Math.cos(nt);
    const s0 = Math.sin(nt);
    // cos(t +/- 120) from the angle sum, to save two trig calls.
    const c1 = -0.5 * c0 - 0.8660254037844387 * s0;
    const s1 = -0.5 * s0 + 0.8660254037844387 * c0;
    const c2 = -0.5 * c0 + 0.8660254037844387 * s0;
    const s2 = -0.5 * s0 - 0.8660254037844387 * c0;
    const e1 = this.energyAt(i, nx, ny, c0, s0, c1, s1, c2, s2);
    this.tries++;
    const d = e1 - e0;
    if (d <= 0 || rand() < Math.exp(-d / T)) {
      this.takes++;
      this.x[i] = nx;
      this.y[i] = ny;
      this.t[i] = nt;
      const a = i * 3;
      this.cx[a] = c0; this.cy[a] = s0;
      this.cx[a + 1] = c1; this.cy[a + 1] = s1;
      this.cx[a + 2] = c2; this.cy[a + 2] = s2;
      this.relink(i);
      return true;
    }
    return false;
  }

  sweep(count = 1) {
    const { n, rand } = this;
    for (let c = 0; c < count; c++) {
      for (let k = 0; k < n; k++) this.moveOne(Math.floor(rand() * n));
    }
  }

  // Energy of solute k with all waters and the other solutes.
  soluteTotal(sol, x, y) {
    const { n, L } = this;
    const X = this.x;
    const Y = this.y;
    const { rc2, s6: s6v, e: depth } = sol;
    let u = 0;
    for (let i = 0; i < n; i++) {
      let dx = x - X[i];
      let dy = y - Y[i];
      dx -= L * Math.round(dx / L);
      dy -= L * Math.round(dy / L);
      const r2 = dx * dx + dy * dy;
      if (r2 >= rc2) continue;
      if (r2 < 1e-4) { u += 1e20; continue; }
      const ir2 = 1 / r2;
      const s6 = s6v * ir2 * ir2 * ir2;
      u += 4 * depth * (s6 * s6 - s6);
    }
    for (const other of this.solutes) {
      if (other === sol) continue;
      let dx = x - other.x;
      let dy = y - other.y;
      dx -= L * Math.round(dx / L);
      dy -= L * Math.round(dy / L);
      const r2 = dx * dx + dy * dy;
      if (r2 >= rc2) continue;
      if (r2 < 1e-4) { u += 1e20; continue; }
      const ir2 = 1 / r2;
      const s6 = s6v * ir2 * ir2 * ir2;
      u += 4 * depth * (s6 * s6 - s6);
    }
    return u;
  }

  // One Metropolis move of a free solute. Solutes the player holds have held = true.
  moveSolute(sol, step = 0.25) {
    if (sol.held) return false;
    const { L, T, rand } = this;
    const e0 = this.soluteTotal(sol, sol.x, sol.y);
    let nx = sol.x + (rand() - 0.5) * 2 * step;
    let ny = sol.y + (rand() - 0.5) * 2 * step;
    if (nx < 0) nx += L; else if (nx >= L) nx -= L;
    if (ny < 0) ny += L; else if (ny >= L) ny -= L;
    const d = this.soluteTotal(sol, nx, ny) - e0;
    if (d <= 0 || rand() < Math.exp(-d / T)) { sol.x = nx; sol.y = ny; return true; }
    return false;
  }

  // Keep the acceptance near a third, so structure relaxes as fast as it can.
  tune() {
    if (this.tries < 2000) return;
    const f = this.takes / this.tries;
    const g = f > 0.38 ? 1.05 : f < 0.28 ? 0.95 : 1;
    this.step = Math.min(0.5, Math.max(0.02, this.step * g));
    this.turn = Math.min(1.5, Math.max(0.05, this.turn * g));
    this.tries = 0;
    this.takes = 0;
  }

  totalEnergy() {
    let e = 0;
    for (let i = 0; i < this.n; i++) {
      const se = this.solutes.reduce((s, sol) => s + this.soluteEnergy(sol, this.x[i], this.y[i]), 0);
      if (se === Infinity) return Infinity; // A wall of a hard cavity landed on a water.
      e += (this.energyOf(i) - se) / 2 + se;
    }
    return e;
  }

  // Constant-pressure move: scale the box, in ln V so the volume can wander freely.
  volumeMove(p, dlnV = 0.03) {
    const { n, L, T, rand } = this;
    const V0 = L * L;
    const e0 = this.totalEnergy();
    const lnV = Math.log(V0) + (rand() - 0.5) * 2 * dlnV;
    const V1 = Math.exp(lnV);
    const L1 = Math.sqrt(V1);
    if (L1 < 2 * MB.rc + 0.1) return false;
    const f = L1 / L;
    const bx = this.x.slice();
    const by = this.y.slice();
    const sx = this.solutes.map((s) => [s.x, s.y]);
    for (let i = 0; i < n; i++) { this.x[i] *= f; this.y[i] *= f; }
    this.solutes.forEach((s) => { s.x *= f; s.y *= f; });
    this.L = L1;
    this.grid(L1);
    this.rebuild();
    const e1 = this.totalEnergy();
    // n + 1 because the walk is in ln V.
    const lnA = -(e1 - e0 + p * (V1 - V0)) / T + (n + 1) * Math.log(V1 / V0);
    if (lnA >= 0 || rand() < Math.exp(lnA)) return true;
    this.x.set(bx);
    this.y.set(by);
    this.solutes.forEach((s, k) => { [s.x, s.y] = sx[k]; });
    this.L = L;
    this.grid(L);
    this.rebuild();
    return false;
  }

  // Force a solute feels from the water, by the same Lennard-Jones term that the moves use. Pushes solute away from waters that overlap.
  soluteForce(sol) {
    const { n, L } = this;
    let fx = 0;
    let fy = 0;
    for (let i = 0; i < n; i++) {
      let dx = sol.x - this.x[i];
      let dy = sol.y - this.y[i];
      dx -= L * Math.round(dx / L);
      dy -= L * Math.round(dy / L);
      const r2 = dx * dx + dy * dy;
      if (r2 >= sol.rc2) continue;
      const ir2 = 1 / r2;
      const s6 = sol.s6 * ir2 * ir2 * ir2;
      const f = 24 * sol.e * (2 * s6 * s6 - s6) * ir2;
      fx += f * dx;
      fy += f * dy;
    }
    return [fx, fy];
  }

  // Squared distance from a point to the nearest water, out to about one cut-off. Used to look for holes.
  nearest2(x, y) {
    const { L, nc, cs, cellHead, next } = this;
    const X = this.x;
    const Y = this.y;
    const half = L / 2;
    let m = Infinity;
    const gx = Math.min(nc - 1, Math.floor(x / cs));
    const gy = Math.min(nc - 1, Math.floor(y / cs));
    for (let oy = -1; oy <= 1; oy++) {
      let ky = gy + oy;
      if (ky < 0) ky += nc; else if (ky >= nc) ky -= nc;
      for (let ox = -1; ox <= 1; ox++) {
        let kx = gx + ox;
        if (kx < 0) kx += nc; else if (kx >= nc) kx -= nc;
        for (let j = cellHead[kx + ky * nc]; j >= 0; j = next[j]) {
          let dx = X[j] - x;
          let dy = Y[j] - y;
          if (dx > half) dx -= L; else if (dx < -half) dx += L;
          if (dy > half) dy -= L; else if (dy < -half) dy += L;
          const r2 = dx * dx + dy * dy;
          if (r2 < m) m = r2;
        }
      }
    }
    return m;
  }

  // Hydrogen bonds as bookkeeping: a bond is any pair with bond energy stronger than a third of ideal.
  // Fills bond[3i + k] with the partner of arm k of water i (or -1), and returns the count.
  bonds(out, cut = 1 / 3) {
    const { n, L, x, y, cx, cy, nc, cellHead, next, cs } = this;
    const half = L / 2;
    out.fill(-1);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const gx = Math.min(nc - 1, Math.floor(x[i] / cs));
      const gy = Math.min(nc - 1, Math.floor(y[i] / cs));
      const I = i * 3;
      for (let oy = -1; oy <= 1; oy++) {
        const ky = (gy + oy + nc) % nc;
        for (let ox = -1; ox <= 1; ox++) {
          const kx = (gx + ox + nc) % nc;
          for (let j = cellHead[kx + ky * nc]; j >= 0; j = next[j]) {
            if (j <= i) continue;
            let dx = x[j] - x[i];
            let dy = y[j] - y[i];
            if (dx > half) dx -= L; else if (dx < -half) dx += L;
            if (dy > half) dy -= L; else if (dy < -half) dy += L;
            const r2 = dx * dx + dy * dy;
            if (r2 >= RMAX2 || r2 <= RMIN2) continue;
            const r = Math.sqrt(r2);
            const ux = dx / r;
            const uy = dy / r;
            let bk = 0;
            let a = -9;
            for (let k = 0; k < 3; k++) { const v = cx[I + k] * ux + cy[I + k] * uy; if (v > a) { a = v; bk = k; } }
            const J = j * 3;
            let bl = 0;
            let b = -9;
            for (let l = 0; l < 3; l++) { const v = -(cx[J + l] * ux + cy[J + l] * uy); if (v > b) { b = v; bl = l; } }
            const dr = r - 1;
            const da = a - 1;
            const db = b - 1;
            if (Math.exp(-(dr * dr + da * da + db * db) / S2) > cut) {
              if (out[I + bk] < 0 && out[J + bl] < 0) { out[I + bk] = j; out[J + bl] = i; count++; }
            }
          }
        }
      }
    }
    return count;
  }
}
