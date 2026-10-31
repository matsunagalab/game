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

const raw = JSON.parse(readFileSync(new URL('../src/data/proteins.json', import.meta.url)));
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

console.log(`${count} tests passed`);
