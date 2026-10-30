// Solves every lesson by brute force and reports how hard each one is.
import {evaluate, assignments, LOOPS, formatKd, RESIDUES} from '../src/rules.js';
import {LESSONS} from '../src/levels.js';

let failed = false;
for (const lv of LESSONS) {
  const open = LOOPS.filter(l => !lv.locked[l]);
  const results = [];
  for (const a of assignments(open, lv.hand)) {
    const para = {...lv.locked, ...a};
    const r = evaluate(para, lv.epitope, lv);
    const s = lv.self ? evaluate(para, lv.self, lv) : null;
    const ok = r.kd <= lv.target && (!s || s.kd >= lv.selfFloor);
    results.push({para, r, s, ok});
  }
  const wins = results.filter(x => x.ok);
  const best = wins.sort((x, y) => x.r.kd - y.r.kd)[0];
  const pct = (100 * wins.length / results.length).toFixed(1);
  console.log(`${lv.id.padEnd(7)} open ${open.length} hand ${lv.hand.length}: ${wins.length}/${results.length} win (${pct}%)  target ${formatKd(lv.target)}`);
  if (!best) { console.log('  UNSOLVABLE. Tightest overall:', formatKd(Math.min(...results.map(x => x.r.kd)))); failed = true; continue; }
  const seq = LOOPS.map(l => `${l}:${RESIDUES[best.para[l]].code}`).join(' ');
  console.log(`  best ${formatKd(best.r.kd)}${best.s ? ` self ${formatKd(best.s.kd)}` : ''} ${best.r.sealed ? 'sealed' : ''}  ${seq}`);
  console.log(`  random placement wins ${pct}%`);
}
process.exit(failed ? 1 : 0);
