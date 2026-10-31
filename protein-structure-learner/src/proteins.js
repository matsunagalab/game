// Decodes the compact coordinate data, and holds the colour language of the game.
import raw from './data/proteins.json';
import { dssp } from './science/dssp.js';

const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const coords = (s) => {
  const b = bytes(s);
  const i = new Int16Array(b.buffer);
  const f = new Float32Array(i.length);
  for (let k = 0; k < i.length; k++) f[k] = i[k] / 100;
  return f;
};

const cache = new Map();

export function protein(key) {
  if (cache.has(key)) return cache.get(key);
  const p = raw.find((x) => x.key === key);
  if (!p) throw new Error(`No protein named ${key}`);
  const n = p.seq.length;
  const chainEnds = [];
  for (let i = 0; i < n - 1; i++) if (p.chain[i] !== p.chain[i + 1]) chainEnds.push(i);
  const out = {
    ...p,
    n,
    chainEnds,
    caXYZ: coords(p.ca),
    oXYZ: coords(p.o),
    nXYZ: coords(p.n),
    cXYZ: coords(p.c),
    atomXYZ: coords(p.atoms.xyz),
    atomRes: new Uint16Array(bytes(p.atoms.res).buffer),
    atomEl: p.atoms.el,
    atomSide: p.atoms.side,
    hetXYZ: p.het ? coords(p.het.xyz) : null,
    hetEl: p.het?.el ?? '',
    freeArea: p.free ? bytes(p.free) : null,
  };
  cache.set(key, out);
  return out;
}

// The backbone of a protein as the science code wants it, with its DSSP assignment worked out once.
const folds = new Map();
export function foldOf(key) {
  if (folds.has(key)) return folds.get(key);
  const p = protein(key);
  const bb = { n: p.n, seq: p.seq, chain: p.chain, nXYZ: p.nXYZ, caXYZ: p.caXYZ, cXYZ: p.cXYZ, oXYZ: p.oXYZ };
  const out = { p, bb, d: dssp(bb) };
  folds.set(key, out);
  return out;
}

// Residue index from a PDB residue number, within one chain.
export const indexOf = (p, resno, chain = 0) => {
  for (let i = 0; i < p.n; i++) if (p.resno[i] === resno && p.chain[i] === chain) return i;
  throw new Error(`No residue ${resno} in ${p.key}`);
};

// Area each atom loses, decoded from the base64 byte lists.
export const atomBytes = (s) => bytes(s);

// Ink recipes as [pink, yellow, blue].
export const TONE = {
  helix: [1, 0, 0],
  strand: [0, 1, 0],
  loop: [0, 0, 0.26],
  oil: [0.34, 1, 0],
  polar: [0, 0, 0.3],
  plus: [1, 0, 0.1],
  minus: [0, 0, 0.92],
  special: [0, 0.3, 0.12],
  carbon: [0, 0, 0.2],
  nitrogen: [0, 0, 0.95],
  oxygen: [1, 1, 0],
  hydrogen: [0, 0, 0],
  sulfur: [0, 1, 0],
};

export const classOf = (aa) => {
  if ('AVILMFWC'.includes(aa)) return 'oil';
  if ('KR'.includes(aa)) return 'plus';
  if ('DE'.includes(aa)) return 'minus';
  if ('GP'.includes(aa)) return 'special';
  return 'polar';
};

export const ssTone = (s) => (s === 'H' ? TONE.helix : s === 'E' ? TONE.strand : TONE.loop);

export const ELEMENT_R = { C: 1.7, N: 1.55, O: 1.52, S: 1.8 };
