// Calculations that are exact for their model: orientation integrals, normal modes, series, lattice counts.
// No screen code, no sampling, so every number here can be checked by tools/test_chem.mjs.

export const COULOMB = 332.06; // kcal Angstrom / (mol e^2)
export const R_GAS = 0.0019872; // kcal/mol/K
export const EWATER = 78.4; // Dielectric constant of water at 25 C, used everywhere in the game.

// --- Keesom: two freely turning point dipoles ------------------------------------------------------
// U = (mu^2 / r^3) (sin a sin b cos f - 2 cos a cos b), written with x = mu^2 / (r^3 kT).
// Returns the Boltzmann average of -ln weight (free energy / kT), mean energy / kT, and mean alignment.
export function keesom(x, n = 48) {
  let z = 0, e = 0, unb = 0;
  for (let i = 0; i < n; i++) {
    const ca = -1 + (2 * (i + 0.5)) / n; // Equal steps in cos give equal solid angle.
    const sa = Math.sqrt(1 - ca * ca);
    for (let j = 0; j < n; j++) {
      const cb = -1 + (2 * (j + 0.5)) / n;
      const sb = Math.sqrt(1 - cb * cb);
      for (let k = 0; k < n; k++) {
        const f = ((k + 0.5) * Math.PI) / n;
        const g = sa * sb * Math.cos(f) - 2 * ca * cb; // Geometry factor, between -2 and +2.
        const w = Math.exp(-x * g);
        z += w;
        e += w * x * g;
        unb += x * g;
      }
    }
  }
  const m = n * n * n;
  return { F: -Math.log(z / m), U: e / z, plain: unb / m };
}

// --- London: two three-dimensional Drude oscillators ------------------------------------------------
// In units where the free frequency is 1 and a = alpha / r^3, the six coupled modes are
// sqrt(1 +/- 2a) along the axis and sqrt(1 +/- a) twice across it. Energy is zero-point, in units of hbar w.
export const drudeModes = (a) => [Math.sqrt(1 + 2 * a), Math.sqrt(1 - 2 * a), Math.sqrt(1 + a), Math.sqrt(1 + a), Math.sqrt(1 - a), Math.sqrt(1 - a)];

export function londonShift(a) {
  return 0.5 * (drudeModes(a).reduce((s, w) => s + w, 0) - 6);
}
export const londonLimit = (a) => -0.75 * a * a; // -3/4 hbar w alpha^2 / r^6

// Correlation of the two oscillators along the axis, in the exact ground state.
// Along the axis the energy is -2 x1 x2 alpha / r^3, so moving in step is the soft mode with the larger spread.
export function drudeCorrelation(a) {
  const inStep = 1 / Math.sqrt(1 - 2 * a); // Variance of (x1 + x2) / sqrt 2 in units of the free variance.
  const opposed = 1 / Math.sqrt(1 + 2 * a);
  return (inStep - opposed) / (inStep + opposed);
}

export const lj = (r, eps, sig) => { const s = (sig / r) ** 6; return 4 * eps * (s * s - s); };

// --- Stacking: an exact pair sum over two flat sheets of atoms -------------------------------------
export function hexSheet(rings) {
  // rings: 1 benzene, 2 naphthalene-like pair, 3 phenanthrene, 7 coronene-like patch. Carbon-carbon 1.42 A.
  const a = 1.42;
  const centres = { 1: [[0, 0]], 2: [[0, 0], [1, 0]], 4: [[0, 0], [1, 0], [0.5, 0.866], [1.5, 0.866]], 7: [[0, 0], [1, 0], [-1, 0], [0.5, 0.866], [-0.5, 0.866], [0.5, -0.866], [-0.5, -0.866]] }[rings];
  const seen = new Map();
  for (const [cx, cy] of centres) {
    for (let k = 0; k < 6; k++) {
      const an = (k * Math.PI) / 3 + Math.PI / 6;
      const x = cx * a * Math.sqrt(3) + a * Math.cos(an);
      const y = cy * a * Math.sqrt(3) + a * Math.sin(an);
      seen.set(`${Math.round(x * 20)},${Math.round(y * 20)}`, [x, y]);
    }
  }
  return [...seen.values()];
}

export function stackEnergy(sheet, dx, dy, gap, eps = 0.07, sig = 3.55) {
  let e = 0;
  let closest = 0;
  for (const [ax, ay] of sheet) {
    for (const [bx, by] of sheet) {
      const r = Math.hypot(ax - bx - dx, ay - by - dy, gap);
      const v = lj(r, eps, sig);
      e += v;
      if (v < closest) closest = v;
    }
  }
  return { e, closest };
}

// A sheet in water already touches a layer of water on each face. Sum of one face with the waters over it:
// a triangular lattice of water centres, a gap away, with carbon-oxygen Lennard-Jones numbers. A toy sum:
// moving the lattice or changing its spacing shifts the result by several kcal/mol, so it fixes a size, not a sign.
export function waterFace(sheet, gap = 3.4, eps = 0.103, sig = 3.35, a = 3.2) {
  let e = 0;
  const rows = 8;
  for (let j = -rows; j <= rows; j++) {
    for (let i = -rows; i <= rows; i++) {
      const wx = (i + (j % 2 ? 0.5 : 0)) * a;
      const wy = j * a * 0.866;
      // Only waters over the footprint of the sheet are displaced when another sheet lands on it.
      if (!sheet.some(([x, y]) => Math.hypot(x - wx, y - wy) < 2.2)) continue;
      for (const [x, y] of sheet) e += lj(Math.hypot(x - wx, y - wy, gap), eps, sig);
    }
  }
  return e;
}

// Dispersion of one atom with a block of atoms: how much of the sum comes from each shell of neighbours.
// A cubic close packing with neighbour distance d. Returns [d, cumulative fraction] pairs.
export function latticeShells(d = 3.8, reach = 24) {
  const a = d * Math.SQRT2;
  const m = Math.ceil(reach / a) + 1;
  const list = [];
  const basis = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
  for (let i = -m; i <= m; i++) for (let j = -m; j <= m; j++) for (let k = -m; k <= m; k++) {
    for (const [u, v, w] of basis) {
      const r = a * Math.hypot(i + u, j + v, k + w);
      if (r > 0.1 && r <= reach) list.push(r);
    }
  }
  list.sort((p, q) => p - q);
  const total = list.reduce((s, r) => s + r ** -6, 0);
  let run = 0;
  return { count: list.length, sumR6: total, at: (R) => { run = 0; for (const r of list) { if (r > R) break; run += r ** -6; } return run / total; } };
}

// --- Born and Kirkwood: charges in a low-dielectric sphere in water --------------------------------
// Work of moving an ion of radius a from a medium of dielectric eIn to one of eOut.
export const born = (q, a, eIn, eOut) => (0.5 * COULOMB * q * q / a) * (1 / eOut - 1 / eIn);

function legendre(n, x) {
  let p0 = 1, p1 = x;
  if (n === 0) return 1;
  for (let k = 2; k <= n; k++) { const p = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p; }
  return p1;
}

// Reaction potential at point r from a unit charge at s. Both are inside a sphere of radius a.
// Tanford-Kirkwood series at zero salt.
export function reaction(rv, sv, a, eIn, eOut, terms = 80) {
  const r = Math.hypot(...rv);
  const s = Math.hypot(...sv);
  const cos = r > 0 && s > 0 ? Math.max(-1, Math.min(1, (rv[0] * sv[0] + rv[1] * sv[1] + rv[2] * sv[2]) / (r * s))) : 1;
  let sum = 0;
  let t = 1;
  const f = (r * s) / (a * a);
  for (let n = 0; n < terms; n++) {
    const c = ((n + 1) * (eIn - eOut)) / (eIn * (n * eIn + (n + 1) * eOut));
    sum += c * t * legendre(n, cos);
    t *= f;
    if (t < 1e-10) break;
  }
  return (COULOMB / a) * sum;
}

// A salt bridge with its two charges side by side, depth d under the surface of a protein of radius a.
// All numbers are relative to the two ions far apart in water, in kcal/mol.
export function saltBridge({ a = 16, depth, sep = 3.2, ion = 2.2, eIn = 4, eOut = EWATER }) {
  const rad = a - depth;
  const half = sep / 2;
  const off = Math.sqrt(Math.max(0, rad * rad - half * half));
  const p1 = [half, 0, off];
  const p2 = [-half, 0, off];
  const lift = 2 * (0.5 * COULOMB / ion) * (1 / eIn - 1 / eOut); // Taking two ions out of water.
  const refill = 2 * (0.5 * reaction(p1, p1, a, eIn, eOut)); // Water still reaches them from outside.
  const direct = -COULOMB / (eIn * sep);
  const field = -reaction(p1, p2, a, eIn, eOut); // Water screens the pair from outside.
  const single = lift / 2 + refill / 2; // One ion alone at this depth.
  return { desolvation: lift + refill, coulomb: direct + field, total: lift + refill + direct + field, single };
}

// --- A hydrogen bond between two amide groups, with simple neutral bond charges ----------------------
// Donor N-H is fixed along +x with H at the origin. Acceptor O sits at (x, y), its C=O bond at angle phi.
const DONOR = [{ x: -1.01, y: 0, q: -0.4, s: 3.25, e: 0.17 }, { x: 0, y: 0, q: 0.4, s: 1.2, e: 0.05 }];
export function hbond(x, y, phi, eps = 1, ct = 1) {
  const acc = [{ x, y, q: -0.5, s: 2.96, e: 0.21 }, { x: x + 1.23 * Math.cos(phi), y: y + 1.23 * Math.sin(phi), q: 0.5, s: 3.75, e: 0.105 }];
  let elec = 0, vdw = 0;
  for (const a of DONOR) {
    for (const b of acc) {
      const r = Math.hypot(a.x - b.x, a.y - b.y);
      elec += (COULOMB * a.q * b.q) / (eps * r);
      if (a.e) vdw += lj(r, Math.sqrt(a.e * b.e), (a.s + b.s) / 2);
    }
  }
  const rHO = Math.hypot(x, y);
  const along = rHO > 0 ? x / rHO : 0; // Cosine of the N-H...O line.
  // Toy overlap term: a little electron sharing when the lone pair points down the N-H bond.
  const lone = (Math.cos(phi) * x + Math.sin(phi) * y) / rHO;
  const cover = ct * Math.exp(-(rHO - 1.9) / 0.35) * Math.max(0, along) ** 4 * Math.max(0, lone) ** 2;
  return { elec, vdw, cover: -Math.min(cover, 2.5), total: elec + vdw - Math.min(cover, 2.5), rHO, angle: Math.acos(Math.max(-1, Math.min(1, along))) * 180 / Math.PI };
}

// --- Depletion: overlap of two exclusion zones ------------------------------------------------------
// Two big disks of radius a, crowders of radius c. The lens where the two zones overlap, in 2D.
export function lensArea(d, a, c) {
  const R = a + c;
  if (d >= 2 * R) return 0;
  return 2 * R * R * Math.acos(d / (2 * R)) - (d / 2) * Math.sqrt(4 * R * R - d * d);
}

// --- Polymers: exact counting by transfer of a walk one step at a time ------------------------------
// Number of N-step walks on the square lattice ending at each site. Uses doubles, so it is exact until 2^53.
export function walkTable(N) {
  const size = 2 * N + 1;
  let now = new Float64Array(size * size);
  now[N + N * size] = 1;
  const layers = [now];
  for (let n = 1; n <= N; n++) {
    const next = new Float64Array(size * size);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const c = now[x + y * size];
        if (!c) continue;
        next[x + 1 + y * size] += c; next[x - 1 + y * size] += c;
        next[x + (y + 1) * size] += c; next[x + (y - 1) * size] += c;
      }
    }
    layers.push(next);
    now = next;
  }
  return { N, size, layers, count: (n, x, y) => { const v = layers[n]; const i = x + N, j = y + N; return i < 0 || j < 0 || i >= size || j >= size ? 0 : v[i + j * size]; } };
}

// ln of the number of ways, from log gamma, for chains too long for the table.
export function lnGamma(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z;
  let t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015;
  for (const v of c) s += v / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
export const lnBinom = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);

// A freely jointed chain of N steps on a line: entropy versus end position, exact.
export const chainEntropy1D = (N, x) => ((N + x) % 2 || Math.abs(x) > N ? -Infinity : lnBinom(N, (N + x) / 2));

// Probability that a 3D cubic-lattice walk returns to its start after N steps (N even), exact by convolution.
export function loopClosure(N) {
  const n = N / 2;
  let sum = 0;
  // Sum over steps split among the three axes: multinomial squared over 6^N.
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n - i; j++) {
      const k = n - i - j;
      const ln = lnGamma(n + 1) - lnGamma(i + 1) - lnGamma(j + 1) - lnGamma(k + 1);
      sum += Math.exp(2 * ln - 2 * n * Math.log(3));
    }
  }
  return Math.exp(lnBinom(2 * n, n) - 2 * n * Math.LN2) * sum;
}
