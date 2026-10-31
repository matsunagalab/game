// Invariant point attention, Jumper et al. 2021, Supplementary Algorithm 22, line 7, with learned parts replaced by
// values the player sets. Real sizes in AF2: 12 heads, 4 query points, 8 value points, in nanometres. See the chapter note.
//
// logits[i][j] = wL * ( bias[i][j] - (gamma * wC / 2) * sum over p of | T_i o q_ip - T_j o k_jp |^2 )
// wC = sqrt(2 / (9 Nq)), wL = sqrt(1 / 3), gamma = 1, and points are in nanometres, as in the supplement.
import { apply, applyInverse } from './frames.js';

export function softmax(values) {
  let top = -Infinity;
  for (const v of values) if (v > top) top = v;
  const out = values.map((v) => Math.exp(v - top));
  const z = out.reduce((a, b) => a + b, 0);
  return out.map((v) => v / z);
}

// frames: the residues. query: points local to i. keys[j]: points local to j. All in angstroms on the way in.
export function ipaWeights(frames, i, query, keys, { bias = null, gamma = 1 } = {}) {
  const Nq = query.length, wC = Math.sqrt(2 / (9 * Nq)), wL = Math.sqrt(1 / 3);
  const q = query.map((p) => apply(frames[i], p));
  const logits = frames.map((T, j) => {
    let d2 = 0;
    for (let p = 0; p < Nq; p += 1) {
      const k = apply(T, keys[j][p]);
      const dx = (q[p][0] - k[0]) / 10, dy = (q[p][1] - k[1]) / 10, dz = (q[p][2] - k[2]) / 10; // angstroms to nanometres
      d2 += dx * dx + dy * dy + dz * dz;
    }
    return wL * ((bias ? bias[j] : 0) - (gamma * wC / 2) * d2);
  });
  return softmax(logits);
}

// Line 10: the attention-weighted mean of the value points, brought home into residue i's frame.
export function ipaValuePoint(frames, i, weights, values) {
  const g = [0, 0, 0];
  frames.forEach((T, j) => {
    const v = apply(T, values[j]);
    g[0] += weights[j] * v[0]; g[1] += weights[j] * v[1]; g[2] += weights[j] * v[2];
  });
  return applyInverse(frames[i], g);
}

// What a naive network might do: score residues by raw global coordinates. It looks reasonable and it is not invariant.
export function rawWeights(points, i, sharp = 0.02) {
  const logits = points.map((p) => -sharp * ((p[0] - points[i][0]) + (p[1] - points[i][1]) * 0.5) ** 2);
  return softmax(logits);
}

export const maxChange = (a, b) => a.reduce((m, v, k) => Math.max(m, Math.abs(v - b[k])), 0);
