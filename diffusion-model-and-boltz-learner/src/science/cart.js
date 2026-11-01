// The exact denoiser in Cartesian space, for a small set of real structures.
// Every structure is rotated onto the noisy point first, then the Gaussian weights are taken. This best-rotation form stands in for the
// integral over all rotations. At low noise the two agree. At high noise it differs, and chapter 6 shows how.
import { bestRotation, centre, rotate, shift } from './kabsch.js';

export class Ensemble {
  constructor(models, { mirror = false } = {}) {
    this.dim = models[0].length; this.n = this.dim / 3;
    this.models = models.map((m) => { const c = centre(m); return shift(m, [-c[0], -c[1], -c[2]], new Float64Array(this.dim)); });
    this.M = models.length; this.mirror = mirror;
    this.d2 = new Float64Array(this.M); this.w = new Float64Array(this.M);
    this.rot = this.models.map(() => new Float64Array(this.dim));
    this.tmp = new Float64Array(this.dim);
  }

  // Writes the guess to out. `x` need not be centred, and the guess is returned at x's centre.
  denoise(x, s, out, { weights = null, activeOnly = null } = {}) {
    const { M, dim, models, d2, w, rot, tmp, n } = this, c = centre(x);
    shift(x, [-c[0], -c[1], -c[2]], tmp);
    let lo = Infinity;
    for (let m = 0; m < M; m += 1) {
      if (activeOnly && !activeOnly[m]) { d2[m] = Infinity; continue; }
      rotate(bestRotation(models[m], tmp), models[m], rot[m]);
      let e = 0;
      const r = rot[m];
      for (let i = 0; i < dim; i += 1) { const d = tmp[i] - r[i]; e += d * d; }
      d2[m] = e;
      if (e < lo) lo = e;
    }
    let sum = 0;
    const q = 1 / (2 * s * s);
    for (let m = 0; m < M; m += 1) {
      const e = (d2[m] - lo) * q;
      w[m] = e > 600 ? 0 : Math.exp(-e) * (weights ? weights[m] : 1);
      sum += w[m];
    }
    if (sum === 0) sum = 1;
    out.fill(0);
    for (let m = 0; m < M; m += 1) {
      if (w[m] === 0) continue;
      const k = w[m] / sum, r = rot[m];
      w[m] = k;
      for (let i = 0; i < dim; i += 1) out[i] += k * r[i];
    }
    shift(out, c);
    return n;
  }
}

// Radius of gyration: the root-mean-square distance of the points from their centre.
export function rg(a) {
  const c = centre(a), n = a.length / 3;
  let s = 0;
  for (let i = 0; i < n; i += 1) s += (a[3 * i] - c[0]) ** 2 + (a[3 * i + 1] - c[1]) ** 2 + (a[3 * i + 2] - c[2]) ** 2;
  return Math.sqrt(s / n);
}
