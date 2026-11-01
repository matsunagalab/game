// A real protein you can pull: an approximate physical model, cheap enough for a phone. No browser code here.
//
// Atoms: all heavy atoms plus polar hydrogens. Lys and the N-terminus carry their hydrogens inside the nitrogen.
// Covalent shape: stiff springs on bonds and angles, generic torsions, rigid planes for peptides, rings and amides.
// Charges: Amber ff14SB, with non-polar hydrogens merged, and a screened Coulomb sum. Nothing lists which atoms should bond,
//   so any donor can meet any acceptor, and direction comes from where the hydrogen sits.
// Water: EEF1, with the PLUMED EEFSolv table (EEF1-SB, Bottaro et al. 2013), after Lazaridis & Karplus 1999. Each atom has a solvation free energy
//   that its neighbours' volume excludes. Oil has no partner identity in this term, and burying a polar atom costs energy, so a buried bond and a
//   surface bond differ without being told.
// Memory: a strong Go-type memory of the C-alpha contacts, 425 and 525 wells taken from the crystal. This is the unreal part and it is declared on
//   the board. It pays for most of a pull and sets the register. Charges then tighten each bond by about 0.5 A. Without it a big pull does not
//   return, while a small pull still does.
// Time is not real. All atoms share one mass so that the step can be large. The ensemble is still Langevin at the set temperature,
// which is what lets occupancies be compared with real MD.

const ONE = { A: 'ALA', R: 'ARG', N: 'ASN', D: 'ASP', C: 'CYS', Q: 'GLN', E: 'GLU', G: 'GLY', H: 'HIS', I: 'ILE', L: 'LEU', K: 'LYS', M: 'MET', F: 'PHE', P: 'PRO', S: 'SER', T: 'THR', W: 'TRP', Y: 'TYR', V: 'VAL' };
export const THREE_OF = ONE;

export const DEFAULTS = {
  kT: 0.6,          // kcal/mol at 300 K
  alpha: 0.003,     // dt^2 / mass, in A^2 per (kcal/mol)
  friction: 0.88,   // velocity kept per step
  speedLimit: 0.3,  // A per step, a guard against a numerical blow-up
  kappa: 1.6,       // dielectric = kappa * r
  ion: 0.55,        // charged side chains keep this share of their net charge
  bond: 200,
  angle: 70,
  plane: 40,
  torsion: 1.5,     // scale on the generic torsions
  rama: 1,          // weight on the backbone map
  memory: 5,        // depth of one C-alpha well, kcal/mol
  memoryWidth: 4,   // A
  memoryReach: 12,  // pairs closer than this in the crystal
  memoryGap: 3,
  solvent: 1,
  cutoff: 7,
  nearCut: 4.5,
  skin: 1.2,
  rH: 0.25,         // Lennard-Jones contact radius of a polar hydrogen
  rN: 1.85,         // of nitrogen
  rO: 1.7,          // of oxygen
  eps: 0.15,
  screen: 0.35,     // an exposed charge pair keeps this share of its strength; a buried pair keeps all of it
  screenBackbone: 0.7,
  screenIon: 0.6,   // for charged side-chain groups
  buryLow: 16,      // heavy neighbours within 6.5 A: at or under this an atom counts as exposed
  buryHigh: 36,     // at or over this it counts as buried
  stride: 3,        // far pairs are refreshed once in this many steps
  rebuild: 15,
  seed: 1,
};

const PLANES = {
  PHE: ['CB', 'CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ'],
  TYR: ['CB', 'CG', 'CD1', 'CD2', 'CE1', 'CE2', 'CZ', 'OH'],
  TRP: ['CB', 'CG', 'CD1', 'CD2', 'NE1', 'CE2', 'CE3', 'CZ2', 'CZ3', 'CH2', 'HE1'],
  HIS: ['CB', 'CG', 'ND1', 'CD2', 'CE1', 'NE2', 'HE2'],
  ARG: ['CD', 'NE', 'CZ', 'NH1', 'NH2', 'HE', 'HH11', 'HH12', 'HH21', 'HH22'],
  ASN: ['CB', 'CG', 'OD1', 'ND2', 'HD21', 'HD22'],
  GLN: ['CG', 'CD', 'OE1', 'NE2', 'HE21', 'HE22'],
  ASP: ['CB', 'CG', 'OD1', 'OD2'],
  GLU: ['CG', 'CD', 'OE1', 'OE2'],
  PRO: ['N', 'CA', 'CB', 'CG', 'CD'],
};

// Which atoms share a charged group, for scaling the net charge of ionic side chains.
const ION = { LYS: ['CE', 'NZ'], ARG: ['CD', 'NE', 'CZ', 'NH1', 'NH2', 'HE', 'HH11', 'HH12', 'HH21', 'HH22'], ASP: ['CG', 'OD1', 'OD2'], GLU: ['CD', 'OE1', 'OE2'] };

// Polar hydrogens: parent, then how to place them from the geometry around the parent.
const HYDROGENS = {
  ARG: [['HE', 'NE', 'bisect', 'CD', 'CZ'], ['HH11', 'NH1', 'cis', 'CZ', 'NE'], ['HH12', 'NH1', 'trans', 'CZ', 'NE'], ['HH21', 'NH2', 'cis', 'CZ', 'NE'], ['HH22', 'NH2', 'trans', 'CZ', 'NE']],
  ASN: [['HD21', 'ND2', 'cis', 'CG', 'OD1'], ['HD22', 'ND2', 'trans', 'CG', 'OD1']],
  GLN: [['HE21', 'NE2', 'cis', 'CD', 'OE1'], ['HE22', 'NE2', 'trans', 'CD', 'OE1']],
  HIS: [['HE2', 'NE2', 'bisect', 'CD2', 'CE1']],
  TRP: [['HE1', 'NE1', 'bisect', 'CD1', 'CE2']],
  SER: [['HG', 'OG', 'hydroxyl', 'CB', 'CA']],
  THR: [['HG1', 'OG1', 'hydroxyl', 'CB', 'CA']],
  TYR: [['HH', 'OH', 'hydroxyl', 'CZ', 'CE1']],
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function place(kind, at, b, c, length = 1.01) {
  if (kind === 'bisect') return addv(at, unit(addv(unit(sub(at, b)), unit(sub(at, c)))), length);
  const u = unit(sub(at, b));
  const w = sub(c, b);
  const e = unit(addv(w, u, -dot(w, u)));
  // cis puts the hydrogen on the same side as c; a hydroxyl starts trans and turns freely.
  const side = kind === 'cis' ? 0.866 : -0.866;
  if (kind === 'hydroxyl') return addv(addv(at, u, 0.33 * length * 0.96), e, -0.94 * length * 0.96);
  return addv(addv(at, u, 0.5 * length), e, side * length);
}

function atomsOf(p, params) {
  const names = p.atoms.names.split(' ');
  const atoms = [];
  const of = new Map();
  const put = (a) => {
    a.i = atoms.length;
    atoms.push(a);
    of.set(`${a.res}:${a.name}`, a);
    return a;
  };
  const last = p.n - 1;
  const three = (r) => THREE_OF[p.seq[r]];
  const table = (r) => params.res[r === 0 ? `N${three(r)}` : r === last ? `C${three(r)}` : three(r)];
  for (let i = 0; i < names.length; i++) {
    const r = p.atomRes[i];
    const t = table(r)[names[i]];
    if (!t) throw new Error(`No parameters for ${three(r)} ${names[i]}`);
    put({ res: r, name: names[i], el: names[i][0], cls: t[0], q: t[1], x: [p.atomXYZ[i * 3], p.atomXYZ[i * 3 + 1], p.atomXYZ[i * 3 + 2]] });
  }
  const pos = (r, n) => of.get(`${r}:${n}`)?.x;
  // The terminal oxygen, when the crystal has none.
  if (!pos(last, 'OXT')) {
    const c = pos(last, 'C');
    const d = unit(addv(unit(sub(pos(last, 'CA'), c)), unit(sub(pos(last, 'O'), c))));
    const t = table(last).OXT;
    put({ res: last, name: 'OXT', el: 'O', cls: t[0], q: t[1], x: addv(c, d, -1.25) });
  }
  // Backbone hydrogens, then side chains.
  for (let r = 1; r < p.n; r++) {
    if (three(r) === 'PRO') continue;
    const t = table(r).H;
    if (!t) continue;
    put({ res: r, name: 'H', el: 'H', cls: 'H', q: t[1], x: place('bisect', pos(r, 'N'), pos(r - 1, 'C'), pos(r, 'CA')) });
  }
  for (let r = 0; r < p.n; r++) {
    for (const [name, parent, kind, b, c] of HYDROGENS[three(r)] ?? []) {
      const t = table(r)[name];
      put({ res: r, name, el: 'H', cls: 'H', q: t[1], x: place(kind, pos(r, parent), pos(r, b), pos(r, c)) });
    }
  }
  return { atoms, of };
}

function bondsOf(p, atoms, of) {
  const adj = atoms.map(() => []);
  const link = (a, b) => {
    adj[a.i].push(b.i);
    adj[b.i].push(a.i);
  };
  const byRes = new Map();
  for (const a of atoms) (byRes.get(a.res) ?? byRes.set(a.res, []).get(a.res)).push(a);
  const far = (a, b) => Math.hypot(a.x[0] - b.x[0], a.x[1] - b.x[1], a.x[2] - b.x[2]);
  for (const list of byRes.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.el === 'H' || b.el === 'H') continue;
        if (far(a, b) < 1.95) link(a, b);
      }
    for (const h of list) {
      if (h.el !== 'H') continue;
      let best = null;
      for (const a of list) if (a.el !== 'H' && a.el !== 'C' && (!best || far(h, a) < far(h, best))) best = a;
      link(h, best);
    }
  }
  for (let r = 0; r + 1 < p.n; r++) link(of.get(`${r}:C`), of.get(`${r + 1}:N`));
  return adj;
}

// Generic side-chain torsions. One term for each rotatable bond between heavy atoms.
function torsionsOf(p, atoms, of, adj, scale) {
  const out = [];
  const heavy = (i, not) => adj[i].filter((k) => k !== not && atoms[k].el !== 'H');
  const SP2 = new Set(['CA', 'CAI', 'CC', 'CY', 'CPT', 'CPH1', 'CPH2', 'C', 'NC2', 'NH2', 'NR1', 'NR2', 'NY']);
  const seen = new Set();
  for (const b of atoms) {
    if (b.el === 'H' || b.name === 'N' || b.name === 'C' || b.name === 'O') continue;
    for (const ci of adj[b.i]) {
      const c = atoms[ci];
      if (c.el === 'H' || c.res !== b.res || c.name === 'N' || c.name === 'C' || c.name === 'O') continue;
      if (b.i > c.i && seen.has(`${c.i},${b.i}`)) continue;
      seen.add(`${b.i},${c.i}`);
      const three = THREE_OF[p.seq[b.res]];
      const rigid = PLANES[three];
      if (rigid?.includes(b.name) && rigid.includes(c.name)) continue;
      const as = heavy(b.i, c.i);
      const ds = heavy(c.i, b.i);
      if (!as.length || !ds.length) continue;
      // Each torsion is walked outward from the backbone, with the chain atom first.
      const a = as.find((i) => ['N', 'CA', 'CB', 'CG', 'CD'].includes(atoms[i].name)) ?? as[0];
      const d = ds[0];
      const flat = SP2.has(b.cls) || SP2.has(c.cls);
      const planar = three === 'PHE' || three === 'TYR' || three === 'TRP' || three === 'HIS';
      const n = flat ? 2 : 3;
      const v = (flat ? (planar ? 1.2 : 0.5) : 2.4) * scale;
      out.push([a, b.i, c.i, d, n, v]);
    }
  }
  return out;
}

export function buildModel(p, params, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const { atoms, of } = atomsOf(p, params);
  const adj = bondsOf(p, atoms, of);
  const N = atoms.length;
  const X0 = new Float64Array(N * 3);
  atoms.forEach((a, i) => X0.set(a.x, i * 3));
  const dist = (i, j) => Math.hypot(X0[i * 3] - X0[j * 3], X0[i * 3 + 1] - X0[j * 3 + 1], X0[i * 3 + 2] - X0[j * 3 + 2]);

  // Net charge of ionic side chains is reduced, the same idea as EEF1's neutralised groups.
  for (let r = 0; r < p.n; r++) {
    const three = THREE_OF[p.seq[r]];
    const group = ION[three];
    if (!group) continue;
    const z = three === 'LYS' || three === 'ARG' ? 1 : -1;
    const list = group.map((n) => of.get(`${r}:${n}`)).filter(Boolean);
    for (const a of list) a.q -= (z * (1 - o.ion)) / list.length;
  }

  // Graph distance up to three bonds.
  const hop = (s) => {
    const seen = new Map([[s, 0]]);
    let front = [s];
    for (let k = 1; k <= 3; k++) {
      const next = [];
      for (const u of front) for (const v of adj[u]) if (!seen.has(v)) {
        seen.set(v, k);
        next.push(v);
      }
      front = next;
    }
    return seen;
  };
  const key = (i, j) => (i < j ? i * 100000 + j : j * 100000 + i);
  const excluded = new Set();
  const oneFour = new Set();
  const springs = [];
  for (let i = 0; i < N; i++)
    for (const [j, k] of hop(i)) {
      if (j <= i) continue;
      if (k === 1) {
        springs.push([i, j, dist(i, j), o.bond]);
        excluded.add(key(i, j));
      } else if (k === 2) {
        springs.push([i, j, dist(i, j), o.angle]);
        excluded.add(key(i, j));
      } else if (k === 3) oneFour.add(key(i, j));
    }
  const rigid = (list) => {
    for (let a = 0; a < list.length; a++)
      for (let b = a + 1; b < list.length; b++) {
        const k = key(list[a].i, list[b].i);
        if (excluded.has(k)) continue;
        excluded.add(k);
        oneFour.delete(k);
        springs.push([list[a].i, list[b].i, dist(list[a].i, list[b].i), o.plane]);
      }
  };
  for (let r = 0; r < p.n; r++) {
    const names = PLANES[THREE_OF[p.seq[r]]];
    if (names) rigid(names.map((n) => of.get(`${r}:${n}`)).filter(Boolean));
    if (r + 1 < p.n) rigid([`${r}:CA`, `${r}:C`, `${r}:O`, `${r + 1}:N`, `${r + 1}:H`, `${r + 1}:CA`].map((n) => of.get(n)).filter(Boolean));
  }

  const SI = Int32Array.from(springs, (s) => s[0] * 3);
  const SJ = Int32Array.from(springs, (s) => s[1] * 3);
  const SR = Float64Array.from(springs, (s) => s[2]);
  const SK = Float64Array.from(springs, (s) => s[3]);

  const torsions = torsionsOf(p, atoms, of, adj, o.torsion);
  const TA = Int32Array.from(torsions, (t) => t[0] * 3);
  const TB = Int32Array.from(torsions, (t) => t[1] * 3);
  const TC = Int32Array.from(torsions, (t) => t[2] * 3);
  const TD = Int32Array.from(torsions, (t) => t[3] * 3);
  const TN = Int32Array.from(torsions, (t) => t[4]);
  const TV = Float64Array.from(torsions, (t) => t[5]);

  // The backbone map, with a period of 360 degrees on a 10 degree grid. Rows are psi. Glycine reaches far more of the map, so it feels little of it.
  const R = [];
  for (let r = 1; r + 1 < p.n; r++) {
    const w = (p.seq[r] === 'G' ? 0.25 : 1) * o.rama;
    R.push([of.get(`${r - 1}:C`).i, of.get(`${r}:N`).i, of.get(`${r}:CA`).i, of.get(`${r}:C`).i, of.get(`${r + 1}:N`).i, w]);
  }
  const RA = Int32Array.from(R, (t) => t[0] * 3);
  const RB = Int32Array.from(R, (t) => t[1] * 3);
  const RC = Int32Array.from(R, (t) => t[2] * 3);
  const RD = Int32Array.from(R, (t) => t[3] * 3);
  const RE = Int32Array.from(R, (t) => t[4] * 3);
  const RW = Float64Array.from(R, (t) => t[5]);
  // Slopes at the grid corners. Grid point i sits at -175 + 10 i, so the map is shifted by half a cell.
  const rama = Float64Array.from(params.rama);
  const ramaP = new Float64Array(36 * 36);
  const ramaQ = new Float64Array(36 * 36);
  const cellRad = (10 * Math.PI) / 180;
  for (let j = 0; j < 36; j++)
    for (let i = 0; i < 36; i++) {
      ramaP[j * 36 + i] = (rama[j * 36 + (i + 1) % 36] - rama[j * 36 + (i + 35) % 36]) / (2 * cellRad);
      ramaQ[j * 36 + i] = (rama[((j + 1) % 36) * 36 + i] - rama[((j + 35) % 36) * 36 + i]) / (2 * cellRad);
    }

  // The memory: Gaussian wells on C-alpha pairs that sit close in the crystal.
  const ca = [];
  for (let r = 0; r < p.n; r++) ca.push(of.get(`${r}:CA`).i);
  const mem = [];
  for (let a = 0; a < ca.length; a++)
    for (let b = a + o.memoryGap; b < ca.length; b++) {
      const r = dist(ca[a], ca[b]);
      if (r < o.memoryReach) mem.push([ca[a], ca[b], r]);
    }
  const MI = Int32Array.from(mem, (m) => m[0] * 3);
  const MJ = Int32Array.from(mem, (m) => m[1] * 3);
  const MR = Float64Array.from(mem, (m) => m[2]);

  // Tables of force over distance, indexed by squared distance.
  const classes = [...new Set(atoms.map((a) => a.cls))];
  const typeOf = Int32Array.from(atoms, (a) => classes.indexOf(a.cls));
  const nT = classes.length;
  const rc = o.cutoff;
  const rc2 = rc * rc;
  const BINS = 512;
  const toBin = BINS / rc2;
  const table = new Float32Array(((nT * (nT + 1)) / 2) * (BINS + 2));
  const coul = new Float32Array(BINS + 2);
  // The same pair terms as energies, for the board's account of what a pull paid into.
  const ljU = new Float32Array(table.length);
  const eefU = new Float32Array(table.length);
  const coulU = new Float32Array(BINS + 2);
  const pairId = (a, b) => (a < b ? (a * (2 * nT - a - 1)) / 2 + b : (b * (2 * nT - b - 1)) / 2 + a);
  const info = (c) => {
    if (c === 'H') return { v: 0, free: 0, lambda: 3.5, r: 0, lj: o.rH, eps: 0.03 };
    const t = params.types[c];
    return { ...t, lj: c[0] === 'N' ? o.rN : c[0] === 'O' ? o.rO : t.r, eps: o.eps };
  };
  const switchAt = (r, a, b) => (r <= a ? 1 : r >= b ? 0 : 1 - ((r - a) / (b - a)) ** 2 * (3 - (2 * (r - a)) / (b - a)));
  const dswitch = (r, a, b) => {
    if (r <= a || r >= b) return 0;
    const t = (r - a) / (b - a);
    return (-6 * t * (1 - t)) / (b - a);
  };
  const SOLV = (2 / (4 * Math.PI * Math.sqrt(Math.PI))) * o.solvent;
  for (let a = 0; a < nT; a++)
    for (let b = a; b < nT; b++) {
      const A = info(classes[a]);
      const B = info(classes[b]);
      const off = pairId(a, b) * (BINS + 2);
      const Rm = A.lj + B.lj;
      const eps = Math.sqrt(A.eps * B.eps);
      const soft = 0.72 * Rm;
      for (let k = 0; k <= BINS + 1; k++) {
        const r = Math.max(0.5, Math.sqrt(k / toBin));
        const R = Math.max(soft, r);
        const q = Rm / R;
        const q6 = q * q * q * q * q * q;
        // Lennard-Jones, with the wall levelled off below 0.72 of contact so that an overlap cannot blow up the step.
        let u = eps * (q6 * q6 - 2 * q6);
        let du = (eps * 12 * (q6 - q6 * q6)) / R;
        if (r < soft) {
          u += du * (r - soft);
        }
        // EEF1 solvent exclusion, both ways.
        const one = (s, t) => {
          if (!s.free || !t.v) return [0, 0];
          const x = (r - s.r) / s.lambda;
          const f = ((SOLV * s.free) / (s.lambda * r * r)) * Math.exp(-x * x);
          return [-f * t.v, -f * t.v * (-2 / r - (2 * x) / s.lambda)];
        };
        const [e1, d1] = one(A, B);
        const [e2, d2] = one(B, A);
        const s = switchAt(r, rc - 2, rc);
        ljU[off + k] = u * s;
        eefU[off + k] = (e1 + e2) * s;
        u += e1 + e2;
        du += d1 + d2;
        table[off + k] = -(du * s + u * dswitch(r, rc - 2, rc)) / r;
      }
    }
  for (let k = 0; k <= BINS + 1; k++) {
    const r = Math.max(1.0, Math.sqrt(k / toBin));
    const u = 332 / (o.kappa * r * r);
    const du = (-2 * 332) / (o.kappa * r * r * r);
    const s = switchAt(r, rc - 3, rc);
    coul[k] = -(du * s + u * dswitch(r, rc - 3, rc)) / r;
    coulU[k] = u * s;
  }

  const charge = Float64Array.from(atoms, (a) => a.q);
  const cap = 60000;
  // Gaussian numbers, drawn once and read from random offsets, because a fresh draw per atom per step would cost more than the forces.
  let seed = o.seed >>> 0 || 1;
  const rnd = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };
  const NOISE = 65536;
  const noise = new Float32Array(NOISE);
  for (let i = 0; i < NOISE; i += 2) {
    const u = Math.max(1e-9, rnd());
    const v = rnd();
    const m = Math.sqrt(-2 * Math.log(u));
    noise[i] = m * Math.cos(2 * Math.PI * v);
    noise[i + 1] = m * Math.sin(2 * Math.PI * v);
  }

  const m = {
    o, p, N, atoms, of, adj, X0, ca, classes, typeOf, charge, excluded, oneFour, torsions,
    SI, SJ, SR, SK, TA, TB, TC, TD, TN, TV, MI, MJ, MR, RA, RB, RC, RD, RE, RW, rama, ramaP, ramaQ, memoryDepth: o.memory, memoryWidth: o.memoryWidth,
    table, coul, ljU, eefU, coulU, BINS, toBin, rc2, nT,
    X: X0.slice(), V: new Float64Array(N * 3), F: new Float64Array(N * 3), Ffar: new Float64Array(N * 3), Fx: new Float64Array(N * 3),
    nI: new Int32Array(cap), nJ: new Int32Array(cap), nK: new Int32Array(cap), nQ: new Float32Array(cap), nS: new Float32Array(cap), nN: 0,
    fI: new Int32Array(cap), fJ: new Int32Array(cap), fK: new Int32Array(cap), fQ: new Float32Array(cap), fN: 0,
    noise, rnd, steps: 0, sinceRebuild: 1e9, pull: null,
    excludedTable: null,
    c1: o.friction, c2: Math.sqrt((1 - o.friction * o.friction) * o.alpha * o.kT), alpha: o.alpha,
  };
  m.gone = new Uint8Array(N);
  m.crowd = new Float64Array(N);
  m.shade = new Float64Array(N);
  m.heavyFlag = Float64Array.from(atoms, (a) => (a.el === 'H' ? 0 : 1));
  m.parentOf = Int32Array.from(atoms, (a, i) => (a.el === 'H' ? adj[i][0] : i));
  m.screenFloor = Float64Array.from(atoms, (a) => {
    const bb = a.name === 'N' || a.name === 'H' || a.name === 'C' || a.name === 'O' || a.name === 'CA';
    if (bb) return o.screenBackbone;
    return ION[THREE_OF[p.seq[a.res]]]?.includes(a.name) ? o.screenIon : o.screen;
  });
  // A flat byte table is faster than a Set in the pair search.
  const ex = new Uint8Array(N * N);
  for (const k of excluded) {
    const i = Math.floor(k / 100000);
    const j = k % 100000;
    ex[i * N + j] = ex[j * N + i] = 1;
  }
  for (const k of oneFour) {
    const i = Math.floor(k / 100000);
    const j = k % 100000;
    ex[i * N + j] = ex[j * N + i] = 2;
  }
  m.excludedTable = ex;
  rebuildLists(m);
  computeForces(m, true);
  return m;
}

export function rebuildLists(m) {
  const { X, N, excludedTable: ex, typeOf, charge, nT, BINS } = m;
  const cut = m.o.cutoff + m.o.skin;
  const cut2 = cut * cut;
  const near2 = (m.o.nearCut + m.o.skin) ** 2;
  let a = 0;
  let b = 0;
  const { nI, nJ, nK, nQ, nS, fI, fJ, fK, fQ, heavyFlag, shade, gone } = m;
  const crowd = m.crowd;
  crowd.fill(0);
  for (let i = 0; i < N; i++) {
    const xi = X[i * 3], yi = X[i * 3 + 1], zi = X[i * 3 + 2];
    const ti = typeOf[i];
    const row = i * N;
    for (let j = i + 1; j < N; j++) {
      const flag = ex[row + j];
      if (flag === 1 || gone[i] + gone[j] > 0) continue;
      const dx = xi - X[j * 3], dy = yi - X[j * 3 + 1], dz = zi - X[j * 3 + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 >= cut2) continue;
      if (r2 < 42.25) {
        crowd[i] += heavyFlag[j];
        crowd[j] += heavyFlag[i];
      }
      const tj = typeOf[j];
      const id = (ti < tj ? (ti * (2 * nT - ti - 1)) / 2 + tj : (tj * (2 * nT - tj - 1)) / 2 + ti) * (BINS + 2);
      if (r2 < near2 || flag === 2) {
        nI[a] = i * 3;
        nJ[a] = j * 3;
        nK[a] = id;
        nQ[a] = charge[i] * charge[j];
        nS[a] = flag === 2 ? 0.5 : 1;
        a++;
      } else {
        fI[b] = i * 3;
        fJ[b] = j * 3;
        fK[b] = id;
        fQ[b] = charge[i] * charge[j];
        b++;
      }
    }
  }
  m.nN = a;
  m.fN = b;
  m.sinceRebuild = 0;
  // Water screens charges at the surface and cannot reach buried ones, as Generalized Born does. Each atom gets a factor from how crowded it is.
  // A hydrogen takes the crowding of its parent. Between rebuilds the factors stand still, so there is no force from a change in burial;
  // EEF1 carries that part.
  const { buryLow, buryHigh } = m.o;
  const { parentOf, screenFloor } = m;
  for (let i = 0; i < N; i++) {
    const b = Math.max(0, Math.min(1, (crowd[parentOf[i]] - buryLow) / (buryHigh - buryLow)));
    shade[i] = screenFloor[i] + (1 - screenFloor[i]) * b;
  }
  const scale = (I, J, Q, count) => {
    for (let n = 0; n < count; n++) Q[n] *= Math.sqrt(shade[I[n] / 3] * shade[J[n] / 3]);
  };
  scale(nI, nJ, nQ, a);
  scale(fI, fJ, fQ, b);
}

function pairs(m, I, J, K, Q, S, count, X, F) {
  const { table, coul, toBin, rc2 } = m;
  for (let n = 0; n < count; n++) {
    const i = I[n], j = J[n];
    const dx = X[i] - X[j], dy = X[i + 1] - X[j + 1], dz = X[i + 2] - X[j + 2];
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 >= rc2) continue;
    const u = r2 * toBin;
    const b = u | 0;
    const f = u - b;
    const k = K[n] + b;
    let g = table[k] + (table[k + 1] - table[k]) * f + Q[n] * (coul[b] + (coul[b + 1] - coul[b]) * f);
    if (S !== null) g *= S[n];
    const fx = g * dx, fy = g * dy, fz = g * dz;
    F[i] += fx;
    F[i + 1] += fy;
    F[i + 2] += fz;
    F[j] -= fx;
    F[j + 1] -= fy;
    F[j + 2] -= fz;
  }
}

const RAMA_TO = 18 / Math.PI;

// Dihedral angle a-b-c-d by the IUPAC sign, and the matching forces (Blondel and Karplus 1996). Offsets are x indices.
function dihedral(X, a, b, c, d) {
  const fx = X[a] - X[b], fy = X[a + 1] - X[b + 1], fz = X[a + 2] - X[b + 2];
  const gx = X[b] - X[c], gy = X[b + 1] - X[c + 1], gz = X[b + 2] - X[c + 2];
  const hx = X[d] - X[c], hy = X[d + 1] - X[c + 1], hz = X[d + 2] - X[c + 2];
  const ax = fy * gz - fz * gy, ay = fz * gx - fx * gz, az = fx * gy - fy * gx;
  const bx = hy * gz - hz * gy, by = hz * gx - hx * gz, bz = hx * gy - hy * gx;
  const g = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const cross = (bx * ay - by * ax) * gz + (by * az - bz * ay) * gx + (bz * ax - bx * az) * gy;
  return Math.atan2(cross / g, ax * bx + ay * by + az * bz);
}

// Adds the force for an energy whose slope along the dihedral is dV.
function kick(F, a, b, c, d, dV, X = kick.X) {
  const fx = X[a] - X[b], fy = X[a + 1] - X[b + 1], fz = X[a + 2] - X[b + 2];
  const gx = X[b] - X[c], gy = X[b + 1] - X[c + 1], gz = X[b + 2] - X[c + 2];
  const hx = X[d] - X[c], hy = X[d + 1] - X[c + 1], hz = X[d + 2] - X[c + 2];
  const ax = fy * gz - fz * gy, ay = fz * gx - fx * gz, az = fx * gy - fy * gx;
  const bx = hy * gz - hz * gy, by = hz * gx - hx * gz, bz = hx * gy - hy * gx;
  const g = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const a2 = ax * ax + ay * ay + az * az || 1e-9;
  const b2 = bx * bx + by * by + bz * bz || 1e-9;
  const ka = g / a2, kb = g / b2;
  const s1 = (fx * gx + fy * gy + fz * gz) / (a2 * g);
  const s2 = (hx * gx + hy * gy + hz * gz) / (b2 * g);
  // dphi/dr for the four atoms, times -dV.
  const iax = -ka * ax, iay = -ka * ay, iaz = -ka * az;
  const lbx = kb * bx, lby = kb * by, lbz = kb * bz;
  const mx = s1 * ax - s2 * bx, my = s1 * ay - s2 * by, mz = s1 * az - s2 * bz;
  F[a] -= dV * iax;
  F[a + 1] -= dV * iay;
  F[a + 2] -= dV * iaz;
  F[d] -= dV * lbx;
  F[d + 1] -= dV * lby;
  F[d + 2] -= dV * lbz;
  F[b] -= dV * (-iax + mx);
  F[b + 1] -= dV * (-iay + my);
  F[b + 2] -= dV * (-iaz + mz);
  F[c] -= dV * (-lbx - mx);
  F[c + 1] -= dV * (-lby - my);
  F[c + 2] -= dV * (-lbz - mz);
}

function bonded(m, X, F) {
  kick.X = X;
  const { SI, SJ, SR, SK, TA, TB, TC, TD, TN, TV, MI, MJ, MR } = m;
  for (let n = 0, e = SI.length; n < e; n++) {
    const i = SI[n], j = SJ[n];
    const dx = X[i] - X[j], dy = X[i + 1] - X[j + 1], dz = X[i + 2] - X[j + 2];
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const g = (-SK[n] * (r - SR[n])) / r;
    F[i] += g * dx;
    F[i + 1] += g * dy;
    F[i + 2] += g * dz;
    F[j] -= g * dx;
    F[j + 1] -= g * dy;
    F[j + 2] -= g * dz;
  }
  // Generic torsions, V(chi) = v/2 (1 + cos n chi): threefold keeps sp3 bonds staggered.
  for (let n = 0, e = TA.length; n < e; n++) {
    const chi = dihedral(X, TA[n], TB[n], TC[n], TD[n]);
    kick(F, TA[n], TB[n], TC[n], TD[n], -0.5 * TV[n] * TN[n] * Math.sin(TN[n] * chi));
  }
  // The backbone: one free-energy map of phi and psi, from alanine dipeptide in water.
  const { RA, RB, RC, RD, RE, RW, rama, ramaP, ramaQ } = m;
  for (let n = 0, e = RA.length; n < e; n++) {
    const phi = dihedral(X, RA[n], RB[n], RC[n], RD[n]);
    const psi = dihedral(X, RB[n], RC[n], RD[n], RE[n]);
    const u = (phi + Math.PI) * RAMA_TO - 0.5;
    const w = (psi + Math.PI) * RAMA_TO - 0.5;
    const i0 = Math.floor(u), j0 = Math.floor(w);
    const fu = u - i0, fw = w - j0;
    const i = (i0 + 36) % 36, j = (j0 + 36) % 36, i1 = (i + 1) % 36, j1 = (j + 1) % 36;
    const a00 = j * 36 + i, a01 = j * 36 + i1, a10 = j1 * 36 + i, a11 = j1 * 36 + i1;
    const c0 = (1 - fu) * (1 - fw), c1 = fu * (1 - fw), c2 = (1 - fu) * fw, c3 = fu * fw;
    const dp = RW[n] * (c0 * ramaP[a00] + c1 * ramaP[a01] + c2 * ramaP[a10] + c3 * ramaP[a11]);
    const dq = RW[n] * (c0 * ramaQ[a00] + c1 * ramaQ[a01] + c2 * ramaQ[a10] + c3 * ramaQ[a11]);
    kick(F, RA[n], RB[n], RC[n], RD[n], dp);
    kick(F, RB[n], RC[n], RD[n], RE[n], dq);
  }
  const depth = m.memoryDepth, w2 = 1 / (m.memoryWidth * m.memoryWidth);
  if (depth > 0) {
    for (let n = 0, e = MI.length; n < e; n++) {
      const i = MI[n], j = MJ[n];
      const dx = X[i] - X[j], dy = X[i + 1] - X[j + 1], dz = X[i + 2] - X[j + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const u = r - MR[n];
      const g = (-depth * u * w2 * Math.exp(-u * u * w2 * 0.5)) / r;
      F[i] += g * dx;
      F[i + 1] += g * dy;
      F[i + 2] += g * dz;
      F[j] -= g * dx;
      F[j + 1] -= g * dy;
      F[j + 2] -= g * dz;
    }
  }
}

// The hand: one spring on a group of atoms, with its force capped, balanced so that it neither carries nor turns the whole protein.
function applyPull(m, F) {
  const P = m.pull;
  if (!P) return;
  const { X, N } = m;
  const G = P.atoms;
  let gx = 0, gy = 0, gz = 0;
  for (let k = 0; k < G.length; k++) {
    const a = G[k] * 3;
    gx += X[a];
    gy += X[a + 1];
    gz += X[a + 2];
  }
  gx /= G.length;
  gy /= G.length;
  gz /= G.length;
  let fx = P.k * (P.x - gx), fy = P.k * (P.y - gy), fz = P.k * (P.z - gz);
  const f = Math.sqrt(fx * fx + fy * fy + fz * fz);
  P.raw = f;
  if (f > P.cap) {
    const s = P.cap / f;
    fx *= s;
    fy *= s;
    fz *= s;
  }
  P.force = Math.min(f, P.cap);
  P.at = [gx, gy, gz];
  const share = 1 / G.length;
  for (let k = 0; k < G.length; k++) {
    const a = G[k] * 3;
    F[a] += fx * share;
    F[a + 1] += fy * share;
    F[a + 2] += fz * share;
  }
  // The reaction: equal and opposite net force and torque, spread over every atom.
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < N * 3; i += 3) {
    cx += X[i];
    cy += X[i + 1];
    cz += X[i + 2];
  }
  cx /= N;
  cy /= N;
  cz /= N;
  const rx = gx - cx, ry = gy - cy, rz = gz - cz;
  const tx = ry * fz - rz * fy, ty = rz * fx - rx * fz, tz = rx * fy - ry * fx;
  let ixx = 0, iyy = 0, izz = 0, ixy = 0, ixz = 0, iyz = 0;
  for (let i = 0; i < N * 3; i += 3) {
    const x = X[i] - cx, y = X[i + 1] - cy, z = X[i + 2] - cz;
    ixx += y * y + z * z;
    iyy += x * x + z * z;
    izz += x * x + y * y;
    ixy -= x * y;
    ixz -= x * z;
    iyz -= y * z;
  }
  const c00 = iyy * izz - iyz * iyz, c01 = ixz * iyz - ixy * izz, c02 = ixy * iyz - ixz * iyy;
  const det = ixx * c00 + ixy * c01 + ixz * c02;
  const c11 = ixx * izz - ixz * ixz, c12 = ixy * ixz - ixx * iyz, c22 = ixx * iyy - ixy * ixy;
  const wx = (c00 * tx + c01 * ty + c02 * tz) / det;
  const wy = (c01 * tx + c11 * ty + c12 * tz) / det;
  const wz = (c02 * tx + c12 * ty + c22 * tz) / det;
  const ax = fx / N, ay = fy / N, az = fz / N;
  for (let i = 0; i < N * 3; i += 3) {
    const x = X[i] - cx, y = X[i + 1] - cy, z = X[i + 2] - cz;
    F[i] -= ax + (wy * z - wz * y);
    F[i + 1] -= ay + (wz * x - wx * z);
    F[i + 2] -= az + (wx * y - wy * x);
  }
}

// Total energy, for checking the forces. Slow, and not used in play.
export function energyOf(m, X = m.X) {
  let E = 0;
  const { SI, SJ, SR, SK, TA, TB, TC, TD, TN, TV, MI, MJ, MR } = m;
  const d = (i, j) => Math.sqrt((X[i] - X[j]) ** 2 + (X[i + 1] - X[j + 1]) ** 2 + (X[i + 2] - X[j + 2]) ** 2);
  for (let n = 0; n < SI.length; n++) E += 0.5 * SK[n] * (d(SI[n], SJ[n]) - SR[n]) ** 2;
  for (let n = 0; n < TA.length; n++) E += 0.5 * TV[n] * (1 + Math.cos(TN[n] * dihedral(X, TA[n], TB[n], TC[n], TD[n])));
  const w2 = 1 / m.memoryWidth ** 2;
  for (let n = 0; n < MI.length; n++) {
    const u = d(MI[n], MJ[n]) - MR[n];
    E += m.memoryDepth * (1 - Math.exp(-u * u * w2 * 0.5));
  }
  const ramaAt = (phi, psi) => {
    // Bilinear on the grid. Its forces come from slopes at the corners, so this value is close to their energy, not exact, and tests switch it off.
    const u = (phi + Math.PI) * RAMA_TO - 0.5, w = (psi + Math.PI) * RAMA_TO - 0.5;
    const i0 = Math.floor(u), j0 = Math.floor(w), fu = u - i0, fw = w - j0;
    const i = (i0 + 36) % 36, j = (j0 + 36) % 36, i1 = (i + 1) % 36, j1 = (j + 1) % 36;
    return (1 - fu) * (1 - fw) * m.rama[j * 36 + i] + fu * (1 - fw) * m.rama[j * 36 + i1] + (1 - fu) * fw * m.rama[j1 * 36 + i] + fu * fw * m.rama[j1 * 36 + i1];
  };
  for (let n = 0; n < m.RA.length; n++) E += m.RW[n] * ramaAt(dihedral(X, m.RA[n], m.RB[n], m.RC[n], m.RD[n]), dihedral(X, m.RB[n], m.RC[n], m.RD[n], m.RE[n]));
  return E;
}

// Energy by term: where the hand's work went. Cheap enough to read a few times a second.
export function termsOf(m, X = m.X) {
  const { ljU, eefU, coulU, toBin, rc2 } = m;
  let contacts = 0, water = 0, charges = 0;
  const sum = (I, J, K, Q, S, count) => {
    for (let n = 0; n < count; n++) {
      const i = I[n], j = J[n];
      const dx = X[i] - X[j], dy = X[i + 1] - X[j + 1], dz = X[i + 2] - X[j + 2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 >= rc2) continue;
      const u = r2 * toBin;
      const b = u | 0;
      const f = u - b;
      const k = K[n] + b;
      const w = S === null ? 1 : S[n];
      contacts += w * (ljU[k] + (ljU[k + 1] - ljU[k]) * f);
      water += w * (eefU[k] + (eefU[k + 1] - eefU[k]) * f);
      charges += w * Q[n] * (coulU[b] + (coulU[b + 1] - coulU[b]) * f);
    }
  };
  sum(m.nI, m.nJ, m.nK, m.nQ, m.nS, m.nN);
  sum(m.fI, m.fJ, m.fK, m.fQ, null, m.fN);
  return { memory: memoryOf(m, X), contacts, charges, water };
}

// The memory alone, for the board: it is steady at rest (about 2 kcal/mol), where contacts and charges swing by 20.
export function memoryOf(m, X = m.X) {
  const { MI, MJ, MR } = m;
  const w2 = 1 / (m.memoryWidth * m.memoryWidth);
  let e = 0;
  for (let n = 0, c = MI.length; n < c; n++) {
    const i = MI[n], j = MJ[n];
    const dx = X[i] - X[j], dy = X[i + 1] - X[j + 1], dz = X[i + 2] - X[j + 2];
    const u = Math.sqrt(dx * dx + dy * dy + dz * dz) - MR[n];
    e += m.memoryDepth * (1 - Math.exp(-u * u * w2 * 0.5));
  }
  return e;
}

// What one named backbone bond is worth: the Coulomb energy between its two peptide groups, N-H on one side and C=O on the other.
export function bondEnergy(m, b, X = m.X) {
  const { atoms, charge, shade, of } = m;
  const donor = [b.d, ...b.hs];
  const c = of.get(`${b.resA}:C`).i;
  let e = 0;
  for (const i of donor) for (const j of [b.a, c]) {
    const r2 = (X[i * 3] - X[j * 3]) ** 2 + (X[i * 3 + 1] - X[j * 3 + 1]) ** 2 + (X[i * 3 + 2] - X[j * 3 + 2]) ** 2;
    if (r2 < m.rc2) e += (332 * charge[i] * charge[j] * Math.sqrt(shade[i] * shade[j])) / (m.o.kappa * r2);
  }
  return e;
}

export function computeForces(m, far) {
  const { F, Ffar, X } = m;
  if (far) {
    Ffar.fill(0);
    pairs(m, m.fI, m.fJ, m.fK, m.fQ, null, m.fN, X, Ffar);
  }
  F.set(Ffar);
  pairs(m, m.nI, m.nJ, m.nK, m.nQ, m.nS, m.nN, X, F);
  bonded(m, X, F);
  applyPull(m, F);
}

// One Langevin step, BAOAB.
export function step(m, count = 1) {
  const { X, V, F, noise, c1, c2, alpha } = m;
  const n = m.N * 3;
  const half = 0.5 * alpha;
  const mask = noise.length - 1;
  const stride = m.o.stride;
  const every = m.o.rebuild;
  const limit = m.o.speedLimit;
  for (let s = 0; s < count; s++) {
    let at = (m.rnd() * 65536) | 0;
    for (let i = 0; i < n; i++) {
      const v = V[i] + half * F[i];
      const x = X[i] + 0.5 * v;
      let w = c1 * v + c2 * noise[(at + i) & mask];
      if (w > limit) w = limit;
      else if (w < -limit) w = -limit;
      X[i] = x + 0.5 * w;
      V[i] = w;
    }
    m.steps++;
    if (++m.sinceRebuild >= every) rebuildLists(m);
    computeForces(m, m.steps % stride === 0 || m.sinceRebuild === 0);
    for (let i = 0; i < n; i++) V[i] += half * F[i];
  }
}

// Removes the drift and tumble that noise gives the whole protein. It touches no internal coordinate.
export function holdStill(m) {
  const { X, V, N, X0 } = m;
  // Translation back onto the reference centre, and net momentum to zero.
  let cx = 0, cy = 0, cz = 0, ox = 0, oy = 0, oz = 0, vx = 0, vy = 0, vz = 0;
  for (let i = 0; i < N * 3; i += 3) {
    cx += X[i]; cy += X[i + 1]; cz += X[i + 2];
    ox += X0[i]; oy += X0[i + 1]; oz += X0[i + 2];
    vx += V[i]; vy += V[i + 1]; vz += V[i + 2];
  }
  const dx = (ox - cx) / N, dy = (oy - cy) / N, dz = (oz - cz) / N;
  vx /= N; vy /= N; vz /= N;
  for (let i = 0; i < N * 3; i += 3) {
    X[i] += dx; X[i + 1] += dy; X[i + 2] += dz;
    V[i] -= vx; V[i + 1] -= vy; V[i + 2] -= vz;
  }
}

// A small rotation, about the centre, that takes the C-alphas toward the reference (one step of the rotation gradient).
export function holdTurn(m, gain = 0.2) {
  const { X, X0, ca, N } = m;
  let cx = 0, cy = 0, cz = 0, ox = 0, oy = 0, oz = 0;
  for (const i of ca) {
    cx += X[i * 3]; cy += X[i * 3 + 1]; cz += X[i * 3 + 2];
    ox += X0[i * 3]; oy += X0[i * 3 + 1]; oz += X0[i * 3 + 2];
  }
  const nc = ca.length;
  cx /= nc; cy /= nc; cz /= nc; ox /= nc; oy /= nc; oz /= nc;
  let tx = 0, ty = 0, tz = 0, inertia = 0;
  for (const i of ca) {
    const x = X[i * 3] - cx, y = X[i * 3 + 1] - cy, z = X[i * 3 + 2] - cz;
    const a = X0[i * 3] - ox, b = X0[i * 3 + 1] - oy, c = X0[i * 3 + 2] - oz;
    tx += y * c - z * b;
    ty += z * a - x * c;
    tz += x * b - y * a;
    inertia += x * x + y * y + z * z;
  }
  const s = (gain * 1.5) / inertia;
  const wx = tx * s, wy = ty * s, wz = tz * s;
  for (let i = 0; i < N * 3; i += 3) {
    const x = X[i] - cx, y = X[i + 1] - cy, z = X[i + 2] - cz;
    X[i] += wy * z - wz * y;
    X[i + 1] += wz * x - wx * z;
    X[i + 2] += wx * y - wy * x;
  }
}

// ---- What the board reads. The same definitions are applied to real MD in tools/md_analyse.py. ----

const ACCEPTOR = /^(O|OXT|OD1|OD2|OE1|OE2|OG|OG1|OH)$/;
const isCharged = (a, three) => (three === 'LYS' && a.name === 'NZ') || (a.res === 0 && a.name === 'N');

// All donors and acceptors, once, for a model.
export function polarSites(m) {
  if (m.sites) return m.sites;
  const donors = [];
  const free = [];
  const acceptors = [];
  m.atoms.forEach((a, i) => {
    const three = THREE_OF[m.p.seq[a.res]];
    if (a.el === 'H') donors.push({ h: i, d: m.adj[i][0], res: a.res });
    else if (a.el === 'N' && isCharged(a, three)) free.push({ d: i, res: a.res });
    if (a.el === 'O' && ACCEPTOR.test(a.name)) acceptors.push({ a: i, res: a.res });
  });
  m.sites = { donors, free, acceptors };
  return m.sites;
}

const label = (m, i) => {
  const a = m.atoms[i];
  return `${m.p.seq[a.res]}${m.p.resno[a.res]}:${a.name}`;
};
export const atomLabel = label;

const backboneAtom = (a) => a.name === 'N' || a.name === 'O' || a.name === 'H';

// H...A under 2.5 A and D-H...A over 120 degrees, the Baker-Hubbard rule; freely spinning NH3+ uses N...O under 3.5 A.
export function hbonds(m, X = m.X) {
  const { donors, free, acceptors } = polarSites(m);
  const out = [];
  for (const D of donors) {
    const h = D.h * 3, d = D.d * 3;
    const hx = X[h], hy = X[h + 1], hz = X[h + 2];
    for (const A of acceptors) {
      if (A.res === D.res) continue;
      const a = A.a * 3;
      const ax = X[a] - hx, ay = X[a + 1] - hy, az = X[a + 2] - hz;
      const r2 = ax * ax + ay * ay + az * az;
      if (r2 > 6.25) continue;
      const bx = X[d] - hx, by = X[d + 1] - hy, bz = X[d + 2] - hz;
      const c = (ax * bx + ay * by + az * bz) / Math.sqrt(r2 * (bx * bx + by * by + bz * bz));
      if (c > -0.5) continue;
      out.push(`${D.d}-${A.a}`);
    }
  }
  for (const D of free) {
    const d = D.d * 3;
    for (const A of acceptors) {
      if (A.res === D.res) continue;
      const a = A.a * 3;
      const dx = X[a] - X[d], dy = X[a + 1] - X[d + 1], dz = X[a + 2] - X[d + 2];
      if (dx * dx + dy * dy + dz * dz < 12.25) out.push(`${D.d}-${A.a}`);
    }
  }
  return out;
}

// Oil: side-chain carbons on the residues that count as non-polar. This is a list by residue, not a reading of the EEF1 sign, which varies by atom.
export function oilAtoms(m) {
  if (m.oil) return m.oil;
  const NONPOLAR = 'AVLIMFWYP';
  m.oil = [];
  m.atoms.forEach((a, i) => {
    if (a.el === 'C' && !['C', 'CA'].includes(a.name) && NONPOLAR.includes(m.p.seq[a.res])) m.oil.push(i);
  });
  return m.oil;
}

export function oilContacts(m, X = m.X, within = 4.5) {
  const oil = oilAtoms(m);
  const out = [];
  const w2 = within * within;
  for (let i = 0; i < oil.length; i++) {
    const a = oil[i] * 3, ra = m.atoms[oil[i]].res;
    for (let j = i + 1; j < oil.length; j++) {
      if (m.atoms[oil[j]].res === ra) continue;
      const b = oil[j] * 3;
      const dx = X[a] - X[b], dy = X[a + 1] - X[b + 1], dz = X[a + 2] - X[b + 2];
      if (dx * dx + dy * dy + dz * dz < w2) out.push(oil[i] * 100000 + oil[j]);
    }
  }
  return out;
}

// RMSD after the best rigid fit, by Horn's quaternion with a power iteration.
export function rmsd(X, Y, list) {
  const n = list.length;
  const cx = [0, 0, 0], cy = [0, 0, 0];
  for (const i of list) for (let k = 0; k < 3; k++) {
    cx[k] += X[i * 3 + k] / n;
    cy[k] += Y[i * 3 + k] / n;
  }
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let g = 0;
  for (const i of list) {
    const a = [0, 1, 2].map((k) => X[i * 3 + k] - cx[k]);
    const b = [0, 1, 2].map((k) => Y[i * 3 + k] - cy[k]);
    for (let p = 0; p < 3; p++) {
      g += a[p] * a[p] + b[p] * b[p];
      for (let q = 0; q < 3; q++) R[p][q] += a[p] * b[q];
    }
  }
  const [[a, b, c], [d, e, f], [h, i, j]] = R;
  const M = [[a + e + j, f - i, h - c, b - d], [f - i, a - e - j, b + d, h + c], [h - c, b + d, -a + e - j, f + i], [b - d, h + c, f + i, -a - e + j]];
  const shift = g / 2 + 1;
  let v = [1, 0.1, 0.1, 0.1];
  for (let it = 0; it < 300; it++) {
    const w = [0, 1, 2, 3].map((p) => M[p].reduce((t, x, q) => t + x * v[q], 0) + shift * v[p]);
    const l = Math.hypot(...w);
    v = w.map((x) => x / l);
  }
  const lam = [0, 1, 2, 3].reduce((t, p) => t + v[p] * M[p].reduce((u, x, q) => u + x * v[q], 0), 0);
  return Math.sqrt(Math.max(0, g - 2 * lam) / n);
}

// ---- Bonds as the player sees them. ----
//
// A bond is judged by the hydrogen-bond rule itself, distance and angle together, as a share of recent checks set against how much of the time that
// same bond was formed at rest. Distance alone would not do: with charges off, the memory still brings N-H and O back near each other, and a test by
// distance reports a bond there. These rules fail with charges off, which tools/test_science.mjs checks.
// Resting occupancies come from long runs of this same model, in src/data/pull-rest.json, because a stage cannot spend seconds measuring them at start-up.

export const GRIP_MOVED = 1.5;   // A the hand must really have moved something before a loss counts as its doing
export const SNAP_CHECKS = 6;    // not formed once in this many checks in a row, and
export const SNAP_AT = 3;        // H...A beyond this on average, is a snap
export const BACK_CHECKS = 18;   // the window for a return, about 0.6 s of play
export const BACK_FLOOR = 0.5;   // formed in at least this share of that window, and
export const BACK_SHARE = 0.8;   // at least this share of its resting occupancy, and
export const BACK_TIGHT = 2.3;  // H...A within this on average. Charges tighten a bond from about 2.7 to 2.15 A

const isBackboneBond = (m, a, b) => m.atoms[a].name === 'N' && m.atoms[b].name === 'O';

// H...A, and whether the rule holds, for one donor group and one acceptor.
function judge(X, hs, d, a) {
  const i = a * 3;
  if (!hs.length) {
    const q = d * 3;
    const r = Math.hypot(X[q] - X[i], X[q + 1] - X[i + 1], X[q + 2] - X[i + 2]);
    return { r: r - 1, formed: r < 3.5 };
  }
  let best = 1e9;
  let formed = false;
  for (const h of hs) {
    const p = h * 3, q = d * 3;
    const ax = X[i] - X[p], ay = X[i + 1] - X[p + 1], az = X[i + 2] - X[p + 2];
    const r2 = ax * ax + ay * ay + az * az;
    if (r2 < best) best = r2;
    if (r2 > 6.25) continue;
    const bx = X[q] - X[p], by = X[q + 1] - X[p + 1], bz = X[q + 2] - X[p + 2];
    if ((ax * bx + ay * by + az * bz) / Math.sqrt(r2 * (bx * bx + by * by + bz * bz)) < -0.5) formed = true;
  }
  return { r: Math.sqrt(best), formed };
}

export const BOARD_REST = 0.6;   // a bond goes on the board only if formed this much of the time at rest
export const NOT_NEW = 0.1;      // an acceptor a donor already visits this much at rest is not a new partner

// The board's bonds from the resting table, and the donor and acceptor pairs that are not news. held is the real-water MD table.
export function boardFrom(m, table, held) {
  const index = new Map(m.atoms.map((_, i) => [label(m, i), i]));
  const rest = new Map();
  const known = new Set();
  for (const [name, occ] of Object.entries(table)) {
    const [d, a] = name.split('-').map((n) => index.get(n));
    if (occ >= NOT_NEW) known.add(`${d}-${a}`);
    const seen = held[name];
    if (occ >= BOARD_REST && seen && seen[0] >= 0.7 && seen[1] <= 0.4) rest.set(`${d}-${a}`, occ);
  }
  return { rest, known };
}

export const STILL_AFTER = 0.75;  // s after the grip last gained ground. A bond that fails later is thermal, not the hand's doing
export const NEW_GROUND = 0.3;    // A past its furthest point, more than a thermal wobble of the grip

// Holding a stretched protein still must not go on scoring snaps. The hand counts only while it is gaining ground.
export class Advance {
  constructor() {
    this.far = 0;
    this.idle = 0;
  }

  // Returns how far the grip has moved if that still counts, and 0 if the hand has stopped.
  update(moved, dt) {
    if (moved > this.far + NEW_GROUND) {
      this.far = moved;
      this.idle = 0;
    } else this.idle += dt;
    return this.idle < STILL_AFTER ? moved : 0;
  }
}

export class Watch {
  // rest: a Map of bond to its occupancy at rest. known: donor and acceptor pairs that are not news.
  constructor(m, rest, known = new Set()) {
    this.m = m;
    this.known = known;
    const { donors, acceptors } = polarSites(m);
    this.acceptors = acceptors;
    this.bonds = [...rest].map(([k, occ]) => {
      const [d, a] = k.split('-').map(Number);
      const hs = donors.filter((D) => D.d === d).map((D) => D.h);
      return { key: k, d, a, hs, on: true, rest: occ, seen: new Uint8Array(BACK_CHECKS), reach: new Float32Array(BACK_CHECKS), now: 0, count: 0, resD: m.atoms[d].res, resA: m.atoms[a].res, backbone: isBackboneBond(m, d, a), everSnapped: false, other: null, others: null };
    });
    this.ticks = 0;
  }

  // Share of recent checks in which a bond was formed, and its mean H...A, over the last n checks.
  recent(b, n) {
    const size = b.seen.length;
    const have = Math.min(n, b.count);
    let on = 0, r = 0;
    for (let k = 1; k <= have; k++) {
      const j = (b.now - k + size * 2) % size;
      on += b.seen[j];
      r += b.reach[j];
    }
    return { share: have ? on / have : 0, r: have ? r / have : 0, have };
  }

  // Does this donor now sit on another acceptor? A broken bond may have found a new partner, and the board must show that.
  otherPartner(b, X) {
    if (!b.hs.length) return;
    b.others ??= new Map();
    for (const A of this.acceptors) {
      if (A.a === b.a || A.res === b.resD || this.known.has(`${b.d}-${A.a}`)) continue;
      const hit = judge(X, b.hs, b.d, A.a).formed;
      const c = b.others.get(A.a) ?? 0;
      if (hit) b.others.set(A.a, c + 1);
      else if (c) b.others.set(A.a, c - 0.25);
    }
    b.other = null;
    for (const [a, c] of b.others) if (c >= BACK_CHECKS * BACK_FLOOR && (b.other === null || c > b.others.get(b.other))) b.other = a;
  }

  // moved: how far the hand has really moved the grip, in A. Holding still breaks nothing.
  check(X = this.m.X, moved = 0) {
    this.ticks++;
    const events = [];
    for (const b of this.bonds) {
      const { r, formed } = judge(X, b.hs, b.d, b.a);
      b.seen[b.now] = formed ? 1 : 0;
      b.reach[b.now] = r;
      b.now = (b.now + 1) % b.seen.length;
      b.count++;
      if (b.on) {
        const w = this.recent(b, SNAP_CHECKS);
        if (w.have === SNAP_CHECKS && w.share === 0 && w.r > SNAP_AT && moved >= GRIP_MOVED) {
          b.on = false;
          b.everSnapped = true;
          b.others = null;
          b.other = null;
          events.push({ type: 'snap', bond: b });
        }
      } else {
        this.otherPartner(b, X);
        const w = this.recent(b, BACK_CHECKS);
        if (w.have === BACK_CHECKS && w.share >= Math.max(BACK_FLOOR, BACK_SHARE * b.rest) && w.r <= BACK_TIGHT) {
          b.on = true;
          events.push({ type: 'back', bond: b });
        }
      }
    }
    return events;
  }
}

// ---- The pocket a side chain sits in ----

// The rotation and shift that lay one set of points on another (Horn 1987), as a quaternion by power iteration. No SVD needed for a few dozen points.
export function fitOnto(from, to, X, list) {
  const n = list.length;
  const a = [0, 0, 0], b = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    a[k] += from[i * 3 + k] / n;
    b[k] += to[list[i] * 3 + k] / n;
  }
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 3, q = list[i] * 3;
    const x = from[p] - a[0], y = from[p + 1] - a[1], z = from[p + 2] - a[2];
    const u = to[q] - b[0], v = to[q + 1] - b[1], w = to[q + 2] - b[2];
    Sxx += x * u; Sxy += x * v; Sxz += x * w;
    Syx += y * u; Syy += y * v; Syz += y * w;
    Szx += z * u; Szy += z * v; Szz += z * w;
  }
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const shift = Math.abs(N[0][0]) + Math.abs(N[1][1]) + Math.abs(N[2][2]) + Math.abs(N[3][3]) + 1;
  let q = [1, 0, 0, 0];
  for (let it = 0; it < 24; it++) {
    const o = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) o[i] += (N[i][j] + (i === j ? shift : 0)) * q[j];
    const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
    q = o.map((v) => v / l);
  }
  const [w, x, y, z] = q;
  const R = [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z];
  return { a, b, R };
}

const moved = (f, p) => {
  const x = p[0] - f.a[0], y = p[1] - f.a[1], z = p[2] - f.a[2];
  return [f.R[0] * x + f.R[1] * y + f.R[2] * z + f.b[0], f.R[3] * x + f.R[4] * y + f.R[5] * z + f.b[1], f.R[6] * x + f.R[7] * y + f.R[8] * z + f.b[2]];
};

export const SPHERE = 4.5;     // A around where the ring sat, the same sphere as the MD count
export const FAR_RES = 6;      // C-alphas further along the chain than this set the frame, so a shifted neighbour does not move the reference

// The place one side chain sits in, followed through the fold by the C-alphas far from it. It counts what is really inside, the side chain included.
export class Pocket {
  constructor(m, res) {
    this.m = m;
    this.res = res;
    this.far = m.ca.filter((_, r) => Math.abs(r - res) > FAR_RES);
    this.side = [];
    m.atoms.forEach((a, i) => {
      if (a.res === res && a.el !== 'H' && !['N', 'CA', 'C', 'O', 'OXT', 'CB'].includes(a.name)) this.side.push(i);
    });
    this.seen = 0;
    this.ref = new Float64Array(this.far.length * 3);
    this.home0 = [0, 0, 0];
  }

  // Averaged over a few frames at rest, since one frame is one thermal wobble.
  rest(X = this.m.X) {
    const n = ++this.seen;
    this.far.forEach((a, i) => {
      for (let k = 0; k < 3; k++) this.ref[i * 3 + k] += (X[a * 3 + k] - this.ref[i * 3 + k]) / n;
    });
    const c = this.centre(X);
    for (let k = 0; k < 3; k++) this.home0[k] += (c[k] - this.home0[k]) / n;
  }

  centre(X = this.m.X) {
    const c = [0, 0, 0];
    for (const i of this.side) for (let k = 0; k < 3; k++) c[k] += X[i * 3 + k] / this.side.length;
    return c;
  }

  // Where the side chain sat, in the protein as it is now.
  home(X = this.m.X) {
    return moved(fitOnto(this.ref, X, X, this.far), this.home0);
  }

  // How far the side chain is from there, and what fills the sphere now.
  read(X = this.m.X) {
    const { m, res } = this;
    const h = this.home(X);
    const c = this.centre(X);
    const R2 = SPHERE * SPHERE;
    let own = 0, carbon = 0, polar = 0;
    for (let i = 0; i < m.N; i++) {
      const a = m.atoms[i];
      if (a.el === 'H' || m.gone[i]) continue;
      const dx = X[i * 3] - h[0], dy = X[i * 3 + 1] - h[1], dz = X[i * 3 + 2] - h[2];
      if (dx * dx + dy * dy + dz * dz >= R2) continue;
      if (a.res === res) {
        if (this.side.includes(i)) own++;
      } else if (a.el === 'C') carbon++;
      else polar++;
    }
    return { off: Math.hypot(c[0] - h[0], c[1] - h[1], c[2] - h[2]), own, carbon, polar, all: own + carbon + polar };
  }
}

export const HOLE_READS = 8;     // reads at 15 a second: half a second
export const HOLE_MIN = 1;       // atoms under rest for a hole to count. The same half-second mean strays by about this at rest with no pull at all

// The hole as read once: a plain mean over the half second after the ring arrives, never a lowest value, so that it says what the pocket held then.
export class HoleRead {
  constructor() {
    this.reads = [];
  }

  // True once the window is full.
  add(r) {
    this.reads.push(r);
    return this.reads.length >= HOLE_READS;
  }

  mean(key) {
    return this.reads.reduce((t, r) => t + r[key], 0) / this.reads.length;
  }
}

// The angle at atom b, in degrees.
export function angleAt(X, a, b, c) {
  const ux = X[a * 3] - X[b * 3], uy = X[a * 3 + 1] - X[b * 3 + 1], uz = X[a * 3 + 2] - X[b * 3 + 2];
  const vx = X[c * 3] - X[b * 3], vy = X[c * 3 + 1] - X[b * 3 + 1], vz = X[c * 3 + 2] - X[b * 3 + 2];
  const cos = (ux * vx + uy * vy + uz * vz) / Math.sqrt((ux * ux + uy * uy + uz * uz) * (vx * vx + vy * vy + vz * vz));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

// How many other residues bring oily carbon within reach of this side chain's carbons. Counted for every residue: the aliphatic part of a Thr or a Lys
// touches oil too, and real water's hole fills with Lys as well as Leu.
export function oilTouch(m, res, X = m.X, within = 5) {
  const oil = oilAtoms(m);
  const w2 = within * within;
  const seen = new Set();
  m.atoms.forEach((a, i) => {
    if (a.res !== res || a.el !== 'C' || a.name === 'C' || a.name === 'CA') return;
    const p = i * 3;
    for (const j of oil) {
      const r = m.atoms[j].res;
      if (r === res || m.atoms[j].name === 'CA') continue;
      const q = j * 3;
      if ((X[p] - X[q]) ** 2 + (X[p + 1] - X[q + 1]) ** 2 + (X[p + 2] - X[q + 2]) ** 2 < w2) seen.add(r);
    }
  });
  return seen.size;
}

const CHARGE = { K: 1, R: 1, D: -1, E: -1 };

// What real water says one side chain holds, by residue pair. Oxygens of a carboxylate count as one, since runs disagree only on how they share.
// A cap bonds the backbone N-H of the next turn, two or three residues on. The N-terminal amine is left out: the measured protein carries a tag there.
export function placeOf(ties, name, cut = 0.5) {
  const no = +name.slice(1);
  const rows = (ties[name] ?? []).filter((t) => t[0] !== 'M1' || t[1] !== 'N');
  const noOf = (t) => +t[0].slice(1);
  const cap = rows.some((t) => t[1] === 'N' && noOf(t) - no >= 2 && noOf(t) - no <= 3 && t[2] >= 0.4);
  const salt = rows.some((t) => t[1] === 'side' && t[2] >= 0.7 && CHARGE[name[0]] * CHARGE[t[0][0]] === -1);
  const others = new Set(rows.filter((t) => t[2] >= cut && t[3] >= cut - 0.1 && !(t[1] === 'side' && CHARGE[name[0]] * CHARGE[t[0][0]] === -1)).map((t) => t[0]));
  return { cap, salt, hb: others.size };
}

// Mean crowding of one side chain. The same measure as burial, for readings that should not flicker with one thermal frame.
export function crowding(m, res) {
  let sum = 0;
  let n = 0;
  m.atoms.forEach((a, i) => {
    if (a.res === res && a.el !== 'H' && !['N', 'CA', 'C', 'O', 'OXT'].includes(a.name)) {
      sum += m.crowd[i];
      n++;
    }
  });
  return n ? sum / n : 0;
}

export const BURIED = 40;     // at or over this a side chain is buried
export const HALF = 34;       // at or over this it is half buried
export const levelOf = (crowd) => (crowd >= BURIED ? 'Buried' : crowd >= HALF ? 'Half buried' : 'In water');

export const bondName = (m, b) => {
  const one = (i) => `${m.p.seq[m.atoms[i].res]}${m.p.resno[m.atoms[i].res]}`;
  return `${one(b.d)}–${one(b.a)}`;
};

// True when one residue's side chain sits away from water. Mean crowding tracks solvent accessibility closely (r = -0.90 on both proteins here):
// residues under 10% accessible sit at 44 or more, and those over 40% at 30 or less.
export const burial = (m, res) => crowding(m, res) >= BURIED;

// A salt bridge on this residue right now, by the same rule as saltBridges.
export function saltNow(m, res, X = m.X) {
  for (const k of saltBridges(m, X)) if (Math.floor(k / 1000) === res || k % 1000 === res) return true;
  return false;
}

// Salt bridges by residue pair: Lys NZ, Arg NE/NH1/NH2 or the N-terminus within 4 A of Asp, Glu or C-terminal oxygens.
export function saltBridges(m, X = m.X) {
  if (!m.basic) {
    m.basic = [];
    m.acid = [];
    const last = m.p.n - 1;
    m.atoms.forEach((a, i) => {
      const aa = m.p.seq[a.res];
      if ((aa === 'K' && a.name === 'NZ') || (aa === 'R' && /^(NE|NH1|NH2)$/.test(a.name)) || (a.res === 0 && a.name === 'N')) m.basic.push(i);
      if ((aa === 'D' && /^OD/.test(a.name)) || (aa === 'E' && /^OE/.test(a.name)) || a.name === 'OXT' || (a.res === last && a.name === 'O')) m.acid.push(i);
    });
  }
  const out = new Set();
  for (const b of m.basic) {
    const i = b * 3;
    for (const a of m.acid) {
      const j = a * 3;
      if ((X[i] - X[j]) ** 2 + (X[i + 1] - X[j + 1]) ** 2 + (X[i + 2] - X[j + 2]) ** 2 < 16) out.add(m.atoms[a].res * 1000 + m.atoms[b].res);
    }
  }
  return out;
}
