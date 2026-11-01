// Chapter 6. From two numbers to thousands: real ubiquitin, rotation, alignment and handedness.
import { boltzRun, ubiquitin } from '../science/data.js';
import { Ensemble, rg } from '../science/cart.js';
import { HandTest } from '../science/hand.js';
import { bestRotation, centre, fitRmsd, randomRotation, rmsd, rotate, shift, axisRotation, compose } from '../science/kabsch.js';
import { schedule } from '../science/sampler.js';
import { bondsOf, chainInk, dragTurn, fitMol, MolInk } from '../mol.js';
import { check, chart, fmt, pct, sigmaLevel } from './common.js';
import { PIGMENT } from '../world.js';
import { makeRng } from '../science/rng.js';

export default {
  id: 'atoms',
  title: 'From two numbers to thousands',
  tease: 'The same mathematics on every atom of a real protein, and why rotation and handedness now matter.',
  principle: 'A structure is one point with three numbers per atom, so the same denoiser applies. Because any rotation of a structure is the same structure, AlphaFold2 built that into its frames, while AlphaFold3 and Boltz spin the training data and compare after alignment. Alignment also changes what the best guess is. The noisy point shows a whole protein\'s hand up to about 70 Å, but one chiral centre\'s, taken alone, only below about 0.3 Å, so a centre\'s hand must come from what the network supplies.',
  goals: ['Dissolve a real protein and bring it back.', 'Find the noise at which one chiral centre loses its hand.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>The data.</b> 39 of the 116 conformers of ubiquitin in PDB 2K39 (Lange et al., Science 320, 1471, 2008), an ensemble fitted to NMR residual dipolar couplings, heavy atoms only: 601 atoms, so x has 1,803 numbers. The conformers are close to each other, so this set has one fold.</p>
    <p><b>Our best-rotation denoiser.</b> Each conformer is rotated onto the noisy point by the Kabsch method, then the Gaussian weights are taken. This best-rotation form is our stand-in. It is not the true integral over all rotations, and at high noise the two differ, which is what the chart shows.</p>
    <p><b>The chart.</b> The grey curve is the plain posterior mean: a single conformer in 4,000 random rotations with Gaussian weights, computed here. It is what a squared-error loss with no alignment would seek, and its true limit at high noise is zero. The dashed line is simply drawn at 1, for a guess that keeps the protein's full size. It is not computed. The plum points are a real Boltz-2 run on a different protein, 136 residues, reduced settings, with Rg of each denoised structure divided by that of the last.</p>
    <p><b>Our reading.</b> AlphaFold3's loss rigidly aligns the truth onto the output before taking the squared error (Supplementary Eq. 2). Then a folded structure in any orientation is a good answer, and the blurred average is not needed. The rotation-invariant smooth LDDT term also favours full size (Supplementary Eq. 6, <i>add_smooth_lddt_loss</i> in Boltz's training configuration). The game infers these as the cause of the flat Boltz curve. No version of Boltz trained without them was tested here. Because D is not then a posterior mean, Tweedie's link to the score does not hold exactly for Boltz.</p>
    <p><b>Extrapolation.</b> Training noise in Boltz is 16 Å × exp(−1.2 + 1.5 n). So σ = 4,608 Å lies 4.6 standard deviations up, at a probability near 2 × 10⁻⁶, and 63 of the 200 network calls, counting the 1.8 times lift from the noise burst, lie above the 99.9th percentile of training noise, 497 Å. The network is extrapolating there.</p>
    <p><b>Handedness.</b> The sureness shown is computed here: the mean posterior for the true hand against its mirror image, with rotation integrated over 8,000 random rotations and noise averaged over many draws. Whole protein: all 601 atoms of one conformer. One centre: N, Cα, C and Cβ of residue 23. The simple formula 1/(1 + exp(−d²/2σ²)) puts the noise at its mean and ignores rotation. It gives 90% at 133 Å and 0.43 Å. Averaging over the noise alone gives 94 Å and 0.30 Å. Rotation then brings the whole protein to about 70 Å and hardly changes the centre.</p>
    <p>The 0.3 Å is for one centre taken alone, with no help from neighbouring atoms. With the local frame known from the rest of the chain, moving Cβ through the N, Cα, C plane shifts it by about 2.4 Å, and the limit is nearer 1 Å (about 0.8 Å by the same noise average).</p>
    <p><b>The real run.</b> Signed volumes over 130 non-glycine residues of the stored Boltz-2 run, compared with its final structure. One run, amino acids only, and ligands were not checked.</p>
    <p class="small">Jumper et al., Nature 596, 583 (2021). Abramson et al., Nature 630, 493 (2024), Supplementary Methods 3.7. Wohlwend et al., bioRxiv 10.1101/2024.11.19.624167. Kabsch, Acta Cryst A 32, 922 (1976).</p>`,

  setup(run) {
    const U = run.state.U = ubiquitin(), E = run.state.E = new Ensemble(U.models), bonds = bondsOf(E.models[0], U.n), maxRes = U.res[U.n - 1], { world } = run;
    const mol = run.state.mol = new MolInk(run, { n: U.n, bonds, inkOf: (a) => chainInk(U.res[a] / maxRes), drops: Math.round(world.dropCount * 0.6), weight: (b) => (U.role[b[0]] && U.role[b[1]] ? 3 : 1) });
    world.mood = { flow: 0.0011, decay: 0.92, trail: 0.9 };
    run.own({ dispose: () => { world.mood = { flow: 0.0009, decay: 0.9, trail: 0.8 }; } });
    fitMol(run, 48);
    const rng = run.state.rng = makeRng(61), n = run.state.n = new Float64Array(E.dim);
    for (let i = 0; i < E.dim; i += 1) n[i] = rng.n();
    const x = run.state.x = new Float64Array(E.models[0]);
    run.state.sigma = 0;
    run.state.spin = !world.reduce;
    run.state.b = bonds;
    const tick = (dt, time) => { if (run.state.spin) mol.turn(dt * 0.12, 0); if (!run.state.hideMol) mol.draw(x, run.state.sigma, { time }); };
    run.tick(tick);
    dragTurn(run, (a, b) => { mol.turn(a, b); run.state.onTurn?.(a, b); });
  },
  stages: [dissolve, bring, spin, alignHand, hand, words, checkStage],
};

function bondMean(run, x) {
  const { b } = run.state;
  let s = 0;
  for (const [i, j] of b) s += Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2]);
  return s / b.length;
}

async function dissolve(run) {
  const { ui, sound } = run, { E, n, x } = run.state;
  ui.tags('real', 'game');
  await run.line(`This is ubiquitin, every heavy atom, from a real ensemble fitted to NMR data. In chapter 2 a point was two numbers. As in chapters 1 and 4, a point is now all ${E.n} atoms at once, ${E.dim.toLocaleString('en')} numbers, and nothing else changes.`);
  ui.reads([{ id: 'r-s', value: '0 Å', label: 'noise σ' }, { id: 'r-b', value: fmt(bondMean(run, x), 2), label: 'mean bond length, Å' }, { id: 'r-g', value: fmt(rg(x), 1), label: 'radius of gyration, Å' }]);
  ui.say('Each coordinate gets its own Gaussian noise. <b>Drag σ up slowly, and read the two lengths.</b>');
  const y = E.models[0];
  await run.until((done) => {
    let top = false;
    ui.ctrl(ui.slider({
      label: 'Noise σ', min: 0, max: 60, step: 0.2, value: 0, format: (v) => `${fmt(v, 1)} Å`,
      onInput: (v) => {
        const s = v < 12 ? v * v / 12 : v;
        for (let i = 0; i < E.dim; i += 1) x[i] = y[i] + s * n[i];
        run.state.sigma = s; sound.setSigma(sigmaLevel(s, 0.3, 60));
        ui.read('r-s', `${fmt(s, 1)} Å`); ui.read('r-b', fmt(bondMean(run, x), 2)); ui.read('r-g', fmt(rg(x), 1));
        if (s > 40 && !top) { top = true; ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); }
      },
    }));
  });
  await run.line('Bonds were already wrecked at 1 Å, while the overall size took noise near 12 Å to double. Small noise erases chemistry. Large noise erases the fold. So, as AlphaFold3\'s authors put it, the network learns local stereochemistry at low noise and large-scale structure at high noise.');
}

async function bring(run) {
  const { ui, sound } = run, { E, x, rng } = run.state;
  ui.tags('game', 'real', 'model');
  ui.reads([{ id: 'r-s', value: '', label: 'noise σ' }, { id: 'r-r', value: '–', label: 'Å from the nearest real conformer' }, { id: 'r-b', value: '–', label: 'mean bond, Å' }]);
  ui.say(`Now backward: the same Euler steps as chapter 4, on all ${E.dim.toLocaleString('en')} numbers at once, with our best-rotation denoiser over 39 real conformers. <b>Set your own schedule, and launch.</b>`);
  let steps = 40, rho = 7, lo = Infinity, runs = 0;
  const out = new Float64Array(E.dim);
  const launch = async () => {
    for (let i = 0; i < E.dim; i += 1) x[i] = 70 * rng.n();
    const S = schedule(steps, 0.05, 70, rho);
    run.state.sigma = 70;
    for (let k = 0; k + 1 < S.length; k += 1) {
      E.denoise(x, S[k], out);
      const f = (S[k + 1] - S[k]) / S[k];
      for (let i = 0; i < E.dim; i += 1) x[i] += f * (x[i] - out[i]);
      run.state.sigma = Math.max(S[k + 1], 0);
      sound.setSigma(sigmaLevel(S[k + 1] + 1e-3, 0.3, 60));
      ui.read('r-s', `${fmt(S[k + 1], S[k + 1] < 1 ? 2 : 0)} Å`);
      await run.sleep(Math.min(120, 2800 / steps));
    }
    lo = Infinity;
    for (const m of E.models) lo = Math.min(lo, fitRmsd(x, m));
    ui.read('r-r', fmt(lo, 2)); ui.read('r-b', fmt(bondMean(run, x), 2));
  };
  await run.until((done) => {
    let busy = false;
    const a = ui.slider({ label: 'Steps', min: 3, max: 70, step: 1, value: steps, id: 'steps', format: (v) => `${v}`, onInput: (v) => { steps = v; } });
    const b = ui.slider({ label: 'ρ', min: 1, max: 10, step: 0.5, value: rho, id: 'rho', format: (v) => `${v}`, onInput: (v) => { rho = v; } });
    const go = ui.button('Launch', async (btn) => {
      if (busy) return;
      busy = true; btn.disabled = true;
      await launch();
      busy = false; btn.disabled = false; runs += 1;
      if (!run.alive) return;
      run.reach(1);
      ui.say(runs === 1 ? 'A real protein out of a cloud. <b>Now try 3 steps.</b> Then go on.' : `${steps} steps, ρ ${rho}: ${fmt(lo, 2)} Å from a real conformer.`);
      if (!document.getElementById('next')) { ui.ctrl$.append(ui.button('Next', () => { ui.ctrl(); done(); }, { id: 'next' })); ui.fit(); }
    }, { id: 'launch' });
    ui.ctrl(a, b, go);
  });
  await run.line('It lands close to a real conformer, because our best-rotation denoiser, like the exact field of chapter 5, gives back its data. It works with very few steps too, for a good reason: all 39 conformers share one fold, so every guess is already that fold. Chapter 7 shows real Boltz doing the same.');
}

async function spin(run) {
  const { ui } = run, { U, E } = run.state;
  ui.tags('game', 'model', 'paper');
  // One conformer, C-alpha only, in many orientations.
  const ca = []; for (let i = 0; i < U.n; i += 1) if (U.role[i] === 2) ca.push(i);
  const y0 = new Float64Array(ca.length * 3); ca.forEach((a, i) => { y0.set(E.models[0].subarray(3 * a, 3 * a + 3), 3 * i); });
  const c0 = centre(y0), y = shift(y0, [-c0[0], -c0[1], -c0[2]], new Float64Array(y0.length)), rr = makeRng(8), Nrot = 4000, Ry = [];
  for (let i = 0; i < Nrot; i += 1) Ry.push(rotate(randomRotation(rr), y));
  await run.line('Here is a problem that the flat map never had. Turn a protein, and it is the same protein, but all its numbers change.');
  await run.line('A network is <b>equivariant</b> if turning the input turns the output in the same way. AlphaFold2 built that in, with a frame on every residue. AlphaFold3 and Boltz threw it out. They work on raw coordinates, and at training they simply spin and shift every example at random, and they do it again at every sampling step.');
  // The equivariance test: how far is D(Qx) from Q D(x)?
  const plain = (x, s, K, out) => {
    let lo = Infinity; const d = new Float64Array(K);
    for (let k = 0; k < K; k += 1) { const a = Ry[k]; let e = 0; for (let i = 0; i < a.length; i += 1) e += (a[i] - x[i]) ** 2; d[k] = e; if (e < lo) lo = e; }
    out.fill(0); let w = 0;
    for (let k = 0; k < K; k += 1) { const g = Math.exp(-(d[k] - lo) / (2 * s * s)); if (g < 1e-12) continue; w += g; const a = Ry[k]; for (let i = 0; i < a.length; i += 1) out[i] += g * a[i]; }
    for (let i = 0; i < out.length; i += 1) out[i] /= w;
    return out;
  };
  const noise = makeRng(14), x0 = new Float64Array(y), q = randomRotation(noise);
  for (let i = 0; i < x0.length; i += 1) x0[i] += 8 * noise.n();
  const a = new Float64Array(y.length), b = new Float64Array(y.length), Qx = rotate(q, x0);
  const equiv = (K) => rmsd(plain(Qx, 8, K, a), rotate(q, plain(x0, 8, K, b)));
  ui.reads([{ id: 'r-k', value: '1', label: 'orientations seen in training' }, { id: 'r-e', value: fmt(equiv(1), 1), label: 'Å by which the guess fails to turn with the input' }]);
  ui.say('Does that really teach it to respect rotation? Take the exact denoiser of a data set made of one structure in K orientations, a small test built for this game. Turn the input, and see whether the guess turns with it. <b>Slide K up.</b>');
  const Ks = [1, 3, 10, 30, 100, 300, 1000, 2000, 4000];
  await run.until((done) => {
    let top = false;
    ui.ctrl(ui.slider({ label: 'K', min: 0, max: Ks.length - 1, step: 1, value: 0, format: (v) => `${Ks[v]}`, onInput: (v) => { ui.read('r-k', `${Ks[v]}`); ui.read('r-e', fmt(equiv(Ks[v]), 1)); if (v === Ks.length - 1 && !top) { top = true; ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); } } }));
  });
  await run.line('It learns. With no frames at all, more orientations give a guess that turns more truly. Nothing guarantees this in a real network. AlphaFold3\'s authors report that it was simply not needed in the architecture.');
  // What is the best guess at huge noise?
  ui.tags('game', 'model', 'boltz');
  await run.line('Now a sharper question. If every orientation is equally likely, then at huge noise the plain best guess is the mean over all rotations of a protein. What does that look like?');
  const R = boltzRun(), last = rg(R.frames[R.frames.length - 1].denoised), bx = R.frames.map((f) => Math.max(f.sigma, 0.01)).filter((s) => s >= 1), by = R.frames.filter((f) => f.sigma >= 1).map((f) => rg(f.denoised) / last);
  const c = chart({ height: 94 }), sx = [], gy = [], Rg0 = rg(y);
  const sig = [2, 5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560];
  const nz = makeRng(30);
  ui.reads([{ id: 'r-s', value: '–', label: 'noise σ' }, { id: 'r-g', value: '–', label: 'size of plain guess, compared with the protein' }]);
  ui.say('<b>Tap Measure until the grey curve is done.</b> Grey is the plain mean over rotations, computed here. Plum is a real Boltz-2 run on another protein.');
  await run.until((done) => {
    let k = 0;
    const redraw = () => c.lines([{ x: [2, 4608], y: [1, 1], color: '#2336a8', dash: [5, 4], width: 1.5 }, { x: bx, y: by, color: '#6a2c91' }, { x: sx.length ? sx : [2], y: gy.length ? gy : [1], color: '#8a8fa8' }], { x0: 2, x1: 4608, y0: 0, y1: 1.1, logx: true, xlabel: 'noise σ in Å, log scale', ylabel: 'Rg of the guess / Rg of the protein' });
    const mb = ui.button('Measure', () => {
      const s = sig[k], rot = randomRotation(nz), x = rotate(rot, y);
      for (let i = 0; i < x.length; i += 1) x[i] += s * nz.n();
      const g = rg(plain(x, s, Nrot, a)) / Rg0;
      sx.push(s); gy.push(g); k += 1;
      ui.read('r-s', `${s} Å`); ui.read('r-g', fmt(g, 2));
      redraw();
      if (k === sig.length) { ui.ctrl(c); ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); requestAnimationFrame(redraw); }
    }, { id: 'measure' });
    ui.ctrl(c, mb);
    requestAnimationFrame(redraw);
  });
  run.state.rgCurve = { sx, gy };
  await run.line(`The plain mean shrinks toward zero. The last ${fmt(gy[gy.length - 1] * 100, 0)}% here comes partly from using only 4,000 orientations. Yet real Boltz-2, at σ = 4,608 Å, returned a full-sized protein: Rg ${fmt(rg(R.frames[0].denoised), 1)} Å against ${fmt(last, 1)} Å at the end.`);
  await run.line('Why? AlphaFold3\'s loss first rotates the truth onto the output, and only then takes the squared error. Any orientation of the right shape then scores well, so no blurred average is needed. We read that as the cause. No Boltz model without alignment was tested here.');
  await run.line('So Boltz\'s guess is not the posterior mean of chapter 3, and Tweedie\'s exact link to the score no longer holds for it.');
  await run.line('Boltz-1 went one step further. Its authors argue that a perfect aligned loss can still fail at sampling, so it also aligns the noisy structure to the guess inside each reverse step. They add that in the final model this was not critical, and Boltz-2 keeps it on.');
}

async function alignHand(run) {
  const { ui, sound } = run, { E, x, mol } = run.state;
  ui.tags('game', 'real');
  run.state.spin = false;
  const a = E.models[0], B = E.models[12];
  x.set(a); run.state.sigma = 0;
  const other = run.state.other = new MolInk(run, { n: E.n, bonds: run.state.b, inkOf: () => PIGMENT.teal, drops: Math.round(run.world.dropCount * 0.35), seed: 9, mass: 1 });
  const moved = new Float64Array(E.dim);
  let R = axisRotation(0.6, 0.8, 0.1, 1.5);
  const update = () => {
    rotate(R, B, moved); other.R = mol.R; other.draw(moved, 0);
    run.ui.read('r-r', fmt(rmsd(a, moved), 2));
  };
  ui.reads([{ id: 'r-r', value: '', label: 'Å between the two, as they now lie' }, { id: 'r-k', value: '–', label: 'Å after the best fit' }]);
  ui.say('Two real conformers. Scoring a guess needs them lined up, or a turned copy looks wrong. <b>Drag to turn the teal one, then tap Kabsch.</b>');
  run.state.onTurn = (dx, dy) => { R = compose(compose(axisRotation(0, 1, 0, dx), axisRotation(1, 0, 0, dy)), R); };
  const t = run.tick(() => update());
  mol.turn(0, 0);
  await run.until((done) => ui.ctrl(ui.button('Kabsch', () => {
    const Q = bestRotation(B, a); R = Q; sound.drip?.(0.8);
    ui.read('r-k', fmt(rmsd(a, rotate(Q, B)), 2));
    ui.ctrl(); done();
  }, { id: 'kabsch' })));
  await run.sleep(500);
  await run.line(`The Kabsch algorithm finds the best rotation directly, with no search. What is left, ${fmt(fitRmsd(a, B), 2)} Å, is real difference in shape. This is the rigid alignment in the AlphaFold3 and Boltz loss, with heavier weight on ligand and nucleic-acid atoms.`);
  run.untick(t); other.cloud.commit(0); run.state.onTurn = null; run.state.spin = !run.world.reduce;
}

async function hand(run) {
  const { ui, sound } = run, { E, x, U } = run.state, y = E.models[0], B = boltzRun();
  ui.tags('game', 'real');
  // Whole protein and one chiral centre, each against its mirror image, with rotation integrated out.
  const mir = new Float64Array(y); for (let i = 0; i < mir.length; i += 3) mir[i] = -mir[i];
  const dW = fitRmsd(y, mir);
  // N, C-alpha, C and C-beta of residue 23, from the same real conformer.
  const inRes = []; for (let i = 0; i < U.n; i += 1) if (U.res[i] === 23) inRes.push(i);
  const atom = (r) => inRes.find((i) => U.role[i] === r), cb = inRes.find((i) => U.role[i] === 0), four = [atom(1), atom(2), atom(3), cb], p4 = new Float64Array(12);
  four.forEach((a, k) => { p4[3 * k] = y[3 * a]; p4[3 * k + 1] = y[3 * a + 1]; p4[3 * k + 2] = y[3 * a + 2]; });
  const W = new HandTest(y, { K: 8000, draws: 40, seed: 3 }), C = new HandTest(p4, { K: 8000, draws: 80, seed: 4 });
  const cAt = C.level(0.9, 0.05, 2), wAt = W.level(0.9, 20, 400);
  run.probe = { handTarget: () => 100 * Math.log(cAt / 0.1) / Math.log(30000) };
  run.state.handLevels = { cAt, wAt };
  x.set(y); run.state.sigma = 0;
  await run.line(`One thing rotation cannot do is turn a left hand into a right hand. A protein and its mirror image differ by ${fmt(dW, 1)} Å after the best rotation, and yet all their inter-atomic distances are the same.`);
  await run.line('Life\'s amino acids have one hand, at every Cα. How much noise does it take to hide a hand? Compare the whole protein with one chiral centre, four atoms around one Cα. Rotation is unknown too, so the sum runs over thousands of rotations.');
  const S = (v) => 0.1 * 30000 ** (v / 100);
  ui.reads([{ id: 'r-s', value: '', label: 'noise σ' }, { id: 'r-w', value: '', label: 'sure of the hand, whole protein' }, { id: 'r-l', value: '', label: 'sure of the hand, one centre' }]);
  ui.say('<b>Find the noise where one chiral centre is only 90% sure of its hand.</b> Then tap Here.');
  let s = S(50), pc = 1;
  const update = (v) => { s = S(v); pc = C.posterior(s); ui.read('r-s', `${fmt(s, s < 10 ? 2 : 0)} Å`); ui.read('r-w', pct(W.posterior(s), 1)); ui.read('r-l', pct(pc, 1)); run.state.handSigma = s; };
  await run.until((done) => {
    const sl = ui.slider({ label: 'Noise σ', min: 0, max: 100, step: 0.5, value: 50, id: 'noise', format: (v) => `${fmt(S(v), S(v) < 10 ? 2 : 0)} Å`, onInput: update });
    const go = ui.button('Here', () => {
      if (pc > 0.85 && pc < 0.95) { sound.good(2); run.reach(2); ui.ctrl(); done(); } else { ui.say(pc <= 0.85 ? 'Below 85%: the noise is too large. Lower it.' : 'Above 95%: the centre is still sure. Raise the noise.'); sound.soft(); }
    }, { id: 'here' });
    ui.ctrl(sl, go);
    update(50);
  });
  await run.line(`So the noisy point shows the hand of one centre, taken alone, only below about ${fmt(cAt, 1)} Å, and the whole protein's hand below about ${(Math.round(wAt / 10) * 10).toFixed(0)} Å.`);
  ui.tags('boltz');
  const right = B.hand.guess, min = Math.min(...right) / B.hand.n;
  ui.reads([{ value: `${right[0]} of ${B.hand.n}`, label: 'centres with the correct hand in the first guess' }, { value: `${(B.hand.noisy[0] / B.hand.n * 100).toFixed(0)}%`, label: 'correct hand in the noisy input, same step' }, { value: pct(min, 1), label: 'lowest share in any of the 20 guesses' }]);
  await run.line(`The network does not wait for that. In the stored Boltz-2 run its first guess already had the correct hand at all ${B.hand.n} Cα centres, from what it learned and from the condition. When it learned a centre wrongly, the noisy point cannot correct it until the last steps.`);
  ui.tags('paper');
  ui.reads([]);
  await run.line('A wrong centre can slip through a perfect fold. AlphaFold3 reports 4.4% chirality violations on PoseBusters, even after penalising them when ranking.');
}

async function words(run) {
  const { ui } = run;
  ui.tags('paper');
  await run.line('One more warning from the AlphaFold3 paper. A generative model is built to produce plausible structure, so it may invent order in regions that have none. They call this <b>hallucination</b>.');
  await run.line('Their fix was to add training examples from AlphaFold-Multimer, which shows disordered regions as long extended loops. Confidence scores also tend to be very low there. Boltz-2 lists chain-clashing hallucinations among the problems it treats, in chapter 8.');
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. A model gets the fold right, 0.7 Å from the truth, but one ligand carbon has the wrong hand. How can a good fold hide such a mistake?',
      options: [
        { text: 'The noisy point carries one centre\'s hand only at the last small noise levels, so a wrong centre comes from what the network supplies, and the fold says nothing about it.', right: true, why: 'Yes. Hundreds of atoms vote on the fold. One centre has a tiny mirror distance, so the input says nothing about it until almost the end.' },
        { text: 'Because RMSD cannot be below 1 Å when chirality is wrong.', why: 'It can. Mirroring one centre moves a few atoms by under 1 Å, which hardly changes the RMSD at all.' },
        { text: 'Because alignment flips the ligand during scoring.', why: 'The Kabsch step uses a proper rotation, which cannot flip a hand.' },
      ],
    },
    {
      q: 'Boltz has no frames and no built-in equivariance. What then keeps its output sensible when the input is turned?',
      options: [
        { text: 'Nothing. It gives a different fold for each orientation.', why: 'It has no guarantee, but your K slider showed how training on many orientations teaches it.' },
        { text: 'Training on random rotations, comparing after alignment, and random rotations during sampling too.', right: true, why: 'Yes. All three are in the code: the augmentation, the aligned loss, and a fresh random rotation in each sampling step.' },
        { text: 'Invariant point attention.', why: 'That is AlphaFold2. AlphaFold3 and Boltz removed it.' },
      ],
    },
  ]);
}
