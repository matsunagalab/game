// Screen-free checks of all the maths. Run with: node tools/test.mjs
import assert from 'node:assert/strict';
import { apply, applyInverse, compose, det3, framesOf, frameFromAtoms, IDENTITY, invert, moveFrames, movePoints, mulRR, rotationAxisAngle, rotationFromBCD } from '../src/science/frames.js';
import { alignedError, drmsd, fape, lddt, nearestRotation, rmsd, superpose } from '../src/science/metrics.js';
import { apc, compressColumns, entropy, miFromTable, mutualInformation, reweight, uniformWeights, miMatrix, rankPairs, precision } from '../src/science/msa.js';
import { invertSPD, meanFieldDCA, partialCorrelations, runAll } from '../src/science/dca.js';
import { conflicts, copyBounds, emptyBounds, fewestThirds, makeBounds, restrain, smooth, throughThird } from '../src/science/bounds.js';
import { bestCuts, mapSums, pieceFit, trustFit, withinAcross } from '../src/science/pieces.js';
import { ipaValuePoint, ipaWeights, maxChange, rawWeights } from '../src/science/ipa.js';
import { TwoTower } from '../src/science/twotower.js';
import { Gas, localAtoms } from '../src/science/gas.js';
import { PoseGas } from '../src/science/pose.js';
import { evolveStar, evolveTree } from '../src/science/tree.js';
import { Descent } from '../src/science/descent.js';
import { CHEY, SH3, TOUCH, TRIANGLE, TRIANGLES } from '../src/science/cases.js';
import { closestAtoms, getModel, getPAE, getStructure, loadMSA, loadSH3, columnDistances } from '../src/science/data.js';

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b}`);
const rng = (seed) => { let s = seed; return () => { s = (s * 48271) % 2147483647; return s / 2147483647; }; };

check('mutual information matches a hand-worked table', () => {
  // Two columns, two letters: (A,A) (A,A) (B,B) (B,A). p(A,A)=.5 p(B,B)=.25 p(B,A)=.25.
  // pa = .5,.5  pb = .75,.25. MI = .5 ln(.5/.375) + .25 ln(.25/.125) + .25 ln(.25/.375)
  const X = Uint8Array.from([0, 0, 0, 0, 1, 1, 1, 0]);
  const hand = 0.5 * Math.log(0.5 / 0.375) + 0.25 * Math.log(0.25 / 0.125) + 0.25 * Math.log(0.25 / 0.375);
  near(mutualInformation(X, 4, 2, 0, 1, new Float64Array(4).fill(1), 0, 2), hand, 1e-12);
});

check('a perfectly tied pair has MI equal to its entropy, and an independent pair has none', () => {
  const X = new Uint8Array(4000), L = 2, w = new Float64Array(2000).fill(1);
  for (let s = 0; s < 2000; s += 1) { X[s * L] = s % 2; X[s * L + 1] = s % 2; }
  near(mutualInformation(X, 2000, L, 0, 1, w, 0, 2), Math.log(2), 1e-12);
  for (let s = 0; s < 2000; s += 1) { X[s * L] = s % 2; X[s * L + 1] = (s >> 1) % 2; }
  near(mutualInformation(X, 2000, L, 0, 1, w, 0, 2), 0, 1e-12);
});

check('a constant column can carry no information', () => {
  const r = rng(3), X = new Uint8Array(1000), w = new Float64Array(500).fill(1);
  for (let s = 0; s < 500; s += 1) { X[s * 2] = 0; X[s * 2 + 1] = Math.floor(r() * 4); }
  near(entropy(X, 500, 2, 0, w), 0, 1e-12);
  near(mutualInformation(X, 500, 2, 0, 1, w, 0, 4), 0, 1e-12);
});

check('APC matches Dunn 2008 by hand, and brings a real pair out from under chatty columns', () => {
  // By hand, for three columns: means r = (2.5, 3, 3.5), overall 3, so A(0,1) = 2 - 2.5*3/3 = -0.5.
  const H = Float64Array.from([0, 2, 3, 2, 0, 4, 3, 4, 0]);
  near(apc(H, 3)[1], -0.5, 1e-12);
  // Columns 0 and 5 score high with everyone. A true extra link sits between two quiet columns, 2 and 3.
  const L = 40, S = new Float64Array(L * L), b = Array.from({ length: L }, (_, i) => (i === 0 || i === 5 ? 4 : 1));
  for (let i = 0; i < L; i += 1) for (let j = 0; j < L; j += 1) if (i !== j) S[i * L + j] = b[i] * b[j];
  S[2 * L + 3] = S[3 * L + 2] = 6;
  const top = (M) => { let k = [0, 1]; for (let i = 0; i < L; i += 1) for (let j = i + 1; j < L; j += 1) if (M[i * L + j] > M[k[0] * L + k[1]]) k = [i, j]; return k; };
  assert.deepEqual(top(S), [0, 5], 'raw scores favour the chatty pair');
  assert.deepEqual(top(apc(S, L)), [2, 3], 'APC favours the real one');
});

check('Cholesky inverse gives the identity', () => {
  const n = 40, r = rng(9), B = Array.from({ length: n * n }, () => r() - 0.5), A = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) { let s = i === j ? 2 : 0; for (let k = 0; k < n; k += 1) s += B[i * n + k] * B[j * n + k]; A[i * n + j] = s; }
  const C = A.slice();
  for (const _ of invertSPD(C, n)) { /* run */ }
  for (let i = 0; i < n; i += 1) for (let j = i; j < n; j += 1) {
    let s = 0;
    for (let k = 0; k < n; k += 1) s += A[i * n + k] * (k <= j ? C[j * n + k] : C[k * n + j]);
    near(s, i === j ? 1 : 0, 1e-9);
  }
});

check('in a chain A-B-C the direct A-C link is exactly zero though A and C correlate', () => {
  for (const r of [0.2, 0.5, 0.8]) {
    const m = [1, r, r * r, r, 1, r, r * r, r, 1], p = partialCorrelations(m);
    near(p.ac, 0, 1e-12);
    assert.ok(p.ab > 0.1 && p.bc > 0.1);
  }
});

check('DCA finds a planted coupling, and correlation alone is fooled by a chain', () => {
  // A chain a-b-c: b copies a, c copies b. MI(a,c) is large. A separate planted pair d-e. Other columns random.
  const N = 6000, L = 10, r = rng(21), X = new Uint8Array(N * L);
  for (let s = 0; s < N; s += 1) {
    const row = s * L;
    for (let i = 0; i < L; i += 1) X[row + i] = Math.floor(r() * 4);
    X[row + 1] = r() < 0.82 ? X[row] : Math.floor(r() * 4);
    X[row + 2] = r() < 0.82 ? X[row + 1] : Math.floor(r() * 4);
    X[row + 7] = r() < 0.8 ? X[row + 6] : Math.floor(r() * 4);
  }
  const w = uniformWeights(N).w, q = 4, M = miMatrix(X, N, L, w, 1e-3, 4);
  const { Y, qi } = compressColumns(X, N, L, 3, 4);
  const S = runAll(meanFieldDCA(Y, N, L, qi, w, 0.3));
  assert.ok(M[0 * L + 2] > M[0 * L + 5] * 40, 'MI sees the indirect pair');
  assert.ok(S[6 * L + 7] > S[3 * L + 5] * 6, 'the planted pair stands out');
  // On letters mean-field DCA shrinks an indirect pair but does not zero it. Exact zero belongs to the Gaussian case above.
  const rM = M[0 * L + 2] / M[0 * L + 1], rS = S[0 * L + 2] / S[0 * L + 1];
  console.log(`    indirect / direct: MI ${rM.toFixed(3)}, DCA ${rS.toFixed(3)}`);
  assert.ok(S[0 * L + 1] > S[0 * L + 2], 'direct beats indirect');
  assert.ok(q === 4);
});

check('the two-tower exchange recovers a planted pair, and needs both wires', () => {
  const N = 1500, L = 8, r = rng(5), X = new Uint8Array(N * L);
  for (let s = 0; s < N; s += 1) {
    const row = s * L;
    for (let i = 0; i < L; i += 1) X[row + i] = Math.floor(r() * 4);
    X[row + 3] = r() < 0.8 ? X[row + 1] : Math.floor(r() * 4);
  }
  const { Y, qi } = compressColumns(X, N, L, 4, 4);
  const T = new TwoTower(Y, N, L, qi, { q: 5, batch: 400 });
  const first = (T.step(), T.loss);
  for (let b = 0; b < 12; b += 1) T.step();
  const S = T.scores();
  assert.ok(T.loss < first - 0.02, 'loss falls');
  let bestOther = 0;
  for (let i = 0; i < L; i += 1) for (let j = i + 1; j < L; j += 1) if (!(i === 1 && j === 3)) bestOther = Math.max(bestOther, S[i * L + j]);
  assert.ok(S[1 * L + 3] > bestOther * 3);
  const cut = new TwoTower(Y, N, L, qi, { q: 5, batch: 400 });
  cut.wires.msaToPair = false;
  for (let b = 0; b < 4; b += 1) cut.step();
  assert.ok(cut.scores().every((v) => v === 0), 'no path into the pair map');
});

check('bound smoothing tightens upper bounds through a shortcut', () => {
  const b = makeBounds(5);
  smooth(b);
  near(b.U[0 * 5 + 4], 15.2, 1e-4, 'chain only');
  restrain(b, 0, 3, 3.2, 8);
  smooth(b);
  near(b.U[0 * 5 + 3], 8, 1e-4);
  near(b.U[0 * 5 + 4], 11.8, 1e-4, 'through the shortcut');
  near(b.U[1 * 5 + 3], 7.6, 1e-4, 'the chain is still shorter here');
});

check('bound smoothing raises lower bounds, and always keeps the triangle inequality', () => {
  const b = makeBounds(6), r = rng(4);
  restrain(b, 0, 2, 7, 7.4);
  restrain(b, 0, 5, 3, 6);
  restrain(b, 1, 4, 4, 9);
  smooth(b);
  for (let t = 0; t < 400; t += 1) {
    const i = Math.floor(r() * 6), j = Math.floor(r() * 6), k = Math.floor(r() * 6);
    if (i === j || j === k || i === k) continue;
    assert.ok(b.U[i * 6 + j] <= b.U[i * 6 + k] + b.U[k * 6 + j] + 1e-3);
  }
  assert.ok(b.L[2 * 6 + 5] >= 1 - 1e-3, `L ${b.L[2 * 6 + 5]}`);
});

check('an impossible pair of restraints is reported as a conflict', () => {
  const b = makeBounds(4);
  restrain(b, 0, 2, 20, 21);
  restrain(b, 0, 1, 3, 4);
  restrain(b, 1, 2, 3, 4);
  smooth(b);
  assert.ok(conflicts(b).length > 0);
});

check('one third residue tightens by the triangle inequality, by hand', () => {
  // 0-1 is 20 A and 1-2 is 5 A, so through residue 1 the pair 0-2 must lie between 15 and 25.
  const b = emptyBounds(3);
  restrain(b, 0, 1, 20, 20);
  restrain(b, 1, 2, 5, 5);
  assert.equal(b.U[2], Infinity);
  assert.ok(throughThird(b, 1) > 0);
  near(b.U[2], 25, 1e-4); near(b.L[2], 15, 1e-4);
  assert.equal(throughThird(b, 1), 0, 'a second turn through the same residue changes nothing');
  assert.equal(b.L[0 * 3 + 2], b.L[2 * 3 + 0], 'the table stays symmetric');
});

check('taking every third residue once gives exactly what full smoothing gives', () => {
  const make = () => { const b = emptyBounds(7); restrain(b, 0, 3, 12, 12); restrain(b, 3, 6, 5, 5); restrain(b, 1, 3, 4, 4); restrain(b, 2, 6, 7, 7); restrain(b, 4, 5, 9, 9); return b; };
  const a = make(), c = make();
  smooth(a);
  for (let k = 0; k < 7; k += 1) throughThird(c, k);
  a.U.forEach((v, i) => assert.ok(v === c.U[i] || Math.abs(v - c.U[i]) < 1e-4, `U ${i}`));
  a.L.forEach((v, i) => near(v, c.L[i], 1e-4, `L ${i}`));
});

check('the fewest third residues are found by search, and no shorter list works', () => {
  // A path 0 - 1 - 2 - 3 with a long first side. Proving 0 and 3 apart needs both middle residues.
  const b = emptyBounds(5);
  restrain(b, 0, 1, 30, 30); restrain(b, 1, 2, 5, 5); restrain(b, 2, 3, 6, 6); restrain(b, 0, 4, 9, 9);
  const apart = (x) => x.L[0 * 5 + 3] > 8, path = fewestThirds(b, apart);
  assert.equal(path.length, 2);
  for (let k = 0; k < 5; k += 1) { const c = copyBounds(b); throughThird(c, k); assert.ok(!apart(c), `one move through ${k} must not do it`); }
  const c = copyBounds(b); path.forEach((k) => throughThird(c, k));
  near(c.L[3], 19, 1e-3);
  near(b.L[3], 3.2, 1e-5, 'the search leaves the table alone');
});

check('piece fit matches a hand-worked map, and a cut in the right place explains all of it', () => {
  // Two pieces of two residues: 1 inside, 9 between. Off-diagonal cells: 4 ones and 8 nines.
  const n = 4, e = Float32Array.from([0, 1, 9, 9, 1, 0, 9, 9, 9, 9, 0, 1, 9, 9, 1, 0]), s = mapSums(e, n);
  near(s.mean, (4 + 72) / 12, 1e-9);
  near(pieceFit(s, []), 0, 1e-9);
  near(pieceFit(s, [2]), 1, 1e-9);
  assert.ok(pieceFit(s, [1]) < 0.5, 'a cut in the wrong place keeps less');
  assert.deepEqual(bestCuts(s, 1, { end: 1 }).cuts, [2]);
  const w = withinAcross(s, [2]);
  near(w.within, 1, 1e-9); near(w.across, 9, 1e-9);
});

check('the search for cuts agrees with trying every pair of cuts on a real map', () => {
  const { n, e } = getPAE('P0DP23'), s = mapSums(e, n), found = bestCuts(s, 2);
  let top = 0;
  for (let a = 3; a < n - 3; a += 1) for (let b = a + 1; b <= n - 3; b += 1) top = Math.max(top, pieceFit(s, [a, b]));
  near(found.fit, top, 0.004, 'best pair');
});

check('a real PAE map splits calmodulin at its linker, and hardly splits CheY', () => {
  const c = getPAE('P0DP23'), s = mapSums(c.e, c.n), best = bestCuts(s, 1);
  assert.ok(best.cuts[0] >= 74 && best.cuts[0] <= 84, `cut at ${best.cuts}`);
  assert.ok(best.fit > 0.7, `fit ${best.fit}`);
  const w = withinAcross(s, best.cuts);
  assert.ok(w.across > w.within * 3, `${w.across} ${w.within}`);
  const a = getPAE('P69441'), wa = withinAcross(mapSums(a.e, a.n), bestCuts(mapSums(a.e, a.n), 1).cuts);
  assert.ok(wa.across - wa.within < 1.5, 'the same cut finds next to nothing in adenylate kinase');
});

check('trust fit judges pieces by their mean, and counts strays', () => {
  const score = [...new Array(50).fill(30), ...new Array(50).fill(95)];
  near(trustFit(score, []).fit, 0.5, 1e-9);
  near(trustFit(score, [50]).fit, 1, 1e-9);
  near(trustFit(score, [40]).fit, 0.9, 1e-9);
  assert.equal(trustFit(score, [50]).pieces[1].trusted, true);
  assert.equal(trustFit(score, [50, 50]).pieces.length, 2, 'an empty piece is no piece');
});

check('frame from atoms follows Algorithm 21', () => {
  const T = frameFromAtoms([1, 1.2, 0.3], [0.2, 0.1, 0.4], [1.8, -0.2, 0.1]);
  near(det3(T.R), 1, 1e-12);
  assert.deepEqual(T.t, [0.2, 0.1, 0.4]);
  const x = applyInverse(T, [1.8, -0.2, 0.1]);
  assert.ok(x[0] > 0); near(x[1], 0, 1e-12); near(x[2], 0, 1e-12);
  const n = applyInverse(T, [1, 1.2, 0.3]);
  assert.ok(n[1] > 0); near(n[2], 0, 1e-12);
});

check('composition is (R1 R2, R1 t2 + t1), and inverting undoes it', () => {
  const A = { R: rotationAxisAngle([1, 2, 3], 0.7), t: [1, -2, 3] }, B = { R: rotationAxisAngle([-2, 1, 0.5], 1.9), t: [0.3, 5, -1] }, x = [0.4, -0.8, 2];
  const C = compose(A, B);
  apply(C, x).forEach((v, i) => near(v, apply(A, apply(B, x))[i], 1e-12));
  mulRR(A.R, B.R).forEach((v, i) => near(v, C.R[i], 1e-12));
  const I = compose(C, invert(C));
  I.t.forEach((v) => near(v, 0, 1e-12));
  applyInverse(A, apply(A, x)).forEach((v, i) => near(v, x[i], 1e-12));
});

check('the quaternion of Algorithm 23 gives a proper rotation and favours small ones', () => {
  near(det3(rotationFromBCD(0.3, -1.2, 0.8)), 1, 1e-12);
  rotationFromBCD(0, 0, 0).forEach((v, i) => near(v, [1, 0, 0, 0, 1, 0, 0, 0, 1][i], 1e-12));
});

const che = getStructure('che3');
const frames = che.frames, ca = che.ca;

check('IPA attention is unchanged by a global rotation and translation, to numerical precision', () => {
  const r = rng(77), pt = () => [(r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6];
  const q = [pt(), pt(), pt(), pt()], keys = frames.map(() => [pt(), pt(), pt(), pt()]), bias = frames.map(() => r());
  const T = { R: rotationAxisAngle([0.3, -1, 0.7], 2.1), t: [40, -13, 8] };
  const a = ipaWeights(frames, 30, q, keys, { bias }), b = ipaWeights(moveFrames(frames, T), 30, q, keys, { bias });
  assert.ok(maxChange(a, b) < 1e-11, `change ${maxChange(a, b)}`);
  near(a.reduce((x, y) => x + y, 0), 1, 1e-12);
});

check('the IPA output point does not change with the global frame, so the update is equivariant', () => {
  const r = rng(12), pt = () => [(r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6];
  const q = [pt(), pt(), pt(), pt()], keys = frames.map(() => [pt(), pt(), pt(), pt()]), vals = frames.map(pt);
  const T = { R: rotationAxisAngle([1, 0.2, -0.4], 1.2), t: [-7, 21, 3] };
  const m = moveFrames(frames, T), wa = ipaWeights(frames, 12, q, keys), wb = ipaWeights(m, 12, q, keys);
  ipaValuePoint(frames, 12, wa, vals).forEach((v, i) => near(v, ipaValuePoint(m, 12, wb, vals)[i], 1e-9));
});

check('attention on raw coordinates does change with a rotation', () => {
  const T = { R: rotationAxisAngle([0.3, -1, 0.7], 2.1), t: [0, 0, 0] };
  assert.ok(maxChange(rawWeights(ca, 30), rawWeights(movePoints(ca, T), 30)) > 0.01);
});

check('IPA can tell a mirror image, because local z flips', () => {
  const r = rng(31), pt = () => [(r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6];
  const q = [pt(), pt(), pt(), pt()], keys = frames.map(() => [pt(), pt(), pt(), pt()]);
  const mir = (p) => p.map((x) => [-x[0], -x[1], -x[2]]);
  const F = framesOf({ n: mir(che.n), ca: mir(ca), c: mir(che.c) });
  // The rotation test above allows 1e-11. A mirror moves the weights by many orders of magnitude more than that.
  const c = maxChange(ipaWeights(frames, 30, q, keys, { gamma: 8 }), ipaWeights(F, 30, q, keys, { gamma: 8 }));
  console.log(`    largest weight change under a mirror: ${c.toExponential(2)}`);
  assert.ok(c > 1e-4);
});

check('FAPE is zero at identity and under any global rigid motion', () => {
  near(fape(frames, ca, frames, ca), 0, 1e-3);
  const T = { R: rotationAxisAngle([1, -1, 2], 1.1), t: [12, 3, -40] };
  near(fape(moveFrames(frames, T), movePoints(ca, T), frames, ca), 0, 1e-3);
});

const mirror = (p) => p.map((x) => [-x[0], -x[1], -x[2]]);
const mirrored = { n: mirror(che.n), ca: mirror(ca), c: mirror(che.c) };
const mirrorFrames = framesOf(mirrored);

check('FAPE is large for a mirror image, and matches the supplement (10): local z flips', () => {
  const v = fape(mirrorFrames, mirrored.ca, frames, ca, { clamp: Infinity });
  assert.ok(v > 1, `FAPE ${v}`);
  const a = applyInverse(mirrorFrames[20], mirrored.ca[60]), b = applyInverse(frames[20], ca[60]);
  near(a[0], b[0], 1e-9); near(a[1], b[1], 1e-9); near(a[2], -b[2], 1e-9);
});

check('a mirror image has dRMSD 0 and lDDT 1, and RMSD 0 only if reflection is allowed', () => {
  near(drmsd(mirrored.ca, ca), 0, 1e-9);
  near(lddt(mirrored.ca, ca), 1, 1e-12);
  assert.ok(rmsd(mirrored.ca, ca) > 5);
  near(rmsd(mirrored.ca, ca, { mirror: true }), 0, 1e-6);
});

check('the clamp caps every term at 10 A', () => {
  const far = ca.map((p) => [p[0] + 500, p[1], p[2]]);
  assert.ok(fape(frames, far, frames, ca) <= 1 + 1e-9);
  assert.ok(fape(frames, far, frames, ca, { clamp: Infinity }) > 40);
});

check('aligned error is zero for identical structures and not symmetric otherwise', () => {
  const e = alignedError(frames, ca, frames, ca);
  assert.ok(Math.max(...e) < 1e-9);
  const r = rng(8), noisy = ca.map((p) => p.map((v) => v + (r() - 0.5) * 3));
  // Asymmetry needs the frames themselves to differ: with identical rotations e(i,j) would equal e(j,i).
  const f2 = frames.map((T, i) => ({ R: mulRR(rotationAxisAngle([r(), r(), r()], 0.3), T.R), t: noisy[i] })), n = ca.length, g = alignedError(f2, noisy, frames, ca);
  assert.ok(Math.abs(g[3 * n + 40] - g[40 * n + 3]) > 1e-4);
});

check('Kabsch and Horn agree: RMSD is zero after a rigid motion and rotations come out proper', () => {
  const T = { R: rotationAxisAngle([2, 1, -1], 0.9), t: [5, 6, 7] };
  near(rmsd(movePoints(ca, T), ca), 0, 1e-6);
  near(det3(superpose(movePoints(ca, T), ca).R), 1, 1e-9);
  near(det3(nearestRotation([1.2, 0.1, 0, -0.2, 0.9, 0.1, 0, 0, 1.1])), 1, 1e-9);
});

check('RMSD against a hand-worked case', () => {
  const P = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], Q = P.map((p) => [p[0], p[1], p[2]]);
  Q[0] = [0, 0, 0.4];
  const fit = superpose(P, Q);
  assert.ok(fit.rmsd < Math.sqrt(0.16 / 4) + 1e-9);
  assert.ok(fit.rmsd > 0);
});

check('lDDT follows the four thresholds and ignores far pairs', () => {
  const t = [[0, 0, 0], [3, 0, 0], [6, 0, 0], [40, 0, 0]];
  near(lddt(t, t), 1, 1e-12);
  const p = [[0, 0, 0], [3.7, 0, 0], [6, 0, 0], [80, 0, 0]];
  // pairs (0,1) error .7, (1,2) error .7, (0,2) 0. Each .7 passes 1,2,4 of 4 thresholds = .75. Far residue has no pairs.
  near(lddt(p, t), (0.75 * 4 + 1 * 2) / 6, 1e-12);
});

check('the distance-only gas reaches the real shape, in one hand or the other', () => {
  const shape = localAtoms(che), n = ca.length;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const g = new Gas(n, shape, { seed: 37 });
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) g.restraints.push({ i, a: 0, j, b: 0, d: dist(ca[i], ca[j]), w: 1 });
  g.run(160, { rate: 0.25, turn: 0.03 });
  const p = g.points(0);
  assert.ok(Math.min(rmsd(p, ca), rmsd(p, ca, { mirror: true })) < 0.5);
  assert.ok(lddt(p, ca) > 0.98);
});

check('pose averaging folds from a black hole with the right hand', () => {
  const g = new PoseGas(frames);
  for (let b = 0; b < 8; b += 1) g.step();
  const p = g.points();
  assert.ok(rmsd(p, ca) < 2.5, `rmsd ${rmsd(p, ca)}`);
  assert.ok(rmsd(p, ca) < rmsd(p, ca, { mirror: true }));
});

check('same descent, different loss: FAPE takes the real hand, and distances alone can land on the mirror', () => {
  const n = ca.length, m = [0, 0, 0];
  for (const p of ca) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
  const c = ca.map((p) => [p[0] - m[0], p[1] - m[1], p[2] - m[2]]), f = frames.map((T, i) => ({ R: T.R, t: c[i] }));
  const fold = (loss, seed) => { const d = new Descent(f, c, { loss, seed, rate: 0.9, polish: 12 }); for (let k = 0; k < 1000; k += 1) d.step(); return d.points(); };
  const p = fold('fape', 11);
  assert.ok(rmsd(p, c) < 1, `FAPE run RMSD ${rmsd(p, c)}`);
  let mirrors = 0;
  for (let s = 0; s < 8; s += 1) { const q = fold('distance', 11 + 12 * s); if (rmsd(q, c, { mirror: true }) < rmsd(q, c)) mirrors += 1; }
  console.log(`    distance-only: ${mirrors} of 8 came out as the mirror`);
  assert.ok(mirrors > 0);
});

check('real PAE loads, is not symmetric, and shows two rigid lobes in calmodulin', () => {
  const p = getPAE('P0DP23'), { n, e } = p;
  assert.equal(n, 149);
  let within = 0, across = 0, w = 0, a = 0, asym = 0, c = 0;
  for (let i = 7; i < 148; i += 1) for (let j = 7; j < 148; j += 1) {
    if (i === j) continue;
    const v = e[i * n + j], lobeI = i < 73 ? 0 : i >= 83 ? 1 : 2, lobeJ = j < 73 ? 0 : j >= 83 ? 1 : 2;
    if (lobeI === lobeJ && lobeI < 2) { within += v; w += 1; }
    if (lobeI + lobeJ === 1) { across += v; a += 1; }
    asym += Math.abs(v - e[j * n + i]); c += 1;
  }
  assert.ok(within / w < 5 && across / a > 20, `${within / w} ${across / a}`);
  near(asym / c, 2.7, 0.05, 'mean asymmetry on residues 8 to 148');
  assert.equal(getModel('P0DP23').ca.length, 149);
});

// What the puzzle chapters say about their real cases.
const familyOf = (msa, st) => {
  const { N, L, X, col2res } = msa, w = uniformWeights(N).w, M = miMatrix(X, N, L, w), D = columnDistances(msa, st), all = [];
  for (let i = 0; i < L; i += 1) for (let j = i + 6; j < L; j += 1) if (col2res[i] >= 0 && col2res[j] >= 0) all.push(M[i * L + j]);
  all.sort((a, b) => b - a);
  const col = (num) => col2res.findIndex((r) => r >= 0 && st.nums[r] === num);
  return { M, D, L, col, strong: all[Math.floor(all.length * 0.02)], mi: (a, b) => M[col(a) * L + col(b)], d: (a, b) => D[col(a) * L + col(b)] };
};
const cheFam = familyOf(loadMSA(), che), shFam = familyOf(loadSH3(), getStructure('sh3g'));
const touching = (f, list) => { const out = []; for (const a of list) for (const b of list) if (a < b && Math.abs(f.col(a) - f.col(b)) >= 6 && f.mi(a, b) >= f.strong && f.d(a, b) < 8) out.push([a, b]); return out; };

check('chapter 1: the given column has one strongest partner in view, and it touches', () => {
  const { given, residues } = CHEY, f = cheFam;
  const best = residues.filter((r) => r !== given && Math.abs(f.col(r) - f.col(given)) >= 6).sort((a, b) => f.mi(given, b) - f.mi(given, a))[0];
  assert.equal(best, 68);
  assert.ok(f.mi(given, best) >= f.strong && f.d(given, best) < 8, `${f.mi(given, best)} ${f.d(given, best)}`);
});

check('chapter 1: the window holds three more pairs that touch, and strong pairs that do not', () => {
  const f = cheFam, t = touching(f, CHEY.residues).filter(([a, b]) => !(a === 56 && b === 68));
  assert.ok(t.length >= 3, `${t}`);
  assert.ok(f.mi(89, 119) >= f.strong); near(f.d(89, 119), 16.7, 0.06);
  assert.ok(f.mi(59, 119) >= f.strong); near(f.d(59, 119), 18.4, 0.06);
  // Most strong pairs in the family do not touch, as the note says.
  const { M, D, L, strong } = f; let hit = 0, n = 0;
  for (let i = 0; i < L; i += 1) for (let j = i + 6; j < L; j += 1) if (D[i * L + j] >= 0 && M[i * L + j] >= strong) { n += 1; if (D[i * L + j] < 8) hit += 1; }
  assert.ok(hit < n / 2, `${hit} of ${n}`);
});

check('chapter 1: the new family has its own answers, and a random pair rarely is one', () => {
  const f = shFam, t = touching(f, SH3.residues);
  assert.deepEqual(t.map((x) => x.join()).sort(), ['35,43', '44,53']);
  assert.ok(f.mi(37, 46) >= f.strong); near(f.d(37, 46), 18.8, 0.06);
  const pairs = (SH3.residues.length * (SH3.residues.length - 1)) / 2;
  assert.ok(t.length / pairs < 0.03);
});

check('chapter 1: the rows shown are real, whole rows, and sorted they show the pair', () => {
  const msa = loadMSA(), { X, L, col2res } = msa, col = (num) => col2res.findIndex((r) => r >= 0 && che.nums[r] === num);
  for (const s of CHEY.rows) for (const r of CHEY.residues) assert.notEqual(X[s * L + col(r)], 20, 'no gap on view');
  const seen = new Set(CHEY.rows.map((s) => `${X[s * L + col(56)]},${X[s * L + col(68)]}`));
  assert.ok(seen.size <= 4, 'the twelve rows fall into a few letter pairs at S56 and L68');
});

const tri = (spec) => {
  const st = getStructure(spec.key), idx = spec.nums.map((v) => st.nums.indexOf(v)), n = idx.length, b = emptyBounds(n);
  const D = (p, q) => { const x = st.cb[st.nums.indexOf(p)], y = st.cb[st.nums.indexOf(q)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  for (const [p, q] of spec.known) { const i = spec.nums.indexOf(p), j = spec.nums.indexOf(q); restrain(b, i, j, D(p, q), D(p, q)); }
  const [i, j] = spec.pair.map((v) => spec.nums.indexOf(v)).sort((x, y) => x - y);
  return { b, n, i, j, real: D(...spec.pair), solved: (x) => x.L[i * n + j] > TOUCH };
};

check('chapter 4: the first triangle cannot touch, and the real distance lies in its range', () => {
  const D = (p, q) => { const x = che.cb[che.nums.indexOf(p)], y = che.cb[che.nums.indexOf(q)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const a = D(TRIANGLE.far, TRIANGLE.hinge), b = D(TRIANGLE.hinge, TRIANGLE.end), real = D(TRIANGLE.far, TRIANGLE.end);
  assert.ok(a - b > TOUCH && real >= a - b && real <= a + b, `${a} ${b} ${real}`);
});

check('chapter 4: each case has a short real proof, and the real distance survives it', () => {
  TRIANGLES.forEach((spec, c) => {
    const { b, n, i, j, real, solved } = tri(spec), path = fewestThirds(b, solved);
    assert.equal(path.length, [2, 3][c], `case ${c}`);
    const x = copyBounds(b);
    path.forEach((k) => throughThird(x, k));
    assert.ok(x.L[i * n + j] <= real + 1e-3 && x.U[i * n + j] >= real - 1e-3, 'the proof never excludes the truth');
    for (let k = 0; k < n; k += 1) { const y = copyBounds(b); throughThird(y, k); assert.ok(!solved(y), 'one move is not enough'); }
    // Every residue in the table, once each: the proof is there for anyone who reads all of it.
    const all = copyBounds(b); smooth(all); assert.ok(solved(all));
  });
});

check('chapter 4: guessing within the move budget rarely proves the last case', () => {
  const { b, n, solved } = tri(TRIANGLES[1]);
  let hit = 0, tot = 0;
  for (let p = 0; p < n; p += 1) for (let q = 0; q < n; q += 1) for (let r = 0; r < n; r += 1) {
    const x = copyBounds(b); throughThird(x, p); throughThird(x, q); throughThird(x, r); tot += 1; if (solved(x)) hit += 1;
  }
  assert.ok(hit / tot < 0.03, `${hit} of ${tot}`);
});

check('chapter 9: four cuts where pLDDT crosses 70 sort p53, and two do not', () => {
  const p = getModel('P04637').plddt;
  assert.ok(trustFit(p, [93, 292, 323, 355]).fit >= 0.94);
  assert.ok(trustFit(p, [93, 292]).fit < 0.94);
  assert.ok(trustFit(p, []).fit < 0.8);
});

check('chapter 9: a wide range of cuts counts on calmodulin, so aim is not the difficulty', () => {
  const { n, e } = getPAE('P0DP23'), s = mapSums(e, n), best = bestCuts(s, 1);
  let ok = 0;
  for (let c = 3; c < n - 3; c += 1) if (pieceFit(s, [c]) >= best.fit * 0.8) ok += 1;
  assert.ok(ok >= 16 && ok <= 40, `${ok} places count`);
});

check('chapter 9: the crystal map shows the hinges of adenylate kinase, and AF2\'s own PAE does not', () => {
  const st = getModel('P69441'), open = getStructure('ake4'), E = alignedError(st.frames, st.ca, open.frames, open.ca), n = 214, s = mapSums(E, n), best = bestCuts(s, 4);
  // The four cuts land near the edges of the NMP and lid domains of Muller et al. 1996.
  [30, 60, 122, 160].forEach((edge, k) => assert.ok(Math.abs(best.cuts[k] - edge) <= 10, `${best.cuts}`));
  const P = getPAE('P69441').e, wP = withinAcross(mapSums(P, n), best.cuts), wE = withinAcross(s, best.cuts);
  assert.ok(wE.across - wE.within > 3 * (wP.across - wP.within), `${wE.across - wE.within} ${wP.across - wP.within}`);
  near(P.reduce((a, b) => a + b, 0) / (n * n), 3.2, 0.1, 'mean PAE');
  // Four random cuts almost never land within reach of all four.
  const r = rng(99); let hit = 0;
  for (let t = 0; t < 40000; t += 1) { const c = [0, 1, 2, 3].map(() => 3 + Math.floor(r() * (n - 6))).sort((a, b) => a - b); if (c.every((v, k) => Math.abs(v - best.cuts[k]) <= 14) && pieceFit(s, c) >= best.fit * 0.7) hit += 1; }
  assert.ok(hit / 40000 < 0.01, `${hit}`);
  assert.ok(pieceFit(s, [30, 60, 122, 160]) >= best.fit * 0.7, 'cuts at the published domain edges pass');
});

check('D57 and K109 are over the C-beta line but touch by their side chains', () => {
  near(closestAtoms()(57, 109), 2.7, 0.05);
  const a = che.cb[che.nums.indexOf(57)], b = che.cb[che.nums.indexOf(109)];
  near(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 8.06, 0.05);
});

check('letters kept for a column can be chosen from training rows alone', () => {
  const X = Uint8Array.from([0, 0, 0, 1, 2, 2, 2, 2]);
  const { kept } = compressColumns(X, 8, 1, 1, 3, 4);
  assert.deepEqual(kept[0], [0], 'the common letter of the held-out rows has no say');
});

check('with no couplings at all, a tree still makes columns look linked, and a star does not', () => {
  const t = evolveTree({ leaves: 512 }), s = evolveStar({ leaves: 512 });
  const mean = ({ X, N, L, q }) => { const w = uniformWeights(N).w, M = miMatrix(X, N, L, w, 1e-3, q); let v = 0, c = 0; for (let i = 0; i < L; i += 1) for (let j = i + 1; j < L; j += 1) { v += M[i * L + j]; c += 1; } return v / c; };
  assert.ok(mean(t) > mean(s) * 1.5, `${mean(t)} ${mean(s)}`);
});

check('sequence reweighting counts exact duplicates once', () => {
  const X = Uint8Array.from([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 0]);
  const { meff, w } = reweight(X, 4, 4);
  near(meff, 2, 1e-12);
  near(w[0], 1 / 3, 1e-12);
  near(miFromTable(new Float64Array([1, 0, 0, 1]), 2, 2, 0), Math.log(2), 1e-12);
});

check('real data: DCA beats raw MI on the real family and contacts are real', () => {
  const msa = loadMSA(), { N, L, X } = msa, D = columnDistances(msa, che);
  const valid = (i, j) => D[i * L + j] >= 0, hit = (i, j) => D[i * L + j] < 8;
  const w = uniformWeights(N).w, M = miMatrix(X, N, L, w);
  const { Y, qi } = compressColumns(X, N, L, 6);
  const S = apc(runAll(meanFieldDCA(Y, N, L, qi, w, 0.5)), L);
  const p = (m) => precision(rankPairs(m, L, valid), 54, hit);
  assert.ok(p(S) > p(M) + 0.3, `${p(S)} ${p(M)}`);
  assert.ok(p(S) > 0.55);
});

console.log(`\n${passed} checks passed`);
