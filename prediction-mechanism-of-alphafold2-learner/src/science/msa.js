// Column statistics on a real alignment. X is a flat Uint8Array of N rows and L columns, letters 0..19 and 20 for a gap.
export const LETTERS = 'ACDEFGHIKLMNPQRSTVWY-';
export const GAP = 20;

// Sequence reweighting (Morcos et al. 2011): a sequence counts 1 / (number of sequences at least th identical to it).
export function reweight(X, N, L, th = 0.8) {
  const need = Math.ceil(th * L), counts = new Uint16Array(N).fill(1);
  for (let a = 0; a < N; a += 1) {
    const ar = a * L;
    for (let b = a + 1; b < N; b += 1) {
      const br = b * L;
      let same = 0;
      for (let c = 0; c < L; c += 1) { if (X[ar + c] === X[br + c]) same += 1; if (same + L - c - 1 < need) break; }
      if (same >= need) { counts[a] += 1; counts[b] += 1; }
    }
  }
  const w = new Float64Array(N);
  let meff = 0;
  for (let s = 0; s < N; s += 1) { w[s] = 1 / counts[s]; meff += w[s]; }
  return { w, meff };
}

export const uniformWeights = (N) => ({ w: new Float64Array(N).fill(1), meff: N });

// Mutual information of two columns in nats, with the small even pseudocount used for all of this game's tables.
export function mutualInformation(X, N, L, i, j, w, pc = 1e-3, q = 21) {
  const t = new Float64Array(q * q);
  let total = 0;
  for (let s = 0; s < N; s += 1) { const r = s * L; t[X[r + i] * q + X[r + j]] += w[s]; total += w[s]; }
  return miFromTable(t, total, q, pc);
}

export function miFromTable(t, total, q, pc = 1e-3) {
  const pa = new Float64Array(q), pb = new Float64Array(q), even = pc / (q * q);
  for (let a = 0; a < q; a += 1) {
    for (let b = 0; b < q; b += 1) {
      const p = (t[a * q + b] / total) * (1 - pc) + even;
      pa[a] += p;
      pb[b] += p;
    }
  }
  let mi = 0;
  for (let a = 0; a < q; a += 1) {
    for (let b = 0; b < q; b += 1) {
      const p = (t[a * q + b] / total) * (1 - pc) + even;
      if (p > 0) mi += p * Math.log(p / (pa[a] * pb[b]));
    }
  }
  return mi;
}

// The entropy of one column in nats. Mutual information can never exceed the smaller entropy of its two columns.
export function entropy(X, N, L, i, w, q = 21) {
  const t = new Float64Array(q);
  let total = 0;
  for (let s = 0; s < N; s += 1) { t[X[s * L + i]] += w[s]; total += w[s]; }
  let h = 0;
  for (const v of t) if (v > 0) { const p = v / total; h -= p * Math.log(p); }
  return h;
}

// All pairs. A symmetric flat Float64Array of L by L.
export function miMatrix(X, N, L, w, pc = 1e-3, q = 21) {
  const M = new Float64Array(L * L);
  for (let i = 0; i < L; i += 1) {
    for (let j = i + 1; j < L; j += 1) {
      M[i * L + j] = M[j * L + i] = mutualInformation(X, N, L, i, j, w, pc, q);
    }
  }
  return M;
}

// Average product correction, Dunn et al. 2008: S(i,j) - S(i,.) S(.,j) / S(.,.)
export function apc(S, L) {
  const r = new Float64Array(L);
  let all = 0;
  for (let i = 0; i < L; i += 1) {
    for (let j = 0; j < L; j += 1) if (i !== j) r[i] += S[i * L + j];
    all += r[i];
    r[i] /= L - 1;
  }
  all /= L * (L - 1);
  const out = new Float64Array(L * L);
  for (let i = 0; i < L; i += 1) {
    for (let j = 0; j < L; j += 1) if (i !== j) out[i * L + j] = S[i * L + j] - r[i] * r[j] / all;
  }
  return out;
}

// Each column keeps its K commonest letters and the rest (gaps too) share one slot. This is what lets the inversion run
// on a phone. On this family it loses almost nothing against the full alphabet: see README.
// fit, if given, chooses the letters from only the first fit rows, so that rows kept aside for testing have no say.
export function compressColumns(X, N, L, K = 6, q = 21, fit = N) {
  const Y = new Uint8Array(N * L), qi = new Uint8Array(L), kept = [];
  for (let c = 0; c < L; c += 1) {
    const count = new Int32Array(q);
    for (let s = 0; s < fit; s += 1) count[X[s * L + c]] += 1;
    const order = [...count.keys()].filter((a) => count[a] > 0).sort((a, b) => count[b] - count[a] || a - b).slice(0, K);
    const map = new Uint8Array(q).fill(order.length);
    order.forEach((a, r) => { map[a] = r; });
    for (let s = 0; s < N; s += 1) Y[s * L + c] = map[X[s * L + c]];
    qi[c] = order.length + 1;
    kept.push(order);
  }
  return { Y, qi, kept };
}

// Rank the pairs at least sep apart in the sequence and report how many of the top k touch.
export function rankPairs(S, L, valid, sep = 6) {
  const pairs = [];
  for (let i = 0; i < L; i += 1) {
    for (let j = i + sep; j < L; j += 1) if (valid(i, j)) pairs.push([S[i * L + j], i, j]);
  }
  return pairs.sort((a, b) => b[0] - a[0]);
}

export function precision(pairs, k, isContact) {
  let hit = 0;
  const n = Math.min(k, pairs.length);
  for (let t = 0; t < n; t += 1) if (isContact(pairs[t][1], pairs[t][2])) hit += 1;
  return n ? hit / n : 0;
}
