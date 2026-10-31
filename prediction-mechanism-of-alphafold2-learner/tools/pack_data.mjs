// Turns the raw downloads into the small data module the game ships.
//   node tools/fetch_data.mjs && node tools/pack_data.mjs
// The sample of sequences is seeded, so the same inputs give the same file.
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { apc, entropy, miMatrix, uniformWeights } from '../src/science/msa.js';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.DATA_CACHE || join(homedir(), '.cache/alphafold2-learner-data');
const AA = 'ACDEFGHIKLMNPQRSTVWY-';
const AA3 = { ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', MSE: 'M' };

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function sampleAlignment(file, { reservoir = 30000, keep = 2000, gapMax = 0.25, seed = 7 }) {
  const random = rng(seed), rows = [];
  let seen = 0;
  const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line || line[0] === '#' || line[0] === '/') continue;
    const p = line.trim().split(/\s+/);
    if (p.length !== 2) continue;
    const m = p[1].replace(/[a-z.]/g, '');
    seen += 1;
    if (rows.length < reservoir) rows.push([p[0], m]);
    else { const k = Math.floor(random() * seen); if (k < reservoir) rows[k] = [p[0], m]; }
  }
  const good = rows.filter(([, s]) => (s.match(/-/g)?.length ?? 0) / s.length <= gapMax);
  for (let i = good.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [good[i], good[j]] = [good[j], good[i]]; }
  return { seen, passed: good.length, sampled: rows.length, rows: good.slice(0, keep) };
}

// A Smith-Waterman alignment of one sequence to the alignment's profile, to learn which column is which residue.
function mapToColumns(seq, rows) {
  const L = rows[0][1].length, f = Array.from({ length: L }, () => new Float64Array(21));
  for (const [, s] of rows) for (let c = 0; c < L; c += 1) { const a = AA.indexOf(s[c]); f[c][a < 0 ? 20 : a] += 1; }
  const bg = new Float64Array(20);
  for (const col of f) for (let a = 0; a < 20; a += 1) bg[a] += col[a];
  const bt = bg.reduce((x, y) => x + y, 0);
  const score = f.map((col) => { const t = col.reduce((x, y) => x + y, 0) + 10.5; return Array.from({ length: 20 }, (_, a) => Math.log(((col[a] + 0.5) / t) / (bg[a] / bt))); });
  const n = seq.length, H = Array.from({ length: L + 1 }, () => new Float64Array(n + 1)), T = Array.from({ length: L + 1 }, () => new Int8Array(n + 1));
  const gap = -3;
  let best = 0, bi = 0, bj = 0;
  for (let i = 1; i <= L; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const m = H[i - 1][j - 1] + score[i - 1][AA.indexOf(seq[j - 1])], d = H[i - 1][j] + gap, r = H[i][j - 1] + gap;
      const v = Math.max(0, m, d, r);
      H[i][j] = v;
      T[i][j] = v === 0 ? 0 : v === m ? 1 : v === d ? 2 : 3;
      if (v > best) { best = v; bi = i; bj = j; }
    }
  }
  const col2res = new Int16Array(L).fill(-1);
  let i = bi, j = bj;
  while (i > 0 && j > 0 && T[i][j] !== 0) {
    if (T[i][j] === 1) { col2res[i - 1] = j - 1; i -= 1; j -= 1; } else if (T[i][j] === 2) i -= 1; else j -= 1;
  }
  return { col2res: [...col2res], score: best };
}

function parsePDB(file, chain, { bfactor = false } = {}) {
  const res = new Map();
  for (const l of readFileSync(file, 'latin1').split('\n')) {
    if (l.startsWith('ENDMDL')) break;
    if (!(l.startsWith('ATOM') || (l.startsWith('HETATM') && l.slice(17, 20) === 'MSE'))) continue;
    if (chain && l[21] !== chain) continue;
    if (l[16] !== ' ' && l[16] !== 'A') continue;
    const name = l.slice(17, 20), key = l.slice(22, 27);
    if (!AA3[name]) continue;
    if (!res.has(key)) res.set(key, { name, num: parseInt(l.slice(22, 26), 10), atoms: {}, b: parseFloat(l.slice(60, 66)) });
    res.get(key).atoms[l.slice(12, 16).trim()] = [parseFloat(l.slice(30, 38)), parseFloat(l.slice(38, 46)), parseFloat(l.slice(46, 54))];
  }
  const rs = [...res.values()].filter((r) => r.atoms.N && r.atoms.CA && r.atoms.C);
  const seq = rs.map((r) => AA3[r.name]).join('');
  const pack = (a) => { const v = new Int16Array(rs.length * 3); rs.forEach((r, i) => { const p = r.atoms[a] ?? r.atoms.CA; for (let k = 0; k < 3; k += 1) v[i * 3 + k] = Math.round(p[k] * 100); }); return Buffer.from(v.buffer).toString('base64'); };
  const out = { nums: rs.map((r) => r.num), seq, n: pack('N'), ca: pack('CA'), c: pack('C'), cb: pack('CB') };
  if (bfactor) out.plddt = Buffer.from(Uint16Array.from(rs.map((r) => Math.round(r.b * 100))).buffer).toString('base64');
  return out;
}

function packMSA(rows) {
  const N = rows.length, L = rows[0][1].length, bits = new Uint8Array(Math.ceil(N * L * 5 / 8));
  let bit = 0;
  for (const [, s] of rows) {
    for (let c = 0; c < L; c += 1) {
      const a = Math.max(0, AA.indexOf(s[c]) < 0 ? 20 : AA.indexOf(s[c]));
      for (let k = 4; k >= 0; k -= 1) { if ((a >> k) & 1) bits[bit >> 3] |= 128 >> (bit & 7); bit += 1; }
    }
  }
  return { N, L, letters: Buffer.from(bits).toString('base64') };
}

// Chapter 1's new case: real SH3 sequences. The link between the columns is computed on the whole sample, not the six rows.
async function miniCase() {
  const file = join(CACHE, 'PF00018.full.gz');
  if (!existsSync(file) || !existsSync(join(CACHE, '1SHG.pdb'))) return null;
  const sample = await sampleAlignment(file, { reservoir: 12000, keep: 4000, gapMax: 0.2, seed: 11 });
  const st = parsePDB(join(CACHE, '1SHG.pdb'), 'A'), { col2res } = mapToColumns(st.seq, sample.rows);
  const rows = sample.rows.map(([, s]) => s), N = rows.length, L = rows[0].length, X = new Uint8Array(N * L);
  rows.forEach((s, r) => { for (let c = 0; c < L; c += 1) { const a = AA.indexOf(s[c]); X[r * L + c] = a < 0 ? 20 : a; } });
  const w = uniformWeights(N).w, M = apc(miMatrix(X, N, L, w), L);
  const raw = miMatrix(X, N, L, w);
  const cb = (i) => { const v = Buffer.from(st.cb, 'base64'), a = new Int16Array(v.buffer, v.byteOffset, v.length / 2); return [a[i * 3] / 100, a[i * 3 + 1] / 100, a[i * 3 + 2] / 100]; };
  const dist = (a, b) => { const p = cb(col2res[a]), q = cb(col2res[b]); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const H = Array.from({ length: L }, (_, c) => entropy(X, N, L, c, w));
  let best = null;
  for (let i = 0; i < L; i += 1) for (let j = i + 6; j < L; j += 1) {
    if (col2res[i] < 0 || col2res[j] < 0 || H[i] < 1.2 || H[j] < 1.2) continue;
    if (dist(i, j) < 8 && (!best || M[i * L + j] > best[0])) best = [M[i * L + j], i, j];
  }
  const [, a, b] = best;
  const flat = [...H.keys()].filter((c) => col2res[c] >= 0).sort((x, y) => H[x] - H[y])[0];
  const other = [...H.keys()].filter((c) => col2res[c] >= 0 && c !== a && c !== b && c !== flat && H[c] > 1.5).sort((x, y) => (raw[x * L + a] + raw[x * L + b]) - (raw[y * L + a] + raw[y * L + b]))[0];
  // The commonest letter pairs at a and b, two real rows of each.
  const count = new Map();
  rows.forEach((s) => { const k = s[a] + s[b]; count.set(k, (count.get(k) ?? 0) + 1); });
  const top = [...count.entries()].filter(([k]) => !k.includes('-')).sort((x, y) => y[1] - x[1]);
  const lead = []; const usedA = new Set(), usedB = new Set();
  for (const [k] of top) { if (!usedA.has(k[0]) && !usedB.has(k[1])) { lead.push(k); usedA.add(k[0]); usedB.add(k[1]); } if (lead.length === 3) break; }
  const picked = [];
  for (const k of lead) picked.push(...rows.filter((s) => s[a] + s[b] === k && !s[a].includes('-') && s[other] !== '-' && s[flat] !== '-').slice(0, 2));
  const name = (c) => st.seq[col2res[c]] + st.nums[col2res[c]];
  return { rows: picked.map((s) => [s[a], s[flat], s[other], s[b]].join('')), names: [name(a), name(flat), name(other), name(b)], mi: { pair: raw[a * L + b], flat: raw[a * L + flat], other: raw[a * L + other] }, d: dist(a, b), n: sample.seen, N };
}

const pfam = 'PF00072';
const sample = await sampleAlignment(join(CACHE, `${pfam}.full.gz`), {});
const che = parsePDB(join(CACHE, '3CHY.pdb'), 'A');
const { col2res, score } = mapToColumns(che.seq, sample.rows);
console.log('alignment', sample.seen, 'sequences; sampled', sample.sampled, 'passing', sample.passed, 'kept', sample.rows.length, 'columns', sample.rows[0][1].length, 'map score', score.toFixed(1), 'mapped', col2res.filter((x) => x >= 0).length);

const structures = {
  che3: { ...che, id: '3CHY', chain: 'A', what: 'CheY, E. coli, X-ray 1.66 A' },
  ake4: { ...parsePDB(join(CACHE, '4AKE.pdb'), 'A'), id: '4AKE', chain: 'A', what: 'adenylate kinase, open, no ligand, X-ray 2.2 A' },
  ake1: { ...parsePDB(join(CACHE, '1AKE.pdb'), 'A'), id: '1AKE', chain: 'A', what: 'adenylate kinase, closed, with inhibitor Ap5A, X-ray 2.0 A' },
  cam1: { ...parsePDB(join(CACHE, '1CLL.pdb'), 'A'), id: '1CLL', chain: 'A', what: 'calmodulin, calcium bound, extended, X-ray 1.7 A' },
  cam2: { ...parsePDB(join(CACHE, '1CDL.pdb'), 'A'), id: '1CDL', chain: 'A', what: 'calmodulin with a target peptide, compact, X-ray 2.0 A' },
  cam3: { ...parsePDB(join(CACHE, '1CFD.pdb'), 'A'), id: '1CFD', chain: 'A', what: 'calmodulin without calcium, NMR, model 1' },
  kai1: { ...parsePDB(join(CACHE, '2QKE.pdb'), 'A'), id: '2QKE', chain: 'A', what: 'KaiB, ground fold, X-ray 2.7 A' },
  kai2: { ...parsePDB(join(CACHE, '5JYT.pdb'), 'A'), id: '5JYT', chain: 'A', what: 'KaiB, fold-switched, stabilised by mutation, NMR, model 1' },
};
const afdb = {};
for (const acc of ['P0AE67', 'P69441', 'P0DP23', 'P04637', 'Q13542']) {
  const f = join(CACHE, `${acc}.pdb`);
  if (!existsSync(f)) { console.log('missing AlphaFold DB model', acc); continue; }
  afdb[acc] = parsePDB(f, 'A', { bfactor: true });
  const head = readFileSync(f, 'latin1').split('\n').filter((l) => l.startsWith('TITLE') || l.startsWith('REMARK   1 ')).slice(0, 3).join(' | ');
  afdb[acc].head = head.slice(0, 160);
}

const mini = await miniCase();
console.log('mini case', JSON.stringify(mini));

const paes = {};
for (const acc of ['P0AE67', 'P0DP23', 'P69441']) {
  const f = join(CACHE, `${acc}.pae.json`);
  if (!existsSync(f)) { console.log('no PAE file for', acc); continue; }
  const doc = JSON.parse(readFileSync(f, 'utf8')), m = (Array.isArray(doc) ? doc[0] : doc).predicted_aligned_error;
  paes[acc] = { n: m.length, e: Buffer.from(Uint8Array.from(m.flat().map((v) => Math.min(255, Math.round(v * 2))))).toString('base64') };
}

// The closest heavy atoms of each pair of residues in 3CHY, in tenths of an angstrom. Chapter 2 uses it to show that
// a pair over our 8 A C-beta line can still touch by its side chains.
function closestAtoms(file, chain) {
  const res = new Map();
  for (const l of readFileSync(file, 'latin1').split('\n')) {
    if (l.startsWith('ENDMDL')) break;
    if (!l.startsWith('ATOM') || l[21] !== chain || (l[16] !== ' ' && l[16] !== 'A') || l.slice(76, 78).trim() === 'H') continue;
    const num = parseInt(l.slice(22, 26), 10);
    if (!res.has(num)) res.set(num, []);
    res.get(num).push([parseFloat(l.slice(30, 38)), parseFloat(l.slice(38, 46)), parseFloat(l.slice(46, 54))]);
  }
  const nums = [...res.keys()], n = nums.length, out = new Uint8Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let best = 25.5;
      for (const p of res.get(nums[i])) for (const q of res.get(nums[j])) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      out[i * n + j] = Math.round(best * 10);
    }
  }
  return { nums, d: Buffer.from(out).toString('base64') };
}

const out = {
  mini, paes, heavy: closestAtoms(join(CACHE, '3CHY.pdb'), 'A'),
  pfam, msa: packMSA(sample.rows), col2res, nSeenInFamily: sample.seen, structures, afdb,
};
const path = join(here, '../src/data/bundle.js');
const text = `// Built by tools/pack_data.mjs. Do not edit by hand.\nexport default ${JSON.stringify(out)};\n`;
writeFileSync(path, text);
console.log('wrote', path, (text.length / 1024).toFixed(0), 'KB');
