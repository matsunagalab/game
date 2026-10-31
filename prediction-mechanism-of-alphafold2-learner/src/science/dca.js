// Mean-field direct coupling analysis, Morcos et al. 2011. Couplings are minus the inverse of the covariance matrix.
// Written as a generator so that a frame budget can run it a slice at a time. Call runAll() to finish it at once.

// Symmetric positive-definite inverse by Cholesky, in place on a flat n by n Float64Array, lower triangle.
export function* invertSPD(A, n, yieldEvery = 24) {
  for (let j = 0; j < n; j += 1) {
    const jr = j * n;
    let d = A[jr + j];
    for (let k = 0; k < j; k += 1) { const v = A[jr + k]; d -= v * v; }
    if (d <= 0) throw new Error('matrix is not positive definite');
    d = Math.sqrt(d);
    A[jr + j] = d;
    const id = 1 / d;
    for (let i = j + 1; i < n; i += 1) {
      const ir = i * n;
      let s = A[ir + j];
      for (let k = 0; k < j; k += 1) s -= A[ir + k] * A[jr + k];
      A[ir + j] = s * id;
    }
    if (j % yieldEvery === 0) yield j / (3 * n);
  }
  for (let j = 0; j < n; j += 1) {
    A[j * n + j] = 1 / A[j * n + j];
    for (let i = j + 1; i < n; i += 1) {
      const ir = i * n;
      let s = 0;
      for (let k = j; k < i; k += 1) s -= A[ir + k] * A[k * n + j];
      A[ir + j] = s / A[ir + i];
    }
    if (j % yieldEvery === 0) yield 1 / 3 + j / (3 * n);
  }
  for (let i = 0; i < n; i += 1) {
    const ir = i * n;
    for (let j = 0; j <= i; j += 1) {
      const jr = j * n;
      let s = 0;
      for (let k = i; k < n; k += 1) { const kr = k * n; s += A[kr + i] * A[kr + j]; }
      A[ir + j] = s;
    }
    if (i % yieldEvery === 0) yield 2 / 3 + i / (3 * n);
  }
}

export function offsets(qi) {
  const o = new Int32Array(qi.length + 1);
  for (let i = 0; i < qi.length; i += 1) o[i + 1] = o[i] + qi[i];
  return o;
}

// One-point and two-point frequencies with the pseudocount fraction lam (Morcos: lam = 0.5, meaning lambda = Meff).
export function frequencies(Y, N, L, qi, w, lam) {
  const off = offsets(qi), T = off[L];
  const fi = new Float64Array(T), fij = new Float64Array(T * T);
  let total = 0;
  const row = new Int32Array(L);
  for (let s = 0; s < N; s += 1) {
    const r = s * L, ws = w[s];
    total += ws;
    for (let i = 0; i < L; i += 1) row[i] = off[i] + Y[r + i];
    for (let i = 0; i < L; i += 1) {
      const a = row[i], ar = a * T;
      fi[a] += ws;
      for (let j = i + 1; j < L; j += 1) fij[ar + row[j]] += ws;
    }
  }
  const p = new Float64Array(T);
  for (let i = 0; i < L; i += 1) {
    const u = 1 / qi[i];
    for (let a = off[i]; a < off[i + 1]; a += 1) p[a] = (1 - lam) * (fi[a] / total) + lam * u;
  }
  for (let i = 0; i < L; i += 1) {
    const ui = 1 / qi[i];
    for (let j = i + 1; j < L; j += 1) {
      const u = ui / qi[j];
      for (let a = off[i]; a < off[i + 1]; a += 1) {
        const ar = a * T;
        for (let b = off[j]; b < off[j + 1]; b += 1) fij[ar + b] = (1 - lam) * (fij[ar + b] / total) + lam * u;
      }
    }
  }
  return { off, T, p, fij, total };
}

// Connected correlations for all but the last state of each column, which fixes the gauge. Returns the lower triangle.
export function covariance({ off, T, p, fij }, L, qi) {
  const smallOff = new Int32Array(L + 1);
  for (let i = 0; i < L; i += 1) smallOff[i + 1] = smallOff[i] + qi[i] - 1;
  const n = smallOff[L], C = new Float64Array(n * n);
  for (let i = 0; i < L; i += 1) {
    const qa = qi[i] - 1;
    for (let a = 0; a < qa; a += 1) {
      const ra = smallOff[i] + a, pa = p[off[i] + a];
      for (let b = 0; b <= a; b += 1) {
        const rb = smallOff[i] + b;
        C[ra * n + rb] = (a === b ? pa : 0) - pa * p[off[i] + b];
      }
      for (let j = 0; j < i; j += 1) {
        const qb = qi[j] - 1;
        for (let b = 0; b < qb; b += 1) {
          const rb = smallOff[j] + b, ib = off[j] + b;
          C[ra * n + rb] = fij[ib * T + off[i] + a] - pa * p[ib];
        }
      }
    }
  }
  return { C, n, smallOff };
}

// The Frobenius norm of each coupling block in the zero-sum gauge.
export function frobenius(Cinv, n, smallOff, L, qi) {
  const S = new Float64Array(L * L);
  const q = Math.max(...qi);
  const e = new Float64Array(q * q), ra = new Float64Array(q), rb = new Float64Array(q);
  for (let i = 0; i < L; i += 1) {
    const qa = qi[i];
    for (let j = 0; j < i; j += 1) {
      const qb = qi[j];
      e.fill(0, 0, q * q);
      ra.fill(0); rb.fill(0);
      let all = 0;
      for (let a = 0; a < qa - 1; a += 1) {
        const row = (smallOff[i] + a) * n + smallOff[j];
        for (let b = 0; b < qb - 1; b += 1) {
          const v = -Cinv[row + b];
          e[a * q + b] = v;
          ra[a] += v; rb[b] += v; all += v;
        }
      }
      let s = 0;
      for (let a = 0; a < qa; a += 1) {
        for (let b = 0; b < qb; b += 1) {
          const v = e[a * q + b] - ra[a] / qb - rb[b] / qa + all / (qa * qb);
          s += v * v;
        }
      }
      S[i * L + j] = S[j * L + i] = Math.sqrt(s);
    }
  }
  return S;
}

// The whole calculation. Yields a number from 0 to 1 as it goes, and returns the L by L score matrix.
export function* meanFieldDCA(Y, N, L, qi, w, lam = 0.5) {
  const fq = frequencies(Y, N, L, qi, w, lam);
  yield 0.02;
  const { C, n, smallOff } = covariance(fq, L, qi);
  yield 0.05;
  for (const f of invertSPD(C, n)) yield 0.05 + f * 0.9;
  return frobenius(C, n, smallOff, L, qi);
}

export function runAll(gen) {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
}

// The small version a person can check by eye: for a 3 by 3 correlation matrix, the partial correlations.
// Partial correlation(a, b) = -P_ab / sqrt(P_aa P_bb), where P is the inverse.
export function inverse3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d].map((v) => v / det);
}
export function partialCorrelations(m) {
  const P = inverse3(m);
  const part = (x, y) => -P[x * 3 + y] / Math.sqrt(P[x * 3 + x] * P[y * 3 + y]);
  return { ab: part(0, 1), bc: part(1, 2), ac: part(0, 2), det: m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]) };
}
