// Small shared formulas. Everything else lives in src/sim/, with no screen code.
export const R = 0.0019872; // kcal/mol/K
export const RT = (T) => R * T;

// Debye length in angstrom for a 1:1 salt in water at 25 C, ionic strength in mol/L.
export const debye = (I) => 3.04 / Math.sqrt(I);

// Screened Coulomb energy in kcal/mol. r in angstrom, charges in units of e.
export const coulomb = (q1, q2, r, eps, I) => (332 * q1 * q2 * Math.exp(-r / debye(I))) / (eps * r);
