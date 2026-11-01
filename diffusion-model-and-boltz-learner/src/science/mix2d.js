// The exact denoiser of a set of real points in a flat plane, and everything that follows from it.
//   p(x; s) = (1/N) sum_i N(x; y_i, s^2 I)          the data blurred by noise of size s
//   D(x; s) = sum_i w_i y_i, w_i proportional to N(x; y_i, s^2 I)   Karras et al. 2022, Eq. 57
//   score(x; s) = (D(x; s) - x) / s^2               Eq. 3, which is Tweedie's formula
export class Mix2D {
  constructor(x, y) {
    this.x = x; this.y = y; this.n = x.length;
    let mx = 0, my = 0;
    for (let i = 0; i < this.n; i += 1) { mx += x[i]; my += y[i]; }
    this.mx = mx / this.n; this.my = my / this.n;
    let v = 0;
    for (let i = 0; i < this.n; i += 1) v += (x[i] - this.mx) ** 2 + (y[i] - this.my) ** 2;
    this.sdata = Math.sqrt(v / (2 * this.n));
  }

  // Exact. Every data point takes part. Writes the guess to out[0], out[1] and returns log p(x; s).
  denoise(px, py, s, out) {
    const { x, y, n } = this, q = 1 / (2 * s * s);
    let lo = Infinity;
    for (let i = 0; i < n; i += 1) { const dx = px - x[i], dy = py - y[i], d = dx * dx + dy * dy; if (d < lo) lo = d; }
    let w = 0, ax = 0, ay = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = px - x[i], dy = py - y[i], e = (dx * dx + dy * dy - lo) * q;
      if (e > 36) continue;
      const g = Math.exp(-e);
      w += g; ax += g * x[i]; ay += g * y[i];
    }
    out[0] = ax / w; out[1] = ay / w;
    return Math.log(w / n) - lo * q - Math.log(2 * Math.PI * s * s);
  }

  logp(px, py, s) { return this.denoise(px, py, s, Mix2D.tmp); }

  // The weight of each data point, for showing the posterior itself.
  weights(px, py, s, w) {
    const { x, y, n } = this, q = 1 / (2 * s * s);
    let lo = Infinity, sum = 0;
    for (let i = 0; i < n; i += 1) { const dx = px - x[i], dy = py - y[i], d = dx * dx + dy * dy; w[i] = d; if (d < lo) lo = d; }
    for (let i = 0; i < n; i += 1) { w[i] = Math.exp(-(w[i] - lo) * q); sum += w[i]; }
    for (let i = 0; i < n; i += 1) w[i] /= sum;
    return w;
  }

  // Neighbour grid, for exact sums at small noise where only nearby points matter.
  index(cell = 4) {
    const { x, y, n } = this;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i += 1) { x0 = Math.min(x0, x[i]); y0 = Math.min(y0, y[i]); x1 = Math.max(x1, x[i]); y1 = Math.max(y1, y[i]); }
    const nx = Math.floor((x1 - x0) / cell) + 1, ny = Math.floor((y1 - y0) / cell) + 1, head = new Int32Array(nx * ny + 1), key = new Int32Array(n);
    for (let i = 0; i < n; i += 1) { const k = Math.floor((x[i] - x0) / cell) + nx * Math.floor((y[i] - y0) / cell); key[i] = k; head[k + 1] += 1; }
    for (let k = 0; k < nx * ny; k += 1) head[k + 1] += head[k];
    const fill = head.slice(), order = new Int32Array(n);
    for (let i = 0; i < n; i += 1) { order[fill[key[i]]] = i; fill[key[i]] += 1; }
    this.grid = { cell, x0, y0, nx, ny, head, order };
    return this;
  }

  // The same sum as denoise(), but only over points within reach. Reach grows until a point is found.
  near(px, py, s, out) {
    const g = this.grid ?? this.index().grid, { x, y } = this, q = 1 / (2 * s * s);
    let r = Math.max(3.8 * s, g.cell);
    for (let tries = 0; tries < 9; tries += 1) {
      const ix0 = Math.max(0, Math.floor((px - r - g.x0) / g.cell)), ix1 = Math.min(g.nx - 1, Math.floor((px + r - g.x0) / g.cell));
      const iy0 = Math.max(0, Math.floor((py - r - g.y0) / g.cell)), iy1 = Math.min(g.ny - 1, Math.floor((py + r - g.y0) / g.cell));
      let lo = Infinity, found = false;
      for (let j = iy0; j <= iy1; j += 1) {
        for (let i = ix0; i <= ix1; i += 1) {
          const k = i + g.nx * j;
          for (let a = g.head[k]; a < g.head[k + 1]; a += 1) {
            const o = g.order[a], dx = px - x[o], dy = py - y[o], d = dx * dx + dy * dy;
            if (d < lo) lo = d;
            found = true;
          }
        }
      }
      if (found && Math.sqrt(lo) + 3.8 * s <= r * 1.001) {
        let w = 0, ax = 0, ay = 0;
        for (let j = iy0; j <= iy1; j += 1) {
          for (let i = ix0; i <= ix1; i += 1) {
            const k = i + g.nx * j;
            for (let a = g.head[k]; a < g.head[k + 1]; a += 1) {
              const o = g.order[a], dx = px - x[o], dy = py - y[o], e = (dx * dx + dy * dy - lo) * q;
              if (e > 36) continue;
              const h = Math.exp(-e);
              w += h; ax += h * x[o]; ay += h * y[o];
            }
          }
        }
        out[0] = ax / w; out[1] = ay / w;
        return;
      }
      r = found ? Math.sqrt(lo) + 3.9 * s : r * 2;
    }
    this.denoise(px, py, s, out);
  }
}
Mix2D.tmp = [0, 0];

// The same exact field stored on grids at many noise levels, so that tens of thousands of droplets can follow it every frame.
// Above the lowest level the sums use the data binned at a third of s, which does not change a Gaussian of width s by anything visible.
// Below it, near() does the exact sum over neighbours.
export class FieldTable {
  constructor(mix, { low = 6, high = 700, levels = 18, grid = 96 } = {}) {
    Object.assign(this, { mix, low, high, count: levels, grid, levels: [] });
    this.loLog = Math.log(low); this.dLog = Math.log(high / low) / (levels - 1);
  }

  // A generator, so that a phone can build it a slice at a time.
  * build() {
    const { mix, grid: g, count } = this, { x, y, n } = mix;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i += 1) { x0 = Math.min(x0, x[i]); y0 = Math.min(y0, y[i]); x1 = Math.max(x1, x[i]); y1 = Math.max(y1, y[i]); }
    for (let l = 0; l < count; l += 1) {
      const s = Math.exp(this.loLog + l * this.dLog), b = Math.max(1, s / 3);
      const nu = Math.ceil((x1 - x0) / b) + 1, nv = Math.ceil((y1 - y0) / b) + 1;
      const M = new Float64Array(nu * nv), Mx = new Float64Array(nu * nv), My = new Float64Array(nu * nv);
      for (let i = 0; i < n; i += 1) {
        const k = Math.round((x[i] - x0) / b) + nu * Math.round((y[i] - y0) / b);
        M[k] += 1; Mx[k] += x[i]; My[k] += y[i];
      }
      const ex = 4.6 * s, ax = x0 - ex, ay = y0 - ex, dx = (x1 - x0 + 2 * ex) / (g - 1), dy = (y1 - y0 + 2 * ex) / (g - 1), q = 1 / (2 * s * s);
      const Ku = new Float64Array(g * nu), Kv = new Float64Array(g * nv);
      for (let a = 0; a < g; a += 1) {
        for (let i = 0; i < nu; i += 1) { const d = ax + a * dx - (x0 + i * b); Ku[a * nu + i] = Math.exp(-d * d * q); }
        for (let j = 0; j < nv; j += 1) { const d = ay + a * dy - (y0 + j * b); Kv[a * nv + j] = Math.exp(-d * d * q); }
      }
      const T0 = new Float64Array(g * nv), T1 = new Float64Array(g * nv), T2 = new Float64Array(g * nv);
      for (let j = 0; j < nv; j += 1) {
        for (let a = 0; a < g; a += 1) {
          let t0 = 0, t1 = 0, t2 = 0;
          for (let i = 0; i < nu; i += 1) {
            const c = i + nu * j, m = M[c];
            if (m === 0) continue;
            const k = Ku[a * nu + i];
            t0 += k * m; t1 += k * Mx[c]; t2 += k * My[c];
          }
          T0[a * nv + j] = t0; T1[a * nv + j] = t1; T2[a * nv + j] = t2;
        }
      }
      const Dx = new Float32Array(g * g), Dy = new Float32Array(g * g);
      for (let c = 0; c < g; c += 1) {
        for (let a = 0; a < g; a += 1) {
          let w = 0, sx = 0, sy = 0;
          for (let j = 0; j < nv; j += 1) { const k = Kv[c * nv + j], o = a * nv + j; w += k * T0[o]; sx += k * T1[o]; sy += k * T2[o]; }
          if (w > 1e-280) { Dx[a + g * c] = sx / w; Dy[a + g * c] = sy / w; } else { Dx[a + g * c] = NaN; Dy[a + g * c] = NaN; }
        }
      }
      // Points so far out that every kernel underflowed: use the nearest neighbour.
      for (let c = 0; c < g; c += 1) {
        for (let a = 0; a < g; a += 1) {
          if (!Number.isNaN(Dx[a + g * c])) continue;
          const px = ax + a * dx, py = ay + c * dy;
          let lo = Infinity, o = 0;
          for (let i = 0; i < n; i += 1) { const d = (px - x[i]) ** 2 + (py - y[i]) ** 2; if (d < lo) { lo = d; o = i; } }
          Dx[a + g * c] = x[o]; Dy[a + g * c] = y[o];
        }
      }
      this.levels[l] = { s, ax, ay, dx, dy, Dx, Dy };
      yield (l + 1) / count;
    }
    return this;
  }

  ready() { const it = this.build(); while (!it.next().done); return this; }

  // Exact to within the grid. Bilinear in x and y, linear in log s.
  at(px, py, s, out) {
    if (s < this.low) { this.mix.near(px, py, s, out); return; }
    const t = (Math.log(s) - this.loLog) / this.dLog, n = this.count;
    if (t >= n - 1) { this.read(n - 1, px, py, out); return; }
    const l = Math.floor(t), f = t - l;
    this.read(l, px, py, out);
    const a = out[0], b = out[1];
    this.read(l + 1, px, py, out);
    out[0] = a + f * (out[0] - a); out[1] = b + f * (out[1] - b);
  }

  // Below the lowest level, stay on the lowest grid. Used for droplets that are shown but not measured, so that a phone keeps its frame rate.
  fast(px, py, s, out) { if (s < this.low) this.read(0, px, py, out); else this.at(px, py, s, out); }

  read(l, px, py, out) {
    const L = this.levels[l], g = this.grid;
    let u = (px - L.ax) / L.dx, v = (py - L.ay) / L.dy;
    u = u < 0 ? 0 : u > g - 1.0001 ? g - 1.0001 : u;
    v = v < 0 ? 0 : v > g - 1.0001 ? g - 1.0001 : v;
    const i = u | 0, j = v | 0, fu = u - i, fv = v - j, o = i + g * j;
    const { Dx, Dy } = L;
    const a = Dx[o] + fu * (Dx[o + 1] - Dx[o]), b = Dx[o + g] + fu * (Dx[o + g + 1] - Dx[o + g]);
    const c = Dy[o] + fu * (Dy[o + 1] - Dy[o]), d = Dy[o + g] + fu * (Dy[o + g + 1] - Dy[o + g]);
    out[0] = a + fv * (b - a); out[1] = c + fv * (d - c);
  }
}
