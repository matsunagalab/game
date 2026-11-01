// Chapter 4. Run it backward, on real proteins. Atoms condense out of a cloud through the stops the player sets on the noise ruler, on the exact field
// of real structures. One fold forgives almost any ladder. A rare state does not. Level 2 spends spare calls, and level 3 adds fresh noise.
import { adk, ubiquitin } from '../science/data.js';
import { Aligned } from '../science/cart.js';
import { bondError, bondLengths } from '../science/blur.js';
import { ladderStep } from '../science/sampler.js';
import { rareSet, slotSigma, STOPS } from '../science/levels.js';
import { bondsOf, Bundle, chainBonds, chainInk } from '../mol.js';
import { Board, fmt, plate, sigmaLevel } from './common.js';
import { PIGMENT } from '../world.js';
import { makeRng } from '../science/rng.js';

const { smax: SMAX, smin: SMIN, slots: SLOTS, seed: SEED, noise: NOISE, shown: SHOWN, samples: SAMPLES, crisp: CRISP, band: BAND, blur: BLUR, first: FIRST, second: SECOND, thirdFirst: THIRD, budget: BUDGET } = STOPS;
const INK = '29, 33, 65', TEAL = '#0d8a8f', MAG = '#c2185b', SOFT = '#565c7c';
const GOALS = ['Slide the stops until a real structure lands.', `${BUDGET[1]} calls. Keep the rare open chains.`, `Boltz-2's fresh noise before each step. ${BUDGET[2]} calls.`];
const TAGS = ['real', 'game', 'model'];

export default {
  id: 'sampler',
  puzzle: true,
  place: [1, 2],
  title: 'Run it backward',
  tease: 'Place the stops of a sampler, and bring real proteins out of a cloud of noise.',
  principle: 'A sampler steps from pure noise toward the denoiser\'s guess at each stop. One fold forgave almost any stops, but a rare state survived only where you spent calls.',
  goals: GOALS,
  note: `<h3>Chapter note</h3>
    <p><b>Your moves and the real thing.</b> A sampler's noise schedule is a list of stops along σ, and each stop you place is one real denoiser call. The sampler steps toward the denoiser's guess at each stop. A second look is Heun's correction: a second denoiser call at the end of the step, then the average of the two slopes. Real samplers usually use one rule for all steps. Mixing them step by step, as you can here, is sound mathematics but is this game's own move. You choose the stops by hand here, and real schedules are fixed formulas.</p>
    <p><b>The field.</b> The exact denoiser of real structures held in one frame, Karras et al. 2022, Eq. 57, with no rotation. That is why it carries the Teaching model tag. The best-rotation denoiser of chapters 6 and 7 is not used here, because it bends the shares of states. Noise outside the span of the structures cannot change the weights, so a run works exactly on a few numbers, 38 for ubiquitin and 16 for the kinase set, which lets a phone run thousands of chains. The chains on the board are real members of the run. Their noise outside the span is drawn to the right size for each stop, which is exact in distribution.</p>
    <p><b>This is not folding.</b> Steps of a sampler are iterations of an algorithm. They are not a pathway, and they are not molecular dynamics time. Nothing about the order of the stops says how a protein moves.</p>
    <p><b>Level 1.</b> Ubiquitin, 39 conformers of PDB 2K39, 601 heavy atoms. You might expect crumpled structures from few or badly placed stops. The data say otherwise: with an exact field over one fold, almost any ladder lands exactly on a stored conformer, 0.00 Å away, even with two stops. Euler steps toward a guess that hardly changes, and the last jump lands on the guess. Only a last stop at high noise does harm: the guess is then a blur of all conformers, about 1 Å from any of them, with bonds off by a few tenths of an Å and twice the clashes. The bad bonds show red. A real network is not a list of 39 structures, so it can fail in other ways, and this level says nothing about those.</p>
    <p><b>Levels 2 and 3.</b> Seventeen real C-alpha chains of adenylate kinase, 2 open and 15 closed, so the exact target is 11.8% open. Those counts are what we chose to put in the set, not populations of the enzyme. A state counts as reached if the nearest chain is in it, and the target is within 1.5 points. Coarse ladders lose the rare state: a long jump carries a chain past the noise range where it would have chosen, near 45 to 57 Å on this set, where the two states lie about 120 Å apart. With 5 calls, the best stops we found with Euler alone give about 8 to 9%, and even 25 Euler stops give 10%. A stop in that range and a second look on the long first jump give about 11.5%. Under level 3's noise those ladders fall to 7 to 8.5%, Euler with 7 calls gives about 8.6%, and three second looks give about 11%. Noise starts every jump higher, which is the likely reason, though we did not test it apart from other causes. Level 3 starts again from high stops, because from a good ladder one lucky drag would be enough. All these are results on this set and one seed, not a law. Pigment shows each chain's current guess, so colour appears only as it decides. Rare chains are drawn darker, because they lie alone where the closed chains lie on top of each other, so read the shares from the number and not from the depth of the ink.</p>
    <p><b>Samplers.</b> Euler steps along the probability-flow ODE, dx/dσ = (x − D(x; σ))/σ. Heun, Algorithm 1 of Karras et al. 2022, corrects each step with a second denoiser call, except the last step into σ = 0, which has none. In level 3, as in their Algorithm 2, fresh noise lifts each point from σ to σ(1 + γ) before the step, except on the last step. γ is ${NOISE}, Boltz-2's γ₀, which is above their cap of √2 − 1. It comes with a plain step here, so this level shows noise on a ladder and is not Boltz's sampler.</p>
    <p><b>Determinism.</b> All runs here start from one fixed seed, so the same stops give the same picture. With no fresh noise, the starting noise alone decides where each chain lands. With fresh noise each chain's fate is open.</p>
    <p><b>In Boltz.</b> Boltz and AlphaFold3 use a stochastic first-order sampler, not Heun: one denoiser call per step, 200 steps by default, with noise added before each step only while σ stays above γ_min, 1 Å in Boltz-2. Its numbers come in chapter 9. In Boltz-1's own ablation (Table 1), mean LDDT of the top sample went 0.693, 0.710, 0.716 for 20, 50 and 200 steps, on 5 samples per target, and they report a plateau beyond 50 steps. That fits level 1: a strongly conditioned network, like one fold, forgives the ladder.</p>
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
    return (this.ubq = this.prepare({ F, n, bonds, K: 1, N: 64, bundle, atomInk, span: 42, ref: bondLengths(U.models[0], bonds), strain: new Float32Array(bonds.length) }));
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
    return { p, L, R, y: p.y + 48, tray: p.y + 104, X: (slot) => L + ((R - L) * slot) / (SLOTS - 1) };
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

  // The chains on the board, in all their coordinates, at noise s.
  show(set, s, into) {
    const { F, K, c, xi, full } = set, { P, dim } = F;
    for (let j = 0; j < K; j += 1) {
      F.expand(c.subarray(j * P, (j + 1) * P), s, xi.subarray(j * dim, (j + 1) * dim), full);
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
    const per = Math.min(1900, 240 * ladder.length + 300) / ladder.length, H = Math.min(64, N);
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
        this.heat[k] = k === 0 ? 0 : Math.sqrt(m / H);
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
    for (let i = 0; i < N; i += 1) { const q = F.nearest(c, i * P); rm += q.rmsd; if (set.state && set.state[q.m] === 0) up += 1; }
    const res = { rmsd: rm / N, open: up / N, calls: this.calls() };
    if (set.ref) res.bond = bondError(X, set.bonds, set.ref, 0, set.strain, 0.1);
    this.res = res;
    this.onResult?.(res);
  }

  frame(dt) {
    const set = this.set;
    if (!set) return;
    if (!this.run.world.reduce) set.bundle.turn(dt * 0.1, 0);
    set.bundle.draw(set.X, { atomInk: set.atomInk, chainInk: set.chainInk, chainMass: set.chainMass, strain: set.strain && this.at < 0 ? set.strain : null, sigma: Math.min(30, this.sigma), origin: set.F.origin, mass: this.sigma > 3 ? 1.6 : 1 });
  }

  draw(g) {
    const { T } = this, G = this.geo(), { p, X, y } = G, set = this.set, res = this.res, b = T.box;
    if (!set) return;
    g.save();
    g.font = '500 12.5px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText('Noise being removed, not folding', b.x + b.w / 2, b.y + 13);
    plate(g, p);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = '400 24px "Instrument Serif", serif'; g.fillStyle = `rgb(${INK})`;
    const busy = this.at >= 0, t = busy || !res ? '…' : set.state ? `${(100 * res.open).toFixed(1)}%` : `${fmt(res.rmsd, 2)} Å`;
    g.fillText(t, p.x + 14, p.y + 24);
    const w = g.measureText(t).width;
    g.font = '500 13px "Ysabeau Office", sans-serif'; g.fillStyle = SOFT;
    g.fillText(set.state ? `open, true ${(100 * set.truth).toFixed(1)}%` : 'from a real conformer', p.x + 20 + w, p.y + 23);
    g.textAlign = 'right'; g.font = '700 13.5px "Ysabeau Office", sans-serif'; g.fillStyle = `rgb(${INK})`; g.fillText(`${this.calls()} denoiser calls`, p.x + p.w - 14, p.y + 22);
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
    for (const v of [200, 50, 10, 3, 1]) { const q = X((SLOTS - 1) * (Math.log(SMAX / v) / Math.log(SMAX / SMIN))); g.fillText(v === SMAX ? `σ ${v} Å` : v, q, y + 30); g.fillRect(q - 0.5, y + 12, 1, 5); }
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
    if (set.state && res && !busy) {
      const ok = Math.abs(res.open - set.truth) <= BAND;
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

  hint() {
    const q = this.stops[this.stops.length - 1];
    return { from: () => { const G = this.geo(); return { x: G.X(q.slot), y: G.y }; }, to: () => { const G = this.geo(); return { x: G.X(Math.min(SLOTS - 1, q.slot + 6)), y: G.y }; } };
  }

  spareHint() {
    return { from: () => { const G = this.geo(); return { x: this.spareX(0), y: G.tray }; }, to: () => { const G = this.geo(); return { x: G.X(this.stops[1].slot), y: G.y }; } };
  }
}

function hits(res, set) { return Math.abs(res.open - set.truth) <= BAND && res.rmsd <= BLUR; }

function start(L, set, slots, budget, gamma, help, panel, T) {
  L.use(set);
  L.place$(slots); L.budget = budget; L.tray = budget > slots.length; L.gamma = gamma; L.help = help; L.locked = false; L.res = null; L.heat = [];
  T.setPanel(panel);
}

async function level1(run) {
  const { L, T } = run.state, { ui, sound } = run;
  run.level(GOALS[0], TAGS);
  start(L, L.ubiquitin(), FIRST, BUDGET[0], 0, true, 100, T);
  await run.until((done) => {
    run.scoped(L.bind());
    run.scoped(run.idle(() => L.hint()));
    let first = true;
    L.onResult = (r) => {
      if (r.rmsd <= CRISP) { L.locked = true; T.flash(true); done(); return; }
      const was = first;
      first = false;
      if (!was) { T.flash(false); sound.soft(); }
      ui.feedback('Last jump too long: a blur of conformers.', was ? '' : 'bad');
    };
    L.go();
  });
  await run.won('A real conformer, bonds right.', 1);
}

async function level2(run) {
  const { L, T } = run.state, { ui, sound } = run, set = L.kinase();
  run.level(GOALS[1], TAGS);
  start(L, set, SECOND, BUDGET[1], 0, true, 150, T);
  await run.until((done) => {
    run.scoped(L.bind());
    run.scoped(run.idle(() => (L.spare() > 0 ? L.spareHint() : L.hint())));
    let first = true;
    L.onResult = (r) => {
      if (hits(r, set)) { L.locked = true; T.flash(true); done(); return; }
      const looks = L.stops.filter((p) => p.second).length, was = first;
      first = false;
      if (!was) { T.flash(false); sound.soft(); }
      ui.feedback(r.rmsd > BLUR ? 'Last jump too long: a half-open blur.' : L.spare() > 0 ? 'Drag spare calls onto the ruler.' : looks === 0 ? 'Plain stops lose open chains.' : 'Open chains thinned. Move a stop.', was ? '' : 'bad');
    };
    L.go();
  });
  await run.won(`${(100 * L.res.open).toFixed(1)}% open on ${L.calls()} calls.`, 2);
}

async function level3(run) {
  const { L, T } = run.state, { ui, sound } = run, set = L.kinase();
  run.level(GOALS[2], [...TAGS, 'paper']);
  // It starts over, because from a good ladder one lucky drag would be enough. The stops that worked in level 2 now fail, which is the lesson.
  start(L, set, THIRD, BUDGET[2], NOISE, false, 150, T);
  await run.until((done) => {
    run.scoped(L.bind());
    run.scoped(run.idle(() => (L.spare() > 0 ? L.spareHint() : L.hint())));
    let first = true;
    L.onResult = (r) => {
      if (hits(r, set)) { L.locked = true; T.flash(true); done(); return; }
      if (!first) { T.flash(false); sound.soft(); }
      ui.feedback('Fresh noise starts every jump higher.', first ? '' : 'bad');
      first = false;
    };
    L.go();
  });
  await run.won(`${(100 * L.res.open).toFixed(1)}% open on ${L.calls()} calls.`, 3, 2600);
}
