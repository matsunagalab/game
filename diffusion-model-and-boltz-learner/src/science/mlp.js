// A small neural network written out by hand: dense layers with a smooth activation, backpropagation and Adam.
// Nothing here is special to diffusion. dim layers = [in, h, h, ..., out].
export class MLP {
  constructor(layers, rng) {
    this.layers = layers;
    this.P = []; // parameters as flat arrays: W (rows = out, cols = in), then b
    this.count = 0;
    for (let l = 0; l + 1 < layers.length; l += 1) {
      const a = layers[l], b = layers[l + 1], W = new Float64Array(a * b), B = new Float64Array(b), k = Math.sqrt(1 / a);
      const last = l + 2 === layers.length;
      for (let i = 0; i < W.length; i += 1) W[i] = rng.n() * k * (last ? 0.1 : 1.2);
      this.P.push(W, B);
      this.count += W.length + B.length;
    }
    this.h = layers.map((n) => new Float64Array(n));
    this.dh = layers.map((n) => new Float64Array(n));
    this.grad = this.P.map((p) => new Float64Array(p.length));
    this.m1 = this.P.map((p) => new Float64Array(p.length));
    this.m2 = this.P.map((p) => new Float64Array(p.length));
    this.t = 0;
  }

  // Activation: the smooth "swish" x / (1 + e^-x) with its slope.
  forward(input) {
    const { layers, P, h } = this, L = layers.length - 1;
    h[0].set(input);
    for (let l = 0; l < L; l += 1) {
      const W = P[2 * l], B = P[2 * l + 1], a = h[l], b = h[l + 1], na = layers[l], nb = layers[l + 1];
      for (let j = 0; j < nb; j += 1) {
        let v = B[j];
        const o = j * na;
        for (let i = 0; i < na; i += 1) v += W[o + i] * a[i];
        if (l + 1 < L) { const e = 1 / (1 + Math.exp(-v)); this.act(l, j, v, e); b[j] = v * e; } else b[j] = v;
      }
    }
    return h[L];
  }

  act(l, j, v, e) { (this.slope ??= this.layers.map((n) => new Float64Array(n)))[l + 1][j] = e + v * e * (1 - e); }

  // After forward(): adds d(loss)/d(params) for the given d(loss)/d(output).
  backward(dOut) {
    const { layers, P, dh, grad } = this, L = layers.length - 1;
    dh[L].set(dOut);
    for (let l = L - 1; l >= 0; l -= 1) {
      const W = grad[2 * l], B = grad[2 * l + 1], na = layers[l], nb = layers[l + 1], a = this.h[l], up = dh[l + 1], down = dh[l], Wp = P[2 * l];
      down.fill(0);
      for (let j = 0; j < nb; j += 1) {
        const d = up[j] * (l + 1 < L ? this.slope[l + 1][j] : 1), o = j * na;
        if (d === 0) continue;
        B[j] += d;
        for (let i = 0; i < na; i += 1) { W[o + i] += d * a[i]; down[i] += d * Wp[o + i]; }
      }
    }
  }

  zero() { for (const g of this.grad) g.fill(0); }

  adam(lr, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
    this.t += 1;
    const c1 = 1 / (1 - b1 ** this.t), c2 = 1 / (1 - b2 ** this.t);
    for (let k = 0; k < this.P.length; k += 1) {
      const p = this.P[k], g = this.grad[k], m = this.m1[k], v = this.m2[k];
      for (let i = 0; i < p.length; i += 1) {
        m[i] = b1 * m[i] + (1 - b1) * g[i];
        v[i] = b2 * v[i] + (1 - b2) * g[i] * g[i];
        p[i] -= lr * (m[i] * c1) / (Math.sqrt(v[i] * c2) + eps);
      }
    }
  }

  // A second network with the same numbers. Used for the running average of the weights.
  copyFrom(o, mix = 1) { for (let k = 0; k < this.P.length; k += 1) { const a = this.P[k], b = o.P[k]; for (let i = 0; i < a.length; i += 1) a[i] += mix * (b[i] - a[i]); } }
}
