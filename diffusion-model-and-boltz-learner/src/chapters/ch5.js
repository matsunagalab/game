// Chapter 5. A real neural network trained in the browser, its failures, and what memorising means.
import { rama } from '../science/data.js';
import { populations, sliced } from '../science/stats.js';
import { heun, schedule } from '../science/sampler.js';
import { Mix2D } from '../science/mix2d.js';
import { DenoiserNet } from '../science/net.js';
import { check, chart, fmt, Pour, pct, sigmaLevel, Tank } from './common.js';
import { makeRng } from '../science/rng.js';

const SMAX = 300, SMIN = 0.8, STEPS = 14;
const zoomOf = (s) => Math.max(1, 1 + (2.1 * s - 30) / 180);

export default {
  id: 'train',
  title: 'Train a network in your hand',
  tease: 'Feed a real neural network, watch its loss fall, and see why it does not just memorise.',
  principle: 'A network learns the denoiser from examples: add noise to a real point, ask for the clean point, measure the squared error, and nudge every parameter downhill. It must see all noise levels. The exact formula only ever returns copies of its data, while a network smooths between them, which is how it can make new points.',
  goals: ['Train a network until it makes all the islands.', 'On 100 residues, beat the exact formula on unseen data, with both scores above 85%.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>The network.</b> A real multilayer perceptron: three hidden layers of 48 units with a smooth activation, trained by backpropagation and Adam on your device, 64 examples at a time. It runs in plain JavaScript. Inputs are the scaled point, a few sine and cosine features of it, and the noise level. The parameters used to generate are a running average of the trained ones, as in AlphaFold3 and in Boltz's training configuration.</p>
    <p><b>Preconditioning.</b> D(x; σ) = c_skip x + c_out F(c_in x, c_noise), with the four functions from Table 1 of Karras et al. 2022. The loss is λ(σ) |D − y|², with λ = (σ² + σ_d²)/(σ σ_d)². Boltz uses the same forms with σ_d = 16 Å (<i>modules/diffusionv2.py</i>). In Boltz the noise level is drawn as 16 Å × exp(−1.2 + 1.5 n). The default here has the same shape, with the coefficients of Karras et al., exp(−1.2 + 1.2 n), in units of the data's own spread. Karras et al. use that formula in absolute units with σ_data = 0.5.</p>
    <p><b>Coverage and precision.</b> Coverage: the share of 2,000 unseen residues with a generated droplet within 5°. Precision: the share of generated droplets with an unseen residue within 5°. An untrained network sprays droplets everywhere, so its coverage is high and its precision low. A copy machine has the reverse. A good model has both.</p>
    <p><b>Copies.</b> A droplet counts as a copy if it lands within 1° of one of the 100 training residues. The exact field gives nearly all copies, which follows from Eq. 57 of Karras et al.: as σ goes to 0 the guess lands on a stored point. For memorising in real generative models, see Biroli et al. 2024. Here 2-D data and a small network make the contrast easy to see. In Boltz the network must also generalise across different sequences, which is a much harder thing, and none of this measures it.</p>
    <p class="small">Rumelhart, Hinton and Williams, Nature 323, 533 (1986). Kingma and Ba, ICLR 2015 (Adam). Karras et al., NeurIPS 2022. Abramson et al., Nature 630, 493 (2024). Biroli et al., Nat Commun 15, 9957 (2024), on memorising.</p>`,

  async setup(run) {
    const T = run.state.T = new Tank(run, { drops: 2400 }), d = run.state.d = rama();
    run.state.mix = new Mix2D(d.train.x, d.train.y);
    run.state.pour = new Pour(T, T.N);
    run.state.ghostCount = 0;
  },
  stages: [meet, feed, diet, memorise, checkStage],
};

// Draws droplets with any denoiser, a slice per frame. Returns plain arrays.
async function generate(run, D, { seed = 3, seconds = 1.6, cx = -84, cy = 42, boost = 3.2 } = {}) {
  const { T, pour } = run.state, rng = makeRng(seed), S = schedule(STEPS, SMIN, SMAX, 7), tmp = new Float64Array(4), f = (x, s, o) => D(x[0], x[1], s, o);
  pour.start(rng, cx, cy, SMAX);
  T.setZoom(zoomOf(SMAX), 0.2);
  await pour.run(run, S, (p, g, i, k) => heun(p, S[k], S[k + 1], f, g, 2, tmp), { seconds, zoomOf, boost });
  return { X: Float32Array.from(pour.x), Y: Float32Array.from(pour.y) };
}

// Trains for `n` steps, a slice per frame. Stops early if keep() says so.
async function trainFor(run, net, xs, ys, n, { onStep, keep = () => true, batch = 64, fixed = null } = {}) {
  let done = 0;
  while (done < n && keep()) {
    const end = performance.now() + (run.world.phone ? 10 : 12);
    do { const l = net.step(xs, ys, batch, fixed ? { fixedSigma: fixed() } : {}); done += 1; onStep?.(l, done); } while (done < n && performance.now() < end);
    await run.hold(new Promise(requestAnimationFrame));
    if (!run.alive) return done;
  }
  return done;
}

async function meet(run) {
  const { ui } = run, { T, d, mix } = run.state;
  ui.tags('game', 'real');
  T.paint(d.train.x.slice(0, 2400), d.train.y.slice(0, 2400), 2400, { boost: 3.2 });
  await run.line(`So far we used the exact formula. It sums over all ${mix.n.toLocaleString('en')} residues for every guess. For a protein structure there is no such list to sum over, because we want answers for sequences nobody has solved.`);
  await run.line('So we fit a formula with adjustable numbers, called <b>parameters</b>. That formula is a <b>neural network</b>. Yours has three layers of 48 units, 5,666 parameters in all, and it starts out knowing nothing.');
  await run.line('Training is one loop. Take a real residue, add noise, ask the network for the clean point. The squared error is the <b>loss</b>. Then change every parameter a little to make that error smaller.');
}

async function feed(run) {
  const { ui, sound } = run, { T, d, mix } = run.state;
  ui.tags('game');
  const net = run.state.net = new DenoiserNet({ mx: mix.mx, my: mix.my, sdata: mix.sdata, width: 48, depth: 3, seed: 5 });
  const c = chart({ height: 74 }), xs = [], ys = [];
  let ema = null, steps = 0, feeding = false;
  T.clear();
  ui.reads([{ id: 'r-s', value: '0', label: 'training steps' }, { id: 'r-l', value: '–', label: 'loss, averaged' }, { id: 'r-w', value: `${net.net.count.toLocaleString('en')}`, label: 'parameters' }]);
  ui.say('<b>Tap Feed.</b> Each step shows the network 64 noisy examples. Every so often it tries to make droplets on its own.');
  await run.until((done) => {
    const fb = ui.button('Feed', () => { feeding = !feeding; fb.textContent = feeding ? 'Pause' : 'Feed'; }, { id: 'feed' });
    ui.ctrl(c, fb);
    const body = async () => {
      let next = 300;
      for (;;) {
        await run.hold(new Promise(requestAnimationFrame));
        if (!run.alive) return;
        if (!feeding) continue;
        await trainFor(run, net, d.train.x, d.train.y, 40, {
          keep: () => feeding,
          onStep: (l) => { steps += 1; ema = ema === null ? l : 0.97 * ema + 0.03 * l; if (steps % 20 === 0) { xs.push(steps); ys.push(ema); } },
        });
        ui.read('r-s', steps.toLocaleString('en')); ui.read('r-l', fmt(ema, 2));
        c.lines([{ x: xs, y: ys, color: '#2336a8' }], { x0: 0, x1: Math.max(600, steps), y0: Math.min(...ys) * 0.96, y1: Math.max(...ys.slice(1), 1.6), xlabel: 'steps', ylabel: 'loss' });
        if (steps >= next) {
          next = steps + (steps < 900 ? 300 : 500);
          sound.drip?.(0.5);
          run.state.lastGen = await generate(run, (a, b, s, o) => net.D(a, b, s, o), { seconds: 1 });
          if (!run.alive) return;
          if (steps >= 1200 && !run.state.fed) {
            run.state.fed = true; run.reach(1);
            feeding = false; fb.textContent = 'Feed';
            ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit();
          }
        }
      }
    };
    body().catch(() => {});
  });
  ui.ctrl();
  const { X, Y } = run.state.lastGen, p = populations(X, Y), q = populations(d.test.x, d.test.y);
  const dist = sliced(X, Y, d.test.x, d.test.y);
  ui.reads([{ value: `${pct(p[0])} / ${pct(p[1])} / ${pct(p[2], 1)}`, label: 'yours: helix / strand / φ above 0' }, { value: `${pct(q[0])} / ${pct(q[1])} / ${pct(q[2], 1)}`, label: 'unseen data' }, { value: `${fmt(dist, 1)}°`, label: 'from unseen data' }]);
  T.labels = true;
  await run.line('These droplets came from your network alone. It never looks at the data while generating. All it kept is its 5,666 parameters.');
  await run.line('The loss did not fall to zero, and it never will. Noise destroys information, so even a perfect denoiser leaves a large error. Do not read a loss as an accuracy.');
  T.labels = false;
}

async function diet(run) {
  const { ui, sound } = run, { T, d, mix } = run.state;
  ui.tags('game');
  await run.line('Which noise levels does it need to see? Test it. Each diet trains a fresh network for 500 steps.');
  const tried = {};
  ui.reads([{ id: 'r-d', value: '–', label: 'degrees from unseen data' }, { id: 'r-p', value: '–', label: 'helix / strand / φ above 0' }]);
  ui.say('<b>Try all three diets.</b>');
  const diets = { big: { label: 'Only big noise', sigma: 2 }, small: { label: 'Only small noise', sigma: 0.06 }, all: { label: 'All levels', sigma: null } };
  await run.until((done) => {
    let busy = false;
    const mk = (key) => ui.button(diets[key].label, async (b) => {
      if (busy) return;
      busy = true;
      ui.say(`Training on ${diets[key].label.toLowerCase()}.`);
      const net = new DenoiserNet({ mx: mix.mx, my: mix.my, sdata: mix.sdata, width: 48, depth: 3, seed: 8 }), rng = makeRng(2), s = diets[key].sigma;
      await trainFor(run, net, d.train.x, d.train.y, 500, { fixed: s ? () => s * Math.exp(0.25 * rng.n()) : null });
      if (!run.alive) return;
      const { X, Y } = await generate(run, (a, c, q, o) => net.D(a, c, q, o), { seconds: 1 });
      if (!run.alive) return;
      const p = populations(X, Y), dist = sliced(X, Y, d.test.x, d.test.y);
      tried[key] = dist; run.state.tried = tried;
      ui.read('r-d', fmt(dist, 1)); ui.read('r-p', `${pct(p[0])} / ${pct(p[1])} / ${pct(p[2], 1)}`);
      b.className = 'btn on'; busy = false; sound.drip?.(0.7);
      ui.say(key === 'big' ? 'Big noise only: it knows the broad shape, but it never learned the fine edges of an island.' : key === 'small' ? 'Small noise only: it can sharpen, but it never learned where to go from far away.' : 'All levels: this is the only diet that works from start to finish.');
      if (Object.keys(tried).length === 3) { ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); }
    }, { quiet: true, id: `diet-${key}` });
    ui.ctrl(ui.chips([mk('big'), mk('small'), mk('all')]));
  });
  ui.ctrl();
  await run.line(`Distances: big noise ${fmt(tried.big, 0)}°, small noise ${fmt(tried.small, 0)}°, all levels ${fmt(tried.all, 0)}°. A sampler passes through a wide range of noise levels, so the network needs training across that range.`);
  await run.line('Boltz does the same. For each training example it draws a noise level, 16 Å × exp(−1.2 + 1.5 n), then scales the loss so that no level dominates. Its highest levels lie beyond almost all its training noise, as chapter 6 notes.');
}

async function memorise(run) {
  const { ui, sound } = run, { T, d } = run.state, M = 100;
  ui.tags('game', 'real');
  const tr = { x: d.train.x.slice(0, M), y: d.train.y.slice(0, M) }, mix = new Mix2D(tr.x, tr.y);
  T.extra.push((g, w) => { if (run.state.rings) { g.strokeStyle = 'rgba(29,33,65,.62)'; g.lineWidth = 1; for (let i = 0; i < M; i += 1) { const p = w.project(tr.x[i], tr.y[i]); g.beginPath(); g.arc(p.x, p.y, 3.4, 0, 7); g.stroke(); } } });
  run.scoped({ dispose: () => { T.extra.length = 0; } });
  run.state.rings = true;
  T.clear(); T.setZoom(1, 0.3);
  await run.line('Now the deepest point of this chapter. Suppose you have only 100 residues, shown as rings. We can run the exact formula on them, or train a network on them.');
  const { test } = d;
  const measure = (X, Y) => {
    let copy = 0, prec = 0, cover = 0;
    const r = 25, n = X.length, m = test.x.length;
    for (let i = 0; i < n; i += 1) {
      let lo = Infinity;
      for (let j = 0; j < M; j += 1) { const e = (X[i] - tr.x[j]) ** 2 + (Y[i] - tr.y[j]) ** 2; if (e < lo) lo = e; }
      if (lo < 1) copy += 1;
      for (let j = 0; j < m; j += 1) if ((X[i] - test.x[j]) ** 2 + (Y[i] - test.y[j]) ** 2 < r) { prec += 1; break; }
    }
    for (let j = 0; j < m; j += 1) for (let i = 0; i < n; i += 1) if ((X[i] - test.x[j]) ** 2 + (Y[i] - test.y[j]) ** 2 < r) { cover += 1; break; }
    return { copy: copy / n, prec: prec / n, cover: cover / m };
  };
  ui.reads([{ id: 'r-c', value: '–', label: 'droplets that are copies' }, { id: 'r-v', value: '–', label: 'coverage of unseen data' }, { id: 'r-p', value: '–', label: 'precision' }]);
  ui.say('<b>Run the exact formula on the 100.</b>');
  await run.until((done) => ui.ctrl(ui.button('Run exact', () => { ui.ctrl(); done(); }, { id: 'exact' })));
  const e = await generate(run, (a, b, s, o) => { mix.denoise(a, b, s, o); }, { seconds: 1.4, cx: mix.mx, cy: mix.my });
  if (!run.alive) return;
  const R = measure(e.X, e.Y);
  run.state.exact100 = R;
  ui.read('r-c', pct(R.copy)); ui.read('r-v', pct(R.cover)); ui.read('r-p', pct(R.prec));
  await run.line(`${pct(R.copy)} of droplets sit exactly on a stored residue. This follows from Eq. 57: as σ goes to 0 the guess lands on a stored point. Unseen residues are reached only where a copy happens to lie near them.`);
  const net = run.state.net100 = new DenoiserNet({ mx: mix.mx, my: mix.my, sdata: mix.sdata, width: 48, depth: 3, seed: 3 });
  ui.say(`Now train a network on the same 100. <b>Stop when you think it is ready, then test.</b> Coverage and precision must both reach 85%.`);
  let total = 0, feeding = false, N = null;
  ui.reads([{ id: 'r-s', value: '0', label: 'training steps' }, { id: 'r-c', value: pct(R.copy), label: 'copies' }, { id: 'r-v', value: pct(R.cover), label: 'coverage' }, { id: 'r-p', value: pct(R.prec), label: 'precision' }]);
  await run.until((done) => {
    let busy = false;
    const fb = ui.button('Feed', async () => {
      if (busy) return;
      feeding = !feeding; fb.textContent = feeding ? 'Pause' : 'Feed';
      if (!feeding) return;
      await trainFor(run, net, tr.x, tr.y, 1e7, { keep: () => feeding, onStep: () => { total += 1; if (total % 20 === 0) ui.read('r-s', total.toLocaleString('en')); } });
    }, { id: 'feed' });
    const tb = ui.button('Test', async () => {
      if (busy) return;
      feeding = false; fb.textContent = 'Feed'; busy = true;
      const g = await generate(run, (a, b, s, o) => net.D(a, b, s, o), { seconds: 1.2, cx: mix.mx, cy: mix.my });
      if (!run.alive) return;
      N = measure(g.X, g.Y); run.state.net100R = N; busy = false;
      ui.read('r-c', pct(N.copy)); ui.read('r-v', pct(N.cover)); ui.read('r-p', pct(N.prec));
      if (N.cover >= 0.85 && N.prec >= 0.85) { sound.good(2); run.reach(2); ui.ctrl(); done(); } else if (N.prec < 0.85) ui.say('Droplets are landing where unseen residues are not, so precision is low. It needs more steps.'); else ui.say('Not there yet. Feed it some more.');
    }, { quiet: true, id: 'test' });
    ui.ctrl(ui.chips([fb, tb]));
  });
  await run.line(`Same 100 residues. Exact: ${pct(R.copy)} copies, coverage ${pct(R.cover)}. Network: ${pct(N.copy)} copies, coverage ${pct(N.cover)}, precision ${pct(N.prec)}.`);
  await run.line('In this short training the network did not store every point. It drew a smooth field through them, and that smoothing filled in the islands between the rings. It makes new points because it is not the exact formula.');
  run.state.rings = false;
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. A student trains a denoiser and the loss stops falling at 1.3. They conclude that training failed, because a good model would reach zero. Are they right?',
      options: [
        { text: 'Yes. A loss above zero means the network is wrong.', why: 'Even the exact denoiser has a large loss: once noise is added, the clean point cannot be recovered with certainty.' },
        { text: 'No. Noise destroys information, so the best possible loss is well above zero.', right: true, why: 'Yes. The way to judge a generative model is by what it makes, on held-out data, not by its loss alone.' },
        { text: 'Yes. They should remove noise from the training data.', why: 'The noise is the task itself. With no noise there is nothing to denoise.' },
      ],
    },
    {
      q: 'You have an enormous, perfectly trained network that reaches the exact formula for its training set. What would you expect its samples to be?',
      options: [
        { text: 'Copies of its training data.', right: true, why: 'Yes. That is what the exact field does. On large data sets real networks rarely reach it. Trained long on few examples, they drift toward copying.' },
        { text: 'A better set of new structures than any smaller network.', why: 'Exactness to the training set is exactly what produces copies, as you measured.' },
        { text: 'Pure noise.', why: 'The exact field brings noise all the way to the data. It lands on it, in fact.' },
      ],
    },
  ], ['model']);
}
