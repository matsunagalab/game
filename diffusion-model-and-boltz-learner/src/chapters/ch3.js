// Chapter 3. The best guess: the exact denoiser on real residues, the posterior, and the score checked by finite differences.
import { rama } from '../science/data.js';
import { island } from '../science/stats.js';
import { Mix2D } from '../science/mix2d.js';
import { check, fieldOf, fmt, pct, Tank, placeInk } from './common.js';
import { makeRng } from '../science/rng.js';

export default {
  id: 'denoiser',
  title: 'The best guess',
  tease: 'Given a noisy point, what was the clean one? Find the exact answer by hand.',
  principle: 'The best guess of the clean point is a weighted mean of the data, with weights set by how well each data point explains the noisy one. It can land where no data lives. The arrow to that guess, divided by σ², is the score, the slope of the log-density, and a denoiser is therefore all you need.',
  goals: ['Drag the point at high and at low noise.', 'Find a place where the best guess lands in empty water.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>The ideal denoiser.</b> For a set of data points y_i with equal weight, the guess that minimises the expected squared error is D(x; σ) = Σ w_i y_i, with w_i proportional to exp(−|x − y_i|² / 2σ²). This is Eq. 57 of Karras et al. 2022, and the game computes it exactly over all 8,000 training residues each time you move your finger.</p>
    <p><b>Posterior.</b> The w_i are the probabilities of each y_i given x. Here that is the posterior under a flat sheet and equal weights.</p>
    <p><b>Score.</b> The gradient of log p(x; σ) is (D(x; σ) − x) / σ², Eq. 3 of Karras et al. 2022. It goes back to Tweedie's formula (Robbins 1956, Efron 2011). The button computes the gradient by finite differences of the real log-density, with no use of D, so the match is a test, not a definition.</p>
    <p><b>In Boltz.</b> The network predicts clean coordinates and the update uses (x − D)/σ, as here. Its loss is aligned, though, so D is not the posterior mean of this chapter, and the exact link to the score no longer holds. Boltz-1's authors themselves call the aligned loss alone theoretically problematic. Chapter 6 shows the difference.</p>
    <p class="small">Vincent, Neural Comput 23, 1661 (2011), for denoising score matching. Song et al., ICLR 2021. Karras et al., NeurIPS 2022.</p>`,

  async setup(run) {
    const T = run.state.T = new Tank(run, { drops: 12000 }), d = rama(), mix = run.state.mix = new Mix2D(d.train.x, d.train.y);
    run.state.d = d;
    run.ui.say('Mixing the water.');
    run.state.field = await fieldOf(run, 'general', d.train.x, d.train.y);
    run.state.w = new Float64Array(mix.n);
    run.state.x = [-20, 60]; run.state.sigma = 150; run.state.g = [0, 0];
    run.state.tmp = [0, 0, 0];
    const paint = run.state.paint = () => paintPosterior(run);
    run.state.dragging = false;
    T.extra.push((g) => draw(run, g));
    run.pointer({
      down: (px, py) => { const p = run.world.unproject(px, py); run.state.x = [clamp(p.x, -180, 180), clamp(p.y, -100, 260)]; paint(); run.state.onMove?.(); },
      move: (px, py) => { const p = run.world.unproject(px, py); run.state.x = [clamp(p.x, -180, 180), clamp(p.y, -100, 260)]; paint(); run.state.onMove?.(); },
    });
    paint();
    run.probe = {
      place(x, y) { run.state.x = [x, y]; paint(); run.state.onMove?.(); return run.world.project(x, y); },
      sea() { return findSea(run); },
    };
  },
  stages: [drag, sea, scoreStage, field, checkStage],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function paintPosterior(run) {
  const { T, mix, x, sigma, w, g, d, tmp } = run.state, n = mix.n;
  mix.denoise(x[0], x[1], sigma, g);
  mix.weights(x[0], x[1], sigma, w);
  let top = 0;
  for (let i = 0; i < n; i += 1) if (w[i] > top) top = w[i];
  const { pos, ink, size } = T.cloud, base = 0.08;
  const shares = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    const X = d.train.x[i], Y = d.train.y[i], k = w[i] / top;
    shares[island(X, Y)] += w[i];
    placeInk(X, Y, tmp);
    pos[3 * i] = X; pos[3 * i + 1] = Y; pos[3 * i + 2] = 0;
    ink[4 * i] = tmp[0]; ink[4 * i + 1] = tmp[1]; ink[4 * i + 2] = tmp[2];
    ink[4 * i + 3] = 0.1 * (base + Math.sqrt(k) * 1.6) * 1.8;
    size[i] = 2.1 + 3 * Math.sqrt(k);
  }
  T.cloud.commit(n);
  run.state.shares = shares;
  run.ui.read('r-g', `${fmt(g[0], 0)}°, ${fmt(g[1], 0)}°`);
  run.ui.read('r-m', `${pct(shares[0])} / ${pct(shares[1])} / ${pct(shares[2])}`);
  run.sound.setSigma(0.1 + 0.4 * (sigma / 150));
}

function draw(run, g) {
  const { T, x, g: D } = run.state;
  if (run.state.hide) return;
  T.arrow(g, x[0], x[1], D[0], D[1], 'rgba(29,33,65,.85)', 8);
  T.ring(g, x[0], x[1], 9, 'rgb(29,33,65)', 2.2);
  const p = run.world.project(D[0], D[1]);
  g.fillStyle = 'rgba(248,248,244,.95)'; g.strokeStyle = 'rgb(29,33,65)'; g.lineWidth = 2;
  g.beginPath(); g.arc(p.x, p.y, 6, 0, 7); g.fill(); g.stroke();
}

function reads(run) {
  run.ui.reads([{ id: 'r-g', value: '', label: 'best guess D, φ and ψ' }, { id: 'r-m', value: '', label: 'weight on helix / strand / φ above 0' }]);
  run.state.paint();
}

function sigmaCtl(run, { onMove } = {}) {
  return run.ui.slider({ label: 'Noise σ', min: 5, max: 200, step: 1, value: run.state.sigma, id: 'noise', format: (v) => `${v}°`, onInput: (v) => { run.state.sigma = v; run.state.paint(); onMove?.(v); } });
}

async function drag(run) {
  const { ui } = run, { T } = run.state;
  ui.tags('real', 'game');
  await run.line('Someone shows you a noisy point, and tells you how much noise was added. What was the clean point? There is an exact answer.');
  await run.line('Each real residue explains the noisy point more or less well. Near ones explain it well, far ones badly. Darker ink below means a larger weight, and these weights are the <b>posterior</b>.');
  await run.line('The best guess, in the sense of smallest squared error, is the weighted mean of all the residues. It is written D(x; σ), and it is called the <b>denoiser</b>.');
  run.state.sigma = 150; reads(run); T.labels = false;
  ui.say('The ring is the noisy point, and the white dot is the best guess. σ is 150°. <b>Drag the ring around the whole map.</b>');
  let moved = 0, a = null;
  run.state.onMove = () => { if (a) moved += Math.hypot(run.state.x[0] - a[0], run.state.x[1] - a[1]); a = [...run.state.x]; };
  await run.until((done) => { const t = setInterval(() => { if (moved > 260) { clearInterval(t); done(); } }, 120); run.scoped({ dispose: () => clearInterval(t) }); ui.ctrl(ui.button('Skip', () => done(), { quiet: true, id: 'skip' })); });
  ui.ctrl();
  await run.line(`The guess hardly moves. With this much noise, the point tells you almost nothing, so the best guess is close to the mean of all the data, at about (${fmt(run.state.mix.mx, 0)}°, ${fmt(run.state.mix.my, 0)}°).`);
  run.state.sigma = 12; run.state.paint();
  ui.say('σ is now 12°. <b>Drag again, across two islands.</b>');
  moved = 0; a = null;
  await run.until((done) => { const t = setInterval(() => { if (moved > 200) { clearInterval(t); done(); } }, 120); run.scoped({ dispose: () => clearInterval(t) }); ui.ctrl(ui.button('Skip', () => done(), { quiet: true, id: 'skip' })); });
  ui.ctrl();
  run.reach(1);
  await run.line('Now the guess snaps to the nearest island. Small noise leaves you sure of the neighbourhood.');
  run.state.onMove = null;
}

function findSea(run) {
  // Where a guess between the islands is most likely: used only to place a robot's finger in tests.
  const { mix } = run.state, g = [0, 0], s = run.state.sigma, w = run.state.w;
  for (let y = 240; y > -100; y -= 3) {
    mix.denoise(-90, y, s, g);
    mix.weights(-90, y, s, w);
    let a = 0, b = 0;
    for (let i = 0; i < mix.n; i += 1) { if (island(mix.x[i], mix.y[i]) === 0) a += w[i]; else if (island(mix.x[i], mix.y[i]) === 1) b += w[i]; }
    if (a > 0.45) return [-90, y];
    void b;
  }
  return [-90, 45];
}

async function sea(run) {
  const { ui, sound } = run, { mix } = run.state;
  ui.tags('game');
  run.state.sigma = 40; reads(run);
  await run.line('Now a strange thing. The best guess is a mean, and a mean need not be a place where data lives.');
  ui.say('σ is 40°. <b>Find a noisy point whose best guess lands in empty water,</b> between the islands, with at least 30% of the weight on each side.');
  const inSea = () => {
    const { g, shares } = run.state;
    let close = 0;
    for (let i = 0; i < mix.n; i += 1) if ((mix.x[i] - g[0]) ** 2 + (mix.y[i] - g[1]) ** 2 < 100) close += 1;
    run.state.close = close;
    return close <= 40 && shares[0] > 0.3 && shares[1] > 0.3;
  };
  await run.until((done) => {
    let held = false;
    run.state.onMove = () => {
      if (inSea() && !held) { held = true; sound.good(1); run.reach(2); run.state.onMove = null; setTimeout(done, 300); }
    };
    ui.ctrl(sigmaCtl(run));
    run.scoped({ dispose: () => { run.state.onMove = null; } });
  });
  ui.ctrl();
  await run.line(`There. Only ${run.state.close} of 8,000 residues lie within 10° of that guess. No real residue looks like it, yet it is the correct best guess, because the point could have come from either side.`);
  await run.line('So one big jump to the guess would give a blurred, unreal point. This is why diffusion takes many small steps, and asks again after each. As the noise shrinks, the choice of side gets made.');
}

async function scoreStage(run) {
  const { ui, sound } = run, { mix } = run.state;
  ui.tags('game');
  run.state.sigma = 30; reads(run);
  await run.line('Look at the arrow from the point to its guess. Divide it by σ², and you have the <b>score</b>. It points uphill on the density, and says which way the data lies and how strongly.');
  await run.line('That is a claim worth testing. We can measure the slope of log p(x; σ) directly, by stepping a tiny way in each direction, without using the guess at all.');
  ui.say('<b>Put the ring anywhere, then tap Measure.</b> Do it at two places.');
  let n = 0;
  ui.reads([{ id: 'r-g', value: '', label: 'best guess D' }, { id: 'r-m', value: '', label: 'weight on helix / strand / φ above 0' }, { id: 'r-a', value: '–', label: 'slope measured, per degree' }, { id: 'r-b', value: '–', label: '(D − x) / σ²' }]);
  run.state.paint();
  await run.until((done) => {
    ui.ctrl(ui.button('Measure', () => {
      const { x, sigma: s, g } = run.state, h = 0.02;
      const dx = (mix.logp(x[0] + h, x[1], s) - mix.logp(x[0] - h, x[1], s)) / (2 * h), dy = (mix.logp(x[0], x[1] + h, s) - mix.logp(x[0], x[1] - h, s)) / (2 * h);
      mix.denoise(x[0], x[1], s, g);
      const ax = (g[0] - x[0]) / (s * s), ay = (g[1] - x[1]) / (s * s);
      ui.read('r-a', `${dx.toFixed(5)}, ${dy.toFixed(5)}`); ui.read('r-b', `${ax.toFixed(5)}, ${ay.toFixed(5)}`);
      sound.drip?.(0.6); n += 1;
      run.state.lastCheck = Math.hypot(dx - ax, dy - ay) / (Math.hypot(ax, ay) + 1e-9);
      if (n >= 2) { ui.ctrl(); done(); }
    }, { id: 'measure' }));
  });
  await run.line('They agree to the last digit shown. This is <b>Tweedie\'s formula</b>. For the exact denoiser, the guess and the score are one object in two forms.');
}

async function field(run) {
  const { ui, sound } = run, { T, field: F } = run.state;
  ui.tags('game');
  run.state.hide = true;
  const N = 9000, px = new Float32Array(N), py = new Float32Array(N), rng = makeRng(4), g = [0, 0];
  for (let i = 0; i < N; i += 1) { px[i] = -180 + 360 * rng.u(); py[i] = -100 + 360 * rng.u(); }
  let s = 30, on = false;
  ui.reads([{ id: 'r-s', value: `${s}°`, label: 'noise σ' }]);
  await run.line('The score exists everywhere, so it is a field of arrows over the whole map. These droplets now follow it, and nothing else.');
  const tick = (dt) => {
    if (on) for (let i = 0; i < N; i += 1) { F.at(px[i], py[i], s, g); const k = Math.min(1, dt * 2.6); px[i] += k * (g[0] - px[i]); py[i] += k * (g[1] - py[i]); }
    T.paint(px, py, N, { sigma: 2, boost: 0.9 });
  };
  run.tick(tick); on = true; sound.drip?.(0.8);
  ui.say('Every droplet is climbing the same slope. <b>Slide σ down slowly.</b> Watch peaks split as the noise falls.');
  await run.until((done) => {
    let low = false;
    ui.ctrl(ui.slider({ label: 'Noise σ', min: 6, max: 90, step: 1, value: 30, id: 'noise', format: (v) => `${v}°`, onInput: (v) => { s = v; ui.read('r-s', `${v}°`); if (v <= 12 && !low) { low = true; ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); } } }));
  });
  run.untick(tick); run.state.hide = false;
  await run.line('You have just felt the pull of the data. In the next chapter this is done properly, with the noise levels and step sizes that make the populations come out right.');
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. A protein has two states, open 90% of the time and closed 10%, 20 Å apart. A noisy point sits exactly halfway between them, with σ = 10 Å. Where is the best guess?',
      options: [
        { text: 'Halfway, 10 Å from each state.', why: 'At the midpoint both states explain the noise equally, but they do not start equal. The 90 and 10 still count.' },
        { text: '2 Å from open, 18 Å from closed.', right: true, why: 'Yes. The two likelihoods tie, so the posterior stays 90 to 10, and the mean of the two states sits at 0.9 of the way to open.' },
        { text: 'Exactly on the open state.', why: 'The guess is a mean, not the most likely state. The closed state still pulls with weight 0.1.' },
      ],
    },
    {
      q: 'So that guess is not a real conformation. What does a sampler do about this?',
      options: [
        { text: 'It takes a small step toward the guess, then asks again at lower noise.', right: true, why: 'Yes. Each small step changes the noisy point, the posterior sharpens, and one state wins.' },
        { text: 'It jumps to the guess at once, since the guess is optimal.', why: 'Optimal for squared error, but it is a blend of the two states. One jump would stop at a structure that is neither.' },
        { text: 'It picks the nearest training structure.', why: 'That is lookup. A sampler follows the field, and a trained network has no list to pick from.' },
      ],
    },
  ], ['model']);
}
