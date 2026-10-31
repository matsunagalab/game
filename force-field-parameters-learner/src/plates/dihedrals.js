// Part one: the dihedral term. A curve fit with organ stops, then the helix-coil balance of a real peptide.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Curve, Dots, Sticks, INK, ring } from '../gfx.js';
import { save } from '../save.js';
import { INKS } from '../panel.js';
import { Ribbon } from './ribbon.js';
import { backbone } from '../physics/peptide.js';
import { DEG, fourier, reference, oneFour, rmse, fit, QM_V } from '../physics/torsion.js';
import { LR, N_AAQAA, weight, rowFraction, PSI_GAIN, RT, profile, sampleSequence } from '../physics/helix.js';

const lw = w => w * Math.min(devicePixelRatio, 2);
const A0 = Math.PI / 2;      // the front methyl points up
const BASE = 2.6, GAIN = 0.42;
const polar = (r, a, z = 0) => [r * Math.cos(a), r * Math.sin(a), z];

// All-atom butane drawn from one angle, looking down the C2–C3 bond.
class Butane {
  constructor(parent) {
    this.atoms = new Atoms(14, { detail: 5 });
    this.sticks = new Sticks(13, { radius: 0.085, color: INK.C });
    for (let i = 0; i < 4; i++) this.atoms.setColor(i, INK.C);
    for (let i = 4; i < 14; i++) this.atoms.setColor(i, INK.H, 0.08);
    this.atoms.flush(true);
    parent.add(this.sticks, this.atoms);
    this.c4 = [0, 0, 0];
  }
  set(phi) {
    const a = this.atoms, s = this.sticks, z = 0.77, ra = 1.42, ax = 0.57, rh = 1.02, azh = 0.36;
    const a4 = A0 - phi;
    const C1 = polar(ra, A0, z + ax), C2 = [0, 0, z], C3 = [0, 0, -z], C4 = polar(ra, a4, -z - ax);
    const P = [C1, C2, C3, C4];
    P.forEach((p, i) => a.setAtom(i, ...p, 0.4));
    s.setStick(0, ...C1, ...C2); s.setStick(1, ...C2, ...C3); s.setStick(2, ...C3, ...C4);
    let n = 4, b = 3;
    const H = (p, parent) => { a.setAtom(n++, ...p, 0.2); s.setStick(b++, ...parent, ...p); };
    H(polar(rh, A0 + 2.094, z + azh), C2); H(polar(rh, A0 - 2.094, z + azh), C2);
    H(polar(rh, a4 + 2.094, -z - azh), C3); H(polar(rh, a4 - 2.094, -z - azh), C3);
    for (let k = 0; k < 3; k++) {
      const t = 2.094 * k + 1.05;
      const dir = (ang, zz, parentP) => { const c = Math.cos(ang), sn = Math.sin(ang); return [parentP[0] + c * 0.32 - sn * 0.9 * Math.cos(t), parentP[1] + sn * 0.32 + c * 0.9 * Math.cos(t), parentP[2] + zz + 0.9 * Math.sin(t)]; };
      H(dir(A0, 0.28, C1), C1); H(dir(a4, -0.28, C4), C4);
    }
    a.flush(); s.flush();
    this.c4 = C4;
  }
}


const S14 = 0.5;                                     // OPLS scales 1–4 nonbonded terms by one half
const TOL = 0.15;                                    // reachable with a thumb; three stops can reach about 0.03

export class Organ extends Plate {
  enter() {
    const r = this.root;
    this.V = [0, 0, 0]; this.on14 = false; this.phi = Math.PI; this.w = 0; this.held = false;
    this.mol = new Butane(r);
    this.curve = new Curve({ color: INK.gold, width: lw(3), n: 180 });
    this.curve.position.z = -1.7;
    this.pts = [];
    for (let d = 0; d < 360; d += 20) this.pts.push(d * DEG);
    this.dots = new Dots(this.pts.length, 0.075);
    this.pts.forEach((p, i) => this.dots.place(i, ...polar(BASE + GAIN * reference(p), A0 - p, -1.7)));
    this.dots.flush();
    const base = ring(BASE, 90, 0.06, INK.white, 0.3);
    base.position.z = -1.7;
    r.add(base, this.curve, this.dots);
    this.ball = new Atoms(1, { detail: 4 });
    this.ball.setColor(0, INK.gold, 0.9); this.ball.flush(true);
    r.add(this.ball);
    this.stage.frame(4.75);
    this.ui.note('White dots: butane’s twist energy, from OPLS-UA (a teaching stand-in for a quantum scan). <b>Pull the stops until gold covers white.</b>');
    this.ui.goals(['Get the error under 0.8 kcal/mol.', 'Get it under 0.15: the curve lands on the dots.', 'Switch on 1–4 nonbonded, then refit under 0.15.']);
    const stop = (label, i) => ({ label, min: -6, max: 6, value: 0, onInput: v => { this.V[i] = v; this.draw(); this.sound.setOrgan(this.V, [0, Math.PI, 0]); } });
    this.sV = this.ui.stops([stop('<i>n</i> = 1', 0), stop('<i>n</i> = 2', 1), stop('<i>n</i> = 3', 2)]);
    this.L = this.ui.lights([['e', 'error'], ['b', 'syn barrier']]);
    this.b14 = this.ui.button('1–4 nonbonded: off', () => this.toggle());
    this.ui.sender(t => this.send(t));
    this.sound.startOrgan();
    this.ui.tag('anti', () => polar(BASE - 0.6, A0 - Math.PI, -1.7));
    this.ui.tag('syn', () => polar(BASE - 0.5, A0, -1.7));
    this.ui.tag('gauche', () => polar(BASE - 0.6, A0 - 60 * DEG, -1.7));
    this.draw();
  }
  toggle() {
    this.on14 = !this.on14;
    this.b14.textContent = `1–4 nonbonded: ${this.on14 ? 'on, scaled ½' : 'off'}`;
    this.b14.classList.toggle('on', this.on14);
    this.draw();
    if (this.on14 && !this.said) {
      this.said = true;
      this.ui.note('The end carbons already collide, so that wall now counts twice. <b>Refit what is left.</b>');
    }
  }
  total(p) { return fourier(this.V, p) + (this.on14 ? oneFour(p, S14) : 0); }
  draw() {
    this.curve.setFrom(t => { const p = t * Math.PI * 2; return polar(BASE + GAIN * Math.max(-3, Math.min(9, this.total(p))), A0 - p); });
    this.rmse = rmse(this.V, this.on14 ? S14 : 0);
    const e = this.rmse, on = this.on14;
    const tier = on ? (e <= TOL ? 3 : e <= 0.8 ? 1 : 0) : (e <= TOL ? 2 : e <= 0.8 ? 1 : 0);
    this.ui.setTier(Math.max(tier, 0));
    this.L.e.set(`${e.toFixed(2)} kcal/mol`, e <= TOL ? 2 : e <= 0.8 ? 1 : 0);
    const syn = this.total(0), s = Math.abs(syn - reference(0));
    this.L.b.set(`${syn.toFixed(1)} <span class="ref">/ ${reference(0).toFixed(1)}</span>`, s < 0.3 ? 2 : s < 1 ? 1 : 0);
  }
  dU(p) { const e = 1e-3; return (this.total(p + e) - this.total(p - e)) / (2 * e); }
  update(dt) {
    if (!this.held) for (let i = 0; i < 4; i++) {
      this.w += (-this.dU(this.phi) * 2.4 - this.w * 1.8) * dt / 4;
      this.phi += this.w * dt;
    }
    this.mol.set(this.phi);
    this.ball.setAtom(0, ...polar(BASE + GAIN * Math.max(-3, Math.min(9, this.total(this.phi))), A0 - this.phi, -1.7), 0.13);
    this.ball.flush();
  }
  angleAt(x, y) { const v = new THREE.Vector3(); const c = this.stage.project(v, v); return Math.atan2(-(y - c.y), x - c.x); }
  down(x, y) {
    if (y > this.stage.height - this.stage.insets.bottom) return false;
    this.held = true; this.grab = this.angleAt(x, y); this.w = 0;
    return true;
  }
  move(x, y) {
    if (!this.held) return;
    const a = this.angleAt(x, y);
    let d = a - this.grab;
    if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    this.grab = a; this.phi -= d;
  }
  up() { this.held = false; }
  send(tier) {
    const [a, b, c] = this.V;
    this.game.finish(this, tier, {
      comment: { 1: 'The right number of wells. That is all I can say.', 2: 'A clean fit, in a molecule with no 1–4 interactions. Such molecules do not exist.', 3: 'Refitted with the 1–4 term on. Now you know what a torsion really is.' }[tier],
      lesson: `<i>n</i> = 3 makes the staggered wells, <i>n</i> = 1 lifts syn over anti, and <i>n</i> = 2 trims gauche. Yours: ${a.toFixed(2)}, ${b.toFixed(2)}, ${c.toFixed(2)}; OPLS-UA has 1.41, −0.27, 3.15 (Jorgensen et al. 1984). A torsion is not a physical constant. It is whatever the nonbonded terms left unexplained, so changing a charge, a vdW radius or a 1–4 scale means refitting it. Force fields scale 1–4 terms differently, and CHARMM36m shows what happens when an old correction is kept after radii change. The chain is drawn with hydrogens, but these energies are united-atom.`,
      apply: ff => { ff.V = this.V.slice(); ff.on14 = this.on14; },
    });
  }
  solve(on14 = false) {
    if (on14 !== this.on14) this.toggle();
    const V = on14 ? fit(S14) : QM_V;
    V.forEach((v, i) => { this.V[i] = v; this.sV.items[i].set(v); });
    this.V = V.slice();
    this.draw();
  }
  exit() { this.sound.stopOrgan(); }
}

// Ac-(AAQAA)3-NH2. The target is the Lifson-Roig prediction from experimental helix-coil parameters
// (Rohl & Baldwin 1997, as tabulated by Best & Hummer 2009). The start is the ff99SB row of the same table.
const TS = [273, 283, 293, 303, 313, 323, 333, 343];
const target = T => rowFraction(LR.exp, T);
const F300 = target(300), START = rowFraction(LR.ff99SB, 300);
const HELIX = [-60, -45], COIL = [-75, 145];
const pct = v => (v * 100).toFixed(0);

export class Helix extends Plate {
  enter() {
    const r = this.root;
    this.usePanel();
    this.k = 0; this.s = 0;
    this.states = new Int8Array(N_AAQAA);
    this.ang = Array.from({ length: N_AAQAA }, (_, i) => [COIL[0] + 20 * Math.sin(i * 2.1), COIL[1] + 20 * Math.cos(i * 1.3)]);
    this.goal = this.ang.map(a => a.slice());
    this.ribbon = new Ribbon(N_AAQAA, { color: INK.gold, width: 1.3, thick: 0.22 });
    this.group = new THREE.Group();
    this.group.add(this.ribbon);
    r.add(this.group);
    this.stage.frame(13);
    this.ui.note(`White: ${pct(F300)}% helix at 300 K, predicted from experimental parameters. Your ff99SB gives ${pct(START)}%. <b>Add a tiny ψ torsion.</b>`);
    this.ui.goals([`Helix at 300 K within 4 points of ${pct(F300)}%.`, 'Within 1 point.', 'Match the whole melting curve: error under 2.5 points.']);
    this.L = this.ui.lights([['f', 'helix, 300 K'], ['n', 'per residue'], ['c', 'whole curve']]);
    this.rK = this.ui.ruler({
      compact: true, label: 'ψ torsion <i>k</i>', unit: 'kcal/mol', min: 0, max: 0.6, step: 0.001, value: 0, digits: 3, major: 0.1, span: 4,
      onInput: v => { this.k = v; this.compute(); },
    });
    this.rS = null;
    this.ui.sender(t => this.send(t));
    this.compute();
    this.resample();
  }
  // k lowers helix relative to coil. s trades enthalpy for entropy and leaves w at 300 K alone.
  shiftH() { return -PSI_GAIN * this.k - this.s; }
  shiftS() { return -this.s / 0.3; }
  fAt(T) { return rowFraction(LR.ff99SB, T, this.shiftH(), this.shiftS()); }
  compute() {
    const f = this.fAt(300), err = Math.abs(f - F300) * 100;
    let s = 0;
    for (const T of TS) s += (this.fAt(T) - target(T)) ** 2;
    this.curveErr = Math.sqrt(s / TS.length) * 100;
    const kt = PSI_GAIN * this.k / RT(300);
    this.L.f.set(`${(f * 100).toFixed(1)}% <span class="ref">/ ${(F300 * 100).toFixed(1)}</span>`, err <= 1 ? 2 : err <= 4 ? 1 : 0);
    this.L.n.set(`${kt.toFixed(2)} <i>kT</i>`, err <= 1 ? 2 : 1);
    this.L.c.set(`${this.curveErr.toFixed(1)} pts`, this.curveErr <= 2.5 ? 2 : this.curveErr <= 6 ? 1 : 0);
    const tier = this.curveErr <= 2.5 ? 3 : err <= 1 ? 2 : err <= 4 ? 1 : 0;
    this.ui.setTier(tier);
    if (tier >= 2 && !this.rS) {
      this.rS = this.ui.ruler({
        compact: true, label: 'Enthalpy for entropy (300 K stays put)', unit: 'kcal/mol', min: 0, max: 3, step: 0.002, value: this.s, digits: 2, major: 0.5, span: 3,
        onInput: v => { this.s = v; this.compute(); },
      });
      const more = rowFraction(LR.ff99SB, 300, this.shiftH() - PSI_GAIN * 0.1, this.shiftS());
      this.ui.note(`Only ${kt.toFixed(1)} <i>kT</i> per residue, and 0.1 more in <i>k</i> gives ${pct(more)}%. <b>But it barely melts: use the new knob.</b>`);
    }
    if (tier === 3 && !this.said3) {
      this.said3 = true;
      this.ui.note(`It fits, with Δ<i>H</i> ${(LR.ff99SB.w.dH + this.shiftH()).toFixed(2)} against the experimental ${LR.exp.w.dH}. <b>Two errors are cancelling: v is still ff99SB’s.</b>`);
    }
    this.params = profile(weight({ ...LR.ff99SB.w, dH: LR.ff99SB.w.dH + this.shiftH(), dS: LR.ff99SB.w.dS + this.shiftS() }, 300), weight(LR.ff99SB.v, 300), N_AAQAA);
    if (this.entered) this.redraw();
  }
  arrange(F) { return this.split(F, 0.56); }
  redraw() {
    const p = this.panel, c = p.begin();
    if (!p.rect.w) return;
    const { X, Y } = p.axes({ x0: 270, x1: 345, y0: 0, y1: 100, xlabel: 'temperature (K)', ylabel: 'helix (%)', xticks: [280, 300, 320, 340], yticks: [0, 50, 100] });
    p.dots(TS.map(T => [X(T), Y(target(T) * 100)]), { r: 3.4 });
    const pts = [];
    for (let T = 270; T <= 345; T += 3) pts.push([X(T), Y(this.fAt(T) * 100)]);
    p.line(pts);
    c.strokeStyle = INKS.faint; c.beginPath(); c.moveTo(X(300), Y(0)); c.lineTo(X(300), Y(100)); c.stroke();
  }
  // One exact sample of the ensemble: which residues are helical right now.
  resample() {
    const s = sampleSequence(this.params, N_AAQAA);
    for (let i = 0; i < N_AAQAA; i++) {
      const g = s[i] ? HELIX : COIL, n = s[i] ? 5 : 26;
      this.goal[i] = [g[0] + n * (Math.random() - 0.5) * 2, g[1] + n * (Math.random() - 0.5) * 2];
    }
  }
  update(dt) {
    this.time += dt;
    if (this.time > 0.9) { this.time = 0; this.resample(); }
    const u = Math.min(1, dt * 3.2);
    for (let i = 0; i < N_AAQAA; i++) for (const k of [0, 1]) {
      let d = this.goal[i][k] - this.ang[i][k];
      d = ((d + 180) % 360 + 360) % 360 - 180;
      this.ang[i][k] += d * u;
    }
    const b = backbone(this.ang.map(a => [a[0], a[1]]));
    let cx = 0, cy = 0, cz = 0;
    b.forEach(p => { cx += p.CA[0]; cy += p.CA[1]; cz += p.CA[2]; });
    cx /= N_AAQAA; cy /= N_AAQAA; cz /= N_AAQAA;
    this.ca ??= new Float64Array(3 * N_AAQAA); this.gd ??= new Float64Array(3 * N_AAQAA);
    b.forEach((p, i) => {
      this.ca[3 * i] = p.CA[0] - cx; this.ca[3 * i + 1] = p.CA[1] - cy; this.ca[3 * i + 2] = p.CA[2] - cz;
      this.gd[3 * i] = p.O[0] - p.C[0]; this.gd[3 * i + 1] = p.O[1] - p.C[1]; this.gd[3 * i + 2] = p.O[2] - p.C[2];
    });
    this.ribbon.update(this.ca, this.gd);
    this.group.rotation.y += dt * 0.25;
  }
  send(tier) {
    const k = this.k, kt = PSI_GAIN * k / RT(300);
    this.game.finish(this, tier, {
      comment: { 1: 'The right order of magnitude, which here is all the difference.', 2: `${(this.fAt(300) * 100).toFixed(0)}% at 300 K. Now heat it.`, 3: 'The whole curve fits, and I do not trust it. Good. Neither should you.' }[tier],
      lesson: `White is the Lifson-Roig prediction from experimental helix-coil parameters (Rohl & Baldwin 1997, as tabulated by Best & Hummer): ${pct(F300)}% at 300 K. NMR on this peptide gives about 20% (Shalongo et al. 1994). Best & Hummer took ff99SB from about 2% to 14% with <i>k</i> = 0.18 kcal/mol, around 0.5 <i>kT</i> per residue. Yours is ${k.toFixed(3)} (${kt.toFixed(2)} <i>kT</i>). Small numbers multiply along a chain. They also found the temperature dependence stayed too weak. Their Table 5 numbers are solved here exactly; your second knob is a teaching device.`,
      apply: ff => { ff.kPsi = this.k; ff.sTrade = this.s; },
    });
  }
  // Scripted play, for testing reachability.
  solve(level = 2) {
    this.k = SOLVE.k; this.rK.set(this.k); this.compute();
    if (level === 3) { this.s = SOLVE.s; this.rS?.set(this.s); this.compute(); }
  }
}
const SOLVE = { k: 0.199, s: 1.8 };
