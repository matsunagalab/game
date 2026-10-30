// Decodes the coordinate data made by tools/make_data.mjs.
import raw from './data/sites.json';

const coords = (s) => {
  const b = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const i = new Int16Array(b.buffer);
  const f = new Float32Array(i.length);
  for (let k = 0; k < i.length; k++) f[k] = i[k] / 100;
  return f;
};

const NAMES = { ALA: 'Ala', ARG: 'Arg', ASN: 'Asn', ASP: 'Asp', CYS: 'Cys', GLN: 'Gln', GLU: 'Glu', GLY: 'Gly', HIS: 'His', ILE: 'Ile', LEU: 'Leu', LYS: 'Lys', MET: 'Met', PHE: 'Phe', PRO: 'Pro', SER: 'Ser', THR: 'Thr', TRP: 'Trp', TYR: 'Tyr', VAL: 'Val', KCX: 'Carbamyl-Lys', HOH: 'Water', HEM: 'Heme', HEC: 'Heme c', OXY: 'O_2', X8Z: 'Captopril', DUP: 'dUMPNPP', DC: 'Primer dC', B12: 'Cobalamin', HCA: 'Homocitrate', ICS: 'FeMo-cofactor', OEX: 'Mn_4CaO_5', SF4: 'Fe_4S_4' };
const GREEK = { A: 'α', B: 'β', G: 'γ', D: 'δ', E: 'ε', Z: 'ζ', H: 'η' };

const COFACTOR = new Set(['HEM', 'HEC', 'X8Z', 'DUP', 'DC', 'B12', 'HCA', 'ICS', 'OEX', 'SF4']);

// Writes an atom name the way a structural biologist reads it: NE2 becomes Nε2.
export function atomLabel(a) {
  if (a.res === 'HOH') return 'Water';
  if (a.res === 'OXY') return 'O_2';
  const res = NAMES[a.res] ?? a.res;
  if (COFACTOR.has(a.res)) return `${res} ${a.name}`;
  const m = /^([NOS])([ABGDEZH])(\d?)$/.exec(a.name);
  return `${res}${a.num} ${m ? `${m[1]}${GREEK[m[2]]}${m[3]}` : a.name}`;
}

export const resLabel = (a) => {
  if (a.res === 'HOH') return 'Water';
  return `${NAMES[a.res] ?? a.res}${COFACTOR.has(a.res) || a.res === 'OXY' ? '' : a.num}`;
};

const cache = new Map();

export function site(key) {
  if (cache.has(key)) return cache.get(key);
  const d = raw.find((x) => x.key === key);
  if (!d) throw new Error(`No site named ${key}`);
  const out = {
    ...d,
    chains: d.chains.map((c) => ({ ...c, ca: coords(c.ca), o: coords(c.o) })),
    nucleic: d.nucleic.map(coords),
    atoms: d.atoms.map(([el, name, res, num, chain, x, y, z, b]) => ({ el, name, res, num, chain, x, y, z, b, sel: `${chain}${num}.${name}` })),
  };
  cache.set(key, out);
  return out;
}

export const allSites = () => raw;
