// Thermodynamics of the rotary ATP synthase: 3 ATP per turn, c protons per turn.
export const FARADAY = 96485;
export const hPerATP = (c) => c / 3;
// ATP is made only when c/3 protons falling through the gradient carry the free energy of one ATP.
export const stallPmf = (c, dG = 50) => (dG * 1000) / (FARADAY * hPerATP(c)) * 1000;
// Yield per NADH with 10 H+ pumped, plus one H+ for phosphate import.
export const atpPerNADH = (c, pumped = 10, extra = 1) => pumped / (hPerATP(c) + extra);
export const stepAngle = (c) => 360 / c;
