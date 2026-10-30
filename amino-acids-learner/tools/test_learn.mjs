// node tools/test_learn.mjs
import assert from 'node:assert/strict';
import { AA, CODES, LOOKALIKES, PROTEINS, STOP_CODONS } from '../src/data/amino.js';
import { buildQuestion, kindOf, LADDER, newLearner, practiceSequence, record, resultFor, TOP } from '../src/learn.js';

let seed = 1;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Data integrity
assert.equal(CODES.length, 20);
assert.equal(new Set(CODES.map((c) => AA[c].three)).size, 20);
const allCodons = CODES.flatMap((c) => AA[c].codons).concat(STOP_CODONS);
assert.equal(allCodons.length, 64, 'the genetic code has 64 codons');
assert.equal(new Set(allCodons).size, 64, 'no codon is used twice');
for (const c of CODES) for (const l of LOOKALIKES[c]) assert.ok(AA[l], `${c} look-alike ${l}`);
for (const p of PROTEINS) assert.ok(p.about.length > 20);

// Every question has the answer once, no repeats, and the right size
for (const c of CODES) {
  for (let m = 0; m <= TOP; m++) {
    const learner = newLearner();
    learner.aa[c].m = m;
    for (let i = 0; i < 200; i++) {
      const q = buildQuestion(c, learner, ['G', 'A', 'W'], rng);
      assert.equal(q.options.filter((o) => o === c).length, 1);
      assert.equal(new Set(q.options).size, q.options.length);
      assert.equal(q.options.length, m < 2 ? 3 : 4);
    }
  }
}

// Early questions avoid look-alikes, later ones use them
{
  const learner = newLearner();
  learner.aa.D.m = 1;
  const early = Array.from({ length: 200 }, () => buildQuestion('D', learner, 'GYDPETW'.split(''), rng));
  assert.ok(early.every((q) => !q.options.includes('E')), 'early Asp question must not offer Glu');
  learner.aa.D.m = 3;
  const late = Array.from({ length: 200 }, () => buildQuestion('D', learner, 'GYDPETW'.split(''), rng));
  assert.ok(late.some((q) => q.options.includes('E') && q.options.includes('N')), 'late Asp question offers look-alikes');
}

// The ladder climbs with spacing and drops on error
{
  const l = newLearner();
  assert.equal(kindOf(l, 'W'), 'label');
  record(l, 'W', true);
  assert.equal(kindOf(l, 'W'), 'name');
  record(l, 'W', true);
  assert.equal(kindOf(l, 'W'), 'name', 'no promotion right after the last one');
  for (let i = 0; i < 4; i++) record(l, 'G', true);
  record(l, 'W', true);
  assert.equal(kindOf(l, 'W'), 'three');
  record(l, 'W', false);
  assert.equal(kindOf(l, 'W'), 'name');
  assert.deepEqual(LADDER.length, TOP);
}

// Practice leans to weak amino acids and never repeats a letter back to back
{
  const l = newLearner();
  for (const c of CODES) l.aa[c].m = TOP;
  l.aa.W.m = 0;
  const s = practiceSequence(l, 2000, rng);
  assert.ok(!/(.)\1/.test(s));
  assert.ok(s.split('W').length - 1 > 2000 / 40, 'W must show up more than a uniform pick');
}

assert.equal(resultFor(0, 20).name, 'Native fold');
assert.equal(resultFor(2, 20).name, 'Folded');
assert.equal(resultFor(9, 20).name, 'Molten globule');
assert.equal(resultFor(1, 10).name, 'Folded');

console.log('learn tests passed');
