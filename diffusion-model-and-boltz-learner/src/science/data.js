// Turns the packed data back into arrays.
import { BUNDLE } from '../data/bundle.js';

const bytes = (s) => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i += 1) a[i] = b.charCodeAt(i); return a; };
export const int16 = (s) => { const u = bytes(s); return new Int16Array(u.buffer, 0, u.length >> 1); };
const float32 = (s) => { const u = bytes(s); return new Float32Array(u.buffer, 0, u.length >> 2); };
const cache = {};
const once = (k, f) => (cache[k] ??= f());
export const AA = 'ARNDCQEGHILKMFPSTWYV';

// All packed residues: x is phi, y is psi with the map cut at psi = -100, in degrees.
export const allRama = () => once('rama', () => {
  const r = BUNDLE.rama, X = int16(r.x), Y = int16(r.y), code = bytes(r.aa), n = r.n, x = new Float32Array(n), y = new Float32Array(n), aa = [], general = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) { x[i] = X[i] / 10; y[i] = Y[i] / 10; general[i] = code[i] < 32 ? 1 : 0; aa.push(AA[code[i] & 31]); }
  return { x, y, aa, general, n, meta: r };
});

// The "general" residues (no Gly, no Pro, nothing before Pro), split into a training set and a held-out set that nothing ever trains on.
export const rama = () => once('general', () => {
  const r = allRama(), idx = [];
  for (let i = 0; i < r.n; i += 1) if (r.general[i]) idx.push(i);
  const cut = Math.floor(idx.length * 0.8), tr = idx.slice(0, cut), te = idx.slice(cut);
  const take = (l) => ({ x: Float32Array.from(l, (i) => r.x[i]), y: Float32Array.from(l, (i) => r.y[i]), aa: l.map((i) => r.aa[i]) });
  return { train: take(tr), test: take(te) };
});

export const byAA = (letter) => once(`aa${letter}`, () => {
  const r = allRama(), l = [];
  for (let i = 0; i < r.n; i += 1) if (r.aa[i] === letter && (r.general[i] || letter === 'G' || letter === 'P')) l.push(i);
  return { x: Float32Array.from(l, (i) => r.x[i]), y: Float32Array.from(l, (i) => r.y[i]) };
});

export const ubiquitin = () => once('ubq', () => {
  const u = BUNDLE.ubq, c = int16(u.xyz), n = u.n, M = u.models, models = [];
  for (let m = 0; m < M; m += 1) { const a = new Float64Array(n * 3); for (let i = 0; i < n * 3; i += 1) a[i] = c[m * n * 3 + i] / 100; models.push(a); }
  return { n, models, res: bytes(u.res), role: bytes(u.role) };
});

export const adk = () => once('adk', () => {
  const u = BUNDLE.adk, c = int16(u.xyz), n = u.res, models = [];
  for (let m = 0; m < u.models; m += 1) { const a = new Float64Array(n * 3); for (let i = 0; i < n * 3; i += 1) a[i] = c[m * n * 3 + i] / 100; models.push(a); }
  return { n, models, state: u.state, nuc: u.nuc, ids: u.ids, counts: u.counts };
});

export const boltzRun = () => once('boltz', () => {
  const b = BUNDLE.boltz, L = b.L, den = int16(b.den), noi = int16(b.noi), frames = [];
  for (let k = 0; k < b.frames; k += 1) {
    const d = new Float64Array(L * 3), n = new Float64Array(L * 3);
    for (let i = 0; i < L * 3; i += 1) { d[i] = den[k * L * 3 + i] / 100; n[i] = noi[k * L * 3 + i] / b.noisyScale[k]; }
    frames.push({ sigma: b.sigma[k], denoised: d, noisy: n });
  }
  const finals = {};
  for (const name of b.names) { const a = int16(b.finals[name]), f = new Float64Array(L * 3); for (let i = 0; i < L * 3; i += 1) f[i] = a[i] / 100; finals[name] = f; }
  return { L, frames, finals, names: b.names, plddt: bytes(b.plddt), confidence: b.confidence, complexPlddt: b.complexPlddt, ptm: b.ptm, hand: b.hand };
});

export const mdRun = () => once('md', () => {
  const m = BUNDLE.md;
  if (!m) return null;
  const X = int16(m.x), Y = int16(m.y), x = new Float32Array(m.n), y = new Float32Array(m.n);
  for (let i = 0; i < m.n; i += 1) { x[i] = X[i] / 10; y[i] = Y[i] / 10; }
  return { x, y, n: m.n, frames: m.frames, runs: m.runs, hist: float32(m.hist), grid: m.grid, ess: m.ess, distinct: m.distinct, pop: m.pop, perRun: m.perRun, se: m.se, seBlocks: m.seBlocks };
});
