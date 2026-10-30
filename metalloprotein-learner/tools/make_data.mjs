// Turns PDB files into src/data/sites.json. Every distance and fit in the game comes from here.
// Usage: node tools/make_data.mjs <folder with .pdb files>
// The folder needs each entry as XXXX.pdb, and 1K4C.pdb1 for the KcsA tetramer.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from './sites.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdbDir = process.argv[2];
if (!pdbDir) throw new Error('Pass the folder that holds the PDB files.');

const AA = new Set('ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL KCX FME MSE'.split(' '));
const BACKBONE = new Set(['N', 'C', 'O', 'OXT']);
const METAL = new Set('ZN FE CU NI CO MN MG CA K NA MO'.split(' '));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function parse(file, assemblyChain) {
  const text = readFileSync(file, 'latin1').split('\n');
  const atoms = [];
  const helices = [];
  const sheets = [];
  const jrnl = { auth: '', titl: '', ref: '', doi: '' };
  let model = 0;
  let resolution = null;
  const relabel = ['C', 'E', 'F', 'G'];
  for (const l of text) {
    const r = l.slice(0, 6);
    if (r === 'MODEL ') model = parseInt(l.slice(10)) - 1;
    if (r === 'ENDMDL' && !assemblyChain) break;
    if (r === 'ATOM  ' || r === 'HETATM') {
      const alt = l[16];
      if (alt !== ' ' && alt !== 'A') continue;
      let chain = l[21];
      if (assemblyChain) {
        if (chain !== assemblyChain) continue;
        chain = relabel[model];
      }
      const el = l.slice(76, 78).trim().toUpperCase();
      if (el === 'H' || el === 'D') continue;
      atoms.push({ het: r === 'HETATM', name: l.slice(12, 16).trim(), res: l.slice(17, 20).trim(), chain, num: parseInt(l.slice(22, 26)), x: +l.slice(30, 38), y: +l.slice(38, 46), z: +l.slice(46, 54), b: +l.slice(60, 66), el });
    }
    if (r === 'HELIX ') helices.push({ chain: l[19], a: parseInt(l.slice(21, 25)), b: parseInt(l.slice(33, 37)) });
    if (r === 'SHEET ') sheets.push({ chain: l[21], a: parseInt(l.slice(22, 26)), b: parseInt(l.slice(33, 37)) });
    if (l.startsWith('REMARK   2 RESOLUTION')) resolution = parseFloat(l.slice(22));
    if (r === 'JRNL  ') {
      const k = l.slice(12, 16).trim();
      const v = l.slice(19, 79).trim();
      if (k === 'AUTH' && !jrnl.authDone) { jrnl.auth += v; }
      if (k === 'TITL') jrnl.titl += (jrnl.titl && !jrnl.titl.endsWith('-') ? ' ' : '') + v;
      if (k === 'REF' && !jrnl.ref) jrnl.ref = v.replace(/\s+/g, ' ');
      if (k === 'DOI') jrnl.doi = v.trim();
    }
  }
  return { atoms, helices, sheets, jrnl, resolution };
}

const b64 = (nums) => {
  const a = new Int16Array(nums.map((v) => Math.round(v * 100)));
  return Buffer.from(a.buffer).toString('base64');
};

// Unit vectors of the ideal polyhedra.
const ring = (n, z, phase = 0, r = 1) => Array.from({ length: n }, (_, i) => {
  const t = phase + (2 * Math.PI * i) / n;
  return [r * Math.cos(t), r * Math.sin(t), z];
});
const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const IDEAL = {
  'linear': [[0, 0, 1], [0, 0, -1]],
  'trigonal planar': ring(3, 0),
  'T-shaped': [[1, 0, 0], [-1, 0, 0], [0, 1, 0]],
  'trigonal pyramidal': ring(3, -0.45).map(unit),
  'tetrahedral': [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(unit),
  'square planar': ring(4, 0),
  'seesaw': [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-0.5, Math.sqrt(3) / 2, 0]],
  'trigonal bipyramidal': [[0, 0, 1], [0, 0, -1], ...ring(3, 0)],
  'square pyramidal': [[0, 0, 1], ...ring(4, -0.17).map(unit)],
  'octahedral': [[0, 0, 1], [0, 0, -1], ...ring(4, 0)],
  'trigonal prismatic': [...ring(3, 0.72), ...ring(3, -0.72)].map(unit),
  'pentagonal bipyramidal': [[0, 0, 1], [0, 0, -1], ...ring(5, 0)],
  'capped octahedral': [[0.577, 0.577, 0.577], ...[[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]]].map(unit),
  'capped trigonal prismatic': [[1, 0, 0], ...ring(3, 0.72, Math.PI / 3), ...ring(3, -0.72, Math.PI / 3)].map(unit),
  'square antiprismatic': [...ring(4, 0.58, 0, 0.815), ...ring(4, -0.58, Math.PI / 4, 0.815)].map(unit),
  'cubic': [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map(unit),
  'dodecahedral': [[0, 1, 0.6], [0, -1, 0.6], [1, 0, -0.6], [-1, 0, -0.6], [0.6, 0, 1], [-0.6, 0, 1], [0, 0.6, -1], [0, -0.6, -1]].map(unit),
};

// Best rotation of Q onto P by Horn's quaternion method, using power iteration on the 4x4 key matrix.
function horn(P, Q, iters) {
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = Q[i];
    Sxx += q[0] * p[0]; Sxy += q[0] * p[1]; Sxz += q[0] * p[2];
    Syx += q[1] * p[0]; Syy += q[1] * p[1]; Syz += q[1] * p[2];
    Szx += q[2] * p[0]; Szy += q[2] * p[1]; Szz += q[2] * p[2];
  }
  const N = [
    Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx,
    Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz,
    Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy,
    Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz,
  ];
  const shift = Math.abs(Sxx) + Math.abs(Sxy) + Math.abs(Sxz) + Math.abs(Syx) + Math.abs(Syy) + Math.abs(Syz) + Math.abs(Szx) + Math.abs(Szy) + Math.abs(Szz) + 1e-9;
  let v = [1, 0.1, 0.2, 0.3];
  let lambda = 0;
  for (let k = 0; k < iters; k++) {
    const w = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) w[i] += (N[i * 4 + j] + (i === j ? shift : 0)) * v[j];
    const l = Math.hypot(...w);
    v = w.map((c) => c / l);
    lambda = l - shift;
  }
  return { q: v, lambda };
}
const rotate = ([w, x, y, z], [a, b, c]) => {
  const t = [2 * (y * c - z * b), 2 * (z * a - x * c), 2 * (x * b - y * a)];
  return [a + w * t[0] + y * t[2] - z * t[1], b + w * t[1] + z * t[0] - x * t[2], c + w * t[2] + x * t[1] - y * t[0]];
};
function* permutations(n) {
  const p = [...Array(n).keys()];
  const c = new Array(n).fill(0);
  yield p.slice();
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      const k = i % 2 ? c[i] : 0;
      [p[k], p[i]] = [p[i], p[k]];
      yield p.slice();
      c[i]++;
      i = 0;
    } else { c[i] = 0; i++; }
  }
}
// Fits an ideal polyhedron to the donor atoms, trying every assignment of vertices to atoms.
function fit(vectors, shape) {
  const ideal = IDEAL[shape];
  if (!ideal) throw new Error(`No ideal shape named ${shape}`);
  const n = vectors.length;
  if (ideal.length !== n) return null;
  const mean = vectors.reduce((s, v) => s + Math.hypot(...v), 0) / n;
  const Q = ideal.map((v) => v.map((c) => c * mean));
  let best = null;
  for (const perm of permutations(n)) {
    const q = perm.map((i) => Q[i]);
    const h = horn(vectors, q, 24);
    if (!best || h.lambda > best.lambda) best = { lambda: h.lambda, perm };
  }
  const q = best.perm.map((i) => Q[i]);
  const h = horn(vectors, q, 400);
  const placed = q.map((v) => rotate(h.q, v));
  let e = 0;
  for (let i = 0; i < n; i++) e += (placed[i][0] - vectors[i][0]) ** 2 + (placed[i][1] - vectors[i][1]) ** 2 + (placed[i][2] - vectors[i][2]) ** 2;
  return { rmsd: Math.sqrt(e / n), verts: placed };
}

const out = [];
const report = [];
for (const s of SITES) {
  const file = join(pdbDir, s.assembly ? `${s.pdb}.pdb1` : `${s.pdb}.pdb`);
  const pdb = parse(file, s.assembly);
  const header = s.assembly ? parse(join(pdbDir, `${s.pdb}.pdb`)) : pdb;
  const { atoms } = pdb;
  const key = (a) => `${a.chain}${a.num}.${a.name}`;
  const byKey = new Map();
  for (const a of atoms) if (!byKey.has(key(a))) byKey.set(key(a), a);
  const get = (sel) => {
    const a = byKey.get(sel);
    if (!a) throw new Error(`${s.key}: no atom ${sel}`);
    return a;
  };
  const resOf = (sel) => sel.split('.')[0];
  const sameRes = (a, r) => `${a.chain}${a.num}` === r;

  const stageMetals = s.stages.map((st) => st.metals.map(get));
  const allMetals = [...new Set(stageMetals.flat())];
  const c = allMetals.reduce((m, a) => ({ x: m.x + a.x / allMetals.length, y: m.y + a.y / allMetals.length, z: m.z + a.z / allMetals.length }), { x: 0, y: 0, z: 0 });

  // Residues drawn as sticks.
  const named = new Set();
  const backboneWanted = new Set();
  for (const st of s.stages) {
    for (const sel of [...(st.tap ?? []), ...(st.given ?? []), ...(st.decoy ?? [])]) {
      if (!byKey.has(sel)) { console.log(`  ! ${s.key}: no atom ${sel}`); continue; }
      named.add(resOf(sel));
      const a = get(sel);
      if (BACKBONE.has(a.name)) backboneWanted.add(resOf(sel));
    }
  }
  for (const r of [...(s.core ?? []), ...(s.show ?? [])]) named.add(r);

  const drawn = [];
  const index = new Map();
  for (const a of atoms) {
    const r = `${a.chain}${a.num}`;
    if (!named.has(r)) continue;
    if (AA.has(a.res) && BACKBONE.has(a.name) && !backboneWanted.has(r)) continue;
    if (METAL.has(a.el) && a.het) continue;
    index.set(key(a), drawn.length);
    drawn.push(a);
  }
  for (const m of allMetals) if (!index.has(key(m))) { index.set(key(m), drawn.length); drawn.push(m); }

  // Covalent bonds among drawn atoms, plus the metal-sulfide bonds inside clusters.
  const radius = { C: 0.77, N: 0.72, O: 0.7, S: 1.04, P: 1.1 };
  const bonds = [];
  for (let i = 0; i < drawn.length; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      const A = drawn[i], B = drawn[j];
      const d = dist(A, B);
      if (d > 3) continue;
      if (A.res === 'HOH' || B.res === 'HOH') continue;
      const mA = METAL.has(A.el), mB = METAL.has(B.el);
      if (mA || mB) {
        const cluster = (s.hull && sameRes(A, s.hull) && sameRes(B, s.hull)) || (A.res === 'SF4' && B.res === 'SF4');
        if (cluster && !(mA && mB) && d < 2.7) bonds.push([i, j]);
        continue;
      }
      const lim = (radius[A.el] ?? 0.8) + (radius[B.el] ?? 0.8) + 0.3;
      if (d < lim) bonds.push([i, j]);
    }
  }

  const centre = (a) => [a.x - c.x, a.y - c.y, a.z - c.z];
  const stages = s.stages.map((st, si) => {
    const metals = stageMetals[si];
    const nearest = (a) => Math.min(...metals.map((m) => dist(a, m)));
    const tap = (st.tap ?? []).map(get);
    const given = (st.given ?? []).map(get);
    const decoy = (st.decoy ?? []).filter((x) => byKey.has(x)).map(get);
    const one = metals.length === 1 ? metals[0] : null;
    const fits = {};
    if (one) {
      const vectors = [...given, ...tap].map((a) => [a.x - one.x, a.y - one.y, a.z - one.z]);
      for (const shape of st.shapes) {
        const f = fit(vectors, shape);
        if (f) fits[shape] = { rmsd: +f.rmsd.toFixed(2), verts: f.verts.map(([x, y, z]) => [+(x + one.x - c.x).toFixed(3), +(y + one.y - c.y).toFixed(3), +(z + one.z - c.z).toFixed(3)]) };
      }
    }
    const summary = (a) => ({ i: index.get(key(a)), d: +nearest(a).toFixed(2) });
    return {
      metals: metals.map((m) => index.get(key(m))),
      tap: tap.map(summary),
      given: given.map(summary),
      decoy: decoy.map(summary),
      together: (st.together ?? []).map((g) => g.map((x) => (st.tap ?? []).indexOf(x))),
      fits,
      shapes: st.shapes,
    };
  });

  // Chain traces for ribbons.
  const chains = [];
  for (const id of s.chains) {
    const res = new Map();
    for (const a of atoms) {
      if (a.chain !== id || !AA.has(a.res) || (a.het && a.res !== 'KCX' && a.res !== 'FME' && a.res !== 'MSE')) continue;
      if (!res.has(a.num)) res.set(a.num, {});
      res.get(a.num)[a.name] = a;
    }
    const nums = [...res.keys()].sort((p, q) => p - q).filter((n) => res.get(n).CA && res.get(n).O);
    const sourceChain = s.assembly ? s.assembly : id;
    const sourceH = header.helices.filter((h) => h.chain === sourceChain);
    const sourceE = header.sheets.filter((h) => h.chain === sourceChain);
    const ss = nums.map((n) => (sourceH.some((h) => n >= h.a && n <= h.b) ? 'H' : sourceE.some((e) => n >= e.a && n <= e.b) ? 'E' : 'C')).join('');
    const ends = [];
    for (let i = 0; i < nums.length - 1; i++) if (dist(res.get(nums[i]).CA, res.get(nums[i + 1]).CA) > 4.6) ends.push(i);
    chains.push({
      id, ss, ends,
      ca: b64(nums.flatMap((n) => centre(res.get(n).CA))),
      o: b64(nums.flatMap((n) => centre(res.get(n).O))),
    });
  }
  const nucleic = (s.na ?? []).map((id) => b64(atoms.filter((a) => a.chain === id && a.name === 'P').flatMap(centre)));

  const clean = {
    key: s.key,
    pdb: s.pdb,
    res: header.resolution,
    cite: { auth: header.jrnl.auth, title: header.jrnl.titl, ref: header.jrnl.ref, doi: header.jrnl.doi },
    chains,
    nucleic,
    atoms: drawn.map((a) => [a.el, a.name, a.res, a.num, a.chain, ...centre(a).map((v) => +v.toFixed(3)), Math.round(a.b)]),
    bonds,
    stages,
    hull: s.hull ? drawn.flatMap((a, i) => (sameRes(a, s.hull) ? [i] : [])) : null,
  };
  out.push(clean);

  const label = (a) => `${a.res}${a.num}${a.chain}.${a.name}`;
  report.push(`\n${s.key} ${s.pdb} ${header.resolution} A  residues ${chains.map((x) => x.ss.length).join('+')}  atoms ${drawn.length}  ${header.jrnl.ref}`);
  s.stages.forEach((st, si) => {
    const metals = stageMetals[si];
    const near = (a) => Math.min(...metals.map((m) => dist(a, m))).toFixed(2);
    report.push(`  stage ${si + 1} ${metals.map(label).join(' ')}`);
    report.push(`    tap   ${(st.tap ?? []).map((x) => `${label(get(x))} ${near(get(x))}`).join(', ')}`);
    if (st.given?.length) report.push(`    given ${st.given.map((x) => `${label(get(x))} ${near(get(x))}`).join(', ')}`);
    report.push(`    decoy ${(st.decoy ?? []).filter((x) => byKey.has(x)).map((x) => `${label(get(x))} ${near(get(x))}`).join(', ')}`);
    const claimed = new Set([...(st.tap ?? []), ...(st.given ?? []), ...(st.decoy ?? [])]);
    const missed = atoms.filter((a) => !claimed.has(key(a)) && 'NOS'.includes(a.el) && !metals.includes(a) && !(s.hull && sameRes(a, s.hull)) && +near(a) < 5.6 && !(BACKBONE.has(a.name) && a.name !== 'O')).sort((p, q) => near(p) - near(q)).map((a) => `${a.chain}${a.num}.${a.name}(${a.res}) ${near(a)}`);
    if (missed.length) report.push(`    near  ${missed.join(', ')}`);
    const f = stages[si].fits;
    if (Object.keys(f).length) report.push(`    fits  ${Object.entries(f).map(([k, v]) => `${k} ${v.rmsd}`).join(', ')}`);
  });
}

writeFileSync(join(root, 'src/data/sites.json'), JSON.stringify(out));
console.log(report.join('\n'));
console.log(`\nsites.json ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
