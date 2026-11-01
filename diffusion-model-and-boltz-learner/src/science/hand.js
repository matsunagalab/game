// How sure is a noisy point of its hand? The true shape y and its mirror image are compared, with rotation integrated out over K random
// rotations. x·(R y) needs only the 3 by 3 matrix sum y x^T, so each noise level is cheap enough to compute live.
import { makeRng } from './rng.js';
import { centre, randomRotation, rotate, shift } from './kabsch.js';

export class HandTest {
  constructor(shape, { K = 8000, draws = 40, seed = 3 } = {}) {
    const c = centre(shape), y = shift(shape, [-c[0], -c[1], -c[2]], new Float64Array(shape.length)), r = makeRng(seed), n = y.length / 3;
    this.K = K; this.draws = draws;
    this.R = new Float64Array(K * 9);
    for (let k = 0; k < K; k += 1) this.R.set(randomRotation(r), k * 9);
    // Sum y y^T turned by a random Q (the signal), and sum y n^T (the noise), for each draw.
    this.S = []; this.G = [];
    const yy = new Array(9).fill(0);
    for (let a = 0; a < n; a += 1) for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) yy[3 * i + j] += y[3 * a + i] * y[3 * a + j];
    for (let d = 0; d < draws; d += 1) {
      const Q = randomRotation(r), s = new Float64Array(9), g = new Float64Array(9);
      for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) for (let k = 0; k < 3; k += 1) s[3 * i + j] += yy[3 * i + k] * Q[3 * j + k]; // Sum y (Q y)^T
      for (let a = 0; a < n; a += 1) { const e = [r.n(), r.n(), r.n()]; for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) g[3 * i + j] += y[3 * a + i] * e[j]; }
      this.S.push(s); this.G.push(g);
    }
    this.a = new Float64Array(K); this.b = new Float64Array(K);
  }

  // Mean posterior for the true hand at noise s.
  posterior(s) {
    const { K, draws, R, S, G, a, b } = this, q = 1 / (s * s), T = new Float64Array(9);
    const logMean = (v) => { let m = -Infinity; for (let k = 0; k < K; k += 1) if (v[k] > m) m = v[k]; let t = 0; for (let k = 0; k < K; k += 1) { const e = v[k] - m; if (e > -40) t += Math.exp(e); } return m + Math.log(t / K); };
    let sum = 0;
    for (let d = 0; d < draws; d += 1) {
      for (let i = 0; i < 9; i += 1) T[i] = S[d][i] + s * G[d][i];
      for (let k = 0; k < K; k += 1) {
        const o = 9 * k;
        // x.(R y) = trace(R Y) with Y = sum y x^T. For the mirror image, the first row of Y changes sign.
        let v = 0;
        for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) v += R[o + 3 * i + j] * T[3 * j + i];
        let w = v;
        for (let i = 0; i < 3; i += 1) w -= 2 * R[o + 3 * i] * T[i];
        a[k] = v * q; b[k] = w * q;
      }
      sum += 1 / (1 + Math.exp(Math.max(-500, Math.min(500, logMean(b) - logMean(a)))));
    }
    return sum / draws;
  }

  // The noise at which the mean posterior falls to p, by bisection on log s.
  level(p, lo, hi) {
    for (let i = 0; i < 12; i += 1) { const m = Math.sqrt(lo * hi); if (this.posterior(m) > p) lo = m; else hi = m; }
    return Math.sqrt(lo * hi);
  }
}
export { rotate };
