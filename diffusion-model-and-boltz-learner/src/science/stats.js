// Small measures used to score what the player makes.
export const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };

// The map is phi -180 to 180, psi -100 to 260.
export const MAP = { x0: -180, x1: 180, y0: -100, y1: 260 };

// A histogram model on the map: smoothed counts, read as a density. Returns a sampler and a log-likelihood.
export function histogramModel(train, width, alpha = 0.5) {
  const nx = Math.round(360 / width), w = 360 / nx, N = nx * nx, c = new Float64Array(N);
  const cell = (x, y) => Math.min(nx - 1, Math.max(0, Math.floor((x + 180) / w))) + nx * Math.min(nx - 1, Math.max(0, Math.floor((y + 100) / w)));
  for (let i = 0; i < train.x.length; i += 1) c[cell(train.x[i], train.y[i])] += 1;
  const total = train.x.length + alpha * N, area = w * w;
  const logp = (x, y) => Math.log((c[cell(x, y)] + alpha) / total / area);
  const cum = new Float64Array(N);
  let s = 0;
  for (let i = 0; i < N; i += 1) { s += c[i] + alpha; cum[i] = s; }
  const draw = (rng, out) => {
    const u = rng.u() * s;
    let lo = 0, hi = N - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < u) lo = m + 1; else hi = m; }
    out[0] = -180 + ((lo % nx) + rng.u()) * w; out[1] = -100 + (Math.floor(lo / nx) + rng.u()) * w;
    return out;
  };
  return { nx, width: w, cells: N, logp, draw, counts: c };
}

// Mean log-likelihood of unseen points, in bits, measured against a flat map. Zero means no better than a flat map.
export function heldOutBits(model, test) {
  let s = 0;
  const flat = Math.log(1 / (360 * 360));
  for (let i = 0; i < test.x.length; i += 1) s += model.logp(test.x[i], test.y[i]) - flat;
  return s / test.x.length / Math.LN2;
}

// The islands. Each point goes to the nearest of these centres, in a metric that respects the shape of the map.
export const ISLANDS = [
  { id: 'aR', name: 'right-handed helix', short: 'α', x: -65, y: -40 },
  { id: 'b', name: 'extended strand', short: 'β', x: -105, y: 140 },
  { id: 'aL', name: 'left-handed turn', short: 'αL', x: 60, y: 40 },
];
// The line psi = 45 degrees sits on the shoulder of the alpha region, not on the valley floor at 65 to 95 degrees. These are regions of
// the map with stated edges, not thermodynamic states. phi = 0 is a harmless line.
export function island(x, y) {
  if (x > 0) return 2;
  return y > 45 ? 1 : 0;
}
export function populations(xs, ys, n = xs.length) {
  const c = [0, 0, 0];
  for (let i = 0; i < n; i += 1) c[island(xs[i], ys[i])] += 1;
  return c.map((v) => v / n);
}
// Half the summed absolute difference: the share of droplets that would have to move island.
export const popError = (a, b) => 0.5 * a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

// How far two clouds are apart, by the mean of the sliced 1-D Wasserstein distances along many directions. Degrees.
export function sliced(ax, ay, bx, by, dirs = 16) {
  let s = 0;
  const n = Math.min(ax.length, bx.length), A = new Float64Array(n), B = new Float64Array(n);
  const pa = ax.length / n, pb = bx.length / n;
  for (let d = 0; d < dirs; d += 1) {
    const t = (Math.PI * (d + 0.5)) / dirs, c = Math.cos(t), e = Math.sin(t);
    for (let i = 0; i < n; i += 1) { const u = Math.floor(i * pa), v = Math.floor(i * pb); A[i] = c * ax[u] + e * ay[u]; B[i] = c * bx[v] + e * by[v]; }
    A.sort(); B.sort();
    let t2 = 0;
    for (let i = 0; i < n; i += 1) t2 += Math.abs(A[i] - B[i]);
    s += t2 / n;
  }
  return s / dirs;
}

// Mean distance from each point in A to its nearest in B. O(n m), so keep the sets small.
export function nearestMean(ax, ay, bx, by, limit = Infinity) {
  let s = 0;
  const n = Math.min(ax.length, limit);
  for (let i = 0; i < n; i += 1) {
    let lo = Infinity;
    for (let j = 0; j < bx.length; j += 1) { const d = (ax[i] - bx[j]) ** 2 + (ay[i] - by[j]) ** 2; if (d < lo) lo = d; }
    s += Math.sqrt(lo);
  }
  return s / n;
}
