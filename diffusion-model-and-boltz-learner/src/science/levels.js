// What the three puzzle chapters ask for, kept here so that tools/test.mjs checks the same numbers the game plays. These are choices of what to
// show and how close counts. Every score on a board is computed from them.

// Chapter 1. Widths in A. The model is a stored structure plus noise of this width on every coordinate.
export const BLUR = {
  widths: [0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3, 0.45, 0.6, 0.8, 1, 1.2, 1.5, 2, 3, 4, 6, 8],
  near: 0.15, // Bits per atom from the best that count as the best.
  hideEvery: 4, // Level 1 hides every fourth conformer.
  few: [0, 9, 18, 27], // The conformers stored in level 2. The rest are hidden.
  adkHide: ['4AKE', '1E4Y', '9R71'], // Hidden by PDB entry, because chains of one crystal are near copies.
  some: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33], // The second case of level 3: ubiquitin again, with 12 stored.
};
export const conformerSplit = (n, stored) => ({ stored: stored.map((i) => i), hidden: Array.from({ length: n }, (_, i) => i).filter((i) => !stored.includes(i)) });
export const everyFourth = (n) => conformerSplit(n, Array.from({ length: n }, (_, i) => i).filter((i) => i % BLUR.hideEvery !== 0));
export function adkSplit(K, hide) {
  const all = K.ids.map((id, i) => ({ i, entry: id.slice(0, 4) }));
  return { stored: all.filter((a) => !hide.includes(a.entry)).map((a) => a.i), hidden: all.filter((a) => hide.includes(a.entry)).map((a) => a.i) };
}

// Chapter 4. The ruler is cut into slots, even in log noise. The top slot is the fixed start, high enough that a perfect run can reach the set share.
export const STOPS = {
  smax: 1000, smin: 0.5, slots: 25, seed: 13, noise: 0.8, shown: 24,
  samples: 4000, // Runs on the kinase.
  draws: 2000, // Runs on ubiquitin: enough to count 39 conformers.
  crisp: 0.2, even: 37, // Level 1: how near a real conformer a run must land, and the even count it must reach, of 39.
  band: 0.015, blur: 0.15, fair: 16, // Levels 2 and 3: how near the open share must land, how sharp the chains must be, and the even count of 17, level 1's bar.
  first: [0, 1, 2, 3, 4], // Level 1. All high, so it starts as a blur of one structure.
  // Levels 2 and 3 start sparse, because from a full ladder a few lucky drags would be enough. Level 3 shows no red, so its hand walks toward this ladder:
  // a stop inside the jump that crosses 120 A, the stops below, then second looks from that jump down to about 30 A.
  second: [0, 5, 10, 20], thirdFirst: [0, 4, 9, 14, 20], thirdAnswer: { slots: [0, 4, 7, 9, 11, 14, 18, 20], looks: [4, 7, 9] },
  budget: [5, 10, 11],
};
export const slotSigma = (slot) => STOPS.smax * (STOPS.smin / STOPS.smax) ** (slot / (STOPS.slots - 1));
export const ladderOf = (slots, seconds = []) => slots.map((slot, i) => ({ s: slotSigma(slot), second: !!seconds[i] }));
// Two open chains of the same crystal, and the fifteen closed ones: a set with a rare state.
export const rareSet = (K) => K.ids.map((_, i) => i).filter((i) => K.state[i] === 1 || i < 2);

// Chapter 9, levels 1 and 3: two real structures as an exact mixture.
export const TWO = {
  closed: '1AKEA', open: '4AKEA', width: 0.3, share: 0.1, tol: 0.015, gammaMin: 1, lambda: 1.003, start: [1.6, 0.6],
  preview: 1500, drops: 6000, shown: 24, previewShown: 10,
  odds: 0.22, // How close a guess must be in level 3: this power of ten on the odds.
  shares: [[0.3, 0.1, 0.034], [0.2, 0.05, 0.15], [0.25, 0.07, 0.04], [0.12, 0.3, 0.06]],
};
export const twoOpt = (eta, gamma) => ({ eta, gamma0: gamma, gammaMin: TWO.gammaMin, lambda: TWO.lambda });

// Chapter 9, level 2: the real simulation of alanine dipeptide, on its exact 2-D field. λ stays at Boltz-2's value everywhere on the pad.
export const PAD = {
  steps: 60, smax: 400, smin: 1, seed: 9, lambda: 1.003, gammaMin: 4, drops: 9000, eta: [0.8, 1.8], noise: [0, 1], shown: 30,
  rounds: [{ eta: 1.5, gamma: 0, label: 'η 1.5' }, { eta: 1, gamma: 0.8, label: 'γ 0.8' }, { eta: 1.5, gamma: 0.8, label: 'Boltz-2\'s settings' }],
  guess: 0.01, // How close a guess at the rare region must be, as a share.
};
export const padOpt = (eta, gamma) => ({ eta, gamma0: gamma, gammaMin: PAD.gammaMin, lambda: PAD.lambda });
export const logit = (p) => Math.log10(p / (1 - p));
export const oddsMiss = (guess, out) => Math.abs(logit(Math.max(out, 1e-4)) - logit(guess));
