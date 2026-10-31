// Reduces real PDB entries to compact bead silhouettes for the game.
// Coordinates come straight from each file; only the view and the sampling are chosen here.
//   curl -O https://files.rcsb.org/download/5P21.pdb.gz  (and so on, into $PDBDIR)
//   PDBDIR=/path/to/files node tools/pdb.mjs
import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.PDBDIR;

const cache = {};
function load(id) {
  if (cache[id]) return cache[id];
  const pdb = join(dir, `${id}.pdb.gz`);
  const atoms = [];
  if (existsSync(pdb)) {
    const bio = [];
    let model = 0;
    for (const l of gunzipSync(readFileSync(pdb)).toString().split('\n')) {
      if (l.startsWith('MODEL')) model += 1;
      if (model > 1) break;
      const m = l.match(/^REMARK 350\s+BIOMT(\d)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
      if (m && (bio[+m[2] - 1] ??= [], bio[+m[2] - 1].length < 3)) bio[+m[2] - 1].push(m.slice(3).map(Number));
      if (!l.startsWith('ATOM') && !l.startsWith('HETATM')) continue;
      if (!' A'.includes(l[16])) continue;
      atoms.push({ het: l[0] === 'H', name: l.slice(12, 16).trim(), res: l.slice(17, 20).trim(), chain: l[21], seq: +l.slice(22, 26), x: +l.slice(30, 38), y: +l.slice(38, 46), z: +l.slice(46, 54) });
    }
    return (cache[id] = { atoms, bio });
  }
  // Large entries exist only as mmCIF. Whitespace-separated, so a column split is enough.
  for (const l of gunzipSync(readFileSync(join(dir, `${id}.cif.gz`))).toString().split('\n')) {
    if (!l.startsWith('ATOM') && !l.startsWith('HETATM')) continue;
    const f = l.split(/\s+/);
    if (f[4] !== '.' && f[4] !== 'A') continue;
    atoms.push({ het: f[0] === 'HETATM', name: f[3].replaceAll('"', ''), res: f[5], chain: f[6], entity: +f[7], seq: +f[8], x: +f[10], y: +f[11], z: +f[12] });
  }
  return (cache[id] = { atoms, bio: [] });
}

// 'A', 'A,B', 'A:10-20', 'A:GNP' (a hetero group by name)
function select(atoms, spec, heavy = false) {
  const out = [];
  for (const part of spec.split(',')) {
    const [c, r] = part.split(':');
    if (r && /^[A-Z0-9]{2,3}$/.test(r) && !/^\d/.test(r)) { out.push(...atoms.filter((a) => a.chain === c && a.res === r)); continue; }
    const [lo, hi] = r ? r.split('-').map(Number) : [-1e9, 1e9];
    out.push(...atoms.filter((a) => a.chain === c && !a.het && a.seq >= lo && a.seq <= (hi ?? lo) && (heavy || a.name === 'CA' || a.name === 'P')));
  }
  return out;
}

// One named atom: 'A:GNP@PG'.
function atomNamed(atoms, spec) {
  const [where, name] = spec.split('@');
  const [c, r] = where.split(':');
  return atoms.filter((a) => a.chain === c && (a.res === r || a.seq === +r) && a.name === name);
}

const centre = (l) => {
  if (!l.length) throw new Error('empty selection');
  const n = l.length;
  return [l.reduce((s, a) => s + a.x, 0) / n, l.reduce((s, a) => s + a.y, 0) / n, l.reduce((s, a) => s + a.z, 0) / n];
};
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(...a) || 1; return a.map((v) => v / n); };

function principal(list) {
  // Power iteration on the covariance, enough to find the long axis.
  const c = centre(list);
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const a of list) {
    const d = [a.x - c[0], a.y - c[1], a.z - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j];
  }
  let v = unit([1, 0.7, 0.3]);
  for (let k = 0; k < 60; k++) v = unit(m.map((r) => dot(r, v)));
  return v;
}

// Least-squares rotation of P onto Q (Horn 1987), found by power iteration on the 4 × 4 key matrix.
function superpose(P, Q) {
  const cp = centre(P); const cq = centre(Q);
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  P.forEach((a, n) => {
    const p = [a.x - cp[0], a.y - cp[1], a.z - cp[2]];
    const q = [Q[n].x - cq[0], Q[n].y - cq[1], Q[n].z - cq[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += p[i] * q[j];
  });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const shift = N.flat().reduce((m, v) => m + Math.abs(v), 0);
  let q = [1, 0.1, 0.1, 0.1];
  for (let it = 0; it < 4000; it++) {
    const n = N.map((r, i) => r.reduce((m, v, j) => m + v * q[j], shift * q[i]));
    const l = Math.hypot(...n);
    q = n.map((v) => v / l);
  }
  const [w, x, y, z] = q;
  const R = [
    [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
  ];
  return (p) => { const d = sub(p, cp); return [dot(R[0], d) + cq[0], dot(R[1], d) + cq[1], dot(R[2], d) + cq[2]]; };
}

const VIEWS = {};

// Each spec: pdb, groups ({sel, r, het?, bio?}), and a view. y maps a vector to screen up, x to screen right.
function build(spec) {
  const { atoms, bio } = load(spec.pdb);
  const groups = spec.groups.map((g) => {
    let list = select(atoms, g.sel, g.heavy);
    if (g.step > 1) list = list.filter((_, i) => i % g.step === 0);
    if (g.bio) list = bio.flatMap((m) => list.map((a) => ({ ...a, x: dot(m[0], [a.x, a.y, a.z]) + m[0][3], y: dot(m[1], [a.x, a.y, a.z]) + m[1][3], z: dot(m[2], [a.x, a.y, a.z]) + m[2][3] })));
    return { ...g, list };
  });
  const allPts = groups.flatMap((g) => g.list);
  const pick = (s) => {
    if (/@[A-Z]/.test(s)) return atomNamed(atoms, s);
    if (!s.includes('@')) { const l = select(atoms, s); return l.length ? l : select(atoms, s, true); }
    return bio.flatMap((m) => select(atoms, s.replace('@', '')).map((a) => ({ x: dot(m[0], [a.x, a.y, a.z]) + m[0][3], y: dot(m[1], [a.x, a.y, a.z]) + m[1][3], z: dot(m[2], [a.x, a.y, a.z]) + m[2][3] })));
  };
  let Y = spec.y ? unit(sub(centre(pick(spec.y[1])), centre(pick(spec.y[0])))) : principal(allPts);
  let X = spec.x ? sub(centre(pick(spec.x[1])), centre(pick(spec.x[0]))) : cross(Y, Math.abs(Y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
  X = unit(sub(X, Y.map((v) => v * dot(X, Y))));
  let Z = cross(X, Y);
  if (spec.end) { const t = Y; Y = Z; Z = t; X = cross(Y, Z); } // Look down the axis instead of along it.
  const roll = (spec.roll ?? 0) * Math.PI / 180;
  const yaw = (spec.yaw ?? 0) * Math.PI / 180;
  const c = spec.about ? centre(pick(spec.about)) : centre(allPts);
  // A second conformation is laid onto the first over residues that do not move.
  let toRef = null;
  if (spec.fit) {
    const ref = VIEWS[spec.fit.ref];
    const seqOf = (a) => a.seq;
    const mine = new Map(select(atoms, spec.fit.sel).map((a) => [seqOf(a), a]));
    const theirs = select(load(ref.pdb).atoms, spec.fit.refSel).filter((a) => mine.has(seqOf(a)));
    let from = theirs.map((a) => mine.get(seqOf(a)));
    let to = theirs;
    let move = superpose(from, to);
    const dev = (i, f) => Math.hypot(...sub(f([from[i].x, from[i].y, from[i].z]), [to[i].x, to[i].y, to[i].z]));
    // Trim to the part that really stays still: drop what moved, and fit again.
    if (spec.fit.trim) {
      for (const limit of [2.5, 1.5, 1.5, 1.5, 1.5]) {
        const keep = from.map((_, i) => i).filter((i) => dev(i, move) < limit);
        from = keep.map((i) => from[i]); to = keep.map((i) => to[i]);
        move = superpose(from, to);
      }
    }
    const rms = Math.sqrt(from.reduce((m, _, i) => m + dev(i, move) ** 2, 0) / from.length);
    console.log('fit', spec.name, 'on', from.length, 'beads, RMSD', rms.toFixed(2), 'Å');
    toRef = { move, view: ref.view };
  }
  const view = (p) => {
    if (toRef) return toRef.view(toRef.move(p));
    const d = sub(p, c);
    let x = dot(d, X), y = dot(d, Y), z = dot(d, Z);
    [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
    return [x, y, z];
  };
  VIEWS[spec.name] = { view, pdb: spec.pdb };
  const pts = {};
  for (const [k, s] of Object.entries(spec.pts ?? {})) pts[k] = view(centre(pick(s))).map((v) => +v.toFixed(1));
  const flat = groups.map((g) => g.list.map((a) => view([a.x, a.y, a.z])));
  const span = Math.max(...flat.flat(2).map(Math.abs));
  const scale = span / 127;
  const bytes = new Int8Array(flat.flat(2).map((v) => Math.round(v / scale)));
  return { s: +scale.toFixed(4), g: groups.map((g, i) => [flat[i].length, g.r ?? 3.6]), d: Buffer.from(bytes.buffer).toString('base64'), ...(spec.pts ? { p: pts } : {}), keys: groups.map((g) => g.list.map((a) => `${g.keyByName ? '' : ''}${a.seq}:${a.name}`)), raw: flat };
}

const ca = (sel, r, extra) => ({ sel, r, ...extra });
const chains = (s) => s.split('').join(',');

// Pick one copy of a large asymmetric unit, grouped by label chain (mmCIF).
const RIB = (() => {
  if (!dir || !existsSync(join(dir, '4V51.cif.gz'))) return null;
  const { atoms } = load('4V51');
  const by = {};
  for (const a of atoms) if (a.name === 'CA' || a.name === 'P') (by[a.chain] ??= { ent: a.entity, list: [] }).list.push(a);
  const home = centre(by.A.list);
  // The entry holds two ribosomes. Each entity is taken once, from the copy built around chains A (16S) and IA (23S).
  const large = centre(by.IA.list);
  const near = {};
  for (const [c, v] of Object.entries(by)) {
    const big = v.ent >= 34;
    (near[v.ent] ??= []).push([Math.hypot(...sub(centre(v.list), big ? large : home)), c]);
  }
  for (const k of Object.keys(near)) near[k] = near[k].sort((x, y) => x[0] - y[0]).slice(0, +k === 23 ? 2 : 1).map((x) => x[1]);
  return near;
})();

const SPECS = {
  // Signal
  egfr: { pdb: '1IVO', groups: [ca('A', 3.6), ca('B', 3.6), ca('C', 3.8), ca('D', 3.8)], y: ['A:480-512,B:480-512', 'C,D'] },
  rasT: { pdb: '5P21', groups: [ca('A:1-31,A:39-58,A:68-166', 3.3), ca('A:32-38', 3.3), ca('A:59-67', 3.3), ca('A:GNP', 2.0)], y: ['A:GNP', 'A:160-166'], x: ['A:50-56', 'A:95-105'], about: 'A:1-166', pts: { pg: 'A:GNP@PG', t35: 'A:35', g60: 'A:60' } },
  rasD: { pdb: '4Q21', groups: [ca('A:1-31,A:39-58,A:68-166', 3.3), ca('A:32-38', 3.3), ca('A:59-67', 3.3), ca('A:GDP', 2.0)], fit: { ref: 'rasT', sel: 'A:1-30,A:39-58,A:76-166', refSel: 'A:1-30,A:39-58,A:76-166' } },
  sos: { pdb: '1BKD', groups: [ca('S', 3.6)] },
  gap: { pdb: '1WQ1', groups: [ca('G', 3.6)], pts: { finger: 'G:789' } },
  raf: { pdb: '3OMV', groups: [ca('A', 3.6)] },
  mek: { pdb: '1S9J', groups: [ca('A', 3.6)] },
  erk: { pdb: '2ERK', groups: [ca('A', 3.6)] },
  // Transcription
  pol2: { pdb: '1I6H', groups: [ca('A', 4.8, { step: 2 }), ca('B', 4.8, { step: 2 }), ca('C,E,F,H,I,J,K,L', 4.6, { step: 2 }), ca('D', 4.2), ca('R', 4.2)], y: ['A:1100-1200', 'B:300-500'] },
  // Translation
  trna: { pdb: '1EHZ', groups: [ca('A', 4.6)], y: ['A:36', 'A:76'], x: ['A:5', 'A:56'] },
  eftu: { pdb: '1TTT', groups: [ca('A', 3.6), ca('D', 4.6)], y: ['A:1-200', 'D:36'] },
  // The decoding centre, atom by atom: 16S bases at rest and on a codon–anticodon helix.
  dec1: { pdb: '1IBM', groups: [{ sel: 'A:1492,A:1493', r: 1.7, heavy: true }, { sel: 'A:530', r: 1.7, heavy: true }, { sel: 'Z:1-3', r: 1.7, heavy: true }, { sel: 'Y:34-36', r: 1.7, heavy: true }], y: ['Y:34-36', 'Z:1-3'], x: ['Y:36', 'Y:34'], about: 'Y:34-36,Z:1-3', pts: { p1: 'Z:1', p2: 'Z:2', p3: 'Z:3' } },
  dec0: { pdb: '1J5E', groups: [{ sel: 'A:1492,A:1493', r: 1.7, heavy: true }, { sel: 'A:530', r: 1.7, heavy: true }], fit: { ref: 'dec1', sel: 'A:1408-1412,A:1488-1491,A:1494-1498', refSel: 'A:1408-1412,A:1488-1491,A:1494-1498' } },
  // Targeting
  srp: { pdb: '2J28', groups: [ca('9', 3.6), ca('8', 4.8)], x: ['9:1-100', '9:300-430'] },
  sec: { pdb: '1RH5', groups: [ca('A', 3.5), ca('B,C', 3.5)] , y: ['A:100-110', 'A:300-310'] },
  hsp70: { pdb: '2KHO', groups: [ca('A:1-383', 3.6), ca('A:384-605', 3.6)] },
  // Energy
  f1: { pdb: '2XND', groups: [ca('A,B,C', 4.2, { step: 2 }), ca('D,E,F', 4.2, { step: 2 })], y: ['J,K,L,M,N,O,P,Q', 'A,B,C,D,E,F'], end: true, about: 'G:1-20', pts: { b1: 'D', b2: 'E', b3: 'F' } },
  gamma: { pdb: '2XND', groups: [ca('G,H,I', 3.8)], y: ['J,K,L,M,N,O,P,Q', 'A,B,C,D,E,F'], end: true, about: 'G:1-20' },
  c8: { pdb: '2XND', groups: [ca('J,L,N,P', 3.4), ca('K,M,O,Q', 3.4)], y: ['J,K,L,M,N,O,P,Q', 'A,B,C,D,E,F'], end: true, about: 'J,K,L,M,N,O,P,Q', pts: { c1: 'J:58', c2: 'K:58', c3: 'L:58', c4: 'M:58', c5: 'N:58', c6: 'O:58', c7: 'P:58', c8: 'Q:58' } },
  c10: { pdb: '2XOK', groups: [ca('K,M,O,Q,S', 3.4), ca('L,N,P,R,T', 3.4)], y: ['K,L,M,N,O,P,Q,R,S,T', 'A,B,C,D,E,F'], end: true, about: 'K,L,M,N,O,P,Q,R,S,T', pts: { c1: 'K:59' } },
  c14: { pdb: '2W5J', groups: [ca('A,C,E,G,I,K,M', 3.4), ca('B,D,F,H,J,L,V', 3.4)], y: ['A:30-44,B:30-44,C:30-44,D:30-44', 'A:1-3,A:76-78,B:1-3,C:1-3,D:1-3'], end: true, about: 'A,B,C,D,E,F,G,H,I,J,K,L,M,V' },
  // Ions
  kcsa: { pdb: '1K4C', groups: [ca('C', 3.6, { bio: true })], y: ['C:110-118@', 'C:50-60@'], pts: { s1: 'C:78@', s2: 'C:77@', s3: 'C:76@', s4: 'C:75@', s0: 'C:79@' } },
  nakE1: { pdb: '3WGU', groups: [ca('A', 3.6), ca('B,G', 3.6)], y: ['A:100-115,A:320-335,A:770-790,A:960-975', 'A:400-560'], x: ['A:200-300', 'A:600-700'] },
  nakE2: { pdb: '2ZXE', groups: [ca('A', 3.6), ca('B,G', 3.6)], y: ['A:100-115,A:320-335,A:770-790,A:960-975', 'A:400-560'], x: ['A:200-300', 'A:600-700'] },
  // The rotary head, side on: a closed and an open β against γ.
  // Chain F (tight) opens into chain E: the Tight→Open step of the cycle. Both F and D hold AMP-PNP, and 133–192 moves, so it is left out of the fit.
  betaC: { pdb: '2XND', groups: [ca('F:9-470', 3.8)], y: ['J,K,L,M,N,O,P,Q', 'A,B,C,D,E,F'], x: ['G:1-40', 'F:100-300'], about: 'G:1-40' },
  betaO: { pdb: '2XND', groups: [ca('E:9-470', 3.8)], fit: { ref: 'betaC', sel: 'E:9-80,E:85-132,E:193-340', refSel: 'F:9-80,F:85-132,F:193-340' } },
  gammaS: { pdb: '2XND', groups: [ca('G', 3.8)], y: ['J,K,L,M,N,O,P,Q', 'A,B,C,D,E,F'], x: ['G:1-40', 'F:100-300'], about: 'G:1-40' },
  // Motors
  kin: { pdb: '1BG2', groups: [ca('A', 3.5), ca('A:ADP', 2.0)] },
  kinU: { pdb: '1BG2', groups: [ca('A:1-325', 3.5)], y: ['A:150-200', 'A:30-60'] },
  kinD: { pdb: '1MKJ', groups: [ca('A:1-325', 3.5)], fit: { ref: 'kinU', sel: 'A:1-175,A:255-325', refSel: 'A:1-175,A:255-325', trim: true } },
  neck: { pdb: '1MKJ', groups: [ca('A:326-340', 3.5)], fit: { ref: 'kinU', sel: 'A:1-175,A:255-325', refSel: 'A:1-175,A:255-325', trim: true } },
  tub: { pdb: '1JFF', groups: [ca('A', 3.5), ca('B', 3.5), ca('A:GTP', 2.0), ca('B:GDP', 2.0)], y: ['A', 'B'] },
  // Division
  mcc: { pdb: '4AEZ', groups: [ca('A', 3.6), ca('B', 3.6), ca('C', 3.6)] },
  cdk: { pdb: '1FIN', groups: [ca('A', 3.5), ca('B', 3.5), ca('A:ATP', 2)] },
  aur: { pdb: '4AF3', groups: [ca('A', 3.5), ca('D', 3.5)] },
  ub: { pdb: '1UBQ', groups: [ca('A', 3.4)], pts: { k48: 'A:48', k11: 'A:11', tail: 'A:76' } },
  prot: { pdb: '5LE5', groups: [ca(chains('ABCDEFGOPQRSTU'), 4.8, { step: 2 }), ca(chains('HIJKLMNVWXYZab'), 4.8, { step: 2 })] },
  sep: { pdb: '5U1T', groups: [ca('A', 3.8), ca('B', 3.8)] },
  apc: { pdb: '4UI9', groups: [ca('A,C,F,H', 5, { step: 3 }), ca('I,J,K,N,O,P', 5, { step: 3 }), ca('Q,V,W', 5, { step: 3 })] },
};

if (RIB) {
  const pick = (ents) => ents.flatMap((e) => RIB[e] ?? []);
    const small = pick([...Array(21).keys()].map((i) => i + 2));
  const large = pick([...Array(33).keys()].map((i) => i + 36)).filter((c) => !RIB[22]?.includes(c));
  const t = { P: RIB[22][0], others: RIB[23] };
  SPECS.ribo = {
    pdb: '4V51',
    groups: [{ sel: RIB[1].join(','), r: 7, step: 3 }, { sel: small.join(','), r: 6.4, step: 2 }, { sel: [...RIB[34], ...RIB[35]].join(','), r: 7, step: 3 }, { sel: large.join(','), r: 6.4, step: 2 }],
    y: [RIB[1].join(','), RIB[34].join(',')],
    x: ['W', 'Y'], // From the E-site tRNA to the A-site anticodon stem: the mRNA runs 5′ to 3′ left to right.
    pts: { Pt: t.P, a: 'Y', e: 'W', m: RIB[24][0], ptc: `${RIB[34][0]}:2451`, l1: pick([36])[0] },
  };
}

const out = {};
for (const [k, s] of Object.entries(SPECS)) {
  try { out[k] = build({ ...s, name: k }); } catch (e) { console.log('FAILED', k, e.message); }
}
// Pairs of conformations for morphing: only beads present in both, in matching order.
const MORPH = { ras: ['rasD', 'rasT', 3], kin: ['kinU', 'kinD', 1], beta: ['betaC', 'betaO', 1], dec: ['dec0', 'dec1', 2] };
const morph = {};
for (const [k, [a, b, n]] of Object.entries(MORPH)) {
  const A = out[a]; const B = out[b];
  const pairs = [...Array(n).keys()].map((g) => {
    const there = new Map(B.keys[g].map((key, i) => [key, i]));
    return A.keys[g].flatMap((key, i) => (there.has(key) ? [[A.raw[g][i], B.raw[g][there.get(key)]]] : []));
  });
  const flat = pairs.flat(2).flat();
  const span = Math.max(...flat.map(Math.abs));
  const scale = span / 127;
  const pack = (w) => Buffer.from(new Int8Array(pairs.flat().flatMap((p) => p[w].map((v) => Math.round(v / scale)))).buffer).toString('base64');
  morph[k] = { s: +scale.toFixed(4), g: pairs.map((p, i) => [p.length, A.g[i][1]]), a: pack(0), b: pack(1) };
  console.log('morph', k, pairs.map((p) => p.length).join('+'), 'max shift Å', Math.max(...pairs.flat().map(([p, q]) => Math.hypot(...sub(p, q)))).toFixed(1));
}
for (const m of Object.values(out)) { delete m.keys; delete m.raw; }
const total = Object.values(out).reduce((a, m) => a + m.d.length, 0);
writeFileSync(join(root, 'src/molecules.js'), `// Generated by tools/pdb.mjs. Bead positions reduced from PDB coordinates.\nexport const MOL = ${JSON.stringify(out)};\nexport const MORPH = ${JSON.stringify(morph)};\n`);
console.log(Object.entries(out).map(([k, m]) => `${k}:${m.g.reduce((a, g) => a + g[0], 0)}`).join(' '));
console.log(`beads data ${(total / 1024).toFixed(0)} KB`);
if (out.ribo) console.log('ribo pts', JSON.stringify(out.ribo.p));
for (const k of ['c8', 'kcsa', 'gap']) console.log(k, JSON.stringify(out[k]?.p));
