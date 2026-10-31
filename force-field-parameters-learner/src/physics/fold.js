// One chain with a native fold and real metastable states.
// A census of all 21 billion 16-bead lattice conformations is tallied by six integers. U is a sum of terms in those integers:
//   U = −(E·E0 − 2γ·Ew)·c − E·En·Qn − E·Ea·Qa − k·d − q²·Ee·e − w·W
// vdW: E. Protein-water: γ. Dihedral/CMAP: k. Charges: q (the term goes as q², not q). Buried water: w.
// Stored conformations can therefore be re-scored at new parameters instantly.
// The census itself is the referee: the player never sees it until they submit.
import { FOLD_QN, FOLD_QA, ROWS, KEY_B64, LOGG_B64, RG_B64, CHARGES, NATIVE_F, MISFOLD } from './fold-table.js';
import { E0, EW, SPACING } from './chain.js';
export { FOLD_QN, FOLD_QA, ROWS, MISFOLD, NATIVE_F };

export const R = 0.0019872;
export const FOLD_E = { EN: 0.65, EA: 0.483, EE: 0.6 };
const EN = () => FOLD_E.EN, EA = () => FOLD_E.EA, EE = () => FOLD_E.EE;
export const TRUE_P = { E: 1.10, gamma: 1.25, q: 1.0, k: 0.16, w: 1.119 };      // the hidden teaching truth
export const STOCK_P = { E: 1.45, gamma: 0.9, q: 0.70, k: 0.02, w: 0.10 };      // too sticky: one over-stabilised basin
// Rival sets, far from the truth, that fit the same 300 K populations. The tests pin down what each one fails.
export const DECOYS = [
  { E: 0.83, gamma: 0.79, q: 1.18, k: 0.37, w: 1.11 },    // misses the core mutant
  { E: 1.12, gamma: 1.35, q: 1.28, k: 0.29, w: 0.97 },    // misses the charge-free mutant
  { E: 1.17, gamma: 1.38, q: 1.08, k: 0.14, w: 1.15 },    // passes everything: the data do not fix every parameter
];
export const RIVAL = DECOYS[0];
export const CORE = 0.92;        // a core mutant: protein-protein strength × 0.92, with protein-water unchanged
export const KNOBS = { E: [0.8, 1.5], gamma: [0.7, 1.7], q: [0.4, 1.5], k: [0, 0.6], w: [0, 2.2] };

export const NATIVE = 0, INTERMEDIATE = 1, WET = 2, MISFOLDED = 3, UNFOLDED = 4;
export const NAMES = ['native', 'intermediate', 'wet core', 'misfolded', 'unfolded'];

export function classify(c, qn, qa, w) {
  if (qn >= 9) return NATIVE;
  if (qa >= 6) return MISFOLDED;
  if (w >= 1 && qn >= 4 && c >= 7) return WET;
  if (qn >= 5) return INTERMEDIATE;
  return UNFOLDED;
}

const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const key = new Uint32Array(bytes(KEY_B64).buffer), logG = new Float32Array(bytes(LOGG_B64).buffer), rg2 = new Float32Array(bytes(RG_B64).buffer);
const C = new Int8Array(ROWS), QN = new Int8Array(ROWS), QA = new Int8Array(ROWS), D = new Int8Array(ROWS), EL = new Int8Array(ROWS), W = new Int8Array(ROWS), ST = new Int8Array(ROWS);
for (let i = 0; i < ROWS; i++) {
  const k = key[i];
  C[i] = k & 15; QN[i] = k >> 4 & 15; QA[i] = k >> 8 & 15; D[i] = (k >> 12 & 31) - 16; EL[i] = k >> 17 & 7; W[i] = k >> 20 & 7;
  ST[i] = classify(C[i], QN[i], QA[i], W[i]);
}
const U = new Float64Array(ROWS);

function energies(p) {
  const a = p.E * E0 - 2 * p.gamma * EW, n = p.E * EN(), b = p.E * EA(), k = p.k, e = p.q * p.q * EE(), w = p.w;
  for (let i = 0; i < ROWS; i++) U[i] = -a * C[i] - n * QN[i] - b * QA[i] - k * D[i] - e * EL[i] - w * W[i];
}

export function stats(p, T = 300) {
  energies(p);
  const kT = R * T, pop = new Float64Array(5);
  let m = -Infinity, rgU = 0;
  for (let i = 0; i < ROWS; i++) { const l = logG[i] - U[i] / kT; if (l > m) m = l; }
  for (let i = 0; i < ROWS; i++) {
    const x = Math.exp(logG[i] - U[i] / kT - m);
    pop[ST[i]] += x;
    if (ST[i] === UNFOLDED) rgU += x * rg2[i];
  }
  const z = pop[0] + pop[1] + pop[2] + pop[3] + pop[4];
  const p5 = Array.from(pop, v => v / z);
  return { p: p5, rgU: Math.sqrt(rgU / pop[UNFOLDED]) * SPACING };
}

// Melting temperature by bisection: where the native and unfolded states are equally populated.
function gapAt(T) {
  const kT = R * T;
  let m = -Infinity;
  for (let i = 0; i < ROWS; i++) { const l = logG[i] - U[i] / kT; if (l > m) m = l; }
  let a = 0, b = 0;
  for (let i = 0; i < ROWS; i++) {
    if (ST[i] !== UNFOLDED && ST[i] !== NATIVE) continue;
    const x = Math.exp(logG[i] - U[i] / kT - m);
    if (ST[i] === NATIVE) a += x; else b += x;
  }
  return a - b;
}
export function meltingT(p) {
  energies(p);
  let lo = 220, hi = 600;
  if (gapAt(lo) < 0) return lo;
  if (gapAt(hi) > 0) return hi;
  for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (gapAt(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// A brute-force check that the census matches the formula, used by the tests.
export function rawRows() { return { ROWS, C, QN, QA, D, EL, W, ST, logG, rg2 }; }

const contactMatrix = list => {
  const m = new Uint8Array(CN * CN);
  for (let i = 0; i < CN; i++) for (let j = i + 2; j < CN; j++) {
    const a = list[i], b = list[j];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 1) { m[i * CN + j] = 1; m[j * CN + i] = 1; }
  }
  return m;
};
const CN = 16, S = 64, M = S - 1;
export const MOVES = { pivot: 0.08 };   // pivots are rare, so that basins are separated by real barriers
const NATM = contactMatrix(NATIVE_F), ALTM = contactMatrix(MISFOLD);
const at = (x, y, z) => (x & M) | ((y & M) << 6) | ((z & M) << 12);
const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];

export const packKey = (c, qn, qa, d, e, w) => c | qn << 4 | qa << 8 | (d + 16) << 12 | e << 17 | w << 20;

// Conformations a run can start from. Every one is a real self-avoiding chain.
export const EXTENDED = Array.from({ length: CN }, (_, i) => [i, 0, 0]);

// A live Metropolis walker with exactly the census energy. It keeps its six integers up to date.
export class FoldMC {
  constructor(p, T = 300, rand = Math.random, start = NATIVE_F) {
    this.N = CN; this.P = p; this.T = T; this.kT = R * T; this.rand = rand;
    this.x = new Int32Array(CN); this.y = new Int32Array(CN); this.z = new Int32Array(CN);
    this.px = new Int32Array(CN); this.py = new Int32Array(CN); this.pz = new Int32Array(CN);
    this.occ = new Int8Array(S * S * S);
    this.stamp = new Int32Array(S * S * S); this.now = 0;
    this.steps = 0;
    this.place(start);
  }
  place(list) {
    this.occ.fill(0);
    list.forEach((p, i) => { this.x[i] = p[0] + 8; this.y[i] = p[1] + 8; this.z[i] = p[2] + 8; this.occ[at(p[0] + 8, p[1] + 8, p[2] + 8)] = i + 1; });
    this.setP(this.P);
  }
  setP(p) { this.P = p; this.a = p.E * E0 - 2 * p.gamma * EW; this.n = p.E * EN(); this.b = p.E * EA(); this.ee = p.q * p.q * EE(); this.E = this.energy(); }
  setT(T) { this.T = T; this.kT = R * T; }
  features() {
    const { x, y, z, occ } = this;
    let c = 0, qn = 0, qa = 0, e = 0, d = 0;
    for (let i = 0; i < CN; i++) {
      const xi = x[i], yi = y[i], zi = z[i];
      let j = occ[at(xi + 1, yi, zi)] - 1;
      if (j >= 0 && j !== i - 1 && j !== i + 1) { c++; const k = i * CN + j; qn += NATM[k]; qa += ALTM[k]; e -= CHARGES[i] * CHARGES[j]; }
      j = occ[at(xi, yi + 1, zi)] - 1;
      if (j >= 0 && j !== i - 1 && j !== i + 1) { c++; const k = i * CN + j; qn += NATM[k]; qa += ALTM[k]; e -= CHARGES[i] * CHARGES[j]; }
      j = occ[at(xi, yi, zi + 1)] - 1;
      if (j >= 0 && j !== i - 1 && j !== i + 1) { c++; const k = i * CN + j; qn += NATM[k]; qa += ALTM[k]; e -= CHARGES[i] * CHARGES[j]; }
    }
    for (let i = 0; i + 3 < CN; i++) {
      const a0 = x[i + 1] - x[i], a1 = y[i + 1] - y[i], a2 = z[i + 1] - z[i], b0 = x[i + 2] - x[i + 1], b1 = y[i + 2] - y[i + 1], b2 = z[i + 2] - z[i + 1], f0 = x[i + 3] - x[i + 2], f1 = y[i + 3] - y[i + 2], f2 = z[i + 3] - z[i + 2];
      const t = a0 * (b1 * f2 - b2 * f1) - a1 * (b0 * f2 - b2 * f0) + a2 * (b0 * f1 - b1 * f0);
      if (t > 0) d++;
      else if (a0 === b0 && a1 === b1 && a2 === b2) d--;
      if (i + 4 === CN && b0 === f0 && b1 === f1 && b2 === f2) d--;
    }
    // Buried water: empty sites with at least four chain neighbours.
    const s = ++this.now, st = this.stamp;
    let w = 0;
    for (let i = 0; i < CN; i++) for (let m = 0; m < 6; m++) {
      const a = x[i] + DX[m], b = y[i] + DY[m], g = z[i] + DZ[m], h = at(a, b, g);
      if (occ[h] || st[h] === s) continue;
      st[h] = s;
      let n = 0;
      for (let u = 0; u < 6 && n < 4; u++) if (occ[at(a + DX[u], b + DY[u], g + DZ[u])]) n++;
      if (n >= 4) w++;
    }
    this.c = c; this.qn = qn; this.qa = qa < 3 ? 0 : qa; this.d = d; this.e = e; this.w = Math.min(7, w);
  }
  energy() {
    this.features();
    return -this.a * this.c - this.n * this.qn - this.b * this.qa - this.P.k * this.d - this.ee * this.e - this.P.w * this.w;
  }
  key() { return packKey(this.c, this.qn, this.qa, this.d, this.e, this.w); }
  state() { return classify(this.c, this.qn, this.qa, this.w); }
  rg2() {
    const { x, y, z } = this;
    let sx = 0, sy = 0, sz = 0, s = 0;
    for (let i = 0; i < CN; i++) { sx += x[i]; sy += y[i]; sz += z[i]; s += x[i] * x[i] + y[i] * y[i] + z[i] * z[i]; }
    return s / CN - (sx * sx + sy * sy + sz * sz) / (CN * CN);
  }
  wetSites() {
    const { x, y, z, occ } = this, out = [], seen = new Set();
    for (let i = 0; i < CN; i++) for (let m = 0; m < 6; m++) {
      const a = x[i] + DX[m], b = y[i] + DY[m], g = z[i] + DZ[m], h = at(a, b, g);
      if (occ[h] || seen.has(h)) continue;
      seen.add(h);
      let n = 0;
      for (let u = 0; u < 6; u++) if (occ[at(a + DX[u], b + DY[u], g + DZ[u])]) n++;
      if (n >= 4) out.push([a, b, g]);
    }
    return out;
  }
  // One Metropolis step: end move, corner flip, or a pivot of a tail. All three are symmetric.
  step() {
    const { x, y, z, occ, rand } = this;
    this.steps++;
    const i = rand() * CN | 0;
    if (i > 0 && i < CN - 1 && rand() < MOVES.pivot) return this.pivot(i);
    let nx, ny, nz;
    if (i === 0 || i === CN - 1) {
      const a = i ? CN - 2 : 1, m = rand() * 6 | 0;
      nx = x[a] + DX[m]; ny = y[a] + DY[m]; nz = z[a] + DZ[m];
    } else {
      nx = x[i - 1] + x[i + 1] - x[i]; ny = y[i - 1] + y[i + 1] - y[i]; nz = z[i - 1] + z[i + 1] - z[i];
    }
    const h = at(nx, ny, nz);
    if (occ[h]) return;
    const ox = x[i], oy = y[i], oz = z[i], g = at(ox, oy, oz);
    occ[g] = 0; occ[h] = i + 1;
    x[i] = nx; y[i] = ny; z[i] = nz;
    const Ei = this.energy();
    if (Ei <= this.E || rand() < Math.exp((this.E - Ei) / this.kT)) { this.E = Ei; return; }
    occ[h] = 0; occ[g] = i + 1;
    x[i] = ox; y[i] = oy; z[i] = oz;
    this.features();
  }
  pivot(i) {
    const { x, y, z, px, py, pz, occ, rand } = this;
    const ax = rand() * 3 | 0, turn = rand() < 0.5 ? 1 : -1, tail = rand() < 0.5, from = tail ? i + 1 : 0, to = tail ? CN : i;
    const xi = x[i], yi = y[i], zi = z[i];
    for (let j = from; j < to; j++) {
      const dx = x[j] - xi, dy = y[j] - yi, dz = z[j] - zi;
      if (ax === 0) { px[j] = xi + dx; py[j] = yi - turn * dz; pz[j] = zi + turn * dy; }
      else if (ax === 1) { px[j] = xi + turn * dz; py[j] = yi + dy; pz[j] = zi - turn * dx; }
      else { px[j] = xi - turn * dy; py[j] = yi + turn * dx; pz[j] = zi + dz; }
    }
    for (let j = from; j < to; j++) occ[at(x[j], y[j], z[j])] = 0;
    let clash = false;
    for (let j = from; j < to; j++) if (occ[at(px[j], py[j], pz[j])]) { clash = true; break; }
    if (clash) { for (let j = from; j < to; j++) occ[at(x[j], y[j], z[j])] = j + 1; return; }
    for (let j = from; j < to; j++) { occ[at(px[j], py[j], pz[j])] = j + 1; }
    const swap = () => { for (let j = from; j < to; j++) { let t = x[j]; x[j] = px[j]; px[j] = t; t = y[j]; y[j] = py[j]; py[j] = t; t = z[j]; z[j] = pz[j]; pz[j] = t; } };
    swap();
    const Ei = this.energy();
    if (Ei <= this.E || rand() < Math.exp((this.E - Ei) / this.kT)) { this.E = Ei; return; }
    for (let j = from; j < to; j++) occ[at(x[j], y[j], z[j])] = 0;
    swap();
    for (let j = from; j < to; j++) occ[at(x[j], y[j], z[j])] = j + 1;
    this.features();
  }
}
