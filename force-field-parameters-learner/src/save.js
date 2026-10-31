// The player's force field and everything that survives a reload.
export const PLATES = [
  { id: 'organ',  term: 0, no: 'I',    title: 'Organ stops' },
  { id: 'helix',  term: 0, no: 'II',   title: 'A tenth of a kcal/mol' },
  { id: 'cross',  term: 1, no: 'III',  title: 'What torsions cannot do' },
  { id: 'paint',  term: 1, no: 'IV',   title: 'Painting the map' },
  { id: 'esp',    term: 2, no: 'V',    title: 'Charges from a field' },
  { id: 'liquid', term: 2, no: 'VI',   title: 'A dipole for two worlds' },
  { id: 'salt',   term: 2, no: 'VII',  title: 'The salt bridge' },
  { id: 'argon',  term: 3, no: 'VIII', title: 'A liquid from two numbers' },
  { id: 'chain',  term: 3, no: 'IX',   title: 'The chain that collapses' },
  { id: 'pair',   term: 3, no: 'X',    title: 'Protein, water, protein' },
  { id: 'sampling', term: 4, no: 'XI', title: 'Force field or sampling?' },
  { id: 'meta',   term: 4, no: 'XII',  title: 'Metastable' },
];

export const TIERS = ['', 'Major revision', 'Minor revision', 'Accepted'];

const KEY = 'ff-learner-4-force-field-development';
const blank = () => ({
  tiers: {},
  ff: {
    V: null, on14: false, kPsi: null, sTrade: null, cmapDone: false, q: null, respA: null, qWater: null,
    qSalt: null, rArg: null, rLys: null, sigma: null, eps: null, gamma: null, E: null, meta: null, card: null, muted: false,
  },
});

export const save = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); const b = blank(); return { ...b, ...s, ff: { ...b.ff, ...s.ff } }; }
  } catch { /* private browsing: play without saving */ }
  return blank();
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

export function resetSave() {
  const b = blank();
  save.tiers = b.tiers; save.ff = b.ff;
  persist();
}

const n = (v, d = 3) => (v == null ? '(not fitted)' : Number(v).toFixed(d));

// The player's parameters, as a plain parameter file.
export function frcmod() {
  const { ff } = save;
  const L = ['ff26: developed by hand', ''];
  L.push('DIHE  butane, kcal/mol');
  if (ff.V) ff.V.forEach((v, i) => L.push(`  V${i + 1}  ${n(v, 2)}`));
  else L.push('  (not fitted)');
  L.push(`  1-4 nonbonded  ${ff.on14 ? 'on, scaled 1/2' : 'off'}`, '');
  L.push(`HELIX  psi correction k = ${n(ff.kPsi)} kcal/mol, enthalpy-entropy trade = ${n(ff.sTrade, 2)} kcal/mol`, '');
  L.push(`CMAP  24x24 grid: ${ff.cmapDone ? 'painted' : '(not painted)'}`, '');
  L.push('CHARGE  N-methylacetamide, e');
  if (ff.q) ff.q.forEach((v, i) => L.push(`  ${['CA', 'HA', 'C', 'O', 'N', 'HN', 'CM', 'HM'][i].padEnd(3)} ${n(v)}`));
  else L.push('  (not fitted)');
  L.push(`  RESP restraint a = ${n(ff.respA, 4)} au`, `  water qO = ${n(ff.qWater)}`, '');
  L.push(`NBFIX  charge scale ${n(ff.qSalt)}`, `  Arg-Asp Rmin ${n(ff.rArg)}`, `  Lys-Asp Rmin ${n(ff.rLys)}`, '');
  L.push(`NONB  argon sigma ${n(ff.sigma)}  eps ${n(ff.eps)}`, `  protein-water scale ${n(ff.gamma)}`, `  protein-protein scale ${n(ff.E)}`, '');
  if (ff.meta) L.push('FINALE', ...Object.entries(ff.meta).map(([k, v]) => `  ${k.padEnd(8)} ${n(v)}`));
  return L.join('\n');
}

export function nextPlate() {
  return PLATES.findIndex(p => !save.tiers[p.id]);
}
