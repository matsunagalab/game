// Seeded random numbers, so that every result in the game can be repeated.
export function makeRng(seed = 1) {
  let s = seed >>> 0, spare = null;
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let a, b, r;
    do { a = 2 * u() - 1; b = 2 * u() - 1; r = a * a + b * b; } while (r >= 1 || r === 0);
    const k = Math.sqrt(-2 * Math.log(r) / r);
    spare = b * k;
    return a * k;
  };
  return { u, n, int: (m) => Math.floor(u() * m) };
}
