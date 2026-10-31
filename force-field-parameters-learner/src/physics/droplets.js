// Two free-floating droplets inside a soft spherical wall: Lennard-Jones argon, and rigid three-site water.
import { ACC, COUL, KB, gauss } from './md.js';

const REF_MASS_AR = 39.948;
const NA_A3 = 1.66054;      // amu/Å³ → g/cm³

function spherePoints(N, spacing) {
  const pts = [];
  const R = Math.ceil(Math.cbrt(N * 1.2)) + 2;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
    if ((i + j + k) & 1) continue;
    const p = [i * spacing / Math.SQRT2, j * spacing / Math.SQRT2, k * spacing / Math.SQRT2];
    pts.push(p);
  }
  pts.sort((a, b) => a[0] ** 2 + a[1] ** 2 + a[2] ** 2 - b[0] ** 2 - b[1] ** 2 - b[2] ** 2);
  return pts.slice(0, N);
}

export class ArgonDrop {
  constructor(N = 600, wall = 34) {
    this.N = N; this.wall = wall;
    this.x = new Float64Array(3 * N); this.v = new Float64Array(3 * N); this.f = new Float64Array(3 * N);
    this.coord = new Float64Array(N);    // neighbours within the first shell
    this.ei = new Float64Array(N);       // pair energy of each atom
    this.sigma = 3.405; this.eps = 0.238;
    this.rc = 10.2;
    this.tweezer = null;                 // { x, y, z, k }
    this.center = [0, 0, 0];
    spherePoints(N, 3.8).forEach((p, i) => this.x.set(p, 3 * i));
    this.dim = Math.ceil(2 * (wall + 8) / this.rc);
    this.head = new Int32Array(this.dim ** 3);
    this.next = new Int32Array(N);
    this.pi = new Int32Array(N * 100); this.pj = new Int32Array(N * 100);
    const s = Math.sqrt(KB * 87 * ACC / REF_MASS_AR);
    for (let q = 0; q < 3 * N; q++) this.v[q] = s * gauss();
    this.forces();
  }

  // Verlet list: pairs within rc plus a skin, rebuilt every few steps from a cell grid.
  buildList() {
    const { N, x, dim, head, next, rc, wall } = this;
    head.fill(-1);
    const h = 2 * (wall + 8) / dim, off = wall + 8;
    const cellOf = v => { const c = Math.floor((v + off) / h); return c < 0 ? 0 : c >= dim ? dim - 1 : c; };
    for (let i = 0; i < N; i++) {
      const c = cellOf(x[3 * i]) + dim * (cellOf(x[3 * i + 1]) + dim * cellOf(x[3 * i + 2]));
      next[i] = head[c]; head[c] = i;
    }
    const lim = (rc + 1.2) ** 2;
    let n = 0;
    const { pi, pj } = this;
    for (let cz = 0; cz < dim; cz++) for (let cy = 0; cy < dim; cy++) for (let cx = 0; cx < dim; cx++) {
      for (let i = head[cx + dim * (cy + dim * cz)]; i >= 0; i = next[i]) {
        const ii = 3 * i, xi = x[ii], yi = x[ii + 1], zi = x[ii + 2];
        for (let nz = -1; nz <= 1; nz++) for (let ny = -1; ny <= 1; ny++) for (let nx = -1; nx <= 1; nx++) {
          const ax = cx + nx, ay = cy + ny, az = cz + nz;
          if (ax < 0 || ay < 0 || az < 0 || ax >= dim || ay >= dim || az >= dim) continue;
          for (let j = head[ax + dim * (ay + dim * az)]; j >= 0; j = next[j]) {
            if (j <= i) continue;
            const jj = 3 * j, dx = xi - x[jj], dy = yi - x[jj + 1], dz = zi - x[jj + 2];
            if (dx * dx + dy * dy + dz * dz < lim && n < pi.length) { pi[n] = i; pj[n] = j; n++; }
          }
        }
      }
    }
    this.nPairs = n;
    this.age = 0;
  }

  forces() {
    const { N, x, f, coord, ei, wall, tweezer, rc } = this;
    if (this.age === undefined || this.age >= 10) this.buildList();
    this.age++;
    f.fill(0); coord.fill(0); ei.fill(0);
    const { pi, pj, nPairs } = this;
    const s2 = this.sigma * this.sigma, e4 = 4 * this.eps, rc2 = rc * rc;
    const sr2c = s2 / rc2, sr6c = sr2c * sr2c * sr2c;
    const shift = e4 * sr6c * (sr6c - 1);
    const shell2 = (1.45 * this.sigma) ** 2;
    let pot = 0;
    for (let p = 0; p < nPairs; p++) {
      const i = pi[p], j = pj[p], ii = 3 * i, jj = 3 * j;
      const dx = x[ii] - x[jj], dy = x[ii + 1] - x[jj + 1], dz = x[ii + 2] - x[jj + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 >= rc2) continue;
      const sr2 = s2 / r2, sr6 = sr2 * sr2 * sr2;
      const e = e4 * sr6 * (sr6 - 1) - shift;
      const g = e4 * sr6 * (12 * sr6 - 6) / r2;
      f[ii] += g * dx; f[ii + 1] += g * dy; f[ii + 2] += g * dz;
      f[jj] -= g * dx; f[jj + 1] -= g * dy; f[jj + 2] -= g * dz;
      pot += e;
      // Measured energy is the plain truncated pair energy, so that the usual tail correction applies to it.
      ei[i] += 0.5 * (e + shift); ei[j] += 0.5 * (e + shift);
      if (r2 < shell2) { coord[i]++; coord[j]++; }
    }
    this.pot = pot;
    for (let i = 0; i < N; i++) {
      const ii = 3 * i;
      const r = Math.hypot(x[ii], x[ii + 1], x[ii + 2]);
      if (r > wall) {
        const g = -2 * (r - wall) / r;
        f[ii] += g * x[ii]; f[ii + 1] += g * x[ii + 1]; f[ii + 2] += g * x[ii + 2];
      }
      if (tweezer) {
        const dx = tweezer.x - x[ii], dy = tweezer.y - x[ii + 1], dz = tweezer.z - x[ii + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        const w = tweezer.k * Math.exp(-d2 / 72);
        f[ii] += w * dx; f[ii + 1] += w * dy; f[ii + 2] += w * dz;
      }
    }
  }

  step(dt, T, gamma = 0.004) {
    const { N, x, v, f } = this;
    const a = 0.5 * dt * ACC / REF_MASS_AR;
    const c1 = Math.exp(-gamma * dt), c2 = Math.sqrt(1 - c1 * c1) * Math.sqrt(KB * T * ACC / REF_MASS_AR);
    for (let q = 0; q < 3 * N; q++) {
      v[q] += a * f[q];
      x[q] += 0.5 * dt * v[q];
      v[q] = c1 * v[q] + c2 * gauss();
      x[q] += 0.5 * dt * v[q];
    }
    this.forces();
    for (let q = 0; q < 3 * N; q++) v[q] += a * f[q];
    for (let q = 0; q < 3 * N; q++) if (!Number.isFinite(x[q])) { this.blown = true; break; }
  }

  // Density and cohesive energy measured in the middle of the droplet, away from its surface.
  measure(rCore = 9.5) {
    const { N, x, ei, coord } = this;
    let cx = 0, cy = 0, cz = 0, w = 0;
    for (let i = 0; i < N; i++) if (coord[i] >= 6) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; w++; }
    if (w > 0) { cx /= w; cy /= w; cz /= w; }
    this.center = [cx, cy, cz];
    let n = 0, e = 0;
    for (let i = 0; i < N; i++) {
      const dx = x[3 * i] - cx, dy = x[3 * i + 1] - cy, dz = x[3 * i + 2] - cz;
      if (dx * dx + dy * dy + dz * dz < rCore * rCore) { n++; e += ei[i]; }
    }
    const vol = 4 / 3 * Math.PI * rCore ** 3, rho = n / vol;
    // Standard tail correction for the attraction beyond the cutoff.
    const sr = this.sigma / this.rc, sr3 = sr * sr * sr;
    const tail = 8 / 3 * Math.PI * rho * this.eps * this.sigma ** 3 * (sr3 - sr3 * sr3 * sr3 / 3);
    return {
      density: rho * REF_MASS_AR * NA_A3,
      dHvap: n ? -e / n + tail + KB * 87 : 0,
      liquidFraction: w / N,
    };
  }
}

// Rigid three-site water, all pairs inside the droplet. TIP3P geometry: r(OH)=0.9572 Å, HOH=104.52°.
const ROH = 0.9572, RHH = 1.5139;
const MASS = [15.999, 1.008, 1.008];
export const TIP3P = { qO: -0.834, sigma: 3.15061, eps: 0.1521 };

export function dipoleDebye(qO) {
  const qH = -qO / 2;
  return 2 * qH * ROH * Math.cos(52.26 * Math.PI / 180) * 4.80320;
}

export class WaterDrop {
  constructor(M = 90, wall = 24) {
    this.M = M; this.wall = wall;
    this.x = new Float64Array(9 * M); this.v = new Float64Array(9 * M); this.f = new Float64Array(9 * M);
    this.prev = new Float64Array(9 * M);
    this.eMol = new Float64Array(M);
    this.qO = TIP3P.qO;
    this.tweezer = null;
    this.hb = new Int16Array(2 * M * 4);
    this.nHb = 0;
    spherePoints(M, 3.3).forEach((p, m) => {
      const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), c = Math.random() * 6.283;
      const u = [Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b)];
      let w = [Math.cos(c), Math.sin(c), 0.3];
      const d = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
      w = [w[0] - d * u[0], w[1] - d * u[1], w[2] - d * u[2]];
      const l = Math.hypot(...w); w = w.map(v => v / l);
      const ca = 0.6119, sa = 0.7909;
      const q = 9 * m;
      this.x.set(p, q);
      this.x.set([p[0] + ROH * (ca * u[0] + sa * w[0]), p[1] + ROH * (ca * u[1] + sa * w[1]), p[2] + ROH * (ca * u[2] + sa * w[2])], q + 3);
      this.x.set([p[0] + ROH * (ca * u[0] - sa * w[0]), p[1] + ROH * (ca * u[1] - sa * w[1]), p[2] + ROH * (ca * u[2] - sa * w[2])], q + 6);
    });
    this.forces();
  }

  forces() {
    const { M, x, f, eMol, wall, tweezer } = this;
    f.fill(0); eMol.fill(0);
    const qO = this.qO, qH = -qO / 2;
    const cOO = COUL * qO * qO, cOH = COUL * qO * qH, cHH = COUL * qH * qH;
    const s6 = TIP3P.sigma ** 6, A = 4 * TIP3P.eps * s6 * s6, B = 4 * TIP3P.eps * s6;
    let pot = 0;
    const q = [cOO, cOH, cOH, cOH, cHH, cHH, cOH, cHH, cHH];
    for (let a = 0; a < M; a++) {
      const ia = 9 * a;
      for (let b = a + 1; b < M; b++) {
        const ib = 9 * b;
        let e = 0;
        for (let s = 0; s < 3; s++) {
          const p = ia + 3 * s, px = x[p], py = x[p + 1], pz = x[p + 2];
          let fx = 0, fy = 0, fz = 0;
          for (let t = 0; t < 3; t++) {
            const r = ib + 3 * t;
            const dx = px - x[r], dy = py - x[r + 1], dz = pz - x[r + 2];
            const r2i = 1 / (dx * dx + dy * dy + dz * dz);
            const c = q[3 * s + t] * Math.sqrt(r2i);
            let g = c * r2i;
            e += c;
            if (s === 0 && t === 0) {
              const r6i = r2i * r2i * r2i, u = A * r6i * r6i, v = B * r6i;
              e += u - v;
              g += (12 * u - 6 * v) * r2i;
            }
            fx += g * dx; fy += g * dy; fz += g * dz;
            f[r] -= g * dx; f[r + 1] -= g * dy; f[r + 2] -= g * dz;
          }
          f[p] += fx; f[p + 1] += fy; f[p + 2] += fz;
        }
        pot += e; eMol[a] += 0.5 * e; eMol[b] += 0.5 * e;
      }
    }
    this.pot = pot;
    for (let a = 0; a < M; a++) {
      const o = 9 * a;
      const r = Math.hypot(x[o], x[o + 1], x[o + 2]);
      if (r > wall) {
        const g = -3 * (r - wall) / r;
        f[o] += g * x[o]; f[o + 1] += g * x[o + 1]; f[o + 2] += g * x[o + 2];
      }
      if (tweezer) {
        const dx = tweezer.x - x[o], dy = tweezer.y - x[o + 1], dz = tweezer.z - x[o + 2];
        const w = tweezer.k * Math.exp(-(dx * dx + dy * dy + dz * dz) / 60);
        f[o] += w * dx; f[o + 1] += w * dy; f[o + 2] += w * dz;
      }
    }
  }

  settle() {
    const { M, x, prev } = this;
    const io = 1 / MASS[0], ih = 1 / MASS[1];
    const pairs = [[0, 3, ROH, io, ih], [0, 6, ROH, io, ih], [3, 6, RHH, ih, ih]];
    for (let m = 0; m < M; m++) {
      const b = 9 * m;
      for (let it = 0; it < 30; it++) {
        let ok = true;
        for (const [s, t, d, ms, mt] of pairs) {
          const i = b + s, j = b + t;
          const dx = x[i] - x[j], dy = x[i + 1] - x[j + 1], dz = x[i + 2] - x[j + 2];
          const diff = dx * dx + dy * dy + dz * dz - d * d;
          if (Math.abs(diff) < 1e-7) continue;
          ok = false;
          const px = prev[i] - prev[j], py = prev[i + 1] - prev[j + 1], pz = prev[i + 2] - prev[j + 2];
          const g = diff / (2 * (ms + mt) * (dx * px + dy * py + dz * pz));
          x[i] -= g * ms * px; x[i + 1] -= g * ms * py; x[i + 2] -= g * ms * pz;
          x[j] += g * mt * px; x[j + 1] += g * mt * py; x[j + 2] += g * mt * pz;
        }
        if (ok) break;
      }
    }
  }

  step(dt, T, gamma = 0.003) {
    const { M, x, v, f, prev } = this;
    const n = 9 * M;
    prev.set(x);
    const c1 = Math.exp(-gamma * dt), c2 = Math.sqrt(1 - c1 * c1), kT = KB * T * ACC;
    for (let q = 0; q < n; q++) {
      const m = MASS[(q % 9) / 3 | 0];
      v[q] += dt * ACC / m * f[q];
      v[q] = c1 * v[q] + c2 * Math.sqrt(kT / m) * gauss();
      x[q] += dt * v[q];
    }
    this.settle();
    for (let q = 0; q < n; q++) v[q] = (x[q] - prev[q]) / dt;
    this.forces();
  }

  // Geometric hydrogen bonds: O···O < 3.5 Å and H–O···O < 30°.
  hbonds() {
    const { M, x, hb } = this;
    let n = 0;
    const max = hb.length / 2;
    for (let a = 0; a < M; a++) {
      const ia = 9 * a;
      for (let b = a + 1; b < M; b++) {
        const ib = 9 * b;
        const dx = x[ib] - x[ia], dy = x[ib + 1] - x[ia + 1], dz = x[ib + 2] - x[ia + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 > 12.25) continue;
        const r = Math.sqrt(r2);
        let bonded = false;
        for (let h = 3; h <= 6 && !bonded; h += 3) {
          const ux = x[ia + h] - x[ia], uy = x[ia + h + 1] - x[ia + 1], uz = x[ia + h + 2] - x[ia + 2];
          if ((ux * dx + uy * dy + uz * dz) / (ROH * r) > 0.866) bonded = true;
          const wx = x[ib + h] - x[ib], wy = x[ib + h + 1] - x[ib + 1], wz = x[ib + h + 2] - x[ib + 2];
          if (-(wx * dx + wy * dy + wz * dz) / (ROH * r) > 0.866) bonded = true;
        }
        if (bonded && n < max) { hb[2 * n] = a; hb[2 * n + 1] = b; n++; }
      }
    }
    this.nHb = n;
    return n;
  }

  measure() {
    const { M, x, eMol } = this;
    // Find the cluster centre from molecules with close neighbours.
    let cx = 0, cy = 0, cz = 0, w = 0;
    const near = new Int16Array(M);
    for (let a = 0; a < M; a++) for (let b = a + 1; b < M; b++) {
      const dx = x[9 * a] - x[9 * b], dy = x[9 * a + 1] - x[9 * b + 1], dz = x[9 * a + 2] - x[9 * b + 2];
      if (dx * dx + dy * dy + dz * dz < 12.25) { near[a]++; near[b]++; }
    }
    let bound = 0;
    for (let a = 0; a < M; a++) if (near[a] >= 2) { cx += x[9 * a]; cy += x[9 * a + 1]; cz += x[9 * a + 2]; w++; bound++; }
    if (w) { cx /= w; cy /= w; cz /= w; }
    let n = 0, e = 0;
    for (let a = 0; a < M; a++) {
      const dx = x[9 * a] - cx, dy = x[9 * a + 1] - cy, dz = x[9 * a + 2] - cz;
      if (dx * dx + dy * dy + dz * dz < 36) { n++; e += eMol[a]; }
    }
    const hb = this.hbonds();
    return { hbPerMol: 2 * hb / M, cohesion: n ? -e / n : 0, bound: bound / M, center: [cx, cy, cz] };
  }
}
