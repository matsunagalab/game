// Chapter 9. Is it the Boltzmann distribution? Sample frequencies against a real molecular-dynamics reference, then real ensembles.
import { adk, boltzRun, mdRun, rama } from '../science/data.js';
import { populations, sliced } from '../science/stats.js';
import { boltzSchedule, schedule, stochasticStep } from '../science/sampler.js';
import { fitRmsd } from '../science/kabsch.js';
import { noiseBurst, oddsPower, PRESETS, twoState } from '../science/twostate.js';
import { check, chart, fieldOf, fmt, Pour, pct, Tank } from './common.js';
import { makeRng } from '../science/rng.js';

const SMAX = 400, SMIN = 1, STEPS = 60, KT = 0.596, SEED = 9; // kT in kcal/mol at 300 K. tools/test.mjs checks that this seed is typical of 12.
const zoomOf = (s) => Math.max(1, 1 + (2.1 * s - 30) / 180);
const dF = (a, b) => (a > 0 && b > 0 ? -KT * Math.log(a / b) : NaN);
const LABEL = 'α-like / strand side / φ above 0';

export default {
  id: 'boltzmann',
  title: 'Is it the Boltzmann distribution?',
  tease: 'Compare sample frequencies with a real simulation, then decide how far to trust an ensemble.',
  principle: 'A diffusion model gives back the distribution of its training data as seen through its sampler, and in Boltz no energy appears anywhere in training. So sample frequencies are not populations unless someone has checked. Sampler settings alone can shrink a rare region, and PDB counts reflect what people crystallised. Reweighting needs an energy and the sample density, and Boltz supplies neither.',
  goals: ['Reproduce a real population, then see how each sampler setting changes it.', 'Find the step scale that halves the rare region.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>The reference.</b> Our own molecular dynamics of alanine dipeptide (ACE-ALA-NME) in TIP3P water with ff14SB, 300 K, 1 bar, 4 fs with hydrogen mass repartitioning, in OpenMM. Plain MD was not enough. In 37 ns the runs disagreed with each other, with one real entry to φ above 0, of 915 ps, and four one-frame grazes, and the α-like share of 1 ns blocks ran from 0 to 0.73. Pooled, they gave 25.8 / 71.7 / 2.5%, which agrees with the reference within its error. The reason to replace them was too few crossings, not a wrong answer.</p>
    <p>So three new runs carry a fixed 2-D bias on φ and ψ, from a short well-tempered metadynamics, and each frame is weighted back by exp(+V/kT). ${mdRun()?.se ? `${(mdRun().frames / 1000).toFixed(0)} ns in all. Standard errors between the three runs: ${mdRun().se.map((v) => (100 * v).toFixed(1)).join(', ')} percentage points. The Kish effective sample size is ${mdRun().ess.toLocaleString('en')}, which ignores time correlation. The α-like signal is still correlated at 100 ps, so independent samples number in the hundreds. The field uses 7,000 frames drawn in proportion to weight, with repeats, ${mdRun().distinct.toLocaleString('en')} of them distinct.` : ''} It is a Boltzmann sample of this force field, up to that error. It says nothing about how good the force field is.</p>
    <p><b>Regions.</b> φ above 0 is one region, and it is mostly αL (3.0%, the rest 0.4%). Below φ = 0, ψ above 45° is the strand side, β with PII, and ψ below 45° the α-like side. The line ψ = 45° sits on the shoulder of the α region, not on the valley floor at 65 to 95°. A cut at 20° gives 28.1% α-like, and a cut at 75° gives 31.5%. φ = 0 is a harmless line.</p>
    <p><b>Free energy.</b> F is minus kT ln p, with kT = 0.596 kcal/mol at 300 K. These are region free energies in φ and ψ, with every other degree of freedom integrated out.</p>
    <p><b>The settings.</b> The sampler is Algorithm 18 of AlphaFold3. Boltz-2: η = 1.5, γ₀ = 0.8, γ_min = 1 Å, λ = 1.003. Boltz-1: η = 1.638, γ₀ = 0.605, γ_min = 1.107 Å, λ = 0.901 (<i>boltz/main.py</i>). The burst of fresh noise is λ √((1 + γ₀)² − 1) σ, so 1.50 σ and 1.13 σ, on 154 of Boltz-2's 200 steps. Karras et al. cap γ at √2 − 1, which adds at most 1.0 σ. Boltz-2's Table 7 says that with the exception of σ_min they opted for AlphaFold3's default hyperparameters.</p>
    <p><b>These runs</b> use 60 steps from 400° to 1°, with ρ = 7, and γ_min scaled to 4°. Only η, γ₀ and λ are the models' own. One seed is shown, and it lies within one standard deviation of the mean of 12 seeds for the plain run, noise alone and Boltz-2's settings. Ten seeds of 4,000 droplets give 29.4 / 67.0 / 3.6% for the plain run, 15.8 / 84.2 / 0.0 for η alone, 28.3 / 69.7 / 2.0 for noise alone, and 22.3 / 77.3 / 0.4 for Boltz-2's three settings. Across seeds as run here, the rare region with Boltz-2's settings lies between about 0.2 and 0.6%. Boltz-2's own range and 200 steps gave the same result for the full preset (0.4%). The η-only result does depend on the range: η = 1.04 is enough on Boltz's range, where η = 1.5 alone gives 0 / 100 / 0. On a torus instead of a flat sheet, η = 1.5 alone leaves 1.6% and the full preset 0.6%.</p>
    <p><b>What this does and does not show.</b> It is a 2-D exact field, not Boltz. A trained network errs in its own ways, and Boltz's loss is aligned, so nobody should read these numbers as Boltz's error on any protein. It shows only that a sampler can change populations with a perfect field. The Boltz documentation itself says the step size is related to the temperature at which the process samples, and that a lower value gives more diversity.</p>
    <p><b>The two-state calculation.</b> Exact, this game's own, not from a paper. Two equal Gaussians of width 1 Å, on the real Boltz-2 schedule in Å, 200 steps, 20,000 droplets. The result does not depend on the separation above 5 Å. The odds are raised to a power near 1.7, or near 2.2 with Boltz-1's settings and schedule. The link to temperature is an analogy for a fixed free-energy gap. It leaves out centring, random rotation and Boltz's alignment.</p>
    <p><b>Reweighting.</b> Each sample gets weight p/q, with p the reference histogram and q the histogram of the samples, in 5° cells. That is a teaching shortcut, and it only sums p over visited cells: about 1% with 4,000 droplets, and 1.9% with 40,000. In two dimensions you can histogram. In 1,800 you cannot. A Boltzmann generator gets exact q from an invertible map and p from an energy function (Noé et al. 2019).</p>
    <p><b>Boltz-2's MD data.</b> MISATO: 8 ns at 300 K. ATLAS: the last 10 ns of 100 ns. mdCATH: the last 10% of runs of up to 500 ns, at 320 K (Passaro et al., Appendix A.1.2). Section 6 calls the MD data used at the later stages of training relatively small.</p>
    <p><b>BioEmu's 0.74 kcal/mol</b> is a leave-one-out test on 12 fast folders, with "DESRES-finetuned models", on a 2-D free-energy surface. It is not the public model.</p>
    <p><b>The name.</b> MIT Jameel Clinic's announcement of December 2024 says Boltz-1 is named after the Boltzmann distribution. That is the origin of a name. The authors do not claim Boltzmann statistics, and their papers discuss neither energies in training nor population recovery.</p>
    <p class="small">Boltzmann generators: Noé et al., Science 365, eaaw1147 (2019). BioEmu: Lewis et al., Science 389, eadv9817 (2025), read as its preprint, doi 10.1101/2024.12.05.626885. AlphaFold3: Abramson et al., Nature 630, 493 (2024). Boltz-2: Passaro et al., bioRxiv 10.1101/2025.06.14.659707, Tables 7, 9 and 10, Section 6, Appendix A and C.1.1. Likelihood from a diffusion model: Song et al. 2021.</p>`,

  async setup(run) {
    const T = run.state.T = new Tank(run), m = run.state.m = mdRun(), { ui } = run;
    ui.say('Mixing the water.');
    const F = run.state.F = await fieldOf(run, 'md', m.x, m.y);
    run.state.D = (x, s, out) => F.at(x[0], x[1], s, out);
    run.state.Dfast = (x, s, out) => F.fast(x[0], x[1], s, out);
    run.state.ref = m.pop;
    run.state.fieldPop = populations(m.x, m.y);
    run.state.pour = new Pour(T, Math.min(9000, T.N));
    const rng = makeRng(3), N = T.N, px = new Float32Array(N), py = new Float32Array(N);
    for (let i = 0; i < N; i += 1) { const k = i < m.n ? i : rng.int(m.n); px[i] = m.x[k]; py[i] = m.y[k]; }
    run.state.dataPaint = () => { T.setZoom(1, 0.3); T.paint(px, py, N, {}); };
    run.state.dataPaint();
  },
  stages: [reference, faithful, knobs, halve, twoStates, whatDecides, reweight, ensembles, useThem, checkStage],
};

async function go(run, opt, { seconds = 2, seed = SEED } = {}) {
  const { pour, D, Dfast, m, F } = run.state, rng = makeRng(seed), S = schedule(STEPS, SMIN, SMAX, 7);
  pour.start(rng, F.mix.mx, F.mix.my, SMAX);
  run.state.T.setZoom(zoomOf(SMAX), 0.3);
  await pour.run(run, S, (p, g, i, k) => stochasticStep(p, S[k], S[k + 1], i < 4000 ? D : Dfast, g, rng, opt), { seconds, zoomOf, boost: 1.5 });
  if (!run.alive) return null;
  const X = Float32Array.from(pour.x.subarray(0, 4000)), Y = Float32Array.from(pour.y.subarray(0, 4000));
  return { X, Y, pop: populations(X, Y), dist: sliced(X, Y, m.x, m.y) };
}

const pp = (p) => `${pct(p[0], 1)} / ${pct(p[1], 1)} / ${pct(p[2], 1)}`;
const pe = (m) => `${pct(m.pop[0])} ± ${(100 * m.se[0]).toFixed(0)} / ${pct(m.pop[1])} ± ${(100 * m.se[1]).toFixed(0)} / ${pct(m.pop[2], 1)} ± ${(100 * m.se[2]).toFixed(1)}`;
const roundRun = (r) => `${(100 * r[0]).toFixed(0)}/${(100 * r[1]).toFixed(0)}/${(100 * r[2]).toFixed(1)}`;

async function reference(run) {
  const { ui } = run, { ref, m, T } = run.state;
  ui.tags('real');
  T.labels = false;
  await run.line(`This map is different. It is no longer many residues from many proteins. It is one small molecule, alanine dipeptide, in water at 300 K, from ${(m.frames / 1000).toFixed(0)} ns of molecular dynamics that we ran for this game.`);
  await run.line('A long simulation visits each conformation in proportion to exp(−U/kT). Summed over a region of this map, that gives exp(−F/kT). So here the frequencies mean something physical: they are the populations of this force field.');
  await run.line('Long is the hard part. Plain runs of tens of ns disagreed with each other, so we added a fixed bias that speeds up the crossings, and weighted every frame back.');
  ui.reads([{ value: pe(m), label: LABEL }, { value: `${KT} kcal/mol`, label: 'kT at 300 K' }]);
  await run.line(`Even so, three independent runs gave ${m.perRun.map(roundRun).join(', ')}. Those errors are real, and we keep them on screen. The strand side is β with PII, and ψ = 45° is the line we drew to split it from the α-like side.`);
  const right = KT * Math.log(ref[1] / ref[2]), err = KT * (m.se[2] / ref[2]);
  run.state.gap = { right, err };
  const opts = [right, right * 2.3, right / 2.6].map((v) => v.toFixed(1));
  await run.choose(`Work it out. The φ above 0 region holds ${pct(ref[2], 1)}, and the strand side ${pct(ref[1], 1)}. How much higher in free energy is the rare region?`, [
    { text: `${opts[2]} kcal/mol`, why: `Take kT × ln(${pct(ref[1], 1)} / ${pct(ref[2], 1)}). The ratio is about ${(ref[1] / ref[2]).toFixed(1)}, so ln is about ${Math.log(ref[1] / ref[2]).toFixed(1)}.` },
    { text: `${opts[0]} kcal/mol`, right: true, why: `Yes: 0.596 × ln(${(ref[1] / ref[2]).toFixed(1)}) is ${right.toFixed(2)} ± ${err.toFixed(2)} kcal/mol. A rare region is only a kilocalorie or two up.` },
    { text: `${opts[1]} kcal/mol`, why: `Take kT × ln(${pct(ref[1], 1)} / ${pct(ref[2], 1)}). The ratio is about ${(ref[1] / ref[2]).toFixed(1)}, so ln is about ${Math.log(ref[1] / ref[2]).toFixed(1)}.` },
  ]);
}

async function faithful(run) {
  const { ui } = run, { ref, m } = run.state;
  ui.tags('game', 'real', 'model');
  ui.reads([{ value: pe(m), label: 'simulation' }, { id: 'r-s', value: '–', label: 'sampler' }, { id: 'r-e', value: '–', label: 'kcal/mol off, rare region' }]);
  ui.say('The field below is the exact denoiser of this simulation, on a flat map. The sampler has no extra noise and a step scale η of 1. <b>Run it.</b>');
  await run.until((done) => ui.ctrl(ui.button('Run', () => { ui.ctrl(); done(); }, { id: 'run' })));
  const r = await go(run, { eta: 1, gamma0: 0, gammaMin: 4, lambda: 1 });
  if (!r) return;
  run.reach(1);
  run.state.exact = r;
  ui.read('r-s', pp(r.pop)); ui.read('r-e', fmt(Math.abs(dF(r.pop[2], r.pop[1]) - dF(ref[2], ref[1])), 2));
  await run.line('That is close. With a perfect field and a careful sampler, sample frequencies match real populations. This is the promise of the mathematics, and you have now seen it hold.');
  await run.line('But notice what makes it true. It held because the data were already Boltzmann samples, and because the sampler solved the equation faithfully.');
  await run.line('Boltz has a third reason to differ. Its aligned loss means its denoiser is not this exact field, even before the sampler is changed.');
}

async function knobs(run) {
  const { ui } = run, { ref, m } = run.state, burst = noiseBurst(PRESETS.boltz2), burst1 = noiseBurst(PRESETS.boltz1);
  ui.tags('game', 'model', 'paper');
  await run.line(`AlphaFold3 and Boltz do not take that plain step. Each step is scaled up by η: 1.5 in Boltz-2 and 1.638 in Boltz-1. They also add a large burst of fresh noise before each step, about ${fmt(burst, 1)} σ with these settings.`);
  await run.line(`That burst is ${fmt(burst1, 1)} σ for Boltz-1, and Karras and colleagues capped theirs at 1.0 σ. On Boltz-2's real schedule it applies to ${boltzSchedule(200).slice(1, 200).filter((s) => s > 1).length} of the 200 steps, above 1 Å. Their documentation says the step size is related to the temperature of sampling.`);
  ui.reads([{ value: pe(m), label: 'simulation' }, { id: 'r-s', value: '–', label: 'sampler' }, { id: 'r-e', value: '–', label: 'kcal/mol off, rare region' }]);
  ui.say('The same exact field. <b>Run each setting alone, then the real sets.</b> A different seed moves these numbers a little.');
  const results = {};
  const presets = {
    eta: { label: 'η 1.5 alone', eta: 1.5, gamma0: 0, lambda: 1, say: 'The longer step alone. Droplets are pulled too hard at every noise level, and the rare region empties.' },
    gam: { label: 'Noise alone', eta: 1, gamma0: 0.8, lambda: 1.003, say: 'The noise alone. With a plain step, the rare region loses about two fifths, and the strand side gains about 3 points.' },
    b2: { label: 'Boltz-2 set', eta: 1.5, gamma0: 0.8, lambda: 1.003, say: 'Boltz-2\'s three settings together. The noise takes back part of what the longer step did.' },
    b1: { label: 'Boltz-1 set', eta: 1.638, gamma0: 0.605, lambda: 0.901, say: 'Boltz-1\'s three settings together: a longer step, and less noise than Boltz-2.' },
  };
  await run.until((done) => {
    let busy = false;
    const mk = (k) => ui.button(presets[k].label, async (b) => {
      if (busy) return;
      busy = true;
      const o = presets[k], r = await go(run, { eta: o.eta, gamma0: o.gamma0, gammaMin: 4, lambda: o.lambda }, { seconds: 1.5 });
      busy = false;
      if (!r) return;
      results[k] = r; run.state.presets = results; b.className = 'btn on';
      ui.say(o.say);
      ui.read('r-s', pp(r.pop)); ui.read('r-e', r.pop[2] > 0.0015 ? fmt(Math.abs(dF(r.pop[2], r.pop[1]) - dF(ref[2], ref[1])), 1) : 'nearly gone');
      if (Object.keys(results).length === 4 && !document.getElementById('next')) { ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); }
    }, { quiet: true, id: `p-${k}` });
    ui.ctrl(ui.chips([mk('eta'), mk('gam'), mk('b2'), mk('b1')]));
  });
  ui.ctrl();
  await run.line(`With Boltz-2's settings on a perfect field, the ${pct(ref[2], 1)} region fell to about ${pct(results.b2.pop[2], 1)}. Three settings changed together: step scale, noise and noise scale. The longer step alone would empty the region, and the added noise brings part of it back.`);
  await run.line('Be careful with that. This is a 2-D toy with an exact field. A trained network errs in its own ways, and these settings were made for a trained network. It tells you only that the sampler has a say in populations.');
}

async function halve(run) {
  const { ui, sound } = run, { fieldPop } = run.state, base = run.state.exact?.pop[2] ?? fieldPop[2];
  ui.tags('game', 'model');
  ui.reads([{ id: 'r-e', value: '1.00', label: 'step scale η' }, { value: pct(base, 1), label: 'rare region, plain sampler' }, { id: 'r-s', value: '–', label: 'rare region now' }]);
  ui.say(`<b>Find an η that cuts the rare region to about half, near ${pct(base / 2, 1)}.</b> No added noise here.`);
  await run.until((done) => {
    let eta = 1, busy = false;
    const sl = ui.slider({ label: 'η', min: 1, max: 1.6, step: 0.01, value: 1, id: 'eta', format: (v) => v.toFixed(2), onInput: (v) => { eta = v; ui.read('r-e', v.toFixed(2)); } });
    const go2 = ui.button('Run', async (b) => {
      if (busy) return;
      busy = true; b.disabled = true;
      const r = await go(run, { eta, gamma0: 0, gammaMin: 4, lambda: 1 }, { seconds: 1.2, seed: 8 });
      busy = false; b.disabled = false;
      if (!r) return;
      ui.read('r-s', pct(r.pop[2], 2));
      const q = r.pop[2] / base;
      run.state.etaFound = eta;
      if (q > 0.33 && q < 0.67) { sound.good(2); run.reach(2); ui.ctrl(); done(); } else ui.say(q >= 0.67 ? 'Not enough yet. Raise η a little.' : 'Too far. Lower η.');
    }, { id: 'run' });
    ui.ctrl(sl, go2);
  });
  await run.line(`At η = ${run.state.etaFound.toFixed(2)} the rare region halved in this run. The flow runs too fast at every noise level, so more steps do not repair it. How large an η does this depends on where the schedule starts, so read the direction and not the number.`);
}

async function twoStates(run) {
  const { ui, sound } = run, { T } = run.state;
  ui.tags('game', 'model');
  T.clear(); T.showMap = false; T.setZoom(1, 0);
  await run.line('Here is a cleaner test, which leaves out the map. Take two sharp states of the same shape, an exact field, Boltz-2\'s real schedule in Å, and its 200 steps. This is this game\'s own calculation, not a published result.');
  const c = chart({ height: 96 }), xs = [], ys = [], line = Array.from({ length: 21 }, (_, i) => 0.02 + (i * 0.48) / 20);
  // Two pools of ink, each with its share of the droplets. Both are drawn from one fixed Gaussian cloud.
  const N = Math.min(8000, T.N), gx = new Float32Array(N), gy = new Float32Array(N), px = new Float32Array(N), py = new Float32Array(N), lx = new Float32Array(N), ly = new Float32Array(N), ink = makeRng(12);
  for (let i = 0; i < N; i += 1) { gx[i] = 26 * ink.n(); gy[i] = 26 * ink.n(); }
  const pools = (share) => {
    for (let i = 0; i < N; i += 1) {
      const minor = i < share * N;
      px[i] = gx[i] + (minor ? 95 : -80); py[i] = gy[i] + (minor ? 150 : -20);
      lx[i] = minor ? -100 : -65; ly[i] = minor ? 145 : -35;
    }
    T.setZoom(1, 0); T.paint(px, py, N, { gx: lx, gy: ly, boost: 0.9 });
  };
  pools(0.1);
  const draw = () => c.lines([{ x: line, y: line, color: '#8a8fa8', dash: [5, 4], width: 1.5 }, ...(xs.length ? [{ x: xs, y: ys, color: '#6a2c91' }] : [])], { x0: 0.02, x1: 0.5, y0: 0, y1: 0.5, xlabel: 'true share of the minor state', ylabel: 'share after sampling' });
  ui.reads([{ id: 'r-p', value: '10%', label: 'true minor share' }, { id: 'r-o', value: '–', label: 'after sampling' }, { id: 'r-k', value: '–', label: 'power on the odds' }]);
  ui.say('<b>Set the true share of the minor state, and run. Try three shares.</b>');
  let p = 0.1, runs = 0;
  await run.until((done) => {
    let busy = false;
    const sl = ui.slider({ label: 'Minor', min: 3, max: 50, step: 1, value: 10, id: 'share', format: (v) => `${v}%`, onInput: (v) => { p = v / 100; ui.read('r-p', `${v}%`); pools(p); } });
    const go2 = ui.button('Run', async (b) => {
      if (busy) return;
      busy = true; b.disabled = true;
      const out = await run.budget(twoState({ p, n: 20000, seed: 1 + runs }), null, 9);
      pools(out);
      busy = false; b.disabled = false; sound.drip?.(0.6);
      ui.read('r-o', pct(out, out < 0.1 ? 1 : 0));
      const power = p > 0.48 ? NaN : oddsPower(p, out);
      ui.read('r-k', Number.isFinite(power) ? power.toFixed(1) : '–');
      const k = xs.findIndex((v) => v >= p);
      if (k < 0) { xs.push(p); ys.push(out); } else if (xs[k] === p) ys[k] = out; else { xs.splice(k, 0, p); ys.splice(k, 0, out); }
      runs += 1; run.state.twoRuns = { xs, ys }; draw();
      if (xs.length >= 3 && !document.getElementById('next')) { ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); }
    }, { id: 'run2' });
    ui.ctrl(c, sl, go2);
    requestAnimationFrame(draw);
  });
  ui.ctrl();
  await run.line('The grey line is a faithful sampler. The run sits below it, and the odds come out raised to a power near 1.7. That does not change with the separation of the states, above about 5 Å.');
  await run.line('For a fixed free-energy gap, that power is what cooling to about 1/1.7 of the temperature would do. This fits the Boltz documentation, which says a lower step scale gives more diversity. Boltz-1\'s settings give a power near 2.2.');
  T.clear(); T.showMap = true;
}

async function whatDecides(run) {
  const { ui } = run, { ref } = run.state, d = rama(), K = adk();
  ui.tags('game', 'real');
  run.state.dataPaint();
  const pdb = populations(d.train.x, d.train.y);
  ui.reads([{ value: pp(ref), label: 'one peptide, MD at 300 K' }, { value: pp(pdb), label: 'general residues in the PDB' }]);
  await run.line('Next, ask what the model is even trying to reproduce. Same mathematics, two data sets, and very different answers. A model trained on one will return that one.');
  await run.line('Look back at chapter 5. The loss compares a guess with a training structure. In Boltz too, no energy appears in it, no temperature, and no exp(−U/kT). The model learns from whichever data it is fed.');
  await run.line('The PDB-wide map is not one molecule\'s Boltzmann distribution. It mixes thousands of residues in folded proteins, each held in place by its neighbours.');
  ui.reads([{ value: `${K.counts.closed} closed`, label: 'E. coli adenylate kinase chains, PDB' }, { value: `${K.counts.open} open`, label: 'same protein' }]);
  await run.line(`It gets sharper for one protein. Among the ${K.counts.chains} complete chains of this enzyme we found, ${K.counts.closed} are closed. That records which ligands people chose to crystallise with, and not how much time the protein spends closed.`);
  ui.tags('paper');
  await run.line('Boltz-1 trained on one structure per system. Boltz-2 also trains on NMR and molecular-dynamics ensembles, drawing one conformer at random each time, and adds distance and B-factor targets from the ensemble. That is a real step toward thermal data, and it does not on its own make samples Boltzmann weighted.');
  await run.line('Those simulations are also short: 8 ns in MISATO, the last 10 ns of 100 in ATLAS, and the last 10% of runs of up to 500 ns in mdCATH. Runs like that rarely cross slow barriers, so they cannot hold the true weights of slow states.');
}

async function reweight(run) {
  const { ui } = run, { m, ref } = run.state;
  ui.tags('paper');
  ui.reads([]);
  await run.line('Suppose you did want true populations. If you know both the energy of each sample and the probability with which it was generated, you can correct the crowd: give each sample the weight p/q. This is the idea of a <b>Boltzmann generator</b>.');
  ui.tags('game', 'model');
  ui.reads([{ value: pp(ref), label: 'simulation' }, { id: 'r-a', value: '–', label: 'as sampled' }, { id: 'r-b', value: '–', label: 'after weights' }, { id: 'r-e', value: '–', label: 'share of samples still useful' }]);
  ui.say('Here we can cheat, with two numbers on a histogram: the true p from the long simulation, and q from the samples. <b>Sample with Boltz-2\'s settings, then reweight.</b>');
  await run.until((done) => ui.ctrl(ui.button('Sample and reweight', () => { ui.ctrl(); done(); }, { id: 'rew' })));
  const r = await go(run, { eta: 1.5, gamma0: 0.8, gammaMin: 4, lambda: 1.003 }, { seconds: 1.4 });
  if (!r) return;
  const G = m.grid, tot = m.hist.reduce((a, b) => a + b, 0), cell = (x, y) => Math.min(G - 1, Math.max(0, Math.floor((x + 180) / 5))) + G * Math.min(G - 1, Math.max(0, Math.floor((y + 100) / 5)));
  const q = new Float64Array(G * G), n = r.X.length;
  for (let i = 0; i < n; i += 1) q[cell(r.X[i], r.Y[i])] += 1;
  let s = 0, s2 = 0;
  const w = new Float64Array(n), c = [0, 0, 0];
  for (let i = 0; i < n; i += 1) { const k = cell(r.X[i], r.Y[i]); w[i] = (m.hist[k] / tot) / (q[k] / n); s += w[i]; s2 += w[i] * w[i]; c[r.X[i] > 0 ? 2 : r.Y[i] > 45 ? 1 : 0] += w[i]; }
  const p2 = c.map((v) => v / s), ess = (s * s) / s2 / n;
  run.state.rew = { p2, ess };
  ui.read('r-a', pp(r.pop)); ui.read('r-b', pp(p2)); ui.read('r-e', pct(ess));
  await run.line(`The weights pull it back toward the truth, to ${pct(p2[2], 1)} in the rare region in this run. That is about 1% with 4,000 droplets, and higher with more droplets.`);
  await run.line(`Only ${pct(ess)} of the samples still count, and places never sampled stay empty. Weights cannot create what the sampler missed.`);
  ui.tags('paper');
  await run.line('And you could only do this because you had p, from a long simulation, and q, from a histogram in two dimensions. For a protein, Boltz gives you no energy for a sample, and no density either. Boltzmann generators are built to supply both, using invertible networks and a force field.');
  await run.line('Song and colleagues showed that a diffusion model\'s density can be computed by integrating along the ODE. That holds for a deterministic flow. Algorithm 18 adds noise and fresh rotations at each step, so it has no such formula. It is not part of Boltz.');
}

async function ensembles(run) {
  const { ui } = run, B = boltzRun();
  ui.tags('paper');
  ui.reads([]);
  await run.line('So what is known about real ensembles? AlphaFold3\'s authors are plain: multiple seeds "do not produce an approximation of the solution ensemble".');
  await run.line('<b>Boltz-2</b>, with molecular-dynamics conditioning, predicts which residues fluctuate. RMSF is how far each residue wanders. Per-target correlation with simulated RMSF was 0.79 on mdCATH and 0.85 on ATLAS, against 0.72 and 0.76 with X-ray conditioning. BioEmu scored 0.77 and 0.83.');
  await run.line('That measures local flexibility. It is not a test of the populations of metastable states. The authors say that diversity stayed below that of BioEmu and AlphaFlow, that the model often fails to capture large conformational changes, and that the MD set was relatively small.');
  await run.line('<b>BioEmu</b> aims straight at this. It trains on over 200 ms of MD, reweighted toward equilibrium where possible, and fine-tunes on measured stabilities. Models fine-tuned on 11 fast folders came within 0.74 kcal/mol of the MD free-energy surface of the twelfth, and the public model predicts folding free energies near 1 kcal/mol.');
  await run.line('Its authors still name the limit: it generates distributions "entirely empirically", with no energy function behind them, so its samples cannot be reweighted directly. It covers single chains near 300 K, and it does not model dynamics.');
  ui.tags('boltz', 'game');
  const ns = ['seed 43', 'second sample', 'step scale 1.0', '40 steps'];
  const base = B.finals['seed 42'];
  ui.reads(ns.map((k) => ({ value: `${fmt(fitRmsd(B.finals[k], base), 1)} Å`, label: k })));
  await run.line('What then does the spread of Boltz samples mean? These are real runs of our 136-residue protein, each compared with the first. A new seed or sample moved it more than these new settings did. That spread mixes the model\'s uncertainty with sampler choices.');
  await run.line('It may overlap with thermal motion, and sometimes it does, but nothing makes it equal. MIT\'s announcement says Boltz-1 is named after the Boltzmann distribution. That is where the name came from. It is no claim about its samples.');
}

async function useThem(run) {
  const { ui } = run;
  ui.tags('paper');
  ui.reads([]);
  await run.choose('How would you use 100 Boltz samples? This one is sound or unsound: "Samples show two conformations I had not considered, so I will test both."', [
    { text: 'Sound', right: true, why: 'Yes. Samples are good at proposing structures. Testing them is exactly what they are for.' },
    { text: 'Unsound', why: 'Using samples as ideas to test is the safest use there is.' },
  ]);
  await run.choose('"80 samples are closed and 20 open, so the closed state is 0.8 kcal/mol lower."', [
    { text: 'Sound', why: 'Nothing ties those counts to exp(−F/kT). You saw a sampler knob alone cut a population by half.' },
    { text: 'Unsound', right: true, why: 'Yes. The arithmetic is fine, and the premise is not. Frequencies need a check before they can be read as populations.' },
  ]);
  await run.choose('"I start molecular dynamics from each sample, check that the trajectories connect the states, then build a Markov model and reweight."', [
    { text: 'Sound', right: true, why: 'Yes, and only with that check. Unconnected states cannot be weighed against each other. BioEmu\'s authors suggest starting MD from samples. The Markov model is a further step.' },
    { text: 'Unsound', why: 'This is a good use, as long as the trajectories connect the states: the populations then come from a force field, with its own known errors.' },
  ]);
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. You run Boltz-2 with --method md and 100 seeds on a protein with a known 90:10 two-state equilibrium, and get 60:40. What is the honest conclusion?',
      options: [
        { text: 'The experiment must be wrong, because the MD conditioning samples the true ensemble.', why: 'Nothing guarantees that. The MD results shown were about local flexibility, not populations.' },
        { text: 'The model found both states, which is useful. Its frequencies did not match, and were never promised to.', right: true, why: 'Yes. Finding the states is a real result. The share has to come from elsewhere.' },
        { text: 'Adding more seeds will bring it to 90:10.', why: 'More seeds shrink the sampling noise around whatever the model and sampler give. They do not remove a bias.' },
      ],
    },
    {
      q: 'What is the one thing that a Boltzmann generator has, and that Boltz lacks, for getting true populations?',
      options: [
        { text: 'A bigger network.', why: 'Size is not the issue. Boltz is far bigger.' },
        { text: 'A connection to an energy: the energy of each sample, and the probability of having generated it, so that it can be reweighted.', right: true, why: 'Yes. Both are needed for weights exp(−u)/q. Without them, a sample carries no thermodynamic meaning of its own.' },
        { text: 'More training data from the PDB.', why: 'More crystal structures would not supply an energy.' },
      ],
    },
  ]);
}
