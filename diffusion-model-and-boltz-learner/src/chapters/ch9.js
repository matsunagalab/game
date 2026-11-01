// Chapter 9. Is it the Boltzmann distribution? Level 1: two real chains of adenylate kinase as an exact mixture with a known share, and one dot that sets the
// two sampler knobs. Level 2: the one real reference, MD of alanine dipeptide, on the molecule itself. Level 3: predict the exact run on Boltz-2's schedule.
import { adk, boltzRun, mdRun } from '../science/data.js';
import { populations } from '../science/stats.js';
import { schedule, stochasticStep } from '../science/sampler.js';
import { fitRmsd } from '../science/kabsch.js';
import { chainRun, isOpen, noiseBurst, oddsPower, PRESETS } from '../science/twostate.js';
import { conformer, BONDS } from '../science/dipeptide.js';
import { logit, oddsMiss, PAD, padOpt, TWO, twoOpt } from '../science/levels.js';
import { Bundle, chainBonds } from '../mol.js';
import { Board, fieldOf, fmt, placeInk, plate, Pour, sigmaLevel } from './common.js';
import { PIGMENT } from '../world.js';
import { makeRng } from '../science/rng.js';

const KT = 0.596, TILT = 0.0005; // kT in kcal/mol at 300 K. The tilt is the bottom of the odds chart.
const { smax: SMAX, smin: SMIN, steps: STEPS, seed: SEED, lambda: LAMBDA, gammaMin: GAMMA_MIN, drops: DROPS, eta: ETA, noise: NOISE, rounds: ROUNDS, guess: GUESS, shown: MOLS } = PAD;
const { width: WIDTH, share: SHARE, tol: TOL, preview: PREVIEW, drops: DROPS2, shown: SHOWN, odds: ODDS, shares: SHARES, start: START } = TWO;
const INK = '29, 33, 65', TEAL = '#0d8a8f', MAG = '#c2185b', ULTRA = '#2336a8', PLUM = '#6a2c91', SOFT = '#565c7c';
const REGIONS = ['α-like', 'strand', 'φ > 0'];
const GOALS = ['Drag the dot until open matches the truth.', 'Dot to ring, then drag the rare bar to your guess.', 'Drag the dot to where open lands.'];
const CLOSED_INK = PIGMENT.ultra, OPEN_INK = PIGMENT.teal;

export default {
  id: 'boltzmann',
  puzzle: true,
  place: [2, 3],
  title: 'Is it the Boltzmann distribution?',
  tease: 'Run a sampler where the true share is known, and watch what its two knobs do to a rare state.',
  principle: 'On a perfect field you matched the truth, then two sampler knobs alone shrank a rare state. Sample frequencies are not populations unless checked.',
  caveat: 'Exact toy fields: nothing direct about Boltz on any protein.',
  goals: GOALS,
  get note() {
    const m = mdRun(), K = adk(), B = boltzRun(), base = B.finals['seed 42'], far = ['seed 43', 'second sample', 'step scale 1.0', '40 steps'].map((k) => `${fmt(fitRmsd(B.finals[k], base), 1)} Å for ${k}`).join(', ');
    return `<h3>Chapter note</h3>
    <p><b>Your moves and the real thing.</b> The dot sets two real numbers of the sampler, Algorithm 18 of AlphaFold3, which Boltz also uses. η, the step scale, stretches each step. γ₀ sets how much fresh noise comes before each step. They are different knobs, and Boltz-2's preset changes both, together with the noise scale λ, which stays at ${LAMBDA} here.</p>
    <p><b>Why two kinds of board.</b> No true Boltzmann reference exists here for a protein, so none is faked. Levels 1 and 3 use a teaching model with a known answer: two real structures of adenylate kinase, closed (1AKE chain A) and open (4AKE chain A), 214 C-alpha atoms, as a mixture of two Gaussians of width ${WIDTH} Å with a share we set. There is no rotation, so the denoiser is exact and the true share is known. The best-rotation denoiser of chapter 7 is not used, because its closed share moves with the starting noise. Chains that land are real members of the run, in all 642 coordinates. Level 2 uses the one real reference in this game, molecular dynamics of alanine dipeptide.</p>
    <p><b>What this does and does not show.</b> The fields are exact, which Boltz is not. A trained network errs in its own ways, these settings were made for a trained network, and Boltz's loss is aligned, so nobody should read these numbers as Boltz's error on any protein. They show only that a sampler can change populations with a perfect field.</p>
    <p><b>Level 1.</b> Boltz-2's real schedule in Å, 200 steps. Letting go runs ${DROPS2.toLocaleString('en')} droplets on the line between the states, exact because Gaussians of one width depend only on that line, and ${SHOWN} whole chains, which the tests compare with the line. A drag shows ${PREVIEW.toLocaleString('en')} droplets. Matching the truth is a valley, not a point. On it, η falls as γ₀ rises: η = 1 at γ₀ = 0, about 0.9 at γ₀ = 0.5, and about 0.8 at γ₀ = 1. Boltz-2 sits far from it, near a 2.5% share for a true 10%. This is a result on an exact field, and says nothing about what suits a trained network.</p>
    <p><b>Level 2, the reference.</b> Our own molecular dynamics of alanine dipeptide (ACE-ALA-NME) in TIP3P water with ff14SB, 300 K, 1 bar, 4 fs with hydrogen mass repartitioning, in OpenMM. A long simulation visits each conformation in proportion to exp(−U/kT), so on this map frequencies mean something physical. Plain MD was not enough. In 37 ns the runs disagreed with each other, with one real entry to φ above 0, of 915 ps, and four one-frame grazes, and the α-like share of 1 ns blocks ran from 0 to 0.73. Pooled, they gave 25.8 / 71.7 / 2.5%, which agrees with the reference within its error. The reason to replace them was too few crossings, not a wrong answer.</p>
    <p>So three new runs carry a fixed 2-D bias on φ and ψ, from a short well-tempered metadynamics, and each frame is weighted back by exp(+V/kT). ${(m.frames / 1000).toFixed(0)} ns in all. The bars' whiskers are standard errors between those three runs, about ${(100 * m.pop[0]).toFixed(0)} ± ${(100 * m.se[0]).toFixed(0)} / ${(100 * m.pop[1]).toFixed(0)} ± ${(100 * m.se[1]).toFixed(0)} / ${(100 * m.pop[2]).toFixed(1)} ± ${(100 * m.se[2]).toFixed(1)}%, and the three small dots are the runs themselves, ${m.perRun.map((r) => `${(100 * r[0]).toFixed(0)}/${(100 * r[1]).toFixed(0)}/${(100 * r[2]).toFixed(1)}`).join(', ')}. Blocks within runs understate this error. The Kish effective sample size is ${m.ess.toLocaleString('en')}, which ignores time correlation. The α-like signal is still correlated at 100 ps, so independent samples number in the hundreds. The field uses 7,000 frames drawn in proportion to weight, with repeats, ${m.distinct.toLocaleString('en')} of them distinct. It is a Boltzmann sample of this force field, up to that error. It says nothing about how good the force field is.</p>
    <p><b>The molecule and the small map.</b> Each droplet of the sampler is a point in φ and ψ, shown on the small map, and each of the ${MOLS} molecules on the board is one of those droplets, built from the real starting structure with bond lengths and angles fixed and only φ and ψ turned. The sampler runs on the exact 2-D field of those frames, not on the molecule's coordinates. Before a run the molecules are real MD frames. The molecules turn while droplets run only because the droplets move. Sampler steps are not MD time and not a pathway.</p>
    <p><b>Regions.</b> The three bars are regions of the φ, ψ map, not thermodynamic states. φ above 0 is one region, and it is mostly αL (3.0%, the rest 0.4%). Below φ = 0, ψ above 45° is the strand side, β with PII, and ψ below 45° the α-like side. The line ψ = 45° sits on the shoulder of the α region, not on the valley floor at 65 to 95°. A cut at 20° gives 28.1% α-like, and a cut at 75° gives 31.5%. φ = 0 is a harmless line. The rare bar is drawn ten times taller than the other two.</p>
    <p><b>Free energy.</b> F is minus kT ln p, with kT = ${KT} kcal/mol at 300 K. The rare region lies ${fmt(KT * Math.log(m.pop[1] / m.pop[2]), 2)} ± ${fmt(KT * (m.se[2] / m.pop[2]), 2)} kcal/mol above the strand side. These are region free energies in φ and ψ, with every other degree of freedom integrated out.</p>
    <p><b>The settings.</b> Boltz-2: η = 1.5, γ₀ = 0.8, γ_min = 1 Å, λ = 1.003. Boltz-1: η = 1.638, γ₀ = 0.605, γ_min = 1.107 Å, λ = 0.901 (<i>boltz/main.py</i>). The burst of fresh noise is λ √((1 + γ₀)² − 1) σ, so ${fmt(noiseBurst(PRESETS.boltz2), 2)} σ and ${fmt(noiseBurst(PRESETS.boltz1), 2)} σ, on 154 of Boltz-2's 200 steps, above 1 Å. Karras et al. cap γ at √2 − 1, which adds at most 1.0 σ. Boltz-2's Table 7 says that with the exception of σ_min they opted for AlphaFold3's default hyperparameters. Their documentation says the step size is related to the temperature at which the process samples, and that a lower value gives more diversity.</p>
    <p><b>The 2-D runs</b> use ${STEPS} steps from ${SMAX}° to ${SMIN}°, with ρ = 7, and γ_min scaled to ${GAMMA_MIN}°. Only η, γ₀ and λ are the models' own. Letting go runs ${DROPS.toLocaleString('en')} droplets on the stored field, which below σ = 5° stays at its σ = 5° grid. That blurs the picture a little and leaves the region shares unchanged, as tools/test.mjs checks against the exact sum. One seed is shown, and it lies within one standard deviation of the mean of 12 seeds for the plain run, noise alone and Boltz-2's settings. Ten seeds of 4,000 droplets, exact to the end, give 29.4 / 67.0 / 3.6% for the plain run, 15.8 / 84.2 / 0.0 for η alone, 28.3 / 69.7 / 2.0 for noise alone, 22.3 / 77.3 / 0.4 for Boltz-2's three settings, and 17.8 / 82.1 / 0.1 for Boltz-1's. Across seeds, the rare region with Boltz-2's settings lies between about 0.2 and 0.6%. Boltz-2's own range and 200 steps gave the same result for the full preset (0.4%). The η-only result does depend on the range: η = 1.04 is enough to halve the rare region on Boltz's range, near 1.1 on this one, and η = 1.5 alone gives 0 / 100 / 0 there. Read the direction and not the number. On a torus instead of a flat sheet, η = 1.5 alone leaves 1.6% and the full preset 0.6%. With η = 1 and no added noise the droplets match, because the data were already Boltzmann samples and the sampler solved the equation faithfully. Boltz has a third reason to differ: its aligned loss means its denoiser is not this exact field, even before the sampler is changed. A longer step alone empties the rare region, and the added noise takes back part of what it did.</p>
    <p><b>More steps do not repair η.</b> η changes the equation being solved, not the accuracy of solving it. The flow runs too fast at every noise level, so a finer schedule converges to the wrong answer.</p>
    <p><b>Sampler steps are not time.</b> Iterations of a sampler are not MD time and not a pathway. Chains landing on the board are not the enzyme opening and closing, and nothing about the order of steps says how a molecule moves between regions.</p>
    <p><b>Level 3, the two-state calculation.</b> Exact, this game's own, not from a paper. It leaves out centring, random rotation and Boltz's alignment. The axes are odds on a log scale, so a line through 50:50 means the odds are raised to a power. The calculation with states 10 Å apart gives 0.29%, 2.2% and 19.6% for 3.4%, 10% and 30%, powers 1.75, 1.73 and 1.67. At the real 119.5 Å between these chains it gives 0.35%, 2.4% and 19.8%, powers 1.69, 1.69 and 1.65, from 900,000 droplets. So the power is near 1.7 either way, and separation matters a little. With Boltz-1's settings and schedule it is near 2.2. Runs of whole chains in all 642 coordinates agree with the line within sampling error, and the width of the states does not change it. The grey line is a faithful sampler. For a fixed free-energy gap, that power is what cooling to about 1/1.7 of the temperature would do. The link to temperature is an analogy. The view zooms with the noise.</p>
    <p><b>What the model is trying to reproduce.</b> In Boltz no energy appears in the loss, no temperature, and no exp(−U/kT), and the denoiser is not an exact field. A model returns the distribution of its training data as seen through its sampler. The PDB-wide map gives very different shares from one peptide, because it mixes thousands of residues in folded proteins, each held in place by its neighbours. Among ${K.counts.chains} complete chains of E. coli adenylate kinase we found, ${K.counts.closed} are closed. That records which ligands people chose to crystallise with, not how much time the protein spends closed. Boltz-1 trained on one structure per system. Boltz-2 also trains on NMR and molecular-dynamics ensembles, drawing one conformer at random each time, and adds distance and B-factor targets from the ensemble. That is a real step toward thermal data, and it does not on its own make samples Boltzmann weighted. More seeds shrink the sampling noise around whatever the model and sampler give, and they do not remove a bias.</p>
    <p><b>Boltz-2's MD data.</b> MISATO: 8 ns at 300 K. ATLAS: the last 10 ns of 100 ns. mdCATH: the last 10% of runs of up to 500 ns, at 320 K (Passaro et al., Appendix A.1.2). Section 6 calls the MD data used at the later stages of training relatively small. Runs like these rarely cross slow barriers, so they cannot hold the true weights of slow states.</p>
    <p><b>Reweighting.</b> If you know both the energy of each sample and the probability with which it was generated, you can give each sample the weight p/q. This is the idea of a Boltzmann generator, which gets exact q from an invertible map and p from an energy function (Noé et al. 2019). On the 2-D map a histogram can stand in: with Boltz-2's settings, weights from 5° cells bring the rare region to about 1% with 4,000 droplets and 1.9% with 40,000, because they only sum p over visited cells. Weights cannot create what the sampler missed. In two dimensions you can histogram, and in 1,800 you cannot. Boltz gives no energy for a sample and no density either. Song and colleagues showed that a diffusion model's density can be computed by integrating along the ODE, which holds for a deterministic flow. Algorithm 18 adds noise and fresh rotations at each step, so it has no such formula.</p>
    <p><b>Using samples.</b> Samples are good at proposing conformations to test. Counts of samples are not free energies. A sound route to populations is to start molecular dynamics from samples, check that the trajectories connect the states, and only then build a Markov model and reweight. Unconnected states cannot be weighed against each other. BioEmu's authors suggest starting MD from samples, and the Markov model is a further step.</p>
    <p><b>Real ensembles.</b> AlphaFold3's authors say multiple seeds "do not produce an approximation of the solution ensemble". Boltz-2, with molecular-dynamics conditioning, predicts which residues fluctuate: per-target correlation with simulated RMSF was 0.79 on mdCATH and 0.85 on ATLAS, against 0.72 and 0.76 with X-ray conditioning, and BioEmu scored 0.77 and 0.83. That measures local flexibility, not the populations of metastable states. The authors say that diversity stayed below that of BioEmu and AlphaFlow, and that the model often fails to capture large conformational changes. BioEmu trains on over 200 ms of MD, reweighted toward equilibrium where possible, and fine-tunes on measured stabilities. Its 0.74 kcal/mol is a leave-one-out test on 12 fast folders, with "DESRES-finetuned models", on a 2-D free-energy surface, and is not the public model, which predicts folding free energies near 1 kcal/mol. Its authors note that it generates distributions "entirely empirically", with no energy function behind them, so its samples cannot be reweighted directly. It covers single chains near 300 K and does not model dynamics.</p>
    <p><b>The spread of real Boltz samples.</b> In the stored runs of our 136-residue protein (Real Boltz output, Boltz 2.2.1, one protein, reduced settings), each compared with the first: ${far}. That spread mixes the model's uncertainty with sampler choices. It may overlap with thermal motion, and nothing makes it equal.</p>
    <p><b>The name.</b> MIT Jameel Clinic's announcement of December 2024 says Boltz-1 is named after the Boltzmann distribution. That is the origin of a name. The authors do not claim Boltzmann statistics, and their papers discuss neither energies in training nor population recovery.</p>
    <p class="small">Boltzmann generators: Noé et al., Science 365, eaaw1147 (2019). BioEmu: Lewis et al., Science 389, eadv9817 (2025), read as its preprint, doi 10.1101/2024.12.05.626885. AlphaFold3: Abramson et al., Nature 630, 493 (2024). Boltz-2: Passaro et al., bioRxiv 10.1101/2025.06.14.659707, Tables 7, 9 and 10, Section 6, Appendix A and C.1.1. Likelihood from a diffusion model: Song et al. 2021.</p>`;
  },

  setup(run) {
    const T = run.state.T = new Board(run, { span: 78 }), m = run.state.m = mdRun(), K = adk();
    T.setPanel(190, 0, 232);
    const a = K.models[K.ids.indexOf(TWO.closed)], b = K.models[K.ids.indexOf(TWO.open)];
    run.state.C = new Chains(run, a, b);
    run.state.P = new Pad(run);
    run.state.field = fieldOf(run, 'md', m.x, m.y).then((F) => { run.state.F = F; run.state.Dfast = (x, s, out) => F.fast(x[0], x[1], s, out); return F; });
    run.state.field.catch(() => {}); // Leaving at once while the water mixes is not an error.
    run.state.pour = new Pour({ paint: () => {}, setZoom: () => {} }, Math.min(DROPS, run.world.dropCount));
    run.state.S = schedule(STEPS, SMIN, SMAX, 7);
    run.probe = {};
  },
  stages: [level1, level2, level3],
};

// Real chains of the two states on the board, and droplets on the line between them.
class Chains {
  constructor(run, a, b) {
    const { n } = { n: a.length / 3 }, dim = a.length;
    Object.assign(this, { run, a, b, n, dim, X: new Float64Array(SHOWN * dim), shown: SHOWN, sigma: 0, ink: new Float32Array(3 * SHOWN), heavy: new Float32Array(SHOWN).fill(1), token: 0 });
    this.bundle = new Bundle(run, { n, bonds: chainBonds(n), K: SHOWN, drops: Math.round(run.world.dropCount * 0.6), seed: 7, thick: 0.5, mass: 0.7 });
    const o = [0, 0, 0];
    for (let i = 0; i < n; i += 1) for (let e = 0; e < 3; e += 1) o[e] += (a[3 * i + e] + b[3 * i + e]) / (2 * n);
    this.origin = o;
    this.xi = new Float64Array(SHOWN * dim);
    const r = makeRng(41);
    for (let i = 0; i < this.xi.length; i += 1) this.xi[i] = r.n();
    this.on = true;
    run.tick((dt) => this.frame(dt));
  }

  // Chains at rest, split in this share: what a share looks like on a real molecule.
  rest(share) {
    const { X, a, b, dim, xi } = this, up = Math.max(share > 0.004 ? 1 : 0, Math.round(share * SHOWN));
    for (let c = 0; c < SHOWN; c += 1) { const y = c < up ? b : a; for (let i = 0; i < dim; i += 1) X[c * dim + i] = y[i] + WIDTH * xi[c * dim + i]; }
    this.paintStates();
    this.sigma = 0;
  }

  // A rare chain lies alone where the others lie on top of each other, so it needs darker ink to read as a chain.
  paintStates() { for (let c = 0; c < SHOWN; c += 1) { const open = isOpen(this.X, c, this.a, this.b); this.ink.set(open ? OPEN_INK : CLOSED_INK, 3 * c); this.heavy[c] = open ? 4.2 : 1; } }

  // The real run, in view. Fast through the high noise, where nothing shows, and slow at the end.
  go(p, opt, seed) {
    const { run, X } = this, my = (this.token += 1), it = chainRun({ p, a: this.a, b: this.b, w: WIDTH, N: DROPS2, K: SHOWN, X, opt, seed }), t0 = performance.now(), TOTAL = run.world.reduce ? 200 : 1500;
    let k = 0;
    return run.hold(new Promise((resolve, reject) => {
      const frame = () => {
        if (!run.alive) return;
        if (my !== this.token) { resolve(null); return; }
        try {
          const f = Math.min(1, (performance.now() - t0) / TOTAL), want = f >= 1 ? Infinity : 200 * (1 - (1 - f) ** 2.4), end = performance.now() + 9;
          let r = null;
          while (k < want && performance.now() < end) { r = it.next(); k += 1; if (r.done) { this.sigma = 0; this.paintStates(); resolve(r.value); return; } this.sigma = r.value; }
          // Pigment follows which state each chain is nearer, once there is anything to see.
          if (this.sigma < 60) this.paintStates(); else this.ink.fill(0.6);
          run.sound.setSigma(sigmaLevel(this.sigma + 0.01, 2, 200));
          requestAnimationFrame(frame);
        } catch (e) { reject(e); }
      };
      requestAnimationFrame(frame);
    }));
  }

  frame(dt) {
    if (!this.on) return;
    if (!this.run.world.reduce) this.bundle.turn(dt * 0.1, 0);
    this.bundle.draw(this.X, { chainInk: this.ink, chainMass: this.heavy, origin: this.origin, sigma: Math.min(30, this.sigma), mass: this.sigma > 3 ? 1.6 : 1 });
  }
}

// The molecule of the simulation, many conformers at once, with its small map beside it.
class Peptide {
  constructor(run) {
    Object.assign(this, { run, K: MOLS, X: new Float64Array(MOLS * 30), ink: new Float32Array(3 * MOLS), xs: null, ys: null, n: 0, o: [0, 0, 0] });
    this.bundle = new Bundle(run, { n: 10, bonds: BONDS, K: MOLS, drops: Math.round(run.world.dropCount * 0.25), seed: 11, thick: 0.11, mass: 0.05 });
    this.on = false;
    run.tick((dt) => { if (this.on) { if (!run.world.reduce) this.bundle.turn(dt * 0.12, 0); this.bundle.draw(this.X, { chainInk: this.ink, origin: this.o }); } });
    run.state.T.extra.push((g) => { if (this.on) this.drawMap(g); });
  }

  // Droplets to show: each of the first K is a conformer.
  set(xs, ys, n) {
    this.xs = xs; this.ys = ys; this.n = n;
    const c = [0, 0, 0];
    for (let k = 0; k < this.K; k += 1) { conformer(xs[k], ys[k], this.X, k); placeInk(xs[k], ys[k], c); this.ink.set(c, 3 * k); }
  }

  drawMap(g) {
    const b = this.run.state.T.box, s = Math.min(112, b.w * 0.3), x0 = b.x + 10, y0 = b.y + 22, k = s / 360;
    g.save();
    g.fillStyle = 'rgba(250, 250, 247, .7)'; g.fillRect(x0, y0, s, s);
    g.strokeStyle = `rgba(${INK}, .3)`; g.lineWidth = 1; g.strokeRect(x0, y0, s, s);
    if (this.xs) {
      const c = [0, 0, 0], N = Math.min(this.n, 900);
      for (let i = 0; i < N; i += 1) {
        const u = (this.xs[i] + 180) * k, v = (260 - this.ys[i]) * k;
        if (u < 0 || u > s || v < 0 || v > s) continue;
        placeInk(this.xs[i], this.ys[i], c);
        g.fillStyle = `rgba(${Math.round(255 * Math.exp(-c[0]))}, ${Math.round(255 * Math.exp(-c[1]))}, ${Math.round(255 * Math.exp(-c[2]))}, .7)`;
        g.fillRect(x0 + u, y0 + v, 1.6, 1.6);
      }
    }
    g.font = 'italic 12px "Ysabeau Office", serif'; g.fillStyle = SOFT; g.textAlign = 'right'; g.textBaseline = 'alphabetic'; g.fillText('φ', x0 + s - 3, y0 + s - 3); g.textAlign = 'left'; g.fillText('ψ', x0 + 3, y0 + 11);
    g.restore();
  }
}

// One dot on the plane of the two knobs, and bars against a reference.
class Pad {
  constructor(run) {
    Object.assign(this, { run, T: run.state.T, eta: START[0], gamma: START[1], bars: [0, 0, 0], goal: [0, 0, 0], token: 0, marks: [], ring: null, guess: null, live: false, want: null, job: null, ref: null });
    this.T.extra.push((g) => this.draw(g));
    run.tick(() => this.tick());
  }

  geo() {
    const p = this.T.panel, split = p.x + p.w * 0.5;
    return { p, pad: { x: p.x + 28, y: p.y + 10, w: split - p.x - 40, h: p.h - 36 }, bars: { x: split + 4, y: p.y + 24, w: p.x + p.w - split - 14, h: p.h - 50 } };
  }

  xOf(eta) { const { pad } = this.geo(); return pad.x + (pad.w * (eta - ETA[0])) / (ETA[1] - ETA[0]); }
  yOf(gamma) { const { pad } = this.geo(); return pad.y + pad.h - pad.h * ((gamma - NOISE[0]) / (NOISE[1] - NOISE[0])); }

  // The column of a bar. A small bar is drawn taller, by its own scale.
  column(i) { const { bars } = this.geo(), n = this.ref.names.length, w = bars.w / n; return { x: bars.x + w * i + w / 2, w: Math.min(w * 0.56, 40), top: bars.y, base: bars.y + bars.h, max: this.ref.max[i] }; }

  place(x, y) {
    const { pad } = this.geo(), step = 0.02, c = (v, a, b) => Math.max(a, Math.min(b, v));
    let eta = c(ETA[0] + ((x - pad.x) / pad.w) * (ETA[1] - ETA[0]), ...ETA), gamma = c(((pad.y + pad.h - y) / pad.h) * NOISE[1], ...NOISE);
    eta = Math.round(eta / step) * step; gamma = Math.round(gamma / step) * step;
    if (this.ring && Math.hypot(this.xOf(this.ring.eta) - x, this.yOf(this.ring.gamma) - y) < 26) { eta = this.ring.eta; gamma = this.ring.gamma; }
    this.eta = eta; this.gamma = gamma;
    if (this.live) this.want = [eta, gamma];
  }

  onRing() { return this.ring && this.eta === this.ring.eta && this.gamma === this.ring.gamma; }

  hit(x, y) {
    if (this.locked) return null;
    const { pad } = this.geo(), c = this.column(this.ref.names.length - 1);
    if (this.guessing) return x > c.x - 44 && x < c.x + 44 && y > c.top - 22 && y < c.base + 22 ? 'guess' : null;
    return x > pad.x - 22 && x < pad.x + pad.w + 22 && y > pad.y - 16 && y < pad.y + pad.h + 16 ? 'pad' : null;
  }

  bind(on) {
    const { run } = this, set = (x, y) => { const c = this.column(this.ref.names.length - 1); this.guess = Math.round(Math.max(0, Math.min(c.max, ((c.base - y) / (c.base - c.top)) * c.max)) * 500) / 500; };
    return run.board({
      at: (x, y) => this.hit(x, y),
      hover: (t) => { this.lit = t; },
      grab: (t, x, y) => { this.token += 1; this.run.state.C.token += 1; if (t === 'pad') this.place(x, y); else set(x, y); },
      move: (t, x, y) => { if (t === 'pad') this.place(x, y); else set(x, y); },
      drop: (t) => on(t),
      tap: (t) => on(t),
      cancel: () => {},
    });
  }

  // Level 1's preview, a slice of each frame. The newest place of the dot wins.
  tick() {
    if (this.want && !this.job) {
      const { C } = this.run.state, [e, g] = this.want;
      this.job = chainRun({ p: SHARE, a: C.a, b: C.b, w: WIDTH, N: PREVIEW, opt: twoOpt(e, g), seed: 3, slice: 8 });
      this.jobAt = [e, g]; this.want = null;
    }
    if (!this.job) return;
    const end = performance.now() + 5;
    let r;
    do { r = this.job.next(); } while (!r.done && performance.now() < end);
    if (!r.done) return;
    this.job = null;
    this.show(r.value, this.jobAt);
  }

  show(share, at) {
    this.goal = [1 - share, share];
    this.run.state.C.rest(share);
    if (this.marks.length < 420) this.marks.push({ eta: at[0], gamma: at[1], ok: Math.abs(share - SHARE) <= TOL, rare: share / SHARE });
  }

  draw(g) {
    if (this.off || !this.ref) return;
    const { p, pad } = this.geo();
    g.save();
    plate(g, p);
    this.drawPad(g, pad);
    const n = this.ref.names.length;
    for (let i = 0; i < n; i += 1) { this.bars[i] += (this.goal[i] - this.bars[i]) * 0.22; this.drawBar(g, i); }
    g.restore();
  }

  drawPad(g, pad) {
    g.fillStyle = 'rgba(255, 255, 255, .55)'; g.strokeStyle = `rgba(${INK}, ${this.lit === 'pad' ? 0.55 : 0.3})`; g.lineWidth = 1;
    g.beginPath(); g.rect(pad.x, pad.y, pad.w, pad.h); g.fill(); g.stroke();
    g.setLineDash([2, 3]); g.strokeStyle = `rgba(${INK}, .28)`;
    g.beginPath(); g.moveTo(this.xOf(1), pad.y); g.lineTo(this.xOf(1), pad.y + pad.h); g.stroke(); g.setLineDash([]);
    for (const q of this.marks) { g.fillStyle = q.ok ? 'rgba(13, 138, 143, .75)' : `rgba(194, 24, 91, ${0.1 + 0.3 * Math.min(1, q.rare)})`; g.beginPath(); g.arc(this.xOf(q.eta), this.yOf(q.gamma), 3.4, 0, Math.PI * 2); g.fill(); }
    g.font = '500 12px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (const v of [1, 1.5]) g.fillText(v, this.xOf(v), pad.y + pad.h + 13);
    g.textAlign = 'right'; g.fillText('0', pad.x - 5, this.yOf(0) + 2); g.fillText('1', pad.x - 5, this.yOf(1) + 8);
    g.font = 'italic 14px "Ysabeau Office", serif'; g.fillStyle = `rgb(${INK})`; g.textAlign = 'left'; g.fillText('η', pad.x + pad.w - 8, pad.y + pad.h + 14); g.fillText('γ', pad.x - 15, pad.y + 30);
    if (this.ring) {
      const x = this.xOf(this.ring.eta), y = this.yOf(this.ring.gamma);
      g.strokeStyle = PLUM; g.lineWidth = 2.4; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.font = '700 12.5px "Ysabeau Office", sans-serif'; g.fillStyle = PLUM; g.textAlign = x > pad.x + pad.w * 0.6 ? 'right' : 'left'; g.fillText(this.ring.label, x + (x > pad.x + pad.w * 0.6 ? -19 : 19), y + (y > pad.y + pad.h * 0.5 ? -8 : 16));
    }
    const x = this.xOf(this.eta), y = this.yOf(this.gamma);
    g.fillStyle = `rgba(${INK}, .14)`; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgb(${INK})`; g.beginPath(); g.arc(x, y, this.lit === 'pad' ? 11 : 9.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fbfbf8'; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
  }

  drawBar(g, i) {
    const c = this.column(i), { ref } = this, Y = (v) => c.base - (c.base - c.top) * (v / c.max), { x, w } = c, n = ref.names.length;
    g.fillStyle = 'rgba(29, 33, 65, .07)'; g.fillRect(x - w / 2, c.top, w, c.base - c.top);
    if (!this.hideBars) { g.fillStyle = ref.colors[i]; g.globalAlpha = 0.82; const t = Y(Math.min(c.max, this.bars[i])); g.fillRect(x - w / 2, t, w, c.base - t); g.globalAlpha = 1; }
    // The reference with its error, and the runs behind it if there are any.
    const a = Y(Math.min(c.max, ref.pop[i] + ref.se[i])), b = Y(Math.max(0, ref.pop[i] - ref.se[i])), mid = Y(ref.pop[i]);
    g.fillStyle = 'rgba(29, 33, 65, .16)'; g.fillRect(x - w / 2 - 5, a, w + 10, b - a);
    g.strokeStyle = `rgb(${INK})`; g.lineWidth = 2; g.beginPath(); g.moveTo(x - w / 2 - 5, mid); g.lineTo(x + w / 2 + 5, mid); g.stroke();
    g.fillStyle = `rgb(${INK})`;
    for (const r of ref.runs ?? []) { g.beginPath(); g.arc(x + w / 2 + 9, Y(Math.min(c.max, r[i])), 1.8, 0, Math.PI * 2); g.fill(); }
    g.textAlign = 'center'; g.font = '700 12.5px "Ysabeau Office", sans-serif'; g.fillStyle = `rgb(${INK})`;
    if (!this.hideBars) g.fillText(`${(100 * this.bars[i]).toFixed(ref.max[i] < 1 ? 1 : 0)}%`, x, c.top - 6);
    g.font = '500 12px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT; g.fillText(ref.names[i], x, c.base + 14);
    if (ref.max[i] < 1) { g.font = '500 11px "Ysabeau Office", sans-serif'; g.fillText(`×${Math.round(1 / ref.max[i])}`, x, c.base + 26); }
    if (i === n - 1 && this.guess !== null) {
      const v = Y(this.guess);
      g.strokeStyle = PLUM; g.lineWidth = 3; g.beginPath(); g.moveTo(x - w / 2 - 7, v); g.lineTo(x + w / 2 + 7, v); g.stroke();
      g.fillStyle = PLUM; g.beginPath(); g.arc(x + w / 2 + 13, v, this.lit === 'guess' ? 11 : 9.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = '700 11px "Ysabeau Office", sans-serif'; g.textBaseline = 'middle'; g.fillText('?', x + w / 2 + 13, v + 0.5); g.textBaseline = 'alphabetic';
    }
  }

  padHint(eta = 1, gamma = 0) { return { from: () => ({ x: this.xOf(this.eta), y: this.yOf(this.gamma) }), to: () => ({ x: this.xOf(eta), y: this.yOf(gamma) }) }; }
  barHint() { return { from: () => { const c = this.column(this.ref.names.length - 1); return { x: c.x + 12, y: c.base - 8 }; }, to: () => { const c = this.column(this.ref.names.length - 1); return { x: c.x + 12, y: c.top + 30 }; } }; }
}

const pc = (v, d = 1) => `${(100 * v).toFixed(d)}%`;
const caption = (run, text) => run.state.T.extra.push((g) => { if (run.state.caption === text) { const b = run.state.T.box; g.save(); g.font = '500 12.5px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(text, b.x + b.w / 2, b.y + 13); g.restore(); } });
const MIX = 'Exact mixture, not Boltz', RUN = 'Real simulation, not Boltz';

async function level1(run) {
  const { P, T, C } = run.state, { ui, sound } = run;
  run.level(GOALS[0], ['real', 'game', 'model']);
  caption(run, MIX); run.state.caption = MIX;
  Object.assign(P, { eta: START[0], gamma: START[1], live: true, locked: false, ring: null, guessing: false, guess: null, hideBars: false, off: false, marks: [] });
  P.ref = { names: ['closed', 'open'], colors: [ULTRA, TEAL], pop: [1 - SHARE, SHARE], se: [TOL, TOL], max: [1, 0.25] };
  P.bars = [1 - SHARE, 0]; P.goal = [1 - SHARE, 0];
  T.setPanel(190, 0.4, 232); T.setSpan(78, 0);
  C.on = true; C.rest(SHARE); P.want = START;
  run.probe = { P, C };
  await run.until((done) => {
    run.scoped(P.bind(run.safe(async () => {
      P.want = null;
      P.locked = true;
      const seed = 5, out = await C.go(SHARE, twoOpt(P.eta, P.gamma), seed);
      P.locked = false;
      if (out === null || !run.alive) return;
      P.goal = [1 - out, out];
      if (P.marks.length < 420) P.marks.push({ eta: P.eta, gamma: P.gamma, ok: Math.abs(out - SHARE) <= TOL, rare: out / SHARE });
      if (Math.abs(out - SHARE) <= TOL) { P.locked = true; T.flash(true); done(); return; }
      T.flash(false); sound.soft();
      ui.feedback(`Open ${pc(out)}, true ${pc(SHARE, 0)}.`, 'bad');
    })));
    run.scoped(run.idle(() => P.padHint()));
  });
  await run.won(`Open ${pc(P.goal[1])}, true ${pc(SHARE, 0)}.`, 1);
}

async function runSampler(run, opt) {
  const { P, pour, S, F, Dfast, Mol } = run.state, my = (P.token += 1), rng = makeRng(SEED);
  pour.start(rng, F.mix.mx, F.mix.my, SMAX);
  // Pour paints through this: every frame the droplets move, the molecules follow them.
  pour.tank = { setZoom: () => {}, paint: (x, y, n) => { Mol.set(x, y, n); } };
  const ok = await pour.run(run, S, (p, g, i, k) => stochasticStep(p, S[k], S[k + 1], Dfast, g, rng, opt), { seconds: 1.1, halt: () => my !== P.token });
  if (!ok || !run.alive) return null;
  const pop = populations(pour.x, pour.y, pour.n);
  P.goal = pop;
  run.sound.drip?.(0.7); run.sound.drip?.(0.5, 0.09); run.sound.drip?.(0.35, 0.18);
  return pop;
}

async function level2(run) {
  const { P, T, C, m } = run.state, { ui, sound } = run;
  run.level(GOALS[1], ['real', 'game', 'model', 'paper']);
  caption(run, RUN); run.state.caption = RUN;
  C.on = false; C.bundle.hide();
  const Mol = run.state.Mol ??= new Peptide(run);
  Mol.on = true;
  run.world.mood = { flow: 0.0004, decay: 0.7, trail: 0.25 };
  Object.assign(P, { eta: 1, gamma: 0, live: false, locked: false, ring: null, guessing: false, guess: null, hideBars: true, off: false, marks: [], want: null, job: null });
  P.ref = { names: REGIONS, colors: [MAG, ULTRA, TEAL], pop: m.pop, se: m.se, runs: m.perRun, max: [1, 1, 0.1] };
  P.bars = [0, 0, 0]; P.goal = [0, 0, 0];
  T.setPanel(190, 0.4, 232); T.setSpan(12, 0.4);
  Mol.set(m.x, m.y, m.n);
  run.probe = { P, Mol };
  await run.state.field;
  await run.until((done) => {
    let r = 0, hits = 0;
    const begin = (i) => {
      r = i;
      P.ring = ROUNDS[i]; P.guessing = false; P.guess = null; P.hideBars = true; P.locked = false;
      Mol.set(m.x, m.y, m.n);
      ui.rounds(i, ROUNDS.length);
    };
    run.scoped(P.bind(run.safe(async (t) => {
      if (t === 'pad') {
        if (P.onRing()) { P.guessing = true; P.guess = 0.05; ui.feedback('Now guess.'); sound.drip?.(0.6); }
        return;
      }
      P.locked = true; P.guessing = false;
      const guess = P.guess, pop = await runSampler(run, padOpt(P.eta, P.gamma));
      if (!pop || !run.alive) return;
      P.hideBars = false;
      const hit = Math.abs(pop[2] - guess) <= GUESS;
      if (hit) hits += 1;
      T.flash(hit);
      if (hit) sound.drip?.(0.8); else sound.soft();
      ui.feedback(`${ROUNDS[r].label}: ${pc(pop[2])}.`, hit ? 'good' : 'bad');
      ui.rounds(r + 1, ROUNDS.length);
      await run.pause(1900);
      if (!run.alive) return;
      if (r + 1 < ROUNDS.length) { ui.feedback(''); begin(r + 1); return; }
      if (hits >= 2) { P.locked = true; done(); return; }
      hits = 0;
      ui.feedback('Again.', 'bad');
      begin(0);
    })));
    run.scoped(run.idle(() => (P.guessing ? P.barHint() : P.padHint(P.ring.eta, P.ring.gamma))));
    begin(0);
  });
  await run.won('Two knobs, both changed in Boltz-2.', 2);
  Mol.on = false; Mol.bundle.hide();
  run.world.mood = { flow: 0.0011, decay: 0.92, trail: 0.9 };
}

// Level 3. The chart's axes are odds, so that a power is a straight line.
class Odds {
  constructor(run) {
    Object.assign(this, { run, T: run.state.T, points: [], p: 0.3, y: 0.3, curve: null, locked: false });
    this.T.extra.push((g) => this.draw(g));
  }

  geo() {
    const p = this.T.panel, L = p.x + 44, R = p.x + p.w - 16, up = p.y + 12, base = p.y + p.h - 28, a = logit(0.02), b = logit(TILT);
    return { p, L, R, up, base, X: (q) => L + ((R - L) * (logit(q) - a)) / -a, Y: (q) => base - ((base - up) * (logit(q) - b)) / -b, inv: (y) => { const v = b + (-b * (base - y)) / (base - up), o = 10 ** v; return o / (1 + o); } };
  }

  hit(x, y) { if (this.locked) return null; const G = this.geo(); return x > G.L - 30 && x < G.R + 16 && y > G.up - 14 && y < G.base + 22 ? 'dot' : null; }

  bind(on) {
    const set = (y) => { const G = this.geo(); this.y = G.inv(Math.max(G.up, Math.min(G.base, y))); };
    return this.run.board({ at: (x, y) => this.hit(x, y), cursor: () => 'ns-resize', hover: (t) => { this.lit = t; }, grab: (t, x, y) => set(y), move: (t, x, y) => set(y), drop: () => on(), tap: () => on(), cancel: () => {} });
  }

  draw(g) {
    const G = this.geo(), { p, L, R, up, base, X, Y } = G;
    g.save();
    plate(g, p);
    g.strokeStyle = `rgba(${INK}, .22)`; g.lineWidth = 1; g.beginPath(); g.moveTo(L, up); g.lineTo(L, base); g.lineTo(R, base); g.stroke();
    g.font = '500 12px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT; g.textBaseline = 'alphabetic';
    g.textAlign = 'right';
    for (const v of [0.5, 0.1, 0.01, 0.001]) { g.fillText(`${100 * v}%`, L - 5, Y(v) + 4); g.strokeStyle = `rgba(${INK}, .09)`; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(R, Y(v)); g.stroke(); }
    g.textAlign = 'center';
    for (const v of [0.02, 0.05, 0.1, 0.2, 0.5]) g.fillText(`${100 * v}%`, X(v), base + 14);
    g.textAlign = 'left'; g.fillText('true share', L + 4, p.y + p.h - 2); g.strokeStyle = 'rgba(244, 245, 243, .9)'; g.lineWidth = 3.5; g.strokeText('after sampling', L + 6, up + 12); g.fillText('after sampling', L + 6, up + 12);
    g.textAlign = 'right'; g.fillText('faithful', X(0.08) - 6, Y(0.08) - 6);
    g.strokeStyle = `rgba(${INK}, .5)`; g.lineWidth = 1.6; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(X(0.02), Y(0.02)); g.lineTo(X(0.5), Y(0.5)); g.stroke(); g.setLineDash([]);
    if (this.curve) {
      g.strokeStyle = PLUM; g.lineWidth = 2.6; g.beginPath();
      for (let k = 0; k <= 40; k += 1) { const q = 0.02 * (0.5 / 0.02) ** (k / 40), o = (q / (1 - q)) ** this.curve, v = o / (1 + o), c = Math.max(up, Y(Math.max(v, TILT))); if (k) g.lineTo(X(q), c); else g.moveTo(X(q), c); }
      g.stroke();
      g.font = '700 13px "Ysabeau Office", sans-serif'; g.fillStyle = PLUM; g.textAlign = 'left'; g.fillText(`odds to the power ${fmt(this.curve, 1)}`, L + 10, base - 10);
    }
    for (const q of this.points) { g.fillStyle = PLUM; g.beginPath(); g.arc(X(q.p), Y(Math.max(q.out, TILT)), 5, 0, Math.PI * 2); g.fill(); }
    if (!this.curve && !this.locked) {
      const x = X(this.p), y = Y(this.y);
      g.strokeStyle = `rgba(${INK}, .4)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, up); g.lineTo(x, base); g.stroke();
      g.fillStyle = `rgba(${INK}, .14)`; g.beginPath(); g.arc(x, y, 19, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgb(${INK})`; g.beginPath(); g.arc(x, y, this.lit ? 12 : 10.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fbfbf8'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 3.5, y - 2); g.lineTo(x - 3.5, y - 2); g.closePath(); g.moveTo(x, y + 6); g.lineTo(x + 3.5, y + 2); g.lineTo(x - 3.5, y + 2); g.closePath(); g.fill();
      g.font = '700 12.5px "Ysabeau Office", sans-serif'; g.fillStyle = `rgb(${INK})`; g.textAlign = x > (L + R) / 2 ? 'right' : 'left'; g.fillText(this.y < 0.1 ? `${(100 * this.y).toFixed(1)}%` : `${(100 * this.y).toFixed(0)}%`, x + (x > (L + R) / 2 ? -22 : 22), y + 4);
    }
    g.restore();
  }

  hint() { return { from: () => { const G = this.geo(); return { x: G.X(this.p), y: G.Y(this.y) }; }, to: () => { const G = this.geo(); return { x: G.X(this.p), y: G.Y(this.y) + 56 }; } }; }
}

async function level3(run) {
  const { P, T, C } = run.state, { ui, sound } = run;
  run.level(GOALS[2], ['real', 'game', 'model']);
  caption(run, MIX); run.state.caption = MIX;
  P.off = true; P.live = false; P.want = null; P.job = null; P.token += 1;
  if (run.state.Mol) { run.state.Mol.on = false; run.state.Mol.bundle.hide(); }
  run.world.mood = { flow: 0.0011, decay: 0.92, trail: 0.9 };
  C.on = true; T.setSpan(78, 0); T.setPanel(236, 0, 300);
  const O = run.state.O = new Odds(run);
  run.probe = { O, C };
  ui.feedback('Our own calculation, not a paper\'s.');
  await run.until((done) => {
    let set = 0, at = 0, seed = 1;
    const deal = () => {
      const p = SHARES[set % SHARES.length][at];
      O.p = p; O.y = p; O.locked = false;
      C.rest(p);
      ui.rounds(at, 3);
    };
    run.scoped(O.bind(run.safe(async () => {
      O.locked = true;
      const p = O.p, guess = O.y;
      seed += 1;
      const out = await C.go(p, twoOpt(1.5, 0.8), seed);
      if (out === null || !run.alive) return;
      O.points.push({ p, out });
      sound.drip?.(0.6);
      const hit = oddsMiss(guess, out) <= ODDS;
      T.flash(hit);
      if (hit) {
        at += 1;
        sound.drip?.(0.8, 0.1);
        ui.rounds(at, 3);
        if (at === 3) { done(); return; }
        ui.feedback(`${pc(p, p < 0.1 ? 1 : 0)} became ${pc(out, out < 0.1 ? 1 : 0)}. Hit.`, 'good');
      } else {
        sound.soft();
        at = 0; set += 1;
        ui.feedback(`${pc(p, p < 0.1 ? 1 : 0)} became ${pc(out, out < 0.1 ? 1 : 0)}. Miss.`, 'bad');
      }
      await run.pause(1700);
      if (!run.alive) return;
      deal();
    })));
    run.scoped(run.idle(() => O.hint()));
    deal();
  });
  const fit = O.points.filter((q) => q.out > 0).map((q) => oddsPower(q.p, q.out));
  O.curve = fit.reduce((a, b) => a + b, 0) / fit.length;
  await run.won('Rarer states shrink more.', 3, 3200);
}
