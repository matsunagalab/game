// Teaching update for chapter 5: every residue hears where every other residue thinks it should be.
//
// The pair map here simply holds each pair's real relative pose, Z[j][i] = (T_j true)^-1 o T_i true. That is a cheat.
// AlphaFold2 has to infer this from its pair representation, with learned weights. Each block:
//   proposal from j for i:  P = T_j o Z[j][i]
//   average the proposals into one pose, move a fraction of the way there, and compose: T_i <- T_i o dT_i
// A residue that only hears its chain neighbours (reach > 0) gets news slowly. That is the point of letting all talk.
import { apply, compose, IDENTITY, invert, mulRR, transpose } from './frames.js';
import { nearestRotation } from './metrics.js';

export function relativePoses(frames) {
  const inv = frames.map(invert);
  return (j, i) => compose(inv[j], frames[i]);
}

export class PoseGas {
  constructor(truth, { seed = 3 } = {}) {
    this.truth = truth;
    this.n = truth.length;
    this.rel = relativePoses(truth);
    let s = seed;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
    // Black hole: every frame the identity at the origin. A nudge far smaller than an atom stands in for the differing embeddings.
    this.frames = truth.map(() => { const T = IDENTITY(); T.t = [r() * 0.02, r() * 0.02, r() * 0.02]; return T; });
    this.block = 0;
  }

  // reach = 0 lets every residue hear every other. reach = k limits it to k neighbours along the chain.
  step({ share = 0.42, reach = 0 } = {}) {
    const { n, frames, rel } = this, next = [];
    for (let i = 0; i < n; i += 1) {
      const M = [0, 0, 0, 0, 0, 0, 0, 0, 0], t = [0, 0, 0];
      let w = 0;
      for (let j = 0; j < n; j += 1) {
        if (j === i || (reach && Math.abs(i - j) > reach)) continue;
        const P = compose(frames[j], rel(j, i));
        for (let k = 0; k < 9; k += 1) M[k] += P.R[k];
        t[0] += P.t[0]; t[1] += P.t[1]; t[2] += P.t[2];
        w += 1;
      }
      const R = nearestRotation(M), T = frames[i], target = { R, t: [t[0] / w, t[1] / w, t[2] / w] };
      // dT is written in the residue's own frame, and only a share of it is taken, as a rotation by the same axis.
      const dR = mulRR(transpose(T.R), target.R), dt = transposeApply(T.R, [target.t[0] - T.t[0], target.t[1] - T.t[1], target.t[2] - T.t[2]]);
      const part = fractionalRotation(dR, this.block === 0 ? 1 : share);
      const s = this.block === 0 ? 0.3 : share;
      next.push(compose(T, { R: part, t: [dt[0] * s, dt[1] * s, dt[2] * s] }));
    }
    this.frames = next;
    this.block += 1;
    return next;
  }

  points(local = [0, 0, 0]) { return this.frames.map((T) => apply(T, local)); }
}

const transposeApply = (R, v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];

// The rotation R taken s of the way from the identity: same axis, s times the angle.
export function fractionalRotation(R, s) {
  const c = Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2)), angle = Math.acos(c);
  if (angle < 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let x = R[7] - R[5], y = R[2] - R[6], z = R[3] - R[1];
  const m = Math.hypot(x, y, z);
  if (m < 1e-9) return R;
  x /= m; y /= m; z /= m;
  const a = angle * s, ca = Math.cos(a), sa = Math.sin(a), u = 1 - ca;
  return [ca + x * x * u, x * y * u - z * sa, x * z * u + y * sa, y * x * u + z * sa, ca + y * y * u, y * z * u - x * sa, z * x * u - y * sa, z * y * u + x * sa, ca + z * z * u];
}
