// Chapter 4. Run it backward, on real proteins. Atoms condense out of a cloud through the stops the player sets on the noise ruler, on the exact field
// of real structures. A bad ladder still lands on real structures, but how often it lands on each breaks first, so bars of those frequencies are the score.
// Level 1 evens them. Levels 2 and 3 keep the bars and also ask for the open share. Level 3 adds fresh noise, where more plain stops do not help.
import { adk, ubiquitin } from '../science/data.js';
import { Aligned } from '../science/cart.js';
import { bondError, bondLengths } from '../science/blur.js';
import { ladderStep } from '../science/sampler.js';
import { rareSet, slotSigma, STOPS } from '../science/levels.js';
import { evenCount } from '../science/stats.js';
import { bondsOf, Bundle, chainBonds, chainInk } from '../mol.js';
import { Board, fmt, plate, sigmaLevel } from './common.js';
import { PIGMENT } from '../world.js';
import { makeRng } from '../science/rng.js';

const { smax: SMAX, smin: SMIN, slots: SLOTS, seed: SEED, noise: NOISE, shown: SHOWN, samples: SAMPLES, draws: DRAWS, crisp: CRISP, even: EVEN, band: BAND, blur: BLUR, fair: FAIR, first: FIRST, second: SECOND, thirdFirst: THIRD, thirdAnswer: ANSWER, budget: BUDGET } = STOPS;
const INK = '29, 33, 65', TEAL = '#0d8a8f', MAG = '#c2185b', ULTRA = '#2336a8', SOFT = '#565c7c';
const GOALS = [`Move stops until the even count is ${EVEN}.`, `${BUDGET[1]} calls. Set share and even count ${FAIR}.`, `Noise the size of Boltz-2's γ₀. Same test, ${BUDGET[2]} calls.`];
const TAGS = ['real', 'game', 'model'];
const BLURRED = 'Last jump too long: a blur.', MOVE = 'Off target. Move a stop.';

export default {
  id: 'sampler',
  puzzle: true,
  place: [1, 2],
  title: 'Run it backward',
  tease: 'Place the stops of a sampler, and bring real proteins out of a cloud of noise.',
  principle: 'Bad stops still land on real structures, but frequencies break first, states far from the mean soonest. Under fixed noise, more plain stops do not bring them back.',
  goals: GOALS,
  note: `<h3>Chapter note</h3>
    <p><b>Your moves and the real thing.</b> A sampler's noise schedule is a list of stops along σ, and each stop you place is one real denoiser call. The sampler steps toward the denoiser's guess at each stop. A second look is Heun's correction: a second denoiser call at the end of the step, then the average of the two slopes. Real samplers usually use one rule for all steps. Mixing them step by step, as you can here, is sound mathematics but is this game's own move. You choose the stops by hand here, and real schedules are fixed formulas.</p>
    <p><b>The field.</b> The exact denoiser of real structures held in one frame, Karras et al. 2022, Eq. 57, with no rotation. That is why it carries the Teaching model tag. The best-rotation denoiser of chapters 6 and 7 is not used here, because it bends the shares of states. Noise outside the span of the structures cannot change the weights, so a run works exactly on a few numbers, 38 for ubiquitin and 16 for the kinase set, which lets a phone run thousands of chains. The chains on the board are real members of the run. Their noise outside the span is drawn to the right size for each stop, which is exact in distribution. While σ is wider than the board, the view shrinks whole chains toward the mean to fit, and says so on the board. For the kinase that covers everything above about 33 Å.</p>
    <p><b>This is not folding.</b> Steps of a sampler are iterations of an algorithm. They are not a pathway, and they are not molecular dynamics time. Nothing about the order of the stops says how a protein moves.</p>
    <p><b>The start.</b> Runs begin as pure noise at 1,000 Å. From there a perfect run reaches the set's own 11.8% open, and starting higher makes almost no difference. From 200 Å it reaches 11.4%. Boltz starts from 2,560 Å.</p>
    <p><b>Level 1.</b> Ubiquitin, 39 conformers of PDB 2K39, 601 heavy atoms, ${DRAWS.toLocaleString('en')} runs from one seed. Each bar is one conformer, tallest first, and shows how often runs landed on it. The dashed line is an even share, and a bar stops at twice that. The even count is the exponential of the entropy of the shares: 39 if all land equally often, 1 if only one does. It is not how many conformers landed. With this many runs it tops out near 38.6, and twenty-five stops give 38.5. To pass, it must reach ${EVEN} and runs must land within ${CRISP} Å of a real conformer.</p>
    <p><b>Why a bad ladder still looks real.</b> The last Euler step lands exactly on the guess: x + (0 − σ)/σ (x − D) = D. At low noise the guess is one item of a list of 39. So landing on a conformer comes from the finite list and not from the fold. A Gaussian of the same covariance has no list, and stops at 1,000 and 2 Å shrink its spread from 2.2 to 0.45 Å, so a continuous fold does not forgive a bad ladder, which agrees with chapter 3. Only a last stop at high noise blurs a list, about 1.6 Å from the nearest conformer, and the bad bonds show red. A real network is not a list of 39 structures, so it can fail in other ways, and this level says nothing about those.</p>
    <p><b>Frequencies break first.</b> A long jump shrinks runs toward the mean, so structures near the mean gain and those far from it lose. Two stops, 1,000 and 0.5 Å, land 0.01 Å from a conformer, yet the even count is 1.9, with 67% on one conformer. Level 1's start with its last stop pulled down lands 0.06 Å away with a count of 3.9. Distance alone would pass both. Red shows how far the guesses moved in a jump, including the first, so a stop inside the reddest jump shares out the change.</p>
    <p><b>Level 2.</b> The same bars on seventeen real C-alpha chains of adenylate kinase, 2 open and 15 closed, with the open pair first. So the set is 11.8% open. Those counts are what we chose to put in the set, not populations of the enzyme. A state counts as reached if the nearest chain is in it. To pass, the open share must land within 1.5 points and the even count must reach ${FAIR} of 17, the same bar as level 1's ${EVEN} of 39, so the whole chart has to be right and not only two bars of it.</p>
    <p><b>Far from the mean, not rare.</b> The cause is distance from the mean, not rarity. With two populations the mean sits with the larger one, so the rare side is the far side, here the open pair. A rare state near the mean does the opposite. Take 7 open and 8 closed chains with two made-up midpoints between them, again 11.8% of the set: the midpoints grow to 18% with five Euler stops and take every run with two. They are a control, not real structures.</p>
    <p><b>What a second look does.</b> One look is not accurate on a long jump. Across jumps ending at 109, 79, 58 and 42 Å, the share swings from 2 to 18% with where the jump ends and what follows, because the step multiplies the guess at the far end by (σ₀ − σ₁)/(2σ₁), about 8 from 1,000 to 58 Å. So 12% is only where undershoot and overshoot cross, and those ladders leave the bars broken, with an even count near 12. With ${BUDGET[1]} calls, plain stops alone reach about 10%, just under the target, and 25 stops reach 10.8%, so here second looks save calls. Stops at 1,000, 205, 79, 42, 16, 9 and 1.8 Å with looks on the three jumps from 205 to 16 Å give about 11.6% with an even count of 16.1, and moving any one stop by one place keeps the share between 10.3 and 12.8%. A chain that ends open passes even odds between about 31 and 121 Å. These two states lie about 120 Å apart as one distance over all coordinates, which is about 8 Å per atom in this frame. Shares here are means of many seeds on this set, and the board shows one seed of 4,000.</p>
    <p><b>Level 3.</b> With γ fixed at ${NOISE}, Euler does not recover a far state as stops are added: 8.2, 8.4, 8.4, 8.2 and 8.5% at 25, 50, 100, 200 and 400 stops, while the same stops with no noise climb 10.8, 11.3, 11.5, 11.6 and 11.7%. However many stops there are, each step still jumps from 1.8 σ back to σ in one go. A second look corrects most of that jump, and on this ladder it matters on the jump that crosses about 120 Å and the next two, down to about 30 Å. Looks above or below that range change almost nothing. On eight stops those three give about 10.4% with an even count of 16 on ${BUDGET[2]} calls, while the same eight stops without them give 6.9%. Heun on every step gives about 11.3% from 25 stops and then slightly less with more steps, 11.1% at 400, so it recovers most of the share and not all of it. The test is the same as level 2's. It starts from few stops, because from a full ladder a few lucky drags would be enough. Pigment shows each chain's current guess, so colour appears only as it decides. Open chains are drawn darker, because they lie alone where the closed chains lie on top of each other, so read the shares from the bars and not from the depth of the ink.</p>
    <p><b>Samplers.</b> Euler steps along the probability-flow ODE, dx/dσ = (x − D(x; σ))/σ. Heun, Algorithm 1 of Karras et al. 2022, corrects each step with a second denoiser call, except the last step into σ = 0, which has none. In level 3, as in their Algorithm 2, fresh noise lifts each point from σ to σ(1 + γ) before the step, except on the last step. γ is ${NOISE}, the size of Boltz-2's γ₀, and above their cap of √2 − 1. Their γ also shrinks as steps are added, and this one does not. It comes here with η = 1, λ = 1 and no cut-off at low noise, so this level shows noise on a ladder and is not Boltz's sampler.</p>
    <p><b>Determinism.</b> All runs here start from one fixed seed, so the same stops give the same picture. With no fresh noise, the starting noise alone decides where each chain lands. With fresh noise each chain's fate is open.</p>
    <p><b>In Boltz.</b> Boltz and AlphaFold3 use a stochastic first-order sampler, not Heun: one denoiser call per step, 200 steps by default, with noise added before each step only while σ stays above γ_min, 1 Å in Boltz-2. Its γ₀ is fixed and its steps are first-order, so on an exact field more steps would not restore a state far from the mean, as level 3 shows. Heun alone would not fix it either. For two exact states at a set 10%, at 200 steps, η = 1 gives 7.0% with Euler and 9.6% with Heun, but Boltz-2's η = 1.5 gives 2.4% and only 4.7%, so η is the main cause. Its numbers come in chapter 9. In Boltz-1's own ablation (Table 1), mean LDDT of the top sample went 0.693, 0.710, 0.716 for 20, 50 and 200 steps, on 5 samples per target, and they report a plateau beyond 50 steps. That table measures the accuracy of top samples, not frequencies.</p>
    <p class="small">Karras et al., NeurIPS 2022. Song et al., ICLR 2021, for the probability-flow ODE. Wohlwend et al., bioRxiv 10.1101/2024.11.19.624167. Abramson et al., Nature 630, 493 (2024), Supplementary Algorithm 18. Lange et al., Science 320, 1471 (2008).</p>`,

  setup(run) {
    const T = run.state.T = new Board(run, { span: 42 });
    T.setPanel(100, 0);
    const L = run.state.L = new Ladder(run);
    run.probe = { L };
  },
  stages: [level1, level2, level3],
};

// The ruler of noise, its stops, its spare calls, and the protein above it.
class Ladder {
  constructor(run) {
    Object.assign(this, { run, T: run.state.T, stops: [], token: 0, heat: [], at: -1, tray: false, gamma: 0, help: true, dist: null, onResult: null, f: 1, sigma: 0 });
    this.T.extra.push((g) => this.draw(g));
    run.tick((dt) => this.frame(dt));
    this.safeRun = run.safe(() => this.pourNow());
  }

  // What is on the board. Built once for each protein.
  use(set) {
    if (this.set && this.set !== set) this.set.bundle.hide();
    this.set = set;
    this.T.setSpan(set.span, 0.3);
  }

  ubiquitin() {
    if (this.ubq) return this.ubq;
    const U = ubiquitin(), F = new Aligned(U.models), n = U.n, bonds = bondsOf(U.models[0], n), maxRes = U.res[n - 1];
    const atomInk = new Float32Array(3 * n);
    for (let a = 0; a < n; a += 1) atomInk.set(chainInk(U.res[a] / maxRes), 3 * a);
    const bundle = new Bundle(this.run, { n, bonds, K: 1, drops: Math.round(this.run.world.dropCount * 0.6), seed: 3, weight: (b) => (U.role[b[0]] && U.role[b[1]] ? 3 : 1) });
    return (this.ubq = this.prepare({ F, n, bonds, K: 1, N: DRAWS, bundle, atomInk, span: 42, ref: bondLengths(U.models[0], bonds), strain: new Float32Array(bonds.length) }));
  }

  kinase() {
    if (this.adk) return this.adk;
    const K = adk(), ids = rareSet(K), F = new Aligned(ids.map((i) => K.models[i])), n = K.n, bonds = chainBonds(n), state = ids.map((i) => K.state[i]);
    const bundle = new Bundle(this.run, { n, bonds, K: SHOWN, drops: Math.round(this.run.world.dropCount * 0.6), seed: 7, thick: 0.5, mass: 0.7 });
    return (this.adk = this.prepare({ F, n, bonds, K: SHOWN, N: SAMPLES, bundle, span: 78, state, truth: state.filter((s) => s === 0).length / state.length, chainInk: new Float32Array(3 * SHOWN), chainMass: new Float32Array(SHOWN).fill(1) }));
  }

  prepare(set) {
    const { F, K, N } = set, { dim, P } = F, r = makeRng(SEED + 7);
    set.c = new Float64Array(N * P); set.was = new Float64Array(K * P); set.xi = new Float64Array(K * dim);
    for (let i = 0; i < set.xi.length; i += 1) set.xi[i] = r.n();
    for (let j = 0; j < K; j += 1) F.outside(set.xi, j * dim);
    set.X0 = new Float32Array(K * dim); set.X1 = new Float32Array(K * dim); set.X = new Float32Array(K * dim);
    set.full = new Float64Array(dim);
    return set;
  }

  calls() { return this.stops.reduce((t, p, i) => t + 1 + (p.second && i + 1 < this.stops.length ? 1 : 0), 0); }
  spare() { return this.budget - this.calls(); }
  place$(slots, seconds = []) { this.stops = slots.map((slot, i) => ({ slot, second: !!seconds[i] })); }
  tidy() { this.stops.sort((a, b) => a.slot - b.slot); this.stops[this.stops.length - 1].second = false; }
  ladder() { return this.stops.map((p) => ({ s: slotSigma(p.slot), second: p.second })); }

  geo() {
    const p = this.T.panel, L = p.x + 22, R = p.x + p.w - 30;
    return { p, L, R, top: p.y + 34, base: p.y + 70, y: p.y + 90, tray: p.y + 146, X: (slot) => L + ((R - L) * slot) / (SLOTS - 1) };
  }

  slotAt(x, skip = null) {
    const { L, R } = this.geo(), want = Math.max(0, Math.min(SLOTS - 1, Math.round(((x - L) / (R - L)) * (SLOTS - 1))));
    for (let d = 0; d < SLOTS; d += 1) for (const q of [want - d, want + d]) if (q >= 1 && q < SLOTS && !this.stops.some((p) => p !== skip && p.slot === q)) return q;
    return want;
  }

  spareX(i) { const { p } = this.geo(); return p.x + 58 + i * 36; }

  hit(x, y) {
    if (this.locked) return null;
    const G = this.geo();
    if (Math.abs(y - G.y) <= 30) {
      let best = null, lo = 26;
      this.stops.forEach((q) => { const d = Math.abs(G.X(q.slot) - x); if (d < lo && q.slot > 0) { lo = d; best = q; } });
      return best ? { pin: best } : null;
    }
    if (this.tray && Math.abs(y - G.tray) <= 26 && this.spare() > 0 && x >= G.p.x && x <= this.spareX(this.spare() - 1) + 26) return { spare: true };
    return null;
  }

  bind() {
    const { run } = this;
    const stopRun = () => { this.token += 1; this.at = -1; };
    return run.board({
      at: (x, y) => this.hit(x, y),
      hover: (t) => { this.lit = t?.pin ?? (t ? 'spare' : null); },
      grab: (t, x, y) => { stopRun(); if (t.pin) this.drag = { pin: t.pin, from: t.pin.slot, y }; else this.carry = { x, y }; },
      move: (t, x, y) => {
        if (t.pin) {
          const G = this.geo();
          t.pin.slot = this.slotAt(x, t.pin);
          this.drag.out = this.tray && y - G.y > 44;
          run.sound.drip?.(0.12);
        } else this.carry = { x, y, ...this.aim(x, y) };
      },
      drop: (t, x, y) => { if (t.pin) this.settle(t.pin); else this.spend(x, y); },
      // A tap takes a second look back. A stop that has none just runs again.
      tap: (t) => { this.drag = null; this.carry = null; if (t.pin) { t.pin.second = false; this.go(); } },
      cancel: () => { this.drag = null; this.carry = null; },
    });
  }

  // What a spare call would do if it were let go here.
  aim(x, y) {
    const G = this.geo();
    if (Math.abs(y - G.y) > 44) return { to: null };
    const q = this.stops.find((p) => Math.abs(G.X(p.slot) - x) < 15);
    if (q) return { to: q };
    return { to: 'new', slot: this.slotAt(x) };
  }

  settle(pin) {
    const { out } = this.drag ?? {};
    this.drag = null;
    if (out) {
      if (this.stops.length <= 2) { this.reject('Keep two stops.'); return; }
      this.stops.splice(this.stops.indexOf(pin), 1);
    }
    this.tidy();
    this.go();
  }

  spend(x, y) {
    const a = this.aim(x, y), { run } = this;
    this.carry = null;
    if (!a.to) { this.go(); return; }
    if (a.to === 'new') { this.stops.push({ slot: a.slot, second: false }); this.tidy(); run.sound.drip?.(0.6); this.go(); return; }
    if (a.to === this.stops[this.stops.length - 1]) { this.reject('No second look there.'); return; }
    if (a.to.second) { this.reject('No second look there.'); return; }
    a.to.second = true;
    run.sound.drip?.(0.6);
    this.go();
  }

  reject(line) { this.run.ui.feedback(line, 'bad'); this.run.sound.soft(); this.T.flash(false); }

  go() { return this.safeRun(); }

  // How much the view shrinks whole chains toward the mean, so that noise wider than the board does not leave it empty.
  fit(set, s) { return Math.min(1, (set.span * 0.42) / Math.max(s, 1e-3)); }

  // The chains on the board, in all their coordinates, at noise s.
  show(set, s, into) {
    const { F, K, c, xi, full } = set, { P, dim, mean } = F, fit = this.fit(set, s);
    for (let j = 0; j < K; j += 1) {
      F.expand(c.subarray(j * P, (j + 1) * P), s, xi.subarray(j * dim, (j + 1) * dim), full);
      if (fit < 1) for (let i = 0; i < dim; i += 1) full[i] = mean[i] + fit * (full[i] - mean[i]);
      into.set(full, j * dim);
    }
    if (set.chainInk) this.tint(set, s);
  }

  // Pigment shows what each chain's guess is at this moment, closed or open.
  tint(set, s) {
    const { F, K, c, state, chainInk: I, chainMass } = set, { P } = F, out = this.g ??= new Float64Array(64), { teal: O, ultra: C } = PIGMENT;
    for (let j = 0; j < K; j += 1) {
      F.denoise(c.subarray(j * P, (j + 1) * P), Math.max(s, 0.05), out);
      let w = 0;
      for (let m = 0; m < F.M; m += 1) if (state[m] === 0) w += F.w[m];
      for (let e = 0; e < 3; e += 1) I[3 * j + e] = C[e] + w * (O[e] - C[e]);
      // A rare chain lies alone where the others lie on top of each other, so it needs darker ink to read as a chain.
      chainMass[j] = 1 + 3.2 * w;
    }
  }

  // Noise down the ladder, for every sample, on the exact field.
  async pourNow() {
    const { run } = this, my = (this.token += 1), set = this.set, { F, N, K, c, X0, X1, X } = set, { P, dim } = F, ladder = this.ladder(), S = [...ladder.map((q) => q.s), 0];
    const seed = makeRng(SEED), noise = makeRng(SEED + 1), p = new Float64Array(P), g = new Float64Array(P), tmp = new Float64Array(2 * P), last = new Float64Array(P * 64), gamma = this.gamma, D = (a, s, o) => F.denoise(a, s, o);
    run.ui.handOff();
    for (let i = 0; i < N * P; i += 1) c[i] = S[0] * seed.n();
    this.show(set, S[0], X0); X.set(X0); this.sigma = S[0];
    this.at = 0; this.heat = [];
    const H = Math.min(64, N);
    for (let i = 0; i < H; i += 1) { F.denoise(c.subarray(i * P, (i + 1) * P), S[0], g); last.set(g, i * P); }
    const per = Math.min(1900, 240 * ladder.length + 300) / ladder.length;
    for (let k = 0; k < ladder.length; k += 1) {
      this.at = k;
      for (let i = 0; i < N;) {
        const end = performance.now() + 6;
        do {
          const b = i * P;
          for (let q = 0; q < P; q += 1) p[q] = c[b + q];
          ladderStep(p, ladder, k, D, g, noise, gamma, P, tmp);
          for (let q = 0; q < P; q += 1) c[b + q] = p[q];
          i += 1;
        } while (i < N && ((i & 63) || performance.now() < end));
        if (i < N) await run.hold(new Promise(requestAnimationFrame));
        if (my !== this.token || !run.alive) return;
      }
      // How far guesses moved in this jump: a real sign of where a jump is too long.
      if (k + 1 < S.length - 1) {
        let m = 0;
        for (let i = 0; i < H; i += 1) { F.denoise(c.subarray(i * P, (i + 1) * P), S[k + 1], g); for (let q = 0; q < P; q += 1) { const d = g[q] - last[i * P + q]; m += d * d; last[i * P + q] = g[q]; } }
        this.heat[k] = Math.sqrt(m / H);
      }
      this.show(set, S[k + 1], X1);
      const s0 = S[k], s1 = S[k + 1], t0 = performance.now();
      for (;;) {
        await run.hold(new Promise(requestAnimationFrame));
        if (my !== this.token || !run.alive) return;
        const f = Math.min(1, (performance.now() - t0) / per), e = f * f * (3 - 2 * f);
        for (let i = 0; i < K * dim; i += 1) X[i] = X0[i] + e * (X1[i] - X0[i]);
        const s = Math.exp(Math.log(s0 + 1e-2) + e * (Math.log(s1 + 1e-2) - Math.log(s0 + 1e-2))) - 1e-2;
        this.sigma = Math.max(0, s);
        run.sound.setSigma(sigmaLevel(s + 0.01, 0.5, 80));
        if (f >= 1) break;
      }
      X0.set(X1);
    }
    this.at = -1; this.sigma = 0;
    // The measures, over every sample.
    let rm = 0, up = 0;
    const shares = new Float64Array(F.M);
    for (let i = 0; i < N; i += 1) { const q = F.nearest(c, i * P); rm += q.rmsd; shares[q.m] += 1 / N; if (set.state && set.state[q.m] === 0) up += 1; }
    const res = { rmsd: rm / N, open: up / N, calls: this.calls(), shares, count: evenCount(shares) };
    if (set.ref) res.bond = bondError(X, set.bonds, set.ref, 0, set.strain, 0.1);
    this.res = res;
    this.rank(set, shares);
    this.onResult?.(res);
  }

  // The bars, tallest first, with a rare state first of all, so that a fair ladder reads as a flat row.
  rank(set, shares) {
    const by = (a, b) => shares[b] - shares[a], all = [...shares.keys()], open = set.state ? all.filter((m) => set.state[m] === 0).sort(by) : [], rest = all.filter((m) => !open.includes(m)).sort(by);
    this.want = [...open, ...rest].map((m) => shares[m]);
    this.tint$ = (i) => (i < open.length ? TEAL : set.state ? ULTRA : `rgb(${INK})`);
  }

  // One bar for each real structure: how often the runs landed on it, against the line of an even share. A bar taller than twice that stops at the top.
  drawBars(g, G) {
    const { p, top, base } = G, n = this.set.F.M, L = p.x + 14, w = (p.w - 28) / n, k = ((base - top) * n) / 2, mid = (top + base) / 2;
    g.fillStyle = `rgba(${INK}, .06)`; g.fillRect(L, top, p.w - 28, base - top);
    if (this.want) {
      g.globalAlpha = this.at >= 0 ? 0.3 : 1;
      this.shown ??= new Float64Array(n);
      for (let i = 0; i < n; i += 1) {
        this.shown[i] += (this.want[i] - this.shown[i]) * 0.22;
        const h = Math.min(base - top, this.shown[i] * k);
        g.fillStyle = this.tint$(i);
        g.fillRect(L + i * w + 0.6, base - h, Math.max(1, w - 1.2), h);
      }
      g.globalAlpha = 1;
    }
    g.strokeStyle = `rgba(${INK}, .5)`; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(L, mid); g.lineTo(p.x + p.w - 14, mid); g.stroke(); g.setLineDash([]);
  }

  frame(dt) {
    const set = this.set;
    if (!set) return;
    if (!this.run.world.reduce) set.bundle.turn(dt * 0.1, 0);
    set.bundle.draw(set.X, { atomInk: set.atomInk, chainInk: set.chainInk, chainMass: set.chainMass, strain: set.strain && this.at < 0 ? set.strain : null, sigma: Math.min(30, this.sigma), origin: set.F.origin, mass: this.sigma > 40 ? 0.7 : this.sigma > 3 ? 1.6 : 1 });
  }

  draw(g) {
    const { T } = this, G = this.geo(), { p, X, y } = G, set = this.set, res = this.res, b = T.box;
    if (!set) return;
    g.save();
    g.font = '500 12.5px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText('Noise being removed, not folding', b.x + b.w / 2, b.y + 13);
    const fit = this.at >= 0 ? this.fit(set, this.sigma) : 1;
    if (fit < 0.95) g.fillText(`view shrunk ×${Math.round(1 / fit)}`, b.x + b.w / 2, b.y + 30);
    plate(g, p);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = '400 24px "Instrument Serif", serif'; g.fillStyle = `rgb(${INK})`;
    const busy = this.at >= 0, even = res && !busy ? (Math.floor(res.count * 10) / 10).toFixed(1) : '…', t = busy || !res ? '…' : set.state ? `${(100 * res.open).toFixed(1)}%` : even;
    g.fillText(t, p.x + 14, p.y + 24);
    const w = g.measureText(t).width;
    g.font = '500 13px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT;
    const soft = set.state ? `open, set ${(100 * set.truth).toFixed(1)}%,` : res && !busy ? `even count, ${fmt(res.rmsd, 2)} Å from real` : 'even count';
    g.fillText(soft, p.x + 20 + w, p.y + 23);
    if (set.state && res && !busy) { const at = p.x + 24 + w + g.measureText(soft).width; g.font = '700 13px "Ysabeau Office", sans-serif'; g.fillStyle = res.count >= FAIR ? TEAL : MAG; g.fillText(`even ${even}`, at, p.y + 23); }
    g.textAlign = 'right'; g.font = '700 13.5px "Ysabeau Office", sans-serif'; g.fillStyle = `rgb(${INK})`; g.fillText(`${this.calls()} calls`, p.x + p.w - 14, p.y + 22);
    this.drawBars(g, G);
    const a = X(0), z = X(SLOTS - 1) + 14;
    g.strokeStyle = `rgba(${INK}, .3)`; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(a, y); g.lineTo(z, y); g.stroke();
    if (this.help && this.heat.length) {
      const top = Math.max(...this.heat, 1e-6), s = this.stops;
      for (let k = 0; k + 1 < s.length; k += 1) {
        const v = (this.heat[k] ?? 0) / top, u = X(s[k].slot), e = X(s[k + 1].slot);
        g.strokeStyle = `rgba(194, 24, 91, ${0.08 + 0.82 * v})`; g.lineWidth = 6; g.lineCap = 'butt'; g.beginPath(); g.moveTo(u, y); g.lineTo(e, y); g.stroke();
      }
    }
    g.font = '500 12px "Ysabeau Office", sans-serif'; g.textAlign = 'center'; g.fillStyle = SOFT;
    for (const v of [1000, 100, 10, 1]) { const q = X((SLOTS - 1) * (Math.log(SMAX / v) / Math.log(SMAX / SMIN))); g.textAlign = v === SMAX ? 'left' : 'center'; g.fillText(v === SMAX ? `σ ${v} Å` : v, v === SMAX ? p.x + 10 : q, y + 30); g.fillRect(q - 0.5, y + 12, 1, 5); }
    g.textAlign = 'center'; g.fillStyle = `rgb(${INK})`; g.font = '700 12px "Ysabeau Office", sans-serif'; g.fillText('0', z + 8, y + 4);
    this.stops.forEach((q, i) => {
      const u = X(q.slot), now = this.at === i, r = (q.slot === 0 ? 8 : 10.5) * (now ? 1.32 : 1) * (this.lit === q ? 1.14 : 1), out = this.drag?.pin === q && this.drag.out;
      g.globalAlpha = out ? 0.35 : 1;
      if (q.second) { g.strokeStyle = TEAL; g.lineWidth = 3; g.beginPath(); g.arc(u, y, r + 4, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = q.slot === 0 ? '#fbfbf8' : `rgb(${INK})`; g.strokeStyle = `rgb(${INK})`; g.lineWidth = 2;
      g.beginPath(); g.arc(u, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      if (q.slot > 0) { g.fillStyle = '#fbfbf8'; g.beginPath(); g.moveTo(u, y - 4.2); g.bezierCurveTo(u + 3.6, y + 0.2, u + 3, y + 3.6, u, y + 3.6); g.bezierCurveTo(u - 3, y + 3.6, u - 3.6, y + 0.2, u, y - 4.2); g.fill(); }
      g.globalAlpha = 1;
    });
    if (this.tray) {
      const n = this.spare() - (this.carry ? 1 : 0);
      g.font = '500 12.5px "Ysabeau Office", sans-serif'; g.textAlign = 'left'; g.fillStyle = SOFT; g.fillText('spare', p.x + 4, G.tray + 4);
      for (let i = 0; i < n; i += 1) this.chip(g, this.spareX(i), G.tray, this.lit === 'spare');
      if (this.carry) {
        const q = this.carry;
        if (q.to === 'new') { g.strokeStyle = TEAL; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(X(q.slot), y, 10, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); } else if (q.to) { g.strokeStyle = TEAL; g.lineWidth = 3; g.beginPath(); g.arc(X(q.to.slot), y, 15, 0, Math.PI * 2); g.stroke(); }
        this.chip(g, q.x, q.y - 26, true);
      }
    }
    if (res && !busy) {
      const ok = set.state ? Math.abs(res.open - set.truth) <= BAND : res.count >= EVEN;
      g.strokeStyle = ok ? TEAL : MAG; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x + 14, p.y + 28); g.lineTo(p.x + 14 + w, p.y + 28); g.stroke();
    }
    g.restore();
  }

  chip(g, x, y, lit) {
    g.fillStyle = TEAL; g.strokeStyle = '#fbfbf8'; g.lineWidth = 2;
    const r = lit ? 12.5 : 11;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fbfbf8'; g.beginPath(); g.moveTo(x, y - 5); g.bezierCurveTo(x + 4.2, y + 0.3, x + 3.6, y + 4.3, x, y + 4.3); g.bezierCurveTo(x - 3.6, y + 4.3, x - 4.2, y + 0.3, x, y - 5); g.fill();
  }

  // What the hand shows next: a blur comes first, then the spare calls, then the coldest stop.
  nextHint() { return this.spare() > 0 && this.res && this.res.rmsd <= (this.set.state ? BLUR : CRISP) ? this.spareHint() : this.hint(); }

  // A blur needs a lower last stop. After that, the hand takes the coldest stop into the reddest jump.
  hint() {
    const s = this.stops, heat = this.heat, last = s[s.length - 1], wide = (k) => s[k + 1].slot - s[k].slot > 1;
    let from = last, to = Math.min(SLOTS - 1, Math.max(last.slot + 4, 20));
    if (this.res && this.res.rmsd <= (this.set.state ? BLUR : CRISP) && heat.length) {
      const hot = heat.map((h, k) => k).filter(wide).sort((a, b) => heat[b] - heat[a])[0], warm = (k) => (heat[k - 1] ?? 0) + (heat[k] ?? 0);
      const cold = s.map((p, k) => k).filter((k) => k > 0 && k !== hot && k !== hot + 1).sort((a, b) => warm(a) - warm(b))[0];
      if (hot !== undefined && cold !== undefined) { from = s[cold]; to = Math.round((s[hot].slot + s[hot + 1].slot) / 2); }
    }
    return { from: () => { const G = this.geo(); return { x: G.X(from.slot), y: G.y }; }, to: () => { const G = this.geo(); return { x: G.X(to), y: G.y }; } };
  }

  // Level 2 follows the red: a wide jump gets a stop inside it, and a narrow one a second look. Level 3 shows no red, so the hand walks toward one worked
  // ladder, starting at the jump that crosses 120 Å. A look higher up changes nothing, because the guess is still the mean there.
  spareHint() {
    const s = this.stops, h = this.heat;
    let to = null;
    if (this.help) {
      for (const k of h.map((v, q) => q).sort((a, b) => h[b] - h[a])) {
        if (s[k + 1].slot - s[k].slot > 3) { to = Math.round((s[k].slot + s[k + 1].slot) / 2); break; }
        if (!s[k].second) { to = s[k].slot; break; }
      }
    } else to = ANSWER.slots.find((q) => !s.some((p) => p.slot === q)) ?? ANSWER.looks.find((q) => s.some((p) => p.slot === q && !p.second)) ?? null;
    return { from: () => { const G = this.geo(); return { x: this.spareX(0), y: G.tray }; }, to: () => { const G = this.geo(); return { x: G.X(to ?? s[0].slot), y: G.y }; } };
  }
}

function hits(res, set) { return Math.abs(res.open - set.truth) <= BAND && res.rmsd <= BLUR && res.count >= FAIR; }

function start(L, set, slots, budget, gamma, help, panel, T) {
  L.use(set);
  L.place$(slots); L.budget = budget; L.tray = budget > slots.length; L.gamma = gamma; L.help = help; L.locked = false; L.res = null; L.heat = []; L.want = null; L.shown = null;
  T.setPanel(panel);
}

async function level1(run) {
  const { L, T } = run.state, { ui, sound } = run;
  run.level(GOALS[0], TAGS);
  start(L, L.ubiquitin(), FIRST, BUDGET[0], 0, true, 132, T);
  await run.until((done) => {
    run.scoped(L.bind());
    run.scoped(run.idle(() => L.nextHint()));
    let first = true;
    L.onResult = (r) => {
      if (r.rmsd <= CRISP && r.count >= EVEN) { L.locked = true; T.flash(true); done(); return; }
      const was = first;
      first = false;
      if (!was) { T.flash(false); sound.soft(); }
      ui.feedback(r.rmsd > CRISP ? BLURRED : 'Real conformers, wrong frequencies. Split the red jump.', was ? '' : 'bad');
    };
    L.go();
  });
  await run.won('Real conformers, at even rates.', 1);
}

async function level2(run) {
  const { L, T } = run.state, { ui, sound } = run, set = L.kinase();
  run.level(GOALS[1], TAGS);
  start(L, set, SECOND, BUDGET[1], 0, true, 176, T);
  await run.until((done) => {
    run.scoped(L.bind());
    run.scoped(run.idle(() => L.nextHint()));
    let first = true;
    L.onResult = (r) => {
      if (hits(r, set)) { L.locked = true; T.flash(true); done(); return; }
      const looks = L.stops.filter((p) => p.second).length, was = first;
      first = false;
      if (!was) { T.flash(false); sound.soft(); }
      ui.feedback(r.rmsd > BLUR ? BLURRED : L.spare() > 0 ? 'Spend calls on the red jumps.' : looks === 0 ? 'Second looks save calls.' : MOVE, was ? '' : 'bad');
    };
    L.go();
  });
  await run.won(`${(100 * L.res.open).toFixed(1)}% open, even count ${(Math.floor(L.res.count * 10) / 10).toFixed(1)}.`, 2);
}

async function level3(run) {
  const { L, T } = run.state, { ui, sound } = run, set = L.kinase();
  run.level(GOALS[2], [...TAGS, 'paper']);
  // Few stops again, because from a full ladder a few lucky drags would be enough. Adding stops climbs a little and stalls, and then second looks do the rest.
  start(L, set, THIRD, BUDGET[2], NOISE, false, 176, T);
  await run.until((done) => {
    run.scoped(L.bind());
    run.scoped(run.idle(() => L.nextHint()));
    let first = true;
    L.onResult = (r) => {
      if (hits(r, set)) { L.locked = true; T.flash(true); done(); return; }
      if (!first) { T.flash(false); sound.soft(); }
      const looks = L.stops.filter((p) => p.second).length;
      ui.feedback(r.rmsd > BLUR ? BLURRED : looks === 0 ? 'Stops alone stall. Use second looks.' : MOVE, first ? '' : 'bad');
      first = false;
    };
    L.go();
  });
  await run.won(`${(100 * L.res.open).toFixed(1)}% open, even count ${(Math.floor(L.res.count * 10) / 10).toFixed(1)}.`, 3, 2600);
}
