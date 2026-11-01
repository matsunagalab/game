// Chapter 4. Run it backward: real samplers on the exact field, racing step counts, determinism, and what the noise decides.
import { rama } from '../science/data.js';
import { populations, popError, sliced } from '../science/stats.js';
import { euler, heun, churnHeun, schedule } from '../science/sampler.js';
import { check, fieldOf, fmt, Pour, pct, sigmaLevel, Tank } from './common.js';
import { makeRng } from '../science/rng.js';

const SMAX = 400, SMIN = 1, MEASURED = 4000;
const zoomOf = (s) => Math.max(1, 1 + (2.1 * s - 30) / 180);

export default {
  id: 'sampler',
  title: 'Run it backward',
  tease: 'Launch thousands of droplets from pure noise, and race the samplers.',
  principle: 'A sampler starts from pure noise and repeatedly steps toward the denoiser\'s guess as the noise falls. With an exact field and enough steps, the populations come back right. Heun gets there on fewer denoiser calls than Euler. A deterministic run means the starting noise alone decides the island.',
  goals: ['Bring the islands back from pure noise.', 'Win the race: within 1.6° of the data on at most 24 denoiser calls.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>The field.</b> The exact denoiser of the 8,000 training residues. For speed it is stored on grids at 20 noise levels, with a mean error near 1% of σ checked in tools/test.mjs, and summed exactly over neighbours below 5°.</p>
    <p><b>Samplers.</b> Euler steps along the probability-flow ODE, dx/dσ = (x − D(x; σ))/σ. Heun, Algorithm 1 of Karras et al. 2022, corrects each step with a second denoiser call. Churn, Algorithm 2 of the same paper, adds fresh noise before a step.</p>
    <p><b>Droplets.</b> Only the first 4,000 droplets are measured, and those take every step exactly. So that a phone keeps its frame rate, the others use the grid at 5° for the last few steps, which only changes how sharp they look.</p>
    <p><b>Score.</b> Distance is a sliced Wasserstein distance in degrees, the average over 16 directions of how far the droplets must move to match the data. It is measured on 4,000 droplets, and a second draw of the same data gives about 1.3°. That is the floor.</p>
    <p><b>Results here.</b> With the seed used in the race, Euler needs about 35 calls to reach 1.6°, and Heun about 20. Seeds vary by more than the race suggests: over four other seeds Euler with 35 steps gives 2.1 to 2.6°, against 1.56° here, and Heun with 12 steps gives 1.1 to 2.2°, against 1.58°. The race is a fair comparison on this one seed only. Heun with only 3 steps is far worse than Euler with 3, because a correction made from a wild first step is no correction. These are this data's results, not a law.</p>
    <p><b>In Boltz.</b> Boltz and AlphaFold3 use a stochastic first-order sampler, not Heun: one denoiser call per step, 200 steps by default. Its numbers come in chapter 9. In Boltz-1's own ablation (Table 1), mean LDDT of the top sample went 0.693, 0.710, 0.716 for 20, 50 and 200 steps, on 5 samples per target.</p>
    <p class="small">Karras et al., NeurIPS 2022. Song et al., ICLR 2021, for the probability-flow ODE. Wohlwend et al., bioRxiv 10.1101/2024.11.19.624167.</p>`,

  async setup(run) {
    const T = run.state.T = new Tank(run), d = run.state.d = rama();
    run.ui.say('Mixing the water.');
    const F = run.state.F = await fieldOf(run, 'general', d.train.x, d.train.y);
    run.state.D = (x, s, out) => F.at(x[0], x[1], s, out);
    run.state.Dfast = (x, s, out) => F.fast(x[0], x[1], s, out);
    run.state.pop = populations(d.train.x, d.train.y);
    run.state.pour = new Pour(T, T.N);
    T.setZoom(zoomOf(SMAX), 0);
  },
  stages: [launch, race, decide, checkStage],
};

// One complete run of a sampler. Returns the measures.
async function go(run, { method = 'euler', steps = 18, seed = 11, seconds = 2.8, gamma = 0, startX = null, startY = null, keep = false }) {
  const { T, D, Dfast, d, pour } = run.state, rng = makeRng(seed), S = schedule(steps, SMIN, SMAX, 7), n = pour.n, tmp = new Float64Array(4), which = (i) => (i < MEASURED ? D : Dfast);
  if (startX) { pour.x.set(startX); pour.y.set(startY); pour.gx.fill(-84); pour.gy.fill(42); } else pour.start(rng, -84, 42, SMAX);
  let calls = 0;
  const step = method === 'heun'
    ? (p, g, i, k) => { const c = gamma ? churnHeun(p, S[k], S[k + 1], which(i), g, rng, gamma, 2, tmp) : heun(p, S[k], S[k + 1], which(i), g, 2, tmp); if (i === 0) calls += c; }
    : (p, g, i, k) => { euler(p, S[k], S[k + 1], which(i), g); if (i === 0) calls += 1; };
  await pour.run(run, S, step, { seconds, zoomOf, mute: 0 });
  if (!run.alive) return null;
  const m = Math.min(n, MEASURED), X = Float32Array.from(pour.x.subarray(0, m)), Y = Float32Array.from(pour.y.subarray(0, m)), pop = populations(X, Y);
  const r = { calls, dist: sliced(X, Y, d.train.x, d.train.y), pop, err: popError(pop, run.state.pop) };
  void keep;
  return r;
}

async function launch(run) {
  const { ui, sound } = run, { T, pop } = run.state;
  ui.tags('game', 'real');
  await run.line('The droplets now start from pure noise: a plain Gaussian cloud, far bigger than the map, with no memory of any protein.');
  await run.line('At each step the sampler asks the denoiser for its guess, moves part of the way there, and lowers σ. This simple recipe is the <b>Euler method</b>, applied to an equation called the probability-flow ODE.');
  ui.reads([{ id: 'r-c', value: '–', label: 'denoiser calls' }, { id: 'r-d', value: '–', label: 'degrees from the data' }, { id: 'r-p', value: '–', label: 'helix / strand / φ above 0' }]);
  ui.say(`Pigment shows each droplet's current guess, so colour appears only when it has decided. <b>Launch.</b>`);
  await run.until((done) => ui.ctrl(ui.button('Launch', () => { ui.ctrl(); done(); }, { id: 'launch' })));
  sound.setSigma(1);
  const r = await go(run, { steps: 18, seconds: 5 });
  if (!r) return;
  run.reach(1);
  ui.read('r-c', `${r.calls}`); ui.read('r-d', fmt(r.dist, 1)); ui.read('r-p', `${pct(r.pop[0])} / ${pct(r.pop[1])} / ${pct(r.pop[2], 1)}`);
  T.labels = true;
  await run.line(`The islands came back. The data has ${pct(pop[0])} / ${pct(pop[1])} / ${pct(pop[2], 1)}, and this run gave ${pct(r.pop[0])} / ${pct(r.pop[1])} / ${pct(r.pop[2], 1)}. Nothing told the droplets those numbers. They came from the field.`);
  run.state.first = r;
}

async function race(run) {
  const { ui, sound } = run, { T } = run.state;
  ui.tags('game');
  T.labels = false;
  await run.line('Every denoiser call costs real computer time. In Boltz it means a pass through a large network for all atoms. So a sampler is judged by quality per call.');
  await run.line('<b>Heun\'s method</b> looks at the slope a second time, at the end of the step, and averages. It takes two calls per step and should need far fewer steps.');
  let method = 'euler', steps = 18, busy = false, best = null;
  const tries = [];
  ui.reads([{ id: 'r-c', value: '–', label: 'denoiser calls' }, { id: 'r-d', value: '–', label: 'degrees from the data' }, { id: 'r-p', value: '–', label: 'helix / strand / φ above 0' }]);
  ui.say('<b>Reach 1.6° or closer on 24 calls or fewer.</b> Try both methods, and try very few steps too.');
  await run.until((done) => {
    const be = ui.button('Euler', () => { method = 'euler'; be.className = 'btn on'; bh.className = 'btn quiet'; }, { id: 'm-euler' });
    const bh = ui.button('Heun', () => { method = 'heun'; bh.className = 'btn on'; be.className = 'btn quiet'; }, { quiet: true, id: 'm-heun' });
    be.className = 'btn on';
    const sl = ui.slider({ label: 'Steps', min: 3, max: 40, step: 1, value: steps, id: 'steps', format: (v) => `${v}`, onInput: (v) => { steps = v; } });
    const lg = ui.button('Launch', async (b) => {
      if (busy) return;
      busy = true; b.disabled = true;
      T.setZoom(zoomOf(SMAX), 0.3);
      const r = await go(run, { method, steps, seconds: 1.6 });
      if (!r) return;
      busy = false; b.disabled = false;
      tries.push({ method, steps, ...r });
      run.state.tries = tries;
      ui.read('r-c', `${r.calls}`); ui.read('r-d', fmt(r.dist, 1)); ui.read('r-p', `${pct(r.pop[0])} / ${pct(r.pop[1])} / ${pct(r.pop[2], 1)}`);
      if (r.dist <= 1.6 && r.calls <= 24) { best = r; sound.good(2); run.reach(2); ui.ctrl(); done(); } else if (r.dist > 1.6 && r.calls > 24) ui.say('Not there yet, and over budget too. Which method gives more for each call?');
      else if (r.dist > 1.6) ui.say(`${fmt(r.dist, 1)}° on ${r.calls} calls. Close enough needs 1.6°.`);
      else ui.say(`Good quality, but ${r.calls} calls. Get the same on 24 or fewer.`);
    }, { id: 'launch' });
    ui.ctrl(ui.chips([be, bh]), sl, lg);
  });
  await run.line(`${best.calls} calls for ${fmt(best.dist, 1)}°. With this same noise Euler needs about 35 calls to get that close. The second look pays for itself.`);
  await run.line('But not always. With only 3 steps, Heun sends droplets far off, because the second look is taken from a wild first step. Try it if you like. Better numbers need honest step counts.');
}

async function decide(run) {
  const { ui } = run, { T, pour } = run.state;
  ui.tags('game');
  const n = pour.n, sx = new Float64Array(n), sy = new Float64Array(n), rng = makeRng(55);
  for (let i = 0; i < n; i += 1) { sx[i] = -84 + SMAX * rng.n(); sy[i] = 42 + SMAX * rng.n(); }
  await run.line('One more question. If you start from the same noise, do you land in the same place?');
  ui.reads([{ id: 'r-m', value: '–', label: 'droplets ending in a different island' }]);
  const islandOf = (x, y) => (x > 0 ? 2 : y > 45 ? 1 : 0);
  const a = new Uint8Array(n);
  ui.say('<b>Run the same noise twice, with Heun.</b>');
  await run.until((done) => ui.ctrl(ui.button('Run', () => { ui.ctrl(); done(); }, { id: 'run1' })));
  T.setZoom(zoomOf(SMAX), 0.3);
  await go(run, { method: 'heun', steps: 12, startX: sx, startY: sy, seconds: 1.6 });
  for (let i = 0; i < n; i += 1) a[i] = islandOf(pour.x[i], pour.y[i]);
  T.setZoom(zoomOf(SMAX), 0.3);
  await go(run, { method: 'heun', steps: 12, startX: sx, startY: sy, seconds: 1.6 });
  let moved = 0;
  for (let i = 0; i < n; i += 1) if (a[i] !== islandOf(pour.x[i], pour.y[i])) moved += 1;
  ui.read('r-m', pct(moved / n, 1));
  await run.line('Not one droplet changed island. This sampler is deterministic: the noise it starts from decides everything.');
  ui.say('<b>Now add churn:</b> fresh noise added at every step, with the same start.');
  await run.until((done) => ui.ctrl(ui.button('Run with churn', () => { ui.ctrl(); done(); }, { id: 'run2' })));
  T.setZoom(zoomOf(SMAX), 0.3);
  await go(run, { method: 'heun', steps: 12, gamma: 0.3, seed: 12, startX: sx, startY: sy, seconds: 1.6 });
  moved = 0;
  for (let i = 0; i < n; i += 1) if (a[i] !== islandOf(pour.x[i], pour.y[i])) moved += 1;
  ui.read('r-m', pct(moved / n, 0));
  run.state.churnMoved = moved / n;
  const pc = populations(pour.x, pour.y), pb = populations(Float32Array.from(a, (v, i) => (v === 2 ? 60 : -60) + 0 * i), Float32Array.from(a, (v) => (v === 1 ? 130 : -40)));
  ui.reads([{ value: pct(moved / n, 0), label: 'droplets ending in a different island' }, { value: `${pct(pb[0])} / ${pct(pb[1])} / ${pct(pb[2], 1)}`, label: 'crowd without churn' }, { value: `${pct(pc[0])} / ${pct(pc[1])} / ${pct(pc[2], 1)}`, label: 'crowd with churn' }]);
  await run.line(`Now ${pct(moved / n, 0)} changed island, yet the crowd is much the same. Each droplet's fate is open, while the shares hold, thanks to Heun's second look. Chapter 9 shows that with a first-order step, added noise does shift them.`);
  // Paint the starting cloud by where each droplet ended up.
  const px = new Float32Array(n), py = new Float32Array(n), gx = new Float32Array(n), gy = new Float32Array(n);
  await go(run, { method: 'heun', steps: 12, startX: sx, startY: sy, seconds: 0.8 });
  for (let i = 0; i < n; i += 1) { px[i] = sx[i]; py[i] = sy[i]; gx[i] = pour.x[i]; gy[i] = pour.y[i]; }
  T.setZoom(zoomOf(SMAX), 0.6);
  T.paint(px, py, n, { sigma: 90, gx, gy, boost: 2 });
  await run.line('Here is the starting noise itself, coloured by where each droplet finally landed. The noise space is carved into regions, and the share of the Gaussian cloud in each is the population of its island. Island weights are set by the shape of the flow.');
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. Boltz-1\'s authors ran 20, 50 and 200 steps. Mean LDDT of the top sample was 0.693, 0.710 and 0.716. Their sampler uses one call per step. What should you take from this?',
      options: [
        { text: 'Quality keeps doubling with more steps, so run 2,000.', why: 'Going from 50 to 200 calls gained only 0.006. Returns fall quickly.' },
        { text: 'Most of the gain comes early, and past about 50 steps it levels off.', right: true, why: 'Yes. They report a plateau beyond 50 diffusion steps. Your own race showed the same curve.' },
        { text: 'Steps do not matter at all.', why: 'They do: 20 steps was clearly lower. It is the extra steps at the far end that buy little.' },
      ],
    },
    {
      q: 'You run a deterministic sampler twice with one seed and get identical structures. What does that tell you about the distribution the model holds?',
      options: [
        { text: 'That the distribution is a single structure.', why: 'No. The same noise gives the same path. Other noise could land elsewhere, as your coloured cloud showed.' },
        { text: 'Nothing. You need different starting noise to see it.', right: true, why: 'Yes. Diversity lives in the starting noise, and in churn if there is any. One seed cannot show it.' },
        { text: 'That the sampler has a bug.', why: 'No. Without added noise, each start has exactly one path.' },
      ],
    },
  ]);
}
