// Three leaves of gold for each chapter.
//  1: the mechanism is drawn.
//  2: the strategy is solved as well.
//  3: understanding. No hints in the mechanism, and the experiment was predicted.
export function tierFor({ mechanism, strategy, hints, predicted }) {
  if (!mechanism) return 0;
  if (!strategy) return 1;
  if (hints > 0 || !predicted) return 2;
  return 3;
}

// A prediction on a log dial counts within this many decades of the measured value.
export const nearLog = (guess, truth, decades = 1) => Math.abs(Math.log10(guess) - Math.log10(truth)) <= decades;

export const SAVE_KEY = 'mechanisms-catalytic-learner-v1';
export function blankSave() { return { tiers: {}, muted: false, last: 0 }; }
export function bestTier(save, key, tier) { save.tiers[key] = Math.max(save.tiers[key] || 0, tier); return save; }
