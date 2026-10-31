// DSSP after Kabsch and Sander, Biopolymers 1983: hydrogen bonds define secondary structure.
// Free of three.js and the page, so tools/test_science.mjs can run it in Node.
//
// A backbone is { n, nXYZ, caXYZ, cXYZ, oXYZ, seq, chain }, with flat coordinate arrays.
// Conventions used throughout: hb(i, j) means the C=O of residue i accepts from the N-H of residue j.

export const Q1Q2F = 0.084 * 332; // 0.42 e x 0.20 e x 332 kcal A / mol / e^2 (= 27.888)
export const HB_CUTOFF = -0.5; // kcal/mol
const MIN_DIST = 0.5; // two atoms closer than this are a modelling error; DSSP returns -9.9
const NO_BOND = 0;

const dist = (a, i, b, j) => Math.hypot(a[i * 3] - b[j * 3], a[i * 3 + 1] - b[j * 3 + 1], a[i * 3 + 2] - b[j * 3 + 2]);

// True when residue i is bonded to residue i-1 by a peptide link of sensible length.
export function linkedToPrevious(bb, i) {
  if (i <= 0 || bb.chain[i] !== bb.chain[i - 1]) return false;
  return dist(bb.cXYZ, i - 1, bb.nXYZ, i) < 2.5;
}

// DSSP has no hydrogens to read, so it puts each one 1.0 A from N, opposite the previous C=O.
export function placeHydrogens(bb) {
  const h = new Float32Array(bb.n * 3).fill(NaN);
  for (let i = 1; i < bb.n; i++) {
    if (!linkedToPrevious(bb, i) || bb.seq[i] === 'P') continue;
    const dx = bb.cXYZ[(i - 1) * 3] - bb.oXYZ[(i - 1) * 3];
    const dy = bb.cXYZ[(i - 1) * 3 + 1] - bb.oXYZ[(i - 1) * 3 + 1];
    const dz = bb.cXYZ[(i - 1) * 3 + 2] - bb.oXYZ[(i - 1) * 3 + 2];
    const l = Math.hypot(dx, dy, dz) || 1;
    h[i * 3] = bb.nXYZ[i * 3] + dx / l;
    h[i * 3 + 1] = bb.nXYZ[i * 3 + 1] + dy / l;
    h[i * 3 + 2] = bb.nXYZ[i * 3 + 2] + dz / l;
  }
  return h;
}

// The electrostatic energy of a C=O ... H-N pair, in kcal/mol.
// Returns the four distances as well: the game shows them.
export function hbEnergy(bb, hXYZ, acceptor, donor) {
  if (Number.isNaN(hXYZ[donor * 3])) return { e: NO_BOND, on: Infinity, ch: Infinity, oh: Infinity, cn: Infinity };
  const on = dist(bb.oXYZ, acceptor, bb.nXYZ, donor);
  const ch = dist(bb.cXYZ, acceptor, hXYZ, donor);
  const oh = dist(bb.oXYZ, acceptor, hXYZ, donor);
  const cn = dist(bb.cXYZ, acceptor, bb.nXYZ, donor);
  if (on < MIN_DIST || ch < MIN_DIST || oh < MIN_DIST || cn < MIN_DIST) return { e: -9.9, on, ch, oh, cn };
  const e = Q1Q2F * (1 / on + 1 / ch - 1 / oh - 1 / cn);
  return { e, on, ch, oh, cn };
}

// N-H ... O angle at H, in degrees (180 is straight), for display and teaching.
export function hbAngle(bb, hXYZ, acceptor, donor) {
  const hx = hXYZ[donor * 3], hy = hXYZ[donor * 3 + 1], hz = hXYZ[donor * 3 + 2];
  const a = [bb.nXYZ[donor * 3] - hx, bb.nXYZ[donor * 3 + 1] - hy, bb.nXYZ[donor * 3 + 2] - hz];
  const b = [bb.oXYZ[acceptor * 3] - hx, bb.oXYZ[acceptor * 3 + 1] - hy, bb.oXYZ[acceptor * 3 + 2] - hz];
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

// Every hydrogen bond in the backbone. Like mkdssp, each N-H keeps its two best acceptors, and a C=O may
// take as many donors as reach it. A residue cannot bond to its own chain neighbour.
export function findHBonds(bb, hXYZ = placeHydrogens(bb)) {
  const { n } = bb;
  const best = (list, entry) => {
    list.push(entry);
    list.sort((a, b) => a.e - b.e);
    if (list.length > 2) list.pop();
  };
  const toAcceptor = Array.from({ length: n }, () => []); // for each donor
  for (let d = 0; d < n; d++) {
    if (Number.isNaN(hXYZ[d * 3])) continue;
    for (let a = 0; a < n; a++) {
      if (a === d || a + 1 === d) continue; // the C=O just before this N-H is its own peptide
      if (dist(bb.caXYZ, a, bb.caXYZ, d) > 9) continue;
      const { e } = hbEnergy(bb, hXYZ, a, d);
      if (e < HB_CUTOFF) best(toAcceptor[d], { a, d, e });
    }
  }
  const out = [];
  for (let d = 0; d < n; d++) for (const b of toAcceptor[d]) out.push(b);
  const set = new Set(out.map((b) => b.a * n + b.d));
  return { list: out, has: (a, d) => a >= 0 && d >= 0 && a < n && d < n && set.has(a * n + d), hXYZ };
}

// Assigns one letter per residue. H: alpha, G: 3-10, I: pi, E: strand in a ladder, B: isolated bridge, T: turn, S: bend.
export function dssp(bb) {
  const { n } = bb;
  const H = findHBonds(bb);
  const ss = new Array(n).fill('C');
  const chainRun = (i, k) => {
    for (let x = i + 1; x <= i + k; x++) if (x >= n || !linkedToPrevious(bb, x)) return false;
    return true;
  };

  // n-turns: the C=O of i bonds to the N-H of i+n.
  const turn = { 3: new Uint8Array(n), 4: new Uint8Array(n), 5: new Uint8Array(n) };
  for (const k of [3, 4, 5]) for (let i = 0; i + k < n; i++) if (chainRun(i, k) && H.has(i, i + k)) turn[k][i] = 1;

  // Bridges between residues i and j.
  const linked = (i) => i > 0 && i < n - 1 && linkedToPrevious(bb, i) && linkedToPrevious(bb, i + 1);
  const bridge = [];
  for (let i = 1; i < n - 1; i++) {
    if (!linked(i)) continue;
    for (let j = i + 3; j < n - 1; j++) {
      if (!linked(j)) continue;
      const par = (H.has(i - 1, j) && H.has(j, i + 1)) || (H.has(j - 1, i) && H.has(i, j + 1));
      const anti = (H.has(i, j) && H.has(j, i)) || (H.has(i - 1, j + 1) && H.has(j - 1, i + 1));
      if (par || anti) bridge.push({ i, j, par, type: par ? 'P' : 'A' });
    }
  }

  // Consecutive bridges of the same kind make a ladder.
  bridge.sort((x, y) => x.i - y.i || x.j - y.j);
  const ladders = [];
  for (const b of bridge) {
    const go = ladders.find((l) => {
      const last = l.pairs[l.pairs.length - 1];
      return l.type === b.type && last.i + 1 === b.i && last.j + (b.type === 'P' ? 1 : -1) === b.j;
    });
    if (go) go.pairs.push({ i: b.i, j: b.j });
    else ladders.push({ type: b.type, pairs: [{ i: b.i, j: b.j }] });
  }

  // Merge two ladders across a beta bulge: a gap of at most 1 on one side and at most 4 on the other.
  const span = (l) => {
    const is = l.pairs.map((p) => p.i);
    const js = l.pairs.map((p) => p.j);
    return { iMin: Math.min(...is), iMax: Math.max(...is), jMin: Math.min(...js), jMax: Math.max(...js) };
  };
  for (let again = true; again; ) {
    again = false;
    outer: for (let a = 0; a < ladders.length; a++)
      for (let b = a + 1; b < ladders.length; b++) {
        const A = ladders[a];
        const B = ladders[b];
        if (A.type !== B.type) continue;
        const x = span(A);
        const y = span(B);
        const gapI = y.iMin - x.iMax - 1;
        const gapJ = A.type === 'P' ? y.jMin - x.jMax - 1 : x.jMin - y.jMax - 1;
        if (gapI < 0 || gapJ < 0) continue;
        if (Math.min(gapI, gapJ) <= 1 && Math.max(gapI, gapJ) <= 4) {
          A.pairs.push(...B.pairs);
          A.bulge = [...(A.bulge ?? []), [x.iMax, y.iMin], A.type === 'P' ? [x.jMax, y.jMin] : [y.jMax, x.jMin]];
          ladders.splice(b, 1);
          again = true;
          break outer;
        }
      }
  }

  const put = (i, c) => {
    if (ss[i] === 'C') ss[i] = c;
  };
  // Priority: H, B, E, G, I, T, S. Lay down the strongest first, and never overwrite.
  for (let i = 1; i + 4 < n; i++) if (turn[4][i - 1] && turn[4][i]) for (let k = 0; k < 4; k++) ss[i + k] = 'H';
  for (const l of ladders) {
    const isolated = l.pairs.length === 1 && !l.bulge;
    for (const p of l.pairs) {
      // An isolated bridge must not block a ladder that also runs through this residue.
      for (const x of [p.i, p.j]) {
        if (isolated) put(x, 'B');
        else if (ss[x] === 'C' || ss[x] === 'B') ss[x] = 'E';
      }
    }
    if (l.bulge) for (const [u, v] of l.bulge) for (let x = u; x <= v; x++) put(x, 'E');
  }
  for (const [k, c] of [[3, 'G'], [5, 'I']]) {
    for (let i = 1; i + k < n; i++) {
      if (!(turn[k][i - 1] && turn[k][i])) continue;
      // A 3-10 or pi helix only claims residues that are still free.
      let free = true;
      for (let x = 0; x < k; x++) if (!(ss[i + x] === 'C' || ss[i + x] === c)) free = false;
      if (free) for (let x = 0; x < k; x++) ss[i + x] = c;
    }
  }
  for (const k of [3, 4, 5]) for (let i = 0; i + k < n; i++) if (turn[k][i]) for (let x = 1; x < k; x++) put(i + x, 'T');
  for (let i = 2; i < n - 2; i++) {
    if (!chainRun(i - 2, 4)) continue;
    const u = [0, 1, 2].map((k) => bb.caXYZ[i * 3 + k] - bb.caXYZ[(i - 2) * 3 + k]);
    const v = [0, 1, 2].map((k) => bb.caXYZ[(i + 2) * 3 + k] - bb.caXYZ[i * 3 + k]);
    const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v));
    if ((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI > 70) put(i, 'S');
  }
  return { ss: ss.join(''), hbonds: H.list, has: H.has, hXYZ: H.hXYZ, turn, ladders };
}

// Reduces the eight DSSP letters to helix, strand, other.
export const q3 = (c) => ('HGI'.includes(c) ? 'H' : 'EB'.includes(c) ? 'E' : 'C');

// Phi and psi in degrees, or null where a neighbour is missing.
export function torsions(bb) {
  const at = (a, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
  const tor = (p, q, r, s) => {
    const b0 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const b1 = [r[0] - q[0], r[1] - q[1], r[2] - q[2]];
    const b2 = [s[0] - r[0], s[1] - r[1], s[2] - r[2]];
    const l = Math.hypot(...b1);
    const u = b1.map((x) => x / l);
    const d0 = b0[0] * u[0] + b0[1] * u[1] + b0[2] * u[2];
    const d2 = b2[0] * u[0] + b2[1] * u[1] + b2[2] * u[2];
    const v = b0.map((x, k) => x - d0 * u[k]);
    const w = b2.map((x, k) => x - d2 * u[k]);
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return (Math.atan2(c[0] * w[0] + c[1] * w[1] + c[2] * w[2], v[0] * w[0] + v[1] * w[1] + v[2] * w[2]) * 180) / Math.PI;
  };
  const phi = new Array(bb.n).fill(null);
  const psi = new Array(bb.n).fill(null);
  for (let i = 0; i < bb.n; i++) {
    if (linkedToPrevious(bb, i)) phi[i] = tor(at(bb.cXYZ, i - 1), at(bb.nXYZ, i), at(bb.caXYZ, i), at(bb.cXYZ, i));
    if (i + 1 < bb.n && linkedToPrevious(bb, i + 1)) psi[i] = tor(at(bb.nXYZ, i), at(bb.caXYZ, i), at(bb.cXYZ, i), at(bb.nXYZ, i + 1));
  }
  return { phi, psi };
}
