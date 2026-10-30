// Part two: the angle term, k(θ-θ₀)², and what stiff terms cost in time step.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Spring, Curve, Sticks, INK, Burst, axisLine } from '../gfx.js';
import { REF, save } from '../save.js';
import { CM_TO_HZ } from '../audio.js';
import { MDSystem, normalModes, DEG, KB } from '../physics/md.js';

const R0 = REF.OH.r0, MASS = [15.999, 1.008, 1.008];
const lw = w => w * Math.min(devicePixelRatio, 2);

function water(kb, kth, th, opts = {}) {
  const s = new MDSystem({ masses: MASS, bonds: opts.rigid ? [] : [[0, 1, kb, R0], [0, 2, kb, R0]], angles: [[1, 0, 2, kth, th * DEG]] });
  const h = th * DEG / 2;
  s.x.set([0, 0, 0, R0 * Math.sin(h), -R0 * Math.cos(h), 0, -R0 * Math.sin(h), -R0 * Math.cos(h), 0]);
  s.forces();
  return s;
}

function modesOf(kb, kth, th) {
  const m = normalModes(water(kb, kth, th)).filter(x => x.cm > 200);
  return m.slice(-3);
}

const NOTE_NAMES = ['Bend', 'Symmetric stretch', 'Asymmetric stretch'];
const TARGET = [1595, 3657, 3756];

export class Chord extends Plate {
  enter() {
    const r = this.root;
    this.kb = save.ff.OH ?? REF.OH.k;
    this.kth = 100; this.th = 122;
    this.atoms = new Atoms(3, { detail: 6 });
    this.atoms.setColor(0, INK.O); this.atoms.setColor(1, INK.H, 0.1); this.atoms.setColor(2, INK.H, 0.1);
    this.atoms.flush(true);
    this.s1 = new Spring({ radius: 0.13, turns: 7 }); this.s2 = new Spring({ radius: 0.13, turns: 7 });
    this.ghost = new Sticks(2, { radius: 0.022, color: INK.white, glow: 1.2 });
    const h = REF.thetaHOH * DEG / 2;
    this.ghost.setStick(0, 0, 0, 0, R0 * 1.34 * Math.sin(h), -R0 * 1.34 * Math.cos(h), 0);
    this.ghost.setStick(1, 0, 0, 0, -R0 * 1.34 * Math.sin(h), -R0 * 1.34 * Math.cos(h), 0);
    this.ghost.flush();
    this.arc = new Curve({ color: INK.gold, width: lw(2), n: 40 });
    r.add(this.atoms, this.s1, this.s2, this.ghost, this.arc);
    r.position.y = 0.3;
    this.stage.frame(1.75);
    this.ui.note('This <i>k</i><sub>θ</sub> = 100 comes straight from the water file. TIP3P runs rigid, so nobody fitted it. <b>Match the white shape and notes.</b>');
    this.staff = this.ui.custom(this.staffSvg(), 'staffbox');
    this.rT = this.ui.ruler({ label: 'Rest angle θ₀', unit: '°', min: 80, max: 180, step: 0.1, value: this.th, major: 10, span: 3, onInput: v => { this.th = v; this.solveModes(); } });
    this.rK = this.ui.ruler({ label: 'Force constant <i>k</i><sub>θ</sub>', unit: 'kcal/mol/rad²', min: 10, max: 160, step: 0.1, value: this.kth, major: 10, span: 3.4, onInput: v => { this.kth = v; this.solveModes(); } });
    NOTE_NAMES.forEach((n, i) => this.ui.button(n, () => this.play(i)));
    this.ui.sender(t => this.send(t));
    this.amp = [0, 0, 0]; this.ph = [0, 0, 0];
    this.solveModes();
  }
  staffSvg() {
    const lines = [0, 1, 2, 3, 4].map(i => `<line x1="0" x2="400" y1="${16 + i * 12}" y2="${16 + i * 12}" stroke="rgba(234,243,244,.3)"/>`).join('');
    const notes = [0, 1, 2].map(i => `<g transform="translate(${90 + i * 110},0)"><ellipse id="tn${i}" rx="10" ry="7.5" cy="40" fill="none" stroke="#eaf3f4" stroke-width="1.6"/><ellipse id="yn${i}" rx="9" ry="6.6" cy="40" fill="#f0bb45"/></g>`).join('');
    return `<svg class="staff" viewBox="0 0 400 86" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${lines}${notes}</svg>`;
  }
  noteY(cm) {
    const o = Math.log2(cm / 1595);
    return 58 - o * 40;
  }
  solveModes() {
    this.modes = modesOf(this.kb, this.kth, this.th);
    this.eq = water(this.kb, this.kth, this.th);
    this.modes.forEach((m, i) => {
      document.getElementById('yn' + i)?.setAttribute('cy', this.noteY(m.cm).toFixed(1));
      document.getElementById('tn' + i)?.setAttribute('cy', this.noteY(TARGET[i]).toFixed(1));
    });
    let peak = [0, 0, 0];
    this.modes.forEach((m, i) => { peak[i] = Math.max(...m.vec.map(Math.abs)); });
    this.peak = peak;
  }
  play(i) {
    const m = this.modes[i];
    this.amp[i] = 0.2; this.ph[i] = 0;
    this.sound.pluck(m.cm * CM_TO_HZ, 0.55, 2.8);
  }
  update(dt) {
    const x = Float64Array.from(this.eq.x);
    this.modes.forEach((m, i) => {
      this.ph[i] += 2 * Math.PI * m.cm / 1400 * dt;
      this.amp[i] *= Math.exp(-dt / 2.5);
      const a = this.amp[i] / this.peak[i] * Math.cos(this.ph[i]);
      for (let q = 0; q < 9; q++) x[q] += a * m.vec[q];
    });
    const cy = -0.25;
    const P = i => [x[3 * i], x[3 * i + 1] - cy, x[3 * i + 2]];
    const [O, A, B] = [P(0), P(1), P(2)];
    this.atoms.setAtom(0, ...O, 0.46); this.atoms.setAtom(1, ...A, 0.25); this.atoms.setAtom(2, ...B, 0.25);
    this.atoms.flush();
    this.s1.stretch(...O, ...A); this.s2.stretch(...O, ...B);
    this.ghost.position.y = -cy;
    const a0 = -Math.PI / 2 - this.th * DEG / 2;
    this.arc.setFrom(t => { const a = a0 + t * this.th * DEG; return [0.66 * Math.cos(a), 0.66 * Math.sin(a) - cy, 0]; });
    const dTh = Math.abs(this.th - REF.thetaHOH), dB = Math.abs(this.modes[0].cm - REF.bend);
    const t1 = dTh <= 0.6 ? 3 : dTh <= 2 ? 2 : dTh <= 6 ? 1 : 0, t2 = dB <= 6 ? 3 : dB <= 20 ? 2 : dB <= 60 ? 1 : 0;
    this.ui.setTier(Math.min(t1, t2));
  }
  down() {
    const t = this.modes.map((_, i) => i);
    t.forEach(i => { this.amp[i] = 0.14; this.ph[i] = 0; });
    this.sound.chord(this.modes.map(m => m.cm * CM_TO_HZ));
    return false;
  }
  send(tier) {
    const m = this.modes.map(v => v.cm.toFixed(0));
    this.game.finish(this, tier, {
      comment: { 1: 'That is a chord, in the sense that a dropped piano is a chord.', 2: 'Recognisably water.', 3: 'Water, in tune.' }[tier],
      lesson: `Your molecule now has modes at ${m.join(', ')} cm⁻¹. Measured: 1595, 3657, 3756. Bending is much softer than stretching, so it sings low. No one mode belongs to one term: the two stretches share a bond constant and split because the bonds are coupled through the oxygen.`,
      apply: ff => { ff.kTheta = this.kth; ff.theta = this.th; },
    });
  }
  solve() {
    this.rT.set(REF.thetaHOH); this.th = REF.thetaHOH;
    let lo = 10, hi = 160;
    for (let i = 0; i < 30; i++) { const k = (lo + hi) / 2; if (modesOf(this.kb, k, this.th)[0].cm > REF.bend) hi = k; else lo = k; }
    this.kth = lo; this.rK.set(lo); this.solveModes();
  }
  exit() { this.root.position.y = 0; }
}

const WOBBLE_LIMIT = 30;

export class Step extends Plate {
  enter() {
    const r = this.root;
    this.kb = save.ff.OH ?? REF.OH.k; this.kth = save.ff.kTheta ?? 46.5; this.th = save.ff.theta ?? REF.thetaHOH;
    this.dt = 0.5; this.rigid = false;
    this.atoms = new Atoms(3, { detail: 6 });
    this.atoms.setColor(0, INK.O); this.atoms.setColor(1, INK.H, 0.1); this.atoms.setColor(2, INK.H, 0.1);
    this.atoms.flush(true);
    this.s1 = new Spring({ radius: 0.13, turns: 7 }); this.s2 = new Spring({ radius: 0.13, turns: 7 });
    this.trace = new Curve({ color: INK.gold, width: lw(2), n: 150 });
    this.base = axisLine([[-2.3, -1.8, 0], [2.3, -1.8, 0]], INK.white, 0.6);
    this.burst = new Burst(r, 320, { color: INK.gold, size: 0.1 });
    this.burst2 = new Burst(r, 200, { color: INK.red, size: 0.09 });
    r.add(this.atoms, this.s1, this.s2, this.trace, this.base);
    this.stage.frame(2.5, [0, -0.4, 0]);
    this.ui.note('Stiff bonds cost you time. <b>Find the largest time step that keeps total energy steady.</b> Go on, push it.');
    this.rd = this.ui.readout('energy wobble');
    this.rdL = this.ui.readout('allowed');
    this.rdL.set(`<span class="ref">${WOBBLE_LIMIT}%</span>`);
    this.rS = this.ui.ruler({ label: 'Time step Δ<i>t</i>', unit: 'fs', min: 0.1, max: 6, step: 0.05, value: this.dt, digits: 2, major: 0.5, span: 3.4, onInput: v => { this.dt = v; this.measure(); } });
    this.bShake = this.ui.button('Freeze the O–H bonds (SHAKE)', () => { this.rigid = !this.rigid; this.bShake.classList.toggle('on', this.rigid); this.reset(); });
    this.ui.sender(t => this.send(t));
    this.hist = new Float32Array(150);
    this.reset();
  }
  makeSys() {
    const s = water(this.kb, this.kth, this.th, { rigid: this.rigid });
    if (this.rigid) {
      s.constraints = [[0, 1, R0], [0, 2, R0]];
      s.x[4] += 0.1; s.x[3] += 0.1;
      s.shake(Float64Array.from(s.x));
    } else { s.x[3] += 0.06; s.x[7] += 0.08; }
    s.forces();
    return s;
  }
  reset() {
    this.sys = this.makeSys();
    this.E0 = this.sys.E.pot + this.sys.kinetic();
    this.steps = 0; this.dead = false; this.hist.fill(0);
    this.measure();
  }
  // A quick hidden run gives a stable number for the wobble at this time step.
  measure() {
    const s = this.makeSys();
    let lo = Infinity, hi = -Infinity, K = 0, n = 0;
    for (let i = 0; i < 3000; i++) {
      if (!s.stepNVE(this.dt)) { n = -1; break; }
      const k = s.kinetic(), e = s.E.pot + k;
      if (!(Math.abs(e) < 1e3)) { n = -1; break; }
      lo = Math.min(lo, e); hi = Math.max(hi, e); K += k; n++;
    }
    this.wobble = n < 0 ? Infinity : (hi - lo) / (K / n) * 100;
  }
  update(dt) {
    const s = this.sys;
    if (!this.dead) {
      let fail = false;
      for (let i = 0; i < 2; i++) {
        if (!s.stepNVE(this.dt)) fail = true;
        this.steps++;
      }
      const e = s.E.pot + s.kinetic();
      this.hist.copyWithin(0, 1); this.hist[149] = e - this.E0;
      if (fail || !(Math.abs(e) < 900) || !Number.isFinite(e)) this.explode();
    }
    const k = 0.35 + Math.max(...this.hist.map(Math.abs)) * 0.04;
    const scale = 1 / Math.max(1, k * 6);
    this.trace.setFrom(t => [-2.3 + 4.6 * t, -1.8 + THREE.MathUtils.clamp(this.hist[Math.floor(t * 149)] * scale, -0.75, 0.75), 0]);
    const x = this.dead ? this.deadX : s.x;
    let cx = (x[0] * 16 + x[3] + x[6]) / 18, cy = (x[1] * 16 + x[4] + x[7]) / 18;
    if (!this.dead) { this.cx = cx; this.cy = cy; }
    const P = i => [x[3 * i] - this.cx, x[3 * i + 1] - this.cy + 0.4, x[3 * i + 2]];
    const [O, A, B] = [P(0), P(1), P(2)];
    this.atoms.setAtom(0, ...O, 0.46); this.atoms.setAtom(1, ...A, 0.25); this.atoms.setAtom(2, ...B, 0.25);
    this.atoms.flush();
    this.s1.stretch(...O, ...A); this.s2.stretch(...O, ...B);
    this.s1.visible = this.s2.visible = !this.dead;
    this.burst.update(dt); this.burst2.update(dt);
    if (this.dead) {
      for (let i = 0; i < 9; i++) this.deadX[i] *= 1 + dt * 1.6;
    }
    const w = this.wobble;
    this.rd.set(w === Infinity ? 'unstable' : `${w.toFixed(0)}%`);
    let tier = 0;
    if (w <= WOBBLE_LIMIT) {
      if (!this.rigid) tier = this.dt >= 0.8 ? 1 : 0;
      else tier = this.dt >= 1.95 ? 3 : this.dt >= 1.4 ? 2 : this.dt >= 0.8 ? 1 : 0;
    }
    this.ui.setTier(tier);
    if (!this.rigid && w <= WOBBLE_LIMIT && this.dt >= 0.9 && !this.saidS) {
      this.saidS = true;
      this.ui.note('About 1 fs: the O–H stretch has a 9 fs period, and it sets the limit. <b>Freeze it and try again.</b>');
    }
  }
  explode() {
    this.dead = true;
    this.deadX = Float64Array.from(this.sys.x.map((v, i) => Number.isFinite(v) ? THREE.MathUtils.clamp(v, -4, 4) : 0));
    const c = [0, 0.4, 0];
    this.burst.fire(c, 14); this.burst2.fire(c, 9);
    this.stage.pulse = 2.5;
    this.sound.crash();
    navigator.vibrate?.([30, 40, 90]);
    const t = (this.steps * this.dt / 1000).toFixed(3);
    setTimeout(() => this.ui.crash([
      `Step ${this.steps}, time ${t} ps, dt ${this.dt.toFixed(2)} fs`,
      `WARNING: bond 1-2 rotated more than 30 degrees`,
      `Bond length ${(3 + Math.random() * 40).toFixed(1)} Å, should be ${R0} Å`,
      `Total energy is not a number`,
      ``,
      `Segmentation fault (core dumped)`,
      ``,
      `Reviewer 2: A segfault is not a result.`,
    ], () => { this.dt = Math.max(0.5, this.dt - 1.25); this.rS.set(this.dt); this.reset(); }), 500);
  }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'Safe, and slow. Your funding agency will ask why.', 2: 'Stable, but you left speed on the table.', 3: '2 fs, the number in nearly every protein simulation. Now you know why.' }[tier],
      lesson: 'Verlet integration needs ω Δ<i>t</i> &lt; 2 and is only accurate well below that, so the fastest motion in the system sets the step for everything. Freezing bonds to hydrogen removes that motion and doubles the step. Your force constants decide how fast your simulation can run.',
      apply: ff => { ff.dt = this.dt; },
    });
  }
  solve() { this.rigid = true; this.bShake.classList.add('on'); this.dt = 2; this.rS.set(2); this.reset(); }
}
