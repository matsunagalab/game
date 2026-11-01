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

// The exact denoiser of the two states, on the line joining them. The major state sits at 0 and the minor, with share p, at d.
// The odds are kept as a logarithm, because for states far apart both densities can underflow.
const posterior = (lo) => (lo > 700 ? 1 : lo < -700 ? 0 : 1 / (1 + Math.exp(-lo)));
export function twoField({ p, d = 10, w = 1 }) {
  const v = w * w, prior = Math.log(p / (1 - p));
  return (x, s, o) => {
    const q = v + s * s, u = x[0], r = posterior(prior - (((u - d) ** 2) - u * u) / (2 * q)), f = v / q;
    o[0] = (1 - r) * (f * u) + r * (d + f * (u - d));
  };
}

// The same two states as real structures: Gaussians of width w on every coordinate, centred on a and b, with no rotation.
export function chainField({ p, a, b, w = 1 }) {
  const v = w * w, prior = Math.log(p / (1 - p)), dim = a.length;
  return (x, s, o) => {
    const q = v + s * s, f = v / q;
    let d0 = 0, d1 = 0;
    for (let i = 0; i < dim; i += 1) { const u = x[i] - a[i], e = x[i] - b[i]; d0 += u * u; d1 += e * e; }
    const r = posterior(prior - (d1 - d0) / (2 * q));
    for (let i = 0; i < dim; i += 1) o[i] = (1 - r) * (a[i] + f * (x[i] - a[i])) + r * (b[i] + f * (x[i] - b[i]));
  };
}

// A generator that yields its progress and returns the share ending in the minor state.
export function* twoState({ p, d = 10, w = 1, preset = PRESETS.boltz2, n = 20000, seed = 1, steps = 200, smin = 0.0001, smax = 160, rho = 7, sdata = 16 }) {
  const S = schedule(steps, smin, smax, rho).map((v) => v * sdata), rng = makeRng(seed), mean = p * d, D = twoField({ p, d, w });
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
// One step of Algorithm 18 for N droplets on the line. The same arithmetic as stochasticStep with twoField, written out so that a phone can follow a finger.
function lineStep(u, N, s0, s1, { eta, gamma0, gammaMin, lambda }, prior, d, v, rng) {
  const g = s1 > gammaMin ? gamma0 : 0, hat = s0 * (1 + g), var0 = lambda * lambda * (hat * hat - s0 * s0), r = var0 > 0 ? Math.sqrt(var0) : 0, q = v + hat * hat, f = v / q, k = (eta * (s1 - hat)) / hat, c = 1 / (2 * q);
  for (let i = 0; i < N; i += 1) {
    let x = u[i];
    if (r > 0) x += r * rng.n();
    const lo = prior - ((x - d) * (x - d) - x * x) * c, w = lo > 700 ? 1 : lo < -700 ? 0 : 1 / (1 + Math.exp(-lo)), D = (1 - w) * (f * x) + w * (d + f * (x - d));
    u[i] = x + k * (x - D);
  }
}

// Droplets on the line joining the states, and a few whole chains of K real structures, on one schedule. The chains are real members of the run, each
// in all its coordinates, and they count toward the share. Each yield gives the noise reached. Returns the share in the minor state.
export function* chainRun({ p, a, b, w, N, K = 0, X = null, opt = PRESETS.boltz2, seed = 1, steps = 200, smin = 0.0001, smax = 160, rho = 7, sdata = 16, slice = 1 }) {
  const S = schedule(steps, smin, smax, rho).map((v) => v * sdata), dim = a.length, rng = makeRng(seed), chains = makeRng(seed + 1);
  let d = 0;
  for (let i = 0; i < dim; i += 1) d += (b[i] - a[i]) ** 2;
  d = Math.sqrt(d);
  const full = chainField({ p, a, b, w }), u = new Float64Array(N), x = new Float64Array(dim), o = new Float64Array(dim), prior = Math.log(p / (1 - p)), v = w * w;
  for (let i = 0; i < N; i += 1) u[i] = p * d + S[0] * rng.n();
  for (let c = 0; c < K; c += 1) for (let i = 0; i < dim; i += 1) X[c * dim + i] = (1 - p) * a[i] + p * b[i] + S[0] * chains.n();
  for (let k = 0; k + 1 < S.length; k += 1) {
    lineStep(u, N, S[k], S[k + 1], opt, prior, d, v, rng);
    for (let c = 0; c < K; c += 1) {
      for (let i = 0; i < dim; i += 1) x[i] = X[c * dim + i];
      stochasticStep(x, S[k], S[k + 1], full, o, chains, opt, dim);
      for (let i = 0; i < dim; i += 1) X[c * dim + i] = x[i];
    }
    if (k % slice === 0) yield S[k + 1];
  }
  let up = 0;
  for (let i = 0; i < N; i += 1) if (u[i] > d / 2) up += 1;
  for (let c = 0; c < K; c += 1) if (isOpen(X, c, a, b)) up += 1;
  return up / (N + K);
}
export const runChains = (o) => { const it = chainRun(o); let r; while (!(r = it.next()).done); return r.value; };
// Whether chain c of X lies nearer to b than to a.
export function isOpen(X, c, a, b) {
  const dim = a.length;
  let d0 = 0, d1 = 0;
  for (let i = 0; i < dim; i += 1) { const v = X[c * dim + i]; d0 += (v - a[i]) ** 2; d1 += (v - b[i]) ** 2; }
  return d1 < d0;
}
export const runTwoState = (o) => { const it = twoState(o); let r; while (!(r = it.next()).done); return r.value; };
export const oddsPower = (pIn, pOut) => Math.log(pOut / (1 - pOut)) / Math.log(pIn / (1 - pIn));
