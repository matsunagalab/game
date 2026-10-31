// The hydrophobic effect, measured in live Mercedes-Benz water, with bonds on and with bonds off.
import { liveWater, markShell, drawSolutes, setBox, setT, byT, heatOf, clamp, rhoAt } from './common.js';
import { Ring } from '../waterview.js';
import { HoleMeter, smallHole } from '../sim/holes.js';
import { LIVE, STORED, EXACT, LIT } from '../bench.js';
import { axes, bars, curve, dot, text, INK, RED, BLUE, OCHRE, FONT } from '../charts.js';
import { INSERT, CROSS, SHELLS, PMF, PAIR, CAVITY, CAVOFF, HOLES, P } from '../sim/mbtable.js';

const SHELL_CUT = 1.55;
const bar = (n, of) => `${Math.min(100, Math.round((n / of) * 100))}%`;

// Numbers quoted in the notes come from the tables, so the words cannot drift from the data.
const D = INSERT[1], O = INSERT.hole;
const pct = (a, b) => Math.round((a / b) * 100);
const S18 = SHELLS.find((s) => s.T === 0.18), S20 = SHELLS.find((s) => s.T === 0.2);
const turn18 = S18.n * 0.18 * -S18.S, turn20 = S20.n * 0.2 * -S20.S;
const at = (rows, T, k) => byT(rows, T, k);
const hole = (T, tab) => HOLES[T][tab].W[HOLES[T][tab].R.indexOf(1)];
const minPay = Math.min(...D.box.filter((p) => p.T <= 0.28).map((p) => p.mTdS / p.dG));

export const cage = {
  id: 'cage',
  ch: 1,
  title: 'The cage',
  lede: 'Oil cannot hold a hydrogen bond. So what happens to the water right next to a drop of oil? This water is alive: every bond you see is being made and broken by the simulation.',
  goals: ['Fill the orientation chart and find what the shell gave up.', 'Count arms by hand in three frozen frames, with at most one slip.', 'Work out one term in the shell’s entropy, to within 15%.'],
  note: {
    formula: 'S = − k Σ p ln(12 p) &nbsp; per water',
    text: `Shell waters can still make their hydrogen bonds, as many as bulk water does, but only by pointing one arm straight away from the oil and laying the other two along the surface. Fewer orientations means less entropy, and near kT 0.18 that is a real part of the bill. But a fluid with no bonds at the same density already charges ${pct(at(D.off, 0.18, 'dG'), at(D.box, 0.18, 'dG'))}% of this drop’s ΔG at kT 0.18, and nearly all of it by kT 0.22. The next prints measure that.`,
    honest: `Live Monte Carlo of two-dimensional Mercedes-Benz water (Ben-Naim; Silverstein, Haymet and Dill 1998), with energy in units of one ideal bond and kT = 0.18. The chart fills from your run, and the ghost outline is the long run (about 750,000 sweeps). It is a flat toy: real water is 3D. The orientation term is one piece of a sum with large terms of both signs. At kT 0.18 it is about ${turn18.toFixed(1)} ε, ${pct(turn18, at(D.on, 0.18, 'mTdS'))}% of −TΔS at constant pressure and ${pct(turn18, at(D.box, 0.18, 'mTdS'))}% in a held box. By kT 0.20 it is ${turn20.toFixed(1)} ε while −TΔS at constant pressure is near zero. There is no rigid ice-like cage here, only a bias.`,
  },
  async run(b) {
    const T = 0.18;
    b.heat(heatOf(T));
    b.pattern(true);
    const lab = liveWater(b, { T, n: 150, solutes: [{ x: 0.3, y: 0.3, s: 1 }], area: 1 });
    const { w } = lab;
    b.flags.lab = lab;
    const sol = w.solutes[0];
    const near = new Ring(0, SHELL_CUT);
    const far = new Ring(0.9, SHELL_CUT);
    const long = SHELLS.find((s) => s.T === T);
    const bulkRing = () => [sol.x + w.L / 2, sol.y + w.L / 2];
    let sampling = false;
    let picked = null;
    b.each(() => {
      if (!lab.frozen) markShell(lab, SHELL_CUT);
      if (sampling) {
        near.sample(w, sol.x, sol.y, lab.view.bond);
        const [fx, fy] = bulkRing();
        far.sample(w, fx, fy, lab.view.bond);
      }
    });
    b.draw((r) => {
      drawSolutes(b, lab, r);
      if (picked) {
        for (const p of picked) {
          const [x, y] = b.px(w.x[p.i], w.y[p.i]);
          r.ring(x, y, b.scale * 0.62, p.on ? [0.8, 0.21, 0.11] : [0.12, 0.3, 0.56], p.on ? 0.95 : 0.55, 0.06);
          const [sx, sy] = b.px(sol.x, sol.y);
          r.line(sx, sy, sx + (x - sx) * 1.7, sy + (y - sy) * 1.7, 1.3, [0.1, 0.12, 0.2], 0.4);
        }
      }
      if (sampling) {
        const [fx, fy] = bulkRing();
        const [x, y] = b.px(((fx % w.L) + w.L) % w.L, ((fy % w.L) + w.L) % w.L);
        r.ring(x, y, b.scale * SHELL_CUT, [0.8, 0.21, 0.11], 0.6, 0.012);
      }
    });
    const chart = (g, box) => {
      const labels = new Array(12).fill('');
      labels[1] = 'arm points out';
      labels[10] = 'arm points in';
      const sum = near.hist.reduce((a, c) => a + c, 0) || 1;
      const a = near.hist.map((v) => (v / sum) * 12);
      const sumB = far.hist.reduce((p, c) => p + c, 0) || 1;
      const c = far.hist.map((v) => (v / sumB) * 12);
      bars(g, box, a, { max: 3.6, other: c, labels, base: 1 });
      if (long) {
        const { x, y, w: W, h } = box;
        const H = h - 14;
        g.strokeStyle = INK; g.lineWidth = 1.2; g.setLineDash([3, 3]);
        g.beginPath();
        long.hist.forEach((v, i) => { const px = x + ((i + 0.5) / 12) * W; const py = y + H * (1 - v / 3.6); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
        g.stroke();
        g.setLineDash([]);
      }
    };
    b.read(() => `${LIVE} ${(lab.view.count * 2 / w.n).toFixed(2)} bonds per water, ${lab.view.rate.toFixed(0)} new bonds a second`);
    b.say('Each ink mark is a water with three arms. An arm turns red when it holds a hydrogen bond.');
    await b.wait(0.4);
    await b.go('Look at the drop');
    b.say('The ochre drop is oil. Blue waters touch it. They cannot bond to oil. What do they lose?');
    const guess = await b.ask(['most of their hydrogen bonds', 'their freedom to turn', 'nothing at all']);
    sampling = true;
    b.chart(chart);
    b.say('Counting. Blue bars show which way shell waters face, red outlines the same for the ring in bulk.');
    b.read(() => `${LIVE} shell <b>${near.perWater.toFixed(2)}</b> bonds per water, bulk <b>${far.perWater.toFixed(2)}</b>, chart ${bar(near.waters, 3200)}`);
    await b.until(() => near.waters > 3200);
    const open = near.open;
    b.say(`Bonds held steady. But shell waters use only ${open.toFixed(1)} of 12 orientation slots. They gave up some turning.`);
    b.read(() => `${LIVE} open slots: shell <b>${near.open.toFixed(1)}</b>, bulk <b>${far.open.toFixed(1)}</b>. ${STORED} shell ${(12 * Math.exp(long.S)).toFixed(1)}`);
    await b.wait(1.5);
    await b.go('Why does it happen?');
    b.say('Switch every hydrogen bond off and keep the drop.');
    const keep = [near.save(), far.save()];
    near.reset();
    far.reset();
    w.hb = 0;
    await b.until(() => near.waters > 1800);
    b.say(`${near.open.toFixed(1)} of 12. Flat, and it must be: without bonds no energy depends on a water's angle. Bulk with bonds is flat too. The bias needs both the surface and the bonds.`);
    await b.wait(1.5);
    await b.go('Bonds back on');
    sampling = false;
    w.hb = 1;
    near.restore(keep[0]);
    far.restore(keep[1]);
    b.say('Letting the bonds settle…');
    await b.wait(4);

    // Count by hand.
    let slips = 0;
    let out = 0;
    let shellSeen = 0;
    for (let round = 0; round < 3; round++) {
      lab.frozen = true;
      const list = [];
      for (let i = 0; i < w.n; i++) {
        let dx = w.x[i] - sol.x;
        let dy = w.y[i] - sol.y;
        dx -= w.L * Math.round(dx / w.L);
        dy -= w.L * Math.round(dy / w.L);
        const q = Math.hypot(dx, dy);
        if (q >= SHELL_CUT) continue;
        const third = (2 * Math.PI) / 3;
        let a = (((w.t[i] - Math.atan2(dy, dx)) % third) + third) % third;
        if (a > third / 2) a = third - a;
        list.push({ i, truth: a < Math.PI / 9, on: false, a });
      }
      await b.wait(0.35); // Lets the smoothed ink catch up with the frozen frame.
      picked = list;
      b.flags.list = list;
      b.say(`Frame ${round + 1} of 3. Tap each ringed water with an arm pointing straight out along its thin line.`);
      b.read(() => `${LIVE} marked ${list.filter((p) => p.on).length} of ${list.length} shell waters`);
      b.onDrag({
        hit: (x, y) => {
          let best = null;
          let d0 = 0.75 + 14 / b.scale;
          for (const p of list) {
            let dx = w.x[p.i] - x;
            let dy = w.y[p.i] - y;
            dx -= w.L * Math.round(dx / w.L);
            dy -= w.L * Math.round(dy / w.L);
            const d = Math.hypot(dx, dy);
            if (d < d0) { d0 = d; best = p; }
          }
          if (best) { best.on = !best.on; b.sound.pluck(best.on ? 8 : 4, 0.2); }
          return null;
        },
      });
      await b.go('Done');
      for (const p of list) if (p.on !== p.truth) { if (Math.abs(p.a - Math.PI / 9) > 0.14) slips++; }
      const yes = list.filter((p) => p.truth).length;
      out += yes;
      shellSeen += list.length;
      b.say(`${yes} of ${list.length} really point out. By chance it would be 1 in 3.`);
      b.onDrag(null);
      await b.wait(1.1);
      picked = null;
      lab.frozen = false;
      await b.wait(1.2);
    }
    b.say(`Your count: ${out} of ${shellSeen}, ${Math.round((out / Math.max(1, shellSeen)) * 100)}% against 33% by chance. ${slips <= 1 ? 'Clean.' : `${slips} slips.`}`);
    await b.wait(1.8);

    // One term in the entropy.
    const n = near.meanCount;
    const cost = n * T * Math.log(12 / near.open);
    b.flags.cost = cost;
    b.chart(chart);
    b.say(`One term in the shell's entropy: n·kT·ln(12 / open). Here n is ${n.toFixed(1)}, kT is 0.18, open is ${near.open.toFixed(1)}.`);
    const c = b.slider({ label: 'term', min: 0, max: 1.2, value: 0.1, step: 0.01, fmt: (v) => `${v.toFixed(2)} ε` });
    b.read(() => 'ε is one ideal hydrogen bond. Set your answer, then Check.');
    await b.go('Check');
    const solved = Math.abs(c.value - cost) <= 0.15 * cost;
    b.say(`It is ${cost.toFixed(2)} ε. At this temperature that matters. But it is one term in a larger bill, and it fades fast on warming.`);
    b.read(() => '');
    await b.wait(2.2);
    return { seals: 1 + (slips <= 1 ? 1 : 0) + (solved ? 1 : 0), score: `Open orientations: ${open.toFixed(1)} of 12 at the surface. ${guess === 1 ? 'And you called it.' : 'The surprise: the bonds survive.'}` };
  },
};

export const holes = {
  id: 'holes',
  ch: 1,
  title: 'Room for a hole',
  lede: 'Before oil can enter water, a hole must open. Nobody digs it: water opens small holes by itself, by chance. Count how often, and you are measuring what room costs in this liquid.',
  goals: ['Check your count against an exact result at R = 0.3.', 'Say what switching bonds off does to the price of a hole, before you measure it.', 'Find the hole so rare that only 1 look in 1000 finds it empty.'],
  note: {
    formula: 'W(R) = − kT ln P₀(R) &nbsp;&nbsp; small R: P₀ = 1 − ρπR²',
    text: `P₀ is the share of water’s states that leave a circle empty, so −kT ln P₀ is the free energy of restricting water; its split into energy and entropy depends on temperature. It costs a lot because the liquid is dense: at lower density the same fluid charges far less. Lee (1985) adds that water molecules are small; this game varies density, not molecular size, so it does not test that part (see also Harano and Kinoshita 2005). Switch bonds off at the same density and ${pct(hole(0.18, 'off'), hole(0.18, 'on'))}% of the price stays at kT 0.18, nearly all of it at kT 0.24. Bonds still matter: at the same pressure a bondless fluid swells, and a hole gets far cheaper. An oil drop needs a hole of radius near 1, and its own attraction to water pays back about half the price.`,
    honest: 'The count is live, with no table behind it (Hummer et al., PNAS 1996): 240 random circles a frame in 150 waters at kT 0.18. The ± is the largest scatter over blocks of your run. Cold water rearranges slowly, so a slow device sees fewer states and can read high: at 8 sweeps a frame, many runs give about 1.24 ± 0.12 at R = 1 against the long run’s 1.15. Lines are long runs of 200 waters. Bonds-off runs hold the same density. The small-R formula is exact only below R ≈ 0.33, half the closest approach of two waters. In 2D the circle is a disk, so its area stands in for volume.',
  },
  async run(b) {
    const T = 0.18;
    b.heat(heatOf(T));
    b.pattern(true);
    const lab = liveWater(b, { T, n: 150 });
    const { w } = lab;
    b.flags.lab = lab;
    const meter = new HoleMeter(w);
    b.flags.meter = meter;
    const H = HOLES[T];
    let R = 0.5;
    let counting = true;
    const flash = [];
    meter.watch(R);
    b.each((dt) => {
      for (let i = flash.length - 1; i >= 0; i--) { flash[i].life -= dt * 2.2; if (flash[i].life <= 0) flash.splice(i, 1); }
      if (!counting) return;
      const top = meter.sample();
      if (top.r >= R && flash.length < 10) {
        flash.push({ ...top, life: 1 });
        if (R > 0.6) b.sound.event(4 + Math.floor(R * 6), 0.14, 0, 0.12); // A rare hole is a rare note.
      }
    });
    b.draw((r) => {
      const s = b.scale;
      for (const h of flash) {
        const [x, y] = b.px(h.x, h.y);
        r.halo(x, y, R * s, [0.98, 0.86, 0.5], 0.6 * h.life);
        r.ring(x, y, R * s, [0.8, 0.21, 0.11], h.life, 0.035);
      }
    });
    const dots = [];
    for (let q = 0.1; q <= 1.2001; q += 0.1) dots.push(+q.toFixed(2));
    let offDots = null;
    const liveW = (q) => { const k = meter.hits(q); return k >= 6 ? -T * Math.log(k / meter.total) : null; };
    const chart = (g, box) => {
      const a = axes(g, box, { xmin: 0.1, xmax: 1.2, ymin: 0, ymax: 1.7, xlabel: 'hole radius R', ylabel: 'price, ε', zero: false });
      curve(g, a, H.on.R.map((q, i) => [q, H.on.W[i]]), { color: BLUE, width: 1.6 });
      curve(g, a, H.off.R.map((q, i) => [q, H.off.W[i]]), { color: OCHRE, width: 1.6 });
      const ex = [];
      for (let q = 0.1; q <= 0.33; q += 0.01) ex.push([q, -T * Math.log(smallHole(q, H.on.rho))]);
      curve(g, a, ex, { color: '#3f7f4a', width: 3 });
      if (offDots) offDots.forEach(([q, v]) => dot(g, a, q, v, { color: OCHRE, r: 4 }));
      dots.forEach((q) => { const v = liveW(q); if (v !== null) dot(g, a, q, v, { color: RED, r: 3.5 }); });
      const px = a.fx(clamp(R, 0.1, 1.2));
      g.strokeStyle = 'rgba(16,29,56,.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(px, a.bot); g.lineTo(px, a.bot - a.H); g.stroke();
      text(g, 'water', a.left + 44, box.y + 12, { color: BLUE });
      text(g, 'no bonds', a.left + 86, box.y + 12, { color: OCHRE });
      text(g, 'exact', a.left + 146, box.y + 12, { color: '#3f7f4a' });
      text(g, 'your count', a.left + 186, box.y + 12, { color: RED });
    };
    const per1000 = () => (meter.total ? (1000 * meter.P0(R)) : 0);
    const plus = () => { const e = meter.priceError(T); return e === null ? '' : ` ± ${e.toFixed(2)}`; };
    const readLive = () => `${LIVE} R <b>${R.toFixed(2)}</b>: <b>${per1000().toFixed(1)}</b> of 1000 looks empty, price <b>${Number.isFinite(meter.price(R, T)) ? meter.price(R, T).toFixed(2) : '…'}${plus()} ε</b>. Lines ${STORED}`;
    b.read(readLive);
    b.say('No oil here. Red rings mark spots where a circle of radius R happens to hold no water. Nothing made them.');
    await b.wait(1.6);
    b.chart(chart);
    b.slider({ label: 'R', min: 0.1, max: 1.2, value: R, step: 0.01, fmt: (v) => v.toFixed(2), on: (v) => { R = v; meter.watch(v); } });
    b.say('Each frame throws 240 circles at the water. The rarer an empty circle, the higher its price, −kT ln P₀.');
    await b.until(() => meter.total > 25000);
    b.say('Two waters cannot share a circle under R = 0.33, so its chance is exact: 1 − ρπR². Set R to 0.30 and compare.');
    await b.until(() => Math.abs(R - 0.3) < 0.015, 0.2);
    meter.reset();
    const exactP = smallHole(0.3, w.n / (w.L * w.L));
    b.read(() => `${LIVE} looks empty <b>${meter.P0(0.3).toFixed(3)}</b>, ${EXACT} <b>${exactP.toFixed(3)}</b>`);
    await b.until(() => meter.total > 60000);
    const liveP = meter.P0(0.3);
    b.say(`${liveP.toFixed(3)} counted, ${exactP.toFixed(3)} exact. Your count is sound. Now set R to 1.00: about the size of a drop.`);
    b.read(readLive);
    await b.until(() => Math.abs(R - 1) < 0.015, 0.2);
    meter.perFrame = 480;
    meter.reset();
    b.say('Counting holes of radius 1 in water…');
    await b.until(() => meter.total > 180000);
    const priceOn = meter.price(1, T);
    const errOn = meter.priceError(T) ?? 0;
    b.say(`${priceOn.toFixed(2)} ± ${errOn.toFixed(2)} ε in live water. Switch the bonds off at the same density. What happens to the price?`);
    const guess = await b.ask(['much cheaper: bonds were the cost', 'about the same', 'much dearer']);
    w.hb = 0;
    counting = false;
    b.say('Bonds off. Letting the fluid forget its network…');
    await b.wait(1.5);
    meter.reset();
    counting = true;
    await b.until(() => meter.total > 180000);
    const priceOff = meter.price(1, T);
    offDots = dots.map((q) => [q, liveW(q)]).filter(([, v]) => v !== null);
    b.flags.prices = [priceOn, priceOff];
    const errOff = meter.priceError(T) ?? 0;
    b.say(`No bonds: ${priceOff.toFixed(2)} ± ${errOff.toFixed(2)} ε. Most of the price stays. It is the price of making room in a dense liquid.`);
    b.read(() => `${LIVE} with bonds ${priceOn.toFixed(2)} ± ${errOn.toFixed(2)}, without ${priceOff.toFixed(2)} ± ${errOff.toFixed(2)}. ${STORED} long runs ${hole(T, 'on').toFixed(2)} and ${hole(T, 'off').toFixed(2)}`);
    await b.wait(2.4);
    await b.go('And at the same pressure?');
    b.say(`A bondless fluid at the same pressure swells to density ${H.press.rho.toFixed(2)}, and the hole drops to ${hole(T, 'press').toFixed(2)} ε. Bonds help by holding water dense.`);
    b.read(() => `${STORED} no bonds, same pressure`);
    await b.wait(2.4);
    w.hb = 1;
    counting = false;
    b.say('Bonds back on. Letting them settle…');
    await b.wait(2.5);
    meter.reset();
    counting = true;
    meter.perFrame = 480;
    b.read(readLive);
    b.say('Now the hard part. Find the hole so rare that only 1 look in 1000 finds it empty, then press Here.');
    const want = -T * Math.log(0.001);
    let target = 1;
    for (let i = 1; i < H.on.R.length; i++) if (H.on.W[i - 1] < want && H.on.W[i] >= want) target = H.on.R[i - 1] + ((H.on.R[i] - H.on.R[i - 1]) * (want - H.on.W[i - 1])) / (H.on.W[i] - H.on.W[i - 1]);
    b.flags.target = target;
    let solved = false;
    let pressed = false;
    b.button('Here', () => { pressed = true; solved = Math.abs(R - target) <= 0.05; }, { quiet: false });
    await b.until(() => pressed);
    b.clear();
    b.say(`Long runs say R = ${target.toFixed(2)}, and a drop needs about this much. Water charges this first; the drop's own attraction then pays back about half.`);
    b.read(() => `${STORED} dissolving this drop costs ${byT(INSERT[1].on, T, 'dG').toFixed(2)} ε in all`);
    await b.wait(2.8);
    return { seals: 1 + (guess === 1 ? 1 : 0) + (solved ? 1 : 0), score: `A hole of radius 1: ${priceOn.toFixed(2)} ε with bonds, ${priceOff.toFixed(2)} ε without.` };
  },
};

export const twoDrops = {
  id: 'twodrops',
  ch: 1,
  title: 'Two drops',
  lede: 'Oil drops stick together in water, yet the direct pull between two oil molecules is tiny. So what pushes them? Count the waters, then look at what a fluid with no bonds would do.',
  goals: ['Measure the shell apart and in contact.', 'Say how many waters are set free, before you measure.', 'Gather five drops so that fewer than 12 waters touch them, within 40 seconds.'],
  note: {
    formula: 'W(r) = − kT ln g(r)',
    text: 'When two drops touch, the waters between them leave the shell. The direct pull between the drops is only about a third of the contact depth. Some of the rest is packing, the same depletion as in Forced together by crowding: a bondless fluid at the same density reaches half to most of this depth. The share depends on temperature, and at this kT the remainder needs bonds. Gathering oil hides it from water, which is why oil separates from water and why protein cores form.',
    honest: `The shell count is live. The curves W(r) are stored, from test-particle insertion in long runs of 300 waters with a flat baseline past r = 5, and the tug you feel follows that curve, since a live force would need minutes to settle. A contact pair here is only about −1.5 kT at kT 0.22, so free drops rarely clump in a small box: spontaneous clumping did not clearly beat the bonds-off control in tests, and this print does not claim it. A line of five and a round clump differ by only about one water. Shell counts drop on contact in a bondless fluid too, so a count alone proves nothing about bonds. The packing claim has its own control: with a solute that only repels, a bondless fluid still gives contact near −0.35 ε with no attraction anywhere, about ${pct(PMF.wca[0].contact, PMF.wcaWater[0].contact)}% of the same solute in water at this kT.`,
  },
  async run(b) {
    const T = 0.22;
    b.heat(heatOf(T));
    b.pattern(true);
    const lab = liveWater(b, { T, n: 150, solutes: [{ x: 0.3, y: 0.5, s: 1 }, { x: 0.7, y: 0.5, s: 1 }], area: 6 });
    const { w } = lab;
    const [A, B] = w.solutes;
    A.held = true; B.held = true;
    const pm = PMF.on.find((p) => p.T === T);
    const pmOff = PMF.off.find((p) => p.T === T);
    const Wof = (r) => { let k = pm.r.findIndex((q) => q >= r); if (k <= 0) k = 1; const t = (r - pm.r[k - 1]) / (pm.r[k] - pm.r[k - 1]); return pm.W[k - 1] + (pm.W[k] - pm.W[k - 1]) * clamp(t, 0, 1); };
    const gap = (p, q) => { let dx = p.x - q.x; let dy = p.y - q.y; dx -= w.L * Math.round(dx / w.L); dy -= w.L * Math.round(dy / w.L); return [dx, dy, Math.hypot(dx, dy)]; };
    let count = 0;
    let mean = 0;
    let tally = 0;
    let frames = 0;
    let grab = null;
    b.each(() => {
      count = markShell(lab, SHELL_CUT);
      mean += (count - mean) * 0.04;
      tally += count;
      frames++;
      if (!grab) return;
      const [hx, hy] = grab.to;
      let dx = hx - grab.s.x;
      let dy = hy - grab.s.y;
      dx -= w.L * Math.round(dx / w.L);
      dy -= w.L * Math.round(dy / w.L);
      // The player's hand is a spring; the drop also feels the stored well.
      for (const other of w.solutes) {
        if (other === grab.s) continue;
        const [gx, gy, d] = gap(grab.s, other);
        if (d > 3.2 || d < 0.1) continue;
        const f = -(Wof(d + 0.05) - Wof(d - 0.05)) / 0.1;
        dx += clamp(f * 1.4, -1.4, 1.4) * gx / d;
        dy += clamp(f * 1.4, -1.4, 1.4) * gy / d;
        if (d < 1.0) { dx += (1 - d) * 3 * gx / d; dy += (1 - d) * 3 * gy / d; }
      }
      grab.pull = Math.hypot(dx, dy);
      grab.s.x = (grab.s.x + clamp(dx * 0.2, -0.3, 0.3) + w.L) % w.L;
      grab.s.y = (grab.s.y + clamp(dy * 0.2, -0.3, 0.3) + w.L) % w.L;
    });
    b.draw((r) => {
      if (grab) {
        const [x, y] = b.px(grab.s.x, grab.s.y);
        const [hx, hy] = b.px(grab.to[0], grab.to[1]);
        r.line(x, y, hx, hy, clamp(1.5 + (grab.pull ?? 0) * 2, 2, 7), [0.8, 0.21, 0.11], 0.8);
      }
      drawSolutes(b, lab, r);
    });
    const windowed = async (s) => { tally = 0; frames = 0; await b.wait(s); return tally / Math.max(1, frames); };
    b.read(() => `${LIVE} <b>${mean.toFixed(1)}</b> blue waters touch the oil`);
    b.say('Two drops, far apart. Count the blue shell waters while they settle.');
    await windowed(1);
    const apart = await windowed(6);
    b.say(`Apart: ${apart.toFixed(1)} shell waters. Bring the drops into contact. How many waters go free?`);
    const guess = await b.ask(['none', 'one or two', 'about five']);
    b.say('Drag one drop onto the other. The tug near the end follows the free energy from long runs.');
    b.flags.w = w;
    b.onDrag({
      hit: (x, y) => {
        for (const s of w.solutes) if (gap(s, { x, y })[2] < 1.4 + 14 / b.scale) { grab = { s, to: [x, y] }; b.buzz(8); return grab; }
        return null;
      },
      move: (g, x, y) => { g.to = [x, y]; },
      end: () => { grab = null; },
    });
    await b.until(() => gap(A, B)[2] < 1.3, 0.5);
    b.buzz(30);
    b.say('Contact. Now count again.');
    const touching = await windowed(5);
    const freed = apart - touching;
    const long = (t) => PAIR[t].on[6.5] - PAIR[t].on[1.1];
    b.say(`${freed.toFixed(1)} waters went free. Long runs: ${long(0.18).toFixed(1)} at kT 0.18, ${long(0.24).toFixed(1)} at kT 0.24.`);
    await b.wait(1.5);
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 0.9, xmax: 3.2, ymin: -0.42, ymax: 0.42, xlabel: 'distance between drops', ylabel: 'W, in ε' });
      curve(g, a, pmOff.r.map((q, i) => [q, pmOff.W[i]]), { color: OCHRE, width: 1.6 });
      curve(g, a, pm.r.map((q, i) => [q, pm.W[i]]));
      curve(g, a, pm.r.map((q) => [q, 4 * 0.1 * ((1 / q) ** 12 - (1 / q) ** 6)]), { color: BLUE, dash: [4, 3], width: 1.4 });
      const d = gap(A, B)[2];
      if (d < 3.2) dot(g, a, Math.max(0.9, d), Wof(Math.max(0.9, d)), { color: INK, r: 4.5 });
      text(g, 'water', a.left + 44, box.y + 12, { color: RED });
      text(g, 'no bonds', a.left + 86, box.y + 12, { color: OCHRE });
      text(g, 'direct pull', a.left + 146, box.y + 12, { color: BLUE });
    });
    const part = pmOff.water / pm.water;
    b.say(`Blue dashes are the direct pull. Of the rest, a bondless fluid at this density reaches ${Math.round(part * 100)}% here; across temperatures it reaches half to most. That part is packing, as in crowding.`);
    b.read(() => `${STORED} distance <b>${gap(A, B)[2].toFixed(2)}</b>, W <b>${Wof(clamp(gap(A, B)[2], 0.9, 3.2)).toFixed(2)} ε</b>. ${LIVE} shell ${mean.toFixed(1)}`);
    await b.wait(1);
    b.say(`Pull the drops apart past 3.1. Contact is ${pm.contact.toFixed(2)} ± ${pm.err.toFixed(2)} ε, with ${pmOff.contact.toFixed(2)} in the bondless fluid.`);
    await b.until(() => gap(A, B)[2] > 3.1, 0.2);
    b.say('Pulled apart. The shell fills again as you drag. Now a puzzle.');
    await b.wait(1.2);
    // Five drops. Three more arrive.
    const L = w.L;
    for (const [x, y] of [[0.2, 0.2], [0.8, 0.8], [0.8, 0.2]]) { const s = w.addSolute({ x: x * L, y: y * L, s: 1, e: 0.1 }); s.held = true; }
    setBox(b, lab, Math.sqrt((w.n + 6) / rhoAt(T)));
    const hist = [];
    let every = 0;
    b.each(() => { if (++every % 12 === 0) { hist.push(mean); if (hist.length > 200) hist.shift(); } });
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 0, xmax: 40, ymin: 5, ymax: 36, xlabel: 'seconds', ylabel: 'shell waters', zero: false });
      curve(g, a, [[0, 12], [40, 12]], { color: RED, dash: [5, 3], width: 1.4 });
      curve(g, a, hist.map((v, i) => [40 * (i / Math.max(hist.length, 200)), v]), { color: BLUE });
    });
    b.say('Five drops, 40 seconds. Gather them until fewer than 12 waters touch them, and hold for three seconds.');
    let left = 40;
    b.read(() => `${LIVE} <b>${mean.toFixed(1)}</b> shell waters (target below 12), <b>${Math.max(0, left).toFixed(0)} s</b> left`);
    let solved = false;
    let held = 0;
    b.each((dt) => {
      if (solved) return;
      left -= dt;
      held = mean < 12 && !grab ? held + dt : 0;
      if (held >= 3 && left > 0) solved = true;
    });
    await b.until(() => solved || left <= 0);
    if (solved) { b.sound.chord(); b.say(`${mean.toFixed(1)} waters, down from about 26 with the drops apart.`); } else b.say('Out of time. Each drop you bring in frees more waters.');
    await b.wait(1.8);
    return { seals: 1 + (guess === 2 ? 1 : 0) + (solved ? 1 : 0), score: `One contact freed ${freed.toFixed(1)} waters.` };
  },
};

// The bill as a table. Held box: this drop and an empty hole, with bonds and without, at the same density.
// At pressure p: the drop only, where the slope of dH is a true heat capacity.
function billTable(g, box, T, held) {
  const cols = held
    ? [['drop', 'water', D.box], ['drop', 'no bonds', D.off], ['hole', 'water', O.box], ['hole', 'no bonds', O.off]]
    : [['drop', 'water', D.on], ['drop', 'no bonds', D.press]];
  const rows = held ? [['ΔG', 'dG'], ['ΔU', 'dU'], ['−TΔS', 'mTdS']] : [['ΔG', 'dG'], ['ΔU', 'dU'], ['pΔV', 'pdV'], ['−TΔS', 'mTdS'], ['ΔCp', 'cp']];
  const left = Math.min(52, box.w * 0.16);
  const cw = (box.w - left) / cols.length;
  const rh = Math.min(held ? 34 : 24, (box.h - 34) / rows.length);
  text(g, held ? 'box held at the density of water' : 'at pressure p', box.x, box.y + 12, { color: 'rgba(16,29,56,.65)' });
  cols.forEach(([what, name], i) => text(g, held ? `${what}, ${name}` : name, box.x + left + cw * (i + 0.5), box.y + 27, { align: 'center', font: held && box.w < 420 ? "500 11px 'Zen Kaku Gothic New', system-ui, sans-serif" : FONT }));
  rows.forEach(([name, key], r) => {
    const y = box.y + 32 + r * rh;
    if (r % 2 === 0) { g.fillStyle = 'rgba(16,29,56,.06)'; g.fillRect(box.x, y, box.w, rh); }
    const col = key === 'cp' ? RED : INK;
    text(g, name, box.x + 2, y + rh * 0.68, { color: col });
    cols.forEach(([, , tab], i) => {
      const v = byT(tab, T, key);
      const shown = key === 'cp' ? `${v >= 0 ? '+' : ''}${v.toFixed(0)} k` : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
      text(g, shown, box.x + left + cw * (i + 0.5), y + rh * 0.68, { align: 'center', color: col });
    });
  });
}

export const theBill = {
  id: 'bill',
  ch: 1,
  title: 'The bill',
  lede: 'Dissolving oil costs free energy. Who pays? Read the bill at several temperatures, then read it in a held box, for this drop and for an empty hole, with bonds and without.',
  goals: ['Read ΔH and −TΔS at both ends.', 'Say which term pays for the drop, how far ΔG moves, and who pays for a cold hole.', 'Find both crossings, −TΔS = 0 and ΔH = 0, to within 0.01, and the deepest contact.'],
  note: {
    formula: 'ΔG = ΔU + pΔV − TΔS, &nbsp; dΔH = T dΔS at constant p, &nbsp; ΔC<sub>p</sub> = dΔH/dT',
    text: `What is general is the free energy of restricting water: about the same with or without bonds at the same density. Its split into energy and entropy depends on temperature and on the solute. From kT 0.22 up, room in a dense liquid explains most of it. Near kT 0.18 the structure of water matters too. In a held box −TΔS pays ${pct(minPay, 1)}% or more of this drop’s bill, but only because the drop’s attraction cancels the energy of rearranging water: ${at(D.box, 0.18, 'usw').toFixed(2)} against +${(at(D.box, 0.18, 'dU') - at(D.box, 0.18, 'usw')).toFixed(2)} at kT 0.18. For an empty hole in cold water, about ${pct(at(O.box, 0.18, 'dU'), at(O.box, 0.18, 'dG'))}% of the price is ΔU. On heating, ΔH and TΔS must move together; the surprise is how large ΔCp is. That swing comes from water’s thermal pressure, which rises from zero at the density maximum and needs bonds (Cerdeiriña and Debenedetti 2016, 2018). Contact between drops is weakest in the cold, while a pair with a water between it gains, which is one picture of how cold can unfold a protein.`,
    honest: `All bill numbers are stored, from long insertion runs at a fixed point in the liquid, and tagged so. The shell counts you see are live. ΔH is the direct average, lightly smoothed, and agrees with the Gibbs–Helmholtz slope of ΔG/T to about 0.1 ε from kT 0.18 to 0.28; the coldest point differs by 0.18 ε. ΔU and pΔV are fixed-concentration values (Ben-Naim), not partial molar ones: at kT 0.24 this ΔH is ${at(D.on, 0.24, 'dH').toFixed(2)} and the partial molar value is ${at(D.on, 0.24, 'Hbar').toFixed(2)}. Cold hole energies are noisy, ±${at(O.box, 0.18, 'errU').toFixed(2)} at kT 0.18. −TΔS over ΔG at kT 0.18 varies a great deal with the solute: ${pct(at(INSERT.e05.box, 0.18, 'mTdS'), at(INSERT.e05.box, 0.18, 'dG'))}% for weak attraction, ${pct(at(D.box, 0.18, 'mTdS'), at(D.box, 0.18, 'dG'))}% for this drop, ${pct(at(INSERT.wca.box, 0.18, 'mTdS'), at(INSERT.wca.box, 0.18, 'dG'))}% for a purely repulsive one. Bonds on against off at one temperature is a separate question: Yu and Karplus (1988) argued that water’s energy and entropy of rearrangement cancel exactly, and Thompson et al. (2026) show that this is not correct. Insertion here is from vacuum, while Kauzmann’s claim is about transfer from oil to water; another standard state shifts ΔS and the crossings. At p = 0.19 the model is above its critical pressure, so it never boils: it thins smoothly into an expanded fluid, 30% less dense by kT 0.30. pV/NkT is about 1 here, unlike real water, so pΔV is large. ΔCp falls away and turns negative above about kT 0.25. There is no fair conversion of kT to °C. Real hydrocarbon transfer goes from entropy-driven near 22 °C to enthalpy-driven near 113 °C (Baldwin 1986), the same order as here.`,
  },
  async run(b) {
    const TAB = INSERT[1].on;
    const start = 0.17;
    b.heat(heatOf(start));
    b.pattern(true);
    const lab = liveWater(b, { T: start, n: 150, solutes: [{ x: 0.5, y: 0.5, s: 1 }], area: 1 });
    const { w } = lab;
    const sol = w.solutes[0];
    const near = new Ring(0, SHELL_CUT);
    const far = new Ring(0.9, SHELL_CUT);
    b.each(() => {
      markShell(lab, SHELL_CUT);
      near.sample(w, sol.x, sol.y, lab.view.bond);
      far.sample(w, sol.x + w.L / 2, sol.y + w.L / 2, lab.view.bond);
    });
    b.draw((r) => drawSolutes(b, lab, r));
    const pts = [];
    const atT = () => ({ T: w.T, dH: byT(TAB, w.T, 'dH'), m: byT(TAB, w.T, 'mTdS'), dG: byT(TAB, w.T, 'dG'), pdV: byT(TAB, w.T, 'pdV') });
    const reveal = { curve: false };
    const sunMark = (g, a) => {
      const x = a.fx(w.T);
      g.strokeStyle = OCHRE; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, a.bot); g.lineTo(x, a.bot - a.H); g.stroke();
    };
    const curves = (g, box) => {
      const a = axes(g, box, { xmin: 0.17, xmax: 0.30, ymin: -0.8, ymax: 1.3, xlabel: 'kT', ylabel: 'ε' });
      if (reveal.curve) {
        curve(g, a, TAB.map((p) => [p.T, p.dH]), { color: BLUE, width: 1.6 });
        curve(g, a, TAB.map((p) => [p.T, p.mTdS]), { color: RED, width: 1.6 });
        curve(g, a, TAB.map((p) => [p.T, p.dG]), { color: INK, width: 2.2 });
      }
      for (const p of pts) {
        dot(g, a, p.T, p.dH, { color: BLUE });
        dot(g, a, p.T, p.m, { color: RED });
        dot(g, a, p.T, p.dG, { color: INK, r: 3 });
      }
      sunMark(g, a);
      text(g, 'ΔH', a.left + 44, box.y + 12, { color: BLUE });
      text(g, '−TΔS', a.left + 72, box.y + 12, { color: RED });
      text(g, 'ΔG', a.left + 116, box.y + 12, { color: INK });
    };
    b.chart(curves);
    b.sun({ min: 0.17, max: 0.3, value: start, fmt: (v) => `kT ${v.toFixed(3)}`, on: (v) => { setT(b, lab, v, 1); near.reset(); far.reset(); } });
    const live = () => `${LIVE} kT <b>${w.T.toFixed(3)}</b>, shell bonds <b>${near.perWater.toFixed(2)}</b>, bulk <b>${far.perWater.toFixed(2)}</b>. Bill ${STORED}`;
    b.read(live);
    const take = () => { const v = atT(); pts.push(v); b.sound.pluck(7, 0.3); return v; };
    b.say('It is cold. Dissolving this drop costs free energy. Which term pays the bill here?');
    const guess = await b.ask(['enthalpy', 'entropy']);
    await b.go('Read the long run');
    const cold = take();
    b.say(`Cold: ΔH is ${cold.dH.toFixed(2)}, −TΔS is +${cold.m.toFixed(2)}. Entropy pays here.`);
    await b.wait(1.2);
    b.say('Drag the sun along the top of the print to the hot end, past kT 0.27.');
    await b.until(() => w.T > 0.27);
    await b.go('Read the long run');
    const hot = take();
    b.say(`Hot: ΔH is +${hot.dH.toFixed(2)}, −TΔS is ${hot.m.toFixed(2)}. It flipped, and ${Math.round((hot.pdV / hot.dH) * 100)}% of this ΔH is pressure work pΔV, which real water at 1 atm barely pays.`);
    await b.wait(1.4);
    const swing = hot.dH - cold.dH;
    b.say(`ΔH moved by ${swing.toFixed(2)} ε between your two readings. How far did ΔG move?`);
    const q = await b.ask(['about as far', 'about half as far', 'hardly at all']);
    reveal.curve = true;
    const moved = Math.max(...TAB.map((p) => p.dG)) - Math.min(...TAB.map((p) => p.dG));
    b.say(`ΔG stays within ${moved.toFixed(2)} ε across the range. On heating, ΔH and TΔS must move together: that is thermodynamics. The surprise is how large ΔCp is.`);
    await b.wait(2.4);
    await b.go('Where does the swing come from?');
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 0.17, xmax: 0.30, ymin: -0.6, ymax: 2.2, xlabel: 'kT', ylabel: 'ε' });
      curve(g, a, D.press.map((p) => [p.T, p.TgV]), { color: OCHRE, width: 1.6 });
      curve(g, a, D.on.map((p) => [p.T, p.Hbar]), { color: BLUE, width: 1.6 });
      curve(g, a, D.on.map((p) => [p.T, p.TgV]), { color: RED });
      curve(g, a, D.box.map((p) => [p.T, p.dU]), { color: INK, width: 1.6 });
      sunMark(g, a);
      text(g, 'thermal pressure', a.left + 44, box.y + 12, { color: RED });
      text(g, 'same, no bonds', a.left + 148, box.y + 12, { color: OCHRE });
      text(g, 'ΔH', a.left + 44, box.y + 25, { color: BLUE });
      text(g, 'held-box ΔU', a.left + 76, box.y + 25, { color: INK });
    });
    b.say('The swing comes from water’s thermal pressure, which rises from zero at the density maximum and needs bonds. Held-box ΔU stays near zero.');
    b.read(() => `${STORED} thermal pressure term Tγ·v̄ and partial molar ΔH. The held box is at the same state, and its −TΔS never changes sign.`);
    await b.wait(2.6);
    await b.go('Find the crossings');
    b.chart(curves);
    b.read(live);
    b.say('Now find where each curve crosses zero: first −TΔS, by the sun. Press Here at the crossing.');
    let done = false;
    const mark = { tH: null, tS: null };
    const zero = (key) => { for (let i = 1; i < TAB.length; i++) { const a = TAB[i - 1], c = TAB[i]; if (a[key] * c[key] <= 0) return a.T + ((c.T - a.T) * a[key]) / (a[key] - c[key]); } return 0.2; };
    const tS = zero('mTdS'), tH = zero('dH');
    b.flags.tS = tS; b.flags.tH = tH;
    let step = 0;
    b.button('Here', () => {
      if (step === 0) { mark.tS = w.T; b.say(`−TΔS crosses zero at kT ${tS.toFixed(3)}; you said ${w.T.toFixed(3)}. Now find where ΔH crosses zero.`); step = 1; b.sound.pluck(8, 0.3); } else { mark.tH = w.T; done = true; }
    }, { quiet: false });
    await b.until(() => done);
    b.clear();
    const small = CROSS[0.7];
    b.say(`At the density maximum ΔH equals the held-box ΔU. Above it, thermal pressure lifts ΔH. Where it crosses zero depends on the solute: kT ${tH.toFixed(2)} for this drop, ${small.toFixed(2)} for a smaller one.`);
    await b.wait(2.8);
    b.say('Real hydrocarbons run the same way: entropy-driven near 22 °C, enthalpy-driven near 113 °C. This bill starts from vacuum; Kauzmann’s starts from oil.');
    b.read(() => `${LIT} Baldwin 1986. The order of the crossings matches; the reference state does not.`);
    await b.wait(2.6);
    await b.go('Open the bill');
    let billT = 0.18;
    let held = true;
    b.chart((g, box) => billTable(g, box, billT, held));
    setT(b, lab, billT, 1);
    near.reset(); far.reset();
    b.sunCtl.value = billT;
    b.sunCtl.on = (v) => { billT = v; setT(b, lab, v, 1); near.reset(); far.reset(); };
    const readHeld = () => `${STORED} kT <b>${billT.toFixed(2)}</b>, in ε, hole R = 1. Hole ΔU ± ${at(O.box, billT, 'errU').toFixed(2)}.`;
    b.read(readHeld);
    b.say('The bill in a box held at the density of water, for this drop and for an empty hole. In cold water, who pays for the hole?');
    const pays = await b.ask(['ΔU, the energy', '−TΔS, the entropy']);
    b.say(`ΔU: ${pct(at(O.box, 0.18, 'dU'), at(O.box, 0.18, 'dG'))}% of the price of a cold hole. Without bonds it is all −TΔS. Now move the sun to kT 0.26 and read the hole again.`);
    await b.until(() => billT >= 0.25);
    b.say(`At kT ${billT.toFixed(2)} −TΔS pays for the hole in water too. Who pays changes with temperature.`);
    await b.wait(2);
    await b.go('And this drop?');
    b.sunCtl.set(0.18);
    b.say('The price of room is about the same with or without bonds. Who pays differs: entropy in a bondless fluid, energy in cold water. This drop’s own attraction cancels that energy.');
    b.read(() => `${STORED} kT 0.18: solute–water ${at(D.box, 0.18, 'usw').toFixed(2)}, water rearranging +${(at(D.box, 0.18, 'dU') - at(D.box, 0.18, 'usw')).toFixed(2)}.`);
    await b.wait(3);
    await b.go('Now at constant pressure');
    held = false;
    b.sunCtl.set(0.2);
    b.say('At pressure p the bondless fluid swells, so it charges much less, and pΔV shows up. Which row is the true fingerprint of bonds?');
    b.read(() => `${STORED} kT <b>${billT.toFixed(2)}</b>, in ε. ΔCp is the slope of ΔH with T.`);
    await b.ask(['ΔG', 'pΔV', 'ΔCp'], {});
    const onCp = at(D.on, 0.2, 'cp'), offCp = at(D.press, 0.2, 'cp');
    b.say(`ΔCp. At kT 0.20 it is about +${onCp.toFixed(0)} k with bonds and about +${offCp.toFixed(0)} k without. The swing in ΔH needs bonds. The cost of room needs bonds only through density.`);
    await b.wait(3);
    await b.go('What about two drops?');
    const on = PMF.on, off = PMF.off;
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 0.18, xmax: 0.28, ymin: -0.45, ymax: 0, xlabel: 'kT', ylabel: 'W, ε', zero: false });
      curve(g, a, off.map((p) => [p.T, p.contact]), { color: OCHRE, width: 1.6 });
      curve(g, a, on.map((p) => [p.T, p.separated]), { color: BLUE, dash: [5, 3] });
      curve(g, a, on.map((p) => [p.T, p.contact]), { color: RED });
      on.forEach((p) => { g.fillStyle = RED; g.fillRect(a.fx(p.T) - 1, a.fy(p.contact - p.err), 2, Math.max(1, a.fy(p.contact + p.err) - a.fy(p.contact - p.err))); });
      sunMark(g, a);
      text(g, 'contact', a.left + 44, box.y + 12, { color: RED });
      text(g, 'contact, no bonds', a.left + 94, box.y + 12, { color: OCHRE });
      text(g, 'water between', a.left + 208, box.y + 12, { color: BLUE });
    });
    b.say('Two drops. Red is the depth of contact, the blue dashes a pair with one water between them. Put the sun where contact is deepest.');
    b.read(() => `${STORED} kT <b>${billT.toFixed(2)}</b>. Bars show the spread between runs.`);
    const best = on.reduce((m, p) => (p.contact < m.contact ? p : m));
    b.flags.best = best.T;
    let found = false;
    b.button('Here', () => { found = Math.abs(billT - best.T) <= 0.03; b.flags.quit = true; }, { quiet: false });
    await b.until(() => b.flags.quit);
    b.clear();
    b.say(`Deepest near kT ${best.T.toFixed(2)}. When cold, contact weakens and a water slips in: one picture of how cold can unfold proteins.`);
    await b.wait(3);
    const crossings = Math.abs(mark.tS - tS) <= 0.01 && Math.abs(mark.tH - tH) <= 0.01;
    return { seals: 1 + (guess === 1 && q === 2 && pays === 0 ? 1 : 0) + (crossings && found ? 1 : 0), score: `Crossings at kT ${tS.toFixed(3)} and ${tH.toFixed(3)}. You marked ${mark.tS.toFixed(3)} and ${mark.tH.toFixed(3)}.` };
  },
};

export const smallLarge = {
  id: 'smalllarge',
  ch: 1,
  title: 'Small and large',
  lede: 'A small hole fits inside the water network. A large one cannot. Grow a hole in live water, watch the waters on its wall, and find out what really changes with size.',
  goals: ['Measure how the work scales for small holes.', 'Say how it scales for large ones, before you measure.', 'Find the radius where wall waters first lose bonds, to within 0.15.'],
  note: {
    formula: 'small: ΔG ∝ R² &nbsp;&nbsp; large: ΔG ≈ p π R² + 2π R γ',
    text: 'Small holes cost about their area in any dense fluid. This water pays an extra surface cost that grows up to R ≈ 1.3 and then holds; a bondless fluid at this density pays almost none. Wall waters lose bonds beyond R ≈ 1, but the cost starts earlier: at R = 0.85 it is already about 60% of the plateau while wall bonds still exceed bulk, so broken bonds are only part of it. Real water near coexistence goes further and dries, forming a vapour-like layer (Lum, Chandler and Weeks 1999). This model stays wet at the wall, so it shows the surface cost, not the drying.',
    honest: 'The cost curves are stored, from hard cavities in long runs (100,000 sweeps of 300 waters), using the density at the wall (reversible work theorem), started from the exact value at the smallest hole. The bond count near the wall is live. The contact theorem keeps the density at a large wall at or above p/kT, so no vapour layer can form at this pressure. It is a 2D toy: its area is our volume and its perimeter is our surface. One model unit is about 2.8 Å if a bond is one unit, so the plateau from R ≈ 1.3 is a hole about 0.7 nm across. That is a matter of scale, not a prediction.',
  },
  async run(b) {
    const T = 0.18;
    b.heat(heatOf(T));
    b.pattern(true);
    const TAB = CAVITY[T];
    const OFF = CAVOFF[T].rows;
    const n = 150;
    const size = (R) => Math.sqrt((n + rhoAt(T) * Math.PI * R * R) / rhoAt(T));
    let R = 0.5;
    const lab = liveWater(b, { T, n, solutes: [{ x: 0.5, y: 0.5, hard: R }], area: 0.8 });
    const { w } = lab;
    const sol = w.solutes[0];
    setBox(b, lab, size(R));
    const WALL = 0.45; // The same layer the long runs count.
    let layer = new Ring(R, R + WALL);
    const far = new Ring(0.9, SHELL_CUT);
    b.each(() => {
      markShell(lab, SHELL_CUT);
      layer.sample(w, sol.x, sol.y, lab.view.bond);
      far.sample(w, sol.x + w.L / 2, sol.y + w.L / 2, lab.view.bond);
    });
    const grow = (r) => {
      R = r;
      sol.hard = r;
      setBox(b, lab, size(r));
      w.clearHard();
      layer = new Ring(r, r + WALL);
      far.reset();
    };
    b.draw((r) => {
      const [x, y] = b.px(sol.x, sol.y);
      r.disk(x, y, (R - 0.1) * b.scale, [0.86, 0.68, 0.34]);
    });
    const Gof = (q) => { const k = TAB.findIndex((p) => p.R >= q); if (k < 0) return TAB[TAB.length - 1].G; if (k === 0) return (TAB[0].G * q * q) / (TAB[0].R * TAB[0].R); const a = TAB[k - 1], c = TAB[k]; return a.G + ((c.G - a.G) * (q - a.R)) / (c.R - a.R); };
    const skin = (q) => (Gof(q) - P * Math.PI * q * q) / (2 * Math.PI * q);
    const surf = [];
    for (let q = 0.3; q <= 5; q += 0.1) surf.push([q, skin(q)]);
    const showBonds = { on: false };
    b.chart((g, box) => {
      if (showBonds.on) {
        const a = axes(g, box, { xmin: 0, xmax: 3.2, ymin: 1.2, ymax: 2.5, xlabel: 'hole radius R', ylabel: 'bonds per wall water', zero: false });
        curve(g, a, TAB.map((p) => [p.R, p.bonds]), { color: BLUE });
        curve(g, a, TAB.map((p) => [p.R, p.far]), { color: INK, dash: [4, 3], width: 1.4 });
        if (layer.waters > 60) dot(g, a, R, layer.perWater, { color: RED, r: 4.5 });
        return;
      }
      const a = axes(g, box, { xmin: 0, xmax: 5, ymin: -0.01, ymax: 0.16, xlabel: 'hole radius R', ylabel: 'cost per length of wall', zero: false });
      curve(g, a, OFF.map((p) => [p.R, p.skin]), { color: OCHRE });
      curve(g, a, surf, { color: RED });
      dot(g, a, R, skin(R), { color: INK, r: 4.5 });
      text(g, 'water', a.left + 44, box.y + 12, { color: RED });
      text(g, 'no bonds, same density', a.left + 86, box.y + 12, { color: OCHRE });
    });
    b.say('The ochre hole keeps water out, and that is all it does. Move R and read the work of opening it.');
    b.slider({ label: 'R', min: 0.3, max: 3, value: R, step: 0.05, fmt: (v) => v.toFixed(2), on: grow });
    b.read(() => `${STORED} R <b>${R.toFixed(2)}</b>, work to open it <b>${Gof(R).toFixed(2)} ε</b>`);
    await b.wait(0.5);
    b.say('Set R to 0.5, then to 1.0, and read the work each time. Doubling R multiplies it by how much?');
    await b.until(() => Math.abs(R - 1) < 0.04, 0.3);
    const smallRatio = Gof(1) / Gof(0.5);
    const offRatio = OFF.find((p) => p.R === 1).G / OFF.find((p) => p.R === 0.5).G;
    b.say(`Twice the radius, ${smallRatio.toFixed(1)} times the work, and ${offRatio.toFixed(1)} times with no bonds. Small holes go with area in any dense fluid. From 2 to 4?`);
    const guess = await b.ask(['×4 again', '×2, with only the wall counting']);
    const big = (Gof(4) - P * Math.PI * 16) / (Gof(2) - P * Math.PI * 4);
    b.say(`After taking off the plain pressure work p·πR², it is ×${big.toFixed(1)}. Big holes in water pay for their wall, and the red curve levels off.`);
    await b.wait(1.5);
    b.say('The ochre curve stays near zero: with no bonds a wall costs almost nothing beyond pressure. Now look at the bonds at the wall.');
    await b.wait(2);
    showBonds.on = true;
    b.say('The blue line is bonds per wall water, the dashes are bulk. Move R, and give the red dot a few seconds. Find where wall waters first fall below bulk.');
    b.read(() => `${LIVE} R <b>${R.toFixed(2)}</b>, wall bonds <b>${layer.perWater.toFixed(2)}</b>, bulk ${far.perWater.toFixed(2)}. Curves: ${STORED}`);
    const zero = (() => { for (let i = 1; i < TAB.length; i++) if (TAB[i].bonds < TAB[i].far) { const a = TAB[i - 1], c = TAB[i]; const u = a.bonds - a.far, v = c.bonds - c.far; return a.R + ((c.R - a.R) * u) / (u - v); } return 1; })();
    b.flags.zero = zero;
    let solved = false;
    let pressed = false;
    b.button('Here', () => { pressed = true; solved = Math.abs(R - zero) <= 0.15; }, { quiet: false });
    await b.until(() => pressed);
    b.clear();
    b.say(`Wall bonds fall below bulk at R ≈ ${zero.toFixed(2)}. The surface cost began earlier, so broken bonds are only part of it.`);
    await b.wait(2.5);
    b.say('Real water near coexistence goes further and dries at a large wall. This model stays wet, so it shows the cost, not the drying.');
    await b.wait(2.5);
    return { seals: 1 + (guess === 1 ? 1 : 0) + (solved ? 1 : 0), score: `In this model: bonds fall at R ≈ ${zero.toFixed(2)}, surface cost levels off from R ≈ 1.3.` };
  },
};
