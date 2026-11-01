// A real denoiser network for 2-D points, trained live. EDM preconditioning (Karras et al. 2022, Table 1):
//   D(x; s) = cskip(s) x + cout(s) F(cin(s) x, cnoise(s))
// with F a small MLP. Coordinates are first centred and divided by the data's own spread, so that sdata = 1 inside the network.
import { MLP } from './mlp.js';
import { edm } from './sampler.js';
import { makeRng } from './rng.js';

const BANDS = [1, 2, 4];
export class DenoiserNet {
  constructor({ mx, my, sdata, width = 64, depth = 3, seed = 5, pMean = -1.2, pStd = 1.2, lr = 0.003, weighted = true }) {
    Object.assign(this, { mx, my, sd: sdata, pMean, pStd, lr, weighted });
    this.rng = makeRng(seed);
    this.nIn = 2 + 2 * BANDS.length * 2 + 3;
    const layers = [this.nIn]; for (let i = 0; i < depth; i += 1) layers.push(width); layers.push(2);
    this.net = new MLP(layers, this.rng);
    this.avg = new MLP(layers, makeRng(1)); this.avg.copyFrom(this.net);
    this.input = new Float64Array(this.nIn);
    this.steps = 0;
  }

  features(u, v, s) {
    const a = this.input, ci = edm.cin(s, 1), cn = edm.cnoise(s, 1), p = ci * u, q = ci * v;
    a[0] = p; a[1] = q;
    let k = 2;
    for (const b of BANDS) { a[k] = Math.sin(b * p * 1.5); a[k + 1] = Math.cos(b * p * 1.5); a[k + 2] = Math.sin(b * q * 1.5); a[k + 3] = Math.cos(b * q * 1.5); k += 4; }
    a[k] = cn; a[k + 1] = Math.sin(cn * 2); a[k + 2] = Math.cos(cn * 2);
    return a;
  }

  // Denoise a point given in degrees. Uses the running average of the weights, as AlphaFold3 and Boltz do at inference.
  D(px, py, sigma, out) {
    const u = (px - this.mx) / this.sd, v = (py - this.my) / this.sd, s = sigma / this.sd;
    const F = this.avg.forward(this.features(u, v, s));
    const cs = edm.cskip(s, 1), co = edm.cout(s, 1);
    out[0] = (cs * u + co * F[0]) * this.sd + this.mx;
    out[1] = (cs * v + co * F[1]) * this.sd + this.my;
  }

  // One step of training: `batch` noisy examples, one Adam update. Returns the mean of lambda(s) |D - y|^2.
  step(xs, ys, batch = 64, { fixedSigma = null } = {}) {
    const { net, rng, sd } = this, n = xs.length, g = [0, 0];
    net.zero();
    let loss = 0;
    for (let b = 0; b < batch; b += 1) {
      const i = rng.int(n), yu = (xs[i] - this.mx) / sd, yv = (ys[i] - this.my) / sd;
      const s = fixedSigma ?? Math.exp(this.pMean + this.pStd * rng.n());
      const u = yu + s * rng.n(), v = yv + s * rng.n();
      const cs = edm.cskip(s, 1), co = edm.cout(s, 1), w = this.weighted ? edm.lambda(s, 1) : 1;
      const F = net.forward(this.features(u, v, s));
      const e0 = cs * u + co * F[0] - yu, e1 = cs * v + co * F[1] - yv;
      loss += w * (e0 * e0 + e1 * e1);
      g[0] = (2 * w * co * e0) / batch; g[1] = (2 * w * co * e1) / batch;
      net.backward(g);
    }
    net.adam(this.lr);
    this.avg.copyFrom(net, 0.02);
    this.steps += 1;
    return loss / batch;
  }
}
