// Screen-free tests: electron bookkeeping, reasons for failure, routes, rates, scores, music mapping.
//   node tools/test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MECHS, rnaseWith } from '../src/chem/mechanisms.js';
import { compile, Session } from '../src/chem/session.js';
import { resolveArrow, totalElectrons, totalCharge, problems, sigmaKey, route, hashKey, stepsFrom, initial } from '../src/chem/engine.js';
import { relax } from '../src/chem/relax.js';
import { tryArrow } from '../src/chem/judge.js';
import { protonationPopulations, bellCurve, pHMaximum, iramaLevel, gapSeconds, musicFor, zpeKIE, stretchRatio, formulaMass, kTS, proficiency, rateEnhancement, halfLife, YEAR, series, protonOff, piOverlap, enediolLost, caRate } from '../src/logic/rates.js';
import { tierFor, nearLog, blankSave, bestTier } from '../src/logic/score.js';
import { piece, BALUNGAN, gongSeconds, stepBeats, BEATS_PER_GONG, pulsesPerBeat, hz } from '../src/audio/score.js';
import { CHAPTERS, INHIBITORS, OMP } from '../src/chapters.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = JSON.parse(readFileSync(join(root, 'src/data/sites.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass += 1; else { fail += 1; console.log('  FAIL', msg); } };
const section = (s) => console.log(s);

const built = {};
for (const [k, m] of Object.entries(MECHS)) {
  try { built[k] = compile(m, SITES[k]); ok(true); } catch (e) { fail += 1; console.log('  FAIL compile', k, e.message); }
}

section('Every reference route, arrow by arrow, conserves electrons and charge');
for (const [k, c] of Object.entries(built)) {
  const s = new Session(c);
  const e0 = totalElectrons(s.st), q0 = totalCharge(s.st);
  let arrows = 0;
  for (const step of c.steps) {
    for (const a of step.ref) {
      const m = resolveArrow(s.st, a);
      const v = s.arrow(m);
      arrows += 1;
      if (v.verdict === 'reject') { fail += 1; console.log('  FAIL', k, step.name, JSON.stringify(a), v.code, v.text); break; }
      const cur = s.mid[s.mid.length - 1];
      ok(totalElectrons(cur) === e0, `${k}: electrons changed at "${step.name}"`);
      ok(totalCharge(cur) === q0, `${k}: charge changed at "${step.name}"`);
      if (v.verdict === 'stable') ok(!problems(cur).length, `${k}: unstable state accepted at "${step.name}"`);
    }
    if (s.index < c.steps.length && s.step !== step) continue;
    if (s.step === step) { fail += 1; console.log('  FAIL', k, 'step not finished:', step.name, sigmaKey(s.st) === step.key); break; }
  }
  ok(s.finished, `${k} finished`);
  console.log(`  ${k.padEnd(11)} ${c.steps.length} steps, ${arrows} arrows`);
}

section('Impossible arrows fail with the real reason');
const expectReject = (k, build, code, label) => {
  const s = new Session(built[k]);
  const res = build(s);
  ok(res.verdict === 'reject' && res.code === code, `${label}: got ${res.verdict} ${res.code} "${res.text}"`);
  console.log(`  ${label}: ${res.text}`);
};
const I = (k, id) => built[k].spec.index[id];
// Pentavalent carbon: attack a carbon with four bonds and no way to shed a pair.
{
  // A carbon with four bonds and nothing that can leave. The mini-molecule keeps the point clear.
  const m = { key: 'mini', atoms: [{ id: 'C', el: 'C', lp: 0, x: 3 }, { id: 'H', el: 'H', lp: 0, x: 0 }, { id: 'O', el: 'O', lp: 2, x: 2 }], bonds: [['C', 'H']], steps: [] };
  const c = compile(m, { contacts: [['O', 'C']], protons: [], pos: {} });
  const s = new Session({ ...c, steps: [{ key: 'x', name: 'x' }] });
  const res = s.arrow({ lp: 2, to: 0 });
  ok(res.verdict === 'reject' && res.code === 'over-c', `pentavalent carbon: ${res.code}`);
  console.log(`  pentavalent carbon: ${res.text}`);
}
// No lone pair on carbon.
expectReject('subtilisin', (s) => s.arrow({ lp: I('subtilisin', 'C'), to: I('subtilisin', 'Og') }), 'no-lp', 'no lone pair');
// Far atoms, using the crystal distance.
expectReject('subtilisin', (s) => s.arrow({ lp: I('subtilisin', 'DO2'), to: I('subtilisin', 'C') }), 'too-far', 'too far');
// A proton without a base: strip Ser221's proton where no base can reach. The lone pairs of His are protonated away first.
{
  // An alcohol with no base anywhere near it.
  const m = { key: 'mini', atoms: [{ id: 'O', el: 'O', lp: 2, x: 1 }, { id: 'H', el: 'H', lp: 0, x: 0 }], bonds: [['O', 'H']], steps: [] };
  const c = compile(m, { contacts: [], protons: [], pos: {} }), s = new Session({ ...c, steps: [{ key: 'x', name: 'x' }] });
  const res = s.arrow({ b0: 0, b1: 1, to: 0 });
  ok(res.verdict === 'reject' && res.code === 'bare-proton', `proton without a base: ${res.verdict} ${res.code}`);
  console.log(`  proton without a base: ${res.text}`);
}
// Wrong leaving group: collapse T by throwing out N with the proton already gone from His.
{
  const c = built.subtilisin, s = new Session(c);
  for (const a of c.steps[0].ref) s.arrow(resolveArrow(s.st, a));
  ok(s.index === 1, 'reached the tetrahedral form');
  s.arrow({ lp: I('subtilisin', 'O'), to: I('subtilisin', 'C') });
  const res = s.arrow({ b0: I('subtilisin', 'C'), b1: I('subtilisin', 'N'), to: I('subtilisin', 'N') });
  ok(res.verdict === 'pending' && res.code === 'n-anion', `N- with an acid in reach is repairable: ${res.verdict} ${res.code}`);
  console.log(`  amide anion, acid in reach: ${res.text}`);
  // The same arrow with His's proton gone cannot be repaired.
  const s2 = new Session(c);
  for (const a of c.steps[0].ref) s2.arrow(resolveArrow(s2.st, a));
  const H = I('subtilisin', 'Hg'), Ne = I('subtilisin', 'HNe'), n = c.spec.n;
  s2.st.b[H * n + Ne] = s2.st.b[Ne * n + H] = 0; s2.st.on[H] = 0; s2.st.lp[Ne] = 1;
  s2.mid = [s2.st];
  s2.arrow({ lp: I('subtilisin', 'O'), to: I('subtilisin', 'C') });
  const r2 = s2.arrow({ b0: I('subtilisin', 'C'), b1: I('subtilisin', 'N'), to: I('subtilisin', 'N') });
  ok(r2.verdict === 'reject' && r2.code === 'n-anion', `wrong leaving group: ${r2.verdict} ${r2.code}`);
  console.log(`  wrong leaving group: ${r2.text}`);
}
// A pyrrole-type nitrogen is not a base.
expectReject('subtilisin', (s) => s.arrow({ lp: I('subtilisin', 'HNd'), to: I('subtilisin', 'Hg') }), 'too-far', 'far pyrrole nitrogen');
// The pro-S hydrogen of ethanol cannot reach C4 of NAD+: the rejection comes from measured geometry.
{
  const c = built.adh, s = new Session(c);
  for (const a of c.steps[0].ref) s.arrow(resolveArrow(s.st, a));
  ok(s.index === 1, 'adh relay done');
  s.arrow({ lp: I('adh', 'Oa'), to: I('adh', 'Ca') });
  const res = s.arrow({ b0: I('adh', 'Ca'), b1: I('adh', 'HS'), to: I('adh', 'C4') });
  ok(res.verdict === 'reject' && res.code === 'too-far', `pro-S: ${res.verdict} ${res.code} ${res.text}`);
  console.log(`  pro-S hydrogen: ${res.text}`);
}

section('Five impossible moves the first version accepted');
{
  const mk = (k) => { const c = compile(MECHS[k], SITES[k], {}, null); return { s: new Session(c), I: (id) => c.spec.index[id] }; };
  const no = (label, r) => { ok(r.verdict === 'reject', `${label}: ${r.verdict} ${r.code} ${r.text}`); console.log(`  ${label}: ${r.text}`); };
  { const { s, I } = mk('ompdc'); no('OMPDC N1 pair onto C5, an aziridinium across the ring', s.arrow({ lp: I('N1'), to: I('C5') })); }
  { const { s, I } = mk('ompdc'); no('OMPDC O4 pair onto C5', s.arrow({ lp: I('O4'), to: I('C5') })); }
  { const { s, I } = mk('tim'); no('TIM proton from His95 Nε across to Nδ', s.arrow({ lp: I('HNd'), to: I('HHe') })); }
  { const { s, I } = mk('rnase'); s.arrow({ b0: I('BNd'), b1: I('BHd'), to: I('BNd') }); no('RNase proton across the His119 ring', s.arrow({ lp: I('BNd'), to: I('BHe') })); }
  { const { s, I } = mk('lysozyme'); no('Lysozyme proton O to O on one Glu35 carboxyl', s.arrow({ lp: I('EO1'), to: I('EH') })); }
  // Once carbon is tetrahedral, N and O on it are two bonds apart, so a proton cannot step between them either.
  { const c = compile(MECHS.water, SITES.water), t = new Session(c), I = (id) => c.spec.index[id];
    t.arrow({ lp: I('Oa'), to: I('C') }); t.arrow({ b0: I('C'), b1: I('O'), to: I('O') });
    no('Water: a 1,3 proton shift across the tetrahedral carbon', t.arrow({ lp: I('O'), to: I('Ha1') })); }
  // Arrows may come in any order: breaking a bond first must not open the same 1,3 shift.
  { const c = compile(MECHS.water, SITES.water), t = new Session(c), I = (id) => c.spec.index[id];
    for (const a of c.steps[0].ref) t.arrow(resolveArrow(t.st, a));
    ok(t.index === 1, 'water: at the tetrahedral form');
    t.arrow({ b0: I('C'), b1: I('Oa'), to: I('Oa') });
    no('Water: the same shift, with the bond broken first', t.arrow({ lp: I('Oa'), to: I('Hn') })); }
  // The proton first, the bond after: the end of the step still sees the shift.
  { const c = compile(MECHS.subtilisin, SITES.subtilisin), t = new Session(c), I = (id) => c.spec.index[id];
    t.arrow({ lp: I('O'), to: I('Hg') }); t.arrow({ b0: I('Og'), b1: I('Hg'), to: I('Og') });
    no('Subtilisin: proton to the carbonyl first, then attack', t.arrow({ lp: I('Og'), to: I('C') })); }
  { const c = compile(MECHS.water, SITES.water), t = new Session(c), I = (id) => c.spec.index[id];
    t.arrow({ lp: I('N'), to: I('Ha1') }); t.arrow({ b0: I('Oa'), b1: I('Ha1'), to: I('Oa') });
    no('Water: proton to nitrogen first, then attack', t.arrow({ lp: I('Oa'), to: I('C') })); }
  { const c = compile(MECHS.tim, SITES.tim), t = new Session(c), I = (id) => c.spec.index[id];
    t.arrow({ b0: I('HNe'), b1: I('HHe'), to: I('HNe') }); t.arrow({ b0: I('O2'), b1: I('C2'), to: I('HHe'), keep: I('O2') });
    no('TIM: His95 proton to O2 while His95 attacks C2', t.arrow({ lp: I('HNe'), to: I('C2') })); }
  { const c = compile(MECHS.lysozyme, SITES.lysozyme), t = new Session(c), I = (id) => c.spec.index[id];
    ok(!SITES.lysozyme.protons.some(([a, b]) => [a, b].includes('Oi') && (a === 'DO1' || a === 'DO2' || b === 'DO1' || b === 'DO2')), 'the Glu35 exception does not reach Asp52');
    t.arrow({ lp: I('Oi'), to: I('EH') }); t.arrow({ b0: I('EO2'), b1: I('EH'), to: I('EO2') });
    no('Lysozyme: Glu35 proton on through Oi to Asp52', t.arrow({ lp: I('DO2'), to: I('EH') })); }
  // The charge relay of 1969 is reachable again, and its note appears.
  { const c = compile(MECHS.subtilisin, SITES.subtilisin), t = new Session(c), I = (id) => c.spec.index[id];
    for (const a of c.steps[0].ref) t.arrow(resolveArrow(t.st, a));
    t.arrow({ lp: I('DO2'), to: I('HHd') });
    const r = t.arrow({ b0: I('HNd'), b1: I('HHd'), to: I('HNd') });
    ok(/Kossiakoff/.test(r.note || r.text || ''), `charge relay note: ${r.verdict} ${r.code} ${r.text}`);
    console.log(`  Charge relay at the tetrahedral form: ${r.note || r.text}`); }
  // A 1,2 hydride is described as what it is.
  { const c = compile(MECHS.tim, SITES.tim), t = new Session(c), I = (id) => c.spec.index[id];
    const r = t.arrow({ b0: I('C1'), b1: I('Hc'), to: I('C2'), keep: I('Hc') });
    ok(r.verdict === 'reject' && /hydrogen on carbon/.test(r.text), `1,2 hydride wording: ${r.text}`); }
  { const c = compile(MECHS.subtilisin, SITES.subtilisin), t = new Session(c), I = (id) => c.spec.index[id];
    const r = t.arrow({ b0: I('HNd'), b1: I('HHd'), to: I('HNd') });
    ok(r.verdict === 'reject' && r.code === 'imidazolate', `imidazolate wording: ${r.code}`);
    console.log(`  Stripping His64: ${r.text}`); }
}

{
  const c = compile(MECHS.aat, SITES.aat), t = new Session(c), I = (id) => c.spec.index[id];
  t.arrow({ lp: I('Nz'), to: I('Ha') }); t.arrow({ b0: I('Ha'), b1: I('Ca'), to: I('Ca') });
  const r = t.arrow({ lp: I('Ca'), to: I('O3') });
  ok(r.verdict === 'reject' && r.code === 'full-atom', `a carbanion cannot bond to a full oxygen: ${r.verdict} ${r.code}`);
  const hint = t.peekArrow();
  ok(hint && hint.to === I('Ni'), 'the hint spreads electrons along the Schiff base');
  console.log(`  Carbanion onto a full oxygen: ${r.text}`);
}

section('Other routes are accepted');
{
  const c = built.subtilisin, s = new Session(c);
  // Arrows in another order reach the same tetrahedral form.
  s.arrow({ b0: I('subtilisin', 'C'), b1: I('subtilisin', 'O'), to: I('subtilisin', 'O') });
  s.arrow({ lp: I('subtilisin', 'Og'), to: I('subtilisin', 'C') });
  s.arrow({ b0: I('subtilisin', 'Og'), b1: I('subtilisin', 'Hg'), to: I('subtilisin', 'Og') });
  const res = s.arrow({ lp: I('subtilisin', 'HNe'), to: I('subtilisin', 'Hg') });
  ok(res.stepDone, `reverse order reaches the same intermediate: ${res.verdict} ${res.code}`);
  // A stepwise route: protonate N first, then collapse.
  const a = s.arrow({ lp: I('subtilisin', 'N'), to: I('subtilisin', 'Hg') });
  const b = s.arrow({ b0: I('subtilisin', 'HNe'), b1: I('subtilisin', 'Hg'), to: I('subtilisin', 'HNe') });
  ok(b.verdict === 'stable' && !b.stepDone, `protonate N first: ${a.verdict}, ${b.verdict}`);
  s.arrow({ lp: I('subtilisin', 'O'), to: I('subtilisin', 'C') });
  const c2 = s.arrow({ b0: I('subtilisin', 'C'), b1: I('subtilisin', 'N'), to: I('subtilisin', 'N') });
  ok(c2.stepDone, `then collapse: ${c2.verdict} ${c2.code} ${c2.text}`);
}
{
  // TIM: the classical route and the criss-cross route both reach GAP.
  const c = built.tim, s = new Session(c);
  for (const a of c.steps[0].ref) s.arrow(resolveArrow(s.st, a));
  const t0 = performance.now();
  const r = route(s.st, c.steps[2].key, 3);
  console.log(`  TIM route search ${(performance.now() - t0).toFixed(0)} ms, ${r ? r.length : 'no'} steps`);
  ok(r, 'TIM has a route from the enediolate to GAP');
}
{
  // Phosphate elimination is legal chemistry: the danger the loop guards against.
  const c = built.tim, s = new Session(c);
  for (const a of c.steps[0].ref) s.arrow(resolveArrow(s.st, a));
  const lp = I('tim', 'O1'), C1 = I('tim', 'C1'), C2 = I('tim', 'C2'), C3 = I('tim', 'C3'), Op = I('tim', 'Op');
  s.arrow({ lp, to: C1 });
  s.arrow({ b0: C1, b1: C2, t0: C2, t1: C3 });
  const res = s.arrow({ b0: C3, b1: Op, to: Op });
  ok(res.trap, `elimination is legal and flagged: ${res.verdict} ${res.code} ${res.text}`);
  console.log(`  TIM side reaction: ${res.text}`);
}
{
  // Lysozyme: both the covalent and the oxocarbenium route are legal.
  const c = built.lysozyme, a = new Session(c), b = new Session(c);
  for (const x of c.steps[0].ref) var ra = a.arrow(resolveArrow(a.st, x));
  ok(ra.stepDone, 'covalent route');
  ok(c.steps[0].altKeys.length === 1, 'an alternative is declared');
  const refs = c.mech.steps[0].alt[0];
  for (const x of refs) var rb = b.arrow(resolveArrow(b.st, x));
  ok(rb.stepDone, `oxocarbenium route: ${rb.verdict} ${rb.code} ${rb.text}`);
}

section('Structures say what the chapters say');
{
  const near = (k, a, b, max) => { const p = SITES[k].pos[a], q = SITES[k].pos[b], d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); ok(d <= max, `${k} ${a}-${b} ${d.toFixed(2)} > ${max}`); return d; };
  near('subtilisin', 'Og', 'C', 3.0); near('subtilisin', 'HNe', 'Og', 3.0); near('subtilisin', 'HNd', 'DO2', 3.0);
  near('ca', 'Zn', 'Oz', 2.2); near('tim', 'HNe', 'O2', 3.0); near('aat', 'Nz', 'Ca', 3.7); near('lysozyme', 'C1', 'DO2', 1.6); near('ompdc', 'Nz', 'C6', 3.7);
  ok(SITES.rnase.inline >= 160, `RNase attack is in line: ${SITES.rnase.inline}°`);
  near('rnase', 'ANe', 'O2', 3.2); near('rnase', 'BNd', 'O5', 3.2);
  ok(!SITES.rnase.protons.some(([a, b]) => [a, b].includes('O2') && [a, b].includes('O5')), 'phosphorus blocks the O2′ to O5′ hop by geometry');
  {
    // Lysozyme's leaving oxygen stays behind C1, opposite Asp52, once the model relaxes.
    const c = built.lysozyme, st = initial(c.spec), q = relax(st, SITES.lysozyme.pos, SITES.lysozyme.pos);
    const v = (a, b) => [0, 1, 2].map((k) => q[a][k] - q[b][k]), dot = (u, w) => u.reduce((m, x, i) => m + x * w[i], 0), len = (u) => Math.hypot(...u);
    const u = v('DO2', 'C1'), w = v('Oi', 'C1'), ang = Math.acos(dot(u, w) / (len(u) * len(w))) * 180 / Math.PI;
    ok(ang > 140, `lysozyme OD2…C1…Oi after relax ${ang.toFixed(0)}°`);
    console.log(`  Lysozyme OD2…C1…Oi after relax: ${ang.toFixed(0)}°, modelled, with one disclosed hop of ${SITES.lysozyme.oiGlu} Å.`);
  }
  ok(SITES.adh.hydride[0] < 3.1 && SITES.adh.hydride[1] > 3.1, 'only the pro-R hydrogen reaches C4');
  ok(SITES.aat.dun.crystal.h < SITES.aat.dun.crystal.c && SITES.aat.dun.crystal.h < SITES.aat.dun.crystal.cb, 'the Cα–H bond is the one nearest the ring normal in 1ARG');
  console.log(`  ADH H to C4: pro-R ${SITES.adh.hydride[0]} Å, pro-S ${SITES.adh.hydride[1]} Å. AAT C–H ${SITES.aat.dun.crystal.h}° from the ring normal.`);
}

section('Route network');
{
  const routes = JSON.parse(readFileSync(join(root, 'src/data/routes.json'), 'utf8'));
  for (const [k, c] of Object.entries(built)) c.steps.forEach((st, i) => ok(routes[k][i]?.includes(hashKey(st.key)), `${k} step ${i}: target on the network`));
  const ok1 = Object.entries(routes.combos).filter(([, v]) => v.ok).map(([x]) => x);
  ok(ok1.length === 1 && ok1[0] === 'HID/HIP', `under this game's rules one protonation state cleaves RNA, found ${ok1}`);
  // That result comes from our rules, and the screen says so. Without the rule on phosphoryl oxygens it no longer holds.
  const cleaves = (m, site = SITES.rnase) => {
    const c = compile(m, site), st0 = initial(c.spec), n = c.spec.n, P = c.spec.index.P, O5 = c.spec.index.O5, O2 = c.spec.index.O2;
    const seen = new Set([sigmaKey(st0)]); let front = [st0];
    for (let d = 0; d < 3; d++) { const next = []; for (const st of front) for (const [k, v] of stepsFrom(st)) { if (seen.has(k)) continue; seen.add(k); if (!v.st.b[P * n + O5] && v.st.b[P * n + O2]) return true; next.push(v.st); } front = next.slice(0, 60); }
    return false;
  };
  const loose = (a, b) => { const m = rnaseWith(a, b); return { ...m, atoms: m.atoms.map((x) => ({ ...x, noH: false })) }; };
  const withRule = ['HID/HIE', 'HID/HIP', 'HIP/HIE', 'HIP/HIP'].filter((x) => cleaves(rnaseWith(...x.split('/')))).length;
  const withoutRule = ['HID/HIE', 'HID/HIP', 'HIP/HIE', 'HIP/HIP'].filter((x) => cleaves(loose(...x.split('/')))).length;
  ok(withRule === 1 && withoutRule > 1, `rules matter: ${withRule} of 4 with the rule, ${withoutRule} of 4 without`);
  console.log(`  RNase states that cleave: ${withRule} of 4 with the phosphoryl rule, ${withoutRule} of 4 without it.`);
  // The block on crossing phosphorus is a hand choice too.
  const open = { ...SITES.rnase, protons: [...SITES.rnase.protons, ['O2', 'O5']] };
  const withoutBlock = ['HID/HIE', 'HID/HIP', 'HIP/HIE', 'HIP/HIP'].filter((x) => cleaves(rnaseWith(...x.split('/')), open)).length;
  ok(withoutBlock === 4, `without the phosphorus block every state passes: ${withoutBlock} of 4`);
  for (const [x, v] of Object.entries(routes.combos)) console.log(`  ${x}: ${v.ok ? 'cleaves' : v.reason}`);
  ok(built.tim.steps.length === 3 && routes.tim[2].length > 3, 'TIM has more than one route');
}

section('Chapter text matches the chemistry');
for (const ch of CHAPTERS) {
  ok(MECHS[ch.key], `${ch.key} has a mechanism`);
  ok(ch.steps.length === MECHS[ch.key].steps.length, `${ch.key}: ${ch.steps.length} texts for ${MECHS[ch.key].steps.length} steps`);
  ok(ch.evidence.some((e) => e.key), `${ch.key}: has a key prediction`);
  for (const e of ch.evidence) if (e.type === 'dial') ok(e.truth >= e.min && e.truth <= e.max, `${ch.key} dial range`);
}

section('Rates and populations');
const close = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
{
  const curve = bellCurve(5.8, 6.2), top = curve.reduce((m, p) => (p[1] > m[1] ? p : m));
  close(top[0], 6.0, 0.03, 'the bell peaks at pH 6.0, as RNase A does');
  close(pHMaximum(5.8, 6.2), 6.0, 1e-9, 'pH maximum');
  const f = protonationPopulations(6, 6, 6); close(f.active, 0.25, 1e-9, 'two half-titrated groups');
  ok(protonationPopulations(9, 5.8, 6.2).active < 0.002 && protonationPopulations(3, 5.8, 6.2).active < 0.002, 'both limbs fall');
  // Swapping the two pKa values keeps the shape and the peak. Only the height changes.
  const swapRatio = (pH) => protonationPopulations(pH, 5.8, 6.2).active / protonationPopulations(pH, 6.2, 5.8).active;
  for (const pH of [3, 5, 6, 7.3, 9]) close(swapRatio(pH), 10 ** 0.4, 1e-9, `swap changes only the height at pH ${pH}`);
  close(zpeKIE(2900, 2100, 298), 6.9, 0.1, 'zero-point KIE at 298 K');
  close(stretchRatio(), 1.363, 0.01, 'C–H over C–D frequency');
  close(formulaMass({ C: 14, H: 23, F: 1, N: 1, O: 9 }), 368.3, 0.2, 'mass of the 2-fluorochitobiosyl group');
  close(kTS(OMP.kNon1995, OMP.kcatKm), 5e-24, 1e-24, 'transition-state Kd');
  close(proficiency(OMP.kNon1995, OMP.kcatKm) / 1e23, 2.0, 0.05, 'proficiency');
  close(rateEnhancement(OMP.kcat, OMP.kNon1995) / 1e17, 1.4, 0.05, 'rate enhancement');
  close(halfLife(OMP.kNon1995) / YEAR / 1e6, 78, 1, 'half-life 1995');
  close(halfLife(OMP.kNon2009) / YEAR / 1e6, 6.5, 0.1, 'half-life 2009');
  close(series(10, 10), 5, 1e-9, 'steps in series');
  close(protonOff(7, 1e10), 1e3, 1e-6, 'Eigen limit');
  close(piOverlap(0), 1, 1e-9, 'overlap at the normal'); close(piOverlap(90), 0, 1e-9, 'overlap in the plane');
  close(enediolLost(5.5), 0.846, 0.001, 'enediol lost');
  ok(caRate({ his64: true }) > caRate({ his64: false }) * 5, 'removing His64 slows the model');
  ok(caRate({ his64: false, bufferM: 0.05 }) > caRate({ his64: false }) * 2, 'imidazole brings it back');
  for (const mM of [1, 11, 25, 50, 200, 1000]) ok(caRate({ his64: false, bufferM: mM / 1000 }) < 0.45 * caRate({ his64: true }), `rescue saturates below 45% of wild type at ${mM} mM`);
  ok(INHIBITORS.reduce((m, x) => (x.ki < m.ki ? x : m)).id === 'O', 'BMP binds tightest');
  const txt = JSON.stringify(CHAPTERS);
  ok(txt.includes('about 85% escapes') && txt.includes('give 3.3') && txt.includes('78 million') && txt.includes('6.5 million') && txt.includes('870 years'), 'computed sentences read as expected');
  close(formulaMass({ C: 14, H: 23, F: 1, N: 1, O: 9 }) - formulaMass({ H: 1 }), 367.3, 0.2, 'neutral adduct gain');
}

section('Music follows the rate, honestly');
{
  ok(iramaLevel(1e6) === 0, 'CA II at level 0');
  ok(iramaLevel(8.1) === 2, `subtilisin level ${iramaLevel(8.1)}`);
  ok(iramaLevel(8.1e-6) === 4, `H64A level ${iramaLevel(8.1e-6)}`);
  ok(iramaLevel(1e-30) === 4, 'levels are clamped');
  ok(gongSeconds(1) === 2 * gongSeconds(0), 'each level doubles the gap between gongs');
  close(gapSeconds(1e3) / gapSeconds(1e6), 2, 1e-9, 'each 1000-fold fall doubles the gap');
  for (const rate of [1e6, 5e4, 4300, 1400, 550, 39, 8.1, 3.5, 0.13, 8.1e-6, 5.5e-5]) {
    const m = musicFor(rate);
    close(m.pulse * BEATS_PER_GONG * pulsesPerBeat(m.level), gapSeconds(rate), 1e-9, `gong gap at rate ${rate}`);
    ok(m.pulse > 0.12 && m.pulse < 0.5, `pulse stays playable at ${rate}: ${m.pulse}`);
  }
  ok(gapSeconds(5e4) > gapSeconds(1e6) * 1.2, 'a 20-fold fall is audible');
  for (const key of Object.keys(BALUNGAN)) for (let pass = 0; pass < 2; pass++) for (let level = 0; level <= 4; level++) {
    const p = piece(key, pass, { level, layers: 3, gong: true });
    const gongs = p.notes.filter((n) => n.inst === 'gong');
    ok(gongs.length === 1, `${key} one gong in the cycle`);
    ok(gongs[0].beat === BEATS_PER_GONG * pulsesPerBeat(level) - pulsesPerBeat(level), `${key} gong closes the cycle`);
    ok(p.beats === BEATS_PER_GONG * pulsesPerBeat(level), 'cycle length');
    ok(p.notes.every((n) => n.beat >= 0 && n.beat < p.beats), `${key} notes inside the cycle`);
    const polos = new Set(p.notes.filter((n) => n.inst === 'gangsa').map((n) => n.beat)), sangsih = p.notes.filter((n) => n.inst === 'gangsa2');
    ok(sangsih.every((n) => !polos.has(n.beat)), `${key}: kotekan parts interlock, never together`);
    ok(p.notes.filter((n) => n.inst === 'gangsa' || n.inst === 'gangsa2').every((n) => [1, 2, 3, 5, 6].includes(n.deg)), 'stays in the scale');
  }
  const silent = piece('subtilisin', 0, { level: 1, layers: 3, gong: false });
  ok(!silent.notes.some((n) => n.inst === 'gong'), 'the gong can be held back until the cycle closes');
  ok(piece('water', 0, { rest: true, gong: true }).notes.length <= 3, 'there are silences');
  ok(stepBeats(2).join() === '6,8' && stepBeats(4).join() === '2,4,6,8', 'steps fall on structural beats');
  close(hz(1, 1) / hz(1, 0), 2 ** (1206 / 1200), 1e-9, 'octaves are stretched');
}

section('Scores');
{
  ok(tierFor({ mechanism: false }) === 0, 'nothing drawn');
  ok(tierFor({ mechanism: true, strategy: false, hints: 0, predicted: true }) === 1, 'tier 1');
  ok(tierFor({ mechanism: true, strategy: true, hints: 1, predicted: true }) === 2, 'a hint costs the third leaf');
  ok(tierFor({ mechanism: true, strategy: true, hints: 0, predicted: false }) === 2, 'a wrong prediction costs the third leaf');
  ok(tierFor({ mechanism: true, strategy: true, hints: 0, predicted: true }) === 3, 'tier 3');
  ok(nearLog(300, 500, 1) && !nearLog(1, 500, 1), 'log closeness');
  const s = blankSave(); bestTier(s, 'x', 3); bestTier(s, 'x', 1); ok(s.tiers.x === 3, 'best tier kept');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
