// Where atoms sit once the bonds have changed. A small constraint solver, a teaching model:
// crystal protein atoms stay near their measured places, substrate atoms and hydrogens follow the bonds.
// It knows bond lengths and angles from the state, so it works for any route the player finds.
import { neighbours } from './engine.js';

const LEN = { 'C-C': [1.52, 1.34], 'C-O': [1.43, 1.23], 'C-N': [1.47, 1.29], 'C-H': [1.09], 'N-H': [1.02], 'H-O': [0.98], 'O-P': [1.6, 1.48], 'C-F': [1.36] };
const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
function bondLength(ea, eb, order) { const l = LEN[key(ea, eb)]; if (!l) return 1.5; return l[Math.min(order, l.length) - 1]; }

export function relax(st, base, prev, iters = 80) {
  const { spec } = st, { n, atoms } = spec;
  const p = atoms.map((a) => (prev[a.id] || base[a.id]).slice());
  const anchor = atoms.map((a) => {
    if (a.el === 'H') return 0;
    if (a.metal) return 1;
    return a.at?.pdb && !a.res?.match(/substrate|DHAP|ethanol|sugar|OMP|carboxylate|aspartate|Schiff|RNA|amide|water/i) ? 0.5 : 0.1;
  });
  const push = (i, j, d, k = 0.5) => {
    const pi = p[i], pj = p[j], x = pj[0] - pi[0], y = pj[1] - pi[1], z = pj[2] - pi[2];
    const l = Math.hypot(x, y, z) || 1e-3, e = (l - d) / l;
    const ai = 1 - anchor[i], aj = 1 - anchor[j], w = ai + aj || 1;
    const mi = k * e * ai / w * 2 * 0.5, mj = k * e * aj / w * 2 * 0.5;
    pi[0] += x * mi; pi[1] += y * mi; pi[2] += z * mi;
    pj[0] -= x * mj; pj[1] -= y * mj; pj[2] -= z * mj;
  };
  const bonds = [], angles = [];
  for (let i = 0; i < n; i++) {
    if (!st.on[i]) continue;
    const nb = neighbours(st, i).filter((j) => st.on[j]);
    for (const j of nb) if (j > i) bonds.push([i, j, bondLength(atoms[i].el, atoms[j].el, st.b[i * n + j])]);
    const heavy = nb.length + (atoms[i].x || 0);
    const cos = heavy >= 4 ? -0.33 : heavy === 3 ? -0.5 : atoms[i].el === 'O' ? -0.3 : -1;
    for (let u = 0; u < nb.length; u++) for (let v = u + 1; v < nb.length; v++) {
      const a = nb[u], b = nb[v], la = bondLength(atoms[i].el, atoms[a].el, st.b[i * n + a]), lb = bondLength(atoms[i].el, atoms[b].el, st.b[i * n + b]);
      angles.push([a, b, Math.sqrt(la * la + lb * lb - 2 * la * lb * cos)]);
    }
  }
  const bonded = new Set(bonds.map(([i, j]) => i * n + j));
  for (const [a, b] of angles) bonded.add(Math.min(a, b) * n + Math.max(a, b));
  for (let it = 0; it < iters; it++) {
    for (const [i, j, d] of bonds) push(i, j, d, 0.9);
    for (const [a, b, d] of angles) push(a, b, d, 0.4);
    for (let i = 0; i < n; i++) {
      if (!st.on[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!st.on[j] || bonded.has(i * n + j)) continue;
        const hh = (atoms[i].el === 'H') + (atoms[j].el === 'H');
        const min = hh === 2 ? 1.5 : hh === 1 ? 1.7 : 2.5;
        const pi = p[i], pj = p[j], l = Math.hypot(pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2]);
        if (l < min) push(i, j, min, 0.5);
      }
    }
    for (let i = 0; i < n; i++) {
      const k = anchor[i] * 0.3, b = base[atoms[i].id], q = p[i];
      if (!k) continue;
      q[0] += (b[0] - q[0]) * k; q[1] += (b[1] - q[1]) * k; q[2] += (b[2] - q[2]) * k;
    }
  }
  const out = {};
  atoms.forEach((a, i) => { out[a.id] = p[i].map((v) => +v.toFixed(3)); });
  return out;
}
