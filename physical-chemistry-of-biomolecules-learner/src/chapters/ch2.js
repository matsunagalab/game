// Coulomb in water: dipoles that turn, a charge that disappears from view, and an atmosphere of salt.
import { DipoleDrop } from '../sim/dipole.js';
import { IonSphere } from '../sim/ions.js';
import { saltBridge, COULOMB, EWATER } from '../sim/exact.js';
import { LB } from '../sim/ions.js';
import { LIVE, EXACT } from '../bench.js';
import { debye } from '../chem.js';
import { axes, curve, dot, tag, text, ledgerBar, INK, RED, BLUE, OCHRE } from '../charts.js';
import { clamp } from './common.js';

const INDIGO = [0.11, 0.24, 0.45];

export const screen = {
  id: 'screen',
  ch: 2,
  title: 'Why 332 over ε',
  lede: 'Two charges in empty space pull hard. In water the same charges barely notice each other. Find out where the force went.',
  goals: ['Watch a charge vanish behind the dipoles around it.', 'Predict how heat changes the screening, and find the Bjerrum length.', 'Tune the solvent until the charge seen from outside is +1.0 ± 0.25, and hold it.'],
  note: {
    formula: 'E = 332 q₁q₂ / (ε r) &nbsp; kcal/mol, r in Å',
    text: 'The dipoles turn their opposite ends toward an ion, so a sphere drawn around the ion holds nearly zero net charge. Far away, the ion looks as if its charge were divided by ε. Strong dipoles raise ε, and heat lowers it because it scrambles their turning. ε comes from the same flicker you saw before the ion arrived: a fluid whose total dipole flickers easily also turns easily in a field. Water is unusually good at this: ε is 78.4 at 25 °C. The Bjerrum length, 7.1 Å in water, is where the pull between two charges falls to kT.',
    honest: 'Live simulation of a toy fluid: 120 soft spheres with point dipoles, in a drop. Your ε comes from the polarisation flux through a sphere (Gauss\'s law), read from layers of dipoles one molecule thick. The first layer even over-screens the ion. This fluid is not water, and its ε is a noisy order-of-magnitude guide. The Kirkwood–Fröhlich relation turns the flicker into ε. With the whole drop’s dipole it gives about 7 at kT 1, close to the flux reading of 7.1, and 4.75 at kT 2 against 3.9, so treat it as a guide. The simpler sphere-in-vacuum formula fails here because of the vacuum boundary around the drop. The 78.4 for water is a measured value.',
  },
  async run(b) {
    b.world(10);
    b.pattern(false);
    b.heat(0.32);
    const q = 6;
    let drop = new DipoleDrop({ n: 120, mu: 1.5, T: 1, seed: 11 });
    drop.ions.push({ x: 0, y: 0, z: 0, q: 0 });
    const shells = [[0.9, 1.6], [1.6, 2.6], [2.6, 3.6]]; // Each about one solvent layer.
    let sum = shells.map(() => 0);
    let samples = 0;
    let ionOn = false;
    const pace = b.pace;
    let settle = 0;
    const zero = () => { sum = shells.map(() => 0); samples = 0; settle = 40; };
    const seen = (k = 1) => q - sum[k] / Math.max(1, samples);
    // The two outer shells are the steadiest measure.
    const charge = () => (seen(1) + seen(2)) / 2;
    b.each(() => {
      pace.run((c) => drop.sweep(c));
      if (!ionOn) return;
      if (settle > 0) { settle--; return; }
      shells.forEach(([r0, r1], k) => { sum[k] += drop.bound(r0, r1); });
      samples++;
    });
    pace.limit = 3;
    pace.cost = 1;
    const smooth = new Float32Array(120 * 3);
    let ready = false;
    b.draw((r) => {
      const { n, p, m } = drop;
      const f = b.L / 2;
      const s = b.scale;
      if (!ready) { smooth.set(p); ready = true; }
      for (let i = 0; i < n * 3; i++) smooth[i] += (p[i] - smooth[i]) * 0.25;
      for (let i = 0; i < n; i++) {
        const I = i * 3;
        const z = smooth[I + 2];
        const depth = clamp(1 - Math.abs(z) / 3.2, 0.18, 1);
        const [x, y] = b.px(smooth[I] + f, smooth[I + 1] + f);
        r.dipole(x, y, Math.atan2(m[I + 1], m[I]), s * (0.38 + 0.2 * depth), 0.3 + 0.7 * depth, 1 - Math.hypot(m[I], m[I + 1]));
      }
      const [cx, cy] = b.px(f, f);
      if (ionOn) r.ion(cx, cy, s * 0.62, true);
      r.ring(cx, cy, s * 3.1, INDIGO, 0.5, 0.012);
    });
    b.over((g) => {
      const [cx, cy] = b.px(b.L / 2, b.L / 2);
      if (ionOn && samples > 25) tag(g, `seen from outside: +${Math.max(0, charge()).toFixed(1)}`, cx, cy + b.scale * 3.1 + 18);
    });
    const seenChart = (g, box) => {
      const pts = [[0.6, q], ...shells.map(([r0, r1], k) => [(r0 + r1) / 2, Math.max(-3, seen(k))])];
      const a = axes(g, box, { xmin: 0.5, xmax: 3.5, ymin: -3, ymax: q + 0.5, xlabel: 'circle radius, in molecule widths', ylabel: 'charge seen' });
      if (ionOn && samples > 25) { curve(g, a, pts, { color: RED }); pts.forEach(([x, y]) => dot(g, a, x, y, { color: BLUE, r: 3.5 })); }
    };
    b.say('Two ions 3 Å apart in empty space: 332 / 3 = 111 kcal/mol, as strong as a covalent bond.');
    await b.go('Next');
    b.say('With no ion at all, the total dipole of the drop flickers by itself. Hold on to that: ε comes from this flicker.');
    let flick = 0, nf = 0;
    const watch = b.each(() => {
      const { m, n, mu } = drop;
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < n; i++) { x += m[i * 3]; y += m[i * 3 + 1]; z += m[i * 3 + 2]; }
      flick += mu * mu * (x * x + y * y + z * z);
      nf++;
    });
    // Kirkwood-Froehlich: (e - 1)(2e + 1) / (9e) = 4 pi <M^2> / (9 V kT), with V the drop's nominal volume.
    const epsFlick = () => {
      const y = (4 * Math.PI * (flick / Math.max(1, nf))) / (9 * (drop.n / 0.72) * drop.T);
      const c = 1 + 9 * y;
      return (c + Math.sqrt(c * c + 8)) / 4;
    };
    b.read(() => `${LIVE} total dipole squared over kT: <b>${(flick / Math.max(1, nf) / drop.T).toFixed(0)}</b>, so ε ≈ <b>${epsFlick().toFixed(1)}</b>`);
    await b.wait(5);
    await b.go('Next');
    b.drop(watch);
    const fromFlicker = epsFlick();
    b.say('In water, how much of that pull is left?');
    const guess = await b.ask(['about half', 'about a tenth', 'about one eightieth']);
    b.say('Here is a drop of a fluid made only of dipoles. Blue is the minus end, red is the plus end.');
    await b.wait(1.5);
    await b.go('Switch on a +6 ion');
    drop.ions[0].q = q;
    ionOn = true;
    settle = 60;
    b.chart(seenChart);
    b.say(`Inside the ring the dipoles turn. Count what is left of +${q}.`);
    const readSeen = () => (samples > 25 ? `${LIVE} ion +${q}, seen beyond the ring <b>+${Math.max(0, charge()).toFixed(1)}</b>, so ε ≈ <b>${(q / Math.max(0.25, charge())).toFixed(0)}</b>` : `${LIVE} measuring…`);
    b.read(readSeen);
    await b.until(() => samples > 150);
    b.say(`The charge says ε ≈ ${(q / Math.max(0.25, charge())).toFixed(0)}, and the flicker said about ${fromFlicker.toFixed(0)}. Real water hides ${guess === 2 ? 'even more, as you guessed' : 'even more'}: 1/78.4.`);
    await b.wait(1.5);
    b.clear();
    b.say('In water, at what distance does the pull between two charges fall to kT?');
    const bj = await b.ask(['about 1 Å', 'about 7 Å', 'about 50 Å']);
    b.say(`${LB.toFixed(1)} Å: the Bjerrum length. Closer than that, charges feel each other above the noise. It returns with DNA.`);
    b.read(() => `${EXACT} 332 / (ε kT) at 25 °C, with ε ${EWATER}`);
    await b.wait(2);
    b.read(readSeen);
    const swap = (mu, T) => { drop.mu = mu; drop.T = T; zero(); };
    b.say('Heat scrambles dipoles. If it gets hotter, what happens to ε?');
    const hot = await b.ask(['ε falls', 'ε stays', 'ε rises']);
    const before = charge();
    swap(drop.mu, 2);
    b.heat(0.8);
    b.say('Same dipoles, twice the temperature. Watch the number.');
    await b.until(() => samples > 150);
    const after = charge();
    const right = after > before;
    b.say(right ? `The charge shows through: +${before.toFixed(1)} became +${after.toFixed(1)}, so ε fell.` : 'Noisy, but the trend is that ε falls with heat.');
    await b.wait(1.5);
    swap(1.5, 1);
    b.heat(0.32);
    const mu = b.slider({ label: 'dipole', min: 0.3, max: 1.8, value: 1.5, fmt: (v) => v.toFixed(2), on: (v) => swap(v, drop.T) });
    b.slider({ label: 'heat', min: 0.7, max: 2.2, value: 1, fmt: (v) => v.toFixed(2), on: (v) => { swap(mu.value, v); b.heat((v - 0.5) / 1.8); } });
    b.say('Set the dipole and heat so the ion looks like +1.0 from outside, and hold it there.');
    b.flags.tune = () => charge();
    let held = 0;
    let solved = false;
    const finish = b.button('Finish', () => { b.flags.quit = true; });
    finish.className = 'stamp quiet';
    b.each((dt) => {
      if (samples < 120) return;
      const c = charge();
      held = Math.abs(c - 1) < 0.25 ? held + dt : Math.max(0, held - dt);
      if (held > 2.5) solved = true;
    });
    await b.until(() => solved || b.flags.quit);
    const seals = 1 + (hot === 0 && bj === 1 ? 1 : 0) + (solved ? 1 : 0);
    return { seals, score: solved ? `You tuned the fluid to ε ≈ ${(q / charge()).toFixed(1)}.` : 'The drop is still printing.' };
  },
};

export const burial = {
  id: 'burial',
  ch: 2,
  title: 'The buried salt bridge',
  lede: 'Burying two opposite charges gives them a stronger Coulomb pull. Does that make burying them worthwhile?',
  goals: ['Measure the pair in water, at the surface and deep inside.', 'Say where the pair is best off in this model, before you see it.', 'Find the protein ε at which a deep pair just breaks even.'],
  note: {
    formula: 'ΔG<sub>Born</sub> = 166 q² (1/ε<sub>in</sub> − 1/ε<sub>out</sub>) / a',
    text: 'Burial makes the Coulomb term stronger, but it first has to pay to take each ion away from the water that was holding it. In this uniform sphere that cost always wins: the net rises steadily from water to core. In a continuum study of 21 protein salt bridges, 17 were electrostatically destabilising compared with a hydrophobic replacement (Hendsch and Tidor 1994), though the result depends on the assumed protein dielectric and boundary (Dong and Zhou 2002 find that semi-buried salt bridges can stabilise).',
    honest: 'Exact for its model: point charges in a low-dielectric sphere in water of ε 78.4 (Kirkwood series, Born cost for a 2.2 Å ion, no salt). Protein radius 16 Å, charges 3.2 Å apart. Real proteins are not uniform, and a pre-organised polar pocket can pay part of the cost, which is why ε here is only a stand-in.',
  },
  async run(b) {
    b.world(60);
    b.pattern(true);
    b.heat(0.32);
    const A = 16;
    const c = 30;
    let px = 52, py = 12; // Centre of the ion pair.
    let eIn = 4;
    const state = () => {
      const d = Math.hypot(px - c, py - c);
      const depth = A - d;
      const water = -COULOMB / (EWATER * 3.2);
      if (depth <= 0) return { depth, desolvation: 0, coulomb: water, total: water };
      const v = saltBridge({ a: A, depth: Math.max(2.2, depth), eIn });
      if (depth >= 2.2) return { depth, ...v };
      const f = depth / 2.2;
      return { depth, desolvation: v.desolvation * f, coulomb: water + (v.coulomb - water) * f, total: water + (v.total - water) * f };
    };
    const shown = { d: 0, c: 0, t: 0 };
    b.draw((r) => {
      const [x, y] = b.px(c, c);
      r.disk(x, y, A * b.scale, [0.86, 0.72, 0.46]);
      const s = state();
      const ang = Math.atan2(py - c, px - c) + Math.PI / 2;
      const ox = Math.cos(ang) * 1.9, oy = Math.sin(ang) * 1.9;
      const [ax, ay] = b.px(px + ox, py + oy);
      const [bx, by] = b.px(px - ox, py - oy);
      // Water dipoles crowd each ion in water and thin out with burial.
      const reach = clamp(1 - s.depth / 5, 0.12, 1);
      for (let k = 0; k < 14; k++) {
        const an = (k / 14) * 2 * Math.PI + b.t * 0.05;
        const q = k % 2 ? 1 : -1;
        if ((k * 7) % 14 > reach * 14) continue;
        const [hx, hy] = q > 0 ? [ax, ay] : [bx, by];
        const dist = b.scale * 4.5;
        const wx = hx + Math.cos(an) * dist;
        const wy = hy + Math.sin(an) * dist;
        // Each dipole points its opposite end at its ion.
        r.dipole(wx, wy, q > 0 ? an + Math.PI * 0 + Math.PI : an, b.scale * 1.5, 0.75);
      }
      r.ion(ax, ay, b.scale * 2.2, true);
      r.ion(bx, by, b.scale * 2.2, false);
      r.line(ax, ay, bx, by, 2, [0.1, 0.1, 0.2], 0.5);
    });
    b.each(() => {
      const s = state();
      shown.d += (s.desolvation - shown.d) * 0.2;
      shown.c += (s.coulomb - shown.c) * 0.2;
      shown.t += (s.total - shown.t) * 0.2;
    });
    b.chart((g, box) => {
      const rows = [['Pay: leave water', shown.d, BLUE], ['Gain: Coulomb', shown.c, OCHRE], ['Net', shown.t, RED]];
      const h = Math.min(40, (box.h - 6) / 3);
      const lw = Math.min(118, box.w * 0.34);
      rows.forEach(([name, v, col], i) => {
        const y = box.y + 4 + i * (h + 3);
        text(g, name, box.x, y + h * 0.7);
        ledgerBar(g, box.x + lw, y, box.w - lw - 62, h - 3, v, 34, col);
        text(g, `${v >= 0 ? '+' : ''}${v.toFixed(1)}`, box.x + box.w, y + h * 0.7, { align: 'right', color: col });
      });
      const m = box.x + lw + (box.w - lw - 62) / 2;
      g.strokeStyle = INK; g.lineWidth = 1;
      g.beginPath(); g.moveTo(m, box.y); g.lineTo(m, box.y + 3 * (h + 3)); g.stroke();
    });
    b.read(() => { const s = state(); return `${EXACT} ${s.depth > 0 ? `depth <b>${s.depth.toFixed(1)} Å</b>` : 'in water'}, kcal/mol from two free ions in water`; });
    b.say('In this model, where is a salt bridge best off?');
    const guess = await b.ask(['deep inside the protein', 'just under the surface', 'out in the water']);
    b.drag = null;
    let got = { water: false, surface: false, deep: false };
    b.onDrag({
      hit: (x, y) => (Math.hypot(x - px, y - py) < 7 ? 1 : null),
      move: (_, x, y) => { px = clamp(x, 4, 56); py = clamp(y, 4, 56); },
    });
    b.say('Drag the pair: first in the water, then just under the surface, then to the centre.');
    b.each(() => {
      const s = state();
      if (s.depth < -2) got.water = true;
      if (s.depth > 2.2 && s.depth < 5) got.surface = true;
      if (s.depth > 12) got.deep = true;
    });
    b.read(() => { const s = state(); return `${EXACT} ${got.water ? '水 ' : ''}${got.surface ? '面 ' : ''}${got.deep ? '芯 ' : ''}depth <b>${Math.max(0, s.depth).toFixed(1)} Å</b>, net <b>${s.total.toFixed(1)}</b> kcal/mol`; });
    await b.until(() => got.water && got.surface && got.deep);
    const deep = saltBridge({ a: A, depth: 15, eIn: 4 });
    const shallow = saltBridge({ a: A, depth: 2.2, eIn: 4 });
    b.say(`Out in water −1.4, under the surface +${shallow.total.toFixed(0)}, deep +${deep.total.toFixed(0)}. Water is the best place here: leaving it costs +${deep.desolvation.toFixed(0)}, the pull gives only ${deep.coulomb.toFixed(0)}.`);
    await b.wait(1.5);
    await b.go('A lone charge?');
    const lone = deep.single;
    b.say(`One buried ion with no partner costs about +${lone.toFixed(0)} kcal/mol here, the Born energy with the water just outside. Few forces in a protein can pay that.`);
    await b.go('Next');
    b.say('A protein is not all oil. Raise its ε and find where a deep pair just breaks even.');
    b.slider({ label: 'ε inside', min: 2, max: 40, value: 4, log: true, fmt: (v) => v.toFixed(1), on: (v) => { eIn = v; } });
    let solved = false;
    let held = 0;
    b.each((dt) => {
      const s = state();
      held = s.depth > 10 && Math.abs(s.total) < 0.4 ? held + dt : 0;
      if (held > 1) solved = true;
    });
    b.read(() => { const s = state(); return `${EXACT} depth <b>${Math.max(0, s.depth).toFixed(1)} Å</b>, ε <b>${eIn.toFixed(1)}</b>, net <b>${s.total.toFixed(1)}</b> kcal/mol`; });
    b.button('Finish', () => { b.flags.quit = true; });
    await b.until(() => solved || b.flags.quit);
    return { seals: 1 + (guess === 2 ? 1 : 0) + (solved ? 1 : 0), score: solved ? `A deep pair breaks even near ε = ${eIn.toFixed(1)}.` : 'Finished without the break-even point.' };
  },
};

export const atmosphere = {
  id: 'atmosphere',
  ch: 2,
  title: 'The ion atmosphere',
  lede: 'Salt ions are free to move. Around a charged protein they arrange themselves into a soft cloud, and that cloud has a size you can measure.',
  goals: ['Measure the cloud at two salts.', 'Predict what quarter strength salt does to the cloud.', 'Set the salt to give a Debye length of 6.0 Å, using theory first and measuring after.'],
  note: {
    formula: 'λ<sub>D</sub> = 3.04 / √I Å &nbsp; (I in mol/L, 25 °C)',
    text: 'Opposite ions gather near the protein and like ions drift away, against the scatter of heat. Beyond the cloud the charge is hidden. At cell salt (about 0.15 M) the length is near 8 Å, so charges on a protein only feel neighbours close by.',
    honest: 'Live Monte Carlo of the primitive model: hard ions in uniform water, ε 78.4, in a sphere, charge −6 macro-ion, all pairs bare Coulomb. Nothing about screening is put in. The measured length runs about 10% under 3.04/√I, mainly because the neutralising counter-ions add about 9% salt and a −6 macro-ion is beyond linear theory. Debye–Hückel itself is a dilute limit.',
  },
  async run(b) {
    b.pattern(false);
    b.heat(0.32);
    let I = 0.1;
    let s = new IonSphere({ I });
    const rebuild = () => { s = new IonSphere({ I }); s.sweep(200); b.world(2 * s.R + 6); fit = null; };
    let fit = null;
    b.world(2 * s.R + 6);
    s.sweep(200);
    const pace = b.pace;
    pace.limit = 30;
    b.each(() => {
      pace.run((c) => { s.sweep(c); s.sample(); });
      if (s.samples > 30 && s.samples % 20 === 0) fit = s.fitLambda();
    });
    b.draw((r) => {
      const f = b.L / 2;
      const [cx, cy] = b.px(f, f);
      r.disk(cx, cy, (s.macro - 2) * b.scale, [0.42, 0.55, 0.72]);
      r.ring(cx, cy, s.R * b.scale, [0.07, 0.11, 0.21], 0.55, 0.008);
      const size = Math.max(5.5, 2 * b.scale);
      for (let i = 0; i < s.n; i++) {
        const z = s.p[i * 3 + 2];
        const [x, y] = b.px(s.p[i * 3] + f, s.p[i * 3 + 1] + f);
        r.ion(x, y, size, s.q[i] > 0, 0.45 + 0.55 * (1 - Math.abs(z) / s.R));
      }
      if (fit) r.ring(cx, cy, (s.macro + fit) * b.scale, [0.78, 0.22, 0.13], 0.8, 0.012);
    });
    b.chart((g, box) => {
      const e = s.enclosed();
      const a = axes(g, box, { xmin: s.macro, xmax: Math.min(s.R, s.macro + 5 * s.lambda), ymin: -6.5, ymax: 1, xlabel: 'distance from centre, Å', ylabel: 'charge inside' });
      const k = 1 / (fit ?? s.lambda);
      curve(g, a, e.map((v) => [v.r, s.Z * (Math.exp(-k * (v.r - s.macro)) * (1 + k * v.r)) / (1 + k * s.macro)]), { color: RED, width: 1.6, dash: [5, 3] });
      curve(g, a, e.map((v) => [v.r, v.q]), { color: BLUE, width: 2.2 });
    });
    b.read(() => `${LIVE} salt <b>${(I * 1000).toFixed(0)} mM</b>, measured λ <b>${fit ? fit.toFixed(1) : '…'} Å</b>, theory ${debye(I).toFixed(1)} Å`);
    b.say('The blue protein carries −6. Red seals are plus ions and blue seals are minus ions.');
    await b.wait(2);
    b.say('The curve shows the charge inside a growing circle. It climbs to zero as the cloud hides the protein.');
    await b.until(() => s.samples > 150);
    const f1 = fit;
    await b.go('Dilute the salt');
    b.say('Quarter the salt. What does the cloud do?');
    const guess = await b.ask(['stays the same', 'twice as wide', 'four times as wide']);
    I = 0.025;
    rebuild();
    b.say('Diluting: fewer ions to build the cloud, so it spreads.');
    await b.until(() => s.samples > 200);
    const ratio = fit / f1;
    b.say(`Measured ratio ${ratio.toFixed(2)}. Theory says √4 = 2, because λ goes as 1 / √I.`);
    await b.wait(1.5);
    b.say('Now use the formula, 3.04 / √I, to set the salt so λ is 6.0 Å. Then press Measure.');
    b.slider({ label: 'salt', min: 20, max: 800, value: 25, log: true, fmt: (v) => `${v.toFixed(0)} mM`, on: (v) => { I = v / 1000; rebuild(); } });
    let tries = 0;
    let solved = false;
    let measuring = false;
    b.button('Measure', () => { if (!measuring) { measuring = true; tries++; s.samples = Math.min(s.samples, 0); s.plus.fill(0); s.minus.fill(0); fit = null; } });
    b.button('Finish', () => { b.flags.quit = true; });
    b.each(() => {
      if (measuring && s.samples > 180) {
        measuring = false;
        const theory = debye(I);
        b.say(`Measured ${fit.toFixed(1)} Å, and theory says ${theory.toFixed(1)} Å at this salt.`);
        if (Math.abs(theory - 6) < 0.25) solved = true;
      }
    });
    await b.until(() => solved || b.flags.quit);
    if (solved) { b.say(`${(I * 1000).toFixed(0)} mM gives 6 Å.`); await b.wait(1.2); }
    return { seals: 1 + (guess === 1 ? 1 : 0) + (solved && tries <= 2 ? 1 : 0), score: `Measured ratio on dilution: ${ratio.toFixed(2)} (theory 2.00).` };
  },
};
