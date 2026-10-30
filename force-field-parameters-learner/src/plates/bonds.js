// Part one: the bond term, k(r-r₀)².
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Spring, Curve, Dots, ring, INK, axisLine, Burst } from '../gfx.js';
import { REF, wavenumber, save } from '../save.js';
import { CM_TO_HZ } from '../audio.js';

const RAD = { H: 0.27, C: 0.42, O: 0.44 };
const THZ = cm => cm * 0.029979;

// One bond as a vibrating two-body oscillator, slowed so the eye can follow it.
class Oscillator {
  constructor(spec, k) { Object.assign(this, { spec, k, amp: 0, phase: 0, held: false, r: spec.r0 }); this.r0 = spec.r0; }
  get cm() { return wavenumber(this.k, this.spec.m1, this.spec.m2); }
  update(dt) {
    if (this.held) return;
    this.phase += 2 * Math.PI * this.cm / 1000 * dt;
    this.amp *= Math.exp(-dt / 2.4);
    this.r = this.r0 + this.amp * Math.cos(this.phase);
  }
  release(sound) {
    this.held = false;
    this.amp = this.r - this.r0;
    this.phase = 0;
    sound.pluck(this.cm * CM_TO_HZ, Math.min(0.9, 0.3 + Math.abs(this.amp)));
  }
  strike(sound, a = 0.25) { this.amp = a; this.phase = 0; sound.pluck(this.cm * CM_TO_HZ, 0.5); }
}

export class Pluck extends Plate {
  enter() {
    const s = this.stage, r = this.root;
    this.osc = new Oscillator(REF.CH, 150 + Math.random() * 60);
    this.atoms = new Atoms(2, { detail: 6 });
    this.atoms.setColor(0, INK.C); this.atoms.setColor(1, INK.H, 0.02);
    this.atoms.flush(true);
    this.spring = new Spring();
    this.outer = ring(1.92, 72, 0.13, INK.white, 0.8);
    this.inner = ring(1.76, 72, 0.13, INK.gold);
    r.add(this.atoms, this.spring, this.outer, this.inner);
    this.outer.position.z = this.inner.position.z = -0.8;
    this.burst = new Burst(r, 200);
    s.frame(2.3);
    this.ui.note('Reviewer 2 here. Every number in your force field needs a reason. Start small: <b>grab the hydrogen, pull it, let go.</b>');
    this.tagH = this.ui.tag('hydrogen', () => this.hPos ? [this.hPos[0], -0.55, 0] : null);
    this.tagC = this.ui.tag('carbon', () => [this.cX, -0.7, 0]);
    this.plucks = 0;
    this.idle = 0;
  }
  positions() {
    const o = this.osc, { m1, m2 } = o.spec, t = m1 + m2;
    this.cX = -o.r * m2 / t - 0.1;
    this.hX = o.r * m1 / t - 0.1;
    this.hPos = [this.hX, 0, 0];
  }
  openTuner() {
    const ui = this.ui;
    this.k = ui.ruler({
      label: 'Force constant <i>k</i>', unit: 'kcal/mol/Å²', min: 100, max: 800, step: 0.5, value: this.osc.k, major: 50, span: 3.4,
      onInput: v => { this.osc.k = v; this.touched(); },
    });
    this.rdY = ui.readout('your bond'); this.rdT = ui.readout('real C–H');
    ui.sender(tier => this.send(tier));
    this.sound.startBeat(wavenumber(REF.CH.k, REF.CH.m1, REF.CH.m2) * CM_TO_HZ, this.osc.cm * CM_TO_HZ);
    this.tunerOpen = true;
  }
  touched() { this.idle = 0; this.sound.setBeat(this.target * CM_TO_HZ, this.osc.cm * CM_TO_HZ); }
  get target() { return wavenumber(REF.CH.k, REF.CH.m1, REF.CH.m2); }
  update(dt) {
    this.osc.update(dt);
    this.positions();
    const { cX, hX } = this;
    this.atoms.setAtom(0, cX, 0, 0, RAD.C);
    this.atoms.setAtom(1, hX, 0, 0, RAD.H);
    this.atoms.flush();
    this.spring.stretch(cX, 0, 0, hX, 0, 0);
    this.spring.material.uniforms.uHeat.value = Math.min(1, Math.abs(this.osc.r - this.osc.r0) * 1.6);
    this.burst.update(dt);
    if (this.tunerOpen) {
      const my = this.osc.cm, d = my - this.target;
      this.inner.rotation.z += THREE.MathUtils.clamp(d * CM_TO_HZ * 0.55, -7, 7) * dt;
      this.rdY.set(`${my.toFixed(0)} cm⁻¹`);
      this.rdT.set(`<span class="ref">${this.target.toFixed(0)} cm⁻¹</span>`);
      const a = Math.abs(d);
      this.ui.setTier(a <= 4 ? 3 : a <= 15 ? 2 : a <= 40 ? 1 : 0);
      this.idle += dt;
      if (this.idle > 4) this.sound.quietBeat();
      if (a <= 4 && !this.saidTuned) { this.saidTuned = true; this.ui.note('There. The rings have stopped and the beating is gone. Send it to me.'); }
      if (a > 15 && this.saidTuned) { this.saidTuned = false; this.ui.note('The beating is back. <b>Slide <i>k</i> until the gold ring stops.</b>'); }
    }
  }
  down(x, y) {
    if (!this.near(x, y, this.hPos, 70)) return false;
    this.osc.held = true;
    return true;
  }
  move(x, y) {
    if (!this.osc.held) return;
    const p = this.stage.pointerToWorld(x, y, new THREE.Vector3(), new THREE.Vector3());
    const { m1, m2 } = this.osc.spec, t = m1 + m2;
    this.osc.r = THREE.MathUtils.clamp((p.x + 0.1) * t / m1, 0.55, 1.95);
  }
  up() {
    if (!this.osc.held) return;
    this.osc.release(this.sound);
    if (Math.abs(this.osc.amp) < 0.04) this.osc.strike(this.sound);
    this.plucks++;
    this.idle = 0;
    if (this.plucks === 1) {
      const c = this.osc.cm;
      this.ui.note(`That note is real. Your bond rings at ${THZ(c).toFixed(0)} THz, and you hear it 37 octaves down at ${(c * CM_TO_HZ).toFixed(0)} Hz. A real C–H rings at ${THZ(this.target).toFixed(0)} THz.`);
      setTimeout(() => { if (this.game.plate === this) { this.openTuner(); this.ui.note('The white ring and the steady tone are the real bond. <b>Slide <i>k</i> until the gold ring stops drifting</b> and the beating stops.'); } }, 3800);
    }
  }
  send(tier) {
    this.burst.fire([0, 0, 0], 5);
    this.game.finish(this, tier, {
      comment: { 1: 'Audibly flat or sharp. I can hear it from here.', 2: 'Close. Musicians would still wince.', 3: 'In tune. I have no comment, which is rare.' }[tier],
      lesson: `The force constant sets the pitch: ν̃ = (1/2π<i>c</i>)√(2<i>k</i>/μ). AMBER writes <i>k</i>(<i>r</i>−<i>r</i>₀)² with no ½, so the true spring constant is 2<i>k</i>. Your value: ${this.osc.k.toFixed(1)}. AMBER’s: 340.`,
      apply: ff => { ff.CH = this.osc.k; },
    });
  }
  solve() { if (!this.tunerOpen) this.openTuner(); this.k.set(340); this.osc.k = 340; this.touched(); }
  exit() { this.sound.stopBeat(); }
}

export class Harp extends Plate {
  enter() {
    const r = this.root;
    const ch = save.ff.CH ?? REF.CH.k;
    this.strings = [
      { o: new Oscillator(REF.CC, 120), x: -1.9, name: 'C–C', a: INK.C, b: INK.C, ra: RAD.C, rb: RAD.C },
      { o: new Oscillator(REF.CH, ch), x: 0, name: 'C–H', a: INK.C, b: INK.H, ra: RAD.C, rb: RAD.H, locked: true },
      { o: new Oscillator(REF.OH, 300), x: 1.9, name: 'O–H', a: INK.O, b: INK.H, ra: RAD.O, rb: RAD.H },
    ];
    this.atoms = new Atoms(6, { detail: 5 });
    this.strings.forEach((s, i) => {
      s.spring = new Spring({ radius: 0.14 });
      r.add(s.spring);
      this.atoms.setColor(2 * i, s.a); this.atoms.setColor(2 * i + 1, s.b, 0.1);
      s.tag = this.ui.tag('', () => [s.x, -1.75, 0]);
      s.tgt = wavenumber(s.o.spec.k, s.o.spec.m1, s.o.spec.m2);
    });
    this.atoms.flush(true);
    r.add(this.atoms);
    this.stage.frame(3.1);
    this.ui.note('Your C–H is in place. Tune the other two. <b>Tap a bond to hear it, or drag across all three.</b>');
    this.current = this.strings[0];
    const add = (s, label, max) => this.ui.ruler({
      label, unit: 'kcal/mol/Å²', min: 100, max, step: 0.5, value: s.o.k, major: 50, span: 3.4,
      onInput: v => { s.o.k = v; this.current = s; this.beat(s); if (this.game.plate === this) s.o.amp = Math.max(s.o.amp, 0.04); },
    });
    this.rA = add(this.strings[0], '<i>k</i> of C–C', 800);
    this.rB = add(this.strings[2], '<i>k</i> of O–H', 900);
    this.ui.sender(t => this.send(t));
    this.sound.startBeat(this.strings[0].tgt * CM_TO_HZ, this.strings[0].o.cm * CM_TO_HZ);
    this.idle = 0;
  }
  beat(s) { this.idle = 0; this.sound.setBeat(s.tgt * CM_TO_HZ, s.o.cm * CM_TO_HZ); }
  update(dt) {
    let worst = 3;
    this.strings.forEach((s, i) => {
      s.o.update(dt);
      const { m1, m2 } = s.o.spec, t = m1 + m2, a = -s.o.r * m2 / t, b = s.o.r * m1 / t;
      this.atoms.setAtom(2 * i, s.x, a, 0, s.ra);
      this.atoms.setAtom(2 * i + 1, s.x, b, 0, s.rb);
      s.spring.stretch(s.x, a, 0, s.x, b, 0);
      const d = Math.abs(s.o.cm - s.tgt);
      if (!s.locked) worst = Math.min(worst, d <= 5 ? 3 : d <= 18 ? 2 : d <= 45 ? 1 : 0);
      s.tag.el.innerHTML = `${s.name}<br><small>${s.o.cm.toFixed(0)} / ${s.tgt.toFixed(0)}</small>`;
      s.tag.el.classList.toggle('gold', d <= 5);
    });
    this.atoms.flush();
    this.ui.setTier(worst);
    this.idle += dt;
    if (this.idle > 4) this.sound.quietBeat();
    if (worst === 3 && !this.said) { this.said = true; this.ui.note('C–C has almost the same stiffness as C–H, yet it rings at a third of the pitch. <b>Strum them. Why?</b>'); }
  }
  pick(x, y) {
    for (const s of this.strings) if (this.near(x, y, [s.x, 0, 0], 74)) return s;
    return null;
  }
  down(x, y) {
    this.strum = true; this.lastX = x;
    const s = this.pick(x, y);
    if (s) { s.o.strike(this.sound); this.current = s; this.beat(s); }
    return true;
  }
  move(x, y) {
    if (!this.strum) return;
    const v = new THREE.Vector3();
    for (const s of this.strings) {
      const p = this.stage.project(v.set(s.x, 0, 0), v);
      if ((this.lastX - p.x) * (x - p.x) < 0) s.o.strike(this.sound, 0.22);
    }
    this.lastX = x;
  }
  up() { this.strum = false; }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'Two strings, both out. Do you own a tuner?', 2: 'Nearly. One of those still wobbles.', 3: 'A very fine harp.' }[tier],
      lesson: 'Stiffness is only half of it. C–C (<i>k</i> = 310) and C–H (<i>k</i> = 340) are about equally stiff, but ν̃ goes as 1/√μ and carbon is twelve times heavier than hydrogen. The lightest atoms always vibrate fastest.',
      apply: ff => { ff.CC = this.strings[0].o.k; ff.OH = this.strings[2].o.k; },
    });
  }
  solve() { this.rA.set(310); this.strings[0].o.k = 310; this.rB.set(553); this.strings[2].o.k = 553; }
  exit() { this.sound.stopBeat(); }
}

const D = 105, BETA = 1.7995, RE = 1.09;
const morse = r => D * (1 - Math.exp(-BETA * (r - RE))) ** 2;

export class Well extends Plate {
  enter() {
    const r = this.root;
    const X = this.X = v => -3.5 + v * 3.1, Y = this.Y = u => -2.4 + Math.min(u, 21) * 0.2;
    this.k = 620; this.r0 = 1.32; this.r = this.r0;
    this.atoms = new Atoms(3, { detail: 5 });
    this.atoms.setColor(0, INK.C); this.atoms.setColor(1, INK.H, 0.15); this.atoms.setColor(2, INK.white, 0.4);
    this.atoms.flush(true);
    this.spring = new Spring({ turns: 8 });
    this.curve = new Curve({ color: INK.gold, width: 3 * Math.min(devicePixelRatio, 2) });
    this.qm = new Curve({ color: INK.white, width: 1.1 * Math.min(devicePixelRatio, 2), opacity: 0.4 });
    this.qm.setFrom(t => { const v = 0.82 + t * 1.58; return [X(v), Y(morse(v)), 0]; });
    this.pts = [];
    for (let v = 0.84; v < 1.75; v += 0.05) if (morse(v) < 20) this.pts.push(v);
    this.dots = new Dots(this.pts.length, 0.06);
    this.pts.forEach((v, i) => this.dots.place(i, X(v), Y(morse(v)), 0));
    this.dots.flush();
    this.ball = new Atoms(1, { detail: 4 });
    this.ball.setColor(0, INK.gold, 0.9); this.ball.flush(true);
    r.add(this.qm, this.curve, this.dots, this.atoms, this.spring, this.ball);
    r.add(axisLine([[X(0.7), Y(0), 0], [X(2.4), Y(0), 0]]));
    this.burst = new Burst(r, 160, { color: INK.white, size: 0.08 });
    this.drop = axisLine([[0, 0, 0], [0, 1, 0]], INK.gold, 0.5);
    r.add(this.drop);
    this.stage.frame(4.35, [0.1, 0.15, 0]);
    this.ui.note('White dots are a quantum calculation of this bond. <b>Fit your gold well to them,</b> then pull the hydrogen as far as you like.');
    this.rK = this.ui.ruler({ label: 'Force constant <i>k</i>', unit: 'kcal/mol/Å²', min: 100, max: 900, step: 1, value: this.k, major: 100, span: 2.6, onInput: v => { this.k = v; this.draw(); } });
    this.rR = this.ui.ruler({ label: 'Rest length <i>r</i>₀', unit: 'Å', min: 0.85, max: 1.5, step: 0.001, value: this.r0, digits: 3, major: 0.05, span: 2.6, onInput: v => { this.r0 = v; this.draw(); } });
    this.rd = this.ui.readout('error near the bottom');
    this.ui.sender(t => this.send(t));
    this.ui.tag('your well', () => [X(this.r0) - 1.2, Y(12), 0]).el.classList.add('gold');
    this.ui.tag('quantum', () => [X(1.95), Y(14.5), 0]);
    this.draw();
    this.vel = 0; this.held = false; this.broke = false;
  }
  draw() {
    const { X, Y } = this;
    this.curve.setFrom(t => {
      const v = this.r0 - 0.42 + 0.84 * t;
      return [X(v), Y(this.k * (v - this.r0) ** 2), 0.02];
    });
    let s = 0, n = 0;
    for (const v of this.pts) if (Math.abs(v - RE) <= 0.13) { s += (this.k * (v - this.r0) ** 2 - morse(v)) ** 2; n++; }
    this.rmse = Math.sqrt(s / n);
  }
  update(dt) {
    const { X, Y } = this;
    if (!this.held) {
      const a = -2 * this.k * (this.r - this.r0) * 0.0035 - this.vel * 2.5;
      this.vel += a * dt * 60; this.r += this.vel * dt * 60 * 0.06;
      if (Math.abs(this.r) > 6 || !Number.isFinite(this.r)) { this.r = this.r0; this.vel = 0; }
      if (this.broke && this.r < 1.9) { this.broke = false; this.ui.note('Fit the dots, then send it to me.'); }
    }
    const x = X(this.r), yB = 2.15;
    this.atoms.setAtom(0, X(0), yB, 0, RAD.C);
    this.atoms.setAtom(1, x, yB, 0, RAD.H);
    const gx = this.broke ? this.ghostX : x;
    if (this.broke) this.ghostX += dt * 1.5;
    this.atoms.setAtom(2, gx, yB + 0.62, 0, this.broke ? 0.14 : 0.0001);
    this.atoms.flush();
    this.spring.stretch(X(0), yB, 0, x, yB, 0);
    const u = this.k * (this.r - this.r0) ** 2;
    this.spring.material.uniforms.uHeat.value = Math.min(1.5, u / 80);
    const by = Y(u);
    this.ball.setAtom(0, x, by, 0.04, 0.1); this.ball.flush();
    this.drop.position.set(x, by, 0); this.drop.scale.set(1, yB - by, 1);
    this.burst.update(dt);
    this.rd.set(`${this.rmse.toFixed(2)} kcal/mol`);
    const e = this.rmse;
    this.ui.setTier(e <= 0.5 ? 3 : e <= 1 ? 2 : e <= 3 ? 1 : 0);
    if (this.held && this.r > 2.2 && !this.broke) {
      this.broke = true; this.ghostX = x;
      this.burst.fire([x, yB + 0.62, 0], 3);
      this.sound.noise(0.1, 0.2, 5000);
      this.ui.note(`The real bond has let go: breaking it takes about 100 kcal/mol. Yours is at ${u.toFixed(0)} and will never break.`);
    }
    if (this.broke && this.held) this.saidE = u;
  }
  down(x, y) {
    if (!this.near(x, y, [this.X(this.r), 2.15, 0], 64)) return false;
    this.held = true; this.vel = 0;
    return true;
  }
  move(x, y) {
    if (!this.held) return;
    const p = this.stage.pointerToWorld(x, y, new THREE.Vector3(), new THREE.Vector3());
    this.r = THREE.MathUtils.clamp((p.x + 3.5) / 3.1, 0.5, 2.4);
  }
  up() {
    if (!this.held) return;
    this.held = false;
    this.sound.pluck(wavenumber(this.k, REF.CH.m1, REF.CH.m2) * CM_TO_HZ, 0.5);
  }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'Within 3 kcal/mol. A thermal bath would notice.', 2: 'Chemical accuracy. Respectable.', 3: 'Better than chemical accuracy, near the bottom where it matters.' }[tier],
      lesson: 'A parabola only matches the true curve near its bottom, and at room temperature a bond rarely leaves that region. But a harmonic bond can never break. That is why ordinary force fields cannot do chemistry: the list of bonds is fixed before the simulation starts.',
      apply: ff => { ff.kCH2 = this.k; ff.r0CH = this.r0; },
    });
  }
  solve() { this.rK.set(345); this.k = 345; this.rR.set(1.09); this.r0 = 1.09; this.draw(); }
}
