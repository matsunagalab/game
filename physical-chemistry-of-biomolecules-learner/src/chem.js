// The physical chemistry of the game. Nothing here touches the screen, so tools/test_chem.mjs can check it.
export const R = 0.0019872; // kcal/mol/K

export const RT = (T) => R * T;

// Equilibrium populations of states with free energies G (kcal/mol).
export function populations(G, T) {
  const min = Math.min(...G);
  const w = G.map((g) => Math.exp(-(g - min) / RT(T)));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

// Free-energy gap that gives the population ratio K.
export const gapFromK = (K, T) => RT(T) * Math.log(K);

// Two-state unfolding with a heat capacity change (Gibbs-Helmholtz). Positive means folded is stable.
export function stability(T, Hm, Tm, dCp = 0) {
  return Hm * (1 - T / Tm) + dCp * (T - Tm - T * Math.log(T / Tm));
}

// Debye length in angstrom for a 1:1 salt in water at 25 C, ionic strength in mol/L.
export const debye = (I) => 3.04 / Math.sqrt(I);

// Screened Coulomb energy in kcal/mol. r in angstrom, charges in units of e.
export const coulomb = (q1, q2, r, eps, I) => (332 * q1 * q2 * Math.exp(-r / debye(I))) / (eps * r);

// Fraction protonated at a given pH.
export const protonated = (pH, pKa) => 1 / (1 + 10 ** (pH - pKa));

// Protonation free energy gap: positive means the protonated state costs more.
export const protonGap = (pH, pKa, T) => Math.LN10 * RT(T) * (pH - pKa);

export const occupancy = (L, Kd) => L / (L + Kd);

// Monod-Wyman-Changeux haemoglobin (Rubin and Changeux 1966). p in torr.
export const HB = { L: 9054, c: 0.014, KR: 2.8, bohr: 0.48 };

// Lower pH makes each subunit see less oxygen: the Bohr shift of log P50 per pH unit.
const effective = (p, pH) => p / 10 ** (HB.bohr * (7.4 - pH));

// Populations of 0..4 oxygens bound.
export function hbStates(p, pH = 7.4) {
  const a = effective(p, pH) / HB.KR;
  const binom = [1, 4, 6, 4, 1];
  const w = binom.map((b, i) => b * (a ** i + HB.L * (HB.c * a) ** i));
  const sum = w.reduce((x, y) => x + y, 0);
  return w.map((x) => x / sum);
}

export const hbSaturation = (p, pH = 7.4) => hbStates(p, pH).reduce((s, x, i) => s + (x * i) / 4, 0);

// Rate over a barrier of height Ea above the starting state.
export const rate = (A, Ea, T) => A * Math.exp(-Ea / RT(T));
