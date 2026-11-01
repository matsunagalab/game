// Decodes the packed real data. See tools/pack_data.mjs for where each piece came from.
import bundle from '../data/bundle.js';
import { framesOf } from './frames.js';

const b64 = (s) => {
  if (typeof atob === 'function') {
    const t = atob(s), u = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i += 1) u[i] = t.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
};

function points(s) {
  const u = b64(s), v = new Int16Array(u.buffer, u.byteOffset, u.length / 2), out = [];
  for (let i = 0; i < v.length; i += 3) out.push([v[i] / 100, v[i + 1] / 100, v[i + 2] / 100]);
  return out;
}

export function structure(s) {
  const atoms = { n: points(s.n), ca: points(s.ca), c: points(s.c), cb: points(s.cb) };
  const out = { ...s, ...atoms, frames: framesOf(atoms), length: atoms.ca.length };
  if (s.plddt) {
    const u = b64(s.plddt);
    out.plddt = Array.from(new Uint16Array(u.buffer.slice(u.byteOffset, u.byteOffset + u.length)), (v) => v / 100);
  }
  return out;
}

function letters5({ N, L, letters }) {
  const bits = b64(letters), X = new Uint8Array(N * L);
  let bit = 0;
  for (let i = 0; i < N * L; i += 1) {
    let v = 0;
    for (let k = 0; k < 5; k += 1) { v = (v << 1) | ((bits[bit >> 3] >> (7 - (bit & 7))) & 1); bit += 1; }
    X[i] = v;
  }
  return X;
}

export function loadMSA() {
  const { N, L } = bundle.msa;
  return { N, L, X: letters5(bundle.msa), col2res: bundle.col2res, nFamily: bundle.nSeenInFamily, pfam: bundle.pfam };
}

// The second family: real SH3 domains, for a case the player has not seen.
export function loadSH3() {
  const s = bundle.sh3;
  return { N: s.N, L: s.L, X: letters5(s), col2res: s.col2res, nFamily: s.nSeenInFamily, pfam: s.pfam };
}

const cache = new Map();
export function getStructure(key) {
  if (!cache.has(key)) cache.set(key, structure(bundle.structures[key]));
  return cache.get(key);
}
export function getModel(acc) {
  if (!cache.has(acc)) cache.set(acc, structure(bundle.afdb[acc]));
  return cache.get(acc);
}
export const hasModel = (acc) => !!bundle.afdb[acc];

// Real predicted aligned error from AlphaFold DB, in angstroms. Row i, column j: the expected error at j, aligned on i.
export function getPAE(acc) {
  const p = bundle.paes?.[acc];
  if (!p) return null;
  const u = b64(p.e), e = new Float32Array(u.length);
  for (let i = 0; i < u.length; i += 1) e[i] = u[i] / 2;
  return { n: p.n, e };
}

// Closest heavy atoms of two residues of 3CHY, by residue number, in angstroms.
export function closestAtoms() {
  const { nums, d } = bundle.heavy, u = b64(d), n = nums.length, at = new Map(nums.map((v, i) => [v, i]));
  return (a, b) => (at.has(a) && at.has(b) ? u[at.get(a) * n + at.get(b)] / 10 : Infinity);
}

// C-beta distances for the columns of the alignment, read from the real structure. -1 where a column has no residue.
export function columnDistances(msa, st) {
  const { L, col2res } = msa, D = new Float32Array(L * L).fill(-1);
  for (let i = 0; i < L; i += 1) {
    const a = col2res[i];
    if (a < 0) continue;
    for (let j = 0; j < L; j += 1) {
      const b = col2res[j];
      if (b < 0) continue;
      const p = st.cb[a], q = st.cb[b];
      D[i * L + j] = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    }
  }
  return D;
}
