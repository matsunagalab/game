// One optimiser, two losses, for chapter 7: same crystal, same black-hole start, same steps on free coordinates, with
// momentum. The FAPE run also re-fits each frame's rotation at every step, because that loss needs frames. It is not the
// training of a network, and it uses the true structure's distances or local views, so it can only ask which hand a loss allows.
//
// loss = 'distance': every pair should have its real distance.
// loss = 'fape': from each residue's frame, every other residue should sit where it really sits. Each frame is a proper
// rotation, re-solved at every step as the best one for the current points, so nothing about the true hand is given to it
// except through that local view.
import { applyInverse } from './frames.js';
import { nearestQuaternion, rotationFromQuaternion } from './metrics.js';

export class Descent {
  constructor(frames, ca, { loss = 'fape', seed = 11, clamp = 10, rate = 0.6, inertia = 0.8, polish = 6 } = {}) {
    const n = ca.length;
    Object.assign(this, { n, loss, clamp, rate, inertia, polish, steps: 0 });
    this.local = new Float64Array(n * n * 3);
    this.table = new Float64Array(n * n);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const v = applyInverse(frames[i], ca[j]);
        this.local.set(v, (i * n + j) * 3);
        this.table[i * n + j] = Math.hypot(ca[i][0] - ca[j][0], ca[i][1] - ca[j][1], ca[i][2] - ca[j][2]);
      }
    }
    let s = seed;
    const r = () => { s = (s * 48271) % 2147483647; return s / 2147483647 - 0.5; };
    this.t = new Float64Array(n * 3).map(() => r() * 0.05); // the black hole, with a nudge far smaller than an atom
    this.R = Array.from({ length: n }, () => [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.q = Array.from({ length: n }, () => [1, 0, 0, 0]);
    this.v = new Float64Array(n * 3);
    this.grad = new Float64Array(n * 3);
  }

  * slices(count, every = 4) {
    for (let k = 0; k < count; k += 1) { this.step(); if (k % every === every - 1) yield k / count; }
  }

  step() {
    const { n, t, R, local, table, grad, clamp, v } = this;
    grad.fill(0);
    let total = 0;
    const eps = 1e-4;
    for (let i = 0; i < n; i += 1) {
      const a = i * 3, ti0 = t[a], ti1 = t[a + 1], ti2 = t[a + 2];
      if (this.loss === 'distance') {
        for (let j = 0; j < n; j += 1) {
          if (j === i) continue;
          const b = j * 3, px = t[b] - ti0, py = t[b + 1] - ti1, pz = t[b + 2] - ti2, r = Math.sqrt(px * px + py * py + pz * pz) + 1e-9;
          const e = r - table[i * n + j], d = Math.sqrt(e * e + eps);
          if (d >= clamp) { total += clamp; continue; }
          total += d;
          const s = e / (d * r), gx = s * px, gy = s * py, gz = s * pz;
          grad[b] += gx; grad[b + 1] += gy; grad[b + 2] += gz;
          grad[a] -= gx; grad[a + 1] -= gy; grad[a + 2] -= gz;
        }
        continue;
      }
      // The best proper rotation for this frame, given where the points are now.
      const base = i * n * 3;
      {
        let sxx = 0, sxy = 0, sxz = 0, syx = 0, syy = 0, syz = 0, szx = 0, szy = 0, szz = 0;
        const Ri = R[i];
        for (let j = 0; j < n; j += 1) {
          const b = j * 3, px = t[b] - ti0, py = t[b + 1] - ti1, pz = t[b + 2] - ti2, l = base + b, lx = local[l], ly = local[l + 1], lz = local[l + 2];
          const ex = Ri[0] * px + Ri[3] * py + Ri[6] * pz - lx, ey = Ri[1] * px + Ri[4] * py + Ri[7] * pz - ly, ez = Ri[2] * px + Ri[5] * py + Ri[8] * pz - lz;
          const d = Math.sqrt(ex * ex + ey * ey + ez * ez + eps);
          if (d >= clamp) continue;
          const w = 1 / d;
          sxx += w * px * lx; sxy += w * px * ly; sxz += w * px * lz;
          syx += w * py * lx; syy += w * py * ly; syz += w * py * lz;
          szx += w * pz * lx; szy += w * pz * ly; szz += w * pz * lz;
        }
        if (this.steps === 0) {
          this.q[i] = nearestQuaternion([sxx, sxy, sxz, syx, syy, syz, szx, szy, szz]);
          R[i] = rotationFromQuaternion(this.q[i]);
        } else {
          // Horn's quaternion matrix again, polished from last step's answer by a few rounds of the power method.
          // Far cheaper than solving from nothing. It is close to the exact answer once warm, not identical to it.
          const n00 = sxx + syy + szz, n01 = szy - syz, n02 = sxz - szx, n03 = syx - sxy, n11 = sxx - syy - szz, n12 = sxy + syx, n13 = szx + sxz, n22 = -sxx + syy - szz, n23 = syz + szy, n33 = -sxx - syy + szz;
          const shift = Math.abs(n00) + Math.abs(n11) + Math.abs(n22) + Math.abs(n33) + Math.abs(n01) + Math.abs(n02) + Math.abs(n03) + Math.abs(n12) + Math.abs(n13) + Math.abs(n23) + 1e-9;
          let [w0, x0, y0, z0] = this.q[i];
          for (let k = 0; k < this.polish; k += 1) {
            const a0 = (n00 + shift) * w0 + n01 * x0 + n02 * y0 + n03 * z0, a1 = n01 * w0 + (n11 + shift) * x0 + n12 * y0 + n13 * z0, a2 = n02 * w0 + n12 * x0 + (n22 + shift) * y0 + n23 * z0, a3 = n03 * w0 + n13 * x0 + n23 * y0 + (n33 + shift) * z0;
            const m = 1 / Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3);
            w0 = a0 * m; x0 = a1 * m; y0 = a2 * m; z0 = a3 * m;
          }
          this.q[i] = [w0, x0, y0, z0];
          R[i] = rotationFromQuaternion(this.q[i]);
        }
      }
      const Q = R[i];
      for (let j = 0; j < n; j += 1) {
        const b = j * 3, px = t[b] - ti0, py = t[b + 1] - ti1, pz = t[b + 2] - ti2, l = base + b;
        const ex = Q[0] * px + Q[3] * py + Q[6] * pz - local[l], ey = Q[1] * px + Q[4] * py + Q[7] * pz - local[l + 1], ez = Q[2] * px + Q[5] * py + Q[8] * pz - local[l + 2];
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez + eps);
        if (d >= clamp) { total += clamp; continue; }
        total += d;
        const s = 1 / d, gx = s * (Q[0] * ex + Q[1] * ey + Q[2] * ez), gy = s * (Q[3] * ex + Q[4] * ey + Q[5] * ez), gz = s * (Q[6] * ex + Q[7] * ey + Q[8] * ez);
        grad[b] += gx; grad[b + 1] += gy; grad[b + 2] += gz;
        grad[a] -= gx; grad[a + 1] -= gy; grad[a + 2] -= gz;
      }
    }
    const { rate, inertia } = this;
    for (let k = 0; k < n * 3; k += 1) { v[k] = inertia * v[k] - (rate * grad[k]) / n; t[k] += v[k]; }
    this.score = total / (n * n) / 10; // in FAPE's units for the fape loss
    this.steps += 1;
    return this.score;
  }

  points() { return Array.from({ length: this.n }, (_, i) => [this.t[i * 3], this.t[i * 3 + 1], this.t[i * 3 + 2]]); }
}
