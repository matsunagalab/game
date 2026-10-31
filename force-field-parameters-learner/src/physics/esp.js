// Electrostatic potential fitting for a real molecule shape: trans N-methylacetamide, the peptide unit.
// The reference field stands in for quantum chemistry: it comes from a hidden set of off-atom charges,
// which atom-centred charges cannot reproduce exactly, tuned to the 3.8 D dipole of this molecule.
// The fit itself is a true least-squares problem with a net-charge constraint, and the restraint is the RESP form.
import { solve } from './linalg.js';

export const COUL = 332.06;       // kcal/mol·Å/e²
export const DEBYE = 4.80320;     // e·Å to debye
const D = Math.PI / 180;
const METHYL = 0.035;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const n = Math.hypot(...a); return [a[0] / n, a[1] / n, a[2] / n]; };

// Place atom d from a, b, c by bond length, angle and dihedral (internal coordinates).
function place(a, b, c, r, theta, phi) {
  const bc = norm(sub(c, b)), n = norm(cross(sub(b, a), bc)), m = cross(n, bc);
  const t = theta * D, p = phi * D;
  const x = -r * Math.cos(t), y = r * Math.sin(t) * Math.cos(p), z = r * Math.sin(t) * Math.sin(p);
  return [c[0] + bc[0] * x + m[0] * y + n[0] * z, c[1] + bc[1] * x + m[1] * y + n[1] * z, c[2] + bc[2] * x + m[2] * y + n[2] * z];
}

// Atom classes share one charge, as equivalent atoms do in RESP.
export const CLASSES = [
  { name: 'C of CH₃ (acetyl)', short: 'Cα', buried: true, heavy: true },
  { name: 'H of CH₃ (acetyl)', short: 'H', count: 3 },
  { name: 'C of C=O', short: 'C', heavy: true },
  { name: 'O', short: 'O', heavy: true },
  { name: 'N', short: 'N', heavy: true },
  { name: 'H on N', short: 'HN' },
  { name: 'C of CH₃ (N-methyl)', short: 'Cm', buried: true, heavy: true },
  { name: 'H of CH₃ (N-methyl)', short: 'Hm', count: 3 },
];

// Atoms in class order: 12 atoms for the trans peptide. omega = 180 is trans, 0 is cis.
export function nma(omega = 180) {
  const CA = [0, 0, 0], C = [1.52, 0, 0], ref = [1.0, 1.0, 0];
  const O = place(ref, CA, C, 1.229, 120.5, 0);
  const N = place(ref, CA, C, 1.335, 116.5, 180);
  const HN = place(CA, C, N, 1.01, 119.5, omega + 180);
  const CM = place(CA, C, N, 1.45, 121.9, omega);
  const hsOf = (c, b, a, off) => [0, 120, 240].map(p => place(a, b, c, 1.09, 109.5, p + off));
  const Ha = hsOf(CA, C, N, 60), Hm = hsOf(CM, N, C, 60);
  const atoms = [
    { p: CA, c: 0, el: 'C' }, ...Ha.map(p => ({ p, c: 1, el: 'H' })),
    { p: C, c: 2, el: 'C' }, { p: O, c: 3, el: 'O' }, { p: N, c: 4, el: 'N' }, { p: HN, c: 5, el: 'H' },
    { p: CM, c: 6, el: 'C' }, ...Hm.map(p => ({ p, c: 7, el: 'H' })),
  ];
  // Centre the molecule.
  const m = [0, 1, 2].map(k => atoms.reduce((s, a) => s + a.p[k], 0) / atoms.length);
  for (const a of atoms) a.p = sub(a.p, m);
  return { atoms, C: atoms[4].p, O: atoms[5].p, N: atoms[6].p, HN: atoms[7].p };
}

const VDW = { C: 1.7, H: 1.2, O: 1.52, N: 1.55 };
export const vdwOf = a => VDW[a.el];

// The hidden reference: atom charges plus two lone pairs on O, a π cloud above and below N, and methyl polarisation.
function hiddenCharges(m, scale = 1) {
  const sites = [];
  const q = [-0.12, 0.05, 0.62, -0.28, -0.3, 0.3, -0.05, 0.05];
  for (const a of m.atoms) sites.push({ p: a.p, q: q[a.c] * scale });
  const co = norm(sub(m.O, m.C)), cn = norm(sub(m.N, m.C)), up = norm(cross(co, cn)), side = norm(cross(up, co));
  for (const s of [-1, 1]) {
    sites.push({ p: [0, 1, 2].map(k => m.O[k] + 0.38 * co[k] + 0.62 * s * side[k]), q: -0.15 * scale });
    sites.push({ p: [0, 1, 2].map(k => m.N[k] + 0.45 * s * up[k]), q: -0.09 * scale });
    sites.push({ p: [0, 1, 2].map(k => m.N[k] - 0.9 * s * up[k] * 0), q: 0.09 * scale });
    sites.push({ p: [0, 1, 2].map(k => m.O[k]), q: 0.15 * scale });
  }
  // Methyl groups. These hidden sites are put there on purpose so that the plain fit trades charge between a buried
  // carbon and its hydrogens, as real ESP fits do. The size of the runaway is therefore a teaching choice.
  for (const c of [0, 6]) {
    const ca = m.atoms.find(a => a.c === c).p, hs = m.atoms.filter(a => a.c === c + 1);
    for (const h of hs) {
      const u = norm(sub(h.p, ca));
      sites.push({ p: [0, 1, 2].map(k => ca[k] + 1.75 * u[k]), q: METHYL * scale });
      sites.push({ p: [0, 1, 2].map(k => ca[k] + 0.75 * u[k]), q: -METHYL * scale });
    }
  }
  // Net-neutral by construction: a small shift of the remainder onto the carbonyl carbon.
  const net = sites.reduce((s, x) => s + x.q, 0);
  sites.push({ p: m.C, q: -net });
  return sites;
}

export function dipole(sites) {
  const v = [0, 0, 0];
  for (const s of sites) for (let k = 0; k < 3; k++) v[k] += s.q * s.p[k];
  return Math.hypot(...v) * DEBYE;
}
export const TARGET_DIPOLE = 3.8;      // D, the QM value quoted for trans NMA

// Fibonacci points on nested shells at 1.4 to 2.0 times the vdW radius: the Merz-Kollman scheme, at a similar density.
export function shellPoints(m, shells = [1.4, 1.6, 1.8, 2.0], perAtom = 240) {
  const pts = [];
  for (const f of shells) for (const a of m.atoms) {
    const R = vdwOf(a) * f;
    for (let i = 0; i < perAtom; i++) {
      const z = 1 - 2 * (i + 0.5) / perAtom, r = Math.sqrt(1 - z * z), t = i * 2.399963;
      const p = [a.p[0] + R * r * Math.cos(t), a.p[1] + R * r * Math.sin(t), a.p[2] + R * z];
      let ok = true;
      for (const b of m.atoms) if (Math.hypot(p[0] - b.p[0], p[1] - b.p[1], p[2] - b.p[2]) < vdwOf(b) * f - 1e-6) { ok = false; break; }
      if (ok) pts.push(p);
    }
  }
  return pts;
}

export const NC = CLASSES.length;

// Everything needed from a molecule and a field: normal matrix A, right-hand side b, and |V|².
export function buildProblem(m, sites, pts = shellPoints(m)) {
  const A = Array.from({ length: NC }, () => new Array(NC).fill(0)), b = new Array(NC).fill(0);
  let vv = 0;
  for (const p of pts) {
    const a = new Array(NC).fill(0);
    for (const at of m.atoms) a[at.c] += COUL / Math.hypot(p[0] - at.p[0], p[1] - at.p[1], p[2] - at.p[2]);
    let V = 0;
    for (const s of sites) V += COUL * s.q / Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]);
    vv += V * V;
    for (let i = 0; i < NC; i++) { b[i] += a[i] * V; for (let j = 0; j < NC; j++) A[i][j] += a[i] * a[j]; }
  }
  return { A, b, vv, n: pts.length };
}

// Relative RMS error of the fit: 0 is perfect, 1 is no better than no charges at all. O(NC²), so it runs on every touch.
export function rrms(pr, q) {
  let s = pr.vv;
  for (let i = 0; i < NC; i++) { s -= 2 * q[i] * pr.b[i]; for (let j = 0; j < NC; j++) s += q[i] * q[j] * pr.A[i][j]; }
  return Math.sqrt(Math.max(0, s) / pr.vv);
}

export const counts = () => CLASSES.map(c => c.count ?? 1);
export const netCharge = q => q.reduce((s, v, i) => s + v * (CLASSES[i].count ?? 1), 0);

// Constrained least squares: minimise the field error under Σ n·q = 0 (Lagrange multiplier).
// a > 0 adds the RESP hyperbolic restraint a·(√(q² + b²) − b) on every non-hydrogen atom, solved by reweighted iteration.
export function fit(pr, a = 0, b = 0.1, iters = 12) {
  const n = counts();
  let q = new Array(NC).fill(0);
  const AU = 627.51 ** 2 / 2;                       // a is in atomic units, as in RESP; the field here is in kcal/mol/e
  for (let it = 0; it < (a > 0 ? iters : 1); it++) {
    const M = Array.from({ length: NC + 1 }, (_, i) => Array.from({ length: NC + 1 }, (_, j) => (i < NC && j < NC ? pr.A[i][j] : 0)));
    const rhs = [...pr.b, 0];
    for (let i = 0; i < NC; i++) {
      M[i][NC] = n[i]; M[NC][i] = n[i];
      if (a > 0 && CLASSES[i].heavy) M[i][i] += a * AU / Math.sqrt(q[i] * q[i] + b * b);
    }
    q = solve(M, rhs).slice(0, NC);
  }
  return q;
}

export function reference(omega = 180) {
  const m = nma(omega);
  // Find the single scale that gives the target dipole for the trans form, then reuse it.
  const t = nma(180), d0 = dipole(hiddenCharges(t, 1));
  const sites = hiddenCharges(m, TARGET_DIPOLE / d0);
  return { m, sites, pr: buildProblem(m, sites) };
}

export function modelDipole(m, q) {
  return dipole(m.atoms.map(a => ({ p: a.p, q: q[a.c] })));
}
