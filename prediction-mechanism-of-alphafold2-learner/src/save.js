// Saved progress. The key is unique to this game: all games on the site share one localStorage.
const KEY = 'prediction-mechanism-of-alphafold2-learner-v1';

export function load() {
  const base = { tier: {}, stage: {}, seen: {}, muted: false, last: 0, lang: 'en' };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return base; }
}
export function store(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* Private browsing can refuse storage. */ }
}
