// Tests of the screen-free logic. node tools/test.mjs
import assert from 'node:assert/strict';
import * as C from '../src/logic/code.js';
import * as S from '../src/logic/seqs.js';
import * as H from '../src/logic/hydro.js';
import * as P from '../src/logic/proofread.js';
import * as R from '../src/logic/ras.js';
import * as A from '../src/logic/atpase.js';
import * as M from '../src/logic/membrane.js';
import * as K from '../src/logic/kinesin.js';
import * as D from '../src/logic/mitosis.js';
import * as L from '../src/logic/cell.js';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok', name); };

t('genetic code has 61 sense codons and three stops', () => {
  const all = C.allCodons();
  assert.equal(all.length, 64);
  assert.equal(all.filter((c) => C.translateCodon(c) === '*').sort().join(), 'UAA,UAG,UGA');
  assert.equal(C.translateCodon('AUG'), 'M');
  assert.equal(C.translateCodon('UGG'), 'W');
  const counts = {};
  all.forEach((c) => { const a = C.translateCodon(c); counts[a] = (counts[a] ?? 0) + 1; });
  assert.deepEqual([counts.L, counts.S, counts.R, counts.M, counts.W, counts.I], [6, 6, 6, 1, 1, 3]);
});
t('real CCND1 exon 1 translates to the UniProt protein', () => {
  const p = C.translate(C.toRNA(S.CCND1_EXON1_CDS));
  assert.equal(p.slice(0, 44), S.PROTEINS.CCND1.seq.slice(0, 44));
  assert.equal(p.length, 66);
  assert.ok(!p.includes('*'));
});
t('exon junction keeps the reading frame: ...MLE then VCEE', () => {
  const joined = S.CCND1_EXON1_CDS + S.CCND1_ACCEPTOR.exon;
  assert.ok(C.translate(C.toRNA(joined)).includes('MLEVCEE'));
});
t('intron starts GT and ends AG', () => {
  assert.ok(S.CCND1_DONOR.intron.startsWith('GT'));
  assert.ok(S.CCND1_ACCEPTOR.intron.endsWith('AG'));
});
t('template complement round trip', () => {
  const tpl = C.templateOf('ATGGAACAC');
  assert.equal(tpl, 'TACCTTGTG');
  assert.equal([...tpl].map(C.rnaFromTemplate).join(''), 'AUGGAACAC');
});
t('anticodon classes and wobble', () => {
  assert.equal(C.perfectAnticodon('AUG'), 'CAU');
  assert.equal(C.classify('AUG', 'CAU'), 'cognate');
  assert.equal(C.classify('GAU', 'GUC'), 'cognate');
  assert.equal(C.classify('GAU', 'AUC'), 'cognate');
  assert.equal(C.classify('UUU', 'GAA'), 'cognate'); // G:U wobble at the third base
  assert.equal(C.classify('UUG', 'GAA'), 'near');
  assert.equal(C.classify('AUG', 'GGG'), 'non');
  assert.equal(C.classify('AUG', 'UAU'), 'near'); // No normal U34 tRNA reads Met through wobble.
  assert.equal(C.classify('UGG', 'UCA'), 'near');
  assert.equal(C.classify('UUG', 'UAA'), 'cognate'); // U·G within the Leu family.
  assert.equal(C.mismatchAt('GAA', 'UUC'), -1);
  assert.equal(C.mismatchAt('GAA', 'UUA'), 0);
  for (const k of ['cognate', 'near', 'non']) for (const c of C.allCodons()) {
    if (C.translateCodon(c) !== '*') assert.equal(C.classify(c, C.tRNAFor(c, k)), k, `${c} ${k}`);
  }
});
t('signal peptide rule sorts the real proteins correctly', () => {
  for (const [k, v] of Object.entries(S.PROTEINS)) assert.equal(H.looksLikeSignal(v.seq), v.signal > 0, k);
});
t('TGF-alpha transmembrane peak falls inside the UniProt segment', () => {
  const p = H.tmPeak(S.PROTEINS.TGFA.seq.slice(24));
  const start = p.at + 24;
  assert.ok(p.value > 1.6);
  assert.ok(start >= 95 && start + 18 <= 126, `start ${start}`);
});
t('proofreading multiplies', () => {
  assert.ok(Math.abs(P.hopfieldError(0.01) - 1e-4) < 1e-12);
  assert.ok(Math.abs(P.chainErrors(1e-3, 295) - 0.2556) < 0.01);
  // Independent escapes: the tallies come out as the product, without the product being computed anywhere.
  let seed = 1;
  const roll = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const r = P.runChecks(400000, 0.2, 0.1, roll);
  assert.ok(Math.abs(r.pass1 / r.seen1 - 0.2) < 0.005);
  assert.ok(Math.abs(r.pass2 / r.seen2 - 0.1) < 0.01);
  assert.ok(Math.abs(P.together(r).n - 50) < 4, `${P.together(r).n}`);
  assert.deepEqual(P.together({ seen1: 40, pass1: 4, seen2: 4, pass2: 0 }), { none: true, n: 40 });
  // Played frame by frame, a wrong tRNA that has passed check one is no likelier to pass check two.
  const play = (rates) => {
    const dt = 1 / 60;
    const once = (t) => { for (let i = 0; i < 20000; i++) { P.stepLook(t, dt, roll); if (P.lookFires(t, rates, dt, roll)) return true; if (roll() < rates.off * dt) return false; } return false; };
    let n1 = 0; let n2 = 0; const N = 60000;
    for (let i = 0; i < N; i++) { const t = { look: 0 }; if (once(t)) { n1 += 1; t.look = 0; if (once(t)) n2 += 1; } }
    return [n1 / N, n2 / n1];
  };
  for (const rates of [P.RATES.slow, P.RATES.fast]) {
    const [a, b] = play(rates);
    assert.ok(Math.abs(a - b) < 0.2 * a, `independent ${a} ${b}`);
    assert.ok(Math.abs(a - P.passBad(rates)) < 0.2 * a, `analytic ${a} ${P.passBad(rates)}`);
  }
  // A correct helix fires sooner than a wrong one, and hurrying lets more wrong tRNAs through.
  const f = (r2, k) => P.passFraction(P.forwardRate(r2, k), P.offRate(r2, k));
  assert.ok(P.RATES.slow.good > 10 * P.RATES.slow.bad);
  assert.ok(P.passBad(P.RATES.fast) > 5 * P.passBad(P.RATES.slow));
  assert.ok(f(P.RATES.slow, 'third') > P.passBad(P.RATES.slow));
});
t('cascade amplifies and GAP fold is 10^5', () => {
  let s = { raf: 0, mek: 0, erk: 0 };
  for (let i = 0; i < 2000; i++) s = R.stepCascade(s, 0.4, 0.016);
  assert.ok(s.erk > 0.7, `${s.erk}`);
  assert.ok(R.gapFold() > 5e4 && R.gapFold() < 2e5);
});
t('ATP synthase gearing', () => {
  assert.ok(Math.abs(A.hPerATP(8) - 8 / 3) < 1e-9);
  assert.ok(A.stallPmf(8) > A.stallPmf(10) && A.stallPmf(10) > A.stallPmf(14));
  assert.ok(A.stallPmf(8) > 180 && A.stallPmf(8) < 220);
  assert.equal(A.stepAngle(8), 45);
  assert.ok(Math.abs(A.atpPerNADH(8) - 2.73) < 0.02);
});
t('sustained ERK stabilises Fos and a pulse does not', () => {
  const run = (on) => { let f = R.newFos(); for (let t = 0; t < 40; t += 0.02) f = R.stepFos(f, t < on ? 0.8 : 0, 0.02); return f.stable; };
  assert.ok(run(30) > 0.8, `${run(30)}`);
  assert.ok(run(7) < 0.25, `${run(7)}`);
  assert.ok(run(40) > run(30));
});
t('the cell carries its state', () => {
  assert.ok(L.atpRate(100) === 1 && L.atpRate(0) === 0.35);
  assert.equal(L.delayHours(1), 0);
  assert.equal(L.delayHours(0), 6);
  assert.ok(L.stockFrom(26, 0) > 2 * L.stockFrom(55, 2));
  const c = L.newCell();
  assert.equal(L.hourOf(7, { ...c, cyclin: 0.1 }), 28);
  assert.equal(L.hourOf(1, { ...c, cyclin: 0.1 }), 1);
  L.spendATP(c, 500);
  assert.equal(c.atp, 0);
  assert.ok(L.swellFrom(100) > L.swellFrom(20));
});
t('Nernst and Goldman give textbook voltages', () => {
  assert.ok(Math.abs(M.nernst(5, 140) + 89) < 1.5);
  const v = M.goldman({ o: 5, i: 140 }, { o: 145, i: 10 });
  assert.ok(v < -60 && v > -75, `${v}`);
});
t('pump moves 3 Na out and 2 K in per ATP, and only in order', () => {
  const p = M.newPump();
  assert.equal(M.pumpEvent(p, 'K'), false);
  assert.equal(M.pumpEvent(p, 'ATP'), false);
  for (let i = 0; i < 3; i++) assert.equal(M.pumpEvent(p, 'Na'), true);
  assert.equal(M.pumpEvent(p, 'Na'), false);
  assert.equal(M.pumpEvent(p, 'ATP'), true);
  assert.equal(p.inner, false);
  assert.equal(M.pumpEvent(p, 'outer'), true);
  assert.equal(p.state, 'E2P');
  M.pumpEvent(p, 'K'); M.pumpEvent(p, 'K');
  assert.equal(p.outer, false);
  assert.equal(M.pumpEvent(p, 'inner'), true);
  assert.equal(p.state, 'E1');
  assert.equal(p.cycles, 1);
  assert.equal(p.atp, 1);
});
t('two gates are never open together', () => {
  const p = M.newPump();
  assert.equal(M.pumpEvent(p, 'outer'), 'collapse');
  assert.equal(p.collapses, 1);
  M.resetPump(p);
  for (let i = 0; i < 3; i++) M.pumpEvent(p, 'Na');
  M.pumpEvent(p, 'ATP'); M.pumpEvent(p, 'outer');
  assert.equal(M.pumpEvent(p, 'inner'), 'collapse');
  for (const q of [p]) assert.ok(q.outer && q.inner === false);
});
t('kinesin: 8 nm for the body, 16 nm for each head, one ATP per step', () => {
  const w = K.newWalker();
  for (let i = 0; i < 10; i++) {
    assert.equal(K.releasePi(w), false);
    const before = w.heads.map((h) => h.nm);
    assert.ok(K.bindATP(w));
    assert.equal(K.bindATP(w), false);
    const moved = w.heads.map((h, j) => h.nm - before[j]).filter((d) => d !== 0);
    assert.deepEqual(moved.length, 1);
    assert.equal(moved[0], 16);
    assert.ok(K.releasePi(w));
  }
  assert.equal(w.pos, 80);
  assert.equal(w.atp, 10);
});
t('anaphase locks', () => {
  assert.equal(D.canDegrade(3), false);
  assert.equal(D.canDegrade(4), true);
  assert.equal(D.checkpointSatisfied([{ a: 'n', b: 's' }, { a: 'n', b: 'n' }]), false);
  assert.equal(D.checkpointSatisfied([{ a: 'n', b: 's' }]), true);
  assert.equal(D.separaseActive(1), false);
});
t('the real splice donor is the best U1 match in the window shown', () => {
  const rna = C.toRNA(S.CCND1_DONOR.exon + S.CCND1_DONOR.intron);
  const best = S.u1Scores(rna);
  assert.equal(best.indexOf(Math.max(...best)), S.CCND1_DONOR.exon.length - 3);
});
console.log(`${n} tests passed`);
