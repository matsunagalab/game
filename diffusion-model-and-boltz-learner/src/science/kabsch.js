// Rigid superposition on flat arrays [x0, y0, z0, x1, ...]. Rotation found from the 3 by 3 covariance by Jacobi sweeps on its square.
export function centre(a, w = null) {
  const n = a.length / 3;
  let x = 0, y = 0, z = 0, t = 0;
  for (let i = 0; i < n; i += 1) { const k = w ? w[i] : 1; x += k * a[3 * i]; y += k * a[3 * i + 1]; z += k * a[3 * i + 2]; t += k; }
  return [x / t, y / t, z / t];
}
export function shift(a, c, out = a) {
  for (let i = 0; i < a.length; i += 3) { out[i] = a[i] + c[0]; out[i + 1] = a[i + 1] + c[1]; out[i + 2] = a[i + 2] + c[2]; }
  return out;
}

function eig3(S) {
  // Jacobi eigen-decomposition of a symmetric 3 by 3 matrix. Returns values and vectors (columns).
  const A = [S[0], S[1], S[2], S[3], S[4], S[5], S[6], S[7], S[8]], V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 24; sweep += 1) {
    const off = Math.abs(A[1]) + Math.abs(A[2]) + Math.abs(A[5]);
    if (off < 1e-13 * (Math.abs(A[0]) + Math.abs(A[4]) + Math.abs(A[8]) + 1e-30)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = A[3 * p + q];
      if (Math.abs(apq) < 1e-300) continue;
      const th = (A[3 * q + q] - A[3 * p + p]) / (2 * apq), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let r = 0; r < 3; r += 1) { const a = A[3 * r + p], b = A[3 * r + q]; A[3 * r + p] = c * a - s * b; A[3 * r + q] = s * a + c * b; }
      for (let r = 0; r < 3; r += 1) { const a = A[3 * p + r], b = A[3 * q + r]; A[3 * p + r] = c * a - s * b; A[3 * q + r] = s * a + c * b; }
      for (let r = 0; r < 3; r += 1) { const a = V[3 * r + p], b = V[3 * r + q]; V[3 * r + p] = c * a - s * b; V[3 * r + q] = s * a + c * b; }
    }
  }
  return { w: [A[0], A[4], A[8]], V };
}

// The proper rotation R (row-major) that best maps mobile (centred) onto target (centred): R y approximates x.
// mirror = true gives the best improper rotation instead.
export function bestRotation(mobile, target, { mirror = false, weights = null } = {}) {
  const H = [0, 0, 0, 0, 0, 0, 0, 0, 0], n = mobile.length / 3;
  for (let i = 0; i < n; i += 1) {
    const w = weights ? weights[i] : 1, a = mobile[3 * i], b = mobile[3 * i + 1], c = mobile[3 * i + 2], x = target[3 * i], y = target[3 * i + 1], z = target[3 * i + 2];
    H[0] += w * a * x; H[1] += w * a * y; H[2] += w * a * z;
    H[3] += w * b * x; H[4] += w * b * y; H[5] += w * b * z;
    H[6] += w * c * x; H[7] += w * c * y; H[8] += w * c * z;
  }
  // H = sum y_i x_i^T = U S V^T, and R = V D U^T. Here HtH = V S^2 V^T.
  const T = new Array(9).fill(0);
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) for (let k = 0; k < 3; k += 1) T[3 * i + j] += H[3 * k + i] * H[3 * k + j];
  const { w, V } = eig3(T), order = [0, 1, 2].sort((p, q) => w[q] - w[p]), S = [], Vv = [], U = [];
  for (const o of order) { S.push(Math.sqrt(Math.max(w[o], 0))); Vv.push([V[o], V[3 + o], V[6 + o]]); }
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (let k = 0; k < 2; k += 1) {
    const v = Vv[k], u = [H[0] * v[0] + H[1] * v[1] + H[2] * v[2], H[3] * v[0] + H[4] * v[1] + H[5] * v[2], H[6] * v[0] + H[7] * v[1] + H[8] * v[2]], l = Math.hypot(...u) || 1;
    U.push([u[0] / l, u[1] / l, u[2] / l]);
  }
  U.push(cross(U[0], U[1]));
  // Fix the sign of the last axis: a proper rotation needs det(V) det(U) = +1 after choosing D.
  const detV = Vv[0][0] * (Vv[1][1] * Vv[2][2] - Vv[1][2] * Vv[2][1]) - Vv[0][1] * (Vv[1][0] * Vv[2][2] - Vv[1][2] * Vv[2][0]) + Vv[0][2] * (Vv[1][0] * Vv[2][1] - Vv[1][1] * Vv[2][0]);
  const third = Math.sign(detV || 1) * (mirror ? -1 : 1);
  const R = new Array(9).fill(0);
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      R[3 * i + j] = Vv[0][i] * U[0][j] + Vv[1][i] * U[1][j] + third * Vv[2][i] * U[2][j];
    }
  }
  return R; // x approximates R y, rows are the target axes.
}

export function rotate(R, a, out = new Float64Array(a.length)) {
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i], y = a[i + 1], z = a[i + 2];
    out[i] = R[0] * x + R[1] * y + R[2] * z;
    out[i + 1] = R[3] * x + R[4] * y + R[5] * z;
    out[i + 2] = R[6] * x + R[7] * y + R[8] * z;
  }
  return out;
}

export function rmsd(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / (a.length / 3));
}

// Root mean square deviation after the best proper (or improper) superposition. Both are centred on copies.
export function fitRmsd(a, b, opts) {
  const ca = centre(a), cb = centre(b), x = shift(a, [-ca[0], -ca[1], -ca[2]], new Float64Array(a.length)), y = shift(b, [-cb[0], -cb[1], -cb[2]], new Float64Array(b.length));
  return rmsd(x, rotate(bestRotation(y, x, opts), y));
}

// A uniformly random rotation, from a random unit quaternion.
export function randomRotation(rng) {
  let w, x, y, z, n;
  do { w = rng.n(); x = rng.n(); y = rng.n(); z = rng.n(); n = Math.hypot(w, x, y, z); } while (n < 1e-9);
  w /= n; x /= n; y /= n; z /= n;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
export const axisRotation = (ax, ay, az, t) => {
  const c = Math.cos(t), s = Math.sin(t), v = 1 - c, n = Math.hypot(ax, ay, az) || 1, x = ax / n, y = ay / n, z = az / n;
  return [c + x * x * v, x * y * v - z * s, x * z * v + y * s, y * x * v + z * s, c + y * y * v, y * z * v - x * s, z * x * v - y * s, z * y * v + x * s, c + z * z * v];
};
export const compose = (A, B) => {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) for (let k = 0; k < 3; k += 1) C[3 * i + j] += A[3 * i + k] * B[3 * k + j];
  return C;
};
