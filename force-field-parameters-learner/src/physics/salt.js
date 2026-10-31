// A salt bridge in water, as a one-dimensional potential of mean force along the guanidinium-carboxylate distance.
// The association constant is a real integral of that curve over the contact pair, and the osmotic coefficient
// follows from it by mass action. The curve itself is a teaching model. Two of its numbers are tied to the literature:
//   Debiec et al. 2014, Table 1: guanidinium-acetate Ka is 0.37 M⁻¹ in experiment and 4.06 M⁻¹ in CHARMM27. The stock curve is set to 4.06.
//   Huang et al. 2017: the CHARMM36m NBFIX moves this pair's Rmin from the combining-rule 3.55 Å to 3.637 Å.
// LEVER is fitted so that this published shift closes the gap in this model. It is a fit, not a result.
export const KT = 0.596;
export const RMIN_LB = 3.55;      // Lorentz-Berthelot value quoted for this pair by Huang et al. 2017
export const NBFIX = 3.637;       // their fix
export const R_LO = 2.2, R_HI = 14, NP = 118;
const H = (R_HI - R_LO) / (NP - 1);
export const rAt = i => R_LO + i * H;

const eps = r => 78 - 66 * Math.exp(-(r - 2.5) / 2.2);
const KAPPA = 1 / 9;
export const TUNE = { lever: 11.3, depth: 0.562 };   // fitted, see the header

// Water makes layers: a barrier, then a solvent-separated well one water beyond contact.
const water = r => 0.95 * Math.exp(-(((r - 4.7) / 0.62) ** 2)) - 0.72 * Math.exp(-(((r - 6.05) / 0.72) ** 2)) + 0.24 * Math.exp(-(((r - 7.5) / 0.6) ** 2));

// pair: how the two kinds of partner differ. Arg is bidentate, Lys binds through one amine.
export const PAIRS = {
  arg: { name: 'Arg–Asp', teeth: 2.0, shift: 0 },
  lys: { name: 'Lys–Asp', teeth: 1.45, shift: 0.1 },
};

export function pmf(r, q, rmin, pair = PAIRS.arg) {
  // This one distance stands for several atom pairs, so a shift of one Rmin moves the whole contact further: LEVER.
  const e = 0.22 * pair.teeth, x = (RMIN_LB + TUNE.lever * (rmin - RMIN_LB) + pair.shift) / r, x6 = x ** 6;
  const lj = e * (x6 * x6 - 2 * x6);
  const coul = -TUNE.depth * 332 * q * q * Math.exp(-KAPPA * r) * Math.max(1, pair.teeth * 0.9) / (eps(r) * r);
  return lj + coul + water(r);
}

export function curve(q, rmin, pair) {
  const w = new Float64Array(NP);
  for (let i = 0; i < NP; i++) w[i] = pmf(rAt(i), q, rmin, pair);
  return w;
}

// Ka = 4π ∫ r² e^(−W/kT) dr over the contact pair, in M⁻¹. The limit is the top of the barrier before the water-separated well.
export const R_PAIR = 4.7;
export function ka(w) {
  let s = 0;
  for (let i = 0; i < NP; i++) { const r = rAt(i); if (r <= R_PAIR) s += r * r * Math.exp(-w[i] / KT) * H; }
  return 4 * Math.PI * s * 6.022e-4;
}

// Fraction paired at concentration c (mol/L) from Ka c (1 − α)² = α, then the osmotic coefficient 1 − α/2.
export function osmotic(K, c) {
  const a = K * c;
  const alpha = (2 * a + 1 - Math.sqrt(4 * a + 1)) / (2 * a);
  return 1 - alpha / 2;
}

export function contactDistance(w) {
  let b = 0;
  for (let i = 1; i < NP && rAt(i) < 4.4; i++) if (w[i] < w[b]) b = i;
  return rAt(b);
}

// Hydration free energy changes with q²: a Born-like estimate with a 2.0 Å cavity. Used only for its q² scaling.
export const hydration = q => -166 * (1 - 1 / 78) / 2.0 * q * q;
