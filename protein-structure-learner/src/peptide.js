// Builds a polypeptide from its backbone angles, with Engh and Huber geometry.
// Kept free of three.js so the numbers can be tested in Node.

export const DEG = Math.PI / 180;

const BOND = { NCA: 1.458, CAC: 1.525, CN: 1.329, CO: 1.231, NH: 1.01 };
const ANGLE = { NCAC: 111.0 * DEG, CACN: 116.2 * DEG, CNCA: 121.7 * DEG, CACO: 120.1 * DEG, CNH: 119.0 * DEG };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

// Natural extension: put atom d so that a-b-c-d has the given bond, angle and torsion.
export function place(a, b, c, bond, angle, torsion) {
  const bc = norm(sub(c, b));
  const n = norm(cross(sub(b, a), bc));
  const m = cross(n, bc);
  const dx = -bond * Math.cos(angle);
  const dy = bond * Math.sin(angle) * Math.cos(torsion);
  const dz = bond * Math.sin(angle) * Math.sin(torsion);
  return [
    c[0] + bc[0] * dx + m[0] * dy + n[0] * dz,
    c[1] + bc[1] * dx + m[1] * dy + n[1] * dz,
    c[2] + bc[2] * dx + m[2] * dy + n[2] * dz,
  ];
}

export function dihedral(a, b, c, d) {
  const b0 = sub(a, b);
  const b1 = norm(sub(c, b));
  const b2 = sub(d, c);
  const v = sub(b0, [b1[0] * dot(b0, b1), b1[1] * dot(b0, b1), b1[2] * dot(b0, b1)]);
  const w = sub(b2, [b1[0] * dot(b2, b1), b1[1] * dot(b2, b1), b1[2] * dot(b2, b1)]);
  return Math.atan2(dot(cross(b1, v), w), dot(v, w));
}

// phi and psi are arrays in radians, one entry per residue. kinds holds 'A', 'G' or 'P'.
// Each residue gets N H CA HA HA2 CB C O. Acetyl and N-methyl caps close the two ends.
export function buildChain(phi, psi, kinds = null, omega = Math.PI) {
  const n = phi.length;
  const res = [];
  const ch3a = [0, 0, 0];
  const c0 = [1.52, 0, 0];
  const n1 = place([0, 1, 0], ch3a, c0, BOND.CN, ANGLE.CACN, Math.PI);
  const o0 = place(n1, ch3a, c0, BOND.CO, ANGLE.CACO, Math.PI);

  let prevCA = ch3a;
  let prevC = c0;
  let prevO = o0;
  let curN = n1;
  for (let i = 0; i < n; i++) {
    const ca = place(prevCA, prevC, curN, BOND.NCA, ANGLE.CNCA, omega);
    const c = place(prevC, curN, ca, BOND.CAC, ANGLE.NCAC, phi[i]);
    const nextN = place(curN, ca, c, BOND.CN, ANGLE.CACN, psi[i]);
    const o = place(curN, ca, c, BOND.CO, ANGLE.CACO, psi[i] + Math.PI);
    const h = place(prevO, prevC, curN, BOND.NH, ANGLE.CNH, Math.PI);

    // Ideal tetrahedral positions around CA. The first is CB in an L-amino acid.
    const b = sub(ca, curN);
    const cc = sub(c, ca);
    const a = cross(b, cc);
    const cb = [
      -0.58273431 * a[0] + 0.56802827 * b[0] - 0.54067466 * cc[0] + ca[0],
      -0.58273431 * a[1] + 0.56802827 * b[1] - 0.54067466 * cc[1] + ca[1],
      -0.58273431 * a[2] + 0.56802827 * b[2] - 0.54067466 * cc[2] + ca[2],
    ];
    const scale = 1.09 / 1.53;
    const ha = [
      ca[0] + (0.58273431 * a[0] + 0.56802827 * b[0] - 0.54067466 * cc[0]) * scale,
      ca[1] + (0.58273431 * a[1] + 0.56802827 * b[1] - 0.54067466 * cc[1]) * scale,
      ca[2] + (0.58273431 * a[2] + 0.56802827 * b[2] - 0.54067466 * cc[2]) * scale,
    ];
    const toCB = sub(cb, ca);
    const ha2 = add(ca, toCB, scale);
    res.push({ n: curN, h, ca, ha, cb, ha2, c, o, kind: kinds?.[i] ?? 'A' });
    prevCA = ca;
    prevC = c;
    prevO = o;
    curN = nextN;
  }
  const ch3b = place(prevCA, prevC, curN, BOND.NCA, ANGLE.CNCA, omega);
  const hEnd = place(prevO, prevC, curN, BOND.NH, ANGLE.CNH, Math.PI);
  return { res, cap: { ch3a, c0, o0, n: curN, h: hEnd, ch3b } };
}

// Shortest allowed contacts in angstroms, normal and outer limit (Ramakrishnan and Ramachandran 1965).
const LIMIT = {
  CC: [3.2, 3.0], CO: [2.8, 2.7], CN: [2.9, 2.8], CH: [2.4, 2.2], OO: [2.8, 2.7],
  NO: [2.7, 2.6], HO: [2.4, 2.2], NN: [2.7, 2.6], HN: [2.4, 2.2], HH: [2.0, 1.9],
};
const limitFor = (a, b) => LIMIT[a < b ? a + b : b + a];

// The atoms of one residue with its two neighbouring peptide units, as Ramachandran drew them.
// Returns the contacts that break the limit, worst first.
export function clashesOf(phiRad, psiRad, kind = 'A') {
  const { res, cap } = buildChain([phiRad], [psiRad], [kind]);
  const r = res[0];
  // Left unit moves with phi, right unit moves with psi.
  const left = [['C', cap.ch3a, 'CH3'], ['C', cap.c0, 'C'], ['O', cap.o0, 'O'], ['H', r.h, 'H']];
  const right = [['N', cap.n, 'N'], ['H', cap.h, 'H'], ['C', cap.ch3b, 'CH3'], ['O', r.o, 'O']];
  const mid = [['H', r.ha, 'HA']];
  if (kind === 'G') mid.push(['H', r.ha2, 'HA2']);
  else mid.push(['C', r.cb, 'CB']);
  const pairs = [];
  const test = (a, b, soft = 0) => {
    const d = Math.hypot(a[1][0] - b[1][0], a[1][1] - b[1][1], a[1][2] - b[1][2]);
    const [normal, outer] = limitFor(a[0], b[0]);
    if (d < normal - soft) pairs.push({ a: a[1], b: b[1], d, hard: d < outer - soft });
  };
  for (const a of left) for (const b of right) test(a, b);
  for (const a of left) for (const b of mid) test(a, b);
  for (const a of right) for (const b of mid) test(a, b, a[2] === 'N' && b[2] === 'CB' ? 0.1 : 0);
  // Three-bond contacts next to a hinge are softened: real bond angles open up to relieve them.
  // At the strict limit the alpha helix itself falls just outside, as Ramachandran found at 110 degrees.
  const SOFT = 0.15;
  test(['C', cap.c0], ['C', r.c], SOFT);
  test(['C', cap.ch3a], ['C', r.c]);
  test(['O', cap.o0], ['C', r.c]);
  test(['H', r.h], ['C', r.c], SOFT);
  test(['N', r.n], ['N', cap.n], SOFT);
  test(['N', r.n], ['H', cap.h], SOFT);
  test(['N', r.n], ['C', cap.ch3b]);
  test(['N', r.n], ['O', r.o]);
  // Two neighbouring N-H groups point the same way and repel, more than their sizes alone suggest.
  const amide = Math.hypot(r.h[0] - cap.n[0], r.h[1] - cap.n[1], r.h[2] - cap.n[2]);
  if (amide < 2.75) pairs.push({ a: r.h, b: cap.n, d: amide, hard: amide < 2.55 });
  return pairs.sort((x, y) => x.d - y.d);
}

// Value of one map square: 2 = fully allowed, 1 = allowed only at the outer limit, 0 = forbidden.
export function mapValue(phiDeg, psiDeg, kind = 'A') {
  if (kind === 'P' && Math.abs(phiDeg + 63) > 15) return 0;
  const c = clashesOf(phiDeg * DEG, psiDeg * DEG, kind === 'P' ? 'A' : kind);
  if (c.some((p) => p.hard)) return 0;
  return c.length ? 1 : 2;
}

// Backbone hydrogen bonds in a built chain, returned as {donor, acceptor, gap}.
// Acceptor is the O of residue i, donor the N-H of residue j.
export function hydrogenBonds(resA, resB = resA, sameChain = true, minGap = 3) {
  const out = [];
  for (let i = 0; i < resA.length; i++) {
    const o = resA[i].o;
    for (let j = 0; j < resB.length; j++) {
      if (sameChain && Math.abs(j - i) < minGap) continue;
      const n = resB[j].n;
      const h = resB[j].h;
      const d = Math.hypot(o[0] - n[0], o[1] - n[1], o[2] - n[2]);
      if (d > 3.5 || d < 2.4) continue;
      const hn = norm(sub(n, h));
      const ho = norm(sub(o, h));
      if (dot(hn, ho) > -0.45) continue; // N-H...O must be fairly straight
      out.push({ i, j, gap: j - i, d });
    }
  }
  return out;
}
