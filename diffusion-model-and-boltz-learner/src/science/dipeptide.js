// Alanine dipeptide, the molecule of our molecular dynamics, ACE-ALA-NME, heavy atoms. Coordinates are the starting structure of that simulation,
// from pdbfixer's alanine-dipeptide.pdb as used by tools/md_alanine.py. Bond lengths and angles stay fixed here. Only phi and psi turn.
export const ATOMS = ['CH3', 'C', 'O', 'N', 'CA', 'CB', 'C', 'O', 'N', 'CH3'];
const XYZ = [2.000, 2.090, 0, 3.427, 2.641, 0, 4.391, 1.877, 0, 3.555, 3.970, 0, 4.853, 4.614, 0, 5.661, 4.221, -1.232, 4.713, 6.129, 0, 3.601, 6.653, 0, 5.846, 6.835, 0, 5.846, 8.284, 0];
export const BONDS = [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [4, 6], [6, 7], [6, 8], [8, 9]];
const N = 10, PHI = [1, 3, 4, 6], PSI = [3, 4, 6, 8], BEFORE = [0, 1, 2], AFTER = [7, 8, 9];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const at = (x, i) => [x[3 * i], x[3 * i + 1], x[3 * i + 2]];

// The dihedral through four atoms, in degrees, by the usual IUPAC sign.
export function dihedral(x, [a, b, c, d]) {
  const p = at(x, a), q = at(x, b), r = at(x, c), s = at(x, d), b1 = sub(q, p), b2 = sub(r, q), b3 = sub(s, r), n1 = cross(b1, b2), n2 = cross(b2, b3), l = Math.sqrt(dot(b2, b2));
  return (Math.atan2(l * dot(b1, n2), dot(n1, n2)) * 180) / Math.PI;
}

function turn(x, atoms, c, axis, deg, from, to) {
  const t = (deg * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t), l = Math.sqrt(dot(axis, axis)), u = [axis[0] / l, axis[1] / l, axis[2] / l];
  for (const i of atoms) {
    const v = sub(at(from, i), c), k = dot(u, v), w = cross(u, v);
    for (let e = 0; e < 3; e += 1) to[3 * i + e] = c[e] + v[e] * co + w[e] * si + u[e] * k * (1 - co);
  }
}

const REF = Float64Array.from(XYZ), R0 = dihedral(REF, PHI), S0 = dihedral(REF, PSI), CENTRE = at(REF, 4);
// One conformer of the molecule, set by phi and psi in degrees, written at offset k of a set. The central residue stays where it is.
export function conformer(phi, psi, out, k = 0) {
  const o = k * N * 3, x = REF.slice(), N1 = at(REF, 3), CA = at(REF, 4), C1 = at(REF, 6);
  turn(REF, BEFORE, CA, sub(CA, N1), R0 - phi, REF, x); // These atoms lie before the axis, so the turn runs the other way.
  turn(REF, AFTER, C1, sub(C1, CA), psi - S0, REF, x);
  for (let i = 0; i < N; i += 1) for (let e = 0; e < 3; e += 1) out[o + 3 * i + e] = x[3 * i + e] - CENTRE[e];
  return out;
}
export const DIHEDRALS = { PHI, PSI };
