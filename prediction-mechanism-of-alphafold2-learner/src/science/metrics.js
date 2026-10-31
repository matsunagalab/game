// The ways this game scores one structure against another. All lengths are in angstroms.
import { applyInverse, framesOf, vec } from './frames.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Frame aligned point error, Jumper et al. 2021, Supplementary Algorithm 28.
// Every frame i looks at every point j. Z = 10 A makes it unitless, dclamp = 10 A is the clamp, Infinity turns it off.
export function fape(framesP, pointsP, framesT, pointsT, { clamp = 10, Z = 10, eps = 1e-4 } = {}) {
  let sum = 0;
  for (let i = 0; i < framesP.length; i += 1) {
    for (let j = 0; j < pointsP.length; j += 1) {
      const a = applyInverse(framesP[i], pointsP[j]);
      const b = applyInverse(framesT[i], pointsT[j]);
      const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
      sum += Math.min(clamp, Math.sqrt(dx * dx + dy * dy + dz * dz + eps));
    }
  }
  return sum / (framesP.length * pointsP.length) / Z;
}

// e_ij: the error at point j when the two structures are aligned on frame i. This is the quantity PAE predicts
// (Supplementary section 1.9.7), and FAPE is its clamped average. The matrix is not symmetric. Row i, column j.
export function alignedError(framesP, pointsP, framesT, pointsT) {
  const n = framesP.length, m = pointsP.length, e = new Float32Array(n * m);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      e[i * m + j] = distance(applyInverse(framesP[i], pointsP[j]), applyInverse(framesT[i], pointsT[j]));
    }
  }
  return e;
}

const centroid = (p) => {
  const c = [0, 0, 0];
  for (const x of p) { c[0] += x[0]; c[1] += x[1]; c[2] += x[2]; }
  return c.map((v) => v / p.length);
};

// Jacobi eigenvalues for a symmetric matrix, enough for the 4 by 4 of Horn's quaternion method.
function jacobi(a, n) {
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let off = 0;
    for (let p = 0; p < n; p += 1) for (let q = p + 1; q < n; q += 1) off += a[p][q] * a[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k += 1) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
        for (let k = 0; k < n; k += 1) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
        for (let k = 0; k < n; k += 1) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

// The quaternion of the proper rotation nearest to a 3 by 3 matrix M, again by Horn's method.
export function nearestQuaternion(M) {
  const [sxx, sxy, sxz, syx, syy, syz, szx, szy, szz] = M;
  const N = [
    [sxx + syy + szz, szy - syz, sxz - szx, syx - sxy],
    [szy - syz, sxx - syy - szz, sxy + syx, szx + sxz],
    [sxz - szx, sxy + syx, -sxx + syy - szz, syz + szy],
    [syx - sxy, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const { values, vectors } = jacobi(N, 4);
  let best = 0;
  for (let i = 1; i < 4; i += 1) if (values[i] > values[best]) best = i;
  return [vectors[0][best], vectors[1][best], vectors[2][best], vectors[3][best]];
}

export function rotationFromQuaternion([w, x, y, z]) {
  return [
    w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z,
  ];
}

export const nearestRotation = (M) => rotationFromQuaternion(nearestQuaternion(M));

// Best proper rotation laying P onto Q (Kabsch's problem, solved here by Horn's quaternion method).
// With mirror = true the reflection of P is allowed instead, which is the only way a mirror image can reach RMSD zero.
export function superpose(P, Q, { mirror = false } = {}) {
  const cp = centroid(P), cq = centroid(Q);
  const sign = mirror ? -1 : 1;
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < P.length; k += 1) {
    const x = [(P[k][0] - cp[0]) * sign, (P[k][1] - cp[1]) * sign, (P[k][2] - cp[2]) * sign];
    const y = [Q[k][0] - cq[0], Q[k][1] - cq[1], Q[k][2] - cq[2]];
    for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) S[a * 3 + b] += x[a] * y[b];
  }
  const [sxx, sxy, sxz, syx, syy, syz, szx, szy, szz] = S;
  const N = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];
  const { values, vectors } = jacobi(N, 4);
  let best = 0;
  for (let i = 1; i < 4; i += 1) if (values[i] > values[best]) best = i;
  const [w, x, y, z] = [vectors[0][best], vectors[1][best], vectors[2][best], vectors[3][best]];
  const R = [
    w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z,
  ];
  let sum = 0;
  const fitted = P.map((p) => {
    const d = [(p[0] - cp[0]) * sign, (p[1] - cp[1]) * sign, (p[2] - cp[2]) * sign];
    const r = [R[0] * d[0] + R[1] * d[1] + R[2] * d[2] + cq[0], R[3] * d[0] + R[4] * d[1] + R[5] * d[2] + cq[1], R[6] * d[0] + R[7] * d[1] + R[8] * d[2] + cq[2]];
    return r;
  });
  fitted.forEach((r, k) => { sum += (r[0] - Q[k][0]) ** 2 + (r[1] - Q[k][1]) ** 2 + (r[2] - Q[k][2]) ** 2; });
  return { R, rmsd: Math.sqrt(sum / P.length), fitted, cp, cq, sign };
}
export const rmsd = (P, Q, opts) => superpose(P, Q, opts).rmsd;

// dRMSD: compares only the distance tables, so it needs no superposition at all.
export function drmsd(P, Q) {
  let sum = 0, n = 0;
  for (let i = 0; i < P.length; i += 1) {
    for (let j = i + 1; j < P.length; j += 1) {
      const d = distance(P[i], P[j]) - distance(Q[i], Q[j]);
      sum += d * d;
      n += 1;
    }
  }
  return Math.sqrt(sum / n);
}

// lDDT on one kind of atom, as in alphafold/model/lddt.py (Mariani et al. 2013): only pairs closer than the cutoff
// in the true structure count, and each is scored at 0.5, 1, 2 and 4 A. Like AF2's version it has no stereochemistry term.
export function lddt(pred, truth, { cutoff = 15, perResidue = false } = {}) {
  const n = pred.length, per = new Float64Array(n);
  let total = 0, count = 0;
  for (let i = 0; i < n; i += 1) {
    let s = 0, c = 0;
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const dt = distance(truth[i], truth[j]);
      if (dt >= cutoff) continue;
      const e = Math.abs(dt - distance(pred[i], pred[j]));
      s += 0.25 * ((e < 0.5) + (e < 1) + (e < 2) + (e < 4));
      c += 1;
    }
    per[i] = c ? s / c : 0;
    total += s;
    count += c;
  }
  return perResidue ? per : (count ? total / count : 0);
}

// The mean error of placing points, used to say how far one residue's view is from the truth.
export const framesFromChain = framesOf;
export const vecNorm = vec.norm;
