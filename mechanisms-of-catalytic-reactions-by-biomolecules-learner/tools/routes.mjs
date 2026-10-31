// The engine plays every chapter by itself and records each species on a legal route to the next intermediate.
// The game looks a species up here instead of searching on a phone. Nothing is written by hand.
//   node tools/routes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MECHS, rnaseWith } from '../src/chem/mechanisms.js';
import { compile, Session } from '../src/chem/session.js';
import { stepsFrom, sigmaKey, hashKey, resolveArrow } from '../src/chem/engine.js';
import { tryArrow } from '../src/chem/judge.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = JSON.parse(readFileSync(join(root, 'src/data/sites.json'), 'utf8'));

// Forward from the start of a step, then keep only species from which a target can be reached.
export function network(st0, targets, depth = 3, budget = 90) {
  const edges = new Map(), states = new Map([[sigmaKey(st0), st0]]);
  let frontier = [st0], visited = 0;
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const st of frontier) {
      if (visited++ > budget) break;
      const from = sigmaKey(st);
      if (targets.includes(from)) continue;
      const out = stepsFrom(st);
      edges.set(from, [...out.keys()]);
      for (const [k, v] of out) if (!states.has(k)) { states.set(k, v.st); next.push(v.st); }
    }
    frontier = next;
  }
  const good = new Set(targets);
  for (let changed = true; changed;) {
    changed = false;
    for (const [from, to] of edges) if (!good.has(from) && to.some((k) => good.has(k))) { good.add(from); changed = true; }
  }
  return { good, size: states.size };
}

// RNase A: try all four protonation states with the same engine. Which ones can cleave?
export function protonationCombos() {
  const out = {};
  for (const h12 of ['HID', 'HIP']) for (const h119 of ['HIE', 'HIP']) {
    const m = rnaseWith(h12, h119), c = compile(m, SITES.rnase), s = new Session(c, { noNet: true });
    let reason = null;
    const start = s.st;
    const seen = new Set([sigmaKey(start)]);
    let frontier = [start], ok = false;
    const P = c.spec.index.P, O5 = c.spec.index.O5, O2 = c.spec.index.O2, n = c.spec.n;
    const cleaved = (st) => !st.b[P * n + O5] && st.b[P * n + O2] > 0;
    for (let d = 0; d < 3 && !ok; d++) {
      const next = [];
      for (const st of frontier) for (const [k, v] of stepsFrom(st)) { if (seen.has(k)) continue; seen.add(k); if (cleaved(v.st)) ok = true; next.push(v.st); }
      frontier = next.slice(0, 80);
    }
    if (!ok) {
      // Ask the engine why, by trying the arrows a chemist would try first.
      const tries = [{ lp: 'ANe', to: 'H2' }, { bond: ['O2', 'H2'], to: 'P', keep: 'O2' }, { bond: ['P', 'Oa'], to: 'Oa' }, { lp: 'Oa', to: 'P' }, { bond: ['P', 'O5'], to: 'O5' }];
      let cur = start;
      for (const a of tries) { const v = tryArrow(cur, resolveArrow(cur, a), { start }); if (v.verdict === 'reject') { reason = v.text; break; } cur = v.st; }
    }
    out[`${h12}/${h119}`] = { ok, reason };
    console.log('  combo', h12, h119, ok, reason ? reason.slice(0, 70) : '');
  }
  return out;
}

const out = {};
if (process.env.COMBOS_ONLY) { const old = JSON.parse(readFileSync(join(root, 'src/data/routes.json'), 'utf8')); old.combos = protonationCombos(); writeFileSync(join(root, 'src/data/routes.json'), JSON.stringify(old)); process.exit(0); }
out.combos = protonationCombos();
for (const [key, m] of Object.entries(MECHS)) {
  const c = compile(m, SITES[key]);
  const s = new Session(c);
  const t0 = performance.now();
  out[key] = [];
  let line = '';
  for (let i = 0; i < c.steps.length; i++) {
    const step = c.steps[i];
    const targets = [step.key, ...(step.altKeys || [])];
    const { good, size } = network(s.st, targets);
    out[key].push([...good].map(hashKey));
    line += ` ${good.size}/${size}`;
    for (const a of step.ref) s.arrow(resolveArrow(s.mid[s.mid.length - 1], a));
  }
  console.log(key.padEnd(11), `on-route/seen per step:${line}   ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
writeFileSync(join(root, 'src/data/routes.json'), JSON.stringify(out));
