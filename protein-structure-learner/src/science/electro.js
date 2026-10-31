// Screened electrostatics between two chains: a plain Coulomb sum with a Debye-Hueckel factor, in water.
// It is good for "how far does this reach, and what does salt do". It is not a rate predictor.
const EPS = 80;

export const debyeLength = (I) => 3.04 / Math.sqrt(I); // angstroms, I in mol/L

// charges: [{ q, x, y, z, chain }], energy between chain 0 and chain 1 only, in kcal/mol.
export function coulomb(charges, I) {
  const kappa = 1 / debyeLength(I);
  let U = 0;
  for (const a of charges) {
    if (a.chain !== 0) continue;
    for (const b of charges) {
      if (b.chain !== 1) continue;
      const r = Math.max(3, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      U += ((332 * a.q * b.q) / (EPS * r)) * Math.exp(-kappa * r);
    }
  }
  return U;
}
