// How each amino acid is asked. Pure logic, no drawing, so it can be tested with node.
import { AA, CODES, LOOKALIKES } from './data/amino.js';

// The ladder for one amino acid. Getting one right moves it a rung up.
export const LADDER = ['label', 'name', 'three', 'one', 'clue', 'recall'];
export const TOP = LADDER.length; // reached after answering a recall correctly
const MIN_GAP = 4; // codons between two promotions, so one protein cannot max out a residue

export const newLearner = () => ({
  tick: 0,
  aa: Object.fromEntries(CODES.map((c) => [c, { m: 0, right: 0, wrong: 0, last: -99 }])),
});

export const kindOf = (learner, code) => LADDER[Math.min(learner.aa[code].m, TOP - 1)];

export const mastery = (learner, code) => learner.aa[code].m / TOP;

const shuffle = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function distractors(code, count, hard, levelSet, rng) {
  const out = [];
  const take = (list) => {
    for (const c of shuffle(list, rng)) {
      if (out.length < count && c !== code && !out.includes(c)) out.push(c);
    }
  };
  if (hard) take(LOOKALIKES[code]);
  else {
    // Early on, keep obvious look-alikes out so the shapes can be told apart.
    const near = LOOKALIKES[code];
    take(levelSet.filter((c) => !near.includes(c)));
  }
  take(levelSet);
  take(CODES.filter((c) => !LOOKALIKES[code].includes(c)));
  return out;
}

export function buildQuestion(code, learner, levelSet, rng = Math.random) {
  const kind = kindOf(learner, code);
  const info = AA[code];
  const count = kind === 'label' || kind === 'name' ? 3 : 4;
  const hard = learner.aa[code].m >= 2;
  const options = shuffle([code, ...distractors(code, count - 1, hard, levelSet, rng)], rng);
  const prompt = { label: info.name, name: info.name, three: info.three, one: info.code, clue: info.clue, recall: 'Name this one' }[kind];
  return { code, kind, options, prompt, labelled: kind === 'label', recall: kind === 'recall' };
}

export function record(learner, code, correct) {
  learner.tick += 1;
  const s = learner.aa[code];
  if (correct) {
    s.right += 1;
    if (s.m === 0 || learner.tick - s.last >= MIN_GAP) {
      s.m = Math.min(TOP, s.m + 1);
      s.last = learner.tick;
    }
  } else {
    s.wrong += 1;
    s.m = Math.max(0, s.m - 1);
  }
}

// A practice chain that leans toward the amino acids furthest from mastered.
export function practiceSequence(learner, length, rng = Math.random) {
  const weight = CODES.map((c) => 1 + (TOP - learner.aa[c].m) ** 2);
  const total = weight.reduce((a, b) => a + b, 0);
  let seq = '';
  while (seq.length < length) {
    let r = rng() * total;
    let pick = CODES[0];
    for (let i = 0; i < CODES.length; i++) {
      r -= weight[i];
      if (r <= 0) { pick = CODES[i]; break; }
    }
    if (pick !== seq[seq.length - 1]) seq += pick;
  }
  return seq;
}

export function resultFor(errors, length) {
  if (errors === 0) return { name: 'Native fold', note: 'Every residue right the first time.' };
  if (errors <= Math.max(1, length * 0.12)) return { name: 'Folded', note: 'A few corrections, and it still found its shape.' };
  return { name: 'Molten globule', note: 'Compact but loose. Build it again to tighten it up.' };
}
