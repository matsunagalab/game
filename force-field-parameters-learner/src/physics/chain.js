// One short chain in water, solved exactly: the partition function is a sum over a census of every lattice walk.
// Energy is linear in the parameters, so changing a parameter only reweights the census. Nothing is resimulated.
//   U = −E·E0·c − E·En·Q + 2·γ·Ew·c
// c: bead-bead contacts. Q: native contacts (folded sequence only). Each bead-bead contact costs two bead-water contacts.
// E and γ are scale factors on protein-protein and protein-water strength. The stock force field has E = γ = 1.
import { TABLE, CHAIN_N, CHAIN_QMAX, NATIVE } from './chain-table.js';
export { CHAIN_N, CHAIN_QMAX, NATIVE };

export const KT = 0.596;              // kcal/mol at 300 K
export const E0 = 1.88, EW = 0.76;    // bead-bead and bead-water contact energies at scale 1, teaching values
export const EN = 1.38;               // extra strength of a native contact at scale 1, teaching value
export const SPACING = 3.8;           // Å per lattice step, a Cα–Cα distance

// Rows flattened for speed.
const C = Int16Array.from(TABLE, r => r[0]), Q = Int16Array.from(TABLE, r => r[1]);
const G = Float64Array.from(TABLE, r => Math.log(r[2])), RG = Float64Array.from(TABLE, r => r[3] / r[2]);

export function chainStats(Epp, gamma) {
  const eff = (Epp * E0 - 2 * gamma * EW) / KT, nat = Epp * EN / KT;
  let zi = 0, ri = 0, zf = 0, rf = 0, zn = 0;
  // Log weights stay near zero for numerical comfort, so the shift is only needed for Q.
  for (let i = 0; i < C.length; i++) {
    const wi = Math.exp(G[i] + eff * C[i] - 16);
    zi += wi; ri += wi * RG[i];
    const wf = Math.exp(G[i] + eff * C[i] + nat * Q[i] - 16);
    zf += wf; rf += wf * RG[i];
    if (Q[i] >= CHAIN_QMAX * 0.75) zn += wf;
  }
  const pf = zn / zf;
  return {
    rgIdp: Math.sqrt(ri / zi) * SPACING,        // Å
    rgFold: Math.sqrt(rf / zf) * SPACING,
    pFold: pf,
    dGFold: -KT * Math.log(Math.max(1e-12, pf) / Math.max(1e-12, 1 - pf)),   // negative is stable, kcal/mol
  };
}

const MOVES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const key = (x, y, z) => (x + 512) | ((y + 512) << 10) | ((z + 512) << 20);

// Live Metropolis Monte Carlo with the same energy: end, corner and crankshaft-free local moves plus pivots.
export class ChainMC {
  constructor(useNative, rand = Math.random) {
    this.nat = useNative; this.rand = rand; this.N = CHAIN_N;
    this.x = new Int32Array(this.N); this.y = new Int32Array(this.N); this.z = new Int32Array(this.N);
    NATIVE.forEach((p, i) => { this.x[i] = p[0]; this.y[i] = p[1]; this.z[i] = p[2]; });
    this.native = new Set();
    for (let i = 0; i < this.N; i++) for (let j = i + 2; j < this.N; j++) {
      const a = NATIVE[i], b = NATIVE[j];
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 1) this.native.add(i * 100 + j);
    }
    this.map = new Map();
    this.index();
    this.Epp = 1; this.gamma = 1;
    this.E = this.energy();
  }
  index() {
    this.map.clear();
    for (let i = 0; i < this.N; i++) this.map.set(key(this.x[i], this.y[i], this.z[i]), i);
  }
  counts() {
    let c = 0, q = 0;
    const { N, x, y, z, map } = this;
    for (let i = 0; i < N; i++) for (const d of [0, 2, 4]) {
      const m = MOVES[d], j = map.get(key(x[i] + m[0], y[i] + m[1], z[i] + m[2]));
      if (j === undefined || Math.abs(j - i) < 2) continue;
      c++;
      if (this.native.has(Math.min(i, j) * 100 + Math.max(i, j))) q++;
    }
    return [c, q];
  }
  energyOf(c, q) {
    const eff = this.Epp * E0 - 2 * this.gamma * EW;
    return -eff * c - (this.nat ? this.Epp * EN * q : 0);
  }
  energy() { const [c, q] = this.counts(); return this.energyOf(c, q); }
  setParams(Epp, gamma) { this.Epp = Epp; this.gamma = gamma; this.E = this.energy(); }
  rg2() {
    let sx = 0, sy = 0, sz = 0, s = 0;
    const { N, x, y, z } = this;
    for (let i = 0; i < N; i++) { sx += x[i]; sy += y[i]; sz += z[i]; s += x[i] * x[i] + y[i] * y[i] + z[i] * z[i]; }
    return s / N - (sx * sx + sy * sy + sz * sz) / (N * N);
  }
  // Propose a new position for one bead (end or corner) or a pivot of a tail.
  step() {
    const { N, x, y, z, map, rand } = this;
    const i = rand() * N | 0;
    if (rand() < 0.15 && i > 0 && i < N - 1) return this.pivot(i);
    let nx, ny, nz;
    if (i === 0 || i === N - 1) {
      const a = i ? N - 2 : 1, m = MOVES[rand() * 6 | 0];
      nx = x[a] + m[0]; ny = y[a] + m[1]; nz = z[a] + m[2];
    } else {
      // Corner flip: only possible if the two neighbours are not collinear.
      nx = x[i - 1] + x[i + 1] - x[i]; ny = y[i - 1] + y[i + 1] - y[i]; nz = z[i - 1] + z[i + 1] - z[i];
    }
    const k = key(nx, ny, nz);
    if (map.has(k)) return;
    const ox = x[i], oy = y[i], oz = z[i], ok = key(ox, oy, oz);
    map.delete(ok); map.set(k, i);
    x[i] = nx; y[i] = ny; z[i] = nz;
    const E = this.energy();
    if (E <= this.E || rand() < Math.exp((this.E - E) / KT)) { this.E = E; return; }
    map.delete(k); map.set(ok, i);
    x[i] = ox; y[i] = oy; z[i] = oz;
  }
  pivot(i) {
    const { N, x, y, z, rand } = this;
    const ax = rand() * 3 | 0, turn = rand() < 0.5 ? 1 : -1;
    const px = new Int32Array(x), py = new Int32Array(y), pz = new Int32Array(z);
    const tail = rand() < 0.5;
    for (let j = 0; j < N; j++) {
      if (tail ? j <= i : j >= i) continue;
      const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
      if (ax === 0) { px[j] = x[i] + dx; py[j] = y[i] - turn * dz; pz[j] = z[i] + turn * dy; }
      else if (ax === 1) { px[j] = x[i] + turn * dz; py[j] = y[i] + dy; pz[j] = z[i] - turn * dx; }
      else { px[j] = x[i] - turn * dy; py[j] = y[i] + turn * dx; pz[j] = z[i] + dz; }
    }
    const seen = new Set();
    for (let j = 0; j < N; j++) { const k = key(px[j], py[j], pz[j]); if (seen.has(k)) return; seen.add(k); }
    const sx = this.x, sy = this.y, sz = this.z;
    this.x = px; this.y = py; this.z = pz; this.index();
    const E = this.energy();
    if (E <= this.E || rand() < Math.exp((this.E - E) / KT)) { this.E = E; return; }
    this.x = sx; this.y = sy; this.z = sz; this.index();
  }
}
