// Part three: the torsion term, a sum of cosines around a bond.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Sticks, Curve, Dots, Sparks, INK, ring } from '../gfx.js';
import { REF, save } from '../save.js';
import { MDSystem, DEG, dihedral } from '../physics/md.js';

const lw = w => w * Math.min(devicePixelRatio, 2);
const U = (V, p) => 0.5 * V[0] * (1 + Math.cos(p)) + 0.5 * V[1] * (1 - Math.cos(2 * p)) + 0.5 * V[2] * (1 + Math.cos(3 * p));
const dU = (V, p) => -0.5 * V[0] * Math.sin(p) + V[1] * Math.sin(2 * p) * -1 - 1.5 * V[2] * Math.sin(3 * p);
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

export class Organ extends Plate {
  enter() {
    const r = this.root;
    this.V = [0, 0, 0]; this.phi = Math.PI; this.w = 0; this.held = false;
    this.mol = new Butane(r);
    this.curve = new Curve({ color: INK.gold, width: lw(3), n: 180 });
    this.curve.position.z = -1.7;
    this.pts = [];
    for (let d = 0; d < 360; d += 20) this.pts.push(d * DEG);
    this.dots = new Dots(this.pts.length, 0.075);
    this.pts.forEach((p, i) => { const a = A0 - p; this.dots.place(i, ...polar(BASE + GAIN * U(REF.V, p), a, -1.7)); });
    this.dots.flush();
    const base = ring(BASE, 90, 0.06, INK.white, 0.3);
    base.position.z = -1.7;
    r.add(base, this.curve, this.dots);
    this.ball = new Atoms(1, { detail: 4 });
    this.ball.setColor(0, INK.gold, 0.9); this.ball.flush(true);
    r.add(this.ball);
    this.stage.frame(4.75, [0, 0, 0], { yaw: 0.0, pitch: 0.0 });
    this.stage.view.yaw = 0.5; this.yawGoal = 0;
    this.ui.note('The white dots are the energy of each twist of the middle bond. <b>Draw three cosines through them.</b> Twist the molecule to test it.');
    const bar = (label, i) => this.ui.ruler({
      label, unit: 'kcal/mol', min: -4, max: 6, step: 0.01, value: 0, digits: 2, major: 1, span: 3.4,
      onInput: v => { this.V[i] = v; this.draw(); this.sound.setOrgan(this.V, [0, Math.PI, 0]); },
    });
    this.rV = [bar('<i>V</i>₁, one hump per turn', 0), bar('<i>V</i>₂, two humps', 1), bar('<i>V</i>₃, three humps', 2)];
    this.rd = this.ui.readout('error'); this.rdE = this.ui.readout('energy here');
    this.ui.sender(t => this.send(t));
    this.sound.startOrgan();
    this.draw();
    this.ui.tag('anti', () => polar(BASE - 0.6, A0 - Math.PI, -1.7));
    this.ui.tag('syn', () => polar(BASE - 0.5, A0, -1.7));
    this.ui.tag('gauche', () => polar(BASE - 0.6, A0 - 60 * DEG, -1.7));
    this.ui.tag('gauche', () => polar(BASE - 0.6, A0 + 60 * DEG, -1.7));
  }
  draw() {
    this.curve.setFrom(t => { const p = t * Math.PI * 2; return polar(BASE + GAIN * Math.max(-3, U(this.V, p)), A0 - p); });
    let s = 0;
    for (const p of this.pts) s += (U(this.V, p) - U(REF.V, p)) ** 2;
    this.rmse = Math.sqrt(s / this.pts.length);
  }
  update(dt) {
    this.stage.view.yaw += (this.yawGoal - this.stage.view.yaw) * Math.min(1, dt * 1.2);
    if (!this.held) {
      for (let i = 0; i < 4; i++) {
        this.w += (-dU(this.V, this.phi) * 2.4 - this.w * 1.8) * dt / 4;
        this.phi += this.w * dt / 4 * 4;
      }
      if (this.moving && Math.abs(this.w) < 0.05) { this.moving = false; this.sound.tick(0.5); }
    }
    this.mol.set(this.phi);
    const u = U(this.V, this.phi);
    this.ball.setAtom(0, ...polar(BASE + GAIN * Math.max(-3, u), A0 - this.phi, -1.7), 0.13);
    this.ball.flush();
    this.rd.set(`${this.rmse.toFixed(2)} kcal/mol`);
    this.rdE.set(`${u.toFixed(2)} kcal/mol`);
    const e = this.rmse;
    this.ui.setTier(e <= 0.08 ? 3 : e <= 0.3 ? 2 : e <= 0.8 ? 1 : 0);
  }
  angleAt(x, y) {
    const v = new THREE.Vector3(0, 0, 0);
    const c = this.stage.project(v, v);
    return Math.atan2(-(y - c.y), x - c.x);
  }
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
    this.grab = a;
    this.phi -= d;
  }
  up() { this.held = false; this.moving = true; }
  send(tier) {
    const [a, b, c] = this.V;
    this.game.finish(this, tier, {
      comment: { 1: 'It has the right number of wells. That is the most I can say.', 2: 'Within a third of a kcal/mol. The gauche well is still arguable.', 3: 'Three numbers, one curve. Tidy.' }[tier],
      lesson: `<i>V</i>₃ makes the three staggered wells, <i>V</i>₁ lifts syn above anti, and <i>V</i>₂ fine-tunes gauche. Yours: ${a.toFixed(2)}, ${b.toFixed(2)}, ${c.toFixed(2)}. OPLS: 1.41, −0.27, 3.15. In real fits the torsions come last: they are fitted to whatever the bonds, angles and non-bonded terms left unexplained.`,
      apply: ff => { ff.V = this.V.slice(); },
    });
  }
  solve() { REF.V.forEach((v, i) => { this.V[i] = v; this.rV[i].set(v); }); this.draw(); }
  exit() { this.sound.stopOrgan(); }
}

const antiShare = (V, T) => {
  const kT = 0.0019872 * T;
  let a = 0, t = 0;
  for (let d = 0; d < 360; d++) {
    const w = Math.exp(-U(V, d * DEG) / kT);
    t += w; if (d > 120 && d < 240) a += w;
  }
  return a / t;
};

export class Exposure extends Plate {
  enter() {
    const r = this.root;
    this.V = save.ff.V ?? REF.V.slice();
    this.T = 300;
    this.mol = new Butane(r);
    this.cap = this.game.mobile ? 7000 : 16000;
    this.film = new Sparks(this.cap, { size: 0.085, color: INK.gold, opacity: 0.42 });
    r.add(this.film);
    this.curveRef = new Curve({ color: INK.white, width: lw(1.3), n: 120, opacity: 0.8 });
    this.curve = new Curve({ color: INK.gold, width: lw(2.4), n: 72 });
    r.add(this.curveRef, this.curve);
    this.curveRef.position.z = this.curve.position.z = -2.2;
    this.stage.frame(4.3);
    this.ui.note('Your numbers now predict a population. Real dynamics are running, and every dot is one instant. <b>Let the film expose.</b>');
    this.rT = this.ui.ruler({ label: 'Temperature', unit: 'K', min: 100, max: 900, step: 5, value: 300, digits: 0, major: 100, span: 2.4, onInput: v => { this.T = v; this.resetFilm(); } });
    this.rdA = this.ui.readout('anti, measured'); this.rdR = this.ui.readout('expected');
    this.ui.sender(t => this.send(t));
    // Four united atoms, your torsions, real bonds and angles.
    const m = [15.035, 14.027, 14.027, 15.035], k = 112.4 * DEG;
    this.sys = new MDSystem({
      masses: m, bonds: [[0, 1, 310, 1.53], [1, 2, 310, 1.53], [2, 3, 310, 1.53]],
      angles: [[0, 1, 2, 63, k], [1, 2, 3, 63, k]],
      dihedrals: [[0, 1, 2, 3, this.V[0] / 2, 1, 0], [0, 1, 2, 3, this.V[1] / 2, 2, Math.PI], [0, 1, 2, 3, this.V[2] / 2, 3, 0]],
    });
    const s = 1.53;
    this.sys.x.set([-s * 0.9, s * 0.45, 0, 0, 0, 0, s, 0, 0, s + s * 0.9, -s * 0.45, 0]);
    this.sys.minimize(50, 0.001);
    this.sys.setTemperature(300);
    this.hist = new Float64Array(72);
    this.resetFilm();
    this.phi = Math.PI;
  }
  resetFilm() {
    this.hist.fill(0); this.n = 0; this.anti = 0;
    this.film.geometry.attributes.position.array.fill(1e6); this.film.flush();
    const exp = this.exp = (() => {
      const kT = 0.0019872 * this.T, a = new Float64Array(120);
      let m = 0;
      for (let i = 0; i < 120; i++) { a[i] = Math.exp(-U(this.V, i * 3 * DEG) / kT); m = Math.max(m, a[i]); }
      return a.map(v => v / m);
    })();
    this.curveRef.setFrom(t => { const p = t * Math.PI * 2; return polar(2.5 + 1.5 * exp[Math.round(t * 119)], A0 - p); });
    this.ref = antiShare(this.V, this.T);
  }
  update(dt) {
    const s = this.sys;
    this.budget(4, 700, () => {
      s.stepLangevin(2, this.T, 0.004);
      this.ct = (this.ct | 0) + 1;
      if (this.ct % 40 === 0) {
        const p = dihedral(s.x, 0, 1, 2, 3);
        this.phi = p;
        const q = ((p % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        this.hist[Math.floor(q / (2 * Math.PI) * 72) % 72]++;
        this.n++;
        if (q > 120 * DEG && q < 240 * DEG) this.anti++;
        const ang = A0 - p, rr = 1.42 + (Math.random() - 0.5) * 0.3, z = -1.34 - Math.random() * 0.3;
        this.film.push(rr * Math.cos(ang), rr * Math.sin(ang), z);
      }
    });
    this.film.flush();
    this.mol.set(this.phi);
    const mx = Math.max(...this.hist, 1);
    this.curve.setFrom(t => {
      const i = Math.round(t * 71) % 72;
      const v = (this.hist[(i + 71) % 72] + 2 * this.hist[i] + this.hist[(i + 1) % 72]) / 4 / (mx * 0.75);
      return polar(2.5 + 1.5 * Math.min(1.2, v), A0 - (i + 0.5) / 72 * Math.PI * 2);
    });
    const a = this.n ? this.anti / this.n : 0;
    this.rdA.set(this.n > 60 ? `${(a * 100).toFixed(0)}%` : '…');
    this.rdR.set(`<span class="ref">${(this.ref * 100).toFixed(0)}%</span>`);
    const refMain = antiShare(REF.V, 300);
    const d = Math.abs(a - refMain) * 100;
    const ready = this.n > 1000 && Math.abs(this.T - 300) < 3;
    this.ui.setTier(!ready ? 0 : d <= 4 ? 3 : d <= 8 ? 2 : d <= 16 ? 1 : 0);
    if (this.n > 1000 && this.T === 300 && !this.said) { this.said = true; this.ui.note('Boltzmann, from your own numbers. Now <b>heat it to 900 K</b> and watch the gauche wells fill, then come back to 300 K to send it.'); }
    if (this.T >= 800 && !this.saidHot) { this.saidHot = true; this.ui.note('Hot, every well is nearly equal. Bring it back to <b>300 K</b> to send it.'); }
  }
  send(tier) {
    const a = (this.anti / this.n * 100).toFixed(0);
    this.game.finish(this, tier, {
      comment: { 1: 'The populations are off. Barrier heights do that.', 2: 'Reasonable populations.', 3: 'Your fit predicts the right populations, which is the whole point of a fit.' }[tier],
      lesson: `You measured ${a}% anti from a real trajectory, and the Boltzmann factor from your curve agrees. Energy differences of about 1 kcal/mol, near <i>k</i><sub>B</sub><i>T</i> at 300 K, decide what a molecule looks like most of the time. That is why fits need accuracy well below 1 kcal/mol.`,
      apply: ff => { ff.antiShare = this.anti / this.n; },
    });
  }
  solve() { this.rT.set(300); this.T = 300; }
}
