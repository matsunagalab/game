// Part three: partial charges. A real least-squares fit, then the charge that cannot be right twice, then the salt bridge.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Sticks, Links, INK } from '../gfx.js';
import { save } from '../save.js';
import { INKS } from '../panel.js';
import { WaterDrop, dipoleDebye } from '../physics/droplets.js';
import { reference, CLASSES, NC, rrms, fit, netCharge, modelDipole, vdwOf, COUL, TARGET_DIPOLE, counts } from '../physics/esp.js';
import { curve, pmf, ka, osmotic, hydration, rAt, NP, RMIN_LB, NBFIX, PAIRS, KT } from '../physics/salt.js';

const RAD = { C: 0.42, H: 0.26, O: 0.4, N: 0.4 };
const COL = { C: INK.C, H: INK.H, O: INK.O, N: INK.N };

// The molecule's surface at 1.4 × vdW, stored with every atom class's potential, so a recolour is a weighted sum.
function espMesh(m, sites) {
  const g = new THREE.SphereGeometry(1, 72, 48), p = g.attributes.position, n = p.count;
  const a = new Float32Array(n * NC), ref = new Float32Array(n), attr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = [p.getX(i), p.getY(i), p.getZ(i)];
    let t = 0;
    for (const at of m.atoms) {
      const R = vdwOf(at) * 1.25, c = at.p, dc = d[0] * c[0] + d[1] * c[1] + d[2] * c[2], cc = c[0] ** 2 + c[1] ** 2 + c[2] ** 2, disc = dc * dc - (cc - R * R);
      if (disc >= 0) t = Math.max(t, dc + Math.sqrt(disc));
    }
    const P = [d[0] * t, d[1] * t, d[2] * t];
    p.setXYZ(i, P[0], P[1], P[2]);
    for (const at of m.atoms) a[i * NC + at.c] += COUL / Math.hypot(P[0] - at.p[0], P[1] - at.p[1], P[2] - at.p[2]);
    let V = 0;
    for (const s of sites) V += COUL * s.q / Math.hypot(P[0] - s.p[0], P[1] - s.p[1], P[2] - s.p[2]);
    ref[i] = V;
  }
  g.setAttribute('aR', new THREE.BufferAttribute(attr, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uNeg: { value: INK.O.clone() }, uPos: { value: INK.aqua.clone() } },
    vertexShader: `attribute float aR; varying float vE; varying vec3 vN, vV;
      void main(){ vE = aR; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uNeg, uPos; varying float vE; varying vec3 vN, vV;
      void main(){ float s = clamp(vE, -1., 1.); vec3 c = mix(vec3(.5,.62,.78), s<0. ? uNeg : uPos, pow(abs(s),.6));
      float f = 1.-max(dot(normalize(vN),normalize(vV)),0.); float rim = pow(f,2.2);
      gl_FragColor = vec4(c*(.8+rim*1.1), (.24+.5*pow(abs(s),.7))+rim*.3); }`,
  }));
  mesh.userData = { a, ref, attr, n };
  return mesh;
}

export class Esp extends Plate {
  enter() {
    const r = this.root;
    const R = reference(180), C = reference(0);
    this.m = R.m; this.pr = R.pr; this.cis = C.pr;
    this.q = new Array(NC).fill(0);
    this.sel = 3; this.solved = false; this.a = 0;
    this.group = new THREE.Group();
    r.add(this.group);
    const atoms = this.m.atoms;
    this.atoms = new Atoms(atoms.length, { detail: 4 });
    atoms.forEach((a, i) => { this.atoms.setAtom(i, ...a.p, RAD[a.el]); this.atoms.setColor(i, COL[a.el], 0.08); });
    const bonds = [];
    atoms.forEach((a, i) => atoms.forEach((b, j) => { if (j > i && Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) < (a.el === 'H' || b.el === 'H' ? 1.2 : 1.65)) bonds.push([a.p, b.p]); }));
    this.sticks = new Sticks(bonds.length, { radius: 0.09, color: INK.C });
    bonds.forEach((b, i) => this.sticks.setStick(i, ...b[0], ...b[1]));
    this.sticks.flush();
    this.surf = espMesh(this.m, R.sites);
    this.group.add(this.sticks, this.atoms, this.surf);
    this.group.rotation.x = -0.35;
    this.stage.frame(4.6);
    this.ui.note('The cloud is your error against a reference field (synthetic). <b>Tap an atom, slide its charge, fade the cloud.</b>');
    this.ui.goals(['By hand: field error under 0.30. That unlocks the solver.', 'Solve it: least squares, net charge zero.', 'Raise the restraint: both buried carbons within 0.45 e, field error at most 0.09.']);
    this.L = this.ui.lights([['e', 'field error'], ['d', 'dipole'], ['b', 'buried C'], ['c', 'cis form']]);
    this.rQ = this.ui.ruler({
      compact: true, label: 'O', unit: 'e', min: -1.2, max: 1.2, step: 0.001, value: 0, digits: 3, major: 0.2, span: 4,
      onInput: v => this.edit(v),
    });
    this.bSolve = this.ui.button('Solve: least squares', () => this.solveFit());
    this.bSolve.disabled = true; this.bSolve.style.opacity = 0.45;
    this.ui.sender(t => this.send(t));
    this.select(3);
    this.compute();
  }
  select(c) {
    this.sel = c;
    this.rQ.root.querySelector('.ruler-label').textContent = CLASSES[c].name;
    this.rQ.set(this.q[c]);
    this.m.atoms.forEach((a, i) => this.atoms.setColor(i, a.c === c ? INK.gold : COL[a.el], a.c === c ? 0.7 : 0.08));
    this.atoms.flush(true);
  }
  // Move one class. Every other atom shares the change, so the molecule stays neutral.
  edit(v) {
    const n = counts(), c = this.sel, d = v - this.q[c], rest = 12 - n[c];
    this.q[c] = v;
    for (let i = 0; i < NC; i++) if (i !== c) this.q[i] -= d * n[c] / rest;
    this.compute();
  }
  solveFit() {
    if (this.bSolve.disabled) return;
    this.solved = true;
    this.q = fit(this.pr, 0);
    this.e0 = rrms(this.pr, this.q);
    this.sound.snap(3);
    if (!this.rA) {
      this.rA = this.ui.ruler({
        compact: true, label: 'RESP restraint <i>a</i>', unit: 'au', min: 0, max: 0.012, step: 0.00005, value: 0, digits: 4, major: 0.002, span: 3,
        onInput: v => { this.a = v; this.q = fit(this.pr, v); this.rQ.set(this.q[this.sel]); this.compute(); },
      });
      this.ui.note(`A perfect fit, and a buried carbon at ${this.q[0].toFixed(2)} e! <b>The field cannot see it. Add the restraint.</b>`);
    }
    this.rQ.set(this.q[this.sel]);
    this.compute();
  }
  compute() {
    const q = this.q, e = rrms(this.pr, q), mu = modelDipole(this.m, q), bur = Math.max(Math.abs(q[0]), Math.abs(q[6])), cis = rrms(this.cis, q);
    this.e = e; this.bur = bur;
    this.L.e.set(e.toFixed(3), e <= 0.09 ? 2 : e <= 0.3 ? 1 : 0);
    this.L.d.set(`${mu.toFixed(2)} <span class="ref">/ ${TARGET_DIPOLE} D</span>`, Math.abs(mu - TARGET_DIPOLE) <= 0.2 ? 2 : Math.abs(mu - TARGET_DIPOLE) <= 0.6 ? 1 : 0);
    this.L.b.set(`${bur.toFixed(2)} e`, bur <= 0.45 ? 2 : bur <= 0.8 ? 1 : 0);
    this.L.c.set(cis.toFixed(3), cis <= 0.12 ? 2 : cis <= 0.35 ? 1 : 0);
    const tier = this.solved && e <= 0.09 && bur <= 0.45 ? 3 : this.solved && e <= 0.09 ? 2 : e <= 0.3 ? 1 : 0;
    if (e <= 0.32 && this.bSolve.disabled) { this.bSolve.disabled = false; this.bSolve.style.opacity = 1; }
    this.ui.setTier(tier);
    const { a, ref, attr, n } = this.surf.userData;
    for (let i = 0; i < n; i++) {
      let V = 0;
      for (let k = 0; k < NC; k++) V += q[k] * a[i * NC + k];
      attr[i] = (V - ref[i]) / 22;
    }
    this.surf.geometry.attributes.aR.needsUpdate = true;
  }
  update(dt) { if (!this.heldSpin) this.group.rotation.y += dt * 0.14; }
  down(x, y) {
    if (y > this.stage.height - this.stage.insets.bottom) return false;
    const v = new THREE.Vector3();
    let best = -1, bd = 44;
    this.group.updateMatrixWorld();
    this.m.atoms.forEach((a, i) => {
      const p = this.stage.project(v.set(...a.p).applyMatrix4(this.group.matrixWorld), v), d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { this.select(this.m.atoms[best].c); this.sound.tick(1.2); return true; }
    return false;
  }
  send(tier) {
    const q = this.q;
    this.game.finish(this, tier, {
      comment: { 1: `By hand, in a field of ${this.pr.n} points. Admirable. Now use the solver.`, 2: `Beautiful fit, and a buried carbon at ${q[0].toFixed(2)} e. I would not let that near a protein.`, 3: 'A little worse on the field, better behaved. That is the bargain RESP offers.' }[tier],
      lesson: `A partial charge is not an observable. It is a least-squares answer, and buried atoms are nearly invisible to the field, so a plain fit lets them wander. RESP (Bayly et al., 1993) restrains every non-hydrogen atom toward zero. Your <i>a</i> is ${this.a.toFixed(4)} au; their standard strengths are 0.0005 and 0.001. This synthetic field needs more, because its hidden methyl sites were built to show the effect: the fit error rose from ${this.e0.toFixed(3)} to ${rrms(this.pr, q).toFixed(3)}. Hydration free energy is the standard test of a charge set; the next plates show why one fit is never the whole story.`,
      apply: ff => { ff.q = q.slice(); ff.respA = this.a; },
    });
  }
  solve(level) {
    this.q = fit(this.pr, 0.012).map(v => v * 0.9);        // A scripted hand fit lands near the restrained answer.
    this.compute();
    if (level >= 2) this.solveFit();
    if (level >= 3) { this.rA.set(0.008); this.a = 0.008; this.q = fit(this.pr, 0.008); this.compute(); }
  }
}

const M = 90, COHESION = 9.2, MU_GAS = 1.855;     // 9.2 is a reference for this 90-water drop, not the bulk value

export class Liquid extends Plate {
  enter() {
    const r = this.root;
    this.d = new WaterDrop(M);
    this.d.qO = -0.659;
    this.atoms = new Atoms(3 * M, { detail: 3 });
    for (let i = 0; i < M; i++) { this.atoms.setColor(3 * i, INK.O); this.atoms.setColor(3 * i + 1, INK.H, 0.05); this.atoms.setColor(3 * i + 2, INK.H, 0.05); }
    this.atoms.flush(true);
    this.links = new Links(400, { color: INK.white, opacity: 0.9 });
    r.add(this.atoms, this.links);
    this.stage.frame(17);
    this.ui.note('Ninety waters at 27 °C, with the true gas charge. <b>It is boiling away. Change the charge.</b>');
    this.ui.goals(['Hold a drop together: cohesion within 3 kcal/mol of the droplet reference.', 'Within 1.5 kcal/mol.', 'Within 0.9, and look at what it did to your dipole.']);
    this.L = this.ui.lights([['g', 'gas dipole'], ['c', 'cohesion'], ['b', 'in the drop'], ['h', 'H-bonds']]);
    this.rQ = this.ui.ruler({
      compact: true, label: 'Charge on oxygen <i>q</i>₀', unit: 'e', min: -1.1, max: -0.4, step: 0.001, value: this.d.qO, digits: 3, major: 0.05, span: 3.2,
      onInput: v => { this.d.qO = v; }, onRelease: () => { this.squeeze = 3.5; },
    });
    this.ui.sender(t => this.send(t));
    this.avg = null; this.warm = 0; this.squeeze = 0; this.prev = new Set();
    this.off = [0, 0, 0]; this.pingT = 0; this.pn = 0;
    this.sound.startWash();
  }
  update(dt) {
    const d = this.d;
    this.squeeze = Math.max(0, this.squeeze - dt);
    d.wall += ((this.squeeze > 0 ? 11 : 24) - d.wall) * Math.min(1, dt * 1.5);
    this.budget(5.5, 10, () => d.step(2, 300));
    this.stage.autoYaw += dt * 0.06;
    const m = d.measure(), k = 1 - Math.exp(-dt / 2);
    if (!this.avg) this.avg = { ...m }; else for (const key of ['hbPerMol', 'cohesion', 'bound']) this.avg[key] += (m[key] - this.avg[key]) * k;
    this.off = this.off.map((v, i) => v + (m.center[i] - v) * 0.05);
    const [ox, oy, oz] = this.off, { x } = d, a = this.atoms;
    a.fog(this.stage.dist, -5, 34);
    for (let i = 0; i < M; i++) {
      const q = 9 * i;
      a.setAtom(3 * i, x[q] - ox, x[q + 1] - oy, x[q + 2] - oz, 1.05);
      a.setAtom(3 * i + 1, x[q + 3] - ox, x[q + 4] - oy, x[q + 5] - oz, 0.55);
      a.setAtom(3 * i + 2, x[q + 6] - ox, x[q + 7] - oy, x[q + 8] - oz, 0.55);
    }
    a.flush();
    const now = new Set();
    for (let i = 0; i < d.nHb && i < 400; i++) {
      const A = 9 * d.hb[2 * i], B = 9 * d.hb[2 * i + 1];
      this.links.set(i, x[A] - ox, x[A + 1] - oy, x[A + 2] - oz, x[B] - ox, x[B + 1] - oy, x[B + 2] - oz);
      now.add(A * 1000 + B);
    }
    this.links.show(d.nHb);
    this.pingT -= dt;
    if (this.pingT <= 0) for (const key of now) if (!this.prev.has(key)) { this.sound.ping(this.pn++, 0.05); this.pingT = 0.09; break; }
    this.prev = now;
    const A = this.avg, mu = dipoleDebye(d.qO), c = Math.abs(A.cohesion - COHESION), g = Math.abs(mu - MU_GAS);
    this.L.g.set(`${mu.toFixed(2)} <span class="ref">/ ${MU_GAS.toFixed(2)} D</span>`, g < 0.05 ? 2 : g < 0.2 ? 1 : 0);
    this.L.c.set(`${A.cohesion.toFixed(1)} <span class="ref">/ ${COHESION}</span>`, c <= 0.9 ? 2 : c <= 3 ? 1 : 0);
    this.L.b.set(`${(A.bound * 100).toFixed(0)}%`, A.bound >= 0.85 ? 2 : A.bound > 0.6 ? 1 : 0);
    this.L.h.set(A.hbPerMol.toFixed(2), A.hbPerMol > 2.2 ? 2 : A.hbPerMol > 1 ? 1 : 0);
    this.sound.setWash(0.5 + (1 - A.bound) * 1.5, 3000 - A.bound * 1400);
    this.warm += dt;
    const tier = this.warm < 4 || A.bound < 0.85 ? 0 : c <= 0.9 ? 3 : c <= 1.5 ? 2 : c <= 3 ? 1 : 0;
    this.ui.setTier(tier);
    if (tier === 3 && !this.saidOk) { this.saidOk = true; this.ui.note(`A real network, at ${mu.toFixed(2)} D. <b>The gas lamp stays red: one fixed charge cannot serve both.</b>`); }
  }
  down(x, y) { if (y > this.stage.height - this.stage.insets.bottom) return false; this.stir(x, y); return true; }
  stir(x, y) {
    const p = this.stage.pointerToWorld(x, y, new THREE.Vector3(), new THREE.Vector3());
    this.d.tweezer = { x: p.x + this.off[0], y: p.y + this.off[1], z: p.z + this.off[2], k: 0.5 };
  }
  move(x, y) { if (this.d.tweezer) this.stir(x, y); }
  up() { this.d.tweezer = null; }
  send(tier) {
    const q = this.d.qO, mu = dipoleDebye(q);
    this.game.finish(this, tier, {
      comment: { 1: 'It holds together. Barely.', 2: 'A respectable liquid.', 3: 'You made the molecule wrong on purpose, for the right reason. Welcome to the field.' }[tier],
      lesson: `You raised the dipole to ${mu.toFixed(2)} D, ${((mu / MU_GAS - 1) * 100).toFixed(0)}% over the gas value of 1.85 D. In a liquid, neighbours pull on each molecule’s electrons, and a fixed charge has to wear that polarization all the time. TIP3P does this: <i>q</i>₀ = −0.834, 2.35 D. Berendsen’s “missing term” (1987) is the price of that choice. A charge set that is right in gas is wrong in liquid, and the reverse. Polarizable models such as AMOEBA and Drude let the charge respond instead. Bulk liquid cohesion is about 9.9 kcal/mol; a 90-water drop reads lower, so the target here is a droplet reference.`,
      apply: ff => { ff.qWater = q; },
    });
  }
  solve() { this.d.qO = -0.834; this.rQ.set(-0.834); this.squeeze = 3; this.warm = 8; }
  exit() { this.sound.stopWash(); }
}

// Ka in M⁻¹. The Arg–Asp reference is experiment for guanidinium-acetate (Debiec et al. 2014). The Lys–Asp reference is invented.
const REF_ARG = ka(curve(1, NBFIX)), R_LYS = 3.59, REF_LYS = ka(curve(1, R_LYS, PAIRS.lys));
const off = (k, ref) => Math.max(k / ref, ref / k);
const F_T = 1.3;

export class Salt extends Plate {
  enter() {
    const r = this.root;
    this.usePanel();
    this.q = 1; this.rArg = RMIN_LB; this.rLys = RMIN_LB;
    this.x = 3.2; this.t = 0; this.side = [];
    // Guanidinium on the left, carboxylate on the right, drawn from their shapes.
    const gd = [[0, 0, 'C'], [-1.15, 0.67, 'N'], [-1.15, -0.67, 'N'], [1.0, 0, 'N']], cx = [[0, 0, 'C'], [-1.05, 0.62, 'O'], [-1.05, -0.62, 'O']];
    this.gd = gd; this.cx = cx;
    this.atoms = new Atoms(gd.length + cx.length, { detail: 4 });
    [...gd, ...cx].forEach((a, i) => this.atoms.setColor(i, a[2] === 'O' ? INK.O : a[2] === 'N' ? INK.N : INK.C, 0.1));
    this.atoms.flush(true);
    this.water = new Atoms(14, { detail: 3 });
    for (let i = 0; i < 14; i++) this.water.setColor(i, INK.aqua, 0.2);
    this.water.flush(true);
    r.add(this.atoms, this.water);
    this.stage.frame(5.8, [0, 0, 0]);
    this.ui.note('Stock Ka is 4 M⁻¹ (CHARMM27); experiment is 0.37. <b>Weaken the pair.</b> White: the reference curve, a teaching model.');
    this.ui.goals([`Bring Arg–Asp within a factor of ${F_T + 0.3} of ${REF_ARG.toFixed(2)} M⁻¹.`, `Within a factor of ${F_T}, with the osmotic coefficient right.`, 'All four lamps green at once. Scaling charges will not do it.']);
    this.L = this.ui.lights([['a', 'Arg–Asp'], ['l', 'Lys–Asp'], ['o', 'osmotic'], ['h', 'hydration']]);
    this.rK = this.ui.knobs([
      { tab: 'charge scale', label: 'All charges ×', min: 0.5, max: 1.1, step: 0.001, value: 1, digits: 3, major: 0.05, span: 3.5, onInput: v => { this.q = v; this.compute(); } },
      { tab: 'NBFIX Arg', label: 'Arg–Asp <i>R</i>min', unit: 'Å', min: 3.45, max: 3.8, step: 0.001, value: RMIN_LB, digits: 3, major: 0.05, span: 3.5, onInput: v => { this.rArg = v; this.compute(); } },
      { tab: 'NBFIX Lys', label: 'Lys–Asp <i>R</i>min', unit: 'Å', min: 3.45, max: 3.8, step: 0.001, value: RMIN_LB, digits: 3, major: 0.05, span: 3.5, onInput: v => { this.rLys = v; this.compute(); } },
    ]);
    this.ui.sender(t => this.send(t));
    this.compute();
  }
  compute() {
    this.wA = curve(this.q, this.rArg); this.wL = curve(this.q, this.rLys, PAIRS.lys);
    const kA = ka(this.wA), kL = ka(this.wL), oA = off(kA, REF_ARG), oL = off(kL, REF_LYS);
    const osm = osmotic(kA, 1), osmR = osmotic(REF_ARG, 1), hy = hydration(this.q) / hydration(1);
    this.kA = kA;
    this.L.a.set(`${kA.toFixed(2)} <span class="ref">/ ${REF_ARG.toFixed(2)}</span>`, oA <= F_T ? 2 : oA <= F_T + 0.3 ? 1 : 0);
    this.L.l.set(`${kL.toFixed(2)} <span class="ref">/ ${REF_LYS.toFixed(2)}</span>`, oL <= F_T ? 2 : oL <= F_T + 0.3 ? 1 : 0);
    this.L.o.set(`${osm.toFixed(3)} <span class="ref">/ ${osmR.toFixed(3)}</span>`, Math.abs(osm - osmR) <= 0.03 ? 2 : Math.abs(osm - osmR) <= 0.06 ? 1 : 0);
    this.L.h.set(`${(hy * 100).toFixed(0)}% <span class="ref">/ 100</span>`, Math.abs(hy - 1) <= 0.03 ? 2 : Math.abs(hy - 1) <= 0.1 ? 1 : 0);
    const oOk = Math.abs(osm - osmR) <= 0.03;
    const tier = oA <= F_T && oOk && oL <= F_T && Math.abs(hy - 1) <= 0.03 ? 3 : oA <= F_T && oOk ? 2 : oA <= F_T + 0.3 ? 1 : 0;
    this.ui.setTier(tier);
    if (oA <= F_T + 0.3 && Math.abs(hy - 1) > 0.1 && !this.said) {
      this.said = true;
      this.ui.note('Arg is fixed, and every ion lost its hydration. <b>Put the charges back. Open NBFIX.</b>');
    }
    if (Math.abs(this.q - 1) < 0.02 && oA <= F_T + 0.3 && oL > F_T && !this.said2) {
      this.said2 = true;
      this.ui.note('You overrode the combining rule for one pair. <b>Now Lys–Asp needs its own number.</b>');
    }
    if (this.entered) this.redraw();
  }
  arrange(F) { return this.split(F, 0.6); }
  redraw() {
    const p = this.panel, c = p.begin();
    if (!p.rect.w) return;
    const { X, Y } = p.axes({ x0: 2.6, x1: 10, y0: -4, y1: 3, xlabel: 'distance between the groups (Å)', ylabel: 'kcal/mol', xticks: [4, 6, 8, 10], yticks: [-3, 0, 3] });
    const path = (w, o) => {
      const pts = [];
      for (let i = 0; i < NP; i++) { const r = rAt(i), v = w[i]; if (r >= 2.6 && r <= 10 && v < 3) pts.push([X(r), Y(v)]); }
      p.line(pts, o);
    };
    const ref = this.ref ??= curve(1, NBFIX), refL = this.refL ??= curve(1, R_LYS, PAIRS.lys);
    path(ref, { color: INKS.white, width: 1.5, glow: 0 });
    path(refL, { color: INKS.faint, width: 1.2, glow: 0 });
    path(this.wL, { color: 'rgba(240,187,69,.45)', width: 1.4, glow: 0 });
    path(this.wA, {});
    p.dots([[X(this.x), Y(pmf(this.x, this.q, this.rArg))]], { color: INKS.gold, r: 4.5 });
    p.text('contact', X(3.2), Y(2.3), { color: INKS.dim, size: 12 });
    p.text('one water between', X(5.3), Y(1.5), { color: INKS.dim, size: 12 });
  }
  // Real Brownian motion on the player's own curve.
  update(dt) {
    const D = 5, h = 0.005;
    for (let i = 0; i < 16; i++) {
      const e = 0.01, g = (pmf(this.x + e, this.q, this.rArg) - pmf(this.x - e, this.q, this.rArg)) / (2 * e);
      // Drift from the curve, plus 2D/r so that the walker samples r² e^(−W/kT), the same measure as Ka.
      this.x += (-D * g / KT + 2 * D / this.x) * h + Math.sqrt(2 * D * h) * (Math.random() + Math.random() + Math.random() - 1.5) * 2;
      this.x = Math.max(2.4, Math.min(11, this.x));
    }
    this.show = (this.show ?? this.x) + (this.x - (this.show ?? this.x)) * Math.min(1, dt * 16);
    this.t += dt;
    const S = 0.42, xl = -this.show * S / 2, xr = this.show * S / 2, a = this.atoms;
    this.gd.forEach((g, i) => a.setAtom(i, xl - 1.0 * S + g[0] * -S, g[1] * S * 1.1, 0, g[2] === 'C' ? 0.3 : 0.36));
    this.cx.forEach((g, i) => a.setAtom(this.gd.length + i, xr + 0.7 * S + g[0] * -S * -1 * -1, g[1] * S * 1.1, 0, g[2] === 'C' ? 0.3 : 0.36));
    a.flush();
    // Water fills whatever gap the distance allows.
    const gap = this.show, w = this.water, n = gap > 7 ? 4 : gap > 5 ? 2 : 0;
    for (let i = 0; i < 14; i++) {
      const u = i * 1.7 + this.t * 0.6;
      if (i < n) w.setAtom(i, (i % 2 ? 0.5 : -0.5) * (gap > 7 ? 0.7 : 0) + 0.05 * Math.sin(u), (i < 2 ? 0.34 : -0.34) * (i % 2 ? 1 : -1) * (n === 2 ? 1 : 1.2), 0.1 * Math.cos(u), 0.27);
      else {
        const t = (i - n) / (14 - n) * 6.283 + this.t * 0.08;
        w.setAtom(i, Math.cos(t) * (gap * 0.28 + 1.5), Math.sin(t) * 1.4, 0.15 * Math.sin(u), 0.24);
      }
    }
    w.flush();
    this.redraw();
  }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'Weaker, but look at what paid for it.', 2: 'Arg behaves. Lys has filed a complaint.', 3: 'Charges untouched, two pairs corrected. Now imagine doing this for every pair.' }[tier],
      lesson: 'Fixed-charge force fields overbind salt bridges (Debiec et al., 2014: guanidinium-acetate 0.37 M⁻¹ in experiment, 4.06 in CHARMM27, 1.31 in CHARMM22*). Piana et al. (2011) found this pair about ten times too strong in CHARMM22. CHARMM22* reduced side-chain charges; CHARMM36m used NBFIX, moving this pair from the combining-rule 3.55 Å to 3.637 Å. Scaling all charges here is the blunt version. CUFIX (Yoo & Aksimentiev) calibrates pairs against osmotic pressure. This curve is a teaching model: its stock is set to CHARMM27’s value, and a fitted lever makes the NBFIX shift reach experiment.',
      apply: ff => { ff.qSalt = this.q; ff.rArg = this.rArg; ff.rLys = this.rLys; },
    });
  }
  solve(level) {
    if (level === 1) { this.q = 0.62; this.rK[0].set(this.q); }
    if (level >= 2) { this.rArg = NBFIX; this.rK[1].set(this.rArg); }
    if (level >= 3) { this.rLys = R_LYS; this.rK[2].set(this.rLys); }
    this.compute();
  }
}
