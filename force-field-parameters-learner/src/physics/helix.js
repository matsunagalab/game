// Lifson-Roig helix-coil theory, solved exactly with a transfer matrix.
// Each residue is h (helical backbone) or c (coil). A residue's weight depends on its two neighbours:
//   h with h on both sides: w (a hydrogen bond closes)
//   h with at least one c:  v (helical angles, no bond)
//   c:                      1
// End residues always count as if the chain continued in coil. Reference: Lifson & Roig, J Chem Phys 34, 1963 (1961).
const R = 0.0019872;

export const RT = T => R * T;

// Thermodynamic fits to w and v from Best & Hummer, J Phys Chem B 113, 9004 (2009), Table 5.
// dH in kcal/mol and dS in cal/mol/K at 300 K, dCp in cal/mol/K. The exp row is the experimental one they tabulate,
// from Rohl & Baldwin, Biochemistry 36, 8435 (1997): w from its dH and dS, v from dS = −6.6 alone.
export const LR = {
  exp:     { w: { dH: -1.28, dS: -3.78, dCp: 0 },    v: { dH: 0, dS: -6.6, dCp: 0 } },
  ff99SB:  { w: { dH: 0.23,  dS: -0.29, dCp: -5.7 }, v: { dH: 0.90, dS: -1.08, dCp: -5.8 } },
  ff03:    { w: { dH: -0.99, dS: -1.37, dCp: -5.3 }, v: { dH: 0.44, dS: -0.35, dCp: -8.3 } },
  ff99SBs: { w: { dH: -0.47, dS: -1.55, dCp: -3.3 }, v: { dH: 0.71, dS: -0.86, dCp: -8.0 } },
  ff03s:   { w: { dH: -0.61, dS: -1.81, dCp: -3.6 }, v: { dH: 0.72, dS: -0.94, dCp: -7.5 } },
};
export const N_AAQAA = 15;      // Ac-(AAQAA)3-NH2

// A statistical weight at temperature T from a fit at 300 K.
export function weight({ dH, dS, dCp = 0 }, T) {
  const G = dH + dCp * (T - 300) / 1000 - T * (dS + dCp * Math.log(T / 300)) / 1000;
  return Math.exp(-G / RT(T));
}
// Helix fraction of a Table 5 row. The optional shifts move the enthalpy and entropy of w.
export function rowFraction(row, T, shiftH = 0, shiftS = 0, N = N_AAQAA) {
  const w = weight({ ...row.w, dH: row.w.dH + shiftH, dS: row.w.dS + shiftS }, T), v = weight(row.v, T);
  return helixFraction(w, v, N);
}

// The ψ correction of Best & Hummer: V(ψ) = k[1 + cos(ψ − δ)], with δ = 105.4° for ff99SB*.
// Helix sits near ψ = −47°, coil near ψ = 130°, so k lowers helix relative to coil by k·gain.
const D = Math.PI / 180;
export const PSI_GAIN = (1 + Math.cos((130 - 105.4) * D)) - (1 + Math.cos((-47 - 105.4) * D));

// States of the pair (s[i], s[i+1]): 0 cc, 1 ch, 2 hc, 3 hh.
// Z = sum over sequences of the product of residue weights, with c at both virtual ends.
export function partition(w, v, N) {
  // a[s]: weight of the prefix ending in pair state s, with the last residue's own weight still to come.
  let a = [1, 1, 0, 0];        // (virtual c, c) and (virtual c, h)
  for (let i = 1; i < N; i++) {
    const b = [0, 0, 0, 0];
    // Extend pair (x,y) to (y,z): the weight of y is now known.
    b[0] += a[0] + a[2];                 // y = c, z = c
    b[1] += a[0] + a[2];                 // y = c, z = h
    b[2] += (a[1] + a[3]) * v;           // y = h, z = c: y has a c on its right
    b[3] += a[1] * v + a[3] * w;         // y = h, z = h: w only when h on both sides
    a = b;
  }
  // Close with a virtual c: last residue's weight.
  return a[0] + a[2] + (a[1] + a[3]) * v;
}

// Fraction of residues whose hydrogen bond is closed: d ln Z / d ln w, over the N−2 that can close one.
export function helixFraction(w, v, N) {
  const e = 1e-5, up = partition(w * (1 + e), v, N), dn = partition(w * (1 - e), v, N);
  return (Math.log(up) - Math.log(dn)) / (2 * e) / (N - 2);
}

// Per-residue probability of being helical, and one exact random sequence from the same ensemble.
export function profile(w, v, N) {
  const f = new Float64Array(4 * N), g = new Float64Array(4 * N);
  // forward: f[i][pair (i-1,i)] ; backward: g[i][pair (i-1,i)]
  const W = (x, y, z) => (y === 0 ? 1 : (x && z) ? w : v);
  for (const y of [0, 1]) f[0 * 4 + y] = 1;    // pair (virtual c, y)
  for (let i = 1; i < N; i++) for (const y of [0, 1]) for (const z of [0, 1]) {
    let s = 0;
    for (const x of [0, 1]) s += f[4 * (i - 1) + 2 * x + y] * W(x, y, z);
    f[4 * i + 2 * y + z] = s;
  }
  for (const x of [0, 1]) for (const y of [0, 1]) g[4 * (N - 1) + 2 * x + y] = W(x, y, 0);
  for (let i = N - 2; i >= 0; i--) for (const x of [0, 1]) for (const y of [0, 1]) {
    let s = 0;
    for (const z of [0, 1]) s += W(x, y, z) * g[4 * (i + 1) + 2 * y + z];
    g[4 * i + 2 * x + y] = s;
  }
  const P = new Float64Array(N);
  let Z = 0;
  for (const x of [0, 1]) for (const y of [0, 1]) Z += f[4 * (N - 1) + 2 * x + y] * g[4 * (N - 1) + 2 * x + y];
  for (let i = 0; i < N; i++) {
    let p = 0;
    for (const x of [0, 1]) p += f[4 * i + 2 * x + 1] * g[4 * i + 2 * x + 1];
    P[i] = p / Z;
  }
  return { P, f, g, Z, W };
}

export function sampleSequence({ g, W }, N, rand = Math.random) {
  const s = new Int8Array(N);
  // Walk forward: the weight of choosing y at i is the settled weight of residue i−1 times everything to the right.
  for (let i = 0; i < N; i++) {
    const x = i ? s[i - 1] : 0, left = i >= 2 ? s[i - 2] : 0;
    const settle = y => (i ? W(left, x, y) : 1);
    const w0 = settle(0) * g[4 * i + 2 * x], w1 = settle(1) * g[4 * i + 2 * x + 1];
    s[i] = rand() * (w0 + w1) < w1 ? 1 : 0;
  }
  return s;
}
