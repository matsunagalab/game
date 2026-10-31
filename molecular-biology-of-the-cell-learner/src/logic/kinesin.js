// Kinesin-1 stepping, hand over hand. The cargo moves 8 nm per ATP, and each head 16 nm.
// Waiting state (at limiting ATP): the front head is bound and empty, the rear head tethered with ADP.
// ATP on the front head is hydrolysed and its neck linker docks; then the tethered head diffuses forward,
// lands and loses its ADP (Milic 2014; Mickolajczyk 2015; Hancock 2016). Pi then leaves the rear head, which lets go.
export function newWalker() { return { front: 0, phase: 'wait', pos: 0, heads: [{ nm: 0, nuc: 'empty', bound: true }, { nm: -8, nuc: 'ADP', bound: false }], atp: 0 }; }

export function bindATP(w) {
  if (w.phase !== 'wait') return false;
  const f = w.heads[w.front]; const r = w.heads[1 - w.front];
  f.nuc = 'ADP·Pi'; // ATP binds and is hydrolysed, and the neck linker docks.
  r.nm = f.nm + 8; // From 8 nm behind the bound head to 8 nm in front: a 16 nm move, found by diffusion.
  r.bound = true; r.nuc = 'empty'; // It lands and ADP leaves.
  w.front = 1 - w.front; w.pos += 8; w.atp += 1; w.phase = 'bothBound';
  return true;
}
// Both heads on the track. Strain through the neck linkers keeps the front head waiting until the rear one lets go.
export function releasePi(w) {
  if (w.phase !== 'bothBound') return false;
  const rear = w.heads[1 - w.front];
  rear.nuc = 'ADP'; rear.bound = false; // Pi leaves, and the rear head lets go.
  w.phase = 'wait';
  return true;
}
