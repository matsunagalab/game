// Forces with no energy in them at all: crowding, released counter-ions, and a chain counting its shapes.
import { Disks } from '../sim/disks.js';
import { walkTable, loopClosure } from '../sim/exact.js';
import { axes, curve, dot, tag, text, BLUE, RED, INK, OCHRE } from '../charts.js';
import { LIVE, EXACT, TOY, STORED } from '../bench.js';
import { LB } from '../sim/ions.js';
import { CROWD } from '../sim/disktable.js';
import { clamp } from './common.js';

// Peak of the wedged-crowder push, and the dilute formula at contact, for the notes.
const PEAK = CROWD.rows.reduce((m, r) => (r.F > m.F ? r : m));
const AO_CONTACT = (CROWD.n / CROWD.L ** 2) * 2 * Math.sqrt((CROWD.big + CROWD.small) ** 2 - CROWD.rows[0].d ** 2 / 4);

export const depletion = {
  id: 'depletion',
  ch: 5,
  title: 'Forced together by crowding',
  lede: 'Nothing in this box has any energy. Disks simply cannot overlap. Hold two big disks among small crowders, and read the force the crowders put on them.',
  goals: ['Say what crowders do to two big disks, before you measure.', 'Read the pull at contact and the push further out.', 'Find the distance where the pull turns into a push, to within 0.2.'],
  note: {
    formula: 'W(d) = − kT ρ A<sub>overlap</sub>(d) &nbsp; (dilute crowders, 2D)',
    text: 'Each big disk has a skin that crowder centres cannot enter. When two skins overlap, that area is handed back to the crowders, and they gain room. The crowders then hit the disks more on the outside than in the gap, and that imbalance is the pull you read: pure entropy, with no attraction anywhere. Dense crowders go further: a single crowder wedged in the gap pushes the disks apart. Part of the hydrophobic push is this same packing physics: in the water model, a bondless fluid at the same density reaches half to most of the contact depth.',
    honest: `Live hard-disk Monte Carlo in 2D, 175 crowders, area fraction 47%, with both big disks held still, so the reading does not depend on slow disks. The hand re-places any crowder it would overlap. The force comes from crowders in a thin skin around each disk. The grey long-run line uses skins of 0.02 and 0.04; the live skin of 0.07 reads the sharpest peak at about ${Math.round((PEAK.live / PEAK.F) * 100)}% of its height. Asakura–Oosawa (1954) is a dilute limit: at this density the real pull at contact is about ${(-CROWD.rows[0].F / AO_CONTACT).toFixed(1)} times the formula, and the push near d = 7.4 is beyond it. The statement about water comes from the bonds-off control in Two drops.`,
  },
  async run(b) {
    const { L, big, small, n, rows } = CROWD;
    b.world(L);
    b.pattern(false);
    b.heat(0.3);
    const box = new Disks({ L, big, small, nSmall: 0 });
    box.frozen = true;
    let d = 6.3;
    let target = d;
    const place = () => { box.bx = [L / 2 - d / 2, L / 2 + d / 2]; box.by = [L / 2, L / 2]; };
    place();
    const NB = 21;
    const bin = (v) => clamp(Math.round((v - 6.04) / 0.2), 0, NB - 1);
    const sum = new Array(NB).fill(0), cnt = new Array(NB).fill(0), work = new Array(NB).fill(0);
    let now = 0, nowN = 0;
    let moving = 0; // Sweeps of settling left after the disks moved.
    const pace = b.pace;
    pace.limit = 60;
    b.each(() => {
      if (Math.abs(target - d) > 1e-3) {
        const s = clamp(target - d, -0.05, 0.05);
        d += s;
        box.bx[0] = L / 2 - d / 2; box.bx[1] = L / 2 + d / 2;
        box.freeBigShoving(0, box.bx[0], box.by[0]);
        box.freeBigShoving(1, box.bx[1], box.by[1]);
        moving = 500;
        now = 0; nowN = 0;
      }
      const c = pace.run((k) => box.sweep(k));
      if (moving > 0) { moving -= c; return; }
      if (!box.n) return;
      const f = box.skinForce(0.07);
      now += f; nowN++;
      const k = bin(d);
      if (Math.abs(6.04 + k * 0.2 - d) < 0.06) { sum[k] += f; cnt[k]++; work[k] += c; }
    });
    const force = () => (nowN ? now / nowN : 0);
    const AO = (q) => { const R = big + small; return q >= 2 * R ? 0 : -(box.n / (L * L)) * 2 * Math.sqrt(R * R - q * q / 4); };
    b.draw((r) => {
      const s = b.scale;
      const R = (big + small) * s;
      for (let k = 0; k < 2; k++) { const [x, y] = b.px(box.bx[k], box.by[k]); r.halo(x, y, R * 1.03, [0.86, 0.66, 0.32], 0.5); }
      for (let i = 0; i < box.n; i++) { const [x, y] = b.px(box.x[i], box.y[i]); r.bead(x, y, small * s * 1.05, [0.2, 0.33, 0.52]); }
      for (let k = 0; k < 2; k++) { const [x, y] = b.px(box.bx[k], box.by[k]); r.disk(x, y, big * s, [0.78, 0.3, 0.16]); }
    });
    b.over((g) => {
      if (!box.n || nowN < 10) return;
      const [cx, cy] = b.px(L / 2, L / 2);
      const f = force();
      const w = clamp(f * 16, -90, 90);
      const y = cy - big * b.scale - 26;
      g.fillStyle = f < 0 ? '#c8402a' : '#1b3f6b';
      g.fillRect(Math.min(cx, cx + w), y, Math.abs(w), 11);
      tag(g, f < -0.4 ? 'pulled together' : f > 0.4 ? 'pushed apart' : 'no net force', cx, y - 7);
    });
    const chart = (g, q) => {
      const a = axes(g, q, { xmin: 6, xmax: 10, ymin: -6, ymax: 5.5, xlabel: 'distance between disk centres', ylabel: 'force, kT per unit' });
      curve(g, a, rows.map((r) => [r.d, r.F]), { color: 'rgba(16,29,56,.4)', width: 1.4 });
      const ao = [];
      for (let v = 6; v <= 10; v += 0.05) ao.push([v, AO(v)]);
      curve(g, a, ao, { color: OCHRE, dash: [4, 3], width: 1.5 });
      sum.forEach((v, i) => { if (cnt[i] > 8) dot(g, a, 6.04 + i * 0.2, v / cnt[i], { color: RED, r: 3.5 }); });
      if (box.n) dot(g, a, d, force(), { color: INK, r: 3 });
      text(g, 'long run', a.left + 40, q.y + 12, { color: INK });
      text(g, 'dilute formula', a.left + 100, q.y + 12, { color: OCHRE });
    };
    b.read(() => `${LIVE} crowders <b>${box.n}</b>, distance <b>${d.toFixed(2)}</b>, force <b>${force().toFixed(1)} kT</b> per unit. Grey line ${STORED}`);
    b.say('Red disks are held still. The pale zone is the skin crowder centres cannot enter. With no crowders, nothing pushes them.');
    await b.wait(1.2);
    b.say('Now fill the box with crowders. There is no attraction in this world. What will crowders do to the pair?');
    const guess = await b.ask(['nothing: no energy, no force', 'push the big disks together', 'push the big disks apart']);
    box.setCrowd(n);
    box.sweep(300);
    moving = 500;
    now = 0; nowN = 0;
    b.chart(chart);
    b.say('Crowders fill the box. They strike the outer sides of the disks but cannot reach the gap.');
    await b.until(() => nowN > 60);
    const pull = force();
    b.say(`At this gap the crowders pull with ${(-pull).toFixed(1)} kT per unit. No energy, only room: closing the gap gives crowders more of it.`);
    await b.wait(1.5);
    b.onDrag({
      hit: () => 1,
      move: (_, x) => { target = clamp(2 * Math.abs(x - L / 2), 6.04, 10); target = 6.04 + Math.round((target - 6.04) / 0.2) * 0.2; },
    });
    b.flags.setD = (v) => { target = v; };
    b.say('Drag on the print to pull the disks apart, step by step. Each red dot needs a moment. Fill in five or more.');
    await b.until(() => work.filter((c) => c > 1200).length >= 5);
    b.say('Between pull and push there is a turning point. Stop where the force goes from pull to push, then press Here.');
    const zero = (() => { for (let i = 1; i < rows.length; i++) if (rows[i - 1].F < 0 && rows[i].F >= 0) return rows[i - 1].d + (0.2 * -rows[i - 1].F) / (rows[i].F - rows[i - 1].F); return 7.2; })();
    b.flags.zero = zero;
    let solved = false;
    let pressed = false;
    b.button('Here', () => { pressed = true; solved = Math.abs(d - zero) <= 0.2; }, { quiet: false });
    await b.until(() => pressed);
    b.clear();
    b.say(`The long run turns at d = ${zero.toFixed(1)}. Further out, a crowder wedged in the gap pushes hardest near d = ${PEAK.d.toFixed(1)}: no simple attraction has that.`);
    await b.wait(2.5);
    const contact = rows[0];
    b.say(`Contact well: ${contact.W.toFixed(1)} kT. In the water model, a bondless fluid at the same density reaches half to most of the contact depth.`);
    await b.wait(2.5);
    return { seals: 1 + (guess === 1 ? 1 : 0) + (solved ? 1 : 0), score: `Pull at contact: about ${(-rows[0].F).toFixed(1)} kT per unit, against ${(-AO(6.04)).toFixed(1)} from the dilute formula.` };
  },
};

const PSI = 0.88;
const MYSTERY = [{ name: 'A', z: 4 }, { name: 'B', z: 7 }, { name: 'C', z: 10 }];

export const release = {
  id: 'release',
  ch: 5,
  title: 'Counter-ions go free',
  lede: 'DNA is wrapped in a cloud of bound positive ions. A protein that lands on it sets them free. Much of the binding free energy can be the entropy of those ions, not the bond.',
  goals: ['Find where a line of charges stops holding ions, and see them fly off.', 'Say what low salt does to binding, and why.', 'Measure three mystery proteins and name how many charges each one lands with.'],
  note: {
    formula: 'd log K / d log[salt] = − Z ψ, &nbsp; ψ = 0.88 for B-DNA',
    text: 'Charges on DNA sit 1.7 Å apart, well inside the Bjerrum length of 7.1 Å, so the line holds a cloud of cations close by. When a protein lands with Z charges, about Zψ ions go back to the bulk, where they have more room. The less salt in the bulk, the more room each freed ion gains, so binding gets stronger at low salt. Measuring the slope counts ions without ever seeing one.',
    honest: 'The straight line is the Record–Lohman thermodynamic model, with K₀ invented. The ion cartoon frees exactly Zψ ions and is for counting, not a simulation, and the proteins are invented. Manning\'s count gives 0.76 per phosphate; ψ = 0.88 is the value usually used for long B-DNA, shorter DNA gives lower values, and real slopes also include anion and water effects.',
  },
  async run(b) {
    b.world(10);
    b.pattern(true);
    b.heat(0.3);
    let salt = 0.1;
    let prot = MYSTERY[0];
    let down = 0;
    const logK0 = 2;
    const logK = (s, p) => logK0 - p.z * PSI * Math.log10(s);
    const y0 = 7;
    const ions = Array.from({ length: 22 }, (_, i) => ({ x: 0.6 + (i * 8.8) / 21, y: y0 + 0.7, free: 0, vx: 0, vy: 0 }));
    // Ions nearest the landing site leave first, and exactly Z psi of them leave.
    [...ions].sort((p, q) => Math.abs(p.x - 5) - Math.abs(q.x - 5)).forEach((p, k) => { p.rank = k; });
    b.each((dt) => {
      const on = down > 0.8;
      const wide = (prot.z * PSI) / 2 + 0.8;
      ions.forEach((p) => {
        const under = on && p.rank < Math.round(prot.z * PSI);
        if (under && !p.free) { p.free = 1; p.vx = (Math.random() - 0.5) * 2; p.vy = -2 - Math.random() * 2; b.sound.event(9, 0.15, 0, 0.05); }
        if (!under && p.free) p.free = 0;
        if (p.free) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx += (Math.random() - 0.5) * 6 * dt; p.vy += (Math.random() - 0.5) * 6 * dt;
          if (p.y < 0.6) p.vy = Math.abs(p.vy);
          if (p.y > 6) p.vy = -Math.abs(p.vy);
          if (p.x < 0.4) p.vx = Math.abs(p.vx);
          if (p.x > 9.6) p.vx = -Math.abs(p.vx);
        } else {
          p.x += ((p.home ?? (p.home = p.x)) - p.x) * Math.min(1, dt * 5);
          p.y += (y0 + 0.75 + Math.sin(b.t * 3 + p.home * 5) * 0.08 - p.y) * Math.min(1, dt * 5);
        }
      });
    });
    b.draw((r) => {
      const s = b.scale;
      const [lx, ly] = b.px(0.2, y0);
      const [rx] = b.px(9.8, y0);
      r.line(lx, ly, rx, ly, s * 0.5, [0.12, 0.2, 0.35], 1);
      for (let i = 0; i < 22; i++) { const [x, y] = b.px(0.6 + (i * 8.8) / 21, y0); r.ion(x, y, s * 0.2, false); }
      ions.forEach((p) => { const [x, y] = b.px(p.x, p.y); r.ion(x, y, s * 0.2, true, 0.95, [0.78, 0.33, 0.13]); });
      const wide = (prot.z * PSI) / 2 + 0.8;
      const [px, py] = b.px(5, 3 + down * 3.2);
      r.disk(px, py, wide * 0.5 * s, [0.84, 0.68, 0.34]);
    });
    const points = [];
    const freed = () => ions.filter((p) => p.free).length;
    const saltChart = (g, box) => {
      const a = axes(g, box, { xmin: -3, xmax: 0, ymin: 0, ymax: 28, xlabel: 'log₁₀ [salt]', ylabel: 'log₁₀ K', zero: false });
      points.forEach(([x, y]) => dot(g, a, x, y, { color: BLUE }));
      dot(g, a, Math.log10(salt), logK(salt, prot), { color: RED, r: 4.5 });
    };
    // Why are the ions bound at all? Manning: a line of charges closer than the Bjerrum length holds some.
    let spacing = 1.7;
    const held = (v) => Math.max(0, 1 - v / LB);
    b.say(`DNA carries a charge every 1.7 Å, far closer than the Bjerrum length of ${LB.toFixed(1)} Å, the distance where the pull falls to kT.`);
    b.read(() => `${TOY} Manning’s limiting law: spacing <b>${spacing.toFixed(1)} Å</b>, ions held per charge <b>${held(spacing).toFixed(2)}</b>`);
    b.slider({ label: 'spacing', min: 1, max: 12, value: 1.7, step: 0.1, fmt: (v) => `${v.toFixed(1)} Å`, on: (v) => { spacing = v; } });
    b.say('Spread the charges out. Find the spacing where the line stops holding ions. Press Here.');
    let onset = null;
    b.button('Here', () => { onset = spacing; }, { quiet: false });
    await b.until(() => onset !== null);
    const bridge = Math.abs(onset - LB) < 0.8;
    b.clear();
    b.say(`It stops at the Bjerrum length, ${LB.toFixed(1)} Å. At DNA's 1.7 Å Manning gives ${held(1.7).toFixed(2)} per phosphate; salt curves on B-DNA usually use ${PSI}.`);
    await b.wait(2.2);
    b.read(() => `${TOY} model slope, invented protein ${prot.name}, salt <b>${(salt * 1000).toFixed(0)} mM</b>, log K <b>${logK(salt, prot).toFixed(1)}</b>, ions freed ${freed()}`);
    b.chart(saltChart);
    b.say('Land the protein on those bound ions.');
    await b.go('Land it');
    const land = (v) => new Promise((res) => {
      const f = b.each((dt) => { down += clamp(v - down, -dt * 1.5, dt * 1.5); if (Math.abs(v - down) < 0.01) { b.drop(f); res(); } });
    });
    await land(1);
    b.say('Bound ions fly off, and each one gains the freedom of the whole solution.');
    await b.wait(1.5);
    b.say('If you lower the bulk salt, what happens to binding?');
    const guess = await b.ask(['weaker: fewer ions around', 'stronger: freed ions gain more room', 'no change']);
    b.say(`Stronger. The salt slider lets you measure it.`);
    b.slider({ label: 'salt', min: 1, max: 1000, value: 100, log: true, fmt: (v) => `${v.toFixed(0)} mM`, on: (v) => { salt = v / 1000; } });
    b.button('Measure', () => { points.push([Math.log10(salt), logK(salt, prot)]); b.sound.pluck(7, 0.3); });
    let score = 0;
    await b.wait(0.8);
    for (const m of MYSTERY) {
      prot = { ...m, name: m.name };
      points.length = 0;
      await land(0);
      await land(1);
      b.say(`Protein ${m.name}: measure at two salts, then work out the slope. Z = slope / 0.88.`);
      await b.until(() => points.length >= 2 && Math.abs(points[points.length - 1][0] - points[0][0]) > 0.3);
      const z = await b.ask(['Z = 4', 'Z = 7', 'Z = 10']);
      const right = [4, 7, 10][z] === m.z;
      if (right) { score++; b.sound.pluck(9, 0.3); }
      b.say(right ? `Yes, ${m.z} charges, ${(m.z * PSI).toFixed(1)} ions freed.` : `It was ${m.z}: the slope is ${(m.z * PSI).toFixed(1)}.`);
      await b.wait(1.2);
    }
    return { seals: 1 + (guess === 1 && bridge ? 1 : 0) + (score === 3 ? 1 : 0), score: `You named ${score} of 3 proteins from their salt curves alone.` };
  },
};

export const chain = {
  id: 'chain',
  ch: 5,
  title: 'A chain counts its shapes',
  lede: 'Pull a chain and it pulls back, with no bonds breaking. Heat it and it pulls harder. A chain is a counting machine.',
  goals: ['Count shapes at two extensions.', 'Predict how heat changes the pull.', 'Predict the entropy cost of closing a loop twice as long.'],
  note: {
    formula: 'S = k ln Ω, &nbsp; f = −T dS/dx, &nbsp; P<sub>loop</sub> ∝ N<sup>−3/2</sup>',
    text: 'A stretched chain has fewer shapes. Nothing resists but the count, so the force is proportional to T, the mark of an entropic spring, the same one in rubber. Closing a loop forces the two ends to meet, which costs entropy; the cost grows only as (3/2) k ln N, one reason a long loop is not much harder to close than a short one.',
    honest: 'Exact counts: every walk on a square lattice is counted one step at a time, and each chain drawn is a fair sample from them. The loop cost is an exact count of 3D cubic-lattice walks. Real chains avoid themselves and have stiffness, which change the numbers and raise the exponent, but not the idea.',
  },
  async run(b) {
    const N = 30;
    const table = walkTable(N);
    const sci = (v) => { const e = Math.floor(Math.log10(v)); return `${(v / 10 ** e).toFixed(1)} × 10^${e}`; };
    b.world(44);
    b.pattern(false);
    b.heat(0.3);
    let ex = 12, ey = 0;
    let T = 298;
    let path = [];
    const lnW = () => Math.log(table.count(N, ex, ey));
    const sample = () => {
      // Walk backward from the end, each step weighted by how many walks lead there.
      const p = [[ex, ey]];
      let x = ex, y = ey;
      for (let n = N; n > 0; n--) {
        const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([u, v]) => [x + u, y + v, table.count(n - 1, x + u, y + v)]);
        const sum = opts.reduce((s, o) => s + o[2], 0);
        let q = Math.random() * sum;
        for (const o of opts) { q -= o[2]; if (q <= 0) { [x, y] = o; break; } }
        p.push([x, y]);
      }
      return p;
    };
    let timer = 0;
    b.each((dt) => { timer -= dt; if (timer <= 0) { path = sample(); timer = 0.11; } });
    let sx = 4; // Anchor x on the print.
    b.draw((r) => {
      const c = b.L / 2;
      const s = b.scale;
      const w = 1.3;
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, ay] = b.px(sx + path[i][0] * w, c + path[i][1] * w);
        const [bx, by] = b.px(sx + path[i + 1][0] * w, c + path[i + 1][1] * w);
        r.line(ax, ay, bx, by, s * 0.42, [0.1, 0.13, 0.22], 1);
        const [cx, cy] = b.px(sx + path[i][0] * w, c + path[i][1] * w);
        r.bead(cx, cy, s * 0.42, [0.26, 0.4, 0.62]);
      }
      const [ax, ay] = b.px(sx, c);
      const [ex2, ey2] = b.px(sx + ex * w, c + ey * w);
      r.ion(ax, ay, s * 0.9, false);
      r.ion(ex2, ey2, s * 0.9, true);
    });
    const pointsX = [];
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 0, xmax: 28, ymin: 0, ymax: 42, xlabel: 'end-to-end distance', ylabel: 'ln Ω', zero: false });
      const pts = [];
      for (let x = 0; x <= 28; x += 2) pts.push([x, Math.log(table.count(N, x, 0))]);
      curve(g, a, pts, { color: BLUE });
      pointsX.forEach(([x, y]) => dot(g, a, x, y, { color: INK, r: 3 }));
      dot(g, a, ex, lnW(), { color: RED, r: 4.5 });
    });
    const force = () => {
      const x = Math.max(2, ex);
      return (0.5 * 0.0019872 * T * (Math.log(table.count(N, x - 2, ey)) - Math.log(table.count(N, x + 2, ey)))) / 2;
    };
    b.read(() => `${EXACT} shapes Ω = <b>${sci(table.count(N, ex, ey))}</b>, S/k = <b>${lnW().toFixed(1)}</b>, pull <b>${force().toFixed(2)}</b> kcal/mol per step`);
    b.say('This chain has 30 links on a grid. Each flicker is another of its possible shapes. Drag the red end out.');
    b.onDrag({
      hit: () => 1,
      move: (_, x) => {
        const v = Math.round(((x - sx) / 1.3) / 2) * 2;
        ex = clamp(v, 0, 28);
      },
    });
    await b.until(() => ex >= 24, 0.3);
    pointsX.push([ex, lnW()]);
    b.say(`Stretched, only ${sci(table.count(N, ex, 0))} shapes remain, against ${sci(table.count(N, 12, 0))} at the start.`);
    await b.wait(2);
    b.say('Hold it at the same length and heat it. What happens to the pull?');
    ex = 14;
    const guess = await b.ask(['weakens, like a heated spring', 'strengthens', 'stays']);
    const before = force();
    T = 596;
    b.heat(0.85);
    b.say(`Twice the T, twice the pull: ${before.toFixed(2)} to ${force().toFixed(2)}. Only an entropic force does this. Rubber does too.`);
    await b.wait(2.5);
    await b.go('Close a loop');
    T = 298;
    b.heat(0.3);
    ex = 0; ey = 0; sx = 22;
    const cost = (n) => 0.0019872 * 298 * Math.log(1 / loopClosure(n));
    b.say('Bring the ends together. The chance of closing is the count of closed walks over all walks.');
    const loops = [20, 40, 80, 160];
    b.chart((g, box) => {
      const a = axes(g, box, { xmin: 10, xmax: 200, ymin: 0, ymax: 6, xlabel: 'links in the loop (log)', ylabel: '−TΔS, kcal/mol', zero: false, logx: true });
      const pts = [];
      for (let n = 10; n <= 200; n += 10) pts.push([n, cost(n)]);
      curve(g, a, pts, { color: BLUE });
      loops.forEach((n) => dot(g, a, n, cost(n), { color: RED }));
    });
    b.read(() => `${EXACT} closing 40 links costs <b>${cost(40).toFixed(2)}</b> kcal/mol of entropy at 25 °C`);
    await b.wait(2);
    b.say('Now double the loop, from 40 links to 80. How much more does closing it cost?');
    const q = await b.ask(['twice as much', 'about 0.6 kcal/mol more', 'about 3 kcal/mol more']);
    const gap = cost(80) - cost(40);
    b.say(`${gap.toFixed(2)} kcal/mol more. That is (3/2) RT ln 2: a loop only costs the logarithm of its length.`);
    await b.wait(2.5);
    return { seals: 1 + (guess === 1 ? 1 : 0) + (q === 1 ? 1 : 0), score: `Doubling the loop added ${gap.toFixed(2)} kcal/mol.` };
  },
};
