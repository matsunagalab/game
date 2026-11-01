// A molecule in ink: droplets along real bonds, placed from real coordinates, turning slowly.
import { Cloud, mixPigment, PIGMENT } from './world.js';
import { makeRng } from './science/rng.js';
import { axisRotation, compose } from './science/kabsch.js';

export function chainInk(t) { // 0 at the N terminus, 1 at the C terminus
  const clamp = (v) => Math.max(0, Math.min(1, v)), a = clamp((0.42 - t) / 0.22), c = clamp((t - 0.58) / 0.22);
  return mixPigment([a, 1 - a - c, c]);
}

// Bonds from distances in one real model.
export function bondsOf(m, n, limit = 1.95) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < Math.min(n, i + 14); j += 1) {
      if (Math.hypot(m[3 * i] - m[3 * j], m[3 * i + 1] - m[3 * j + 1], m[3 * i + 2] - m[3 * j + 2]) < limit) out.push([i, j]);
    }
  }
  return out;
}
export const chainBonds = (n) => Array.from({ length: n - 1 }, (_, i) => [i, i + 1]);

export class MolInk {
  // bonds: pairs of atom indices. inkOf(a): pigment for atom a. weight(b): how many droplets a bond takes, relative.
  constructor(run, { n, bonds, inkOf, drops = 12000, seed = 3, weight = null, thick = 0.42, mass = 1 }) {
    Object.assign(this, { run, world: run.world, n, drops, thick, massK: mass });
    const rng = makeRng(seed), pick = [];
    bonds.forEach((b, i) => { const k = weight ? weight(b) : 1; for (let q = 0; q < k; q += 1) pick.push(i); });
    this.A = new Uint16Array(drops); this.B = new Uint16Array(drops); this.T = new Float32Array(drops); this.J = new Float32Array(drops * 3); this.ink = new Float32Array(drops * 3); this.m = new Float32Array(drops);
    for (let k = 0; k < drops; k += 1) {
      const b = bonds[pick[rng.int(pick.length)]];
      this.A[k] = b[0]; this.B[k] = b[1]; this.T[k] = rng.u();
      this.J[3 * k] = rng.n(); this.J[3 * k + 1] = rng.n(); this.J[3 * k + 2] = rng.n();
      const c = inkOf(b[0]);
      this.ink[3 * k] = c[0]; this.ink[3 * k + 1] = c[1]; this.ink[3 * k + 2] = c[2];
      this.m[k] = 0.5 + 0.5 * rng.u();
    }
    this.cloud = run.own(new Cloud(this.world, drops));
    this.R = axisRotation(1, 0.2, 0, 0.3);
    this.tmp = [0, 0, 0];
    this.ox = 0; this.oy = 0;
  }

  // Turn the view by a drag, in radians.
  turn(dx, dy) { this.R = compose(compose(axisRotation(0, 1, 0, dx), axisRotation(1, 0, 0, dy)), this.R); }

  draw(x, sigma = 0, { mass = 1, time = 0, curl = true } = {}) {
    const { A, B, T, J, ink, m, drops, cloud, R, tmp, thick, ox, oy } = this, wob = Math.min(1, sigma / 6);
    const size = thick + 0.3 * sigma, big = 1 + sigma / 9, M = (mass * this.massK * 2 * 0.042 * big * (26000 / drops) * 0.4) / (size * size), jit = 0.05 + 0.34 * sigma;
    const { pos, ink: I, size: S } = cloud;
    for (let k = 0; k < drops; k += 1) {
      const a = 3 * A[k], b = 3 * B[k], t = T[k];
      const px = x[a] + t * (x[b] - x[a]) + J[3 * k] * jit, py = x[a + 1] + t * (x[b + 1] - x[a + 1]) + J[3 * k + 1] * jit, pz = x[a + 2] + t * (x[b + 2] - x[a + 2]) + J[3 * k + 2] * jit;
      const rx = R[0] * px + R[1] * py + R[2] * pz, ry = R[3] * px + R[4] * py + R[5] * pz, rz = R[6] * px + R[7] * py + R[8] * pz;
      let u = 0, v = 0;
      if (curl && sigma > 0.5) { const w = 0.15 * wob * wob * sigma; u = Math.sin(0.05 * ry + 0.21 * time + J[3 * k + 2]) * w; v = Math.sin(0.05 * rx - 0.17 * time) * w; }
      const near = 1 + 0.7 * Math.max(-1, Math.min(1, rz / 16)) * (1 - wob);
      pos[3 * k] = rx + u + ox; pos[3 * k + 1] = ry + v + oy; pos[3 * k + 2] = rz;
      I[4 * k] = ink[3 * k]; I[4 * k + 1] = ink[3 * k + 1]; I[4 * k + 2] = ink[3 * k + 2]; I[4 * k + 3] = m[k] * M * near;
      S[k] = size;
    }
    cloud.commit(drops);
    void tmp;
  }
}

// Several copies of one molecule at once, each with its own coordinates, in one cloud of ink. A droplet belongs to a copy and to a bond.
export class Bundle {
  constructor(run, { n, bonds, K = 1, drops = 12000, seed = 5, weight = null, thick = 0.42, mass = 1 }) {
    Object.assign(this, { run, world: run.world, n, K, drops, thick, massK: mass, bonds });
    const rng = makeRng(seed), pick = [];
    bonds.forEach((b, i) => { const k = weight ? weight(b) : 1; for (let q = 0; q < k; q += 1) pick.push(i); });
    this.A = new Uint16Array(drops); this.B = new Uint16Array(drops); this.C = new Uint16Array(drops); this.L = new Uint16Array(drops); this.T = new Float32Array(drops); this.J = new Float32Array(drops * 3); this.m = new Float32Array(drops);
    for (let k = 0; k < drops; k += 1) {
      const l = pick[rng.int(pick.length)], b = bonds[l];
      this.A[k] = b[0]; this.B[k] = b[1]; this.L[k] = l; this.C[k] = k % K; this.T[k] = rng.u();
      this.J[3 * k] = rng.n(); this.J[3 * k + 1] = rng.n(); this.J[3 * k + 2] = rng.n();
      this.m[k] = 0.5 + 0.5 * rng.u();
    }
    this.cloud = run.own(new Cloud(this.world, drops));
    this.R = axisRotation(1, 0.2, 0, 0.3);
    this.over = PIGMENT.rose;
  }

  turn(dx, dy) { this.R = compose(compose(axisRotation(0, 1, 0, dx), axisRotation(1, 0, 0, dy)), this.R); }

  hide() { this.cloud.commit(0); }

  // X holds K copies of n atoms. atomInk gives a pigment per atom, or chainInk one per copy. strain, per bond from 0 to 1, pulls the ink toward red.
  // origin is the point of the molecule to keep at the centre. Copies from count onward are left out.
  draw(X, { atomInk = null, chainInk = null, strain = null, sigma = 0, count = this.K, origin = [0, 0, 0], mass = 1, stride = 3 * this.n, chainMass = null } = {}) {
    const { A, B, C, L, T, J, m, drops, cloud, R, thick, over } = this, wob = Math.min(1, sigma / 6);
    const size = thick + 0.3 * sigma, big = 1 + sigma / 9, Mk = (mass * this.massK * 2 * 0.042 * big * (26000 / drops) * 0.4) / (size * size), jit = 0.03 + 0.34 * sigma;
    const { pos, ink: I, size: S } = cloud, [ox, oy, oz] = origin;
    for (let k = 0; k < drops; k += 1) {
      const c = C[k];
      if (c >= count) { I[4 * k + 3] = 0; S[k] = 0; pos[3 * k] = 0; pos[3 * k + 1] = 0; pos[3 * k + 2] = 0; continue; }
      const b0 = c * stride, a = b0 + 3 * A[k], b = b0 + 3 * B[k], t = T[k];
      const px = X[a] + t * (X[b] - X[a]) + J[3 * k] * jit - ox, py = X[a + 1] + t * (X[b + 1] - X[a + 1]) + J[3 * k + 1] * jit - oy, pz = X[a + 2] + t * (X[b + 2] - X[a + 2]) + J[3 * k + 2] * jit - oz;
      const rz = R[6] * px + R[7] * py + R[8] * pz;
      pos[3 * k] = R[0] * px + R[1] * py + R[2] * pz; pos[3 * k + 1] = R[3] * px + R[4] * py + R[5] * pz; pos[3 * k + 2] = rz;
      const f = strain ? strain[L[k]] : 0, u = atomInk ? 3 * A[k] : 3 * c, src = atomInk ?? chainInk, near = 1 + 0.7 * Math.max(-1, Math.min(1, rz / 16)) * (1 - wob);
      I[4 * k] = src[u] + f * (over[0] - src[u]); I[4 * k + 1] = src[u + 1] + f * (over[1] - src[u + 1]); I[4 * k + 2] = src[u + 2] + f * (over[2] - src[u + 2]);
      I[4 * k + 3] = m[k] * Mk * near * (chainMass ? chainMass[c] : 1);
      S[k] = size;
    }
    cloud.commit(drops);
  }
}

// Fit a box in Angstrom into the stage.
export function fitMol(run, span = 44) {
  const fit = () => { const s = run.world.stage; run.world.look(0, 0, Math.min(s.w, s.h) / span, 0.3); };
  fit(); run.onLayout = fit;
}

// Drag on the water turns the molecule.
export function dragTurn(run, onTurn) {
  let a = null;
  run.pointer({ down: (x, y) => { a = [x, y]; }, move: (x, y) => { if (a) { onTurn((x - a[0]) * 0.008, (y - a[1]) * 0.008); a = [x, y]; } }, up: () => { a = null; } });
}
