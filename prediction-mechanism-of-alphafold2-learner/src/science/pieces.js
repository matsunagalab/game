// Reading a chain as pieces. A map of errors e[i * n + j] is cut into contiguous stretches of the chain, and each block
// of the map is replaced by its own mean. The score is the share of the map's variance those means keep, leaving out each
// residue with itself. Equal means in a block score nothing, so a cut earns only what the map really shows.

// Sums over any rectangle of the map, in constant time.
export function mapSums(e, n) {
  const S = new Float64Array((n + 1) * (n + 1)), Q = new Float64Array((n + 1) * (n + 1)), m = n + 1;
  let total = 0, squares = 0;
  for (let i = 0; i < n; i += 1) {
    let row = 0, rowQ = 0;
    for (let j = 0; j < n; j += 1) {
      if (i !== j) { const v = e[i * n + j]; row += v; rowQ += v * v; total += v; squares += v * v; }
      S[(i + 1) * m + j + 1] = S[i * m + j + 1] + row;
      Q[(i + 1) * m + j + 1] = Q[i * m + j + 1] + rowQ;
    }
  }
  const count = n * (n - 1), mean = total / count;
  return { n, S, m, mean, count, spread: squares - count * mean * mean };
}

const edges = (cuts, n) => [0, ...[...cuts].sort((a, b) => a - b), n];

// Rows a to b and columns c to d, ends excluded. Returns the sum and how many cells count.
function block({ S, m }, a, b, c, d) {
  const sum = S[b * m + d] - S[a * m + d] - S[b * m + c] + S[a * m + c];
  const overlap = Math.max(0, Math.min(b, d) - Math.max(a, c));
  return { sum, cells: (b - a) * (d - c) - overlap };
}

// A cut at c falls between residues c - 1 and c, counting from 0.
export function pieceFit(sums, cuts) {
  const { n, mean, spread } = sums, x = edges(cuts, n);
  if (!(spread > 0)) return 0;
  let kept = 0;
  for (let p = 0; p + 1 < x.length; p += 1) {
    for (let q = 0; q + 1 < x.length; q += 1) {
      const { sum, cells } = block(sums, x[p], x[p + 1], x[q], x[q + 1]);
      if (cells > 0) { const v = sum / cells - mean; kept += cells * v * v; }
    }
  }
  return kept / spread;
}

// The mean inside each piece and between pieces, in the map's own units.
export function withinAcross(sums, cuts) {
  const x = edges(cuts, sums.n);
  let ws = 0, wc = 0, as = 0, ac = 0;
  for (let p = 0; p + 1 < x.length; p += 1) {
    for (let q = 0; q + 1 < x.length; q += 1) {
      const { sum, cells } = block(sums, x[p], x[p + 1], x[q], x[q + 1]);
      if (p === q) { ws += sum; wc += cells; } else { as += sum; ac += cells; }
    }
  }
  return { within: wc ? ws / wc : 0, across: ac ? as / ac : 0 };
}

// The best k cuts this search can find: a coarse grid over all placements, then steps of one residue until nothing helps.
export function bestCuts(sums, k, { grid = 8, end = 3 } = {}) {
  const { n } = sums, spots = [];
  for (let c = end; c <= n - end; c += k === 1 ? 1 : grid) spots.push(c);
  let best = null;
  const pick = (from, chosen) => {
    if (chosen.length === k) { const f = pieceFit(sums, chosen); if (!best || f > best.fit) best = { fit: f, cuts: chosen.slice() }; return; }
    for (let s = from; s < spots.length; s += 1) { chosen.push(spots[s]); pick(s + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  for (let moved = true; moved;) {
    moved = false;
    for (let p = 0; p < k; p += 1) {
      for (const d of [-1, 1]) {
        const c = best.cuts.slice();
        c[p] += d;
        if (c[p] < end || c[p] > n - end || new Set(c).size < k) continue;
        const f = pieceFit(sums, c);
        if (f > best.fit + 1e-9) { best = { fit: f, cuts: c.sort((a, b) => a - b) }; moved = true; }
      }
    }
  }
  return best;
}

// Each piece is judged by its mean score. Returns the pieces and the share of residues whose own score agrees with
// their piece's verdict, so a piece may hold a few strays but a long wrong stretch costs its length.
export function trustFit(score, cuts, line = 70) {
  const n = score.length, x = edges(cuts, n), pieces = [];
  let agree = 0;
  for (let p = 0; p + 1 < x.length; p += 1) {
    const from = x[p], to = x[p + 1];
    if (to <= from) continue;
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += score[i];
    const mean = sum / (to - from), trusted = mean >= line;
    for (let i = from; i < to; i += 1) if ((score[i] >= line) === trusted) agree += 1;
    pieces.push({ from, to, mean, trusted });
  }
  return { pieces, fit: agree / n };
}
