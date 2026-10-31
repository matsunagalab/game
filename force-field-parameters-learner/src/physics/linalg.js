// Small dense linear algebra, with no allocation surprises.

// Solves A x = b by Gaussian elimination with partial pivoting. A is an array of rows and is overwritten.
export function solve(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c] || 1e-300;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let c = n - 1; c >= 0; c--) {
    let s = b[c];
    for (let k = c + 1; k < n; k++) s -= A[c][k] * x[k];
    x[c] = s / (A[c][c] || 1e-300);
  }
  return x;
}

// Ordinary least squares through the normal equations: minimises |X b − y|².
export function lsq(X, y, ridge = 0) {
  const m = X[0].length;
  const A = Array.from({ length: m }, () => new Array(m).fill(0)), b = new Array(m).fill(0);
  for (let i = 0; i < X.length; i++) {
    const r = X[i];
    for (let p = 0; p < m; p++) {
      b[p] += r[p] * y[i];
      for (let q = p; q < m; q++) A[p][q] += r[p] * r[q];
    }
  }
  for (let p = 0; p < m; p++) { A[p][p] += ridge; for (let q = 0; q < p; q++) A[p][q] = A[q][p]; }
  return solve(A, b);
}
