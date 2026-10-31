// Checks the numbers the game shows. Run: node tools/test_chem.mjs
import assert from 'node:assert/strict';
import * as C from '../src/chem.js';
import { World, Swarm } from '../src/engine.js';
import { RATES } from '../src/views.js';

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

close(C.populations([0, 1.3], 298)[0], 0.9, 0.003, 'proline ratio');
close(C.RT(298) * Math.LN10, 1.36, 0.01, 'tenfold gap');
close(60 / 0.175, 343, 0.5, 'Tm');
close(C.stability(330, 60, 330, 1.8), 0, 1e-9, 'stability at Tm');
close(C.debye(0.15), 7.85, 0.01, 'Debye length');
close(2.19 + C.coulomb(3, -3, 7, 80, 0.15), 0, 0.01, 'salt view is balanced at 150 mM');
close(C.protonated(6, 6), 0.5, 1e-9, 'half protonated at pKa');
close(C.occupancy(9, 1), 0.9, 1e-9, '90% at 9 Kd');
close(C.hbSaturation(27.7), 0.5, 0.01, 'P50 of haemoglobin');
close(RATES.turn(320) / RATES.turn(310), 2.03, 0.02, 'doubling per 10 degrees');

// Walkers must reproduce detailed balance, including while some are in transit.
const w = new World();
w.T = 298;
w.wells = [{ x: 0, y: 0, G: 0 }, { x: 1, y: 0, G: 1.3 }];
w.links = [{ a: 0, b: 1, nu: 2.5 }];
const s = new Swarm(1400, 2);
s.seed([0.5, 0.5], w);
let sum = 0;
for (let i = 0; i < 4000; i++) { s.step(1 / 30, w); if (i > 1000) sum += s.counts[0] / (s.counts[0] + s.counts[1]); }
close(sum / 2999, 0.9, 0.01, 'walkers at equilibrium');
console.log('all checks passed');
