// This game's own small fold: real couplings, then triangle bounds, then an embedding, then the residue gas.
// It is not AlphaFold2. It exists so the player can run every idea of the earlier chapters end to end, and see how far
// a phone gets, on the same protein AlphaFold2 predicts. Local shape (four residues either side) is read from the
// crystal, as a stated stand-in for what a network learns about local structure from sequence. Contacts are not.
import { makeBounds, restrain, smooth } from './bounds.js';
import { applyInverse, frameFromAtoms } from './frames.js';
import { classicalMDS, Gas } from './gas.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class Pipeline {
  // ca: real C-alpha list for the residues studied. frames: their real frames. Only local pieces of these are used.
  constructor(ca, frames, shape, { window = 4, ceiling = 9, nums = null } = {}) {
    Object.assign(this, { ca, frames, shape, window, ceiling, nums, n: ca.length });
  }

  local(w) {
    const { n, ca, window } = this, out = [];
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < Math.min(n, i + window + 1); j += 1) out.push({ i, a: 0, j, b: 0, d: dist(ca[i], ca[j]), w });
    return out;
  }

  bounds(contacts) {
    const { n, ca, window, ceiling, nums } = this, b = makeBounds(n, { lower: 4, nums });
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < Math.min(n, i + window + 1); j += 1) { const d = dist(ca[i], ca[j]); restrain(b, i, j, d - 0.3, d + 0.3); }
    for (const [i, j] of contacts) restrain(b, i, j, 4, ceiling);
    smooth(b);
    return b;
  }

  // One hand of the embedding, refined. prior is the previous draft's distance table, or null.
  * foldHandSlices(contacts, { mirror = false, prior = null, steps = 120 } = {}) {
    const { n, frames, ca, window } = this, b = this.bounds(contacts), table = new Float64Array(n * n);
    yield 0;
    for (let i = 0; i < n * n; i += 1) table[i] = prior ? Math.max(b.L[i], Math.min(b.U[i], prior[i])) : b.L[i] + 0.62 * (b.U[i] - b.L[i]);
    let P = classicalMDS(table, n);
    yield 0;
    if (mirror) P = P.map((p) => [-p[0], p[1], p[2]]);
    const g = new Gas(n, this.shape, { seed: 7 });
    for (let i = 0; i < n; i += 1) {
      const f = frameFromAtoms(P[Math.max(0, i - 1)], P[i], P[Math.min(n - 1, i + 1)]);
      g.frames[i] = { R: f.R, t: P[i].slice() };
    }
    const rs = this.local(3);
    for (const [i, j] of contacts) rs.push({ i, a: 3, j, b: 3, lo: 3.5, hi: 8, d: 6, w: 1 });
    g.restraints = rs;
    const anchors = [];
    for (let i = 0; i < n; i += 1) for (let j = Math.max(0, i - window); j <= Math.min(n - 1, i + window); j += 1) if (i !== j) anchors.push({ i, j, v: applyInverse(frames[i], ca[j]), w: 0.6 });
    g.anchors = anchors;
    for (let k = 0; k < steps; k += 1) { g.step({ rate: 0.18, turn: 0.02 }); if (k % 6 === 5) yield k / steps; }
    return g;
  }

  // Both hands, keeping whichever satisfies the restraints better. The restraints include local shape read from the
  // crystal, and that local shape is what sets the hand: without it the two hands tie.
  * foldSlices(contacts, options = {}) {
    const a = yield* this.foldHandSlices(contacts, options);
    const b = yield* this.foldHandSlices(contacts, { ...options, mirror: true });
    return a.energy <= b.energy ? a : b;
  }

  fold(contacts, options = {}) { const g = this.foldSlices(contacts, options); let r = g.next(); while (!r.done) r = g.next(); return r.value; }

  // One recycling pass: read the candidates again in the light of the draft, and start from the draft's distances.
  * recycleSlices(draft, candidates, { near = 11 } = {}) {
    const { n } = this, cb = draft.points(3), ca = draft.points(0), prior = new Float64Array(n * n);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) prior[i * n + j] = dist(ca[i], ca[j]);
    const contacts = candidates.filter(([i, j]) => dist(cb[i], cb[j]) < near);
    const gas = yield* this.foldSlices(contacts, { prior });
    return { contacts, gas };
  }

  recycle(draft, candidates, options) { const g = this.recycleSlices(draft, candidates, options); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
}
