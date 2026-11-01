// Reads backbone angles from legacy PDB files, with strict quality filters. Used by pack_data.mjs.
import { readFileSync } from 'node:fs';

const AA = 'ARNDCQEGHILKMFPSTWYV';
const THREE = { ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V' };
export { AA, THREE };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function dihedral(p0, p1, p2, p3) {
  const b0 = sub(p0, p1), b1 = sub(p2, p1), b2 = sub(p3, p2), n = Math.sqrt(dot(b1, b1));
  const u = [b1[0] / n, b1[1] / n, b1[2] / n];
  const k0 = dot(b0, u), k2 = dot(b2, u);
  const v = [b0[0] - k0 * u[0], b0[1] - k0 * u[1], b0[2] - k0 * u[2]];
  const w = [b2[0] - k2 * u[0], b2[1] - k2 * u[1], b2[2] - k2 * u[2]];
  return Math.atan2(dot(cross(u, v), w), dot(v, w)) * 180 / Math.PI;
}

// The residues of the first protein chain of the first model. Atoms with a second conformer are refused.
export function firstChain(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const res = new Map();
  let chain = null;
  for (const l of lines) {
    if (l.startsWith('ENDMDL')) break;
    if (!l.startsWith('ATOM  ')) continue;
    const name = l.slice(12, 16).trim(), rn = l.slice(17, 20).trim(), ch = l[21], alt = l[16];
    if (!(rn in THREE)) continue;
    if (chain === null) chain = ch;
    if (ch !== chain) continue;
    const key = l.slice(22, 27);
    let r = res.get(key);
    if (!r) { r = { aa: THREE[rn], atoms: {}, ok: true }; res.set(key, r); }
    const occ = parseFloat(l.slice(54, 60)), b = parseFloat(l.slice(60, 66));
    if (['N', 'CA', 'C', 'O'].includes(name)) {
      if (alt !== ' ' || occ < 1) r.ok = false;
      if (b >= 30) r.ok = false;
      r.atoms[name] = [parseFloat(l.slice(30, 38)), parseFloat(l.slice(38, 46)), parseFloat(l.slice(46, 54))];
    }
  }
  return [...res.values()];
}

export function angles(residues) {
  const out = [];
  for (let i = 1; i + 1 < residues.length; i += 1) {
    const p = residues[i - 1], r = residues[i], n = residues[i + 1];
    if (!r.ok || !p.ok || !n.ok) continue;
    const need = (x, ...a) => a.every((k) => x.atoms[k]);
    if (!need(p, 'C') || !need(r, 'N', 'CA', 'C') || !need(n, 'N')) continue;
    if (dist(p.atoms.C, r.atoms.N) > 1.45 || dist(r.atoms.C, n.atoms.N) > 1.45) continue;
    const phi = dihedral(p.atoms.C, r.atoms.N, r.atoms.CA, r.atoms.C);
    const psi = dihedral(r.atoms.N, r.atoms.CA, r.atoms.C, n.atoms.N);
    out.push({ aa: r.aa, phi, psi, prePro: n.aa === 'P' });
  }
  return out;
}
