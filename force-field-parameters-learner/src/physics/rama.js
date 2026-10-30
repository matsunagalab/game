// Ramachandran maps on a 5° periodic grid. The target comes from a mixture of the known alanine basins.
export const GRID = 72;
export const STEP = 5;
const RT = 0.596;           // kcal/mol at 300 K
const CAP = 7;              // kcal/mol above the lowest point

const wrap = a => ((a + 180) % 360 + 360) % 360 - 180;
const angDiff = (a, b) => wrap(a - b);
const idx = (i, j) => ((i + GRID) % GRID) + GRID * ((j + GRID) % GRID);

export const BASINS = [
  { name: 'α helix',     phi: -63,  psi: -43, sp: 13, ss: 13, w: 0.46 },
  { name: 'β strand',    phi: -125, psi: 135, sp: 22, ss: 18, w: 0.22 },
  { name: 'PPII',        phi: -70,  psi: 145, sp: 13, ss: 15, w: 0.24 },
  { name: 'left helix',  phi: 57,   psi: 42,  sp: 9,  ss: 11, w: 0.06 },
  { name: 'bridge',      phi: -95,  psi: 0,   sp: 16, ss: 14, w: 0.02 },
];

export function mixture(weights, floor) {
  const P = new Float64Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const phi = -180 + (i + 0.5) * STEP, psi = -180 + (j + 0.5) * STEP;
    let p = floor;
    BASINS.forEach((b, k) => {
      const dp = angDiff(phi, b.phi) / b.sp, ds = angDiff(psi, b.psi) / b.ss;
      p += weights[k] * Math.exp(-0.5 * (dp * dp + ds * ds)) / (b.sp * b.ss);
    });
    P[i + GRID * j] = p;
  }
  return normalize(P);
}

function normalize(P) {
  let s = 0;
  for (let q = 0; q < P.length; q++) s += P[q];
  for (let q = 0; q < P.length; q++) P[q] /= s;
  return P;
}

export function freeEnergy(P) {
  const F = new Float64Array(P.length);
  let min = Infinity;
  for (let q = 0; q < P.length; q++) { F[q] = -RT * Math.log(P[q]); min = Math.min(min, F[q]); }
  for (let q = 0; q < P.length; q++) F[q] = Math.min(F[q] - min, CAP);
  return F;
}

export const targetPopulation = (w = BASINS.map(b => b.w)) => mixture(w, 2e-6);
// The starting force field: helix too weak, left helix too deep, disallowed regions too open.
export const startingPopulation = () => mixture([0.05, 0.5, 0.1, 0.33, 0.02], 2e-4);

export function populationOf(F) {
  const P = new Float64Array(F.length);
  for (let q = 0; q < F.length; q++) P[q] = Math.exp(-F[q] / RT);
  return normalize(P);
}

export function overlap(P, Q) {
  let s = 0;
  for (let q = 0; q < P.length; q++) s += Math.sqrt(P[q] * Q[q]);
  return s;
}

export function basinShare(P, b) {
  let s = 0;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const phi = -180 + (i + 0.5) * STEP, psi = -180 + (j + 0.5) * STEP;
    if (Math.abs(angDiff(phi, b.phi)) < 2.2 * b.sp && Math.abs(angDiff(psi, b.psi)) < 2.2 * b.ss) s += P[i + GRID * j];
  }
  return s;
}

// Bilinear lookup with centred differences. φ, ψ in degrees; returns value, writes gradient per degree into g.
export function sample(F, phi, psi, g) {
  const u = (wrap(phi) + 180) / STEP - 0.5, v = (wrap(psi) + 180) / STEP - 0.5;
  const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
  const f00 = F[idx(i, j)], f10 = F[idx(i + 1, j)], f01 = F[idx(i, j + 1)], f11 = F[idx(i + 1, j + 1)];
  if (g) {
    g.phi = ((1 - b) * (f10 - f00) + b * (f11 - f01)) / STEP;
    g.psi = ((1 - a) * (f01 - f00) + a * (f11 - f10)) / STEP;
  }
  return (1 - b) * ((1 - a) * f00 + a * f10) + b * ((1 - a) * f01 + a * f11);
}

export function blurred(F, passes = 1) {
  let A = Float64Array.from(F), B = new Float64Array(F.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      B[i + GRID * j] = 0.4 * A[idx(i, j)] + 0.15 * (A[idx(i + 1, j)] + A[idx(i - 1, j)] + A[idx(i, j + 1)] + A[idx(i, j - 1)]);
    }
    [A, B] = [B, A];
  }
  return A;
}

// Force-field term for the MD engine: φ, ψ in radians, gradient per radian.
export function ramaTerm(F) {
  const smooth = blurred(F, 2);
  const D = 180 / Math.PI, g = { phi: 0, psi: 0 };
  return {
    lookup(phi, psi, out) {
      const u = sample(smooth, phi * D, psi * D, g);
      out.dphi = g.phi * D; out.dpsi = g.psi * D;
      return u;
    },
    gradient: null,
  };
}
