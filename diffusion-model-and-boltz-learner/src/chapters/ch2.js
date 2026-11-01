// Chapter 2. The forward process: real residues, real Gaussian noise, the modes of the blurred density, and the noise schedule.
import { allRama, rama } from '../science/data.js';
import { boltzSchedule, schedule } from '../science/sampler.js';
import { check, fieldOf, fmt, sigmaLevel, Tank } from './common.js';
import { makeRng } from '../science/rng.js';

const sigmaOf = (v) => (v <= 0 ? 0 : 1.5 * 200 ** (v / 100)); // Slider position to noise, on a log scale.
const vOf = (s) => (100 * Math.log(s / 1.5)) / Math.log(200);

export default {
  id: 'forward',
  title: 'Dissolve it',
  tease: 'Add real Gaussian noise, and watch small features die first.',
  principle: 'Forward diffusion adds Gaussian noise of growing size. Low peaks die first and the largest last, so each noise level holds structure at its own scale. Noise levels are spaced by a schedule that packs them toward small noise compared with even spacing. Even so, Boltz-2 spends 118 of its 200 steps above 16 Å.',
  goals: ['Dissolve the map past the size of the data.', 'Find where the small island dies and where the last two merge.', 'Get the new case right first time, answer and reason.'],
  note: `<h3>Chapter note</h3>
    <p><b>Noise.</b> Each droplet is x = y + σ n, with y a real residue and n a fixed draw from a Gaussian. This is the form used by Karras et al. 2022 and by Boltz. Ho et al. 2020 write the same thing with an extra shrink factor, which only rescales the coordinates.</p>
    <p><b>Islands left.</b> The modes of the density p(x; σ), found live by repeatedly moving a point to its denoised guess, which climbs to a mode. Below about 10° every small clump counts as a mode, so the game stops counting there.</p>
    <p><b>The flat sheet.</b> Angles wrap round, so φ = 180° is next to φ = −180°. Here the map is cut along φ = ±180° and ψ = −100° and treated as a flat sheet. Only ${allRama().meta.nearCut} of ${allRama().meta.general.toLocaleString('en')} general residues lie within 5° of a cut. Doing it properly needs noise on a torus (Jing et al., NeurIPS 2022, torsional diffusion). Boltz adds noise to flat x, y, z coordinates, so it does not meet this. BioEmu has curved space to deal with, because it diffuses backbone frames with rotations.</p>
    <p><b>The schedule.</b> σ_i = (σ_max^(1/ρ) + (i/(N−1)) (σ_min^(1/ρ) − σ_max^(1/ρ)))^ρ, Karras et al. 2022, Eq. 5. Boltz-2 uses ρ = 7, σ_min = 0.0001 and σ_max = 160, all multiplied by σ_data = 16 Å (<i>boltz/main.py</i>, <i>modules/diffusionv2.py</i>). AlphaFold3 uses the same form with σ_min = 0.0004 (Supplementary Eq. 7). Boltz-1 uses ρ = 8 and σ_min = 0.0004.</p>
    <p class="small">Sohl-Dickstein et al., ICML 2015. Ho, Jain and Abbeel, NeurIPS 2020. Song et al., ICLR 2021. Karras et al., NeurIPS 2022. Abramson et al., Nature 630, 493 (2024), and its Supplementary Information.</p>`,

  async setup(run) {
    const T = run.state.T = new Tank(run), d = run.state.d = rama(), rng = makeRng(21), N = T.N;
    run.ui.say('Mixing the water.');
    run.state.field = await fieldOf(run, 'general', d.train.x, d.train.y);
    const { field } = run.state, ix = run.state.ix = new Uint16Array(N), nx = run.state.nx = new Float32Array(N), ny = run.state.ny = new Float32Array(N);
    for (let i = 0; i < N; i += 1) { ix[i] = i < d.train.x.length ? i : rng.int(d.train.x.length); nx[i] = rng.n(); ny[i] = rng.n(); }
    run.state.px = new Float32Array(N); run.state.py = new Float32Array(N); run.state.gx = new Float32Array(N); run.state.gy = new Float32Array(N);
    for (let i = 0; i < N; i += 1) { run.state.gx[i] = d.train.x[ix[i]]; run.state.gy[i] = d.train.y[ix[i]]; }
    run.state.modes = (s) => modesAt(field, s);
    // Where the two features die, found by bisection on the mode count.
    const count = (s) => modesAt(field, s).length;
    const cross = (lo, hi, k) => { for (let i = 0; i < 18; i += 1) { const m = Math.sqrt(lo * hi); if (count(m) > k) lo = m; else hi = m; } return Math.sqrt(lo * hi); };
    run.state.sMerge = cross(45, 110, 1);
    run.state.sLeft = cross(28, 60, 2);
    run.probe = { sMerge: run.state.sMerge, sLeft: run.state.sLeft, sliderFor: vOf };
    show(run, 0);
  },
  stages: [dissolve, hunt, schedStage, checkStage],
};

function modesAt(field, s) {
  const out = [], g = [0, 0];
  for (let a = -170; a <= 170; a += 26) {
    for (let b = -90; b <= 250; b += 26) {
      let x = a, y = b;
      for (let k = 0; k < 80; k += 1) { field.at(x, y, s, g); const d = (g[0] - x) ** 2 + (g[1] - y) ** 2; x = g[0]; y = g[1]; if (d < 1e-3) break; }
      if (!out.some((p) => Math.hypot(p[0] - x, p[1] - y) < s / 2 + 2)) out.push([x, y]);
    }
  }
  return out;
}

function show(run, s) {
  const { T, ix, nx, ny, px, py, gx, gy, d } = run.state, n = T.N, { x, y } = d.train;
  for (let i = 0; i < n; i += 1) { const k = ix[i]; px[i] = x[k] + s * nx[i]; py[i] = y[k] + s * ny[i]; }
  T.setZoom(Math.max(1, 1 + (2.3 * s - 40) / 180), 0.2);
  T.paint(px, py, n, { sigma: s, gx, gy });
  run.sound.setSigma(sigmaLevel(s));
  run.state.sigma = s;
}

function sigmaSlider(run, onMove, value = 0, id = 'noise') {
  return run.ui.slider({ label: 'Noise σ', min: 0, max: 100, step: 0.5, value, id, format: (v) => `${fmt(sigmaOf(v), sigmaOf(v) < 10 ? 1 : 0)}°`, onInput: (v) => { const s = sigmaOf(v); show(run, s); onMove?.(s); } });
}

async function dissolve(run) {
  const { ui } = run, { T, modes, d } = run.state;
  ui.tags('real', 'game');
  T.labels = false;
  let marks = [];
  T.extra.push((g) => { for (const m of marks) T.ring(g, m[0], m[1], 7, 'rgba(29,33,65,.75)', 1.5); });
  run.state.marks = (s) => { marks = s >= 10 ? modes(s) : []; ui.read('r-i', s >= 10 ? `${marks.length}` : 'many'); ui.read('r-s', `${fmt(s, s < 10 ? 1 : 0)}°`); };
  await run.line('Noise is the one thing we know how to make. Each droplet moves by a random amount: x = y + σ n, where y is the real residue, n is a Gaussian draw and σ sets the size.');
  ui.reads([{ id: 'r-s', value: '0°', label: 'noise σ' }, { id: 'r-i', value: 'many', label: 'islands left' }, { value: `${fmt(run.state.field.mix.sdata, 0)}°`, label: 'spread of the data, σ_data' }]);
  ui.say('<b>Drag the noise up until the map is one featureless cloud.</b> Rings mark the peaks of the blurred density.');
  void d;
  await run.until((done) => {
    let reached = false;
    ui.ctrl(sigmaSlider(run, (s) => { run.state.marks(s); if (s > 150 && !reached) { reached = true; run.reach(1); ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); } }));
  });
  await run.line('This direction needs no learning at all. Run the same formula at any σ and you get the answer straight away. That is the <b>forward process</b>.');
  ui.tags('real', 'game', 'model');
  await run.line(`Angles wrap round, so this flat sheet is a simplification. We cut it along its emptiest lines, where only ${allRama().meta.nearCut} of ${allRama().meta.general.toLocaleString('en')} residues lie within 5°. Boltz adds noise to flat x, y, z coordinates, so it has no such seam.`);
}

async function hunt(run) {
  const { ui, sound } = run, { sMerge, sLeft } = run.state;
  ui.tags('game');
  await run.line('Features do not all die at once. Find out when they go.');
  const near = (s, t) => Math.abs(Math.log(s / t)) < 0.14;
  ui.reads([{ id: 'r-s', value: '', label: 'noise σ' }, { id: 'r-i', value: '', label: 'islands left' }]);
  const stage = async (ask, target, ok, miss) => {
    ui.say(ask);
    await run.until((done) => {
      const sl = sigmaSlider(run, (s) => run.state.marks(s), vOf(Math.max(run.state.sigma, 2)));
      const go = ui.button('Here', () => {
        if (near(run.state.sigma, target)) { sound.good(1); ui.ctrl(); done(); } else { ui.say(miss(run.state.sigma, target)); sound.soft(); }
      }, { id: 'here' });
      ui.ctrl(sl, go);
      run.state.marks(run.state.sigma);
    });
    ui.say(ok);
  };
  const hint = (s, t) => (s < t ? 'Not yet. Watch the count as you raise the noise.' : 'Past it. Lower the noise until the count changes.');
  await stage('<b>Find the σ where the last two peaks become one.</b> Tap Here at that point.', sMerge, '', hint);
  await run.line(`The helix and strand sides merge near ${fmt(sMerge, 0)}°. That is close to σ_data, the spread of the whole map. Above it, the data has no separate peaks left.`);
  await stage('<b>Now find where the left-handed island, φ above 0, dies.</b> It is the step from 3 peaks to 2.', sLeft, '', hint);
  run.reach(2);
  await run.line(`It goes near ${fmt(sLeft, 0)}°, long before the big merge. It holds about 3% of residues, and that low weight is what buries it, even though it sits far from the others.`);
  await run.line('So each noise level holds structure at its own size. To rebuild the data you will have to pass through all of them, large first and small last.');
}

async function schedStage(run) {
  const { ui, sound } = run, { T } = run.state;
  ui.tags('game');
  show(run, 0); T.setZoom(1, 0.4); run.state.marks?.(0);
  await run.line('So how should the noise levels be spaced? This choice is called the <b>noise schedule</b>.');
  let S = schedule(20, 0.5, 400, 1), tag = '20 steps, from 400° to 0.5°';
  const lo = Math.log(0.3);
  T.extra.push((g, w) => {
    const s = w.stage, x0 = s.x + 20, x1 = s.x + s.w - 20, y = s.y + s.h - 15, hi = Math.log(S[0] * 1.25), lo2 = Math.log(S[S.length - 2] * 0.8);
    g.strokeStyle = 'rgba(29,33,65,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
    g.fillStyle = 'rgba(35,54,168,.8)';
    for (let i = 0; i + 1 < S.length; i += 1) { const u = (Math.log(S[i]) - lo2) / (hi - lo2); g.beginPath(); g.arc(x0 + (x1 - x0) * u, y, S.length > 30 ? 1.6 : 3.2, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(29,33,65,.75)'; g.font = '500 12px "Ysabeau Office", sans-serif'; g.textAlign = 'left'; g.fillText(`small noise`, x0, y - 7); g.textAlign = 'right'; g.fillText(tag, x1, y - 7);
  });
  void lo;
  const count = (f) => S.slice(0, -1).filter(f).length;
  ui.reads([{ id: 'r-a', value: '', label: 'steps below 10°' }, { id: 'r-b', value: '', label: 'steps above σ_data' }]);
  ui.say('Twenty steps, from σ = 400° to 0.5°. The power ρ bends the spacing. <b>Bend it until at least 7 steps fall below 10°.</b> That is where the fine shape of an island is decided.');
  await run.until((done) => {
    let passed = false;
    const update = (r) => {
      S = schedule(20, 0.5, 400, r);
      ui.read('r-a', `${count((v) => v < 10)}`); ui.read('r-b', `${count((v) => v > 66)}`);
      if (count((v) => v < 10) >= 7 && !passed) { passed = true; sound.good(1); ui.ctrl$.append(ui.button('Next', () => done(), { id: 'next' })); ui.fit(); }
    };
    ui.ctrl(ui.slider({ label: 'ρ', min: 1, max: 12, step: 0.5, value: 1, format: (v) => `${v}`, onInput: update }));
    update(1);
  });
  await run.line('With ρ = 1 the steps are even in σ, so nearly all are spent where nothing fine can be seen. Karras and colleagues found ρ = 7 worked well for images, and AlphaFold3 and Boltz-2 both use it.');
  S = boltzSchedule(200); tag = 'Boltz-2: 200 steps, 2,560 Å to 0.0016 Å';
  ui.tags('paper', 'game');
  const a = count((v) => v >= 16), b = count((v) => v >= 1 && v < 16), c = count((v) => v < 1);
  ui.reads([{ value: `${a}`, label: 'steps above 16 Å' }, { value: `${b}`, label: 'between 1 and 16 Å' }, { value: `${c}`, label: 'below 1 Å' }]);
  await run.line('Here is the real default of Boltz-2, computed from the formula and its constants. σ runs from 2,560 Å to 0.0016 Å, and σ_data is taken as 16 Å.');
  await run.line('Ubiquitin, 76 residues, is only about 40 Å across, yet the schedule starts far beyond that. Ask yourself why, because the check is next.');
}

async function checkStage(run) {
  await check(run, [
    {
      q: 'New case. Boltz-2 starts from σ = 2,560 Å, far larger than any protein. What is the point?',
      options: [
        { text: 'At that noise the start no longer depends on the protein. It is a plain Gaussian, which anyone can draw.', right: true, why: 'Yes. A sampler must start from something it can draw without knowing the answer. Far above σ_data, the noisy data is a plain Gaussian.' },
        { text: 'Large proteins need the room.', why: 'A complex can be large, but that alone would not need 160 times σ_data. The start must be independent of the structure.' },
        { text: 'Big noise makes the steps run faster.', why: 'Noise level does not change the cost of a step. The start must be a distribution you can draw from.' },
      ],
    },
    {
      q: 'A rare state holds 2% of a population and sits between two large states. When does it stop being a separate peak?',
      options: [
        { text: 'Only when the two large states merge.', why: 'A low peak goes first. You saw the small island go long before the big merge.' },
        { text: 'Before the large states merge. Low weight makes a low peak, which disappears at less noise than an equal peak at the same distance.', right: true, why: 'Yes. Weight decides how soon a peak goes under. In the reverse run, a rare state splits from the crowd later than the big ones do.' },
        { text: 'Never, because Gaussian noise keeps every state.', why: 'Its probability is still there, but it stops being a separate peak. That is what the rings counted.' },
      ],
    },
  ], ['paper', 'model']);
}
