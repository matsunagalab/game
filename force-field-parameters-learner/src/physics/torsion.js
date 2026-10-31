// The dihedral term: U(φ) = Σ ½ Vn [1 + cos(nφ − γn)], fitted to a reference profile.
// φ = 180° is anti butane. γ is 0, 180, 0 for n = 1, 2, 3, the usual choice for an alkane.
import { lsq } from './linalg.js';

export const DEG = Math.PI / 180;
export const basis = (n, p) => (n === 2 ? 0.5 * (1 - Math.cos(2 * p)) : 0.5 * (1 + Math.cos(n * p)));
export const fourier = (V, p) => V[0] * basis(1, p) + V[1] * basis(2, p) + V[2] * basis(3, p);

// Reference profile: the three OPLS united-atom torsion coefficients for butane (Jorgensen, Madura & Swenson 1984),
// shown as a total energy. It stands in for a quantum scan, and the game labels it so.
export const QM_V = [1.411, -0.271, 3.145];
export const reference = p => fourier(QM_V, p);

// CH3…CH3 Lennard-Jones (OPLS united atom: σ 3.905 Å, ε 0.175 kcal/mol) across the middle bond.
// The plate draws hydrogens for clarity, but these energies are united-atom, and the 1–4 scale of one half is OPLS's.
const B = 1.53, TH = 112.4 * DEG;
export function ch3Distance(p) {
  // C1 and C4 hang off C2 and C3 at bond length B and angle TH. Near syn the angles open up, as they do in real butane.
  const th = TH + 7.6 * DEG * ((1 + Math.cos(p)) / 2) ** 2;
  const axial = B * Math.cos(Math.PI - th), radial = B * Math.sin(Math.PI - th);
  const dz = B + 2 * axial;
  const dx = radial - radial * Math.cos(p), dy = radial * Math.sin(p);
  return Math.hypot(dx, dy, dz);
}
const lj = r => { const q = (3.905 / r) ** 6; return 4 * 0.175 * q * (q - 1); };
const ANTI = lj(ch3Distance(Math.PI));
export const oneFour = (p, scale = 0.5) => scale * (lj(ch3Distance(p)) - ANTI);

// Best V1, V2, V3 against the reference, with an optional 1–4 term already in the energy.
export function fit(scale14 = 0, n = 72) {
  const X = [], y = [];
  for (let i = 0; i < n; i++) {
    const p = i / n * 2 * Math.PI;
    X.push([basis(1, p), basis(2, p), basis(3, p)]);
    y.push(reference(p) - oneFour(p, scale14));
  }
  return lsq(X, y);
}

export function rmse(V, scale14 = 0, n = 72) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n * 2 * Math.PI;
    s += (fourier(V, p) + oneFour(p, scale14) - reference(p)) ** 2;
  }
  return Math.sqrt(s / n);
}
