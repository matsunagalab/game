// Chapter 7. Conditioning: the same noise under different conditions, on real residues and on real adenylate kinase, then a real Boltz-2 run.
import { adk, boltzRun, byAA, rama } from '../science/data.js';
import { populations } from '../science/stats.js';
import { heun, schedule } from '../science/sampler.js';
import { Mix2D } from '../science/mix2d.js';
import { Ensemble, rg } from '../science/cart.js';
import { fitRmsd } from '../science/kabsch.js';
import { chainBonds, chainInk, dragTurn, fitMol, MolInk } from '../mol.js';
import { check, fieldOf, fmt, Pour, pct, sigmaLevel, Tank } from './common.js';
import { makeRng } from '../science/rng.js';

const SMAX = 400, SMIN = 1, STEPS = 12;
const zoomOf = (s) => Math.max(1, 1 + (2.1 * s - 30) / 180);
const CONDS = { all: 'Any residue', G: 'Glycine', P: 'Proline', A: 'Alanine' };

export default {
  id: 'condition',
  title: 'Same noise, different answer',
  tease: 'What the trunk gives the denoiser, and how a condition turns one noise into many structures.',
  principle: 'A conditional denoiser predicts the clean point given extra information. The trunk of Boltz turns the sequence into single and pair representations, once, and the denoiser reads them at every step. With a strong condition the distribution is narrow, so the very first guess can already be close to the final answer. Only then does the sampling matter for what remains uncertain.',
  goals: ['Send the same noise to different islands, by condition alone.', 'Predict, within 20 points, how often an unconditioned run closes adenylate kinase.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>The trunk.</b> In Boltz-2 the input embedder, template module, MSA module (4 blocks) and Pairformer (64 blocks, 48 in Boltz-1 and AlphaFold3) give a single representation per token and a pair representation per pair of tokens. Recycling repeats the trunk, 3 times by default in Boltz. The trunk is run once per complex, independent of diffusion time, as Boltz-1's paper notes. The diffusion module, 3 + 24 + 3 blocks, reads these at every step. (<i>boltz/main.py</i>, Wohlwend et al. Section 3.)</p>
    <p><b>Conditional fields on the map.</b> The exact denoiser of one residue type. Glycine ${byAA('G').x.length.toLocaleString('en')}, proline ${byAA('P').x.length.toLocaleString('en')} and alanine ${byAA('A').x.length.toLocaleString('en')} residues from the same crystal structures. The condition is a label. In Boltz it is what the trunk computes.</p>
    <p><b>Guidance.</b> The identity ∇log p(x|c) = ∇log p(x) + ∇log p(c|x) is Bayes' rule (Song et al. 2021). A sampler can therefore add a classifier's gradient to an unconditional score. Boltz does not do this. It feeds its conditions in as inputs, and it trained with them. Its steering, chapter 8, adds gradients of hand-made potentials on the denoised structure, which is a different thing.</p>
    <p><b>What Boltz takes as input conditions.</b> Sequence and MSA. Pocket: a token feature in Boltz-1, pair features in Boltz-2. Contacts: pair features, Boltz-2. Method: a token feature, Boltz-2, set by <i>--method</i>. Templates: Boltz-2, multimeric allowed. Pocket, contact and template can also be enforced with a potential, using <i>force: true</i>.</p>
    <p><b>Adenylate kinase.</b> E. coli enzyme, 214 residues, C-alpha only. Of 51 complete chains in ${adk().counts.entries} PDB entries, ${adk().counts.open} are open and ${adk().counts.closed} closed. The set here keeps all 7 open chains and 15 closed ones. All closed chains have a nucleotide or analogue bound, and one open chain does too (6F7U, chain A). With no condition, 300 test runs ended 78% closed against 68% in the set. That gap comes from our shortcut denoiser, not the step size: 36 and 144 Euler steps gave the same share. Its size depends on where the noise starts: from 60, 90, 250 and 800 Å the same 22 structures gave about 94, 76, 48 and 42% closed. An exact field would not change, so the near match at 90 Å is partly luck. The shortcut's weights depend on size, and open chains have Rg 19.4 Å against 16.4 Å closed, which is the likely reason, though it is not proven.</p>
    <p><b>The real run.</b> One Boltz-2 prediction of a 136-residue protein, the first sequence of the alignment <i>examples/msa/seq2.a3m</i> in the Boltz repository, recorded for the author's teaching exercises: Boltz 2.2.1, 20 sampling steps, 1 recycling step, seed 42, with the MSA supplied. These are reduced settings, chosen to fit a trace. The game plays back the stored coordinates and does not run Boltz. It is one run of one protein. The steps are iterations of a sampler, not time: this is no folding pathway and no MD trajectory. σ starts at 2,560 Å, and the first burst of noise lifts it by 1.8 times to 4,608 Å.</p>
    <p class="small">Song et al., ICLR 2021. Dhariwal and Nichol, NeurIPS 2021. Abramson et al., Nature 630, 493 (2024). Wohlwend et al., bioRxiv 10.1101/2024.11.19.624167. Passaro et al., bioRxiv 10.1101/2025.06.14.659707. Müller and Schulz, J Mol Biol 224, 159 (1992), and Müller et al., Structure 4, 147 (1996), for 1AKE and 4AKE.</p>`,

  async setup(run) {
    const { ui } = run, T = run.state.T = new Tank(run, { drops: Math.min(16000, run.world.dropCount) }), d = rama();
    ui.say('Mixing the water.');
    const fields = run.state.fields = {};
    fields.all = await fieldOf(run, 'general', d.train.x, d.train.y);
    for (const k of ['G', 'P', 'A']) { const r = byAA(k); fields[k] = await fieldOf(run, `aa${k}`, r.x, r.y); }
    void T;
  },
  stages: [trunk, sameNoise, identity, kinase, realRun, checkStage],
};

async function trunk(run) {
  const { ui } = run;
  ui.tags('paper');
  await run.line('So far a denoiser knew only the noisy point. A protein predictor must also know which protein this is. That extra input is called a <b>condition</b>, and the denoiser becomes D(x; σ, c).');
  await run.line('In Boltz the condition comes from a large network called the <b>trunk</b>. It reads the sequence and the alignment, and it was AlphaFold2\'s Evoformer before AlphaFold3 replaced that with the simpler <b>Pairformer</b>.');
  await run.line('Its output is one vector per residue and one per pair of residues, called the single and pair representations. The trunk runs once, not at every step, and then the diffusion module reads those same arrays through all its sampling steps.');
}

async function sameNoise(run) {
  const { ui, sound } = run, { T, fields } = run.state;
  ui.tags('real', 'game', 'model');
  await run.line('We can do this exactly, in two dimensions, with a condition that everyone knows: the kind of residue. Glycine has no side chain, proline has a ring, and each has its own map.');
  const pour = run.state.pour = new Pour(T, T.N), rng = makeRng(101), n = T.N, sx = new Float64Array(n), sy = new Float64Array(n);
  for (let i = 0; i < n; i += 1) { sx[i] = -84 + SMAX * rng.n(); sy[i] = 42 + SMAX * rng.n(); }
  const S = schedule(STEPS, SMIN, SMAX, 7), tmp = new Float64Array(4), g = new Float64Array(2), p = new Float64Array(2);
  const end = (f, i) => { p[0] = sx[i]; p[1] = sy[i]; const D = (a, s, o) => f.at(a[0], a[1], s, o); for (let k = 0; k < STEPS; k += 1) heun(p, S[k], S[k + 1], D, g, 2, tmp); return [p[0], p[1]]; };
  // Pick a droplet that only glycine carries past φ = 0, so that the task has one answer.
  let mark = 0;
  for (let i = 0; i < 2000; i += 1) {
    const e = end(fields.G, i);
    if (e[0] > 20 && end(fields.all, i)[0] < 0 && end(fields.P, i)[0] < 0 && end(fields.A, i)[0] < 0) { mark = i; break; }
  }
  const finish = {};
  let ring = null;
  T.extra.push((gg) => { if (ring) T.ring(gg, ring[0], ring[1], 12, 'rgb(29,33,65)', 2.4); });
  ui.reads([{ id: 'r-p', value: '–', label: 'helix / strand / φ above 0' }, { id: 'r-m', value: '–', label: 'marked droplet ends at' }]);
  ui.say('Every run below starts from the same droplets. One is marked with a ring. <b>Choose a condition to bring the marked droplet to φ above 0.</b>');
  const go = async (k, b) => {
    const field = fields[k], D = (a, s, o) => field.at(a[0], a[1], s, o), Df = (a, s, o) => field.fast(a[0], a[1], s, o);
    pour.x.set(sx); pour.y.set(sy); pour.gx.fill(-84); pour.gy.fill(42);
    T.setZoom(zoomOf(SMAX), 0.3); ring = null;
    await pour.run(run, S, (q, h, i, j) => heun(q, S[j], S[j + 1], i < 4000 ? D : Df, h, 2, tmp), { seconds: 1.5, zoomOf });
    if (!run.alive) return null;
    const X = Float32Array.from(pour.x.subarray(0, 4000)), Y = Float32Array.from(pour.y.subarray(0, 4000)), pop = populations(X, Y);
    finish[k] = pop; run.state.finish = finish;
    ring = [pour.x[mark], pour.y[mark]];
    ui.read('r-p', `${pct(pop[0])} / ${pct(pop[1])} / ${pct(pop[2], 1)}`); ui.read('r-m', `φ ${fmt(ring[0], 0)}°, ψ ${fmt(ring[1], 0)}°`);
    void b;
    return ring;
  };
  await run.until((done) => {
    let busy = false;
    const bs = Object.keys(CONDS).map((k) => ui.button(CONDS[k], async (b) => {
      if (busy) return;
      busy = true;
      const r = await go(k, b);
      busy = false;
      if (!r) return;
      if (r[0] > 20) { sound.good(1); run.reach(1); ui.ctrl(); done(); } else ui.say(`${CONDS[k]}: same start, and the marked droplet stayed on the φ below 0 side. Which residue is free to go there?`);
    }, { quiet: true, id: `c-${k}` }));
    ui.ctrl(ui.chips(bs));
  });
  await run.line('Same noise, different answer. Only the condition changed, and it changed which field the droplets follow.');
  T.extra.length = 0;
}

async function identity(run) {
  const { ui } = run, a = byAA('G'), g0 = rama().train;
  ui.tags('game');
  const mixAll = new Mix2D(Float32Array.from([...g0.x, ...a.x]), Float32Array.from([...g0.y, ...a.y])), mixG = new Mix2D(a.x, a.y), o = [0, 0], s = 30, x = 40, y = 100, h = 0.02, pc = a.x.length / mixAll.n;
  const logC = (px, py) => Math.log(pc) + mixG.logp(px, py, s) - mixAll.logp(px, py, s);
  mixG.denoise(x, y, s, o); const cx = (o[0] - x) / (s * s), cy = (o[1] - y) / (s * s);
  mixAll.denoise(x, y, s, o); const ux = (o[0] - x) / (s * s), uy = (o[1] - y) / (s * s);
  const gx = (logC(x + h, y) - logC(x - h, y)) / (2 * h), gy = (logC(x, y + h) - logC(x, y - h)) / (2 * h);
  ui.reads([{ value: `${fmt(cx * 1000, 3)}, ${fmt(cy * 1000, 3)}`, label: 'conditional score, × 1000' }, { value: `${fmt((ux + gx) * 1000, 3)}, ${fmt((uy + gy) * 1000, 3)}`, label: 'plain score + slope of log p(c | x), × 1000' }]);
  await run.line('There are two ways to get a conditional field. Here is the identity behind both, tested at one point with σ = 30°, where the condition is "this residue is glycine".');
  await run.line('The score given c equals the plain score plus the slope of log p(c | x). So you could train a plain model and add a classifier\'s gradient while sampling. That is <b>classifier guidance</b>.');
  await run.line('Boltz does not do that. It trained with its conditions as inputs: sequence and MSA, a pocket in Boltz-1, and in Boltz-2 the method, contacts and templates. So the network itself learned the conditional field.');
  await run.line('Boltz\'s <b>steering</b> also adds gradients during sampling, but they come from hand-written potentials on the guess, not from a classifier. You will run it in the next chapter.');
}

async function kinase(run) {
  const { ui, sound, world } = run, K = adk(), n = K.n;
  ui.tags('real', 'game', 'model');
  const E = new Ensemble(K.models), dim = E.dim;
  const mol = new MolInk(run, { n, bonds: chainBonds(n), inkOf: (a) => chainInk(a / n), drops: Math.round(world.dropCount * 0.42), thick: 0.75, mass: 2.1 });
  run.state.T.clear(); run.state.T.showMap = false; run.state.T.extra.length = 0;
  world.mood = { flow: 0.0011, decay: 0.92, trail: 0.9 };
  fitMol(run, 96);
  const x = new Float64Array(dim), noise = new Float64Array(dim), rng = makeRng(404), out = new Float64Array(dim);
  for (let i = 0; i < dim; i += 1) noise[i] = rng.n();
  let sigma = 90, spin = !world.reduce;
  x.set(noise); for (let i = 0; i < dim; i += 1) x[i] *= 90;
  const tick = (dt, time) => { if (spin) mol.turn(dt * 0.1, 0); mol.draw(x, sigma * 0.5, { time }); };
  run.tick(tick);
  dragTurn(run, (a, b) => mol.turn(a, b));
  const openRef = K.models[K.ids.indexOf('4AKEA')], closedRef = K.models[K.ids.indexOf('1AKEA')];
  const S = schedule(36, 0.05, 90, 7);
  const active = (key) => (key === 'none' ? K.nuc.map((v) => (v ? 0 : 1)) : key === 'bound' ? K.nuc.map((v) => (v ? 1 : 0)) : K.nuc.map(() => 1));
  const runOne = (start, key, animate) => new Promise((resolve) => {
    const a = active(key);
    x.set(start); for (let i = 0; i < dim; i += 1) x[i] *= 90;
    let k = 0;
    const stepNow = () => {
      if (!run.alive) return;
      E.denoise(x, S[k], out, { activeOnly: a });
      const f = (S[k + 1] - S[k]) / S[k];
      for (let i = 0; i < dim; i += 1) x[i] += f * (x[i] - out[i]);
      sigma = S[k + 1]; sound.setSigma(sigmaLevel(sigma + 1e-3, 0.3, 60));
      k += 1;
      if (k + 1 < S.length) { if (animate) setTimeout(stepNow, 55); else stepNow(); } else resolve({ open: fitRmsd(x, openRef), closed: fitRmsd(x, closedRef) });
    };
    stepNow();
  });
  await run.line('Now the same thing in Cartesian space, with a real enzyme. Adenylate kinase has a lid that closes over its substrates. These are real crystal structures, open and closed, about 7 Å apart.');
  ui.reads([{ id: 'r-o', value: '–', label: 'Å from open (4AKE)' }, { id: 'r-c', value: '–', label: 'Å from closed (1AKE)' }]);
  ui.say('The same noise each time. The condition is whether a nucleotide is bound. <b>Run both.</b>');
  await run.until((done) => {
    const seen = {};
    let busy = false;
    const mk = (key, label) => ui.button(label, async (b) => {
      if (busy) return;
      busy = true;
      const r = await runOne(noise, key, true);
      busy = false;
      if (!run.alive) return;
      ui.read('r-o', fmt(r.open, 1)); ui.read('r-c', fmt(r.closed, 1));
      b.className = 'btn on'; seen[key] = r;
      if (seen.none && seen.bound) { ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); }
    }, { quiet: true, id: `k-${key}` });
    ui.ctrl(ui.chips([mk('none', 'No nucleotide'), mk('bound', 'Nucleotide bound')]));
  });
  ui.ctrl();
  await run.line('The noise was identical. The condition sent it open or closed.');
  // Prediction: what share closes with no condition?
  const nClosed = K.state.filter((v) => v === 1).length, share = nClosed / K.state.length;
  ui.reads([{ value: `${K.state.length - nClosed} open, ${nClosed} closed`, label: 'structures in this set' }, { id: 'r-g', value: '50%', label: 'your prediction' }, { id: 'r-a', value: '–', label: 'share of 40 runs that closed' }]);
  ui.say('Now remove the condition. <b>Predict the share of runs that end closed, then run 40 different noises.</b>');
  let guess = 50;
  await run.until((done) => {
    const sl = ui.slider({ label: 'Closed', min: 0, max: 100, step: 5, value: 50, id: 'guess', format: (v) => `${v}%`, onInput: (v) => { guess = v; ui.read('r-g', `${v}%`); } });
    const go = ui.button('Run 40', async (b) => {
      b.disabled = true;
      const r2 = makeRng(1000 + Math.round(guess)), st = new Float64Array(dim);
      let closed = 0;
      for (let t = 0; t < 40; t += 1) {
        for (let i = 0; i < dim; i += 1) st[i] = r2.n();
        const r = await runOne(st, 'all', false);
        if (!run.alive) return;
        if (r.closed < r.open) closed += 1;
        ui.read('r-a', pct(closed / (t + 1)));
        await run.hold(new Promise(requestAnimationFrame));
      }
      run.state.adkClosed = closed / 40;
      if (Math.abs(guess / 100 - closed / 40) <= 0.2) { run.reach(2); sound.good(2); ui.say(`${closed} of 40 closed, close to your ${guess}%. The set itself is ${pct(share)} closed.`); } else { ui.say(`${closed} of 40 closed. The set holds ${pct(share)} closed, and our shortcut tends to land above that. Try again.`); sound.soft(); }
      b.disabled = false;
      if (run.game.save.tier.condition >= 2) { ui.ctrl(); ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); }
    }, { id: 'run40' });
    ui.ctrl(sl, go);
  });
  ui.ctrl();
  await run.line(`With no condition, the share rises and falls with the data's own share, but our shortcut denoiser bends it: 78% closed in 300 test runs against ${pct(share)} in the set, and a different starting noise bends it further. An exact field would return the data's share. And a share of crystal structures says what people crystallised, which chapter 9 returns to.`);
  run.untick(tick); mol.cloud.commit(0);
}

async function realRun(run) {
  const { ui, world, sound } = run, R = boltzRun(), L = R.L;
  ui.tags('boltz');
  run.state.T.clear(); run.state.T.showMap = false;
  const mol = new MolInk(run, { n: L, bonds: chainBonds(L), inkOf: (a) => chainInk(a / L), drops: Math.round(world.dropCount * 0.42), seed: 5, thick: 0.75, mass: 2.1 });
  fitMol(run, 66);
  const final = R.frames[R.frames.length - 1].denoised;
  let f = 0;
  const x = new Float64Array(L * 3);
  x.set(R.frames[0].denoised);
  run.tick((dt, time) => { if (!world.reduce) mol.turn(dt * 0.1, 0); mol.draw(x, 0, { time, curl: false }); });
  dragTurn(run, (a, b) => mol.turn(a, b));
  await run.line('Now real Boltz. This game does not run it. This is a stored record of one real Boltz-2 run, of a 136-residue protein, at 20 sampling steps. Each frame is the network\'s denoised guess at that step.');
  await run.line('These steps are not time. A sampler\'s iterations are no folding path and no trajectory, so nothing here shows how a protein moves.');
  const show = (k) => {
    f = k; const fr = R.frames[k];
    x.set(fr.denoised);
    ui.read('r-k', `${k + 1}`); ui.read('r-s', `${fmt(fr.sigma, fr.sigma < 1 ? 3 : fr.sigma < 100 ? 1 : 0)} Å`); ui.read('r-g', fmt(rg(fr.denoised), 1)); ui.read('r-d', fmt(fitRmsd(fr.denoised, final), 2));
    sound.setSigma(sigmaLevel(Math.max(fr.sigma, 0.3), 0.3, 200));
  };
  ui.reads([{ id: 'r-k', value: '1', label: 'step of 20' }, { id: 'r-s', value: '', label: 'noise σ' }, { id: 'r-g', value: '', label: 'Rg of guess, Å' }, { id: 'r-d', value: '', label: 'Å from the final structure' }]);
  ui.say('<b>Scrub through the 20 steps.</b> σ starts at 2,560 Å, and the first burst of noise lifts it by 1.8 times to 4,608 Å.');
  await run.until((done) => {
    let top = false;
    ui.ctrl(ui.slider({ label: 'Step', min: 0, max: R.frames.length - 1, step: 1, value: 0, id: 'step', format: (v) => `${v + 1}`, onInput: (v) => { show(v); if (v >= 15 && !top) { top = true; ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); } } }));
    show(0);
  });
  void f;
  const d0 = fitRmsd(R.frames[0].denoised, final), others = ['seed 43', 'second sample', '40 steps'].map((k) => fitRmsd(R.frames[0].denoised, R.finals[k]));
  const seeds = [fitRmsd(R.finals['seed 43'], R.finals['seed 42']), fitRmsd(R.finals['second sample'], R.finals['seed 42'])];
  run.state.step1 = { d0, others, seeds };
  await run.line(`Look at step 1. At σ = 4,608 Å the input holds almost nothing, yet the guess is a folded protein. It is ${fmt(d0, 2)} Å from this run's end, and ${fmt(Math.min(...others), 1)} to ${fmt(Math.max(...others), 1)} Å from the ends of three other runs. Two samples of this protein differ by ${fmt(Math.min(...seeds), 1)} to ${fmt(Math.max(...seeds), 1)} Å, so the first guess is about as close as a new sample would be.`);
  await run.line('Compare chapter 3, where high noise gave only the mean of everything.');
  await run.line('There, nothing told the denoiser what it was looking at. Here the trunk has already read the sequence, so the distribution given this sequence is narrow, and with the aligned loss of chapter 6 its best guess is a protein. Most of this structure came from the condition.');
  await run.line(`Then what is sampling for? It refines and it chooses. Two seeds of this protein ended ${fmt(fitRmsd(R.finals['seed 43'], R.finals['seed 42']), 1)} Å apart. With no MSA, the final structure moved ${fmt(fitRmsd(R.finals['no MSA'], R.finals['seed 42']), 1)} Å. Better input moved it more than the sampler did, in this one case.`);
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. A colleague says: "Boltz builds a structure out of pure noise, so the noise must hold the information." What do you answer?',
      options: [
        { text: 'Right. Different noise gives a different fold, always.', why: 'In the real run, the first guess was already within 2 Å of the end, at noise where the input held nothing.' },
        { text: 'No. Nearly all the information comes from the trunk\'s reading of the sequence. The noise picks among what remains uncertain.', right: true, why: 'Yes. The condition narrows the distribution, and the noise and sampler choose within it.' },
        { text: 'No. The noise is removed before the network sees it.', why: 'The network does see the noisy coordinates, and it uses them more and more as the noise falls.' },
      ],
    },
    {
      q: 'You give Boltz-2 a pocket, as an input with no force. Some samples ignore it. Why is that possible?',
      options: [
        { text: 'A soft condition only reshapes what the network learned, so nothing enforces it. A potential, with force: true, is what pushes on the sample.', right: true, why: 'Yes. The paper says it plainly: with feature conditioning the model sometimes gives samples that do not respect the condition.' },
        { text: 'Pockets are only supported in Boltz-1.', why: 'Boltz-2 supports them too, with pair features and optional steering.' },
        { text: 'That cannot happen, because conditioning is exact.', why: 'It was exact on your map. In a trained network it is only as good as the training.' },
      ],
    },
  ], ['boltz', 'paper']);
}
