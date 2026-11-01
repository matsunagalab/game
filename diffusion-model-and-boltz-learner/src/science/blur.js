// The simplest generative model of a structure: take a stored one and add Gaussian noise of width s to every coordinate. Its density is
//   p(x) = (1/M) sum_m N(x; y_m, s^2 I)
// which is a kernel density, and also the data blurred by noise of size s, the same thing a diffusion model passes through at noise s.
// All structures are in one frame, the frame the data were packed in.

export function squared(a, b) {
  let e = 0;
  for (let i = 0; i < a.length; i += 1) { const d = a[i] - b[i]; e += d * d; }
  return e;
}

// Mean log density of some points, given their squared distances to the stored structures, in bits per atom.
function logScore(rows, s, dim) {
  const q = 1 / (2 * s * s), n = dim / 3, norm = (dim / 2) * Math.log(2 * Math.PI * s * s);
  let t = 0;
  for (const r of rows) {
    let lo = Infinity, sum = 0;
    for (let i = 0; i < r.length; i += 1) if (r[i] < lo) lo = r[i];
    for (let i = 0; i < r.length; i += 1) sum += Math.exp(-(r[i] - lo) * q);
    t += Math.log(sum / r.length) - lo * q - norm;
  }
  return t / rows.length / n / Math.LN2;
}

// Typical distance to the nearest neighbour, in A per atom: the median over the given rows.
function medianNearest(rows, n, skipSelf) {
  const v = rows.map((r) => Math.sqrt(Math.min(...(skipSelf ? r.filter((d) => d > 1e-9) : r)) / n)).sort((a, b) => a - b);
  return v[v.length >> 1];
}

// Scores every width on the stored and the hidden structures, one width per yield, so that a phone can do it a slice at a time.
// Scores are in bits per atom above the widest width on the hidden set. spacing is how far stored structures lie from each other.
export function* scanWidths(stored, hidden, widths) {
  const dim = stored[0].length, n = dim / 3;
  const rowsS = stored.map((a) => stored.map((b) => squared(a, b)));
  yield 0;
  const rowsH = hidden.map((a) => stored.map((b) => squared(a, b)));
  yield 0;
  const ref = logScore(rowsH, widths[widths.length - 1], dim), list = [];
  for (const w of widths) {
    list.push({ w, hidden: logScore(rowsH, w, dim) - ref, stored: logScore(rowsS, w, dim) - ref });
    yield list.length / widths.length;
  }
  const best = list.reduce((b, c, i) => (c.hidden > list[b].hidden ? i : b), 0);
  return { list, best, spacing: medianNearest(rowsS, n, true), reach: medianNearest(rowsH, n, false), top: Math.max(...list.map((c) => c.stored)) };
}
export const scanNow = (a, b, w) => { const it = scanWidths(a, b, w); let r; while (!(r = it.next()).done); return r.value; };

// Bond lengths of a structure, and their root-mean-square error against a reference set of lengths.
export const bondLengths = (x, bonds) => bonds.map(([i, j]) => Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2]));
export function bondError(x, bonds, ref, at = 0, strain = null, limit = 0.1) {
  let e = 0;
  for (let k = 0; k < bonds.length; k += 1) {
    const i = at + 3 * bonds[k][0], j = at + 3 * bonds[k][1], d = Math.hypot(x[i] - x[j], x[i + 1] - x[j + 1], x[i + 2] - x[j + 2]) - ref[k];
    e += d * d;
    if (strain) strain[k] = Math.min(1, Math.abs(d) / limit);
  }
  return Math.sqrt(e / bonds.length);
}
