// The primitive model of salt in water, at real scale: hard ions in a sphere of uniform water (eps 78.4, 25 C),
// with a charged macro-ion fixed at the centre. Every pair sees bare Coulomb. Screening is not put in.
import { makeRandom } from './mbwater.js';
import { debye } from '../chem.js';

export const LB = 332.06 / (78.4 * 0.0019872 * 298.15); // Bjerrum length in Angstrom, about 7.1.
export const AVO = 6.022e-4; // Ions per cubic Angstrom at 1 mol/L.

export class IonSphere {
  constructor({ I = 0.1, Z = -6, macro = 12, ion = 4, reach = 3.5, seed = 4 } = {}) {
    this.macro = macro + ion / 2;
    this.d = ion;
    this.Z = Z;
    this.I = I;
    this.lambda = debye(I);
    this.R = macro + reach * this.lambda + 4;
    this.rand = makeRandom(seed);
    const V = (4 / 3) * Math.PI * (this.R ** 3 - macro ** 3);
    const pairs = Math.max(4, Math.round(I * AVO * V));
    const extra = Math.abs(Z);
    this.n = 2 * pairs + extra;
    const counterSign = Z < 0 ? 1 : -1;
    this.q = new Int8Array(this.n);
    for (let i = 0; i < this.n; i++) this.q[i] = i < pairs + extra ? counterSign : -counterSign;
    this.p = new Float64Array(this.n * 3);
    for (let i = 0; i < this.n; i++) this.place(i);
    this.step = Math.max(4, this.lambda * 0.8);
    const NB = 40;
    this.NB = NB;
    this.dr = (this.R - this.macro) / NB;
    this.plus = new Float64Array(NB);
    this.minus = new Float64Array(NB);
    this.samples = 0;
  }

  place(i) {
    const { p, R, rand } = this;
    for (let t = 0; t < 2000; t++) {
      const x = (rand() * 2 - 1) * R, y = (rand() * 2 - 1) * R, z = (rand() * 2 - 1) * R;
      const r = Math.hypot(x, y, z);
      if (r > R || r < this.macro) continue;
      let ok = true;
      for (let j = 0; j < i; j++) if (Math.hypot(x - p[j * 3], y - p[j * 3 + 1], z - p[j * 3 + 2]) < this.d) { ok = false; break; }
      if (ok) { p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; return; }
    }
  }

  // Energy of an ion of charge q at (x,y,z) in units of kT. Infinity on overlap.
  energy(i, x, y, z) {
    const { p, q, n, d } = this;
    const qi = q[i];
    let s = 0;
    const r0 = Math.sqrt(x * x + y * y + z * z);
    const d2 = d * d;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const J = j * 3;
      const dx = p[J] - x, dy = p[J + 1] - y, dz = p[J + 2] - z;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < d2) return Infinity;
      s += q[j] / Math.sqrt(r2);
    }
    return LB * qi * (s + this.Z / r0);
  }

  sweep(count = 1) {
    const { n, p, rand, step, R, macro } = this;
    for (let c = 0; c < count; c++) {
      for (let k = 0; k < n; k++) {
        const i = Math.floor(rand() * n);
        const I = i * 3;
        const x = p[I] + (rand() - 0.5) * 2 * step;
        const y = p[I + 1] + (rand() - 0.5) * 2 * step;
        const z = p[I + 2] + (rand() - 0.5) * 2 * step;
        const r2 = x * x + y * y + z * z;
        if (r2 > R * R || r2 < macro * macro) continue;
        const e1 = this.energy(i, x, y, z);
        if (e1 === Infinity) continue;
        const d = e1 - this.energy(i, p[I], p[I + 1], p[I + 2]);
        if (d <= 0 || rand() < Math.exp(-d)) { p[I] = x; p[I + 1] = y; p[I + 2] = z; }
      }
    }
  }

  sample() {
    const { n, p, q, macro, dr, NB, plus, minus } = this;
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      const b = Math.floor((r - macro) / dr);
      if (b < 0 || b >= NB) continue;
      if (q[i] > 0) plus[b]++; else minus[b]++;
    }
    this.samples++;
  }

  // Net charge enclosed within radius r: macro-ion plus the mean ions inside.
  enclosed() {
    const { NB, plus, minus, samples, macro, dr, Z } = this;
    const out = [];
    let q = Z;
    for (let b = 0; b < NB; b++) {
      q += (plus[b] - minus[b]) / Math.max(1, samples);
      out.push({ r: macro + (b + 1) * dr, q });
    }
    return out;
  }

  // Fit Debye-Hueckel Q(r) = Z exp(-k (r - a)) (1 + k r) / (1 + k a) to the enclosed charge, by scanning k.
  fitLambda() {
    const e = this.enclosed().filter((v) => v.r < this.R - this.lambda);
    const a = this.macro;
    let best = this.lambda;
    let bestErr = Infinity;
    for (let l = 1; l < 200; l *= 1.02) {
      const k = 1 / l;
      let err = 0;
      for (const v of e) {
        const m = this.Z * (Math.exp(-k * (v.r - a)) * (1 + k * v.r)) / (1 + k * a);
        err += (m - v.q) ** 2;
      }
      if (err < bestErr) { bestErr = err; best = l; }
    }
    return best;
  }

  // Salt concentration measured in the middle of the outer region, in mol/L.
  measuredSalt() {
    const { NB, plus, minus, samples, macro, dr, lambda, R } = this;
    let c = 0, v = 0;
    for (let b = 0; b < NB; b++) {
      const r = macro + (b + 0.5) * dr;
      if (r < macro + 2 * lambda || r > R - 8) continue;
      c += (plus[b] + minus[b]) / 2 / Math.max(1, samples);
      v += 4 * Math.PI * r * r * dr;
    }
    return v > 0 ? c / v / AVO : 0;
  }
}
