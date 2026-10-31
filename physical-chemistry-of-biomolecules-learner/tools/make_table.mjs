// Turns tools/mb_raw.json into src/sim/mbtable.js: the measured tables the game shows.
//   node tools/make_table.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MBWater } from '../src/sim/mbwater.js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, 'mb_raw.json')));
const P = 0.19;
const R3 = (x) => Math.round(x * 1000) / 1000;
const by = (k) => raw.filter((r) => r.job.kind === k);
const Ts = (rows) => [...new Set(rows.map((r) => r.job.T))].sort((a, b) => a - b);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const sem = (a) => sd(a) / Math.sqrt(a.length);

// Least squares polynomial fit, used only for local smoothing with temperature.
function poly(xs, ys, d) {
  const n = d + 1;
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  xs.forEach((x, k) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += x ** (i + j);
      A[i][n] += ys[k] * x ** i;
    }
  });
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

// Bulk and insertion ---------------------------------------------------------------------------
const ins = by('probe');
const select = (hb, mode) => ins.filter((r) => r.job.hb === hb && r.job.mode === mode);
const N = ins[0].job.n;

// One row per temperature for one test object. dU, pdV and dH are Ben-Naim fixed-concentration values.
// With constant pressure also vbar, the partial volume, Hbar, the partial molar enthalpy, and TgV = T gamma_V vbar.
function bill(hb, mode, key) {
  const rows = select(hb, mode);
  const k = rows[0].res.keys.indexOf(key);
  const points = Ts(rows).map((T) => {
    const R = rows.filter((r) => r.job.T === T).map((r) => r.res);
    const V = mean(R.map((x) => x.V)), VV = mean(R.map((x) => x.VV)), VU = mean(R.map((x) => x.VU)), U = mean(R.map((x) => x.E)) * N;
    const ve = mean(R.map((x) => x.ve[k])), veV = mean(R.map((x) => x.veV[k])), veU = mean(R.map((x) => x.veU[k])), veD = mean(R.map((x) => x.veD[k]));
    const seedG = R.map((x) => -T * Math.log(x.ve[k] / x.V));
    const seedU = R.map((x) => x.veU[k] / x.ve[k] - x.VU / x.V);
    const seedV = R.map((x) => x.veV[k] / x.ve[k] - x.VV / x.V);
    const seedS = R.map((x, i) => seedG[i] - seedU[i] - P * seedV[i]);
    const covV = VV - V * V, covU = VU - V * U;
    const dV = veV / ve - VV / V;
    const vbar = veV / ve - V;
    const Tg = covV > 0 ? (covU + P * covV) / covV : 0;
    return { T, dG: -T * Math.log(ve / V), dU: veU / ve - VU / V, dV, usw: veD / ve, vbar, Tg, Hbar: veU / ve - U + P * vbar, errG: sem(seedG), errU: sem(seedU), errV: sem(seedV), errS: sem(seedS), rho: mean(R.map((x) => x.rho)) };
  });
  const local = (fn, i) => {
    const lo = Math.max(0, i - 3), hi = Math.min(points.length, i + 4);
    const part = points.slice(lo, hi);
    return poly(part.map((p) => p.T - points[i].T), part.map(fn), 2);
  };
  const npt = mode === 'npt';
  return points.map((p, i) => {
    const dG = local((q) => q.dG, i)[0];
    const dU = local((q) => q.dU, i)[0];
    const pdV = npt ? P * local((q) => q.dV, i)[0] : 0;
    const dH = dU + pdV;
    const slope = local((q) => q.dU + (npt ? P * q.dV : 0), i)[1];
    const gh = -p.T * p.T * local((q) => q.dG / q.T, i)[1];
    const row = { T: p.T, dG: R3(dG), dU: R3(dU), pdV: R3(pdV), dH: R3(dH), mTdS: R3(dG - dH), cp: R3(slope), gh: R3(gh), usw: R3(local((q) => q.usw, i)[0]), errG: R3(p.errG), errU: R3(p.errU), errS: R3(p.errS), rho: R3(p.rho) };
    if (npt) {
      const vbar = local((q) => q.vbar, i)[0], Tg = local((q) => q.Tg, i)[0];
      Object.assign(row, { vbar: R3(vbar), Tg: R3(Tg), TgV: R3(Tg * vbar), Hbar: R3(local((q) => q.Hbar, i)[0]) });
    }
    return row;
  });
}

const on = select(1, 'npt');
const DENSITY = Ts(on).map((T) => [T, R3(mean(on.filter((r) => r.job.T === T).map((r) => r.res.rho)))]);
const BULK = Ts(on).map((T) => { const R = on.filter((r) => r.job.T === T); return [T, R3(mean(R.map((r) => r.res.E))), R3(mean(R.map((r) => r.res.bo)))]; });
const INSERT = {};
for (const key of on[0].res.keys) INSERT[key] = { on: bill(1, 'npt', key), box: bill(1, 'nvt', key), off: bill(0, 'nvt', key), press: bill(0, 'npt', key) };

// Where dH crosses zero at constant pressure, for each test object. Null if it never does in the range.
const crossing = (rows) => { for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], c = rows[i]; if (a.dH < 0 && c.dH >= 0) return R3(a.T + ((c.T - a.T) * -a.dH) / (c.dH - a.dH)); } return rows[0].dH >= 0 ? 'below' : null; };
const CROSS = {};
for (const key of Object.keys(INSERT)) CROSS[key] = crossing(INSERT[key].on);

// Structure around one solute --------------------------------------------------------------------
const shell = by('shell');
const SHELLS = Ts(shell).map((T) => {
  const R = shell.filter((r) => r.job.T === T);
  const add = (name) => R.reduce((a, r) => { r.res[name].forEach((v, i) => { a[i] = (a[i] ?? 0) + v; }); return a; }, []);
  const so = add('sOri'), bo = add('bOri'), sN = add('sN'), bN = add('bN');
  const nS = so.reduce((a, b) => a + b, 0);
  const nB = bo.reduce((a, b) => a + b, 0);
  const S = (h, n) => h.reduce((s, v) => (v > 0 ? s - (v / n) * Math.log((v / n) * h.length) : s), 0);
  const cnt = R.reduce((a, r) => a + r.res.cnt, 0);
  const Sper = R.map((r) => { const n = r.res.sOri.reduce((a, b) => a + b, 0); return S(r.res.sOri, n); });
  return {
    T, S: R3(S(so, nS)), Serr: R3(sem(Sper)), Sbulk: R3(S(bo, nB)), n: R3(nS / cnt),
    bondsShell: R3(sN.reduce((a, v, i) => a + v * i, 0) / nS), bondsBulk: R3(bN.reduce((a, v, i) => a + v * i, 0) / nB),
    hist: so.map((v) => R3((v / nS) * 12)), bulk: bo.map((v) => R3((v / nB) * 12)),
  };
});

// Pair potential of mean force. The baseline is the flat tail beyond r = 5 ----------------------
const LJ = (r) => 0.4 * ((1 / r) ** 12 - (1 / r) ** 6);
function pmfTable(hb, wca) {
  const rows = by('pmf').filter((r) => r.job.hb === hb && !!r.job.wca === !!wca);
  return Ts(rows).map((T) => {
    const R = rows.filter((r) => r.job.T === T).map((r) => r.res);
    const NW = Math.min(...R.map((x) => x.NW));
    const { DW } = R[0];
    const curve = (list) => {
      const wn = new Array(NW).fill(0), wd = new Array(NW).fill(0);
      list.forEach((x) => { for (let i = 0; i < NW; i++) { wn[i] += x.wn[i]; wd[i] += x.wd[i]; } });
      let a = 0, b = 0;
      for (let i = Math.floor(5 / DW); i < NW; i++) { a += wn[i]; b += wd[i]; }
      const far = a / b;
      // With a repulsive-only solute there is no direct attraction, so only the short-range wall is added.
      const direct = (r) => (wca ? (r < 2 ** (1 / 6) ? LJ(r) + 0.1 : 0) : LJ(r));
      return wn.map((v, i) => (wd[i] ? -T * Math.log(v / wd[i] / far) + direct((i + 0.5) * DW) : 0));
    };
    const well = (W, r0, r1) => { let m = 9; for (let i = 0; i < NW; i++) { const r = (i + 0.5) * DW; if (r >= r0 && r <= r1 && W[i] < m) m = W[i]; } return m; };
    const W = curve(R);
    const contacts = R.map((x) => well(curve([x]), wca ? 0.85 : 0.95, 1.4));
    const separated = R.map((x) => well(curve([x]), 1.85, 2.45));
    const r = [], w = [];
    for (let i = Math.round(0.85 / DW); i < Math.round(3.3 / DW); i++) { r.push(R3((i + 0.5) * DW)); w.push(R3(W[i])); }
    let at = 1.07; { let m = 9; for (let i = 0; i < NW; i++) { const q = (i + 0.5) * DW; if (q >= 0.95 && q <= 1.4 && W[i] < m) { m = W[i]; at = q; } } }
    return { T, r, W: w, contact: R3(well(W, 0.95, 1.4)), err: R3(sem(contacts)), water: R3(well(W, 0.95, 1.4) - LJ(at)), separated: R3(well(W, 1.85, 2.45)), errSep: R3(sem(separated)), seeds: contacts.map(R3) };
  });
}
const PMF = { on: pmfTable(1), off: pmfTable(0), wca: pmfTable(0, true), wcaWater: pmfTable(1, true) };

// Shell counts with bonds on and off --------------------------------------------------------------
const PAIR = {};
for (const r of by('pair')) {
  const key = r.job.hb ? 'on' : 'off';
  ((PAIR[r.job.T] ??= { on: {}, off: {} })[key][r.job.d] ??= []).push(r.res.shell);
}
for (const T of Object.keys(PAIR)) for (const k of ['on', 'off']) for (const d of Object.keys(PAIR[T][k])) PAIR[T][k][d] = R3(mean(PAIR[T][k][d]));

// Holes: how often an empty circle appears, with bonds, without bonds at the same density, and without bonds
// at the same pressure. Also the water-water g(r), for the hydrogen bond books. ----------------------
const HOLES = {};
for (const T of Ts(by('holes'))) {
  const row = {};
  for (const [name, hb, mode] of [['on', 1, 'npt'], ['off', 0, 'nvt'], ['press', 0, 'npt']]) {
    const R = by('holes').filter((r) => r.job.T === T && r.job.hb === hb && r.job.mode === mode).map((r) => r.res);
    if (!R.length) continue;
    const NB = R[0].h.length, { DR } = R[0];
    const h = new Array(NB).fill(0);
    let c = 0;
    R.forEach((x) => { x.h.forEach((v, i) => { h[i] += v; }); c += x.c; });
    const grid = [], W = [];
    // Radii on the bin edges, so that each R is the R it says.
    for (let b = 5; b < NB; b += 1) {
      let s = 0;
      for (let i = b; i < NB; i++) s += h[i];
      if (s < 20) break;
      grid.push(R3(b * DR)); W.push(R3(-T * Math.log(s / c)));
    }
    const g = new Array(R[0].gr.length).fill(0);
    R.forEach((x) => x.gr.forEach((v, i) => { g[i] += v / R.length; }));
    row[name] = { rho: R3(mean(R.map((x) => x.rho))), R: grid, W, g: g.map(R3) };
  }
  HOLES[T] = row;
}

// Cavities: reversible work of growing a hard hole, from the density at its wall -------------------
// The smallest hole starts from the exact result, -kT ln(1 - rho pi R^2).
function cavities(rows, T, p) {
  const pts = rows.sort((a, b) => a.job.R - b.job.R).map((r) => {
    const { dens, rho } = r.res;
    const c = poly(dens.slice(0, 8).map((_, i) => (i + 0.5) * r.res.DR), dens.slice(0, 8), 1);
    return { R: r.job.R, wall: c[0], rho, bonds: r.res.bondsLayer, far: r.res.bondsFar };
  });
  let G = -T * Math.log(1 - pts[0].rho * Math.PI * pts[0].R ** 2);
  let last = { R: pts[0].R, y: T * 2 * Math.PI * pts[0].R * pts[0].wall };
  return pts.map((q, i) => {
    const y = T * 2 * Math.PI * q.R * q.wall;
    if (i) G += ((y + last.y) / 2) * (q.R - last.R);
    last = { R: q.R, y };
    return { R: q.R, G: R3(G), skin: R3((G - p * Math.PI * q.R * q.R) / (2 * Math.PI * q.R)), wall: R3(q.wall / q.rho), wallAbs: R3(q.wall), bonds: R3(q.bonds), far: R3(q.far), rho: R3(q.rho) };
  });
}
const cav = by('cavity');
const CAVITY = {};
for (const T of Ts(cav.filter((r) => r.job.hb === undefined))) CAVITY[T] = cavities(cav.filter((r) => r.job.T === T && r.job.hb === undefined), T, P);
const CAVOFF = {};
for (const T of Ts(cav.filter((r) => r.job.hb === 0))) { const q = cav.filter((r) => r.job.T === T && r.job.hb === 0); CAVOFF[T] = { p: q[0].job.p, rows: cavities(q, T, q[0].job.p) }; }

// One snapshot of water at T = 0.19, stored so every print opens with a real network ---------------
const w = new MBWater({ n: 150, L: Math.sqrt(150 / 0.97), T: 0.19, seed: 99 });
for (let s = 0; s < 40000; s++) { w.sweep(1); if (s % 200 === 0) w.tune(); }
const SNAP = [];
for (let i = 0; i < 150; i++) SNAP.push(Math.round((w.x[i] / w.L) * 1000), Math.round((w.y[i] / w.L) * 1000), Math.round((((w.t[i] % 6.2831853) + 6.2831853) % 6.2831853) / 6.2831853 * 1000));

const out = `// Generated by tools/make_table.mjs from long runs in tools/precompute_mb.mjs. Do not edit.
// Energy in units of one ideal hydrogen bond; T is kT in the same units.
export const P = ${P};
export const DENSITY = ${JSON.stringify(DENSITY)};
export const BULK = ${JSON.stringify(BULK)};
export const INSERT = ${JSON.stringify(INSERT)};
export const CROSS = ${JSON.stringify(CROSS)};
export const SHELLS = ${JSON.stringify(SHELLS)};
export const PMF = ${JSON.stringify(PMF)};
export const PAIR = ${JSON.stringify(PAIR)};
export const HOLES = ${JSON.stringify(HOLES)};
export const CAVITY = ${JSON.stringify(CAVITY)};
export const CAVOFF = ${JSON.stringify(CAVOFF)};
export const SNAPSHOT = ${JSON.stringify(SNAP)};
`;
writeFileSync(join(here, '../src/sim/mbtable.js'), out);
const show = (rows) => rows.forEach((p) => console.log(' ', JSON.stringify(p)));
console.log('DENSITY', JSON.stringify(DENSITY));
for (const key of [1, 'hole']) for (const k of ['on', 'box', 'off', 'press']) { console.log('INSERT', key, k); INSERT[key][k].forEach((p) => console.log(' ', p.T, 'dG', p.dG, 'dU', p.dU, 'pdV', p.pdV, '-TdS', p.mTdS, 'cp', p.cp, 'usw', p.usw, p.TgV !== undefined ? `Tg ${p.Tg} TgV ${p.TgV} Hbar ${p.Hbar}` : '', 'err', p.errG, p.errU, p.errS)); }
console.log('CROSS', JSON.stringify(CROSS));
console.log('PAIR', JSON.stringify(PAIR));
console.log('PMF on'); PMF.on.forEach((p) => console.log(' ', p.T, 'contact', p.contact, '±', p.err, 'water', p.water, 'separated', p.separated, '±', p.errSep, 'seeds', p.seeds.join(' ')));
console.log('PMF repulsive solute, no bonds'); PMF.wca.forEach((p) => console.log(' ', p.T, 'contact', p.contact, '±', p.err));
console.log('PMF repulsive solute, water'); PMF.wcaWater.forEach((p) => console.log(' ', p.T, 'contact', p.contact, '±', p.err));
console.log('PMF off'); PMF.off.forEach((p) => console.log(' ', p.T, 'contact', p.contact, '±', p.err, 'water', p.water, 'separated', p.separated, '±', p.errSep));
for (const T of Object.keys(HOLES)) for (const k of Object.keys(HOLES[T])) console.log('HOLES', T, k, 'rho', HOLES[T][k].rho, HOLES[T][k].R.map((r, i) => `${r}:${HOLES[T][k].W[i]}`).join(' '));
for (const T of Object.keys(CAVITY)) { console.log('CAVITY', T); CAVITY[T].forEach((c) => console.log(' ', c.R, 'G', c.G, 'skin', c.skin, 'wall', c.wall, 'bonds', c.bonds, 'far', c.far)); }
for (const T of Object.keys(CAVOFF)) { console.log('CAVOFF', T, 'p', CAVOFF[T].p); CAVOFF[T].rows.forEach((c) => console.log(' ', c.R, 'G', c.G, 'skin', c.skin, 'rho', c.rho)); }
