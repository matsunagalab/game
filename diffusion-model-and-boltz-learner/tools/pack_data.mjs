// Packs the raw data into src/data/bundle.js. See README for what each part is.
//   CACHE=/some/folder BOLTZ=/path/to/exercises MD=/path/to/md node tools/pack_data.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { angles, firstChain, AA } from './rama.mjs';
import { bestRotation, centre, fitRmsd, rotate, shift } from '../src/science/kabsch.js';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.CACHE, BOLTZ = process.env.BOLTZ, MD = process.env.MD;
const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
function shuffle(a, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const out = {};

// 1. Real backbone angles. psi is cut at -100, the emptiest line of the map.
const special = new Set('2K39 1D3Z 1UBQ 1XQQ 1AKE 1ANK 1E4V 1E4Y 2ECK 3HPQ 3HPR 4AKE 4X8H 4X8L 4X8M 4X8O 5EJE 6F7U 6HAM 6HAP 6RZE 6S36 7APU 8BQF 8CRG 8PVW 8Q2B 8RJ4 8RJ6 8RJ9 9L14 9R6U 9R71'.split(' '));
const files = readdirSync(join(CACHE, 'pdb')).filter((f) => !special.has(f.slice(0, 4))).sort();
let residues = [];
for (const f of files) residues.push(...angles(firstChain(join(CACHE, 'pdb', f))));
shuffle(residues, 7);
const wrapPsi = (v) => (v < -100 ? v + 360 : v);
const cutNear = residues.filter((r) => Math.abs(wrapPsi(r.psi) + 100) < 5 || Math.abs(wrapPsi(r.psi) - 260) < 5 || Math.abs(Math.abs(r.phi) - 180) < 5);
const keepPerAA = { G: 2400, P: 1400, A: 1800, V: 1400 }; // Conditioning needs enough of each kind.
const general = (r) => r.aa !== 'G' && r.aa !== 'P' && !r.prePro;
const sel = [];
let nGen = 0;
const countAA = {};
for (const r of residues) {
  const take = general(r) ? nGen < 10000 : (r.aa === 'G' || r.aa === 'P') && !r.prePro && (countAA[r.aa] ?? 0) < keepPerAA[r.aa];
  if (!take) continue;
  if (general(r)) nGen += 1;
  countAA[r.aa] = (countAA[r.aa] ?? 0) + 1;
  sel.push(r);
}
const rx = new Int16Array(sel.length), ry = new Int16Array(sel.length), raa = new Uint8Array(sel.length);
sel.forEach((r, i) => { rx[i] = Math.round(r.phi * 10); ry[i] = Math.round(wrapPsi(r.psi) * 10); raa[i] = AA.indexOf(r.aa) + (general(r) ? 0 : 32); });
out.rama = { x: b64(rx), y: b64(ry), aa: b64(raa), n: sel.length, entries: files.length, total: residues.length, general: residues.filter(general).length, nearCut: cutNear.filter(general).length };
console.log('rama', out.rama.n, 'of', out.rama.total, 'entries', out.rama.entries, 'general within 5 deg of a cut', out.rama.nearCut, 'of', out.rama.general, countAA);

// 2. Ubiquitin, 2K39: 116 solution conformers. Heavy atoms of residues 1 to 76.
function models(id) {
  const t = readFileSync(join(CACHE, 'pdb', `${id}.pdb`), 'utf8').split('\n');
  const ms = [];
  let cur = null;
  for (const l of t) {
    if (l.startsWith('MODEL')) cur = [];
    if (l.startsWith('ENDMDL')) { ms.push(cur); cur = null; }
    if (l.startsWith('ATOM  ') && cur) {
      const e = l.slice(76, 78).trim(), name = l.slice(12, 16).trim();
      if (e === 'H' || e === 'D' || name === 'OXT' || name === 'OT1' || name === 'OT2') continue;
      if (l[21] !== ' ' && l[21] !== 'A') continue;
      cur.push({ name, res: +l.slice(22, 26), rn: l.slice(17, 20), xyz: [+l.slice(30, 38), +l.slice(38, 46), +l.slice(46, 54)] });
    }
  }
  return ms;
}
{
  const ms = models('2K39');
  const nAtom = ms[0].length;
  const core = ms[0].map((a, i) => (a.res <= 70 ? i : -1)).filter((i) => i >= 0);
  const pick = (m) => { const a = new Float64Array(core.length * 3); core.forEach((i, k) => a.set(m[i].xyz, 3 * k)); return a; };
  const ref = pick(ms[0]), rc = centre(ref), rr = shift(ref, [-rc[0], -rc[1], -rc[2]], new Float64Array(ref.length));
  const keep = ms.filter((_, i) => i % 3 === 0); // 39 of the 116
  const K = keep.length, c = new Int16Array(K * nAtom * 3);
  keep.forEach((m, k) => {
    const a = pick(m), ca = centre(a), ax = shift(a, [-ca[0], -ca[1], -ca[2]], new Float64Array(a.length)), R = bestRotation(ax, rr);
    const all = new Float64Array(nAtom * 3);
    m.forEach((at, i) => all.set(at.xyz, 3 * i));
    const moved = rotate(R, shift(all, [-ca[0], -ca[1], -ca[2]], new Float64Array(all.length)));
    for (let i = 0; i < moved.length; i += 1) c[k * nAtom * 3 + i] = Math.round(moved[i] * 100);
  });
  const res = new Uint8Array(ms[0].map((a) => a.res));
  const role = new Uint8Array(ms[0].map((a) => ({ N: 1, CA: 2, C: 3, O: 4 }[a.name] ?? 0)));
  out.ubq = { xyz: b64(c), n: nAtom, models: K, res: b64(res), role: b64(role), seq: '' };
  console.log('ubiquitin atoms', nAtom, 'models', K);
}

// 3. E. coli adenylate kinase: every chain with all of residues 1 to 214, sorted by state. C-alpha only.
{
  const ids = '1AKE 1ANK 1E4V 1E4Y 2ECK 3HPQ 3HPR 4AKE 4X8H 4X8L 4X8M 4X8O 5EJE 6F7U 6HAM 6HAP 6RZE 6S36 7APU 8BQF 8CRG 8PVW 8Q2B 8RJ4 8RJ6 8RJ9 9L14 9R6U 9R71'.split(' ');
  const NUC = new Set(['AP5', 'ANP', 'ADP', 'AMP', 'ATP', 'GCP']);
  const rows = [];
  for (const id of ids) {
    const ch = {}, het = new Set();
    for (const l of readFileSync(join(CACHE, 'pdb', `${id}.pdb`), 'utf8').split('\n')) {
      if (l.startsWith('ENDMDL')) break;
      if (l.startsWith('HETATM')) het.add(l.slice(17, 20).trim());
      if (l.startsWith('ATOM  ') && l.slice(12, 16).trim() === 'CA' && (l[16] === ' ' || l[16] === 'A')) (ch[l[21]] ??= new Map()).set(+l.slice(22, 26), [+l.slice(30, 38), +l.slice(38, 46), +l.slice(46, 54)]);
    }
    for (const c of Object.keys(ch)) {
      const a = new Float64Array(214 * 3);
      let ok = true;
      for (let r = 1; r <= 214; r += 1) { const p = ch[c].get(r); if (!p) { ok = false; break; } a.set(p, 3 * (r - 1)); }
      if (ok) rows.push({ id, c, a, nuc: [...het].some((h) => NUC.has(h)) });
    }
  }
  const open = rows.find((r) => r.id === '4AKE' && r.c === 'A').a, closed = rows.find((r) => r.id === '1AKE' && r.c === 'A').a;
  for (const r of rows) { r.dOpen = fitRmsd(r.a, open); r.dClosed = fitRmsd(r.a, closed); r.state = r.dOpen < r.dClosed ? 0 : 1; }
  const O = rows.filter((r) => r.state === 0), C = rows.filter((r) => r.state === 1).sort((a, b) => a.dClosed - b.dClosed);
  const ref1 = C.find((r) => r.id === '1AKE' && r.c === 'A'), pickC = [ref1, ...shuffle(C.filter((r) => r !== ref1), 11).slice(0, 14)];
  const set = [...O, ...pickC];
  const oc = centre(open), ref = shift(open, [-oc[0], -oc[1], -oc[2]], new Float64Array(open.length));
  // All structures are placed by the same stable part of the protein, its core.
  const coreIdx = []; for (let i = 0; i < 214; i += 1) if ((i < 29) || (i >= 59 && i < 112) || (i >= 167)) coreIdx.push(i);
  const sub = (a) => { const s = new Float64Array(coreIdx.length * 3); coreIdx.forEach((i, k) => { s[3 * k] = a[3 * i]; s[3 * k + 1] = a[3 * i + 1]; s[3 * k + 2] = a[3 * i + 2]; }); return s; };
  const rs = sub(ref), rsc = centre(rs), rsz = shift(rs, [-rsc[0], -rsc[1], -rsc[2]], new Float64Array(rs.length));
  const c = new Int16Array(set.length * 214 * 3);
  set.forEach((r, k) => {
    const s = sub(r.a), sc = centre(s), sz = shift(s, [-sc[0], -sc[1], -sc[2]], new Float64Array(s.length)), R = bestRotation(sz, rsz);
    const moved = shift(rotate(R, shift(r.a, [-sc[0], -sc[1], -sc[2]], new Float64Array(r.a.length))), rsc);
    for (let i = 0; i < moved.length; i += 1) c[k * 642 + i] = Math.round(moved[i] * 100);
  });
  out.adk = { xyz: b64(c), models: set.length, res: 214, state: set.map((r) => r.state), nuc: set.map((r) => (r.nuc ? 1 : 0)), ids: set.map((r) => `${r.id}${r.c}`), counts: { chains: rows.length, open: O.length, closed: C.length, entries: new Set(rows.map((r) => r.id)).size, openWithNuc: O.filter((r) => r.nuc).map((r) => `${r.id}${r.c}`), closedNoNuc: C.filter((r) => !r.nuc).map((r) => `${r.id}${r.c}`) } };
  console.log('AdK', out.adk.counts, 'kept', set.length, 'rmsd open-closed', fitRmsd(open, closed).toFixed(2));
}

// 4. A real Boltz-2 run: the trace recorded by the author's teaching exercises. See README.
if (BOLTZ) {
  const npy = (buf) => { // Reads a little-endian float32 .npy
    const h = buf.readUInt16LE(8), head = buf.slice(10, 10 + h).toString(), shape = /\(([^)]*)\)/.exec(head)[1].split(',').filter((s) => s.trim()).map(Number);
    return { a: new Float32Array(buf.buffer.slice(buf.byteOffset + 10 + h, buf.byteOffset + buf.length)), shape };
  };
  const trace = JSON.parse(readFileSync(join(CACHE, 'trace-extract', 'trace.json'), 'utf8'));
  const cif = (f) => {
    const ls = readFileSync(f, 'utf8').split('\n'), hdr = ls.filter((l) => l.startsWith('_atom_site.')).map((l) => l.trim());
    const ni = hdr.indexOf('_atom_site.label_atom_id'), xi = hdr.indexOf('_atom_site.Cartn_x'), bi = hdr.indexOf('_atom_site.B_iso_or_equiv'), ri = hdr.indexOf('_atom_site.label_seq_id');
    return ls.filter((l) => l.startsWith('ATOM')).map((l) => l.split(/\s+/)).map((p) => ({ name: p[ni], xyz: [+p[xi], +p[xi + 1], +p[xi + 2]], b: +p[bi], res: +p[ri] }));
  };
  const base = cif(join(BOLTZ, 'results/runs/protein-fixed/boltz_results_protein/predictions/protein/protein_model_0.cif'));
  const ca = base.map((a, i) => (a.name === 'CA' ? i : -1)).filter((i) => i >= 0), L = ca.length;
  const frames = trace.denoiser_calls.length;
  const den = new Int16Array(frames * L * 3), noisyScale = [], noi = new Int16Array(frames * L * 3);
  // Handedness at each C-alpha: the sign of the volume N, C, C-beta about C-alpha, compared with the final structure.
  const byRes = new Map();
  base.forEach((a, i) => { if (!byRes.has(a.res)) byRes.set(a.res, {}); byRes.get(a.res)[a.name] = i; });
  const centres = [...byRes.values()].filter((v) => ['N', 'CA', 'C', 'CB'].every((k) => k in v));
  const vol = (P, v) => {
    const at = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]], c = at(v.CA), a = at(v.N).map((u, k) => u - c[k]), b = at(v.C).map((u, k) => u - c[k]), d = at(v.CB).map((u, k) => u - c[k]);
    return a[0] * (b[1] * d[2] - b[2] * d[1]) + a[1] * (b[2] * d[0] - b[0] * d[2]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
  };
  const finalAtoms = new Float64Array(base.length * 3);
  base.forEach((a, i) => finalAtoms.set(a.xyz, 3 * i));
  const refHand = centres.map((v) => Math.sign(vol(finalAtoms, v))), handGuess = [], handNoisy = [];
  for (let k = 0; k < frames; k += 1) {
    const tag = String(k).padStart(3, '0');
    const d = npy(readFileSync(join(CACHE, 'trace-extract', `denoised_${tag}.npy`))).a, n = npy(readFileSync(join(CACHE, 'trace-extract', `noisy_${tag}.npy`))).a;
    let m = 1e-6;
    ca.forEach((i) => { for (let c = 0; c < 3; c += 1) m = Math.max(m, Math.abs(n[3 * i + c])); });
    const sc = 32000 / m; noisyScale.push(sc);
    ca.forEach((i, r) => { for (let c = 0; c < 3; c += 1) { den[(k * L + r) * 3 + c] = Math.round(d[3 * i + c] * 100); noi[(k * L + r) * 3 + c] = Math.round(n[3 * i + c] * sc); } });
    handGuess.push(centres.filter((v, q) => Math.sign(vol(d, v)) === refHand[q]).length);
    handNoisy.push(centres.filter((v, q) => Math.sign(vol(n, v)) === refHand[q]).length);
  }
  const runs = { 'seed 42': 'protein-fixed', 'seed 43': 'seed43', 'second sample': 'samples2', '40 steps': 'steps40', 'step scale 1.0': 'step-scale', 'rho 4': 'schedule', 'no MSA': 'no-msa' };
  const fin = {}, names = [];
  for (const [name, dir] of Object.entries(runs)) {
    const f = join(BOLTZ, `results/runs/${dir}/boltz_results_protein${dir === 'no-msa' ? '_no_msa' : ''}/predictions/protein${dir === 'no-msa' ? '_no_msa' : ''}/protein${dir === 'no-msa' ? '_no_msa' : ''}_model_${name === 'second sample' ? 1 : 0}.cif`);
    const atoms = cif(f).filter((a) => a.name === 'CA');
    const a = new Int16Array(L * 3);
    atoms.forEach((t, r) => { for (let c = 0; c < 3; c += 1) a[3 * r + c] = Math.round(t.xyz[c] * 100); });
    fin[name] = b64(a); names.push(name);
  }
  const plddt = new Uint8Array(ca.map((i) => Math.round(base[i].b)));
  const conf = JSON.parse(readFileSync(join(BOLTZ, 'results/runs/protein-fixed/boltz_results_protein/predictions/protein/confidence_protein_model_0.json')));
  out.boltz = { L, frames, sigma: trace.denoiser_calls.map((c) => +c.sigma.toFixed(4)), den: b64(den), noi: b64(noi), noisyScale, finals: fin, names, plddt: b64(plddt), confidence: +conf.confidence_score.toFixed(4), complexPlddt: +conf.complex_plddt.toFixed(4), ptm: +conf.ptm.toFixed(4), hand: { n: centres.length, guess: handGuess, noisy: handNoisy } };
  console.log('hand, right of', centres.length, 'guess', handGuess.join(' '), '| noisy', handNoisy.join(' '));
  console.log('boltz', L, frames, names);
}

// 5. Our own molecular dynamics of alanine dipeptide under a fixed bias. Each frame carries the weight exp(+V/kT).
if (MD && existsSync(MD)) {
  const kT = 0.0083144626 * 300, F = [], runs = [];
  for (const f of readdirSync(MD).filter((g) => /^frames-\d+\.txt$/.test(g)).sort()) {
    const ls = readFileSync(join(MD, f), 'utf8').trim().split('\n').map((l) => l.split(' ').map(Number)).filter((r) => r.length === 4 && r.every(Number.isFinite));
    runs.push(ls.length);
    for (const r of ls) F.push(r);
  }
  if (F.length) {
    const w = F.map((r) => Math.exp(r[3] / kT)), W = w.reduce((a, b) => a + b, 0), W2 = w.reduce((a, b) => a + b * b, 0);
    const side = (r) => (r[1] > 0 ? 2 : wrapPsi(r[2]) > 45 ? 1 : 0);
    const pop = (from, to) => { const c = [0, 0, 0]; let t = 0; for (let i = from; i < to; i += 1) { c[side(F[i])] += w[i]; t += w[i]; } return c.map((v) => v / t); };
    // Error bars from blocks: each run is cut into five equal parts.
    const blocks = []; let at = 0;
    for (const n of runs) { const k = Math.floor(n / 5); for (let b = 0; b < 5; b += 1) blocks.push(pop(at + b * k, at + (b + 1) * k)); at += n; }
    const p = pop(0, F.length), perRun = []; { let q = 0; for (const n of runs) { perRun.push(pop(q, q + n)); q += n; } }
    // Standard errors between the independent runs. Blocks within a run understate the error, because the signal stays correlated.
    const se = [0, 1, 2].map((c) => { const m = perRun.reduce((a, b) => a + b[c], 0) / perRun.length; return Math.sqrt(perRun.reduce((a, b) => a + (b[c] - m) ** 2, 0) / (perRun.length - 1) / perRun.length); });
    const seBlocks = [0, 1, 2].map((c) => { const m = blocks.reduce((a, b) => a + b[c], 0) / blocks.length; return Math.sqrt(blocks.reduce((a, b) => a + (b[c] - m) ** 2, 0) / (blocks.length - 1) / blocks.length); });
    // A Boltzmann sample for the field: frames drawn with probability proportional to weight.
    const cum = new Float64Array(F.length); let t = 0; w.forEach((v, i) => { t += v; cum[i] = t; });
    let s = 99; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const N = 7000, mx = new Int16Array(N), my = new Int16Array(N), used = new Set();
    for (let i = 0; i < N; i += 1) { const u = rnd() * t; let lo = 0, hi = F.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < u) lo = m + 1; else hi = m; } used.add(lo); mx[i] = Math.round(F[lo][1] * 10); my[i] = Math.round(wrapPsi(F[lo][2]) * 10); }
    const G = 72, H = new Float32Array(G * G);
    F.forEach((r, i) => { const a = Math.min(G - 1, Math.floor((r[1] + 180) / 5)), b = Math.min(G - 1, Math.floor((wrapPsi(r[2]) + 100) / 5)); H[a + G * b] += w[i] / W; });
    out.md = { x: b64(mx), y: b64(my), n: N, frames: F.length, runs, ess: Math.round((W * W) / W2), distinct: used.size, pop: p, perRun, se, seBlocks, hist: b64(H), grid: G };
    console.log('md frames', F.length, runs, 'kish', out.md.ess, 'distinct', used.size, 'pop', p.map((v) => v.toFixed(4)), 'se', se.map((v) => v.toFixed(4)), 'perRun', perRun.map((r) => r.map((v) => (100 * v).toFixed(1)).join('/')).join('  '));
  }
}

const body = `// Generated by tools/pack_data.mjs. Do not edit.\nexport const BUNDLE = ${JSON.stringify(out)};\n`;
writeFileSync(join(here, '../src/data/bundle.js'), body);
console.log(`bundle ${(body.length / 1024).toFixed(0)} KB`);
