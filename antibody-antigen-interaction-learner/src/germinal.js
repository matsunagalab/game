// Germinal center: rounds of mutation and selection, as B cells do in a lymph node.
// The run is pure logic so it can be tested without a browser.
import {RESIDUES, LOOPS, evaluate, ENTROPY_COST} from './rules.js';

export const ROUNDS = 6;
export const STEP = 0.85; // how much tighter (kcal/mol) the competition gets each round
const CHOICES = Object.keys(RESIDUES).filter(a => a !== 'G');
const pick = (list, rand) => list[Math.floor(rand() * list.length)];

export function newRun(rand = Math.random) {
  for (;;) {
    const epitope = {}, paratope = {};
    for (const l of LOOPS) epitope[l] = pick(CHOICES, rand);
    for (const l of LOOPS) paratope[l] = pick(CHOICES, rand);
    const e = evaluate(paratope, epitope, {ring: true});
    if (e.total < -6.5 && e.total > -9.2) return {epitope, paratope, round: 1, start: e.total, history: [e.total]};
  }
}

export const required = run => run.start - STEP * run.round;

export function mutant(run, offer) {
  return {...run.paratope, [offer.loop]: offer.to};
}

// Three candidate mutations. Most real mutations do nothing or hurt; one here always helps.
export function offers(run, rand = Math.random) {
  const base = evaluate(run.paratope, run.epitope, {ring: true}).total;
  const all = [];
  for (const loop of LOOPS) {
    for (const to of CHOICES) {
      if (to === run.paratope[loop]) continue;
      const offer = {loop, from: run.paratope[loop], to};
      offer.delta = evaluate(mutant(run, offer), run.epitope, {ring: true}).total - base;
      all.push(offer);
    }
  }
  all.sort((a, b) => a.delta - b.delta);
  const good = all.filter(o => o.delta <= -0.8);
  const fine = all.filter(o => Math.abs(o.delta) < 0.8);
  const harmful = all.filter(o => o.delta >= 0.8);
  const hand = [];
  const take = list => {
    const free = list.filter(o => !hand.some(h => h.loop === o.loop));
    if (free.length) hand.push(pick(free, rand));
  };
  take(good.slice(0, Math.max(3, Math.ceil(good.length * 0.4))));
  take(harmful);
  take(rand() < 0.5 && fine.length ? fine : harmful);
  take(fine);
  while (hand.length < 3) take(all);
  hand.length = 3;
  for (let i = hand.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [hand[i], hand[j]] = [hand[j], hand[i]];
  }
  return hand;
}

export const ENTROPY = ENTROPY_COST;
