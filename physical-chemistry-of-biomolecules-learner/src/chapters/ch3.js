// Dipoles at temperature, dispersion from correlated fluctuations, and the sum over many weak contacts.
import { keesom, drudeCorrelation, lj, hexSheet, stackEnergy, latticeShells, waterFace } from '../sim/exact.js';
import { LIVE, EXACT, TOY } from '../bench.js';
import { axes, curve, dot, tag, text, INK, RED, BLUE } from '../charts.js';
import { clamp } from './common.js';

const kcalR = 0.0019872;
const SCALE = 14.395 * 1.85 * 1.85; // kcal Angstrom^3 / mol for two 1.85 debye dipoles (water).

function arrow(b, r, x, y, a, len, col, w = 4) {
  const ax = x + Math.cos(a) * len, ay = y + Math.sin(a) * len;
  const bx = x - Math.cos(a) * len, by = y - Math.sin(a) * len;
  r.line(bx, by, ax, ay, w, col, 1);
  r.line(ax, ay, ax - Math.cos(a - 0.5) * len * 0.5, ay - Math.sin(a - 0.5) * len * 0.5, w * 0.8, col, 1);
  r.line(ax, ay, ax - Math.cos(a + 0.5) * len * 0.5, ay - Math.sin(a + 0.5) * len * 0.5, w * 0.8, col, 1);
}

export const keesomExp = {
  id: 'keesom',
  ch: 3,
  title: 'Spinning dipoles',
  lede: 'Two freely spinning dipoles spend as much time repelling as attracting. If every angle counted the same, they would feel nothing at all. Yet they attract.',
  goals: ['Compare the plain average with the Boltzmann average.', 'Measure the slope of the attraction on a log plot.', 'Find the distance where the slope reaches −5.5, where thermal averaging starts to fail.'],
  note: {
    formula: 'F = − μ⁴ / (3 kT r⁶)',
    text: 'Averaged over all angles the energy is exactly zero. But the weight e^(−U/kT) favours attracting angles a little, and this tiny bias is what you measure. The bias is itself proportional to U, so the result goes as U², which is 1/r⁶, and it is weaker when hot. Close in, the dipoles begin to lock, and in the limit the law turns into 1/r³.',
    honest: 'Exact: the orientation integral is done on a fine grid, not sampled. The two arrows on the print are Metropolis samples of the same weight. Dipoles are point dipoles of water size, 1.85 D, in vacuum, with no steric size.',
  },
  async run(b) {
    b.world(10);
    b.pattern(false);
    b.heat(0.32);
    let r = 8;
    let T = 298;
    let weigh = false;
    // Two three-dimensional unit vectors, walked by Metropolis.
    const v = [[0, 0, 1], [0, 1, 0]];
    let sum = 0;
    let cnt = 0;
    const X = () => SCALE / (r ** 3 * kcalR * T);
    const geom = () => v[0][0] * v[1][0] + v[0][1] * v[1][1] - 2 * v[0][2] * v[1][2]; // Line along z.
    b.each(() => {
      for (let i = 0; i < 400; i++) {
        const k = i % 2;
        const a = v[k].slice();
        // A fresh direction, uniform on the sphere: a symmetric proposal, so Metropolis needs no correction.
        const cz = Math.random() * 2 - 1;
        const fi = Math.random() * 2 * Math.PI;
        const sz = Math.sqrt(1 - cz * cz);
        const old = geom();
        v[k] = [sz * Math.cos(fi), sz * Math.sin(fi), cz];
        const d = X() * (geom() - old);
        if (weigh && d > 0 && Math.random() > Math.exp(-d)) v[k] = a;
        sum += geom() * X();
        cnt++;
      }
    });
    const smooth = [0, 0];
    b.draw((rr) => {
      const c = b.L / 2;
      const gap = clamp(r / 22, 0.13, 0.31) * b.L;
      const [ax, ay] = b.px(c - gap, c);
      const [bx, by] = b.px(c + gap, c);
      // Along the page: z is the line between them.
      const ang = (k) => Math.atan2(v[k][0], v[k][2]);
      for (let k = 0; k < 2; k++) {
        let d = ang(k) - smooth[k];
        d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
        smooth[k] += d * 0.35;
      }
      rr.halo(ax, ay, b.scale * 1.7, [0.55, 0.7, 0.85], 0.5);
      rr.halo(bx, by, b.scale * 1.7, [0.55, 0.7, 0.85], 0.5);
      rr.ring(ax, ay, b.scale * 1.55, [0.1, 0.13, 0.22], 0.35, 0.012);
      rr.ring(bx, by, b.scale * 1.55, [0.1, 0.13, 0.22], 0.35, 0.012);
      rr.line(ax, ay, bx, by, 1.4, [0.1, 0.13, 0.22], 0.3);
      rr.dipole(ax, ay, smooth[0], b.scale * 1.15);
      rr.dipole(bx, by, smooth[1], b.scale * 1.15);
    });
    const measured = [];
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 3, xmax: 14, ymin: -6, ymax: 3, xlabel: 'distance r, Å (log scale)', ylabel: 'log₁₀ |F|, kcal/mol', logx: true, zero: false });
      const pts = [];
      for (let q = 3; q <= 14; q *= 1.04) pts.push([q, Math.log10(Math.abs(keesom(SCALE / (q ** 3 * kcalR * T), 12).F) * kcalR * T)]);
      curve(g, a, pts, { color: RED });
      measured.forEach(([q, f]) => dot(g, a, q, f, { color: BLUE }));
      dot(g, a, r, Math.log10(Math.abs(keesom(X(), 16).F) * kcalR * T), { color: INK, r: 3.5 });
    });
    b.read(() => `${LIVE} r <b>${r.toFixed(1)} Å</b>, ${T.toFixed(0)} K, U/kT at line-up ${(2 * X()).toFixed(2)}, mean energy <b>${(sum / Math.max(1, cnt)).toFixed(3)} kT</b>. Line ${EXACT}`);
    b.say('Averaged over every angle with equal weight, what is the energy of two dipoles?');
    const guess = await b.ask(['attractive', 'exactly zero', 'repulsive']);
    b.flags.sampled = 0;
    b.say('Every angle equally likely. The mean energy settles at zero.');
    sum = 0; cnt = 0;
    await b.wait(3);
    await b.go('Switch on Boltzmann');
    r = 5;
    weigh = true;
    sum = 0; cnt = 0;
    b.say('Now low energies are favoured. The arrows still spin, but the mean falls below zero.');
    await b.wait(3);
    await b.go('Next');
    b.say('Drag r. Press Measure at two far distances to get the slope of the line.');
    b.slider({ label: 'r', min: 3, max: 14, value: 8, log: true, fmt: (q) => `${q.toFixed(1)} Å`, on: (q) => { r = q; sum = 0; cnt = 0; } });
    r = 8;
    b.slider({ label: 'T', min: 150, max: 600, value: 298, log: true, fmt: (q) => `${q.toFixed(0)} K`, on: (q) => { T = q; b.heat((q - 150) / 450); sum = 0; cnt = 0; } });
    let slope = null;
    let slopeOK = false;
    b.button('Measure', () => {
      const f = Math.log10(Math.abs(keesom(X(), 16).F) * kcalR * T);
      measured.push([r, f]);
      if (measured.length > 6) measured.shift();
      if (measured.length >= 2) {
        const [p, q] = measured.slice(-2);
        if (Math.abs(Math.log10(p[0] / q[0])) > 0.08) {
          slope = (p[1] - q[1]) / (Math.log10(p[0]) - Math.log10(q[0]));
          b.say(`Slope ${slope.toFixed(2)}.`);
          if (slope < -5.6 && Math.min(p[0], q[0]) > 5) slopeOK = true;
        }
      }
      b.sound.pluck(7, 0.25);
    });
    const localSlope = (q) => { const h = 1.03; return (Math.log10(Math.abs(keesom(SCALE / ((q * h) ** 3 * kcalR * T), 20).F)) - Math.log10(Math.abs(keesom(SCALE / ((q / h) ** 3 * kcalR * T), 20).F))) / (2 * Math.log10(h)); };
    await b.until(() => slopeOK);
    b.say('Six, as theory says. Slide r inward at 298 K: the slope flattens as the dipoles begin to lock. Stop where it hits −5.5.');
    b.read(() => `${EXACT} r <b>${r.toFixed(2)} Å</b>, ${T.toFixed(0)} K, local slope <b>?</b>`);
    let solved = false;
    b.button('Here', () => {
      if (Math.abs(T - 298) > 40) { b.say('Bring T back to about 298 K first.'); return; }
      const s = localSlope(r);
      b.say(`Slope here is ${s.toFixed(2)}.`);
      if (Math.abs(s + 5.5) < 0.1) solved = true;
    });
    b.button('Finish', () => { b.flags.quit = true; });
    await b.until(() => solved || b.flags.quit);
    return { seals: 1 + (guess === 1 ? 1 : 0) + (solved ? 1 : 0), score: solved ? `The slope reached −5.5 at r = ${r.toFixed(1)} Å.` : 'You measured the slope of −6.' };
  },
};

const ATOMS = [
  { name: 'Ne', alpha: 0.396, I: 21.6, boil: 27 },
  { name: 'Ar', alpha: 1.64, I: 15.8, boil: 87 },
  { name: 'Kr', alpha: 2.48, I: 14.0, boil: 120 },
  { name: 'Xe', alpha: 4.04, I: 12.1, boil: 165 },
];

export const london = {
  id: 'london',
  ch: 3,
  title: 'Two soft clouds',
  lede: 'Argon has no charge and no dipole, yet it turns liquid when cold. Something must attract two neutral atoms. Put two atoms on the bench and look at their electrons.',
  goals: ['See the two clouds fall into step as they approach.', 'Say which noble gas sticks hardest, before you measure.', 'Find the bottom of the argon well to within 0.08 Å by feel.'],
  note: {
    formula: 'E = − (3/4) I α² / r⁶',
    text: 'Each electron cloud jiggles even at absolute zero. When two clouds are near, each jiggle pulls the other into step, and in-step motion lowers the energy of the coupled modes. The softer the cloud (large α), the stronger the effect, which is why boiling points climb from neon to xenon. Close in, the clouds overlap and repulsion wins.',
    honest: 'Exact for two coupled Drude oscillators: six normal modes, zero-point energy. The clouds on the print are random draws from that ground state with the coupling drawn ten times stronger, because a correlation of 2% cannot be seen. Real atoms are not oscillators; the London formula gives about 80% of argon\'s best known attraction. The well uses standard argon Lennard-Jones numbers (ε 0.238 kcal/mol, σ 3.405 Å). These are effective liquid parameters; the true pair is about 0.28 kcal/mol at 3.76 Å. The LJ r⁻⁶ term is a fit, not the dispersion coefficient.',
  },
  async run(b) {
    b.world(12);
    b.pattern(false);
    b.heat(0.2);
    let atom = ATOMS[1];
    let r = 7;
    let on = true;
    let drag = false;
    const coupling = () => Math.min(0.2, (atom.alpha / r ** 3));
    // Mode amplitudes follow an Ornstein-Uhlenbeck walk that keeps the exact ground-state variances.
    let plus = 0, minus = 0;
    const cloud = [[0, 0], [0, 0]];
    b.each((dt) => {
      // The real correlation is a few percent, too small to see, so the drawing is ten times stronger.
      const a = Math.min(0.45, (on ? coupling() : 0) * 10);
      const v1 = 1 / Math.sqrt(1 - 2 * a), v2 = 1 / Math.sqrt(1 + 2 * a);
      const th = 1 - Math.exp(-dt * 7);
      plus += (0 - plus) * th + Math.sqrt(v1 * th * (2 - th)) * gauss();
      minus += (0 - minus) * th + Math.sqrt(v2 * th * (2 - th)) * gauss();
      const x1 = (plus + minus) / Math.SQRT2, x2 = (plus - minus) / Math.SQRT2;
      cloud[0] = [x1 * 0.33, gauss() * 0.01];
      cloud[1] = [x2 * 0.33, gauss() * 0.01];
    });
    const atPos = () => { const c = b.L / 2, g = clamp(r * 0.62, 1.5, 5.4); return [c - g, c + g]; };
    b.draw((rr) => {
      const y = b.L / 2;
      const [a, c] = atPos();
      const s = b.scale;
      const size = 1.1 + atom.alpha * 0.28;
      const pos = [];
      for (const [k, x] of [[0, a], [1, c]]) {
        const [px, py] = b.px(x + cloud[k][0] * 2.2, y);
        const [nx] = b.px(x, y);
        pos.push([nx, py, px]);
        rr.halo(px, py, s * size * 1.25, [0.5, 0.66, 0.84], 0.32);
        rr.halo(px, py, s * size * 0.95, [0.26, 0.44, 0.68], 0.45);
        rr.halo(px, py, s * size * 0.6, [0.13, 0.25, 0.46], 0.55);
      }
      // The instantaneous dipole of each atom, from nucleus to cloud.
      for (const [nx, py, px] of pos) {
        rr.line(nx, py, px, py, 5, [0.8, 0.21, 0.11], 0.95);
        rr.bead(nx, py, s * 0.22, [0.85, 0.3, 0.14]);
      }
    });
    const CC = (at) => 0.75 * at.I * at.alpha * at.alpha * 23.06; // kcal Angstrom^6 / mol
    const ljr = (q) => lj(q, 0.238, 3.405);
    b.read(() => `${EXACT} r <b>${r.toFixed(2)} Å</b>, in-step correlation <b>${(drudeCorrelation(coupling()) * 100).toFixed(1)}%</b> (drawn ten times stronger)`);
    b.chart(null);
    b.say('Blue clouds are electrons, red dots are nuclei. Both clouds jiggle at random even at absolute zero.');
    await b.wait(2);
    b.slider({ label: 'r', min: 3.2, max: 9, value: 7, fmt: (q) => `${q.toFixed(2)} Å`, on: (q) => { r = q; } });
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 3, xmax: 9, ymin: -0.5, ymax: 0.5, xlabel: 'r, Å', ylabel: 'E, kcal/mol' });
      const pts = [], pts2 = [];
      for (let q = 3; q <= 9; q += 0.05) { pts.push([q, -CC(atom) / q ** 6]); if (drag) pts2.push([q, ljr(q)]); }
      curve(g, a, pts, { color: BLUE, dash: drag ? [4, 3] : null });
      if (drag) curve(g, a, pts2, { color: RED });
      if (!drag) dot(g, a, r, -CC(atom) / r ** 6, { color: INK });
    });
    b.say('Bring the atoms closer and watch the red lines: they start to swing the same way.');
    await b.until(() => r < 4.6, 0.5);
    b.say('In-step jiggling lowers the energy of the two as a pair. That is dispersion.');
    await b.wait(1.5);
    const atomR = ATOMS.map((a) => a.name);
    b.say('Which noble gas holds together most strongly?');
    const guess = await b.ask(atomR);
    const measure = ATOMS.map((at) => (0.75 * at.I * at.alpha * at.alpha));
    b.say(`Xenon: at the same r it pulls ${(measure[3] / measure[0]).toFixed(0)} times harder than neon, and boils at 165 K against 27 K.`);
    await b.go('Next');
    drag = true;
    atom = ATOMS[1];
    b.clear();
    b.slider({ label: 'r', min: 3.2, max: 6, value: 5.2, fmt: () => '', on: (q) => { r = q; b.buzz(4); } });
    r = 5.2;
    const force = () => { const h = 0.01; return -(ljr(r + h) - ljr(r - h)) / (2 * h); };
    let tug = 0;
    b.over((g) => {
      tug += (force() - tug) * 0.3;
      const [cx, cy] = b.px(b.L / 2, b.L * 0.22);
      const w = clamp(tug * 90, -130, 130);
      g.fillStyle = w > 0 ? '#c8402a' : '#1b3f6b';
      g.fillRect(Math.min(cx, cx + w), cy, Math.abs(w), 12);
      tag(g, tug > 0.015 ? 'pushing apart' : tug < -0.015 ? 'pulling together' : 'no force', cx, cy - 8);
    });
    b.read(() => `${EXACT} Lennard-Jones fit. Slide r until the force bar is flat, then press Here.`);
    b.say('Dispersion alone would collapse. Overlap pushes back. Find the distance where the force is zero.');
    let solved = false;
    b.button('Here', () => {
      const rm = 3.405 * 2 ** (1 / 6);
      const err = Math.abs(r - rm);
      b.say(`You stopped at ${r.toFixed(2)} Å. This fit has its minimum at ${rm.toFixed(2)} Å, depth 0.24 kcal/mol. The true argon pair: 0.28 at 3.76 Å.`);
      if (err < 0.08) solved = true;
      b.flags.quit = true;
    });
    await b.until(() => b.flags.quit);
    await b.wait(2);
    return { seals: 1 + (guess === 3 ? 1 : 0) + (solved ? 1 : 0), score: 'One contact is 0.24 kcal/mol: weaker than heat. The next print adds them up.' };
  },
};

function gauss() { return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(6.283185 * Math.random()); }

export const stacking = {
  id: 'stacking',
  ch: 3,
  title: 'Weak but numerous',
  lede: 'One carbon–carbon contact is far weaker than heat. Stacked rings hold DNA together anyway. Do the sum yourself.',
  goals: ['Read the energy of one contact, then of a stacked pair.', 'Say how much of the sum comes from the nearest neighbours.', 'Slide the sheets to the best position and gap to reach −15.0 kcal/mol.'],
  note: {
    formula: 'E = Σ<sub>i,j</sub> 4ε [(σ/r<sub>ij</sub>)¹² − (σ/r<sub>ij</sub>)⁶]',
    text: 'Each pair adds very little, but flat molecules bring many atoms into contact at once, so in vacuum the sum beats kT by a long way. In water it is a swap: every face was already touching water, so what counts is a difference of large numbers. Because each term falls as 1/r⁶, most of it comes from the nearest neighbours, so a small gap costs a lot. That is one reason close packing matters in protein cores and in the base stack.',
    honest: 'An exact pair sum, but with toy parameters: all atoms are carbon, ε 0.07, σ 3.55 Å, without partial charges or hydrogens. The water layer is a flat lattice with carbon–oxygen numbers ε 0.103, σ 3.35 Å, also a toy. A Lennard-Jones sum is not dispersion. The sums show the size of the terms, nothing more: moving the water lattice or changing its spacing swings their difference by several kcal/mol either way, and they leave out what freed water gains by rejoining water, so this toy cannot give a net sign.',
  },
  async run(b) {
    b.world(24);
    b.pattern(false);
    b.heat(0.28);
    let rings = 1;
    let sheet = hexSheet(rings);
    let dx = 2.4, dy = 1.6, gap = 3.9;
    const E = () => stackEnergy(sheet, dx, dy, gap);
    b.draw((r) => {
      const c = b.L / 2;
      const s = b.scale;
      for (const [x, y] of sheet) { const [px, py] = b.px(c + x, c + y); r.bead(px, py, s * 1.35, [0.42, 0.55, 0.72], 0.65); }
      for (const [x, y] of sheet) { const [px, py] = b.px(c + x + dx, c + y + dy); r.bead(px, py, s * 1.0, [0.84, 0.48, 0.2], 0.85); }
    });
    b.say('This pair of rings is seen from above. The carbon atoms sit one over the other, a gap apart.');
    b.read(() => `${EXACT}${TOY} one contact <b>${E().closest.toFixed(3)}</b> kcal/mol, kT at 25 °C is 0.59`);
    await b.wait(1.5);
    await b.go('Add them all up');
    b.read(() => `${EXACT}${TOY} all ${sheet.length * sheet.length} pairs: <b>${E().e.toFixed(2)}</b> kcal/mol`);
    b.say('Nearly all pairs count a little. Now make the sheets bigger.');
    const size = [1, 4, 7];
    await b.wait(1);
    b.slider({ label: 'rings', min: 0, max: 2, step: 1, value: 0, fmt: (v) => `${size[Math.round(v)]}`, on: (v) => { rings = size[Math.round(v)]; sheet = hexSheet(rings); } });
    await b.until(() => rings === 7);
    b.say('In a block of atoms, how much of the sum comes from the first ring of neighbours?');
    const lat = latticeShells();
    const near = lat.at(4);
    const q = await b.ask(['about 10%', 'about 40%', 'about 80%']);
    b.say(`${(near * 100).toFixed(0)}%. A 1/r⁶ sum is mostly over at the first shell, so a gap of one atom costs dearly.`);
    await b.wait(2);
    await b.go('Next');
    b.clear();
    rings = 7; sheet = hexSheet(7);
    let solved = false;
    b.slider({ label: 'gap', min: 3, max: 4.6, value: 3.9, fmt: (v) => `${v.toFixed(2)} Å`, on: (v) => { gap = v; } });
    b.onDrag({
      hit: () => 1,
      move: (_, x, y) => { dx = clamp(x - b.L / 2, -6, 6); dy = clamp(y - b.L / 2, -6, 6); },
    });
    dx = 3; dy = 2;
    b.say('Drag anywhere to slide the top sheet, and set the gap. Reach −15.0.');
    b.read(() => `${EXACT}${TOY} offset (${dx.toFixed(1)}, ${dy.toFixed(1)}) Å, energy <b>${E().e.toFixed(2)}</b> kcal/mol`);
    b.button('Finish', () => { b.flags.quit = true; });
    b.each(() => { if (E().e <= -15.0) solved = true; });
    await b.until(() => solved || b.flags.quit);
    // The same sum in water: each face gives up the water layer it was touching.
    const gross = E().e;
    const face = waterFace(sheet);
    b.clear();
    b.onDrag(null);
    b.chart((g, box) => {
      const rows = [['LJ contact, sheet to sheet', gross, BLUE], ['LJ contact given up to water', -2 * face, RED]];
      const h = Math.min(38, (box.h - 6) / 2);
      const lw = Math.min(170, box.w * 0.48);
      rows.forEach(([name, v, col], i) => {
        const y = box.y + 3 + i * (h + 3);
        text(g, name, box.x, y + h * 0.7);
        const mid = box.x + lw + (box.w - lw - 52) / 2;
        const len = (Math.max(-45, Math.min(45, v)) / 45) * ((box.w - lw - 52) / 2);
        g.fillStyle = col;
        g.fillRect(Math.min(mid, mid + len), y, Math.abs(len), h - 4);
        text(g, `${v > 0 ? '+' : ''}${v.toFixed(1)}`, box.x + box.w, y + h * 0.7, { align: 'right', color: col });
      });
    });
    b.read(() => `${TOY} kcal/mol. Both faces were touching water before they touched each other.`);
    b.say(`That was in vacuum. In water, about ${(-gross).toFixed(0)} gained, about ${(-2 * face).toFixed(0)} given up: the toy cannot fix the sign.`);
    await b.wait(3);
    await b.go('Finish');
    return { seals: 1 + (q === 2 ? 1 : 0) + (solved ? 1 : 0), score: `Best stack: ${gross.toFixed(2)} kcal/mol in vacuum, from ${sheet.length * sheet.length} pairs.` };
  },
};
