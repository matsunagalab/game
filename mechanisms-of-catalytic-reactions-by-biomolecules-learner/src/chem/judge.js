// Turns the engine's findings into a verdict and a plain reason. Every reason names the actual chemistry.
import { moveRaw, problems, complete, charge, electrons, sumBonds, partner, pathWithin } from './engine.js';

export const elementName = { H: 'Hydrogen', C: 'Carbon', N: 'Nitrogen', O: 'Oxygen', P: 'Phosphorus', S: 'Sulfur', F: 'Fluorine', Zn: 'Zinc' };

export function atomName(st, i) {
  const a = st.spec.atoms[i];
  const el = (elementName[a.el] || a.el).toLowerCase();
  return a.name || (a.res ? `the ${a.res} ${el}` : el);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Two wordings. stuck: nothing here can repair this. open: the player can still repair it with another arrow.
const PROBLEM = {
  'over-c': (n, p) => ({
    stuck: 'That gives carbon five bonds. Carbon holds eight electrons at most, and nothing on it can leave.',
    open: `${cap(n)} now has ${p.e} electrons. Eight is the limit: send one of its pairs away.`,
  }),
  over: (n, p) => ({
    stuck: `That gives ${n} ${p.e} electrons, and none of its pairs can leave.`,
    open: `${cap(n)} now has ${p.e} electrons. Send one of its pairs away.`,
  }),
  'h-two': (n) => ({
    stuck: 'Hydrogen holds two electrons, and the bond it has cannot let go here.',
    open: 'Hydrogen now has two bonds. Its old bond must let go: send those electrons somewhere.',
  }),
  'bare-proton': () => ({
    stuck: 'That leaves a bare proton with no base in reach. A free H⁺ does not exist in an active site.',
    open: 'That leaves a bare proton. Bring a lone pair from a base to catch it.',
  }),
  hydride: () => ({
    stuck: 'That would set a hydride ion free, and nothing is in reach to accept it.',
    open: 'That hydride needs an acceptor. Point it at an atom that can take it.',
  }),
  under: (n, p) => ({
    stuck: `That leaves ${n} with ${p.e} electrons, and nothing in reach can fill the gap.`,
    open: `${cap(n)} is left with ${p.e} electrons. Bring a pair to it.`,
  }),
  'n-anion': (n) => ({
    stuck: 'Wrong leaving group: that nitrogen would leave as an amide anion, whose conjugate acid has a pKa near 35. It needs a proton as it goes, and no acid is in reach.',
    open: 'That nitrogen is now an amide anion, far too basic to leave alone. Give it a proton.',
  }),
  imidazolate: () => ({
    stuck: 'That would strip histidine to imidazolate, pKa near 14. Nothing here can take that proton, and no acid can refill it.',
    open: 'That leaves histidine as imidazolate, pKa near 14. Give it a proton.',
  }),
  alkoxide: (n, p) => ({
    stuck: `Wrong leaving group: ${n} would leave as a bare alkoxide, with nothing to hold the charge and no acid in reach.${p.pka ? ` Its conjugate acid has a pKa near ${p.pka}.` : ''}`,
    open: `${cap(n)} is now a bare alkoxide, a poor group to leave behind. Use its electrons, or give it a proton.`,
  }),
  carbanion: (n) => ({
    stuck: `That leaves a carbanion on ${n}, with no pi bond beside it to spread the charge into.`,
    open: 'That leaves a carbanion. Spread its electrons, or give it a proton.',
  }),
  dianion: (n) => ({
    stuck: `That would put two minus charges on ${n}. No group here could hold that.`,
    open: `${cap(n)} has two minus charges. Use one of its pairs.`,
  }),
  oxonium: (n) => ({
    stuck: `${cap(n)} would be left positive, with no base in reach to take its proton.`,
    open: `${cap(n)} is now positive. A base must take its proton.`,
  }),
  sulfonium: (n) => ({ stuck: `That would make ${n} positive, and nothing here can bear that.`, open: `${cap(n)} is positive. Undo that pair.` }),
  'metal-full': (n) => ({
    stuck: `${cap(n)} has no free site here.`,
    open: `${cap(n)} is now crowded. One of its ligands must let go: draw its pair back to it.`,
  }),
  'under-hetero': (n) => ({
    stuck: `Wrong way: that would leave ${n} short of electrons. Oxygen and nitrogen can give a lone pair to a neighbour, but they are never left with six electrons.`,
    open: `${cap(n)} is left short of electrons. Bring a pair back to it.`,
  }),
  'proton-shift': () => ({
    stuck: 'That would carry a proton straight across one small group, whichever order you draw it in. It needs a relay through a base or a water.',
    open: 'That would carry a proton straight across one small group. It needs a relay through a base or a water.',
  }),
  'ring-n': () => ({
    stuck: 'That lone pair belongs to the aromatic ring: it is part of the ring\'s six pi electrons, so it is not a base. Use the other nitrogen.',
    open: 'That lone pair belongs to the aromatic ring, so it is not a base.',
  }),
  'no-h': (n) => ({
    stuck: 'A phosphate oxygen is a very weak base, so this game does not let it take this proton. Routes through such oxygens are debated in the literature; this model leaves them out.',
    open: 'A phosphate oxygen is a very weak base here.',
  }),
};

const FLAT = {
  'no-lp': (st, i) => `${cap(atomName(st, i))} has no lone pair to give. Start from a lone pair or a bond.`,
  'no-bond': () => 'There is no bond there to move.',
  same: () => 'An arrow has to carry a pair somewhere new.',
  triple: (st, i) => `${cap(atomName(st, i))} cannot take a fourth shared pair.`,
  aromatic: () => 'That is an aromatic ring: its six pi electrons stay in place, and its carbons do not react here.',
  'no-h': () => 'A phosphate oxygen is a very weak base, so this game does not let it take this proton. Routes through such oxygens are debated in the literature; this model leaves them out.',
  'proton-hydride': () => 'A hydrogen on oxygen or nitrogen leaves as a proton, without its electrons. Only a C–H can give hydride.',
  'full-atom': (st, i) => `${cap(atomName(st, i))} already has eight electrons, so it takes no new bond here.`,
  hetero: () => 'Both atoms are rich in electrons and pull hard on them, so neither is a place for a new bond here.',
  'metal-source': () => 'A metal ion here gives no electrons: it pulls on them. Start from a lone pair or a bond.',
  'lp-to-far-bond': () => 'A lone pair makes a new bond to one atom. Aim at the atom.',
  'bond-to-far-bond': () => 'A moving pair can only form a bond at an atom it already touches. Aim at the atom.',
  'coord-direction': (st, i) => `A metal bond can only release its pair back to ${atomName(st, i)}.`,
};

export function tooFarText(st, pair, dist) {
  const [i, j] = pair, { spec } = st, n = spec.n;
  // Close in space, but both atoms belong to one small group.
  const heavy = (k) => (spec.atoms[k].el === 'H' ? partner(st, k) : k);
  const a = heavy(i), b = heavy(j);
  if (a >= 0 && b >= 0 && (spec.close[a * n + b] || pathWithin(st, a, b, 3))) {
    const h = spec.atoms[i].el === 'H' ? i : spec.atoms[j].el === 'H' ? j : -1;
    if (h >= 0 && spec.atoms[partner(st, h)]?.el === 'C') return 'A hydrogen on carbon cannot slide straight across to its neighbour here. It needs a base or an acceptor in reach.';
    return h >= 0 ? 'A proton cannot step straight across one small group. It needs a relay through a base or a water.' : 'Those atoms belong to one small group. A bond across it would close a strained ring of three or four atoms, which this game does not allow.';
  }
  const d = dist ? dist(i, j) : null;
  const gap = d ? ` They sit ${d.toFixed(1)} Å apart in this model.` : '';
  return `${cap(atomName(st, i))} cannot reach ${atomName(st, j)}.${gap}`;
}

// Tries one arrow on a state that may be part way through a step.
// home is the species the step began from: pairs that merely fall back into place are not a repair.
export function tryArrow(st, m, { dist, home, start } = {}) {
  const r = moveRaw(st, m);
  if (r.err) {
    if (r.err === 'too-far') return { verdict: 'reject', code: 'too-far', text: tooFarText(st, r.pair, dist), pair: r.pair };
    return { verdict: 'reject', code: r.err, text: FLAT[r.err](st, r.at) };
  }
  const ps = problems(r.st);
  if (!ps.length) return { verdict: 'stable', st: r.st };
  const finishes = complete(r.st, 6, 5000, start);
  if (home) finishes.delete(home);
  for (const q of ps) q.pka = r.st.spec.atoms[q.i].pka;
  const p = ps[0], words = PROBLEM[p.kind](atomName(r.st, p.i), p);
  if (!finishes.size) {
    // Say the worst thing first: the problem that truly cannot be repaired.
    const worst = pickBlocker(r.st, ps);
    const w = PROBLEM[worst.kind](atomName(r.st, worst.i), worst);
    return { verdict: 'reject', code: worst.kind, text: w.stuck, at: worst.i };
  }
  return { verdict: 'pending', st: r.st, code: p.kind, text: words.open, at: p.i, finishes };
}

const RANK = ['proton-shift', 'under-hetero', 'metal-full', 'over-c', 'ring-n', 'no-h', 'imidazolate', 'n-anion', 'bare-proton', 'alkoxide', 'hydride', 'carbanion', 'dianion', 'over', 'h-two', 'under', 'oxonium', 'sulfonium'];
const pickBlocker = (st, ps) => [...ps].sort((a, b) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind))[0];

export { charge, electrons, sumBonds };
