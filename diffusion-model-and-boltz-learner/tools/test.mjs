// Screen-free checks of the mathematics. node tools/test.mjs
import assert from 'node:assert/strict';
import { Mix2D, FieldTable } from '../src/science/mix2d.js';
import { makeRng } from '../src/science/rng.js';
import { boltzSchedule, churnHeun, edm, euler, heun, ladderStep, schedule, stochasticStep } from '../src/science/sampler.js';
import { MLP } from '../src/science/mlp.js';
import { DenoiserNet } from '../src/science/net.js';
import { bestRotation, centre, fitRmsd, randomRotation, rmsd, rotate, shift } from '../src/science/kabsch.js';
import { Aligned, Ensemble, rg } from '../src/science/cart.js';
import { bondError, bondLengths, scanNow, squared } from '../src/science/blur.js';
import { BONDS, conformer, dihedral, DIHEDRALS } from '../src/science/dipeptide.js';
import { evenCount, heldOutBits, histogramModel, island, popError, populations, sliced } from '../src/science/stats.js';
import { adk, boltzRun, byAA, mdRun, rama, ubiquitin } from '../src/science/data.js';
import { discEnergy, steerRun } from '../src/science/steer.js';
import { place, piece, snap, NOISE } from '../src/music.js';
import { HandTest } from '../src/science/hand.js';
import { chainField, noiseBurst, oddsPower, PRESETS, runChains, runTwoState, twoField } from '../src/science/twostate.js';
import { adkSplit, BLUR, conformerSplit, everyFourth, ladderOf, logit, oddsMiss, PAD, padOpt, rareSet, slotSigma, STOPS, TWO, twoOpt } from '../src/science/levels.js';

let passed = 0;
const ok = (name, f) => { f(); passed += 1; console.log(`ok  ${name}`); };
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);
const near2 = near;

ok('exact denoiser equals the score of a Gaussian mixture, checked by finite differences (Tweedie)', () => {
  const r = makeRng(1), n = 200, x = new Float32Array(n), y = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { x[i] = (i % 2 ? 40 : -40) + 9 * r.n(); y[i] = 12 * r.n(); }
  const m = new Mix2D(x, y), o = [0, 0];
  for (const s of [3, 10, 30, 100]) {
    for (let t = 0; t < 40; t += 1) {
      const px = 80 * (r.u() - 0.5), py = 60 * (r.u() - 0.5), h = 1e-3;
      m.denoise(px, py, s, o);
      const sx = (m.logp(px + h, py, s) - m.logp(px - h, py, s)) / (2 * h), sy = (m.logp(px, py + h, s) - m.logp(px, py - h, s)) / (2 * h);
      near(sx, (o[0] - px) / (s * s), 2e-3, 'score x'); near(sy, (o[1] - py) / (s * s), 2e-3, 'score y');
    }
  }
});

ok('posterior weights sum to 1 and give the same mean as denoise', () => {
  const r = makeRng(2), n = 300, x = new Float32Array(n), y = new Float32Array(n), w = new Float64Array(n), o = [0, 0];
  for (let i = 0; i < n; i += 1) { x[i] = 50 * r.n(); y[i] = 50 * r.n(); }
  const m = new Mix2D(x, y);
  m.weights(5, -7, 13, w); m.denoise(5, -7, 13, o);
  let t = 0, ax = 0, ay = 0;
  for (let i = 0; i < n; i += 1) { t += w[i]; ax += w[i] * x[i]; ay += w[i] * y[i]; }
  near(t, 1, 1e-9); near(ax, o[0], 1e-4); near(ay, o[1], 1e-4);
});

ok('near() gives the same sum as the full sum', () => {
  const d = rama().train, m = new Mix2D(d.x, d.y).index(4), r = makeRng(3), a = [0, 0], b = [0, 0];
  for (const s of [0.5, 1, 2, 4]) for (let t = 0; t < 200; t += 1) { const i = r.int(m.n), px = d.x[i] + s * r.n(), py = d.y[i] + s * r.n(); m.near(px, py, s, a); m.denoise(px, py, s, b); near(a[0], b[0], 0.05 + s * 0.02); near(a[1], b[1], 0.05 + s * 0.02); }
});

ok('the stored field matches the exact field within about 2% of sigma on average', () => {
  const d = rama().train, m = new Mix2D(d.x, d.y).index(4), T = new FieldTable(m, { low: 5, high: 800, levels: 20, grid: 96 }).ready(), r = makeRng(4), a = [0, 0], b = [0, 0];
  for (const s of [5, 8, 12, 20, 40, 80, 160, 400]) {
    let e = 0;
    for (let k = 0; k < 800; k += 1) { const i = r.int(m.n), px = d.x[i] + s * r.n(), py = d.y[i] + s * r.n(); T.at(px, py, s, a); m.denoise(px, py, s, b); e += Math.hypot(a[0] - b[0], a[1] - b[1]); }
    assert.ok(e / 800 / s < 0.02, `table error at ${s}: ${e / 800 / s}`);
  }
});

ok('samplers recover a known 1-D distribution, a two-Gaussian mixture', () => {
  // Data: 70% at -1, 30% at +2, each with variance 0.01. The denoiser is analytic.
  const w = [0.7, 0.3], mu = [-1, 2], v = 0.01;
  const D = (x, s, out) => {
    const q = v + s * s, a = w.map((p, k) => p * Math.exp(-((x[0] - mu[k]) ** 2) / (2 * q))), t = a[0] + a[1];
    out[0] = (a[0] * (mu[0] + (v / q) * (x[0] - mu[0])) + a[1] * (mu[1] + (v / q) * (x[0] - mu[1]))) / t;
  };
  const S = schedule(120, 0.002, 30, 7), r = makeRng(5), run = (step) => {
    let up = 0, mean = 0, n = 6000; const x = new Float64Array(1), b = new Float64Array(1);
    for (let i = 0; i < n; i += 1) { x[0] = 0.1 + 30 * r.n(); for (let k = 0; k + 1 < S.length; k += 1) step(x, S[k], S[k + 1], D, b); if (x[0] > 0.5) up += 1; mean += x[0]; }
    return { up: up / n, mean: mean / n };
  };
  for (const [name, step] of [['euler', (x, a, c, f, b) => euler(x, a, c, f, b, 1)], ['heun', (x, a, c, f, b) => heun(x, a, c, f, b, 1)], ['churn', (x, a, c, f, b) => churnHeun(x, a, c, f, b, r, 0.2, 1)], ['alg18 eta=1 no noise', (x, a, c, f, b) => stochasticStep(x, a, c, f, b, r, { gamma0: 0, lambda: 1, eta: 1 }, 1)]]) {
    const q = run(step);
    near(q.up, 0.3, 0.025, name); near(q.mean, -0.1, 0.09, name);
  }
});

ok('Algorithm 18 with gamma 0, lambda 1, eta 1 reduces to Euler', () => {
  const D = (x, s, out) => { out[0] = 0.5 * x[0]; out[1] = -x[1]; }, r = makeRng(6), a = new Float64Array([3, 4]), b = new Float64Array([3, 4]), g = new Float64Array(2);
  euler(a, 10, 7, D, g); stochasticStep(b, 10, 7, D, g, r, { gamma0: 0, lambda: 1, eta: 1 });
  near(a[0], b[0], 1e-12); near(a[1], b[1], 1e-12);
});

ok('noise schedule formula and Boltz constants', () => {
  const S = schedule(18, 0.002, 80, 7);
  near(S[0], 80, 1e-9); near(S[17], 0.002, 1e-9); assert.equal(S[18], 0);
  const B = boltzSchedule(200); near(B[0], 2560, 1e-6); near(B[199], 0.0016, 1e-9); assert.equal(B[200], 0);
  const c = (lo, hi) => B.slice(0, 200).filter((v) => v >= lo && v < hi).length;
  assert.equal(c(16, 1e9), 118); assert.equal(c(1, 16), 37); assert.equal(c(0, 1), 45);
});

ok('EDM preconditioning matches Table 1 of Karras et al., and the unit-variance derivation behind it', () => {
  const d = 0.5;
  for (const s of [0.01, 0.3, 1, 7, 80]) {
    near(edm.cskip(s, d), d * d / (s * s + d * d), 1e-12);
    near(edm.cout(s, d), s * d / Math.sqrt(s * s + d * d), 1e-12);
    near(edm.cin(s, d), 1 / Math.sqrt(s * s + d * d), 1e-12);
    near(edm.lambda(s, d), (s * s + d * d) / (s * d) ** 2, 1e-9);
    near(edm.cin(s, d) ** 2 * (d * d + s * s), 1, 1e-12); // Input of unit variance
    near(edm.lambda(s, d) * edm.cout(s, d) ** 2, 1, 1e-12); // Effective loss weight of 1
    const k = edm.cskip(s, d); near(edm.cout(s, d) ** 2, (1 - k) ** 2 * d * d + k * k * s * s, 1e-12); // Target of unit variance
  }
});

ok('the denoising identity: with no network, cskip and cout give the Gaussian optimum for Gaussian data', () => {
  // For y ~ N(0, d^2), the optimal denoiser is d^2/(d^2+s^2) x, which is exactly cskip x.
  for (const [s, d] of [[1, 1], [0.3, 1], [4, 1]]) near(edm.cskip(s, d) * 2.5, (d * d / (d * d + s * s)) * 2.5, 1e-12);
});

ok('MLP gradient matches finite differences', () => {
  const r = makeRng(7), n = new MLP([3, 6, 5, 2], r), input = [0.3, -0.7, 0.2], target = [0.1, 0.4];
  const loss = () => { const o = n.forward(input); return (o[0] - target[0]) ** 2 + (o[1] - target[1]) ** 2; };
  n.zero(); const o = n.forward(input), g = [2 * (o[0] - target[0]), 2 * (o[1] - target[1])]; n.backward(g);
  for (let k = 0; k < n.P.length; k += 1) {
    for (const i of [0, Math.min(3, n.P[k].length - 1), n.P[k].length - 1]) {
      const v = n.P[k][i], h = 1e-6;
      n.P[k][i] = v + h; const a = loss(); n.P[k][i] = v - h; const b = loss(); n.P[k][i] = v;
      near(n.grad[k][i], (a - b) / (2 * h), 1e-5, `grad ${k} ${i}`);
    }
  }
});

ok('the denoiser network learns the islands, in under 1,500 steps', () => {
  const d = rama(), m = new Mix2D(d.train.x, d.train.y), net = new DenoiserNet({ mx: m.mx, my: m.my, sdata: m.sdata, width: 48, depth: 3, seed: 5 });
  let first = 0, last = 0;
  for (let k = 0; k < 1500; k += 1) { const l = net.step(d.train.x, d.train.y, 64); if (k < 100) first += l / 100; if (k >= 1400) last += l / 100; }
  assert.ok(last < first, 'loss should fall');
  const N = 800, r = makeRng(9), S = schedule(14, 0.8, 300, 7), X = new Float32Array(N), Y = new Float32Array(N), x = new Float64Array(2), b = new Float64Array(2), f = (p, s, o) => net.D(p[0], p[1], s, o);
  for (let i = 0; i < N; i += 1) { x[0] = m.mx + 300 * r.n(); x[1] = m.my + 300 * r.n(); for (let k = 0; k < 14; k += 1) heun(x, S[k], S[k + 1], f, b); X[i] = x[0]; Y[i] = x[1]; }
  assert.ok(popError(populations(X, Y), populations(d.test.x, d.test.y)) < 0.06);
  assert.ok(sliced(X, Y, d.test.x, d.test.y) < 8);
});

ok('Kabsch finds a known rotation, and refuses to turn a mirror image', () => {
  const r = makeRng(10), n = 40, a = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i += 1) a[i] = 6 * r.n();
  const c = centre(a), y = shift(a, [-c[0], -c[1], -c[2]], new Float64Array(a.length));
  for (let t = 0; t < 20; t += 1) { const R = randomRotation(r), x = rotate(R, y), Q = bestRotation(y, x); near(rmsd(rotate(Q, y), x), 0, 1e-8, 'rmsd'); near(Q[0] * (Q[4] * Q[8] - Q[5] * Q[7]) - Q[1] * (Q[3] * Q[8] - Q[5] * Q[6]) + Q[2] * (Q[3] * Q[7] - Q[4] * Q[6]), 1, 1e-9, 'det'); }
  const m = new Float64Array(y); for (let i = 0; i < m.length; i += 3) m[i] = -m[i];
  assert.ok(fitRmsd(y, m) > 1); near(fitRmsd(y, m, { mirror: true }), 0, 1e-8);
});

ok('Cartesian denoiser: a noisy conformer returns close to the set, and low noise gives a copy', () => {
  const E = new Ensemble(ubiquitin().models), r = makeRng(11), x = new Float64Array(E.models[5]), o = new Float64Array(E.dim);
  for (let i = 0; i < E.dim; i += 1) x[i] += 0.05 * r.n();
  E.denoise(x, 0.05, o);
  assert.ok(fitRmsd(o, E.models[5]) < 0.02);
  assert.ok(rg(E.models[0]) > 10 && rg(E.models[0]) < 13);
});

ok('held-out score of the histogram: peaks in the middle, overfit at the fine end', () => {
  const { train, test } = rama(), a = heldOutBits(histogramModel(train, 60, 0.02), test), b = heldOutBits(histogramModel(train, 6, 0.02), test), c = heldOutBits(histogramModel(train, 1, 0.02), test), ct = heldOutBits(histogramModel(train, 1, 0.02), train);
  assert.ok(b > a && b > c && ct > b, `${a} ${b} ${c} ${ct}`);
});

ok('held-out score of the histogram: a tenth of the data moves the best cell further than it moves a blur', () => {
  const { train, test } = rama(), W = [20, 15, 12, 10, 7.5, 6, 5, 4], r = makeRng(5), few = { x: new Float32Array(800), y: new Float32Array(800) };
  for (let i = 0; i < 800; i += 1) { const k = r.int(train.x.length); few.x[i] = train.x[k]; few.y[i] = train.y[k]; }
  const best = (d) => W.reduce((b, w) => (heldOutBits(histogramModel(d, w, 0.02), test) > heldOutBits(histogramModel(d, b, 0.02), test) ? w : b));
  console.log(`    best cell ${best(train)} with 8,000, ${best(few)} with 800`);
  assert.ok(best(train) <= 7.5 && best(few) >= 10);
});

ok('population estimates: island labels and the population error', () => {
  assert.equal(island(-60, -40), 0); assert.equal(island(-120, 130), 1); assert.equal(island(60, 40), 2);
  const p = populations(Float32Array.from([-60, -60, -120, 60]), Float32Array.from([-40, -30, 130, 40]));
  assert.deepEqual(p, [0.5, 0.25, 0.25]);
  near(popError([0.5, 0.5, 0], [0.5, 0.25, 0.25]), 0.25, 1e-12);
  // Multinomial sampling from known populations recovers them.
  const r = makeRng(12), n = 20000, q = [0.55, 0.42, 0.03], X = new Float32Array(n), Y = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { const u = r.u(); if (u < q[0]) { X[i] = -60; Y[i] = -40; } else if (u < q[0] + q[1]) { X[i] = -120; Y[i] = 130; } else { X[i] = 60; Y[i] = 40; } }
  const e = populations(X, Y); for (let k = 0; k < 3; k += 1) near(e[k], q[k], 0.012);
});

ok('steering: the energy is flat outside, the gradient points out, and the zone empties', () => {
  const z = { x: 0, y: 0, r: 10 }, g = [0, 0];
  assert.equal(discEnergy(z, 20, 0, g), 0); assert.deepEqual(g, [0, 0]);
  near(discEnergy(z, 6, 0, g), 0.4, 1e-9); assert.ok(g[0] < 0, 'gradient grows energy inward');
  const d = rama().train, m = new Mix2D(d.x, d.y).index(4), T = new FieldTable(m, { low: 5, high: 800, levels: 20, grid: 96 }).ready(), zone = { x: -110, y: 140, r: 45 }, it = steerRun((x, y, s, o) => T.at(x, y, s, o), makeRng(7), { zone, N: 400, mode: 'both', lambda: 4, gdWeight: 25 });
  let r; while (!(r = it.next()).done);
  let v = 0; for (let i = 0; i < 400; i += 1) if (Math.hypot(r.value.X[i] - zone.x, r.value.Y[i] - zone.y) < zone.r) v += 1;
  assert.ok(v / 400 < 0.02);
});

ok('music: no noise leaves the score exact, full noise has the set spread, and notes stay in the scale', () => {
  const p = piece(1), n = p.notes[0];
  assert.deepEqual(place(n, 0, 1.3, -0.7), { offset: 0, midi: n.midi });
  const r = makeRng(14); let t = 0, q = 0; const N = 4000;
  for (let i = 0; i < N; i += 1) { const a = place({ midi: 74 }, 1, r.n(), r.n()); t += a.offset ** 2; q += (a.midi - 74) ** 2; assert.ok([2, 4, 6, 9, 11].includes(a.midi % 12)); }
  near(Math.sqrt(t / N), NOISE.time, 0.1); near(Math.sqrt(q / N), NOISE.pitch, 1.5);
  assert.equal(snap(74.4), 74);
});

ok('data: counts and basic geometry', () => {
  const { train, test } = rama();
  assert.equal(train.x.length, 8000); assert.equal(test.x.length, 2000);
  assert.ok(byAA('G').x.length > 1000);
  const K = adk(); assert.equal(K.n, 214); assert.ok(fitRmsd(K.models[K.ids.indexOf('4AKEA')], K.models[K.ids.indexOf('1AKEA')]) > 6.5);
  const B = boltzRun(); assert.equal(B.frames.length, 20); near(B.frames[0].sigma, 4608, 0.1); near(fitRmsd(B.frames[19].denoised, B.finals['seed 42']), 0, 0.02);
  near(Math.sqrt(boltzRg0(B)), 7943, 400, 'noisy input spread at step 1');
  const m = mdRun(); assert.ok(m && m.frames > 1000); near(m.pop.reduce((a, b) => a + b, 0), 1, 1e-9); near(m.hist.reduce((a, b) => a + b, 0), 1, 1e-3);
  function boltzRg0(R) { const r = rg(R.frames[0].noisy); return r * r; }
});

// Numbers that the chapters state in words. If these fail, the sentences on screen have gone stale.
ok('guidance identity: conditional score = plain score + slope of log p(c | x)', () => {
  const a = byAA('G'), g0 = rama().train, all = new Mix2D(Float32Array.from([...g0.x, ...a.x]), Float32Array.from([...g0.y, ...a.y])), G = new Mix2D(a.x, a.y), o = [0, 0], s = 30, x = 40, y = 100, h = 0.02, pc = a.x.length / all.n;
  const logC = (px, py) => Math.log(pc) + G.logp(px, py, s) - all.logp(px, py, s);
  G.denoise(x, y, s, o); const cx = (o[0] - x) / (s * s), cy = (o[1] - y) / (s * s);
  all.denoise(x, y, s, o); const ux = (o[0] - x) / (s * s), uy = (o[1] - y) / (s * s);
  near(ux + (logC(x + h, y) - logC(x - h, y)) / (2 * h), cx, 1e-6); near(uy + (logC(x, y + h) - logC(x, y - h)) / (2 * h), cy, 1e-6);
});

ok('sentences on screen: chapter 5 network size, chapter 7 closed share', () => {
  const d = rama(), m = new Mix2D(d.train.x, d.train.y), net = new DenoiserNet({ mx: m.mx, my: m.my, sdata: m.sdata, width: 48, depth: 3 });
  assert.equal(net.net.count, 5666);
  const K = adk(), E = new Ensemble(K.models), S = schedule(36, 0.05, 90, 7), x = new Float64Array(E.dim), o = new Float64Array(E.dim), a = K.models[K.ids.indexOf('4AKEA')], b = K.models[K.ids.indexOf('1AKEA')], r = makeRng(77);
  let c = 0; const N = 300;
  for (let t = 0; t < N; t += 1) { for (let i = 0; i < E.dim; i += 1) x[i] = 90 * r.n(); for (let k = 0; k + 1 < S.length; k += 1) { E.denoise(x, S[k], o); const f = (S[k + 1] - S[k]) / S[k]; for (let i = 0; i < E.dim; i += 1) x[i] += f * (x[i] - o[i]); } if (fitRmsd(x, b) < fitRmsd(x, a)) c += 1; }
  console.log(`    closed in ${c} of ${N}`);
  near(c / N, 0.78, 0.03, 'closed share');
});

// The chapter 9 sampler, in the same order as the game: droplets run one after another from one random stream.
const mdField = (() => { let T = null; return () => { if (!T) { const m = mdRun(), mix = new Mix2D(m.x, m.y).index(4); T = new FieldTable(mix, { low: 5, high: 800, levels: 20, grid: 96 }).ready(); } return T; }; })();
function sample9(opt, { seed = 1, n = 4000, meas = 4000, steps = 60, smax = 400, smin = 1, sched = null, D = null } = {}) {
  const F = mdField(), S = sched ?? schedule(steps, smin, smax, 7), rng = makeRng(seed), X = new Float64Array(n), Y = new Float64Array(n), p = new Float64Array(2), g = new Float64Array(2);
  const Dx = D ?? ((x, s, o) => F.at(x[0], x[1], s, o)), Df = D ?? ((x, s, o) => F.fast(x[0], x[1], s, o));
  for (let i = 0; i < n; i += 1) { X[i] = F.mix.mx + S[0] * rng.n(); Y[i] = F.mix.my + S[0] * rng.n(); }
  for (let k = 0; k + 1 < S.length; k += 1) for (let i = 0; i < n; i += 1) { p[0] = X[i]; p[1] = Y[i]; stochasticStep(p, S[k], S[k + 1], i < meas ? Dx : Df, g, rng, opt); X[i] = p[0]; Y[i] = p[1]; }
  const a = Float32Array.from(X.subarray(0, meas || n)), b = Float32Array.from(Y.subarray(0, meas || n));
  return { X: a, Y: b, pop: populations(a, b) };
}
const meanPop = (opt, seeds, args = {}) => { const r = seeds.map((s) => sample9(opt, { seed: s, ...args }).pop); return [0, 1, 2].map((c) => r.reduce((a, b) => a + b[c], 0) / r.length); };
const S10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], G4 = { gammaMin: 4 };
const plainOpt = { eta: 1, gamma0: 0, lambda: 1, ...G4 }, etaOpt = { eta: 1.5, gamma0: 0, lambda: 1, ...G4 }, gamOpt = { eta: 1, gamma0: 0.8, lambda: 1.003, ...G4 }, b2Opt = { eta: 1.5, gamma0: 0.8, lambda: 1.003, ...G4 }, b1Opt = { eta: 1.638, gamma0: 0.605, lambda: 0.901, ...G4 };

ok('chapter 9: size of the noise burst, and how many steps it covers', () => {
  near(noiseBurst(PRESETS.boltz2), 1.50, 0.005); near(noiseBurst(PRESETS.boltz1), 1.13, 0.005);
  near(noiseBurst({ gamma0: Math.SQRT2 - 1, lambda: 1 }), 1.0, 1e-9); // Karras et al.'s cap.
  const S = boltzSchedule(200), on = S.slice(1, 200).filter((s) => s > 1).length;
  console.log(`    noise burst applies on ${on} of 200 steps`);
  assert.equal(on, 154);
});

ok('chapter 9: ten seeds at 60 steps, each setting alone and together', () => {
  const t = (o) => meanPop(o, S10), q = [t(plainOpt), t(etaOpt), t(gamOpt), t(b2Opt), t(b1Opt)];
  console.log(`    ${q.map((p) => p.map((v) => (100 * v).toFixed(1)).join('/')).join('  ')}`);
  const want = [[0.294, 0.670, 0.036], [0.158, 0.842, 0], [0.283, 0.697, 0.020], [0.223, 0.773, 0.004], [0.178, 0.821, 0.001]];
  q.forEach((p, i) => p.forEach((v, c) => near(v, want[i][c], c === 2 ? 0.0015 : 0.01, `setting ${i} region ${c}`)));
  near(1 - q[2][2] / q[0][2], 0.4, 0.08, 'noise alone loses about two fifths'); near(q[2][1] - q[0][1], 0.03, 0.006, 'strand side gains about 3 points');
  const r = S10.map((s) => sample9(b2Opt, { seed: s }).pop[2]);
  assert.ok(Math.min(...r) >= 0.003 && Math.max(...r) <= 0.0065, `${Math.min(...r)} ${Math.max(...r)}`);
});

ok('chapter 9: the game seed lies within one standard deviation of 12 seeds, and the range in the note', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], game = PAD.seed, row = (o) => seeds.map((s) => sample9(o, { seed: s, n: PAD.drops, meas: 0 }).pop[2]);
  const z = (r) => { const m = r.reduce((a, b) => a + b, 0) / r.length, d = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)); return (r[seeds.indexOf(game)] - m) / d; };
  const P = row(plainOpt), N = row(gamOpt), B = row(b2Opt);
  console.log(`    seed ${game}: z ${z(P).toFixed(1)} ${z(N).toFixed(1)} ${z(B).toFixed(1)}; Boltz-2 rare ${(100 * Math.min(...B)).toFixed(2)} to ${(100 * Math.max(...B)).toFixed(2)}`);
  for (const r of [P, N, B]) assert.ok(Math.abs(z(r)) < 1, `z ${z(r)}`);
  assert.ok(Math.min(...B) >= 0.0015 && Math.max(...B) <= 0.0065);
});

ok('chapter 9: halving needs about 1.1 on this schedule, about 1.04 on Boltz\'s, and the preset does not care', () => {
  const F = mdField(), mix = F.mix, bins = new Map();
  for (let i = 0; i < mix.n; i += 1) { const k = Math.round(mix.x[i] / 20) + 1000 * Math.round(mix.y[i] / 20), b = bins.get(k) ?? [0, 0, 0]; b[0] += 1; b[1] += mix.x[i]; b[2] += mix.y[i]; bins.set(k, b); }
  const BL = [...bins.values()], Dx = (x, s, o) => { if (s <= 800) { F.at(x[0], x[1], s, o); return; } const q = 1 / (2 * s * s); let w = 0, a = 0, b = 0; for (const c of BL) { const X = c[1] / c[0], Y = c[2] / c[0], e = Math.exp(-((x[0] - X) ** 2 + (x[1] - Y) ** 2) * q) * c[0]; w += e; a += e * X; b += e * Y; } o[0] = a / w; o[1] = b / w; };
  const sd = mix.sdata, sched = schedule(200, 1e-4, 160, 7).map((v) => v * sd), g = sd / 16, A = { n: 2500, sched, D: Dx }, sds = [1, 2, 3];
  const plain = meanPop({ eta: 1, gamma0: 0, lambda: 1, gammaMin: g }, sds, A), eta = meanPop({ eta: 1.5, gamma0: 0, lambda: 1, gammaMin: g }, sds, A), both = meanPop({ eta: 1.5, gamma0: 0.8, lambda: 1.003, gammaMin: g }, sds, A), h = meanPop({ eta: 1.04, gamma0: 0, lambda: 1, gammaMin: g }, sds, A);
  console.log(`    Boltz range: plain ${(100 * plain[2]).toFixed(2)}, eta 1.5 ${eta.map((v) => (100 * v).toFixed(1)).join('/')}, full preset ${(100 * both[2]).toFixed(2)}, eta 1.04 ${(100 * h[2]).toFixed(2)}`);
  assert.ok(eta[1] > 0.99); near(both[2], 0.004, 0.0025); assert.ok(h[2] / plain[2] > 0.35 && h[2] / plain[2] < 0.7);
  const e11 = meanPop({ eta: 1.1, gamma0: 0, lambda: 1, ...G4 }, [1, 2, 3, 4]), base = meanPop(plainOpt, [1, 2, 3, 4]);
  assert.ok(e11[2] / base[2] > 0.33 && e11[2] / base[2] < 0.67);
});

ok('chapter 9: reweighted rare region, about 1% with 4,000 droplets and higher with more', () => {
  const m = mdRun(), G = m.grid, tot = m.hist.reduce((a, b) => a + b, 0), cell = (x, y) => Math.min(G - 1, Math.max(0, Math.floor((x + 180) / 5))) + G * Math.min(G - 1, Math.max(0, Math.floor((y + 100) / 5)));
  const rew = (r) => { const q = new Float64Array(G * G), n = r.X.length, c = [0, 0, 0]; let s = 0; for (let i = 0; i < n; i += 1) q[cell(r.X[i], r.Y[i])] += 1; for (let i = 0; i < n; i += 1) { const k = cell(r.X[i], r.Y[i]), w = (m.hist[k] / tot) / (q[k] / n); s += w; c[r.X[i] > 0 ? 2 : r.Y[i] > 45 ? 1 : 0] += w; } return c[2] / s; };
  const few = [1, 2, 3, 4].map((s) => rew(sample9(b2Opt, { seed: s, n: 9000 }))), many = rew(sample9(b2Opt, { seed: 1, n: 40000, meas: 40000 }));
  console.log(`    4,000 droplets ${few.map((v) => (100 * v).toFixed(1)).join(' ')}; 40,000 droplets ${(100 * many).toFixed(1)}`);
  near(few.reduce((a, b) => a + b) / few.length, 0.0105, 0.003); near(many, 0.019, 0.004);
});

ok('chapter 9: the power depends on width against separation, not on separation alone', () => {
  const pw = (d, w) => oddsPower(0.1, runTwoState({ p: 0.1, d, w, n: 40000, seed: 3 })), wide = [10, 30, 119.5].map((d) => pw(d, 0.3)), close = [4, 3, 2, 1].map((d) => pw(d, 0.3)), broad = [1, 3, 5].map((w) => pw(10, w));
  console.log(`    width 0.3 at 10, 30, 119.5 A: ${wide.map((v) => v.toFixed(2))}; at 4, 3, 2, 1 A: ${close.map((v) => v.toFixed(2))}; 10 A apart, width 1, 3, 5: ${broad.map((v) => v.toFixed(2))}`);
  for (const v of wide) near(v, 1.68, 0.05, 'separation alone does nothing');
  near(close[0], 1.74, 0.06); near(close[1], 1.98, 0.08); near(close[2], 2.62, 0.12); near(close[3], 4.06, 0.3);
  near(broad[0], 1.73, 0.05); near(broad[1], 1.5, 0.06); near(broad[2], 0.93, 0.07);
});

// The final widths of the two states, on Boltz-2's schedule in A.
function stateWidth({ w, opt, N = 12000, seed = 2 }) {
  const p = 0.1, d = 119.49, S = boltzSchedule(200), rng = makeRng(seed), D = twoField({ p, d, w }), x = new Float64Array(1), b = new Float64Array(1);
  let a = 0, c = 0, up = 0;
  for (let i = 0; i < N; i += 1) { x[0] = p * d + S[0] * rng.n(); for (let k = 0; k + 1 < S.length; k += 1) stochasticStep(x, S[k], S[k + 1], D, b, rng, opt, 1); if (x[0] > d / 2) up += 1; else { a += x[0] ** 2; c += 1; } }
  return { share: up / N, width: Math.sqrt(a / c) };
}

ok('chapter 9: one temperature does not describe the run, and the valley keeps only the share', () => {
  const w = [0.3, 1, 3].map((v) => stateWidth({ w: v, opt: PRESETS.boltz2 }).width);
  console.log(`    Boltz-2's settings: widths 0.3, 1, 3 A come out ${w.map((v) => v.toFixed(3))}`);
  near(w[0], 0.068, 0.004); near(w[1], 0.43, 0.02); near(w[2], 1.87, 0.08);
  for (let i = 0; i < 3; i += 1) assert.ok([0.3, 1, 3][i] ** 2 / w[i] ** 2 > 2.3, 'variance falls by more than 1.7');
  const q = [[0.886, 0.5], [0.819, 1]].map(([e, g]) => stateWidth({ w: 0.3, opt: { eta: e, gamma0: g, gammaMin: 1, lambda: 1.003 } })), plain = stateWidth({ w: 0.3, opt: { eta: 1, gamma0: 0, gammaMin: 1, lambda: 1 } });
  console.log(`    on the valley: share ${q.map((v) => (100 * v.share).toFixed(1))}, width ${q.map((v) => v.width.toFixed(3))}; at eta 1, gamma 0: ${plain.width.toFixed(3)}`);
  for (const v of q) near(v.share, 0.1, 0.012); near(q[0].width, 0.387, 0.02); near(q[1].width, 0.485, 0.02); near(plain.width, 0.3, 0.012);
});

ok('chapter 9: more steps repair neither eta nor fixed noise, for two states at a set 10%', () => {
  const noise = { eta: 1, gamma0: 0.8, gammaMin: 1, lambda: 1 }, plain = { ...noise, gamma0: 0 }, at = (o, steps) => runTwoState({ p: 0.1, d: 119.49, w: 0.3, preset: o, steps, n: 8000, seed: 3 }), r = [50, 200, 1000].map((s) => at(noise, s)), q = [50, 1000].map((s) => at(plain, s));
  console.log(`    noise alone at 50, 200, 1000 steps: ${r.map((v) => (100 * v).toFixed(1))}; no noise at 50, 1000: ${q.map((v) => (100 * v).toFixed(1))}`);
  for (const v of r) near(v, 0.07, 0.008, 'fixed noise stalls'); for (const v of q) near(v, 0.1, 0.012, 'no noise reaches the share');
});

// Heun on every step, for two exact states: the noise and step of Algorithm 18, with the average of two slopes.
function heunTwoState({ eta, gamma0, gammaMin = 0, lambda = 1, steps = 200, n = 60000, seed = 3, heun = true }) {
  const p = 0.1, d = 119.49, S = boltzSchedule(steps), rng = makeRng(seed), D = twoField({ p, d, w: 0.3 }), x = new Float64Array(1), y = new Float64Array(1), a = new Float64Array(1);
  let up = 0;
  for (let i = 0; i < n; i += 1) {
    x[0] = p * d + S[0] * rng.n();
    for (let k = 0; k + 1 < S.length; k += 1) {
      const s0 = S[k], s1 = S[k + 1], g = s1 > gammaMin ? gamma0 : 0, hat = s0 * (1 + g), v = lambda * lambda * (hat * hat - s0 * s0);
      if (v > 0) x[0] += Math.sqrt(v) * rng.n();
      D(x, hat, a);
      const d0 = (x[0] - a[0]) / hat, h = eta * (s1 - hat);
      y[0] = x[0] + h * d0;
      if (heun && s1 > 0) { D(y, s1, a); x[0] += 0.5 * h * (d0 + (y[0] - a[0]) / s1); } else x[0] = y[0];
    }
    if (x[0] > d / 2) up += 1;
  }
  return up / n;
}

ok('chapter 9: Heun recovers most at eta 1 and gets slightly worse with steps, and at eta 1.5 it cannot', () => {
  const E1 = { eta: 1, gamma0: 0.8, gammaMin: 1, lambda: 1.003 }, E2 = { ...E1, eta: 1.5 }, a = heunTwoState({ ...E1, heun: false }), b = heunTwoState(E1), c = heunTwoState({ ...E2, heun: false }), e = heunTwoState({ ...E2, n: 80000 }), few = heunTwoState({ eta: 1, gamma0: 0.8, steps: 50, n: 120000 }), many = heunTwoState({ eta: 1, gamma0: 0.8, steps: 3000, n: 30000 });
  console.log(`    eta 1: Euler ${(100 * a).toFixed(2)}, Heun ${(100 * b).toFixed(2)}; eta 1.5: Euler ${(100 * c).toFixed(2)}, Heun ${(100 * e).toFixed(2)}; Heun at 50 and 3000 steps ${(100 * few).toFixed(2)} ${(100 * many).toFixed(2)}`);
  near(a, 0.0705, 0.004); near(b, 0.0959, 0.004); near(c, 0.0242, 0.002); near(e, 0.0469, 0.003);
  near(few, 0.0965, 0.003); near(many, 0.0923, 0.005); assert.ok(many < few, 'more steps, slightly worse');
});

// One complex FFT, of a length that is a power of two.
function fftPlan(n) { const rev = new Uint32Array(n), bits = Math.log2(n), c = new Float64Array(n / 2), w = new Float64Array(n / 2); for (let i = 0; i < n; i += 1) { let r = 0; for (let b = 0; b < bits; b += 1) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r; } for (let i = 0; i < n / 2; i += 1) { c[i] = Math.cos((2 * Math.PI * i) / n); w[i] = Math.sin((2 * Math.PI * i) / n); } return { n, rev, c, w }; }
function fft1({ n, rev, c, w }, re, im, sign) {
  for (let i = 0; i < n; i += 1) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let L = 2; L <= n; L *= 2) { const h = L / 2, st = n / L; for (let i = 0; i < n; i += L) for (let k = 0; k < h; k += 1) { const a = i + k, b = a + h, cr = c[k * st], ci = sign * w[k * st], u = re[b] * cr - im[b] * ci, v = re[b] * ci + im[b] * cr; re[b] = re[a] - u; im[b] = im[a] - v; re[a] += u; im[a] += v; } }
}
function fft2(plan, re, im, sign) {
  const G = plan.n, a = new Float64Array(G), b = new Float64Array(G);
  for (let r = 0; r < G; r += 1) { for (let i = 0; i < G; i += 1) { a[i] = re[i + G * r]; b[i] = im[i + G * r]; } fft1(plan, a, b, sign); for (let i = 0; i < G; i += 1) { re[i + G * r] = a[i]; im[i + G * r] = b[i]; } }
  for (let q = 0; q < G; q += 1) { for (let i = 0; i < G; i += 1) { a[i] = re[q + G * i]; b[i] = im[q + G * i]; } fft1(plan, a, b, sign); for (let i = 0; i < G; i += 1) { re[q + G * i] = a[i]; im[q + G * i] = b[i]; } }
  if (sign > 0) { const v = 1 / (G * G); for (let i = 0; i < G * G; i += 1) { re[i] *= v; im[i] *= v; } }
}

// The sampler's density carried on a periodic grid, so with no droplets and no sampling error. Noise is an exact Gaussian in Fourier space, the field comes
// from the FFT of the 5 degree histogram of the frames, and mass moves by the deterministic map.
function torusGrid({ eta, gamma0, gammaMin, lambda }, { steps = PAD.steps, G = 256 } = {}) {
  const m = mdRun(), H = m.grid, plan = fftPlan(G), dx = 360 / G, N = G * G, f = new Float64Array(N).fill(1 / N), fi = new Float64Array(N), D = new Float64Array(N), Di = new Float64Array(N), k = Float64Array.from({ length: G }, (_, i) => (2 * Math.PI * (i < G / 2 ? i : i - G)) / (G * dx)), p = new Float64Array(N), pi = new Float64Array(N), u = new Float64Array(N), v = new Float64Array(N), to = new Float64Array(N);
  const deposit = (out, x, y, w) => { const a = (x + 180) / dx, b = (y + 100) / dx, i = Math.floor(a), j = Math.floor(b), s = a - i, t = b - j, I = ((i % G) + G) % G, J = ((j % G) + G) % G, I1 = (I + 1) % G, J1 = (J + 1) % G; out[I + G * J] += w * (1 - s) * (1 - t); out[I1 + G * J] += w * s * (1 - t); out[I + G * J1] += w * (1 - s) * t; out[I1 + G * J1] += w * s * t; };
  let sum = 0; for (const c of m.hist) sum += c;
  for (let b = 0; b < H; b += 1) for (let a = 0; a < H; a += 1) { const w = m.hist[a + H * b]; if (w > 0) deposit(D, -180 + (a + 0.5) * 5, -100 + (b + 0.5) * 5, w / sum); }
  fft2(plan, D, Di, -1);
  const S = schedule(steps, PAD.smin, PAD.smax, 7);
  for (let q = 0; q + 1 < S.length; q += 1) {
    const a = S[q], b = S[q + 1], gm = b > gammaMin ? gamma0 : 0, hat = a * (1 + gm), w = lambda * lambda * (hat * hat - a * a);
    if (w > 0) { fi.fill(0); fft2(plan, f, fi, -1); for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { const e = Math.exp(-0.5 * w * (k[i] * k[i] + k[j] * k[j])), n = i + G * j; f[n] *= e; fi[n] *= e; } fft2(plan, f, fi, 1); for (let n = 0; n < N; n += 1) if (f[n] < 0) f[n] = 0; }
    for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { const e = Math.exp(-0.5 * hat * hat * (k[i] * k[i] + k[j] * k[j])), n = i + G * j, r = D[n] * e, s = Di[n] * e; p[n] = r; pi[n] = s; u[n] = -k[i] * s - k[j] * r; v[n] = k[i] * r - k[j] * s; }
    fft2(plan, p, pi, 1); fft2(plan, u, v, 1);
    let top = 0; for (let n = 0; n < N; n += 1) if (p[n] > top) top = p[n];
    const floor = 1e-11 * top, c = eta * (hat - b) * hat;
    to.fill(0);
    for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { const n = i + G * j, x = -180 + i * dx, y = -100 + j * dx, ok2 = p[n] > floor; deposit(to, x + (ok2 ? (c * u[n]) / p[n] : 0), y + (ok2 ? (c * v[n]) / p[n] : 0), f[n]); }
    f.set(to);
  }
  let rare = 0, strand = 0, all = 0;
  for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { const n = i + G * j, x = -180 + i * dx, y = -100 + j * dx; all += f[n]; if (x > 0) rare += f[n]; else if (y > 45) strand += f[n]; }
  return { rare: rare / all, strand: strand / all, alpha: 1 - (rare + strand) / all };
}

ok('chapter 9: the order of the three rounds belongs to the flat map, and a torus reverses it', () => {
  const t = (o, a) => torusGrid(o, a).rare, plainT = t({ eta: 1, gamma0: 0, gammaMin: 4, lambda: 1 }), eta = t({ eta: 1.5, gamma0: 0, gammaMin: 4, lambda: 1 }), noise = t(padOpt(1, 0.8)), both = t(padOpt(1.5, 0.8)), flat = [meanPop(etaOpt, [1, 2, 3])[2], meanPop(gamOpt, [1, 2, 3])[2], meanPop(padOpt(1.5, 0.8), [1, 2, 3])[2]], m = mdRun();
  console.log(`    flat: eta ${(100 * flat[0]).toFixed(2)}, noise ${(100 * flat[1]).toFixed(2)}, both ${(100 * flat[2]).toFixed(2)}; torus, exact on a grid: plain ${(100 * plainT).toFixed(2)}, eta ${(100 * eta).toFixed(2)}, noise ${(100 * noise).toFixed(2)}, both ${(100 * both).toFixed(2)}`);
  assert.ok(flat[0] < flat[2], 'on the flat map, noise raises what a long step left'); assert.ok(both < eta, 'on the torus, noise lowers it');
  near(plainT, 0.0417, 0.001); near(eta, 0.0155, 0.001); near(noise, 0.0236, 0.001); near(both, 0.0059, 0.0005);
  const fine = torusGrid({ eta: 1, gamma0: 0, gammaMin: 4, lambda: 1 }, { steps: 600, G: 512 }).rare;
  console.log(`    the plain run at 600 steps ${(100 * fine).toFixed(2)}, the frames ${(100 * m.pop[2]).toFixed(2)}`);
  near(fine, 0.0352, 0.001); near(m.pop[2], 0.034, 0.001);
});

ok('chapter 9: the two-state calculation, odds to a power near 1.7, near 2.2 for Boltz-1', () => {
  const out = [0.034, 0.1, 0.3].map((p) => [p, runTwoState({ p })]), one = [0.034, 0.1, 0.3].map((p) => [p, runTwoState({ p, preset: PRESETS.boltz1, smin: 0.0004, rho: 8 })]);
  console.log(`    Boltz-2 ${out.map(([p, q]) => `${(100 * p).toFixed(1)}% to ${(100 * q).toFixed(2)}% power ${oddsPower(p, q).toFixed(2)}`).join(', ')}; Boltz-1 powers ${one.map(([p, q]) => oddsPower(p, q).toFixed(2)).join(' ')}`);
  near(out[0][1], 0.003, 0.0015); near(out[1][1], 0.023, 0.003); near(out[2][1], 0.2, 0.01);
  for (const [p, q] of out) near(oddsPower(p, q), 1.7, 0.1);
  for (const [p, q] of one) near(oddsPower(p, q), 2.2, 0.2);
});

ok('chapter 9: the reference, its errors, and the regions', () => {
  const m = mdRun(), r = m.perRun;
  assert.equal(r.length, 3);
  const want = [[0.373, 0.608, 0.019], [0.224, 0.732, 0.044], [0.341, 0.625, 0.034]];
  r.forEach((p, i) => p.forEach((v, c) => near(v, want[i][c], 0.002)));
  near(m.se[0], 0.045, 0.002); near(m.se[1], 0.039, 0.002); near(m.se[2], 0.007, 0.001);
  near(0.596 * Math.log(m.pop[1] / m.pop[2]), 1.77, 0.01); near(0.596 * m.se[2] / m.pop[2], 0.126, 0.002); near(m.pop[1] / m.pop[2], 19.5, 0.05);
  // Sensitivity to the cut in psi, from the 5 degree histogram.
  const G = m.grid, share = (cut) => { let s = 0; for (let b = 0; b < G; b += 1) for (let a = 0; a < 36; a += 1) if (-100 + (b + 0.5) * 5 < cut) s += m.hist[a + G * b]; return s; };
  near(share(45), m.pop[0], 0.003); near(share(20), 0.281, 0.003); near(share(75), 0.315, 0.003);
  let al = 0, rest = 0;
  for (let b = 0; b < G; b += 1) for (let a = 36; a < G; a += 1) { const y = -100 + (b + 0.5) * 5; if (y > -20 && y <= 100) al += m.hist[a + G * b]; else rest += m.hist[a + G * b]; }
  near(al, 0.030, 0.001); near(rest, 0.004, 0.001);
  assert.equal(m.distinct > 3000 && m.distinct < 7000, true);
});

ok('chapter 2: a 2% state between two large ones goes before they merge, and before an equal peak would', () => {
  const peaks = (w, s) => { const f = (x) => w.reduce((t, [a, m]) => t + a * Math.exp(-((x - m) ** 2) / (2 * s * s)), 0); let c = 0, p0 = f(-4), p1 = f(-3.999); for (let x = -3.998; x < 4; x += 0.001) { const p2 = f(x); if (p1 > p0 && p1 >= p2) c += 1; p0 = p1; p1 = p2; } return c; };
  const last = (w, k) => { let lo = 0.02, hi = 2; for (let i = 0; i < 26; i += 1) { const m = (lo + hi) / 2; if (peaks(w, m) >= k) lo = m; else hi = m; } return lo; };
  const rare = [[0.49, -1], [0.02, 0], [0.49, 1]], equal = [[1 / 3, -1], [1 / 3, 0], [1 / 3, 1]], rS = last(rare, 3), eS = last(equal, 3), mS = last(rare, 2);
  console.log(`    rare peak gone at ${rS.toFixed(3)} d, equal peak at ${eS.toFixed(3)} d, large states merge at ${mS.toFixed(3)} d`);
  assert.ok(rS < mS && rS < eS);
  // Noise on one side only: the real island, two-state, dies at 0.257 d, above the spread 0.14 d.
  const two = [[0.98, 0], [0.02, 1]]; near(last(two, 2), 0.257, 0.005); near(Math.sqrt(0.98 * 0.02), 0.14, 0.001);
});

ok('chapter 6: hand of a noisy point, and of the real guess', () => {
  const U = ubiquitin(), E = new Ensemble(U.models), y = E.models[0], W = new HandTest(y, { K: 8000, draws: 40, seed: 3 });
  const inRes = []; for (let i = 0; i < U.n; i += 1) if (U.res[i] === 23) inRes.push(i);
  const atom = (r) => inRes.find((i) => U.role[i] === r), cb = inRes.find((i) => U.role[i] === 0), four = [atom(1), atom(2), atom(3), cb], p4 = new Float64Array(12);
  four.forEach((a, k) => { p4[3 * k] = y[3 * a]; p4[3 * k + 1] = y[3 * a + 1]; p4[3 * k + 2] = y[3 * a + 2]; });
  const C = new HandTest(p4, { K: 8000, draws: 80, seed: 4 }), w90 = W.level(0.9, 20, 400), c90 = C.level(0.9, 0.05, 2);
  console.log(`    90% sure: whole ${w90.toFixed(1)} A, centre ${c90.toFixed(3)} A; at 133 A ${W.posterior(133).toFixed(2)}, at 0.43 A ${C.posterior(0.43).toFixed(2)}`);
  near(w90, 70, 12); near(c90, 0.3, 0.05); near(W.posterior(133), 0.6, 0.06); near(C.posterior(0.43), 0.78, 0.05);
  const B = boltzRun().hand;
  assert.equal(B.n, 130); assert.equal(B.guess[0], 130); assert.ok(Math.min(...B.guess) / 130 >= 0.984);
  assert.ok(B.noisy[0] / 130 < 0.7); assert.equal(B.noisy[15], 130);
});

ok('chapters 6 and 7: what the training noise reached, and how close step 1 is', () => {
  const zAt = (s) => (Math.log(s / 16) + 1.2) / 1.5, cut = 16 * Math.exp(-1.2 + 1.5 * 3.0902);
  near(zAt(4608), 4.57, 0.02); near(cut, 497, 2);
  assert.equal(boltzSchedule(200).slice(0, 200).filter((s) => 1.8 * s > cut).length, 63);
  const R = boltzRun(), f = R.frames[0].denoised, d = fitRmsd(f, R.frames[19].denoised), o = ['seed 43', 'second sample', '40 steps'].map((k) => fitRmsd(f, R.finals[k]));
  console.log(`    step 1 is ${d.toFixed(2)} A from its own end, ${o.map((v) => v.toFixed(2)).join(' ')} from others`);
  near(d, 1.87, 0.02); assert.ok(Math.min(...o) >= 1.95 && Math.max(...o) <= 2.45);
  near(2560 * 1.8, 4608, 1e-9);
});

ok('chapter 6: the simple hand formula against the noise average', () => {
  // With rotation known, the log-odds are Gaussian with mean m = d^2 / 2 s^2 and variance 2 m. Their mean posterior is 90% at m = 4.46.
  const mean = (m) => { let s = 0, w = 0; for (let z = -8; z <= 8; z += 0.01) { const g = Math.exp(-z * z / 2), L = m + Math.sqrt(2 * m) * z; s += g / (1 + Math.exp(-L)); w += g; } return s / w; };
  let lo = 1, hi = 20; for (let i = 0; i < 40; i += 1) { const c = (lo + hi) / 2; if (mean(c) < 0.9) lo = c; else hi = c; }
  near(lo, 4.46, 0.02);
  const sigma = (d) => d / Math.sqrt(2 * lo), simple = (d) => d / Math.sqrt(2 * Math.log(9));
  const U = ubiquitin(), y = new Ensemble(U.models).models[0], m = new Float64Array(y); for (let i = 0; i < m.length; i += 3) m[i] = -m[i];
  const dW = fitRmsd(y, m) * Math.sqrt(U.n), dC = 0.904;
  near(dW, 279.9, 0.2); near(simple(dW), 133, 1); near(sigma(dW), 94, 1); near(simple(dC), 0.43, 0.01); near(sigma(dC), 0.30, 0.01);
  // The local frame: C-beta reflected through the N, C-alpha, C plane.
  const ds = [];
  for (let r = 1; r <= 76; r += 1) {
    const idx = []; for (let i = 0; i < U.n; i += 1) if (U.res[i] === r) idx.push(i);
    const at = (q) => idx.find((i) => U.role[i] === q), B = idx.find((i) => U.role[i] === 0);
    if (B === undefined) continue;
    const p = (i) => [y[3 * i], y[3 * i + 1], y[3 * i + 2]], a = p(at(2)), u = p(at(1)).map((v, k) => v - a[k]), v = p(at(3)).map((w, k) => w - a[k]), b = p(B).map((w, k) => w - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    ds.push(2 * Math.abs(b[0] * n[0] + b[1] * n[1] + b[2] * n[2]) / Math.hypot(...n));
  }
  ds.sort((p, q) => p - q);
  near(ds[ds.length >> 1], 2.4, 0.1); near(sigma(ds[ds.length >> 1]), 0.8, 0.05);
});

ok('chapter 7: the closed share against the starting noise', () => {
  const K = adk(), E = new Ensemble(K.models), x = new Float64Array(E.dim), o = new Float64Array(E.dim), a = K.models[K.ids.indexOf('4AKEA')], b = K.models[K.ids.indexOf('1AKEA')];
  const share = (smax, N) => { const S = schedule(48, 0.05, smax, 7), r = makeRng(53); let c = 0; for (let t = 0; t < N; t += 1) { for (let i = 0; i < E.dim; i += 1) x[i] = smax * r.n(); for (let k = 0; k + 1 < S.length; k += 1) { E.denoise(x, S[k], o); const f = (S[k + 1] - S[k]) / S[k]; for (let i = 0; i < E.dim; i += 1) x[i] += f * (x[i] - o[i]); } if (fitRmsd(x, b) < fitRmsd(x, a)) c += 1; } return c / N; };
  const r = [60, 90, 250, 800].map((s) => share(s, 80));
  console.log(`    closed from 60, 90, 250, 800 A: ${r.map((v) => v.toFixed(2)).join(' ')}`);
  [0.94, 0.76, 0.48, 0.42].forEach((v, i) => near(r[i], v, 0.1));
});

ok('chapter 7: the closed share does not depend on the step count', () => {
  const K = adk(), E = new Ensemble(K.models), x = new Float64Array(E.dim), o = new Float64Array(E.dim), a = K.models[K.ids.indexOf('4AKEA')], b = K.models[K.ids.indexOf('1AKEA')];
  const share = (steps, N) => { const S = schedule(steps, 0.05, 90, 7), r = makeRng(77 + steps); let c = 0; for (let t = 0; t < N; t += 1) { for (let i = 0; i < E.dim; i += 1) x[i] = 90 * r.n(); for (let k = 0; k + 1 < S.length; k += 1) { E.denoise(x, S[k], o); const f = (S[k + 1] - S[k]) / S[k]; for (let i = 0; i < E.dim; i += 1) x[i] += f * (x[i] - o[i]); } if (fitRmsd(x, b) < fitRmsd(x, a)) c += 1; } return c / N; };
  const s36 = share(36, 150), s144 = share(144, 100);
  console.log(`    36 steps ${s36.toFixed(2)}, 144 steps ${s144.toFixed(2)}`);
  near(s36, s144, 0.12);
});

ok('chapter 1: the blur scores what the note says, and the answer to one level fails the next', () => {
  const W = BLUR.widths, U = ubiquitin(), K = adk(), run = (sp, M) => scanNow(sp.stored.map((i) => M[i]), sp.hidden.map((i) => M[i]), W), near = (r) => r.list.filter((c) => c.hidden >= r.list[r.best].hidden - BLUR.near).map((c) => c.w);
  const one = run(everyFourth(39), U.models), few = run(conformerSplit(39, BLUR.few), U.models), A = run(adkSplit(K, BLUR.adkHide), K.models), B = run(conformerSplit(39, BLUR.some), U.models);
  console.log(`    best ${W[one.best]} (${near(one)}), 4 stored ${W[few.best]} (${near(few)}), kinase ${W[A.best]} (${near(A)}), 12 stored ${W[B.best]} (${near(B)}); spacing ${one.spacing.toFixed(2)} ${few.spacing.toFixed(2)} ${A.spacing.toFixed(2)} ${B.spacing.toFixed(2)}`);
  assert.deepEqual(near(one), [1, 1.2]); assert.deepEqual(near(few), [1.5]);
  for (const w of near(one)) assert.ok(!near(few).includes(w), 'the first answer must fail with less data');
  for (const w of near(A)) assert.ok(!near(B).includes(w), 'one width must not fit both cases of level 3');
  assert.ok(one.list.every((c, i) => i === 0 || c.stored <= one.list[i - 1].stored + 1e-9), 'the stored score only falls as the width grows');
  near2(one.list[4].hidden, -218.9, 1, 'hidden score at 0.1 A');
  // The rule in the note, on all four cases: the peak lies at sqrt(<r^2>/3), r per atom to the nearest stored structure. The spacing of the stored ones is only a stand-in for r.
  const fine = Array.from({ length: 121 }, (_, i) => 0.2 * 1.01 ** (i * 2)), split = [[everyFourth(39), U.models], [conformerSplit(39, BLUR.few), U.models], [conformerSplit(39, BLUR.some), U.models], [adkSplit(K, BLUR.adkHide), K.models]];
  const rows = split.map(([sp, M]) => { const st = sp.stored.map((i) => M[i]), hi = sp.hidden.map((i) => M[i]), n = st[0].length / 3, r2 = hi.reduce((t, h) => t + Math.min(...st.map((y) => squared(h, y))) / n, 0) / hi.length, f = scanNow(st, hi, [...fine, 8]); return { rule: Math.sqrt(r2 / 3), peak: f.list[f.best].w, stand: f.spacing / Math.sqrt(3) }; });
  console.log(`    rule ${rows.map((q) => q.rule.toFixed(2))}; peak ${rows.map((q) => q.peak.toFixed(2))}; stand-in ${rows.map((q) => q.stand.toFixed(2))}`);
  rows.forEach((q, i) => { near2(q.rule, [1.05, 1.45, 1.24, 0.36][i], 0.01); near2(q.peak, q.rule, 0.03, 'the rule finds the peak'); near2(q.stand, [1.09, 1.34, 1.14, 0.29][i], 0.01); });
  // Hidden by PDB entry: no chain of a hidden entry is stored.
  const sp = adkSplit(K, BLUR.adkHide); assert.equal(sp.stored.length, 17); assert.equal(sp.hidden.length, 5);
  for (const i of sp.hidden) for (const j of sp.stored) assert.notEqual(K.ids[i].slice(0, 4), K.ids[j].slice(0, 4));
});

ok('chapter 1: the peak has broken bonds, and the hidden set is stable', () => {
  const U = ubiquitin(), n = U.n, r = makeRng(5), bonds = []; const a = U.models[0];
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < Math.min(n, i + 14); j += 1) if (Math.hypot(a[3 * i] - a[3 * j], a[3 * i + 1] - a[3 * j + 1], a[3 * i + 2] - a[3 * j + 2]) < 1.95) bonds.push([i, j]);
  const ref = bondLengths(a, bonds), err = (s) => { const y = new Float64Array(a); for (let i = 0; i < y.length; i += 1) y[i] += s * r.n(); return bondError(y, bonds, ref); };
  const real = (() => { let e = 0, c = 0; for (const b of bonds) { const v = U.models.map((m) => Math.hypot(m[3 * b[0]] - m[3 * b[1]], m[3 * b[0] + 1] - m[3 * b[1] + 1], m[3 * b[0] + 2] - m[3 * b[1] + 2])), m = v.reduce((p, q) => p + q) / v.length; for (const q of v) { e += (q - m) ** 2; c += 1; } } return Math.sqrt(e / c); })();
  console.log(`    bonds off ${err(0.05).toFixed(2)} at 0.05 A, ${err(1).toFixed(2)} at 1 A; real conformers vary by ${real.toFixed(3)}`);
  near2(err(1), 1.61, 0.04, 'bond error at the peak'); near2(err(0.56), 0.8, 0.04); near2(err(0.05), 0.07, 0.02); near2(real, 0.006, 0.001);
  const W = BLUR.widths, peak = [0, 1, 2, 3].map((off) => { const all = U.models.map((_, i) => i); return W[scanNow(all.filter((i) => i % 4 !== off).map((i) => U.models[i]), all.filter((i) => i % 4 === off).map((i) => U.models[i]), W).best]; });
  console.log(`    the four ways of hiding every fourth conformer peak at ${peak}`);
  for (const p of peak) assert.ok(p === 1 || p === 1.2);
  // The order of the file does not leak: neighbours in it are no closer than strangers.
  const D = (g) => { let t = 0, c = 0; for (let i = 0; i + g < 39; i += 1) { t += fitRmsd(U.models[i], U.models[i + g]); c += 1; } return t / c; };
  assert.ok(Math.abs(D(1) - D(10)) < 0.3, `${D(1)} ${D(10)}`);
});

ok('chapter 1: the peak depends on the atoms, and one width is what breaks bonds', () => {
  const U = ubiquitin(), sp = everyFourth(39), fine = Array.from({ length: 121 }, (_, i) => 0.2 * 1.01 ** (i * 2)).concat(8), part = (keep) => { const list = []; for (let a = 0; a < U.n; a += 1) if (keep(a)) list.push(a); return U.models.map((m) => { const o = new Float64Array(3 * list.length); list.forEach((a, i) => { o[3 * i] = m[3 * a]; o[3 * i + 1] = m[3 * a + 1]; o[3 * i + 2] = m[3 * a + 2]; }); return o; }); };
  const peak = (keep) => { const m = part(keep), f = scanNow(sp.stored.map((i) => m[i]), sp.hidden.map((i) => m[i]), fine); return f.list[f.best].w; };
  const p = [peak(() => true), peak((a) => U.res[a] <= 70), peak((a) => U.res[a] <= 70 && U.role[a] > 0), peak((a) => U.res[a] > 70)];
  console.log(`    all ${p[0].toFixed(2)}, without 71 to 76 ${p[1].toFixed(2)}, backbone 1 to 70 ${p[2].toFixed(2)}, tail ${p[3].toFixed(2)}`);
  near(p[0], 1.05, 0.03); near(p[1], 0.83, 0.03); near(p[2], 0.56, 0.03); near(p[3], 2.1, 0.08);
  // Noise with the ensemble's own covariance, on the same stored structures, at the move of the peak: a fifth of the bond error of one width.
  const a = U.models[0], dim = a.length, bonds = []; for (let i = 0; i < U.n; i += 1) for (let j = i + 1; j < Math.min(U.n, i + 14); j += 1) if (Math.hypot(a[3 * i] - a[3 * j], a[3 * i + 1] - a[3 * j + 1], a[3 * i + 2] - a[3 * j + 2]) < 1.95) bonds.push([i, j]);
  const ref = bondLengths(a, bonds), st = sp.stored.map((i) => U.models[i]), mean = new Float64Array(dim), r = makeRng(5); for (const m of st) for (let i = 0; i < dim; i += 1) mean[i] += m[i] / st.length;
  const f = 0.67, T = 300; let mv = 0, be = 0;
  for (let t = 0; t < T; t += 1) { const d = new Float64Array(dim); for (const m of st) { const z = r.n() * Math.sqrt(f / (st.length - 1)); for (let i = 0; i < dim; i += 1) d[i] += z * (m[i] - mean[i]); } const o = Float64Array.from(st[r.int(st.length)], (v, i) => v + d[i]); mv += d.reduce((q, v) => q + v * v, 0) / U.n; be += bondError(o, bonds, ref) ** 2; }
  const iso = new Float64Array(a); for (let i = 0; i < dim; i += 1) iso[i] += 1.04 * r.n();
  console.log(`    covariance noise moves ${Math.sqrt(mv / T).toFixed(2)} A per atom, bonds off ${Math.sqrt(be / T).toFixed(2)}; one width ${bondError(iso, bonds, ref).toFixed(2)}`);
  near(Math.sqrt(mv / T), 1.8, 0.1); near(Math.sqrt(be / T), 0.33, 0.04); near(bondError(iso, bonds, ref), 1.69, 0.06);
  // Two atoms alone: the same bond error at the same width, so dimension is not the cause.
  const rms = (s) => { let e = 0; const N = 40000; for (let i = 0; i < N; i += 1) e += (Math.hypot(1.5 + s * (r.n() - r.n()), s * (r.n() - r.n()), s * (r.n() - r.n())) - 1.5) ** 2; return Math.sqrt(e / N); };
  near(rms(0.05), 0.071, 0.003); near(rms(1), 1.6, 0.05);
});

ok('chapter 1: the spacing shown on the board can mislead, for four conformers at random', () => {
  const U = ubiquitin(), sp = everyFourth(39), hid = sp.hidden.map((i) => U.models[i]), r = makeRng(11), W = [...Array.from({ length: 40 }, (_, i) => 0.7 * 1.03 ** i), 8], xs = [], ys = [];
  for (let k = 0; k < 120; k += 1) { const p = [...sp.stored]; for (let i = p.length - 1; i > 0; i -= 1) { const j = r.int(i + 1); [p[i], p[j]] = [p[j], p[i]]; } const q = scanNow(p.slice(0, 4).map((i) => U.models[i]), hid, W); xs.push(q.spacing); ys.push(q.list[q.best].w); }
  const m = (a) => a.reduce((u, v) => u + v) / a.length, mx = m(xs), my = m(ys); let c = 0, a = 0, b = 0; xs.forEach((x, i) => { c += (x - mx) * (ys[i] - my); a += (x - mx) ** 2; b += (ys[i] - my) ** 2; });
  console.log(`    correlation of spacing and peak ${(c / Math.sqrt(a * b)).toFixed(2)}, mean peak ${my.toFixed(2)}`);
  assert.ok(c / Math.sqrt(a * b) < 0.1, 'wider spacing does not mean a wider peak'); near(my, 1.46, 0.03);
});

ok('chapter 1: on one hidden set, a sevenfold drop in stored conformers widens the peak about 1.3 times', () => {
  const U = ubiquitin(), r = makeRng(21), W = [...Array.from({ length: 56 }, (_, i) => 0.6 * 1.02 ** i), 8], peak = (st, hi) => { const q = scanNow(st, hi, W); return q.list[q.best].w; };
  let a = 0, b = 0; const T = 120;
  for (let k = 0; k < T; k += 1) { const p = U.models.map((_, i) => i); for (let i = p.length - 1; i > 0; i -= 1) { const j = r.int(i + 1); [p[i], p[j]] = [p[j], p[i]]; } const hid = p.slice(0, 10).map((i) => U.models[i]), st = p.slice(10).map((i) => U.models[i]); a += peak(st, hid) / T; b += peak(st.slice(0, 4), hid) / T; }
  console.log(`    ${a.toFixed(2)} to ${b.toFixed(2)} A, a factor of ${(b / a).toFixed(2)}`);
  near(b / a, 1.33, 0.07);
});

ok('chapter 1: the same blur on the 2-D map doubles its best width for a tenth of the data', () => {
  const M = rama(), Tn = 600, tx = M.test.x.subarray(0, Tn), ty = M.test.y.subarray(0, Tn), score = (X, Y, s) => { const q = 1 / (2 * s * s); let T = 0; for (let i = 0; i < Tn; i += 1) { let w = 0; for (let j = 0; j < X.length; j += 1) w += Math.exp(-((tx[i] - X[j]) ** 2 + (ty[i] - Y[j]) ** 2) * q); T += Math.log(w / X.length + 1e-300) - Math.log(2 * Math.PI * s * s); } return T; };
  const best = (X, Y) => { let b = 0, v = -Infinity; for (let s = 2; s <= 13; s *= 1.1) { const q = score(X, Y, s); if (q > v) { v = q; b = s; } } return b; }, r = makeRng(4), n = M.train.x.length, all = best(M.train.x, M.train.y), some = [0, 1, 2].map(() => { const X = new Float32Array(n / 10), Y = new Float32Array(n / 10); for (let i = 0; i < X.length; i += 1) { const k = r.int(n); X[i] = M.train.x[k]; Y[i] = M.train.y[k]; } return best(X, Y); }), mid = some.reduce((a, b) => a + b) / 3;
  console.log(`    best width ${all.toFixed(1)} with all, ${mid.toFixed(1)} with a tenth`);
  near(all, 3.5, 0.6); near(mid / all, 2, 0.45);
});

ok('chapter 1: a careless player rarely passes level 3, and following the feedback does', () => {
  const W = BLUR.widths, U = ubiquitin(), K = adk(), r = makeRng(8), M = 19;
  const cases = [scanNow(...(() => { const s = adkSplit(K, BLUR.adkHide); return [s.stored.map((i) => K.models[i]), s.hidden.map((i) => K.models[i])]; })(), W), scanNow(...(() => { const s = conformerSplit(39, BLUR.some); return [s.stored.map((i) => U.models[i]), s.hidden.map((i) => U.models[i])]; })(), W)];
  const hit = (c, k) => c.list[k].hidden >= c.list[c.best].hidden - BLUR.near;
  let won = 0; const games = 20000;
  for (let g = 0; g < games; g += 1) { let at = 0; for (let m = 0; m < 8 && at < 2; m += 1) at = hit(cases[at], r.int(M)) ? at + 1 : 0; if (at === 2) won += 1; }
  console.log(`    eight random drops pass level 3 in ${(100 * won / games).toFixed(1)}% of games`);
  assert.ok(won / games < 0.08);
  for (const c of cases) { let lo = 0, hi = M - 1, k = W.indexOf(3), t = 0, good = false; while (t < 7 && !good) { t += 1; if (hit(c, k)) good = true; else { if (k < c.best) lo = k + 1; else hi = k - 1; k = (lo + hi) >> 1; } } assert.ok(good && t <= 6, 'following too narrow and too wide finds it'); }
});

ok('the exact field in the span equals the full sum, in all coordinates', () => {
  const U = ubiquitin(), F = new Aligned(U.models), r = makeRng(9), x = new Float64Array(F.dim), full = new Float64Array(F.dim), o = new Float64Array(F.P), back = new Float64Array(F.dim), zero = new Float64Array(F.dim);
  assert.equal(F.P, 38);
  for (const s of [40, 8, 3, 0.8]) {
    for (let i = 0; i < F.dim; i += 1) x[i] = U.models[7][i] + s * r.n();
    const q = 1 / (2 * s * s), d = U.models.map((y) => squared(x, y)), lo = Math.min(...d), w = d.map((v) => Math.exp(-(v - lo) * q)), t = w.reduce((a, b) => a + b);
    full.fill(0); U.models.forEach((y, m) => { for (let i = 0; i < F.dim; i += 1) full[i] += (w[m] / t) * y[i]; });
    F.denoise(F.project(x), s, o); F.expand(o, 0, zero, back);
    for (let i = 0; i < F.dim; i += 50) near(back[i], full[i], 1e-6, `coordinate ${i} at ${s}`);
  }
  // Models come back from their own coordinates, and the nearest of a model is itself.
  const c = F.project(U.models[11]); F.expand(c, 0, zero, back); near(Math.sqrt(squared(back, U.models[11]) / F.n), 0, 1e-8); assert.equal(F.nearest(c).m, 11);
});

// Chapter 4, in the same order as the game: every sample takes step k before any takes step k + 1, on the exact field of real structures.
const fields = {};
const rareField = () => (fields.rare ??= (() => { const K = adk(), ids = rareSet(K); return { F: new Aligned(ids.map((i) => K.models[i])), state: ids.map((i) => K.state[i]) }; })());
const ubqField = () => (fields.ubq ??= { F: new Aligned(ubiquitin().models) });
function ladderRun({ F, state }, slots, seconds = [], { gamma = 0, N = STOPS.samples, seed = STOPS.seed, sigmas = null, heun = false } = {}) {
  const { P } = F, L = sigmas ? sigmas.map((s) => ({ s, second: heun })) : ladderOf(slots, seconds), S0 = L[0].s, start = makeRng(seed), noise = makeRng(seed + 1), c = new Float64Array(N * P), p = new Float64Array(P), g = new Float64Array(P), tmp = new Float64Array(2 * P), D = (a, s, o) => F.denoise(a, s, o), H = Math.min(64, N), last = new Float64Array(P * H), heat = [];
  L[L.length - 1].second = false;
  for (let i = 0; i < N * P; i += 1) c[i] = S0 * start.n();
  for (let i = 0; i < H; i += 1) { F.denoise(c.subarray(i * P, (i + 1) * P), S0, g); last.set(g, i * P); }
  let calls = 0;
  for (let k = 0; k < L.length; k += 1) {
    let used = 0;
    for (let i = 0; i < N; i += 1) { const b = i * P; for (let q = 0; q < P; q += 1) p[q] = c[b + q]; used = ladderStep(p, L, k, D, g, noise, gamma, P, tmp); for (let q = 0; q < P; q += 1) c[b + q] = p[q]; }
    calls += used;
    if (k + 1 < L.length) { let m = 0; for (let i = 0; i < H; i += 1) { F.denoise(c.subarray(i * P, (i + 1) * P), L[k + 1].s, g); for (let q = 0; q < P; q += 1) { const d = g[q] - last[i * P + q]; m += d * d; last[i * P + q] = g[q]; } } heat[k] = Math.sqrt(m / H); }
  }
  let rm = 0, up = 0;
  const shares = new Float64Array(F.M);
  for (let i = 0; i < N; i += 1) { const q = F.nearest(c, i * P); rm += q.rmsd; shares[q.m] += 1 / N; if (state && state[q.m] === 0) up += 1; }
  return { calls, rmsd: rm / N, open: up / N, shares, count: evenCount(shares), top: Math.max(...shares), heat };
}
const nearestSlot = (s) => { let b = 0; for (let i = 0; i < STOPS.slots; i += 1) if (Math.abs(Math.log(slotSigma(i) / s)) < Math.abs(Math.log(slotSigma(b) / s))) b = i; return b; };
const slotsOf = (list) => list.map(nearestSlot);
const TRUTH = 2 / 17, inBand = (r) => Math.abs(r.open - TRUTH) <= STOPS.band && r.rmsd <= STOPS.blur, hits = (r) => inBand(r) && r.count >= STOPS.fair;

ok('a ladder step is the textbook step: Euler, Heun, none on the last, and fresh noise lifts the point', () => {
  const D = (x, s, o) => { o[0] = 0.5 * x[0]; o[1] = -x[1]; }, r = makeRng(1), g = new Float64Array(2), a = new Float64Array([3, 4]), b = new Float64Array([3, 4]);
  const L = [{ s: 10, second: false }, { s: 7, second: true }, { s: 4, second: true }];
  assert.equal(ladderStep(a, L, 0, D, g, r), 1); euler(b, 10, 7, D, g); near(a[0], b[0], 1e-12);
  assert.equal(ladderStep(a, L, 1, D, g, r), 2); assert.equal(ladderStep(new Float64Array([1, 1]), L, 2, D, g, r), 1);
  const q = new Float64Array([0, 0]), s2 = []; for (let i = 0; i < 20000; i += 1) { q[0] = 0; q[1] = 0; ladderStep(q, [{ s: 1, second: false }, { s: 1e-9, second: false }], 0, (x, s, o) => { o[0] = x[0]; o[1] = x[1]; }, g, r, 0.8); s2.push(q[0]); }
  near(Math.sqrt(s2.reduce((t, v) => t + v * v, 0) / s2.length), Math.sqrt(1.8 * 1.8 - 1), 0.03, 'fresh noise lifts sigma to sigma(1 + gamma)');
});

const evenRun = (slots) => ladderRun(ubqField(), slots, [], { N: STOPS.draws }), evenPass = (r) => r.rmsd <= STOPS.crisp && r.count >= STOPS.even;

// A player who does only what the hand shows, by the rules of nextHint, hint and spareHint in chapter 4. Returns the moves it took, or -1.
function followHand(set, start, budget, { pass, lim, gamma = 0, help = true, N = STOPS.samples, most = 12 }) {
  let s = start.map((slot) => ({ slot, second: false })), moves = 0;
  const calls = () => s.reduce((t, p, i) => t + 1 + (p.second && i + 1 < s.length ? 1 : 0), 0), add = (slot) => { const q = s.find((p) => p.slot === slot); if (q) q.second = true; else s.push({ slot, second: false }); };
  for (;;) {
    const r = ladderRun(set, s.map((p) => p.slot), s.map((p) => p.second), { gamma, N }), h = r.heat, last = s[s.length - 1];
    if (pass(r)) return { moves, r, s };
    if (moves >= most) return { moves: -1, r, s };
    moves += 1;
    if (r.rmsd > lim) last.slot = Math.min(STOPS.slots - 1, Math.max(last.slot + 4, 20));
    else if (budget - calls() > 0) {
      let to = null;
      if (help) { for (const k of h.map((v, q) => q).sort((a, b) => h[b] - h[a])) { if (s[k + 1].slot - s[k].slot > 3) { to = Math.round((s[k].slot + s[k + 1].slot) / 2); break; } if (!s[k].second) { to = s[k].slot; break; } } } else { const A = STOPS.thirdAnswer; to = A.slots.find((q) => !s.some((p) => p.slot === q)) ?? A.looks.find((q) => s.some((p) => p.slot === q && !p.second)); }
      if (to === null || to === undefined) return { moves: -1, r, s };
      add(to);
    } else {
      const hot = h.map((v, k) => k).filter((k) => s[k + 1].slot - s[k].slot > 1).sort((a, b) => h[b] - h[a])[0], warm = (k) => (h[k - 1] ?? 0) + (h[k] ?? 0), cold = s.map((_, k) => k).filter((k) => k > 0 && k !== hot && k !== hot + 1).sort((a, b) => warm(a) - warm(b))[0];
      if (hot === undefined || cold === undefined) return { moves: -1, r, s };
      s[cold].slot = Math.round((s[hot].slot + s[hot + 1].slot) / 2);
    }
    s.sort((a, b) => a.slot - b.slot);
    s[s.length - 1].second = false;
  }
}

ok('chapter 4, level 1: a bad ladder still lands on real conformers, and the frequencies break first', () => {
  const show = (r) => `${r.count.toFixed(1)} of 39, ${r.rmsd.toFixed(3)} A, top ${(100 * r.top).toFixed(0)}%`, start = evenRun(STOPS.first), low = evenRun(slotsOf([1000, 729, 531, 387, 1.8])), two = evenRun(slotsOf([1000, 0.5])), good = evenRun(slotsOf([1000, 79, 22, 12, 6])), all = evenRun(Array.from({ length: STOPS.slots }, (_, i) => i));
  console.log(`    start ${show(start)}; last stop pulled down ${show(low)}; two stops ${show(two)}; reasoned ${show(good)}; 25 stops ${show(all)}`);
  assert.ok(start.rmsd > 2 * STOPS.crisp, 'the start is a blur');
  for (const r of [low, two]) { assert.ok(r.rmsd <= STOPS.crisp, 'real conformers'); assert.ok(r.count < 5, 'and only a few of them'); assert.ok(!evenPass(r), 'distance alone must not pass'); }
  near(two.count, 1.9, 0.15); near(two.top, 0.67, 0.03); near(low.count, 3.9, 0.2); near(start.rmsd, 1.56, 0.03, 'a blur lies about 1.6 A from the nearest conformer');
  // Runs pile onto the conformers nearest the mean.
  const { F } = ubqField(), fromMean = Array.from({ length: F.M }, (_, m) => Math.sqrt(F.C.subarray(m * F.P, (m + 1) * F.P).reduce((t, v) => t + v * v, 0) / F.n)), mid = [...fromMean].sort((p, q) => p - q)[F.M >> 1], most = [...two.shares.keys()].sort((p, q) => two.shares[q] - two.shares[p]).slice(0, 2);
  console.log(`    the two conformers most landed on lie ${most.map((m) => fromMean[m].toFixed(2))} A from the mean, the median ${mid.toFixed(2)}`);
  for (const m of most) assert.ok(fromMean[m] < mid);
  assert.ok(evenPass(good)); assert.ok(all.count > 38, 'a fine ladder gives every conformer its share');
  // The count itself: all equal gives M, one alone gives 1.
  near(evenCount(new Float64Array(39).fill(1 / 39)), 39, 1e-9); near(evenCount([1, 0, 0]), 1, 1e-12);
});

ok('chapter 4, level 1: landing on a real conformer comes from the finite list, not from a fold', () => {
  const { F } = ubqField(), { P, M } = F, r = makeRng(5), x = new Float64Array(P), g = new Float64Array(P), o = new Float64Array(P), tmp = new Float64Array(2 * P), last = 3, L = [{ s: last, second: false }];
  for (let i = 0; i < P; i += 1) x[i] = F.C[7 * P + i] + last * r.n();
  F.denoise(x, last, o); ladderStep(x, L, 0, (a, s, q) => F.denoise(a, s, q), g, r, 0, P, tmp);
  for (let i = 0; i < P; i += 1) near(x[i], o[i], 1e-9, 'the last Euler step lands on the guess');
  assert.ok(F.nearest(x).rmsd < 0.01, 'and at low noise the guess is one item of the list');
  // A Gaussian of the same covariance has no list: its exact guess is linear, so a coarse ladder only shrinks the spread, mode by mode.
  const A = Array.from({ length: P }, () => new Float64Array(P));
  for (let m = 0; m < M; m += 1) for (let a = 0; a < P; a += 1) for (let b = 0; b < P; b += 1) A[a][b] += (F.C[m * P + a] * F.C[m * P + b]) / M;
  for (let sweep = 0; sweep < 40; sweep += 1) for (let a = 0; a < P; a += 1) for (let b = a + 1; b < P; b += 1) { if (Math.abs(A[a][b]) < 1e-12) continue; const t0 = (A[b][b] - A[a][a]) / (2 * A[a][b]), t = Math.sign(t0 || 1) / (Math.abs(t0) + Math.sqrt(t0 * t0 + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c; for (let k = 0; k < P; k += 1) { const u = A[k][a], v = A[k][b]; A[k][a] = c * u - s * v; A[k][b] = s * u + c * v; } for (let k = 0; k < P; k += 1) { const u = A[a][k], v = A[b][k]; A[a][k] = c * u - s * v; A[b][k] = s * u + c * v; } }
  const lam = A.map((row, i) => Math.max(0, row[i])), spread = (stops) => { let e = 0; for (const v of lam) { let f = 1; for (let k = 0; k + 1 < stops.length; k += 1) { const q = stops[k + 1] / stops[k]; f *= q + (1 - q) * (v / (v + stops[k] * stops[k])); } const end = stops[stops.length - 1]; f *= v / (v + end * end); e += f * f * stops[0] * stops[0]; } return Math.sqrt(e / F.n); }, truth = Math.sqrt(lam.reduce((t, v) => t + v, 0) / F.n), S = Array.from({ length: STOPS.slots }, (_, i) => slotSigma(i));
  console.log(`    a Gaussian of the same covariance: spread ${truth.toFixed(2)} A, two stops ${spread([1000, 2]).toFixed(2)}, five reasoned stops ${spread(slotsOf([1000, 79, 22, 12, 6]).map(slotSigma)).toFixed(2)}, 25 stops ${spread(S).toFixed(2)}`);
  near(truth, 2.19, 0.02); near(spread([1000, 2]), 0.45, 0.03, 'two stops shrink a continuous distribution to its mean'); assert.ok(spread(S) > 0.85 * truth);
});

ok('chapter 4, level 1: careless drags rarely even the bars, and following the red jump does', () => {
  const r = makeRng(4), n = STOPS.slots, free = (s, skip) => { for (;;) { const q = 1 + r.int(n - 1); if (!s.includes(q) || q === skip) return q; } };
  let won = 0; const W = 60;
  for (let w = 0; w < W; w += 1) { let s = [...STOPS.first], hit = false; for (let k = 0; k < 10 && !hit; k += 1) { const i = 1 + r.int(s.length - 1); s[i] = free(s, s[i]); s = [...s].sort((a, b) => a - b); hit = evenPass(evenRun(s)); } if (hit) won += 1; }
  const q = followHand(ubqField(), STOPS.first, STOPS.budget[0], { pass: evenPass, lim: STOPS.crisp, N: STOPS.draws });
  console.log(`    ten careless drags pass ${(100 * won / W).toFixed(0)}%; the hand alone passes in ${q.moves} moves at ${q.r.count.toFixed(1)}`);
  assert.ok(won / W < 0.2); assert.ok(q.moves > 0 && q.moves <= 6, `level 1 by the hand: ${q.moves}`);
  assert.ok(evenRun(STOPS.first).heat[0] > 0, 'the first jump has its own heat');
});

const rho7 = (n) => schedule(n, STOPS.smin, STOPS.smax, 7).slice(0, n);
const L2_ANSWER = [0, 5, 8, 10, 13, 15, 20], L2_LOOKS = [0, 1, 1, 1, 0, 0, 0], L3_ANSWER = STOPS.thirdAnswer.slots, L3_LOOKS = L3_ANSWER.map((q) => (STOPS.thirdAnswer.looks.includes(q) ? 1 : 0));

ok('chapter 4, levels 2 and 3: passing needs the share and the bars, on the game seed', () => {
  const R = rareField(), t = STOPS, go = (l, q, o) => ladderRun(R, slotsOf(l), q, o), N = (r) => `${(100 * r.open).toFixed(1)}/${r.count.toFixed(1)}`, G = { gamma: t.noise };
  assert.equal(TRUTH, R.state.filter((v) => v === 0).length / R.state.length);
  assert.equal(R.state.length, 17); near(t.fair / 17, t.even / 39, 0.01, 'the same bar as level 1');
  // Second-look recipes of 5 and 7 calls reach the share by an error crossing zero, and the bars show it.
  const five = [go([1000, 109, 22, 1.3], [1, 0, 0, 0]), go([1000, 109, 58, 1.3], [1, 0, 0, 0]), go([1000, 387, 58, 1.3], [0, 1, 0, 0])], seven = [go([1000, 109, 42, 12, 1.3], [1, 1, 0, 0, 0], G), go([1000, 79, 22, 12, 2.4], [1, 0, 0, 1, 0], G)];
  console.log(`    5-call recipes ${five.map(N).join(' ')}; 7-call recipes under noise ${seven.map(N).join(' ')}`);
  for (const r of [...five, ...seven]) { assert.ok(r.calls <= 7); assert.ok(inBand(r), 'the share alone still lands'); assert.ok(!hits(r), `the bars must stop it: ${N(r)}`); }
  // Level 2: the reasoned ladder, on the budget.
  const start = ladderRun(R, t.second), answer = ladderRun(R, L2_ANSWER, L2_LOOKS), plain = ladderRun(R, L2_ANSWER), best = ladderRun(R, [0, 5, 7, 8, 9, 10, 11, 12, 16, 19]);
  console.log(`    level 2 start ${N(start)}; answer ${N(answer)} on ${answer.calls} calls; the same stops plain ${N(plain)}; best plain ladder found ${N(best)} on ${best.calls} calls`);
  assert.ok(!hits(start)); assert.ok(hits(answer)); assert.ok(answer.calls <= t.budget[1]); assert.ok(!hits(plain));
  near(best.open, 0.1, 0.006, 'plain stops come close'); assert.ok(best.calls <= t.budget[1] && best.count >= t.fair);
  // Level 3: the same test, on the budget.
  const third = ladderRun(R, t.thirdFirst, [], G), bare = ladderRun(R, L3_ANSWER, [], G), looks = ladderRun(R, L3_ANSWER, L3_LOOKS, G), stops = ladderRun(R, [0, 4, 7, 8, 9, 10, 11, 12, 14, 18, 20], [], G), carried = ladderRun(R, L2_ANSWER, L2_LOOKS, G);
  console.log(`    level 3 start ${N(third)}; eight plain stops ${N(bare)}; with three looks ${N(looks)} on ${looks.calls} calls; those calls as more stops ${N(stops)}; level 2's answer under noise ${N(carried)}`);
  for (const r of [third, bare]) assert.ok(!hits(r)); assert.ok(hits(looks)); assert.ok(looks.calls <= t.budget[2]); assert.ok(!hits(stops), 'more plain stops do not bring it back'); assert.ok(!hits(carried), 'the level 2 answer must fail under noise');
  const long = ladderRun(R, Array.from({ length: 25 }, (_, i) => i), [], { N: 2000 }); console.log(`    25 Euler stops ${N(long)}`); near(long.open, 0.107, 0.01);
});

ok('chapter 4: one look on a long jump swings the share, and the level 2 answer does not', () => {
  const R = rareField(), N = 8000, at = (s, q) => ladderRun(R, slotsOf(s), q, { N }).open, tails = [[1.3], [12, 1.3], [22, 1.3]], ends = [109, 79, 58, 42], table = ends.map((e) => tails.map((t) => at([1000, e, ...t], [1, 0, 0, 0]))), second = ends.map((e) => at([1000, 387, e, 1.3], [0, 1, 0, 0])), all = [...table.flat(), ...second];
  console.log(`    ${ends.map((e, i) => `${e} A: ${[...table[i], second[i]].map((v) => (100 * v).toFixed(1)).join(' ')}`).join('; ')}`);
  near(Math.min(...all), 0.021, 0.006); near(Math.max(...all), 0.182, 0.012);
  assert.ok(all.filter((v) => Math.abs(v - TRUTH) <= STOPS.band).length <= 4, 'few of them land, and those by crossing');
  // Move any one stop by one place: a real answer stays, and a crossing does not.
  const near1 = (slots, looks) => { const out = []; for (let i = 1; i < slots.length; i += 1) for (const d of [-1, 1]) { const u = [...slots]; u[i] += d; if (u[i] < 1 || u[i] >= STOPS.slots || new Set(u).size < u.length) continue; out.push(ladderRun(R, u, looks).open); } return out; }, mine = near1(L2_ANSWER, L2_LOOKS), old = near1([0, 7, 12, 21], [1, 0, 0, 0]);
  console.log(`    one stop moved one place: the answer ${(100 * Math.min(...mine)).toFixed(1)} to ${(100 * Math.max(...mine)).toFixed(1)}, the old recipe ${(100 * Math.min(...old)).toFixed(1)} to ${(100 * Math.max(...old)).toFixed(1)}`);
  const span = (a) => Math.max(...a) - Math.min(...a);
  near(Math.min(...mine), 0.103, 0.002); near(Math.max(...mine), 0.128, 0.002);
  assert.ok(span(mine) < 0.03, 'an answer stays near itself'); assert.ok(span(old) > 3 * span(mine), 'a crossing does not');
});

ok('chapter 4: the hand alone solves levels 2 and 3 in few moves', () => {
  const R = rareField(), t = STOPS, two = followHand(R, t.second, t.budget[1], { pass: hits, lim: t.blur }), three = followHand(R, t.thirdFirst, t.budget[2], { pass: hits, lim: t.blur, gamma: t.noise, help: false });
  console.log(`    level 2 in ${two.moves} moves to ${(100 * two.r.open).toFixed(1)}/${two.r.count.toFixed(1)}; level 3 in ${three.moves} moves to ${(100 * three.r.open).toFixed(1)}/${three.r.count.toFixed(1)}`);
  assert.ok(two.moves > 0 && two.moves <= 6); assert.ok(three.moves > 0 && three.moves <= 6);
  assert.deepEqual(three.s.map((p) => p.slot), L3_ANSWER); assert.deepEqual(three.s.map((p) => p.second), L3_LOOKS.map(Boolean), 'the hand goes to the jump that crosses 120 A and the next two');
  assert.ok(slotSigma(t.thirdAnswer.looks[0]) > 120 && slotSigma(L3_ANSWER[L3_ANSWER.indexOf(t.thirdAnswer.looks[0]) + 1]) < 120, 'the first look is on the jump that crosses 120 A');
  // A look above the jump that crosses 120 A changes almost nothing, and one in that range does.
  const G = { gamma: t.noise }, base = ladderRun(R, L3_ANSWER, [], G).open, top = ladderRun(R, L3_ANSWER, [1], G).open, low = ladderRun(R, L3_ANSWER, [0, 0, 0, 0, 0, 1], G).open, mid = ladderRun(R, L3_ANSWER, [0, 0, 0, 1], G).open;
  console.log(`    no look ${(100 * base).toFixed(1)}, on 1000 A ${(100 * top).toFixed(1)}, on 12 A ${(100 * low).toFixed(1)}, on 58 A ${(100 * mid).toFixed(1)}`);
  near(top, base, 0.002); near(low, base, 0.003); assert.ok(mid - base > 0.01);
  const high = ladderRun(R, [0, 1, 2, 4, 6], [], G).open, topHigh = ladderRun(R, [0, 1, 2, 4, 6], [1], G).open; near(high, topHigh, 0.002, 'a look on 1000 to 729 A changes nothing');
});

ok('chapter 4: the cause is distance from the mean, not rarity, in a control with a rare state in the middle', () => {
  const K = adk(), all = K.ids.map((_, i) => i), op = all.filter((i) => K.state[i] === 0), cl = all.filter((i) => K.state[i] === 1).slice(0, 8), mid = (a, b) => Float64Array.from(K.models[a], (v, i) => (v + K.models[b][i]) / 2);
  assert.equal(op.length, 7);
  const models = [...op.map((i) => K.models[i]), ...cl.map((i) => K.models[i]), mid(op[0], cl[0]), mid(op[1], cl[1])], state = [...op.map(() => 1), ...cl.map(() => 1), 0, 0], M = { F: new Aligned(models), state }, N = 12000, at = (slots, o = {}) => ladderRun(M, slots, [], { N, ...o }).open, five = at(slotsOf([1000, 109, 58, 31, 0.5])), two = at([0, 24]), noisy = at(slotsOf([1000, 109, 58, 31, 0.5]), { gamma: STOPS.noise }), fine = ladderRun(M, null, [], { N: 8000, sigmas: rho7(100), heun: true }).open;
  console.log(`    midpoints, ${(100 * 2 / 17).toFixed(1)}% of the set: five Euler ${(100 * five).toFixed(1)}, two stops ${(100 * two).toFixed(1)}, five Euler with noise ${(100 * noisy).toFixed(1)}, 100 Heun ${(100 * fine).toFixed(1)}`);
  near(five, 0.184, 0.012, 'rare, and it grows'); near(two, 1, 0.001); near(noisy, 0.375, 0.02); near(fine, TRUTH, 0.012, 'a fine run still gives the set share');
});

ok('chapter 4: with fixed noise Euler stalls however many stops it gets, and second looks do not', () => {
  const R = rareField(), N = 4000, at = (n, o) => ladderRun(R, null, [], { N, sigmas: rho7(n), ...o }).open, list = [25, 50, 100, 200, 400], stall = list.map((n) => at(n, { gamma: STOPS.noise })), clean = list.map((n) => at(n, {})), heun = [25, 50].map((n) => at(n, { gamma: STOPS.noise, heun: true }));
  const pc = (a) => a.map((v) => (100 * v).toFixed(1)).join(' ');
  console.log(`    ${list} stops: Euler with noise ${pc(stall)}; no noise ${pc(clean)}; Heun with noise at 25, 50: ${pc(heun)}`);
  for (const v of stall) near(v, 0.084, 0.012, 'Euler with fixed noise stays on its plateau');
  assert.ok(clean[4] > 0.11, 'with no noise, stops do bring the state back'); assert.ok(clean[4] - stall[4] > 0.02);
  for (const v of heun) assert.ok(v > 0.105, 'second looks do, within the sampling error of 4,000 chains');
});

ok('chapter 4: a chain that ends open passes even odds between about 31 and 121 A', () => {
  const { F, state } = rareField(), { P } = F, L = rho7(240).map((s) => ({ s, second: false })), r = makeRng(5), c = new Float64Array(P), g = new Float64Array(P), tmp = new Float64Array(2 * P), D = (a, s, o) => F.denoise(a, s, o), at = [];
  for (let i = 0; i < 2500; i += 1) {
    for (let q = 0; q < P; q += 1) c[q] = L[0].s * r.n();
    const w = new Float64Array(L.length);
    for (let k = 0; k < L.length; k += 1) { F.denoise(c, L[k].s, g); for (let m = 0; m < F.M; m += 1) if (state[m] === 0) w[k] += F.w[m]; ladderStep(c, L, k, D, g, r, 0, P, tmp); }
    if (state[F.nearest(c).m] !== 0) continue;
    let k = L.length - 1; while (k > 0 && w[k - 1] >= 0.5) k -= 1;
    at.push(L[k].s);
  }
  at.sort((a, b) => a - b);
  const pick = (f) => at[Math.floor(f * (at.length - 1))];
  console.log(`    ${at.length} open chains: even odds at ${pick(0.05).toFixed(0)}, ${pick(0.5).toFixed(0)}, ${pick(0.95).toFixed(0)} A (5, 50, 95%)`);
  near(pick(0.05), 31, 5); near(pick(0.5), 64, 8); near(pick(0.95), 121, 25);
});

ok('chapter 4: the start is high enough that a perfect run reaches the set share', () => {
  const R = rareField(), reach = (smax) => ladderRun(R, null, [], { N: 25000, sigmas: schedule(50, STOPS.smin, smax, 7).slice(0, 50), heun: true }).open, top = reach(STOPS.smax), low = reach(200);
  console.log(`    second-order, fifty stops: from 1000 A ${(100 * top).toFixed(2)}%, from 200 A ${(100 * low).toFixed(2)}%, set ${(100 * TRUTH).toFixed(2)}%`);
  near(top, 0.1177, 0.006); near(low, 0.1139, 0.008); assert.ok(top > low); assert.ok(Math.abs(top - TRUTH) < 0.002, 'a perfect run from here reaches the set share');
  assert.equal(STOPS.smax, 1000);
});

ok('chapter 4: noise on the board lies outside the span of the structures', () => {
  const { F } = ubqField(), r = makeRng(7), xi = Float64Array.from({ length: F.dim }, () => r.n());
  F.outside(xi);
  for (const b of F.B) { let v = 0; for (let i = 0; i < F.dim; i += 1) v += b[i] * xi[i]; near(v, 0, 1e-9); }
});

ok('chapter 4: a careless player rarely passes levels 2 and 3, under the game rules', () => {
  const R = rareField(), r = makeRng(4), calls = (s) => s.reduce((t, p, i) => t + 1 + (p.second && i + 1 < s.length ? 1 : 0), 0), tidy = (s) => { s.sort((p, q) => p.slot - q.slot); s[s.length - 1].second = false; return s; };
  const free = (s, want, skip) => { for (let d = 0; d < STOPS.slots; d += 1) for (const q of [want - d, want + d]) if (q >= 1 && q < STOPS.slots && !s.some((p) => p !== skip && p.slot === q)) return q; return want; };
  const drag = (s0, budget) => { const s = s0.map((p) => ({ ...p })), spare = budget - calls(s); if (spare > 0 && r.u() < 0.5) { const x = r.int(STOPS.slots), q = s.find((p) => p.slot === x); if (q) q.second = q !== s[s.length - 1]; else s.push({ slot: free(s, x), second: false }); } else { const p = s[1 + r.int(s.length - 1)]; p.slot = free(s, r.int(STOPS.slots), p); } return tidy(s); };
  const walks = (start, budget, gamma) => { let won = 0; const W = 36; for (let w = 0; w < W; w += 1) { let s = start.map((slot) => ({ slot, second: false })), hit = false; for (let k = 0; k < 10 && !hit; k += 1) { s = drag(s, budget); hit = hits(ladderRun(R, s.map((p) => p.slot), s.map((p) => p.second), { gamma })); } if (hit) won += 1; } return won / W; };
  const a = walks(STOPS.second, STOPS.budget[1], 0), b = walks(STOPS.thirdFirst, STOPS.budget[2], STOPS.noise);
  console.log(`    ten careless drags pass level 2 ${(100 * a).toFixed(0)}%, level 3 ${(100 * b).toFixed(0)}%`);
  assert.ok(a < 0.1 && b < 0.1);
});

ok('chapter 9: the stored field to the end gives the exact shares, and the three rounds say what the note says', () => {
  const F = mdField(), fast = (x, s, o) => F.fast(x[0], x[1], s, o), seeds = [1, 2, 3, 4], at = (e, g, arg = {}) => meanPop(padOpt(e, g), seeds, { n: 3000, ...arg });
  for (const [e, g] of [[1, 0], [1.5, 0], [1, 0.8], [1.5, 0.8]]) { const a = at(e, g), b = at(e, g, { D: fast }); a.forEach((v, c) => near(v, b[c], c === 2 ? 0.002 : 0.004, `stored field against exact, ${e} ${g} region ${c}`)); }
  const game = (e, g) => sample9(padOpt(e, g), { seed: PAD.seed, n: PAD.drops, meas: 0, D: fast }).pop, pp = (p) => p.map((v) => (100 * v).toFixed(1)).join('/'), [a, b, c] = PAD.rounds.map((r) => game(r.eta, r.gamma));
  console.log(`    eta alone ${pp(a)}, noise alone ${pp(b)}, Boltz-2 ${pp(c)}`);
  near(a[2], 0, 0.002); near(b[2], 0.02, 0.005); near(c[2], 0.004, 0.003);
  const t = PAD.guess, truth = [0, 0.02, 0.004], chance = (v) => (Math.min(0.1, v + t) - Math.max(0, v - t)) / 0.1, q = truth.map(chance), two = q[0] * q[1] * (1 - q[2]) + q[0] * (1 - q[1]) * q[2] + (1 - q[0]) * q[1] * q[2] + q[0] * q[1] * q[2];
  console.log(`    random guesses pass two of three with chance ${(100 * two).toFixed(1)}%`);
  assert.ok(two < 0.07);
});

const twoChains = () => { const K = adk(); return { a: K.models[K.ids.indexOf(TWO.closed)], b: K.models[K.ids.indexOf(TWO.open)] }; };

ok('chapter 9: real chains on the line are the exact two-state run, and the numbers agree with the earlier calculation', () => {
  const { a, b } = twoChains(), dim = a.length, w = TWO.width, d = Math.sqrt(squared(a, b));
  near(d, 119.49, 0.01, 'distance between the two chains in their frame');
  // The field of real chains, and the field on the line, are one field.
  const line = twoField({ p: 0.1, d, w }), full = chainField({ p: 0.1, a, b, w }), r = makeRng(3), x = new Float64Array(dim), o = new Float64Array(dim), u = new Float64Array(1), g = new Float64Array(1), e = Float64Array.from(a, (v, i) => (b[i] - v) / d);
  for (const s of [200, 30, 5, 1]) {
    for (let i = 0; i < dim; i += 1) x[i] = a[i] + (60 + s * r.n()) * e[i] + s * r.n() * 0.2;
    u[0] = 0; for (let i = 0; i < dim; i += 1) u[0] += (x[i] - a[i]) * e[i];
    line(u, s, g); full(x, s, o);
    let along = 0; for (let i = 0; i < dim; i += 1) along += (o[i] - a[i]) * e[i];
    near(along, g[0], 1e-6, 'guess along the line');
  }
  // The written-out step and the shared step are one run.
  const P = PRESETS.boltz2, mean = (f) => (f(1) + f(2) + f(3)) / 3, N = 60000, shares = [0.034, 0.1, 0.3].map((p) => [p, mean((k) => runChains({ p, a, b, w, N, seed: 10 * k }))]), ten = mean((k) => runTwoState({ p: 0.1, n: N, seed: k })), same = mean((k) => runTwoState({ p: 0.1, d, w, n: N, seed: 20 + k }));
  console.log(`    at ${d.toFixed(1)} A: ${shares.map(([p, q]) => `${(100 * p).toFixed(1)}% to ${(100 * q).toFixed(2)}%, power ${oddsPower(p, q).toFixed(2)}`).join('; ')}; shared step ${(100 * same).toFixed(2)}; at 10 A ${(100 * ten).toFixed(2)}`);
  near(shares[1][1], same, 0.0025, 'written-out step against the shared step');
  near(shares[0][1], 0.0035, 0.0006); near(shares[1][1], 0.024, 0.002); near(shares[2][1], 0.198, 0.004); near(ten, 0.022, 0.002);
  for (const [p, q] of shares) near(oddsPower(p, q), 1.67, 0.05);
  for (const q of [0.1, 1]) near(runTwoState({ p: 0.1, d, w: q, n: 40000, seed: 5 }), same, 0.003, `width ${q}, small against the separation`);
  // Whole chains in all 642 coordinates are the same run again.
  const K = 900, X = new Float64Array(K * dim), c = runChains({ p: 0.1, a, b, w, N: 0, K, X, seed: 4 }), se = Math.sqrt(c * (1 - c) / K);
  console.log(`    ${K} whole chains: ${(100 * c).toFixed(2)} +- ${(100 * se).toFixed(2)}%`);
  near(c, shares[1][1], 3.5 * se, 'whole chains against the line');
  assert.equal(P.eta, 1.5);
});

ok('chapter 9, level 1: the set share is a valley on the pad, Boltz-2\'s settings are far from it, and random places rarely match', () => {
  const { a, b } = twoChains(), go = (e, g, N = TWO.drops) => runChains({ p: TWO.share, a, b, w: TWO.width, N, K: 0, opt: twoOpt(e, g), seed: 5 }), ok1 = (v) => Math.abs(v - TWO.share) <= TWO.tol;
  const plain = go(1, 0), mid = go(0.9, 0.5), far = go(0.8, 1), boltz = go(1.5, 0.8), start = go(...TWO.start), noise = go(1, 0.8), step = go(1.5, 0);
  console.log(`    plain ${(100 * plain).toFixed(1)}, valley ${(100 * mid).toFixed(1)} ${(100 * far).toFixed(1)}, Boltz-2 ${(100 * boltz).toFixed(1)}, start ${(100 * start).toFixed(1)}, noise alone ${(100 * noise).toFixed(1)}, step alone ${(100 * step).toFixed(1)}`);
  assert.ok(ok1(plain) && ok1(mid) && ok1(far)); assert.ok(!ok1(boltz) && !ok1(start) && !ok1(noise) && !ok1(step));
  near(boltz, 0.024, 0.006);
  const r = makeRng(6); let hit = 0; const G = 60;
  for (let i = 0; i < G; i += 1) if (ok1(go(0.8 + r.u(), r.u(), 1500))) hit += 1;
  console.log(`    ${(100 * hit / G).toFixed(0)}% of random places match, so nine drops pass ${(100 * (1 - (1 - hit / G) ** 9)).toFixed(0)}% of the time`);
  assert.ok(hit / G < 0.25);
});

ok('chapter 9, level 3: the odds chart tells a thinker from a guesser', () => {
  const K = 1.7, land = (p) => { const o = (p / (1 - p)) ** K; return o / (1 + o); };
  for (const p of TWO.shares.flat()) {
    const out = land(p), keep = oddsMiss(p, out), scaled = oddsMiss(p * 0.66, out);
    if (p <= 0.15) assert.ok(keep > TWO.odds && scaled > TWO.odds, `${p}: keeping the share or scaling it must miss`);
    near(logit(out), K * logit(p), 1e-9);
  }
  assert.ok(oddsMiss(0.3, land(0.3)) > TWO.odds, 'staying on the diagonal misses at 30%');
  const span = logit(0.5) - logit(0.0005), hit = (2 * TWO.odds) / span;
  console.log(`    a random guess hits ${(100 * hit).toFixed(0)}% of the time, three in a row ${(100 * hit ** 3).toFixed(2)}%`);
  assert.ok(hit ** 3 < 0.005);
});

ok('the dipeptide: phi and psi set the molecule, and nothing else in it moves', () => {
  const y = new Float64Array(30), z = new Float64Array(30);
  conformer(-120, 140, z);
  const L = (a) => BONDS.map(([i, j]) => Math.hypot(a[3 * i] - a[3 * j], a[3 * i + 1] - a[3 * j + 1], a[3 * i + 2] - a[3 * j + 2]));
  for (const [p, q] of [[-60, -40], [-120, 140], [60, 40], [-75, 170], [120, -20]]) {
    conformer(p, q, y);
    near(dihedral(y, DIHEDRALS.PHI), p, 1e-6, 'phi'); near(dihedral(y, DIHEDRALS.PSI), q, 1e-6, 'psi');
    L(y).forEach((v, i) => near(v, L(z)[i], 1e-9, 'bond length'));
    for (const a of [3, 4, 5, 6]) for (let e = 0; e < 3; e += 1) near(y[3 * a + e], z[3 * a + e], 1e-9, 'the central residue stays put');
  }
  conformer(-120, 300, y); near(dihedral(y, DIHEDRALS.PSI), -60, 1e-6, 'psi wraps, as the map does');
});

console.log(`${passed} checks passed`);
