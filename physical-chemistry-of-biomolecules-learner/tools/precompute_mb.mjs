// Long Mercedes-Benz water runs, done once at build time, because free energies do not converge in the
// seconds a player has. Writes tools/mb_raw.json; tools/make_table.mjs turns that into src/sim/mbtable.js.
// Every measurement has a control with hydrogen bonds switched off.
//   node tools/precompute_mb.mjs [scale] [resume]     (scale 0.05 gives a quick rough table)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { MBWater, makeRandom } from '../src/sim/mbwater.js';

const P = 0.19; // Pressure of Silverstein, Haymet and Dill (1998), in model units.
const SHELL = 1.55; // First minimum of g(r) around the sigma = 1 solute.
const here = dirname(fileURLToPath(import.meta.url));
const NB = 12;

const fold = (th, ux, uy) => {
  const third = (2 * Math.PI) / 3;
  const phi = Math.atan2(uy, ux);
  let a = (((th - phi) % third) + third) % third;
  if (a > Math.PI / 3) a = third - a;
  return a / (Math.PI / 3); // 0: an arm points straight out. 1: an arm points straight in.
};

// Density of the model with bonds at pressure 0.19, from the first long runs. Fixed-box jobs use these.
const RHO = { 0.17: 0.989, 0.18: 0.991, 0.19: 0.987, 0.2: 0.977, 0.21: 0.961, 0.22: 0.939, 0.23: 0.911, 0.24: 0.887, 0.25: 0.85, 0.26: 0.82, 0.27: 0.782, 0.28: 0.751, 0.29: 0.719, 0.3: 0.689 };

// mode 'npt' lets the box breathe at pressure p. mode 'nvt' holds it at the density water has at this T.
function start(n, T, seed, hb = 1, mode = 'npt') {
  const w = new MBWater({ n, L: Math.sqrt(n / (mode === 'nvt' ? RHO[T] : 0.9)), T, seed });
  w.hb = hb;
  return w;
}

function equil(w, eq, mode = 'npt', p = P) {
  for (let s = 0; s < eq; s++) { w.sweep(1); if (mode === 'npt' && s % 5 === 0) w.volumeMove(p); if (s % 200 === 0) w.tune(); }
}

// Job kinds -------------------------------------------------------------------

// Widom insertion on one trajectory for six test objects: free energy of putting each into the liquid, with
// energy, volume and the direct solute-water energy kept apart.
const PROBES = [
  { key: 1, s: 1, e: 0.1 },
  { key: 0.7, s: 0.7, e: 0.1 },
  { key: 'e05', s: 1, e: 0.05 },
  { key: 'e20', s: 1, e: 0.2 },
  { key: 'wca', s: 1, e: 0.1, rc2: 2 ** (1 / 3), shift: 0.1 },
  { key: 'hole', hard: 1 },
];

function probe({ T, seed, n, eq, pr, hb, mode }) {
  const w = start(n, T, seed, hb, mode);
  const rnd = makeRandom(seed * 31 + 5);
  equil(w, eq, mode);
  const tests = PROBES.map((t) => ({ rc2: 6.25, s6: (t.s ?? 1) ** 6, ...t, x: 0, y: 0 }));
  const a = PROBES.map(() => ({ ve: 0, veV: 0, veU: 0, veD: 0, c: 0 }));
  let V = 0, VV = 0, VU = 0, cnt = 0, E = 0, rho = 0, bo = 0;
  const out = new Int32Array(n * 3);
  for (let s = 0; s < pr; s++) {
    w.sweep(1);
    if (mode === 'npt' && s % 5 === 0) w.volumeMove(P);
    if (s % 10) continue;
    const U = w.totalEnergy();
    const v = w.L * w.L;
    V += v; VV += v * v; VU += v * U; E += U; rho += n / v; bo += w.bonds(out); cnt++;
    tests.forEach((t, k) => {
      for (let q = 0; q < 30; q++) {
        t.x = rnd() * w.L;
        t.y = rnd() * w.L;
        a[k].c++;
        let d = 0;
        let over = false;
        for (let i = 0; i < n; i++) { d += w.soluteEnergy(t, w.x[i], w.y[i]); if (d > 60 * T) { over = true; break; } }
        if (over) continue;
        const b = Math.exp(-d / T);
        a[k].ve += v * b; a[k].veV += v * v * b; a[k].veU += v * b * (U + d); a[k].veD += v * b * d;
      }
    });
  }
  return { keys: PROBES.map((p) => p.key), V: V / cnt, VV: VV / cnt, VU: VU / cnt, E: E / cnt / n, rho: rho / cnt, bo: bo / cnt / n, ve: a.map((x) => x.ve / x.c), veV: a.map((x) => x.veV / x.c), veU: a.map((x) => x.veU / x.c), veD: a.map((x) => x.veD / x.c) };
}

// One real solute: structure around it, and the pair potential of mean force by inserting a test solute.
function shell({ T, seed, n, eq, pr, s }) {
  const w = start(n, T, seed);
  const rnd = makeRandom(seed * 17 + 3);
  const sol = w.addSolute({ x: w.L / 2, y: w.L / 2, s, e: 0.1 });
  equil(w, eq);
  const NR = 80, DR = 0.05, NW = 56, DW = 0.05;
  const gr = new Float64Array(NR), br = new Float64Array(NR);
  const sOri = new Float64Array(NB), bOri = new Float64Array(NB);
  const sN = [0, 0, 0, 0], bN = [0, 0, 0, 0];
  const wn = new Float64Array(NW), wd = new Float64Array(NW);
  let cnt = 0, area = 0, nS = 0, nB = 0;
  const out = new Int32Array(n * 3);
  const test = { s, e: 0.1, s6: s ** 6, rc2: 6.25, x: 0, y: 0 };
  for (let k = 0; k < pr; k++) {
    w.sweep(1);
    if (k % 5 === 0) w.volumeMove(P);
    if (k % 10) continue;
    w.bonds(out);
    cnt++;
    const L = w.L;
    area += L * L;
    const fx = (sol.x + L / 2) % L, fy = (sol.y + L / 2) % L;
    for (let i = 0; i < n; i++) {
      let dx = w.x[i] - sol.x, dy = w.y[i] - sol.y;
      dx -= L * Math.round(dx / L); dy -= L * Math.round(dy / L);
      const r = Math.hypot(dx, dy);
      let m = 0;
      for (let a = 0; a < 3; a++) if (out[3 * i + a] >= 0) m++;
      const b = Math.floor(r / DR);
      if (b < NR) { gr[b]++; br[b] += m; }
      if (r < SHELL) { nS++; sN[m]++; sOri[Math.min(NB - 1, Math.floor(fold(w.t[i], dx / r, dy / r) * NB))]++; }
      let px = w.x[i] - fx, py = w.y[i] - fy;
      px -= L * Math.round(px / L); py -= L * Math.round(py / L);
      const q = Math.hypot(px, py);
      if (q > 0.9 && q < SHELL) { nB++; bN[m]++; bOri[Math.min(NB - 1, Math.floor(fold(w.t[i], px / q, py / q) * NB))]++; }
    }
    for (let q = 0; q < 200; q++) {
      const r = 0.7 + rnd() * (DW * NW - 0.7);
      const a = rnd() * 2 * Math.PI;
      test.x = sol.x + r * Math.cos(a);
      test.y = sol.y + r * Math.sin(a);
      let d = 0;
      for (let i = 0; i < n; i++) { d += w.soluteEnergy(test, w.x[i], w.y[i]); if (d > 60 * T) break; }
      const b = Math.floor(r / DW);
      if (b < NW) { wn[b] += Math.exp(-d / T); wd[b]++; }
    }
  }
  return { cnt, area: area / cnt, gr: [...gr], br: [...br], sOri: [...sOri], bOri: [...bOri], sN, bN, nS, nB, wn: [...wn], wd: [...wd], DR, DW };
}

// Two real solutes held at a set distance: count shell waters. The box never changes size, because a volume
// move would rescale the separation, so these runs sit at the density the model has at this T.
function pair({ T, seed, n, eq, pr, s, d, hb }) {
  const w = start(n, T, seed, hb, 'nvt');
  const a = w.addSolute({ x: w.L / 2 - d / 2, y: w.L / 2, s, e: 0.1 });
  const b = w.addSolute({ x: w.L / 2 + d / 2, y: w.L / 2, s, e: 0.1 });
  equil(w, eq, 'nvt');
  let shellN = 0, cnt = 0, bo = 0;
  const out = new Int32Array(n * 3);
  const L = w.L;
  for (let k = 0; k < pr; k++) {
    w.sweep(1);
    if (k % 10) continue;
    w.bonds(out);
    cnt++;
    for (let i = 0; i < n; i++) {
      let in1 = false;
      for (const sol of [a, b]) {
        let dx = w.x[i] - sol.x, dy = w.y[i] - sol.y;
        dx -= L * Math.round(dx / L); dy -= L * Math.round(dy / L);
        if (dx * dx + dy * dy < SHELL * SHELL) in1 = true;
      }
      if (in1) { shellN++; for (let c = 0; c < 3; c++) if (out[3 * i + c] >= 0) bo++; }
    }
  }
  return { shell: shellN / cnt, bonds: bo / Math.max(1, shellN) };
}

// Potential of mean force between two solutes, by test insertion out past r = 6, so the baseline is flat.
// With wca set, the solute only repels the fluid: a control for packing with no solute-fluid attraction.
function pmf({ T, seed, n, eq, pr, s, hb, mode, wca }) {
  const w = start(n, T, seed, hb, mode);
  const rnd = makeRandom(seed * 17 + 3);
  const rc = wca ? s * 2 ** (1 / 6) : 2.5;
  const sol = w.addSolute({ x: w.L / 2, y: w.L / 2, s, e: 0.1, rc });
  if (wca) sol.shift = 0.1;
  equil(w, eq, mode);
  const DW = 0.05;
  const NW = Math.floor((w.L / 2 - 0.3) / DW);
  const wn = new Float64Array(NW), wd = new Float64Array(NW);
  const test = { s, e: 0.1, s6: s ** 6, rc2: rc * rc, x: 0, y: 0, shift: wca ? 0.1 : 0 };
  for (let k = 0; k < pr; k++) {
    w.sweep(1);
    if (mode === 'npt' && k % 5 === 0) w.volumeMove(P);
    if (k % 10) continue;
    for (let q = 0; q < 300; q++) {
      const r = 0.7 + rnd() * (DW * NW - 0.7);
      const a = rnd() * 2 * Math.PI;
      test.x = sol.x + r * Math.cos(a);
      test.y = sol.y + r * Math.sin(a);
      let d = 0;
      for (let i = 0; i < n; i++) { d += w.soluteEnergy(test, w.x[i], w.y[i]); if (d > 60 * T) break; }
      const b = Math.floor(r / DW);
      if (b < NW) { wn[b] += Math.exp(-d / T); wd[b]++; }
    }
  }
  return { wn: [...wn], wd: [...wd], DW, NW };
}

// How often an empty circle of radius R appears by itself in pure water, and the water-water g(r).
function holes({ T, seed, n, eq, pr, hb, mode }) {
  const w = start(n, T, seed, hb, mode);
  const rnd = makeRandom(seed * 13 + 1);
  equil(w, eq, mode);
  const DR = 0.02, NB = 100;
  const h = new Float64Array(NB), g = new Float64Array(150);
  let c = 0, rho = 0, cnt = 0;
  for (let k = 0; k < pr; k++) {
    w.sweep(1);
    if (mode === 'npt' && k % 5 === 0) w.volumeMove(P);
    if (k % 10) continue;
    cnt++;
    const L = w.L;
    rho += n / (L * L);
    for (let q = 0; q < 400; q++) {
      const x = rnd() * L, y = rnd() * L;
      let m = 1e9;
      for (let i = 0; i < n; i++) {
        let dx = w.x[i] - x, dy = w.y[i] - y;
        dx -= L * Math.round(dx / L); dy -= L * Math.round(dy / L);
        const r2 = dx * dx + dy * dy;
        if (r2 < m) m = r2;
      }
      const b = Math.floor(Math.sqrt(m) / DR);
      if (b < NB) h[b]++;
      c++;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = w.x[i] - w.x[j], dy = w.y[i] - w.y[j];
        dx -= L * Math.round(dx / L); dy -= L * Math.round(dy / L);
        const b = Math.floor(Math.sqrt(dx * dx + dy * dy) / 0.02);
        if (b < 150) g[b] += 2;
      }
    }
  }
  const dens = rho / cnt;
  const gr = [...g].map((v, b) => v / cnt / n / (dens * 2 * Math.PI * (b + 0.5) * 0.02 * 0.02));
  return { h: [...h], c, DR, rho: dens, gr };
}

// A hard cavity of radius R. Contact density gives the work of growing it (reversible work theorem).
function cavity({ T, seed, n, eq, pr, R, hb = 1, p = P }) {
  const w = start(n, T, seed, hb);
  const sol = w.addSolute({ x: w.L / 2, y: w.L / 2, hard: R });
  w.clearHard();
  equil(w, eq, 'npt', p);
  const DR = 0.02, NR = 40;
  const h = new Float64Array(NR);
  let cnt = 0, rho = 0, layer = 0, layerB = 0, far = 0, farB = 0;
  const out = new Int32Array(n * 3);
  for (let k = 0; k < pr; k++) {
    w.sweep(1);
    if (k % 5 === 0) w.volumeMove(p);
    if (k % 10) continue;
    w.bonds(out);
    cnt++;
    const L = w.L;
    rho += n / (L * L - Math.PI * R * R);
    for (let i = 0; i < n; i++) {
      let dx = w.x[i] - sol.x, dy = w.y[i] - sol.y;
      dx -= L * Math.round(dx / L); dy -= L * Math.round(dy / L);
      const r = Math.hypot(dx, dy);
      const b = Math.floor((r - R) / DR);
      if (b >= 0 && b < NR) h[b]++;
      let m = 0;
      for (let a = 0; a < 3; a++) if (out[3 * i + a] >= 0) m++;
      if (r < R + 0.45) { layer++; layerB += m; }
      else if (r > R + 2.2) { far++; farB += m; }
    }
  }
  // Density per unit area in each thin ring, then straight-line extrapolation back to contact.
  const dens = [...h].map((c, b) => c / cnt / (2 * Math.PI * (R + (b + 0.5) * DR) * DR));
  return { dens, rho: rho / cnt, DR, layer: layer / cnt, bondsLayer: layerB / Math.max(1, layer), bondsFar: farB / Math.max(1, far) };
}

const RUN = { probe, shell, pair, pmf, holes, cavity };

if (!isMainThread) {
  parentPort.on('message', (job) => {
    const res = RUN[job.kind](job);
    parentPort.postMessage({ job, res });
  });
} else {
  const scale = +(process.argv[2] ?? 1);
  const rawFile = join(here, 'mb_raw.json');
  const R = (x) => Math.max(2000, Math.round(x * scale));
  const jobs = [];
  const grid = Object.keys(RHO).map(Number).sort((u, v) => u - v);
  const six = [0.18, 0.2, 0.22, 0.24, 0.26, 0.28];
  // Bondless cavity. Pressure 0.31 gives this fluid the density water has at kT 0.18.
  for (const Rc of [0.3, 0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5]) {
    jobs.push({ kind: 'cavity', T: 0.18, seed: 60 + Math.round(Rc * 10), n: 300, eq: R(8000), pr: R(60000), R: Rc, hb: 0, p: 0.31 });
  }
  for (const T of [0.18, 0.24]) {
    for (const Rc of [0.3, 0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5]) {
      jobs.push({ kind: 'cavity', T, seed: 30 + Math.round(Rc * 10), n: 300, eq: R(30000), pr: R(100000), R: Rc });
    }
  }
  for (const T of [0.17, 0.18, 0.20, 0.22, 0.24, 0.26, 0.28, 0.30]) {
    for (let seed = 1; seed <= 3; seed++) jobs.push({ kind: 'shell', T, seed: seed + 10, n: 120, eq: R(50000), pr: R(250000), s: 1.0 });
  }
  for (const T of [0.18, 0.24]) {
    for (let seed = 1; seed <= 2; seed++) {
      jobs.push({ kind: 'holes', T, seed, n: 200, eq: R(20000), pr: R(150000), hb: 1, mode: 'npt' });
      jobs.push({ kind: 'holes', T, seed, n: 200, eq: R(4000), pr: R(60000), hb: 0, mode: 'nvt' });
      jobs.push({ kind: 'holes', T, seed, n: 200, eq: R(4000), pr: R(60000), hb: 0, mode: 'npt' });
    }
  }
  for (const T of [0.18, 0.22, 0.24]) {
    for (const d of [1.1, 2.1, 6.5]) {
      for (let seed = 1; seed <= 3; seed++) jobs.push({ kind: 'pair', T, seed: seed + 40, n: 200, eq: R(30000), pr: R(120000), s: 1.0, d, hb: 1 });
      jobs.push({ kind: 'pair', T, seed: 51, n: 200, eq: R(5000), pr: R(60000), s: 1.0, d, hb: 0 });
    }
  }
  for (const T of six) for (let seed = 1; seed <= 2; seed++) jobs.push({ kind: 'pmf', T, seed, n: 300, eq: R(4000), pr: R(60000), s: 1.0, hb: 0, mode: 'nvt' });
  for (const T of [0.22, 0.24]) for (let seed = 1; seed <= 2; seed++) jobs.push({ kind: 'pmf', T, seed: seed + 70, n: 300, eq: R(4000), pr: R(60000), s: 1.0, hb: 0, mode: 'nvt', wca: 1 });
  for (const T of grid) {
    for (let seed = 1; seed <= 2; seed++) {
      jobs.push({ kind: 'probe', T, seed, n: 100, eq: R(6000), pr: R(120000), hb: 0, mode: 'nvt' });
      jobs.push({ kind: 'probe', T, seed, n: 100, eq: R(6000), pr: R(120000), hb: 0, mode: 'npt' });
    }
    for (let seed = 1; seed <= 4; seed++) jobs.push({ kind: 'probe', T, seed, n: 100, eq: R(30000), pr: R(300000), hb: 1, mode: 'npt' });
    for (let seed = 1; seed <= 4; seed++) jobs.push({ kind: 'probe', T, seed, n: 100, eq: R(30000), pr: R(300000), hb: 1, mode: 'nvt' });
  }
  for (const T of [0.22, 0.24]) for (let seed = 1; seed <= 3; seed++) jobs.push({ kind: 'pmf', T, seed: seed + 80, n: 300, eq: R(30000), pr: R(150000), s: 1.0, hb: 1, mode: 'npt', wca: 1 });
  for (const T of six) for (let seed = 1; seed <= (T < 0.21 ? 6 : 4); seed++) jobs.push({ kind: 'pmf', T, seed, n: 300, eq: R(40000), pr: R(250000), s: 1.0, hb: 1, mode: 'npt' });
  const key = (j) => [j.kind, j.T, j.seed, j.R, j.d, j.hb, j.mode, j.p, j.wca].join();
  const wanted = new Set(jobs.map(key));
  const results = (existsSync(rawFile) && process.argv[3] === 'resume' ? JSON.parse(readFileSync(rawFile)) : [])
    .filter((r) => wanted.has(key(r.job)));
  const seen = new Set(results.map((r) => key(r.job)));
  const todo = jobs.filter((j) => !seen.has(key(j)));
  console.log(`${todo.length} jobs on ${Math.max(1, cpus().length - 3)} threads`);
  let at = 0, doneN = 0;
  const t0 = Date.now();
  await new Promise((resolve) => {
    let live = 0;
    for (let i = 0; i < Math.max(1, cpus().length - 3); i++) {
      const wk = new Worker(fileURLToPath(import.meta.url));
      const feed = () => {
        if (at < todo.length) { wk.postMessage(todo[at++]); live++; } else { wk.terminate(); if (!live) resolve(); }
      };
      wk.on('message', (m) => {
        results.push(m); live--; doneN++;
        if (doneN % 5 === 0) { writeFileSync(rawFile, JSON.stringify(results)); console.log(doneN, ((Date.now() - t0) / 1000).toFixed(0), 's'); }
        feed();
      });
      feed();
    }
  });
  writeFileSync(rawFile, JSON.stringify(results));
  console.log('raw written');
  process.exit(0);
}
