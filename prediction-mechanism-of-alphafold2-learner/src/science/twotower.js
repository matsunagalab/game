// A two-tower exchange small enough to run on a phone, on a real alignment.
//
// MSA tower: for every sequence s and column i, m[s,i,a], the model's chance of letter a there, given all the
// sequence's other letters. Shape (sequences, columns, states).
// Pair tower: J[i,j,a,b] for every pair of columns. Shape (columns, columns, states, states).
//
// pair -> MSA:  m[s,i,a] = softmax over a of ( h[i,a] + sum over j of J[i,j,a,s_j] )
// MSA -> pair:  J[i,j,a,b] += rate * mean over s of ( [s_i = a] - m[s,i,a] ) * [s_j = b]    an outer product, averaged
//
// This is gradient ascent on the pseudo-likelihood (Ekeberg et al. 2013). It is a teaching model. It has the same two
// arrays and the same two wires as the Evoformer, but these wires are one formula. AlphaFold2's are learned.
export class TwoTower {
  constructor(Y, N, L, qi, { q = 7, batch = 400, rate = 0.5, decay = 0.012, seed = 1 } = {}) {
    Object.assign(this, { Y, N, L, qi, q, batch: Math.min(batch, N), rate, decay });
    this.J = new Float32Array(L * L * q * q);
    this.h = new Float32Array(L * q);
    this.vJ = new Float32Array(L * L * q * q);
    this.m = new Float32Array(this.batch * L * q);
    this.wires = { pairToMsa: true, msaToPair: true };
    this.block = 0;
    this.seed = seed;
    this.loss = NaN;
    this.setProfile();
    this.chooseBatch();
  }

  // The starting point: each column alone, its letter frequencies with a little added evenly.
  setProfile() {
    const { Y, N, L, q, qi, h } = this;
    for (let i = 0; i < L; i += 1) {
      const c = new Float64Array(q);
      for (let s = 0; s < N; s += 1) c[Y[s * L + i]] += 1;
      for (let a = 0; a < qi[i]; a += 1) h[i * q + a] = Math.log((c[a] + 1) / (N + qi[i]));
    }
  }

  // Each block reads a fresh sample of rows, as AlphaFold2 resamples its MSA.
  chooseBatch() {
    const { N, batch } = this;
    let s = (this.seed = (this.seed * 48271) % 2147483647);
    const start = s % N, step = 1 + 2 * (s % 701);
    this.rows = Int32Array.from({ length: batch }, (_, k) => (start + k * step) % N);
  }

  // pair -> MSA. Fills m and returns the mean loss, -log p(true letter), the number the exchange pushes down.
  // Generators here let a frame budget run the work in slices, so a phone keeps drawing.
  * readPairsSlices() {
    const { Y, L, q, qi, J, h, m, rows, wires } = this;
    const Jq = L * q * q;
    const seq = new Int32Array(L);
    const f = new Float64Array(q);
    let loss = 0;
    for (let k = 0; k < rows.length; k += 1) {
      const r = rows[k] * L;
      for (let i = 0; i < L; i += 1) seq[i] = Y[r + i];
      for (let i = 0; i < L; i += 1) {
        const qa = qi[i];
        for (let a = 0; a < qa; a += 1) f[a] = h[i * q + a];
        if (wires.pairToMsa) {
          const ib = i * Jq;
          for (let j = 0; j < L; j += 1) {
            if (j === i) continue;
            const base = ib + j * q * q + seq[j];
            for (let a = 0; a < qa; a += 1) f[a] += J[base + a * q];
          }
        }
        let top = -Infinity;
        for (let a = 0; a < qa; a += 1) if (f[a] > top) top = f[a];
        let z = 0;
        for (let a = 0; a < qa; a += 1) { f[a] = Math.exp(f[a] - top); z += f[a]; }
        const at = (k * L + i) * q;
        for (let a = 0; a < qa; a += 1) m[at + a] = f[a] / z;
        loss -= Math.log(m[at + seq[i]] + 1e-12);
      }
      if (k % 12 === 11) yield k / rows.length;
    }
    this.loss = loss / (rows.length * L);
    return this.loss;
  }

  readPairs() { for (const _ of this.readPairsSlices()) { /* run to the end */ } return this.loss; }

  // MSA -> pair. The outer product of each column's surprise with every other column's letters, averaged over sequences.
  * writePairsSlices() {
    const { Y, L, q, qi, J, h, m, rows, rate, decay, vJ } = this;
    if (!this.wires.msaToPair) return;
    const qq = q * q, Jq = L * qq, n = rows.length;
    const G = new Float32Array(J.length), Gh = new Float32Array(h.length);
    const seq = new Int32Array(L);
    for (let k = 0; k < n; k += 1) {
      const r = rows[k] * L;
      for (let i = 0; i < L; i += 1) seq[i] = Y[r + i];
      for (let i = 0; i < L; i += 1) {
        const at = (k * L + i) * q, ib = i * Jq, qa = qi[i], si = seq[i];
        for (let a = 0; a < qa; a += 1) {
          const e = (a === si ? 1 : 0) - m[at + a];
          Gh[i * q + a] += e;
          for (let j = 0; j < L; j += 1) if (j !== i) G[ib + j * qq + a * q + seq[j]] += e;
        }
      }
      if (k % 12 === 11) yield k / n;
    }
    const scale = rate / n;
    for (let i = 0; i < L; i += 1) {
      for (let a = 0; a < qi[i]; a += 1) h[i * q + a] += scale * Gh[i * q + a];
      for (let j = i + 1; j < L; j += 1) {
        const ij = i * Jq + j * qq, ji = j * Jq + i * qq;
        for (let a = 0; a < qi[i]; a += 1) {
          for (let b = 0; b < qi[j]; b += 1) {
            const g = 0.5 * (G[ij + a * q + b] + G[ji + b * q + a]);
            const v = (vJ[ij + a * q + b] = 0.7 * vJ[ij + a * q + b] + scale * g - decay * rate * J[ij + a * q + b]);
            J[ij + a * q + b] += v;
            J[ji + b * q + a] = J[ij + a * q + b];
          }
        }
      }
    }
  }

  // The honest score: the same loss, on rows the exchange has never been shown. Y must hold them after the first N rows.
  * heldOutSlices(rows) {
    const { rows: keep, m: keepM, L, q } = this;
    this.rows = rows;
    this.m = new Float32Array(rows.length * L * q);
    yield* this.readPairsSlices();
    this.rows = keep;
    this.m = keepM;
    return this.loss;
  }

  heldOut(rows) { for (const _ of this.heldOutSlices(rows)) { /* run to the end */ } return this.loss; }

  * stepSlices() {
    this.chooseBatch();
    yield* this.readPairsSlices();
    yield* this.writePairsSlices();
    this.block += 1;
  }

  step() { for (const _ of this.stepSlices()) { /* run to the end */ } }

  // One number per pair: the size of its coupling table with the column and row means taken out.
  scores() {
    const { J, L, q, qi } = this, S = new Float64Array(L * L), qq = q * q;
    const ra = new Float64Array(q), rb = new Float64Array(q);
    for (let i = 0; i < L; i += 1) {
      for (let j = i + 1; j < L; j += 1) {
        const base = i * L * qq + j * qq, qa = qi[i], qb = qi[j];
        ra.fill(0); rb.fill(0);
        let all = 0;
        for (let a = 0; a < qa; a += 1) for (let b = 0; b < qb; b += 1) { const v = J[base + a * q + b]; ra[a] += v; rb[b] += v; all += v; }
        let s = 0;
        for (let a = 0; a < qa; a += 1) for (let b = 0; b < qb; b += 1) { const v = J[base + a * q + b] - ra[a] / qb - rb[b] / qa + all / (qa * qb); s += v * v; }
        S[i * L + j] = S[j * L + i] = Math.sqrt(s);
      }
    }
    return S;
  }
}
