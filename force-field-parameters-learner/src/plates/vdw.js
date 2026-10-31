// Part four: van der Waals. A liquid from two numbers, a chain that collapses, and the balance between protein and water.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Sticks, INK } from '../gfx.js';
import { INKS } from '../panel.js';
import { ArgonDrop } from '../physics/droplets.js';
import { chainStats, ChainMC, CHAIN_N } from '../physics/chain.js';
import { Grid, PROT_A, PROT_B, bPose, conf, rOf, NR, NA, N_CONF, KT, observables } from '../physics/dimer.js';

const TARGET = { rho: 1.40, dH: 1.54 }, N_AR = 600;
const DIMER = { sigma: 3.347, eps: 0.2846 };

export class Argon extends Plate {
  enter() {
    const r = this.root;
    this.d = new ArgonDrop(N_AR);
    this.d.sigma = DIMER.sigma; this.d.eps = DIMER.eps;
    this.atoms = new Atoms(N_AR, { detail: 3 });
    r.add(this.atoms);
    this.stage.frame(23);
    this.ui.note('600 live atoms at 87 K, using gas-pair numbers. <b>Tune σ and ε until the liquid is right: the OPLS recipe.</b>');
    this.ui.goals(['Density and heat of vaporization roughly right.', 'Closer: within 0.09 g/cm³ and 0.12 kcal/mol.', 'Within 0.05 g/cm³ and 0.06 kcal/mol, and stay there.']);
    this.L = this.ui.lights([['r', 'density'], ['h', 'heat of vap.'], ['l', 'liquid'], ['g', 'gas pair ε']]);
    this.rS = this.ui.ruler({ compact: true, label: 'Size σ', unit: 'Å', min: 2.8, max: 4.0, step: 0.002, value: this.d.sigma, digits: 3, major: 0.1, span: 3.2, onInput: v => { this.d.sigma = v; } });
    this.rE = this.ui.ruler({ compact: true, label: 'Depth ε', unit: 'kcal/mol', min: 0.08, max: 0.5, step: 0.001, value: this.d.eps, digits: 3, major: 0.05, span: 3.2, onInput: v => { this.d.eps = v; } });
    this.ui.sender(t => this.send(t));
    this.avg = null; this.warm = 0;
    this.sound.startWash();
    this.c1 = new THREE.Color();
  }
  update(dt) {
    const d = this.d;
    this.budget(3.5, 8, () => d.step(10, 87));
    this.stage.autoYaw += dt * 0.05;
    const m = d.measure(), k = 1 - Math.exp(-dt / 2.6);
    if (!this.avg) this.avg = { ...m }; else for (const key of ['density', 'dHvap', 'liquidFraction']) this.avg[key] += (m[key] - this.avg[key]) * k;
    const { x, coord } = d, a = this.atoms, R = d.sigma / 2 * 0.92;
    a.fog(this.stage.dist, -6, 46);
    const [ox, oy, oz] = d.center;
    this.offset ??= [ox, oy, oz];
    this.offset = this.offset.map((v, i) => v + (d.center[i] - v) * 0.04);
    for (let i = 0; i < N_AR; i++) {
      a.setAtom(i, x[3 * i] - this.offset[0], x[3 * i + 1] - this.offset[1], x[3 * i + 2] - this.offset[2], R);
      const n = Math.min(1, coord[i] / 11);
      this.c1.copy(INK.white).lerp(INK.blue, n);
      a.setColor(i, this.c1, n < 0.35 ? 0.5 : 0);
    }
    a.flush(true);
    const A = this.avg, dx = Math.abs(A.density - TARGET.rho), dy = Math.abs(A.dHvap - TARGET.dH), de = Math.abs(d.eps - DIMER.eps);
    this.L.r.set(`${A.density.toFixed(2)} <span class="ref">/ ${TARGET.rho.toFixed(2)}</span>`, dx <= 0.05 ? 2 : dx <= 0.15 ? 1 : 0);
    this.L.h.set(`${A.dHvap.toFixed(2)} <span class="ref">/ ${TARGET.dH.toFixed(2)}</span>`, dy <= 0.06 ? 2 : dy <= 0.22 ? 1 : 0);
    this.L.l.set(`${(A.liquidFraction * 100).toFixed(0)}%`, A.liquidFraction > 0.6 ? 2 : A.liquidFraction > 0.45 ? 1 : 0);
    this.L.g.set(`${d.eps.toFixed(3)} <span class="ref">/ ${DIMER.eps.toFixed(3)}</span>`, de <= 0.01 ? 2 : de <= 0.03 ? 1 : 0);
    const tier = dx <= 0.05 && dy <= 0.06 ? 3 : dx <= 0.09 && dy <= 0.12 ? 2 : dx <= 0.15 && dy <= 0.22 ? 1 : 0;
    this.warm += dt;
    this.ui.setTier(this.warm > 3 ? tier : 0);
    this.sound.setWash(0.6 + (1 - A.liquidFraction) * 1.6, 1500 + (1 - A.liquidFraction) * 3000);
    if (tier === 3 && !this.saidOk) { this.saidOk = true; this.ui.note('The liquid is right and the gas lamp went red. <b>A pair term is carrying many-body physics.</b>'); }
  }
  down(x, y) { if (y > this.stage.height - this.stage.insets.bottom) return false; this.stir(x, y); return true; }
  stir(x, y) {
    const p = this.stage.pointerToWorld(x, y, new THREE.Vector3(), new THREE.Vector3());
    const [ox, oy, oz] = this.offset ?? [0, 0, 0];
    this.d.tweezer = { x: p.x + ox, y: p.y + oy, z: p.z + oz, k: 0.09 };
  }
  move(x, y) { if (this.d.tweezer) this.stir(x, y); }
  up() { this.d.tweezer = null; }
  send(tier) {
    const { sigma: s, eps: e } = this.d;
    this.game.finish(this, tier, {
      comment: { 1: 'A liquid, of a sort. Not this one.', 2: 'Close to argon.', 3: 'Density and heat of vaporization both hit. That is how OPLS was built.' }[tier],
      lesson: `Your liquid numbers (σ = ${s.toFixed(3)}, ε = ${e.toFixed(3)}; published 3.405, 0.238) no longer fit the true pair (0.285). OPLS (Jorgensen et al., 1996) fitted nonbonded terms to liquid density and heat of vaporization for this reason: in a liquid, the crowd changes every pair, so the pair term has to absorb that effect.`,
      apply: ff => { ff.sigma = s; ff.eps = e; },
    });
  }
  solve() { this.d.sigma = 3.405; this.d.eps = 0.238; this.rS.set(3.405); this.rE.set(0.238); this.warm = 4; }
  exit() { this.sound.stopWash(); }
}

// The teaching target of the last three plates: a hidden parameter set, and the numbers it gives.
export const TRUTH = { E: 1.10, gamma: 1.25 };
const CT = chainStats(TRUTH.E, TRUTH.gamma);

// One lattice chain drawn as smooth beads.
class Strand {
  constructor(parent, color, cx) {
    this.mc = null; this.n = CHAIN_N; this.cx = cx;
    this.atoms = new Atoms(CHAIN_N, { detail: 3 });
    this.sticks = new Sticks(CHAIN_N - 1, { radius: 0.13, color });
    for (let i = 0; i < CHAIN_N; i++) this.atoms.setColor(i, color, i % 4 === 0 ? 0.25 : 0.05);
    this.atoms.flush(true);
    this.p = new Float64Array(3 * CHAIN_N);
    parent.add(this.sticks, this.atoms);
  }
  init(mc) { this.mc = mc; this.draw(1); }
  draw(u) {
    const { mc, p, n, atoms, sticks, cx } = this;
    let ax = 0, ay = 0, az = 0;
    for (let i = 0; i < n; i++) { ax += mc.x[i]; ay += mc.y[i]; az += mc.z[i]; }
    ax /= n; ay /= n; az /= n;
    for (let i = 0; i < n; i++) {
      p[3 * i] += (mc.x[i] - ax - p[3 * i]) * u; p[3 * i + 1] += (mc.y[i] - ay - p[3 * i + 1]) * u; p[3 * i + 2] += (mc.z[i] - az - p[3 * i + 2]) * u;
      atoms.setAtom(i, p[3 * i] + cx[0], p[3 * i + 1] + cx[1], p[3 * i + 2], 0.27);
      if (i) sticks.setStick(i - 1, p[3 * i - 3] + cx[0], p[3 * i - 2] + cx[1], p[3 * i - 1], p[3 * i] + cx[0], p[3 * i + 1] + cx[1], p[3 * i + 2]);
    }
    atoms.flush(); sticks.flush();
  }
}

export class Chain extends Plate {
  enter() {
    const r = this.root;
    this.gamma = 1;
    this.wide = innerWidth > innerHeight;
    const d = this.wide ? [3.4, 0] : [0, 2.6];
    this.idp = new Strand(r, INK.gold, [-d[0], d[1]]);
    this.fold = new Strand(r, INK.blue, [d[0], -d[1]]);
    this.mi = new ChainMC(false); this.mf = new ChainMC(true);
    this.idp.init(this.mi); this.fold.init(this.mf);
    this.stage.frame(this.wide ? 5.6 : 4.7);
    this.ui.tag('disordered chain', () => [-d[0], d[1] + 2.4, 0]).el.classList.add('gold');
    this.ui.tag('folded chain', () => [d[0], -d[1] + 2.2, 0]);
    this.ui.note(`This disordered chain is too collapsed. <b>Strengthen protein-water attraction.</b> Exact census of 21 billion conformations.`);
    this.ui.goals([`Rg within 0.35 Å of ${CT.rgIdp.toFixed(2)}.`, 'Within 0.1 Å. Watch the folded chain.', `Compromise: Rg 7.15 or more, folding ΔG −1.70 or better.`]);
    this.L = this.ui.lights([['r', 'chain Rg'], ['g', 'folding ΔG']]);
    this.rG = this.ui.ruler({ compact: true, label: 'Protein-water strength ×', min: 0.9, max: 1.5, step: 0.001, value: 1, digits: 3, major: 0.05, span: 3.5, onInput: v => { this.gamma = v; this.compute(); } });
    this.ui.sender(t => this.send(t));
    this.compute();
  }
  compute() {
    const s = this.s = chainStats(1, this.gamma);
    this.mi.setParams(1, this.gamma); this.mf.setParams(1, this.gamma);
    const dr = Math.abs(s.rgIdp - CT.rgIdp);
    this.L.r.set(`${s.rgIdp.toFixed(2)} <span class="ref">/ ${CT.rgIdp.toFixed(2)} Å</span>`, dr <= 0.1 ? 2 : dr <= 0.35 ? 1 : 0);
    const dg = s.dGFold - CT.dGFold;
    this.L.g.set(`${s.dGFold.toFixed(2)} <span class="ref">/ ${CT.dGFold.toFixed(2)}</span>`, dg <= 0.15 ? 2 : dg <= 0.46 ? 1 : 0);
    const tier = s.rgIdp >= 7.15 && s.dGFold <= -1.7 ? 3 : dr <= 0.1 ? 2 : dr <= 0.35 ? 1 : 0;
    this.ui.setTier(tier);
    if (tier === 3 && !this.said3) { this.said3 = true; this.ui.note('Both lamps amber: neither right, neither awful. <b>One knob can do no more.</b>'); }
    if (dr <= 0.1 && dg > 0.46 && !this.said) { this.said = true; this.ui.note('The disordered chain is right and the folded one is melting. <b>Same knob. Split the difference.</b>'); }
  }
  update(dt) {
    this.budget(3, 500, () => { this.mi.step(); this.mf.step(); });
    this.idp.draw(Math.min(1, dt * 7)); this.fold.draw(Math.min(1, dt * 7));
  }
  send(tier) {
    const g = this.gamma;
    this.game.finish(this, tier, {
      comment: { 1: 'It opened up. Not enough.', 2: 'The chain has the right size. The protein it belongs to has the wrong stability.', 3: 'A compromise, with both errors visible. One knob can do no more.' }[tier],
      lesson: `Stronger protein-water attraction swells a disordered chain and can cost folded stability. In this model the cost is large. Best et al. found folded proteins stayed reasonably stable at 1.10, though stronger changes such as TIP4P-D can destabilise them. Piana et al. (2015) raised water dispersion by about 50% in TIP4P-D. Yours is ${g.toFixed(2)}; this lattice chain is a teaching model, so the number does not transfer. Scaling one pair type also leaves the Lorentz-Berthelot rule behind.`,
      apply: ff => { ff.gamma = g; },
    });
  }
  solve(level) { this.gamma = level === 3 ? 1.095 : level === 2 ? 1.14 : 1.06; this.rG.set(this.gamma); this.compute(); }
}

const TYPE_COL = [INK.pale, INK.gold, INK.aqua, INK.O];
const BODY = 0x1b3f7a;

export class Pair extends Plate {
  enter() {
    const r = this.root;
    this.usePanel();
    this.E = 1; this.gamma = 1;
    this.grid = new Grid();
    this.ready = false;
    this.box = document.createElement('div'); this.box.className = 'progress';
    this.box.innerHTML = `Computing ${N_CONF.toLocaleString('en-US')} ways for two proteins to meet<i></i>`;
    document.getElementById('hud').append(this.box);
    this.group = new THREE.Group();
    r.add(this.group);
    const A = PROT_A.beads, B = PROT_B.beads;
    this.pa = new Atoms(A.length, { detail: 3 }); this.pb = new Atoms(B.length, { detail: 3 });
    A.forEach((b, i) => { this.pa.setAtom(i, b.x, b.y, 0, 2.2); this.pa.setColor(i, TYPE_COL[b.type], b.type ? 0.25 : 0); });
    B.forEach((b, i) => this.pb.setColor(i, TYPE_COL[b.type], b.type ? 0.25 : 0));
    this.pa.flush(true); this.pb.flush(true);
    const body = P => {
      const s = new THREE.Shape(P.beads.map(b => new THREE.Vector2(b.x, b.y)));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: BODY }));
      m.position.z = -1.2; this.group.add(m);
      return m;
    };
    body(PROT_A);
    this.bodyB = body(PROT_B);
    this.nw = PROT_A.shell.length + PROT_B.shell.length;
    this.water = new Atoms(this.nw, { detail: 2 });
    for (let i = 0; i < this.nw; i++) this.water.setColor(i, INK.aqua, 0.3);
    this.water.flush(true);
    this.group.add(this.pa, this.pb, this.water);
    this.stage.frame(23, [14, 0, 0]);
    this.ui.tag('A', () => [-1, 0, 2]);
    this.ui.tag('B', () => [this.x + 1, 0, 2]);
    this.ui.note('Water coats both proteins. Gold: the free energy of bringing B to A. <b>Balance protein-protein against protein-water.</b> Synthetic targets.');
    this.ui.goals(['Stop the sticking: Kd within a factor of 3.', 'Kd within 2, and B22 near its target.', 'All four lamps: complex, B22, chain size, folded stability.']);
    this.L = this.ui.lights([['k', 'Kd'], ['b', 'B22'], ['r', 'chain Rg'], ['g', 'fold ΔG']]);
    this.rE = this.ui.ruler({ compact: true, label: 'Protein-protein ×', min: 0.8, max: 1.3, step: 0.001, value: 1, digits: 3, major: 0.05, span: 2.5, onInput: v => { this.E = v; this.dirty = true; } });
    this.rG = this.ui.ruler({ compact: true, label: 'Protein-water ×', min: 0.8, max: 1.6, step: 0.001, value: 1, digits: 3, major: 0.05, span: 2.5, onInput: v => { this.gamma = v; this.dirty = true; } });
    this.ui.sender(t => this.send(t));
    this.ir = 12; this.x = rOf(12);
    this.F = new Float64Array(NR); this.Fref = null;
    this.placeB();
  }
  // Free energy of the aligned approach, summed over orientations near the native one.
  profile(out) {
    const { U } = this.grid;
    for (let ir = 0; ir < NR; ir++) {
      let z = 0;
      for (let ib = 15; ib <= 21; ib++) for (let ia = -2; ia <= 2; ia++) {
        const u = U[conf(ir, (ia + NA) % NA, ib)];
        if (u < 500) z += Math.exp(-u / KT);
      }
      out[ir] = z > 0 ? -KT * Math.log(z) : Infinity;
    }
    const far = out[NR - 1];
    for (let ir = 0; ir < NR; ir++) out[ir] -= far;
    return out;
  }
  compute() {
    const g = this.grid;
    g.combine({ q: 1, Epp: this.E, gamma: this.gamma, water: 1, fix: 0 });
    const o = this.o = observables(g), c = chainStats(this.E, this.gamma), T = this.T;
    const r = o.Kd / T.Kd, k = Math.max(r, 1 / r), db = Math.abs(o.b22 - T.b22), dr = Math.abs(c.rgIdp - CT.rgIdp), dg = Math.abs(c.dGFold - CT.dGFold);
    const fmt = v => (v < 1e-6 ? `${(v * 1e9).toFixed(0)} nM` : v < 1e-3 ? `${(v * 1e6).toFixed(1)} µM` : `${(v * 1e3).toFixed(1)} mM`);
    this.L.k.set(`${fmt(o.Kd)} <span class="ref">/ ${fmt(T.Kd)}</span>`, k <= 1.6 ? 2 : k <= 3 ? 1 : 0);
    this.L.b.set(`${o.b22.toFixed(2)} <span class="ref">/ ${T.b22.toFixed(2)}</span>`, db <= 0.2 ? 2 : db <= 0.6 ? 1 : 0);
    this.L.r.set(`${c.rgIdp.toFixed(2)} <span class="ref">/ ${CT.rgIdp.toFixed(2)}</span>`, dr <= 0.15 ? 2 : dr <= 0.35 ? 1 : 0);
    this.L.g.set(`${c.dGFold.toFixed(2)} <span class="ref">/ ${CT.dGFold.toFixed(2)}</span>`, dg <= 0.18 ? 2 : dg <= 0.46 ? 1 : 0);
    const tier = k <= 1.6 && db <= 0.2 && dr <= 0.15 && dg <= 0.18 ? 3 : k <= 2 && db <= 0.4 ? 2 : k <= 3 ? 1 : 0;
    this.ui.setTier(tier);
    if (o.b22 > 0 && !this.saidW) { this.saidW = true; this.ui.note('B22 went positive and the complex is falling apart. <b>Too much water.</b>'); }
    if (k <= 2 && dg > 0.46 && !this.saidF) { this.saidF = true; this.ui.note('The pair is right and the folded chain melted. <b>Raise protein-protein too.</b>'); }
    if (tier === 3 && !this.said3) { this.said3 = true; this.ui.note('Both strengths moved. <b>The ratio sets the complex, and the absolute scale sets folded stability.</b>'); }
    this.profile(this.F);
    this.logKd = Math.log10(r);
    this.redraw();
  }
  arrange(F) { return this.split(F, 0.46); }
  redraw() {
    const p = this.panel, c = p.begin();
    if (!p.rect.w || !this.Fref) return;
    const { x, y, w } = p.rect;
    // A balance you can read: too sticky on the left, falling apart on the right.
    const mid = x + w / 2, half = w / 2 - 44, u = Math.max(-1, Math.min(1, this.logKd / 2));
    p.text('sticks', x + 2, y + 7, { size: 12, color: u < -0.15 ? INKS.red : INKS.dim });
    p.text('falls apart', x + w - 2, y + 7, { size: 12, align: 'right', color: u > 0.15 ? INKS.red : INKS.dim });
    c.fillStyle = INKS.faint; c.fillRect(mid - half, y + 7, 2 * half, 1);
    c.fillStyle = INKS.white; c.fillRect(mid - 1, y + 2, 2, 11);
    p.dots([[mid + u * half, y + 7.5]], { color: INKS.gold, r: 5 });
    const R = p.rect, save = { ...R };
    p.rect = { x: R.x, y: R.y + 18, w: R.w, h: R.h - 18 };
    const lo = Math.min(-12, ...Array.from(this.F).filter(Number.isFinite));
    const { X, Y } = p.axes({ x0: 22, x1: 34, y0: Math.max(lo, -18), y1: 4, xlabel: 'distance between A and B (Å)', ylabel: 'kcal/mol', xticks: [24, 27, 30, 33], yticks: [-12, -6, 0] });
    p.rect = save;
    const line = (f, o) => { const pts = []; for (let i = 0; i < NR; i++) { const r = rOf(i); if (r >= 22 && r <= 34 && f[i] < 4) pts.push([X(r), Y(Math.max(lo, f[i]))]); } p.line(pts, o); };
    line(this.Fref, { color: INKS.white, width: 1.5, glow: 0 });
    line(this.F, {});
    p.dots([[X(this.x), Y(Math.max(lo, Math.min(4, this.F[this.ir])))]], { color: INKS.gold, r: 4.5 });
    p.text('contact', X(24), Y(1.6), { size: 12, color: INKS.dim, align: 'center' });
    p.text('one-water shoulder', X(26.6), Y(2.8), { size: 12, color: INKS.dim, align: 'center' });
  }
  placeB() {
    const { b, w } = bPose(this.x, 0, 180);
    for (let i = 0; i < PROT_B.beads.length; i++) this.pb.setAtom(i, b[2 * i], b[2 * i + 1], 0, 2.2);
    this.pb.flush();
    this.bodyB.position.set(this.x, 0, -1.2);
    this.bodyB.rotation.z = Math.PI;
    // A water stays only where the other protein leaves it room.
    const near = (sx, sy, list) => { let m = 1e9; for (let j = 0; j < list.length; j += 2) { const d = (sx - list[j]) ** 2 + (sy - list[j + 1]) ** 2; if (d < m) m = d; } return m; };
    const ax = this.ax ??= Float64Array.from(PROT_A.beads.flatMap(p => [p.x, p.y]));
    let n = 0;
    for (const s of PROT_A.shell) { const room = near(s.x, s.y, b) > 9.3; this.water.setAtom(n++, s.x, s.y, 0.4, room ? 1.3 : 0.001); }
    for (let i = 0; i < PROT_B.shell.length; i++) { const sx = w[2 * i], sy = w[2 * i + 1], room = near(sx, sy, ax) > 9.3; this.water.setAtom(n++, sx, sy, 0.4, room ? 1.3 : 0.001); }
    this.water.flush();
  }
  update(dt) {
    if (!this.ready) {
      const end = performance.now() + 12;
      while (!this.grid.done && performance.now() < end) this.grid.slice();
      this.box.querySelector('i').style.width = `${this.grid.next / NR * 100}%`;
      if (!this.grid.done) return;
      this.grid.label();
      this.grid.combine({ q: 1, Epp: TRUTH.E, gamma: TRUTH.gamma, water: 1, fix: 0 });
      this.T = observables(this.grid);
      this.Fref = this.profile(new Float64Array(NR));
      this.ready = true; this.box.remove(); this.dirty = true;
      this.sound.snap(2);
    }
    if (this.dirty) { this.compute(); this.dirty = false; }
    // A walker on the curve you just made: real Metropolis on that free energy, in and out.
    this.time += dt;
    if (this.time > 0.07) {
      this.time = 0;
      const d = Math.random() < 0.5 ? 1 : -1, j = this.ir + d;
      if (j >= 10 && j < 30) { const du = this.F[j] - this.F[this.ir]; if (du <= 0 || Math.random() < Math.exp(-du / KT)) this.ir = j; }
    }
    this.x += (rOf(this.ir) - this.x) * Math.min(1, dt * 8);
    this.placeB();
    this.redraw();
  }
  send(tier) {
    const { E, gamma } = this;
    this.game.finish(this, tier, {
      comment: { 1: 'They let go of each other, a little.', 2: 'The complex is right. Now look at the single chain.', 3: 'Complex, solution behaviour, chain size and stability: four tests, one balance.' }[tier],
      lesson: `Too little protein-water and everything sticks: Petrov & Zagrovic (2014) saw villin aggregate at concentrations where it is soluble. Too much, and real complexes fall apart. In this model the ratio of the two strengths sets the complex, and the absolute scale sets folded stability. Real fixes differ: Best et al. raised only protein-water and left protein-protein alone. DES-Amber (Piana et al., 2020) retuned this balance for complexes and still reports errors in binding free energies. Yours: protein-protein ×${E.toFixed(2)}, protein-water ×${gamma.toFixed(2)}. B22 here leaves out the native pose, so it measures nonspecific stickiness only.`,
      apply: ff => { ff.E = E; ff.gamma = gamma; },
    });
  }
  exit() { this.box?.remove(); }
  solve(level) {
    if (level === 2) { this.gamma = 1.17; this.E = 1.0; }
    else if (level === 3) { this.gamma = TRUTH.gamma; this.E = TRUTH.E; }
    else { this.gamma = 1.1; this.E = 1; }
    this.rG.set(this.gamma); this.rE.set(this.E); this.dirty = true;
  }
}
