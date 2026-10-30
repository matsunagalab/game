// Turns PDB files into src/data/proteins.json.
// Usage: node tools/build_data.mjs PDB_DIR
// Needs nothing beyond Node. The PDB files are read as text only.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapValue } from '../src/peptide.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PDB_DIR = process.argv[2];
if (!PDB_DIR) throw new Error('Give the folder that holds the PDB files.');

// context: extra chains that count as "neighbours" when measuring burial, but are not exported.
const SPECS = [
  { key: 'hemoglobin', pdb: '2HHB', chains: ['A', 'B', 'C', 'D'], het: ['HEM'] },
  { key: 'gcn4', pdb: '2ZTA', chains: ['A', 'B'] },
  { key: 'nanobody', pdb: '1MEL', chains: ['A'] },
  { key: 'myoglobin', pdb: '1MBN', chains: ['A'], het: ['HEM'] },
  { key: 'homeodomain', pdb: '1ENH', chains: ['A'] },
  { key: 'tenascin', pdb: '1TEN', chains: ['A'] },
  { key: 'fibronectin', pdb: '1FNA', chains: ['A'] },
  { key: 'gb1', pdb: '1PGA', chains: ['A'] },
  { key: 'ferritin', pdb: '2FHA', chains: ['A'], biomt: true },
  { key: 'gfp', pdb: '1EMA', chains: ['A'] },
  { key: 'protease', pdb: '1HSG', chains: ['A'], symChains: ['A', 'B'], het: ['MK1'] },
  { key: 'ctxb', pdb: '3CHB', chains: ['D'], symChains: ['D', 'E', 'F', 'G', 'H'] },
  { key: 'stnv', pdb: '2BUK', chains: ['A'], biomt: true },
];

const THREE = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
  MSE: 'M', CRO: 'X',
};
// Largest possible surface of each residue (Tien et al. 2013, theoretical), in square angstroms.
const MAX_ASA = {
  A: 129, R: 274, N: 195, D: 193, C: 167, Q: 225, E: 223, G: 104, H: 224, I: 197, L: 201,
  K: 236, M: 224, F: 240, P: 159, S: 155, T: 172, W: 285, Y: 263, V: 174, X: 300,
};
const RADIUS = { C: 1.7, N: 1.55, O: 1.52, S: 1.8, P: 1.8, F: 1.5, Z: 1.4 };

function parsePdb(text) {
  const models = text.split(/^ENDMDL/m)[0]; // first model only
  const atoms = [];
  const helices = [];
  const strands = [];
  const biomt = [];
  let row = {};
  for (const line of models.split('\n')) {
    const rec = line.slice(0, 6);
    if (rec === 'ATOM  ' || rec === 'HETATM') {
      const alt = line[16];
      if (alt !== ' ' && alt !== 'A') continue;
      const element = (line.slice(76, 78).trim() || line.slice(12, 14).trim()).toUpperCase();
      if (element === 'H' || element === 'D') continue;
      atoms.push({
        het: rec === 'HETATM',
        name: line.slice(12, 16).trim(),
        res: line.slice(17, 20).trim(),
        chain: line[21],
        seq: parseInt(line.slice(22, 26), 10),
        icode: line[26],
        x: +line.slice(30, 38),
        y: +line.slice(38, 46),
        z: +line.slice(46, 54),
        el: element,
      });
    } else if (rec === 'HELIX ') {
      const cls = parseInt(line.slice(38, 40), 10);
      helices.push({ chain: line[19], from: parseInt(line.slice(21, 25), 10), to: parseInt(line.slice(33, 37), 10), cls });
    } else if (rec === 'SHEET ') {
      strands.push({ chain: line[21], from: parseInt(line.slice(22, 26), 10), to: parseInt(line.slice(33, 37), 10) });
    } else if (line.startsWith('REMARK 350   BIOMT')) {
      const axis = +line[18];
      const nums = line.slice(23).trim().split(/\s+/).map(Number);
      row[axis] = nums;
      if (axis === 3) {
        biomt.push([...row[1], ...row[2], ...row[3]]);
        row = {};
      }
    }
  }
  return { atoms, helices, strands, biomt };
}

function residuesOf(atoms, chain) {
  const out = [];
  let cur = null;
  for (const a of atoms) {
    if (a.chain !== chain) continue;
    if (a.het && a.res !== 'MSE' && a.res !== 'CRO') continue;
    if (!THREE[a.res]) continue;
    const id = `${a.seq}${a.icode}`;
    if (!cur || cur.id !== id) {
      cur = { id, seq: a.seq, res: a.res, aa: THREE[a.res], chain, atoms: [] };
      out.push(cur);
    }
    cur.atoms.push(a);
  }
  const named = (r, names) => {
    for (const n of names) {
      const hit = r.atoms.find((a) => a.name === n);
      if (hit) return hit;
    }
    return null;
  };
  return out
    .map((r) => {
      r.ca = named(r, ['CA', 'CA2']);
      r.n = named(r, ['N', 'N1']);
      r.c = named(r, ['C', 'C3']);
      r.o = named(r, ['O', 'O3']);
      return r;
    })
    .filter((r) => r.ca && r.n && r.c && r.o);
}

// Shrake and Rupley: how much of each atom's probe sphere is not covered by neighbours.
function sasa(atoms) {
  const POINTS = 92;
  const unit = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < POINTS; i++) {
    const y = 1 - (2 * (i + 0.5)) / POINTS;
    const r = Math.sqrt(1 - y * y);
    unit.push([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r]);
  }
  const PROBE = 1.4;
  const CELL = 7;
  const grid = new Map();
  const keyOf = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  atoms.forEach((a, i) => {
    const k = keyOf(a.x, a.y, a.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  return atoms.map((a) => {
    const ra = (RADIUS[a.el] ?? 1.7) + PROBE;
    const near = [];
    const cx = Math.floor(a.x / CELL);
    const cy = Math.floor(a.y / CELL);
    const cz = Math.floor(a.z / CELL);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const cell = grid.get(`${cx + i},${cy + j},${cz + k}`);
          if (!cell) continue;
          for (const idx of cell) {
            const b = atoms[idx];
            if (b === a) continue;
            const rb = (RADIUS[b.el] ?? 1.7) + PROBE;
            const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
            if (d2 < (ra + rb) ** 2) near.push([b.x, b.y, b.z, rb * rb]);
          }
        }
    let open = 0;
    for (const u of unit) {
      const px = a.x + u[0] * ra;
      const py = a.y + u[1] * ra;
      const pz = a.z + u[2] * ra;
      let free = true;
      for (const n of near) {
        if ((px - n[0]) ** 2 + (py - n[1]) ** 2 + (pz - n[2]) ** 2 < n[3]) {
          free = false;
          break;
        }
      }
      if (free) open++;
    }
    return ((4 * Math.PI * ra * ra) * open) / POINTS;
  });
}

// Best rotation and translation taking P onto Q (Horn's quaternion method, Jacobi eigensolver).
function fit(P, Q) {
  const n = P.length;
  const mean = (A) => A.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
  const cp = mean(P);
  const cq = mean(Q);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++)
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) S[a][b] += (P[i][a] - cp[a]) * (Q[i][b] - cq[b]);
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++)
    for (let p = 0; p < 3; p++)
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(N[p][q]) < 1e-12) continue;
        const th = 0.5 * Math.atan2(2 * N[p][q], N[q][q] - N[p][p]);
        const c = Math.cos(th);
        const s = Math.sin(th);
        for (let k = 0; k < 4; k++) {
          const a = N[k][p];
          const b = N[k][q];
          N[k][p] = c * a - s * b;
          N[k][q] = s * a + c * b;
        }
        for (let k = 0; k < 4; k++) {
          const a = N[p][k];
          const b = N[q][k];
          N[p][k] = c * a - s * b;
          N[q][k] = s * a + c * b;
        }
        for (let k = 0; k < 4; k++) {
          const a = V[k][p];
          const b = V[k][q];
          V[k][p] = c * a - s * b;
          V[k][q] = s * a + c * b;
        }
      }
  let best = 0;
  for (let i = 1; i < 4; i++) if (N[i][i] > N[best][best]) best = i;
  const [w, x, y, z] = [V[0][best], V[1][best], V[2][best], V[3][best]];
  const R = [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
  const t = [
    cq[0] - (R[0] * cp[0] + R[1] * cp[1] + R[2] * cp[2]),
    cq[1] - (R[3] * cp[0] + R[4] * cp[1] + R[5] * cp[2]),
    cq[2] - (R[6] * cp[0] + R[7] * cp[1] + R[8] * cp[2]),
  ];
  return [R[0], R[1], R[2], t[0], R[3], R[4], R[5], t[1], R[6], R[7], R[8], t[2]];
}

const apply = (m, p) => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];

const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
const int16 = (values) => b64(Int16Array.from(values.map((v) => Math.round(v * 100))));

function build(spec) {
  const pdb = parsePdb(readFileSync(join(PDB_DIR, `${spec.pdb}.pdb`), 'utf8'));
  const residues = spec.chains.flatMap((c) => residuesOf(pdb.atoms, c));

  // Secondary structure from the depositors' HELIX and SHEET records.
  for (const r of residues) r.ss = 'C';
  for (const h of pdb.helices)
    if (h.cls === 1 || Number.isNaN(h.cls))
      for (const r of residues) if (r.chain === h.chain && r.seq >= h.from && r.seq <= h.to) r.ss = 'H';
  for (const s of pdb.strands)
    for (const r of residues) if (r.chain === s.chain && r.seq >= s.from && r.seq <= s.to) r.ss = 'E';

  // Each helix and strand record as residue index ranges, kept separate even when two records touch.
  const position = (chain, seq) => residues.findIndex((r) => r.chain === chain && r.seq === seq);
  const sse = [];
  for (const h of pdb.helices) {
    const a = position(h.chain, h.from);
    const b = position(h.chain, h.to);
    if (a >= 0 && b >= 0) sse.push({ t: 'H', a, b });
  }
  const seen = new Set();
  for (const e of pdb.strands) {
    const a = position(e.chain, e.from);
    const b = position(e.chain, e.to);
    if (a >= 0 && b >= 0 && !seen.has(`${a}-${b}`)) {
      seen.add(`${a}-${b}`);
      sse.push({ t: 'E', a, b });
    }
  }
  sse.sort((x, y) => x.a - y.a);

  const hetAtoms = (spec.het ?? []).flatMap((name) =>
    pdb.atoms.filter((a) => a.res === name && spec.chains.concat(spec.symChains ?? []).includes(a.chain)),
  );

  // Symmetry operators in the original PDB frame.
  let ops = null;
  if (spec.biomt) ops = pdb.biomt;
  if (spec.symChains) {
    const ref = residuesOf(pdb.atoms, spec.symChains[0]);
    ops = spec.symChains.map((c) => {
      const other = residuesOf(pdb.atoms, c);
      const pairs = ref.flatMap((r) => {
        const o = other.find((x) => x.id === r.id);
        return o ? [[[r.ca.x, r.ca.y, r.ca.z], [o.ca.x, o.ca.y, o.ca.z]]] : [];
      });
      return fit(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    });
  }

  // Centre on the whole assembly, then rewrite the operators for the new origin.
  const all = residues.flatMap((r) => r.atoms);
  let c = [0, 0, 0];
  const mine = all.reduce((s, a) => [s[0] + a.x / all.length, s[1] + a.y / all.length, s[2] + a.z / all.length], [0, 0, 0]);
  if (ops) {
    for (const op of ops) {
      const p = apply(op, mine);
      c = [c[0] + p[0] / ops.length, c[1] + p[1] / ops.length, c[2] + p[2] / ops.length];
    }
  } else c = mine;
  const symmetry = ops?.map((m) => {
    const o = apply(m, c);
    const t = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
    return [m[0], m[1], m[2], t[0], m[4], m[5], m[6], t[1], m[8], m[9], m[10], t[2]].map((v) => +v.toFixed(5));
  });

  // Burial of each residue, measured inside the exported chains plus any bound groups.
  const context = spec.symChains ? all : [...all, ...hetAtoms];
  const area = sasa(context);
  let k = 0;
  for (const r of residues) {
    r.asa = 0;
    for (const _ of r.atoms) r.asa += area[k++];
    r.rsa = Math.min(1, r.asa / (MAX_ASA[r.aa] ?? 200));
  }

  // Half-sphere exposure (Hamelryck 2005): neighbours on the side the side chain points to.
  // This separates the two faces of a strand, which plain burial cannot do in the middle of a sheet.
  for (const r of residues) {
    const cb = r.atoms.find((a) => a.name === 'CB');
    if (!cb) {
      r.hse = 0;
      continue;
    }
    const u = [cb.x - r.ca.x, cb.y - r.ca.y, cb.z - r.ca.z];
    let n = 0;
    for (const o of residues) {
      if (o === r) continue;
      const d = [o.ca.x - r.ca.x, o.ca.y - r.ca.y, o.ca.z - r.ca.z];
      if (d[0] ** 2 + d[1] ** 2 + d[2] ** 2 < 169 && d[0] * u[0] + d[1] * u[1] + d[2] * u[2] > 0) n++;
    }
    r.hse = n;
  }

  const flat = (pick) => residues.flatMap((r) => [pick(r).x - c[0], pick(r).y - c[1], pick(r).z - c[2]]);
  const chainIndex = residues.map((r) => spec.chains.indexOf(r.chain));
  const atomResidue = residues.flatMap((r, i) => r.atoms.map(() => i));
  const backbone = new Set(['N', 'CA', 'C', 'O', 'N1', 'CA2', 'C3', 'O3']);

  return {
    key: spec.key,
    pdb: spec.pdb,
    seq: residues.map((r) => r.aa).join(''),
    ss: residues.map((r) => r.ss).join(''),
    resno: residues.map((r) => r.seq),
    chain: chainIndex,
    rsa: residues.map((r) => Math.round(r.rsa * 100)),
    sse,
    hse: residues.map((r) => r.hse),
    hse: residues.map((r) => r.hse),
    n: int16(flat((r) => r.n)),
    ca: int16(flat((r) => r.ca)),
    c: int16(flat((r) => r.c)),
    o: int16(flat((r) => r.o)),
    atoms: {
      xyz: int16(all.flatMap((a) => [a.x - c[0], a.y - c[1], a.z - c[2]])),
      res: b64(Uint16Array.from(atomResidue)),
      el: all.map((a) => a.el[0]).join(''),
      side: all.map((a) => (backbone.has(a.name) ? '0' : '1')).join(''),
    },
    het: hetAtoms.length
      ? { xyz: int16(hetAtoms.flatMap((a) => [a.x - c[0], a.y - c[1], a.z - c[2]])), el: hetAtoms.map((a) => a.el[0]).join('') }
      : null,
    sym: symmetry ?? null,
  };
}

const out = SPECS.map(build);
writeFileSync(join(HERE, '../src/data/proteins.json'), JSON.stringify(out));

// The Ramachandran map for each residue type, 3 degrees to the cell. Row 0 is psi = -180.
const CELLS = 120;
const rama = {};
for (const kind of ['A', 'G', 'P']) {
  let row = '';
  for (let j = 0; j < CELLS; j++)
    for (let i = 0; i < CELLS; i++) row += mapValue(-180 + (i + 0.5) * 3, -180 + (j + 0.5) * 3, kind);
  rama[kind] = row;
}
writeFileSync(join(HERE, '../src/data/rama.json'), JSON.stringify({ cells: CELLS, ...rama }));
for (const p of out) {
  const helix = (p.ss.match(/H+/g) ?? []).length;
  const strand = (p.ss.match(/E+/g) ?? []).length;
  console.log(p.key.padEnd(11), p.pdb, 'res', String(p.seq.length).padStart(4), 'atoms', String(p.atoms.el.length).padStart(5),
    'helices', helix, 'strands', strand, 'sym', p.sym?.length ?? '-', 'het', p.het?.el.length ?? '-');
}
