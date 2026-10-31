// Hydrophobicity: the Kyte–Doolittle scale (1982).
export const KD = { I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5, M: 1.9, A: 1.8, G: -0.4, T: -0.7, S: -0.8, W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5, Q: -3.5, D: -3.5, N: -3.5, K: -3.9, R: -4.5 };
export const isHydrophobic = (a) => KD[a] >= 1.8;

export function longestRun(seq) {
  let best = 0; let run = 0;
  for (const a of seq) { run = isHydrophobic(a) ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}
// Hydrophobic residues in the best stretch of ten near the start.
export function coreScore(seq, end = 32, w = 10) {
  let best = 0;
  for (let i = 0; i + w <= Math.min(seq.length, end); i++) best = Math.max(best, [...seq.slice(i, i + w)].filter(isHydrophobic).length);
  return best;
}
// A rule of thumb for an N-terminal signal: 8 of 10 residues hydrophobic. Real signals are judged more subtly.
export const looksLikeSignal = (seq) => coreScore(seq) >= 8;

export function hydropathy(seq, w = 19) {
  const out = [];
  for (let i = 0; i + w <= seq.length; i++) {
    let s = 0;
    for (let j = 0; j < w; j++) s += KD[seq[i + j]];
    out.push(s / w);
  }
  return out;
}
// The 19-residue average above 1.6 marks a likely transmembrane helix.
export function tmPeak(seq) {
  const h = hydropathy(seq);
  const v = Math.max(...h);
  return { value: v, at: h.indexOf(v) + 1 };
}
export const kind = (a) => (isHydrophobic(a) ? 'oil' : 'KRH'.includes(a) ? 'plus' : 'DE'.includes(a) ? 'minus' : 'GP'.includes(a) ? 'turn' : 'polar');
