// A negative control for phylogeny. Sequences evolve down a random tree with every column independent of every other.
// No pair is coupled, by construction, so any mutual information that appears is false signal from shared ancestry.
export function evolveTree({ leaves = 512, L = 30, q = 8, rate = 0.1, seed = 5 } = {}) {
  let s = seed;
  const r = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  let pop = [Uint8Array.from({ length: L }, () => Math.floor(r() * q))];
  while (pop.length < leaves) {
    const next = [];
    for (const parent of pop) {
      for (let c = 0; c < 2; c += 1) {
        const child = parent.slice();
        for (let i = 0; i < L; i += 1) if (r() < rate) child[i] = Math.floor(r() * q);
        next.push(child);
      }
    }
    pop = next;
  }
  const X = new Uint8Array(pop.length * L);
  pop.forEach((row, k) => X.set(row, k * L));
  return { X, N: pop.length, L, q };
}

// As above, but with a star: every leaf comes straight from the root, so no two leaves share history. The control's control.
export function evolveStar({ leaves = 512, L = 30, q = 8, rate = 0.1, depth = 9, seed = 5 } = {}) {
  let s = seed;
  const r = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  const root = Uint8Array.from({ length: L }, () => Math.floor(r() * q)), X = new Uint8Array(leaves * L);
  for (let k = 0; k < leaves; k += 1) {
    for (let i = 0; i < L; i += 1) {
      let v = root[i];
      for (let d = 0; d < depth; d += 1) if (r() < rate) v = Math.floor(r() * q);
      X[k * L + i] = v;
    }
  }
  return { X, N: leaves, L, q };
}
