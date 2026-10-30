// Part four: the Lennard-Jones term, from one pair of atoms to a liquid.
import * as THREE from 'three';
import { Plate } from './base.js';
import { Atoms, Curve, Dots, INK, axisLine } from '../gfx.js';
import { REF, save } from '../save.js';
import { ArgonDrop } from '../physics/droplets.js';
import { ACC } from '../physics/md.js';

const lw = w => w * Math.min(devicePixelRatio, 2);
const LJ = (r, s, e) => { const q = (s / r) ** 6; return 4 * e * q * (q - 1); };
const dLJ = (r, s, e) => { const q = (s / r) ** 6; return -24 * e * q * (2 * q - 1) / r; };
// Reference Ar₂ curve: a 14-6 form through the accepted well (3.757 Å, 0.2846 kcal/mol).
const QM = r => { const n = 14, x = 3.757 / r, e = 0.2846; return e * (6 / (n - 6) * x ** n - n / (n - 6) * x ** 6); };
const RMIN = 2 ** (1 / 6);
const BEST = 0.009;           // the lowest error any 12-6 curve can reach here


export class Dimer extends Plate {
  enter() {
    const root = this.root;
    const X = this.X = r => -4.3 + r * 0.86, Y = this.Y = u => 0.15 + Math.max(-0.5, Math.min(u, 0.28)) * 6;
    this.sigma = 3.0; this.eps = 0.5;
    this.r = 4.2; this.v = 0; this.held = false; this.handle = false;
    this.atoms = new Atoms(2, { detail: 6 });
    this.atoms.setColor(0, INK.Ar); this.atoms.setColor(1, INK.Ar, 0.05); this.atoms.flush(true);
    this.curve = new Curve({ color: INK.gold, width: lw(3) });
    this.pts = [];
    for (let r = 3.2; r < 8.6; r += r < 4.6 ? 0.13 : 0.45) if (QM(r) < 0.28) this.pts.push(r);
    this.dots = new Dots(this.pts.length, 0.055);
    this.pts.forEach((r, i) => this.dots.place(i, X(r), Y(QM(r)), 0));
    this.dots.flush();
    this.knob = new Atoms(2, { detail: 4 });
    this.knob.setColor(0, INK.gold, 1); this.knob.setColor(1, INK.gold, 0.6); this.knob.flush(true);
    root.add(this.curve, this.dots, this.atoms, this.knob);
    root.add(axisLine([[X(2.7), Y(0), 0], [X(9.2), Y(0), 0]]));
    this.stage.frame(5.45, [-0.35, 0.75, 0]);
    this.ui.note('No bond here: a weak pull from afar, a hard wall up close. <b>Drag the gold point into the well.</b>');
    this.rS = this.ui.ruler({ label: 'Size σ', unit: 'Å', min: 2.6, max: 4.2, step: 0.001, value: this.sigma, digits: 3, major: 0.2, span: 3, onInput: v => { this.sigma = v; this.draw(); } });
    this.rE = this.ui.ruler({ label: 'Depth ε', unit: 'kcal/mol', min: 0.05, max: 0.7, step: 0.001, value: this.eps, digits: 3, major: 0.05, span: 3, onInput: v => { this.eps = v; this.draw(); } });
    this.rd = this.ui.readout('error');
    this.ui.sender(t => this.send(t));
    this.ui.tag('your well', () => [X(this.sigma * RMIN) + 1.7, Y(-this.eps) - 0.25, 0]).el.classList.add('gold');
    this.draw();
  }
  draw() {
    const { X, Y } = this;
    this.curve.setFrom(t => { const r = 2.8 + t * 6.4; return [X(r), Y(LJ(r, this.sigma, this.eps)), 0.02]; });
    let s = 0;
    for (const r of this.pts) s += (LJ(r, this.sigma, this.eps) - QM(r)) ** 2;
    this.rmse = Math.sqrt(s / this.pts.length);
  }
  update(dt) {
    const { X, Y } = this;
    if (!this.held) {
      for (let i = 0; i < 8; i++) {
        const a = -dLJ(this.r, this.sigma, this.eps) * ACC / 19.97;
        this.v += a * 8; this.r += this.v * 8; this.v *= 0.9995;
        if (this.r > 11) { this.r = 11; this.v = -Math.abs(this.v); }
      }
      if (this.r < 2.5) { this.r = 2.5; this.v = Math.abs(this.v); }
      if (this.lastV < 0 && this.v > 0 && Math.abs(this.lastV) > 2e-4) this.sound.pluck(82, Math.min(0.7, Math.abs(this.lastV) * 500), 1.4);
      this.lastV = this.v;
    }
    const yA = 2.7;
    this.atoms.setAtom(0, X(0), yA, 0, 0.82);
    this.atoms.setAtom(1, X(this.r), yA, 0, 0.82);
    this.atoms.flush();
    const rm = this.sigma * RMIN;
    this.knob.setAtom(0, X(rm), Y(-this.eps), 0.05, 0.15);
    this.knob.setAtom(1, X(this.r), Y(LJ(this.r, this.sigma, this.eps)), 0.05, 0.08);
    this.knob.flush();
    this.rd.set(`${this.rmse.toFixed(3)} kcal/mol`);
    const e = this.rmse;
    this.ui.setTier(e <= BEST * 1.35 ? 3 : e <= BEST * 2.8 ? 2 : e <= 0.07 ? 1 : 0);
  }
  down(x, y) {
    if (this.near(x, y, [this.X(this.sigma * RMIN), this.Y(-this.eps), 0], 56)) { this.handle = true; return true; }
    if (this.near(x, y, [this.X(this.r), 2.7, 0], 80)) { this.held = true; this.v = 0; return true; }
    return false;
  }
  move(x, y) {
    if (!this.handle && !this.held) return;
    const p = this.stage.pointerToWorld(x, y, new THREE.Vector3(), new THREE.Vector3());
    if (this.handle) {
      const rm = (p.x + 4.3) / 0.86;
      this.sigma = THREE.MathUtils.clamp(rm / RMIN, 2.6, 4.2);
      this.eps = THREE.MathUtils.clamp(-(p.y - 0.15) / 6, 0.05, 0.5);
      this.rS.set(this.sigma); this.rE.set(this.eps);
      this.draw();
    } else this.r = THREE.MathUtils.clamp((p.x + 4.3) / 0.86, 2.9, 9);
  }
  up() { this.handle = false; this.held = false; }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'That is a well. Whose, I could not say.', 2: 'Close, near the bottom at least.', 3: 'A clean fit to the dimer. Hold on to that thought.' }[tier],
      lesson: 'The attraction falls as <i>r</i>⁻⁶ for physical reasons. The wall <i>r</i>⁻¹² is just a convenience, the square of <i>r</i>⁻⁶, cheap for computers in the 1970s and still with us. This well is hundreds of times shallower than a covalent bond, and there are millions of them.',
      apply: ff => { ff.sigmaDimer = this.sigma; ff.epsDimer = this.eps; },
    });
  }
  solve() { this.sigma = 3.38; this.eps = 0.277; this.rS.set(this.sigma); this.rE.set(this.eps); this.draw(); }
}

const TARGET = { rho: 1.40, dH: 1.56 };
const N_AR = 600;

export class Drop extends Plate {
  enter() {
    const r = this.root;
    this.d = new ArgonDrop(N_AR);
    this.d.sigma = save.ff.sigmaDimer ?? REF.sigmaDimer;
    this.d.eps = save.ff.epsDimer ?? REF.epsDimer;
    this.atoms = new Atoms(N_AR, { detail: 3 });
    r.add(this.atoms);
    this.stage.frame(23);
    this.ui.note('Your dimer numbers, on 600 atoms at 87 K, miss the white cross. <b>Slide σ and ε until they hit it.</b> You can poke the drop, too.');
    this.sight = this.ui.custom(this.sightSvg());
    this.rS = this.ui.ruler({ label: 'Size σ', unit: 'Å', min: 2.8, max: 4.0, step: 0.002, value: this.d.sigma, digits: 3, major: 0.1, span: 3.2, onInput: v => { this.d.sigma = v; } });
    this.rE = this.ui.ruler({ label: 'Depth ε', unit: 'kcal/mol', min: 0.08, max: 0.5, step: 0.001, value: this.d.eps, digits: 3, major: 0.05, span: 3.2, onInput: v => { this.d.eps = v; } });
    this.rdR = this.ui.readout('density'); this.rdH = this.ui.readout('heat of vaporization');
    this.ui.sender(t => this.send(t));
    this.avg = null;
    this.sound.startWash();
    this.c1 = new THREE.Color(); this.warm = 0;
    this.spin = 0;
  }
  sightSvg() {
    const W = 300, H = 150;
    let g = '';
    for (const [dx, dy] of [[0.15, 0.22], [0.09, 0.12], [0.05, 0.06]]) {
      const a = this.sx(TARGET.rho - dx), b = this.sx(TARGET.rho + dx), c = this.sy(TARGET.dH + dy), d = this.sy(TARGET.dH - dy);
      g += `<rect x="${a}" y="${c}" width="${b - a}" height="${d - c}" fill="none" stroke="rgba(234,243,244,.3)"/>`;
    }
    const cx = this.sx(TARGET.rho), cy = this.sy(TARGET.dH);
    return `<svg class="sight" viewBox="0 0 ${W} ${H}" aria-hidden="true"><text x="296" y="146" text-anchor="end" fill="rgba(234,243,244,.66)" font-size="12" font-style="italic" font-family="Old Standard TT">denser</text><text x="4" y="12" fill="rgba(234,243,244,.66)" font-size="12" font-style="italic" font-family="Old Standard TT">stickier</text>${g}
      <path d="M${cx - 10} ${cy}h20M${cx} ${cy - 10}v20" stroke="#eaf3f4" stroke-width="1.4"/>
      <polyline id="trail" fill="none" stroke="rgba(240,187,69,.45)"/><circle id="dot" r="5" fill="#f0bb45"/></svg>`;
  }
  sx(v) { return Math.max(5, Math.min(295, 150 + (v - TARGET.rho) * 860)); }
  sy(v) { return Math.max(5, Math.min(145, 75 - (v - TARGET.dH) * 280)); }
  update(dt, t) {
    const d = this.d;
    this.budget(3.5, 8, () => d.step(10, 87));
    const c = this.stage.view.target;
    this.stage.autoYaw += dt * 0.05;
    const m = d.measure();
    const k = 1 - Math.exp(-dt / 2.6);
    if (!this.avg) this.avg = { ...m }; else {
      this.avg.density += (m.density - this.avg.density) * k;
      this.avg.dHvap += (m.dHvap - this.avg.dHvap) * k;
      this.avg.liquidFraction += (m.liquidFraction - this.avg.liquidFraction) * k;
    }
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
    const A = this.avg;
    const dot = document.getElementById('dot');
    if (dot) {
      const px = this.sx(A.density), py = this.sy(A.dHvap);
      dot.setAttribute('cx', px); dot.setAttribute('cy', py);
      this.trail ??= [];
      if ((this.frame = (this.frame | 0) + 1) % 12 === 0) {
        this.trail.push(`${px.toFixed(1)},${py.toFixed(1)}`);
        if (this.trail.length > 28) this.trail.shift();
        document.getElementById('trail')?.setAttribute('points', this.trail.join(' '));
      }
    }
    this.rdR.set(`${A.density.toFixed(2)} <span class="ref">/ ${TARGET.rho.toFixed(2)}</span> <small>g/cm³</small>`);
    this.rdH.set(`${A.dHvap.toFixed(2)} <span class="ref">/ ${TARGET.dH.toFixed(2)}</span> <small>kcal/mol</small>`);
    const dx = Math.abs(A.density - TARGET.rho), dy = Math.abs(A.dHvap - TARGET.dH);
    const tier = dx <= 0.05 && dy <= 0.06 ? 3 : dx <= 0.09 && dy <= 0.12 ? 2 : dx <= 0.15 && dy <= 0.22 ? 1 : 0;
    this.ui.setTier(this.warm > 3 ? tier : 0);
    this.warm += dt;
    this.sound.setWash(0.6 + (1 - A.liquidFraction) * 1.6, 1500 + (1 - A.liquidFraction) * 3000);
    if (A.liquidFraction < 0.45 && !this.saidGas) { this.saidGas = true; this.ui.note('Too weak: your liquid is boiling away. Raise ε.'); }
    if (tier === 3 && !this.saidOk) { this.saidOk = true; this.ui.note('On the cross. Notice you are not on your dimer numbers any more.'); }
  }
  down(x, y) {
    if (y > this.stage.height - this.stage.insets.bottom) return false;
    this.stir(x, y);
    return true;
  }
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
      comment: { 1: 'It is a liquid, of a sort. Not this one.', 2: 'Close to argon. I would not stake a Nature paper on it.', 3: 'Density and heat of vaporization both hit. That is how OPLS was built.' }[tier],
      lesson: `Your dimer numbers made a drop that was too dense and too sticky. Your liquid numbers (σ = ${s.toFixed(3)}, ε = ${e.toFixed(3)}; published 3.405, 0.238) no longer fit the dimer. In a liquid the third, fourth and fifth neighbours all change each pair’s attraction, so a pair term must quietly carry their effect. Force fields are fitted to liquids for this reason.`,
      apply: ff => { ff.sigma = s; ff.eps = e; },
    });
  }
  solve() { this.d.sigma = 3.405; this.d.eps = 0.238; this.rS.set(3.405); this.rE.set(0.238); this.warm = 4; }
  exit() { this.sound.stopWash(); }
}
