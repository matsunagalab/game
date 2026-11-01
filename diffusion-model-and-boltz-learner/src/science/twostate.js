// Two sharp, equal, well-separated states, sampled on the real Boltz-2 schedule in Angstrom with Algorithm 18.
// The states are isotropic Gaussians, so in any dimension the posterior depends only on the line joining them, and this 1-D run is exact.
// This is this game's own calculation, not a published result. It leaves out centring, random rotation and Boltz's alignment.
import { makeRng } from './rng.js';
import { schedule, stochasticStep } from './sampler.js';

export const PRESETS = {
  boltz2: { eta: 1.5, gamma0: 0.8, gammaMin: 1, lambda: 1.003 },
  boltz1: { eta: 1.638, gamma0: 0.605, gammaMin: 1.107, lambda: 0.901 },
  plain: { eta: 1, gamma0: 0, gammaMin: 1, lambda: 1 },
};
export const noiseBurst = ({ gamma0, lambda }) => lambda * Math.sqrt((1 + gamma0) ** 2 - 1); // In units of sigma.

// A generator that yields its progress and returns the share ending in the minor state.
export function* twoState({ p, d = 10, w = 1, preset = PRESETS.boltz2, n = 20000, seed = 1, steps = 200, smin = 0.0001, smax = 160, rho = 7, sdata = 16 }) {
  const S = schedule(steps, smin, smax, rho).map((v) => v * sdata), rng = makeRng(seed), mu = [0, d], a = [1 - p, p], v = w * w, mean = p * d;
  const D = (x, s, o) => {
    const q = v + s * s, l0 = a[0] * Math.exp(-((x[0] - mu[0]) ** 2) / (2 * q)), l1 = a[1] * Math.exp(-((x[0] - mu[1]) ** 2) / (2 * q)), t = l0 + l1 || 1, r = l1 / t;
    const m0 = mu[0] + (v / q) * (x[0] - mu[0]), m1 = mu[1] + (v / q) * (x[0] - mu[1]);
    o[0] = (1 - r) * m0 + r * m1;
  };
  let up = 0;
  const x = new Float64Array(1), b = new Float64Array(1);
  for (let i = 0; i < n; i += 1) {
    x[0] = mean + S[0] * rng.n();
    for (let k = 0; k + 1 < S.length; k += 1) stochasticStep(x, S[k], S[k + 1], D, b, rng, preset, 1);
    if (x[0] > d / 2) up += 1;
    if (i % 400 === 399) yield (i + 1) / n;
  }
  return up / n;
}
export const runTwoState = (o) => { const it = twoState(o); let r; while (!(r = it.next()).done); return r.value; };
export const oddsPower = (pIn, pOut) => Math.log(pOut / (1 - pOut)) / Math.log(pIn / (1 - pIn));
