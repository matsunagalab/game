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

// The exact denoiser of real structures held in one frame, with no rotation: Karras et al. 2022, Eq. 57, in full dimension.
// Noise outside the span of the structures cannot change the weights, so the sum needs only the coordinates inside that span. D of the part
// outside is zero. This is exact, and it makes thousands of runs cheap. A run works on those few coordinates, and expand() gives back all atoms.
export class Aligned {
  constructor(models) {
    this.models = models; this.M = models.length; this.dim = models[0].length; this.n = this.dim / 3;
    const { M, dim } = this, mean = this.mean = new Float64Array(dim), B = this.B = [];
    for (const y of models) for (let i = 0; i < dim; i += 1) mean[i] += y[i] / M;
    for (const y of models) {
      const v = Float64Array.from(y, (q, i) => q - mean[i]);
      for (let pass = 0; pass < 2; pass += 1) for (const b of B) { let d = 0; for (let i = 0; i < dim; i += 1) d += v[i] * b[i]; for (let i = 0; i < dim; i += 1) v[i] -= d * b[i]; }
      let t = 0;
      for (let i = 0; i < dim; i += 1) t += v[i] * v[i];
      t = Math.sqrt(t);
      if (t > 1e-6) { for (let i = 0; i < dim; i += 1) v[i] /= t; B.push(v); }
    }
    const P = this.P = B.length, C = this.C = new Float64Array(M * P);
    models.forEach((y, m) => { for (let p = 0; p < P; p += 1) { let d = 0; const b = B[p]; for (let i = 0; i < dim; i += 1) d += (y[i] - mean[i]) * b[i]; C[m * P + p] = d; } });
    this.w = new Float64Array(M);
    // Pigment needs the middle of the structures, so that they sit at the centre of the view.
    this.origin = centre(mean);
  }

  // Coordinates in the span of a full point.
  project(x, out = new Float64Array(this.P)) {
    const { B, P, dim, mean } = this;
    for (let p = 0; p < P; p += 1) { let d = 0; const b = B[p]; for (let i = 0; i < dim; i += 1) d += (x[i] - mean[i]) * b[i]; out[p] = d; }
    return out;
  }

  // The guess, inside the span. Writes it to out and leaves the weights in this.w. c is any array-like of P numbers.
  denoise(c, s, out) {
    const { M, P, C, w } = this, q = 1 / (2 * s * s);
    let lo = Infinity;
    for (let m = 0; m < M; m += 1) {
      const b = m * P;
      let e = 0;
      for (let p = 0; p < P; p += 1) { const d = c[p] - C[b + p]; e += d * d; }
      w[m] = e;
      if (e < lo) lo = e;
    }
    let sum = 0;
    for (let m = 0; m < M; m += 1) { const v = (w[m] - lo) * q; w[m] = v > 500 ? 0 : Math.exp(-v); sum += w[m]; }
    for (let p = 0; p < P; p += 1) out[p] = 0;
    for (let m = 0; m < M; m += 1) {
      if (w[m] === 0) continue;
      const k = (w[m] /= sum), b = m * P;
      for (let p = 0; p < P; p += 1) out[p] += k * C[b + p];
    }
  }

  // The nearest structure to a point of the span, and how far it is in A per atom.
  nearest(c, offset = 0) {
    const { M, P, C, n } = this;
    let lo = Infinity, at = 0;
    for (let m = 0; m < M; m += 1) {
      const b = m * P;
      let e = 0;
      for (let p = 0; p < P; p += 1) { const d = c[offset + p] - C[b + p]; e += d * d; }
      if (e < lo) { lo = e; at = m; }
    }
    return { m: at, rmsd: Math.sqrt(lo / n) };
  }

  // Takes the part in the span out of normal numbers, so that the noise of expand lies only outside it. Without this, that part would count twice.
  outside(xi, at = 0) {
    const { B, P, dim } = this;
    for (let p = 0; p < P; p += 1) {
      const b = B[p];
      let v = 0;
      for (let i = 0; i < dim; i += 1) v += b[i] * xi[at + i];
      for (let i = 0; i < dim; i += 1) xi[at + i] -= v * b[i];
    }
  }

  // All atoms of a point: the part in the span, plus noise s outside it. xi holds one number per coordinate, cleaned by outside.
  expand(c, s, xi, out, at = 0, ci = 0) {
    const { B, P, dim, mean } = this;
    for (let i = 0; i < dim; i += 1) out[at + i] = mean[i] + s * xi[i];
    for (let p = 0; p < P; p += 1) { const v = c[ci + p], b = B[p]; for (let i = 0; i < dim; i += 1) out[at + i] += v * b[i]; }
  }
}

// Radius of gyration: the root-mean-square distance of the points from their centre.
export function rg(a) {
  const c = centre(a), n = a.length / 3;
  let s = 0;
  for (let i = 0; i < n; i += 1) s += (a[3 * i] - c[0]) ** 2 + (a[3 * i + 1] - c[1]) ** 2 + (a[3 * i + 2] - c[2]) ** 2;
  return Math.sqrt(s / n);
}
