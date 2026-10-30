// The binding model. A deliberately simple, teachable version of real interface
// energetics: every number is in kcal/mol and every effect has a real counterpart.

export const RESIDUES = {
  G: {code: 'Gly', name: 'Glycine', cls: 'tiny', reach: 0},
  A: {code: 'Ala', name: 'Alanine', cls: 'oily', reach: 1},
  S: {code: 'Ser', name: 'Serine', cls: 'polar', reach: 1},
  D: {code: 'Asp', name: 'Aspartate', cls: 'neg', reach: 1},
  L: {code: 'Leu', name: 'Leucine', cls: 'oily', reach: 2},
  N: {code: 'Asn', name: 'Asparagine', cls: 'polar', reach: 2},
  E: {code: 'Glu', name: 'Glutamate', cls: 'neg', reach: 2},
  K: {code: 'Lys', name: 'Lysine', cls: 'pos', reach: 2},
  F: {code: 'Phe', name: 'Phenylalanine', cls: 'arom', reach: 2},
  Y: {code: 'Tyr', name: 'Tyrosine', cls: 'arom', reach: 2},
  R: {code: 'Arg', name: 'Arginine', cls: 'pos', reach: 3},
  W: {code: 'Trp', name: 'Tryptophan', cls: 'arom', reach: 3},
};

export const CLASS_INFO = {
  pos: {label: 'Positive', glyph: '+'},
  neg: {label: 'Negative', glyph: '−'},
  arom: {label: 'Aromatic ring', glyph: '⬡'},
  oily: {label: 'Oily', glyph: '●'},
  polar: {label: 'Polar', glyph: 'δ'},
  tiny: {label: 'Tiny', glyph: '·'},
};

export const REACH_LABEL = ['none', 'short', 'medium', 'long'];

// Rim loops in the order they sit around the central CDR-H3.
export const RIM = ['H1', 'H2', 'L3', 'L1', 'L2'];
export const CORE = 'H3';
export const LOOPS = [...RIM, CORE];

export const INTERACTIONS = {
  salt: {name: 'Salt bridge', good: true, note: 'A positive and a negative side chain hold on to each other.'},
  cation: {name: 'Cation–π', good: true, note: 'A positive charge rests on the electron cloud of an aromatic ring.'},
  stack: {name: 'Ring stacking', good: true, note: 'Flat aromatic rings pack face to face.'},
  oily: {name: 'Oily contact', good: true, note: 'Oily groups meet, and the ordered water around them is set free. This is the hydrophobic effect.'},
  hbond: {name: 'Hydrogen bond', good: true, note: 'A hydrogen is shared between two polar groups, usually nitrogen or oxygen.'},
  repel: {name: 'Same charge', good: false, note: 'Like charges push apart.'},
  buried: {name: 'Buried polar group', good: false, note: 'A polar or charged group gives up its water and finds no partner. That costs energy.'},
  clash: {name: 'Clash', good: false, note: 'The two side chains are too long for the gap, so their atoms collide.'},
  gap: {name: 'Gap', good: false, note: 'The two side chains are too short to touch, and water stays trapped between them.'},
  none: {name: 'No contact', good: null, note: 'Glycine has no side chain, so it adds nothing here.'},
  crowd: {name: 'Crowded charges', good: false, note: 'Neighboring loops carry the same charge and push on each other.'},
  ring: {name: 'Water sealed out', good: true, note: 'The rim keeps water away from the center, so the central contact counts double. Real interfaces have this O-ring.'},
  entropy: {name: 'Loops freeze', good: false, note: 'Both molecules lose their freedom to wiggle and tumble. Every binding event pays this cost.'},
};

const RT = 0.616; // kcal/mol at 37 °C
export const ENTROPY_COST = 3.0;
const KON = 1e5; // a typical on-rate, 1/(M·s)

function chemistry(p, e) {
  const a = RESIDUES[p].cls, b = RESIDUES[e].cls;
  const has = (x, y) => (a === x && b === y) || (a === y && b === x);
  const tyr = p === 'Y' || e === 'Y';
  if (has('pos', 'neg')) return ['salt', -3.0];
  if (a === b && (a === 'pos' || a === 'neg')) return ['repel', 3.0];
  if (has('pos', 'arom')) return ['cation', -2.2];
  if (a === 'arom' && b === 'arom') return ['stack', -2.6];
  if (has('arom', 'oily') || (a === 'oily' && b === 'oily')) return ['oily', -2.2];
  if (a === 'polar' && b === 'polar') return ['hbond', -1.8];
  if (has('polar', 'pos') || has('polar', 'neg')) return ['hbond', -1.4];
  if (has('arom', 'polar')) return tyr ? ['hbond', -1.6] : ['oily', -0.4];
  if (has('arom', 'neg')) return tyr ? ['hbond', -1.2] : ['buried', 0.4];
  if (has('oily', 'polar')) return ['buried', 0.8];
  if (has('oily', 'pos') || has('oily', 'neg')) return ['buried', 1.6];
  return ['none', 0];
}

export function pairEnergy(p, e) {
  if (!p || p === 'G' || e === 'G') return {kind: 'none', energy: 0, fit: 'none'};
  const sum = RESIDUES[p].reach + RESIDUES[e].reach;
  if (sum >= 6) return {kind: 'clash', energy: 5, fit: 'clash'};
  if (sum === 5) return {kind: 'clash', energy: 2.5, fit: 'clash'};
  if (sum <= 2) return {kind: 'gap', energy: 0.8, fit: 'gap'};
  const [kind, energy] = chemistry(p, e);
  if (sum === 4) return {kind, energy, fit: 'snug'};
  return {kind, energy: energy < 0 ? energy / 2 : energy, fit: 'loose'};
}

const neighbours = [['H1', 'H2'], ['H2', 'L3'], ['L3', 'L1'], ['L1', 'L2'], ['L2', 'H1'], ...RIM.map(l => [l, CORE])];

// paratope and epitope map a loop name to a one-letter residue.
export function evaluate(paratope, epitope, {ring = false, crowd = true} = {}) {
  const steps = [];
  const pairs = {};
  let total = 0;
  const addStep = step => { steps.push(step); total += step.energy; };

  for (const loop of LOOPS) {
    const pair = pairEnergy(paratope[loop], epitope[loop]);
    pairs[loop] = pair;
    addStep({type: 'pair', loop, ...pair});
  }
  if (crowd) {
    for (const [x, y] of neighbours) {
      const a = paratope[x] && RESIDUES[paratope[x]].cls, b = paratope[y] && RESIDUES[paratope[y]].cls;
      if (a === b && (a === 'pos' || a === 'neg')) addStep({type: 'crowd', loop: x, other: y, kind: 'crowd', energy: 0.8});
    }
  }
  const sealed = ring && RIM.every(l => pairs[l].fit === 'snug');
  if (sealed && pairs[CORE].energy < 0) addStep({type: 'ring', loop: CORE, kind: 'ring', energy: pairs[CORE].energy});
  addStep({type: 'entropy', kind: 'entropy', energy: ENTROPY_COST});

  const kd = Math.exp(total / RT);
  return {steps, pairs, total, kd, sealed, residence: 1 / (KON * kd)};
}

export const kdFromEnergy = energy => Math.exp(energy / RT);

export function formatKd(kd) {
  if (kd >= 1) return 'no binding';
  const units = [[1e-3, 'mM'], [1e-6, 'µM'], [1e-9, 'nM'], [1e-12, 'pM'], [1e-15, 'fM']];
  for (const [scale, unit] of units) {
    if (kd >= scale) {
      const v = kd / scale;
      return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${unit}`;
    }
  }
  return `${(kd / 1e-15).toFixed(2)} fM`;
}

export function formatDuration(seconds) {
  const steps = [[86400 * 365, 'year'], [86400 * 30, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
  if (seconds < 0.001) return 'under a millisecond';
  if (seconds < 1) return `about ${Math.round(seconds * 1000)} milliseconds`;
  for (const [scale, unit] of steps) {
    if (seconds >= scale) {
      const n = Math.round(seconds / scale);
      return `about ${n} ${unit}${n === 1 ? '' : 's'}`;
    }
  }
  return `about ${seconds} seconds`;
}

// Every way of placing the hand on the open loops. Used for star targets and tests.
export function* assignments(open, hand) {
  const used = new Array(hand.length).fill(false);
  const chosen = {};
  function* walk(i) {
    if (i === open.length) { yield {...chosen}; return; }
    const seen = new Set();
    for (let t = 0; t < hand.length; t++) {
      if (used[t] || seen.has(hand[t])) continue;
      seen.add(hand[t]);
      used[t] = true;
      chosen[open[i]] = hand[t];
      yield* walk(i + 1);
      used[t] = false;
    }
  }
  yield* walk(0);
}
