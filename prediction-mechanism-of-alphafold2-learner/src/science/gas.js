// The residue gas: one rigid N-CA-C frame per residue, no chain. This file is the game's TEACHING update, a stand-in for
// the learned Structure Module. AlphaFold2 has no restraints and no gradient descent at inference: its moves come out
// of trained weights. Here a block is a stated number of gradient steps on stated geometric restraints.
import { compose, frameFromAtoms, IDENTITY, mulRv, rotationFromBCD } from './frames.js';

// Mean local coordinates of N, C and C-beta over a real chain, so every paper triangle has its real shape.
export function localAtoms(st) {
  const sum = { n: [0, 0, 0], c: [0, 0, 0], cb: [0, 0, 0] };
  let nb = 0;
  st.frames.forEach((T, i) => {
    const local = (p) => { const d = [p[0] - T.t[0], p[1] - T.t[1], p[2] - T.t[2]]; const R = T.R; return [R[0] * d[0] + R[3] * d[1] + R[6] * d[2], R[1] * d[0] + R[4] * d[1] + R[7] * d[2], R[2] * d[0] + R[5] * d[1] + R[8] * d[2]]; };
    const a = local(st.n[i]), b = local(st.c[i]), c = local(st.cb[i]);
    for (let k = 0; k < 3; k += 1) { sum.n[k] += a[k]; sum.c[k] += b[k]; }
    if (Math.hypot(c[0], c[1], c[2]) > 0.5) { nb += 1; for (let k = 0; k < 3; k += 1) sum.cb[k] += c[k]; }
  });
  const m = st.frames.length;
  return { n: sum.n.map((v) => v / m), c: sum.c.map((v) => v / m), cb: sum.cb.map((v) => v / nb) };
}

export const ATOM = { CA: 0, N: 1, C: 2, CB: 3 };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// restraints: list of { i, a, j, b, d, w, lo, hi }, atoms a and b from ATOM. A pair inside [lo, hi] feels nothing.
export class Gas {
  constructor(n, shape, { seed = 11 } = {}) {
    this.n = n;
    this.local = [[0, 0, 0], shape.n, shape.c, shape.cb];
    this.seed = seed;
    this.restraints = [];
    this.anchors = [];
    this.reset();
  }

  // Black-hole start: every frame the identity, every residue at the origin. Each residue's embedding differs in
  // AlphaFold2. Here a nudge smaller than a tenth of an angstrom breaks the tie instead.
  reset(nudge = 0.05) {
    const random = rng(this.seed);
    this.frames = Array.from({ length: this.n }, () => IDENTITY());
    for (const T of this.frames) T.t = [(random() - 0.5) * nudge, (random() - 0.5) * nudge, (random() - 0.5) * nudge];
    this.steps = 0;
    this.momentum = new Float64Array(this.n * 6);
  }

  atom(i, a) {
    const T = this.frames[i], p = mulRv(T.R, this.local[a]);
    return [p[0] + T.t[0], p[1] + T.t[1], p[2] + T.t[2]];
  }
  points(a = ATOM.CA) { return this.frames.map((_, i) => this.atom(i, a)); }

  // One step of gradient descent on the frames. The translation and rotation are written in each residue's own frame,
  // then composed onto it: T <- T o dT, as in Supplementary Algorithm 20 line 10, with dT built as in Algorithm 23.
  step({ rate = 0.25, turn = 0.02, repel = 3.8, repelWeight = 1, clampMove = 1.6, inertia = 0.6 } = {}) {
    const { n, frames, restraints, anchors } = this;
    const force = new Float64Array(n * 3), torque = new Float64Array(n * 3), count = new Float64Array(n);
    const atoms = [];
    for (let i = 0; i < n; i += 1) atoms.push([this.atom(i, 0), this.atom(i, 1), this.atom(i, 2), this.atom(i, 3)]);
    let energy = 0;
    const pull = (i, p, f) => {
      force[i * 3] += f[0]; force[i * 3 + 1] += f[1]; force[i * 3 + 2] += f[2];
      const t = frames[i].t, r = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
      torque[i * 3] += r[1] * f[2] - r[2] * f[1];
      torque[i * 3 + 1] += r[2] * f[0] - r[0] * f[2];
      torque[i * 3 + 2] += r[0] * f[1] - r[1] * f[0];
    };
    for (const c of restraints) {
      const p = atoms[c.i][c.a], q = atoms[c.j][c.b];
      const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2], r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-9;
      const lo = c.lo ?? c.d, hi = c.hi ?? c.d;
      const e = r < lo ? r - lo : r > hi ? r - hi : 0;
      if (e === 0) continue;
      energy += c.w * e * e;
      const s = (-c.w * e) / r, f = [dx * s, dy * s, dz * s];
      pull(c.i, p, f);
      pull(c.j, q, [-f[0], -f[1], -f[2]]);
      count[c.i] += c.w; count[c.j] += c.w;
    }
    // Local-frame anchors: j should sit at v as seen from frame i. A distance cannot tell a shape from its mirror. This can.
    for (const c of anchors) {
      const T = frames[c.i], w = mulRv(T.R, c.v), target = [w[0] + T.t[0], w[1] + T.t[1], w[2] + T.t[2]], p = atoms[c.j][0];
      const f = [(target[0] - p[0]) * c.w, (target[1] - p[1]) * c.w, (target[2] - p[2]) * c.w];
      energy += 0.5 * (f[0] ** 2 + f[1] ** 2 + f[2] ** 2) / c.w;
      pull(c.j, p, f);
      pull(c.i, target, [-f[0], -f[1], -f[2]]);
      count[c.i] += c.w; count[c.j] += c.w;
    }
    if (repelWeight > 0) {
      for (let i = 0; i < n; i += 1) {
        const p = atoms[i][0];
        for (let j = i + 2; j < n; j += 1) {
          const q = atoms[j][0], dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2], r2 = dx * dx + dy * dy + dz * dz;
          if (r2 >= repel * repel) continue;
          const r = Math.sqrt(r2) + 1e-9, e = r - repel, s = (-repelWeight * e) / r, f = [dx * s, dy * s, dz * s];
          energy += repelWeight * e * e;
          pull(i, p, f);
          pull(j, q, [-f[0], -f[1], -f[2]]);
        }
      }
    }
    for (let i = 0; i < n; i += 1) {
      const T = frames[i], R = T.R, g = 1 / Math.max(1, Math.sqrt(count[i] + 1) * 1.0);
      const fl = [R[0] * force[i * 3] + R[3] * force[i * 3 + 1] + R[6] * force[i * 3 + 2], R[1] * force[i * 3] + R[4] * force[i * 3 + 1] + R[7] * force[i * 3 + 2], R[2] * force[i * 3] + R[5] * force[i * 3 + 1] + R[8] * force[i * 3 + 2]];
      const tl = [R[0] * torque[i * 3] + R[3] * torque[i * 3 + 1] + R[6] * torque[i * 3 + 2], R[1] * torque[i * 3] + R[4] * torque[i * 3 + 1] + R[7] * torque[i * 3 + 2], R[2] * torque[i * 3] + R[5] * torque[i * 3 + 1] + R[8] * torque[i * 3 + 2]];
      const m = this.momentum, at = i * 6;
      for (let k = 0; k < 3; k += 1) {
        m[at + k] = inertia * m[at + k] + rate * g * fl[k];
        m[at + 3 + k] = inertia * m[at + 3 + k] + turn * g * tl[k];
      }
      const mv = Math.hypot(m[at], m[at + 1], m[at + 2]), sc = mv > clampMove ? clampMove / mv : 1;
      const dT = { R: rotationFromBCD(m[at + 3] * 0.5, m[at + 4] * 0.5, m[at + 5] * 0.5), t: [m[at] * sc, m[at + 1] * sc, m[at + 2] * sc] };
      frames[i] = compose(T, dT);
    }
    this.steps += 1;
    this.energy = energy;
    return energy;
  }

  run(count, opts) { for (let k = 0; k < count; k += 1) this.step(opts); return this.energy; }
}

// Real atoms to a frame list: used to seed a gas from a known structure.
export const framesFromAtoms = (st, idx) => idx.map((r) => frameFromAtoms(st.n[r], st.ca[r], st.c[r]));

// Top three eigenvectors of the double-centred squared-distance matrix: classical multidimensional scaling.
export function classicalMDS(D, n, seed = 5) {
  const B = new Float64Array(n * n), row = new Float64Array(n);
  let all = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) { const d2 = D[i * n + j] ** 2; B[i * n + j] = d2; row[i] += d2 / n; all += d2 / (n * n); }
  }
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) B[i * n + j] = -0.5 * (B[i * n + j] - row[i] - row[j] + all);
  const random = rng(seed), vectors = [], values = [];
  for (let e = 0; e < 3; e += 1) {
    let v = Float64Array.from({ length: n }, () => random() - 0.5);
    let lambda = 0;
    for (let it = 0; it < 200; it += 1) {
      for (const u of vectors) { let d = 0; for (let i = 0; i < n; i += 1) d += u[i] * v[i]; for (let i = 0; i < n; i += 1) v[i] -= d * u[i]; }
      const w = new Float64Array(n);
      for (let i = 0; i < n; i += 1) { let s = 0; const r = i * n; for (let j = 0; j < n; j += 1) s += B[r + j] * v[j]; w[i] = s; }
      let m = 0;
      for (let i = 0; i < n; i += 1) m += w[i] * w[i];
      m = Math.sqrt(m) || 1;
      lambda = m;
      for (let i = 0; i < n; i += 1) v[i] = w[i] / m;
    }
    vectors.push(v);
    values.push(lambda);
  }
  return Array.from({ length: n }, (_, i) => [vectors[0][i] * Math.sqrt(values[0]), vectors[1][i] * Math.sqrt(values[1]), vectors[2][i] * Math.sqrt(values[2])]);
}
