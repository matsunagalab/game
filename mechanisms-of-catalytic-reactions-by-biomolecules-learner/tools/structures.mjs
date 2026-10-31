// Reduces real PDB entries to what the game draws: the reactive atoms, nearby context, and a dark body from the real surface.
// Every position is a crystal atom or follows a rule stated in src/chem/mechanisms.js.
// Reach is measured here: which atoms can bond, which can pass a proton. Nothing is typed in by hand.
//   mkdir pdb; for id in 2SIC 6RSA 2CBA 3D92 7TIM 1YPI 4DXH 1ARG 1H6M 1DQX; do curl -o pdb/$id.pdb https://files.rcsb.org/download/$id.pdb; done
//   PDBDIR=pdb DEPS=$HOME/.cache/pchem-learner node tools/structures.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MECHS } from '../src/chem/mechanisms.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.PDBDIR;
const deps = process.env.DEPS || root;
const { edgeTable, triTable } = await import(join(deps, 'node_modules/three/examples/jsm/objects/MarchingCubes.js'));

// These cut-offs are chosen by hand, not measured. See the README.
const REACH = 3.7;      // Å: heavy atoms this close can form a new bond here
const HOP = 4.2;        // Å: heavy atoms this close can pass a proton
const HYDRIDE = 3.1;    // Å: a C–H hydrogen this close to an acceptor can move as hydride
// Distance alone would let atoms of one small group bond across it. Bonds count too.
const MIN_BOND_PATH = 4;    // bonds between two atoms before they may form a new bond (a ring of at least five)
const MIN_PROTON_PATH = 3;  // bonds between two atoms before a proton may pass directly between them

const cache = {};
function load(id) {
  if (cache[id]) return cache[id];
  const atoms = [];
  for (const l of readFileSync(join(dir, `${id}.pdb`), 'utf8').split('\n')) {
    if (l.startsWith('ENDMDL')) break;
    if (!l.startsWith('ATOM') && !l.startsWith('HETATM')) continue;
    if (!' A'.includes(l[16])) continue;
    atoms.push({ het: l[0] === 'H', n: l.slice(12, 16).trim(), r: l.slice(17, 20).trim(), c: l[21], s: +l.slice(22, 26), p: [+l.slice(30, 38), +l.slice(38, 46), +l.slice(46, 54)], e: l.slice(76, 78).trim() || l.slice(12, 14).trim()[0] });
  }
  return (cache[id] = atoms);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (norm(a) || 1));
const dist = (a, b) => norm(sub(a, b));

function resolveSite(m) {
  const A = load(m.pdb ?? 'none_');
  const pos = {};
  const get = (ref) => {
    if (pos[ref]) return pos[ref];
    if (ref.includes(':')) {
      const [c, s, n] = ref.split(':');
      const hit = A.find((q) => q.c === c && q.s === +s && q.n === n);
      if (!hit) throw new Error(`${m.key}: no atom ${ref} in ${m.pdb}`);
      return hit.p;
    }
    return null;
  };
  const tetDirs = (c, n1, n2) => {
    const u1 = unit(sub(n1, c)), u2 = unit(sub(n2, c)), bis = unit(mul(add(u1, u2), -1)), nrm = unit(cross(u1, u2));
    const a = 54.75 * Math.PI / 180;
    return [1, -1].map((s) => unit(add(mul(bis, Math.cos(a)), mul(nrm, s * Math.sin(a)))));
  };
  const place = (at) => {
    if (at.pdb) return get(at.pdb);
    if (at.xyz) return at.xyz;
    const refs = (l) => { const r = l.map(get); return r.some((x) => !x) ? null : r; };
    if (at.h) { const r = refs(at.h); return r && add(r[0], mul(unit(sub(r[1], r[0])), 0.98)); }
    if (at.awayH) {
      const r = refs(at.awayH); if (!r) return null;
      const d = unit(sub(r[0], r[1])), perp = unit(cross(d, [0.3, 0.2, 1]));
      return add(r[0], mul(unit(add(mul(d, 0.35), perp)), 0.98));
    }
    if (at.ringH || at.tri) { const r = refs(at.ringH || at.tri); return r && add(r[0], mul(unit(mul(add(unit(sub(r[1], r[0])), unit(sub(r[2], r[0]))), -1)), 1.0)); }
    if (at.tet) { const r = refs(at.tet); return r && add(r[0], mul(unit(mul(add(add(unit(sub(r[1], r[0])), unit(sub(r[2], r[0]))), unit(sub(r[3], r[0]))), -1)), 1.09)); }
    if (at.tet2) { const r = refs(at.tet2); if (!r) return null; const [p, q] = tetDirs(r[0], r[1], r[2]); return add(r[0], mul(at.side > 0 ? p : q, at.len || 1.09)); }
    if (at.towardFrom) {
      const [c, target, len] = at.towardFrom, C = get(c), T = get(target); if (!C || !T) return null;
      const nb = m.bonds.filter((b) => b.includes(c)).map((b) => (b[0] === c ? b[1] : b[0])).filter((id) => id !== 'Hc').map(get);
      if (nb.some((x) => !x)) return null;
      const opts = tetDirs(C, nb[0], nb[1]).map((d) => add(C, mul(d, len)));
      return dist(opts[0], T) < dist(opts[1], T) ? opts[0] : opts[1];
    }
    if (at.along) { const r = refs(at.along.slice(0, 2)); return r && add(r[0], mul(unit(sub(r[1], r[0])), at.along[2])); }
    if (at.same) { const b = get(at.same[0]); return b && add(b, at.same[1]); }
    if (at.sp2sub) {
      const r = refs(at.sp2sub.slice(0, 2)); if (!r) return null;
      const d = unit(sub(r[0], r[1])), perp = unit(cross(d, [0.3, 0.8, 0.5]));
      return add(r[0], mul(unit(add(mul(d, 0.5), mul(perp, at.sp2sub[2] * 0.866))), 1.25));
    }
    if (at.trilat) {
      const [a, ra, b, rb, away] = at.trilat, pa = get(a), pb = get(b), pc = get(away);
      if (!pa || !pb || !pc) return null;
      const ab = sub(pb, pa), d = norm(ab), e = unit(ab);
      const t = (ra * ra - rb * rb + d * d) / (2 * d), r = Math.sqrt(Math.max(ra * ra - t * t, 0.01));
      const mid = add(pa, mul(e, t));
      const out = unit(sub(sub(mid, pc), mul(e, dot(sub(mid, pc), e))));
      return add(mid, mul(out, r));
    }
    if (at.co2) {
      const hit = load('3D92').find((q) => q.r === 'CO2' && q.s === 301 && q.n === at.co2);
      return hit.p;
    }
    throw new Error(`placement ${JSON.stringify(at)}`);
  };
  for (let pass = 0; pass < 6; pass++) for (const a of m.atoms) if (!pos[a.id]) { const p = place(a.at); if (p) pos[a.id] = p; }
  for (const a of m.atoms) if (!pos[a.id]) throw new Error(`${m.key}: cannot place ${a.id}`);
  return { pos, get, A };
}

// Context: dim sticks around the reactive atoms, so the site reads as protein.
function contextAtoms(m, A, pos) {
  const used = new Set(m.atoms.filter((a) => a.at?.pdb).map((a) => a.at.pdb));
  const out = [];
  for (const item of m.ctx || []) {
    if (typeof item !== 'string') { out.push({ el: item.el, p: pos[item.id] || item.at.xyz, res: item.label, link: item.bond }); continue; }
    const [c, s, n] = item.split(':');
    for (const q of A) {
      if (q.c !== c || q.s !== +s || q.e === 'H' || q.e === 'D' || q.r === 'HOH') continue;
      if (n && q.n !== n) continue;
      const ref = `${c}:${s}:${q.n}`;
      if (used.has(ref)) { out.push({ el: q.e, p: q.p, skip: true, ref, res: q.r + q.s }); continue; }
      out.push({ el: q.e, p: q.p, ref, res: q.r + q.s });
    }
  }
  return out;
}

// Shortest path through the mechanism's own bonds. Atoms not joined by modelled bonds have no path.
function graphDistance(bonds, ids) {
  const nb = Object.fromEntries(ids.map((id) => [id, []]));
  for (const [a, b] of bonds) { nb[a]?.push(b); nb[b]?.push(a); }
  const table = {};
  for (const id of ids) {
    const d = { [id]: 0 }; let front = [id];
    while (front.length) { const next = []; for (const u of front) for (const v of nb[u] || []) if (d[v] === undefined) { d[v] = d[u] + 1; next.push(v); } front = next; }
    table[id] = d;
  }
  return (a, b) => table[a]?.[b] ?? Infinity;
}

const RES = { ALA: 'Ala', ARG: 'Arg', ASN: 'Asn', ASP: 'Asp', CYS: 'Cys', GLN: 'Gln', GLU: 'Glu', GLY: 'Gly', HIS: 'His', ILE: 'Ile', LEU: 'Leu', LYS: 'Lys', MET: 'Met', PHE: 'Phe', PRO: 'Pro', SER: 'Ser', THR: 'Thr', TRP: 'Trp', TYR: 'Tyr', VAL: 'Val' };

// Rotation search: keep the reactive atoms apart on a tall phone screen, and face the cleft to the viewer.
function chooseView(points, bodyDir, extra = []) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const quat = () => {
    const u = rnd(), v = rnd() * 2 * Math.PI, w = rnd() * 2 * Math.PI;
    const s = Math.sqrt(1 - u), t = Math.sqrt(u);
    return [s * Math.sin(v), s * Math.cos(v), t * Math.sin(w), t * Math.cos(w)];
  };
  const toMat = ([x, y, z, w]) => [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
  const c = points.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / points.length);
  let best = null;
  const score = (R) => {
    const proj = points.map((p) => { const d = sub(p, c); return [dot(R[0], d), dot(R[1], d), dot(R[2], d)]; });
    let soft = 0, low = 1e9;
    for (let i = 0; i < proj.length; i++) for (let j = i + 1; j < proj.length; j++) {
      const e = Math.hypot(proj[i][0] - proj[j][0], proj[i][1] - proj[j][1]);
      low = Math.min(low, e);
      soft += Math.exp(-e * 1.6);
    }
    const xs = proj.map((p) => p[0]), ys = proj.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const face = bodyDir ? dot(R[2], bodyDir) : 1;
    return -soft * 2 + low * 1.5 - Math.abs(h / Math.max(w, 1) - 1.25) * 1.2 - Math.max(w - 11, 0) * 0.4 + face * 3.0;
  };
  for (let i = 0; i < 6000; i++) {
    const R = toMat(quat()), s = score(R);
    if (!best || s > best.s) best = { s, R };
  }
  return { R: best.R, c };
}

// A dark body: Gaussian density of the real atoms, contoured by marching cubes, smoothed.
function surface(atoms, step = 1.6, sigma = 1.5) {
  const pts = atoms.map((a) => a.p);
  const lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])) - 7);
  const hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])) + 7);
  const dim = lo.map((l, k) => Math.ceil((hi[k] - l) / step) + 1);
  const [nx, ny, nz] = dim, grid = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  const R = Math.ceil(sigma * 2.6 / step), s2 = 2 * sigma * sigma;
  for (const p of pts) {
    const g = [0, 1, 2].map((k) => (p[k] - lo[k]) / step);
    const ci = Math.round(g[0]), cj = Math.round(g[1]), ck = Math.round(g[2]);
    for (let k = Math.max(0, ck - R); k <= Math.min(nz - 1, ck + R); k++) for (let j = Math.max(0, cj - R); j <= Math.min(ny - 1, cj + R); j++) for (let i = Math.max(0, ci - R); i <= Math.min(nx - 1, ci + R); i++) {
      const dx = (i - g[0]) * step, dy = (j - g[1]) * step, dz = (k - g[2]) * step;
      grid[id(i, j, k)] += Math.exp(-(dx * dx + dy * dy + dz * dz) / s2);
    }
  }
  const iso = 0.72;
  const verts = [], tris = [], edgeMap = new Map();
  const corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const vert = (a, b, va, vb) => {
    const ia = id(...a), ib = id(...b), key = ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
    if (edgeMap.has(key)) return edgeMap.get(key);
    const t = (iso - va) / (vb - va);
    const p = [0, 1, 2].map((k) => lo[k] + (a[k] + (b[k] - a[k]) * t) * step);
    verts.push(p); edgeMap.set(key, verts.length - 1);
    return verts.length - 1;
  };
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = corners.map(([a, b, c]) => grid[id(i + a, j + b, k + c)]);
    let cube = 0;
    v.forEach((x, n) => { if (x < iso) cube |= 1 << n; });
    if (!edgeTable[cube]) continue;
    const e = new Array(12);
    const map = (c) => [i + corners[c][0], j + corners[c][1], k + corners[c][2]];
    for (let n = 0; n < 12; n++) {
      if (!(edgeTable[cube] & (1 << n))) continue;
      const [a, b] = edges[n];
      e[n] = vert(map(a), map(b), v[a], v[b]);
    }
    for (let t = cube << 4; triTable[t] !== -1; t += 3) tris.push(e[triTable[t]], e[triTable[t + 1]], e[triTable[t + 2]]);
  }
  // Laplacian smoothing with a little shrink correction.
  const nbr = verts.map(() => new Set());
  for (let t = 0; t < tris.length; t += 3) { const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]]; nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b); }
  let P = verts;
  for (const lam of [0.6, -0.62, 0.6, -0.62, 0.6]) {
    P = P.map((p, i) => { const l = [...nbr[i]]; if (!l.length) return p; const m = l.reduce((s, q) => add(s, P[q]), [0, 0, 0]).map((x) => x / l.length); return add(p, mul(sub(m, p), lam)); });
  }
  const N = P.map(() => [0, 0, 0]);
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    const f = cross(sub(P[b], P[a]), sub(P[c], P[a]));
    for (const q of [a, b, c]) { N[q][0] += f[0]; N[q][1] += f[1]; N[q][2] += f[2]; }
  }
  return { P, N: N.map(unit), T: tris };
}

function packBody({ P, N, T }) {
  const lo = [0, 1, 2].map((k) => Math.min(...P.map((p) => p[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...P.map((p) => p[k])));
  const s = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 65535;
  const n = P.length, tn = T.length;
  const buf = Buffer.alloc(n * 6 + n * 2 + tn * 2);
  let o = 0;
  for (const p of P) for (let k = 0; k < 3; k++) { buf.writeUInt16LE(Math.round((p[k] - lo[k]) / s), o); o += 2; }
  for (const v of N) {
    // Octahedral normal in two bytes.
    const l = Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]);
    let x = v[0] / l, y = v[1] / l;
    if (v[2] < 0) { const a = (1 - Math.abs(y)) * Math.sign(x || 1), b = (1 - Math.abs(x)) * Math.sign(y || 1); x = a; y = b; }
    buf.writeUInt8(Math.round((x * 0.5 + 0.5) * 255), o++); buf.writeUInt8(Math.round((y * 0.5 + 0.5) * 255), o++);
  }
  for (const i of T) { buf.writeUInt16LE(i, o); o += 2; }
  return { n, tn, lo, s, b64: buf.toString('base64') };
}

// Least-squares fit of one set of points onto another (Horn 1987), by power iteration on the 4 × 4 key matrix.
function superpose(P, Q) {
  const mean = (l) => l.reduce((m, p) => add(m, p), [0, 0, 0]).map((v) => v / l.length);
  const cp = mean(P), cq = mean(Q), S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  P.forEach((a, n) => { const p = sub(a, cp), q = sub(Q[n], cq); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += p[i] * q[j]; });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
  const shift = N.flat().reduce((m, v) => m + Math.abs(v), 0);
  let q = [1, 0.1, 0.1, 0.1];
  for (let it = 0; it < 5000; it++) { const v = N.map((r, i) => r.reduce((m, x, j) => m + x * q[j], shift * q[i])); const l = Math.hypot(...v); q = v.map((x) => x / l); }
  const [w, x, y, z] = q;
  const R = [[w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z]];
  return (p) => { const d = sub(p, cp); return add([dot(R[0], d), dot(R[1], d), dot(R[2], d)], cq); };
}

// A proton hops along a clear line. An atom sitting on that line, such as phosphorus in an in-line attack, blocks it.
function blocked(a, b, others) {
  const d = sub(b, a), l = norm(d);
  if (l < 3.2) return false;
  return others.some((p) => { const t = dot(sub(p, a), d) / (l * l); if (t < 0.2 || t > 0.8) return false; return dist(p, add(a, mul(d, t))) < 0.7; });
}

const SITES = {}, BODIES = {}, report = [];
for (const m of Object.values(MECHS)) {
  let A = [], pos, get;
  if (m.pdb) ({ pos, get, A } = resolveSite(m));
  else {
    pos = {};
    for (const a of m.atoms) pos[a.id] = a.at.xyz;
    for (const c of m.ctx) pos[c.id] = c.at.xyz;
    get = (r) => pos[r];
  }
  const ctx = contextAtoms(m, A, pos);
  const ids = m.atoms.map((a) => a.id);
  const heavyIds = ids.filter((id) => m.atoms.find((a) => a.id === id).el !== 'H');
  const absent = new Set(m.absent || []);
  const sitePts = ids.filter((id) => !absent.has(id)).map((id) => pos[id]);
  const bodyAtoms = m.pdb ? A.filter((q) => !q.het && (m.bodyChains || [m.body]).includes(q.c) && q.e !== 'H' && q.e !== 'D') : [];
  const bodyC = bodyAtoms.length ? bodyAtoms.reduce((s, q) => add(s, q.p), [0, 0, 0]).map((v) => v / bodyAtoms.length) : null;
  const sc = sitePts.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / sitePts.length);
  const bodyDir = bodyC ? unit(sub(sc, bodyC)) : null;
  const heavy = m.atoms.filter((a) => !absent.has(a.id)).map((a) => pos[a.id]);
  const { R, c } = m.pdb ? chooseView(heavy, bodyDir) : { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], c: sc };
  const frame = (p) => { const d = sub(p, c); return [dot(R[0], d), dot(R[1], d), dot(R[2], d)].map((v) => +v.toFixed(3)); };

  // Reach: close in space, and not already joined through a short path of bonds.
  const contacts = [], protons = [], close = [];
  const path = graphDistance(m.bonds, ids);
  const others = (x, y) => heavyIds.filter((id) => id !== x && id !== y).map((id) => pos[id]);
  for (let i = 0; i < heavyIds.length; i++) for (let j = i + 1; j < heavyIds.length; j++) {
    const a = heavyIds[i], b = heavyIds[j], e = dist(pos[a], pos[b]), g = path(a, b);
    if (g < MIN_BOND_PATH && g > 0) close.push([a, b, g]);
    if (e <= (m.cut || REACH) && g >= MIN_BOND_PATH) contacts.push([a, b]);
    const barred = m.noHop?.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (e <= (m.cutH || HOP) && g >= MIN_PROTON_PATH && !barred && !blocked(pos[a], pos[b], others(a, b))) protons.push([a, b]);
  }
  // A stated exception, disclosed on screen by the chapter that uses it.
  for (const [a, b] of m.hops || []) protons.push([a, b]);
  for (const a of m.atoms) if (a.hc) for (const id of heavyIds) if (dist(pos[a.id], pos[id]) <= HYDRIDE && path(a.id, id) >= MIN_BOND_PATH) contacts.push([a.id, id]);

  // Context bonds by distance, drawn as dim sticks.
  const ctxShown = ctx.filter((q) => !q.skip);
  const everyone = [...ctx.map((q) => q), ...m.atoms.filter((a) => a.at?.pdb && !a.metal).map((a) => ({ p: pos[a.id], id: a.id }))];
  const ctxBonds = [];
  const seen = new Set();
  for (let i = 0; i < everyone.length; i++) for (let j = i + 1; j < everyone.length; j++) {
    const a = everyone[i], b = everyone[j];
    if (a.id && b.id) continue;
    if (a.skip && b.id) continue;
    if (b.skip && a.id) continue;
    if (a.skip && b.skip) continue;
    const e = dist(a.p, b.p);
    if (e < 1.95 && e > 0.8) {
      const k = `${i}_${j}`; if (seen.has(k)) continue; seen.add(k);
      ctxBonds.push([a.p, b.p]);
    }
  }
  for (const q of ctx) if (q.link) ctxBonds.push([q.p, pos[q.link]]);

  const labels = {};
  for (const a of m.atoms) if (a.res) (labels[a.res] ??= []).push(pos[a.id]);
  for (const [name, ref] of Object.entries(m.marks || {})) labels[name] = [get(ref)];
  const threads = (m.threads || []).map(([a, b]) => {
    const pa = get(a), pb = get(b);
    return { a: ids.includes(a) ? a : frame(pa), b: ids.includes(b) ? b : frame(pb), d: +dist(pa, pb).toFixed(2) };
  });

  const extra = {};
  if (m.key === 'rnase') {
    const u = unit(sub(pos.O2, pos.P)), v = unit(sub(pos.O5, pos.P));
    extra.inline = +(Math.acos(dot(u, v)) * 180 / Math.PI).toFixed(0);
    console.log('  RNase in-line angle O2′–V–apical O', extra.inline, '°; O2–O5 proton hop blocked:', !protons.some(([a, b]) => (a === 'O2' && b === 'O5') || (a === 'O5' && b === 'O2')));
  }
  if (m.key === 'lysozyme') {
    extra.oiGlu = +dist(pos.Oi, pos.EO2).toFixed(1);
    console.log('  Lysozyme: Oi to Glu35 OE1', extra.oiGlu, 'Å, a disclosed exception; O5–C1–Oi before relax', (Math.acos(dot(unit(sub(pos.O5, pos.C1)), unit(sub(pos.Oi, pos.C1)))) * 180 / Math.PI).toFixed(0), '°');
  }
  if (m.key === 'subtilisin') extra.axis = [frame(get('E:64:CB')), frame(get('E:64:CG'))];
  if (m.key === 'aat') {
    const ring = [get('A:411:C2'), get('A:411:C4'), get('A:411:C6')];
    const nrm = unit(cross(sub(ring[1], ring[0]), sub(ring[2], ring[0])));
    const rel = (ref) => { const d = sub(ref, get('A:411:CA')); return [dot(R[0], d), dot(R[1], d), dot(R[2], d)]; };
    const tilt = (v) => +(Math.acos(Math.abs(dot(unit(v), nrm))) * 180 / Math.PI).toFixed(1);
    const planeN = unit(cross(sub(get('A:411:C4'), get('A:411:C4A')), sub(get('A:411:N'), get('A:411:C4A'))));
    extra.dun = {
      twist: +(Math.acos(Math.abs(dot(planeN, nrm))) * 180 / Math.PI).toFixed(1),
      ca: frame(get('A:411:CA')), n: frame(get('A:411:N')), normal: [dot(R[0], nrm), dot(R[1], nrm), dot(R[2], nrm)],
      h: rel(pos.Ha), c: rel(get('A:411:C')), cb: rel(get('A:411:CB')),
      crystal: { h: tilt(sub(pos.Ha, get('A:411:CA'))), c: tilt(sub(get('A:411:C'), get('A:411:CA'))), cb: tilt(sub(get('A:411:CB'), get('A:411:CA'))) },
    };
    console.log('  1ARG angle from ring normal, H/COO/CB:', JSON.stringify(extra.dun.crystal));
  }
  if (m.key === 'tim') {
    const closed = A.filter((q) => q.c === 'A' && q.n === 'CA' && !q.het);
    const open = load('1YPI').filter((q) => q.c === 'A' && q.n === 'CA' && !q.het);
    const core = closed.filter((q) => (q.s < 160 || q.s > 182) && open.some((o) => o.s === q.s));
    const fit = superpose(core.map((q) => open.find((o) => o.s === q.s).p), core.map((q) => q.p));
    const trace = (list, map) => list.filter((q) => q.s >= 164 && q.s <= 178).map((q) => frame(map ? map(q.p) : q.p));
    extra.loop = { closed: trace(closed), open: trace(open, fit) };
    const moved = closed.filter((q) => q.s >= 164 && q.s <= 178).map((q) => { const o = open.find((x) => x.s === q.s); return { s: q.s, r: q.r, d: dist(q.p, fit(o.p)) }; }).sort((a, b) => b.d - a.d)[0];
    console.log('  TIM loop moves most at', moved.r, moved.s, moved.d.toFixed(1), 'Å between 7TIM and 1YPI');
  }
  if (m.key === 'adh') {
    // Which hydrogen is pro-R, from the coordinates: O > CH3 > H. Looking with HS away, O→CH3→HR... tested by a triple product.
    const c = pos.Ca, v = (a) => sub(a, c), tp = dot(cross(v(pos.Oa), v(get('A:378:C1'))), v(pos.HR));
    console.log('  ADH: H near C4N is HR?', 'HR-C4', dist(pos.HR, pos.C4).toFixed(2), 'HS-C4', dist(pos.HS, pos.C4).toFixed(2), 'triple', tp.toFixed(2));
    extra.hydride = [+dist(pos.HR, pos.C4).toFixed(2), +dist(pos.HS, pos.C4).toFixed(2)];
  }
  SITES[m.key] = {
    ...extra,
    pos: Object.fromEntries(ids.map((id) => [id, frame(pos[id])])),
    contacts, protons, close,
    ctx: ctxShown.map((q) => ({ el: q.el, p: frame(q.p), res: q.res })),
    ctxBonds: ctxBonds.map(([p, q]) => [frame(p), frame(q)]),
    threads,
    labels: Object.fromEntries(Object.entries(labels).map(([k, l]) => [k, frame(l.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / l.length))])),
    pdb: m.pdb || null,
  };
  if (m.pdb && process.env.BODIES !== '0') {
    const atomsF = bodyAtoms.map((q) => ({ p: frame(q.p) }));
    const S = surface(atomsF);
    BODIES[m.key] = packBody(S);
    report.push(`${m.key}: ${S.P.length} verts, ${S.T.length / 3} tris`);
  }
  const hx = m.atoms.map((a) => frame(pos[a.id]));
  const w = Math.max(...hx.map((p) => p[0])) - Math.min(...hx.map((p) => p[0])), h = Math.max(...hx.map((p) => p[1])) - Math.min(...hx.map((p) => p[1]));
  console.log(m.key.padEnd(11), `atoms ${ids.length}`, `reach ${contacts.length}`, `hop ${protons.length}`, `extent ${w.toFixed(1)}x${h.toFixed(1)} Å`);
}

writeFileSync(join(root, 'src/data/sites.json'), JSON.stringify(SITES));
if (process.env.BODIES !== '0') writeFileSync(join(root, 'src/data/bodies.json'), JSON.stringify(BODIES));
console.log(report.join('\n'));
