// Simulates germinal center runs to check the difficulty.
import {newRun, offers, required, mutant, ROUNDS} from '../src/germinal.js';
import {evaluate} from '../src/rules.js';

function play(choose) {
  const run = newRun();
  while (run.round <= ROUNDS) {
    const cards = offers(run);
    const pick = choose(cards);
    run.paratope = mutant(run, pick);
    if (evaluate(run.paratope, run.epitope, {ring: true}).total > required(run)) return run.round - 1;
    run.round++;
  }
  return ROUNDS;
}
const N = 4000;
const strategies = {
  'always best of three': c => [...c].sort((a, b) => a.delta - b.delta)[0],
  'right three times in four': c => (Math.random() < 0.75 ? [...c].sort((a, b) => a.delta - b.delta)[0] : c[Math.floor(Math.random() * 3)]),
  'random': c => c[Math.floor(Math.random() * 3)],
};
for (const [name, fn] of Object.entries(strategies)) {
  const results = Array.from({length: N}, () => play(fn));
  const avg = results.reduce((a, b) => a + b) / N;
  const wins = results.filter(r => r === ROUNDS).length;
  console.log(`${name.padEnd(28)} average ${avg.toFixed(2)} of ${ROUNDS} rounds, finished ${(100 * wins / N).toFixed(1)}%`);
}
