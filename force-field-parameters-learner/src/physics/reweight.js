// What a force-field developer really has: finite runs, stored as samples.
// Every sample is tallied by the six integers of the energy, so it can be re-scored at new parameters at once.
// Reweighting is real MBAR (Shirts & Chodera 2008): it needs the energies of the stored samples at the new parameters,
// and overlap between the old and new ensembles. The sum-of-terms form only makes the re-scoring cheap.
import { R, classify, UNFOLDED, FoldMC, NATIVE_F, KNOBS, FOLD_E, STOCK_P, TRUE_P, CORE, stats, meltingT } from './fold.js';
import { E0, EW, SPACING } from './chain.js';

const CAP = 60000;
export const SAMPLE_EVERY = 40, BLOCKS = 6;
export const TRAPPED_HOPS = 40;      // a run with fewer state changes than this has not crossed its barriers

// One simulation: a walker, its stored tallies, and its history of states.
export class Run {
  constructor(p, { T = 300, steps = 160000, start = NATIVE_F, rand = Math.random } = {}) {
    this.p = { ...p }; this.T = T; this.total = steps;
    this.mc = new FoldMC(this.p, T, rand, start);
    this.done = 0;
    // Blocks have a fixed length in time, so a run that is extended gets new blocks, never mixed ones.
    this.blockLen = steps / BLOCKS;
    this.hist = [];
    this.count = [0, 0, 0, 0, 0];
    this.entries = [0, 0, 0, 0, 0];     // separate arrivals at a state, not counting where the run started
    this.first = [null, null, null, null, null];     // the first conformation seen in each state
    this.last = this.mc.state(); this.stable = this.last; this.cand = -1; this.hold = 0;
    this.seen = [false, false, false, false, false]; this.seen[this.last] = true;
    this.grab(this.last);
    this.trace = [];
    this.fresh = [];
  }
  grab(s) {
    const m = this.mc;
    this.first[s] = { x: Array.from(m.x), y: Array.from(m.y), z: Array.from(m.z), wet: m.wetSites() };
  }
  get finished() { return this.done >= this.total; }
  advance(n) {
    const m = this.mc, end = Math.min(this.total, this.done + n);
    while (this.done < end) {
      m.step(); this.done++;
      if (this.done % SAMPLE_EVERY) continue;
      const s = m.state(), b = (this.done - 1) / this.blockLen | 0, k = m.key();
      const h = this.hist[b] ??= new Map(), e = h.get(k);
      if (e) { e[0]++; e[1] += m.rg2(); } else h.set(k, [1, m.rg2()]);
      this.count[s]++;
      if (!this.seen[s]) { this.seen[s] = true; this.grab(s); this.fresh.push(s); }
      this.visit(s);
      this.trace.push(s);
    }
  }
  // An arrival: the chain must stay in one new state for three samples in a row. Anything less is flicker on a boundary.
  visit(s) {
    if (s === this.stable) { this.hold = 0; this.cand = -1; }
    else if (s !== this.cand) { this.cand = s; this.hold = 1; }
    else if (++this.hold >= 3) { this.stable = s; this.entries[s]++; this.hold = 0; this.cand = -1; }
  }
  // Separate arrivals at any state. This, not the step count, says how much the run has crossed.
  get hops() { return this.entries.reduce((a, b) => a + b, 0); }
  get samples() { return this.count.reduce((a, b) => a + b, 0); }
  fractions() { const n = this.samples || 1; return this.count.map(c => c / n); }
}

const logsum = (a, n) => { let m = -Infinity; for (let i = 0; i < n; i++) if (a[i] > m) m = a[i]; let s = 0; for (let i = 0; i < n; i++) s += Math.exp(a[i] - m); return m + Math.log(s); };

export class Store {
  constructor() {
    this.index = new Map(); this.K = 0;
    const I = n => new Int8Array(n), F = n => new Float64Array(n);
    this.C = I(CAP); this.QN = I(CAP); this.QA = I(CAP); this.D = I(CAP); this.EL = I(CAP); this.W = I(CAP); this.ST = I(CAP);
    this.N = F(CAP); this.RG = F(CAP); this.lnD = F(CAP); this.wt = F(CAP);
    this.runs = []; this.blocks = []; this.f = [];
    this.seen = [false, false, false, false, false];
  }
  energyAt(k, p) {
    const a = p.E * E0 - 2 * p.gamma * EW, n = p.E * FOLD_E.EN, b = p.E * FOLD_E.EA, e = p.q * p.q * FOLD_E.EE;
    return -a * this.C[k] - n * this.QN[k] - b * this.QA[k] - p.k * this.D[k] - e * this.EL[k] - p.w * this.W[k];
  }
  idx(key) {
    let i = this.index.get(key);
    if (i !== undefined) return i;
    i = this.K++;
    if (i >= CAP) throw new Error('sample store full');
    this.index.set(key, i);
    const c = key & 15, qn = key >> 4 & 15, qa = key >> 8 & 15, d = (key >> 12 & 31) - 16, e = key >> 17 & 7, w = key >> 20 & 7;
    this.C[i] = c; this.QN[i] = qn; this.QA[i] = qa; this.D[i] = d; this.EL[i] = e; this.W[i] = w; this.ST[i] = classify(c, qn, qa, w);
    return i;
  }
  add(run) {
    const entry = { p: run.p, T: run.T, n: 0, u: null, hops: run.hops, trapped: run.hops < TRAPPED_HOPS };
    const r = this.runs.length;
    for (const h of run.hist) {
      if (!h?.size) continue;
      const ki = new Int32Array(h.size), cnt = new Float64Array(h.size);
      let j = 0, z = 0;
      for (const [key, [c, r]] of h) { const i = this.idx(key); this.N[i] += c; this.RG[i] += r; ki[j] = i; cnt[j] = c; j++; z += c; }
      this.blocks.push({ ki, cnt, n: j, z, run: r });
      entry.n += z;
    }
    this.runs.push(entry);
    run.seen.forEach((v, i) => { if (v) this.seen[i] = true; });
    this.solve();
  }
  // The MBAR self-consistent equations for the free energy of each run.
  solve() {
    const { K, runs } = this, Rn = runs.length;
    for (const r of runs) {
      r.u = new Float64Array(K);
      const kT = R * r.T;
      for (let k = 0; k < K; k++) r.u[k] = this.energyAt(k, r.p) / kT;
    }
    const f = new Float64Array(Rn), tmp = new Float64Array(Rn), ln = runs.map(r => Math.log(r.n));
    const { N, lnD } = this;
    for (let it = 0; it < 400; it++) {
      for (let k = 0; k < K; k++) {
        if (N[k] === 0) { lnD[k] = 0; continue; }
        for (let r = 0; r < Rn; r++) tmp[r] = ln[r] + f[r] - runs[r].u[k];
        lnD[k] = logsum(tmp, Rn);
      }
      let delta = 0;
      const nf = new Float64Array(Rn);
      for (let r = 0; r < Rn; r++) {
        let m = -Infinity, s = 0;
        const u = runs[r].u;
        for (let k = 0; k < K; k++) { const l = Math.log(N[k]) - u[k] - lnD[k]; if (l > m) m = l; }
        for (let k = 0; k < K; k++) s += Math.exp(Math.log(N[k]) - u[k] - lnD[k] - m);
        nf[r] = -(m + Math.log(s));
      }
      for (let r = 1; r < Rn; r++) delta = Math.max(delta, Math.abs(nf[r] - nf[0] - (f[r] - f[0])));
      for (let r = 0; r < Rn; r++) f[r] = nf[r] - nf[0];
      if (delta < 1e-5) break;
    }
    for (let k = 0; k < K; k++) {
      if (N[k] === 0) continue;
      for (let r = 0; r < Rn; r++) tmp[r] = ln[r] + f[r] - runs[r].u[k];
      lnD[k] = logsum(tmp, Rn);
    }
    this.f = Array.from(f);
  }
  // Reweighted prediction at new parameters. `errors` adds a block jackknife, which costs one pass over the stored blocks.
  predict(p, { T = 300, errors = true } = {}) {
    const { K, N, lnD, wt, ST, RG } = this, kT = R * T;
    const pop = [0, 0, 0, 0, 0];
    let m = -Infinity;
    for (let k = 0; k < K; k++) { const l = -this.energyAt(k, p) / kT - lnD[k]; wt[k] = l; if (l > m) m = l; }
    let s1 = 0, s2 = 0, rgw = 0, rgn = 0;
    for (let k = 0; k < K; k++) {
      const w = Math.exp(wt[k] - m); wt[k] = w;
      const c = N[k] * w;
      s1 += c; s2 += N[k] * w * w; pop[ST[k]] += c;
      if (ST[k] === UNFOLDED) { rgw += w * RG[k]; rgn += c; }
    }
    const samples = this.runs.reduce((a, r) => a + r.n, 0);
    const out = { p: pop.map(v => v / s1), neff: s1 * s1 / s2, samples, rg: rgn > 0 ? Math.sqrt(rgw / rgn) * SPACING : null, seen: this.seen.slice(), err: [0, 0, 0, 0, 0] };
    if (errors) {
      // A block jackknife with the weights held fixed. It ignores the error in the run free energies, and in tests
      // it runs about twice too wide. It also cannot see what a trapped run never reached: see `trapped` below.
      const B = this.blocks.length, v = [0, 0, 0, 0, 0], a = [0, 0, 0, 0, 0];
      let stuck = 0;
      for (const b of this.blocks) {
        a.fill(0);
        let z = 0;
        for (let j = 0; j < b.n; j++) { const k = b.ki[j], c = b.cnt[j] * wt[k]; a[ST[k]] += c; z += c; }
        for (let s = 0; s < 5; s++) { const d = (pop[s] - a[s]) / (s1 - z || 1) - out.p[s]; v[s] += d * d; }
        if (this.runs[b.run].trapped) stuck += z;
      }
      out.err = v.map(x => Math.sqrt(x * (B - 1) / B));
      out.trapped = stuck / s1;     // how much of this estimate rests on runs that never crossed
    }
    return out;
  }
}

// What the fit is allowed to see. The weights are the player's; a weight of zero leaves that data out.
// data: { p300: [5], rg, salt: [5], den: [5] }.
// Salt screens charges, so it is the same chain with q scaled. Denaturant strengthens protein-water, so γ is scaled.
export const SALT = 0.8, DENATURANT = 1.15;
const KEYS = ['E', 'gamma', 'q', 'k', 'w'], SCALE = { E: 0.1, gamma: 0.2, q: 0.25, k: 0.12, w: 0.4 };
const SIGMA_P = 0.03, SIGMA_R = 0.15;

function residuals(store, x, x0, data, W, lambda) {
  const r = [], at = o => store.predict(x, { errors: false, ...o });
  const a = at({});
  for (let i = 0; i < 5; i++) if (W.pop[i]) r.push(Math.sqrt(W.pop[i]) * (a.p[i] - data.p300[i]) / SIGMA_P);
  if (W.rg && a.rg != null) r.push(Math.sqrt(W.rg) * (a.rg - data.rg) / SIGMA_R);
  if (W.salt) { const b = store.predict({ ...x, q: x.q * SALT }, { errors: false }); for (let i = 0; i < 5; i++) r.push(Math.sqrt(W.salt) * (b.p[i] - data.salt[i]) / SIGMA_P); }
  if (W.den) { const b = store.predict({ ...x, gamma: x.gamma * DENATURANT }, { errors: false }); for (let i = 0; i < 5; i++) r.push(Math.sqrt(W.den) * (b.p[i] - data.den[i]) / SIGMA_P); }
  for (const k of KEYS) r.push(Math.sqrt(lambda) * (x[k] - x0[k]) / SCALE[k]);
  return { r, neff: a.neff };
}
const cost = r => r.reduce((s, v) => s + v * v, 0);

// A real optimisation of the reweighted estimate: Levenberg-Marquardt with numerical derivatives.
// It refuses steps that would leave the overlap of the stored samples, as a trust region does.
export function fitStep(store, start, anchor, data, weights, lambda, { neffFloor = 60, iters = 12 } = {}) {
  let x = { ...start }, mu = 1, blocked = false;
  let { r, neff } = residuals(store, x, anchor, data, weights, lambda), c = cost(r);
  const c0 = c;
  for (let it = 0; it < iters; it++) {
    const J = KEYS.map(k => {
      const d = 0.03 * SCALE[k], y = { ...x, [k]: x[k] + d };
      const rp = residuals(store, y, anchor, data, weights, lambda).r;
      return rp.map((v, i) => (v - r[i]) / d);
    });
    const n = KEYS.length, A = Array.from({ length: n }, () => new Array(n).fill(0)), g = new Array(n).fill(0);
    for (let a = 0; a < n; a++) {
      for (let i = 0; i < r.length; i++) g[a] -= J[a][i] * r[i];
      for (let b = 0; b < n; b++) for (let i = 0; i < r.length; i++) A[a][b] += J[a][i] * J[b][i];
    }
    let moved = false;
    for (let t = 0; t < 7 && !moved; t++) {
      const M = A.map((row, a) => row.map((v, b) => v + (a === b ? mu * (1 / SCALE[KEYS[a]] ** 2) : 0)));
      const dx = gauss(M, g.slice());
      const y = { ...x };
      KEYS.forEach((k, a) => { y[k] = Math.max(KNOBS[k][0], Math.min(KNOBS[k][1], x[k] + dx[a])); });
      const q = residuals(store, y, anchor, data, weights, lambda);
      if (q.neff < neffFloor) { blocked = true; mu *= 4; continue; }
      const cy = cost(q.r);
      if (cy < c) { x = y; r = q.r; c = cy; neff = q.neff; mu = Math.max(1e-3, mu / 3); moved = true; } else mu *= 4;
    }
    if (!moved) break;
  }
  return { x, neff, cost: c, start: c0, blocked };
}

function gauss(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / d; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const x = new Array(n).fill(0);
  for (let c = n - 1; c >= 0; c--) { let s = b[c]; for (let k = c + 1; k < n; k++) s -= A[c][k] * x[k]; x[c] = s / (A[c][c] || 1e-12); }
  return x;
}

// A free-energy gap in kT, with its error propagated from the populations.
export function gaps(p, err) {
  const top = Math.max(...p);
  return p.map((v, i) => (v > 0 ? { g: Math.log(top / v), e: err[i] / v } : null));
}

// The chain as a project: what the finale's Run and Fit buttons do, in one place, so the tests exercise the same choices.
export const RUN_STEPS = 800000, PULLS = { light: 0.002, medium: 0.01, heavy: 0.08 };
export const neffFloor = samples => Math.max(60, samples * 0.02);

export class Project {
  constructor(rand = Math.random) { this.store = new Store(); this.rand = rand; this.last = NATIVE_F; }
  // Each run carries on from where the last one ended.
  begin(p) { return new Run(p, { steps: RUN_STEPS, start: this.last, rand: this.rand }); }
  end(run) {
    const m = run.mc;
    this.last = Array.from({ length: m.N }, (_, i) => [m.x[i] - m.x[0], m.y[i] - m.y[0], m.z[i] - m.z[0]]);
    this.store.add(run);
  }
  run(p) { const r = this.begin(p); r.advance(Infinity); this.end(r); return r; }
  samples() { return this.store.runs.reduce((a, r) => a + r.n, 0); }
  fit(x, data, weights, lambda) { return fitStep(this.store, x, STOCK_P, data, weights, lambda, { neffFloor: neffFloor(this.samples()) }); }
}

// What the hidden parameter set gives: the data a fit may use, and the tests it never uses.
export const TOL = { pop: 3.5, mut: 4, core: 3, tm: 12 };
export const POP_ONLY = { pop: [1, 1, 1, 1, 1], rg: 0, salt: 0, den: 0 };
export function targets(T = TRUE_P) {
  const a = stats(T);
  return {
    data: { p300: a.p, rg: a.rgU, salt: stats({ ...T, q: T.q * SALT }).p, den: stats({ ...T, gamma: T.gamma * DENATURANT }).p },
    sealed: { mutant: stats({ ...T, q: 0 }).p, core: stats({ ...T, E: T.E * CORE }).p, tm: meltingT(T) },
  };
}
const worst = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i]))) * 100;
// The referee: exact census numbers for a parameter set.
export function judge(x, { data, sealed }) {
  const a = stats(x), mut = stats({ ...x, q: 0 }), core = stats({ ...x, E: x.E * CORE }), tm = meltingT(x);
  const fit = worst(a.p, data.p300), mutOff = worst(mut.p, sealed.mutant), coreOff = worst(core.p, sealed.core), dT = Math.abs(tm - sealed.tm);
  const fitOk = fit <= TOL.pop, mutOk = mutOff <= TOL.mut, coreOk = coreOff <= TOL.core, tmOk = dT <= TOL.tm;
  return { p: a.p, rg: a.rgU, fit, fitOk, mutOff, mutOk, coreOff, coreOk, tm, dT, tmOk, sealedOk: mutOk && coreOk && tmOk };
}
// How a parameter set does against each kind of fit data.
export function misses(x, { data }) {
  return { p300: worst(stats(x).p, data.p300), salt: worst(stats({ ...x, q: x.q * SALT }).p, data.salt), den: worst(stats({ ...x, gamma: x.gamma * DENATURANT }).p, data.den) };
}
