// Chapter 7. Real FAPE, RMSD, dRMSD and lDDT on real structures, a real mirror experiment, and the clamp on a real domain motion.
import * as THREE from 'three';
import { Flock, Quilt, STOCK, Threads } from '../world.js';
import { compose, framesOf, invert, mulRR, rotationAxisAngle, vec } from '../science/frames.js';
import { alignedError, drmsd, fape, lddt, rmsd } from '../science/metrics.js';
import { localAtoms } from '../science/gas.js';
import { Descent } from '../science/descent.js';
import { ambient, chart, fmt, frameBoard, getModel, getStructure, theFamily } from './common.js';

const LIFT = 24;
const mirrorOf = (p) => p.map((x) => [-x[0], -x[1], -x[2]]);

export default {
  id: 'fape',
  title: 'FAPE and the mirror',
  tease: 'Stand on a residue and look. One loss sees a mirror image, and others cannot.',
  principle: 'FAPE stands on each residue in turn, lines up the prediction and the truth on that residue, and measures where every other atom ended up. Each view can only be lined up by rotating, so FAPE sees a mirror image that distances never can. The clamp at 10 Å caps far errors, so they cannot drown out the local ones.',
  goals: ['Run the mirror experiment.', 'See what the clamp takes off each prediction.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>FAPE</b>, Algorithm 28: for every frame i and atom j, compute x<sub>ij</sub> = T<sub>i</sub><sup>−1</sup>∘x<sub>j</sub> in the prediction and in the truth, take the distance d<sub>ij</sub>, and return the mean of min(d<sub>clamp</sub>, d<sub>ij</sub>) divided by Z. Both are 10 Å. So a score of 1 means 10 Å. The final loss uses all atoms in all rigid groups. This game uses Cα atoms in backbone frames, as the per-layer loss does.</p>
    <p><b>The clamp in training.</b> In 90% of training mini-batches the backbone FAPE is clamped at 10 Å, and in the other 10% it is not. Side chains are always clamped (Supplement 1.11.5). FAPE's weight in the loss is 0.5, with 0.5 for the mean per-layer loss, 0.3 distogram, 2.0 masked MSA and 0.01 confidence; in fine-tuning there is also 1.0 violation and 0.01 experimentally resolved (Supplement equation 7).</p>
    <p><b>The mirror.</b> Under x → −x, the local z coordinate of every atom flips, because the frame's third axis comes from a cross product and does not reflect like an ordinary vector (Supplement equations 10 to 17). lDDT and dRMSD use only distances, so they cannot see it. Superposed RMSD sees it only if the fit is limited to proper rotations. FAPE does not depend on how the frames are built: even if every mirrored frame may take its best possible rotation, clamped FAPE stays at about 0.73, which this game's tools measured by a multi-start search. The Supplement proves the general case (1.9.4).</p>
    <p><b>How AF2 gets chirality.</b> The paper calls FAPE "the main source of chirality". There are others: atoms are built from ideal L-amino-acid geometry, so side chains cannot be mirrored even though the backbone can, and a small χ-angle loss is not invariant under reflection. When DeepMind retrained AF2 with a dRMSD loss, lDDT-Cα stayed good but GDT split in two, and many predictions were mirror images (Supplementary Fig. 9).</p>
    <p><b>The experiment here is a stand-in.</b> DeepMind's finding is about training a network. This game runs one optimiser twice. Same crystal, same start, same steps on the coordinates. The FAPE run also re-fits each frame's rotation at every step, because that loss needs frames. The steps carry momentum of 0.8. With the distance loss, every pair should have its real distance. With FAPE, every other residue should sit where it really sits as seen from each frame. Nothing else about the hand is given. On CheY, 1,000 steps gave the real hand in 16 of 16 seeds with FAPE. With distances 11 of 16 took the mirror hand, and 9 of the 16 ended within 1 Å of one hand or the other, so not every run finishes cleanly. The first eight seeds are the ones you ran. The loss still uses the crystal, as a training loss does, so this shows what each loss can tell apart, not how to predict a structure.</p>
    <p><b>Adenylate kinase.</b> 4AKE (open, no ligand) and 1AKE (closed, with the inhibitor Ap5A) are real crystals. The "noise" case is made by this game: each residue is nudged up to 3 Å along each axis and turned by about 29°. Which of the two predictions scores better depends on that choice: with smaller turns FAPE prefers the noisy one. What does not depend on it is that the clamp takes much more off the swing.</p>
    <p><b>Three-helix bundles</b> show a related effect in physics: a fold and its topological mirror can compete in folding simulations (Noel et al. 2012).</p>
    <p class="small">Sources: Jumper et al., Nature 2021, Supplement 1.9.2 to 1.9.5. Mariani et al. 2013 for lDDT. Müller et al. 1996 (4AKE) and Müller and Schulz 1992 (1AKE). Noel et al., J Phys Chem B 2012.</p>`,

  setup(run) {
    const f = run.state.f = theFamily(), che = f.che;
    const open = getStructure('ake4'), closed = getStructure('ake1');
    run.state.open = open; run.state.closed = closed;
    run.state.che = che;
    run.state.cheFrames = che.frames;
    const m = run.state.mirror = { n: mirrorOf(che.n), ca: mirrorOf(che.ca), c: mirrorOf(che.c) };
    run.state.mirrorFrames = framesOf(m);
  },
  stages: [stand, mirror, experiment, clamp, check],
};

async function stand(run) {
  const { ui, world, sound } = run, { open, closed } = run.state, n = open.ca.length;
  const shape = localAtoms(open);
  const truth = run.scoped(new Flock(world, n, shape, { size: 1.5 }));
  const pred = run.scoped(new Flock(world, n, shape, { size: 1.5 }));
  truth.paint(() => new THREE.Color('#9fb2be'));
  pred.paint(() => STOCK.high);
  const th = run.scoped(new Threads(world, n, { width: 0.2 }));
  const group = new THREE.Matrix4().makeTranslation(0, LIFT, 0).multiply(new THREE.Matrix4().makeRotationX(0.32));
  frameBoard(run, 92, 96, { polar: 0.2, at: [0, LIFT - 6, 0], seconds: 0 });
  world.shadowSpan(100);
  run.scoped({ dispose: () => world.shadowSpan(80) });
  const view = (k) => {
    const Ip = invert(open.frames[k]), It = invert(closed.frames[k]);
    let sum = 0;
    th.clear();
    for (let j = 0; j < n; j += 1) {
      const a = compose(Ip, open.frames[j]), b = compose(It, closed.frames[j]);
      pred.place(j, a.R, a.t, group);
      truth.place(j, b.R, b.t, group);
      const d = vec.dist(a.t, b.t);
      sum += Math.min(10, d);
      if (j % 3 === 0 && d > 6) th.add(a.t, b.t, d > 10 ? '#ff7d45' : '#ffc9ab', 0.1, group);
    }
    pred.commit(); truth.commit();
    return sum / n;
  };
  ui.tags('real', 'game');
  const nm = (k) => `${open.seq[k]}${open.nums[k]}`;
  await run.line('A <b>loss</b> tells training how wrong a structure is, so which loss you pick decides what the network learns to care about.');
  await run.line('Here are two real crystals of adenylate kinase. Grey is the closed form, standing in for the truth. Blue is the open form, standing in for a prediction.');
  ui.say('Stand on one residue and line both up on it, then drag along the chain and watch the error.');
  const zones = new Set();
  await run.until((done) => {
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    nxt.disabled = true;
    const go = (v) => {
      const e = view(v);
      sound.pick(v % 6);
      ui.reads([{ value: fmt(e / 10), label: `error seen from ${nm(v)}, in tens of Å` }]);
      const num = open.nums[v];
      zones.add(num >= 122 && num <= 159 ? 'lid' : num >= 30 && num <= 59 ? 'nmp' : 'core');
      if (zones.size >= 2) nxt.disabled = false;
    };
    const s = ui.slider({ label: 'Stand on', min: 0, max: n - 1, step: 1, value: 80, format: nm, onInput: go });
    ui.ctrl(s, nxt);
    go(80);
  });
  ui.ctrl();
  const total = fape(open.frames, open.ca, closed.frames, closed.ca);
  ui.reads([{ value: fmt(total), label: 'FAPE, all residues' }]);
  await run.line('Stand in the moving lid and the lid looks right, but the rest looks far off. Stand in the core and it is the other way round. The error depends on where you stand.');
  await run.line('<b>Frame aligned point error</b>, or FAPE, averages the error over every place you could stand. That is the main loss of the structure module.');
  const af = getModel('P0AE67');
  const pair = af.nums.map((num, i) => [i, run.state.che.nums.indexOf(num)]).filter(([, b]) => b >= 0);
  const fa = pair.map(([a]) => af.frames[a]), pa = pair.map(([a]) => af.ca[a]), ft = pair.map(([, b]) => run.state.che.frames[b]), pt = pair.map(([, b]) => run.state.che.ca[b]);
  ui.tags('af2', 'game');
  ui.reads([{ value: fmt(fape(fa, pa, ft, pt)), label: 'FAPE of real AlphaFold2 CheY against crystal 3CHY' }, { value: `${fmt(rmsd(pa, pt))} Å`, label: 'RMSD' }]);
  await run.line('For scale, that is a real AlphaFold2 model of CheY against its crystal. A warning: this crystal dates from 1991, long before the training cut-off of AlphaFold2, so this was no blind test.');
}

async function mirror(run) {
  const { ui, world, sound } = run, { che, f, mirror: m, mirrorFrames } = run.state, n = che.ca.length;
  const flock = run.scoped(new Flock(world, n, f.shape, { size: 1.8 }));
  flock.paint(() => STOCK.good);
  const c = [0, 0, 0];
  for (const p of che.ca) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
  const base = new THREE.Matrix4().makeTranslation(-c[0], -c[1], -c[2]);
  const sheet = run.scoped(new THREE.Mesh(new THREE.PlaneGeometry(96, 76), world.paper({ color: '#ffffff', transparent: true, opacity: 0.4, glow: 0.6 })));
  sheet.rotation.y = Math.PI / 2; sheet.position.set(0, LIFT, 0); sheet.visible = false;
  world.scene.add(sheet);
  run.scoped({ dispose: () => { world.scene.remove(sheet); sheet.geometry.dispose(); sheet.material.dispose(); } });
  const draw = (x) => {
    const g = new THREE.Matrix4().makeTranslation(0, LIFT, 0).multiply(new THREE.Matrix4().makeRotationX(0.28)).multiply(new THREE.Matrix4().makeScale(x, 1, 1)).multiply(base);
    che.frames.forEach((T, i) => flock.place(i, T.R, T.t, g));
    flock.commit();
  };
  draw(1);
  frameBoard(run, 62, 66, { polar: 0.26, at: [0, LIFT - 6, 0], seconds: 0.5 });
  world.shadowSpan(70);
  run.scoped({ dispose: () => world.shadowSpan(80) });
  ui.tags('real', 'game');
  ui.reads([]);
  await run.line('Three common scores. <b>RMSD</b> lays one structure on the other and measures the gap. <b>dRMSD</b> compares their two tables of distances. <b>lDDT</b> counts how many nearby distances were kept.');
  await run.line('Here is real CheY. Now send it through a mirror. Every distance between atoms stays exactly the same, but it is a molecule that nature does not make.');
  await run.choose('Four scores compare this mirror image with the real protein. Which do you expect to notice?', [
    { text: 'All of them', right: true, why: 'Let us measure.' },
    { text: 'Only some of them', right: true, why: 'Let us measure.' },
  ]);
  ui.say('Pull the sheet through.');
  await run.until((done) => { ui.ctrl(ui.button('Through the mirror', () => { ui.ctrl(); done(); }, { id: 'flip' })); });
  sheet.visible = true;
  sound.fold();
  const t0 = world.time, dur = world.reduce ? 0.01 : 1.5;
  await run.hold(new Promise((res) => {
    const tk = run.tick(() => {
      const e = Math.min(1, (world.time - t0) / dur), s = e * e * (3 - 2 * e);
      draw(1 - 2 * s);
      if (e >= 1) { run.untick(tk); res(); }
    });
  }));
  sheet.visible = false;
  sound.rustle(6, 0.05);
  const r = { lddt: lddt(m.ca, che.ca), d: drmsd(m.ca, che.ca), rmsd: rmsd(m.ca, che.ca), fape: fape(mirrorFrames, m.ca, che.frames, che.ca), full: rmsd(m.ca, che.ca, { mirror: true }) };
  run.state.mirrorScores = r;
  ui.reads([{ value: fmt(r.lddt, 3), label: 'lDDT (1 is perfect)' }, { value: `${fmt(r.d, 3)} Å`, label: 'dRMSD (0 is perfect)' }, { value: `${fmt(r.rmsd, 1)} Å`, label: 'RMSD, fitted by rotation' }, { value: fmt(r.fape), label: 'FAPE (0 is perfect)' }]);
  await run.line('lDDT and dRMSD call it perfect. They only ever look at distances, and a mirror keeps every distance.');
  await run.line('RMSD notices, as long as the fit may only rotate. FAPE notices too: it lines up each view by rotating only, so a mirror image can never be laid onto the truth.');
}

async function experiment(run) {
  const { ui, world, sound } = run, { che, f } = run.state, n = che.ca.length;
  // Both runs use these centred real coordinates, the same seeds, the same steps and the same rate.
  const m = [0, 0, 0];
  for (const p of che.ca) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
  const ca = che.ca.map((p) => [p[0] - m[0], p[1] - m[1], p[2] - m[2]]), frames = che.frames.map((T, i) => ({ R: T.R, t: ca[i] }));
  const flock = run.scoped(new Flock(world, n, f.shape, { size: 1.7 }));
  flock.paint(() => STOCK.good);
  const group = new THREE.Matrix4().makeTranslation(0, LIFT, 0).multiply(new THREE.Matrix4().makeRotationX(0.28));
  const draw = (d) => { const p = d.points(); for (let i = 0; i < n; i += 1) flock.place(i, d.R[i], p[i], group); flock.commit(); };
  frameBoard(run, 62, 66, { polar: 0.26, at: [0, LIFT - 6, 0], seconds: 0.5 });
  world.shadowSpan(70);
  world.liveShadows = true;
  run.scoped({ dispose: () => { world.liveShadows = false; world.shadowSpan(80); } });
  ui.reads([]);
  ui.tags('model', 'real', 'game');
  await run.line('Does this matter? Build CheY from the black hole by gradient descent with momentum: small downhill steps on the coordinates, each keeping some of the last step\'s push. Start from eight different tiny nudges. Bars show the distance from the real structure.');
  const results = { distance: [], fape: [] };
  const cd = chart(ui, { height: 66 }), cf = chart(ui, { height: 66 });
  const paint = () => {
    for (const [c, key] of [[cd, 'distance'], [cf, 'fape']]) {
      const r = results[key];
      c.draw(Array.from({ length: 8 }, (_, i) => ({ value: r[i]?.rmsd ?? 0, label: `${i + 1}`, text: r[i] ? r[i].rmsd.toFixed(1) : '', color: r[i]?.mirrored ? '#ff7d45' : '#0053d6' })), { max: 18 });
    }
  };
  const go = async (key) => {
    for (let s = 0; s < 8; s += 1) {
      const d = new Descent(frames, ca, { loss: key, seed: 11 + 12 * s, rate: 0.9, polish: 12 });
      await run.budget(d.slices(1000), () => { if (d.steps % 40 === 0) draw(d); });
      draw(d);
      const p = d.points(), a = rmsd(p, ca), b = rmsd(p, ca, { mirror: true });
      results[key].push({ rmsd: a, mirrorRmsd: b, mirrored: b < a, lddt: lddt(p, ca), score: d.score });
      paint();
      sound.pick(s);
      ui.reads([{ value: `${s + 1} of 8`, label: 'runs' }, { value: fmt(results[key][s].lddt, 3), label: 'lDDT of this run' }]);
    }
    sound.fold();
    const r = results[key];
    return { mirrors: r.filter((x) => x.mirrored).length };
  };
  ui.say('First give it a table of real distances, and nothing else.');
  await run.until((done) => { ui.ctrl(cd, ui.button('Run eight with the distance loss', () => done(), { id: 'go' })); paint(); });
  ui.ctrl(cd);
  const dist = await go('distance');
  run.state.mirrorRuns = results.distance;
  const away = results.distance.filter((x) => x.mirrored).map((x) => x.mirrorRmsd);
  ui.reads([{ value: `${dist.mirrors} of 8`, label: 'took the mirror hand' }, ...(away.length ? [{ value: `${fmt(Math.min(...away), 1)} to ${fmt(Math.max(...away), 1)} Å`, label: 'those runs, from the mirror image' }] : [])]);
  ui.say('Orange bars took the mirror hand: they sit nearer the mirror image than the real fold, and a distance loss cannot tell the two apart.');
  await run.until((done) => { ui.ctrl(cd, ui.button('Now run eight with FAPE', () => done(), { id: 'go2' })); paint(); });
  ui.ctrl(cd, cf);
  paint();
  const fp = await go('fape');
  run.state.fapeRuns = results.fape;
  ui.reads([{ value: `${dist.mirrors} of 8`, label: 'mirror hand, distance loss' }, { value: `${fp.mirrors} of 8`, label: 'mirror hand, FAPE' }]);
  run.reach(1);
  for (const text of ['Same crystal, same start, same steps on the coordinates.', 'The FAPE run also re-fits each frame\'s rotation at every step, because that loss needs frames.']) await run.until((done) => { ui.say(text); ui.ctrl(cd, cf, ui.button('Next', () => done(), { id: 'next' })); paint(); });
  ui.ctrl();
  await run.line('A view from a right-handed frame has a hand. A table of distances does not.');
  ui.tags('paper');
  ui.reads([]);
  await run.line('When DeepMind trained real AlphaFold2 with a distance loss, it often made mirror images too.');
  await run.line('So AlphaFold2 gets the right hand mostly through FAPE, as the paper says. Frames line up by rotation only, so a mirror image can never be laid onto the truth.');
  await run.line('Side chains are also built from ideal left-handed amino acids, so AF2 can nearly mirror a backbone, but it can never mirror the side chains.');
}

async function clamp(run) {
  const { ui, world, sound } = run, { open, closed } = run.state, n = open.ca.length;
  // A teaching prediction: the real closed form with every residue knocked a little. Same seed every time.
  const knocked = (turn) => {
    let seed = 7;
    const r = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647 - 0.5; };
    const ca = closed.ca.map((p) => p.map((v) => v + r() * 6));
    return { ca, fr: closed.frames.map((T, i) => ({ R: mulRR(rotationAxisAngle([r(), r(), r()], turn), T.R), t: ca[i] })) };
  };
  const noisy = knocked(0.5), gentle = knocked(0.1);
  const cases = { swing: { fr: open.frames, ca: open.ca, name: 'Real swing' }, noise: { fr: noisy.fr, ca: noisy.ca, name: 'Bit off everywhere' } };
  const step = 2, cells = Math.floor(n / step);
  const quilt = run.scoped(new Quilt(world, cells, {}));
  frameBoard(run, cells + 5, cells + 5);
  let which = 'swing', dc = 10;
  const col = new THREE.Color(), E = {};
  for (const k of Object.keys(cases)) E[k] = alignedError(cases[k].fr, cases[k].ca, closed.frames, closed.ca);
  const paint = () => {
    const e = E[which];
    for (let i = 0; i < cells; i += 1) for (let j = 0; j < cells; j += 1) {
      const v = e[(i * step) * n + j * step];
      const t = Math.min(1, Math.min(v, dc) / 22);
      quilt.set(i, j, t < 0.5 ? col.copy(STOCK.white).lerp(STOCK.good, t * 2) : col.copy(STOCK.good).lerp(STOCK.high, (t - 0.5) * 2));
    }
    quilt.commit();
  };
  const score = (k, c = dc) => fape(cases[k].fr, cases[k].ca, closed.frames, closed.ca, { clamp: c });
  const free = { swing: score('swing', Infinity), noise: score('noise', Infinity) };
  const ra = rmsd(open.ca, closed.ca), rb = rmsd(noisy.ca, closed.ca);
  const seen = new Set();
  const status = () => {
    const a = score('swing'), b = score('noise');
    run.state.clampRead = { a, b, free };
    ui.reads([{ value: `${fmt(a)} / ${fmt(b)}`, label: `FAPE, swing / bit off, ${Number.isFinite(dc) ? `clamp ${dc} Å` : 'no clamp'}` }, { value: `${Math.round((1 - a / free.swing) * 100)}% / ${Math.round((1 - b / free.noise) * 100)}%`, label: 'taken off by this clamp' }, { value: `${fmt(ra, 1)} / ${fmt(rb, 1)} Å`, label: 'RMSD, swing / bit off' }]);
    seen.add(dc);
    if (seen.has(10) && seen.has(Infinity)) run.reach(2);
  };
  ui.tags('model', 'real', 'game');
  ui.reads([]);
  await run.line('One more design choice. This quilt is an error map: row i, column j shows where residue j lands if you stand on residue i. It is the inner part of FAPE.');
  paint();
  await run.line('Two predictions of the closed form. In one, a real domain has swung away, with each domain nearly unchanged inside. In the other, every residue is a little off, and the game made that one.');
  ui.say('FAPE caps each error at a <b>clamp</b> distance, so move the clamp and see what it takes off each prediction.');
  const steps = [2, 5, 10, 20, Infinity];
  await run.until((done) => {
    const nxt = ui.button('Next', () => done(), { id: 'next' });
    const tog = ui.button('Real swing', (b) => { which = which === 'swing' ? 'noise' : 'swing'; b.textContent = cases[which].name; paint(); status(); sound.tap(); }, { quiet: true, id: 'case' });
    const s = ui.slider({ label: 'Clamp', min: 0, max: 4, step: 1, value: 2, format: (v) => (Number.isFinite(steps[v]) ? `${steps[v]} Å` : 'none'), onInput: (v) => { dc = steps[v]; paint(); status(); sound.pick(v); } });
    ui.ctrl(s, tog, nxt);
    status();
  });
  ui.ctrl();
  dc = 10; paint(); status();
  const soft = fape(gentle.fr, gentle.ca, closed.frames, closed.ca);
  await run.line('The clamp takes far more off the swing. Both predictions have about the same share of errors beyond 10 Å, but the swing\'s run far past the cap, and the noise\'s only just cross it. Past the cap, an error counts the same however large it is.');
  await run.line(`Which prediction wins depends on the noise. The game turned every frame by 29°. With a 6° turn the same noise scores ${fmt(soft)}, better than the swing.`);
  await run.line('So the clamp makes a loss care more about local structure. An error far away cannot drown out everything nearby.');
  ui.reads([]);
}

async function check(run) {
  const { ui } = run;
  ambient(run);
  ui.tags('model');
  const first = await run.choose('A new case. A model has lDDT 0.98 against the crystal, but its helices all turn the wrong way. How could that be?', [
    { text: 'It cannot. lDDT would catch it.', right: false, why: 'Your mirror run gave lDDT 1.000. lDDT reads only distances.' },
    { text: 'It is a mirror image, and lDDT cannot see that. Check the fit by rotation only, or FAPE.', right: true, why: 'Right. A mirror keeps all distances, so lDDT stays high. Rotation-only RMSD and FAPE both catch it.' },
    { text: 'The crystal must be wrong.', right: false, why: 'Right-handed helices are the rule for L-amino acids. Look at the model first.' },
  ]);
  const second = await run.choose('Two domains are each nearly right, but the angle between them is wrong. What does the clamp do to that mistake?', [
    { text: 'It caps the far errors, so the mistake costs much less than its RMSD suggests.', right: true, why: 'Yes. Your adenylate kinase run showed the clamp taking far more off the swing than off the noise.' },
    { text: 'It makes the mistake cost more, since FAPE stands on every residue.', right: false, why: 'Standing on every residue finds the correct local views too, and the clamp caps the rest.' },
    { text: 'It changes nothing.', right: false, why: 'Your run showed the score of the swing fall a lot when the clamp came on.' },
  ]);
  if (first && second) run.reach(3);
}
