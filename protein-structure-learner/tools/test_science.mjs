// Tests for the pure science code. Run: node tools/test_science.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { dssp, q3, hbEnergy, placeHydrogens, Q1Q2F, torsions } from '../src/science/dssp.js';
import { sasa, buried } from '../src/science/sasa.js';
import { VOLUME, packing, coupling, HELIX_COST, sideContacts, packingAngles, median, SHAPE } from '../src/science/packing.js';
import { makeFolder, superpose } from '../src/science/rigidfold.js';
import { coulomb, debyeLength } from '../src/science/electro.js';
import { components, orderOf, sizeOfPiece, identityOf, powersOf, rotationOf } from '../src/science/symmetry.js';
import { candidates, surfaceNonpolar, planarity, ruleMean } from '../src/science/patch.js';
import { CHAPTERS } from '../src/stages.js';
import { buildModel, computeForces, energyOf, step, holdStill, holdTurn, boardFrom, Watch, Advance, Pocket, HoleRead, HOLE_MIN, hbonds, oilAtoms, oilTouch, placeOf, saltNow, crowding, levelOf, termsOf, memoryOf, bondEnergy, atomLabel, rmsd, burial } from '../src/science/pull.js';

const raw = JSON.parse(readFileSync(new URL('../src/data/proteins.json', import.meta.url)));
const grabParams = JSON.parse(readFileSync(new URL('../src/data/grab-params.json', import.meta.url)));
const mdData = JSON.parse(readFileSync(new URL('../src/data/pull-md.json', import.meta.url)));
const published = JSON.parse(readFileSync(new URL('./nisthal-values.json', import.meta.url)));
const restTable = JSON.parse(readFileSync(new URL('../src/data/pull-rest.json', import.meta.url)));
const coords = (s) => {
  const b = Buffer.from(s, 'base64');
  return Float32Array.from(new Int16Array(b.buffer, b.byteOffset, b.length / 2), (v) => v / 100);
};
const u16 = (s) => {
  const b = Buffer.from(s, 'base64');
  return new Uint16Array(b.buffer, b.byteOffset, b.length / 2);
};
const load = (key) => {
  const p = raw.find((x) => x.key === key);
  return { ...p, n: p.seq.length, nXYZ: coords(p.n), caXYZ: coords(p.ca), cXYZ: coords(p.c), oXYZ: coords(p.o), atomXYZ: coords(p.atoms.xyz), atomRes: u16(p.atoms.res), atomSide: p.atoms.side, atomEl: p.atoms.el, freeArea: p.free ? new Uint8Array(Buffer.from(p.free, 'base64')) : null };
};
let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log('ok', name);
};
const ssOf = (p) => dssp(p);
const at = (p, no) => p.resno.indexOf(no);

test('energy formula: an ideal bond is near -3 kcal/mol, far groups near zero', () => {
  assert.ok(Math.abs(Q1Q2F - 27.888) < 1e-9);
  // Linear C=O...H-N with O...N 2.9 A.
  const bb = { nXYZ: Float32Array.of(0, 0, 0), cXYZ: Float32Array.of(0, 0, 4.13), oXYZ: Float32Array.of(0, 0, 2.9) };
  const h = Float32Array.of(0, 0, 1);
  const m = hbEnergy(bb, h, 0, 0);
  assert.ok(m.e < -2.5 && m.e > -4, `e=${m.e}`);
  bb.oXYZ = Float32Array.of(0, 0, 30);
  bb.cXYZ = Float32Array.of(0, 0, 31.23);
  assert.ok(Math.abs(hbEnergy(bb, h, 0, 0).e) < 0.1);
});

test('hydrogens sit 1 A from N and proline has none', () => {
  const p = load('myoglobin');
  const h = placeHydrogens(p);
  const i = at(p, 60);
  const d = Math.hypot(h[i * 3] - p.nXYZ[i * 3], h[i * 3 + 1] - p.nXYZ[i * 3 + 1], h[i * 3 + 2] - p.nXYZ[i * 3 + 2]);
  assert.ok(Math.abs(d - 1) < 1e-3);
  assert.ok(Number.isNaN(h[at(p, 100) * 3]), 'Pro 100 has no N-H');
});

test('myoglobin: the known helices are helical in DSSP', () => {
  const p = load('myoglobin');
  const { ss } = ssOf(p);
  const known = [['A', 5, 16], ['B', 21, 35], ['E', 59, 76], ['F', 86, 94], ['G', 101, 118], ['H', 125, 148]];
  for (const [name, a, b] of known) {
    for (let r = a; r <= b; r++) assert.equal(q3(ss[at(p, r)]), 'H', `helix ${name} residue ${r}: ${ss[at(p, r)]}`);
  }
  assert.ok(!ss.includes('E'), 'myoglobin has no strands');
});

test('myoglobin: i to i+4 is the commonest bond in a helix', () => {
  const p = load('myoglobin');
  const gaps = {};
  for (const h of ssOf(p).hbonds) gaps[h.d - h.a] = (gaps[h.d - h.a] ?? 0) + 1;
  assert.ok(gaps[4] > 3 * (gaps[3] ?? 0));
});

test('GFP: eleven strands round the barrel', () => {
  const p = load('gfp');
  const { ss, ladders } = ssOf(p);
  const runs = ss.match(/E{4,}/g) ?? [];
  assert.ok(runs.length >= 10 && runs.length <= 13, `found ${runs.length} strands`);
  assert.ok(ladders.filter((l) => l.pairs.length >= 3).length >= 10);
  for (const [a, b] of [[12, 21], [26, 35], [41, 47], [92, 99], [105, 115], [118, 127]]) {
    for (let r = a + 1; r < b; r++) assert.equal(q3(ss[at(p, r)]), 'E', `residue ${r}`);
  }
});

test('protein G: one antiparallel hairpin, and one parallel pair', () => {
  const p = load('gb1');
  const { ladders } = ssOf(p);
  assert.deepEqual(ladders.map((l) => l.type).sort(), ['A', 'A', 'P']);
});

test('agreement with the depositors records stays high', () => {
  for (const [k, min] of [['myoglobin', 0.85], ['gfp', 0.85], ['nanobody', 0.9], ['gb1', 0.85], ['ferritin', 0.9]]) {
    const p = load(k);
    const { ss } = ssOf(p);
    let same = 0;
    for (let i = 0; i < p.n; i++) if (q3(ss[i]) === q3(p.ss[i])) same++;
    assert.ok(same / p.n >= min, `${k} ${same / p.n}`);
  }
});

test('a real pi helix is found in YcaC, and only pi', () => {
  const p = load('pihelix');
  const { ss } = ssOf(p);
  assert.ok(/I{5}/.test(ss), ss);
});

test('angles alone do not make a helix: myoglobin 120-122 has alpha angles and no H', () => {
  const p = load('myoglobin');
  const { ss } = ssOf(p);
  const { phi, psi } = torsions(p);
  for (const r of [120, 121, 122]) {
    const i = at(p, r);
    assert.ok(phi[i] > -90 && phi[i] < -35 && psi[i] > -70 && psi[i] < -15, `${r}: ${phi[i]} ${psi[i]}`);
    assert.ok(!'HGI'.includes(ss[i]));
  }
});

test('SASA: one sphere and two touching spheres', () => {
  const r = 2;
  const one = sasa([0, 0, 0], [r], { points: 500, probe: 1.4 });
  assert.ok(Math.abs(one[0] - 4 * Math.PI * 3.4 ** 2) < 1e-6);
  const two = sasa([0, 0, 0, 3, 0, 0], [r, r], { points: 2000, probe: 1.4 });
  // Exact cap area for two spheres of radius 3.4, centres 3 apart.
  const exact = 4 * Math.PI * 3.4 ** 2 - 2 * Math.PI * 3.4 * (3.4 - 1.5);
  assert.ok(Math.abs(two[0] - exact) / exact < 0.01, `${two[0]} vs ${exact}`);
});

test('SASA: burial is symmetric in A and B', () => {
  const A = { xyz: [0, 0, 0], radii: [1.7] };
  const B = { xyz: [3, 0, 0], radii: [1.7] };
  const b = buried(A, B, { points: 200 });
  assert.ok(b.area > 0);
  // Equal in theory; the two spheres sample different dots, so allow one dot of error.
  assert.ok(Math.abs(b.freeA[0] - b.boundA[0] - (b.freeB[0] - b.boundB[0])) < 4);
});

test('interfaces: barnase-barstar and the hormone receptor match published sizes', () => {
  const bar = raw.find((x) => x.key === 'barnase').iface[0];
  assert.ok(bar.area > 1400 && bar.area < 1800, `${bar.area}`); // a standard-size interface
  const ghr = raw.find((x) => x.key === 'ghr').iface[0];
  assert.ok(ghr.area > 2200, `${ghr.area}`);
});

test('volumes: Zamyatnin values, in the expected order', () => {
  assert.equal(VOLUME.L, 166.7);
  assert.ok(VOLUME.A < VOLUME.V && VOLUME.V < VOLUME.L && VOLUME.L < VOLUME.F && VOLUME.F < VOLUME.W);
  assert.equal(HELIX_COST.A, 0);
  assert.equal(HELIX_COST.G, 1);
});

const coreSites = () => {
  const p = load('t4l');
  const nos = [78, 99, 111, 103, 153, 102, 121, 133, 138];
  const idx = nos.map((n) => at(p, n));
  const sites = idx.map((i) => ({ res: i, wt: p.seq[i], inHelix: true }));
  const links = new Map();
  for (const [k, v] of sideContacts(p, { within: new Set(idx) })) {
    const [a, b] = k.split(',').map(Number);
    links.set(`${idx.indexOf(a)},${idx.indexOf(b)}`, v);
  }
  return { nos, sites, c: coupling(sites, links), wt: sites.map((s) => s.wt) };
};

test('packing: the rule returns the natural core, and equal volume is not enough', () => {
  const { nos, sites, c, wt } = coreSites();
  assert.ok(packing(sites, c, wt).allFit);
  const swap = (o) => {
    const l = [...wt];
    for (const [k, v] of Object.entries(o)) l[nos.indexOf(+k)] = v;
    return packing(sites, c, l);
  };
  // Ile and Leu have the same volume, and must still not score as a fit: measured L99I is strained.
  assert.equal(VOLUME.I, VOLUME.L);
  assert.ok(!swap({ 99: 'I' }).allFit, 'L99I');
  assert.ok(!swap({ 78: 'L' }).allFit, 'I78L');
  assert.ok(!swap({ 99: 'V' }).allFit, 'L99V');
  assert.equal(Math.round(swap({ 99: 'I' }).total), 0);
  assert.ok(swap({ 99: 'I' }).foldKept, 'the fold rule still passes it');
  // Our rule calls F153L a gap. The lab says it is more stable than wild type: the game must show that as the punchline.
  assert.ok(!swap({ 153: 'L' }).allFit);
  assert.ok(!swap({ 111: 'F', 153: 'L' }).allFit, 'V111F with F153L is not a compensating pair');
  // The rule is built this way: inside the shape classes, the natural core is the only full fit.
  const T = 'AVLIMFW';
  const fits = [];
  const walk = (i, l) => {
    if (i === wt.length) {
      if (packing(sites, c, l).allFit) fits.push(l.join(''));
      return;
    }
    for (const a of T) {
      if (SHAPE[a] !== SHAPE[wt[i]]) continue;
      l[i] = a;
      walk(i + 1, l);
    }
  };
  walk(0, []);
  assert.deepEqual(fits, [wt.join('')]);
});

test('a contact search that never sees the native arrangement separates true from false', () => {
  const p = load('homeodomain');
  const d = dssp(p);
  const groups = [];
  for (const m of d.ss.matchAll(/H+/g)) if (m[0].length >= 3) groups.push([m.index, m.index + m[0].length - 1]);
  const piece = (i) => groups.findIndex(([a, b]) => i >= a && i <= b);
  const core = [];
  for (let i = 0; i < p.n; i++) if (piece(i) >= 0 && p.rsa[i] <= 45 && 'AVILMFWYC'.includes(p.seq[i])) core.push(i);
  const contact = sideContacts(p, { within: new Set(core) });
  const truth = [...contact.keys()].map((k) => k.split(',').map(Number)).filter(([a, b]) => piece(a) !== piece(b));
  const wrong = [];
  for (const a of core) for (const b of core) if (a < b && piece(a) !== piece(b) && !contact.has(`${a},${b}`)) wrong.push([a, b]);
  const tips = Float64Array.from(p.caXYZ);
  const n = new Array(p.n).fill(0);
  const sum = new Float64Array(p.n * 3);
  for (let a = 0; a < p.atomRes.length; a++) {
    if (p.atomSide[a] !== '1') continue;
    n[p.atomRes[a]]++;
    for (let k = 0; k < 3; k++) sum[p.atomRes[a] * 3 + k] += p.atomXYZ[a * 3 + k];
  }
  for (let r = 0; r < p.n; r++) if (n[r]) for (let k = 0; k < 3; k++) tips[r * 3 + k] = sum[r * 3 + k] / n[r];
  const F = makeFolder(p.caXYZ, tips, groups);
  // Many draws of pairs and seeds, so that the result does not hang on one random stream.
  let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const take = (list, k) => list.map((x) => [rnd(), x]).sort((u, v) => u[0] - v[0]).slice(0, k).map((x) => x[1]);
  const run = (list, k) => Array.from({ length: 40 }, (_, i) => superpose(F.coordsOf(F.solve(take(list, k), { seed: i * 37 + 5, restarts: 10, steps: 2400 }).state), F.nativeRigid).rmsd);
  const none = median(run([], 0));
  const yesRuns = run(truth, 8);
  const yes = median(yesRuns);
  const no = median(run(wrong, 8));
  const share = yesRuns.filter((v) => v < 5).length / yesRuns.length;
  console.log(`   none ${none.toFixed(1)}, 8 true ${yes.toFixed(1)} (under 5 A in ${Math.round(share * 100)}%), 8 false ${no.toFixed(1)} A`);
  assert.equal(truth.length, 9);
  assert.ok(yes < 5 && no > 6.5 && none > 9, 'true contacts must beat false ones by a wide margin');
  assert.ok(no - yes > 2.5);
  assert.ok(share > 0.5 && share < 0.9, 'the note says about two runs in three');
  // A kept solution stands unless it is beaten, so more clues cannot make the kept energy worse.
  const first = F.solve(truth.slice(0, 5), { seed: 3, restarts: 4, steps: 1200 });
  const again = F.solve(truth.slice(0, 5), { seed: 4, restarts: 1, steps: 200, keep: first.state });
  assert.ok(again.e <= first.e + 1e-9);
});

test('coiled coils: real packing angles follow Harbury, parallel and perpendicular swap', () => {
  const a = [9, 16, 23], d = [5, 12, 19, 26];
  const m = (k, n, pos) => median(packingAngles(load(k), n, pos).map((x) => x.angle));
  assert.ok(m('gcn4', a, 'a') < 40, 'dimer a parallel');
  assert.ok(m('gcn4', d, 'd') > 70, 'dimer d perpendicular');
  assert.ok(m('gcn4tet', a, 'a') > 70, 'tetramer a perpendicular');
  assert.ok(m('gcn4tet', d, 'd') < 40, 'tetramer d parallel');
  for (const [n, pos] of [[a, 'a'], [d, 'd']]) {
    const v = m('gcn4tri', n, pos);
    assert.ok(v > 40 && v < 70, `trimer ${pos} acute: ${v}`);
  }
});

test('symmetry: one contact gives a ring, two kinds close the shell', () => {
  const f = load('ferritin');
  const v = load('stnv');
  const op = (p, a) => p.faces.find((x) => x.area === a).op;
  const two = op(f, 1479), three = op(f, 689), four = op(f, 523);
  assert.deepEqual([two, three, four].map((g) => orderOf(f.sym, g)), [2, 3, 4]);
  assert.equal(sizeOfPiece(f.sym, [two]), 2);
  assert.equal(sizeOfPiece(f.sym, [three]), 3);
  assert.equal(sizeOfPiece(f.sym, [four]), 4);
  for (const pair of [[two, three], [two, four], [three, four]]) assert.equal(sizeOfPiece(f.sym, pair), 24);
  const five = op(v, 926), tw = op(v, 747), th = op(v, 697);
  assert.deepEqual([five, tw, th].map((g) => orderOf(v.sym, g)), [5, 2, 3]);
  assert.equal(sizeOfPiece(v.sym, [five]), 5);
  for (const pair of [[five, tw], [five, th], [tw, th]]) assert.equal(sizeOfPiece(v.sym, pair), 60);
  // The ring is a real five-fold, and the protease contact is its own inverse.
  const c = load('ctxb');
  assert.equal(powersOf(c.sym, c.faces[0].op).length, 5);
  assert.ok(Math.abs(rotationOf(c.sym[c.faces[0].op]).angle - 72) < 2);
  const pr = load('protease');
  assert.equal(orderOf(pr.sym, pr.faces[0].op), 2);
  assert.equal(new Set(components(pr.sym, [pr.faces[0].op])).size, 1);
  assert.equal(identityOf(pr.sym), 0);
});

test('patches: decoys avoid other sites, and no one property decides', () => {
  assert.ok(planarity(Float64Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0)) < 1e-6);
  const cases = [];
  for (const [key, chain, lostOf] of [['protease', null, (p) => p.faces[0].lost], ['hemoglobin', 0, (p) => p.iface[0].lostA], ['barnase', 1, (p) => p.iface[0].lostB], ['barnase', 0, (p) => p.iface[0].lostA], ['ghr', 0, (p) => p.iface[0].lostA]]) {
    const p = load(key);
    const atoms = [];
    for (let a = 0; a < p.atomRes.length; a++) if (chain === null || p.chain[p.atomRes[a]] === chain) atoms.push(a);
    const free = Float32Array.from(atoms, (a) => p.freeArea[a]);
    let other = null;
    if (key === 'hemoglobin') other = new Uint8Array(Buffer.from(p.iface[1].lostA, 'base64'));
    if (key === 'ghr') {
      const site = new Set(p.iface[0].secondSite);
      other = Uint8Array.from(atoms, (a) => (site.has(p.resno[p.atomRes[a]]) ? 1 : 0));
      assert.ok([116, 119, 120, 123].every((r) => site.has(r)), 'site 2 residues come from 3HHR');
    }
    const c = candidates(p, atoms, free, new Uint8Array(Buffer.from(lostOf(p), 'base64')), 3, other);
    assert.equal(c.list.length, 4);
    const sizes = c.list.map((x) => x.area);
    assert.ok(Math.max(...sizes) < Math.min(...sizes) * 1.25, `${key}: same size`);
    assert.ok(c.real.overlap > 0.5, `${key}: the real patch covers most of the interface (${c.real.overlap.toFixed(2)})`);
    assert.ok(c.pool.length >= 8, `${key}: decoy pool ${c.pool.length}`);
    assert.ok(c.pool.every((x) => x.overlap < 0.12 && x.elsewhere < 0.12));
    assert.ok(surfaceNonpolar(p, atoms, free) > 0.4);
    cases.push(c);
  }
  const means = [(x) => x.nonpolar, (x) => -x.flatness, (x) => x.stickOut].map((pick) => ruleMean(cases, pick, 1500));
  console.log(`   mean wins of 5 over random decoys: ${means.map((v) => v.toFixed(2)).join(', ')} (chance 1.25)`);
  assert.ok(means.every((v) => v < 3), 'no one property decides');
});

test('orientation: a short contact can fail the DSSP sum', () => {
  const at2 = (d, deg) => {
    const th = (deg * Math.PI) / 180;
    const bb = { nXYZ: Float32Array.of(d, 0, 0), cXYZ: Float32Array.of(-1.23, 0, 0), oXYZ: Float32Array.of(0, 0, 0) };
    return hbEnergy(bb, Float32Array.of(d - Math.cos(th), -Math.sin(th), 0), 0, 0).e;
  };
  assert.ok(at2(2.9, 0) < -2.5, 'the Line it up strong goal is reachable');
  const broke = [0, 15, 30, 45, 60, 75, 90].find((t) => at2(2.9, t) > -0.5);
  console.log(`   at 2.9 A the bond breaks by ${broke} degrees`);
  assert.ok(broke !== undefined && broke <= 90, 'tilting must break a short bond');
});

test('electrostatics: opposite charges attract and salt weakens them', () => {
  const pair = [{ q: 1, x: 0, y: 0, z: 0, chain: 0 }, { q: -1, x: 8, y: 0, z: 0, chain: 1 }];
  assert.ok(coulomb(pair, 0.01) < coulomb(pair, 0.5));
  assert.ok(coulomb(pair, 0.5) < 0);
  assert.ok(Math.abs(debyeLength(0.15) - 7.85) < 0.05);
});

// ---- The Pull stages. Each test here runs the same model and the same Watch as the board, with no browser. ----

const pullLoad = (key) => {
  const p = load(key);
  return { ...p, atoms: raw.find((x) => x.key === key).atoms };
};
const CAP = 45;
const STEPS = 12;
// The bonds a stage puts on its board, as the chapter builds them.
function boardOf(m, key) {
  step(m, 300);
  holdStill(m);
  return boardFrom(m, restTable[key], mdData[key].bonds);
}

// A pull as a player makes it: grip three residues, go out along a cone, let go, and read the board's own logic. The board always comes from the full
// model, so a control changes the physics and nothing about what is being asked.
function play(key, res, seed, { spread = 0.4, frames = 110, back = 480, need = 0, ...o } = {}) {
  const p = pullLoad(key);
  const m = buildModel(p, grabParams, { seed: seed * 2311 + 1, ...o });
  const board = boardOf(m, key);
  const w = new Watch(m, board.rest, board.known);
  for (let f = 0; f < 40; f++) {
    step(m, STEPS);
    holdStill(m);
    holdTurn(m, 0.1);
    if (f % 2 === 0) w.check(m.X, 0);
  }
  const ref = m.X.slice();
  const set = res.map((no) => p.resno.indexOf(no));
  const grp = [];
  m.atoms.forEach((a, i) => {
    if (set.includes(a.res) && ['N', 'CA', 'C', 'O', 'CB'].includes(a.name)) grp.push(i);
  });
  const cen = (l) => [0, 1, 2].map((k) => l.reduce((t, i) => t + m.X[i * 3 + k], 0) / l.length);
  const c = cen([...Array(m.N).keys()]);
  const g = cen(grp);
  let s = seed * 48271;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  const o0 = [0, 1, 2].map((k) => g[k] - c[k]);
  const L = Math.hypot(...o0);
  const d0 = o0.map((v) => v / L + spread * 2 * rnd());
  const l0 = Math.hypot(...d0);
  const dir = d0.map((v) => v / l0);
  m.pull = { atoms: grp, k: 6, cap: CAP, x: g[0], y: g[1], z: g[2] };
  const hit = [];
  const advance = new Advance();
  let peakForce = 0;
  let at = g;
  for (let f = 0; f < frames; f++) {
    const q = Math.min(1, f / 70);
    m.pull.x = g[0] + dir[0] * 16 * q;
    m.pull.y = g[1] + dir[1] * 16 * q;
    m.pull.z = g[2] + dir[2] * 16 * q;
    step(m, STEPS);
    holdStill(m);
    at = m.pull.at ?? g;
    peakForce = Math.max(peakForce, m.pull.force ?? 0);
    const hand = advance.update(Math.hypot(at[0] - g[0], at[1] - g[1], at[2] - g[2]), 1 / 60);
    if (f % 2 === 0) for (const e of w.check(m.X, hand)) {
      const b = e.bond;
      if (e.type !== 'snap' || !b.backbone || hit.includes(b)) continue;
      const a = b.d * 3;
      if ((m.X[a] - at[0]) ** 2 + (m.X[a + 1] - at[1]) ** 2 + (m.X[a + 2] - at[2]) ** 2 < 169) hit.push(b);
    }
    if (need && hit.length >= need) break;
  }
  const peakCa = rmsd(m.X, ref, m.ca);
  m.pull = null;
  let t = 0;
  for (; t < back; t++) {
    step(m, STEPS);
    holdStill(m);
    holdTurn(m, 0.1);
    if (t % 2 === 0) w.check(m.X, 0);
    if (t > 60 && hit.every((b) => b.on)) break;
  }
  return { m, p, hit, peakCa, peakForce, endCa: rmsd(m.X, ref, m.ca), back: hit.filter((b) => b.on).length, all: hit.length > 0 && hit.every((b) => b.on), moved: hit.filter((b) => !b.on && b.other !== null).length };
}
const meanOf = (l) => l.reduce((t, v) => t + v, 0) / l.length;

// F30 out along the line the MD pull took, as Squish plays it: the first 3 A at the finger's speed, the rest at one speed, one plain half-second read on arrival.
function pullRing(seed, o = {}, { stop = 8.5, finger = 40, pull = true } = {}) {
  const p = pullLoad('gb1');
  const res = p.resno.indexOf(30);
  const m = buildModel(p, grabParams, { seed: seed * 911 + 7, ...o });
  step(m, 300);
  holdStill(m);
  const pocket = new Pocket(m, res);
  const frame = () => {
    step(m, STEPS);
    holdStill(m);
    holdTurn(m, 0.1);
  };
  let restSum = 0, restN = 0;
  for (let f = 0; f < 160; f++) {
    frame();
    if (f % 4 === 0) {
      pocket.rest();
      restSum += pocket.read().all;
      restN++;
    }
  }
  const rest = restSum / restN;
  // The null: the same half-second mean, with no hand on the protein.
  if (!pull) {
    const hole = new HoleRead();
    for (let f = 0; !hole.reads.length || hole.reads.length < 8; f++) {
      frame();
      if (f >= 60 && f % 4 === 0) hole.add(pocket.read());
    }
    return { rest, read: hole.mean('all'), short: rest - hole.mean('all'), off: hole.mean('off') };
  }
  const h = pocket.home();
  const c = [0, 1, 2].map((k) => m.X.reduce((t, v, i) => (i % 3 === k ? t + v : t), 0) / m.N);
  const l = Math.hypot(h[0] - c[0], h[1] - c[1], h[2] - c[2]);
  const way = [0, 1, 2].map((k) => (h[k] - c[k]) / l);
  m.pull = { atoms: pocket.side, k: 6, cap: CAP, x: h[0], y: h[1], z: h[2] };
  const seen = [];
  const hole = new HoleRead();
  let s = 0;
  let done = false;
  for (let f = 0; f < 900 && !done; f++) {
    s = s < 3 ? Math.min(3, s + 3 / finger) : Math.min(stop, s + 0.2);
    const H = pocket.home();
    m.pull.x = H[0] + way[0] * s;
    m.pull.y = H[1] + way[1] * s;
    m.pull.z = H[2] + way[2] * s;
    step(m, STEPS);
    holdStill(m);
    if (f % 4 === 0) {
      const r = pocket.read();
      seen.push(r.off);
      if (seen.length > 8) seen.shift();
      if (meanOf(seen) >= 5) done = hole.add(r);
    }
  }
  const read = hole.mean('all');
  const later = [];
  for (let f = 0; f < 90; f++) {
    const H = pocket.home();
    m.pull.x = H[0] + way[0] * s;
    m.pull.y = H[1] + way[1] * s;
    m.pull.z = H[2] + way[2] * s;
    step(m, STEPS);
    holdStill(m);
    if (f >= 40 && f % 4 === 0) later.push(pocket.read().all);
  }
  m.pull = null;
  const off = [];
  let home = false;
  for (let f = 0; f < 540 && !home; f++) {
    frame();
    if (f % 4 === 0) {
      off.push(pocket.read().off);
      if (off.length > 8) off.shift();
      home = f > 60 && meanOf(off) < 1;
    }
  }
  return { rest, read, short: rest - read, parts: { carbon: hole.mean('carbon'), polar: hole.mean('polar') }, later: meanOf(later), home };
}

test('pull: forces match the energy for springs, torsions and memory', () => {
  const m = buildModel(pullLoad('gb1'), grabParams, { kT: 0, rama: 0, seed: 3 });
  step(m, 20);
  m.nN = 0;
  m.fN = 0;
  m.Ffar.fill(0);
  computeForces(m, false);
  const F = m.F.slice();
  const X = m.X;
  const h = 1e-4;
  let worst = 0;
  for (let t = 0; t < 200; t++) {
    const i = (t * 37 + 11) % (m.N * 3);
    const x = X[i];
    X[i] = x + h;
    const a = energyOf(m, X);
    X[i] = x - h;
    const b = energyOf(m, X);
    X[i] = x;
    worst = Math.max(worst, Math.abs(-(a - b) / (2 * h) - F[i]));
  }
  assert.ok(worst < 1e-3, `worst force error ${worst}`);
});

test('pull: side-chain torsions prefer staggered angles, by the right sign', () => {
  const m = buildModel(pullLoad('gb1'), grabParams, { seed: 3 });
  const threefold = [...m.TN].filter((n) => n === 3).length;
  assert.ok(threefold > 20);
  // Crystal side chains are staggered, so the threefold energy must sit low on the crystal, far below the eclipsed value.
  let e = 0;
  let top = 0;
  const X = m.X0;
  const atan = (a, b, c, d) => {
    const v = (p, q) => [0, 1, 2].map((k) => X[p + k] - X[q + k]);
    const c3 = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const f = v(a, b), g = v(b, c), h = v(d, c);
    const A = c3(f, g), B = c3(h, g);
    const gl = Math.hypot(...g);
    const cross = c3(B, A);
    return Math.atan2((cross[0] * g[0] + cross[1] * g[1] + cross[2] * g[2]) / gl, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]);
  };
  for (let n = 0; n < m.TA.length; n++) {
    if (m.TN[n] !== 3) continue;
    const chi = atan(m.TA[n], m.TB[n], m.TC[n], m.TD[n]);
    e += 0.5 * m.TV[n] * (1 + Math.cos(3 * chi));
    top += m.TV[n];
  }
  assert.ok(e < 0.25 * top, `torsion energy ${e.toFixed(1)} of ${top.toFixed(1)}`);
});

test('pull: at rest the model stays near the crystal and keeps its backbone bonds', () => {
  for (const [key, lo] of [['homeodomain', 24], ['gb1', 26]]) {
    const m = buildModel(pullLoad(key), grabParams, { seed: 9 });
    let ca = 0;
    let n = 0;
    const count = [];
    for (let f = 0; f < 300; f++) {
      step(m, STEPS);
      holdStill(m);
      holdTurn(m, 0.1);
      if (f > 100 && f % 10 === 0) {
        ca += rmsd(m.X, m.X0, m.ca);
        n++;
        count.push(hbonds(m).filter((k) => {
          const [d, a] = k.split('-').map(Number);
          return m.atoms[d].name === 'N' && m.atoms[a].name === 'O';
        }).length);
      }
    }
    console.log(`   ${key}: C-alpha ${(ca / n).toFixed(2)} A from the crystal, ${meanOf(count).toFixed(1)} backbone bonds`);
    assert.ok(ca / n < 1.2);
    assert.ok(meanOf(count) > lo);
  }
});

test('pull: charges tighten a bond by about 0.5 A, and the memory sets which atoms face each other', () => {
  const run = (o) => {
    const m = buildModel(pullLoad('gb1'), grabParams, { seed: 4, ...o });
    const board = boardOf(m, 'gb1');
    const w = new Watch(m, board.rest, board.known);
    const list = w.bonds.filter((b) => b.backbone);
    let sum = 0;
    let n = 0;
    for (let f = 0; f < 240; f++) {
      step(m, STEPS);
      holdStill(m);
      holdTurn(m, 0.1);
      if (f % 2 === 0) {
        w.check(m.X, 0);
        if (f > 40) for (const b of list) {
          sum += w.recent(b, 1).r;
          n++;
        }
      }
    }
    return { reach: sum / n, ca: rmsd(m.X, m.X0, m.ca) };
  };
  const on = run({});
  const off = run({ kappa: 1e6 });
  console.log(`   H...O ${on.reach.toFixed(2)} A with charges, ${off.reach.toFixed(2)} A without; C-alpha ${on.ca.toFixed(2)} and ${off.ca.toFixed(2)} A`);
  assert.ok(off.reach - on.reach > 0.3 && off.reach - on.reach < 0.8);
  assert.ok(off.ca < 1.5, 'the shape stays with charges off: the memory holds it');
});

test('pull: burial read from crowding follows real solvent accessibility', () => {
  const p = pullLoad('gb1');
  const m = buildModel(p, grabParams, { seed: 6 });
  step(m, 240);
  const seen = [];
  for (let r = 0; r < p.n; r++) if (p.seq[r] !== 'G') seen.push([p.rsa[r], burial(m, r)]);
  const low = seen.filter((v) => v[0] <= 6);
  const high = seen.filter((v) => v[0] >= 45);
  assert.ok(low.filter((v) => v[1]).length >= low.length - 2, 'residues under 6% are called buried');
  assert.ok(high.filter((v) => v[1]).length <= 1, 'residues over 45% are called in water');
});

test('pull: the return test measures a hydrogen bond, because it fails with charges off', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6];
  const sites = [['homeodomain', [52, 53, 54], 3], ['gb1', [15, 16, 17], 2]];
  for (const [key, res, need] of sites) {
    const row = (o) => {
      const R = SEEDS.map((s) => play(key, res, s, { need, ...o }));
      return { R, reached: R.filter((r) => r.hit.length >= need).length, all: R.filter((r) => r.all).length };
    };
    const full = row({});
    const noCharge = row({ kappa: 1e6 });
    const memoryOnly = row({ kappa: 1e6, solvent: 0, eps: 0 });
    const noWater = row({ solvent: 0 });
    console.log(`   ${key}: all back ${full.all}/6, charges off ${noCharge.all}/6, memory only ${memoryOnly.all}/6, EEF1 off ${noWater.all}/6 (snapped ${full.reached}, ${noCharge.reached}, ${memoryOnly.reached}, ${noWater.reached})`);
    assert.ok(full.reached === 6, 'the stage asks for these bonds');
    assert.ok(full.all >= 4, 'the full model brings them back');
    assert.ok(noCharge.all <= 1, 'with charges off the test fails');
    assert.ok(memoryOnly.all === 0, 'and on the memory alone');
    // EEF1 off passes, and the stage does not claim otherwise: water here is about burial, not about this return.
    assert.ok(noWater.all >= 4);
    assert.ok(Math.max(...full.R.map((r) => r.peakForce)) <= CAP + 1e-6, 'the cap holds');
  }
});

test('pull: a hand that has stopped scores nothing more, even with the protein stretched', () => {
  for (const [key, res] of [['homeodomain', 53], ['gb1', 16]]) {
    const p = pullLoad(key);
    const tally = { still: 0, nudged: [] };
    for (let s = 1; s <= 8; s++) {
      for (const reach of [0, 2.4]) {
        const m = buildModel(p, grabParams, { seed: (s * 2654435761 >>> 0) % 4e9 + 1 });
        const board = boardOf(m, key);
        const w = new Watch(m, board.rest, board.known);
        for (let f = 0; f < 40; f++) {
          step(m, STEPS);
          holdStill(m);
          if (f % 2 === 0) w.check(m.X, 0);
        }
        const r = p.resno.indexOf(res);
        const grp = [];
        m.atoms.forEach((a, i) => {
          if (Math.abs(a.res - r) <= 1 && ['N', 'CA', 'C', 'O', 'CB'].includes(a.name)) grp.push(i);
        });
        const cen = (l) => [0, 1, 2].map((k) => l.reduce((t, i) => t + m.X[i * 3 + k], 0) / l.length);
        const g = cen(grp), c = cen([...Array(m.N).keys()]);
        const o = [0, 1, 2].map((k) => g[k] - c[k]);
        const L = Math.hypot(...o);
        m.pull = { atoms: grp, k: 6, cap: CAP, x: g[0], y: g[1], z: g[2] };
        const advance = new Advance();
        const hit = new Set();
        for (let f = 0; f < 1800; f++) {
          const q = Math.min(1, f / 30);
          m.pull.x = g[0] + (o[0] / L) * reach * q;
          m.pull.y = g[1] + (o[1] / L) * reach * q;
          m.pull.z = g[2] + (o[2] / L) * reach * q;
          step(m, STEPS);
          holdStill(m);
          const at = m.pull.at ?? g;
          const hand = advance.update(Math.hypot(at[0] - g[0], at[1] - g[1], at[2] - g[2]), 1 / 60);
          if (f % 2 === 0) for (const e of w.check(m.X, hand)) if (e.type === 'snap' && e.bond.backbone && (m.X[e.bond.d * 3] - at[0]) ** 2 + (m.X[e.bond.d * 3 + 1] - at[1]) ** 2 + (m.X[e.bond.d * 3 + 2] - at[2]) ** 2 < 169) hit.add(e.bond);
        }
        if (reach) tally.nudged.push(hit.size);
        else tally.still += hit.size;
      }
    }
    console.log(`   ${key}: ${tally.still} snaps in 30 s of a finger that never moved; after a 2.4 A nudge, then 30 s still: ${tally.nudged.join(' ')}`);
    // Thermal wander of the grip can pass 1.5 A on its own now and then, so this is a rate, not a zero: a stage needs two or three snaps.
    assert.ok(tally.still <= 2, 'almost never, with a finger that never moved');
    assert.ok(Math.max(...tally.nudged) < 3, 'a nudge and a wait does not finish the stage');
  }
});

test('pull: the board keeps only bonds that hold at rest, and an acceptor visited at rest is not new', () => {
  const m = buildModel(pullLoad('homeodomain'), grabParams, { seed: 3 });
  const { rest, known } = boardOf(m, 'homeodomain');
  const of = (name) => m.atoms.findIndex((_, i) => atomLabel(m, i) === name);
  assert.ok(restTable.homeodomain['K55:N-N51:O'] < 0.6, 'K55 N sits on N51 O under 60% of a long resting run');
  assert.ok(!rest.has(`${of('K55:N')}-${of('N51:O')}`), 'so that bond is not on the board');
  assert.ok(known.has(`${of('K55:N')}-${of('K52:O')}`), 'and K52 O, which it visits at rest, is no new partner');
  for (const v of rest.values()) assert.ok(v >= 0.6);
  // At rest, left alone with every helix-end bond forced off, how many donors claim a new partner? This is the check that a new chip is news.
  const w = new Watch(m, rest, known);
  for (const b of w.bonds) {
    b.on = false;
    b.rest = 2;
  }
  for (let f = 0; f < 600; f++) {
    step(m, STEPS);
    holdStill(m);
    holdTurn(m, 0.1);
    if (f % 2 === 0) w.check(m.X, 0);
  }
  const lit = w.bonds.filter((b) => b.other !== null).length;
  console.log(`   ${rest.size} bonds on the board; ${lit} show a new partner after 10 s at rest with no pull`);
  assert.ok(lit <= 2);
});

test('pull: a broken donor on another acceptor shows as a new partner', () => {
  const R = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => play('homeodomain', [52, 53, 54], s, { need: 3, memory: 0, back: 300 }));
  const moved = R.reduce((t, r) => t + r.moved, 0);
  console.log(`   without the memory, ${moved} bonds on a new partner in 8 plays`);
  assert.ok(moved >= 1);
});

test('pull: the salt-bridge chip is live, so breaking the pair takes it away', () => {
  const p = pullLoad('homeodomain');
  const m = buildModel(p, grabParams, { seed: 8 });
  step(m, 300);
  holdStill(m);
  const r31 = p.resno.indexOf(31);
  assert.ok(saltNow(m, r31), 'held at rest');
  const X = m.X.slice();
  m.atoms.forEach((a, i) => {
    if (a.res === r31 && /^(NE|NH1|NH2)$/.test(a.name)) X[i * 3] += 30;
  });
  assert.ok(!saltNow(m, r31, X), 'and gone when the pair is apart');
});

test('pull: what paid for the pull. The memory pays most, and one named bond is worth about 2 kcal/mol', () => {
  const R = [1, 2, 3, 4, 5, 6].map((seed) => {
    const p = pullLoad('homeodomain');
    const m = buildModel(p, grabParams, { seed: seed * 2311 + 1 });
    const board = boardOf(m, 'homeodomain');
    const w = new Watch(m, board.rest, board.known);
    const worth = w.bonds.filter((b) => b.backbone).map((b) => bondEnergy(m, b));
    const rest = memoryOf(m);
    const atRest = termsOf(m);
    assert.ok(Math.abs(atRest.memory - rest) < 1e-9);
    const end = p.resno.indexOf(53);
    const grp = [];
    m.atoms.forEach((a, i) => {
      if (Math.abs(a.res - end) <= 1 && ['N', 'CA', 'C', 'O', 'CB'].includes(a.name)) grp.push(i);
    });
    const cen = (l) => [0, 1, 2].map((k) => l.reduce((t, i) => t + m.X[i * 3 + k], 0) / l.length);
    const g = cen(grp), c = cen([...Array(m.N).keys()]);
    const d = [0, 1, 2].map((k) => g[k] - c[k]);
    const L = Math.hypot(...d);
    m.pull = { atoms: grp, k: 6, cap: CAP, x: g[0], y: g[1], z: g[2] };
    for (let f = 0; f < 80; f++) {
      const q = Math.min(1, f / 60);
      m.pull.x = g[0] + (d[0] / L) * 14 * q;
      m.pull.y = g[1] + (d[1] / L) * 14 * q;
      m.pull.z = g[2] + (d[2] / L) * 14 * q;
      step(m, STEPS);
      holdStill(m);
    }
    return { memory: memoryOf(m) - rest, one: meanOf(worth) };
  });
  const memory = meanOf(R.map((r) => r.memory)), one = meanOf(R.map((r) => r.one));
  console.log(`   memory +${memory.toFixed(0)} kcal/mol in a pull; one bond ${one.toFixed(1)} kcal/mol at rest`);
  assert.ok(memory > 15, 'many times one bond');
  assert.ok(one < -1 && one > -3);
});

test('pull: the C-alpha trace needs the memory after a big pull and not after a small one, as the note says', () => {
  const big = (o) => [1, 2, 3, 4].map((s) => play('gb1', [15, 16, 17], s + 40, { frames: 200, spread: 0.2, back: 420, ...o }));
  const small = (o) => [1, 2, 3, 4].map((s) => play('gb1', [15, 16, 17], s + 40, { need: 2, back: 480, ...o }));
  const a = meanOf(big({}).map((r) => r.endCa));
  const b = meanOf(big({ memory: 0 }).map((r) => r.endCa));
  const c = meanOf(small({ memory: 0 }).map((r) => r.endCa));
  console.log(`   big pull, C-alpha after release ${a.toFixed(2)} A with memory, ${b.toFixed(2)} A without; small pull without it ${c.toFixed(2)} A`);
  assert.ok(b > a + 0.5);
  assert.ok(c < b - 0.3);
});

test('MD: an H-bond is straight and oil takes any angle, and that survives the controls', () => {
  for (const key of ['gb1', 'homeodomain']) {
    const s = mdData[key].angleStats;
    console.log(`   ${key}: N-H...O ${s.hbond.mean} sd ${s.hbond.sd}, uses ${s.hbond.share} of the sphere, ${s.hbondFromNull} nats from its steric null; X-C...C ${s.oil.mean} sd ${s.oil.sd}, uses ${s.oil.share}, ${s.oilFromNull} nats from its null`);
    assert.ok(Math.abs(s.hbond.mean - 154) < 3 && s.hbond.sd < 18);
    assert.ok(s.oil.mean > 108 && s.oil.mean < 124 && s.oil.sd > 22);
    assert.ok(s.oil.share > 3 * s.hbond.share, 'oil uses far more of the sphere');
    // Same procedure on both sides. Oil sits on what sterics allow, and an H-bond does not.
    assert.ok(s.oilFromNull < 0.2, 'oil looks like its steric null');
    assert.ok(s.hbondFromNull > 0.5, 'an H-bond does not');
    assert.ok(s.nullHbond.mean < s.hbond.mean - 15, 'sterics alone do not make it straight');
    // One crystal frame holds the same contrast, so this is geometry, not motion. The plot must not be read as dynamics.
    assert.ok(s.crystalOil.share > 2 * s.crystalHbond.share);
    // Breaking the pairing removes it on both sides.
    assert.ok(s.shuffledHbond.share > 0.9 && s.shuffledOil.share > 0.9);
    // The next-closest carbon pairs are flatter still, and an X along the chain does not change the answer.
    assert.ok(s.rank2.share >= s.oil.share && s.oilToCa.share > 2 * s.hbond.share);
  }
  const { ang, hb, oil } = mdData.gb1.angles;
  const near = (a) => ang.findIndex((x) => x >= a);
  assert.ok(hb[near(165)] > 3 * hb[near(140)], 'sharp towards 180 degrees');
  const band = oil.filter((_, i) => ang[i] >= 82 && ang[i] <= 142);
  assert.ok(Math.max(...band) < 1.5 * Math.min(...band), 'nearly flat from 82 to 142 degrees');
});

test('pull: burial levels and side-chain clues read the same across seeds', () => {
  const p = pullLoad('gb1');
  const m = buildModel(p, grabParams, { seed: 9 });
  step(m, 240);
  holdStill(m);
  const name = (r) => `${p.seq[r]}${p.resno[r]}`;
  const caps = [...p.seq].map((_, r) => name(r)).filter((n) => placeOf(mdData.gb1.ties, n).cap);
  assert.deepEqual(caps.sort(), ['D22', 'D46']);
  assert.ok(placeOf(mdData.gb1.ties, 'D47').salt, 'by residue pair');
  assert.ok(!placeOf(mdData.gb1.ties, 'D46').salt);
  assert.ok(!placeOf(mdData.gb1.ties, 'D47').cap);
  // The amine of M1 is charged in MD and tagged in the measured protein, so it counts for nothing.
  assert.equal(mdData.gb1.ties.E19.some((t) => t[0] === 'M1'), true);
  assert.equal(placeOf(mdData.gb1.ties, 'E19').hb, 1);
  assert.ok(oilAtoms(m).length > 40);
  assert.ok(oilTouch(m, p.resno.indexOf(30)) >= 3, 'F30 touches several oily residues');
  assert.equal(levelOf(60), 'Buried');
  assert.equal(levelOf(36), 'Half buried');
  assert.equal(levelOf(20), 'In water');
});

test('Squish: the pocket is counted, the hole is real, and F30 goes home', () => {
  const R = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => pullRing(s));
  const rest = meanOf(R.map((r) => r.rest)), read = meanOf(R.map((r) => r.read)), later = meanOf(R.map((r) => r.later));
  const carbon = meanOf(R.map((r) => r.parts.carbon)), polar = meanOf(R.map((r) => r.parts.polar));
  console.log(`   ${rest.toFixed(1)} atoms at rest, ${read.toFixed(1)} on arrival (carbon ${carbon.toFixed(1)}, N/O ${polar.toFixed(1)}), ${later.toFixed(1)} a second later; hole in ${R.filter((r) => r.short >= HOLE_MIN).length}/12, home in ${R.filter((r) => r.home).length}/12. Real water: 12.4, 9.5, carbon 7.3, N/O 2.2, and it stays there`);
  assert.ok(Math.abs(rest - 12.4) < 1.2, 'the resting pocket matches real water');
  assert.ok(read < rest - 1, 'fewer atoms than at rest, the sign real water gives');
  assert.ok(read > 9.5, 'but not as deep as real water, which is why the board says so');
  assert.ok(later > read + 0.5, 'and the game fills while real water does not, as the board says');
  assert.ok(Math.abs(carbon - 7.3) < 1.5);
  assert.ok(Math.abs(polar - 2.2) < 2);
  assert.ok(R.filter((r) => r.home).length >= 10);
});

test('Squish: the number on the board is not what the same statistic gives with no pull', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const pulled = seeds.map((s) => pullRing(s));
  const none = seeds.map((s) => pullRing(s, {}, { pull: false }));
  const a = meanOf(pulled.map((r) => r.short)), b = meanOf(none.map((r) => r.short));
  const pass = (l) => l.filter((r) => r.short >= HOLE_MIN).length;
  console.log(`   atoms short: ${a.toFixed(2)} pulled, ${b.toFixed(2)} with no pull; passes the rule ${pass(pulled)}/12 and ${pass(none)}/12`);
  assert.ok(a - b > 1);
  assert.ok(pass(pulled) >= 3 * Math.max(1, pass(none)), 'the pass rule tells them apart');
  assert.ok(pass(none) <= 3);
});

test('Squish: a fast finger and a slow one read the same hole', () => {
  const low = (finger) => meanOf([1, 2, 3, 4, 5, 6, 7, 8].map((s) => pullRing(s, {}, { finger }).read));
  const fast = low(12), slow = low(200);
  console.log(`   ${fast.toFixed(1)} atoms for a finger taking 0.2 s to the first 3 A, ${slow.toFixed(1)} for one taking 3.3 s`);
  assert.ok(Math.abs(fast - slow) < 1.5);
});

test('Squish: the result can fail. Without the memory F30 does not get home in time', () => {
  const off = [1, 2, 3, 4, 5, 6].map((s) => pullRing(s, { memory: 0 }));
  const home = off.filter((r) => r.home).length;
  console.log(`   no memory: home in ${home}/6`);
  assert.ok(home <= 2);
  const dry = [1, 2, 3, 4].map((s) => pullRing(s, { solvent: 0 }));
  console.log(`   EEF1 off: pocket ${meanOf(dry.map((r) => r.rest)).toFixed(1)} to ${meanOf(dry.map((r) => r.read)).toFixed(1)}, home ${dry.filter((r) => r.home).length}/4`);
});

// Reads a place as the board does. Letters are not part of this.
function boardReader(names) {
  const p = pullLoad('gb1');
  const crowd = new Float64Array(p.n), oil = new Float64Array(p.n);
  const seeds = [1, 2, 3, 4];
  for (const s of seeds) {
    const m = buildModel(p, grabParams, { seed: s * 311 + 5 });
    step(m, 180);
    holdStill(m);
    for (let i = 0; i < 10; i++) {
      step(m, 15);
      holdStill(m);
      for (let r = 0; r < p.n; r++) {
        crowd[r] += crowding(m, r) / (10 * seeds.length);
        oil[r] += oilTouch(m, r) / (10 * seeds.length);
      }
    }
  }
  const out = {};
  for (const n of names) {
    const r = p.resno.indexOf(+n.slice(1));
    const q = placeOf(mdData.gb1.ties, n);
    out[n] = (q.cap ? 300 : 0) + ({ Buried: 200, 'Half buried': 100, 'In water': 0 }[levelOf(crowd[r])]) + oil[r] + q.hb * 0.1;
  }
  return (n) => out[n];
}

// The chance of 4 right of 5 under a way of choosing, over every deal of rounds. Ties split evenly, as a guess would.
function passRate(stage, score) {
  const rounds = stage.rounds.map((r) => ({ trap: r.trap, names: r.set.map(([n]) => n.slice(0, -1)), best: r.set.reduce((a, b) => ((b[1] === null ? 99 : -b[1]) > (a[1] === null ? 99 : -a[1]) ? b : a))[0].slice(0, -1) }));
  const chance = (r) => {
    const top = Math.max(...r.names.map(score));
    const tied = r.names.filter((n) => Math.abs(score(n) - top) < 1e-9);
    return tied.includes(r.best) ? 1 / tied.length : 0;
  };
  const trap = rounds.filter((r) => r.trap), rest = rounds.filter((r) => !r.trap);
  let total = 0, n = 0;
  const walk = (i, hand) => {
    if (hand.length === stage.play - trap.length) {
      let dist = [1];
      for (const r of [...hand, ...trap]) {
        const c = chance(r);
        const next = new Array(dist.length + 1).fill(0);
        dist.forEach((q, j) => {
          next[j] += q * (1 - c);
          next[j + 1] += q * c;
        });
        dist = next;
      }
      total += dist.slice(stage.pass).reduce((a, b) => a + b, 0);
      n++;
      return;
    }
    for (let j = i; j < rest.length; j++) walk(j + 1, [...hand, rest[j]]);
  };
  walk(0, []);
  return total / n;
}

test('Read it: letters alone fall to chance, and reading the board passes', () => {
  const stage = CHAPTERS.flatMap((c) => c.stages).find((s) => s.id === 'read-lab');
  const names = [...new Set(stage.rounds.flatMap((r) => r.set.map(([n]) => n.slice(0, -1))))];
  const size = 'GASCPDTNVEQHLIKMFRYW';
  const hydro = { I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5, M: 1.9, A: 1.8, G: -0.4, T: -0.7, S: -0.8, W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5, Q: -3.5, D: -3.5, N: -3.5, K: -3.9, R: -4.5 };
  const rules = {
    guess: () => 0,
    'oil first': (n) => ('AVLIMFWYP'.includes(n[0]) ? 1 : 0),
    'biggest letter': (n) => size.indexOf(n[0]),
    'aromatic first': (n) => ('FWY'.includes(n[0]) ? 1 : 0),
    hydrophobicity: (n) => hydro[n[0]],
    'polar first': (n) => -hydro[n[0]],
  };
  const guess = passRate(stage, rules.guess);
  for (const [name, f] of Object.entries(rules)) {
    const r = passRate(stage, f);
    console.log(`   ${name}: ${(r * 100).toFixed(1)}%`);
    assert.ok(r < 3 * guess + 0.005, name);
  }
  // The best order of letters a player could learn from this very deck, found by search.
  const letters = [...new Set(names.map((n) => n[0]))];
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let best = 0;
  for (let t = 0; t < 30; t++) {
    const o = [...letters].sort(() => rnd() - 0.5);
    let cur = passRate(stage, (n) => -o.indexOf(n[0]));
    for (let i = 0; i < 120; i++) {
      const a = (rnd() * o.length) | 0, b = (rnd() * o.length) | 0;
      [o[a], o[b]] = [o[b], o[a]];
      const q = passRate(stage, (n) => -o.indexOf(n[0]));
      if (q >= cur) cur = q;
      else [o[a], o[b]] = [o[b], o[a]];
    }
    best = Math.max(best, cur);
  }
  console.log(`   the best letter order fitted to this deck: ${(best * 100).toFixed(1)}%`);
  assert.ok(best < 0.15);
  const reader = passRate(stage, boardReader(names));
  console.log(`   reading the board: ${(reader * 100).toFixed(1)}%`);
  // One round beats a careful reader by design, and others turn on a chip near its threshold, so this is high and not 100%.
  assert.ok(reader > 0.7);
  // Not a deck of answers and decoys that can simply be learned by name.
  const answers = stage.rounds.map((r) => r.set.reduce((a, b) => ((b[1] === null ? 99 : -b[1]) > (a[1] === null ? 99 : -a[1]) ? b : a))[0]);
  const decoys = stage.rounds.flatMap((r, i) => r.set.map(([n]) => n).filter((n) => n !== answers[i]));
  assert.ok(answers.some((n) => decoys.includes(n)), 'one residue is an answer in one round and a decoy in another');
  assert.ok(decoys.includes('T18A') && decoys.includes('T16A'), 'half-buried residues that cost nothing are decoys');
});

test('Read it: on random sets the board is good and not perfect, as the note says', () => {
  const names = Object.keys(published.ala).filter((n) => !n.startsWith('Y45') && !n.startsWith('W43'));
  const score = boardReader(names.map((n) => n.slice(0, -1)));
  const cost = (n) => (published.ala[n] === null ? 99 : -published.ala[n]);
  const r = (() => {
    let s = 11;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  })();
  const rules = { board: (n) => score(n.slice(0, -1)), letters: (n) => ('AVLIMFWYP'.includes(n[0]) ? 1 : 0) };
  const right = { board: 0, letters: 0 };
  let n = 0;
  while (n < 20000) {
    const set = new Set();
    while (set.size < 4) set.add(names[(r() * names.length) | 0]);
    const l = [...set].sort((a, b) => cost(b) - cost(a));
    if (cost(l[0]) - cost(l[1]) < 0.9) continue;
    n++;
    for (const k in rules) {
      const top = Math.max(...l.map(rules[k]));
      const tied = l.filter((x) => Math.abs(rules[k](x) - top) < 1e-9);
      if (tied.includes(l[0])) right[k] += 1 / tied.length;
    }
  }
  console.log(`   of ${n} random sets: the board picks right ${((right.board / n) * 100).toFixed(0)}%, oil letters ${((right.letters / n) * 100).toFixed(0)}%`);
  assert.ok(right.board / n > 0.75 && right.board / n < 0.95);
  assert.ok(right.letters / n > 0.55 && right.letters / n < 0.75);
});

test('pull: every measured number on screen is the published one, in the published sign', () => {
  const stage = CHAPTERS.flatMap((c) => c.stages).find((s) => s.id === 'read-lab');
  const stage2 = CHAPTERS.flatMap((c) => c.stages).find((s) => s.id === 'squish');
  // tools/nisthal-values.json is boiled down from the raw ProtaBank gwoS2haU3 export. A negative value loses stability.
  let checked = 0;
  for (const round of stage.rounds) for (const [name, v] of round.set) {
    assert.ok(name in published.ala, name);
    assert.equal(v, published.ala[name], name);
    checked++;
  }
  for (const [site, list] of stage2.swaps) for (const [aa, v] of list) {
    assert.equal(v, published[site.toLowerCase()][aa], site + aa);
    checked++;
  }
  console.log(`   ${checked} values match`);
  // The swap line on the sheet. A26 and alanine swaps are left out of the oil row: A26 holds no room, and Ala is a hole, not a swap.
  const near = (l) => l.filter(([, v]) => v > -1).length / l.length;
  const oil = published.core.oil.filter(([k]) => !k.startsWith('A26') && !k.endsWith('A'));
  assert.equal(oil.length, 45);
  assert.equal(published.core.polar.length, 100);
  assert.equal(Math.round(near(oil) * 100), 51);
  assert.equal(Math.round(near(published.core.polar) * 100), 11);
  assert.ok(stage2.oilLine.includes('51%') && stage2.oilLine.includes('11%'));
  // In each round one mutation stands clear of the rest, by more than the measurement scatter of about 0.2 kcal/mol.
  for (const round of stage.rounds) {
    const cost = round.set.map(([, v]) => (v === null ? 99 : -v)).sort((a, b) => b - a);
    assert.ok(cost[0] - cost[1] > 0.9, JSON.stringify(round));
  }
  assert.ok(stage.rounds.some((r) => r.trap));
  assert.ok(stage.rounds.length >= stage.play);
});

test('MD: the frozen comparison with real water still stands', () => {
  const frozen = JSON.parse(readFileSync(new URL('./md-results.json', import.meta.url)));
  for (const n of frozen.native) {
    assert.ok(n.md.core < 1.2, `${n.key}: the fold held in MD`);
    // The game against it. These numbers were produced by tools/compare_md.mjs and are stored, so that a change of model or data shows here.
    assert.ok(n.r.backbone > 0.85, `${n.key}: backbone occupancy r ${n.r.backbone}`);
    assert.ok(Math.abs(n.game.backbone - n.md.backbone) < 4, `${n.key}: backbone bonds ${n.game.backbone} against ${n.md.backbone}`);
  }
  assert.ok(frozen.pulls.length >= 6);
  const live = (key) => {
    const m = buildModel(pullLoad(key), grabParams, { seed: 11 });
    step(m, 600);
    const seen = new Map();
    let n = 0;
    for (let f = 0; f < 240; f++) {
      step(m, STEPS);
      holdStill(m);
      holdTurn(m, 0.1);
      if (f % 4 === 0) {
        n++;
        for (const k of hbonds(m)) {
          const [d, a] = k.split('-').map(Number);
          if (m.atoms[d].name === 'N' && m.atoms[a].name === 'O') seen.set(`${atomLabel(m, d)}-${atomLabel(m, a)}`, (seen.get(`${atomLabel(m, d)}-${atomLabel(m, a)}`) ?? 0) + 1);
        }
      }
    }
    return [seen, n];
  };
  // A short live run, so that the stored numbers cannot drift from the code.
  for (const key of ['homeodomain', 'gb1']) {
    const [seen, n] = live(key);
    const strong = Object.entries(mdData[key].bonds).filter(([k, v]) => /:N-.*:O$/.test(k) && v[0] > 0.9);
    const held = strong.filter(([k]) => (seen.get(k) ?? 0) / n > 0.5).length;
    console.log(`   ${key}: ${held} of the ${strong.length} backbone bonds held over 90% in MD are held in the game`);
    assert.ok(held / strong.length > 0.75);
  }
});

test('stages: old ids stay, new ids are new, and a save from before the Pull stages still reads', () => {
  const ids = CHAPTERS.flatMap((c) => c.stages.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
  const old = ['hinges', 'coil', 'pleat', 'hairpin', 'first-bond', 'tilt', 'gaps', 'loose-ends', 'ladders', 'same-angles', 'be-dssp', 'zipper', 'nanobody', 'reader', 'contacts', 'knobs', 'cavity', 'repack', 'buried', 'patch', 'score', 'hot-spots', 'steering', 'partner', 'two-faces', 'protease', 'toxin', 'ferritin-cage', 'virus'];
  for (const id of old) assert.ok(ids.includes(id), id);
  assert.equal(ids.length, 32);
  assert.deepEqual(ids.slice(ids.indexOf('snap'), ids.indexOf('contacts')), ['snap', 'squish', 'read-lab']);
});

console.log(`${count} tests passed`);
