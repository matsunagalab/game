// Screen-free checks of every calculation in the game. Run with: node tools/test_physics.mjs
import { lsq, solve } from '../src/physics/linalg.js';
import * as Tor from '../src/physics/torsion.js';
import * as H from '../src/physics/helix.js';
import * as C from '../src/physics/cmap.js';
import * as E from '../src/physics/esp.js';
import * as S from '../src/physics/salt.js';
import * as Ch from '../src/physics/chain.js';
import * as D from '../src/physics/dimer.js';
import * as F from '../src/physics/fold.js';
import * as W from '../src/physics/reweight.js';
import { mulberry } from '../src/physics/rng.js';
import { CASES, CaseBook } from '../src/physics/cases.js';

let fail = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m}: ${a.toPrecision(6)} vs ${b.toPrecision(6)}`);

// Linear algebra
{ const x = solve([[2, 1], [1, 3]], [3, 5]); near(x[0], 0.8, 1e-12, 'solve 2×2 x'); near(x[1], 1.4, 1e-12, 'solve 2×2 y'); }
{ const X = [], y = []; for (let i = 0; i < 20; i++) { X.push([1, i]); y.push(3 + 2 * i); } const b = lsq(X, y); near(b[0], 3, 1e-9, 'lsq intercept'); near(b[1], 2, 1e-9, 'lsq slope'); }

// Torsion fit recovers the coefficients it was built from
{ const V = Tor.fit(0); Tor.QM_V.forEach((v, i) => near(V[i], v, 1e-9, `Fourier fit V${i + 1}`)); near(Tor.rmse(V), 0, 1e-9, 'Fourier error is zero'); }

// Lifson-Roig: transfer matrix against brute force, and its limits
function brute(w, v, N) {
  let Z = 0, nw = 0;
  for (let m = 0; m < 1 << N; m++) {
    let t = 1, c = 0;
    for (let i = 0; i < N; i++) {
      if (!(m >> i & 1)) continue;
      const l = i > 0 && m >> (i - 1) & 1, r = i < N - 1 && m >> (i + 1) & 1;
      if (l && r) { t *= w; c++; } else t *= v;
    }
    Z += t; nw += t * c;
  }
  return [Z, nw / Z / (N - 2)];
}
{
  const [Z, f] = brute(1.3, 0.05, 12);
  near(H.partition(1.3, 0.05, 12), Z, 1e-9, 'partition function against 2^12 enumeration');
  near(H.helixFraction(1.3, 0.05, 12), f, 1e-6, 'helix fraction against enumeration');
  ok(H.helixFraction(1e-3, 0.05, 15) < 1e-3, 'w → 0 gives no helix');
  ok(H.helixFraction(1e3, 0.5, 15) > 0.99, 'w → ∞ gives full helix');
  near(H.rowFraction(H.LR.ff99SBs, 303), 0.142, 0.004, 'Table 5 row for ff99SB* gives the 14.2% Best & Hummer simulated');
  near(H.rowFraction(H.LR.ff99SB, 303), 0.018, 0.002, 'Table 5 row for ff99SB, with its own v, gives their 1.8%');
  near(H.rowFraction(H.LR.ff03, 303), 0.827, 0.005, 'Table 5 row for ff03 gives their 82.7%');
  near(H.weight(H.LR.ff99SB.v, 300), 0.128, 0.001, 'ff99SB v at 300 K');
  near(H.PSI_GAIN * 0.1788 / H.RT(300), 0.5, 0.05, 'published ψ correction is about 0.5 kT per residue');
  { const f = T => H.rowFraction(H.LR.ff99SB, T, -1, -1 / 0.3); near(f(300), H.rowFraction(H.LR.ff99SB, 300), 1e-9, 'the trade knob of Plate II leaves 300 K alone'); ok(f(273) > H.rowFraction(H.LR.ff99SB, 273), 'and steepens the melt'); }
  const p = H.profile(1.28, 0.04, 15); let s = 0; const hit = new Float64Array(15), M = 40000;
  for (let i = 0; i < M; i++) { H.sampleSequence(p, 15).forEach((v, k) => { hit[k] += v; }); }
  hit.forEach((v, k) => { s = Math.max(s, Math.abs(v / M - p.P[k])); });
  ok(s < 0.012, `exact sampler matches per-residue probabilities (worst ${s.toFixed(4)})`);
}

// CMAP
{
  const U = C.surface('stats'), F1 = C.fit1D(U, [1, 2, 3, 4, 5, 6]);
  near(C.cross(F1, 2, 3, 15, 19), 0, 1e-9, 'any torsion sum cancels on a rectangle');
  ok(Math.abs(C.cross(U, 8, 9, 16, 15)) > 5, 'the target does not cancel on a rectangle');
  const G = new Float64Array(C.GRID * C.GRID); G.fill(2.5);
  const up = C.upsample(G); near(up[1234], 2.5, 1e-12, 'bicubic keeps a constant');
  const P = C.boltzmann(up); near(P.reduce((a, b) => a + b), 1, 1e-9, 'populations sum to 1');
  near(C.overlap(P, P), 1, 1e-9, 'overlap with itself is 1');
  const base = C.fit1D(U, [1, 2, 3]), c = new Float64Array(G.length), g = new Float64Array(G.length), stats = C.targetStats();
  const score = () => { for (let i = 0; i < g.length; i++) g[i] = base[i] + c[i]; return C.boltzmann(C.upsample(g)); };
  const before = C.overlap(score(), stats);
  for (let k = 0; k < 6; k++) C.ibiStep(c, score(), stats, 0.7);
  ok(C.overlap(score(), stats) > 0.99 && before < 0.8, 'Boltzmann inversion converges to the target');
}

// ESP: least squares recovers known charges exactly, respects the constraint
{
  const m = E.nma(180), q0 = [-0.3, 0.1, 0.5, -0.5, -0.4, 0.3, -0.1, 0.0833333333];
  q0[7] = -(q0[0] + 3 * q0[1] + q0[2] + q0[3] + q0[4] + q0[5] + q0[6]) / 3;
  const pr = E.buildProblem(m, m.atoms.map(a => ({ p: a.p, q: q0[a.c] })));
  const q = E.fit(pr, 0);
  q.forEach((v, i) => near(v, q0[i], 1e-4, `ESP recovers class ${i}`));
  near(E.rrms(pr, q), 0, 1e-4, 'ESP error is zero for atom-centred charges');
  { const dist = o => { const g = E.nma(o).atoms, p = g[0].p, q = g[8].p; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }; ok(dist(180) > 3.6 && dist(0) < 3, `omega = 180 is trans (CA···CM ${dist(180).toFixed(2)} Å), omega = 0 is cis (${dist(0).toFixed(2)} Å)`); }
  const R = E.reference(180), a = E.fit(R.pr, 0), b = E.fit(R.pr, 0.008);
  near(E.netCharge(a), 0, 1e-9, 'net-charge constraint holds'); near(E.netCharge(b), 0, 1e-9, 'constraint holds under restraint');
  near(E.dipole(R.sites), 3.8, 1e-6, 'reference dipole is 3.8 D');
  ok(Math.abs(b[0]) < Math.abs(a[0]) * 0.6 && E.rrms(R.pr, b) > E.rrms(R.pr, a), 'RESP shrinks the buried charge and costs some fit');
  near(E.fit(R.pr, 0.001)[3], a[3], 0.03, 'a standard RESP strength leaves a surface atom almost alone');
}

// Salt bridge
{
  near(S.ka(S.curve(1, S.RMIN_LB)), 4.06, 0.05, 'stock Ka is set to the CHARMM27 value');
  near(S.ka(S.curve(1, S.NBFIX)), 0.37, 0.02, 'the published NBFIX shift reaches experiment, by a fitted lever');
  near(S.osmotic(1e-9, 1), 1, 1e-6, 'no pairing gives an ideal osmotic coefficient');
  const a = (1 - S.osmotic(50, 0.2)) * 2; near(50 * 0.2 * (1 - a) ** 2, a, 1e-9, 'mass action satisfied');
}

// Chain: census against the known count, and exact against Monte Carlo
{
  const { TOTAL } = await import('../src/physics/chain-table.js');
  ok(TOTAL === 21175146054, 'census counts every 15-step cubic walk (known value 21175146054)');
  const s = Ch.chainStats(1, 1), mc = new Ch.ChainMC(false, mulberry(7));
  mc.setParams(1, 1);
  let a = 0, k = 0;
  for (let i = 0; i < 1500000; i++) { mc.step(); if (i > 200000 && i % 40 === 0) { a += mc.rg2(); k++; } }
  near(Math.sqrt(a / k) * Ch.SPACING, s.rgIdp, 0.08, 'Monte Carlo Rg against the exact sum');
  ok(Ch.chainStats(1, 1.2).rgIdp > s.rgIdp && Ch.chainStats(1, 1.2).dGFold > s.dGFold, 'more protein-water swells the chain and destabilises the fold');
}

// Pair grid: linearity, and the Boltzmann sum against brute force
{
  const g = new D.Grid(); g.fill();
  const p = { q: 1, Epp: 1.1, gamma: 1.25, water: 1, fix: 0 };
  g.combine(p);
  const i = D.conf(16, 0, 18);
  near(g.U[i], g.steric[i] + g.terms.elec[i] + 1.1 * g.terms.disp[i] + 1.25 * g.terms.pw[i] + g.terms.water[i], 1e-3, 'grid energy is the weighted sum of its terms');
  let z = 0;
  for (let ib = 0; ib < D.NB; ib++) for (let ia = 0; ia < D.NA; ia++) for (let ir = 0; ir < D.NR; ir++) {
    const q = D.conf(ir, ia, ib);
    if (g.U[q] < 500 && g.state[q] !== D.STATE.FREE) z += Math.exp(-g.U[q] / D.KT) * D.rOf(ir) ** 2;
  }
  const Ka = 4 * Math.PI * D.DR * z / (D.NA * D.NB) * 6.022e-4, o = D.observables(g);
  near(Math.log(o.Ka), Math.log(Ka), 1e-9, 'Kd against a direct loop');
  const weak = { ...p, gamma: 1.5 }, sticky = { ...p, gamma: 0.9 };
  g.combine(weak); const a = D.observables(g); g.combine(sticky); const b = D.observables(g);
  ok(a.Kd > o.Kd && o.Kd > b.Kd && a.b22 > b.b22, 'protein-water weakens binding and raises B22');
  g.combine({ q: 1, Epp: 1, gamma: 1, water: 1, fix: 0 });
  const nat = g.U[D.conf(14, 0, 18)]; let lo = 1e9;
  for (let q = 0; q < D.N_CONF; q++) lo = Math.min(lo, g.U[q]);
  ok(Math.abs(lo - nat) < 3, 'the designed native pose is near the global minimum');
}

// Plate XI and XII: finite samples against the census
const T = F.TRUE_P, S0 = F.stats(T), G = W.targets(), worst = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]))) * 100;
const passes = j => j.fitOk && j.sealedOk;
{
  const r = F.rawRows();
  let tot = 0;
  for (let i = 0; i < r.ROWS; i++) tot += Math.exp(r.logG[i]);
  near(tot / 21175146054, 1, 1e-4, 'finale census sums to all conformations');
  near(S0.p.reduce((a, b) => a + b), 1, 1e-9, 'state populations sum to 1');
  S0.p.forEach((v, i) => ok(v > 0.08, `state ${F.NAMES[i]} is really populated at the target (${(v * 100).toFixed(1)}%)`));
  ok(G.sealed.tm > 310 && G.sealed.tm < 345, `melting T is plausible, ${G.sealed.tm.toFixed(0)} K`);
  const st = F.stats(F.STOCK_P); ok(st.p[0] > 0.75 && st.p[2] < 0.02 && st.p[4] < 0.02, 'stock force field collapses into one basin');
  const m = new F.FoldMC(T, 300, mulberry(3)), c = [0, 0, 0, 0, 0]; let k = 0;
  for (let i = 0; i < 1500000; i++) { m.step(); if (i > 100000 && i % 25 === 0) { c[m.state()]++; k++; } }
  c.forEach((v, i) => near(v / k, S0.p[i], 0.04, `walker population of ${F.NAMES[i]} against the census`));
  ok(F.stats({ ...T, w: 0 }).p[2] < 0.05, 'without buried water the wet state vanishes');
  ok(F.stats({ ...T, q: 1.3 }).p[3] > S0.p[3], 'stronger charges feed the misfold');
  ok(F.stats({ ...T, gamma: 1.5 }).p[4] > 0.5, 'too much protein-water melts the chain');
  ok(F.meltingT(F.STOCK_P) > G.sealed.tm + 60, 'stock force field is far too stable');
}

// An arrival means three samples in a row in one new state
{
  const run = () => { const r = new W.Run(T, { steps: 1000 }); r.stable = 0; r.cand = -1; r.hold = 0; r.entries = [0, 0, 0, 0, 0]; return r; };
  let r = run(); [1, 2, 3].forEach(s => r.visit(s));
  ok(r.hops === 0, 'three different states in a row are flicker, not an arrival');
  r = run(); [3, 3, 3].forEach(s => r.visit(s));
  ok(r.entries[3] === 1 && r.stable === 3, 'three samples of one new state are one arrival');
  r = run(); [3, 3, 0, 3, 3].forEach(s => r.visit(s));
  ok(r.hops === 0, 'a return to the stable state resets the count');
  r = run(); [3, 3, 1, 3, 3].forEach(s => r.visit(s));
  ok(r.hops === 0, 'a different state in between resets it too');
}

// Blocks stay contiguous in time when a run is extended
{
  const r = new W.Run(T, { steps: 60000, rand: mulberry(8) }), per = 10000 / W.SAMPLE_EVERY;
  r.advance(Infinity); r.total += 60000; r.advance(Infinity);
  ok(r.hist.length === 12, `an extended run gets new blocks (${r.hist.length})`);
  ok(r.hist.every(b => [...b.values()].reduce((a, [c]) => a + c, 0) === per), 'and every block holds the same stretch of time');
}

// MBAR against known answers
{
  const st = new W.Store(), r = new W.Run(T, { steps: 200000, rand: mulberry(5) });
  r.advance(Infinity); st.add(r);
  const a = st.predict(T), f = r.fractions();
  a.p.forEach((v, i) => near(v, f[i], 1e-9, `reweighting to the same parameters returns the run, ${F.NAMES[i]}`));
  near(a.neff, r.samples, 1e-6, 'Neff is the whole sample there');
  const s2 = new W.Store(), mid = { ...T, E: 1.08, gamma: 1.2 };
  for (const [p, sd] of [[T, 1], [{ ...T, E: 1.06, gamma: 1.15 }, 2], [mid, 3]]) { const q = new W.Run(p, { steps: 1500000, rand: mulberry(sd) }); q.advance(Infinity); s2.add(q); }
  near(s2.f[0], 0, 1e-12, 'free energies are measured from the first run');
  const pr = s2.predict({ ...T, E: 1.09, gamma: 1.22 }), ex = F.stats({ ...T, E: 1.09, gamma: 1.22 }).p;
  pr.p.forEach((v, i) => ok(Math.abs(v - ex[i]) < Math.max(0.04, 3 * pr.err[i]), `MBAR ${F.NAMES[i]} ${(v * 100).toFixed(1)} ± ${(pr.err[i] * 100).toFixed(1)} against exact ${(ex[i] * 100).toFixed(1)}`));
}

// Plate XI: the verdict logic
{
  const b = new CaseBook();
  ok(b.verdict('unconverged', true) === null, 'no verdict before the two checks');
  b.longer = true; ok(b.verdict('unconverged', true) === null, 'running longer alone is not enough');
  b.fromMisfold = true; ok(b.verdict('unconverged', false) === null, 'no verdict while runs are still going');
  ok(b.verdict('rare', true).right === false && b.mistakes === 1, 'a wrong call is counted');
  ok(b.verdict('unconverged', true).tier === 1, 'the right call scores');
  ok(b.verdict('unconverged', true) === null, 'a double tap is ignored');
  ok(b.verdict('absent', true) === null && b.mistakes === 1, 'and so is a stray tap on another answer');
  ok(b.next() === true && b.c === 1 && b.next() === false && b.c === 1, 'a second timer does not skip a chain');
  for (const v of ['absent', 'rare']) { b.longer = b.fromMisfold = true; b.verdict(v, true); b.next(); }
  ok(b.c === 2 && b.closed && !b.next() && b.cs === CASES[2], 'it can never run past the last chain');
  ok(b.verdict('rare', true) === null, 'and the last chain takes no more verdicts');
  const c = new CaseBook();
  for (const k of CASES) { c.longer = c.fromMisfold = true; const r = c.verdict(k.answer, true); if (k === CASES[2]) ok(r.tier === 3, 'three right calls with no mistake is the third tier'); c.next(); }
}

// Plate XI: each chain gives the same evidence on any run, not only on a chosen one
{
  const [trap, gone, rare] = CASES, LONG = 400000;
  const play = (cs, seed) => {
    const go = (start, sd) => { const r = new W.Run(cs.p, { steps: cs.steps, start, rand: mulberry(sd) }); r.total += LONG; r.advance(Infinity); return r; };
    const a = go(F.NATIVE_F, seed), b = go(F.MISFOLD, seed + 1000);
    const f = r => r.fractions()[F.MISFOLDED] * 100;
    return { spread: Math.abs(f(a) - f(b)), arrivals: a.entries[F.MISFOLDED] + b.entries[F.MISFOLDED], hops: a.hops + b.hops };
  };
  const seeds = Array.from({ length: 10 }, (_, i) => 700 + i);
  ok(F.stats(trap.p).p[F.MISFOLDED] > 0.07, 'trapped chain: the misfold exists in truth');
  const A = seeds.map(s => play(trap, s));
  ok(A.every(e => e.spread > 5), `trapped chain: replicas disagree on every seed (smallest spread ${Math.min(...A.map(e => e.spread)).toFixed(0)} points)`);
  const x = F.stats(gone.p).p[F.MISFOLDED];
  ok(x < 1e-4, `absent chain: the misfold is really absent, ${(x * 100).toFixed(4)}%, under the census share with no energy at all`);
  const B = seeds.map(s => play(gone, s));
  ok(B.every(e => e.arrivals <= 1 && e.hops > 100 && e.spread < 5), `absent chain: at most ${Math.max(...B.map(e => e.arrivals))} arrivals in ${Math.min(...B.map(e => e.hops))} or more hops, replicas agree`);
  const y = F.stats(rare.p).p[F.MISFOLDED];
  ok(y > 0.012 && y < 0.04, `rare chain: rare but present, ${(y * 100).toFixed(1)}%`);
  const C = seeds.map(s => play(rare, s));
  ok(C.every(e => e.arrivals >= 5 && e.spread < 5), `rare chain: at least ${Math.min(...C.map(e => e.arrivals))} arrivals on every seed, replicas agree`);
}

// Plate XII: the loop, through the same class the plate uses
const SOFT = { E: 1.12, gamma: 1.2, q: 0.7, k: 0.02, w: 0.9 }, MORE = { ...W.POP_ONLY, salt: 1, den: 1 }, MED = W.PULLS.medium;
{
  const P = new W.Project(mulberry(4242)), st = P.store;
  ok(Object.values(W.PULLS).includes(MED), 'the test uses a pull the plate offers');
  const r1 = P.run(F.STOCK_P);
  ok(!r1.seen[F.WET] || !r1.seen[F.UNFOLDED], 'stock run misses at least one state');
  const near0 = st.predict({ ...F.STOCK_P, w: 0.3 });
  ok(near0.neff / near0.samples > 0.8, `high Neff (${(near0.neff / near0.samples * 100).toFixed(0)}%) can coexist with a missed state`);
  const unseen = r1.seen.findIndex(v => !v);
  ok(st.predict({ ...F.STOCK_P, w: 2 }).p[unseen] === 0, 'an unvisited state cannot be reweighted into existence, however far the knob turns');
  ok(near0.trapped > 0.9, 'the plate flags an estimate that rests on a run that never crossed');
  const blind = st.predict(SOFT), r2 = P.run(SOFT), got = r2.fractions();
  ok(worst(blind.p, got) > 15, `low overlap: prediction was ${worst(blind.p, got).toFixed(0)} points off the next run (Neff ${blind.neff.toFixed(0)})`);
  ok(r2.seen.every(Boolean), 'a softer run visits all five states');
  const mid = Object.fromEntries(Object.keys(SOFT).map(k => [k, (SOFT[k] + F.STOCK_P[k]) / 2])), pm = st.predict(mid);
  console.log(`     midway between the two runs: stuck share ${(pm.trapped * 100).toFixed(0)}%, misfold ${(pm.p[3] * 100).toFixed(1)} ± ${(pm.err[3] * 100).toFixed(1)} against exact ${(F.stats(mid).p[3] * 100).toFixed(1)}`);
  ok(pm.trapped >= 0.4, 'midway between a stuck run and a free one, the warning is on');
  let x = SOFT;
  for (let i = 0; i < 3; i++) { x = P.fit(x, G.data, W.POP_ONLY, MED).x; P.run(x); }
  x = P.fit(x, G.data, W.POP_ONLY, MED).x;
  ok(st.predict(x).trapped < 0.2, 'once fitted, the estimate leans far less on the stuck run');
  ok(st.runs.length === 5, 'a populations-only fit has spent 5 of the 8 runs');
}

// What the loop does over many runs, with the plate's own steps: never only one seed
{
  const seeds = 8, A = [], B = [];
  for (let s = 0; s < seeds; s++) {
    const P = new W.Project(mulberry(9000 + 37 * s));
    P.run(F.STOCK_P); P.run(SOFT);
    let x = SOFT;
    for (let i = 0; i < 3; i++) { x = P.fit(x, G.data, W.POP_ONLY, MED).x; P.run(x); }
    x = P.fit(x, G.data, W.POP_ONLY, MED).x; A.push(W.judge(x, G));
    for (let i = 0; i < 3; i++) { x = P.fit(x, G.data, MORE, MED).x; P.run(x); }
    x = P.fit(x, G.data, MORE, MED).x; B.push(W.judge(x, G));
  }
  const a = A.filter(passes).length, b = B.filter(passes).length;
  console.log(`     ${seeds} seeds, 8 runs each: populations alone pass everything ${a} times; with salt and denaturant ${b} times`);
  ok(a < seeds, 'populations alone do not always pass');
  ok(b >= seeds - 2 && b >= a, 'adding salt and denaturant passes on most seeds, and no less often');
}

// Degeneracy: sets that pass the 300 K fit. Each is a long way from the hidden truth.
{
  const [a, b, c] = F.DECOYS.map(x => W.judge(x, G));
  ok(a.fitOk && !a.coreOk, `rival 1 fits (${a.fit.toFixed(1)}) and fails the core mutant by ${a.coreOff.toFixed(1)}`);
  ok(b.fitOk && !b.mutOk, `rival 2 fits (${b.fit.toFixed(1)}) and fails the charge-free mutant by ${b.mutOff.toFixed(1)}`);
  ok(passes(c), `rival 3 passes everything (fit ${c.fit.toFixed(1)}, mutant ${c.mutOff.toFixed(1)}, core ${c.coreOff.toFixed(1)}): the data do not fix every parameter`);
  ok(F.DECOYS[0].E < 0.9 && F.DECOYS[1].q > 1.2, 'and they really are far from the hidden set');
  const m = W.misses(F.RIVAL, G);
  ok(m.p300 <= W.TOL.pop && m.den > 10, `the rival only fits the 300 K populations: denaturant off by ${m.den.toFixed(1)}`);
}

console.log(`\n${n - fail} of ${n} passed`);
process.exit(fail ? 1 : 0);
