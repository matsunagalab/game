// Chapter 8. This game's whole small pipeline, run live, with its output fed back in as input.
import * as THREE from 'three';
import { Flock, ribbonGeometry, STOCK } from '../world.js';
import { uniformWeights } from '../science/msa.js';
import { meanFieldDCA } from '../science/dca.js';
import { lddt, rmsd, superpose } from '../science/metrics.js';
import { Pipeline } from '../science/pipeline.js';
import { ambient, apc, chart, compressColumns, fmt, frameBoard, getModel, pct, theFamily } from './common.js';

const LIFT = 22;
const PASSES = 4;

export default {
  id: 'recycle',
  title: 'Recycling',
  tease: 'Hand the answer back as a question, and see what a second reading is worth.',
  principle: 'One pass through the network can only reach so far. Recycling feeds the output back in as input, so the same network reads a fresh sample of the sequences with a draft in hand. It adds depth for almost no extra weights, and how many passes help depends on the protein.',
  goals: ['Fold CheY with your own pipeline.', 'Recycle it, and run both controls.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>In AlphaFold2.</b> The whole network runs N<sub>cycle</sub> = 4 times by default, that is, 3 recycles, with shared weights (Algorithm 30; num_recycle = 3 in config.py). Three things return: the pair representation, the first row of the MSA representation, and the predicted Cβ distances, binned into 15 bins, 3 3/8 to 21 3/8 Å in the Supplement and 3.25 to 20.75 Å in config.py (Algorithm 32). Each pass also draws a new sample of the MSA. Only the last pass carries gradients, which keeps training cheap.</p>
    <p><b>How much it helps.</b> The paper says recycling "contributes markedly to accuracy". Removing it lowered lDDT-Cα at all MSA depths, by about 1 to 4, most near N<sub>eff</sub> of 30, read by eye from Supplementary Fig. 10. Of the double ablation of IPA and recycling, the authors say it is "not clear which missing features of recycling" explain the large drop: embedding the intermediate structures, the deeper network, intermediate losses, or weight tying. Independently, with ColabFold, 12 recycles on CASP14 raised mean TM-score to 0.898 from about 0.887, mostly on targets with little MSA information (Mirdita et al. 2022). In another study, removing only the recycled coordinates left the score at 0.84 ± 0.15 with full MSAs (Gut and Lemmin 2025), so the recycled embeddings may matter more than the coordinates. We found no independent curve of accuracy against recycle count with open per-count numbers. How much depth a protein needs varies: in Fig. 4b one CASP target settles early, and another changes until nearly the full depth.</p>
    <p><b>The binned draft.</b> Bins follow the AlphaFold2 code: each runs from one edge up to the next, the last is open ended, and a distance under 3.25 Å falls in no bin, so it stays blank here (modules.py).</p>
    <p><b>This game's pipeline is not AlphaFold2.</b> It has these real parts: mean-field DCA with APC on 2,000 real sequences, bound smoothing, classical multidimensional scaling, then gradient descent on frames in the two possible hands. One part comes from the crystal: the local shape, within four residues along the chain, stands in for what a network learns about local structure. The hand with the lower restraint energy is kept, and that energy includes this local shape, so the crystal sets the hand here. Without it the two hands tie.</p>
    <p><b>Recycling here.</b> Each new pass keeps pairs from the top 2L candidates that sit within 11 Å in the draft, and starts its embedding from the draft's distances. Over nine runs, all sequences plus eight random samples of 1,600, median RMSD went 3.95, 3.45, 3.53, 3.46 Å and median lDDT went 0.648, 0.668, 0.655, 0.646. Pass 2 raised lDDT in all nine of these runs and in ten of another twelve, so how sure the gain is depends on the sample, and passes 3 and 4 did not help. A control: using only the top 54 pairs, with no draft at all, gives a median of 3.28 Å and lDDT 0.678, as good as pass 2 or better in six of the nine runs. So the gain comes from which pairs are used. On all sequences, pass 1 has 109 pairs, 46 of them 8 Å or more apart, 19 at 12 Å or more and 10 at 15 Å or more, and pass 2 has 174, 79, 21 and 6. Across the nine runs the share of real contacts fell in every run, with a median of 59% at pass 1 and 55% at pass 2, while the median count of pairs at 15 Å or more fell from 10 to 6. Testing each cause alone across the nine runs: pass 2's chosen pairs with no draft distances gave a median of 3.16 Å and lDDT 0.681, better than pass 1 in all nine, and pass 1's pairs with the draft's distances gave 4.08 Å and 0.629, better in one of nine. So the draft's distances alone do not help. The way AlphaFold2 gains may be quite different.</p>
    <p><b>CASP14.</b> 0.96 Å and 2.8 Å are median backbone r.m.s.d.95, Cα at 95% residue coverage, on CASP domains (Jumper et al. 2021).</p>
    <p class="small">Sources: Jumper et al., Nature 2021, Supplement 1.10, 1.13. Mirdita et al., Nat Methods 2022. Gut and Lemmin, Bioinform Adv 2025.</p>`,

  async setup(run) {
    const f = run.state.f = theFamily(), che = f.che;
    const c = compressColumns(f.X, f.N, f.L, 6);
    run.state.scores = apc(await run.budget(meanFieldDCA(c.Y, f.N, f.L, c.qi, uniformWeights(f.N).w, 0.5)), f.L);
    const ca = run.state.ca = f.idx.map((r) => che.ca[r]), frames = f.idx.map((r) => che.frames[r]);
    run.state.pipe = new Pipeline(ca, frames, f.shape, { nums: f.idx.map((r) => che.nums[r]) });
    const ranked = f.score(run.state.scores).pairs.map(([, i, j]) => [f.posOf.get(i), f.posOf.get(j)]);
    run.state.first = ranked.slice(0, f.mapped);
    run.state.pool = ranked.slice(0, f.mapped * 2);
    run.state.isContact = ([i, j]) => f.D[f.colOf[i] * f.L + f.colOf[j]] < 8;
    run.state.scene = scene(run);
  },
  stages: [pipeline, again, real, check],
};

function scene(run) {
  const { world } = run, { f, ca } = run.state, n = ca.length;
  const mean = [0, 0, 0];
  for (const p of ca) { mean[0] += p[0] / n; mean[1] += p[1] / n; mean[2] += p[2] / n; }
  const group = new THREE.Matrix4().makeTranslation(0, LIFT, 0).multiply(new THREE.Matrix4().makeRotationX(0.3)).multiply(new THREE.Matrix4().makeTranslation(-mean[0], -mean[1], -mean[2]));
  const truth = new THREE.Mesh(ribbonGeometry(ca, ca.map(() => new THREE.Color('#d7e0e5'))), world.paper({ vertexColors: true, transparent: true, opacity: 0.75, glow: 0.3 }));
  truth.matrixAutoUpdate = false; truth.matrix.copy(group);
  world.scene.add(truth);
  run.own({ dispose: () => { world.scene.remove(truth); truth.geometry.dispose(); truth.material.dispose(); } });
  frameBoard(run, 56, 60, { polar: 0.22, at: [0, LIFT - 6, 0], seconds: 0.6 });
  world.shadowSpan(70);
  run.own({ dispose: () => world.shadowSpan(80) });
  const flock = run.own(new Flock(world, n, f.shape, { size: 1.7 }));
  flock.paint(() => STOCK.high);
  let ribbon = null;
  const show = (gas) => {
    const P = gas.points(0), fit = superpose(P, ca), T = { R: fit.R, t: fit.cq };
    const placed = gas.frames.map((F, i) => {
      const R = [0, 1, 2].flatMap((a) => [0, 1, 2].map((b) => T.R[a * 3] * F.R[b] + T.R[a * 3 + 1] * F.R[3 + b] + T.R[a * 3 + 2] * F.R[6 + b]));
      return { R, t: fit.fitted[i] };
    });
    placed.forEach((F, i) => flock.place(i, F.R, F.t, group));
    flock.commit();
    if (ribbon) { world.scene.remove(ribbon); ribbon.geometry.dispose(); ribbon.material.dispose(); }
    ribbon = new THREE.Mesh(ribbonGeometry(fit.fitted, fit.fitted.map(() => STOCK.good)), world.paper({ vertexColors: true, glow: 0.4 }));
    ribbon.matrixAutoUpdate = false; ribbon.matrix.copy(group); ribbon.castShadow = true;
    world.scene.add(ribbon);
    world.shadowDirty = 3;
  };
  run.own({ dispose: () => { if (ribbon) { world.scene.remove(ribbon); ribbon.geometry.dispose(); ribbon.material.dispose(); } } });
  return { show };
}

async function pipeline(run) {
  const { ui, sound } = run, { pipe, first, ca, isContact, scene: s } = run.state;
  ui.tags('model', 'real', 'game');
  ui.reads([]);
  await run.line('You now have every idea you need to fold a real protein on this device, so let us do it. This is your own small pipeline, not AlphaFold2.');
  await run.line('The pale ribbon is the real CheY, there for you to compare with.');
  await run.line(`From chapter 2, take the ${run.state.first.length} best pairs. From chapter 4, smooth their triangles into a map. Then lay the map out in 3D, and settle it with small moves on the frames.`);
  ui.say('One thing is borrowed: local shape, up to four residues along the chain, comes from the crystal, and it also decides which hand comes out.');
  await run.until((done) => { ui.ctrl(ui.button('Fold it', () => { ui.ctrl(); done(); }, { id: 'fold' })); });
  ui.say('Folding, in both possible hands.');
  const gas = await run.budget(pipe.foldSlices(first));
  const p = gas.points(), r = rmsd(p, ca), l = lddt(p, ca), hits = first.filter(isContact).length;
  run.state.drafts = [{ gas, r, l, n: first.length, hits }];
  s.show(gas);
  sound.fold();
  sound.setOpening((l - 0.45) / 0.3);
  sound.phrase(5);
  run.reach(1);
  ui.reads([{ value: `${fmt(r)} Å`, label: 'RMSD from the real CheY' }, { value: fmt(l), label: 'lDDT' }, { value: `${hits} of ${first.length}`, label: 'contacts used were real' }]);
  await run.line('From real sequences to a fold, in seconds, with no learned weights, though with local shape read from the crystal. Some of those contacts are still false.');
}

async function again(run) {
  const { ui, sound } = run, { pipe, pool, first, ca, isContact, scene: s } = run.state;
  if (!run.state.drafts) { const g = await run.budget(pipe.foldSlices(first)), p = g.points(); run.state.drafts = [{ gas: g, r: rmsd(p, ca), l: lddt(p, ca), n: first.length, hits: first.filter(isContact).length }]; s.show(g); }
  const drafts = run.state.drafts.slice(0, 1);
  ui.tags('model', 'game');
  await run.line('Here is the idea of <b>recycling</b>. Feed the draft back in as input, and read the data again with a shape in hand.');
  await run.line('In this small pipeline, a new pass may look further down its list of pairs, and keeps those that sit close together in the draft.');
  const c = chart(ui, { height: 82 });
  const draw = () => c.draw(Array.from({ length: PASSES }, (_, k) => ({ value: drafts[k]?.l ?? 0, label: `pass ${k + 1}`, text: drafts[k] ? fmt(drafts[k].l) : '', color: k === 0 ? '#65cbf3' : '#0053d6' })), { max: 1 });
  const control = { done: false, fewer: null };
  const ready = () => drafts.length >= PASSES && control.done && control.fewer;
  const status = () => { const d = drafts[drafts.length - 1]; ui.reads([{ value: `${fmt(d.r)} Å`, label: 'RMSD' }, { value: fmt(d.l), label: 'lDDT' }, { value: `${pct(d.hits / d.n)} of ${d.n}`, label: 'contacts real' }]); };
  status();
  ui.say('Feed each draft back up to pass 4, then run both controls.');
  await run.until((done) => {
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const feed = ui.button('Feed it back', async () => {
      if (drafts.length >= PASSES) return;
      feed.disabled = true;
      const { contacts, gas } = await run.budget(pipe.recycleSlices(drafts[drafts.length - 1].gas, pool));
      const p = gas.points(), d = { gas, r: rmsd(p, ca), l: lddt(p, ca), n: contacts.length, hits: contacts.filter(isContact).length };
      drafts.push(d);
      s.show(gas);
      draw(); status();
      sound.setOpening((d.l - 0.45) / 0.3);
      sound.fold(); sound.phrase(5);
      feed.disabled = drafts.length >= PASSES;
      if (ready()) { run.reach(2); nxt.disabled = false; }
    }, { id: 'feed' });
    const ctl = ui.button('Control: feed nothing', async () => {
      ctl.disabled = true;
      const g = await run.budget(pipe.foldSlices(first)), p = g.points(), same = Math.abs(rmsd(p, ca) - drafts[0].r);
      control.done = true;
      control.same = same;
      ui.say(`With nothing fed back the calculation simply repeats, to ${same < 1e-9 ? 'every digit' : `${same.toExponential(1)} Å`}, as any fixed calculation must, so this control only confirms that the feed is what changed.`);
      if (ready()) { run.reach(2); nxt.disabled = false; }
    }, { quiet: true, id: 'control' });
    const ctl2 = ui.button('Control: fewer pairs, no draft', async () => {
      ctl2.disabled = true;
      const few = first.slice(0, first.length >> 1), g = await run.budget(pipe.foldSlices(few)), p = g.points();
      control.fewer = { r: rmsd(p, ca), l: lddt(p, ca), n: few.length };
      ui.say(`Using only the top ${few.length} pairs, with no draft at all, gives ${fmt(control.fewer.r)} Å and lDDT ${fmt(control.fewer.l)}.`);
      if (ready()) { run.reach(2); nxt.disabled = false; }
    }, { quiet: true, id: 'control2' });
    ui.ctrl(c, feed, ctl, ctl2, nxt);
    draw();
  });
  ui.ctrl();
  const gains = drafts.map((d) => d.l);
  ui.reads([{ value: `${fmt(gains[0])} to ${fmt(Math.max(...gains))}`, label: 'best lDDT reached' }, { value: `${fmt(drafts[1].r - drafts[0].r)} Å`, label: 'RMSD change at pass 2' }]);
  const fw = control.fewer;
  await run.line('The gain is small and comes early. After that it stops, and it can even slip back. This is one run, and the note gives the numbers across several.');
  await run.line(`And look at your second control: ${fmt(fw.r)} Å with fewer pairs and no draft at all. In this small pipeline the gain comes from which pairs are used. The draft drops some of the worst pairs and lets in more real ones, though the share of real contacts does not rise. Its distances alone do not help.`);
  await run.line('So do not take this as how AlphaFold2 gains. It shows that a draft can help you re-read data, and that passes run out when nothing new comes in.');
  run.state.drafts = drafts;
}

// Your draft as AlphaFold2 would get such a thing back: C-beta distances in 15 bins, 3.25 to 20.75 A in config.py.
function binnedDraft(gas, n) {
  const P = gas.points(3), box = document.createElement('canvas'), size = 150;
  box.className = 'chart';
  box.style.height = `${size}px`;
  box.paint = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = box.clientWidth || 300;
    box.width = W * dpr; box.height = size * dpr;
    const g = box.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = size / n, x0 = (W - size) / 2;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]);
        if (d < 3.25) continue; // in AlphaFold2 a distance under the first edge falls in no bin
        const bin = Math.min(14, Math.floor((d - 3.25) / 1.25));
        g.fillStyle = `hsl(${212 - bin * 4}, 75%, ${28 + bin * 4.6}%)`;
        g.fillRect(x0 + j * cell, i * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  };
  return box;
}

async function real(run) {
  const { ui } = run, { f, ca, pipe, first } = run.state;
  const af = getModel('P0AE67'), che = f.che;
  if (!run.state.drafts) { const g = await run.budget(pipe.foldSlices(first)), p = g.points(); run.state.drafts = [{ gas: g, r: rmsd(p, ca) }]; }
  // The same residues on both sides: those the alignment covers.
  const pa = f.idx.map((r) => af.ca[af.nums.indexOf(che.nums[r])]);
  const drafts = run.state.drafts, last = drafts[drafts.length - 1];
  ui.reads([]);
  ui.tags('paper');
  await run.line('Now what AlphaFold2 really does, because it is not what your pipeline did.');
  await run.line('It feeds back three things: the first row of the MSA table, the pair table, and the predicted C-beta distances, sorted into 15 bins.');
  const box = binnedDraft(last.gas, ca.length);
  ui.tags('paper', 'game');
  await run.until((done) => { ui.say('This is your last draft in that form: nothing but a table of coarse distances.'); ui.ctrl(box, ui.button('Next', () => done(), { id: 'next' })); box.paint(); });
  ui.ctrl();
  ui.tags('paper');
  await run.line('The frames themselves are not kept. Each pass starts them again from the black hole, so coordinates return only as those binned distances.');
  await run.line('So do not picture a draft being polished. Each pass builds the structure again, from richer tables and a new sample of sequences.');
  await run.line('The authors found that removing recycling hurts accuracy. It also gives a much deeper network, with almost no extra weights.');
  ui.tags('af2', 'real', 'game');
  ui.reads([{ value: `${fmt(last.r)} Å`, label: `your pipeline, last pass, ${ca.length} residues` }, { value: `${fmt(rmsd(pa, ca))} Å`, label: `real AlphaFold2, the same ${ca.length} residues` }]);
  await run.line('Here is the real thing beside yours. This crystal dates from 1991, so AlphaFold2 may have trained on it, and the database pipeline can also read known structures as templates. So this gap says little about a new protein.');
  ui.reads([]);
  ui.tags('paper');
  await run.line('The fair test was blind. In CASP14, on structures not yet public, the median backbone error of AlphaFold2 was 0.96 Å, and the next best method reached 2.8 Å.');
}

async function check(run) {
  const { ui } = run;
  ui.tags('model');
  const first = await run.choose('A new case. Someone runs a network 50 passes with the output NOT fed back and the same input each time. What happens?', [
    { text: 'It keeps improving, just slowly.', right: false, why: 'Your control showed no change at all. Nothing new went in.' },
    { text: 'Nothing changes after the first pass.', right: true, why: 'Right. A fixed network on a fixed input gives a fixed output. Improvement needs something to change.' },
    { text: 'It gets worse.', right: false, why: 'It stays exactly the same.' },
  ]);
  const second = await run.choose('Why might a protein with few homologues gain more from recycling than one with many?', [
    { text: 'One pass leaves it far from done, so later passes still have work to do.', right: true, why: 'Yes, and that matches ColabFold, where extra recycles helped mostly on targets with little MSA information.' },
    { text: 'Few sequences mean a faster network.', right: false, why: 'Speed does not change accuracy.' },
    { text: 'Recycling invents new sequences.', right: false, why: 'It resamples the sequences it has. It cannot create new evidence.' },
  ]);
  if (first && second) run.reach(3);
}
