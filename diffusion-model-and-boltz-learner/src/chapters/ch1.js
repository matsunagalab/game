// Chapter 1. What a generative model is, on real proteins. The model is the simplest there is: take a stored structure and add noise of one width.
// Drag the width. It is scored on structures it never saw. Level 2 has far fewer stored. Level 3 is a new protein with the score hidden.
import { adk, ubiquitin } from '../science/data.js';
import { bondError, bondLengths, scanWidths } from '../science/blur.js';
import { adkSplit, BLUR, conformerSplit, everyFourth } from '../science/levels.js';
import { bondsOf, Bundle, chainBonds, chainInk } from '../mol.js';
import { Board, fmt, plate } from './common.js';
import { makeRng } from '../science/rng.js';

const { widths: WIDTHS, near: NEAR } = BLUR;
const TAGS = ['real', 'game', 'model'];
const INK = '29, 33, 65', BLUE = '#2336a8', GREY = '#9aa0b5', RED = '#c2185b', SOFT = '#565c7c';
const GOALS = ['Drag the width until hidden conformers score best.', 'Only 4 stored now. Find the best width again.', 'New protein, score hidden. Let go at the best width.'];
const DROPS = (run) => Math.round(run.world.dropCount * 0.6);

export default {
  id: 'generate',
  puzzle: true,
  place: [3],
  title: 'Making new from old',
  tease: 'What a generative model is, tried on real proteins.',
  principle: 'A generative model draws new structures with its data\'s frequencies, judged on structures it never saw. Noise on copies scored best only with bonds broken, so real models must learn chemistry.',
  goals: GOALS,
  note: `<h3>Chapter note</h3>
    <p><b>Your move and the real thing.</b> The model is real and very simple: pick a stored structure at random and add Gaussian noise of one width σ to every coordinate. Its density is a kernel density, (1/M) Σ N(x; y_m, σ²I). This is also the data blurred by noise of size σ, which is what a diffusion model passes through at noise level σ, so the σ you drag here is the σ of every later chapter. A real generative model is not built this way, which is what the chapter shows. Structures stay in one frame, with no rotation. Chapter 6 is about rotation.</p>
    <p><b>The data.</b> Ubiquitin, 39 of the 116 conformers of PDB 2K39, an ensemble fitted to NMR residual dipolar couplings, 601 heavy atoms, so one structure is 1,803 numbers. Adenylate kinase: 22 real C-alpha chains from E. coli, 214 residues, open and closed crystal forms.</p>
    <p><b>Hidden structures.</b> Level 1 hides every fourth conformer, 10 of 39. Level 2 stores 4 and hides the other 35. Level 3 hides whole PDB entries, because chains of one crystal are near copies and would leak. Checks made for this game: the distance between two conformers does not depend on how far apart they lie in the file, the four ways of hiding every fourth conformer give the same peak, and scoring on the 77 conformers never bundled here gives the same peak as well, near 1.0 Å. So the small hidden set is honest. It is still one ensemble, so a hidden conformer comes from the same refinement as a stored one.</p>
    <p><b>Score.</b> Mean log density of the structures, in bits per atom, measured from the widest width, 8 Å. The grey line is the same score on the stored structures. It rises for ever as the width falls, because each stored structure sits on its own kernel. The blue line collapses instead, far below the chart: at 0.1 Å it is near −220 bits per atom. That gap is overfitting.</p>
    <p><b>The peak has broken bonds.</b> The hidden score peaks near 1.0 Å, and there the bonds are wrong by about 1.5 Å. Bonds in the real conformers vary by 0.006 Å. No width gives new structures and sound chemistry together. Noise of 0.05 Å is already enough for 0.07 Å of bond error. This is the curse of dimension in a form you can see: for a blur to keep bonds right, a hidden structure would have to lie within about 0.01 Å of a stored one, and no database comes close.</p>
    <p><b>A rule you can use with the score hidden.</b> A new structure lies about √3 σ from the one it came from, per atom. The peak falls about where that equals the spacing of the stored structures. For ubiquitin, 1.9 Å apart, this says 1.1 Å, against the best 1.0 Å. For all the kinase chains, 0.5 Å apart, it says 0.3 Å, and the best is 0.3 Å. This is a rule of thumb from these data, not a theorem. The reason is that the density at a hidden point is largest when the kernel is about as wide as the distance to its nearest stored neighbour.</p>
    <p><b>Less data changes less than you might expect.</b> Going from 29 stored conformers to 4 moves the peak only from about 1.0 to 1.5 Å. In many dimensions the nearest neighbour hardly gets nearer with more data. On a 2-D map of residue angles the same drop moves a histogram's best cell much further, from about 6° to about 10° when the data fall tenfold.</p>
    <p><b>Level 3.</b> Adenylate kinase, 17 chains stored and 5 hidden, then ubiquitin again with 12 conformers stored. Their spacing differs, so one width does not fit both, and a miss on the second goes back to the first, so that a lucky guess is not enough. Bonds on the kinase are the 3.8 Å steps between neighbouring C-alpha atoms.</p>
    <p><b>Scale.</b> A table of counts over two backbone angles per residue, in 6° cells, would need 10^${Math.round(Math.log10((360 / 6) ** 2) * 76)} cells for ubiquitin, against a few hundred thousand entries in the Protein Data Bank. So nobody stores the probability of a structure. The next chapters show something easier to learn: how to clean up a noisy point.</p>
    <p class="small">Lange et al., Science 320, 1471 (2008), for 2K39. Sohl-Dickstein et al., ICML 2015, for the idea of a model you can both sample and score. Vincent, Neural Comput 2011, for the blurred density.</p>`,

  setup(run) {
    const U = ubiquitin(), B = run.state.B = new Blur(run), K = adk();
    B.proteins = {
      ubq: { models: U.models, n: U.n, bonds: bondsOf(U.models[0], U.n), span: 42, ink: (a) => chainInk(U.res[a] / U.res[U.n - 1]), weight: (b) => (U.role[b[0]] && U.role[b[1]] ? 3 : 1), name: 'Ubiquitin' },
      adk: { models: K.models, n: K.n, bonds: chainBonds(K.n), span: 74, ink: (a) => chainInk(a / (K.n - 1)), name: 'Adenylate kinase' },
    };
    run.probe = { B };
    run.state.U = U; run.state.K = K;
  },
  stages: [level1, level2, level3],
};

// Scores every width for one set of stored and hidden structures.
async function scan(run, P, split) {
  const stored = split.stored.map((i) => P.models[i]), hidden = split.hidden.map((i) => P.models[i]);
  return { ...await run.budget(scanWidths(stored, hidden, WIDTHS), null, 8), storedSet: stored };
}

// The board: one real protein, one new structure from the model, and under it a chart whose axis is the drag.
class Blur {
  constructor(run) {
    this.run = run;
    const T = this.T = run.state.T = new Board(run, { span: 42 });
    T.setPanel(128, 0, 176);
    Object.assign(this, { rng: makeRng(9), k: -1, hide: false, locked: false, onDrop: null, seen: new Set() });
    T.extra.push((g) => this.draw(g));
    run.tick((dt) => this.frame(dt));
    this.lastNew = 0;
  }

  // A new protein on the board. Bundles are built once.
  use(P) {
    if (!P.bundle) {
      const { n, bonds } = P;
      P.bundle = new Bundle(this.run, { n, bonds, K: 1, drops: DROPS(this.run), weight: P.weight, seed: 3 });
      P.atomInk = new Float32Array(3 * n);
      for (let a = 0; a < n; a += 1) P.atomInk.set(P.ink(a), 3 * a);
      P.ref = bondLengths(P.models[0], bonds);
      P.strain = new Float32Array(bonds.length);
      P.noise = new Float64Array(3 * n);
      P.x = new Float64Array(3 * n);
      P.origin = (() => { const c = [0, 0, 0], m = P.models[0]; for (let i = 0; i < n; i += 1) { c[0] += m[3 * i] / n; c[1] += m[3 * i + 1] / n; c[2] += m[3 * i + 2] / n; } return c; })();
    }
    if (this.P && this.P !== P) this.P.bundle.hide();
    this.P = P;
    this.T.setSpan(P.span);
  }

  load(P, s, k) {
    this.use(P);
    Object.assign(this, { s, k: -1, seen: new Set() });
    this.fresh();
    this.set(k);
  }

  // A new draw from the model: another stored structure, other noise. Dragging keeps the same noise, so that the structure changes smoothly.
  fresh() {
    const { P, s, rng } = this, { noise } = P;
    this.source = s.storedSet[rng.int(s.storedSet.length)];
    for (let i = 0; i < noise.length; i += 1) noise[i] = rng.n();
    this.lastNew = this.run.world.time;
    this.apply();
  }

  apply() {
    if (this.k < 0) return;
    const { P, source } = this, w = WIDTHS[this.k], { x, noise, bonds, ref, strain } = P;
    for (let i = 0; i < x.length; i += 1) x[i] = source[i] + w * noise[i];
    this.bond = bondError(x, bonds, ref, 0, strain, 0.25);
    let e = 0;
    for (let i = 0; i < x.length; i += 1) e += (x[i] - source[i]) ** 2;
    this.away = Math.sqrt(e / P.n);
  }

  set(k) {
    if (k === this.k) return;
    this.k = k;
    this.seen.add(k);
    this.apply();
  }

  frame(dt) {
    const { P } = this;
    if (!P) return;
    if (!this.run.world.reduce) P.bundle.turn(dt * 0.1, 0);
    // New structures keep coming, so that the model reads as a machine for making them.
    if (!this.holding && this.run.world.time - this.lastNew > 2.4) this.fresh();
    P.bundle.draw(P.x, { atomInk: P.atomInk, strain: P.strain, origin: P.origin });
  }

  track() { const p = this.T.panel; return { L: p.x + 20, R: p.x + p.w - 20 }; }
  xOf(k) { const { L, R } = this.track(); return L + ((R - L) * k) / (WIDTHS.length - 1); }
  kOf(x) { const { L, R } = this.track(), u = (x - L) / (R - L); return Math.max(0, Math.min(WIDTHS.length - 1, Math.round(u * (WIDTHS.length - 1)))); }

  // Press the chart and the width jumps there. Press the protein and it slides from where it is, by the same distance.
  at(x, y) {
    if (this.locked) return null;
    const p = this.T.panel, b = this.T.box;
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return 'chart';
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h ? 'mol' : null;
  }

  bind() {
    const { run } = this;
    let from = 0, x0 = 0;
    const slide = (t, x) => {
      const k = t === 'chart' ? this.kOf(x) : this.kOf(from + (x - x0));
      if (k !== this.k) { this.set(k); run.sound.drip?.(0.42); }
    };
    return run.board({
      at: (x, y) => this.at(x, y),
      hover: (t) => { this.lit = t !== null; },
      cursor: () => 'ew-resize',
      grab: (t, x) => { from = this.xOf(this.k); x0 = x; this.holding = true; if (t === 'chart') slide(t, x); },
      move: (t, x) => slide(t, x),
      drop: () => { this.holding = false; this.lastNew = run.world.time; this.onDrop?.(this.k); },
      tap: (t) => { this.holding = false; this.lastNew = run.world.time; if (t === 'chart') this.onDrop?.(this.k); },
      cancel: () => { this.holding = false; },
    });
  }

  draw(g) {
    if (!this.s) return;
    const { s, k } = this, { list, top } = s, c = list[k], p = this.T.panel, X = this.xOf(k), base = p.y + p.h - 16, up = p.y + 42;
    // The score runs from far below to far above. The chart shows the part that matters.
    const hi = Math.min(top, 16), lo = -12, Y = (v) => base - ((base - up) * (Math.max(lo, Math.min(hi, v)) - lo)) / (hi - lo);
    g.save();
    plate(g, p);
    g.strokeStyle = `rgba(${INK}, .22)`; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x + 12, base); g.lineTo(p.x + p.w - 12, base); g.stroke();
    const seen = [...this.seen].sort((a, b) => a - b), line = (key, color) => {
      if (!seen.length) return;
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2.4; g.lineJoin = 'round'; g.beginPath();
      seen.forEach((q, i) => { const a = this.xOf(q), b = Y(list[q][key]); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
      g.stroke();
      for (const q of seen) { g.beginPath(); g.arc(this.xOf(q), Y(list[q][key]), 2.6, 0, Math.PI * 2); g.fill(); }
    };
    line('stored', GREY);
    if (!this.hide) line('hidden', BLUE);
    g.strokeStyle = `rgba(${INK}, .55)`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X, up - 4); g.lineTo(X, base); g.stroke();
    g.fillStyle = `rgb(${INK})`; g.beginPath(); g.arc(X, base, this.lit ? 13 : 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbfbf8'; g.beginPath(); g.moveTo(X - 6.5, base); g.lineTo(X - 2.5, base - 3.5); g.lineTo(X - 2.5, base + 3.5); g.closePath(); g.moveTo(X + 6.5, base); g.lineTo(X + 2.5, base - 3.5); g.lineTo(X + 2.5, base + 3.5); g.closePath(); g.fill();
    // Numbers. The words at the ends of the axis give way to the grip.
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const x = p.x + 14, y1 = p.y + 17, y2 = p.y + 33;
    g.font = '700 14px "Ysabeau Office", sans-serif'; g.fillStyle = `rgb(${INK})`; g.fillText(`${c.w} Å`, x, y1);
    let u = x + 62;
    g.font = '500 13px "Ysabeau Office", sans-serif'; g.fillStyle = '#6d7390';
    const a = `stored ${fmt(c.stored, 1)}`; g.fillText(a, u, y1); u += g.measureText(a).width + 11;
    g.fillStyle = BLUE; g.font = '700 13px "Ysabeau Office", sans-serif'; g.fillText(`hidden ${this.hide ? '?' : `${fmt(c.hidden, 1)} bits`}`, u, y1);
    g.font = '500 12.5px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT; g.fillText(`new ${fmt(this.away, 1)} Å from source, stored ${fmt(s.spacing, 1)} Å apart`, x, y2);
    g.textAlign = 'right'; g.fillStyle = this.bond > 0.1 ? RED : SOFT; g.font = '700 13px "Ysabeau Office", sans-serif'; g.fillText(`bonds off ${fmt(this.bond, 2)} Å`, p.x + p.w - 13, y1);
    g.font = '500 12.5px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT;
    if (X > p.x + 66) { g.textAlign = 'left'; g.fillText('narrow', p.x + 13, base - 5); }
    if (X < p.x + p.w - 56) { g.textAlign = 'right'; g.fillText('wide', p.x + p.w - 13, base - 5); }
    g.restore();
  }

  hint() { return { from: () => { const b = this.T.box; return { x: b.x + b.w * 0.34, y: b.y + b.h * 0.55 }; }, to: () => { const b = this.T.box; return { x: b.x + b.w * 0.68, y: b.y + b.h * 0.55 }; } }; }
}

const near = (s, k) => s.list[k].hidden >= s.list[s.best].hidden - NEAR;

function play(run, s, say) {
  const { B, T } = run.state, { ui, sound } = run;
  return run.until((done) => {
    run.scoped(B.bind());
    run.scoped(run.idle(() => B.hint()));
    B.onDrop = (k) => {
      if (near(s, k)) { B.locked = true; T.flash(true); done(); return; }
      T.flash(false); sound.soft();
      ui.feedback(say(k), 'bad');
    };
  });
}

const verdict = (s) => (k) => (WIDTHS[k] <= 0.1 ? 'A copy: hidden score nowhere.' : k < s.best ? 'Too narrow: hidden conformers unreachable.' : 'Too wide: the fold is dissolving.');
const peak = (B, s) => `${WIDTHS[s.best]} Å`;

async function level1(run) {
  const { B, U } = run.state, P = B.proteins.ubq;
  run.level(GOALS[0], TAGS);
  B.locked = false; B.hide = false;
  const s = await scan(run, P, everyFourth(U.models.length));
  B.load(P, s, 4);
  await play(run, s, verdict(s));
  B.set(s.best);
  await run.won(`Peak at ${peak(B, s)}. Bonds off by ${fmt(B.bond, 1)} Å.`, 1, 3000);
}

async function level2(run) {
  const { B, U } = run.state, P = B.proteins.ubq;
  run.level(GOALS[1], TAGS);
  B.locked = false; B.hide = false;
  const s = await scan(run, P, conformerSplit(U.models.length, BLUR.few));
  B.load(P, s, B.k >= 0 ? B.k : WIDTHS.indexOf(1));
  await play(run, s, verdict(s));
  B.set(s.best);
  await run.won(`Peak moved to ${peak(B, s)}.`, 2);
}

async function level3(run) {
  const { B, T, K, U } = run.state, { ui, sound } = run, P = B.proteins.adk;
  run.level(GOALS[2], TAGS);
  B.locked = true;
  const sets = [
    { name: 'Adenylate kinase', P, s: await scan(run, P, adkSplit(K, BLUR.adkHide)) },
    { name: 'Ubiquitin', P: B.proteins.ubq, s: await scan(run, B.proteins.ubq, conformerSplit(U.models.length, BLUR.some)) },
  ];
  B.hide = true;
  run.scoped({ dispose: () => { B.hide = false; } });
  await run.until((done) => {
    let at = 0;
    const load = (i) => {
      at = i;
      B.locked = false;
      B.load(sets[i].P, sets[i].s, WIDTHS.indexOf(3));
      ui.rounds(i, 2);
      ui.feedback(`${sets[i].name}, ${sets[i].s.storedSet.length} stored.`);
    };
    run.scoped(B.bind());
    run.scoped(run.idle(() => B.hint()));
    B.onDrop = run.safe(async (k) => {
      const c = sets[at], { s } = c, hit = near(s, k);
      B.locked = true;
      B.hide = false;
      T.flash(hit);
      if (hit) {
        sound.drip?.(0.8);
        ui.rounds(at + 1, 2);
        if (at === 1) { done(); return; }
        ui.feedback(`${fmt(s.list[k].hidden, 1)} bits. Hit.`, 'good');
        await run.pause(1300);
        if (!run.alive) return;
        B.hide = true;
        load(1);
        return;
      }
      sound.soft();
      ui.feedback(`${k < s.best ? 'Too narrow' : 'Too wide'}: ${fmt(s.list[k].hidden, 1)} bits.${at ? ' Back to the first.' : ''}`, 'bad');
      await run.pause(1500);
      if (!run.alive) return;
      B.hide = true;
      load(0);
    });
    load(0);
  });
  await run.won(`Best widths: ${sets.map((c) => `${WIDTHS[c.s.best]} Å`).join(', ')}.`, 3, 2600);
}
