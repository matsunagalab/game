// A spherical drop of Stockmayer dipoles (soft spheres with a point dipole) around one or two fixed ions.
// Reduced units: diameter 1, kT = T, energy of two unit charges at distance 1 is 1. Monte Carlo, all pairs.
import { makeRandom } from './mbwater.js';

export class DipoleDrop {
  constructor({ n = 160, rho = 0.72, mu = 1.7, T = 1, seed = 2 } = {}) {
    this.n = n;
    this.mu = mu;
    this.T = T;
    this.R = ((3 * n) / (4 * Math.PI * rho)) ** (1 / 3) + 0.5;
    this.rand = makeRandom(seed);
    const N3 = n * 3;
    this.p = new Float64Array(N3); // Positions.
    this.m = new Float64Array(N3); // Unit dipoles.
    this.ions = []; // { x, y, z, q }
    this.step = 0.2;
    this.turn = 0.5;
    this.fill();
  }

  fill() {
    const { n, p, m, R, rand } = this;
    let i = 0;
    let tries = 0;
    while (i < n && tries < 1e6) {
      tries++;
      const x = (rand() * 2 - 1) * R, y = (rand() * 2 - 1) * R, z = (rand() * 2 - 1) * R;
      if (x * x + y * y + z * z > (R - 0.5) ** 2) continue;
      let ok = true;
      for (let j = 0; j < i; j++) {
        const dx = x - p[j * 3], dy = y - p[j * 3 + 1], dz = z - p[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < 0.5) { ok = false; break; }
      }
      if (!ok) continue;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      const c = rand() * 2 - 1, f = rand() * 2 * Math.PI, s = Math.sqrt(1 - c * c);
      m[i * 3] = s * Math.cos(f); m[i * 3 + 1] = s * Math.sin(f); m[i * 3 + 2] = c;
      i++;
    }
  }

  // Energy of a dipole at (x,y,z) with direction (a,b,c), with all except dipole i.
  energyAt(i, x, y, z, a, b, c) {
    const { n, p, m, mu, ions, R } = this;
    if (x * x + y * y + z * z > R * R) return Infinity;
    const mu2 = mu * mu;
    let e = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const J = j * 3;
      const dx = p[J] - x, dy = p[J + 1] - y, dz = p[J + 2] - z;
      const r2 = dx * dx + dy * dy + dz * dz;
      const ir2 = 1 / r2;
      if (r2 < 1.2599) { const s = ir2 * ir2 * ir2; e += 4 * (s * s - s) + 1; } // Soft core, WCA.
      const ir = Math.sqrt(ir2);
      const ir3 = ir * ir2;
      const ax = m[J], ay = m[J + 1], az = m[J + 2];
      const dot = a * ax + b * ay + c * az;
      const di = a * dx + b * dy + c * dz;
      const dj = ax * dx + ay * dy + az * dz;
      e += mu2 * ir3 * (dot - 3 * di * dj * ir2);
    }
    for (const k of ions) {
      const dx = x - k.x, dy = y - k.y, dz = z - k.z;
      const r2 = dx * dx + dy * dy + dz * dz;
      const ir2 = 1 / r2;
      if (r2 < 1.2599) { const s = ir2 * ir2 * ir2; e += 4 * (s * s - s) + 1; }
      // Energy -m.E, with E = q r / r^3.
      e -= k.q * mu * (a * dx + b * dy + c * dz) * ir2 * Math.sqrt(ir2);
    }
    return e;
  }

  moveOne(i) {
    const { p, m, rand, T, step, turn } = this;
    const I = i * 3;
    const e0 = this.energyAt(i, p[I], p[I + 1], p[I + 2], m[I], m[I + 1], m[I + 2]);
    const nx = p[I] + (rand() - 0.5) * 2 * step;
    const ny = p[I + 1] + (rand() - 0.5) * 2 * step;
    const nz = p[I + 2] + (rand() - 0.5) * 2 * step;
    let a = m[I] + (rand() - 0.5) * 2 * turn;
    let b = m[I + 1] + (rand() - 0.5) * 2 * turn;
    let c = m[I + 2] + (rand() - 0.5) * 2 * turn;
    const l = 1 / Math.sqrt(a * a + b * b + c * c);
    a *= l; b *= l; c *= l;
    const e1 = this.energyAt(i, nx, ny, nz, a, b, c);
    const d = e1 - e0;
    if (d <= 0 || rand() < Math.exp(-d / T)) {
      p[I] = nx; p[I + 1] = ny; p[I + 2] = nz;
      m[I] = a; m[I + 1] = b; m[I + 2] = c;
      return true;
    }
    return false;
  }

  sweep(count = 1) {
    const { n, rand } = this;
    for (let c = 0; c < count; c++) for (let k = 0; k < n; k++) this.moveOne(Math.floor(rand() * n));
  }

  // Sum of mu cos(theta) over a shell one solvent layer thick, divided by its width.
  // If the charge seen at radius r is Q(r), Gauss gives P(r) = (q - Q) / (4 pi r^2), and summing P over
  // the shell volume leaves exactly this number: q - Q. Thin shells would only measure the layering.
  bound(r0, r1) {
    const { n, p, m, mu } = this;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const I = i * 3;
      const r = Math.hypot(p[I], p[I + 1], p[I + 2]);
      if (r < r0 || r >= r1) continue;
      s += (mu * (m[I] * p[I] + m[I + 1] * p[I + 1] + m[I + 2] * p[I + 2])) / r;
    }
    return s / (r1 - r0);
  }

  // Force on ion k along +x from every dipole, using E of a point dipole at the ion.
  forceOn(k) {
    const { n, p, m, mu } = this;
    const ion = this.ions[k];
    let fx = 0;
    for (let i = 0; i < n; i++) {
      const I = i * 3;
      const dx = ion.x - p[I], dy = ion.y - p[I + 1], dz = ion.z - p[I + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      const ir2 = 1 / r2;
      const ir = Math.sqrt(ir2);
      const ir3 = ir * ir2;
      const mr = m[I] * dx + m[I + 1] * dy + m[I + 2] * dz;
      fx += ion.q * mu * ir3 * (3 * mr * dx * ir2 - m[I]);
      if (r2 < 1.2599) { const s = ir2 * ir2 * ir2; fx += 24 * (2 * s * s - s) * ir2 * dx; }
    }
    return fx;
  }
}
