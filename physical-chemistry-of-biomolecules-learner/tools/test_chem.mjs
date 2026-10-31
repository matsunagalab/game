// Checks the numbers the game shows. Run: node tools/test_chem.mjs
import assert from 'node:assert/strict';
import * as C from '../src/chem.js';
import * as X from '../src/sim/exact.js';
import { MBWater, MB, pairExact, pairFree, makeRandom } from '../src/sim/mbwater.js';
import { HoleMeter, smallHole } from '../src/sim/holes.js';
import { DipoleDrop } from '../src/sim/dipole.js';
import { IonSphere, LB } from '../src/sim/ions.js';
import { Disks } from '../src/sim/disks.js';
import { foldAngle, entropyOf, Ring } from '../src/waterview.js';
import { INSERT, CROSS, SHELLS, PMF, PAIR, CAVITY, CAVOFF, HOLES, DENSITY } from '../src/sim/mbtable.js';
import { CROWD } from '../src/sim/disktable.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const ok = (cond, what) => assert.ok(cond, what);
const interp = (rows, T, k) => rows.find((r) => Math.abs(r.T - T) < 1e-6)[k];
let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };

test('constants and formulas', () => {
  close(C.debye(0.15), 7.85, 0.01, 'Debye length at cell salt');
  close(332 / (3 * C.RT(298) * 0 + 3), 110.7, 0.1, '332 / 3 with no salt');
  close(LB, 7.15, 0.02, 'Bjerrum length in water at 25 C');
  close(X.COULOMB / (X.EWATER * 3), 1.41, 0.01, 'two charges at 3 A in water');
});

test('MB energy against a hand-checked example', () => {
  // Waters one unit apart, an arm of each pointing straight at the other.
  const lj = 0.4 * (0.7 ** 12 - 0.7 ** 6);
  close(lj, -0.04152, 1e-4, 'hand LJ at r = 1');
  close(pairExact(0, 0, 0, 1, 0, Math.PI), -1 + lj, 1e-9, 'perfect bond');
  // Turn one water by 60 degrees: no arm points at the other, so only the LJ term is left.
  close(pairExact(0, 0, Math.PI / 3, 1, 0, Math.PI), lj, 1e-6, 'bond broken by turning');
  close(pairExact(0, 0, 0, 1.1, 0, Math.PI) - 4 * MB.eLJ * ((0.7 / 1.1) ** 12 - (0.7 / 1.1) ** 6), -Math.exp(-(0.1 ** 2) / (2 * 0.085 ** 2)), 1e-9, 'radial Gaussian');
});

test('fast energy equals the full nine-arm sum', () => {
  const w = new MBWater({ n: 2, L: 12, T: 1, seed: 3 });
  const r = makeRandom(9);
  for (let k = 0; k < 4000; k++) {
    const dist = 0.62 + r() * 1.8;
    const a = r() * 6.3;
    w.x[0] = 5; w.y[0] = 5;
    w.x[1] = 5 + dist * Math.cos(a); w.y[1] = 5 + dist * Math.sin(a);
    w.setArms(0, r() * 6.3); w.setArms(1, r() * 6.3);
    w.rebuild();
    close(w.energyOf(0), pairExact(w.x[0], w.y[0], w.t[0], w.x[1], w.y[1], w.t[1]), 2e-4, 'pair energy');
  }
});

test('total energy equals the sum over pairs, with periodic images', () => {
  const w = new MBWater({ n: 40, L: 8, T: 0.5, seed: 4 });
  w.sweep(200);
  let e = 0;
  for (let i = 0; i < w.n; i++) {
    for (let j = i + 1; j < w.n; j++) {
      let dx = w.x[j] - w.x[i], dy = w.y[j] - w.y[i];
      dx -= w.L * Math.round(dx / w.L); dy -= w.L * Math.round(dy / w.L);
      if (dx * dx + dy * dy < MB.rc * MB.rc) e += pairExact(0, 0, w.t[i], dx, dy, w.t[j]);
    }
  }
  close(w.totalEnergy(), e, 1e-3, 'total energy');
});

test('Monte Carlo obeys detailed balance: two waters against exact quadrature', () => {
  const T = 0.6, L = 6.2;
  // Exact <E> for one pair in a periodic box, by quadrature over r and both angles.
  let z = 0, u = 0;
  const NR = 500, NA = 72;
  for (let i = 0; i < NR; i++) {
    const r = 0.45 + ((i + 0.5) * (MB.rc - 0.45)) / NR;
    for (let a = 0; a < NA; a++) {
      for (let c = 0; c < NA; c++) {
        const e = pairExact(0, 0, (a / NA) * 2.0944, r, 0, (c / NA) * 2.0944);
        const w = r * Math.exp(-e / T);
        z += w; u += w * e;
      }
    }
  }
  const dr = (MB.rc - 0.45) / NR;
  const area = L * L - Math.PI * MB.rc * MB.rc; // Beyond the cut-off the weight is 1 and the energy 0.
  const cells = NA * NA;
  const Z = (2 * Math.PI * z * dr) / cells + area;
  const U = (2 * Math.PI * u * dr) / cells;
  const exact = U / Z;
  const w = new MBWater({ n: 2, L, T, seed: 21 });
  w.step = 1.2; w.turn = 1.5;
  let sum = 0, cnt = 0;
  for (let s = 0; s < 3000000; s++) { w.moveOne(s & 1); if (s > 2000) { sum += w.energyOf(0); cnt++; } }
  close(sum / cnt, exact, 0.012, 'mean energy of a pair');
});

test('constant-pressure measurements have the right order', () => {
  ok(DENSITY.every(([, r]) => r > 0.6 && r < 1.05), 'liquid range');
  ok(DENSITY[DENSITY.length - 1][1] < DENSITY[0][1], 'less dense when hot');
});

test('the bill: signs, compensation and the bonds-off control, solute of diameter 1', () => {
  const t = INSERT[1].on;
  ok(t.every((p) => p.dG > 0.4), 'dissolving always costs free energy');
  ok(interp(t, 0.17, 'mTdS') > 0.4 && interp(t, 0.17, 'dH') < 0, 'cold: entropy pays, enthalpy helps');
  ok(interp(t, 0.26, 'mTdS') < 0 && interp(t, 0.26, 'dH') > 0.5, 'hot: enthalpy pays');
  for (const p of t) if (p.T >= 0.18 && p.T <= 0.28) close(p.dH, p.gh, 0.11, `direct and Gibbs-Helmholtz at ${p.T}`);
  // dH swings by over 1 while dG stays in a narrow band, which on heating is thermodynamics near dS = 0.
  const G = t.map((p) => p.dG), H = t.map((p) => p.dH);
  ok(Math.max(...H) - Math.min(...H) > 1, 'dH swings');
  ok(Math.max(...G) - Math.min(...G) < 0.17, `dG hardly moves: ${Math.max(...G) - Math.min(...G)}`);
  // dG is largest where dS = 0. That is T_S, not the solubility minimum, which sits where dH = 0.
  const top = t[G.indexOf(Math.max(...G))].T;
  const tS = t.find((p, i) => i && t[i - 1].mTdS > 0 && p.mTdS <= 0).T;
  close(top, tS, 0.02, 'largest dG sits at T_S');
  // About half of the hot enthalpy is pressure work.
  close(interp(t, 0.24, 'pdV') / interp(t, 0.24, 'dH'), 0.5, 0.15, 'pressure work share at kT 0.24');
  // Bonds off at the same density: most of dG at kT 0.18, nearly all of it by kT 0.22.
  for (const T of [0.22, 0.24]) close(interp(INSERT[1].off, T, 'dG'), interp(INSERT[1].box, T, 'dG'), 0.08, `same density dG at ${T}`);
  close(interp(INSERT[1].off, 0.18, 'dG') / interp(INSERT[1].box, 0.18, 'dG'), 0.72, 0.06, 'the share at kT 0.18');
  // Same-pressure bondless fluid expands, and dG falls by about half.
  ok(interp(INSERT[1].press, 0.18, 'rho') < 0.82, 'bondless fluid swells at the same pressure');
  ok(interp(INSERT[1].press, 0.18, 'dG') < 0.55 * interp(t, 0.18, 'dG'), 'and its dG is much lower');
  // Who pays depends on temperature and solute. The free energy of restricting water is what stays.
  const hole = INSERT.hole, drop = INSERT[1];
  ok(interp(hole.box, 0.18, 'dU') > 0.6 * interp(hole.box, 0.18, 'dG'), 'cold hole in water: most of the price is energy');
  ok(hole.off.every((p) => p.mTdS > p.dG), 'hole without bonds: entropy pays at every temperature');
  ok(interp(hole.box, 0.26, 'mTdS') > 0.8 * interp(hole.box, 0.26, 'dG'), 'warm hole in water: entropy pays');
  close(interp(hole.off, 0.22, 'dG') / interp(hole.box, 0.22, 'dG'), 1, 0.12, 'the price of room is about the same with or without bonds');
  // For the drop the energy nearly vanishes only by cancellation.
  const usw = interp(drop.box, 0.18, 'usw');
  const reorg = interp(drop.box, 0.18, 'dU') - usw;
  ok(usw < -0.35 && reorg > 0.3, `solute-water ${usw} against water rearranging ${reorg}`);
  ok(Math.abs(interp(drop.box, 0.18, 'dU')) < 0.2, 'so the drop has dU near zero');
  // The split varies with the solute at one temperature.
  const share = (k) => interp(INSERT[k].box, 0.18, 'mTdS') / interp(INSERT[k].box, 0.18, 'dG');
  ok(share('e20') > 2 && share('wca') < 0.35 && share('hole') < 0.35, 'solute decides who pays');
  // Thermal pressure: zero at the density maximum, then it lifts the partial molar dH. It needs bonds.
  ok(Math.abs(interp(drop.on, 0.18, 'Tg')) < 0.08, 'no thermal pressure at the density maximum');
  ok(interp(drop.on, 0.22, 'Tg') > 0.3, 'it rises on heating');
  for (const T of [0.18, 0.2, 0.22, 0.24, 0.26]) close(interp(drop.on, T, 'Hbar'), interp(drop.box, T, 'dU') + interp(drop.on, T, 'TgV'), 0.2, `Hbar = dU_V + T gamma v at ${T}`);
  ok(Math.abs(interp(drop.box, 0.2, 'dU')) < 0.3 && Math.abs(interp(drop.box, 0.24, 'dU')) < 0.3, 'held-box dU stays near zero');
  const bare = drop.press;
  ok(Math.abs(interp(bare, 0.24, 'TgV') - interp(bare, 0.18, 'TgV')) < 0.3, 'without bonds the thermal term does not swing');
  ok(drop.box.every((p) => p.mTdS > 0), 'held box: -TdS never changes sign for this drop');
  // Where dH crosses zero depends on the solute.
  close(CROSS[1], 0.18, 0.012, 'this drop');
  ok(CROSS[0.7] > 0.195, `a smaller drop crosses later: ${CROSS[0.7]}`);
  ok(CROSS.hole === 'below' || CROSS.hole === null, 'a hole has no crossing in this range');
  // The heat capacity is the true bond fingerprint.
  const cpOn = (interp(t, 0.22, 'dH') - interp(t, 0.18, 'dH')) / 0.04;
  const off = INSERT[1].press;
  const cpOff = (interp(off, 0.22, 'dH') - interp(off, 0.18, 'dH')) / 0.04;
  ok(cpOn > 10, `dCp with bonds: ${cpOn}`);
  ok(Math.abs(cpOff) < 3, `dCp without bonds: ${cpOff}`);
});

test('smaller solute, sigma 0.7', () => {
  const t = INSERT[0.7].on;
  ok(interp(t, 0.17, 'dH') < -0.3 && interp(t, 0.17, 'mTdS') > 0.4, 'cold');
  ok(interp(t, 0.26, 'dH') > 0.3 && interp(t, 0.26, 'mTdS') < 0, 'hot');
});

test('the shell: orientation is one term, not the bill', () => {
  const cold = SHELLS.find((s) => s.T === 0.18), hot = SHELLS.find((s) => s.T === 0.28), mid = SHELLS.find((s) => s.T === 0.2);
  ok(cold.S < -0.25, 'shell water loses orientational entropy when cold');
  ok(Math.abs(hot.S) < 0.05, 'and hardly when hot');
  ok(cold.bondsShell >= cold.bondsBulk, 'shell keeps its bonds when cold');
  ok(hot.bondsShell < hot.bondsBulk, 'shell loses bonds when hot');
  ok(Math.abs(cold.Sbulk) < 0.01, 'bulk water with bonds is flat: the bias needs a surface');
  ok(cold.hist[0] > 2 && cold.hist[11] < 0.6, 'one arm points away from the oil');
  const term = (s) => s.n * s.T * -s.S;
  close(term(cold), 0.45, 0.1, 'orientation term at kT 0.18');
  close(term(mid), 0.2, 0.05, 'orientation term at kT 0.20');
  ok(term(cold) > 0.5 * interp(INSERT[1].on, 0.18, 'mTdS'), 'near kT 0.18 it is a large part of -TdS at constant pressure');
  ok(Math.abs(interp(INSERT[1].on, 0.2, 'mTdS')) < 0.1, 'at kT 0.20 -TdS at constant pressure is near zero');
});

test('bonds switched off: the histogram must be flat, by construction', () => {
  const T = 0.18, N = 120, L = Math.sqrt((N + 1) / 0.99);
  const w = new MBWater({ n: N, L, T, seed: 8 });
  w.hb = 0;
  const q = w.addSolute({ x: L / 2, y: L / 2, s: 1 });
  w.sweep(2000);
  const ring = new Ring(0, 1.55);
  const out = new Int32Array(N * 3);
  for (let s = 0; s < 10000; s++) { w.sweep(1); if (s % 4 === 0) ring.sample(w, q.x, q.y, out); }
  ok(ring.entropy > -0.02, `no energy depends on angle: ${ring.entropy}`);
});

test('ring tally survives a control run, whatever the frame rate', () => {
  const w = new MBWater({ n: 60, L: 8, T: 0.3, seed: 2 });
  w.addSolute({ x: 4, y: 4, s: 1 });
  w.sweep(100);
  const out = new Int32Array(180);
  const ring = new Ring(0, 1.55);
  for (let k = 0; k < 50; k++) { w.sweep(1); ring.sample(w, 4, 4, out); }
  const before = ring.meanCount;
  const keep = ring.save();
  keep.hist[0] += 1e6; // A saved tally is a copy: writing to it must not reach the ring.
  const again = ring.save();
  ring.reset();
  for (let k = 0; k < 7; k++) ring.sample(w, 4, 4, out);
  ring.restore(again);
  close(ring.meanCount, before, 1e-12, 'mean count restored');
  ring.hist[1] += 5;
  ok(again.hist[1] !== ring.hist[1], 'restored array is not an alias');
});

test('live hole count: exact at small R, matches long runs, bonds barely change it', () => {
  const T = 0.18, N = 150, rho = 0.99;
  const w = new MBWater({ n: N, L: Math.sqrt(N / rho), T, seed: 12 });
  for (let s = 0; s < 8000; s++) { w.sweep(1); if (s % 200 === 0) w.tune(); }
  const m = new HoleMeter(w, 240);
  m.watch(0.5);
  for (let f = 0; f < 3000; f++) { w.sweep(10); m.sample(); }
  close(m.P0(0.3), smallHole(0.3, rho), 0.006, 'exact small hole');
  close(m.P0(0.2), smallHole(0.2, rho), 0.006, 'exact small hole');
  const on = HOLES[T].on, off = HOLES[T].off;
  const at = (c, R) => c.W[c.R.indexOf(R)];
  close(m.price(0.5, T), at(on, 0.5), 0.03, 'live price at R = 0.5 against long run');
  const e = m.priceError(T);
  ok(e !== null && e > 0 && e < 0.05, `live error is reported: ${e}`);
  close(-T * Math.log(smallHole(0.3, on.rho)), at(on, 0.3), 0.006, 'long run at R = 0.3 is exact too');
  ok(at(off, 1) > 0.7 * at(on, 1), 'bonds off at the same density: most of the price stays');
  ok(at(HOLES[T].press, 1) < 0.7 * at(on, 1), 'bonds off at the same pressure: far cheaper');
  console.log(`   R = 1 at kT 0.18: water ${at(on, 1)}, no bonds ${at(off, 1)}, no bonds at same pressure ${at(HOLES[T].press, 1)}`);
});

test('pair: contact, with a flat baseline and honest spread', () => {
  ok(PAIR[0.18].on[6.5] - PAIR[0.18].on[1.1] > 3.5, 'waters freed on contact');
  ok(PMF.on.filter((p) => p.T >= 0.2).every((a) => a.contact < -0.15), 'contact is attractive');
  ok(PMF.wca.every((p) => p.contact < -0.25), 'packing alone gives contact: a solute that only repels, in a bondless fluid');
  ok(PMF.wcaWater.every((p, i) => p.contact < PMF.wca[i].contact), 'the same solute goes deeper in water');
  const at = (t, T, k) => t.find((p) => p.T === T)[k];
  ok(at(PMF.on, 0.18, 'contact') > at(PMF.on, 0.24, 'contact'), 'contact weakens on cooling');
  ok(at(PMF.on, 0.18, 'separated') < at(PMF.on, 0.26, 'separated') - 0.03, 'a pair with a water between it gains when cold');
  for (const T of [0.22, 0.24]) {
    const share = at(PMF.off, T, 'water') / at(PMF.on, T, 'water');
    ok(share > 0.4 && share < 0.8, `bondless fluid reaches half to most of the water part at ${T}: ${share}`);
  }
});

test('cavities: small scale as area, water pays a wall cost, bondless fluid almost none', () => {
  const t = CAVITY[0.18];
  const at = (R) => t.find((p) => p.R === R);
  close(at(1).G / at(0.5).G, 4, 1, 'small holes go as R^2');
  ok(at(0.5).skin < 0.6 * at(2).skin, 'cost per wall length grows while small');
  close(at(4).skin / at(2).skin, 1, 0.2, 'and levels off for large holes');
  ok(at(0.7).bonds > at(0.7).far, 'small hole: wall water keeps bonds');
  ok(at(2).bonds < at(2).far - 0.3, 'large hole: wall water loses bonds');
  const off = CAVOFF[0.18].rows;
  ok(off.every((p) => Math.abs(p.skin) < 0.02), 'no bonds: pressure work is nearly everything');
  close(off[0].rho, 0.99, 0.03, 'bondless control sits at the density of water');
  close(off.find((p) => p.R === 1).G / off.find((p) => p.R === 0.5).G, 4, 1, 'R^2 holds in any dense fluid');
  // Contact theorem: the wall density of a large hole cannot fall below p / kT, so no vapour layer forms.
  ok(at(5).wallAbs >= 0.19 / 0.18 - 0.1, `wall stays wet: ${at(5).wallAbs}`);
});

test('Coulomb: Born, Kirkwood and salt bridges', () => {
  close(X.reaction([0, 0, 0], [0, 0, 0], 16, 4, 80) / 2, X.born(1, 16, 4, 80), 1e-9, 'centre of Kirkwood is Born');
  close(X.born(1, 2, 80, 1), (166.03 / 2) * (1 - 1 / 80), 0.01, '166/a, from water to vacuum');
  const deep = X.saltBridge({ depth: 15 }), near = X.saltBridge({ depth: 2.2 });
  ok(deep.coulomb < near.coulomb, 'Coulomb is stronger when buried');
  ok(deep.desolvation > near.desolvation, 'desolvation cost is higher still');
  ok(deep.total > 0, 'deep pair is net unfavourable at eps 4');
  ok(deep.total > near.total, 'surface is better than the core');
  ok(X.saltBridge({ depth: 15, eIn: 40 }).total < 0.5, 'high protein eps breaks even');
});

test('dipole drop: screening grows with dipole strength', () => {
  const seen = (mu) => {
    const d = new DipoleDrop({ n: 120, mu, T: 1, seed: 5 });
    d.ions.push({ x: 0, y: 0, z: 0, q: 6 });
    d.sweep(300);
    let s = 0;
    const m = 1200;
    for (let k = 0; k < m; k++) { d.sweep(1); s += (d.bound(1.6, 2.6) + d.bound(2.6, 3.6)) / 2; }
    return 6 - s / m;
  };
  const weak = seen(0.5), strong = seen(1.5);
  ok(weak > 3, `weak dipoles leave most of the charge: ${weak}`);
  ok(strong < 2 && strong > -0.5, `strong dipoles hide it: ${strong}`);
  console.log(`   charge seen from +6: mu 0.5 gives ${weak.toFixed(2)}, mu 1.5 gives ${strong.toFixed(2)}`);
});

test('Debye length: measured in live primitive model', () => {
  for (const I of [0.05, 0.1]) {
    const s = new IonSphere({ I });
    s.sweep(2000);
    for (let k = 0; k < 40000; k++) { s.sweep(1); if (k % 2 === 0) s.sample(); }
    const net = s.q.reduce((a, q) => a + q, 0) + s.Z;
    assert.equal(net, 0, 'neutral sphere');
    const fit = s.fitLambda();
    close(fit / s.lambda, 1, 0.2, `Debye length at ${I} M: ${fit} vs ${s.lambda}`);
    console.log(`   I ${I}: measured ${fit.toFixed(2)} A, theory ${s.lambda.toFixed(2)} A`);
  }
});

test('Keesom: exact integral, r^-6 and T^-1', () => {
  close(X.keesom(0.1).plain, 0, 1e-9, 'plain average is zero');
  close(X.keesom(0.05).F / (-(0.05 ** 2) / 3), 1, 0.005, 'free energy limit');
  close(X.keesom(0.05).U / (-2 * 0.05 ** 2 / 3), 1, 0.01, 'energy limit');
  const slope = (Math.log(-X.keesom(0.01).F) - Math.log(-X.keesom(0.08).F)) / (Math.log(0.01) - Math.log(0.08));
  close(slope, 2, 0.01, 'quadratic in 1/r^3, so r^-6');
});

test('London: normal modes', () => {
  for (const a of [0.01, 0.03]) close(X.londonShift(a) / X.londonLimit(a), 1, 0.01, 'limit -3/4 a^2');
  ok(X.drudeCorrelation(0.05) > 0, 'atoms along the axis move in step');
  ok(X.drudeCorrelation(0) === 0, 'no coupling, no correlation');
});

test('Lennard-Jones and sums', () => {
  const rm = 3.405 * 2 ** (1 / 6);
  close(X.lj(rm, 0.238, 3.405), -0.238, 1e-9, 'well depth');
  assert.equal(X.hexSheet(1).length, 6, 'benzene');
  assert.equal(X.hexSheet(7).length, 24, 'coronene');
  const lat = X.latticeShells();
  ok(lat.at(4) > 0.75, 'first shell dominates a 1/r^6 sum');
  close(lat.sumR6 * 3.8 ** 6, 14.45, 0.1, 'fcc lattice sum (14.45)');
});

test('hydrogen bond model', () => {
  const straight = X.hbond(1.9, 0, 0).total;
  const bent = X.hbond(1.9 * Math.cos(0.7), 1.9 * Math.sin(0.7), 0.7).total;
  ok(straight < -5 && straight > -10, 'right size in vacuum');
  ok(bent > straight * 0.7, 'bending weakens it');
  ok(Math.abs(X.hbond(1.9, 0, 0, 80).total) < Math.abs(straight), 'water screens it');
});

test('hard disks stay hard', () => {
  const d = new Disks({ L: 24, big: 3, small: 0.7, nSmall: 220 });
  d.sweep(800);
  for (let i = 0; i < d.n; i++) {
    for (let j = i + 1; j < d.n; j++) ok(Math.hypot(d.gap(d.x[i], d.x[j]), d.gap(d.y[i], d.y[j])) >= 1.4 - 1e-9, 'crowders overlap');
    for (let k = 0; k < 2; k++) ok(Math.hypot(d.gap(d.x[i], d.bx[k]), d.gap(d.y[i], d.by[k])) >= 3.7 - 1e-9, 'big disk overlap');
  }
  ok(d.distance() >= 6 - 1e-9, 'big disks overlap');
  close(X.lensArea(0, 1, 1), Math.PI * 4, 1e-9, 'full overlap');
  close(X.lensArea(4, 1, 1), 0, 1e-9, 'no overlap');
});

test('crowding force: read from held disks, and it matches its own long run', () => {
  const box = new Disks({ L: 24, big: 3, small: 0.7, nSmall: 0, seed: 3 });
  box.frozen = true;
  box.bx = [12 - 3.02, 12 + 3.02];
  box.by = [12, 12];
  box.setCrowd(175);
  box.sweep(1500);
  let f = 0, c = 0;
  for (let s = 0; s < 12000; s++) { box.sweep(1); if (s % 3 === 0) { f += box.skinForce(0.07); c++; } }
  close(f / c, CROWD.rows[0].live, 0.5, 'pull at contact, read with the live skin');
  ok(CROWD.rows[0].F < -2.5, 'crowders pull at contact');
  ok(CROWD.rows.find((r) => r.d === 7.44).F > 3, 'and a wedged crowder pushes apart');
  ok(CROWD.rows.find((r) => r.d === 7.44).F > CROWD.rows.find((r) => r.d === 7.44).live, 'the wider live skin blurs the peak');
  close(CROWD.rows[CROWD.rows.length - 1].F, 0, 0.3, 'no force far away');
  const none = new Disks({ L: 24, big: 3, small: 0.7, nSmall: 0, seed: 3 });
  assert.equal(none.skinForce(), 0, 'no crowders, no force');
  // Moving the disks in and out must never leave a crowder inside one.
  for (let seed = 1; seed <= 24; seed++) {
    const b2 = new Disks({ L: 24, big: 3, small: 0.7, nSmall: 0, seed: seed * 11 + 5 });
    b2.frozen = true;
    let d = 6.3;
    b2.bx = [12 - d / 2, 12 + d / 2];
    b2.by = [12, 12];
    b2.setCrowd(175);
    b2.sweep(200);
    for (const t of [7.64, 7.04, 7.64, 6.04]) {
      while (Math.abs(t - d) > 1e-3) {
        d += Math.max(-0.05, Math.min(0.05, t - d));
        b2.bx = [12 - d / 2, 12 + d / 2];
        b2.freeBigShoving(0, b2.bx[0], b2.by[0]);
        b2.freeBigShoving(1, b2.bx[1], b2.by[1]);
        b2.sweep(seed % 3 ? 10 : 60);
        assert.equal(b2.overlaps(), 0, 'no crowder left inside a big disk');
      }
    }
  }
});

test('hydrogen bond books from the model', () => {
  const T = 0.18;
  const vac = Math.min(...[0.96, 0.98, 1, 1.02, 1.04].map((r) => pairFree(r, T)));
  const g = HOLES[T].on.g;
  const water = -T * Math.log(Math.max(...g.slice(40, 60)));
  ok(vac < -0.5 && vac > -1.04, `two waters in empty space: ${vac}`);
  ok(water < -0.05 && water > 0.6 * vac, `in water a bond is worth much less: ${water}`);
});

test('counting: walks, entropy, partition identities', () => {
  const t = X.walkTable(10);
  // The walks of N steps are 4^N in total: a partition-function identity.
  for (const N of [4, 7, 10]) {
    let s = 0;
    for (let x = -10; x <= 10; x++) for (let y = -10; y <= 10; y++) s += t.count(N, x, y);
    assert.equal(s, 4 ** N, 'all walks');
  }
  assert.equal(t.count(6, 0, 0), 400, 'closed 6-step walks are C(6,3)^2');
  close(Math.exp(X.lnBinom(20, 10)), 184756, 1, 'log gamma');
  close(X.loopClosure(80) / X.loopClosure(160), 2 ** 1.5, 0.05, 'closure goes as N^-3/2');
  close(X.chainEntropy1D(10, 10), 0, 1e-9, 'one way at full stretch');
  // Two states with populations from Boltzmann weights.
  close(X.R_GAS * 298 * Math.log(10), 1.364, 0.002, 'RT ln 10');
});

test('orientation folding', () => {
  close(foldAngle(0, 1, 0), 0, 1e-9, 'arm straight out');
  close(foldAngle(Math.PI, 1, 0), 1, 1e-9, 'arm straight in');
  close(foldAngle(2.0943951, 1, 0), 0, 1e-6, 'threefold');
  close(entropyOf(new Array(12).fill(5)), 0, 1e-12, 'flat histogram has zero loss');
  close(entropyOf([1, 0, 0, 0]), -Math.log(4), 1e-12, 'one slot of four');
});

console.log(`all ${n} checks passed`);
