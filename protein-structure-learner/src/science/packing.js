// Side-chain contacts and a simple volume model of a protein core. Free of three.js and the page.

// Whole-residue volumes in cubic angstroms: Zamyatnin, Prog Biophys Mol Biol 1972, Table II.
export const VOLUME = { A: 88.6, R: 173.4, N: 114.1, D: 111.1, C: 108.5, Q: 143.8, E: 138.4, G: 60.1, H: 153.2, I: 166.7, L: 166.7, K: 168.6, M: 162.9, F: 189.9, P: 112.7, S: 89.0, T: 116.1, W: 227.8, Y: 193.6, V: 140.0 };

// Cost of putting a residue in a helix, relative to alanine, kcal/mol: Pace and Scholtz, Biophys J 1998.
export const HELIX_COST = { A: 0, L: 0.21, R: 0.21, M: 0.24, K: 0.26, Q: 0.39, E: 0.4, I: 0.41, W: 0.49, S: 0.5, Y: 0.53, F: 0.54, V: 0.61, H: 0.61, N: 0.65, T: 0.66, C: 0.68, D: 0.69, G: 1 };

// Slope of the cavity penalty, kcal/mol per cubic angstrom: Eriksson et al., Science 1992 (24 to 33 cal), Xu et al. 1998 (22 cal).
export const CAVITY_COST = 0.024;
export const FIT_TOLERANCE = 13; // cubic angstroms: smaller mismatches relax away

// Shape classes. Two residues of equal volume are not interchangeable: Ile forks at its first side-chain carbon,
// Leu at its second. Eriksson et al. 1993 measured the strain in T4 lysozyme L99I.
export const SHAPE = { A: 'small', G: 'small', S: 'small', V: 'beta', I: 'beta', T: 'beta', L: 'gamma', M: 'linear', F: 'ring', W: 'ring', Y: 'ring' };
export const SHAPE_NAME = { small: 'small', beta: 'forked early', gamma: 'forked late', linear: 'long and bendy', ring: 'ring' };

// Our own rule for "the fold survives": the total volume stays near natural.
// With the shape classes below, the full-fit rule is built to return the wild type: it is a teaching rule, not a finding.
export const FOLD_TOLERANCE = 80; // cubic angstroms

// Number of side-chain atom pairs closer than cutoff, for residue pairs at least minGap apart in sequence.
// p needs atomXYZ, atomRes, atomSide, and seq. Returns a Map keyed `${i},${j}` with i < j.
export function sideContacts(p, { cutoff = 4.5, minGap = 3, within = null } = {}) {
  const xyz = p.atomXYZ;
  const res = p.atomRes;
  const side = p.atomSide;
  const out = new Map();
  const n = res.length;
  const c2 = cutoff * cutoff;
  for (let a = 0; a < n; a++) {
    if (side[a] !== '1') continue;
    const ra = res[a];
    if (within && !within.has(ra)) continue;
    for (let b = a + 1; b < n; b++) {
      if (side[b] !== '1') continue;
      const rb = res[b];
      if (Math.abs(ra - rb) < minGap || (within && !within.has(rb))) continue;
      const dx = xyz[a * 3] - xyz[b * 3], dy = xyz[a * 3 + 1] - xyz[b * 3 + 1], dz = xyz[a * 3 + 2] - xyz[b * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < c2) {
        const k = ra < rb ? `${ra},${rb}` : `${rb},${ra}`;
        out.set(k, (out.get(k) ?? 0) + 1);
      }
    }
  }
  return out;
}

// sites: [{ res, wt, inHelix }], links: Map `${siteA},${siteB}` to a contact count.
// Each site shares some of its neighbours' extra or missing volume, in proportion to how much they touch.
export function coupling(sites, links) {
  const n = sites.length;
  const c = Array.from({ length: n }, () => new Array(n).fill(0));
  const sum = new Array(n).fill(0);
  for (const [k, v] of links) {
    const [a, b] = k.split(',').map(Number);
    c[a][b] = c[b][a] = v;
    sum[a] += v;
    sum[b] += v;
  }
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) c[a][b] = sum[a] ? c[a][b] / sum[a] : 0;
  return c;
}

// The state of a core with these letters at the sites. A site fits only if both its size and its shape class fit.
export function packing(sites, c, letters) {
  const delta = sites.map((s, i) => VOLUME[letters[i]] - VOLUME[s.wt]);
  const mismatch = delta.map((d, i) => d + delta.reduce((t, e, j) => t + c[i][j] * e, 0));
  const sized = mismatch.map((m) => Math.abs(m) <= FIT_TOLERANCE);
  const shaped = sites.map((s, i) => SHAPE[letters[i]] === SHAPE[s.wt]);
  const fit = sized.map((v, i) => v && shaped[i]);
  const cavity = mismatch.reduce((s, m) => s + Math.max(0, -m - FIT_TOLERANCE), 0);
  const clash = mismatch.reduce((s, m) => s + Math.max(0, m - FIT_TOLERANCE), 0);
  const helix = sites.reduce((s, x, i) => s + (x.inHelix ? HELIX_COST[letters[i]] - HELIX_COST[x.wt] : 0), 0);
  const total = delta.reduce((s, d) => s + d, 0);
  return { delta, mismatch, sized, shaped, fit, cavity, clash, helix, total, allFit: fit.every(Boolean), foldKept: Math.abs(total) <= FOLD_TOLERANCE };
}

// Knobs into holes in a coiled coil. The class cutoffs used in the game (40 and 70 degrees) are the game's own.
// The packing angle is the angle between the knob's CA-CB bond and the
// CA-CA vector at the base of its hole (Harbury et al. 1993). The base is the g'-a' pair for a knob at a,
// and the d'-e' pair for a knob at d. Returns degrees, one per knob, from the nearest helix.
export function packingAngles(p, numbers, position) {
  const at = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
  const firstSide = (r) => {
    for (let a = 0; a < p.atomRes.length; a++) if (p.atomRes[a] === r && p.atomSide[a] === '1') return at(p.atomXYZ, a);
    return null;
  };
  const find = (no, chain) => {
    for (let i = 0; i < p.n; i++) if (p.resno[i] === no && p.chain[i] === chain) return i;
    return -1;
  };
  const chains = [...new Set(p.chain)];
  const out = [];
  for (const no of numbers)
    for (const ch of chains) {
      const k = find(no, ch);
      if (k < 0) continue;
      const cb = firstSide(k);
      if (!cb) continue;
      const ca = at(p.caXYZ, k);
      const v = [0, 1, 2].map((q) => cb[q] - ca[q]);
      let best = null;
      for (const other of chains) {
        if (other === ch) continue;
        const [x, y] = position === 'a' ? [find(no - 1, other), find(no, other)] : [find(no, other), find(no + 1, other)];
        if (x < 0 || y < 0) continue;
        const A = at(p.caXYZ, x), B = at(p.caXYZ, y);
        const mid = [0, 1, 2].map((q) => (A[q] + B[q]) / 2);
        const d = Math.hypot(...mid.map((m, q) => m - cb[q]));
        const u = [0, 1, 2].map((q) => A[q] - B[q]);
        const cos = Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v));
        const angle = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
        if (!best || d < best.d) best = { d, angle, knob: k, cb, ca, base: [A, B] };
      }
      if (best) out.push(best);
    }
  return out;
}

export const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
};
