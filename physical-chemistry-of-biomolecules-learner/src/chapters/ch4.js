// The hydrogen bond: its geometry, then its bookkeeping.
import { hbond } from '../sim/exact.js';
import { pairFree } from '../sim/mbwater.js';
import { HOLES } from '../sim/mbtable.js';
import { EXACT, TOY, LIT, STORED } from '../bench.js';
import { axes, curve, tag, ledgerBar, text, INK, RED, BLUE, OCHRE } from '../charts.js';
import { clamp } from './common.js';

const deg = Math.PI / 180;

export const geometry = {
  id: 'geometry',
  ch: 4,
  title: 'The shape of a bond',
  lede: 'A hydrogen bond is not just two charges attracting. It cares about direction. Move an acceptor around a donor and feel what it wants.',
  goals: ['Find a real bond, stronger than −5 kcal/mol.', 'Predict what bending does.', 'Find the best position and turn to within 0.06 kcal/mol of the true minimum.'],
  note: {
    formula: 'E = Σ 332 q<sub>i</sub> q<sub>j</sub> / (ε r<sub>ij</sub>) + Lennard-Jones + a little overlap',
    text: 'Most of a hydrogen bond here is electrostatic: the small, exposed positive hydrogen points at the negative oxygen, and the other two charges of the pair stand behind the line. In this toy, bending costs energy mostly through repulsion as atoms crowd, with Coulomb and the hand-set overlap term about a quarter each. The bond is about 2 Å long, well inside the sum of the atoms\' van der Waals radii.',
    honest: 'A toy model with four point charges (N −0.4, H +0.4, O −0.5, C +0.5), Lennard-Jones terms, and a small overlap term chosen by hand so it adds 1 to 2 kcal/mol. Its value in vacuum is the right size for an amide pair, not a measured one. Geometry preferences of real lone pairs are simplified. The ε slider is not physical at contact: water cannot get between the two atoms.',
  },
  async run(b) {
    b.world(8);
    b.pattern(false);
    b.heat(0.28);
    const c = [2.4, 4]; // Hydrogen position.
    let ax = 6.2, ay = 2.3, phi = 2.4;
    let eps = 1;
    const E = () => hbond(ax - c[0], ay - c[1], phi, eps);
    let best = 0;
    for (let x = 1.5; x < 2.6; x += 0.02) for (let p = -0.3; p < 0.3; p += 0.02) { const e = hbond(x, 0, p).total; if (e < best) { best = e; b.flags.best = [x, p]; } }
    b.draw((r) => {
      const s = b.scale;
      const [hx, hy] = b.px(...c);
      const [nx, ny] = b.px(c[0] - 1.01, c[1]);
      const [ox, oy] = b.px(ax, ay);
      const [cx, cy] = b.px(ax + 1.23 * Math.cos(phi), ay + 1.23 * Math.sin(phi));
      r.line(nx, ny, hx, hy, s * 0.14, [0.1, 0.12, 0.2], 1);
      r.line(ox, oy, cx, cy, s * 0.16, [0.1, 0.12, 0.2], 1);
      r.ion(nx, ny, s * 0.42, false);
      r.ion(hx, hy, s * 0.24, true);
      r.ion(ox, oy, s * 0.4, false);
      r.ion(cx, cy, s * 0.4, true);
      const v = E();
      if (v.total < -3) r.line(hx, hy, ox, oy, s * 0.07, [0.8, 0.21, 0.11], clamp(-v.total / 8, 0.2, 1));
    });
    b.over((g) => {
      const [hx, hy] = b.px(...c);
      const [ox, oy] = b.px(ax, ay);
      tag(g, 'N', ...offset(b.px(c[0] - 1.01, c[1]), 0, 28));
      tag(g, 'H', hx, hy + 22);
      tag(g, 'O', ox, oy - 18);
      tag(g, 'C', ...offset(b.px(ax + 1.23 * Math.cos(phi), ay + 1.23 * Math.sin(phi)), 0, 28));
    });
    const hist = [];
    b.each(() => { hist.push(E().total); if (hist.length > 120) hist.shift(); });
    b.chart((g, box) => {
      const v = E();
      const rows = [['Coulomb', v.elec, BLUE], ['Lennard-Jones', v.vdw, OCHRE], ['overlap', v.cover, INK], ['total', v.total, RED]];
      const h = Math.min(22, (box.h - 4) / 4);
      rows.forEach(([n, q, col], i) => {
        const y = box.y + 2 + i * (h + 2);
        text(g, n, box.x, y + h * 0.72);
        ledgerBar(g, box.x + 92, y, box.w - 152, h - 3, q, 12, col);
        text(g, q.toFixed(1), box.x + box.w, y + h * 0.72, { align: 'right', color: col });
      });
    });
    b.read(() => { const v = E(); return `${TOY} H···O <b>${v.rHO.toFixed(2)} Å</b>, bend <b>${v.angle.toFixed(0)}°</b>, energy <b>${v.total.toFixed(2)}</b> kcal/mol`; });
    b.say('Drag the oxygen to the hydrogen, and turn the C=O with the slider.');
    b.slider({ label: 'turn', min: -180, max: 180, value: phi / deg, fmt: (v) => `${v.toFixed(0)}°`, on: (v) => { phi = v * deg; } });
    b.onDrag({
      hit: () => 1,
      move: (_, x, y) => { ax = clamp(x, 0.5, 7.5); ay = clamp(y, 0.5, 7.5); },
    });
    await b.until(() => E().total < -5);
    b.say('That is a hydrogen bond. Now if you bend it 40° from straight, what happens?');
    b.sound.chord();
    const guess = await b.ask(['nothing much', 'it weakens by about a third', 'it turns repulsive']);
    const strong = hbond(1.9, 0, 0).total;
    const bent = hbond(1.9 * Math.cos(40 * deg), 1.9 * Math.sin(40 * deg), 40 * deg).total;
    b.say(`Straight ${strong.toFixed(1)}, bent 40° ${bent.toFixed(1)} kcal/mol: ${Math.round((1 - bent / strong) * 100)}% of it is gone, mostly as atoms crowd.`);
    await b.wait(2);
    b.say('Find the very best. Press Here when you think nothing can beat it.');
    let tries = 0;
    let solved = false;
    let done = false;
    b.button('Here', () => {
      tries++;
      const v = E().total;
      b.say(`You have ${v.toFixed(2)}. The minimum of this model is ${best.toFixed(2)} kcal/mol.`);
      if (v < best + 0.06) { solved = true; done = true; } else if (tries >= 3) done = true;
    });
    await b.until(() => done);
    await b.wait(1.2);
    b.clear();
    b.say('A high ε screens the charges. Slide it up. It is not physical at contact: water cannot get between them.');
    b.slider({ label: 'ε', min: 1, max: 80, value: 1, log: true, fmt: (v) => v.toFixed(0), on: (v) => { eps = v; } });
    await b.until(() => eps > 30);
    b.say(`At the same place, ${E().total.toFixed(1)} kcal/mol. A slider cannot do the real accounting. The next print does.`);
    await b.wait(2.5);
    return { seals: 1 + (guess === 1 ? 1 : 0) + (solved ? 1 : 0), score: solved ? `Found the minimum in ${tries} tries.` : 'The minimum got away this time.' };
  },
};

const offset = (p, dx, dy) => [p[0] + dx, p[1] + dy];

export const books = {
  id: 'books',
  ch: 4,
  title: 'Balance the books',
  lede: 'A protein makes hundreds of hydrogen bonds when it folds. But unfolded, every one of those groups had water to bond with. So what did folding gain?',
  goals: ['Sort every bond into broken or made.', 'Say which way the books lean in water.', 'Work out a 20-residue helix in water and in a membrane.'],
  note: {
    formula: 'NH···OH₂ + C=O···H₂O ⇌ NH···O=C + H₂O···H₂O',
    text: 'In water a protein hydrogen bond only swaps partners: two bonds to water are broken, one protein bond and one water bond are made, so the count stays level. What remains is small: side-chain variants give about 1 kcal/mol per bond on average, and the water model shows the same squeeze. With no water to swap with, the bond keeps most of its worth, and helices become far more favourable.',
    honest: 'The 1.1 ± 0.8 kcal/mol comes from 151 protein variants (Pace, Scholtz and Grimsley 2014), all of them removing a side-chain –OH. Peptide-to-ester changes at the backbone give −1.1 ± 1.6, and context matters. The 4 to 5 kcal/mol for a backbone hydrogen bond in a membrane is an estimate from partitioning data, not a direct measurement, and side-chain hydrogen bonds in membrane proteins measure only about 0.6 to 1 kcal/mol, so Bowie (2011) urges caution. The model numbers come from g(r) in long runs and an exact angle average; a bondless fluid stands in for a membrane core, which is a loose analogy.',
  },
  async run(b) {
    b.world(10);
    b.pattern(true);
    b.heat(0.3);
    // Four bonds, tapped into two columns.
    const cards = [
      { name: 'NH···water', side: 'broken', y: 2.2, done: false },
      { name: 'C=O···water', side: 'broken', y: 3.8, done: false },
      { name: 'NH···O=C', side: 'made', y: 6.2, done: false },
      { name: 'water···water', side: 'made', y: 7.8, done: false },
    ];
    let wrong = 0;
    b.draw((r) => {
      const s = b.scale;
      const y0 = 5;
      const after = cards.filter((c) => c.done).length / 4;
      const gap = 3.6 - after * 1.7;
      const [nx, ny] = b.px(5 - gap, y0);
      const [ox, oy] = b.px(5 + gap, y0);
      r.ion(nx - s * 0.6, ny, s * 0.5, false);
      r.ion(nx + s * 0.15, ny, s * 0.3, true);
      r.ion(ox, oy, s * 0.5, false);
      r.ion(ox + s * 0.7, oy, s * 0.5, true);
      r.line(nx - s * 0.6, ny, nx + s * 0.15, ny, s * 0.12, [0.1, 0.12, 0.2], 1);
      r.line(ox, oy, ox + s * 0.7, oy, s * 0.14, [0.1, 0.12, 0.2], 1);
      const free = 1 - after;
      const [w1x, w1y] = [5 - gap + 1.8 * free, 5 - (1 - free) * 3.2];
      const [w2x, w2y] = [5 + gap - 1.8 * free, 5 - (1 - free) * 3.2];
      const [ax, ay] = b.px(w1x, w1y);
      const [cx, cy] = b.px(w2x, w2y);
      r.water(ax, ay, 0.2, s * 0.9, 0.08, 0.1, 0.17, 1, 1, 0, free);
      r.water(cx, cy, Math.PI / 3 + 0.2, s * 0.9, 0.08, 0.1, 0.17, 1, 0, 1, 0);
      if (after > 0.99) r.line(nx + s * 0.15, ny, ox, oy, s * 0.1, [0.8, 0.21, 0.11], 1);
    });
    b.say('Sort each bond. Tap the column it belongs in when the protein folds.');
    let correctCount = 0;
    for (const c of cards) {
      b.read(() => `<b>${c.name}</b>: broken or made on folding?`);
      const a = await b.ask(['broken', 'made']);
      const ok = (a === 0 ? 'broken' : 'made') === c.side;
      if (ok) { correctCount++; b.sound.pluck(7, 0.3); } else { wrong++; b.buzz(30); }
      c.done = true;
      b.say(ok ? 'Right.' : `That one is ${c.side}.`);
      await b.wait(0.5);
    }
    b.say('Two broken, two made. The count is level. So in water, what is one bond worth?');
    b.read(() => 'Choose a size for the net gain.');
    const net = await b.ask(['about 1 kcal/mol', 'about 5 kcal/mol', 'about 10 kcal/mol']);
    b.say('About 1. 151 side-chain variants give 1.1 ± 0.8 kcal/mol. Backbone changes give −1.1 ± 1.6, with a wide spread.');
    b.read(() => `${LIT} Water is an excellent bonding partner, so swapping it gains little.`);
    await b.go('Measure it in the model');
    // Two waters in empty space, in water, and with bonds only between them in a bondless fluid.
    const T = 0.18;
    const H = HOLES[T];
    const grid = [];
    for (let r = 0.82; r <= 1.8; r += 0.02) grid.push(r);
    const atR = (g, r) => g[Math.floor(r / 0.02)];
    const vac = grid.map((r) => [r, pairFree(r, T)]);
    const inWater = grid.map((r) => [r, -T * Math.log(Math.max(1e-6, atR(H.on.g, r)))]);
    const dry = grid.map((r) => [r, pairFree(r, T, { bondsOnly: true }) - T * Math.log(Math.max(1e-6, atR(H.off.g, r)))]);
    const depth = (c) => Math.min(...c.map((p) => p[1]));
    const D = { vac: depth(vac), water: depth(inWater), dry: depth(dry) };
    b.flags.depths = D;
    b.clear();
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 0.82, xmax: 1.8, ymin: -0.8, ymax: 0.3, xlabel: 'distance, in bond lengths', ylabel: 'free energy, ε' });
      curve(g, a, vac, { color: INK, dash: [4, 3], width: 1.5 });
      curve(g, a, dry, { color: OCHRE });
      curve(g, a, inWater, { color: BLUE });
      text(g, 'empty space', a.left + 90, box.y + 12, { color: INK });
      text(g, 'bondless fluid', a.left + 174, box.y + 12, { color: OCHRE });
      text(g, 'water', a.left + 44, box.y + 12, { color: BLUE });
    });
    b.say(`Two model waters: a bond is worth ${D.vac.toFixed(2)} ε alone, ${D.dry.toFixed(2)} ε in a bondless fluid, and only ${D.water.toFixed(2)} ε in water.`);
    b.read(() => `${EXACT} empty space, ${STORED} g(r), free energy at kT ${T}. Bond depth is 1 ε before the cost of lining up.`);
    await b.wait(2.5);
    await b.go('Now a membrane');
    b.chart(null);
    b.say('A 20-residue helix has about 16 backbone hydrogen bonds. Set the gain per bond for each place.');
    const water = b.slider({ label: 'water', min: 0, max: 6, value: 3, step: 0.5, fmt: (v) => `${v.toFixed(1)}` });
    const mem = b.slider({ label: 'membrane', min: 0, max: 6, value: 3, step: 0.5, fmt: (v) => `${v.toFixed(1)}` });
    b.read(() => `Your numbers: water <b>−${(water.value * 16).toFixed(0)}</b>, membrane <b>−${(mem.value * 16).toFixed(0)}</b> kcal/mol (before the cost of ordering the chain)`);
    await b.go('Check');
    const solved = Math.abs(water.value - 1) <= 0.5 && mem.value >= 4 && mem.value <= 5;
    b.say(`Water about 1 per bond, membrane an estimated 4 to 5: about −16 against −70 kcal/mol. So membrane segments are helices.`);
    await b.wait(3);
    return { seals: 1 + (wrong === 0 && net === 0 ? 1 : 0) + (solved ? 1 : 0), score: `You sorted ${correctCount} of 4 bonds.` };
  },
};
