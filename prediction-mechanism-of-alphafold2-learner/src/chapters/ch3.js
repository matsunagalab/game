// Chapter 3. Real attention on a real hidden letter, the outer product, then a live two-tower exchange on the real family.
import { Loom } from '../loom.js';
import { LETTERS, uniformWeights } from '../science/msa.js';
import { softmax } from '../science/ipa.js';
import { meanFieldDCA } from '../science/dca.js';
import { TwoTower } from '../science/twotower.js';
import { apc, chart, compressColumns, ContactQuilt, fmt, name, pct, theFamily } from './common.js';

const TRAIN = 1700; // the last 300 sequences are held out and never shown to any model

export default {
  id: 'towers',
  title: 'Two representations',
  tease: 'Keep the sequences and the pairs in two tables, and let them talk.',
  principle: 'AlphaFold2 keeps one table about sequences and one about residue pairs. The sequences tell the pairs what varies together, and the pairs can tell each sequence where to look. DeepMind built the two to inform each other at every step, and removing part of that exchange cost a few points of accuracy, so it helps without being all or nothing.',
  goals: ['Run the exchange with both wires on.', 'Cut each wire and see what fails.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>Real sizes in AlphaFold2.</b> The MSA representation is N<sub>seq</sub> × N<sub>res</sub> × 256, with 512 sequences at most in the main stack in fine-tuning and CASP settings. The pair representation is N<sub>res</sub> × N<sub>res</sub> × 128. The Evoformer repeats 48 blocks (Algorithm 6). Up to 5,120 more sequences go through a four-block extra MSA stack with 64 channels. Row and column attention use 8 heads, and triangle attention 4.</p>
    <p><b>This game's model.</b> A teaching model, but real arithmetic on real data. Here a block is one learning step on this family. In AlphaFold2 a block is one of 48 layers in a single forward pass. Each layer has its own weights, fixed after training. Its MSA table is (sequences, columns, 7) and its pair table is (columns, columns, 7, 7). Pair to MSA is a softmax over a sum of pair terms. MSA to pair is an outer product of each column's surprise with every other column's letters, averaged over sequences. This is gradient ascent on the pseudo-likelihood (Ekeberg et al. 2013). The Evoformer has two tables and two wires like these, but its wires are learned, not this formula.</p>
    <p><b>Loss shown.</b> The mean of −log p(true letter) on 300 sequences kept out of all the sums, including the choice of which six letters each column keeps. It falls to about 1.30 by block 12 and stops improving after about eight blocks, even while the loss on the training rows keeps falling. That gap is overfitting. Only the held-out number is shown.</p>
    <p><b>Outer product mean</b> is Algorithm 10. Fed one-hot letters with no learned weights, the average of the products is exactly the pair-frequency table f<sub>ij</sub>(a,b). In AF2 the inputs are learned vectors, and it runs in every block. <b>Row attention with pair bias</b> is Algorithm 7. The masked-letter task is the masked MSA loss of Supplement 1.9.9, with weight 2.0 in the total loss.</p>
    <p><b>The hidden letter.</b> The first sequence was chosen because its partner column helps, to show the idea. The fair test is the one over every column of all 300 kept-aside sequences. Column attention here scores 1,700 training sequences by how alike they are to the hidden one, leaving out the hidden column. Its large gain is mostly family resemblance, so it does not by itself find contacts. A tapped sequence is trusted at a fixed 90%. How sharp attention is, here the pair score times 6 and the likeness times 0.2, is set by hand in this game, where AlphaFold2 learns its own numbers.</p>
    <p><b>Percent right.</b> Each column here has seven classes: its six commonest letters, and one slot for all the rare ones. On that count the column alone gets 44% and likeness shares 59%. Counted over all 21 letters, they get 38% and 54%.</p>
    <p><b>Column attention</b> is Algorithm 8 and has no pair bias: position i of one sequence attends to position i of the others. <b>Block order</b> is Algorithm 6: row attention with pair bias, column attention, transition, outer product mean, multiplicative update outgoing then incoming, triangle attention starting node then ending node, transition. A transition is a two-layer network applied to each entry on its own.</p>
    <p><b>Masked MSA.</b> In training and inference, 15% of positions in the MSA cluster centres are masked. Of those, 70% become a special mask token, and the rest split evenly: 10% a random letter, 10% a letter drawn from the family's profile, and 10% left as they are (Supplement 1.2.7, config.py). The masked positions are what the network must predict in training. Removing that task cost about 11 lDDT-Cα at its worst, near N<sub>eff</sub> of 30 to 50, and almost nothing above about 500, read by eye from Supplementary Fig. 10. The authors say they intended it to encourage co-evolution-like reasoning, and report only that it raises accuracy.</p>
    <p><b>Real test of the idea.</b> DeepMind retrained AF2 with the raw MSA replaced by only first and second order statistics, the "no raw MSA" ablation. Reading Supplementary Fig. 10 by eye, lDDT-Cα fell by about 1 to 2 at most MSA depths, and the authors call the drop "not catastrophic". The ablation that removes the direct path from pair to MSA also removes triangles and costs about 1 to 3. They caution that hyperparameters were not retuned and that effects interact.</p>
    <p class="small">Sources: Jumper et al., Nature 2021, and Supplementary Methods 1.6, 1.9.9, 1.13. Ekeberg et al., Phys Rev E 2013.</p>`,

  setup(run) {
    const f = run.state.f = theFamily();
    // The kept letters come from the training rows alone, so that the 300 rows kept aside have no say in anything.
    const c = compressColumns(f.X, f.N, f.L, 6, 21, TRAIN);
    run.state.Y = c.Y; run.state.qi = c.qi; run.state.kept = c.kept;
    const { world } = run;
    const loom = run.state.loom = run.own(new Loom(world, f.msa, { rows: 60 }));
    const q = run.state.q = run.own(new ContactQuilt(run, f, {}));
    run.onLayout = () => layout(run, loom, q);
    layout(run, loom, q);
    world.shadowSpan(130);
    run.own({ dispose: () => world.shadowSpan(80) });
  },
  stages: [meet, hidden, column, outer, wires, block, check],
};

function layout(run, loom, q) {
  const { world } = run, s = world.stage, tall = s.h > s.w * 0.9, { f } = run.state;
  if (tall) {
    loom.relocate(0, -46); q.quilt.origin = [0, 60];
    world.look({ target: [0, 0, 8], dist: world.fitDist(f.L + 6, 216, 0.1), polar: 0.1, az: 0 }, 0.7);
  } else {
    loom.relocate(-66, 0); q.quilt.origin = [66, 0];
    world.look({ target: [0, 0, 0], dist: world.fitDist(272, f.L + 24, 0.1), polar: 0.1, az: 0 }, 0.7);
  }
  q.quilt.back.position.set(q.quilt.origin[0], 0.1, q.quilt.origin[1]);
  q.quilt.layout();
}

async function meet(run) {
  const { ui } = run;
  ui.tags('real');
  await run.line('A <b>neural network</b> is a long chain of arithmetic whose adjustable numbers, the <b>weights</b>, are nudged in <b>training</b> until its answers improve on known structures.');
  await run.line('What it holds in mind at any step is a <b>representation</b>, a table of numbers, and AlphaFold2 keeps two: the loom, or <b>MSA representation</b>, with a row for each sequence, and the quilt, or <b>pair representation</b>, with a square for each pair of residues.');
  await run.line('To see why it keeps both, try a job that one table cannot do alone.');
}

// The chance of each state at column i, given only that column in the training rows.
function profile(Y, L, i, q = 7) {
  const t = new Float64Array(q).fill(0.3);
  for (let s = 0; s < TRAIN; s += 1) t[Y[s * L + i]] += 1;
  const z = t.reduce((a, b) => a + b);
  return t.map((v) => v / z);
}
// The chance of each state at column i, given the letter at column j.
function conditional(Y, L, i, j, q = 7) {
  const t = new Float64Array(q * q).fill(0.3);
  for (let s = 0; s < TRAIN; s += 1) t[Y[s * L + j] * q + Y[s * L + i]] += 1;
  for (let b = 0; b < q; b += 1) { let z = 0; for (let a = 0; a < q; a += 1) z += t[b * q + a]; for (let a = 0; a < q; a += 1) t[b * q + a] /= z; }
  return t;
}

// A real hidden letter, shared by the row and column stages, so that a resumed chapter finds it too.
async function hiddenCase(run) {
  if (run.state.hiddenCase) return run.state.hiddenCase;
  const { f, Y, qi, kept } = run.state, L = f.L, N = f.N;
  // The coupling scores come from the sequences outside the held-out set.
  const w = uniformWeights(TRAIN).w;
  const scores = apc(await run.budget(meanFieldDCA(Y, TRAIN, L, qi, w, 0.5)), L);
  // A column pair with a strong real coupling, and a held-out sequence whose hidden letter is hard from the column alone.
  let at = 0, best = -1;
  for (let c = 0; c < L; c += 1) { for (let j = 0; j < L; j += 1) { if (Math.abs(c - j) >= 6 && scores[c * L + j] > best && qi[c] >= 7) { best = scores[c * L + j]; at = c; } } }
  const others = [];
  for (let j = 0; j < L; j += 1) if (j !== at) others.push(j);
  const ranked = others.slice().sort((a, b) => scores[at * L + b] - scores[at * L + a]);
  const stateName = (c, s) => (s < kept[c].length ? LETTERS[kept[c][s]] : 'other');
  const prof = profile(Y, L, at), cond = new Map();
  const getCond = (j) => { if (!cond.has(j)) cond.set(j, conditional(Y, L, at, j)); return cond.get(j); };
  const held = [];
  for (let s = TRAIN; s < N && held.length < 3; s += 1) { const a = Y[s * L + at]; const c = getCond(ranked[0]); if (c[Y[s * L + ranked[0]] * 7 + a] > prof[a] * 1.5 && a < kept[at].length) held.push(s); }
  const row = held[0] ?? TRAIN, truth = Y[row * L + at];
  run.state.hiddenCase = { scores, at, ranked, row, truth, prof, stateName, getCond };
  return run.state.hiddenCase;
}

async function hidden(run) {
  const { ui, sound } = run, { f, Y, qi, kept, loom } = run.state, L = f.L, N = f.N;
  ui.tags('real', 'game', 'model');
  run.onLayout?.();
  const { scores, at, ranked, row, truth, prof, stateName, getCond } = await hiddenCase(run);
  const lossOf = (p) => -Math.log(p[truth]);
  const c = chart(ui, { height: 96 });
  const bars = (p) => c.draw(Array.from({ length: qi[at] }, (_, s) => ({ value: p[s], label: stateName(at, s), text: pct(p[s]), color: s === truth ? '#0053d6' : '#b8c9d4' })), { max: 1 });
  await run.line(`Here is a job. One real sequence, from the 300 kept aside, has its letter at ${name(f, at)} hidden. Guess it.`);
  ui.reads([{ value: fmt(lossOf(prof)), label: 'loss' }]);
  ui.ctrl(c);
  bars(prof);
  await run.until((done) => {
    ui.say('Using only that column, this is your best guess, and the true letter is the darker bar.');
    ui.ctrl(c, ui.button('Next', () => done(), { id: 'next' }));
    bars(prof);
  });
  ui.ctrl(c);
  bars(prof);
  await run.until((done) => { ui.say('A <b>loss</b> is one number for how wrong a guess was, here minus the log of the chance you gave the truth, and training pushes it down.'); ui.ctrl(c, ui.button('Next', () => done(), { id: 'next' })); bars(prof); });
  // Attention, by hand: tap positions to listen to them. The 100% is shared evenly among those you pick.
  const candidates = [ranked[0], ranked[1], ranked[Math.floor(L / 2)], ranked[L - 3]];
  const on = candidates.map(() => false);
  const mix = () => {
    const total = on.filter(Boolean).length, p = new Float64Array(7);
    if (!total) return prof;
    candidates.forEach((j, k) => { if (!on[k]) return; const t = getCond(j), b = Y[row * L + j]; for (let a = 0; a < 7; a += 1) p[a] += t[b * 7 + a] / total; });
    return p;
  };
  loom.mark(0, at);
  await run.until((done) => {
    ui.say('<b>Attention</b> means sharing out 100% of your interest among other positions and mixing what they suggest, so tap positions to listen to them.');
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const box = document.createElement('div');
    box.className = 'chips';
    candidates.forEach((j, k) => {
      const b = ui.button(`${name(f, j)}: ${stateName(j, Y[row * L + j])}`, () => {
        on[k] = !on[k];
        b.classList.toggle('on', on[k]);
        const p = mix(), c0 = on.filter(Boolean).length;
        loom.mark(1, on[k] ? j : -1);
        bars(p);
        ui.reads([{ value: fmt(lossOf(prof)), label: 'loss, column alone' }, { value: c0 ? `${Math.round(100 / c0)}% each` : '0%', label: 'your attention' }, { value: fmt(lossOf(p)), label: 'loss, with attention' }]);
        if (lossOf(p) < lossOf(prof) - 0.2) nxt.disabled = false;
        sound.pick(k);
      }, { quiet: true, id: `listen-${k}` });
      box.append(b);
    });
    ui.ctrl(c, box, nxt);
    bars(prof);
  });
  for (const text of ['On this one sequence every position helped, and the best was a chain neighbour.', 'One case proves little, so test every letter.']) await run.until((done) => { ui.say(text); ui.ctrl(c, ui.button('Next', () => done(), { id: 'next' })); bars(mix()); });
  ui.ctrl();
  loom.mark(0, -1); loom.mark(1, -1);
  // The real test: every column of the held-out rows, three ways.
  ui.say('Now score it properly: hide every letter of all 300 kept-aside sequences in turn.');
  let l0 = 0, l1 = 0, l2 = 0, n = 0, h0 = 0, h1 = 0;
  const step = function* gen() {
    for (let i = 0; i < L; i += 1) {
      const pf = profile(Y, L, i), rest = [];
      for (let j = 0; j < L; j += 1) if (j !== i) rest.push(j);
      const wt = softmax(rest.map((j) => scores[i * L + j] * 6)), tables = rest.map((j) => conditional(Y, L, i, j));
      for (let s = TRAIN; s < N; s += 1) {
        const a = Y[s * L + i], p = new Float64Array(7), e = new Float64Array(7);
        rest.forEach((j, k) => { const t = tables[k], b = Y[s * L + j]; for (let x = 0; x < 7; x += 1) { p[x] += wt[k] * t[b * 7 + x]; e[x] += t[b * 7 + x] / rest.length; } });
        l0 -= Math.log(pf[a]); l1 -= Math.log(p[a]); l2 -= Math.log(e[a]); n += 1;
        let m0 = 0, m1 = 0;
        for (let x = 1; x < 7; x += 1) { if (pf[x] > pf[m0]) m0 = x; if (p[x] > p[m1]) m1 = x; }
        if (m0 === a) h0 += 1;
        if (m1 === a) h1 += 1;
      }
      yield i / L;
    }
  };
  await run.budget(step(), (v) => ui.reads([{ value: pct(v), label: 'of the columns tested' }]), 30);
  run.state.attn = { l0: l0 / n, l1: l1 / n, l2: l2 / n, h0: h0 / n, h1: h1 / n };
  ui.reads([{ value: fmt(l0 / n), label: `loss, column alone (${pct(h0 / n)} right, counting rare letters as one)` }, { value: fmt(l2 / n), label: 'loss, equal attention to all' }, { value: fmt(l1 / n), label: `loss, pair table sets it (${pct(h1 / n)} right)` }]);
  sound.fold();
  await run.line('That is <b>pair to MSA</b>: the pair table tells each sequence where to look.');
  ui.reads([]);
  ui.tags('paper');
  await run.line('In AlphaFold2 this is the pair bias on row-wise attention.');
  await run.line('AlphaFold2 plays this very game in training, hiding some letters and filling them in, and this <b>masked MSA</b> task was worth up to about 11 points of lDDT on shallow alignments, read by eye from a published plot.');
}

// Column attention, on the same hidden letter: one position listens to the same position in other sequences.
async function column(run) {
  const { ui, sound } = run, { f, Y, qi, loom } = run.state, L = f.L, N = f.N;
  const { at, row, truth, prof, stateName } = await hiddenCase(run);
  ui.tags('real', 'game', 'model');
  ui.reads([]);
  await run.line('That was <b>row-wise attention</b>: inside one sequence, a residue listens to other residues.');
  await run.line('The MSA table has a second kind, <b>column-wise attention</b>. One position listens to the same position in other sequences.');
  loom.mark(0, at);
  // How alike each training sequence is to the hidden one, leaving out the hidden column itself.
  const alike = new Int32Array(TRAIN);
  for (let t = 0; t < TRAIN; t += 1) { let k = 0; for (let c = 0; c < L; c += 1) if (c !== at && Y[row * L + c] === Y[t * L + c]) k += 1; alike[t] = k; }
  const order = [...alike.keys()].sort((a, b) => alike[b] - alike[a]);
  const picks = [order[0], order[Math.floor(TRAIN / 2)], order[TRAIN - 1]];
  const on = picks.map(() => false);
  const c = chart(ui, { height: 92 });
  const lossOf = (p) => -Math.log(p[truth]);
  const mix = () => {
    const n = on.filter(Boolean).length;
    if (!n) return prof;
    const p = new Float64Array(7).fill(0.1 / 7);
    picks.forEach((t, k) => { if (on[k]) p[Y[t * L + at]] += 0.9 / n; });
    return p;
  };
  const bars = (p) => c.draw(Array.from({ length: qi[at] }, (_, s) => ({ value: p[s], label: stateName(at, s), text: pct(p[s]), color: s === truth ? '#0053d6' : '#b8c9d4' })), { max: 1 });
  await run.until((done) => {
    ui.say('Same hidden letter: tap other sequences to listen to their letter at this position.');
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const box = document.createElement('div');
    box.className = 'chips';
    box.style.gridTemplateColumns = '1fr';
    const kind = ['Closest relative', 'Middling relative', 'Most distant'];
    picks.forEach((t, k) => {
      const b = ui.button(`${kind[k]}, ${Math.round((alike[t] / (L - 1)) * 100)}% alike: ${stateName(at, Y[t * L + at])}`, () => {
        on[k] = !on[k];
        b.classList.toggle('on', on[k]);
        const p = mix();
        bars(p);
        ui.reads([{ value: fmt(lossOf(prof)), label: 'loss, column alone' }, { value: fmt(lossOf(p)), label: 'loss, with these sequences' }]);
        if (on.some(Boolean)) nxt.disabled = false;
        sound.pick(k);
      }, { quiet: true, id: `seq-${k}` });
      box.append(b);
    });
    ui.ctrl(c, box, nxt);
    bars(prof);
  });
  ui.ctrl();
  loom.mark(0, -1);
  ui.say('Now hide every letter of the 300 kept-aside sequences again, and let likeness set the shares.');
  const beta = 0.2;
  let l0 = 0, l1 = 0, n = 0, h0 = 0, h1 = 0;
  const profiles = Array.from({ length: L }, (_, i) => profile(Y, L, i));
  const slices = function* gen() {
    for (let s = TRAIN; s < N; s += 1) {
      const id = new Float64Array(TRAIN);
      let top = 0;
      for (let t = 0; t < TRAIN; t += 1) { let k = 0; for (let i = 0; i < L; i += 1) if (Y[s * L + i] === Y[t * L + i]) k += 1; id[t] = k; if (k > top) top = k; }
      const w = id.map((v) => Math.exp(beta * (v - top)));
      for (let i = 0; i < L; i += 1) {
        const a = Y[s * L + i], P = new Float64Array(7), pf = profiles[i];
        for (let t = 0; t < TRAIN; t += 1) P[Y[t * L + i]] += w[t];
        P[a] *= Math.exp(-beta); // the hidden column itself must not count towards likeness
        let z = 0;
        for (let x = 0; x < 7; x += 1) { P[x] += 1e-3 * (pf[x] + 1e-3); z += P[x]; }
        l0 -= Math.log(pf[a]); l1 -= Math.log(P[a] / z); n += 1;
        let m0 = 0, m1 = 0;
        for (let x = 1; x < 7; x += 1) { if (pf[x] > pf[m0]) m0 = x; if (P[x] > P[m1]) m1 = x; }
        if (m0 === a) h0 += 1;
        if (m1 === a) h1 += 1;
      }
      yield (s - TRAIN) / (N - TRAIN);
    }
  };
  await run.budget(slices(), (v) => ui.reads([{ value: pct(v), label: 'of the sequences tested' }]), 30);
  run.state.columnAttn = { l0: l0 / n, l1: l1 / n, h0: h0 / n, h1: h1 / n };
  ui.reads([{ value: fmt(l0 / n), label: `loss, column alone (${pct(h0 / n)} right, counting rare letters as one)` }, { value: fmt(l1 / n), label: `loss, likeness sets the shares (${pct(h1 / n)} right)` }]);
  sound.fold();
  await run.line('That helps a lot, because close relatives share letters. This vote rests on the same family resemblance that made false links in chapter 2, so by itself it says nothing about contacts.');
  await run.line('Row attention lets a residue use the rest of its own sequence. Column attention lets it use other sequences at the same place.');
  ui.reads([]);
}

// One Evoformer block, in order.
const STEPS = [
  ['Row attention', 'along each sequence, biased by the pair table'],
  ['Column attention', 'the same position across sequences'],
  ['Transition', 'a small network tidies each MSA entry'],
  ['Outer product mean', 'news from the MSA table to the pair table'],
  ['Triangle multiplication', 'chapter 4, outgoing then incoming'],
  ['Triangle attention', 'chapter 4, starting then ending node'],
  ['Transition', 'a small network tidies each pair entry'],
];

async function block(run) {
  const { ui, sound } = run;
  ui.reads([]);
  ui.tags('paper');
  await run.line('You have now met the parts of one <b>Evoformer block</b>, the building unit of AlphaFold2.');
  const list = document.createElement('ol');
  list.className = 'steps';
  list.innerHTML = STEPS.map(([name, what]) => `<li><b>${name}</b>: ${what}</li>`).join('');
  ui.say('One block runs these seven steps in order.');
  sound.pick(3);
  await run.until((done) => { ui.ctrl(list, ui.button('Next', () => done(), { id: 'next' })); });
  ui.ctrl();
  await run.line('AlphaFold2 stacks 48 of these blocks, each with its own weights, so news goes back and forth between the two tables many times.');
}

async function outer(run) {
  const { ui, sound } = run, { f } = run.state, { X, L, N } = f;
  ui.tags('real', 'game');
  run.onLayout?.();
  await run.line('Now the other wire, from sequences to pairs. Take two columns. For one sequence, mark the one square of a small table where their letters meet. That is an <b>outer product</b>.');
  const col = (num) => f.colOf.find((c) => f.che.nums[f.col2res[c]] === num);
  const a = col(56), b = col(68);
  const top = (c) => { const t = new Int32Array(21); for (let s = 0; s < N; s += 1) t[X[s * L + c]] += 1; return [...t.keys()].sort((x, y) => t[y] - t[x]).slice(0, 5); };
  const ta = top(a), tb = top(b);
  const box = document.createElement('canvas');
  box.className = 'chart';
  box.style.height = '150px';
  const paint = (count) => {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = box.clientWidth || 300, h = 150;
    box.width = w * dpr; box.height = h * dpr;
    const g = box.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = new Float64Array(25);
    for (let s = 0; s < count; s += 1) {
      const i = ta.indexOf(X[s * L + a]), j = tb.indexOf(X[s * L + b]);
      if (i >= 0 && j >= 0) t[i * 5 + j] += 1 / count;
    }
    const m = Math.max(...t, 0.001), size = 25, x0 = (w - size * 5) / 2, y0 = 18;
    g.font = '13px "Alegreya Sans", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#26343f';
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle = '#26343f';
      g.fillText(LETTERS[tb[i]], x0 + (i + 0.5) * size, 12);
      g.fillText(LETTERS[ta[i]], x0 - 10, y0 + (i + 0.7) * size);
      for (let j = 0; j < 5; j += 1) {
        const v = t[i * 5 + j] / m;
        g.fillStyle = `rgba(0, 83, 214, ${0.06 + 0.94 * v})`;
        g.fillRect(x0 + j * size + 1, y0 + i * size + 1, size - 2, size - 2);
      }
    }
    g.textAlign = 'left'; g.fillStyle = '#5a6b78';
    g.fillText(`${name(f, a)} down`, x0 + size * 5 + 12, 30);
    g.fillText(`${name(f, b)} across`, x0 + size * 5 + 12, 48);
  };
  ui.reads([]);
  ui.say('Drag to average over more and more real sequences.');
  await run.until((done) => {
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const s = ui.slider({ label: 'Sequences', min: 1, max: N, step: 1, value: 1, format: (v) => v.toLocaleString('en'), onInput: (v) => { paint(v); sound.pick(Math.floor(v / 300)); if (v > N / 2) nxt.disabled = false; } });
    ui.ctrl(box, s, nxt);
    paint(1);
  });
  ui.ctrl();
  await run.line('The average of those outer products is the table of letter pairs behind chapter 1. This operation is the <b>outer product mean</b>, and it is how AlphaFold2 sends news from sequences to pairs.');
  ui.tags('paper');
  await run.line('AlphaFold2 feeds it learned numbers, not plain letters, and it runs in every one of its blocks. It never computes mutual information or DCA as such.');
}

async function wires(run) {
  const { ui, sound } = run, { f, Y, qi } = run.state, { L, N } = f;
  const q = run.state.q;
  run.onLayout?.();
  ui.tags('model', 'real', 'game');
  const heldRows = Int32Array.from({ length: N - TRAIN }, (_, k) => TRAIN + k);
  await run.line('Now connect both wires and let them run, on the real family. One block sends news both ways once.');
  await run.line('This is not AlphaFold2. It has two tables and two wires like AlphaFold2, but here a block is one learning step on this family, and each wire is one written formula.');
  const results = {};
  const c = chart(ui, { height: 62 });
  const drawResults = () => c.draw(['both', 'noPair', 'noMsa'].map((k) => ({ value: results[k]?.half ?? 0, text: results[k] ? pct(results[k].half) : '', label: k === 'both' ? 'both wires' : k === 'noPair' ? 'pair to MSA cut' : 'MSA to pair cut', color: k === 'both' ? '#0053d6' : '#65cbf3' })));
  const perform = async (key, msaToPair, pairToMsa) => {
    const T = new TwoTower(Y, TRAIN, L, qi, { batch: 400, rate: 0.5, decay: 0.012, seed: 977 });
    T.wires = { msaToPair, pairToMsa };
    const start = await run.budget(T.heldOutSlices(heldRows));
    let held = start, half = 0, ok = true;
    for (let b = 1; b <= 12 && run.alive; b += 1) {
      await run.budget(T.stepSlices());
      held = await run.budget(T.heldOutSlices(heldRows));
      const S = T.scores();
      ok = S.some((v) => v > 0);
      const sc = ok ? f.score(apc(S, L)) : { pairs: [], half: 0 };
      half = sc.half;
      q.guesses(sc.pairs, f.mapped >> 1);
      ui.reads([{ value: `${b}/12`, label: 'block' }, { value: fmt(held, 3), label: 'loss, kept-aside rows' }, { value: pct(half), label: 'top pairs right' }]);
      sound.setOpening((start - held) / 0.25);
      if (b % 2 === 0) sound.phrase(3);
    }
    results[key] = { held, half, start };
    drawResults();
    sound.fold();
  };
  const choice = (label, key, a, b, id) => ui.button(label, async (el) => {
    const all = [...ui.ctrl$.querySelectorAll('button')];
    all.forEach((x) => { x.disabled = true; });
    ui.say(key === 'both' ? 'Both wires on.' : key === 'noPair' ? 'The pair table can no longer reach the sequences.' : 'The sequences can no longer reach the pair table.');
    await perform(key, a, b);
    all.forEach((x) => { x.disabled = false; });
    if (results.both) run.reach(1);
    if (results.both && results.noPair && results.noMsa) { run.reach(2); nxt.disabled = false; }
    el.textContent = label;
    ui.say(explain(key));
  }, { quiet: key !== 'both', id });
  const explain = (key) => {
    const r = results[key];
    if (key === 'both') return `The loss fell from ${fmt(r.start)} to ${fmt(r.held)}, and pairs improved as each table fed the other. Now cut a wire.`;
    if (key === 'noPair') return `The table still fills with plain correlations and finds some contacts, but nothing reads it, so the loss stays near ${fmt(r.held)}.`;
    return 'With this wire cut the table stays empty, which simply follows from the wiring.';
  };
  const nxt = ui.button('Next', () => run.state.go?.(), { id: 'next' });
  nxt.disabled = true;
  ui.say('Run it, on the real family.');
  ui.tags('model', 'real', 'game');
  await run.until((done) => {
    run.state.go = done;
    ui.ctrl(c, choice('Both wires', 'both', true, true, 'w-both'), choice('Cut pair to MSA', 'noPair', true, false, 'w-nopair'), choice('Cut MSA to pair', 'noMsa', false, true, 'w-nomsa'), nxt);
    drawResults();
  });
  ui.ctrl();
  sound.setOpening(0.6);
  ui.reads([]);
  await run.line('Sequences hold the raw evidence, and pairs hold a summary of who relates to whom. In this small model the loop needs both wires, and that follows from how it is wired.');
  ui.tags('paper');
  await run.line('AlphaFold2 uses the same two-way plan. There, taking away the direct path from pairs to sequences, together with the triangles, costs a few points of accuracy.');
  q.guesses([], 0);
}

async function check(run) {
  const { ui } = run;
  ui.tags('model');
  const first = await run.choose('A new case. A classmate says: "Throw away the sequences. Keep one table of pair frequencies, computed once, and feed only that to the network." What is lost?', [
    { text: 'Nothing. The pair table already holds everything.', right: false, why: 'A table of frequencies is a summary, so it drops what each sequence says. When DeepMind tried this, accuracy fell a little.' },
    { text: 'What each single sequence says, so the network cannot keep re-reading it.', right: true, why: 'Right. When DeepMind tried this, accuracy fell a little, about 1 to 2 points. One likely reason is that a summary made once cannot ask new questions of the sequences. DeepMind measured the drop, not the reason.' },
    { text: 'Only the speed of the network.', right: false, why: 'A table of frequencies is faster, not slower. The cost is in accuracy.' },
  ]);
  const second = await run.choose('Attention in one sentence. Which is right?', [
    { text: 'A fixed link between two residues, set by evolution.', right: false, why: 'Attention weights are computed afresh for each sequence and each step, not fixed.' },
    { text: 'A share of 100% given to each other position, used to mix what they say.', right: true, why: 'Yes. A formula called a softmax turns scores into shares that add up to 1, and the result is a weighted average.' },
    { text: 'A score for how conserved a position is.', right: false, why: 'Conservation is about one column. Attention is about who listens to whom.' },
  ]);
  if (first && second) run.reach(3);
}
