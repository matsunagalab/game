// Polyalanine chain with ACE and NME caps. Heavy atoms plus amide H; CA and CB are united atoms.
// Bonded terms and charges come from AMBER ff99 (ALA charges summed onto the united atoms).
// Backbone φ/ψ is handled by one map term per residue, like CMAP.
import { MDSystem, buildExclusions, DEG } from './md.js';

const ELEMENT = {
  N:  { m: 14.007, q: -0.4157, rmin: 1.824, e: 0.17 },
  H:  { m: 3.024,  q: 0.2719,  rmin: 0.6,   e: 0.0157 },   // mass repartitioned from nothing: H is heavier so dt can be larger
  CA: { m: 13.019, q: 0.1160,  rmin: 2.0,   e: 0.10 },
  CB: { m: 15.035, q: -0.0016, rmin: 2.1,   e: 0.16 },
  C:  { m: 12.011, q: 0.5973,  rmin: 1.908, e: 0.086 },
  O:  { m: 15.999, q: -0.5679, rmin: 1.6612, e: 0.21 },
};
ELEMENT.CH3A = { ...ELEMENT.CB, q: 0.0288 - 0.0 };   // ACE methyl: balances C(0.5972)+O(-0.5679)
ELEMENT.CH3N = { ...ELEMENT.CB, q: 0.1438 };         // NME methyl: balances N+H

const BOND = {
  'N-H': [434, 1.01], 'N-CA': [337, 1.449], 'CA-C': [317, 1.522], 'C-O': [570, 1.229],
  'C-N': [490, 1.335], 'CA-CB': [310, 1.526], 'CH3A-C': [317, 1.522], 'N-CH3N': [337, 1.449],
};
const ANGLE = {
  'C-N-H': [50, 120], 'C-N-CA': [50, 121.9], 'H-N-CA': [50, 118.04], 'N-CA-C': [63, 110.1], 'N-CA-CB': [80, 109.7],
  'CB-CA-C': [63, 111.1], 'CA-C-O': [80, 120.4], 'CA-C-N': [70, 116.6], 'O-C-N': [80, 122.9],
  'CH3A-C-O': [80, 120.4], 'CH3A-C-N': [70, 116.6], 'C-N-CH3N': [50, 121.9], 'H-N-CH3N': [50, 118.04],
};

function place(a, b, c, r, theta, tors) {
  const bc = sub(c, b), n = norm(cross(sub(b, a), bc)), bcn = norm(bc), m = cross(n, bcn);
  const dx = -r * Math.cos(theta), dy = r * Math.sin(theta) * Math.cos(tors), dz = r * Math.sin(theta) * Math.sin(tors);
  return [c[0] + bcn[0] * dx + m[0] * dy + n[0] * dz, c[1] + bcn[1] * dx + m[1] * dy + n[1] * dz, c[2] + bcn[2] * dx + m[2] * dy + n[2] * dz];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Backbone coordinates for a list of (φ,ψ) pairs, in degrees. Returns N, CA, C, O per residue.
export function backbone(angles) {
  const NCA = 1.449, CAC = 1.522, CN = 1.335;
  const tNCAC = 110.1 * DEG, tCACN = 116.6 * DEG, tCNCA = 121.9 * DEG;
  const res = [];
  let N = [0, 0, 0], CA = [NCA, 0, 0];
  let C = add(CA, [CAC * Math.cos(Math.PI - tNCAC), CAC * Math.sin(Math.PI - tNCAC), 0]);
  for (let i = 0; i < angles.length; i++) {
    const [phi, psi] = angles[i];
    if (i > 0) {
      const p = res[i - 1];
      N = place(p.N, p.CA, p.C, CN, tCACN, psi0(angles, i - 1) * DEG);
      CA = place(p.CA, p.C, N, NCA, tCNCA, Math.PI);
      C = place(p.C, N, CA, CAC, tNCAC, phi * DEG);
    }
    const O = place(N, CA, C, 1.229, 120.4 * DEG, (psi + 180) * DEG);
    res.push({ N, CA, C, O });
  }
  return res;
}
const psi0 = (angles, i) => angles[i][1];

export function buildPolyAla(n, angles) {
  const names = [], pos = [], bonds = [], res = [];
  const add1 = (name, p) => { names.push(name); pos.push(p); return names.length - 1; };
  const bb = backbone(angles);

  // ACE cap, placed from the first residue so its C–N bond lines up.
  const first = bb[0];
  const c0 = place(first.C, first.CA, first.N, 1.335, 121.9 * DEG, -120 * DEG);
  const ch3 = place(first.CA, first.N, c0, 1.522, 116.6 * DEG, Math.PI);
  const o0 = place(first.CA, first.N, c0, 1.229, 122.9 * DEG, 0);
  const iCH3 = add1('CH3A', ch3), iC0 = add1('C', c0), iO0 = add1('O', o0);
  bonds.push(['CH3A-C', iCH3, iC0], ['C-O', iC0, iO0]);

  let prevC = iC0, prevPos = c0, prevCA = ch3;
  for (let i = 0; i < n; i++) {
    const b = bb[i];
    const iN = add1('N', b.N);
    const h = place(prevCA, prevPos, b.N, 1.01, 120 * DEG, 0);
    const iH = add1('H', h);
    const iCA = add1('CA', b.CA);
    const vb = sub(b.CA, b.N), vc = sub(b.C, b.CA), va = cross(vb, vc);
    const cb = add(add(add(scl(va, -0.58273431), scl(vb, 0.56802827)), scl(vc, -0.54067466)), b.CA);
    const iCB = add1('CB', cb);
    const iC = add1('C', b.C);
    const iO = add1('O', b.O);
    bonds.push(['C-N', prevC, iN], ['N-H', iN, iH], ['N-CA', iN, iCA], ['CA-CB', iCA, iCB], ['CA-C', iCA, iC], ['C-O', iC, iO]);
    res.push({ N: iN, H: iH, CA: iCA, CB: iCB, C: iC, O: iO, prevC });
    prevC = iC; prevPos = b.C; prevCA = b.CA;
  }
  // NME cap.
  const last = bb[n - 1];
  const nN = place(last.N, last.CA, last.C, 1.335, 116.6 * DEG, angles[n - 1][1] * DEG);
  const hN = place(last.CA, last.C, nN, 1.01, 120 * DEG, 0);
  const cN = place(last.CA, last.C, nN, 1.449, 121.9 * DEG, Math.PI);
  const iNN = add1('N', nN), iHN = add1('H', hN), iCN = add1('CH3N', cN);
  bonds.push(['C-N', prevC, iNN], ['N-H', iNN, iHN], ['N-CH3N', iNN, iCN]);
  res.forEach((r, i) => { r.nextN = i < n - 1 ? res[i + 1].N : iNN; });

  const N = names.length;
  const bondList = bonds.map(([t, i, j]) => [i, j, BOND[t][0], BOND[t][1]]);

  const adj = Array.from({ length: N }, () => []);
  for (const b of bondList) { adj[b[0]].push(b[1]); adj[b[1]].push(b[0]); }
  const angleList = [];
  for (let j = 0; j < N; j++) for (let p = 0; p < adj[j].length; p++) for (let q = p + 1; q < adj[j].length; q++) {
    const a = adj[j][p], c = adj[j][q];
    const key = ANGLE[`${names[a]}-${names[j]}-${names[c]}`] || ANGLE[`${names[c]}-${names[j]}-${names[a]}`];
    if (key) angleList.push([a, j, c, key[0], key[1] * DEG]);
  }

  // Peptide planarity: ω-type torsions on every C–N bond, plus impropers at C and N.
  const dihedrals = [], impropers = [];
  for (const b of bondList) {
    const [i, j] = b;
    if (!((names[i] === 'C' && names[j] === 'N') || (names[i] === 'N' && names[j] === 'C'))) continue;
    const c = names[i] === 'C' ? i : j, nn = names[i] === 'C' ? j : i;
    for (const a of adj[c]) if (a !== nn) for (const d of adj[nn]) if (d !== c) dihedrals.push([a, c, nn, d, 2.5, 2, Math.PI]);
  }
  for (let c = 0; c < N; c++) {
    if (names[c] === 'C') { const nb = adj[c]; dihedrals.push([nb[0], nb[1], c, nb[2], 10.5, 2, Math.PI]); }
    if (names[c] === 'N') { const nb = adj[c]; dihedrals.push([nb[0], nb[1], c, nb[2], 1.0, 2, Math.PI]); }
  }
  // Chirality of the united-atom CA.
  const ramaResidues = res.map(r => [r.prevC, r.N, r.CA, r.C, r.nextN]);

  const sigmas = names.map(s => ELEMENT[s].rmin * 2 / Math.pow(2, 1 / 6));
  const epsilons = names.map(s => ELEMENT[s].e);
  const charges = names.map(s => ELEMENT[s].q);
  const masses = names.map(s => ELEMENT[s].m);
  return { names, pos, bondList, angleList, dihedrals, impropers, res, sigmas, epsilons, charges, masses, ramaResidues };
}

export function makePeptideSystem(top, { rama, dielectric = 4 }) {
  const ex = buildExclusions(top.names.length, top.bondList);
  // The φ/ψ map stands for every interaction between neighbouring residues, so those pairs are left out.
  const seq = residueOf(top);
  for (let i = 0; i < seq.length; i++) for (let j = i + 1; j < seq.length; j++) {
    if (Math.abs(seq[i] - seq[j]) <= 1) ex[i].set(j, 0);
  }
  const sys = new MDSystem({
    masses: top.masses, charges: top.charges, sigmas: top.sigmas, epsilons: top.epsilons,
    bonds: top.bondList, angles: top.angleList, dihedrals: top.dihedrals, impropers: [],
    exclusions: ex, scale14: { lj: 0.5, el: 1 / 1.2 }, dielectric,
  });
  top.pos.forEach((p, i) => { sys.x[3 * i] = p[0]; sys.x[3 * i + 1] = p[1]; sys.x[3 * i + 2] = p[2]; });
  // Chirality: harmonic improper around the value seen in the ideal build.
  const imp = [];
  for (const r of top.res) {
    const ideal = idealChirality(sys.x, r);
    imp.push([r.N, r.C, r.CB, r.CA, 40, ideal]);
  }
  sys.impropers = imp;
  sys.rama = rama ? { ...rama, residues: top.ramaResidues, gradient: rama.gradient, dphi: 0, dpsi: 0 } : null;
  if (sys.rama) {
    // gradient() writes dphi/dpsi on this same object.
    const R = sys.rama, g = rama.lookup;
    R.gradient = (phi, psi) => g(phi, psi, R);
  }
  sys.forces();
  return sys;
}

function residueOf(top) {
  const seq = new Array(top.names.length).fill(0);
  top.res.forEach((r, i) => { for (const k of ['N', 'H', 'CA', 'CB', 'C', 'O']) seq[r[k]] = i + 1; });
  const last = top.res.length + 1;
  for (let i = top.res[top.res.length - 1].O + 1; i < seq.length; i++) seq[i] = last;
  return seq;
}

import { dihedral } from './md.js';
function idealChirality(x, r) { return dihedral(x, r.N, r.C, r.CB, r.CA); }

// Hydrogen bonds: C=O(i) ··· H–N(j). Returns list of [i, j, r] and the count of i→i+4 ones.
export function hbonds(sys, top, out) {
  const { x } = sys;
  const R = top.res;
  let helical = 0, n = 0;
  for (let a = 0; a < R.length; a++) {
    const O = 3 * R[a].O;
    for (let b = a + 3; b < R.length; b++) {
      const H = 3 * R[b].H, Nn = 3 * R[b].N;
      const dx = x[H] - x[O], dy = x[H + 1] - x[O + 1], dz = x[H + 2] - x[O + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 6.25) continue;                                     // H···O < 2.5 Å
      const nx = x[Nn] - x[H], ny = x[Nn + 1] - x[H + 1], nz = x[Nn + 2] - x[H + 2];
      const c = (dx * nx + dy * ny + dz * nz) / Math.sqrt(d2 * (nx * nx + ny * ny + nz * nz));
      if (c < 0.5) continue;                                       // N–H···O > 120°, measured at H
      if (out) { out[n * 2] = a; out[n * 2 + 1] = b; }
      n++;
      if (b - a === 4) helical++;
    }
  }
  return { n, helical };
}
