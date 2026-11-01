// Triangle-inequality bound smoothing (Crippen; Dress and Havel). Three residues must close a triangle, so
//   U(i,j) <= U(i,k) + U(k,j)   and   L(i,j) >= L(i,k) - U(k,j).
// U and L are flat n by n Float32Arrays and stay symmetric.

// nums, if given, are residue numbers, so a gap in the chain counts as that many steps. Neighbours may be as close as
// 2.9 A, which is what a cis peptide bond gives.
export function makeBounds(n, { lower = 3.2, step = 3.8, nums = null } = {}) {
  const U = new Float32Array(n * n).fill(Infinity);
  const L = new Float32Array(n * n).fill(lower);
  for (let i = 0; i < n; i += 1) { U[i * n + i] = 0; L[i * n + i] = 0; }
  // Neighbours along the chain are one virtual C-alpha bond apart.
  for (let i = 0; i + 1 < n; i += 1) {
    const gap = nums ? nums[i + 1] - nums[i] : 1;
    U[i * n + i + 1] = U[(i + 1) * n + i] = step * gap;
    L[i * n + i + 1] = L[(i + 1) * n + i] = gap === 1 ? Math.min(step, 2.9) : lower;
  }
  return { n, U, L };
}

// A table that knows nothing yet: no chain, only that two residues cannot overlap. Chapter 4's puzzles start from this.
export function emptyBounds(n, { lower = 3.2 } = {}) {
  const U = new Float32Array(n * n).fill(Infinity), L = new Float32Array(n * n).fill(lower);
  for (let i = 0; i < n; i += 1) { U[i * n + i] = 0; L[i * n + i] = 0; }
  return { n, U, L };
}

// One restraint on one pair. It tightens and never loosens.
export function restrain(b, i, j, lo, hi) {
  const { n, U, L } = b;
  if (hi < U[i * n + j]) U[i * n + j] = U[j * n + i] = hi;
  if (lo > L[i * n + j]) L[i * n + j] = L[j * n + i] = lo;
}

// The full smoothing. O(n^3), which is about a million steps for this protein. Returns the number of cells changed.
export function smooth(b) {
  const { n, U, L } = b;
  let changed = 0;
  for (let k = 0; k < n; k += 1) {
    const kr = k * n;
    for (let i = 0; i < n; i += 1) {
      const ir = i * n, uik = U[ir + k], lik = L[ir + k];
      for (let j = i + 1; j < n; j += 1) {
        const ukj = U[kr + j], ljk = L[kr + j];
        let u = U[ir + j], l = L[ir + j], moved = false;
        if (uik + ukj < u - 1e-4) { u = uik + ukj; moved = true; }
        const a = lik - ukj, c = ljk - uik;
        if (a > l + 1e-4) { l = a; moved = true; }
        if (c > l + 1e-4) { l = c; moved = true; }
        if (moved) {
          U[ir + j] = U[j * n + i] = u;
          L[ir + j] = L[j * n + i] = l;
          changed += 1;
        }
      }
    }
  }
  return changed;
}

// One third residue k: every pair reads its two other sides through k, and only tightens. This is one turn of the
// outer loop of smooth(), so taking every k once gives what smooth() gives.
export function throughThird(b, k) {
  const { n, U, L } = b, kr = k * n;
  let changed = 0;
  for (let i = 0; i < n; i += 1) {
    if (i === k) continue;
    const ir = i * n, uik = U[ir + k], lik = L[ir + k];
    for (let j = i + 1; j < n; j += 1) {
      if (j === k) continue;
      const ukj = U[kr + j], ljk = L[kr + j];
      let u = U[ir + j], l = L[ir + j], moved = false;
      if (uik + ukj < u - 1e-4) { u = uik + ukj; moved = true; }
      const a = lik - ukj, c = ljk - uik;
      if (a > l + 1e-4) { l = a; moved = true; }
      if (c > l + 1e-4) { l = c; moved = true; }
      if (moved) { U[ir + j] = U[j * n + i] = u; L[ir + j] = L[j * n + i] = l; changed += 1; }
    }
  }
  return changed;
}

// The shortest list of third residues that makes solved(b) true, breadth first. The answer is computed, never stored.
export function fewestThirds(b, solved, { most = 5 } = {}) {
  const { n } = b;
  let layer = [{ b, path: [] }];
  for (let depth = 0; depth <= most; depth += 1) {
    const next = [], seen = new Set();
    for (const { b: state, path } of layer) {
      if (solved(state)) return path;
      if (depth === most) continue;
      for (let k = 0; k < n; k += 1) {
        const c = copyBounds(state);
        if (!throughThird(c, k)) continue;
        const key = c.U.join() + c.L.join();
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ b: c, path: [...path, k] });
      }
    }
    layer = next;
  }
  return null;
}

// The pairs whose lower bound has passed their upper bound: no shape can satisfy them.
export function conflicts(b, tol = 0.01) {
  const { n, U, L } = b, out = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (L[i * n + j] > U[i * n + j] + tol) out.push([i, j]);
    }
  }
  return out;
}

// A copy, so a player can try a contact and take it back.
export const copyBounds = (b) => ({ n: b.n, U: b.U.slice(), L: b.L.slice() });

// Mean of U - L over all pairs, in angstroms. Bounds that are still infinite are capped at a chain's full stretch.
export function meanWidth(b) {
  const { n, U, L } = b;
  let s = 0, c = 0;
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) { s += U[i * n + j] - L[i * n + j]; c += 1; }
  return s / c;
}

// How far the bounds stand from a real distance map: the mean of U - d, which is what a map reader would overestimate.
export function meanOverestimate(b, D) {
  const { n, U } = b;
  let s = 0, c = 0;
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) { s += Math.max(0, U[i * n + j] - D[i * n + j]); c += 1; }
  return s / c;
}

// Pairs whose true distance has fallen outside the bounds. A wrong contact shows up here only if you know the truth.
export function violatedByTruth(b, D, tol = 0.5) {
  const { n, U, L } = b;
  let c = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = D[i * n + j];
      if (d > U[i * n + j] + tol || d < L[i * n + j] - tol) c += 1;
    }
  }
  return c;
}
