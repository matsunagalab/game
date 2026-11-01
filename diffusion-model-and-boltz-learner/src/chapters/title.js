// The title: ink clouds that condense into a real protein and dissolve again, in a slow breath.
// Every position is real. The atoms follow the probability-flow ODE of our best-rotation denoiser over 39 real ubiquitin conformers (PDB 2K39). This is noise being removed. It is not folding.
// The droplets sit along real bonds. The curl of the water is a look laid on top, and it fades to nothing as the noise goes.
import { Cloud } from '../world.js';
import { bondsOf, chainInk } from '../mol.js';
import { ubiquitin } from '../science/data.js';
import { Ensemble } from '../science/cart.js';
import { makeRng } from '../science/rng.js';

export async function titleScene(run, { quiet = false } = {}) {
  const { world, sound } = run, U = ubiquitin(), E = run.state.E = new Ensemble(U.models), n = U.n, rng = makeRng(2026);
  const bonds = bondsOf(E.models[0], n), total = quiet ? Math.round(world.dropCount * 0.5) : world.dropCount;
  const cloud = run.own(new Cloud(world, total));
  const backbone = []; for (const b of bonds) if (U.role[b[0]] && U.role[b[1]]) backbone.push(b);
  const A = new Uint16Array(total), B = new Uint16Array(total), T = new Float32Array(total), J = new Float32Array(total * 3), ink = new Float32Array(total * 3), mass = new Float32Array(total);
  const maxRes = U.res[n - 1];
  for (let k = 0; k < total; k += 1) {
    const list = rng.u() < 0.72 ? backbone : bonds, b = list[rng.int(list.length)];
    A[k] = b[0]; B[k] = b[1]; T[k] = rng.u();
    J[3 * k] = rng.n(); J[3 * k + 1] = rng.n(); J[3 * k + 2] = rng.n();
    const i = chainInk(U.res[b[0]] / maxRes);
    ink[3 * k] = i[0]; ink[3 * k + 1] = i[1]; ink[3 * k + 2] = i[2];
    mass[k] = 0.5 + 0.5 * rng.u();
  }
  world.mood = { flow: 0.0016, decay: 0.955, trail: 1.5 };
  run.own({ dispose: () => { world.mood = { flow: 0.0009, decay: 0.9, trail: 0.8 }; } });
  const frame = () => {
    const s = world.stage, tall = s.h > s.w;
    // The protein sits low in a tall screen, under the title.
    const span = tall ? 46 : 58;
    world.look(0, tall ? 12.5 : 0, Math.min(s.w, s.h * 0.9) / span, 0);
  };
  frame(); run.onLayout = frame;
  const x = run.state.x = new Float64Array(E.dim), eps = new Float64Array(E.dim), out = new Float64Array(E.dim), base = new Float64Array(E.dim);
  const SMAX = 70, SMIN = 0.06;
  for (let i = 0; i < E.dim; i += 1) { eps[i] = rng.n(); x[i] = eps[i] * SMAX; }
  let phase = 'in', t = 0, sigma = SMAX, spin = 0.5;
  // With reduced motion, the protein simply rests, without the breath.
  if (world.reduce) { x.set(E.models[0]); sigma = SMIN; phase = 'rest'; }
  const INT = world.reduce ? 0.2 : 1;
  const cs = () => Math.cos(spin), sn = () => Math.sin(spin);
  const draw = (time) => {
    const c = cs(), e = sn(), wob = Math.min(1, sigma / 6), R = 14;
    // Ink keeps its mass as it spreads, so a droplet's darkness falls with its area. The floor keeps the far cloud from vanishing.
    const size = 0.42 + 0.3 * sigma, big = 1 + sigma / 9;
    const m = (1.25 * 0.042 * big * (26000 / total)) / (size * size), jit = 0.06 + 0.34 * sigma;
    for (let k = 0; k < total; k += 1) {
      const a = 3 * A[k], b = 3 * B[k], t0 = T[k];
      const px = x[a] + t0 * (x[b] - x[a]) + J[3 * k] * jit, py = x[a + 1] + t0 * (x[b + 1] - x[a + 1]) + J[3 * k + 1] * jit, pz = x[a + 2] + t0 * (x[b + 2] - x[a + 2]) + J[3 * k + 2] * jit;
      const rx = c * px + e * pz, rz = -e * px + c * pz;
      // The look of the water: a slow curl that fades with the noise.
      const q = 0.05, w = 0.15 * wob * wob * sigma;
      const u = Math.sin(q * py + 0.21 * time + J[3 * k + 2]) * w, v = Math.sin(q * rx - 0.17 * time) * w;
      // Nearer ink is denser, so that the fold reads in depth.
      const near = 1 + 0.75 * Math.max(-1, Math.min(1, rz / R)) * (1 - wob);
      cloud.set(k, rx + u, py + v, rz, [ink[3 * k], ink[3 * k + 1], ink[3 * k + 2]], mass[k] * m * near, size);
    }
    cloud.commit(total);
    };
  run.tick((dt, time) => {
    t += dt * INT;
    if (!world.reduce) spin += dt * 0.09;
    if (phase === 'rest') {
      run.state.sigma = sigma; draw(0); return;
    }
    if (phase === 'in') {
      // The reverse process: the probability-flow ODE, with sigma falling exponentially in time.
      const next = Math.max(SMIN, sigma * Math.exp(-dt * 0.75));
      for (let sub = 0; sub < 2; sub += 1) {
        const s1 = sigma + (next - sigma) * (sub + 1) / 2, s0 = sigma + (next - sigma) * sub / 2;
        E.denoise(x, s0, out);
        const k = (s1 - s0) / s0;
        for (let i = 0; i < E.dim; i += 1) x[i] += k * (x[i] - out[i]);
      }
      sigma = next;
      if (sigma <= SMIN * 1.01) { phase = 'hold'; t = 0; base.set(x); for (let i = 0; i < E.dim; i += 1) eps[i] = rng.n(); run.state.held = (run.state.held ?? 0) + 1; }
    } else if (phase === 'hold') {
      if (t > 5) { phase = 'out'; t = 0; }
    } else {
      // The forward process: x = x0 + sigma n, with n held fixed.
      sigma = Math.min(SMAX, Math.max(SMIN, sigma * Math.exp(dt * 0.6)));
      for (let i = 0; i < E.dim; i += 1) x[i] = base[i] + sigma * eps[i];
      if (sigma >= SMAX) { phase = 'in'; t = 0; }
    }
    run.state.sigma = sigma;
    sound.setSigma(Math.log(sigma / SMIN) / Math.log(SMAX / SMIN));
    draw(time);
  });
  await run.until(() => {});
}
