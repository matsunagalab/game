// Electron bookkeeping. Screen-free: nothing here knows about pixels.
// A state holds lone pairs and bond orders over a fixed list of atoms. An arrow moves one pair.
// The engine holds no right answers: it knows valence, the octet, formal charge and what a species can bear.
//
// Atom spec: { id, el, lp, x, q?, res? }  x counts unmodelled single bonds (a CH3, a backbone): they keep the valence honest.
// A metal keeps its charge. A ligand bound to it keeps its lone pair: the coordinate bond is held in c, not in b.

export const VALENCE = { H: 1, C: 4, N: 5, O: 6, F: 7, P: 5, S: 6 };
export const SHELL = { H: 2, C: 8, N: 8, O: 8, F: 8, P: 10, S: 8 };

export function makeSpec({ atoms, bonds = [], coord = [], equiv = [], allow = {}, contacts = [], protons = [], close = [], absent = [] }) {
  const index = {};
  atoms.forEach((a, i) => { index[a.id] = i; });
  const n = atoms.length;
  const cls = atoms.map((_, i) => i);
  for (const group of equiv) for (const id of group) cls[index[id]] = index[group[0]];
  const spec = { atoms, index, n, bonds, coord, cls, allow };
  const table = (list) => {
    const t = new Uint8Array(n * n);
    for (const [a, b] of list) { const i = index[a], j = index[b]; if (i === undefined || j === undefined) throw new Error(`contact ${a} ${b}`); t[i * n + j] = t[j * n + i] = 1; }
    return t;
  };
  spec.reach = table(contacts);    // atoms close enough to form a new bond
  spec.hop = table(protons);       // heavy atoms close enough to pass a proton
  spec.close = table(close.map(([a, b]) => [a, b]));   // atoms of one small group: near in space, but a bond or proton cannot cross
  spec.present = atoms.map((a) => (absent.includes(a.id) ? 0 : 1));
  return spec;
}

export function initial(spec) {
  const { n, atoms, index } = spec;
  const st = { spec, lp: new Int8Array(n), b: new Int8Array(n * n), c: new Int8Array(n * n), was: new Int16Array(n).fill(-1), on: Uint8Array.from(spec.present), moves: [] };
  atoms.forEach((a, i) => { st.lp[i] = a.lp || 0; });
  for (const [p, q, o = 1] of spec.bonds) { const i = index[p], j = index[q]; if (i === undefined || j === undefined) throw new Error(`bond ${p} ${q}`); st.b[i * n + j] = st.b[j * n + i] = o; }
  for (const [p, q] of spec.coord) { const i = index[p], j = index[q]; st.c[i * n + j] = st.c[j * n + i] = 1; }
  return st;
}

export const clone = (st) => ({ spec: st.spec, lp: st.lp.slice(), b: st.b.slice(), c: st.c.slice(), was: st.was.slice(), on: st.on.slice(), base: st.base, moves: st.moves ? st.moves.slice() : [] });
const isMetal = (spec, i) => spec.atoms[i].metal === true;
const HETERO = new Set(['O', 'N', 'F']);
const arom = (spec, i) => spec.atoms[i].ring === true;
export const bondOrder = (st, i, j) => st.b[i * st.spec.n + j];
const setB = (st, i, j, v) => { const n = st.spec.n; st.b[i * n + j] = st.b[j * n + i] = v; };

export function sumBonds(st, i) {
  const n = st.spec.n; let s = 0;
  for (let j = 0; j < n; j++) s += st.b[i * n + j];
  return s + (st.spec.atoms[i].x || 0);
}

export const electrons = (st, i) => 2 * st.lp[i] + 2 * sumBonds(st, i);

export function charge(st, i) {
  const a = st.spec.atoms[i];
  if (a.metal) return a.q;
  return VALENCE[a.el] - 2 * st.lp[i] - sumBonds(st, i);
}

// Every valence electron the model holds. A correct arrow can never change it.
export function totalElectrons(st) {
  const { n, atoms } = st.spec; let e = 0;
  for (let i = 0; i < n; i++) {
    if (atoms[i].metal) continue;
    e += 2 * st.lp[i] + (atoms[i].x || 0);
    for (let j = i + 1; j < n; j++) e += 2 * st.b[i * n + j];
  }
  return e;
}

export const totalCharge = (st) => { let q = 0; for (let i = 0; i < st.spec.n; i++) q += charge(st, i); return q; };

export function neighbours(st, i) {
  const n = st.spec.n, out = [];
  for (let j = 0; j < n; j++) if (st.b[i * n + j]) out.push(j);
  return out;
}

// The heavy atom a hydrogen hangs from, or the last one it hung from if it is bare.
export function partner(st, h) {
  const nb = neighbours(st, h);
  return nb.length ? nb[0] : st.was[h];
}

// Are two atoms joined by a path of at most this many bonds, in these bond orders?
function linked(b, n, from, to, limit) {
  let front = [from]; const seen = new Set(front);
  for (let d = 0; d < limit && front.length; d++) {
    const next = [];
    for (const u of front) for (let v = 0; v < n; v++) {
      if (!b[u * n + v] || seen.has(v)) continue;
      if (v === to) return true;
      seen.add(v); next.push(v);
    }
    front = next;
  }
  return false;
}

// Arrows of one step can come in any order, so the rule holds for the state now and for the state the step began from.
export function pathWithin(st, a, b, limit) {
  const n = st.spec.n;
  return linked(st.b, n, a, b, limit) || (!!st.base && linked(st.base, n, a, b, limit));
}

// Can atoms i and j share a bond here? Close in space is not enough:
// a new bond must not close a ring of three or four atoms, and a proton must not step across one atom.
export function reachable(st, i, j) {
  const { spec } = st, n = spec.n;
  if (st.b[i * n + j] || st.c[i * n + j]) return true;
  if (spec.reach[i * n + j]) return !pathWithin(st, i, j, 3);
  // A proton on O or N hops between heavy atoms. A hydrogen on carbon has its own measured distances, in reach.
  const prox = (h, y) => {
    if (spec.atoms[h].el !== 'H') return false;
    const p = partner(st, h);
    if (p < 0 || p === y || spec.atoms[p].el === 'C') return false;
    return spec.hop[p * n + y] === 1 && !pathWithin(st, p, y, 2);
  };
  return prox(i, j) || prox(j, i);
}

// source: { lp: id } or { bond: [a, b], keep?: a }  sink: { atom: id } or { bond: [c, d] }.
export function resolveArrow(st, arrow) {
  const { index } = st.spec;
  const out = {};
  if (arrow.lp !== undefined) out.lp = index[arrow.lp];
  if (arrow.bond) { out.b0 = index[arrow.bond[0]]; out.b1 = index[arrow.bond[1]]; }
  if (arrow.keep !== undefined) out.keep = index[arrow.keep];
  if (arrow.to !== undefined) out.to = index[arrow.to];
  if (arrow.toBond) { out.t0 = index[arrow.toBond[0]]; out.t1 = index[arrow.toBond[1]]; }
  return out;
}

// Moves one pair and reports what the move means. No judgement of the result here, only whether the pair exists.
export function moveRaw(st0, m) {
  const st = clone(st0), { spec } = st, { n } = spec;
  const newBond = (i, j) => {
    const cur = st.b[i * n + j];
    if (cur >= 3) return 'triple';
    if (!cur && HETERO.has(spec.atoms[i].el) && HETERO.has(spec.atoms[j].el)) return 'hetero';
    // Oxygen and nitrogen with a full shell pull electrons in. They do not accept a new bond from carbon.
    if (!cur && HETERO.has(spec.atoms[j].el) && electrons(st, j) >= 8) return 'full-atom';
    if ((spec.atoms[i].noH && spec.atoms[j].el === 'H') || (spec.atoms[j].noH && spec.atoms[i].el === 'H')) return 'no-h';
    if ((spec.atoms[i].el === 'P' && spec.atoms[j].el === 'H') || (spec.atoms[j].el === 'P' && spec.atoms[i].el === 'H')) return 'no-h';
    // Remember where each proton came from: the end of the step is judged against it as well.
    const h = spec.atoms[i].el === 'H' ? i : spec.atoms[j].el === 'H' ? j : -1;
    if (h >= 0 && !cur) { const to = h === i ? j : i, from = partner(st, h); if (from >= 0 && from !== to) st.moves = [...st.moves, [from, to, h]]; }
    if (!cur && !reachable(st, i, j)) return { far: [i, j] };
    setB(st, i, j, cur + 1);
    return null;
  };
  const breakBond = (i, j) => {
    const o = st.b[i * n + j];
    setB(st, i, j, o - 1);
    if (o === 1) {
      if (spec.atoms[i].el === 'H') st.was[i] = j;
      if (spec.atoms[j].el === 'H') st.was[j] = i;
    }
  };
  if (m.lp !== undefined) {
    const i = m.lp;
    if (isMetal(spec, i)) return { err: 'metal-source', at: i };
    if (st.lp[i] < 1) return { err: 'no-lp', at: i };
    let k = m.to;
    if (k === undefined) { if (m.t0 !== i && m.t1 !== i) return { err: 'lp-to-far-bond', at: i }; k = m.t0 === i ? m.t1 : m.t0; }
    if (k === i) return { err: 'same', at: i };
    if (arom(spec, k) && (arom(spec, i) || spec.atoms[k].el === 'C')) return { err: 'aromatic', at: k };
    if (isMetal(spec, k)) {
      if (!reachable(st, i, k)) return { err: 'too-far', pair: [i, k] };
      if (st.c[i * n + k]) return { err: 'same', at: i };
      st.c[i * n + k] = st.c[k * n + i] = 1;
      return { st };
    }
    st.lp[i] -= 1;
    const e = newBond(i, k);
    if (typeof e === 'string') return { err: e, at: k };
    if (e) return { err: 'too-far', pair: e.far };
    return { st };
  }
  const i = m.b0, j = m.b1;
  if (i === undefined || j === undefined) return { err: 'no-bond', at: i };
  // A coordinate bond: the ligand simply takes its pair back.
  if (!st.b[i * n + j] && st.c[i * n + j]) {
    const lig = isMetal(spec, i) ? j : i;
    if (m.to !== lig) return { err: 'coord-direction', at: lig };
    st.c[i * n + j] = st.c[j * n + i] = 0;
    return { st };
  }
  if (!st.b[i * n + j]) return { err: 'no-bond', at: i };
  if (arom(spec, i) && arom(spec, j)) return { err: 'aromatic', at: i };
  if (m.to !== undefined) {
    const k = m.to;
    if (k === i || k === j) {
      const other = k === i ? j : i;
      if (spec.atoms[k].el === 'H' && spec.atoms[other].el !== 'C') return { err: 'proton-hydride', at: k };
      breakBond(i, j);
      st.lp[k] += 1;
      return { st };
    }
    // The pair walks on to a third atom. The end that keeps it is the one that makes the new bond.
    const keep = m.keep !== undefined ? m.keep : pickKeeper(st0, i, j, k);
    const other = keep === i ? j : i;
    if (spec.atoms[keep].el === 'H' && spec.atoms[other].el !== 'C') return { err: 'proton-hydride', at: keep };
    if (arom(spec, k) && spec.atoms[k].el === 'C') return { err: 'aromatic', at: k };
    breakBond(keep, other);
    const e = newBond(keep, k);
    if (typeof e === 'string') return { err: e, at: k };
    if (e) return { err: 'too-far', pair: e.far };
    return { st };
  }
  const shared = m.t0 === i || m.t0 === j ? m.t0 : m.t1 === i || m.t1 === j ? m.t1 : -1;
  if (shared < 0) return { err: 'bond-to-far-bond', at: i };
  const a = shared === m.t0 ? m.t1 : m.t0;
  const other = shared === i ? j : i;
  if (a === other) return { err: 'same', at: i };
  breakBond(shared, other);
  const e = newBond(shared, a);
  if (typeof e === 'string') return { err: e, at: a };
  if (e) return { err: 'too-far', pair: e.far };
  return { st };
}

// A proton on O or N leaves as H+: its electrons stay with the heavy atom. A C–H pair can travel as hydride.
function pickKeeper(st, i, j, k) {
  const { atoms } = st.spec;
  const ei = atoms[i].el, ej = atoms[j].el;
  if (ei === 'H') return ej === 'C' ? i : j;
  if (ej === 'H') return ei === 'C' ? j : i;
  const ri = reachable(st, i, k), rj = reachable(st, j, k);
  if (ri && !rj) return i;
  if (rj && !ri) return j;
  return i;
}

// Things wrong with an atom right now. An empty list means every atom can stand as it is.
export function problems(st) {
  const { spec } = st, { n, atoms, allow } = spec, out = [];
  // A proton may not have stepped between two atoms that end this step within two bonds of each other.
  // It counts once the proton has left its donor; until then the two are simply joined through the proton itself.
  for (const [from, to, h] of st.moves) if (!st.b[h * n + from] && linked(st.b, n, from, to, 2)) { out.push({ i: to, kind: 'proton-shift' }); break; }
  for (let i = 0; i < n; i++) {
    if (!st.on[i]) continue;
    const a = atoms[i];
    if (a.metal) { if (a.sites !== undefined && ligands(st, i) > a.sites) out.push({ i, kind: 'metal-full' }); continue; }
    const e = electrons(st, i), q = charge(st, i), s = sumBonds(st, i);
    if (a.el === 'H') {
      if (s === 2) out.push({ i, kind: 'h-two' });
      else if (s === 0 && st.lp[i] === 0) out.push({ i, kind: 'bare-proton' });
      else if (s === 0) out.push({ i, kind: 'hydride' });
      continue;
    }
    const shell = SHELL[a.el];
    if (e > shell) { out.push({ i, kind: a.el === 'C' ? 'over-c' : 'over', e }); continue; }
    if (e < (a.el === 'P' ? 8 : shell)) { out.push({ i, kind: a.el === 'O' || a.el === 'N' ? 'under-hetero' : 'under', e }); continue; }
    if (q <= -2) { out.push({ i, kind: 'dianion' }); continue; }
    if (a.el === 'C' && q === -1 && !allow.carbanion?.includes(a.id) && !nextToAcceptor(st, i)) out.push({ i, kind: 'carbanion' });
    // A charged histidine has two N–H. Losing one leaves it neutral: the minus here pairs with a plus on the other nitrogen.
    if (a.el === 'N' && q === -1 && !allow.anion?.includes(a.id) && !(a.ring && otherRingPlus(st, i))) out.push({ i, kind: a.ring ? 'imidazolate' : 'n-anion' });
    if (a.el === 'N' && a.ring && sigmaCount(st, i) === 4) out.push({ i, kind: 'ring-n' });
    if (a.el === 'O' && q === -1 && isLoneAlkoxide(st, i)) out.push({ i, kind: 'alkoxide' });
    if (a.noH && hasProton(st, i)) out.push({ i, kind: 'no-h' });
    if (a.el === 'O' && q === 1 && !allow.oxonium && !hasPi(st, i)) out.push({ i, kind: 'oxonium' });
    if (a.el === 'S' && q === 1) out.push({ i, kind: 'sulfonium' });
  }
  return out;
}

function ligands(st, i) { const n = st.spec.n; let c = 0; for (let j = 0; j < n; j++) c += st.c[i * n + j]; return c; }
function otherRingPlus(st, i) {
  const { atoms, n } = st.spec;
  for (let k = 0; k < n; k++) if (k !== i && atoms[k].ring && atoms[k].el === 'N' && atoms[k].res === atoms[i].res && charge(st, k) === 1) return true;
  return false;
}
const sigmaCount = (st, i) => neighbours(st, i).length + (st.spec.atoms[i].x || 0);
const hasProton = (st, i) => neighbours(st, i).some((j) => st.spec.atoms[j].el === 'H');

// An alkoxide or hydroxide with nothing to hold its charge: no metal, no phosphorus, no pi system beside it.
function isLoneAlkoxide(st, i) {
  const { spec } = st, { n, atoms, allow } = spec;
  if (allow.oxyanion?.includes(atoms[i].id)) return false;
  for (let j = 0; j < n; j++) if (st.c[i * n + j]) return false;
  for (const j of neighbours(st, i)) {
    if (atoms[j].el === 'P' || atoms[j].el === 'S') return false;
    for (const k of neighbours(st, j)) if (k !== i && st.b[j * n + k] >= 2) return false;
  }
  return true;
}

function hasPi(st, i) {
  const n = st.spec.n;
  for (let j = 0; j < n; j++) if (st.b[i * n + j] > 1) return true;
  return false;
}

// A carbanion next to C=O or C=N is an enolate drawn another way.
function nextToAcceptor(st, i) {
  const n = st.spec.n, { atoms } = st.spec;
  for (let j = 0; j < n; j++) {
    if (!st.b[i * n + j]) continue;
    for (let k = 0; k < n; k++) if (k !== i && st.b[j * n + k] >= 2 && (atoms[k].el === 'O' || atoms[k].el === 'N' || atoms[k].el === 'C')) return true;
  }
  return false;
}

// Nuclei and sigma connectivity. Two drawings with the same key are resonance forms of one species.
export function sigmaKey(st) {
  const { spec } = st, { n, cls } = spec, parts = [];
  for (let i = 0; i < n; i++) {
    if (!st.on[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!st.on[j]) continue;
      if (st.b[i * n + j] || st.c[i * n + j]) {
        const u = cls[i], v = cls[j];
        parts.push(u < v ? `${u}-${v}` : `${v}-${u}`);
      }
    }
  }
  return parts.sort().join(' ');
}

export const fullKey = (st) => `${sigmaKey(st)}|${Array.from(st.lp).join('')}`;
const exactKey = (st) => `${Array.from(st.b).join('')}|${Array.from(st.lp).join('')}|${Array.from(st.c).join('')}`;

function acceptor(st, k) {
  const { atoms } = st.spec;
  if (atoms[k].el === 'H' || atoms[k].el === 'P') return true;
  return hasPi(st, k) || electrons(st, k) < 8;
}

// Arrows that could relieve one problem. The search looks only here, so it stays small.
function reliefs(st, p) {
  const { spec } = st, { n } = spec, { i, kind } = p, out = [];
  const nb = neighbours(st, i);
  if (kind === 'over' || kind === 'over-c' || kind === 'h-two') {
    for (const j of nb) {
      if (spec.atoms[j].el !== 'H' || kind === 'h-two') out.push({ b0: i, b1: j, to: j });
      for (const k of neighbours(st, j)) if (k !== i) out.push({ b0: i, b1: j, t0: j, t1: k });
      // A pair walks on only to a place that can take it: a proton, or an atom with a pi bond or room.
      for (let k = 0; k < n; k++) if (k !== i && k !== j && st.on[k] && !isMetal(spec, k) && reachable(st, j, k) && acceptor(st, k)) out.push({ b0: i, b1: j, to: k, keep: j });
    }
  }
  if (kind === 'metal-full') {
    for (let k = 0; k < n; k++) if (st.c[i * n + k]) out.push({ b0: i, b1: k, to: k });
  }
  if (kind === 'under' || kind === 'bare-proton') {
    for (let k = 0; k < n; k++) {
      if (k === i || !st.on[k] || isMetal(spec, k)) continue;
      if (st.lp[k] > 0 && reachable(st, k, i)) out.push({ lp: k, to: i });
      for (const m of neighbours(st, k)) {
        if (m === i) continue;
        if (reachable(st, k, i)) {
          if (st.b[k * n + i]) out.push({ b0: k, b1: m, t0: k, t1: i });
          else out.push({ b0: k, b1: m, to: i, keep: k });
        }
      }
    }
    // The bond the atom already has can carry a second pair from its partner's lone pair (handled above).
  }
  if (kind === 'n-anion' || kind === 'imidazolate' || kind === 'carbanion' || kind === 'dianion' || kind === 'hydride' || kind === 'alkoxide') {
    for (const j of nb) out.push({ lp: i, to: j });
    for (let k = 0; k < n; k++) if (k !== i && st.on[k] && st.lp[i] && !isMetal(spec, k) && reachable(st, i, k)) out.push({ lp: i, to: k });
  }
  if (kind === 'oxonium' || kind === 'sulfonium') {
    for (const j of nb) if (spec.atoms[j].el === 'H') {
      out.push({ b0: i, b1: j, to: i });
    }
  }
  return out;
}

// Can this half-made step be finished? Returns stable results, each with the arrows that reach it.
// A relief may pass a problem along but not multiply it: that is what a chain of arrows does.
// start is the state the step began from: a relief may not rebuild a bond the step has just broken.
export function complete(st0, maxArrows = 6, limit = 5000, start = null, goal = null) {
  const seen = new Set(), results = new Map();
  const rebuilt = (st, m) => {
    if (!start) return false;
    const n = st.spec.n;
    const check = (a, b) => start.b[a * n + b] > 0 && st.b[a * n + b] === 0;
    if (m.lp !== undefined && m.to !== undefined) return check(m.lp, m.to);
    if (m.keep !== undefined && m.to !== undefined) return check(m.keep, m.to);
    return false;
  };
  let budget = limit;
  let level = [{ st: st0, path: [], ps: problems(st0) }];
  for (let depth = 0; depth <= maxArrows && level.length && budget > 0; depth++) {
    const next = [];
    for (const { st, path, ps } of level) {
      if (!ps.length) {
        const k = sigmaKey(st);
        if (!results.has(k) && (!goal || goal(st))) results.set(k, { st, arrows: path });
        continue;
      }
      if (depth === maxArrows) continue;
      // Arrows of one step commute, so it is enough to repair the first problem at each stage.
      for (const m of reliefs(st, ps[0])) {
        if (budget-- <= 0) break;
        if (rebuilt(st, m)) continue;
        const r = moveRaw(st, m);
        if (r.err) continue;
        const after = problems(r.st);
        if (after.length > ps.length) continue;
        const key = exactKey(r.st);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ st: r.st, path: [...path, m], ps: after });
      }
    }
    level = next;
  }
  return results;
}

// All the arrows the state could start with.
export function firstArrows(st) {
  const { spec } = st, { n } = spec, out = [];
  for (let i = 0; i < n; i++) {
    if (!st.on[i] || isMetal(spec, i)) continue;
    if (st.lp[i] > 0) for (let k = 0; k < n; k++) if (k !== i && st.on[k] && reachable(st, i, k)) out.push({ lp: i, to: k });
    for (let j = i + 1; j < n; j++) {
      if (!st.on[j]) continue;
      if (st.b[i * n + j]) {
        out.push({ b0: i, b1: j, to: i });
        out.push({ b0: i, b1: j, to: j });
      } else if (st.c[i * n + j]) {
        const lig = isMetal(spec, i) ? j : i;
        out.push({ b0: i, b1: j, to: lig });
      }
    }
  }
  return out;
}

// Every stable species one step away, found by the engine itself.
export function stepsFrom(st0, maxArrows = 6) {
  const st = clone(st0); st.base = st.b; st.moves = [];
  const out = new Map(), home = sigmaKey(st);
  for (const m of firstArrows(st)) {
    const r = moveRaw(st, m);
    if (r.err) continue;
    for (const [k, v] of complete(r.st, maxArrows - 1, 400, st)) {
      if (k === home) continue;
      const prev = out.get(k), arrows = [m, ...v.arrows];
      if (!prev || arrows.length < prev.arrows.length) out.set(k, { st: v.st, arrows });
    }
  }
  return out;
}

// A short hash of a species, so the route network can ship as a small table.
export function hashKey(k) {
  let h = 0x811c9dc5;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Breadth-first: does a chain of legal steps lead from here to the target? Returns the shortest list of steps, or null.
export function route(st0, targetKey, maxSteps = 3, budget = 4000) {
  const start = sigmaKey(st0);
  if (start === targetKey) return [];
  const seen = new Map([[start, null]]);
  let frontier = [st0], count = 0;
  for (let d = 0; d < maxSteps; d++) {
    const next = [];
    for (const st of frontier) {
      for (const [k, v] of stepsFrom(st)) {
        if (seen.has(k)) continue;
        seen.set(k, { from: sigmaKey(st), arrows: v.arrows });
        if (k === targetKey) {
          const path = [];
          for (let at = k; seen.get(at); at = seen.get(at).from) path.unshift(seen.get(at).arrows);
          return path;
        }
        next.push(v.st);
        if (++count > budget) return null;
      }
    }
    frontier = next;
  }
  return null;
}
