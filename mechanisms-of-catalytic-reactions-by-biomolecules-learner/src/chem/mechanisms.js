// The chemistry of each chapter as data: atoms, bonds and one reference route.
// The reference arrows only define the intermediates. The player may reach them by any legal route.
//
// at: where the atom sits. { pdb: 'chain:seq:name' } is a real crystal atom. Everything else is a stated rule:
//   h:     a hydrogen on a heavy atom, pointing at another atom
//   ringH: a hydrogen in the plane of a ring, away from two neighbours
//   tet:   a substituent opposite three neighbours
//   tet2:  one of two substituents on a CH2, by side (+1 or -1)
//   along: a fixed distance from one atom toward (or past) another
//   xyz:   a position chosen by hand for legibility (the uncatalysed chapter has no crystal)
//   same:  the position of another atom, with an offset
//   trilat: a water set by two measured distances to the groups it touches, on the side away from a third atom

const atom = (id, el, lp, x, at, more = {}) => ({ id, el, lp, x, at, ...more });
const L = (a, b) => ({ lp: a, to: b });
const B = (a, b, to, keep) => ({ bond: [a, b], to, ...(keep ? { keep } : {}) });
const BB = (a, b, c, d) => ({ bond: [a, b], toBond: [c, d] });
const LB = (a, c, d) => ({ lp: a, toBond: [c, d] });

// A histidine ring. form: HID (H on Nd), HIE (H on Ne), HIP (both). plus: which nitrogen is drawn positive in HIP.
export function his(p, chain, seq, form, res, plus = 'Ne') {
  const r = (n) => ({ pdb: `${chain}:${seq}:${n}` });
  const f = { res, ring: true };
  const atoms = [
    atom(`${p}Cg`, 'C', 0, 1, r('CG'), f),
    atom(`${p}Cd`, 'C', 0, 1, r('CD2'), f),
    atom(`${p}Ce`, 'C', 0, 1, r('CE1'), f),
    atom(`${p}Nd`, 'N', form === 'HIP' && plus === 'Nd' ? 0 : 1, 0, r('ND1'), { ...f, show: 'Nδ' }),
    atom(`${p}Ne`, 'N', form === 'HIP' && plus === 'Ne' ? 0 : 1, 0, r('NE2'), { ...f, show: 'Nε' }),
  ];
  const bonds = [[`${p}Cg`, `${p}Nd`, 1], [`${p}Cg`, `${p}Cd`, 2], [`${p}Cd`, `${p}Ne`, 1]];
  if (form === 'HID' || form === 'HIP') {
    atoms.push(atom(`${p}Hd`, 'H', 0, 0, { ringH: [`${p}Nd`, `${p}Cg`, `${p}Ce`] }, { res }));
    bonds.push([`${p}Nd`, `${p}Hd`, 1]);
  }
  if (form === 'HIE' || form === 'HIP') {
    atoms.push(atom(`${p}He`, 'H', 0, 0, { ringH: [`${p}Ne`, `${p}Ce`, `${p}Cd`] }, { res }));
    bonds.push([`${p}Ne`, `${p}He`, 1]);
  }
  if (form === 'HIE' || (form === 'HIP' && plus === 'Nd')) bonds.push([`${p}Nd`, `${p}Ce`, 2], [`${p}Ce`, `${p}Ne`, 1]);
  else bonds.push([`${p}Nd`, `${p}Ce`, 1], [`${p}Ce`, `${p}Ne`, 2]);
  return { atoms, bonds };
}

// A carboxylate: C, O1 (double), O2 (single, minus).
function carboxylate(p, cRef, o1Ref, o2Ref, res) {
  return {
    atoms: [atom(`${p}C`, 'C', 0, 1, cRef, { res }), atom(`${p}O1`, 'O', 2, 0, o1Ref, { res }), atom(`${p}O2`, 'O', 3, 0, o2Ref, { res })],
    bonds: [[`${p}C`, `${p}O1`, 2], [`${p}C`, `${p}O2`, 1]],
  };
}

const merge = (...gs) => ({ atoms: gs.flatMap((g) => g.atoms), bonds: gs.flatMap((g) => g.bonds) });

// ---------------------------------------------------------------------------- 1. Water and an amide
const amide = {
  atoms: [
    atom('C', 'C', 0, 1, { xyz: [0.0, 0.9, 0] }, { res: 'amide', name: 'the carbonyl carbon' }),
    atom('O', 'O', 2, 0, { xyz: [-0.55, 2.0, 0.2] }, { res: 'amide', name: 'the carbonyl oxygen' }),
    atom('N', 'N', 1, 1, { xyz: [1.3, 0.55, 0] }, { res: 'amide', name: 'the amide nitrogen' }),
    atom('Hn', 'H', 0, 0, { xyz: [2.0, 1.25, 0.1] }, { res: 'amide' }),
    atom('Oa', 'O', 2, 0, { xyz: [-1.0, -1.55, 0.7] }, { res: 'water', name: 'the oxygen of the attacking water' }),
    atom('Ha1', 'H', 0, 0, { xyz: [-0.0, -1.95, 0.55] }, { res: 'water' }),
    atom('Ha2', 'H', 0, 0, { xyz: [-1.8, -2.1, 0.8] }, { res: 'water' }),
    atom('Ob', 'O', 2, 0, { xyz: [1.45, -2.0, 0.3] }, { res: 'water', name: 'the oxygen of the helper water' }),
    atom('Hb1', 'H', 0, 0, { xyz: [2.25, -2.55, 0.3] }, { res: 'water' }),
    atom('Hb2', 'H', 0, 0, { xyz: [1.75, -1.1, 0.3] }, { res: 'water' }),
  ],
  bonds: [['C', 'O', 2], ['C', 'N'], ['N', 'Hn'], ['Oa', 'Ha1'], ['Oa', 'Ha2'], ['Ob', 'Hb1'], ['Ob', 'Hb2']],
};

export const water = {
  key: 'water', ...amide,
  equiv: [['Ha1', 'Ha2'], ['Hb1', 'Hb2']],
  allow: { oxyanion: ['O'], oxonium: true },
  ctx: [{ id: 'R1', el: 'C', at: { xyz: [-1.35, 0.45, 0.2] }, bond: 'C', label: 'CH₃' }, { id: 'R2', el: 'C', at: { xyz: [2.55, -0.3, 0] }, bond: 'N', label: 'CH₃' }],
  cut: 3.3, cutH: 3.6,
  steps: [
    { name: 'Water attacks the carbonyl carbon', ref: [L('Ob', 'Ha1'), B('Oa', 'Ha1', 'C', 'Oa'), B('C', 'O', 'O')] },
    { name: 'A proton moves onto the nitrogen', ref: [L('N', 'Ha1'), B('Ob', 'Ha1', 'Ob')] },
    { name: 'The carbon–nitrogen bond breaks', ref: [L('O', 'C'), B('C', 'N', 'N')] },
  ],
};

// ---------------------------------------------------------------------------- 2. Subtilisin BPN'
const h64 = his('H', 'E', 64, 'HID', 'His64');
const d32 = carboxylate('D', { pdb: 'E:32:CG' }, { pdb: 'E:32:OD2' }, { pdb: 'E:32:OD1' }, 'Asp32');
export const subtilisin = {
  key: 'subtilisin',
  ...merge(h64, d32, {
    atoms: [
      atom('Og', 'O', 2, 1, { pdb: 'E:221:OG' }, { res: 'Ser221' }),
      atom('Hg', 'H', 0, 0, { h: ['Og', 'HNe'] }, { res: 'Ser221' }),
      atom('C', 'C', 0, 1, { pdb: 'I:73:C' }, { res: 'substrate', name: 'the carbonyl carbon' }),
      atom('O', 'O', 2, 0, { pdb: 'I:73:O' }, { res: 'substrate', name: 'the carbonyl oxygen' }),
      atom('N', 'N', 1, 1, { pdb: 'I:74:N' }, { res: 'substrate', name: 'the leaving nitrogen' }),
      atom('Hn', 'H', 0, 0, { tri: ['N', 'C', 'I:74:CA'] }, { res: 'substrate' }),
      atom('Ow', 'O', 2, 0, { trilat: ['HNe', 2.9, 'C', 3.0, 'Og'] }, { res: 'water', name: 'the oxygen of the water' }),
      atom('Hw1', 'H', 0, 0, { h: ['Ow', 'HNe'] }, { res: 'water' }),
      atom('Hw2', 'H', 0, 0, { awayH: ['Ow', 'C'] }, { res: 'water' }),
    ],
    bonds: [['Og', 'Hg'], ['C', 'O', 2], ['C', 'N'], ['N', 'Hn'], ['Ow', 'Hw1'], ['Ow', 'Hw2']],
  }),
  equiv: [['DO1', 'DO2'], ['Hw1', 'Hw2']],
  allow: { oxyanion: ['O'] },
  phases: [{ present: null }],
  absent: ['Ow', 'Hw1', 'Hw2'],
  notes: [{ when: (st, spec) => [spec.index.DO1, spec.index.DO2].some((o) => st.b[o * spec.n + spec.index.HHd]), text: 'That moves the proton on to Asp32. This charge relay was proposed in 1969. A neutron structure of trypsin later showed that the base is the histidine, not the aspartate (Kossiakoff & Spencer 1981).' }],
  pdb: '2SIC', body: 'E',
  ctx: ['E:221', 'E:64', 'E:32', 'E:155', 'I:73', 'I:74:CA'],
  threads: [['O', 'E:155:ND2'], ['O', 'E:221:N'], ['HNd', 'DO2'], ['Og', 'HNe']],
  steps: [
    { name: 'Serine attacks the carbonyl', ref: [L('HNe', 'Hg'), B('Og', 'Hg', 'C', 'Og'), B('C', 'O', 'O')] },
    { name: 'The tetrahedral form collapses, and the amine leaves', ref: [L('O', 'C'), B('C', 'N', 'Hg', 'N'), B('HNe', 'Hg', 'HNe')], leave: ['N', 'Hn', 'Hg'] },
    { name: 'Water attacks the acyl-enzyme', enter: ['Ow', 'Hw1', 'Hw2'], ref: [L('HNe', 'Hw1'), B('Ow', 'Hw1', 'C', 'Ow'), B('C', 'O', 'O')] },
    { name: 'The second tetrahedral form collapses, and serine is free', ref: [L('O', 'C'), B('C', 'Og', 'Hw1', 'Og'), B('HNe', 'Hw1', 'HNe')] },
  ],
};

// ---------------------------------------------------------------------------- 3. Ribonuclease A
const h12 = his('A', 'A', 12, 'HID', 'His12');
const h119 = his('B', 'A', 119, 'HIP', 'His119', 'Nd');
export const rnase = {
  key: 'rnase',
  ...merge(h12, h119, {
    atoms: [
      // Crystal 6RSA holds uridine vanadate: vanadium stands for phosphorus, and its apical oxygen for O5′.
      atom('P', 'P', 0, 0, { pdb: 'A:125:V' }, { res: 'RNA', name: 'phosphorus' }),
      atom('Oa', 'O', 2, 0, { pdb: 'A:125:O1V' }, { res: 'RNA', noH: true }),
      atom('Ob', 'O', 3, 0, { pdb: 'A:125:O3V' }, { res: 'RNA', noH: true }),
      atom('O3', 'O', 2, 1, { pdb: "A:125:O3'" }, { res: 'RNA', name: 'the 3′ oxygen', noH: true, show: 'O3′' }),
      atom('O5', 'O', 2, 1, { pdb: 'A:125:O2V' }, { res: 'RNA', name: 'the 5′ oxygen', show: 'O5′', pka: 14.8 }),
      atom('O2', 'O', 2, 1, { pdb: "A:125:O2'" }, { res: 'RNA', name: 'the 2′ oxygen', show: 'O2′' }),
      atom('H2', 'H', 0, 0, { h: ['O2', 'ANe'] }, { res: 'RNA' }),
      atom('Ow', 'O', 2, 0, { along: ['A:125:V', 'A:125:O2V', 3.0] }, { res: 'water', name: 'the oxygen of the water' }),
      atom('Hw1', 'H', 0, 0, { h: ['Ow', 'BNd'] }, { res: 'water' }),
      atom('Hw2', 'H', 0, 0, { awayH: ['Ow', 'P'] }, { res: 'water' }),
    ],
    bonds: [['P', 'Oa', 2], ['P', 'Ob'], ['P', 'O3'], ['P', 'O5'], ['O2', 'H2'], ['Ow', 'Hw1'], ['Ow', 'Hw2']],
  }),
  equiv: [['Oa', 'Ob'], ['Hw1', 'Hw2']],
  absent: ['Ow', 'Hw1', 'Hw2'],
  pdb: '6RSA', body: 'A',
  ctx: ['A:12', 'A:119', 'A:41', 'A:11', "A:125:C1'", "A:125:C2'", "A:125:C3'", "A:125:C4'", "A:125:O4'"],
  threads: [['O2', 'A:41:NZ'], ['Oa', 'A:11:NE2'], ['Ob', 'A:120:N']],
  marks: { Lys41: 'A:41:NZ' },
  steps: [
    { name: 'The 2′ oxygen attacks phosphorus', ref: [L('ANe', 'H2'), B('O2', 'H2', 'P', 'O2'), B('P', 'Oa', 'Oa')] },
    { name: 'The 5′ oxygen leaves with a proton', ref: [L('Oa', 'P'), B('P', 'O5', 'BHd', 'O5'), B('BNd', 'BHd', 'BNd')], leave: ['O5', 'BHd'] },
    { name: 'Water attacks the cyclic phosphate', enter: ['Ow', 'Hw1', 'Hw2'], ref: [L('BNd', 'Hw1'), B('Ow', 'Hw1', 'P', 'Ow'), B('P', 'Oa', 'Oa')] },
    { name: 'The ring opens, and both histidines are reset', ref: [L('Oa', 'P'), B('P', 'O2', 'H2', 'O2'), B('ANe', 'H2', 'ANe')] },
  ],
};

// The same site with other protonation states, for the chapter's second stage.
export function rnaseWith(form12, form119) {
  const swap = (id) => id;
  const a = his('A', 'A', 12, form12, 'His12'), b = his('B', 'A', 119, form119, 'His119', 'Nd');
  const keep = rnase.atoms.filter((x) => !/^[AB](C[gde]|N[de]|H[de])$/.test(x.id));
  const bonds = rnase.bonds.filter(([p, q]) => !/^[AB](C[gde]|N[de]|H[de])$/.test(p) && !/^[AB](C[gde]|N[de]|H[de])$/.test(q));
  return { ...rnase, atoms: [...a.atoms, ...b.atoms, ...keep], bonds: [...a.bonds, ...b.bonds, ...bonds].map((x) => x.map(swap)), steps: [], absent: rnase.absent };
}

// ---------------------------------------------------------------------------- 4. Carbonic anhydrase II
const h64ca = his('H', 'A', 64, 'HIE', 'His64');
export const ca = {
  key: 'ca',
  ...merge(h64ca, {
    atoms: [
      atom('Zn', 'Zn', 0, 0, { pdb: 'A:262:ZN' }, { metal: true, q: 2, sites: 1, name: 'zinc' }),
      atom('Oz', 'O', 3, 0, { pdb: 'A:263:O' }, { res: 'hydroxide', name: 'the zinc-bound hydroxide' }),
      atom('Hz', 'H', 0, 0, { h: ['Oz', 'A:199:OG1'] }, { res: 'hydroxide' }),
      atom('C', 'C', 0, 0, { co2: 'C' }, { res: 'CO₂', name: 'the carbon of CO₂' }),
      atom('O1', 'O', 2, 0, { co2: 'O1' }, { res: 'CO₂' }),
      atom('O2', 'O', 2, 0, { co2: 'O2' }, { res: 'CO₂' }),
      atom('Ow', 'O', 2, 0, { same: ['Oz', [0, 0, 0]] }, { res: 'water', name: 'the oxygen of the incoming water' }),
      atom('Hw1', 'H', 0, 0, { h: ['Ow', 'W1'] }, { res: 'water' }),
      atom('Hw2', 'H', 0, 0, { h: ['Ow', 'A:199:OG1'] }, { res: 'water' }),
      atom('W1', 'O', 2, 0, { pdb: 'A:318:O' }, { res: 'water' }),
      atom('H1a', 'H', 0, 0, { h: ['W1', 'W2'] }, { res: 'water' }),
      atom('H1b', 'H', 0, 0, { awayH: ['W1', 'W2'] }, { res: 'water' }),
      atom('W2', 'O', 2, 0, { pdb: 'A:292:O' }, { res: 'water' }),
      atom('H2a', 'H', 0, 0, { h: ['W2', 'HNd'] }, { res: 'water' }),
      atom('H2b', 'H', 0, 0, { awayH: ['W2', 'HNd'] }, { res: 'water' }),
    ],
    bonds: [['Oz', 'Hz'], ['C', 'O1', 2], ['C', 'O2', 2], ['Ow', 'Hw1'], ['Ow', 'Hw2'], ['W1', 'H1a'], ['W1', 'H1b'], ['W2', 'H2a'], ['W2', 'H2b']],
  }),
  coord: [['Oz', 'Zn']],
  equiv: [['O1', 'O2'], ['Hw1', 'Hw2'], ['H1a', 'H1b'], ['H2a', 'H2b']],
  absent: ['Ow', 'Hw1', 'Hw2'],
  pdb: '2CBA', body: 'A',
  ctx: ['A:94', 'A:96', 'A:119', 'A:199', 'A:64'],
  threads: [['Zn', 'A:94:NE2'], ['Zn', 'A:96:NE2'], ['Zn', 'A:119:ND1'], ['Oz', 'A:199:OG1']],
  steps: [
    { name: 'Hydroxide attacks CO₂', ref: [L('Oz', 'C'), B('C', 'O1', 'O1')] },
    { name: 'Water takes bicarbonate\'s place on zinc', enter: ['Ow', 'Hw1', 'Hw2'], ref: [L('Ow', 'Zn'), B('Oz', 'Zn', 'Oz')], leave: ['Oz', 'Hz', 'C', 'O1', 'O2'] },
    { name: 'A proton runs along the water wire to His64', ref: [L('HNd', 'H2a'), B('W2', 'H2a', 'H1a', 'W2'), B('W1', 'H1a', 'Hw1', 'W1'), B('Ow', 'Hw1', 'Ow')] },
  ],
};

// ---------------------------------------------------------------------------- 5. Triosephosphate isomerase
const h95 = his('H', 'A', 95, 'HIE', 'His95');
const e165 = carboxylate('E', { pdb: 'A:165:CD' }, { pdb: 'A:165:OE1' }, { pdb: 'A:165:OE2' }, 'Glu165');
export const tim = {
  key: 'tim',
  ...merge(h95, e165, {
    atoms: [
      atom('C1', 'C', 0, 1, { pdb: 'A:249:N2' }, { res: 'DHAP', name: 'C1', show: 'C1' }),
      atom('Hc', 'H', 0, 0, { towardFrom: ['C1', 'EO2', 1.09] }, { res: 'DHAP', hc: true, name: 'the pro-R hydrogen of C1' }),
      atom('O1', 'O', 2, 0, { pdb: 'A:249:O2' }, { res: 'DHAP', name: 'O1', show: 'O1' }),
      atom('Ho', 'H', 0, 0, { h: ['O1', 'HNe'] }, { res: 'DHAP' }),
      atom('C2', 'C', 0, 0, { pdb: 'A:249:C1' }, { res: 'DHAP', name: 'C2', show: 'C2' }),
      atom('O2', 'O', 2, 0, { pdb: 'A:249:O1' }, { res: 'DHAP', name: 'O2', show: 'O2' }),
      atom('C3', 'C', 0, 2, { pdb: 'A:249:C2' }, { res: 'DHAP', name: 'C3', show: 'C3' }),
      atom('Op', 'O', 2, 1, { pdb: 'A:249:O1P' }, { res: 'DHAP', name: 'the phosphate oxygen' }),
    ],
    bonds: [['C1', 'Hc'], ['C1', 'O1'], ['O1', 'Ho'], ['C1', 'C2'], ['C2', 'O2', 2], ['C2', 'C3'], ['C3', 'Op']],
  }),
  equiv: [['EO1', 'EO2']],
  allow: { anion: ['HNe'], oxyanion: ['Op'] },
  pdb: '7TIM', body: 'A',
  ctx: ['A:95', 'A:165', 'A:12', 'A:249:P', 'A:249:O2P', 'A:249:O3P', 'A:249:O4P'],
  threads: [['O2', 'A:12:NZ']],
  traps: [{ when: (st, spec) => !st.b[spec.index.C3 * spec.n + spec.index.Op], text: 'Legal, and that is the danger. Phosphate has left: this is the road to methylglyoxal, a toxic side product.' }],
  steps: [
    { name: 'Glu165 takes the pro-R proton from C1', ref: [L('EO2', 'Hc'), BB('C1', 'Hc', 'C1', 'C2'), B('C2', 'O2', 'O2')] },
    { name: 'His95 gives its proton to O2', ref: [L('O2', 'HHe'), B('HNe', 'HHe', 'HNe')] },
    { name: 'His95 takes O1\'s proton as Glu165 gives one to C2', ref: [L('HNe', 'Ho'), BB('O1', 'Ho', 'O1', 'C1'), B('C1', 'C2', 'Hc', 'C2'), B('EO2', 'Hc', 'EO2')] },
  ],
};

// ---------------------------------------------------------------------------- 6. Horse liver alcohol dehydrogenase
const h51 = his('H', 'A', 51, 'HID', 'His51');
export const adh = {
  key: 'adh',
  ...merge(h51, {
    atoms: [
      atom('Zn', 'Zn', 0, 0, { pdb: 'A:375:ZN' }, { metal: true, q: 2, sites: 1, name: 'zinc' }),
      atom('Oa', 'O', 2, 0, { pdb: 'A:378:O' }, { res: 'ethanol', name: 'the alcohol oxygen' }),
      atom('Ha', 'H', 0, 0, { h: ['Oa', 'Os'] }, { res: 'ethanol' }),
      atom('Ca', 'C', 0, 1, { pdb: 'A:378:C2' }, { res: 'ethanol', name: 'C1 of ethanol', show: 'C1' }),
      atom('HR', 'H', 0, 0, { tet2: ['A:378:C2', 'A:378:C1', 'A:378:O'], side: 1, len: 1.09 }, { res: 'ethanol', hc: true, name: 'the pro-R hydrogen', show: 'R' }),
      atom('HS', 'H', 0, 0, { tet2: ['A:378:C2', 'A:378:C1', 'A:378:O'], side: -1, len: 1.09 }, { res: 'ethanol', hc: true, name: 'the pro-S hydrogen', show: 'S' }),
      atom('Os', 'O', 2, 1, { pdb: 'A:48:OG' }, { res: 'Ser48' }),
      atom('Hs', 'H', 0, 0, { h: ['Os', 'Or'] }, { res: 'Ser48' }),
      atom('Or', 'O', 2, 1, { pdb: 'A:377:O2D' }, { res: 'NAD⁺ ribose' }),
      atom('Hr', 'H', 0, 0, { h: ['Or', 'HNe'] }, { res: 'NAD⁺ ribose' }),
      atom('N1', 'N', 0, 1, { pdb: 'A:377:N1N' }, { res: 'NAD⁺', name: 'the ring nitrogen' }),
      atom('C2', 'C', 0, 1, { pdb: 'A:377:C2N' }, { res: 'NAD⁺' }),
      atom('C3', 'C', 0, 1, { pdb: 'A:377:C3N' }, { res: 'NAD⁺' }),
      atom('C4', 'C', 0, 1, { pdb: 'A:377:C4N' }, { res: 'NAD⁺', name: 'C4 of the ring', show: 'C4' }),
      atom('C5', 'C', 0, 1, { pdb: 'A:377:C5N' }, { res: 'NAD⁺' }),
      atom('C6', 'C', 0, 1, { pdb: 'A:377:C6N' }, { res: 'NAD⁺' }),
    ],
    bonds: [['Oa', 'Ha'], ['Oa', 'Ca'], ['Ca', 'HR'], ['Ca', 'HS'], ['Os', 'Hs'], ['Or', 'Hr'], ['N1', 'C2'], ['N1', 'C6', 2], ['C6', 'C5'], ['C5', 'C4', 2], ['C4', 'C3'], ['C3', 'C2', 2]],
  }),
  coord: [['Oa', 'Zn']],
  allow: { oxyanion: [] },
  pdb: '4DXH', body: 'A',
  ctx: ['A:48', 'A:51', 'A:46:SG', 'A:174:SG', 'A:67', 'A:378:C1', 'A:377:C7N', 'A:377:O7N', 'A:377:N7N'],
  threads: [['Zn', 'A:46:SG'], ['Zn', 'A:174:SG'], ['Zn', 'A:67:NE2']],
  steps: [
    { name: 'A proton relay empties the alcohol', ref: [L('HNe', 'Hr'), B('Or', 'Hr', 'Hs', 'Or'), B('Os', 'Hs', 'Ha', 'Os'), B('Oa', 'Ha', 'Oa')] },
    { name: 'Hydride moves from C1 to NAD⁺', ref: [L('Oa', 'Ca'), B('Ca', 'HR', 'C4', 'HR'), BB('C4', 'C5', 'C5', 'C6'), B('C6', 'N1', 'N1')] },
  ],
};

// ---------------------------------------------------------------------------- 7. Aspartate aminotransferase
export const aat = {
  key: 'aat',
  atoms: [
    atom('N1', 'N', 0, 0, { pdb: 'A:411:N1' }, { res: 'PLP', name: 'the pyridine nitrogen' }),
    atom('H1', 'H', 0, 0, { h: ['N1', 'A:222:OD2'] }, { res: 'PLP' }),
    atom('C2', 'C', 0, 1, { pdb: 'A:411:C2' }, { res: 'PLP' }),
    atom('C3', 'C', 0, 0, { pdb: 'A:411:C3' }, { res: 'PLP' }),
    atom('O3', 'O', 3, 0, { pdb: 'A:411:O3' }, { res: 'PLP' }),
    atom('C4', 'C', 0, 0, { pdb: 'A:411:C4' }, { res: 'PLP' }),
    atom('C5', 'C', 0, 1, { pdb: 'A:411:C5' }, { res: 'PLP' }),
    atom('C6', 'C', 0, 1, { pdb: 'A:411:C6' }, { res: 'PLP' }),
    atom('Cp', 'C', 0, 1, { pdb: 'A:411:C4A' }, { res: 'PLP', name: 'C4′', show: 'C4′' }),
    atom('Ni', 'N', 0, 0, { pdb: 'A:411:N' }, { res: 'Schiff base', name: 'the Schiff-base nitrogen' }),
    atom('Hi', 'H', 0, 0, { h: ['Ni', 'O3'] }, { res: 'Schiff base' }),
    atom('Ca', 'C', 0, 2, { pdb: 'A:411:CA' }, { res: 'aspartate', name: 'the alpha carbon', show: 'Cα' }),
    atom('Ha', 'H', 0, 0, { tet: ['A:411:CA', 'A:411:N', 'A:411:CB', 'A:411:C'] }, { res: 'aspartate', hc: true, name: 'the alpha hydrogen' }),
    atom('Nz', 'N', 1, 3, { pdb: 'A:258:NZ' }, { res: 'Lys258' }),
  ],
  bonds: [['N1', 'H1'], ['N1', 'C2'], ['N1', 'C6', 2], ['C6', 'C5'], ['C5', 'C4', 2], ['C4', 'C3'], ['C3', 'C2', 2], ['C3', 'O3'], ['C4', 'Cp'], ['Cp', 'Ni', 2], ['Ni', 'Hi'], ['Ni', 'Ca'], ['Ca', 'Ha']],
  allow: { oxyanion: [] },
  pdb: '1ARG', body: 'A',
  ctx: ['A:258', 'A:222', 'A:225', 'A:386', 'A:411:C', 'A:411:O', 'A:411:OXT', 'A:411:CB', 'A:411:CG', 'A:411:OD1', 'A:411:OD2', 'A:411:C2A', 'A:411:C5A'],
  threads: [['H1', 'A:222:OD2'], ['O3', 'A:225:OH']],
  steps: [
    { name: 'Lys258 takes the alpha proton, and the ring takes the electrons', ref: [L('Nz', 'Ha'), BB('Ca', 'Ha', 'Ca', 'Ni'), BB('Ni', 'Cp', 'Cp', 'C4'), BB('C4', 'C5', 'C5', 'C6'), B('C6', 'N1', 'N1')], needLp: 'N1', spreadText: 'Legal, but the charge is still crowded near the alpha carbon. Keep pushing it into the ring.' },
    { name: 'The ring gives the electrons back, and C4′ takes the proton', ref: [LB('N1', 'N1', 'C6'), BB('C6', 'C5', 'C5', 'C4'), B('C4', 'Cp', 'Ha', 'Cp'), B('Nz', 'Ha', 'Nz')] },
  ],
};

// ---------------------------------------------------------------------------- 8. Lysozyme
const e35 = {
  atoms: [
    atom('EC', 'C', 0, 1, { pdb: 'A:35:CD' }, { res: 'Glu35' }),
    // The crystal holds the E35Q mutant. Its two end atoms stand in for the oxygens of Glu35.
    atom('EO1', 'O', 2, 0, { pdb: 'A:35:NE2' }, { res: 'Glu35' }),
    atom('EO2', 'O', 2, 0, { pdb: 'A:35:OE1' }, { res: 'Glu35' }),
    atom('EH', 'H', 0, 0, { h: ['EO2', 'Oi'] }, { res: 'Glu35' }),
  ],
  bonds: [['EC', 'EO1', 2], ['EC', 'EO2'], ['EO2', 'EH']],
};
const d52 = carboxylate('D', { pdb: 'A:52:CG' }, { pdb: 'A:52:OD1' }, { pdb: 'A:52:OD2' }, 'Asp52');
export const lysozyme = {
  key: 'lysozyme',
  ...merge(e35, d52, {
    atoms: [
      atom('C1', 'C', 0, 2, { pdb: 'B:1:C1' }, { res: 'sugar', name: 'C1 of the sugar', show: 'C1' }),
      atom('O5', 'O', 2, 1, { pdb: 'B:1:O5' }, { res: 'sugar', name: 'the ring oxygen' }),
      // By rule: 1.42 Å from C1, directly opposite Asp52, as a backside attack needs. The crystal holds no such atom.
      atom('Oi', 'O', 2, 1, { along: ['B:1:C1', 'A:52:OD2', -1.42] }, { res: 'sugar', name: 'the glycosidic oxygen' }),
      atom('Ow', 'O', 2, 0, { trilat: ['EO2', 2.8, 'C1', 3.0, 'DO2'] }, { res: 'water', name: 'the oxygen of the water' }),
      atom('Hw1', 'H', 0, 0, { h: ['Ow', 'EO2'] }, { res: 'water' }),
      atom('Hw2', 'H', 0, 0, { awayH: ['Ow', 'C1'] }, { res: 'water' }),
    ],
    bonds: [['C1', 'O5'], ['C1', 'Oi'], ['Ow', 'Hw1'], ['Ow', 'Hw2']],
  }),
  equiv: [['DO1', 'DO2'], ['Hw1', 'Hw2']],
  allow: { oxyanion: [] },
  absent: ['Ow', 'Hw1', 'Hw2'],
  // Glu35 sits 5.6 Å from that oxygen in this crystal, beyond the usual reach. The hop is allowed by hand, and the chapter says so.
  hops: [['EO2', 'Oi']],
  // That exception is for Glu35 alone: it must not carry the proton on through Oi to Asp52.
  noHop: [['Oi', 'DO1'], ['Oi', 'DO2']],
  pdb: '1H6M', body: 'A',
  ctx: ['A:35', 'A:52', 'B:1:C2', 'B:1:C3', 'B:1:C4', 'B:1:C5', 'B:1:C6'],
  threads: [],
  steps: [
    {
      name: 'The bond to the next sugar breaks',
      ref: [L('DO2', 'C1'), B('C1', 'Oi', 'EH', 'Oi'), B('EO2', 'EH', 'EO2')],
      alt: [[B('C1', 'Oi', 'EH', 'Oi'), B('EO2', 'EH', 'EO2'), L('O5', 'C1')]],
      leave: ['Oi', 'EH'],
    },
    { name: 'Water finishes the job', enter: ['Ow', 'Hw1', 'Hw2'], ref: [L('EO2', 'Hw1'), B('Ow', 'Hw1', 'C1', 'Ow'), B('C1', 'DO2', 'DO2')] },
  ],
};

// ---------------------------------------------------------------------------- 9. OMP decarboxylase
export const ompdc = {
  key: 'ompdc',
  atoms: [
    atom('N1', 'N', 1, 1, { pdb: 'A:601:N1' }, { res: 'OMP' }),
    atom('C2', 'C', 0, 0, { pdb: 'A:601:C2' }, { res: 'OMP' }),
    atom('O2', 'O', 2, 0, { pdb: 'A:601:O2' }, { res: 'OMP' }),
    atom('N3', 'N', 1, 1, { pdb: 'A:601:N3' }, { res: 'OMP' }),
    atom('C4', 'C', 0, 0, { pdb: 'A:601:C4' }, { res: 'OMP' }),
    atom('O4', 'O', 2, 0, { pdb: 'A:601:O4' }, { res: 'OMP' }),
    atom('C5', 'C', 0, 1, { pdb: 'A:601:C5' }, { res: 'OMP' }),
    atom('C6', 'C', 0, 0, { pdb: 'A:601:C6' }, { res: 'OMP', name: 'C6', show: 'C6' }),
    atom('C7', 'C', 0, 0, { along: ['A:601:C6', 'A:601:O1', 1.52] }, { res: 'carboxylate', name: 'the carboxylate carbon' }),
    atom('O7', 'O', 2, 0, { sp2sub: ['C7', 'C6', 1] }, { res: 'carboxylate' }),
    atom('O8', 'O', 3, 0, { sp2sub: ['C7', 'C6', -1] }, { res: 'carboxylate' }),
    atom('Nz', 'N', 0, 3, { pdb: 'A:93:NZ' }, { res: 'Lys93' }),
    atom('Hz', 'H', 0, 0, { h: ['Nz', 'C6'] }, { res: 'Lys93' }),
  ],
  bonds: [['N1', 'C2'], ['C2', 'O2', 2], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'O4', 2], ['C4', 'C5'], ['C5', 'C6', 2], ['C6', 'N1'], ['C6', 'C7'], ['C7', 'O7', 2], ['C7', 'O8'], ['Nz', 'Hz']],
  allow: { carbanion: ['C6'], oxyanion: [] },
  equiv: [['O7', 'O8']],
  pdb: '1DQX', body: 'A',
  ctx: ['A:93', 'A:91', 'B:96', 'A:601:C1\'', 'A:601:O4\''],
  threads: [['Nz', 'A:91:OD1'], ['Nz', 'B:96:OD2']],
  steps: [
    { name: 'The carbon–carbon bond breaks, and CO₂ leaves', ref: [L('O8', 'C7'), B('C6', 'C7', 'C6')], leave: ['C7', 'O7', 'O8'] },
    { name: 'Lys93 gives C6 its proton', ref: [L('C6', 'Hz'), B('Nz', 'Hz', 'Nz')] },
  ],
};

export const MECHS = { water, subtilisin, rnase, ca, tim, adh, aat, lysozyme, ompdc };
