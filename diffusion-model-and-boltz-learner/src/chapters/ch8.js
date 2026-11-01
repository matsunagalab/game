// Chapter 8. What Boltz added: the family, Boltz-steering run for real on the map, confidence, and affinity with its limits.
import { boltzRun, rama } from '../science/data.js';
import { populations, sliced } from '../science/stats.js';
import { steerRun } from '../science/steer.js';
import { check, chart, fieldOf, fmt, pct, Tank } from './common.js';
import { makeRng } from '../science/rng.js';

export default {
  id: 'boltz',
  title: 'What Boltz added',
  tease: 'Open weights, the recipe of steering run on the map, and an affinity head with honest limits.',
  principle: 'Boltz-1 is an open reproduction of AlphaFold3 with changes to pairing, cropping, pocket conditioning, the reverse step and confidence. Boltz-steering, switched on with --use_potentials, tilts samples with hand-made potentials, by gradient steps and resampling, to fix physical errors. Boltz-2 adds ensembles in training, more conditioning and an affinity head, which ranks well on some benchmarks and poorly on others.',
  goals: ['Run steering in all four modes.', 'Tune resampling to reach the exact target, with under 2% in the zone.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>Boltz-1.</b> Wohlwend et al., bioRxiv 2024, version posted May 2025. MIT licence for training and inference code, weights, data and benchmarks. Its authors report accuracy on a par with AlphaFold3 and Chai-1 on their own test set and CASP15, with AlphaFold3 slightly ahead on mean LDDT. They stress that "training" was 68k steps at batch size 128, against nearly 150k at 256 for AlphaFold3.</p>
    <p><b>Steering numbers.</b> On their test set, 57% of Boltz-1's top poses fail PoseBusters-type checks. For Boltz-1x the pass rate is 97%, with similar accuracy.</p>
    <p><b>Default run.</b> Steering is off by default. Add <i>--use_potentials</i>. Boltz-1 with it is Boltz-1x, and Boltz-2 with it is Boltz-2x. A plain <i>boltz predict</i> gives Boltz-2 with 3 recycling steps, 200 sampling steps, 1 sample and step scale 1.5, with no steering, and only the contact and template potentials you ask for with <i>force: true</i> (<i>main.py</i>, <i>docs/prediction.md</i>).</p>
    <p><b>Steering here.</b> The recipe is the paper's Algorithm 2 and <i>sample()</i> in <i>modules/diffusionv2.py</i>: a flat-bottom energy on the denoised guess, 20 gradient steps on it, and every third step importance resampling among 3 particles, with the likelihood-ratio term. In Boltz those 20 steps apply per potential, at intervals of 1 to 5 by kind, over seven physical kinds plus contact and template. Here there is one potential. The field is the exact denoiser, with η = 1 and γ₀ = 0.6. The target is known exactly, because it is the data with the disc removed. In Boltz nobody knows this target. Energies have different units in Boltz, so the best λ here says nothing about its default of 4. All numbers on screen come from your run.</p>
    <p><b>Confidence.</b> The score that sorts samples is 0.8 × complex pLDDT + 0.2 × ipTM, or pTM for one chain (<i>docs/prediction.md</i>).</p>
    <p><b>Affinity.</b> From Passaro et al. Figure 6 and Section 5.3: on 4 FEP+ targets, FEP+ 0.78, ABFE 0.75, Boltz-2 0.66, OpenFE 0.66, MM/PBSA 0.18. On the larger OpenFE set of 876 measurements, FEP+ 0.72, OpenFE 0.63, Boltz-2 0.62. On eight blinded Recursion assays, Pearson R above 0.55 on 3 of 8, and 0.39 on average. Training excluded proteins at 90% identity or more to the benchmark. Their ABFE results may be optimistic, as they note, since the protocol was tuned on that subset.</p>
    <p><b>The teaching model for R.</b> Forty invented ligands with true values of unit variance, and predictions correlated with them at the chosen R. It assumes only Gaussian errors. Real ones are not.</p>
    <p class="small">Passaro et al., bioRxiv 10.1101/2025.06.14.659707. Wohlwend et al., bioRxiv 10.1101/2024.11.19.624167. Singhal et al., arXiv 2501.06848 (2025), Feynman-Kac steering. Buttenschoen et al., Chem Sci 15, 3130 (2024), PoseBusters. Wan et al., J Chem Theory Comput 22, 7811 (2026). Bret et al., J Chem Inf Model 66, 1511 (2026).</p>`,

  async setup(run) {
    const T = run.state.T = new Tank(run, { drops: Math.min(16000, run.world.dropCount) }), d = run.state.d = rama();
    run.ui.say('Mixing the water.');
    run.state.F = await fieldOf(run, 'general', d.train.x, d.train.y);
    const n = Math.min(4000, d.train.x.length);
    T.paint(d.train.x, d.train.y, n * 2, { boost: 1.6 });
  },
  stages: [family, steering, confidence, affinity, checkStage],
};

async function family(run) {
  const { ui } = run;
  ui.tags('paper');
  await run.line('AlphaFold3 showed the design: a Pairformer trunk and a diffusion module on raw atoms. The Boltz authors note that it and Chai-1 came with commercial limits and no training code.');
  await run.line('<b>Boltz-1</b> started by reproducing AlphaFold3 from its supplement, then trained and released everything under the MIT licence: code, weights, data and benchmarks. Its own tests put it on a par with AlphaFold3 and Chai-1 on most measures.');
  await run.line('It also changed things. A new way to pair alignments, a cropping method between sequence and space, pocket conditioning that works from partial hints, alignment inside the reverse step, and a larger confidence model.');
  await run.line('<b>Boltz-2</b> added molecular dynamics and NMR ensembles to training, a head for B-factors, conditioning on method, templates and contacts, and an affinity module. It also moved its training cut-off from September 2021 to June 2023.');
  await run.line('There was one big flaw to fix. On their test set, 57% of Boltz-1\'s top poses failed physical checks: clashes, bad bonds, wrong chirality, chains on top of each other. Its recipe you can run yourself, on the map.');
}

async function steering(run) {
  const { ui, sound } = run, { T, d, F } = run.state, D = (x, y, s, o) => F.at(x, y, s, o);
  ui.tags('game', 'model');
  let zone = { x: -110, y: 140, r: 45 };
  const inside = (x, y) => Math.hypot(x - zone.x, y - zone.y) < zone.r;
  const px = new Float32Array(T.N), py = new Float32Array(T.N);
  T.extra.push((g, w) => {
    const c = w.project(zone.x, zone.y), e = w.project(zone.x + zone.r, zone.y), r = e.x - c.x;
    g.strokeStyle = 'rgba(194,24,91,.85)'; g.lineWidth = 1.6; g.setLineDash([5, 4]); g.beginPath(); g.arc(c.x, c.y, r, 0, 7); g.stroke(); g.setLineDash([]);
  });
  await run.line('Pretend part of this map is physically impossible, a clash. The dashed disc is that zone. The potential is <b>flat-bottomed</b>: zero outside, rising inside, as in Boltz.');
  await run.line('In this toy we know the exact right answer: the same data with the disc cut out. In Boltz nobody knows that target. Here we can measure how close steering gets.');
  await run.line('<b>Guidance</b> pushes the denoised guess out of the zone with gradient steps. <b>Resampling</b> keeps a few copies of each sample, and favours those that are lowering their energy.');
  const keep = []; for (let i = 0; i < d.train.x.length; i += 1) if (!inside(d.train.x[i], d.train.y[i])) keep.push(i);
  const tx = Float32Array.from(keep, (i) => d.train.x[i]), ty = Float32Array.from(keep, (i) => d.train.y[i]), target = populations(tx, ty);
  ui.reads([{ id: 'r-v', value: '–', label: 'in the zone' }, { id: 'r-d', value: '–', label: 'degrees from the exact target' }, { id: 'r-p', value: '–', label: 'helix / strand / φ above 0' }, { value: `${pct(target[0])} / ${pct(target[1])} / ${pct(target[2], 1)}`, label: 'exact target' }]);
  const seen = {};
  let lambda = 4;
  const once = async (mode) => {
    const rng = makeRng(7), N = 1500, it = steerRun(D, rng, { zone, N, mode, lambda, gdWeight: 25 });
    const res = await run.budget(it, (v) => {
      const P = v.P, n = Math.min(T.N, N);
      for (let a = 0; a < n; a += 1) { px[a] = v.x[a * P]; py[a] = v.y[a * P]; }
      T.setZoom(Math.max(1, 1 + (2.1 * v.s - 30) / 180), 0.15);
      T.paint(px, py, n, { sigma: v.s, boost: 3 });
      run.sound.setSigma(Math.min(1, v.s / 200));
    }, 8);
    let v = 0;
    for (let i = 0; i < res.X.length; i += 1) if (inside(res.X[i], res.Y[i])) v += 1;
    const pop = populations(res.X, res.Y), dist = sliced(res.X, res.Y, tx, ty);
    px.set(res.X); py.set(res.Y); T.setZoom(1, 0.2); T.paint(px, py, res.X.length, { boost: 3 });
    ui.read('r-v', pct(v / res.X.length, 1)); ui.read('r-d', fmt(dist, 1)); ui.read('r-p', `${pct(pop[0])} / ${pct(pop[1])} / ${pct(pop[2], 1)}`);
    return { v: v / res.X.length, dist, pop };
  };
  const words = {
    none: 'No steering: droplets land in the zone just as if it were not there.',
    guide: 'Guidance alone: most droplets are pushed out, and they pile up at the wall. The populations hardly move, because nothing can shift weight between islands.',
    resample: 'Resampling alone: the zone empties and weight moves to the other islands. It can overshoot, and samples get duplicated.',
    both: 'Both, as Boltz does with --use_potentials. Gradients make the local repair and resampling moves the weight.',
  };
  ui.say('<b>Run all four modes.</b>');
  await run.until((done) => {
    let busy = false;
    const mk = (m, label) => ui.button(label, async (b) => {
      if (busy) return;
      busy = true;
      const r = await once(m);
      busy = false;
      if (!r) return;
      seen[m] = r; b.className = 'btn on'; run.state.seen = seen;
      ui.say(words[m]); sound.drip?.(0.7);
      if (Object.keys(seen).length === 4) { run.reach(1); ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); }
    }, { quiet: true, id: `s-${m}` });
    ui.ctrl(ui.chips([mk('none', 'None'), mk('guide', 'Guidance'), mk('resample', 'Resampling'), mk('both', 'Both')]));
  });
  ui.ctrl();
  await run.line(`Now look at "both": ${pct(seen.both.v, 1)} in the zone, but ${fmt(seen.both.dist, 0)}° from the exact target. It removed the zone and went too far. Strength λ sets how hard resampling favours lower energy.`);
  ui.say('<b>Tune λ so that under 2% land in the zone and the result is within 8° of the exact target.</b>');
  await run.until((done) => {
    let busy = false;
    const L = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8, 16];
    const sl = ui.slider({ label: 'λ', min: 0, max: L.length - 1, step: 1, value: 7, id: 'lambda', format: (v) => `${L[v]}`, onInput: (v) => { lambda = L[v]; } });
    const go = ui.button('Run', async (b) => {
      if (busy) return;
      busy = true; b.disabled = true;
      const r = await once('both');
      busy = false; b.disabled = false;
      if (!r) return;
      run.state.lastSteer = r;
      if (r.v < 0.02 && r.dist <= 8) { sound.good(2); run.reach(2); ui.ctrl(); done(); } else if (r.v >= 0.02) ui.say('Too weak: droplets are still in the zone.'); else ui.say('The zone is clean, but the weights have moved too far from the target. Ease off.');
    }, { id: 'run' });
    ui.ctrl(sl, go);
  });
  await run.line('There. A strength that clears the zone without wrecking the rest. Remember what you did: you tuned against an exact target, which real users never have. Boltz-1x reports 97% of poses passing the checks, with accuracy held about the same.');
  await run.line('Steering tilts a distribution with rules for what is forbidden. It is not a force field, and it does not make the samples thermodynamic. Chapter 9 measures what that means.');
  T.extra.length = 0; T.clear();
}

async function confidence(run) {
  const { ui } = run, R = boltzRun();
  ui.tags('boltz', 'paper');
  const P = R.complexPlddt.toFixed(3), M = R.ptm.toFixed(3), C = (0.8 * R.complexPlddt + 0.2 * R.ptm).toFixed(3);
  ui.reads([{ value: P, label: 'complex pLDDT' }, { value: M, label: 'pTM' }, { value: R.confidence.toFixed(3), label: 'confidence score it reported' }]);
  await run.line('Boltz predicts its own errors as well. pLDDT is its estimate of local accuracy, and pTM of the overall fold. Those numbers come from the real run in chapter 7. The score that sorts samples is 0.8 × pLDDT + 0.2 × ipTM, or pTM for a single chain, so here 0.8 × ' + P + ' + 0.2 × ' + M + ' = ' + C + '.');
  await run.line('It ranks samples for you, so you can read the top one first. It is no probability of being right, and it does not say how often a state occurs.');
}

function correlated(R, rng) {
  const n = 40, t = [], p = [];
  for (let i = 0; i < n; i += 1) { const a = rng.n(); t.push(a); p.push(R * a + Math.sqrt(1 - R * R) * rng.n()); }
  return { t, p };
}

async function affinity(run) {
  const { ui } = run, { T } = run.state;
  ui.tags('paper', 'model');
  T.showMap = false;
  await run.line('Boltz-2\'s affinity module reads the predicted structure and the trunk\'s pair features. It gives two outputs: a chance of binding, and a value on a scale like log10 of IC50 in µM, the concentration that halves an activity.');
  const c = chart({ height: 104 });
  const bars = [['FEP+', 0.78], ['ABFE', 0.75], ['Boltz-2', 0.66], ['OpenFE', 0.66], ['MM/PBSA', 0.18]];
  ui.reads([]);
  ui.ctrl(c);
  c.bars(bars.map(([label, v]) => ({ label, value: v, text: v.toFixed(2), color: label === 'Boltz-2' ? '#6a2c91' : '#2336a8' })), { max: 1 });
  await run.hold(new Promise((r) => { ui.say('Their headline: Pearson R on four targets, for ranking similar ligands. FEP+, ABFE and OpenFE are free-energy simulations, and MM/PBSA a cheaper physics score. Boltz-2 ran at least 1,000 times faster than free-energy simulation.'); ui.ctrl$.append(ui.button('Next', () => r(), { id: 'next' })); ui.fit(); requestAnimationFrame(() => c.bars(bars.map(([label, v]) => ({ label, value: v, text: v.toFixed(2), color: label === 'Boltz-2' ? '#6a2c91' : '#2336a8' })), { max: 1 })); }));
  ui.ctrl();
  ui.tags('model', 'game');
  const r2 = (R) => {
    const rng = makeRng(13); let hit = 0;
    const trials = 2000;
    for (let t = 0; t < trials; t += 1) {
      const { t: tt, p } = correlated(R, rng);
      let bi = 0; for (let i = 1; i < p.length; i += 1) if (p[i] > p[bi]) bi = i;
      const rank = tt.filter((v) => v > tt[bi]).length;
      if (rank < 5) hit += 1;
    }
    return hit / trials;
  };
  ui.reads([{ id: 'r-r', value: '0.66', label: 'Pearson R' }, { id: 'r-h', value: pct(r2(0.66)), label: 'top pick is truly in the top 5 of 40' }]);
  ui.say('What does R buy you? A teaching model, not Boltz: 40 ligands, invented, with Gaussian errors. <b>Slide R, and read how often the top pick is truly among the best five.</b>');
  await run.until((done) => {
    const seenR = new Set();
    ui.ctrl(ui.slider({ label: 'R', min: 0.2, max: 0.9, step: 0.02, value: 0.66, id: 'r', format: (v) => v.toFixed(2), onInput: (v) => { ui.read('r-r', v.toFixed(2)); ui.read('r-h', pct(r2(v))); seenR.add(v > 0.75 ? 'hi' : v < 0.45 ? 'lo' : 'mid'); if (seenR.size >= 2 && !document.getElementById('next')) { ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); } } }));
  });
  ui.ctrl();
  ui.tags('paper');
  ui.reads([]);
  await run.line('Now the limits, from the same paper. On eight blinded assays at Recursion, R passed 0.55 on three of eight, and its average was 0.39. The authors warn that public benchmarks do not always carry over to real projects.');
  await run.line('They list more. If the pocket or the conformation is wrong, the affinity is unlikely to be reliable. Cofactors, ions and water are not explicitly handled. Performance varies strongly between assays, for reasons not yet known.');
  await run.line('Others have tested it too. Wan and colleagues in 2026 found no significant correlation with fine-grained ESMACS free energies, a physics-based method, among top-ranked compounds on two targets. Bret and colleagues found that it excelled at separating true docking hits, yet its binary score hardly reacted to key pocket mutations.');
  await run.line('So read affinity numbers as a fast ranker to test, and not as a free energy. It is a model of assay data, trained on structures it predicts itself. It computes no partition function.');
  T.showMap = true;
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. Your model gives clashes in 30% of samples. You run steering, and clashes fall to 1%. What can you now claim?',
      options: [
        { text: 'The samples now follow the Boltzmann distribution, since physics was applied.', why: 'Steering tilts a distribution with hand-chosen penalties. It has no energy that gives Boltzmann weights.' },
        { text: 'Geometry is cleaner, but the populations may have shifted, and with no exact target you must check them another way.', right: true, why: 'Yes. You saw guidance pile droplets at a wall and resampling overshoot, against a target real users never have.' },
        { text: 'Nothing has changed except the clashes.', why: 'You measured otherwise: the weights between islands moved.' },
      ],
    },
    {
      q: 'Boltz-2 gives R = 0.66 on a benchmark and a colleague plans to trust its ranking in a new target with a metal cofactor in the pocket. What do you say?',
      options: [
        { text: 'Fine. R = 0.66 holds everywhere, because the model is general.', why: 'Its own authors report strong variation between assays, and say cofactors are not explicitly handled.' },
        { text: 'Test it first on known ligands of this target. The paper warns that performance varies and that cofactors are not explicitly handled.', right: true, why: 'Yes. A benchmark R is not a guarantee for a new system, least of all outside what the model represents.' },
        { text: 'Never use it, since FEP is always better.', why: 'It ranks well on some sets and runs far faster, and FEP has weak classes too. Use it, and check it.' },
      ],
    },
  ]);
}
