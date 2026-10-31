// The CMAP term: a correction stored on a 24×24 grid (15° steps) over φ and ψ, read back by bicubic interpolation.
// Everything here is exact for the model: populations are P(φ,ψ) ∝ exp(−U/kT) on a fine grid, with no sampling.
import { lsq } from './linalg.js';

export const GRID = 24, STEP = 15, FINE = 96;
export const KT = 0.596;
const wrap = a => ((a + 180) % 360 + 360) % 360 - 180;
const CAP = 7;

// Basins of the backbone map. The two weight sets are the teaching targets.
//   stats: a folded-protein survey (helix heavy, some left-handed helix)
//   pep:   a disordered peptide in water (PPII heavy, almost no left-handed helix)
// The shapes follow known alanine regions; the weights are invented for this reduced system and labelled so on screen.
export const BASINS = [
  { name: 'α helix',    phi: -63,  psi: -43, sp: 15, ss: 15, stats: 0.44, pep: 0.14 },
  { name: 'β strand',   phi: -125, psi: 135, sp: 22, ss: 20, stats: 0.26, pep: 0.27 },
  { name: 'PPII',       phi: -70,  psi: 145, sp: 14, ss: 16, stats: 0.20, pep: 0.54 },
  { name: 'left helix', phi: 57,   psi: 42,  sp: 11, ss: 13, stats: 0.08, pep: 0.015 },
  { name: 'bridge',     phi: -95,  psi: 0,   sp: 16, ss: 15, stats: 0.02, pep: 0.035 },
];

export const AL = 3;    // index of the left-handed helix basin

const idx = (i, j) => ((i + GRID) % GRID) + GRID * ((j + GRID) % GRID);
export const gridPhi = i => -180 + i * STEP;

function mixture(key, n) {
  const P = new Float64Array(n * n), h = 360 / n;
  let s = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const phi = -180 + i * h, psi = -180 + j * h;
    let p = 2e-6;
    for (const b of BASINS) {
      const dp = wrap(phi - b.phi) / b.sp, ds = wrap(psi - b.psi) / b.ss;
      p += b[key] * Math.exp(-0.5 * (dp * dp + ds * ds)) / (b.sp * b.ss);
    }
    P[i + n * j] = p; s += p;
  }
  for (let q = 0; q < P.length; q++) P[q] /= s;
  return P;
}
export const targetStats = () => mixture('stats', FINE);
export const targetPeptide = () => mixture('pep', FINE);

// Energy surface on the 24×24 grid from a target population, zero at its lowest point, capped.
export function surface(key = 'stats') {
  const P = mixture(key, GRID), U = new Float64Array(GRID * GRID);
  let m = Infinity;
  for (let q = 0; q < P.length; q++) { U[q] = -KT * Math.log(P[q]); m = Math.min(m, U[q]); }
  for (let q = 0; q < P.length; q++) U[q] = Math.min(U[q] - m, CAP);
  return U;
}

// The best possible sum of one-dimensional torsions, up to harmonic K on φ and on ψ, by least squares.
// `on` lists which harmonics are switched on: e.g. [1,2,3].
export function fit1D(U, on) {
  const X = [], y = [];
  const row = (p, s) => {
    const r = [1];
    for (const n of on) r.push(Math.cos(n * p), Math.sin(n * p), Math.cos(n * s), Math.sin(n * s));
    return r;
  };
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    X.push(row(gridPhi(i) * Math.PI / 180, gridPhi(j) * Math.PI / 180));
    y.push(U[idx(i, j)]);
  }
  const b = lsq(X, y), F = new Float64Array(GRID * GRID);
  for (let q = 0; q < X.length; q++) { let s = 0; const r = X[q]; for (let k = 0; k < b.length; k++) s += r[k] * b[k]; F[q] = s; }
  return F;
}

export function rms(A, B) {
  let s = 0;
  for (let q = 0; q < A.length; q++) s += (A[q] - B[q]) ** 2;
  return Math.sqrt(s / A.length);
}

// Rectangle test. For any sum f(φ) + g(ψ), the four corners cancel exactly. Whatever is left is true φ/ψ coupling.
export const cross = (U, i0, j0, i1, j1) => U[idx(i0, j0)] + U[idx(i1, j1)] - U[idx(i0, j1)] - U[idx(i1, j0)];

// Periodic Catmull-Rom bicubic, the same family of interpolation CMAP uses. Weights are tabulated once.
const K = (() => {
  const sub = FINE / GRID, w = [];
  for (let k = 0; k < sub; k++) {
    const t = k / sub, t2 = t * t, t3 = t2 * t;
    w.push([-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2]);
  }
  return w;
})();

export function upsample(G, out = new Float64Array(FINE * FINE)) {
  const sub = FINE / GRID;
  for (let j = 0; j < FINE; j++) {
    const gj = Math.floor(j / sub), wj = K[j % sub];
    for (let i = 0; i < FINE; i++) {
      const gi = Math.floor(i / sub), wi = K[i % sub];
      let s = 0;
      for (let b = 0; b < 4; b++) {
        const jj = (gj + b - 1 + GRID) % GRID;
        for (let a = 0; a < 4; a++) s += wi[a] * wj[b] * G[(gi + a - 1 + GRID) % GRID + GRID * jj];
      }
      out[i + FINE * j] = s;
    }
  }
  return out;
}

export function boltzmann(Uf, P = new Float64Array(Uf.length)) {
  let m = Infinity, s = 0;
  for (let q = 0; q < Uf.length; q++) if (Uf[q] < m) m = Uf[q];
  for (let q = 0; q < Uf.length; q++) { P[q] = Math.exp(-(Uf[q] - m) / KT); s += P[q]; }
  for (let q = 0; q < Uf.length; q++) P[q] /= s;
  return P;
}

// Overlap of two distributions: 1 means identical.
export function overlap(P, Q) {
  let s = 0;
  for (let q = 0; q < P.length; q++) s += Math.sqrt(P[q] * Q[q]);
  return s;
}

export function basinPop(P, b) {
  let s = 0;
  const h = 360 / FINE;
  for (let j = 0; j < FINE; j++) for (let i = 0; i < FINE; i++) {
    if (Math.hypot(wrap(-180 + i * h - b.phi) / b.sp, wrap(-180 + j * h - b.psi) / b.ss) < 2.3) s += P[i + FINE * j];
  }
  return s;
}

// ³J(HN-Hα) from φ, Karplus form with the Vuister & Bax 1993 coefficients.
const karplus = phi => { const c = Math.cos((phi - 60) * Math.PI / 180); return 6.51 * c * c - 1.76 * c + 1.6; };
export function jCoupling(P) {
  let s = 0;
  const h = 360 / FINE;
  for (let j = 0; j < FINE; j++) for (let i = 0; i < FINE; i++) s += P[i + FINE * j] * karplus(-180 + i * h);
  return s;
}

// One step of iterative Boltzmann inversion: ΔU = −kT ln(Ptarget / Psim), sampled at the grid points.
export function ibiStep(C, Psim, Ptarget, damp = 1) {
  const sub = FINE / GRID;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    let a = 0, b = 0;
    // Averages over the cell keep the update smooth at 15° resolution.
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const q = ((i * sub + x + FINE) % FINE) + FINE * ((j * sub + y + FINE) % FINE);
      a += Ptarget[q]; b += Psim[q];
    }
    const d = -KT * Math.log((a + 1e-9) / (b + 1e-9));
    C[i + GRID * j] += damp * Math.max(-3, Math.min(3, d));
  }
}

// A soft round brush on the grid.
export function brush(C, phi, psi, amount, radius = 26) {
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const d = Math.hypot(wrap(gridPhi(i) - phi), wrap(gridPhi(j) - psi)) / radius;
    if (d < 2.2) C[i + GRID * j] += amount * Math.exp(-d * d);
  }
}
