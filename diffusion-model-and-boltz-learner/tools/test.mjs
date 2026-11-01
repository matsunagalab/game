// Screen-free checks of the mathematics. node tools/test.mjs
import assert from 'node:assert/strict';
import { Mix2D, FieldTable } from '../src/science/mix2d.js';
import { makeRng } from '../src/science/rng.js';
import { boltzSchedule, churnHeun, edm, euler, heun, schedule, stochasticStep } from '../src/science/sampler.js';
import { MLP } from '../src/science/mlp.js';
import { DenoiserNet } from '../src/science/net.js';
import { bestRotation, centre, fitRmsd, randomRotation, rmsd, rotate, shift } from '../src/science/kabsch.js';
import { Ensemble, rg } from '../src/science/cart.js';
import { heldOutBits, histogramModel, island, popError, populations, sliced } from '../src/science/stats.js';
import { adk, boltzRun, byAA, mdRun, rama, ubiquitin } from '../src/science/data.js';
import { discEnergy, steerRun } from '../src/science/steer.js';
import { place, piece, snap, NOISE } from '../src/music.js';
import { HandTest } from '../src/science/hand.js';
import { noiseBurst, oddsPower, PRESETS, runTwoState } from '../src/science/twostate.js';

let passed = 0;
const ok = (name, f) => { f(); passed += 1; console.log(`ok  ${name}`); };
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b} (tol ${tol})`);

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
ok('sentences on screen: samplers on the real field (chapter 4)', () => {
  const d = rama().train, m = new Mix2D(d.x, d.y).index(4), T = new FieldTable(m, { low: 5, high: 800, levels: 20, grid: 96 }).ready(), D = (x, s, o) => T.at(x[0], x[1], s, o), N = 2500;
  const run = (kind, steps) => {
    const S = schedule(steps, 1, 400, 7), r = makeRng(11), X = new Float32Array(N), Y = new Float32Array(N), x = new Float64Array(2), b = new Float64Array(2), tmp = new Float64Array(4);
    let calls = 0;
    for (let i = 0; i < N; i += 1) { x[0] = -84 + 400 * r.n(); x[1] = 42 + 400 * r.n(); let c = 0; for (let k = 0; k < steps; k += 1) { if (kind === 'heun') c += heun(x, S[k], S[k + 1], D, b, 2, tmp); else { euler(x, S[k], S[k + 1], D, b); c += 1; } } calls = c; X[i] = x[0]; Y[i] = x[1]; }
    return { calls, dist: sliced(X, Y, d.x, d.y), p: populations(X, Y) };
  };
  const h3 = run('heun', 3), e3 = run('euler', 3), h12 = run('heun', 12), e30 = run('euler', 30), e20 = run('euler', 20);
  console.log(`    heun 3 ${h3.dist.toFixed(1)}, euler 3 ${e3.dist.toFixed(1)}, heun 12 (${h12.calls} calls) ${h12.dist.toFixed(2)}, euler 20 ${e20.dist.toFixed(2)}, euler 30 ${e30.dist.toFixed(2)}`);
  assert.ok(h3.dist > e3.dist); assert.ok(h12.calls <= 24 && h12.dist <= 1.6); assert.ok(e20.dist > 1.6);
});

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
  const a = Float32Array.from(X.subarray(0, meas)), b = Float32Array.from(Y.subarray(0, meas));
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
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], game = 9, row = (o) => seeds.map((s) => sample9(o, { seed: s, n: 9000 }).pop[2]);
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

ok('chapter 9: the two-state calculation, odds to a power near 1.7, near 2.2 for Boltz-1', () => {
  const out = [0.034, 0.1, 0.3].map((p) => [p, runTwoState({ p })]), one = [0.034, 0.1, 0.3].map((p) => [p, runTwoState({ p, preset: PRESETS.boltz1, smin: 0.0004, rho: 8 })]);
  console.log(`    Boltz-2 ${out.map(([p, q]) => `${(100 * p).toFixed(1)}% to ${(100 * q).toFixed(2)}% power ${oddsPower(p, q).toFixed(2)}`).join(', ')}; Boltz-1 powers ${one.map(([p, q]) => oddsPower(p, q).toFixed(2)).join(' ')}`);
  near(out[0][1], 0.003, 0.0015); near(out[1][1], 0.023, 0.003); near(out[2][1], 0.2, 0.01);
  for (const [p, q] of out) near(oddsPower(p, q), 1.7, 0.1);
  for (const [p, q] of one) near(oddsPower(p, q), 2.2, 0.2);
  const far = runTwoState({ p: 0.1, d: 30 }), near5 = runTwoState({ p: 0.1, d: 5 });
  near(far, near5, 0.004, 'independent of separation above 5 A');
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

ok('chapter 4: seeds in the note', () => {
  const d = rama().train, m = new Mix2D(d.x, d.y).index(4), T = new FieldTable(m, { low: 5, high: 800, levels: 20, grid: 96 }).ready(), D = (x, s, o) => T.at(x[0], x[1], s, o), N = 4000;
  const run = (kind, steps, seed) => { const S = schedule(steps, 1, 400, 7), r = makeRng(seed), X = new Float32Array(N), Y = new Float32Array(N), x = new Float64Array(2), b = new Float64Array(2), tmp = new Float64Array(4); for (let i = 0; i < N; i += 1) { x[0] = -84 + 400 * r.n(); x[1] = 42 + 400 * r.n(); for (let k = 0; k < steps; k += 1) { if (kind === 'heun') heun(x, S[k], S[k + 1], D, b, 2, tmp); else euler(x, S[k], S[k + 1], D, b); } X[i] = x[0]; Y[i] = x[1]; } return sliced(X, Y, d.x, d.y); };
  const E = [11, 12, 13, 14, 15].map((s) => run('euler', 35, s)), H = [11, 12, 13, 14, 15].map((s) => run('heun', 12, s));
  console.log(`    euler 35: ${E.map((v) => v.toFixed(2)).join(' ')}; heun 12: ${H.map((v) => v.toFixed(2)).join(' ')}`);
  near(E[0], 1.56, 0.1); assert.ok(H[0] <= 1.6); assert.ok(Math.min(...E.slice(1)) >= 2.05 && Math.max(...E.slice(1)) <= 2.65); assert.ok(Math.min(...H.slice(1)) >= 1.05 && Math.max(...H.slice(1)) <= 2.25);
});

console.log(`${passed} checks passed`);
