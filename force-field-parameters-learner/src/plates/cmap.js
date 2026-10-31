// Part two: CMAP. First a proof that torsions cannot do it, then a map painted by hand and by Boltzmann inversion.
import { Plate } from './base.js';
import { save } from '../save.js';
import { INKS, ramp, diverge } from '../panel.js';
import { GRID, STEP, FINE, BASINS, AL, KT, surface, fit1D, rms, cross, upsample, boltzmann, overlap, basinPop, jCoupling, ibiStep, brush, targetStats, targetPeptide } from '../physics/cmap.js';

const H_LIST = [1, 2, 3, 4, 5, 6];

// A square map with φ across and ψ up. Shared by both plates.
function mapBox(rect) {
  const pad = 26, s = Math.min(rect.w - pad - 4, rect.h - pad - 4);
  return { x: rect.x + (rect.w - s + pad) / 2, y: rect.y + 2, w: s, h: s };
}
function frame(p, b) {
  const c = p.ctx;
  c.strokeStyle = INKS.dim; c.lineWidth = 1; c.strokeRect(b.x, b.y, b.w, b.h);
  p.text('φ', b.x + b.w / 2, b.y + b.h + 12, { align: 'center', color: INKS.dim });
  p.text('ψ', b.x - 14, b.y + b.h / 2, { align: 'center', color: INKS.dim });
  p.text('−180°', b.x, b.y + b.h + 12, { color: INKS.dim, size: 11 });
  p.text('180°', b.x + b.w, b.y + b.h + 12, { color: INKS.dim, size: 11, align: 'right' });
}
const toPhi = (b, x) => (x - b.x) / b.w * 360 - 180;
const toPsi = (b, y) => 180 - (y - b.y) / b.h * 360;
const fromPhi = (b, v) => b.x + (v + 180) / 360 * b.w;
const fromPsi = (b, v) => b.y + (180 - v) / 360 * b.h;

export class Cross extends Plate {
  enter() {
    this.usePanel();
    this.U = surface('stats');
    this.on = new Set();
    this.view = 'residual';
    this.rect = null;
    this.bestCross = 0;
    this.ui.note('This is a synthetic φ/ψ free-energy map. <b>Switch on harmonics until torsions can do no more.</b>');
    this.ui.goals(['Switch on enough harmonics: error under 0.80 kcal/mol.', 'Switch on all six and watch the error stall.', 'Drag a rectangle whose corners do not cancel, by 5 kcal/mol or more.']);
    this.L = this.ui.lights([['e', 'best 1-D error'], ['t', 'target corners'], ['y', 'torsion corners']]);
    this.hb = H_LIST.map(n => this.ui.button(`<i>n</i>=${n}`, () => this.toggle(n)));
    document.getElementById('actions').classList.add('acts-mini');
    this.vb = this.ui.button('Show: what is left', () => this.flip());
    this.vb.style.flexBasis = '40%';
    this.ui.sender(t => this.send(t));
    this.compute();
  }
  exit() { document.getElementById('actions').classList.remove('acts-mini'); }
  toggle(n) {
    if (this.on.has(n)) this.on.delete(n); else this.on.add(n);
    this.hb[n - 1].classList.toggle('on', this.on.has(n));
    this.sound.tick(1 + n * 0.1);
    this.compute();
  }
  flip() {
    this.view = this.view === 'residual' ? 'target' : 'residual';
    this.vb.textContent = this.view === 'residual' ? 'Show: what is left' : 'Show: the target';
    this.redraw();
  }
  compute() {
    const on = [...this.on].sort();
    this.F = fit1D(this.U, on);
    this.R = this.U.map((v, q) => v - this.F[q]);
    this.err = rms(this.U, this.F);
    this.L.e.set(`${this.err.toFixed(2)} kcal/mol`, this.err <= 0.76 ? 1 : 0);
    this.score();
    this.redraw();
  }
  score() {
    let ct = 0, cf = 0;
    if (this.rect) { const [a, b, c, d] = this.rect; ct = cross(this.U, a, b, c, d); cf = cross(this.F, a, b, c, d); }
    this.L.t.set(`${Math.abs(ct).toFixed(1)} kcal/mol`, Math.abs(ct) >= 5 ? 2 : Math.abs(ct) >= 2.5 ? 1 : 0);
    this.L.y.set(`${Math.abs(cf).toFixed(1)} kcal/mol`, this.rect ? 2 : 0);
    this.bestCross = Math.max(this.bestCross, Math.abs(ct));
    const all = this.on.size === 6;
    const tier = all && Math.abs(ct) >= 5 ? 3 : all ? 2 : this.err <= 0.8 ? 1 : 0;
    this.ui.setTier(tier);
    if (all && !this.said) { this.said = true; this.ui.note('It stalled. <b>Drag a rectangle: any f(φ) + g(ψ) cancels on the corners. Try two corners on wells, two on hills.</b>'); }
    if (tier === 3 && !this.said2) { this.said2 = true; this.ui.note('No sum of torsions can reach this. <b>Real nonbonded terms supply some coupling; CMAP corrects what remains.</b>'); }
  }
  arrange(F) { this.fill(F); }
  redraw() {
    const p = this.panel, c = p.begin();
    if (!p.rect.w) return;
    const b = this.box = mapBox(p.rect);
    if (this.view === 'residual') p.heat(this.R, GRID, GRID, b, v => diverge(v / 3));
    else p.heat(this.U, GRID, GRID, b, v => ramp(1 - v / 7));
    frame(p, b);
    if (this.rect) {
      const [i0, j0, i1, j1] = this.rect, g = (i, j) => [b.x + (i + 0.5) / GRID * b.w, b.y + b.h - (j + 0.5) / GRID * b.h];
      const [ax, ay] = g(i0, j0), [cx, cy] = g(i1, j1);
      c.strokeStyle = INKS.gold; c.lineWidth = 1.6; c.strokeRect(Math.min(ax, cx), Math.min(ay, cy), Math.abs(cx - ax), Math.abs(cy - ay));
      p.dots([[ax, ay], [cx, cy]], { color: INKS.gold, r: 4.5 });
      p.dots([[ax, cy], [cx, ay]], { color: INKS.white, r: 4.5 });
    }
  }
  cell(x, y) {
    const b = this.box;
    if (!b || x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return null;
    return [Math.min(GRID - 1, (x - b.x) / b.w * GRID | 0), Math.min(GRID - 1, (b.y + b.h - y) / b.h * GRID | 0)];
  }
  down(x, y) {
    const c = this.cell(x, y);
    if (!c) return false;
    this.rect = [c[0], c[1], c[0], c[1]]; this.drag = true;
    this.score(); this.redraw();
    return true;
  }
  move(x, y) {
    if (!this.drag) return;
    const c = this.cell(x, y);
    if (!c) return;
    this.rect[2] = c[0]; this.rect[3] = c[1];
    this.score(); this.redraw();
  }
  up() { this.drag = false; }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'Better. Now add the other stops and tell me why it stops improving.', 2: 'It stalled. Good. Why?', 3: `${this.bestCross.toFixed(1)} kcal/mol on four corners that any torsion sum must cancel.` }[tier],
      lesson: 'This is a synthetic free-energy map. For any f(φ) + g(ψ), the corners of a rectangle cancel exactly, because no term knows about both angles. No sum of torsions can reach this. In a real force field the nonbonded terms supply some coupling, and CMAP (MacKerell, Feig & Brooks, 2004) corrects what remains. It is not universal: ff99SB and ff14SB have no CMAP, and fit their torsions with coupling left to the nonbonded terms.',
    });
  }
  solve(level) {
    H_LIST.forEach(n => { if (!this.on.has(n)) { this.on.add(n); this.hb[n - 1].classList.add('on'); } });
    this.compute();
    if (level === 3) { this.rect = this.bestRect(); this.score(); this.redraw(); }
  }
  bestRect() {
    let best = [0], U = this.U;
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) for (let k = i + 1; k < GRID; k++) for (let l = j + 1; l < GRID; l++) {
      const c = Math.abs(cross(U, i, j, k, l));
      if (c > best[0]) best = [c, i, j, k, l];
    }
    return best.slice(1);
  }
}

const OV_T = 0.96, AL_T = 0.03, J_TOL = 0.25, PEP_T = 0.94;

export class Paint extends Plate {
  enter() {
    this.usePanel();
    this.stats = targetStats(); this.pep = targetPeptide();
    this.jPep = jCoupling(this.pep);
    this.base = fit1D(surface('stats'), [1, 2, 3]);
    this.C = new Float64Array(GRID * GRID);
    this.G = new Float64Array(GRID * GRID); this.Uf = new Float64Array(FINE * FINE); this.P = new Float64Array(FINE * FINE);
    this.mode = -1;
    this.show = 'stats';
    this.ui.note('Your populations, exact (bicubic on a 24×24 grid). Rings: a synthetic folded-protein survey. <b>Paint to match it.</b>');
    this.ui.goals(['By hand: overlap with the survey above 0.85.', `Press the Boltzmann button: overlap above ${OV_T}.`, 'Keep that, and turn the disordered peptide green too.']);
    this.L = this.ui.lights([['o', 'survey fit'], ['p', 'peptide fit'], ['a', 'left helix'], ['j', 'peptide ³J']]);
    this.bLow = this.ui.button('Deepen', () => this.tool(-1), 'on');
    this.bHigh = this.ui.button('Raise', () => this.tool(1));
    this.bIbi = this.ui.button('One Boltzmann iteration', () => this.iterate());
    this.bIbi.disabled = true; this.bIbi.style.opacity = 0.45;
    this.ui.sender(t => this.send(t));
    this.compute();
  }
  tool(m) { this.mode = m; this.bLow.classList.toggle('on', m < 0); this.bHigh.classList.toggle('on', m > 0); }
  iterate() {
    if (this.bIbi.disabled) return;
    ibiStep(this.C, this.P, this.stats, 0.7);
    this.iters = (this.iters ?? 0) + 1;
    this.sound.ping(this.iters, 0.1);
    this.compute();
  }
  compute() {
    const { G, base, C, Uf, P } = this;
    for (let q = 0; q < G.length; q++) G[q] = base[q] + C[q];
    upsample(G, Uf); boltzmann(Uf, P);
    this.ov = overlap(P, this.stats); this.ovp = overlap(P, this.pep);
    this.al = basinPop(P, BASINS[AL]); this.J = jCoupling(P);
    const { ov, ovp, al, J } = this, dj = Math.abs(J - this.jPep);
    this.L.o.set(ov.toFixed(3), ov >= OV_T ? 2 : ov >= 0.85 ? 1 : 0);
    this.L.p.set(ovp.toFixed(3), ovp >= PEP_T ? 2 : ovp >= 0.9 ? 1 : 0);
    this.L.a.set(`${(al * 100).toFixed(1)}% <span class="ref">/ &lt;3</span>`, al <= AL_T ? 2 : al <= 0.05 ? 1 : 0);
    this.L.j.set(`${J.toFixed(2)} <span class="ref">/ ${this.jPep.toFixed(2)} Hz</span>`, dj <= J_TOL ? 2 : dj <= 0.4 ? 1 : 0);
    const third = ov >= OV_T && ovp >= PEP_T && al <= AL_T && dj <= J_TOL;
    const tier = third ? 3 : ov >= OV_T ? 2 : ov >= 0.85 ? 1 : 0;
    this.ui.setTier(tier);
    if (tier >= 1 && this.bIbi.disabled) {
      this.bIbi.disabled = false; this.bIbi.style.opacity = 1;
      this.ui.note('Unlocked: ΔU = −<i>kT</i> ln(<i>P</i><sub>target</sub>/<i>P</i><sub>yours</sub>). <b>Press it a few times.</b>');
    }
    if (ov >= OV_T && al > 0.05 && !this.said) {
      this.said = true;
      this.ui.note('Perfect on the survey, and the peptide went left-handed. <b>Raise a hill on the left helix, and only there.</b>');
    }
    this.redraw();
  }
  arrange(F) { this.fill(F); }
  redraw() {
    const p = this.panel, c = p.begin();
    if (!p.rect.w) return;
    const b = this.box = mapBox(p.rect);
    let m = 0;
    for (let q = 0; q < this.P.length; q++) m = Math.max(m, this.P[q]);
    p.heat(this.P, FINE, FINE, b, v => ramp(Math.sqrt(v / m)));
    frame(p, b);
    c.save(); c.setLineDash([3, 3]);
    for (const k of BASINS) {
      const x = fromPhi(b, k.phi), y = fromPsi(b, k.psi), w = 2.3 * k.sp / 360 * b.w, h = 2.3 * k.ss / 360 * b.h;
      c.strokeStyle = INKS.dim; c.lineWidth = 1;
      c.beginPath(); c.ellipse(x, y, w, h, 0, 0, 6.2832); c.stroke();
      const left = k.name === 'β strand';
      p.text(`${k.name} ${(k.stats * 100).toFixed(0)}%`, left ? x : x + w * 0.75, left ? y + h + 8 : y - h + (k.name === 'PPII' ? 16 : 0), { size: 11, align: left ? 'center' : 'left' });
    }
    c.restore();
    if (this.touch) { c.strokeStyle = this.mode < 0 ? INKS.aqua : INKS.red; c.lineWidth = 1.5; c.beginPath(); c.arc(this.touch[0], this.touch[1], 26 / 360 * b.w, 0, 6.2832); c.stroke(); }
  }
  paintAt(x, y) {
    const b = this.box;
    if (!b || x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return false;
    this.touch = [x, y]; this.last = [toPhi(b, x), toPsi(b, y)];
    return true;
  }
  stroke(dt) {
    if (!this.last) return;
    brush(this.C, this.last[0], this.last[1], this.mode * dt * 1.6);
    this.compute();
    if (Math.random() < 0.15) this.sound.tick(this.mode < 0 ? 0.7 : 1.2);
  }
  down(x, y) { return this.paintAt(x, y); }
  move(x, y) { if (this.last) this.paintAt(x, y); }
  up() { this.last = null; this.touch = null; this.redraw(); }
  update(dt) { this.stroke(dt); }
  send(tier) {
    this.game.finish(this, tier, {
      comment: { 1: 'Painted by hand. Honest work, slow work.', 2: 'You matched one target. A map has to work for more than the data that made it.', 3: 'Both ensembles sit in tolerance, and neither is perfect. That is what a map costs.' }[tier],
      lesson: 'One map, two ensembles: fitting one exactly can leave the other wrong, so a real map needs a second test. The real αL story has a different cause. CHARMM36 kept an old αL correction after its van der Waals radii changed. In an RS peptide, 80% of conformations contained a left-handed helix (41% per residue). CHARMM36m cut that to 1.8% (5.5% per residue) with a change confined to that region of the map, using a coil-library target, and paired it with stronger water hydrogens for disordered chains (Huang et al. 2017). The survey and peptide here are synthetic; the Karplus curve is real (Vuister & Bax 1993).',
      apply: ff => { ff.cmapDone = true; },
    });
  }
  // Scripted play.
  solve(level) {
    if (level >= 2) for (let k = 0; k < 4; k++) { ibiStep(this.C, this.P, this.stats, 0.7); this.compute(); }
    if (level >= 3) {
      brush(this.C, 57, 42, 1.2); this.compute();
      brush(this.C, -70, 145, -0.35); this.compute();
      brush(this.C, -63, -43, 0.3); this.compute();
    }
  }
}
