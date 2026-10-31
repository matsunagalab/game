// Screen-free calculations. Everything labelled "computed by this game" on screen comes from here.

// Honest compression: the piece cannot follow twelve decades of rate. Each 1000-fold fall doubles the time between gongs, exactly.
// The level sets how dense the music is. The pulse takes up the remainder, so small changes are heard too.
export const RATE_REF = 1e6;            // s⁻¹, the fastest enzyme here has a gong every 4 s
export const LEVEL_MAX = 4;
export const GAP_REF = 4;               // seconds between gongs at RATE_REF
export const gapSeconds = (rate) => GAP_REF * 2 ** (Math.log10(RATE_REF / rate) / 3);
export function iramaLevel(rate) {
  const x = Math.log10(RATE_REF / rate) / 3;
  return Math.max(0, Math.min(LEVEL_MAX, Math.round(x)));
}
// Level and pulse for a rate. A cycle is eight balungan beats of 2^(level + 1) pulses.
export function musicFor(rate) {
  const level = iramaLevel(rate);
  return { level, pulse: gapSeconds(rate) / (8 * 2 ** (level + 1)) };
}

// First-order decay.
export const fractionLeft = (k, t) => Math.exp(-k * t);
export const halfLife = (k) => Math.LN2 / k;
export const rateFromHalfLife = (t) => Math.LN2 / t;
export const YEAR = 365.25 * 24 * 3600;

// Two groups titrate separately: the base must have lost its proton, the acid must still hold one.
export function protonationPopulations(pH, pKaBase, pKaAcid) {
  const base = 1 / (1 + 10 ** (pKaBase - pH));   // fraction of the base free of its proton
  const acid = 1 / (1 + 10 ** (pH - pKaAcid));   // fraction of the acid still protonated
  return { base, acid, active: base * acid };
}
export function pHMaximum(pKaBase, pKaAcid) { return (pKaBase + pKaAcid) / 2; }
export function bellCurve(pKaBase, pKaAcid, from = 3, to = 9, n = 121) {
  const pts = [];
  for (let i = 0; i < n; i++) { const pH = from + (to - from) * i / (n - 1); pts.push([pH, protonationPopulations(pH, pKaBase, pKaAcid).active]); }
  return pts;
}

// The Eigen argument: how fast a proton can leave a group of a given pKa, if water is the only acceptor.
export function protonOff(pKa, kOn = 1e10) { return kOn * 10 ** (-pKa); }

// Steps in series: the slowest one rules.
export const series = (...k) => 1 / k.reduce((s, x) => s + 1 / x, 0);

// Carbonic anhydrase teaching model: chemistry, then a proton step that His64 or a buffer carries.
// Rescue by a small buffer saturates near 40% of wild type (Duda et al. 2001, with 4-methylimidazole).
// KR is a placeholder for the half-saturating concentration, not a measured value.
// kChem and kShuttle are scaled so wild type lands near the measured kcat of 10⁶ s⁻¹. The rescue ceiling is 4.4 × 10⁵ s⁻¹;
// An et al. 2002 report rescued rates near 10⁵ s⁻¹, so the model's ceiling runs high.
export const KR_PLACEHOLDER = 0.02;   // M
export function caRate({ his64, bufferM = 0, kChem = 1e7, kShuttle = 1.1e6, kFloor = 5e4, KR = KR_PLACEHOLDER }) {
  const rescue = his64 ? 0 : (0.4 * kShuttle - kFloor) * bufferM / (KR + bufferM);
  return series(kChem, (his64 ? kShuttle : kFloor) + rescue);
}

// The zero-point argument for a primary H/D isotope effect. hc/k = 1.4388 cm K.
export function zpeKIE(nuH = 2900, nuD = 2100, T = 298) { return Math.exp(1.4388 * (nuH - nuD) / (2 * T)); }
export function reducedMass(m1, m2) { return m1 * m2 / (m1 + m2); }
export function stretchRatio() { return Math.sqrt(reducedMass(12, 2.014) / reducedMass(12, 1.008)); }

// Dunathan: how well a bond lines up with the pi system. 1 means perpendicular to the ring plane.
export const piOverlap = (angleFromNormalDeg) => Math.cos(angleFromNormalDeg * Math.PI / 180) ** 2;

// Transition-state affinity and proficiency.
export const kTS = (kNon, kcatOverKm) => kNon / kcatOverKm;
export const proficiency = (kNon, kcatOverKm) => kcatOverKm / kNon;
export const rateEnhancement = (kcat, kNon) => kcat / kNon;

// Mass from a formula, to compare with a mass spectrum.
const AW = { C: 12.011, H: 1.008, N: 14.007, O: 15.999, F: 18.998 };
export function formulaMass(formula) { return Object.entries(formula).reduce((s, [e, c]) => s + AW[e] * c, 0); }

// Enediol in the loop-deleted enzyme: lost 5.5 times faster than it reprotonates.
export const enediolLost = (ratio) => ratio / (1 + ratio);
export const log10Fold = (a, b) => Math.log10(a / b);
