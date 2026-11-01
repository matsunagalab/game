// Boltz-steering, rebuilt on the 2-D map. The recipe is Algorithm 2 of Wohlwend et al. (Boltz-1), and sample() in boltz/model/modules/diffusionv2.py:
// a flat-bottom energy on the denoised guess, gradient steps on that guess, and importance resampling among a few particles every third step.
import { schedule } from './sampler.js';

// Flat-bottom energy: zero outside a disc, rising linearly inside it. E and its gradient at (x, y).
export function discEnergy(zone, x, y, g) {
  const dx = x - zone.x, dy = y - zone.y, d = Math.hypot(dx, dy) || 1e-6, v = zone.r - d;
  if (v <= 0) { g[0] = 0; g[1] = 0; return 0; }
  g[0] = -dx / d / 10; g[1] = -dy / d / 10;
  return v / 10;
}

// N groups of `particles` each. mode: 'none', 'guide', 'resample', 'both'. Returns one final point per group.
export function* steerRun(D, rng, { zone, N = 1200, particles = 3, steps = 40, smax = 400, smin = 1, cx = -84, cy = 42, mode = 'both', lambda = 4, every = 3, gdSteps = 20, gdWeight = 1.2, gamma0 = 0.6, gammaMin = 4, noise = 1.003, eta = 1 }) {
  const S = schedule(steps, smin, smax, 7), P = (mode === 'resample' || mode === 'both') ? particles : 1, M = N * P;
  const x = new Float64Array(M), y = new Float64Array(M), ex = new Float64Array(M), ey = new Float64Array(M), Eprev = new Float64Array(M), Enow = new Float64Array(M), logw = new Float64Array(M);
  const g = [0, 0], grad = [0, 0], Ux = new Float64Array(M), Uy = new Float64Array(M);
  for (let i = 0; i < M; i += 1) { x[i] = cx + smax * rng.n(); y[i] = cy + smax * rng.n(); }
  const useGuide = mode === 'guide' || mode === 'both', useRes = mode === 'resample' || mode === 'both';
  for (let k = 0; k < steps; k += 1) {
    const s0 = S[k], s1 = S[k + 1], gam = s1 > gammaMin ? gamma0 : 0, hat = s0 * (1 + gam), v = noise * noise * (hat * hat - s0 * s0), r = v > 0 ? Math.sqrt(v) : 0;
    const doRes = useRes && ((k % every === 0 && v > 0) || k === steps - 1);
    for (let i = 0; i < M; i += 1) {
      ex[i] = r * rng.n(); ey[i] = r * rng.n();
      const nx = x[i] + ex[i], ny = y[i] + ey[i];
      D(nx, ny, hat, g);
      let hx = g[0], hy = g[1];
      if (doRes) {
        Enow[i] = discEnergy(zone, hx, hy, grad);
        const logG = k === 0 ? -Enow[i] : Eprev[i] - Enow[i];
        let ll = 0;
        if (useGuide && v > 0) ll = (ex[i] * ex[i] + ey[i] * ey[i] - (ex[i] + Ux[i]) ** 2 - (ey[i] + Uy[i]) ** 2) / (2 * v);
        logw[i] = ll + lambda * logG;
        Eprev[i] = Enow[i];
      }
      let ax = 0, ay = 0;
      if (useGuide && k < steps - 1) {
        for (let m = 0; m < gdSteps; m += 1) { discEnergy(zone, hx + ax, hy + ay, grad); ax -= gdWeight * grad[0]; ay -= gdWeight * grad[1]; }
        hx += ax; hy += ay;
        Ux[i] = ax * -eta * (s1 - hat) / hat; Uy[i] = ay * -eta * (s1 - hat) / hat;
      }
      const f = (eta * (s1 - hat)) / hat, nnx = nx + f * (nx - hx), nny = ny + f * (ny - hy);
      x[i] = nnx; y[i] = nny;
    }
    if (doRes) {
      const nx = new Float64Array(M), ny = new Float64Array(M), nE = new Float64Array(M), nUx = new Float64Array(M), nUy = new Float64Array(M), last = k === steps - 1;
      for (let a = 0; a < N; a += 1) {
        let top = -Infinity;
        for (let p = 0; p < P; p += 1) top = Math.max(top, logw[a * P + p]);
        const w = []; let t = 0;
        for (let p = 0; p < P; p += 1) { const q = Math.exp(logw[a * P + p] - top); w.push(q); t += q; }
        for (let p = 0; p < P; p += 1) {
          let u = rng.u() * t, c = 0;
          for (; c < P - 1; c += 1) { u -= w[c]; if (u <= 0) break; }
          const from = a * P + c, to = a * P + p;
          nx[to] = x[from]; ny[to] = y[from]; nE[to] = Eprev[from]; nUx[to] = Ux[from]; nUy[to] = Uy[from];
        }
      }
      x.set(nx); y.set(ny); Eprev.set(nE); Ux.set(nUx); Uy.set(nUy);
      void last;
    }
    yield { k, steps, s: s1, x, y, P };
  }
  const X = new Float32Array(N), Y = new Float32Array(N);
  for (let a = 0; a < N; a += 1) { X[a] = x[a * P]; Y[a] = y[a * P]; }
  return { X, Y };
}
