// Chapter 1. What a generative model is: real residues, lookup, a histogram tested on unseen data, and why tables cannot scale.
import { allRama, rama } from '../science/data.js';
import { heldOutBits, histogramModel, populations } from '../science/stats.js';
import { check, chart, fmt, pct, Tank } from './common.js';
import { makeRng } from '../science/rng.js';

const WIDTHS = [90, 60, 45, 30, 20, 15, 12, 10, 7.5, 6, 5, 4, 3, 2, 1.5, 1];
const ALPHA = 0.02;

export default {
  id: 'generate',
  title: 'Making new from old',
  tease: 'What a generative model is, and why a lookup table is not one.',
  principle: 'A generative model is a rule for drawing new points with the same frequencies as the data. You judge it on data it never saw, because a copy machine scores perfectly on what it stored. Tables of counts work for two numbers and fail for thousands.',
  goals: ['Pour the data, then try lookup and a histogram.', 'Find the cell size that best predicts residues the model never saw.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>The data.</b> Backbone angles φ and ψ from the first chain of ${allRama().meta.entries} crystal structures at 1.5 Å or better, one from each cluster at 30% sequence identity, chosen with the RCSB search service. A residue counts only if all its backbone atoms have full occupancy and B-factors under 30.</p>
    <p>That gives ${allRama().meta.total.toLocaleString('en')} residues. The map here is the "general" case: no glycine, no proline, nothing before a proline. ${rama().train.x.length.toLocaleString('en')} are used for training and ${rama().test.x.length.toLocaleString('en')} are held out of training. The held-out residues pick the cell size, so strictly they are validation data. The split is by residue, over the same chains, so a held-out residue can have neighbours in the training set.</p>
    <p><b>Score.</b> Mean log-likelihood of the held-out residues under the model, in bits, compared with a flat map. Each cell's count has ${ALPHA} added so that an empty cell does not give minus infinity.</p>
    <p><b>Scale.</b> The count of cells is exact arithmetic. It ignores that real proteins have correlations between residues, which any useful model must capture. A table cannot.</p>
    <p class="small">Ramachandran, Ramakrishnan and Sasisekharan, J Mol Biol 7, 95 (1963). Lovell et al., Proteins 50, 437 (2003), for the general, glycine and proline split. Sohl-Dickstein et al., ICML 2015, for the idea of a model you can both sample and score.</p>`,

  setup(run) {
    const T = run.state.T = new Tank(run), d = rama();
    run.state.d = d;
    run.state.rng = makeRng(9);
    // Every droplet is one real training residue. There are more droplets than residues, so residues repeat exactly.
    const { train } = d, n = T.N, tx = run.state.tx = new Float32Array(n), ty = run.state.ty = new Float32Array(n);
    for (let i = 0; i < n; i += 1) { const k = i < train.x.length ? i : run.state.rng.int(train.x.length); tx[i] = train.x[k]; ty[i] = train.y[k]; }
    run.probe = { widths: WIDTHS };
  },
  stages: [pourStage, lookupStage, histogramStage, scaleStage, checkStage],
};

async function pourStage(run) {
  const { ui, world, sound } = run, { T, tx, ty } = run.state, n = T.N;
  ui.tags('real');
  ui.say('Each drop of ink is one real residue from a crystal structure, placed by its two backbone angles, φ and ψ. <b>Hold your finger on the water to pour.</b>');
  ui.reads([{ id: 'r-n', value: '0', label: 'residues poured' }]);
  const px = new Float32Array(n), py = new Float32Array(n), age = new Float32Array(n).fill(-1), sx = new Float32Array(n), sy = new Float32Array(n);
  let done = 0, held = false, fx = 0, fy = 100, last = 0, finished = false;
  const finger = (x, y) => { const p = world.unproject(x, y); fx = p.x; fy = p.y; };
  run.pointer({ down: (x, y) => { held = true; finger(x, y); }, move: finger, up: () => { held = false; } });
  const pourAll = ui.button('Pour it all', () => { held = true; run.state.auto = true; }, { quiet: true, id: 'pour-all' });
  ui.ctrl(pourAll);
  const tick = (dt) => {
    if (held || run.state.auto) {
      const rate = run.state.auto ? 16000 : 9000, add = Math.min(n - done, Math.ceil(rate * dt));
      for (let i = 0; i < add; i += 1) { const k = done + i; age[k] = 0; sx[k] = (run.state.auto ? (k % 7 - 3) * 40 : fx) + (Math.random() - 0.5) * 16; sy[k] = (run.state.auto ? 245 : fy) + (Math.random() - 0.5) * 16; }
      done += add;
      if (done - last > 300) { sound.drip?.(0.3); last = done; }
    }
    let moving = false;
    const { pos, size, ink } = T.cloud;
    for (let i = 0; i < done; i += 1) {
      if (age[i] < 1) { age[i] += dt / 0.9; moving = true; }
      const f = Math.min(1, Math.max(age[i], 0)), e = f * f * (3 - 2 * f);
      px[i] = sx[i] + e * (tx[i] - sx[i]); py[i] = sy[i] + e * (ty[i] - sy[i]);
    }
    T.paint(px, py, done, {});
    for (let i = 0; i < done; i += 1) {
      if (age[i] < 1) { const b = 1 + 2.4 * (1 - age[i]); size[i] *= b; ink[4 * i + 3] /= b * 0.7; }
    }
    T.cloud.commit(done);
    void pos;
    ui.read('r-n', Math.min(run.state.d.train.x.length, Math.round((done / n) * run.state.d.train.x.length)).toLocaleString('en'));
    if (done >= n && !moving && !finished) { finished = true; run.state.settled?.(); }
  };
  run.tick(tick);
  await run.until((r) => { run.state.settled = r; });
  run.untick(tick);
  T.labels = true;
  const p = populations(run.state.d.train.x, run.state.d.train.y);
  ui.reads([{ value: pct(p[0]), label: 'helix side' }, { value: pct(p[1]), label: 'strand side' }, { value: pct(p[2], 1), label: 'φ above 0' }]);
  await run.line('Nobody drew these islands. They are where real residues sit, because of steric clashes and hydrogen bonds. Glycine, proline and residues before proline are left out for now, because they have maps of their own.');
  await run.line('A generative model has one job. It must make <b>new</b> points that look as if they came from this same source, with the same frequencies.');
}

async function lookupStage(run) {
  const { ui, sound } = run, { T, d, rng, tx, ty } = run.state;
  ui.tags('game');
  T.paint(tx, ty, T.N, {});
  let hit = null, tries = 0;
  T.extra.push((g) => { if (hit) T.ring(g, hit[0], hit[1], 13); });
  run.scoped({ dispose: () => { T.extra.length = 0; } });
  ui.reads([{ id: 'r-d', value: '–', label: 'degrees from the nearest stored residue' }, { id: 'r-k', value: '0', label: 'new residues made' }]);
  ui.say('The obvious idea first. <b>Tap to copy a stored residue.</b>');
  await run.until((done) => {
    ui.ctrl(ui.button('Copy one', () => {
      const i = rng.int(d.train.x.length);
      hit = [d.train.x[i], d.train.y[i]]; tries += 1;
      sound.drip?.(0.7);
      ui.read('r-d', '0.0');
      if (tries >= 3) { ui.ctrl(); done(); }
    }, { id: 'copy' }));
  });
  await run.line('Every copy is perfect, and none of them is new. That is lookup. It can only replay what it has stored.');
}

async function histogramStage(run) {
  const { ui, sound } = run, { T, d, rng } = run.state;
  ui.tags('game', 'real');
  await run.line('A first real model. Chop the map into square cells, count the residues in each, and draw new points from those counts. New points land anywhere inside a cell.');
  await run.line('To judge it fairly we hold out 2,000 real residues that the model never sees. The score is how well it predicts them, in bits above a flat map.');
  const scores = WIDTHS.map((w) => { const m = histogramModel(d.train, w, ALPHA); return { w, m, test: heldOutBits(m, d.test), train: heldOutBits(m, d.train) }; });
  const bestK = scores.reduce((b, s, i) => (s.test > scores[b].test ? i : b), 0);
  // Anything within 0.02 bits of the top counts as the top: those cell sizes cannot be told apart on this test set.
  const good = (k) => scores[k].test >= scores[bestK].test - 0.02;
  const seen = new Set();
  const px = new Float32Array(T.N), py = new Float32Array(T.N), o = [0, 0];
  const c = chart({ height: 74 });
  const show = (k) => {
    const s = scores[k];
    seen.add(k);
    for (let i = 0; i < T.N; i += 1) { s.m.draw(rng, o); px[i] = o[0]; py[i] = o[1]; }
    T.paint(px, py, T.N, {});
    ui.read('r-t', fmt(s.test, 2)); ui.read('r-s', fmt(s.train, 2)); ui.read('r-c', s.m.cells.toLocaleString('en'));
    const list = [...seen].sort((a, b) => a - b), X = list.map((q) => WIDTHS.length - q);
    c.lines([{ x: X, y: list.map((q) => scores[q].train), color: '#b9bdd0' }, { x: X, y: list.map((q) => scores[q].test), color: '#2336a8' }], { x0: 0, x1: WIDTHS.length, y0: 1.5, y1: 5.1, xlabel: 'cell size: fine to the left', ylabel: 'blue unseen, grey training' });
    sound.drip?.(0.5);
  };
  T.labels = false;
  ui.reads([{ id: 'r-t', value: '', label: 'bits on unseen residues' }, { id: 'r-s', value: '', label: 'bits on training residues' }, { id: 'r-c', value: '', label: 'cells' }]);
  ui.say('<b>Find the cell size that predicts unseen residues best.</b> Then tap the button.');
  let k = 2, tiered = false;
  await run.until((done) => {
    const sl = ui.slider({ label: 'Cell', min: 0, max: WIDTHS.length - 1, step: 1, value: k, format: (v) => `${WIDTHS[v]}°`, onInput: (v) => { k = v; show(v); } });
    const go = ui.button('This is my best', () => {
      run.reach(1);
      if (good(k)) {
        run.reach(2); tiered = true; sound.good(2); ui.ctrl(); done();
      } else {
        ui.say(scores[k].test < scores[bestK].test && k > bestK ? 'Too fine for the data. Unseen residues keep landing in empty cells, although the training score still rises. Try a wider cell.' : 'Too coarse. The islands are smeared and the score has room to rise. Try a finer cell.');
        sound.soft();
      }
    }, { id: 'best' });
    ui.ctrl(c, sl, go);
    show(k);
  });
  void tiered;
  await run.line(`The best cells are about ${WIDTHS[bestK]}°. Wider cells smear the islands. Finer cells keep raising the training score, up to ${fmt(scores[scores.length - 1].train, 1)} bits, while the unseen score falls to ${fmt(scores[scores.length - 1].test, 1)}.`);
  await run.line('That gap is called overfitting. It is the same disease as lookup, in a milder form, and only held-out data can show it.');
}

async function scaleStage(run) {
  const { ui } = run, { T } = run.state;
  ui.tags('game');
  T.labels = true;
  const per = Math.log10((360 / 6) ** 2);
  ui.reads([{ id: 'r-l', value: '1', label: 'residues' }, { id: 'r-e', value: '', label: 'cells needed at 6°' }]);
  ui.say('That table had 3,600 cells, for one residue. <b>Slide up to ubiquitin, 76 residues long.</b>');
  await run.until((done) => {
    const sl = ui.slider({
      label: 'Length', min: 1, max: 76, step: 1, value: 1, format: (v) => `${v}`,
      onInput: (v) => {
        ui.read('r-l', `${v}`); ui.read('r-e', `10^${Math.round(per * v)}`);
        if (v >= 76) { ui.ctrl(); done(); }
      },
    });
    ui.ctrl(sl);
    ui.read('r-e', `10^${Math.round(per)}`);
  });
  await run.line(`Ubiquitin would need 10^${Math.round(per * 76)} cells, for backbone angles alone. The Protein Data Bank holds a few hundred thousand entries. Almost every cell would stay empty for ever.`);
  await run.line('So nobody stores the probability of a structure. The next chapters show something easier to learn: how to clean up a noisy point.');
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. A model returns structures that match its training set atom for atom, and so has the best training score possible. What do you do next?',
      options: [
        { text: 'Publish it. No model can beat a perfect score.', why: 'A copy machine gets that same perfect score. The score on training data cannot tell them apart.' },
        { text: 'Add more training data and test on the same data again.', why: 'A larger store still scores perfectly on what it stored. The test is the problem.' },
        { text: 'Test it on structures it never saw in training.', right: true, why: 'Yes. Only held-out data separates learning from storing.' },
      ],
    },
    {
      q: 'And why not count structures in a table, as you did for one residue?',
      options: [
        { text: 'Because counting is less exact than a neural network.', why: 'Counting was exact, and it won on two numbers. The trouble is the number of cells.' },
        { text: 'Because the cells multiply with every residue, so nearly all stay empty.', right: true, why: 'Yes. With two angles per residue, the cells grow as a power of the chain length, and no database can fill them.' },
        { text: 'Because angles wrap round at 360°.', why: 'Wrapping needs care, but a table copes with it. The trouble is the number of cells.' },
      ],
    },
  ], ['model']);
}
