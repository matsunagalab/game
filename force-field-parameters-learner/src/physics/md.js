// Small molecular dynamics engine. Units: Å, fs, amu, kcal/mol, e.
// Energy forms follow AMBER: k(r-r0)², k(θ-θ0)², k[1+cos(nφ-γ)], 4ε[(σ/r)¹²-(σ/r)⁶], Cqq/r.

export const ACC = 4.184e-4;      // (kcal/mol/Å)/amu → Å/fs²
export const COUL = 332.0637;     // kcal·Å/mol/e²
export const KB = 0.0019872041;   // kcal/mol/K
export const RAD_FS_TO_CM = 5308.8; // ω in rad/fs → wavenumber in cm⁻¹
export const DEG = Math.PI / 180;

let spare = null;
export function gauss() {
  if (spare !== null) { const s = spare; spare = null; return s; }
  let u, v, r;
  do { u = 2 * Math.random() - 1; v = 2 * Math.random() - 1; r = u * u + v * v; } while (r >= 1 || r === 0);
  const m = Math.sqrt(-2 * Math.log(r) / r);
  spare = v * m;
  return u * m;
}

export function dihedral(x, a, b, c, d) {
  const ia = 3 * a, ib = 3 * b, ic = 3 * c, id = 3 * d;
  const b1x = x[ib] - x[ia], b1y = x[ib + 1] - x[ia + 1], b1z = x[ib + 2] - x[ia + 2];
  const b2x = x[ic] - x[ib], b2y = x[ic + 1] - x[ib + 1], b2z = x[ic + 2] - x[ib + 2];
  const b3x = x[id] - x[ic], b3y = x[id + 1] - x[ic + 1], b3z = x[id + 2] - x[ic + 2];
  const n1x = b1y * b2z - b1z * b2y, n1y = b1z * b2x - b1x * b2z, n1z = b1x * b2y - b1y * b2x;
  const n2x = b2y * b3z - b2z * b3y, n2y = b2z * b3x - b2x * b3z, n2z = b2x * b3y - b2y * b3x;
  const b2n = Math.sqrt(b2x * b2x + b2y * b2y + b2z * b2z);
  const y = b2n * (b1x * n2x + b1y * n2y + b1z * n2z);
  const c0 = n1x * n2x + n1y * n2y + n1z * n2z;
  return Math.atan2(y, c0);
}

export class MDSystem {
  constructor({ masses, charges = null, sigmas = null, epsilons = null, bonds = [], angles = [], dihedrals = [],
    impropers = [], exclusions = null, scale14 = null, dielectric = 1, rama = null }) {
    const N = masses.length;
    this.N = N;
    this.m = Float64Array.from(masses);
    this.x = new Float64Array(3 * N);
    this.v = new Float64Array(3 * N);
    this.f = new Float64Array(3 * N);
    this.bonds = bonds;
    this.angles = angles;
    this.dihedrals = dihedrals;
    this.impropers = impropers;
    this.rama = rama;              // { residues: [[c,n,ca,cp,np],…], gradient(φ,ψ) → sets .dphi .dpsi, returns U }
    this.constraints = [];         // [i, j, d] solved with SHAKE when non-empty
    this.frozen = null;
    this.E = { bond: 0, angle: 0, dihedral: 0, lj: 0, coulomb: 0, rama: 0, pot: 0 };
    this.charges = charges ? Float64Array.from(charges) : new Float64Array(N);
    this.sigmas = sigmas ? Float64Array.from(sigmas) : null;
    this.epsilons = epsilons ? Float64Array.from(epsilons) : null;
    this.exclusions = exclusions;
    this.scale14 = scale14;
    this.dielectric = dielectric;
    this.chargeScale = 1;
    this.sigmaScale = 1;
    this.epsScale = 1;
    this.buildPairs();
    this.forces();
  }

  // Pair table, rebuilt whenever a non-bonded parameter changes.
  buildPairs() {
    const { N, sigmas, epsilons, charges, exclusions, scale14 } = this;
    const pi = [], pj = [], pA = [], pB = [], pC = [];
    if (sigmas) {
      const C = COUL / this.dielectric * this.chargeScale * this.chargeScale;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        let lj = 1, el = 1;
        if (exclusions) {
          const t = exclusions[i]?.get(j);
          if (t === 0) continue;
          if (t === 14) { lj = scale14.lj; el = scale14.el; }
        }
        const s = 0.5 * (sigmas[i] + sigmas[j]) * this.sigmaScale;
        const e = Math.sqrt(epsilons[i] * epsilons[j]) * this.epsScale;
        const s6 = s * s * s * s * s * s;
        const b = 4 * e * s6 * lj, a = b * s6;
        const c = C * charges[i] * charges[j] * el;
        if (a === 0 && c === 0) continue;
        pi.push(i); pj.push(j); pA.push(a); pB.push(b); pC.push(c);
      }
    }
    this.pi = Int32Array.from(pi); this.pj = Int32Array.from(pj);
    this.pA = Float64Array.from(pA); this.pB = Float64Array.from(pB); this.pC = Float64Array.from(pC);
  }

  applyDihedralForce(i, j, k, l, dE) {
    const { x, f } = this;
    const ii = 3 * i, jj = 3 * j, kk = 3 * k, ll = 3 * l;
    const Fx = x[ii] - x[jj], Fy = x[ii + 1] - x[jj + 1], Fz = x[ii + 2] - x[jj + 2];
    const Gx = x[jj] - x[kk], Gy = x[jj + 1] - x[kk + 1], Gz = x[jj + 2] - x[kk + 2];
    const Hx = x[ll] - x[kk], Hy = x[ll + 1] - x[kk + 1], Hz = x[ll + 2] - x[kk + 2];
    const Ax = Fy * Gz - Fz * Gy, Ay = Fz * Gx - Fx * Gz, Az = Fx * Gy - Fy * Gx;
    const Bx = Hy * Gz - Hz * Gy, By = Hz * Gx - Hx * Gz, Bz = Hx * Gy - Hy * Gx;
    const A2 = Ax * Ax + Ay * Ay + Az * Az + 1e-12, B2 = Bx * Bx + By * By + Bz * Bz + 1e-12;
    const G = Math.sqrt(Gx * Gx + Gy * Gy + Gz * Gz);
    const FG = Fx * Gx + Fy * Gy + Fz * Gz, HG = Hx * Gx + Hy * Gy + Hz * Gz;
    const ca = -dE * (-G / A2), cb = -dE * (G / B2);
    const fix = ca * Ax, fiy = ca * Ay, fiz = ca * Az;
    const flx = cb * Bx, fly = cb * By, flz = cb * Bz;
    const c1 = -dE * (FG / (A2 * G)), c2 = -dE * (HG / (B2 * G));
    const sx = c1 * Ax - c2 * Bx, sy = c1 * Ay - c2 * By, sz = c1 * Az - c2 * Bz;
    f[ii] += fix; f[ii + 1] += fiy; f[ii + 2] += fiz;
    f[ll] += flx; f[ll + 1] += fly; f[ll + 2] += flz;
    f[jj] += -fix + sx; f[jj + 1] += -fiy + sy; f[jj + 2] += -fiz + sz;
    f[kk] += -flx - sx; f[kk + 1] += -fly - sy; f[kk + 2] += -flz - sz;
  }

  forces() {
    const { x, f, E } = this;
    f.fill(0);
    let eb = 0, ea = 0, ed = 0, elj = 0, ec = 0, er = 0;

    for (const b of this.bonds) {
      const i = 3 * b[0], j = 3 * b[1];
      const dx = x[i] - x[j], dy = x[i + 1] - x[j + 1], dz = x[i + 2] - x[j + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const dr = r - b[3];
      eb += b[2] * dr * dr;
      const g = -2 * b[2] * dr / r;
      f[i] += g * dx; f[i + 1] += g * dy; f[i + 2] += g * dz;
      f[j] -= g * dx; f[j + 1] -= g * dy; f[j + 2] -= g * dz;
    }

    for (const a of this.angles) {
      const i = 3 * a[0], j = 3 * a[1], k = 3 * a[2];
      const ux = x[i] - x[j], uy = x[i + 1] - x[j + 1], uz = x[i + 2] - x[j + 2];
      const vx = x[k] - x[j], vy = x[k + 1] - x[j + 1], vz = x[k + 2] - x[j + 2];
      const ru = Math.sqrt(ux * ux + uy * uy + uz * uz), rv = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const cu = 1 / ru, cv = 1 / rv;
      let c = (ux * vx + uy * vy + uz * vz) * cu * cv;
      c = c > 0.999999 ? 0.999999 : c < -0.999999 ? -0.999999 : c;
      const th = Math.acos(c), s = Math.sqrt(1 - c * c);
      const dth = th - a[4];
      ea += a[3] * dth * dth;
      const g = 2 * a[3] * dth / s;
      const fix = g * cu * (vx * cv - c * ux * cu), fiy = g * cu * (vy * cv - c * uy * cu), fiz = g * cu * (vz * cv - c * uz * cu);
      const fkx = g * cv * (ux * cu - c * vx * cv), fky = g * cv * (uy * cu - c * vy * cv), fkz = g * cv * (uz * cu - c * vz * cv);
      f[i] += fix; f[i + 1] += fiy; f[i + 2] += fiz;
      f[k] += fkx; f[k + 1] += fky; f[k + 2] += fkz;
      f[j] -= fix + fkx; f[j + 1] -= fiy + fky; f[j + 2] -= fiz + fkz;
    }

    for (const d of this.dihedrals) {
      const phi = dihedral(x, d[0], d[1], d[2], d[3]);
      const a = d[5] * phi - d[6];
      ed += d[4] * (1 + Math.cos(a));
      this.applyDihedralForce(d[0], d[1], d[2], d[3], -d[4] * d[5] * Math.sin(a));
    }

    for (const d of this.impropers) {   // harmonic: k(ξ-ξ0)²
      const phi = dihedral(x, d[0], d[1], d[2], d[3]);
      let dp = phi - d[5];
      if (dp > Math.PI) dp -= 2 * Math.PI; else if (dp < -Math.PI) dp += 2 * Math.PI;
      ed += d[4] * dp * dp;
      this.applyDihedralForce(d[0], d[1], d[2], d[3], 2 * d[4] * dp);
    }

    if (this.rama) {
      const R = this.rama;
      for (const r of R.residues) {
        const phi = dihedral(x, r[0], r[1], r[2], r[3]);
        const psi = dihedral(x, r[1], r[2], r[3], r[4]);
        er += R.gradient(phi, psi);
        this.applyDihedralForce(r[0], r[1], r[2], r[3], R.dphi);
        this.applyDihedralForce(r[1], r[2], r[3], r[4], R.dpsi);
      }
    }

    const { pi, pj, pA, pB, pC } = this;
    for (let p = 0, n = pi.length; p < n; p++) {
      const i = 3 * pi[p], j = 3 * pj[p];
      const dx = x[i] - x[j], dy = x[i + 1] - x[j + 1], dz = x[i + 2] - x[j + 2];
      const r2i = 1 / (dx * dx + dy * dy + dz * dz);
      const r6i = r2i * r2i * r2i;
      const a = pA[p] * r6i * r6i, b = pB[p] * r6i;
      const c = pC[p] * Math.sqrt(r2i);
      elj += a - b; ec += c;
      const g = (12 * a - 6 * b + c) * r2i;
      f[i] += g * dx; f[i + 1] += g * dy; f[i + 2] += g * dz;
      f[j] -= g * dx; f[j + 1] -= g * dy; f[j + 2] -= g * dz;
    }

    E.bond = eb; E.angle = ea; E.dihedral = ed; E.lj = elj; E.coulomb = ec; E.rama = er;
    E.pot = eb + ea + ed + elj + ec + er;
    return E.pot;
  }

  shake(prev) {
    const { x, m, constraints } = this;
    for (let it = 0; it < 80; it++) {
      let done = true;
      for (const c of constraints) {
        const i = 3 * c[0], j = 3 * c[1];
        const dx = x[i] - x[j], dy = x[i + 1] - x[j + 1], dz = x[i + 2] - x[j + 2];
        const diff = dx * dx + dy * dy + dz * dz - c[2] * c[2];
        if (Math.abs(diff) < 1e-6) continue;
        done = false;
        const px = prev[i] - prev[j], py = prev[i + 1] - prev[j + 1], pz = prev[i + 2] - prev[j + 2];
        const mi = 1 / m[c[0]], mj = 1 / m[c[1]];
        const g = diff / (2 * (mi + mj) * (dx * px + dy * py + dz * pz));
        x[i] -= g * mi * px; x[i + 1] -= g * mi * py; x[i + 2] -= g * mi * pz;
        x[j] += g * mj * px; x[j + 1] += g * mj * py; x[j + 2] += g * mj * pz;
      }
      if (done) return true;
    }
    return false;
  }

  // Velocity Verlet with no thermostat. SHAKE when constraints are set.
  stepNVE(dt) {
    const { N, x, v, f, m } = this;
    const hasC = this.constraints.length > 0;
    if (hasC) { this.prev ??= new Float64Array(3 * N); this.prev.set(x); }
    for (let i = 0; i < N; i++) {
      const c = 0.5 * dt * ACC / m[i];
      for (let d = 0; d < 3; d++) {
        const q = 3 * i + d;
        v[q] += c * f[q];
        x[q] += dt * v[q];
      }
    }
    if (hasC) {
      if (!this.shake(this.prev)) return false;
      for (let q = 0; q < 3 * N; q++) v[q] = (x[q] - this.prev[q]) / dt;
    }
    this.forces();
    for (let i = 0; i < N; i++) {
      const c = 0.5 * dt * ACC / m[i];
      for (let d = 0; d < 3; d++) { const q = 3 * i + d; v[q] += c * f[q]; }
    }
    if (hasC) this.rattleVelocities();
    return true;
  }

  rattleVelocities() {
    const { x, v, m, constraints } = this;
    for (let it = 0; it < 40; it++) {
      for (const c of constraints) {
        const i = 3 * c[0], j = 3 * c[1];
        const dx = x[i] - x[j], dy = x[i + 1] - x[j + 1], dz = x[i + 2] - x[j + 2];
        const dvx = v[i] - v[j], dvy = v[i + 1] - v[j + 1], dvz = v[i + 2] - v[j + 2];
        const mi = 1 / m[c[0]], mj = 1 / m[c[1]];
        const g = (dx * dvx + dy * dvy + dz * dvz) / ((mi + mj) * c[2] * c[2]);
        v[i] -= g * mi * dx; v[i + 1] -= g * mi * dy; v[i + 2] -= g * mi * dz;
        v[j] += g * mj * dx; v[j + 1] += g * mj * dy; v[j + 2] += g * mj * dz;
      }
    }
  }

  // BAOAB Langevin integrator.
  stepLangevin(dt, T, gamma) {
    const { N, x, v, f, m } = this;
    const c1 = Math.exp(-gamma * dt), c2 = Math.sqrt(1 - c1 * c1);
    const kT = KB * T * ACC;
    for (let i = 0; i < N; i++) {
      const a = 0.5 * dt * ACC / m[i], s = c2 * Math.sqrt(kT / m[i]);
      for (let d = 0; d < 3; d++) {
        const q = 3 * i + d;
        v[q] += a * f[q];
        x[q] += 0.5 * dt * v[q];
        v[q] = c1 * v[q] + s * gauss();
        x[q] += 0.5 * dt * v[q];
      }
    }
    this.forces();
    for (let i = 0; i < N; i++) {
      const a = 0.5 * dt * ACC / m[i];
      for (let d = 0; d < 3; d++) { const q = 3 * i + d; v[q] += a * f[q]; }
    }
  }

  setTemperature(T) {
    const { N, v, m } = this;
    const kT = KB * T * ACC;
    for (let i = 0; i < N; i++) {
      const s = Math.sqrt(kT / m[i]);
      for (let d = 0; d < 3; d++) v[3 * i + d] = s * gauss();
    }
  }

  kinetic() {
    const { N, v, m } = this;
    let k = 0;
    for (let i = 0; i < N; i++) {
      const a = 3 * i;
      k += m[i] * (v[a] * v[a] + v[a + 1] * v[a + 1] + v[a + 2] * v[a + 2]);
    }
    return 0.5 * k / ACC;
  }

  minimize(steps = 200, step = 0.002) {
    const { x, f, N } = this;
    this.forces();
    for (let s = 0; s < steps; s++) {
      let max = 0;
      for (let q = 0; q < 3 * N; q++) max = Math.max(max, Math.abs(f[q]));
      const a = Math.min(step, 0.05 / (max + 1e-9));
      for (let q = 0; q < 3 * N; q++) x[q] += a * f[q];
      this.forces();
    }
  }
}

// Exclusion map from the bond graph: 1-2 and 1-3 pairs excluded (0), 1-4 pairs tagged (14).
export function buildExclusions(N, bonds) {
  const adj = Array.from({ length: N }, () => []);
  for (const b of bonds) { adj[b[0]].push(b[1]); adj[b[1]].push(b[0]); }
  const ex = Array.from({ length: N }, () => new Map());
  for (let i = 0; i < N; i++) {
    for (const j of adj[i]) {
      ex[i].set(j, 0);
      for (const k of adj[j]) {
        if (k === i) continue;
        ex[i].set(k, 0);
        for (const l of adj[k]) {
          if (l !== j && l !== i && !ex[i].has(l)) ex[i].set(l, 14);
        }
      }
    }
  }
  return ex;
}

// Mass-weighted Hessian from finite differences of the forces, diagonalised with Jacobi rotations.
export function normalModes(sys) {
  const n = 3 * sys.N;
  const H = Array.from({ length: n }, () => new Float64Array(n));
  const h = 1e-4;
  const saved = Float64Array.from(sys.x);
  for (let q = 0; q < n; q++) {
    sys.x[q] = saved[q] + h; sys.forces(); const fp = Float64Array.from(sys.f);
    sys.x[q] = saved[q] - h; sys.forces(); const fm = Float64Array.from(sys.f);
    sys.x[q] = saved[q];
    const mq = sys.m[q / 3 | 0];
    for (let r = 0; r < n; r++) H[r][q] = -(fp[r] - fm[r]) / (2 * h) / Math.sqrt(mq * sys.m[r / 3 | 0]);
  }
  sys.forces();
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) H[i][j] = H[j][i] = 0.5 * (H[i][j] + H[j][i]);
  const { values, vectors } = jacobi(H);
  const modes = [];
  for (let i = 0; i < n; i++) {
    const w2 = values[i] * ACC;
    const cm = w2 > 0 ? Math.sqrt(w2) * RAD_FS_TO_CM : 0;
    const vec = new Float64Array(n);
    for (let q = 0; q < n; q++) vec[q] = vectors[q][i] / Math.sqrt(sys.m[q / 3 | 0]);
    modes.push({ cm, vec });
  }
  modes.sort((a, b) => a.cm - b.cm);
  return modes;
}

function jacobi(A) {
  const n = A.length;
  const V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-14) continue;
      const th = 0.5 * (A[q][q] - A[p][p]) / A[p][q];
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const a = A[k][p], b = A[k][q];
        A[k][p] = c * a - s * b; A[k][q] = s * a + c * b;
      }
      for (let k = 0; k < n; k++) {
        const a = A[p][k], b = A[q][k];
        A[p][k] = c * a - s * b; A[q][k] = s * a + c * b;
      }
      for (let k = 0; k < n; k++) {
        const a = V[k][p], b = V[k][q];
        V[k][p] = c * a - s * b; V[k][q] = s * a + c * b;
      }
    }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}
